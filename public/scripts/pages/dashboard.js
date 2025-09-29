(function initDashboardPage() {
  function createCustomEvent(name, detail) {
    if (typeof window.CustomEvent === 'function') {
      return new window.CustomEvent(name, { detail: detail });
    }
    var e = document.createEvent('Event');
    e.initEvent(name, true, true);
    e.detail = detail;
    return e;
  }
  var metrics = {
    totalCampaigns: document.getElementById('totalCampaigns'),
    totalLeads: document.getElementById('totalLeads'),
    averageScore: document.getElementById('averageScore'),
    activeClients: document.getElementById('activeClients'),
  };
  var campaignTable = document.getElementById('campaignTable');
  var searchInput = document.getElementById('searchCampaigns');
  var sidebarAgency = document.getElementById('sidebarAgency');
  var sidebarEmail = document.getElementById('sidebarEmail');
  var welcomeMessage = document.getElementById('welcomeMessage');
  var campaignError = document.getElementById('campaignError');
  var signOutBtn = document.getElementById('signOutBtn');
  var toggleDarkModeBtn = document.getElementById('toggleDarkMode');
  var newCampaignBtn = document.getElementById('newCampaignBtn');
  var exportCsvBtn = document.getElementById('exportCsvBtn');
  var exportPdfBtn = document.getElementById('exportPdfBtn');

  var campaignData = [];

  function setMetricValue(id, value) {
    var el = metrics[id];
    if (!el) return;
    var output =
      value === null || value === undefined || value === '' ? '—' : value;
    el.textContent = output;
  }

  function renderCampaignRows(rows) {
    if (!campaignTable) return;
    campaignTable.innerHTML = '';
    if (campaignError) campaignError.style.display = 'none';
    if (!rows || rows.length === 0) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 5;
      emptyCell.textContent = 'No campaigns available yet.';
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = '24px';
      emptyRow.appendChild(emptyCell);
      campaignTable.appendChild(emptyRow);
      return;
    }
    rows.forEach(function (campaign) {
      var tr = document.createElement('tr');

      var idCell = document.createElement('td');
      idCell.textContent = campaign.id || '—';
      tr.appendChild(idCell);

      var clientCell = document.createElement('td');
      clientCell.textContent = campaign.client || campaign.client_name || '—';
      tr.appendChild(clientCell);

      var statusCell = document.createElement('td');
      statusCell.textContent = campaign.status || '—';
      statusCell.title = statusCell.textContent;
      tr.appendChild(statusCell);

      var leadsCell = document.createElement('td');
      leadsCell.textContent =
        typeof campaign.leads === 'number' ? String(campaign.leads) : '—';
      tr.appendChild(leadsCell);

      var startedCell = document.createElement('td');
      if (campaign.started_at) {
        var date = new Date(campaign.started_at);
        startedCell.textContent = isNaN(date.getTime())
          ? '—'
          : date.toLocaleDateString();
      } else if (campaign.created_at) {
        var created = new Date(campaign.created_at);
        startedCell.textContent = isNaN(created.getTime())
          ? '—'
          : created.toLocaleDateString();
      } else {
        startedCell.textContent = '—';
      }
      tr.appendChild(startedCell);

      campaignTable.appendChild(tr);
    });
  }

  function filterCampaigns(query) {
    if (!query) {
      renderCampaignRows(campaignData);
      return;
    }
    var lower = query.toLowerCase();
    var filtered = campaignData.filter(function (campaign) {
      var values = [
        campaign.id,
        campaign.client,
        campaign.client_name,
        campaign.status,
      ];
      return values.some(function (value) {
        if (!value) return false;
        return String(value).toLowerCase().indexOf(lower) !== -1;
      });
    });
    renderCampaignRows(filtered);
  }

  function fetchProfile() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then(function (response) {
        if (response.status === 401) {
          window.location.href = '/Login.html';
          return null;
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.success) return;
        if (sidebarAgency)
          sidebarAgency.textContent = data.agency || 'Demo Agency';
        if (sidebarEmail)
          sidebarEmail.textContent = data.email || 'demo@renn.ai';
        if (welcomeMessage) {
          welcomeMessage.textContent =
            'Welcome back, ' + (data.email || 'admin@renn.ai');
        }
      })
      .catch(function () {
        // silent fail – placeholders remain
      });
  }

  function fetchDashboardData() {
    return fetch('/api/dashboard', { credentials: 'include' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Dashboard endpoint unavailable');
        }
        return response.json();
      })
      .then(function (payload) {
        var totals = payload && payload.totals ? payload.totals : {};
        setMetricValue('totalCampaigns', totals.campaigns);
        setMetricValue('totalLeads', totals.leads);
        setMetricValue('averageScore', totals.averageScore);
        setMetricValue('activeClients', totals.activeClients);

        campaignData = Array.isArray(payload && payload.recentCampaigns)
          ? payload.recentCampaigns
          : [];
        renderCampaignRows(campaignData);
        if (campaignError && campaignData.length === 0) {
          campaignError.style.display = 'none';
        }
      })
      .catch(function () {
        campaignData = [];
        renderCampaignRows(campaignData);
        Object.keys(metrics).forEach(function (key) {
          setMetricValue(key, null);
        });
        if (campaignError) {
          campaignError.style.display = 'block';
        }
      });
  }

  function handleSignOut() {
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
      .catch(function () {
        // ignore network errors during logout
      })
      .finally(function () {
        window.location.href = '/Login.html';
      });
  }

  function wireEvents() {
    if (searchInput) {
      searchInput.addEventListener('input', function (event) {
        filterCampaigns(event.target.value);
      });
    }
    if (signOutBtn) {
      signOutBtn.addEventListener('click', handleSignOut);
    }
    if (toggleDarkModeBtn) {
      toggleDarkModeBtn.addEventListener('click', function () {
        document.body.classList.toggle('dark');
      });
    }
    if (newCampaignBtn) {
      newCampaignBtn.addEventListener('click', function () {
        window.dispatchEvent(createCustomEvent('dashboard:new-campaign'));
      });
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', function () {
        window.dispatchEvent(
          createCustomEvent('dashboard:export', { format: 'csv' })
        );
      });
    }
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', function () {
        window.dispatchEvent(
          createCustomEvent('dashboard:export', { format: 'pdf' })
        );
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireEvents();
    fetchProfile();
    fetchDashboardData();
  });
})();
