#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 TempMail Server Setup Script');
console.log('================================\n');

// Check if .env exists
const envPath = path.join(process.cwd(), '.env');
const templatePath = path.join(process.cwd(), 'config.env.template');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(templatePath)) {
    console.log('📋 Creating .env file from template...');
    fs.copyFileSync(templatePath, envPath);
    console.log('✅ .env file created');
    console.log('⚠️  Please edit .env with your configuration before starting the server\n');
  } else {
    console.log('❌ Template file not found');
    process.exit(1);
  }
} else {
  console.log('✅ .env file already exists\n');
}

// Create required directories
const directories = [
  'logs',
  'stats',
  'tmp'
];

console.log('📁 Creating required directories...');
directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`✅ Directory already exists: ${dir}`);
  }
});

console.log('\n🔧 Setup complete!');
console.log('\nNext steps:');
console.log('1. Edit .env file with your configuration');
console.log('2. Ensure PostgreSQL is running');
console.log('3. Run: npm run init-db');
console.log('4. Run: npm start or npm run dev');
console.log('\nFor detailed setup instructions, see README.md'); 