const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool } = require('../../src/db/pool');
const { app, server } = require('../../server');

describe('Leads integration with Postgres', () => {
  let agencyId;
  let campaignId;
  let token;

  beforeAll(async () => {
    // Create agency and campaign
    const a = await pool.query("INSERT INTO agencies (name) VALUES ('Test Agency') RETURNING id");
    agencyId = a.rows[0].id;
    const c = await pool.query(
      'INSERT INTO campaigns (agency_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [agencyId, 'Integration Campaign', 'active']
    );
    campaignId = c.rows[0].id;
    // Create JWT cookie for user with same agency
    const secret = process.env.JWT_SECRET || 'testsecretjwt';
    token = jwt.sign({ userId: 123, agencyId, isAdmin: true }, secret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
      await pool.query('DELETE FROM agencies WHERE id = $1', [agencyId]);
    } catch {}
    if (server && server.listening) server.close();
  });

  it('creates, updates, and sorts leads by updated_at', async () => {
    const agent = request.agent(app);
    // Manually set cookie
    agent.jar.setCookie(`token=${token}`);

    // Create lead
    let res = await agent
      .post('/api/leads')
      .send({ campaign_id: campaignId, name: 'A', status: 'new' });
    expect(res.status).toBe(201);
    const id1 = res.body.id;

    // Create another lead
    res = await agent
      .post('/api/leads')
      .send({ campaign_id: campaignId, name: 'B', status: 'active' });
    expect(res.status).toBe(201);
    const id2 = res.body.id;

    // Update the first lead to bump updated_at
    await new Promise(r => setTimeout(r, 50));
    res = await agent
      .put(`/api/leads/${id1}`)
      .send({ status: 'contacted' });
    expect(res.status).toBe(200);

    // Sort by updated_at desc: id1 should appear before id2
    res = await agent.get('/api/leads?sort=updated_at&order=desc&pageSize=2');
    expect(res.status).toBe(200);
    const ids = res.body.leads.map(l => l.id);
    expect(ids[0]).toBe(id1);
  });

  it('filters leads by date range and sorts by status', async () => {
    const agent = request.agent(app);
    agent.jar.setCookie(`token=${token}`);

    // Create two leads and adjust created_at timestamps
    let r = await agent.post('/api/leads').send({ campaign_id: campaignId, name: 'C', status: 'alpha' });
    const idA = r.body.id;
    r = await agent.post('/api/leads').send({ campaign_id: campaignId, name: 'D', status: 'omega' });
    const idB = r.body.id;

    const now = new Date();
    const past = new Date(now.getTime() - 24*3600*1000);
    await pool.query('UPDATE leads SET created_at = $1 WHERE id = $2', [past, idA]);
    await pool.query('UPDATE leads SET created_at = $1 WHERE id = $2', [now, idB]);

    // Filter from=now-1h should include only idB
    const from = new Date(now.getTime() - 3600*1000).toISOString();
    let res = await agent.get(`/api/leads?from=${encodeURIComponent(from)}&pageSize=10`);
    expect(res.status).toBe(200);
    const idsFrom = res.body.leads.map(l => l.id);
    expect(idsFrom).toContain(idB);
    // idA is 24h ago, should not be included
    expect(idsFrom).not.toContain(idA);

    // Sort by status asc: 'alpha' should come before 'omega'
    res = await agent.get('/api/leads?sort=status&order=asc&pageSize=10');
    const statuses = res.body.leads.map(l => l.status);
    const firstAlphaIndex = statuses.indexOf('alpha');
    const firstOmegaIndex = statuses.indexOf('omega');
    expect(firstAlphaIndex).toBeGreaterThanOrEqual(0);
    expect(firstOmegaIndex).toBeGreaterThanOrEqual(0);
    expect(firstAlphaIndex).toBeLessThanOrEqual(firstOmegaIndex);
  });
});
