import express from "express";
import bodyParser from "body-parser";
import { testConnection } from './config/database.js';
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as bookingController from "./controllers/bookingController.js";

// ES6 equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Global BigInt JSON serialization fix
BigInt.prototype.toJSON = function() { return this.toString(); };

console.log("🚀 Starting Dandiya Platform Backend...");

// Async function to setup server with dynamic imports
async function startServer() {
const app = express();

// Enhanced CORS configuration for frontend development and production
const allowedOrigins = [
  // Development origins
  'http://localhost:3000',
  'http://localhost:3001', 
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:19006',
  'exp://192.168.39.39:8081',
  'exp://10.0.2.2:8081',
  'http://10.0.2.2:8081',
  'http://192.168.39.39:8081',
  'exp://192.168.6.70:19000',
  'exp://192.168.73.189:19000',
  'exp://192.168.162.189:19000',
  'exp://192.168.197.189:8081',
  'http://192.168.197.189:8081',
  // Production origins
  'https://malangevents.com',
  'https://www.malangevents.com',
  'https://backend-main-production-ef63.up.railway.app',
  process.env.FRONTEND_URL,
  process.env.NETLIFY_URL,
  process.env.RAILWAY_URL,
  // Netlify preview URLs pattern
  /^https:\/\/.*\.netlify\.app$/,
  /^https:\/\/.*\.netlify\.com$/,
  // Railway URLs pattern
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.up\.railway\.app$/
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Enhanced JSON parsing with error handling
app.use(express.json({ 
  limit: '50mb'
}));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global error handler for JSON parsing and other errors
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid JSON format',
      message: 'Please check your request body format'
    });
  }
  
  // Don't crash the server on errors
  if (!res.headersSent) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  // Keep server running; consider alerting/metrics here
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Keep server running; consider alerting/metrics here
});

console.log("✅ Basic Express setup complete");

// Import routes
try {
  const { default: configRoutes } = await import("./routes/configRoutes.js");
  app.use("/api/config", configRoutes);
  console.log("✅ Config routes loaded");
} catch (err) {
  console.log("⚠️ Config routes not found, skipping...");
}

// Admin routes
try {
  const { default: adminRoutes } = await import("./routes/adminRoutes.js");
  app.use("/api/admin", adminRoutes);
  console.log("✅ Admin routes loaded");
} catch (err) {
  console.log("⚠️ Admin routes not found, skipping...");
}

// Auth routes
try {
  const { default: authRoutes } = await import("./routes/authRoutes.js");
  app.use("/api/auth", authRoutes);
  console.log("✅ Auth routes loaded");
} catch (err) {
  console.log("⚠️ Auth routes not found, skipping...");
}

// QR routes
try {
  const { default: qrRoutes } = await import("./routes/qrRoutes.js");
  app.use("/api/qr", qrRoutes);
  console.log("✅ QR routes loaded");
} catch (err) {
  console.log("⚠️ QR routes not found, skipping...");
}

// Booking routes (inline definition since bookingRoutes.js might not exist)
const bookingRoutes = express.Router();

// Booking endpoints
bookingRoutes.post("/create", bookingController.createBooking);
bookingRoutes.post("/add-users", bookingController.addUserDetails);
bookingRoutes.get("/details/:booking_id", bookingController.getBookingDetails);
bookingRoutes.post("/test-email", bookingController.testEmail);
bookingRoutes.post("/test-whatsapp", bookingController.testWhatsApp);
bookingRoutes.post("/create-payment", bookingController.createPayment);
bookingRoutes.post("/confirm-payment", bookingController.confirmPayment);
bookingRoutes.post("/qr-details", bookingController.getQRDetails);
bookingRoutes.post("/mark-used", bookingController.markTicketUsed);
bookingRoutes.post("/resend-notifications", bookingController.resendNotifications);

// Test endpoints for debugging PDF/email/WhatsApp issues
bookingRoutes.post("/test-email", async (req, res) => {
  try {
    console.log("🧪 Testing email with PDF attachment...");
    
    const { email, name, subject } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }
    
    // Generate a test PDF
    const { generateTicketPDFBuffer } = await import("./utils/pdfGenerator.js");
    const testData = {
      name: name || "Test User",
      date: new Date().toISOString(),
      pass_type: "couple",
      qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST123",
      booking_id: "TEST-12345",
      ticket_number: "TEST-TICKET-001"
    };
    
    const pdfBuffer = await generateTicketPDFBuffer(testData);
    console.log(`📄 Generated PDF buffer: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
    
    // Send email with PDF attachment
    const { sendTicketEmail } = await import("./utils/emailService.js");
    
    const attachments = pdfBuffer ? [{
      filename: 'test-ticket.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];
    
    await sendTicketEmail(
      email,
      subject || "Test Ticket Email",
      name || "Test User",
      attachments
    );
    
    res.json({
      success: true,
      message: `Test email sent successfully to ${email}`,
      data: {
        recipient: email,
        subject: subject || "Test Ticket Email",
        timestamp: new Date().toISOString(),
        service: "resend"
      },
      meta: {
        attachmentCount: attachments.length,
        pdfSize: pdfBuffer ? pdfBuffer.length : 0,
        service: "resend_production"
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Test email sent to ${email} with ${attachments.length} attachments`);
    
  } catch (error) {
    console.error("❌ Test email failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "Email test failed", 
      details: error.message 
    });
  }
});

