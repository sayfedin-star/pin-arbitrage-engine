import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  AUTOCOMPLETE_MIN_CHARS,
  normalizeAutocompleteQuery,
  resolveKeywordUrl,
  resolveCreatorUrl,
  parseRequestedTypes,
  searchMultiEntityAutocomplete
} from '../src/modules/search/autocomplete-service.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';

function normalizeSql(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function makeMockSql(handler) {
  const calls = [];
  const exec = (strings, ...values) => {
    const query = normalizeSql(strings);
    calls.push({ query, values });
    const rows = handler ? handler(query, values, calls) : [];
    const arr = Array.isArray(rows) ? rows : [];
    arr.count = rows?.count ?? arr.length;
    return Promise.resolve(arr);
  };
  return { sql: exec, calls };
}

function makeSidebarVmContext({ fetchImpl } = {}) {
  const sidebarHtml = renderAppSidebar({ activeNav: 'overview' });
  const scriptMatch = sidebarHtml.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, 'Expected <script> inside renderAppSidebar');
  const navLog = [];
  const win = {
    location: { pathname: '/', search: '', _href: '/' },
    addEventListener: () => {},
    lucide: { createIcons: () => {} }
  };
  Object.defineProperty(win.location, 'href', {
    get() { return this._href; },
    set(val) { this._href = val; navLog.push(val); }
  });
  const ctx = {
    window: win,
    document: {
      addEventListener: () => {},
      getElementById: () => ({ focus: () => {} }),
      querySelector: () => ({ scrollIntoView: () => {} })
    },
    fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ success: true, entities: { keywords: [], creators: [], folders: [], domains: [] } }) })),
    AbortController,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Map,
    Array,
    Object,
    String,
    Number,
    console
  };
  vm.createContext(ctx);
  vm.runInContext(scriptMatch[1], ctx);
  assert.equal(typeof ctx.window.paeCommandPalette, 'function');
  return { factory: ctx.window.paeCommandPalette, navLog, sidebarHtml };
}

function extractStudioFactory(html, fnName, { pathname = '/', search = '' } = {}) {
  const scriptTags = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const target = scriptTags.find((s) => s.includes(`function ${fnName}`));
  assert.ok(target, `Expected <script> block containing function ${fnName}`);
  const code = target.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
  const ctx = {
    window: {
      __INITIAL_KEYWORD_SLUG__: '',
      resolvePinImageUrl: (u) => u || '',
      handlePinImgError: () => {},
      safeApiFetch: async () => ({ ok: true, json: async () => ({}) }),
      addEventListener: () => {},
      history: { replaceState: () => {}, pushState: () => {} },
      lucide: { createIcons: () => {} },
      location: { pathname, search, href: `http://localhost:3000${pathname}${search}` }
    },
    document: {
      documentElement: { classList: { add: () => {}, remove: () => {} } },
      readyState: 'complete',
      activeElement: null,
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ keywords: [], folders: [], domains: [], data: [], profiles: [] }) }),
    URLSearchParams,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { fn: ctx[fnName], ctx };
}

test('Migration 065 uses transactional CREATE INDEX IF NOT EXISTS (no CONCURRENTLY) and is registered in migrate.mjs', () => {
  const mig065Path = path.resolve(process.cwd(), 'scripts/migrations/065_instant_search_trgm_indexes.sql');
  assert.equal(fs.existsSync(mig065Path), true, 'Migration 065 SQL file must exist');
  const sqlText = fs.readFileSync(mig065Path, 'utf8');
  const sqlNoComments = sqlText.replace(/--.*$/gm, '');

  assert.equal(/\bCONCURRENTLY\b/i.test(sqlNoComments), false, 'Migration 065 DDL must NOT use CONCURRENTLY inside migrate.mjs transactions');
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_cp_trgm_display_name/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_cp_lower_username_pattern/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_kf_trgm_name/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword_pattern/i);
  assert.match(sqlText, /CREATE INDEX IF NOT EXISTS idx_dir_lower_domain_pattern/i);

  const migratePath = path.resolve(process.cwd(), 'scripts/migrate.mjs');
  const migrateSrc = fs.readFileSync(migratePath, 'utf8');
  assert.match(migrateSrc, /065_instant_search_trgm_indexes\.sql/);
  assert.match(migrateSrc, /version:\s*'065'/);
});

