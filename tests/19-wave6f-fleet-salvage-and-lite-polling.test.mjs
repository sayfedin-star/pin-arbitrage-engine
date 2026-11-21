/**
 * tests/19-wave6f-fleet-salvage-and-lite-polling.test.mjs
 *
 * Wave 6F — Phase 1 Offline Unit & Contract Test Suite:
 * 1. Migration 011 structure & PG16 HOT-update hygiene (ZERO secondary indexes on newborn_runs)
 * 2. Settings cap alignment (`max_queries_per_run` accepts 100, clamps >100 to 100, default 25)
 * 3. Dual-domain circuit breakers (`www.pinterest.com` discovery vs `widgets.pinterest.com` Pidgets + AbortError safety)
 * 4. `harvestBoardMoreIdeasSurface` (`BoardContentRecommendationResource/get` Zone A + single page-1 legacy fallback)
 * 5. `harvestRelatedPinSnowballSurface` (canonical 2026 payload + `last_http_status`/`error` diagnostics)
 * 6. Stage 1 Rate-Limit Partial Salvage (`partial_rate_limited` + 1-pin serial HALF_OPEN probe guard)
 * 7. Cooperative Cancellation (`POST /api/newborn/runs/:id/cancel` + AbortSignal + GitHub cancel)
 * 8. Sub-2ms `inMemoryRunProgressCache` hit on `GET /api/newborn/runs/:id?lite=1` + lite DB fallback projection
 * 9. Execution-Mode Router (`auto` / `direct` / `fleet`) + Fleet bypass of local IP breaker + 100-keyword Fleet cap
 * 10. HTTP 431 query-length/shape guard on `GET /api/newborn/idea-intelligence`
 * 11. `scripts/newborn-fleet.mjs` `db_run` mode (`dispatch`, round-robin `worker`, `consolidate`) & `newborn-hunter.yml`
 * 12. Shard-safe atomic SQL (`upsertStagedCandidatesBatch`) + `shardMode: true` isolation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PinterestCircuitBreaker,
  CircuitBreakerOpenError,
  globalPinterestCircuitBreaker,
  globalPidgetsCircuitBreaker
} from '../src/core/pinterest/client.mjs';
import {
  NewbornCookieRouter,
  COOKIE_ZONES,
  ENDPOINT_BOUNDARY_RULES,
  resolveUrlCookieZone
} from '../src/modules/newborn/cookie-router.mjs';
import {
  DEFAULT_NEWBORN_SETTINGS,
  normalizeNewbornSettings
} from '../src/modules/newborn/settings.mjs';
import { harvestBoardMoreIdeasSurface } from '../src/modules/newborn/surface-search-boards.mjs';
import { harvestRelatedPinSnowballSurface } from '../src/modules/newborn/surface-social-snowball.mjs';
import {
  executeNewbornHarvestPipeline,
  upsertStagedCandidatesBatch
} from '../src/modules/newborn/harvester.mjs';
import {
  getNewbornRunById,
  getInMemoryRunProgress,
  enqueueNewbornRun,
  createFleetBackedNewbornRun,
  cancelNewbornRun,
  clearNewbornInflightRunsForTest
} from '../src/modules/newborn/run-queue.mjs';
import {
  handleNewbornRoutes,
  computeEstimatedPinBudget,
  resolveExecutionMode
} from '../src/routes/newborn.mjs';
import {
  parseNewbornFleetArgs,
  runNewbornFleetDispatch,
  runNewbornFleetWorker,
  runNewbornFleetConsolidate
} from '../scripts/newborn-fleet.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const TEST_AUTH_COOKIE = '_pinterest_sess=TWc9PSZtest_session_value_1234567890; csrftoken=abcdef123456; _auth=1';

// ---------------------------------------------------------------------------
// 1. Migration 011 Structure & PG16 HOT-Update Hygiene
// ---------------------------------------------------------------------------
test('Wave 6F [1]: Migration 011 adds all 9 columns, updates constraints, and adds ZERO indexes on newborn_runs', () => {
  const sqlPath = path.join(REPO_ROOT, 'scripts/migrations/011_wave6f_fleet_runs_and_salvage.sql');
  assert.ok(fs.existsSync(sqlPath), '011_wave6f_fleet_runs_and_salvage.sql must exist');
  const content = fs.readFileSync(sqlPath, 'utf8');

  const expectedColumns = [
    'execution_mode',
    'config_snapshot',
    'selected_keywords',
    'shards_total',
    'shards_completed',
    'shards_failed',
    'github_run_id',
    'github_run_url',
    'cancel_requested_at'
  ];
  for (const col of expectedColumns) {
    assert.ok(
      content.includes(`ADD COLUMN IF NOT EXISTS ${col}`),
      `Migration 011 must idempotently add column ${col}`
    );
  }

  assert.ok(content.includes('chk_nr_status'), 'Must update chk_nr_status');
  for (const st of ['queued', 'running', 'completed', 'partial', 'partial_rate_limited', 'cancelled', 'failed']) {
    assert.ok(content.includes(`'${st}'`), `chk_nr_status must allow '${st}'`);
  }
  assert.ok(content.includes('chk_nr_execution_mode'), 'Must add chk_nr_execution_mode');
  assert.ok(content.includes("'direct'") && content.includes("'fleet'"), 'chk_nr_execution_mode must allow direct & fleet');

  // Strict PG16 HOT-update hygiene: ZERO CREATE INDEX statements on newborn_runs
  assert.equal(/CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(content), false, 'Migration 011 must NOT create any secondary indexes on newborn_runs');
});

// ---------------------------------------------------------------------------
// 2. Settings Cap Alignment
// ---------------------------------------------------------------------------
test('Wave 6F [2]: Settings cap allows max_queries_per_run up to 100 while preserving default 25', () => {
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.max_queries_per_run, 25);

  const at100 = normalizeNewbornSettings({ discovery: { max_queries_per_run: 100 } });
  assert.equal(at100.discovery.max_queries_per_run, 100);

  const over100 = normalizeNewbornSettings({ discovery: { max_queries_per_run: 250 } });
  assert.equal(over100.discovery.max_queries_per_run, 100);

  const under1 = normalizeNewbornSettings({ discovery: { max_queries_per_run: 0 } });
  assert.equal(under1.discovery.max_queries_per_run, 1);
});

// ---------------------------------------------------------------------------
// 3. Dual-Domain Circuit Breakers & AbortError Safety
// ---------------------------------------------------------------------------
test('Wave 6F [3]: Dual-domain circuit breakers isolate discovery from Pidgets and never count AbortError as failure', async () => {
  assert.notEqual(globalPinterestCircuitBreaker, globalPidgetsCircuitBreaker);

  const discoveryBreaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
  const pidgetsBreaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });

  // Open discovery breaker
  discoveryBreaker.recordFailure(429);
  discoveryBreaker.recordFailure(429);
  assert.equal(discoveryBreaker.getState().state, 'OPEN');
  assert.ok(discoveryBreaker.getRemainingCooldownMs() > 0 && discoveryBreaker.getRemainingCooldownMs() <= 10_000);
  assert.equal(pidgetsBreaker.getRemainingCooldownMs(), 0);

  const seenUrls = [];
  const mockFetch = async (url, init) => {
    seenUrls.push({ url: String(url), cookie: init?.headers?.Cookie || '' });
    if (String(url).includes('widgets.pinterest.com/v3/pidgets')) {
      return new Response(JSON.stringify({ data: [{ id: '123456789012', repin_count: 88 }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ resource_response: { data: [] } }), { status: 200 });
  };

  const router = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker,
    pidgetsBreaker,
    fetchImpl: mockFetch
  });

  // Discovery endpoint MUST fail fast with CircuitBreakerOpenError
  await assert.rejects(
    () => router.requestJson('https://www.pinterest.com/resource/BaseSearchResource/get/?data={}', {
      endpointRule: ENDPOINT_BOUNDARY_RULES.search_pins
    }),
    (err) => err instanceof CircuitBreakerOpenError
  );

  // Pidgets endpoint MUST STILL SUCCEED with zero cookie because it uses pidgetsBreaker!
  const pidgetRes = await router.requestJson('https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=123456789012', {
    endpointRule: ENDPOINT_BOUNDARY_RULES.pidgets
  });
  assert.equal(pidgetRes.status, 200);
  assert.equal(seenUrls.length, 1);
  assert.equal(seenUrls[0].cookie, '');
  assert.equal(pidgetsBreaker.getState().state, 'CLOSED');

  // AbortError must NEVER increment breaker failures
  const abortDiscoveryBreaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
  const ac = new AbortController();
  ac.abort();
  const abortRouter = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker: abortDiscoveryBreaker,
    pidgetsBreaker,
    fetchImpl: async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
  });
  await assert.rejects(
    () => abortRouter.requestJson('https://www.pinterest.com/resource/BaseSearchResource/get/?data={}', {
      endpointRule: ENDPOINT_BOUNDARY_RULES.search_pins,
      signal: ac.signal
    }),
    (err) => err.name === 'AbortError'
  );
  assert.equal(abortDiscoveryBreaker.getState().consecutiveFailures, 0);
  assert.equal(abortDiscoveryBreaker.getState().state, 'CLOSED');
});

// ---------------------------------------------------------------------------
// 4. Board "Find More Ideas" -> BoardContentRecommendationResource/get + Fallback
// ---------------------------------------------------------------------------
test('Wave 6F [4]: harvestBoardMoreIdeasSurface calls BoardContentRecommendationResource/get in Zone A with single page-1 legacy fallback', async () => {
  // Verify cookie zone routing maps BoardContentRecommendationResource/get to Zone A
  const resolvedRule = resolveUrlCookieZone('https://www.pinterest.com/resource/BoardContentRecommendationResource/get/?data={}');
  assert.equal(resolvedRule.zone, COOKIE_ZONES.AUTH_SESSION);
  assert.equal(resolvedRule.requiresAuthCookie, true);

  // Case A: Primary BoardContentRecommendationResource/get succeeds
  const primaryCalls = [];
  const routerPrimary = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
    fetchImpl: async (url, init) => {
      primaryCalls.push({ url: String(url), cookie: init?.headers?.Cookie || '' });
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            results: [
              { id: '71000000000001', type: 'pin', title: 'Primary Rec Pin', repin_count: 55 }
            ]
          }
        }
      }), { status: 200 });
    }
  });

  const primaryRes = await harvestBoardMoreIdeasSurface(
    routerPrimary,
    { board_id: '55551111', url: '/chef/soups/', owner_username: 'chef' },
    { maxPages: 1, pageSize: 25, targetPins: 25 }
  );
  assert.equal(primaryCalls.length, 1);
  assert.ok(primaryCalls[0].url.includes('BoardContentRecommendationResource/get'));
  assert.ok(primaryCalls[0].cookie.includes('_auth=1'));
  assert.equal(primaryRes.pins.length, 1);
  assert.equal(primaryRes.pins[0].pin_id, '71000000000001');

  // Case B: Page-1 returns 404 -> falls back once to legacy BoardFeedResource/get
  const fallbackCalls = [];
  const routerFallback = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
    fetchImpl: async (url) => {
      fallbackCalls.push(String(url));
      if (String(url).includes('BoardContentRecommendationResource/get')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({
        resource_response: {
          data: [
            { id: '71000000000002', type: 'pin', title: 'Legacy Fallback Pin', repin_count: 42 }
          ]
        }
      }), { status: 200 });
    }
  });

  const fallbackRes = await harvestBoardMoreIdeasSurface(
    routerFallback,
    { board_id: '55551111', url: '/chef/soups/', owner_username: 'chef' },
    { maxPages: 1, pageSize: 25, targetPins: 25 }
  );
  assert.equal(fallbackCalls.length, 2);
  assert.ok(fallbackCalls[0].includes('BoardContentRecommendationResource/get'));
  assert.ok(fallbackCalls[1].includes('BoardFeedResource/get'));
  assert.equal(fallbackRes.pins.length, 1);
  assert.equal(fallbackRes.pins[0].pin_id, '71000000000002');
});

// ---------------------------------------------------------------------------
// 5. Related Pin Snowball Canonical 2026 Payload & Diagnostics
// ---------------------------------------------------------------------------
test('Wave 6F [5]: harvestRelatedPinSnowballSurface sends canonical 2026 RelatedModulesResource payload and surfaces failure diagnostics', async () => {
  const captured = [];
  const routerOk = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
    fetchImpl: async (url, init) => {
      captured.push({ url: String(url), headers: init?.headers || {} });
      return new Response(JSON.stringify({
        resource_response: {
          data: [
            { id: '395542779798156799', type: 'pin', title: 'Related Pin Match', repin_count: 91 }
          ]
        }
      }), { status: 200 });
    }
  });

  const okRes = await harvestRelatedPinSnowballSurface(routerOk, '395542779798156718', {
    maxPages: 1,
    pageSize: 30 // should clamp to 24
  });
  assert.equal(okRes.pins.length, 1);
  assert.equal(okRes.last_http_status, 200);
  assert.equal(okRes.error, null);
  assert.equal(captured.length, 1);

  const parsedUrl = new URL(captured[0].url);
  const dataParam = JSON.parse(parsedUrl.searchParams.get('data'));
  assert.deepEqual(dataParam.options.additional_fields, ['pin.gen_ai_topics']);
  assert.equal(dataParam.options.source, 'deep_linking');
  assert.equal(dataParam.options.top_level_source, 'deep_linking');
  assert.equal(dataParam.options.page_size, 24);
  assert.equal(dataParam.options.is_pdp, false);
  assert.equal(dataParam.options.field_set_key, undefined);
  assert.equal(dataParam.options.add_vase, undefined);
  assert.equal(captured[0].headers.Origin, 'https://www.pinterest.com');
  assert.equal(captured[0].headers['Screen-Dpr'], '1');

  // Failure path: must return explicit last_http_status & error instead of silent 0-pin swallow
  const router412 = new NewbornCookieRouter({
    rawCookie: TEST_AUTH_COOKIE,
    discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
    fetchImpl: async () => new Response('Precondition Failed', { status: 412 })
  });
  const failRes = await harvestRelatedPinSnowballSurface(router412, '395542779798156718', {
    maxPages: 1
  });
  assert.equal(failRes.pins.length, 0);
  assert.equal(failRes.last_http_status, 412);
  assert.ok(failRes.error && failRes.error.includes('412'));
});

// ---------------------------------------------------------------------------
// 6. Stage 1 Rate-Limit Partial Salvage + 1-Pin Serial HALF_OPEN Probe Guard
// ---------------------------------------------------------------------------
test('Wave 6F [6]: Discovery rate-limit trips partial salvage, preserves scrolled pins via Pidgets + serial probe, and finalizes partial_rate_limited', async () => {
  const nowMs = Date.now();
  const fiveDaysAgo = new Date(nowMs - 5 * 86400 * 1000).toUTCString();
  const discoveryBreaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 40 });
  const pidgetsBreaker = new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 });

  let searchPageCalls = 0;
  let pinHydrationConcurrency = 0;
  let firstPinHydrationMaxConcurrency = 0;
  let pinHydrationCount = 0;
  const runUpdates = [];

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('INSERT INTO newborn_runs')) return [{ id: 601 }];
    if (q.includes('UPDATE newborn_runs')) {
      runUpdates.push({ query: q, values });
      return [];
    }
    if (q.includes('FROM newborn_engine_settings')) return [];
    if (q.includes('FROM newborn_rule_profiles')) return [];
    return [];
  };

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource/get') && decodeURIComponent(u).includes('"scope":"pins"')) {
      searchPageCalls++;
      if (searchPageCalls === 1) {
        return new Response(JSON.stringify({
          resource_response: {
            bookmark: 'bm_page_2',
            data: {
              results: [
                { id: '91000000000001', type: 'pin', title: 'Salvage Pin 1', repin_count: 80, created_at: fiveDaysAgo },
                { id: '91000000000002', type: 'pin', title: 'Salvage Pin 2', repin_count: 95, created_at: fiveDaysAgo }
              ]
            }
          }
        }), { status: 200 });
      }
      // Page 2 & 3 return 429 -> trips discoveryBreaker to OPEN!
      return new Response('Too Many Requests', { status: 429 });
    }
    if (u.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
      return new Response(JSON.stringify({
        data: [
          { id: '91000000000001', repin_count: 80, aggregated_pin_data: { aggregated_stats: { saves: 110 } }, domain: 'salvage1.com' },
          { id: '91000000000002', repin_count: 95, aggregated_pin_data: { aggregated_stats: { saves: 140 } }, domain: 'salvage2.com' }
        ]
      }), { status: 200 });
    }
    if (u.includes('PinResource/get')) {
      pinHydrationCount++;
      pinHydrationConcurrency++;
      if (pinHydrationCount === 1) {
        firstPinHydrationMaxConcurrency = Math.max(firstPinHydrationMaxConcurrency, pinHydrationConcurrency);
      }
      await new Promise((r) => setTimeout(r, 10));
      pinHydrationConcurrency--;
      const m = u.match(/"id"%3A"(\d+)"/) || u.match(/"id":"(\d+)"/);
      const pid = m ? m[1] : '91000000000001';
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: pid,
            title: `Salvaged Winner ${pid}`,
            created_at: fiveDaysAgo,
            repin_count: 85,
            aggregated_pin_data: { aggregated_stats: { saves: 120 } },
            domain: 'salvage.com'
          }
        }
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ resource_response: { data: null } }), { status: 200 });
  };

  const res = await executeNewbornHarvestPipeline(mockSql, {
    seedQueries: ['salvage soup', 'second keyword'],
    rawCookieOverride: TEST_AUTH_COOKIE,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 4, page_size: 50, target_pins: 200 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        }
      },
      qualification: { max_age_days: 30, min_repin_count: 20, min_save_count: 0 }
    },
    routerOptions: {
      discoveryBreaker,
      pidgetsBreaker,
      fetchImpl: mockFetch,
      jitterMinMs: 0,
      jitterMaxMs: 0
    },
    nowMs
  });

  assert.equal(res.status, 'partial_rate_limited');
  assert.equal(res.stop_reason, 'rate_limited_discovery');
  assert.ok(res.salvaged_pins_count >= 2, 'Must salvage scrolled pins from page 1');
  assert.equal(res.stats.candidates_qualified, 2, 'Both salvaged pins must verify as winners');
  assert.equal(firstPinHydrationMaxConcurrency, 1, 'First HALF_OPEN probe hydration must run strictly serially (concurrency=1)');
  assert.ok(runUpdates.some((u) => u.values.includes('partial_rate_limited')));
});

// ---------------------------------------------------------------------------
// 7 & 8. Sub-2ms In-Memory Cache Hit, Lite DB Fallback & Cooperative Cancellation
// ---------------------------------------------------------------------------
test('Wave 6F [7 & 8]: Direct run populates sub-2ms ?lite=1 cache (0 DB queries), supports lite DB fallback, and cancels cooperatively', async () => {
  clearNewbornInflightRunsForTest();

  let dbReads = 0;
  let lastDbStatus = 'running';
  let abortObserved = false;

  const mockSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('SELECT id, status, execution_mode')) {
      return []; // no inflight dedupe
    }
    if (q.includes('INSERT INTO newborn_runs')) {
      return [{
        id: 701,
        run_type: 'discovery',
        execution_mode: 'direct',
        status: 'running',
        progress_stage: 'queued',
        progress_detail: 'Queued',
        progress_pct: 2,
        shards_total: 1,
        shards_completed: 0,
        shards_failed: 0,
        seed_queries: ['fall wreaths']
      }];
    }
    if (q.includes('UPDATE newborn_runs') && q.includes("status = 'cancelled'")) {
      lastDbStatus = 'cancelled';
      return [{ id: 701, status: 'cancelled', execution_mode: 'direct', github_run_id: null }];
    }
    if (q.includes('SELECT') && q.includes('FROM newborn_runs') && q.includes('WHERE id =')) {
      dbReads++;
      return [{
        id: 702,
        run_type: 'discovery',
        execution_mode: 'fleet',
        status: 'running',
        progress_stage: 'running',
        progress_detail: 'Fleet running',
        progress_pct: 50,
        shards_total: 8,
        shards_completed: 4,
        shards_failed: 0,
        candidates_discovered: 1200,
        candidates_qualified: 44,
        golden_pins_count: 19,
        telemetry: { funnel: { scrolled_pins: 1200, matched_repins: 110, hydrated_pins: 90, verified_winners: 44 } }
      }];
    }
    return [];
  };

  let releaseWorker;
  const workerReady = new Promise((resolve) => { releaseWorker = resolve; });

  const enqueued = await enqueueNewbornRun(mockSql, {
    runType: 'discovery',
    seedQueries: ['fall wreaths'],
    workerExecutor: async ({ signal, onProgress }) => {
      onProgress({
        stage: 'harvesting',
        detail: 'Scrolling pins...',
        pct: 35,
        funnel: { scrolled_pins: 250, matched_repins: 0, hydrated_pins: 0, verified_winners: 0 }
      });
      releaseWorker();
      await new Promise((resolve, reject) => {
        if (signal.aborted) {
          abortObserved = true;
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
          return;
        }
        signal.addEventListener('abort', () => {
          abortObserved = true;
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        }, { once: true });
      });
    }
  });

  assert.equal(enqueued.run_id, 701);
  await workerReady;

  // Sub-2ms in-memory cache hit for active Direct run MUST NOT hit DB!
  dbReads = 0;
  const cachedDirect = await getNewbornRunById(mockSql, 701, { lite: true });
  assert.equal(dbReads, 0, 'Active Direct run ?lite=1 must be served directly from inMemoryRunProgressCache');
  assert.equal(cachedDirect.progress_pct, 35);
  assert.equal(cachedDirect.telemetry.funnel.scrolled_pins, 250);
  assert.ok(getInMemoryRunProgress(701));

  // Uncached / Fleet run ?lite=1 falls back to lightweight DB projection preserving nested telemetry.funnel
  const liteFleetSql = async () => [{
    id: 702,
    run_type: 'discovery',
    execution_mode: 'fleet',
    status: 'running',
    progress_stage: 'running',
    progress_detail: 'Fleet running',
    progress_pct: 50,
    shards_total: 8,
    shards_completed: 4,
    shards_failed: 0,
    candidates_discovered: 1200,
    candidates_qualified: 44,
    golden_pins_count: 19,
    telemetry_funnel: { scrolled_pins: 1200, matched_repins: 110, hydrated_pins: 90, verified_winners: 44 },
    telemetry_idea_page: null,
    stop_reason: null,
    surface_diagnostics: null
  }];
  const liteFleet = await getNewbornRunById(liteFleetSql, 702, { lite: true });
  assert.equal(liteFleet.execution_mode, 'fleet');
  assert.equal(liteFleet.telemetry.funnel.scrolled_pins, 1200);
  assert.equal(liteFleet.telemetry.funnel.verified_winners, 44);

  // Cooperative cancel aborts active Direct run and finalizes as 'cancelled' (never 'failed')
  const cancelRes = await cancelNewbornRun(mockSql, 701, { env: {} });
  assert.equal(cancelRes.cancelled, true);
  assert.equal(abortObserved, true, 'AbortController signal must fire immediately on cancel');

  // Allow background promise microtask to settle
  await new Promise((r) => setTimeout(r, 30));
  const afterCancel = getInMemoryRunProgress(701);
  assert.equal(afterCancel.status, 'cancelled');
  assert.equal(lastDbStatus, 'cancelled');

  // Fleet run cancellation invokes GitHub Actions cancel endpoint
  const ghCancelUrls = [];
  const fleetSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('SELECT id, run_type, status, execution_mode, github_run_id')) {
      return [{ id: 888, run_type: 'discovery', status: 'running', execution_mode: 'fleet', github_run_id: 987654321 }];
    }
    return [{ id: 888, status: 'cancelled', execution_mode: 'fleet', github_run_id: 987654321 }];
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    ghCancelUrls.push({ url: String(url), method: init?.method });
    return new Response('', { status: 202 });
  };
  try {
    const fleetCancel = await cancelNewbornRun(fleetSql, 888, {
      env: { GITHUB_TOKEN: 'ghp_test_token', GITHUB_REPOSITORY: 'owner/repo' }
    });
    assert.equal(fleetCancel.cancelled, true);
    assert.equal(fleetCancel.github_cancelled, true);
    assert.equal(ghCancelUrls.length, 1);
    assert.ok(ghCancelUrls[0].url.includes('/actions/runs/987654321/cancel'));
    assert.equal(ghCancelUrls[0].method, 'POST');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 9 & 10. Execution-Mode Router, Fleet Breaker Bypass, 100-Kw Cap & HTTP 431 Guard
// ---------------------------------------------------------------------------
test('Wave 6F [9 & 10]: Execution-mode router, Fleet breaker bypass, 100-keyword cap, and HTTP 431 idea-intelligence guard', async () => {
  // Pure unit checks for computeEstimatedPinBudget & resolveExecutionMode
  const budget1 = computeEstimatedPinBudget({
    paths: { search: { enabled: true, target_pins: 5000 }, boards: { enabled: true, max_boards: 8, target_pins_per_board: 100 } }
  }, 1);
  assert.equal(budget1, 5800);

  const autoHeavy = resolveExecutionMode({
    requestedMode: 'auto',
    keywordsCount: 1,
    estimatedPins: 5800,
    env: { GITHUB_TOKEN: 'ghp_fake', GITHUB_REPOSITORY: 'o/r' }
  });
  assert.equal(autoHeavy.mode, 'fleet');

  const autoMultiKw = resolveExecutionMode({
    requestedMode: 'auto',
    keywordsCount: 4,
    estimatedPins: 1000,
    env: { GITHUB_TOKEN: 'ghp_fake', GITHUB_REPOSITORY: 'o/r' }
  });
  assert.equal(autoMultiKw.mode, 'fleet');

  const fleetNoToken = resolveExecutionMode({
    requestedMode: 'fleet',
    keywordsCount: 10,
    estimatedPins: 5000,
    env: {}
  });
  assert.equal(fleetNoToken.error, 'GITHUB_TOKEN_MISSING');
  assert.equal(fleetNoToken.status, 400);

  // Route-level helper
  const callRoute = async ({ method = 'POST', pathname, search = '', body = null, env = {}, breakerOpen = false, fetchImpl = null }) => {
    const url = new URL(`http://localhost:3000${pathname}${search}`);
    let statusCode = 200;
    let payload = null;
    const headers = {};
    const reply = {
      header(key, value) {
        headers[key] = value;
        return reply;
      }
    };
    const jsonResponse = (data, status = 200) => {
      statusCode = status;
      payload = data;
      return { status, data, headers };
    };
    const mockSql = async (strings, ...values) => {
      const q = strings.join(' ').replace(/\s+/g, ' ').trim();
      if (q.includes('INSERT INTO newborn_runs')) {
        return [{
          id: 901,
          run_type: 'discovery',
          execution_mode: 'fleet',
          status: 'queued',
          shards_total: 8,
          selected_keywords: values.find((v) => typeof v === 'string' && v.startsWith('[')) || '[]'
        }];
      }
      return [];
    };

    const origFetch = globalThis.fetch;
    if (fetchImpl) globalThis.fetch = fetchImpl;
    try {
      await handleNewbornRoutes({
        request: { method, json: async () => (body || {}) },
        reply,
        searchParams: url.searchParams,
        pathname,
        method,
        sql: mockSql,
        env,
        ctx: null,
        jsonResponse,
        methodNotAllowedResponse: (allow) => jsonResponse({ error: 'METHOD_NOT_ALLOWED', allow }, 405),
        redactSecrets: (v) => String(v || ''),
        checkPinterestCircuitBreaker: async () => (
          breakerOpen
            ? { active: true, remaining_seconds: 27, reason: 'Pinterest rate limit' }
            : { active: false, remaining_seconds: 0, reason: null }
        )
      });
    } finally {
      if (fetchImpl) globalThis.fetch = origFetch;
    }
    return { statusCode, payload, headers };
  };

  // A. Direct discover when breaker is OPEN returns 429 with Retry-After + X-Circuit-Breaker: OPEN
  const directBlocked = await callRoute({
    pathname: '/api/newborn/discover',
    body: { query: 'soup', execution_mode: 'direct' },
    breakerOpen: true
  });
  assert.equal(directBlocked.statusCode, 429);
  assert.equal(directBlocked.headers['X-Circuit-Breaker'], 'OPEN');
  assert.ok(Number(directBlocked.headers['Retry-After']) >= 1);

  // B. Fleet cluster/hunt with 60 keywords BYPASSES local OPEN breaker and dispatches GitHub workflow!
  const ghDispatches = [];
  const sixtyKeywords = Array.from({ length: 60 }, (_, i) => `soup recipe ${i + 1}`);
  const fleetAllowed = await callRoute({
    pathname: '/api/newborn/cluster/hunt',
    body: { keywords: sixtyKeywords, execution_mode: 'auto', shards: 12 },
    env: { GITHUB_TOKEN: 'ghp_test', GITHUB_REPOSITORY: 'owner/repo' },
    breakerOpen: true,
    fetchImpl: async (u, init) => {
      ghDispatches.push({ url: String(u), body: JSON.parse(init.body) });
      return new Response(null, { status: 204 });
    }
  });
  assert.equal(fleetAllowed.statusCode, 202);
  assert.equal(fleetAllowed.payload.execution_mode, 'fleet');
  assert.equal(fleetAllowed.payload.selected_keywords_count, 60);
  assert.equal(ghDispatches.length, 1);
  assert.equal(ghDispatches[0].body.inputs.mode, 'db_run');
  assert.equal(ghDispatches[0].body.inputs.run_id, '901');

  // C. Explicit fleet without GITHUB_TOKEN returns 400 GITHUB_TOKEN_MISSING
  const fleetMissingTok = await callRoute({
    pathname: '/api/newborn/cluster/hunt',
    body: { keywords: ['soup', 'chili'], execution_mode: 'fleet' },
    env: {}
  });
  assert.equal(fleetMissingTok.statusCode, 400);
  assert.equal(fleetMissingTok.payload.error, 'GITHUB_TOKEN_MISSING');

  // D. HTTP 431 query-length/shape guard on GET /api/newborn/idea-intelligence
  let upstreamCalled = false;
  const oversizedRes = await callRoute({
    method: 'GET',
    pathname: '/api/newborn/idea-intelligence',
    search: `?q=${encodeURIComponent('a'.repeat(180))}`,
    fetchImpl: async () => { upstreamCalled = true; return new Response('{}', { status: 200 }); }
  });
  assert.equal(oversizedRes.statusCode, 200);
  assert.equal(oversizedRes.payload.found, false);
  assert.equal(oversizedRes.payload.skipped_reason, 'query_too_long_or_not_keyword');
  assert.equal(upstreamCalled, false);

  const urlRes = await callRoute({
    method: 'GET',
    pathname: '/api/newborn/idea-intelligence',
    search: `?q=${encodeURIComponent('https://www.pinterest.com/pin/395542779798156718/')}`,
    fetchImpl: async () => { upstreamCalled = true; return new Response('{}', { status: 200 }); }
  });
  assert.equal(urlRes.statusCode, 200);
  assert.equal(urlRes.payload.found, false);
  assert.equal(urlRes.payload.skipped_reason, 'query_too_long_or_not_keyword');
  assert.equal(upstreamCalled, false);
});

// ---------------------------------------------------------------------------
// 11. Fleet CLI `db_run` Mode (Dispatch, Round-Robin Worker, Consolidate) & Workflow
// ---------------------------------------------------------------------------
test('Wave 6F [11]: scripts/newborn-fleet.mjs db_run lifecycle and newborn-hunter.yml contracts', async () => {
  const wfPath = path.join(REPO_ROOT, '.github/workflows/newborn-hunter.yml');
  const wfContent = fs.readFileSync(wfPath, 'utf8');
  assert.ok(wfContent.includes('- db_run'));
  assert.ok(wfContent.includes('run_id:'));
  assert.ok(wfContent.includes('cluster_id:'));
  assert.ok(wfContent.includes("format('run-{0}', inputs.run_id)"));
  assert.ok(wfContent.includes('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true'));
  assert.ok(wfContent.includes("cron: '15 0,6,9,12,15,18,21 * * *'"));
  assert.ok(wfContent.includes("vars.NEWBORN_AUTO_HUNTER_ENABLED == 'true'"));

  const parsed = parseNewbornFleetArgs(['--mode=db_run', '--run-id=42', '--cluster-id=9', '--shards=4', '--worker-index=1'], {});
  assert.equal(parsed.mode, 'db_run');
  assert.equal(parsed.runId, 42);
  assert.equal(parsed.clusterId, 9);
  assert.equal(parsed.workerIndex, 1);
  assert.equal(parsed.workerTotal, 4);

  // Stage 0 Dispatch in db_run mode
  const dispatchUpdates = [];
  const dispatchSql = async (strings, ...values) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('FROM newborn_engine_settings')) return [];
    if (q.includes('FROM newborn_candidates')) return [{ total: 0 }];
    if (q.includes('FROM newborn_runs')) {
      return [{
        id: 42,
        status: 'queued',
        cancel_requested_at: null,
        selected_keywords: ['kw0', 'kw1', 'kw2', 'kw3', 'kw4', 'kw5'],
        seed_queries: ['kw0'],
        config_snapshot: {},
        shards_total: 3,
        cluster_id: 9,
        profile_id: null,
        folder_id: null
      }];
    }
    if (q.includes('UPDATE newborn_runs')) {
      dispatchUpdates.push({ q, values });
      return [];
    }
    return [];
  };

  const dispatchRes = await runNewbornFleetDispatch({
    sql: dispatchSql,
    parsedArgs: parseNewbornFleetArgs(['--mode=dispatch', '--target-mode=db_run', '--run-id=42'], {}),
    env: { GITHUB_RUN_ID: '123456', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'owner/repo' }
  });
  assert.equal(dispatchRes.effectiveMode, 'db_run');
  assert.equal(dispatchRes.taskCount, 3);
  assert.equal(dispatchRes.matrixTasks[0].run_id, '42');
  assert.equal(dispatchRes.matrixTasks[2].worker_index, 2);
  assert.equal(dispatchUpdates.length, 1);
  assert.ok(dispatchUpdates[0].values.includes('https://github.com/owner/repo/actions/runs/123456'));

  // Stage 1 Worker deterministic round-robin keyword slicing + cancel check
  const cancelledSql = async () => [{ id: 42, status: 'cancelled', cancel_requested_at: new Date().toISOString() }];
  const skippedCancelled = await runNewbornFleetWorker({
    sql: cancelledSql,
    parsedArgs: parsed,
    env: {}
  });
  assert.equal(skippedCancelled.skipped, true);
  assert.equal(skippedCancelled.reason, 'cancelled');

  // Stage 2 Consolidate aggregates shard telemetry & authoritative counts
  let consolidateFinalStatus = null;
  let stampedAutomation = false;
  const consolidateSql = async (strings, ...values) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('FROM newborn_runs') && q.includes('WHERE id =')) {
      return [{
        id: 42,
        status: 'running',
        cancel_requested_at: null,
        shards_total: 3,
        shards_completed: 3,
        shards_failed: 0,
        candidates_discovered: 300,
        candidates_qualified: 10,
        golden_pins_count: 5,
        telemetry: {
          shards: {
            0: { status: 'completed', scrolled_pins: 100, matched_repins: 10, hydrated_pins: 10 },
            1: { status: 'partial_rate_limited', scrolled_pins: 120, matched_repins: 12, hydrated_pins: 12 },
            2: { status: 'completed', scrolled_pins: 80, matched_repins: 8, hydrated_pins: 8 }
          }
        }
      }];
    }
    if (q.includes('FROM newborn_run_candidates rc')) {
      return [{ verified_winners: 14, golden_pins_count: 7 }];
    }
    if (q.includes('UPDATE newborn_runs')) {
      consolidateFinalStatus = values[0];
      return [];
    }
    if (q.includes('INSERT INTO app_settings') || q.includes('UPDATE app_settings')) {
      stampedAutomation = true;
      return [{ key: 'newborn_engine_settings', value: {} }];
    }
    return [];
  };

  const consRes = await runNewbornFleetConsolidate({
    sql: consolidateSql,
    parsedArgs: { mode: 'consolidate', runId: 42 },
    env: {}
  });
  assert.equal(consRes.consolidated_run.status, 'partial_rate_limited');
  assert.equal(consolidateFinalStatus, 'partial_rate_limited');
  assert.equal(consRes.consolidated_run.scrolled_pins, 300);
  assert.equal(consRes.consolidated_run.verified_winners, 14);
  assert.equal(consRes.consolidated_run.golden_pins_count, 7);
  assert.equal(stampedAutomation, true, 'Consolidate must stamp automation timestamp once');
});

// ---------------------------------------------------------------------------
// 12. Shard-Safe Atomic Upsert SQL & Shard-Mode Isolation
// ---------------------------------------------------------------------------
test('Wave 6F [12]: upsertStagedCandidatesBatch uses atomic JSONB union/GREATEST/OR and shardMode isolates parent run', async () => {
  const executedQueries = [];
  const captureSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    executedQueries.push(q);
    return [];
  };

  await upsertStagedCandidatesBatch(captureSql, [
    {
      pin_id: '77770000111122',
      title: 'Atomic Shard Pin',
      discovered_surfaces: ['pin_serp_capsules'],
      matched_queries: ['soup'],
      golden_score: 72,
      qualified_in_run: true,
      consecutive_qualifying_days: 2
    }
  ], { runId: 42 });

  const candidateUpsert = executedQueries.find((q) => q.includes('INSERT INTO newborn_candidates'));
  const junctionUpsert = executedQueries.find((q) => q.includes('INSERT INTO newborn_run_candidates'));
  assert.ok(candidateUpsert, 'Must execute newborn_candidates upsert');
  assert.ok(candidateUpsert.includes('jsonb_agg(DISTINCT elem)'), 'Must atomically union discovered_surfaces');
  assert.ok(candidateUpsert.includes('GREATEST(newborn_candidates.consecutive_qualifying_days'), 'Must use GREATEST for consecutive_qualifying_days');
  assert.ok(junctionUpsert, 'Must execute newborn_run_candidates upsert');
  assert.ok(junctionUpsert.includes('jsonb_agg(DISTINCT elem)'), 'Must atomically union matched_queries');
  assert.ok(junctionUpsert.includes('OR EXCLUDED.qualified_in_run'), 'Must OR qualified_in_run across shards');
  assert.ok(junctionUpsert.includes('GREATEST(COALESCE(newborn_run_candidates.golden_score_in_run, 0)'), 'Must GREATEST golden_score_in_run across shards');

  // Verify shardMode=true isolation in executeNewbornHarvestPipeline
  const shardQueries = [];
  const shardSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    shardQueries.push(q);
    return [];
  };
  await executeNewbornHarvestPipeline(shardSql, {
    seedQueries: ['soup'],
    existingRunId: 42,
    shardMode: true,
    shardIndex: 1,
    shardTotal: 4,
    rawCookieOverride: TEST_AUTH_COOKIE,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 1, target_pins: 25 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        }
      }
    },
    routerOptions: {
      discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
      fetchImpl: async () => new Response(JSON.stringify({ resource_response: { data: { results: [] } } }), { status: 200 }),
      jitterMinMs: 0,
      jitterMaxMs: 0
    }
  });

  assert.equal(
    shardQueries.some((q) => q.includes('INSERT INTO app_settings') || q.includes('UPDATE app_settings')),
    false,
    'shardMode=true must NEVER stamp automation timestamp directly'
  );
  const shardRunUpdate = shardQueries.find((q) => q.includes('UPDATE newborn_runs'));
  assert.ok(shardRunUpdate, 'shardMode=true must atomically update parent run shard counters');
  assert.ok(shardRunUpdate.includes('shards_completed = shards_completed + 1'));
  assert.ok(shardRunUpdate.includes('jsonb_set'));
  assert.equal(shardRunUpdate.includes('completed_at = NOW()'), false, 'shardMode=true must NEVER set parent completed_at');
});

// ---------------------------------------------------------------------------
// 13. Phase 1.5 Regression Suite (BLOCKER-1, BLOCKER-2, HIGH-1, MEDIUM-1/3/5)
// ---------------------------------------------------------------------------
test('Wave 6F [13]: Phase 1.5 — db_run worker applies root config_snapshot overrides, consolidate catches crashed shards, and HALF_OPEN 404 recovers salvage', async () => {
  // A. BLOCKER-1: End-to-end createFleetBackedNewbornRun -> runNewbornFleetWorker (non-cancelled path)
  let storedRunRow = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    const createSql = async (strings, ...values) => {
      const q = strings.join(' ').replace(/\s+/g, ' ').trim();
      if (q.includes('INSERT INTO newborn_runs')) {
        // values: runType, progressDetail, profileId, folderId, clusterId, seedQueriesJson, selectedKeywordsJson, configSnapshotJson, clampedShards
        const selectedKeywords = JSON.parse(values[6]);
        const configSnapshot = JSON.parse(values[7]);
        storedRunRow = {
          id: 955,
          status: 'running',
          cancel_requested_at: null,
          selected_keywords: selectedKeywords,
          seed_queries: selectedKeywords,
          config_snapshot: configSnapshot,
          shards_total: values[8],
          cluster_id: null,
          profile_id: null,
          folder_id: null
        };
        return [storedRunRow];
      }
      return [];
    };

    const created = await createFleetBackedNewbornRun(createSql, {
      runType: 'discovery',
      selectedKeywords: ['kw0', 'kw1', 'kw2', 'kw3'],
      seedBoards: [{ board_id: '888001', url: '/chef/fresh-soups/' }],
      settingsOverrides: {
        discovery: {
          surfaces: {
            pin_serp_capsules: { enabled: true, max_pages: 1, page_size: 25, target_pins: 25 },
            fresh_boards: { enabled: false },
            board_feed: { enabled: false },
            board_more_ideas: { enabled: false },
            ideas_feeds: { enabled: false },
            home_feed: { enabled: false },
            growing_trends: { enabled: false },
            zero_query_popular: { enabled: false }
          }
        },
        qualification: {
          max_age_days: 7,
          min_repin_count: 150,
          min_save_count: 0
        }
      },
      shards: 2,
      env: { GITHUB_TOKEN: 'ghp_test', GITHUB_REPOSITORY: 'owner/repo' }
    });
    assert.equal(created.ok, true);
    assert.ok(storedRunRow && storedRunRow.config_snapshot.qualification.max_age_days === 7);
    assert.equal(storedRunRow.config_snapshot.seed_boards.length, 1);
  } finally {
    globalThis.fetch = origFetch;
  }

  const nowMs = Date.now();
  const threeDaysAgo = new Date(nowMs - 3 * 86400 * 1000).toUTCString();
  const twelveDaysAgo = new Date(nowMs - 12 * 86400 * 1000).toUTCString();
  const searchedQueries = [];

  const workerSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('FROM newborn_runs') && q.includes('WHERE id =')) return [storedRunRow];
    return [];
  };

  const workerRes = await runNewbornFleetWorker({
    sql: workerSql,
    parsedArgs: parseNewbornFleetArgs(['--mode=db_run', '--run-id=955', '--shards=2', '--worker-index=1'], {}),
    env: { PINTEREST_COOKIE: TEST_AUTH_COOKIE },
    nowMs,
    routerOptions: {
      discoveryBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
      pidgetsBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
      jitterMinMs: 0,
      jitterMaxMs: 0,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('BaseSearchResource/get') && decodeURIComponent(u).includes('"scope":"pins"')) {
          const dataObj = JSON.parse(new URL(u).searchParams.get('data'));
          searchedQueries.push(dataObj.options.query);
          return new Response(JSON.stringify({
            resource_response: {
              data: {
                results: [
                  { id: '95500000000001', type: 'pin', title: 'Fresh High-Repin', repin_count: 210, created_at: threeDaysAgo },
                  { id: '95500000000002', type: 'pin', title: 'Too Old Under Override', repin_count: 220, created_at: twelveDaysAgo },
                  { id: '95500000000003', type: 'pin', title: 'Too Few Repins Under Override', repin_count: 80, created_at: threeDaysAgo }
                ]
              }
            }
          }), { status: 200 });
        }
        if (u.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
          return new Response(JSON.stringify({
            data: [
              { id: '95500000000001', repin_count: 210, aggregated_pin_data: { aggregated_stats: { saves: 250 } } },
              { id: '95500000000002', repin_count: 220, aggregated_pin_data: { aggregated_stats: { saves: 260 } } },
              { id: '95500000000003', repin_count: 80, aggregated_pin_data: { aggregated_stats: { saves: 100 } } }
            ]
          }), { status: 200 });
        }
        if (u.includes('PinResource/get')) {
          const dataObj = JSON.parse(new URL(u).searchParams.get('data'));
          const pid = String(dataObj?.options?.id || '95500000000001');
          const createdAt = pid === '95500000000002' ? twelveDaysAgo : threeDaysAgo;
          const repins = pid === '95500000000003' ? 80 : 215;
          return new Response(JSON.stringify({
            resource_response: {
              data: { id: pid, title: `Pin ${pid}`, created_at: createdAt, repin_count: repins, domain: 'example.com' }
            }
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ resource_response: { data: null } }), { status: 200 });
      }
    }
  });

  // Deterministic round-robin shard 1/2 gets ONLY kw1 and kw3
  assert.deepEqual(searchedQueries, ['kw1', 'kw3']);
  // Root config_snapshot overrides (max_age_days=7, min_repin_count=150) MUST filter out pin 2 (12d old) & pin 3 (80 repins)!
  assert.equal(workerRes.stats.candidates_qualified, 1);

  // B. BLOCKER-2: Consolidate marks crashed 0-completed runs as 'failed' and incomplete runs as 'partial'
  const makeConsolidateSql = (row) => async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('FROM newborn_runs') && q.includes('WHERE id =')) return [row];
    if (q.includes('FROM newborn_run_candidates rc')) return [{ verified_winners: 0, golden_pins_count: 0 }];
    return [];
  };

  const zeroCompleted = await runNewbornFleetConsolidate({
    sql: makeConsolidateSql({
      id: 956, status: 'running', cancel_requested_at: null,
      shards_total: 4, shards_completed: 0, shards_failed: 0,
      candidates_discovered: 0, candidates_qualified: 0, golden_pins_count: 0,
      telemetry: { shards: {} }
    }),
    parsedArgs: { mode: 'consolidate', runId: 956 },
    env: {}
  });
  assert.equal(zeroCompleted.consolidated_run.status, 'failed');

  const incompleteShards = await runNewbornFleetConsolidate({
    sql: makeConsolidateSql({
      id: 957, status: 'running', cancel_requested_at: null,
      shards_total: 4, shards_completed: 2, shards_failed: 0,
      candidates_discovered: 100, candidates_qualified: 3, golden_pins_count: 1,
      telemetry: { shards: { 0: { status: 'completed', scrolled_pins: 50 }, 1: { status: 'completed', scrolled_pins: 50 } } }
    }),
    parsedArgs: { mode: 'consolidate', runId: 957 },
    env: {}
  });
  assert.equal(incompleteShards.consolidated_run.status, 'partial');

  // C. HIGH-1: inMemoryRunProgressCache preserves telemetry.surface_diagnostics & salvaged_pins_count
  clearNewbornInflightRunsForTest();
  const cacheSql = async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('SELECT id, status, execution_mode')) return [];
    if (q.includes('INSERT INTO newborn_runs')) {
      return [{ id: 958, run_type: 'snowball', execution_mode: 'direct', status: 'running', progress_stage: 'queued', progress_pct: 2, shards_total: 1, shards_completed: 0, shards_failed: 0, seed_queries: [] }];
    }
    return [];
  };
  await enqueueNewbornRun(cacheSql, {
    runType: 'snowball',
    workerExecutor: async ({ onProgress }) => {
      onProgress({
        stage: 'completed',
        status: 'completed',
        detail: 'Done',
        pct: 100,
        counters: { candidates_discovered: 0, candidates_qualified: 0, golden_pins_count: 0, rookie_creators_count: 2 },
        funnel: { scrolled_pins: 0, matched_repins: 0, hydrated_pins: 0, verified_winners: 0 },
        salvaged_pins_count: 0,
        surface_diagnostics: { related_pin_snowball: { total_pins: 0, last_http_status: 412, error: 'HTTP 412' } }
      });
      return { ok: true, status: 'completed' };
    }
  });
  await new Promise((r) => setTimeout(r, 30));
  const cachedSnowball = await getNewbornRunById(cacheSql, 958, { lite: true });
  assert.equal(cachedSnowball.rookie_creators_count, 2);
  assert.equal(cachedSnowball.telemetry.surface_diagnostics.related_pin_snowball.last_http_status, 412);

  // D. MEDIUM-1: HALF_OPEN serial probe pin #0 returning 404 closes breaker and still salvages pin #1
  const halfOpenBreaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 25 });
  halfOpenBreaker.recordFailure(429);
  halfOpenBreaker.recordFailure(429);
  await new Promise((r) => setTimeout(r, 35));
  let searchCall = 0;
  const hydratedPinIds = [];
  const salvage404Res = await executeNewbornHarvestPipeline(async (strings) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('INSERT INTO newborn_runs')) return [{ id: 959 }];
    return [];
  }, {
    seedQueries: ['soup'],
    rawCookieOverride: TEST_AUTH_COOKIE,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 1, page_size: 25, target_pins: 25 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        }
      },
      qualification: { max_age_days: 30, min_repin_count: 20, min_save_count: 0 }
    },
    routerOptions: {
      discoveryBreaker: halfOpenBreaker,
      pidgetsBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 }),
      jitterMinMs: 0,
      jitterMaxMs: 0,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('BaseSearchResource/get')) {
          searchCall++;
          // First call closes HALF_OPEN, then force breaker back to OPEN->HALF_OPEN before PinResource by returning 429 on page 2? Instead return 2 pins then force breaker HALF_OPEN via Pidgets hook
          if (searchCall === 1) {
            return new Response(JSON.stringify({
              resource_response: {
                bookmark: 'b2',
                data: {
                  results: [
                    { id: '95900000000001', type: 'pin', title: 'Deleted Pin #0', repin_count: 150 },
                    { id: '95900000000002', type: 'pin', title: 'Live Pin #1', repin_count: 100 }
                  ]
                }
              }
            }), { status: 200 });
          }
          return new Response('Rate Limited', { status: 429 });
        }
        if (u.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
          // Trip discoveryBreaker right before hydration so HALF_OPEN probe runs
          halfOpenBreaker.recordFailure(429);
          halfOpenBreaker.recordFailure(429);
          await new Promise((r) => setTimeout(r, 35));
          return new Response(JSON.stringify({
            data: [
              { id: '95900000000001', repin_count: 150, aggregated_pin_data: { aggregated_stats: { saves: 180 } } },
              { id: '95900000000002', repin_count: 100, aggregated_pin_data: { aggregated_stats: { saves: 120 } } }
            ]
          }), { status: 200 });
        }
        if (u.includes('PinResource/get')) {
          const dataObj = JSON.parse(new URL(u).searchParams.get('data'));
          const pid = String(dataObj?.options?.id || '');
          hydratedPinIds.push(pid);
          if (pid === '95900000000001') {
            return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
          }
          return new Response(JSON.stringify({
            resource_response: {
              data: { id: pid, title: 'Live Pin #1', created_at: threeDaysAgo, repin_count: 100, domain: 'ok.com' }
            }
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ resource_response: { data: null } }), { status: 200 });
      }
    },
    nowMs
  });
  assert.deepEqual(hydratedPinIds, ['95900000000001', '95900000000002']);
  assert.equal(salvage404Res.stats.candidates_qualified, 1);

  // E. MEDIUM-3 & MEDIUM-5: filters.max_pin_hydrations_per_run & explicit Fleet mode with seed_boards
  let capturedConfigSnapshot = null;
  const routeSql = async (strings, ...values) => {
    const q = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (q.includes('INSERT INTO newborn_runs')) {
      capturedConfigSnapshot = JSON.parse(values[7]);
      return [{ id: 960, run_type: 'discovery', execution_mode: 'fleet', status: 'queued', shards_total: 1 }];
    }
    return [];
  };
  const origFetch2 = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  let statusCode = 0;
  try {
    await handleNewbornRoutes({
      request: {
        method: 'POST',
        json: async () => ({
          query: 'https://www.pinterest.com/chef/fresh-soups/',
          execution_mode: 'fleet',
          filters: { max_age_days: 14, min_repins: 40, max_pin_hydrations_per_run: 320 }
        })
      },
      reply: { header() { return this; } },
      searchParams: new URLSearchParams(),
      pathname: '/api/newborn/discover',
      method: 'POST',
      sql: routeSql,
      env: { GITHUB_TOKEN: 'ghp_test', GITHUB_REPOSITORY: 'owner/repo' },
      ctx: null,
      jsonResponse: (data, code = 200) => { statusCode = code; return { data, code }; },
      methodNotAllowedResponse: () => ({}),
      redactSecrets: (v) => String(v || ''),
      checkPinterestCircuitBreaker: async () => ({ active: false, remaining_seconds: 0 })
    });
  } finally {
    globalThis.fetch = origFetch2;
  }
  assert.equal(statusCode, 202);
  assert.equal(capturedConfigSnapshot.discovery.hydration.max_pin_hydrations_per_run, 320);
  assert.equal(capturedConfigSnapshot.seed_boards.length, 1);
});
