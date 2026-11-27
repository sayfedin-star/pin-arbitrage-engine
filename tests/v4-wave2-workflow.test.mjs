import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { getCompetitorsOverview } from '../src/modules/creators/competitors-crud.mjs';
import { buildFolderCrossoverMatrix } from '../src/modules/keywords/folders-crossover-builders.mjs';
import { formatPinSummary } from '../src/modules/pulse/pulse-payload-builder.mjs';
import {
  addCampaignTrackedPins,
  getCampaignTrackedPinsSummary,
  syncCampaignTopNSerpPins,
  listCampaignPinGraphSeeds,
  addCampaignPinGraphSeeds,
  removeCampaignPinGraphSeed,
  normalizeWatchlistEntityKey,
  upsertWatchlistItem
} from '../src/modules/workspaces/service.mjs';
import { isWatchlistRoute, handleWatchlistRoutes } from '../src/routes/watchlist.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { handleNewbornRoutes } from '../src/routes/newborn.mjs';
import { listNewbornRuns } from '../src/modules/newborn/queries.mjs';
import {
  getNewbornRunById,
  cancelNewbornRun,
  setInMemoryRunProgress,
  clearNewbornInflightRunsForTest
} from '../src/modules/newborn/run-queue.mjs';
import {
  listNewbornKeywordClusters,
  enrichClusterRemainingVolumes
} from '../src/modules/newborn/cluster-builder.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { jsonResponse as realJsonResponse } from '../src/http/security-and-response.mjs';
import { fetchCampaignTrackedPinsForWorker } from '../scripts/keyword-velocity-crawler.mjs';

function createMockSql(handler) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join('?') : String(strings);
    calls.push({ query, values });
    return handler(query, values, calls.length - 1);
  };
  sql.calls = calls;
  return sql;
}

// =========================================================================
// PILLAR 0: /api/creators BIGINT OVERFLOW HOTFIX
// =========================================================================

test('Pillar 0: getCompetitorsOverview casts SUM(total_pins) to ::bigint and handles > INT4_MAX', async () => {
  const bigPins = '3500000000';
  const sql = createMockSql((query) => {
    if (/FROM\s+competitor_profiles/i.test(query) && /SUM\(total_pins\)/i.test(query)) {
      assert.match(query, /COALESCE\(SUM\(total_pins\),\s*0\)::bigint/i);
      return [{
        total_profiles: 42,
        active_count: 40,
        paused_count: 2,
        competitor_count: 41,
        own_count: 1,
        total_audience: '9900000000',
        total_impressions: '12500000000',
        combined_reach: '9900000000',
        total_pins_tracked: bigPins
      }];
    }
    if (/ORDER BY monthly_reach DESC/i.test(query)) {
      return [{ username: 'megachef', monthly_reach: 10000001 }];
    }
    return [];
  });

  const overview = await getCompetitorsOverview(sql);
  assert.equal(overview.pins_tracked, 3500000000);
  assert.equal(overview.tracked_profiles, 42);
  assert.equal(overview.top_competitor.handle, '@megachef');
});

// =========================================================================
// PILLAR 1: HTML ENTITIES, 4-SOURCE TRACKING, TOP-N SYNC & VELOCITY WINDOWS
// =========================================================================

test('Pillar 1: HTML entities (&#129472; -> 🧀) are decoded in Campaign Studio crossover & Pulse summaries', async () => {
  const sql = createMockSql(() => []);
  const matrix = await buildFolderCrossoverMatrix({
    sql,
    folder: { id: 5, name: 'High Protein', created_at: '2026-01-01T00:00:00Z' },
    folderKeywords: [{ id: 101, keyword: 'high protein meals' }],
    totalKeywords: 1,
    pinRows: [{
      pin_id: '9876543210123',
      keyword_id: 101,
      keyword_text: 'high protein meals',
      rank_position: 1,
      title: 'High-Protein Quesadilla &amp; creamy filling &#129472;',
      seo_title: 'High-Protein Quesadilla &#129472;',
      board_name: 'Mac &amp; Cheese &#129472;',
      description: 'Easy &amp; cheesy &#129472;',
      creator_name: 'Chef &amp; Co',
      creator_username: 'chefco',
      domain: 'simplymealpath.com',
      destination_url: 'https://simplymealpath.com/quesadilla',
      image_url: 'https://i.pinimg.com/test.jpg',
      save_count: 1658,
      repin_count: 900,
      daily_save_velocity: 25,
      delta_saves_24h: 25,
      delta_repins_24h: 10,
      gains_5d: 120,
      gains_7d: 180,
      gains_10d: 260,
      gains_15d: 410,
      visual_annotations: ['High Protein Dinner', 'Healthy Meal Prep'],
      is_displaced: false
    }],
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: []
  });

  const pin = matrix.all_cluster_pins?.[0] || matrix.super_pins?.[0];
  assert.ok(pin, 'Expected at least one pin in crossover matrix');
  assert.equal(pin.title, 'High-Protein Quesadilla & creamy filling 🧀');
  assert.equal(pin.board_name, 'Mac & Cheese 🧀');
  assert.equal(pin.gains_5d, 120);
  assert.equal(pin.gains_10d, 260);
  assert.equal(pin.gains_15d, 410);

  const pulsePin = formatPinSummary({
    pin_id: '9876543210123',
    title: 'Creamy no mess filling &#129472; &amp; herbs',
    board_name: 'Dinners &amp; Bowls &#129472;',
    save_count: 500,
    daily_save_velocity: 40,
    delta_saves_24h: 40,
    delta_repins_24h: 15
  });
  assert.equal(pulsePin.title, 'Creamy no mess filling 🧀 & herbs');
  assert.equal(pulsePin.board_name, 'Dinners & Bowls 🧀');
});

