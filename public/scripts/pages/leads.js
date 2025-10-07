import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

let allLeads = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    await setupImportUI();
    setupLeadFiltersUI();
    await loadLeads();
  } catch (error) {
    // checkAuth handles redirect
  }
});

async function loadLeads() {
  const tbody = document.getElementById("leadsTableBody");
  const errorEl = document.getElementById("leadsError");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-spinner" role="status" aria-label="Loading leads"></div></td></tr>`;
  }
  hideError(errorEl);

  try {
    const res = await fetch("/api/leads", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch leads");

    const payload = await res.json();
    const leads = Array.isArray(payload?.leads)
      ? payload.leads
      : Array.isArray(payload)
      ? payload
      : [];

    allLeads = leads;
    applyFilters();
  } catch (error) {
    allLeads = [];
    renderLeads([]);
    showError(errorEl, "Unable to load leads right now.");
    showToast("Unable to load leads", true);
  }
}

function applyFilters() {
  const searchEl = document.getElementById('searchInput');
  const statusEl = document.getElementById('statusFilter');
  const scoreEl = document.getElementById('scoreFilter');

  const term = (searchEl?.value || '').trim().toLowerCase();
  const status = (statusEl?.value || '').trim().toLowerCase();
  const scoreSel = (scoreEl?.value || '').trim();

  let threshold = null;
  if (scoreSel === '>20') threshold = 20;
  if (scoreSel === '>40') threshold = 40;

  const filtered = (allLeads || []).filter((lead) => {
    // Search by name/email/company (case-insensitive)
    if (term) {
      const name = String(lead.name || '').toLowerCase();
      const email = String(lead.email || '').toLowerCase();
      const company = String(lead.company || '').toLowerCase();
      if (!(name.includes(term) || email.includes(term) || company.includes(term))) {
        return false;
      }
    }
    // Status filter
    if (status) {
      const st = String(lead.status || '').toLowerCase();
      // Special mapping for Client badge: consider isClient too
      if (status === 'client') {
        const isClient = Boolean(lead.isClient || lead.is_client);
        if (!isClient && st !== 'client') return false;
      } else if (st !== status) {
        return false;
      }
    }
    // Score threshold
    if (threshold != null) {
      const sc = Number(lead.score);
      if (!Number.isFinite(sc) || sc <= threshold) return false;
    }
    return true;
  });

  renderLeads(filtered);
}

function setupLeadFiltersUI() {
  const searchEl = document.getElementById('searchInput');
  const statusEl = document.getElementById('statusFilter');
  const scoreEl = document.getElementById('scoreFilter');
  const resetBtn = document.getElementById('resetFilters');

  if (searchEl) searchEl.addEventListener('input', applyFilters);
  if (statusEl) statusEl.addEventListener('change', applyFilters);
  if (scoreEl) scoreEl.addEventListener('change', applyFilters);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchEl) searchEl.value = '';
      if (statusEl) statusEl.value = '';
      if (scoreEl) scoreEl.value = '';
      applyFilters();
    });
  }
}

