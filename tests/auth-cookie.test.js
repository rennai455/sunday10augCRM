const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { auth, server } = require('../server');

describe('auth middleware cookie support', () => {
  it('reads token from cookies', async () => {
    const token = jwt.sign({ userId: 123, agencyId: 1, isAdmin: false }, process.env.JWT_SECRET);
    const app = express();
    app.use(cookieParser());
    app.get('/protected', auth, (req, res) => {
      res.json({ userId: req.userId });
    });
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(123);
  });

  afterAll(() => {
    if (server.listening) server.close();
  });
});
