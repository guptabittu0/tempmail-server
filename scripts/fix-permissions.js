#!/usr/bin/env node

const { Client } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function fixPermissions() {
  console.log('🔧 PostgreSQL Permissions Fix Tool');
  console.log('==================================\n');

  try {
    // Ask for PostgreSQL superuser credentials
    const superUser = await askQuestion('Enter PostgreSQL superuser name (default: postgres): ') || 'postgres';
    const superPassword = await askQuestion('Enter PostgreSQL superuser password (press Enter if none): ') || '';
    const host = await askQuestion('Enter PostgreSQL host (default: localhost): ') || 'localhost';
    const port = await askQuestion('Enter PostgreSQL port (default: 5432): ') || '5432';

    console.log('\n🔌 Connecting to PostgreSQL...');

    // Connect as superuser
    const client = new Client({
      user: superUser,
      password: superPassword || undefined,
      host: host,
      port: parseInt(port),
      database: 'postgres' // Connect to default database first
    });

    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create database if it doesn't exist
    console.log('📋 Creating database and user...');
    
    try {
      await client.query('CREATE DATABASE tempmail_db');
      console.log('✅ Database created');
    } catch (error) {
      if (error.code === '42P04') {
        console.log('ℹ️  Database already exists');
      } else {
        throw error;
      }
    }

    // Create user if it doesn't exist
    try {
      await client.query("CREATE USER tempmail_user WITH PASSWORD 'tempmail_password'");
      console.log('✅ User created');
    } catch (error) {
      if (error.code === '42710') {
        console.log('ℹ️  User already exists');
      } else {
        throw error;
      }
    }

    // Close connection to postgres database
    await client.end();

    // Connect to tempmail database
    console.log('🔄 Connecting to tempmail database...');
    const tempmailClient = new Client({
      user: superUser,
      password: superPassword || undefined,
      host: host,
      port: parseInt(port),
      database: 'tempmail_db'
    });

    await tempmailClient.connect();

    // Grant permissions
    console.log('🔐 Granting permissions...');
    
    const permissions = [
      'GRANT ALL PRIVILEGES ON DATABASE tempmail_db TO tempmail_user',
      'GRANT ALL ON SCHEMA public TO tempmail_user',
      'GRANT CREATE ON SCHEMA public TO tempmail_user',
      'GRANT USAGE ON SCHEMA public TO tempmail_user',
      'ALTER DATABASE tempmail_db OWNER TO tempmail_user',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tempmail_user',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tempmail_user'
    ];

    for (const permission of permissions) {
      try {
        await tempmailClient.query(permission);
        console.log(`✅ ${permission}`);
      } catch (error) {
        console.log(`⚠️  ${permission} - ${error.message}`);
      }
    }

    await tempmailClient.end();

    console.log('\n🎉 Permissions fixed successfully!');
    console.log('\nNow you can run:');
    console.log('npm run init-db');
    console.log('npm start');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Alternative solutions:');
    console.log('1. Use Docker: npm run docker:up');
    console.log('2. Manually run: psql -U postgres -f scripts/setup-database.sql');
    console.log('3. Or create a database user with CREATEDB privileges');
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  fixPermissions();
}

module.exports = { fixPermissions }; 