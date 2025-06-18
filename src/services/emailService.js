const { simpleParser } = require('mailparser');
const TempEmail = require('../models/TempEmail');
const Email = require('../models/Email');

class EmailService {
  static async processIncomingEmail(rawEmail) {
    try {
      console.log('📥 Processing incoming email...');
      console.log('Raw email length:', rawEmail.length);
      
      // Parse the raw email with more detailed options
      const parsed = await simpleParser(rawEmail, {
        skipHtmlToText: false,
        skipTextToHtml: false,
        skipImageLinks: true,
        maxHtmlLengthToParse: 1000000,
        streamAttachments: false
      });

      console.log('📋 Parsed email details:');
      console.log('- Subject:', parsed.subject);
      console.log('- From:', parsed.from?.text);
      console.log('- To:', parsed.to?.text);
      console.log('- Has text body:', !!parsed.text);
      console.log('- Has HTML body:', !!parsed.html);
      console.log('- Text length:', parsed.text?.length || 0);
      console.log('- HTML length:', parsed.html?.length || 0);
      
      // Extract recipient email
      const recipientEmail = this.extractRecipientEmail(parsed);
      if (!recipientEmail) {
        throw new Error('No recipient email found');
      }

      console.log('🎯 Recipient email:', recipientEmail);

      // Find the temporary email in database
      const tempEmail = await TempEmail.findByEmail(recipientEmail);
      if (!tempEmail) {
        console.log(`❌ No temporary email found for: ${recipientEmail}`);
        return null;
      }

      // Check if temporary email is expired
      if (new Date() > new Date(tempEmail.expires_at)) {
        console.log(`⏰ Temporary email expired: ${recipientEmail}`);
        return null;
      }

      // Extract attachments
      const attachments = this.extractAttachments(parsed);
      
      // Calculate email size
      const sizeBytes = Buffer.byteLength(rawEmail, 'utf8');

      // Process and clean email content
      let subject = parsed.subject || '(No Subject)';
      let bodyText = parsed.text || '';
      let bodyHtml = parsed.html || '';

      // Clean up body text - remove excessive headers if they leaked through
      if (bodyText && bodyText.includes('Received: by') && bodyText.includes('DKIM-Signature:')) {
        console.log('⚠️ Detected raw headers in body text, attempting to clean...');
        
        // Try to extract just the actual message content
        const lines = bodyText.split('\n');
        let messageStartIndex = -1;
        
        // Look for common email body separators
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Look for MIME boundary markers or empty lines after headers
          if (line.startsWith('--') && line.includes('boundary') ||
              (i > 0 && lines[i-1].trim() === '' && line.length > 0 && !line.includes(':'))) {
            messageStartIndex = i;
            break;
          }
          
          // Look for quoted-printable content start
          if (line.includes('Content-Type: text/plain') || 
              line.includes('Content-Transfer-Encoding:')) {
            // Skip a few lines to get past headers
            messageStartIndex = Math.min(i + 3, lines.length - 1);
            break;
          }
        }
        
        if (messageStartIndex > 0) {
          bodyText = lines.slice(messageStartIndex).join('\n').trim();
          console.log('✅ Cleaned body text, new length:', bodyText.length);
        }
      }

      // Decode quoted-printable content if present
      if (bodyText.includes('=E2=80=') || bodyText.includes('=\n')) {
        bodyText = this.decodeQuotedPrintable(bodyText);
      }

      // Create email record
      const emailData = {
        tempEmailId: tempEmail.id,
        messageId: parsed.messageId || this.generateMessageId(),
        senderEmail: parsed.from?.value?.[0]?.address || 'unknown',
        senderName: parsed.from?.value?.[0]?.name || null,
        recipientEmail: recipientEmail,
        subject: subject.trim(),
        bodyText: bodyText.trim(),
        bodyHtml: bodyHtml.trim(),
        attachments: attachments,
        headers: this.extractHeaders(parsed),
        sizeBytes: sizeBytes
      };

      console.log('📝 Email data to save:');
      console.log('- Subject:', emailData.subject);
      console.log('- Body text length:', emailData.bodyText.length);
      console.log('- Body HTML length:', emailData.bodyHtml.length);
      console.log('- Attachments:', emailData.attachments.length);

      const savedEmail = await Email.create(emailData);
      console.log(`✅ Email saved successfully: ${savedEmail.id}`);
      
      return savedEmail;
    } catch (error) {
      console.error('❌ Error processing incoming email:', error);
      throw error;
    }
  }

  static decodeQuotedPrintable(text) {
    try {
      // Basic quoted-printable decoding
      return text
        .replace(/=\r?\n/g, '') // Remove soft line breaks
        .replace(/=([0-9A-F]{2})/g, (match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
    } catch (error) {
      console.warn('Failed to decode quoted-printable:', error);
      return text;
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

  static async getFullEmailData(email) {
    // Parse attachments if they're stored as JSON string
    let attachments = email.attachments || [];
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch (e) {
        attachments = [];
      }
    }

    // Parse headers if they're stored as JSON string
    let headers = email.headers || {};
    if (typeof headers === 'string') {
      try {
        headers = JSON.parse(headers);
      } catch (e) {
        headers = {};
      }
    }

    // Return complete email data including full body and subject
    return {
      id: email.id,
      from: email.sender_email,
      fromName: email.sender_name,
      subject: email.subject || '(No Subject)',
      receivedAt: email.received_at,
      isRead: email.is_read,
      hasAttachments: Array.isArray(attachments) ? attachments.length > 0 : false,
      size: email.size_bytes,
      preview: this.createTextPreview(email.body_text, 150),
      bodyText: email.body_text || '',
      bodyHtml: email.body_html || '',
      attachments: attachments,
      headers: headers
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
    // Parse attachments and headers if they're JSON strings
    let attachments = email.attachments || [];
    let headers = email.headers || {};
    
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch (e) {
        attachments = [];
      }
    }
    
    if (typeof headers === 'string') {
      try {
        headers = JSON.parse(headers);
      } catch (e) {
        headers = {};
      }
    }

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
      attachments: attachments,
      headers: headers,
      size: email.size_bytes
    };
  }
}

module.exports = EmailService; 