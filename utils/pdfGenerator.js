import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";

// Import the QR generator function
async function generateQRCodeBuffer(text) {
  try {
    const qrBuffer = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });
    return qrBuffer;
  } catch (error) {
    console.error('❌ Error generating QR code buffer:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * 🎟️ OFFICIAL TICKET COLOR RULES - Master Implementation
 * 
 * Single Tickets:
 * - Male → BLACK (❌ cannot be purchased alone)
 * - Female → PINK  
 * - Couple → PURPLE (always 2 tickets in PDF)
 * - Family → GREEN (always 4 tickets in PDF) 
 * - Kid → YELLOW (❌ cannot be purchased alone)
 * 
 * Season Pass Tickets → Rainbow (with 9 rainbow elements)
 * - Female Season Pass → Rainbow
 * - Family Season Pass → Rainbow  
 * - Couple Season Pass → Rainbow
 */

// 🌈 Centralized Color Mapping Function
const getTicketColors = (passType, ticketType = 'single', originalPassType = null) => {
  // Use original pass type for color determination if provided (for couple/family individual tickets)
  const colorPassType = (originalPassType || passType || '').toString().toLowerCase();
  const type = (passType || '').toString().toLowerCase();
  const isSeasonPass = ticketType === 'season';
  
  // Season Pass tickets get rainbow design
  if (isSeasonPass && (colorPassType === 'female' || colorPassType === 'family' || colorPassType === 'family4' || colorPassType === 'couple')) {
    return { 
      primary: '#FF0000', 
      secondary: '#FF7F00', 
      tertiary: '#FFFF00',
      name: 'RAINBOW',
      isRainbow: true,
      rainbowColors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3']
    };
  }
  
  // Standard single day tickets - use original pass type for colors
  switch (colorPassType) {
    case 'male': 
      return { primary: '#000000', secondary: '#333333', name: 'BLACK' }; // BLACK as requested
    case 'female': 
      return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' }; // Changed to PINK as requested
    case 'couple': 
      return { primary: '#8A2BE2', secondary: '#DDA0DD', name: 'PURPLE' }; // Keep PURPLE
    case 'family':
    case 'family4': 
      return { primary: '#32CD32', secondary: '#90EE90', name: 'GREEN' }; // Keep GREEN
    case 'kids':
    case 'kid': 
      return { primary: '#FFD700', secondary: '#FFFFE0', name: 'YELLOW' };
    case 'group': 
      return { primary: '#1E90FF', secondary: '#87CEEB', name: 'BLUE' };
    default: 
      return { primary: '#ff6b35', secondary: '#ffa500', name: 'ORANGE' };
  }
};

// 🌈 Rainbow Design Generator - Appears 9 Times for Season Passes (Updated for 480×720)
const addRainbowElements = (doc, colors, centerX = 240, centerY = 360) => {
  const rainbowColors = colors.rainbowColors;
  
  // Rainbow Element 1: Header Gradient Bar - Updated for wider page
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(50 + (i * 55), 35, 55, 10)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 2: Side Border Stripes (Left) - Updated for taller page
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(20, 90 + (i * 70), 10, 60)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 3: Side Border Stripes (Right) - Updated for wider page
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(450, 90 + (i * 70), 10, 60)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 4: QR Code Frame - Updated positioning
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(centerX - 70 + (i * 20), centerY - 70, 18, 4)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 5: Decorative Circles - Updated for wider page
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.circle(60 + (i * 52), 620, 10)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 6: Footer Wave Pattern - Updated for wider page
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(40 + (i * 57), 670, 50, 8)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 7: Corner Triangles
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 30 : 370;
    const y = i % 2 === 0 ? 50 : 580;
    doc.polygon([x, y], [x + 15, y], [x, y + 15])
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 8: Pass Type Badge Rainbow Border
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(250 + (i * 2), 270, 2, 25)
       .fillColor(rainbowColors[i])
       .fill();
  }
  
  // Rainbow Element 9: Season Pass Special Text Background
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(45 + (i * 42), 195, 40, 4)
       .fillColor(rainbowColors[i])
       .fill();
  }
};

/**
 * 🎟️ ENHANCED Dandiya ticket PDF generator with official color coding
 * Features: Clickable links, professional branding, enhanced QR codes, better error handling
 */
