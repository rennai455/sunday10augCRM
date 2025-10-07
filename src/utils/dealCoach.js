// dealCoach.js: simple rules-based next-step suggestions for leads

/**
 * Suggest a next step for a lead based on score, status, keywords, and recent activity.
 * @param {object} lead - lead object with fields like score, status, is_client/isClient, keywords
 * @param {Array<object>} timeline - events ordered by created_at DESC (most recent first)
 * @returns {{ suggestion: string, reason: string }}
 */
export function suggestNextStep(lead = {}, timeline = []) {
  const score = Number(lead.score ?? 0);
  const status = String(lead.status ?? '').toLowerCase();
  const isClient = Boolean(lead.isClient || lead.is_client);

  // If already a client
  if (isClient) {
    return {
      suggestion: 'Already converted',
      reason: 'Lead is marked as client',
    };
  }

  // High-fit lead
  if (score > 40) {
    return {
      suggestion: 'Offer strategy session',
      reason: 'High-fit lead (score > 40) and not a client',
    };
  }

  // Inactivity check for new leads
  if (status === 'new') {
    const latest = timeline?.[0];
    let daysSince = Infinity;
    if (latest?.created_at || latest?.createdAt) {
      const ts = new Date(latest.created_at || latest.createdAt).getTime();
      if (!Number.isNaN(ts)) {
        daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      }
    }
    if (daysSince >= 3) {
      return {
        suggestion: 'Follow up immediately',
        reason: 'No activity in 3+ days for a new lead',
      };
    }
  }

  // If last action was enrichment and there are no manual updates after
  const last = timeline?.[0];
  if (last && String(last.type || '').toLowerCase() === 'enriched') {
    return {
      suggestion: 'Review and qualify',
      reason: 'Lead was enriched recently but not yet reviewed',
    };
  }

  // Default nurturing step
  return {
    suggestion: 'Send value-based content',
    reason: 'Keep nurturing until stronger intent signals appear',
  };
}

export default { suggestNextStep };

