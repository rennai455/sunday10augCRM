(function initAuditPage() {
  const AUTO_REFRESH_MS = 60000;
  let refreshTimer;

  async function loadAuditEvents() {
    const params = new window.URLSearchParams();
    const actionField = document.getElementById('f-action');
    const fromField = document.getElementById('f-from');
    const toField = document.getElementById('f-to');
    const limitField = document.getElementById('f-limit');
    const action = actionField ? actionField.value.trim() : '';
    const from = fromField ? fromField.value : '';
    const to = toField ? toField.value : '';
    const limit = limitField ? limitField.value : '';

    if (action) params.set('action', action);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (limit) params.set('limit', limit);

    const target = document.getElementById('results');
    if (target) target.textContent = 'Loading...';

    try {
      const response = await fetch(`/api/audit/search?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch audit events');

      const data = await response.json();
      const rows = (data.events || [])
        .map(
          (event) =>
            `<tr><td>${new Date(event.occurred_at).toLocaleString()}</td><td>${event.action}</td></tr>`
        )
        .join('');

      if (target)
        target.innerHTML = `<table class='table'><thead><tr><th>Time</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (error) {
      console.warn('Unable to load audit results', error);
      if (target) target.textContent = 'Failed to load audit results.';
    }
  }

  function scheduleAutoRefresh() {
    clearInterval(refreshTimer);
    const checkbox = document.getElementById('f-auto');
    if (checkbox && checkbox.checked) {
      refreshTimer = setInterval(loadAuditEvents, AUTO_REFRESH_MS);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const applyButton = document.getElementById('f-apply');
    if (applyButton)
      applyButton.onclick = () => {
        loadAuditEvents();
        scheduleAutoRefresh();
      };

    const autoRefresh = document.getElementById('f-auto');
    if (autoRefresh)
      autoRefresh.onchange = () => {
        scheduleAutoRefresh();
      };

    window.addEventListener('load', () => {
      loadAuditEvents();
      scheduleAutoRefresh();
    });
  });
})();
