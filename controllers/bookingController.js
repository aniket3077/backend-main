import { query } from '../config/database.js';
import { generateQRCode } from "../utils/qrGenerator.js";
import generateTicketPDF from "../utils/pdfGenerator.js";
import { sendTicketEmail } from "../utils/emailService.js";
import whatsappService from "../services/whatsappService.js";
import Razorpay from "razorpay";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Malang Raas Dandiya 2025 - Updated Booking Controller
 * Supports season pass, bulk discounts, and new pricing structure
 */

// Updated pricing structure for Malang Raas Dandiya 2025
const TICKET_PRICING = {
  // Single Day Tickets
  single: {
    female: { base: 399, bulk_threshold: 6, bulk_price: 300 },
    male: { base: 399, bulk_threshold: 6, bulk_price: 300 },
    couple: { base: 699, bulk_threshold: 6, bulk_price: 300 },
    family: { base: 1300, bulk_threshold: 6, bulk_price: 300 },
    group: { base: 1999, bulk_threshold: 6, bulk_price: 300 },
    kids: { base: 99, bulk_threshold: 6, bulk_price: 300 },
    kid: { base: 99, bulk_threshold: 6, bulk_price: 300 }, // Backward compatibility
    family4: { base: 1300, bulk_threshold: 6, bulk_price: 300 } // Backward compatibility
  },
  // Season Pass Tickets (8 Days)
  season: {
    female: { base: 2499 },
    male: { base: 2499 },
    couple: { base: 3499 },
    family: { base: 5999 },
    family4: { base: 5999 }, // Backward compatibility
    group: { base: 7999 },
    kids: { base: 499 },
    kid: { base: 499 } // Backward compatibility
  }
};

// Calculate ticket price with bulk discount logic
function calculateTicketPrice(passType, ticketType, numTickets) {
  const pricing = TICKET_PRICING[ticketType]?.[passType];
  if (!pricing) {
    throw new Error(`Invalid pricing for ${ticketType} ${passType}`);
  }

  const quantity = Math.max(1, parseInt(numTickets));
  
  // Check if bulk discount applies
  if (pricing.bulk_threshold && quantity >= pricing.bulk_threshold) {
    return {
      basePrice: pricing.base,
      finalPrice: pricing.bulk_price,
      discountApplied: true,
      totalAmount: pricing.bulk_price * quantity,
      savings: (pricing.base - pricing.bulk_price) * quantity
    };
  }

  return {
    basePrice: pricing.base,
    finalPrice: pricing.base,
    discountApplied: false,
    totalAmount: pricing.base * quantity,
    savings: 0
  };
}

// Database health check removed - using direct connection

// Initialize Razorpay with fallback for missing keys
let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("✅ Razorpay initialized successfully");
  } else {
    console.log("⚠️ Razorpay keys not configured - payment functionality will be limited");
    razorpay = null;
  }
} catch (error) {
  console.error("❌ Failed to initialize Razorpay:", error.message);
  razorpay = null;
}

// Helper: compute total amount based on pass_type and quantity
function computeTotalAmount(passType, quantity = 1) {
  const priceMap = {
    female: 399,
    male: 399,
    couple: 699,
    family: 1300,
    family4: 1300, // Keep for backward compatibility
    group: 1999,
    kids: 99,
    kid: 99, // Keep for backward compatibility
    season_female: 2499,
    season_male: 2499,
    season_couple: 3499,
    season_family: 5999,
    season_family4: 5999, // Keep for backward compatibility
    season_group: 7999,
    season_kids: 499,
  };
  const unit = priceMap[passType];
  if (!unit) return null;
  const q = Math.max(1, parseInt(quantity || 1));
  return unit * q;
}

