import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import your existing routes and middleware
import { testConnection, query } from '../config/database.js';
import * as bookingController from '../controllers/bookingController.js';

dotenv.config();

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://malangevents.com',
  'https://www.malangevents.com',
  'https://backend-main-production-ef63.up.railway.app',
  process.env.FRONTEND_URL,
  process.env.RAILWAY_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('🚫 CORS blocked origin:', origin);
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (PDF tickets) for WhatsApp attachments
app.use('/tickets', express.static('tickets'));

// Initialize database connection on startup
let dbStatus = { connected: false, error: null, lastChecked: null };

async function initializeDatabase() {
  try {
    console.log('🔄 Testing Supabase database connection...');
    const isConnected = await testConnection();
    dbStatus = {
      connected: isConnected,
      error: isConnected ? null : 'Connection failed',
      lastChecked: new Date().toISOString()
    };
    
    if (isConnected) {
      console.log('✅ Supabase database connected successfully');
    } else {
      console.error('❌ Supabase database connection failed');
    }
  } catch (error) {
    console.error('🚨 Database initialization error:', error.message);
    dbStatus = {
      connected: false,
      error: error.message,
      lastChecked: new Date().toISOString()
    };
  }
}

// Initialize database connection
initializeDatabase();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Railway Serverless API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    supabase: {
      configured: !!process.env.DATABASE_URL,
      host: process.env.DATABASE_URL ? 'supabase.co' : 'not configured'
    }
  });
});

// Booking routes
app.post('/api/bookings/create', async (req, res) => {
  try {
    await bookingController.createBooking(req, res);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/bookings/add-users', async (req, res) => {
  try {
    await bookingController.addUserDetails(req, res);
  } catch (error) {
    console.error('Add users error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/bookings/create-payment', async (req, res) => {
  try {
    await bookingController.createPayment(req, res);
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/bookings/confirm-payment', async (req, res) => {
  try {
    await bookingController.confirmPayment(req, res);
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// QR verification details endpoint
app.post('/api/bookings/qr-details', async (req, res) => {
  try {
    await bookingController.getQRDetails(req, res);
  } catch (error) {
    console.error('QR details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark ticket as used endpoint
app.post('/api/bookings/mark-used', async (req, res) => {
  try {
    await bookingController.markTicketUsed(req, res);
  } catch (error) {
    console.error('Mark used error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mobile app QR endpoints (aliases for the booking endpoints)
app.post('/api/qr/verify', async (req, res) => {
  try {
    await bookingController.getQRDetails(req, res);
  } catch (error) {
    console.error('QR verify error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/qr/mark-used', async (req, res) => {
  try {
    await bookingController.markTicketUsed(req, res);
  } catch (error) {
    console.error('QR mark used error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test WhatsApp endpoint
app.post('/api/bookings/test-whatsapp', async (req, res) => {
  try {
    await bookingController.testWhatsApp(req, res);
  } catch (error) {
    console.error('Test WhatsApp error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pricing information endpoint
app.get('/api/bookings/pricing', async (req, res) => {
  try {
    await bookingController.getPricingInfo(req, res);
  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// WhatsApp configuration check endpoint
app.get('/api/config/whatsapp', (req, res) => {
  const config = {
    aisensy: {
      configured: !!(process.env.AISENSY_API_KEY && process.env.AISENSY_API_URL && process.env.AISENSY_CAMPAIGN_NAME),
      apiKey: process.env.AISENSY_API_KEY ? '***configured***' : 'missing',
      apiUrl: process.env.AISENSY_API_URL ? process.env.AISENSY_API_URL : 'missing',
      campaignName: process.env.AISENSY_CAMPAIGN_NAME ? process.env.AISENSY_CAMPAIGN_NAME : 'missing',
      validKey: !!(process.env.AISENSY_API_KEY && process.env.AISENSY_API_KEY !== 'your-aisensy-api-key')
    },
    server: {
      serverUrl: process.env.SERVER_URL || process.env.PUBLIC_URL || 'missing',
      railwayUrl: process.env.RAILWAY_URL || 'missing',
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  };
  
  res.json({
    success: true,
    message: 'WhatsApp configuration status',
    config
  });
});

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('🔄 Testing database connection...');
    const isConnected = await testConnection();
    
    // Update status
    dbStatus = {
      connected: isConnected,
      error: isConnected ? null : 'Connection test failed',
      lastChecked: new Date().toISOString()
    };
    
    res.json({ 
      success: isConnected, 
      message: isConnected ? 'Supabase database connected' : 'Supabase database connection failed',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      connectionString: process.env.DATABASE_URL ? 'configured' : 'missing'
    });
  } catch (error) {
    console.error('🚨 Database test error:', error);
    dbStatus = {
      connected: false,
      error: error.message,
      lastChecked: new Date().toISOString()
    };
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString(),
      database: dbStatus
    });
  }
});

// Specific Supabase test endpoint
app.get('/api/test-supabase', async (req, res) => {
  try {
    console.log('🔄 Testing Supabase specifically...');
    
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        success: false,
        error: 'DATABASE_URL environment variable not set',
        supabase: { configured: false }
      });
    }
    
    // Test with a simple query
    const result = await query('SELECT version(), current_database(), current_user;');
    
    res.json({
      success: true,
      message: 'Supabase connection successful',
      supabase: {
        configured: true,
        database: result.rows[0].current_database,
        user: result.rows[0].current_user,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('🚨 Supabase test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      supabase: { configured: !!process.env.DATABASE_URL },
      timestamp: new Date().toISOString()
    });
  }
});

// Default route
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Malang Dandiya API - Railway Serverless',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      bookings: '/api/bookings/*',
      testDb: '/api/test-db'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Serverless API Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler - use correct Express pattern
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: {
      health: 'GET /health',
      root: 'GET /',
      createBooking: 'POST /api/bookings/create',
      addUsers: 'POST /api/bookings/add-users',
      createPayment: 'POST /api/bookings/create-payment',
      confirmPayment: 'POST /api/bookings/confirm-payment',
      qrDetails: 'POST /api/bookings/qr-details',
      markUsed: 'POST /api/bookings/mark-used',
      qrVerify: 'POST /api/qr/verify',
      qrMarkUsed: 'POST /api/qr/mark-used',
      testWhatsApp: 'POST /api/bookings/test-whatsapp',
      getPricing: 'GET /api/bookings/pricing',
      whatsappConfig: 'GET /api/config/whatsapp',
      testDb: 'GET /api/test-db'
    }
  });
});

export default app;

// For local testing and Railway deployment
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Railway Serverless API running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API endpoints: http://localhost:${PORT}/api/`);
  });
}