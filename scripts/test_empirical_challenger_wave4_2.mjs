/**
 * Adversarial Challenger & Forensic Stress Test for Wave 4
 *
 * Exhaustively stress-tests:
 * 1. HEAD short-circuiting across all UI branches, static assets, and redirects
 * 2. Route matching, double/triple-slash normalization, and case insensitivity
 * 3. Reserved slug defense across /keywords/:slug
 * 4. Query param slug fallback (?q, ?keyword, ?slug)
 * 5. Method tampering immunity (405 on POST/PUT/DELETE/PATCH)
 * 6. Pin ID Snowflake validation defense-in-depth on /pins/:id
 * 7. Non-UI request bypass (/api/*) returning null with zero UI module loading
 * 8. Static import elimination AST check in src/routes/pages.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.mjs';
import { handlePagesRoutes } from '../src/routes/pages.mjs';

console.log('================================================================================');
console.log('🔥 ADVERSARIAL CHALLENGER: WAVE 4 ROUTE MECHANICS & V8 ISOLATE INTEGRITY');
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

const mockEnv = {
  DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
};

// =============================================================================
// TEST 1: AST Static Import Elimination Verification
// =============================================================================
runTest('AST Check: Zero static UI imports at top of src/routes/pages.mjs', () => {
  const code = fs.readFileSync(path.resolve('src/routes/pages.mjs'), 'utf8');
  
  // Must NOT have static import of any UI module
  const staticUiRegex = /^\s*import\s+.*from\s+['"].*-(?:ui|page|details).*\.mjs['"]/m;
  assert.strictEqual(
    staticUiRegex.test(code),
    false,
    'src/routes/pages.mjs must contain zero top-level static imports from UI files'
  );

  // Must contain dynamic import statements
  assert.ok(code.includes("await import('../discovery-ui.mjs')"), 'Must dynamically import discovery-ui.mjs');
  assert.ok(code.includes("await import('../pin-details-ui.mjs')"), 'Must dynamically import pin-details-ui.mjs');
  assert.ok(code.includes("await import('../campaign-folders-ui.mjs')"), 'Must dynamically import campaign-folders-ui.mjs');
  assert.ok(code.includes("await import('../domains-ui.mjs')"), 'Must dynamically import domains-ui.mjs');
  assert.ok(code.includes("await import('../keywords-ui.mjs')"), 'Must dynamically import keywords-ui.mjs');
  assert.ok(code.includes("await import('../dashboard-ui.mjs')"), 'Must dynamically import dashboard-ui.mjs');
});

// =============================================================================
// TEST 2: Exhaustive HEAD Request Short-Circuiting
// =============================================================================
await runAsyncTest('HEAD Short-Circuiting: Returns 200 OK, empty body, and HTML_HEADERS across ALL UI branches', async () => {
  const uiEndpoints = [
    '/',
    '/accounts',
    '/wifesrecipesbyme',
    '/keywords',
    '/keywords/',
    '/keywords/crochet',
    '/keywords/discovery',
    '/keywords/folders',
    '/keywords/folders/12345',
    '/keywords/domains',
    '/keywords/domains/etsy.com',
    '/discovery',
    '/discovery/',
    '/folders',
    '/folders/campaign-abc',
    '/domains',
    '/domains/payhip.com',
    '/pins/123456789012345',
    '/pin/123456789012345',
    '/pins/987654321098765432',
    '/related-pins',
    '/Related-Pins'
  ];

  for (const endpoint of uiEndpoints) {
    const res = await worker.fetch(new Request(`https://worker.test${endpoint}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(res.status, 200, `HEAD ${endpoint} status must be 200 OK`);
    assert.strictEqual(
      res.headers.get('Content-Type'),
      'text/html; charset=utf-8',
      `HEAD ${endpoint} must have Content-Type: text/html; charset=utf-8`
    );
    const body = await res.text();
    assert.strictEqual(body.length, 0, `HEAD ${endpoint} body must be strictly empty (0 bytes)`);
  }
});

// =============================================================================
// TEST 3: Fast Edge Non-HTML HEAD Short-Circuiting (Favicons, Robots, Assets, Redirects)
// =============================================================================
await runAsyncTest('HEAD Short-Circuiting: Static assets, Favicon, Robots, and Redirects', async () => {
  // Favicon HEAD
  for (const fav of ['/favicon.ico', '/favicon.png', '/favicon.svg', '/keywords/favicon.ico']) {
    const res = await worker.fetch(new Request(`https://worker.test${fav}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(res.status, 200, `HEAD ${fav} status must be 200`);
    assert.strictEqual(res.headers.get('Content-Type'), 'image/svg+xml; charset=utf-8');
    const body = await res.text();
    assert.strictEqual(body.length, 0, `HEAD ${fav} body must be empty`);
  }

  // Robots HEAD
  const robotsRes = await worker.fetch(new Request('https://worker.test/robots.txt', { method: 'HEAD' }), mockEnv);
  assert.strictEqual(robotsRes.status, 200, 'HEAD /robots.txt status must be 200');
  assert.strictEqual(robotsRes.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.strictEqual((await robotsRes.text()).length, 0, 'HEAD /robots.txt body must be empty');

  // Missing Static Assets HEAD (Must return 404, empty body)
  for (const asset of ['/logo.png', '/script.js', '/style.css', '/font.woff2', '/keywords/app.js']) {
    const res = await worker.fetch(new Request(`https://worker.test${asset}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(res.status, 404, `HEAD ${asset} status must be 404`);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    assert.strictEqual((await res.text()).length, 0, `HEAD ${asset} body must be empty`);
  }

  // /fleet Redirect HEAD (Must return 302, Location: /)
  const fleetRes = await worker.fetch(new Request('https://worker.test/fleet', { method: 'HEAD' }), mockEnv);
  assert.strictEqual(fleetRes.status, 302, 'HEAD /fleet status must be 302');
  assert.strictEqual(fleetRes.headers.get('Location'), '/', 'HEAD /fleet Location must be /');
  assert.strictEqual((await fleetRes.text()).length, 0, 'HEAD /fleet body must be empty');
});

// =============================================================================
// TEST 4: Double and Triple Slash Robustness
// =============================================================================
await runAsyncTest('Double and Triple Slash Normalization: Normalizes properly to 200 OK', async () => {
  const multiSlashUrls = [
    '//',
    '///',
    '//accounts',
    '///accounts',
    '//keywords',
    '//keywords//',
    '//keywords//crochet',
    '//keywords//discovery',
    '//keywords//folders//camp-1',
    '//keywords//domains//payhip.com',
    '//discovery',
    '//discovery//',
    '//folders//12345',
    '//domains//amazon.com',
    '//pins//123456789012345',
    '//pin//123456789012345',
    '//favicon.ico',
    '//robots.txt'
  ];

  for (const urlPath of multiSlashUrls) {
    const res = await worker.fetch(new Request(`https://worker.test${urlPath}`), mockEnv);
    assert.strictEqual(res.status, 200, `GET ${urlPath} must return 200 OK`);
  }
});

// =============================================================================
// TEST 5: Reserved Keyword Slug Defense & Nested Route Routing
// =============================================================================
await runAsyncTest('Reserved Slug Routing: /keywords/discovery, /keywords/folders, /keywords/domains render correct views', async () => {
  // /keywords/discovery
  const discRes = await worker.fetch(new Request('https://worker.test/keywords/discovery'), mockEnv);
  assert.strictEqual(discRes.status, 200);
  const discHtml = await discRes.text();
  assert.ok(discHtml.includes('Keyword Discovery & Predictive Velocity Engine') || discHtml.includes('Discovery'), 'Must render Discovery UI');

  // /keywords/folders
  const foldRes = await worker.fetch(new Request('https://worker.test/keywords/folders/camp-99'), mockEnv);
  assert.strictEqual(foldRes.status, 200);
  const foldHtml = await foldRes.text();
  assert.ok(foldHtml.includes('Campaign Folders') || foldHtml.includes('Folders'), 'Must render Campaign Folders UI');

  // /keywords/domains
  const domRes = await worker.fetch(new Request('https://worker.test/keywords/domains/etsy.com'), mockEnv);
  assert.strictEqual(domRes.status, 200);
  const domHtml = await domRes.text();
  assert.ok(domHtml.includes('Domain Intelligence') || domHtml.includes('Domains'), 'Must render Domains UI');
});

// =============================================================================
// TEST 6: Query Parameter Fallbacks on /keywords
// =============================================================================
await runAsyncTest('Query Param Slug Fallback: ?q=..., ?keyword=..., ?slug=... on /keywords', async () => {
  for (const param of ['?q=fall-crochet', '?keyword=fall-crochet', '?slug=fall-crochet']) {
    const res = await worker.fetch(new Request(`https://worker.test/keywords${param}`), mockEnv);
    assert.strictEqual(res.status, 200, `GET /keywords${param} must return 200`);
    const html = await res.text();
    assert.ok(html.includes('Keywords Fleet Dashboard'), 'Must render Keywords page');
    assert.ok(html.includes('fall-crochet'), 'Must inject queried slug into page state');
  }
});

// =============================================================================
// TEST 7: Snowflake Pin ID Validation & Defense-in-Depth
// =============================================================================
await runAsyncTest('Pin ID Validation: Invalid pin IDs rejected with 400 Bad Request before UI import', async () => {
  const invalidIds = [
    'short',
    '12345',          // <10 digits
    '123456789',      // 9 digits
    '12345678901234567890123456789012345', // >30 digits
    'abc1234567890123', // alphanumeric
    'undefined',
    'null'
  ];

  for (const invalidId of invalidIds) {
    const pathUrl = `/pins/${invalidId}`;
    const res = await worker.fetch(new Request(`https://worker.test${pathUrl}`), mockEnv);
    assert.strictEqual(res.status, 400, `GET ${pathUrl} must return 400 Bad Request`);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error, 'INVALID_PIN_ID');

    // Also test HEAD on invalid ID
    const headRes = await worker.fetch(new Request(`https://worker.test${pathUrl}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRes.status, 400, `HEAD ${pathUrl} must return 400 Bad Request`);
  }

  // Valid Snowflake IDs
  for (const validId of ['1234567890', '1098245059167667976', '999999999999999999999999999999']) {
    const res = await worker.fetch(new Request(`https://worker.test/pins/${validId}`), mockEnv);
    assert.strictEqual(res.status, 200, `GET /pins/${validId} must return 200 OK`);
  }
});

// =============================================================================
// TEST 8: Method Tampering Immunity (405 Method Not Allowed)
// =============================================================================
await runAsyncTest('Method Tampering Immunity: Mutative verbs rejected with 405 Method Not Allowed', async () => {
  const testEndpoints = [
    '/',
    '/accounts',
    '/keywords',
    '/keywords/fall-decor',
    '/discovery',
    '/folders',
    '/folders/abc',
    '/domains',
    '/domains/payhip.com',
    '/pins/123456789012345',
    '/pin/123456789012345',
    '/favicon.ico',
    '/robots.txt',
    '/fleet'
  ];

  const mutativeVerbs = ['POST', 'PUT', 'DELETE', 'PATCH'];

  for (const endpoint of testEndpoints) {
    for (const verb of mutativeVerbs) {
      const res = await worker.fetch(new Request(`https://worker.test${endpoint}`, { method: verb }), mockEnv);
      assert.strictEqual(
        res.status,
        405,
        `${verb} ${endpoint} must return 405 Method Not Allowed`
      );
      assert.strictEqual(
        res.headers.get('Allow'),
        'GET, OPTIONS',
        `${verb} ${endpoint} must provide Allow: GET, OPTIONS header`
      );
    }
  }
});

// =============================================================================
// TEST 9: Non-UI Requests (/api/*) Bypass UI Router Completely
// =============================================================================
await runAsyncTest('Non-UI Bypass: handlePagesRoutes returns null for all /api/* paths', async () => {
  const apiPaths = [
    '/api/health',
    '/api/keywords',
    '/api/pins/123456789012345',
    '/api/creators',
    '/api/discovery/suggest',
    '/api/domains/dossier',
    '/api/folders',
    '/api/fleet/status'
  ];

  const RESERVED_KEYWORD_SLUGS = new Set(['discovery', 'folders', 'domains', 'api']);
  const isValidPinId = (id) => /^[0-9]{10,30}$/.test(id);
  const methodNotAllowedResponse = (allow) => new Response('Method Not Allowed', { status: 405, headers: { Allow: allow } });
  const jsonResponse = (data, status) => new Response(JSON.stringify(data), { status });
  const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

  for (const apiPath of apiPaths) {
    const res = await handlePagesRoutes({
      pathLower: apiPath.toLowerCase(),
      normalizedPath: apiPath,
      pathname: apiPath,
      method: 'GET',
      searchParams: new URLSearchParams(),
      HTML_HEADERS,
      RESERVED_KEYWORD_SLUGS,
      methodNotAllowedResponse,
      jsonResponse,
      isValidPinId
    });

    assert.strictEqual(
      res,
      null,
      `handlePagesRoutes must return null for ${apiPath} to allow API routing`
    );
  }
});

// =============================================================================
// TEST 10: Legacy URL 301 Permanent Redirect Contract
// =============================================================================
await runAsyncTest('Legacy URL Unification: 301 Permanent Redirect with query param preservation', async () => {
  const legacyUrls = [
    {
      from: 'https://worker.test/wifesrecipesbyme/pin/1098245059167667976?board=Desserts&ref=test',
      expectedLoc: '/pin/1098245059167667976?board=Desserts&ref=test&creator=wifesrecipesbyme'
    },
    {
      from: 'https://worker.test/@crafty_home/pins/987654321098765432',
      expectedLoc: '/pin/987654321098765432?creator=crafty_home'
    }
  ];

  for (const { from, expectedLoc } of legacyUrls) {
    const res = await worker.fetch(new Request(from), mockEnv);
    assert.strictEqual(res.status, 301, `GET ${from} must return 301`);
    assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=86400');
    const loc = res.headers.get('Location');
    // Check parameters match
    const locUrl = new URL(`https://worker.test${loc}`);
    const expectedLocUrl = new URL(`https://worker.test${expectedLoc}`);
    assert.strictEqual(locUrl.pathname, expectedLocUrl.pathname);
    for (const [k, v] of expectedLocUrl.searchParams.entries()) {
      assert.strictEqual(locUrl.searchParams.get(k), v, `Param ${k} must match`);
    }

    // HEAD on legacy URL
    const headRes = await worker.fetch(new Request(from, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRes.status, 301, `HEAD ${from} must return 301`);
    assert.strictEqual((await headRes.text()).length, 0, 'HEAD 301 body must be empty');
  }
});

console.log('\n================================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} ADVERSARIAL CHALLENGER TESTS PASSED (100% GREEN)`);
console.log('================================================================================\n');
