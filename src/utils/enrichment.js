import fetch from 'node-fetch';

const commonFreeDomains = ['gmail.com', 'yahoo.com', 'outlook.com'];

export async function enrichLead({ email, company }) {
  const website = await inferWebsite(email, company);
  const keywords = await fetchKeywordsFromWebsite(website);
  const isFreeEmail = commonFreeDomains.some(d => email.endsWith(d));
  const domain = email.split('@')[1];

  return {
    website,
    website_found: !!website,
    keywords: keywords || [],
    email_type: isFreeEmail ? 'free' : 'branded',
    domain
  };
}

async function inferWebsite(email, company) {
  if (!email) return null;
  const domain = email.split('@')[1];
  if (commonFreeDomains.includes(domain)) {
    if (!company) return null;
    const query = encodeURIComponent(`${company} site.com`);
    const res = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json`);
    const data = await res.json();
    return data?.RelatedTopics?.[0]?.FirstURL || null;
  }
  return `https://${domain}`;
}

async function fetchKeywordsFromWebsite(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const matches = [...text.matchAll(/<meta.*?keywords.*?content="(.*?)"/gi)];
    return matches[0]?.[1]?.split(',').map(k => k.trim()).slice(0, 5);
  } catch {
    return null;
  }
}

export default { enrichLead };

