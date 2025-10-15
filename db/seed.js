// db/seed.js (ESM): seed admin and sample data
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { query } from '../src/db/pool.js';
import { fileURLToPath } from 'node:url';

async function seed() {
  const agencyName = 'Demo Agency';
  // Ensure a single Demo Agency (idempotent without requiring a unique index)
  let agencyId;
  const existingAgency = await query('SELECT id FROM agencies WHERE name = $1 LIMIT 1', [
    agencyName,
  ]);
  if (existingAgency.rows[0]?.id) {
    agencyId = existingAgency.rows[0].id;
  } else {
    const inserted = await query(
      'INSERT INTO agencies (name) VALUES ($1) RETURNING id',
      [agencyName]
    );
    agencyId = inserted.rows[0]?.id;
  }

  const adminEmail = config.SEED_ADMIN_EMAIL;
  const adminPassword = config.SEED_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Upsert admin for idempotency
  await query(
    'INSERT INTO users (email, password_hash, agency_id, is_admin) VALUES ($1, $2, $3, true)\n     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = true, agency_id = EXCLUDED.agency_id',
    [adminEmail, passwordHash, agencyId]
  );

  const campaignName = 'Demo Campaign';
  let campaignId;
  const existingCampaign = await query(
    'SELECT id FROM campaigns WHERE name = $1 AND agency_id = $2 LIMIT 1',
    [campaignName, agencyId]
  );
  if (existingCampaign.rows[0]?.id) {
    campaignId = existingCampaign.rows[0].id;
  } else {
    const insertedCampaign = await query(
      'INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [agencyId, campaignName, 'active']
    );
    campaignId = insertedCampaign.rows[0]?.id;
  }

  const statusHistory = JSON.stringify([
    { status: 'new', timestamp: new Date().toISOString() },
  ]);
  const anyLead = await query('SELECT 1 FROM leads WHERE campaign_id = $1 LIMIT 1', [
    campaignId,
  ]);
  if (anyLead.rowCount === 0) {
    await query(
      'INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1, $2, $3, $4, $5, $6)',
      [campaignId, 'John Doe', 'john@example.com', '555-1234', 'new', statusHistory]
    );
  }

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

export { seed };
export default { seed };
