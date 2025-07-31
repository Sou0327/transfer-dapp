/**
 * Database Connection and Query Utilities for OTC System
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { OTCRequest, TransactionData, AdminSession, RequestStatus } from '../types/otc/index.js';

// Singleton database pool
let pool: Pool | null = null;
let redisClient: RedisClientType | null = null;

/**
 * セキュアなデータベース設定
 */
export const dbConfig = {
  connectionString: (() => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || dbUrl.includes('user:password') || dbUrl.includes('localhost')) {
      throw new Error('DATABASE_URL環境変数が設定されていないか、デフォルト値のままです');
    }
    return dbUrl;
  })(),
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: true, // SSL証明書を管理する
    ca: process.env.DB_CA_CERT, // CA証明書を設定
  } : false,
  max: 20, // プール内の最大クライアント数
  idleTimeoutMillis: 30000, // 30秒後にアイドルクライアントをクローズ
  connectionTimeoutMillis: 2000, // 2秒でタイムアウト
  statement_timeout: 30000, // 30秒でSQLタイムアウト
  query_timeout: 30000, // 30秒でクエリタイムアウト
};

/**
 * セキュアなRedis設定
 */
export const redisConfig = {
  url: (() => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.includes('localhost')) {
      console.warn('REDIS_URLが設定されていないため、Redisキャッシュが無効です');
      return undefined;
    }
    return redisUrl;
  })(),
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) return false; // 10回後に停止
      return Math.min(retries * 50, 1000);
    },
    connectTimeout: 5000, // 5秒でタイムアウト
    commandTimeout: 5000, // 5秒でコマンドタイムアウト
  },
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
};

/**
 * Initialize database pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(dbConfig);
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
    
    pool.on('connect', () => {
      console.log('📦 PostgreSQL client connected');
    });
  }
  
  return pool;
}

/**
 * セキュアなRedisクライアント初期化
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisConfig.url) {
    throw new Error('Redis URLが設定されていません');
  }

  if (!redisClient) {
    redisClient = createClient(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
      // エラー時にクライアントをリセット
      redisClient = null;
    });
    
    redisClient.on('connect', () => {
      console.log('🔴 Redis client connected');
    });

    redisClient.on('disconnect', () => {
      console.log('🔴 Redis client disconnected');
    });
    
    try {
      await redisClient.connect();
    } catch (error) {
      console.error('Redis connection failed:', error);
      redisClient = null;
      throw error;
    }
  }
  
  return redisClient;
}

/**
 * セキュアなデータベースクエリ実行関数
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> {
  // SQLインジェクション対策のための入力検証
  if (!text || typeof text !== 'string') {
    throw new Error('無効なSQLクエリです');
  }

  // 危険なSQLキーワードの検知
  const dangerousPatterns = [
    /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\s+/i,
    /\bUNION\s+SELECT\b/i,
    /--[^\r\n]*$/m,
    /\/\*.*?\*\//s,
    /\bxp_cmdshell\b/i,
    /\bsp_executesql\b/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(text)) {
      throw new Error('潜在的に危険なSQLパターンが検出されました');
    }
  }

  // パラメータ化クエリの強制（$nプレースホルダーのチェック）
  const hasPlaceholders = /\$\d+/.test(text);
  const hasParams = params && params.length > 0;
  
  if (hasParams !== hasPlaceholders) {
    throw new Error('パラメータとプレースホルダーの数が一致しません');
  }

  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query<T>(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', { 
      error: error instanceof Error ? error.message : String(error),
      query: text.substring(0, 100) + '...', // クエリの一部をログ出力
      paramCount: params?.length || 0
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Database Access Objects (DAOs)
 */

