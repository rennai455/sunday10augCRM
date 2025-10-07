#!/usr/bin/env node
import { pool, withTransaction } from '../src/db/pool.js';
import { recordAudit } from '../src/audit.js';
import { scoreLead } from '../src/utils/leadScoring.js';

const PATTERNS = ['agency', 'studio', 'marketing', 'consult', 'growth'];

function parseDomainFromEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  // rudimentary validation
  if (!domain || !domain.includes('.')) return null;
  return domain;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function probeWebsite(domain) {
  const base = `https://${domain}`;
  try {
    // Try HEAD first
    const head = await fetchWithTimeout(base, { method: 'HEAD' }, 5000);
    if (head.ok) {
      return { found: true, html: null };
    }
  } catch {}
  try {
    const res = await fetchWithTimeout(base, { method: 'GET', headers: { 'Accept': 'text/html' } }, 7000);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = await res.text();
        return { found: true, html };
      }
      return { found: true, html: null };
    }
  } catch {}
  return { found: false, html: null };
}

function extractKeywordsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = new Set();
  try {
    const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
    const title = titleMatch ? titleMatch[1].toLowerCase() : '';
    const metaKeywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const blob = [title, metaKeywordsMatch?.[1] || '', metaDescMatch?.[1] || '', ogDescMatch?.[1] || '']
      .join(' ') 
      .toLowerCase();
    PATTERNS.forEach((p) => { if (blob.includes(p)) out.add(p); });
  } catch {}
  return Array.from(out);
}

function extractKeywordsFromDomain(domain) {
  const out = new Set();
  const lower = (domain || '').toLowerCase();
  PATTERNS.forEach((p) => { if (lower.includes(p)) out.add(p); });
  return Array.from(out);
}

function extractMetaForPrompt(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    const get = (re) => (html.match(re)?.[1] || '').trim();
    const title = get(/<title[^>]*>([^<]{0,300})<\/title>/i);
    const metaKeywords = get(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const metaDesc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const ogTitle = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const ogDesc = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const lines = [
      title && `TITLE: ${title}`,
      metaKeywords && `META KEYWORDS: ${metaKeywords}`,
      metaDesc && `META DESCRIPTION: ${metaDesc}`,
      ogTitle && `OG TITLE: ${ogTitle}`,
      ogDesc && `OG DESCRIPTION: ${ogDesc}`,
    ].filter(Boolean);
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function gptSuggestKeywordsFromMeta(metaText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];
  const prompt = `Given this company website meta:\n\n${metaText}\n\nWhat 3 keywords describe what they do? Return just a JSON array.`;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You output only valid JSON arrays of 3 concise, lowercase keywords with no commentary.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';
    // Extract first JSON array in the text
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    const jsonSlice = text.slice(start, end + 1);
    const arr = JSON.parse(jsonSlice);
    if (Array.isArray(arr)) {
      return arr.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    // ignore errors, fall back to local heuristics
  }
  return [];
}

async function processLead(row) {
  const id = row.id;
  const email = row.email;
  const currentScore = typeof row.score === 'number' ? row.score : null;
  const domain = parseDomainFromEmail(email);
  if (!domain) {
    // mark as enriched without website info
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE leads SET enriched_at = NOW() WHERE id = $1`,
        [id]
      );
    });
    console.log(`[enrich] lead ${id}: no domain`);
    return;
  }

  let websiteFound = false;
  let keywords = new Set(extractKeywordsFromDomain(domain));
  let html = null;
  try {
    const probe = await probeWebsite(domain);
    websiteFound = probe.found;
    html = probe.html;
    if (html) {
      for (const k of extractKeywordsFromHtml(html)) keywords.add(k);
    }
  } catch (err) {
    // ignore network errors; proceed to update enriched_at
  }

  // If we found the site but no keywords, optionally ask GPT for 3 keywords
  if (websiteFound && keywords.size === 0 && html && process.env.OPENAI_API_KEY) {
    const metaText = extractMetaForPrompt(html);
    const ai = await gptSuggestKeywordsFromMeta(metaText);
    ai.forEach((k) => keywords.add(k));
  }

  const keywordArr = Array.from(keywords);
  // Optionally recompute score using enrichment signals
  let newScore = null;
  try {
    if (websiteFound || keywordArr.length > 0) {
      const { score } = scoreLead({ email, keywords: keywordArr, websiteFound });
      newScore = score;
    }
  } catch {}
  const scoreToSet = Number.isFinite(newScore) && (currentScore == null || newScore > currentScore) ? newScore : null;

  let updatedRowCount = 0;
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE leads
         SET website_found = $1,
             keywords = $2,
             enriched_at = NOW(),
             score = COALESCE($3, score)
       WHERE id = $4
       RETURNING id`,
      [websiteFound, keywordArr, scoreToSet, id]
    );
    updatedRowCount = res.rowCount || 0;
  });

  console.log(`[enrich] lead ${id}: domain=${domain} found=${websiteFound} keywords=${keywordArr.join(', ')}${scoreToSet != null ? ` newScore=${scoreToSet}` : ''} updated=${updatedRowCount > 0}`);
  try {
    await recordAudit({ id: 'system' }, 'lead.enriched', {
      id,
      website: websiteFound ? domain : null,
      keywords: keywordArr,
      newScore: scoreToSet,
    });
  } catch {}
}

