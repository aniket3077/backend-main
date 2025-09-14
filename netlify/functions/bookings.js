import { createBooking, createPayment, confirmPayment, addUsers } from '../../controllers/bookingController.js';

export const handler = async (event, context) => {
  console.log('Function called with path:', event.path);
  console.log('Method:', event.httpMethod);
  
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Parse the path to determine which booking function to call
  const path = event.path.replace('/.netlify/functions/bookings', '') || event.rawUrl?.split('/bookings')[1] || '';
  console.log('Parsed path:', path);
  
  // Create mock req/res objects for Express compatibility
  const req = {
    method: event.httpMethod,
    body: JSON.parse(event.body || '{}'),
    params: {},
    query: event.queryStringParameters || {}
  };

  let result;
  const res = {
    status: (code) => ({ 
      json: (data) => { result = { statusCode: code, body: JSON.stringify(data) }; return res; }
    }),
    json: (data) => { result = { statusCode: 200, body: JSON.stringify(data) }; return res; }
  };

  try {
    switch (path) {
      case '/create':
        if (event.httpMethod !== 'POST') {
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
        await createBooking(req, res);
        break;
        
      case '/add-users':
        if (event.httpMethod !== 'POST') {
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
        await addUsers(req, res);
        break;
        
      case '/create-payment':
        if (event.httpMethod !== 'POST') {
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
        await createPayment(req, res);
        break;
        
      case '/confirm-payment':
        if (event.httpMethod !== 'POST') {
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
        await confirmPayment(req, res);
        break;
        
      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Not found' })
        };
    }

    return {
      statusCode: result?.statusCode || 200,
      headers,
      body: result?.body || JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};