export function detectSourceFromReferer(req) {
  try {
    const ref = (req.get('referer') || req.get('referrer') || '').toLowerCase();
    const ua = (req.get('user-agent') || '').toLowerCase();
    if (!ref) return 'direct';
    if (ref.includes('linkedin')) return 'linkedin';
    if (ref.includes('facebook') || ref.includes('fb.')) return 'facebook';
    if (ref.includes('twitter') || ref.includes('t.co')) return 'twitter';
    if (ref.includes('instagram')) return 'instagram';
    if (ref.includes('google') || ref.includes('bing') || ref.includes('yahoo')) return 'search';
    if (ref.includes('utm_medium=paid') || ref.includes('utm_medium=cpc')) return 'ad';
    if (ua.includes('mail') || ref.includes('mail') || ref.includes('mailchimp')) return 'email';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export default { detectSourceFromReferer };

