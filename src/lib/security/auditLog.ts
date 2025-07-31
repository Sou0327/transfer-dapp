/**
 * Audit Logging System
 * Comprehensive audit trail for security and compliance monitoring
 */

import { generateSecureRequestId } from './secureId';

export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_FAILED = 'auth.failed',
  AUTH_LOCKED = 'auth.locked',
  AUTH_TOKEN_CREATED = 'auth.token_created',
  AUTH_TOKEN_REVOKED = 'auth.token_revoked',

  // Request management
  REQUEST_CREATED = 'request.created',
  REQUEST_VIEWED = 'request.viewed',
  REQUEST_EXPIRED = 'request.expired',
  REQUEST_CANCELLED = 'request.cancelled',

  // Transaction events
  TX_PRESIGNED = 'tx.presigned',
  TX_SUBMITTED = 'tx.submitted',
  TX_CONFIRMED = 'tx.confirmed',
  TX_FAILED = 'tx.failed',

  // Administrative actions
  ADMIN_CONFIG_CHANGED = 'admin.config_changed',
  ADMIN_USER_CREATED = 'admin.user_created',
  ADMIN_USER_DISABLED = 'admin.user_disabled',
  ADMIN_SYSTEM_SHUTDOWN = 'admin.system_shutdown',

  // Security events
  SECURITY_BREACH_ATTEMPT = 'security.breach_attempt',
  SECURITY_RATE_LIMITED = 'security.rate_limited',
  SECURITY_INVALID_TOKEN = 'security.invalid_token',
  SECURITY_CSRF_DETECTED = 'security.csrf_detected',
  SECURITY_IP_BLOCKED = 'security.ip_blocked',

  // Data integrity
  DATA_CORRUPTION_DETECTED = 'data.corruption_detected',
  DATA_BACKUP_CREATED = 'data.backup_created',
  DATA_RESTORE_PERFORMED = 'data.restore_performed',

  // System events
  SYSTEM_STARTUP = 'system.startup',
  SYSTEM_ERROR = 'system.error',
  SYSTEM_MAINTENANCE = 'system.maintenance',
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  action: string;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'pending';
  metadata?: {
    requestId?: string;
    correlationId?: string;
    parentEventId?: string;
    geolocation?: string;
    deviceFingerprint?: string;
  };
  hash?: string; // For integrity verification
}

export interface AuditFilter {
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  userIds?: string[];
  startTime?: number;
  endTime?: number;
  outcome?: 'success' | 'failure' | 'pending';
  resource?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStatistics {
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  eventsBySeverity: Record<AuditSeverity, number>;
  eventsByOutcome: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
  topIpAddresses: Array<{ ipAddress: string; count: number }>;
  timeRange: { start: number; end: number };
}

/**
 * In-memory audit log store (replace with persistent storage in production)
 */
class AuditLogStore {
  private logs: AuditLogEntry[] = [];
  private maxEntries: number = 10000;

  add(entry: AuditLogEntry): void {
    this.logs.unshift(entry);
    
    // Keep only the most recent entries
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(0, this.maxEntries);
    }
  }

  query(filter: AuditFilter = {}): AuditLogEntry[] {
    let results = [...this.logs];

    // Apply filters
    if (filter.eventTypes?.length) {
      results = results.filter(log => filter.eventTypes!.includes(log.eventType));
    }

    if (filter.severities?.length) {
      results = results.filter(log => filter.severities!.includes(log.severity));
    }

    if (filter.userIds?.length) {
      results = results.filter(log => log.userId && filter.userIds!.includes(log.userId));
    }

    if (filter.startTime) {
      results = results.filter(log => log.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      results = results.filter(log => log.timestamp <= filter.endTime!);
    }

    if (filter.outcome) {
      results = results.filter(log => log.outcome === filter.outcome);
    }

    if (filter.resource) {
      results = results.filter(log => log.resource === filter.resource);
    }

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return results.slice(offset, offset + limit);
  }

  getStatistics(filter: AuditFilter = {}): AuditStatistics {
    const filteredLogs = this.query({ ...filter, limit: undefined, offset: undefined });

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};

    filteredLogs.forEach(log => {
      // Count by type
      eventsByType[log.eventType] = (eventsByType[log.eventType] || 0) + 1;
      
      // Count by severity
      eventsBySeverity[log.severity] = (eventsBySeverity[log.severity] || 0) + 1;
      
      // Count by outcome
      eventsByOutcome[log.outcome] = (eventsByOutcome[log.outcome] || 0) + 1;
      
      // Count by user
      if (log.userId) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }
      
      // Count by IP
      if (log.ipAddress) {
        ipCounts[log.ipAddress] = (ipCounts[log.ipAddress] || 0) + 1;
      }
    });

