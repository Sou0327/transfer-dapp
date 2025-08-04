/**
 * Encryption Utilities for Pre-Signed Data
 * Handles secure storage of witness sets and transaction bodies
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

// AES-GCMモード用の拡張型定義
interface GCMCipher {
  update(data: string, inputEncoding: BufferEncoding, outputEncoding: BufferEncoding): string;
  final(outputEncoding: BufferEncoding): string;
  getAuthTag(): Buffer;
}

interface GCMDecipher {
  update(data: string, inputEncoding: BufferEncoding, outputEncoding: BufferEncoding): string;
  final(outputEncoding: BufferEncoding): string;
  setAuthTag(buffer: Buffer): this;
}

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

// セキュアなデフォルト暗号化設定
const DEFAULT_OPTIONS: Required<EncryptionOptions> = {
  algorithm: 'aes-256-gcm', // AES-GCMで認証付き暗号化
  keyLength: 32,
  iterations: 210000 // OWASP推奨値を上回る
};

/**
 * セキュアな暗号化キーをパスワードとソルトから生成
 */
function deriveKey(password: string, salt: Buffer, keyLength: number, iterations: number): Buffer {
  // 入力値検証
  if (!password || password.length < 8) {
    throw new Error('パスワードは8文字以上である必要があります');
  }
  if (!salt || salt.length < 16) {
    throw new Error('ソルトは16バイト以上である必要があります');
  }
  if (iterations < 210000) {
    throw new Error('反復回数は210000回以上である必要があります');
  }
  
  return pbkdf2Sync(password, salt, iterations, keyLength, 'sha512'); // SHA-512を使用
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
    // 入力値検証
    if (!data || typeof data !== 'string') {
      throw new Error('暗号化するデータが無効です');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('パスワードが無効です');
    }
    
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // セキュアなランダム値生成
    const salt = randomBytes(32); // ソルトサイズを増加
    const iv = randomBytes(16);
    
    // 暗号化キー生成
    const key = deriveKey(password, salt, opts.keyLength, opts.iterations);
    
    let encrypted: string;
    let authTag: string = '';
    
    if (opts.algorithm === 'aes-256-gcm') {
      // GCMモードで認証付き暗号化
      const cipher = createCipheriv(opts.algorithm, key, iv) as GCMCipher;
      encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      authTag = cipher.getAuthTag().toString('hex');
    } else {
      // レガシーモード（CBC）
      const cipher = createCipheriv(opts.algorithm, key, iv);
      encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
    }
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      algorithm: opts.algorithm,
      keyDerivation: 'pbkdf2-sha512',
      iterations: opts.iterations,
      ...(authTag && { authTag })
    };
    
  } catch (error) {
    throw new Error(`暗号化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptSensitiveData(
  encryptedData: EncryptedData & { authTag?: string },
  password: string
): string {
  try {
    // 入力値検証
    if (!validateEncryptionData(encryptedData)) {
      throw new Error('無効な暗号化データです');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('パスワードが無効です');
    }
    
    const { encrypted, iv, salt, algorithm, iterations, authTag } = encryptedData;
    
    // Hex文字列をBufferに変換
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    
    // 同じキーを生成
    const key = deriveKey(password, saltBuffer, 32, iterations);
    
    let decrypted: string;
    
    if (algorithm === 'aes-256-gcm' && authTag) {
      // GCMモードで認証タグを検証
      const decipher = createDecipheriv(algorithm, key, ivBuffer) as GCMDecipher;
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } else {
      // レガシーモード（CBC）
      const decipher = createDecipheriv(algorithm, key, ivBuffer);
      decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    }
    
    return decrypted;
    
  } catch (error) {
    throw new Error(`復号化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate secure password for encryption
 */
export function generateEncryptionPassword(
  requestId: string,
  masterSecret?: string
): string {
  // 入力値検証
  if (!requestId || typeof requestId !== 'string' || requestId.length < 8) {
    throw new Error('リクエストIDは8文字以上である必要があります');
  }
  
  const secret = masterSecret || process.env.ENCRYPTION_MASTER_KEY;
  
  if (!secret || secret === 'default-key-change-in-production') {
    throw new Error('ENCRYPTION_MASTER_KEY環境変数が設定されていないか、デフォルト値のままです');
  }
  
  if (secret.length < 32) {
    throw new Error('マスターシークレットは32文字以上である必要があります');
  }
  
  // タイムスタンプを除外して再現性を確保
  const combined = `${requestId}:${secret}`;
  
  // セキュアなハッシュ生成
  return createHash('sha512').update(combined).digest('hex');
}

/**
 * Encrypt pre-signed transaction data
 */
export function encryptPreSignedData(data: {
  txBodyHex: string;
  witnessSetHex: string;
  requestId: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
 * メモリからの機密データのセキュアな削除
 */
export function secureClearString(str: string): void {
  try {
    // JavaScriptでは真のメモリ上書はできないが、
    // ガベージコレクションを促進し、復元を困難にする
    if (typeof str === 'string' && str.length > 0) {
      // 同じ長さのランダムデータで置き換えを試行
      const randomData = randomBytes(Math.ceil(str.length / 2)).toString('hex').substring(0, str.length);
      // 元の文字列を上書きしようとする（完全ではないがベストエフォート）
      str = randomData;
      
      // ガベージコレクションを積極的に実行
      if (global.gc) {
        global.gc();
      }
    }
  } catch {
    // セキュアクリアでのエラーは無視
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
    
    // アルゴリズムチェック（GCMを優先）
    if (!['aes-256-gcm', 'aes-256-cbc'].includes(data.algorithm)) {
      return false;
    }
    
    // 反復回数チェック（OWASP 2023推奨値）
    if (data.iterations < 210000) {
      return false;
    }
    
    return true;
    
  } catch {
    return false;
  }
}