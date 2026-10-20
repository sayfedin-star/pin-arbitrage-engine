/**
 * Forensic Verification Test Suite for Package P2:
 * Read Acceleration, Edge Semaphores, Safe UI Client & 48-Field Telemetry Preservation
 *
 * Verifies:
 * 1. Strict Displaced Pin Listings Pagination Clamp (<= 30 pins):
 *    - src/modules/keywords/service.mjs: getKeywordDisplacedPins clamps limit to Math.min(30, Math.max(1, Number(limit) || 24))
 *    - src/routes/keywords.mjs: GET /api/keywords/displaced clamps limit to Math.min(30, Math.max(1, Number(searchParams.get('limit')) || 24))
 *    - [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] tags verified in both files
 * 2. Concurrency Semaphore & Circuit Breaker Timeout for Scatter-Gather:
 *    - src/modules/keywords/service.mjs: hydrateDisplacedIndexFromShards enforces CONCURRENCY_LIMIT = 4 and timeoutMs = 2000
 * 3. Unified Safe API Fetch Client Helper:
 *    - src/edge-shield-client.mjs: safeApiFetch and apiFetch exported and injected on window
 *    - Handles AbortSignal.timeout(15000) default
 *    - Neutralizes Cloudflare 502/504 Bad Gateway / Gateway Timeout HTML responses without JSON syntax errors
 * 4. Frontend UI Mutation Guarding:
 *    - src/dashboard-ui.mjs, src/keywords-ui.mjs, src/pin-details-ui.mjs, src/campaign-folders-ui.mjs:
 *    - All mutation operations (POST/PUT/DELETE) use safeApiFetch with safe error fallbacks
 * 5. 48-Field Telemetry & Affiliate Link Preservation:
 *    - scripts/lib/pinterest.mjs: extractPinFromEmbeddedData preserves utm_link / tracked_link intact
 *    - Detects carousel pins (method: 'carousel', is_carousel: true)
 *    - Guest session audience extraction from closeupUnifiedAttribution into creator_followers and pinner.follower_count
 *    - src/modules/sharding/fleet-router.mjs: syncPinAcrossAllFourPillars preserves is_carousel, utm_link, tracked_link, creator_followers, pinner
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { safeApiFetch, apiFetch, getEdgeShieldClientScript } from '../src/edge-shield-client.mjs';
import { formatPin, extractPinData } from '../scripts/lib/pinterest.mjs';

console.log('================================================================================');
console.log('🛡️  PACKAGE P2: READ ACCELERATION, EDGE SEMAPHORES & SAFE CLIENT AUDIT');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// =============================================================================
// Section 1: Strict Displaced Pin Listings Pagination Clamp (<= 30 pins)
// =============================================================================
console.log('[*] Section 1: Displaced Pin Listings Pagination Clamp (<= 30 pins)...');

const keywordsServiceCode = fs.readFileSync(path.resolve('src/modules/keywords/service.mjs'), 'utf8');
const keywordsRouteCode = fs.readFileSync(path.resolve('src/routes/keywords.mjs'), 'utf8');

runTest('src/modules/keywords/service.mjs: getKeywordDisplacedPins clamps limit <= 30 with [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD]', () => {
  assert(
    keywordsServiceCode.includes('// [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict pagination <= 30 pins per page'),
    'Must include the EDGE-SUBREQUEST-PAGINATION-SHIELD invariant tag in service'
  );
  assert(
    keywordsServiceCode.includes('const lim = Math.min(30, Math.max(1, Number(limit) || 24));'),
    'Must enforce lim clamped between 1 and 30 with default 24'
  );

  // Functional test of clamping logic
  const clampFn = (limit) => Math.min(30, Math.max(1, Number(limit) || 24));
  assert.strictEqual(clampFn(100), 30, 'Limit 100 must be clamped to 30');
  assert.strictEqual(clampFn(50), 30, 'Limit 50 must be clamped to 30');
  assert.strictEqual(clampFn(31), 30, 'Limit 31 must be clamped to 30');
  assert.strictEqual(clampFn(30), 30, 'Limit 30 must remain 30');
  assert.strictEqual(clampFn(24), 24, 'Limit 24 must remain 24');
  assert.strictEqual(clampFn(10), 10, 'Limit 10 must remain 10');
  assert.strictEqual(clampFn(0), 24, 'Limit 0 must default to 24');
  assert.strictEqual(clampFn(-5), 1, 'Negative limit must clamp to 1');
  assert.strictEqual(clampFn('invalid'), 24, 'NaN limit must default to 24');
  assert.strictEqual(clampFn(null), 24, 'null limit must default to 24');
});

runTest('src/routes/keywords.mjs: GET /api/keywords/displaced clamps limit <= 30 with [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD]', () => {
  assert(
    keywordsRouteCode.includes('// [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict <= 30 limit per page'),
    'Must include the EDGE-SUBREQUEST-PAGINATION-SHIELD invariant tag in route'
  );
  assert(
    keywordsRouteCode.includes('const limit = Math.min(30, Math.max(1, Number(searchParams.get(\'limit\')) || 24));'),
    'Must clamp route query parameter limit between 1 and 30'
  );
});

// =============================================================================
// Section 2: Concurrency Semaphore & Circuit Breaker Timeout for Scatter-Gather
// =============================================================================
console.log('\n[*] Section 2: Concurrency Semaphore & Circuit Breaker Timeout for Scatter-Gather...');

runTest('src/modules/keywords/service.mjs: hydrateDisplacedIndexFromShards enforces CONCURRENCY_LIMIT = 4', () => {
  assert(
    keywordsServiceCode.includes('const CONCURRENCY_LIMIT = 4;'),
    'Must define CONCURRENCY_LIMIT = 4'
  );
  assert(
    keywordsServiceCode.includes('// [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING] Chunk shard scatter-gather into groups of <= 4'),
    'Must tag concurrency limiter with EDGE-SUBREQUEST-PAGINATION-SHIELD'
  );
});

runTest('src/modules/keywords/service.mjs: hydrateDisplacedIndexFromShards enforces strict 2000ms timeout', () => {
  assert(
    keywordsServiceCode.includes('timeoutMs: 2000'),
    'Must use timeoutMs: 2000 for fetchUniversalPinDossier in hydrateDisplacedIndexFromShards'
  );
  assert(
    keywordsServiceCode.includes('// [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict 2000ms circuit breaker timeout'),
    'Must tag timeoutMs: 2000 with EDGE-SUBREQUEST-PAGINATION-SHIELD'
  );
});

// =============================================================================
// Section 3: Unified Safe API Fetch Client Helper & Cloudflare Cold-Start Shield
// =============================================================================
console.log('\n[*] Section 3: Unified Safe API Fetch Client Helper & Cloudflare Cold-Start Shield...');

runTest('src/edge-shield-client.mjs: Exports safeApiFetch, apiFetch, and getEdgeShieldClientScript', () => {
  assert.strictEqual(typeof safeApiFetch, 'function', 'safeApiFetch must be an exported function');
  assert.strictEqual(typeof apiFetch, 'function', 'apiFetch must be an exported function');
  assert.strictEqual(safeApiFetch, apiFetch, 'apiFetch must be an alias to safeApiFetch');
  assert.strictEqual(typeof getEdgeShieldClientScript, 'function', 'getEdgeShieldClientScript must be an exported function');

  const script = getEdgeShieldClientScript();
  assert(script.includes('window.safeApiFetch ='), 'Script must attach window.safeApiFetch');
  assert(script.includes('window.apiFetch = window.safeApiFetch'), 'Script must attach window.apiFetch');
  assert(script.includes('AbortSignal.timeout(timeoutMs)') || script.includes('AbortSignal.timeout'), 'Script must enforce timeout default');
});

await runAsyncTest('safeApiFetch: Successfully handles 200 OK responses with JSON body', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, count: 42 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await safeApiFetch('/api/test');
    assert.strictEqual(res.ok, true, 'res.ok must be true');
    assert.strictEqual(res.status, 200, 'res.status must be 200');
    assert.deepStrictEqual(res.data, { success: true, count: 42 }, 'res.data must match payload');
    const json = await res.json();
    assert.deepStrictEqual(json, { success: true, count: 42 }, 'res.json() must return data');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest('safeApiFetch: Neutralizes Cloudflare 502 Bad Gateway HTML cold start without JSON SyntaxError', async () => {
  const originalFetch = globalThis.fetch;
  const cf502Html = `<!DOCTYPE html>
<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>cloudflare</center>
</body>
</html>`;

  try {
    globalThis.fetch = async () => new Response(cf502Html, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });

    const res = await safeApiFetch('/api/test-mutation', { method: 'POST' });
    assert.strictEqual(res.ok, false, 'res.ok must be false for 502');
    assert.strictEqual(res.status, 502, 'res.status must be 502');
    assert.strictEqual(res.data.success, false, 'res.data.success must be false');
    assert(res.data.error.includes('502'), 'res.data.error must describe 502 error');

    // Crucial check: Calling .json() on the response must NOT throw SyntaxError!
    const parsed = await res.json();
    assert.strictEqual(typeof parsed, 'object', 'res.json() must return safe object');
    assert.strictEqual(parsed.success, false, 'res.json().success must be false');
    assert(parsed.error.includes('502'), 'res.json().error must report 502');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest('safeApiFetch: Neutralizes Cloudflare 504 Gateway Timeout HTML cold start without JSON SyntaxError', async () => {
  const originalFetch = globalThis.fetch;
  const cf504Html = `<!DOCTYPE html><html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1></body></html>`;

  try {
    globalThis.fetch = async () => new Response(cf504Html, {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'text/html' }
    });

    const res = await safeApiFetch('/api/test-mutation', { method: 'POST' });
    assert.strictEqual(res.ok, false, 'res.ok must be false for 504');
    assert.strictEqual(res.status, 504, 'res.status must be 504');
    const parsed = await res.json();
    assert.strictEqual(parsed.success, false, 'res.json().success must be false');
    assert(parsed.error.includes('504'), 'res.json().error must report 504');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest('safeApiFetch: Handles network failure / AbortSignal timeout cleanly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    await assert.rejects(
      async () => await safeApiFetch('/api/test-mutation', { method: 'POST' }),
      /Request timed out after/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest('safeApiFetch: Non-JSON 200 OK response sets data.ok=true, data.success=true, and data.error=null (anti-false-error)', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('OK - Batch Processed', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

    const res = await safeApiFetch('/api/test-plain');
    assert.strictEqual(res.ok, true, 'res.ok must be true for 200');
    assert.strictEqual(res.status, 200, 'res.status must be 200');
    assert.strictEqual(res.data.success, true, 'res.data.success must be true');
    assert.strictEqual(res.data.ok, true, 'res.data.ok must be true');
    assert.strictEqual(res.data.error, null, 'res.data.error must be null for 200 OK (no false error)');
    assert.strictEqual(res.data.message, 'OK - Batch Processed', 'res.data.message must contain response text');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest('safeApiFetch: Returns Response wrapper with url, redirected, type, and clone()', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockRes = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    Object.defineProperty(mockRes, 'url', { value: 'https://example.com/api/test' });
    Object.defineProperty(mockRes, 'redirected', { value: false });
    Object.defineProperty(mockRes, 'type', { value: 'basic' });
    globalThis.fetch = async () => mockRes;

    const res = await safeApiFetch('/api/test');
    assert.strictEqual(res.url, 'https://example.com/api/test', 'res.url must be preserved');
    assert.strictEqual(res.redirected, false, 'res.redirected must be preserved');
    assert.strictEqual(res.type, 'basic', 'res.type must be preserved');
    assert.strictEqual(typeof res.clone, 'function', 'res.clone must be a function');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// =============================================================================
// Section 4: Frontend UI Mutation Guarding
// =============================================================================
console.log('\n[*] Section 4: Frontend UI Mutation Guarding...');

const dashboardUiCode = fs.readFileSync(path.resolve('src/dashboard-ui.mjs'), 'utf8');
const keywordsUiCode = fs.readFileSync(path.resolve('src/keywords-ui.mjs'), 'utf8');
const pinDetailsUiCode = fs.readFileSync(path.resolve('src/pin-details-ui.mjs'), 'utf8');
const campaignFoldersUiCode = fs.readFileSync(path.resolve('src/campaign-folders-ui.mjs'), 'utf8');

runTest('src/dashboard-ui.mjs: All mutation endpoints use safeApiFetch', () => {
  const mutationSignatures = [
    '/api/competitors/sync',
    '/api/competitors/fast-refresh',
    '/api/competitors/sync-pins',
    '/api/competitors/audit-sweep',
    '/api/competitors/status',
    '/api/competitors/dispatch-crawl',
    '/api/keywords',
    '/api/fleet/projects',
    '/api/seeds/bulk',
    '/api/workflow/trigger',
    '/api/seeds/bulk-delete',
    '/api/seeds',
    '/api/pinarchive/pin-snapshot',
    '/api/crawl'
  ];

  for (const sig of mutationSignatures) {
    assert(
      dashboardUiCode.includes(sig),
      `dashboard-ui.mjs must reference endpoint ${sig}`
    );
  }

  // Verify that fetch calls targeting mutations are wrapped with (window.safeApiFetch || fetch)
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/seeds\')'),
    'addSeed must use safeApiFetch'
  );
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/seeds/bulk\')'),
    'submitBulkSeeds must use safeApiFetch'
  );
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/seeds/bulk-delete\')'),
    'confirmDelete must use safeApiFetch'
  );
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/workflow/trigger\')'),
    'triggerWorkflowRun must use safeApiFetch'
  );
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/competitors\')'),
    'submitTrackCreatorUnified must use safeApiFetch'
  );
  assert(
    dashboardUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/fleet/projects\')'),
    'submitAddFleetProject must use safeApiFetch'
  );
});

runTest('src/keywords-ui.mjs: All mutation endpoints use safeApiFetch', () => {
  assert(
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/keywords/sync\')'),
    'bulkSyncKeywords / rescanKeyword must use safeApiFetch'
  );
  assert(
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/keywords/status\')'),
    'bulkToggleKeywordStatus must use safeApiFetch'
  );
  assert(
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/keywords\'), {') ||
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/keywords'),
    'bulkDeleteKeywords / addKeyword must use safeApiFetch'
  );
  assert(
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/settings\')'),
    'saveAppSettings must use safeApiFetch'
  );
  assert(
    keywordsUiCode.includes('(window.safeApiFetch || fetch)(this.getApiUrl(\'/api/keywords/dispatch-workflow\')'),
    'triggerWorkflow must use safeApiFetch'
  );
});

runTest('src/pin-details-ui.mjs: Mutation operations and live sync use safeApiFetch', () => {
  assert(
    pinDetailsUiCode.includes('(window.safeApiFetch || fetch)'),
    'pin-details-ui.mjs must use safeApiFetch for deletions'
  );
  assert(
    pinDetailsUiCode.includes('(window.safeApiFetch || fetch)(\'/api/pins/\' + encodeURIComponent(this.pinId) + \'/sync\''),
    'triggerLiveDeepSync must use safeApiFetch'
  );
});

runTest('src/campaign-folders-ui.mjs: Mutation and analysis operations use safeApiFetch', () => {
  assert(
    campaignFoldersUiCode.includes('(window.safeApiFetch || fetch)'),
    'campaign-folders-ui.mjs must use safeApiFetch'
  );
  assert(
    campaignFoldersUiCode.includes('/dispatch-audit'),
    'campaign-folders-ui.mjs must reference dispatch-audit'
  );
  assert(
    campaignFoldersUiCode.includes('/api/folders'),
    'campaign-folders-ui.mjs must reference /api/folders'
  );
  assert(
    campaignFoldersUiCode.includes('(window.safeApiFetch || fetch)(url);'),
    'runCrossoverAnalysis must use safeApiFetch'
  );
  assert(
    campaignFoldersUiCode.includes('(window.safeApiFetch || fetch)(\'/api/folders\');'),
    'loadFolders must use safeApiFetch'
  );
});

// =============================================================================
// Section 5: 48-Field Telemetry & Affiliate Link Preservation
// =============================================================================
console.log('\n[*] Section 5: 48-Field Telemetry & Affiliate Link Preservation...');

const pinterestLibCode = fs.readFileSync(path.resolve('scripts/lib/pinterest.mjs'), 'utf8');
const fleetRouterCode = fs.readFileSync(path.resolve('src/modules/sharding/fleet-router.mjs'), 'utf8');

runTest('scripts/lib/pinterest.mjs: formatPin and extractPinData preserve affiliate/arbitrage tracking links', () => {
  assert(
    pinterestLibCode.includes('// [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links'),
    'Must include 48-FIELD-AFFILIATE-PRESERVATION tag for tracking links'
  );
  assert(
    pinterestLibCode.includes('utm_link: utmLink'),
    'formatPin must return utm_link'
  );
  assert(
    pinterestLibCode.includes('tracked_link: trackedLink'),
    'formatPin must return tracked_link'
  );
});

runTest('scripts/lib/pinterest.mjs: formatPin and extractPinData detect carousel pins', () => {
  assert(
    pinterestLibCode.includes('// [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]'),
    'Must include 48-FIELD-TELEMETRY-CAROUSEL-DETECTION tag for carousel detection'
  );
  assert(
    pinterestLibCode.includes('is_carousel: isCarousel'),
    'Must set is_carousel field'
  );
});

runTest('scripts/lib/pinterest.mjs: formatPin and extractPinData extract guest audience from closeupUnifiedAttribution', () => {
  assert(
    pinterestLibCode.includes('// [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode'),
    'Must include GUEST-AUDIENCE-EXTRACTION tag for guest audience extraction'
  );
  assert(
    pinterestLibCode.includes('pin.closeupUnifiedAttribution?.followerCount'),
    'Must check closeupUnifiedAttribution followerCount'
  );
});

runTest('scripts/lib/pinterest.mjs: formatPin functionally handles carousel, affiliate URLs, and guest audience', () => {
  const mockRawPin = {
    id: '123456789012345678',
    title: 'Top 10 High Yield Affiliate Products',
    description: 'Check out the best products with high conversion rates.',
    link: 'https://myshop.com/deal?utm_source=pinterest&utm_medium=arbitrage&utm_campaign=summer2026&aff_id=9999',
    is_carousel: true,
    carousel_data: [{ id: '1' }, { id: '2' }],
    repin_count: 500,
    save_count: 500,
    reaction_counts: { 1: 50, 2: 25 },
    pinner: {
      username: 'top_creator',
      full_name: 'Top Creator LLC'
    },
    closeupUnifiedAttribution: {
      name: 'Top Creator LLC',
      followerCount: 125000
    }
  };

  const formatted = formatPin(mockRawPin);
  assert(formatted !== null, 'Formatted pin must not be null');
  assert.strictEqual(formatted.pin_id, '123456789012345678');
  assert.strictEqual(formatted.is_carousel, true, 'is_carousel must be true');
  assert.strictEqual(formatted.method, 'carousel', 'method must be carousel');
  assert.strictEqual(
    formatted.utm_link,
    'https://myshop.com/deal?utm_source=pinterest&utm_medium=arbitrage&utm_campaign=summer2026&aff_id=9999',
    'utm_link must preserve all query parameters intact'
  );
  assert.strictEqual(
    formatted.tracked_link,
    'https://myshop.com/deal?utm_source=pinterest&utm_medium=arbitrage&utm_campaign=summer2026&aff_id=9999',
    'tracked_link must preserve all query parameters intact'
  );
  assert.strictEqual(formatted.creator_followers, 125000, 'creator_followers must match closeupUnifiedAttribution follower count');
  assert.strictEqual(formatted.pinner.follower_count, 125000, 'pinner.follower_count must match closeupUnifiedAttribution follower count');
});

runTest('scripts/lib/pinterest.mjs: extractPinData functionally extracts carousel, affiliate links, and guest audience from HTML Relay payload', () => {
  const relayPayload = {
    data: {
      v3GetPinQueryv2: {
        data: {
          id: '998877665544332211',
          entityId: '998877665544332211',
          title: 'Relay Deep Extraction Pin',
          description: 'Testing 48-field telemetry extraction',
          link: 'https://affiliate.example.com/landing?utm_source=pin&utm_medium=cpc&subid=987',
          isCarousel: true,
          carouselData: [{ id: 'c1' }, { id: 'c2' }],
          closeupUnifiedAttribution: {
            name: 'Affiliate Pro',
            followerCount: 88400
          }
        }
      }
    }
  };

  const mockHtml = `<html><head><script>
__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("v3GetPinQueryv2", ${JSON.stringify(relayPayload)});
</script></head><body></body></html>`;

  const extracted = extractPinData(mockHtml, '998877665544332211');
  assert(extracted !== null, 'Extracted pin must not be null');
  assert.strictEqual(extracted.pin_id, '998877665544332211');
  assert.strictEqual(extracted.is_carousel, true, 'is_carousel must be true');
  assert.strictEqual(extracted.method, 'carousel', 'method must be carousel');
  assert(extracted.utm_link.includes('utm_source=pin'), 'utm_link must preserve query parameters');
  assert.strictEqual(extracted.creator_followers, 88400, 'creator_followers must be extracted from closeupUnifiedAttribution');
  assert.strictEqual(extracted.pinner.follower_count, 88400, 'pinner.follower_count must match closeupUnifiedAttribution');
});

runTest('scripts/lib/pinterest.mjs: fetchPinFromPinterest enforces strict unauthenticated guest session', () => {
  assert(
    pinterestLibCode.includes('// [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)'),
    'fetchPinFromPinterest must include STRICT-GUEST-SCRAPING invariant tag'
  );
  assert(
    pinterestLibCode.includes('\'priority\': \'u=0, i\''),
    'Must send modern priority header'
  );
  assert(
    pinterestLibCode.includes('\'upgrade-insecure-requests\': \'1\''),
    'Must send upgrade-insecure-requests header'
  );
  assert(
    pinterestLibCode.includes('\'Accept-Language\': \'en-US,en;q=0.9\'') ||
    pinterestLibCode.includes('Accept-Language'),
    'Must send standard accept-language'
  );
});

runTest('src/modules/sharding/fleet-router.mjs: syncPinAcrossAllFourPillars preserves 48-field telemetry', () => {
  assert(
    fleetRouterCode.includes('// [INVARIANT: 48-FIELD-TELEMETRY-PRESERVATION] Preserve carousel detection, affiliate tracking links, and creator audience'),
    'Must include 48-FIELD-TELEMETRY-PRESERVATION tag in syncPinAcrossAllFourPillars'
  );
  assert(
    fleetRouterCode.includes('is_carousel: isCarousel'),
    'Must store is_carousel in rawMetaToStore'
  );
  assert(
    fleetRouterCode.includes('utm_link: scrapedPin.utm_link || scrapedPin.utmLink || null'),
    'Must store utm_link in rawMetaToStore'
  );
  assert(
    fleetRouterCode.includes('tracked_link: scrapedPin.tracked_link || scrapedPin.trackedLink || null'),
    'Must store tracked_link in rawMetaToStore'
  );
  assert(
    fleetRouterCode.includes('creator_followers: scrapedPin.creator_followers ?? scrapedPin.pinner?.follower_count ?? null'),
    'Must store creator_followers in rawMetaToStore'
  );
});

runTest('scripts/lib/pinterest.mjs: formatPin extracts link, domain, utm_link, tracked_link when destination_url is provided instead of link', () => {
  const pinWithDestUrl = {
    id: '554433221100',
    title: 'Arbitrage Deal Pin',
    destination_url: 'https://monetized-blog.com/post-1?utm_source=pinterest&utm_medium=cpc&aff=abc',
    domain: 'monetized-blog.com'
  };
  const formatted = formatPin(pinWithDestUrl);
  assert(formatted !== null, 'Formatted pin must not be null');
  assert.strictEqual(formatted.domain, 'monetized-blog.com');
  assert.strictEqual(formatted.utm_link, 'https://monetized-blog.com/post-1?utm_source=pinterest&utm_medium=cpc&aff=abc');
  assert.strictEqual(formatted.tracked_link, 'https://monetized-blog.com/post-1?utm_source=pinterest&utm_medium=cpc&aff=abc');
});

runTest('scripts/lib/pinterest.mjs: extractPinData preserves 48-field telemetry when saves=0 and OpenGraph fallback occurs', () => {
  const relayPayload = {
    data: {
      v3GetPinQueryv2: {
        data: {
          id: '112233445566',
          entityId: '112233445566',
          title: 'Relay Pin Title',
          description: 'Relay Description',
          link: 'https://arbitrage.com/deal?utm_source=pin&utm_campaign=arbitrage',
          isCarousel: true,
          carouselData: [{ id: 's1' }, { id: 's2' }],
          closeupUnifiedAttribution: {
            username: 'elite_affiliate',
            fullName: 'Elite Affiliate Inc',
            followerCount: 95000
          }
        }
      }
    }
  };

  const mockHtml = `<html><head>
    <script>__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("v3GetPinQueryv2", ${JSON.stringify(relayPayload)});</script>
    <meta property="og:title" content="OpenGraph Pin Title">
    <meta property="og:description" content="OpenGraph Description">
    <meta name="pinterest:saves" content="42">
    <meta name="pinterest:repins" content="12">
  </head><body></body></html>`;

  const extracted = extractPinData(mockHtml, '112233445566');
  assert(extracted !== null, 'Extracted pin must not be null');
  assert.strictEqual(extracted.saves, 42, 'saves must be updated from OpenGraph');
  assert.strictEqual(extracted.repins, 12, 'repins must be updated from OpenGraph');
  assert.strictEqual(extracted.is_carousel, true, 'is_carousel MUST NOT be overwritten by OpenGraph fallback');
  assert.strictEqual(extracted.method, 'carousel', 'method MUST NOT be overwritten by OpenGraph fallback');
  assert(extracted.utm_link.includes('utm_source=pin'), 'utm_link MUST NOT be wiped by OpenGraph fallback');
  assert.strictEqual(extracted.creator_followers, 95000, 'creator_followers MUST NOT be wiped by OpenGraph fallback');
  assert.strictEqual(extracted.pinner.follower_count, 95000, 'pinner.follower_count MUST NOT be wiped by OpenGraph fallback');
});

runTest('scripts/lib/pinterest.mjs: extractPinData preserves 48-field telemetry when saves=0 and JSON-LD fallback occurs', () => {
  const relayPayload = {
    data: {
      v3GetPinQueryv2: {
        data: {
          id: '778899001122',
          entityId: '778899001122',
          title: 'Relay Title',
          link: 'https://shop.com/product?utm_source=p&aff=99',
          isCarousel: true,
          closeupUnifiedAttribution: {
            followerCount: 34000
          }
        }
      }
    }
  };

  const jsonLd = {
    '@context': 'http://schema.org',
    '@type': 'SocialMediaPosting',
    'headline': 'JSON-LD Title',
    'interactionStatistic': [
      { '@type': 'InteractionCounter', 'interactionType': 'http://schema.org/LikeAction', 'userInteractionCount': 78 }
    ]
  };

  const mockHtml = `<html><head>
    <script>__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("v3GetPinQueryv2", ${JSON.stringify(relayPayload)});</script>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head><body></body></html>`;

  const extracted = extractPinData(mockHtml, '778899001122');
  assert(extracted !== null, 'Extracted pin must not be null');
  assert.strictEqual(extracted.saves, 78, 'saves must be updated from JSON-LD');
  assert.strictEqual(extracted.is_carousel, true, 'is_carousel MUST NOT be overwritten by JSON-LD fallback');
  assert(extracted.utm_link.includes('utm_source=p'), 'utm_link MUST NOT be wiped by JSON-LD fallback');
  assert.strictEqual(extracted.creator_followers, 34000, 'creator_followers MUST NOT be wiped by JSON-LD fallback');
});

runTest('src/modules/sharding/fleet-router.mjs: universal_master_pins update query uses COALESCE on metadata to prevent NULL poisoning', () => {
  assert(
    fleetRouterCode.includes("metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata"),
    'Must use COALESCE on metadata in universal_master_pins update to prevent NULL poisoning'
  );
});

console.log('\n================================================================================');
console.log(`✅ PACKAGE P2 AUDIT COMPLETE: ${passedTests} PASSED | 0 FAILED (Total: ${totalTests})`);
console.log('================================================================================\n');
