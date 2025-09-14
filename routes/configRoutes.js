const express = require('express');
const router = express.Router();
const cloudinaryService = require('../services/cloudinaryService');
const whatsappService = require('../services/whatsappService');

/**
 * Get system configuration status
 */
router.get('/status', (req, res) => {
  try {
    const cloudinaryStatus = cloudinaryService.getStatus();
    const isProduction = process.env.NODE_ENV === 'production';
    
    const status = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      isProduction,
      services: {
        cloudinary: {
          configured: cloudinaryStatus.configured,
          ready: cloudinaryService.isReady(),
          details: cloudinaryStatus
        },
        email: {
          resend: {
            configured: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'your-resend-api-key-here'),
            hasApiKey: !!process.env.RESEND_API_KEY
          },
          smtp: {
            configured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS)
          }
        },
        whatsapp: {
          configured: !!process.env.AISENSY_API_KEY,
          apiKey: process.env.AISENSY_API_KEY ? '***configured***' : 'missing',
          validKey: !!(process.env.AISENSY_API_KEY && process.env.AISENSY_API_KEY !== 'your-aisensy-api-key')
        },
        database: {
          configured: !!(process.env.DATABASE_URL && process.env.PG_SSL)
        },
        firebase: {
          configured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_API_KEY)
        },
        payment: {
          razorpay: {
            configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
            testMode: process.env.RAZORPAY_KEY_ID?.includes('test') || process.env.RAZORPAY_KEY_ID === 'your_razorpay_key_id_here'
          }
        }
      },
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      details: error.message
    });
  }
});

/**
 * Test Cloudinary upload with a sample file
 */
router.post('/test-cloudinary', async (req, res) => {
  try {
    if (!cloudinaryService.isReady()) {
      return res.status(400).json({
        success: false,
        error: 'Cloudinary not configured',
        details: 'Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env'
      });
    }

    // Create a test text file
    const fs = require('fs');
    const path = require('path');
    const testFilePath = path.join(__dirname, '../tickets/test-upload.txt');
    
    // Ensure tickets directory exists
    const ticketsDir = path.dirname(testFilePath);
    if (!fs.existsSync(ticketsDir)) {
      fs.mkdirSync(ticketsDir, { recursive: true });
    }
    
    fs.writeFileSync(testFilePath, `Test file created at ${new Date().toISOString()}\nThis is a test upload to Cloudinary.`);

    const result = await cloudinaryService.uploadFile(testFilePath, {
      folder: 'dandiya-tests',
      public_id: `test-${Date.now()}`
    });

    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    if (result.success) {
      res.json({
        success: true,
        message: 'Cloudinary test upload successful',
        result: {
          url: result.url,
          publicId: result.publicId,
          bytes: result.bytes,
          format: result.format
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Cloudinary upload failed',
        details: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Test upload failed',
      details: error.message
    });
  }
});

/**
 * Test WhatsApp messaging
 */
router.post('/test-whatsapp', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber and message are required'
      });
    }

    const result = await whatsappService.sendTextMessage(phoneNumber, message);

    res.json({
      success: result.success,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'WhatsApp test failed',
      details: error.message
    });
  }
});

module.exports = router;