test('Pillar 1: getCampaignTrackedPinsSummary returns 4-source counts and decoded titles', async () => {
  const sql = createMockSql((query, values) => {
    if (/FROM\s+keyword_folders/i.test(query)) {
      return values[0] === 5 && values[1] === 1
        ? [{ id: 5, name: 'High Protein', workspace_id: 1, serp_top_n: 30, metadata: {} }]
        : [];
    }
    if (/FROM\s+campaign_tracked_pins\s+ctp/i.test(query)) {
      return [
        {
          folder_id: 5,
          workspace_id: 1,
          pin_id: '1111111111',
          source_type: 'search',
          source_ref: 'serp_top_30',
          is_active: true,
          title: 'Cheesy Bowl &#129472;',
          board_name: 'Quick &amp; Easy',
          save_count: 250,
          daily_save_velocity: 18
        },
        {
          folder_id: 5,
          workspace_id: 1,
          pin_id: '2222222222',
          source_type: 'newborn',
          source_ref: 'run:42',
          is_active: true,
          title: 'Viral Salad',
          board_name: 'Lunches',
          save_count: 90,
          daily_save_velocity: 12
        }
      ];
    }
    if (/GROUP BY\s+source_type/i.test(query)) {
      return [
        { source_type: 'search', cnt: 12 },
        { source_type: 'newborn', cnt: 4 },
        { source_type: 'creator', cnt: 3 },
        { source_type: 'related', cnt: 1 }
      ];
    }
    return [];
  });

  const summary = await getCampaignTrackedPinsSummary(sql, { folderId: 5, workspaceId: 1 });
  assert.equal(summary.serp_top_n, 30);
  assert.equal(summary.total, 20);
  assert.deepEqual(summary.source_counts, { all: 20, search: 12, newborn: 4, creator: 3, related: 1 });
  assert.equal(summary.items[0].title, 'Cheesy Bowl 🧀');
  assert.equal(summary.items[0].board_name, 'Quick & Easy');
});

test('Pillar 1: syncCampaignTopNSerpPins clamps top_n (5..100), uses keyword_folder_items, and blocks cross-workspace (404)', async () => {
  let capturedRankLimit = null;
  let capturedSourceRef = null;
  const sql = createMockSql((query, values) => {
    if (/FROM\s+keyword_folders/i.test(query)) {
      return values[0] === 5 && values[1] === 1
        ? [{ id: 5, name: 'High Protein', workspace_id: 1, serp_top_n: 20, metadata: {} }]
        : [];
    }
    if (/FROM\s+keyword_folder_items\s+kfi/i.test(query)) {
      capturedRankLimit = values[1];
      return [{ pin_id: '100000001' }, { pin_id: '100000002' }];
    }
    if (/INSERT INTO\s+campaign_tracked_pins/i.test(query)) {
      capturedSourceRef = values[3];
      return [{ pin_id: '100000001', source_type: 'search' }, { pin_id: '100000002', source_type: 'search' }];
    }
    return [];
  });

  const res = await syncCampaignTopNSerpPins(sql, { folderId: 5, workspaceId: 1, topN: 250 });
  assert.equal(res.top_n, 100);
  assert.equal(capturedRankLimit, 100);
  assert.equal(capturedSourceRef, 'serp_top_100');
  assert.equal(res.synced, 2);

  await assert.rejects(
    () => syncCampaignTopNSerpPins(sql, { folderId: 5, workspaceId: 2 }),
    (err) => err.status === 404
  );
});

