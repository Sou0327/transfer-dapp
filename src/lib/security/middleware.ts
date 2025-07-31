/**
 * Security Middleware System
 * Comprehensive security middleware for request protection and validation
 */

import { generateCsrfToken } from './secureId';
import { checkCompositeRateLimit, DEFAULT_RATE_LIMITS } from './rateLimiter';
import { logSecurityEvent, logAuditEvent, AuditEventType, AuditSeverity } from './auditLog';

export interface SecurityContext {
  ip: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  requestId: string;
  timestamp: number;
  csrfToken?: string;
  origin?: string;
  referer?: string;
}

export interface SecurityPolicy {
  rateLimiting: {
    enabled: boolean;
    rules: keyof typeof DEFAULT_RATE_LIMITS;
  };
  csrf: {
    enabled: boolean;
    validateOrigin: boolean;
    allowedOrigins: string[];
  };
  headers: {
    enforceHttps: boolean;
    hsts: boolean;
    noSniff: boolean;
    frameOptions: boolean;
    xssProtection: boolean;
  };
  validation: {
    validateUserAgent: boolean;
    blockSuspiciousPatterns: boolean;
    maxRequestSize: number;
  };
}

export interface SecurityResult {
  allowed: boolean;
  reason?: string;
  headers?: Record<string, string>;
  redirectUrl?: string;
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    reset: number;
    retryAfter?: number;
  };
}

export interface SuspiciousPattern {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Default security policy
 */
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  rateLimiting: {
    enabled: true,
    rules: 'default'
  },
  csrf: {
    enabled: true,
    validateOrigin: true,
    allowedOrigins: [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://yourdomain.com'
    ]
  },
  headers: {
    enforceHttps: true,
    hsts: true,
    noSniff: true,
    frameOptions: true,
    xssProtection: true
  },
  validation: {
    validateUserAgent: true,
    blockSuspiciousPatterns: true,
    maxRequestSize: 10 * 1024 * 1024 // 10MB
  }
};

/**
 * Suspicious patterns to detect potential attacks
 */
