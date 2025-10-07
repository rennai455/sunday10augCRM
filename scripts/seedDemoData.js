#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db/pool.js';
import { scoreLead } from '../src/utils/leadScoring.js';

async function main() {
  const summary = {
    agencies: 0,
    campaignsInserted: 0,
    campaignsSkipped: 0,
    usersInserted: 0,
    usersSkipped: 0,
    leadsInserted: 0,
    leadsSkipped: 0,
  };

  console.log('[seedDemoData] Seeding demo data...');

  try {
    await withTransaction(async (client) => {
      // 1) Ensure a demo agency exists
      const agencyName = 'Demo Agency';
      const agency = await fetchOrCreateAgency(client, agencyName);
      if (agency.justCreated) summary.agencies += 1;

      // 2) Users (admin + viewers)
      const users = [
        { email: 'admin@renn.ai', password: 'secure123', is_admin: true },
        { email: 'analyst@demoagency.com', password: 'demo12345', is_admin: false },
        { email: 'viewer@demoagency.com', password: 'demo12345', is_admin: false },
      ];
      for (const u of users) {
        const ok = await upsertUser(client, agency.id, u);
        ok ? summary.usersInserted++ : summary.usersSkipped++;
      }

      // 3) Campaigns
      const campaignsSeed = [
        { name: 'Local SEO Boost', status: 'active', details: { budget: 1500, channel: 'SEO' } },
        { name: 'PPC Accelerator', status: 'active', details: { budget: 3500, channel: 'PPC' } },
        { name: 'Social Growth', status: 'paused', details: { budget: 800, channel: 'Social' } },
      ];
      const campaignIds = [];
      for (const c of campaignsSeed) {
        const cid = await upsertCampaign(client, agency.id, c);
        if (cid.inserted) summary.campaignsInserted++; else summary.campaignsSkipped++;
        campaignIds.push(cid.id);
      }

      // 4) Leads (20+ spread across campaigns)
      const names = [
        'Ava Thompson','Liam Johnson','Sophia Martinez','Noah Williams','Mia Brown','Ethan Davis','Isabella Miller','Lucas Wilson','Emma Moore','Mason Taylor',
        'Olivia Anderson','James Thomas','Charlotte Jackson','Benjamin White','Amelia Harris','Elijah Martin','Harper Thompson','Henry Garcia','Evelyn Martinez','Michael Clark',
        'Scarlett Lewis','Alexander Lee','Aria Walker','Daniel Hall'
      ];
      const companies = ['Northstar Media','Bluefin Consulting','Acme Dental','Horizon Plumbing','Peak Fitness','Lighthouse Realty','Urban Eats','GreenScape Lawncare'];
      const domains = ['northstar.media','bluefin.co','acme.dental','horizonplumb.com','peakfit.io','lighthouserealty.com','urbaneats.co','greenscapelawn.com'];
      const painPoints = [
        'Need more clients and growth in Q4',
        'Lead generation is slow; need more leads',
        'Looking for steady clients from Google Maps',
        'Scaling PPC and improving conversions',
        'Grow inbound leads from local search',
      ];
      const statuses = ['new','contacted','in_progress','qualified'];

      // Randomly mark 4–5 of the demo leads as clients
      const totalLeads = names.length;
      const markCount = 4 + Math.floor(Math.random() * 2); // 4 or 5
      const clientPicks = new Set();
      while (clientPicks.size < markCount) {
        clientPicks.add(Math.floor(Math.random() * totalLeads));
      }

      let i = 0;
      for (const name of names) {
        const companyIdx = i % companies.length;
        const company = companies[companyIdx];
        const domain = domains[companyIdx];
        const email = `${name.toLowerCase().replace(/\s+/g,'')}@${i % 3 === 0 ? 'gmail.com' : domain}`;
        const phone = `555-01${String(100 + i).slice(-3)}`;
        const status = statuses[i % statuses.length];
        const campaign_id = campaignIds[i % campaignIds.length];
        const painPoint = painPoints[i % painPoints.length];

        const { score } = scoreLead({ email, website: null, painPoint });
        const isClient = clientPicks.has(i);

        const ok = await upsertLead(client, { campaign_id, name, email, phone, status, score, isClient });
        ok ? summary.leadsInserted++ : summary.leadsSkipped++;
        i++;
      }
    });

    console.log('[seedDemoData] Done. Summary:');
    console.log(`  Agencies created:  ${summary.agencies}`);
    console.log(`  Campaigns inserted/skipped: ${summary.campaignsInserted}/${summary.campaignsSkipped}`);
    console.log(`  Users inserted/skipped:     ${summary.usersInserted}/${summary.usersSkipped}`);
    console.log(`  Leads inserted/skipped:     ${summary.leadsInserted}/${summary.leadsSkipped}`);
  } catch (err) {
    console.error('[seedDemoData] Error:', err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

async function fetchOrCreateAgency(client, name) {
  const existing = await client.query('SELECT id FROM agencies WHERE name = $1 LIMIT 1', [name]);
  if (existing.rowCount > 0) return { id: existing.rows[0].id, justCreated: false };
  const ins = await client.query('INSERT INTO agencies(name) VALUES ($1) RETURNING id', [name]);
  return { id: ins.rows[0].id, justCreated: true };
}

async function upsertUser(client, agencyId, { email, password, is_admin }) {
  // bcrypt hash
  const hash = await bcrypt.hash(password, 10);
  const res = await client.query(
    `INSERT INTO users(email, password_hash, agency_id, is_admin)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, agencyId, !!is_admin]
  );
  return res.rowCount > 0;
}

async function upsertCampaign(client, agencyId, { name, status, details }) {
  const existing = await client.query(
    'SELECT id FROM campaigns WHERE agency_id = $1 AND name = $2 LIMIT 1',
    [agencyId, name]
  );
  if (existing.rowCount > 0) return { id: existing.rows[0].id, inserted: false };
  const ins = await client.query(
    `INSERT INTO campaigns(agency_id, name, status, details)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [agencyId, name, status || 'active', details || null]
  );
  return { id: ins.rows[0].id, inserted: true };
}

async function upsertLead(client, { campaign_id, name, email, phone, status, score, isClient }) {
  // Treat (campaign_id, email) as natural unique for demo dedupe
  const exists = await client.query(
    'SELECT id FROM leads WHERE campaign_id = $1 AND email = $2 LIMIT 1',
    [campaign_id, email]
  );
  if (exists.rowCount > 0) return false;
  await client.query(
    `INSERT INTO leads (campaign_id, name, email, phone, status, score, is_client, status_history)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      campaign_id,
      name || null,
      email || null,
      phone || null,
      status || null,
      Number.isFinite(score) ? score : null,
      Boolean(isClient),
      JSON.stringify([]),
    ]
  );
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
