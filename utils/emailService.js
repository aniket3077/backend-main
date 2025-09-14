import { sendTicketEmail as sendResend, isResendConfigured } from './resendEmailService.js';

export async function sendTicketEmail(toEmail, subject, userName, attachments) {
  console.log('📧 Email Service: Checking Resend configuration...');
  
  if (isResendConfigured()) {
    console.log('✅ Resend configured, sending email via Resend...');
    try {
      return await sendResend(toEmail, subject, userName, attachments);
    } catch (error) {
      console.error('❌ Resend failed:', error.message);
      return { 
        success: false, 
        error: error.message,
        service: 'resend_failed'
      };
    }
  } else {
    console.log('⚠️ Resend not configured, using mock email service');
    return { 
      success: true, 
      mock: true, 
      service: 'mock',
      message: 'Mock email sent - configure RESEND_API_KEY for real emails'
    };
  }
}
