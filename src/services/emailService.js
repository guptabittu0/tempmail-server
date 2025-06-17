const { simpleParser } = require('mailparser');
const TempEmail = require('../models/TempEmail');
const Email = require('../models/Email');

class EmailService {
  static async processIncomingEmail(rawEmail) {
    try {
      // Parse the raw email
      const parsed = await simpleParser(rawEmail);
      
      // Extract recipient email
      const recipientEmail = this.extractRecipientEmail(parsed);
      if (!recipientEmail) {
        throw new Error('No recipient email found');
      }

      // Find the temporary email in database
      const tempEmail = await TempEmail.findByEmail(recipientEmail);
      if (!tempEmail) {
        console.log(`No temporary email found for: ${recipientEmail}`);
        return null;
      }

      // Check if temporary email is expired
      if (new Date() > new Date(tempEmail.expires_at)) {
        console.log(`Temporary email expired: ${recipientEmail}`);
        return null;
      }

      // Extract attachments
      const attachments = this.extractAttachments(parsed);
      
      // Calculate email size
      const sizeBytes = Buffer.byteLength(rawEmail, 'utf8');

      // Create email record
      const emailData = {
        tempEmailId: tempEmail.id,
        messageId: parsed.messageId || this.generateMessageId(),
        senderEmail: parsed.from?.value?.[0]?.address || 'unknown',
        senderName: parsed.from?.value?.[0]?.name || null,
        recipientEmail: recipientEmail,
        subject: parsed.subject || '(No Subject)',
        bodyText: parsed.text || '',
        bodyHtml: parsed.html || '',
        attachments: attachments,
        headers: this.extractHeaders(parsed),
        sizeBytes: sizeBytes
      };

      const savedEmail = await Email.create(emailData);
      console.log(`Email saved successfully: ${savedEmail.id}`);
      
      return savedEmail;
    } catch (error) {
      console.error('Error processing incoming email:', error);
      throw error;
    }
  }

  static extractRecipientEmail(parsed) {
    // Try to get recipient from 'to' field
    if (parsed.to?.value?.[0]?.address) {
      return parsed.to.value[0].address.toLowerCase();
    }
    
    // Try to get from 'envelope-to' header
    if (parsed.headers?.get('envelope-to')) {
      return parsed.headers.get('envelope-to').toLowerCase();
    }
    
    // Try to get from 'delivered-to' header
    if (parsed.headers?.get('delivered-to')) {
      return parsed.headers.get('delivered-to').toLowerCase();
    }
    
    return null;
  }

  static extractAttachments(parsed) {
    if (!parsed.attachments || parsed.attachments.length === 0) {
      return [];
    }

    return parsed.attachments.map(attachment => ({
      filename: attachment.filename || 'unnamed',
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || 0,
      contentId: attachment.contentId || null,
      contentDisposition: attachment.contentDisposition || null,
      // Note: We're not storing the actual content for security reasons
      // In a production environment, you might want to store files separately
      hasContent: attachment.content ? true : false
    }));
  }

  static extractHeaders(parsed) {
    const headers = {};
    
    if (parsed.headers) {
      // Convert headers to plain object
      for (const [key, value] of parsed.headers) {
        headers[key] = value;
      }
    }
    
    return headers;
  }

  static generateMessageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}.${random}@tempmail.local`;
  }

  static async cleanupExpiredEmails() {
    try {
      console.log('Starting email cleanup...');
      
      // Get retention hours from environment
      const retentionHours = parseInt(process.env.EMAIL_RETENTION_HOURS) || 24;
      
      // Cleanup emails
      const deletedEmails = await Email.cleanup(retentionHours);
      
      // Cleanup expired temporary email addresses
      const deletedTempEmails = await TempEmail.cleanup();
      
      console.log(`Cleanup complete: ${deletedEmails} emails, ${deletedTempEmails} temp emails deleted`);
      
      return {
        deletedEmails,
        deletedTempEmails
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  static async validateEmailAddress(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static async getEmailPreview(email) {
    // Create a safe preview of the email without potentially dangerous content
    return {
      id: email.id,
      from: email.sender_email,
      fromName: email.sender_name,
      subject: email.subject,
      receivedAt: email.received_at,
      isRead: email.is_read,
      hasAttachments: email.attachments && email.attachments.length > 0,
      size: email.size_bytes,
      preview: this.createTextPreview(email.body_text, 150)
    };
  }

  static createTextPreview(text, maxLength = 150) {
    if (!text) return '';
    
    // Remove extra whitespace and newlines
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    return cleaned.substring(0, maxLength) + '...';
  }

  static async getEmailContent(email) {
    // Return full email content for display
    return {
      id: email.id,
      from: email.sender_email,
      fromName: email.sender_name,
      to: email.recipient_email,
      subject: email.subject,
      receivedAt: email.received_at,
      isRead: email.is_read,
      bodyText: email.body_text,
      bodyHtml: email.body_html,
      attachments: email.attachments || [],
      headers: email.headers || {},
      size: email.size_bytes
    };
  }
}

module.exports = EmailService; 