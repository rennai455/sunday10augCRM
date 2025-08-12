const { Pool } = require('pg');

const useSSL = String(process.env.PG_SSL).toLowerCase() === 'true';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

module.exports = { pool };
