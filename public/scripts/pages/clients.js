import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    await loadClients();
  } catch (error) {
    // checkAuth redirects on failure
  }
});

async function loadClients() {
  const grid = document.getElementById("clientsGrid");
  const errorEl = document.getElementById("clientsError");
  if (grid) {
    grid.innerHTML = '<div class="card loading-card"><div class="loading-spinner" role="status" aria-label="Loading clients"></div></div>';
  }
  hideError(errorEl);

  try {
    const res = await fetch("/api/clients", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch clients");

    const payload = await res.json();
    const clients = Array.isArray(payload?.clients)
      ? payload.clients
      : Array.isArray(payload)
      ? payload
      : [];

    renderClients(clients);
  } catch (error) {
    renderClients([]);
    showError(errorEl, "Unable to load clients right now.");
    showToast("Unable to load clients", true);
  }
}

function renderClients(clients) {
  const grid = document.getElementById("clientsGrid");
  if (!grid) return;

  if (!clients.length) {
    grid.innerHTML = '<div class="card">No clients assigned yet.</div>';
    return;
  }

  grid.innerHTML = "";
  clients.forEach((client) => {
    const card = document.createElement("article");
    card.className = "card client-card";
    card.innerHTML = `
      <h4>${safeGet(client, ["name"], "Unnamed Client")}</h4>
      <p>${safeGet(client, ["industry"], "Industry not set")}</p>
      <p>${renderStatus(safeGet(client, ["status"], "Unknown"))}</p>
    `;
    grid.appendChild(card);
  });
}

function renderStatus(status) {
  if (!status) return "Status unknown";
  const slug = String(status).toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="status-chip ${slug}">${status}</span>`;
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
