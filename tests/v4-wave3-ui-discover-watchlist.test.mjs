/**
 * tests/v4-wave3-ui-discover-watchlist.test.mjs
 *
 * Comprehensive offline verification for V4 Wave 3 — Phase 1:
 * 1. 5-Item Clean Sidebar + Workspace Switcher + zero duplicate cookie footer/modal + zero fake telemetry
 * 2. Canonical Routing (/radar, /discover, /campaigns, /watchlist, /settings + legacy aliases)
 * 3. Discover 50–100 Trends + all 8 filters + Related Interests checkboxes + Cluster Basket & Campaign Modal
 * 4. Watchlist 3 workspace-isolated tabs + Metrics Only <-> Metrics + Full Catalog toggle + instant client-side filters
 * 5. Full Creator Catalog Pull fix (BoardFeedResource primary + /_created/ merge, no early_stop=3 cap, no primaryDomain hiding, no Auto-Promote)
 * 6. Centralized Settings page + Write-Only Zone-A Cookie endpoint (never echoing raw cookie)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';
import { getRadarPageHtml } from '../src/ui/radar/index.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getWatchlistPageHtml } from '../src/ui/watchlist/index.mjs';
import { getSettingsPageHtml } from '../src/ui/settings/index.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { handlePagesRoutes } from '../src/routes/pages.mjs';
import {
  RESERVED_KEYWORD_SLUGS,
  resetPinterestCircuitBreaker,
  checkPinterestCircuitBreaker
} from '../src/http/security-and-response.mjs';
import { handleWorkspacesRoutes } from '../src/routes/workspaces.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { handleDomainsRoutes } from '../src/routes/domains.mjs';
import { handleNewbornRoutes } from '../src/routes/newborn.mjs';
import { refreshNewbornLaunchpadFeed } from '../src/modules/newborn/launchpad.mjs';
import { resolveNewbornRawCookie } from '../src/modules/newborn/settings.mjs';
import { getNewbornOverview } from '../src/modules/newborn/queries.mjs';
import { enqueueNewbornRun } from '../src/modules/newborn/run-queue.mjs';
import { runNewbornAutoCycle } from '../src/modules/newborn/orchestrator.mjs';
import { syncAllCompetitorBoardPins } from '../src/modules/creators/boards-service.mjs';
import { syncFullCreatorCatalog } from '../src/modules/creators/creator-harvest-and-archive.mjs';
import { DEFAULT_CREATOR_HUB_SETTINGS } from '../src/modules/creators/settings.mjs';

test('Wave 3 Pillar 1: Sidebar contains ONLY 5 clean V4 items + Workspace Switcher and zero cookie footer or fake status dot', () => {
  const html = renderAppSidebar({ activeNav: 'radar' });

  // Workspace Switcher retained
  assert.match(html, /paeWorkspaceSwitcher/, 'Workspace Switcher must remain in sidebar');

  // Exact 5 primary nav links inside <nav>
  const navMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
  assert.ok(navMatch, 'Sidebar must contain a <nav> element');
  const navHrefs = [...navMatch[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navHrefs, ['/radar', '/discover', '/campaigns', '/watchlist', '/settings']);

  assert.match(navMatch[1], />\s*Radar\s*</);
  assert.match(navMatch[1], />\s*Discover\s*</);
  assert.match(navMatch[1], />\s*Campaigns\s*</);
  assert.match(navMatch[1], />\s*Watchlist\s*</);
  assert.match(navMatch[1], />\s*Settings\s*</);

  // Zero duplicate cookie button/modal or fake System: Operational pulsing dot
  assert.doesNotMatch(html, /System:\s*Operational/i);
  assert.doesNotMatch(html, /openCookieModal/i);
  assert.doesNotMatch(html, /isCookieModalOpen/i);
});

test('Wave 3 Pillar 1: Canonical V4 page routes & legacy redirects render expected SSR views', async () => {
  const routesToCheck = [
    ['/', 'Workspace Radar'],
    ['/radar', 'Workspace Radar'],
    ['/pulse', 'Workspace Radar'],
    ['/discover', 'Discover — Pin Arbitrage V4'],
    ['/newborn', 'Discover — Pin Arbitrage V4'],
    ['/discovery', 'Discover — Pin Arbitrage V4'],
    ['/campaigns', 'Campaign'],
    ['/folders', 'Campaign'],
    ['/watchlist', 'Workspace Watchlist'],
    ['/settings', 'Workspace Settings']
  ];

  for (const [pathname, expectedText] of routesToCheck) {
    let statusCode = 200;
    let body = '';
    const reply = {
      sent: false,
      code(s) { statusCode = s; return this; },
      header() { return this; },
      send(payload) { body = String(payload || ''); this.sent = true; return this; }
    };
    await handlePagesRoutes({
      pathLower: pathname.toLowerCase(),
      normalizedPath: pathname,
      method: 'GET',
      searchParams: new URLSearchParams(),
      HTML_HEADERS: { 'Content-Type': 'text/html; charset=utf-8' },
      RESERVED_KEYWORD_SLUGS,
      methodNotAllowedResponse: () => reply.code(405).send('405'),
      jsonResponse: (d, s = 200) => reply.code(s).send(JSON.stringify(d)),
      isValidPinId: (id) => /^\d{6,30}$/.test(String(id || '')),
      reply,
      request: { headers: {} }
    });
    assert.equal(statusCode, 200, `Route ${pathname} should return HTTP 200`);
    assert.ok(body.includes(expectedText), `Route ${pathname} should include "${expectedText}"`);
  }
});

test('Wave 3 Pillar 2: Launchpad supports 50-100 Trends limit and forwards all 8 filters to surface-trends', async () => {
  let capturedArgs = null;
  const mockHarvest = async (_router, args) => {
    capturedArgs = args;
    return {
      ok: true,
      trends: Array.from({ length: 65 }, (_, i) => ({
        keyword: `trend keyword ${i + 1}`,
        normalized_volume: 100 - i,
        growth_weekly_pct: 25
      })),
      total_found: 65
    };
  };
  const mockZeroQuery = async () => ({
    popular_terms: ['fall recipes'],
    ideas_for_you_terms: ['cozy dinner'],
    used_guest_fallback: true
  });

  const res = await refreshNewbornLaunchpadFeed(null, {
    trendType: 'seasonal',
    l1Interest: 'food-and-drink',
    country: 'US',
    moments: 'christmas',
    age: '25-34',
    gender: 'female',
    includeTerms: 'easy',
    excludeTerms: 'keto',
    limit: 100,
    harvestTrendsFn: mockHarvest,
    harvestZeroQueryFn: mockZeroQuery
  });

  assert.equal(res.limit, 100);
  assert.equal(res.trends.length, 65);
  assert.ok(capturedArgs, 'harvestTrendsFn should have been called');
  assert.equal(capturedArgs.trendType, 'seasonal');
  assert.equal(capturedArgs.l1Interest, 'food-and-drink');
  assert.equal(capturedArgs.moments, 'christmas');
  assert.equal(capturedArgs.age, '25-34');
  assert.equal(capturedArgs.gender, 'female');
  assert.equal(capturedArgs.includeTerms, 'easy');
  assert.equal(capturedArgs.excludeTerms, 'keto');
  assert.equal(capturedArgs.limit, 100);
});

test('Wave 3 Pillar 2: Discover UI includes Related Interests checkboxes, 8 Trends filters, Cluster Basket bar, and Campaign modal', () => {
  const html = getNewbornPageHtml();

  assert.match(html, /Discover — Pin Arbitrage V4/);
  // All Trends filter controls & 50/75/100 limits
  assert.match(html, /launchpadMoments/);
  assert.match(html, /launchpadAge/);
  assert.match(html, /launchpadGender/);
  assert.match(html, /launchpadIncludeTerms/);
  assert.match(html, /launchpadExcludeTerms/);
  assert.match(html, /launchpadLimit/);
  assert.match(html, /value="100"/);

  // Related Interests checkboxes + Cluster Basket + Campaign Modal
  assert.match(html, /toggleBasketKeyword/);
  assert.match(html, /discover-cluster-basket-bar/);
  assert.match(html, /Cluster Basket/);
  assert.match(html, /Quick Newborn Hunt/);
  assert.match(html, /Create \/ Add to Campaign/);
  assert.match(html, /basket-campaign-modal-title/);
  assert.match(html, /Track Top N SERP Daily \(Pulse\)/);
  assert.match(html, /Run Newborn Deep Hunt/);

  // No duplicate Session Cookie pill/modal button on Discover header
  assert.doesNotMatch(html, /openCookieModal/i);
  assert.match(html, /href="\/settings#cookie"/);
});

test('Wave 3 Pillar 3: Watchlist page has 3 tabs, Metrics Only <-> Full Catalog toggle, manual Add forms, instant Saves >= 300 filter, and zero Auto-Promote', () => {
  const html = getWatchlistPageHtml();

  assert.match(html, /Workspace Watchlist/);
  assert.match(html, /\+ Add Creator/);
  assert.match(html, /\+ Add Domain/);
  assert.match(html, /Creators/);
  assert.match(html, /Domains/);
  assert.match(html, /Saved Pins/);
  assert.match(html, /Metrics \+ Full Catalog/);
  assert.match(html, /Metrics Only/);
  assert.match(html, /Sync Full Catalog/);
  assert.match(html, /Saves &gt;= 300/);
  assert.match(html, /pinFilterMinRepins/);
  assert.match(html, /pinFilterMaxAgeDays/);
  assert.doesNotMatch(html, /Auto-Promote/i);
});

test('Wave 3 Pillar 3: Full Creator Catalog Pull uses BoardFeedResource primary + /_created/ merge without early_stop=3 cap or Auto-Promote', () => {
  assert.equal(typeof syncAllCompetitorBoardPins, 'function');
  assert.equal(typeof syncFullCreatorCatalog, 'function');
  assert.equal(DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_enabled, false);

  const harvestSrc = fs.readFileSync(path.resolve('src/modules/creators/creator-harvest-and-archive.mjs'), 'utf8');
  assert.match(harvestSrc, /primary_source:\s*'board_feed_resource'/);
  assert.match(harvestSrc, /disableEarlyStop:\s*true/);
  assert.doesNotMatch(harvestSrc, /syncCompetitorPins\([^)]*mode:\s*'daily',\s*maxPages:\s*3/);

  const crawlerSrc = fs.readFileSync(path.resolve('scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert.match(crawlerSrc, /syncFullCreatorCatalog/);
  assert.doesNotMatch(crawlerSrc, /AUTO_PROMOTE_PULSE_DELTA_24H/);
  assert.doesNotMatch(crawlerSrc, /\[🚀 AUTO-PROMOTE\]/);

  const analyticsSrc = fs.readFileSync(path.resolve('src/modules/creators/creator-analytics.mjs'), 'utf8');
  assert.match(analyticsSrc, /restrictToPrimaryDomain = activeScope === 'domain_only'/);
});

test('Wave 3 Pillar 4: Settings page renders all centralized sections and /api/workspaces/cookie is strictly write-only', async () => {
  const html = getSettingsPageHtml();

  assert.match(html, /Workspace Settings/);
  assert.match(html, /Qualification Defaults/);
  assert.match(html, /Campaign &amp; Execution Defaults/);
  assert.match(html, /Extraction Paths &amp; Deep-Scroll Targets/);
  assert.match(html, /Pin Graph Auto-Triggers/);
  assert.match(html, /id="cookie"/);
  assert.match(html, /Session Cookie — Zone A \(Write-Only\)/);
  assert.match(html, /Rule Profiles/);

  // Test write-only POST /api/workspaces/cookie NEVER echoes raw secret cookie
  const secretCookie = '_pinterest_sess=SUPER_SECRET_WAVE3_TOKEN_9876543210; _auth=1';
  let storedInWorkspaceSettings = '';
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (/INSERT INTO workspace_settings/i.test(q)) {
      storedInWorkspaceSettings = String(values[1] || '');
      return [];
    }
    if (/SELECT \(pinterest_cookie_enc/i.test(q)) {
      return [{ has_cookie: Boolean(storedInWorkspaceSettings), updated_at: new Date().toISOString() }];
    }
    if (/UPDATE workspace_settings/i.test(q)) {
      storedInWorkspaceSettings = '';
      return [];
    }
    return [];
  };

  const headersSet = {};
  const mockReply = { header: (k, v) => { headersSet[k.toLowerCase()] = v; } };
  const jsonResponse = (payload, status = 200) => ({ status, payload });

  const postRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: secretCookie }) },
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });

  assert.equal(postRes.status, 200);
  assert.equal(postRes.payload.has_cookie, true);
  assert.equal(postRes.payload.preview, '[CONFIGURED]');
  assert.ok(String(headersSet['cache-control'] || '').includes('no-store'));
  assert.equal(JSON.stringify(postRes.payload).includes('SUPER_SECRET_WAVE3_TOKEN'), false, 'Raw cookie MUST NEVER be echoed');

  const getRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'GET',
    request: {},
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.payload.has_cookie, true);
  assert.equal(JSON.stringify(getRes.payload).includes('SUPER_SECRET_WAVE3_TOKEN'), false);

  const delRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'DELETE',
    request: {},
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.payload.has_cookie, false);
  assert.equal(storedInWorkspaceSettings, '');
});

test('Wave 3 Radar Page: Renders unified 24h Pulse + Creator Hub + Domain Radar with timeframe controls', () => {
  const html = getRadarPageHtml('pulse');
  assert.match(html, /Workspace Radar/);
  assert.match(html, /24h Pulse/);
  assert.match(html, /Creator Hub/);
  assert.match(html, /Domain Radar/);
  assert.match(html, /'24h', '5d', '7d', '10d', '15d'/);
});

test('Phase 1.5 BLOCKER-1, HIGH-4 & MEDIUM-2 regression: syncAllCompetitorBoardPins queries metadata (no is_collaborative column), honors maxBoards/AbortSignal/429 circuit breaker, and redacts secrets', async () => {
  resetPinterestCircuitBreaker();
  try {
    const dbBoards = [
      { board_id: 'b-1', name: 'Personal Board 1', url: '/alice/personal-1/', pin_count: 100, metadata: { is_collaborative: false } },
      { board_id: 'b-collab', name: 'Group Board', url: '/alice/group-board/', pin_count: 80, metadata: { is_collaborative: true } },
      { board_id: 'b-2', name: 'Personal Board 2', url: '/alice/personal-2/', pin_count: 60, metadata: { is_group_board: false } },
      { board_id: 'b-3', name: 'Personal Board 3', url: '/alice/personal-3/', pin_count: 40, metadata: {} }
    ];

    const strictSql = async (strings) => {
      const q = strings.join(' ');
      // Strict 001_baseline_schema.sql check: competitor_boards has NO is_collaborative column!
      if (/FROM\s+competitor_boards/i.test(q) && /\bis_collaborative\b/i.test(q)) {
        const err = new Error('column "is_collaborative" does not exist');
        err.code = '42703';
        throw err;
      }
      if (/SELECT\s+board_id,\s*name,\s*url,\s*pin_count,\s*metadata\s+FROM\s+competitor_boards/i.test(q)) {
        return dbBoards;
      }
      if (/FROM\s+competitor_profiles/i.test(q)) {
        return [{ id: 77, username: 'alice', metadata: { auto_archive_winning: false } }];
      }
      return [];
    };

    // 1. Verify personalBoardsOnly filters metadata.is_collaborative AND maxBoards caps boards cleanly
    const fetchedBoardIds = [];
    const cappedRes = await syncAllCompetitorBoardPins(strictSql, 77, 'alice', {
      syncBoardsFirst: false,
      personalBoardsOnly: true,
      maxBoards: 2,
      maxPagesPerBoard: 1,
      fetchBoardFeedFn: async (bid) => {
        fetchedBoardIds.push(bid);
        return { ok: true, pins: [], nextBookmark: '-end-' };
      }
    });

    assert.equal(cappedRes.boards_found, 3, 'Collaborative board in metadata must be filtered out');
    assert.equal(cappedRes.boards_crawled, 2, 'maxBoards=2 must cap crawled boards');
    assert.equal(cappedRes.truncated_by_budget, true);
    assert.equal(cappedRes.stopped_reason, 'max_boards');
    assert.deepEqual(fetchedBoardIds, ['b-1', 'b-2']);
    assert.equal(cappedRes.errors.length, 0);

    // 2. Verify AbortSignal stops crawl cleanly
    const ac = new AbortController();
    ac.abort();
    const abortedRes = await syncAllCompetitorBoardPins(strictSql, 77, 'alice', {
      syncBoardsFirst: false,
      signal: ac.signal,
      fetchBoardFeedFn: async () => {
        throw new Error('Should never fetch when already aborted');
      }
    });
    assert.equal(abortedRes.boards_crawled, 0);
    assert.equal(abortedRes.stopped_reason, 'aborted');
    assert.equal(abortedRes.truncated_by_budget, true);

    // 3. Verify HTTP 429 trips circuit breaker immediately, aborts remaining boards, and redacts secrets in errors[]
    let callsOn429 = 0;
    const rateLimitedRes = await syncAllCompetitorBoardPins(strictSql, 77, 'alice', {
      syncBoardsFirst: false,
      maxPagesPerBoard: 5,
      fetchBoardFeedFn: async () => {
        callsOn429++;
        return {
          ok: false,
          status: 429,
          error: 'HTTP 429 rate limit with _pinterest_sess=LEAKED_RAW_COOKIE_999999999999 and Bearer SUPER_SECRET_BEARER_TOKEN'
        };
      }
    });
    assert.equal(callsOn429, 1, 'Must bail out immediately on first 429 without looping over remaining boards');
    assert.equal(rateLimitedRes.stopped_reason, 'rate_limited');
    assert.equal(rateLimitedRes.truncated_by_budget, true);
    assert.ok(rateLimitedRes.errors.length >= 1);
    const serializedErrors = JSON.stringify(rateLimitedRes.errors);
    assert.equal(serializedErrors.includes('LEAKED_RAW_COOKIE_999999999999'), false, 'errors[] must redact _pinterest_sess');
    assert.equal(serializedErrors.includes('SUPER_SECRET_BEARER_TOKEN'), false, 'errors[] must redact Bearer tokens');

    const cb = await checkPinterestCircuitBreaker({});
    assert.equal(Boolean(cb?.active), true, '429 must trip the process-level Pinterest circuit breaker');

    // 4. Subsequent call immediately short-circuits while circuit breaker is open
    const shortCircuited = await syncAllCompetitorBoardPins(strictSql, 77, 'alice', {
      syncBoardsFirst: false,
      fetchBoardFeedFn: async () => {
        throw new Error('Must not fetch while circuit breaker is open');
      }
    });
    assert.equal(shortCircuited.stopped_reason, 'circuit_breaker_open');
    assert.equal(shortCircuited.boards_crawled, 0);
  } finally {
    resetPinterestCircuitBreaker();
  }
});

test('Phase 1.5 BLOCKER-5 regression: /api/workspaces/cookie and resolveNewbornRawCookie strictly isolate Workspace 1 and Workspace 2 cookies', async () => {
  const wsCookies = new Map();
  const appSettings = new Map();

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (/INSERT INTO workspace_settings.*pinterest_cookie_enc/is.test(q)) {
      wsCookies.set(Number(values[0]), String(values[1] || ''));
      return [];
    }
    if (/UPDATE workspace_settings\s+SET pinterest_cookie_enc = NULL/is.test(q)) {
      wsCookies.delete(Number(values[0]));
      return [];
    }
    if (/SELECT \(pinterest_cookie_enc IS NOT NULL/i.test(q)) {
      const wid = Number(values[0]);
      return [{ has_cookie: Boolean(wsCookies.get(wid)), updated_at: new Date().toISOString() }];
    }
    if (/SELECT pinterest_cookie_enc\s+FROM workspace_settings/is.test(q)) {
      const wid = Number(values[0]);
      const raw = wsCookies.get(wid);
      return raw ? [{ pinterest_cookie_enc: raw }] : [];
    }
    if (/INSERT INTO app_settings/i.test(q)) {
      const key = String(values[0]);
      appSettings.set(key, values[1]);
      return [];
    }
    if (/DELETE FROM app_settings/i.test(q)) {
      for (const v of values) appSettings.delete(String(v));
      appSettings.delete('newborn_pinterest_cookie');
      return [];
    }
    if (/FROM app_settings/i.test(q)) {
      const out = [];
      for (const [k, v] of appSettings.entries()) {
        out.push({ key: k, value: typeof v === 'string' ? JSON.parse(v) : v });
      }
      return out;
    }
    return [];
  };

  const mockReply = { header: () => {} };
  const jsonResponse = (payload, status = 200) => ({ status, payload });
  const ws1Secret = '_pinterest_sess=WS1_GLOBAL_COOKIE_ALPHA_1111111111; _auth=1';
  const ws2Secret = '_pinterest_sess=WS2_PRIVATE_COOKIE_BETA_2222222222; _auth=1';

  // 1. Save cookie in Workspace 1 -> updates WS1 + global newborn_pinterest_cookie
  const postWs1 = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: ws1Secret }) },
    reply: mockReply,
    sql: mockSql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(postWs1.status, 200);
  assert.equal(wsCookies.get(1), ws1Secret);
  assert.ok(appSettings.has('newborn_pinterest_cookie'), 'Workspace 1 should mirror to global newborn_pinterest_cookie');

  // 2. GET in Workspace 2 MUST NOT leak Workspace 1's global cookie
  const getWs2Empty = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'GET',
    request: {},
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(getWs2Empty.payload.has_cookie, false, 'Empty Workspace 2 MUST report has_cookie: false');

  const resolvedWs2Empty = await resolveNewbornRawCookie(mockSql, {}, { workspaceId: 2 });
  assert.equal(resolvedWs2Empty.rawCookie, '', 'resolveNewbornRawCookie(ws=2) MUST NOT inherit WS1 global cookie');

  // 3. POST in Workspace 2 MUST NOT overwrite Workspace 1's global cookie
  const postWs2 = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: ws2Secret }) },
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(postWs2.status, 200);
  assert.equal(wsCookies.get(2), ws2Secret);
  assert.equal(wsCookies.get(1), ws1Secret);
  assert.equal(JSON.stringify(appSettings.get('newborn_pinterest_cookie')).includes('WS1_GLOBAL_COOKIE_ALPHA'), true);

  const resolvedWs2 = await resolveNewbornRawCookie(mockSql, {}, { workspaceId: 2 });
  assert.equal(resolvedWs2.rawCookie, ws2Secret);

  // 4. DELETE in Workspace 2 MUST NOT wipe Workspace 1's global cookie
  const delWs2 = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/cookie',
    method: 'DELETE',
    request: {},
    reply: mockReply,
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });
  assert.equal(delWs2.status, 200);
  assert.equal(wsCookies.has(2), false);
  assert.equal(wsCookies.get(1), ws1Secret, 'Deleting WS2 cookie MUST NOT wipe WS1 cookie');
  assert.ok(appSettings.has('newborn_pinterest_cookie'), 'Deleting WS2 cookie MUST NOT wipe global newborn_pinterest_cookie');
});

test('Phase 1.5 BLOCKER-4 regression: /api/workspaces/settings enforces Migration 012 nested JSONB keys and strips dead flat keys', async () => {
  let savedRow = null;
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (/SELECT[\s\S]*FROM workspace_settings/i.test(q)) {
      return savedRow ? [savedRow] : [];
    }
    if (/INSERT INTO workspace_settings/i.test(q)) {
      savedRow = {
        workspace_id: values[0],
        max_pin_age_days: values[1],
        min_repin_count: values[2],
        min_save_count: values[3],
        default_serp_top_n: values[4],
        execution_mode: values[5],
        extraction_targets: JSON.parse(values[6]),
        pin_graph_rules: JSON.parse(values[7]),
        rule_profiles: JSON.parse(values[8]),
        has_cookie: false,
        updated_at: new Date().toISOString()
      };
      return [savedRow];
    }
    return [];
  };

  const jsonResponse = (payload, status = 200) => ({ status, payload });
  const patchRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/settings',
    method: 'PATCH',
    request: {
      json: async () => ({
        max_pin_age_days: 14,
        default_serp_top_n: 35,
        extraction_targets: {
          search: { enabled: true, target_pins: 650 },
          boards: { max_boards: 15, target_pins_per_board: 150 },
          search_pages: 999 // dead flat key must be stripped
        },
        pin_graph_rules: {
          auto_trigger_enabled: true,
          min_repins: 750,
          linkless_only: true,
          max_pages: 25,
          enabled: false // dead flat key must be stripped
        }
      })
    },
    reply: { header: () => {} },
    sql: mockSql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 })
  });

  assert.equal(patchRes.status, 200);
  const s = patchRes.payload.settings;
  assert.equal(s.extraction_targets.search.enabled, true);
  assert.equal(s.extraction_targets.search.target_pins, 650);
  assert.equal(s.extraction_targets.boards.enabled, true, 'Missing nested enabled flag must preserve default true');
  assert.equal(s.extraction_targets.boards.max_boards, 15);
  assert.equal(s.extraction_targets.boards.target_pins_per_board, 150);
  assert.equal('search_pages' in s.extraction_targets, false, 'Dead flat keys must NOT pollute JSONB');
  assert.equal(s.pin_graph_rules.auto_trigger_enabled, true);
  assert.equal('enabled' in s.pin_graph_rules, false, 'Dead flat pin_graph_rules.enabled must NOT pollute JSONB');

  // Verify settings UI template & client controller bind strictly to nested Migration 012 keys
  const settingsHtml = getSettingsPageHtml();
  assert.match(settingsHtml, /form\.extraction_targets\.search\.target_pins/);
  assert.match(settingsHtml, /form\.extraction_targets\.boards\.max_boards/);
  assert.match(settingsHtml, /form\.extraction_targets\.boards\.target_pins_per_board/);
  assert.match(settingsHtml, /form\.pin_graph_rules\.auto_trigger_enabled/);
  assert.doesNotMatch(settingsHtml, /form\.extraction_targets\.search_pages/);
  assert.doesNotMatch(settingsHtml, /form\.pin_graph_rules\.enabled\b/);
});

test('Phase 1.5 BLOCKER-2, BLOCKER-3, HIGH-2, HIGH-3, HIGH-5, MEDIUM-1/3/4 & NIT-1 regression: Client contracts & workspace scoping align cleanly', async () => {
  // 1. Discover Cluster Basket -> Send to Campaign contract
  const newbornClientSrc = fs.readFileSync(path.resolve('src/ui/newborn/newborn-client-app.mjs'), 'utf8');
  assert.match(newbornClientSrc, /body:\s*JSON\.stringify\(\{\s*keywords\s*\}\)/);
  assert.match(newbornClientSrc, /\/tracked-pins\/sync-top-n/);
  assert.doesNotMatch(newbornClientSrc, /item_type:\s*'keyword'/);

  // 2. Radar client contract (/api/pulse/24h?window=, breakout_pins, kpis, creator_tracking_mode, workspace_scope=1, no display_name)
  const radarClientSrc = fs.readFileSync(path.resolve('src/ui/radar/radar-client-app.mjs'), 'utf8');
  assert.match(radarClientSrc, /\/api\/pulse\/24h\?window=/);
  assert.match(radarClientSrc, /data\.breakout_pins/);
  assert.match(radarClientSrc, /data\.kpis/);
  assert.match(radarClientSrc, /creator_tracking_mode/);
  assert.match(radarClientSrc, /workspace_scope=1/);
  assert.doesNotMatch(radarClientSrc, /\/api\/pulse\?timeframe=/);
  assert.doesNotMatch(radarClientSrc, /display_name:/);

  // 3. Watchlist & Settings client contracts (all-pins, toggleSidebar, pae_sidebar_collapsed, pa_theme, apiFetch, plural ?tab=)
  const watchlistClientSrc = fs.readFileSync(path.resolve('src/ui/watchlist/watchlist-client-app.mjs'), 'utf8');
  assert.match(watchlistClientSrc, /\/api\/creators\/all-pins\?username=/);
  assert.match(watchlistClientSrc, /toggleSidebar\(\)/);
  assert.match(watchlistClientSrc, /pae_sidebar_collapsed/);
  assert.match(watchlistClientSrc, /'pa_theme'/);
  assert.match(watchlistClientSrc, /window\.apiFetch/);
  assert.match(watchlistClientSrc, /await this\._reqFetch\('\/api\/creators'/);
  assert.doesNotMatch(watchlistClientSrc, /toggleSidebarCollapse\(/);
  assert.doesNotMatch(watchlistClientSrc, /localStorage\.setItem\('theme'/);

  const settingsClientSrc = fs.readFileSync(path.resolve('src/ui/settings/settings-client-app.mjs'), 'utf8');
  assert.match(settingsClientSrc, /toggleSidebar\(\)/);
  assert.match(settingsClientSrc, /pae_sidebar_collapsed/);
  assert.match(settingsClientSrc, /'pa_theme'/);
  assert.match(settingsClientSrc, /window\.apiFetch/);
  assert.doesNotMatch(settingsClientSrc, /toggleSidebarCollapse\(/);
  assert.doesNotMatch(settingsClientSrc, /localStorage\.setItem\('theme'/);

  // Plural ?tab= normalization on /watchlist
  assert.match(getWatchlistPageHtml('domains'), /"initialTab":"domain"/);
  assert.match(getWatchlistPageHtml('pins'), /"initialTab":"pin"/);
  assert.match(getWatchlistPageHtml('creators'), /"initialTab":"creator"/);

  // 4. GET /api/creators and GET /api/domains enforce workspaceId isolation for non-default workspaces
  const mockScopedSql = async (strings) => {
    const q = strings.join(' ');
    if (/COUNT\(\*\)::int AS total_profiles/i.test(q)) {
      return [{ total_profiles: 2, active_count: 2, paused_count: 0, total_audience: 1000, total_impressions: 2000, combined_reach: 1000, total_pins_tracked: 500 }];
    }
    if (/FROM competitor_profiles/i.test(q)) {
      return [
        { id: 1, username: 'ws1_creator', monthly_reach: 600, profile_views: 1200, total_pins: 300, is_active: true },
        { id: 2, username: 'ws2_creator', monthly_reach: 400, profile_views: 800, total_pins: 200, is_active: true }
      ];
    }
    if (/FROM workspace_watchlist/i.test(q)) {
      return [{ handle: 'ws2_creator', dom: 'ws2-only.com' }];
    }
    if (/FROM domain_intelligence_rollup/i.test(q)) {
      return [
        { domain: 'ws1-only.com', total_pins: 50, total_saves: 1000, avg_velocity: 10, total_count: 2 },
        { domain: 'ws2-only.com', total_pins: 25, total_saves: 500, avg_velocity: 5, total_count: 2 }
      ];
    }
    return [];
  };

  const creatorsWs2 = await handleCreatorsRoutes({
    pathname: '/api/creators',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=20'),
    env: {},
    ctx: {},
    sql: mockScopedSql,
    workspaceId: 2,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (ns, p) => `ws:2:${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    tripPinterestCircuitBreaker: () => {}
  });
  assert.equal(creatorsWs2.status, 200);
  assert.equal(creatorsWs2.payload.workspace_scoped, true);
  assert.deepEqual(creatorsWs2.payload.competitors.map((c) => c.username), ['ws2_creator']);

  const domainsWs2 = await handleDomainsRoutes({
    pathname: '/api/domains',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=20'),
    env: {},
    ctx: {},
    sql: mockScopedSql,
    workspaceId: 2,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (ns, p) => `ws:2:${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    redactSecrets: (s) => s
  });
  assert.equal(domainsWs2.status, 200);
  assert.equal(domainsWs2.payload.workspace_scoped, true);
  assert.deepEqual(domainsWs2.payload.domains.map((d) => d.domain), ['ws2-only.com']);
});

test('Phase 1.5 HIGH-1 regression: SSR HTML byte budgets strictly pass (/discover < 225 KB, /campaigns < 215 KB)', () => {
  const discoverHtml = getNewbornPageHtml();
  const folderDiscoverHtml = getNewbornPageHtml('42');
  const discoverBytes = Buffer.byteLength(discoverHtml, 'utf8');
  const folderDiscoverBytes = Buffer.byteLength(folderDiscoverHtml, 'utf8');
  const campaignsBytes = Buffer.byteLength(getCampaignFoldersPageHtml(), 'utf8');

  assert.ok(discoverBytes < 225 * 1024, `/discover HTML (${discoverBytes} bytes) must be < 225 KB (230400 bytes)`);
  assert.ok(folderDiscoverBytes < 225 * 1024, `/folders/42/newborn HTML (${folderDiscoverBytes} bytes) must be < 225 KB (230400 bytes)`);
  assert.ok(campaignsBytes < 215 * 1024, `/campaigns HTML (${campaignsBytes} bytes) must be < 215 KB (220160 bytes)`);

  // Phase 1.5b UI Micro-Cleanup: /discover renders ONLY the 3 clean tabs without legacy Tracked / Watchlist panel
  assert.ok(discoverHtml.includes('This Hunt'));
  assert.ok(discoverHtml.includes('Cluster Explorer'));
  assert.ok(discoverHtml.includes('Past Hunts'));
  assert.equal(discoverHtml.includes('Tracked / Watchlist'), false, 'Legacy Tracked / Watchlist tab must be removed from /discover');
  assert.equal(discoverHtml.includes('01:00 UTC Daily Anchors'), false, 'Legacy 01:00 UTC Daily Anchors panel must be removed from /discover');
  assert.equal(discoverHtml.includes('Poll Watchlist Now'), false, 'Legacy Poll Watchlist Now button must be removed from /discover');
  assert.equal(discoverHtml.includes('Tracked Daily:'), false, 'Legacy Tracked Daily KPI must be removed from /discover');
});

test('Phase 1.5b regression: getNewbornOverview, enqueueNewbornRun, runNewbornAutoCycle & legacy /api/newborn/cookie isolate Workspace 2 from Workspace 1 global cookie', async () => {
  const wsCookies = new Map([[1, '_pinterest_sess=WS1_GLOBAL_ONLY_SECRET_1111111111; _auth=1']]);
  const appSettings = new Map([
    ['newborn_pinterest_cookie', JSON.stringify({ cookie: '_pinterest_sess=WS1_GLOBAL_ONLY_SECRET_1111111111; _auth=1', has_cookie: true })]
  ]);
  const queriedWorkspaceCookieIds = [];
  let appSettingsCookieQueriedDuringWs2Run = false;
  let insideWs2BackgroundRun = false;

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (/INSERT INTO workspace_settings.*pinterest_cookie_enc/is.test(q)) {
      wsCookies.set(Number(values[0]), String(values[1] || ''));
      return [];
    }
    if (/UPDATE workspace_settings\s+SET pinterest_cookie_enc = NULL/is.test(q)) {
      wsCookies.delete(Number(values[0]));
      return [];
    }
    if (/SELECT pinterest_cookie_enc\s+FROM workspace_settings/is.test(q)) {
      const wid = Number(values[0]);
      queriedWorkspaceCookieIds.push(wid);
      const raw = wsCookies.get(wid);
      return raw ? [{ pinterest_cookie_enc: raw }] : [];
    }
    if (/INSERT INTO app_settings/i.test(q)) {
      appSettings.set(String(values[0]), values[1]);
      return [];
    }
    if (/DELETE FROM app_settings/i.test(q)) {
      appSettings.delete('newborn_pinterest_cookie');
      return [];
    }
    if (/FROM app_settings/i.test(q)) {
      if (insideWs2BackgroundRun && /newborn_pinterest_cookie|pinterest_cookie/i.test(q)) {
        appSettingsCookieQueriedDuringWs2Run = true;
      }
      const out = [];
      for (const [k, v] of appSettings.entries()) {
        out.push({ key: k, value: typeof v === 'string' ? JSON.parse(v) : v });
      }
      return out;
    }
    if (/INSERT INTO newborn_runs/i.test(q)) {
      return [{ id: 901, status: 'running', workspace_id: 2, started_at: new Date().toISOString() }];
    }
    if (/FROM newborn_candidates/i.test(q)) {
      if (/COUNT\(\*\)/i.test(q)) {
        return [{ total_candidates: 0, discovered_count: 0, watchlist_count: 0, promoted_count: 0, discarded_count: 0, golden_pins_count: 0, linkless_vacuum_count: 0, rookie_outliers_count: 0, avg_golden_score: 0 }];
      }
      return [];
    }
    return [];
  };

  // 1. getNewbornOverview with workspaceId = 2 MUST report has_cookie: false despite WS1 global cookie
  const overviewWs2 = await getNewbornOverview(mockSql, {}, { workspaceId: 2 });
  assert.equal(overviewWs2.cookie_status.has_cookie, false, 'getNewbornOverview(ws=2) must NOT leak WS1 global cookie');

  // 2. enqueueNewbornRun(ws=2) & runNewbornAutoCycle(ws=2) must forward workspaceId=2 and NOT fall back to WS1 app_settings cookie
  const bgPromises = [];
  const fakeCtx = { waitUntil: (p) => { bgPromises.push(Promise.resolve(typeof p === 'function' ? p() : p)); } };
  const fakeFetch = async () => new Response(JSON.stringify({ resource_response: { data: [] } }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

  queriedWorkspaceCookieIds.length = 0;
  insideWs2BackgroundRun = true;
  await enqueueNewbornRun(mockSql, {
    runType: 'watchlist_poll',
    workspaceId: 2,
    routerOptions: { fetchImpl: fakeFetch },
    env: {},
    ctx: fakeCtx
  });
  await Promise.allSettled(bgPromises);

  await runNewbornAutoCycle(mockSql, {
    forceWatchlist: true,
    forceDiscovery: false,
    workspaceId: 2,
    routerOptions: { fetchImpl: fakeFetch },
    env: {}
  });
  insideWs2BackgroundRun = false;

  assert.ok(queriedWorkspaceCookieIds.includes(2), 'enqueueNewbornRun & runNewbornAutoCycle must resolve cookie for workspace_id = 2');
  assert.equal(appSettingsCookieQueriedDuringWs2Run, false, 'Workspace 2 background runs must NEVER fall back to WS1 global app_settings cookie');

  // 3. Legacy POST/DELETE /api/newborn/cookie from workspaceId = 2 must NOT overwrite or wipe WS1 global cookie
  const ws2Secret = '_pinterest_sess=WS2_LEGACY_ROUTE_COOKIE_22222222; _auth=1';
  const jsonResponse = (payload, status = 200) => ({ status, payload });
  const postLegacyWs2 = await handleNewbornRoutes({
    pathname: '/api/newborn/cookie',
    method: 'POST',
    request: { json: async () => ({ cookie: ws2Secret }) },
    reply: { header: () => {} },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 }),
    invalidateEdgeCache: async () => {}
  });
  assert.equal(postLegacyWs2.status, 200);
  assert.equal(wsCookies.get(2), ws2Secret);
  assert.equal(JSON.stringify(appSettings.get('newborn_pinterest_cookie')).includes('WS1_GLOBAL_ONLY_SECRET_1111111111'), true, 'POST /api/newborn/cookie from WS2 must NOT overwrite WS1 global cookie');

  const delLegacyWs2 = await handleNewbornRoutes({
    pathname: '/api/newborn/cookie',
    method: 'DELETE',
    request: {},
    reply: { header: () => {} },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse: () => ({ status: 405 }),
    invalidateEdgeCache: async () => {}
  });
  assert.equal(delLegacyWs2.status, 200);
  assert.equal(wsCookies.has(2), false);
  assert.equal(appSettings.has('newborn_pinterest_cookie'), true, 'DELETE /api/newborn/cookie from WS2 must NOT wipe WS1 global cookie');
});

test('Phase 1.5b regression: GET /api/domains?limit=60&workspace_scope=1 returns a workspace-watchlisted domain ranked below #60 globally', async () => {
  const all100Domains = Array.from({ length: 100 }, (_, idx) => ({
    domain: idx === 84 ? 'ws2-ranked-85.com' : `global-rank-${idx + 1}.com`,
    total_pins: 1000 - idx,
    total_saves: (1000 - idx) * 10,
    avg_velocity: 10,
    total_count: 100
  }));

  let capturedLimit = 0;
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (/FROM workspace_watchlist/i.test(q)) {
      return [{ dom: 'ws2-ranked-85.com' }];
    }
    if (/FROM domain_intelligence_rollup/i.test(q)) {
      // Final LIMIT value is bound near the end of buildModularFilterAndSortSql
      const numericLimits = values.filter((v) => typeof v === 'number' && v >= 50);
      capturedLimit = numericLimits.length > 0 ? Math.max(...numericLimits) : 60;
      return all100Domains.slice(0, capturedLimit);
    }
    return [];
  };

  const res = await handleDomainsRoutes({
    pathname: '/api/domains',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=60&workspace_scope=1'),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 2,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (ns, p) => `ws:2:${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    redactSecrets: (s) => s
  });

  assert.equal(res.status, 200);
  assert.ok(capturedLimit >= 500, `Expected expanded internal domain query limit >= 500, got ${capturedLimit}`);
  assert.deepEqual(res.payload.domains.map((d) => d.domain), ['ws2-ranked-85.com']);
  assert.equal(res.payload.total_domains, 1);
});
