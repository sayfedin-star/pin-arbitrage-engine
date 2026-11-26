import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { isReadOnlyQuery as isReadOnlySql } from '../src/db/client.mjs';
import { createFastifyApp } from '../src/server.mjs';
import { invalidateEdgeCache } from '../src/http/security-and-response.mjs';

import { getDomainsClientAppScript } from '../src/ui/domains/domains-client-app.mjs';
import { getDashboardClientAppScript } from '../src/ui/dashboard/dashboard-client-app.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getDiscoveryClientAppScript } from '../src/ui/discovery/discovery-client-app.mjs';
import { getKeywordsClientAppScript } from '../src/ui/keywords/keywords-client-app.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';
import { getPulseClientAppScript } from '../src/ui/pulse/pulse-client-app.mjs';

const PAE_SHELL_SCRIPT = fs.readFileSync(new URL('../public/pae-shell.js', import.meta.url), 'utf8');

function extractScriptBody(scriptTag) {
  return String(scriptTag || '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/<\/script>/gi, '');
}

test('Hostile Audit 1: isReadOnlySql blocks SELECT ... INTO table creation and PG admin functions', () => {
  assert.equal(isReadOnlySql('SELECT * INTO evil_tbl FROM users'), false);
  assert.equal(isReadOnlySql('SELECT id INTO TEMP scratch_tbl FROM universal_master_pins'), false);
  assert.equal(isReadOnlySql('SELECT id INTO UNLOGGED scratch_tbl FROM universal_master_pins'), false);
  assert.equal(isReadOnlySql('WITH s AS (SELECT 1 AS a) SELECT * INTO new_tbl FROM s'), false);
  assert.equal(isReadOnlySql('SELECT * INTO "quoted_evil" FROM users'), false);
  assert.equal(isReadOnlySql('SELECT pg_reload_conf()'), false);
  assert.equal(isReadOnlySql('SELECT pg_rotate_logfile()'), false);

  // Legitimate read queries remain allowed
  assert.equal(isReadOnlySql('SELECT 1 AS "into" FROM universal_master_pins'), true);
  assert.equal(isReadOnlySql("SELECT 'SELECT * INTO foo' AS lit"), true);
});

test('Hostile Audit 2: safeUrl rejects /\\ protocol-relative bypass and control chars across pae-shell.js PAEFormatters and all 7 UI client fallbacks', () => {
  const vectors = [
    '/\\evil.com/phish',
    ' /\\evil.com',
    '//evil.com/phish',
    '\u0000javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)'
  ];

  // Shared browser shell window.PAEFormatters.safeUrl / window.PAE.safeUrl / window.safeUrl
  const shellWin = {
    location: { origin: 'http://localhost:3000', pathname: '/', search: '' },
    addEventListener: () => {}
  };
  const fmtCtx = {
    window: shellWin,
    globalThis: shellWin,
    document: { addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  vm.createContext(fmtCtx);
  vm.runInContext(PAE_SHELL_SCRIPT, fmtCtx);
  for (const vec of vectors) {
    assert.equal(shellWin.PAEFormatters.safeUrl(vec), '#', `PAEFormatters.safeUrl failed: ${JSON.stringify(vec)}`);
    assert.equal(shellWin.PAE.safeUrl(vec), '#', `PAE.safeUrl failed: ${JSON.stringify(vec)}`);
    assert.equal(shellWin.safeUrl(vec), '#', `window.safeUrl failed: ${JSON.stringify(vec)}`);
  }
  assert.equal(shellWin.PAEFormatters.safeUrl('/keywords/minimalist'), '/keywords/minimalist');
  assert.equal(shellWin.PAEFormatters.safeUrl('/folders/12'), '/folders/12');
  assert.equal(shellWin.PAEFormatters.safeUrl('https://pinterest.com/pin/123/'), 'https://pinterest.com/pin/123/');

  // All 7 UI client scripts even WITHOUT window.PAEFormatters loaded
  const clients = [
    ['domains', getDomainsClientAppScript(), 'domainsApp()'],
    ['dashboard', getDashboardClientAppScript(), 'dashboardApp()'],
    ['folders', getFoldersClientAppScript(), 'foldersApp()'],
    ['keywords', getKeywordsClientAppScript(), 'keywordStudio()'],
    ['pin-details', getPinDetailsClientAppScripts(), 'pinDetailApp("123")'],
    ['pulse', getPulseClientAppScript(), 'pulseStudioApp()']
  ];
  for (const [name, script, expr] of clients) {
    const ctx = {
      window: { location: { origin: 'http://localhost:3000', pathname: '/', search: '' }, addEventListener: () => {} },
      document: { addEventListener: () => {} },
      localStorage: { getItem: () => null, setItem: () => {} },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      AbortController,
      URLSearchParams
    };
    vm.createContext(ctx);
    vm.runInContext(extractScriptBody(script), ctx);
    const app = vm.runInContext(expr, ctx);
    for (const vec of vectors) {
      assert.equal(app.safeUrl(vec), '#', `${name} safeUrl fallback failed: ${JSON.stringify(vec)}`);
    }
    assert.equal(app.safeUrl('/pins/123'), '/pins/123', `${name} safeUrl must allow relative path`);
  }

  // Discovery client script
  const discCtx = {
    window: { location: { origin: 'http://localhost:3000', pathname: '/', search: '' }, addEventListener: () => {} },
    document: { addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    AbortController,
    URLSearchParams
  };
  vm.createContext(discCtx);
  vm.runInContext(extractScriptBody(getDiscoveryClientAppScript()), discCtx);
  const discApp = vm.runInContext('discoveryApp()', discCtx);
  for (const vec of vectors) {
    assert.equal(discApp.safeUrl(vec), '#', `discovery safeUrl fallback failed: ${JSON.stringify(vec)}`);
  }
  assert.equal(discApp.safeUrl('/keywords/dinner'), '/keywords/dinner');
});

test('Hostile Audit 3: POST /api/internal/self-update requires auth and emits Cache-Control: no-store', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origEnv = process.env.ENVIRONMENT;
  const origTestMode = globalThis.__PAE_TEST_MODE__;

  const mockSql = async () => [{ alive: 1 }];
  mockSql.end = async () => {};

  let app = null;
  try {
    process.env.NODE_ENV = 'production';
    process.env.ENVIRONMENT = 'production';
    delete globalThis.__PAE_TEST_MODE__;

    app = await createFastifyApp({
      SQL_CLIENT: mockSql,
      NODE_ENV: 'production',
      ENVIRONMENT: 'production',
      API_SECRET_KEY: 'audit-self-update-key'
    });

    const unauthRes = await app.inject({ method: 'POST', url: '/api/internal/self-update' });
    assert.equal(unauthRes.statusCode, 401);

    const authRes = await app.inject({
      method: 'POST',
      url: '/api/internal/self-update',
      headers: { 'x-api-key': 'audit-self-update-key' }
    });
    assert.equal(authRes.statusCode, 202);
    assert.equal(authRes.headers['cache-control'], 'no-store, no-cache, must-revalidate, private');
  } finally {
    if (app) await app.close();
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origEnv === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = origEnv;
    if (origTestMode === undefined) delete globalThis.__PAE_TEST_MODE__;
    else globalThis.__PAE_TEST_MODE__ = origTestMode;
  }
});

test('Hostile Audit 4: DELETE pin snapshots, daily-metrics, and serp-positions fail loudly with HTTP 500 on DB errors', async () => {
  const failingDeleteSql = async (strings) => {
    const q = strings.join('?');
    if (/FROM\s+workspaces/i.test(q)) {
      return [{ id: 1, name: 'Default Workspace', slug: 'default', icon: 'layers', color: '#6366f1', is_default: true }];
    }
    if (/SELECT metadata FROM universal_master_pins/i.test(q)) {
      return [{ metadata: {} }];
    }
    if (/DELETE|UPDATE|INSERT/i.test(q)) {
      throw new Error('SIMULATED_PG_25P02_TIMEOUT');
    }
    return [];
  };
  failingDeleteSql.begin = async (cb) => cb(failingDeleteSql);
  failingDeleteSql.end = async () => {};

  const app = await createFastifyApp({
    SQL_CLIENT: failingDeleteSql,
    API_SECRET_KEY: 'audit-delete-key'
  });

  try {
    const headers = { 'x-api-key': 'audit-delete-key' };

    // 1) Daily snapshot delete
    const dailyRes = await app.inject({
      method: 'DELETE',
      url: '/api/pins/123456789012/snapshots/2026-11-10',
      headers
    });
    assert.equal(dailyRes.statusCode, 500);
    const dailyBody = dailyRes.json();
    assert.equal(dailyBody.success, false);
    assert.equal(dailyBody.error, 'SNAPSHOT_DELETE_FAILED');

    // 2) Intraday snapshot delete
    const intraRes = await app.inject({
      method: 'DELETE',
      url: '/api/pins/123456789012/snapshots/intra_2026-11-10T12',
      headers
    });
    assert.equal(intraRes.statusCode, 500);
    const intraBody = intraRes.json();
    assert.equal(intraBody.success, false);
    assert.equal(intraBody.error, 'SNAPSHOT_DELETE_FAILED');

    // 3) Daily-metrics route delete
    const dmRes = await app.inject({
      method: 'DELETE',
      url: '/api/pins/123456789012/daily-metrics/2026-11-10',
      headers
    });
    assert.equal(dmRes.statusCode, 500);
    const dmBody = dmRes.json();
    assert.equal(dmBody.success, false);
    assert.equal(dmBody.error, 'SNAPSHOT_DELETE_FAILED');

    // 4) SERP positions route delete
    const serpRes = await app.inject({
      method: 'DELETE',
      url: '/api/pins/123456789012/serp-positions?keyword_id=42',
      headers
    });
    assert.equal(serpRes.statusCode, 500);
    const serpBody = serpRes.json();
    assert.equal(serpBody.success, false);
    assert.equal(serpBody.error, 'SERP_POSITION_DELETE_FAILED');
  } finally {
    await app.close();
  }
});

test('Hostile Audit 5: GET /api/creators/pins, /api/competitors/boards, and /api/creators/pin-detail return 503 Retry-After: 3 on DB failure', async () => {
  invalidateEdgeCache('pinarchive');
  invalidateEdgeCache('competitors');
  invalidateEdgeCache('creators');

  const failingSql = async (strings) => {
    const q = Array.isArray(strings) ? strings.join('?') : '';
    if (/FROM\s+workspaces/i.test(q)) {
      return [{ id: 1, name: 'Default Workspace', slug: 'default', icon: 'layers', color: '#6366f1', is_default: true }];
    }
    const err = new Error('remaining connection slots are reserved');
    err.code = '53300';
    throw err;
  };
  failingSql.end = async () => {};

  const app = await createFastifyApp({
    SQL_CLIENT: failingSql,
    API_SECRET_KEY: 'audit-creators-key'
  });

  try {
    const headers = { 'x-api-key': 'audit-creators-key' };

    const pinsRes = await app.inject({
      method: 'GET',
      url: '/api/creators/pins',
      headers
    });
    assert.equal(pinsRes.statusCode, 503);
    assert.equal(pinsRes.headers['retry-after'], '3');

    const boardsRes = await app.inject({
      method: 'GET',
      url: '/api/competitors/boards?username=chef',
      headers
    });
    assert.equal(boardsRes.statusCode, 503);
    assert.equal(boardsRes.headers['retry-after'], '3');

    const pinDetailRes = await app.inject({
      method: 'GET',
      url: '/api/creators/pin-detail?pin_id=123456789012',
      headers
    });
    assert.equal(pinDetailRes.statusCode, 503);
    assert.equal(pinDetailRes.headers['retry-after'], '3');
  } finally {
    await app.close();
  }
});
