import { pool } from '../db/pool.js';

/**
 * Add a new event to a lead's event stream.
 * @param {number} leadId
 * @param {'created'|'status'|'score'|'enriched'|'note'|'email'|'campaign'} type
 * @param {string} message
 * @param {object} [metadata]
 */
export async function addLeadEvent(leadId, type, message, metadata = {}) {
  await pool.query(
    `INSERT INTO lead_events (lead_id, type, message, metadata)
     VALUES ($1, $2, $3, $4)`,
    [leadId, type, message, metadata]
  );
}

export async function getLeadTimeline(leadId) {
  const res = await pool.query(
    `SELECT * FROM lead_events
      WHERE lead_id = $1
      ORDER BY created_at DESC`,
    [leadId]
  );
  return res.rows;
}

export default { addLeadEvent, getLeadTimeline };

