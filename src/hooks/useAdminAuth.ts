/**
 * Admin Authentication Hook for OTC System
 */
import { useState, useCallback, useEffect } from 'react';
import { LoginCredentials, AdminSession, UnauthorizedError } from '../types/otc/index';

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
    if (savedSession) {
      try {
        // 開発環境では暗号化をスキップ
        let parsedSession;
        if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
          parsedSession = JSON.parse(savedSession);
        } else {
          parsedSession = decryptSessionData(savedSession);
        }
        
        // セッション期限チェック
        if (parsedSession.expiresAt && new Date(parsedSession.expiresAt) < new Date()) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          return null;
        }
        return parsedSession;
      } catch (error) {
        console.error('セッション復元エラー:', error);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
      }
    }
    return null;
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // セッション有効性チェック（開発環境では簡略化）
  useEffect(() => {
    if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
      // 開発環境では簡単なチェックのみ
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession && !session) {
        try {
          const parsedSession = JSON.parse(savedSession);
          setSession(parsedSession);
        } catch (error) {
          console.error('開発環境セッション復元エラー:', error);
          localStorage.removeItem(SESSION_STORAGE_KEY);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      }
    }
  }, [session]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('ログイン試行開始:', credentials.email);
      
      // 開発環境では認証を完全に簡略化
      if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
        console.log('開発環境でのログイン処理');
        
        // 固定認証情報チェック
        if (credentials.email !== 'admin@otc.local' || credentials.password !== 'admin123') {
          console.log('認証情報が一致しません');
          throw new Error('認証情報が無効です');
        }
        
        console.log('認証成功、セッション作成中');
        
        // 開発用の簡単なセッション作成
        const mockSession = {
          id: `dev-session-${Date.now()}`,
          adminId: 'dev-admin',
          email: credentials.email,
          name: 'Admin User',
          role: 'admin',
          permissions: ['read', 'write', 'admin'],
          loginTime: new Date(),
          ipAddress: 'localhost',
          userAgent: 'dev-browser',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24時間
          isActive: true,
        };
        
        // セッションを直接localStorageに保存（暗号化なし）
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(mockSession));
        localStorage.setItem(TOKEN_STORAGE_KEY, 'dev-token');
        
        console.log('セッション保存完了');
        setSession(mockSession);
        return;
      }
      
      // 本番環境用の処理（現在は使用しない）
      throw new Error('本番環境の認証は未実装です');
      
    } catch (err) {
      console.error('ログインエラー:', err);
      const errorMessage = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    console.log('ログアウト処理開始');
    
    // セッションデータを完全に削除
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    
    setSession(null);
    setError(null);
    
    console.log('ログアウト完了');
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
    localStorage.setItem(SESSION_STORAGE_KEY, encryptedSession);
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
    const csrfToken = await generateCSRFToken();
    
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
  // Web Crypto APIを使用してブラウザ互換のハッシュ化
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const validateCredentials = async (email: string, hashedPassword: string): Promise<boolean> => {
  // 開発環境用の簡単な認証
  if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
    return email === 'admin@otc.local' || email === 'admin';
  }
  
  // 実際の実装では外部認証サービスを使用
  const expectedHash = await hashPassword('admin123');
  return email === 'admin@otc.local' && hashedPassword === expectedHash;
};;

const generateSecureSessionId = async (): Promise<string> => {
  // Web Crypto APIを使用してブラウザ互換のランダム生成
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

const generateSecureToken = async (): Promise<string> => {
  // Web Crypto APIを使用してブラウザ互換のランダム生成
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const generateCSRFToken = async (): Promise<string> => {
  // Web Crypto APIを使用してブラウザ互換のランダム生成
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
    // 相対パスの場合（/で始まる）は有効とする
    if (url.startsWith('/')) {
      return true;
    }
    
    // 絶対URLの場合はプロトコルをチェック
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};;

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