test('Pillar 1: Campaign Studio client velocity helpers react dynamically to 24h, 5d, 7d, 10d, 15d, and all', () => {
  const scriptHtml = getFoldersClientAppScript();
  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/i);
  assert.ok(match, 'Expected <script> block in getFoldersClientAppScript()');

  const sandbox = {
    window: {
      location: { pathname: '/folders/5', search: '' },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {}
    },
    document: { documentElement: { classList: { toggle: () => {} } }, cookie: '' },
    URLSearchParams,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  const app = sandbox.foldersApp(5);

  const samplePin = {
    save_count: 8487,
    repin_count: 6400,
    effective_velocity: 398,
    daily_save_velocity: 398,
    delta_repins_24h: 397,
    gains_5d: 1990,
    gains_7d: 2827,
    gains_10d: 3980,
    gains_15d: 5200,
    repins_gains_5d: 1850,
    repins_gains_7d: 2600,
    repins_gains_10d: 3600,
    repins_gains_15d: 4800
  };

  app.selectedTimeWindow = '24h';
  assert.equal(app.getSelectedWindowLabel(), '24h Velocity');
  assert.equal(app.getPinWindowGain(samplePin), 398);
  assert.equal(app.getPinWindowRepins(samplePin), 397);
  assert.equal(app.formatPinWindowPrimary(samplePin), '+398/d');

  app.selectedTimeWindow = '5d';
  assert.equal(app.getSelectedWindowLabel(), '5d Gains');
  assert.equal(app.getPinWindowGain(samplePin), 1990);
  assert.equal(app.getPinWindowRepins(samplePin), 1850);
  assert.equal(app.formatPinWindowPrimary(samplePin), '+1,990 (5d)');

  app.selectedTimeWindow = '7d';
  assert.equal(app.getSelectedWindowLabel(), '7d Gains');
  assert.equal(app.getPinWindowGain(samplePin), 2827);
  assert.equal(app.getPinWindowRepins(samplePin), 2600);
  assert.equal(app.formatPinWindowPrimary(samplePin), '+2,827 (7d)');

  app.selectedTimeWindow = '10d';
  assert.equal(app.getSelectedWindowLabel(), '10d Gains');
  assert.equal(app.getPinWindowGain(samplePin), 3980);
  assert.equal(app.formatPinWindowPrimary(samplePin), '+3,980 (10d)');

  app.selectedTimeWindow = '15d';
  assert.equal(app.getSelectedWindowLabel(), '15d Gains');
  assert.equal(app.getPinWindowGain(samplePin), 5200);
  assert.equal(app.formatPinWindowPrimary(samplePin), '+5,200 (15d)');

  app.selectedTimeWindow = 'all';
  assert.equal(app.getSelectedWindowLabel(), 'All-Time Saves');
  assert.equal(app.getPinWindowGain(samplePin), 8487);
  assert.equal(app.getPinWindowRepins(samplePin), 6400);
});

// =========================================================================
// PILLAR 2: UNIFIED WORKSPACE WATCHLIST API & NORMALIZATION
// =========================================================================

test('Pillar 2: normalizeWatchlistEntityKey normalizes creators, domains, and pin URLs', () => {
  assert.equal(normalizeWatchlistEntityKey('creator', '@ChefJane'), 'chefjane');
  assert.equal(normalizeWatchlistEntityKey('creator', 'https://www.pinterest.com/ChefJane/boards/'), 'chefjane');
  assert.equal(normalizeWatchlistEntityKey('domain', 'https://www.SimplyMealPath.com/recipes/1'), 'simplymealpath.com');
  assert.equal(normalizeWatchlistEntityKey('pin', 'https://www.pinterest.com/pin/987654321098/'), '987654321098');
  assert.equal(normalizeWatchlistEntityKey('pin', 'not-a-pin'), '');
});

