const { query } = require('./config');

const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');

    // Create temporary email addresses table
    await query(`
      CREATE TABLE IF NOT EXISTS temp_emails (
        id SERIAL PRIMARY KEY,
        email_address VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        access_token VARCHAR(255) UNIQUE
      )
    `);

    // Create emails table
    await query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        temp_email_id INTEGER REFERENCES temp_emails(id) ON DELETE CASCADE,
        message_id VARCHAR(255) UNIQUE,
        sender_email VARCHAR(255) NOT NULL,
        sender_name VARCHAR(255),
        recipient_email VARCHAR(255) NOT NULL,
        subject TEXT DEFAULT '',
        body_text TEXT,
        body_html TEXT,
        attachments JSONB DEFAULT '[]',
        headers JSONB DEFAULT '{}',
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT false,
        size_bytes INTEGER DEFAULT 0
      )
    `);

    // Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_temp_emails_address ON temp_emails(email_address);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_temp_emails_expires ON temp_emails(expires_at);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_temp_email_id ON emails(temp_email_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails(recipient_email);
    `);

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase }; 