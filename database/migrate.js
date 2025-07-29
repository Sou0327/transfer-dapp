#!/usr/bin/env node
/**
 * Database Migration Script for OTC System
 * Usage: node database/migrate.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/otc_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(dbConfig);

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migration...');
    
    // Read schema SQL file
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');
    
    // Execute schema creation
    console.log('📋 Creating database schema...');
    await client.query(schemaSql);
    console.log('✅ Database schema created successfully');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Verify indexes were created
    const indexesResult = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);
    
    console.log('🔍 Created indexes:');
    indexesResult.rows.forEach(row => {
      console.log(`  - ${row.indexname} on ${row.tablename}`);
    });
    
    // Test database connection and basic operations
    console.log('🧪 Testing database operations...');
    
    // Test admin table
    const adminCount = await client.query('SELECT COUNT(*) FROM admins');
    console.log(`  - Admin users: ${adminCount.rows[0].count}`);
    
    // Test request creation (without actual data)
    await client.query('SELECT 1 FROM ada_requests LIMIT 0');
    console.log('  - ada_requests table: OK');
    
    await client.query('SELECT 1 FROM ada_presigned LIMIT 0');
    console.log('  - ada_presigned table: OK');
    
    await client.query('SELECT 1 FROM ada_txs LIMIT 0');
    console.log('  - ada_txs table: OK');
    
    await client.query('SELECT 1 FROM audit_logs LIMIT 0');
    console.log('  - audit_logs table: OK');
    
    await client.query('SELECT 1 FROM admin_sessions LIMIT 0');
    console.log('  - admin_sessions table: OK');
    
    console.log('🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file with correct database credentials');
    console.log('2. Change the default admin password in production');
    console.log('3. Configure Redis for caching and sessions');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Make sure PostgreSQL is running');
    console.error('2. Check DATABASE_URL in your .env file');
    console.error('3. Ensure the database exists and user has permissions');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n⏹️  Migration interrupted');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Migration terminated');
  await pool.end();
  process.exit(0);
});

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch(console.error);
}

export { runMigration };