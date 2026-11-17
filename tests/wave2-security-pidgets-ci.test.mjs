import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  verifyApiAuthentication,
  jsonResponse,
  sendJsonResponse,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache
} from '../src/http/security-and-response.mjs';
import { createFastifyApp } from '../src/server.mjs';
import { isReadOnlyQuery, isReadOnlySql } from '../src/db/client.mjs';
import { getCompetitorsOverview, listCompetitors } from '../src/modules/creators/competitors-crud.mjs';
import { fastRefreshCompetitorArchivedPins } from '../src/modules/creators/creator-ingest.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { PINTEREST_JSON_API_HEADERS, fetchPinsBatchFromPidgets } from '../src/core/pinterest/pins.mjs';
import { enrichCandidatesWithPinMetrics } from '../scripts/cluster-intelligence.mjs';
import { prehydrateCreatorCatalogWithPidgets, processCreatorCatalogPin } from '../scripts/creator-velocity-crawler.mjs';

function makeMockSql(handler) {
  return async function mockSql(strings, ...values) {
    return handler(strings.join('?'), values, strings);
  };
}

function makeNoopReply() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  const reply = {
    sent: false,
    code(c) { statusCode = c; return reply; },
    header(k, v) { headers[k.toLowerCase()] = String(v); return reply; },
    send(payload) { body = payload; reply.sent = true; return { status: statusCode, headers, body }; }
  };
  return reply;
}

