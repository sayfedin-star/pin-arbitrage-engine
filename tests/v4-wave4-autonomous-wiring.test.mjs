/**
 * tests/v4-wave4-autonomous-wiring.test.mjs
 *
 * Comprehensive offline behavioral verification for V4 Wave 4 — Phase 1:
 * - Pin 1 + Pillar 4: /creators -> 302 redirect to /watchlist?tab=creators & Watchlist tab normalization
 * - Pin 2 + Pillar 2: Daily Pulse MAX(serp_top_n) dynamic depth [10..50], campaign_tracked_pins search sync,
 *                     workspace_watchlist (pin) polling, creator_tracking_mode (metrics_only vs metrics_full_catalog),
 *                     and workspace_settings.extraction_targets wiring in Discover harvester
 * - Pin 3: All 5 GitHub Actions workflows YAML audit + ZERO automatic schedule: cron in newborn-hunter.yml
 * - Pillar 1: Pin Graph execution (campaign_pin_graph_seeds, pin_graph_rules Zero Auto-Promote default,
 *             strict CHECK statuses 'queued'|'crawled'|'failed', related-pins-crawler.yml Stage 0 check)
 * - Pillar 3: Campaigns Studio (default_serp_top_n inheritance, Pin Graph Seeds & Rules UI, no duplicate cookie form)
 *             and Pin Dossier (/pin/:id V4 Watchlist + Campaign/Seed actions while preserving getBackUrl/Deep Sync/Purge)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handlePagesRoutes } from '../src/routes/pages.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { RESERVED_KEYWORD_SLUGS } from '../src/http/security-and-response.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getPinDetailPageHtml } from '../src/ui/pin-details/index.mjs';
import {
  resolveKeywordMaxSerpTopN,
  syncKeywordTopNIntoCampaigns,
  runPhase1ASerpHarvestForKeyword,
  fetchWatchlistPinsForWorker
} from '../scripts/keyword-velocity-crawler.mjs';
import {
  loadWatchlistCreatorContext,
  loadWatchlistCreatorModes,
  resolveCreatorSyncCookieAndBounds,
  resolveEffectiveCreatorTrackingMode
} from '../scripts/creator-velocity-crawler.mjs';
import { applyWorkspaceExtractionTargetsToSettings } from '../src/modules/newborn/harvester.mjs';
import {
  fetchWithRetry,
  mergeCampaignPinGraphRules,
  evaluatePinGraphCandidateRules,
  fetchQueuedCampaignPinGraphSeeds,
  markCampaignPinGraphSeedStatus,
  recordCampaignRelatedPins
} from '../scripts/cluster-intelligence.mjs';
import { PinterestCircuitBreaker, CircuitBreakerOpenError } from '../src/core/pinterest/index.mjs';

/**
 * PG16 Schema Fidelity Guard (001_baseline_schema.sql + 012_v4_workspaces_and_clean_slate.sql):
 * `keyword_folders` has NO `status` column — active/paused state lives in `kf.metadata->>'status'`
 * and `kf.metadata->>'pause_crawlers'`. Throws authentic PG 42703 if any query ever references `kf.status`.
 */
function assertValidKeywordFoldersSql(query) {
  if (/\b(?:kf|keyword_folders)\.status\b/i.test(query)) {
    const err = new Error('column kf.status does not exist');
    err.code = '42703';
    throw err;
  }
}

function createMockSql(handler) {
  const fn = async (strings, ...values) => {
    const query = Array.isArray(strings)
      ? strings.join(' ').replace(/\s+/g, ' ').trim()
      : String(strings || '');
    assertValidKeywordFoldersSql(query);
    return handler(query, values);
  };
  return fn;
}

// =========================================================================
// PIN 1 & PILLAR 4: /creators -> 302 REDIRECT TO /watchlist?tab=creators
// =========================================================================

