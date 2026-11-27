/**
 * tests/28-full-refactor-fleet-dossier-method.test.mjs
 *
 * Pure behavioral regression & verification suite for the 4-Pillar Full Architectural Refactoring:
 * 1. Multi-Dimensional Fleet Work-Unit Planner (`fleet-work-units.mjs`), `run-queue.mjs`, `scripts/newborn-fleet.mjs`,
 *    and `harvester.mjs` board-slice modulo partitioning.
 * 2. Unified `Scroll Related` (`POST /api/newborn/snowball`) Fleet execution mode & 20-runner parallel pin sharding.
 * 3. True 4-Pillar Pin Dossier (`dossier-reader.mjs`), `annotations-intel.mjs`, Visual Lens (`serp-dossier-service.mjs`),
 *    and bidirectional Pillar 4 Live Deep Sync (`repository.mjs`) for `newborn_candidates`-only & dual-table pins.
 * 4. Authentic `creation_method` domain model hygiene (`pinterest_platform`, never synthetic `organic_pin`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  planNewbornFleetShards,
  resolveShardAssignmentForWorker,
  extractSettingsOverridesFromSnapshot
} from '../src/modules/newborn/fleet-work-units.mjs';
import { createFleetBackedNewbornRun } from '../src/modules/newborn/run-queue.mjs';
import {
  runNewbornFleetDispatch,
  runNewbornFleetWorker,
  parseNewbornFleetArgs
} from '../scripts/newborn-fleet.mjs';
import { handleNewbornRoutes } from '../src/routes/newborn.mjs';
import {
  getPinDossier,
  fetchUniversalPinDossier,
  synthesizeCanonicalMasterRecord
} from '../src/modules/pins/dossier-reader.mjs';
import {
  extractStoredPinAnnotations,
  fetchPinAnnotationsIntel
} from '../src/modules/pins/annotations-intel.mjs';
import { syncPinAcrossAllFourPillars } from '../src/modules/pins/repository.mjs';
import { formatPin } from '../src/core/pinterest/pin-formatter.mjs';
import { extractPinData } from '../src/core/pinterest/pin-html-extractor.mjs';
import {
  normalizeCanonicalCreationMethod,
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from '../src/modules/newborn/surface-normalizers.mjs';
import { listNewbornCandidates } from '../src/modules/newborn/queries.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';
import { BYTE_BUDGETS, DEAD_SYMBOLS } from '../scripts/verify-live-readonly.mjs';

function makeFakeSql(handler) {
  const calls = [];
  const fn = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join(' ').replace(/\s+/g, ' ').trim() : String(strings);
    const entry = { query, values };
    calls.push(entry);
    return handler ? handler(entry, calls) : [];
  };
  fn.calls = calls;
  fn.unsafe = async (rawSql) => {
    calls.push({ query: String(rawSql), values: [], unsafe: true });
    return [];
  };
  fn.begin = async (cb) => cb(fn);
  return fn;
}

// ---------------------------------------------------------------------------
// 1. Multi-Dimensional Fleet Work-Unit Planner
// ---------------------------------------------------------------------------
test('Fleet Work-Unit Planner [1]: 1-keyword multi-surface hunt fans out across Search + Idea Page + Board Slices', () => {
  const plan = planNewbornFleetShards({
    runType: 'discovery',
    keywords: ['stuffing recipes'],
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true },
          ideas_feeds: { enabled: true },
          fresh_boards: { enabled: true, max_boards_to_expand: 10 },
          board_more_ideas: { enabled: true },
          board_feed: { enabled: false }
        }
      }
    },
    requestedShards: 20
  });

  assert.equal(plan.strategy, 'multi_dimensional');
  assert.equal(plan.effectiveShards, 12, '1 Search + 1 Idea Page + 10 Board Slices = 12 parallel shards');
  assert.equal(plan.units.length, 12);

  // Verify every shard gets distinct, non-overlapping surface responsibility
  let searchWorkers = 0;
  let ideasWorkers = 0;
  const boardSlicesSeen = new Set();

  for (let w = 0; w < plan.effectiveShards; w++) {
    const a = resolveShardAssignmentForWorker(plan, w, plan.effectiveShards);
    assert.equal(a.empty, false);
    assert.deepEqual(a.myQueries, ['stuffing recipes']);
    const surf = a.workerSettingsOverrides.discovery.surfaces;
    if (surf.pin_serp_capsules.enabled) searchWorkers++;
    if (surf.ideas_feeds.enabled) ideasWorkers++;
    if (surf.fresh_boards.enabled) {
      assert.equal(a.workerSettingsOverrides.discovery.board_slice_total, 10);
      boardSlicesSeen.add(a.workerSettingsOverrides.discovery.board_slice_index);
    }
  }

  assert.equal(searchWorkers, 1, 'Search surface must execute on exactly 1 worker');
  assert.equal(ideasWorkers, 1, 'Idea Page surface must execute on exactly 1 worker');
  assert.equal(boardSlicesSeen.size, 10, 'All 10 board slices must be covered without overlap');
});

test('Fleet Work-Unit Planner [2]: Multi-keyword hunt shards keywords, seedBoards, and seedPinIds round-robin without worker-0 bottleneck', () => {
  const keywords = ['kw1', 'kw2', 'kw3', 'kw4', 'kw5', 'kw6'];
  const seedBoards = [
    { board_id: 'b1', url: '/u/b1/' },
    { board_id: 'b2', url: '/u/b2/' },
    { board_id: 'b3', url: '/u/b3/' }
  ];
  const seedPinIds = ['10000000000001', '10000000000002', '10000000000003'];

  const plan = planNewbornFleetShards({
    runType: 'discovery',
    keywords,
    seedBoards,
    seedPinIds,
    requestedShards: 3
  });

  assert.equal(plan.strategy, 'keyword_sharded');
  assert.equal(plan.effectiveShards, 3);

  const w0 = resolveShardAssignmentForWorker(plan, 0, 3);
  const w1 = resolveShardAssignmentForWorker(plan, 1, 3);
  const w2 = resolveShardAssignmentForWorker(plan, 2, 3);

  assert.deepEqual(w0.myQueries, ['kw1', 'kw4']);
  assert.deepEqual(w1.myQueries, ['kw2', 'kw5']);
  assert.deepEqual(w2.myQueries, ['kw3', 'kw6']);
  assert.deepEqual(w0.myBoards.map((b) => b.board_id), ['b1']);
  assert.deepEqual(w1.myBoards.map((b) => b.board_id), ['b2']);
  assert.deepEqual(w2.myBoards.map((b) => b.board_id), ['b3']);
  assert.deepEqual(w0.myPinIds, ['10000000000001']);
  assert.deepEqual(w1.myPinIds, ['10000000000002']);
  assert.deepEqual(w2.myPinIds, ['10000000000003']);
});

test('Fleet Work-Unit Planner [3]: Snowball with 20 pins fans out to 20 parallel Fleet runners', () => {
  const pinIds = Array.from({ length: 20 }, (_, i) => String(50000000000000 + i));
  const plan = planNewbornFleetShards({
    runType: 'snowball',
    seedPinIds: pinIds,
    requestedShards: 20
  });

  assert.equal(plan.strategy, 'snowball_pins');
  assert.equal(plan.effectiveShards, 20);

  const assignedPins = new Set();
  for (let w = 0; w < 20; w++) {
    const a = resolveShardAssignmentForWorker(plan, w, 20);
    assert.equal(a.snowballOnly, true);
    assert.equal(a.runType, 'snowball');
    assert.equal(a.myPinIds.length, 1);
    assignedPins.add(a.myPinIds[0]);
  }
  assert.equal(assignedPins.size, 20);
});

// ---------------------------------------------------------------------------
// 2. Unified POST /api/newborn/snowball Fleet Dispatch & Stage 0 Dispatcher
// ---------------------------------------------------------------------------
test('Fleet Snowball [4]: POST /api/newborn/snowball dispatches Fleet run across parallel runners when Fleet mode is active', async () => {
  const origFetch = globalThis.fetch;
  let dispatchedInputs = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/actions/workflows/newborn-hunter.yml/dispatches')) {
      dispatchedInputs = JSON.parse(init.body)?.inputs || null;
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 200 });
  };

  try {
    let insertedRunType = null;
    let insertedShards = null;
    let insertedSnapshot = null;
    const sql = makeFakeSql((entry) => {
      if (entry.query.includes('INSERT INTO newborn_runs')) {
        insertedRunType = entry.values[0];
        insertedSnapshot = JSON.parse(entry.values[7]);
        insertedShards = entry.values[8];
        return [{
          id: 777,
          run_type: insertedRunType,
          status: 'queued',
          execution_mode: 'fleet',
          shards_total: insertedShards,
          config_snapshot: insertedSnapshot
        }];
      }
      return [];
    });

    const pinIds = Array.from({ length: 8 }, (_, i) => String(91000000000000 + i));
    const req = new Request('http://localhost:3000/api/newborn/snowball', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seed_pin_ids: pinIds,
        execution_mode: 'fleet',
        shards: 20,
        target_pins: 200
      })
    });

    const res = await handleNewbornRoutes({
      request: req,
      url: new URL(req.url),
      pathname: '/api/newborn/snowball',
      method: 'POST',
      sql,
      env: { GITHUB_TOKEN: 'ghp_unit_test_token', GITHUB_REPOSITORY: 'owner/repo' },
      workspaceId: 1,
      jsonResponse: (payload, status = 200) => Response.json(payload, { status })
    });

    assert.equal(res.status, 202);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.execution_mode, 'fleet');
    assert.equal(data.shards_total, 8, '8 seed pins with requested 20 shards clamps cleanly to 8 runners');
    assert.equal(insertedRunType, 'snowball');
    assert.equal(insertedShards, 8);
    assert.equal(insertedSnapshot.seed_pin_ids.length, 8);
    assert.equal(dispatchedInputs.mode, 'db_run');
    assert.equal(dispatchedInputs.run_id, '777');
    assert.equal(dispatchedInputs.shards, '8');

    // Verify Stage 0 Dispatcher emits 8 parallel matrix tasks for this db_run snowball
    const dispatchSql = makeFakeSql((entry) => {
      if (entry.query.includes('FROM newborn_runs') && entry.query.includes('WHERE id =')) {
        return [{
          id: 777,
          run_type: 'snowball',
          status: 'queued',
          cancel_requested_at: null,
          selected_keywords: [],
          seed_queries: [],
          config_snapshot: insertedSnapshot,
          shards_total: 8,
          cluster_id: null,
          profile_id: null,
          folder_id: null
        }];
      }
      return [];
    });

    const dispatchRes = await runNewbornFleetDispatch({
      sql: dispatchSql,
      parsedArgs: parseNewbornFleetArgs(['--mode=dispatch', '--target-mode=db_run', '--run-id=777'], {}),
      env: { GITHUB_RUN_ID: '999999', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'owner/repo' }
    });
    assert.equal(dispatchRes.taskCount, 8);
    assert.equal(dispatchRes.matrixTasks[7].worker_index, 7);
    assert.equal(dispatchRes.matrixTasks[7].worker_total, 8);

    // Verify extractSettingsOverridesFromSnapshot strips transport/plan keys cleanly
    const extracted = extractSettingsOverridesFromSnapshot(insertedSnapshot);
    assert.equal(extracted?.seed_pin_ids, undefined);
    assert.equal(extracted?.shard_plan, undefined);

    // Verify createFleetBackedNewbornRun plans 12 shards for 1 keyword + Search + Idea Page + 10 Boards
    let singleKwShards = null;
    const singleKwSql = makeFakeSql((entry) => {
      if (entry.query.includes('INSERT INTO newborn_runs')) {
        singleKwShards = entry.values[8];
        return [{ id: 888, run_type: 'discovery', status: 'queued', execution_mode: 'fleet', shards_total: singleKwShards }];
      }
      return [];
    });
    const singleKwRes = await createFleetBackedNewbornRun(singleKwSql, {
      runType: 'discovery',
      selectedKeywords: ['stuffing recipes'],
      settingsOverrides: {
        discovery: {
          surfaces: {
            pin_serp_capsules: { enabled: true },
            ideas_feeds: { enabled: true },
            fresh_boards: { enabled: true, max_boards_to_expand: 10 },
            board_more_ideas: { enabled: true }
          }
        }
      },
      shards: 20,
      env: { GITHUB_TOKEN: 'ghp_unit_test_token', GITHUB_REPOSITORY: 'owner/repo' }
    });
    assert.equal(singleKwRes.ok, true);
    assert.equal(singleKwRes.shards_total, 12);

    // Verify runNewbornFleetWorker cleanly skips empty shard slice when workerIndex exceeds planned units
    const workerEmptySql = makeFakeSql((entry) => {
      if (entry.query.includes('FROM newborn_runs') && entry.query.includes('WHERE id =')) {
        return [{
          id: 777,
          run_type: 'snowball',
          workspace_id: 1,
          status: 'running',
          cancel_requested_at: null,
          selected_keywords: [],
          seed_queries: [],
          config_snapshot: { seed_pin_ids: ['91000000000001'] },
          shards_total: 2,
          cluster_id: null,
          profile_id: null,
          folder_id: null
        }];
      }
      return [];
    });
    const emptyWorkerRes = await runNewbornFleetWorker({
      sql: workerEmptySql,
      parsedArgs: parseNewbornFleetArgs(['--mode=db_run', '--run-id=777', '--shards=2', '--worker-index=1'], {}),
      env: {}
    });
    assert.equal(emptyWorkerRes.skipped, true);
    assert.equal(emptyWorkerRes.reason, 'empty_shard_slice');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 3. True 4-Pillar Pin Dossier & Annotations Intel Unification
// ---------------------------------------------------------------------------
test('4-Pillar Dossier [5]: Pillar-4-only pin (newborn_candidates without universal_master_pins) resolves full dossier + linked /ideas/ annotations', async () => {
  const ncPin = {
    pin_id: '352688214594826651',
    seed_query: 'stuffing recipes',
    stage: 'discovered',
    qualified: true,
    discovery_surface: 'pin_serp_capsules',
    discovered_surfaces: ['pin_serp_capsules', 'ideas_feeds'],
    folder_id: 5,
    first_seen_at: '2026-11-20T10:00:00.000Z',
    last_seen_at: '2026-11-26T10:00:00.000Z',
    updated_at: '2026-11-26T10:00:00.000Z',
    promoted_at: null,
    title: 'Herb Sourdough Stuffing Recipe',
    description: 'Crispy herb sourdough stuffing for Thanksgiving dinner.',
    alt_text: 'Golden baked stuffing in cast iron skillet',
    image_url: 'https://i.pinimg.com/736x/ab/cd/ef/abcdef.jpg',
    dominant_color: '#8b5a2b',
    destination_url: 'https://example-recipes.com/herb-stuffing',
    clean_domain: 'example-recipes.com',
    is_linkless: false,
    pinner_username: 'cozykitchen',
    pinner_full_name: 'Cozy Kitchen',
    pinner_followers: 1200,
    effective_creator_username: 'cozykitchen',
    effective_creator_followers: 1200,
    pin_board_name: 'Thanksgiving Sides',
    pin_board_url: 'https://www.pinterest.com/cozykitchen/thanksgiving-sides/',
    raw_creation_method: 'uploaded',
    upload_provenance: 'UPLOADED',
    is_hydrated: true,
    save_count: 1442,
    repin_count: 1425,
    share_count: 101,
    comment_count: 5,
    reaction_count: 12,
    created_at_pinterest: '2026-10-29T00:54:58.000Z',
    golden_score: 91.5,
    is_golden_pin: true,
    visual_annotations: [
      { name: 'Thanksgiving Stuffing', url: '/ideas/thanksgiving-stuffing/926351234567/', idea_id: '926351234567' },
      { name: 'Holiday Side Dishes', url: '/ideas/holiday-side-dishes/948112233445/' }
    ],
    metadata: {}
  };

  const fakeSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM universal_master_pins')) return [];
    if (entry.query.includes('FROM newborn_candidates nc')) return [ncPin];
    return [];
  });

  const dossier = await getPinDossier(fakeSql, '352688214594826651');
  assert.ok(dossier, 'Pillar-4-only pin must NOT return null / 404');
  assert.equal(dossier.success, true);
  assert.equal(dossier.creative.title, 'Herb Sourdough Stuffing Recipe');
  assert.equal(dossier.creative.save_count, 1442);
  assert.equal(dossier.creative.repin_count, 1425);
  assert.equal(dossier.creative.share_count, 101);
  assert.equal(dossier.creative.domain, 'example-recipes.com');
  assert.equal(dossier.creative.first_discovered_pillar, 'newborn');
  assert.equal(dossier.algorithmic_intelligence.creation_method, 'uploaded');
  assert.equal(dossier.algorithmic_intelligence.is_go_linkless, false);
  assert.equal(dossier.newborn_context.stage, 'discovered');
  assert.equal(dossier.newborn_context.golden_score, 91.5);
  assert.deepEqual(dossier.creative.visual_annotations, ['Thanksgiving Stuffing', 'Holiday Side Dishes']);
  assert.equal(dossier.creative.visual_annotations_detailed[0].idea_id, '926351234567');
  assert.equal(dossier.creative.visual_annotations_detailed[1].idea_id, '948112233445');

  const universal = await fetchUniversalPinDossier({ sql: fakeSql, pinId: '352688214594826651' });
  assert.equal(universal.success, true);
  assert.equal(universal.creative.save_count, 1442);
  assert.equal(universal.algorithmic_intelligence.creation_method, 'uploaded');

  // Verify legacy polluted `organic_pin` in Pillar 4 normalizes to `pinterest_platform`
  const synthLegacy = synthesizeCanonicalMasterRecord({
    pin: null,
    newbornContextRow: {
      ...ncPin,
      pin_id: '557531628905083551',
      raw_creation_method: 'organic_pin',
      is_linkless: true,
      destination_url: ''
    },
    cleanPinId: '557531628905083551'
  });
  assert.equal(synthLegacy.creation_method, 'pinterest_platform');
  assert.equal(synthLegacy.metadata.creation_method, 'pinterest_platform');
  assert.equal(synthLegacy.metadata.is_go_linkless, true);
});

test('4-Pillar Annotations Intel [6]: fetchPinAnnotationsIntel resolves Pillar-4-only pin and extracts idea_id/url from visual_annotations objects', async () => {
  const fakeSql = makeFakeSql((entry) => {
    if (entry.query.includes('unified_pin_annotations')) {
      return [{
        pin_id: '352688214594826651',
        visual_annotations: [
          { name: 'Thanksgiving Stuffing', url: '/ideas/thanksgiving-stuffing/926351234567/' },
          { name: 'Sourdough Recipes', url: '/ideas/sourdough-recipes/911223344556/', idea_id: '911223344556' }
        ],
        metadata: {},
        priority: 2
      }];
    }
    return [];
  });

  const extracted = extractStoredPinAnnotations({
    visual_annotations: [
      { name: 'Thanksgiving Stuffing', url: '/ideas/thanksgiving-stuffing/926351234567/' }
    ],
    metadata: {}
  });
  assert.equal(extracted.items.length, 1);
  assert.equal(extracted.items[0].idea_id, '926351234567');
  assert.equal(extracted.items[0].url, '/ideas/thanksgiving-stuffing/926351234567/');

  const res = await fetchPinAnnotationsIntel({
    sql: fakeSql,
    pinId: '352688214594826651',
    fetchInterestFn: async (term) => ({
      success: true,
      id: term === 'Thanksgiving Stuffing' ? '926351234567' : '911223344556',
      internal_search_count: term === 'Thanksgiving Stuffing' ? 450000 : 120000,
      url_name: term.toLowerCase().replace(/\s+/g, '-'),
      seo_breadcrumbs: ['Food & Drink', 'Thanksgiving']
    })
  });

  assert.equal(res.found, true);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.annotations.length, 2);
  assert.equal(res.payload.annotations[0].annotation, 'Thanksgiving Stuffing');
  assert.equal(res.payload.annotations[0].search_volume, 450000);
  assert.equal(res.payload.total_search_volume, 570000);
});

test('4-Pillar Bidirectional Sync [7]: syncPinAcrossAllFourPillars updates newborn_candidates inside SAVEPOINT with canonical method', async () => {
  const sql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM universal_master_pins') && !entry.query.includes('INSERT')) return [];
    return [];
  });

  const res = await syncPinAcrossAllFourPillars({
    sql,
    pinId: '557531628905083551',
    scrapedPin: {
      pin_id: '557531628905083551',
      title: 'Linkless Viral Stuffing',
      saves: 1700,
      repins: 1690,
      has_explicit_saves: true,
      has_explicit_repins: true,
      creation_method: 'organic_pin',
      annotations: [{ name: 'Stuffing', url: '/ideas/stuffing/911000111222/', idea_id: '911000111222' }]
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '557531628905083551' })
  });

  assert.equal(res.success, true);
  const spBegin = sql.calls.find((c) => c.unsafe && c.query.includes('SAVEPOINT sp_sync_newborn_candidate'));
  const spRelease = sql.calls.find((c) => c.unsafe && c.query.includes('RELEASE SAVEPOINT sp_sync_newborn_candidate'));
  const ncUpdate = sql.calls.find((c) => c.query.includes('UPDATE public.newborn_candidates'));
  assert.ok(spBegin, 'Must wrap Pillar 4 update in SAVEPOINT');
  assert.ok(spRelease, 'Must release SAVEPOINT after Pillar 4 update');
  assert.ok(ncUpdate, 'Must execute bidirectional UPDATE public.newborn_candidates');
  assert.ok(ncUpdate.values.includes('pinterest_platform'), 'Must normalize legacy organic_pin to pinterest_platform on sync');
  assert.equal(ncUpdate.values.includes('organic_pin'), false, 'Must NEVER write synthetic organic_pin');
});

// ---------------------------------------------------------------------------
// 4. Authentic `creation_method` Domain Model Hygiene
// ---------------------------------------------------------------------------
test('Authentic creation_method [8]: pin-formatter, pin-html-extractor, and surface-normalizers never emit synthetic organic_pin', () => {
  // 1. formatPin for hydrated native pin without explicit method
  const formatted = formatPin({
    id: '557531628905083551',
    title: 'Native Pin',
    aggregated_pin_data: { aggregated_stats: { saves: 1682 } },
    repin_count: 1674
  });
  assert.equal(formatted.creation_method, 'pinterest_platform');

  // 2. extractPinData when HTML only provides ogSaves (JSON-LD SaveAction) without explicit method
  const html = `
    <html><head>
      <meta property="og:title" content="Test Stuffing Pin" />
      <script type="application/ld+json">${JSON.stringify({
        name: 'Test Stuffing Pin',
        interactionStatistic: [{ interactionType: 'https://schema.org/SaveAction', userInteractionCount: 540 }]
      })}</script>
    </head><body></body></html>
  `;
  const extracted = extractPinData(html, '557531628905083551');
  assert.equal(extracted.save_count, 540);
  assert.equal(extracted.creation_method, 'pinterest_platform');

  // 3. normalizeCanonicalCreationMethod & mergeCandidatePinRecords
  assert.equal(normalizeCanonicalCreationMethod('organic_pin', { isHydrated: true }), 'pinterest_platform');
  assert.equal(normalizeCanonicalCreationMethod('unhydrated_stub', { isHydrated: true }), 'pinterest_platform');
  assert.equal(normalizeCanonicalCreationMethod('unhydrated_stub', { isHydrated: false }), null);
  assert.equal(normalizeCanonicalCreationMethod('share_extension_ios', { isHydrated: true }), 'share_extension_ios');

  const baseNorm = normalizeSurfaceCandidatePin({
    id: '557531628905083551',
    method: 'organic_pin',
    save_count: 1682,
    repin_count: 1674
  }, { surface: 'pin_serp_capsules' });
  assert.equal(baseNorm.raw_creation_method, 'pinterest_platform');

  const merged = mergeCandidatePinRecords(
    { pin_id: '557531628905083551', raw_creation_method: 'pinterest_platform', is_hydrated: true },
    { pin_id: '557531628905083551', raw_creation_method: 'uploaded', is_hydrated: true }
  );
  assert.equal(merged.raw_creation_method, 'uploaded', 'Specific method must override generic pinterest_platform');

  const mergedReverse = mergeCandidatePinRecords(
    { pin_id: '557531628905083551', raw_creation_method: 'uploaded', is_hydrated: true },
    { pin_id: '557531628905083551', raw_creation_method: 'organic_pin', is_hydrated: true }
  );
  assert.equal(mergedReverse.raw_creation_method, 'uploaded', 'Legacy organic_pin must never overwrite specific method');
});

// ---------------------------------------------------------------------------
// 5. /discover Workspace UI Refactoring & Bi-Directional Sorting
// ---------------------------------------------------------------------------
test('Discover UI Refactor [9]: listNewbornCandidates supports repins_asc and age_desc/oldest bi-directional ORDER BY', async () => {
  const sqlRepinsAsc = makeFakeSql((entry) => (entry.query.includes('COUNT(*)') ? [{ total: 0 }] : []));
  await listNewbornCandidates(sqlRepinsAsc, { sort: 'repins_asc', limit: 10 });
  const repinsAscSelect = sqlRepinsAsc.calls.find((c) => c.query.includes('FROM newborn_candidates') && !c.query.includes('COUNT(*)'));
  assert.ok(repinsAscSelect, 'Expected SELECT query for repins_asc');
  assert.match(repinsAscSelect.query, /ORDER BY nc\.repin_count ASC NULLS LAST, nc\.age_days ASC NULLS LAST, nc\.pin_id ASC/);

  const sqlAgeDesc = makeFakeSql((entry) => (entry.query.includes('COUNT(*)') ? [{ total: 0 }] : []));
  await listNewbornCandidates(sqlAgeDesc, { sort: 'age_desc', limit: 10 });
  const ageDescSelect = sqlAgeDesc.calls.find((c) => c.query.includes('FROM newborn_candidates') && !c.query.includes('COUNT(*)'));
  assert.ok(ageDescSelect, 'Expected SELECT query for age_desc');
  assert.match(ageDescSelect.query, /ORDER BY nc\.age_days DESC NULLS LAST, nc\.repin_count DESC NULLS LAST, nc\.pin_id ASC/);

  const sqlOldest = makeFakeSql((entry) => (entry.query.includes('COUNT(*)') ? [{ total: 0 }] : []));
  await listNewbornCandidates(sqlOldest, { sort: 'oldest', limit: 10 });
  const oldestSelect = sqlOldest.calls.find((c) => c.query.includes('FROM newborn_candidates') && !c.query.includes('COUNT(*)'));
  assert.ok(oldestSelect, 'Expected SELECT query for oldest alias');
  assert.match(oldestSelect.query, /ORDER BY nc\.age_days DESC NULLS LAST, nc\.repin_count DESC NULLS LAST, nc\.pin_id ASC/);

  const sqlAgeAsc = makeFakeSql((entry) => (entry.query.includes('COUNT(*)') ? [{ total: 0 }] : []));
  await listNewbornCandidates(sqlAgeAsc, { sort: 'age_asc', limit: 10 });
  const ageAscSelect = sqlAgeAsc.calls.find((c) => c.query.includes('FROM newborn_candidates') && !c.query.includes('COUNT(*)'));
  assert.ok(ageAscSelect, 'Expected SELECT query for age_asc');
  assert.match(ageAscSelect.query, /ORDER BY nc\.age_days ASC NULLS LAST, nc\.repin_count DESC NULLS LAST, nc\.pin_id ASC/);
});

test('Discover UI Refactor [10]: Collapsed Trends & Annotations defaults, bi-directional column sort, compact +N more annotations, icon buttons & byte budget', async () => {
  // 1. Verify SSR HTML contains all new controls, sr-only accessibility labels, zero dead symbols, zero emojis, and < 225 KiB
  const html = getNewbornPageHtml('', 'hunt');
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.ok(bytes < BYTE_BUDGETS.discoverHtmlMaxBytes, `/discover HTML (${bytes} B) must stay below ${BYTE_BUDGETS.discoverHtmlMaxBytes} B`);

  for (const dead of DEAD_SYMBOLS.discover) {
    assert.equal(html.includes(dead), false, `Must not reintroduce dead symbol ${dead}`);
  }

  assert.ok(html.includes("toggleColumnSort('age')"), 'Pin Age column header must call toggleColumnSort(\'age\')');
  assert.ok(html.includes("toggleColumnSort('repins')"), 'Re-pins column header must call toggleColumnSort(\'repins\')');
  assert.ok(html.includes('value="repins_asc"'), 'Sort dropdown must include repins_asc option');
  assert.ok(html.includes('value="age_desc"'), 'Sort dropdown must include age_desc option');
  assert.ok(html.includes('getVisiblePinAnnotationNames(pin, 3)'), 'Row annotations must cap default display at 3 tags');
  assert.ok(html.includes('togglePinAnnotations(pin.pin_id)'), 'Row annotations must wire +N more toggle');
  assert.ok(html.includes('toggleAnnotationsCrossover()'), 'Annotations Crossover card must include toggleAnnotationsCrossover()');
  assert.ok(html.includes('id="newborn-annotations-crossover-body"'), 'Annotations Crossover body must expose aria-controls target');
  assert.ok(html.includes('w-8 h-8 inline-flex items-center justify-center rounded-lg'), 'Action column must use compact w-8 h-8 icon buttons');
  assert.ok(html.includes('<span class="sr-only">Scroll Related</span>'), 'Scroll Related icon button must keep sr-only label');
  assert.ok(html.includes('Track Daily</span>'), 'Track Daily icon button must keep sr-only label');
  assert.ok(html.includes('Pull Account</span>'), 'Pull Account icon button must keep sr-only label');

  // 2. Execute newbornStudioApp in VM to verify default state & interactive state transitions
  const scriptSrc = getNewbornClientAppScript().replace(/^\s*<script>\s*|\s*<\/script>\s*$/gi, '');
  const sandbox = { window: {}, document: {}, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(scriptSrc, sandbox);

  const huntApp = sandbox.newbornStudioApp('', 'hunt');
  assert.equal(huntApp.showTrendsDrawer, false, 'showTrendsDrawer must default to false on /discover (hunt mode)');
  assert.equal(huntApp.showAnnotationsCrossover, false, 'showAnnotationsCrossover must default to false');

  const launchpadApp = sandbox.newbornStudioApp('', 'launchpad');
  assert.equal(launchpadApp.showTrendsDrawer, true, 'showTrendsDrawer should remain true when initialMode is launchpad');
  assert.equal(launchpadApp.showAnnotationsCrossover, false);

  // Toggle Annotations Crossover + auto-expand on checkAnnotationVolumes
  let refreshedIcons = 0;
  huntApp.refreshIcons = () => { refreshedIcons++; };
  huntApp.toggleAnnotationsCrossover();
  assert.equal(huntApp.showAnnotationsCrossover, true);
  assert.ok(refreshedIcons >= 1);
  huntApp.toggleAnnotationsCrossover();
  assert.equal(huntApp.showAnnotationsCrossover, false);

  await huntApp.checkAnnotationVolumes();
  assert.equal(huntApp.showAnnotationsCrossover, true, 'checkAnnotationVolumes must expand Annotations Crossover panel');

  // Column sort toggling state machine
  let loadCalls = 0;
  huntApp.loadCandidates = () => { loadCalls++; };
  assert.equal(huntApp.isColumnSortActive('repins'), true);
  assert.equal(huntApp.getColumnSortDirection('repins'), 'desc');
  assert.equal(huntApp.isColumnSortActive('age'), false);
  assert.equal(huntApp.getColumnSortDirection('age'), '');

  huntApp.toggleColumnSort('repins');
  assert.equal(huntApp.filters.sort, 'repins_asc');
  assert.equal(huntApp.getColumnSortDirection('repins'), 'asc');

  huntApp.toggleColumnSort('repins');
  assert.equal(huntApp.filters.sort, 'repins');
  assert.equal(huntApp.getColumnSortDirection('repins'), 'desc');

  huntApp.toggleColumnSort('age');
  assert.equal(huntApp.filters.sort, 'fresh');
  assert.equal(huntApp.isColumnSortActive('age'), true);
  assert.equal(huntApp.getColumnSortDirection('age'), 'asc');
  assert.equal(huntApp.isColumnSortActive('repins'), false);

  huntApp.toggleColumnSort('age');
  assert.equal(huntApp.filters.sort, 'age_desc');
  assert.equal(huntApp.getColumnSortDirection('age'), 'desc');
  assert.equal(loadCalls, 4);

  // Compact +N more row annotations logic
  const pinWith5Tags = {
    pin_id: '123456789012345',
    visual_annotations: ['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5']
  };
  assert.deepEqual(Array.from(huntApp.getVisiblePinAnnotationNames(pinWith5Tags, 3)), ['Tag 1', 'Tag 2', 'Tag 3']);
  assert.equal(huntApp.getHiddenPinAnnotationCount(pinWith5Tags, 3), 2);
  assert.equal(huntApp.isPinAnnotationsExpanded(pinWith5Tags.pin_id), false);

  huntApp.togglePinAnnotations(pinWith5Tags.pin_id);
  assert.equal(huntApp.isPinAnnotationsExpanded(pinWith5Tags.pin_id), true);
  assert.deepEqual(Array.from(huntApp.getVisiblePinAnnotationNames(pinWith5Tags, 3)), ['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5']);

  huntApp.togglePinAnnotations(pinWith5Tags.pin_id);
  assert.equal(huntApp.isPinAnnotationsExpanded(pinWith5Tags.pin_id), false);
  assert.deepEqual(Array.from(huntApp.getVisiblePinAnnotationNames(pinWith5Tags, 3)), ['Tag 1', 'Tag 2', 'Tag 3']);
});