test('normalizeAutocompleteQuery, resolveKeywordUrl, resolveCreatorUrl, and parseRequestedTypes enforce rules', () => {
  assert.equal(AUTOCOMPLETE_MIN_CHARS, 2);

  const short1 = normalizeAutocompleteQuery(' m ');
  assert.equal(short1.tooShort, true);

  const atShort = normalizeAutocompleteQuery('@m');
  assert.equal(atShort.tooShort, true);

  const prefix2 = normalizeAutocompleteQuery('ma');
  assert.equal(prefix2.tooShort, false);
  assert.equal(prefix2.isShortPrefix, true);
  assert.equal(prefix2.prefixPattern, 'ma%');
  assert.equal(prefix2.matchPattern, 'ma%');

  const sub3 = normalizeAutocompleteQuery('  Mar%Co_  ');
  assert.equal(sub3.tooShort, false);
  assert.equal(sub3.isShortPrefix, false);
  assert.equal(sub3.prefixPattern, 'mar\\%co\\_%');
  assert.equal(sub3.matchPattern, '%mar\\%co\\_%');

  assert.equal(resolveKeywordUrl({ keyword: 'Easy Lunch Ideas', canonical_keyword: 'easy-lunch-ideas' }), '/keywords/easy-lunch-ideas');
  assert.equal(resolveKeywordUrl({ keyword: 'Taco Soup' }), '/keywords/taco-soup');

  assert.equal(resolveCreatorUrl('@marthastewart'), '/marthastewart');
  // Reserved slug must route safely to /accounts?creator=...
  assert.equal(resolveCreatorUrl('keywords'), '/accounts?creator=keywords');
  assert.equal(resolveCreatorUrl('domains'), '/accounts?creator=domains');

  const parsed = parseRequestedTypes('creators, domains, invalid_type');
  assert.deepEqual(Array.from(parsed).sort(), ['creators', 'domains']);
  assert.equal(parseRequestedTypes('').size, 4);
});

test('searchMultiEntityAutocomplete runs 4 parallel queries, filters system/unpinned rows, and preserves legacy results', async () => {
  const { sql, calls } = makeMockSql((query, values) => {
    if (query.includes('FROM tracked_keywords')) {
      return [{ id: 11, keyword: 'marry me chicken', canonical_keyword: 'marry-me-chicken', category: 'Dinner', is_active: true, target_pin_count: 20, avg_daily_velocity: 42.5, active_pin_count: 19 }];
    }
    if (query.includes('FROM competitor_profiles')) {
      return [{ id: 7, username: 'marthastewart', display_name: 'Martha Stewart', avatar_url: 'https://i.pinimg.com/a.jpg', monthly_reach: 1200000, follower_count: 500000, total_pins: 1800, account_type: 'competitor' }];
    }
    if (query.includes('FROM keyword_folders')) {
      return [{ id: 3, name: 'Marketing Crafts', description: 'Seasonal cluster', color: '#10b981', icon: 'folder', keyword_count: 8 }];
    }
    if (query.includes('FROM domain_intelligence_rollup')) {
      return [{ domain: 'marthastewart.com', total_pins: 84, active_serp_pins: 22, total_saves: 14500, avg_velocity: 18.2, ad_network: 'Mediavine', age_years: 28.1 }];
    }
    return [];
  });

  // Min chars short-circuit executes 0 SQL calls
  const shortRes = await searchMultiEntityAutocomplete(sql, { query: 'm' });
  assert.equal(shortRes.source, 'min_chars');
  assert.equal(calls.length, 0);

  const res = await searchMultiEntityAutocomplete(sql, { query: 'mar', limit: 5 });
  assert.equal(calls.length, 4);
  assert.equal(res.success, true);
  assert.equal(res.counts.keywords, 1);
  assert.equal(res.counts.creators, 1);
  assert.equal(res.counts.folders, 1);
  assert.equal(res.counts.domains, 1);
  assert.equal(res.counts.total, 4);

  // Verify SQL filters & escaping
  const kwCall = calls.find(c => c.query.includes('FROM tracked_keywords'));
  const cpCall = calls.find(c => c.query.includes('FROM competitor_profiles'));
  const kfCall = calls.find(c => c.query.includes('FROM keyword_folders'));
  const domCall = calls.find(c => c.query.includes('FROM domain_intelligence_rollup'));
  assert.ok(kwCall.values.includes('%mar%'));
  assert.match(cpCall.query, /COALESCE\(cp\.account_type, 'competitor'\) <> 'system'/i);
  assert.ok(kfCall.values.includes('default'));
  assert.match(domCall.query, /r\.total_pins > 0 AND r\.domain <> 'Uploaded by user'/i);

  // Legacy compatibility array
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].keyword, 'marry me chicken');
  assert.equal(res.results[0].active_pin_count, 19);

  // @username query skips non-creator tables
  calls.length = 0;
  await searchMultiEntityAutocomplete(sql, { query: '@mar' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].query.includes('FROM competitor_profiles'));
});

