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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Railway Serverless API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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
    await bookingController.addUsers(req, res);
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

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const isConnected = await testConnection();
    res.json({ 
      success: isConnected, 
      message: isConnected ? 'Database connected' : 'Database offline',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

export default app;