const DEFAULT_DASHBOARD_PATH = "/dashboard.html";
const THEME_STORAGE_KEY = 'darkMode';

export async function checkAuth() {
  const path = window.location.pathname.toLowerCase();
  if (path === '/login.html') return null;

  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error('Not logged in');

    const data = await res.json();
    hydrateUser(data);
    return data;
  } catch (error) {
    window.location.href = '/login.html';
    throw error;
  }
}

export function initCommon() {
  applySavedTheme();
  hydrateUserPlaceholders();
  setupNavHighlight();
  wireCommonActions();
}

export function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function safeGet(obj, path, fallback = '—') {
  return path.reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    const value = acc[key];
    return value === undefined || value === null ? undefined : value;
  }, obj) ?? fallback;
}

export function setDarkModeEnabled(enabled) {
  if (enabled) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, String(enabled));
  } catch (error) {
    // ignore storage issues
  }
}

export function isDarkModeEnabled() {
  return document.body.classList.contains('dark');
}

function hydrateUser(data) {
  setTextContent('sidebarAgency', safeGet(data, ['agency'], 'Unknown Agency'));
  setTextContent('sidebarEmail', safeGet(data, ['email'], 'unknown@domain.com'));
  setTextContent('welcomeMessage', `Welcome, ${safeGet(data, ['role'], 'user')}`);
}

function hydrateUserPlaceholders() {
  setTextContent('sidebarAgency', 'Demo Agency', true);
  setTextContent('sidebarEmail', 'demo@renn.ai', true);
  const welcomeEl = document.getElementById('welcomeMessage');
  if (welcomeEl && !welcomeEl.textContent.trim()) {
    welcomeEl.textContent = 'Welcome';
  }
}

function setupNavHighlight() {
  const currentPath = normalizePath(window.location.pathname);
  const links = document.querySelectorAll('.nav-links a[data-path]');

  links.forEach((link) => {
    const linkPath = normalizePath(link.dataset.path || '');
    link.classList.toggle('active', linkPath === currentPath);
  });
}

function wireCommonActions() {
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } finally {
        window.location.href = '/login.html';
      }
    });
  }
}

function applySavedTheme() {
  let storedPreference = null;
  try {
    storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    storedPreference = null;
  }

  if (storedPreference === 'true') {
    document.body.classList.add('dark');
  } else if (storedPreference === 'false') {
    document.body.classList.remove('dark');
  }
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return DEFAULT_DASHBOARD_PATH;
  return pathname;
}

function setTextContent(id, value, onlyIfEmpty = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (onlyIfEmpty && el.textContent.trim()) return;
  el.textContent = value;
}
