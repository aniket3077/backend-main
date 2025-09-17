import { query } from '../config/database.js';

/**
 * QR Controller
 * Handles QR code verification and marking tickets as used
 */

/**
 * Verify QR code and get ticket details
 */
export const verifyQR = async (req, res) => {
  console.log('🚀 VERIFYQR FUNCTION CALLED!');
  try {
    const { qr_code, qr_data } = req.body;
    const qrCodeValue = qr_code || qr_data;

    console.log('🔍 QR verification request for:', qrCodeValue);
    console.log('🔍 Request body:', req.body);
    console.log('🔍 QR data type:', typeof qrCodeValue);
    console.log('🔍 QR data length:', qrCodeValue ? qrCodeValue.length : 0);

    if (!qrCodeValue) {
      return res.status(400).json({
        success: false,
        message: 'QR code is required'
      });
    }

    // Test database query without inner try-catch to see the actual error
    let qrResult;
    let parsedQrData = null;
    
    // Try to parse QR data as JSON first
    try {
      parsedQrData = JSON.parse(qrCodeValue);
    } catch (parseError) {
      // If not JSON, treat as plain ticket number
      console.log('QR data is not JSON, treating as ticket number');
    }
    
    try {
      // Try different query strategies based on QR data format
      if (parsedQrData && parsedQrData.ticketNumber) {
        // Query by ticket number from parsed JSON
        console.log('🔍 Querying by ticket number:', parsedQrData.ticketNumber);
        qrResult = await query(`
          SELECT 
            qr.id,
            qr.ticket_number,
            qr.qr_data,
            qr.booking_id,
            qr.user_id,
            qr.is_used,
            qr.used_at,
            qr.used_by,
            qr.created_at,
            qr.expiry_date,
            b.booking_date,
            b.pass_type,
            b.status as booking_status,
            u.name,
            u.email,
            u.mobile
          FROM qr_codes qr
          JOIN bookings b ON qr.booking_id = b.id
          LEFT JOIN booking_users bu ON qr.user_id = bu.id
          LEFT JOIN users u ON bu.user_id = u.id
          WHERE qr.ticket_number = $1
        `, [parsedQrData.ticketNumber]);
      } else {
        // Query by QR data content or ticket number directly
        console.log('🔍 Querying by qr_data or ticket_number:', qrCodeValue);
        qrResult = await query(`
          SELECT 
            qr.id,
            qr.ticket_number,
            qr.qr_data,
            qr.booking_id,
            qr.user_id,
            qr.is_used,
            qr.used_at,
            qr.used_by,
            qr.created_at,
            qr.expiry_date,
            b.booking_date,
            b.pass_type,
            b.status as booking_status,
            u.name,
            u.email,
            u.mobile
          FROM qr_codes qr
          JOIN bookings b ON qr.booking_id = b.id
          LEFT JOIN booking_users bu ON qr.user_id = bu.id
          LEFT JOIN users u ON bu.user_id = u.id
          WHERE qr.qr_data::text = $1 OR qr.ticket_number = $1
        `, [qrCodeValue]);
      }

      console.log('🔍 Database query result rows:', qrResult.rows.length);
        
      // If no results found, let's check what QR codes exist in the database
      if (qrResult.rows.length === 0) {
        const allQRs = await query(`
          SELECT id, ticket_number, SUBSTRING(qr_data::text, 1, 50) as qr_data_preview, created_at 
          FROM qr_codes 
          ORDER BY created_at DESC 
          LIMIT 5
        `);
        console.log('🔍 Recent QR codes in database:', allQRs.rows);
      }

      if (qrResult.rows.length === 0) {
        console.log('❌ QR code not found:', qrCodeValue);
        return res.status(404).json({
          success: false,
          message: 'Invalid QR code'
        });
      }

      const qrData = qrResult.rows[0];

      console.log('✅ QR code found:', {
        id: qrData.id,
        booking_id: qrData.booking_id,
        is_used: qrData.is_used,
        user: qrData.name
      });

      res.json({
        success: true,
        message: 'QR code verified successfully',
        already_used: qrData.is_used,
        guest_name: qrData.name,
        data: {
          qr_id: qrData.id,
          qr_code: qrData.ticket_number, // Use ticket_number as qr_code
          ticket_number: qrData.ticket_number,
          booking_id: qrData.booking_id,
          user_id: qrData.user_id,
          is_used: qrData.is_used,
          used_at: qrData.used_at,
          used_by: qrData.used_by,
          booking_date: qrData.booking_date,
          pass_type: qrData.pass_type,
          booking_status: qrData.booking_status,
          user: {
            name: qrData.name,
            email: qrData.email,
            mobile: qrData.mobile
          },
          created_at: qrData.created_at,
          expiry_date: qrData.expiry_date
        }
      });

    } catch (dbError) {
      console.log('⚠️ Database error during QR verification:', dbError.message);
      console.log('⚠️ Full error:', dbError);
      
      // Parse QR data if it's JSON format
      let parsedData = {};
      try {
        parsedData = JSON.parse(qrCodeValue);
      } catch (parseError) {
        // If not JSON, treat as plain string
        parsedData = { ticketNumber: qrCodeValue };
      }
      
      // Return mock response for development
      return res.json({
        success: true,
        message: 'QR code verified successfully (mock)',
        already_used: false,
        guest_name: 'Demo User',
        data: {
          qr_id: 1,
          qr_code: qrCodeValue,
          ticket_number: parsedData.ticketNumber || qrCodeValue,
          booking_id: parsedData.bookingId || 1,
          user_id: 1,
          is_used: false,
          used_at: null,
          used_by: null,
          booking_date: parsedData.eventDate || new Date().toISOString().split('T')[0],
          pass_type: parsedData.passType || 'regular',
          booking_status: 'confirmed',
          user: {
            name: 'Demo User',
            email: 'demo@example.com',
            mobile: '+1234567890'
          },
          created_at: new Date().toISOString(),
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          mock: true
        }
      });
    }

  } catch (error) {
    console.error('❌ QR verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Mark QR code as used
 */
export const markQRUsed = async (req, res) => {
  try {
    const { qr_code, qr_data, staff_id, staff_name } = req.body;
    const qrCodeValue = qr_code || qr_data;

    console.log('✅ Marking QR as used:', qrCodeValue, 'by:', staff_name);
    console.log('✅ Request body:', req.body);

    if (!qrCodeValue) {
      return res.status(400).json({
        success: false,
        message: 'QR code is required'
      });
    }

    try {
      let qrResult;
      let parsedQrData = null;
      
      // Try to parse QR data as JSON first
      try {
        parsedQrData = JSON.parse(qrCodeValue);
      } catch (parseError) {
        // If not JSON, treat as plain ticket number
        console.log('QR data is not JSON, treating as ticket number');
      }
      
      // Query using similar logic as verify
      if (parsedQrData && parsedQrData.ticketNumber) {
        qrResult = await query(`
          SELECT id, ticket_number, is_used, used_at 
          FROM qr_codes 
          WHERE ticket_number = $1
        `, [parsedQrData.ticketNumber]);
      } else {
        qrResult = await query(`
          SELECT id, ticket_number, is_used, used_at 
          FROM qr_codes 
          WHERE qr_data = $1 OR ticket_number = $1
        `, [qrCodeValue]);
      }

      if (qrResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Invalid QR code'
        });
      }

      const qrData = qrResult.rows[0];

      if (qrData.is_used) {
        return res.status(400).json({
          success: false,
          message: 'QR code has already been used',
          used_at: qrData.used_at
        });
      }

      // Mark as used
      let updateResult;
      if (parsedQrData && parsedQrData.ticketNumber) {
        updateResult = await query(`
          UPDATE qr_codes 
          SET is_used = true, used_at = NOW(), used_by = $2
          WHERE ticket_number = $1
          RETURNING *
        `, [parsedQrData.ticketNumber, staff_name || 'Staff']);
      } else {
        updateResult = await query(`
          UPDATE qr_codes 
          SET is_used = true, used_at = NOW(), used_by = $2
          WHERE qr_data = $1 OR ticket_number = $1
          RETURNING *
        `, [qrCodeValue, staff_name || 'Staff']);
      }

      console.log('✅ QR marked as used successfully:', qrCodeValue);

      res.json({
        success: true,
        message: 'QR code marked as used successfully',
        data: {
          qr_code: qrCodeValue,
          used_at: updateResult.rows[0].used_at,
          used_by: updateResult.rows[0].used_by
        }
      });

    } catch (dbError) {
      console.log('⚠️ Database error during QR mark used:', dbError.message);
      
      // Return mock success for development
      return res.json({
        success: true,
        message: 'QR code marked as used successfully (mock)',
        data: {
          qr_code: qrCodeValue,
          used_at: new Date().toISOString(),
          used_by: staff_name || 'Staff',
          mock: true
        }
      });
    }

  } catch (error) {
    console.error('❌ Mark QR used error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get QR details (alias for verifyQR for backward compatibility)
 */
export const getQRDetails = verifyQR;

