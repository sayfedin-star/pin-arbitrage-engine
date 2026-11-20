import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCreatorHandle,
  isSameCreatorAccount,
  extractCreatorAndLinkMeta,
  deduplicateAndSortCandidateEdges,
  upsertCandidateGraphEdges,
  pruneOrphanCandidateGraphNodes
} from '../src/modules/related-pins/graph-writer.mjs';
import { getCompetitorRelatedIntersections } from '../src/modules/creators/creator-harvest-and-archive.mjs';
import { deleteCompetitor, deleteCompetitorSeed } from '../src/modules/creators/competitors-crud.mjs';
import {
  getClusterOverviewService,
  getIntersectionsService,
  getRecgptPlaybookService,
  getCandidatesService,
  deleteClusterSeedService,
  bulkDeleteClusterSeedsService
} from '../src/modules/cluster/service.mjs';
import { handleClusterRoutes } from '../src/routes/cluster.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';

function buildSqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function makeJsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('1. upsertCandidateGraphEdges (deep & quick): dedup, monotonic sort, NULL preservation, and non-destructive merge', async () => {
  const captured = [];
  const mockSql = async (strings, ...values) => {
    captured.push({ sql: buildSqlText(strings), values });
    return [];
  };

  // Unsorted duplicates + self-loop + unhydrated saves (null) + hydrated saves (>0)
  const rawEdges = [
    {
      seed_pin_id: '2000000000000000002',
      candidate_pin_id: '9000000000000000009',
      title: 'Seed 2 Candidate B',
      saves: null,
      repins: 14,
      creator_username: '@FreshmanCook',
      creator_name: 'Freshman Cook',
      destination_url: 'https://freshmancook.com/soup/',
      ocr_text: 'creamy tomato soup'
    },
    {
      // Self-loop must be filtered out
      seed_pin_id: '1000000000000000001',
      candidate_pin_id: '1000000000000000001',
      title: 'Self Loop'
    },
    {
      seed_pin_id: '1000000000000000001',
      candidate_pin_id: '8000000000000000008',
      title: 'Older Duplicate',
      saves: null,
      repins: 5,
      creator_username: 'older_creator',
      destination_url: 'https://example.com/old'
    },
    {
      seed_pin_id: '1000000000000000001',
      candidate_pin_id: '8000000000000000008',
      title: 'Richer Duplicate',
      saves: 420,
      repins: 19,
      creator_username: '@RicherCreator',
      destination_url: ''
    },
    {
      seed_pin_id: '1000000000000000001',
      candidate_pin_id: '7000000000000000007',
      title: 'Seed 1 Candidate A',
      saves: null,
      repins: 0
    }
  ];

  // Verify pure dedup + sort + field merge + NULL preservation
  const prepared = deduplicateAndSortCandidateEdges(rawEdges);
  assert.equal(prepared.length, 3, 'Self-loop dropped and duplicate merged');
  assert.deepEqual(
    prepared.map((e) => `${e.seed_pin_id}:${e.candidate_pin_id}`),
    [
      '1000000000000000001:7000000000000000007',
      '1000000000000000001:8000000000000000008',
      '2000000000000000002:9000000000000000009'
    ],
    'Edges must be sorted monotonically ascending by (seed_pin_id, candidate_pin_id)'
  );
  assert.equal(prepared[0].saves, null, 'Unhydrated saves must stay NULL rather than coercing to 0');
  assert.equal(prepared[1].saves, 420, 'Higher saves wins on duplicate merge');
  assert.equal(prepared[1].creator_username, 'RicherCreator', 'Leading @ stripped on creator_username');
  assert.equal(prepared[1].destination_url, 'https://example.com/old', 'Missing destination_url preserved from secondary duplicate');
  assert.equal(prepared[2].saves, null);

  // Verify quick mode SQL does NOT overwrite deep-only analytics columns on conflict
  const quickRes = await upsertCandidateGraphEdges(mockSql, rawEdges, { mode: 'quick', chunkSize: 50 });
  assert.equal(quickRes.upsertedCount, 3);
  assert.equal(quickRes.batches, 1);
  assert.equal(captured.length, 1);

  const quickSql = captured[0].sql;
  const quickConflictSql = quickSql.slice(quickSql.indexOf('ON CONFLICT'));
  assert.match(quickSql, /INSERT INTO candidate_graph_nodes/i);
  assert.match(quickSql, /ORDER BY raw\.seed_pin_id ASC, raw\.candidate_pin_id ASC/i);
  assert.match(quickConflictSql, /creator_username = COALESCE\(NULLIF\(EXCLUDED\.creator_username, ''\), candidate_graph_nodes\.creator_username\)/i);
  assert.match(quickConflictSql, /destination_url = COALESCE\(NULLIF\(EXCLUDED\.destination_url, ''\), candidate_graph_nodes\.destination_url\)/i);
  assert.doesNotMatch(quickConflictSql, /\bocr_text\s*=/i, 'quick mode must not clobber ocr_text');
  assert.doesNotMatch(quickConflictSql, /\bsequence_role\s*=/i, 'quick mode must not clobber sequence_role');
  assert.doesNotMatch(quickConflictSql, /\baspect_ratio\s*=/i, 'quick mode must not clobber aspect_ratio');
  assert.doesNotMatch(quickConflictSql, /\bdaily_velocity\s*=/i, 'quick mode must not clobber daily_velocity');
  assert.doesNotMatch(quickConflictSql, /\brecgpt_transition_score\s*=/i, 'quick mode must not clobber recgpt_transition_score');

  // Verify deep mode SQL persists deep fields + creator/destination metadata non-destructively
  let wrapperCalls = 0;
  const deepRes = await upsertCandidateGraphEdges(mockSql, rawEdges, {
    mode: 'deep',
    chunkSize: 2,
    queryWrapper: async (fn) => {
      wrapperCalls += 1;
      return fn();
    }
  });
  assert.equal(deepRes.upsertedCount, 3);
  assert.equal(deepRes.batches, 2, 'Chunk size 2 should split 3 edges into 2 batches');
  assert.equal(wrapperCalls, 2);

  const deepSql = captured[1].sql;
  const deepConflictSql = deepSql.slice(deepSql.indexOf('ON CONFLICT'));
  assert.match(deepSql, /creator_username,\s*creator_name/i);
  assert.match(deepSql, /destination_url/i);
  assert.match(deepConflictSql, /ocr_text = COALESCE\(NULLIF\(EXCLUDED\.ocr_text, ''\), candidate_graph_nodes\.ocr_text\)/i);
  assert.match(deepConflictSql, /creator_username = COALESCE\(NULLIF\(EXCLUDED\.creator_username, ''\), candidate_graph_nodes\.creator_username\)/i);
  assert.match(deepConflictSql, /destination_url = COALESCE\(NULLIF\(EXCLUDED\.destination_url, ''\), candidate_graph_nodes\.destination_url\)/i);

  // Verify extractCreatorAndLinkMeta fallback chain
  const meta = extractCreatorAndLinkMeta({
    origin_pinner: { username: '  @@ChefAlpha  ', full_name: 'Chef Alpha' },
    link: 'https://www.chefalpha.org/recipes/1',
    domain: ''
  });
  assert.equal(meta.creator_username, 'ChefAlpha');
  assert.equal(meta.creator_name, 'Chef Alpha');
  assert.equal(meta.destination_url, 'https://www.chefalpha.org/recipes/1');
  assert.equal(meta.clean_domain, 'chefalpha.org');
});

