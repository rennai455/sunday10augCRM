import config from '../config/index.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function initSentry() {
  if (!config.SENTRY_DSN) return;
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_SHA || undefined,
  });
  // Optionally add request/trace handlers if not using custom log-only approach.
}

function initOtel() {
  if (!config.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const {
    getNodeAutoInstrumentations,
  } = require('@opentelemetry/auto-instrumentations-node');
  const {
    OTLPTraceExporter,
  } = require('@opentelemetry/exporter-trace-otlp-http');

  const traceExporter = new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const sdk = new NodeSDK({
    serviceName: config.OTEL_SERVICE_NAME,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });
  sdk.start().catch((e) => console.error('OTel start error', e));
}

export { initSentry, initOtel };
export default { initSentry, initOtel };
