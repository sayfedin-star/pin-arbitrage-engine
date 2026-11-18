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

  // Global mode navigation & official Pinterest Business terminology
  const globalTree = parseHtmlElementTree(globalHtml);
  const newbornNavLinks = collectNodes(globalTree, (n) => n.tag === 'a' && n.attrs.href === '/newborn');
  assert.ok(newbornNavLinks.length >= 2, 'App sidebar (mobile + desktop) must link to /newborn');

  assert.ok(globalHtml.includes('Total audience'), 'Rookie Radar must use official "Total audience" label');
  assert.ok(globalHtml.includes('Impressions'), 'Rookie Radar must use official "Impressions" label');
  assert.ok(globalHtml.includes('Creator Hub'), 'Rookie Radar must reference "Creator Hub"');
  assert.ok(globalHtml.includes('Origin Creator vs Pinner'), 'Candidates grid must separate Origin Creator and Pinner');
  assert.ok(globalHtml.includes('Linkless Goldmine'), 'Candidates grid must expose Linkless Goldmine arbitrage signal');

  // Zero UI emojis inside global <main> studio rooms
  const mainMatch = globalHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(mainMatch, 'Expected <main> block in global Newborn HTML');
  assert.equal(/\p{Extended_Pictographic}/u.test(mainMatch[1]), false, 'Global Newborn <main> must contain zero UI emojis');

  // Folder-scoped mode renders shared Campaign Workspace Header with active Newborn tab
  const folderTree = parseHtmlElementTree(folderHtml);
  const folderNewbornLinks = collectNodes(
    folderTree,
    (n) => n.tag === 'a' && n.attrs.href === '/folders/42/newborn'
  );
  assert.equal(folderNewbornLinks.length, 1, 'Folder-scoped view must render /folders/42/newborn tab');
  assert.ok(folderHtml.includes("newbornStudioApp('42', 'candidates')"));
  assert.ok(settingsHtml.includes("newbornStudioApp('', 'settings')"));
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
    assert.equal(getRes.headers.vary, 'Cookie');
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

