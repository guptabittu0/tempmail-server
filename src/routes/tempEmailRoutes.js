const express = require('express');
const TempEmail = require('../models/TempEmail');
const Email = require('../models/Email');
const EmailService = require('../services/emailService');
const { rateLimiter } = require('../middleware/rateLimiter');
const { validateRequest } = require('../middleware/validation');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const createTempEmailSchema = Joi.object({
  customAddress: Joi.string().email().optional(),
  expiryHours: Joi.number().integer().min(1).max(168).default(24) // Max 7 days
});

const getEmailsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  onlyUnread: Joi.boolean().default(false)
});

const searchEmailsSchema = Joi.object({
  query: Joi.string().required().min(1).max(100),
  limit: Joi.number().integer().min(1).max(50).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// GET /api/temp-email/generate - Generate a new temporary email
router.post('/generate', rateLimiter, validateRequest(createTempEmailSchema), async (req, res) => {
  try {
    const { customAddress, expiryHours } = req.body;
    const domain = process.env.EMAIL_DOMAIN || 'tempmail.local';
    
    let emailAddress;
    
    if (customAddress) {
      // Validate custom address domain
      if (!customAddress.endsWith(`@${domain}`)) {
        return res.status(400).json({
          success: false,
          error: `Custom address must use domain: ${domain}`
        });
      }
      
      // Check if custom address already exists
      const existing = await TempEmail.findByEmail(customAddress);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Email address already exists'
        });
      }
      
      emailAddress = customAddress;
    } else {
      // Generate random email
      emailAddress = await TempEmail.generateRandomEmail(domain);
    }
    
    const tempEmail = await TempEmail.create(emailAddress, expiryHours);
    
    res.json({
      success: true,
      data: {
        email: tempEmail.email_address,
        token: tempEmail.access_token,
        expiresAt: tempEmail.expires_at,
        createdAt: tempEmail.created_at
      }
    });
  } catch (error) {
    console.error('Error generating temp email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate temporary email'
    });
  }
});

// GET /api/temp-email/:token/emails - Get emails for a temporary email
router.get('/:token/emails', rateLimiter, validateRequest(getEmailsSchema, 'query'), async (req, res) => {
  try {
    const { token } = req.params;
    const { limit, offset, onlyUnread } = req.query;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    // Check if expired
    if (new Date() > new Date(tempEmail.expires_at)) {
      return res.status(410).json({
        success: false,
        error: 'Temporary email has expired'
      });
    }
    
    const emails = await Email.findByTempEmailId(tempEmail.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      onlyUnread: onlyUnread === 'true'
    });
    
    // Get email count
    const totalCount = await Email.getEmailCount(tempEmail.id);
    const unreadCount = await Email.getEmailCount(tempEmail.id, true);
    
    // Create email previews
    const emailPreviews = await Promise.all(
      emails.map(email => EmailService.getEmailPreview(email))
    );
    
    res.json({
      success: true,
      data: {
        emails: emailPreviews,
        pagination: {
          total: totalCount,
          unread: unreadCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
        },
        tempEmail: {
          email: tempEmail.email_address,
          expiresAt: tempEmail.expires_at
        }
      }
    });
  } catch (error) {
    console.error('Error getting emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve emails'
    });
  }
});

// GET /api/temp-email/:token/emails/:emailId - Get specific email content
router.get('/:token/emails/:emailId', rateLimiter, async (req, res) => {
  try {
    const { token, emailId } = req.params;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const email = await Email.findById(emailId);
    if (!email || email.temp_email_id !== tempEmail.id) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }
    
    // Mark as read
    await Email.markAsRead(emailId);
    
    // Get full email content
    const emailContent = await EmailService.getEmailContent(email);
    
    res.json({
      success: true,
      data: {
        email: emailContent,
        tempEmail: {
          email: tempEmail.email_address,
          expiresAt: tempEmail.expires_at
        }
      }
    });
  } catch (error) {
    console.error('Error getting email content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve email content'
    });
  }
});

// DELETE /api/temp-email/:token/emails/:emailId - Delete specific email
router.delete('/:token/emails/:emailId', rateLimiter, async (req, res) => {
  try {
    const { token, emailId } = req.params;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const email = await Email.findById(emailId);
    if (!email || email.temp_email_id !== tempEmail.id) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }
    
    await Email.delete(emailId);
    
    res.json({
      success: true,
      message: 'Email deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete email'
    });
  }
});

// DELETE /api/temp-email/:token/emails - Delete all emails for temporary email
router.delete('/:token/emails', rateLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const deletedCount = await Email.deleteByTempEmailId(tempEmail.id);
    
    res.json({
      success: true,
      message: `${deletedCount} emails deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete emails'
    });
  }
});

// POST /api/temp-email/:token/search - Search emails
router.post('/:token/search', rateLimiter, validateRequest(searchEmailsSchema), async (req, res) => {
  try {
    const { token } = req.params;
    const { query, limit, offset } = req.body;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const emails = await Email.searchEmails(tempEmail.id, query, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    const emailPreviews = await Promise.all(
      emails.map(email => EmailService.getEmailPreview(email))
    );
    
    res.json({
      success: true,
      data: {
        emails: emailPreviews,
        searchQuery: query,
        count: emails.length
      }
    });
  } catch (error) {
    console.error('Error searching emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search emails'
    });
  }
});

// PUT /api/temp-email/:token/extend - Extend temporary email expiry
router.put('/:token/extend', rateLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { hours = 24 } = req.body;
    
    if (hours < 1 || hours > 168) {
      return res.status(400).json({
        success: false,
        error: 'Hours must be between 1 and 168 (7 days)'
      });
    }
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const updatedTempEmail = await TempEmail.extendExpiry(tempEmail.id, hours);
    
    res.json({
      success: true,
      data: {
        email: updatedTempEmail.email_address,
        expiresAt: updatedTempEmail.expires_at,
        message: `Email extended by ${hours} hours`
      }
    });
  } catch (error) {
    console.error('Error extending temp email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend temporary email'
    });
  }
});

// GET /api/temp-email/:token/stats - Get email statistics
router.get('/:token/stats', rateLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    
    const tempEmail = await TempEmail.findByToken(token);
    if (!tempEmail) {
      return res.status(404).json({
        success: false,
        error: 'Temporary email not found'
      });
    }
    
    const totalEmails = await Email.getEmailCount(tempEmail.id);
    const unreadEmails = await Email.getEmailCount(tempEmail.id, true);
    
    res.json({
      success: true,
      data: {
        email: tempEmail.email_address,
        createdAt: tempEmail.created_at,
        expiresAt: tempEmail.expires_at,
        totalEmails,
        unreadEmails,
        readEmails: totalEmails - unreadEmails
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

module.exports = router;