test('Wave 4 Pin 1: GET /creators and /creators/ issue HTTP 302 redirect to /watchlist?tab=creators', async () => {
  for (const pathname of ['/creators', '/creators/']) {
    let statusCode = 0;
    const headers = {};
    let body = null;
    const reply = {
      sent: false,
      code(s) { statusCode = s; return this; },
      header(k, v) { headers[k.toLowerCase()] = v; return this; },
      send(payload) { body = payload; this.sent = true; return this; }
    };

    await handlePagesRoutes({
      pathLower: pathname,
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

    assert.equal(statusCode, 302, `${pathname} must return HTTP 302`);
    assert.equal(headers.location, '/watchlist?tab=creators', `${pathname} must redirect to /watchlist?tab=creators`);
    assert.match(headers['cache-control'] || '', /no-store/i);
    assert.equal(body, '');
  }

  // Watchlist client normalizes ?tab=creators -> 'creator'
  const watchlistClient = fs.readFileSync(
    path.resolve(process.cwd(), 'src/ui/watchlist/watchlist-client-app.mjs'),
    'utf8'
  );
  assert.match(watchlistClient, /creators:\s*'creator'/);
  assert.match(watchlistClient, /domains:\s*'domain'/);
  assert.match(watchlistClient, /pins:\s*'pin'/);
});

// =========================================================================
// PIN 3: ALL 5 GITHUB ACTIONS WORKFLOWS YAML AUDIT + ZERO CRON IN NEWBORN HUNT
// =========================================================================

test('Wave 4 Pin 3: 5 GitHub Actions workflows pass YAML audit and Newborn Hunt has ZERO automatic schedule cron', () => {
  const wfDir = path.resolve(process.cwd(), '.github/workflows');
  const expectedFiles = [
    { file: 'ci.yml', name: 'Deploy', allowCron: false },
    { file: 'keyword-intelligence-velocity.yml', name: 'Daily Pulse', allowCron: true },
    { file: 'crawler-pipeline.yml', name: 'Creator Sync', allowCron: true },
    { file: 'newborn-hunter.yml', name: 'Newborn Hunt', allowCron: false, isNewborn: true },
    { file: 'related-pins-crawler.yml', name: 'Related Pins', allowCron: false, isRelated: true }
  ];

  const actualFiles = fs.readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
  assert.deepEqual(
    actualFiles,
    expectedFiles.map((w) => w.file).sort(),
    'Exactly 5 canonical workflow YAML files must exist in .github/workflows'
  );

  for (const wf of expectedFiles) {
    const content = fs.readFileSync(path.join(wfDir, wf.file), 'utf8');
    const lines = content.split(/\r?\n/);
    assert.equal(lines[0].trim(), `name: ${wf.name}`, `${wf.file} must start with "name: ${wf.name}"`);
    assert.match(content, /^on:/m, `${wf.file} must declare top-level on:`);
    assert.match(content, /^jobs:/m, `${wf.file} must declare top-level jobs:`);
    assert.match(content, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/, `${wf.file} must keep Node 24 actions env`);

    if (wf.allowCron) {
      assert.match(content, /^\s*schedule:/m, `${wf.file} must keep its schedule: trigger`);
      assert.match(content, /^\s*-\s*cron:\s*['"][^'"]+['"]/m, `${wf.file} must keep a valid cron expression`);
    }

    if (wf.isNewborn) {
      assert.doesNotMatch(content, /^\s*schedule:/m, 'newborn-hunter.yml MUST NOT have a schedule: block');
      assert.doesNotMatch(content, /^\s*-\s*cron:/m, 'newborn-hunter.yml MUST NOT have a cron entry');
      assert.match(content, /^\s*workflow_dispatch:/m, 'newborn-hunter.yml must retain workflow_dispatch:');
      assert.match(content, /max-parallel:\s*20/, 'newborn-hunter.yml must preserve the 20-runner fleet matrix');
    }

    if (wf.isRelated) {
      assert.match(content, /campaign_pin_graph_seeds/, 'related-pins-crawler.yml Stage 0 must count campaign_pin_graph_seeds');
      assert.match(content, /status\s*=\s*'queued'/, 'related-pins-crawler.yml Stage 0 must filter queued seeds');
    }
  }
});

// =========================================================================
// PIN 2 & PILLAR 2: MAX(serp_top_n) + TOP-N CAMPAIGN SYNC + WATCHLIST PINS
// =========================================================================

test('Wave 4 Pin 2: resolveKeywordMaxSerpTopN clamps [5..100], uses PG16 kf.metadata predicate, handles NULL and 42703 cleanly', async () => {
  const sqlLow = createMockSql((query) => {
    assert.match(query, /kf\.metadata->>'status'/i, 'Must filter campaign status via PG16 JSONB kf.metadata');
    assert.match(query, /kf\.metadata->>'pause_crawlers'/i, 'Must respect pause_crawlers flag in kf.metadata');
    return [{ max_top_n: 2 }];
  });
  assert.equal(await resolveKeywordMaxSerpTopN(sqlLow, 101), 5);

  const sqlFive = createMockSql(() => [{ max_top_n: 5 }]);
  assert.equal(await resolveKeywordMaxSerpTopN(sqlFive, 101), 5);

  const sqlMid = createMockSql(() => [{ max_top_n: 35 }]);
  assert.equal(await resolveKeywordMaxSerpTopN(sqlMid, 101), 35);

  const sqlHigh = createMockSql(() => [{ max_top_n: 120 }]);
  assert.equal(await resolveKeywordMaxSerpTopN(sqlHigh, 101), 100);

  const sqlNone = createMockSql(() => [{ max_top_n: null }]);
  assert.equal(await resolveKeywordMaxSerpTopN(sqlNone, 101), null);

  const sqlLegacySchema = createMockSql(() => {
    const err = new Error('column kf.serp_top_n does not exist');
    err.code = '42703';
    throw err;
  });
  assert.equal(await resolveKeywordMaxSerpTopN(sqlLegacySchema, 101), null);
});

test('Wave 4 Pin 2: syncKeywordTopNIntoCampaigns syncs each active campaign Top serp_top_n into campaign_tracked_pins', async () => {
  const executed = [];
  const sql = createMockSql((query, values) => {
    executed.push({ query, values });
    if (/SELECT\s+kf\.id/i.test(query)) {
      assert.match(query, /kf\.metadata->>'status'/i, 'Must filter active campaigns via PG16 kf.metadata');
      return [
        { folder_id: 11, workspace_id: 1, serp_top_n: 15 },
        { folder_id: 22, workspace_id: 2, serp_top_n: 30 }
      ];
    }
    if (/INSERT INTO campaign_tracked_pins/i.test(query)) {
      assert.match(query, /source_type/i);
      assert.match(query, /'search'/i);
      assert.match(query, /ON CONFLICT \(folder_id, pin_id, source_type\) DO UPDATE/i);
      const limitVal = values[1];
      return Array.from({ length: Math.min(limitVal, 4) }, (_, idx) => ({ pin_id: `90000${idx}` }));
    }
    return [];
  });

  const res = await syncKeywordTopNIntoCampaigns(sql, 77);
  assert.equal(res.campaigns, 2);
  assert.equal(res.synced, 8);
  const inserts = executed.filter((e) => /INSERT INTO campaign_tracked_pins/i.test(e.query));
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].values[2], 11);
  assert.equal(inserts[0].values[1], 15);
  assert.equal(inserts[1].values[2], 22);
  assert.equal(inserts[1].values[1], 30);

  // Graceful fallback on missing table (42P01)
  const sqlMissing = createMockSql(() => {
    const err = new Error('relation "campaign_tracked_pins" does not exist');
    err.code = '42P01';
    throw err;
  });
  const missingRes = await syncKeywordTopNIntoCampaigns(sqlMissing, 77);
  assert.deepEqual(missingRes, { campaigns: 0, synced: 0 });
});