test('Pillar 2: /api/watchlist CRUD enforces workspace_id isolation, validation, and private no-store headers', async () => {
  assert.equal(isWatchlistRoute('/api/watchlist'), true);
  assert.equal(isWatchlistRoute('/api/watchlist/7'), true);
  assert.equal(isWatchlistRoute('/api/folders'), false);

  const jsonResponse = (data, status = 200, cacheSeconds = 0, customCors = null) => {
    let statusCode = status;
    const headers = new Headers();
    let payload = null;
    const mockReply = {
      sent: false,
      code(c) { statusCode = c; return this; },
      header(k, v) { headers.set(k, String(v)); return this; },
      send(body) { this.sent = true; payload = body; return this; }
    };
    realJsonResponse(data, status, cacheSeconds, customCors, mockReply);
    return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
      status: statusCode,
      headers
    });
  };
  const methodNotAllowedResponse = (allow) => new Response('Method Not Allowed', { status: 405, headers: { Allow: String(allow) } });

  const sql = createMockSql((query, values) => {
    if (/GROUP BY\s+entity_type/i.test(query)) {
      return [{ entity_type: 'creator', cnt: 1 }];
    }
    if (/FROM\s+workspace_watchlist\s+w\b/i.test(query)) {
      assert.equal(values[0], 2);
      return [{ id: 10, workspace_id: 2, entity_type: 'creator', entity_key: 'chefjane', pin_title: 'Test &#129472;' }];
    }
    if (/INSERT INTO\s+workspace_watchlist/i.test(query)) {
      assert.doesNotMatch(query, /\b(is_active|display_label|added_at)\b/i, 'workspace_watchlist INSERT must match Migration 012 schema');
      return [{ id: 11, workspace_id: 2, entity_type: values[1], entity_key: values[2], creator_tracking_mode: values[3] }];
    }
    if (/UPDATE\s+workspace_watchlist/i.test(query)) {
      assert.doesNotMatch(query, /\b(is_active|display_label)\b/i, 'workspace_watchlist UPDATE must match Migration 012 schema');
      // Simulate cross-workspace miss for workspaceId !== 2
      return values[3] === 2
        ? [{ id: 11, workspace_id: 2, entity_type: 'creator', entity_key: 'chefjane', creator_tracking_mode: values[0] || 'metrics_only' }]
        : [];
    }
    if (/DELETE FROM\s+workspace_watchlist/i.test(query)) {
      return values[1] === 2 ? [{ id: 11, entity_type: 'creator', entity_key: 'chefjane' }] : [];
    }
    return [];
  });

  // GET scoped to workspace 2
  const getRes = await handleWatchlistRoutes({
    pathname: '/api/watchlist',
    method: 'GET',
    request: new Request('https://app.hymum.com/api/watchlist'),
    searchParams: new URLSearchParams(),
    sql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse
  });
  assert.equal(getRes.status, 200);
  assert.match(getRes.headers.get('Cache-Control') || '', /private.*no-store/i);
  assert.equal(getRes.headers.get('Vary'), 'Cookie');
  const getBody = await getRes.json();
  assert.equal(getBody.workspace_id, 2);
  assert.equal(getBody.items[0].pin_title, 'Test 🧀');
  assert.equal(getBody.counts.creator, 1);

  // POST valid creator
  const postRes = await handleWatchlistRoutes({
    pathname: '/api/watchlist',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'creator', entity_key: '@ChefJane', creator_tracking_mode: 'metrics_full_catalog' })
    }),
    searchParams: new URLSearchParams(),
    sql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse
  });
  assert.equal(postRes.status, 201);
  const postBody = await postRes.json();
  assert.equal(postBody.item.entity_key, 'chefjane');
  assert.equal(postBody.item.creator_tracking_mode, 'metrics_full_catalog');

  // PATCH invalid mode -> 400
  const badPatch = await handleWatchlistRoutes({
    pathname: '/api/watchlist/11',
    method: 'PATCH',
    request: new Request('https://app.hymum.com/api/watchlist/11', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator_tracking_mode: 'bogus_mode' })
    }),
    searchParams: new URLSearchParams(),
    sql,
    workspaceId: 2,
    jsonResponse,
    methodNotAllowedResponse
  });
  assert.equal(badPatch.status, 400);

  // DELETE cross-workspace (workspace 1 trying to delete workspace 2's item) -> 404
  const crossDel = await handleWatchlistRoutes({
    pathname: '/api/watchlist/11',
    method: 'DELETE',
    request: new Request('https://app.hymum.com/api/watchlist/11', { method: 'DELETE' }),
    searchParams: new URLSearchParams(),
    sql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse
  });
  assert.equal(crossDel.status, 404);
});

// =========================================================================
// PILLAR 3: CAMPAIGN PIN GRAPH SEEDS, CLUSTER -> CAMPAIGN, NEWBORN ISOLATION
// =========================================================================

