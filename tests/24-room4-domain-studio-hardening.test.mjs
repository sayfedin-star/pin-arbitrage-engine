import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handleDomainsRoutes } from '../src/routes/domains.mjs';
import { handleUrlGlobalSavesRoutes } from '../src/routes/urls-global-saves.mjs';
import {
  listDomainsIntelligence,
  listDomainsIntelligenceFast,
  syncSingleDomainRollup
} from '../src/modules/domains/rollup-leaderboard-service.mjs';
import {
  getDomainDeepDossier,
  generateDomainArbitrageBlueprint
} from '../src/modules/domains/dossier-blueprint-service.mjs';
import {
  AD_NETWORK_DISPLAY_CONFIG,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats
} from '../src/modules/domains/ad-network-service.mjs';
import { getDatabaseEnrichmentStats } from '../src/modules/domains/whois-age-service.mjs';
import { TtlSingleflightCache } from '../src/lib/ttl-cache.mjs';
import { redactSecrets } from '../src/http/security-and-response.mjs';
import { getDomainsPageHtml } from '../src/ui/domains/index.mjs';
import { getDomainsClientAppScript } from '../src/ui/domains/domains-client-app.mjs';
import { getDomainsLeaderboardViewHtml } from '../src/ui/domains/domains-leaderboard-view.mjs';
import { getDomainsStudioViewHtml } from '../src/ui/domains/domains-studio-view.mjs';
import { getDomainsModalsHtml } from '../src/ui/domains/domains-modals.mjs';

const jsonResponse = (payload, status = 200) => ({ status, payload });
const methodNotAllowedResponse = (allowed = 'GET, OPTIONS') => ({
  status: 405,
  payload: { error: 'METHOD_NOT_ALLOWED', allowed }
});

function instantiateDomainsApp(initialDomain = '', scopedFolderId = '', extraGlobals = {}) {
  const scriptBody = getDomainsClientAppScript()
    .replace(/^\s*<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '');
  const globalNames = Object.keys(extraGlobals);
  const globalValues = Object.values(extraGlobals);
  const factory = new Function(...globalNames, `${scriptBody}\nreturn domainsApp;`);
  const domainsAppFn = factory(...globalValues);
  const app = domainsAppFn(initialDomain, scopedFolderId);
  app.$nextTick = (cb) => {
    if (typeof cb === 'function') cb();
  };
  app.$watch = () => {};
  return app;
}

function makeDomainsRouteCtx(overrides = {}) {
  return {
    pathname: '/api/domains',
    method: 'GET',
    request: new Request('https://app.hymum.com/api/domains'),
    searchParams: new URLSearchParams(),
    env: { NODE_ENV: 'production', API_SECRET_KEY: 'topsecret-key' },
    ctx: {},
    sql: async () => [],
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    clampLimit: (v, d, max = 200) => Math.max(1, Math.min(Number(v) || d, max)),
    buildCanonicalCacheKey: (ns, p) => `${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    redactSecrets: (s) => String(s || ''),
    ...overrides
  };
}

test('P0-1: Cross-workspace folder_id IDOR returns 404 and invalid folder_id returns 400 across /api/domains*', async () => {
  const folderOnlyInWs1Sql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM keyword_folders') && q.includes('WHERE id =')) {
      const fid = Number(values[0]);
      const wid = Number(values[1]);
      return fid === 5 && wid === 1 ? [{ id: 5, name: 'WS1 Folder', workspace_id: 1 }] : [];
    }
    return [];
  };

  for (const [pathname, query] of [
    ['/api/domains', 'folder_id=5'],
    ['/api/domains/dossier', 'domain=example.com&folder_id=5'],
    ['/api/domains/blueprint', 'domain=example.com&folder_id=5']
  ]) {
    const res404 = await handleDomainsRoutes(makeDomainsRouteCtx({
      pathname,
      searchParams: new URLSearchParams(query),
      sql: folderOnlyInWs1Sql,
      workspaceId: 2
    }));
    assert.equal(res404.status, 404, `${pathname}?${query} from Workspace 2 must fail-closed with 404`);
  }

  for (const [pathname, query] of [
    ['/api/domains', 'folder_id=abc'],
    ['/api/domains/dossier', 'domain=example.com&folder_id=-3'],
    ['/api/domains/blueprint', 'domain=example.com&folder_id=0']
  ]) {
    const res400 = await handleDomainsRouteCtxSafe(pathname, query, folderOnlyInWs1Sql);
    assert.equal(res400.status, 400, `${pathname}?${query} must return 400`);
  }
});

async function handleDomainsRouteCtxSafe(pathname, query, sql) {
  return handleDomainsRoutes(makeDomainsRouteCtx({
    pathname,
    searchParams: new URLSearchParams(query),
    sql,
    workspaceId: 1
  }));
}

test('P0-2: Workspace 2+ isolation pushes allowedDomains into SQL, skips rollup scan when empty, recomputes overview & enforces pinned_only', async () => {
  const executed = [];
  const allRollupRows = [
    {
      domain: 'ws1-giant.com',
      total_pins: 200,
      unique_urls: 20,
      pins_per_url: 10,
      top10_pins: 100,
      visibility_score: 5000,
      total_saves: 500000,
      accounts_count: 5,
      age_years: 1.0,
      age_status: 'resolved',
      ad_network: 'mediavine',
      total_filtered_domains: 3,
      global_top10_slots: 120,
      top5_global_slots: 120,
      baby_giants_count: 2,
      multi_account_domains_count: 2,
      global_avg_multiplier: 6.0
    },
    {
      domain: 'ws2-target.com',
      total_pins: 12,
      unique_urls: 4,
      pins_per_url: 3.0,
      top10_pins: 5,
      visibility_score: 225,
      total_saves: 4500,
      accounts_count: 1,
      age_years: 1.5,
      age_status: 'unchecked',
      ad_network: 'unchecked',
      total_filtered_domains: 3,
      global_top10_slots: 120,
      top5_global_slots: 120,
      baby_giants_count: 2,
      multi_account_domains_count: 2,
      global_avg_multiplier: 6.0
    },
    {
      domain: 'ws2-pinned.com',
      total_pins: 8,
      unique_urls: 4,
      pins_per_url: 2.0,
      top10_pins: 15,
      visibility_score: 675,
      total_saves: 12000,
      accounts_count: 2,
      age_years: 3.0,
      age_status: 'resolved',
      ad_network: 'raptive',
      total_filtered_domains: 3,
      global_top10_slots: 120,
      top5_global_slots: 120,
      baby_giants_count: 2,
      multi_account_domains_count: 2,
      global_avg_multiplier: 6.0
    }
  ];

  // Empty Workspace 3: must return empty response WITHOUT querying domain_intelligence_rollup
  const ws3Queries = [];
  const ws3Res = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 3,
    sql: async (strings) => {
      const q = strings.join(' ');
      ws3Queries.push(q);
      return [];
    }
  }));
  assert.equal(ws3Res.status, 200);
  assert.equal(ws3Res.payload.domains.length, 0);
  assert.equal(ws3Res.payload.overview.total_domains, 0);
  assert.equal(
    ws3Queries.some((q) => q.includes('domain_intelligence_rollup')),
    false,
    'Empty workspace must not trigger global domain_intelligence_rollup scan'
  );

  // Workspace 2 with watchlist + folder_pinned_domains: pushes ANY(...) into SQL and recomputes overview
  const ws2Sql = async (strings, ...values) => {
    const q = strings.join(' ');
    executed.push({ q, values });
    if (q.includes('FROM workspace_watchlist')) {
      return [{ dom: 'ws2-target.com' }];
    }
    if (q.includes('FROM folder_pinned_domains')) {
      return [{ dom: 'ws2-pinned.com' }];
    }
    if (q.includes('FROM campaign_tracked_pins')) {
      return [];
    }
    if (q.includes('FROM domain_intelligence_rollup r')) {
      const allowedArg = values.find((v) => Array.isArray(v));
      if (Array.isArray(allowedArg)) {
        const set = new Set(allowedArg.map((x) => x.toLowerCase()));
        return allRollupRows.filter((r) => set.has(r.domain));
      }
      return allRollupRows;
    }
    return [];
  };

  const ws2Res = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 2,
    searchParams: new URLSearchParams('limit=1&page=1'),
    sql: ws2Sql
  }));
  assert.equal(ws2Res.status, 200);
  assert.equal(ws2Res.payload.total_domains, 2);
  assert.equal(ws2Res.payload.total_pages, 2);
  assert.equal(ws2Res.payload.domains.length, 1);
  assert.equal(ws2Res.payload.overview.total_domains, 2, 'Overview must reflect workspace-scoped domains, not global rollup');
  assert.equal(ws2Res.payload.overview.baby_giants_count, 1);
  assert.equal(ws2Res.payload.overview.multi_account_count, 1);
  assert.equal(ws2Res.payload.overview.avg_pins_per_url, 2.5);
  assert.ok(
    executed.some((e) => e.q.includes('ANY(') && e.values.some((v) => Array.isArray(v) && v.includes('ws2-target.com'))),
    'Workspace 2+ must push allowedDomains array into SQL ANY(...)'
  );
  for (const dom of ws2Res.payload.missing_age_domains) {
    assert.notEqual(dom, 'ws1-giant.com');
  }

  // pinned_only=true must isolate to folder_pinned_domains even in Workspace 1
  const pinnedOnlyRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 1,
    searchParams: new URLSearchParams('pinned_only=true'),
    sql: ws2Sql
  }));
  assert.equal(pinnedOnlyRes.status, 200);
  assert.deepEqual(pinnedOnlyRes.payload.domains.map((d) => d.domain), ['ws2-pinned.com']);
  assert.equal(pinnedOnlyRes.payload.overview.total_domains, 1);
});

test('P0-3: Mutating /api/domains/* routes enforce auth, 405, reject organic vault, and invalidate both caches', async () => {
  const authedHeaders = { 'x-api-key': 'topsecret-key', 'content-type': 'application/json' };
  const prodEnv = { NODE_ENV: 'production', API_SECRET_KEY: 'topsecret-key' };

  // 1. Unauthenticated mutating calls fail with 401 before touching DB or cache
  for (const pathname of [
    '/api/domains/enrich-age',
    '/api/domains/enrich-ads',
    '/api/domains/enrich-all',
    '/api/domains/enrich-ads-all',
    '/api/domains/refresh-rollup'
  ]) {
    let invalidated = false;
    const unauthRes = await handleDomainsRoutes(makeDomainsRouteCtx({
      pathname,
      method: 'POST',
      request: new Request(`https://app.hymum.com${pathname}`, { method: 'POST', body: JSON.stringify({ domain: 'example.com' }) }),
      env: prodEnv,
      invalidateEdgeCache: async () => { invalidated = true; }
    }));
    assert.equal(unauthRes.status, 401, `${pathname} without token must return 401`);
    assert.equal(invalidated, false, `${pathname} must not invalidate edge cache when unauthenticated`);

    const wrongMethodRes = await handleDomainsRoutes(makeDomainsRouteCtx({
      pathname,
      method: 'GET',
      request: new Request(`https://app.hymum.com${pathname}`, { method: 'GET' }),
      env: prodEnv
    }));
    assert.equal(wrongMethodRes.status, 405, `${pathname} GET must return 405`);
  }

  // 2. GET-only endpoints reject POST with 405
  for (const pathname of ['/api/domains', '/api/domains/dossier', '/api/domains/blueprint', '/api/domains/ads-status', '/api/domains/enrich-status']) {
    const res405 = await handleDomainsRoutes(makeDomainsRouteCtx({
      pathname,
      method: 'POST',
      request: new Request(`https://app.hymum.com${pathname}`, { method: 'POST' }),
      env: prodEnv
    }));
    assert.equal(res405.status, 405, `${pathname} POST must return 405`);
  }

  // 3. Organic vault string is rejected on enrich-age & enrich-ads with 400
  for (const pathname of ['/api/domains/enrich-age', '/api/domains/enrich-ads']) {
    const orgRes = await handleDomainsRoutes(makeDomainsRouteCtx({
      pathname,
      method: 'POST',
      request: new Request(`https://app.hymum.com${pathname}`, {
        method: 'POST',
        headers: authedHeaders,
        body: JSON.stringify({ domain: 'Uploaded by user' })
      }),
      env: prodEnv
    }));
    assert.equal(orgRes.status, 400, `${pathname} must reject Uploaded by user with 400`);
  }

  // 4. Authenticated enrich-age and refresh-rollup invalidate BOTH domains:leaderboard and domains:dossier
  const cachedAgeSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM domain_intelligence_rollup')) {
      return [{
        domain: 'example.com',
        registered_at: '2024-01-01T00:00:00Z',
        lookup_status: 'resolved',
        age_status: 'resolved',
        age_days: 500,
        age_years: 1.37
      }];
    }
    return [];
  };
  const invTags = [];
  const okAgeRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/enrich-age',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/domains/enrich-age', {
      method: 'POST',
      headers: authedHeaders,
      body: JSON.stringify({ domain: 'example.com' })
    }),
    env: prodEnv,
    sql: cachedAgeSql,
    invalidateEdgeCache: async (tag) => invTags.push(tag)
  }));
  assert.equal(okAgeRes.status, 200);
  assert.ok(invTags.includes('domains:leaderboard') && invTags.includes('domains:dossier'));

  // 5. Dossier cache key includes workspaceId
  const cacheKeys = [];
  await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/dossier',
    method: 'GET',
    searchParams: new URLSearchParams('domain=example.com'),
    workspaceId: 2,
    buildCanonicalCacheKey: (ns, p) => {
      const k = `${ns}:${JSON.stringify(p)}`;
      cacheKeys.push(k);
      return k;
    },
    sql: async () => []
  }));
  assert.ok(cacheKeys.some((k) => k.includes('"workspaceId":2')), 'Dossier cache key must isolate by workspaceId');
});