test('Wave 4 Pillar 2: fetchWatchlistPinsForWorker shards workspace_watchlist pins and falls back on 42P01', async () => {
  const sqlOk = createMockSql((query, values) => {
    assert.match(query, /FROM\s+workspace_watchlist/i);
    assert.match(query, /entity_type\s*=\s*'pin'/i);
    assert.equal(values[0], 4);
    assert.equal(values[1], 2);
    return [{ pin_id: '888888888', save_count: 42, repin_count: 19, daily_save_velocity: 4 }];
  });

  const rows = await fetchWatchlistPinsForWorker(sqlOk, { workerIndex: 2, workerTotal: 4 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pin_id, '888888888');

  const sqlMissing = createMockSql(() => {
    const err = new Error('relation "workspace_watchlist" does not exist');
    err.code = '42P01';
    throw err;
  });
  assert.deepEqual(await fetchWatchlistPinsForWorker(sqlMissing, { workerIndex: 0, workerTotal: 1 }), []);

  // Fleet Stage 0 script includes workspace_watchlist pin count
  const fleetSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-fleet.mjs'), 'utf8');
  assert.match(fleetSrc, /workspace_watchlist/);
  assert.match(fleetSrc, /entity_type\s*=\s*'pin'/);
});

// =========================================================================
// PILLAR 2: WATCHLIST CREATOR TRACKING MODES + DISCOVER EXTRACTION TARGETS
// =========================================================================

test('Wave 4 Pillar 2: Watchlist creator_tracking_mode overrides metrics_only vs metrics_full_catalog cleanly', async () => {
  const sql = createMockSql((query) => {
    assert.match(query, /FROM\s+workspace_watchlist/i);
    assert.match(query, /entity_type\s*=\s*'creator'/i);
    return [
      { username: 'chefamelia', wants_full: true },
      { username: 'quickpulsecreator', wants_full: false }
    ];
  });

  const modeMap = await loadWatchlistCreatorModes(sql);
  assert.equal(modeMap.get('chefamelia'), 'metrics_full_catalog');
  assert.equal(modeMap.get('quickpulsecreator'), 'metrics_only');

  // 1. Watchlisted with metrics_full_catalog forces full catalog even if profile tracking_mode was pulse_only
  const fullRes = resolveEffectiveCreatorTrackingMode({ username: 'chefamelia', tracking_mode: 'pulse_only' }, modeMap);
  assert.equal(fullRes.isPulseOnly, false);
  assert.equal(fullRes.source, 'workspace_watchlist');

  // 2. Watchlisted with metrics_only stays fast pulse-only (Zero full catalog scraping)
  const pulseRes = resolveEffectiveCreatorTrackingMode({ username: 'quickpulsecreator', tracking_mode: 'full_catalog' }, modeMap);
  assert.equal(pulseRes.isPulseOnly, true);
  assert.equal(pulseRes.source, 'workspace_watchlist');

  // 3. Non-watchlisted falls back to competitor_profiles.tracking_mode (Lock 7 preserved)
  assert.equal(
    resolveEffectiveCreatorTrackingMode({ username: 'legacy_pulse', tracking_mode: 'pulse_only' }, modeMap).isPulseOnly,
    true
  );
  assert.equal(
    resolveEffectiveCreatorTrackingMode({ username: 'legacy_full', tracking_mode: 'full_catalog' }, modeMap).isPulseOnly,
    false
  );

  // 42P01 fallback
  const sqlMissing = createMockSql(() => {
    const err = new Error('relation "workspace_watchlist" does not exist');
    err.code = '42P01';
    throw err;
  });
  const emptyMap = await loadWatchlistCreatorModes(sqlMissing);
  assert.equal(emptyMap.size, 0);
});

test('Wave 4 Pillar 2: applyWorkspaceExtractionTargetsToSettings wires workspace_settings.extraction_targets without overriding explicit run overrides', () => {
  const baseSettings = {
    discovery: {
      surfaces: {
        pin_serp_capsules: { enabled: true, target_pins: 250 },
        fresh_boards: { enabled: true, max_boards_to_expand: 6, target_pins_per_board: 80 },
        board_more_ideas: { enabled: true, target_pins_per_board: 80 },
        board_feed: { enabled: true, target_pins_per_board: 80 },
        ideas_feeds: { enabled: true, target_pins: 120 },
        home_feed: { enabled: false, target_pins: 80 },
        related_pin_snowball: { enabled: false, target_pins: 100 }
      }
    }
  };

  const wsSettings = {
    extraction_targets: {
      search: { enabled: true, target_pins: 600 },
      boards: { enabled: true, max_boards: 12, target_pins_per_board: 150 },
      idea_page: { enabled: true, target_pins: 220 },
      home_feed: { enabled: true, target_pins: 160 },
      related_pins: { enabled: true, target_pins: 310 }
    }
  };

  // Without explicit overrides -> all 5 surfaces adopt workspace targets
  const appliedAll = applyWorkspaceExtractionTargetsToSettings(baseSettings, wsSettings, {});
  assert.equal(appliedAll.discovery.surfaces.pin_serp_capsules.target_pins, 600);
  assert.equal(appliedAll.discovery.surfaces.fresh_boards.max_boards_to_expand, 12);
  assert.equal(appliedAll.discovery.surfaces.fresh_boards.target_pins_per_board, 150);
  assert.equal(appliedAll.discovery.surfaces.board_feed.target_pins_per_board, 150);
  assert.equal(appliedAll.discovery.surfaces.ideas_feeds.target_pins, 220);
  assert.equal(appliedAll.discovery.surfaces.home_feed.enabled, true);
  assert.equal(appliedAll.discovery.surfaces.home_feed.target_pins, 160);
  assert.equal(appliedAll.discovery.surfaces.related_pin_snowball.enabled, true);
  assert.equal(appliedAll.discovery.surfaces.related_pin_snowball.target_pins, 310);

  // Explicit per-run override on pin_serp_capsules wins over workspace_settings
  const appliedPartial = applyWorkspaceExtractionTargetsToSettings(
    {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, target_pins: 900 },
          fresh_boards: { enabled: true, max_boards_to_expand: 5, target_pins_per_board: 60 }
        }
      }
    },
    wsSettings,
    { discovery: { surfaces: { pin_serp_capsules: { target_pins: 900 } } } }
  );
  assert.equal(appliedPartial.discovery.surfaces.pin_serp_capsules.target_pins, 900);
  assert.equal(appliedPartial.discovery.surfaces.fresh_boards.target_pins_per_board, 150);
});

