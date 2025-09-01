// src/db/pool.js
const { Pool } = require('pg');
const config = require('../../config');

const connectionString = config.DATABASE_URL;
const ssl = config.PG_SSL ? { rejectUnauthorized: false } : undefined;

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