/**
 * Admin Authentication Hook for OTC System
 */
import { useState, useCallback } from 'react';
import { LoginCredentials, AdminSession, UnauthorizedError } from '../types/otc/index';
import crypto from 'crypto';

// セキュアなトークンストレージキー
const TOKEN_STORAGE_KEY = 'otc_admin_token';
const SESSION_STORAGE_KEY = 'otc_admin_session';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15分

// Note: AuthProvider component should be implemented in a separate .tsx file

/**
 * 開発環境用簡易認証フック
 */
export const useAdminAuth = () => {
  const [session, setSession] = useState<AdminSession | null>(() => {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    return savedSession ? JSON.parse(savedSession) : null;
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      // レート制限チェック
      const attempts = getLoginAttempts(credentials.email);
      if (attempts.count >= MAX_LOGIN_ATTEMPTS && 
          Date.now() - attempts.lastAttempt < LOCKOUT_DURATION) {
        throw new Error(`アカウントがロックされています。${Math.ceil((LOCKOUT_DURATION - (Date.now() - attempts.lastAttempt)) / 60000)}分後に再試行してください`);
      }

      // 入力値検証とサニタイゼーション
      if (!isValidEmail(credentials.email) || !isValidPassword(credentials.password)) {
        recordLoginAttempt(credentials.email, false);
        throw new Error('認証情報の形式が無効です');
      }

      // セキュアな認証処理（実際の実装では外部認証サービスを使用）
      const hashedPassword = await hashPassword(credentials.password);
      const isValidUser = await validateCredentials(credentials.email, hashedPassword);
      
      if (!isValidUser) {
        recordLoginAttempt(credentials.email, false);
        throw new Error('認証情報が無効です');
      }

      // セッション作成
      const sessionId = generateSecureSessionId();
      const token = generateSecureToken();
      
      const mockSession: AdminSession = {
        id: sessionId,
        adminId: `admin-${Date.now()}`,
        email: credentials.email,
        name: 'Admin User',
        role: 'admin',
        permissions: ['read', 'write', 'admin'],
        loginTime: new Date(),
        ipAddress: credentials.ipAddress || 'unknown',
        userAgent: credentials.userAgent || 'unknown',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TIMEOUT).toISOString(),
        isActive: true,
      };
      
      // セキュアなセッション保存
      const encryptedSession = encryptSessionData(mockSession);
      sessionStorage.setItem(SESSION_STORAGE_KEY, encryptedSession);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      
      recordLoginAttempt(credentials.email, true);
      setSession(mockSession);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // セキュアなログアウト処理
    const token = authUtils.getToken();
    if (token) {
      // トークンを無効化リストに追加（実際の実装では外部サービス）
      addToTokenBlacklist(token);
    }
    
    // セッションデータを完全に削除
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    
    setSession(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<void> => {
    const currentSession = authUtils.getSession();
    if (!currentSession) return;
    
    // セッション有効期限チェック
    if (!currentSession.expiresAt || new Date(currentSession.expiresAt) <= new Date()) {
      await logout();
      throw new Error('セッションが期限切れです');
    }
    
    // セッション更新
    const updatedSession = {
      ...currentSession,
      expiresAt: new Date(Date.now() + SESSION_TIMEOUT).toISOString()
    };
    
    const encryptedSession = encryptSessionData(updatedSession);
    sessionStorage.setItem(SESSION_STORAGE_KEY, encryptedSession);
    setSession(updatedSession);
  }, [logout]);

  return {
    session,
    loading,
    error,
    login,
    logout,
    clearError,
    refreshSession,
  };
};

/**
 * セキュアな認証付きHTTPクライアント
 */
export const createAuthenticatedFetch = () => {
  return async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = authUtils.getToken();
    
    if (!token || isTokenBlacklisted(token)) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new UnauthorizedError('認証が必要です');
    }

    // URLバリデーション
    if (!isValidUrl(url)) {
      throw new Error('無効なURLです');
    }

    // CSRFトークン追加
    const csrfToken = generateCSRFToken();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new UnauthorizedError('認証が必要です');
    }

    return response;
  };
};

/**
 * Auth state checker for components
 * Note: withAdminAuth HOC should be implemented in a separate .tsx file
 */
export const getAuthState = () => {
  const token = authUtils.getToken();
  const session = authUtils.getSession();
  return {
    isAuthenticated: !!token,
    session
  };
};

// セキュリティヘルパー関数
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
};

const isValidPassword = (password: string): boolean => {
  return password.length >= 8 && password.length <= 128;
};

const hashPassword = async (password: string): Promise<string> => {
  // 実際の実装ではbcryptなどを使用
  return crypto.createHash('sha256').update(password + 'salt').digest('hex');
};

const validateCredentials = async (email: string, hashedPassword: string): Promise<boolean> => {
  // 実際の実装では外部認証サービスを使用
  return email === 'admin@otc.local' && hashedPassword === await hashPassword('admin123');
};

const generateSecureSessionId = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

const generateSecureToken = (): string => {
  return crypto.randomBytes(48).toString('base64url');
};

const generateCSRFToken = (): string => {
  return crypto.randomBytes(24).toString('base64url');
};

const encryptSessionData = (session: AdminSession): string => {
  // 実際の実装では適切な暗号化を使用
  return btoa(JSON.stringify(session));
};

const decryptSessionData = (encryptedData: string): AdminSession | null => {
  try {
    return JSON.parse(atob(encryptedData));
  } catch {
    return null;
  }
};

const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};

// ログイン試行管理
const getLoginAttempts = (email: string) => {
  const key = `login_attempts_${email}`;
  const data = localStorage.getItem(key);
  if (data) {
    return JSON.parse(data);
  }
  return { count: 0, lastAttempt: 0 };
};

const recordLoginAttempt = (email: string, success: boolean) => {
  const key = `login_attempts_${email}`;
  if (success) {
    localStorage.removeItem(key);
  } else {
    const attempts = getLoginAttempts(email);
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    localStorage.setItem(key, JSON.stringify(attempts));
  }
};

// トークンブラックリスト管理
const tokenBlacklist = new Set<string>();

const addToTokenBlacklist = (token: string) => {
  tokenBlacklist.add(token);
};

const isTokenBlacklisted = (token: string): boolean => {
  return tokenBlacklist.has(token);
};

/**
 * セキュアな認証ユーティリティ関数
 */
export const authUtils = {
  /**
   * Get stored token
   */
  getToken: (): string | null => {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  /**
   * Get stored session
   */
  getSession: (): AdminSession | null => {
    const sessionData = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
    if (sessionData) {
      const session = decryptSessionData(sessionData);
      if (session && session.expiresAt && new Date(session.expiresAt) > new Date()) {
        return session;
      }
      // 期限切れセッションを削除
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return null;
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    const token = authUtils.getToken();
    const session = authUtils.getSession();
    return !!token && !!session && !isTokenBlacklisted(token);
  },

  /**
   * Create authorization header
   */
  getAuthHeader: (): { Authorization: string } | Record<string, never> => {
    const token = authUtils.getToken();
    return token && !isTokenBlacklisted(token) ? { Authorization: `Bearer ${token}` } : {};
  },
};