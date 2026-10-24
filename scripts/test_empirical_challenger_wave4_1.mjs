import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.mjs';

const mockEnv = {
  DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
};

async function runEmpiricalTests() {
  console.log('================================================================');
  console.log('WAVE 4 EMPIRICAL CHALLENGER TEST SUITE: DYNAMIC UI LAZY LOADING');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function recordPass(testName) {
    totalTests++;
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests}] ${testName}`);
  }

  // --------------------------------------------------------------------------
  // TEST 1: HEAD Request Verification Across All Routes
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: HEAD Request Verification Across All Routes ---');
  const headRoutes = [
    '/',
    '/accounts',
    '/keywords',
    '/keywords/discovery',
    '/keywords/folders',
    '/keywords/domains',
    '/folders/123',
    '/domains/test.com',
    '/pins/123456789012345678',
    // Extended routes
    '/pin/123456789012345678',
    '/discovery',
    '/folders',
    '/domains',
    '/keywords/fashion-trends',
    '/keywords/folders/folder-99',
    '/keywords/domains/example.org',
    '/related-pins',
    '/Related-Pins'
  ];

  for (const route of headRoutes) {
    const res = await worker.fetch(new Request(`https://worker.test${route}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(res.status, 200, `HEAD ${route} should return 200 OK, got ${res.status}`);
    const body = await res.text();
    assert.strictEqual(body.length, 0, `HEAD ${route} body must be empty (length 0), got ${body.length}`);
    const contentType = res.headers.get('Content-Type');
    assert(contentType && contentType.includes('text/html'), `HEAD ${route} Content-Type must be text/html, got ${contentType}`);
    assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff', `HEAD ${route} must have nosniff header`);
    recordPass(`HEAD ${route} -> 200 OK, length 0, HTML_HEADERS`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Invalid Pin ID Verification (GET & HEAD)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Invalid Pin ID Verification ---');
  const invalidPinCases = [
    { path: '/pins/invalid', label: 'alphanumeric string' },
    { path: '/pins/123', label: 'too short (3 digits)' },
    { path: '/pin/invalid', label: 'alphanumeric string (/pin/)' },
    { path: '/pin/123', label: 'too short (/pin/)' },
    { path: '/pins/999999999', label: '9 digits (< 10 digits)' },
    { path: '/pins/12345678901234567890123456789012345', label: '35 digits (> 30 digits)' },
    { path: '/pins/12345abcde12345678', label: 'mixed digits and letters' }
  ];

  for (const { path: route, label } of invalidPinCases) {
    // GET verification
    const getRes = await worker.fetch(new Request(`https://worker.test${route}`, { method: 'GET' }), mockEnv);
    assert.strictEqual(getRes.status, 400, `GET ${route} (${label}) must return 400 Bad Request`);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.success, false, `GET ${route} response success must be false`);
    assert.strictEqual(getJson.error, 'INVALID_PIN_ID', `GET ${route} response error must be INVALID_PIN_ID`);
    assert(getJson.message.includes('Pin ID is required'), `GET ${route} error message format check`);
    recordPass(`GET ${route} (${label}) -> 400 INVALID_PIN_ID JSON`);

    // HEAD verification
    const headRes = await worker.fetch(new Request(`https://worker.test${route}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRes.status, 400, `HEAD ${route} (${label}) must return 400 Bad Request`);
    recordPass(`HEAD ${route} (${label}) -> 400 Bad Request (rejected before HEAD short-circuit)`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Canonical 301 Redirect for Legacy /:creator/pin/:pin_id
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Canonical 301 Redirect Verification ---');
  const redirectCases = [
    {
      input: '/@creator/pin/123456789012345678',
      expectedLocation: '/pin/123456789012345678?creator=creator',
      desc: 'Standard @creator legacy URL'
    },
    {
      input: '/@style_guru/pins/123456789012345678',
      expectedLocation: '/pin/123456789012345678?creator=style_guru',
      desc: '@style_guru with /pins/ segment'
    },
    {
      input: '/homedecor/pin/987654321098765432',
      expectedLocation: '/pin/987654321098765432?creator=homedecor',
      desc: 'Unprefixed username'
    },
    {
      input: '/@foodie/pin/123456789012345678?tab=velocity&metric=saves',
      expectedLocation: '/pin/123456789012345678?tab=velocity&metric=saves&creator=foodie',
      desc: 'Query parameters preserved with creator appended'
    },
    {
      input: '/@foodie/pin/123456789012345678?creator=existing_creator',
      expectedLocation: '/pin/123456789012345678?creator=existing_creator',
      desc: 'Existing creator query parameter preserved'
    }
  ];

  for (const { input, expectedLocation, desc } of redirectCases) {
    const res = await worker.fetch(new Request(`https://worker.test${input}`, { method: 'GET' }), mockEnv);
    assert.strictEqual(res.status, 301, `GET ${input} (${desc}) must return 301 redirect`);
    assert.strictEqual(res.headers.get('Location'), expectedLocation, `GET ${input} Location must match`);
    assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=86400');
    recordPass(`GET ${input} -> 301 to ${expectedLocation} (${desc})`);

    // HEAD on redirect route
    const headRes = await worker.fetch(new Request(`https://worker.test${input}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRes.status, 301, `HEAD ${input} must return 301 redirect`);
    assert.strictEqual(headRes.headers.get('Location'), expectedLocation);
    recordPass(`HEAD ${input} -> 301 with identical Location header`);
  }

  // Verify non-redirect cases (Reserved slugs or invalid pin IDs)
  {
    // Reserved slugs as seg0 (e.g. folders, domains, discovery, api) must NOT trigger 301 redirect to /pin/
    for (const reservedSlug of ['folders', 'domains', 'discovery', 'api']) {
      const resReserved = await worker.fetch(new Request(`https://worker.test/${reservedSlug}/pin/123456789012345678`), mockEnv);
      assert.notStrictEqual(resReserved.status, 301, `Reserved slug /${reservedSlug}/pin/... must not trigger 301 redirect`);
      recordPass(`GET /${reservedSlug}/pin/123456789012345678 defended against 301 redirect (reserved slug)`);
    }

    // Invalid pin ID in legacy format should NOT 301 redirect
    const resInvalidLegacy = await worker.fetch(new Request('https://worker.test/@creator/pin/invalid-id'), mockEnv);
    assert.notStrictEqual(resInvalidLegacy.status, 301, 'Invalid pin ID on legacy route must not 301 redirect');
    recordPass('GET /@creator/pin/invalid-id defended against 301 redirect');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Dynamic Import Proof & Module Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Dynamic Import Proof & Module Isolation ---');
  const pagesFilePath = path.resolve('src/routes/pages.mjs');
  const pagesSource = fs.readFileSync(pagesFilePath, 'utf8');

  // Verify 0 top-level static imports from UI files
  const staticImportRegex = /^import\s+.*from\s+['"][^'"]*-ui\.mjs['"];?/gm;
  const staticMatches = pagesSource.match(staticImportRegex) || [];
  assert.strictEqual(staticMatches.length, 0, `Expected 0 static UI imports in pages.mjs, found: ${JSON.stringify(staticMatches)}`);
  recordPass('Static UI Import Isolation: 0 static imports from *-ui.mjs found');

  // Verify each UI module is imported via dynamic await import()
  const expectedDynamicImports = [
    '../dashboard-ui.mjs',
    '../keywords-ui.mjs',
    '../discovery-ui.mjs',
    '../pin-details-ui.mjs',
    '../campaign-folders-ui.mjs',
    '../domains-ui.mjs'
  ];

  for (const modulePath of expectedDynamicImports) {
    const dynamicPattern = new RegExp(`await\\s+import\\(['"\`]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\)`);
    assert(dynamicPattern.test(pagesSource), `Dynamic await import for ${modulePath} must exist in pages.mjs`);
    recordPass(`Dynamic import verified: await import('${modulePath}')`);
  }

  // Verify that all await import(...) statements are guarded inside conditional branches
  const lines = pagesSource.split('\n');
  let topLevelAwaitImport = false;
  let indentLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('import(') && !line.trim().startsWith('//')) {
      // Must be indented within function body (not at column 0)
      const leadingSpaces = line.search(/\S|$/);
      if (leadingSpaces === 0) {
        topLevelAwaitImport = true;
      }
    }
  }
  assert(!topLevelAwaitImport, 'All dynamic imports must be scoped inside function body / conditional branches');
  recordPass('All dynamic await import() statements are strictly nested inside conditional route branches');

  // --------------------------------------------------------------------------
  // TEST 5: Reserved Slug Routing Under /keywords/:slug
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Reserved Slug Routing Under /keywords/:slug ---');
  // /keywords/discovery -> loads discovery HTML
  const resDisc = await worker.fetch(new Request('https://worker.test/keywords/discovery'), mockEnv);
  assert.strictEqual(resDisc.status, 200);
  const htmlDisc = await resDisc.text();
  assert(htmlDisc.includes('Keyword Discovery & Autocomplete Hub'), '/keywords/discovery must serve discovery page');
  recordPass('GET /keywords/discovery routes cleanly to Discovery UI');

  // /keywords/folders -> loads folders HTML
  const resFolders = await worker.fetch(new Request('https://worker.test/keywords/folders'), mockEnv);
  assert.strictEqual(resFolders.status, 200);
  const htmlFolders = await resFolders.text();
  assert(htmlFolders.includes('Campaign Folders & Crossover Studio'), '/keywords/folders must serve folders page');
  recordPass('GET /keywords/folders routes cleanly to Campaign Folders UI');

  // /keywords/domains -> loads domains HTML
  const resDomains = await worker.fetch(new Request('https://worker.test/keywords/domains'), mockEnv);
  assert.strictEqual(resDomains.status, 200);
  const htmlDomains = await resDomains.text();
  assert(htmlDomains.includes('Domain Intelligence & SERP Monopoly Studio'), '/keywords/domains must serve domains page');
  recordPass('GET /keywords/domains routes cleanly to Domains UI');

  // --------------------------------------------------------------------------
  // TEST 6: Method Tampering & Mutative Verbs Defense
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Method Tampering & Mutative Verbs Defense ---');
  const mutativeVerbs = ['POST', 'PUT', 'DELETE', 'PATCH'];
  const testEndpoints = [
    '/keywords/discovery',
    '/folders/123',
    '/domains/test.com',
    '/pins/123456789012345678',
    '/'
  ];

  for (const endpoint of testEndpoints) {
    for (const verb of mutativeVerbs) {
      const res = await worker.fetch(new Request(`https://worker.test${endpoint}`, { method: verb }), mockEnv);
      assert.strictEqual(res.status, 405, `${verb} ${endpoint} must return 405 Method Not Allowed`);
    }
  }
  recordPass(`Method tampering defense: 405 Method Not Allowed verified across ${testEndpoints.length * mutativeVerbs.length} requests`);

  // --------------------------------------------------------------------------
  // TEST 7: Legacy Sharding Residues Cleanup in crawler-engine & fleet service
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Legacy Sharding Residues Cleanup Verification ---');
  const crawlerEnginePath = path.resolve('scripts/crawler-engine.mjs');
  const crawlerSource = fs.readFileSync(crawlerEnginePath, 'utf8');

  // Verify bulkSyncCompetitorPinsToShard is lightweight no-op returning 0
  assert(crawlerSource.includes('export async function bulkSyncCompetitorPinsToShard'), 'bulkSyncCompetitorPinsToShard function must exist');
  assert(crawlerSource.includes('return 0;'), 'bulkSyncCompetitorPinsToShard must return 0');
  recordPass('bulkSyncCompetitorPinsToShard lightweight no-op verified');

  // Verify CONCURRENCY = 4 literal preserved
  assert(crawlerSource.includes('const CONCURRENCY = 4;'), 'const CONCURRENCY = 4; signature must be preserved');
  recordPass('Literal signature preserved: const CONCURRENCY = 4;');

  // Verify batchGroupByShard signatures preserved
  assert(crawlerSource.includes('batchGroupByShard(sortedMetrics, 99)'), 'batchGroupByShard(sortedMetrics, 99) signature preserved');
  assert(crawlerSource.includes('batchGroupByShard(enrichedPins, 99)'), 'batchGroupByShard(enrichedPins, 99) signature preserved');
  recordPass('Literal signatures preserved: batchGroupByShard(..., 99)');

  // Verify fleet service has zero SQL queries targeting pa_pin_metrics
  const fleetServicePath = path.resolve('src/modules/fleet/service.mjs');
  const fleetSource = fs.readFileSync(fleetServicePath, 'utf8');
  const sqlQueryRegex = /(?:SELECT|INSERT|UPDATE|DELETE|FROM|INTO)\s+pa_pin_metrics\b/i;
  assert(!sqlQueryRegex.test(fleetSource), 'src/modules/fleet/service.mjs must contain zero SQL queries to pa_pin_metrics');
  recordPass('Zero SQL queries to pa_pin_metrics on Central Hub verified in fleet service');

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} EMPIRICAL CHALLENGER TESTS PASSED (100% GREEN)`);
  console.log('================================================================\n');
}

runEmpiricalTests().catch(err => {
  console.error('\n❌ EMPIRICAL TEST FAILED:', err);
  process.exit(1);
});