test('Pillar 3: Campaign Pin Graph Seeds CRUD enforces workspace isolation and depth bounds (1..3)', async () => {
  const sql = createMockSql((query, values) => {
    if (/FROM\s+keyword_folders/i.test(query)) {
      return values[0] === 5 && values[1] === 1
        ? [{ id: 5, name: 'High Protein', workspace_id: 1 }]
        : [];
    }
    if (/INSERT INTO\s+campaign_pin_graph_seeds/i.test(query)) {
      assert.doesNotMatch(query, /\bdepth\b/i, 'campaign_pin_graph_seeds INSERT must match Migration 012 schema');
      assert.match(query, /'queued'/, 'campaign_pin_graph_seeds status must satisfy chk_cpgs_status');
      return [{ seed_pin_id: '555555555', source_type: values[2] || 'manual', status: 'queued' }];
    }
    if (/FROM\s+campaign_pin_graph_seeds\s+s/i.test(query)) {
      assert.doesNotMatch(query, /\bs\.(depth|extracted_count|last_run_at)\b/i, 'campaign_pin_graph_seeds SELECT must match Migration 012 schema');
      return [{ folder_id: 5, workspace_id: 1, seed_pin_id: '555555555', source_type: 'manual', status: 'queued', title: 'Cheesy &#129472;' }];
    }
    if (/DELETE FROM\s+campaign_pin_graph_seeds/i.test(query)) {
      return [{ seed_pin_id: '555555555' }];
    }
    return [];
  });

  const added = await addCampaignPinGraphSeeds(sql, { folderId: 5, workspaceId: 1, pinIds: ['555555555', 'invalid'], depth: 9 });
  assert.equal(added.added, 1);
  assert.equal(added.depth, 3);

  const listed = await listCampaignPinGraphSeeds(sql, { folderId: 5, workspaceId: 1 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'Cheesy 🧀');

  const removed = await removeCampaignPinGraphSeed(sql, { folderId: 5, workspaceId: 1, pinId: '555555555' });
  assert.equal(removed.removed, 1);

  await assert.rejects(
    () => listCampaignPinGraphSeeds(sql, { folderId: 5, workspaceId: 9 }),
    (err) => err.status === 404
  );
});

test('Pillar 3: POST /api/folders/:id/items accepts keyword text arrays for Newborn Cluster -> Campaign', async () => {
  let nextKwId = 500;
  const linkedPairs = [];
  const sql = createMockSql((query, values) => {
    if (/FROM\s+keyword_folders/i.test(query)) {
      return [{ id: 5, name: 'High Protein', workspace_id: 1 }];
    }
    if (/INSERT INTO\s+tracked_keywords/i.test(query)) {
      return [{ id: ++nextKwId, keyword: values[0] }];
    }
    if (/INSERT INTO\s+keyword_folder_items/i.test(query)) {
      linkedPairs.push(values);
      return [{ folder_id: 5, keyword_id: values[1] }];
    }
    return [];
  });

  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

  const res = await handleFoldersRoutes({
    pathname: '/api/folders/5/items',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/folders/5/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: ['high protein soup', 'creamy chicken soup', 'high protein soup'] })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    sql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse: () => new Response('', { status: 405 }),
    invalidateEdgeCache: async () => {}
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.added_count, 2);
  assert.equal(body.keyword_ids.length, 2);
});

test('Pillar 3: Newborn listNewbornRuns and listNewbornKeywordClusters filter strictly by workspace_id without silent 42703 catches', async () => {
  const seenRuns = [];
  const sqlRunsWs2 = createMockSql((query, values) => {
    seenRuns.push({ query, values });
    return [{ id: 12, workspace_id: 2, status: 'completed' }];
  });
  const ws2Runs = await listNewbornRuns(sqlRunsWs2, { limit: 10, workspaceId: 2 });
  assert.equal(ws2Runs.length, 1);
  assert.match(seenRuns[0].query, /WHERE workspace_id = \?/i);
  assert.ok(seenRuns[0].values.includes(2));

  // Pre-migration 42703 errors must propagate loudly instead of silently dropping workspace_id filtering
  const sqlRuns42703 = createMockSql(() => {
    const err = new Error('column "workspace_id" does not exist');
    err.code = '42703';
    throw err;
  });
  await assert.rejects(() => listNewbornRuns(sqlRuns42703, { limit: 10, workspaceId: 1 }), { code: '42703' });

  const seenClusters = [];
  const sqlClustersWs3 = createMockSql((query, values) => {
    seenClusters.push({ query, values });
    return [{ id: 9, workspace_id: 3, seed_keyword: 'soup' }];
  });
  const ws3Clusters = await listNewbornKeywordClusters(sqlClustersWs3, { limit: 10, workspaceId: 3 });
  assert.equal(ws3Clusters.length, 1);
  assert.match(seenClusters[0].query, /workspace_id = \?/i);
  assert.ok(seenClusters[0].values.includes(3));

  const sqlClusters42703 = createMockSql(() => {
    const err = new Error('column "workspace_id" does not exist');
    err.code = '42703';
    throw err;
  });
  await assert.rejects(() => listNewbornKeywordClusters(sqlClusters42703, { limit: 10, workspaceId: 1 }), { code: '42703' });
});

// =========================================================================
// PILLAR 4: 5 GITHUB ACTIONS WORKFLOW NAMES + DAILY PULSE 4-SOURCE TRACKING
// =========================================================================

