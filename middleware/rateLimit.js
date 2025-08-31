function createRateLimit(windowMs, max, message) {
  const rateLimit = require('express-rate-limit');
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) }
  });
}

module.exports = { createRateLimit };
