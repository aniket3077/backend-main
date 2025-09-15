import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// AiSensy WhatsApp service for ticket notifications
class WhatsAppService {
  constructor() {
    this.apiKey = process.env.AISENSY_API_KEY;
    this.apiUrl = 'https://backend.aisensy.com/campaign/t1/api/v2';
    this.campaignName = 'malangrasdandiya';
    
    if (this.apiKey && this.apiKey !== 'your_aisensy_api_key_here') {
      console.log('✅ AiSensy WhatsApp service initialized');
    } else {
      console.log('⚠️ AiSensy API key not configured - using mock service');
    }
  }

  // Format phone number for AiSensy (should include country code)
  formatPhoneNumber(phone) {
    // Remove any spaces, hyphens, or special characters
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if not present
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    
    return cleaned;
  }

  // Send booking confirmation message using AiSensy template
  async sendBookingConfirmation(phoneNumber, userName, bookingDetails, pdfUrl = null) {
    if (!this.apiKey || this.apiKey === 'your_aisensy_api_key_here') {
      console.log('📱 Mock WhatsApp: Booking confirmation sent');
      console.log(`To: ${phoneNumber}, User: ${userName}`);
      return { success: true, mock: true, message: 'Mock WhatsApp sent' };
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      // Prepare template parameters exactly like your curl example
      const templateParams = [
        userName || 'Guest',                                    // {1} - Name
        bookingDetails.date || 'September 24, 2025',           // {2} - Date  
        bookingDetails.time || '7:00 PM onwards',              // {3} - Time
        bookingDetails.venue || 'Event Ground, Malang',        // {4} - Venue
        bookingDetails.bookingId || 'N/A',                     // {5} - Ticket ID
        bookingDetails.passType || 'STANDARD'                  // {6} - Pass Type
      ];

      const payload = {
        apiKey: this.apiKey,
        campaignName: this.campaignName,
        destination: formattedPhone,
        userName: userName || 'Guest',
        templateParams: templateParams,
        source: 'ticket-booking-system',
        media: {
          url: "https://d3jt6ku4g6z5l8.cloudfront.net/FILE/6353da2e153a147b991dd812/4079142_dummy.pdf",
          filename: "dandiya_ticket_info"
        },
        buttons: [],
        carouselCards: [],
        location: {},
        attributes: {
          bookingId: bookingDetails.bookingId,
          passType: bookingDetails.passType
        },
        paramsFallbackValue: {
          FirstName: userName || 'Guest'
        }
      };

      // Override with actual PDF if provided
      if (pdfUrl && pdfUrl.trim() !== '') {
        payload.media = {
          url: pdfUrl,
          filename: `dandiya_ticket_${bookingDetails.bookingId}.pdf`
        };
        console.log('📎 Using custom PDF attachment');
      } else {
        console.log('📱 Using default media attachment for template compatibility');
      }

      console.log('📱 Sending WhatsApp message via AiSensy...');
      console.log(`📱 To: ${formattedPhone}`);
      console.log(`📱 User: ${userName}`);
      console.log(`📱 Booking: ${bookingDetails.bookingId}`);
      console.log('📱 Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ WhatsApp message sent successfully');
      console.log('📱 AiSensy Response:', response.data);

      return {
        success: true,
        messageId: response.data?.messageId || 'sent',
        service: 'aisensy',
        destination: formattedPhone,
        response: response.data
      };

    } catch (error) {
      console.error('❌ WhatsApp message failed:', error.message);
      
      if (error.response) {
        console.error('❌ AiSensy API Error:', error.response.data);
      }

      return {
        success: false,
        error: error.message,
        service: 'aisensy',
        destination: phoneNumber
      };
    }
  }

  // Legacy method for backward compatibility
  async sendTicketMessage(phoneNumber, message, attachments) {
    // Extract booking details from message (basic parsing)
    const bookingDetails = {
      bookingId: message.match(/#(\d+)/)?.[1] || 'N/A',
      date: 'Event Date TBD',
      time: '7:00 PM onwards',
      venue: 'Event Ground, Malang',
      passType: 'Standard'
    };

    const userName = message.includes('Dear ') ? 
      message.split('Dear ')[1]?.split(',')[0] : 'Guest';

    return await this.sendBookingConfirmation(
      phoneNumber, 
      userName, 
      bookingDetails,
      attachments?.[0]?.url
    );
  }
}

export default new WhatsAppService();
