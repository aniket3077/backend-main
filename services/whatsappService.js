import axios from 'axios';
import dotenv from 'dotenv';

import fs from 'fs';
import path from 'path';

dotenv.config();

class WhatsAppService {
  constructor() {
    this.apiKey = process.env.AISENSY_API_KEY;
    this.apiUrl = process.env.AISENSY_API_URL;
    this.campaignName = process.env.AISENSY_CAMPAIGN_NAME;
    
    console.log('🔧 Initializing WhatsApp Service...');
    console.log('🔑 API Key:', this.apiKey ? '***configured***' : 'MISSING');
    console.log('🌐 API URL:', this.apiUrl || 'MISSING');
    console.log('📋 Campaign:', this.campaignName || 'MISSING');
    
    if (!this.apiKey || !this.apiUrl || !this.campaignName) {
      console.warn('⚠️ WhatsApp service not fully configured');
      console.warn('⚠️ Required environment variables:');
      console.warn('   - AISENSY_API_KEY:', this.apiKey ? '✅' : '❌');
      console.warn('   - AISENSY_API_URL:', this.apiUrl ? '✅' : '❌');
      console.warn('   - AISENSY_CAMPAIGN_NAME:', this.campaignName ? '✅' : '❌');
      this.isConfigured = false;
    } else {
      this.isConfigured = true;
      console.log('✅ AiSensy WhatsApp service initialized');
    }
  }

  async uploadPDFForWhatsApp(pdfBuffer, bookingId) {
    try {
      const ticketsDir = path.join(process.cwd(), 'tickets');
      if (!fs.existsSync(ticketsDir)) {
        fs.mkdirSync(ticketsDir, { recursive: true });
      }
      
      const fileName = `dandiya-tickets-${bookingId}-${Date.now()}.pdf`;
      const filePath = path.join(ticketsDir, fileName);
      
      fs.writeFileSync(filePath, pdfBuffer);
      
      const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_URL;
      
      if (serverUrl && serverUrl.startsWith('http')) {
        const publicUrl = `${serverUrl}/tickets/${fileName}`;
        console.log('📄 PDF uploaded for WhatsApp:', publicUrl);
        return publicUrl;
      } else {
        console.log('📄 PDF saved locally:', fileName);
        console.warn('⚠️ Using placeholder URL - set SERVER_URL for production');
        console.warn('⚠️ For ngrok: SERVER_URL=https://your-ngrok-url.ngrok.io');
        return null;
      }
      
    } catch (error) {
      console.error('❌ Failed to upload PDF for WhatsApp:', error);
      return null;
    }
  }

  async sendBookingConfirmation(data) {
    if (!this.isConfigured) {
      console.warn('❌ WhatsApp service not configured');
      return { success: false, error: 'WhatsApp service not configured' };
    }

    try {
      const { phone, name, eventName, eventDate, ticketCount, amount, bookingId, pdfBuffer, pdfUrl, ticketNumber, passType } = data;
      
      let formattedPhone = phone;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.startsWith('91') ? `+${formattedPhone}` : `+91${formattedPhone}`;
      }
      
      formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
      
      // Custom message template parameters for Malang Ras Dandiya 2025
      // Template: Hello {{1}}, Your ticket for Malang Ras Dandiya 2025 has been successfully booked! 🎉
      // Event Details: Date: {{2}}, Time: {{3}}, Venue: {{4}}, Ticket ID: {{5}}, Pass Type: {{6}}
      
      const formattedEventDate = eventDate 
        ? new Date(eventDate).toLocaleDateString('en-IN', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })
        : new Date().toLocaleDateString('en-IN', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          });
          
      const eventTime = '7:00 PM onwards';
      const venue = 'Regal Lawns, Beed Bypass, Aurangabad';
      const finalPassType = passType || (ticketNumber && ticketNumber.startsWith('BOOKING-') 
        ? `${ticketCount} tickets booking` 
        : `${ticketCount} tickets`);

      const payload = {
        apiKey: this.apiKey,
        campaignName: this.campaignName,
        destination: formattedPhone,
        userName: name || 'Guest',
        templateParams: [
          String(name || 'Guest'),                    // {{1}} - Guest name
          String(formattedEventDate),                 // {{2}} - Event date  
          String(eventTime),                          // {{3}} - Event time
          String(venue),                              // {{4}} - Venue
          String(bookingId || 'N/A'),                // {{5}} - Ticket/Booking ID
          String(finalPassType)                      // {{6}} - Pass type
        ]
      };

      if (pdfBuffer) {
        const uploadedPdfUrl = await this.uploadPDFForWhatsApp(pdfBuffer, bookingId);
        if (uploadedPdfUrl) {
          payload.media = {
            url: uploadedPdfUrl,
            filename: `dandiya-tickets-${bookingId}.pdf`,
            type: 'document'
          };
          console.log('📄 Attaching complete PDF (cover + individual tickets) to WhatsApp:', uploadedPdfUrl);
        } else {
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=TICKET-${bookingId}`;
          payload.media = {
            url: qrCodeUrl,
            filename: `qr-${bookingId}.png`,
            type: 'image'
          };
          console.log('📱 Attaching QR code to WhatsApp (PDF unavailable)');
        }
      } else if (pdfUrl) {
        payload.media = {
          url: pdfUrl,
          filename: `dandiya-tickets-${bookingId}.pdf`,
          type: 'document'
        };
        console.log('📄 Attaching complete PDF (cover + individual tickets) to WhatsApp:', pdfUrl);
      } else {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=TICKET-${bookingId || 'DEFAULT'}`;
        payload.media = {
          url: qrCodeUrl,
          filename: `qr-${bookingId || 'default'}.png`,
          type: 'image'
        };
        console.log('📱 Attaching QR code to WhatsApp (no PDF provided)');
      }

      console.log('📱 Sending WhatsApp via AiSensy to:', formattedPhone);
      
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      console.log('✅ WhatsApp sent successfully:', response.data);
      
      return {
        success: true,
        messageId: response.data.submitted_message_id || 'sent',

        service: 'aisensy',
        destination: formattedPhone,
        response: response.data
      };

    } catch (error) {
      console.error('❌ WhatsApp sending failed:');
      console.error('   Error type:', error.name);
      console.error('   Error message:', error.message);
      if (error.response) {
        console.error('   Status code:', error.response.status);
        console.error('   Response data:', error.response.data);
        console.error('   Response headers:', error.response.headers);
      }
      if (error.config) {
        console.error('   Request URL:', error.config.url);
        console.error('   Request method:', error.config.method);
      }
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        errorDetails: {
          type: error.name,
          status: error.response?.status,
          data: error.response?.data,
          timeout: error.code === 'ECONNABORTED'
        },
        service: 'aisensy'
      };
    }
  }

  async sendTicketMessage(phoneNumber, message, attachments) {
    console.log('📱 Legacy WhatsApp method called, redirecting to sendBookingConfirmation');
    
    return this.sendBookingConfirmation({
      phone: phoneNumber,
      name: 'Guest',
      eventName: 'Dandiya Night',
      ticketCount: 1,
      amount: '₹399',
      bookingId: 'LEGACY'
    });

  }
}

export default new WhatsAppService();
