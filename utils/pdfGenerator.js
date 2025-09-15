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

      // Color coding based on pass type
      const getPassTypeColor = (passType) => {
        const type = passType.toLowerCase();
        switch (type) {
          case 'female': return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' }; // Pink
          case 'couple': return { primary: '#8A2BE2', secondary: '#DDA0DD', name: 'PURPLE' }; // Purple
          case 'male': return { primary: '#FFFFFF', secondary: '#F5F5F5', name: 'WHITE' }; // White
          case 'family': return { primary: '#32CD32', secondary: '#90EE90', name: 'GREEN' }; // Green
          case 'group': return { primary: '#1E90FF', secondary: '#87CEEB', name: 'BLUE' }; // Blue
          case 'kids': return { primary: '#FFD700', secondary: '#FFFFE0', name: 'YELLOW' }; // Yellow
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

        // Download and add logo
        let yPos = 45;
        try {
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
          
          doc.fontSize(14)
             .fillColor('#ffd700')
             .font('Helvetica')
             .text('', 140, yPos + 40, {
               width: 230,
               align: 'center'
             });
             
          doc.fontSize(12)
             .fillColor('#ffffff')
             .text('Official Entry Pass', 140, yPos + 60, {
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
           .text(`Booking ID: #${booking_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 55, yPos);

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

        

        

        doc.end();
        
      } catch (error) {
        console.error('PDF generation error:', error);
        reject(error);
      }
   });
};

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

      // Now generate individual ticket pages
      for (let i = 0; i < ticketsData.length; i++) {
        const ticketData = ticketsData[i];
        
        // Add new page for each ticket (except we're already on page 1 after cover)
        doc.addPage({ size: [420, 650], margin: 20 });
        
        // Generate individual ticket content on this page
        await generateSingleTicketOnPage(doc, ticketData, i + 1, ticketsData.length);
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

  // Color coding based on pass type
  const getPassTypeColor = (passType) => {
    const type = passType.toLowerCase();
    switch (type) {
      case 'female': return { primary: '#FF69B4', secondary: '#FFB6C1', name: 'PINK' };
      case 'couple': return { primary: '#8A2BE2', secondary: '#DDA0DD', name: 'PURPLE' };
      case 'male': return { primary: '#FFFFFF', secondary: '#F5F5F5', name: 'WHITE' };
      case 'family': return { primary: '#32CD32', secondary: '#90EE90', name: 'GREEN' };
      case 'group': return { primary: '#1E90FF', secondary: '#87CEEB', name: 'BLUE' };
      case 'kids': return { primary: '#FFD700', secondary: '#FFFFE0', name: 'YELLOW' };
      default: return { primary: '#ff6b35', secondary: '#ffa500', name: 'ORANGE' };
    }
  };

  const passTypeColors = getPassTypeColor(safePassType);

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
          const { generateQRCodeBuffer } = await import('./qrGenerator.js');
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
            const { generateQRCodeBuffer } = await import('./qrGenerator.js');
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
      const { generateQRCodeBuffer } = await import('./qrGenerator.js');
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

export default generateDandiyaTicketPDF;