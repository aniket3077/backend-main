import { query } from './config/database.js';

async function checkQRDates() {
  try {
    console.log('Checking recent confirmed bookings and their QR codes...');
    
    const result = await query(`
      SELECT 
        b.id as booking_id,
        b.booking_date,
        b.status,
        b.pass_details,
        qr.ticket_number,
        qr.qr_data
      FROM bookings b
      LEFT JOIN qr_codes qr ON b.id = qr.booking_id
      WHERE b.status = 'confirmed'
      ORDER BY b.id DESC
      LIMIT 5
    `);
    
    console.log('Found', result.rows.length, 'QR codes from confirmed bookings');
    
    result.rows.forEach((row, index) => {
      console.log(`Record ${index + 1}:`);
      console.log('  Booking ID:', row.booking_id);
      console.log('  Booking Date:', row.booking_date);
      console.log('  QR Data:', row.qr_data);
      
      // Check pass_details for original_date_string
      if (row.pass_details) {
        try {
          const passDetails = typeof row.pass_details === 'string' ? JSON.parse(row.pass_details) : row.pass_details;
          if (passDetails.details && passDetails.details.original_date_string) {
            console.log('  Original Date String:', passDetails.details.original_date_string);
          }
        } catch (e) {
          console.log('  Could not parse pass_details');
        }
      }
      console.log('---');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkQRDates();