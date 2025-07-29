/**
 * Security System Main Module
 * Centralized security system for OTC application
 */

// Core security modules
export * from './secureId';
export * from './auditLog';
export * from './integrity';
export * from './rateLimiter';
export * from './middleware';

// Re-export commonly used functions with aliases
export {
  generateSecureRequestId as generateRequestId,
  validateSecureId as validateRequestId,
  generateCsrfToken,
  validateCsrfToken
} from './secureId';

export {
  logAuditEvent,
  logSecurityEvent,
  logBusinessEvent,
  queryAuditLogs,
  getAuditStatistics
} from './auditLog';

export {
  generateIntegrityHash,
  verifyIntegrity,
  transactionIntegrity,
  requestIntegrity
} from './integrity';

export {
  checkIpRateLimit,
  checkUserRateLimit,
  checkCompositeRateLimit,
  blockIdentifier,
  getRateLimiterStats
} from './rateLimiter';

export {
  securityMiddleware,
  generateSecurityHeaders,
  securityUtils
} from './middleware';

// Security configuration
import { initializeIntegritySystem } from './integrity';
import { initializeRateLimiter } from './rateLimiter';
import { initializeSecuritySystem } from './middleware';
import { AuditEventType, AuditSeverity, logAuditEvent } from './auditLog';

export interface SecuritySystemConfig {
  enableIntegrityChecks: boolean;
  enableRateLimiting: boolean;
  enableAuditLogging: boolean;
  enableCsrfProtection: boolean;
  development: boolean;
}

