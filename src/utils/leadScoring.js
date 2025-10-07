// leadScoring.js: simple heuristic lead scoring
// Input: { email, website, painPoint? }
// Output: { score: number, reasons: string[] }

const FREE_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'yandex.com',
];

function getEmailDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

function isCustomDomain(domain) {
  if (!domain) return false;
  return !FREE_EMAIL_PROVIDERS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function scoreLead(lead = {}) {
  let score = 0;
  const reasons = [];

  const email = (lead.email || '').toString().trim().toLowerCase();
  const website = (lead.website || '').toString().trim().toLowerCase();
  const pain = (lead.painPoint || '').toString().trim().toLowerCase();

  // +30: custom email domain
  const domain = getEmailDomain(email);
  if (domain && isCustomDomain(domain)) {
    score += 30;
    reasons.push('Custom email domain');
  }

  // +20: Google business presence in website
  if (website && (website.includes('google.com/maps') || website.includes('g.page'))) {
    score += 20;
    reasons.push('Google business presence (Maps link)');
  }

  // +10: pain point keywords
  const KEYWORDS = ['growth', 'leads', 'clients'];
  const matched = KEYWORDS.filter((k) => pain.includes(k));
  if (matched.length > 0) {
    score += 10;
    reasons.push(`Pain point mentions: ${matched.join(', ')}`);
  }

  // Keyword-based signals from enrichment
  const kws = Array.isArray(lead.keywords) ? lead.keywords.map((k) => String(k).toLowerCase()) : [];
  if (kws.length) {
    if (kws.some((k) => ['growth', 'marketing', 'ads'].includes(k))) {
      score += 10;
      reasons.push('Marketing keywords');
    }
    if (kws.some((k) => ['seo', 'crm', 'funnels'].includes(k))) {
      score += 5;
      reasons.push('Tech-savvy keywords');
    }
  }

  // Cap at 100
  if (score > 100) score = 100;

  return { score, reasons };
}

export { scoreLead };
export default { scoreLead };
