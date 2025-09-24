#!/usr/bin/env node
const http = require('http');

const port = process.env.PORT || 3005;
const options = {
  hostname: '127.0.0.1',
  port,
  path: '/healthz',
  method: 'GET',
  timeout: 4000,
};

const req = http.request(options, (res) => {
  if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
req.on('error', () => process.exit(1));
req.end();
