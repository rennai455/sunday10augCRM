module.exports = {
  testEnvironment: 'node',
  transform: {}, // no transpilation
  testMatch: ['**/*.test.mjs'], // run ONLY .test.mjs for now
  moduleFileExtensions: ['mjs', 'js', 'json'],
};
