/**
 * Security Hooks for React Components
 * React hooks for integrating security features into components
 */

import { useState, useEffect, useCallback } from 'react';
import {
  initializeSecuritySystem,
  getSecuritySystemStatus,
  performSecurityHealthCheck,
  generateCsrfToken,
  validateCsrfToken,
  generateRequestId,
  validateRequestId,
  checkIpRateLimit,
  logBusinessEvent,
  logSecurityEvent,
  SecuritySystemStatus,
  SecuritySystemConfig,
  DEFAULT_SECURITY_CONFIG
} from '../lib/security';

export interface UseSecurityOptions {
  autoInitialize?: boolean;
  config?: Partial<SecuritySystemConfig>;
  enableHealthCheck?: boolean;
  healthCheckInterval?: number;
}

export interface SecurityState {
  initialized: boolean;
  status: SecuritySystemStatus | null;
  isHealthy: boolean;
  loading: boolean;
  error: string | null;
  csrfToken: string | null;
  requestId: string | null;
}

export interface UseSecurityReturn extends SecurityState {
  initialize: (config?: Partial<SecuritySystemConfig>) => Promise<boolean>;
  performHealthCheck: () => Promise<boolean>;
  generateCsrfToken: () => string;
  validateCsrfToken: (token: string) => boolean;
  generateRequestId: () => string;
  validateRequestId: (id: string, expectedPrefix?: string) => boolean;
  checkRateLimit: (ip: string, endpoint?: string) => Promise<boolean>;
  logEvent: (type: string, action: string, details?: Record<string, unknown>) => void;
  resetSecurity: () => void;
}

/**
 * Main security hook
 */
