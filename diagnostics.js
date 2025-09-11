// diagnostics.js: checks config, DB, and security
const config = require('./config');
const db = require('./db');
const fs = require('fs');

async function diagnostics() {
  const requiredEnv = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
    'ALLOWED_ORIGINS',
    'WEBHOOK_SECRET',
  ];
  const missing = requiredEnv.filter((k) => !config[k]);
  if (missing.length) {
    console.error('Missing env vars:', missing);
  } else {
    console.log('All required env vars present.');
  }

  try {
    await db.query('SELECT 1');
    console.log('Database connection: OK');
  } catch (err) {
    console.error('Database connection error:', err);
  }

  // Check migration
  try {
    await db.query('SELECT * FROM agencies LIMIT 1');
    console.log('Agencies table: OK');
  } catch (err) {
    console.error('Agencies table error:', err);
  }

  // Check for admin user
  try {
    const admin = await db.query('SELECT * FROM users WHERE is_admin = true LIMIT 1');
    if (admin.rows.length) {
      console.log('Admin user: OK');
    } else {
      console.error('No admin user found.');
    }
  } catch (err) {
    console.error('Admin user check error:', err);
  }

  // Check for security middleware in src/middleware.js
  try {
    const middlewareCode = fs.readFileSync('./src/middleware.js', 'utf8');
    if (middlewareCode.includes('helmet(') && middlewareCode.includes('rateLimit(')) {
      console.log('Security middleware: OK');
    } else {
      console.error('Security middleware missing in src/middleware.js');
    }
  } catch (err) {
    console.error('src/middleware.js read error:', err);
  }
}

if (require.main === module) {
  diagnostics();
}
