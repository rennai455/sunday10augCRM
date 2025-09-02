const { Pool } = require('pg');
const config = require('../../config');

const connectionString = config.DATABASE_URL;
const ssl = config.PG_SSL ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({ connectionString, ssl });

const query = (text, params) => pool.query(text, params);

const withTransaction = async (fn) => {
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
};

const smokeTest = async () => pool.query('SELECT 1');

module.exports = { query, withTransaction, pool, smokeTest };