export const useSecurity = (options: UseSecurityOptions = {}): UseSecurityReturn => {
  const {
    autoInitialize = false,
    config = {},
    enableHealthCheck = false,
    healthCheckInterval = 5 * 60 * 1000 // 5 minutes
  } = options;

  const [state, setState] = useState<SecurityState>({
    initialized: false,
    status: null,
    isHealthy: false,
    loading: autoInitialize,
    error: null,
    csrfToken: null,
    requestId: null
  });

  // Initialize security system
  const initialize = useCallback(async (initConfig?: Partial<SecuritySystemConfig>): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const finalConfig = { ...DEFAULT_SECURITY_CONFIG, ...config, ...initConfig };
      const status = await initializeSecuritySystem(finalConfig);

      setState(prev => ({
        ...prev,
        initialized: status.initialized,
        status,
        isHealthy: status.initialized,
        loading: false,
        error: status.errors.length > 0 ? status.errors[0] : null
      }));

      return status.initialized;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Security initialization failed';
      
      setState(prev => ({
        ...prev,
        initialized: false,
        loading: false,
        error: errorMessage
      }));

      return false;
    }
  }, [config]);

  // Perform health check
  const performHealthCheck = useCallback(async (): Promise<boolean> => {
    try {
      const healthCheck = await performSecurityHealthCheck();
      
      setState(prev => ({
        ...prev,
        isHealthy: healthCheck.healthy,
        error: healthCheck.healthy ? null : 'Security health check failed'
      }));

      return healthCheck.healthy;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      }));

      return false;
    }
  }, []);

  // Generate CSRF token
  const generateCsrf = useCallback((): string => {
    try {
      const token = generateCsrfToken();
      setState(prev => ({ ...prev, csrfToken: token }));
      return token;
    } catch (error) {
      console.error('Failed to generate CSRF token:', error);
      return '';
    }
  }, []);

  // Validate CSRF token
  const validateCsrf = useCallback((token: string): boolean => {
    try {
      return validateCsrfToken(token);
    } catch (error) {
      console.error('Failed to validate CSRF token:', error);
      return false;
    }
  }, []);

  // Generate request ID
  const generateRequest = useCallback((): string => {
    try {
      const requestId = generateRequestId();
      setState(prev => ({ ...prev, requestId }));
      return requestId;
    } catch (error) {
      console.error('Failed to generate request ID:', error);
      return '';
    }
  }, []);

  // Validate request ID
  const validateRequest = useCallback((id: string, expectedPrefix?: string): boolean => {
    try {
      const validation = validateRequestId(id, expectedPrefix);
      return validation.isValid;
    } catch (error) {
      console.error('Failed to validate request ID:', error);
      return false;
    }
  }, []);

  // Check rate limit
  const checkRateLimit = useCallback(async (ip: string, endpoint?: string): Promise<boolean> => {
    try {
      const result = checkIpRateLimit(ip, 'default', endpoint);
      return result.allowed;
    } catch (error) {
      console.error('Failed to check rate limit:', error);
      return false;
    }
  }, []);

  // Log security/business event
  const logEvent = useCallback((type: string, action: string, details: Record<string, unknown> = {}): void => {
    try {
      if (type.startsWith('business.')) {
        // Business events
        if (action === 'request_created') {
          logBusinessEvent.requestCreated(
            details.requestId as string,
            details.amount as string,
            details.mode as string,
            details.userId as string
          );
        } else if (action === 'transaction_signed') {
          logBusinessEvent.transactionSigned(
            details.requestId as string,
            details.txHash as string,
            details.walletUsed as string
          );
        }
      } else if (type.startsWith('security.')) {
        // Security events
        if (action === 'suspicious_activity') {
          logSecurityEvent.suspiciousActivity(
            details.description as string,
            details.ipAddress as string,
            details
          );
        } else if (action === 'rate_limit_exceeded') {
          logSecurityEvent.rateLimitExceeded(
            details.ipAddress as string,
            details.endpoint as string,
            details.requestCount as number
          );
        }
      }
    } catch (error) {
      console.error('Failed to log event:', error);
    }
  }, []);

  // Reset security state
  const resetSecurity = useCallback((): void => {
    setState({
      initialized: false,
      status: null,
      isHealthy: false,
      loading: false,
      error: null,
      csrfToken: null,
      requestId: null
    });
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }
  }, [autoInitialize, initialize]);

  // Periodic health check
  useEffect(() => {
    if (!enableHealthCheck || !state.initialized) return;

    const interval = setInterval(() => {
      performHealthCheck();
    }, healthCheckInterval);

    return () => clearInterval(interval);
  }, [enableHealthCheck, state.initialized, healthCheckInterval, performHealthCheck]);

  // Update status periodically
  useEffect(() => {
    if (!state.initialized) return;

    const interval = setInterval(() => {
      const currentStatus = getSecuritySystemStatus();
      setState(prev => ({ ...prev, status: currentStatus }));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [state.initialized]);

  return {
    ...state,
    initialize,
    performHealthCheck,
    generateCsrfToken: generateCsrf,
    validateCsrfToken: validateCsrf,
    generateRequestId: generateRequest,
    validateRequestId: validateRequest,
    checkRateLimit,
    logEvent,
    resetSecurity
  };
};

/**
 * Hook for CSRF protection
 */
export const useCsrfProtection = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const generateToken = useCallback(() => {
    try {
      const newToken = generateCsrfToken();
      setToken(newToken);
      return newToken;
    } catch (error) {
      console.error('Failed to generate CSRF token:', error);
      return null;
    }
  }, []);

  const validateToken = useCallback(async (tokenToValidate: string): Promise<boolean> => {
    setIsValidating(true);
    try {
      const isValid = validateCsrfToken(tokenToValidate);
      setIsValidating(false);
      return isValid;
    } catch (error) {
      console.error('Failed to validate CSRF token:', error);
      setIsValidating(false);
      return false;
    }
  }, []);

  // Generate token on mount
  useEffect(() => {
    generateToken();
  }, [generateToken]);

  return {
    token,
    isValidating,
    generateToken,
    validateToken,
    getFormProps: () => ({
      'data-csrf-token': token
    }),
    getHeaderProps: () => ({
      'X-CSRF-Token': token
    })
  };
};

/**
 * Hook for rate limiting awareness
 */
export const useRateLimit = (identifier: string, endpoint?: string) => {
  const [rateLimitStatus, setRateLimitStatus] = useState({
    allowed: true,
    remaining: 100,
    resetTime: Date.now() + 15 * 60 * 1000,
    retryAfter: 0
  });

  const checkLimit = useCallback(async () => {
    try {
      const result = checkIpRateLimit(identifier, 'default', endpoint);
      setRateLimitStatus({
        allowed: result.allowed,
        remaining: result.remaining,
        resetTime: result.resetTime,
        retryAfter: result.retryAfter || 0
      });
      return result.allowed;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      return false;
    }
  }, [identifier, endpoint]);

  useEffect(() => {
    checkLimit();
  }, [checkLimit]);

  return {
    ...rateLimitStatus,
    checkLimit,
    isBlocked: !rateLimitStatus.allowed,
    timeUntilReset: Math.max(0, rateLimitStatus.resetTime - Date.now())
  };
};

/**
 * Hook for secure request generation
 */
export const useSecureRequest = () => {
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  const generateNewRequest = useCallback(() => {
    try {
      const requestId = generateRequestId();
      setCurrentRequestId(requestId);
      return requestId;
    } catch (error) {
      console.error('Failed to generate secure request:', error);
      return null;
    }
  }, []);

  const validateRequest = useCallback((requestId: string) => {
    try {
      const validation = validateRequestId(requestId, 'req');
      return validation.isValid;
    } catch (error) {
      console.error('Failed to validate request:', error);
      return false;
    }
  }, []);

  return {
    currentRequestId,
    generateNewRequest,
    validateRequest,
    clearRequest: () => setCurrentRequestId(null)
  };
};