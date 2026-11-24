/**
 * Room 5 (Campaign Settings & Smart Bulk Pin Pruning) Hardening Test Suite
 *
 * Strictly behavioral verification (zero fs.readFileSync source-regex locks):
 * - P0-1 & P0-2: Unhydrated NULL safety in getPruningCandidates/pruneFolderPins,
 *   default skip_rising_velocity=true, explicit 0 preservation, '' -> null, NaN/neg -> 400.
 * - P0-3: Client pruneForm invalidation on field change, sample_pins preview, clean copy.
 * - P0-4: block_fleet, pause_crawlers, pause_competitors enforced across dispatch-audit,
 *   bulk-pulse-track, creators/dispatch-crawl, autoDiscoverFolderCreatorsForKeyword,
 *   fetchCampaignTrackedPinsForWorker, resolveKeywordMaxSerpTopN, syncKeywordTopNIntoCampaigns,
 *   and fetchQueuedCampaignPinGraphSeeds; max_pages unified 1..200.
 * - P0-5, P0-6 & P1-2: True workspace inheritance + Reset (pin_graph_rules `{}` replacement,
 *   serp_top_n reset), HTTP 400 validation on updateFolder/createFolder, GET /api/folders/:id
 *   503 DB_UNAVAILABLE (no catch-swallow into 404), post-write edge cache invalidation.
 * - P1-1: campaign_tracked_pins cleanup on prune, honest deletedCount, dry_run='false',
 *   global pulse + folder cache invalidation.
 * - P1-3, P1-4, P1-5 & P2: Client Room 5 init skips Room 1 endpoints & ?refresh=true,
 *   handles /campaigns/:id/settings popstate, updates foldersList across string/int IDs,
 *   unsaved-changes + paused badge, WCAG AA labels, and HTML < 215 KiB.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  getFolder,
  listFolders,
  listFoldersLite,
  createFolder,
  updateFolder,
  getPruningCandidates,
  pruneFolderPins,
  listFolderCreatorsWithDiscovery,
  autoDiscoverFolderCreatorsForKeyword
} from '../src/modules/keywords/folders-crud.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { pulseMemoryCache } from '../src/modules/pulse/service.mjs';
import { runKeywordFleetDispatch } from '../scripts/keyword-fleet.mjs';
import { runCreatorFleetDispatch } from '../scripts/creator-fleet.mjs';
import {
  fetchCampaignTrackedPinsForWorker,
  resolveKeywordMaxSerpTopN,
  syncKeywordTopNIntoCampaigns
} from '../scripts/keyword-velocity-crawler.mjs';
import {
  mergeCampaignPinGraphRules,
  fetchQueuedCampaignPinGraphSeeds,
  resolveSeedCrawlMaxPages
} from '../scripts/cluster-intelligence.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getDashboardCreatorsFleetMethods } from '../src/ui/dashboard/dashboard-client-creators.mjs';
import { getDashboardBoardsAndPinMethods } from '../src/ui/dashboard/dashboard-client-boards.mjs';

const jsonResponse = (payload, status = 200, _ttl = 0, headers = {}) => ({ status, payload, headers });
const methodNotAllowedResponse = (allowed = 'GET, OPTIONS') => ({
  status: 405,
  payload: { error: 'METHOD_NOT_ALLOWED', allowed }
});

function createMockSql(handler) {
  const fn = (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join(' ? ') : String(strings);
    return Promise.resolve(handler(query, values, strings));
  };
  fn.begin = async (cb) => cb(fn);
  fn.transaction = async (builders) => {
    const results = [];
    for (const b of builders) {
      results.push(typeof b === 'function' ? await b(fn) : await b);
    }
    return results;
  };
  return fn;
}

function instantiateFoldersApp(folderId = '5', initialRoom = 'settings', extraGlobals = {}) {
  const scriptHtml = getFoldersClientAppScript();
  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/i);
  assert.ok(match && match[1], 'foldersApp script must be present');

  const toasts = [];
  const sandbox = {
    window: {
      location: {
        pathname: `/folders/${folderId}${initialRoom === 'settings' ? '/settings' : ''}`,
        search: '',
        href: `http://localhost:3000/folders/${folderId}${initialRoom === 'settings' ? '/settings' : ''}`
      },
      history: { pushState: () => {}, replaceState: () => {} },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      PAE: {
        confirm: async () => true,
        refreshIcons: () => {}
      },
      ...extraGlobals.window
    },
    document: {
      documentElement: { classList: { add: () => {}, remove: () => {} } },
      readyState: 'complete',
      activeElement: null,
      addEventListener: () => {},
      getElementById: () => null,
      ...extraGlobals.document
    },
    fetch: extraGlobals.fetch || (async () => ({ ok: true, json: async () => ({}) })),
    AbortController,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    ...extraGlobals.globals
  };
  if (!sandbox.window.safeApiFetch && extraGlobals.fetch) {
    sandbox.window.safeApiFetch = extraGlobals.fetch;
  }

  const context = vm.createContext(sandbox);
  vm.runInContext(match[1], context);
  const app = context.foldersApp(folderId, initialRoom);
  app.$nextTick = (cb) => { if (typeof cb === 'function') cb(); };
  app.$watch = () => {};
  app.showToast = (msg, type) => { toasts.push({ msg, type }); };
  return { app, sandbox, toasts };
}

test('P0-1 & P0-2: getPruningCandidates excludes NULL unhydrated saves/repins/age, protects rising velocity, excludes ignored pins & preserves 0', async () => {
  const capturedQueries = [];
  const mockSql = createMockSql((query, values) => {
    capturedQueries.push({ query, values });
    return [
      {
        keyword_id: 11,
        pin_id: '1000000001',
        title: 'Cold Displaced Pin',
        image_url: 'https://i.pinimg.com/236x/a.jpg',
        domain: 'example.com',
        save_count: 0,
        repin_count: 0,
        daily_save_velocity: 0,
        is_displaced: true
      }
    ];
  });

  const rows = await getPruningCandidates(mockSql, 5, {
    scope: 'displaced',
    minPinAgeDays: 30,
    minFolderAgeDays: 14,
    maxSaves: 0,
    maxRepins: 0
  });

  assert.equal(rows.length, 1);
  assert.equal(capturedQueries.length, 1);
  const { query, values } = capturedQueries[0];

  assert.match(query, /NOT EXISTS\s*\(\s*SELECT 1 FROM keyword_ignored_pins/i, 'Must exclude already-ignored pins');
  assert.match(query, /ump\.save_count IS NOT NULL AND ump\.save_count <=\s*\?/i, 'Must never treat NULL save_count as 0');
  assert.match(query, /ump\.repin_count IS NOT NULL AND ump\.repin_count <=\s*\?/i, 'Must never treat NULL repin_count as 0');
  assert.match(query, /ump\.created_at_pinterest IS NOT NULL AND ump\.created_at_pinterest <=/i, 'Must never prune pins with NULL created_at_pinterest when min_pin_age_days > 0');
  assert.match(query, /COALESCE\(ump\.daily_save_velocity, 0\) <= 0/i, 'Must skip rising pins (24h velocity > 0) by default');
  assert.equal(values.includes(0), true, 'Explicit 0 threshold must be preserved in SQL parameters');

  // Empty strings are treated as omitted (null), while NaN / negative / invalid scope throw HTTP 400
  const omittedRows = await getPruningCandidates(mockSql, 5, {
    maxSaves: '',
    maxRepins: '',
    minPinAgeDays: '',
    minFolderAgeDays: ''
  });
  assert.equal(omittedRows.length, 1);
  const lastValues = capturedQueries[capturedQueries.length - 1].values;
  assert.equal(lastValues.includes(NaN), false, 'Empty strings must never produce NaN');

  await assert.rejects(
    () => getPruningCandidates(mockSql, 5, { maxSaves: 'abc' }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => getPruningCandidates(mockSql, 5, { minPinAgeDays: -3 }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => getPruningCandidates(mockSql, 5, { scope: 'bogus_scope' }),
    (err) => err.status === 400
  );
});

test('P1-1: pruneFolderPins handles string dry_run="false", cleans campaign_tracked_pins, reports real deletedCount & invalidates caches', async () => {
  const executedQueries = [];
  const mockSql = createMockSql((query, values) => {
    executedQueries.push({ query, values });
    if (/FROM keyword_folder_items i/i.test(query)) {
      return [
        { keyword_id: 10, pin_id: '9001', save_count: 1, repin_count: 0, daily_save_velocity: 0 },
        { keyword_id: 11, pin_id: '9001', save_count: 1, repin_count: 0, daily_save_velocity: 0 }
      ];
    }
    if (/DELETE FROM keyword_serp_positions/i.test(query)) {
      // Simulate only 1 of 2 pairs actually existed in keyword_serp_positions
      return [{ keyword_id: 10, pin_id: '9001' }];
    }
    if (/DELETE FROM campaign_tracked_pins/i.test(query)) {
      return [{ pin_id: '9001' }];
    }
    return [];
  });

  // 1. Dry run default + summary includes skip_rising_velocity
  const dry = await pruneFolderPins(mockSql, 7, { max_saves: 0 }, { workspaceId: 2 });
  assert.equal(dry.dry_run, true);
  assert.equal(dry.candidates_count, 2);
  assert.equal(dry.summary.max_saves, 0);
  assert.equal(dry.summary.skip_rising_velocity, true);

  // 2. String dry_run: 'false' executes prune, cleans campaign_tracked_pins, returns real deletedCount=1
  const pruned = await pruneFolderPins(mockSql, 7, { dry_run: 'false', max_saves: 1 }, { workspaceId: 2 });
  assert.equal(pruned.dry_run, false);
  assert.equal(pruned.matched_count, 2);
  assert.equal(pruned.pruned_count, 1, 'pruned_count must reflect actual deletedCount from ignoreAndRemoveSerpPin');
  assert.equal(pruned.untracked_campaign_pins, 1);

  const trackedDelete = executedQueries.find((e) => /DELETE FROM campaign_tracked_pins/i.test(e.query));
  assert.ok(trackedDelete, 'Must clean search rows from campaign_tracked_pins after pruning');
  assert.match(trackedDelete.query, /ctp\.source_type = 'search'/i);

  // 3. Route POST /api/folders/:id/prune-pins invalidates folder/keywords edge caches AND global pulse cache
  const edgeInvalidations = [];
  const res = await handleFoldersRoutes({
    pathname: '/api/folders/7/prune-pins',
    method: 'POST',
    request: { json: async () => ({ dry_run: 'false', scope: 'displaced', max_saves: 0 }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql((query) => {
      if (/FROM keyword_folders/i.test(query)) return [{ id: 7, name: 'Test', workspace_id: 2, metadata: {} }];
      if (/FROM keyword_folder_items i/i.test(query)) return [{ keyword_id: 10, pin_id: '9001' }];
      if (/DELETE FROM keyword_serp_positions/i.test(query)) return [{ keyword_id: 10, pin_id: '9001' }];
      if (/DELETE FROM campaign_tracked_pins/i.test(query)) return [];
      return [];
    }),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (scope) => { edgeInvalidations.push(scope); }
  });
  assert.equal(res.status, 200);
  assert.deepEqual(edgeInvalidations.slice().sort(), ['domains:dossier', 'domains:leaderboard', 'folders', 'keywords']);
});

test('P0-4: Pause & block_fleet flags block dispatch-audit, bulk-pulse-track, creators/dispatch-crawl, autoDiscover & fleet queries', async () => {
  // 1. POST /api/folders/:id/dispatch-audit returns 409 when block_fleet or pause_crawlers is true
  for (const metaFlag of [{ block_fleet: true }, { pause_crawlers: true }, { status: 'paused' }]) {
    const res = await handleFoldersRoutes({
      pathname: '/api/folders/5/dispatch-audit',
      method: 'POST',
      request: { json: async () => ({}) },
      searchParams: new URLSearchParams(),
      env: { GITHUB_TOKEN: 'ghp_test' },
      ctx: null,
      sql: createMockSql(() => [{ id: 5, name: 'Paused Campaign', workspace_id: 1, metadata: metaFlag }]),
      workspaceId: 1,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: async () => {}
    });
    assert.equal(res.status, 409);
    assert.equal(res.payload.error, 'FOLDER_CRAWLING_PAUSED');
  }

  // 2. POST /api/folders/:id/creators/bulk-pulse-track returns 409 when pause_competitors or block_fleet is true
  const bulkPauseRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators/bulk-pulse-track',
    method: 'POST',
    request: { json: async () => ({ usernames: ['alice'] }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql(() => [{ id: 5, name: 'Paused Creators', workspace_id: 1, metadata: { pause_competitors: true } }]),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(bulkPauseRes.status, 409);
  assert.equal(bulkPauseRes.payload.error, 'FOLDER_COMPETITORS_PAUSED');

  // 3. POST /api/creators/dispatch-crawl with folder_id returns 409 when pause_competitors or block_fleet is true
  const creatorDispatchRes = await handleCreatorsRoutes({
    pathname: '/api/creators/dispatch-crawl',
    method: 'POST',
    request: { json: async () => ({ username: 'alice', folder_id: 5 }) },
    searchParams: new URLSearchParams(),
    env: { GITHUB_TOKEN: 'ghp_test' },
    ctx: null,
    sql: createMockSql(() => [{ id: 5, name: 'Blocked Campaign', workspace_id: 1, metadata: { block_fleet: true } }]),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    clampLimit: (v) => v,
    buildCanonicalCacheKey: () => 'k',
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    tripPinterestCircuitBreaker: async () => {}
  });
  assert.equal(creatorDispatchRes.status, 409);
  assert.equal(creatorDispatchRes.payload.error, 'FOLDER_COMPETITORS_PAUSED');

  // 4. autoDiscoverFolderCreatorsForKeyword skips folders with pause_competitors or block_fleet or auto_discover_creators=false
  const autoDiscRes = await autoDiscoverFolderCreatorsForKeyword(
    createMockSql((query) => {
      if (/FROM keyword_folder_items kfi/i.test(query)) {
        return [
          { id: 1, name: 'Disabled', metadata: { auto_discover_creators: false } },
          { id: 2, name: 'Paused Comp', metadata: { pause_competitors: true } },
          { id: 3, name: 'Blocked Fleet', metadata: { block_fleet: true } }
        ];
      }
      throw new Error('Should not insert creators for paused/disabled folders');
    }),
    99
  );
  assert.equal(autoDiscRes.discovered, 0);

  // 5. Fleet SQL predicates include block_fleet & pause_crawlers and unify max_pages 1..200
  const trackedQueries = [];
  await fetchCampaignTrackedPinsForWorker(
    createMockSql((q) => { trackedQueries.push(q); return []; }),
    { workerIndex: 0, workerTotal: 20 }
  );
  assert.match(trackedQueries[0], /JOIN keyword_folders kf ON kf\.id = ctp\.folder_id/i);
  assert.match(trackedQueries[0], /block_fleet/i);
  assert.match(trackedQueries[0], /pause_crawlers/i);

  const topNQueries = [];
  await resolveKeywordMaxSerpTopN(createMockSql((q) => { topNQueries.push(q); return [{ max_top_n: 20 }]; }), 10);
  await syncKeywordTopNIntoCampaigns(createMockSql((q) => { topNQueries.push(q); return []; }), 10);
  await fetchQueuedCampaignPinGraphSeeds(createMockSql((q) => { topNQueries.push(q); return []; }), { shardIdx: 0 });
  for (const q of topNQueries) {
    assert.match(q, /block_fleet/i, 'All campaign-aware fleet queries must enforce block_fleet');
  }

  const mergedRules = mergeCampaignPinGraphRules({ max_pages: 180 }, { max_pages: 175 });
  assert.equal(mergedRules.max_pages, 175, 'mergeCampaignPinGraphRules must allow max_pages up to 200');
  const clampedRules = mergeCampaignPinGraphRules({}, { max_pages: 999 });
  assert.equal(clampedRules.max_pages, 200, 'mergeCampaignPinGraphRules must clamp max_pages at 200');
});

test('P0-5, P0-6, P1-2 & P1-5: Inheritance reset replaces pin_graph_rules, validates PATCH with 400, surfaces 503 on DB error, and normalizes getFolder', async () => {
  // 1. updateFolder validation -> HTTP 400 (never 500)
  const dummySql = createMockSql(() => [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 20, pin_graph_rules: {}, metadata: {} }]);
  await assert.rejects(() => updateFolder(dummySql, 5, { name: '   ' }), (e) => e.status === 400);
  await assert.rejects(() => updateFolder(dummySql, 5, { color: 'javascript:alert(1)' }), (e) => e.status === 400);
  await assert.rejects(() => updateFolder(dummySql, 5, { status: 'invalid_state' }), (e) => e.status === 400);
  await assert.rejects(() => updateFolder(dummySql, 5, { pin_graph_rules: ['bad'] }), (e) => e.status === 400);
  await assert.rejects(() => updateFolder(dummySql, 5, { pin_graph_rules: { min_repins: 'abc' } }), (e) => e.status === 400);
  await assert.rejects(() => createFolder(dummySql, { name: '' }), (e) => e.status === 400);

  // 2. updateFolder replaces pin_graph_rules (no `||` merge) and allows max_pages up to 200
  const updateCalls = [];
  const updateSql = createMockSql((query, values) => {
    updateCalls.push({ query, values });
    return [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 20, pin_graph_rules: {}, metadata: {} }];
  });
  await updateFolder(updateSql, 5, {
    pin_graph_rules: {},
    metadata: { max_serp_pins: '9999', pause_crawlers: 'false' }
  });
  const updateQuery = updateCalls[0].query;
  assert.equal(/COALESCE\(pin_graph_rules,\s*'\{\}'::jsonb\)\s*\|\|/i.test(updateQuery), false, 'updateFolder must NOT JSONB-merge pin_graph_rules so {} reset actually deletes old keys');
  const clampedMeta = JSON.parse(updateCalls[0].values.find((v) => typeof v === 'string' && v.includes('max_serp_pins')));
  assert.equal(clampedMeta.max_serp_pins, 500);
  assert.equal(clampedMeta.pause_crawlers, false, 'String "false" metadata flag must coerce to boolean false');

  const highPagesCalls = [];
  await updateFolder(
    createMockSql((q, vals) => {
      highPagesCalls.push(vals);
      return [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 20, pin_graph_rules: { max_pages: 175 }, metadata: {} }];
    }),
    5,
    { pin_graph_rules: { max_pages: 175 } }
  );
  assert.ok(highPagesCalls[0].some((v) => typeof v === 'string' && v.includes('"max_pages":175')), 'updateFolder must allow max_pages up to 200');

  // 3. PATCH /api/folders/:id with reset_serp_top_n resolves workspace default and invalidates cache AFTER DB write
  const invalidationLog = [];
  const patchOrder = [];
  const patchRes = await handleFoldersRoutes({
    pathname: '/api/folders/5',
    method: 'PATCH',
    request: {
      json: async () => ({
        reset_serp_top_n: true,
        serp_top_n: null,
        reset_pin_graph_rules: true,
        pin_graph_rules: { min_repins: 999 }
      })
    },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql((query, values) => {
      if (/SELECT id, name, workspace_id, serp_top_n, metadata\s+FROM keyword_folders/i.test(query)) {
        patchOrder.push('assert');
        return [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 50, metadata: {} }];
      }
      if (/FROM workspace_settings/i.test(query)) {
        return [{ workspace_id: 1, default_serp_top_n: 35, extraction_targets: {}, pin_graph_rules: {} }];
      }
      if (/UPDATE keyword_folders/i.test(query)) {
        patchOrder.push('update');
        assert.equal(values[4], 35, 'reset_serp_top_n must restore workspace default_serp_top_n (35)');
        return [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 35, pin_graph_rules: {}, metadata: { serp_top_n_inherited: true } }];
      }
      if (/FROM keyword_folder_items i/i.test(query)) return [];
      return [{ id: 5, name: 'Test', workspace_id: 1, serp_top_n: 35, pin_graph_rules: {}, metadata: { serp_top_n_inherited: true } }];
    }),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (scope) => {
      patchOrder.push('invalidate:' + scope);
      invalidationLog.push(scope);
    }
  });
  assert.equal(patchRes.status, 200);
  assert.deepEqual(patchOrder.slice(0, 3), ['assert', 'update', 'invalidate:keywords']);

  // Invalid cross-workspace PATCH must NOT invalidate edge cache
  const badPatchInvalidations = [];
  await assert.rejects(
    () => handleFoldersRoutes({
      pathname: '/api/folders/999',
      method: 'PATCH',
      request: { json: async () => ({ name: 'Nope' }) },
      searchParams: new URLSearchParams(),
      env: {},
      ctx: null,
      sql: createMockSql(() => []),
      workspaceId: 2,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: async (scope) => { badPatchInvalidations.push(scope); }
    }),
    (err) => err.status === 404
  );
  assert.equal(badPatchInvalidations.length, 0, 'Rejected PATCH must never invalidate edge cache');

  // 4. P0-6: GET /api/folders/:id returns 503 DB_UNAVAILABLE on SQL error (never swallows into 404)
  const dbErrRes = await handleFoldersRoutes({
    pathname: '/api/folders/5',
    method: 'GET',
    request: {},
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql(() => { throw new Error('ECONNREFUSED'); }),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(dbErrRes.status, 503);
  assert.equal(dbErrRes.payload.error, 'DB_UNAVAILABLE');
  assert.equal(dbErrRes.headers['Retry-After'], '3');

  // 5. P1-5: getFolder omits last_crawled_pins_count, excludes keyword_ignored_pins, and listFolderCreatorsWithDiscovery reads auto_discover_creators
  const folderQueries = [];
  const loaded = await getFolder(
    createMockSql((q) => {
      folderQueries.push(q);
      if (/FROM keyword_folders f/i.test(q)) {
        return [{ id: 5, name: 'Test', workspace_id: 2, serp_top_n: 40, pin_graph_rules: '{"max_pages":150}', metadata: {} }];
      }
      return [];
    }),
    5,
    { workspaceId: 2 }
  );
  assert.equal(loaded.workspace_id, 2);
  assert.equal(loaded.serp_top_n, 40);
  assert.deepEqual(loaded.pin_graph_rules, { max_pages: 150 });
  assert.equal(folderQueries.some((q) => /last_crawled_pins_count/i.test(q)), false, 'getFolder must not use ghost last_crawled_pins_count fallback');
  assert.ok(folderQueries.some((q) => /keyword_ignored_pins/i.test(q)), 'getFolder item counts must exclude keyword_ignored_pins');

  const discOff = await listFolderCreatorsWithDiscovery(
    createMockSql((q) => {
      if (/SELECT metadata FROM keyword_folders/i.test(q)) {
        return [{ metadata: { auto_discover_creators: false } }];
      }
      return [];
    }),
    5
  );
  assert.equal(discOff.auto_discover_creators, false);
});

test('P0-2, P0-3, P0-5, P1-3, P1-4 & P2: foldersApp client behavior, popstate, Room 5 init, reset inheritance & HTML invariants', async () => {
  // 1. Room 5 init avoids ?refresh=true and skips tracked-pins / pin-graph-seeds fetches
  const fetchedUrls = [];
  const { app: initApp } = instantiateFoldersApp('5', 'settings', {
    fetch: async (url) => {
      fetchedUrls.push(String(url));
      if (String(url).startsWith('/api/workspaces/settings')) {
        return {
          ok: true,
          json: async () => ({
            settings: {
              default_serp_top_n: 25,
              pin_graph_rules: { auto_trigger_enabled: false, linkless_only: false, min_repins: 600, max_pages: 150 }
            }
          })
        };
      }
      if (String(url) === '/api/folders/5') {
        return {
          ok: true,
          json: async () => ({
            folder: { id: 5, name: 'Alpha', serp_top_n: 25, pin_graph_rules: {}, metadata: {} }
          })
        };
      }
      return { ok: true, json: async () => ({ folders: [{ id: 5, name: 'Alpha' }] }) };
    }
  });
  await initApp.init();
  assert.ok(fetchedUrls.includes('/api/folders/5'), 'Room 5 init must fetch /api/folders/5 without ?refresh=true');
  assert.equal(fetchedUrls.some((u) => u.includes('/api/folders/5?refresh=true')), false, 'Room 5 init must NOT force ?refresh=true');
  assert.equal(fetchedUrls.some((u) => u.includes('tracked-pins') || u.includes('pin-graph-seeds')), false, 'Room 5 init must NOT fetch Room 1 tracked-pins or pin-graph-seeds');
  assert.equal(initApp.isSerpTopNInherited(), true);
  assert.equal(initApp.isPinGraphInherited(), true);
  assert.equal(initApp.folderSettings.pin_graph_rules.max_pages, 150, 'Room 5 must support workspace max_pages > 100');
  assert.equal(initApp.hasUnsavedSettingsChanges(), false);

  // Dirty detection + Reset inheritance sends {} & serp_top_n: null, updates numeric foldersList ID, preserves min_repins !== 0 on empty string
  initApp.folderSettings.name = 'Alpha Renamed';
  initApp.folderSettings.pin_graph_rules.min_repins = '';
  initApp.pinGraphInherited = false;
  assert.equal(initApp.hasUnsavedSettingsChanges(), true);

  let savedBodies = [];
  const { app: saveApp } = instantiateFoldersApp('5', 'settings', {
    fetch: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      savedBodies.push(body);
      return {
        ok: true,
        json: async () => ({
          folder: {
            id: 5,
            name: body.name,
            serp_top_n: body.reset_serp_top_n ? 25 : body.serp_top_n,
            pin_graph_rules: body.pin_graph_rules,
            metadata: body.metadata
          }
        })
      };
    }
  });
  saveApp.workspaceSettingsDefaults = {
    default_serp_top_n: 25,
    pin_graph_rules: { auto_trigger_enabled: false, linkless_only: false, min_repins: 600, max_pages: 150 }
  };
  saveApp.activeFolder = { id: 5, name: 'Alpha', serp_top_n: 40, pin_graph_rules: { max_pages: 50 }, metadata: {} };
  saveApp.foldersList = [{ id: 5, name: 'Alpha' }];
  saveApp.syncFolderSettingsFromActive();

  // Empty min_repins while custom override must fall back to workspace default (600), NEVER 0
  saveApp.folderSettings.pin_graph_rules.min_repins = '';
  saveApp.pinGraphInherited = false;
  saveApp.folderSettings.name = 'Alpha Updated';
  await saveApp.saveFolderSettings(false);
  assert.equal(savedBodies[0].pin_graph_rules.min_repins, 600, 'Empty min_repins must NOT fail-open to 0');
  assert.equal(saveApp.foldersList[0].name, 'Alpha Updated', 'foldersList must update even when f.id is number and activeFolderId is string');

  // Reset both to workspace -> sends {} + reset_serp_top_n: true
  saveApp.resetPinGraphToWorkspace();
  saveApp.resetSerpTopNToWorkspace();
  await saveApp.saveFolderSettings(false);
  assert.deepEqual(savedBodies[1].pin_graph_rules, {});
  assert.equal(savedBodies[1].reset_pin_graph_rules, true);
  assert.equal(savedBodies[1].reset_serp_top_n, true);
  assert.equal(savedBodies[1].serp_top_n, null);

  // 2. Client Prune zero preservation + stale preview invalidation
  saveApp.pruneForm.max_saves = 0;
  saveApp.pruneForm.min_pin_age_days = 0;
  saveApp.pruneForm.min_folder_age_days = '';
  saveApp.pruneForm.max_repins = 0;
  const payload = saveApp.buildPrunePayload(true);
  assert.equal(payload.max_saves, 0);
  assert.equal(payload.min_pin_age_days, 0);
  assert.equal(payload.min_folder_age_days, null);
  assert.equal(payload.max_repins, 0);
  assert.equal(payload.skip_rising_velocity, true);

  saveApp.prunePreviewResult = { candidates_count: 4 };
  saveApp.togglePruneKeywordId(12);
  assert.equal(saveApp.prunePreviewResult, null, 'Changing prune filters must clear stale prunePreviewResult');

  // 3. popstate handles /campaigns/:id/settings
  let popHandler = null;
  const { app: popApp, sandbox: popSandbox } = instantiateFoldersApp('5', 'crossover', {
    window: {
      location: { pathname: '/campaigns/5/settings', search: '', href: 'http://localhost:3000/campaigns/5/settings' },
      addEventListener: (ev, fn) => { if (ev === 'popstate') popHandler = fn; }
    }
  });
  await popApp.init();
  assert.ok(typeof popHandler === 'function');
  popHandler();
  assert.equal(popApp.currentRoom, 'settings');
  popSandbox.window.location.pathname = '/campaigns/5';
  popHandler();
  assert.equal(popApp.currentRoom, 'crossover');

  // 4. Rendered HTML checks: byte budget < 215 KiB, invariants, accessibility & copy hygiene
  const room5Html = getCampaignFoldersPageHtml('5', 'settings');
  const bytes = Buffer.byteLength(room5Html, 'utf8');
  assert.ok(bytes < 215 * 1024, `Room 5 HTML (${bytes} bytes) must stay strictly < 215 KiB`);

  assert.ok(room5Html.includes('Lock 1: Room 1 &amp; Room 5 Sibling DOM Hierarchy') || room5Html.includes('Lock 1: Room 1 & Room 5 Sibling DOM Hierarchy'));
  assert.ok(room5Html.includes("currentRoom === 'settings'"));
  assert.ok(room5Html.includes('Inherited from Workspace'));
  assert.ok(room5Html.includes('isSerpTopNInherited()'));
  assert.ok(room5Html.includes('isPinGraphInherited()'));
  assert.ok(room5Html.includes('activeFolderId ? loadActiveFolder(true) : loadFolders()'));

  assert.equal(room5Html.includes('<span>Room 5:'), false, 'Internal "Room 5:" prefix must not leak to user-facing heading');
  assert.ok(room5Html.includes('<span>Campaign Settings &amp; Smart Bulk Pin Pruning</span>'));
  assert.equal(room5Html.includes('Execute Atomic Prune'), false, 'Technical "Execute Atomic Prune" label must be replaced');
  assert.equal(room5Html.includes('keyword_ignored_pins'), false, 'Internal DB table name must not appear in Room 5 UI');

  assert.ok(room5Html.includes('max="200"'), 'max_pages input must allow up to 200');
  assert.ok(room5Html.includes('room5-toggle-pause-competitors') && room5Html.includes('peer-focus-visible:ring-2'));
  assert.ok(room5Html.includes('aria-pressed="folderSettings.color === c ? \'true\' : \'false\'"') || room5Html.includes(':aria-pressed='));
  assert.ok(room5Html.includes('Unsaved changes'));
  assert.ok(room5Html.includes('isCampaignPausedOrBlocked()'));
  assert.ok(room5Html.includes('sample_pins'));
  assert.ok(room5Html.includes('skip_rising_velocity'));
  assert.ok(room5Html.includes('min_folder_age_days'));
  assert.ok(room5Html.includes('max_repins'));
});

test('P0-1, P0-2, P1-1..5 & P2: camelCase pruning, 42703 fallback, pulse cache bump, fleet string metadata, Room 3 folder_id & popstate', async () => {
  // 1. P0-1: camelCase options in pruneFolderPins must NEVER be dropped to null; pruned_pins reflects deleted pins
  const camelQueries = [];
  const camelSql = createMockSql((query, values) => {
    camelQueries.push({ query, values });
    if (/FROM keyword_folder_items i/i.test(query)) {
      return [
        { keyword_id: 10, pin_id: '7001' },
        { keyword_id: 11, pin_id: '7002' }
      ];
    }
    if (/DELETE FROM keyword_serp_positions/i.test(query)) {
      return [{ keyword_id: 10, pin_id: '7001' }];
    }
    return [];
  });

  const camelDry = await pruneFolderPins(camelSql, 5, {
    dryRun: true,
    maxSaves: 3,
    maxRepins: 7,
    minPinAgeDays: 14,
    minFolderAgeDays: 5,
    skipRisingVelocity: 'false'
  });
  assert.equal(camelDry.summary.max_saves, 3);
  assert.equal(camelDry.summary.max_repins, 7);
  assert.equal(camelDry.summary.min_pin_age_days, 14);
  assert.equal(camelDry.summary.min_folder_age_days, 5);
  assert.equal(camelDry.summary.skip_rising_velocity, false, 'String "false" skip_rising_velocity must disable velocity guard');
  assert.ok(camelQueries[0].values.includes(3) && camelQueries[0].values.includes(7) && camelQueries[0].values.includes(14) && camelQueries[0].values.includes(5));

  const camelPruned = await pruneFolderPins(camelSql, 5, {
    dryRun: 'false',
    maxSaves: 0,
    maxRepins: 0
  });
  assert.equal(camelPruned.dry_run, false);
  assert.equal(camelPruned.pruned_count, 1);
  assert.equal(camelPruned.pruned_pins, 1, 'pruned_pins must count only actually deleted unique pins');

  // Verify campaign_tracked_pins deletion guards multi-keyword active pins inside same folder
  const trackedDelete = camelQueries.find((q) => /DELETE FROM campaign_tracked_pins/i.test(q.query));
  assert.ok(trackedDelete);
  assert.match(trackedDelete.query, /NOT EXISTS\s*\(\s*SELECT 1[\s\S]*kfi\.folder_id\s*=[\s\S]*ksp\.pin_id\s*=\s*ctp\.pin_id[\s\S]*ksp\.is_displaced\s*=\s*FALSE/i);

  // 2. getPruningCandidates 42703 fallback for missing first_seen_at (and rethrows unrelated 42703)
  let fallbackCalls = 0;
  const fallbackRows = await getPruningCandidates(
    createMockSql((q) => {
      fallbackCalls++;
      if (fallbackCalls === 1 && /first_seen_at/i.test(q)) {
        const err = new Error('column ksp.first_seen_at does not exist');
        err.code = '42703';
        throw err;
      }
      return [{ keyword_id: 1, pin_id: '555', folder_added_at: '2026-01-01' }];
    }),
    5,
    { minFolderAgeDays: 10 }
  );
  assert.equal(fallbackCalls, 2);
  assert.equal(fallbackRows.length, 1);

  await assert.rejects(
    () => getPruningCandidates(
      createMockSql(() => {
        const err = new Error('column ump.bogus_col does not exist');
        err.code = '42703';
        throw err;
      }),
      5,
      {}
    ),
    (err) => err.code === '42703'
  );

  // 3. P1-3 + P1-5: dry_run='0' executes prune + invalidates edge cache AND pulseMemoryCache; dry_run=null does NOT invalidate
  pulseMemoryCache.set('ws:2:pulse:all:24h:0', { cached: true });
  assert.deepEqual(pulseMemoryCache.get('ws:2:pulse:all:24h:0'), { cached: true });
  const zeroEdgeInvalidations = [];
  const zeroRes = await handleFoldersRoutes({
    pathname: '/api/folders/7/prune-pins',
    method: 'POST',
    request: { json: async () => ({ dry_run: '0', max_saves: 0 }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql((query) => {
      if (/FROM keyword_folders/i.test(query)) return [{ id: 7, name: 'Test', workspace_id: 2, metadata: {} }];
      if (/FROM keyword_folder_items i/i.test(query)) return [{ keyword_id: 10, pin_id: '9001' }];
      if (/DELETE FROM keyword_serp_positions/i.test(query)) return [{ keyword_id: 10, pin_id: '9001' }];
      return [];
    }),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (scope) => { zeroEdgeInvalidations.push(scope); }
  });
  assert.equal(zeroRes.status, 200);
  assert.equal(zeroRes.payload.dry_run, false);
  assert.deepEqual(zeroEdgeInvalidations.slice().sort(), ['domains:dossier', 'domains:leaderboard', 'folders', 'keywords']);
  assert.equal(pulseMemoryCache.get('ws:2:pulse:all:24h:0'), undefined, 'pulseMemoryCache must be invalidated after real prune');

  pulseMemoryCache.set('ws:2:pulse:all:24h:0', { cached: true });
  const nullDryInvalidations = [];
  const nullDryRes = await handleFoldersRoutes({
    pathname: '/api/folders/7/prune-pins',
    method: 'POST',
    request: { json: async () => ({ dry_run: null, max_saves: 0 }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql((query) => {
      if (/FROM keyword_folders/i.test(query)) return [{ id: 7, name: 'Test', workspace_id: 2, metadata: {} }];
      if (/FROM keyword_folder_items i/i.test(query)) return [{ keyword_id: 10, pin_id: '9001' }];
      return [];
    }),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (scope) => { nullDryInvalidations.push(scope); }
  });
  assert.equal(nullDryRes.payload.dry_run, true);
  assert.equal(nullDryInvalidations.length, 0);
  assert.deepEqual(pulseMemoryCache.get('ws:2:pulse:all:24h:0'), { cached: true });
  pulseMemoryCache.invalidate();

  // 4. P0-2 & P2: updateFolder JSONB string normalization + null/status validation + GET sql=null 503 + listFolders normalization
  const normCalls = [];
  await updateFolder(
    createMockSql((q, vals) => {
      normCalls.push({ q, vals });
      return [{ id: 5, name: 'Keep', description: 'Keep', icon: 'folder', workspace_id: 1, serp_top_n: 20, pin_graph_rules: {}, metadata: {} }];
    }),
    5,
    { description: null, icon: null, metadata: { pause_crawlers: true } }
  );
  assert.match(normCalls[0].q, /WHEN jsonb_typeof\(metadata\) = 'string'[\s\S]*\(metadata #>> '\{\}'\)::jsonb/i);
  assert.equal(normCalls[0].vals.includes('null'), false, 'null description/icon must never coerce to literal "null"');

  await assert.rejects(() => updateFolder(createMockSql(() => []), 5, { name: null }), (e) => e.status === 400);
  await assert.rejects(() => updateFolder(createMockSql(() => []), 5, { metadata: { status: 'bogus' } }), (e) => e.status === 400);

  const nullSqlRes = await handleFoldersRoutes({
    pathname: '/api/folders/5',
    method: 'GET',
    request: {},
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: null,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(nullSqlRes.status, 503);
  assert.equal(nullSqlRes.payload.error, 'DB_UNAVAILABLE');

  const listedFull = await listFolders(createMockSql(() => [{ id: 5, name: 'A', pin_graph_rules: '{"max_pages":150}', metadata: '{}' }]));
  const listedLite = await listFoldersLite(createMockSql(() => [{ id: 5, name: 'A', pin_graph_rules: '{"max_pages":150}', metadata: '{}' }]));
  assert.deepEqual(listedFull[0].pin_graph_rules, { max_pages: 150 });
  assert.deepEqual(listedLite[0].pin_graph_rules, { max_pages: 150 });

  // 5. P0-2, P0-4, P1-1 & P1-4: keyword-fleet, creator-fleet, cluster-intelligence, dispatch-workflow & archived checks
  for (const archivedMeta of [{ status: 'archived' }, '{"status":"archived"}', '{"block_fleet":true}']) {
    const kfModeC = await runKeywordFleetDispatch({
      sql: createMockSql((q) => {
        if (/FROM keyword_folders WHERE id/i.test(q)) return [{ id: 5, name: 'Archived', metadata: archivedMeta }];
        return [];
      }),
      env: { FOLDER_ID: '5' }
    });
    assert.equal(kfModeC.paused, true);
    assert.equal(kfModeC.taskCount, 0);

    const cfModeC = await runCreatorFleetDispatch({
      sql: createMockSql((q) => {
        if (/FROM keyword_folders WHERE id/i.test(q)) return [{ id: 5, name: 'Archived', metadata: archivedMeta }];
        return [];
      }),
      env: { FOLDER_ID: '5', TARGET_ACCOUNT: 'all' }
    });
    assert.equal(cfModeC.paused, true);
    assert.equal(cfModeC.taskCount, 0);
  }

  // Mode A SQL queries guard shared keywords/creators (NOT EXISTS ... OR EXISTS) and unwrap JSONB strings
  const kfModeAQueries = [];
  await runKeywordFleetDispatch({
    sql: createMockSql((q) => { kfModeAQueries.push(q); return []; }),
    env: { TARGET_KEYWORD: '' }
  });
  const kwSweepQuery = kfModeAQueries.find((q) => /FROM tracked_keywords tk/i.test(q));
  assert.ok(kwSweepQuery);
  assert.match(kwSweepQuery, /NOT EXISTS \(SELECT 1 FROM keyword_folder_items[\s\S]*OR EXISTS \(/i);
  assert.match(kwSweepQuery, /jsonb_typeof\(kf\.metadata\) = 'string'/i);

  const cfModeAQueries = [];
  await runCreatorFleetDispatch({
    sql: createMockSql((q) => { cfModeAQueries.push(q); return []; }),
    env: { TARGET_ACCOUNT: 'all' }
  });
  const crSweepQuery = cfModeAQueries.find((q) => /FROM competitor_profiles cp/i.test(q));
  assert.ok(crSweepQuery);
  assert.match(crSweepQuery, /NOT EXISTS \(SELECT 1 FROM folder_competitor_items[\s\S]*OR EXISTS \(/i);
  assert.match(crSweepQuery, /jsonb_typeof\(kf\.metadata\) = 'string'/i);

  // POST /api/keywords/dispatch-workflow & archived checks across endpoints
  const kwWorkflowRes = await handleKeywordsRoutes({
    pathname: '/api/keywords/dispatch-workflow',
    method: 'POST',
    request: { json: async () => ({ folder_id: 5 }) },
    searchParams: new URLSearchParams(),
    env: { GITHUB_TOKEN: 'ghp_test' },
    ctx: null,
    sql: createMockSql(() => [{ id: 5, name: 'Archived', workspace_id: 1, metadata: { status: 'archived' } }]),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(kwWorkflowRes.status, 409);
  assert.equal(kwWorkflowRes.payload.error, 'FOLDER_CRAWLING_PAUSED');

  const archivedDisc = await autoDiscoverFolderCreatorsForKeyword(
    createMockSql((q) => {
      if (/FROM keyword_folder_items kfi/i.test(q)) {
        return [{ id: 1, name: 'Archived', metadata: { status: 'archived' } }];
      }
      throw new Error('Should skip archived folder');
    }),
    99
  );
  assert.equal(archivedDisc.discovered, 0);

  // resolveSeedCrawlMaxPages allows up to 200 (not capped at 100)
  assert.equal(resolveSeedCrawlMaxPages({ pin_graph_rules: { max_pages: 175 } }, ''), 175);
  assert.equal(resolveSeedCrawlMaxPages({ pin_graph_rules: { max_pages: 250 } }, ''), 200);
  assert.equal(resolveSeedCrawlMaxPages({}, '160'), 160);

  // 6. P1-2 & P2 Client fixes: negative prune bounds preserved, popstate loads crossover, badge label, Room 3 sends folder_id
  const { app: uiApp } = instantiateFoldersApp('5', 'settings');
  uiApp.pruneForm.max_saves = -1;
  assert.equal(uiApp.buildPrunePayload(true).max_saves, -1, 'Negative max_saves must NOT silently turn into null/unlimited');
  uiApp.folderSettings = { pause_competitors: true, pause_crawlers: false, block_fleet: false };
  uiApp.activeFolder = { id: 5, metadata: {} };
  assert.equal(uiApp.isCampaignPausedOrBlocked(), true);
  assert.equal(uiApp.getCampaignPausedBadgeLabel(), 'Competitors Paused');

  let backPopHandler = null;
  const { app: backApp, sandbox: backSandbox } = instantiateFoldersApp('5', 'settings', {
    window: {
      location: { pathname: '/folders/5/settings', search: '', href: 'http://localhost:3000/folders/5/settings' },
      addEventListener: (ev, fn) => { if (ev === 'popstate') backPopHandler = fn; }
    }
  });
  await backApp.init();
  let reloadedOnBack = false;
  backApp.loadActiveFolder = async () => { reloadedOnBack = true; };
  backSandbox.window.location.pathname = '/folders/5';
  backPopHandler();
  assert.equal(backApp.currentRoom, 'crossover');
  assert.equal(reloadedOnBack, true, 'Returning to Room 1 via popstate without crossoverData must trigger loadActiveFolder()');

  // Room 3 dashboard clients forward folder_id when scopedFolderId is set
  const room3DispatchPayloads = [];
  const vmSandbox = {
    window: {
      apiFetch: async (u, opts) => {
        if (String(u).includes('/api/creators/dispatch-crawl')) {
          room3DispatchPayloads.push(JSON.parse(opts.body));
        }
        return { ok: true, json: async () => ({ success: true, competitor: { id: 202 } }) };
      },
      safeApiFetch: async (u, opts) => {
        if (String(u).includes('/api/creators/dispatch-crawl')) {
          room3DispatchPayloads.push(JSON.parse(opts.body));
        }
        return { ok: true, json: async () => ({ success: true }) };
      }
    },
    console
  };
  const ctx3 = vm.createContext(vmSandbox);
  const creatorsMethods = vm.runInContext(`({ ${getDashboardCreatorsFleetMethods()} })`, ctx3);
  const boardsMethods = vm.runInContext(`({ ${getDashboardBoardsAndPinMethods()} })`, ctx3);
  const fakeRoom3 = {
    ...creatorsMethods,
    ...boardsMethods,
    scopedFolderId: '42',
    selectedCompetitorIds: ['101'],
    competitors: [{ id: 101, username: 'alice' }],
    ghaCrawlMode: 'refresh',
    ghaTargetAccount: 'alice',
    ghaBulkUsernames: null,
    ghaBoardScope: 'all',
    ghaTargetBoards: [],
    isGhaCrawlerModalOpen: true,
    isDispatchingGitHubCrawl: false,
    newCompetitorHandle: 'bob_creator',
    newCompetitorAlsoTrack: false,
    newCompetitorDiscoverPins: true,
    newCompetitorDiscoverMode: 'deep',
    newCompetitorMaxPages: 10,
    newCompetitorAutoArchiveWinning: false,
    isSubmittingCreator: false,
    isAddCompetitorModalOpen: true,
    _clientCache: { boards: new Map() },
    getApiUrl: (u) => u,
    getCreatorSelectionKey: (c) => String(c.id),
    ensureCreatorLinkedToFolder: async () => {},
    syncCompetitor: async () => {},
    fetchCompetitors: async () => {},
    showToast: () => {},
    $nextTick: () => {}
  };
  await fakeRoom3.bulkRefreshWinnersSelected();
  await fakeRoom3.dispatchRefreshWinnersAction({ username: 'alice' });
  await fakeRoom3.submitGhaCrawlerDispatch();
  fakeRoom3.ghaBulkUsernames = ['alice', 'bob'];
  await fakeRoom3.submitGhaCrawlerDispatch();
  await fakeRoom3.submitTrackCreatorUnified();
  assert.equal(room3DispatchPayloads.length, 5);
  for (const b of room3DispatchPayloads) {
    assert.equal(b.folder_id, '42', 'Room 3 dispatch-crawl must forward scopedFolderId');
  }

  // Room 1 & Room 5 HTML byte budgets strictly < 215 KiB
  const room1Bytes = Buffer.byteLength(getCampaignFoldersPageHtml('5', 'crossover'), 'utf8');
  const room5Bytes = Buffer.byteLength(getCampaignFoldersPageHtml('5', 'settings'), 'utf8');
  assert.ok(room1Bytes < 215 * 1024, `Room 1 HTML (${room1Bytes} bytes) must stay < 215 KiB`);
  assert.ok(room5Bytes < 215 * 1024, `Room 5 HTML (${room5Bytes} bytes) must stay < 215 KiB`);
});
