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
    max: 10, // Increased pool size for better concurrency
    idleTimeoutMillis: 30000, // Increased to 30 seconds
    connectionTimeoutMillis: 15000, // Increased to 15 seconds  
    statement_timeout: 30000, // Increased to 30 seconds
    query_timeout: 30000, // Increased to 30 seconds
    // Force IPv4 connection
    family: 4,
    keepAlive: true, // Enable keepalive for better connection stability
    keepAliveInitialDelayMillis: 10000,
  };

  console.log('� Attempting database connection to:', `${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);

  pool = new Pool(poolConfig);

  // Prevent crashes on pool errors
  pool.on('error', (err) => {
    console.error('🔌 PG Pool error (non-fatal):', err.message);
  });

  // Monitor pool connection health
  pool.on('connect', (client) => {
    console.log('🔗 New database client connected');
  });

  pool.on('acquire', (client) => {
    console.log('🎯 Database client acquired from pool');
  });

  pool.on('remove', (client) => {
    console.log('🔚 Database client removed from pool');
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
      
      // If IPv6 issue, try alternative connection method
      if (err.message.includes('ENETUNREACH') && err.address && err.address.includes(':')) {
        console.log('🔄 Detected IPv6 issue, trying alternative connection...');
        
        try {
          // Try with connectionString but with additional options
          const alternativePool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            connectionTimeoutMillis: 5000,
            statement_timeout: 10000,
          });
          
          const altClient = await alternativePool.connect();
          const altResult = await altClient.query('SELECT NOW()');
          console.log('✅ Alternative connection successful:', altResult.rows[0].now);
          altClient.release();
          
          // Replace the main pool with the working one
          pool = alternativePool;
          return true;
        } catch (altErr) {
          console.error('❌ Alternative connection also failed:', altErr.message);
        }
      }
      
      return false;
    }
  };

  // Execute query with error handling and retry logic
  query = async (text, params) => {
    let client;
    let retries = 3;
    
    while (retries > 0) {
      try {
        client = await pool.connect();
        const result = await client.query(text, params);
        return result;
      } catch (err) {
        console.error(`Database query error (${retries} retries left):`, err.message);
        console.error('Query:', text);
        console.error('Params:', params);
        
        // Handle connection timeout/termination errors with retry
        if (err.message.includes('Connection terminated') || 
            err.message.includes('connection timeout') ||
            err.code === 'ECONNRESET' || 
            err.code === 'ETIMEDOUT') {
          
          retries--;
          if (retries > 0) {
            console.log(`🔄 Retrying database query in 1 second... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
        
        // Don't throw the error for common connectivity issues; use offline mode
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === '57P01') {
          console.log('🔄 Database unavailable, returning empty result (offline mode)');
          return { rows: [], rowCount: 0 };
        }
        
        throw err;
      } finally {
        if (client) {
          try {
            client.release();
          } catch (releaseErr) {
            console.warn('Warning: Error releasing database client:', releaseErr.message);
          }
        }
      }
    }
  };
}

export { pool, query, testConnection };
export default pool;
