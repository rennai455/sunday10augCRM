import js from '@eslint/js';

export default [
  // Ignore built assets and legacy scripts entirely
  { ignores: ['public/dist/**/*', 'scripts/**/*'] },
  js.configs.recommended,
  {
    ignores: ['**/dist/**', '**/public/dist/**', 'node_modules/', '*.min.js', 'scripts/**/*'],
    languageOptions: {
      sourceType: 'module',
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
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Browser environment for client-side scripts
  {
    files: ['public/scripts/**/*.js', 'public/vendor/**/*.js'],
    languageOptions: {
      // Client-side modules use ES module syntax
      sourceType: 'module',
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
        // Additional browser globals mentioned in linting errors
        navigator: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Custom globals for the app
        setUserRole: 'writable',
        hideAddClientModal: 'readonly',
        html2pdf: 'readonly',
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
    files: ['tests/**/*.{js,mjs}', '**/*.test.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
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
        test: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
