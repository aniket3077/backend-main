import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";

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
      return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' }; // PINK as requested
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

// 🌈 Rainbow Design Generator - Appears 9 Times for Season Passes
const addRainbowElements = (doc, colors, centerX = 210, centerY = 325) => {
  const rainbowColors = colors.rainbowColors;

  // Rainbow Element 1: Header Gradient Bar
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(40 + (i * 45), 30, 45, 8)
      .fillColor(rainbowColors[i])
      .fill();
  }

  // Rainbow Element 2: Side Border Stripes (Left)
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(15, 80 + (i * 60), 8, 50)
      .fillColor(rainbowColors[i])
      .fill();
  }

  // Rainbow Element 3: Side Border Stripes (Right)
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(397, 80 + (i * 60), 8, 50)
      .fillColor(rainbowColors[i])
      .fill();
  }

  // Rainbow Element 4: QR Code Frame
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(centerX - 60 + (i * 17), centerY - 60, 15, 3)
      .fillColor(rainbowColors[i])
      .fill();
  }

  // Rainbow Element 5: Decorative Circles
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.circle(50 + (i * 45), 550, 8)
      .fillColor(rainbowColors[i])
      .fill();
  }

  // Rainbow Element 6: Footer Wave Pattern
  for (let i = 0; i < rainbowColors.length; i++) {
    doc.rect(30 + (i * 50), 600, 40, 6)
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
 * Generate QR code buffer for ticket booking
 */
export const generateQRCodeBuffer = async (text) => {
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
};

/**
 * Generate QR code as data URL for ticket booking
 */
export const generateQRCode = async (text) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });
    return qrDataUrl;
  } catch (error) {
    console.error('❌ Error generating QR code URL:', error);
    // Fallback to QR server API
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
    console.log('🔄 Using fallback QR URL:', fallbackUrl);
    return fallbackUrl;
  }
};

/**
 * Enhanced Dandiya ticket PDF generator with official color coding
 */