bookingRoutes.post("/test-whatsapp", async (req, res) => {
  try {
    console.log("🧪 Testing WhatsApp message...");
    
    const { phone, name, eventName, ticketCount, amount, bookingId } = req.body;
    
    if (!phone) {
      return res.status(400).json({ success: false, error: "Phone number is required" });
    }
    
    const whatsappService = (await import("./services/whatsappService.js")).default;
    
    // Generate test PDF if requested
    let pdfBuffer = null;
    if (req.body.includePDF !== false) { // Default to including PDF
      try {
        const { generateTicketPDFBuffer } = await import("./utils/pdfGenerator.js");
        const testData = {
          name: name || "Test User",
          date: new Date().toISOString(),
          pass_type: "couple",
          qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST123",
          booking_id: bookingId || "TEST123",
          ticket_number: "TEST-TICKET-001"
        };
        pdfBuffer = await generateTicketPDFBuffer(testData);
        console.log(`📄 Generated test PDF: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
      } catch (pdfError) {
        console.error('❌ Test PDF generation failed:', pdfError);
      }
    }
    
    const result = await whatsappService.sendBookingConfirmation({
      phone: phone,
      name: name || "Test User",
      eventName: eventName || "Dandiya Night Test",
      ticketCount: ticketCount || 2,
      amount: amount || "₹500",
      bookingId: bookingId || "TEST123",
      pdfBuffer: pdfBuffer
    });
    
    res.json({
      success: true,
      message: `Test WhatsApp sent successfully to ${phone}`,
      result: result,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Test WhatsApp sent to ${phone}`);
    
  } catch (error) {
    console.error("❌ Test WhatsApp failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "WhatsApp test failed", 
      details: error.message 
    });
  }
});

// Test database connection under load
bookingRoutes.post("/test-database", async (req, res) => {
  try {
    console.log("🧪 Testing database connection and query performance...");
    
    const { query } = await import("./config/database.js");
    
    const startTime = Date.now();
    
    // Test a simple query
    const result1 = await query('SELECT NOW() as current_time, version() as db_version');
    const queryTime1 = Date.now() - startTime;
    
    // Test a more complex query (simulate payment confirmation lookup)
    const startTime2 = Date.now();
    const result2 = await query('SELECT 1 as test_id, $1 as test_param, NOW() as query_time', ['test_value']);
    const queryTime2 = Date.now() - startTime2;
    
    res.json({
      success: true,
      message: "Database connection test completed",
      results: {
        simple_query: {
          time_ms: queryTime1,
          current_time: result1.rows[0]?.current_time,
          db_version: result1.rows[0]?.db_version?.substring(0, 50) + "..."
        },
        parameterized_query: {
          time_ms: queryTime2,
          test_result: result2.rows[0]
        }
      },
      total_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Database test completed - Simple: ${queryTime1}ms, Parameterized: ${queryTime2}ms`);
    
  } catch (error) {
    console.error("❌ Database test failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "Database test failed", 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.use("/api/bookings", bookingRoutes);
console.log("✅ Booking routes loaded");

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "Dandiya Platform Backend is running",
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV || 'development',
    qr_pdf_fixed: true
  });
});

// Handle favicon requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).send(); // No Content
});

// Test endpoint for QR PDF generation
app.post("/api/test-qr-pdf", async (req, res) => {
  try {
    console.log("🧪 Testing QR PDF generation...");
    
    const { generateTicketPDFBuffer } = await import("./utils/pdfGenerator.js");
    
    const testData = {
      name: "Test User",
      date: new Date().toISOString(),
      pass_type: "couple",
      qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST123",
      booking_id: "12345",
      ticket_number: "TEST-TICKET-001"
    };
    
    const pdfBuffer = await generateTicketPDFBuffer(testData);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=test-ticket.pdf');
    res.send(pdfBuffer);
    
    console.log("✅ QR PDF generation test successful");
    
  } catch (error) {
    console.error("❌ QR PDF generation test failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "PDF generation failed", 
      details: error.message 
    });
  }
});

// Static files for tickets
try {
  const ticketsDir = path.join(__dirname, "tickets");
  app.use("/tickets", express.static(ticketsDir));
  console.log("✅ Tickets static folder configured");
} catch (err) {
  console.log("⚠️ Tickets folder not found, skipping static files...");
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack);
  res.status(500).json({ 
    success: false, 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: "Endpoint not found",
    path: req.path,
    available_endpoints: [
      'GET /health',
      'GET /api/health',
      'POST /api/test-qr-pdf',
      'POST /api/bookings/create',
      'POST /api/bookings/add-users',
      'POST /api/bookings/create-payment',
      'POST /api/bookings/confirm-payment',
      'POST /api/bookings/qr-details',
      'POST /api/bookings/mark-used',
      'POST /api/bookings/resend-notifications',
      'POST /api/bookings/test-email',
      'POST /api/bookings/test-whatsapp',
      'POST /api/bookings/test-database',
      'GET /api/admin/dashboard/stats',
      'GET /api/admin/dashboard/recent-scans',
      'GET /api/admin/dashboard/chart-data',
      'GET /api/admin/bookings',
      'GET /api/admin/scans'
    ]
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🎉 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Network access: http://192.168.197.189:${PORT}/health`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Network access: http://192.168.197.189:${PORT}/api/health`);
  console.log(`🧪 Test QR PDF: http://localhost:${PORT}/api/test-qr-pdf`);
  console.log(`📋 Booking API: http://localhost:${PORT}/api/bookings`);
  
  // Test database connection
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log(`🌟 Backend is ready with Supabase database connection!`);
  } else {
    console.log(`⚠️ Backend started but database connection failed`);
  }
});

return app;
}

// Start the server
startServer().catch(console.error);

export default startServer;
