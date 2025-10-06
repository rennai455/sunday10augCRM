#!/usr/bin/env node
import { pool, withTransaction } from '../src/db/pool.js';
import { scoreLead } from '../src/utils/leadScoring.js';

async function main() {
  const startedAt = new Date();
  console.log(`[backfillLeadScores] Starting at ${startedAt.toISOString()}`);

  try {
    const res = await pool.query('SELECT id, email FROM leads WHERE score IS NULL ORDER BY id');
    const rows = res.rows || [];
    console.log(`[backfillLeadScores] Found ${rows.length} leads with NULL score`);

    if (rows.length === 0) {
      await pool.end();
      console.log('[backfillLeadScores] Nothing to do.');
      return;
    }

    const updates = rows.map((r) => {
      const email = typeof r.email === 'string' ? r.email : null;
      const { score, reasons } = scoreLead({ email, website: null, painPoint: null });
      if (Array.isArray(reasons) && reasons.length) {
        console.log(`[backfillLeadScores] id=${r.id} score=${score} reasons=${reasons.join('; ')}`);
      } else {
        console.log(`[backfillLeadScores] id=${r.id} score=${score}`);
      }
      return { id: r.id, score: Number.isFinite(score) ? score : null };
    });

    let updated = 0;
    await withTransaction(async (client) => {
      for (const u of updates) {
        await client.query('UPDATE leads SET score = $1 WHERE id = $2', [u.score, u.id]);
        updated++;
      }
    });

    console.log(`[backfillLeadScores] Updated ${updated} leads.`);
  } catch (err) {
    console.error('[backfillLeadScores] ERROR:', err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
    console.log(`[backfillLeadScores] Finished at ${new Date().toISOString()}`);
  }
}

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Top-level await wrapper
  await main();
}

