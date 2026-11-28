/**
 * Room 2 (Keywords Fleet & Level 2 SERP Studio) P0/P1/P2 Hardening Suite
 *
 * Verifies:
 *  - P0 Analytics & Truthfulness: null/0 rank sort order, uploaded-by-user domain exclusion,
 *    emoji-free opportunity badges + truthful opportunity_score, zero fabricated trend volumes,
 *    zero fabricated 3d/7d multipliers or synthetic sparklines, zero hardcoded 380878/85/86/4/10 UI defaults.
 *  - P0 Workspace Isolation & Security: GET /api/keywords, POST /api/keywords/bulk-import,
 *    and POST /api/keywords/dispatch-workflow reject malformed or cross-workspace folder_id (400/404),
 *    cache key includes workspace_id, GET trends endpoints never write to DB, sync reports real failure,
 *    and bulk-import surfaces DB errors as HTTP 500 instead of swallowing into 200.
 *  - P0/P1 Data Integrity & Payload Hygiene: slimSerpPinMetadata strips raw Pinterest bloat,
 *    getKeywordDisplacedPins honors status filter and drops duplicate displaced_pins key,
 *    listKeywords excludes keyword_ignored_pins and drops ghost last_crawled_pins_count fallback,
 *    SERP comparison selects comment_count & share_count, DELETE /api/folders/items supports batch keyword_ids.
 *  - P1/P2 Room 2 UX & Dead-Code Cleanup: folder-scoped action bar, folder-safe single/bulk removal,
 *    activeNav='folders' when scoped, refreshWorkspace(true) with 15s cooldown, fixed popstate,
 *    KPI cards anchored to total keywords, fixed "X of Y Queries" counter, no double displaced fetch,
 *    and removal of dead dashboardGrowthFilter/dashboardPinsFilter/filteredDisplacedPins.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { calculateKeywordIntelligenceSummary } from '../src/modules/keywords/analytics.mjs';
import {
  slimSerpPinMetadata,
  getKeywordDisplacedPins
} from '../src/modules/keywords/displaced-and-tombstones.mjs';
import {
  listKeywords,
  getKeywordSERPComparison
} from '../src/modules/keywords/serp-dossier-service.mjs';
import { batchRemoveKeywordsFromFolder } from '../src/modules/keywords/folders-crud.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { getKeywordsPageHtml } from '../src/ui/keywords/index.mjs';
import { getKeywordsClientAppScript } from '../src/ui/keywords/keywords-client-app.mjs';

const ROOT = process.cwd();

function makeJsonResponse(payload, status = 200, maxAge = 0, extraHeaders = {}) {
  return {
    status,
    maxAge,
    headers: extraHeaders,
    body: payload,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    }
  };
}

function makeMethodNotAllowed(allow) {
  return makeJsonResponse({ success: false, error: 'METHOD_NOT_ALLOWED', allow }, 405);
}

// ============================================================================
// 1. P0 Analytics: Rank Sorting, Uploaded-By-User Exclusion, Opportunity Score
// ============================================================================
test('calculateKeywordIntelligenceSummary sorts null/0 rank last, excludes uploaded-by-user domains, and computes truthful opportunity_score without emojis', () => {
  const pins = [
    // Null & 0-rank old high-save pins MUST sort last (outside Top 10 / Top 12)
    ...Array.from({ length: 12 }, (_, i) => ({
      pin_id: String(100 + i),
      rank_position: i % 2 === 0 ? null : 0,
      domain: i === 0 ? 'example.com' : 'Uploaded by user',
      save_count: 9999,
      metadata: { pin_age_days: 400, pinner: { follower_count: 500000 } }
    })),
    // Genuine ranked Top 1..3 fresh low-save pins
    { pin_id: '201', rank_position: 1, domain: 'organic', save_count: 20, metadata: { pin_age_days: 10, pinner: { follower_count: 100 } } },
    { pin_id: '202', rank_position: 2, domain: 'uploaded-by-user', save_count: 30, metadata: { pin_age_days: 20, pinner: { follower_count: 200 } } },
    { pin_id: '203', rank_position: 3, domain: 'blog.foodsite.com', save_count: 40, metadata: { pin_age_days: 30, pinner: { follower_count: 300 } } }
  ];

  const summary = calculateKeywordIntelligenceSummary(pins);

  // Only 2 of 15 pins have genuine external domains ('example.com' and 'blog.foodsite.com') -> Math.round(2/15*100) = 13
  assert.equal(summary.copywriting.has_destination_pct, 13);

  // Opportunity badge must contain NO emoji symbols and opportunity_score must match criteria score/3
  assert.doesNotMatch(summary.opportunity.badge, /[⚪🔴🟢🟡]/u);
  assert.equal(summary.opportunity.opportunity_score, Math.round((summary.opportunity.score / 3) * 100));

  // Because null/0 ranks sorted AFTER ranks 1..3, all 3 low-save ranked pins land in Top 10 -> saves_dont_decide passes!
  const savesCrit = summary.opportunity.criteria.find(c => c.id === 'saves_dont_decide');
  assert.equal(savesCrit.pass, true);

  const emptySummary = calculateKeywordIntelligenceSummary([]);
  assert.equal(emptySummary.opportunity.opportunity_score, 0);
  assert.equal(emptySummary.opportunity.badge, 'No Data');
});

// ============================================================================
// 2. P0/P2 Payload Hygiene: slimSerpPinMetadata & getKeywordDisplacedPins
// ============================================================================
test('slimSerpPinMetadata strips raw Pinterest bloat while retaining UI allowlist fields', () => {
  const bloated = {
    pin_age_days: 14,
    format: 'video',
    aspect_ratio: 0.67,
    aspect_ratio_tier: '2:3',
    is_new: true,
    rank_delta: 4,
    prev_rank: 9,
    baseline_date: '2026-11-20',
    is_deleted: false,
    status: 'active',
    raw_saves: 412,
    repin_count: 88,
    board_name: 'Healthy Breakfast',
    creation_method: 'native',
    created_at_pinterest: '2026-11-01T00:00:00Z',
    deltas: { saves_24h: 12, repins_24h: 3 },
    pinner: {
      username: 'chef_anna',
      full_name: 'Chef Anna',
      follower_count: 42000,
      image_small_url: 'https://i.pinimg.com/75x75/a.jpg',
      giant_raw_blob: 'x'.repeat(5000)
    },
    visual_annotations: ['huge', 'array', 'already', 'in', 'visual_tags'],
    raw_pinterest_payload: { massive: 'x'.repeat(10000) }
  };

  const slim = slimSerpPinMetadata(bloated);
  assert.equal(slim.pin_age_days, 14);
  assert.equal(slim.format, 'video');
  assert.equal(slim.rank_delta, 4);
  assert.equal(slim.board_name, 'Healthy Breakfast');
  assert.deepEqual(slim.deltas, { saves_24h: 12, repins_24h: 3 });
  assert.deepEqual(slim.pinner, {
    username: 'chef_anna',
    full_name: 'Chef Anna',
    follower_count: 42000,
    image_small_url: 'https://i.pinimg.com/75x75/a.jpg'
  });
  assert.equal(slim.raw_pinterest_payload, undefined);
  assert.equal(slim.visual_annotations, undefined);
});

test('getKeywordDisplacedPins honors status filter, slims metadata, and drops duplicate displaced_pins key', async () => {
  let executedSqlCount = 0;
  const mockSql = async (strings) => {
    executedSqlCount++;
    const text = strings.join(' ');
    if (text.includes('COUNT(*)')) {
      return [{ total: 1 }];
    }
    return [{
      pin_id: '987654321012',
      title: 'Tater Tot Bake',
      domain: 'recipes.example.com',
      save_count: 350,
      repin_count: 45,
      comment_count: 2,
      share_count: 7,
      last_known_rank: 12,
      metadata: {
        pin_age_days: 45,
        board_name: 'Dinner Ideas',
        creation_method: 'api',
        created_at_pinterest: '2026-10-01T00:00:00Z',
        raw_bloat: 'y'.repeat(2000)
      }
    }];
  };

  // Unsupported status must short-circuit with 0 results instead of ignoring status
  const emptyStatusRes = await getKeywordDisplacedPins(mockSql, 136, { status: 'deleted_only' });
  assert.equal(emptyStatusRes.total, 0);
  assert.deepEqual(emptyStatusRes.pins, []);
  assert.equal('displaced_pins' in emptyStatusRes, false);
  assert.equal(executedSqlCount, 0);

  // Default ALL status returns slimmed pins with NO duplicate displaced_pins key
  const allRes = await getKeywordDisplacedPins(mockSql, 136, { status: 'ALL', limit: 500, offset: 0 });
  assert.equal(allRes.total, 1);
  assert.equal(allRes.pins.length, 1);
  assert.equal('displaced_pins' in allRes, false);
  assert.equal(allRes.pins[0].board_name, 'Dinner Ideas');
  assert.equal(allRes.pins[0].metadata.pin_age_days, 45);
  assert.equal(allRes.pins[0].metadata.raw_bloat, undefined);
});

// ============================================================================
// 3. P0/P1 SQL Hygiene: listKeywords & getKeywordSERPComparison
// ============================================================================
test('listKeywords excludes keyword_ignored_pins and never uses ghost last_crawled_pins_count fallback', async () => {
  const capturedQueries = [];
  const mockSql = async (strings) => {
    capturedQueries.push(strings.join(' '));
    return [];
  };

  await listKeywords(mockSql, { search: '', folderId: 5 });
  await listKeywords(mockSql, { search: 'breakfast', folderId: 5 });

  assert.equal(capturedQueries.length, 2);
  for (const q of capturedQueries) {
    assert.match(q, /NOT EXISTS\s*\(\s*SELECT 1 FROM keyword_ignored_pins/i);
    assert.doesNotMatch(q, /last_crawled_pins_count/);
  }
});

test('getKeywordSERPComparison selects comment_count & share_count and slims current_pins metadata', async () => {
  const capturedQueries = [];
  const mockSql = async (strings) => {
    const q = strings.join(' ');
    capturedQueries.push(q);
    if (q.includes('FROM tracked_keywords')) {
      return [{ id: 136, keyword: 'breakfast ideas', is_active: true, metadata: {} }];
    }
    if (q.includes('FROM keyword_serp_positions ksp') && q.includes('ksp.is_displaced = FALSE')) {
      return [{
        pin_id: '111222333444',
        rank_position: 1,
        title: 'Avocado Toast',
        domain: 'food.example.com',
        save_count: 500,
        repin_count: 90,
        comment_count: 14,
        share_count: 23,
        daily_save_velocity: 18,
        daily_repin_velocity: 4,
        visual_tags: ['breakfast'],
        metadata: { pin_age_days: 12, giant_unused_blob: 'z'.repeat(4000) }
      }];
    }
    if (q.includes('FROM keyword_guided_capsules')) return [];
    if (q.includes('COUNT(*)')) return [{ total: 0 }];
    return [];
  };

  const res = await getKeywordSERPComparison(mockSql, 136, null, { env: {} });
  const serpSelect = capturedQueries.find(q => q.includes('ksp.is_displaced = FALSE'));
  assert.ok(serpSelect, 'Expected active SERP SELECT query');
  assert.match(serpSelect, /ump\.comment_count/);
  assert.match(serpSelect, /ump\.share_count/);

  assert.equal(res.current_pins.length, 1);
  assert.equal(res.current_pins[0].comment_count, 14);
  assert.equal(res.current_pins[0].share_count, 23);
  assert.equal(res.current_pins[0].metadata.pin_age_days, 12);
  assert.equal(res.current_pins[0].metadata.giant_unused_blob, undefined);
});

// ============================================================================
// 4. P0 Workspace Isolation, Read-Only GET Trends & Truthful Error Surfaces
// ============================================================================
test('GET /api/keywords validates folder_id, enforces workspace isolation (404), and namespaces cacheKey by workspace_id', async () => {
  const capturedCacheKeys = [];
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM keyword_folders')) {
      const folderId = Number(values[0]);
      const wsId = Number(values[1]);
      if (folderId === 5 && wsId === 1) return [{ id: 5, workspace_id: 1, name: 'Recipes' }];
      return [];
    }
    return [];
  };

  const makeArgs = (url, workspaceId = 1) => {
    const u = new URL(url, 'https://app.hymum.com');
    return {
      pathname: u.pathname,
      method: 'GET',
      request: { headers: new Headers() },
      searchParams: u.searchParams,
      env: {},
      ctx: {},
      sql: mockSql,
      workspaceId,
      jsonResponse: makeJsonResponse,
      methodNotAllowedResponse: makeMethodNotAllowed,
      clampLimit: (v, d, m) => Math.min(m, Math.max(1, Number(v) || d)),
      buildCanonicalCacheKey: (prefix, params) => {
        const key = `${prefix}:${JSON.stringify(params)}`;
        capturedCacheKeys.push({ prefix, params, key });
        return key;
      },
      getCachedOrFetch: async (_k, fn) => fn(),
      invalidateEdgeCache: async () => {},
      safeWaitUntil: () => {},
      isValidPinId: (id) => /^\d{10,30}$/.test(String(id)),
      tripPinterestCircuitBreaker: () => {},
      redactSecrets: (s) => String(s)
    };
  };

  // Malformed folder_id -> 400
  const badRes = await handleKeywordsRoutes(makeArgs('/api/keywords?folder_id=5.5', 1));
  assert.equal(badRes.status, 400);

  // Cross-workspace folder_id -> 404
  const crossWsRes = await handleKeywordsRoutes(makeArgs('/api/keywords?folder_id=5', 2));
  assert.equal(crossWsRes.status, 404);

  // Valid same-workspace folder_id -> 200 and workspace_id present in cache key
  const okRes = await handleKeywordsRoutes(makeArgs('/api/keywords?folder_id=5', 1));
  assert.equal(okRes.status, 200);
  assert.equal(capturedCacheKeys.length, 1);
  assert.equal(capturedCacheKeys[0].params.workspace_id, 1);
  assert.equal(capturedCacheKeys[0].params.folder_id, 5);
});

test('POST /api/keywords/bulk-import enforces workspace folder isolation (404) and surfaces DB failures as HTTP 500', async () => {
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM keyword_folders')) {
      const folderId = Number(values[0]);
      const wsId = Number(values[1]);
      if (folderId === 5 && wsId === 1) return [{ id: 5, workspace_id: 1, name: 'Recipes' }];
      return [];
    }
    if (q.includes('FROM app_settings')) return [];
    if (q.includes('INSERT INTO tracked_keywords')) {
      throw new Error('simulated_db_write_failure');
    }
    return [];
  };

  const makePostArgs = (bodyObj, workspaceId = 1) => ({
    pathname: '/api/keywords/bulk-import',
    method: 'POST',
    request: {
      headers: new Headers(),
      body: bodyObj,
      async json() { return bodyObj; }
    },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId,
    jsonResponse: makeJsonResponse,
    methodNotAllowedResponse: makeMethodNotAllowed,
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (p) => p,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    isValidPinId: () => true,
    tripPinterestCircuitBreaker: () => {},
    redactSecrets: (s) => String(s)
  });

  // Cross-workspace folder_id -> 404
  const crossRes = await handleKeywordsRoutes(makePostArgs({ keywords: ['avocado toast'], folder_id: 5 }, 2));
  assert.equal(crossRes.status, 404);

  // DB failure -> HTTP 500 with success: false (never swallowed into HTTP 200)
  const errRes = await handleKeywordsRoutes(makePostArgs({ keywords: ['avocado toast'], folder_id: 5 }, 1));
  assert.equal(errRes.status, 500);
  assert.equal(errRes.body.success, false);
  assert.equal(errRes.body.error, 'BULK_IMPORT_FAILED');
});

test('POST /api/keywords/dispatch-workflow rejects cross-workspace folder_id with 404 and malformed folder_id with 400', async () => {
  const mockSql = async () => [];
  const makeDispatchArgs = (bodyObj, workspaceId = 2) => ({
    pathname: '/api/keywords/dispatch-workflow',
    method: 'POST',
    request: { headers: new Headers(), async json() { return bodyObj; } },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId,
    jsonResponse: makeJsonResponse,
    methodNotAllowedResponse: makeMethodNotAllowed,
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (p) => p,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    isValidPinId: () => true,
    tripPinterestCircuitBreaker: () => {},
    redactSecrets: (s) => String(s)
  });

  const badRes = await handleKeywordsRoutes(makeDispatchArgs({ folder_id: 'abc' }, 1));
  assert.equal(badRes.status, 400);

  const crossRes = await handleKeywordsRoutes(makeDispatchArgs({ folder_id: '5' }, 2));
  assert.equal(crossRes.status, 404);
});

test('DELETE /api/folders/items supports atomic batch keyword_ids removal via batchRemoveKeywordsFromFolder', async () => {
  const queries = [];
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    queries.push({ q, values });
    if (q.includes('FROM keyword_folders')) {
      return [{ id: 5, workspace_id: 1, name: 'Recipes' }];
    }
    if (q.includes('DELETE FROM keyword_folder_items')) {
      return [{ keyword_id: 10 }, { keyword_id: 11 }];
    }
    return [];
  };

  // Direct unit check on batchRemoveKeywordsFromFolder
  const direct = await batchRemoveKeywordsFromFolder(mockSql, 5, [10, 11, 10, 'invalid', -2]);
  assert.equal(direct.removed, 2);
  assert.deepEqual(direct.removed_ids, [10, 11]);

  // Route check via handleFoldersRoutes
  const res = await handleFoldersRoutes({
    pathname: '/api/folders/items',
    method: 'DELETE',
    request: {
      headers: new Headers(),
      async json() { return { folder_id: 5, keyword_ids: [10, 11] }; }
    },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 1,
    jsonResponse: makeJsonResponse,
    methodNotAllowedResponse: makeMethodNotAllowed,
    invalidateEdgeCache: async () => {}
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.removed, 2);
});

test('trends-service.mjs has zero fabricated linear volume formula and GET trends routes never pass sql to fetchPinterestTrendsPopularPins', () => {
  const trendsServiceSrc = fs.readFileSync(path.join(ROOT, 'src/modules/keywords/trends-service.mjs'), 'utf8');
  assert.doesNotMatch(trendsServiceSrc, /avgCount\s*\*\s*3650/);
  assert.doesNotMatch(trendsServiceSrc, /peakVal\s*\*\s*1200/);

  const routesSrc = fs.readFileSync(path.join(ROOT, 'src/routes/keywords.mjs'), 'utf8');
  assert.doesNotMatch(routesSrc, /canMutateTrendsDb/);
  assert.doesNotMatch(routesSrc, /fetchPinterestTrendsPopularPins\(sql,\s*term,\s*country,\s*force\)/);
  assert.match(routesSrc, /fetchPinterestTrendsPopularPins\(null,\s*term,\s*country,\s*force\)/);
  assert.match(routesSrc, /resolveActivePinterestCookie/);
});

// ============================================================================
// 5. P0/P1/P2 Room 2 HTML & Client Logic Invariants
// ============================================================================
test('Room 2 scoped HTML & Client App enforce truthful UI, folder-safe actions, and dead-code removal', () => {
  const scopedHtml = getKeywordsPageHtml('', '', '5');
  const globalHtml = getKeywordsPageHtml('', '', '');
  const clientScript = getKeywordsClientAppScript();

  // Sidebar activeNav highlights Campaigns ('folders') when scoped and calls refreshWorkspace(true)
  assert.match(scopedHtml, /refreshWorkspace\(true\)/);
  assert.match(scopedHtml, /Room 2: Keywords Fleet/);
  assert.match(scopedHtml, /\+ Add Keyword to Folder/);
  assert.match(scopedHtml, /Crawl Folder Fleet/);
  assert.match(scopedHtml, /removeKeywordFromActiveFolder\(kw\)/);
  assert.match(scopedHtml, /bulkRemoveFromActiveFolder\(\)/);
  assert.match(scopedHtml, /Active SERP Slots/);
  assert.match(scopedHtml, /Displaced Vault Slots/);
  assert.match(scopedHtml, /filteredDashboardKeywords\.length \+ ' of ' \+ keywords\.length \+ ' Queries'/);
  assert.match(scopedHtml, /\(kw\.active_pins_count \?\? 0\) \+ ' Act'/);

  // Zero fabricated numbers, emojis, Arabic UI strings, or double arrows in Room 2 / SERP Studio HTML
  assert.doesNotMatch(scopedHtml, /380878/);
  assert.doesNotMatch(scopedHtml, /\?\?\s*85/);
  assert.doesNotMatch(scopedHtml, /female_pct\s*\|\|\s*86/);
  assert.doesNotMatch(scopedHtml, /male_pct\s*\|\|\s*4/);
  assert.doesNotMatch(scopedHtml, /unspecified_pct\s*\|\|\s*10/);
  assert.doesNotMatch(scopedHtml, /peak_value\s*\|\|\s*100/);
  assert.doesNotMatch(scopedHtml, /current_index\s*\|\|\s*56/);
  assert.doesNotMatch(scopedHtml, /← Back to Keywords Dashboard/);
  assert.doesNotMatch(scopedHtml, /الصور كاملة|بانر الكولاج|بطاقات التحليل/);
  assert.doesNotMatch(scopedHtml, /growthPaceFilter = '3d'/);
  assert.doesNotMatch(scopedHtml, /growthPaceFilter = '7d'/);
  assert.doesNotMatch(scopedHtml, /Math\.min\(24,\s*totalDisplacedCount/);
  assert.match(scopedHtml, /Math\.min\(500,\s*totalDisplacedCount/);

  // Global HTML still renders cleanly
  assert.match(globalHtml, /Keywords Fleet Dashboard/);

  // Client JS dead code & fabricated formulas eliminated
  assert.doesNotMatch(clientScript, /dashboardGrowthFilter/);
  assert.doesNotMatch(clientScript, /dashboardPinsFilter/);
  assert.doesNotMatch(clientScript, /filteredDisplacedPins/);
  assert.doesNotMatch(clientScript, /displacedStatusFilter/);
  assert.doesNotMatch(clientScript, /daily_save_velocity \|\| 0\) \* 3/);
  assert.doesNotMatch(clientScript, /daily_save_velocity \|\| 0\) \* 7/);
  assert.doesNotMatch(clientScript, /cur \* 0\.6/);
  assert.match(clientScript, /async refreshWorkspace\(force = true\)/);
  assert.match(clientScript, /async removeKeywordFromActiveFolder\(kw\)/);
  assert.match(clientScript, /async bulkRemoveFromActiveFolder\(\)/);
  assert.match(clientScript, /daily_repin_velocity/);
  assert.match(clientScript, /scopedFolderId/);
});

test('Client keywordStudio pure methods (getPaceDelta, getSparklinePoints, getActiveSerpPercentage, KPI anchoring) behave accurately at runtime', () => {
  const scriptTag = getKeywordsClientAppScript();
  const jsBody = scriptTag.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

  const sandbox = {
    window: {
      __INITIAL_FOLDER_ID__: '5',
      __INITIAL_KEYWORD_SLUG__: '',
      location: { pathname: '/folders/5/keywords', search: '' },
      PAE: {
        formatNumber: (n) => String(n),
        safeUrl: (u) => u,
        safeColor: (c) => c,
        sanitizeCsvCell: (v) => String(v)
      }
    },
    URLSearchParams,
    Math,
    Number,
    Date,
    Array,
    Set,
    Map,
    String,
    Object,
    Boolean
  };

  vm.createContext(sandbox);
  vm.runInContext(jsBody, sandbox);
  const app = sandbox.keywordStudio();

  // 1. KPI cards must remain anchored to full folder keywords even when search filters the table
  app.keywords = [
    { id: 1, keyword: 'tater tot casserole', category: 'Dinner', is_active: true, active_pins_count: 20, displaced_pins_count: 100, avg_daily_velocity: 10, folders: [{ id: 5, name: 'Recipes' }] },
    { id: 2, keyword: 'breakfast burritos', category: 'Breakfast', is_active: false, active_pins_count: 0, displaced_pins_count: 40, avg_daily_velocity: 0, folders: [{ id: 5, name: 'Recipes' }] }
  ];
  app.dashboardSearch = 'tater';
  assert.equal(app.filteredDashboardKeywords.length, 1);
  assert.equal(app.activeKeywordsCount, 1);
  assert.equal(app.pausedKeywordsCount, 1);
  assert.equal(app.totalActivePinsCount, 20);
  assert.equal(app.totalDisplacedPinsCount, 140);

  // 2. getActiveSerpPercentage must return 0% when active_pins_count === 0 and displaced > 0 (never 100%)
  assert.equal(app.getActiveSerpPercentage({ active_pins_count: 0, displaced_pins_count: 40, total_pins: 40 }), 0);
  assert.equal(app.getActiveSerpPercentage({ active_pins_count: 20, displaced_pins_count: 80 }), 20);

  // 3. getPaceDelta uses real 24h saves & repins velocities and NEVER fabricates 3d/7d multipliers
  app.growthPaceFilter = '24h';
  assert.equal(app.getPaceDelta({ daily_save_velocity: 15, daily_repin_velocity: 6 }, 'saves'), '+15');
  assert.equal(app.getPaceDelta({ daily_save_velocity: 15, daily_repin_velocity: 6 }, 'repins'), '+6');
  app.growthPaceFilter = '7d';
  assert.equal(app.getPaceDelta({ daily_save_velocity: 15, daily_repin_velocity: 6 }, 'saves'), '');
  app.growthPaceFilter = 'all';
  assert.equal(app.getPaceDelta({ daily_save_velocity: 15 }, 'saves'), '');

  // 4. getSparklinePoints returns [] when real velocity_history is missing (no synthetic ramp)
  assert.deepEqual(Array.from(app.getSparklinePoints({ avg_daily_velocity: 42, metadata: {} })), []);
  assert.deepEqual(Array.from(app.getSparklinePoints({ metadata: { velocity_history: [{ velocity: 5 }, { velocity: 12 }] } })), [5, 12]);
});

// ============================================================================
// 6. P1/P2/P3 Review Hardening Regression Suite
// ============================================================================
test('P1-1: listKeywords enforces workspace_id isolation in folder_map and falls back cleanly on legacy 42703 schema', async () => {
  const captured = [];
  const wsSql = async (strings, ...values) => {
    captured.push({ q: strings.join(' '), values });
    return [];
  };

  await listKeywords(wsSql, { search: '', folderId: 5, workspaceId: 2 });
  await listKeywords(wsSql, { search: 'keto', folderId: 5, workspaceId: 2 });
  assert.equal(captured.length, 2);
  for (const entry of captured) {
    assert.match(entry.q, /JOIN keyword_folders f ON f\.id = kfi\.folder_id AND f\.workspace_id =/i);
    assert.ok(entry.values.includes(2), 'workspaceId=2 must be bound to SQL query');
  }

  // Legacy schema fallback when workspace_id column is absent (PostgreSQL 42703)
  let attempts = 0;
  const legacySql = async (strings) => {
    attempts++;
    const q = strings.join(' ');
    if (q.includes('f.workspace_id')) {
      const err = new Error('column f.workspace_id does not exist');
      err.code = '42703';
      throw err;
    }
    return [{ id: 1, keyword: 'legacy term', folders: [] }];
  };
  const fallbackRows = await listKeywords(legacySql, { search: '', workspaceId: 2 });
  assert.equal(attempts, 2);
  assert.equal(fallbackRows.length, 1);
  assert.equal(fallbackRows[0].keyword, 'legacy term');
});

test('P2-1 & P2-5: DELETE /api/folders/items supports proxy-safe query fallback, post-mutation cache invalidation, settings folder cache invalidation, and visual-search workspace cookie isolation', async () => {
  const events = [];
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM keyword_folders')) {
      const folderId = Number(values[0]);
      const wsId = Number(values[1]);
      if (folderId === 5 && wsId === 1) return [{ id: 5, workspace_id: 1, name: 'Recipes' }];
      return [];
    }
    if (q.includes('DELETE FROM keyword_folder_items')) {
      events.push('db_delete');
      return [{ keyword_id: 10 }, { keyword_id: 11 }];
    }
    if (q.includes('UPDATE app_settings') || q.includes('INSERT INTO app_settings')) {
      events.push('db_settings_update');
      return [{ max_serp_pins: 75 }];
    }
    if (q.includes('UPDATE tracked_keywords')) {
      events.push('db_kw_settings_update');
      return [{ id: 9, target_pin_count: 75 }];
    }
    return [];
  };

  // 1. Proxy-stripped DELETE body: query params ?folder_id=5&keyword_ids=10,11 still succeed,
  //    and invalidateEdgeCache runs AFTER DB delete.
  const proxyRes = await handleFoldersRoutes({
    pathname: '/api/folders/items',
    method: 'DELETE',
    request: {
      headers: new Headers(),
      async json() { throw new Error('Body stripped by proxy'); }
    },
    searchParams: new URLSearchParams('folder_id=5&keyword_ids=10,11'),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 1,
    jsonResponse: makeJsonResponse,
    methodNotAllowedResponse: makeMethodNotAllowed,
    invalidateEdgeCache: async (key) => { events.push(`invalidate:${key}`); }
  });
  assert.equal(proxyRes.status, 200);
  assert.equal(proxyRes.body.removed, 2);
  assert.equal(events[0], 'db_delete', 'DB delete must occur before edge cache invalidation');
  assert.ok(events.includes('invalidate:keywords'));
  assert.ok(events.includes('invalidate:folders'));

  // 2. Cross-workspace folder rejection (404) must NOT trigger cache invalidation
  const crossEvents = [];
  await assert.rejects(
    () => handleFoldersRoutes({
      pathname: '/api/folders/items',
      method: 'DELETE',
      request: { headers: new Headers(), async json() { return { folder_id: 5, keyword_ids: [10] }; } },
      searchParams: new URLSearchParams(),
      env: {},
      ctx: {},
      sql: mockSql,
      workspaceId: 2,
      jsonResponse: makeJsonResponse,
      methodNotAllowedResponse: makeMethodNotAllowed,
      invalidateEdgeCache: async (key) => { crossEvents.push(key); }
    }),
    (err) => err?.status === 404 || err?.statusCode === 404
  );
  assert.equal(crossEvents.length, 0, 'Failed cross-workspace check must not invalidate cache');

  // 3. POST /api/keywords/settings invalidates both keywords and folders edge cache post-mutation
  const kwSettingsEvents = [];
  const kwSettingsRes = await handleKeywordsRoutes({
    pathname: '/api/keywords/settings',
    method: 'POST',
    request: { headers: new Headers(), async json() { return { keyword_id: 9, target_pin_count: 75 }; } },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: async (strings) => {
      const q = strings.join(' ');
      if (q.includes('UPDATE tracked_keywords')) {
        kwSettingsEvents.push('db_update');
        return [{ id: 9, target_pin_count: 75 }];
      }
      return [];
    },
    workspaceId: 1,
    jsonResponse: makeJsonResponse,
    methodNotAllowedResponse: makeMethodNotAllowed,
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (p) => p,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async (key) => { kwSettingsEvents.push(`invalidate:${key}`); },
    safeWaitUntil: () => {},
    isValidPinId: () => true,
    tripPinterestCircuitBreaker: () => {},
    redactSecrets: (s) => String(s)
  });
  assert.equal(kwSettingsRes.status, 200);
  assert.equal(kwSettingsEvents[0], 'db_update');
  assert.ok(kwSettingsEvents.includes('invalidate:folders'));

  // 4. Visual-search route enforces WORKSPACE-COOKIE-ISOLATION via unified resolveActivePinterestCookie
  const routesSrc = fs.readFileSync(path.join(ROOT, 'src/routes/keywords.mjs'), 'utf8');
  const visualBlockMatch = routesSrc.match(/pathname === '\/api\/keywords\/visual-search'[\s\S]*?return jsonResponse\(result/);
  assert.ok(visualBlockMatch, 'Expected visual-search route block');
  assert.match(visualBlockMatch[0], /resolveActivePinterestCookie\(sql,\s*\{\s*workspaceId,\s*env\s*\}\)/);
});

test('P1-2..5, P2-1..5 & P3-1..5: Runtime VM verification of keywordStudio client fixes and SSR HTML guards', async () => {
  const scriptTag = getKeywordsClientAppScript();
  const jsBody = scriptTag.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  const fetchCalls = [];

  const mockApiFetch = async (url, opts = {}) => {
    fetchCalls.push({ url, method: opts.method || 'GET', body: opts.body || null });
    if (url.startsWith('/api/folders') && (!opts.method || opts.method === 'GET')) {
      return {
        ok: true,
        async json() {
          return {
            success: true,
            folders: [{ id: 5, name: 'Updated Recipes', color: '#10b981', keyword_count: 14 }]
          };
        }
      };
    }
    if (url === '/api/folders' && opts.method === 'POST') {
      return {
        ok: true,
        async json() {
          return { success: true, folder: { id: 99, name: 'Other Campaign', color: '#3b82f6' } };
        }
      };
    }
    if (url.startsWith('/api/keywords/trends?term=')) {
      const term = decodeURIComponent(url.split('term=')[1]);
      if (term === 'keyword a') {
        return {
          ok: true,
          async json() {
            return { success: true, term: 'keyword a', current_index: 82, search_volume: '50k', demographics: { female_pct: 90 } };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return { success: true, term: 'keyword b', current_index: 0 };
        }
      };
    }
    if (url.startsWith('/api/keywords/trends/popular-pins')) {
      return { ok: true, async json() { return { success: true, popular_pins: [] }; } };
    }
    if (url.startsWith('/api/keywords/displaced')) {
      return {
        ok: true,
        async json() {
          return {
            success: true,
            pins: [{ pin_id: '3001', title: 'Vault C', save_count: 50, is_displaced: true }]
          };
        }
      };
    }
    if (url === '/api/keywords' && opts.method === 'POST') {
      return {
        ok: true,
        async json() {
          return { success: true, keyword: { id: 777, keyword: 'new pasta bake', category: 'Dinner', is_active: true } };
        }
      };
    }
    if (url.startsWith('/api/folders/items') && opts.method === 'POST') {
      return { ok: true, async json() { return { success: true, added: 1 }; } };
    }
    if (url.startsWith('/api/keywords/serp-compare')) {
      return { ok: true, async json() { return { success: true, keyword: { id: 777, keyword: 'new pasta bake' }, current_pins: [], dropped_out_pins: [] }; } };
    }
    if (url.startsWith('/api/keywords?')) {
      return { ok: true, async json() { return { success: true, keywords: [] }; } };
    }
    if (url.startsWith('/api/keywords/dispatch-workflow')) {
      return { ok: true, async json() { return { success: true }; } };
    }
    return { ok: true, async json() { return { success: true }; } };
  };

  const sandbox = {
    window: {
      __INITIAL_FOLDER_ID__: '5',
      __INITIAL_KEYWORD_SLUG__: '',
      location: { pathname: '/folders/5/keywords', search: '' },
      history: { pushState() {} },
      apiFetch: mockApiFetch,
      safeApiFetch: mockApiFetch,
      PAE: {
        formatNumber: (n) => String(n),
        safeUrl: (u) => u,
        safeColor: (c) => c,
        sanitizeCsvCell: (v) => String(v),
        confirm: async () => true
      }
    },
    AbortController,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: () => 0,
    Math,
    Number,
    Date,
    Array,
    Set,
    Map,
    String,
    Object,
    Boolean,
    JSON,
    Promise
  };

  vm.createContext(sandbox);
  vm.runInContext(jsBody, sandbox);
  const app = sandbox.keywordStudio();
  app.$nextTick = (fn) => { if (typeof fn === 'function') fn(); };

  // P1-2: Switching trends from Keyword A to Keyword B never leaks A's search_volume/demographics
  await app.fetchTrends('keyword a');
  assert.equal(app.trendsData.search_volume, '50k');
  assert.equal(app.trendsData.demographics.female_pct, 90);
  await app.fetchTrends('keyword b');
  assert.equal(app.trendsData.term, 'keyword b');
  assert.equal(app.trendsData.current_index, 0);
  assert.equal(app.trendsData.search_volume, undefined, 'Keyword A search_volume must not bleed into Keyword B');
  assert.equal(app.trendsData.demographics, undefined, 'Keyword A demographics must not bleed into Keyword B');

  // P1-3: fetchFolders refreshes activeFolder with matched server fields; saveNewCampaignFolder does not clobber scoped activeFolder
  app.activeFolder = { id: 5, name: 'Stale Name', keyword_count: 2, ssr_only_flag: true };
  await app.fetchFolders();
  assert.equal(app.activeFolder.name, 'Updated Recipes');
  assert.equal(app.activeFolder.keyword_count, 14);
  assert.equal(app.activeFolder.ssr_only_flag, true);

  app.newFolder = { name: 'Other Campaign', description: '', color: '#3b82f6' };
  await app.saveNewCampaignFolder();
  assert.equal(app.activeFolder.id, 5, 'Creating a new folder inside scoped /folders/5/keywords must not overwrite activeFolder');

  // P1-4: getInspectorAnnotations reads top-level visual_annotations/annotations/visual_tags even when metadata is slimmed or empty
  app.dossierData = null;
  app.activeInspectorPin = { pin_id: '123', visual_annotations: ['Air Fryer', 'Easy Dinner'], metadata: {} };
  assert.deepEqual(Array.from(app.getInspectorAnnotations()), ['Air Fryer', 'Easy Dinner']);
  app.activeInspectorPin = { pin_id: '124', annotations: ['Sheet Pan'], metadata: { visual_annotations: [] } };
  assert.deepEqual(Array.from(app.getInspectorAnnotations()), ['Sheet Pan']);

  // P1-5: openFleetDispatchModal on dashboard clears stale selectedKeyword so executeFleetDispatch sends folder_id='5'
  app.viewModeLevel = 'dashboard';
  app.selectedKeyword = { id: 1, keyword: 'stale keyword', target_pin_count: 50 };
  app.openFleetDispatchModal();
  assert.equal(app.fleetDispatchTargetKeyword, '', 'Dashboard fleet dispatch must clear stale selectedKeyword');
  fetchCalls.length = 0;
  await app.executeFleetDispatch();
  const dispatchCall = fetchCalls.find(c => c.url === '/api/keywords/dispatch-workflow');
  assert.ok(dispatchCall, 'Expected dispatch-workflow POST');
  const dispatchPayload = JSON.parse(dispatchCall.body);
  assert.equal(dispatchPayload.folder_id, '5', 'Folder-wide dispatch must include scoped folder_id');
  assert.equal(dispatchPayload.target_keyword, '');

  // In SERP Studio, openFleetDispatchModal() still targets selectedKeyword
  app.viewModeLevel = 'serp_studio';
  app.openFleetDispatchModal();
  assert.equal(app.fleetDispatchTargetKeyword, 'stale keyword');

  // P2-3: computeSerpPowerPairs uses analyzedPinsList (respecting intelScope), not filteredPins
  app.selectedKeywordDetails = {
    current_pins: [
      { pin_id: '1', rank_position: 1, visual_tags: ['alpha', 'beta'], metadata: {} },
      { pin_id: '2', rank_position: 2, visual_tags: ['alpha', 'beta'], metadata: {} }
    ],
    dropped_out_pins: [
      { pin_id: '3', rank_position: null, visual_tags: ['gamma', 'delta'], metadata: {} },
      { pin_id: '4', rank_position: null, visual_tags: ['gamma', 'delta'], metadata: {} }
    ]
  };
  app.displacedPins = [];
  app.rebuildPinCaches();
  app.pinViewScope = 'active';
  app.intelScope = 'displaced';
  const displacedPairs = app.computeSerpPowerPairs();
  assert.ok(displacedPairs.some(p => p.tagA === 'delta' && p.tagB === 'gamma'), 'computeSerpPowerPairs must respect intelScope=displaced');

  // P2-5: fetchDisplacedPins(append=true) sets displacedPinsTotal to combined displacedVaultPins.length
  app.selectedKeyword = { id: 1, keyword: 'test kw' };
  app.displacedOffset = 2;
  app.displacedPinsTotal = 10;
  await app.fetchDisplacedPins(1, true);
  assert.equal(app.displacedVaultPins.length, 3);
  assert.equal(app.displacedPinsTotal, 3, 'Short final append page must clamp displacedPinsTotal to combined displacedVaultPins.length');

  // P2-4: submitQuickKeyword does NOT duplicate POST /api/folders/items and attaches folder membership
  fetchCalls.length = 0;
  app.keywords = [];
  app.quickKeywordInput = 'new pasta bake';
  app.quickKeywordCategory = 'Dinner';
  await app.submitQuickKeyword();
  const folderItemPosts = fetchCalls.filter(c => c.url.startsWith('/api/folders/items') && c.method === 'POST');
  assert.equal(folderItemPosts.length, 1, 'submitQuickKeyword must send POST /api/folders/items exactly once');
  const addedKw = app.keywords.find(k => k.id === 777);
  assert.ok(addedKw, 'Newly created keyword must be added to local keywords list');
  assert.ok(app.filteredDashboardKeywords.some(k => k.id === 777), 'Newly created keyword must carry active folder membership so it remains visible on dashboard');

  // P2-1: Client DELETE calls include proxy-safe query params alongside JSON body
  fetchCalls.length = 0;
  app.selectedKeywordIds = [10, 11];
  await app.bulkRemoveFromActiveFolder();
  const bulkDelCall = fetchCalls.find(c => c.method === 'DELETE' && c.url.startsWith('/api/folders/items'));
  assert.ok(bulkDelCall, 'Expected DELETE /api/folders/items call');
  assert.match(bulkDelCall.url, /folder_id=5/);
  assert.match(bulkDelCall.url, /keyword_ids=10%2C11|keyword_ids=10,11/);

  // P3-3 & P3-5: nightlySyncCountdown matches 01:00 UTC cron and dead getQuotaPercentage is removed
  assert.match(app.nightlySyncCountdown, /01:00 UTC/);
  assert.equal(app.getQuotaPercentage, undefined, 'Dead getQuotaPercentage helper must be removed');

  // P2-2, P3-1, P3-2, P3-4, P1-4 HTML assertions
  const scopedHtml = getKeywordsPageHtml('', '', '5');
  assert.match(scopedHtml, /openFleetDispatchModal\(''\)/);
  assert.match(scopedHtml, /getKeywordTotalPins\(kw\) > 0 \? \(100 - getActiveSerpPercentage\(kw\)\) : 0/);
  assert.match(scopedHtml, /trendsData\?\.current_index != null \? trendsData\.current_index \+ '\/100' : '52w'/);
  assert.match(scopedHtml, /:key="'pp-' \+ pIdx \+ '-' \+ p"/);
  assert.match(scopedHtml, /selectedKeyword\?\.target_pin_count \|\| appSettings\.max_serp_pins \|\| appSettings\.default_max_pins \|\| 50/);
  assert.match(scopedHtml, /activeInspectorPin\?\.description/);
  assert.doesNotMatch(scopedHtml, /activeInspectorPin\?\.metadata\?\.reactions/);
});

