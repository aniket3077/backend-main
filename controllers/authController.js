const { query } = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * Authentication Controller
 * Handles login and authentication for QR verifier app
 */

// Demo users for development
const DEMO_USERS = [
  {
    id: 1,
    email: 'admin@dandiya.com',
    password: 'admin123',
    role: 'admin',
    name: 'Admin User'
  },
  {
    id: 2,
    email: 'staff@dandiya.com',
    password: 'staff123',
    role: 'staff',
    name: 'Staff User'
  }
];

/**
 * Login endpoint for QR verifier app
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check demo users first
    const demoUser = DEMO_USERS.find(user => 
      user.email.toLowerCase() === email.toLowerCase() && 
      user.password === password
    );

    if (demoUser) {
      console.log('✅ Demo user login successful:', email);
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          id: demoUser.id, 
          email: demoUser.email, 
          role: demoUser.role 
        },
        process.env.JWT_SECRET || 'malang_dandiya_2025_fallback_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: demoUser.id,
          email: demoUser.email,
          name: demoUser.name,
          role: demoUser.role
        },
        token
      });
    }

    // Try database lookup if demo user not found
    try {
      const userResult = await query(
        'SELECT * FROM users WHERE email = $1 AND role IN ($2, $3)',
        [email.toLowerCase(), 'admin', 'staff']
      );

      if (userResult.rows.length === 0) {
        console.log('❌ User not found:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const user = userResult.rows[0];

      // Check password (assuming it's hashed in database)
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!passwordMatch) {
        console.log('❌ Invalid password for:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      console.log('✅ Database user login successful:', email);

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET || 'malang_dandiya_2025_fallback_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token
      });

    } catch (dbError) {
      console.log('⚠️ Database error, falling back to demo users only:', dbError.message);
      
      // If database fails, only allow demo users
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Verify token middleware
 */
exports.verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'malang_dandiya_2025_fallback_secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

/**
 * Get current user info
 */
exports.me = (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
};
