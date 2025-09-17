import express from 'express';
import * as qrController from '../controllers/qrController.js';

const router = express.Router();

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

// Debug endpoint to list recent QR codes
router.get('/debug/list', async (req, res) => {
  try {
    const { query } = await import('../config/database.js');
    const result = await query(`
      SELECT 
        qr.id,
        qr.ticket_number,
        SUBSTRING(qr.qr_data::text, 1, 100) as qr_data_preview,
        qr.booking_id,
        qr.is_used,
        qr.created_at,
        b.pass_type
      FROM qr_codes qr
      JOIN bookings b ON qr.booking_id = b.id
      ORDER BY qr.created_at DESC 
      LIMIT 10
    `);
    
    res.json({
      success: true,
      qr_codes: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
