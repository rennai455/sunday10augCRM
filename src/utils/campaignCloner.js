// Utilities to clone campaigns and optionally their leads

/**
 * Clone a campaign into a new one within the same agency.
 * @param {import('pg').PoolClient} client - pg client within a transaction
 * @param {number} agencyId - current agency scope
 * @param {number|string} sourceCampaignId - campaign to clone from
 * @param {{ name: string, cloneLeads?: boolean }} opts
 * @returns {Promise<{ newCampaignId: number, leadsCopied: number }>} result
 */
export async function cloneCampaign(client, agencyId, sourceCampaignId, opts = {}) {
  const srcId = Number(sourceCampaignId);
  if (!Number.isFinite(srcId)) throw new Error('Invalid source campaign id');
  const name = String(opts.name || '').trim();
  if (!name) throw new Error('New campaign name is required');

  const src = await client.query(
    `SELECT id, agency_id, name, status, details
       FROM campaigns
      WHERE id = $1 AND agency_id = $2`,
    [srcId, agencyId]
  );
  if (src.rowCount === 0) throw new Error('Campaign not found in this agency');
  const source = src.rows[0];

  const ins = await client.query(
    `INSERT INTO campaigns (agency_id, name, status, details)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [agencyId, name, source.status || 'active', source.details || null]
  );
  const newCampaignId = ins.rows[0].id;

  let leadsCopied = 0;
  if (opts.cloneLeads) {
    const copy = await client.query(
      `INSERT INTO leads (
         campaign_id, name, email, phone, status,
         score, is_client, status_history,
         website, keywords, enriched_at, website_found,
         source, utm_medium, utm_source, utm_campaign, utm_term, utm_content, converted_at
       )
       SELECT $1, name, email, phone, status,
              score, is_client, status_history,
              website, keywords, enriched_at, website_found,
              source, utm_medium, utm_source, utm_campaign, utm_term, utm_content, converted_at
         FROM leads WHERE campaign_id = $2`,
      [newCampaignId, srcId]
    );
    leadsCopied = copy.rowCount || 0;

    // Add a bulk event for all new leads
    await client.query(
      `INSERT INTO lead_events (lead_id, type, message, metadata)
       SELECT l.id, 'campaign', 'Lead cloned from campaign', jsonb_build_object('fromCampaignId', $1)
         FROM leads l WHERE l.campaign_id = $2`,
      [srcId, newCampaignId]
    );
  }

  return { newCampaignId, leadsCopied };
}

export default { cloneCampaign };

