/**
 * Authentication Service for OTC Admin System
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, AuditDAO, SessionDAO } from './database.js';
import { LoginCredentials, AdminSession, UnauthorizedError } from '../types/otc/index.js';

// セキュリティ設定の強化
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET環境変数が設定されていないか、32文字未満です');
}
const JWT_EXPIRES_IN = '1h'; // セッション時間を短縮
const SESSION_EXPIRES_HOURS = 1;
const BCRYPT_ROUNDS = 12; // bcryptのラウンド数を増加


export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown;
}

export interface AuthenticationResult {
  session: AdminSession;
  token: string;
  expiresAt: Date;
}

/**
 * Main Authentication Service
 */
export class AuthenticationService {
  /**
   * Authenticate admin user
   */
  static async authenticateAdmin(
    credentials: LoginCredentials
  ): Promise<AuthenticationResult> {
    try {
      // 入力値の検証とサニタイゼーション
      if (!this.isValidEmail(credentials.email) || 
          !this.isValidPassword(credentials.password)) {
        throw new UnauthorizedError('無効な認証情報の形式です');
      }

      // レート制限チェック
      await this.checkRateLimit(credentials.email, credentials.ipAddress);

      // Find admin by email
      const admin = await this.findAdminByEmail(credentials.email);
      if (!admin) {
        // タイミング攻撃対策
        await bcrypt.hash('dummy-password', BCRYPT_ROUNDS);
        throw new UnauthorizedError('認証情報が無効です');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        credentials.password,
        admin.password_hash
      );

      if (!isPasswordValid) {
        await this.recordFailedAttempt(credentials.email, credentials.ipAddress);
        throw new UnauthorizedError('認証情報が無効です');
      }

      // ログイン成功時の試行回数リセット
      await this.resetFailedAttempts(credentials.email, credentials.ipAddress);

      // Generate session token and JWT
      const sessionToken = uuidv4();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRES_HOURS);

      // Create session record
      await SessionDAO.create(
        admin.id,
        sessionToken,
        expiresAt,
        credentials.ipAddress,
        credentials.userAgent
      );

      // セキュアなJWTトークン生成
      const jwtToken = jwt.sign(
        {
          adminId: admin.id,
          email: admin.email,
          sessionToken,
          iat: Math.floor(Date.now() / 1000),
          jti: uuidv4(), // JWT ID for revocation
        },
        JWT_SECRET!,
        { 
          expiresIn: JWT_EXPIRES_IN,
          algorithm: 'HS256',
          issuer: 'otc-system',
          audience: 'otc-admin'
        }
      );

      // Create session object
      const session: AdminSession = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        adminId: admin.id,
        email: admin.email,
        loginTime: new Date(),
        ipAddress: credentials.ipAddress,
        userAgent: credentials.userAgent,
      };

      // Log successful authentication
      await AuditDAO.logAction(
        admin.id,
        'ADMIN_LOGIN',
        'authentication',
        admin.id,
        { success: true },
        credentials.ipAddress,
        credentials.userAgent
      );