export class RequestDAO {
  /**
   * Create a new OTC request
   */
  static async create(data: Omit<OTCRequest, 'id' | 'created_at' | 'updated_at'>): Promise<OTCRequest> {
    // Import secure ID generation
    const { generateSecureRequestId } = await import('./security/secureId');
    
    // Generate custom request ID
    const requestId = generateSecureRequestId({
      length: 32,
      prefix: 'req',
      includeTimestamp: true,
      encoding: 'base58'
    });

    const result = await query<OTCRequest>(`
      INSERT INTO ada_requests (
        id, currency, amount_mode, amount_or_rule_json, recipient, 
        ttl_slot, status, created_by
      ) VALUES (security/secureId, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      requestId,
      data.currency,
      data.amount_mode,
      data.amount_or_rule_json,
      data.recipient,
      data.ttl_slot,
      data.status,
      data.created_by
    ]);
    
    return result.rows[0];
  }
  
  /**
   * Get request by ID
   */
  static async findById(id: string): Promise<OTCRequest | null> {
    const result = await query<OTCRequest>(`
      SELECT * FROM ada_requests WHERE id = security/secureId
    `, [id]);
    
    return result.rows[0] || null;
  }

  /**
   * Get request by ID (alias for consistency)
   */
  static async getById(id: string): Promise<OTCRequest | null> {
    return this.findById(id);
  }
  
  /**
   * Update request status
   */
  static async updateStatus(id: string, status: RequestStatus): Promise<boolean> {
    const result = await query(`
      UPDATE ada_requests 
      SET status = security/secureId, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [status, id]);
    
    return (result.rowCount ?? 0) > 0;
  }
  
