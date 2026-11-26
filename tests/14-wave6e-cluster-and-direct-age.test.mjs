/**
 * tests/14-wave6e-cluster-and-direct-age.test.mjs
 *
 * Wave 6E Comprehensive Offline Test Suite:
 * 1. Migration 006 schema, fillfactor=80 HOT safety, zero JSONB indexes, idempotency
 * 2. Direct Age Mode (`resolve_root_pin: false` default): skips root PinResource unwrap & disables Pidgets repin_count=0 rescue
 * 3. Boards Path = `Find more ideas` ONLY (`board_feed` disabled by default; `board_more_ideas` uses ceil(target_pins_per_board / 25))
 * 4. Flexible numeric caps (`Search` up to 10,000, `max_pages` up to 200, `max_pin_hydrations_per_run` up to 5,000)
 * 5. Typeahead user-account separation (`accounts[]` vs pure `suggestions[]`)
 * 6. Two-Phase Keyword Cluster Builder (`buildNewbornKeywordCluster` + `enrichClusterRemainingVolumes` + 4 Trends tabs + 90d Peaks)
 * 7. Multi-query Cluster Hunt (>8 queries) + `matched_queries` overlap persistence & `cluster_hits` sorting
 * 8. HTTP endpoints (`/api/newborn/cluster/build`, `/enrich`, `/hunt`, `/clusters`, `/clusters/:id`) + SSR `/newborn` UI markup
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_NEWBORN_SETTINGS,
  normalizeNewbornSettings
} from '../src/modules/newborn/settings.mjs';
import { fetchKeywordTypeahead } from '../src/modules/keywords/typeahead.mjs';
import {
  buildTypeaheadExpansionQueries,
  mergeClusterKeywordEntries,
  buildNewbornKeywordCluster,
  enrichClusterRemainingVolumes
} from '../src/modules/newborn/cluster-builder.mjs';
import {
  runNewbornDiscovery,
  listNewbornCandidates,
  clearNewbornInflightRunsForTest
} from '../src/modules/newborn/service.mjs';
import { createFastifyApp } from '../src/server.mjs';

function createWave6ESqlMock() {
  const clusters = [];
  let nextClusterId = 1;
  const runs = [];
  let nextRunId = 100;
  const candidates = new Map();
  const runCandidates = [];
  const appSettings = new Map();

  const sql = async (strings, ...values) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    const upper = query.toUpperCase();

    // App settings
    if (upper.includes('FROM PUBLIC.APP_SETTINGS') || upper.includes('FROM APP_SETTINGS')) {
      const key = String(values[0] || '');
      const val = appSettings.get(key);
      return val ? [{ value: val, setting_value: val }] : [];
    }
    if (upper.includes('INSERT INTO PUBLIC.APP_SETTINGS') || upper.includes('INSERT INTO APP_SETTINGS')) {
      appSettings.set(String(values[0] || ''), values[1]);
      return [];
    }

    // Newborn keyword clusters
    if (upper.startsWith('INSERT INTO NEWBORN_KEYWORD_CLUSTERS') || upper.startsWith('INSERT INTO PUBLIC.NEWBORN_KEYWORD_CLUSTERS')) {
      const id = nextClusterId++;
      const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
      const row = {
        id,
        seed_keyword: values[0],
        country: values[1],
        l1_interest: values[2],
        include_terms: parseJson(values[3]),
        exclude_terms: parseJson(values[4]),
        idea_page: parseJson(values[5]),
        keywords: parseJson(values[6]),
        discovered_accounts: parseJson(values[7]),
        keyword_count: Number(values[8] || 0),
        enriched_count: Number(values[9] || 0),
        status: 'ready',
        last_run_id: null,
        metadata: parseJson(values[10]),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      clusters.push(row);
      return [{ id, created_at: row.created_at, updated_at: row.updated_at }];
    }
    if (upper.includes('FROM NEWBORN_KEYWORD_CLUSTERS') || upper.includes('FROM PUBLIC.NEWBORN_KEYWORD_CLUSTERS')) {
      if (upper.includes('WHERE ID =')) {
        const id = Number(values[0]);
        const found = clusters.find((c) => c.id === id);
        return found ? [found] : [];
      }
      return [...clusters].reverse();
    }
    if (upper.startsWith('UPDATE NEWBORN_KEYWORD_CLUSTERS') || upper.startsWith('UPDATE PUBLIC.NEWBORN_KEYWORD_CLUSTERS')) {
      if (upper.includes('SET LAST_RUN_ID')) {
        const runId = Number(values[0]);
        const clusterId = Number(values[1]);
        const found = clusters.find((c) => c.id === clusterId);
        if (found) found.last_run_id = runId;
        return [];
      }
      const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
      const id = Number(values[4]);
      const found = clusters.find((c) => c.id === id);
      if (found) {
        found.keywords = parseJson(values[0]);
        found.keyword_count = Number(values[1] || 0);
        found.enriched_count = Number(values[2] || 0);
        found.metadata = parseJson(values[3]);
        found.updated_at = new Date().toISOString();
      }
      return [];
    }

    // Newborn runs
    if (upper.startsWith('INSERT INTO NEWBORN_RUNS') || upper.startsWith('INSERT INTO PUBLIC.NEWBORN_RUNS')) {
      const id = nextRunId++;
      const hasClusterCol = upper.includes('CLUSTER_ID');
      const row = {
        id,
        run_type: values[0] || 'discovery',
        status: values[1] || 'running',
        trigger_source: values[2] || 'manual',
        profile_id: values[3] || null,
        folder_id: values[4] || null,
        cluster_id: hasClusterCol ? (values[5] || null) : null,
        seed_queries: [],
        cookie_mode: 'authenticated_session',
        telemetry: {},
        candidates_discovered: 0,
        candidates_qualified: 0,
        golden_pins_count: 0,
        started_at: new Date().toISOString()
      };
      runs.push(row);
      return [row];
    }
    if (upper.startsWith('UPDATE NEWBORN_RUNS') || upper.startsWith('UPDATE PUBLIC.NEWBORN_RUNS')) {
      return [];
    }
    if (upper.includes('FROM NEWBORN_RUNS') || upper.includes('FROM PUBLIC.NEWBORN_RUNS')) {
      if (upper.includes('WHERE ID =')) {
        const found = runs.find((r) => r.id === Number(values[0]));
        return found ? [found] : [];
      }
      return [...runs].reverse();
    }

    // Newborn candidates upsert & list
    if (upper.startsWith('INSERT INTO NEWBORN_CANDIDATES') || upper.startsWith('INSERT INTO PUBLIC.NEWBORN_CANDIDATES')) {
      const parsed = typeof values[0] === 'string' ? JSON.parse(values[0]) : values[0];
      const rows = Array.isArray(parsed) ? parsed : [];
      for (const r of rows) {
        candidates.set(String(r.pin_id), { ...r });
      }
      return rows.map((r) => ({ pin_id: r.pin_id }));
    }
    if (upper.startsWith('INSERT INTO NEWBORN_RUN_CANDIDATES') || upper.startsWith('INSERT INTO PUBLIC.NEWBORN_RUN_CANDIDATES')) {
      const parsed = typeof values[0] === 'string' ? JSON.parse(values[0]) : values[0];
      const rows = Array.isArray(parsed) ? parsed : [];
      for (const r of rows) {
        const idx = runCandidates.findIndex((x) => x.run_id === r.run_id && x.pin_id === r.pin_id);
        if (idx >= 0) runCandidates[idx] = { ...r };
        else runCandidates.push({ ...r });
      }
      return [];
    }

    // listNewbornCandidates COUNT(*) and JOIN query (uses nested fragments for runJoin & whereCond)
    if (upper.includes('FROM NEWBORN_CANDIDATES NC')) {
      const links = runCandidates;
      if (upper.includes('COUNT(*)')) {
        return [{ total: links.length }];
      }
      const out = links.map((rc) => {
        const base = candidates.get(String(rc.pin_id)) || { pin_id: rc.pin_id };
        return {
          ...base,
          run_matched_queries: rc.matched_queries || []
        };
      });
      if (upper.includes('JSONB_ARRAY_LENGTH')) {
        out.sort((a, b) => (b.run_matched_queries.length - a.run_matched_queries.length) || (Number(b.repin_count || 0) - Number(a.repin_count || 0)));
      }
      return out;
    }

    return [];
  };

  sql._state = { clusters, runs, candidates, runCandidates };
  return sql;
}

test('Wave 6E-1: Migration 006 is HOT-safe (fillfactor=80, zero JSONB indexes) and sets direct-age + Find-more-ideas defaults', async () => {
  const migrationPath = path.join(process.cwd(), 'scripts/migrations/006_wave6e_cluster_and_direct_age.sql');
  const sqlText = await fs.readFile(migrationPath, 'utf8');

  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS public\.newborn_keyword_clusters/i);
  assert.match(sqlText, /WITH\s*\(\s*fillfactor\s*=\s*80\s*\)/i);
  assert.match(sqlText, /ADD COLUMN IF NOT EXISTS cluster_id BIGINT REFERENCES public\.newborn_keyword_clusters\(id\)/i);
  assert.match(sqlText, /ADD COLUMN IF NOT EXISTS matched_queries JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
  assert.doesNotMatch(sqlText, /CREATE\s+INDEX[^;]*(keywords|discovered_accounts|matched_queries)/i, 'Must NOT index volatile JSONB columns');
  assert.match(sqlText, /"resolve_root_pin":\s*false/i);
  assert.match(sqlText, /'board_feed'[^;]*\{"enabled":\s*false\}/i);
  assert.match(sqlText, /'board_more_ideas'[^;]*\{"enabled":\s*true/i);
});

test('Wave 6E-2: Settings defaults & flexible numeric caps (Search 10k, max_pages 200, hydrations 5k, Boards = Find more ideas only)', () => {
  assert.equal(DEFAULT_NEWBORN_SETTINGS.qualification.resolve_root_pin, false);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.max_queries_per_run, 25);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.surfaces.board_feed.enabled, false);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.surfaces.board_more_ideas.enabled, true);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.surfaces.board_more_ideas.target_pins_per_board, 100);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.surfaces.board_more_ideas.max_pages, 4);

  const normalized = normalizeNewbornSettings({
    discovery: {
      max_queries_per_run: 30,
      hydration: { max_pin_hydrations_per_run: 4500 },
      surfaces: {
        pin_serp_capsules: { enabled: true, target_pins: 9500, max_pages: 190 },
        fresh_boards: { enabled: true, max_boards: 35, target_pins_per_board: 250 },
        ideas_feeds: { enabled: true, target_pins: 4200 },
        home_feed: { enabled: true, target_pins: 3800 },
        related_pin_snowball: { enabled: true, target_pins: 1800 }
      }
    },
    qualification: {
      resolve_root_pin: false
    }
  });

  assert.equal(normalized.discovery.max_queries_per_run, 30);
  assert.equal(normalized.discovery.hydration.max_pin_hydrations_per_run, 4500);
  assert.equal(normalized.discovery.surfaces.pin_serp_capsules.target_pins, 9500);
  assert.equal(normalized.discovery.surfaces.pin_serp_capsules.max_pages, 190);
  assert.equal(normalized.discovery.surfaces.fresh_boards.max_boards, 35);
  assert.equal(normalized.discovery.surfaces.board_more_ideas.target_pins_per_board, 250);
  assert.equal(normalized.discovery.surfaces.board_more_ideas.max_pages, 10, 'ceil(250/25) = 10 pages');
  assert.equal(normalized.discovery.surfaces.ideas_feeds.target_pins, 4200);
  assert.equal(normalized.discovery.surfaces.home_feed.target_pins, 3800);
  assert.equal(normalized.discovery.surfaces.related_pin_snowball.target_pins, 1800);
  assert.equal(normalized.qualification.resolve_root_pin, false);
});

test('Wave 6E-3: Direct Age Mode skips root PinResource unwrap, disables Pidgets repin_count=0 rescue, and Boards runs ONLY Find more ideas', async () => {
  const nowMs = Date.UTC(2026, 10, 19, 12, 0, 0);
  const fiveDaysAgo = new Date(nowMs - 5 * 86400 * 1000).toUTCString();
  const observedUrls = [];
  const pinResourceIds = [];

  const mockFetch = async (url) => {
    const u = String(url);
    observedUrls.push(u);

    if (u.includes('BaseSearchResource/get')) {
      const scopeBoards = u.includes('boards');
      if (scopeBoards) {
        return new Response(JSON.stringify({
          resource_response: {
            data: {
              results: [
                { id: '9001001', name: 'Cozy Soup Recipes', url: '/cook/cozy-soup-recipes/', owner: { username: 'cook' }, board_order_modified_at: fiveDaysAgo, pin_count: 180, pin_thumbnail_urls: [] }
              ]
            }
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            results: [
              // A repin with direct repin_count=85 and young created_at -> MUST survive WITHOUT unwrapping root 99999999999999!
              {
                id: '80000000000011',
                title: 'Creamy Potato Soup Repin',
                is_repin: true,
                origin_pin_id: '99999999999999',
                repin_count: 85,
                created_at: fiveDaysAgo
              },
              // A pin with repin_count=0 and high save_count=500 -> MUST NOT be rescued when resolve_root_pin=false!
              {
                id: '80000000000022',
                title: 'Zero Repin High Save Pin',
                is_repin: true,
                origin_pin_id: '99999999999988',
                repin_count: 0,
                aggregated_pin_data: { aggregated_stats: { saves: 500 } },
                created_at: fiveDaysAgo
              }
            ]
          }
        }
      }), { status: 200 });
    }

    if (u.includes('BoardContentRecommendationResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: [
            {
              id: '80000000000033',
              title: 'Find More Ideas Lasagna Soup',
              repin_count: 64,
              created_at: fiveDaysAgo
            }
          ]
        }
      }), { status: 200 });
    }

    if (u.includes('BoardFeedResource/get')) {
      const decoded = decodeURIComponent(u);
      if (decoded.includes('/more_ideas/')) {
        return new Response(JSON.stringify({
          resource_response: {
            data: [
              {
                id: '80000000000033',
                title: 'Find More Ideas Lasagna Soup',
                repin_count: 64,
                created_at: fiveDaysAgo
              }
            ]
          }
        }), { status: 200 });
      }
      throw new Error('Regular board_feed BoardFeedResource/get (without /more_ideas/) must NEVER be called by default!');
    }

    if (u.includes('pidgets/pins/info/')) {
      return new Response(JSON.stringify({
        data: [
          { id: '80000000000011', repin_count: 85, aggregated_pin_data: { aggregated_stats: { saves: 120 } }, domain: 'soupblog.com' },
          { id: '80000000000022', repin_count: 0, aggregated_pin_data: { aggregated_stats: { saves: 500 } }, domain: 'zerorepin.com' },
          { id: '80000000000033', repin_count: 64, aggregated_pin_data: { aggregated_stats: { saves: 90 } }, domain: 'lasagnasoup.com' }
        ]
      }), { status: 200 });
    }

    if (u.includes('PinResource/get')) {
      const m = u.match(/"id"%3A"(\d+)"/) || u.match(/"id":"(\d+)"/);
      const pid = m ? m[1] : 'unknown';
      pinResourceIds.push(pid);
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: pid,
            title: pid === '80000000000011' ? 'Creamy Potato Soup Repin' : 'Find More Ideas Lasagna Soup',
            is_repin: pid === '80000000000011',
            origin_pin_id: pid === '80000000000011' ? '99999999999999' : null,
            created_at: fiveDaysAgo,
            repin_count: pid === '80000000000011' ? 85 : 64,
            aggregated_pin_data: { aggregated_stats: { saves: 120 } },
            domain: pid === '80000000000011' ? 'soupblog.com' : 'lasagnasoup.com',
            pin_join: { visual_annotation: ['Potato Soup Recipe', 'Cozy Dinner'] }
          }
        }
      }), { status: 200 });
    }

    if (u.includes('InterestResource/get')) {
      return new Response(JSON.stringify({ resource_response: { data: null } }), { status: 200 });
    }

    return new Response(JSON.stringify({ resource_response: { data: [] } }), { status: 200 });
  };

  const sql = createWave6ESqlMock();
  const res = await runNewbornDiscovery(sql, {
    seedQueries: ['soup'],
    rawCookieOverride: 'TWc9PSZwave6e_cookie',
    settingsOverrides: {
      qualification: { max_age_days: 30, min_repin_count: 20, min_save_count: 0 },
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, target_pins: 50, max_pages: 1 },
          fresh_boards: { enabled: true, max_boards: 2, target_pins_per_board: 50 },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        }
      }
    },
    routerOptions: { fetchImpl: mockFetch },
    nowMs
  });

  assert.equal(res.ok, true);
  assert.equal(res.resolve_root_pin, false);
  assert.ok(observedUrls.some((u) => decodeURIComponent(u).includes('/more_ideas/')), 'Find more ideas MUST run for discovered boards');
  assert.ok(!observedUrls.some((u) => u.includes('BoardFeedResource/get') && !decodeURIComponent(u).includes('/more_ideas/')), 'board_feed MUST NOT run by default');
  assert.ok(!pinResourceIds.includes('99999999999999'), 'Root pin 99999999999999 must NOT be hydrated when resolve_root_pin=false');
  assert.ok(!pinResourceIds.includes('80000000000022'), 'Pin with repin_count=0 & save_count=500 must NOT be rescued in Pidgets pre-triage');
  assert.deepEqual(
    res.candidates.map((c) => c.pin_id).sort(),
    ['80000000000011', '80000000000033'],
    'Direct-age repin + Find more ideas pin both survive cleanly'
  );
  assert.equal(res.funnel.board_repins_unwrapped, 0);
});

test('Wave 6E-4: Typeahead separates Pinterest accounts (e.g. melissa_taylor2) from pure keyword suggestions', async () => {
  const mockFetch = async () => new Response(JSON.stringify({
    resource_response: {
      data: {
        items: [
          { type: 'query', query: 'soup recipes' },
          { type: 'query', query: 'soup recipes easy' },
          {
            type: 'user',
            username: 'melissa_taylor2',
            full_name: "Children's Book Reviews by Imagination Soup",
            image_medium_url: 'https://i.pinimg.com/avatar.jpg',
            verified_identity: { verified: false }
          },
          { type: 'query', query: 'soup with ground beef' }
        ]
      }
    }
  }), { status: 200 });

  const res = await fetchKeywordTypeahead('soup', { fetchImpl: mockFetch, bypassCache: true });
  assert.deepEqual(res.suggestions, ['soup recipes', 'soup recipes easy', 'soup with ground beef']);
  assert.equal(res.accounts.length, 1);
  assert.equal(res.accounts[0].username, 'melissa_taylor2');
  assert.equal(res.accounts[0].profile_url, 'https://www.pinterest.com/melissa_taylor2/');
});

test('Wave 6E-5: Two-Phase Keyword Cluster Builder merges 4 Trends tabs + Typeahead + Idea Page + 90d Peaks and supports Phase 2 enrichment', async () => {
  let volumeCalls = 0;
  let metricsCalls = 0;
  let latestDateCalls = 0;
  const trendsCalls = [];

  const mockFetch = async (url) => {
    const u = String(url);

    if (u.includes('trends.pinterest.com/latest_available_date/')) {
      latestDateCalls += 1;
      return new Response(JSON.stringify({ date: '2026-11-16' }), { status: 200 });
    }
    if (u.includes('trends.pinterest.com/top_trends_filtered/')) {
      trendsCalls.push(u);
      const presetMap = { '1': 'monthly', '2': 'yearly', '3': 'growing', '4': 'seasonal' };
      const presetMatch = u.match(/trendsPreset=(\d+)/i);
      const tab = presetMatch ? (presetMap[presetMatch[1]] || 'growing') : 'growing';
      const byTab = {
        growing: [
          { term: 'potato soup recipe', weekly_change: 20, monthly_change: 100, yearly_change: 100, has_prediction: true },
          { term: 'broccoli cheddar soup', weekly_change: 7, monthly_change: 20, yearly_change: 70, has_prediction: true }
        ],
        seasonal: [
          { term: 'lasagna soup', weekly_change: 0, monthly_change: 10, yearly_change: -4, has_prediction: true }
        ],
        monthly: [
          { term: 'soup recipes', weekly_change: 7, monthly_change: 1, yearly_change: -30, has_prediction: true },
          { term: 'zuppa toscana soup', weekly_change: 9, monthly_change: 40, yearly_change: 10, has_prediction: true }
        ],
        yearly: [
          { term: 'chicken noodle soup', weekly_change: 7, monthly_change: 20, yearly_change: -60, has_prediction: false },
          { term: 'vegan soup', weekly_change: 5, monthly_change: 5, yearly_change: 0, has_prediction: false }
        ]
      };
      return new Response(JSON.stringify({ trends: byTab[tab] || [] }), { status: 200 });
    }
    if (u.includes('trends.pinterest.com/metrics/')) {
      metricsCalls += 1;
      return new Response(JSON.stringify({
        metrics: {
          'potato soup recipe': {
            predicted: [
              { date: '2026-11-20', value: 60 },
              { date: '2026-12-20', value: 98 }
            ]
          },
          'soup recipes': {
            predicted: [
              { date: '2026-11-20', value: 80 },
              { date: '2027-01-05', value: 100 }
            ]
          }
        }
      }), { status: 200 });
    }
    if (u.includes('AdvancedTypeaheadResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            items: [
              { type: 'query', query: 'soup recipes' },
              { type: 'query', query: 'soup recipes crockpot' },
              { type: 'query', query: 'taco soup' },
              { type: 'user', username: 'melissa_taylor2', full_name: 'Imagination Soup' }
            ]
          }
        }
      }), { status: 200 });
    }
    if (u.includes('InterestResource/get')) {
      volumeCalls += 1;
      const decoded = decodeURIComponent(u);
      const isSeed = decoded.includes('"interest":"soup"');
      const isSoupRecipes = decoded.includes('"interest":"soup-recipes"');
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: isSeed ? '901001' : (isSoupRecipes ? '901002' : '901999'),
            name: isSeed ? 'Soup' : (isSoupRecipes ? 'Soup Recipes' : 'Topic'),
            url_name: isSeed ? 'soup' : (isSoupRecipes ? 'soup-recipes' : 'topic'),
            internal_search_count: isSoupRecipes ? 1705944 : (isSeed ? 950000 : 320000),
            seo_related_interests: isSeed
              ? [{ id: '901003', name: 'Cabbage Soup', url_name: 'cabbage-soup' }, { id: '901004', name: 'Tomato Soup', url_name: 'tomato-soup' }]
              : []
          }
        }
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  // Pure helper unit assertions
  const expansionQueries = buildTypeaheadExpansionQueries('soup');
  assert.ok(expansionQueries.includes('soup'));
  assert.ok(expansionQueries.includes('soup recipes'));
  assert.equal(mergeClusterKeywordEntries([{ keyword: 'Soup' }, { keyword: 'soup' }]).length, 1);

  const sql = createWave6ESqlMock();
  const built = await buildNewbornKeywordCluster(sql, {
    seedKeyword: 'soup',
    country: 'US',
    l1Interest: 'food_and_drinks',
    excludeTerms: ['vegan'],
    enrichLimit: 5, // Phase 1 enriches seed + 5 others, leaving remaining rows for Phase 2!
    routerOptions: { fetchImpl: mockFetch }
  });

  assert.equal(built.id, 1);
  assert.equal(built.metadata.latest_trends_date, '2026-11-16');
  assert.equal(latestDateCalls, 1, 'latest_available_date fetched once and shared across all 4 tabs');
  assert.equal(trendsCalls.length, 4, 'All 4 Trends tabs queried in parallel');
  assert.ok(trendsCalls.every((u) => u.includes('keywordsToInclude=soup')), 'All 4 Trends queries pass keywordsToInclude=soup');
  assert.ok(trendsCalls.every((u) => u.includes('keywordsToExclude=vegan')), 'All 4 Trends queries pass keywordsToExclude=vegan');
  assert.ok(trendsCalls.every((u) => u.includes('l1interests=918530398158')), 'All 4 Trends queries map food_and_drinks to official L1 ID 918530398158');
  assert.ok(metricsCalls >= 1, 'Batched 90-day predicted peaks request executed');
  assert.equal(built.discovered_accounts.length, 1);
  assert.equal(built.discovered_accounts[0].username, 'melissa_taylor2');
  assert.ok(!built.keywords.some((k) => k.keyword.includes('vegan')), 'excludeTerms must filter out excluded keywords');
  assert.ok(built.keywords.some((k) => k.keyword === 'potato soup recipe' && k.predicted_peak_date === '2026-12-20'));
  assert.ok(built.keywords.some((k) => k.keyword === 'cabbage soup' && k.is_related_interest === true));
  assert.ok(built.remaining_unenriched_count > 0, 'Remaining unenriched rows ready for Phase 2');

  const phase1VolumeCalls = volumeCalls;
  const enriched = await enrichClusterRemainingVolumes(sql, built.id, {
    batchLimit: 25,
    routerOptions: { fetchImpl: mockFetch }
  });
  assert.ok(enriched.newly_enriched_count > 0);
  assert.equal(enriched.remaining_unenriched_count, 0);
  assert.ok(volumeCalls > phase1VolumeCalls);
});

test('Wave 6E-6: Multi-query Cluster Hunt (>8 queries) tracks matched_queries overlap and sorts by cluster_hits', async () => {
  const nowMs = Date.UTC(2026, 10, 19, 12, 0, 0);
  const fourDaysAgo = new Date(nowMs - 4 * 86400 * 1000).toUTCString();
  const serpQueriesSeen = [];

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource/get')) {
      const m = u.match(/"query"%3A"([^"]+)"/) || u.match(/"query":"([^"]+)"/);
      const q = m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : 'soup';
      serpQueriesSeen.push(q);
      // Pin 91000000000001 appears in all 12 cluster queries (Cluster Hit 12x!)
      const items = [
        { id: '91000000000001', title: 'Universal Viral Soup Pin', repin_count: 150, created_at: fourDaysAgo }
      ];
      if (q === 'soup 1') {
        items.push({ id: '91000000000002', title: 'Single Query Soup Pin', repin_count: 300, created_at: fourDaysAgo });
      }
      return new Response(JSON.stringify({ resource_response: { data: { results: items } } }), { status: 200 });
    }
    if (u.includes('pidgets/pins/info/')) {
      return new Response(JSON.stringify({
        data: [
          { id: '91000000000001', repin_count: 150, aggregated_pin_data: { aggregated_stats: { saves: 200 } } },
          { id: '91000000000002', repin_count: 300, aggregated_pin_data: { aggregated_stats: { saves: 350 } } }
        ]
      }), { status: 200 });
    }
    if (u.includes('PinResource/get')) {
      const m = u.match(/"id"%3A"(\d+)"/) || u.match(/"id":"(\d+)"/);
      const pid = m ? m[1] : '91000000000001';
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: pid,
            title: pid === '91000000000001' ? 'Universal Viral Soup Pin' : 'Single Query Soup Pin',
            created_at: fourDaysAgo,
            repin_count: pid === '91000000000001' ? 150 : 300,
            aggregated_pin_data: { aggregated_stats: { saves: 200 } },
            domain: 'souphits.com',
            pin_join: { visual_annotation: ['Soup Recipes'] }
          }
        }
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ resource_response: { data: null } }), { status: 200 });
  };

  const sql = createWave6ESqlMock();
  const twelveKeywords = Array.from({ length: 12 }, (_, idx) => `soup ${idx + 1}`);
  const runRes = await runNewbornDiscovery(sql, {
    seedQueries: twelveKeywords,
    rawCookieOverride: 'TWc9PSZcluster_cookie',
    settingsOverrides: {
      qualification: { max_age_days: 30, min_repin_count: 20, min_save_count: 0 },
      discovery: {
        max_queries_per_run: 25,
        surfaces: {
          pin_serp_capsules: { enabled: true, target_pins: 25, max_pages: 1 },
          fresh_boards: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        }
      }
    },
    routerOptions: { fetchImpl: mockFetch },
    nowMs
  });

  assert.equal(runRes.ok, true);
  assert.equal(serpQueriesSeen.length, 12, 'Must execute all 12 cluster queries (no legacy .slice(0, 8) truncation)');

  const overlapPin = runRes.candidates.find((c) => c.pin_id === '91000000000001');
  assert.ok(overlapPin);
  assert.equal(overlapPin.matched_queries.length, 12);

  // Verify listNewbornCandidates sorts by cluster_hits (pin with 12x hits comes before pin with 300 repins & 1x hit)
  const listed = await listNewbornCandidates(sql, { run_id: runRes.run_id, sort: 'cluster_hits' });
  assert.equal(listed.candidates[0].pin_id, '91000000000001');
  assert.equal(listed.candidates[0].cluster_hit_count, 12);
});

test('Wave 6E-7: HTTP routes (/api/newborn/cluster/*) + SSR /newborn HTML render custom numeric inputs, Cluster Explorer & legacy toggle', async (t) => {
  const sql = createWave6ESqlMock();
  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('latest_available_date')) return new Response(JSON.stringify({ date: '2026-11-16' }), { status: 200 });
    if (u.includes('top_trends_filtered')) {
      return new Response(JSON.stringify({ trends: [{ term: 'soup recipes', weekly_change: 12, monthly_change: 25, yearly_change: 40 }] }), { status: 200 });
    }
    if (u.includes('AdvancedTypeaheadResource')) {
      return new Response(JSON.stringify({ resource_response: { data: { items: [{ type: 'query', query: 'soup recipes easy' }] } } }), { status: 200 });
    }
    if (u.includes('InterestResource')) {
      return new Response(JSON.stringify({ resource_response: { data: { id: '9001', name: 'Soup', url_name: 'soup', internal_search_count: 880000, related_interests: [] } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ metrics: {} }), { status: 200 });
  };

  const app = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'wave6e-secret',
    DATABASE_URL: '',
    SQL_CLIENT: sql,
    NEWBORN_FETCH_IMPL: mockFetch
  });
  t.after(async () => {
    clearNewbornInflightRunsForTest();
    await app.close();
  });

  // Unauthenticated POST /api/newborn/cluster/build must be blocked (401)
  const unauthRes = await app.inject({
    method: 'POST',
    url: '/api/newborn/cluster/build',
    payload: { seed_keyword: 'soup' }
  });
  assert.equal(unauthRes.statusCode, 401);

  // Authenticated POST /api/newborn/cluster/build succeeds
  const buildRes = await app.inject({
    method: 'POST',
    url: '/api/newborn/cluster/build',
    headers: { 'x-api-key': 'wave6e-secret' },
    payload: { seed_keyword: 'soup', country: 'US', enrich_limit: 5 }
  });
  assert.equal(buildRes.statusCode, 200);
  const builtJson = buildRes.json();
  assert.equal(builtJson.success, true);
  assert.equal(builtJson.cluster.seed_keyword, 'soup');
  assert.ok(builtJson.cluster.keyword_count >= 2);

  // GET /api/newborn/clusters lists saved clusters
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/newborn/clusters'
  });
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.json().clusters.length, 1);

  // GET /api/newborn/clusters/:id fetches saved cluster
  const getRes = await app.inject({
    method: 'GET',
    url: `/api/newborn/clusters/${builtJson.cluster.id}`
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().cluster.seed_keyword, 'soup');

  // SSR /newborn HTML checks
  const htmlRes = await app.inject({ method: 'GET', url: '/newborn' });
  assert.equal(htmlRes.statusCode, 200);
  const html = htmlRes.body;
  assert.ok(html.includes('tab-newborn-cluster'), 'Cluster Explorer tab rendered');
  assert.ok(html.includes('Newborn Keyword Cluster Explorer'), 'Cluster Explorer panel rendered');
  assert.ok(html.includes('Enrich Remaining Volumes'), 'Phase 2 Volume enrichment button rendered');
  assert.ok(html.includes('Find more ideas only'), 'Boards path explicitly displays Find more ideas only');
  assert.ok(html.includes('max="10000"'), 'Custom numeric input up to 10,000 for Search rendered');
  assert.ok(!html.includes('Hydration cap:'), 'Hydration cap control must be removed per Directive 3');
  assert.ok(html.includes('discover-hunt-settings-bar') && html.includes('href="/settings"'), 'Collapsible hunt settings summary bar and Workspace Settings link rendered');
  assert.ok(html.includes('Cluster Hits (2x+)'), 'Cluster Hits sort option rendered');
});
