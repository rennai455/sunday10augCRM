// db/index.js: PostgreSQL connection and helpers
const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const config = { connectionString };
if (process.env.PG_SSL === 'true') {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(config);

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
  smokeTest: async () => {
    return pool.query('SELECT 1');
  },
};
