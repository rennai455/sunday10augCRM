const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool } = require('../../src/db/pool');
const { app, server } = require('../../server');

describe('Dashboard endpoint', () => {
  let agencyId;
  let campaignIdA;
  let campaignIdB;
  let leadIdA;
  let leadIdB;
  let token;
  let hasDealsTable = false;

  beforeAll(async () => {
    const agency = await pool.query(
      "INSERT INTO agencies (name) VALUES ('Dashboard Test Agency') RETURNING id"
    );
    agencyId = agency.rows[0].id;

    const campaignA = await pool.query(
      'INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [agencyId, 'Campaign A', 'active']
    );
    campaignIdA = campaignA.rows[0].id;

    const campaignB = await pool.query(
      'INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [agencyId, 'Campaign B', 'draft']
    );
    campaignIdB = campaignB.rows[0].id;

    const leadA = await pool.query(
      'INSERT INTO leads (campaign_id, name, email, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [campaignIdA, 'Lead Alpha', 'alpha@example.com', 'new']
    );
    leadIdA = leadA.rows[0].id;

    const leadB = await pool.query(
      'INSERT INTO leads (campaign_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [campaignIdB, 'Lead Beta', 'pending']
    );
    leadIdB = leadB.rows[0].id;

    const dealsCheck = await pool.query(
      "SELECT to_regclass('public.deals') IS NOT NULL AS exists"
    );
    hasDealsTable = Boolean(dealsCheck.rows[0]?.exists);
    if (hasDealsTable) {
      await pool.query(
        'INSERT INTO deals (lead_id, stage, value, probability) VALUES ($1, $2, $3, $4)',
        [leadIdA, 'proposal', 1500, 80]
      );
      await pool.query(
        'INSERT INTO deals (lead_id, stage, value, probability) VALUES ($1, $2, $3, $4)',
        [leadIdB, 'new', 500, 40]
      );
    }

    const secret = process.env.JWT_SECRET || 'testsecretjwt';
    token = jwt.sign({ userId: 42, agencyId, isAdmin: true }, secret, {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    if (hasDealsTable) {
      await pool
        .query('DELETE FROM deals WHERE lead_id = ANY($1::int[])', [
          [leadIdA, leadIdB],
        ])
        .catch(() => null);
    }
    await pool
      .query('DELETE FROM leads WHERE id = ANY($1::int[])', [
        [leadIdA, leadIdB],
      ])
      .catch(() => null);
    await pool
      .query('DELETE FROM campaigns WHERE id = ANY($1::int[])', [
        [campaignIdA, campaignIdB],
      ])
      .catch(() => null);
    await pool
      .query('DELETE FROM agencies WHERE id = $1', [agencyId])
      .catch(() => null);
    if (server && server.listening) server.close();
  });

  it('returns aggregated metrics and recent campaigns for the tenant', async () => {
    const agent = request.agent(app);
    agent.jar.setCookie(`token=${token}`);

    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    const { totals, recentCampaigns } = res.body;
    expect(totals).toBeDefined();
    expect(totals).toEqual(
      expect.objectContaining({
        campaigns: expect.any(Number),
        leads: expect.any(Number),
        averageScore: expect.any(Number),
        activeClients: expect.any(Number),
      })
    );
    expect(totals.campaigns).toBe(2);
    expect(totals.leads).toBe(2);
    expect(totals.averageScore).toBe(hasDealsTable ? 60 : 0);
    expect(totals.activeClients).toBe(2);

    expect(Array.isArray(recentCampaigns)).toBe(true);
    expect(recentCampaigns.length).toBeGreaterThanOrEqual(2);
    recentCampaigns.forEach((campaign) => {
      expect(campaign).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          status: expect.any(String),
          leads: expect.any(Number),
          started_at: expect.any(String),
        })
      );
    });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
