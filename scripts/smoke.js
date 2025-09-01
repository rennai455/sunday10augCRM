#!/usr/bin/env node
// scripts/smoke.js: Basic smoke tests for the server
const { spawn } = require('child_process');
const path = require('path');

console.log('🔥 Running smoke tests...');

// Run the smoke tests using jest
const testCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const testProcess = spawn(testCommand, ['test', 'smoke'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Smoke tests passed!');
  } else {
    console.log('❌ Smoke tests failed!');
    process.exit(code);
  }
});

testProcess.on('error', (err) => {
  console.error('Failed to run smoke tests:', err);
  process.exit(1);
});