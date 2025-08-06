// ローカル開発サーバー - Vercel本番環境と同一フロー
// Express + WebSocket + PostgreSQL + Redis

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');

// 🔐 改善された接続管理
const connectionManager = require('./utils/connection-manager.cjs');

// ルーター読み込み
const adaRoutes = require('./routes/ada.cjs');
const authRoutes = require('./routes/auth.cjs');
const adminRoutes = require('./routes/admin.cjs');

// Express アプリ作成
const app = express();
const server = http.createServer(app);

// 環境変数設定
require('dotenv').config();

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting OTC Transfer dApp Server (Local)');
console.log(`📦 Environment: ${NODE_ENV}`);
console.log(`🔌 Port: ${PORT}`);

// セキュリティミドルウェア
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:", "https://cardano-mainnet.blockfrost.io"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

// 圧縮
app.use(compression());

// 🔐 セキュアなCORS設定
const corsOptions = {
  origin: (origin, callback) => {
    // 許可されたオリジンのリスト
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000', 
      'http://localhost:3001',  // 管理画面用
      'http://localhost:4000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',  // 管理画面用
      'http://127.0.0.1:4000'
    ];
    
    // 開発環境ではオリジンなし（Postmanなど）も許可
    if (NODE_ENV === 'development' && !origin) {
      return callback(null, true);
    }
    
    // 開発環境ではローカルホストを全て許可
    if (NODE_ENV === 'development' && origin && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS: Blocked request from origin: ${origin}`);
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-Client-Id',
    'X-Request-ID'
  ],
  exposedHeaders: ['X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'],
  maxAge: 86400, // 24時間
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// レート制限
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15分
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静的ファイル配信
app.use(express.static(path.join(__dirname, '../dist')));
// 管理画面専用の静的ファイル配信
app.use('/admin', express.static(path.join(__dirname, '../admin-dashboard')));

// ログミドルウェア
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.url} - ${req.ip}`);
  
  // レスポンス時間計測
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${timestamp} ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// APIルート
app.use('/api/ada', adaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// 🔐 改善されたヘルスチェック
app.get('/health', async (req, res) => {
  try {
    const connectionStatus = await connectionManager.checkConnections();
    const isHealthy = connectionStatus.postgres && connectionStatus.redis;
    
    const healthData = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      connections: connectionStatus,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      }
    };
    
    res.status(isHealthy ? 200 : 503).json(healthData);
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 🔄 SPA ルーティング フォールバック
// React Routerのクライアントサイドルーティングをサポート
app.get('*', (req, res) => {
  // APIルート、WebSocket、管理画面は除外
  if (req.path.startsWith('/api/') || 
      req.path.startsWith('/ws') || 
      req.path === '/health' || 
      req.path.startsWith('/admin')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  
  // SPAのindex.htmlを返す
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Socket.io サーバー初期化
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000', 
      'http://localhost:4000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4000'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6 // 1MB
});

// Socket.io接続管理
const clients = new Map();

io.on('connection', (socket) => {
  const clientId = generateClientId();
  const clientIp = socket.handshake.address || socket.conn.remoteAddress;
  
  // クライアント情報を保存
  const clientInfo = {
    id: clientId,
    socket,
    ip: clientIp,
    connectedAt: new Date(),
    lastActivity: new Date(),
    isAuthenticated: false,
    user: null
  };
  
  clients.set(clientId, clientInfo);
  socket.clientId = clientId;
  
  console.log(`📡 Socket.io client connected: ${clientId} from ${clientIp} (${clients.size} total)`);
  
  // 認証ハンドラー
  socket.on('authenticate', async (data) => {
    try {
      const validation = validateWebSocketToken(data.token);
      const client = clients.get(clientId);
      
      if (validation && validation.valid) {
        client.isAuthenticated = true;
        client.user = validation.user;
        
        // 管理者の場合は専用のルームに参加
        if (validation.user.role === 'admin') {
          socket.join('admin');
          socket.emit('admin_authenticated', { 
            message: 'Admin authentication successful',
            clientId
          });
        } else {
          socket.emit('authenticated', { 
            message: 'Authentication successful',
            clientId
          });
        }
        
        console.log(`✅ Socket.io authentication successful: ${validation.user.email} (${validation.user.role})`);
      } else {
        socket.emit('authentication_failed', { 
          reason: 'Invalid or expired token' 
        });
        console.log(`❌ Socket.io authentication failed for ${clientId}`);
      }
    } catch (error) {
      console.error('❌ Socket.io authentication error:', error);
      socket.emit('authentication_failed', { 
        reason: 'Authentication error' 
      });
    }
  });

  // リクエスト更新の購読
  socket.on('subscribe_request', (data) => {
    const client = clients.get(clientId);
    if (!client) return;
    
    const { request_id } = data;
    if (!request_id) {
      socket.emit('error', { message: 'Request ID is required' });
      return;
    }
    
    socket.join(`request_${request_id}`);
    console.log(`🔔 Client ${clientId} subscribed to request ${request_id}`);
  });

  // リクエスト更新の購読解除
  socket.on('unsubscribe_request', (data) => {
    const { request_id } = data;
    if (!request_id) return;
    
    socket.leave(`request_${request_id}`);
    console.log(`🔕 Client ${clientId} unsubscribed from request ${request_id}`);
  });

  // 管理者更新の購読
  socket.on('subscribe_admin', (data) => {
    const client = clients.get(clientId);
    if (!client || !client.isAuthenticated || client.user?.role !== 'admin') {
      socket.emit('error', { message: 'Admin privileges required' });
      return;
    }
    
    socket.join('admin_updates');
    console.log(`👤 Admin ${clientId} subscribed to admin updates`);
  });

  // Ping/Pong
  socket.on('ping', () => {
    socket.emit('pong', { 
      timestamp: new Date().toISOString(),
      clientId
    });
  });

  // ハートビート
  socket.on('heartbeat', () => {
    const client = clients.get(clientId);
    if (client) {
      client.lastActivity = new Date();
    }
  });
  
  // 切断処理
  socket.on('disconnect', (reason) => {
    const client = clients.get(clientId);
    if (client) {
      const duration = Date.now() - client.connectedAt.getTime();
      console.log(`📡 Socket.io client disconnected: ${clientId} (reason: ${reason}, duration: ${duration}ms)`);
      clients.delete(clientId);
    }
  });
  
  // エラー処理
  socket.on('error', (error) => {
    console.error(`❌ Socket.io error for ${clientId}:`, error);
  });
  
  // 接続完了通知
  socket.emit('connection_established', {
    clientId,
    timestamp: new Date().toISOString()
  });
  
  // 開発環境では公開接続も許可
  if (NODE_ENV === 'development') {
    socket.emit('public_connected', {
      message: 'Public connection established (development mode)',
      clientId
    });
  }
});

// 🔐 セキュアなSocket.io heartbeat (30秒間隔)
const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 5 * 60 * 1000; // 5分間非アクティブ
  
  clients.forEach((client, clientId) => {
    const socket = client.socket;
    
    // 接続状態チェック
    if (!socket.connected) {
      console.log(`📡 Cleaning up disconnected Socket.io client: ${clientId}`);
      clients.delete(clientId);
      return;
    }
    
    // 非アクティブタイムアウトチェック
    const inactiveTime = now - client.lastActivity.getTime();
    if (inactiveTime > inactiveThreshold) {
      console.log(`📡 Disconnecting inactive Socket.io client: ${clientId} (inactive for ${Math.round(inactiveTime/1000)}s)`);
      socket.disconnect(true);
      clients.delete(clientId);
      return;
    }
  });
  
  // 統計情報をログ出力（開発時のみ）
  if (NODE_ENV === 'development' && clients.size > 0) {
    console.log(`📊 Socket.io stats: ${clients.size} active connections`);
  }
}, 30000);

// 🔐 セキュアなSocket.ioブロードキャスト関数
const broadcastToAll = (event, data, options = {}) => {
  const { 
    requireAuth = false, 
    requireAdmin = false, 
    excludeClient = null,
    room = null
  } = options;
  
  const messageData = {
    ...data,
    timestamp: new Date().toISOString()
  };
  
  let sentCount = 0;
  
  // ルーム指定がある場合はSocket.ioのルーム機能を使用
  if (room) {
    io.to(room).emit(event, messageData);
    console.log(`📡 Broadcasted ${event} to room: ${room}`);
    return;
  }
  
  clients.forEach((client, clientId) => {
    if (excludeClient === clientId) return;
    
    const socket = client.socket;
    
    if (!socket.connected) {
      // 無効な接続をクリーンアップ
      clients.delete(clientId);
      return;
    }
    
    // 認証チェック
    if (requireAuth && !client.isAuthenticated) {
      return;
    }
    
    // 管理者権限チェック
    if (requireAdmin && (!client.user || client.user.role !== 'admin')) {
      return;
    }
    
    try {
      socket.emit(event, messageData);
      sentCount++;
    } catch (error) {
      console.error(`❌ Failed to send ${event} to ${clientId}:`, error);
      clients.delete(clientId);
    }
  });
  
  console.log(`📡 Broadcasted ${event} to ${sentCount} clients`);
  return sentCount;
};

// 特定のユーザーにSocket.io経由で送信
const sendToUser = (userId, event, data) => {
  const messageData = {
    ...data,
    timestamp: new Date().toISOString()
  };
  
  clients.forEach((client, clientId) => {
    if (client.isAuthenticated && 
        client.user && 
        (client.user.sub === userId || client.user.userId === userId || client.user.adminId === userId) &&
        client.socket.connected) {
      
      try {
        client.socket.emit(event, messageData);
        console.log(`📡 Sent ${event} to user ${userId} (client ${clientId})`);
        return true;
      } catch (error) {
        console.error(`❌ Failed to send ${event} to user ${userId}:`, error);
        clients.delete(clientId);
      }
    }
  });
  
  return false;
};

// ルーターにWebSocket機能を提供
app.locals.broadcastWebSocket = broadcastToAll;

// 管理画面のメインページルート
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin-dashboard/index.html'));
});
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin-dashboard/index.html'));
});

