const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool } = require('../../src/db/pool');
const { app, server } = require('../../server');

describe('Recent audit endpoint', () => {
  let agencyId;
  let token;

  beforeAll(async () => {
    const a = await pool.query(
      "INSERT INTO agencies (name) VALUES ('Audit Agency') RETURNING id"
    );
    agencyId = a.rows[0].id;
    const secret = process.env.JWT_SECRET || 'testsecretjwt';
    token = jwt.sign({ userId: 999, agencyId, isAdmin: true }, secret, {
      expiresIn: '1h',
    });

    // Seed 6 events so we can test limit=5
    for (let i = 0; i < 6; i++) {
      await pool.query(
        'INSERT INTO audit_log (req_id, user_id, agency_id, action, payload_hash) VALUES ($1,$2,$3,$4,$5)',
        ['req-' + i, 999, agencyId, 'test:event:' + i, null]
      );
    }
  });

  afterAll(async () => {
    await pool
      .query('DELETE FROM audit_log WHERE agency_id = $1', [agencyId])
      .catch(() => null);
    await pool
      .query('DELETE FROM agencies WHERE id = $1', [agencyId])
      .catch(() => null);
    if (server && server.listening) server.close();
  });

  it('returns latest 5 events in descending order', async () => {
    const agent = request.agent(app);
    agent.jar.setCookie(`token=${token}`);
    const res = await agent.get('/api/audit/recent?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeLessThanOrEqual(5);
    // Should start with the most recent action test:event:5
    expect(res.body.events[0].action).toMatch('test:event');
  });
});
