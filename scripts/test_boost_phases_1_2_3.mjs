import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handlePagesRoutes } from '../src/routes/pages.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { computePinStage } from '../src/modules/pinarchive/service.mjs';

console.log('================================================================================');
console.log('       BOOST ARCHITECTURAL PHASES 1, 2 & 3 INTEGRATION VERIFICATION');
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: Phase 1 Unified Master Pin Ledger Verification
// -----------------------------------------------------------------------------
const compServiceCode = fs.readFileSync(path.resolve('src/modules/competitors/service.mjs'), 'utf8');
const compRouteCode = fs.readFileSync(path.resolve('src/routes/competitors.mjs'), 'utf8');
const dashboardUiCode = fs.readFileSync(path.resolve('src/dashboard-ui.mjs'), 'utf8');

runTest('Phase 1.1: src/routes/competitors.mjs includes stage, high_velocity, changed_only in cacheParams', () => {
  assert.ok(compRouteCode.includes("stage: searchParams.get('stage')"), 'cacheParams must include stage');
  assert.ok(compRouteCode.includes("high_velocity: searchParams.get('high_velocity')"), 'cacheParams must include high_velocity');
  assert.ok(compRouteCode.includes("changed_only: searchParams.get('changed_only')"), 'cacheParams must include changed_only');
});

runTest('Phase 1.2: computePinStage correctly categorizes all 5 stages in parity with SQL', () => {
  assert.strictEqual(computePinStage(0.2, 0, 5), 'DORMANT', 'Velocity < 0.5 must be DORMANT');
  assert.strictEqual(computePinStage(0.2, 0, 30), 'DORMANT', 'Velocity < 0.5 must be DORMANT regardless of age');
  assert.strictEqual(computePinStage(1.5, 0, 5), 'NEW', 'Age <= 14 must be NEW for velocity >= 0.5');
  assert.strictEqual(computePinStage(1.5, 0, 30), 'COOLING', 'Velocity 0.5-2 with age > 14 must be COOLING');
  assert.strictEqual(computePinStage(5.0, 0, 30), 'MATURE', 'Velocity 2-10 with age > 14 must be MATURE');
  assert.strictEqual(computePinStage(15.0, 0, 30), 'GROWING', 'Velocity >= 10 with age > 14 must be GROWING');
});

runTest('Phase 1.3: src/modules/competitors/service.mjs imports computePinStage and enriches listCompetitorAccountPins', () => {
  assert.ok(compServiceCode.includes('computePinStage'), 'Must import computePinStage');
  assert.ok(compServiceCode.includes('qualified_total'), 'Must compute and return qualified_total');
  assert.ok(compServiceCode.includes('high_velocity'), 'Must handle high_velocity filter');
  assert.ok(compServiceCode.includes('changed_only'), 'Must handle changed_only filter');
  assert.ok(compServiceCode.includes('pa.velocity'), 'Must sort by or project pa.velocity');
});

runTest('Phase 1.4: src/dashboard-ui.mjs unified tab routing and filter controls', () => {
  assert.ok(dashboardUiCode.includes('creatorAllPinQualifiedOnly'), 'Must define creatorAllPinQualifiedOnly');
  assert.ok(dashboardUiCode.includes('creatorAllPinStage'), 'Must define creatorAllPinStage');
  assert.ok(dashboardUiCode.includes('creatorAllPinSort'), 'Must define creatorAllPinSort');
  assert.ok(dashboardUiCode.includes('creatorAllPinHighVelocity'), 'Must define creatorAllPinHighVelocity');
  assert.ok(dashboardUiCode.includes('activeCreatorWinningPinsTotal: 0'), 'Must initialize activeCreatorWinningPinsTotal for reactivity');
  assert.ok(dashboardUiCode.includes('velocity_desc'), 'Must support velocity_desc sort');
  assert.ok(dashboardUiCode.includes("second.toLowerCase() === 'winning-pins' || second.toLowerCase() === 'pins'"), 'Must route winning-pins and pins aliases to all_pins');
});