test('GET /api/search/autocomplete & /api/keywords/autocomplete handle min_chars, SWR cache, and degraded fallback', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM tracked_keywords')) {
      return [{ id: 1, keyword: 'taco soup', canonical_keyword: 'taco-soup', category: 'Food', is_active: true, target_pin_count: 20, avg_daily_velocity: 12, active_pin_count: 20 }];
    }
    return [];
  });

  const cache = new Map();
  const deps = {
    sql,
    buildCanonicalCacheKey: (ns, obj) => `${ns}:${JSON.stringify(obj)}`,
    getCachedOrFetch: async (key, fn) => {
      if (cache.has(key)) return cache.get(key);
      const val = await fn();
      cache.set(key, val);
      return val;
    },
    clampLimit: (raw, def, max) => Math.max(1, Math.min(Number(raw) || def, max)),
    jsonResponse: (data, status = 200, cacheSeconds = 0) => ({ status, cacheSeconds, body: data })
  };

  // 1. Short query returns min_chars immediately
  const rShort = await handleKeywordsRoutes({
    pathname: '/api/search/autocomplete',
    method: 'GET',
    searchParams: new URLSearchParams('q=t'),
    ...deps
  });
  assert.equal(rShort.status, 200);
  assert.equal(rShort.body.source, 'min_chars');
  assert.equal(calls.length, 0);

  // 2. Normal query caches across /api/search/autocomplete and /api/keywords/autocomplete
  const r1 = await handleKeywordsRoutes({
    pathname: '/api/search/autocomplete',
    method: 'GET',
    searchParams: new URLSearchParams('q=taco&limit=5'),
    ...deps
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.cacheSeconds, 15);
  assert.equal(r1.body.counts.keywords, 1);
  assert.equal(calls.length, 4);

  const r2 = await handleKeywordsRoutes({
    pathname: '/api/keywords/autocomplete',
    method: 'GET',
    searchParams: new URLSearchParams('q=taco&limit=5'),
    ...deps
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.results[0].keyword, 'taco soup');
  assert.equal(calls.length, 4, 'Second hit must reuse SWR cache');

  // 3. Failing SQL degrades gracefully with uncached 200 fallback
  const failDeps = {
    ...deps,
    getCachedOrFetch: async (_k, fn) => fn(),
    sql: () => Promise.reject(new Error('DB down'))
  };
  const rFail = await handleKeywordsRoutes({
    pathname: '/api/search/autocomplete',
    method: 'GET',
    searchParams: new URLSearchParams('q=fail'),
    ...failDeps
  });
  assert.equal(rFail.status, 200);
  assert.equal(rFail.cacheSeconds, 0);
  assert.equal(rFail.body.degraded, true);
});

test('app-sidebar paeCommandPalette enforces URL/SVG/color XSS safety, direct jumps, keyboard wrap-around, and AbortController debounce', async () => {
  const fetchCalls = [];
  const abortedSignals = [];
  const { factory, navLog, sidebarHtml } = makeSidebarVmContext({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, signal: opts?.signal });
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => abortedSignals.push(url));
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          entities: {
            keywords: [{ id: 1, keyword: 'marry me chicken', category: 'Food', avg_daily_velocity: 30, active_pin_count: 20, is_active: true, url: '/keywords/marry-me-chicken' }],
            creators: [{ id: 2, username: 'marthastewart', display_name: 'Martha', avatar_url: 'https://i.pinimg.com/1.jpg', monthly_reach: 100000, total_pins: 500, url: '/marthastewart' }],
            folders: [{ id: 3, name: 'Marketing', description: 'Cluster', color: '#10b981', keyword_count: 4, url: '/folders/3' }],
            domains: [{ domain: 'marthastewart.com', total_pins: 50, total_saves: 1200, ad_network: 'Mediavine', age_years: 20, url: '/domains/marthastewart.com' }]
          }
        })
      };
    }
  });

  // Verify no x-html or x-show on lucide <i> tags
  assert.equal(/x-html=/i.test(sidebarHtml), false);
  assert.equal(/<i[^>]*\bx-show=[^>]*data-lucide=/i.test(sidebarHtml), false);

  const pal = factory();
  pal.$nextTick = (fn) => fn();

  // Security guards
  assert.equal(pal.cmdSafeUrl('/keywords/test'), '/keywords/test');
  assert.equal(pal.cmdSafeUrl('javascript:alert(1)'), '#');
  assert.equal(pal.cmdSafeUrl('data:text/html,xss'), '#');
  assert.equal(pal.cmdSafeUrl('//evil.com/steal'), '#');
  assert.equal(pal.cmdSafeUrl('/\\evil.com'), '#');

  assert.equal(pal.safeAvatarUrl('https://i.pinimg.com/a.jpg'), 'https://i.pinimg.com/a.jpg');
  assert.equal(pal.safeAvatarUrl('javascript:alert(1)'), '');

  assert.equal(pal.safeFolderColor('#10b981'), '#10b981');
  assert.equal(pal.safeFolderColor('red;background:url(x)'), '#6366f1');

  // Direct Pin ID jump
  pal.cmdQuery = '123456789012345';
  const pinSections = pal.groupedCmdSections;
  assert.equal(pinSections[0].key, 'direct');
  assert.equal(pinSections[0].items[0].url, '/pin/123456789012345');

  // Direct Domain jump
  pal.cmdQuery = 'allrecipes.com';
  const domSections = pal.groupedCmdSections;
  assert.equal(domSections[0].key, 'direct');
  assert.equal(domSections[0].items[0].url, '/domains/allrecipes.com');

  // Live fetch + grouping + keyboard navigation wrap-around
  pal.cmdQuery = 'mar';
  pal.onCmdInput();
  await new Promise((r) => setTimeout(r, 230));

  assert.equal(fetchCalls.length, 1);
  assert.equal(pal.cmdTotalMatches, 4);
  const keys = Array.from(pal.groupedCmdSections).map(s => s.key);
  assert.deepEqual(keys, ['keywords', 'creators', 'folders', 'domains', 'fallbacks']);

  const totalFlat = pal.flatCmdItems.length; // 4 matches + 4 fallbacks = 8
  assert.equal(totalFlat, 8);
  assert.equal(pal.cmdActiveIndex, 0);
  pal.moveCmdSelection(-1);
  assert.equal(pal.cmdActiveIndex, 7);
  pal.moveCmdSelection(1);
  assert.equal(pal.cmdActiveIndex, 0);

  // Submit navigates cleanly to active item and clears query
  pal.handleCmdSubmit();
  assert.equal(navLog.at(-1), '/keywords/marry-me-chicken');
  assert.equal(pal.isCommandOpen, false);

  // Esc / closeCmd aborts in-flight controller
  pal.openCmd();
  pal._cmdAbort = new AbortController();
  pal.closeCmd();
  assert.equal(pal._cmdAbort, null);
});

