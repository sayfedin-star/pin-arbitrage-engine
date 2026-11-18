import globals from 'globals';

const sharedSafetyRules = {
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
};

const webStandardGlobals = {
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  crypto: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  structuredClone: 'readonly',
  performance: 'readonly'
};

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
  // 1. Backend Node.js CLI & Verifier Scripts (scripts/)
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...webStandardGlobals
      }
    },
    rules: sharedSafetyRules
  },
  // 2. Fastify Origin Server, Routes, UI Renderers & Domain Services (src/)
  {
    files: ['src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...webStandardGlobals
      }
    },
    rules: sharedSafetyRules
  },
  // 3. Cloudflare Edge Worker Gate (workers/) — pure Web/Worker runtime globals
  {
    files: ['workers/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.worker,
        ...webStandardGlobals,
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        atob: 'readonly',
        btoa: 'readonly'
      }
    },
    rules: sharedSafetyRules
  },
  // 4. Behavioral Test Suites (tests/)
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...webStandardGlobals
      }
    },
    rules: sharedSafetyRules
  }
];
