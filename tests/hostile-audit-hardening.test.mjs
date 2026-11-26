import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { isReadOnlySql } from '../src/db/client.mjs';
import { createFastifyApp } from '../src/server.mjs';
import { safeUrl, getInlineFormattersScript } from '../src/ui/shared-formatters.mjs';
import { handlePinsRoutes } from '../src/routes/pins.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import {
  jsonResponse,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache
} from '../src/http/security-and-response.mjs';

import { getDomainsClientAppScript } from '../src/ui/domains/domains-client-app.mjs';
import { getDashboardClientAppScript } from '../src/ui/dashboard/dashboard-client-app.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getDiscoveryClientAppScript } from '../src/ui/discovery/discovery-client-app.mjs';
import { getKeywordsClientAppScript } from '../src/ui/keywords/keywords-client-app.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';
import { getPulseClientAppScript } from '../src/ui/pulse/pulse-client-app.mjs';

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

test('Hostile Audit 2: safeUrl rejects /\\ protocol-relative bypass and control chars across ESM, PAEFormatters, and all 7 UI client fallbacks', () => {
  const vectors = [
    '/\\evil.com/phish',
    ' /\\evil.com',
    '//evil.com/phish',
    '\u0000javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)'
  ];

  for (const vec of vectors) {
    assert.equal(safeUrl(vec), '#', `ESM safeUrl failed to neutralize: ${JSON.stringify(vec)}`);
  }
  assert.equal(safeUrl('/keywords/minimalist'), '/keywords/minimalist');
  assert.equal(safeUrl('https://pinterest.com/pin/123/'), 'https://pinterest.com/pin/123/');

  // Inline window.PAEFormatters.safeUrl
  const fmtCtx = { window: {}, document: {} };
  vm.createContext(fmtCtx);
  vm.runInContext(extractScriptBody(getInlineFormattersScript()), fmtCtx);
  for (const vec of vectors) {
    assert.equal(fmtCtx.window.PAEFormatters.safeUrl(vec), '#', `PAEFormatters.safeUrl failed: ${JSON.stringify(vec)}`);
  }
  assert.equal(fmtCtx.window.PAEFormatters.safeUrl('/folders/12'), '/folders/12');

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
    if (/SELECT metadata FROM universal_master_pins/i.test(q)) {
      return [{ metadata: {} }];
    }
    if (/DELETE|UPDATE|INSERT/i.test(q)) {
      throw new Error('SIMULATED_PG_25P02_TIMEOUT');
    }
    return [];
  };
  failingDeleteSql.begin = async (cb) => cb(failingDeleteSql);

  const baseCtx = {
    method: 'DELETE',
    env: {},
    ctx: {},
    sql: failingDeleteSql,
    jsonResponse,
    methodNotAllowedResponse: () => jsonResponse({ error: 'method' }, 405),
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil: () => {},
    isValidPinId: (id) => /^\d{10,30}$/.test(String(id || '')),
    redactSecrets: (s) => s
  };

  // 1) Daily snapshot delete
  const dailyRes = await handlePinsRoutes({
    ...baseCtx,
    pathname: '/api/pins/123456789012/snapshots/2026-11-10',
    request: new Request('http://localhost/api/pins/123456789012/snapshots/2026-11-10', { method: 'DELETE' }),
    searchParams: new URLSearchParams()
  });
  assert.equal(dailyRes.status, 500);
  const dailyBody = await dailyRes.json();
  assert.equal(dailyBody.success, false);
  assert.equal(dailyBody.error, 'SNAPSHOT_DELETE_FAILED');

  // 2) Intraday snapshot delete
  const intraRes = await handlePinsRoutes({
    ...baseCtx,
    pathname: '/api/pins/123456789012/snapshots/intra_2026-11-10T12',
    request: new Request('http://localhost/api/pins/123456789012/snapshots/intra_2026-11-10T12', { method: 'DELETE' }),
    searchParams: new URLSearchParams()
  });
  assert.equal(intraRes.status, 500);
  const intraBody = await intraRes.json();
  assert.equal(intraBody.success, false);
  assert.equal(intraBody.error, 'SNAPSHOT_DELETE_FAILED');

  // 3) Daily-metrics route delete
  const dmRes = await handlePinsRoutes({
    ...baseCtx,
    pathname: '/api/pins/123456789012/daily-metrics/2026-11-10',
    request: new Request('http://localhost/api/pins/123456789012/daily-metrics/2026-11-10', { method: 'DELETE' }),
    searchParams: new URLSearchParams()
  });
  assert.equal(dmRes.status, 500);
  const dmBody = await dmRes.json();
  assert.equal(dmBody.success, false);
  assert.equal(dmBody.error, 'SNAPSHOT_DELETE_FAILED');

  // 4) SERP positions route delete
  const serpRes = await handlePinsRoutes({
    ...baseCtx,
    pathname: '/api/pins/123456789012/serp-positions',
    request: new Request('http://localhost/api/pins/123456789012/serp-positions?keyword_id=42', { method: 'DELETE' }),
    searchParams: new URLSearchParams('keyword_id=42')
  });
  assert.equal(serpRes.status, 500);
  const serpBody = await serpRes.json();
  assert.equal(serpBody.success, false);
  assert.equal(serpBody.error, 'SERP_POSITION_DELETE_FAILED');
});

test('Hostile Audit 5: GET /api/creators/pins, /api/competitors/boards, and /api/creators/pin-detail return 503 Retry-After: 3 on DB failure', async () => {
  invalidateEdgeCache('pinarchive');
  invalidateEdgeCache('competitors');
  invalidateEdgeCache('creators');

  const failingSql = async () => {
    const err = new Error('remaining connection slots are reserved');
    err.code = '53300';
    throw err;
  };

  const baseCtx = {
    method: 'GET',
    env: {},
    ctx: {},
    sql: failingSql,
    jsonResponse,
    clampLimit: (v, d, m) => Math.min(Number(v) || d, m),
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil: () => {},
    tripPinterestCircuitBreaker: async () => {}
  };

  const pinsRes = await handleCreatorsRoutes({
    ...baseCtx,
    pathname: '/api/creators/pins',
    request: new Request('http://localhost/api/creators/pins'),
    searchParams: new URLSearchParams()
  });
  assert.equal(pinsRes.status, 503);
  assert.equal(pinsRes.headers.get('Retry-After'), '3');

  const boardsRes = await handleCreatorsRoutes({
    ...baseCtx,
    pathname: '/api/competitors/boards',
    request: new Request('http://localhost/api/competitors/boards?username=chef'),
    searchParams: new URLSearchParams('username=chef')
  });
  assert.equal(boardsRes.status, 503);
  assert.equal(boardsRes.headers.get('Retry-After'), '3');

  const pinDetailRes = await handleCreatorsRoutes({
    ...baseCtx,
    pathname: '/api/creators/pin-detail',
    request: new Request('http://localhost/api/creators/pin-detail?pin_id=123456789012'),
    searchParams: new URLSearchParams('pin_id=123456789012')
  });
  assert.equal(pinDetailRes.status, 503);
  assert.equal(pinDetailRes.headers.get('Retry-After'), '3');
});
