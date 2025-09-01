import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', '*.min.js'],
    languageOptions: {
      sourceType: 'module'
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