test('P0-4: SSR HTML preserves Organic Vault cleanly, escapes XSS payloads, and studio uses safeColor()', () => {
  const organicHtml = getDomainsPageHtml('Uploaded by user');
  assert.ok(organicHtml.includes("domainsApp('Uploaded by user')"));

  const xssHtml = getDomainsPageHtml("bad.com');alert(1);//");
  assert.equal(xssHtml.includes('alert(1)'), false, 'XSS payload must be stripped from domainsApp initial arg');

  const studioHtml = getDomainsStudioViewHtml();
  assert.ok(studioHtml.includes("safeColor(p.dominant_color, '#888888')"));
  assert.equal(studioHtml.includes("'background-color: ' + p.dominant_color"), false);
});

test('P1-1: domainsApp.openDossier hydrates money_urls from /api/urls/batch-global-saves object map', async () => {
  const fetchCalls = [];
  const mockFetch = async (url) => {
    fetchCalls.push(url);
    if (String(url).startsWith('/api/domains/dossier')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          domain: 'recipes-blog.com',
          summary: { is_organic_vault: false },
          money_urls: [
            { clean_slug: '/pasta-bake', sample_url: 'https://recipes-blog.com/pasta-bake', pins: [] },
            { clean_slug: '/soup/', sample_url: 'https://recipes-blog.com/soup/', pins: [] }
          ]
        })
      };
    }
    if (String(url) === '/api/urls/batch-global-saves') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          results: {
            'https://recipes-blog.com/pasta-bake': 4200,
            'https://recipes-blog.com/soup': 1850
          }
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const app = instantiateDomainsApp('', '', {
    window: { safeApiFetch: mockFetch, location: { pathname: '/domains', search: '' }, history: { pushState: () => {} } }
  });

  await app.openDossier('recipes-blog.com', false);
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(fetchCalls.includes('/api/urls/batch-global-saves'));
  assert.equal(app.dossierData.money_urls[0].url_global_saves, 4200);
  assert.equal(app.dossierData.money_urls[1].url_global_saves, 1850);
});

test('P1-2: cluster_push_signal preset and domain_asc/domain_desc sorting work in SQL & client toggleSortColumn', async () => {
  const capturedFast = [];
  const mockFastSql = async (strings, ...values) => {
    capturedFast.push({ sql: strings.join(' '), values });
    return [];
  };

  await listDomainsIntelligenceFast(mockFastSql, {
    preset: 'cluster_push_signal',
    sortBy: 'domain_asc',
    minPins: 1
  });
  const fastQuery = capturedFast.find((c) => c.sql.includes('FROM domain_intelligence_rollup r'));
  assert.ok(fastQuery, 'Expected fast rollup query');
  assert.ok(fastQuery.sql.includes('cluster_push_signal'));
  assert.ok(fastQuery.sql.includes('competitor_profiles'));
  assert.ok(fastQuery.sql.includes("IN ('domain_asc', 'domain')"));
  assert.equal(Number(fastQuery.values[0]), 1, 'Positional minPins bind index 0 preserved');

  const capturedCte = [];
  await listDomainsIntelligence(
    async (strings, ...values) => {
      capturedCte.push({ sql: strings.join(' '), values });
      return [];
    },
    { preset: 'cluster_push_signal', sortBy: 'domain_desc', folderId: 5 }
  );
  assert.ok(capturedCte[0].sql.includes('cluster_push_signal'));
  assert.ok(capturedCte[0].sql.includes("= 'domain_desc'"));

  const app = instantiateDomainsApp();
  app.loadDomains = () => {};
  app.toggleSortColumn('domain');
  assert.equal(app.sortBy, 'domain_asc');
  app.toggleSortColumn('domain');
  assert.equal(app.sortBy, 'domain_desc');
});

