import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * AiSensy WhatsApp Service
 * Production-ready WhatsApp API integration
 */
class WhatsAppService {
  constructor() {
    this.apiKey = process.env.AISENSY_API_KEY;
    this.apiUrl = process.env.AISENSY_API_URL;
    this.campaignName = process.env.AISENSY_CAMPAIGN_NAME;
    
    if (!this.apiKey || !this.apiUrl || !this.campaignName) {
      console.warn('⚠️ WhatsApp service not fully configured');
      this.isConfigured = false;
    } else {
      this.isConfigured = true;
      console.log('✅ AiSensy WhatsApp service initialized');
    }
  }

  /**
   * Upload PDF buffer to temporary hosting for WhatsApp sharing
   */
  async uploadPDFForWhatsApp(pdfBuffer, bookingId) {
    try {
      // Check if we have a publicly accessible server URL
      const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_URL || '';
      const isPublicUrl = serverUrl && 
                         !serverUrl.includes('localhost') && 
                         !serverUrl.includes('127.0.0.1') && 
                         !serverUrl.includes('192.168.');

      if (!isPublicUrl) {
        console.warn('⚠️ No public server URL configured for WhatsApp PDF attachments');
        console.warn('⚠️ Set SERVER_URL environment variable to enable PDF attachments in WhatsApp');
        return null; // Disable PDF attachments when not publicly accessible
      }

      // Create tickets directory path (same as static serving)
      const ticketsDir = path.join(process.cwd(), 'tickets');
      if (!fs.existsSync(ticketsDir)) {
        fs.mkdirSync(ticketsDir, { recursive: true });
      }
      
      const fileName = `ticket-${bookingId}-${Date.now()}.pdf`;
      const filePath = path.join(ticketsDir, fileName);
      
      // Write PDF buffer to tickets directory
      fs.writeFileSync(filePath, pdfBuffer);
      
      // Return public URL that matches the static serving route
      const publicUrl = `${serverUrl}/tickets/${fileName}`;
      
      console.log('📄 PDF uploaded for WhatsApp:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('❌ Failed to upload PDF for WhatsApp:', error);
      return null;
    }
  }

  /**
   * Send booking confirmation via WhatsApp
   */
  async sendBookingConfirmation(data) {
    if (!this.isConfigured) {
      console.warn('❌ WhatsApp service not configured');
      return { success: false, error: 'WhatsApp service not configured' };
    }

    try {
      const { phone, name, eventName, ticketCount, amount, bookingId, pdfBuffer, pdfUrl } = data;
      
      // Format phone number - ensure it has country code
      let formattedPhone = phone;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.startsWith('91') ? `+${formattedPhone}` : `+91${formattedPhone}`;
      }
      
      // Remove any spaces or special characters except +
      formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
      
      const payload = {
        apiKey: this.apiKey,
        campaignName: this.campaignName,
        destination: formattedPhone,
        userName: name || 'Guest',
        templateParams: [
          String(name || 'Guest'),           // [1] - Customer name
          String(eventName || 'Dandiya Night'), // [2] - Event name  
          String(ticketCount || '1'),        // [3] - Number of tickets
          String(amount || '₹399'),          // [4] - Total amount
          String(bookingId || 'N/A'),        // [5] - Booking ID
          'Regal Lawns, Beed Bypass'        // [6] - Venue location
        ]
      };

      // Add media attachment if available (PDF ticket or default image)
      if (pdfBuffer) {
        // Upload PDF buffer and get public URL
        const pdfUrl = await this.uploadPDFForWhatsApp(pdfBuffer, bookingId);
        if (pdfUrl) {
          payload.media = {
            url: pdfUrl,
            filename: `ticket-${bookingId}.pdf`,
            type: 'document'
          };
          console.log('📄 Attaching PDF ticket to WhatsApp:', pdfUrl);
        } else {
          // Fallback to default image if PDF upload fails
          console.log('📷 Falling back to event poster (PDF attachment disabled)');
          payload.media = {
            url: process.env.WHATSAPP_MEDIA_URL || 'https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/IMG_7981.PNG',
            filename: 'event-poster.png'
          };
        }
      } else if (pdfUrl) {
        // If PDF URL is provided directly, attach as document
        payload.media = {
          url: pdfUrl,
          filename: `ticket-${bookingId}.pdf`,
          type: 'document'
        };
        console.log('📄 Attaching PDF ticket to WhatsApp:', pdfUrl);
      } else {
        // Default event poster
        payload.media = {
          url: process.env.WHATSAPP_MEDIA_URL || 'https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/IMG_7981.PNG',
          filename: 'event-poster.png'
        };
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
      console.error('❌ WhatsApp sending failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        service: 'aisensy'
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   */
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
