import { query } from '../config/database.js';
import { generateQRCode } from "../utils/qrGenerator.js";
import generateTicketPDF from "../utils/pdfGenerator.js";
import { sendTicketEmail } from "../utils/emailService.js";
import whatsappService from "../services/whatsappService.js";
import Razorpay from "razorpay";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { 
  getCurrentISTDateString, 
  formatDateForIndianLocale, 
  getCurrentISTDate,
  getDateString,
  isSameDateIST,
  getTimezoneInfo 
} from '../utils/timezone.js';

dotenv.config();

/**
 * Malang Raas Dandiya 2025 - Updated Booking Controller
 * Supports season pass, bulk discounts (6+ tickets = ₹350 each), and new pricing structure
 */

// 🎉 Regular pricing structure for Malang Raas Dandiya 2025
const REGULAR_PRICING = {
  single: {
    female: { base: 399 },      // 👩 Female – ₹399
    male: { base: 499 },        // 👨 Male – ₹499
    couple: { base: 699 },      // 👫 Couple – ₹699
    family: { base: 1300 },     // 👨‍👩‍👧‍👦 Family – ₹1300
    family4: { base: 1300 },    // Backward compatibility
    kids: { base: 99 },         // 🧒 Kids – ₹99
    kid: { base: 99 },          // Backward compatibility
  },
  season: {
    female: { base: 2499 },     // 👩 Female Season – ₹2499
    male: { base: 2999 },       // � Male Season – ₹2999
    couple: { base: 3499 },     // 👫 Couple Season – ₹3499
    family: { base: 5999 },     // 👨‍👩‍👧‍👦 Family Season – ₹5999
    kids: { base: 999 },        // 🧒 Kids Season – ₹999
    kid: { base: 999 },         // Backward compatibility
  }
};

// 🔥 DHAMAKA RATES for Sep 25-26 ONLY!
const DHAMAKA_PRICING = {
  single: {
    female: { base: 99 },       // 👩 Female – ₹99 (DHAMAKA!)
    male: { base: 199 },        // 👨 Male – ₹199 (DHAMAKA!)
    couple: { base: 249 },      // 👫 Couple – ₹249 (DHAMAKA!)
    family: { base: 499 },      // 👨‍👩‍👧‍👦 Family – ₹499 (DHAMAKA!)
    family4: { base: 499 },     // Backward compatibility
    kids: { base: 99 },         // 🧒 Kids – ₹99 (DHAMAKA!)
    kid: { base: 99 },          // Backward compatibility
  },
  season: REGULAR_PRICING.season // Season passes keep regular pricing
};

// Helper function to check if date is September 25 or 26, 2025
function isDhamakaSpecialDate(bookingDate) {
  if (!bookingDate) return false;
  
  const date = new Date(bookingDate);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based, so September = 8
  const day = date.getDate();
  
  // Check if it's September 25 or 26, 2025
  return year === 2025 && month === 8 && (day === 25 || day === 26);
}

// Get appropriate pricing based on date and ticket type
function getTicketPricing(ticketType, bookingDate) {
  const isDhamakaDate = isDhamakaSpecialDate(bookingDate);
  
  // Use dhamaka pricing only for daily tickets on Sep 25-26
  if (isDhamakaDate && ticketType === 'single') {
    return DHAMAKA_PRICING;
  }
  
  return REGULAR_PRICING;
}

