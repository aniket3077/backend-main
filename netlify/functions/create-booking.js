import { createBooking } from '../../controllers/bookingController.js';

export const handler = async (event, context) => {
  console.log('Create booking function called');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const req = {
      body: JSON.parse(event.body || '{}'),
      method: 'POST'
    };

    let result = null;
    const res = {
      status: (code) => ({
        json: (data) => { 
          result = { statusCode: code, body: JSON.stringify(data) }; 
          return res; 
        }
      }),
      json: (data) => { 
        result = { statusCode: 200, body: JSON.stringify(data) }; 
        return res; 
      }
    };

    await createBooking(req, res);

    return {
      statusCode: result?.statusCode || 200,
      headers,
      body: result?.body || JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Create booking error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};