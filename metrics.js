// metrics.js: Prometheus metrics configuration (ESM)
import {
  register,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

// Default metrics collection
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const rateLimitBlockedTotal = new Counter({
  name: 'rate_limit_blocked_total',
  help: 'Total number of requests blocked by rate limiting',
  labelNames: ['route', 'type'],
  registers: [register],
});

const webhookEventsTotal = new Counter({
  name: 'webhook_events_total',
  help: 'Count of webhook events by outcome',
  labelNames: ['outcome'],
  registers: [register],
});

export {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  rateLimitBlockedTotal,
  webhookEventsTotal,
};

export default {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  rateLimitBlockedTotal,
  webhookEventsTotal,
};
