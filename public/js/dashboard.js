document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/Login.html';
        return;
    }

    fetch('/api/campaigns', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const tbody = document.getElementById('campaigns-table');
        if (tbody && data.campaigns && data.campaigns.length > 0) {
            tbody.innerHTML = data.campaigns.map(c => `
                <tr>
                    <td>${c.name}</td>
                    <td>${c.status}</td>
                    <td>${c.leads}</td>
                    <td>${c.started_at}</td>
                </tr>
            `).join('');
        }
    });

    fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                window.location.href = '/Login.html';
            } else {
                const roleElem = document.getElementById('user-role');
                const dashboardSection = document.getElementById('dashboard-section');
                if (roleElem) {
                    roleElem.textContent = `Role: ${data.role || 'admin'}`;
                }
                if (dashboardSection) {
                    dashboardSection.innerHTML = `<div class='card'><h2 class='card__title'>Hello, ${data.email}</h2><p>Agency: ${data.agency || 'N/A'}</p></div>`;
                }
            }
        })
        .catch(() => window.location.href = '/Login.html');

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', function () {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    const fabToggleBtn = document.getElementById('fab-sidebar-toggle-2');
    if (fabToggleBtn) {
        fabToggleBtn.addEventListener('click', function () {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    const navDashboard = document.getElementById('nav-dashboard');
    if (navDashboard) {
        navDashboard.addEventListener('click', function () {
            document.getElementById('dashboard-section').innerHTML = `<div class='card'><h2 class='card__title'>Dashboard</h2><p>Overview of your campaigns and leads.</p></div>`;
        });
    }

    const navCampaigns = document.getElementById('nav-campaigns');
    if (navCampaigns) {
        navCampaigns.addEventListener('click', function () {
            document.getElementById('dashboard-section').innerHTML = `<div class='card'><h2 class='card__title'>Campaigns</h2><p>List of campaigns will appear here.</p></div>`;
        });
    }

    const navLeads = document.getElementById('nav-leads');
    if (navLeads) {
        navLeads.addEventListener('click', function () {
            document.getElementById('dashboard-section').innerHTML = `<div class='card'><h2 class='card__title'>Leads</h2><p>List of leads will appear here.</p></div>`;
        });
    }

    const navSettings = document.getElementById('nav-settings');
    if (navSettings) {
        navSettings.addEventListener('click', function () {
            document.getElementById('dashboard-section').innerHTML = `<div class='card'><h2 class='card__title'>Settings</h2><p>Settings form will appear here.</p></div>`;
        });
    }

    window.showAddClientModal = function () {
        document.getElementById('add-client-modal').classList.remove('hidden');
    };
    window.hideAddClientModal = function () {
        document.getElementById('add-client-modal').classList.add('hidden');
    };
    const addClientForm = document.getElementById('add-client-form');
    if (addClientForm) {
        addClientForm.addEventListener('submit', function (e) {
            e.preventDefault();
            window.hideAddClientModal();
        });
    }

    window.logout = function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            .then(() => window.location.href = '/Login.html');
    };
});
