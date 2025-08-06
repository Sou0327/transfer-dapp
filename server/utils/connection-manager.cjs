// 接続管理ユーティリティ
// PostgreSQL と Redis の接続エラーハンドリングを統一管理

const { Pool } = require('pg');
const redis = require('redis');

class ConnectionManager {
  constructor() {
    this.pgPool = null;
    this.redisClient = null;
    this.isShuttingDown = false;
    this.connectionRetries = {
      postgres: 0,
      redis: 0
    };
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5秒
  }

  // 🔐 PostgreSQL接続プールの初期化
  async initializePostgreSQL() {
    try {
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is required');
      }

      console.log('🔌 Initializing PostgreSQL connection pool...');

      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false, // Docker環境ではSSLを無効化
        max: 20, // 最大接続数
        idleTimeoutMillis: 30000, // アイドルタイムアウト
        connectionTimeoutMillis: 5000, // 接続タイムアウト
        acquireTimeoutMillis: 60000, // 取得タイムアウト
        retryDelayMillis: 2000, // 再試行遅延
      });

      // エラーハンドリング
      this.pgPool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
        this.handlePostgreSQLError(err);
      });

      this.pgPool.on('connect', (client) => {
        console.log('✅ New PostgreSQL client connected');
        // 接続成功時にリトライカウンターをリセット
        this.connectionRetries.postgres = 0;
      });

      this.pgPool.on('remove', (client) => {
        console.log('📤 PostgreSQL client removed from pool');
      });

      // 接続テスト
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      console.log('✅ PostgreSQL connection pool initialized successfully');
      return this.pgPool;

    } catch (error) {
      console.error('❌ PostgreSQL initialization failed:', error);
      await this.retryPostgreSQLConnection();
      throw error;
    }
  }

  // 🔐 Redis接続の初期化
  async initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      console.log('🔌 Initializing Redis connection...');

      this.redisClient = redis.createClient({
        url: redisUrl,
        password: process.env.REDIS_PASSWORD,
        retry_unfulfilled_commands: true,
        retry_delay_on_cluster_down: 300,
        retry_delay_on_failover: 100,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries >= this.maxRetries) {
              console.error(`❌ Redis connection failed after ${retries} retries`);
              return new Error('Redis connection failed after maximum retries');
            }
            const delay = Math.min(retries * 1000, 5000);
            console.log(`⏳ Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          }
        }
      });

      // エラーハンドリング
      this.redisClient.on('error', (err) => {
        console.error('❌ Redis client error:', err);
        this.handleRedisError(err);
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.connectionRetries.redis = 0;
      });

      this.redisClient.on('reconnecting', (retryInfo) => {
        console.log(`⏳ Redis reconnecting... (attempt ${retryInfo.attempt})`);
      });

      this.redisClient.on('end', () => {
        console.log('📤 Redis connection ended');
      });

      await this.redisClient.connect();
      await this.redisClient.ping();

      console.log('✅ Redis connection initialized successfully');
      return this.redisClient;

    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      await this.retryRedisConnection();
      throw error;
    }
  }

  // PostgreSQL接続エラーの処理
  async handlePostgreSQLError(error) {
    console.error('❌ Handling PostgreSQL error:', error.message);

    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      
      console.log('🔄 Attempting PostgreSQL reconnection...');
      await this.retryPostgreSQLConnection();
    }
  }

  // Redis接続エラーの処理
  handleRedisError(error) {
    console.error('❌ Handling Redis error:', error.message);

    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      
      this.connectionRetries.redis++;
      if (this.connectionRetries.redis <= this.maxRetries) {
        console.log(`🔄 Redis retry ${this.connectionRetries.redis}/${this.maxRetries} in ${this.retryDelay}ms`);
      }
    }
  }

  // PostgreSQL接続の再試行
  async retryPostgreSQLConnection() {
    if (this.isShuttingDown) return;

    this.connectionRetries.postgres++;
    if (this.connectionRetries.postgres > this.maxRetries) {
      console.error(`❌ PostgreSQL connection failed after ${this.maxRetries} retries`);
      return;
    }

    console.log(`🔄 Retrying PostgreSQL connection (${this.connectionRetries.postgres}/${this.maxRetries})...`);
    
    setTimeout(async () => {
      try {
        await this.initializePostgreSQL();
      } catch (error) {
        console.error('❌ PostgreSQL retry failed:', error.message);
      }
    }, this.retryDelay * this.connectionRetries.postgres);
  }

  // Redis接続の再試行
  async retryRedisConnection() {
    if (this.isShuttingDown) return;

    this.connectionRetries.redis++;
    if (this.connectionRetries.redis > this.maxRetries) {
      console.error(`❌ Redis connection failed after ${this.maxRetries} retries`);
      return;
    }

    console.log(`🔄 Retrying Redis connection (${this.connectionRetries.redis}/${this.maxRetries})...`);
    
    setTimeout(async () => {
      try {
        await this.initializeRedis();
      } catch (error) {
        console.error('❌ Redis retry failed:', error.message);
      }
    }, this.retryDelay * this.connectionRetries.redis);
  }

  // 接続状態の確認
  async checkConnections() {
    const status = {
      postgres: false,
      redis: false,
      timestamp: new Date().toISOString()
    };

    // PostgreSQL接続確認
    try {
      if (this.pgPool) {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        status.postgres = true;
      }
    } catch (error) {
      console.error('❌ PostgreSQL health check failed:', error.message);
    }

    // Redis接続確認
    try {
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.ping();
        status.redis = true;
      }
    } catch (error) {
      console.error('❌ Redis health check failed:', error.message);
    }

    return status;
  }

  // グレースフルシャットダウン
  async shutdown() {
    console.log('🛑 Initiating graceful shutdown of database connections...');
    this.isShuttingDown = true;

    const shutdownPromises = [];

    // PostgreSQL接続プールの終了
    if (this.pgPool) {
      shutdownPromises.push(
        this.pgPool.end().then(() => {
          console.log('✅ PostgreSQL pool closed');
        }).catch((error) => {
          console.error('❌ Error closing PostgreSQL pool:', error);
        })
      );
    }

    // Redis接続の終了
    if (this.redisClient) {
      shutdownPromises.push(
        this.redisClient.quit().then(() => {
          console.log('✅ Redis connection closed');
        }).catch((error) => {
          console.error('❌ Error closing Redis connection:', error);
        })
      );
    }

    await Promise.allSettled(shutdownPromises);
    console.log('✅ Database connections shutdown completed');
  }

  // 接続取得メソッド
  getPostgreSQLPool() {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }
    return this.pgPool;
  }

  getRedisClient() {
    if (!this.redisClient || !this.redisClient.isOpen) {
      throw new Error('Redis client not available');
    }
    return this.redisClient;
  }
}

// シングルトンインスタンス
const connectionManager = new ConnectionManager();

module.exports = connectionManager;