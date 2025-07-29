/**
 * Authentication Service for OTC Admin System
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, AuditDAO, SessionDAO } from './database.js';
import { LoginCredentials, AdminSession, UnauthorizedError } from '../types/otc/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '24h';
const SESSION_EXPIRES_HOURS = 24;

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
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
      // Find admin by email
      const admin = await this.findAdminByEmail(credentials.email);
      if (!admin) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        credentials.password,
        admin.password_hash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid credentials');
      }

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

      // Generate JWT token
      const jwtToken = jwt.sign(
        {
          adminId: admin.id,
          email: admin.email,
          sessionToken,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Create session object
      const session: AdminSession = {
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
      // Decode JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      if (!decoded.sessionToken || !decoded.adminId) {
        throw new UnauthorizedError('Invalid token format');
      }

      // Check session in database
      const session = await SessionDAO.findByToken(decoded.sessionToken);
      if (!session) {
        throw new UnauthorizedError('Session not found or expired');
      }

      return session;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      throw error;
    }
  }

  /**
   * Logout admin user
   */
  static async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      if (decoded.sessionToken) {
        // Delete session from database
        const deleted = await SessionDAO.delete(decoded.sessionToken);
        
        // Log logout
        if (decoded.adminId) {
          await AuditDAO.logAction(
            decoded.adminId,
            'ADMIN_LOGOUT',
            'authentication',
            decoded.adminId,
            { success: true }
          );
        }
        
        return deleted;
      }
      
      return false;
    } catch (error) {
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

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const result = await query(`
      UPDATE admins 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [newPasswordHash, adminId]);

    if (result.rowCount > 0) {
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

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

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
  static async validateToken(req: any, res: any, next: any): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      
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
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Authentication failed'
      });
    }
  }

  /**
   * Socket.IO middleware to validate JWT token
   */
  static async validateSocketToken(socket: any, next: any): Promise<void> {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        throw new UnauthorizedError('No token provided');
      }

      const session = await AuthenticationService.validateSession(token);
      socket.adminSession = session;
      next();
    } catch (error) {
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

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!password.match(/[A-Z]/)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!password.match(/[a-z]/)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!password.match(/[0-9]/)) {
      errors.push('Password must contain at least one number');
    }

    if (!password.match(/[^A-Za-z0-9]/)) {
      errors.push('Password must contain at least one special character');
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