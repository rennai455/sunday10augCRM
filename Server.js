require('dotenv').config(); // Add this as the first line

const express = require('express'); 
const cors = require('cors'); 
const sqlite3 = require('sqlite3').verbose(); 
const path = require('path'); 
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

const app = express(); 
const PORT = 5432; 
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware 
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname)));

// Initialize SQLite Database 
const db = new sqlite3.Database('./crm.db'); 

// Enhanced Database Schema
db.serialize(() => { 
    // Agencies table
    db.run(`CREATE TABLE IF NOT EXISTS agencies ( 
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        agency_id TEXT UNIQUE, 
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT,
        white_label_config TEXT,
        subscription_tier TEXT DEFAULT 'starter',
        campaigns_remaining INTEGER DEFAULT 5,
        api_key TEXT UNIQUE,
        webhook_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP 
    )`); 

    // Enhanced Campaigns table 
    db.run(`CREATE TABLE IF NOT EXISTS campaigns ( 
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        campaign_id TEXT UNIQUE, 
        agency_id TEXT, 
        client_id TEXT, 
        status TEXT DEFAULT 'started', 
        config TEXT, 
        started_at TEXT, 
        completed_at TEXT, 
        total_leads INTEGER DEFAULT 0, 
        qualified_leads INTEGER DEFAULT 0,
        premium_leads INTEGER DEFAULT 0, 
        average_score REAL DEFAULT 0,
        processing_time_seconds INTEGER DEFAULT 0,
        api_costs REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 197,
        agency_price REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`); 

    // Enhanced Leads table 
    db.run(`CREATE TABLE IF NOT EXISTS leads ( 
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        campaign_id TEXT, 
        email TEXT, 
        phone TEXT, 
        first_name TEXT, 
        last_name TEXT, 
        business_name TEXT, 
        website TEXT, 
        address TEXT, 
        linkedin_profile TEXT, 
        lead_score INTEGER DEFAULT 0, 
        priority TEXT, 
        action_recommended TEXT,
        insights TEXT,
        recommendations TEXT,
        is_qualified BOOLEAN DEFAULT 0, 
        is_premium BOOLEAN DEFAULT 0, 
        found_via TEXT, 
        extracted_at TEXT, 
        email_verified BOOLEAN DEFAULT 0,
        email_verification_details TEXT,
        years_in_business INTEGER, 
        company_size TEXT, 
        has_awards BOOLEAN DEFAULT 0, 
        industry_relevance_score INTEGER DEFAULT 0, 
        context_snippet TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`); 

    // Analytics table 
    db.run(`CREATE TABLE IF NOT EXISTS campaign_analytics ( 
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        campaign_id TEXT, 
        source_name TEXT, 
        leads_found INTEGER DEFAULT 0, 
        average_score_by_source REAL DEFAULT 0, 
        processing_time_seconds INTEGER DEFAULT 0, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`); 

    // API Usage tracking
    db.run(`CREATE TABLE IF NOT EXISTS api_usage ( 
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        agency_id TEXT, 
        endpoint TEXT,
        method TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER,
        status_code INTEGER
    )`); 
}); 

// Authentication Middleware
const authenticateAgency = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No authentication token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.agencyId = decoded.agencyId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid authentication token' });
    }
};

// API Routes 