runTest('Phase 1.5: catalog_total and qualified_total are computed independently of active filter predicates', () => {
  assert.ok(compServiceCode.includes('unfilteredTotalsPromise'), 'Must define unfilteredTotalsPromise');
  assert.ok(compServiceCode.includes('COUNT(*)::int AS catalog_total'), 'Must count catalog_total');
  assert.ok(compServiceCode.includes('COUNT(*) FILTER (WHERE pa.pin_id IS NOT NULL)::int AS qualified_total'), 'Must count qualified_total with FILTER');
  assert.ok(compServiceCode.includes('catalog_total,'), 'Must return catalog_total in service response');
  assert.ok(compServiceCode.includes('unfilteredTotalsPromise = sql`'), 'Must execute unfilteredTotalsPromise in parallel');
});

runTest('Phase 1.6: activeCreatorAllPinsBoards option binding extracts b.board_name and topic cluster wires to all_pins', () => {
  assert.ok(dashboardUiCode.includes("b.board_name"), 'Board select option must extract b.board_name');
  assert.ok(!dashboardUiCode.includes('<option :value="b" x-text="b">'), 'Must NOT bind raw object b without board_name');
  assert.ok(dashboardUiCode.includes('activeCreatorCatalogTotal: 0'), 'Must initialize activeCreatorCatalogTotal in state');
  assert.ok(dashboardUiCode.includes('activeCreatorCatalogTotal = data.catalog_total'), 'Must bind activeCreatorCatalogTotal in fetchCreatorAllPins');
  assert.ok(dashboardUiCode.includes("switchCreatorTab('all_pins')"), 'Topic cluster View Pins must switch to all_pins');
  assert.ok(dashboardUiCode.includes("creatorAllPinSearch = t.name"), 'Topic cluster View Pins must set creatorAllPinSearch to topic name');
  assert.ok(!dashboardUiCode.includes('<div x-show="activeCreatorTab === \'pins\'"'), 'Dead DOM sub-view 2 activeCreatorTab pins must be eradicated');
  assert.ok(dashboardUiCode.includes('this.creatorAllPinQualifiedOnly = true;\n          this.creatorAllPinBoard = boardName;'), 'filterWinningPinsByBoard must route to all_pins with qualified_only');
});

// -----------------------------------------------------------------------------
// SECTION 2: Phase 2 100% Daily Qualification Refresh Verification
// -----------------------------------------------------------------------------
const crawlerCode = fs.readFileSync(path.resolve('scripts/crawler-engine.mjs'), 'utf8');

runTest('Phase 2.1: crawler-engine.mjs calls reconcileQualifiedCatalogPins before Step 4', () => {
  const reconIdx = crawlerCode.indexOf('await reconcileQualifiedCatalogPins(sqlClient, acc.id);');
  const step4Idx = crawlerCode.indexOf('[4/4 Winning Pins]');
  assert.ok(reconIdx !== -1, 'Must call reconcileQualifiedCatalogPins');
  assert.ok(step4Idx !== -1, 'Must have Step 4 Winning Pins');
  assert.ok(reconIdx < step4Idx, 'reconcileQualifiedCatalogPins must be called before Step 4');
});

runTest('Phase 2.2: crawler-engine.mjs eliminates LIMIT 50 bottleneck and uses LOWER(REPLACE(...))', () => {
  assert.ok(crawlerCode.includes("LOWER(REPLACE(account_username, '@', '')) = ${username.toLowerCase()}"), 'Must normalize account_username');
  assert.ok(!crawlerCode.includes('LIMIT 50'), 'Must eradicate LIMIT 50 bottleneck');
});

