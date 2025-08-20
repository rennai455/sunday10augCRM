// diagnostics.js: checks config, DB, and security
require('dotenv').config();
const { pool } = require('./db');
const fs = require('fs');

async function diagnostics() {
  const requiredEnv = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'CORS_ORIGIN',
    'SESSION_COOKIE_NAME',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX',
    'WEBHOOK_SECRET',
  ];
  let missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing env vars:', missing);
  } else {
    console.log('All required env vars present.');
  }

  try {
    await pool.query('SELECT 1');
    console.log('Database connection: OK');
  } catch (err) {
    console.error('Database connection error:', err);
  }

  // Check migration
  try {
    const agencies = await pool.query('SELECT * FROM agencies LIMIT 1');
    console.log('Agencies table: OK');
  } catch (err) {
    console.error('Agencies table error:', err);
  }

  // Check for admin user
  try {
    const admin = await pool.query('SELECT * FROM users WHERE is_admin = true LIMIT 1');
    if (admin.rows.length) {
      console.log('Admin user: OK');
    } else {
      console.error('No admin user found.');
    }
  } catch (err) {
    console.error('Admin user check error:', err);
  }

  // Check for secure headers in Server.js
  try {
    const serverCode = fs.readFileSync('./Server.js', 'utf8');
    if (serverCode.includes('helmet(') && serverCode.includes('rateLimit(')) {
      console.log('Security middleware: OK');
    } else {
      console.error('Security middleware missing in Server.js');
    }
  } catch (err) {
    console.error('Server.js read error:', err);
  }
}

if (require.main === module) {
  diagnostics();
}