test('2. Dynamic is_same_account parity and unified competitor intersections query', async () => {
  assert.equal(normalizeCreatorHandle('  @@FreshmanCook  '), 'freshmancook');
  assert.equal(isSameCreatorAccount('FreshmanCook', '@freshmancook'), true);
  assert.equal(isSameCreatorAccount('@@decor_queen ', '  DECOR_QUEEN'), true);
  assert.equal(isSameCreatorAccount('rival_account', 'freshmancook'), false);
  assert.equal(isSameCreatorAccount('', 'freshmancook'), false);
  assert.equal(isSameCreatorAccount(null, 'freshmancook'), false);
  assert.equal(isSameCreatorAccount('freshmancook', null), false);
  assert.equal(isSameCreatorAccount('   ', '   '), false);

  const queries = [];
  const mockSql = async (strings, ...values) => {
    const q = buildSqlText(strings);
    queries.push({ sql: q, values });
    if (q.includes('SELECT id FROM competitor_profiles')) {
      return [{ id: 42 }];
    }
    if (q.includes('total_nodes') && q.includes('self_nodes')) {
      return [{
        total_seeds: 3,
        total_nodes: 20,
        unique_candidates: 12,
        self_nodes: 7,
        rival_nodes: 13
      }];
    }
    if (q.includes('SELECT COUNT(*)::int AS total')) {
      return [{ total: 1 }];
    }
    if (q.includes('HAVING COUNT(DISTINCT se.seed_pin_id) >=')) {
      return [{
        candidate_pin_id: '777888999000111222',
        title: 'Overlap Recipe',
        image_url: 'https://i.pinimg.com/736x/a.jpg',
        dominant_color: '#112233',
        saves: 250,
        repins: 18,
        creator_username: 'FreshmanCook',
        creator_name: 'Freshman Cook',
        domain: 'freshmancook.com',
        destination_url: 'https://freshmancook.com/bowl',
        is_same_account: true,
        seed_overlap_count: 3,
        source_seed_ids: ['111', '222', '333'],
        last_seen: '2026-11-20T00:00:00.000Z'
      }];
    }
    return [];
  };

  const result = await getCompetitorRelatedIntersections(mockSql, 42, {
    minOverlap: 2,
    filter: 'self_only',
    search: '100%_bowl',
    sort: 'overlap',
    page: 1,
    limit: 25
  });

  assert.equal(result.stats.retention_rate_pct, 35);
  assert.equal(result.stats.leakage_rate_pct, 65);
  assert.equal(result.stats.total_seeds, 3);
  assert.equal(result.intersections.length, 1);
  assert.equal(result.intersections[0].is_same_account, true);

  const sqlCorpus = queries.map((q) => q.sql).join('\n');
  assert.doesNotMatch(sqlCorpus, /competitor_related_nodes/i, 'Must never query legacy competitor_related_nodes table');
  assert.match(sqlCorpus, /JOIN\s+competitor_profiles\s+cp\s+ON\s+cp\.id\s*=\s*csp\.competitor_id/i);
  assert.match(sqlCorpus, /JOIN\s+candidate_graph_nodes\s+cgn\s+ON\s+cgn\.seed_pin_id\s*=\s*csp\.pin_id/i);
  assert.match(sqlCorpus, /LOWER\(LTRIM\(BTRIM\(cgn\.creator_username\),\s*'@'\)\)\s*=\s*LOWER\(LTRIM\(BTRIM\(COALESCE\(cp\.username,\s*''\)\),\s*'@'\)\)/i);
  assert.match(sqlCorpus, /ESCAPE\s+'\\'/i, 'LIKE search must escape wildcard characters');
});

