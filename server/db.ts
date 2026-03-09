import * as schema from "@shared/schema";

// Get DATABASE_URL - check multiple sources
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

// Debug logging
console.log('🔍 Database Configuration Check:');
console.log('  DATABASE_URL:', databaseUrl ? `${databaseUrl.substring(0, 30)}...` : 'NOT SET');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  PGHOST:', process.env.PGHOST || 'NOT SET');

const isPostgres = databaseUrl?.startsWith('postgresql://') || 
                   databaseUrl?.startsWith('postgres://');

if (isPostgres) {
  console.log('✅ PostgreSQL detected from DATABASE_URL');
  if (databaseUrl?.includes('.rds.amazonaws.com')) {
    console.log('   Database: AWS RDS PostgreSQL');
  } else if (databaseUrl?.includes('railway') || databaseUrl?.includes('rlwy.net')) {
    console.log('   Database: Railway PostgreSQL');
  } else {
    console.log('   Database: PostgreSQL');
  }
} else {
  console.warn('⚠️  DATABASE_URL not set or invalid at module load — will retry at runtime');
}

let db: any;
let pool: any = null;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

// Initialize database connection
async function initDatabase() {
  // Re-check at runtime in case env vars weren't available at module load
  const runtimeDatabaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  const runtimeIsPostgres = runtimeDatabaseUrl?.startsWith('postgresql://') || 
                             runtimeDatabaseUrl?.startsWith('postgres://');
  
  // CRITICAL: Only PostgreSQL is supported
  if (!runtimeIsPostgres) {
    console.error('❌ ERROR: DATABASE_URL must be a PostgreSQL connection string!');
    console.error('   DATABASE_URL must start with postgresql:// or postgres://');
    console.error('   Current value:', runtimeDatabaseUrl ? runtimeDatabaseUrl.substring(0, 50) + '...' : 'NOT SET');
    throw new Error('PostgreSQL connection string required. DATABASE_URL must start with postgresql:// or postgres://');
  }
  
  // PostgreSQL setup
  console.log('🐘 Using PostgreSQL database');
  console.log('   Connection string:', runtimeDatabaseUrl?.replace(/:[^:@]+@/, ':****@'));
  
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { Pool } = await import('pg');
  
  const connectionString = runtimeDatabaseUrl!;
  
  // Parse SSL requirement from connection string
  // AWS RDS requires SSL, Railway external connections need SSL
  const isAWSRDS = connectionString.includes('.rds.amazonaws.com');
  const isRailway = connectionString.includes('shuttle.proxy.rlwy.net') || 
                    connectionString.includes('railway.internal');
  const needsSSL = connectionString.includes('sslmode=require') || 
                   connectionString.includes('shuttle.proxy.rlwy.net') ||
                   isAWSRDS;
  
  const sslConfig = needsSSL 
    ? { rejectUnauthorized: false } 
    : undefined;
  
  if (needsSSL) {
    if (isAWSRDS) {
      console.log('   Using AWS RDS with SSL connection');
    } else if (isRailway) {
      console.log('   Using Railway PostgreSQL with SSL connection');
    } else {
      console.log('   Using SSL connection');
    }
  }
  
  pool = new Pool({
    connectionString,
    ssl: sslConfig,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    min: 2, // Minimum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Time to wait for a connection
    // Keep connections alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // Handle pool errors
  pool.on('error', (err: any) => {
    console.error('❌ Unexpected PostgreSQL pool error:', err);
    // Don't crash the app - just log the error
  });

  // Handle connection errors
  pool.on('connect', (client: any) => {
    // Set statement timeout for this connection
    client.query('SET statement_timeout = 10000');
  });
  
  db = drizzle(pool, { schema });
  
  // Test connection
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ PostgreSQL connection successful');
    console.log('   Server time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    dbInitialized = true;
  } catch (error: any) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Connection string (masked):', connectionString?.replace(/:[^:@]+@/, ':****@'));
    throw error;
  }
}

// Initialize immediately
dbInitPromise = initDatabase().catch((error) => {
  console.error('❌ Failed to initialize database:', error);
  dbInitialized = false;
  // Don't throw - let the app start and handle errors at runtime
});

// Export a function to ensure DB is ready
export async function ensureDbReady() {
  if (!dbInitialized && dbInitPromise) {
    await dbInitPromise;
  }
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Wrapper for db that ensures it's ready
export async function getDb() {
  await ensureDbReady();
  return db;
}

export { db, pool, dbInitPromise as dbInit };

// Initialize database schema
export async function initializeDatabase() {
  // Re-check at runtime
  const runtimeDatabaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  const runtimeIsPostgres = runtimeDatabaseUrl?.startsWith('postgresql://') || 
                             runtimeDatabaseUrl?.startsWith('postgres://');
  
  if (!runtimeIsPostgres) {
    console.error('❌ ERROR: DATABASE_URL must be a PostgreSQL connection string!');
    throw new Error('PostgreSQL connection string required');
  }
  
  // For PostgreSQL, automatically create tables if they don't exist
  if (!pool) {
    console.error('❌ PostgreSQL pool not initialized. Cannot create tables.');
    throw new Error('PostgreSQL connection pool not available');
  }
  
  try {
    // Always run migrations - they're idempotent (CREATE TABLE IF NOT EXISTS)
    // This ensures new tables (like crypto_wallets) are created even if other tables already exist
    console.log('🗄️ Ensuring all PostgreSQL tables exist...');
    const { createPostgresTables } = await import('./pg-migrations.js');
    await createPostgresTables(pool);
    console.log('✅ PostgreSQL schema verified and up-to-date');
  } catch (error) {
    console.error('❌ Error initializing PostgreSQL schema:', error);
    console.warn('⚠️ Continuing startup, but database operations may fail until schema is created');
    console.warn('💡 You can also run manually: npm run db:push');
  }
}