  /**
   * Get requests by admin
   */
  static async findByAdmin(adminId: string, limit = 50, offset = 0): Promise<OTCRequest[]> {
    const result = await query<OTCRequest>(`
      SELECT * FROM ada_requests 
      WHERE created_by = security/secureId 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [adminId, limit, offset]);
    
    return result.rows;
  }
  
  /**
   * Get requests with expired TTL
   */
  static async findExpired(currentSlot: number): Promise<OTCRequest[]> {
    const result = await query<OTCRequest>(`
      SELECT * FROM ada_requests 
      WHERE ttl_slot < security/secureId AND status IN ('REQUESTED', 'SIGNED')
    `, [currentSlot]);
    
    return result.rows;
  }
}

export class PreSignedDAO {
  /**
   * Create pre-signed data with encryption
   */
  static async create(data: {
    request_id: string;
    tx_body_hex: string;
    witness_set_hex: string;
    tx_hash: string;
    fee_lovelace: string;
    ttl_slot: number;
    wallet_used: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    // Import encryption utilities dynamically to avoid circular dependencies
    const { encryptPreSignedData, generateIntegrityHash } = await import('./encryption');
    
    // Encrypt sensitive data
    const encryptedData = encryptPreSignedData({
      txBodyHex: data.tx_body_hex,
      witnessSetHex: data.witness_set_hex,
      requestId: data.request_id,
      metadata: data.metadata
    });

    // Generate integrity hash
    const integrityHash = generateIntegrityHash({
      requestId: data.request_id,
      txHash: data.tx_hash,
      encryptedTxBody: encryptedData.encryptedTxBody,
      encryptedWitnessSet: encryptedData.encryptedWitnessSet
    });

    // Assemble complete signed transaction hex
    const { assembleSignedTransaction } = await import('./signingUtils');
    let signedTxHex = '';
    try {
      signedTxHex = assembleSignedTransaction(data.tx_body_hex, data.witness_set_hex);
    } catch (error) {
      console.warn('Failed to assemble signed transaction:', error);
    }

    const result = await query<{ id: string }>(`
      INSERT INTO ada_presigned (
        request_id, tx_hash, tx_body_encrypted, witness_set_encrypted, 
        encryption_meta, integrity_hash, fee_lovelace, ttl_slot, 
        wallet_used, signed_tx_hex, metadata
      ) VALUES (security/secureId, $2, $3, $4, $5, $6, $7, $8, $9, security/secureId0, security/secureId1)
      RETURNING id
    `, [
      data.request_id,
      data.tx_hash,
      encryptedData.encryptedTxBody,
      encryptedData.encryptedWitnessSet,
      encryptedData.encryptionMeta,
      integrityHash,
      data.fee_lovelace,
      data.ttl_slot,
      data.wallet_used,
      signedTxHex,
      JSON.stringify(data.metadata || {})
    ]);
    
    return result.rows[0].id;
  }
  
  /**
   * Get pre-signed data by request ID (metadata only)
   */
  static async getByRequestId(requestId: string): Promise<Record<string, unknown> | null> {
    const result = await query(`
      SELECT 
        id, request_id, tx_hash, fee_lovelace, ttl_slot, 
        wallet_used, signed_at, metadata,
        (tx_body_encrypted IS NOT NULL) as has_tx_body,
        (witness_set_encrypted IS NOT NULL) as has_witness_data
      FROM ada_presigned 
      WHERE request_id = security/secureId
    `, [requestId]);
    
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      request_id: row.request_id,
      tx_hash: row.tx_hash,
      fee_lovelace: row.fee_lovelace,
      ttl_slot: row.ttl_slot,
      wallet_used: row.wallet_used,
      signed_at: row.signed_at,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : (row.metadata || {}),
      has_tx_body: row.has_tx_body,
      has_witness_data: row.has_witness_data
    };
  }

  /**
   * Get complete pre-signed data with decryption (admin only)
   */
  static async getCompleteData(requestId: string): Promise<Record<string, unknown> | null> {
    const result = await query(`
      SELECT * FROM ada_presigned WHERE request_id = security/secureId
    `, [requestId]);
    
    const row = result.rows[0];
    if (!row) return null;

    try {
      // Import decryption utilities
      const { decryptPreSignedData, verifyIntegrityHash } = await import('./encryption');

      // Verify integrity first
      const integrityValid = verifyIntegrityHash({
        requestId: row.request_id as string,
        txHash: row.tx_hash as string,
        encryptedTxBody: row.tx_body_encrypted as string,
        encryptedWitnessSet: row.witness_set_encrypted as string
      }, row.integrity_hash as string);

      if (!integrityValid) {
        throw new Error('Data integrity check failed');
      }

      // Decrypt sensitive data
      const decryptedData = decryptPreSignedData(
        row.tx_body_encrypted as string,
        row.witness_set_encrypted as string,
        row.encryption_meta as string,
        row.request_id as string
      ) as { txBodyHex: string; witnessSetHex: string };

      return {
        id: row.id,
        request_id: row.request_id,
        tx_body_hex: decryptedData.txBodyHex,
        witness_set_hex: decryptedData.witnessSetHex,
        tx_hash: row.tx_hash,
        fee_lovelace: row.fee_lovelace,
        ttl_slot: row.ttl_slot,
        wallet_used: row.wallet_used,
        signed_at: row.signed_at,
        signed_tx_hex: row.signed_tx_hex,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      };

    } catch (error) {
      console.error('Failed to decrypt pre-signed data:', error);
      throw new Error('Failed to decrypt pre-signed data');
    }
  }

  /**
   * Delete pre-signed data
   */
  static async delete(requestId: string): Promise<boolean> {
    const result = await query(`
      DELETE FROM ada_presigned WHERE request_id = security/secureId
    `, [requestId]);
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update metadata
   */
  static async updateMetadata(requestId: string, metadata: Record<string, unknown>): Promise<boolean> {
    const result = await query(`
      UPDATE ada_presigned 
      SET metadata = security/secureId, updated_at = CURRENT_TIMESTAMP 
      WHERE request_id = $2
    `, [JSON.stringify(metadata), requestId]);
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check data integrity
   */
  static async checkIntegrity(requestId: string): Promise<{
    healthy: boolean;
    checks: Record<string, unknown>;
    issues?: string[];
  }> {
    try {
      const result = await query(`
        SELECT 
          request_id, tx_hash, tx_body_encrypted, witness_set_encrypted,
          encryption_meta, integrity_hash, signed_at
        FROM ada_presigned 
        WHERE request_id = security/secureId
      `, [requestId]);
      
      const row = result.rows[0];
      if (!row) {
        return {
          healthy: false,
          checks: { exists: false },
          issues: ['Pre-signed data not found']
        };
      }

      const checks: Record<string, boolean | unknown> = {
        exists: true,
        has_tx_body: !!row.tx_body_encrypted,
        has_witness_set: !!row.witness_set_encrypted,
        has_encryption_meta: !!row.encryption_meta,
        has_integrity_hash: !!row.integrity_hash
      };

      const issues: string[] = [];

      // Check integrity hash
      if (row.integrity_hash) {
        try {
          const { verifyIntegrityHash } = await import('./encryption');
          checks.integrity_valid = verifyIntegrityHash({
            requestId: row.request_id as string,
            txHash: row.tx_hash as string,
            encryptedTxBody: row.tx_body_encrypted as string,
            encryptedWitnessSet: row.witness_set_encrypted as string
          }, row.integrity_hash as string);

          if (!checks.integrity_valid) {
            issues.push('Integrity hash verification failed');
          }
        } catch (error) {
          checks.integrity_valid = false;
          issues.push('Integrity check error: ' + (error as Error).message);
        }
      }

      // Check encryption metadata
      if (row.encryption_meta) {
        try {
          const meta = JSON.parse(row.encryption_meta as string);
          checks.encryption_meta_valid = !!(meta.algorithm && meta.keyDerivation);
          if (!checks.encryption_meta_valid) {
            issues.push('Invalid encryption metadata');
          }
        } catch (error) {
          checks.encryption_meta_valid = false;
          issues.push('Encryption metadata parse error: ' + (error as Error).message);
        }
      }

      // Check if data can be decrypted (without actually decrypting)
      checks.decryptable = checks.has_tx_body && 
                          checks.has_witness_set && 
                          checks.has_encryption_meta &&
                          checks.encryption_meta_valid;

      const healthy = Boolean(checks.exists) && 
                     Boolean(checks.has_tx_body) && 
                     Boolean(checks.has_witness_set) && 
                     Boolean(checks.encryption_meta_valid) && 
                     (checks.integrity_valid !== false);

      return {
        healthy,
        checks,
        issues: issues.length > 0 ? issues : undefined
      };

    } catch (error) {
      return {
        healthy: false,
        checks: { error: true },
        issues: ['Health check failed: ' + (error as Error).message]
      };
    }
  }

  /**
   * Get pre-signed data by status for monitoring
   */
  static async getByStatus(status: string, limit = 100): Promise<Record<string, unknown>[]> {
    const result = await query(`
      SELECT 
        p.id, p.request_id, p.tx_hash, p.fee_lovelace, 
        p.ttl_slot, p.wallet_used, p.signed_at,
        r.status as request_status, r.amount_mode
      FROM ada_presigned p
      JOIN ada_requests r ON p.request_id = r.id
      WHERE r.status = security/secureId
      ORDER BY p.signed_at DESC
      LIMIT $2
    `, [status, limit]);

    return result.rows;
  }

  /**
   * Get expiring pre-signed data (approaching TTL)
   */
  static async getExpiring(currentSlot: number, bufferSlots = 300): Promise<Record<string, unknown>[]> {
    const result = await query(`
      SELECT 
        p.id, p.request_id, p.tx_hash, p.ttl_slot,
        r.status, r.amount_mode, r.recipient
      FROM ada_presigned p
      JOIN ada_requests r ON p.request_id = r.id
      WHERE p.ttl_slot BETWEEN security/secureId AND $2
        AND r.status = 'SIGNED'
      ORDER BY p.ttl_slot ASC
    `, [currentSlot, currentSlot + bufferSlots]);

    return result.rows;
  }
}

export class TransactionDAO {
  /**
   * Create transaction record
   */
  static async create(data: {
    request_id: string;
    tx_hash: string;
    tx_body_hex?: string;
    witness_set_hex?: string;
    fee_lovelace?: string;
    submission_mode?: 'server' | 'wallet';
    submitted_at?: Date;
    status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
    fail_reason?: string;
  }): Promise<TransactionData> {
    const result = await query<TransactionData>(`
      INSERT INTO ada_txs (
        request_id, tx_hash, tx_body_hex, witness_set_hex, fee_lovelace, 
        submission_mode, submitted_at, status, fail_reason
      )
      VALUES (security/secureId, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      data.request_id,
      data.tx_hash,
      data.tx_body_hex || null,
      data.witness_set_hex || null,
      data.fee_lovelace || null,
      data.submission_mode || 'server',
      data.submitted_at || new Date(),
      data.status,
      data.fail_reason || null
    ]);
    
    return result.rows[0];
  }
  