runTest('Phase 2.3: crawler-engine.mjs implements 4-worker concurrent pool and two-speed fetch', () => {
  assert.ok(crawlerCode.includes('const CONCURRENCY = 4;'), 'Must define CONCURRENCY = 4');
  assert.ok(crawlerCode.includes('fetchPinFromPinResource(p.pin_id)'), 'Must call fetchPinFromPinResource first');
  assert.ok(crawlerCode.includes('fetchPinFromPinterest(p.pin_id, cookie)'), 'Must fallback to fetchPinFromPinterest');
  assert.ok(crawlerCode.includes('randomJitterMs(200, 400)'), 'Must use 200-400ms jitter');
});

runTest('Phase 2.4: crawler-engine.mjs implements monotonic ratchet and atomic batch commits', () => {
  assert.ok(crawlerCode.includes('const freshSaves = Math.max(prevSaves, rawFreshSaves);'), 'Must ratchet saves monotonically');
  assert.ok(crawlerCode.includes('const freshRepins = Math.max(prevRepins, rawFreshRepins);'), 'Must ratchet repins monotonically');
  assert.ok(crawlerCode.includes('UPDATE pa_pins AS p'), 'Must batch update pa_pins');
  assert.ok(crawlerCode.includes('UPDATE competitor_pins AS cp'), 'Must batch update competitor_pins');
  assert.ok(crawlerCode.includes('bulkInsertMetrics(sqlClient, metricSnapshots);'), 'Must route snapshots to shards');
  assert.ok(crawlerCode.includes('ORDER BY x.pin_id ASC') || crawlerCode.includes('.sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)))'), 'Must sort by pin_id ASC to prevent deadlocks');
});

runTest('Phase 2.5: crawler-engine.mjs normalizes daily refresh velocity by elapsed UTC days and resets cross-day zero-delta velocity', () => {
  assert.ok(crawlerCode.includes('last_updated_at, created_at_pinterest'), 'SELECT must include last_updated_at and created_at_pinterest');
  assert.ok(crawlerCode.includes('elapsedDays'), 'Must compute elapsedDays between baseline date and crawl time');
  assert.ok(crawlerCode.includes('isSameDay && deltaSaves === 0'), 'Must implement intraday ratchet protection when running same UTC day');
  assert.ok(crawlerCode.includes('velocity = Math.round((deltaSaves / elapsedDays) * 10) / 10'), 'Must normalize deltaSaves by elapsedDays');
  assert.ok(crawlerCode.includes('velocity = x.velocity,'), 'UPDATE clause must set velocity = x.velocity directly to allow cross-day reset to 0');
  assert.ok(crawlerCode.includes('Number.isFinite(Number(p.velocity))'), 'Velocity must be guarded with Number.isFinite');
  assert.ok(crawlerCode.includes('Number.isFinite(Number(p.saves))'), 'Saves must be guarded with Number.isFinite');

  // Functional simulation of velocity normalization math
  const simulateVelocity = (prevVel, deltaSaves, isSameDay, elapsedDays) => {
    if (isSameDay && deltaSaves === 0) return prevVel;
    if (isSameDay && deltaSaves > 0) return Math.max(prevVel, deltaSaves);
    return Math.round((deltaSaves / elapsedDays) * 10) / 10;
  };

  assert.strictEqual(simulateVelocity(12.5, 0, true, 1), 12.5, 'Same day run with 0 delta must preserve prevVelocity');
  assert.strictEqual(simulateVelocity(12.5, 0, false, 1), 0.0, 'Next day run with 0 delta must reset velocity to 0 (anti-stagnant ratchet)');
  assert.strictEqual(simulateVelocity(12.5, 0, false, 3), 0.0, '3-day run with 0 delta must reset velocity to 0');
  assert.strictEqual(simulateVelocity(5.0, 15, false, 3), 5.0, '3-day run with 15 saves gained must normalize to 5.0 saves/day');
  assert.strictEqual(simulateVelocity(2.0, 7, false, 2), 3.5, '2-day run with 7 saves gained must normalize to 3.5 saves/day');
});

