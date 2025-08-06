// データベースマイグレーション実行スクリプト
// PostgreSQL スキーマ適用とマイグレーション管理

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 環境変数読み込み
require('dotenv').config();

class DatabaseMigrator {
  constructor() {
    // 🔐 セキュアなデータベース接続設定
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // 最大接続数制限
      idleTimeoutMillis: 30000, // アイドルタイムアウト
      connectionTimeoutMillis: 2000, // 接続タイムアウト
    });

    // 許可されたSQL操作のホワイトリスト
    this.allowedStatements = [
      'CREATE TABLE',
      'CREATE INDEX',
      'CREATE UNIQUE INDEX',
      'CREATE EXTENSION',
      'ALTER TABLE',
      'INSERT INTO',
      'COMMENT ON',
      'DO $$', // PLpgSQL blocks
    ];
  }

  // 🔐 SQLステートメントの安全な解析
  parseSqlStatements(sql) {
    try {
      // コメントと空行を除去
      const cleanedSql = sql
        .replace(/--.*$/gm, '') // 行コメント除去
        .replace(/\/\*[\s\S]*?\*\//g, '') // ブロックコメント除去
        .replace(/^\s*\n/gm, ''); // 空行除去

      // セミコロンで分割し、空文でないものを返す
      return cleanedSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 5); // 最小文字数チェック
        
    } catch (error) {
      console.error('❌ SQL parsing failed:', error);
      throw new Error('Failed to parse SQL statements');
    }
  }

  // 🔐 SQLステートメントの安全性検証
  isValidStatement(statement) {
    const upperStatement = statement.toUpperCase();
    
    // 危険なステートメントをブラックリスト化
    const dangerousPatterns = [
      'DROP DATABASE',
      'DROP SCHEMA',
      'TRUNCATE',
      'DELETE FROM',
      'UPDATE SET',
      'GRANT ALL',
      'REVOKE',
      'CREATE USER',
      'CREATE ROLE',
      'ALTER USER',
      'ALTER ROLE'
    ];

    for (const pattern of dangerousPatterns) {
      if (upperStatement.includes(pattern)) {
        console.warn(`⚠️ Blocked dangerous statement: ${pattern}`);
        return false;
      }
    }

    // 許可されたステートメントのホワイトリストチェック
    const isAllowed = this.allowedStatements.some(allowed => 
      upperStatement.startsWith(allowed)
    );

    if (!isAllowed) {
      console.warn(`⚠️ Statement not in whitelist: ${statement.substring(0, 50)}...`);
      return false;
    }

    return true;
  }

  async runMigrations() {
    console.log('🚀 Starting database migration...');
    
    try {
      // 接続テスト
      await this.testConnection();
      
      // メインスキーマ適用
      await this.applySchema();
      
      // 追加マイグレーション実行
      await this.runAdditionalMigrations();
      
      // 初期データ投入
      await this.seedInitialData();
      
      console.log('✅ Database migration completed successfully!');
      
    } catch (error) {
      console.error('💥 Migration failed:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  async testConnection() {
    console.log('🔌 Testing database connection...');
    
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
      console.log(`✅ Connected to PostgreSQL at ${result.rows[0].current_time}`);
      console.log(`📊 PostgreSQL version: ${result.rows[0].pg_version.split(',')[0]}`);
    } finally {
      client.release();
    }
  }

  async applySchema() {
    console.log('📋 Applying main schema...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // 🔐 セキュアなSQLステートメント実行
      const statements = this.parseSqlStatements(schemaSql);
      
      let executedCount = 0;
      for (const statement of statements) {
        if (this.isValidStatement(statement)) {
          try {
            await client.query(statement);
            executedCount++;
            console.log(`✅ Executed statement ${executedCount}/${statements.length}`);
          } catch (error) {
            console.error(`❌ Failed to execute statement: ${statement.substring(0, 100)}...`);
            throw error;
          }
        } else {
          console.warn(`⚠️ Skipped potentially unsafe statement: ${statement.substring(0, 50)}...`);
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Main schema applied successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Schema application failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runAdditionalMigrations() {
    console.log('🔄 Running additional migrations...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('📂 No migrations directory found, skipping...');
      return;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      console.log('📝 No migration files found, skipping...');
      return;
    }
    
    const client = await this.pool.connect();
    try {
      // マイグレーション履歴テーブル作成
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 実行済みマイグレーション取得
      const appliedResult = await client.query(
        'SELECT filename FROM schema_migrations ORDER BY applied_at'
      );
      const appliedMigrations = appliedResult.rows.map(row => row.filename);
      
      // 未実行のマイグレーション実行
      for (const filename of migrationFiles) {
        if (appliedMigrations.includes(filename)) {
          console.log(`⏭️ Skipping already applied migration: ${filename}`);
          continue;
        }
        
        console.log(`🔄 Applying migration: ${filename}`);
        
        const migrationPath = path.join(migrationsDir, filename);
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query('BEGIN');
        try {
          await client.query(migrationSql);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            [filename]
          );
          await client.query('COMMIT');
          
          console.log(`✅ Applied migration: ${filename}`);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`❌ Failed to apply migration ${filename}:`, error);
          throw error;
        }
      }
      
    } finally {
      client.release();
    }
  }

  async seedInitialData() {
    console.log('🌱 Seeding initial data...');
    
    const client = await this.pool.connect();
    try {
      // 管理者アカウントの存在確認
      const adminCheck = await client.query(
        'SELECT COUNT(*) as count FROM admins'
      );
      
      if (parseInt(adminCheck.rows[0].count) === 0) {
        console.log('👤 Creating default admin account...');
        
        const bcrypt = require('bcrypt');
        
        // 🔐 セキュアなデフォルト認証情報
        const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@localhost';
        const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
        
        if (!defaultPassword) {
          // 本番環境では必ず環境変数で指定することを強制
          if (process.env.NODE_ENV === 'production') {
            throw new Error('⚠️ ADMIN_DEFAULT_PASSWORD environment variable is required in production');
          }
          
          // 開発環境では安全なランダムパスワードを生成
          const crypto = require('crypto');
          const generatedPassword = crypto.randomBytes(16).toString('base64');
          console.log(`🔐 Generated secure password: ${generatedPassword}`);
          console.log('⚠️ Please save this password - it will not be shown again!');
          
          const passwordHash = await bcrypt.hash(generatedPassword, 12); // より強いハッシュ
          
          await client.query(`
            INSERT INTO admins (email, password_hash, created_at, is_active)
            VALUES ($1, $2, CURRENT_TIMESTAMP, true)
          `, [adminEmail, passwordHash]);
          
          console.log(`✅ Default admin created - Email: ${adminEmail}`);
          console.log(`🔐 Password: ${generatedPassword}`);
        } else {
          // 環境変数で指定されたパスワードを使用
          if (defaultPassword.length < 8) {
            throw new Error('⚠️ ADMIN_DEFAULT_PASSWORD must be at least 8 characters long');
          }
          
          const passwordHash = await bcrypt.hash(defaultPassword, 12);
          
          await client.query(`
            INSERT INTO admins (email, password_hash, created_at, is_active)
            VALUES ($1, $2, CURRENT_TIMESTAMP, true)
          `, [adminEmail, passwordHash]);
          
          console.log(`✅ Default admin created - Email: ${adminEmail}`);
          console.log('🔐 Using password from ADMIN_DEFAULT_PASSWORD environment variable');
        }
      } else {
        console.log('👤 Admin accounts already exist, skipping creation');
      }
      
      // テーブル状態サマリー
      const tables = ['admins', 'ada_requests', 'ada_presigned', 'ada_txs', 'audit_logs', 'admin_sessions'];
      
      console.log('\n📊 Database Summary:');
      for (const table of tables) {
        try {
          const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
          console.log(`  ${table}: ${result.rows[0].count} records`);
        } catch (error) {
          console.log(`  ${table}: Table not found or error`);
        }
      }
      
    } finally {
      client.release();
    }
  }

  async resetDatabase() {
    // 🔐 本番環境での制限
    if (process.env.NODE_ENV === 'production') {
      throw new Error('⚠️ Database reset is not allowed in production environment');
    }

    console.log('🗑️ Resetting database...');
    console.warn('⚠️ This will permanently delete all data!');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // 🔐 セキュアなテーブル削除（SQLインジェクション対策）
      const dropTables = [
        'audit_logs',
        'admin_sessions', 
        'ada_txs',
        'ada_presigned',
        'ada_requests',
        'admins',
        'schema_migrations'
      ];
      
      // テーブル名の検証
      const validTableNames = dropTables.filter(table => 
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) && table.length < 64
      );
      
      if (validTableNames.length !== dropTables.length) {
        throw new Error('Invalid table names detected');
      }
      
      for (const table of validTableNames) {
        // パラメータ化クエリは使えないため、事前検証済みの安全なテーブル名のみ使用
        await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        console.log(`🗑️ Dropped table: ${table}`);
      }
      
      // 拡張削除
      await client.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
      
      // シーケンス削除
      const sequences = await client.query(`
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
      `);
      
      for (const seq of sequences.rows) {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seq.sequence_name)) {
          await client.query(`DROP SEQUENCE IF EXISTS "${seq.sequence_name}" CASCADE`);
          console.log(`🗑️ Dropped sequence: ${seq.sequence_name}`);
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Database reset completed');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Database reset failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// CLI実行
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  
  const migrator = new DatabaseMigrator();
  
  try {
    switch (command) {
      case 'migrate':
        await migrator.runMigrations();
        break;
      case 'reset':
        await migrator.resetDatabase();
        await migrator.runMigrations();
        break;
      case 'reset-only':
        await migrator.resetDatabase();
        break;
      default:
        console.log('Usage: node migrate.js [migrate|reset|reset-only]');
        process.exit(1);
    }
  } catch (error) {
    console.error('💥 Database operation failed:', error);
    process.exit(1);
  }
}

// 直接実行時
if (require.main === module) {
  main();
}

module.exports = { DatabaseMigrator };