import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { createFastifyApp } from '../src/server.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';
import {
  parseHtmlElementTree,
  validateInlineScriptsForPage,
  countTagBalance,
  verifyAlpineTemplateXIfSingleRoot
} from '../scripts/check-syntax-and-templates.mjs';
import {
  OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES,
  parseSmartHuntInput
} from '../src/modules/newborn/service.mjs';
import {
  buildZoneARelatedModulesHeaders,
  fetchRelatedModulesWithZoneA
} from '../src/modules/newborn/cookie-router.mjs';
import { PinterestCircuitBreaker } from '../src/core/pinterest/client.mjs';
import {
  parseNewbornFleetArgs,
  executeNewbornFleetCli
} from '../scripts/newborn-fleet.mjs';
import {
  buildClusterSeedRelatedHeaders,
  fetchWithRetry as fetchClusterWithRetry
} from '../scripts/cluster-intelligence.mjs';
import {
  buildAccountRelatedHeaders,
  crawlSeedPin
} from '../scripts/account-related-crawler.mjs';
import { harvestSinglePinRelatedLive } from '../src/modules/creators/creator-harvest-and-archive.mjs';

function collectNodes(node, predicate, results = []) {
  if (predicate(node)) results.push(node);
  for (const child of node.children || []) {
    collectNodes(child, predicate, results);
  }
  return results;
}

function buildSqlText(strings) {
  return Array.isArray(strings) ? strings.join(' ') : String(strings || '');
}

test('Wave 6B.1: Newborn SSR Studio DOM tree, Light-Mode default invariant, official Business labels, and Folder Workspace parity', () => {
  const globalHtml = getNewbornPageHtml();
  const folderHtml = getNewbornPageHtml('42');
  const settingsHtml = getNewbornPageHtml('', 'settings');

  for (const [label, html] of [
    ['newborn-global', globalHtml],
    ['newborn-folder', folderHtml],
    ['newborn-settings', settingsHtml]
  ]) {
    const compiledScripts = validateInlineScriptsForPage(label, html);
    assert.ok(compiledScripts >= 2, `${label} should compile inline Tailwind + Studio scripts`);

    const balance = countTagBalance(html, label);
    assert.equal(balance.openMain, 1, `${label} must render exactly 1 <main>`);
    assert.equal(balance.closeMain, 1, `${label} must close exactly 1 </main>`);
    assert.equal(balance.openDiv, balance.closeDiv, `${label} must have balanced <div> tags`);

    const root = parseHtmlElementTree(html);
    const xIfCount = verifyAlpineTemplateXIfSingleRoot(root, label);
    assert.ok(xIfCount >= 15, `${label} should validate all <template x-if> single-root containers`);

    // Light-Mode default invariant: never hardcode .dark on <html> or <body> and never bind :class="'dark'" on <body>
    const htmlNode = collectNodes(root, (n) => n.tag === 'html')[0];
    const bodyNode = collectNodes(root, (n) => n.tag === 'body')[0];
    assert.ok(htmlNode && bodyNode);
    assert.equal(Boolean(htmlNode.attrs.class && /\bdark\b/.test(htmlNode.attrs.class)), false);
    assert.equal(Boolean(bodyNode.attrs.class && /(?:^|\s)dark(?:\s|$)/.test(bodyNode.attrs.class)), false);
    assert.equal(bodyNode.attrs[':class'], undefined, 'body must not bind .dark via :class');

    // Shared /pae-shell.js runtime script must be loaded
    assert.equal(/<script\b[^>]*\bsrc=["']\/pae-shell\.js(?:\?[^"']*)?["']/i.test(html), true);
  }

  // Global mode navigation & official Pinterest Business terminology (V4 Wave 3: canonical /discover nav)
  const globalTree = parseHtmlElementTree(globalHtml);
  const discoverNavLinks = collectNodes(globalTree, (n) => n.tag === 'a' && (n.attrs.href === '/discover' || n.attrs.href === '/newborn'));
  assert.ok(discoverNavLinks.length >= 2, 'App sidebar (mobile + desktop) must link to /discover');

  assert.ok(globalHtml.includes('Discover') || globalHtml.includes('Newborn Pin Hunter'), 'Header must display Discover / Newborn title');
  assert.ok(globalHtml.includes('Max Pin Age (Days)'), 'Hero Hunt Card must expose Max Pin Age filter');
  assert.ok(globalHtml.includes('Min Re-pins'), 'Hero Hunt Card must expose Min Re-pins primary filter');
  assert.ok(globalHtml.includes('Min Saves (Optional)'), 'Hero Hunt Card must expose optional Min Saves filter');
  assert.ok(globalHtml.includes('Idea Page'), 'Hero Hunt Card must expose official Idea Page path & intelligence');
  assert.ok(globalHtml.includes('Home Feed'), 'Hero Hunt Card must expose Home Feed extraction path');
  assert.ok(globalHtml.includes('Rising Trends'), 'Hero Hunt Card must expose collapsible Rising Trends picker');
  assert.ok(globalHtml.includes('This Hunt'), '3-Tab workspace must render This Hunt tab');
  assert.ok(globalHtml.includes('Cluster Explorer'), '3-Tab workspace must render Cluster Explorer tab');
  assert.ok(globalHtml.includes('Past Hunts'), '3-Tab workspace must render Past Hunts tab');
  assert.ok(globalHtml.includes('Annotations Crossover'), 'This Hunt must show Annotations Crossover panel');
  assert.ok(globalHtml.includes('No Link / Linkless'), 'Results UI must show clear No Link / Linkless badge');
  assert.ok(globalHtml.includes('Scroll Related'), 'Results UI must expose Scroll Related action');
  assert.ok(globalHtml.includes('Track Daily'), 'Results UI must expose opt-in Track Daily action');
  assert.ok(globalHtml.includes('Pull Account'), 'Results UI must expose manual Pull Account action');
  assert.ok(globalHtml.includes('Total audience'), 'Opt-in account reach must use official "Total audience" label');
  assert.ok(globalHtml.includes('Impressions'), 'Opt-in account reach must use official "Impressions" label');
  assert.ok(globalHtml.includes('Export CSV'), 'Results toolbar must offer Export CSV');

  // Strictly ZERO Comments, Reactions, or Shares UI clutter anywhere on /newborn
  const mainMatch = globalHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(mainMatch, 'Expected <main> block in global Newborn HTML');
  assert.equal(/\p{Extended_Pictographic}/u.test(mainMatch[1]), false, 'Global Newborn <main> must contain zero UI emojis');
  assert.equal(/>\s*(Comments|Reactions|Shares)\s*</i.test(globalHtml), false, 'Wave 6D /newborn UI must not render Comments, Reactions, or Shares');

  // Folder-scoped mode keeps /folders/42/newborn HTTP 200 route while removing redundant 5th header tab
  const folderTree = parseHtmlElementTree(folderHtml);
  const folderNewbornLinks = collectNodes(
    folderTree,
    (n) => n.tag === 'a' && n.attrs.href === '/folders/42/newborn'
  );
  assert.equal(folderNewbornLinks.length, 0, 'Redundant 5th header tab must be removed from Campaign Workspace Header');
  assert.ok(folderHtml.includes("newbornStudioApp('42', 'hunt')"));
  assert.ok(settingsHtml.includes("newbornStudioApp('', 'settings')"));
  assert.ok(folderHtml.includes('href="/folders/42/settings"'), 'Folder header Settings tab must route cleanly to Room 5');
});

