#!/usr/bin/env node
// scripts/reactivateDormantLeads.js
// Marks leads as "reactivation" when no activity for 14 days, not clients, and not already in reactivation.
// Also sends an n8n webhook notification and logs a lead_event.

import { pool, withTransaction } from '../src/db/pool.js';

function nowIso() {
  return new Date().toISOString();
}

async function postToN8n(payload) {
  const base = process.env.N8N_URL;
  if (!base) {
    console.warn('[reactivate] N8N_URL not set; skipping webhook.');
    return false;
  }
  const url = `${base.replace(/\/$/, '')}/webhook/stale-lead`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('[reactivate] n8n webhook failed', res.status, await safeReadText(res));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[reactivate] n8n webhook error', err?.message || err);
    return false;
  }
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ''; }
}

async function findDormantLeads() {
  const { rows } = await pool.query(
    `SELECT l.id, l.email, l.name, l.status
       FROM leads l
      WHERE COALESCE(l.is_client, false) = false
        AND COALESCE(l.status, '') <> 'reactivation'
        AND NOT EXISTS (
          SELECT 1 FROM lead_events e
           WHERE e.lead_id = l.id AND e.created_at > NOW() - INTERVAL '14 days'
        )
      ORDER BY l.id`
  );
  return rows || [];
}

async function markLeadForReactivation(lead) {
  const id = lead.id;
  let updated = false;
  await withTransaction(async (client) => {
    const upd = await client.query(
      `UPDATE leads SET status = 'reactivation' WHERE id = $1 AND COALESCE(status,'') <> 'reactivation'`,
      [id]
    );
    updated = upd.rowCount > 0;
    // Insert lead_event
    await client.query(
      `INSERT INTO lead_events (lead_id, type, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [id, 'reactivation', 'Lead marked as stale after 14 days of inactivity', { at: nowIso() }]
    );
  });
  return updated;
}

async function run() {
  console.log('[reactivate] Looking for dormant leads…');
  try {
    const dormant = await findDormantLeads();
    if (dormant.length === 0) {
      console.log('[reactivate] None found.');
      return;
    }
    console.log(`[reactivate] Found ${dormant.length} lead(s).`);
    for (const lead of dormant) {
      try {
        const changed = await markLeadForReactivation(lead);
        console.log(`[reactivate] Lead ${lead.id}: status => reactivation ${changed ? '(updated)' : '(already)'} `);
        const ok = await postToN8n({
          leadId: lead.id,
          email: lead.email || null,
          name: lead.name || null,
          status: 'reactivation',
        });
        if (ok) console.log(`[reactivate] n8n notified for lead ${lead.id}`);
      } catch (err) {
        console.warn(`[reactivate] Failed for lead ${lead.id}:`, err?.message || err);
      }
    }
  } catch (err) {
    console.error('[reactivate] Fatal error:', err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}