// =========================================================================
// PILLAR 1: PIN GRAPH EXECUTION & ZERO AUTO-PROMOTE GUARD
// =========================================================================

test('Wave 4 Pillar 1: Pin Graph rules enforce Zero Auto-Promote default, min_repins, linkless_only, and CHECK statuses', async () => {
  // 1. Default merge enforces auto_trigger_enabled = false (matches DEFAULT_WORKSPACE_SETTINGS)
  const defaultMerged = mergeCampaignPinGraphRules(null, null);
  assert.equal(defaultMerged.auto_trigger_enabled, false);
  assert.equal(defaultMerged.linkless_only, false);
  assert.equal(defaultMerged.min_repins, 500);
  assert.equal(defaultMerged.max_pages, 20);

  // Campaign override beats workspace default
  const overridden = mergeCampaignPinGraphRules(
    { auto_trigger_enabled: false, linkless_only: false, min_repins: 20, max_pages: 4 },
    { auto_trigger_enabled: true, linkless_only: true, min_repins: 100, max_pages: 8 }
  );
  assert.equal(overridden.auto_trigger_enabled, true);
  assert.equal(overridden.linkless_only, true);
  assert.equal(overridden.min_repins, 100);
  assert.equal(overridden.max_pages, 8);

  // 2. Candidate filtering (min_repins + linkless_only)
  const candidates = [
    { pin_id: '100100000001', repin_count: 150, save_count: 20, destination_url: '' },
    { pin_id: '100200000002', repin_count: 200, save_count: 50, destination_url: 'https://example.com/recipe', domain: 'example.com' },
    { pin_id: '100300000003', repin_count: 40, save_count: 10, destination_url: '' }
  ];
  const qualified = candidates.filter((c) => evaluatePinGraphCandidateRules(c, {
    linkless_only: true,
    min_repins: 100
  }));
  assert.deepEqual(qualified.map((c) => c.pin_id), ['100100000001']);

  // 3. Zero Auto-Promote: recordCampaignRelatedPins does NOTHING when auto_trigger_enabled is false
  let insertCalled = false;
  const sqlNoAuto = createMockSql(() => {
    insertCalled = true;
    return [];
  });
  const skipped = await recordCampaignRelatedPins(sqlNoAuto, {
    folderId: 7,
    workspaceId: 1,
    seedPinId: '999999999999',
    candidates,
    rules: { auto_trigger_enabled: false, min_repins: 0, linkless_only: false }
  });
  assert.equal(skipped.tracked, 0);
  assert.equal(skipped.skippedReason, 'auto_trigger_disabled');
  assert.equal(insertCalled, false, 'MUST NOT insert into campaign_tracked_pins when auto_trigger_enabled is false');

  // 4. When auto_trigger_enabled is true, inserts qualified pins with source_type = 'related'
  let capturedPinIds = [];
  const sqlAuto = createMockSql((query, values) => {
    if (/INSERT INTO campaign_tracked_pins/i.test(query)) {
      assert.match(query, /'related'/);
      capturedPinIds = values[2];
      return capturedPinIds.map((id) => ({ pin_id: id }));
    }
    return [];
  });
  const promoted = await recordCampaignRelatedPins(sqlAuto, {
    folderId: 7,
    workspaceId: 1,
    seedPinId: '999999999999',
    candidates,
    rules: { auto_trigger_enabled: true, linkless_only: true, min_repins: 100 }
  });
  assert.equal(promoted.tracked, 1);
  assert.equal(promoted.skippedReason, null);
  assert.deepEqual(capturedPinIds, ['100100000001']);

  // 5. Status updates strictly conform to Migration 012 CHECK ('queued' | 'crawled' | 'failed')
  const statusWrites = [];
  const sqlStatus = createMockSql((query, values) => {
    statusWrites.push({ query, values });
    return [];
  });
  await markCampaignPinGraphSeedStatus(sqlStatus, { folderId: 7, seedPinId: '555555555555', status: 'crawled' });
  await markCampaignPinGraphSeedStatus(sqlStatus, { folderId: 7, seedPinId: '555555555556', status: 'failed' });
  await markCampaignPinGraphSeedStatus(sqlStatus, { folderId: 7, seedPinId: '555555555557', status: 'invalid_status' });
  assert.equal(statusWrites[0].values[0], 'crawled');
  assert.equal(statusWrites[1].values[0], 'failed');
  assert.equal(statusWrites[2].values[0], 'failed', 'Unknown status must coerce safely to failed (never violating CHECK)');

  // 6. fetchQueuedCampaignPinGraphSeeds hydrates merged rules + workspace_id using PG16 kf.metadata predicate
  const sqlSeeds = createMockSql((query) => {
    assert.match(query, /FROM\s+campaign_pin_graph_seeds/i);
    assert.match(query, /status\s*=\s*'queued'/i);
    assert.match(query, /kf\.metadata->>'status'/i, 'Must filter active campaigns via PG16 kf.metadata');
    return [{
      folder_id: 14,
      pin_id: '555555555555',
      source_type: 'manual',
      status: 'queued',
      workspace_id: 3,
      folder_name: 'Autumn Soups',
      folder_pin_graph_rules: { max_pages: 7 },
      workspace_pin_graph_rules: { min_repins: 25, auto_trigger_enabled: false }
    }];
  });
  const seeds = await fetchQueuedCampaignPinGraphSeeds(sqlSeeds, { limit: 10, pinIds: ['555555555555'] });
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].is_campaign_seed, true);
  assert.equal(seeds[0].workspace_id, 3);
  assert.equal(seeds[0].pin_graph_rules.max_pages, 7);
  assert.equal(seeds[0].pin_graph_rules.min_repins, 25);
  assert.equal(seeds[0].pin_graph_rules.auto_trigger_enabled, false);
});

