// db/run-migrations.js (ESM): runs migrate.sql
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../src/db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const sqlPath = path.join(__dirname, 'migrate.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await query(sql);
  console.log('Migrations applied.');
}

const isPrimaryModule = process.argv[1] === __filename;
if (isPrimaryModule) {
  runMigrations().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