      return {
        session,
        token: jwtToken,
        expiresAt,
      };
    } catch (error) {
      // Log failed authentication attempt
      if (credentials.email) {
        await AuditDAO.logAction(
          '', // no admin ID for failed attempts
          'ADMIN_LOGIN_FAILED',
          'authentication',
          undefined,
          { 
            email: credentials.email,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          credentials.ipAddress,
          credentials.userAgent
        );
      }
      throw error;
    }
  }

  /**
   * Validate JWT token and session
   */
  static async validateSession(token: string): Promise<AdminSession> {
    try {
      // トークンの基本検証
      if (!token || typeof token !== 'string' || token.length > 1000) {
        throw new UnauthorizedError('無効なトークン形式です');
      }

      // JWT検証オプション強化
      const decoded = jwt.verify(token, JWT_SECRET!, {
        algorithms: ['HS256'],
        issuer: 'otc-system',
        audience: 'otc-admin',
        clockTolerance: 5 // 5秒のクロック許容
      }) as Record<string, unknown>;
      
      if (!decoded.sessionToken || !decoded.adminId || !decoded.jti) {
        throw new UnauthorizedError('無効なトークン形式です');
      }

      // JTIブラックリストチェック
      if (await this.isJtiBlacklisted(decoded.jti as string)) {
        throw new UnauthorizedError('無効化されたトークンです');
      }

      // Check session in database
      const session = await SessionDAO.findByToken(decoded.sessionToken as string);
      if (!session) {
        throw new UnauthorizedError('セッションが見つからないか期限切れです');
      }

      // セッション有効性の追加チェック
      if (!session.expiresAt || new Date(session.expiresAt) <= new Date()) {
        await SessionDAO.delete(decoded.sessionToken as string);
        throw new UnauthorizedError('セッションが期限切れです');
      }

      return session;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('無効なトークンです');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('トークンが期限切れです');
      }
      throw error;
    }
  }

  /**
   * Logout admin user
   */
  static async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET!) as Record<string, unknown>;
      
      if (decoded.sessionToken) {
        // Delete session from database
        const deleted = await SessionDAO.delete(decoded.sessionToken as string);
        
        // Log logout
        if (decoded.adminId) {
          await AuditDAO.logAction(
            decoded.adminId as string,
            'ADMIN_LOGOUT',
            'authentication',
            decoded.adminId as string,
            { success: true }
          );
        }
        
        return deleted;
      }
      
      return false;
    } catch {
      // Even if token is invalid, we consider logout successful
      return true;
    }
  }

  /**
   * Change admin password
   */
  static async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    // Find admin
    const admin = await this.findAdminById(adminId);
    if (!admin) {
      throw new UnauthorizedError('Admin not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password_hash
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // パスワード強度チェック
    const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(`パスワードが要件を満たしていません: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash new password with increased rounds
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password in database
    const result = await query(`
      UPDATE admins 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [newPasswordHash, adminId]);

    if (result.rowCount && result.rowCount > 0) {
      // Log password change
      await AuditDAO.logAction(
        adminId,
        'PASSWORD_CHANGED',
        'admin',
        adminId,
        { success: true }
      );
      
      return true;
    }

    return false;
  }

  /**
   * Create new admin user (for initial setup)
   */
  static async createAdmin(
    email: string,
    password: string,
    createdBy?: string
  ): Promise<Admin> {
    // Check if admin already exists
    const existingAdmin = await this.findAdminByEmail(email);
    if (existingAdmin) {
      throw new Error('Admin with this email already exists');
    }

    // パスワード強度チェック
    const passwordValidation = PasswordUtils.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new Error(`パスワードが要件を満たしていません: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password with increased rounds
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create admin
    const result = await query<Admin>(`
      INSERT INTO admins (email, password_hash)
      VALUES ($1, $2)
      RETURNING *
    `, [email, passwordHash]);

    const newAdmin = result.rows[0];

    // Log admin creation
    await AuditDAO.logAction(
      createdBy || newAdmin.id,
      'ADMIN_CREATED',
      'admin',
      newAdmin.id,
      { email: newAdmin.email }
    );

    return newAdmin;
  }

  /**
   * Clean expired sessions
   */
  static async cleanExpiredSessions(): Promise<number> {
    const cleanedCount = await SessionDAO.cleanExpired();
    
    if (cleanedCount > 0) {
      await AuditDAO.logAction(
        'system',
        'SESSION_CLEANUP',
        'system',
        undefined,
        { cleanedSessions: cleanedCount }
      );
    }
    
    return cleanedCount;
  }

  /**
   * セキュリティヘルパーメソッド
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  private static isValidPassword(password: string): boolean {
    return typeof password === 'string' && password.length >= 8 && password.length <= 128;
  }

  private static async checkRateLimit(): Promise<void> {
    // レート制限の実装（実際の実装では外部キャッシュを使用）
    // 実装詳細は省略
    // key: `rate_limit_${_email}_${_ipAddress || 'unknown'}`
  }

  private static async recordFailedAttempt(email: string, ipAddress?: string): Promise<void> {
    // 失敗試行の記録
    await AuditDAO.logAction(
      '',
      'LOGIN_FAILED_ATTEMPT',
      'authentication',
      undefined,
      { email, ipAddress, timestamp: new Date() },
      ipAddress
    );
  }

  private static async resetFailedAttempts(): Promise<void> {
    // 成功時の試行回数リセット
    // 実装詳細は省略
    // key: `failed_attempts_${_email}_${_ipAddress || 'unknown'}`
  }

  private static async isJtiBlacklisted(): Promise<boolean> {
    // JTIブラックリストチェック（実際の実装では外部ストレージを使用）
    // 実装詳細は省略
    return false;
  }

  /**
   * Private helper methods
   */
  private static async findAdminByEmail(email: string): Promise<Admin | null> {
    const result = await query<Admin>(`
      SELECT * FROM admins WHERE email = $1
    `, [email]);

    return result.rows[0] || null;
  }

  private static async findAdminById(id: string): Promise<Admin | null> {
    const result = await query<Admin>(`
      SELECT * FROM admins WHERE id = $1
    `, [id]);

    return result.rows[0] || null;
  }
}

/**
 * Middleware for protecting admin routes
 */
export class AuthMiddleware {
  /**
   * Express/Fastify middleware to validate JWT token
   */
  static async validateToken(req: Record<string, unknown>, res: Record<string, unknown>, next: (error?: Error) => void): Promise<void> {
    try {
      const authHeader = (req.headers as Record<string, string>).authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('No token provided');
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const session = await AuthenticationService.validateSession(token);

      // Attach session to request
      req.adminSession = session;
      next();
    } catch (error) {
      const status = error instanceof UnauthorizedError ? 401 : 500;
      const responseObj = res as { status: (code: number) => { json: (obj: Record<string, unknown>) => void } };
      responseObj.status(status).json({
        error: error instanceof Error ? error.message : 'Authentication failed'
      });
    }
  }

  /**
   * Socket.IO middleware to validate JWT token
   */
  static async validateSocketToken(socket: Record<string, unknown>, next: (error?: Error) => void): Promise<void> {
    try {
      const handshake = socket.handshake as { auth: { token?: string } };
      const token = handshake.auth.token;
      
      if (!token) {
        throw new UnauthorizedError('No token provided');
      }

      const session = await AuthenticationService.validateSession(token);
      socket.adminSession = session;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  }
}

/**
 * Password utility functions
 */
export class PasswordUtils {
  /**
   * Generate secure password hash
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('パスワードは12文字以上である必要があります');
    }

    if (password.length > 128) {
      errors.push('パスワードは128文字以下である必要があります');
    }

    if (!password.match(/[A-Z]/)) {
      errors.push('パスワードには大文字を1文字以上含める必要があります');
    }

    if (!password.match(/[a-z]/)) {
      errors.push('パスワードには小文字を1文字以上含める必要があります');
    }

    if (!password.match(/[0-9]/)) {
      errors.push('パスワードには数字を1文字以上含める必要があります');
    }

    if (!password.match(/[^A-Za-z0-9]/)) {
      errors.push('パスワードには特殊文字を1文字以上含める必要があります');
    }

    // 一般的な脆弱なパスワードパターンをチェック
    const commonPatterns = [
      /123456/,
      /password/i,
      /admin/i,
      /qwerty/i
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('一般的なパスワードパターンは使用できません');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Auto-cleanup expired sessions every hour
if (typeof window === 'undefined') { // Only run on server
  setInterval(async () => {
    try {
      await AuthenticationService.cleanExpiredSessions();
    } catch (error) {
      console.error('Failed to clean expired sessions:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
}