test('Pillar 4: GitHub Actions 5 workflows have clean short names and preserve all YAML invariants', () => {
  const wfDir = path.resolve(process.cwd(), '.github/workflows');
  const expected = [
    { file: 'ci.yml', name: 'Deploy', needsCron: false, needsSkipWakeup: false, needsRunName: false },
    { file: 'keyword-intelligence-velocity.yml', name: 'Daily Pulse', needsCron: true, needsSkipWakeup: true, needsRunName: false },
    { file: 'crawler-pipeline.yml', name: 'Creator Sync', needsCron: true, needsSkipWakeup: false, needsRunName: false },
    { file: 'newborn-hunter.yml', name: 'Newborn Hunt', needsCron: false, forbidCron: true, needsSkipWakeup: false, needsRunName: false },
    { file: 'related-pins-crawler.yml', name: 'Related Pins', needsCron: false, needsSkipWakeup: false, needsRunName: true }
  ];

  for (const wf of expected) {
    const content = fs.readFileSync(path.join(wfDir, wf.file), 'utf8');
    const firstLine = content.split(/\r?\n/)[0].trim();
    assert.equal(firstLine, `name: ${wf.name}`, `${wf.file} line 1 should be "name: ${wf.name}"`);
    assert.match(content, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/, `${wf.file} must keep FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`);
    if (wf.needsCron) {
      assert.match(content, /cron:\s*['"][^'"]+['"]/, `${wf.file} must preserve schedule cron`);
    }
    if (wf.forbidCron) {
      assert.doesNotMatch(content, /^\s*schedule:/m, `${wf.file} must NOT have an automatic schedule: cron trigger (Wave 4)`);
      assert.doesNotMatch(content, /^\s*-\s*cron:/m, `${wf.file} must NOT have a cron entry (Wave 4)`);
    }
    if (wf.needsSkipWakeup) {
      assert.match(content, /skip-wakeup:\s*['"]true['"]/, `${wf.file} must preserve skip-wakeup: 'true'`);
      assert.match(content, /!cancelled\(\)/, `${wf.file} must preserve !cancelled()`);
    }
    if (wf.needsRunName) {
      assert.match(content, /^run-name:/m, `${wf.file} must preserve dynamic run-name:`);
    }
  }
});

test('Pillar 4: fetchCampaignTrackedPinsForWorker shards pins cleanly and falls back on missing table (42P01)', async () => {
  const sqlOk = createMockSql((query, values) => {
    assert.match(query, /FROM\s+campaign_tracked_pins/i);
    assert.match(query, /LEFT JOIN\s+universal_master_pins/i);
    assert.equal(values[0], 4);
    assert.equal(values[1], 1);
    return [{
      pin_id: '777777777',
      save_count: 150,
      repin_count: 80,
      daily_save_velocity: 10,
      created_at_pinterest: '2026-04-01T00:00:00Z',
      last_scraped_at: null,
      domain: 'example.com',
      title: 'Test Pin',
      source_types: ['newborn', 'creator']
    }];
  });

  const rows = await fetchCampaignTrackedPinsForWorker(sqlOk, { workerIndex: 1, workerTotal: 4 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pin_id, '777777777');

  const sqlMissing = createMockSql(() => {
    const err = new Error('relation "campaign_tracked_pins" does not exist');
    err.code = '42P01';
    throw err;
  });
  const fallback = await fetchCampaignTrackedPinsForWorker(sqlMissing, { workerIndex: 0, workerTotal: 1 });
  assert.deepEqual(fallback, []);

  const fleetSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-fleet.mjs'), 'utf8');
  assert.match(fleetSource, /campaign_tracked_pins/, 'scripts/keyword-fleet.mjs must include campaign_tracked_pins in Stage 0 count');
});

// =========================================================================
// PHASE 1.5 SURGICAL FIX REGRESSION TESTS (BLOCKER-1, BLOCKER-2, HIGH-1, MEDIUM-1..4, NIT-1)
// =========================================================================

test('Phase 1.5 BLOCKER-1 regression: getNewbornRunById isolates DB (lite + full) and inMemoryRunProgressCache by workspaceId', async () => {
  clearNewbornInflightRunsForTest();
  try {
    setInMemoryRunProgress(901, {
      id: 901,
      workspace_id: 1,
      run_type: 'discovery',
      status: 'running',
      execution_mode: 'direct',
      seed_queries: ['secret ws1 query']
    });

    // In-memory cache hit for owner workspace 1 succeeds; cross-workspace 2 fails closed (null)
    const ownerCached = await getNewbornRunById(null, 901, { lite: true, workspaceId: 1 });
    assert.ok(ownerCached);
    assert.equal(ownerCached.id, 901);
    assert.equal(ownerCached.workspace_id, 1);

    const crossCached = await getNewbornRunById(null, 901, { lite: true, workspaceId: 2 });
    assert.equal(crossCached, null);

    clearNewbornInflightRunsForTest();

    // DB lite & full queries enforce AND workspace_id = wid
    const sql = createMockSql((query, values) => {
      assert.match(query, /WHERE id = \? AND workspace_id = \?/i);
      return (values[0] === 901 && values[1] === 1)
        ? [{ id: 901, workspace_id: 1, status: 'completed', execution_mode: 'direct' }]
        : [];
    });

    const dbLiteOwner = await getNewbornRunById(sql, 901, { lite: true, workspaceId: 1 });
    assert.equal(dbLiteOwner?.id, 901);
    assert.equal(await getNewbornRunById(sql, 901, { lite: true, workspaceId: 2 }), null);
    assert.equal(await getNewbornRunById(sql, 901, { lite: false, workspaceId: 2 }), null);

    // Pre-migration 42703 fails closed for non-default workspace
    const sql42703 = createMockSql(() => {
      const err = new Error('column "workspace_id" does not exist');
      err.code = '42703';
      throw err;
    });
    assert.equal(await getNewbornRunById(sql42703, 901, { lite: true, workspaceId: 2 }), null);
    assert.equal(await getNewbornRunById(sql42703, 901, { lite: false, workspaceId: 2 }), null);
  } finally {
    clearNewbornInflightRunsForTest();
  }
});

test('Phase 1.5 BLOCKER-2 regression: cancelNewbornRun blocks cross-workspace cancel with 404 without mutating owner run', async () => {
  clearNewbornInflightRunsForTest();
  try {
    setInMemoryRunProgress(902, {
      id: 902,
      workspace_id: 1,
      run_type: 'discovery',
      status: 'running',
      execution_mode: 'direct'
    });

    const updateQueries = [];
    const sql = createMockSql((query, values) => {
      if (/^[\s\n]*UPDATE\s+newborn_runs/i.test(query)) {
        updateQueries.push({ query, values });
        return [];
      }
      if (/FROM\s+newborn_runs/i.test(query)) {
        assert.match(query, /WHERE id = \? AND workspace_id = \?/i);
        return (values[0] === 902 && values[1] === 1)
          ? [{ id: 902, workspace_id: 1, run_type: 'discovery', status: 'running', execution_mode: 'direct' }]
          : [];
      }
      return [];
    });

    // Workspace 2 attempting to cancel Workspace 1's run -> 404 & zero updates
    const crossCancel = await cancelNewbornRun(sql, 902, { workspaceId: 2 });
    assert.equal(crossCancel.ok, false);
    assert.equal(crossCancel.status, 404);
    assert.equal(updateQueries.length, 0);

    // Owner run in cache must remain untouched ('running')
    const stillRunning = await getNewbornRunById(null, 902, { lite: true, workspaceId: 1 });
    assert.equal(stillRunning?.status, 'running');

    // Workspace 1 cancelling its own run succeeds and scopes UPDATEs by workspace_id
    const ownerCancel = await cancelNewbornRun(sql, 902, { workspaceId: 1 });
    assert.equal(ownerCancel.ok, true);
    assert.equal(ownerCancel.cancelled, true);
    assert.ok(updateQueries.length >= 1);
    assert.ok(updateQueries.every((u) => /AND workspace_id = \?/i.test(u.query) && u.values.includes(1)));

    // Pre-migration 42703 fails closed with 404 for non-default workspace
    const sql42703 = createMockSql(() => {
      const err = new Error('column "workspace_id" does not exist');
      err.code = '42703';
      throw err;
    });
    const res42703 = await cancelNewbornRun(sql42703, 902, { workspaceId: 2 });
    assert.equal(res42703.ok, false);
    assert.equal(res42703.status, 404);
  } finally {
    clearNewbornInflightRunsForTest();
  }
});

test('Phase 1.5 HIGH-1 & MEDIUM-3 regression: enrichClusterRemainingVolumes & Newborn write routes reject cross-workspace access with 404', async () => {
  let updatedCluster = false;
  const sql = createMockSql((query, values) => {
    if (/UPDATE\s+newborn_keyword_clusters/i.test(query)) {
      updatedCluster = true;
      return [];
    }
    if (/FROM\s+newborn_keyword_clusters/i.test(query)) {
      assert.match(query, /WHERE id = \? AND workspace_id = \?/i);
      return (values[0] === 77 && values[1] === 1)
        ? [{ id: 77, workspace_id: 1, seed_keyword: 'soup', keywords: [] }]
        : [];
    }
    if (/FROM\s+keyword_folders/i.test(query)) {
      return (values[0] === 5 && values[1] === 1)
        ? [{ id: 5, name: 'High Protein', workspace_id: 1 }]
        : [];
    }
    return [];
  });

  // Service-level cross-workspace enrich -> 404 & no UPDATE
  await assert.rejects(
    () => enrichClusterRemainingVolumes(sql, 77, { workspaceId: 2 }),
    (err) => err.status === 404
  );
  assert.equal(updatedCluster, false);

  // Route-level POST /api/newborn/cluster/enrich cross-workspace -> HTTP 404 JSON
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
  const enrichRes = await handleNewbornRoutes({
    pathname: '/api/newborn/cluster/enrich',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/newborn/cluster/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster_id: 77 })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    sql,
    workspaceId: 2,
    redactSecrets: (s) => String(s || ''),
    jsonResponse,
    methodNotAllowedResponse: (allow) => new Response('', { status: 405, headers: { Allow: String(allow) } })
  });
  assert.equal(enrichRes.status, 404);
  const enrichBody = await enrichRes.json();
  assert.equal(enrichBody.success, false);

  // Route-level cross-workspace folder_id on POST /api/newborn/discover -> HTTP 404
  const discoverRes = await handleNewbornRoutes({
    pathname: '/api/newborn/discover',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/newborn/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'high protein', folder_id: 5 })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    sql,
    workspaceId: 2,
    redactSecrets: (s) => String(s || ''),
    jsonResponse,
    methodNotAllowedResponse: (allow) => new Response('', { status: 405, headers: { Allow: String(allow) } })
  });
  assert.equal(discoverRes.status, 404);

  // Route-level cross-workspace folder_id on POST /api/newborn/cluster/build -> HTTP 404
  const buildRes = await handleNewbornRoutes({
    pathname: '/api/newborn/cluster/build',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/newborn/cluster/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed_keyword: 'soup', folder_id: 5 })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    sql,
    workspaceId: 2,
    redactSecrets: (s) => String(s || ''),
    jsonResponse,
    methodNotAllowedResponse: (allow) => new Response('', { status: 405, headers: { Allow: String(allow) } })
  });
  assert.equal(buildRes.status, 404);
});

