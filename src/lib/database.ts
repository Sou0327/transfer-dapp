/**
 * Database Connection and Query Utilities for OTC System
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { OTCRequest, PreSignedData, TransactionData, AdminSession, RequestStatus } from '../types/otc/index.js';

// Singleton database pool
let pool: Pool | null = null;
let redisClient: RedisClientType | null = null;

/**
 * Database configuration
 */
export const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/otc_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error if connection takes longer than 2 seconds
};

/**
 * Redis configuration
 */
export const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => Math.min(retries * 50, 1000),
  },
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
 * Initialize Redis client
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    
    redisClient.on('connect', () => {
      console.log('🔴 Redis client connected');
    });
    
    await redisClient.connect();
  }
  
  return redisClient;
}

/**
 * Execute a database query with connection pooling
 */
export async function query<T = any>(
  text: string, 
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query<T>(text, params);
    return result;
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
    const result = await query<OTCRequest>(`
      INSERT INTO ada_requests (
        currency, amount_mode, amount_or_rule_json, recipient, 
        ttl_slot, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
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
      SELECT * FROM ada_requests WHERE id = $1
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
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [status, id]);
    
    return result.rowCount > 0;
  }
  
  /**
   * Get requests by admin
   */
  static async findByAdmin(adminId: string, limit = 50, offset = 0): Promise<OTCRequest[]> {
    const result = await query<OTCRequest>(`
      SELECT * FROM ada_requests 
      WHERE created_by = $1 
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
      WHERE ttl_slot < $1 AND status IN ('REQUESTED', 'SIGNED')
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
    metadata?: any;
  }): Promise<string> {
    // Import encryption utilities dynamically to avoid circular dependencies
    const { encryptPreSignedData, generateIntegrityHash } = await import('./encryption.js');
    
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
    const { assembleSignedTransaction } = await import('./signingUtils.js');
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  static async getByRequestId(requestId: string): Promise<any | null> {
    const result = await query(`
      SELECT 
        id, request_id, tx_hash, fee_lovelace, ttl_slot, 
        wallet_used, signed_at, metadata,
        (tx_body_encrypted IS NOT NULL) as has_tx_body,
        (witness_set_encrypted IS NOT NULL) as has_witness_data
      FROM ada_presigned 
      WHERE request_id = $1
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
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      has_tx_body: row.has_tx_body,
      has_witness_data: row.has_witness_data
    };
  }

  /**
   * Get complete pre-signed data with decryption (admin only)
   */
  static async getCompleteData(requestId: string): Promise<any | null> {
    const result = await query(`
      SELECT * FROM ada_presigned WHERE request_id = $1
    `, [requestId]);
    
    const row = result.rows[0];
    if (!row) return null;

    try {
      // Import decryption utilities
      const { decryptPreSignedData, verifyIntegrityHash } = await import('./encryption.js');

      // Verify integrity first
      const integrityValid = verifyIntegrityHash({
        requestId: row.request_id,
        txHash: row.tx_hash,
        encryptedTxBody: row.tx_body_encrypted,
        encryptedWitnessSet: row.witness_set_encrypted
      }, row.integrity_hash);

      if (!integrityValid) {
        throw new Error('Data integrity check failed');
      }

      // Decrypt sensitive data
      const decryptedData = decryptPreSignedData(
        row.tx_body_encrypted,
        row.witness_set_encrypted,
        row.encryption_meta,
        row.request_id
      );

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
      DELETE FROM ada_presigned WHERE request_id = $1
    `, [requestId]);
    
    return result.rowCount > 0;
  }

  /**
   * Update metadata
   */
  static async updateMetadata(requestId: string, metadata: any): Promise<boolean> {
    const result = await query(`
      UPDATE ada_presigned 
      SET metadata = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE request_id = $2
    `, [JSON.stringify(metadata), requestId]);
    
    return result.rowCount > 0;
  }

  /**
   * Check data integrity
   */
  static async checkIntegrity(requestId: string): Promise<{
    healthy: boolean;
    checks: any;
    issues?: string[];
  }> {
    try {
      const result = await query(`
        SELECT 
          request_id, tx_hash, tx_body_encrypted, witness_set_encrypted,
          encryption_meta, integrity_hash, signed_at
        FROM ada_presigned 
        WHERE request_id = $1
      `, [requestId]);
      
      const row = result.rows[0];
      if (!row) {
        return {
          healthy: false,
          checks: { exists: false },
          issues: ['Pre-signed data not found']
        };
      }

      const checks: any = {
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
          const { verifyIntegrityHash } = await import('./encryption.js');
          checks.integrity_valid = verifyIntegrityHash({
            requestId: row.request_id,
            txHash: row.tx_hash,
            encryptedTxBody: row.tx_body_encrypted,
            encryptedWitnessSet: row.witness_set_encrypted
          }, row.integrity_hash);

          if (!checks.integrity_valid) {
            issues.push('Integrity hash verification failed');
          }
        } catch (error) {
          checks.integrity_valid = false;
          issues.push('Integrity check error: ' + error.message);
        }
      }

      // Check encryption metadata
      if (row.encryption_meta) {
        try {
          const meta = JSON.parse(row.encryption_meta);
          checks.encryption_meta_valid = !!(meta.algorithm && meta.keyDerivation);
          if (!checks.encryption_meta_valid) {
            issues.push('Invalid encryption metadata');
          }
        } catch (error) {
          checks.encryption_meta_valid = false;
          issues.push('Encryption metadata parse error');
        }
      }

      // Check if data can be decrypted (without actually decrypting)
      checks.decryptable = checks.has_tx_body && 
                          checks.has_witness_set && 
                          checks.has_encryption_meta &&
                          checks.encryption_meta_valid;

      const healthy = checks.exists && 
                     checks.has_tx_body && 
                     checks.has_witness_set && 
                     checks.encryption_meta_valid && 
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
        issues: ['Health check failed: ' + error.message]
      };
    }
  }

  /**
   * Get pre-signed data by status for monitoring
   */
  static async getByStatus(status: string, limit = 100): Promise<any[]> {
    const result = await query(`
      SELECT 
        p.id, p.request_id, p.tx_hash, p.fee_lovelace, 
        p.ttl_slot, p.wallet_used, p.signed_at,
        r.status as request_status, r.amount_mode
      FROM ada_presigned p
      JOIN ada_requests r ON p.request_id = r.id
      WHERE r.status = $1
      ORDER BY p.signed_at DESC
      LIMIT $2
    `, [status, limit]);

    return result.rows;
  }

  /**
   * Get expiring pre-signed data (approaching TTL)
   */
  static async getExpiring(currentSlot: number, bufferSlots = 300): Promise<any[]> {
    const result = await query(`
      SELECT 
        p.id, p.request_id, p.tx_hash, p.ttl_slot,
        r.status, r.amount_mode, r.recipient
      FROM ada_presigned p
      JOIN ada_requests r ON p.request_id = r.id
      WHERE p.ttl_slot BETWEEN $1 AND $2
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      SET status = $1, 
          confirmed_at = CASE WHEN $1 = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
          fail_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id, failReason || null]);
    
    return result.rowCount > 0;
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
      SET status = $1, 
          confirmed_at = CASE WHEN $1 = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
          fail_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE tx_hash = $2
    `, [status, txHash, failReason || null]);
    
    return result.rowCount > 0;
  }
  
  /**
   * Find transaction by hash
   */
  static async findByHash(txHash: string): Promise<TransactionData | null> {
    const result = await query<TransactionData>(`
      SELECT * FROM ada_txs WHERE tx_hash = $1
    `, [txHash]);
    
    return result.rows[0] || null;
  }

  /**
   * Find transaction by request ID
   */
  static async getByRequestId(requestId: string): Promise<TransactionData | null> {
    const result = await query<TransactionData>(`
      SELECT * FROM ada_txs WHERE request_id = $1 ORDER BY submitted_at DESC LIMIT 1
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
      LIMIT $1
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
      WHERE t.status = $1
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
        AND t.submitted_at > NOW() - INTERVAL '${hoursBack} hours'
        AND r.status = 'SIGNED'
      ORDER BY t.submitted_at DESC
    `);
    
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
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
      FROM ada_txs 
      WHERE submitted_at > NOW() - INTERVAL '${hoursBack} hours'
    `);
    
    const row = result.rows[0];
    const total = parseInt(row.total);
    const confirmed = parseInt(row.confirmed);
    const success_rate = total > 0 ? (confirmed / total) * 100 : 0;

    return {
      total,
      submitted: parseInt(row.submitted),
      confirmed,
      failed: parseInt(row.failed),
      success_rate: Math.round(success_rate * 100) / 100
    };
  }

  /**
   * Delete transaction record (admin only)
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query(`
      DELETE FROM ada_txs WHERE id = $1
    `, [id]);
    
    return result.rowCount > 0;
  }

  /**
   * Get transactions with details for monitoring
   */
  static async getMonitoringData(): Promise<any[]> {
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
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await query(`
      INSERT INTO audit_logs (
        admin_id, action, resource_type, resource_id, 
        details, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    details?: any;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await query(`
      INSERT INTO audit_logs (
        admin_id, event_type, resource_type, resource_id, 
        details, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
   * Get audit logs with filters
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
  }): Promise<any[]> {
    let whereClause = '';
    const params: any[] = [];
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

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const result = await query(`
      SELECT 
        id, admin_id, action, event_type, resource_type, resource_id,
        details, ip_address, user_agent, created_at
      FROM audit_logs 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

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
      VALUES ($1, $2, $3, $4, $5)
    `, [adminId, sessionToken, expiresAt, ipAddress, userAgent]);
  }
  
  /**
   * Find session by token
   */
  static async findByToken(sessionToken: string): Promise<AdminSession | null> {
    const result = await query<AdminSession & { expires_at: Date }>(`
      SELECT s.*, a.email 
      FROM admin_sessions s
      JOIN admins a ON s.admin_id = a.id
      WHERE s.session_token = $1 AND s.expires_at > CURRENT_TIMESTAMP
    `, [sessionToken]);
    
    const row = result.rows[0];
    if (!row) return null;
    
    return {
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
      DELETE FROM admin_sessions WHERE session_token = $1
    `, [sessionToken]);
    
    return result.rowCount > 0;
  }
  
  /**
   * Clean expired sessions
   */
  static async cleanExpired(): Promise<number> {
    const result = await query(`
      DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP
    `);
    
    return result.rowCount;
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
  static async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    if (!this.redis) await this.init();
    await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
  }
  
  /**
   * Get cached value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    if (!this.redis) await this.init();
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
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