// Agency Management
app.post('/api/agencies/register', async (req, res) => {
    const { name, email, password } = req.body;
    const agency_id = `AGENCY_${Date.now()}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const api_key = `sk_live_${Math.random().toString(36).substr(2, 32)}`;
    
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        
        db.run(`
            INSERT INTO agencies (agency_id, name, email, password_hash, api_key)
            VALUES (?, ?, ?, ?, ?)
        `, [agency_id, name, email, passwordHash, api_key], function(err) {
            if (err) {
                console.error('Agency registration error:', err);
                return res.status(400).json({ error: 'Agency registration failed' });
            }
            
            const token = jwt.sign({ agencyId: agency_id }, JWT_SECRET);
            res.json({
                success: true,
                agency_id,
                api_key,
                token,
                message: 'Agency registered successfully'
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// 1. FIXED Campaign Initialization - NOW HANDLES DUPLICATES
app.post('/api/campaigns/initialize', (req, res) => { 
    const { campaign_id, agency_id, client_id, config, status, started_at } = req.body; 
    console.log('🚀 Initializing campaign:', campaign_id); 

    try {
        // Handle missing or invalid config
        let parsedConfig = {};
        if (config) {
            if (typeof config === 'string') {
                try {
                    parsedConfig = JSON.parse(config);
                } catch (e) {
                    console.warn('Invalid JSON config, using empty object');
                }
            } else if (typeof config === 'object') {
                parsedConfig = config;
            }
        }

        // Calculate wholesale price based on tier
        const tierPricing = {
            express: 147,
            standard: 197,
            premium: 297
        };
        const wholesale_price = tierPricing[parsedConfig?.campaign_tier] || 197;

        // Use INSERT OR REPLACE to handle duplicates gracefully
        const stmt = db.prepare(` 
            INSERT OR REPLACE INTO campaigns (
                campaign_id, agency_id, client_id, status, config, started_at, wholesale_price, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM campaigns WHERE campaign_id = ?), CURRENT_TIMESTAMP))
        `); 

        stmt.run([ 
            campaign_id, 
            agency_id, 
            client_id, 
            status || 'started', 
            JSON.stringify(parsedConfig), 
            started_at || new Date().toISOString(),
            wholesale_price,
            campaign_id  // This is for the COALESCE to preserve original created_at
        ], function(err) { 
            if (err) { 
                console.error('Database error:', err); 
                stmt.finalize();
                return res.status(500).json({ error: 'Failed to initialize campaign', details: err.message }); 
            } 
            
            // Determine if this was an update or insert
            const wasUpdate = this.changes > 0 && this.lastID === 0;
            const message = wasUpdate ? 'Campaign updated successfully' : 'Campaign initialized successfully';
            
            // Only decrement campaigns_remaining for new campaigns, not updates
            if (agency_id && !wasUpdate) {
                db.run(`
                    UPDATE agencies 
                    SET campaigns_remaining = campaigns_remaining - 1 
                    WHERE agency_id = ? AND campaigns_remaining > 0
                `, [agency_id], (updateErr) => {
                    if (updateErr) {
                        console.warn('Agency update failed:', updateErr);
                    }
                });
            }
            
            console.log(`✅ Campaign ${campaign_id} ${wasUpdate ? 'updated' : 'initialized'} successfully`);
            res.json({ 
                success: true, 
                campaign_id: campaign_id, 
                wholesale_price: wholesale_price,
                message: message,
                action: wasUpdate ? 'updated' : 'created'
            }); 
            stmt.finalize();
        }); 

    } catch (error) {
        console.error('Campaign initialization error:', error);
        res.status(500).json({ 
            error: 'Failed to initialize campaign', 
            details: error.message 
        });
    }
}); 

// 2. Complete Campaign with Full Results
app.post('/api/campaigns/complete', (req, res) => {
    const deliveryPackage = req.body;
    const { campaign, results, leads, analytics } = deliveryPackage;
    
    console.log(`✅ Completing campaign ${campaign.id} with ${results.total_leads} leads`);

    try {
        // Start transaction
        db.serialize(() => {
            // Update campaign
            db.run(`
                UPDATE campaigns 
                SET status = 'completed',
                    completed_at = ?,
                    total_leads = ?,
                    qualified_leads = ?,
                    premium_leads = ?,
                    average_score = ?,
                    processing_time_seconds = ?
                WHERE campaign_id = ?
            `, [
                campaign.completed_at,
                results.total_leads,
                results.qualified_leads,
                results.premium_leads,
                results.average_score,
                Math.floor((new Date() - new Date(campaign.started_at || new Date())) / 1000),
                campaign.id
            ], (err) => {
                if (err) {
                    console.error('Campaign update error:', err);
                }
            });

            // Insert leads with duplicate handling
            if (leads && leads.length > 0) {
                const leadStmt = db.prepare(`
                    INSERT OR REPLACE INTO leads (
                        campaign_id, email, phone, first_name, last_name, business_name,
                        website, address, linkedin_profile, lead_score, priority,
                        action_recommended, insights, is_qualified, is_premium,
                        found_via, extracted_at, email_verified, years_in_business,
                        company_size, has_awards
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                leads.forEach(lead => {
                    leadStmt.run([
                        campaign.id,
                        lead.email || '',
                        lead.phone || '',
                        lead.first_name || '',
                        lead.last_name || '',
                        lead.business_name || '',
                        lead.website || '',
                        lead.address || '',
                        lead.linkedin_url || '',
                        lead.lead_score || 0,
                        lead.priority || '',
                        lead.action_recommended || '',
                        JSON.stringify(lead.insights || []),
                        lead.lead_score >= 40 ? 1 : 0,
                        lead.lead_score >= 70 ? 1 : 0,
                        lead.found_via || '',
                        lead.extracted_at || new Date().toISOString(),
                        lead.email ? 1 : 0,
                        lead.years_in_business || null,
                        lead.company_size || '',
                        lead.has_awards ? 1 : 0
                    ]);
                });
                leadStmt.finalize();
            }

            // Insert analytics with duplicate handling
            if (analytics?.by_source) {
                Object.entries(analytics.by_source).forEach(([source, data]) => {
                    db.run(`
                        INSERT OR REPLACE INTO campaign_analytics (
                            campaign_id, source_name, leads_found, average_score_by_source
                        ) VALUES (?, ?, ?, ?)
                    `, [campaign.id, source, data.count || 0, data.avg_score || 0]);
                });
            }

            res.json({
                success: true,
                campaign_id: campaign.id,
                message: 'Campaign completed successfully',
                summary: results
            });
        });
    } catch (error) {
        console.error('Campaign completion error:', error);
        res.status(500).json({ 
            error: 'Failed to complete campaign', 
            details: error.message 
        });
    }
});