test('P1-3 & UI: ads_txt_status resolved highlight, single action bar, no duplicate Esc, no bg-black/75, keyboard/ARIA checks', () => {
  const studioHtml = getDomainsStudioViewHtml();
  const modalsHtml = getDomainsModalsHtml();
  const leaderboardHtml = getDomainsLeaderboardViewHtml();

  assert.ok(studioHtml.includes("['resolved', 'valid'].includes(dossierData?.ad_info?.ads_txt_status)"));
  assert.equal((studioHtml.match(/openBlueprintModal\(dossierDomain\)/g) || []).length, 1, 'Top duplicate Attack Plan button must be removed');
  assert.equal((studioHtml.match(/recheckAgeForDossier\(\)/g) || []).length, 1, 'Top duplicate Re-check Age button must be removed');
  assert.equal((studioHtml.match(/recheckAdsForDossier\(\)/g) || []).length, 1, 'Top duplicate Re-scan ads.txt button must be removed');
  assert.equal(studioHtml.includes('bg-black/75'), false, 'Banned pure-black overlay class must be removed');
  assert.ok(studioHtml.includes('filteredDossierAccounts()'));
  assert.ok(studioHtml.includes('((dossierPinsPage - 1) * dossierPinsPerPage) + idx + 1'));

  assert.equal(modalsHtml.includes('@keydown.escape.window'), false, 'Blueprint modal must not bind duplicate escape listener');
  assert.ok(modalsHtml.includes('aria-label="Close Attack Blueprint modal"'));

  assert.ok(leaderboardHtml.includes('role="button" tabindex="0" @keydown.enter.prevent="setPreset(\'all\')"'));
  assert.ok(leaderboardHtml.includes('aria-label="Search domains"'));
  assert.ok(leaderboardHtml.includes('aria-label="Filter by campaign folder"'));
  assert.ok(leaderboardHtml.includes('<template x-if="!scopedFolderId">'));
  assert.ok(leaderboardHtml.includes(":class=\"scopedFolderId ? 'lg:grid-cols-6' : 'lg:grid-cols-7'\""));
});

test('P1-4 & P1-5: displacedLimit slicing, organic vault SQL parity, catalog annotation unpacking, rollup sync & emoji-free ad config', async () => {
  const serpRows = [
    {
      pin_id: 'active_1',
      keyword_id: 1,
      keyword_name: 'easy dinner',
      rank_position: 2,
      last_known_rank: 2,
      is_displaced: false,
      title: 'Active Pin',
      destination_url: 'https://recipes-blog.com/a1',
      image_url: 'https://i.pinimg.com/236x/a1.jpg',
      creator_username: 'chef1',
      saves: 500,
      repins: 20,
      velocity: 10
    },
    ...Array.from({ length: 40 }, (_, i) => ({
      pin_id: `disp_${i + 1}`,
      keyword_id: 1,
      keyword_name: 'easy dinner',
      rank_position: null,
      last_known_rank: i + 10,
      is_displaced: true,
      title: `Displaced Pin ${i + 1}`,
      destination_url: `https://recipes-blog.com/d${i + 1}`,
      image_url: `https://i.pinimg.com/236x/d${i + 1}.jpg`,
      creator_username: 'chef1',
      saves: 300 - i,
      repins: 10,
      velocity: 0
    }))
  ];
  const umpRows = [
    {
      pin_id: 'cat_1',
      title: 'Catalog Pin',
      destination_url: 'https://recipes-blog.com/cat',
      image_url: 'https://i.pinimg.com/236x/cat.jpg',
      creator_username: 'chef1',
      saves: 120,
      repins: 5,
      velocity: 2,
      visual_annotations: JSON.stringify([{ name: 'Pasta' }, { tag: 'Dinner' }])
    }
  ];

  const capturedQueries = [];
  const mockDossierSql = async (strings) => {
    const q = strings.join(' ');
    capturedQueries.push(q);
    if (q.includes('FROM keyword_serp_positions ksp')) return serpRows;
    if (q.includes('FROM universal_master_pins ump')) return umpRows;
    return [];
  };

  const dossier = await getDomainDeepDossier(mockDossierSql, 'recipes-blog.com', { displacedLimit: 30 });
  assert.equal(dossier.ranked_pins.length, 31, '1 active + 30 displaced pins returned');
  assert.equal(dossier.summary.displaced_pins_count, 30);
  assert.equal(dossier.summary.displaced_total_count, 40);
  assert.equal(dossier.summary.displaced_remaining_count, 10);
  assert.deepEqual(dossier.catalog_pins[0].visual_annotations, ['Pasta', 'Dinner']);

  // Organic vault SQL parity & emoji-free blueprint
  const orgQueries = [];
  await getDomainDeepDossier(
    async (strings) => {
      orgQueries.push(strings.join(' '));
      return [];
    },
    'Uploaded by user'
  );
  assert.ok(orgQueries.some((q) => q.includes("'uploaded-by-user'") && q.includes("'organic'")));

  const blueprint = await generateDomainArbitrageBlueprint(mockDossierSql, 'recipes-blog.com');
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(blueprint.markdown_blueprint), false, 'Blueprint markdown must not contain emojis');

  // syncSingleDomainRollup hydrates non-zero summary counts
  const syncCalls = [];
  await syncSingleDomainRollup(
    async (strings, ...values) => {
      syncCalls.push({ q: strings.join(' '), values });
      return [{ domain: 'recipes-blog.com' }];
    },
    'recipes-blog.com',
    {
      age_info: { age_days: 400, age_years: 1.1, lookup_status: 'resolved' },
      ad_info: { current_ad_network: 'mediavine', ads_txt_status: 'resolved' },
      summary: { total_pins: 41, total_saves: 9999, accounts_count: 2, unique_urls: 5, pins_per_url: 8.2 }
    }
  );
  const insertCall = syncCalls.find((c) => c.q.includes('INSERT INTO domain_intelligence_rollup'));
  assert.ok(insertCall && insertCall.values.includes(41) && insertCall.values.includes(9999));

  // AD_NETWORK_DISPLAY_CONFIG has zero emojis & enrichMissingAdNetworksBatch caps candidates cleanly
  for (const cfg of Object.values(AD_NETWORK_DISPLAY_CONFIG)) {
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(cfg.badge + cfg.icon), false);
  }
  const emptyBatch = await enrichMissingAdNetworksBatch(async () => [], [], 10);
  assert.equal(emptyBatch.enriched, 0);
});

