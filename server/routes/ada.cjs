// ADA OTC取引 ローカルAPI ルーター
// Vercel本番環境と同一のワークフロー実装

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 🔐 改善された接続管理
const connectionManager = require('../utils/connection-manager.cjs');

const router = express.Router();

// 🔐 JWT認証ミドルウェア
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // デバッグ情報
  console.log('🔐 Auth Header:', authHeader ? 'Present' : 'Missing');
  console.log('🔐 Token extracted:', token ? token.substring(0, 20) + '...' : 'None');
  console.log('🔐 JWT_SECRET configured:', process.env.JWT_SECRET ? 'Yes' : 'No');

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ JWT decoded successfully:', { adminId: decoded.adminId, email: decoded.email, role: decoded.role });
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    console.error('❌ Token that failed:', token);
    return res.status(403).json({ 
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};

// 🔐 管理者権限チェックミドルウェア
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin privileges required',
      code: 'INSUFFICIENT_PRIVILEGES'
    });
  }
  next();
};

// 🔐 リクエスト所有者または管理者チェック
const requireOwnershipOrAdmin = (req, res, next) => {
  const requestId = req.params.requestId || req.body.requestId;
  
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  // 管理者は全てアクセス可能
  if (req.user.role === 'admin') {
    return next();
  }
  
  // 一般ユーザーは自分のリクエストのみアクセス可能
  if (req.user.requestId === requestId) {
    return next();
  }
  
  return res.status(403).json({ 
    error: 'Access denied',
    code: 'ACCESS_DENIED'
  });
};

// Redis接続はconnectionManagerで管理


// Socket.io通知送信 (req.app.locals経由でブロードキャスト関数を取得)
const sendWebSocketNotification = (data, req = null) => {
  try {
    if (req && req.app && req.app.locals && req.app.locals.broadcastWebSocket) {
      // 管理者にのみ通知を送信
      req.app.locals.broadcastWebSocket(data.type, data, { requireAdmin: true });
      console.log(`📡 Socket.io notification sent: ${data.type}`);
    } else {
      console.warn('⚠️ Socket.io broadcast function not available');
    }
  } catch (error) {
    console.error('❌ Failed to send Socket.io notification:', error);
  }
};

