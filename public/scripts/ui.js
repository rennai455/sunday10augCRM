let currentUserRole = 'admin';

export function toggleDarkMode() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  const button = document.getElementById('dark-mode-toggle');
  if (button) {
    button.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }
}

export function initDarkMode() {
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark-mode');
    const button = document.getElementById('dark-mode-toggle');
    if (button) {
      button.textContent = 'Light Mode';
    }
  }
}

export function initSidebarToggle() {
  const sidebarBtn = document.getElementById('sidebar-toggle-btn');
  const fabBtn = document.getElementById('fab-sidebar-toggle-2');
  const sidebar = document.getElementById('sidebar');
  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('show');
      sidebar.classList.toggle('open');
    }
  }
  if (sidebarBtn) sidebarBtn.addEventListener('click', toggleSidebar);
  if (fabBtn) fabBtn.addEventListener('click', toggleSidebar);
}

export function setUserRole(role) {
  currentUserRole = role;
  updateNavigationForRole(role);
  updateUserInterface(role);
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (dropdown) dropdown.classList.remove('show');
  showSection('overview');
}

export function updateNavigationForRole(role) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const allowedRoles = item.getAttribute('data-roles');
    item.style.display = !allowedRoles || allowedRoles.includes(role) ? '' : 'none';
  });
}

export function updateUserInterface(role) {
  const btn = document.getElementById('role-switcher-btn');
  const label = document.getElementById('role-switcher-label');
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (btn && label && dropdown) {
    btn.setAttribute('role', role);
    if (role === 'admin') {
      label.textContent = 'Admin';
      btn.style.display = 'flex';
      dropdown.querySelector('button[data-role="agency"]').style.display = '';
      dropdown.querySelector('button[data-role="client"]').style.display = '';
    } else if (role === 'agency') {
      label.textContent = 'Agency';
      btn.style.display = 'flex';
      dropdown.querySelector('button[data-role="agency"]').style.display = 'none';
      dropdown.querySelector('button[data-role="client"]').style.display = '';
    } else if (role === 'client') {
      label.textContent = 'Client';
      btn.style.display = 'flex';
      dropdown.querySelector('button[data-role="agency"]').style.display = '';
      dropdown.querySelector('button[data-role="client"]').style.display = 'none';
    }
  }
  const badge = document.getElementById('user-role-badge');
  if (badge) badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
}

export function showSection(section) {
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
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
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

export function exportTableToCSV() {
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

export function exportTableToPDF() {
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

export function filterCampaigns() {
  const input = document.getElementById('campaignSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#campaigns-table tr');
  rows.forEach((row) => {
    const rowText = row.textContent.toLowerCase();
    row.style.display = rowText.includes(input) ? '' : 'none';
  });
}

export function handleNewCampaign(event) {
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

export function addNewClient(event) {
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

export function saveSettings() {
  const agencyName = document.getElementById('agency-name').value;
  const agencyEmail = document.getElementById('agency-email').value;
  console.log('Saving settings:', { agencyName, agencyEmail });
  alert('Settings saved successfully!');
}

export function copyApiKey() {
  const apiKeyInput = document.getElementById('api-key');
  apiKeyInput.select();
  document.execCommand('copy');
  alert('API Key copied to clipboard!');
}

export function showAddClientModal() {
  document.getElementById('add-client-modal').classList.remove('hidden');
}

export function hideAddClientModal() {
  document.getElementById('add-client-modal').classList.add('hidden');
  const nameInput = document.getElementById('client-name');
  const emailInput = document.getElementById('client-email');
  if (nameInput) nameInput.value = '';
  if (emailInput) emailInput.value = '';
}
