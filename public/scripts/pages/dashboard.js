// public/scripts/pages/dashboard.js

document.addEventListener('DOMContentLoaded', () => {
  hydrateUser();
  hydrateMetrics();
  hydrateTable();
  wireActions();
});

function hydrateUser() {
  document.querySelector('.agency').textContent = 'Demo Agency';
  document.querySelector('.email').textContent = 'admin@renn.ai';
}

function hydrateMetrics() {
  document.getElementById('totalLeads').textContent = '1,205';
  document.getElementById('totalCampaigns').textContent = '5';
  document.getElementById('averageScore').textContent = '12';
  document.getElementById('activeClients').textContent = '8';
}

function hydrateTable() {
  const campaigns = [
    {
      id: 1,
      client: 'John Doe',
      status: 'active',
      leads: 20,
      started: '2025-09-25',
    },
    {
      id: 2,
      client: 'Acme Corp',
      status: 'paused',
      leads: 12,
      started: '2025-09-20',
    },
    {
      id: 3,
      client: 'Beta LLC',
      status: 'draft',
      leads: 5,
      started: '2025-09-15',
    },
  ];

  const tbody = document.getElementById('campaignTable');
  tbody.innerHTML = '';

  campaigns.forEach((c) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${c.id}</td>
      <td>${c.client}</td>
      <td>${c.status}</td>
      <td>${c.leads}</td>
      <td>${c.started}</td>
    `;
    tbody.appendChild(row);
  });
}

function wireActions() {
  document.getElementById('searchCampaigns').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#campaignTable tr');

    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(q)
        ? ''
        : 'none';
    });
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    alert('CSV export triggered (mock)');
  });

  document.getElementById('exportPdfBtn').addEventListener('click', () => {
    alert('PDF export triggered (mock)');
  });

  document.getElementById('signOutBtn').addEventListener('click', () => {
    alert('Sign out (mock)');
  });

  document.getElementById('newCampaignBtn').addEventListener('click', () => {
    alert('New campaign (mock)');
  });
}
