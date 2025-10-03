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
    tbody.innerHTML = `<tr><td colspan="5"><div class="loading-spinner" role="status" aria-label="Loading campaigns"></div></td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="5">No campaigns available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  campaigns.forEach((campaign) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${safeGet(campaign, ["name"], "—")}</td>
      <td>${safeGet(campaign, ["audience"], "—")}</td>
      <td>${renderStatus(safeGet(campaign, ["status"], "Unknown"))}</td>
      <td>${formatNumber(safeGet(campaign, ["sent"], "—"))}</td>
      <td>${formatPercentage(safeGet(campaign, ["openRate"], safeGet(campaign, ["open_rate"], "—")))}</td>
    `;
    tbody.appendChild(row);
  });
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
