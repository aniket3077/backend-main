// Database health check utility
let _databaseHealthy = false;
let _lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

async function checkDatabaseHealth(prismaClient) {
  const now = Date.now();
  
  // Skip check if recently checked and was healthy
  if (_databaseHealthy && (now - _lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
    return true;
  }
  
  try {
    // Simple query to test connection
    await prismaClient.$queryRaw`SELECT 1`;
    _databaseHealthy = true;
    _lastHealthCheck = now;
    console.log('✅ Database health check passed');
    return true;
  } catch (error) {
    _databaseHealthy = false;
    _lastHealthCheck = now;
    console.log('❌ Database health check failed:', error.message);
    return false;
  }
}

module.exports = { checkDatabaseHealth };