const SUSPICIOUS_PATTERNS: SuspiciousPattern[] = [
  {
    name: 'sql_injection',
    pattern: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)|(['"].*?['"])|(-{2,})|(\b(or|and)\s+[\d'"])/i,
    severity: 'high',
    description: 'Potential SQL injection attempt'
  },
  {
    name: 'xss_script',
    pattern: /<script[^>]*>|javascript:|on\w+\s*=|eval\s*\(|expression\s*\(/i,
    severity: 'high',
    description: 'Potential XSS attack'
  },
  {
    name: 'path_traversal',
    pattern: /\.\.[/\\]|%2e%2e[/\\]|%252e%252e[/\\]/i,
    severity: 'medium',
    description: 'Potential path traversal attempt'
  },
  {
    name: 'command_injection',
    pattern: /[;&|`$(){}[\]]/,
    severity: 'high',
    description: 'Potential command injection'
  },
  {
    name: 'ldap_injection',
    pattern: /[*()\\&|!]/,
    severity: 'medium',
    description: 'Potential LDAP injection'
  },
  {
    name: 'email_header_injection',
    pattern: /[\r\n]+(to|cc|bcc|from|subject):/i,
    severity: 'medium',
    description: 'Potential email header injection'
  }
];

/**
 * Generate security headers
 */
export const generateSecurityHeaders = (policy: SecurityPolicy): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (policy.headers.hsts) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  if (policy.headers.noSniff) {
    headers['X-Content-Type-Options'] = 'nosniff';
  }

  if (policy.headers.frameOptions) {
    headers['X-Frame-Options'] = 'DENY';
  }

  if (policy.headers.xssProtection) {
    headers['X-XSS-Protection'] = '1; mode=block';
  }

  // Content Security Policy
  headers['Content-Security-Policy'] = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  // Referrer Policy
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

  // Permissions Policy
  headers['Permissions-Policy'] = [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'midi=()',
    'encrypted-media=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'speaker=()'
  ].join(', ');

  return headers;
};

/**
 * Validate origin for CSRF protection
 */
export const validateOrigin = (
  origin: string | undefined,
  referer: string | undefined,
  allowedOrigins: string[]
): boolean => {
  // Check origin header first
  if (origin) {
    return allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      // Allow wildcards
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return false;
    });
  }

  // Fallback to referer
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      return allowedOrigins.includes(refererOrigin);
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Check for suspicious patterns in request data
 */
export const checkSuspiciousPatterns = (
  data: string,
  patterns: SuspiciousPattern[] = SUSPICIOUS_PATTERNS
): { detected: boolean; matches: SuspiciousPattern[] } => {
  const matches: SuspiciousPattern[] = [];

  for (const pattern of patterns) {
    if (pattern.pattern.test(data)) {
      matches.push(pattern);
    }
  }

  return {
    detected: matches.length > 0,
    matches
  };
};

/**
 * Validate user agent
 */
export const validateUserAgent = (userAgent: string | undefined): boolean => {
  if (!userAgent) return false;

  // Check for empty or suspicious user agents
  if (userAgent.length < 10 || userAgent.length > 500) {
    return false;
  }

  // Check for common bot patterns that shouldn't access sensitive endpoints
  const botPatterns = [
    /curl/i,
    /wget/i,
    /python/i,
    /node/i,
    /scanner/i,
    /bot/i,
    /crawler/i,
    /spider/i
  ];

  return !botPatterns.some(pattern => pattern.test(userAgent));
};

/**
 * CSRF token management
 */
export class CsrfTokenManager {
  private tokens = new Map<string, { expires: number; used: boolean }>();
  private readonly TTL = 60 * 60 * 1000; // 1 hour

  generateToken(): string {
    const token = generateCsrfToken();
    const expires = Date.now() + this.TTL;
    
    this.tokens.set(token, { expires, used: false });
    
    // Cleanup old tokens
    this.cleanup();
    
    return token;
  }

  validateToken(token: string, markUsed: boolean = true): boolean {
    const tokenInfo = this.tokens.get(token);
    
    if (!tokenInfo) {
      return false;
    }

    // Check expiration
    if (Date.now() > tokenInfo.expires) {
      this.tokens.delete(token);
      return false;
    }

    // Check if already used (for one-time tokens)
    if (tokenInfo.used) {
      return false;
    }

    // Mark as used if requested
    if (markUsed) {
      tokenInfo.used = true;
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [_token, info] of this.tokens.entries()) { // eslint-disable-line @typescript-eslint/no-unused-vars
      if (now > info.expires) {
        this.tokens.delete(token);
      }
    }
  }

  getStats(): { total: number; active: number; expired: number } {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [_token, info] of this.tokens.entries()) { // eslint-disable-line @typescript-eslint/no-unused-vars
      if (now > info.expires) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.tokens.size,
      active,
      expired
    };
  }
}

/**
 * Global CSRF token manager
 */
const csrfManager = new CsrfTokenManager();

/**
 * Main security middleware
 */
export const securityMiddleware = (
  context: SecurityContext,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY,
  endpoint?: string
): SecurityResult => {
  const results: SecurityResult = { allowed: true };

  try {
    // Generate security headers
    results.headers = generateSecurityHeaders(policy);

    // 1. Rate limiting check
    if (policy.rateLimiting.enabled) {
      const rateLimitResult = checkCompositeRateLimit(
        context.ip,
        context.userId,
        policy.rateLimiting.rules,
        endpoint
      );

      if (!rateLimitResult.allowed) {
        logSecurityEvent.rateLimitExceeded(
          context.ip,
          endpoint || 'unknown',
          0
        );

        return {
          allowed: false,
          reason: 'Rate limit exceeded',
          rateLimitInfo: rateLimitResult,
          headers: {
            ...results.headers,
            'Retry-After': Math.ceil((rateLimitResult.ip.retryAfter || 60000) / 1000).toString()
          }
        };
      }

      results.rateLimitInfo = rateLimitResult;
    }

    // 2. HTTPS enforcement
    if (policy.headers.enforceHttps && !context.origin?.startsWith('https://')) {
      const httpsUrl = context.origin?.replace('http://', 'https://');
      return {
        allowed: false,
        reason: 'HTTPS required',
        redirectUrl: httpsUrl,
        headers: results.headers
      };
    }

    // 3. CSRF protection
    if (policy.csrf.enabled) {
      // Validate origin for state-changing requests
      if (context.origin && policy.csrf.validateOrigin) {
        const isValidOrigin = validateOrigin(
          context.origin,
          context.referer,
          policy.csrf.allowedOrigins
        );

        if (!isValidOrigin) {
          logSecurityEvent.csrfDetected(
            context.sessionId || 'unknown',
            context.ip,
            context.userAgent
          );

          return {
            allowed: false,
            reason: 'Invalid origin',
            headers: results.headers
          };
        }
      }

      // Validate CSRF token for POST/PUT/DELETE requests
      if (context.csrfToken) {
        const isValidToken = csrfManager.validateToken(context.csrfToken);
        
        if (!isValidToken) {
          logSecurityEvent.csrfDetected(
            context.sessionId || 'unknown',
            context.ip,
            context.userAgent
          );

          return {
            allowed: false,
            reason: 'Invalid CSRF token',
            headers: results.headers
          };
        }
      }
    }

    // 4. User agent validation
    if (policy.validation.validateUserAgent) {
      const isValidUserAgent = validateUserAgent(context.userAgent);
      
      if (!isValidUserAgent) {
        logSecurityEvent.suspiciousActivity(
          'Invalid or suspicious user agent',
          context.ip,
          { userAgent: context.userAgent }
        );

        return {
          allowed: false,
          reason: 'Invalid user agent',
          headers: results.headers
        };
      }
    }

    // 5. Suspicious pattern detection
    if (policy.validation.blockSuspiciousPatterns) {
      // Check all string values in context
      const contextString = JSON.stringify(context);
      const suspiciousCheck = checkSuspiciousPatterns(contextString);

      if (suspiciousCheck.detected) {
        const highSeverityMatch = suspiciousCheck.matches.find(m => m.severity === 'high');
        
        logSecurityEvent.suspiciousActivity(
          'Suspicious patterns detected',
          context.ip,
          {
            patterns: suspiciousCheck.matches.map(m => m.name),
            userAgent: context.userAgent
          }
        );

        return {
          allowed: false,
          reason: `Suspicious pattern detected: ${highSeverityMatch?.description || 'Security violation'}`,
          headers: results.headers
        };
      }
    }

    // Log successful security check
    logAuditEvent(
      AuditEventType.SECURITY_BREACH_ATTEMPT,
      'security_check_passed',
      { endpoint, ip: context.ip },
      {
        severity: AuditSeverity.LOW,
        userId: context.userId,
        sessionId: context.sessionId,
        ipAddress: context.ip,
        outcome: 'success'
      }
    );

    return results;

  } catch (error) {
    console.error('Security middleware error:', error);
    
    logAuditEvent(
      AuditEventType.SYSTEM_ERROR,
      'security_middleware_error',
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { severity: AuditSeverity.HIGH, outcome: 'failure' }
    );

    // Fail securely - deny access on error
    return {
      allowed: false,
      reason: 'Security check failed',
      headers: results.headers
    };
  }
};

/**
 * Generate CSRF token for forms
 */
export const generateCsrfToken = (): string => {
  return csrfManager.generateToken();
};

/**
 * Validate CSRF token
 */
export const validateCsrfToken = (token: string): boolean => {
  return csrfManager.validateToken(token);
};

/**
 * Get CSRF manager statistics
 */
export const getCsrfStats = () => {
  return csrfManager.getStats();
};

/**
 * Security utilities for specific use cases
 */
export const securityUtils = {
  /**
   * Create security context from request
   */
  createContext: (req: {
    ip?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  }): SecurityContext => {
    return {
      ip: req.ip || 'unknown',
      userAgent: req.headers?.['user-agent'],
      requestId: req.headers?.['x-request-id'] || `req_${Date.now()}`,
      timestamp: Date.now(),
      csrfToken: req.headers?.['x-csrf-token'] || req.body?.csrfToken,
      origin: req.headers?.origin,
      referer: req.headers?.referer
    };
  },

  /**
   * Check if IP is in allowed list
   */
  isIpAllowed: (ip: string, allowedIps: string[]): boolean => {
    return allowedIps.some(allowed => {
      if (allowed === ip) return true;
      // Simple CIDR support
      if (allowed.includes('/')) {
        // For production, use proper CIDR library
        return ip.startsWith(allowed.split('/')[0]);
      }
      return false;
    });
  },

  /**
   * Sanitize input string
   */
  sanitizeInput: (input: string): string => {
    return input
      .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
      .trim()
      .slice(0, 1000); // Limit length
  }
};

/**
 * Initialize security system
 */
export const initializeSecuritySystem = (): void => {
  console.log('✅ Security middleware initialized');
  
  // Log security system startup
  logAuditEvent(
    AuditEventType.SYSTEM_STARTUP,
    'security_system_initialized',
    { 
      policies: ['rateLimiting', 'csrf', 'headers', 'validation'],
      suspiciousPatterns: SUSPICIOUS_PATTERNS.length
    },
    { severity: AuditSeverity.LOW, outcome: 'success' }
  );
};