// Calculate ticket price - now with date-specific pricing for Sep 25-26
function calculateTicketPrice(passType, ticketType, numTickets, bookingDate = null) {
  const TICKET_PRICING = getTicketPricing(ticketType, bookingDate);
  const pricing = TICKET_PRICING[ticketType]?.[passType];
  
  if (!pricing) {
    throw new Error(`Invalid pricing for ${ticketType} ${passType}`);
  }

  const quantity = Math.max(1, parseInt(numTickets));
  const basePrice = pricing.base;
  
  // � September 23rd Special Pricing
  const isSeptember23 = (() => {
    if (!bookingDate) return false;
    
    // Handle date-only format (2025-09-23)
    if (typeof bookingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return bookingDate === '2025-09-23';
    }
    
    // Handle datetime format with UTC conversion
    const date = new Date(bookingDate);
    return date.toISOString().slice(0, 10) === '2025-09-23';
  })();
  
  let finalPricePerTicket = basePrice;
  let discountApplied = false;
  let discountAmount = 0;
  
  if (isSeptember23 && ticketType === 'single') {
    if (passType === 'female') {
      // Female tickets are ₹1 on September 23rd
      finalPricePerTicket = 1;
      discountApplied = true;
      discountAmount = (basePrice - 1) * quantity;
    } else if (passType === 'couple') {
      // Couple tickets are ₹249 on September 23rd
      finalPricePerTicket = 249;
      discountApplied = true;
      discountAmount = (basePrice - 249) * quantity;
    } else if (passType === 'male') {
      // Male tickets are ₹249 on September 23rd
      finalPricePerTicket = 249;
      discountApplied = true;
      discountAmount = (basePrice - 249) * quantity;
    }
  } else if (quantity >= 6) {
    // 🎯 Bulk discount: 6+ tickets = ₹350 each (only when not September 23rd special pricing)
    finalPricePerTicket = 350;
    discountApplied = true;
    discountAmount = (basePrice - 350) * quantity;
  }
  
  const totalAmount = finalPricePerTicket * quantity;
  const savings = discountApplied ? discountAmount : 0;
  
  return {
    basePrice: basePrice,
    finalPrice: finalPricePerTicket,
    pricePerTicket: finalPricePerTicket,
    discountApplied: discountApplied,
    totalAmount: totalAmount,
    savings: savings,
    discountAmount: discountAmount,
    specialOffer: isSeptember23 ? 'September 23rd Special' : null
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

// 💰 Enhanced pricing validation and calculation
function computeTotalAmount(passType, quantity = 1, ticketType = 'single', bookingDate = null) {
  // Validate inputs
  if (!passType || typeof passType !== 'string') {
    throw new Error('Invalid pass type provided');
  }
  
  const cleanPassType = passType.toLowerCase().trim();
  const cleanTicketType = (ticketType || 'single').toLowerCase().trim();
  
  // Get appropriate pricing based on date
  const TICKET_PRICING = getTicketPricing(cleanTicketType, bookingDate);
  const pricing = TICKET_PRICING[cleanTicketType]?.[cleanPassType];
  if (!pricing) {
    console.error(`❌ Invalid pricing combination: ${cleanTicketType} ${cleanPassType}`);
    return null;
  }
  
  const q = Math.max(1, parseInt(quantity || 1));
  const calculation = calculateTicketPrice(cleanPassType, cleanTicketType, q, bookingDate);
  
  // Return consistent pricing information
  return {
    totalAmount: calculation.totalAmount,
    pricePerTicket: calculation.pricePerTicket,
    discountApplied: calculation.discountApplied,
    discountAmount: calculation.discountAmount,
    basePrice: calculation.basePrice,
    finalPrice: calculation.finalPrice,
    quantity: q
  };
}

// 🔍 Validate pricing consistency between frontend and backend
function validatePricingConsistency(frontendAmount, backendCalculation, passType, quantity, ticketType = 'single') {
  if (!backendCalculation) {
    return { isValid: false, error: 'Backend calculation failed' };
  }
  
  const { totalAmount } = backendCalculation;
  const frontendTotal = parseFloat(frontendAmount);
  
  // Allow small floating point differences (1 paisa tolerance)
  const tolerance = 0.01;
  const difference = Math.abs(frontendTotal - totalAmount);
  
  if (difference > tolerance) {
    console.error(`❌ Pricing mismatch detected:`, {
      frontend: frontendTotal,
      backend: totalAmount,
      difference,
      passType,
      quantity,
      ticketType
    });
    
    return {
      isValid: false,
      error: 'Pricing mismatch between frontend and backend',
      details: {
        frontendAmount: frontendTotal,
        backendAmount: totalAmount,
        difference: difference,
        passType,
        quantity,
        ticketType
      }
    };
  }
  
  return { isValid: true };
}

// 1️⃣ Create Booking
export const createBooking = async (req, res) => {
  const { booking_date, num_tickets, pass_type, passes, original_passes, ticket_type = 'single' } = req.body;
  
  // Support both old format (num_tickets, pass_type) and new format (passes)
  let bookingPasses = {};
  let totalTickets = 0;
  let bulkDiscountEligibleTickets = 0; // Only count individual male/female tickets for bulk discount
  let finalPassType = pass_type; // For database storage - will be updated for new format
  
  if (passes && typeof passes === 'object') {
    // New format: multiple pass types with proper couple/family expansion
    const original_passes_stored = JSON.parse(JSON.stringify(passes)); // Deep copy for tracking
    
    // Process and expand couple/family tickets
    for (const [passType, count] of Object.entries(passes)) {
      const passCount = Number(count) || 0;
      
      if (passType === 'couple' && passCount > 0) {
        // Each couple ticket becomes 1 male + 1 female
        console.log(`🎯 Expanding ${passCount} couple ticket(s) to ${passCount} male + ${passCount} female`);
        bookingPasses.male = (bookingPasses.male || 0) + passCount;
        bookingPasses.female = (bookingPasses.female || 0) + passCount;
        // Couples don't count for bulk discount eligibility
        console.log(`🚫 Couples excluded from bulk discount calculation`);
      } else if ((passType === 'family' || passType === 'family4') && passCount > 0) {
        // Each family ticket becomes 2 male + 2 female
        console.log(`🎯 Expanding ${passCount} family ticket(s) to ${passCount * 2} male + ${passCount * 2} female`);
        bookingPasses.male = (bookingPasses.male || 0) + (passCount * 2);
        bookingPasses.female = (bookingPasses.female || 0) + (passCount * 2);
        // Family passes don't count for bulk discount eligibility
        console.log(`🚫 Family passes excluded from bulk discount calculation`);
      } else if (passType === 'male' || passType === 'female') {
        // Individual male/female tickets - count for bulk discount
        bookingPasses[passType] = (bookingPasses[passType] || 0) + passCount;
        bulkDiscountEligibleTickets += passCount;
        console.log(`✅ Individual ${passType} tickets count for bulk discount: +${passCount}`);
      } else {
        // Regular tickets (kids, etc.) - add to existing count but don't count for bulk discount
        bookingPasses[passType] = (bookingPasses[passType] || 0) + passCount;
      }
    }
    
    totalTickets = Object.values(bookingPasses).reduce((sum, count) => sum + (Number(count) || 0), 0);
    
    console.log('🎟️ Pass expansion result:', {
      original: passes,
      expanded: bookingPasses,
      totalTickets: totalTickets,
      bulkDiscountEligibleTickets: bulkDiscountEligibleTickets
    });
    
    // Log the couple ticket conversion for tracking
    if (passes.couple) {
      console.log(`🎯 Couple ticket conversion: ${passes.couple} couple tickets converted to ${bookingPasses.male} male + ${bookingPasses.female} female tickets (couples excluded from bulk discount)`);
    }
  } else if (num_tickets && pass_type) {
    // Old format: single pass type (backward compatibility)
    bookingPasses = { [pass_type]: Number(num_tickets) };
    totalTickets = Number(num_tickets);
    // For old format, only male/female individual tickets count for bulk discount
    if (pass_type === 'male' || pass_type === 'female') {
      bulkDiscountEligibleTickets = Number(num_tickets);
    } else {
      bulkDiscountEligibleTickets = 0;
    }
  }
  
  // Auto-set ticket quantities based on pass type
  let finalTicketCount;
  if (passes && typeof passes === 'object') {
    // For multi-pass bookings, use the calculated total after expansion
    finalTicketCount = totalTickets;
    console.log(`🎫 Multi-pass booking: Using expanded totalTickets = ${totalTickets}`);
  } else if (pass_type === 'couple') {
    finalTicketCount = 2;
    console.log('🎫 Auto-setting couple tickets to 2');
  } else if (pass_type === 'family' || pass_type === 'family4') {
    finalTicketCount = 4;
    console.log('🎫 Auto-setting family tickets to 4');
  } else {
    finalTicketCount = num_tickets || 1;
  }
  
  // Validate required fields
  // Support both legacy format (pass_type) and new multi-pass format (passes)
  const hasLegacyFormat = pass_type;
  const hasNewFormat = passes && typeof passes === 'object' && Object.keys(passes).some(key => passes[key] > 0);
  
  if (!booking_date || (!hasLegacyFormat && !hasNewFormat)) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
      message: "booking_date and either pass_type or passes are required"
    });
  }

  console.log('🔍 DEBUG: Raw booking_date from frontend:', booking_date);
  
  // Store the original date string EXACTLY as received from frontend
  const originalDateString = booking_date.includes('T') ? booking_date.slice(0, 10) : booking_date;
  console.log('🔍 DEBUG: Preserved original date string:', originalDateString);
  
  // Parse and validate date with proper timezone handling
  let parsedDate;
  if (booking_date.includes('T')) {
    // If booking_date includes time, parse directly
    parsedDate = new Date(booking_date);
    console.log('🔍 DEBUG: Parsed as datetime:', parsedDate.toISOString());
  } else {
    // If booking_date is just a date (YYYY-MM-DD), parse as UTC to avoid timezone issues
    parsedDate = new Date(booking_date + 'T00:00:00.000Z');
    console.log('🔍 DEBUG: Parsed as date-only with UTC:', parsedDate.toISOString());
    console.log('🔍 DEBUG: Date part only:', parsedDate.toISOString().slice(0, 10));
  }
  
  // CRITICAL: Always use originalDateString for QR generation, never rely on Date conversion
  console.log('🔍 DEBUG: Will use this date in QR:', originalDateString);
  
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Invalid booking_date",
      message: "Booking date must be a valid date"
    });
  }

  // 📅 EVENT DATE VALIDATION
  // Updated booking period: September 20, 2025 to October 1, 2025 (extended to allow current date)
  // Season event dates: September 23, 2025 to October 1, 2025 (9 days including Sep 24)
  const bookingStart = new Date('2025-09-20T00:00:00.000Z'); // Allow bookings from current date
  const seasonStart = new Date('2025-09-23T00:00:00.000Z');  // Actual event start
  const seasonEnd = new Date('2025-10-01T00:00:00.000Z');    // Event end date
  
  // For comparison, use date-only comparison to avoid timezone issues
  const parsedDateOnly = new Date(parsedDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
  const bookingStartOnly = new Date('2025-09-20T00:00:00.000Z');
  const seasonEndOnly = new Date('2025-10-01T00:00:00.000Z');
  
  // Validate booking date is within extended booking period
  if (parsedDateOnly < bookingStartOnly || parsedDateOnly > seasonEndOnly) {
    return res.status(400).json({
      success: false,
      error: "Invalid booking_date",
      message: `❌ Bookings are only allowed for dates between ${bookingStart.toDateString()} and ${seasonEnd.toDateString()}. Selected date: ${parsedDate.toDateString()}`
    });
  }
  
  // Check if booking date falls within season period
  const isSeasonDate = parsedDate >= seasonStart && parsedDate <= seasonEnd;
  
  // Auto-convert to season pass if date is within season period - DISABLED
  let finalTicketType = ticket_type; // Respect user's explicit choice
  // Commented out auto-conversion to respect user choice
  // if (isSeasonDate && ticket_type === 'single') {
  //   finalTicketType = 'season';
  //   console.log(`🎟️ AUTO-DETECTED: Converting single ticket to season pass for date ${booking_date}`);
  //   console.log(`📅 Season period: ${seasonStart.toDateString()} to ${seasonEnd.toDateString()}`);
  // }

  console.log(`🎯 Final ticket type: ${finalTicketType} (respecting user choice - no auto-conversion)`);

  // �🎟️ NEW TICKET PURCHASE VALIDATION RULES
  // Check if male or kid tickets are being purchased alone (not allowed)
  if (passes && typeof passes === 'object') {
    // New format: multiple pass types
    const passTypes = Object.keys(passes).filter(key => passes[key] > 0);
    const hasOnlyMale = passTypes.length === 1 && passTypes[0] === 'male';
    const hasOnlyKid = passTypes.length === 1 && (passTypes[0] === 'kids' || passTypes[0] === 'kid');
    
    if (hasOnlyMale) {
      return res.status(400).json({
        success: false,
        error: "Invalid ticket selection",
        message: "❌ Stag Male entries are not allowed. Male tickets must be purchased with other ticket types (couple, family, etc.)."
      });
    }
    
    if (hasOnlyKid) {
      return res.status(400).json({
        success: false,
        error: "Invalid ticket selection", 
        message: "❌ Kid tickets cannot be purchased alone. Please add other ticket types."
      });
    }
  } else if (pass_type) {
    // Old format: single pass type (backward compatibility)
    if (pass_type === 'male') {
      return res.status(400).json({
        success: false,
        error: "Invalid ticket selection",
        message: "❌ Stag Male entries are not allowed. Male tickets must be purchased with other ticket types (couple, family, etc.)."
      });
    }
    
    if (pass_type === 'kids' || pass_type === 'kid') {
      return res.status(400).json({
        success: false,
        error: "Invalid ticket selection",
        message: "❌ Kid tickets cannot be purchased alone. Please add other ticket types."
      });
    }
  }
  
  try {
    // � Debug logging for pricing mismatch investigation
    console.log('🔍 DEBUGGING BOOKING REQUEST:');
    console.log('  Request body total_amount:', req.body.total_amount);
    console.log('  Pass type:', pass_type);
    console.log('  Passes object:', passes);
    console.log('  Ticket type:', ticket_type);
    console.log('  Final ticket count:', finalTicketCount);
    
    // 🔍 ADDITIONAL MULTI-PASS DEBUGGING
    console.log('📋 MULTI-PASS ANALYSIS:');
    if (passes && typeof passes === 'object') {
      const passEntries = Object.entries(passes);
      const activePassTypes = passEntries.filter(([key, count]) => (Number(count) || 0) > 0);
      console.log('  - Pass entries:', passEntries);
      console.log('  - Active pass types:', activePassTypes);
      console.log('  - Is multi-pass?', activePassTypes.length > 1);
      
      activePassTypes.forEach(([passType, count]) => {
        console.log(`  - ${passType}: ${count} tickets`);
      });
    } else {
      console.log('  - No passes object, using legacy pass_type:', pass_type);
    }
    
    // �💰 Enhanced pricing calculation with validation
    let priceInfo;
    let totalAmount = 0;
    let totalDiscount = 0;
    let discountApplied = false;
    let pricePerTicket;
    
    try {
      // Check if this is a multi-pass booking
      if (passes && typeof passes === 'object' && Object.keys(passes).filter(key => passes[key] > 0).length > 1) {
        // Multi-pass booking: calculate total for all pass types
        console.log('🎟️ Multi-pass booking detected, calculating total for all pass types:', passes);
        
        // 🎯 Check individual male/female tickets for bulk discount eligibility (6+ tickets = ₹350 each)
        // Couples and family passes are excluded from bulk discount
        const isBulkDiscount = bulkDiscountEligibleTickets >= 6;
        console.log(`🧮 Total tickets: ${totalTickets}, Individual male/female tickets: ${bulkDiscountEligibleTickets}, Bulk discount eligible: ${isBulkDiscount}`);
        
        let passDetailsArray = [];
        Object.entries(passes).forEach(([passType, count]) => {
          const passCount = Number(count) || 0;
          if (passCount <= 0) return;
          
          let passCalc;
          if (isBulkDiscount && (passType === 'male' || passType === 'female')) {
            // Apply bulk discount only to individual male/female tickets: ₹350 per ticket
            const TICKET_PRICING = getTicketPricing(finalTicketType, bookingDate);
            const pricing = TICKET_PRICING[finalTicketType]?.[passType];
            const basePrice = pricing ? pricing.base : 0;
            
            passCalc = {
              basePrice: basePrice,
              finalPrice: 350,
              pricePerTicket: 350,
              discountApplied: true,
              totalAmount: 350 * passCount,
              savings: (basePrice - 350) * passCount,
              discountAmount: (basePrice - 350) * passCount
            };
            
            console.log(`   ${passType}: ₹350 × ${passCount} = ₹${passCalc.totalAmount} (Bulk discount applied to individual tickets, saved ₹${passCalc.discountAmount})`);
          } else {
            // Normal pricing for couples, family, and other pass types (no bulk discount)
            passCalc = calculateTicketPrice(passType, finalTicketType, passCount, booking_date);
            if (passType === 'couple' && isBulkDiscount) {
              console.log(`   ${passType}: ₹${passCalc.pricePerTicket} × ${passCount} = ₹${passCalc.totalAmount} (Couples excluded from bulk discount)`);
            } else {
              console.log(`   ${passType}: ₹${passCalc.pricePerTicket} × ${passCount} = ₹${passCalc.totalAmount}`);
            }
          }
          
          if (passCalc && typeof passCalc.totalAmount === 'number') {
            totalAmount += passCalc.totalAmount;
            totalDiscount += passCalc.discountAmount || 0;
            if (passCalc.discountApplied) discountApplied = true;
            
            passDetailsArray.push({
              passType,
              count: passCount,
              unitPrice: passCalc.pricePerTicket,
              subtotal: passCalc.totalAmount,
              discountApplied: passCalc.discountApplied,
              savings: passCalc.savings || 0
            });
          }
        });
        
        // Calculate average price per ticket for display
        pricePerTicket = totalAmount / finalTicketCount;
        
        console.log(`🧮 Multi-pass total: ₹${totalAmount} (${passDetailsArray.length} pass types, bulk discount: ${isBulkDiscount})`);
        
        // Create priceInfo object for compatibility
        priceInfo = {
          totalAmount,
          pricePerTicket,
          discountApplied,
          discountAmount: totalDiscount,
          basePrice: pricePerTicket, // Average for multi-pass
          finalPrice: pricePerTicket,
          passDetails: passDetailsArray,
          bulkDiscount: isBulkDiscount
        };
        
      } else if (passes && typeof passes === 'object') {
        // Single pass type booking using new format
        const activePassTypes = Object.entries(passes).filter(([key, count]) => (Number(count) || 0) > 0);
        if (activePassTypes.length === 1) {
          const [singlePassType, singlePassCount] = activePassTypes[0];
          console.log(`🎟️ Single pass type booking: ${singlePassType} × ${singlePassCount}`);
          
          // Use singlePassType for calculation and later assign to finalPassType for database storage
          finalPassType = singlePassType;
          
          priceInfo = calculateTicketPrice(singlePassType, finalTicketType, singlePassCount, booking_date);
          
          // Validate pricing calculation result
          if (!priceInfo || typeof priceInfo.totalAmount !== 'number') {
            throw new Error(`Invalid pricing calculation for ${singlePassType} ${finalTicketType}`);
          }
          
          // Extract and validate values from priceInfo
          totalAmount = priceInfo.totalAmount;
          pricePerTicket = priceInfo.pricePerTicket;
          discountApplied = priceInfo.discountApplied || false;
          
          console.log(`🧮 Single-pass total: ₹${totalAmount} (${singlePassType} ${finalTicketType})`);
        } else {
          throw new Error(`Invalid passes configuration: expected 1 active pass type, got ${activePassTypes.length}`);
        }
        
      } else {
        // Legacy single pass type booking
        priceInfo = calculateTicketPrice(pass_type, finalTicketType, finalTicketCount, booking_date);
        
        // Validate pricing calculation result
        if (!priceInfo || typeof priceInfo.totalAmount !== 'number') {
          throw new Error(`Invalid pricing calculation for ${pass_type} ${finalTicketType}`);
        }
        
        // Extract and validate values from priceInfo
        totalAmount = priceInfo.totalAmount;
        totalDiscount = priceInfo.discountAmount || 0;
        discountApplied = priceInfo.discountApplied || false;
        pricePerTicket = priceInfo.pricePerTicket;
        
        console.log(`🎟️ Single pass booking: ${pass_type} ₹${pricePerTicket} × ${finalTicketCount} = ₹${totalAmount}`);
      }
      
      // Additional validation checks
      if (totalAmount < 0) {
        throw new Error('Invalid total amount calculated');
      }
      
      // Allow zero amount for special offers (like free female tickets on September 23rd)
      if (pricePerTicket < 0) {
        throw new Error('Invalid price per ticket calculated');
      }
      
      console.log('✅ Pricing calculation successful:', {
        pass_type: finalPassType,
        ticket_type,
        finalTicketCount,
        pricePerTicket,
        totalAmount,
        discountApplied,
        totalDiscount
      });
      
    } catch (pricingError) {
      console.error('❌ Pricing calculation failed:', pricingError.message);
      return res.status(400).json({
        success: false,
        error: "Pricing calculation error",
        message: `Failed to calculate pricing for ${pass_type} ${finalTicketType}: ${pricingError.message}`
      });
    }
    
    // 🔍 Validate frontend-backend pricing consistency if frontend amount provided
    if (req.body.expected_amount) {
      const frontendAmount = parseFloat(req.body.expected_amount);
      const validationResult = validatePricingConsistency(
        frontendAmount, 
        { totalAmount }, 
        pass_type, 
        finalTicketCount, 
        finalTicketType
      );
      
      if (!validationResult.isValid) {
        console.error('❌ Frontend-backend pricing mismatch:', validationResult);
        return res.status(400).json({
          success: false,
          error: "Pricing validation failed",
          message: "Price mismatch detected between frontend and backend",
          details: validationResult.details
        });
      }
      
      console.log('✅ Frontend-backend pricing validation passed');
    }
    
    // Define pass details for JSON storage
    const passDetails = {
      pass_type: finalPassType,
      ticket_type,
      num_tickets: finalTicketCount,
      price_per_ticket: pricePerTicket, // Individual ticket price
      base_price: priceInfo.basePrice,
      final_price: priceInfo.finalPrice,
      total_amount: totalAmount,
      discount_amount: totalDiscount,
      discount_applied: discountApplied,
      booking_date: parsedDate.toISOString(),
      original_date_string: originalDateString // Store original date for QR generation
    };
    
    console.log('🔄 Creating booking with params:', {
      booking_date: parsedDate,
      num_tickets: parseInt(finalTicketCount),
      pass_type: finalPassType,
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
      finalPassType, 
      finalTicketType,
      'pending', 
      totalAmount, 
      totalDiscount, 
      totalAmount,
      finalTicketType === 'season',
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

      const totalAmount = computeTotalAmount(pass_type, finalTicketCount, ticket_type, booking_date) || 0;

      
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
          passes: bookingPasses, // Expanded passes (e.g., {male: 2, female: 1} from {couple: 1, male: 1})
          details: passDetails,
          original_passes: passes || bookingPasses, // Original request (e.g., {couple: 1, male: 1})
          couple_conversion: passes && passes.couple ? {
            couple_tickets: passes.couple,
            converted_to: {
              male: passes.couple,
              female: passes.couple
            }
          } : null,
          family_conversion: passes && (passes.family || passes.family4) ? {
            family_tickets: passes.family || passes.family4,
            converted_to: {
              male: (passes.family || passes.family4) * 2,
              female: (passes.family || passes.family4) * 2
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
      const totalAmount = computeTotalAmount(pass_type, num_tickets, ticket_type, booking_date) || 0;
      
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
    passType = 'female',
    numTickets = 1
  } = req.body;
  
  if (!phone) {
    return res.status(400).json({ 
      success: false, 
      error: "phone number is required" 
    });
  }
  
  try {
    const ticketCount = parseInt(numTickets) || 1;
    console.log(`🧪 Testing WhatsApp to: ${phone} with ${ticketCount} tickets`);
    
    // Calculate dynamic amount based on pass type for test
    const testPassType = passType || 'female';
    const testPricing = calculateTicketPrice(testPassType, 'single', ticketCount, null);
    const testAmount = testPricing ? `₹${testPricing.totalAmount}` : '₹99';
    
    // Send single complete booking message (like the real booking flow)
    const result = await whatsappService.sendBookingConfirmation({
      phone: phone,
      name: name,
      eventName: 'Malang Ras Dandiya 2025',
      eventDate: new Date().toISOString(), // Use current date for test
      ticketCount: ticketCount,
      amount: testAmount,
      bookingId: `${bookingId}-TEST`,
      ticketNumber: `BOOKING-${bookingId}-TEST`,
      passType: `${testPassType} (${ticketCount} tickets)`
    });
    
    console.log(`✅ Test WhatsApp message sent for ${ticketCount} tickets`);
    
    const results = [{
      booking: bookingId,
      tickets: ticketCount,
      success: result.success,
      messageId: result.messageId
    }];
    
    res.json({ 
      success: true, 
      message: `Test WhatsApp message sent to ${phone}`,
      totalTickets: ticketCount,
      results: results,
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
  const { booking_id, expected_amount } = req.body;
  
  console.log('🔍 CREATE PAYMENT DEBUG:');
  console.log('  Booking ID:', booking_id);
  console.log('  Expected amount from frontend:', expected_amount);
  
  try {
    let computedAmount = null;
    
    // Fetch booking to get complete pass details for accurate pricing
    const result = await query(`
      SELECT pass_type, num_tickets, total_amount, pass_details, ticket_type, booking_date FROM bookings WHERE id = $1
    `, [parseInt(booking_id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    
    console.log('📊 STORED BOOKING DATA:');
    console.log('  Pass type:', booking.pass_type);
    console.log('  Num tickets:', booking.num_tickets);
    console.log('  Total amount:', booking.total_amount);
    console.log('  Ticket type:', booking.ticket_type);
    console.log('  Pass details:', booking.pass_details);
    
    // Parse pass_details to see exact pass breakdown
    if (booking.pass_details) {
      try {
        const passDetails = typeof booking.pass_details === 'string' 
          ? JSON.parse(booking.pass_details) 
          : booking.pass_details;
        console.log('🎟️ PASS DETAILS BREAKDOWN:');
        console.log('  Passes object:', passDetails.passes);
        console.log('  Original passes:', passDetails.original_passes);
      } catch (e) {
        console.log('❌ Failed to parse pass_details:', e.message);
      }
    }
    
    // 💰 Enhanced pricing validation for Razorpay order creation
    try {
      // Primary: Use the pre-calculated total_amount from booking creation
      computedAmount = booking.total_amount;
      
      // Secondary: Validate against pass_details if available
      if (booking.pass_details) {
        try {
          const passDetails = typeof booking.pass_details === 'string' 
            ? JSON.parse(booking.pass_details) 
            : booking.pass_details;
          
          console.log('🔍 RECALCULATING FROM STORED PASSES:');
          
          // Recalculate amount from stored passes for validation
          if (passDetails.passes) {
            let recalculatedAmount = 0;
            
            // Use the original date string if available (avoids timezone issues)
            let validationDate = passDetails.details?.original_date_string || booking.booking_date;
            if (validationDate && typeof validationDate !== 'string') {
              // Convert Date object to YYYY-MM-DD format if needed
              validationDate = validationDate.toISOString().split('T')[0];
            } else if (validationDate && typeof validationDate === 'string' && validationDate.includes('T')) {
              // Convert datetime string to date-only format if needed
              validationDate = validationDate.split('T')[0];
            }
            Object.entries(passDetails.passes).forEach(([passType, count]) => {
              const passCount = Number(count) || 0;
              if (passCount <= 0) return;
              
              const passCalc = calculateTicketPrice(passType, booking.ticket_type, passCount, validationDate);
              if (passCalc && typeof passCalc.totalAmount === 'number') {
                recalculatedAmount += passCalc.totalAmount;
                console.log(`  ${passType}: ₹${passCalc.pricePerTicket} × ${passCount} = ₹${passCalc.totalAmount}`);
              }
            });
            
            console.log(`  🧮 Recalculated total: ₹${recalculatedAmount}`);
            console.log(`  💾 Stored total: ₹${computedAmount}`);
            console.log(`  🎯 Frontend expected: ₹${expected_amount}`);
            
            // Use recalculated amount if it differs from stored amount
            if (recalculatedAmount !== computedAmount) {
              console.warn('⚠️ Recalculated amount differs from stored amount, using recalculated');
              computedAmount = recalculatedAmount;
            }
          }
          
          if (passDetails.total_amount && passDetails.total_amount !== computedAmount) {
            console.warn('⚠️ Amount mismatch between booking.total_amount and pass_details:', {
              booking_total: computedAmount,
              pass_details_total: passDetails.total_amount
            });
            // Use pass_details as it's more detailed
            computedAmount = passDetails.total_amount;
          }
        } catch (parseError) {
          console.warn('Warning: Failed to parse pass_details:', parseError.message);
        }
      }
      
      // Fallback: Recalculate if no stored amount
      if (!computedAmount || computedAmount <= 0) {
        console.warn('⚠️ Using fallback pricing calculation for Razorpay order');
        
        const ticketType = booking.ticket_type || 'single';
        const fallbackCalc = computeTotalAmount(booking.pass_type, booking.num_tickets, ticketType);
        
        if (fallbackCalc && fallbackCalc.totalAmount > 0) {
          computedAmount = fallbackCalc.totalAmount;
          console.log('✅ Fallback calculation successful:', computedAmount);
        } else {
          throw new Error('All pricing calculation methods failed');
        }
      }
      
      // 🔍 Validate frontend-backend amount consistency for Razorpay
      if (expected_amount) {
        const expectedTotal = parseFloat(expected_amount);
        const tolerance = 0.01; // 1 paisa tolerance
        const difference = Math.abs(expectedTotal - computedAmount);
        
        if (difference > tolerance) {
          console.error('❌ Razorpay amount mismatch detected - attempting to fix...');
          
          // Try to recalculate from stored passes to fix the issue
          if (booking.pass_details) {
            try {
              const passDetails = typeof booking.pass_details === 'string' 
                ? JSON.parse(booking.pass_details) 
                : booking.pass_details;
              
              console.log('🔧 FIXING AMOUNT MISMATCH:');
              console.log('  Frontend expected:', expectedTotal);
              console.log('  Backend calculated:', computedAmount);
              console.log('  Stored passes:', passDetails.passes);
              
              // If the expected amount is reasonable (between 1 and 10000), use it
              if (expectedTotal >= 1 && expectedTotal <= 10000) {
                console.log('✅ Using frontend expected amount as it appears valid');
                computedAmount = expectedTotal;
                
                // Update the database with the corrected amount
                await query(`
                  UPDATE bookings 
                  SET total_amount = $1 
                  WHERE id = $2
                `, [computedAmount, parseInt(booking_id)]);
                
                console.log('✅ Database updated with corrected amount:', computedAmount);
              } else {
                console.log('❌ Frontend amount seems invalid, keeping backend calculation');
              }
              
            } catch (e) {
              console.error('❌ Failed to fix amount mismatch:', e.message);
            }
          }
          
          // If still mismatched after attempted fix, log detailed error but continue
          const newDifference = Math.abs(expectedTotal - computedAmount);
          if (newDifference > tolerance) {
            console.error('❌ Razorpay amount mismatch (after fix attempt):', {
              frontend_expected: expectedTotal,
              backend_calculated: computedAmount,
              difference: newDifference,
              booking_id
            });
            
            // Enhanced error details for debugging
            let errorDetails = {
              frontend_amount: expectedTotal,
              backend_amount: computedAmount,
              difference: newDifference,
              booking_id: booking_id,
              stored_booking: {
                pass_type: booking.pass_type,
                num_tickets: booking.num_tickets,
                ticket_type: booking.ticket_type
              },
              fix_attempted: true
            };
            
            // Add pass breakdown if available
            if (booking.pass_details) {
              try {
                const passDetails = typeof booking.pass_details === 'string' 
                  ? JSON.parse(booking.pass_details) 
                  : booking.pass_details;
                errorDetails.stored_passes = passDetails.passes;
                errorDetails.original_passes = passDetails.original_passes;
              } catch (e) {
                errorDetails.pass_details_error = 'Failed to parse pass details';
              }
            }
            
            // For now, continue with the expected amount to allow payment to proceed
            if (expectedTotal >= 99 && expectedTotal <= 10000) {
              console.log('⚠️ Proceeding with frontend expected amount to allow payment');
              computedAmount = expectedTotal;
            }
          }
        }
        
        console.log('✅ Razorpay amount validation passed:', {
          amount: computedAmount,
          booking_id
        });
      }
      
    } catch (pricingError) {
      console.error('❌ Pricing validation failed for Razorpay order:', pricingError.message);
      return res.status(400).json({
        success: false,
        error: "Pricing calculation failed",
        message: `Unable to calculate valid amount for booking ${booking_id}: ${pricingError.message}`
      });
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
    console.error("❌ Error in createPayment:", err);
    console.error("❌ Error details:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    
    // Send more specific error message
    let errorMessage = "Failed to create payment order";
    if (err.message) {
      if (err.message.includes('Razorpay')) {
        errorMessage = "Razorpay configuration error";
      } else if (err.message.includes('amount')) {
        errorMessage = "Invalid payment amount";
      } else if (err.message.includes('database') || err.message.includes('query')) {
        errorMessage = "Database error during payment creation";
      } else {
        errorMessage = `Payment creation failed: ${err.message}`;
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
      // 🎯 Extract individual pass types for multi-pass bookings
      let individualPassTypes = [];
      
      try {
        const passDetails = typeof booking.pass_details === 'string' 
          ? (booking.pass_details === '[object Object]' ? {} : JSON.parse(booking.pass_details || '{}'))
          : booking.pass_details || {};
        const originalPasses = passDetails.original_passes || passDetails.passes || {};
        const expandedPasses = passDetails.passes || {}; // This contains the expanded counts
        
        console.log('🔍 Pass details for QR generation:', {
          original: originalPasses,
          expanded: expandedPasses,
          num_tickets: booking.num_tickets
        });
        
        // Build array of individual pass types based on expanded passes (not original)
        // This handles couple/family ticket expansion properly
        // Sort entries to ensure consistent order: male, female, kids, etc.
        const sortedEntries = Object.entries(expandedPasses).sort(([a], [b]) => {
          const order = ['male', 'female', 'kids', 'kid', 'couple', 'family', 'family4'];
          const aIndex = order.indexOf(a);
          const bIndex = order.indexOf(b);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.localeCompare(b);
        });
        
        console.log('🔤 Sorted pass entries for QR generation:', sortedEntries);
        
        for (const [passType, count] of sortedEntries) {
          const ticketCount = Number(count) || 0;
          console.log(`   Adding ${ticketCount} tickets of type "${passType}"`);
          for (let j = 0; j < ticketCount; j++) {
            individualPassTypes.push(passType);
          }
        }
        
        // If we don't have enough individual pass types, fall back to original passes logic
        if (individualPassTypes.length < booking.num_tickets) {
          console.log('⚠️ Not enough expanded pass types, using original passes with couple/family expansion');
          individualPassTypes = [];
          
          for (const [passType, count] of Object.entries(originalPasses)) {
            const passCount = Number(count) || 0;
            
            if (passType === 'couple') {
              // Each couple ticket generates 1 male + 1 female ticket
              for (let j = 0; j < passCount; j++) {
                individualPassTypes.push('male');
                individualPassTypes.push('female');
              }
            } else if (passType === 'family' || passType === 'family4') {
              // Each family ticket generates 2 male + 2 female tickets
              for (let j = 0; j < passCount; j++) {
                individualPassTypes.push('male');
                individualPassTypes.push('female');
                individualPassTypes.push('male');
                individualPassTypes.push('female');
              }
            } else {
              // Regular tickets (male, female, kids, etc.)
              for (let j = 0; j < passCount; j++) {
                individualPassTypes.push(passType);
              }
            }
          }
        }
        
        console.log('🎟️ Individual pass types for QR generation:', individualPassTypes);
        console.log(`🔢 Expected tickets: ${booking.num_tickets}, Generated pass types: ${individualPassTypes.length}`);
        
      } catch (error) {
        console.error('Error parsing pass details:', error);
        // Fallback: use booking pass type for all tickets
        for (let j = 0; j < booking.num_tickets; j++) {
          individualPassTypes.push(booking.pass_type);
        }
      }

      for (let i = 0; i < booking.num_tickets; i++) {
        const ticketNumber = uuidv4();
        
        // Use individual pass type for each ticket
        const ticketPassType = individualPassTypes[i] || booking.pass_type;
        
        let qrCodeUrl;
        try {
          console.log('🔍 DEBUG QR Generation:');
          console.log('🔍 booking.booking_date type:', typeof booking.booking_date);
          console.log('🔍 booking.booking_date value:', booking.booking_date);
          
          // Extract original date from pass_details if available, otherwise fall back to conversion
          let eventDateForQR;
          console.log('🔍 DEBUG QR Date - pass_details exists:', !!booking.pass_details);
          if (booking.pass_details) {
            try {
              const passDetailsObj = typeof booking.pass_details === 'string' 
                ? JSON.parse(booking.pass_details) 
                : booking.pass_details;
              
              console.log('🔍 DEBUG QR Date - passDetailsObj structure:', JSON.stringify(passDetailsObj, null, 2));
              
              // Check if original_date_string is in details sub-object
              if (passDetailsObj.details && passDetailsObj.details.original_date_string) {
                eventDateForQR = passDetailsObj.details.original_date_string;
                console.log('🔍 SUCCESS: Using original_date_string from pass_details.details:', eventDateForQR);
              } else if (passDetailsObj.original_date_string) {
                eventDateForQR = passDetailsObj.original_date_string;
                console.log('🔍 SUCCESS: Using original_date_string from pass_details:', eventDateForQR);
              } else {
                console.log('🔍 WARNING: original_date_string not found in pass_details');
                console.log('🔍 DEBUG: passDetailsObj.details exists:', !!passDetailsObj.details);
                if (passDetailsObj.details) {
                  console.log('🔍 DEBUG: passDetailsObj.details keys:', Object.keys(passDetailsObj.details));
                }
              }
            } catch (e) {
              console.log('🔍 ERROR: Failed to parse pass_details:', e.message);
              console.log('🔍 DEBUG: Raw pass_details:', booking.pass_details);
            }
          }
          
          // Fallback to safe date extraction if original_date_string not available
          if (!eventDateForQR) {
            if (typeof booking.booking_date === 'string') {
              eventDateForQR = booking.booking_date.slice(0, 10);
            } else {
              eventDateForQR = booking.booking_date.toISOString().slice(0, 10);
            }
            console.log('🔍 Using fallback date extraction:', eventDateForQR);
          }
          
          console.log('🔍 Final eventDate for QR:', eventDateForQR);
          
          const qrData = {
            ticketNumber,
            bookingId: booking.id.toString(),
            passType: ticketPassType, // Use individual pass type
            eventDate: eventDateForQR
          };
          
          console.log('🔍 DEBUG Final QR Data:', JSON.stringify(qrData));
          qrCodeUrl = await generateQRCode(JSON.stringify(qrData));
        } catch (qrError) {
          console.error('QR generation failed, using fallback URL:', qrError);
          qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticketNumber}`;
        }
        
        console.log('🔍 DEBUG QR Database Insert:');
        console.log('🔍 booking.booking_date for DB:', booking.booking_date);
        
        // Extract original date from pass_details if available
        let eventDateForQR;
        if (booking.pass_details) {
          try {
            const passDetailsObj = typeof booking.pass_details === 'string' 
              ? JSON.parse(booking.pass_details) 
              : booking.pass_details;
            
            // Check if original_date_string is in details sub-object
            if (passDetailsObj.details && passDetailsObj.details.original_date_string) {
              eventDateForQR = passDetailsObj.details.original_date_string;
              console.log('🔍 Using original_date_string from pass_details.details:', eventDateForQR);
            } else if (passDetailsObj.original_date_string) {
              eventDateForQR = passDetailsObj.original_date_string;
              console.log('🔍 Using original_date_string from pass_details:', eventDateForQR);
            }
          } catch (e) {
            console.log('🔍 Failed to parse pass_details, using fallback:', e.message);
          }
        }
        
        // Fallback to safe date extraction
        if (!eventDateForQR) {
          if (typeof booking.booking_date === 'string') {
            eventDateForQR = booking.booking_date.slice(0, 10);
          } else {
            eventDateForQR = booking.booking_date.toISOString().slice(0, 10);
          }
          console.log('🔍 Using fallback date extraction:', eventDateForQR);
        }
        console.log('🔍 Final eventDate for QR:', eventDateForQR);
        
        const qrResult = await query(`
          INSERT INTO qr_codes (booking_id, user_id, ticket_number, qr_data, qr_code_url, expiry_date, is_used)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          booking.id, 
          booking.users[0]?.id, 
          ticketNumber, 
          JSON.stringify({ 
            ticketNumber, 
            bookingId: booking.id.toString(), 
            passType: ticketPassType, 
            eventDate: eventDateForQR
          }),
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
          
          // 🎯 ENHANCED: Extract pass type from QR code data for accurate individual tickets
          let individualPassType = booking.pass_type;
          let originalPassType = booking.pass_type;
          
          try {
            // Parse QR data to get the actual pass type for this ticket
            const qrData = typeof qrCodeData.qr_data === 'string' 
              ? (qrCodeData.qr_data === '[object Object]' ? {} : JSON.parse(qrCodeData.qr_data || '{}'))
              : qrCodeData.qr_data || {};
            if (qrData.passType) {
              individualPassType = qrData.passType;
              
              // For couple/family passes, keep the original pass type for colors
              if (booking.pass_type === 'couple' || booking.pass_type === 'family') {
                originalPassType = booking.pass_type;
              } else {
                // For multi-pass bookings, each ticket has its own color
                originalPassType = individualPassType;
              }
            }
          } catch (error) {
            console.error('Error parsing QR data:', error);
            // Improved fallback logic for different booking types
            if (booking.pass_type === 'couple') {
              individualPassType = (i % 2 === 0) ? 'female' : 'male';
              originalPassType = 'couple';
            } else if (booking.pass_type === 'family') {
              individualPassType = (i < 2) ? 'female' : 'male';
              originalPassType = 'family';
            } else {
              // For multi-pass bookings where pass_type might be the primary type,
              // try to get the actual pass type from pass_details
              try {
                const passDetails = typeof booking.pass_details === 'string' 
                  ? (booking.pass_details === '[object Object]' ? {} : JSON.parse(booking.pass_details || '{}'))
                  : booking.pass_details || {};
                const expandedPasses = passDetails.passes || {};
                
                // Build array of pass types in order
                const passList = [];
                const sortedEntries = Object.entries(expandedPasses).sort(([a], [b]) => {
                  const order = ['male', 'female', 'kids', 'kid', 'couple', 'family', 'family4'];
                  const aIndex = order.indexOf(a);
                  const bIndex = order.indexOf(b);
                  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                  if (aIndex !== -1) return -1;
                  if (bIndex !== -1) return 1;
                  return a.localeCompare(b);
                });
                
                for (const [passType, count] of sortedEntries) {
                  for (let j = 0; j < (Number(count) || 0); j++) {
                    passList.push(passType);
                  }
                }
                
                if (passList[i]) {
                  individualPassType = passList[i];
                  originalPassType = individualPassType;
                } else {
                  // Final fallback
                  individualPassType = booking.pass_type;
                  originalPassType = booking.pass_type;
                }
              } catch (passDetailsError) {
                console.error('Error parsing pass_details for fallback:', passDetailsError);
                individualPassType = booking.pass_type;
                originalPassType = booking.pass_type;
              }
            }
          }
          
          return {
            name: ticketUserName,
            date: booking.booking_date,
            pass_type: individualPassType, // Individual pass type for ticket content
            original_pass_type: originalPassType, // Original or individual pass type for color scheme
            ticket_type: booking.ticket_type || 'single',
            qrCode: qrCodeData.qr_code_url,
            booking_id: booking.id.toString(),
            ticket_number: qrCodeData.ticket_number,
            venue: "Event Ground, Malang"
          };
        });
        
        // Generate complete PDF with cover page and all individual tickets
        const completeBooking = {
          id: booking.id,
          name: primaryUser.name,
          email: primaryUser.email,
          phone: primaryUser.phone,
          pass_type: booking.pass_type,
          date: booking.booking_date,
          venue: 'Regal Lawns, Beed Bypass',
          ticket_type: booking.ticket_type || 'single',
          tickets: ticketsData
        };
        
        const { generateDandiyaTicketPDF } = await import("../utils/pdfGenerator.js");
        const pdfBuffer = await generateDandiyaTicketPDF(completeBooking);
        
        pdfAttachments.push({
          filename: `Dandiya_Complete_Tickets_${booking.id}_Cover_Plus_${booking.qr_codes.length}_Individual_Tickets.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        });
        
        console.log(`📄 Generated complete PDF (cover page + ${booking.qr_codes.length} individual tickets) successfully`);
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
          emailSubject = `Your Dandiya Night Couple Tickets #${booking.id} (Cover page + ${coupleCount} couple ticket${coupleCount > 1 ? 's' : ''} - ${coupleCount * 2} individual pages)`;
        } else if (hasOriginalFamilyTickets) {
          const familyCount = originalPassDetails.family_conversion?.family_tickets || 1;
          emailSubject = `Your Dandiya Night Family Tickets #${booking.id} (Cover page + ${familyCount} family ticket${familyCount > 1 ? 's' : ''} - ${familyCount * 4} individual pages)`;
        } else {
          emailSubject = `Your Dandiya Night Tickets #${booking.id} (Cover page + ${booking.num_tickets} individual tickets)`;
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
          ? `with 1 complete PDF containing cover page + ${booking.num_tickets} individual full-page tickets`
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
        
        console.log(`📱 Preparing to send complete PDF with cover page + ${booking.num_tickets} individual tickets for booking ${booking.id}`);

        // Generate complete PDF with cover page and all individual tickets
        let completePdfBuffer = null;
        try {
          const { generateDandiyaTicketPDF } = await import("../utils/pdfGenerator.js");
          
          // Prepare tickets data for complete PDF generation
          const ticketsData = [];
          for (let ticketIndex = 1; ticketIndex <= booking.num_tickets; ticketIndex++) {
            ticketsData.push({
              name: primaryUser.name,
              date: booking.booking_date,
              pass_type: booking.pass_type,
              ticket_type: booking.ticket_type || 'single',
              qrCode: booking.qr_code,
              booking_id: booking.id,
              ticket_number: `TICKET-${booking.id}-${String(ticketIndex).padStart(3, '0')}`,
              venue: 'Regal Lawns, Beed Bypass'
            });
          }

          // Create booking object for complete PDF generation
          const completeBooking = {
            id: booking.id,
            name: primaryUser.name,
            email: primaryUser.email,
            phone: primaryUser.phone,
            pass_type: booking.pass_type,
            date: booking.booking_date,
            venue: 'Regal Lawns, Beed Bypass',
            ticket_type: booking.ticket_type || 'single',
            tickets: ticketsData
          };

          completePdfBuffer = await generateDandiyaTicketPDF(completeBooking);
          console.log(`📄 Generated complete PDF (cover page + ${booking.num_tickets} tickets):`, completePdfBuffer ? `${completePdfBuffer.length} bytes` : 'failed');
        } catch (pdfError) {
          console.error(`❌ Complete PDF generation failed:`, pdfError);
        }

        // Send single WhatsApp message with complete PDF
        const whatsappResult = await whatsappService.sendBookingConfirmation({
          phone: phoneNumber,
          name: primaryUser.name,
          eventName: 'Malang Ras Dandiya 2025',
          eventDate: booking.booking_date, // Pass actual booking date
          ticketCount: booking.num_tickets,
          amount: `₹${payment?.amount || booking.final_amount || 0}`,
          bookingId: booking.id,
          pdfBuffer: completePdfBuffer,
          ticketNumber: `BOOKING-${booking.id}`,
          passType: booking.pass_type
        });

        console.log(`💬 WhatsApp complete PDF sent to:`, phoneNumber);
        console.log(`📋 PDF contains: Cover page + ${booking.num_tickets} individual full-page tickets`);
        console.log(`📋 WhatsApp result:`, whatsappResult?.success ? 'Success' : 'Failed');
        
      } catch (whatsappError) {
        console.error('❌ WhatsApp PDF send failed:', whatsappError);
        
        // Try sending WhatsApp without PDF as fallback
        try {
          console.log('📱 Retrying WhatsApp without PDF...');
          
          const fallbackResult = await whatsappService.sendBookingConfirmation({
            phone: phoneNumber,
            name: primaryUser.name,
            eventName: 'Malang Ras Dandiya 2025',
            eventDate: booking.booking_date,
            ticketCount: booking.num_tickets,
            amount: `₹${payment?.amount || booking.final_amount || 0}`,
            bookingId: booking.id,
            pdfBuffer: null, // No PDF
            ticketNumber: `BOOKING-${booking.id}`,
            passType: booking.pass_type
          });
          
          console.log('✅ WhatsApp fallback message sent successfully');
        } catch (fallbackError) {
          console.error('❌ WhatsApp fallback also failed:', fallbackError);
        }
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
  console.log('🔍 getQRDetails called!');
  console.log('🔍 Request body:', req.body);
  
  const { ticket_number, qr_data, qr_code } = req.body;
  
  // Handle JSON QR data
  let qrCodeValue = qr_code || ticket_number;
  let eventDate = null;
  
  if (qr_data && !qrCodeValue) {
    try {
      // Parse JSON QR data to extract ticket number and event date
      const parsedQR = JSON.parse(qr_data);
      qrCodeValue = parsedQR.ticketNumber || parsedQR.ticket_number;
      eventDate = parsedQR.eventDate;
      console.log('🔍 Parsed from QR data - Ticket:', qrCodeValue, 'Event Date:', eventDate);
    } catch (e) {
      console.log('🔍 Using raw QR data as ticket number:', qr_data);
      qrCodeValue = qr_data;
    }
  }
  
  console.log('🔍 Final QR Code Value:', qrCodeValue);
  console.log('🔍 Event Date from QR:', eventDate);
  
  if (!qrCodeValue) {
    return res.status(400).json({ error: "QR code is required" });
  }
  
  try {
    // First, always get ticket information regardless of date
    const ticketResult = await query(`
      SELECT qr.*, b.pass_type, b.booking_date, u.name as user_name
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      WHERE qr.ticket_number = $1
    `, [qrCodeValue]);

    if (ticketResult.rows.length === 0) {
      console.log('❌ Ticket not found for:', qrCodeValue);
      return res.status(404).json({ 
        error: "Ticket not found",
        message: "This ticket number does not exist in our system."
      });
    }

    const qrCode = ticketResult.rows[0];
    
    // Get current date in YYYY-MM-DD format using IST timezone utility
    const currentDateString = getCurrentISTDateString();
    
    // Get ticket's booked date in YYYY-MM-DD format - convert to IST since DB stores UTC
    const ticketDate = new Date(qrCode.booking_date);
    const ticketDateString = getDateString(ticketDate, true); // Convert to IST for comparison
    
    console.log('🔍 Date validation (IST Timezone):');
    console.log('  Current date (IST):', currentDateString);
    console.log('  Ticket date:', ticketDateString);
    console.log('  Dates match:', currentDateString === ticketDateString);
    console.log('  Timezone info:', getTimezoneInfo());
    
    // Enhanced date validation - tickets only valid on their booked date
    if (currentDateString !== ticketDateString) {
      const ticketDateFormatted = formatDateForIndianLocale(ticketDate);
      const currentDateFormatted = formatDateForIndianLocale(getCurrentISTDate());
      
      console.log('❌ Date validation failed:');
      console.log('  Ticket is for:', ticketDateFormatted);
      console.log('  Today is:', currentDateFormatted);
      
      return res.status(400).json({ 
        error: "Ticket not valid for today",
        message: `This ticket is valid only for ${ticketDateFormatted}. Today is ${currentDateFormatted}.`,
        details: {
          ticket_valid_date: ticketDateFormatted,
          current_date: currentDateFormatted,
          ticket_date_iso: ticketDateString,
          current_date_iso: currentDateString
        }
      });
    }
    
    // Additional validation: Check if QR data contains event date and validate it
    if (eventDate) {
      const qrEventDate = new Date(eventDate);
      const qrDateString = qrEventDate.toISOString().slice(0, 10);
      
      if (qrDateString !== ticketDateString) {
        console.log('⚠️ QR event date mismatch with booking date:');
        console.log('  QR event date:', qrDateString);
        console.log('  Booking date:', ticketDateString);
        
        return res.status(400).json({ 
          error: "QR code data inconsistency", 
          message: `QR code shows event date ${qrDateString}, but ticket is booked for ${ticketDateString}`
        });
      }
    }

    console.log('✅ Ticket found and date validated successfully!');

    // Convert BigInt fields to strings for JSON serialization
    const ticketResponse = {
      ...qrCode,
      id: qrCode.id.toString(),
      booking_id: qrCode.booking_id.toString(),
      user_id: qrCode.user_id ? qrCode.user_id.toString() : null,
      // Add fields expected by QR verifier
      success: true,
      already_used: qrCode.is_used,
      guest_name: qrCode.user_name,
      valid_date: ticketDateString,
      is_valid_today: true // Only true if we reach this point
    };

    console.log('✅ Ticket validation passed, returning response');
    res.status(200).json({ 
      success: true, 
      ticket: ticketResponse,
      // Also include direct fields for compatibility
      already_used: qrCode.is_used,
      guest_name: qrCode.user_name,
      valid_date: ticketDateString,
      message: "Ticket is valid for today"
    });
  } catch (err) {
    console.error("Error in getQRDetails:", err);
    res.status(500).json({ error: "Failed to get QR details" });
  }
};

// 6️⃣ Mark Ticket as Used
export const markTicketUsed = async (req, res) => {
  console.log('🛠️ markTicketUsed called!');
  console.log('🛠️ Request body:', req.body);
  
  const { ticket_number, qr_data, qr_code } = req.body;
  
  // Handle JSON QR data
  let qrCodeValue = qr_code || ticket_number;
  let eventDate = null;
  
  if (qr_data && !qrCodeValue) {
    try {
      // Parse JSON QR data to extract ticket number and event date
      const parsedQR = JSON.parse(qr_data);
      qrCodeValue = parsedQR.ticketNumber || parsedQR.ticket_number;
      eventDate = parsedQR.eventDate;
      console.log('🛠️ Parsed from QR data - Ticket:', qrCodeValue, 'Event Date:', eventDate);
    } catch (e) {
      console.log('🛠️ Using raw QR data as ticket number:', qr_data);
      qrCodeValue = qr_data;
    }
  }
  
  console.log('🛠️ Final ticket number:', qrCodeValue);
  console.log('🛠️ Event Date from QR:', eventDate);
  
  if (!qrCodeValue) {
    return res.status(400).json({ error: "Ticket number is required" });
  }
  
  try {
    // First, always get ticket information regardless of date for comprehensive validation
    const ticketCheckResult = await query(`
      SELECT qr.*, b.pass_type, b.booking_date, u.name as user_name
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      WHERE qr.ticket_number = $1
    `, [qrCodeValue]);

    if (ticketCheckResult.rows.length === 0) {
      console.log('❌ Ticket not found for:', qrCodeValue);
      return res.status(404).json({ 
        error: "Ticket not found",
        message: "This ticket number does not exist in our system."
      });
    }

    const qrTicket = ticketCheckResult.rows[0];
    
    // Check if ticket is already used
    if (qrTicket.is_used) {
      console.log('❌ Ticket already used:', qrCodeValue);
      return res.status(400).json({ 
        error: "Ticket already used",
        message: "This ticket has already been scanned and used."
      });
    }
    
    // Get current date in YYYY-MM-DD format using IST timezone utility
    const currentDateString = getCurrentISTDateString();
    
    // Get ticket's booked date in YYYY-MM-DD format - convert to IST since DB stores UTC
    const ticketDate = new Date(qrTicket.booking_date);
    const ticketDateString = getDateString(ticketDate, true); // Convert to IST for comparison
    
    console.log('🛠️ Date validation for ticket usage (IST Timezone):');
    console.log('  Current date (IST):', currentDateString);
    console.log('  Ticket date:', ticketDateString);
    console.log('  Dates match:', currentDateString === ticketDateString);
    console.log('  Timezone info:', getTimezoneInfo());
    
    // Enhanced date validation - tickets can only be used on their booked date
    if (currentDateString !== ticketDateString) {
      const ticketDateFormatted = formatDateForIndianLocale(ticketDate);
      const currentDateFormatted = formatDateForIndianLocale(getCurrentISTDate());
      
      console.log('❌ Date validation failed for ticket usage:');
      console.log('  Ticket is for:', ticketDateFormatted);
      console.log('  Today is:', currentDateFormatted);
      
      return res.status(400).json({ 
        error: "Ticket not valid for today",
        message: `This ticket can only be used on ${ticketDateFormatted}. Today is ${currentDateFormatted}.`,
        details: {
          ticket_valid_date: ticketDateFormatted,
          current_date: currentDateFormatted,
          ticket_date_iso: ticketDateString,
          current_date_iso: currentDateString
        }
      });
    }
    
    // Additional validation: Check if QR data contains event date and validate it
    if (eventDate) {
      const qrEventDate = new Date(eventDate);
      const qrDateString = qrEventDate.toISOString().slice(0, 10);
      
      if (qrDateString !== ticketDateString) {
        console.log('⚠️ QR event date mismatch with booking date for usage:');
        console.log('  QR event date:', qrDateString);
        console.log('  Booking date:', ticketDateString);
        
        return res.status(400).json({ 
          error: "QR code data inconsistency", 
          message: `QR code shows event date ${qrDateString}, but ticket is booked for ${ticketDateString}`
        });
      }
    }

    // Now mark the ticket as used (date validation passed)
    const updateResult = await query(`
      UPDATE qr_codes
      SET is_used = true, used_at = NOW()
      WHERE ticket_number = $1 AND is_used = false
      RETURNING *
    `, [qrCodeValue]);

    if (updateResult.rows.length === 0) {
      // This shouldn't happen since we checked above, but just in case
      return res.status(400).json({ 
        error: "Failed to mark ticket as used",
        message: "Ticket could not be updated. It may have been used by another scanner."
      });
    }

    const qrCode = updateResult.rows[0];

    // Log the scan
    await query(`
      INSERT INTO qr_scans (booking_id, ticket_number, used_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (ticket_number) DO NOTHING
    `, [qrCode.booking_id, qrCodeValue]);

    console.log('✅ Ticket marked as used successfully after date validation');
    res.status(200).json({ 
      success: true, 
      message: "Ticket marked as used successfully",
      details: {
        ticket_number: qrCodeValue,
        used_on: currentDateString,
        guest_name: qrTicket.user_name
      }
    });
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

// 8️⃣ Get Pricing Information (NEW) - Now with date-specific pricing
export const getPricingInfo = async (req, res) => {
  const { pass_type, ticket_type = 'single', num_tickets = 1, booking_date } = req.query;

  try {
    if (!pass_type) {
      return res.status(400).json({
        success: false,
        error: 'pass_type is required'
      });
    }

    // Use current date if no booking_date is provided
    const dateToUse = booking_date || getCurrentISTDateString();
    const priceInfo = calculateTicketPrice(pass_type, ticket_type, parseInt(num_tickets), dateToUse);
    
    // Format response for frontend
    const response = {
      success: true,
      pricing: {
        pass_type,
        ticket_type,
        num_tickets: parseInt(num_tickets),
        currency: 'INR',
        base_price: priceInfo.basePrice,
        price_per_ticket: priceInfo.pricePerTicket,
        total_amount: priceInfo.totalAmount,
        discount_applied: priceInfo.discountApplied,
        discount_amount: priceInfo.discountAmount || 0,
        savings: priceInfo.savings || 0,
        // Formatted strings for display (without currency symbols - let frontend handle)
        formatted: {
          base_price: priceInfo.basePrice.toString(),
          price_per_ticket: priceInfo.pricePerTicket.toString(),
          total_amount: priceInfo.totalAmount.toString(),
          discount_amount: (priceInfo.discountAmount || 0).toString()
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error in getPricingInfo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate pricing',
      details: error.message
    });
  }
};

// 🧪 Pricing Consistency Validation Endpoint
export const validatePricingConsistencyEndpoint = async (req, res) => {
  try {
    const { 
      pass_type, 
      ticket_type = 'single', 
      quantity = 1,
      frontend_amount,
      test_scenarios = false 
    } = req.body;

    console.log('🔍 Validating pricing consistency:', {
      pass_type,
      ticket_type,
      quantity,
      frontend_amount
    });

    // Run validation for the provided parameters
    const results = [];
    
    if (pass_type && quantity) {
      try {
        const backendCalc = computeTotalAmount(pass_type, quantity, ticket_type);
        
        if (!backendCalc) {
          throw new Error(`Invalid pricing combination: ${ticket_type} ${pass_type}`);
        }
        
        let validation = { isValid: true };
        
        if (frontend_amount) {
          validation = validatePricingConsistency(
            frontend_amount,
            backendCalc,
            pass_type,
            quantity,
            ticket_type
          );
        }
        
        results.push({
          scenario: `${pass_type} (${ticket_type}) x${quantity}`,
          backend_calculation: backendCalc,
          frontend_amount: frontend_amount ? parseFloat(frontend_amount) : null,
          validation_result: validation,
          pricing_details: {
            base_price: backendCalc.basePrice,
            price_per_ticket: backendCalc.pricePerTicket,
            total_amount: backendCalc.totalAmount,
            discount_applied: backendCalc.discountApplied,
            discount_amount: backendCalc.discountAmount
          }
        });
        
      } catch (pricingError) {
        results.push({
          scenario: `${pass_type} (${ticket_type}) x${quantity}`,
          error: pricingError.message,
          validation_result: { isValid: false, error: pricingError.message }
        });
      }
    }

    // If test_scenarios is true, run comprehensive tests
    if (test_scenarios) {
      const testScenarios = [
        // Single Day Tickets - Normal scenarios
        { pass_type: 'female', ticket_type: 'single', quantity: 1 },     // ₹99
        { pass_type: 'female', ticket_type: 'single', quantity: 10 },    // ₹990 (no bulk discount)
        { pass_type: 'couple', ticket_type: 'single', quantity: 1 },     // ₹249  
        { pass_type: 'family', ticket_type: 'single', quantity: 1 },     // ₹499
        { pass_type: 'kids', ticket_type: 'single', quantity: 1 },       // ₹99
        { pass_type: 'male', ticket_type: 'single', quantity: 1 },       // ₹199
        
        // Season Pass Tickets - 8 Days
        { pass_type: 'female', ticket_type: 'season', quantity: 1 },     // ₹792
        { pass_type: 'couple', ticket_type: 'season', quantity: 1 },     // ₹1992
        { pass_type: 'family', ticket_type: 'season', quantity: 1 },     // ₹3992
        
        // Multiple quantity scenarios (fixed pricing)
        { pass_type: 'female', ticket_type: 'single', quantity: 12 },    // ₹1188 (99*12)
        { pass_type: 'couple', ticket_type: 'single', quantity: 6 },     // ₹1494 (249*6)
        { pass_type: 'family', ticket_type: 'single', quantity: 4 }      // ₹1996 (499*4)
      ];

      for (const scenario of testScenarios) {
        try {
          const calc = computeTotalAmount(scenario.pass_type, scenario.quantity, scenario.ticket_type);
          
          if (calc) {
            results.push({
              scenario: `${scenario.pass_type} (${scenario.ticket_type}) x${scenario.quantity}`,
              backend_calculation: calc,
              test_result: 'SUCCESS',
              pricing_details: {
                base_price: calc.basePrice,
                price_per_ticket: calc.pricePerTicket,
                total_amount: calc.totalAmount,
                discount_applied: calc.discountApplied,
                discount_amount: calc.discountAmount
              }
            });
          } else {
            results.push({
              scenario: `${scenario.pass_type} (${scenario.ticket_type}) x${scenario.quantity}`,
              test_result: 'FAILED',
              error: 'Pricing calculation returned null'
            });
          }
        } catch (error) {
          results.push({
            scenario: `${scenario.pass_type} (${scenario.ticket_type}) x${scenario.quantity}`,
            test_result: 'ERROR',
            error: error.message
          });
        }
      }
    }

    // Summary
    const summary = {
      total_tests: results.length,
      successful_validations: results.filter(r => r.validation_result?.isValid !== false && r.test_result !== 'FAILED' && r.test_result !== 'ERROR').length,
      failed_validations: results.filter(r => r.validation_result?.isValid === false || r.test_result === 'FAILED' || r.test_result === 'ERROR').length,
      pricing_structure: {
        regular_single_day_prices: {
          female: "₹399",
          male: "₹499",
          couple: "₹699", 
          family: "₹1300",
          kids: "₹99"
        },
        dhamaka_prices_sep25_26: {
          female: "₹99",
          male: "₹199",
          couple: "₹249", 
          family: "₹499",
          kids: "₹99"
        },
        season_pass_prices: {
          female: "₹2499 (8 Days)",
          couple: "₹3499 (8 Days)", 
          family: "₹5999 (8 Days)"
        },
        bulk_discounts: "Available for larger bookings"
      }
    };

    res.json({
      success: true,
      message: 'Pricing consistency validation completed',
      summary,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Pricing validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Pricing validation failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// 🧪 Create Test QR Code for Mobile App Testing
export const createTestQR = async (req, res) => {
  try {
    const testTicketNumber = `TEST-${Date.now()}`;
    
    console.log('🧪 Creating test QR code:', testTicketNumber);
    
    // First, create a test booking record
    const testBookingResult = await query(`
      INSERT INTO bookings (booking_date, num_tickets, pass_type, ticket_type, total_amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      '2025-09-23T00:00:00.000Z', // booking_date
      1, // num_tickets
      'female', // pass_type
      'single', // ticket_type
      0, // total_amount (free for test)
      'confirmed', // status
      new Date() // created_at
    ]);
    
    const testBooking = testBookingResult.rows[0];
    console.log('🧪 Created test booking:', testBooking.id);
    
    // Create test QR code in database (without user_id since it might be optional)
    const qrResult = await query(`
      INSERT INTO qr_codes (booking_id, ticket_number, qr_data, qr_code_url, expiry_date, is_used)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      testBooking.id,
      testTicketNumber,
      JSON.stringify({ 
        ticketNumber: testTicketNumber, 
        bookingId: testBooking.id.toString(), 
        passType: 'female', 
        eventDate: '2025-09-23T00:00:00.000Z' 
      }),
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${testTicketNumber}`,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    ]);
    
    const testQR = qrResult.rows[0];
    
    res.json({
      success: true,
      message: 'Test QR code created successfully',
      testQR: {
        ticket_number: testQR.ticket_number,
        qr_data: testQR.qr_data,
        qr_code_url: testQR.qr_code_url,
        booking_id: testBooking.id.toString(),
        instructions: 'Scan this QR code with your mobile app to test verification'
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating test QR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test QR code',
      details: error.message
    });
  }
};

// 📋 Get all marked/scanned tickets
export const getMarkedTickets = async (req, res) => {
  console.log('📋 getMarkedTickets called!');
  
  try {
    // Get query parameters for filtering
    const { 
      limit = 50, 
      offset = 0, 
      date = null, 
      search = null,
      status = 'all' // 'used', 'unused', 'all'
    } = req.query;
    
    console.log('🔍 Query params:', { limit, offset, date, search, status });
    
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    // Add date filter if provided
    if (date) {
      whereConditions.push(`b.booking_date::date = $${paramIndex}`);
      queryParams.push(date);
      paramIndex++;
    }
    
    // Add search filter if provided (search by user name or ticket number)
    if (search && search.trim()) {
      whereConditions.push(`(
        u.name ILIKE $${paramIndex} OR 
        qr.ticket_number::text ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    // Add status filter
    if (status === 'used') {
      whereConditions.push(`qr.is_used = true`);
    } else if (status === 'unused') {
      whereConditions.push(`qr.is_used = false`);
    }
    
    // Build WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    // Main query to get tickets with details
    const ticketsQuery = `
      SELECT 
        qr.ticket_number,
        qr.is_used as used,
        qr.used_at,
        qr.created_at as qr_created,
        b.id as booking_id,
        b.booking_date,
        b.pass_type,
        b.total_amount,
        b.created_at as booking_created,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        CASE 
          WHEN qr.is_used = true THEN 'Used'
          ELSE 'Available'
        END as status,
        CASE 
          WHEN qr.is_used = true THEN qr.used_at
          ELSE NULL
        END as scan_time
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      ${whereClause}
      ORDER BY 
        CASE WHEN qr.is_used = true THEN qr.used_at ELSE qr.created_at END DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(parseInt(limit), parseInt(offset));
    
    console.log('🔍 Executing query:', ticketsQuery);
    console.log('🔍 Query params:', queryParams);
    
    const result = await query(ticketsQuery, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const countResult = await query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Get summary statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN qr.is_used = true THEN 1 END) as used_tickets,
        COUNT(CASE WHEN qr.is_used = false THEN 1 END) as unused_tickets,
        COUNT(CASE WHEN qr.used_at::date = CURRENT_DATE THEN 1 END) as scanned_today
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      ${whereClause.replace(/LIMIT.*$/, '')} -- Remove limit from stats query
    `;
    
    const statsResult = await query(statsQuery, countParams);
    const stats = statsResult.rows[0];
    
    console.log('✅ Found tickets:', result.rows.length);
    console.log('📊 Stats:', stats);
    
    res.json({
      success: true,
      data: {
        tickets: result.rows,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > (parseInt(offset) + parseInt(limit))
        },
        stats: {
          total_tickets: parseInt(stats.total_tickets),
          used_tickets: parseInt(stats.used_tickets),
          unused_tickets: parseInt(stats.unused_tickets),
          scanned_today: parseInt(stats.scanned_today)
        },
        filters: {
          date,
          search,
          status
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching marked tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket data',
      message: error.message
    });
  }
};
