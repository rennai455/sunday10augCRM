// db/index.js: centralised PostgreSQL connection
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const ssl = process.env.PG_SSL ? { rejectUnauthorized: false } : false;

const pool = new Pool({ connectionString, ssl });

module.exports = { pool };