export const generateDandiyaTicketPDFBuffer = async (ticketData) => {
  return new Promise(async (resolve, reject) => {
    const { name, date, pass_type, qrCode, booking_id, ticket_number, venue, ticket_type } = ticketData || {};

    // Safe defaults
    const safeName = (name ?? "Guest").toString();
    const safePassType = (pass_type ?? "Standard Pass").toString();
    const safeDate = date ?? new Date().toISOString();
    const safeVenue = venue ?? "Regal Lawns, Near Deolai Chowk, Beed Bypass, Chhatrapati Sambhajinagar";

    // Use centralized color mapping
    const passTypeColors = getTicketColors(safePassType, ticket_type);

    const doc = new PDFDocument({ size: [420, 650], margin: 15 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (e) => reject(e));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      await generateSingleTicketPage(doc, {
        name: safeName,
        date: safeDate,
        pass_type: safePassType,
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
    const doc = new PDFDocument({ size: [420, 650], margin: 15 });
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
        const passTypeColors = getTicketColors(ticketData.pass_type, ticketData.ticket_type);

        await generateSingleTicketPage(doc, {
          name: ticketData.name || "Guest",
          date: ticketData.date || new Date().toISOString(),
          pass_type: ticketData.pass_type || "Standard Pass",
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
  const { name, date, pass_type, qrCode, booking_id, ticket_number, venue, passTypeColors } = ticketData;

  try {
    const safeName = name || "Guest";
    const safeDate = date || new Date().toISOString();
    const safePassType = pass_type || "Standard Pass";
    const safeVenue = venue || "Regal Lawns, Near Deolai Chowk, Beed Bypass, Chhatrapati Sambhajinagar";

    // Background - Rich gradient effect
    doc.rect(0, 0, 420, 650).fillColor('#1a1a2e').fill();

    // 🌈 Add rainbow design for season passes (9 rainbow elements)
    if (passTypeColors.isRainbow) {
      addRainbowElements(doc, passTypeColors);
    }

    // Decorative border with pass type color
    doc.roundedRect(10, 10, 400, 630, 12)
      .lineWidth(3)
      .strokeColor(passTypeColors.primary)
      .stroke();

    // Inner decorative border
    doc.roundedRect(18, 18, 384, 614, 10)
      .lineWidth(1)
      .strokeColor(passTypeColors.secondary)
      .stroke();

    // Header background with pass type gradient effect - Made smaller
    doc.rect(25, 25, 370, 85)
      .fillColor(passTypeColors.primary)
      .fill();

    // Header decorative overlay
    doc.rect(25, 25, 370, 85)
      .fillColor(passTypeColors.secondary)
      .fillOpacity(0.3)
      .fill()
      .fillOpacity(1);

    // Download and add logo
    let yPos = 35;
    try {
      const logoResponse = await axios.get('https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/IMG_7981.PNG', {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const logoBuffer = Buffer.from(logoResponse.data, 'binary');

      // Logo positioning - Made smaller
      // doc.image(logoBuffer, 35, yPos, { width: 65, height: 65 });
      doc.image(logoBuffer, 25, 25, {
        width: 370,
        height: 85
      });

      // Event title with logo - Reduced font sizes
      // doc.fontSize(18)
      //   .fillColor('#ffffff')
      //   .font('Helvetica-Bold')
      //   .text('MALANG RAS DANDIYA 2025', 110, yPos + 8, {
      //     width: 270,
      //     align: 'center'
      //   });

      // doc.fontSize(12)
      //   .fillColor('#ffd700')
      //   .font('Helvetica')
      //   .text('', 110, yPos + 32, {
      //     width: 270,
      //     align: 'center'
      //   });

      doc.fontSize(10)
        .fillColor('#ffffff')
        .text('Official Entry Pass', 110, yPos + 50, {
          width: 270,
          align: 'center'
        });

    } catch (logoErr) {
      console.warn('Logo download failed, using text header:', logoErr.message);

      // Fallback header without logo - Reduced font sizes
      doc.fontSize(20)
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .text(' MALANG RAS DANDIYA 2025 ', 35, yPos + 15, {
          align: 'center',
          width: 350
        });

      doc.fontSize(12)
        .fillColor('#ffd700')
        .text(' Official Entry Pass ', 35, yPos + 45, {
          align: 'center',
          width: 350
        });
    }

    // Main content background - Made more compact
    yPos = 125;
    doc.rect(25, yPos, 370, 240)
      .fillColor('#ffffff')
      .fill();

    // Guest Name Section - Reduced height
    yPos += 15;
    doc.rect(35, yPos, 350, 40)
      .fillColor('#fff8f0')
      .fill();

    doc.fontSize(11)
      .fillColor(passTypeColors.primary)
      .font('Helvetica-Bold')
      .text(' GUEST NAME', 45, yPos + 5);

    doc.font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#1a1a2e')
      .text(safeName.toUpperCase(), 45, yPos + 20);

    // Event Details Section - Reduced spacing
    yPos += 55;
    doc.fontSize(11)
      .fillColor(passTypeColors.primary)
      .font('Helvetica-Bold')
      .text('EVENT DATE', 45, yPos);

    doc.font('Helvetica')
      .fontSize(14)
      .fillColor('#1a1a2e')
      .text(new Date(safeDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 45, yPos + 15);

    // Pass Type Section with Color Indicator - Reduced spacing
    yPos += 40;
    doc.fontSize(11)
      .fillColor(passTypeColors.primary)
      .font('Helvetica-Bold')
      .text('PASS TYPE', 45, yPos);

    // Pass type name with color
    doc.font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(passTypeColors.primary)
      .text(safePassType.toUpperCase(), 45, yPos + 15);

    // Color indicator badge - Made smaller
    doc.rect(250, yPos + 8, 90, 20)
      .fillColor(passTypeColors.primary)
      .fill();

    // Color name on badge
    const textColor = passTypeColors.name === 'WHITE' ? '#000000' : '#FFFFFF';
    doc.fontSize(10)
      .fillColor(textColor)
      .font('Helvetica-Bold')
      .text(passTypeColors.name, 250, yPos + 13, {
        width: 90,
        align: 'center'
      });

    // Venue Section - Reduced spacing
    yPos += 40;
    doc.fontSize(11)
      .fillColor(passTypeColors.primary)
      .font('Helvetica-Bold')
      .text('VENUE', 45, yPos);

    doc.font('Helvetica')
      .fontSize(12)
      .fillColor('#1a1a2e')
      .text(safeVenue, 45, yPos + 15);

    // Booking Details - Reduced spacing
    yPos += 35;
    doc.fontSize(9)
      .fillColor('#666666')
      .font('Helvetica')
      .text(`Booking ID: #${booking_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 45, yPos);

    // QR Code Section - Made more compact
    yPos += 20;
    doc.rect(25, yPos, 370, 120)
      .fillColor('#f8f9fa')
      .fill();

    doc.fontSize(12)
      .fillColor(passTypeColors.primary)
      .font('Helvetica-Bold')
      .text(' SCAN FOR ENTRY', 35, yPos + 10, { align: 'center', width: 350 });

    // Handle QR code with enhanced error handling - Made more compact
    const qrYPos = yPos + 30;
    try {
      let qrBuffer;

      if (qrCode) {
        if (qrCode.startsWith('http')) {
          // Download QR from URL
          console.log('Downloading QR code from URL:', qrCode);
          try {
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

      // Add QR code with decorative border - Made smaller
      // doc.rect(170, qrYPos, 80, 80)
      //   .lineWidth(2)
      //   .strokeColor('black')
      //   .stroke();
      // doc.image(qrBuffer, 173, qrYPos + 3, { fit: [74, 74] });

      doc.rect(150, qrYPos, 120, 120)
        .lineWidth(2)
        .strokeColor('black')
        .stroke();

      doc.image(qrBuffer, 153, qrYPos + 3, { fit: [114, 114] });


    } catch (qrError) {
      console.warn('QR code generation failed, using text fallback:', qrError.message);

      // Fallback QR display - Made smaller
      doc.rect(170, qrYPos, 80, 80)
        .lineWidth(2)
        .strokeColor('#cccccc')
        .stroke();

      doc.fontSize(9)
        .fillColor('#666666')
        .text('QR Code\nUnavailable', 173, qrYPos + 25, {
          align: 'center',
          width: 74
        });

      doc.fontSize(8)
        .fillColor('#999999')
        .text(`ID: ${booking_id || 'N/A'}`, 173, qrYPos + 50, {
          align: 'center',
          width: 74
        });
    }

    // Footer section - Made more compact
    // yPos += 135;
    // doc.rect(25, yPos, 370, 60)
    //   .fillColor('#1a1a2e')
    //   .fill();

    // doc.fontSize(11)
    //   .fillColor('#ffd700')
    //   .font('Helvetica-Bold')
    //   .text(' EVENT DETAILS', 35, yPos + 8, { align: 'center', width: 350 });

    // doc.fontSize(9)
    //   .fillColor('#ffffff')
    //   .font('Helvetica')
    //   .text('Time: 7:00 PM onwards |  Live DJ & Traditional Music', 35, yPos + 25, {
    //     align: 'center',
    //     width: 350
    //   });

    // doc.fontSize(8)
    //   .fillColor('#cccccc')
    //   .text('Entry is subject to terms & conditions | No outside food/drinks allowed', 35, yPos + 42, {
    //     align: 'center',
    //     width: 350
    //   });

    // Footer section
    yPos += 155; // push lower since QR is taller
    doc.rect(25, yPos, 370, 120) // taller to fit links
      .fillColor('#1a1a2e')
      .fill();

    doc.fontSize(11)
      .fillColor('#ffd700')
      .font('Helvetica-Bold')
      .text(' EVENT DETAILS', 35, yPos + 8, { align: 'center', width: 350 });

    doc.fontSize(9)
      .fillColor('#ffffff')
      .font('Helvetica')
      .text('Time: 7:00 PM onwards | Live DJ & Traditional Music', 35, yPos + 25, {
        align: 'center',
        width: 350
      });

    doc.fontSize(8)
      .fillColor('#cccccc')
      .text('Entry is subject to terms & conditions | No outside food/drinks allowed', 35, yPos + 40, {
        align: 'center',
        width: 350
      });

    try {
      // Download icons (⚠️ make sure to use white versions of these icons)
      const websiteIconResp = await axios.get('https://static.thenounproject.com/png/4150466-200.png', { responseType: 'arraybuffer' });
      const websiteIcon = Buffer.from(websiteIconResp.data, 'binary');

      const phoneIconResp = await axios.get('https://static.thenounproject.com/png/4799174-200.png', { responseType: 'arraybuffer' });
      const phoneIcon = Buffer.from(phoneIconResp.data, 'binary');

      const instaIconResp = await axios.get('https://cdn-icons-png.flaticon.com/512/2111/2111463.png', { responseType: 'arraybuffer' });
      const instaIcon = Buffer.from(instaIconResp.data, 'binary');

      const iconSize = 10;
      let lineY = yPos + 62;

      doc.fontSize(9).fillColor('#ffffff');

      // --- Website (clickable) ---
      doc.image(websiteIcon, 85, lineY, { width: iconSize, height: iconSize });
      const websiteText = 'www.malangdandiya.com';
      const websiteWidth = doc.widthOfString(websiteText);
      doc.text(websiteText, 100, lineY - 1);
      doc.link(100, lineY - 1, websiteWidth, 12, 'https://www.malangdandiya.com');

      // --- Phone (inline, next to website) ---
      const phoneX = 100 + websiteWidth + 40; // spacing after website
      doc.image(phoneIcon, phoneX, lineY, { width: iconSize, height: iconSize });
      doc.text('+91-9172788397', phoneX + 15, lineY - 1);

      // --- Instagram (on new line, clickable) ---
      lineY += 18;
      doc.image(instaIcon, 85, lineY - 2, { width: 12, height: 12 });
      const instaText = 'instagram.com/malang.events';
      const instaWidth = doc.widthOfString(instaText);
      doc.text(instaText, 103, lineY - 1);
      doc.link(103, lineY - 1, instaWidth, 12, 'https://www.instagram.com/malang.events');

    } catch (iconErr) {
      console.warn('Icon load failed:', iconErr.message);
      doc.fontSize(9)
        .fillColor('#ffffff')
        .text('www.malangdandiya.com | +91-9172788397', 35, yPos + 60, {
          align: 'center',
          width: 350
        })
        .text('Instagram: malang.events', 35, yPos + 75, {
          align: 'center',
          width: 350
        });
    }


    // Credit line (clickable)
    const creditText = 'Services provided by FARMSEASY TECH SOLUTION PVT LTD';
    const creditY = yPos + 105;
    const creditWidth = doc.widthOfString(creditText);

    doc.fontSize(8)
      .fillColor('#999999')
      .text(creditText, (420 - creditWidth) / 2, creditY); // centered
    doc.link((420 - creditWidth) / 2, creditY, creditWidth, 12, 'https://www.farmseasy.com');





  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
}

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
          ticket_number: ticket.id,
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
          passTypeColors: getTicketColors(ticketsData[i].pass_type, ticketsData[i].ticket_type)
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
  const { name, date, pass_type, qrCode, booking_id, ticket_number, venue } = ticketData || {};

  // Safe defaults
  const safeName = (name ?? "Guest").toString();
  const safePassType = (pass_type ?? "Standard Pass").toString();
  const safeDate = date ?? new Date().toISOString();
  const safeVenue = venue ?? "Event Ground, Malang";

  // Use centralized color mapping
  const passTypeColors = getTicketColors(safePassType, ticketData.ticket_type);

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

  // Pass type name with color
  doc.font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(passTypeColors.primary)
    .text(safePassType.toUpperCase(), 55, yPos + 18);

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
    .text(`Booking ID: #${booking_id || 'N/A'} | Ticket: ${ticket_number || ticketNumber}`, 55, yPos);

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