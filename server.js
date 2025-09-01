// server.js
const app = require('./src/app');
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';
const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
module.exports = app;
module.exports.server = server;
