/**
 * Data Integrity and Verification System
 * Cryptographic integrity verification for sensitive data and transactions
 */

import { Buffer } from 'buffer';
import { logAuditEvent, AuditEventType, AuditSeverity } from './auditLog';

// Buffer polyfill for browser
window.Buffer = Buffer;

export interface IntegrityMetadata {
  algorithm: 'sha256' | 'sha512';
  timestamp: number;
  version: string;
  salt?: string;
}

export interface IntegrityResult {
  isValid: boolean;
  hash?: string;
  metadata?: IntegrityMetadata;
  error?: string;
}

export interface SignedData<T = any> {
  data: T;
  signature: string;
  publicKey: string;
  timestamp: number;
  nonce: string;
}

export interface VerificationResult {
  isValid: boolean;
  signedAt?: number;
  signedBy?: string;
  error?: string;
}

/**
 * Generate cryptographic hash using Web Crypto API
 */
const generateHash = async (
  data: string | Uint8Array, 
  algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'
): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    
    let crypto: Crypto;
    if (typeof window !== 'undefined' && window.crypto) {
      crypto = window.crypto;
    } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      crypto = globalThis.crypto;
    } else {
      throw new Error('Web Crypto API not available');
    }

    const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    
    return Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Hash generation failed:', error);
    throw new Error('Failed to generate hash');
  }
};

/**
 * Generate integrity hash with metadata
 */
export const generateIntegrityHash = async (
  data: any,
  options: {
    algorithm?: 'sha256' | 'sha512';
    includeSalt?: boolean;
    version?: string;
  } = {}
): Promise<{ hash: string; metadata: IntegrityMetadata }> => {
  const {
    algorithm = 'sha256',
    includeSalt = true,
    version = '1.0'
  } = options;

  // Generate salt if requested
  let salt: string | undefined;
  if (includeSalt) {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Create metadata
  const metadata: IntegrityMetadata = {
    algorithm,
    timestamp: Date.now(),
    version,
    salt
  };

  // Serialize data with metadata
  const payload = JSON.stringify({
    data,
    metadata: { ...metadata, salt } // Include salt in hash calculation
  }, Object.keys({ data, metadata }).sort());

  // Generate hash
  const hashAlgorithm = algorithm === 'sha256' ? 'SHA-256' : 'SHA-512';
  const hash = await generateHash(payload, hashAlgorithm);

  return { hash, metadata };
};

/**
 * Verify data integrity
 */
export const verifyIntegrity = async (
  data: any,
  expectedHash: string,
  metadata: IntegrityMetadata
): Promise<IntegrityResult> => {
  try {
    // Recreate the payload with original metadata
    const payload = JSON.stringify({
      data,
      metadata
    }, Object.keys({ data, metadata }).sort());

    // Generate hash with same algorithm
    const hashAlgorithm = metadata.algorithm === 'sha256' ? 'SHA-256' : 'SHA-512';
    const calculatedHash = await generateHash(payload, hashAlgorithm);

    const isValid = calculatedHash === expectedHash;

    if (!isValid) {
      logAuditEvent(
        AuditEventType.DATA_CORRUPTION_DETECTED,
        'integrity_verification_failed',
        { 
          expectedHash: expectedHash.slice(0, 16) + '...',
          calculatedHash: calculatedHash.slice(0, 16) + '...',
          algorithm: metadata.algorithm
        },
        { severity: AuditSeverity.HIGH, outcome: 'failure' }
      );
    }

    return {
      isValid,
      hash: calculatedHash,
      metadata
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logAuditEvent(
      AuditEventType.SYSTEM_ERROR,
      'integrity_verification_error',
      { error: errorMessage },
      { severity: AuditSeverity.MEDIUM, outcome: 'failure' }
    );

    return {
      isValid: false,
      error: errorMessage
    };
  }
};

/**
 * Generate HMAC for message authentication
 */
export const generateHMAC = async (
  message: string,
  secret: string,
  algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'
): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: algorithm },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(message)
    );

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    throw new Error('HMAC generation failed');
  }
};

