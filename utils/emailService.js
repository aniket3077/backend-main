import { sendTicketEmail as sendResend, isResendConfigured } from './resendEmailService.js';

// Frontend-like email service with better error handling and user feedback
export async function sendTicketEmail(toEmail, subject, userName, attachments) {
  // Input validation with user-friendly messages
  const validationResult = validateEmailInputs(toEmail, subject, userName);
  if (!validationResult.isValid) {
    const error = new Error(validationResult.message);
    error.code = validationResult.code;
    throw error;
  }

  console.log('📧 Email Service: Preparing to send email...');
  console.log(`📧 Recipient: ${toEmail}`);
  console.log(`📧 Subject: ${subject}`);
  console.log(`📧 Attachments: ${attachments ? attachments.length : 0}`);
  
  // Check service availability
  if (!isResendConfigured()) {
    const error = new Error('Email service is temporarily unavailable. Please try again later.');
    error.code = 'SERVICE_UNAVAILABLE';
    error.details = 'RESEND_API_KEY not configured';
    console.error('❌ Email service not configured:', error.details);
    throw error;
  }

  try {
    // Add retry mechanism (frontend-like approach)
    const result = await retryEmailSend(sendResend, toEmail, subject, userName, attachments);
    
    console.log('✅ Production email sent successfully to:', toEmail);
    
    // Return frontend-like response format
    return {
      success: true,
      message: 'Email sent successfully',
      data: {
        recipient: toEmail,
        subject: subject,
        timestamp: new Date().toISOString(),
        messageId: result.messageId,
        service: 'resend'
      },
      meta: {
        attachmentCount: attachments ? attachments.length : 0,
        service: result.service || 'resend'
      }
    };
    
  } catch (error) {
    console.error('❌ Production email failed for:', toEmail);
    console.error('❌ Error details:', error.message);
    
    // Frontend-like error response
    const formattedError = new Error(getUserFriendlyErrorMessage(error));
    formattedError.code = getErrorCode(error);
    formattedError.originalError = error.message;
    formattedError.timestamp = new Date().toISOString();
    formattedError.recipient = toEmail;
    
    throw formattedError;
  }
}

// Frontend-like input validation
function validateEmailInputs(toEmail, subject, userName) {
  if (!toEmail || typeof toEmail !== 'string') {
    return {
      isValid: false,
      message: 'Email address is required',
      code: 'MISSING_EMAIL'
    };
  }
  
  if (!toEmail.trim()) {
    return {
      isValid: false,
      message: 'Email address cannot be empty',
      code: 'EMPTY_EMAIL'
    };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(toEmail.trim())) {
    return {
      isValid: false,
      message: 'Please enter a valid email address',
      code: 'INVALID_EMAIL_FORMAT'
    };
  }
  
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return {
      isValid: false,
      message: 'Email subject is required',
      code: 'MISSING_SUBJECT'
    };
  }
  
  if (subject.trim().length > 100) {
    return {
      isValid: false,
      message: 'Subject line is too long (maximum 100 characters)',
      code: 'SUBJECT_TOO_LONG'
    };
  }
  
  return { isValid: true };
}

// Retry mechanism (frontend-like approach for reliability)
async function retryEmailSend(sendFunction, toEmail, subject, userName, attachments, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📧 Email attempt ${attempt}/${maxRetries}`);
      return await sendFunction(toEmail, subject, userName, attachments);
    } catch (error) {
      lastError = error;
      
      // Don't retry for certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying email in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// User-friendly error messages (frontend-like)
function getUserFriendlyErrorMessage(error) {
  const message = error.message?.toLowerCase() || '';
  
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }
  
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many emails sent. Please wait a moment before trying again.';
  }
  
  if (message.includes('invalid') && message.includes('email')) {
    return 'The email address provided is not valid.';
  }
  
  if (message.includes('unauthorized') || message.includes('forbidden')) {
    return 'Email service authentication failed. Please contact support.';
  }
  
  if (message.includes('quota') || message.includes('limit')) {
    return 'Email sending limit reached. Please contact support.';
  }
  
  // Default user-friendly message
  return 'Unable to send email at this time. Please try again later.';
}

// Error code mapping (frontend-like)
function getErrorCode(error) {
  const message = error.message?.toLowerCase() || '';
  
  if (message.includes('network') || message.includes('timeout')) {
    return 'NETWORK_ERROR';
  }
  
  if (message.includes('rate limit')) {
    return 'RATE_LIMIT_EXCEEDED';
  }
  
  if (message.includes('invalid') && message.includes('email')) {
    return 'INVALID_EMAIL';
  }
  
  if (message.includes('unauthorized')) {
    return 'AUTHENTICATION_FAILED';
  }
  
  if (message.includes('quota')) {
    return 'QUOTA_EXCEEDED';
  }
  
  return 'EMAIL_SEND_FAILED';
}

// Check if error should not be retried
function isNonRetryableError(error) {
  const message = error.message?.toLowerCase() || '';
  return message.includes('invalid') || 
         message.includes('unauthorized') || 
         message.includes('forbidden') ||
         message.includes('not found');
}
