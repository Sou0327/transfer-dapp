#!/usr/bin/env node
/**
 * Fastify Server for OTC System
 */
import Fastify from 'fastify';
import { config as dotenvConfig } from 'dotenv';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import jwt from '@fastify/jwt';
import redis from '@fastify/redis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    } : undefined
  }
});

// Configuration
const config = {
  port: parseInt(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  corsOrigin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:4000'],
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: '24h'
    }
  });

  // Redis
  await fastify.register(redis, {
    url: config.redisUrl,
    family: 4,
  });

  // Static files (for production)
  if (process.env.NODE_ENV === 'production') {
    await fastify.register(staticFiles, {
      root: join(__dirname, '../dist'),
      prefix: '/',
    });
  }
}

// Authentication middleware
fastify.decorate('authenticate', async function(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Authentication required' });
  }
});

// In-memory storage for requests
const requestStorage = new Map();

// Routes
async function registerRoutes() {
  // Import route modules
  const { protocolRoutes } = await import('./routes/protocol.js');
  
  // Health check
  fastify.get('/health', async (request, reply) => {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Dashboard statistics API
  fastify.get('/api/dashboard/stats', async (request, reply) => {
    try {
      // Get today's date range
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      // Get session statistics from Socket.IO
      const activeConnections = connectedClients.size;
      const activeRequestSessions = requestSubscriptions.size;
      const activeAdminSessions = adminSubscriptions.size;
      const totalSocketConnections = io.engine.clientsCount;

      // Try to get statistics from database
      let stats = {
        todayRequests: 0,
        pendingRequests: 0,
        totalRequests: 0,
        activeConnections: activeConnections,
        activeRequestSessions: activeRequestSessions,
        activeAdminSessions: activeAdminSessions,
        totalSocketConnections: totalSocketConnections,
        systemStatus: 'online',
        lastUpdate: new Date().toISOString()
      };

      try {
        const { RequestDAO } = await import('../src/lib/database.ts');
        
        // Get today's requests count
        const todayRequestsCount = await RequestDAO.countByDateRange?.(todayStart, todayEnd) || 0;
        
        // Get pending requests count
        const pendingCount = await RequestDAO.countByStatus?.('REQUESTED') || 0;
        
        // Get total requests count  
        const totalCount = await RequestDAO.countAll?.() || 0;

        stats = {
          todayRequests: todayRequestsCount,
          pendingRequests: pendingCount,
          totalRequests: totalCount,
          activeConnections: activeConnections,
          activeRequestSessions: activeRequestSessions,
          activeAdminSessions: activeAdminSessions,
          totalSocketConnections: totalSocketConnections,
          systemStatus: 'online',
          lastUpdate: new Date().toISOString()
        };

      } catch (dbError) {
        // If database is not available, return mock data for development
        fastify.log.warn('Database not available for dashboard stats, using mock data:', dbError.message);
        
        // Use in-memory request storage as fallback
        const requests = Array.from(requestStorage.values());
        const todayRequests = requests.filter(r => {
          const createdAt = new Date(r.created_at);
          return createdAt >= todayStart && createdAt < todayEnd;
        });

        stats = {
          todayRequests: todayRequests.length,
          pendingRequests: requests.filter(r => r.status === 'REQUESTED').length,
          totalRequests: requests.length,
          activeConnections: activeConnections,
          activeRequestSessions: activeRequestSessions,
          activeAdminSessions: activeAdminSessions,
          totalSocketConnections: totalSocketConnections,
          systemStatus: 'online',
          lastUpdate: new Date().toISOString()
        };
      }

      return stats;

    } catch (error) {
      fastify.log.error('Failed to get dashboard stats:', error);
      return reply.code(500).send({
        error: 'Failed to get dashboard statistics'
      });
    }
  });

  // Session management API
  fastify.delete('/api/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      
      // Find and disconnect the session
      const client = connectedClients.get(sessionId);
      if (client) {
        // Force disconnect the socket
        client.socket.disconnect(true);
        
        // Clean up subscriptions
        client.subscribedRequests.forEach(requestId => {
          requestSubscriptions.get(requestId)?.delete(sessionId);
          if (requestSubscriptions.get(requestId)?.size === 0) {
            requestSubscriptions.delete(requestId);
          }
        });

        client.subscribedAdmins.forEach(adminId => {
          adminSubscriptions.get(adminId)?.delete(sessionId);
          if (adminSubscriptions.get(adminId)?.size === 0) {
            adminSubscriptions.delete(adminId);
          }
        });

        // Remove from connected clients
        connectedClients.delete(sessionId);
        
        fastify.log.info(`Admin force-disconnected session: ${sessionId}`);
        
        return {
          success: true,
          message: 'セッションを正常に削除しました',
          sessionId: sessionId
        };
      } else {
        return reply.code(404).send({
          error: 'セッションが見つかりません',
          sessionId: sessionId
        });
      }
    } catch (error) {
      fastify.log.error('Failed to delete session:', error);
      return reply.code(500).send({
        error: 'セッション削除に失敗しました'
      });
    }
  });

  // Get active sessions API
  fastify.get('/api/sessions', async (request, reply) => {
    try {
      const sessions = Array.from(connectedClients.entries()).map(([sessionId, client]) => ({
        sessionId,
        isAdmin: client.isAdmin,
        connectedAt: client.connectedAt,
        subscribedRequests: Array.from(client.subscribedRequests),
        subscribedAdmins: Array.from(client.subscribedAdmins),
        connected: client.socket.connected,
        lastActivity: client.lastActivity || client.connectedAt
      }));

      return {
        sessions,
        totalCount: sessions.length,
        adminCount: sessions.filter(s => s.isAdmin).length,
        publicCount: sessions.filter(s => !s.isAdmin).length
      };
    } catch (error) {
      fastify.log.error('Failed to get sessions:', error);
      return reply.code(500).send({
        error: 'セッション一覧の取得に失敗しました'
      });
    }
  });

  // Archive request API
  fastify.patch('/api/ada/requests/:id/archive', async (request, reply) => {
    try {
      const { id } = request.params;
      const { archived = true } = request.body || {};
      
      // Find request in storage
      const existingRequest = requestStorage.get(id);
      if (!existingRequest) {
        return reply.code(404).send({
          error: 'リクエストが見つかりません'
        });
      }

      // Update archived status
      const updatedRequest = {
        ...existingRequest,
        archived: archived,
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      requestStorage.set(id, updatedRequest);
      
      fastify.log.info(`Request ${archived ? 'archived' : 'unarchived'}: ${id}`);
      
      // Broadcast update to admin clients
      io.to('admin-dashboard').emit('request_archived', {
        request_id: id,
        archived: archived,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: archived ? 'リクエストをアーカイブしました' : 'アーカイブを解除しました',
        request: updatedRequest
      };
      
    } catch (error) {
      fastify.log.error('Failed to archive request:', error);
      return reply.code(500).send({
        error: 'アーカイブ処理に失敗しました'
      });
    }
  });

  // Delete request endpoint
  fastify.delete('/api/ada/requests/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Find request in storage
      const existingRequest = requestStorage.get(id);
      if (!existingRequest) {
        return reply.code(404).send({
          error: 'リクエストが見つかりません'
        });
      }

      // Delete from storage
      requestStorage.delete(id);
      
      fastify.log.info(`Request deleted: ${id}`);
      
      // Broadcast update to admin clients
      io.to('admin-dashboard').emit('request_deleted', {
        request_id: id,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: 'リクエストを削除しました',
        request_id: id
      };
      
    } catch (error) {
      fastify.log.error('Failed to delete request:', error);
      return reply.code(500).send({
        error: 'リクエスト削除に失敗しました',
        details: error.message
      });
    }
  });

  // API routes
  await fastify.register(async function(fastify) {
    // Register protocol routes
    await fastify.register(protocolRoutes, { prefix: '/ada' });
    
    // Get specific request by ID - This is handled by protocolRoutes now
    // All request routes are now handled by protocolRoutes

    // Create new request endpoint - This is handled by protocolRoutes now
    // Removed duplicate POST /ada/requests route

    // Get all requests endpoint - This is handled by protocolRoutes now
    // Removed duplicate GET /ada/requests route
  }, { prefix: '/api' });

  // Serve React app for all other routes (SPA)
  if (process.env.NODE_ENV === 'production') {
    fastify.get('/*', async (request, reply) => {
      return reply.sendFile('index.html');
    });
  }
}

// WebSocket support for real-time updates
async function setupWebSocket() {
  await fastify.register(async function(fastify) {
    const { Server } = await import('socket.io');
    
    const io = new Server(fastify.server, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Make io available to other routes (decorated at the end of function)
    
    // Track connected clients and their subscriptions
    const connectedClients = new Map();
    const requestSubscriptions = new Map(); // requestId -> Set of socketIds
    const adminSubscriptions = new Map(); // adminId -> Set of socketIds

    // Socket.IO authentication middleware (optional for public signing)
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (token) {
          // 開発環境では簡単な認証
          if (process.env.NODE_ENV === 'development' || token === 'dev-token') {
            socket.adminSession = {
              id: 'dev-admin',
              email: 'admin@otc.local',
              role: 'admin'
            };
            socket.isAdmin = true;
            fastify.log.info(`Admin connected via dev token: ${socket.id}`);
          } else {
            // 本番環境では JWT verification（現在は未実装なのでスキップ）
            try {
              // const decoded = fastify.jwt.verify(token);
              // socket.adminSession = decoded;
              socket.isAdmin = true;
            } catch (jwtErr) {
              fastify.log.warn(`JWT verification failed: ${jwtErr.message}`);
              socket.isAdmin = false;
            }
          }
        } else {
          // Public connection (for request monitoring)
          socket.isAdmin = false;
        }
        
        next();
      } catch (err) {
        fastify.log.error(`Socket auth error: ${err.message}`);
        // Allow connection without auth for public access
        socket.isAdmin = false;
        next();
      }
    });

    // Socket connection handling
    io.on('connection', (socket) => {
      const clientId = socket.id;
      const isAdmin = socket.isAdmin;
      const adminEmail = socket.adminSession?.email || 'anonymous';

      fastify.log.info(`Client connected: ${clientId} (${isAdmin ? `Admin: ${adminEmail}` : 'Public'})`);

      // Track connected client
      connectedClients.set(clientId, {
        socket,
        isAdmin,
        adminSession: socket.adminSession,
        connectedAt: new Date(),
        subscribedRequests: new Set(),
        subscribedAdmins: new Set()
      });

      // Join appropriate rooms
      if (isAdmin) {
        socket.join('admin');
        socket.join(`admin-${socket.adminSession.id}`);
        
        // Send confirmation to admin client
        socket.emit('admin_authenticated', {
          success: true,
          adminSession: socket.adminSession,
          rooms: ['admin', `admin-${socket.adminSession.id}`],
          timestamp: new Date().toISOString()
        });
        
        fastify.log.info(`Admin ${adminEmail} joined admin rooms`);
      } else {
        // Send public connection confirmation
        socket.emit('public_connected', {
          success: true,
          timestamp: new Date().toISOString()
        });
      }

      // Handle request subscription (both admin and public)
      socket.on('subscribe_request', (data) => {
        const { request_id } = data;
        if (!request_id) return;

        socket.join(`request-${request_id}`);
        
        // Track subscription
        if (!requestSubscriptions.has(request_id)) {
          requestSubscriptions.set(request_id, new Set());
        }
        requestSubscriptions.get(request_id).add(clientId);
        connectedClients.get(clientId)?.subscribedRequests.add(request_id);

        fastify.log.info(`Client ${clientId} subscribed to request ${request_id}`);

        // Send current status if available
        socket.emit('subscription_confirmed', { request_id, timestamp: new Date().toISOString() });
      });

      // Handle request unsubscription
      socket.on('unsubscribe_request', (data) => {
        const { request_id } = data;
        if (!request_id) return;

        socket.leave(`request-${request_id}`);

        // Remove from tracking
        requestSubscriptions.get(request_id)?.delete(clientId);
        connectedClients.get(clientId)?.subscribedRequests.delete(request_id);

        fastify.log.info(`Client ${clientId} unsubscribed from request ${request_id}`);
      });

      // Handle admin dashboard subscription (admin only)
      socket.on('subscribe_admin', (data) => {
        if (!isAdmin) {
          socket.emit('error', { message: 'Admin access required' });
          return;
        }

        const { admin_id } = data;
        if (!admin_id) return;

        socket.join(`admin-dashboard-${admin_id}`);

        // Track subscription
        if (!adminSubscriptions.has(admin_id)) {
          adminSubscriptions.set(admin_id, new Set());
        }
        adminSubscriptions.get(admin_id).add(clientId);
        connectedClients.get(clientId)?.subscribedAdmins.add(admin_id);

        fastify.log.info(`Admin ${clientId} subscribed to dashboard updates`);
      });

      // Handle request status query
      socket.on('request_status', async (data) => {
        const { request_id } = data;
        if (!request_id) return;

        try {
          const { RequestDAO, PreSignedDAO } = await import('../src/lib/database.ts');
          
          const request = await RequestDAO.getById(request_id);
          if (request) {
            const preSignedData = await PreSignedDAO.getByRequestId(request_id);
            
            socket.emit('request_updated', {
              request_id,
              status: request.status,
              timestamp: new Date().toISOString(),
              has_presigned: !!preSignedData
            });
          }
        } catch (error) {
          fastify.log.error('Failed to fetch request status:', error);
          socket.emit('error', { message: 'Failed to fetch request status' });
        }
      });

      // Handle health check
      socket.on('health_check', (data) => {
        const { request_id } = data;
        socket.emit('health_response', {
          request_id,
          server_time: new Date().toISOString(),
          connection_id: clientId
        });
      });

      // Handle ping for connection testing
      socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
          callback({ timestamp: new Date().toISOString() });
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        fastify.log.info(`Client ${clientId} disconnected: ${reason}`);

        // Clean up subscriptions
        const client = connectedClients.get(clientId);
        if (client) {
          // Remove from request subscriptions
          client.subscribedRequests.forEach(requestId => {
            requestSubscriptions.get(requestId)?.delete(clientId);
            if (requestSubscriptions.get(requestId)?.size === 0) {
              requestSubscriptions.delete(requestId);
            }
          });

          // Remove from admin subscriptions
          client.subscribedAdmins.forEach(adminId => {
            adminSubscriptions.get(adminId)?.delete(clientId);
            if (adminSubscriptions.get(adminId)?.size === 0) {
              adminSubscriptions.delete(adminId);
            }
          });
        }

        connectedClients.delete(clientId);
      });

      // Error handling
      socket.on('error', (error) => {
        fastify.log.error(`Socket error for client ${clientId}:`, error);
      });
    });

    // Enhanced broadcast functions
    io.broadcastRequestUpdate = (requestId, update) => {
      io.to(`request-${requestId}`).emit('request_updated', {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...update
      });
    };

    io.broadcastTTLUpdate = (requestId, ttlInfo) => {
      io.to(`request-${requestId}`).emit('ttl_update', {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...ttlInfo
      });
    };

    io.broadcastUTxOUpdate = (requestId, utxoInfo) => {
      io.to(`request-${requestId}`).emit('utxo_update', {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...utxoInfo
      });
    };

    io.broadcastAdminAlert = (adminId, alert) => {
      io.to(`admin-dashboard-${adminId}`).emit('admin_alert', {
        timestamp: new Date().toISOString(),
        ...alert
      });
    };

    // Periodic cleanup of stale subscriptions
    setInterval(() => {
      const now = Date.now();
      let cleanedClients = 0;

      connectedClients.forEach((client, clientId) => {
        // Remove clients that have been disconnected for more than 5 minutes
        if (now - client.connectedAt.getTime() > 5 * 60 * 1000 && !client.socket.connected) {
          connectedClients.delete(clientId);
          cleanedClients++;
        }
      });

      if (cleanedClients > 0) {
        fastify.log.info(`Cleaned up ${cleanedClients} stale client connections`);
      }
    }, 60000); // Run every minute

    // Connection monitoring
    setInterval(() => {
      const stats = {
        total_connections: connectedClients.size,
        admin_connections: Array.from(connectedClients.values()).filter(c => c.isAdmin).length,
        public_connections: Array.from(connectedClients.values()).filter(c => !c.isAdmin).length,
        active_request_subscriptions: requestSubscriptions.size,
        active_admin_subscriptions: adminSubscriptions.size
      };

      fastify.log.debug('WebSocket stats:', stats);

      // Broadcast stats to admin dashboard
      io.to('admin').emit('connection_stats', stats);
    }, 30000); // Every 30 seconds

    // Decorate fastify with enhanced io instance
    fastify.decorate('io', io);
    
    fastify.log.info('WebSocket server configured with real-time monitoring support');
  });
}

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  const { statusCode = 500, message } = error;
  
  fastify.log.error({
    error: error,
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  }, 'Request error');

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorMessage = statusCode < 500 || isDevelopment ? message : 'Internal Server Error';

  reply.code(statusCode).send({
    error: errorMessage,
    statusCode,
    ...(isDevelopment && { stack: error.stack }),
  });
});

