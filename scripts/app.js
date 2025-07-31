// Check authentication
        if (!localStorage.getItem('isAuthenticated')) {
            window.location.href = '/login.html';
        }

        // Navigation
        function showSection(section) {
            // Hide all sections
            document.querySelectorAll('[id$="-section"]').forEach(s => s.classList.add('hidden'));
            
            // Show selected section
            document.getElementById(section + '-section').classList.remove('hidden');
            
            // Update active nav
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            event.target.closest('.nav-item').classList.add('active');
            
            // Update title
            const titles = {
                'overview': 'Overview',
                'lead-gen': 'Lead Generation',
                'drip': 'Drip Campaigns',
                'clients': 'Client Manager',
                'analytics': 'Analytics',
                'settings': 'Settings'
            };
            document.getElementById('section-title').textContent = titles[section] || 'Dashboard';
            
            // Close mobile menu
            document.getElementById('sidebar').classList.remove('open');
        }

        // Mobile menu toggle
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        // Logout
        function logout() {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('userEmail');
            window.location.href = '/login.html';
        }

        // Load dashboard data
        async function loadDashboardData() {
            try {
                // Simulate API call with demo data
                const stats = {
                    total_campaigns: 8,
                    total_leads: 142,
                    average_score: 62,
                    recent_campaigns: [
                        {
                            campaign_id: "RENN_20240101_ABC123",
                            status: "active",
                            total_leads: 42,
                            started_at: "2024-01-01T10:00:00Z"
                        },
                        {
                            campaign_id: "RENN_20231215_DEF456",
                            status: "completed",
                            total_leads: 75,
                            started_at: "2023-12-15T09:30:00Z"
                        },
                        {
                            campaign_id: "RENN_20231201_GHI789",
                            status: "completed",
                            total_leads: 25,
                            started_at: "2023-12-01T14:15:00Z"
                        }
                    ]
                };

                // Update stats
                document.getElementById('total-campaigns').textContent = stats.total_campaigns || 0;
                document.getElementById('total-leads').textContent = stats.total_leads || 0;
                document.getElementById('avg-score').textContent = stats.average_score || 0;

                // Update campaigns table
                const campaignsTable = document.getElementById('campaigns-table');
                if (stats.recent_campaigns && stats.recent_campaigns.length > 0) {
                    campaignsTable.innerHTML = stats.recent_campaigns.map(campaign => `
                        <tr class="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer">
                            <td class="py-3 px-4">
                                <span class="font-medium text-black">${campaign.campaign_id}</span>
                            </td>
                            <td class="py-3 px-4 text-gray-600">Client #${campaign.campaign_id.slice(-5)}</td>
                            <td class="py-3 px-4">
                                <span class="px-2 py-1 ${
                                    campaign.status === 'completed' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-yellow-100 text-yellow-800'
                                } text-xs rounded-full">
                                    ${campaign.status}
                                </span>
                            </td>
                            <td class="py-3 px-4 text-gray-600">${campaign.total_leads || 0}</td>
                            <td class="py-3 px-4 text-gray-600">
                                ${new Date(campaign.started_at).toLocaleDateString()}
                            </td>
                        </tr>
                    `).join('');
                } else {
                    campaignsTable.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center py-8 text-gray-500">
                                No campaigns yet. Click "New Campaign" to get started!
                            </td>
                        </tr>
                    `;
                }

                // Initialize analytics chart
                const ctx = document.getElementById('analytics-chart');
                if (ctx) {
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                            datasets: [{
                                label: 'Leads Generated',
                                data: [12, 19, 23, 25, 32, 28, 35],
                                borderColor: '#000',
                                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: '#f3f4f6'
                                    }
                                },
                                x: {
                                    grid: {
                                        display: false
                                    }
                                }
                            }
                        }
                    });
                }
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
            }
        }

        // Handle new campaign form submission
        function handleNewCampaign(event) {
            event.preventDefault();
            alert('New campaign launched successfully!');
            // In a real app, you would send this data to your backend
            loadDashboardData(); // Refresh data
            showSection('overview'); // Return to overview
        }

        // Client management functions
        function showAddClientModal() {
            document.getElementById('add-client-modal').classList.remove('hidden');
        }

        function hideAddClientModal() {
            document.getElementById('add-client-modal').classList.add('hidden');
        }

        function addNewClient(event) {
            event.preventDefault();
            const name = document.getElementById('client-name').value;
            const email = document.getElementById('client-email').value;
            
            const clientsGrid = document.getElementById('clients-grid');
            const newClient = document.createElement('div');
            newClient.className = 'border border-gray-200 rounded p-4 hover:border-black transition cursor-pointer';
            newClient.innerHTML = `
                <h4 class="font-medium text-black">${name}</h4>
                <p class="text-sm text-gray-600">0 active campaigns</p>
                <p class="text-xs text-gray-500 mt-2">Last activity: Just now</p>
            `;
            
            // Insert before the "Add Client" button
            clientsGrid.insertBefore(newClient, clientsGrid.lastElementChild);
            
            // Reset form and hide modal
            event.target.reset();
            hideAddClientModal();
        }

        // Drip campaign functions
        function createNewDripCampaign() {
            alert('Redirecting to drip campaign builder...');
            // In a real app, this would open a modal or new page
        }

        // Settings functions
        function copyApiKey() {
            const apiKey = document.getElementById('api-key');
            apiKey.select();
            document.execCommand('copy');
            alert('API key copied to clipboard!');
        }

        function saveSettings() {
            alert('Settings saved successfully!');
            // In a real app, you would send this data to your backend
        }

        // Load data on page load
        document.addEventListener('DOMContentLoaded', function() {
            loadDashboardData();
            
            // Refresh data every 30 seconds
            setInterval(loadDashboardData, 30000);
        });
    
// === DARK MODE TOGGLE ===
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// Apply saved theme on load
document.addEventListener('DOMContentLoaded', function () {
    const prefersDark = localStorage.getItem('darkMode') === 'true';
    if (prefersDark) {
        document.body.classList.add('dark-mode');
    }
});


// === SEARCH FILTER FOR CAMPAIGNS ===
function filterCampaigns() {
    const input = document.getElementById("campaignSearch").value.toLowerCase();
    const rows = document.querySelectorAll("#campaigns-table tr");
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        row.style.display = rowText.includes(input) ? "" : "none";
    });
}


// === PWA Service Worker Registration ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js").then(
      function (registration) {
        console.log("ServiceWorker registration successful:", registration.scope);
      },
      function (err) {
        console.log("ServiceWorker registration failed:", err);
      }
    );
  });
}


// === EXPORT TO CSV ===
function exportTableToCSV() {
    let csv = [];
    const rows = document.querySelectorAll("#campaigns-table tr");
    rows.forEach(row => {
        const cols = row.querySelectorAll("td, th");
        let rowData = [];
        cols.forEach(col => rowData.push(`"${col.innerText.trim()}"`));
        csv.push(rowData.join(","));
    });
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaigns.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// === EXPORT TO PDF ===
function exportTableToPDF() {
    const element = document.querySelector("#campaigns-table").parentElement;
    const opt = {
        margin:       0.5,
        filename:     'campaigns.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
    };
    html2pdf().from(element).set(opt).save();
}

// === SWIPE GESTURE FOR SIDEBAR TOGGLE ===
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, false);

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchEndX > touchStartX + 60) {
        document.getElementById('sidebar').classList.add('open');
    } else if (touchEndX < touchStartX - 60) {
        document.getElementById('sidebar').classList.remove('open');
    }
}, false);
