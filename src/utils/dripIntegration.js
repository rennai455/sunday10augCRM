const consoleLabel = '[DripIntegration]';

/**
 * Trigger the n8n drip campaign workflow for a newly created lead.
 *
 * @param {{ name?: string|null, email?: string|null, company?: string|null, painPoint?: string|null }} lead
 *   Lead details staged for the drip sequence. Only sends when an email is present.
 * @returns {Promise<void>}
 */
async function sendLeadToDrip(lead = {}) {
  const n8nUrl = process.env.N8N_URL;
  if (!n8nUrl) {
    console.warn(`${consoleLabel} N8N_URL is not configured; skipping drip automation.`);
    return;
  }

  if (typeof fetch !== 'function') {
    console.error(`${consoleLabel} fetch API is unavailable in this runtime; cannot call drip webhook.`);
    return;
  }

  const payload = {
    name: lead.name || null,
    email: lead.email || null,
    company: lead.company || null,
    painPoint: lead.painPoint || null,
  };

  if (!payload.email) {
    console.warn(`${consoleLabel} Lead email missing; skipping drip send for:`, payload);
    return;
  }

  const endpoint = `${n8nUrl.replace(/\/$/, '')}/webhook/new-lead`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      console.error(
        `${consoleLabel} Webhook call failed with status ${response.status}:`,
        body || await response.text()
      );
    }
  } catch (error) {
    console.error(`${consoleLabel} Failed to notify n8n drip workflow:`, error);
  }
}

async function safeReadBody(response) {
  try {
    return await response.json();
  } catch (_err) {
    return undefined;
  }
}

module.exports = { sendLeadToDrip };