// 🔐 セキュアな暗号化ユーティリティ (AES-256-GCM)
const encryptData = (data) => {
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    
    // キーを32バイトに調整
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // IV:authTag:encrypted の形式で返す
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('❌ Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
};

const decryptData = (encryptedData) => {
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('❌ Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
};

// 1. OTC取引リクエスト作成
// POST /api/ada/requests
router.post('/requests', authenticateToken, requireAdmin, async (req, res) => {
  console.log('=== 🔥 Create OTC Request (Local) ===');
  
  try {
    const { currency, amount_mode, amount_or_rule, recipient, ttl_minutes = 10 } = req.body;

    // 🛡️ 入力検証の強化
    if (!currency || typeof currency !== 'string' || currency.trim().length === 0) {
      return res.status(400).json({
        error: '通貨種別は必須です',
        code: 'INVALID_CURRENCY'
      });
    }

    if (!amount_mode || !['fixed', 'sweep', 'rate_based'].includes(amount_mode)) {
      return res.status(400).json({
        error: '金額モードは fixed, sweep, rate_based のいずれかを指定してください',
        code: 'INVALID_AMOUNT_MODE'
      });
    }

    if (!amount_or_rule || (typeof amount_or_rule !== 'string' && typeof amount_or_rule !== 'object')) {
      return res.status(400).json({
        error: '金額またはルールは必須です',
        code: 'INVALID_AMOUNT_OR_RULE'
      });
    }

    if (!recipient || typeof recipient !== 'string' || recipient.trim().length === 0) {
      return res.status(400).json({
        error: '受取人アドレスは必須です',
        code: 'INVALID_RECIPIENT'
      });
    }

    // Cardanoアドレス形式の基本チェック
    if (!recipient.match(/^(addr1|addr_test1)[a-z0-9]+$/)) {
      return res.status(400).json({
        error: '無効なCardanoアドレス形式です',
        code: 'INVALID_CARDANO_ADDRESS'
      });
    }

    if (typeof ttl_minutes !== 'number' || ttl_minutes < 5 || ttl_minutes > 2160) {
      return res.status(400).json({
        error: 'TTLは5分〜36時間（2160分）の数値で設定してください',
        code: 'INVALID_TTL'
      });
    }

    // TTL バリデーション
    if (ttl_minutes < 5 || ttl_minutes > 2160) {
      return res.status(400).json({
        error: 'TTLは5分〜36時間（2160分）の間で設定してください'
      });
    }

    // リクエストID生成
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Cardano TTL計算
    const SHELLEY_START_TIME = 1596059091;
    const currentTime = Math.floor(Date.now() / 1000);
    const currentSlot = currentTime - SHELLEY_START_TIME;
    const ttlSlot = currentSlot + (ttl_minutes * 60);
    
    // 🔐 改善されたPostgreSQL接続
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertResult = await client.query(`
        INSERT INTO ada_requests (id, currency, amount_mode, amount_or_rule_json, recipient, ttl_slot)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at
      `, [
        requestId, 
        currency.trim(), 
        amount_mode, 
        JSON.stringify(amount_or_rule), // JSONとして安全にシリアライズ
        recipient.trim(), 
        ttlSlot
      ]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Request created: ${requestId}`);
      
      // 署名URL生成
      const signUrl = `${req.protocol}://${req.get('host')}/sign/${requestId}`;
      
      res.status(200).json({
        requestId,
        signUrl
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Create request error:', error);
    res.status(500).json({
      error: 'リクエストの作成に失敗しました',
      code: 'CREATE_REQUEST_FAILED',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// 2. OTC取引リクエスト一覧取得（管理者用）
// GET /api/ada/requests
router.get('/requests', authenticateToken, requireAdmin, async (req, res) => {
  console.log('=== 📋 Get All Requests (Local) ===');
  
  try {
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          r.*,
          COUNT(p.id) as presigned_count,
          COUNT(t.id) as submitted_count
        FROM ada_requests r
        LEFT JOIN ada_presigned p ON r.id = p.request_id
        LEFT JOIN ada_txs t ON r.id = t.request_id
        WHERE r.created_at > NOW() - INTERVAL '7 days'
        GROUP BY r.id
        ORDER BY r.created_at DESC
      `);
      
      const requests = result.rows.map(row => ({
        ...row,
        ttl_absolute: new Date((row.ttl_slot + 1596059091) * 1000).toISOString()
      }));
      
      console.log(`✅ Retrieved ${requests.length} requests`);
      
      res.status(200).json({
        requests
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Get requests error:', error);
    res.status(500).json({
      error: 'リクエスト一覧の取得に失敗しました',
      code: 'GET_REQUESTS_FAILED',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// 3. 事前署名データ保存
// POST /api/ada/presigned  
router.post('/presigned', authenticateToken, requireOwnershipOrAdmin, async (req, res) => {
  console.log('=== 📝 Store Pre-signed Data (Local) ===');
  
  try {
    const { requestId, signedTx, metadata, selectedUtxos, providerInfo } = req.body;

    // 🛡️ 入力検証の強化
    if (!requestId || typeof requestId !== 'string' || !requestId.match(/^req_[0-9]+_[a-z0-9]+$/)) {
      return res.status(400).json({
        error: '無効なリクエストIDです',
        code: 'INVALID_REQUEST_ID'
      });
    }

    if (!signedTx || typeof signedTx !== 'object') {
      return res.status(400).json({
        error: '署名済みトランザクションは必須です',
        code: 'INVALID_SIGNED_TX'
      });
    }

    if (!signedTx.txBody || !signedTx.witness) {
      return res.status(400).json({
        error: 'txBodyとwitnessは必須です',
        code: 'MISSING_TX_COMPONENTS'
      });
    }

    // CBOR形式の基本チェック
    if (typeof signedTx.txBody !== 'string' || typeof signedTx.witness !== 'string') {
      return res.status(400).json({
        error: 'txBodyとwitnessは文字列である必要があります',
        code: 'INVALID_TX_FORMAT'
      });
    }

    // 16進数形式のチェック
    if (!signedTx.txBody.match(/^[0-9a-fA-F]+$/) || !signedTx.witness.match(/^[0-9a-fA-F]+$/)) {
      return res.status(400).json({
        error: 'txBodyとwitnessは16進数形式である必要があります',
        code: 'INVALID_HEX_FORMAT'
      });
    }

    // リクエストの存在確認
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const requestCheck = await client.query(
        'SELECT id, status FROM ada_requests WHERE id = $1',
        [requestId]
      );
      
      if (requestCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Request not found'
        });
      }
      
      // 暗号化して保存
      const encryptedTxBody = encryptData(signedTx.txBody);
      const encryptedWitness = encryptData(signedTx.witness);
      
      await client.query(`
        INSERT INTO ada_presigned (request_id, provider_id, tx_body_cbor, witness_cbor, selected_utxos)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        requestId,
        providerInfo?.name || 'unknown',
        encryptedTxBody,
        encryptedWitness,
        selectedUtxos || {}
      ]);
      
      // リクエストステータス更新
      await client.query(`
        UPDATE ada_requests 
        SET status = 'SIGNED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [requestId]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Pre-signed data stored for: ${requestId}`);
      
      // Socket.io通知
      sendWebSocketNotification({
        type: 'REQUEST_SIGNED',
        requestId,
        timestamp: new Date().toISOString()
      }, req);
      
      res.status(200).json({
        success: true,
        message: '署名が完了しました。管理者が送信を行います。',
        requestId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Store presigned error:', error);
    res.status(500).json({
      error: '署名データの保存に失敗しました',
      code: 'STORE_PRESIGNED_FAILED',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// 4. 管理者による送信実行
// POST /api/ada/submit
router.post('/submit', authenticateToken, requireAdmin, async (req, res) => {
  console.log('=== 🚀 Submit Transaction (Local) ===');
  
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }
    
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 事前署名データ取得
      const presignedResult = await client.query(
        'SELECT * FROM ada_presigned WHERE request_id = $1 ORDER BY signed_at DESC LIMIT 1',
        [requestId]
      );
      
      if (presignedResult.rows.length === 0) {
        return res.status(404).json({ error: 'Signed transaction not found' });
      }
      
      const presignedData = presignedResult.rows[0];
      
      // 復号化
      const txBody = decryptData(presignedData.tx_body_cbor);
      const witness = decryptData(presignedData.witness_cbor);
      
      // CBOR トランザクション構築
      const signedTxHex = buildCBORTransaction(txBody, witness);
      
      // Blockfrost APIに送信
      const submissionResult = await submitToBlockfrost(signedTxHex);
      
      // 送信記録保存
      await client.query(`
        INSERT INTO ada_txs (request_id, tx_hash, status)
        VALUES ($1, $2, 'SUBMITTED')
      `, [requestId, submissionResult.txHash]);
      
      // リクエストステータス更新
      await client.query(`
        UPDATE ada_requests 
        SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [requestId]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Transaction submitted: ${submissionResult.txHash}`);
      
      // Socket.io通知
      sendWebSocketNotification({
        type: 'TRANSACTION_SUBMITTED',
        requestId,
        txHash: submissionResult.txHash,
        timestamp: new Date().toISOString()
      }, req);
      
      res.status(200).json({
        success: true,
        message: 'トランザクションが正常に送信されました',
        requestId,
        txHash: submissionResult.txHash,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Submit transaction error:', error);
    res.status(500).json({
      error: 'トランザクションの送信に失敗しました',
      code: 'TRANSACTION_SUBMIT_FAILED',
      requestId: req.body?.requestId,
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// ヘルパー関数: CBOR トランザクション構築
const buildCBORTransaction = (txBody, witness) => {
  try {
    console.log('🔧 Building CBOR transaction...');
    
    // 入力検証
    if (!txBody || !witness) {
      throw new Error('txBodyとwitnessは必須です');
    }
    
    if (typeof txBody !== 'string' || typeof witness !== 'string') {
      throw new Error('txBodyとwitnessは文字列である必要があります');
    }
    
    // 16進数形式の検証
    if (!txBody.match(/^[0-9a-fA-F]+$/) || !witness.match(/^[0-9a-fA-F]+$/)) {
      throw new Error('txBodyとwitnessは16進数形式である必要があります');
    }
    
    // TODO: Cardano Serialization Libを使用した適切なCBOR構築
    // 現在は簡易実装として連結
    // 本番環境では @emurgo/cardano-serialization-lib-nodejs を使用すること
    const cborTx = txBody + witness;
    
    console.log(`✅ CBOR transaction built (${cborTx.length} chars)`);
    return cborTx;
    
  } catch (error) {
    console.error('❌ CBOR building failed:', error.message);
    throw new Error(`CBORトランザクション構築エラー: ${error.message}`);
  }
};

// ヘルパー関数: Blockfrost送信
const submitToBlockfrost = async (signedTxHex) => {
  try {
    if (!process.env.BLOCKFROST_API_KEY) {
      throw new Error('BLOCKFROST_API_KEY is not configured');
    }

    const response = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/tx/submit', {
      method: 'POST',
      headers: {
        'project_id': process.env.BLOCKFROST_API_KEY,
        'Content-Type': 'application/cbor'
      },
      body: Buffer.from(signedTxHex, 'hex')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = '不明なエラー';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      console.error(`❌ Blockfrost API error (${response.status}):`, errorMessage);
      throw new Error(`Blockfrost送信エラー: ${errorMessage}`);
    }
    
    const txHash = await response.text();
    
    // トランザクションハッシュの形式検証
    if (!txHash.match(/^[0-9a-fA-F]{64}$/)) {
      throw new Error('無効なトランザクションハッシュ形式');
    }
    
    return { txHash: txHash.trim(), message: 'Success' };
    
  } catch (error) {
    console.error('❌ Blockfrost submission failed:', error.message);
    throw error;
  }
};

module.exports = router;