test('Wave 4 Phase 1.5: runPhase1ASerpHarvestForKeyword applies MAX(serp_top_n) + Top-N sync consistently across Modes A/B/C', async () => {
  const crawlCalls = [];
  const sql = createMockSql((query) => {
    if (/MAX\(COALESCE\(kf\.serp_top_n/i.test(query)) {
      return [{ max_top_n: 40 }];
    }
    if (/SELECT\s+kf\.id/i.test(query)) {
      return [{ folder_id: 9, workspace_id: 1, serp_top_n: 40 }];
    }
    if (/INSERT INTO campaign_tracked_pins/i.test(query)) {
      return [{ pin_id: '7001' }, { pin_id: '7002' }];
    }
    return [];
  });

  const dynamicRun = await runPhase1ASerpHarvestForKeyword(sql, 55, {
    cookie: null,
    explicitMaxSerpPins: null,
    leaseToken: 'tok-1',
    crawlFn: async (_s, kid, opts) => {
      crawlCalls.push({ kid, opts });
      return { crawled_pins: 40 };
    }
  });
  assert.equal(dynamicRun.dynamicMaxTopN, 40);
  assert.equal(dynamicRun.resolvedSerpQuota, 40);
  assert.equal(crawlCalls[0].opts.max_serp_pins, 40);
  assert.equal(dynamicRun.syncRes.campaigns, 1);
  assert.equal(dynamicRun.syncRes.synced, 2);

  // Explicit MAX_SERP_PINS override skips dynamic MAX(serp_top_n) lookup but still syncs Top-N campaigns
  const explicitRun = await runPhase1ASerpHarvestForKeyword(sql, 55, {
    cookie: null,
    explicitMaxSerpPins: 25,
    crawlFn: async (_s, kid, opts) => {
      crawlCalls.push({ kid, opts });
      return { crawled_pins: 25 };
    }
  });
  assert.equal(explicitRun.dynamicMaxTopN, null);
  assert.equal(explicitRun.resolvedSerpQuota, 25);
  assert.equal(crawlCalls[1].opts.max_serp_pins, 25);
  assert.equal(explicitRun.syncRes.synced, 2);

  // Verify Mode B, Mode C, and Mode A all invoke runPhase1ASerpHarvestForKeyword
  const kwWorkerSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-velocity-crawler.mjs'), 'utf8');
  const helperUsages = (kwWorkerSrc.match(/await runPhase1ASerpHarvestForKeyword\(/g) || []).length;
  assert.equal(helperUsages, 3, 'Modes A, B, and C must all invoke runPhase1ASerpHarvestForKeyword');
});

test('Wave 4 Phase 1.5: cluster-intelligence fetchWithRetry enforces PinterestCircuitBreaker on 429/403 and resets on success', async () => {
  const breaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60000 });
  let callCount = 0;
  await assert.rejects(
    () => fetchWithRetry('https://www.pinterest.com/resource/RelatedModulesResource/get/', {}, 5, {
      circuitBreaker: breaker,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        callCount++;
        return { status: 429, ok: false, statusText: 'Too Many Requests', body: { cancel: async () => {} } };
      }
    }),
    (err) => err instanceof CircuitBreakerOpenError && err.code === 'CIRCUIT_BREAKER_OPEN'
  );
  assert.equal(callCount, 2, 'Breaker must trip OPEN on 2nd consecutive 429 instead of looping all 5 retries');
  assert.equal(breaker.state, 'OPEN');

  // Subsequent request immediately rejects without hitting fetchImpl while OPEN
  await assert.rejects(
    () => fetchWithRetry('https://www.pinterest.com/resource/RelatedModulesResource/get/', {}, 3, {
      circuitBreaker: breaker,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        callCount++;
        return { status: 200, ok: true, json: async () => ({}) };
      }
    }),
    CircuitBreakerOpenError
  );
  assert.equal(callCount, 2, 'OPEN breaker must short-circuit before calling fetch');
});

