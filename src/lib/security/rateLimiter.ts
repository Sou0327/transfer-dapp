/**
 * Rate Limiting and Request Protection
 * Comprehensive rate limiting system for API protection and DDoS prevention
 */

import { logSecurityEvent } from './auditLog';

export interface RateLimitRule {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  blockDuration?: number; // Block duration after limit exceeded (ms)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  blocked?: boolean;
  blockExpiresAt?: number;
}

export interface RateLimitInfo {
  key: string;
  requests: number[];
  blocked: boolean;
  blockExpiresAt?: number;
  lastRequest: number;
}

/**
 * In-memory rate limit store
 */
class RateLimitStore {
  private store = new Map<string, RateLimitInfo>();
  private cleanupInterval: number | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, info] of this.store.entries()) {
      // Remove old request timestamps and check if entry is still relevant
      info.requests = info.requests.filter(timestamp => now - timestamp < 60 * 60 * 1000); // Keep last hour
      
      // Remove blocked entries that have expired
      if (info.blocked && info.blockExpiresAt && now > info.blockExpiresAt) {
        info.blocked = false;
        info.blockExpiresAt = undefined;
      }

      // Remove entries with no recent activity
      if (info.requests.length === 0 && !info.blocked && now - info.lastRequest > 60 * 60 * 1000) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.store.delete(key));
  }

  get(key: string): RateLimitInfo | undefined {
    return this.store.get(key);
  }

  set(key: string, info: RateLimitInfo): void {
    this.store.set(key, info);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getStats(): {
    totalKeys: number;
    blockedKeys: number;
    activeKeys: number;
  } {
    let blockedKeys = 0;
    let activeKeys = 0;
    const now = Date.now();

    for (const info of this.store.values()) {
      if (info.blocked) {
        blockedKeys++;
      }
      if (now - info.lastRequest < 60 * 1000) { // Active in last minute
        activeKeys++;
      }
    }

    return {
      totalKeys: this.store.size,
      blockedKeys,
      activeKeys
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Global rate limit store
 */
const rateLimitStore = new RateLimitStore();

/**
 * Default rate limit rules for different endpoints
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitRule> = {
  // General API endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    blockDuration: 5 * 60 * 1000 // 5 minutes
  },

  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    blockDuration: 30 * 60 * 1000, // 30 minutes
    skipSuccessfulRequests: false
  },

  // Request creation
  createRequest: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 3,
    blockDuration: 10 * 60 * 1000 // 10 minutes
  },

  // Transaction signing
  signTransaction: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    blockDuration: 5 * 60 * 1000 // 5 minutes
  },

  // Public endpoints (more permissive)
  public: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    blockDuration: 2 * 60 * 1000 // 2 minutes
  },

  // Admin endpoints (strict)
  admin: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    blockDuration: 15 * 60 * 1000 // 15 minutes
  }
};

/**
 * Check rate limit for a given identifier and rule
 */
export const checkRateLimit = (
  identifier: string,
  rule: RateLimitRule,
  endpoint?: string
): RateLimitResult => {
  const now = Date.now();
  const key = rule.keyGenerator ? rule.keyGenerator(identifier) : identifier;
  
  // Get or create rate limit info
  let info = rateLimitStore.get(key);
  if (!info) {
    info = {
      key,
      requests: [],
      blocked: false,
      lastRequest: now
    };
  }

  // Check if currently blocked
  if (info.blocked && info.blockExpiresAt && now < info.blockExpiresAt) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: info.blockExpiresAt,
      retryAfter: info.blockExpiresAt - now,
      blocked: true,
      blockExpiresAt: info.blockExpiresAt
    };
  }

  // Clear block if expired
  if (info.blocked && info.blockExpiresAt && now >= info.blockExpiresAt) {
    info.blocked = false;
    info.blockExpiresAt = undefined;
  }

  // Filter requests within the time window
  const windowStart = now - rule.windowMs;
  info.requests = info.requests.filter(timestamp => timestamp > windowStart);

  // Calculate remaining requests
  const currentRequests = info.requests.length;
  const remaining = Math.max(0, rule.maxRequests - currentRequests - 1);

  // Check if limit would be exceeded
  if (currentRequests >= rule.maxRequests) {
    // Block if blockDuration is specified
    if (rule.blockDuration) {
      info.blocked = true;
      info.blockExpiresAt = now + rule.blockDuration;
    }

    // Log rate limit exceeded
    logSecurityEvent.rateLimitExceeded(
      identifier,
      endpoint || 'unknown',
      currentRequests
    );

    // Update store
    info.lastRequest = now;
    rateLimitStore.set(key, info);

    return {
      allowed: false,
      remaining: 0,
      resetTime: windowStart + rule.windowMs,
      retryAfter: rule.blockDuration || rule.windowMs,
      blocked: info.blocked,
      blockExpiresAt: info.blockExpiresAt
    };
  }

  // Allow request - add timestamp
  info.requests.push(now);
  info.lastRequest = now;
  rateLimitStore.set(key, info);

  return {
    allowed: true,
    remaining,
    resetTime: windowStart + rule.windowMs
  };
};

/**
 * IP-based rate limiting
 */
export const checkIpRateLimit = (
  ipAddress: string,
  ruleName: keyof typeof DEFAULT_RATE_LIMITS = 'default',
  endpoint?: string
): RateLimitResult => {
  const rule = DEFAULT_RATE_LIMITS[ruleName];
  return checkRateLimit(ipAddress, rule, endpoint);
};

/**
 * User-based rate limiting
 */
export const checkUserRateLimit = (
  userId: string,
  ruleName: keyof typeof DEFAULT_RATE_LIMITS = 'default',
  endpoint?: string
): RateLimitResult => {
  const rule = DEFAULT_RATE_LIMITS[ruleName];
  const key = `user:${userId}`;
  return checkRateLimit(key, rule, endpoint);
};

/**
 * Session-based rate limiting
 */
export const checkSessionRateLimit = (
  sessionId: string,
  ruleName: keyof typeof DEFAULT_RATE_LIMITS = 'default',
  endpoint?: string
): RateLimitResult => {
  const rule = DEFAULT_RATE_LIMITS[ruleName];
  const key = `session:${sessionId}`;
  return checkRateLimit(key, rule, endpoint);
};

/**
 * Composite rate limiting (IP + User)
 */
export const checkCompositeRateLimit = (
  ipAddress: string,
  userId?: string,
  ruleName: keyof typeof DEFAULT_RATE_LIMITS = 'default',
  endpoint?: string
): {
  ip: RateLimitResult;
  user?: RateLimitResult;
  allowed: boolean;
} => {
  const ipResult = checkIpRateLimit(ipAddress, ruleName, endpoint);
  let userResult: RateLimitResult | undefined;

  if (userId) {
    userResult = checkUserRateLimit(userId, ruleName, endpoint);
  }

  const allowed = ipResult.allowed && (!userResult || userResult.allowed);

  return {
    ip: ipResult,
    user: userResult,
    allowed
  };
};

/**
 * Clear rate limit for identifier
 */
export const clearRateLimit = (identifier: string): boolean => {
  return rateLimitStore.delete(identifier);
};

/**
 * Block identifier immediately
 */
export const blockIdentifier = (
  identifier: string,
  durationMs: number,
  reason?: string
): void => {
  const now = Date.now();
  const key = identifier;
  
  let info = rateLimitStore.get(key);
  if (!info) {
    info = {
      key,
      requests: [],
      blocked: false,
      lastRequest: now
    };
  }

  info.blocked = true;
  info.blockExpiresAt = now + durationMs;
  info.lastRequest = now;

  rateLimitStore.set(key, info);

  // Log security event
  logSecurityEvent.suspiciousActivity(
    reason || 'Manually blocked identifier',
    identifier.startsWith('user:') ? undefined : identifier,
    { identifier, blockDuration: durationMs }
  );
};

/**
 * Unblock identifier
 */
export const unblockIdentifier = (identifier: string): boolean => {
  const info = rateLimitStore.get(identifier);
  if (!info) {
    return false;
  }

  info.blocked = false;
  info.blockExpiresAt = undefined;
  rateLimitStore.set(identifier, info);

  return true;
};

/**
 * Get rate limit status for identifier
 */
export const getRateLimitStatus = (identifier: string): {
  exists: boolean;
  blocked: boolean;
  requests: number;
  blockExpiresAt?: number;
  lastRequest?: number;
} => {
  const info = rateLimitStore.get(identifier);
  
  if (!info) {
    return {
      exists: false,
      blocked: false,
      requests: 0
    };
  }

  return {
    exists: true,
    blocked: info.blocked,
    requests: info.requests.length,
    blockExpiresAt: info.blockExpiresAt,
    lastRequest: info.lastRequest
  };
};

/**
 * Get rate limiter statistics
 */
export const getRateLimiterStats = (): {
  totalKeys: number;
  blockedKeys: number;
  activeKeys: number;
  topRequesters: Array<{ key: string; requests: number; blocked: boolean }>;
} => {
  const stats = rateLimitStore.getStats();
  
  // Get top requesters
  const topRequesters: Array<{ key: string; requests: number; blocked: boolean }> = [];
  for (const [key, info] of (rateLimitStore as any).store.entries()) {
    topRequesters.push({
      key,
      requests: info.requests.length,
      blocked: info.blocked
    });
  }
  
  // Sort by request count
  topRequesters.sort((a, b) => b.requests - a.requests);
  
  return {
    ...stats,
    topRequesters: topRequesters.slice(0, 10)
  };
};

/**
 * Adaptive rate limiting based on system load
 */
export class AdaptiveRateLimiter {
  private baseRule: RateLimitRule;
  private loadFactor: number = 1;
  private lastUpdate: number = Date.now();

  constructor(baseRule: RateLimitRule) {
    this.baseRule = { ...baseRule };
  }

  updateLoadFactor(cpuUsage: number, memoryUsage: number): void {
    // Calculate load factor based on system metrics
    const avgLoad = (cpuUsage + memoryUsage) / 2;
    
    if (avgLoad > 0.8) {
      this.loadFactor = 0.3; // Severely restrict
    } else if (avgLoad > 0.6) {
      this.loadFactor = 0.5; // Moderately restrict
    } else if (avgLoad > 0.4) {
      this.loadFactor = 0.7; // Slightly restrict
    } else {
      this.loadFactor = 1.0; // Normal operation
    }

    this.lastUpdate = Date.now();
  }

  getAdaptedRule(): RateLimitRule {
    return {
      ...this.baseRule,
      maxRequests: Math.floor(this.baseRule.maxRequests * this.loadFactor)
    };
  }

  checkRateLimit(identifier: string, endpoint?: string): RateLimitResult {
    const adaptedRule = this.getAdaptedRule();
    return checkRateLimit(identifier, adaptedRule, endpoint);
  }
}

/**
 * Cleanup rate limiter resources
 */
export const cleanup = (): void => {
  rateLimitStore.destroy();
};

/**
 * Initialize rate limiting system
 */
export const initializeRateLimiter = (): void => {
  console.log('✅ Rate limiter initialized with rules:', Object.keys(DEFAULT_RATE_LIMITS));
  
  // Setup periodic cleanup (handled by store constructor)
  
  // Log initialization
  logSecurityEvent.suspiciousActivity(
    'Rate limiter system initialized',
    undefined,
    { rules: Object.keys(DEFAULT_RATE_LIMITS) }
  );
};