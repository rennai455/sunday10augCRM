// db/seed.js (ESM): seed admin and sample data
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { query } from '../src/db/pool.js';
import { fileURLToPath } from 'node:url';

async function seed() {
  await query('INSERT INTO agencies (name) VALUES ($1) ON CONFLICT DO NOTHING', [
    'Demo Agency',
  ]);
  const agencyRes = await query('SELECT id FROM agencies WHERE name = $1', [
    'Demo Agency',
  ]);
  const agencyId = agencyRes.rows[0]?.id;

  const adminEmail = config.SEED_ADMIN_EMAIL;
  const adminPassword = config.SEED_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Upsert admin for idempotency
  await query(
    'INSERT INTO users (email, password_hash, agency_id, is_admin) VALUES ($1, $2, $3, true)\n     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = true, agency_id = EXCLUDED.agency_id',
    [adminEmail, passwordHash, agencyId]
  );

  await query(
    'INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [agencyId, 'Demo Campaign', 'active']
  );

  const campaignRes = await query('SELECT id FROM campaigns WHERE name = $1', [
    'Demo Campaign',
  ]);
  const campaignId = campaignRes.rows[0]?.id;

  const statusHistory = JSON.stringify([
    { status: 'new', timestamp: new Date().toISOString() },
  ]);
  await query(
    'INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1, $2, $3, $4, $5, $6)',
    [campaignId, 'John Doe', 'john@example.com', '555-1234', 'new', statusHistory]
  );

  console.log('Seed data inserted.');
}

const __filename = fileURLToPath(import.meta.url);
const isPrimaryModule = process.argv[1] === __filename;
if (isPrimaryModule) {
  seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
