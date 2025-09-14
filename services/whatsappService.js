// Simple mock WhatsApp service for ES6 testing
class WhatsAppService {
  async sendTicketMessage(phoneNumber, message, attachments) {
    console.log('� Mock WhatsApp service for ES6 testing');
    console.log(`To: ${phoneNumber}, Message: ${message}`);
    return { success: true, mock: true, message: 'Mock WhatsApp sent' };
  }
}

export default new WhatsAppService();
