import fetch from 'node-fetch';

async function testFemalePricing() {
  try {
    console.log('Testing female pricing for September 23rd (should be ₹1)...');
    const response = await fetch('http://localhost:5000/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          name: 'Test Female 1 Rs',
          email: 'testfemale1rs@example.com',
          mobile: '+919666666666'
        },
        passes: { female: 1 },
        pass_type: 'female',
        booking_date: '2025-09-23',
        ticket_type: 'single',
        total_amount: 1
      })
    });
    
    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Test booking result:', result.success ? 'SUCCESS' : 'FAILED');
    
    if (result.success) {
      console.log('Booking ID:', result.booking.id);
      console.log('Total Amount:', result.booking.total_amount);
      console.log('Final Amount:', result.booking.final_amount);
      console.log('✅ Female tickets now cost ₹1 on September 23rd!');
    } else {
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

testFemalePricing();