test('3. Orphan-safe candidate_graph_nodes pruning across all delete paths preserves shared seeds', async () => {
  const SHARED_SEED = '100000000000000001';
  const CLUSTER_ONLY_SEED = '100000000000000002';
  const COMP_ONLY_SEED = '100000000000000003';
  const COMP_SHARED_ACROSS_TWO = '100000000000000004';

  // Simulate an in-memory relational store for cluster_seeds, competitor_seed_pins, and candidate_graph_nodes
  const state = {
    clusterSeeds: new Set([SHARED_SEED, CLUSTER_ONLY_SEED]),
    competitorSeeds: [
      { competitor_id: 7, pin_id: SHARED_SEED },
      { competitor_id: 7, pin_id: COMP_ONLY_SEED },
      { competitor_id: 8, pin_id: COMP_SHARED_ACROSS_TWO },
      { competitor_id: 7, pin_id: COMP_SHARED_ACROSS_TWO }
    ],
    edges: [
      { seed_pin_id: SHARED_SEED, candidate_pin_id: 'C1' },
      { seed_pin_id: CLUSTER_ONLY_SEED, candidate_pin_id: 'C2' },
      { seed_pin_id: COMP_ONLY_SEED, candidate_pin_id: 'C3' },
      { seed_pin_id: COMP_SHARED_ACROSS_TWO, candidate_pin_id: 'C4' }
    ]
  };

  const statefulSql = async (strings, ...values) => {
    const q = buildSqlText(strings);

    if (q.startsWith('DELETE FROM cluster_seeds WHERE pin_id = ANY')) {
      for (const id of values[0]) state.clusterSeeds.delete(id);
      return [];
    }
    if (q.startsWith('DELETE FROM cluster_seeds WHERE pin_id =')) {
      state.clusterSeeds.delete(values[0]);
      return [];
    }
    if (q.includes('DELETE FROM competitor_seed_pins WHERE competitor_id =') && q.includes('AND pin_id =')) {
      state.competitorSeeds = state.competitorSeeds.filter(
        (r) => !(String(r.competitor_id) === String(values[0]) && String(r.pin_id) === String(values[1]))
      );
      return [];
    }
    if (q.includes('DELETE FROM competitor_seed_pins WHERE competitor_id =') && q.includes('RETURNING pin_id')) {
      const removed = state.competitorSeeds.filter((r) => String(r.competitor_id) === String(values[0]));
      state.competitorSeeds = state.competitorSeeds.filter((r) => String(r.competitor_id) !== String(values[0]));
      return removed.map((r) => ({ pin_id: r.pin_id }));
    }
    if (q.includes('DELETE FROM candidate_graph_nodes cgn') && q.includes('NOT EXISTS') && q.includes('cluster_seeds') && q.includes('competitor_seed_pins')) {
      const targets = new Set(values[0]);
      state.edges = state.edges.filter((edge) => {
        if (!targets.has(edge.seed_pin_id)) return true;
        const stillInCluster = state.clusterSeeds.has(edge.seed_pin_id);
        const stillInCompetitor = state.competitorSeeds.some((s) => s.pin_id === edge.seed_pin_id);
        return stillInCluster || stillInCompetitor;
      });
      return [];
    }
    if (q.includes('SELECT id FROM competitor_profiles')) {
      return [{ id: Number(values[0]) || 7 }];
    }
    if (q.includes('DELETE FROM competitor_profiles WHERE id =')) {
      return [{ id: Number(values[0]) || 7, username: 'comp7' }];
    }
    return [];
  };

  // A. Delete SHARED_SEED from cluster_seeds -> edge C1 MUST survive because competitor 7 still tracks SHARED_SEED
  await deleteClusterSeedService(statefulSql, { pinId: SHARED_SEED, purgeData: true });
  assert.equal(state.edges.some((e) => e.candidate_pin_id === 'C1'), true, 'Shared seed edge must survive cluster delete');

  // B. Bulk delete CLUSTER_ONLY_SEED from cluster_seeds -> edge C2 MUST be pruned
  await bulkDeleteClusterSeedsService(statefulSql, { pinIds: [CLUSTER_ONLY_SEED], purgeDatabase: true });
  assert.equal(state.edges.some((e) => e.candidate_pin_id === 'C2'), false, 'Orphaned cluster-only edge must be pruned');

  // C. Delete SHARED_SEED from competitor 7 -> now absent from BOTH queues, so edge C1 MUST be pruned
  await deleteCompetitorSeed(statefulSql, 7, SHARED_SEED);
  assert.equal(state.edges.some((e) => e.candidate_pin_id === 'C1'), false, 'Edge must be pruned once absent from both queues');

  // D. Delete competitor 7 entirely -> COMP_ONLY_SEED edge C3 pruned, COMP_SHARED_ACROSS_TWO edge C4 survives (competitor 8 still tracks it)
  await deleteCompetitor(statefulSql, 7);
  assert.equal(state.edges.some((e) => e.candidate_pin_id === 'C3'), false, 'Orphaned competitor-only edge must be pruned on competitor delete');
  assert.equal(state.edges.some((e) => e.candidate_pin_id === 'C4'), true, 'Edge shared with another competitor must survive');

  // E. Direct pruneOrphanCandidateGraphNodes call with empty array is a safe no-op
  const noopRes = await pruneOrphanCandidateGraphNodes(statefulSql, []);
  assert.deepEqual(noopRes.prunedSeedIds, []);
});