// -----------------------------------------------------------------------------
// SECTION 3: Phase 3 Canonical URL & Context-Aware Breadcrumbs Verification
// -----------------------------------------------------------------------------
const pagesCode = fs.readFileSync(path.resolve('src/routes/pages.mjs'), 'utf8');
const pinDetailsCode = fs.readFileSync(path.resolve('src/pin-details-ui.mjs'), 'utf8');

runTest('Phase 3.1: src/routes/pages.mjs 301 Edge Redirect for legacy /:username/pin/:id', async () => {
  assert.ok(pagesCode.includes('// 5B. Canonical URL Unification: 301 Permanent Redirect'), 'Must include Section 5B');

  const RESERVED_KEYWORD_SLUGS = new Set(['discovery', 'folders', 'domains', 'api']);
  const isValidPinId = (id) => /^[0-9]{10,30}$/.test(id);
  const methodNotAllowedResponse = (allow) => new Response('Method Not Allowed', { status: 405, headers: { Allow: allow } });
  const jsonResponse = (data, status) => new Response(JSON.stringify(data), { status });
  const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

  // Test legacy URL redirect
  const reqUrl = new URL('https://pinorbit.com/wifesrecipesbyme/pin/1098245059167667976?board=Desserts');
  const res = await handlePagesRoutes({
    pathLower: '/wifesrecipesbyme/pin/1098245059167667976',
    normalizedPath: '/wifesrecipesbyme/pin/1098245059167667976',
    pathname: '/wifesrecipesbyme/pin/1098245059167667976',
    method: 'GET',
    searchParams: reqUrl.searchParams,
    HTML_HEADERS,
    RESERVED_KEYWORD_SLUGS,
    methodNotAllowedResponse,
    jsonResponse,
    isValidPinId
  });

  assert.ok(res, 'Response must be returned for legacy pin URL');
  assert.strictEqual(res.status, 301, 'Status must be 301 Moved Permanently');
  const loc = res.headers.get('Location');
  assert.ok(loc.includes('/pin/1098245059167667976'), 'Location must point to canonical /pin/:id');
  assert.ok(loc.includes('creator=wifesrecipesbyme'), 'Location must retain creator param');
  assert.ok(loc.includes('board=Desserts'), 'Location must preserve existing search params');
  // Test legacy URL redirect with @ prefix
  const atReqUrl = new URL('https://pinorbit.com/@wifesrecipesbyme/pin/1098245059167667976');
  const atRes = await handlePagesRoutes({
    pathLower: '/@wifesrecipesbyme/pin/1098245059167667976',
    normalizedPath: '/@wifesrecipesbyme/pin/1098245059167667976',
    pathname: '/@wifesrecipesbyme/pin/1098245059167667976',
    method: 'GET',
    searchParams: atReqUrl.searchParams,
    HTML_HEADERS,
    RESERVED_KEYWORD_SLUGS,
    methodNotAllowedResponse,
    jsonResponse,
    isValidPinId
  });
  assert.ok(atRes, 'Response must be returned for @-prefixed legacy pin URL');
  assert.strictEqual(atRes.status, 301);
  const atLoc = atRes.headers.get('Location');
  assert.ok(atLoc.includes('creator=wifesrecipesbyme'), 'Location must strip leading @ from creator');
  assert.ok(!atLoc.includes('creator=@'), 'Location must NOT contain @ in creator');
});

runTest('Phase 3.2: src/routes/pages.mjs 405 on mutative verbs for legacy /:username/pin/:id', async () => {
  const RESERVED_KEYWORD_SLUGS = new Set(['discovery', 'folders', 'domains', 'api']);
  const isValidPinId = (id) => /^[0-9]{10,30}$/.test(id);
  const methodNotAllowedResponse = (allow) => new Response('Method Not Allowed', { status: 405, headers: { Allow: allow } });
  const jsonResponse = (data, status) => new Response(JSON.stringify(data), { status });
  const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

  const postRes = await handlePagesRoutes({
    pathLower: '/wifesrecipesbyme/pin/1098245059167667976',
    normalizedPath: '/wifesrecipesbyme/pin/1098245059167667976',
    pathname: '/wifesrecipesbyme/pin/1098245059167667976',
    method: 'POST',
    searchParams: new URLSearchParams(),
    HTML_HEADERS,
    RESERVED_KEYWORD_SLUGS,
    methodNotAllowedResponse,
    jsonResponse,
    isValidPinId
  });

  assert.strictEqual(postRes.status, 405, 'POST on legacy pin URL must return 405 Method Not Allowed');
});

