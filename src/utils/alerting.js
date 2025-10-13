import { createRequire } from 'node:module';
import config from '../../config/index.js';

const require = createRequire(import.meta.url);
let cachedSentry;

function getSentry() {
  if (cachedSentry !== undefined) return cachedSentry;
  if (!config.SENTRY_DSN) {
    cachedSentry = null;
    return cachedSentry;
  }
  try {
    cachedSentry = require('@sentry/node');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Sentry not available:', err.message);
    cachedSentry = null;
  }
  return cachedSentry;
}

function withScope(cb) {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.withScope(cb);
}

function captureSecurityEvent(message, context) {
  withScope((scope) => {
    scope.setTag('channel', 'security');
    if (context) {
      scope.setContext('security', context);
    }
    scope.setLevel('warning');
    const Sentry = getSentry();
    Sentry?.captureMessage(message);
  });
}

function captureOperationalEvent(message, context) {
  withScope((scope) => {
    scope.setTag('channel', 'operations');
    if (context) {
      scope.setContext('operations', context);
    }
    scope.setLevel('error');
    const Sentry = getSentry();
    Sentry?.captureMessage(message);
  });
}

function captureException(err, context) {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('error', context);
    }
    scope.setLevel('error');
    Sentry.captureException(err);
  });
}

export { captureSecurityEvent, captureOperationalEvent, captureException };
export default { captureSecurityEvent, captureOperationalEvent, captureException };