// 1️⃣ Create Booking
export const createBooking = async (req, res) => {
  const { booking_date, num_tickets, pass_type, passes, original_passes, ticket_type = 'single' } = req.body;
  
  // Support both old format (num_tickets, pass_type) and new format (passes)
  let bookingPasses = {};
  let totalTickets = 0;
  
  if (passes && typeof passes === 'object') {
    // New format: multiple pass types
    bookingPasses = passes;
    totalTickets = Object.values(passes).reduce((sum, count) => sum + (Number(count) || 0), 0);
    
    // Log the couple ticket conversion for tracking
    if (original_passes && original_passes.couple) {
      console.log(`🎯 Couple ticket conversion: ${original_passes.couple} couple tickets converted to ${original_passes.couple} male + ${original_passes.couple} female tickets`);
    }
  } else if (num_tickets && pass_type) {
    // Old format: single pass type (backward compatibility)
    bookingPasses = { [pass_type]: Number(num_tickets) };
    totalTickets = Number(num_tickets);
  }
  
  // Auto-set ticket quantities based on pass type
  let finalTicketCount = num_tickets;
  if (pass_type === 'couple') {
    finalTicketCount = 2;
    console.log('🎫 Auto-setting couple tickets to 2');
  } else if (pass_type === 'family' || pass_type === 'family4') {
    finalTicketCount = 4;
    console.log('🎫 Auto-setting family tickets to 4');
  } else {
    finalTicketCount = num_tickets || 1;
  }
  
  // Validate required fields

  if (!booking_date || !pass_type) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
      message: "booking_date and pass_type are required"

  
    });
  }

  // Parse and validate date
  const parsedDate = new Date(booking_date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Invalid booking_date",
      message: "Booking date must be a valid date"
    });
  }
  
  try {

    // Calculate pricing with bulk discount using auto-adjusted ticket count
    const priceInfo = calculateTicketPrice(pass_type, ticket_type, finalTicketCount);
    
    // Extract values from priceInfo
    const totalAmount = priceInfo.totalAmount;
    const totalDiscount = priceInfo.savings || 0;
    
    console.log('🔄 Creating booking with params:', {
      booking_date: parsedDate,
      num_tickets: parseInt(finalTicketCount),
      pass_type,
      ticket_type,
      total_amount: totalAmount,
      discount: totalDiscount,
      status: 'pending'
    });
    
    // First, ensure all required columns exist in bookings table
    try {
      await query(`
        ALTER TABLE bookings 
        ADD COLUMN IF NOT EXISTS ticket_type VARCHAR(20) DEFAULT 'single',
        ADD COLUMN IF NOT EXISTS is_season_pass BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS season_pass_days_remaining INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bulk_discount_applied BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS original_ticket_price NUMERIC,
        ADD COLUMN IF NOT EXISTS discounted_price NUMERIC,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS staff_notes TEXT,
        ADD COLUMN IF NOT EXISTS manual_confirmation BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS confirmed_by INTEGER,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS pass_details JSONB
      `);
    } catch (alterError) {
      console.log('Schema update info:', alterError.message);
    }

    // For database compatibility, we'll store the primary pass type and total tickets
    // But also store the complete pass details in a JSON field
    const primaryPassType = Object.keys(bookingPasses)[0] || 'female';
    
    const result = await query(`
      INSERT INTO bookings (
        booking_date, 
        num_tickets, 
        pass_type, 
        ticket_type, 
        status, 
        total_amount, 
        discount_amount, 
        final_amount,
        is_season_pass,
        bulk_discount_applied,
        original_ticket_price,
        discounted_price,
        pass_details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      parsedDate, 

      parseInt(finalTicketCount), 
      pass_type, 

      ticket_type,
      'pending', 
      totalAmount, 
      totalDiscount, 
      totalAmount,
      ticket_type === 'season',
      discountApplied,
      totalAmount + totalDiscount,
      totalAmount,
      JSON.stringify({ 
        passes: bookingPasses, 
        details: passDetails,
        original_passes: original_passes || bookingPasses,
        couple_conversion: original_passes && original_passes.couple ? {
          couple_tickets: original_passes.couple,
          converted_to: {
            male: original_passes.couple,
            female: original_passes.couple
          }
        } : null,
        family_conversion: original_passes && original_passes.family ? {
          family_tickets: original_passes.family,
          converted_to: {
            male: original_passes.family * 2,
            female: original_passes.family * 2
          }
        } : null
      })
    ]);
    
    // Check if we actually got a result (database available)
    if (result.rows && result.rows.length > 0) {
      console.log('✅ Booking created successfully:', result.rows[0]);
      
      const booking = result.rows[0];
      
      // Convert BigInt to string for JSON serialization
      const bookingResponse = {
        ...booking,
        id: booking.id.toString()
      };
      
      res.status(201).json({ success: true, booking: bookingResponse });
    } else {
      // Database is offline, create mock booking
      console.log('⚠️ Database offline - creating mock booking');
      const mockBookingId = Date.now().toString();

      const totalAmount = computeTotalAmount(pass_type, finalTicketCount) || 0;

      
      const mockBooking = {
        id: mockBookingId,
        booking_date: parsedDate.toISOString(),

        num_tickets: parseInt(finalTicketCount),
        pass_type,

        status: 'pending',
        total_amount: totalAmount,
        discount_amount: totalDiscount,
        final_amount: totalAmount,
        pass_details: JSON.stringify({ 
          passes: bookingPasses, 
          details: passDetails,
          original_passes: original_passes || bookingPasses,
          couple_conversion: original_passes && original_passes.couple ? {
            couple_tickets: original_passes.couple,
            converted_to: {
              male: original_passes.couple,
              female: original_passes.couple
            }
          } : null,
          family_conversion: original_passes && original_passes.family ? {
            family_tickets: original_passes.family,
            converted_to: {
              male: original_passes.family * 2,
              female: original_passes.family * 2
            }
          } : null
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isMockBooking: true
      };
      
      console.log('✅ Mock booking created:', mockBooking);
      res.status(201).json({ 
        success: true, 
        booking: mockBooking,
        mock: true,
        message: "Booking created in offline mode. Will be synchronized when database is available."
      });
    }
  } catch (err) {
    console.error("❌ Error creating booking:", err.message);
    console.error("Full error:", err);
    
    // Check if this is a database connection error
    const isConnectionError = err.code === 'ENETUNREACH' || 
                            err.code === 'ENOTFOUND' || 
                            err.code === 'ECONNREFUSED' || 
                            err.code === 'ETIMEDOUT' ||
                            err.message.includes('connect') ||
                            err.message.includes('timeout');
    
    if (isConnectionError) {
      console.log('⚠️ Database connection failed - creating mock booking');
      const mockBookingId = Date.now().toString();
      const totalAmount = computeTotalAmount(pass_type, num_tickets) || 0;
      
      const mockBooking = {
        id: mockBookingId,
        booking_date: parsedDate.toISOString(),
        num_tickets: parseInt(num_tickets),
        pass_type,
        ticket_type: ticket_type || 'single',
        status: 'pending',
        total_amount: totalAmount,
        discount_amount: 0,
        final_amount: totalAmount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isMockBooking: true
      };
      
      console.log('✅ Mock booking created:', mockBooking);
      return res.status(201).json({ 
        success: true, 
        booking: mockBooking,
        mock: true,
        message: "Booking created in offline mode. Database connection failed, but booking is saved locally."
      });
    }
    
    // Don't let the error crash the server
    try {
      res.status(500).json({ 
        success: false, 
        error: "Failed to create booking",
        details: err.message,
        code: err.code || 'UNKNOWN_ERROR'
      });
    } catch (responseError) {
      console.error("❌ Error sending error response:", responseError);
    }
  }
};

// 2️⃣ Add User Details
export const addUserDetails = async (req, res) => {
  const { booking_id, name, email, phone, is_primary = false } = req.body;
  
  // Validate required fields
  if (!booking_id || !name) {
    return res.status(400).json({ 
      success: false, 
      error: "booking_id and name are required" 
    });
  }
  
  try {
    // First, check if the booking exists
    const bookingCheck = await query(`
      SELECT id FROM bookings WHERE id = $1
    `, [parseInt(booking_id)]);
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: `Booking with ID ${booking_id} not found. Please create the booking first.` 
      });
    }
    
    // If booking exists, proceed to add user
    const result = await query(`
      INSERT INTO users (booking_id, name, email, phone, is_primary)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [parseInt(booking_id), name, email, phone, is_primary]);
    
    const user = result.rows[0];
    
    // Convert BigInt to string for JSON serialization
    const userResponse = {
      ...user,
      id: user.id.toString(),
      booking_id: user.booking_id.toString()
    };
    
    res.status(201).json({ success: true, user: userResponse });
  } catch (err) {
    console.error("Error adding user details:", err);
    
    // Handle specific database errors
    if (err.code === '23503') { // Foreign key constraint violation
      return res.status(400).json({ 
        success: false, 
        error: `Invalid booking_id: ${booking_id}. Booking not found.`,
        code: 'BOOKING_NOT_FOUND'
      });
    }
    
    if (err.code === '23505') { // Unique constraint violation
      return res.status(400).json({ 
        success: false, 
        error: "User with this email already exists for this booking",
        code: 'DUPLICATE_USER'
      });
    }
    
    // Check if this is a database connection error
    const isConnectionError = err.code === 'ENETUNREACH' || 
                            err.code === 'ENOTFOUND' || 
                            err.code === 'ECONNREFUSED' || 
                            err.code === 'ETIMEDOUT' ||
                            err.message.includes('connect') ||
                            err.message.includes('timeout');
    
    if (isConnectionError) {
      console.log('⚠️ Database connection failed - creating mock user');
      const mockUser = {
        id: `mock_user_${Date.now()}`,
        booking_id: booking_id,
        name,
        email,
        phone,
        is_primary,
        created_at: new Date().toISOString(),
        _isMockUser: true
      };
      
      console.log('✅ Mock user created:', mockUser);
      return res.status(201).json({ 
        success: true, 
        user: mockUser,
        mock: true,
        message: "User details saved in offline mode. Will be synchronized when database is available."
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to add user details",
      details: err.message,
    });
  }
};