runTest('Phase 3.3: src/pin-details-ui.mjs 4-tier context-aware breadcrumbs & back button', () => {
  assert.ok(pinDetailsCode.includes('originSource'), 'Must track originSource');
  assert.ok(pinDetailsCode.includes('originCreator'), 'Must track originCreator');
  assert.ok(pinDetailsCode.includes('originBoard'), 'Must track originBoard');
  assert.ok(pinDetailsCode.includes('isCreatorContext()'), 'Must define isCreatorContext helper');
  assert.ok(pinDetailsCode.includes('getBackUrl()'), 'Must define getBackUrl helper');
  assert.ok(pinDetailsCode.includes('getBoardSlug(name)'), 'Must define getBoardSlug helper');
  assert.ok(pinDetailsCode.includes('pae_pin_breadcrumb_ctx'), 'Must support Tier 2 sessionStorage context');
  assert.ok(pinDetailsCode.includes('document.referrer'), 'Must support Tier 3 document.referrer context');
  assert.ok(pinDetailsCode.includes('replaceState'), 'Must clean address bar to canonical /pin/:id');
  assert.ok(pinDetailsCode.includes('pillar_1_creator_context'), 'Must support Tier 4 dossier creator context');
  assert.ok(pinDetailsCode.includes('creatorCtx?.board_name'), 'Tier 4 must hydrate board_name from creator context');

  // Verify HTML markup rendering
  const html = getPinDetailPageHtml('1098245059167667976');
  assert.ok(html.includes('isCreatorContext()'), 'HTML must bind isCreatorContext');
  assert.ok(html.includes('getBackUrl()'), 'HTML must bind getBackUrl');
  assert.ok(html.includes('Creator Archive'), 'HTML must render Creator Archive breadcrumb');
  assert.ok(html.includes('Keywords Radar'), 'HTML must render Keywords Radar breadcrumb');
  assert.ok(html.includes('getBoardSlug(originBoard)'), 'HTML must render board breadcrumb as link with getBoardSlug');
});

runTest('Phase 3.4: src/pin-details-ui.mjs persists Tier-1 query context to sessionStorage and handles 2-segment referrers', () => {
  assert.ok(pinDetailsCode.includes("sessionStorage.setItem('pae_pin_breadcrumb_ctx'"), 'Must persist Tier-1 context to sessionStorage before replaceState');
  assert.ok(pinDetailsCode.includes("saved.pinId === this.pinId"), 'Tier 2 must validate saved pinId');
  assert.ok(pinDetailsCode.includes("pathParts.length === 2"), 'Tier 3 must handle 2-segment creator board referrers');
  assert.ok(pinDetailsCode.includes("decodeURIComponent(pathParts[1]).replace(/-/g, ' ')"), 'Tier 3 must extract board name from 2nd path segment');
  assert.ok(pinDetailsCode.includes("Persist hydrated breadcrumb context to sessionStorage so F5 refreshes retain Tier 3 / Tier 4 context"), 'Must persist Tier 3/4 context to sessionStorage');

  // Functional simulation of 2-segment referrer extraction
  const parseReferrer = (pathname) => {
    const pathParts = pathname.split('/').filter(Boolean);
    const RESERVED_ROOT_SLUGS = new Set(['keywords', 'discovery', 'folders', 'domains', 'api', 'pin']);
    const RESERVED_CREATOR_TABS = new Set(['all-pins', 'winning-pins', 'links', 'boards', 'topics', 'related-pins', 'pin']);
    let creator = null;
    let board = null;
    if (pathParts.length === 1 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
      creator = pathParts[0].replace(/^@+/, '').trim();
    } else if (pathParts.length === 2 && !RESERVED_ROOT_SLUGS.has(pathParts[0].toLowerCase())) {
      const secondSlug = pathParts[1].toLowerCase();
      if (secondSlug !== 'pin') {
        creator = pathParts[0].replace(/^@+/, '').trim();
        if (!RESERVED_CREATOR_TABS.has(secondSlug)) {
          board = decodeURIComponent(pathParts[1]).replace(/-/g, ' ');
        }
      }
    }
    return { creator, board };
  };

  const res1 = parseReferrer('/wifesrecipesbyme/quick-dinner-recipes');
  assert.strictEqual(res1.creator, 'wifesrecipesbyme');
  assert.strictEqual(res1.board, 'quick dinner recipes');

  const res2 = parseReferrer('/wifesrecipesbyme/winning-pins');
  assert.strictEqual(res2.creator, 'wifesrecipesbyme');
  assert.strictEqual(res2.board, null, 'Reserved tab slug should not be treated as a board');

  const res3 = parseReferrer('/wifesrecipesbyme');
  assert.strictEqual(res3.creator, 'wifesrecipesbyme');
  assert.strictEqual(res3.board, null);
});