test('Wave 4 Phase 1.5: creator-velocity-crawler enforces strict Workspace 2+ cookie isolation, bounded maxBoards/maxDurationMs, and preserves tracking_mode', async () => {
  const sqlCtx = createMockSql(() => [
    { username: 'ws2creator', wants_full: true, primary_workspace_id: 2 },
    { username: 'ws1creator', wants_full: false, primary_workspace_id: 1 }
  ]);
  const { modeMap, workspaceMap } = await loadWatchlistCreatorContext(sqlCtx);
  assert.equal(modeMap.get('ws2creator'), 'metrics_full_catalog');
  assert.equal(workspaceMap.get('ws2creator'), 2);
  assert.equal(workspaceMap.get('ws1creator'), 1);

  // Workspace 2 with NO saved cookie MUST NOT inherit Workspace 1 / global fallback cookie
  const ws2NoCookie = await resolveCreatorSyncCookieAndBounds(null, {}, {
    acc: { username: 'ws2creator' },
    workspaceId: 2,
    fallbackCookie: '_pinterest_sess=WS1_GLOBAL_SECRET_COOKIE',
    resolveCookieFn: async () => ({ rawCookie: '', source: 'none' })
  });
  assert.equal(ws2NoCookie.cookie, '', 'Workspace 2 MUST NOT inherit global/WS1 fallback cookie');
  assert.equal(ws2NoCookie.workspaceId, 2);
  assert.equal(ws2NoCookie.maxBoards, 60);
  assert.equal(ws2NoCookie.maxDurationMs, 6 * 60 * 1000);

  // Workspace 2 WITH its own saved cookie uses it cleanly
  const ws2WithCookie = await resolveCreatorSyncCookieAndBounds(null, { CREATOR_MAX_BOARDS: '45', CREATOR_MAX_DURATION_MS: '180000' }, {
    acc: { username: 'ws2creator', qualification_rules: { max_pages: 120 } },
    workspaceId: 2,
    fallbackCookie: '_pinterest_sess=WS1_GLOBAL_SECRET_COOKIE',
    resolveCookieFn: async () => ({ rawCookie: '_pinterest_sess=WS2_ISOLATED_COOKIE', source: 'workspace:2:pinterest_cookie_enc' })
  });
  assert.equal(ws2WithCookie.cookie, '_pinterest_sess=WS2_ISOLATED_COOKIE');
  assert.equal(ws2WithCookie.maxPages, 120);
  assert.equal(ws2WithCookie.maxBoards, 45);
  assert.equal(ws2WithCookie.maxDurationMs, 180000);

  // Phase 1A must preserve acc.tracking_mode instead of hardcoding 'pulse_only'
  const creatorWorkerSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert.match(creatorWorkerSrc, /const nextTrackingMode = acc\.tracking_mode \|\| 'pulse_only';/);
});

