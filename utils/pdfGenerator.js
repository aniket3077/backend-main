import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import axios from "axios";
import { generateQRCodeBuffer } from "./qrGenerator.js";

// Enhanced Dandiya ticket PDF generator with logo and improved design
export const generateDandiyaTicketPDFBuffer = async (ticketData) => {
   return new Promise(async (resolve, reject) => {
      const { name, date, pass_type, qrCode, booking_id, ticket_number, venue } = ticketData || {};

      // Safe defaults
      const safeName = (name ?? "Guest").toString();
      const safePassType = (pass_type ?? "Standard Pass").toString();
      const safeDate = date ?? new Date().toISOString();
      const safeVenue = venue ?? "Event Ground, Malang";

      // Color coding based on pass type - Updated scheme
      const getPassTypeColor = (passType) => {
        const type = passType.toLowerCase();
        switch (type) {
          case 'female': return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' }; // Pink for female
          case 'male': return { primary: '#FFFFFF', secondary: '#F5F5F5', name: 'WHITE' }; // White for male
          case 'couple': return { primary: '#8A2BE2', secondary: '#DDA0DD', name: 'PURPLE' }; // Purple for couple
          case 'family': return { primary: '#32CD32', secondary: '#90EE90', name: 'GREEN' }; // Green for family
          case 'group': return { primary: '#1E90FF', secondary: '#87CEEB', name: 'BLUE' }; // Blue for group
          case 'kids': return { primary: '#FFD700', secondary: '#FFFFE0', name: 'YELLOW' }; // Yellow for kids
          default: return { primary: '#ff6b35', secondary: '#ffa500', name: 'ORANGE' }; // Default orange
        }
      };

      const passTypeColors = getPassTypeColor(safePassType);

      const doc = new PDFDocument({ size: [420, 650], margin: 20 });
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
    const doc = new PDFDocument({ size: [420, 650], margin: 20 });
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

        // Color coding based on pass type
        const getPassTypeColor = (passType) => {
          const type = passType.toLowerCase();
          switch (type) {
            case 'female': return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' };
            case 'male': return { primary: '#FFFFFF', secondary: '#F5F5F5', name: 'WHITE' };
            case 'couple': return { primary: '#8A2BE2', secondary: '#DDA0DD', name: 'PURPLE' };
            case 'family': return { primary: '#32CD32', secondary: '#90EE90', name: 'GREEN' };
            case 'group': return { primary: '#1E90FF', secondary: '#87CEEB', name: 'BLUE' };
            case 'kids': return { primary: '#FFD700', secondary: '#FFFFE0', name: 'YELLOW' };
            default: return { primary: '#ff6b35', secondary: '#ffa500', name: 'ORANGE' };
          }
        };

        const passTypeColors = getPassTypeColor(ticketData.pass_type || 'female');

        await generateSingleTicketPage(doc, {
          name: ticketData.name || "Guest",
          date: ticketData.date || new Date().toISOString(),
          pass_type: ticketData.pass_type || "Standard Pass",
          qrCode: ticketData.qrCode,
          booking_id: ticketData.booking_id,
          ticket_number: ticketData.ticket_number,
          venue: ticketData.venue || "Event Ground, Malang",
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
    const safeVenue = venue || "Event Ground, Malang";

    // Background - Rich gradient effect
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

    // Event title
    let yPos = 45;
    doc.fontSize(24)
       .fillColor('#ffffff')
       .font('Helvetica-Bold')
       .text('MALANG RAS DANDIYA 2025', 45, yPos + 20, {
         align: 'center',
         width: 330
       });
    
    doc.fontSize(14)
       .fillColor('#ffd700')
       .text('Official Entry Pass', 45, yPos + 55, {
         align: 'center',
         width: 330
       });

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
       .text('GUEST NAME', 55, yPos + 10);
    
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
       .text(`Booking ID: #${booking_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 55, yPos);

    // QR Code Section
    yPos += 30;
    doc.rect(35, yPos, 350, 140)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.fontSize(14)
       .fillColor(passTypeColors.primary)
       .font('Helvetica-Bold')
       .text('SCAN FOR ENTRY', 45, yPos + 15, { align: 'center', width: 330 });

    // Handle QR code
    const qrYPos = yPos + 40;
    try {
      let qrBuffer;
      
      if (qrCode) {
        // Generate QR code buffer from data
        const ticketData = JSON.stringify({
          booking_id,
          ticket_number,
          pass_type,
          name: safeName,
          date: safeDate
        });
        qrBuffer = await generateQRCodeBuffer(ticketData);
      } else {
        // Generate new QR code
        const ticketNum = booking_id || ticket_number || 'TICKET-' + Date.now();
        qrBuffer = await generateQRCodeBuffer(ticketNum);
      }
      
      // Add QR code with decorative border
      doc.rect(160, qrYPos, 100, 100)
        .lineWidth(3)
        .strokeColor('#000000')
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
    }

    // Footer section
    yPos += 160;
    doc.rect(35, yPos, 350, 80)
       .fillColor('#1a1a2e')
       .fill();

    doc.fontSize(12)
       .fillColor('#ffd700')
       .font('Helvetica-Bold')
       .text('EVENT DETAILS', 45, yPos + 10, { align: 'center', width: 330 });

    doc.fontSize(10)
       .fillColor('#ffffff')
       .font('Helvetica')
       .text('Time: 7:00 PM onwards | 🎵 Live DJ & Traditional Music', 45, yPos + 30, { 
         align: 'center', 
         width: 330 
       });

  } catch (error) {
    console.error('Single ticket page generation error:', error);
    throw error;
  }
}

// Enhanced file-based version
export const generateDandiyaTicketPDF = async (ticketData) => {
  return new Promise(async (resolve, reject) => {
      const { name, date, pass_type, qrCode, booking_id, ticket_number, venue } = ticketData || {};

      // Ensure output directory exists
      const ticketsDir = path.join(process.cwd(), "tickets");
      try {
         if (!fs.existsSync(ticketsDir)) {
            fs.mkdirSync(ticketsDir, { recursive: true });
         }
      } catch (dirErr) {
         return reject(dirErr);
      }

      try {
        const pdfBuffer = await generateDandiyaTicketPDFBuffer(ticketData);
        const fileName = `dandiya-ticket-${booking_id || Date.now()}.pdf`;
        const filePath = path.join(ticketsDir, fileName);
        
        fs.writeFileSync(filePath, pdfBuffer);
        resolve(filePath);
        
      } catch (error) {
        reject(error);
      }
  });
};

// Backward compatibility - keeping the original function names
export const generateTicketPDFBuffer = generateDandiyaTicketPDFBuffer;
export const generateTicketPDF = generateDandiyaTicketPDF;

export default generateDandiyaTicketPDF;