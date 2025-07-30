/**
 * Admin Authentication Hook for OTC System
 */
import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { LoginCredentials, AdminSession, UnauthorizedError } from '../types/otc/index';

interface AuthState {
  isAuthenticated: boolean;
  session: AdminSession | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshSession: () => Promise<void>;
}

// Create Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token storage keys
const TOKEN_STORAGE_KEY = 'otc_admin_token';
const SESSION_STORAGE_KEY = 'otc_admin_session';

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
      // 開発環境用の簡易認証
      if (credentials.email === 'admin@otc.local' && credentials.password === 'admin123') {
        const mockSession: AdminSession = {
          id: 'mock-session-id',
          adminId: 'admin-001',
          email: credentials.email,
          name: 'Admin User',
          role: 'admin',
          permissions: ['read', 'write', 'admin'],
          ipAddress: credentials.ipAddress || 'unknown',
          userAgent: credentials.userAgent || 'unknown',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24時間
          isActive: true,
        };
        
        // セッションを保存
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(mockSession));
        localStorage.setItem(TOKEN_STORAGE_KEY, 'mock-admin-token');
        
        setSession(mockSession);
      } else {
        throw new Error('認証情報が無効です');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setSession(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<void> => {
    // 開発環境では何もしない
  }, []);

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
 * 認証付きHTTPクライアント（開発環境用）
 */
export const createAuthenticatedFetch = () => {
  const token = authUtils.getToken();
  
  return async (url: string, options: RequestInit = {}): Promise<Response> => {
    // 開発環境では実際のAPIを呼ばず、モックレスポンスを返す
    if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
      // モックレスポンス
      const mockResponse = {
        requests: [],
        success: true,
        message: 'モックレスポンス（開発環境）'
      };
      
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // 本番環境での実装
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Handle unauthorized responses
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new UnauthorizedError('Authentication required');
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

/**
 * Utility functions for auth
 */
export const authUtils = {
  /**
   * Get stored token
   */
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  /**
   * Get stored session
   */
  getSession: (): AdminSession | null => {
    const sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
    if (sessionData) {
      try {
        return JSON.parse(sessionData);
      } catch {
        return null;
      }
    }
    return null;
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    return !!authUtils.getToken();
  },

  /**
   * Create authorization header
   */
  getAuthHeader: (): { Authorization: string } | {} => {
    const token = authUtils.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};