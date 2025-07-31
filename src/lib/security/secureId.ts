/**
 * Secure ID Generation
 * Cryptographically secure random ID generation for requests and tokens
 */

import { Buffer } from 'buffer';

// Buffer polyfill for browser
window.Buffer = Buffer;

export interface SecureIdOptions {
  length?: number;
  prefix?: string;
  includeTimestamp?: boolean;
  encoding?: 'hex' | 'base58' | 'base64url';
}

export interface SecureIdValidation {
  isValid: boolean;
  reason?: string;
  metadata?: {
    timestamp?: number;
    prefix?: string;
  };
}

/**
 * Generate cryptographically secure random bytes
 */
const getSecureRandomBytes = (length: number): Uint8Array => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Browser environment
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return array;
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    // Node.js 19+ or other environments with Web Crypto API
    const array = new Uint8Array(length);
    globalThis.crypto.getRandomValues(array);
    return array;
  } else {
    // Fallback for Node.js environments without Web Crypto API
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require('crypto');
      return new Uint8Array(crypto.randomBytes(length));
    } catch {
      throw new Error('No secure random number generator available');
    }
  }
};

/**
 * Base58 encoding (Bitcoin-style)
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const encodeBase58 = (buffer: Uint8Array): string => {
  if (buffer.length === 0) return '';
  
  const digits = [0];
  
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  
  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    leadingZeros++;
  }
  
  return '1'.repeat(leadingZeros) + digits.reverse().map(d => BASE58_ALPHABET[d]).join('');
};

/**
 * Base64URL encoding (RFC 4648)
 */
