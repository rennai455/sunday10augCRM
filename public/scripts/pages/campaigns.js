import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    await loadCampaigns();
  } catch (error) {
    // checkAuth redirects on failure
  }
});

async function loadCampaigns() {
  const tbody = document.getElementById("campaignsTableBody");
  const errorEl = document.getElementById("campaignsError");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="loading-spinner" role="status" aria-label="Loading campaigns"></div></td></tr>`;
  }
  hideError(errorEl);

  try {
    const res = await fetch("/api/campaigns", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch campaigns");

    const payload = await res.json();
    const campaigns = Array.isArray(payload?.campaigns)
      ? payload.campaigns
      : Array.isArray(payload)
      ? payload
      : [];

    renderCampaigns(campaigns);
  } catch (error) {
    renderCampaigns([]);
    showError(errorEl, "Unable to load campaigns right now.");
    showToast("Unable to load campaigns", true);
  }
}

function renderCampaigns(campaigns) {
  const tbody = document.getElementById("campaignsTableBody");
  if (!tbody) return;

  if (!campaigns.length) {
    tbody.innerHTML = `<tr><td colspan="6">No campaigns available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  campaigns.forEach((campaign) => {
    tbody.appendChild(renderCampaignRow(campaign));
  });
}

function renderCampaignRow(campaign) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${safeGet(campaign, ["name"], "—")}</td>
    <td>${safeGet(campaign, ["audience"], "—")}</td>
    <td>${renderStatus(safeGet(campaign, ["status"], "Unknown"))}</td>
    <td>${formatNumber(safeGet(campaign, ["sent"], "—"))}</td>
    <td>${formatPercentage(safeGet(campaign, ["openRate"], safeGet(campaign, ["open_rate"], "—")))}</td>
    <td><button class="btn-clone" data-id="${campaign.id}">Clone</button></td>
  `;
  const btn = row.querySelector('.btn-clone');
  btn.addEventListener('click', async () => {
    const defaultName = `${safeGet(campaign, ["name"], "Campaign")} (Clone)`;
    const newName = prompt('Enter name for cloned campaign', defaultName);
    if (!newName) return;
    const cloneLeads = confirm('Also copy leads?');
    await cloneCampaign(campaign.id, newName, cloneLeads);
  });
  return row;
}

async function cloneCampaign(campaignId, name, cloneLeads) {
  try {
    const token = await fetchCsrfToken();
    const res = await fetch(`/api/campaigns/${campaignId}/clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token || ''
      },
      credentials: 'include',
      body: JSON.stringify({ name, cloneLeads })
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast('Campaign cloned');
      await loadCampaigns();
    } else {
      showToast(result?.error || 'Clone failed', true);
    }
  } catch (err) {
    console.error(err);
    showToast('Clone error', true);
  }
}

async function fetchCsrfToken() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    const data = await res.json();
    return data?.csrfToken || '';
  } catch { return ''; }
}

function renderStatus(status) {
  if (!status) return "—";
  const slug = String(status).toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="status-chip ${slug}">${status}</span>`;
}

function formatNumber(value) {
  if (typeof value !== "number") return value ?? "—";
  return value.toLocaleString();
}

function formatPercentage(value) {
  if (typeof value === "number") return `${Math.round(value)}%`;
  return value ?? "—";
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
