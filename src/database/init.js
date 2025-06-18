const { query } = require('./config');

const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');

    // Test database connection first
    try {
      await query('SELECT 1');
      console.log('✅ Database connection successful');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }

    // Check permissions
    try {
      await query('SELECT has_schema_privilege(current_user, \'public\', \'CREATE\') as can_create');
      console.log('✅ Schema permissions check passed');
    } catch (error) {
      console.error('❌ Permission check failed:', error.message);
      console.log('\n🔧 To fix this issue, run one of the following:');
      console.log('1. Run: npm run setup-db (as postgres superuser)');
      console.log('2. Or manually execute the commands in scripts/setup-database.sql');
      console.log('3. Or use Docker: npm run docker:up\n');
      throw new Error('Database permissions insufficient. See instructions above.');
    }

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
    console.log('✅ Created temp_emails table');

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
    console.log('✅ Created emails table');

    // Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_temp_emails_address ON temp_emails(email_address);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_temp_emails_expires ON temp_emails(expires_at);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_temp_emails_active ON temp_emails(is_active) WHERE is_active = true;
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_temp_email_id ON emails(temp_email_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails(recipient_email);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(temp_email_id, is_read) WHERE is_read = false;
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_search ON emails USING gin(to_tsvector('english', subject || ' ' || coalesce(body_text, '')));
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender_email);
    `);
    console.log('✅ Created database indexes');

    // Optimize PostgreSQL settings for better performance
    try {
      await query(`
        SET maintenance_work_mem = '256MB';
      `);
      
      await query(`
        SET shared_preload_libraries = 'pg_stat_statements';
      `);
      
      console.log('✅ Applied performance optimizations');
    } catch (error) {
      console.log('⚠️ Some performance optimizations skipped (may need admin privileges)');
    }

    console.log('🎉 Database initialized successfully!');
  } catch (error) {
    if (error.code === '42501') {
      console.error('\n❌ Permission denied for schema public');
      console.log('\n🔧 SOLUTION: Grant proper permissions to your database user:');
      console.log('1. Connect to PostgreSQL as superuser:');
      console.log('   psql -U postgres');
      console.log('\n2. Run these commands:');
      console.log('   GRANT ALL ON SCHEMA public TO tempmail_user;');
      console.log('   GRANT CREATE ON SCHEMA public TO tempmail_user;');
      console.log('   ALTER DATABASE tempmail_db OWNER TO tempmail_user;');
      console.log('\n3. Or run our setup script:');
      console.log('   npm run setup-db');
      console.log('\n4. Or use Docker for easier setup:');
      console.log('   npm run docker:up');
    } else {
      console.error('Error initializing database:', error);
    }
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
      console.error('Database setup failed:', error.message);
      process.exit(1);
    });
}

module.exports = { initializeDatabase }; 