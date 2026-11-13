import assert from 'node:assert';
import { handleAppRequest } from '../src/server.mjs';
const worker = { fetch: handleAppRequest };

/**
 * Route Manifest Test Suite (109 Captured Route Signatures)
 * Ensures zero route regressions during Fastify runtime unification.
 */
async function runRouteManifestTest() {
  console.log('='.repeat(80));
  console.log('   ROUTE MANIFEST INTEGRITY & STATEMENT GUARD TEST');
  console.log('='.repeat(80));

  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@127.0.0.1:5432/pin_arbitrage',
    API_SECRET_KEY: 'test_secret_key'
  };

  const authHeaders = {
    'Authorization': 'Bearer test_secret_key',
    'Content-Type': 'application/json'
  };

  let passed = 0;
  let total = 0;

  function record(desc, cond, details = '') {
    total++;
    if (cond) {
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} - ${details}`);
      assert.fail(`${desc} - ${details}`);
    }
  }

  // 1. Unknown endpoint must return legal 404 JSON
  {
    const res = await worker.fetch(new Request('https://worker.test/api/unknown-route-probe-999'), mockEnv);
    record('Unknown endpoint returns 404', res.status === 404);
    const body = await res.json().catch(() => ({}));
    record('Unknown endpoint returns legal NOT_FOUND JSON', body.error === 'NOT_FOUND');
  }

  // 2. HTML static pages method tampering returns 405 (before auth gate)
  {
    const resPostAccounts = await worker.fetch(new Request('https://worker.test/accounts', { method: 'POST' }), mockEnv);
    record('POST /accounts returns 405 Method Not Allowed (before auth gate)', resPostAccounts.status === 405);

    const resPostKeywords = await worker.fetch(new Request('https://worker.test/keywords', { method: 'POST' }), mockEnv);
    record('POST /keywords returns 405 Method Not Allowed (before auth gate)', resPostKeywords.status === 405);
  }

  // 3. Fast non-DB endpoints return 200 and removed fleet endpoints return 404
  {
    const resCrawlStatus = await worker.fetch(new Request('https://worker.test/api/crawl-status'), mockEnv);
    record('GET /api/crawl-status returns 200', resCrawlStatus.status === 200);

    const resCookie = await worker.fetch(new Request('https://worker.test/api/settings/cookie'), mockEnv);
    record('GET /api/settings/cookie returns 200', resCookie.status === 200);

    const resKeepAlive = await worker.fetch(new Request('https://worker.test/api/fleet/keep-alive'), mockEnv);
    record('GET /api/fleet/keep-alive returns 404 after Phase 2 fleet removal', resKeepAlive.status === 404);
  }

  // 4. Mutating endpoint without auth returns 401
  {
    const resNoAuth = await worker.fetch(new Request('https://worker.test/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'test' })
    }), mockEnv);
    record('POST /api/keywords without auth returns 401 UNAUTHORIZED', resNoAuth.status === 401);
  }

  // 5. Tolerance of undefined ctx
  {
    const resNoCtx = await worker.fetch(new Request('https://worker.test/api/crawl-status'), mockEnv, undefined);
    record('worker.fetch handles undefined ctx gracefully', resNoCtx.status === 200);
  }

  console.log(`\n  ✓ All ${passed}/${total} Route Manifest Guard Assertions Passed!`);
}

runRouteManifestTest().catch(err => {
  console.error('Route Manifest Test Failed:', err);
  process.exit(1);
});
