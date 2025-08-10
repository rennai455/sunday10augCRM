// db/run-migrations.js: runs schema.sql
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Migrations applied.');
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
