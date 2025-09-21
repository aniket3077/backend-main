import { query } from './config/database.js';

async function fixQRDates() {
  try {
    console.log('🔍 Starting QR date fix process...');
    
    // Get all QR codes that need fixing
    const qrResult = await query(`
      SELECT 
        qr.id,
        qr.ticket_number,
        qr.qr_data,
        qr.booking_id,
        b.pass_details
      FROM qr_codes qr
      JOIN bookings b ON qr.booking_id = b.id
      WHERE b.pass_details IS NOT NULL
      ORDER BY qr.id ASC
    `);
    
    console.log(`📋 Found ${qrResult.rows.length} QR codes to check`);
    
    let updatedCount = 0;
    
    for (const row of qrResult.rows) {
      try {
        // Parse current QR data
        const currentQRData = typeof row.qr_data === 'string' 
          ? JSON.parse(row.qr_data) 
          : row.qr_data;
        
        // Parse pass details to get original_date_string
        const passDetails = typeof row.pass_details === 'string' 
          ? JSON.parse(row.pass_details) 
          : row.pass_details;
        
        let originalDate = null;
        if (passDetails.details && passDetails.details.original_date_string) {
          originalDate = passDetails.details.original_date_string;
        } else if (passDetails.original_date_string) {
          originalDate = passDetails.original_date_string;
        }
        
        if (originalDate && currentQRData.eventDate !== originalDate) {
          console.log(`🔧 Fixing QR ${row.ticket_number}: ${currentQRData.eventDate} → ${originalDate}`);
          
          // Update QR data with correct date
          const updatedQRData = {
            ...currentQRData,
            eventDate: originalDate
          };
          
          // Update the database
          await query(
            'UPDATE qr_codes SET qr_data = $1 WHERE id = $2',
            [JSON.stringify(updatedQRData), row.id]
          );
          
          updatedCount++;
        } else if (originalDate && currentQRData.eventDate === originalDate) {
          console.log(`✅ QR ${row.ticket_number} already has correct date: ${originalDate}`);
        } else {
          console.log(`⚠️ QR ${row.ticket_number} missing original_date_string in pass_details`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing QR ${row.ticket_number}:`, error.message);
      }
    }
    
    console.log(`\n🎉 QR date fix completed!`);
    console.log(`📊 Updated ${updatedCount} QR codes`);
    
  } catch (error) {
    console.error('❌ Error in QR date fix process:', error);
  }
  
  process.exit(0);
}

fixQRDates();