test('P1-6: Client VM state checks (closeDossier age_years, fetchPinnedDomains, refreshDomains warning, batchEnrichVisible 401 & skip organic, filteredDossierAccounts, copy fallback)', async () => {
  const fetchedUrls = [];
  let batchCalls = 0;
  const mockFetch = async (url) => {
    fetchedUrls.push(url);
    if (String(url) === '/api/domains/refresh-rollup') {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    if (String(url).startsWith('/api/domains?')) {
      return { ok: true, status: 200, json: async () => ({ success: true, domains: [], overview: { total_domains: 0 }, total: 0, total_pages: 1 }) };
    }
    if (String(url).startsWith('/api/folders/7/domains')) {
      return { ok: true, status: 200, json: async () => ({ pinned_domains: ['alpha.com'] }) };
    }
    if (String(url) === '/api/domains/enrich-age') {
      batchCalls++;
      return { ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const app = instantiateDomainsApp('', '', {
    window: { safeApiFetch: mockFetch, location: { pathname: '/domains', search: '' }, history: { pushState: () => {} } }
  });

  // closeDossier syncs age_years
  app.domains = [{ domain: 'alpha.com', age_days: null, age_years: null }];
  app.dossierDomain = 'alpha.com';
  app.dossierData = { age_info: { age_days: 730, age_years: 2.0, lookup_status: 'resolved' }, ad_info: { current_ad_network: 'raptive' } };
  app.closeDossier(false);
  assert.equal(app.domains[0].age_days, 730);
  assert.equal(app.domains[0].age_years, 2.0);

  // fetchPinnedDomains resets when cleared and fetches when selectedFolderId set
  app.selectedFolderId = '7';
  await app.fetchPinnedDomains();
  assert.equal(app.pinnedDomains.has('alpha.com'), true);
  app.selectedFolderId = '';
  await app.fetchPinnedDomains();
  assert.equal(app.pinnedDomains.size, 0);

  // refreshDomains shows warning when rollup returns HTTP 500 or HTTP 200 { success: false }
  await app.refreshDomains();
  assert.ok(app.toasts.some((t) => t.type === 'warning'));

  const ok200FalseApp = instantiateDomainsApp('', '', {
    window: {
      safeApiFetch: async (url) => {
        if (String(url) === '/api/domains/refresh-rollup') {
          return { ok: true, status: 200, json: async () => ({ success: false, error: 'DB timeout' }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, domains: [], overview: { total_domains: 0 }, total: 0, total_pages: 1 }) };
      },
      location: { pathname: '/domains', search: '' },
      history: { pushState: () => {} }
    }
  });
  await ok200FalseApp.refreshDomains();
  assert.ok(ok200FalseApp.toasts.some((t) => t.type === 'warning'), 'HTTP 200 { success: false } must trigger warning toast');

  // fetchPinnedDomains ignores stale out-of-order folder responses & loadMoreDisplaced resets dossierLoadingMore on abort
  let resolveFolderA;
  const raceApp = instantiateDomainsApp('', '', {
    window: {
      safeApiFetch: (url) => {
        if (String(url).includes('/api/folders/10/domains')) {
          return new Promise((resolve) => { resolveFolderA = resolve; });
        }
        if (String(url).includes('/api/folders/20/domains')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ pinned_domains: ['folder20.com'] }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      },
      location: { pathname: '/domains', search: '' },
      history: { pushState: () => {} }
    }
  });
  const pA = raceApp.fetchPinnedDomains('10');
  const pB = raceApp.fetchPinnedDomains('20');
  await pB;
  resolveFolderA({ ok: true, status: 200, json: async () => ({ pinned_domains: ['folder10-stale.com'] }) });
  await pA;
  assert.equal(raceApp.pinnedDomains.has('folder20.com'), true);
  assert.equal(raceApp.pinnedDomains.has('folder10-stale.com'), false);

  raceApp.dossierDomain = 'folder20.com';
  raceApp.dossierLoadingMore = true;
  raceApp.closeDossier(false);
  assert.equal(raceApp.dossierLoadingMore, false, 'closeDossier must reset dossierLoadingMore');

  // /api/domains/refresh-rollup returns 500 with redacted error when rollup fails
  const refreshFailRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/refresh-rollup',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/domains/refresh-rollup', {
      method: 'POST',
      headers: { 'x-api-key': 'topsecret-key' }
    }),
    env: { NODE_ENV: 'production', API_SECRET_KEY: 'topsecret-key' },
    sql: async () => { throw new Error('postgres://user:secretpass@db.internal/app failed'); }
  }));
  assert.equal(refreshFailRes.status, 500);
  assert.equal(refreshFailRes.payload.success, false);
  assert.equal(String(refreshFailRes.payload.error).includes('secretpass'), false);

  // batchEnrichVisible skips 'Uploaded by user' and halts on 401
  app.domains = [
    { domain: 'Uploaded by user', age_status: 'unchecked' },
    ...Array.from({ length: 12 }, (_, i) => ({ domain: `site${i}.com`, age_status: 'unchecked' }))
  ];
  await app.batchEnrichVisible();
  assert.equal(batchCalls, 1, 'Must halt after first 401 chunk instead of firing remaining chunks');
  assert.ok(app.toasts.some((t) => t.type === 'error' && t.message.includes('401')));

  // filteredDossierAccounts filters by username / sister domain
  app.dossierData = {
    accounts: [
      { username: 'chef_alpha', role_label: 'Primary Brand Account', sister_domains: [] },
      { username: 'sat_beta', role_label: 'Satellite / Ghost Creator', sister_domains: [{ domain: 'sister.example', pins_count: 4 }] }
    ]
  };
  app.dossierSearch = 'sister.example';
  assert.deepEqual(app.filteredDossierAccounts().map((a) => a.username), ['sat_beta']);

  // copyBlueprintMarkdown falls back when navigator.clipboard is absent
  let fallbackCopied = null;
  app.fallbackCopy = (text) => { fallbackCopied = text; };
  app.blueprintData = { markdown_blueprint: '# Plan' };
  app.copyBlueprintMarkdown();
  assert.equal(fallbackCopied, '# Plan');
});

