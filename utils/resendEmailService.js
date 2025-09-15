import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Resend client with better error handling
let resend = null;
try {
  console.log('🔍 Checking Resend API key:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
  
  if (process.env.RESEND_API_KEY && 
      process.env.RESEND_API_KEY !== 'your_resend_api_key_here' && 
      process.env.RESEND_API_KEY.startsWith('re_')) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email service initialized with API key');
  } else {
    console.log('⚠️ Resend API key not configured or invalid - using mock email service');
  }
} catch (error) {
  console.error('❌ Failed to initialize Resend:', error.message);
  resend = null;
}

function isResendConfigured() {
  return resend !== null;
}

async function sendTicketEmail(toEmail, subject, userName, attachments = []) {
  // If Resend is not configured, use mock email service for development
  if (!resend) {
    console.log('📧 Using mock email service (Resend not configured)');
    console.log(`   To: ${toEmail}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   User: ${userName}`);
    console.log(`   Attachments: ${attachments ? attachments.length : 0}`);
    
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      service: 'mock',
      message: 'Email sent via mock service - configure RESEND_API_KEY for real emails'
    };
  }

  try {
    console.log(`📧 Sending email to: ${toEmail}`);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; color: #d4af37; margin-bottom: 30px; }
          .content { color: #333; line-height: 1.6; }
          .ticket-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Malang Raas Dandiya 2025</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            <p>Thank you for booking your tickets for Malang Raas Dandiya 2025! Your booking has been confirmed.</p>
            
            <div class="ticket-info">
              <h3>📅 Event Details:</h3>
              <p><strong>Event:</strong> Malang Raas Dandiya 2025</p>
              <p><strong>Venue:</strong> Regal Lawns, Near Deolai Chowk, Beed Bypass</p>
              <p><strong>Location:</strong> Chhatrapati Sambhajinagar</p>
              <p><strong>Time:</strong> 7:00 PM onwards</p>
            </div>
            
            <p>🎫 Your e-ticket${attachments && attachments.length > 1 ? 's are' : ' is'} attached to this email. Please present the QR code${attachments && attachments.length > 1 ? 's' : ''} at the entrance for quick entry.</p>
            
            ${attachments && attachments.length > 1 ? 
              `<p><strong>📋 You have ${attachments.length} tickets attached:</strong></p>
               <ul>${attachments.map((_, index) => `<li>Ticket ${index + 1} - Individual QR code for entry</li>`).join('')}</ul>` 
              : ''}
            
            <p><strong>Important Notes:</strong></p>
            <ul>
              <li>Keep your ticket${attachments && attachments.length > 1 ? 's' : ''} safe and bring ${attachments && attachments.length > 1 ? 'them' : 'it'} to the event</li>
              <li>Entry is subject to QR code verification</li>
              <li>Gates open at 7:00 PM</li>
              ${attachments && attachments.length > 1 ? '<li>Each person needs their individual ticket for entry</li>' : ''}
            </ul>
            
            <p>We look forward to seeing you at the event!</p>
          </div>
          
          <div class="footer">
            <p>For any queries, contact us at admin@malangdandiya.com</p>
            <p>© 2025 Malang Raas Dandiya. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Email configuration - Use verified custom domain
    const fromName = process.env.EMAIL_FROM_NAME || 'Malang Dandiya';
    const emailDomain = process.env.EMAIL_DOMAIN || 'malangevents.com';
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    
    let fromEmail;
    
    // Use the verified custom domain (malangevents.com)
    if (fromAddress && fromAddress.includes('@malangevents.com')) {
      fromEmail = fromAddress;
      console.log(`📧 Using verified custom domain: ${fromEmail}`);
    } else {
      // Default to noreply@malangevents.com for verified domain
      fromEmail = `noreply@malangevents.com`;
      console.log(`📧 Using verified domain default: ${fromEmail}`);
    }

    const emailData = {
      from: `${fromName} <${fromEmail}>`,
      to: [toEmail],
      subject: subject,
      html: htmlContent,
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailData.attachments = attachments;
    }

    const result = await resend.emails.send(emailData);
    
    console.log('📧 Resend API Response:', JSON.stringify(result, null, 2));
    
    // Check for API errors in the response
    if (result.error) {
      console.error('❌ Resend API error:', result.error);
      
      // Handle specific error cases  
      if (result.error.name === 'validation_error' || result.error.message?.includes('403')) {
        console.error('🚨 Possible causes for 403/validation error:');
        console.error('   1. Domain not verified in Resend dashboard');
        console.error('   2. API key permissions insufficient');
        console.error('   3. From email address not matching verified domain');
        console.error(`   Current from: ${emailData.from}`);
        console.error(`   Current domain: ${emailDomain}`);
      }
      
      throw new Error(`Resend API error: ${result.error.message || result.error}`);
    }
    
    console.log('✅ Email sent successfully via Resend:', result.data?.id || result.id || 'Email ID not available');
    return {
      success: true,
      messageId: result.data?.id || result.id,
      service: 'resend',
      from_email: fromEmail
    };

  } catch (error) {
    console.error('❌ Resend email failed:', error);
    throw new Error(`Resend email service failed: ${error.message}`);
  }
}

export { sendTicketEmail, isResendConfigured };