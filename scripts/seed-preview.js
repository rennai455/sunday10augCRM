#!/usr/bin/env node
const { pool } = require('../src/db/pool');

async function main() {
  try {
    const a = await pool.query("INSERT INTO agencies (name) VALUES ('Preview Agency') ON CONFLICT DO NOTHING RETURNING id");
    const agencyId = a.rows[0]?.id || (await pool.query("SELECT id FROM agencies WHERE name='Preview Agency'"))?.rows[0]?.id;
    const c1 = await pool.query('INSERT INTO campaigns (agency_id, name, status) VALUES ($1,$2,$3) RETURNING id', [agencyId, 'Preview Camp A', 'active']);
    const c2 = await pool.query('INSERT INTO campaigns (agency_id, name, status) VALUES ($1,$2,$3) RETURNING id', [agencyId, 'Preview Camp B', 'paused']);
    const campaignId1 = c1.rows[0].id;
    const campaignId2 = c2.rows[0].id;
    await pool.query('INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6)', [campaignId1, 'Alice', 'alice@example.com', '555-1111', 'new', JSON.stringify([])]);
    await pool.query('INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6)', [campaignId1, 'Bob', 'bob@example.com', '555-2222', 'active', JSON.stringify([])]);
    await pool.query('INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6)', [campaignId2, 'Cara', 'cara@example.com', '555-3333', 'new', JSON.stringify([])]);
    console.log('Preview seed completed.');
  } catch (e) {
    console.error('Preview seed failed:', e);
    process.exit(1);
  }
}

if (require.main === module) main();