test('Wave 6B.2: /newborn & /folders/:id/newborn HTTP routes, offline Launchpad API, smart seed parser & board context hydration', async (t) => {
  // 1. Smart Hunt Input Parser behavioral checks
  assert.deepEqual(parseSmartHuntInput('https://www.pinterest.com/pin/1098245059167667976/'), {
    kind: 'pin',
    pinId: '1098245059167667976'
  });
  assert.deepEqual(parseSmartHuntInput('1098245059167667976'), {
    kind: 'pin',
    pinId: '1098245059167667976'
  });
  assert.deepEqual(parseSmartHuntInput('https://www.pinterest.com/ideas/home-decor/935249274030/'), {
    kind: 'idea',
    query: 'home decor'
  });
  const parsedBoard = parseSmartHuntInput('https://www.pinterest.com/gardenqueen/patio-oasis/');
  assert.equal(parsedBoard.kind, 'board');
  assert.equal(parsedBoard.board.owner_username, 'gardenqueen');
  assert.equal(parsedBoard.board.board_slug, 'patio-oasis');
  assert.equal(parsedBoard.board.clean_path, '/gardenqueen/patio-oasis/');
  assert.equal(parsedBoard.query, 'patio oasis');
  assert.deepEqual(parseSmartHuntInput('cottagecore kitchen'), {
    kind: 'query',
    query: 'cottagecore kitchen'
  });

  // 2. Offline Fastify app (SQL_CLIENT: null) verifies SSR pages + GET /api/newborn/launchpad work with zero DB
  const offlineApp = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    API_SECRET_KEY: 'wave6b-secret-key'
  });

  t.after(async () => {
    await offlineApp.close();
  });

  for (const route of ['/newborn', '/newborn/settings', '/folders/42/newborn', '/keywords/newborn']) {
    const getRes = await offlineApp.inject({ method: 'GET', url: route });
    assert.equal(getRes.statusCode, 200, `GET ${route} should return 200`);
    assert.equal(getRes.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.match(String(getRes.headers.vary || ''), /\bCookie\b/);
    assert.match(String(getRes.headers.vary || ''), /\bAccept-Encoding\b/);
    assert.match(String(getRes.headers['content-type']), /^text\/html/i);

    const headRes = await offlineApp.inject({ method: 'HEAD', url: route });
    assert.equal(headRes.statusCode, 200, `HEAD ${route} should return 200`);
    assert.equal(headRes.body, '');

    const postRes = await offlineApp.inject({ method: 'POST', url: route });
    assert.equal(postRes.statusCode, 405, `POST ${route} should return 405`);
  }

  const launchpadOfflineRes = await offlineApp.inject({
    method: 'GET',
    url: '/api/newborn/launchpad?country=GB&trend_type=seasonal&l1_interest=home-decor',
    headers: { 'x-api-key': 'wave6b-secret-key' }
  });
  assert.equal(launchpadOfflineRes.statusCode, 200);
  const launchpadBody = launchpadOfflineRes.json();
  assert.equal(launchpadBody.success, true);
  assert.equal(launchpadBody.country, 'GB');
  assert.equal(launchpadBody.trend_type, 'seasonal');
  assert.equal(launchpadBody.l1_interest, 'home-decor');
  assert.equal(launchpadBody.l1_interests_catalog.length, 22);
  assert.equal(OFFICIAL_L1_INTERESTS.length, 22);
  assert.deepEqual(launchpadBody.supported_trend_types, SUPPORTED_TREND_TYPES);

  // 3. Mocked SQL Fastify app verifies board_pin_count & board_follower_count hydration on candidates + dossier
  const mockCandidateRow = {
    pin_id: '888777666555444333',
    stage: 'discovered',
    title: 'Small Patio Herb Planter',
    origin_creator_username: 'trueherbs',
    pinner_username: 'curatorjane',
    effective_creator_username: 'trueherbs',
    is_repin: true,
    is_linkless: true,
    is_golden_pin: true,
    golden_score: 88.4,
    age_days: 6.5,
    repin_count: 140,
    save_count: null,
    repin_per_day: 21.5,
    board_name: 'Urban Balcony Ideas',
    board_url: '/curatorjane/urban-balcony-ideas/',
    upload_provenance: 'SHARE_EXTENSION_IOS',
    metadata: {
      board_pin_count: 64,
      board_follower_count: 1890
    }
  };

  const mockSql = async (strings) => {
    const q = buildSqlText(strings);
    if (q.includes('COUNT(*)::int AS total') && q.includes('FROM newborn_candidates')) {
      return [{ total: 1 }];
    }
    if (q.includes('FROM newborn_candidates')) {
      return [mockCandidateRow];
    }
    return [];
  };
  mockSql.end = async () => {};

  const dbApp = createFastifyApp({
    NODE_ENV: 'test',
    API_SECRET_KEY: 'wave6b-secret-key',
    SQL_CLIENT: mockSql
  });
  t.after(async () => {
    await dbApp.close();
  });

  const candRes = await dbApp.inject({
    method: 'GET',
    url: '/api/newborn/candidates?golden_only=true',
    headers: { 'x-api-key': 'wave6b-secret-key' }
  });
  assert.equal(candRes.statusCode, 200);
  const candData = candRes.json();
  assert.equal(candData.total, 1);
  assert.equal(candData.candidates[0].board_pin_count, 64);
  assert.equal(candData.candidates[0].board_follower_count, 1890);
  assert.equal(candData.candidates[0].save_count, null, 'Unhydrated save_count must remain null');

  const dossierRes = await dbApp.inject({
    method: 'GET',
    url: '/api/newborn/candidates/888777666555444333',
    headers: { 'x-api-key': 'wave6b-secret-key' }
  });
  assert.equal(dossierRes.statusCode, 200);
  const dossierData = dossierRes.json();
  assert.equal(dossierData.candidate.board_pin_count, 64);
  assert.equal(dossierData.candidate.board_follower_count, 1890);
});

