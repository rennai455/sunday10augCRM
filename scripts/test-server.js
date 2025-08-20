const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/readyz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/static', express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
});

module.exports = app;
