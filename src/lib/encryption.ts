/**
 * Encryption Utilities for Pre-Signed Data
 * Handles secure storage of witness sets and transaction bodies
 */
import { createHash, randomBytes, createCipher, createDecipher, pbkdf2Sync } from 'crypto';

interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  algorithm: string;
  keyDerivation: string;
  iterations: number;
}

interface EncryptionOptions {
  algorithm?: string;
  keyLength?: number;
  iterations?: number;
}

// Default encryption settings
const DEFAULT_OPTIONS: Required<EncryptionOptions> = {
  algorithm: 'aes-256-cbc',
  keyLength: 32,
  iterations: 100000
};

/**
 * Generate a secure encryption key from password and salt
 */
function deriveKey(password: string, salt: Buffer, keyLength: number, iterations: number): Buffer {
  return pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
}

/**
 * Encrypt sensitive data (witness sets, transaction bodies)
 */
export function encryptSensitiveData(
  data: string,
  password: string,
  options: EncryptionOptions = {}
): EncryptedData {
  try {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // Generate random salt and IV
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    
    // Derive encryption key
    const key = deriveKey(password, salt, opts.keyLength, opts.iterations);
    
    // Create cipher
    const cipher = createCipher(opts.algorithm, key.toString('hex'));
    cipher.setIV(iv);
    
    // Encrypt data
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      algorithm: opts.algorithm,
      keyDerivation: 'pbkdf2',
      iterations: opts.iterations
    };
    
  } catch (error) {
    throw new Error(`Encryption failed: ${error}`);
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptSensitiveData(
  encryptedData: EncryptedData,
  password: string
): string {
  try {
    const { encrypted, iv, salt, algorithm, iterations } = encryptedData;
    
    // Convert hex strings back to buffers
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    
    // Derive same key
    const key = deriveKey(password, saltBuffer, 32, iterations);
    
    // Create decipher
    const decipher = createDecipher(algorithm, key.toString('hex'));
    decipher.setIV(ivBuffer);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    
  } catch (error) {
    throw new Error(`Decryption failed: ${error}`);
  }
}

/**
 * Generate secure password for encryption
 */
export function generateEncryptionPassword(
  requestId: string,
  masterSecret?: string
): string {
  const secret = masterSecret || process.env.ENCRYPTION_MASTER_KEY || 'default-key-change-in-production';
  
  // Combine request ID with master secret
  const combined = `${requestId}:${secret}:${Date.now()}`;
  
  // Generate secure hash
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Encrypt pre-signed transaction data
 */
export function encryptPreSignedData(data: {
  txBodyHex: string;
  witnessSetHex: string;
  requestId: string;
  metadata?: any;
}): {
  encryptedTxBody: string;
  encryptedWitnessSet: string;
  encryptionMeta: string;
} {
  try {
    // Generate encryption password from request ID
    const password = generateEncryptionPassword(data.requestId);
    
    // Encrypt transaction body
    const encryptedTxBodyData = encryptSensitiveData(data.txBodyHex, password);
    
    // Encrypt witness set
    const encryptedWitnessData = encryptSensitiveData(data.witnessSetHex, password);
    
    // Create encryption metadata (without sensitive data)
    const encryptionMeta = {
      algorithm: encryptedTxBodyData.algorithm,
      keyDerivation: encryptedTxBodyData.keyDerivation,
      iterations: encryptedTxBodyData.iterations,
      txBodySalt: encryptedTxBodyData.salt,
      txBodyIv: encryptedTxBodyData.iv,
      witnessSalt: encryptedWitnessData.salt,
      witnessIv: encryptedWitnessData.iv,
      encryptedAt: new Date().toISOString(),
      metadata: data.metadata || {}
    };
    
    return {
      encryptedTxBody: encryptedTxBodyData.encrypted,
      encryptedWitnessSet: encryptedWitnessData.encrypted,
      encryptionMeta: JSON.stringify(encryptionMeta)
    };
    
  } catch (error) {
    throw new Error(`Pre-signed data encryption failed: ${error}`);
  }
}

/**
 * Decrypt pre-signed transaction data
 */
export function decryptPreSignedData(
  encryptedTxBody: string,
  encryptedWitnessSet: string,
  encryptionMeta: string,
  requestId: string
): {
  txBodyHex: string;
  witnessSetHex: string;
  metadata?: any;
} {
  try {
    // Parse encryption metadata
    const meta = JSON.parse(encryptionMeta);
    
    // Generate same password
    const password = generateEncryptionPassword(requestId);
    
    // Reconstruct encrypted data objects
    const txBodyData: EncryptedData = {
      encrypted: encryptedTxBody,
      iv: meta.txBodyIv,
      salt: meta.txBodySalt,
      algorithm: meta.algorithm,
      keyDerivation: meta.keyDerivation,
      iterations: meta.iterations
    };
    
    const witnessData: EncryptedData = {
      encrypted: encryptedWitnessSet,
      iv: meta.witnessIv,
      salt: meta.witnessSalt,
      algorithm: meta.algorithm,
      keyDerivation: meta.keyDerivation,
      iterations: meta.iterations
    };
    
    // Decrypt data
    const txBodyHex = decryptSensitiveData(txBodyData, password);
    const witnessSetHex = decryptSensitiveData(witnessData, password);
    
    return {
      txBodyHex,
      witnessSetHex,
      metadata: meta.metadata
    };
    
  } catch (error) {
    throw new Error(`Pre-signed data decryption failed: ${error}`);
  }
}

/**
 * Generate integrity hash for pre-signed data
 */
export function generateIntegrityHash(data: {
  requestId: string;
  txHash: string;
  encryptedTxBody: string;
  encryptedWitnessSet: string;
}): string {
  const combined = `${data.requestId}:${data.txHash}:${data.encryptedTxBody}:${data.encryptedWitnessSet}`;
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Verify integrity of pre-signed data
 */
export function verifyIntegrityHash(
  data: {
    requestId: string;
    txHash: string;
    encryptedTxBody: string;
    encryptedWitnessSet: string;
  },
  expectedHash: string
): boolean {
  try {
    const calculatedHash = generateIntegrityHash(data);
    return calculatedHash === expectedHash;
  } catch (error) {
    console.error('Integrity verification failed:', error);
    return false;
  }
}

/**
 * Secure deletion of sensitive data from memory
 */
export function secureClearString(str: string): void {
  try {
    // In JavaScript, we can't truly overwrite memory, but we can at least 
    // encourage garbage collection and make it harder to recover
    if (typeof str === 'string' && str.length > 0) {
      // Create a new string of the same length filled with random data
      const randomData = randomBytes(str.length).toString('hex').substring(0, str.length);
      // This doesn't actually overwrite the original string in memory,
      // but it's a best-effort attempt
      str = randomData;
    }
  } catch (error) {
    // Ignore errors in secure clear
  }
}

/**
 * Key rotation utilities for long-term storage
 */
export function rotateEncryptionKey(
  oldEncryptedData: EncryptedData,
  oldPassword: string,
  newPassword: string
): EncryptedData {
  try {
    // Decrypt with old password
    const plaintext = decryptSensitiveData(oldEncryptedData, oldPassword);
    
    // Re-encrypt with new password
    const newEncryptedData = encryptSensitiveData(plaintext, newPassword);
    
    // Clear plaintext from memory
    secureClearString(plaintext);
    
    return newEncryptedData;
    
  } catch (error) {
    throw new Error(`Key rotation failed: ${error}`);
  }
}

/**
 * Validate encryption parameters
 */
export function validateEncryptionData(data: EncryptedData): boolean {
  try {
    // Check required fields
    if (!data.encrypted || !data.iv || !data.salt || !data.algorithm) {
      return false;
    }
    
    // Check hex format
    if (!/^[a-fA-F0-9]+$/.test(data.encrypted) || 
        !/^[a-fA-F0-9]+$/.test(data.iv) || 
        !/^[a-fA-F0-9]+$/.test(data.salt)) {
      return false;
    }
    
    // Check algorithm
    if (!['aes-256-cbc', 'aes-256-gcm'].includes(data.algorithm)) {
      return false;
    }
    
    // Check iterations
    if (data.iterations < 10000) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    return false;
  }
}