test('Blind-Review P0/P1/P2 fixes: cache poisoning guard, stats secret redaction, 2150-domain WS2+ scaling, PG16 jsonb guard, rollup micro-sync, enrich DB fail-closed & UI regressions', async () => {
  const prodEnv = { NODE_ENV: 'production', API_SECRET_KEY: 'topsecret-key' };
  const authedHeaders = { 'x-api-key': 'topsecret-key', 'content-type': 'application/json' };

  // 1. P0-1: Transient DB error in queryAllowedDomainSet & queryPinnedDomainSet returns 500 and never caches empty 200; 42P01 still degrades to empty 200
  const cache = new TtlSingleflightCache({ maxEntries: 32, defaultTtlMs: 60000, defaultStaleMs: 120000 });
  const getCached = async (k, fn, ttlMs, staleMs) => cache.getOrFetch(k, fn, { ttlMs, staleMs });

  const transientErrSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM workspace_watchlist')) {
      throw new Error('ECONNRESET postgres://u:secretpass@db.internal/app');
    }
    return [];
  };
  const ws2ErrRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 2,
    sql: transientErrSql,
    getCachedOrFetch: getCached,
    redactSecrets
  }));
  assert.equal(ws2ErrRes.status, 500, 'Transient DB failure in queryAllowedDomainSet must fail with 500');
  assert.equal(String(ws2ErrRes.payload.error).includes('secretpass'), false);
  assert.equal(cache.size, 0, 'Transient DB error must NOT poison cache with empty 200');

  const pinnedErrSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM folder_pinned_domains')) {
      throw new Error('statement timeout');
    }
    return [];
  };
  const pinnedErrRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 1,
    searchParams: new URLSearchParams('pinned_only=true'),
    sql: pinnedErrSql,
    getCachedOrFetch: getCached,
    redactSecrets
  }));
  assert.equal(pinnedErrRes.status, 500, 'Transient DB failure in queryPinnedDomainSet must fail with 500');
  assert.equal(cache.size, 0, 'Pinned query DB failure must NOT poison cache');

  const missingRelRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 4,
    sql: async () => {
      const e = new Error('relation "workspace_watchlist" does not exist');
      e.code = '42P01';
      throw e;
    }
  }));
  assert.equal(missingRelRes.status, 200);
  assert.equal(missingRelRes.payload.domains.length, 0);

  // 2. P0-2: /api/domains/ads-status & /api/domains/enrich-status return 500 with redacted errors
  const secretThrowSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('WITH rollup_stats') || q.includes('FROM domain_intelligence_rollup\n      WHERE domain')) {
      return [];
    }
    throw new Error('postgres://admin:secretpass@db.internal:5432/prod failed');
  };
  const adsStatusErr = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/ads-status',
    sql: secretThrowSql,
    redactSecrets
  }));
  assert.equal(adsStatusErr.status, 500);
  assert.equal(adsStatusErr.payload.success, false);
  assert.equal(String(adsStatusErr.payload.error).includes('secretpass'), false);

  const enrichStatusErr = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/enrich-status',
    sql: secretThrowSql,
    redactSecrets
  }));
  assert.equal(enrichStatusErr.status, 500);
  assert.equal(enrichStatusErr.payload.success, false);
  assert.equal(String(enrichStatusErr.payload.error).includes('secretpass'), false);

  const rawMonStats = await getDatabaseMonetizationStats(secretThrowSql);
  assert.equal(String(rawMonStats.error).includes('secretpass'), false);
  const rawEnrichStats = await getDatabaseEnrichmentStats(secretThrowSql);
  assert.equal(String(rawEnrichStats.error).includes('secretpass'), false);

  // 3. P1-1: Workspace 2+ with 2,150 domains & pinned_only=true intersection preserves full count without 2000-row clamp
  const manyDomains = Array.from({ length: 2150 }, (_, i) => ({
    domain: `ws2-domain-${i + 1}.com`,
    total_pins: 10,
    unique_urls: 2,
    pins_per_url: 5,
    top10_pins: 1,
    visibility_score: 45,
    total_saves: 1000,
    accounts_count: 1,
    age_years: 1.0,
    age_status: 'resolved',
    ad_network: 'mediavine'
  }));
  let capturedMaxLimit = 0;
  const largeWs2Sql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM workspace_watchlist')) {
      return manyDomains.map((d) => ({ dom: d.domain }));
    }
    if (q.includes('FROM folder_pinned_domains')) {
      return [{ dom: 'ws2-domain-1.com' }, { dom: 'ws2-domain-2150.com' }];
    }
    if (q.includes('FROM campaign_tracked_pins')) {
      return [];
    }
    if (q.includes('FROM domain_intelligence_rollup r')) {
      const nums = values.filter((v) => typeof v === 'number');
      capturedMaxLimit = nums.length > 0 ? nums[nums.length - 2] : 0;
      const allowedArg = values.find((v) => Array.isArray(v));
      const pool = Array.isArray(allowedArg)
        ? manyDomains.filter((d) => allowedArg.includes(d.domain))
        : manyDomains;
      return pool.slice(0, capturedMaxLimit);
    }
    return [];
  };

  const ws2LargeRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 2,
    searchParams: new URLSearchParams('limit=50&page=1'),
    sql: largeWs2Sql
  }));
  assert.equal(ws2LargeRes.status, 200);
  assert.ok(capturedMaxLimit >= 2150, `Expected SQL limit >= 2150, got ${capturedMaxLimit}`);
  assert.equal(ws2LargeRes.payload.total_domains, 2150);
  assert.equal(ws2LargeRes.payload.total_pages, 43);
  assert.equal(ws2LargeRes.payload.overview.total_domains, 2150);

  const ws2PinnedIntersection = await handleDomainsRoutes(makeDomainsRouteCtx({
    workspaceId: 2,
    searchParams: new URLSearchParams('pinned_only=true'),
    sql: largeWs2Sql
  }));
  assert.equal(ws2PinnedIntersection.status, 200);
  assert.equal(ws2PinnedIntersection.payload.pinned_scoped, true);
  assert.deepEqual(ws2PinnedIntersection.payload.domains.map((d) => d.domain), ['ws2-domain-1.com', 'ws2-domain-2150.com']);

  // 4. P1-2: PG16 jsonb_typeof guard & www.-normalized SQL predicate
  const pg16Captured = [];
  await listDomainsIntelligenceFast(
    async (strings, ...values) => {
      pg16Captured.push({ sql: strings.join(' '), values });
      return [];
    },
    { preset: 'cluster_push_signal', allowedDomains: ['www.example.com'] }
  );
  const pg16Query = pg16Captured.find((c) => c.sql.includes('FROM domain_intelligence_rollup r'));
  assert.ok(pg16Query.sql.includes("jsonb_typeof(r.sample_accounts) = 'array'"));
  assert.ok(pg16Query.sql.includes("REGEXP_REPLACE(LOWER(r.domain), '^www\\.', '') = ANY("));

  // 5. P1-3 & P1-5: syncSingleDomainRollup guards pending/organic/keywordId & closeDossier never writes pending
  const pendingSyncCalls = [];
  await syncSingleDomainRollup(
    async (strings, ...values) => {
      pendingSyncCalls.push({ q: strings.join(' '), values });
      return [{ domain: 'fresh.com' }];
    },
    'fresh.com',
    {
      age_info: { lookup_status: 'pending' },
      ad_info: { current_ad_network: 'unchecked', ads_txt_status: 'pending' },
      summary: { total_pins: 5, total_saves: 100, unique_urls: 2 }
    }
  );
  const pendingInsert = pendingSyncCalls.find((c) => c.q.includes('INSERT INTO domain_intelligence_rollup'));
  assert.ok(pendingInsert, 'Expected insert in syncSingleDomainRollup');
  assert.equal(pendingInsert.values[21], 'unchecked', 'Pending lookup_status must map to age_status=unchecked (never pending)');
  assert.ok(pendingInsert.q.includes("EXCLUDED.age_status NOT IN ('unchecked', 'pending', '')"));

  const orgSyncCalls = [];
  await syncSingleDomainRollup(
    async (strings, ...values) => {
      orgSyncCalls.push({ q: strings.join(' '), values });
      return [{ domain: 'Uploaded by user' }];
    },
    'Uploaded by user',
    {
      age_info: { age_status: 'organic_unlinked', lookup_status: 'organic_vault' },
      ad_info: { current_ad_network: 'unmonetized', ads_txt_status: 'organic_unlinked' },
      summary: { total_pins: 9, total_saves: 400, unique_urls: 0 }
    }
  );
  const orgInsert = orgSyncCalls.find((c) => c.q.includes('INSERT INTO domain_intelligence_rollup'));
  assert.ok(orgInsert.values.includes('organic_unlinked'));
  assert.equal(orgInsert.values[4], 0, 'Organic Vault unique_urls must stay 0');

  const kwScopedSync = await syncSingleDomainRollup(
    async () => { throw new Error('Should not query SQL when keywordId is set'); },
    'fresh.com',
    { summary: { total_pins: 1 } },
    { keywordId: '42' }
  );
  assert.equal(kwScopedSync, null);

  let kwSyncScheduled = false;
  await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/dossier',
    method: 'GET',
    searchParams: new URLSearchParams('domain=example.com&keyword_id=42'),
    request: new Request('https://app.hymum.com/api/domains/dossier?domain=example.com&keyword_id=42', { headers: authedHeaders }),
    env: prodEnv,
    safeWaitUntil: (_ctx, _fn, label) => {
      if (label === 'sync_single_domain_rollup') kwSyncScheduled = true;
    },
    sql: async () => []
  }));
  assert.equal(kwSyncScheduled, false, 'keyword_id-scoped dossier must not dispatch sync_single_domain_rollup');

  const appPending = instantiateDomainsApp();
  appPending.domains = [{ domain: 'fresh.com', age_status: 'unchecked' }];
  appPending.dossierDomain = 'fresh.com';
  appPending.dossierData = { age_info: { lookup_status: 'pending' }, ad_info: {} };
  appPending.closeDossier(false);
  assert.equal(appPending.domains[0].age_status, 'unchecked', 'closeDossier must not overwrite age_status with pending');

  // 6. P1-4 & P0-3: enrich-ads / enrich-age DB failure returns 500 without invalidating cache; /api/domains/refresh enforces 405 & 401
  const adFailInv = [];
  const adDbFailRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/enrich-ads',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/domains/enrich-ads', {
      method: 'POST',
      headers: authedHeaders,
      body: JSON.stringify({ domain: 'example.com' })
    }),
    env: prodEnv,
    invalidateEdgeCache: async (t) => adFailInv.push(t),
    sql: async () => { throw new Error('DB read error'); }
  }));
  assert.equal(adDbFailRes.status, 500);
  assert.equal(adFailInv.length, 0, 'Failed enrich-ads DB write/read must not invalidate cache');

  const ageFailInv = [];
  const ageDbFailRes = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/enrich-age',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/domains/enrich-age', {
      method: 'POST',
      headers: authedHeaders,
      body: JSON.stringify({ domain: 'example.com' })
    }),
    env: prodEnv,
    invalidateEdgeCache: async (t) => ageFailInv.push(t),
    sql: async () => { throw new Error('DB read error'); }
  }));
  assert.equal(ageDbFailRes.status, 500);
  assert.equal(ageFailInv.length, 0, 'Failed enrich-age DB write must not invalidate cache');

  const refreshAlias405 = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/refresh',
    method: 'GET',
    env: prodEnv
  }));
  assert.equal(refreshAlias405.status, 405);
  const refreshAlias401 = await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/refresh',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/domains/refresh', { method: 'POST' }),
    env: prodEnv
  }));
  assert.equal(refreshAlias401.status, 401);

  // 7. P2: displaced_limit=abc cache key, enrichMissingAdNetworksBatch 120-domain cap, loadMoreDisplaced rollback, batchEnrichAdsVisible 401, UI contracts
  const dossierCacheKeys = [];
  await handleDomainsRoutes(makeDomainsRouteCtx({
    pathname: '/api/domains/dossier',
    method: 'GET',
    searchParams: new URLSearchParams('domain=example.com&displaced_limit=abc'),
    buildCanonicalCacheKey: (ns, p) => {
      const k = `${ns}:${JSON.stringify(p)}`;
      dossierCacheKeys.push(k);
      return k;
    },
    sql: async () => []
  }));
  assert.ok(dossierCacheKeys.some((k) => k.includes('"displacedLimit":30') && !k.includes('NaN')));

  const candidates120 = Array.from({ length: 120 }, (_, i) => `site-${i + 1}.com`);
  const queriedBatchDomains = [];
  const batchCapRes = await enrichMissingAdNetworksBatch(
    async (strings, ...values) => {
      const q = strings.join(' ');
      if (q.includes('FROM domain_intelligence_rollup')) {
        const dom = values[0];
        queriedBatchDomains.push(dom);
        return [{
          domain: dom,
          current_ad_network: 'mediavine',
          ads_txt_status: 'resolved',
          checked_at: new Date().toISOString(),
          network_history: []
        }];
      }
      return [];
    },
    candidates120,
    50
  );
  assert.equal(batchCapRes.enriched, 50, 'enrichMissingAdNetworksBatch must cap at 50 even with 120 candidates');
  assert.equal(queriedBatchDomains.includes('site-101.com'), false, 'Candidates beyond 100 must be sliced off');

  const dispApp = instantiateDomainsApp('', '', {
    window: {
      safeApiFetch: async () => {
        const e = new Error('The operation was aborted due to timeout');
        e.name = 'AbortError';
        throw e;
      },
      location: { pathname: '/domains', search: '' },
      history: { pushState: () => {} }
    }
  });
  dispApp.dossierDomain = 'alpha.com';
  dispApp.dossierData = { ranked_pins: [], summary: {} };
  dispApp._dossierAbortController = new AbortController();
  dispApp.currentDisplacedLimit = 30;
  await dispApp.loadMoreDisplaced();
  assert.equal(dispApp.currentDisplacedLimit, 30, 'Timeout AbortError must roll back currentDisplacedLimit');
  assert.equal(dispApp.dossierLoadingMore, false, 'loadMoreDisplaced must reset dossierLoadingMore on timeout');
  assert.ok(dispApp.toasts.some((t) => t.type === 'error'));
  dispApp.currentDisplacedLimit = 500;
  await dispApp.loadMoreDisplaced();
  assert.equal(dispApp.currentDisplacedLimit, 500, 'loadMoreDisplaced must not exceed 500 cap');

  let adBatchCalls = 0;
  const adBatchApp = instantiateDomainsApp('', '', {
    window: {
      safeApiFetch: async (url) => {
        if (String(url) === '/api/domains/enrich-ads') {
          adBatchCalls++;
          return { ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      },
      location: { pathname: '/domains', search: '' },
      history: { pushState: () => {} }
    }
  });
  adBatchApp.domains = [
    { domain: 'Uploaded by user', ad_network: 'unchecked' },
    ...Array.from({ length: 10 }, (_, i) => ({ domain: `ads${i}.com`, ad_network: 'unchecked' }))
  ];
  await adBatchApp.batchEnrichAdsVisible();
  assert.equal(adBatchCalls, 1, 'batchEnrichAdsVisible must halt immediately after first 401 chunk');
  assert.ok(adBatchApp.toasts.some((t) => t.type === 'error' && t.message.includes('401')));

  const lbHtml = getDomainsLeaderboardViewHtml();
  const stHtml = getDomainsStudioViewHtml();
  assert.ok(lbHtml.includes('value="domain_asc"') && lbHtml.includes('value="domain_desc"'));
  assert.ok(stHtml.includes('currentDisplacedLimit < 500') && stHtml.includes('encodeURIComponent(dossierDomain)'));
});

