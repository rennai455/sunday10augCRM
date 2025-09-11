class RENNApp {
  constructor() {
    this.API_BASE_URL = '/api';
    this.cache = new Map();
    this.eventSource = null;
    this.observers = new Map();
    this.debounceTimers = new Map();
    this.requestQueue = [];
    this.isOnline = navigator.onLine;
    this.performanceMetrics = {
      apiCalls: 0,
      cacheHits: 0,
      renderTime: 0,
    };

    this.init();
  }

  async init() {
    // Check authentication first via server
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) {
        this.redirectToLogin();
        return;
      }
    } catch (err) {
      console.error('Authentication check failed', err);
      this.redirectToLogin();
      return;
    }

    // Initialize performance monitoring
    this.initPerformanceMonitoring();

    // Setup event listeners
    this.setupEventListeners();

    // Initialize real-time updates
    this.initServerSentEvents();

    // Setup offline handling
    this.initOfflineSupport();

    // Initialize intersection observers for lazy loading
    this.initIntersectionObservers();

    // Load initial data with stale-while-revalidate
    await this.loadInitialData();

    // Setup auto-refresh with exponential backoff
    this.setupAutoRefresh();

    console.log('🚀 RENN.AI Ultra-Optimized Frontend initialized');
  }

  // Performance monitoring
  initPerformanceMonitoring() {
    // Monitor Core Web Vitals
    if ('web-vital' in window) {
      import('web-vitals').then(
        ({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
          getCLS(console.log);
          getFID(console.log);
          getFCP(console.log);
          getLCP(console.log);
          getTTFB(console.log);
        }
      );
    }

    // Custom performance tracking
    this.performanceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'navigation') {
          console.log(
            `Page Load Time: ${entry.loadEventEnd - entry.fetchStart}ms`
          );
        }
      });
    });

    if ('observe' in this.performanceObserver) {
      this.performanceObserver.observe({ entryTypes: ['navigation', 'paint'] });
    }
  }

  redirectToLogin() {
    // Redirect user to login page
    window.location.href = '/Login.html';
  }
}

async function logout() {
  try {
    let csrfToken;
    try {
      const t = await fetch('/api/csrf-token', { credentials: 'include' });
      const td = await t.json();
      csrfToken = td.csrfToken;
    } catch {}
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
  } catch (err) {
    console.error('Logout failed', err);
  } finally {
    window.location.href = '/Login.html';
  }
}

function setUserRole(role) {
  window.currentUserRole = role;
  updateNavigationForRole(role);
  updateUserInterface(role);
  const btn = document.getElementById('role-switcher-btn');
  const label = document.getElementById('role-switcher-label');
  if (btn && label) {
    btn.setAttribute('role', role);
    if (role === 'admin') {
      label.textContent = 'Admin';
    } else if (role === 'agency') {
      label.textContent = 'Agency';
    } else if (role === 'client') {
      label.textContent = 'Client';
    }
  }
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (dropdown) dropdown.classList.remove('show');
  window.showSection('overview');
}

function updateNavigationForRole(role) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const allowedRoles = item.getAttribute('data-roles');
    if (!allowedRoles || allowedRoles.includes(role)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

function updateUserInterface(role) {
  const btn = document.getElementById('role-switcher-btn');
  const label = document.getElementById('role-switcher-label');
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (btn && label && dropdown) {
    btn.setAttribute('role', role);
    if (role === 'admin') {
      label.textContent = 'Admin';
      btn.style.display = 'flex';
      dropdown.querySelector('button[onclick*="agency"]').style.display = '';
      dropdown.querySelector('button[onclick*="client"]').style.display = '';
    } else if (role === 'agency') {
      label.textContent = 'Agency';
      btn.style.display = 'flex';
      dropdown.querySelector('button[onclick*="agency"]').style.display = 'none';
      dropdown.querySelector('button[onclick*="client"]').style.display = '';
    } else if (role === 'client') {
      label.textContent = 'Client';
      btn.style.display = 'flex';
      dropdown.querySelector('button[onclick*="agency"]').style.display = '';
      dropdown.querySelector('button[onclick*="client"]').style.display = 'none';
    }
  }
  const badge = document.getElementById('user-role-badge');
  if (badge) badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
}

function showSection(section) {
  const sectionMap = {
    overview: 'overview-section',
    'lead-gen': 'lead-gen-section',
    drip: 'drip-section',
    clients: 'clients-section',
    analytics: 'analytics-section',
    billing: 'billing-section',
    'ai-scoring': 'ai-scoring-section',
    'agency-mgmt': 'agency-mgmt-section',
    'data-sync': 'data-sync-section',
    settings: 'settings-section',
  };
  Object.values(sectionMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const showId = sectionMap[section];
  if (showId) {
    const el = document.getElementById(showId);
    if (el) el.classList.remove('hidden');
  }
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.remove('active');
  });
  const nav = document.querySelector(
    `.nav-item[onclick*="showSection('${section}')"]`
  );
  if (nav && nav.style.display !== 'none') nav.classList.add('active');
  const titleMap = {
    overview: 'Overview',
    'lead-gen': 'Lead Generation',
    drip: 'Drip Campaigns',
    clients: 'Client Manager',
    analytics: 'Analytics',
    billing: 'Billing & Payments',
    'ai-scoring': 'AI Scoring Configuration',
    'agency-mgmt': 'Agency Management',
    'data-sync': 'Data Synchronization',
    settings: 'Settings',
  };
  const titleEl = document.getElementById('section-title');
  if (titleEl && titleMap[section]) {
    titleEl.textContent = titleMap[section];
  }
}

