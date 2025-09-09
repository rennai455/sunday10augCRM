// metrics.js: Prometheus metrics configuration
const { register, Counter, Histogram } = require('prom-client');

// Default metrics collection
require('prom-client').collectDefaultMetrics({ register });

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

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  rateLimitBlockedTotal: new Counter({
    name: 'rate_limit_blocked_total',
    help: 'Total number of requests blocked by rate limiting',
    labelNames: ['route', 'type'],
    registers: [register],
  }),
};
