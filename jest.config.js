// jest.config.js: minimal Jest config
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  coverageThreshold: {
    global: {
      lines: 60,
      statements: 60,
      functions: 60,
      branches: 60,
    },
  },
};
