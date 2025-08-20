// db/run-migrations.js: runs migrate.sql
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migrations applied.');
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
