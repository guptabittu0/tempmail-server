const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'tempmail_db',
  user: process.env.DB_USER || 'tempmail_user',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

const query = (text, params) => {
  return pool.query(text, params);
};

const getClient = () => {
  return pool.connect();
};

module.exports = {
  query,
  getClient,
  pool
}; 