test('Wave 6B.3: newbornStudioApp 3-Second Studio VM execution — HTTP 202 + 1.5s run polling, exact backend JSON contracts, redacted cookie vault, profiles, promote & timer hygiene', async (t) => {
  const noopSql = async () => [];
  noopSql.end = async () => {};
  const shellApp = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });
  t.after(async () => {
    await shellApp.close();
  });

  const shellHttpRes = await shellApp.inject({ method: 'GET', url: '/pae-shell.js' });
  assert.equal(shellHttpRes.statusCode, 200);

  // Build clean browser VM sandbox (zero external network, zero fs reads)
  const storageMap = new Map([['pae_admin_api_key', 'vm-admin-secret']]);
  const rootClasses = new Set();
  const bodyClasses = new Set();
  const apiRequests = [];
  const runPollCounts = new Map();

  function makeMockElement(tag) {
    return {
      tagName: String(tag || 'DIV').toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      href: '',
      attrs: {},
      children: [],
      parentNode: null,
      setAttribute(k, v) { this.attrs[k] = String(v); },
      hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        child.parentNode = null;
      },
      addEventListener() {},
      click() {},
      focus() {}
    };
  }

  const mockBody = makeMockElement('BODY');
  mockBody.classList = {
    toggle: (cls, force) => {
      const add = force !== undefined ? Boolean(force) : !bodyClasses.has(cls);
      if (add) bodyClasses.add(cls);
      else bodyClasses.delete(cls);
    },
    contains: (cls) => bodyClasses.has(cls)
  };

  const mockDocument = {
    documentElement: {
      classList: {
        toggle: (cls, force) => {
          const add = force !== undefined ? Boolean(force) : !rootClasses.has(cls);
          if (add) rootClasses.add(cls);
          else rootClasses.delete(cls);
        },
        contains: (cls) => rootClasses.has(cls)
      }
    },
    body: mockBody,
    activeElement: null,
    getElementById(id) {
      return mockBody.children.find((c) => c.id === id) || null;
    },
    createElement: makeMockElement,
    addEventListener() {},
    removeEventListener() {}
  };

  const mockCandidatesPayload = [
    {
      pin_id: '901000200030004001',
      title: '=HYPERLINK("https://evil.example","Meal Prep Chicken Bowls")',
      stage: 'discovered',
      first_surface: 'pin_serp_capsules',
      is_golden_pin: true,
      is_linkless: true,
      is_repin: false,
      golden_score: 91.2,
      age_days: 5.0,
      repin_count: 145,
      repin_per_day: 29.0,
      save_count: 210,
      save_per_day: 42.0,
      created_at_pinterest: '2026-11-14T10:00:00Z',
      effective_creator_username: 'rookiechef',
      creator_monthly_reach: null,
      creator_profile_views: null,
      clean_domain: null,
      board_name: 'Weekly Meal Prep Ideas',
      board_url: 'https://www.pinterest.com/rookiechef/weekly-meal-prep-ideas/',
      visual_annotations: [
        { name: 'meal prep for the week', url: '/ideas/meal-prep-for-the-week/956840852136/' },
        { name: 'chicken meal prep' }
      ]
    }
  ];

  const sandbox = {
    Headers,
    Response,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {},
    document: mockDocument,
    location: { search: '?search=graduation+party+foods', href: '/folders/42/newborn?search=graduation+party+foods' },
    dispatchEvent() {},
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    fetch: async (url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      const bodyObj = init.body ? JSON.parse(String(init.body)) : null;
      apiRequests.push({ url: String(url), method, body: bodyObj, headers: init.headers });

      const jsonRes = (payload, status = 200) => new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' }
      });

      if (String(url) === '/api/folders') {
        return jsonRes({ folders: [{ id: 42, name: 'Outdoor Living', color: '#E11D48' }] });
      }
      if (String(url).startsWith('/api/newborn/idea-intelligence')) {
        return jsonRes({
          success: true,
          found: true,
          id: '956840852136',
          term: 'meal prep for the week',
          idea_url: 'https://www.pinterest.com/ideas/meal-prep-for-the-week/956840852136/',
          internal_search_count: 720549,
          weekly_change: 18,
          monthly_change: 42,
          yearly_change: 65,
          related_interests: [{ name: 'High protein meal prep', id: '911000111' }]
        });
      }
      if (String(url) === '/api/newborn/candidates/901000200030004001/fetch-account' && method === 'POST') {
        return jsonRes({
          success: true,
          fetched_count: 1,
          users_fetched: 1,
          results: [{
            pin_id: '901000200030004001',
            username: 'rookiechef',
            fetched: true,
            effective_creator_followers: 840,
            creator_monthly_reach: 520000,
            creator_profile_views: 690000,
            creator_pin_count: 34
          }]
        });
      }
      if (String(url) === '/api/newborn/settings' && method === 'GET') {
        return jsonRes({
          success: true,
          settings: {
            discovery: {
              country: 'US',
              default_l1_interest: 'all',
              max_board_age_days: 30,
              surfaces: { pin_serp_capsules: { enabled: true }, home_feed: { enabled: false } },
              hydration: { max_pin_hydrations_per_run: 500, auto_fetch_accounts: false }
            },
            qualification: {
              age_window_preset: '30d', min_age_days: 0, max_age_days: 30,
              min_repin_count: 20, min_save_count: 0, min_repin_per_day: 0, min_save_per_day: 0,
              max_creator_followers: 25000, enforce_max_followers_filter: false,
              provenance: { allowed_sources: ['SHARE_EXTENSION_IOS', 'UPLOADED'], excluded_sources: [], ai_disclosure_policy: 'exclude', exclude_products: true, exclude_videos: false },
              linkless_vacuum: { mode: 'boost', linkless_vacuum_only: false, score_boost: 12 }
            },
            automation: { auto_track_enabled: false, schedule: { cadence: 'every_6h', cooldown_minutes: 60 } }
          },
          schedule: { auto_track_enabled: false, cadence: 'every_6h', discovery_due: false, watchlist_poll_due: false },
          cookie_status: { has_cookie: false, source: 'none', preview: '', mode: 'guest_only' },
          surfaces_catalog: [{ id: 'pin_serp_capsules', label: 'Pin SERP + Guided Capsules', endpoint: 'BaseSearchResource/get' }],
          l1_interests_catalog: OFFICIAL_L1_INTERESTS,
          supported_countries: [{ code: 'US', label: 'United States (US)' }],
          profiles: [{ id: 1, slug: 'default-golden-breakout', name: 'Default Golden Breakout', is_default: true, qualification_config: { max_age_days: 30, min_repin_count: 20, min_save_count: 0 } }]
        });
      }
      if (String(url) === '/api/newborn/settings' && method === 'PATCH') {
        return jsonRes({
          success: true,
          settings: bodyObj,
          schedule: { auto_track_enabled: Boolean(bodyObj?.automation?.auto_track_enabled), cadence: 'every_6h', discovery_due: false, watchlist_poll_due: true }
        });
      }
      if (String(url) === '/api/newborn/settings/reset' && method === 'POST') {
        return jsonRes({
          success: true,
          settings: {
            discovery: { country: 'US', surfaces: { pin_serp_capsules: { enabled: true } } },
            qualification: { age_window_preset: '30d', min_age_days: 0, max_age_days: 30, min_save_count: 15, min_save_per_day: 2.0, provenance: { exclude_products: true, exclude_videos: false, ai_disclosure_policy: 'exclude' }, linkless_vacuum: { mode: 'boost' } },
            automation: { auto_track_enabled: false, schedule: { cadence: 'every_6h', cooldown_minutes: 60 } }
          },
          schedule: { auto_track_enabled: false, cadence: 'every_6h', discovery_due: false, watchlist_poll_due: false }
        });
      }
      if (String(url) === '/api/newborn/overview') {
        return jsonRes({
          success: true,
          counts: { total_candidates: 1, golden_pins_count: 1, linkless_vacuum_count: 1, watchlist_count: 0, active_daily_anchors_count: 0 },
          cookie_status: { has_cookie: false, source: 'none', preview: '', mode: 'guest_only' },
          automation_schedule: { auto_track_enabled: false, cadence: 'every_6h', discovery_due: false, watchlist_poll_due: false },
          recent_runs: [{ id: 7, run_type: 'discovery', status: 'completed', progress_stage: 'completed', progress_pct: 100, seed_queries: ['graduation party foods'], candidates_discovered: 12, candidates_qualified: 3, golden_pins_count: 1 }]
        });
      }
      if (String(url).startsWith('/api/newborn/runs?')) {
        return jsonRes({
          success: true,
          runs: [{ id: 7, run_type: 'discovery', status: 'completed', progress_stage: 'completed', progress_pct: 100, seed_queries: ['graduation party foods'], candidates_discovered: 12, candidates_qualified: 3, golden_pins_count: 1 }]
        });
      }
      if (String(url).startsWith('/api/newborn/runs/')) {
        const rid = Number(String(url).split('?')[0].split('/').pop());
        const count = (runPollCounts.get(rid) || 0) + 1;
        runPollCounts.set(rid, count);
        return jsonRes({
          success: true,
          run: {
            id: rid,
            run_type: rid === 19 ? 'snowball' : (rid === 20 ? 'watchlist_poll' : 'discovery'),
            status: 'completed',
            progress_stage: 'completed',
            progress_detail: 'Found 1 verified newborn pin.',
            progress_pct: 100,
            candidates_discovered: 12,
            candidates_qualified: 1,
            golden_pins_count: 1
          }
        });
      }
      if (String(url).startsWith('/api/newborn/candidates?')) {
        return jsonRes({ success: true, total: 1, candidates: mockCandidatesPayload });
      }
      if (String(url).startsWith('/api/newborn/crossover')) {
        return jsonRes({
          success: true,
          analyzed_pins: 1,
          clusters: [{ annotation: 'meal prep for the week', pin_count: 1, overlap_pct: 100, avg_repins: 145, top_board_names: [{ name: 'Weekly Meal Prep Ideas' }] }]
        });
      }
      if (String(url).startsWith('/api/newborn/rookies')) {
        return jsonRes({ success: true, total: 1, rookies: [{ username: 'rookiewoodworker', follower_count: 640, monthly_reach: 10000001, profile_views: 500000, rookie_score: 88, stage: 'discovered' }] });
      }
      if (String(url) === '/api/newborn/rules' && method === 'POST') {
        return jsonRes({
          success: true,
          profile: { id: 9, slug: 'patio-14d', name: bodyObj.name, is_default: false, qualification_config: bodyObj.qualification_config }
        }, 201);
      }
      if (String(url) === '/api/newborn/rules/9' && method === 'DELETE') {
        return jsonRes({ success: true, deleted: true });
      }
      if (String(url) === '/api/newborn/cookie' && method === 'POST') {
        return jsonRes({
          success: true,
          has_cookie: true,
          source: 'newborn_pinterest_cookie',
          preview: '[CONFIGURED]',
          mode: 'two_zone_authenticated_plus_zero_cookie'
        });
      }
      if (String(url) === '/api/newborn/cookie' && method === 'DELETE') {
        return jsonRes({
          success: true,
          has_cookie: false,
          source: 'none',
          preview: '',
          mode: 'guest_only'
        });
      }
      if (String(url) === '/api/newborn/discover' && method === 'POST') {
        return jsonRes({
          success: true,
          queued: true,
          deduplicated: false,
          run_id: 18,
          run: { id: 18, run_type: 'discovery', status: 'running', progress_stage: 'queued', progress_pct: 0, seed_queries: [bodyObj.query] }
        }, 202);
      }
      if (String(url) === '/api/newborn/snowball' && method === 'POST') {
        return jsonRes({
          success: true,
          queued: true,
          deduplicated: false,
          run_id: 19,
          run: { id: 19, run_type: 'snowball', status: 'running', progress_stage: 'queued', progress_pct: 0 }
        }, 202);
      }
      if (String(url) === '/api/newborn/watchlist/poll' && method === 'POST') {
        return jsonRes({
          success: true,
          queued: true,
          deduplicated: false,
          run_id: 20,
          run: { id: 20, run_type: 'watchlist_poll', status: 'running', progress_stage: 'queued', progress_pct: 0 }
        }, 202);
      }
      if (String(url) === '/api/newborn/auto-run' && method === 'POST') {
        return jsonRes({
          success: true,
          queued: true,
          deduplicated: false,
          run_id: 21,
          run: { id: 21, run_type: 'auto_cycle', status: 'running', progress_stage: 'queued', progress_pct: 0 }
        }, 202);
      }
      if (String(url) === '/api/newborn/promote' && method === 'POST') {
        return jsonRes({
          success: true,
          pins: bodyObj.pin_ids?.length ? { ok: true, promoted_count: bodyObj.pin_ids.length, anchors_created: bodyObj.pin_ids.length } : null,
          rookies: bodyObj.usernames?.length ? { ok: true, promoted_count: bodyObj.usernames.length } : null
        });
      }
      return jsonRes({ success: true });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Execute /pae-shell.js and newborn-client-app.mjs inside VM
  new vm.Script(shellHttpRes.body, { filename: 'pae-shell.js' }).runInNewContext(sandbox);
  sandbox.PAE.confirm = async () => true;

  const clientScriptRaw = getNewbornClientAppScript()
    .replace(/^[\s]*<script[^>]*>/i, '')
    .replace(/<\/script>[\s]*$/i, '');
  new vm.Script(clientScriptRaw, { filename: 'newborn-client-app.js' }).runInNewContext(sandbox);

  const studio = sandbox.newbornStudioApp('42', 'hunt');
  await studio.init();

  // 1. Verify URL ?search= hydration, folder scope, run-scoped candidate loading, default sort=repins, Idea Page lookup & zero currentRoom conflict
  assert.equal(studio.scopedFolderId, '42');
  assert.equal(studio.activeFolder?.name, 'Outdoor Living');
  assert.equal(studio.huntInput, 'graduation party foods');
  assert.equal(studio.activeView, 'hunt');
  assert.equal(studio.activeRunId, 7);
  assert.equal(studio.filters.sort, 'repins');
  assert.equal(studio.candidates.length, 1);
  assert.equal(studio.crossoverClusters.length, 1);
  assert.equal('currentRoom' in studio, false, 'Must not declare currentRoom to avoid folder header hijack');
  assert.ok(apiRequests.some((r) => r.url.includes('/api/newborn/candidates?') && r.url.includes('run_id=7') && r.url.includes('sort=repins')), 'This Hunt must scope candidates to activeRunId sorted by repins');
  assert.ok(apiRequests.some((r) => r.url.startsWith('/api/newborn/idea-intelligence?')), 'Init with query seed must resolve official Idea Page intelligence');
  assert.equal(studio.activeIdeaPage?.internal_search_count, 720549);

  // 2. Verify theme toggling mutates document.documentElement ONLY, never document.body
  studio.toggleTheme();
  assert.equal(studio.isDark, true);
  assert.equal(rootClasses.has('dark'), true);
  assert.equal(bodyClasses.has('dark'), false);
  assert.equal(storageMap.get('pa_theme'), 'dark');

  // 3. Verify Settings preset, save (PATCH), & reset (dead settingsDrawerOpen removed in Pre-Wave 5)
  assert.equal('settingsDrawerOpen' in studio, false, 'Dead settingsDrawerOpen state must be removed');
  studio.applyAgePreset('14d');
  assert.equal(studio.settingsDraft.qualification.max_age_days, 14);
  studio.settingsDraft.automation.auto_track_enabled = true;
  await studio.saveSettings();

  const patchSettingsCall = apiRequests.find((r) => r.url === '/api/newborn/settings' && r.method === 'PATCH');
  assert.ok(patchSettingsCall);
  assert.equal(patchSettingsCall.body.qualification.max_age_days, 14);
  assert.equal(studio.scheduleStatus.watchlist_poll_due, true, 'Must use exact watchlist_poll_due key');

  await studio.resetSettingsToDefaults();
  assert.equal(studio.settingsDraft.qualification.max_age_days, 30);

  // 4. Verify Past Hunts multi-select & 2-step bulk delete calls /api/newborn/runs/bulk-delete
  assert.equal('profileModalOpen' in studio, false, 'Dead profile modal state must be removed');
  assert.equal('loadWatchlist' in studio, false, 'Legacy watchlist polling methods must be removed');
  studio.runs = [
    { id: 101, status: 'completed', execution_mode: 'fleet' },
    { id: 102, status: 'running', execution_mode: 'fleet' },
    { id: 103, status: 'failed', execution_mode: 'fleet' }
  ];
  studio.toggleSelectAllRuns();
  assert.deepEqual(studio.selectedRunIds, [101, 103], 'Select All must include only non-active Past Hunts');
  await studio.deleteSelectedRuns();
  assert.equal(studio.confirmBulkDeleteRuns, true, 'First click arms confirmation');
  await studio.deleteSelectedRuns();
  const bulkDeleteCall = apiRequests.find((r) => r.url === '/api/newborn/runs/bulk-delete' && r.method === 'POST');
  assert.ok(bulkDeleteCall);
  assert.deepEqual(bulkDeleteCall.body.run_ids, [101, 103]);

  // 5. Verify Redacted Cookie Vault uses exact `preview` key & wipes raw input immediately
  studio.cookieInput = 'super_secret_pinterest_sess_token_999';
  await studio.saveCookie();
  assert.equal(studio.cookieInput, '', 'Raw cookie input must be wiped immediately after save');
  assert.equal(studio.cookieStatus.has_cookie, true);
  assert.equal(studio.cookieStatus.preview, '[CONFIGURED]');
  assert.equal(JSON.stringify(studio.cookieStatus).includes('super_secret_pinterest_sess_token_999'), false);
  await studio.clearCookie();
  assert.equal(studio.cookieStatus.has_cookie, false);

  // 6. Verify HTTP 202 Focused Hunt passes explicit 3-Filter + Per-Path deep-scroll overrides -> clean timer stop on completion
  if (studio.workspaceHuntDefaults) {
    studio.workspaceHuntDefaults.huntFilters.minSaves = 15;
  }
  studio.huntFilters.maxAgeDays = 14;
  studio.huntFilters.minRepins = 50;
  studio.huntFilters.minSaves = 0;
  studio.huntPaths.search.target_pins = 2000;
  studio.huntPaths.boards.max_boards = 25;
  await studio.selectTrendAndHunt('meal prep for the week');
  await new Promise((r) => setTimeout(r, 40));
  const discoverCall = apiRequests.find((r) => r.url === '/api/newborn/discover' && r.method === 'POST');
  assert.ok(discoverCall);
  assert.equal(discoverCall.body.filters.max_age_days, 14);
  assert.equal(discoverCall.body.filters.min_repin_count, 50);
  assert.equal(discoverCall.body.filters.min_save_count, 0);
  assert.equal(discoverCall.body.paths.search.target_pins, 2000);
  assert.equal(discoverCall.body.paths.boards.max_boards, 25);
  assert.equal(studio.activeRunId, 18);
  assert.equal(studio.activeRun.status, 'completed');
  assert.equal(studio.pollTimerId, null, 'Poll timer must stop cleanly when run reaches terminal status');
  assert.equal(studio.isPollingRun, false);

  // 7. Verify Scroll Related, On-Demand Pull Account Reach, Annotations Filter + Volume Check, CSV Formula Neutralization & Track Daily
  studio.huntPaths.related.target_pins = 500;
  await studio.scrollRelatedPins(['901000200030004001']);
  await new Promise((r) => setTimeout(r, 30));
  const snowballCall = apiRequests.find((r) => r.url === '/api/newborn/snowball' && r.method === 'POST');
  assert.deepEqual(snowballCall.body.seed_pin_ids, ['901000200030004001']);
  assert.equal(snowballCall.body.target_pins, 500);

  await studio.pullAccountReach(['901000200030004001']);
  const accPullCall = apiRequests.find((r) => r.url === '/api/newborn/candidates/901000200030004001/fetch-account' && r.method === 'POST');
  assert.ok(accPullCall, 'Pull Account must call single-pin fetch-account endpoint on demand');
  assert.equal(studio.candidates[0].creator_monthly_reach, 520000);
  assert.equal(studio.candidates[0].creator_profile_views, 690000);

  await studio.selectAnnotationFilter('meal prep for the week');
  assert.ok(apiRequests.some((r) => r.url.includes('annotation=meal+prep+for+the+week')));
  await studio.checkAnnotationVolumes();
  assert.equal(studio.annotationVolumeMap['meal prep for the week']?.internal_search_count, 720549);

  const exportedCsv = studio.exportCsv();
  assert.ok(exportedCsv.includes('"\'=HYPERLINK('), 'CSV export must neutralize formula injection payloads');

  studio.openPromoteModal(['901000200030004001']);
  studio.promoteForm.promoteClusterSeeds = true;
  await studio.submitPromotePins();
  const promoteCall = apiRequests.find((r) => r.url === '/api/newborn/promote' && r.method === 'POST');
  assert.ok(promoteCall);
  assert.deepEqual(promoteCall.body.pin_ids, ['901000200030004001']);
  assert.equal(promoteCall.body.destinations.promote_to_daily_ssot, true);
  assert.equal(promoteCall.body.destinations.promote_to_campaign_folder_id, 42);
  assert.equal(promoteCall.body.destinations.promote_to_cluster_seeds, true);

  // 8. Verify external board URL normalization, surface labels, 10M+ ceiling & /pin/:id back-link
  assert.equal(studio.formatBoardUrl('/curatorjane/urban-balcony-ideas/'), 'https://www.pinterest.com/curatorjane/urban-balcony-ideas/');
  assert.equal(studio.formatSurfaceLabel('pin_serp_capsules'), 'Search');
  assert.equal(studio.formatSurfaceLabel('board_more_ideas'), 'Find More Ideas');
  assert.equal(studio.formatSurfaceLabel('ideas_feeds'), 'Idea Page');
  assert.equal(studio.formatSurfaceLabel('home_feed'), 'Home Feed');
  assert.equal(studio.formatReach(10000001), '10M+');
  assert.equal(studio.formatNullableCount(null), '—');
  assert.ok(studio.buildPinDetailsHref('901000200030004001').includes('source=newborn'));

  studio.destroy();
  assert.equal(studio.pollTimerId, null);
});

