/**
 * leadTimeline.js: Structured per-lead activity logging
 *
 * Exports a helper to append timeline events into the `lead_timeline` table.
 * The function accepts any object that implements `query(sql, params)` —
 * either a pg Pool or a Client (useful inside transactions).
 */

/**
 * Record a timeline event for a lead.
 *
 * @param {{ query: Function }} db - pg Pool or Client with a `query` method
 * @param {number|string} leadId - ID of the lead (matches `leads.id`)
 * @param {string} type - Event type (e.g., 'status_change', 'score_update', 'conversion', 'manual_update')
 * @param {object} context - Arbitrary JSON-serializable metadata for the event
 * @returns {Promise<boolean>} true if inserted, false otherwise
 */
export async function recordTimelineEvent(db, leadId, type, context = {}) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('recordTimelineEvent: invalid db (expected object with query)');
  }
  if (!leadId) {
    throw new Error('recordTimelineEvent: leadId is required');
  }
  if (!type || typeof type !== 'string') {
    throw new Error('recordTimelineEvent: type is required (string)');
  }
  const ctx = context && typeof context === 'object' ? context : {};
  try {
    await db.query(
      `INSERT INTO lead_timeline (lead_id, type, context) VALUES ($1, $2, $3)`,
      [leadId, type, JSON.stringify(ctx)]
    );
    return true;
  } catch (err) {
    // Non-fatal: timeline logging should not break request flow.
    // Callers may choose to ignore the return value or handle it.
    // eslint-disable-next-line no-console
    console.warn('recordTimelineEvent: failed to insert timeline event', {
      leadId,
      type,
      err: err?.message || err,
    });
    return false;
  }
}

export default { recordTimelineEvent };