test('Static audit: Room 4 files contain zero banned legacy tables', () => {
  const files = [
    'src/routes/domains.mjs',
    'src/modules/domains/rollup-leaderboard-service.mjs',
    'src/modules/domains/dossier-blueprint-service.mjs',
    'src/modules/domains/ad-network-service.mjs',
    'src/modules/domains/whois-age-service.mjs'
  ];
  const banned = /\b(keyword_serp_current|keyword_displaced_index|pa_pins|pa_pin_metrics|pa_qualification_rules|keyword_pins_snapshots|competitor_pins|competitor_related_nodes|pin_serp_positions)\b/;
  for (const f of files) {
    const src = fs.readFileSync(path.resolve(f), 'utf8');
    assert.equal(banned.test(src), false, `${f} must not reference retired legacy tables`);
  }
});

test('Phase C.1: getDomainDeepDossier exposes full DB velocity/gains/age/engagement, strips bloat & merges fastPath rollup', async () => {
  const now = Date.now();
  const daysAgoIso = (d) => new Date(now - d * 86400000).toISOString();
  const captured = [];

  const serpRows = [
    {
      pin_id: 'p_fast',
      keyword_id: 10,
      keyword_name: 'high protein dinner',
      rank_position: 12,
      prev_rank_position: 18,
      last_known_rank: 12,
      is_displaced: false,
      first_seen_at: daysAgoIso(10),
      title: 'Garlic Chicken Bowl',
      destination_url: 'https://test-domain.com/garlic-chicken/',
      image_url: 'https://i.pinimg.com/236x/1.jpg',
      creator_username: 'ChefOne',
      saves: 1500,
      repins: 600,
      comments: 4,
      shares: 90,
      reactions: 15,
      url_global_saves: 8200,
      velocity: 120,
      repin_velocity: 40,
      delta_saves_24h: 120,
      delta_repins_24h: 40,
      gains_5d: 500,
      gains_7d: 720,
      gains_10d: 900,
      gains_15d: 1100,
      dominant_color: '#aa1122',
      visual_annotations: JSON.stringify(['Chicken', 'High Protein']),
      created_at_pinterest: daysAgoIso(14),
      aspect_ratio: '2:3'
    },
    {
      pin_id: 'p_vault',
      keyword_id: 20,
      keyword_name: 'meal prep chicken',
      rank_position: null,
      prev_rank_position: null,
      last_known_rank: 37,
      is_displaced: true,
      first_seen_at: daysAgoIso(45),
      title: 'Garlic Chicken Classic',
      destination_url: 'https://test-domain.com/garlic-chicken/',
      image_url: 'https://i.pinimg.com/236x/2.jpg',
      creator_username: 'ChefTwo',
      saves: 4500,
      repins: 2000,
      comments: 2,
      shares: 300,
      reactions: 40,
      url_global_saves: null,
      velocity: 35,
      repin_velocity: 10,
      delta_saves_24h: 35,
      delta_repins_24h: 10,
      gains_5d: 150,
      gains_7d: 210,
      gains_10d: 300,
      gains_15d: 400,
      dominant_color: '#334455',
      visual_annotations: JSON.stringify(['Meal Prep']),
      created_at_pinterest: daysAgoIso(120),
      aspect_ratio: '9:16'
    }
  ];

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    captured.push({ q, values });
    if (q.includes('FROM domain_intelligence_rollup')) {
      return [{
        domain: 'test-domain.com',
        registered_at: '2020-01-01T00:00:00.000Z',
        expires_at: '2028-01-01T00:00:00.000Z',
        lookup_status: 'resolved',
        age_status: 'resolved',
        age_days: 2000,
        age_years: 5.48,
        current_ad_network: 'mediavine',
        ad_network: 'mediavine',
        ads_txt_status: 'resolved',
        raw_header_snippet: 'Mediavine Publisher Network',
        ads_checked_at: new Date(now - 3600000).toISOString(),
        whois_checked_at: new Date(now - 3600000).toISOString(),
        network_history: [],
        ad_network_history: []
      }];
    }
    if (q.includes('FROM keyword_serp_positions ksp') && q.includes('ksp.rank_position')) {
      return serpRows;
    }
    if (q.includes('FROM keyword_serp_positions ksp') && q.includes('cross_domain')) {
      return [{ username: 'chefone', cross_domain: 'sister-blog.com', pins_count: 3 }];
    }
    return [];
  };

  const dossier = await getDomainDeepDossier(mockSql, 'test-domain.com', { folderId: 5, fastPath: true });

  // Single merged PK lookup on domain_intelligence_rollup in fastPath
  const rollupCalls = captured.filter((c) => c.q.includes('FROM domain_intelligence_rollup'));
  assert.equal(rollupCalls.length, 1, 'fastPath must query domain_intelligence_rollup in a single merged PK query');
  assert.equal(dossier.age_info.age_days, 2000);
  assert.equal(dossier.ad_info.current_ad_network, 'mediavine');

  // SARGable idx_ump_creator_clean functional expression in crossFootprintRows
  const crossCall = captured.find((c) => c.q.includes('cross_domain'));
  assert.ok(crossCall && crossCall.q.includes("lower(TRIM(BOTH FROM replace((COALESCE(ump.creator_username"), 'crossFootprintRows must match idx_ump_creator_clean');

  // Zero-bloat guarantees: no raw metadata on pins, no raw_usernames Set on accounts
  assert.equal(dossier.ranked_pins[0].metadata, undefined, 'raw metadata JSONB must be omitted from ranked_pins');
  assert.equal(dossier.accounts[0].raw_usernames, undefined, 'raw_usernames Set must be omitted from accounts');

  // Pin-level enriched metrics
  const pFast = dossier.ranked_pins.find((p) => p.pin_id === 'p_fast');
  assert.equal(pFast.delta_saves_24h, 120);
  assert.equal(pFast.gains_7d, 720);
  assert.equal(pFast.gains_15d, 1100);
  assert.equal(pFast.shares, 90);
  assert.equal(pFast.comments, 4);
  assert.equal(pFast.reactions, 15);
  assert.equal(pFast.url_global_saves, 8200);
  assert.equal(pFast.pin_age_days, 14);
  assert.equal(pFast.serp_appearances[0].rank_delta, 6);

  // Article-level velocity, age range & DB url_global_saves
  const art = dossier.money_urls[0];
  assert.equal(art.daily_velocity, 155);
  assert.equal(art.gains_7d, 930);
  assert.equal(art.url_global_saves, 8200);
  assert.equal(art.min_pin_age_days, 14);
  assert.equal(art.max_pin_age_days, 120);

  // Keyword-level vault_ranks & pin age bounds
  const kwVault = dossier.keyword_monopoly.find((k) => k.keyword_id === 20);
  assert.deepEqual(kwVault.vault_ranks, [37]);
  assert.equal(kwVault.best_vault_rank, 37);
  assert.ok(kwVault.newest_pin_date && kwVault.oldest_pin_date);
  assert.equal(kwVault.daily_velocity, 35);

  // Summary parity
  assert.equal(dossier.summary.total_daily_velocity, 155);
  assert.equal(dossier.summary.total_gains_7d, 930);
  assert.equal(dossier.summary.total_shares, 390);
  assert.equal(dossier.summary.min_pin_age_days, 14);
  assert.equal(dossier.summary.max_pin_age_days, 120);
});

