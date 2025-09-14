const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * Authentication Routes
 * Handles login and authentication for QR verifier app
 */

// Login endpoint
router.post('/login', authController.login);

// Get current user info (protected route)
router.get('/me', authController.verifyToken, authController.me);

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
