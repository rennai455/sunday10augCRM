// server.js
const app = require('./src/app');
const config = require('./config');

const { PORT, NODE_ENV } = config;

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

module.exports = app;
module.exports.server = server;
