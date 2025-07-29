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

/**
 * Auth Provider Component
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    session: null,
    token: null,
    loading: true,
    error: null,
  });

  // API base URL
  const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

  /**
   * Login function
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ログインに失敗しました');
      }

      const data = await response.json();
      
      // Store token and session
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.session));

      setAuthState({
        isAuthenticated: true,
        session: data.session,
        token: data.token,
        loading: false,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ログインに失敗しました';
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        isAuthenticated: false,
        session: null,
        token: null,
      }));
      throw error;
    }
  }, [API_BASE_URL]);

  /**
   * Logout function
   */
  const logout = useCallback(async (): Promise<void> => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      
      if (token) {
        // Call logout API
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.warn('Logout API call failed:', error);
      // Continue with local logout even if API call fails
    } finally {
      // Clear local storage
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);

      setAuthState({
        isAuthenticated: false,
        session: null,
        token: null,
        loading: false,
        error: null,
      });
    }
  }, [API_BASE_URL]);

  /**
   * Clear error function
   */
  const clearError = useCallback((): void => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Refresh session function
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    if (!token) {
      setAuthState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new UnauthorizedError('Session validation failed');
      }

      const data = await response.json();
      
      // Update stored session
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.session));

      setAuthState({
        isAuthenticated: true,
        session: data.session,
        token,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.warn('Session refresh failed:', error);
      
      // Clear invalid session
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);

      setAuthState({
        isAuthenticated: false,
        session: null,
        token: null,
        loading: false,
        error: null,
      });
    }
  }, [API_BASE_URL]);

  /**
   * Initialize auth state on mount
   */
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const sessionData = localStorage.getItem(SESSION_STORAGE_KEY);

      if (token && sessionData) {
        try {
          const session = JSON.parse(sessionData);
          setAuthState(prev => ({ ...prev, token, session }));
          await refreshSession();
        } catch (error) {
          console.warn('Failed to parse stored session:', error);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } else {
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    initializeAuth();
  }, [refreshSession]);

  /**
   * Auto-refresh session periodically
   */
  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const interval = setInterval(() => {
      refreshSession();
    }, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, refreshSession]);

  /**
   * Handle token expiration
   */
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };

    // Listen for unauthorized responses from API calls
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    clearError,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to use admin authentication
 */
export const useAdminAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AuthProvider');
  }
  
  return context;
};

/**
 * HTTP client with automatic auth handling
 */
export const createAuthenticatedFetch = (token: string) => {
  return async (url: string, options: RequestInit = {}): Promise<Response> => {
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
 * Higher-order component to protect admin routes
 */
export const withAdminAuth = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> => {
  return (props: P) => {
    const { isAuthenticated, loading } = useAdminAuth();

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      // Redirect to login or show login component
      return <div>Please log in to access this page</div>;
    }

    return <Component {...props} />;
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