// =========================================================================
// PILLAR 3: CAMPAIGNS STUDIO & /pin/:id V4 ACTIONS
// =========================================================================

test('Wave 4 Pillar 3: POST /api/folders inherits workspace_settings.default_serp_top_n when serp_top_n is omitted', async () => {
  let capturedSerpTopN = null;
  const sql = createMockSql((query, values) => {
    if (/FROM\s+workspace_settings/i.test(query)) {
      return [{
        workspace_id: 2,
        default_serp_top_n: 35,
        extraction_targets: {},
        pin_graph_rules: {},
        alert_thresholds: {}
      }];
    }
    if (/INSERT INTO keyword_folders/i.test(query)) {
      // Capture serp_top_n passed to createFolder insert
      capturedSerpTopN = values.find((v) => v === 35) ?? null;
      return [{
        id: 88,
        name: 'Winter Soups',
        slug: 'winter-soups',
        workspace_id: 2,
        serp_top_n: 35,
        color: '#6366F1',
        description: '',
        metadata: {}
      }];
    }
    return [];
  });

  const req = new Request('https://app.hymum.com/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Winter Soups' })
  });

  let statusCode = 0;
  let payload = null;
  await handleFoldersRoutes({
    pathname: '/api/folders',
    method: 'POST',
    request: req,
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql,
    workspaceId: 2,
    jsonResponse: (data, status = 200) => {
      statusCode = status;
      payload = data;
      return { status, data };
    },
    methodNotAllowedResponse: () => ({ status: 405 }),
    invalidateEdgeCache: () => {}
  });

  assert.equal(statusCode, 200);
  assert.equal(payload?.success, true);
  assert.equal(capturedSerpTopN, 35, 'POST /api/folders must inherit workspace_settings.default_serp_top_n (35)');

  // Verify POST /api/folders clamps inherited default_serp_top_n into [5..100] (aligned with Room 5 & folders-crud.mjs)
  let clampedTopN = null;
  const sqlClamp = createMockSql((query, values) => {
    if (/FROM\s+workspace_settings/i.test(query)) {
      return [{ workspace_id: 2, default_serp_top_n: 150, extraction_targets: {}, pin_graph_rules: {}, alert_thresholds: {} }];
    }
    if (/INSERT INTO keyword_folders/i.test(query)) {
      clampedTopN = values.find((v) => v === 100) ?? null;
      return [{ id: 89, name: 'Clamped', slug: 'clamped', workspace_id: 2, serp_top_n: 100, color: '#6366F1', description: '', metadata: {} }];
    }
    return [];
  });
  await handleFoldersRoutes({
    pathname: '/api/folders',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Clamped' })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: sqlClamp,
    workspaceId: 2,
    jsonResponse: (data, status = 200) => ({ status, data }),
    methodNotAllowedResponse: () => ({ status: 405 }),
    invalidateEdgeCache: () => {}
  });
  assert.equal(clampedTopN, 100, 'Inherited workspace_settings.default_serp_top_n must clamp to [5..100]');

  // Verify POST /api/folders/:id/pin-graph-seeds forwards source_type (e.g. 'trigger')
  let capturedSeedSource = null;
  const sqlSeedPost = createMockSql((query, values) => {
    if (/FROM\s+keyword_folders/i.test(query)) {
      return [{ id: 88, workspace_id: 2 }];
    }
    if (/INSERT INTO campaign_pin_graph_seeds/i.test(query)) {
      capturedSeedSource = values[2];
      return [{ seed_pin_id: '123456789012', source_type: capturedSeedSource, status: 'queued' }];
    }
    return [];
  });
  let seedPostPayload = null;
  await handleFoldersRoutes({
    pathname: '/api/folders/88/pin-graph-seeds',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/folders/88/pin-graph-seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_ids: ['123456789012'], source_type: 'trigger' })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: sqlSeedPost,
    workspaceId: 2,
    jsonResponse: (data, status = 200) => { seedPostPayload = data; return { status, data }; },
    methodNotAllowedResponse: () => ({ status: 405 }),
    invalidateEdgeCache: () => {}
  });
  assert.equal(seedPostPayload?.source_type, 'trigger', 'POST /api/folders/:id/pin-graph-seeds must forward source_type');
});

