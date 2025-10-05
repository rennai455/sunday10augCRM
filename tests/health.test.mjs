import { jest, describe, test, expect, afterAll } from '@jest/globals';
import request from 'supertest';

// Minimal no-op to satisfy middleware/hooks
const noop = () => {};
const noMiddleware = (_req, _res, next) => next?.();

// IMPORTANT: mock ESM modules BEFORE importing server.js
// Match both default and named export shapes to be resilient.
jest.unstable_mockModule('../src/auth.js', () => ({
  default: { ensureAuthenticated: noMiddleware, session: noMiddleware, init: noop },
  ensureAuthenticated: noMiddleware,
  session: noMiddleware,
  init: noop,
}));

jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: { query: async () => ({ rows: [] }) },
  pool: { query: async () => ({ rows: [] }) },
}));

jest.unstable_mockModule('../src/redis.js', () => ({
  default: { ping: async () => 'PONG' },
}));

jest.unstable_mockModule('../src/observability.js', () => ({
  default: {
    initSentry: noop,
    initOtel: noop,
  },
  initSentry: noop,
  initOtel: noop,
}));

jest.unstable_mockModule('../src/middleware.js', () => ({
  default: {
    applyPreMiddleware: noMiddleware,
    applyPostMiddleware: noMiddleware,
  },
  applyPreMiddleware: noMiddleware,
  applyPostMiddleware: noMiddleware,
}));

jest.unstable_mockModule('../src/routes.js', () => ({
  default: {
    registerWebhook: noop,
    registerRoutes(appInstance) {
      appInstance.get('/health', (_req, res) => {
        res.json({ status: 'healthy' });
      });
    },
  },
  registerWebhook: noop,
  registerRoutes(appInstance) {
    appInstance.get('/health', (_req, res) => {
      res.json({ status: 'healthy' });
    });
  },
}));

jest.unstable_mockModule('../config/index.js', () => ({
  default: {
    PORT: 3005,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: '',
    API_RATE_WINDOW_MS: 60000,
    API_RATE_MAX: 100,
    AUTH_RATE_WINDOW_MS: 60000,
    AUTH_RATE_MAX: 10,
    RATE_LIMIT_TRUST_PROXY: false,
    PG_ENABLE_RLS: false,
    SENTRY_DSN: '',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_SERVICE_NAME: 'test-service',
  },
}));

// Now import the system under test AFTER mocks are installed
const { app, server } = await import('../server.js');

afterAll((done) => { try { server.close(done); } catch { done(); } });

test('GET /health returns 200', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('status', 'healthy');
});
