import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'scratch/**',
      '.system_generated/**',
      'dist/**',
      '**/*.json'
    ]
  },
  // 1. Backend Node.js scripts (Crawlers, Dispatchers, Consolidators, DB migrations)
  // Strictly isolated from browser globals to prevent masking missing variables
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        // Explicit undici / modern Node globals
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-constant-binary-expression': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unsafe-finally': 'error',
      'no-loss-of-precision': 'error'
    }
  },
  // 2. Cloudflare Worker & API Services
  {
    files: ['src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.worker,
        // Cloudflare Worker Runtime
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        fetch: 'readonly',
        caches: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-constant-binary-expression': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unsafe-finally': 'error',
      'no-loss-of-precision': 'error'
    }
  }
];
