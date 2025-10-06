import crypto from 'node:crypto';
import { pool } from './db/pool.js';

function hashPayload(payload) {
  if (!payload) return null;
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(str).digest('hex');
  } catch {
    return null;
  }
}

async function recordAudit(req, action, payload) {
  try {
    const payloadHash = hashPayload(payload);
    const userId = req.userId || null;
    const agencyId = req.agencyId || null;
    const ip = req.ip || null;
    const userAgent = req.get ? req.get('user-agent') : null;
    const reqId = req.id || null;

    await pool.query(
      'INSERT INTO audit_log (req_id, user_id, agency_id, action, payload_hash, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [reqId, userId, agencyId, action, payloadHash, ip, userAgent]
    );
  } catch (err) {
    // Do not fail the request path if audit logging fails
    req.log?.warn({ err }, 'Audit log insert failed');
  }
}

export { recordAudit };
export default { recordAudit };