  /**
   * Update transaction status
   */
  static async updateStatus(
    id: string, 
    status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED',
    failReason?: string
  ): Promise<boolean> {
    const result = await query(`
      UPDATE ada_txs 
      SET status = security/secureId, 
          confirmed_at = CASE WHEN security/secureId = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
          fail_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id, failReason || null]);
    
    return (result.rowCount ?? 0) > 0;
  }
  
  /**
   * Update transaction status by transaction hash
   */
  static async updateStatusByHash(
    txHash: string, 
    status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED',
    failReason?: string
  ): Promise<boolean> {
    const result = await query(`
      UPDATE ada_txs 
      SET status = security/secureId, 
          confirmed_at = CASE WHEN security/secureId = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
          fail_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE tx_hash = $2
    `, [status, txHash, failReason || null]);
    
    return (result.rowCount ?? 0) > 0;
  }
  
  /**
   * Find transaction by hash
   */
  static async findByHash(txHash: string): Promise<TransactionData | null> {
    const result = await query<TransactionData>(`
      SELECT * FROM ada_txs WHERE tx_hash = security/secureId
    `, [txHash]);
    
    return result.rows[0] || null;
  }

  /**
   * Find transaction by request ID
   */
  static async getByRequestId(requestId: string): Promise<TransactionData | null> {
    const result = await query<TransactionData>(`
      SELECT * FROM ada_txs WHERE request_id = security/secureId ORDER BY submitted_at DESC LIMIT 1
    `, [requestId]);
    
    return result.rows[0] || null;
  }

  /**
   * Get recent transactions
   */
  static async getRecent(limit = 10): Promise<TransactionData[]> {
    const result = await query<TransactionData>(`
      SELECT 
        t.*,
        r.amount_mode,
        r.recipient,
        r.currency
      FROM ada_txs t
      LEFT JOIN ada_requests r ON t.request_id = r.id
      ORDER BY t.submitted_at DESC 
      LIMIT security/secureId
    `, [limit]);
    
    return result.rows;
  }

  /**
   * Get transactions by status
   */
  static async getByStatus(status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED', limit = 50): Promise<TransactionData[]> {
    const result = await query<TransactionData>(`
      SELECT 
        t.*,
        r.amount_mode,
        r.recipient,
        r.currency
      FROM ada_txs t
      LEFT JOIN ada_requests r ON t.request_id = r.id
      WHERE t.status = security/secureId
      ORDER BY t.submitted_at DESC 
      LIMIT $2
    `, [status, limit]);
    
    return result.rows;
  }

  /**
   * Get pending transactions (submitted but not confirmed)
   */
  static async getPending(): Promise<TransactionData[]> {
    const result = await query<TransactionData>(`
      SELECT 
        t.*,
        r.amount_mode,
        r.recipient,
        r.currency
      FROM ada_txs t
      LEFT JOIN ada_requests r ON t.request_id = r.id
      WHERE t.status = 'SUBMITTED'
      ORDER BY t.submitted_at ASC
    `);
    
    return result.rows;
  }

  /**
   * Get failed transactions that might need retry
   */
  static async getRetryable(hoursBack = 24): Promise<TransactionData[]> {
    // 入力値検証
    if (hoursBack < 1 || hoursBack > 168) { // 1時間から168時間（1週間）まで
      throw new Error('無効な時間範囲です');
    }

    const result = await query<TransactionData>(`
      SELECT 
        t.*,
        r.amount_mode,
        r.recipient,
        r.currency,
        r.status as request_status
      FROM ada_txs t
      LEFT JOIN ada_requests r ON t.request_id = r.id
      WHERE t.status = 'FAILED' 
        AND t.submitted_at > NOW() - INTERVAL 'security/secureId hours'
        AND r.status = 'SIGNED'
      ORDER BY t.submitted_at DESC
    `, [hoursBack]);
    
    return result.rows;
  }

  /**
   * Get transaction statistics
   */
  static async getStats(hoursBack = 24): Promise<{
    total: number;
    submitted: number;
    confirmed: number;
    failed: number;
    success_rate: number;
  }> {
    // 入力値検証
    if (hoursBack < 1 || hoursBack > 168) { // 1時間から168時間（1週間）まで
      throw new Error('無効な時間範囲です');
    }

    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
      FROM ada_txs 
      WHERE submitted_at > NOW() - INTERVAL 'security/secureId hours'
    `, [hoursBack]);
    
    const row = result.rows[0];
    const total = parseInt(row.total as string);
    const confirmed = parseInt(row.confirmed as string);
    const success_rate = total > 0 ? (confirmed / total) * 100 : 0;

    return {
      total,
      submitted: parseInt(row.submitted as string),
      confirmed,
      failed: parseInt(row.failed as string),
      success_rate: Math.round(success_rate * 100) / 100
    };
  }