test('Phase 1.5 MEDIUM-1, MEDIUM-2, MEDIUM-4 & NIT-1 regression: Watchlist 405 string header, invalid POST mode 400, added_count, and SQL repins summary priority', async () => {
  // MEDIUM-1: methodNotAllowedResponse receives clean string with OPTIONS
  let capturedAllowCollection = null;
  let capturedAllowItem = null;
  const capture405 = (cb) => (allow) => {
    cb(allow);
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: String(allow) } });
  };
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status });

  const res405Collection = await handleWatchlistRoutes({
    pathname: '/api/watchlist',
    method: 'PUT',
    request: new Request('https://app.hymum.com/api/watchlist', { method: 'PUT' }),
    searchParams: new URLSearchParams(),
    sql: createMockSql(() => []),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse: capture405((v) => { capturedAllowCollection = v; })
  });
  assert.equal(res405Collection.status, 405);
  assert.equal(typeof capturedAllowCollection, 'string');
  assert.equal(capturedAllowCollection, 'GET, POST, OPTIONS');

  const res405Item = await handleWatchlistRoutes({
    pathname: '/api/watchlist/7',
    method: 'PUT',
    request: new Request('https://app.hymum.com/api/watchlist/7', { method: 'PUT' }),
    searchParams: new URLSearchParams(),
    sql: createMockSql(() => []),
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse: capture405((v) => { capturedAllowItem = v; })
  });
  assert.equal(res405Item.status, 405);
  assert.equal(typeof capturedAllowItem, 'string');
  assert.equal(capturedAllowItem, 'PATCH, DELETE, OPTIONS');

  // NIT-1: POST upsertWatchlistItem rejects invalid explicit creator_tracking_mode with 400
  await assert.rejects(
    () => upsertWatchlistItem(createMockSql(() => []), {
      workspaceId: 1,
      entityType: 'creator',
      entityKey: '@chefjane',
      creatorTrackingMode: 'bogus_mode'
    }),
    (err) => err.status === 400
  );

  // MEDIUM-2: addCampaignTrackedPins returns both added and added_count
  const sqlPins = createMockSql((query) => {
    if (/FROM\s+keyword_folders/i.test(query)) return [{ id: 5, workspace_id: 1 }];
    if (/INSERT INTO\s+campaign_tracked_pins/i.test(query)) return [{ pin_id: '111111111', source_type: 'creator' }];
    return [];
  });
  const trackedRes = await addCampaignTrackedPins(sqlPins, {
    folderId: 5,
    workspaceId: 1,
    pinIds: ['111111111'],
    sourceType: 'creator'
  });
  assert.equal(trackedRes.added, 1);
  assert.equal(trackedRes.added_count, 1);

  // MEDIUM-4: clusterWindowRepinsGains prefers SQL-computed summary.multi_window_gains[win].repins
  const scriptHtml = getFoldersClientAppScript();
  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/i);
  const sandbox = {
    window: {
      location: { pathname: '/folders/5', search: '' },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {}
    },
    document: { documentElement: { classList: { toggle: () => {} } }, cookie: '' },
    URLSearchParams,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  const app = sandbox.foldersApp(5);
  app.crossoverData = {
    all_pins: [{ delta_repins_24h: 100, repin_count: 900 }],
    summary: {
      multi_window_gains: {
        '24h': { saves: 100, repins: 100 },
        '5d': { saves: 500, repins: 432 },
        '7d': { saves: 700, repins: 615 },
        '10d': { saves: 1000, repins: 880 },
        '15d': { saves: 1500, repins: 1210 },
        'all': { saves: 5000, repins: 3400 }
      }
    }
  };
  app.selectedTimeWindow = '5d';
  assert.equal(app.clusterWindowRepinsGains, 432);
  app.selectedTimeWindow = '15d';
  assert.equal(app.clusterWindowRepinsGains, 1210);
  app.selectedTimeWindow = 'all';
  assert.equal(app.clusterWindowRepinsGains, 3400);
});
