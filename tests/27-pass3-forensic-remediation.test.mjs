/**
 * tests/27-pass3-forensic-remediation.test.mjs
 *
 * Behavioral unit & integration tests covering the Pass 3 Verified Master Blueprint
 * (Batches 1–4 + 4 Supplementary Forensic Hardenings):
 * - Batch 1: Lemma accuracy, HTML entity decoding in crossover annotations, Day-1 zero
 *   velocity & null deltas on Newborn promotion, and search-vs-newborn anchor/stage isolation.
 * - Batch 2: InterestResource/get invalid-response rejection (is_interest: false / non-numeric ID),
 *   Idea Page fallback / re-enrichment for official taxonomy with 0 volume, and 2nd-hop
 *   semantic overlap filtering.
 * - Batch 3: 3-state link_filter (all | linkless | linked) + backward-compatible linkless_only,
 *   atomic Past Hunt run deletion + bulk clear-empty with active-run 409 guard & orphan pruning.
 * - Batch 4: Campaign Room 1 unification of campaign_tracked_pins (zero-keyword division safety,
 *   Newborn scope separation from super_pins_count, SSR HTML < 215 KiB), Pin Details multi-campaign
 *   provenance + Day 1 Baseline velocity guard, and crawler folderId tracking.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { normalizeWordLemma } from '../src/domain/pin-intelligence.mjs';
import { buildNewbornCrossoverMatrix } from '../src/modules/newborn/intelligence.mjs';
import { normalizeCandidateForMasterIngest } from '../src/modules/newborn/promotions.mjs';
import { addCampaignTrackedPins, listCampaignTrackedPins } from '../src/modules/workspaces/service.mjs';
import {
  hasSeedSemanticOverlap,
  buildNewbornKeywordCluster,
  enrichClusterRemainingVolumes
} from '../src/modules/newborn/cluster-builder.mjs';
import { NewbornCookieRouter } from '../src/modules/newborn/cookie-router.mjs';
import { resolveIdeaPageIntelligence } from '../src/modules/newborn/surface-trends.mjs';
import { harvestIdeasHubSurface } from '../src/modules/newborn/surface-search-boards.mjs';
import { fetchPinterestInterestVolume, clearInterestVolumeCaches } from '../src/modules/keywords/trends-service.mjs';
import {
  listNewbornCandidates,
  getNewbornCrossoverReport,
  deleteNewbornRun,
  clearFailedAndEmptyNewbornRuns
} from '../src/modules/newborn/queries.mjs';
import { buildFolderCrossoverMatrix } from '../src/modules/keywords/folders-crossover-builders.mjs';
import { getPinDossier } from '../src/modules/pins/dossier-reader.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';
import { fetchCampaignTrackedPinsForWorker } from '../scripts/keyword-velocity-crawler.mjs';
import { runKeywordFleetDispatch } from '../scripts/keyword-fleet.mjs';

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

// ---------------------------------------------------------------------------
// Batch 1: Lemmas, HTML Entity Decoding, Day-1 Velocity, Search/Newborn Isolation
// ---------------------------------------------------------------------------

test('Batch 1.1: normalizeWordLemma fixes food plurals, shoes irregulars, and xmas', () => {
  assert.equal(normalizeWordLemma('beans'), 'bean');
  assert.equal(normalizeWordLemma('oats'), 'oat');
  assert.equal(normalizeWordLemma('greens'), 'green');
  assert.equal(normalizeWordLemma('lentils'), 'lentil');
  assert.equal(normalizeWordLemma('noodles'), 'noodle');
  assert.equal(normalizeWordLemma('tacos'), 'taco');
  assert.equal(normalizeWordLemma('nachos'), 'nacho');
  assert.equal(normalizeWordLemma('shoes'), 'shoe');
  assert.equal(normalizeWordLemma('canoes'), 'canoe');
  assert.equal(normalizeWordLemma('horseshoes'), 'horseshoe');
  assert.equal(normalizeWordLemma('toes'), 'toe');
  assert.equal(normalizeWordLemma('xmas'), 'xmas');
  assert.equal(normalizeWordLemma('sunglasses'), 'sunglasses');
});

test('Batch 1.2: buildNewbornCrossoverMatrix decodes HTML entities in visual annotations', () => {
  const matrix = buildNewbornCrossoverMatrix([
    {
      pin_id: '1001',
      save_count: 50,
      repin_count: 10,
      daily_save_velocity: 5,
      visual_annotations: [
        { name: 'Mac &amp; Cheese' },
        { name: 'Chef&#39;s Dinner' }
      ],
      discovery_surfaces: ['search']
    },
    {
      pin_id: '1002',
      save_count: 80,
      repin_count: 12,
      daily_save_velocity: 8,
      visual_annotations: [
        { name: 'Mac & Cheese' },
        { name: "Chef's Dinner" }
      ],
      discovery_surfaces: ['trends']
    }
  ]);

  const rows = Array.isArray(matrix) ? matrix : [];
  const macRow = rows.find((a) => String(a.term || '').toLowerCase() === 'mac & cheese');
  const chefRow = rows.find((a) => String(a.term || '').toLowerCase() === "chef's dinner");
  assert.ok(macRow, 'Expected decoded "Mac & Cheese" annotation cluster');
  assert.equal(macRow.pin_count, 2, 'Encoded and decoded variants should collapse into one tag');
  assert.ok(chefRow, 'Expected decoded "Chef\'s Dinner" annotation cluster');
  assert.equal(chefRow.pin_count, 2);
});

test('Batch 1.3: normalizeCandidateForMasterIngest never fabricates Day-1 velocity', () => {
  const record = normalizeCandidateForMasterIngest({
    pin_id: '896990450816113805',
    save_count: 420,
    repin_count: 95,
    daily_save_velocity: 420,
    age_days: 1,
    seed_query: 'high protein',
    title: 'High Protein Bowl'
  });

  assert.equal(record.daily_save_velocity, 0);
  assert.equal(record.daily_repin_velocity, 0);
  assert.equal(record.delta_saves_24h, null);
  assert.equal(record.delta_repins_24h, null);
  assert.equal(record.was_live_scraped, false);
});

test('Batch 1.4: addCampaignTrackedPins isolates newborn_daily_anchors & stage=promoted from search pins', async () => {
  const searchSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders')) return [{ id: 5, workspace_id: 1 }];
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{ pin_id: '1111111111', save_count: 50, repin_count: 10, seed_query: 'high protein', missing_in_master: false }];
    }
    if (entry.query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ folder_id: 5, pin_id: '1111111111', source_type: 'search', is_active: true }];
    }
    return [];
  });

  await addCampaignTrackedPins(searchSql, {
    folderId: 5,
    pinIds: ['1111111111'],
    sourceType: 'search',
    sourceRef: 'high protein'
  });

  assert.equal(
    searchSql.calls.some((c) => c.query.includes('INSERT INTO newborn_daily_anchors')),
    false,
    'Search-sourced pins must NOT insert into newborn_daily_anchors'
  );
  assert.equal(
    searchSql.calls.some((c) => c.query.includes("stage = 'promoted'")),
    false,
    'Search-sourced pins must NOT promote rows in newborn_candidates'
  );

  const newbornSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders')) return [{ id: 5, workspace_id: 1 }];
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{ pin_id: '2222222222', save_count: 120, repin_count: 25, seed_query: 'high protein', missing_in_master: true }];
    }
    if (entry.query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ folder_id: 5, pin_id: '2222222222', source_type: 'newborn', is_active: true }];
    }
    return [];
  });

  await addCampaignTrackedPins(newbornSql, {
    folderId: 5,
    pinIds: ['2222222222'],
    sourceType: 'newborn',
    sourceRef: 'high protein'
  });

  assert.equal(
    newbornSql.calls.some((c) => c.query.includes('INSERT INTO newborn_daily_anchors')),
    true,
    'Newborn-sourced pins MUST register in newborn_daily_anchors'
  );
  assert.equal(
    newbornSql.calls.some((c) => c.query.includes("THEN 'promoted'")),
    true,
    'Newborn-sourced pins MUST mark newborn_candidates stage=promoted'
  );
});

// ---------------------------------------------------------------------------
// Batch 2: InterestResource Validation, Idea Page Fallback, 2nd-Hop Relevance
// ---------------------------------------------------------------------------

test('Batch 2.1: hasSeedSemanticOverlap filters off-topic 2nd-hop terms while retaining lemmatized matches', () => {
  assert.equal(hasSeedSemanticOverlap('green bean', 'green beans casserole'), true);
  assert.equal(hasSeedSemanticOverlap('green bean', 'garlic roasted beans'), true);
  assert.equal(hasSeedSemanticOverlap('high protein', 'easy protein bowls'), true);
  assert.equal(hasSeedSemanticOverlap('green bean', 'mashed potatoes thanksgiving'), false);
  assert.equal(hasSeedSemanticOverlap('green bean', 'cranberry sauce recipe'), false);
});

test('Batch 2.2: fetchPinterestInterestVolume rejects is_interest=false and non-numeric IDs', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return makeJsonResponse({
        resource_response: {
          status: 'success',
          data: {
            id: '',
            is_interest: false,
            name: 'bogus nonexistent term',
            key: 'bogus-nonexistent-term-xyz-999'
          }
        }
      });
    };

    const res = await fetchPinterestInterestVolume('bogus nonexistent term xyz 999', { cookie: '' });
    assert.equal(res, null, 'Must return null when Pinterest returns is_interest=false or empty id');
    assert.equal(fetchCount, 1);

    // Second call should hit negative cache cleanly without re-fetching
    const res2 = await fetchPinterestInterestVolume('bogus nonexistent term xyz 999', { cookie: '' });
    assert.equal(res2, null);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Batch 2.3: enrichClusterRemainingVolumes re-attempts official taxonomy rows with volume=0', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let updatedKeywordsJson = null;
    const fakeSql = makeFakeSql((entry) => {
      if (entry.query.includes('FROM newborn_keyword_clusters')) {
        return [{
          id: 42,
          seed_keyword: 'green bean',
          country: 'US',
          keywords: [
            {
              keyword: 'green bean casserole',
              interest_id: '918273645',
              interest_url: 'https://www.pinterest.com/ideas/green-bean-casserole/918273645/',
              has_taxonomy: true,
              volume: 0,
              volume_enriched: true
            }
          ],
          stats: {}
        }];
      }
      if (entry.query.includes('UPDATE newborn_keyword_clusters')) {
        const kwVal = entry.values.find((v) => typeof v === 'string' && v.startsWith('['));
        updatedKeywordsJson = kwVal ? JSON.parse(kwVal) : null;
        return [];
      }
      return [];
    });

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('InterestResource/get')) {
        return makeJsonResponse({
          resource_response: {
            status: 'success',
            data: {
              id: '918273645',
              is_interest: true,
              name: 'Green bean casserole',
              key: 'green-bean-casserole',
              canonical_url: '/ideas/green-bean-casserole/918273645/',
              internal_search_count: 145000
            }
          }
        });
      }
      return makeJsonResponse({}, 404);
    };

    const res = await enrichClusterRemainingVolumes(fakeSql, 42, { batchLimit: 10 });

    assert.equal(res.newly_enriched_count, 1, 'Previously poisoned has_taxonomy=true & volume=0 row must be re-enriched');
    assert.equal(res.remaining_unenriched_count, 0);
    assert.ok(Array.isArray(updatedKeywordsJson));
    assert.equal(updatedKeywordsJson[0].volume, 145000);
    assert.equal(updatedKeywordsJson[0].volume_enriched, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Batch 3: 3-State Link Filter & Past Hunts Deletion
// ---------------------------------------------------------------------------

test('Batch 3.1: listNewbornCandidates & getNewbornCrossoverReport apply 3-state link_filter', async () => {
  const sqlLinked = makeFakeSql((entry) => {
    if (entry.query.includes('COUNT(*)::int AS total')) return [{ total: 0 }];
    return [];
  });
  await listNewbornCandidates(sqlLinked, { link_filter: 'linked', limit: 10 });
  assert.ok(
    sqlLinked.calls.some((c) => c.query.includes('nc.is_linkless = FALSE') && c.values.includes('linked')),
    'link_filter=linked must pass linked and filter nc.is_linkless = FALSE'
  );

  const sqlLinkless = makeFakeSql((entry) => {
    if (entry.query.includes('COUNT(*)::int AS total')) return [{ total: 0 }];
    return [];
  });
  await listNewbornCandidates(sqlLinkless, { linkless_only: true, limit: 10 });
  assert.ok(
    sqlLinkless.calls.some((c) => c.query.includes('nc.is_linkless = TRUE') && c.values.includes('linkless')),
    'Backward-compatible linkless_only=true must pass linkless and filter nc.is_linkless = TRUE'
  );

  const sqlCross = makeFakeSql(() => []);
  await getNewbornCrossoverReport(sqlCross, { linkFilter: 'linked', limit: 20 });
  assert.ok(
    sqlCross.calls.some((c) => c.query.includes('nc.is_linkless = FALSE') && c.values.includes('linked')),
    'Crossover report must honor linkFilter=linked'
  );
});

test('Batch 3.2: deleteNewbornRun rejects active runs (409) and prunes orphan candidates atomically', async () => {
  const activeSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_runs')) {
      return [{ id: 10, status: 'running', workspace_id: 1 }];
    }
    return [];
  });
  const activeRes = await deleteNewbornRun(activeSql, 10, { workspaceId: 1 });
  assert.equal(activeRes.ok, false);
  assert.equal(activeRes.status, 409);
  assert.equal(activeRes.error, 'RUN_ACTIVE');

  const doneSql = makeFakeSql((entry) => {
    if (entry.query.includes('DELETE FROM newborn_candidates')) {
      return [{ pin_id: '555' }];
    }
    if (entry.query.includes('DELETE FROM newborn_runs')) {
      return [{ id: 11 }];
    }
    if (entry.query.includes('FROM newborn_runs')) {
      return [{ id: 11, status: 'failed', workspace_id: 1 }];
    }
    if (entry.query.includes('FROM newborn_run_candidates')) {
      return [{ pin_id: '555' }, { pin_id: '666' }];
    }
    return [];
  });

  const delRes = await deleteNewbornRun(doneSql, 11, { workspaceId: 1 });
  assert.equal(delRes.ok, true);
  assert.equal(delRes.deleted_run_id, 11);
  assert.equal(delRes.orphans_pruned, 1);

  const captureIdx = doneSql.calls.findIndex((c) => c.query.includes('SELECT pin_id FROM newborn_run_candidates'));
  const deleteRunIdx = doneSql.calls.findIndex((c) => c.query.includes('DELETE FROM newborn_runs'));
  const pruneIdx = doneSql.calls.findIndex((c) => c.query.includes('DELETE FROM newborn_candidates'));
  assert.ok(captureIdx >= 0 && deleteRunIdx > captureIdx && pruneIdx > deleteRunIdx,
    'Must capture target pins BEFORE deleting newborn_runs and prune orphans AFTER');
});

test('Batch 3.3: clearFailedAndEmptyNewbornRuns deletes failed/zero-pin runs and prunes orphans', async () => {
  const bulkSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_runs')) {
      return [{ id: 21 }, { id: 22 }];
    }
    if (entry.query.includes('FROM newborn_run_candidates')) {
      return [{ pin_id: '777' }];
    }
    if (entry.query.includes('DELETE FROM newborn_candidates')) {
      return [{ pin_id: '777' }];
    }
    return [];
  });

  const res = await clearFailedAndEmptyNewbornRuns(bulkSql, {});
  assert.equal(res.deleted_runs, 2);
  assert.deepEqual(res.deleted_run_ids, [21, 22]);
  assert.equal(res.orphans_pruned, 1);
});

test('Batch 3.4: Discover client VM supports 3-state link_filter and two-click delete confirmation', async () => {
  const rawScript = getNewbornClientAppScript().trim();
  const script = rawScript.replace(/^<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '');
  const fetchCalls = [];
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
    fetch: async (url, opts = {}) => {
      fetchCalls.push({ url: String(url), method: String(opts.method || 'GET').toUpperCase() });
      return makeJsonResponse({ success: true, candidates: [], total: 0, deleted_run_id: 99, orphans_pruned: 0, runs: [] });
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(script, sandbox);

  const app = sandbox.newbornStudioApp('', 'hunt');
  app.toast = () => {};
  app.refreshIcons = () => {};
  app.filters.linkFilter = 'linked';
  await app.loadCandidates(false);
  assert.ok(
    fetchCalls.some((c) => c.url.includes('link_filter=linked')),
    `Expected link_filter=linked in fetchCalls: ${JSON.stringify(fetchCalls)}`
  );

  // Two-click delete guard (first click arms confirmation without issuing DELETE)
  fetchCalls.length = 0;
  await app.deletePastRun({ id: 99, status: 'failed', seed_query: 'protein' });
  assert.equal(app.confirmDeleteRunId, 99);
  assert.equal(
    fetchCalls.some((c) => c.method === 'DELETE'),
    false,
    'First click must NOT issue DELETE request'
  );

  await app.deletePastRun({ id: 99, status: 'failed', seed_query: 'protein' });
  assert.equal(
    fetchCalls.some((c) => c.method === 'DELETE' && c.url.includes('/api/newborn/runs/99')),
    true,
    `Second click must issue DELETE /api/newborn/runs/99 (calls: ${JSON.stringify(fetchCalls)})`
  );
});

// ---------------------------------------------------------------------------
// Batch 4: Campaign Room 1 Unification, Pin Details Provenance & Day 1 Baseline, Crawler
// ---------------------------------------------------------------------------

test('Batch 4.1: buildFolderCrossoverMatrix unifies Newborn tracked pins with 0 keywords without NaN or super-pin distortion', async () => {
  const result = await buildFolderCrossoverMatrix({
    sql: makeFakeSql(() => []),
    folder: { id: 5, name: 'high protein', description: '' },
    folderKeywords: [],
    totalKeywords: 0,
    pinRows: [
      {
        pin_id: '896990450816113805',
        title: 'High Protein Chicken Bowl',
        domain: 'fitkitchen.com',
        creator_username: 'fitchef',
        save_count: 145,
        repin_count: 20,
        daily_save_velocity: 0,
        rankings: [],
        is_tracked_pin: true,
        tracked_sources: ['newborn'],
        is_newborn_tracked: true,
        newborn_seed_query: 'high protein'
      }
    ],
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: []
  });

  assert.equal(result.summary.total_unique_pins, 1);
  assert.equal(result.summary.newborn_pins_count, 1);
  assert.equal(result.summary.tracked_pins_count, 1);
  assert.equal(result.summary.super_pins_count, 0, '0-keyword Newborn tracked pin must NOT inflate super_pins_count');
  assert.equal(result.all_pins.length, 1);
  assert.equal(result.all_pins[0].is_newborn_tracked, true);
  assert.equal(result.all_pins[0].newborn_seed_query, 'high protein');
  assert.equal(result.all_pins[0].overlap_percentage, 0);
  assert.equal(Number.isNaN(result.all_pins[0].overlap_percentage), false);
});

test('Batch 4.2: /folders SSR HTML payload stays strictly below 215 KiB budget', () => {
  const html = getCampaignFoldersPageHtml({ initialFolderId: null });
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.ok(bytes < 215 * 1024, `/folders SSR HTML (${bytes} bytes) exceeded 215 KiB (${215 * 1024} bytes)`);
});

test('Batch 4.3: getPinDossier exposes all tracked_campaigns, newborn_context, and enforces Day-1 baseline velocity=0', async () => {
  const fakeSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM universal_master_pins')) {
      return [{
        pin_id: '896990450816113805',
        title: 'High Protein Bowl',
        creator_username: 'fitchef',
        save_count: 350,
        repin_count: 40,
        daily_save_velocity: 350, // Fabricated stale DB value that must be neutralized on Day 1
        daily_repin_velocity: 40,
        delta_saves_24h: 350,
        delta_repins_24h: 40,
        created_at_pinterest: '2026-11-20T00:00:00.000Z',
        first_discovered_pillar: 'newborn',
        metadata: {}
      }];
    }
    if (entry.query.includes('FROM pins_daily_metrics')) {
      return [{
        pin_id: '896990450816113805',
        snapshot_date: '2026-11-25',
        save_count: 350,
        repin_count: 40,
        daily_save_velocity: 350,
        daily_repin_velocity: 40,
        updated_at: '2026-11-25T10:00:00.000Z'
      }];
    }
    if (entry.query.includes('FROM campaign_tracked_pins ctp')) {
      return [
        { folder_id: 5, folder_name: 'high protein', source_type: 'newborn', seed_query: 'high protein', added_at: '2026-11-25T09:00:00.000Z', notes: null },
        { folder_id: 9, folder_name: 'meal prep', source_type: 'manual', seed_query: null, added_at: '2026-11-25T08:00:00.000Z', notes: null }
      ];
    }
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{
        pin_id: '896990450816113805',
        seed_query: 'high protein',
        stage: 'promoted',
        discovery_surface: 'search',
        folder_id: 5,
        first_seen_at: '2026-11-25T08:00:00.000Z',
        promoted_at: '2026-11-25T09:00:00.000Z',
        anchor_active: true,
        anchor_baseline_saves: 350,
        anchor_last_crawled_at: null
      }];
    }
    return [];
  });

  const dossier = await getPinDossier(fakeSql, '896990450816113805');
  assert.ok(dossier);
  assert.equal(dossier.creative.is_day1_baseline, true);
  assert.equal(dossier.creative.distinct_snapshot_days, 1);
  assert.equal(dossier.creative.daily_save_velocity, 0, 'Day-1 baseline pin must never report fabricated save velocity');
  assert.equal(dossier.creative.daily_repin_velocity, 0);
  assert.equal(dossier.creative.delta_saves_24h, null);
  assert.equal(dossier.tracked_campaigns.length, 2, 'Must return ALL active tracked campaigns without LIMIT 1');
  assert.equal(dossier.tracked_campaigns[0].folder_name, 'high protein');
  assert.equal(dossier.tracked_campaigns[1].folder_name, 'meal prep');
  assert.equal(dossier.newborn_context?.seed_query, 'high protein');
  assert.equal(dossier.newborn_context?.stage, 'promoted');
  assert.equal(dossier.newborn_context?.anchor_active, true);

  // Verify Pin Details client VM formats Day-1 baseline as '—'
  const rawScript = getPinDetailsClientAppScripts().trim();
  const scriptMatch = rawScript.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const script = scriptMatch ? scriptMatch[1] : rawScript;
  const sandbox = {
    window: { location: { pathname: '/pin/896990450816113805', search: '' }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    document: { addEventListener() {}, querySelector: () => null },
    console
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(script, sandbox);
  const vmApp = sandbox.pinDetailApp('896990450816113805');
  vmApp.dossier = dossier;
  assert.equal(vmApp.isSingleDayBaseline(), true);
  assert.equal(vmApp.formatLive24hVelocity(), '—');
  assert.match(vmApp.format24hSaveDelta(), /Day 1 Baseline/i);
});

test('Batch 4.4: fetchCampaignTrackedPinsForWorker supports optional folderId scoping', async () => {
  const fakeSql = makeFakeSql(() => []);
  await fetchCampaignTrackedPinsForWorker(fakeSql, { workerIndex: 0, workerTotal: 1, folderId: 5 });
  assert.equal(fakeSql.calls.length, 1);
  assert.ok(fakeSql.calls[0].query.includes('ctp.folder_id ='), 'Expected folder_id filter clause in SQL');
  assert.ok(fakeSql.calls[0].values.includes(5), 'Expected folderId=5 parameter binding');
});

// ---------------------------------------------------------------------------
// Batch 5: Dual-Angle Forensic Audit Remediation (Bugs #1 - #7)
// ---------------------------------------------------------------------------

test('Batch 5.1 (Bug #1): Ideas Hub responses with is_interest=false + valid numeric id are accepted across all 4 engines', async () => {
  clearInterestVolumeCaches();
  const mockIdeaPayload = {
    resource_response: {
      status: 'success',
      data: {
        id: '922189954262',
        is_interest: false,
        key: 'green bean casserole',
        url_name: 'green-bean-casserole',
        internal_search_count: 857132,
        seo_related_interests: [
          {
            name: 'cheesy green bean casserole',
            origin_interest_id: '905473139309',
            url: '/ideas/cheesy-green-bean-casserole/905473139309/'
          }
        ]
      }
    }
  };

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('InterestResource/get')) {
      return makeJsonResponse(mockIdeaPayload);
    }
    if (u.includes('BestPinsFeedAltResource/get')) {
      return makeJsonResponse({
        resource_response: {
          data: [{ id: '991122334455', type: 'pin', title: 'Best Green Bean Casserole', repin_count: 42 }]
        }
      });
    }
    return makeJsonResponse({}, 404);
  };

  // 1. trends-service.mjs
  const volRes = await fetchPinterestInterestVolume('green bean casserole', { fetchImpl: mockFetch, force: true });
  assert.ok(volRes, 'fetchPinterestInterestVolume must accept is_interest=false with valid 12-digit numeric id');
  assert.equal(volRes.id, '922189954262');
  assert.equal(volRes.internal_search_count, 857132);

  // 2. surface-trends.mjs (resolveIdeaPageIntelligence via custom router)
  const router = new NewbornCookieRouter({ rawCookie: '_auth=1; csrftoken=tok', fetchImpl: mockFetch });
  const ideaRes = await resolveIdeaPageIntelligence('green bean casserole', { router, country: 'US' });
  assert.equal(ideaRes.found, true);
  assert.equal(ideaRes.id, '922189954262');
  assert.equal(ideaRes.internal_search_count, 857132);

  // 3. surface-search-boards.mjs (harvestIdeasHubSurface)
  const hubRes = await harvestIdeasHubSurface(router, 'green bean casserole', { maxPages: 1 });
  assert.equal(Boolean(hubRes.skipped_non_interest), false);
  assert.equal(hubRes.ok, true);
  assert.equal(hubRes.pins.length, 1);

  // 4. cluster-builder.mjs (enrichClusterRemainingVolumes + Bug #3 stale zero-volume recovery)
  const fakeSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_keyword_clusters')) {
      return [{
        id: 77,
        seed_keyword: 'green bean casserole',
        country: 'US',
        idea_page: { found: false },
        keywords: [
          {
            keyword: 'green bean casserole',
            has_taxonomy: false,
            volume: null,
            volume_enriched: true
          }
        ],
        metadata: {}
      }];
    }
    return [];
  });

  const enriched = await enrichClusterRemainingVolumes(fakeSql, 77, { router, batchLimit: 10 });
  assert.equal(enriched.newly_enriched_count, 1);
  assert.equal(enriched.keywords[0].has_taxonomy, true);
  assert.equal(enriched.keywords[0].interest_id, '922189954262');
  assert.equal(enriched.keywords[0].volume, 857132);
  assert.equal(enriched.keywords[0].volume_rechecked_v2, true);
  assert.equal(enriched.idea_page.found, true, 'Recovered seed row must also hydrate cluster idea_page');
  assert.equal(enriched.idea_page.internal_search_count, 857132);
});

test('Batch 5.2 (Bug #2): cluster-builder preserves rel.url / origin_interest_id and retries slug-only when knownId returns 0 count', async () => {
  const seenDataParams = [];
  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('latest_available_date')) return makeJsonResponse({ date: '2026-11-20' });
    if (u.includes('top_trends_filtered')) return makeJsonResponse({ values: [] });
    if (u.includes('AdvancedTypeaheadResource')) return makeJsonResponse({ resource_response: { data: { items: [] } } });
    if (u.includes('trends.pinterest.com/metrics')) return makeJsonResponse({ metrics: {} });
    if (u.includes('InterestResource/get')) {
      const parsed = new URL(u);
      const dataObj = JSON.parse(parsed.searchParams.get('data') || '{}');
      const opts = dataObj.options || {};
      seenDataParams.push(opts);
      // Seed lookup returns related interest with url + origin_interest_id (no url_name)
      if (opts.interest === 'green-bean-casserole') {
        return makeJsonResponse({
          resource_response: {
            data: {
              id: '922189954262',
              is_interest: false,
              key: 'green bean casserole',
              url_name: 'green-bean-casserole',
              internal_search_count: 857132,
              seo_related_interests: [
                {
                  name: "campbell's green bean casserole",
                  origin_interest_id: '958474844170',
                  url: '/ideas/campbells-green-bean-casserole/958474844170/'
                }
              ]
            }
          }
        });
      }
      // Combined interest_id lookup returns 200 with 0 search count -> must retry slug-only!
      if (opts.interest_id === '958474844170') {
        return makeJsonResponse({
          resource_response: {
            data: {
              id: '958474844170',
              is_interest: false,
              internal_search_count: 0
            }
          }
        });
      }
      // Slug-only retry returns real volume + nested related interest without url_name
      if (opts.interest === 'campbells-green-bean-casserole' && !opts.interest_id) {
        return makeJsonResponse({
          resource_response: {
            data: {
              id: '958474844170',
              is_interest: false,
              url_name: 'campbells-green-bean-casserole',
              internal_search_count: 10748,
              seo_related_interests: [
                {
                  name: 'cheesy green bean casserole',
                  origin_interest_id: '905473139309',
                  url: '/ideas/cheesy-green-bean-casserole/905473139309/'
                }
              ]
            }
          }
        });
      }
    }
    return makeJsonResponse({}, 404);
  };

  const router = new NewbornCookieRouter({ rawCookie: '', fetchImpl: mockFetch });
  const cluster = await buildNewbornKeywordCluster(null, {
    seedKeyword: 'green bean casserole',
    country: 'US',
    router,
    routerOptions: { fetchImpl: mockFetch }
  });

  const campbells = cluster.keywords.find((k) => k.keyword === "campbell's green bean casserole");
  assert.ok(campbells, 'Expected campbells related interest in cluster');
  assert.equal(campbells.volume, 10748, 'Slug-only retry must recover 10,748 volume when combined interest_id returns 0');
  assert.equal(campbells.has_taxonomy, true);

  const cheesy = cluster.keywords.find((k) => k.keyword === 'cheesy green bean casserole');
  assert.ok(cheesy, 'Expected 2nd-hop related interest extracted from seo_related_interests');
  assert.equal(cheesy.interest_id, '905473139309');
  assert.equal(cheesy.idea_url, 'https://www.pinterest.com/ideas/cheesy-green-bean-casserole/905473139309/');
  assert.ok(
    seenDataParams.some((o) => o.interest === 'campbells-green-bean-casserole' && !o.interest_id),
    'Must retry InterestResource/get with slug-only options when knownId call returns 0 count'
  );
});

test('Batch 5.3 (Bugs #4, #5, #6): Room 1 seed_query/repins display, keyword filter matches newborn_seed_query, and Send to Campaign skips existing master pins', async () => {
  // Bug #6: addCampaignTrackedPins with missing_in_master=false must NOT call ingestPinsBatch (universal_master_pins upsert)
  const existingMasterSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders')) return [{ id: 5, workspace_id: 1 }];
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{ pin_id: '3333333333', save_count: 6808, repin_count: 100, seed_query: 'high protein', missing_in_master: false }];
    }
    if (entry.query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ pin_id: '3333333333', source_type: 'newborn' }];
    }
    return [];
  });

  await addCampaignTrackedPins(existingMasterSql, {
    folderId: 5,
    pinIds: ['3333333333'],
    sourceType: 'newborn',
    sourceRef: 'high protein'
  });

  assert.equal(
    existingMasterSql.calls.some((c) => c.query.includes('INSERT INTO universal_master_pins')),
    false,
    'Existing universal_master_pins rows must NOT be overwritten by stale newborn_candidates snapshot'
  );
  assert.equal(
    existingMasterSql.calls.some((c) => c.query.includes('INSERT INTO newborn_daily_anchors')),
    true,
    'Newborn anchor must still be registered even when pin already exists in universal_master_pins'
  );

  // Bug #4: listCampaignTrackedPins queries COALESCE seed_query and /folders HTML renders Newborn seed + repins
  const listSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders')) return [{ id: 5, workspace_id: 1 }];
    if (entry.query.includes('FROM campaign_tracked_pins ctp')) {
      return [{
        folder_id: 5,
        workspace_id: 1,
        pin_id: '3333333333',
        source_type: 'newborn',
        seed_query: 'high protein',
        save_count: 6808,
        repin_count: 240,
        title: 'Protein Bowl'
      }];
    }
    return [];
  });

  const tracked = await listCampaignTrackedPins(listSql, { folderId: 5, workspaceId: 1 });
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].seed_query, 'high protein');
  assert.ok(
    listSql.calls.some((c) => c.query.includes('NULLIF(TRIM(ctp.seed_query)') && c.query.includes('LEFT JOIN newborn_daily_anchors')),
    'listCampaignTrackedPins must select coalesced seed_query from ctp/nda/nc'
  );

  const foldersHtml = getCampaignFoldersPageHtml({ initialFolderId: 5 });
  assert.ok(foldersHtml.includes("🔥 Newborn"), 'Room 1 tracked pin card must render Newborn seed badge');
  assert.ok(foldersHtml.includes("tp.repin_count || 0) + ' rp'"), 'Room 1 tracked pin card must render repin_count');

  // Bug #5: folders-client-app.mjs scopeFilter keyword match retains Newborn pins by newborn_seed_query
  const rawFoldersScript = getFoldersClientAppScript().trim();
  const match = rawFoldersScript.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const foldersScript = match ? match[1] : rawFoldersScript;
  const sandbox = {
    window: {
      location: { pathname: '/folders', search: '', href: 'http://localhost/folders' },
      history: { replaceState() {}, pushState() {} },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {}
    },
    document: { addEventListener() {}, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL,
    URLSearchParams,
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(foldersScript, sandbox);

  const foldersVm = sandbox.foldersApp(5);
  foldersVm.crossoverData = {
    all_pins: [
      { pin_id: '101', title: 'SERP Pin', rankings: [{ keyword: 'high protein', rank_position: 1 }], is_newborn_tracked: false },
      { pin_id: '202', title: 'Newborn Pin', rankings: [], is_newborn_tracked: true, newborn_seed_query: 'high protein' },
      { pin_id: '303', title: 'Other Newborn Pin', rankings: [], is_newborn_tracked: true, newborn_seed_query: 'keto lunch' }
    ]
  };
  foldersVm.scopeFilter = 'high protein';
  const filtered = foldersVm.filteredPinsList();
  assert.deepEqual(
    filtered.map((p) => p.pin_id).sort(),
    ['101', '202'],
    'Keyword scopeFilter must retain Newborn pins whose newborn_seed_query matches the selected keyword'
  );
});

test('Batch 5.4 (Bug #7): Mode C (--folder-id) disables enable_serp_harvest when campaign folder has 0 keywords', async () => {
  const fakeSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM keyword_folders')) {
      return [{ id: 12, name: 'Newborn Only Campaign', metadata: { enable_serp_harvest: true } }];
    }
    if (entry.query.includes('FROM keyword_folder_items kfi')) {
      return [];
    }
    return [];
  });

  const dispatch = await runKeywordFleetDispatch({
    sql: fakeSql,
    env: {
      FOLDER_ID: '12',
      ENABLE_SERP_HARVEST: 'true'
    }
  });

  assert.equal(dispatch.mode, 'folder_pin_partition');
  assert.ok(dispatch.matrixTasks.length > 0);
  assert.equal(
    dispatch.matrixTasks.every((t) => t.enable_serp_harvest === false),
    true,
    'Mode C must set enable_serp_harvest=false when folderKeywords.length === 0 to avoid unnecessary barrier sync'
  );
});