    // Get top users and IPs
    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topIpAddresses = Object.entries(ipCounts)
      .map(([ipAddress, count]) => ({ ipAddress, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate time range
    const timestamps = filteredLogs.map(log => log.timestamp);
    const timeRange = {
      start: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      end: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };

    return {
      totalEvents: filteredLogs.length,
      eventsByType: eventsByType as Record<AuditEventType, number>,
      eventsBySeverity: eventsBySeverity as Record<AuditSeverity, number>,
      eventsByOutcome,
      topUsers,
      topIpAddresses,
      timeRange,
    };
  }

  clear(): void {
    this.logs = [];
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs];
  }
}

/**
 * Global audit log store instance
 */
const auditStore = new AuditLogStore();

/**
 * Simple hash function for integrity verification
 */
const calculateHash = (entry: Omit<AuditLogEntry, 'hash'>): string => {
  const payload = JSON.stringify(entry, Object.keys(entry).sort());
  
  // Simple hash implementation (use crypto.subtle.digest in production)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(16);
};

/**
 * Create and log an audit event
 */
export const logAuditEvent = (
  eventType: AuditEventType,
  action: string,
  details: Record<string, unknown> = {},
  options: {
    severity?: AuditSeverity;
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    resource?: string;
    resourceId?: string;
    outcome?: 'success' | 'failure' | 'pending';
    metadata?: AuditLogEntry['metadata'];
  } = {}
): string => {
  const entryId = generateSecureRequestId({
    prefix: 'audit',
    length: 16,
    includeTimestamp: false,
    encoding: 'base64url'
  });

  const entry: Omit<AuditLogEntry, 'hash'> = {
    id: entryId,
    timestamp: Date.now(),
    eventType,
    severity: options.severity || AuditSeverity.MEDIUM,
    userId: options.userId,
    sessionId: options.sessionId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    resource: options.resource,
    resourceId: options.resourceId,
    action,
    details,
    outcome: options.outcome || 'success',
    metadata: options.metadata,
  };

  // Calculate integrity hash
  const hash = calculateHash(entry);
  const finalEntry: AuditLogEntry = { ...entry, hash };

  // Store the entry
  auditStore.add(finalEntry);

  // Console logging for development
  console.log(`🔍 AUDIT [${eventType}]`, {
    action,
    severity: entry.severity,
    userId: entry.userId,
    outcome: entry.outcome,
    details: Object.keys(details).length > 0 ? details : undefined
  });

  return entryId;
};

/**
 * Verify audit log entry integrity
 */
export const verifyAuditLogIntegrity = (entry: AuditLogEntry): boolean => {
  if (!entry.hash) return false;
  
  const { hash, ...entryWithoutHash } = entry;
  const calculatedHash = calculateHash(entryWithoutHash);
  
  return hash === calculatedHash;
};

/**
 * Query audit logs
 */
export const queryAuditLogs = (filter: AuditFilter = {}): AuditLogEntry[] => {
  return auditStore.query(filter);
};

/**
 * Get audit statistics
 */
export const getAuditStatistics = (filter: AuditFilter = {}): AuditStatistics => {
  return auditStore.getStatistics(filter);
};

/**
 * Clear all audit logs (admin only)
 */
export const clearAuditLogs = (adminUserId: string): void => {
  logAuditEvent(
    AuditEventType.ADMIN_CONFIG_CHANGED,
    'audit_logs_cleared',
    { clearedBy: adminUserId },
    { 
      severity: AuditSeverity.HIGH,
      userId: adminUserId,
      outcome: 'success'
    }
  );
  
  auditStore.clear();
};

/**
 * Export audit logs for compliance
 */
export const exportAuditLogs = (
  filter: AuditFilter = {},
  format: 'json' | 'csv' = 'json'
): string => {
  const logs = auditStore.query(filter);
  
  if (format === 'csv') {
    const headers = [
      'id', 'timestamp', 'eventType', 'severity', 'userId', 'ipAddress',
      'resource', 'action', 'outcome', 'details'
    ];
    
    const csvRows = logs.map(log => [
      log.id,
      new Date(log.timestamp).toISOString(),
      log.eventType,
      log.severity,
      log.userId || '',
      log.ipAddress || '',
      log.resource || '',
      log.action,
      log.outcome,
      JSON.stringify(log.details)
    ]);
    
    return [headers, ...csvRows].map(row => row.join(',')).join('\n');
  }
  
  return JSON.stringify(logs, null, 2);
};

/**
 * Security event shortcuts
 */
export const logSecurityEvent = {
  loginSuccess: (userId: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(
      AuditEventType.AUTH_LOGIN,
      'user_login_success',
      { userId },
      { severity: AuditSeverity.LOW, userId, ipAddress, userAgent, outcome: 'success' }
    ),

  loginFailure: (attemptedUserId: string, reason: string, ipAddress?: string) =>
    logAuditEvent(
      AuditEventType.AUTH_FAILED,
      'user_login_failed',
      { attemptedUserId, reason },
      { severity: AuditSeverity.MEDIUM, ipAddress, outcome: 'failure' }
    ),

  suspiciousActivity: (description: string, ipAddress?: string, details: Record<string, unknown> = {}) =>
    logAuditEvent(
      AuditEventType.SECURITY_BREACH_ATTEMPT,
      'suspicious_activity_detected',
      { description, ...details },
      { severity: AuditSeverity.HIGH, ipAddress, outcome: 'failure' }
    ),

  rateLimitExceeded: (ipAddress: string, endpoint: string, requestCount: number) =>
    logAuditEvent(
      AuditEventType.SECURITY_RATE_LIMITED,
      'rate_limit_exceeded',
      { endpoint, requestCount },
      { severity: AuditSeverity.MEDIUM, ipAddress, outcome: 'failure' }
    ),

  csrfDetected: (sessionId: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(
      AuditEventType.SECURITY_CSRF_DETECTED,
      'csrf_attack_detected',
      { sessionId },
      { severity: AuditSeverity.HIGH, sessionId, ipAddress, userAgent, outcome: 'failure' }
    ),
};

/**
 * Business event shortcuts
 */
export const logBusinessEvent = {
  requestCreated: (requestId: string, amount: string, mode: string, userId?: string) =>
    logAuditEvent(
      AuditEventType.REQUEST_CREATED,
      'otc_request_created',
      { requestId, amount, mode },
      { severity: AuditSeverity.LOW, userId, resource: 'request', resourceId: requestId }
    ),

  transactionSigned: (requestId: string, txHash: string, walletUsed: string) =>
    logAuditEvent(
      AuditEventType.TX_PRESIGNED,
      'transaction_signed',
      { requestId, txHash, walletUsed },
      { severity: AuditSeverity.MEDIUM, resource: 'transaction', resourceId: txHash }
    ),

  transactionSubmitted: (txHash: string, requestId: string) =>
    logAuditEvent(
      AuditEventType.TX_SUBMITTED,
      'transaction_submitted',
      { txHash, requestId },
      { severity: AuditSeverity.MEDIUM, resource: 'transaction', resourceId: txHash }
    ),

  transactionConfirmed: (txHash: string, blockHeight: number, confirmations: number) =>
    logAuditEvent(
      AuditEventType.TX_CONFIRMED,
      'transaction_confirmed',
      { txHash, blockHeight, confirmations },
      { severity: AuditSeverity.LOW, resource: 'transaction', resourceId: txHash }
    ),
};