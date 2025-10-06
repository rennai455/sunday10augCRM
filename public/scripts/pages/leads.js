import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    await loadLeads();
  } catch (error) {
    // checkAuth handles redirect
  }
});

async function loadLeads() {
  const tbody = document.getElementById("leadsTableBody");
  const errorEl = document.getElementById("leadsError");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="loading-spinner" role="status" aria-label="Loading leads"></div></td></tr>`;
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

    renderLeads(leads);
  } catch (error) {
    renderLeads([]);
    showError(errorEl, "Unable to load leads right now.");
    showToast("Unable to load leads", true);
  }
}

function renderLeads(leads) {
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="4">No leads available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  leads.forEach((lead) => {
    const row = document.createElement("tr");
    const scoreVal = safeGet(lead, ["score"], null);
    row.innerHTML = `
      <td>${safeGet(lead, ["name"], "—")}</td>
      <td>${safeGet(lead, ["company"], "—")}</td>
      <td>${renderStatus(safeGet(lead, ["status"], "Unknown"))}</td>
      <td>${renderScore(scoreVal)}</td>
    `;
    tbody.appendChild(row);
  });
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