test('Phase C.2: POST /api/urls/batch-global-saves pre-reads DB cache via md5(destination_url) and strips UTM params', async () => {
  const sqlCalls = [];
  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    sqlCalls.push({ q, values });
    if (q.includes('MAX(ump.url_global_saves)')) {
      return [{ destination_url: 'https://test-domain.com/pasta-bake', url_global_saves: 5432 }];
    }
    return [];
  };

  const req = new Request('https://app.hymum.com/api/urls/batch-global-saves', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://app.hymum.com',
      'Sec-Fetch-Site': 'same-origin'
    },
    body: JSON.stringify({
      urls: ['https://test-domain.com/pasta-bake?utm_source=pinterest&amp;utm_medium=social']
    })
  });

  const res = await handleUrlGlobalSavesRoutes({
    pathname: '/api/urls/batch-global-saves',
    method: 'POST',
    request: req,
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    jsonResponse,
    methodNotAllowedResponse,
    safeWaitUntil: () => {}
  });

  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.results['https://test-domain.com/pasta-bake'], 5432);
  assert.ok(sqlCalls.some((c) => c.q.includes('md5(ump.destination_url) = ANY(')), 'must pre-read DB using indexed md5 lookup');
});

test('Phase C.3: Redesigned 3-tab Hub VM controls, velocity/gains/age sorting, zero-fallback counts & Studio HTML audit', () => {
  const now = Date.now();
  const isoDaysAgo = (d) => new Date(now - d * 86400000).toISOString();
  const app = instantiateDomainsApp();

  assert.equal(app.dossierTab, 'hub');
  assert.equal(app.dossierHubMode, 'articles');

  app.dossierData = {
    summary: { total_pins: 2, unique_urls: 2, ranked_keywords_count: 2 },
    ranked_pins: [
      {
        pin_id: 'p1',
        title: 'Fresh High Velocity',
        clean_slug: '/a-fresh',
        image_url: 'https://i.pinimg.com/236x/1.jpg',
        saves: 400,
        velocity: 180,
        gains_7d: 900,
        created_at_pinterest: isoDaysAgo(10),
        pin_age_days: 10,
        best_rank: 5,
        is_displaced: false,
        serp_appearances: Array.from({ length: 8 }, (_, i) => ({
          keyword_id: i + 1,
          keyword_name: `kw-${i + 1}`,
          rank_position: i + 1,
          is_displaced: false
        }))
      },
      {
        pin_id: 'p2',
        title: 'Old High Saves',
        clean_slug: '/b-old',
        image_url: 'https://i.pinimg.com/236x/2.jpg',
        saves: 9000,
        velocity: 5,
        gains_7d: 30,
        created_at_pinterest: isoDaysAgo(200),
        pin_age_days: 200,
        best_rank: 15,
        is_displaced: false,
        serp_appearances: [{ keyword_id: 1, keyword_name: 'kw-1', rank_position: 15, is_displaced: false }]
      }
    ],
    money_urls: [
      {
        clean_slug: '/a-fresh',
        daily_velocity: 180,
        gains_7d: 900,
        total_saves: 400,
        keywords: ['kw-1', 'kw-2'],
        newest_pin_date: isoDaysAgo(10),
        oldest_pin_date: isoDaysAgo(10),
        pins: [{ pin_id: 'p1', image_url: 'https://i.pinimg.com/236x/1.jpg', velocity: 180, gains_7d: 900, created_at_pinterest: isoDaysAgo(10), serp_appearances: [{ keyword_name: 'kw-1' }] }]
      },
      {
        clean_slug: '/b-old',
        daily_velocity: 5,
        gains_7d: 30,
        total_saves: 9000,
        keywords: ['kw-1'],
        newest_pin_date: isoDaysAgo(200),
        oldest_pin_date: isoDaysAgo(200),
        pins: [{ pin_id: 'p2', image_url: 'https://i.pinimg.com/236x/2.jpg', velocity: 5, gains_7d: 30, created_at_pinterest: isoDaysAgo(200), serp_appearances: [{ keyword_name: 'kw-1' }] }]
      }
    ],
    keyword_monopoly: [
      { keyword_id: 1, keyword_name: 'kw-1', active_slots: 2, displaced_slots: 0, total_saves: 9400, daily_velocity: 185, gains_7d: 930, newest_pin_date: isoDaysAgo(10), oldest_pin_date: isoDaysAgo(200) },
      { keyword_id: 2, keyword_name: 'kw-2', active_slots: 1, displaced_slots: 0, total_saves: 400, daily_velocity: 180, gains_7d: 900, newest_pin_date: isoDaysAgo(5), oldest_pin_date: isoDaysAgo(5) }
    ]
  };

  // Velocity & 7d gains sorting
  app.dossierSort = 'velocity';
  assert.equal(app.filteredDossierPins()[0].pin_id, 'p1');
  assert.equal(app.filteredDossierArticles()[0].clean_slug, '/a-fresh');
  assert.equal(app.filteredDossierKeywords()[0].keyword_id, 1);

  // Fixed keyword age sorting
  app.dossierSort = 'age_asc';
  assert.equal(app.filteredDossierKeywords()[0].keyword_id, 2, 'newest keyword pin must sort first under age_asc');
  app.dossierSort = 'age_desc';
  assert.equal(app.filteredDossierKeywords()[0].keyword_id, 1, 'oldest keyword pin must sort first under age_desc');

  // Top Keywords Strip filter & zero-match check
  app.toggleKeywordFilter('kw-2');
  assert.equal(app.dossierSelectedKeyword, 'kw-2');
  assert.equal(app.filteredDossierPins().length, 1);
  assert.equal(app.filteredDossierArticles().length, 1);

  app.dossierSearch = 'nonexistent-xyz-term';
  assert.equal(app.filteredDossierPins().length, 0);
  assert.equal(app.filteredDossierArticles().length, 0);
  app.clearDossierFilters();
  assert.equal(app.filteredDossierPins().length, 2);

  // Expanders
  app.toggleAllArticlesExpand();
  assert.equal(app.areAllArticlesExpanded(), true);
  app.toggleAllKeywordsExpand();
  assert.equal(app.areAllKeywordsExpanded(), true);
  app.togglePinKeywordsExpand('p1');
  assert.equal(app.dossierExpandedPinKws.p1, true);

  // Studio HTML assertions
  const studioHtml = getDomainsStudioViewHtml();
  assert.ok(studioHtml.includes('SERP &amp; Content Hub'));
  assert.ok(studioHtml.includes('Top Keywords Strip'));
  assert.ok(studioHtml.includes('Show all ('));
  assert.ok(studioHtml.includes('Expand All'));
  assert.ok(studioHtml.includes('Daily Velocity'));
  assert.ok(studioHtml.includes('Pin Age'));
  assert.ok(studioHtml.includes('togglePinKeywordsExpand(p.pin_id)'));
  assert.ok(studioHtml.includes('getUnifiedMonetizationChip(dossierData?.ad_info)'));
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(studioHtml), false, 'Studio view must remain emoji-free');
});