const encodeBase64Url = (buffer: Uint8Array): string => {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Generate a cryptographically secure request ID
 */
export const generateSecureRequestId = (options: SecureIdOptions = {}): string => {
  const {
    length = 32,
    prefix = 'req',
    includeTimestamp = true,
    encoding = 'base58'
  } = options;

  // Generate random bytes
  const randomBytes = getSecureRandomBytes(length);
  
  // Optionally include timestamp (8 bytes)
  let finalBytes: Uint8Array;
  if (includeTimestamp) {
    const timestamp = Date.now();
    const timestampBytes = new Uint8Array(8);
    const view = new DataView(timestampBytes.buffer);
    view.setBigUint64(0, BigInt(timestamp), false); // Big-endian
    
    finalBytes = new Uint8Array(randomBytes.length + timestampBytes.length);
    finalBytes.set(timestampBytes, 0);
    finalBytes.set(randomBytes, timestampBytes.length);
  } else {
    finalBytes = randomBytes;
  }

  // Encode based on specified encoding
  let encoded: string;
  switch (encoding) {
    case 'hex':
      encoded = Buffer.from(finalBytes).toString('hex');
      break;
    case 'base58':
      encoded = encodeBase58(finalBytes);
      break;
    case 'base64url':
      encoded = encodeBase64Url(finalBytes);
      break;
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }

  return prefix ? `${prefix}_${encoded}` : encoded;
};

/**
 * Generate secure session token
 */
export const generateSessionToken = (): string => {
  return generateSecureRequestId({
    length: 48,
    prefix: 'sess',
    includeTimestamp: false,
    encoding: 'base64url'
  });
};

/**
 * Generate secure API key
 */
export const generateApiKey = (): string => {
  return generateSecureRequestId({
    length: 64,
    prefix: 'sk',
    includeTimestamp: false,
    encoding: 'base64url'
  });
};

/**
 * Generate secure webhook token
 */
export const generateWebhookToken = (): string => {
  return generateSecureRequestId({
    length: 32,
    prefix: 'whk',
    includeTimestamp: false,
    encoding: 'hex'
  });
};

/**
 * Generate secure nonce for CSRF protection
 */
export const generateCsrfToken = (): string => {
  return generateSecureRequestId({
    length: 24,
    prefix: 'csrf',
    includeTimestamp: true,
    encoding: 'base64url'
  });
};

/**
 * Validate secure ID format and extract metadata
 */
export const validateSecureId = (id: string, expectedPrefix?: string): SecureIdValidation => {
  try {
    // Check basic format
    if (!id || typeof id !== 'string') {
      return { isValid: false, reason: 'Invalid ID format' };
    }

    // Extract prefix if present
    const parts = id.split('_');
    if (parts.length < 2) {
      return { isValid: false, reason: 'Missing prefix' };
    }

    const [prefix, encodedPart] = parts;
    
    // Validate expected prefix
    if (expectedPrefix && prefix !== expectedPrefix) {
      return { isValid: false, reason: `Expected prefix '${expectedPrefix}', got '${prefix}'` };
    }

    // Basic length validation
    if (encodedPart.length < 16) {
      return { isValid: false, reason: 'ID too short' };
    }

    // Try to decode to validate format
    let decodedBytes: Uint8Array;
    try {
      if (encodedPart.match(/^[0-9a-f]+$/i)) {
        // Hex encoding
        decodedBytes = new Uint8Array(Buffer.from(encodedPart, 'hex'));
      } else if (encodedPart.match(/^[A-Za-z0-9_-]+$/)) {
        // Base64URL encoding
        const base64 = encodedPart.replace(/-/g, '+').replace(/_/g, '/');
        const padding = base64.length % 4;
        const paddedBase64 = base64 + '='.repeat(padding ? 4 - padding : 0);
        decodedBytes = new Uint8Array(Buffer.from(paddedBase64, 'base64'));
      } else if (encodedPart.match(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/)) {
        // Base58 encoding - basic validation only
        decodedBytes = new Uint8Array(32); // Assume valid for now
      } else {
        return { isValid: false, reason: 'Invalid encoding format' };
      }
    } catch {
      return { isValid: false, reason: 'Failed to decode ID' };
    }

    // Extract timestamp if present (first 8 bytes)
    let timestamp: number | undefined;
    if (decodedBytes.length >= 8) {
      try {
        const view = new DataView(decodedBytes.buffer, 0, 8);
        const timestampBigInt = view.getBigUint64(0, false);
        timestamp = Number(timestampBigInt);
        
        // Validate timestamp is reasonable (within last 10 years and not future)
        const now = Date.now();
        const tenYearsAgo = now - (10 * 365 * 24 * 60 * 60 * 1000);
        if (timestamp < tenYearsAgo || timestamp > now + (24 * 60 * 60 * 1000)) {
          return { isValid: false, reason: 'Invalid timestamp' };
        }
      } catch {
        // Timestamp extraction failed, but ID might still be valid
      }
    }

    return {
      isValid: true,
      metadata: {
        timestamp,
        prefix
      }
    };

  } catch {
    return { isValid: false, reason: 'Validation error' };
  }
};

/**
 * Check if ID has expired based on TTL
 */
export const isIdExpired = (id: string, ttlMinutes: number): boolean => {
  const validation = validateSecureId(id);
  
  if (!validation.isValid || !validation.metadata?.timestamp) {
    return true; // Consider invalid or non-timestamped IDs as expired
  }

  const now = Date.now();
  const expirationTime = validation.metadata.timestamp + (ttlMinutes * 60 * 1000);
  
  return now > expirationTime;
};

/**
 * Generate time-limited secure token
 */
export const generateTimeLimitedToken = (prefix: string, ttlMinutes: number = 60): string => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const token = generateSecureRequestId({
    length: 32,
    prefix,
    includeTimestamp: true,
    encoding: 'base64url'
  });

  return token;
};

/**
 * Validate time-limited token
 */
export const validateTimeLimitedToken = (
  token: string, 
  expectedPrefix: string, 
  ttlMinutes: number = 60
): boolean => {
  const validation = validateSecureId(token, expectedPrefix);
  
  if (!validation.isValid) {
    return false;
  }

  return !isIdExpired(token, ttlMinutes);
};

/**
 * Security constants
 */
export const SECURITY_CONSTANTS = {
  REQUEST_ID_LENGTH: 32,
  SESSION_TOKEN_LENGTH: 48,
  API_KEY_LENGTH: 64,
  CSRF_TOKEN_TTL_MINUTES: 60,
  SESSION_TOKEN_TTL_MINUTES: 24 * 60, // 24 hours
  REQUEST_TTL_MINUTES: 30,
  WEBHOOK_TOKEN_LENGTH: 32,
} as const;