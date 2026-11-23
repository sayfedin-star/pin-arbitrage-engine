/**
 * tests/v4-pre-wave5-stabilization.test.mjs
 *
 * Pre-Wave 5 Stabilization & UX Cleanup (V4 Polish Patch) regression suite:
 *  1. Workspace Radar (`/radar`) field-name bindings, billions formatting, window_saves_gain, KPIs
 *  2. `folder_id` scope isolation in Newborn backend queries & client-side API calls
 *  3. `workspace_settings` SSOT hydration on backend harvester & Discover client controls
 *  4. Launchpad unified 100-item cache slicing (`50 / 75 / 100`) & `cache_insufficient` auto-refresh
 *  5. HTML byte budgets, Lock 1 preservation, Discover collapsible hunt settings,
 *     Campaign Workspace de-duplication, Room 5 inheritance, and Watchlist Radar opt-in import
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { getRadarPageHtml } from '../src/ui/radar/index.mjs';
import { getRadarClientAppScript } from '../src/ui/radar/radar-client-app.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getWatchlistPageHtml } from '../src/ui/watchlist/index.mjs';
import { getWatchlistClientAppJs } from '../src/ui/watchlist/watchlist-client-app.mjs';

import {
  getNewbornOverview,
  getNewbornCrossoverReport,
  listNewbornDailyAnchors,
  listNewbornCandidates
} from '../src/modules/newborn/queries.mjs';
import { applyWorkspaceExtractionTargetsToSettings } from '../src/modules/newborn/harvester.mjs';
import {
  getNewbornLaunchpadFeed,
  refreshNewbornLaunchpadFeed
} from '../src/modules/newborn/launchpad.mjs';
import { DEFAULT_NEWBORN_SETTINGS } from '../src/modules/newborn/settings.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { handleDomainsRoutes } from '../src/routes/domains.mjs';
import { handleWatchlistRoutes } from '../src/routes/watchlist.mjs';
import { handleNewbornRoutes } from '../src/routes/newborn.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import {
  BYTE_BUDGETS,
  DEAD_SYMBOLS,
  shaMatches,
  evaluateHtmlBudgetsAndSymbols,
  evaluatePulsePayload,
  evaluateCreatorsPayload,
  evaluateDomainsPayload,
  evaluateWorkspaceSettingsPayload,
  evaluateCookieWriteOnlyPayload,
  formatMarkdownSummary
} from '../scripts/verify-live-readonly.mjs';

function extractScriptBody(scriptTagHtml) {
  return String(scriptTagHtml || '')
    .replace(/^\s*<script[^>]*>/i, '')
    .replace(/<\/script>\s*$/i, '');
}

function evalFactory(scriptTagHtml, fnName, extraGlobals = {}) {
  const ctx = {
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    window: {
      localStorage: { getItem: () => null, setItem: () => {} },
      location: { search: '', pathname: '/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      PAE: { toast: () => {} }
    },
    document: { documentElement: { classList: { toggle: () => {}, contains: () => false } } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    ...extraGlobals
  };
  vm.createContext(ctx);
  vm.runInContext(extractScriptBody(scriptTagHtml), ctx);
  const fn = ctx[fnName] || ctx.window?.[fnName];
  assert.equal(typeof fn, 'function', `Expected global function ${fnName}`);
  return fn;
}

// ============================================================================
// 1. Workspace Radar (`/radar`) Field Bindings, Billions & Timeframe Gains
// ============================================================================

test('P0-1: Radar HTML binds real backend fields and client formats billions + window_saves_gain', async () => {
  const html = getRadarPageHtml();
  assert.ok(html.includes('pin.save_count ?? pin.repin_count ?? pin.saves ?? 0'), 'Pulse SAVES column should read pin.save_count');
  assert.ok(html.includes('pin.keyword_text || pin.keyword || pin.pin_id'), 'Pulse keyword subtitle should read pin.keyword_text');
  assert.ok(html.includes('creator.monthly_reach ?? creator.total_audience'), 'Creator AUDIENCE should read monthly_reach');
  assert.ok(html.includes('creator.profile_views ?? creator.monthly_views'), 'Creator MONTHLY VIEWS should read profile_views');
  assert.ok(html.includes('dom.avg_velocity ?? dom.gain_24h ?? dom.saves_gain_24h'), 'Domain 24H GAIN should read avg_velocity');

  const radarFactory = evalFactory(getRadarClientAppScript(), 'radarApp', {
    fetch: async (url) => {
      const u = String(url);
      if (u.includes('/api/pulse/24h')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kpis: {
              total_active_serp_pins: 4120,
              total_24h_saves_velocity: 98500,
              pins_gaining_24h_count: 890
            },
            breakout_pins: [{ pin_id: '101', save_count: 4500, saves_gain_24h: 150, window_saves_gain: 1840 }]
          })
        };
      }
      if (u.includes('/api/creators')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            overview: {
              tracked_profiles: 60,
              total_scoped_creators: 60,
              total_audience: 629300000,
              total_impressions: 120000000,
              avg_monthly_views: 2000000,
              pins_tracked: 2727546001
            },
            creators: [{ username: 'chef_a', monthly_reach: 5000000, profile_views: 2000000 }]
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const app = radarFactory();

  // formatCompact billions support via fmtNum
  assert.equal(app.fmtNum(2727546001), '2.7B');
  assert.equal(app.fmtNum(629300000), '629.3M');
  assert.equal(app.fmtNum(1300), '1.3K');
  assert.equal(app.fmtNum(42), '42');

  // pinGain uses window_saves_gain when timeframe !== '24h'
  const pin = { saves_gain_24h: 150, window_saves_gain: 1840, gain_7d: 999 };
  app.timeframe = '24h';
  assert.equal(app.pinGain(pin), 150);
  app.timeframe = '7d';
  assert.equal(app.pinGain(pin), 1840);
  app.timeframe = '15d';
  assert.equal(app.pinGain(pin), 1840);

  // Pulse KPI keys from assemblePulsePayload
  app.timeframe = '24h';
  await app.loadPulse();
  assert.equal(app.pulseSummary.total_pins, 4120);
  assert.equal(app.pulseSummary.total_gain, 98500);
  assert.equal(app.pulseSummary.hot_pins, 890);

  // Creator KPIs compute true average monthly views & billions catalog pins
  await app.loadCreators();
  assert.equal(app.creatorsSummary.tracked_profiles, 60);
  assert.equal(app.creatorsSummary.avg_monthly_views, 2000000);
  assert.equal(app.fmtNum(app.creatorsSummary.total_pins), '2.7B');
});

// ============================================================================
// 2. Campaign `folder_id` Isolation (Backend Queries + Client Wiring)
// ============================================================================

test('P0-2: getNewbornOverview, getNewbornCrossoverReport, and listNewbornDailyAnchors filter by folder_id', async () => {
  const capturedQueries = [];
  const mockSql = (strings, ...values) => {
    const queryText = strings.join(' ? ');
    capturedQueries.push({ queryText, values });
    if (queryText.includes('FROM app_settings')) return Promise.resolve([]);
    if (queryText.includes('FROM newborn_daily_anchors nda')) {
      return Promise.resolve([{ pin_id: '111111111111', folder_id: 5, is_active: true }]);
    }
    if (queryText.includes('FROM newborn_candidates') && queryText.includes('visual_annotations')) {
      return Promise.resolve([
        { pin_id: '111111111111', repin_count: 100, golden_score: 88, visual_annotations: ['High Protein'] }
      ]);
    }
    if (queryText.includes('COUNT(*)::int AS total_candidates')) {
      return Promise.resolve([{ total_candidates: 7, golden_pins_count: 3, active_daily_anchors_count: 2 }]);
    }
    return Promise.resolve([]);
  };

  const ov = await getNewbornOverview(mockSql, {}, { workspaceId: 1, folderId: 5 });
  assert.equal(ov.folder_id, 5);
  assert.equal(ov.counts.total_candidates, 7);

  const runQuery = capturedQueries.find((q) => q.queryText.includes('FROM newborn_runs'));
  assert.ok(runQuery && runQuery.queryText.includes('folder_id ='), 'newborn_runs query must filter by folder_id');
  assert.ok(runQuery.values.includes(5), 'newborn_runs query must bind folderId=5');

  const statsQuery = capturedQueries.find((q) => q.queryText.includes('AS total_candidates'));
  assert.ok(statsQuery && statsQuery.queryText.includes('WHERE folder_id ='), 'newborn_candidates stats must filter by folder_id');
  assert.ok(statsQuery.queryText.includes('newborn_daily_anchors WHERE is_active = TRUE AND folder_id ='), 'active_daily_anchors_count must filter by folder_id');

  const cross = await getNewbornCrossoverReport(mockSql, { folderId: 5, limit: 15 });
  assert.equal(cross.folder_id, 5);
  const crossQuery = capturedQueries.find((q) => q.queryText.includes('visual_annotations'));
  assert.ok(crossQuery && crossQuery.queryText.includes('folder_id ='), 'crossover query must filter by folder_id');
  assert.ok(crossQuery.values.includes(5), 'crossover query must bind folderId=5');

  const anchors = await listNewbornDailyAnchors(mockSql, { activeOnly: true, folderId: 5, limit: 50 });
  assert.equal(anchors.length, 1);
  const anchorsQuery = capturedQueries.find((q) => q.queryText.includes('FROM newborn_daily_anchors nda'));
  assert.ok(anchorsQuery && anchorsQuery.queryText.includes('nda.folder_id ='), 'anchors query must filter by nda.folder_id');
  assert.ok(anchorsQuery.values.includes(5), 'anchors query must bind folderId=5');
});

test('P0-2: newbornStudioApp propagates folder_id to overview, crossover, clusters, watchlist, and anchors', async () => {
  const fetchedUrls = [];
  const newbornFactory = evalFactory(getNewbornClientAppScript(), 'newbornStudioApp', {
    fetch: async (url) => {
      fetchedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ runs: [], clusters: [], candidates: [], anchors: [], settings: {} })
      };
    }
  });

  const studio = newbornFactory('5', 'hunt');
  await studio.loadOverviewAndRuns();
  await studio.loadCrossoverForActiveHunt();
  await studio.loadRecentClusters();
  await studio.loadWatchlist();
  await studio.loadDailyAnchors();

  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/overview?folder_id=5')), 'overview must pass folder_id=5');
  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/runs?') && u.includes('folder_id=5')), 'runs must pass folder_id=5');
  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/crossover?') && u.includes('folder_id=5')), 'crossover must pass folder_id=5');
  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/clusters?') && u.includes('folder_id=5')), 'clusters must pass folder_id=5');
  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/candidates?stage=watchlist') && u.includes('folder_id=5')), 'watchlist must pass folder_id=5');
  assert.ok(fetchedUrls.some((u) => u.includes('/api/newborn/anchors?') && u.includes('folder_id=5')), 'anchors must pass folder_id=5');
});

// ============================================================================
// 3. `workspace_settings` SSOT Hydration (Backend + Discover Client)
// ============================================================================

test('P0-3: applyWorkspaceExtractionTargetsToSettings applies qualification defaults while respecting overrides', () => {
  const settings = structuredClone(DEFAULT_NEWBORN_SETTINGS);
  const wsSettings = {
    max_pin_age_days: 14,
    min_repin_count: 75,
    min_save_count: 15,
    extraction_targets: {
      search: { enabled: true, target_pins: 800 },
      boards: { enabled: true, max_boards: 12, target_pins_per_board: 150 },
      idea_page: { enabled: true, target_pins: 400 },
      home_feed: { enabled: false, target_pins: 300 },
      related_pins: { enabled: false, target_pins: 250 }
    }
  };

  // Without explicit overrides -> all workspace settings apply
  applyWorkspaceExtractionTargetsToSettings(settings, wsSettings, null);
  assert.equal(settings.qualification.max_age_days, 14);
  assert.equal(settings.qualification.min_repin_count, 75);
  assert.equal(settings.qualification.min_save_count, 15);
  assert.equal(settings.discovery.surfaces.pin_serp_capsules.target_pins, 800);
  assert.equal(settings.discovery.surfaces.fresh_boards.target_pins_per_board, 150);

  // With explicit override on max_age_days & min_repin_count -> override wins
  const settings2 = structuredClone(DEFAULT_NEWBORN_SETTINGS);
  settings2.qualification.max_age_days = 7;
  settings2.qualification.min_repin_count = 500;
  applyWorkspaceExtractionTargetsToSettings(settings2, wsSettings, {
    qualification: { max_age_days: 7, min_repin_count: 500 }
  });
  assert.equal(settings2.qualification.max_age_days, 7, 'explicit max_age_days override must be preserved');
  assert.equal(settings2.qualification.min_repin_count, 500, 'explicit min_repin_count override must be preserved');
  assert.equal(settings2.qualification.min_save_count, 15, 'non-overridden min_save_count should inherit from workspace_settings');
});

test('P0-3 & P1-1: Discover hydrates from /api/workspaces/settings, starts collapsed, detects & resets overrides', async () => {
  const newbornFactory = evalFactory(getNewbornClientAppScript(), 'newbornStudioApp', {
    fetch: async (url) => {
      const u = String(url);
      if (u.includes('/api/workspaces/settings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            settings: {
              max_pin_age_days: 14,
              min_repin_count: 80,
              min_save_count: 10,
              execution_mode: 'fleet',
              extraction_targets: {
                search: { enabled: true, target_pins: 700 },
                boards: { enabled: true, max_boards: 6, target_pins_per_board: 120 },
                idea_page: { enabled: true, target_pins: 300 }
              }
            }
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ settings: structuredClone(DEFAULT_NEWBORN_SETTINGS) })
      };
    }
  });

  const studio = newbornFactory('', 'hunt');
  assert.equal(studio.huntOptionsExpanded, false, 'Hunt settings panel must be collapsed by default');

  await studio.loadSettingsAndProfiles();
  assert.equal(studio.huntFilters.maxAgeDays, 14);
  assert.equal(studio.huntFilters.minRepins, 80);
  assert.equal(studio.huntFilters.minSaves, 10);
  assert.equal(studio.executionMode, 'fleet');
  assert.equal(studio.huntPaths.search.target_pins, 700);
  assert.equal(studio.huntPaths.boards.max_boards, 6);
  assert.equal(studio.hasHuntOverrides(), false);
  assert.ok(studio.activeHuntSummaryText().includes('<= 14d'));
  assert.ok(studio.activeHuntSummaryText().includes('>= 80 rp'));
  assert.ok(studio.activeHuntSummaryText().includes('Fleet'));

  // Temporary override
  studio.huntFilters.minRepins = 500;
  assert.equal(studio.hasHuntOverrides(), true);
  studio.resetHuntOverrides();
  assert.equal(studio.hasHuntOverrides(), false);
  assert.equal(studio.huntFilters.minRepins, 80);
});

// ============================================================================
// 4. Launchpad Unified 100-Item Cache Slicing & Auto-Refresh
// ============================================================================

test('P0-4: Launchpad caches up to 100 trends under canonical key and slices cleanly for 50 / 75 / 100', async () => {
  const storedTrends = Array.from({ length: 88 }, (_, i) => ({
    term: `trend ${i + 1}`,
    rank: i + 1,
    growth_pct: 500 - i
  }));
  let persistedPayload = null;

  const mockSql = (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('INSERT INTO app_settings')) {
      persistedPayload = typeof values[1] === 'string' ? JSON.parse(values[1]) : values[1];
      return Promise.resolve([]);
    }
    if (q.includes('SELECT value') && q.includes('FROM app_settings')) {
      if (values[0] === 'newborn_launchpad_cache' && persistedPayload) {
        return Promise.resolve([{ value: persistedPayload, updated_at: new Date().toISOString() }]);
      }
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  let capturedFetchLimit = null;
  const refreshed = await refreshNewbornLaunchpadFeed(mockSql, {
    country: 'US',
    trendType: 'growing',
    l1Interest: 'all',
    limit: 50,
    harvestTrendsFn: async (_router, opts) => {
      capturedFetchLimit = opts.limit;
      return { trends: storedTrends, fetched_at: new Date().toISOString(), status: 200 };
    },
    harvestZeroQueryFn: async () => ({ popular_terms: ['dinner'], ideas_for_you_terms: ['soup'] })
  });

  assert.equal(capturedFetchLimit, 100, 'refreshNewbornLaunchpadFeed must always fetch up to 100 trends from Pinterest');
  assert.equal(refreshed.trends.length, 50, 'Response should slice to requested limit=50');
  assert.equal(refreshed.cached_total, 88, 'cached_total should report full stored count');
  assert.equal(refreshed.cache_insufficient, false);
  assert.ok(persistedPayload.buckets['US:growing:all'], 'Canonical bucket key must omit l= suffix');
  assert.equal(persistedPayload.buckets['US:growing:all'].trends.length, 88);

  // Reading 75 and 100 from the same canonical cache bucket
  const feed75 = await getNewbornLaunchpadFeed(mockSql, { country: 'US', trendType: 'growing', l1Interest: 'all', limit: 75 });
  assert.equal(feed75.trends.length, 75);
  assert.equal(feed75.cached_total, 88);
  assert.equal(feed75.cache_insufficient, false);

  const feed100 = await getNewbornLaunchpadFeed(mockSql, { country: 'US', trendType: 'growing', l1Interest: 'all', limit: 100 });
  assert.equal(feed100.trends.length, 88);
  assert.equal(feed100.cached_total, 88);
  assert.equal(
    feed100.cache_insufficient,
    false,
    'cache_insufficient must be false when bucket was already fetched at ceiling fetched_limit=100 (prevents reload re-scrape loop)'
  );
  assert.equal(persistedPayload.buckets['US:growing:all'].fetched_limit, 100);

  // Legacy cache bucket without fetched_limit and < 50 items MUST still report cache_insufficient=true
  delete persistedPayload.buckets['US:growing:all'].fetched_limit;
  persistedPayload.buckets['US:growing:all'].trends = storedTrends.slice(0, 25);
  const legacyFeed50 = await getNewbornLaunchpadFeed(mockSql, { country: 'US', trendType: 'growing', l1Interest: 'all', limit: 50 });
  assert.equal(legacyFeed50.cache_insufficient, true, 'Legacy cache (< 50 items, no fetched_limit) must trigger one-time auto-refresh');

  // Client auto-refreshes once when cache_insufficient is true
  const calls = [];
  const newbornFactory = evalFactory(getNewbornClientAppScript(), 'newbornStudioApp', {
    fetch: async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method || 'GET' });
      if ((opts?.method || 'GET') === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ trends: storedTrends.slice(0, 50), cached_total: 88, cache_insufficient: false })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ trends: storedTrends.slice(0, 25), cached_total: 25, cache_insufficient: true })
      };
    }
  });
  const studio = newbornFactory('', 'hunt');
  studio.launchpadLimit = 50;
  await studio.loadLaunchpadFeed();
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1, 'Should auto-refresh once on cache_insufficient');
  // Calling again for same filter key should NOT trigger infinite POST loop
  await studio.loadLaunchpadFeed();
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1, 'Must not repeat auto-refresh for same filter key');
});

// ============================================================================
// 5. HTML Byte Budgets, Lock 1, UX Consolidation & Watchlist Opt-In Import
// ============================================================================

test('P1-1..4: HTML byte budgets strictly reduced, Lock 1 preserved, Campaign Workspace de-duplicated, Watchlist opt-in import', async () => {
  const foldersHtml = getCampaignFoldersPageHtml();
  const discoverHtml = getNewbornPageHtml('', 'hunt');
  const campaignNewbornHtml = getNewbornPageHtml('5', 'hunt');
  const watchlistHtml = getWatchlistPageHtml();

  const foldersBytes = Buffer.byteLength(foldersHtml, 'utf8');
  const discoverBytes = Buffer.byteLength(discoverHtml, 'utf8');
  const campaignNewbornBytes = Buffer.byteLength(campaignNewbornHtml, 'utf8');

  // Hard HTML byte invariants & reduction vs Pre-Wave 5 baselines (208,271 B & 187,124 B)
  assert.ok(foldersBytes < 215 * 1024, `/folders HTML must be < 215 KiB (got ${foldersBytes} B)`);
  assert.ok(foldersBytes < 208271, `/folders HTML must decrease vs 208,271 B baseline (got ${foldersBytes} B)`);
  assert.ok(discoverBytes < 225 * 1024, `/newborn HTML must be < 225 KiB (got ${discoverBytes} B)`);
  assert.ok(discoverBytes < 187124, `/newborn HTML must decrease vs 187,124 B baseline (got ${discoverBytes} B)`);
  assert.ok(campaignNewbornBytes < discoverBytes, `/folders/:id/newborn HTML (${campaignNewbornBytes} B) should be smaller than /discover (${discoverBytes} B)`);

  // Lock 1 preservation
  assert.ok(foldersHtml.includes('Lock 1: Unclipped Header Wrapper'), 'Lock 1 header wrapper comment must be preserved');
  assert.ok(foldersHtml.includes('Lock 1: Room 1 &amp; Room 5 Sibling DOM Hierarchy') || foldersHtml.includes('Lock 1: Room 1 & Room 5 Sibling DOM Hierarchy'), 'Lock 1 sibling DOM comment must be preserved');

  // P1-3: Dead isSettingsModalOpen removed; Room 5 has Folder Identity & Inheritance badges
  assert.ok(!foldersHtml.includes('x-show="isSettingsModalOpen"'), 'Dead isSettingsModalOpen modal must be removed');
  assert.ok(foldersHtml.includes('Inherited from Workspace'), 'Room 5 must display Inherited from Workspace badges');
  assert.ok(foldersHtml.includes('isSerpTopNInherited()'), 'Room 5 must bind SERP Top-N inheritance helper');
  assert.ok(foldersHtml.includes('isPinGraphInherited()'), 'Room 5 must bind Pin Graph inheritance helper');

  // P1-1: Discover collapsed hunt settings bar + dead settingsDrawerOpen HTML removed
  assert.ok(discoverHtml.includes('id="discover-hunt-settings-bar"'), 'Discover must render compact hunt settings summary bar');
  assert.ok(discoverHtml.includes('id="discover-hunt-override-panel"'), 'Discover must render collapsible hunt override panel');
  assert.ok(discoverHtml.includes('x-show="huntOptionsExpanded"'), 'Hunt override panel must toggle via huntOptionsExpanded');
  assert.ok(!discoverHtml.includes('id="newborn-settings-drawer"'), 'Dead hidden settingsDrawerOpen HTML must be removed');

  // P1-2: Campaign Workspace (/folders/5/newborn) de-duplication
  assert.ok(campaignNewbornHtml.includes('Campaign Newborn Hunter'), 'Campaign scoped view must label Campaign Newborn Hunter');
  assert.ok(campaignNewbornHtml.includes('/discover?folder_id=5'), 'Campaign scoped view must link to /discover?folder_id=5');
  assert.ok(!campaignNewbornHtml.includes('id="newborn-rising-trends-panel"'), 'Campaign scoped view must omit Rising Trends panel');
  assert.ok(!campaignNewbornHtml.includes('id="tab-newborn-cluster"'), 'Campaign scoped view must omit Cluster Explorer tab');

  // P1-4: Watchlist empty-state clarity + opt-in Radar import
  assert.ok(watchlistHtml.includes('Import Top 10 Creators from Radar'), 'Watchlist Creators tab must offer opt-in Radar import');
  assert.ok(watchlistHtml.includes('Import Top 10 Domains from Radar'), 'Watchlist Domains tab must offer opt-in Radar import');

  const watchlistFactory = evalFactory(getWatchlistClientAppJs(), 'watchlistApp');
  const wl = watchlistFactory();
  assert.equal(typeof wl.importTopFromRadar, 'function', 'watchlistApp must expose importTopFromRadar');
});

// ============================================================================
// 6. Hotfix Regression Suite (T1–T11: All P0 & P1 Stabilization Fixes)
// ============================================================================

test('T1 (WP-1): Workspace 1 Radar preserves full discovery after Watchlist additions; Workspace 2 stays strictly isolated without top-60 truncation', async () => {
  // Build 80 creators where ws2_creator sits at index 75 (below top 60!)
  const allCreators = Array.from({ length: 80 }, (_, idx) => ({
    id: idx + 1,
    username: idx === 75 ? 'ws2_creator' : `creator_${idx + 1}`,
    display_name: idx === 75 ? 'WS2 Creator' : `Creator ${idx + 1}`,
    monthly_reach: 100000 - idx * 500,
    profile_views: 50000 + idx * 100,
    total_pins: 200
  }));

  const allDomains = [
    { domain: 'alpha.com', total_pins: 100, total_saves: 5000, avg_velocity: 42, total_count: 3 },
    { domain: 'beta.com', total_pins: 80, total_saves: 3000, avg_velocity: 18, total_count: 3 },
    { domain: 'ws2-only.com', total_pins: 25, total_saves: 500, avg_velocity: 5, total_count: 3 }
  ];

  const makeMockSql = (watchedCreators, watchedDomains) => (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM workspace_watchlist')) {
      if (q.includes("entity_type = 'creator'")) return Promise.resolve(watchedCreators.map((k) => ({ handle: k, entity_key: k })));
      if (q.includes("entity_type = 'domain'")) return Promise.resolve(watchedDomains.map((k) => ({ domain: k, entity_key: k })));
      return Promise.resolve([]);
    }
    if (q.includes('FROM folders') || q.includes('FROM folder_items')) return Promise.resolve([]);
    if (q.includes('FROM competitor_profiles') && q.includes('COUNT(*)')) {
      return Promise.resolve([{
        tracked_profiles: allCreators.length,
        total_audience: allCreators.reduce((s, c) => s + c.monthly_reach, 0),
        total_impressions: allCreators.reduce((s, c) => s + c.profile_views, 0),
        pins_tracked: allCreators.reduce((s, c) => s + c.total_pins, 0)
      }]);
    }
    if (q.includes('FROM competitor_profiles')) {
      // Respect LIMIT bound in SQL query (last two numeric values are limit & offset)
      const numericVals = values.filter((v) => typeof v === 'number');
      const lim = numericVals[0] ?? 60;
      const off = numericVals[1] ?? 0;
      return Promise.resolve(allCreators.slice(off, off + lim));
    }
    if (q.includes('FROM domain_intelligence') || q.includes('FROM pins')) {
      return Promise.resolve(allDomains);
    }
    return Promise.resolve([]);
  };

  // Workspace 1 with 1 watchlisted creator + 1 watchlisted domain MUST NOT collapse Radar to 1 item!
  const ws1Sql = makeMockSql(['creator_1'], ['alpha.com']);
  const creatorsWs1 = await handleCreatorsRoutes({
    pathname: '/api/creators',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=60&workspace_scope=1'),
    env: {},
    ctx: {},
    sql: ws1Sql,
    workspaceId: 1,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (ns, p) => `ws:1:${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    tripPinterestCircuitBreaker: () => {}
  });
  assert.equal(creatorsWs1.status, 200);
  const ws1Creators = creatorsWs1.payload.competitors || creatorsWs1.payload.creators || [];
  assert.equal(ws1Creators.length, 60, 'Workspace 1 Creator Radar must NOT collapse to 1 item after adding 1 creator to Watchlist');
  assert.equal(creatorsWs1.payload.overview.total_scoped_creators, 80);

  const domainsWs1 = await handleDomainsRoutes({
    pathname: '/api/domains',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=60&workspace_scope=1'),
    env: {},
    ctx: {},
    sql: ws1Sql,
    workspaceId: 1,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (ns, p) => `ws:1:${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    redactSecrets: (s) => s
  });
  assert.equal(domainsWs1.status, 200);
  assert.equal(domainsWs1.payload.domains.length, 3, 'Workspace 1 Domain Radar must NOT collapse to 1 item after adding 1 domain to Watchlist');

  // Workspace 2 with a watchlisted creator ranked #76 globally MUST still find ws2_creator (no pre-filter limit=60 truncation!)
  const ws2Sql = makeMockSql(['ws2_creator'], ['ws2-only.com']);
  const creatorsWs2 = await handleCreatorsRoutes({
    pathname: '/api/creators',
    method: 'GET',
    request: { headers: {} },
    searchParams: new URLSearchParams('limit=60&workspace_scope=1'),
    env: {},
    ctx: {},
    sql: ws2Sql,
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
  const ws2Creators = creatorsWs2.payload.competitors || creatorsWs2.payload.creators || [];
  assert.deepEqual(ws2Creators.map((c) => c.username), ['ws2_creator']);
  assert.equal(creatorsWs2.payload.overview.total_scoped_creators, 1);
  assert.equal(creatorsWs2.payload.overview.avg_monthly_views, 57500);
});

test('T2 (WP-1): Watchlist mutations (POST/PATCH/DELETE) invalidate creators & domains:leaderboard edge caches', async () => {
  const invalidated = [];
  const mockSql = (strings) => {
    const q = strings.join(' ');
    if (q.includes('INSERT INTO workspace_watchlist')) {
      return Promise.resolve([{ id: 10, workspace_id: 2, entity_type: 'creator', entity_key: 'chef_z', creator_tracking_mode: 'metrics_only' }]);
    }
    if (q.includes('UPDATE workspace_watchlist')) {
      return Promise.resolve([{ id: 10, workspace_id: 2, entity_type: 'creator', entity_key: 'chef_z', creator_tracking_mode: 'metrics_full_catalog' }]);
    }
    if (q.includes('DELETE FROM workspace_watchlist')) {
      return Promise.resolve([{ id: 10 }]);
    }
    return Promise.resolve([]);
  };

  const baseCtx = {
    sql: mockSql,
    workspaceId: 2,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    invalidateEdgeCache: (prefix) => invalidated.push(prefix)
  };

  const postRes = await handleWatchlistRoutes({
    ...baseCtx,
    pathname: '/api/watchlist',
    method: 'POST',
    request: { json: async () => ({ entity_type: 'creator', entity_key: 'chef_z' }) },
    searchParams: new URLSearchParams()
  });
  assert.equal(postRes.status, 201);
  assert.ok(invalidated.includes('creators') && invalidated.includes('domains:leaderboard'));

  invalidated.length = 0;
  const patchRes = await handleWatchlistRoutes({
    ...baseCtx,
    pathname: '/api/watchlist/10',
    method: 'PATCH',
    request: { json: async () => ({ creator_tracking_mode: 'metrics_full_catalog' }) },
    searchParams: new URLSearchParams()
  });
  assert.equal(patchRes.status, 200);
  assert.ok(invalidated.includes('creators') && invalidated.includes('domains:leaderboard'));

  invalidated.length = 0;
  const delRes = await handleWatchlistRoutes({
    ...baseCtx,
    pathname: '/api/watchlist/10',
    method: 'DELETE',
    request: {},
    searchParams: new URLSearchParams()
  });
  assert.equal(delRes.status, 200);
  assert.ok(invalidated.includes('creators') && invalidated.includes('domains:leaderboard'));
});

test('T3 & T4 (WP-2): Newborn cross-workspace folder_id IDOR returns 404, candidates cache is workspace-scoped, and non-integer folder_id is safely rejected', async () => {
  const capturedSql = [];
  const mockSql = (strings, ...values) => {
    const q = strings.join(' ? ');
    capturedSql.push({ q, values });
    // Folder #5 belongs ONLY to workspace 1; workspace 2 lookup returns []
    if (q.includes('FROM keyword_folders') && q.includes('WHERE id =')) {
      const [fid, wid] = values;
      return Promise.resolve(Number(fid) === 5 && Number(wid) === 1 ? [{ id: 5, workspace_id: 1 }] : []);
    }
    return Promise.resolve([]);
  };

  const cacheKeysSeen = [];
  const makeCtx = (pathname, qs, workspaceId) => ({
    pathname,
    method: 'GET',
    request: { headers: new Map() },
    searchParams: new URLSearchParams(qs),
    env: {},
    sql: mockSql,
    workspaceId,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    buildCanonicalCacheKey: (ns, p) => `${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (k, fn) => {
      cacheKeysSeen.push(k);
      return fn();
    },
    invalidateEdgeCache: () => {},
    safeWaitUntil: () => {},
    clampLimit: (v, d) => Number(v) || d
  });

  // Cross-workspace folder_id=5 from Workspace 2 MUST fail-closed with 404 across all GET endpoints
  for (const path of ['/api/newborn/overview', '/api/newborn/candidates', '/api/newborn/crossover', '/api/newborn/anchors', '/api/newborn/runs']) {
    const res = await handleNewbornRoutes(makeCtx(path, 'folder_id=5', 2));
    assert.equal(res.status, 404, `${path}?folder_id=5 from Workspace 2 must return 404`);
  }

  // Non-integer folder_id like "5.5" or "abc" MUST fail-closed with 400 on route guard and never throw in queries
  const badRes = await handleNewbornRoutes(makeCtx('/api/newborn/overview', 'folder_id=5.5', 1));
  assert.equal(badRes.status, 400, 'Non-integer folder_id=5.5 must be rejected with HTTP 400');

  // Workspace 2 /api/newborn/candidates without folder_id uses workspace-scoped cache key & SQL filter
  cacheKeysSeen.length = 0;
  capturedSql.length = 0;
  const ws2Cands = await handleNewbornRoutes(makeCtx('/api/newborn/candidates', 'limit=10', 2));
  assert.equal(ws2Cands.status, 200);
  assert.ok(cacheKeysSeen.some((k) => k.startsWith('newborn:candidates:ws2:')), 'Candidates cache key must include workspaceId');
  assert.ok(
    capturedSql.some((c) => c.q.includes('FROM keyword_folders WHERE workspace_id =') && c.values.includes(2)),
    'Workspace 2 global /api/newborn/candidates must filter rows to workspace 2 folders'
  );

  // folder_id=5 on Workspace 1 MUST bypass edge cache on /api/newborn/candidates
  cacheKeysSeen.length = 0;
  const ws1FolderCands = await handleNewbornRoutes(makeCtx('/api/newborn/candidates', 'folder_id=5&limit=10', 1));
  assert.equal(ws1FolderCands.status, 200);
  assert.equal(cacheKeysSeen.length, 0, '/api/newborn/candidates?folder_id=5 must bypass edge cache');

  // Direct query helper rejects non-integer folder_id cleanly
  const candDirect = await listNewbornCandidates(mockSql, { folder_id: 'abc', workspace_id: 2 });
  assert.deepEqual(candDirect.candidates, []);
});

test('T5 & T6 (WP-3): Discover omits overrides when unmodified, sends explicit min_save_count=0 override, fixes startPollingRun, and syncs board_more_ideas.enabled', async () => {
  // T6: harvester syncs board_more_ideas.enabled with targets.boards.enabled
  const settings = structuredClone(DEFAULT_NEWBORN_SETTINGS);
  applyWorkspaceExtractionTargetsToSettings(
    settings,
    { extraction_targets: { boards: { enabled: false, max_boards: 5, target_pins_per_board: 50 } } },
    null
  );
  assert.equal(settings.discovery.surfaces.fresh_boards.enabled, false);
  assert.equal(settings.discovery.surfaces.board_more_ideas.enabled, false, 'board_more_ideas.enabled must sync to boards.enabled=false');

  // T5: Client buildExplicitHuntOverrides & startPollingRun across all 4 launch paths
  const postedBodies = [];
  let pollStartedIds = [];
  const newbornFactory = evalFactory(getNewbornClientAppScript(), 'newbornStudioApp', {
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/workspaces/settings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            settings: {
              max_pin_age_days: 14,
              min_repin_count: 80,
              min_save_count: 15,
              execution_mode: 'auto',
              extraction_targets: {
                search: { enabled: true, target_pins: 500 },
                boards: { enabled: true, max_boards: 10, target_pins_per_board: 100 },
                idea_page: { enabled: true, target_pins: 250 },
                home_feed: { enabled: false, target_pins: 250 }
              }
            }
          })
        };
      }
      if (u.includes('/api/newborn/settings')) {
        return { ok: true, status: 200, json: async () => ({ settings: structuredClone(DEFAULT_NEWBORN_SETTINGS) }) };
      }
      if ((opts?.method || 'GET') === 'POST') {
        postedBodies.push({ url: u, body: JSON.parse(opts.body || '{}') });
        return { ok: true, status: 202, json: async () => ({ run_id: 99, run: { id: 99, status: 'completed' }, folder: { id: 5 } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });

  const studio = newbornFactory('', 'hunt');
  studio.startPollingRun = (id) => pollStartedIds.push(id);
  await studio.loadSettingsAndProfiles();

  // Case A: Unmodified settings -> NO filters and NO paths sent!
  await studio.runFocusedHunt('cozy living room');
  const unmodifiedDiscover = postedBodies.find((p) => p.url === '/api/newborn/discover');
  assert.ok(unmodifiedDiscover);
  assert.equal('filters' in unmodifiedDiscover.body, false, 'Unmodified runFocusedHunt must NOT send filters');
  assert.equal('paths' in unmodifiedDiscover.body, false, 'Unmodified runFocusedHunt must NOT send paths');

  // Case B: Unmodified quick basket hunt -> NO filters/paths AND calls startPollingRun (no TypeError!)
  studio.clusterBasket = ['cozy living room'];
  await studio.launchBasketQuickHunt();
  const unmodifiedBasket = postedBodies.find((p) => p.url === '/api/newborn/cluster/hunt');
  assert.ok(unmodifiedBasket);
  assert.equal('filters' in unmodifiedBasket.body, false, 'Unmodified launchBasketQuickHunt must NOT send filters');
  assert.equal('paths' in unmodifiedBasket.body, false, 'Unmodified launchBasketQuickHunt must NOT send paths');
  assert.ok(pollStartedIds.includes(99), 'launchBasketQuickHunt must call startPollingRun(99)');

  // Case C: Explicit falsy override minSaves=0 (when workspace default is 15) -> sends ONLY min_save_count: 0!
  postedBodies.length = 0;
  studio.huntFilters.minSaves = 0;
  await studio.runFocusedHunt('cozy kitchen');
  const zeroOverride = postedBodies.find((p) => p.url === '/api/newborn/discover');
  assert.deepEqual(zeroOverride.body.filters, { min_save_count: 0 }, 'Explicit min_save_count=0 override must be preserved without clobbering other filters');
  assert.equal('paths' in zeroOverride.body, false, 'Unchanged paths must not be sent');
});

test('T7 (WP-4): Radar client rejects NaN/empty-string poisoning and formats negative gains without +-', async () => {
  const radarHtml = getRadarPageHtml();
  assert.ok(radarHtml.includes('fmtSigned(pulseSummary.total_gain)'), 'Pulse KPI must use fmtSigned');
  assert.ok(radarHtml.includes('fmtSigned(pinGain(pin))'), 'Pulse table gain must use fmtSigned');
  assert.ok(radarHtml.includes('fmtSigned(dom.avg_velocity'), 'Domain gain must use fmtSigned');

  const radarFactory = evalFactory(getRadarClientAppScript(), 'radarApp', {
    fetch: async (url) => {
      if (String(url).includes('/api/pulse/24h')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kpis: { total_active_serp_pins: '', total_24h_saves_velocity: 'N/A', pins_gaining_24h_count: null },
            breakout_pins: [
              { pin_id: '1', saves_gain_24h: 'N/A', gain_24h: 200 },
              { pin_id: '2', saves_gain_24h: -1500, window_saves_gain: '' }
            ]
          })
        };
      }
      if (String(url).includes('/api/creators')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            overview: { tracked_profiles: '0', total_impressions: 1000, avg_monthly_views: '' },
            creators: []
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const app = radarFactory();
  assert.equal(app.fmtSigned(-1500), '-1.5K');
  assert.equal(app.fmtSigned(0), '+0');
  assert.equal(app.fmtSigned(2500), '+2.5K');
  assert.equal(app.fmtNum('not-a-number'), '0');

  app.timeframe = '7d';
  // Empty string window_saves_gain must NOT shadow base24 (-1500)
  assert.equal(app.pinGain({ saves_gain_24h: -1500, window_saves_gain: '' }), -1500);
  // Non-numeric string must fall through to next valid candidate
  assert.equal(app.pinGain({ repins_delta_24h: 'bad', saves_gain_24h: 42 }), 42);

  app.timeframe = '24h';
  await app.loadPulse();
  assert.equal(Number.isNaN(app.pulseSummary.total_gain), false);
  assert.equal(app.pulseSummary.total_gain, -1300, 'gainSum fallback must safely sum 200 + (-1500)');
  assert.equal(app.pulseSummary.total_pins, 2, 'Empty string KPI must fall through to rows.length');

  await app.loadCreators();
  assert.equal(Number.isNaN(app.creatorsSummary.avg_monthly_views), false);
  assert.equal(app.creatorsSummary.avg_monthly_views, 1000, 'Empty avg_monthly_views must fall back to total_impressions / max(1, divisor)');
});

test('T8..T11 (WP-5 & WP-6): Launchpad case-insensitive filterKey, POST /api/folders serp_top_n clamp 5..100, dead code gone, Folder null pgr fallback, Watchlist import safety', async () => {
  // T8: Launchpad client filterKey is case-insensitive
  let postCount = 0;
  const newbornFactory = evalFactory(getNewbornClientAppScript(), 'newbornStudioApp', {
    fetch: async (_url, opts) => {
      if ((opts?.method || 'GET') === 'POST') {
        postCount++;
        return { ok: true, status: 200, json: async () => ({ trends: [], cache_insufficient: false }) };
      }
      return { ok: true, status: 200, json: async () => ({ trends: [], cache_insufficient: true }) };
    }
  });
  const studio = newbornFactory('', 'hunt');
  studio.launchpadIncludeTerms = 'Keto';
  await studio.loadLaunchpadFeed();
  studio.launchpadIncludeTerms = '  keto  ';
  await studio.loadLaunchpadFeed();
  assert.equal(postCount, 1, 'Launchpad auto-refresh guard must treat "Keto" and " keto " as the same filterKey');

  // T9: POST /api/folders accepts workspace default_serp_top_n = 80 (clamped 5..100, not 10..50)
  let insertedValues = [];
  const folderSql = (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM workspace_settings')) {
      return Promise.resolve([{ workspace_id: 1, default_serp_top_n: 80 }]);
    }
    if (q.includes('INSERT INTO keyword_folders')) {
      insertedValues = values;
      return Promise.resolve([{ id: 77, name: 'High N Campaign', serp_top_n: 80 }]);
    }
    return Promise.resolve([]);
  };
  const createRes = await handleFoldersRoutes({
    pathname: '/api/folders',
    method: 'POST',
    request: { json: async () => ({ name: 'High N Campaign' }) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: folderSql,
    workspaceId: 1,
    jsonResponse: (payload, status = 200) => ({ status, payload }),
    clampLimit: (v, d) => Number(v) || d,
    invalidateEdgeCache: () => {}
  });
  assert.equal(createRes.status, 200);
  assert.ok(insertedValues.includes(80), 'POST /api/folders must inherit workspace default_serp_top_n=80 up to 100 (not clamp at 50)');

  // T10: Dead symbols gone from newborn-client-app.mjs & folders-client-app.mjs + null pgr fallback
  const newbornJs = getNewbornClientAppScript();
  const foldersJs = getFoldersClientAppScript();
  assert.equal(newbornJs.includes('settingsDrawerOpen'), false, 'settingsDrawerOpen must be removed from newborn-client-app.mjs');
  assert.equal(newbornJs.includes('startRunPolling'), false, 'startRunPolling typo must be removed from newborn-client-app.mjs');
  assert.equal(foldersJs.includes('isSettingsModalOpen'), false, 'isSettingsModalOpen must be removed from folders-client-app.mjs');

  const foldersFactory = evalFactory(foldersJs, 'foldersApp');
  const fApp = foldersFactory(1, 'settings');
  fApp.workspaceSettingsDefaults = {
    default_serp_top_n: 30,
    pin_graph_rules: { auto_trigger_enabled: false, linkless_only: false, min_repins: 750, max_pages: 40 }
  };
  fApp.activeFolder = {
    id: 1,
    name: 'Test',
    pin_graph_rules: { min_repins: null, max_pages: '' },
    metadata: {}
  };
  fApp.syncFolderSettingsFromActive();
  assert.equal(fApp.folderSettings.pin_graph_rules.min_repins, 750, 'null pgr.min_repins must inherit workspace default 750 (not 0)');
  assert.equal(fApp.folderSettings.pin_graph_rules.max_pages, 40, 'empty string pgr.max_pages must inherit workspace default 40 (not 1)');

  // T11: Watchlist import skips already-watched items (no downgrade), handles partial failure, reloads in finally, and separates search-no-match UI
  const wlHtml = getWatchlistPageHtml();
  assert.ok(wlHtml.includes('No watched creators match your filter'), 'Watchlist Creators tab must separate search-no-match state');
  assert.ok(wlHtml.includes('No watched domains match your filter'), 'Watchlist Domains tab must separate search-no-match state');

  const postedKeys = [];
  let reloadCount = 0;
  const watchlistFactory = evalFactory(getWatchlistClientAppJs(), 'watchlistApp', {
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.startsWith('/api/creators?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            creators: [
              { username: 'already_full', display_name: 'Already Full' },
              { username: 'new_ok', display_name: 'New OK' },
              { username: 'new_fail', display_name: 'New Fail' }
            ]
          })
        };
      }
      if (u === '/api/watchlist' && (opts?.method || 'GET') === 'POST') {
        const body = JSON.parse(opts.body || '{}');
        postedKeys.push(body.entity_key);
        if (body.entity_key === 'new_fail') {
          return { ok: false, status: 500, json: async () => ({ error: 'DB busy' }) };
        }
        return { ok: true, status: 201, json: async () => ({ success: true }) };
      }
      if (u.startsWith('/api/watchlist?')) {
        reloadCount++;
        return { ok: true, status: 200, json: async () => ({ items: [], counts: { all: 0, creator: 0, domain: 0, pin: 0 } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const wl = watchlistFactory();
  wl.items = [{ id: 1, entity_type: 'creator', entity_key: 'already_full', creator_tracking_mode: 'metrics_full_catalog' }];
  wl.$nextTick = (fn) => fn();
  await wl.importTopFromRadar('creator');
  assert.deepEqual(postedKeys, ['new_ok', 'new_fail'], 'Already-watched creator must be skipped to prevent metrics_full_catalog downgrade');
  assert.equal(reloadCount, 1, 'Watchlist must reload in finally when at least 1 item was imported');
  assert.ok(wl.toastMsg.includes('Imported 1 creator(s)') && wl.toastMsg.includes('1 already watched') && wl.toastMsg.includes('1 failed'));
});

test('T12: Read-Only Live Verifier (scripts/verify-live-readonly.mjs) & ci.yml wiring', () => {
  assert.equal(shaMatches('44c6228', '44c6228abcdef1234567890'), true);
  assert.equal(shaMatches('deadbee', '44c6228'), false);
  assert.equal(shaMatches('44c6228', ''), true);

  const htmlOk = evaluateHtmlBudgetsAndSymbols({
    path: '/folders/5',
    html: '<div>Inherited from Workspace</div>',
    maxBytes: BYTE_BUDGETS.foldersHtmlMaxBytes,
    forbiddenSymbols: DEAD_SYMBOLS.folders,
    requiredSubstrings: ['Inherited from Workspace']
  });
  assert.equal(htmlOk.pass, true);

  const htmlBad = evaluateHtmlBudgetsAndSymbols({
    path: '/folders/5',
    html: '<div>isSettingsModalOpen Inherited from Workspace</div>',
    maxBytes: BYTE_BUDGETS.foldersHtmlMaxBytes,
    forbiddenSymbols: DEAD_SYMBOLS.folders,
    requiredSubstrings: ['Inherited from Workspace']
  });
  assert.equal(htmlBad.pass, false);
  assert.deepEqual(htmlBad.foundForbidden, ['isSettingsModalOpen']);

  const pulseEval = evaluatePulsePayload({
    success: true,
    breakout_pins: [{ save_count: 1500, daily_save_velocity: 42, window_saves_gain: 210 }]
  }, 500_000, '24h');
  assert.equal(pulseEval.pass, true);
  assert.equal(evaluatePulsePayload({ success: true, breakout_pins: [] }, 950_000, '24h').pass, false);

  const creatorsEval = evaluateCreatorsPayload({
    success: true,
    overview: { pins_tracked: 2_700_000_000, combined_reach: 120_000_000, total_impressions: 240_000_000 },
    competitors: [{ username: 'chef', monthly_reach: 500_000 }]
  });
  assert.equal(creatorsEval.pass, true);
  assert.equal(creatorsEval.pinsTrackedBillions, 2.7);

  const domainsEval = evaluateDomainsPayload({
    success: true,
    total_domains: 42,
    domains: [{ domain: 'example.com', avg_velocity: 18 }]
  });
  assert.equal(domainsEval.pass, true);

  const wsEval = evaluateWorkspaceSettingsPayload({
    success: true,
    workspace_id: 1,
    settings: { min_repin_count: 20, extraction_targets: { boards: { max_boards: 10 } } }
  });
  assert.equal(wsEval.pass, true);
  assert.equal(wsEval.minRepins, 20);
  assert.equal(wsEval.maxBoards, 10);

  assert.equal(evaluateCookieWriteOnlyPayload({ success: true, has_cookie: true, preview: '[CONFIGURED]' }).pass, true);
  assert.equal(evaluateCookieWriteOnlyPayload({ success: true, has_cookie: true, preview: '_pinterest_sess=raw_leak' }).pass, false);

  const md = formatMarkdownSummary({
    allPassed: true,
    target: 'https://app.hymum.com',
    commit: '44c6228',
    timestamp: '2026-04-01T00:00:00Z',
    checks: [{ name: 'GET /api/health', pass: true, detail: 'HTTP 200' }]
  });
  assert.match(md, /PAE v4 Live Read-Only Verification \(PASS\)/);

  const ciYml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
  assert.match(ciYml, /^name: Deploy/m);
  assert.match(ciYml, /^\s*workflow_dispatch:/m);
  assert.match(ciYml, /node scripts\/verify-live-readonly\.mjs/);
  assert.doesNotMatch(ciYml, /^\s*schedule:/m);
});