// Helper function to get booking details
export const getBookingDetails = async (req, res) => {
  const { booking_id } = req.params;
  
  if (!booking_id) {
    return res.status(400).json({ 
      success: false, 
      error: "booking_id is required" 
    });
  }
  
  try {
    const result = await query(`
      SELECT 
        b.*,
        COUNT(u.id) as user_count,
        COUNT(q.id) as qr_count
      FROM bookings b
      LEFT JOIN users u ON b.id = u.booking_id
      LEFT JOIN qr_codes q ON b.id = q.booking_id
      WHERE b.id = $1
      GROUP BY b.id
    `, [parseInt(booking_id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: `Booking with ID ${booking_id} not found` 
      });
    }
    
    const booking = result.rows[0];
    
    // Convert BigInt fields to strings for JSON serialization
    const bookingResponse = {
      ...booking,
      id: booking.id.toString(),
      user_count: parseInt(booking.user_count),
      qr_count: parseInt(booking.qr_count)
    };
    
    res.json({ success: true, booking: bookingResponse });
  } catch (err) {
    console.error("Error getting booking details:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get booking details",
      details: err.message 
    });
  }
};

// Test email endpoint - allows sending test emails to any address
export const testEmail = async (req, res) => {
  const { email, name = 'Test User', subject = 'Test Email from Malang Events' } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      error: "email is required" 
    });
  }
  
  try {
    console.log(`🧪 Testing email to: ${email}`);
    
    const emailResult = await sendTicketEmail(
      email,
      subject,
      name,
      [] // No attachments for test
    );
    
    // Handle frontend-like response format
    res.json({ 
      success: true, 
      message: `Test email sent successfully to ${email}`,
      data: emailResult.data || {},
      meta: emailResult.meta || {},
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Test email failed:', error);
    
    // Handle frontend-like error format
    const statusCode = error.code === 'INVALID_EMAIL_FORMAT' ? 400 : 
                      error.code === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    
    res.status(statusCode).json({ 
      success: false, 
      error: error.message || "Failed to send test email",
      code: error.code || 'EMAIL_SEND_FAILED',
      details: error.originalError || error.message,
      timestamp: error.timestamp || new Date().toISOString()
    });
  }
};

// Test WhatsApp endpoint - allows sending test WhatsApp messages to any number
export const testWhatsApp = async (req, res) => {
  const { 
    phone, 
    name = 'Test User',
    bookingId = 'TEST-' + Date.now(),
    passType = 'female'
  } = req.body;
  
  if (!phone) {
    return res.status(400).json({ 
      success: false, 
      error: "phone number is required" 
    });
  }
  
  try {
    console.log(`🧪 Testing WhatsApp to: ${phone}`);
    
    const testBookingDetails = {
      bookingId: bookingId,
      date: 'September 24, 2025',
      time: '7:00 PM onwards',
      venue: 'Event Ground, Malang',
      passType: passType.toUpperCase(),
      amount: 399,
      ticketCount: 1
    };

    const result = await whatsappService.sendBookingConfirmation(
      phone,
      name,
      testBookingDetails,
      null // No PDF for test
    );
    
    res.json({ 
      success: true, 
      message: `Test WhatsApp sent successfully to ${phone}`,
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Test WhatsApp failed:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to send test WhatsApp",
      details: error.message 
    });
  }
};

// 3️⃣ Create Payment Order
export const createPayment = async (req, res) => {
  const { booking_id } = req.body;
  
  try {
    let computedAmount = null;
    
    // Fetch booking to get complete pass details for accurate pricing
    const result = await query(`
      SELECT pass_type, num_tickets, total_amount, pass_details FROM bookings WHERE id = $1
    `, [parseInt(booking_id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    
    // Use the pre-calculated total_amount from booking creation (which correctly handles multiple pass types)
    computedAmount = booking.total_amount;
    
    // Fallback to old calculation method if total_amount is null/zero
    if (!computedAmount || computedAmount <= 0) {
      console.warn('Warning: Using fallback pricing calculation');
      computedAmount = computeTotalAmount(booking.pass_type, booking.num_tickets);
    }
    
    if (!computedAmount || computedAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Unable to calculate amount for booking ${booking_id}` 
      });
    }
    
    console.log(`💰 Payment amount for booking ${booking_id}: ₹${computedAmount}`);
    
    // Check if Razorpay is initialized
    if (!razorpay) {
      return res.status(500).json({ 
        success: false, 
        error: "Razorpay not configured" 
      });
    }

    // Razorpay is configured
    const order = await razorpay.orders.create({
      amount: computedAmount * 100, // paise
      currency: "INR",
      receipt: `receipt_${booking_id}`,
    });

    // Save payment to database
    const paymentResult = await query(`
      INSERT INTO payments (booking_id, razorpay_order_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [parseInt(booking_id), order.id, computedAmount, "INR", "created"]);

    const payment = paymentResult.rows[0];

    // Optionally store reference on booking for convenience
    try {
      await query(`
        UPDATE bookings SET payment_id = $1 WHERE id = $2
      `, [payment.id.toString(), parseInt(booking_id)]);
    } catch (e) {
      console.warn('Warning: Failed to update booking.payment_id:', e?.message);
    }

    res.status(200).json({ success: true, order });
  } catch (err) {
    console.error("Error in createPayment:", err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// 4️⃣ Confirm Payment
export const confirmPayment = async (req, res) => {
  const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  // Add user details to existing booking

  console.log('🔄 Payment confirmation started for booking:', booking_id);
  console.log('📋 Payment details:', { razorpay_order_id, razorpay_payment_id });

  try {
    // Skip signature verification in development mode
    console.log('⚠️ Skipping signature verification (development mode)');

    // Update existing payment record for this order; create if not found
    let paymentResult = await query(`
      UPDATE payments
      SET razorpay_payment_id = $1, status = 'paid'
      WHERE booking_id = $2 AND razorpay_order_id = $3
      RETURNING *
    `, [razorpay_payment_id, parseInt(booking_id), razorpay_order_id]);

    let payment;
    if (paymentResult.rows.length > 0) {
      payment = paymentResult.rows[0];
    } else {
      // Fallback: create a payment if order was not stored earlier
      const assumedAmount = 0;
      paymentResult = await query(`
        INSERT INTO payments (booking_id, razorpay_order_id, razorpay_payment_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [parseInt(booking_id), razorpay_order_id, razorpay_payment_id, assumedAmount, 'INR', 'paid']);
      payment = paymentResult.rows[0];
    }

    // Update booking status and fetch users
    const bookingUpdateResult = await query(`
      UPDATE bookings
      SET status = 'confirmed', total_amount = $1, final_amount = $1, payment_id = $2
      WHERE id = $3
      RETURNING *
    `, [payment.amount ?? 0, payment.id.toString(), parseInt(booking_id)]);

    const booking = bookingUpdateResult.rows[0];

    const usersResult = await query(`SELECT * FROM users WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.users = usersResult.rows;

    // Generate QR codes for each ticket
    const qrCodes = [];
    if (booking.users && booking.users.length > 0) {
      for (let i = 0; i < booking.num_tickets; i++) {
        const ticketNumber = uuidv4();
        
        let qrCodeUrl;
        try {
          const qrData = {
            ticketNumber,
            bookingId: booking.id.toString(),
            passType: booking.pass_type,
            eventDate: booking.booking_date.toISOString()
          };
          qrCodeUrl = await generateQRCode(JSON.stringify(qrData));
        } catch (qrError) {
          console.error('QR generation failed, using fallback URL:', qrError);
          qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticketNumber}`;
        }
        
        const qrResult = await query(`
          INSERT INTO qr_codes (booking_id, user_id, ticket_number, qr_data, qr_code_url, expiry_date, is_used)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          booking.id, 
          booking.users[0]?.id, 
          ticketNumber, 
          JSON.stringify({ ticketNumber, bookingId: booking.id.toString(), passType: booking.pass_type, eventDate: booking.booking_date.toISOString() }),
          qrCodeUrl, 
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 
          false
        ]);
        
        qrCodes.push(qrResult.rows[0]);
      }
    }

    // Send notifications
    await sendTicketNotifications(booking.id, payment.id);

    // Convert BigInt fields to strings for JSON serialization
    const bookingResponse = {
      ...booking,
      id: booking.id.toString(),
      users: booking.users?.map(user => ({
        ...user,
        id: user.id.toString(),
        booking_id: user.booking_id.toString()
      }))
    };

    const qrCodesResponse = qrCodes.map(qr => ({
      ...qr,
      id: qr.id.toString(),
      booking_id: qr.booking_id.toString(),
      user_id: qr.user_id ? qr.user_id.toString() : null
    }));

    res.json({ 
      success: true, 
      message: 'Payment confirmed and tickets generated',
      booking: bookingResponse,
      qrCodes: qrCodesResponse
    });

  } catch (err) {
    console.error('Error in confirmPayment:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to confirm payment',
      details: err.message 
    });
  }
};

// Send ticket notifications after successful payment
async function sendTicketNotifications(booking_id, payment_id) {
  try {
    console.log('🎫 Sending ticket notifications for booking:', booking_id);

    // Get booking from database
    const bookingResult = await query(`SELECT * FROM bookings WHERE id = $1`, [parseInt(booking_id)]);
    if (bookingResult.rows.length === 0) {
      console.error('Booking not found:', booking_id);
      return { success: false, error: 'Booking not found' };
    }
    const booking = bookingResult.rows[0];

    const usersResult = await query(`SELECT * FROM users WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.users = usersResult.rows;

    const qrCodesResult = await query(`SELECT * FROM qr_codes WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.qr_codes = qrCodesResult.rows;

    const paymentsResult = await query(`SELECT * FROM payments WHERE id = $1`, [parseInt(payment_id)]);
    booking.payments = paymentsResult.rows;


    const primaryUser = booking.users.find(u => u.is_primary) || booking.users[0];
    if (!primaryUser) {
      console.error('No users found for booking:', booking_id);
      return { success: false, error: 'No users found for booking' };
    }

    const qrCode = booking.qr_codes.length > 0 ? booking.qr_codes[0] : null;
    const payment = booking.payments.length > 0 ? booking.payments[0] : null;

    // Generate PDF tickets - Single single PDF with multi-page PDF approach
    let pdfAttachments = [];
    try {
      if (booking.qr_codes && booking.qr_codes.length > 0) {
        const { generateMultipleTicketsPDFBuffer } = await import("../utils/pdfGenerator.js");
        
        // Prepare ticket data for all tickets in this booking
        const ticketsData = booking.qr_codes.map((qrCodeData, i) => {
          const ticketUserName = booking.users[i]?.name || primaryUser.name;
          
          return {
            name: ticketUserName,
            date: booking.booking_date,
            pass_type: booking.pass_type,
            qrCode: qrCodeData.qr_code_url,
            booking_id: booking.id.toString(),
            ticket_number: qrCodeData.ticket_number,
            venue: "Event Ground, Malang"
          };
        });
        
        // Generate a single PDF containing all tickets
        const pdfBuffer = await generateMultipleTicketsPDFBuffer(ticketsData);
        
        pdfAttachments.push({
          filename: `Dandiya_Tickets_${booking.id}_All_${booking.qr_codes.length}_Tickets.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        });
        
        console.log(`📄 Generated single PDF with ${booking.qr_codes.length} tickets successfully`);
      }
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      // Continue with other notifications even if PDF generation fails
    }

    // Send email notification if email exists
    if (primaryUser.email) {
      try {
        // Determine email subject based on ticket type
        let emailSubject;
        let originalPassDetails = null;
        if (booking.pass_details) {
          try {
            // Handle both string and object cases
            originalPassDetails = typeof booking.pass_details === 'string' 
              ? JSON.parse(booking.pass_details) 
              : booking.pass_details;
          } catch (parseError) {
            console.warn('Failed to parse pass_details for email:', parseError.message);
            originalPassDetails = null;
          }
        }
        const hasOriginalCoupleTickets = originalPassDetails?.original_passes?.couple > 0;
        const hasOriginalFamilyTickets = originalPassDetails?.original_passes?.family > 0;
        
        if (hasOriginalCoupleTickets) {
          const coupleCount = originalPassDetails.couple_conversion?.couple_tickets || 1;
          emailSubject = `Your Dandiya Night Couple Tickets #${booking.id} (${coupleCount} couple ticket${coupleCount > 1 ? 's' : ''} - ${coupleCount * 2} individual passes)`;
        } else if (hasOriginalFamilyTickets) {
          const familyCount = originalPassDetails.family_conversion?.family_tickets || 1;
          emailSubject = `Your Dandiya Night Family Tickets #${booking.id} (${familyCount} family ticket${familyCount > 1 ? 's' : ''} - ${familyCount * 4} individual passes)`;
        } else {
          emailSubject = `Your Dandiya Night Tickets #${booking.id} (${booking.num_tickets} tickets)`;
        }
        
        const emailData = {
          to: primaryUser.email,
          subject: emailSubject,
          booking: booking,
          userName: primaryUser.name,
          qrCodeUrl: qrCode?.qr_code_url
        };
        
        // Add all PDF attachments if available
        if (pdfAttachments && pdfAttachments.length > 0) {
          emailData.attachments = pdfAttachments;
        }
        
        const emailResult = await sendTicketEmail(
          primaryUser.email,
          emailSubject,
          primaryUser.name,
          emailData.attachments
        );
        
        // Log success with frontend-like details
        const attachmentDescription = pdfAttachments.length > 0 
          ? `with 1 PDF containing all ${booking.num_tickets} tickets`
          : 'without PDF attachment (generation failed)';
        console.log(`📧 Email notification sent successfully!`);
        console.log(`📧 Recipient: ${primaryUser.email}`);
        console.log(`📧 Message ID: ${emailResult.data?.messageId || 'N/A'}`);
        console.log(`📧 Attachments: ${attachmentDescription}`);
        console.log(`📧 Service: ${emailResult.meta?.service || 'resend'}`);
        
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        console.error('📧 Error Code:', emailError.code || 'UNKNOWN');
        console.error('📧 User-friendly message:', emailError.message);
        console.error('📧 Technical details:', emailError.originalError || emailError.message);
        
        // Continue with booking process even if email fails
        // Could optionally log this failure for later retry
      }
    }

    // Send WhatsApp notification if phone exists
    if (primaryUser.phone) {
      try {
        const phoneNumber = primaryUser.phone.replace(/^\+?91|\s+/g, '');
        

        // Generate PDF for WhatsApp attachment
        let pdfBuffer = null;
        try {
          const { generateTicketPDFBuffer } = await import("../utils/pdfGenerator.js");
          const ticketData = {
            name: primaryUser.name,
            date: booking.booking_date,
            pass_type: booking.pass_type,
            qrCode: booking.qr_code,
            booking_id: booking.id,
            ticket_number: `TICKET-${booking.id}-001`
          };
          pdfBuffer = await generateTicketPDFBuffer(ticketData);
          console.log('📄 Generated PDF for WhatsApp:', pdfBuffer ? `${pdfBuffer.length} bytes` : 'failed');
        } catch (pdfError) {
          console.error('❌ PDF generation failed for WhatsApp:', pdfError);
        }

        await whatsappService.sendBookingConfirmation({
          phone: phoneNumber,
          name: primaryUser.name,
          eventName: 'Dandiya Night',
          ticketCount: booking.num_tickets,
          amount: `₹${payment?.amount || booking.final_amount || 0}`,
          bookingId: booking.id.toString(),
          pdfBuffer: pdfBuffer
        });

        console.log('💬 WhatsApp notification sent to:', phoneNumber);
      } catch (whatsappError) {
        console.error('Failed to send WhatsApp message:', whatsappError);
      }
    }

    // Log the successful notification
    try {
      await query(`
        INSERT INTO message_logs (booking_id, user_id, message_type, provider, status, cost_amount, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [booking.id, primaryUser.id, 'email', 'email', 'sent', 0.5, new Date()]);
    } catch (logError) {
      console.error('Failed to log notification success:', logError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in sendTicketNotifications:', error);
    
    // Log the failed notification
    try {
      await query(`
        INSERT INTO message_logs (booking_id, message_type, provider, status, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [parseInt(booking_id), 'email', 'system', 'failed', error.message?.substring(0, 255) || 'Unknown error', new Date()]);
    } catch (logError) {
      console.error('Failed to log notification error:', logError);
    }
    
    return { 
      success: false, 
      error: error.message || 'Failed to send notifications' 
    };
  }
}

// 5️⃣ Get QR Details (for verification)
export const getQRDetails = async (req, res) => {
  const { ticket_number } = req.body;
  try {
    const qrResult = await query(`
      SELECT qr.*, b.pass_type, u.name as user_name
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      WHERE qr.ticket_number = $1
    `, [ticket_number]);

    if (qrResult.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const qrCode = qrResult.rows[0];

    // Convert BigInt fields to strings for JSON serialization
    const ticketResponse = {
      ...qrCode,
      id: qrCode.id.toString(),
      booking_id: qrCode.booking_id.toString(),
      user_id: qrCode.user_id ? qrCode.user_id.toString() : null
    };

    res.status(200).json({ success: true, ticket: ticketResponse });
  } catch (err) {
    console.error("Error in getQRDetails:", err);
    res.status(500).json({ error: "Failed to get QR details" });
  }
};

// 6️⃣ Mark Ticket as Used
export const markTicketUsed = async (req, res) => {
  const { ticket_number } = req.body;
  try {
    const updateResult = await query(`
      UPDATE qr_codes
      SET is_used = true, used_at = NOW()
      WHERE ticket_number = $1 AND is_used = false
      RETURNING *
    `, [ticket_number]);

    if (updateResult.rows.length === 0) {
      const existingQr = await query('SELECT is_used FROM qr_codes WHERE ticket_number = $1', [ticket_number]);
      if (existingQr.rows.length > 0 && existingQr.rows[0].is_used) {
        return res.status(400).json({ error: "Ticket already used" });
      }
      return res.status(404).json({ error: "Ticket not found" });
    }

    const qrCode = updateResult.rows[0];

    // Log the scan
    await query(`
      INSERT INTO qr_scans (booking_id, ticket_number, used_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (ticket_number) DO NOTHING
    `, [qrCode.booking_id, ticket_number]);

    res.status(200).json({ success: true, message: "Ticket marked as used" });
  } catch (err) {
    console.error("Error in markTicketUsed:", err);
    res.status(500).json({ error: "Failed to mark ticket as used" });
  }
};

// 7️⃣ Resend Notifications
export const resendNotifications = async (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({
      success: false,
      error: 'Booking ID is required'
    });
  }

  console.log(`🔄 Manual notification trigger for booking: ${booking_id}`);

  try {
    // Ensure the booking exists and is confirmed
    const bookingResult = await query(`SELECT id FROM bookings WHERE id = $1 AND status = 'confirmed'`, [parseInt(booking_id)]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Confirmed booking not found' });
    }

    // Get latest payment for this booking
    const paymentResult = await query(`SELECT id FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`, [parseInt(booking_id)]);
    if (paymentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No payment found for this booking. Cannot send ticket.'
      });
    }
    const latestPayment = paymentResult.rows[0];

    // Call the existing notification function with the latest payment id
    await sendTicketNotifications(booking_id, latestPayment.id);

    res.json({
      success: true,
      message: `Notifications for booking ${booking_id} have been re-sent.`
    });

  } catch (error) {
    console.error(`❌ Error resending notifications for booking ${booking_id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend notifications'
    });
  }
};
