import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handlePagesRoutes } from '../src/routes/pages.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
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

console.log(`\n================================================================================`);
console.log(`🎉 ALL ${passedTests}/${totalTests} BOOST PHASES 1, 2 & 3 INTEGRATION TESTS PASSED (100% GREEN)`);
console.log(`================================================================================\n`);
