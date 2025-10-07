// leadEnrichment.js: helpers for lightweight lead website enrichment

const DEFAULT_PATTERNS = [
  'agency',
  'studio',
  'marketing',
  'growth',
  'consult',
  'consulting',
  'digital',
  'media',
  'seo',
  'ppc',
  'ads',
  'web',
  'brand',
  'branding',
];

export function extractDomain(email) {
  if (!email || typeof email !== 'string') return '';
  const raw = email.trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at === -1) return '';
  // best-effort strip angle brackets or trailing punctuation
  let domain = raw.slice(at + 1).replace(/[>),;]+$/g, '').trim();
  if (!domain.includes('.')) return '';
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

function extractKeywordsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const found = new Set();
  try {
    const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '';
    const metaKeywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] || '';
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] || '';

    const rawList = [];
    if (metaKeywordsMatch?.[1]) rawList.push(...metaKeywordsMatch[1].split(',').map((s) => s.trim()));
    // basic phrase scanning from title/descriptions using default patterns
    const blob = [title, ogTitle, metaDescMatch?.[1] || '', ogDesc]
      .join(' ')
      .toLowerCase();
    DEFAULT_PATTERNS.forEach((p) => {
      if (blob.includes(p)) found.add(p);
    });
    rawList.forEach((k) => { if (k) found.add(k.toLowerCase()); });
  } catch {
    // ignore parse issues
  }
  return Array.from(found);
}

export async function fetchSiteMeta(domain) {
  if (!domain) return { websiteFound: false, keywords: [] };
  const base = `https://${domain}`;
  // HEAD probe
  try {
    const head = await fetchWithTimeout(base, { method: 'HEAD' }, 5000);
    if (head.ok) {
      // try to get minimal HTML if possible to extract keywords
      try {
        const getRes = await fetchWithTimeout(base, { method: 'GET', headers: { Accept: 'text/html' } }, 6000);
        if (getRes.ok && (getRes.headers.get('content-type') || '').includes('text/html')) {
          const html = await getRes.text();
          return { websiteFound: true, keywords: extractKeywordsFromHtml(html) };
        }
      } catch {}
      return { websiteFound: true, keywords: [] };
    }
  } catch {}
  // GET fallback
  try {
    const res = await fetchWithTimeout(base, { method: 'GET', headers: { Accept: 'text/html' } }, 7000);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = await res.text();
        return { websiteFound: true, keywords: extractKeywordsFromHtml(html) };
      }
      return { websiteFound: true, keywords: [] };
    }
  } catch {}
  return { websiteFound: false, keywords: [] };
}

export function keywordHeuristics(domain, patterns = DEFAULT_PATTERNS) {
  const out = new Set();
  const lower = (domain || '').toLowerCase();
  patterns.forEach((p) => { if (lower.includes(p)) out.add(p); });
  return Array.from(out);
}

export function combineKeywords(a = [], b = []) {
  const set = new Set();
  [a, b].forEach((arr) => {
    (arr || []).forEach((k) => {
      const norm = String(k || '').trim().toLowerCase();
      if (norm) set.add(norm);
    });
  });
  return Array.from(set);
}

export default { extractDomain, fetchSiteMeta, keywordHeuristics, combineKeywords };

// High-level enrichment helper for routes/scripts
export async function enrichLead(lead = {}) {
  const email = lead.email || '';
  const domain = extractDomain(email);
  if (!domain) return { enrichedDomain: '', websiteFound: false, keywords: [] };
  const baseKw = keywordHeuristics(domain);
  const { websiteFound, keywords } = await fetchSiteMeta(domain);
  const all = combineKeywords(baseKw, keywords);
  return { enrichedDomain: domain, websiteFound, keywords: all };
}
