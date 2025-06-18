const { query } = require('../database/config');

class Email {
  static async create(emailData) {
    const {
      tempEmailId,
      messageId,
      senderEmail,
      senderName,
      recipientEmail,
      subject,
      bodyText,
      bodyHtml,
      attachments = [],
      headers = {},
      sizeBytes = 0
    } = emailData;

    const result = await query(
      `INSERT INTO emails (
        temp_email_id, message_id, sender_email, sender_name, 
        recipient_email, subject, body_text, body_html, 
        attachments, headers, size_bytes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`,
      [
        tempEmailId, messageId, senderEmail, senderName,
        recipientEmail, subject, bodyText, bodyHtml,
        JSON.stringify(attachments), JSON.stringify(headers), sizeBytes
      ]
    );

    return result.rows[0];
  }

  static async findByTempEmailId(tempEmailId, options = {}) {
    const { limit = 50, offset = 0, onlyUnread = false, fields = null } = options;
    
    let whereClause = 'WHERE temp_email_id = $1';
    let params = [tempEmailId];
    
    if (onlyUnread) {
      whereClause += ' AND is_read = false';
    }

    // Optimize SELECT clause based on requested fields
    let selectClause = '*';
    if (fields) {
      const requestedFields = fields.split(',').map(f => f.trim());
      const dbFieldMap = {
        'id': 'id',
        'from': 'sender_email',
        'fromName': 'sender_name', 
        'subject': 'subject',
        'receivedAt': 'received_at',
        'isRead': 'is_read',
        'hasAttachments': 'attachments',
        'size': 'size_bytes',
        'preview': 'body_text',
        'bodyText': 'body_text',
        'bodyHtml': 'body_html',
        'attachments': 'attachments',
        'headers': 'headers'
      };

      // Always include id and temp_email_id for proper functioning
      const dbFields = ['id', 'temp_email_id'];
      
      // Add requested fields
      requestedFields.forEach(field => {
        if (dbFieldMap[field] && !dbFields.includes(dbFieldMap[field])) {
          dbFields.push(dbFieldMap[field]);
        }
      });

      // If bodyText or preview is requested, we need body_text
      if (requestedFields.includes('preview') || requestedFields.includes('bodyText')) {
        if (!dbFields.includes('body_text')) {
          dbFields.push('body_text');
        }
      }

      selectClause = dbFields.join(', ');
    }
    
    const result = await query(
      `SELECT ${selectClause} FROM emails 
       ${whereClause} 
       ORDER BY received_at DESC 
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return result.rows;
  }

  static async findById(id) {
    const result = await query(
      'SELECT * FROM emails WHERE id = $1',
      [id]
    );

    return result.rows[0];
  }

  static async markAsRead(id) {
    const result = await query(
      'UPDATE emails SET is_read = true WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows[0];
  }

  static async delete(id) {
    const result = await query(
      'DELETE FROM emails WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows[0];
  }

  static async deleteByTempEmailId(tempEmailId) {
    const result = await query(
      'DELETE FROM emails WHERE temp_email_id = $1',
      [tempEmailId]
    );

    return result.rowCount;
  }

  // Email cleanup method removed - emails no longer expire automatically
  // Only temporary email addresses expire, not the emails themselves

  static async getEmailsByRecipient(recipientEmail, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const result = await query(
      `SELECT e.*, te.access_token 
       FROM emails e 
       JOIN temp_emails te ON e.temp_email_id = te.id 
       WHERE e.recipient_email = $1 
       ORDER BY e.received_at DESC 
       LIMIT $2 OFFSET $3`,
      [recipientEmail, limit, offset]
    );

    return result.rows;
  }

  static async searchEmails(tempEmailId, searchQuery, options = {}) {
    const { limit = 50, offset = 0, fields = null } = options;
    
    // Optimize SELECT clause based on requested fields
    let selectClause = '*, ts_rank(to_tsvector(\'english\', subject || \' \' || coalesce(body_text, \'\')), plainto_tsquery(\'english\', $2)) as rank';
    if (fields) {
      const requestedFields = fields.split(',').map(f => f.trim());
      const dbFieldMap = {
        'id': 'id',
        'from': 'sender_email',
        'fromName': 'sender_name', 
        'subject': 'subject',
        'receivedAt': 'received_at',
        'isRead': 'is_read',
        'hasAttachments': 'attachments',
        'size': 'size_bytes',
        'preview': 'body_text',
        'bodyText': 'body_text',
        'bodyHtml': 'body_html',
        'attachments': 'attachments',
        'headers': 'headers'
      };

      // Always include id and temp_email_id for proper functioning
      const dbFields = ['id', 'temp_email_id'];
      
      // Add requested fields
      requestedFields.forEach(field => {
        if (dbFieldMap[field] && !dbFields.includes(dbFieldMap[field])) {
          dbFields.push(dbFieldMap[field]);
        }
      });

      // For search, we always need subject and body_text for ranking
      if (!dbFields.includes('subject')) dbFields.push('subject');
      if (!dbFields.includes('body_text')) dbFields.push('body_text');

      selectClause = `${dbFields.join(', ')}, ts_rank(to_tsvector('english', subject || ' ' || coalesce(body_text, '')), plainto_tsquery('english', $2)) as rank`;
    }
    
    // Use full-text search with GIN index for better performance
    const result = await query(
      `SELECT ${selectClause}
       FROM emails 
       WHERE temp_email_id = $1 
       AND (
         to_tsvector('english', subject || ' ' || coalesce(body_text, '')) @@ plainto_tsquery('english', $2)
         OR subject ILIKE $3 
         OR sender_email ILIKE $3 
         OR body_text ILIKE $3
       )
       ORDER BY rank DESC, received_at DESC 
       LIMIT $4 OFFSET $5`,
      [tempEmailId, searchQuery, `%${searchQuery}%`, limit, offset]
    );

    return result.rows;
  }

  static async getEmailCount(tempEmailId, onlyUnread = false) {
    let whereClause = 'WHERE temp_email_id = $1';
    let params = [tempEmailId];
    
    if (onlyUnread) {
      whereClause += ' AND is_read = false';
    }
    
    const result = await query(
      `SELECT COUNT(*) as count FROM emails ${whereClause}`,
      params
    );

    return parseInt(result.rows[0].count);
  }

  static async getStats() {
    const totalEmails = await query('SELECT COUNT(*) as count FROM emails');
    const unreadEmails = await query('SELECT COUNT(*) as count FROM emails WHERE is_read = false');
    const todayEmails = await query(
      'SELECT COUNT(*) as count FROM emails WHERE received_at >= CURRENT_DATE'
    );

    return {
      total: parseInt(totalEmails.rows[0].count),
      unread: parseInt(unreadEmails.rows[0].count),
      today: parseInt(todayEmails.rows[0].count)
    };
  }
}

module.exports = Email; 