test('Wave 4 Pillar 3: Campaigns Studio & Pin Dossier SSR templates expose V4 controls with zero duplicate cookies and byte budgets intact', () => {
  const campaignsHtml = getCampaignFoldersPageHtml();
  const campaignsBytes = Buffer.byteLength(campaignsHtml, 'utf8');
  assert.ok(campaignsBytes < 215 * 1024, `/campaigns HTML (${campaignsBytes} bytes) must stay under 215 KB`);
  assert.match(campaignsHtml, /Pin Graph Seeds/);
  assert.match(campaignsHtml, /Pin Graph Rules \(Related Pins\)/);
  assert.match(campaignsHtml, /href="\/settings"/);
  assert.doesNotMatch(campaignsHtml, /folderNewbornCookieInput/, 'Legacy duplicate cookie textarea must be removed from Campaign Settings');
  assert.doesNotMatch(campaignsHtml, /fetchPinterestCookieStatus|savePinterestCookie/, 'Dead legacy cookie client methods must be removed from Campaigns Studio');

  const pinHtml = getPinDetailPageHtml('123456789012');
  assert.match(pinHtml, /savePinToWatchlist\(\)/, 'Pin Dossier must expose V4 Watchlist action');
  assert.match(pinHtml, /openV4CampaignModal\(\)/, 'Pin Dossier must expose V4 Campaign / Seed modal trigger');
  assert.match(pinHtml, /addPinToSpecificCampaign\(/, 'Pin Dossier must support one-click Add to Campaign Tracking in checklist modal');
  assert.match(pinHtml, /queuePinAsGraphSeed\(\)/, 'Pin Dossier must support Queue Pin Graph Seed');
  assert.match(pinHtml, /getBackUrl\(\)/, 'Pin Dossier must preserve getBackUrl()');
  assert.match(pinHtml, /Live Deep Sync/, 'Pin Dossier must preserve Live Deep Sync');
  assert.match(pinHtml, /Purge Pin/, 'Pin Dossier must preserve Purge Pin');
});
