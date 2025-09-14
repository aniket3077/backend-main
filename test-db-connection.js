// Test script to debug Supabase connection on Railway
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Client } = pkg;

console.log('🔍 Testing Supabase connection...');
console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

// Parse the URL
const dbUrl = new URL(process.env.DATABASE_URL);
console.log('Host:', dbUrl.hostname);
console.log('Port:', dbUrl.port);
console.log('Database:', dbUrl.pathname.slice(1));
console.log('Username:', dbUrl.username);

// Test with individual connection parameters (IPv4 forced)
const client = new Client({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port) || 5432,
  database: dbUrl.pathname.slice(1),
  user: dbUrl.username,
  password: dbUrl.password,
  ssl: {
    rejectUnauthorized: false,
    sslmode: 'require'
  },
  family: 4, // Force IPv4
  statement_timeout: 30000,
  query_timeout: 30000,
  connectionTimeoutMillis: 15000,
});

async function testConnection() {
  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    
    console.log('✅ Connected! Testing query...');
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    console.log('✅ Query successful!');
    console.log('Time:', result.rows[0].current_time);
    console.log('Version:', result.rows[0].version);
    
    // Test if bookings table exists
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'bookings'
    `);
    
    if (tableCheck.rows.length > 0) {
      console.log('✅ Bookings table exists');
      
      // Test a simple count query
      const countResult = await client.query('SELECT COUNT(*) as count FROM bookings');
      console.log('📊 Total bookings:', countResult.rows[0].count);
    } else {
      console.log('⚠️ Bookings table does not exist');
    }
    
    await client.end();
    console.log('✅ Connection test completed successfully');
    
  } catch (error) {
    console.error('❌ Connection test failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error address:', error.address);
    console.error('Error port:', error.port);
    console.error('Full error:', error);
  }
}

testConnection();