/**
 * Verify HMAC
 */
export const verifyHMAC = async (
  message: string,
  signature: string,
  secret: string,
  algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'
): Promise<boolean> => {
  try {
    const expectedSignature = await generateHMAC(message, secret, algorithm);
    return expectedSignature === signature;
  } catch (error) {
    return false;
  }
};

/**
 * Create a tamper-evident wrapper for sensitive data
 */
export const createTamperEvidentData = async <T>(
  data: T,
  secret?: string
): Promise<{
  data: T;
  integrity: {
    hash: string;
    metadata: IntegrityMetadata;
    hmac?: string;
  };
}> => {
  // Generate integrity hash
  const { hash, metadata } = await generateIntegrityHash(data, {
    algorithm: 'sha256',
    includeSalt: true
  });

  // Generate HMAC if secret provided
  let hmac: string | undefined;
  if (secret) {
    const payload = JSON.stringify({ data, hash, metadata });
    hmac = await generateHMAC(payload, secret);
  }

  return {
    data,
    integrity: {
      hash,
      metadata,
      hmac
    }
  };
};

/**
 * Verify tamper-evident data
 */
export const verifyTamperEvidentData = async <T>(
  wrapper: {
    data: T;
    integrity: {
      hash: string;
      metadata: IntegrityMetadata;
      hmac?: string;
    };
  },
  secret?: string
): Promise<IntegrityResult> => {
  try {
    // Verify integrity hash
    const integrityResult = await verifyIntegrity(
      wrapper.data,
      wrapper.integrity.hash,
      wrapper.integrity.metadata
    );

    if (!integrityResult.isValid) {
      return integrityResult;
    }

    // Verify HMAC if present
    if (wrapper.integrity.hmac && secret) {
      const payload = JSON.stringify({
        data: wrapper.data,
        hash: wrapper.integrity.hash,
        metadata: wrapper.integrity.metadata
      });

      const hmacValid = await verifyHMAC(
        payload,
        wrapper.integrity.hmac,
        secret
      );

      if (!hmacValid) {
        logAuditEvent(
          AuditEventType.DATA_CORRUPTION_DETECTED,
          'hmac_verification_failed',
          { hasHmac: !!wrapper.integrity.hmac },
          { severity: AuditSeverity.HIGH, outcome: 'failure' }
        );

        return {
          isValid: false,
          error: 'HMAC verification failed'
        };
      }
    }

    return integrityResult;
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
};

/**
 * Transaction integrity utilities
 */
export const transactionIntegrity = {
  /**
   * Verify Cardano transaction CBOR integrity
   */
  verifyCborIntegrity: async (cborHex: string): Promise<boolean> => {
    try {
      // Basic CBOR format validation
      if (!cborHex || typeof cborHex !== 'string') {
        return false;
      }

      // Must be valid hex
      if (!/^[0-9a-fA-F]+$/.test(cborHex)) {
        return false;
      }

      // Must be even length (valid hex pairs)
      if (cborHex.length % 2 !== 0) {
        return false;
      }

      // Try to parse as buffer
      const buffer = Buffer.from(cborHex, 'hex');
      
      // Basic CBOR validation - should start with valid CBOR major type
      if (buffer.length === 0) {
        return false;
      }

      // Additional validation could be added here using CBOR library
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Verify transaction witness integrity
   */
  verifyWitnessIntegrity: async (witnessSetCbor: string): Promise<boolean> => {
    try {
      if (!witnessSetCbor || typeof witnessSetCbor !== 'string') {
        return false;
      }

      // Basic hex validation
      if (!/^[0-9a-fA-F]+$/.test(witnessSetCbor)) {
        return false;
      }

      // Parse as buffer
      const buffer = Buffer.from(witnessSetCbor, 'hex');
      
      // Witness set should not be empty
      if (buffer.length === 0) {
        return false;
      }

      // More detailed validation would require CSL integration
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Create transaction integrity record
   */
  createTransactionRecord: async (
    txBodyCbor: string,
    witnessSetCbor: string,
    requestId: string
  ): Promise<{
    txBodyHash: string;
    witnessHash: string;
    combinedHash: string;
    metadata: IntegrityMetadata;
  }> => {
    // Generate individual hashes
    const txBodyHash = await generateHash(txBodyCbor);
    const witnessHash = await generateHash(witnessSetCbor);
    
    // Generate combined hash
    const combinedData = {
      txBodyCbor,
      witnessSetCbor,
      requestId,
      timestamp: Date.now()
    };
    
    const { hash: combinedHash, metadata } = await generateIntegrityHash(combinedData);

    return {
      txBodyHash,
      witnessHash,
      combinedHash,
      metadata
    };
  }
};

/**
 * Request integrity utilities
 */
export const requestIntegrity = {
  /**
   * Create secure request hash
   */
  createRequestHash: async (
    recipient: string,
    amount: any,
    mode: string,
    ttl: number
  ): Promise<{ hash: string; metadata: IntegrityMetadata }> => {
    const requestData = {
      recipient,
      amount,
      mode,
      ttl,
      created: Date.now()
    };

    return await generateIntegrityHash(requestData, {
      algorithm: 'sha256',
      includeSalt: true
    });
  },

  /**
   * Verify request hasn't been tampered with
   */
  verifyRequestIntegrity: async (
    recipient: string,
    amount: any,
    mode: string,
    ttl: number,
    expectedHash: string,
    metadata: IntegrityMetadata
  ): Promise<boolean> => {
    // Reconstruct original request data structure
    const originalCreated = metadata.timestamp;
    const requestData = {
      recipient,
      amount,
      mode,
      ttl,
      created: originalCreated
    };

    const result = await verifyIntegrity(requestData, expectedHash, metadata);
    return result.isValid;
  }
};

/**
 * System integrity monitoring
 */
export const systemIntegrity = {
  /**
   * Perform system integrity check
   */
  performIntegrityCheck: async (): Promise<{
    overall: boolean;
    checks: Record<string, boolean>;
    timestamp: number;
  }> => {
    const checks: Record<string, boolean> = {};
    let overall = true;

    try {
      // Check crypto availability
      checks.cryptoApi = typeof crypto !== 'undefined' && 
                        typeof crypto.subtle !== 'undefined';
      
      // Check hash function
      try {
        await generateHash('test');
        checks.hashFunction = true;
      } catch {
        checks.hashFunction = false;
      }

      // Check HMAC function
      try {
        await generateHMAC('test', 'secret');
        checks.hmacFunction = true;
      } catch {
        checks.hmacFunction = false;
      }

      // Check random number generation
      try {
        crypto.getRandomValues(new Uint8Array(16));
        checks.randomGeneration = true;
      } catch {
        checks.randomGeneration = false;
      }

      // Overall status
      overall = Object.values(checks).every(check => check);

      // Log integrity check result
      logAuditEvent(
        AuditEventType.SYSTEM_STARTUP,
        'system_integrity_check',
        { checks, overall },
        { 
          severity: overall ? AuditSeverity.LOW : AuditSeverity.HIGH,
          outcome: overall ? 'success' : 'failure'
        }
      );

    } catch (error) {
      overall = false;
      logAuditEvent(
        AuditEventType.SYSTEM_ERROR,
        'integrity_check_failed',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        { severity: AuditSeverity.CRITICAL, outcome: 'failure' }
      );
    }

    return {
      overall,
      checks,
      timestamp: Date.now()
    };
  }
};

/**
 * Initialize integrity system
 */
export const initializeIntegritySystem = async (): Promise<boolean> => {
  try {
    const integrityCheck = await systemIntegrity.performIntegrityCheck();
    
    if (!integrityCheck.overall) {
      console.error('❌ System integrity check failed:', integrityCheck.checks);
      return false;
    }

    console.log('✅ System integrity check passed');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize integrity system:', error);
    return false;
  }
};