test('4. Cluster Hub services enforce INNER JOIN cluster_seeds scoping to prevent competitor-only graph leakage', async () => {
  const capturedQueries = [];
  const mockSql = async (strings, ...values) => {
    const q = buildSqlText(strings);
    capturedQueries.push({ sql: q, values });
    if (q.includes('COUNT(DISTINCT cs.pin_id)')) {
      return [{ total_seeds: 2, total_candidates: 40, avg_save_rate: 12.5, unique_domains: 5 }];
    }
    if (q.includes('FROM cluster_arbitrage_metrics')) {
      return [];
    }
    return [];
  };

  await getClusterOverviewService(mockSql);
  await getIntersectionsService(mockSql, { minOverlap: 2, limit: 50 });
  await getRecgptPlaybookService(mockSql, { seedPinId: null });
  await getCandidatesService(mockSql, { seedPinId: null, limit: 50, offset: 0, query: '', sort: 'saves' });

  // Every global Cluster Hub read on candidate_graph_nodes must INNER JOIN cluster_seeds
  const candidateTableQueries = capturedQueries.filter((entry) =>
    /FROM\s+candidate_graph_nodes/i.test(entry.sql)
  );
  assert.ok(candidateTableQueries.length >= 4, `Expected >=4 global candidate_graph_nodes queries, got ${candidateTableQueries.length}`);
  for (const entry of candidateTableQueries) {
    assert.match(
      entry.sql,
      /INNER\s+JOIN\s+cluster_seeds\s+cs\s+ON\s+cs\.pin_id\s*=\s*(?:cgn|c)\.seed_pin_id/i,
      `Cluster Hub query leaked unscoped candidate_graph_nodes access: ${entry.sql}`
    );
  }

  // Explicitly requesting scope='all' on getCandidatesService opts out of INNER JOIN cluster_seeds
  capturedQueries.length = 0;
  await getCandidatesService(mockSql, { seedPinId: null, limit: 50, offset: 0, query: '', sort: 'saves', scope: 'all' });
  const allScopeQuery = capturedQueries.find((entry) => /FROM\s+candidate_graph_nodes/i.test(entry.sql));
  assert.ok(allScopeQuery, 'Expected candidates query for scope=all');
  assert.doesNotMatch(allScopeQuery.sql, /INNER\s+JOIN\s+cluster_seeds/i);
});