test('Studio pages pre-fill hub search filters cleanly from ?search= URL parameter', async () => {
  // 1. Keywords Studio (/keywords?search=mar)
  const kwHtml = getKeywordsPageHtml();
  const { fn: keywordStudio } = extractStudioFactory(kwHtml, 'keywordStudio', { pathname: '/keywords', search: '?search=mar' });
  const kwApp = keywordStudio();
  kwApp.$watch = () => {};
  kwApp.$nextTick = () => {};
  kwApp.fetchKeywords = async () => {};
  kwApp.fetchFolders = async () => {};
  kwApp.init();
  assert.equal(kwApp.viewModeLevel, 'dashboard');
  assert.equal(kwApp.dashboardSearch, 'mar');

  // 2. Creators Studio (/accounts?search=martha)
  const dashHtml = getDashboardHtml('');
  const { fn: dashboardApp } = extractStudioFactory(dashHtml, 'dashboardApp', { pathname: '/accounts', search: '?search=martha' });
  const dashApp = dashboardApp('');
  dashApp.$watch = () => {};
  dashApp.$nextTick = () => {};
  dashApp.loadFolders = async () => {};
  dashApp.fetchCompetitors = async () => {};
  await dashApp.initDashboard();
  assert.equal(dashApp.currentTab, 'creators_archive');
  assert.equal(dashApp.competitorSearch, 'martha');

  // 3. Campaign Folders Hub (/folders?search=dinner)
  const foldersHtml = getCampaignFoldersPageHtml();
  const { fn: foldersApp } = extractStudioFactory(foldersHtml, 'foldersApp', { pathname: '/folders', search: '?search=dinner' });
  const fApp = foldersApp('');
  fApp.$watch = () => {};
  fApp.$nextTick = () => {};
  fApp.loadFolders = async () => {};
  await fApp.init();
  assert.equal(fApp.folderHubSearch, 'dinner');
  fApp.foldersList = [
    { id: 1, name: 'Dinner Recipes', description: 'Weeknight meals', keywords_preview: [] },
    { id: 2, name: 'Craft Ideas', description: 'DIY paper', keywords_preview: [] },
    { id: 3, name: 'Autumn Collection', description: '', keywords_preview: [{ keyword: 'easy dinner soup' }] }
  ];
  assert.deepEqual(Array.from(fApp.filteredFoldersList).map(f => f.id), [1, 3]);

  // 4. Domains Radar (/domains?search=allrecipes)
  const domainsHtml = getDomainsPageHtml('', '');
  const { fn: domainsApp } = extractStudioFactory(domainsHtml, 'domainsApp', { pathname: '/domains', search: '?search=allrecipes' });
  const dApp = domainsApp('', '');
  dApp.$watch = () => {};
  dApp.$nextTick = () => {};
  dApp.fetchFolders = () => {};
  dApp.fetchPinnedDomains = () => {};
  dApp.loadDomains = () => {};
  dApp.init();
  assert.equal(dApp.searchQuery, 'allrecipes');
});
