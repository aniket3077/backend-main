const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrController');

/**
 * QR Routes
 * Handles QR code verification and marking for QR verifier app
 */

// Verify QR code endpoint
router.post('/verify', qrController.verifyQR);

// Mark QR code as used endpoint
router.post('/mark-used', qrController.markQRUsed);

// Get QR details (alias for verify)
router.post('/details', qrController.getQRDetails);

// Health check for QR service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'QR service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
