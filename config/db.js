// Lightweight adapter to expose the existing Postgres pool
// so callers can `import pool from '../config/db.js'` as requested.
// This re-exports the single shared pool from src/db/pool.js
// to avoid creating multiple pools.

import { pool } from '../src/db/pool.js';

export default pool;