export interface SecuritySystemStatus {
  initialized: boolean;
  integrity: boolean;
  rateLimiting: boolean;
  auditLogging: boolean;
  timestamp: number;
  errors: string[];
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecuritySystemConfig = {
  enableIntegrityChecks: true,
  enableRateLimiting: true,
  enableAuditLogging: true,
  enableCsrfProtection: true,
  development: process.env.NODE_ENV === 'development'
};

/**
 * Global security system status
 */
let securitySystemStatus: SecuritySystemStatus = {
  initialized: false,
  integrity: false,
  rateLimiting: false,
  auditLogging: false,
  timestamp: 0,
  errors: []
};

/**
 * Initialize the complete security system
 */
export const initializeSecuritySystem = async (
  config: Partial<SecuritySystemConfig> = {}
): Promise<SecuritySystemStatus> => {
  const finalConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const errors: string[] = [];

  console.log('🔒 Initializing OTC Security System...');

  try {
    // Initialize integrity system
    if (finalConfig.enableIntegrityChecks) {
      const integrityOk = await initializeIntegritySystem();
      securitySystemStatus.integrity = integrityOk;
      
      if (!integrityOk) {
        errors.push('Integrity system initialization failed');
      }
    }

    // Initialize rate limiter
    if (finalConfig.enableRateLimiting) {
      try {
        initializeRateLimiter();
        securitySystemStatus.rateLimiting = true;
      } catch (error) {
        errors.push(`Rate limiter initialization failed: ${error}`);
        securitySystemStatus.rateLimiting = false;
      }
    }

    // Initialize security middleware
    try {
      initializeSecuritySystem();
      securitySystemStatus.auditLogging = true;
    } catch (error) {
      errors.push(`Security middleware initialization failed: ${error}`);
      securitySystemStatus.auditLogging = false;
    }

    // Overall status
    securitySystemStatus.initialized = errors.length === 0;
    securitySystemStatus.timestamp = Date.now();
    securitySystemStatus.errors = errors;

    // Log initialization result
    logAuditEvent(
      AuditEventType.SYSTEM_STARTUP,
      'security_system_initialization',
      {
        config: finalConfig,
        status: securitySystemStatus,
        errors: errors.length > 0 ? errors : undefined
      },
      {
        severity: errors.length > 0 ? AuditSeverity.HIGH : AuditSeverity.LOW,
        outcome: errors.length > 0 ? 'failure' : 'success'
      }
    );

    if (securitySystemStatus.initialized) {
      console.log('✅ OTC Security System initialized successfully');
    } else {
      console.log('❌ OTC Security System initialization failed:', errors);
    }

    return securitySystemStatus;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Critical initialization error: ${errorMessage}`);

    securitySystemStatus = {
      initialized: false,
      integrity: false,
      rateLimiting: false,
      auditLogging: false,
      timestamp: Date.now(),
      errors
    };

    console.error('❌ Critical security system initialization failure:', error);
    
    return securitySystemStatus;
  }
};

/**
 * Get current security system status
 */
export const getSecuritySystemStatus = (): SecuritySystemStatus => {
  return { ...securitySystemStatus };
};

/**
 * Perform security system health check
 */
export const performSecurityHealthCheck = async (): Promise<{
  healthy: boolean;
  checks: Record<string, boolean>;
  timestamp: number;
}> => {
  const checks: Record<string, boolean> = {};

  // Check integrity system
  try {
    checks.integrity = securitySystemStatus.integrity;
  } catch {
    checks.integrity = false;
  }

  // Check rate limiter
  try {
    checks.rateLimiting = securitySystemStatus.rateLimiting;
  } catch {
    checks.rateLimiting = false;
  }

  // Check audit logging
  try {
    checks.auditLogging = securitySystemStatus.auditLogging;
  } catch {
    checks.auditLogging = false;
  }

  // Check crypto availability
  try {
    checks.crypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  } catch {
    checks.crypto = false;
  }

  const healthy = Object.values(checks).every(check => check);

  // Log health check
  logAuditEvent(
    AuditEventType.SYSTEM_STARTUP,
    'security_health_check',
    { checks, healthy },
    {
      severity: healthy ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
      outcome: healthy ? 'success' : 'failure'
    }
  );

  return {
    healthy,
    checks,
    timestamp: Date.now()
  };
};

/**
 * Security constants for the OTC system
 */
export const OTC_SECURITY_CONSTANTS = {
  // Request security
  REQUEST_ID_PREFIX: 'req',
  REQUEST_TTL_MINUTES: 30,
  
  // Session security
  SESSION_TOKEN_PREFIX: 'sess',
  SESSION_TTL_MINUTES: 24 * 60, // 24 hours
  
  // Admin security
  ADMIN_SESSION_TTL_MINUTES: 60, // 1 hour
  ADMIN_RATE_LIMIT_STRICT: true,
  
  // Transaction security
  TX_INTEGRITY_REQUIRED: true,
  WITNESS_VERIFICATION_REQUIRED: true,
  
  // API security
  API_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  API_RATE_LIMIT_MAX_REQUESTS: 100,
  
  // CSRF protection
  CSRF_TOKEN_TTL_MINUTES: 60,
  CSRF_DOUBLE_SUBMIT_COOKIE: true,
  
  // Audit settings
  AUDIT_LOG_RETENTION_DAYS: 90,
  AUDIT_LOG_MAX_ENTRIES: 100000,
} as const;

/**
 * Security event types specific to OTC system
 */
export const OTC_SECURITY_EVENTS = {
  // Request lifecycle
  REQUEST_CREATED: 'otc.request.created',
  REQUEST_ACCESSED: 'otc.request.accessed',
  REQUEST_SIGNED: 'otc.request.signed',
  REQUEST_EXPIRED: 'otc.request.expired',
  
  // Transaction events
  TX_BUILT: 'otc.transaction.built',
  TX_SIGNED: 'otc.transaction.signed',
  TX_SUBMITTED: 'otc.transaction.submitted',
  TX_CONFIRMED: 'otc.transaction.confirmed',
  
  // Security violations
  INVALID_REQUEST_ID: 'otc.security.invalid_request_id',
  EXPIRED_REQUEST_ACCESS: 'otc.security.expired_request_access',
  TAMPERING_DETECTED: 'otc.security.tampering_detected',
  UNAUTHORIZED_ADMIN_ACCESS: 'otc.security.unauthorized_admin_access',
} as const;

/**
 * Utility function to check if security system is ready
 */
export const isSecuritySystemReady = (): boolean => {
  return securitySystemStatus.initialized;
};

/**
 * Utility function to require security system initialization
 */
export const requireSecuritySystem = (): void => {
  if (!isSecuritySystemReady()) {
    throw new Error('Security system not initialized. Call initializeSecuritySystem() first.');
  }
};

/**
 * Export types for external use
 */
export type {
  SecuritySystemConfig,
  SecuritySystemStatus,
  SecurityContext,
  SecurityPolicy,
  SecurityResult,
  AuditLogEntry,
  AuditEventType,
  AuditSeverity,
  RateLimitRule,
  RateLimitResult,
  IntegrityResult,
  IntegrityMetadata
} from './auditLog';

export type {
  SecureIdOptions,
  SecureIdValidation
} from './secureId';

export type {
  SignedData,
  VerificationResult
} from './integrity';