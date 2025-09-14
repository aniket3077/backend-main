import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool, query, testConnection;

// Guard: if DATABASE_URL is missing, export safe fallbacks to prevent crashes
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL not set. Backend will run in offline mode (no DB).');

  const mockQuery = async () => ({ rows: [], rowCount: 0 });
  const mockTestConnection = async () => false;

  pool = null;
  query = mockQuery;
  testConnection = mockTestConnection;
} else {
  // Create PostgreSQL connection pool with Supabase-optimized settings
  const sslEnabled = String(process.env.PG_SSL || 'true').toLowerCase() !== 'false';
  
  // Parse DATABASE_URL to get individual components and force IPv4
  const dbUrl = new URL(process.env.DATABASE_URL);
  
  const poolConfig = {
    // Use individual connection parameters instead of connectionString to avoid IPv6 issues
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 5432,
    database: dbUrl.pathname.slice(1), // Remove leading slash
    user: dbUrl.username,
    password: dbUrl.password,
    ssl: sslEnabled ? { 
      rejectUnauthorized: false,
      sslmode: 'require'
    } : undefined,
    max: 10, // Reduced for Railway serverless
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // Increased timeout
    statement_timeout: 30000,
    query_timeout: 30000,
    // Force IPv4 connection
    family: 4,
  };

  console.log('� Attempting database connection to:', `${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);

  pool = new Pool(poolConfig);

  // Prevent crashes on pool errors
  pool.on('error', (err) => {
    console.error('🔌 PG Pool error (non-fatal):', err.message);
  });

  // Test database connection
  testConnection = async function() {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log('✅ Database connected successfully at:', result.rows[0].now);
      client.release();
      return true;
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      return false;
    }
  };

  // Execute query with error handling
  query = async (text, params) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(text, params);
      return result;
    } catch (err) {
      console.error('Database query error:', err.message);
      console.error('Query:', text);
      console.error('Params:', params);
      
      // Don't throw the error for common connectivity issues; use offline mode
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === '57P01') {
        console.log('🔄 Database unavailable, returning empty result (offline mode)');
        return { rows: [], rowCount: 0 };
      }
      
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  };
}

export { pool, query, testConnection };
export default pool;
