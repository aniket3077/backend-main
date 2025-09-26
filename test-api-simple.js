import axios from 'axios';

const testAPI = async () => {
  try {
    console.log('Testing new pricing structure...');
    
    // Test 1: Sep 27 (should use dhamaka 27-28 rates)
    console.log('\n🔥 Testing Sep 27 Dhamaka Rates (27-28):');
    const response1 = await axios.post('http://localhost:5001/api/bookings/create', {
      booking_date: '2025-09-27',
      passes: { female: 1, male: 1, couple: 1 },
      ticket_type: 'single'
    });
    console.log('Expected: Female ₹249, Male ₹299, Couple ₹399');
    console.log('Response:', JSON.stringify(response1.data, null, 2));
    
  } catch (error) {
    console.log('❌ API Error:', error.response?.data || error.message);
  }
  
  try {
    // Test 2: Sep 29 (should use dhamaka 29-30 rates)
    console.log('\n🔥 Testing Sep 29 Dhamaka Rates (29-30):');
    const response2 = await axios.post('http://localhost:5001/api/bookings/create', {
      booking_date: '2025-09-29',
      passes: { female: 1, male: 1, couple: 1 },
      ticket_type: 'single'
    });
    console.log('Expected: Female ₹299, Male ₹399, Couple ₹499');
    console.log('Response:', JSON.stringify(response2.data, null, 2));
    
  } catch (error) {
    console.log('❌ API Error:', error.response?.data || error.message);
  }
  
  try {
    // Test 3: Sep 25 (should be disabled)
    console.log('\n❌ Testing Disabled Date (Sep 25):');
    const response3 = await axios.post('http://localhost:5001/api/bookings/create', {
      booking_date: '2025-09-25',
      passes: { female: 1 },
      ticket_type: 'single'
    });
    console.log('Response:', JSON.stringify(response3.data, null, 2));
    
  } catch (error) {
    console.log('Expected error for disabled date:', error.response?.data || error.message);
  }
};

testAPI();