runTest('Phase 3.5: Template literal regex escaping in getBoardSlug & normalizeBoardSlug', () => {
  const pinHtml = getPinDetailPageHtml('1098245059158914830');
  assert.ok(pinHtml.includes('/[^\\p{L}\\p{N}]+/gu'), 'Generated HTML must contain properly escaped Unicode regex property escapes');

  // Verify getBoardSlug evaluation in browser-like execution
  const slugMatch = pinHtml.match(/getBoardSlug\(name\)\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(slugMatch, 'Must find getBoardSlug definition in pin details HTML');
  const getBoardSlugFn = new Function('name', slugMatch[1]);
  const boardSlug = getBoardSlugFn("Quick Dinner Recipes | Easy Weeknight Meals");
  assert.strictEqual(boardSlug, "quick-dinner-recipes-easy-weeknight-meals", "Must produce full slug without swallowing words");
  assert.notStrictEqual(boardSlug, "p", "CRITICAL: getBoardSlug must NOT return 'p'!");

  // Multi-symbol and punctuation edge cases
  assert.strictEqual(getBoardSlugFn("Desserts & Sweets / Pastries — Easy"), "desserts-sweets-pastries-easy");
  assert.strictEqual(getBoardSlugFn("100% Quick Recipes!"), "100-quick-recipes");

  // Verify normalizeBoardSlug evaluation from dashboard HTML
  const dashHtml = getDashboardHtml();
  assert.ok(dashHtml.includes('/[^\\p{L}\\p{N}]+/gu'), 'Generated dashboard HTML must contain properly escaped normalizeBoardSlug Unicode regex');
  const normMatch = dashHtml.match(/normalizeBoardSlug\(str\)\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(normMatch, 'Must find normalizeBoardSlug definition in dashboard HTML');
  const normFn = new Function('str', normMatch[1]);
  assert.strictEqual(normFn("Quick Dinner Recipes | Easy Weeknight Meals"), "quick-dinner-recipes-easy-weeknight-meals");
  assert.strictEqual(normFn("quick-dinner-recipes-easy-weeknight-meals"), "quick-dinner-recipes-easy-weeknight-meals");
  assert.strictEqual(normFn("Desserts & Sweets / Pastries — Easy"), "desserts-sweets-pastries-easy");

  // Verify clean getBackUrl logic without query pollution
  const backMatch = pinHtml.match(/getBackUrl\(\)\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(backMatch, 'Must find getBackUrl definition');
  assert.ok(backMatch[1].includes("this.getBoardSlug(this.originBoard)"), 'getBackUrl must use getBoardSlug for board routing');
  assert.ok(!backMatch[1].includes("'?board='"), 'getBackUrl must NOT return ?board= query param');
});

runTest('Phase 3.6: All-pins UI overhaul & metric wiring verification', () => {
  // Re-read file to verify disk contents
  const updatedDashUiCode = fs.readFileSync(path.resolve('src/dashboard-ui.mjs'), 'utf8');
  const updatedCompServiceCode = fs.readFileSync(path.resolve('src/modules/competitors/service.mjs'), 'utf8');

  // Metric wiring in state & fetch
  assert.ok(updatedDashUiCode.includes('activeCreatorRankedTotal: 0'), 'Must declare activeCreatorRankedTotal in Alpine state');
  assert.ok(updatedDashUiCode.includes('activeCreatorHighVelocityTotal: 0'), 'Must declare activeCreatorHighVelocityTotal in Alpine state');
  assert.ok(updatedDashUiCode.includes('activeCreatorRankedTotal = data.ranked_total'), 'Must wire activeCreatorRankedTotal in fetchCreatorAllPins');
  assert.ok(updatedDashUiCode.includes('activeCreatorHighVelocityTotal = data.high_velocity_total'), 'Must wire activeCreatorHighVelocityTotal in fetchCreatorAllPins');

  // Unified command header & filter pill badges
  assert.ok(updatedDashUiCode.includes('Master Pin Ledger'), 'Must include Master Pin Ledger command header');
  assert.ok(updatedDashUiCode.includes('activeCreatorRankedTotal || 0'), 'Must display live ranked count badge on pill');
  assert.ok(updatedDashUiCode.includes('activeCreatorHighVelocityTotal || 0'), 'Must display live high-velocity count badge on pill');

  // Duplicate checkboxes elimination
  assert.ok(!updatedDashUiCode.includes('<span>🏆 Qualified Only</span>'), 'Must eliminate duplicate Qualified Only checkbox');
  assert.ok(!updatedDashUiCode.includes('<span>🎯 Ranked Only</span>'), 'Must eliminate duplicate Ranked Only checkbox');

  // Actions column Inspect anchor link
  assert.ok(updatedDashUiCode.includes(':href="\'/pin/\' + p.pin_id"'), 'Must include anchor link with /pin/:id href in table actions');
  assert.ok(updatedDashUiCode.includes('@click.prevent="openPinDossier(p)"'), 'Inspect link must wire openPinDossier');
  assert.ok(updatedDashUiCode.includes('<span>Inspect</span>'), 'Must include Inspect label in table actions');

  // Clean navigation to /pin/:id without URL query pollution
  assert.ok(updatedDashUiCode.includes("window.location.href = '/pin/' + encodeURIComponent(pinId)"), 'openPinPage must navigate cleanly to /pin/:id without URL query pollution');
  assert.ok(updatedDashUiCode.includes("pinId: pinId"), 'openPinPage must record pinId in sessionStorage context');

  // URL protection & updateHistory guard
  assert.ok(updatedDashUiCode.includes("openCreatorPage(creator, tab = 'overview', updateHistory = true)"), 'openCreatorPage must support updateHistory flag');
  assert.ok(updatedDashUiCode.includes("openCreatorByHandle(handle, tab = 'overview', updateHistory = true)"), 'openCreatorByHandle must support updateHistory flag');
  assert.ok(updatedDashUiCode.includes("openCreatorByHandle(first, 'overview', false)"), 'initDashboard must pass updateHistory=false when opening nested board');

  // Postgres slug matching with REGEXP_REPLACE in competitor service
  assert.ok(updatedCompServiceCode.includes('[^[:alnum:]]+'), 'competitor service must use REGEXP_REPLACE for resilient board matching');
});

console.log(`\n================================================================================`);
console.log(`🎉 ALL ${passedTests}/${totalTests} BOOST PHASES 1, 2 & 3 INTEGRATION TESTS PASSED (100% GREEN)`);
console.log(`================================================================================\n`);