async function main() {
  console.log('[enrich] Starting lead enrichment...');
  try {
    const res = await pool.query(
      `SELECT id, email, score
         FROM leads
        WHERE enriched_at IS NULL AND email IS NOT NULL
        ORDER BY id`
    );
    const rows = res.rows || [];
    console.log(`[enrich] Found ${rows.length} lead(s) to enrich`);
    for (const row of rows) {
      // Process sequentially to be gentle with remote sites
      await processLead(row);
    }
    console.log('[enrich] Done.');
  } catch (err) {
    console.error('[enrich] ERROR:', err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
// scripts/enrichLeads.js

import { pool } from '../src/db/pool.js';
import {
  extractDomain,
  keywordHeuristics,
  fetchSiteMeta,
  combineKeywords
} from '../src/utils/leadEnrichment.js';

console.log('[Enrichment] Starting lead enrichment runner…');

const BATCH_SIZE = 10;

async function enrichLead(lead) {
  const { id, email } = lead;
  const domain = extractDomain(email);

  if (!domain) {
    console.warn(`[${id}] Skipping: No domain found for ${email}`);
    return null;
  }

  const baseKeywords = keywordHeuristics(domain);
  const { websiteFound, keywords: siteKeywords } = await fetchSiteMeta(domain);
  const allKeywords = combineKeywords(baseKeywords, siteKeywords);

  return {
    id,
    enrichedDomain: domain,
    keywords: allKeywords,
    websiteFound
  };
}

async function run() {
  const { rows } = await pool.query(`
    SELECT id, email
    FROM leads
    WHERE keywords IS NULL
    ORDER BY created_at DESC
    LIMIT $1
  `, [BATCH_SIZE]);

  if (!rows.length) {
    console.log('✅ No unenriched leads remaining.');
    return;
  }

  console.log(`Found ${rows.length} leads to enrich…`);

  for (const lead of rows) {
    try {
      const result = await enrichLead(lead);
      if (!result) continue;

      const { id, enrichedDomain, keywords, websiteFound } = result;

      await pool.query(`
        UPDATE leads
        SET website = $1, keywords = $2
        WHERE id = $3
      `, [websiteFound ? enrichedDomain : null, keywords, id]);

      console.log(`[${id}] ✅ Enriched with ${keywords.length} keywords`);
    } catch (err) {
      console.error(`[${lead.id}] ❌ Error enriching lead:`, err.message);
    }
  }

  console.log('🎉 Enrichment pass complete.');
  process.exit(0);
}

run();
