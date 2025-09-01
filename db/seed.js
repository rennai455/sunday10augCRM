// db/seed.js: seed admin and sample data
const db = require('../src/db/pool');
const bcrypt = require('bcryptjs');
const config = require('../config');

async function seed() {
  await db.query("INSERT INTO agencies (name) VALUES ($1) ON CONFLICT DO NOTHING", ['Demo Agency']);
  const agencyRes = await db.query("SELECT id FROM agencies WHERE name = $1", ['Demo Agency']);
  const agencyId = agencyRes.rows[0].id;

  const adminEmail = config.SEED_ADMIN_EMAIL;
  const adminPassword = config.SEED_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db.query(
    "INSERT INTO users (email, password_hash, agency_id, is_admin) VALUES ($1, $2, $3, true) ON CONFLICT (email) DO NOTHING",
    [adminEmail, passwordHash, agencyId]
  );

  await db.query(
    "INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [agencyId, 'Demo Campaign', 'active']
  );

  const campaignRes = await db.query("SELECT id FROM campaigns WHERE name = $1", ['Demo Campaign']);
  const campaignId = campaignRes.rows[0].id;

  await db.query(
    "INSERT INTO leads (campaign_id, name, email, phone, status) VALUES ($1, $2, $3, $4, $5)",
    [campaignId, 'John Doe', 'john@example.com', '555-1234', 'new']
  );

  console.log('Seed data inserted.');
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