test('Phase C.4: Review P1/P2 fixes — trailing-slash cache/write-back, fastPath checked_at, loadMoreDisplaced preservation, catalog reset, rank sort & lazy templates', async () => {
  // 1a. DB pre-read cache hit across trailing-slash mismatch (/pasta request vs /pasta/ DB row)
  const originalFetch = globalThis.fetch;
  let liveFetchCalled = false;
  globalThis.fetch = async () => {
    liveFetchCalled = true;
    return { ok: true, status: 200, text: async () => 'receiveCount({"count":777})' };
  };
  try {
    const slashHitRes = await handleUrlGlobalSavesRoutes({
      pathname: '/api/urls/batch-global-saves',
      method: 'POST',
      request: new Request('https://app.hymum.com/api/urls/batch-global-saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://app.hymum.com', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ urls: ['https://test-domain.com/pasta'] })
      }),
      searchParams: new URLSearchParams(),
      env: {},
      ctx: {},
      sql: async (strings) => {
        if (strings.join(' ').includes('MAX(ump.url_global_saves)')) {
          return [{ destination_url: 'https://test-domain.com/pasta/', url_global_saves: 6123 }];
        }
        return [];
      },
      jsonResponse,
      methodNotAllowedResponse,
      safeWaitUntil: () => {}
    });
    assert.equal(slashHitRes.status, 200);
    assert.equal(slashHitRes.payload.results['https://test-domain.com/pasta'], 6123);
    assert.equal(liveFetchCalled, false, 'Trailing-slash DB cache match must not trigger live Pinterest fetch');

    // 1b. Write-back SQL includes url_slash query-string branch and monotonic < guard
    const writeBackQueries = [];
    const bgTasks = [];
    const writeBackRes = await handleUrlGlobalSavesRoutes({
      pathname: '/api/urls/batch-global-saves',
      method: 'POST',
      request: new Request('https://app.hymum.com/api/urls/batch-global-saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://app.hymum.com', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ urls: ['https://test-domain.com/uncached-post/'] })
      }),
      searchParams: new URLSearchParams(),
      env: {},
      ctx: {},
      sql: async (strings, ...values) => {
        const q = strings.join(' ');
        if (q.includes('UPDATE universal_master_pins')) {
          writeBackQueries.push({ q, values });
        }
        return [];
      },
      jsonResponse,
      methodNotAllowedResponse,
      safeWaitUntil: (_ctx, fn) => bgTasks.push(typeof fn === 'function' ? fn() : fn)
    });
    assert.equal(writeBackRes.status, 200);
    await Promise.all(bgTasks);
    assert.equal(writeBackQueries.length, 1);
    assert.ok(writeBackQueries[0].q.includes("LEFT(iu.url_slash, 1020) || '?'"), 'Write-back must include /?utm= query-string branch');
    assert.ok(writeBackQueries[0].q.includes('COALESCE(ump.url_global_saves, 0) < dm.max_count'), 'Write-back must skip no-op updates');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 2. fetchDomainRollupFastPath uses checked_at fallback when ads_checked_at is absent
  const recentCheckedIso = new Date(Date.now() - 3600000).toISOString();
  const fastPathDossier = await getDomainDeepDossier(
    async (strings) => {
      if (strings.join(' ').includes('FROM domain_intelligence_rollup')) {
        return [{
          domain: 'checked-at-fallback.com',
          lookup_status: 'resolved',
          age_status: 'resolved',
          age_days: 500,
          age_years: 1.37,
          current_ad_network: 'raptive',
          ad_network: 'raptive',
          ads_txt_status: 'resolved',
          checked_at: recentCheckedIso,
          ads_checked_at: null,
          network_history: [],
          ad_network_history: []
        }];
      }
      return [];
    },
    'checked-at-fallback.com',
    { fastPath: true }
  );
  assert.equal(fastPathDossier.ad_info.current_ad_network, 'raptive');
  assert.equal(fastPathDossier.ad_info.checked_at, recentCheckedIso);
  assert.equal(fastPathDossier.needs_ad_enrichment, false);

  // 3. loadMoreDisplaced preserves hydrated url_global_saves on money_urls
  const moreApp = instantiateDomainsApp('', '', {
    window: {
      safeApiFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ranked_pins: [{ pin_id: 'p1' }, { pin_id: 'p2' }],
          summary: { total_pins: 2 },
          money_urls: [
            { clean_slug: '/pasta', url_global_saves: null, pins: [] },
            { clean_slug: '/soup', url_global_saves: 900, pins: [] }
          ],
          keyword_monopoly: []
        })
      }),
      location: { pathname: '/domains', search: '' },
      history: { pushState: () => {} }
    }
  });
  moreApp.dossierDomain = 'test-domain.com';
  moreApp.dossierData = {
    ranked_pins: [{ pin_id: 'p1' }],
    summary: { total_pins: 1 },
    money_urls: [
      { clean_slug: '/pasta', url_global_saves: 5200, pins: [] },
      { clean_slug: '/soup', url_global_saves: 500, pins: [] }
    ]
  };
  await moreApp.loadMoreDisplaced();
  assert.equal(moreApp.dossierData.money_urls[0].url_global_saves, 5200);
  assert.equal(moreApp.dossierData.money_urls[1].url_global_saves, 900);

  // 4. navigateDossierView resets catalog filter & filterToArticle ignores '/'
  moreApp.dossierStatusFilter = 'catalog';
  moreApp.navigateDossierView('hub', 'articles');
  assert.equal(moreApp.dossierStatusFilter, 'all');
  moreApp.dossierSearch = 'chicken';
  moreApp.filterToArticle('/');
  assert.equal(moreApp.dossierSearch, 'chicken');

  // 5. filteredDossierKeywords rank sort puts Active #5 ahead of Displaced V#2
  moreApp.dossierSearch = '';
  moreApp.dossierSelectedKeyword = '';
  moreApp.dossierData.keyword_monopoly = [
    { keyword_id: 10, keyword_name: 'vault kw', best_rank: null, best_vault_rank: 2 },
    { keyword_id: 20, keyword_name: 'active kw', best_rank: 5, best_vault_rank: 5 }
  ];
  moreApp.dossierSort = 'rank';
  assert.deepEqual(moreApp.filteredDossierKeywords().map((k) => k.keyword_id), [20, 10]);

  // 6. Lazy <template x-if> sub-tables, signed delta_repins_24h, modal Vault guard & < 210 KB budget
  const studioHtml = getDomainsStudioViewHtml();
  const modalsHtml = getDomainsModalsHtml();
  const fullHtmlBytes = Buffer.byteLength(getDomainsPageHtml(), 'utf8');
  assert.ok(studioHtml.includes('<template x-if="dossierExpandedArticles[art.clean_slug]">'));
  assert.ok(studioHtml.includes('<template x-if="dossierExpandedKeywords[kw.keyword_id]">'));
  assert.ok(studioHtml.includes('formatSignedDelta(p.delta_repins_24h)'));
  assert.ok(modalsHtml.includes("art.best_rank != null ? '#' + art.best_rank : 'Vault'"));
  assert.ok(fullHtmlBytes < 210 * 1024, `/domains HTML must remain < 210 KB (got ${fullHtmlBytes} bytes)`);
});
