// jest.config.js: minimal Jest config with test environment
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  setupFiles: ['<rootDir>/tests/setup.js'],
};
