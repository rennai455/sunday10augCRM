const { Pool } = require('pg');
const config = require('../../config');

const connectionString = config.DATABASE_URL;
const ssl = config.PG_SSL ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({
  connectionString,
  ssl,
  max: config.PG_POOL_MAX,
  idleTimeoutMillis: config.PG_IDLE_TIMEOUT_MS,
});

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

const withAgencyContext = async (agencyId, fn) => {
  if (!agencyId) return withTransaction(fn);
  return withTransaction(async (client) => {
    await client.query("SET LOCAL app.current_agency_id = $1", [String(agencyId)]);
    return fn(client);
  });
};

const smokeTest = async () => pool.query('SELECT 1');

module.exports = { query, withTransaction, withAgencyContext, pool, smokeTest };
