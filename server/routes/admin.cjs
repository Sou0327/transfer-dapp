// 管理者専用API ローカル実装
// 詳細情報取得・システム管理機能

const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth.cjs');

const router = express.Router();

// PostgreSQL クライアント
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false // Docker環境ではSSLを無効化
});

// 全ルートで認証を必要とする
router.use(authenticateToken);

// ダッシュボード統計
// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  console.log('=== 📊 Dashboard Stats ===');
  
  try {
    const client = await pool.connect();
    try {
      // 基本統計
      const statsQuery = `
        WITH request_stats AS (
          SELECT 
            COUNT(*) as total_requests,
            COUNT(*) FILTER (WHERE status = 'REQUESTED') as pending_requests,
            COUNT(*) FILTER (WHERE status = 'SIGNED') as signed_requests,
            COUNT(*) FILTER (WHERE status = 'SUBMITTED') as submitted_requests,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') as confirmed_requests,
            COUNT(*) FILTER (WHERE status = 'FAILED') as failed_requests,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_requests,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_requests
          FROM ada_requests
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        ),
        tx_stats AS (
          SELECT 
            COUNT(*) as total_txs,
            COUNT(*) FILTER (WHERE status = 'SUBMITTED') as submitted_txs,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') as confirmed_txs,
            COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE) as today_txs
          FROM ada_txs
          WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days'
        )
        SELECT * FROM request_stats, tx_stats;
      `;
      
      const statsResult = await client.query(statsQuery);
      const stats = statsResult.rows[0];
      
      // 最近のアクティビティ
      const activityQuery = `
        SELECT 
          'request_created' as activity_type,
          id as reference_id,
          status,
          created_at as activity_time
        FROM ada_requests
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'transaction_submitted' as activity_type,
          tx_hash as reference_id,
          status,
          submitted_at as activity_time
        FROM ada_txs
        WHERE submitted_at >= NOW() - INTERVAL '24 hours'
        
        ORDER BY activity_time DESC
        LIMIT 10;
      `;
      
      const activityResult = await client.query(activityQuery);
      
      console.log(`✅ Stats retrieved: ${stats.total_requests} total requests`);
      
      res.status(200).json({
        success: true,
        stats: {
          requests: {
            total: parseInt(stats.total_requests),
            pending: parseInt(stats.pending_requests),
            signed: parseInt(stats.signed_requests),
            submitted: parseInt(stats.submitted_requests),
            confirmed: parseInt(stats.confirmed_requests),
            failed: parseInt(stats.failed_requests),
            today: parseInt(stats.today_requests),
            week: parseInt(stats.week_requests)
          },
          transactions: {
            total: parseInt(stats.total_txs),
            submitted: parseInt(stats.submitted_txs),
            confirmed: parseInt(stats.confirmed_txs),
            today: parseInt(stats.today_txs)
          }
        },
        recentActivity: activityResult.rows
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// 個別リクエスト詳細
// GET /api/admin/requests/:id
router.get('/requests/:id', async (req, res) => {
  console.log('=== 🔍 Request Details ===');
  
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    try {
      // リクエスト詳細取得
      const requestQuery = `
        SELECT 
          r.*,
          a.email as created_by_email,
          COUNT(p.id) as presigned_count,
          COUNT(t.id) as transaction_count,
          MAX(p.signed_at) as last_signed_at,
          MAX(t.submitted_at) as last_submitted_at
        FROM ada_requests r
        LEFT JOIN admins a ON r.created_by = a.id
        LEFT JOIN ada_presigned p ON r.id = p.request_id
        LEFT JOIN ada_txs t ON r.id = t.request_id
        WHERE r.id = $1
        GROUP BY r.id, a.email;
      `;
      
      const requestResult = await client.query(requestQuery, [id]);
      
      if (requestResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Request not found'
        });
      }
      
      const request = requestResult.rows[0];
      
      // 事前署名データ取得
      const presignedQuery = `
        SELECT 
          id,
          provider_id,
          signed_at,
          LENGTH(tx_body_cbor) as tx_body_size,
          LENGTH(witness_cbor) as witness_size,
          selected_utxos
        FROM ada_presigned
        WHERE request_id = $1
        ORDER BY signed_at DESC;
      `;
      
      const presignedResult = await client.query(presignedQuery, [id]);
      
      // トランザクション履歴取得
      const transactionQuery = `
        SELECT *
        FROM ada_txs
        WHERE request_id = $1
        ORDER BY submitted_at DESC;
      `;
      
      const transactionResult = await client.query(transactionQuery, [id]);
      
      console.log(`✅ Request details retrieved: ${id}`);
      
      res.status(200).json({
        success: true,
        request: {
          ...request,
          ttl_absolute: new Date((request.ttl_slot + 1596059091) * 1000).toISOString()
        },
        presignedData: presignedResult.rows,
        transactions: transactionResult.rows
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Request details error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// システム健全性チェック
// GET /api/admin/system/health
router.get('/system/health', async (req, res) => {
  console.log('=== 🏥 System Health Check ===');
  
  try {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };
    
    // データベース接続チェック
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as current_time');
      client.release();
      
      health.checks.database = {
        status: 'healthy',
        responseTime: Date.now(),
        details: `Connected at ${result.rows[0].current_time}`
      };
    } catch (error) {
      health.checks.database = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }
    
    // Redis接続チェック (もしRedis使用中なら)
    // TODO: Redis健全性チェック実装
    
    // Blockfrost API チェック
    try {
      const blockfrostResponse = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/health', {
        headers: {
          'project_id': process.env.BLOCKFROST_API_KEY
        }
      });
      
      if (blockfrostResponse.ok) {
        health.checks.blockfrost = {
          status: 'healthy',
          details: 'API accessible'
        };
      } else {
        health.checks.blockfrost = {
          status: 'unhealthy',
          details: `HTTP ${blockfrostResponse.status}`
        };
        health.status = 'degraded';
      }
    } catch (error) {
      health.checks.blockfrost = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }
    
    // メモリ使用量チェック
    const memUsage = process.memoryUsage();
    health.checks.memory = {
      status: memUsage.heapUsed < 1024 * 1024 * 1024 ? 'healthy' : 'warning', // 1GB threshold
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    console.log(`✅ Health check completed: ${health.status}`);
    
    res.status(200).json(health);
    
  } catch (error) {
    console.error('💥 Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 監査ログ取得
// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  console.log('=== 📋 Audit Logs ===');
  
  try {
    const { page = 1, limit = 50, action, admin_id } = req.query;
    const offset = (page - 1) * limit;
    
    const client = await pool.connect();
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      
      if (action) {
        whereClause += ` AND action = $${params.length + 1}`;
        params.push(action);
      }
      
      if (admin_id) {
        whereClause += ` AND admin_id = $${params.length + 1}`;
        params.push(admin_id);
      }
      
      const query = `
        SELECT 
          l.*,
          a.email as admin_email
        FROM audit_logs l
        LEFT JOIN admins a ON l.admin_id = a.id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2};
      `;
      
      params.push(limit, offset);
      
      const result = await client.query(query, params);
      
      // 総数取得
      const countQuery = `
        SELECT COUNT(*) as total
        FROM audit_logs l
        ${whereClause};
      `;
      
      const countResult = await client.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);
      
      console.log(`✅ Audit logs retrieved: ${result.rows.length} entries`);
      
      res.status(200).json({
        success: true,
        logs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Audit logs error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// 期限切れリクエスト処理
// POST /api/admin/cleanup/expired
router.post('/cleanup/expired', async (req, res) => {
  console.log('=== 🗑️ Cleanup Expired Requests ===');
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 現在のCardanoスロット計算
      const currentTime = Math.floor(Date.now() / 1000);
      const currentSlot = currentTime - 1596059091;
      
      // 期限切れリクエストを EXPIRED にマーク
      const result = await client.query(`
        UPDATE ada_requests 
        SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
        WHERE ttl_slot < $1 AND status IN ('REQUESTED', 'SIGNED')
        RETURNING id;
      `, [currentSlot]);
      
      // 監査ログ
      await client.query(
        `INSERT INTO audit_logs (admin_id, action, details)
         VALUES ($1, $2, $3)`,
        [
          req.admin.adminId, 
          'CLEANUP_EXPIRED', 
          { expiredCount: result.rows.length, currentSlot }
        ]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Expired cleanup completed: ${result.rows.length} requests`);
      
      res.status(200).json({
        success: true,
        message: `${result.rows.length} 個のリクエストを期限切れとしてマークしました`,
        expiredRequests: result.rows.length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Cleanup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;