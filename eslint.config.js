const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', '*.min.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Browser environment for client-side scripts
  {
    files: ['scripts/app.js', 'public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        console: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        PerformanceObserver: 'readonly',
        // Custom globals for the app
        setUserRole: 'writable',
      },
    },
  },
  // Service Worker environment
  {
    files: ['service-worker.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        indexedDB: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  // Test files
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
  },
];