test('Wave 6B.4: Autonomous Newborn Fleet CLI (scripts/newborn-fleet.mjs) — Dispatch, Sharded Workers, Consolidate & Lease Cleanup', async () => {
  // 1. CLI Argument & Smart Seed Parsing
  const parsed = parseNewbornFleetArgs(
    [
      '--mode=discovery',
      '--profile=ultra-fresh-7d-rockets',
      '--query=patio decor,https://www.pinterest.com/pin/1098245059167667976/,/garden/balcony-ideas/',
      '--shards=4',
      '--worker-index=1',
      '--worker-total=4',
      '--force=true'
    ],
    {}
  );
  assert.equal(parsed.mode, 'discovery');
  assert.equal(parsed.profileId, 'ultra-fresh-7d-rockets');
  assert.equal(parsed.workerIndex, 1);
  assert.equal(parsed.workerTotal, 4);
  assert.equal(parsed.force, true);
  assert.deepEqual(parsed.seedPinIds, ['1098245059167667976']);
  assert.equal(parsed.seedBoards.length, 1);
  assert.equal(parsed.seedBoards[0].owner_username, 'garden');
  assert.ok(parsed.seedQueries.includes('patio decor'));

  assert.throws(() => parseNewbornFleetArgs(['--mode=nonexistent'], {}), /Invalid --mode/);
  assert.throws(() => parseNewbornFleetArgs(['--shards=99'], {}), /Invalid --shards/);

  // 2. Stage 0 Dispatch skips cleanly when scheduled & auto_track_enabled is false, and emits matrix when forced
  let leaseStopped = 0;
  let sqlEnded = 0;
  const dispatchSql = async (strings) => {
    const q = buildSqlText(strings);
    if (q.includes('COUNT(*)::int AS total') && q.includes('stage = \'watchlist\'')) {
      return [{ total: 6 }];
    }
    return [];
  };
  dispatchSql.end = async () => { sqlEnded++; };

  const skipRes = await executeNewbornFleetCli(['--mode=dispatch', '--target-mode=auto_cycle'], {
    env: { GITHUB_EVENT_NAME: 'schedule' },
    sqlClient: dispatchSql,
    setDefaultDispatcher: null,
    lease: { stop: async () => { leaseStopped++; } }
  });
  assert.equal(skipRes.taskCount, 0);
  assert.equal(skipRes.skipReason, 'auto_track_disabled');
  assert.equal(leaseStopped, 1);
  assert.equal(sqlEnded, 1);

  const forcedRes = await executeNewbornFleetCli(
    ['--mode=dispatch', '--target-mode=auto_cycle', '--force=true', '--shards=3', '--query=alpha,beta,gamma'],
    {
      env: { GITHUB_EVENT_NAME: 'workflow_dispatch' },
      sqlClient: dispatchSql,
      setDefaultDispatcher: null,
      lease: { stop: async () => { leaseStopped++; } }
    }
  );
  assert.equal(forcedRes.skipReason, null);
  assert.equal(forcedRes.matrixTasks.filter((t) => t.mode === 'watchlist_poll').length, 3);
  assert.equal(forcedRes.matrixTasks.filter((t) => t.mode === 'discovery').length, 3);

  // 3. Stage 2 Consolidate & Guaranteed Lease/SQL Cleanup on Worker Error
  const consolidateSql = async (strings) => {
    const q = buildSqlText(strings);
    if (q.includes('total_candidates')) {
      return [{ total_candidates: 24, golden_pins_count: 7, linkless_vacuum_count: 5, avg_golden_score: 81.2 }];
    }
    return [];
  };
  consolidateSql.end = async () => { sqlEnded++; };

  const summaryRes = await executeNewbornFleetCli(['--mode=consolidate'], {
    env: {},
    sqlClient: consolidateSql,
    setDefaultDispatcher: null,
    lease: { stop: async () => { leaseStopped++; } }
  });
  assert.equal(summaryRes.counts.total_candidates, 24);
  assert.equal(summaryRes.counts.golden_pins_count, 7);

  let errorLeaseStopped = false;
  let errorSqlEnded = false;
  const throwingSql = async () => {
    throw new Error('simulated_db_failure');
  };
  throwingSql.end = async () => { errorSqlEnded = true; };

  await assert.rejects(
    () => executeNewbornFleetCli(['--mode=watchlist_poll', '--worker-index=0', '--worker-total=2'], {
      env: {},
      sqlClient: throwingSql,
      setDefaultDispatcher: null,
      lease: { stop: async () => { errorLeaseStopped = true; } }
    }),
    /simulated_db_failure/
  );
  assert.equal(errorLeaseStopped, true, 'InstaBox activity lease must stop even when worker throws');
  assert.equal(errorSqlEnded, true, 'SQL client must close even when worker throws');
});

