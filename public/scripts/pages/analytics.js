import { Chart } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.esm.js';
import { initCommon, checkAuth, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    initCommon();
    await renderAnalytics();
  } catch (error) {
    // checkAuth redirects on failure
  }
});

let chartInstance = null;

async function renderAnalytics() {
  const canvas = document.getElementById("analyticsChart");
  const placeholder = document.getElementById("analyticsPlaceholder");
  const errorEl = document.getElementById("analyticsError");

  if (!canvas || !canvas.getContext) {
    showError(errorEl, "Analytics require a modern browser with canvas support.");
    return;
  }

  if (placeholder) {
    placeholder.innerHTML = '<div class="loading-spinner" role="status" aria-label="Loading analytics"></div>';
  }
  hideError(errorEl);

  try {
    const res = await fetch("/api/analytics", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch analytics");

    const data = await res.json();
    const labels = safeGet(data, ['labels'], ['A', 'B', 'C']);
    const values = safeGet(data, ['values'], [5, 10, 3]);

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: safeGet(data, ['datasetLabel'], 'Engagement'),
            data: values,
            backgroundColor: '#3b82f6',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            ticks: {
              precision: 0,
            },
          },
        },
      },
    });

    if (placeholder) {
      placeholder.classList.remove('loading-state');
      placeholder.textContent = 'Showing engagement for the last period.';
    }
  } catch (error) {
    showError(errorEl, "Unable to load analytics right now.");
    if (placeholder) {
      placeholder.classList.remove('loading-state');
      placeholder.textContent = 'Analytics unavailable.';
    }
    showToast("Unable to load analytics", true);
  }
}

function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError(errorEl) {
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}