// =========================================================================
// 1. Auth Hardening: No process.argv heuristics + /api/internal/queue Auth
// =========================================================================
test('verifyApiAuthentication ignores process.argv script filenames in production', async () => {
  const origArgv = [...process.argv];
  const origNodeEnv = process.env.NODE_ENV;
  const origEnv = process.env.ENVIRONMENT;
  const origTestMode = globalThis.__PAE_TEST_MODE__;
  const origApiKey = process.env.API_SECRET_KEY;

  try {
    process.argv = ['node', '/app/test_evil_script.mjs'];
    process.env.NODE_ENV = 'production';
    process.env.ENVIRONMENT = 'production';
    delete globalThis.__PAE_TEST_MODE__;
    delete process.env.API_SECRET_KEY;

    const req = new Request('http://localhost:3000/api/keywords', { method: 'POST' });

    // Missing API_SECRET_KEY in production must fail closed (503 AUTH_NOT_CONFIGURED), even if argv looks like test_*.mjs
    const noKeyRes = await verifyApiAuthentication(req, { ENVIRONMENT: 'production', NODE_ENV: 'production' });
    assert.equal(noKeyRes.authorized, false);
    assert.equal(noKeyRes.status, 503);
    assert.equal(noKeyRes.payload?.error, 'AUTH_NOT_CONFIGURED');

    // Configured key without token must return 401
    const unauthRes = await verifyApiAuthentication(req, {
      ENVIRONMENT: 'production',
      NODE_ENV: 'production',
      API_SECRET_KEY: 'prod-secret-xyz'
    });
    assert.equal(unauthRes.authorized, false);
    assert.equal(unauthRes.status, 401);

    // Valid token authorizes
    const authReq = new Request('http://localhost:3000/api/keywords', {
      method: 'POST',
      headers: { 'x-api-key': 'prod-secret-xyz' }
    });
    const okRes = await verifyApiAuthentication(authReq, {
      ENVIRONMENT: 'production',
      NODE_ENV: 'production',
      API_SECRET_KEY: 'prod-secret-xyz'
    });
    assert.equal(okRes.authorized, true);
  } finally {
    process.argv = origArgv;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origEnv === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = origEnv;
    if (origTestMode === undefined) delete globalThis.__PAE_TEST_MODE__;
    else globalThis.__PAE_TEST_MODE__ = origTestMode;
    if (origApiKey === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = origApiKey;
  }
});

test('createFastifyApp preserves API_SECRET_KEY and enforces auth on GET /api/internal/queue', async () => {
  const origArgv = [...process.argv];
  const origNodeEnv = process.env.NODE_ENV;
  const origEnv = process.env.ENVIRONMENT;
  const origTestMode = globalThis.__PAE_TEST_MODE__;
  const origApiKey = process.env.API_SECRET_KEY;

  const mockSql = makeMockSql(() => [{ alive: 1 }]);
  mockSql.end = async () => {};

  let app = null;
  let appNoKey = null;
  try {
    // Even if process.argv contains test_foo.mjs, production mode keeps API_SECRET_KEY and requires auth
    process.argv = ['node', '/app/scripts/test_fake.mjs'];
    process.env.NODE_ENV = 'production';
    process.env.ENVIRONMENT = 'production';
    delete globalThis.__PAE_TEST_MODE__;
    delete process.env.API_SECRET_KEY;

    app = await createFastifyApp({
      SQL_CLIENT: mockSql,
      NODE_ENV: 'production',
      ENVIRONMENT: 'production',
      API_SECRET_KEY: 'wave2-admin-token'
    });

    const unauthQueue = await app.inject({ method: 'GET', url: '/api/internal/queue' });
    assert.equal(unauthQueue.statusCode, 401);
    assert.match(unauthQueue.headers['cache-control'] || '', /no-store/i);

    const wrongQueue = await app.inject({
      method: 'GET',
      url: '/api/internal/queue',
      headers: { 'x-api-key': 'wrong-token' }
    });
    assert.equal(wrongQueue.statusCode, 401);

    const validHeaderQueue = await app.inject({
      method: 'GET',
      url: '/api/internal/queue',
      headers: { 'x-api-key': 'wave2-admin-token' }
    });
    assert.equal(validHeaderQueue.statusCode, 200);
    assert.equal(validHeaderQueue.headers['cache-control'], 'no-store, no-cache, must-revalidate, private');
    const qBody = validHeaderQueue.json();
    assert.equal(qBody.success, true);

    const validBearerQueue = await app.inject({
      method: 'GET',
      url: '/api/internal/queue',
      headers: { authorization: 'Bearer wave2-admin-token' }
    });
    assert.equal(validBearerQueue.statusCode, 200);

    // Production app missing API_SECRET_KEY fails closed with 503 AUTH_NOT_CONFIGURED on /api/internal/queue
    appNoKey = await createFastifyApp({
      SQL_CLIENT: mockSql,
      NODE_ENV: 'production',
      ENVIRONMENT: 'production'
    });
    const missingKeyQueue = await appNoKey.inject({ method: 'GET', url: '/api/internal/queue' });
    assert.equal(missingKeyQueue.statusCode, 503);
    assert.equal(missingKeyQueue.json().error, 'AUTH_NOT_CONFIGURED');
  } finally {
    if (app) await app.close();
    if (appNoKey) await appNoKey.close();
    process.argv = origArgv;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origEnv === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = origEnv;
    if (origTestMode === undefined) delete globalThis.__PAE_TEST_MODE__;
    else globalThis.__PAE_TEST_MODE__ = origTestMode;
    if (origApiKey === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = origApiKey;
  }
});

// =========================================================================
// 2. Cache-Control: no-store Default When cacheSeconds <= 0
// =========================================================================
test('sendJsonResponse and jsonResponse emit Cache-Control: no-store by default when cacheSeconds === 0', async () => {
  const resDefault = jsonResponse({ ok: true });
  assert.equal(resDefault.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private');
  assert.equal(resDefault.headers.get('pragma'), 'no-cache');

  const resCached = jsonResponse({ ok: true }, 200, 60);
  assert.equal(resCached.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=180');

  const resCustom = jsonResponse({ ok: true }, 200, 0, { 'Cache-Control': 'private, max-age=5' });
  assert.equal(resCustom.headers.get('cache-control'), 'private, max-age=5');

  const reply = makeNoopReply();
  const fastifyResult = sendJsonResponse(reply, { ok: true }, 200, 0);
  assert.equal(fastifyResult.headers['cache-control'], 'no-store, no-cache, must-revalidate, private');
  assert.equal(fastifyResult.headers.pragma, 'no-cache');
});

// =========================================================================
// 3. Hardened isReadOnlySql / isReadOnlyQuery
// =========================================================================
test('isReadOnlySql accepts pure read queries (even with string literals) and rejects mutating vectors', () => {
  assert.equal(isReadOnlySql, isReadOnlyQuery);

  // Valid read queries, including misleading words inside string literals, dollar-quotes, and comments
  assert.equal(isReadOnlySql('SELECT id, title FROM universal_master_pins WHERE pin_id = $1;'), true);
  assert.equal(isReadOnlySql("WITH cte AS (SELECT 1) SELECT * FROM cte WHERE title <> '; DROP TABLE x; FOR UPDATE nextval('s')'"), true);
  assert.equal(isReadOnlySql('SELECT $$FOR UPDATE; DELETE FROM users; nextval(1)$$ AS safe_lit;'), true);
  assert.equal(isReadOnlySql('/* /* nested comment */ DROP TABLE */ EXPLAIN ANALYZE SELECT 1'), true);
  assert.equal(isReadOnlySql("SELECT E'foo\\'bar; MERGE INTO t' AS escaped"), true);

  // Dangerous / non-read-only queries that must be rejected
  assert.equal(isReadOnlySql('SELECT 1; DROP TABLE users'), false);
  assert.equal(isReadOnlySql('SELECT * FROM job_queue FOR UPDATE'), false);
  assert.equal(isReadOnlySql('SELECT * FROM job_queue FOR NO KEY UPDATE'), false);
  assert.equal(isReadOnlySql('SELECT * FROM job_queue FOR SHARE'), false);
  assert.equal(isReadOnlySql("SELECT nextval('pin_id_seq')"), false);
  assert.equal(isReadOnlySql("SELECT setval('pin_id_seq', 99)"), false);
  assert.equal(isReadOnlySql('SELECT pg_advisory_lock(42)'), false);
  assert.equal(isReadOnlySql('SELECT pg_try_advisory_xact_lock(42)'), false);
  assert.equal(isReadOnlySql('MERGE INTO universal_master_pins USING src ON true WHEN MATCHED THEN UPDATE SET save_count = 1'), false);
  assert.equal(isReadOnlySql('COPY universal_master_pins TO STDOUT'), false);
  assert.equal(isReadOnlySql('DO $$ BEGIN PERFORM 1; END $$;'), false);
  assert.equal(isReadOnlySql('CALL refresh_views()'), false);
  assert.equal(isReadOnlySql('INSERT universal_master_pins VALUES (1)'), false);
  assert.equal(isReadOnlySql('WITH ins AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM ins'), false);
});

// =========================================================================
// 4. Prevent SWR Cache Poisoning & Standardize Cold-Start 503 + Retry-After: 3
// =========================================================================
test('Competitors & Keywords hub routes return 503 Retry-After: 3 without poisoning SWR cache', async () => {
  invalidateEdgeCache('competitors');
  invalidateEdgeCache('creators');
  invalidateEdgeCache('keywords');
  invalidateEdgeCache('folders');
  invalidateEdgeCache('pinarchive');
  invalidateEdgeCache('topics');

  const failingSql = makeMockSql(async () => {
    const err = new Error('remaining connection slots are reserved');
    err.code = '53300';
    throw err;
  });

  await assert.rejects(() => getCompetitorsOverview(failingSql), /remaining connection slots/);
  await assert.rejects(() => listCompetitors(failingSql), /remaining connection slots/);

  const baseCtx = {
    method: 'GET',
    env: {},
    ctx: {},
    jsonResponse,
    clampLimit: (v, d, m) => Math.min(Number(v) || d, m),
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil: () => {},
    tripPinterestCircuitBreaker: async () => {}
  };

  // First call fails with DB error -> HTTP 503 + Retry-After: 3
  const failCompetitors = await handleCreatorsRoutes({
    ...baseCtx,
    pathname: '/api/competitors',
    request: new Request('http://127.0.0.1:3000/api/competitors'),
    searchParams: new URLSearchParams(),
    sql: failingSql
  });
  assert.equal(failCompetitors.status, 503);
  assert.equal(failCompetitors.headers.get('retry-after'), '3');

  // Verify cache was NOT poisoned: next call with healthy SQL recovers immediately with 200
  const healthySql = makeMockSql(async (query) => {
    if (query.includes('COUNT(*) FILTER')) {
      return [{ total_accounts: 1, competitor_count: 1, own_count: 0, total_audience: 1000, total_impressions: 2000, total_pins_tracked: 5 }];
    }
    if (query.includes('ORDER BY monthly_reach DESC')) {
      return [{ username: 'top_creator', monthly_reach: 1000 }];
    }
    return [];
  });
  const okCompetitors = await handleCreatorsRoutes({
    ...baseCtx,
    pathname: '/api/competitors',
    request: new Request('http://127.0.0.1:3000/api/competitors'),
    searchParams: new URLSearchParams(),
    sql: healthySql
  });
  assert.equal(okCompetitors.status, 200);
  const okBody = await okCompetitors.json();
  assert.equal(okBody.success, true);

  // Remaining creators & keywords hub data routes return 503 Retry-After: 3 on DB failure
  for (const pathname of ['/api/competitors/rules', '/api/creators/archive-overview', '/api/creators/topics']) {
    const res = await handleCreatorsRoutes({
      ...baseCtx,
      pathname,
      request: new Request(`http://127.0.0.1:3000${pathname}`),
      searchParams: new URLSearchParams(),
      sql: failingSql
    });
    assert.equal(res.status, 503, `Expected 503 for ${pathname}`);
    assert.equal(res.headers.get('retry-after'), '3', `Expected Retry-After: 3 for ${pathname}`);
  }

  for (const pathname of ['/api/keywords', '/api/folders']) {
    const res = await handleKeywordsRoutes({
      ...baseCtx,
      pathname,
      request: new Request(`http://127.0.0.1:3000${pathname}`),
      searchParams: new URLSearchParams(),
      sql: failingSql
    });
    assert.equal(res.status, 503, `Expected 503 for ${pathname}`);
    assert.equal(res.headers.get('retry-after'), '3', `Expected Retry-After: 3 for ${pathname}`);
  }

  // Autocomplete preserves 200 empty_fallback contract (tested by instant-search-autocomplete.test.mjs)
  const autoRes = await handleKeywordsRoutes({
    ...baseCtx,
    pathname: '/api/search/autocomplete',
    request: new Request('http://127.0.0.1:3000/api/search/autocomplete?q=protein'),
    searchParams: new URLSearchParams('q=protein'),
    sql: failingSql
  });
  assert.equal(autoRes.status, 200);
  const autoBody = await autoRes.json();
  assert.equal(autoBody.degraded, true);
  assert.equal(autoBody.source, 'empty_fallback');
});

// =========================================================================
// 5. 50x Pidgets Batching (Headers + Stage 1/Stage 2 Two-Tier Hydration)
// =========================================================================
test('fetchPinsBatchFromPidgets sends JSON API headers and returns hydrated metrics', async () => {
  assert.equal(PINTEREST_JSON_API_HEADERS.Accept, 'application/json');
  assert.equal(PINTEREST_JSON_API_HEADERS['X-Requested-With'], 'XMLHttpRequest');

  const origFetch = globalThis.fetch;
  let capturedInit = null;
  let capturedUrl = null;
  try {
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: [
            {
              id: '111111111111111111',
              repin_count: 320,
              aggregated_pin_data: { aggregated_stats: { saves: 1450, done: 12 } }
            }
          ]
        })
      };
    };

    const resMap = await fetchPinsBatchFromPidgets(['111111111111111111', '222222222222222222']);
    assert.match(capturedUrl, /widgets\.pinterest\.com\/v3\/pidgets\/pins\/info\/\?pin_ids=111111111111111111,222222222222222222/);
    assert.equal(capturedInit.headers.Accept, 'application/json');
    assert.equal(capturedInit.headers['X-Requested-With'], 'XMLHttpRequest');

    const hit = resMap.get('111111111111111111');
    assert.ok(hit);
    assert.equal(hit.saves, 1450);
    assert.equal(hit.repins, 320);
    assert.equal(hit.has_explicit_saves, true);
    assert.equal(resMap.get('222222222222222222')?.is_missing, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Stage-1 50x Pidgets pre-pass minimizes PinResource fallbacks across creator-ingest, cluster-intelligence & velocity crawler', async () => {
  // A) fastRefreshCompetitorArchivedPins
  const ingestSql = makeMockSql(async (query) => {
    if (query.includes('FROM competitor_profiles')) return [{ id: 7, username: 'chef_demo' }];
    if (query.includes('FROM universal_master_pins')) {
      return [
        { pin_id: '100000000000000001', title: 'A', saves: 100, repins: 20, comments: 1, has_annotations: true },
        { pin_id: '100000000000000002', title: 'B', saves: 50, repins: 10, comments: 0, has_annotations: false },
        { pin_id: '100000000000000003', title: 'C', saves: 80, repins: 15, comments: 0, has_annotations: true }
      ];
    }
    return [];
  });

  let batchCalls = 0;
  const fallbackPinIds = [];
  const fastRefreshRes = await fastRefreshCompetitorArchivedPins(ingestSql, 7, {
    fetchPinsBatchFromPidgets: async (ids) => {
      batchCalls++;
      assert.deepEqual(ids, ['100000000000000001', '100000000000000002', '100000000000000003']);
      return new Map([
        ['100000000000000001', { pin_id: '100000000000000001', saves: 220, repins: 40, has_explicit_saves: true, is_missing: false }],
        ['100000000000000002', { pin_id: '100000000000000002', saves: 95, repins: 18, has_explicit_saves: true, is_missing: false }],
        ['100000000000000003', { pin_id: '100000000000000003', is_missing: true }]
      ]);
    },
    fetchPinFromPinResource: async (pid) => {
      fallbackPinIds.push(pid);
      return { pin_id: pid, saves: 120, repins: 25, has_explicit_saves: true, annotations: [{ name: 'Protein' }] };
    }
  });
  assert.equal(batchCalls, 1);
  assert.equal(fastRefreshRes.pidgets_hits, 1);
  assert.equal(fastRefreshRes.fallback_count, 2);
  assert.deepEqual(fallbackPinIds, ['100000000000000002', '100000000000000003']);

  // B) cluster-intelligence enrichCandidatesWithPinMetrics
  const updatedPayloads = [];
  const clusterSql = makeMockSql(async (query, values) => {
    if (query.includes('UPDATE candidate_graph_nodes')) {
      updatedPayloads.push(JSON.parse(values[0]));
      return [];
    }
    return [];
  });
  const clusterFallbackIds = [];
  const enrichStats = await enrichCandidatesWithPinMetrics(
    '999000000000000001',
    {},
    [
      { candidate_pin_id: '900000000000000001', saves: 500, daily_velocity: 10, age_days: 50 },
      { candidate_pin_id: '900000000000000002', saves: 300, daily_velocity: 6, age_days: 50 }
    ],
    {
      sql: clusterSql,
      fetchPinsBatchFromPidgets: async (ids) => new Map([
        [ids[0], { pin_id: ids[0], repins: 111, saves: 520, is_missing: false }],
        [ids[1], { pin_id: ids[1], is_missing: true }]
      ]),
      fetchPinDetails: async (pid) => {
        clusterFallbackIds.push(pid);
        return { id: pid, repins: 77, saves: 310, reactions: {} };
      }
    }
  );
  assert.equal(enrichStats.pidgetsHits, 1);
  assert.equal(enrichStats.fallbackCalls, 1);
  assert.equal(enrichStats.enriched, 2);
  assert.deepEqual(clusterFallbackIds, ['900000000000000002']);
  assert.equal(updatedPayloads.length, 1);

  // C) creator-velocity-crawler prehydrateCreatorCatalogWithPidgets + processCreatorCatalogPin
  const slicePins = [
    { pin_id: '800000000000000001', saves: 400, repins: 80, visual_annotations: [{ name: 'Meal Prep' }], last_scraped_at: null },
    { pin_id: '800000000000000002', saves: 200, repins: 40, visual_annotations: [], last_scraped_at: null }
  ];
  let preBatchIds = null;
  const pidgetsMap = await prehydrateCreatorCatalogWithPidgets(slicePins, {
    useFreshnessGate: false,
    batchPidgetsFn: async (ids) => {
      preBatchIds = ids;
      return new Map([
        ['800000000000000001', { pin_id: '800000000000000001', saves: 450, repins: 90, has_explicit_saves: true, has_explicit_repins: true, is_missing: false }]
      ]);
    }
  });
  assert.deepEqual(preBatchIds, ['800000000000000001']);

  const resourceCalls = [];
  const collectors = { refreshedPins: [], metricSnapshots: [], masterPinsToSync: [] };
  await processCreatorCatalogPin(slicePins[0], {
    fallbackUsername: 'chef_demo',
    pidgetsMap,
    fetchPinFromPinResourceFn: async (id) => { resourceCalls.push(id); return null; },
    fetchPinFromPinterestFn: async () => null
  }, collectors);
  assert.equal(resourceCalls.length, 0);
  assert.equal(collectors.refreshedPins.length, 1);
  assert.equal(collectors.refreshedPins[0].saves, 450);

  await processCreatorCatalogPin(slicePins[1], {
    fallbackUsername: 'chef_demo',
    pidgetsMap,
    fetchPinFromPinResourceFn: async (id) => {
      resourceCalls.push(id);
      return { pin_id: id, saves: 230, repins: 45, has_explicit_saves: true, has_explicit_repins: true, annotations: [{ name: 'Salad' }] };
    },
    fetchPinFromPinterestFn: async () => null
  }, collectors);
  assert.deepEqual(resourceCalls, ['800000000000000002']);
  assert.equal(collectors.refreshedPins.length, 2);
});

// =========================================================================
// 6. CI Deduplication & cloudflared-linux-amd64 Caching
// =========================================================================
test('CI workflow deduplicates npm test and setup-instabox-db caches cloudflared-linux-amd64', () => {
  const rootDir = path.resolve(process.cwd());
  const ciYaml = fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');
  assert.equal(ciYaml.includes('node --test tests/*.mjs && npm test'), false);
  assert.match(ciYaml, /run:\s*npm test/);

  const actionYaml = fs.readFileSync(path.join(rootDir, '.github/actions/setup-instabox-db/action.yml'), 'utf8');
  assert.match(actionYaml, /uses:\s*actions\/cache@v4/);
  assert.match(actionYaml, /cloudflared-linux-amd64/);
});