test('5. Unified workflow dispatch & run history routes target related-pins-crawler.yml with mode isolation', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = String(url);
    fetchCalls.push({
      url: parsedUrl,
      method: init.method || 'GET',
      body: init.body ? JSON.parse(init.body) : null
    });

    if (parsedUrl.includes('/dispatches')) {
      return new Response(null, { status: 204 });
    }
    if (parsedUrl.includes('/actions/workflows/related-pins-crawler.yml/runs')) {
      return makeJsonResponse({
        workflow_runs: [
          {
            id: 9001,
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-11-20T03:00:00Z',
            html_url: 'https://github.com/org/repo/actions/runs/9001',
            event: 'schedule',
            display_title: 'Related Pins Crawler [seed_deep]',
            head_branch: 'main'
          },
          {
            id: 9002,
            status: 'in_progress',
            conclusion: null,
            created_at: '2026-11-20T05:10:00Z',
            html_url: 'https://github.com/org/repo/actions/runs/9002',
            event: 'workflow_dispatch',
            display_title: 'Related Pins Crawler [account_quick] (@freshmancook)',
            head_branch: 'main'
          },
          {
            id: 9003,
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-11-20T04:15:00Z',
            html_url: 'https://github.com/org/repo/actions/runs/9003',
            event: 'workflow_dispatch',
            display_title: 'Related Pins Crawler [seed_deep] (seed 1098245059167667976)',
            head_branch: 'main'
          }
        ]
      });
    }
    return makeJsonResponse({ error: 'unexpected url' }, 404);
  };

  try {
    const env = { GITHUB_TOKEN: 'ghp_test_token', GITHUB_REPO: 'sayfedin-star/pin-arbitrage-engine' };
    const sharedRouteHelpers = {
      env,
      ctx: {},
      sql: async () => [],
      jsonResponse: makeJsonResponse,
      methodNotAllowedResponse: (allow) => new Response('Method Not Allowed', { status: 405, headers: { Allow: allow } }),
      clampLimit: (raw, def = 15, max = 30) => Math.min(max, Math.max(1, parseInt(raw, 10) || def)),
      buildCanonicalCacheKey: () => 'test-key',
      getCachedOrFetch: async (_k, fn) => fn(),
      invalidateEdgeCache: () => {},
      safeWaitUntil: () => {},
      redactSecrets: (s) => s
    };

    // A. POST /api/workflow/trigger -> related-pins-crawler.yml (mode: seed_deep)
    const clusterTriggerRes = await handleClusterRoutes({
      ...sharedRouteHelpers,
      pathname: '/api/workflow/trigger',
      method: 'POST',
      searchParams: new URLSearchParams(),
      request: new Request('https://example.test/api/workflow/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed_pin_id: 'https://pinterest.com/pin/1098245059167667976/', max_pages: '45' })
      })
    });
    const clusterTriggerJson = await clusterTriggerRes.json();
    assert.equal(clusterTriggerRes.status, 200);
    assert.equal(clusterTriggerJson.success, true);
    assert.equal(clusterTriggerJson.workflow, 'related-pins-crawler.yml');
    assert.equal(clusterTriggerJson.mode, 'seed_deep');

    assert.match(fetchCalls[0].url, /\/actions\/workflows\/related-pins-crawler\.yml\/dispatches$/);
    assert.deepEqual(fetchCalls[0].body.inputs, {
      mode: 'seed_deep',
      seed_pin_id: '1098245059167667976',
      max_pages: '45'
    });

    // B. POST /api/creators/related-pins/dispatch-workflow -> related-pins-crawler.yml (mode: account_quick)
    const creatorTriggerRes = await handleCreatorsRoutes({
      ...sharedRouteHelpers,
      pathname: '/api/creators/related-pins/dispatch-workflow',
      method: 'POST',
      searchParams: new URLSearchParams(),
      request: new Request('https://example.test/api/creators/related-pins/dispatch-workflow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: '@freshmancook', pin_ids: '111,222', max_pages_per_seed: '3' })
      })
    });
    const creatorTriggerJson = await creatorTriggerRes.json();
    assert.equal(creatorTriggerRes.status, 200);
    assert.equal(creatorTriggerJson.success, true);
    assert.equal(creatorTriggerJson.workflow, 'related-pins-crawler.yml');
    assert.equal(creatorTriggerJson.mode, 'account_quick');
    assert.equal(creatorTriggerJson.max_pages, '3');

    assert.match(fetchCalls[1].url, /\/actions\/workflows\/related-pins-crawler\.yml\/dispatches$/);
    assert.deepEqual(fetchCalls[1].body.inputs, {
      mode: 'account_quick',
      target_account: 'freshmancook',
      pin_ids: '111,222',
      max_pages: '3'
    });

    // C. GET /api/workflow/runs?mode=account_quick -> queries related-pins-crawler.yml and filters by mode
    const runsQuickRes = await handleClusterRoutes({
      ...sharedRouteHelpers,
      pathname: '/api/workflow/runs',
      method: 'GET',
      searchParams: new URLSearchParams('mode=account_quick&limit=10'),
      request: new Request('https://example.test/api/workflow/runs?mode=account_quick&limit=10')
    });
    const runsQuick = await runsQuickRes.json();
    assert.match(fetchCalls[2].url, /\/actions\/workflows\/related-pins-crawler\.yml\/runs\?per_page=30$/);
    assert.equal(runsQuick.length, 1);
    assert.equal(runsQuick[0].databaseId, 9002);
    assert.equal(runsQuick[0].mode, 'account_quick');

    // D. GET /api/workflow/runs (unfiltered) -> returns all modes with inferred mode metadata
    const runsAllRes = await handleClusterRoutes({
      ...sharedRouteHelpers,
      pathname: '/api/workflow/runs',
      method: 'GET',
      searchParams: new URLSearchParams(),
      request: new Request('https://example.test/api/workflow/runs')
    });
    const runsAll = await runsAllRes.json();
    assert.equal(runsAll.length, 3);
    assert.deepEqual(
      runsAll.map((r) => r.mode),
      ['seed_deep', 'account_quick', 'seed_deep']
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
