import { logout } from './api.js';
import {
  toggleDarkMode,
  initDarkMode,
  initSidebarToggle,
  setUserRole,
  showSection,
  exportTableToCSV,
  exportTableToPDF,
  filterCampaigns,
  handleNewCampaign,
  addNewClient,
  saveSettings,
  copyApiKey,
  showAddClientModal,
  hideAddClientModal,
} from './ui.js';

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

    this.initPerformanceMonitoring();
    this.setupEventListeners();
    this.initServerSentEvents();
    this.initOfflineSupport();
    this.initIntersectionObservers();
    await this.loadInitialData();
    this.setupAutoRefresh();

    console.log('🚀 RENN.AI Ultra-Optimized Frontend initialized');
  }

  initPerformanceMonitoring() {
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

    this.performanceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'navigation') {
          console.log(`Page Load Time: ${entry.loadEventEnd - entry.fetchStart}ms`);
        }
      });
    });

    if ('observe' in this.performanceObserver) {
      this.performanceObserver.observe({ entryTypes: ['navigation', 'paint'] });
    }
  }

  redirectToLogin() {
    window.location.href = '/Login.html';
  }

  setupEventListeners() {}
  initServerSentEvents() {}
  initOfflineSupport() {}
  initIntersectionObservers() {}
  async loadInitialData() {}
  setupAutoRefresh() {}
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initSidebarToggle();

  const darkModeBtn = document.getElementById('dark-mode-toggle');
  if (darkModeBtn) darkModeBtn.addEventListener('click', toggleDarkMode);

  const logoutBtn = document.getElementById('logout-button');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const roleSwitcherBtn = document.getElementById('role-switcher-btn');
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (roleSwitcherBtn && dropdown) {
    roleSwitcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!roleSwitcherBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
    dropdown.querySelectorAll('button[data-role]').forEach((btn) => {
      btn.addEventListener('click', () => setUserRole(btn.getAttribute('data-role')));
    });
    setUserRole('admin');
  }

  document.querySelectorAll('.nav-item[data-section]').forEach((item) => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });

  const searchInput = document.getElementById('campaignSearch');
  if (searchInput) searchInput.addEventListener('input', filterCampaigns);

  document.querySelectorAll('.export-csv-btn').forEach(btn => btn.addEventListener('click', exportTableToCSV));

  document.querySelectorAll('.export-pdf-btn').forEach(btn => btn.addEventListener('click', exportTableToPDF));

  const newCampaignForm = document.getElementById('new-campaign-form');
  if (newCampaignForm) newCampaignForm.addEventListener('submit', handleNewCampaign);

  const addClientForm = document.getElementById('add-client-form');
  if (addClientForm) addClientForm.addEventListener('submit', addNewClient);

  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

  const copyApiKeyBtn = document.getElementById('copy-api-key-btn');
  if (copyApiKeyBtn) copyApiKeyBtn.addEventListener('click', copyApiKey);

  const openAddClient = document.getElementById('open-add-client');
  if (openAddClient) openAddClient.addEventListener('click', showAddClientModal);

  const cancelAddClient = document.getElementById('cancel-add-client');
  if (cancelAddClient) cancelAddClient.addEventListener('click', hideAddClientModal);

  if (window.location.pathname === '/dashboard.html') {
    new RENNApp();
  }
});
