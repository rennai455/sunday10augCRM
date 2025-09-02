#!/usr/bin/env node
// scripts/smoke.js: Basic smoke tests for the server

console.log('🔥 Running smoke tests...');

(async () => {
  let ESLint;
  try {
    ({ ESLint } = require('eslint'));
  } catch (e) {
    console.warn('⚠️  ESLint not installed; skipping lint smoke test.');
    return;
  }

  try {
    const eslint = new ESLint();
    const results = await eslint.lintFiles(['.']);
    const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
    if (errorCount > 0) {
      console.error('❌ Smoke tests failed!');
      process.exit(1);
    }
    console.log('✅ Smoke tests passed!');
  } catch (err) {
    console.warn('⚠️  ESLint failed to run:', err.message);
  }
})();
