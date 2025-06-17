const { query } = require('../database/config');
const { v4: uuidv4 } = require('uuid');

class TempEmail {
  static async create(emailAddress, hoursToExpire = 24) {
    const accessToken = uuidv4();
    const expiresAt = new Date(Date.now() + (hoursToExpire * 60 * 60 * 1000));
    
    const result = await query(
      `INSERT INTO temp_emails (email_address, expires_at, access_token) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [emailAddress, expiresAt, accessToken]
    );
    
    return result.rows[0];
  }

  static async findByEmail(emailAddress) {
    const result = await query(
      'SELECT * FROM temp_emails WHERE email_address = $1 AND is_active = true',
      [emailAddress]
    );
    
    return result.rows[0];
  }

  static async findByToken(accessToken) {
    const result = await query(
      'SELECT * FROM temp_emails WHERE access_token = $1 AND is_active = true',
      [accessToken]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      'SELECT * FROM temp_emails WHERE id = $1',
      [id]
    );
    
    return result.rows[0];
  }

  static async generateRandomEmail(domain) {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    
    for (let i = 0; i < 10; i++) {
      username += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    const emailAddress = `${username}@${domain}`;
    
    // Check if email already exists
    const existing = await this.findByEmail(emailAddress);
    if (existing) {
      // If exists, try again recursively
      return this.generateRandomEmail(domain);
    }
    
    return emailAddress;
  }

  static async cleanup() {
    const result = await query(
      'DELETE FROM temp_emails WHERE expires_at < NOW() OR is_active = false'
    );
    
    return result.rowCount;
  }

  static async deactivate(id) {
    const result = await query(
      'UPDATE temp_emails SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }

  static async extendExpiry(id, additionalHours = 24) {
    const newExpiresAt = new Date(Date.now() + (additionalHours * 60 * 60 * 1000));
    
    const result = await query(
      'UPDATE temp_emails SET expires_at = $1 WHERE id = $2 RETURNING *',
      [newExpiresAt, id]
    );
    
    return result.rows[0];
  }

  static async getStats() {
    const activeEmails = await query(
      'SELECT COUNT(*) as count FROM temp_emails WHERE is_active = true AND expires_at > NOW()'
    );
    
    const expiredEmails = await query(
      'SELECT COUNT(*) as count FROM temp_emails WHERE expires_at <= NOW()'
    );
    
    const totalEmails = await query(
      'SELECT COUNT(*) as count FROM emails'
    );
    
    return {
      activeEmails: parseInt(activeEmails.rows[0].count),
      expiredEmails: parseInt(expiredEmails.rows[0].count),
      totalEmails: parseInt(totalEmails.rows[0].count)
    };
  }
}

module.exports = TempEmail; 