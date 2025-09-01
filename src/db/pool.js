// src/db/pool.js
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const useSSL = String(process.env.PG_SSL).toLowerCase() === 'true';
const ssl = useSSL ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({ connectionString, ssl });

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  pool,
  smokeTest: async () => pool.query('SELECT 1'),
};