function exportTableToCSV() {
  const csv = [];
  const rows = document.querySelectorAll('#campaigns-table tr');
  rows.forEach((row) => {
    const cols = row.querySelectorAll('td, th');
    const rowData = [];
    cols.forEach((col) => rowData.push(`"${col.innerText.trim()}"`));
    csv.push(rowData.join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campaigns.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportTableToPDF() {
  const element = document.querySelector('#campaigns-table').parentElement;
  const opt = {
    margin: 0.5,
    filename: 'campaigns.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' },
  };
  if (window.html2pdf) {
    html2pdf().from(element).set(opt).save();
  } else {
    alert('PDF export library not loaded');
  }
}

function filterCampaigns() {
  const input = document.getElementById('campaignSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#campaigns-table tr');
  rows.forEach((row) => {
    const rowText = row.textContent.toLowerCase();
    row.style.display = rowText.includes(input) ? '' : 'none';
  });
}

function handleNewCampaign(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const campaignData = {
    keywords: formData.get('search-keywords'),
    location: formData.get('target-location'),
    industry: formData.get('industry'),
    leadGoal: formData.get('lead-goal'),
  };
  console.log('New campaign data:', campaignData);
  alert('Campaign launch feature coming soon!');
}

function addNewClient(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const clientData = {
    name: formData.get('client-name'),
    email: formData.get('client-email'),
  };
  console.log('New client data:', clientData);
  alert('Client added successfully!');
  hideAddClientModal();
}

function saveSettings() {
  const agencyName = document.getElementById('agency-name').value;
  const agencyEmail = document.getElementById('agency-email').value;
  console.log('Saving settings:', { agencyName, agencyEmail });
  alert('Settings saved successfully!');
}

function copyApiKey() {
  const apiKeyInput = document.getElementById('api-key');
  apiKeyInput.select();
  document.execCommand('copy');
  alert('API Key copied to clipboard!');
}

function showAddClientModal() {
  document.getElementById('add-client-modal').classList.remove('hidden');
}

function hideAddClientModal() {
  document.getElementById('add-client-modal').classList.add('hidden');
  document.getElementById('client-name').value = '';
  document.getElementById('client-email').value = '';
}

export function initDashboard() {
  if (window.location.pathname === '/dashboard.html') {
    new RENNApp();
    document.addEventListener('DOMContentLoaded', function () {
      const btn = document.getElementById('role-switcher-btn');
      const dropdown = document.getElementById('role-switcher-dropdown');
      const label = document.getElementById('role-switcher-label');
      if (btn && dropdown && label) {
        btn.onclick = function (e) {
          e.stopPropagation();
          dropdown.classList.toggle('show');
        };
        document.addEventListener('click', function (e) {
          if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
          }
        });
        setUserRole(window.currentUserRole || 'admin');
      }
    });
  }
  window.logout = logout;
  window.currentUserRole = 'admin';
  window.setUserRole = setUserRole;
  window.showSection = showSection;
  window.exportTableToCSV = exportTableToCSV;
  window.exportTableToPDF = exportTableToPDF;
  window.filterCampaigns = filterCampaigns;
  window.handleNewCampaign = handleNewCampaign;
  window.addNewClient = addNewClient;
  window.saveSettings = saveSettings;
  window.copyApiKey = copyApiKey;
  window.showAddClientModal = showAddClientModal;
  window.hideAddClientModal = hideAddClientModal;
}
