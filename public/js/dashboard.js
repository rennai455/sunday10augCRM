document.addEventListener('DOMContentLoaded', function () {
    // Check authentication
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/Login.html';
        return;
    }

    // Load campaigns if API is available
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
    })
    .catch(() => {
        // Ignore API errors for demo
    });

    // Additional dashboard functionality can be added here
});

// Global functions that HTML might call
window.showSection = function(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('[id$="-section"]');
    sections.forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show the requested section
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // Update nav active states
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // This would need more sophisticated logic to match nav items to sections
};

window.logout = function() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('rememberEmail');
    window.location.href = '/Login.html';
};

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
};

window.handleNewCampaign = function(event) {
    event.preventDefault();
    // Handle new campaign form submission
    alert('Campaign creation functionality would be implemented here');
};

window.exportTableToCSV = function() {
    alert('CSV export functionality would be implemented here');
};

window.exportTableToPDF = function() {
    alert('PDF export functionality would be implemented here');
};

window.showAddClientModal = function() {
    const modal = document.getElementById('add-client-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
};

window.hideAddClientModal = function() {
    const modal = document.getElementById('add-client-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

window.addNewClient = function(event) {
    event.preventDefault();
    // Handle add client form submission
    alert('Client addition functionality would be implemented here');
    hideAddClientModal();
};

window.filterCampaigns = function() {
    // Handle campaign filtering
    const searchTerm = document.getElementById('campaignSearch').value.toLowerCase();
    // Implementation would filter the campaigns table
};

window.copyApiKey = function() {
    // Handle API key copying
    alert('API key copied to clipboard');
};

window.saveSettings = function() {
    // Handle settings save
    alert('Settings saved successfully');
};