// Not found handler
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    reply.code(404).send({
      error: 'API endpoint not found',
      statusCode: 404,
    });
  } else if (process.env.NODE_ENV === 'production') {
    // Serve index.html for SPA routes
    reply.sendFile('index.html');
  } else {
    reply.code(404).send({
      error: 'Page not found',
      statusCode: 404,
    });
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop block confirmation monitoring service
    const { blockConfirmationMonitor } = await import('../src/lib/blockConfirmationMonitor.ts');
    blockConfirmationMonitor.stop();
    
    // Stop transaction submission service
    const { transactionSubmitter } = await import('../src/lib/transactionSubmitter.ts');
    transactionSubmitter.shutdown();
    
    // Stop UTxO monitoring service
    const { utxoMonitorService } = await import('../src/lib/utxoMonitor.ts');
    utxoMonitorService.stop();
    
    // Close database connections
    const { closeConnections } = await import('../src/lib/database.ts');
    await closeConnections();
    
    // Close Fastify server
    await fastify.close();
    
    fastify.log.info('Server shut down successfully');
    process.exit(0);
  } catch (error) {
    fastify.log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  fastify.log.fatal('Uncaught exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  fastify.log.fatal('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
async function start() {
  try {
    // Initialize database if needed (skip for development)
    try {
      const { runMigration } = await import('../database/migrate.js');
      await runMigration();
      fastify.log.info('Database migration completed');
    } catch (dbError) {
      fastify.log.warn('Database migration failed, continuing without database:', dbError.message);
    }

    // Register plugins and routes
    await registerPlugins();
    await registerRoutes();
    await setupWebSocket();

    // Start monitoring services (skip if database not available)
    try {
      const { utxoMonitorService } = await import('../src/lib/utxoMonitor.ts');
      await utxoMonitorService.start();
      fastify.log.info('UTxO monitoring service started');

      const { blockConfirmationMonitor } = await import('../src/lib/blockConfirmationMonitor.ts');
      blockConfirmationMonitor.setWebSocketHandler(fastify.io);
      await blockConfirmationMonitor.start();
      fastify.log.info('Block confirmation monitoring service started');
    } catch (monitorError) {
      fastify.log.warn('Monitoring services failed to start:', monitorError.message);
    }

    // Start listening
    await fastify.listen({ 
      port: config.port, 
      host: config.host 
    });

    fastify.log.info({
      port: config.port,
      host: config.host,
      environment: process.env.NODE_ENV || 'development',
    }, 'OTC Server started successfully');

    // Additional startup info
    if (process.env.NODE_ENV === 'development') {
      console.log(`
🚀 OTC Server is running!

📍 API Base URL: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/api
📍 Health Check: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/health
📍 WebSocket: ws://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}

📝 Available endpoints:
   POST /api/auth/login
   POST /api/auth/logout  
   GET  /api/auth/validate
   POST /api/ada/requests
   GET  /api/ada/requests/:id
   POST /api/ada/presigned
   POST /api/ada/submit/:request_id
   POST /api/ada/submit/batch
   POST /api/ada/submit/queue/:request_id
   GET  /api/ada/submit/status/:request_id
   POST /api/ada/submit/:request_id/retry
   GET  /api/ada/confirmation/status
   GET  /api/ada/confirmation/transactions
   GET  /api/ada/confirmation/transactions/:tx_hash
   POST /api/ada/confirmation/transactions/:tx_hash/check
   GET  /api/ada/protocol-params
   GET  /api/ada/rate
   GET  /api/ada/monitoring/status
      `);
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    fastify.log.error('Failed to start server:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    process.exit(1);
  }
}

// Start if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { fastify };