function renderLeads(leads) {
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="8">No leads available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  leads.forEach((lead) => {
    const row = document.createElement("tr");
    const scoreVal = safeGet(lead, ["score"], null);
    const isClient = !!lead.isClient || !!lead.is_client;
    row.innerHTML = `
      <td>${safeGet(lead, ["name"], "—")}</td>
      <td>${safeGet(lead, ["company"], "—")}</td>
      <td>${renderStatus(safeGet(lead, ["status"], "Unknown"))}</td>
      <td>${renderScore(scoreVal)}</td>
      <td>${renderClientCell(lead.id, isClient)}</td>
      <td>${escapeHtml(String(lead.website || ''))}</td>
      <td>${renderKeywords(lead.keywords)}</td>
    `;
    // Next step suggestion cell with async fetch
    const suggestionCell = document.createElement('td');
    suggestionCell.textContent = '…';
    row.appendChild(suggestionCell);
    tbody.appendChild(row);
    attachClientToggle(row);

    // Fetch suggestion asynchronously and update the cell with Apply button
    fetchSuggestion(lead.id)
      .then((obj) => {
        const suggestion = obj?.suggestion;
        if (!suggestion) {
          suggestionCell.textContent = '—';
          return;
        }
        suggestionCell.innerHTML = `
          <span class="coach-suggestion">${escapeHtml(String(suggestion))}
            <button class="apply-suggestion small-button" data-lead-id="${lead.id}" data-message="${escapeHtml(String(suggestion))}">Apply</button>
          </span>`;
        const btn = suggestionCell.querySelector('.apply-suggestion');
        btn?.addEventListener('click', async (e) => {
          const b = e.currentTarget;
          const leadId = b.getAttribute('data-lead-id');
          const message = b.getAttribute('data-message');
          b.disabled = true;
          try {
            const csrf = await fetchCsrfToken();
            const res = await fetch(`/api/leads/${leadId}/events`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrf || ''
              },
              credentials: 'include',
              body: JSON.stringify({ type: 'followup', message })
            });
            if (!res.ok) throw new Error('Failed to apply suggestion');
            showToast('Suggestion logged');
            b.textContent = 'Done';
          } catch (err) {
            showToast('Error applying suggestion', true);
            b.disabled = false;
          }
        });
      })
      .catch(() => { suggestionCell.textContent = '—'; });
  });
}

async function fetchSuggestion(leadId) {
  try {
    const res = await fetch(`/api/leads/${leadId}/suggestion`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json(); // { suggestion, reason }
  } catch {
    return null;
  }
}

function renderStatus(status) {
  if (!status) return "—";
  const slug = String(status).toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="status-chip ${slug}">${status}</span>`;
}

function renderScore(score) {
  if (typeof score !== "number" || isNaN(score)) return "—";
  const level = scoreLevel(score);
  const color =
    level === "high" ? "#16a34a" : // green-600
    level === "medium" ? "#f59e0b" : // amber-500
    "#dc2626"; // red-600
  const textColor = "#fff";
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return `<span class="score-badge ${level}" style="display:inline-block;min-width:2.25rem;text-align:center;padding:2px 6px;border-radius:9999px;background:${color};color:${textColor};font-weight:600;" aria-label="${label} score">${score}</span>`;
}

function scoreLevel(score) {
  if (score > 40) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function renderClientCell(id, isClient) {
  const badge = isClient
    ? `<span class="client-badge" style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#16a34a;color:#fff;font-weight:600">Client</span>`
    : '';
  const toggleLabel = isClient ? 'Unmark' : 'Mark as Client';
  const toggleTitle = isClient ? 'Unmark this lead as a client' : 'Mark this lead as a client';
  const btnStyle = `padding:4px 8px;border-radius:8px;border:1px solid rgba(17,24,39,.15);background:#fff;cursor:pointer;font-weight:600`;
  return `
    <div style="display:flex;gap:.5rem;align-items:center">
      ${badge}
      <button type="button" class="client-toggle" data-id="${id}" data-next="${isClient ? 'false' : 'true'}" title="${toggleTitle}" style="${btnStyle}">${toggleLabel}</button>
    </div>
  `;
}

function attachClientToggle(scope) {
  const btn = scope.querySelector('.client-toggle');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    const id = e.currentTarget.getAttribute('data-id');
    const next = e.currentTarget.getAttribute('data-next') === 'true';
    try {
      const token = await fetchCsrfToken();
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token || '' },
        credentials: 'include',
        body: JSON.stringify({ isClient: next })
      });
      if (!res.ok) throw new Error('Failed to update');
      showToast(next ? 'Marked as client' : 'Unmarked as client');
      await loadLeads();
    } catch (err) {
      console.warn('Update isClient failed', err);
      showToast('Failed to update client status', true);
    }
  });
}

