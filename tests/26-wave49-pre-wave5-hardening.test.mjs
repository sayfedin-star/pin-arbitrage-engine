/**
 * Wave 4.9 Pre-Wave 5 Hardening Regression Suite (tests/26-wave49-pre-wave5-hardening.test.mjs)
 *
 * Verifies:
 * 1. syncCampaignTopNSerpPins SQL omits nonexistent campaign_tracked_pins.updated_at.
 * 2. WS2+ cookie isolation across newborn-fleet, keyword-velocity-crawler, creator-velocity-crawler, and POST /api/keywords/sync.
 * 3. CRLF/LF migration checksum stability (calculateChecksum) & Migration 015 structure.
 * 4. Global Pulse window=10d uses gains_10d instead of silent 24h fallback.
 * 5. Complete Pin & Creator cascade deletes (including SAVEPOINT 42P01 resilience).
 * 6. Room 3 total_boards floor preserves full profile.total_boards over truncated boards list.
 * 7. Room 5 pause/block guards on POST /api/keywords/dispatch-workflow & Mode A/B keyword/creator fleet dispatchers.
 * 8. GHA workflows setup-instabox-db tunnel auth inputs & MAX_PAGES empty default.
 * 9. Frontend SSR budgets (/folders/42/domains, /folders/42/keywords), Light-mode /pin/:id contrast, activeNav & md:!ml-20 shells.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFastifyApp } from '../src/server.mjs';
import { syncCampaignTopNSerpPins, saveWorkspaceCookie } from '../src/modules/workspaces/service.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { handlePinsRoutes } from '../src/routes/pins.mjs';
import { handleClusterRoutes } from '../src/routes/cluster.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { buildFolderCrossoverMatrix } from '../src/modules/keywords/folders-crossover-builders.mjs';
import { deleteCompetitor } from '../src/modules/creators/competitors-crud.mjs';
import { getCompetitorDetail } from '../src/modules/creators/creator-analytics.mjs';
import { invalidateGlobalPulseCache } from '../src/modules/pulse/service.mjs';
import { calculateChecksum, splitSqlStatements } from '../scripts/migrate.mjs';
import { runNewbornFleetWorker } from '../scripts/newborn-fleet.mjs';
import { resolveSerpCookieForKeyword } from '../scripts/keyword-velocity-crawler.mjs';
import { resolveCreatorForceRefresh } from '../scripts/creator-velocity-crawler.mjs';
import { runKeywordFleetDispatch } from '../scripts/keyword-fleet.mjs';
import { runCreatorFleetDispatch } from '../scripts/creator-fleet.mjs';
import { compactHtmlFragment } from '../src/ui/shared-head.mjs';
import { getFoldersStudioViewHtml } from '../src/ui/folders/folders-studio-view.mjs';
import { getPinDetailPageHtml } from '../src/ui/pin-details/index.mjs';
import { getDomainsPageHtml } from '../src/ui/domains/index.mjs';
import { getPulsePageHtml } from '../src/ui/pulse/index.mjs';

const jsonResponse = (payload, status = 200, _ttl = 0, headers = {}) => ({ status, payload, headers });
const methodNotAllowedResponse = (allowed = 'GET, OPTIONS') => ({
  status: 405,
  payload: { success: false, error: 'METHOD_NOT_ALLOWED' },
  headers: { Allow: allowed }
});

function createMockSql(handler) {
  const fn = async (strings, ...values) => {
    const query = Array.from(strings).join('?');
    return handler(query, values);
  };
  fn.unsafe = async (rawSql, values = []) => handler(String(rawSql), values);
  fn.begin = async (cb) => cb(fn);
  fn.end = async () => {};
  return fn;
}

test('Wave 4.9.1: syncCampaignTopNSerpPins omits nonexistent updated_at on campaign_tracked_pins updates', async () => {
  const executed = [];
  const makeSql = (serpRows) => createMockSql((query, values) => {
    executed.push({ query, values });
    if (/FROM\s+keyword_folders/i.test(query)) {
      return [{ id: 12, workspace_id: 2, serp_top_n: 25 }];
    }
    if (/FROM\s+keyword_folder_items/i.test(query) && /keyword_serp_positions/i.test(query)) {
      return serpRows;
    }
    if (/INSERT\s+INTO\s+campaign_tracked_pins/i.test(query)) {
      return serpRows;
    }
    if (/UPDATE\s+campaign_tracked_pins/i.test(query)) {
      assert.doesNotMatch(query, /updated_at/i, 'campaign_tracked_pins has no updated_at column');
      return [{ pin_id: '1111111111' }];
    }
    return [];
  });

  const emptyRes = await syncCampaignTopNSerpPins(makeSql([]), { folderId: 12, workspaceId: 2 });
  assert.equal(emptyRes.synced, 0);
  assert.equal(emptyRes.deactivated, 1);

  const populatedRes = await syncCampaignTopNSerpPins(
    makeSql([{ pin_id: '2222222222' }, { pin_id: '3333333333' }]),
    { folderId: 12, workspaceId: 2, topN: 20 }
  );
  assert.equal(populatedRes.synced, 2);
  assert.equal(populatedRes.deactivated, 1);
  assert.ok(
    executed.some((e) => /UPDATE\s+campaign_tracked_pins/i.test(e.query)),
    'Expected campaign_tracked_pins update queries to execute'
  );
});

test('Wave 4.9.2: WS2+ cookie isolation across sync API, keyword-velocity-crawler, creator-velocity-crawler & newborn-fleet', async () => {
  // 1. POST /api/keywords/sync rejects client-supplied body.cookie
  const cookieRejectRes = await handleKeywordsRoutes({
    pathname: '/api/keywords/sync',
    method: 'POST',
    request: { json: async () => ({ keyword_id: 1, cookie: '_pinterest_sess=evil' }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql(() => []),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(cookieRejectRes.status, 400);
  assert.equal(cookieRejectRes.payload.error, 'CLIENT_COOKIE_FORBIDDEN');

  // 2. resolveSerpCookieForKeyword never falls back to defaultCookie (env.PINTEREST_COOKIE) for WS2+ folders
  const ws2OnlySql = createMockSql((query) => {
    if (/FROM\s+keyword_folder_items/i.test(query)) return [{ workspace_id: 2 }];
    return [];
  });
  const ws2Cookie = await resolveSerpCookieForKeyword(ws2OnlySql, 77, {
    defaultCookie: 'global_ws1_secret_cookie'
  });
  assert.deepEqual(
    ws2Cookie,
    { cookie: '', workspaceId: 2, disableGlobalCookieFallback: true },
    'WS2+ keyword must never inherit global defaultCookie'
  );

  // WS1 keyword still falls back cleanly to defaultCookie when workspace setting is empty
  const ws1Sql = createMockSql((query) => {
    if (/FROM\s+keyword_folder_items/i.test(query)) return [{ workspace_id: 1 }];
    return [];
  });
  const ws1Cookie = await resolveSerpCookieForKeyword(ws1Sql, 77, {
    defaultCookie: 'global_ws1_secret_cookie'
  });
  assert.equal(ws1Cookie.cookie, 'global_ws1_secret_cookie');
  assert.equal(ws1Cookie.disableGlobalCookieFallback, false);

  // 3. resolveCreatorForceRefresh honors explicit FORCE_REFRESH='false' / '0'
  const prevForce = process.env.FORCE_REFRESH;
  const prevEvent = process.env.GITHUB_EVENT_NAME;
  try {
    process.env.FORCE_REFRESH = 'false';
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    assert.equal(resolveCreatorForceRefresh(), false);
    process.env.FORCE_REFRESH = '0';
    assert.equal(resolveCreatorForceRefresh(), false);
  } finally {
    if (prevForce === undefined) delete process.env.FORCE_REFRESH;
    else process.env.FORCE_REFRESH = prevForce;
    if (prevEvent === undefined) delete process.env.GITHUB_EVENT_NAME;
    else process.env.GITHUB_EVENT_NAME = prevEvent;
  }

  // 4. runNewbornFleetWorker respects paused/blocked folders and passes workspaceId for WS2+
  const pausedSql = createMockSql((query) => {
    if (/FROM\s+newborn_runs/i.test(query)) {
      return [{
        id: 91,
        workspace_id: 2,
        status: 'running',
        cancel_requested_at: null,
        selected_keywords: ['minimalist living room'],
        seed_queries: [],
        config_snapshot: {},
        folder_id: 55,
        shards_total: 1
      }];
    }
    if (/FROM\s+keyword_folders/i.test(query)) {
      return [{ id: 55, metadata: { pause_crawlers: true, status: 'paused' } }];
    }
    return [];
  });
  const pausedOut = await runNewbornFleetWorker({
    sql: pausedSql,
    parsedArgs: { mode: 'db_run', runId: 91, workerIndex: 0, workerTotal: 1 }
  });
  assert.equal(pausedOut.ok, true);
  assert.equal(pausedOut.skipped, true);
  assert.equal(pausedOut.reason, 'folder_paused_or_blocked');
});

test('Wave 4.9.3: CRLF/LF checksum parity in calculateChecksum and Migration 015 validity', () => {
  const lf = 'SELECT 1;\nUPDATE foo SET bar = 2;\n';
  const crlf = 'SELECT 1;\r\nUPDATE foo SET bar = 2;\r\n';
  assert.equal(calculateChecksum(lf), calculateChecksum(crlf));

  const migPath = path.join(process.cwd(), 'scripts', 'migrations', '015_wave49_jsonb_repair_and_index_hygiene.sql');
  assert.ok(fs.existsSync(migPath), 'Migration 015 file must exist');
  const rawSql = fs.readFileSync(migPath, 'utf8');
  assert.ok(!rawSql.includes('\r\n'), 'Migration 015 must use strict LF endings');
  const stmts = splitSqlStatements(rawSql);
  assert.ok(stmts.length >= 10, `Expected Migration 015 to contain >= 10 SQL statements, got ${stmts.length}`);
});

test('Wave 4.9.4: Global Pulse /api/pulse/24h?window=10d applies gains_10d instead of falling back to 24h', async (t) => {
  invalidateGlobalPulseCache();
  const pulseSql = createMockSql((query) => {
    if (/COUNT\(\*\)\s+OVER\(\)::int\s+AS\s+full_count/i.test(query)) {
      return [{
        full_count: 1,
        keyword_id: 1,
        keyword_text: 'boho nursery',
        keyword_category: 'Decor',
        folders: [{ folder_id: 1, folder_name: 'Nursery', folder_color: '#e11d48' }],
        pin_id: '987654321012',
        rank_position: 2,
        prev_rank_position: 5,
        title: 'Boho Nursery Accent Wall',
        domain: 'decorstudio.example',
        destination_url: 'https://decorstudio.example/boho-nursery',
        image_url: 'https://i.pinimg.com/736x/11/22/33.jpg',
        creator_username: 'decorstudio',
        board_name: 'Nursery Ideas',
        description: 'Boho nursery inspo',
        alt_text: 'Nursery',
        save_count: 1400,
        repin_count: 220,
        daily_save_velocity: 12,
        delta_saves_24h: 12,
        delta_repins_24h: 3,
        gains_5d: 85,
        gains_7d: 130,
        gains_10d: 444,
        gains_15d: 510,
        url_global_saves: 1500,
        dominant_color: '#d4a373',
        visual_annotations: ['boho nursery'],
        created_at_pinterest: new Date(Date.now() - 8 * 86400_000).toISOString(),
        creation_method: 'pinterest_platform',
        crawled_at: new Date().toISOString()
      }];
    }
    return [];
  });

  const app = createFastifyApp({ NODE_ENV: 'test', DATABASE_URL: '', SQL_CLIENT: pulseSql });
  t.after(async () => { await app.close(); });

  const res10d = await app.inject({ method: 'GET', url: '/api/pulse/24h?window=10d' });
  assert.equal(res10d.statusCode, 200);
  const body = res10d.json();
  assert.equal(body.success, true);
  assert.equal(body.breakout_pins?.length, 1);
  assert.equal(body.breakout_pins[0].window_saves_gain, 444, 'window=10d must expose gains_10d (444), not 24h fallback (12)');
});

test('Wave 4.9.5: Complete Pin & Creator cascade deletes across tracked, watchlist, and newborn tables', async () => {
  const pinQueries = [];
  const pinSql = createMockSql((query) => {
    pinQueries.push(query);
    if (/DELETE FROM newborn_candidate_snapshots/i.test(query)) {
      const err = new Error('relation "newborn_candidate_snapshots" does not exist');
      err.code = '42P01';
      throw err;
    }
    return [];
  });

  const pinDelRes = await handlePinsRoutes({
    pathname: '/api/pins/1098245059167667976',
    method: 'DELETE',
    request: {},
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: pinSql,
    isValidPinId: (id) => /^\d{6,30}$/.test(String(id || '')),
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {},
    buildCanonicalCacheKey: (p, q) => `${p}?${new URLSearchParams(q)}`,
    redactSecrets: (s) => s
  });
  assert.equal(pinDelRes.status, 200);
  assert.equal(pinDelRes.payload.purged, true);

  const pinCombined = pinQueries.join('\n');
  for (const tbl of [
    'universal_master_pins',
    'campaign_tracked_pins',
    'campaign_pin_graph_seeds',
    'workspace_watchlist',
    'newborn_run_candidates',
    'newborn_daily_anchors',
    'newborn_candidates',
    'pin_visual_search_cache'
  ]) {
    assert.ok(pinCombined.includes(tbl), `DELETE /api/pins/:pin_id must cascade cleanup ${tbl}`);
  }
  assert.ok(pinQueries.some((q) => /ROLLBACK TO SAVEPOINT sp_del_ncs/i.test(q)), 'Optional missing tables must rollback cleanly via SAVEPOINT');

  const compQueries = [];
  const compSql = createMockSql((query) => {
    compQueries.push(query);
    if (/SELECT id, username FROM competitor_profiles/i.test(query)) {
      return [{ id: 88, username: 'targetcreator' }];
    }
    return [];
  });
  await deleteCompetitor(compSql, 88);
  const compCombined = compQueries.join('\n');
  assert.ok(compCombined.includes('folder_competitor_items'));
  assert.ok(compCombined.includes('workspace_watchlist'));
  assert.ok(compCombined.includes('newborn_rookie_accounts'));
});

test('Wave 4.9.6: Room 3 getCompetitorDetail preserves full profile.total_boards over truncated boards list', async () => {
  const compSql = createMockSql((query) => {
    if (/SELECT \* FROM competitor_profiles WHERE id/i.test(query)) {
      return [{
        id: 42,
        username: 'bigcreator',
        display_name: 'Big Creator',
        monthly_reach: 120000,
        profile_views: 90000,
        follower_count: 5000,
        total_pins: 2400,
        total_boards: 55,
        metadata: {}
      }];
    }
    if (/FROM competitor_boards cb/i.test(query)) {
      return [
        { id: 1, competitor_id: 42, board_id: 'b1', name: 'Board 1', pin_count: 100, follower_count: 50 },
        { id: 2, competitor_id: 42, board_id: 'b2', name: 'Board 2', pin_count: 80, follower_count: 40 }
      ];
    }
    if (/FROM competitor_history_snapshots/i.test(query)) return [];
    if (/FROM competitor_board_pins/i.test(query)) {
      return [{ total_catalog_pins: 180, total_saves: 5000, total_repins: 1000, official_urls_count: 10 }];
    }
    return [];
  });

  const detail = await getCompetitorDetail(compSql, 42);
  assert.equal(detail.profile.total_boards, 55, 'total_boards must preserve 55 via Math.max(profile.total_boards, boards.length)');
});

test('Wave 4.9.7: Room 5 pause/block guards block unlinked manual keyword dispatch & Mode A/B fleet reactivation', async () => {
  // 1. POST /api/keywords/dispatch-workflow without folder_id -> 409 when all linked folders are paused/blocked
  const dispatchRes = await handleKeywordsRoutes({
    pathname: '/api/keywords/dispatch-workflow',
    method: 'POST',
    request: { json: async () => ({ target_keyword: 'paused niche' }) },
    searchParams: new URLSearchParams(),
    env: { GITHUB_TOKEN: 'ghp_test_token' },
    ctx: null,
    sql: createMockSql((query) => {
      if (/FROM\s+tracked_keywords\s+tk/i.test(query)) {
        return [{ kw: 'paused niche', metadata: { block_fleet: true, status: 'paused' } }];
      }
      return [];
    }),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(dispatchRes.status, 409);
  assert.equal(dispatchRes.payload.error, 'FOLDER_CRAWLING_PAUSED');

  // 2. runKeywordFleetDispatch Mode B (single keyword) refuses reactivation & returns taskCount=0
  const kwUpdates = [];
  const kwPausedSql = createMockSql((query) => {
    if (/pg_get_serial_sequence/i.test(query)) return [];
    if (/SELECT\s+settings_json/i.test(query) || /FROM\s+app_settings/i.test(query)) return [];
    if (/JOIN\s+keyword_folder_items/i.test(query)) {
      return [{ metadata: { pause_crawlers: true } }];
    }
    if (/UPDATE\s+tracked_keywords/i.test(query)) {
      kwUpdates.push(query);
    }
    return [];
  });
  const kwModeB = await runKeywordFleetDispatch({
    sql: kwPausedSql,
    env: { TARGET_KEYWORD: 'paused niche', ENABLE_SERP_HARVEST: 'true' }
  });
  assert.equal(kwModeB.taskCount, 0);
  assert.equal(kwModeB.paused, true);
  assert.equal(kwUpdates.length, 0, 'Mode B must NOT reactivate is_active=TRUE on paused keyword');

  // 3. runCreatorFleetDispatch Mode B (single account) refuses reactivation & returns taskCount=0
  const creatorUpdates = [];
  const creatorPausedSql = createMockSql((query) => {
    if (/FROM\s+competitor_profiles/i.test(query) && /SELECT/i.test(query)) {
      return [{ id: 77, username: 'pausedcreator', is_active: false }];
    }
    if (/FROM\s+workspace_watchlist/i.test(query)) return [];
    if (/FROM\s+folder_competitor_items/i.test(query)) {
      return [{ metadata: { block_fleet: true } }];
    }
    if (/UPDATE\s+competitor_profiles/i.test(query) && /is_active\s*=\s*TRUE/i.test(query)) {
      creatorUpdates.push(query);
    }
    return [];
  });
  const creatorModeB = await runCreatorFleetDispatch({
    sql: creatorPausedSql,
    env: { TARGET_ACCOUNT: 'pausedcreator' }
  });
  assert.equal(creatorModeB.taskCount, 0);
  assert.equal(creatorModeB.paused, true);
  assert.equal(creatorUpdates.length, 0, 'Mode B must NOT reactivate is_active=TRUE on paused creator');
});

test('Wave 4.9.8: GHA workflows pass full InstaBox tunnel auth on setup-instabox-db & clear MAX_PAGES default', () => {
  for (const wfName of ['crawler-pipeline.yml', 'keyword-intelligence-velocity.yml']) {
    const wfPath = path.join(process.cwd(), '.github', 'workflows', wfName);
    const yaml = fs.readFileSync(wfPath, 'utf8');
    const blocks = yaml.split('./.github/actions/setup-instabox-db').slice(1);
    assert.ok(blocks.length >= 2, `${wfName} must use setup-instabox-db`);
    for (const block of blocks) {
      const snippet = block.slice(0, 350);
      assert.match(snippet, /machine-id:/, `${wfName} setup-instabox-db missing machine-id`);
      assert.match(snippet, /cf-access-client-id:/, `${wfName} setup-instabox-db missing cf-access-client-id`);
      assert.match(snippet, /cf-access-client-secret:/, `${wfName} setup-instabox-db missing cf-access-client-secret`);
    }
    if (wfName === 'crawler-pipeline.yml') {
      assert.match(yaml, /MAX_PAGES:\s*\$\{\{\s*inputs\.max_pages\s*\|\|\s*''\s*\}\}/);
    }
  }
});

test('Wave 4.9.9: Frontend SSR budgets, Light-mode /pin/:id contrast, activeNav & md:!ml-20 shells', async (t) => {
  const noopSql = createMockSql(() => []);
  const app = createFastifyApp({ NODE_ENV: 'test', DATABASE_URL: '', SQL_CLIENT: noopSql });
  t.after(async () => { await app.close(); });

  const domRes = await app.inject({ method: 'GET', url: '/folders/42/domains' });
  assert.equal(domRes.statusCode, 200);
  assert.ok(Buffer.byteLength(domRes.body, 'utf8') < 210 * 1024, 'Expected /folders/42/domains < 210 KB');

  const kwRes = await app.inject({ method: 'GET', url: '/folders/42/keywords' });
  assert.equal(kwRes.statusCode, 200);
  assert.ok(Buffer.byteLength(kwRes.body, 'utf8') < 370 * 1024, 'Expected /folders/42/keywords < 370 KB');

  // Direct HTML activeNav check for Campaigns in folder-scoped Room 4 & Pulse
  const domainsFolderHtml = getDomainsPageHtml('', '42');
  const pulseFolderHtml = getPulsePageHtml('42');
  assert.match(domainsFolderHtml, /href="\/campaigns"\s+data-nav-key="campaigns"[\s\S]*?bg-rose-50\s+text-rose-600/);
  assert.match(pulseFolderHtml, /href="\/campaigns"\s+data-nav-key="campaigns"[\s\S]*?bg-rose-50\s+text-rose-600/);

  // Light-mode contrast on /pin/:id dossier labels
  const pinHtml = getPinDetailPageHtml('1234567890');
  assert.ok(pinHtml.includes('text-slate-900 dark:text-white'), 'Pin dossier labels must include Light-mode ink text-slate-900');
  assert.ok(pinHtml.includes('hover:text-slate-900 dark:hover:text-white'), 'Pin dossier summary hover must support Light mode');

  // All 8 <main> / pin-details shell wrappers use md:!ml-20 (never bare !ml-20 on mobile)
  for (const url of ['/', '/accounts', '/domains', '/folders', '/keywords', '/newborn', '/pin/1234567890', '/pulse', '/keywords/discovery']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /<(?:main|div)\b[^>]*isSidebarCollapsed\s*\?\s*'md:!ml-20'/, `${url} must use md:!ml-20`);
    assert.doesNotMatch(res.body, /<(?:main|div)\b[^>]*isSidebarCollapsed\s*\?\s*'!ml-20'/, `${url} must not apply bare !ml-20 on mobile`);
  }
});

test('Wave 4.9.10: Room 1 monopoly_creator_count is untruncated across >20 creators', async () => {
  const pinRows = Array.from({ length: 25 }, (_, i) => ({
    pin_id: String(1000000000 + i),
    keyword_id: 1,
    keyword_text: 'boho decor',
    rank_position: i + 1,
    is_displaced: false,
    title: `Pin ${i}`,
    domain: `site${i}.example`,
    clean_domain: `site${i}.example`,
    creator_username: `creator_${i}`,
    save_count: 100 + i,
    repin_count: 10 + i,
    daily_save_velocity: 5,
    delta_saves_24h: 5,
    delta_repins_24h: 1,
    image_url: `https://i.pinimg.com/736x/aa/bb/${i}.jpg`,
    visual_annotations: []
  }));
  const matrix = await buildFolderCrossoverMatrix({
    sql: createMockSql(() => []),
    folder: { id: 42, name: 'Test Campaign', metadata: {} },
    folderKeywords: [{ id: 1, keyword: 'boho decor', metadata: {} }],
    totalKeywords: 1,
    pinRows,
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: []
  });
  assert.equal(matrix.top_creators.length, 20, 'top_creators list stays capped at top 20');
  assert.equal(matrix.summary.monopoly_creator_count, 25, 'summary.monopoly_creator_count must reflect all 25 unique creators');
});

test('Wave 4.9.11: compactHtmlFragment strips non-lock comments before and after lock markers in linear time', () => {
  const sample = [
    '<!-- regular comment before lock -->',
    '<div>hello</div>',
    '<!-- INVARIANT-LOCK: KEEP-ME -->',
    '<!-- another regular comment -->',
    '<!-- Lock 7: KEEP-ME-TOO -->',
    '<!-- trailing comment -->'
  ].join('\n');
  const compacted = compactHtmlFragment(sample);
  assert.ok(!compacted.includes('regular comment before lock'));
  assert.ok(!compacted.includes('another regular comment'));
  assert.ok(!compacted.includes('trailing comment'));
  assert.ok(compacted.includes('<!-- INVARIANT-LOCK: KEEP-ME -->'));
  assert.ok(compacted.includes('<!-- Lock 7: KEEP-ME-TOO -->'));

  const studioOut = compactHtmlFragment(getFoldersStudioViewHtml({ activeRoom: 'crossover', safeFolderId: '42' }));
  const remainingComments = studioOut.match(/<!--[\s\S]*?-->/g) || [];
  assert.ok(remainingComments.length > 0, 'Expected lock comments to remain in folders studio view');
  for (const c of remainingComments) {
    assert.match(c, /(?:INVARIANT-LOCK|Lock \d+)/, `Non-lock comment leaked after compaction: ${c}`);
  }
});

test('Wave 4.9.12: Cookie inputs reject non-string objects and POST /api/settings/cookie invalidates sync/async caches safely', async () => {
  await assert.rejects(
    () => saveWorkspaceCookie(createMockSql(() => []), 2, { evil: true }),
    (err) => err?.status === 400
  );

  const invalidatedScopes = [];
  const objRes = await handleClusterRoutes({
    pathname: '/api/settings/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: { bad: 1 } }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql(() => []),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: (scope) => { invalidatedScopes.push(scope); }
  });
  assert.equal(objRes.status, 400);
  assert.equal(objRes.payload.error, 'INVALID_COOKIE_TYPE');

  const okRes = await handleClusterRoutes({
    pathname: '/api/settings/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: '_pinterest_sess=valid_cookie_token_12345' }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql: createMockSql(() => []),
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: (scope) => { invalidatedScopes.push(scope); }
  });
  assert.equal(okRes.status, 200);
  assert.deepEqual(invalidatedScopes.sort(), ['creators', 'keywords', 'settings', 'workspaces']);
});

test('Wave 4.9.13: Creator dispatch routes forward folder_id and enforce Room 5 pause/block guards', async () => {
  const prevFetch = globalThis.fetch;
  const dispatchedBodies = [];
  globalThis.fetch = async (_url, init) => {
    dispatchedBodies.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  };

  try {
    const dispatchRes = await handleCreatorsRoutes({
      pathname: '/api/creators/dispatch-crawl',
      method: 'POST',
      request: { json: async () => ({ username: '@targetcreator', folder_id: 42, crawl_mode: 'discovery' }) },
      searchParams: new URLSearchParams(),
      env: { GITHUB_TOKEN: 'ghp_test_token' },
      ctx: null,
      sql: createMockSql((query) => {
        if (/FROM\s+keyword_folders/i.test(query)) {
          return [{ id: 42, name: 'Active', workspace_id: 1, serp_top_n: 20, metadata: { status: 'active' } }];
        }
        return [];
      }),
      workspaceId: 1,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: async () => {}
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchedBodies[0]?.inputs?.folder_id, '42');

    // Related-pins dispatch blocked by explicit paused folder_id
    const pausedFolderRes = await handleCreatorsRoutes({
      pathname: '/api/creators/related-pins/dispatch-workflow',
      method: 'POST',
      request: { json: async () => ({ username: '@targetcreator', folder_id: 42 }) },
      searchParams: new URLSearchParams(),
      env: { GITHUB_TOKEN: 'ghp_test_token' },
      ctx: null,
      sql: createMockSql((query) => {
        if (/FROM\s+keyword_folders/i.test(query)) {
          return [{ id: 42, name: 'Paused', workspace_id: 1, serp_top_n: 20, metadata: { pause_competitors: true } }];
        }
        return [];
      }),
      workspaceId: 1,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: async () => {}
    });
    assert.equal(pausedFolderRes.status, 409);
    assert.equal(pausedFolderRes.payload.error, 'FOLDER_COMPETITORS_PAUSED');

    // Related-pins dispatch blocked when all linked folders are paused/blocked (unlinked request)
    const pausedLinkedRes = await handleCreatorsRoutes({
      pathname: '/api/creators/related-pins/dispatch-workflow',
      method: 'POST',
      request: { json: async () => ({ username: '@pausedcreator' }) },
      searchParams: new URLSearchParams(),
      env: { GITHUB_TOKEN: 'ghp_test_token' },
      ctx: null,
      sql: createMockSql((query) => {
        if (/FROM\s+workspace_watchlist/i.test(query)) return [];
        if (/FROM\s+folder_competitor_items/i.test(query)) return [{ metadata: { block_fleet: true } }];
        return [];
      }),
      workspaceId: 1,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: async () => {}
    });
    assert.equal(pausedLinkedRes.status, 409);
    assert.equal(pausedLinkedRes.payload.error, 'FOLDER_COMPETITORS_PAUSED');
  } finally {
    globalThis.fetch = prevFetch;
  }
});
