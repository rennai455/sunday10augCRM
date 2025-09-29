// dashboard.js
// All logic scoped externally — CSP compliant

document.addEventListener('DOMContentLoaded', () => {
  const metrics = {
    totalCampaigns: document.getElementById('totalCampaigns'),
    totalLeads: document.getElementById('totalLeads'),
    averageScore: document.getElementById('averageScore'),
    activeClients: document.getElementById('activeClients'),
  };

  const campaignTable = document.getElementById('campaignTable');
  const searchInput = document.getElementById('searchCampaigns');
  const campaignError = document.getElementById('campaignError');

  const avatar = document.getElementById('profileAvatar');
  const profilePanel = document.getElementById('profilePanel');
  const toggleDarkBtn = document.getElementById('toggleDarkMode');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  // === Dark Mode Toggle ===
  toggleDarkBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
  });

  // === Load theme preference ===
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  // === Toggle Profile Panel ===
  avatar?.addEventListener('click', () => {
    profilePanel?.classList.toggle('open');
  });

  // === Search Campaigns ===
  searchInput?.addEventListener('keyup', () => {
    if (!campaignTable) return;
    const search = searchInput.value.toLowerCase();
    const rows = campaignTable.querySelectorAll('tr');
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(search) ? '' : 'none';
    });
  });

  // === Export to CSV ===
  exportCsvBtn?.addEventListener('click', () => {
    if (!campaignTable) return;
    const rows = campaignTable.querySelectorAll('tr');
    const csv = [];
    rows.forEach((row) => {
      const cols = row.querySelectorAll('td, th');
      const rowData = Array.from(cols).map((col) => `"${col.innerText}"`);
      csv.push(rowData.join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'campaigns.csv';
    a.click();
  });

  // === Export to PDF ===
  exportPdfBtn?.addEventListener('click', () => {
    if (!campaignTable) return;
    import(
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ).then(() => {
      const table = campaignTable.parentElement;
      if (!table) return;
      html2pdf().from(table).save('campaigns.pdf');
    });
  });

  const hideCampaignError = () => {
    if (!campaignError) return;
    campaignError.textContent = '';
    campaignError.classList.add('hidden');
  };

  const showCampaignError = (message) => {
    if (!campaignError) return;
    campaignError.textContent = message;
    campaignError.classList.remove('hidden');
  };

  // === API: /auth/me ===
  fetch('/api/auth/me', {
    credentials: 'include',
  })
    .then((res) => {
      if (res.status === 401) window.location.href = '/Login.html';
      return res.json();
    })
    .then((user) => {
      const agencyEl = document.getElementById('sidebarAgency');
      if (agencyEl) agencyEl.textContent = user.agency;
      const emailEl = document.getElementById('sidebarEmail');
      if (emailEl) emailEl.textContent = user.email;
      const welcomeEl = document.getElementById('welcomeMessage');
      if (welcomeEl) welcomeEl.textContent = `Hello, ${user.email}`;
    })
    .catch(() => {
      // Silently fail; placeholders remain.
    });

  // === API: /dashboard ===
  fetch('/api/dashboard', {
    credentials: 'include',
  })
    .then((res) => res.json())
    .then((data) => {
      const totals = (data && data.totals) || {};
      metrics.totalCampaigns &&
        (metrics.totalCampaigns.textContent = totals.campaigns ?? '—');
      metrics.totalLeads &&
        (metrics.totalLeads.textContent = totals.leads ?? '—');
      metrics.averageScore &&
        (metrics.averageScore.textContent = totals.averageScore ?? '—');
      metrics.activeClients &&
        (metrics.activeClients.textContent = totals.activeClients ?? '—');

      if (!campaignTable) return;
      campaignTable.innerHTML = '';

      const campaigns = Array.isArray(data && data.recentCampaigns)
        ? data.recentCampaigns
        : [];
      campaigns.forEach((c) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${c.id}</td>
          <td>${c.client ?? '—'}</td>
          <td><span class="status-chip ${(c.status || '').toLowerCase()}">${c.status ?? '—'}</span></td>
          <td>${c.leads ?? '—'}</td>
          <td>${c.started_at ? new Date(c.started_at).toLocaleDateString() : '—'}</td>
        `;
        campaignTable.appendChild(row);
      });

      hideCampaignError();
    })
    .catch(() => {
      showCampaignError('⚠️ Error loading campaigns.');
    });
});