function renderKeywords(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) return '';
  return keywords
    .slice(0, 3)
    .map((kw) => `<span class="badge-sm">${escapeHtml(String(kw))}</span>`)
    .join(' ');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function setupImportUI() {
  const btn = document.getElementById("importCsvBtn");
  const input = document.getElementById("importCsvInput");
  const select = document.getElementById("importCampaignSelect");
  if (!btn || !input || !select) return;

  await populateCampaigns(select);

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { items, errors } = parseCsvToLeads(text, Number(select.value));
      showCsvErrors(errors);
      if (items.length === 0) {
        showToast("No valid rows to import", true);
        return;
      }
      const token = await fetchCsrfToken();
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token || ''
        },
        credentials: 'include',
        body: JSON.stringify({ items, triggerDrip: false })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(payload?.error || 'Import failed', true);
        return;
      }
      const inserted = payload?.inserted ?? payload?.count ?? 0;
      showToast(`Imported ${inserted} lead(s)`);
      // Show backend-reported errors if any
      if (Array.isArray(payload?.errors) && payload.errors.length) {
        showCsvErrors(payload.errors.map((e) => ({ line: undefined, message: e.message || String(e) })));
      }
      await loadLeads();
    } catch (err) {
      console.warn('CSV import error', err);
      showToast('CSV import error', true);
    } finally {
      // reset input to allow re-selecting same file
      input.value = '';
    }
  });
}

async function populateCampaigns(select) {
  try {
    const res = await fetch('/api/campaigns?page=1&pageSize=100&sort=updated_at&order=desc', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load campaigns');
    const data = await res.json();
    const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
    select.innerHTML = '';
    campaigns.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = `${c.name} (#${c.id})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.warn('Failed to populate campaigns', err);
    select.innerHTML = '<option value="">(no campaigns)</option>';
  }
}

function parseCsvToLeads(text, campaignId) {
  const errors = [];
  const items = [];
  if (!text || !campaignId) {
    if (!campaignId) errors.push({ line: undefined, message: 'Select a campaign before importing.' });
    return { items, errors };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { items, errors };
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (k) => header.indexOf(k);
  const iName = idx('name');
  const iEmail = idx('email');
  const iScore = idx('score');
  const iPhone = idx('phone');
  const iStatus = idx('status');
  const iWebsite = idx('website');
  const iPainPoint = idx('painpoint');
  if (iName === -1 || iEmail === -1) {
    errors.push({ line: 1, message: 'CSV header must include name,email' });
    return { items, errors };
  }
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    const cols = raw.split(',');
    const name = (cols[iName] || '').trim();
    const email = (cols[iEmail] || '').trim();
    if (!name || !email) {
      errors.push({ line: r + 1, message: 'Missing name or email' });
      continue;
    }
    const scoreRaw = iScore >= 0 ? cols[iScore] : '';
    const score = scoreRaw && !isNaN(Number(scoreRaw)) ? Number(scoreRaw) : undefined;
    const phone = iPhone >= 0 ? (cols[iPhone] || '').trim() : undefined;
    const status = iStatus >= 0 ? (cols[iStatus] || '').trim() : undefined;
    const website = iWebsite >= 0 ? (cols[iWebsite] || '').trim() : undefined;
    const painPoint = iPainPoint >= 0 ? (cols[iPainPoint] || '').trim() : undefined;
    items.push({ campaign_id: campaignId, name, email, phone, status, score, website, painPoint });
  }
  return { items, errors };
}

async function fetchCsrfToken() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    const data = await res.json();
    return data?.csrfToken || '';
  } catch (err) {
    return '';
  }
}

function showCsvErrors(list) {
  const el = document.getElementById('importErrors');
  if (!el) return;
  if (!Array.isArray(list) || list.length === 0) { el.innerHTML = ''; return; }
  const lines = list.map((e) => `<li>Row ${e.line ?? '?'}: ${escapeHtml(String(e.message || e))}</li>`).join('');
  el.innerHTML = `<ul class="error-items" style="color:#dc2626;margin:0;padding-left:1.25rem">${lines}</ul>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError(errorEl) {
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}
