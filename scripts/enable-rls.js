#!/usr/bin/env node
// Enable RLS with tenant isolation. Requires PG_ENABLE_RLS=true
// and sets policies to use a session variable app.current_agency_id
const db = require('../src/db/pool');
const config = require('../config');

async function main() {
  if (!config.PG_ENABLE_RLS) {
    console.log('PG_ENABLE_RLS is false; skipping RLS enable.');
    process.exit(0);
  }
  // Enable RLS on tables
  const sql = `
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

    -- Replace permissive policies with tenant-aware checks; keep simple for now
    DROP POLICY IF EXISTS campaigns_isolation ON campaigns;
    CREATE POLICY campaigns_isolation ON campaigns
      USING (agency_id::text = current_setting('app.current_agency_id', true))
      WITH CHECK (agency_id::text = current_setting('app.current_agency_id', true));

    DROP POLICY IF EXISTS leads_isolation ON leads;
    CREATE POLICY leads_isolation ON leads
      USING (
        campaign_id IN (
          SELECT id FROM campaigns WHERE agency_id::text = current_setting('app.current_agency_id', true)
        )
      )
      WITH CHECK (
        campaign_id IN (
          SELECT id FROM campaigns WHERE agency_id::text = current_setting('app.current_agency_id', true)
        )
      );
  `;

  try {
    await db.query(sql);
    console.log('RLS enabled and policies applied. Remember to SET app.current_agency_id per session.');
  } catch (e) {
    console.error('Failed to enable RLS:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