// グローバルエラーハンドラー
app.use((error, req, res, next) => {
  console.error('💥 Global error handler:', error);
  
  res.status(error.status || 500).json({
    error: NODE_ENV === 'development' ? error.message : 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 🔐 データベース接続の初期化
async function initializeConnections() {
  try {
    console.log('🚀 Initializing database connections...');
    
    await connectionManager.initializePostgreSQL();
    await connectionManager.initializeRedis();
    
    console.log('✅ All database connections initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize database connections:', error);
    return false;
  }
}

// サーバー起動
async function startServer() {
  try {
    // データベース接続の初期化
    const connectionsInitialized = await initializeConnections();
    
    if (!connectionsInitialized && process.env.NODE_ENV === 'production') {
      console.error('❌ Cannot start server without database connections in production');
      process.exit(1);
    }
    
    // サーバー起動
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io server running on http://localhost:${PORT}/socket.io/`);
      console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
      console.log(`🌐 Frontend: http://localhost:${PORT}`);
      
      // 定期的な接続状態チェック（本番環境のみ）
      if (process.env.NODE_ENV === 'production') {
        setInterval(async () => {
          const status = await connectionManager.checkConnections();
          if (!status.postgres || !status.redis) {
            console.warn('⚠️ Database connection health check failed:', status);
          }
        }, 30000); // 30秒間隔
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// サーバー起動実行
startServer();

// 🔐 改善されたGraceful shutdown
async function gracefulShutdown(signal) {
  console.log(`🛑 ${signal} received, initiating graceful shutdown...`);
  
  try {
    // 新しい接続を受け付けない
    server.close(async (serverError) => {
      if (serverError) {
        console.error('❌ Error closing server:', serverError);
      } else {
        console.log('✅ HTTP server closed');
      }
      
      // Socket.ioサーバーのクリーンアップ
      console.log('📡 Closing Socket.io connections...');
      clearInterval(heartbeatInterval);
      
      clients.forEach((client) => {
        client.socket.disconnect(true);
      });
      
      io.close();
      
      // データベース接続のクリーンアップ
      await connectionManager.shutdown();
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
    
    // 強制終了タイムアウト（30秒）
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// シグナルハンドラーの登録
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未処理の例外とPromise拒否の処理
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ヘルパー関数
const generateClientId = () => {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

// 🔐 セキュアなJWT検証（WebSocket用）
const validateWebSocketToken = (token) => {
  try {
    if (!token) {
      console.log('❌ WebSocket: No token provided');
      return false;
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is not configured');
      return false;
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // トークンの有効期限チェック
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      console.log('❌ WebSocket: Token expired');
      return false;
    }

    console.log(`✅ WebSocket: Token validated for user ${decoded.sub || decoded.userId}`);
    return { valid: true, user: decoded };
    
  } catch (error) {
    console.error('❌ WebSocket JWT validation failed:', error.message);
    return false;
  }
};

module.exports = app;