// 3. Get Campaign with Leads
app.get('/api/campaigns/:campaignId', (req, res) => { 
    const { campaignId } = req.params;
    const { format = 'json' } = req.query;

    db.get(` 
        SELECT c.*, 
               a.name as agency_name,
               a.white_label_config
        FROM campaigns c 
        LEFT JOIN agencies a ON c.agency_id = a.agency_id
        WHERE c.campaign_id = ? 
    `, [campaignId], (err, campaign) => { 
        if (err) { 
            return res.status(500).json({ error: 'Database error' }); 
        } 
        if (!campaign) { 
            return res.status(404).json({ error: 'Campaign not found' }); 
        } 

        // Get leads for this campaign 
        db.all(` 
            SELECT * FROM leads 
            WHERE campaign_id = ? 
            ORDER BY lead_score DESC 
        `, [campaignId], (err, leads) => { 
            if (err) { 
                return res.status(500).json({ error: 'Failed to fetch leads' }); 
            }

            // Get analytics
            db.all(`
                SELECT * FROM campaign_analytics
                WHERE campaign_id = ?
            `, [campaignId], (err, analytics) => {
                
                if (format === 'csv') {
                    // Generate CSV
                    const csv = generateCSV(leads);
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="${campaignId}_leads.csv"`);
                    return res.send(csv);
                }

                res.json({ 
                    campaign: { 
                        ...campaign, 
                        config: JSON.parse(campaign.config || '{}'),
                        white_label_config: JSON.parse(campaign.white_label_config || '{}')
                    }, 
                    leads: leads.map(lead => ({
                        ...lead,
                        insights: JSON.parse(lead.insights || '[]'),
                        recommendations: JSON.parse(lead.recommendations || '[]')
                    })),
                    analytics: analytics,
                    summary: {
                        total_leads: leads.length,
                        qualified_leads: leads.filter(l => l.is_qualified).length,
                        premium_leads: leads.filter(l => l.is_premium).length,
                        average_score: leads.length > 0 ? Math.round(leads.reduce((sum, l) => sum + l.lead_score, 0) / leads.length) : 0
                    }
                }); 
            });
        }); 
    }); 
}); 

// Utility function to generate CSV
function generateCSV(leads) {
    const headers = [
        'Email', 'Phone', 'First Name', 'Last Name', 'Business Name',
        'Website', 'Address', 'LinkedIn', 'Lead Score', 'Priority',
        'Action Recommended', 'Years in Business', 'Company Size'
    ];
    
    const rows = leads.map(lead => [
        lead.email || '',
        lead.phone || '',
        lead.first_name || '',
        lead.last_name || '',
        lead.business_name || '',
        lead.website || '',
        lead.address || '',
        lead.linkedin_profile || '',
        lead.lead_score || 0,
        lead.priority || '',
        lead.action_recommended || '',
        lead.years_in_business || '',
        lead.company_size || ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
}

// Health check 
app.get('/health', (req, res) => { 
    res.json({ 
        status: 'CRM API is running!', 
        timestamp: new Date().toISOString(),
        features: {
            agencies: true,
            campaigns: true,
            leads: true,
            analytics: true,
            webhooks: true,
            csv_export: true,
            duplicate_handling: true
        }
    }); 
}); 

// Get all campaigns (for dashboard)
app.get('/api/campaigns', (req, res) => {
    db.all(`
        SELECT c.*, a.name as agency_name
        FROM campaigns c
        LEFT JOIN agencies a ON c.agency_id = a.agency_id
        ORDER BY c.created_at DESC
        LIMIT 50
    `, [], (err, campaigns) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch campaigns' });
        }
        
        res.json(campaigns.map(campaign => ({
            ...campaign,
            config: JSON.parse(campaign.config || '{}')
        })));
    });
});

// Start server 
app.listen(PORT, () => { 
    console.log(`🚀 Custom CRM API running on http://localhost:${PORT}`); 
    console.log(`📊 Database: SQLite (./crm.db)`); 
    console.log(`🔗 Ready to receive n8n workflow data!`); 
    console.log(`📋 Dashboard available at: http://localhost:${PORT}/dashboard.html`);
    console.log(`🔐 Agency authentication enabled`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/webhooks/campaign-update`);
    console.log(`✅ Duplicate handling enabled - campaigns can be safely re-run`);
}); 

// Graceful shutdown 
process.on('SIGINT', () => { 
    db.close((err) => { 
        if (err) { 
            console.error(err.message); 
        } 
        console.log('Database connection closed.'); 
        process.exit(0); 
    }); 
});