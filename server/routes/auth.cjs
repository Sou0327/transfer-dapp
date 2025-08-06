// 認証API ローカル実装
// JWT + bcrypt による管理者認証

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 🔐 改善された接続管理
const connectionManager = require('../utils/connection-manager.cjs');

const router = express.Router();

// JWT設定
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ログイン
// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('=== 🔐 Admin Login ===');
  console.log('📧 Login attempt for:', req.body.email);
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }
    
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      // 管理者検索
      const result = await client.query(
        'SELECT id, email, password_hash FROM admins WHERE email = $1',
        [email.toLowerCase()]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }
      
      const admin = result.rows[0];
      
      // パスワード検証
      console.log('🔐 Verifying password...');
      const isValidPassword = await bcrypt.compare(password, admin.password_hash);
      
      if (!isValidPassword) {
        console.log('❌ Invalid password');
        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }
      
      console.log('✅ Password verified');
      
      // JWT トークン生成
      console.log('🔐 Generating JWT token...');
      console.log('🔐 JWT_SECRET:', JWT_SECRET ? 'Present' : 'Missing');
      
      const token = jwt.sign(
        { 
          adminId: admin.id,
          email: admin.email,
          type: 'admin',
          role: 'admin'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      console.log('✅ JWT token generated:', token.substring(0, 20) + '...');
      
      // セッション記録
      await client.query(
        `INSERT INTO admin_sessions (admin_id, session_token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          admin.id,
          token,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
          req.ip,
          req.get('User-Agent')
        ]
      );
      
      // 監査ログ
      await client.query(
        `INSERT INTO audit_logs (admin_id, action, ip_address, user_agent)
         VALUES ($1, $2, $3, $4)`,
        [admin.id, 'LOGIN', req.ip, req.get('User-Agent')]
      );
      
      console.log(`✅ Admin logged in: ${admin.email}`);
      
      res.status(200).json({
        success: true,
        token,
        admin: {
          id: admin.id,
          email: admin.email
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// ログアウト
// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  console.log('=== 🚪 Admin Logout ===');
  
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
      try {
        // セッション削除
        await client.query(
          'DELETE FROM admin_sessions WHERE session_token = $1',
          [token]
        );
        
        // 監査ログ
        await client.query(
          `INSERT INTO audit_logs (admin_id, action, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [req.admin.adminId, 'LOGOUT', req.ip, req.get('User-Agent')]
        );
        
      } finally {
        client.release();
      }
    }
    
    console.log(`✅ Admin logged out: ${req.admin.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('💥 Logout error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// トークン検証
// GET /api/auth/verify
router.get('/verify', authenticateToken, async (req, res) => {
  console.log('=== 🔍 Token Verification ===');
  
  try {
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      // セッション確認
      const result = await client.query(
        `SELECT s.expires_at, a.email FROM admin_sessions s
         JOIN admins a ON s.admin_id = a.id
         WHERE s.session_token = $1 AND s.expires_at > NOW()`,
        [req.headers.authorization?.replace('Bearer ', '')]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Session expired'
        });
      }
      
      res.status(200).json({
        valid: true,
        admin: {
          id: req.admin.adminId,
          email: req.admin.email
        },
        expiresAt: result.rows[0].expires_at
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Token verification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// 管理者作成 (開発用・初期設定用)
// POST /api/auth/create-admin
router.post('/create-admin', async (req, res) => {
  console.log('=== 👤 Create Admin (Dev Only) ===');
  
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Admin creation not allowed in production'
    });
  }
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const pool = connectionManager.getPostgreSQLPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET
         password_hash = $2, updated_at = CURRENT_TIMESTAMP
         RETURNING id, email, created_at`,
        [email.toLowerCase(), passwordHash]
      );
      
      console.log(`✅ Admin created: ${email}`);
      
      res.status(200).json({
        success: true,
        admin: {
          id: result.rows[0].id,
          email: result.rows[0].email,
          created_at: result.rows[0].created_at
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 Create admin error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// 認証ミドルウェア
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, admin) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.admin = admin;
    next();
  });
}

// エクスポート
router.authenticateToken = authenticateToken;

module.exports = router;
module.exports.authenticateToken = authenticateToken;