export const generateDandiyaTicketPDFBuffer = async (ticketData) => {
   return new Promise(async (resolve, reject) => {
      const { name, date, pass_type, qrCode, booking_id, ticket_number, venue, ticket_type } = ticketData || {};

      // Enhanced validation and safe defaults
      const safeName = (name ?? "Guest").toString().trim();
      const safePassType = (pass_type ?? "Standard Pass").toString().trim();
      const safeDate = date ?? new Date().toISOString();
      const safeVenue = venue ?? "Regal Lawns, Near Deolai Chowk, Beed Bypass, Chhatrapati Sambhajinagar";
      const safeBookingId = booking_id ?? `BK${Date.now()}`;
      const safeTicketNumber = ticket_number ?? `TK${Date.now()}`;

      // Enhanced error handling
      if (!qrCode) {
        console.warn('⚠️ No QR code provided for PDF generation');
      }

      // Use centralized color mapping
      const passTypeColors = getTicketColors(safePassType, ticket_type, ticketData.original_pass_type);

      console.log('🎟️ Generating enhanced PDF ticket:', {
        name: safeName,
        pass_type: safePassType,
        ticket_type: ticket_type || 'single',
        color_scheme: passTypeColors.name,
        has_qr: !!qrCode
      });

      const doc = new PDFDocument({ 
        size: [480, 720], // Increased from 420×650 for better spacing
        margin: 25, // Increased from 15 for better content spacing
        info: {
          Title: `Malang Raas Dandiya 2025 - ${safeName}`,
          Author: 'Malang Events',
          Subject: `Ticket - ${safePassType}`,
          Keywords: 'dandiya,ticket,malang,raas,2025',
          Creator: 'Malang Events PDF Generator',
          Producer: 'Enhanced PDF Generator v2.0'
        }
      });
      
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', (e) => {
        console.error('❌ PDF generation error:', e);
        reject(e);
      });
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      try {
        await generateSingleTicketPage(doc, {
          name: safeName,
          date: safeDate,
          pass_type: safePassType,
          ticket_type: ticket_type || 'single',
          qrCode,
          booking_id,
          ticket_number,
          venue: safeVenue,
          passTypeColors
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
   });
};

// New function to generate multi-page PDF with different colored tickets
export const generateMultiPageTicketPDF = async (ticketsData) => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: [480, 720], margin: 25 }); // Improved spacing
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (e) => reject(e));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      for (let i = 0; i < ticketsData.length; i++) {
        const ticketData = ticketsData[i];
        
        // Add new page for each ticket (except the first one)
        if (i > 0) {
          doc.addPage();
        }

        // Use centralized color mapping
        const passTypeColors = getTicketColors(ticketData.pass_type, ticketData.ticket_type, ticketData.original_pass_type);

        await generateSingleTicketPage(doc, {
          name: ticketData.name || "Guest",
          date: ticketData.date || new Date().toISOString(),
          pass_type: ticketData.pass_type || "Standard Pass",
          ticket_type: ticketData.ticket_type || 'single',
          qrCode: ticketData.qrCode,
          booking_id: ticketData.booking_id,
          ticket_number: ticketData.ticket_number,
          venue: ticketData.venue || "Regal Lawns, Near Deolai Chowk, Beed Bypass, Chhatrapati Sambhajinagar",
          passTypeColors
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Helper function to generate a single ticket page
async function generateSingleTicketPage(doc, ticketData) {
  const { name, date, pass_type, ticket_type, qrCode, booking_id, ticket_number, ticket_id, venue, passTypeColors } = ticketData;
  
  try {
    const safeName = name || "Guest";
    const safeDate = date || new Date().toISOString();
    const safePassType = pass_type || "Standard Pass";
    const safeTicketType = ticket_type || "single";
    const safeVenue = venue || "Regal Lawns, Near Deolai Chowk, Beed Bypass, Chhatrapati Sambhajinagar";
    const safeBookingId = booking_id ?? `BK${Date.now()}`;

    // Background - Rich gradient effect
    doc.rect(0, 0, 480, 720).fillColor('#1a1a2e').fill();
    
    // 🌈 Add rainbow design for season passes (9 rainbow elements)
    if (passTypeColors.isRainbow) {
      addRainbowElements(doc, passTypeColors);
    }
    
    // Decorative border with pass type color - Better proportions
    doc.roundedRect(15, 15, 450, 690, 12)
       .lineWidth(3)
       .strokeColor(passTypeColors.primary)
       .stroke();
    
    // Inner decorative border
    doc.roundedRect(23, 23, 434, 674, 10)
       .lineWidth(1)
       .strokeColor(passTypeColors.secondary)
       .stroke();

    // Header background with pass type gradient effect - Better proportioned
    doc.rect(30, 30, 420, 90)
       .fillColor(passTypeColors.primary)
       .fill();
    
    // Header decorative overlay
    doc.rect(30, 30, 420, 90)
       .fillColor(passTypeColors.secondary)
       .fillOpacity(0.3)
       .fill()
       .fillOpacity(1);

        // Download and add logo
        let yPos = 40; // Adjusted for better spacing
        try {
          const logoResponse = await axios.get('https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/IMG_8079-removebg-preview.png', {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          const logoBuffer = Buffer.from(logoResponse.data, 'binary');
          
          // Logo positioning - Better proportioned
          doc.image(logoBuffer, 40, yPos, { width: 70, height: 70 });
          
          // Event title with logo - Better font sizes
          doc.fontSize(20)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text('MALANG RAAS DANDIYA 2025', 120, yPos + 10, {
               width: 310,
               align: 'center'
             });
          
          doc.fontSize(12)
             .fillColor('#ffd700')
             .font('Helvetica')
             .text('', 120, yPos + 35, {
               width: 310,
               align: 'center'
             });
             
          // Show different text for season pass vs single day
          const headerText = (safeTicketType === 'season') ? 'Official Season Pass (8 Days)' : 'Official Entry Pass';
          doc.fontSize(11)
             .fillColor('#ffffff')
             .text(headerText, 120, yPos + 55, {
               width: 310,
               align: 'center'
             });
             
        } catch (logoErr) {
          console.warn('Logo download failed, using text header:', logoErr.message);
          
          // Fallback header without logo - Better font sizes
          doc.fontSize(22)
             .fillColor('#ffffff')
             .font('Helvetica-Bold')
             .text(' MALANG RAS DANDIYA 2025 ', 40, yPos + 20, {
               align: 'center',
               width: 400
             });
          
          // Show different text for season pass vs single day
          const fallbackHeaderText = (safeTicketType === 'season') ? ' Official Season Pass (8 Days) ' : ' Official Entry Pass ';
          doc.fontSize(13)
             .fillColor('#ffd700')
             .text(fallbackHeaderText, 40, yPos + 50, {
               align: 'center',
               width: 400
             });
        }

        // Main content background - Better proportioned
        yPos = 135; // Adjusted for new layout
        doc.rect(30, yPos, 420, 260)
           .fillColor('#ffffff')
           .fill();

        // Guest Name Section - Better proportioned
        yPos += 15;
        doc.rect(40, yPos, 400, 45)
           .fillColor('#fff8f0')
           .fill();
        
        doc.fontSize(12)
           .fillColor(passTypeColors.primary)
           .font('Helvetica-Bold')
           .text(' GUEST NAME', 50, yPos + 8);
        
        doc.font('Helvetica-Bold')
           .fontSize(18)
           .fillColor('#1a1a2e')
           .text(safeName.toUpperCase(), 50, yPos + 25);

        // Event Details Section - Better spacing
        yPos += 60;
        doc.fontSize(12)
           .fillColor(passTypeColors.primary)
           .font('Helvetica-Bold')
           .text('EVENT DATE', 50, yPos);
        
        doc.font('Helvetica')
           .fontSize(15)
           .fillColor('#1a1a2e')
           .text(new Date(safeDate).toLocaleDateString('en-IN', {
             weekday: 'long',
             year: 'numeric',
             month: 'long',
             day: 'numeric'
           }), 50, yPos + 18);

        // Pass Type Section with Color Indicator - Better spacing
        yPos += 45;
        doc.fontSize(12)
           .fillColor(passTypeColors.primary)
           .font('Helvetica-Bold')
           .text('PASS TYPE', 50, yPos);
        
        // Pass type name with color - Enhanced for Season Pass
        const isSeasonPass = safeTicketType === 'season';
        let passTypeDisplay = safePassType.toUpperCase();
        
        if (isSeasonPass) {
          // For season pass, show both the pass type and "SEASON PASS"
          doc.font('Helvetica-Bold')
             .fontSize(13)
             .fillColor(passTypeColors.primary)
             .text(`${passTypeDisplay} - SEASON PASS`, 50, yPos + 18);
          
          // Add "8 DAYS" subtitle for season pass
          doc.font('Helvetica')
             .fontSize(11)
             .fillColor('#666666')
             .text('(8 Days Access)', 50, yPos + 35);
        } else {
          // For single day tickets
          doc.font('Helvetica-Bold')
             .fontSize(15)
             .fillColor(passTypeColors.primary)
             .text(passTypeDisplay, 50, yPos + 18);
        }
        
        // Color indicator badge - Better proportioned
        doc.rect(280, yPos + 10, 100, 25)
           .fillColor(passTypeColors.primary)
           .fill();
        
        // Color name on badge
        const textColor = passTypeColors.name === 'WHITE' ? '#000000' : '#FFFFFF';
        doc.fontSize(11)
           .fillColor(textColor)
           .font('Helvetica-Bold')
           .text(passTypeColors.name, 280, yPos + 16, {
             width: 100,
             align: 'center'
           });

        // Venue Section - Better spacing
        yPos += 45;
        doc.fontSize(12)
           .fillColor(passTypeColors.primary)
           .font('Helvetica-Bold')
           .text('VENUE', 50, yPos);
        
        doc.font('Helvetica')
           .fontSize(13)
           .fillColor('#1a1a2e')
           .text(safeVenue, 50, yPos + 18);

        // Booking Details - Better spacing
        yPos += 40;
        doc.fontSize(10)
           .fillColor('#666666')
           .font('Helvetica')
           .text(`Booking ID: #${booking_id || 'N/A'} | Ticket ID: ${ticket_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 50, yPos);

        // Enhanced QR Code Section with clickable features - Better proportioned
        yPos += 25;
        doc.rect(30, yPos, 420, 130)
           .fillColor('#f8f9fa')
           .fill();
        
        // QR Section Header with enhanced styling
        doc.fontSize(13)
           .fillColor(passTypeColors.primary)
           .font('Helvetica-Bold')
           .text('🔍 SCAN FOR ENTRY', 40, yPos + 12, { align: 'center', width: 400 });

        // Handle QR code with enhanced error handling and clickable features
        const qrYPos = yPos + 35; // Adjusted for new layout
        let qrCodeText = safeBookingId; // Default QR content
        
        try {
          let qrBuffer;
          
          if (qrCode) {
            if (qrCode.startsWith('http')) {
              // Download QR from URL with enhanced error handling
              console.log('📥 Downloading QR code from URL:', qrCode);
              try {
                const response = await axios.get(qrCode, {
                  responseType: 'arraybuffer',
                  timeout: 15000,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*'
                  }
                });
                qrBuffer = Buffer.from(response.data, 'binary');
                qrCodeText = qrCode; // Use URL as clickable link
              } catch (downloadErr) {
                console.warn('⚠️ Failed to download QR code, generating new one:', downloadErr.message);
                qrBuffer = await generateQRCodeBuffer(safeBookingId);
              }
              
            } else if (qrCode.startsWith('data:image')) {
              // Handle base64 data URLs
              const base64Data = qrCode.split('base64,').pop();
              qrBuffer = Buffer.from(base64Data, 'base64');
              
            } else {
              // Handle plain base64 or text
              try {
                const base64Data = qrCode.replace(/^data:image\/png;base64,/i, '');
                if (base64Data && base64Data.length > 0) {
                  qrBuffer = Buffer.from(base64Data, 'base64');
                } else {
                  throw new Error('Empty QR code data');
                }
              } catch (parseErr) {
                console.warn('⚠️ Invalid QR data format, generating new QR code');
                qrBuffer = await generateQRCodeBuffer(safeBookingId);
              }
            }
          } else {
            // Generate new QR code with booking information
            console.log('📱 Generating QR code for booking:', safeBookingId);
            qrBuffer = await generateQRCodeBuffer(safeBookingId);
          }
          
          // Enhanced QR code placement with professional styling - Better positioned
          const qrSize = 85; // Slightly larger QR code
          const qrX = 200; // Better centered for new layout
          
          // QR Code border with pass type color
          doc.rect(qrX - 2, qrYPos - 2, qrSize + 4, qrSize + 4)
            .lineWidth(3)
            .strokeColor(passTypeColors.primary)
            .stroke();
            
          // Inner QR border
          doc.rect(qrX, qrYPos, qrSize, qrSize)
            .lineWidth(1)
            .strokeColor('#333333')
            .stroke();
            
          // Place QR code image
          doc.image(qrBuffer, qrX + 2, qrYPos + 2, { fit: [qrSize - 4, qrSize - 4] });
          
          // Add clickable annotation to QR code area if it's a URL
          if (qrCodeText.startsWith('http')) {
            doc.link(qrX, qrYPos, qrSize, qrSize, qrCodeText);
          }
          
        } catch (qrError) {
          console.error('❌ QR code generation failed:', qrError.message);
          
          // Enhanced fallback QR display - Better positioned
          const qrSize = 85;
          const qrX = 200;
          
          doc.rect(qrX, qrYPos, qrSize, qrSize)
            .lineWidth(2)
            .strokeColor('#cccccc')
            .stroke()
            .fillColor('#f5f5f5')
            .fill();
          
          // Fallback icon
          doc.fontSize(13)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('📱', qrX + qrSize/2 - 10, qrYPos + 18, { 
               align: 'center', 
               width: 20 
             });
          
          doc.fontSize(10)
             .fillColor('#666666')
             .font('Helvetica')
             .text('QR Code\nUnavailable', qrX + 5, qrYPos + 35, { 
               align: 'center', 
               width: qrSize - 10 
             });
          
          doc.fontSize(8)
             .fillColor('#999999')
             .text(`ID: ${booking_id || 'N/A'}`, qrX + 5, qrYPos + 60, { 
               align: 'center', 
               width: qrSize - 10 
             });
        }
        
        // Add verification text below QR - Better positioned
        doc.fontSize(9)
           .fillColor('#666666')
           .font('Helvetica')
           .text('Scan at entry gate for instant verification', 55, qrYPos + 95, { 
             align: 'center', 
             width: 370 
           });

        // Enhanced Footer section with clickable links - Better positioned
        yPos += 145;
        doc.rect(30, yPos, 420, 85)
           .fillColor('#1a1a2e')
           .fill();

        doc.fontSize(12)
           .fillColor('#ffd700')
           .font('Helvetica-Bold')
           .text('📅 EVENT DETAILS', 40, yPos + 10, { align: 'center', width: 400 });

        doc.fontSize(10)
           .fillColor('#ffffff')
           .font('Helvetica')
           .text('Time: 7:00 PM onwards | 🎵 Live DJ & Traditional Music', 40, yPos + 28, { 
             align: 'center', 
             width: 400 
           });

        // Add clickable contact information - Better positioned
        const contactY = yPos + 45;
        doc.fontSize(9)
           .fillColor('#87CEEB')
           .text('📞 Contact: +91-9876543210 | 📧 info@malangevents.com', 40, contactY, { 
             align: 'center', 
             width: 400 
           });
           
        // Make contact info clickable
        doc.link(200, contactY, 80, 12, 'tel:+919876543210');
        doc.link(300, contactY, 120, 12, 'mailto:info@malangevents.com');

        doc.fontSize(8)
           .fillColor('#cccccc')
           .text('🎟️ Entry subject to terms & conditions | No outside food/drinks | Valid ID required', 40, yPos + 63, { 
             align: 'center', 
             width: 400 
           });

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    throw error;
  }
} // End of generateSingleTicketPage function

// Enhanced buffer-based version for booking objects with multiple tickets
export const generateDandiyaTicketPDF = async (bookingData) => {
  return new Promise(async (resolve, reject) => {
    // Check if it's a single ticket (old format) or booking object (new format)
    if (!bookingData) {
      return reject(new Error('No booking data provided'));
    }

    // If it's a single ticket format (has name, pass_type directly)
    if (bookingData.name && bookingData.pass_type && !bookingData.tickets) {
      try {
        const pdfBuffer = await generateDandiyaTicketPDFBuffer(bookingData);
        return resolve(pdfBuffer);
      } catch (error) {
        return reject(error);
      }
    }

    // If it's a booking object with multiple tickets
    if (bookingData.tickets && Array.isArray(bookingData.tickets)) {
      try {
        // Transform booking data to the format expected by generateMultipleTicketsPDFBuffer
        const ticketsData = bookingData.tickets.map(ticket => ({
          name: ticket.name,
          date: bookingData.date,
          pass_type: ticket.pass_type,
          ticket_type: bookingData.ticket_type || 'single',
          qrCode: ticket.qrCode,
          booking_id: bookingData.id,
          ticket_number: ticket.ticket_number,
          ticket_id: ticket.id,
          venue: bookingData.venue || 'Regal Lawns, Beed Bypass'
        }));
        
        const pdfBuffer = await generateMultipleTicketsPDFBuffer(ticketsData);
        return resolve(pdfBuffer);
      } catch (error) {
        return reject(error);
      }
    }

    return reject(new Error('Invalid booking data format'));
  });
};

// Generate multiple tickets in a single PDF
export const generateMultipleTicketsPDFBuffer = async (ticketsData) => {
  return new Promise(async (resolve, reject) => {
    if (!ticketsData || !Array.isArray(ticketsData) || ticketsData.length === 0) {
      return reject(new Error('Invalid tickets data provided'));
    }

    // If only one ticket, use the single ticket generator
    if (ticketsData.length === 1) {
      try {
        const singleTicketBuffer = await generateDandiyaTicketPDFBuffer(ticketsData[0]);
        return resolve(singleTicketBuffer);
      } catch (error) {
        return reject(error);
      }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 20 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (e) => reject(e));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      // Add a cover page
      const bookingId = ticketsData[0]?.booking_id || 'N/A';
      const eventDate = ticketsData[0]?.date || new Date().toISOString();
      const passType = ticketsData[0]?.pass_type || 'Standard';
      
      // Cover page background
      doc.rect(0, 0, doc.page.width, doc.page.height).fillColor('#1a1a2e').fill();
      
      // Cover page border
      doc.roundedRect(30, 30, doc.page.width - 60, doc.page.height - 60, 15)
         .lineWidth(4)
         .strokeColor('#ff6b35')
         .stroke();

      // Cover page header
      doc.fontSize(32)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('MALANG RAS DANDIYA 2025', 50, 120, {
           align: 'center',
           width: doc.page.width - 100
         });

      doc.fontSize(18)
         .fillColor('#ffd700')
         .text('Official Entry Passes', 50, 180, {
           align: 'center',
           width: doc.page.width - 100
         });

      // Booking details on cover
      doc.fontSize(16)
         .fillColor('#ffffff')
         .text(`Booking ID: #${bookingId}`, 50, 250, {
           align: 'center',
           width: doc.page.width - 100
         });

      doc.fontSize(14)
         .fillColor('#cccccc')
         .text(`${ticketsData.length} Tickets - ${passType.toUpperCase()} Pass`, 50, 280, {
           align: 'center',
           width: doc.page.width - 100
         });

      doc.fontSize(14)
         .text(`Event Date: ${new Date(eventDate).toLocaleDateString('en-IN', {
           weekday: 'long',
           year: 'numeric',
           month: 'long',
           day: 'numeric'
         })}`, 50, 310, {
           align: 'center',
           width: doc.page.width - 100
         });

      // Instructions
      doc.fontSize(12)
         .fillColor('#ffd700')
         .text('IMPORTANT INSTRUCTIONS:', 50, 400, {
           align: 'center',
           width: doc.page.width - 100
         });

      const instructions = [
        '• Each person needs their individual ticket for entry',
        '• Present the QR code at the entrance for verification',
        '• Keep all tickets safe and bring them to the event',
        '• Gates open at 7:00 PM',
        '• Venue: Event Ground, Malang'
      ];

      let yPos = 430;
      instructions.forEach(instruction => {
        doc.fontSize(11)
           .fillColor('#ffffff')
           .text(instruction, 80, yPos, {
             width: doc.page.width - 160
           });
        yPos += 25;
      });

      // Footer on cover page
      doc.fontSize(10)
         .fillColor('#666666')
         .text('© 2025 Malang Raas Dandiya. All rights reserved.', 50, doc.page.height - 80, {
           align: 'center',
           width: doc.page.width - 100
         });

      // Now generate individual ticket pages - one ticket per page
      for (let i = 0; i < ticketsData.length; i++) {
        // Add new page for each ticket
        doc.addPage({ size: 'A4', margin: 50 });
        
        // Get colors for this ticket and add to ticket data
        const ticketWithColors = {
          ...ticketsData[i],
          passTypeColors: getTicketColors(ticketsData[i].pass_type, ticketsData[i].ticket_type, ticketsData[i].original_pass_type)
        };
        
        // Generate full page ticket
        await generateSingleTicketPage(doc, ticketWithColors);
      }

      doc.end();

    } catch (error) {
      console.error('Multiple tickets PDF generation error:', error);
      reject(error);
    }
  });
};

// Helper function to generate a single ticket on a specific page
const generateSingleTicketOnPage = async (doc, ticketData, ticketNumber, totalTickets) => {
  const { name, date, pass_type, ticket_type, qrCode, booking_id, ticket_number, ticket_id, venue } = ticketData || {};

  // Safe defaults
  const safeName = (name ?? "Guest").toString();
  const safePassType = (pass_type ?? "Standard Pass").toString();
  const safeTicketType = ticket_type ?? "single";
  const safeDate = date ?? new Date().toISOString();
  const safeVenue = venue ?? "Event Ground, Malang";

  // Use centralized color mapping
  const passTypeColors = getTicketColors(safePassType, safeTicketType);

  // Background
  doc.rect(0, 0, 420, 650).fillColor('#1a1a2e').fill();
  
  // Decorative border with pass type color
  doc.roundedRect(15, 15, 390, 620, 15)
     .lineWidth(4)
     .strokeColor(passTypeColors.primary)
     .stroke();
  
  // Inner decorative border
  doc.roundedRect(25, 25, 370, 600, 12)
     .lineWidth(2)
     .strokeColor(passTypeColors.secondary)
     .stroke();

  // Header background with pass type gradient effect
  doc.rect(35, 35, 350, 100)
     .fillColor(passTypeColors.primary)
     .fill();
  
  // Header decorative overlay
  doc.rect(35, 35, 350, 100)
     .fillColor(passTypeColors.secondary)
     .fillOpacity(0.3)
     .fill()
     .fillOpacity(1);

  // Add ticket number indicator
  doc.fontSize(10)
     .fillColor('#ffffff')
     .font('Helvetica-Bold')
     .text(`TICKET ${ticketNumber} OF ${totalTickets}`, 45, 45, {
       width: 330,
       align: 'right'
     });

  // Download and add logo
  let yPos = 60;
  try {
    const axios = (await import('axios')).default;
    const logoResponse = await axios.get('https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/IMG_7981.PNG', {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const logoBuffer = Buffer.from(logoResponse.data, 'binary');
    
    // Logo positioning
    doc.image(logoBuffer, 50, yPos, { width: 80, height: 80 });
    
    // Event title with logo
    doc.fontSize(22)
       .fillColor('#ffffff')
       .font('Helvetica-Bold')
       .text('MALANG RAS DANDIYA 2025', 140, yPos + 10, {
         width: 230,
         align: 'center'
       });
    
    doc.fontSize(12)
       .fillColor('#ffffff')
       .text('Official Entry Pass', 140, yPos + 40, {
         width: 230,
         align: 'center'
       });
       
  } catch (logoErr) {
    console.warn('Logo download failed, using text header:', logoErr.message);
    
    // Fallback header without logo
    doc.fontSize(24)
       .fillColor('#ffffff')
       .font('Helvetica-Bold')
       .text(' MALANG RAS DANDIYA 2025 ', 45, yPos + 20, {
         align: 'center',
         width: 330
       });
    
    doc.fontSize(14)
       .fillColor('#ffd700')
       .text(' Official Entry Pass ', 45, yPos + 55, {
         align: 'center',
         width: 330
       });
  }

  // Main content background
  yPos = 160;
  doc.rect(35, yPos, 350, 280)
     .fillColor('#ffffff')
     .fill();

  // Guest Name Section
  yPos += 25;
  doc.rect(45, yPos, 330, 50)
     .fillColor('#fff8f0')
     .fill();
  
  doc.fontSize(12)
     .fillColor(passTypeColors.primary)
     .font('Helvetica-Bold')
     .text(' GUEST NAME', 55, yPos + 10);
  
  doc.font('Helvetica-Bold')
     .fontSize(18)
     .fillColor('#1a1a2e')
     .text(safeName.toUpperCase(), 55, yPos + 25);

  // Event Details Section
  yPos += 70;
  doc.fontSize(12)
     .fillColor(passTypeColors.primary)
     .font('Helvetica-Bold')
     .text('EVENT DATE', 55, yPos);
  
  doc.font('Helvetica')
     .fontSize(16)
     .fillColor('#1a1a2e')
     .text(new Date(safeDate).toLocaleDateString('en-IN', {
       weekday: 'long',
       year: 'numeric',
       month: 'long',
       day: 'numeric'
     }), 55, yPos + 18);

  // Pass Type Section with Color Indicator
  yPos += 50;
  doc.fontSize(12)
     .fillColor(passTypeColors.primary)
     .font('Helvetica-Bold')
     .text('PASS TYPE', 55, yPos);
  
  // Pass type name with color - Enhanced for Season Pass
  const isSeasonPass = safeTicketType === 'season';
  let passTypeDisplay = safePassType.toUpperCase();
  
  if (isSeasonPass) {
    // For season pass, show both the pass type and "SEASON PASS"
    doc.font('Helvetica-Bold')
       .fontSize(14)
       .fillColor(passTypeColors.primary)
       .text(`${passTypeDisplay} - SEASON PASS`, 55, yPos + 18);
    
    // Add "8 DAYS" subtitle for season pass
    doc.font('Helvetica')
       .fontSize(12)
       .fillColor('#666666')
       .text('(8 Days Access)', 55, yPos + 36);
  } else {
    // For single day tickets
    doc.font('Helvetica-Bold')
       .fontSize(16)
       .fillColor(passTypeColors.primary)
       .text(passTypeDisplay, 55, yPos + 18);
  }
  
  // Color indicator badge
  doc.rect(250, yPos + 10, 100, 25)
     .fillColor(passTypeColors.primary)
     .fill();
  
  // Color name on badge
  const textColor = passTypeColors.name === 'WHITE' ? '#000000' : '#FFFFFF';
  doc.fontSize(12)
     .fillColor(textColor)
     .font('Helvetica-Bold')
     .text(passTypeColors.name, 250, yPos + 17, {
       width: 100,
       align: 'center'
     });

  // Venue Section
  yPos += 50;
  doc.fontSize(12)
     .fillColor(passTypeColors.primary)
     .font('Helvetica-Bold')
     .text('VENUE', 55, yPos);
  
  doc.font('Helvetica')
     .fontSize(14)
     .fillColor('#1a1a2e')
     .text(safeVenue, 55, yPos + 18);

  // Booking Details
  yPos += 45;
  doc.fontSize(10)
     .fillColor('#666666')
     .font('Helvetica')
     .text(`Booking ID: #${booking_id || 'N/A'} | Ticket ID: ${ticket_id || 'N/A'} | Ticket: ${ticket_number || ticketNumber}`, 55, yPos);

  // QR Code Section
  yPos += 30;
  doc.rect(35, yPos, 350, 140)
     .fillColor('#f8f9fa')
     .fill();
  
  doc.fontSize(14)
     .fillColor(passTypeColors.primary)
     .font('Helvetica-Bold')
     .text(' SCAN FOR ENTRY', 45, yPos + 15, { align: 'center', width: 330 });

  // Handle QR code with enhanced error handling
  const qrYPos = yPos + 40;
  try {
    let qrBuffer;
    
    if (qrCode) {
      if (qrCode.startsWith('http')) {
        // Download QR from URL
        console.log('Downloading QR code from URL:', qrCode);
        try {
          const axios = (await import('axios')).default;
          const response = await axios.get(qrCode, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          qrBuffer = Buffer.from(response.data, 'binary');
        } catch (downloadErr) {
          console.warn('Failed to download QR code, generating new one:', downloadErr.message);
          const ticketNum = booking_id || ticket_number || 'TICKET-' + Date.now();
          qrBuffer = await generateQRCodeBuffer(ticketNum);
        }
        
      } else if (qrCode.startsWith('data:image')) {
        const base64Data = qrCode.split('base64,').pop();
        qrBuffer = Buffer.from(base64Data, 'base64');
        
      } else {
        const base64Data = qrCode.replace(/^data:image\/png;base64,/i, '');
        if (base64Data && base64Data.length > 0) {
          try {
            qrBuffer = Buffer.from(base64Data, 'base64');
          } catch (imgErr) {
            console.warn('Invalid base64 QR data, generating new one');
            const ticketNum = booking_id || ticket_number || 'TICKET-' + Date.now();
            qrBuffer = await generateQRCodeBuffer(ticketNum);
          }
        } else {
          throw new Error('Empty QR code data');
        }
      }
    } else {
      // Generate new QR code
      console.log('📱 No QR code provided, generating new one');
      const ticketNum = booking_id || ticket_number || 'TICKET-' + Date.now();
      qrBuffer = await generateQRCodeBuffer(ticketNum);
    }
    
    // Add QR code with decorative border
    doc.rect(160, qrYPos, 100, 100)
      .lineWidth(3)
      .strokeColor('black')
      .stroke();
    doc.image(qrBuffer, 165, qrYPos + 5, { fit: [90, 90] });
    
  } catch (qrError) {
    console.warn('QR code generation failed, using text fallback:', qrError.message);
    
    // Fallback QR display
    doc.rect(160, qrYPos, 100, 100)
      .lineWidth(2)
      .strokeColor('#cccccc')
      .stroke();
    
    doc.fontSize(10)
       .fillColor('#666666')
       .text('QR Code\nUnavailable', 165, qrYPos + 35, { 
         align: 'center', 
         width: 90 
       });
    
    doc.fontSize(8)
       .fillColor('#999999')
       .text(`ID: ${booking_id || 'N/A'}`, 165, qrYPos + 65, { 
         align: 'center', 
         width: 90 
       });
  }

  // Footer section
  yPos += 160;
  doc.rect(35, yPos, 350, 80)
     .fillColor('#1a1a2e')
     .fill();

  doc.fontSize(12)
     .fillColor('#ffd700')
     .font('Helvetica-Bold')
     .text(' EVENT DETAILS', 45, yPos + 10, { align: 'center', width: 330 });

  doc.fontSize(10)
     .fillColor('#ffffff')
     .font('Helvetica')
     .text('Time: 7:00 PM onwards | 🎵 Live DJ & Traditional Music', 45, yPos + 30, { 
       align: 'center', 
       width: 330 
     });
};

// Backward compatibility - keeping the original function names
export const generateTicketPDFBuffer = generateDandiyaTicketPDFBuffer;
export const generateTicketPDF = generateDandiyaTicketPDF;

// Export the color mapping function for testing
export { getTicketColors };

export default generateDandiyaTicketPDF;