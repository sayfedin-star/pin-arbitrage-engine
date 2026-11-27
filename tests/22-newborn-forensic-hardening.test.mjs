/**
 * tests/22-newborn-forensic-hardening.test.mjs
 *
 * Behavioral unit & integration tests for the Discover on Newboard Forensic Audit
 * & 5 Approved Product/Architecture Directives:
 * 1. Directive 1: Uncapped Cluster Explorer & Cluster Basket (>100 keywords), Select All,
 *    Two-Way Sync, Fleet (20 Runners) default, uncapped /folders/:id/items & fleet runs.
 * 2. Directive 2: Enrich Remaining Volumes truth (HTTP 200 vs 404 vs 429/5xx volume_error),
 *    official interest_id/idea_url resolution, Auto-Batch Loop + Stop + Retry.
 * 3. Directive 3: Hydration cap removal (UI & backend), DB Pre-Hydration reuse from
 *    newborn_candidates + universal_master_pins, uncapped PinResource/get hydration.
 * 4. Directive 4: DISCOVERY SOURCE multi-surface attribution, zero 'pin_resource' leakage,
 *    discovery_board_* vs pin_board_* separation, BoardResource/get URL resolution,
 *    Pidgets effective_creator_followers & Guest Mode board_feed fallback.
 * 5. Directive 5: Atomic unified Send to Campaign + Track Daily (zero ghost rows),
 *    instant + Create New Campaign modal across all 3 Discover selectors, workspace isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  resolveInterestLookupTarget,
  enrichClusterRemainingVolumes
} from '../src/modules/newborn/cluster-builder.mjs';
import { harvestGrowingTrendsSurface } from '../src/modules/newborn/surface-trends.mjs';
import {
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from '../src/modules/newborn/surface-normalizers.mjs';
import {
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie
} from '../src/modules/newborn/surface-hydrators.mjs';
import { harvestBoardMoreIdeasSurface } from '../src/modules/newborn/surface-search-boards.mjs';
import { NewbornCookieRouter } from '../src/modules/newborn/cookie-router.mjs';
import { PinterestCircuitBreaker } from '../src/core/pinterest/client.mjs';
import {
  executeNewbornHarvestPipeline,
  upsertStagedCandidatesBatch
} from '../src/modules/newborn/harvester.mjs';
import { promoteNewbornCandidates } from '../src/modules/newborn/promotions.mjs';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  addCampaignTrackedPins
} from '../src/modules/workspaces/service.mjs';
import {
  buildNewbornDedupeKey,
  createFleetBackedNewbornRun
} from '../src/modules/newborn/run-queue.mjs';
import {
  computeEstimatedPinBudget,
  resolveExecutionMode
} from '../src/routes/newborn.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { parseNewbornFleetArgs } from '../scripts/newborn-fleet.mjs';
import { resolvePinKeywordId, syncKeywordTopNIntoCampaigns } from '../scripts/keyword-velocity-crawler.mjs';
import { ingestPinsBatch } from '../src/modules/pins/repository.mjs';
import { getPinDossier } from '../src/modules/pins/dossier-reader.mjs';
import {
  deleteNewbornRunsBulk,
  getNewbornCrossoverReport,
  listNewbornCandidates,
  updateNewbornCandidateStage
} from '../src/modules/newborn/queries.mjs';
import {
  createNewbornRuleProfile,
  getNewbornSettings,
  listNewbornRuleProfiles
} from '../src/modules/newborn/settings.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';

function makeJsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function makeFakeSql(handler) {
  const calls = [];
  const fn = async (strings, ...values) => {
    const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    const entry = { query, values };
    calls.push(entry);
    return handler ? handler(entry, calls) : [];
  };
  fn.calls = calls;
  fn.begin = async (cb) => cb(fn);
  return fn;
}

function createDiscoverAppVm() {
  const rawScript = getNewbornClientAppScript().trim();
  const script = rawScript.replace(/^<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '');
  const sandbox = {
    window: {
      location: { pathname: '/discover', search: '', href: 'http://localhost/discover' },
      history: { replaceState() {} },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {}
    },
    document: {
      addEventListener() {},
      querySelector: () => null,
      createElement: () => ({ click() {}, setAttribute() {} }),
      body: { appendChild() {}, removeChild() {} }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    fetch: async () => makeJsonResponse({ success: true })
  };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(script, sandbox);
  const app = sandbox.newbornStudioApp('', 'hunt');
  app.toast = () => {};
  app.refreshIcons = () => {};
  return app;
}

// ---------------------------------------------------------------------------
// 1. Directive 2: Interest lookup URL/ID resolution + truthful Volume Enrichment + Retry
// ---------------------------------------------------------------------------
test('Directive 2: resolveInterestLookupTarget uses official idea_url/interest_id and enrichClusterRemainingVolumes distinguishes 200 vs 404 vs transient 429/500 errors', async () => {
  assert.deepEqual(
    resolveInterestLookupTarget({ keyword: "Valentine's Day Nails", interest_id: '912345678', idea_url: '' }),
    { slug: 'valentines-day-nails', interestId: '912345678', sourceUrl: '/ideas/valentines-day-nails/912345678/' }
  );
  assert.deepEqual(
    resolveInterestLookupTarget({ keyword: 'high protein', idea_url: '/ideas/high-protein-recipes/9456123/' }),
    { slug: 'high-protein-recipes', interestId: '9456123', sourceUrl: '/ideas/high-protein-recipes/9456123/' }
  );
  assert.deepEqual(
    resolveInterestLookupTarget({ keyword: '30 minute dinners' }),
    { slug: '30-minute-dinners', interestId: '', sourceUrl: '/ideas/30-minute-dinners/' }
  );

  // Cluster with 3 unenriched keywords:
  // 1) 'matcha latte' -> HTTP 200 with search_volume = 120000 -> volume_enriched=true, volume=120000, volume_error=false
  // 2) 'obscure non taxonomy' -> HTTP 404 -> volume_enriched=true, volume=null, volume_error=false
  // 3) 'rate limited term' -> HTTP 429 -> volume_enriched=false (NOT poisoned!), volume_error=true
  let storedKeywords = [
    { keyword: 'matcha latte', interest_id: '900111222', idea_url: '/ideas/matcha-latte/900111222/', volume: null, volume_enriched: false },
    { keyword: 'obscure non taxonomy', volume: null, volume_enriched: false },
    { keyword: 'rate limited term', volume: null, volume_enriched: false }
  ];

  const sql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_keyword_clusters') && entry.query.includes('WHERE id =')) {
      return [{
        id: 77,
        workspace_id: 1,
        seed_keyword: 'matcha',
        country: 'US',
        keywords: storedKeywords,
        telemetry: {}
      }];
    }
    if (entry.query.includes('UPDATE newborn_keyword_clusters')) {
      const jsonArg = entry.values.find((v) => typeof v === 'string' && v.trim().startsWith('['));
      if (jsonArg) storedKeywords = JSON.parse(jsonArg);
      return [{ id: 77 }];
    }
    return [];
  });

  const makeFetch = (retrySucceeds = false) => async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('InterestResource/get') && u.includes('900111222')) {
      return makeJsonResponse({
        resource_response: { data: { id: '900111222', url_name: 'matcha-latte', internal_search_count: 120000 } }
      }, 200);
    }
    if (u.includes('InterestResource/get') && u.includes('obscure-non-taxonomy')) {
      return makeJsonResponse({ resource_response: { error: { message: 'Not found' } } }, 404);
    }
    if (u.includes('InterestResource/get') && u.includes('rate-limited-term')) {
      if (retrySucceeds) {
        return makeJsonResponse({
          resource_response: { data: { id: '900333444', url_name: 'rate-limited-term', internal_search_count: 85000 } }
        }, 200);
      }
      return makeJsonResponse({ error: 'Too many requests' }, 429);
    }
    return makeJsonResponse({}, 404);
  };

  const pass1 = await enrichClusterRemainingVolumes(sql, 77, {
    batchLimit: 50,
    workspaceId: 1,
    routerOptions: {
      rawCookie: '',
      circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
      fetchImpl: makeFetch(false)
    }
  });

  assert.equal(pass1.newly_enriched_count, 2, '200 OK and confirmed 404 both count as resolved');
  assert.equal(pass1.failed_volume_count, 1);
  assert.equal(pass1.remaining_unenriched_count, 1, 'Failed 429 term must remain unenriched for retry');

  const matchaRow = storedKeywords.find((k) => k.keyword === 'matcha latte');
  const obscureRow = storedKeywords.find((k) => k.keyword === 'obscure non taxonomy');
  const failedRow = storedKeywords.find((k) => k.keyword === 'rate limited term');

  assert.equal(matchaRow.volume_enriched, true);
  assert.equal(matchaRow.volume, 120000);
  assert.equal(matchaRow.volume_error, false);

  assert.equal(obscureRow.volume_enriched, true);
  assert.equal(obscureRow.volume, null);
  assert.equal(obscureRow.volume_error, false);

  assert.equal(failedRow.volume_enriched, false, 'HTTP 429 MUST NOT poison volume_enriched=true');
  assert.equal(failedRow.volume_error, true);

  // Retry pass targeting only failed keywords succeeds cleanly
  const pass2 = await enrichClusterRemainingVolumes(sql, 77, {
    retryErrorsOnly: true,
    workspaceId: 1,
    routerOptions: {
      rawCookie: '',
      circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
      fetchImpl: makeFetch(true)
    }
  });

  assert.equal(pass2.newly_enriched_count, 1);
  assert.equal(pass2.failed_volume_count, 0);
  assert.equal(pass2.remaining_unenriched_count, 0);
  const recoveredRow = storedKeywords.find((k) => k.keyword === 'rate limited term');
  assert.equal(recoveredRow.volume_enriched, true);
  assert.equal(recoveredRow.volume, 85000);
  assert.equal(recoveredRow.volume_error, false);
});

// ---------------------------------------------------------------------------
// 2. Trends `hasPrediction` false-positive fix
// ---------------------------------------------------------------------------
test('Trends parser: has_prediction is false when seasonality_score exists without prediction fields, and propagates predicted_90d_growth', async () => {
  const router = new NewbornCookieRouter({
    rawCookie: '',
    circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('latest_available_date')) {
        return makeJsonResponse({ latest_available_date: '2026-11-20' });
      }
      return makeJsonResponse({
        trends: [
          { term: 'seasonal pumpkin soup', seasonality_score: 0.92, wow_change: 12 },
          { term: 'predicted winter nails', predicted_peak_date: '2026-12-20', predicted_90d_growth: 64 }
        ]
      });
    }
  });

  const res = await harvestGrowingTrendsSurface(router, { limit: 10 });
  const seasonal = res.trends.find((t) => t.term === 'seasonal pumpkin soup');
  const predicted = res.trends.find((t) => t.term === 'predicted winter nails');

  assert.equal(seasonal.has_prediction, false, 'seasonality_score alone must not trigger Forecast/has_prediction');
  assert.equal(seasonal.seasonality_score, 0.92);
  assert.equal(predicted.has_prediction, true);
  assert.equal(predicted.predicted_90d_growth, 64);
  assert.equal(predicted.predicted_peak_date, '2026-12-20');
});

// ---------------------------------------------------------------------------
// 3. Directive 4: Zero 'pin_resource', Discovery Board vs Pin Board separation, Pidgets followers, Board URL resolution
// ---------------------------------------------------------------------------
test('Directive 4: separates discovery_board_* from pin_board_*, strips pin_resource, fixes Pidgets effective_creator_followers, and resolves board URL IDs', async () => {
  // 1) Board Find More Ideas discovery pin (has discovery_board_name)
  const fromBoardDiscovery = normalizeSurfaceCandidatePin({
    id: '950000000000001',
    title: 'Viral Salad Bowl',
    link: 'https://www.pinterest.com/pin/950000000000001/',
    board: { name: 'Creator Personal Board', url: '/owner/creator-personal-board/' }
  }, {
    surface: 'board_more_ideas',
    discovery_board_name: 'Viral Dinner Ideas Discovery',
    discovery_board_url: 'https://www.pinterest.com/curator/viral-dinner-ideas/',
    seed_query: 'healthy salad'
  });

  assert.equal(fromBoardDiscovery.is_linkless, true, 'Internal pinterest.com link must be classified as linkless');
  assert.equal(fromBoardDiscovery.discovery_board_name, 'Viral Dinner Ideas Discovery');
  assert.equal(fromBoardDiscovery.pin_board_name, 'Creator Personal Board');
  assert.deepEqual(fromBoardDiscovery.discovered_surfaces, ['board_more_ideas']);

  // 2) PinResource/get hydration must NOT emit 'pin_resource' and must NOT overwrite discovery_board_name
  const router = new NewbornCookieRouter({
    rawCookie: '',
    circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('PinResource/get')) {
        return makeJsonResponse({
          resource_response: {
            data: {
              id: '950000000000001',
              title: 'Viral Salad Bowl Hydrated',
              created_at: 'Mon, 23 Nov 2026 10:00:00 +0000',
              repin_count: 85,
              board: { name: 'Owner Hydrated Board', url: '/owner/owner-hydrated-board/' },
              pinner: { username: 'salad_chef', follower_count: 450 },
              pin_join: { annotations_with_links: { 'Salad Bowl': '/ideas/salad-bowl/1/' } }
            }
          }
        });
      }
      if (u.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
        return makeJsonResponse({
          data: [{
            id: '950000000000001',
            repin_count: 92,
            pinner: { username: 'salad_chef', follower_count: 480 },
            board: { name: 'Pidgets Personal Board', url: '/owner/pidgets-personal/' }
          }]
        });
      }
      if (u.includes('BoardResource/get')) {
        return makeJsonResponse({
          resource_response: {
            data: { id: '777888999', name: 'Pasted Board Title', url: '/curator/pasted-board/' }
          }
        });
      }
      if (u.includes('BoardFeedResource/get')) {
        return makeJsonResponse({
          resource_response: {
            data: [{
              id: '950000000000009',
              title: 'Board Feed Guest Pin',
              board: { name: 'Personal Pin Board', url: '/a/b/' }
            }],
            bookmark: '-end-'
          }
        });
      }
      return makeJsonResponse({ resource_response: { data: [] } });
    }
  });

  const hyd = await hydratePinZeroCookie('950000000000001', router, { nowMs: Date.parse('2026-11-25T12:00:00Z'), resolveRootPin: false });
  assert.equal(hyd.ok, true);
  assert.ok(!hyd.pin.discovered_surfaces.includes('pin_resource'), 'hydratePinZeroCookie must never emit pin_resource');
  assert.equal(hyd.pin.pin_board_name, 'Owner Hydrated Board');

  const merged = mergeCandidatePinRecords(fromBoardDiscovery, hyd.pin);
  assert.equal(merged.discovery_board_name, 'Viral Dinner Ideas Discovery', 'Original discovery board must never be overwritten by pin owner board');
  assert.equal(merged.pin_board_name, 'Owner Hydrated Board');
  assert.ok(!merged.discovered_surfaces.includes('pin_resource'));
  assert.deepEqual(merged.discovered_surfaces, ['board_more_ideas']);

  // 3) Pidgets pre-triage populates effective_creator_followers and pin_board_name without touching discovery_board_name
  const pidgetsRes = await pretriageCandidatesWithPidgets(['950000000000001'], router);
  const pEntry = pidgetsRes.get('950000000000001');
  assert.equal(pEntry.effective_creator_followers, 480);
  assert.equal(pEntry.pin_board_name, 'Pidgets Personal Board');

  // 4) harvestBoardMoreIdeasSurface resolves missing board_id from pasted board URL via BoardResource/get
  const authRouter = new NewbornCookieRouter({
    rawCookie: 'TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA=',
    circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('BoardResource/get')) {
        return makeJsonResponse({
          resource_response: {
            data: { id: '777888999', name: 'Pasted Board Title', url: '/curator/pasted-board/' }
          }
        });
      }
      if (u.includes('BoardContentRecommendationResource/get')) {
        return makeJsonResponse({
          resource_response: {
            data: [{
              id: '950000000000009',
              title: 'Board More Ideas Pin',
              board: { name: 'Personal Pin Board', url: '/a/b/' }
            }],
            bookmark: '-end-'
          }
        });
      }
      return makeJsonResponse({ resource_response: { data: [] } });
    }
  });
  const boardRes = await harvestBoardMoreIdeasSurface(
    authRouter,
    { url: 'https://www.pinterest.com/curator/pasted-board/', name: '', seed_query: 'pasted board' },
    { maxPages: 1, pageSize: 25, targetPins: 10 }
  );
  assert.equal(boardRes.pins.length, 1);
  assert.equal(boardRes.pins[0].discovery_board_name, 'Pasted Board Title');
  assert.equal(boardRes.pins[0].pin_board_name, 'Personal Pin Board');
});

// ---------------------------------------------------------------------------
// 4. Directive 3: DB Pre-Hydration Cache Reuse + Uncapped Hydration
// ---------------------------------------------------------------------------
test('Directive 3: harvester pre-hydrates cached pins from DB and hydrates ALL remaining matched pins with zero artificial hydration cap', async () => {
  const nowMs = Date.parse('2026-11-25T12:00:00Z');
  const youngIso = new Date(nowMs - 4 * 86_400_000).toISOString();
  const youngUtc = new Date(nowMs - 4 * 86_400_000).toUTCString();

  // 6 pins pass Pidgets repin gate:
  // Pin 1 & Pin 2 are already hydrated in DB (newborn_candidates / universal_master_pins) -> MUST NOT call PinResource/get!
  // Pins 3..6 are unhydrated -> ALL 4 MUST hydrate even if legacy max_pin_hydrations_per_run=1 is passed!
  const serpPins = Array.from({ length: 6 }, (_, i) => ({
    id: `96000000000000${i + 1}`,
    title: `Breakout Pin ${i + 1}`,
    repin_count: 80 + i * 5
  }));

  const pinResourceCalledIds = new Set();
  const mockSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_candidates') && entry.query.includes('is_hydrated = TRUE')) {
      return [{
        pin_id: '960000000000001',
        created_at_pinterest: youngIso,
        visual_annotations: [{ name: 'Cached Tag 1' }],
        raw_creation_method: 'photos',
        upload_provenance: 'UPLOADED',
        is_hydrated: true,
        metadata: { root_age_verified: true }
      }];
    }
    if (entry.query.includes('FROM universal_master_pins')) {
      return [{
        pin_id: '960000000000002',
        created_at_pinterest: youngIso,
        visual_annotations: [{ name: 'Cached Tag 2' }],
        creation_method: 'uploaded',
        is_hydrated: true
      }];
    }
    if (entry.query.includes('INSERT INTO newborn_runs')) {
      return [{ id: 501 }];
    }
    return [];
  });

  const res = await executeNewbornHarvestPipeline(mockSql, {
    seedQueries: ['breakout pin'],
    nowMs,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 1, max_pins: 20 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          related_pin_snowball: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        },
        snowball: { enabled: false, max_hops: 0 },
        hydration: {
          enable_pidgets_pretriage: false,
          max_pin_hydrations_per_run: 1,
          auto_fetch_accounts: false
        }
      },
      qualification: { min_age_days: 0, max_age_days: 30, min_repin_count: 20, min_save_count: 0, resolve_root_pin: false }
    },
    routerOptions: {
      rawCookie: '',
      circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('BaseSearchResource/get')) {
          return makeJsonResponse({ resource_response: { data: { results: serpPins, guides: [] }, bookmark: '-end-' } });
        }
        if (u.includes('PinResource/get')) {
          const m = decodeURIComponent(u).match(/"id":"(\d+)"/);
          const pid = m ? m[1] : '';
          pinResourceCalledIds.add(pid);
          return makeJsonResponse({
            resource_response: {
              data: {
                id: pid,
                title: `Hydrated ${pid}`,
                created_at: youngUtc,
                repin_count: 90,
                pin_join: { annotations_with_links: { 'Live Tag': '/ideas/live-tag/1/' } }
              }
            }
          });
        }
        return makeJsonResponse({ resource_response: { data: [] } });
      }
    }
  });

  assert.equal(res.status, 'completed');
  assert.equal(res.funnel.db_pre_hydrated, 2, 'Pins 1 & 2 must be pre-hydrated from DB');
  assert.ok(!pinResourceCalledIds.has('960000000000001'), 'DB-cached newborn_candidate must skip PinResource/get');
  assert.ok(!pinResourceCalledIds.has('960000000000002'), 'DB-cached universal_master_pin must skip PinResource/get');
  assert.equal(pinResourceCalledIds.size, 4, 'ALL 4 remaining pins must hydrate without artificial cap');
  assert.equal(res.candidates.length, 6);
});

// ---------------------------------------------------------------------------
// 5. Directive 5: Unified Send to Campaign & Track Daily (Zero Ghost Rows)
// ---------------------------------------------------------------------------
test('Directive 5: addCampaignTrackedPins auto-promotes newborn pins into SSOT + daily anchors and promoteNewbornCandidates enrolls into campaign_tracked_pins', async () => {
  const executed = [];
  const sql = makeFakeSql((entry) => {
    executed.push(entry.query);
    if (entry.query.includes('FROM keyword_folders') && entry.query.includes('WHERE id =')) {
      return [{ id: 12, name: 'Q4 Viral Campaign', workspace_id: 1 }];
    }
    if (entry.query.includes('FROM newborn_candidates') && entry.query.includes('pin_id = ANY')) {
      return [{
        pin_id: '970000000000001',
        title: 'Unified Tracked Pin',
        image_url: 'https://i.pinimg.com/736x/a/b/c.jpg',
        repin_count: 140,
        save_count: 220,
        is_hydrated: true,
        visual_annotations: [{ name: 'Viral Recipe' }],
        seed_query: 'viral recipe',
        stage: 'discovered'
      }];
    }
    if (entry.query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ id: 1, folder_id: 12, workspace_id: 1, pin_id: '970000000000001', source_type: 'newborn' }];
    }
    if (entry.query.includes('INSERT INTO tracked_keywords')) {
      return [{ id: 88, keyword: 'viral recipe' }];
    }
    return [];
  });

  // Path A: Send to Campaign (`addCampaignTrackedPins` with sourceType='newborn')
  const sendRes = await addCampaignTrackedPins(sql, {
    folderId: 12,
    workspaceId: 1,
    pinIds: ['970000000000001'],
    sourceType: 'newborn',
    sourceRef: 'discover_bulk'
  });
  assert.equal(sendRes.added_count, 1);
  assert.equal(sendRes.promoted_from_newborn, 1);
  assert.ok(executed.some((q) => q.includes('INSERT INTO universal_master_pins')), 'Send to Campaign must promote into universal_master_pins');
  assert.ok(executed.some((q) => q.includes('INSERT INTO pins_daily_metrics')), 'Send to Campaign must record opening pins_daily_metrics');
  assert.ok(executed.some((q) => q.includes('INSERT INTO newborn_daily_anchors')), 'Send to Campaign must activate newborn_daily_anchors');
  assert.ok(executed.some((q) => q.includes('INSERT INTO campaign_tracked_pins')), 'Send to Campaign must insert into campaign_tracked_pins');

  // Path B: Track Daily (`promoteNewbornCandidates` with folderId=12)
  executed.length = 0;
  const promoRes = await promoteNewbornCandidates(sql, {
    pinIds: ['970000000000001'],
    workspaceId: 1,
    destinations: { promote_to_daily_ssot: true, folder_id: 12 }
  });
  assert.equal(promoRes.ok, true);
  assert.equal(promoRes.campaign_tracked_count, 1);
  assert.ok(executed.some((q) => q.includes('INSERT INTO campaign_tracked_pins')), 'Track Daily with Campaign must enroll into campaign_tracked_pins');
});

// ---------------------------------------------------------------------------
// 6. Directive 1 & Forensic Hardening: Fleet Default, Uncapped Keywords, Budget, Dedupe, CLI Workspace, Crossover Filters
// ---------------------------------------------------------------------------
test('Directive 1 & Forensic Hardening: Fleet default, uncapped keywords across fleet & /folders/:id/items, workspace settings budget, dedupe keys, CLI --workspace-id, crossover filters', async () => {
  // 1) Workspace settings default execution_mode is 'fleet'
  assert.equal(DEFAULT_WORKSPACE_SETTINGS.execution_mode, 'fleet');

  // 2) resolveExecutionMode supports explicit 'fleet' (default from UI/workspace_settings) and auto-routes heavy runs to 'fleet'
  assert.equal(
    resolveExecutionMode({ requestedMode: 'fleet', keywordsCount: 1, estimatedPins: 500, env: { GITHUB_TOKEN: 'ghp_test' } }).mode,
    'fleet'
  );
  assert.equal(
    resolveExecutionMode({ requestedMode: 'auto', keywordsCount: 10, estimatedPins: 5000, env: { GITHUB_TOKEN: 'ghp_test' } }).mode,
    'fleet'
  );
  assert.equal(
    resolveExecutionMode({ requestedMode: 'direct', keywordsCount: 150, estimatedPins: 100000, env: { GITHUB_TOKEN: 'ghp_test' } }).mode,
    'direct'
  );

  // 3) computeEstimatedPinBudget respects workspaceSettings.extraction_targets when body.paths is omitted
  const wsBudget = computeEstimatedPinBudget({}, 2, {
    extraction_targets: {
      search: { enabled: true, target_pins: 2000 },
      boards: { enabled: true, max_boards: 5, target_pins_per_board: 200 },
      idea_page: { enabled: false },
      home_feed: { enabled: false },
      related: { enabled: false }
    }
  });
  assert.equal(wsBudget, 6000, '2 keywords * (2000 search + 5*200 boards) = 6000');

  // 4) Uncapped fleet run accepts 140 keywords without slicing to 100
  const bigKeywords = Array.from({ length: 140 }, (_, i) => `keyword ${i + 1}`);
  let persistedSeedQueries = null;
  const fleetSql = makeFakeSql((entry) => {
    if (entry.query.includes('INSERT INTO newborn_runs')) {
      const jsonArg = entry.values.find((v) => typeof v === 'string' && v.includes('keyword 140'));
      persistedSeedQueries = jsonArg ? JSON.parse(jsonArg) : null;
      return [{ id: 901, status: 'queued', execution_mode: 'fleet', shards_total: 20, seed_queries: bigKeywords }];
    }
    return [];
  });
  await createFleetBackedNewbornRun(fleetSql, {
    runType: 'cluster',
    seedQueries: bigKeywords,
    shardsTotal: 20,
    workspaceId: 2,
    env: {}
  });
  assert.equal(persistedSeedQueries.length, 140, 'Fleet run must NOT slice seedQueries to 100');

  // 5) Uncapped POST /api/folders/:id/items accepts 250 keywords without slicing to 200
  const big250 = Array.from({ length: 250 }, (_, i) => `cluster term ${i + 1}`);
  let addedCount = 0;
  const folderSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders') && entry.query.includes('WHERE id =')) {
      return [{ id: 5, name: 'Big Campaign', workspace_id: 1 }];
    }
    if (entry.query.includes('INSERT INTO tracked_keywords')) {
      addedCount++;
      return [{ id: addedCount, keyword: entry.values[0] }];
    }
    return [];
  });
  const folderRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/items',
    method: 'POST',
    request: new Request('http://localhost/api/folders/5/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keywords: big250 })
    }),
    url: new URL('http://localhost/api/folders/5/items'),
    sql: folderSql,
    env: {},
    workspaceId: 1,
    jsonResponse: (data, status = 200) => makeJsonResponse(data, status),
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {}
  });
  const folderData = await folderRes.json();
  assert.equal(folderRes.status, 200);
  assert.equal(folderData.added_count, 250, 'POST /api/folders/:id/items must accept all 250 keywords without 200 cap');

  // 6) Dedupe key distinguishes profileId, clusterId, and workerIndex
  const k1 = buildNewbornDedupeKey('discovery', { seedQueries: ['a'], profileId: 1, clusterId: 10, workerIndex: 0 });
  const k2 = buildNewbornDedupeKey('discovery', { seedQueries: ['a'], profileId: 2, clusterId: 10, workerIndex: 0 });
  const k3 = buildNewbornDedupeKey('discovery', { seedQueries: ['a'], profileId: 1, clusterId: 11, workerIndex: 0 });
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);

  // 7) CLI parseNewbornFleetArgs parses --workspace-id
  const parsedCli = parseNewbornFleetArgs(['--mode=db_run', '--run-id=55', '--workspace-id=3'], {});
  assert.equal(parsedCli.workspaceId, 3);

  // 8) Crossover & Candidates queries accept active filters & workspace scoping
  const qSql = makeFakeSql(() => []);
  await getNewbornCrossoverReport(qSql, {
    workspaceId: 2,
    linklessOnly: true,
    surface: 'board_more_ideas',
    creationMethod: 'photos',
    repinFilter: 'original',
    search: 'salad'
  });
  const crossWhere = qSql.calls.find((c) => c.query.includes('nc.is_linkless = TRUE'));
  assert.ok(crossWhere, 'Crossover query must include linkless filter predicate');
  assert.ok(qSql.calls.some((c) => c.values.includes('board_more_ideas')), 'Crossover query must bind surface filter');
  assert.ok(qSql.calls.some((c) => c.values.includes('photos')), 'Crossover query must bind creation_method filter');

  await listNewbornCandidates(qSql, { workspaceId: 2, run_id: 99, surface: 'ideas_feeds' });
  const listCall = qSql.calls.find((c) => c.query.includes('nrc.surfaces'));
  assert.ok(listCall, 'listNewbornCandidates must read nrc.surfaces');

  // 9) upsertStagedCandidatesBatch writes discovery_board_* and nrc.surfaces
  const upSql = makeFakeSql(() => []);
  await upsertStagedCandidatesBatch(upSql, [{
    pin_id: '980000000000001',
    first_surface: 'board_more_ideas',
    discovered_surfaces: ['board_more_ideas', 'pin_serp_capsules', 'pin_resource'],
    discovery_board_name: 'Discovery Source Board',
    pin_board_name: 'Owner Board'
  }], { runId: 99 });
  const candSql = upSql.calls.find((c) => c.query.includes('INSERT INTO newborn_candidates'));
  const nrcSql = upSql.calls.find((c) => c.query.includes('INSERT INTO newborn_run_candidates'));
  assert.ok(candSql.query.includes('discovery_board_name') && candSql.query.includes('pin_board_name'));
  assert.ok(nrcSql.query.includes('surfaces'));
});

// ---------------------------------------------------------------------------
// 7. Frontend SSR Byte Budgets + Alpine Client VM Behavior (Directives 1..5)
// ---------------------------------------------------------------------------
test('UI SSR Byte Budgets & Alpine Client Behavior: Fleet(20) default, no Hydration cap, Select All >100 + Two-Way Sync, Auto-Batch Loop + Stop + Retry, Instant Create Campaign', async () => {
  // 1) SSR HTML Byte Budgets & clean markup
  const discoverHtml = getNewbornPageHtml('', 'hunt');
  const foldersHtml = getCampaignFoldersPageHtml('', '');
  const discoverBytes = Buffer.byteLength(discoverHtml, 'utf8');
  const foldersBytes = Buffer.byteLength(foldersHtml, 'utf8');
  assert.ok(discoverBytes < 225 * 1024, `/discover SSR HTML must be < 225 KiB (got ${(discoverBytes / 1024).toFixed(1)} KiB)`);
  assert.ok(foldersBytes < 215 * 1024, `/folders SSR HTML must be < 215 KiB (got ${(foldersBytes / 1024).toFixed(1)} KiB)`);
  assert.ok(!discoverHtml.includes('Hydration cap:'), 'Hydration cap control must be completely removed from SSR HTML');
  assert.ok(discoverHtml.includes('Select All'), 'Select All button must be rendered in Cluster Explorer');
  assert.ok(discoverHtml.includes('+ Create New Campaign...'), 'Instant Create New Campaign option must be rendered');
  assert.ok(discoverHtml.includes('quickCampaignModalOpen'), 'Quick Create Campaign modal must be rendered');

  // 2) Alpine Client VM execution
  const app = createDiscoverAppVm();
  assert.equal(app.executionMode, 'fleet', 'Default executionMode must be fleet');
  assert.equal(app.fleetShards, 20, 'Default fleetShards must be 20');
  assert.equal(app.maxPinHydrations, undefined, 'maxPinHydrations must be removed from app state');
  assert.equal(app.huntPaths.maxPinHydrations, undefined, 'maxPinHydrations must be removed from huntPaths');

  // 3) Select All >100 keywords & Two-Way Sync with Cluster Basket
  const clusterRows = Array.from({ length: 135 }, (_, i) => ({
    keyword: `viral niche ${i + 1}`,
    volume: 10000 - i * 10,
    volume_enriched: true
  }));
  app.activeCluster = { id: 44, seed_keyword: 'viral niche', keywords: clusterRows };
  app.selectAllClusterKeywords();
  assert.equal(app.selectedClusterKeywords.length, 135, 'Select All must select all 135 keywords without 100 cap');
  assert.equal(app.clusterBasket.length, 135, 'Two-Way Sync must immediately mirror all 135 keywords into clusterBasket');

  // Uncheck a keyword in Explorer -> removed from Basket
  app.toggleClusterKeyword('viral niche 1');
  assert.equal(app.selectedClusterKeywords.length, 134);
  assert.equal(app.clusterBasket.length, 134);
  assert.ok(!app.clusterBasket.some((b) => b.keyword === 'viral niche 1'));

  // Remove a keyword from Basket -> unchecked in Explorer
  app.removeFromBasket('viral niche 2');
  assert.equal(app.clusterBasket.length, 133);
  assert.equal(app.selectedClusterKeywords.length, 133);
  assert.ok(!app.selectedClusterKeywords.includes('viral niche 2'));

  // 4) Auto-Batch Volume Enrichment Loop + Stop + Single Retry
  let enrichCalls = 0;
  app.activeCluster = {
    id: 45,
    seed_keyword: 'soup',
    keywords: [
      { keyword: 'soup 1', volume: null, volume_enriched: false },
      { keyword: 'soup 2', volume: null, volume_enriched: false },
      { keyword: 'soup 3', volume: null, volume_enriched: false, volume_error: true }
    ]
  };
  app.apiJson = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (url.includes('/api/newborn/cluster/enrich')) {
      enrichCalls++;
      if (body.retry_keywords) {
        return {
          data: {
            ok: true,
            enriched_in_batch: 1,
            remaining_unenriched: 0,
            failed_volume_count: 0,
            keywords: [
              { keyword: 'soup 1', volume: 50000, volume_enriched: true },
              { keyword: 'soup 2', volume: 40000, volume_enriched: true },
              { keyword: 'soup 3', volume: 30000, volume_enriched: true, volume_error: false }
            ]
          }
        };
      }
      if (enrichCalls === 1) {
        // Trigger Stop after first batch to verify instant loop halt
        app.stopEnrichingCluster();
        return {
          data: {
            ok: true,
            enriched_in_batch: 1,
            remaining_unenriched: 2,
            failed_volume_count: 1,
            keywords: [
              { keyword: 'soup 1', volume: 50000, volume_enriched: true },
              { keyword: 'soup 2', volume: null, volume_enriched: false },
              { keyword: 'soup 3', volume: null, volume_enriched: false, volume_error: true }
            ]
          }
        };
      }
    }
    if (url === '/api/folders' && opts.method === 'POST') {
      return { data: { success: true, folder: { id: 99, name: body.name } } };
    }
    if (url === '/api/folders') {
      return { data: { folders: [{ id: 99, name: 'Instant Campaign' }] } };
    }
    return { data: { success: true } };
  };

  await app.enrichClusterVolumesNow();
  assert.equal(enrichCalls, 1, 'Stop button must halt Auto-Batch Loop immediately after current batch');
  assert.equal(app.isEnrichingCluster, false);

  await app.retryClusterVolume('soup 3');
  assert.equal(app.activeCluster.keywords.find((k) => k.keyword === 'soup 3').volume, 30000);

  // 5) Instant + Create New Campaign modal across all 3 targets
  app.handleCampaignDropdownChange('target', '__create_new__');
  assert.equal(app.quickCampaignModalOpen, true);
  assert.equal(app.quickCampaignTarget, 'target');
  app.quickCampaignName = 'Instant Campaign';
  await app.submitQuickCreateCampaign();
  assert.equal(app.quickCampaignModalOpen, false);
  assert.equal(app.targetCampaignFolderId, '99', 'Newly created campaign must be auto-selected in target dropdown');

  // 6) getPinDisplaySurfaces strips pin_resource and returns all real surfaces
  const displaySurfaces = app.getPinDisplaySurfaces({
    run_surface: 'board_more_ideas',
    run_surfaces: ['board_more_ideas', 'pin_serp_capsules', 'pin_resource'],
    first_surface: 'pin_serp_capsules',
    discovered_surfaces: ['pin_resource', 'ideas_feeds']
  });
  assert.deepEqual(Array.from(displaySurfaces), ['board_more_ideas', 'pin_serp_capsules', 'ideas_feeds']);
});

test('Forensic 019 Regressions: zero null-rank KSP pollution, clean Top-N stale deactivation, dossier schema fidelity, strict workspace isolation & bulk run delete', async () => {
  // 1. resolvePinKeywordId ignores synthetic multi-pin context objects for non-SERP pins
  assert.equal(resolvePinKeywordId({ pin_id: '1100145015261315845', keyword_id: null }, { id: 1384, is_synthetic_context: true }), null);
  assert.equal(resolvePinKeywordId({ pin_id: '1100145015261315845', keyword_id: null }, { id: 1384 }), 1384);
  assert.equal(resolvePinKeywordId({ pin_id: '1100145015261315845', keyword_id: 99 }, { id: 1384, is_synthetic_context: true }), 99);

  // 2. ingestPinsBatch skips bogus (rank=null, last_known_rank=null) entries before keyword_serp_positions
  const repoSql = makeFakeSql(() => []);
  await ingestPinsBatch(repoSql, [
    {
      pin_id: '1100145015261315845',
      keyword_id: 1384,
      rank_position: null,
      last_known_rank: null,
      is_displaced: false,
      save_count: 100,
      repin_count: 25
    },
    {
      pin_id: '2200145015261315845',
      keyword_id: 1384,
      rank_position: 7,
      last_known_rank: 7,
      is_displaced: false,
      save_count: 200,
      repin_count: 40
    }
  ]);
  const kspInsert = repoSql.calls.find((c) => c.query.includes('INSERT INTO keyword_serp_positions'));
  assert.ok(kspInsert, 'Valid rank=7 pin must write keyword_serp_positions');
  const kspRows = JSON.parse(kspInsert.values[0]);
  assert.equal(kspRows.length, 1);
  assert.equal(kspRows[0].pin_id, '2200145015261315845');
  assert.ok(kspInsert.query.includes('COALESCE(u.last_known_rank, k_ex.rank_position, k_ex.last_known_rank)'));

  // 3. syncKeywordTopNIntoCampaigns populates seed_query and deactivates stale search rows only
  const syncSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folder_items kfi JOIN keyword_folders')) {
      return [{ folder_id: 5, workspace_id: 1, serp_top_n: 20 }];
    }
    if (entry.query.includes('SELECT keyword FROM tracked_keywords')) {
      return [{ keyword: 'high protein' }];
    }
    if (entry.query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ pin_id: '330000000000001' }];
    }
    return [];
  });
  const syncRes = await syncKeywordTopNIntoCampaigns(syncSql, 44);
  assert.equal(syncRes.synced, 1);
  const deactCall = syncSql.calls.find((c) => c.query.includes('UPDATE campaign_tracked_pins ctp SET is_active = FALSE'));
  assert.ok(deactCall && deactCall.query.includes("ctp.source_type = 'search'"), 'Must deactivate only stale search rows');

  // 4. getPinDossier uses verified schema columns without ctp.notes / nc.discovery_surface / nda.baseline_saves errors
  const dossierSql = makeFakeSql((entry) => {
    assert.equal(entry.query.includes('ctp.notes'), false);
    assert.equal(entry.query.includes('nc.discovery_surface'), false);
    assert.equal(entry.query.includes('nda.baseline_saves'), false);
    if (entry.query.includes('FROM universal_master_pins')) {
      return [{ pin_id: '1100145015261315845', title: 'High Protein Casserole', save_count: 150, repin_count: 30 }];
    }
    if (entry.query.includes('FROM campaign_tracked_pins ctp')) {
      return [{ folder_id: 5, workspace_id: 1, folder_name: 'high protein', source_type: 'newborn', seed_query: 'green bean casserole', added_at: '2026-11-25T00:00:00Z', notes: null }];
    }
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{ pin_id: '1100145015261315845', seed_query: 'green bean casserole', stage: 'promoted', discovery_surface: 'pin_serp_capsules', anchor_active: true, anchor_baseline_saves: 150 }];
    }
    return [];
  });
  const pinDossier = await getPinDossier(dossierSql, '1100145015261315845', { workspaceId: 1 });
  assert.equal(pinDossier.tracked_campaigns[0].folder_name, 'high protein');
  assert.equal(pinDossier.newborn_context.stage, 'promoted');

  // 5. Workspace-scoped settings & rule profiles isolate WS 2 from WS 1
  const wsSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM app_settings WHERE key =')) {
      return entry.values[0] === 'newborn_engine_settings_ws_2'
        ? [{ value: { discovery: { country: 'CA' } } }]
        : [{ value: { discovery: { country: 'US' } } }];
    }
    if (entry.query.includes('FROM newborn_rule_profiles WHERE')) {
      return [{ id: 1, workspace_id: 2, slug: 'ws2-rule', name: 'WS2 Rule', surfaces_config: {}, qualification_config: {}, automation_config: {} }];
    }
    if (entry.query.includes('INSERT INTO newborn_rule_profiles')) {
      return [{ id: 88, workspace_id: entry.values[9], slug: entry.values[0], name: entry.values[1] }];
    }
    return [];
  });
  const s1 = await getNewbornSettings(wsSql, { workspaceId: 1 });
  const s2 = await getNewbornSettings(wsSql, { workspaceId: 2 });
  assert.equal(s1.discovery.country, 'US');
  assert.equal(s2.discovery.country, 'CA');
  await listNewbornRuleProfiles(wsSql, { workspaceId: 2 });
  const createdProf = await createNewbornRuleProfile(wsSql, { name: 'WS2 Rule' }, { workspaceId: 2 });
  assert.equal(createdProf.workspace_id, 2);

  // 6. deleteNewbornRunsBulk enforces workspace isolation, skips active runs, and prunes orphans
  const bulkSql = makeFakeSql((entry) => {
    if (entry.query.includes('SELECT id, status FROM newborn_runs')) {
      if (Number(entry.values[1]) !== 1) return [];
      return [
        { id: 10, status: 'completed' },
        { id: 11, status: 'running' },
        { id: 12, status: 'failed' }
      ];
    }
    if (entry.query.includes('SELECT pin_id FROM newborn_run_candidates')) {
      return [{ pin_id: '999000111222' }];
    }
    if (entry.query.includes('DELETE FROM newborn_runs')) {
      return (entry.values[0] || []).map((id) => ({ id }));
    }
    if (entry.query.includes('DELETE FROM newborn_candidates nc')) {
      return [{ pin_id: '999000111222' }];
    }
    return [];
  });
  const ws2Blocked = await deleteNewbornRunsBulk(bulkSql, [10, 11, 12], { workspaceId: 2 });
  assert.equal(ws2Blocked.status, 404);
  const ws1Bulk = await deleteNewbornRunsBulk(bulkSql, [10, 11, 12], { workspaceId: 1 });
  assert.equal(ws1Bulk.ok, true);
  assert.deepEqual(ws1Bulk.deleted_run_ids, [10, 12]);
  assert.deepEqual(ws1Bulk.skipped_active_ids, [11]);
  assert.equal(ws1Bulk.orphans_pruned, 1);

  // 7. updateNewbornCandidateStage(..., 'discarded') deactivates workspace newborn CTP + orphan daily anchors
  const discSql = makeFakeSql((entry) => {
    if (entry.query.includes('UPDATE newborn_candidates')) {
      return [{ pin_id: '1100145015261315845', stage: 'discarded' }];
    }
    return [];
  });
  const discRes = await updateNewbornCandidateStage(discSql, ['1100145015261315845'], 'discarded', { workspaceId: 2 });
  assert.equal(discRes.updated, 1);
  assert.ok(discSql.calls.some((c) => c.query.includes('UPDATE campaign_tracked_pins') && c.values.includes(2)));
  assert.ok(discSql.calls.some((c) => c.query.includes('UPDATE newborn_daily_anchors nda')));
});
