// public/scripts/pages/dashboard.js

import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    setupNewCampaignModal();
    wireDashboardActions();
    await loadDashboardData();
  } catch (error) {
    // checkAuth will redirect on failure
  }
});

async function loadDashboardData() {
  const tbody = document.getElementById("campaignTable");
  const errorEl = document.getElementById("campaignError");

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="loading-spinner" role="status" aria-label="Loading campaigns"></div></td></tr>`;
  }
  hideError(errorEl);
  resetMetrics();

  try {
    const res = await fetch("/api/dashboard", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch dashboard data");

    const data = await res.json();
    applyMetrics(data);
    renderCampaigns(safeGet(data, ["recentCampaigns"], []));
  } catch (error) {
    renderCampaigns([]);
    showError(errorEl, "Unable to load dashboard metrics right now.");
    showToast("Unable to load dashboard data", true);
  }
}

function applyMetrics(data = {}) {
  setMetric("totalLeads", safeGet(data, ["totals", "leads"], "—"));
  setMetric("totalCampaigns", safeGet(data, ["totals", "campaigns"], "—"));
  setMetric("averageScore", safeGet(data, ["totals", "averageScore"], "—"));
  setMetric("activeClients", safeGet(data, ["totals", "activeClients"], "—"));
  const clients = safeGet(data, ["totals", "convertedLeadCount"], "—");
  setMetric("clientsWon", clients);
  // Optional: set conversion rate tooltip
  try {
    const leads = Number(safeGet(data, ["totals", "leads"], 0));
    const won = Number(clients);
    const el = document.getElementById('clientsWon');
    if (el && Number.isFinite(leads) && leads > 0 && Number.isFinite(won)) {
      const pct = Math.round((won / leads) * 100);
      el.title = `Conversion rate: ${pct}%`;
    }
  } catch {}
}

function resetMetrics() {
  ["totalLeads", "totalCampaigns", "averageScore", "activeClients", "clientsWon"].forEach((id) => {
    setMetric(id, "—");
  });
}

function renderCampaigns(campaigns) {
  const tbody = document.getElementById("campaignTable");
  if (!tbody) return;

  if (!campaigns?.length) {
    tbody.innerHTML = `<tr><td colspan="5">No campaigns available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  campaigns.forEach((campaign) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${safeGet(campaign, ["id"], "—")}</td>
      <td>${safeGet(campaign, ["client"], "—")}</td>
      <td>${renderStatus(safeGet(campaign, ["status"], "Unknown"))}</td>
      <td>${formatNumber(safeGet(campaign, ["leads"], "—"))}</td>
      <td>${formatDate(safeGet(campaign, ["started_at"], safeGet(campaign, ["startedAt"], safeGet(campaign, ["started"], null))))}</td>
    `;
    tbody.appendChild(row);
  });
}

function wireDashboardActions() {
  const searchInput = document.getElementById("searchCampaigns");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      const query = event.target.value.toLowerCase();
      const rows = document.querySelectorAll("#campaignTable tr");

      rows.forEach((row) => {
        row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
      });
    });
  }

  const csvBtn = document.getElementById("exportCsvBtn");
  if (csvBtn) {
    csvBtn.addEventListener("click", () => {
      showToast("CSV export triggered (mock)");
    });
  }

  const pdfBtn = document.getElementById("exportPdfBtn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      showToast("PDF export triggered (mock)");
    });
  }
}

function setupNewCampaignModal() {
  const modal = document.getElementById("newCampaignModal");
  const openBtn = document.getElementById("newCampaignBtn");
  const submitBtn = document.getElementById("submitNewCampaign");
  const cancelBtn = document.getElementById("cancelNewCampaignBtn");
  const nameInput = document.getElementById("newClientName");

  if (!modal || !openBtn || !submitBtn || !cancelBtn || !nameInput) return;

  const closeModal = () => {
    modal.classList.add("hidden");
    nameInput.value = "";
    document.removeEventListener("keydown", handleKeydown);
  };

  const openModal = () => {
    modal.classList.remove("hidden");
    document.addEventListener("keydown", handleKeydown);
    nameInput.focus();
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  openBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  submitBtn.addEventListener("click", () => {
    const client = nameInput.value.trim();
    if (!client) {
      showToast("Enter a client name to start a campaign", true);
      nameInput.focus();
      return;
    }

    showToast(`Campaign for ${client} created!`);
    closeModal();
  });
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "—";
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

function formatDate(input) {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
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