test('Wave 6B.5: Zone-A RelatedModulesResource upgrade & automatic HTTP 412 zero-cookie fallback across existing crawlers', async () => {
  // 1. Header builders attach _auth=1 when cookie is present and strip cookies when absent
  const authBuilt = buildZoneARelatedModulesHeaders({
    pinId: '1098245059167667976',
    rawCookie: 'my_sess_token_abc'
  });
  assert.equal(authBuilt.usedAuthCookie, true);
  assert.equal(authBuilt.headers.Cookie, '_pinterest_sess="my_sess_token_abc"; _auth=1');
  assert.equal(authBuilt.guestHeaders.Cookie, undefined);
  assert.equal(authBuilt.headers['X-Pinterest-PWS-Handler'], 'www/pin/[id].js');

  const guestBuilt = buildZoneARelatedModulesHeaders({
    pinId: '1098245059167667976',
    rawCookie: ''
  });
  assert.equal(guestBuilt.usedAuthCookie, false);
  assert.equal(guestBuilt.headers.Cookie, undefined);
  assert.equal(buildClusterSeedRelatedHeaders('1098245059167667976', 'tok').headers.Cookie, '_pinterest_sess="tok"; _auth=1');
  assert.equal(buildAccountRelatedHeaders('1098245059167667976', '').headers.Cookie, undefined);

  // 2. fetchRelatedModulesWithZoneA retries once with zero-cookie on HTTP 412 without tripping PinterestCircuitBreaker
  const breaker = new PinterestCircuitBreaker({ failureThreshold: 1 });
  const zoneCalls = [];
  const zoneRes = await fetchRelatedModulesWithZoneA('https://www.pinterest.com/resource/RelatedModulesResource/get/', {
    pinId: '1098245059167667976',
    rawCookie: 'expired_sess_token',
    breaker,
    fetchImpl: async (_url, init) => {
      zoneCalls.push(init.headers);
      if (zoneCalls.length === 1) {
        return new Response(JSON.stringify({ message: 'Login required' }), {
          status: 412,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        resource_response: {
          data: [{ id: '222333444555666777', type: 'pin', title: 'Fallback Related Pin', repin_count: 45 }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  assert.equal(zoneRes.ok, true);
  assert.equal(zoneRes.usedGuestFallback, true);
  assert.equal(zoneCalls.length, 2);
  assert.match(String(zoneCalls[0].Cookie), /_auth=1/);
  assert.equal(zoneCalls[1].Cookie, undefined, 'Fallback retry must strip all cookies');
  assert.equal(breaker.getState().state, 'CLOSED', 'HTTP 412 must never trip PinterestCircuitBreaker');

  // 3. scripts/cluster-intelligence.mjs fetchWithRetry handles HTTP 412 -> zero-cookie fallback cleanly
  const clusterCalls = [];
  const clusterData = await fetchClusterWithRetry(
    'https://www.pinterest.com/resource/RelatedModulesResource/get/',
    buildClusterSeedRelatedHeaders('1098245059167667976', 'stale_cluster_cookie').headers,
    2,
    {
      fetchImpl: async (_url, init) => {
        clusterCalls.push(init.headers);
        if (clusterCalls.length === 1) {
          return new Response('Precondition Failed', { status: 412 });
        }
        return new Response(JSON.stringify({ resource_response: { data: [{ id: '333444555666777888' }] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    }
  );
  assert.equal(clusterCalls.length, 2);
  assert.match(String(clusterCalls[0].Cookie), /_auth=1/);
  assert.equal(clusterCalls[1].Cookie, undefined);
  assert.equal(clusterData.resource_response.data[0].id, '333444555666777888');

  // 4. scripts/account-related-crawler.mjs crawlSeedPin + creator-harvest-and-archive harvestSinglePinRelatedLive
  const persistedBatches = [];
  const crawlerSql = async (strings, ...values) => {
    const q = buildSqlText(strings);
    if (q.includes('SELECT id FROM competitor_profiles')) return [{ id: 15 }];
    if (q.includes('SELECT id, username FROM competitor_profiles')) return [{ id: 15, username: 'decorqueen' }];
    if (q.includes('FROM competitor_board_pins')) return [{ title: 'Seed Pin', image_url: '', board_name: 'Patio', save_count: 50 }];
    if (q.includes('INSERT INTO candidate_graph_nodes')) {
      persistedBatches.push(JSON.parse(values[0]));
      return [];
    }
    return [];
  };

  const relatedPayload = {
    resource_response: {
      bookmark: null,
      data: [
        {
          id: '444555666777888999',
          type: 'pin',
          title: 'Self Retained Patio Idea',
          repin_count: 32,
          aggregated_pin_data: { aggregated_stats: { saves: 88 } },
          pinner: { username: 'decorqueen', full_name: 'Decor Queen' },
          domain: 'decorqueen.com',
          link: 'https://decorqueen.com/patio/'
        },
        {
          id: '555666777888999000',
          type: 'pin',
          title: 'Rival Leakage Pin',
          repin_count: 19,
          pinner: { username: 'rivalcreator', full_name: 'Rival' },
          domain: 'rivalblog.com',
          link: 'https://rivalblog.com/balcony/'
        }
      ]
    }
  };

  const accountHeadersSeen = [];
  const discoveredCount = await crawlSeedPin(15, '1098245059167667976', 'decorqueen', {
    sql: crawlerSql,
    rawCookie: 'valid_zone_a_cookie',
    maxPages: 1,
    skipDelay: true,
    fetchImpl: async (_url, init) => {
      accountHeadersSeen.push(init.headers);
      return new Response(JSON.stringify(relatedPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  assert.equal(discoveredCount, 2);
  assert.match(String(accountHeadersSeen[0].Cookie), /_pinterest_sess="valid_zone_a_cookie"; _auth=1/);
  assert.equal(persistedBatches[0].length, 2);

  const liveHarvestRes = await harvestSinglePinRelatedLive(crawlerSql, 15, '1098245059167667976', {
    rawCookie: 'valid_zone_a_cookie',
    fetchImpl: async () => new Response(JSON.stringify(relatedPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  assert.equal(liveHarvestRes.ok, true);
  assert.equal(liveHarvestRes.discovered_count, 2);
  assert.equal(liveHarvestRes.used_auth_cookie, true);
  assert.equal(persistedBatches[1].filter((r) => r.creator_username === 'decorqueen').length, 1);
  assert.equal(persistedBatches[1].filter((r) => r.creator_username !== 'decorqueen').length, 1);
});