  /**
   * Delete transaction record (admin only)
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query(`
      DELETE FROM ada_txs WHERE id = security/secureId
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get transactions with details for monitoring
   */
  static async getMonitoringData(): Promise<Record<string, unknown>[]> {
    const result = await query(`
      SELECT 
        t.id,
        t.request_id,
        t.tx_hash,
        t.status,
        t.submission_mode,
        t.submitted_at,
        t.confirmed_at,
        t.fail_reason,
        r.amount_mode,
        r.recipient,
        r.currency,
        r.status as request_status,
        p.ttl_slot,
        p.fee_lovelace
      FROM ada_txs t
      LEFT JOIN ada_requests r ON t.request_id = r.id
      LEFT JOIN ada_presigned p ON t.request_id = p.request_id
      ORDER BY t.submitted_at DESC
      LIMIT 100
    `);
    
    return result.rows;
  }
}

export class AuditDAO {
  /**
   * Log admin action
   */
  static async logAction(
    adminId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await query(`
      INSERT INTO audit_logs (
        admin_id, action, resource_type, resource_id, 
        details, ip_address, user_agent
      ) VALUES (security/secureId, $2, $3, $4, $5, $6, $7)
    `, [adminId, action, resourceType, resourceId, details, ipAddress, userAgent]);
  }