test('Wave 6B.3: newbornStudioApp VM execution — Control Center settings, profiles, redacted cookie vault, hunt, snowball, promote & CSV safety', async (t) => {
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
      title: '=CMD|\' /C calc\'!A0 Viral Balcony Bench',
      stage: 'discovered',
      is_golden_pin: true,
      is_linkless: true,
      is_repin: false,
      golden_score: 91.2,
      age_days: 5.0,
      repin_per_day: 18.4,
      save_count: null,
      repin_count: 92,
      share_count: 4,
      comment_count: 2,
      reaction_count: 11,
      origin_creator_username: 'rookiewoodworker',
      pinner_username: 'rookiewoodworker',
      clean_domain: null,
      board_name: 'Small Space DIY',
      board_pin_count: 42,
      board_follower_count: 510,
      upload_provenance: 'SHARE_EXTENSION_IOS',
      crossover_blueprint: {
        primary_keyword: 'balcony bench diy',
        recommended_board_name: 'Small Balcony Seating',
        recommended_pin_title: 'Easy DIY Balcony Bench'
      }
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
    document: mockDocument,
    location: { search: '?search=balcony', href: '/folders/42/newborn?search=balcony' },
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
      if (String(url) === '/api/newborn/settings' && method === 'GET') {
        return jsonRes({
          success: true,
          settings: {
            discovery: { country: 'US', default_l1_interest: 'gardening', max_board_age_days: 30 },
            qualification: { age_window_preset: '30d', max_age_days: 30, min_repin_count: 5 },
            automation: { auto_track_enabled: false, schedule: { cadence: 'every_6h' } }
          },
          schedule: { auto_track_enabled: false, cadence: 'every_6h' },
          cookie_status: { has_cookie: false, source: 'none', zone_routing_mode: 'guest_only' },
          profiles: [{ id: 1, slug: 'default-golden-breakout', name: 'Default Golden Breakout', is_default: true }]
        });
      }
      if (String(url) === '/api/newborn/settings' && method === 'PUT') {
        return jsonRes({
          success: true,
          settings: bodyObj.settings,
          schedule: { auto_track_enabled: Boolean(bodyObj.settings?.automation?.auto_track_enabled), cadence: 'every_3h' }
        });
      }
      if (String(url) === '/api/newborn/settings/reset' && method === 'POST') {
        return jsonRes({
          success: true,
          settings: { qualification: { age_window_preset: '30d', max_age_days: 30 } },
          schedule: { auto_track_enabled: false, cadence: 'every_6h' }
        });
      }
      if (String(url) === '/api/newborn/overview') {
        return jsonRes({
          success: true,
          counts: { total_candidates: 1, golden_pins_count: 1, linkless_vacuum_count: 1, watchlist_count: 0, active_daily_anchors_count: 0 },
          cookie_status: { has_cookie: false, source: 'none', zone_routing_mode: 'guest_only' },
          automation_schedule: { auto_track_enabled: false, cadence: 'every_6h' },
          recent_runs: [{ id: 7, run_type: 'discovery', status: 'completed', cookie_mode: 'guest_only', candidates_discovered: 12, golden_pins_count: 3, rookie_creators_count: 1, snowball_hops_executed: 1 }]
        });
      }
      if (String(url).startsWith('/api/newborn/candidates?')) {
        return jsonRes({ success: true, total: 1, candidates: mockCandidatesPayload });
      }
      if (String(url) === '/api/newborn/profiles' && method === 'POST') {
        return jsonRes({
          success: true,
          profile: { id: 9, slug: 'patio-14d', name: bodyObj.name, is_default: false }
        }, 201);
      }
      if (String(url) === '/api/newborn/profiles/patio-14d' && method === 'GET') {
        return jsonRes({
          success: true,
          profile: { id: 9, slug: 'patio-14d', name: 'Patio 14d Rockets' },
          effective_settings: { qualification: { age_window_preset: '14d', max_age_days: 14, min_repin_count: 12 } }
        });
      }
      if (String(url) === '/api/newborn/profiles/9' && method === 'DELETE') {
        return jsonRes({ success: true, deleted: true });
      }
      if (String(url) === '/api/newborn/cookie' && method === 'POST') {
        return jsonRes({
          success: true,
          has_cookie: true,
          source: 'newborn_pinterest_cookie',
          redacted_preview: '[CONFIGURED]',
          zone_routing_mode: 'two_zone_authenticated_plus_zero_cookie'
        });
      }
      if (String(url) === '/api/newborn/cookie' && method === 'DELETE') {
        return jsonRes({
          success: true,
          has_cookie: false,
          source: 'none',
          redacted_preview: null,
          zone_routing_mode: 'guest_only'
        });
      }
      if (String(url) === '/api/newborn/discover' && method === 'POST') {
        return jsonRes({
          success: true,
          run_id: 18,
          cookie_mode: 'two_zone_authenticated_plus_zero_cookie',
          candidates_discovered: 19,
          golden_pins_count: 4,
          rookie_creators_count: 2,
          snowball_hops_executed: 2
        });
      }
      if (String(url) === '/api/newborn/snowball' && method === 'POST') {
        return jsonRes({ success: true, candidates_discovered: 8, golden_pins_count: 2 });
      }
      if (String(url) === '/api/newborn/watchlist/poll' && method === 'POST') {
        return jsonRes({ success: true, polled_count: 5, auto_promoted_count: 1 });
      }
      if (String(url) === '/api/newborn/auto-run' && method === 'POST') {
        return jsonRes({ success: true, executed: true });
      }
      if (String(url) === '/api/newborn/promote' && method === 'POST') {
        return jsonRes({
          success: true,
          pins: { ok: true, promoted_count: bodyObj.pin_ids.length, anchors_created: bodyObj.pin_ids.length },
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
  // Auto-confirm dialogs during headless automation tests
  sandbox.PAE.confirm = async () => true;

  const clientScriptRaw = getNewbornClientAppScript()
    .replace(/^[\s]*<script[^>]*>/i, '')
    .replace(/<\/script>[\s]*$/i, '');
  new vm.Script(clientScriptRaw, { filename: 'newborn-client-app.js' }).runInNewContext(sandbox);

  const studio = sandbox.newbornStudioApp('42', 'candidates');
  await studio.init();

  // Verify URL ?search= hydration + folder scope + initial candidates load
  assert.equal(studio.scopedFolderId, '42');
  assert.equal(studio.activeFolder?.name, 'Outdoor Living');
  assert.equal(studio.huntQueryInput, 'balcony');
  assert.equal(studio.candidates.length, 1);
  assert.equal(studio.selectedProfileSlug, 'default-golden-breakout');

  // Verify theme toggling mutates document.documentElement ONLY, never document.body
  studio.toggleTheme();
  assert.equal(studio.isDark, true);
  assert.equal(rootClasses.has('dark'), true);
  assert.equal(bodyClasses.has('dark'), false);
  assert.equal(storageMap.get('pa_theme'), 'dark');

  // Verify Settings preset, provenance toggle, save & reset
  studio.applyAgePreset('14d');
  assert.equal(studio.settingsDraft.qualification.max_age_days, 14);
  studio.toggleAllowedProvenance('VIDEO');
  assert.equal(studio.settingsDraft.qualification.provenance.allowed_sources.includes('VIDEO'), false);
  studio.settingsDraft.automation.auto_track_enabled = true;
  studio.settingsDraft.automation.pin_promotion_rules.destinations.promote_to_campaign_folder_id = '42';
  await studio.saveGlobalSettings();

  const putSettingsCall = apiRequests.find((r) => r.url === '/api/newborn/settings' && r.method === 'PUT');
  assert.ok(putSettingsCall);
  assert.equal(putSettingsCall.body.settings.qualification.max_age_days, 14);
  assert.equal(putSettingsCall.body.settings.automation.pin_promotion_rules.destinations.promote_to_campaign_folder_id, 42);

  await studio.resetSettingsToDefaults();
  assert.equal(studio.settingsDraft.qualification.max_age_days, 30);

  // Verify Rule Profile create -> load -> delete
  studio.openProfileModal(null);
  studio.profileForm.name = 'Patio 14d Rockets';
  await studio.submitProfileModal();
  assert.equal(studio.selectedProfileSlug, 'patio-14d');

  await studio.loadProfileIntoDraft('patio-14d');
  assert.equal(studio.settingsDraft.qualification.min_repin_count, 12);

  await studio.deleteRuleProfile({ id: 9, slug: 'patio-14d', name: 'Patio 14d Rockets' });
  assert.equal(studio.selectedProfileSlug, 'default-golden-breakout');

  // Verify Redacted Cookie Vault save & clear (raw token immediately wiped from client input)
  studio.cookieDraftInput = 'super_secret_pinterest_sess_token_999';
  await studio.saveCookieToVault();
  assert.equal(studio.cookieDraftInput, '', 'Raw cookie input must be wiped immediately after save');
  assert.equal(studio.cookieStatus.has_cookie, true);
  assert.equal(JSON.stringify(studio.cookieStatus).includes('super_secret_pinterest_sess_token_999'), false);

  await studio.clearCookieFromVault();
  assert.equal(studio.cookieStatus.has_cookie, false);

  // Verify 1-click Hunt, Snowball, Watchlist Poll, Auto-Cycle & Multi-Pillar Promotion
  await studio.huntSingleSeed('cottagecore patio');
  assert.equal(studio.latestRunSummary.id, 18);

  await studio.triggerSnowballOnSelectedOrTop();
  const snowballCall = apiRequests.find((r) => r.url === '/api/newborn/snowball');
  assert.deepEqual(snowballCall.body.seed_pin_ids, ['901000200030004001']);

  await studio.pollWatchlistNow();
  await studio.runAutoCycleNow();

  studio.openPromoteModal(studio.candidates);
  studio.promoteForm.alsoPromoteCreators = true;
  await studio.submitPromoteModal();
  const promoteCall = apiRequests.find((r) => r.url === '/api/newborn/promote');
  assert.ok(promoteCall);
  assert.deepEqual(promoteCall.body.pin_ids, ['901000200030004001']);
  assert.deepEqual(promoteCall.body.usernames, ['rookiewoodworker']);
  assert.equal(promoteCall.body.destinations.promote_to_daily_ssot, true);
  assert.equal(promoteCall.body.destinations.promote_to_campaign_folder_id, 42);
  assert.equal(promoteCall.body.destinations.promote_to_cluster_seeds, true);

  // Verify 10M+ ceiling, null save formatting, safeUrl, and CSV formula-injection neutralization
  assert.equal(studio.formatCeilingMetric(10000001, true), '10M+');
  assert.equal(studio.formatCeilingMetric(null, true), '—');
  assert.equal(studio.formatNullableInt(null), '—');
  assert.equal(studio.safeHref('javascript:alert(1)'), '#');

  const csv = studio.exportCandidatesCsv();
  assert.ok(csv.includes('"\'=CMD|\' /C calc\'!A0 Viral Balcony Bench"'), 'CSV export must neutralize leading = formula injection');
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
    if (q.includes('INSERT INTO competitor_related_nodes')) {
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
  assert.equal(persistedBatches[1].filter((r) => r.is_same_account).length, 1);
  assert.equal(persistedBatches[1].filter((r) => !r.is_same_account).length, 1);
});