  /**
   * Generic log method (compatible with API routes)
   */
  static async log(data: {
    event_type: string;
    user_id: string;
    resource_type?: string;
    resource_id?: string;
    details?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await query(`
      INSERT INTO audit_logs (
        admin_id, event_type, resource_type, resource_id, 
        details, ip_address, user_agent
      ) VALUES (security/secureId, $2, $3, $4, $5, $6, $7)
    `, [
      data.user_id,
      data.event_type,
      data.resource_type,
      data.resource_id,
      JSON.stringify(data.details || {}),
      data.ip_address,
      data.user_agent
    ]);
  }

  /**
   * Get audit logs with filters (セキュアなフィルタリング付き)
   */
  static async getFilteredLogs(filters: {
    adminId?: string;
    eventType?: string;
    resourceType?: string;
    resourceId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]> {
    // 入力値検証とサニタイゼーション
    const limit = Math.min(Math.max(filters.limit || 100, 1), 1000); // 1-1000の範囲
    const offset = Math.max(filters.offset || 0, 0);

    if (filters.adminId && (typeof filters.adminId !== 'string' || filters.adminId.length > 100)) {
      throw new Error('無効なadminIdです');
    }

    if (filters.eventType && (typeof filters.eventType !== 'string' || filters.eventType.length > 50)) {
      throw new Error('無効なeventTypeです');
    }

    if (filters.resourceType && (typeof filters.resourceType !== 'string' || filters.resourceType.length > 50)) {
      throw new Error('無効なresourceTypeです');
    }

    if (filters.resourceId && (typeof filters.resourceId !== 'string' || filters.resourceId.length > 100)) {
      throw new Error('無効なresourceIdです');
    }

    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (filters.adminId) {
      conditions.push(`admin_id = $${paramIndex}`);
      params.push(filters.adminId);
      paramIndex++;
    }

    if (filters.eventType) {
      conditions.push(`(action = $${paramIndex} OR event_type = $${paramIndex})`);
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(filters.resourceType);
      paramIndex++;
    }

    if (filters.resourceId) {
      conditions.push(`resource_id = $${paramIndex}`);
      params.push(filters.resourceId);
      paramIndex++;
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.fromDate);
      paramIndex++;
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.toDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // LIMITとOFFSETをパラメータ化
    params.push(limit, offset);

    const result = await query(`
      SELECT 
        id, admin_id, action, event_type, resource_type, resource_id,
        details, ip_address, user_agent, created_at
      FROM audit_logs 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    return result.rows;
  }
}

export class SessionDAO {
  /**
   * Create admin session
   */
  static async create(
    adminId: string,
    sessionToken: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await query(`
      INSERT INTO admin_sessions (admin_id, session_token, expires_at, ip_address, user_agent)
      VALUES (security/secureId, $2, $3, $4, $5)
    `, [adminId, sessionToken, expiresAt, ipAddress, userAgent]);
  }
  
  /**
   * Find session by token
   */
  static async findByToken(sessionToken: string): Promise<AdminSession | null> {
    const result = await query<{
      id: string;
      admin_id: string;
      email: string;
      created_at: Date;
      ip_address: string;
      user_agent: string;
    }>(`
      SELECT s.*, a.email 
      FROM admin_sessions s
      JOIN admins a ON s.admin_id = a.id
      WHERE s.session_token = security/secureId AND s.expires_at > CURRENT_TIMESTAMP
    `, [sessionToken]);
    
    const row = result.rows[0];
    if (!row) return null;
    
    return {
      id: row.id,
      adminId: row.admin_id,
      email: row.email,
      loginTime: row.created_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
  
  /**
   * Delete session (logout)
   */
  static async delete(sessionToken: string): Promise<boolean> {
    const result = await query(`
      DELETE FROM admin_sessions WHERE session_token = security/secureId
    `, [sessionToken]);
    
    return (result.rowCount ?? 0) > 0;
  }
  
  /**
   * Clean expired sessions
   */
  static async cleanExpired(): Promise<number> {
    const result = await query(`
      DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP
    `);
    
    return result.rowCount ?? 0;
  }
}

/**
 * Cache utilities using Redis
 */
export class CacheService {
  private static redis: RedisClientType;
  
  static async init(): Promise<void> {
    this.redis = await getRedisClient();
  }
  
  /**
   * Set cache with TTL
   */
  static async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!this.redis) await this.init();
    const stringValue = JSON.stringify(value ?? {});
    await this.redis.setEx(key, ttlSeconds, stringValue);
  }
  
  /**
   * Get cached value
   */
  static async get<T = Record<string, unknown>>(key: string): Promise<T | null> {
    if (!this.redis) await this.init();
    const value = await this.redis.get(key);
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  
  /**
   * Delete cache key
   */
  static async del(key: string): Promise<boolean> {
    if (!this.redis) await this.init();
    return (await this.redis.del(key)) > 0;
  }
  
  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    if (!this.redis) await this.init();
    return (await this.redis.exists(key)) > 0;
  }
}

/**
 * Graceful shutdown
 */
export async function closeConnections(): Promise<void> {
  console.log('🔄 Closing database connections...');
  
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('🔴 Redis connection closed');
  }
  
  if (pool) {
    await pool.end();
    pool = null;
    console.log('📦 PostgreSQL pool closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', closeConnections);
process.on('SIGTERM', closeConnections);