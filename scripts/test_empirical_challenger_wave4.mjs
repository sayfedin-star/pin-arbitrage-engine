import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import worker from '../src/worker.mjs';
import { handlePagesRoutes } from '../src/routes/pages.mjs';
import { syncCompetitorAcrossFleet } from '../src/modules/fleet/service.mjs';
import { bulkSyncCompetitorPinsToShard } from '../scripts/crawler-engine.mjs';

console.log('================================================================');
console.log('🔥 ADVERSARIAL FORENSIC STRESS TEST: WAVE 4 HARDENING & INTEGRITY');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

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

const asyncTests = [];
function runAsyncTest(name, fn) {
  asyncTests.push({ name, fn });
}

const mockEnv = {
  DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
};

// -------------------------------------------------------------
// SECTION 1: DYNAMIC IMPORT AUTHENTICITY & RESOLUTION
// -------------------------------------------------------------
console.log('[*] Section 1: Dynamic Import Authenticity & Module Exports...');

runTest('1.1: Static imports eliminated from top of src/routes/pages.mjs', () => {
  const pagesCode = fs.readFileSync(path.resolve('src/routes/pages.mjs'), 'utf8');
  assert(!pagesCode.includes("import { getDashboardHtml } from '../dashboard-ui.mjs'"), 'Static import getDashboardHtml must be gone');
  assert(!pagesCode.includes("import { getKeywordsPageHtml } from '../keywords-ui.mjs'"), 'Static import getKeywordsPageHtml must be gone');
  assert(!pagesCode.includes("import { getDiscoveryPageHtml } from '../discovery-ui.mjs'"), 'Static import getDiscoveryPageHtml must be gone');
  assert(!pagesCode.includes("import { getPinDetailPageHtml } from '../pin-details-ui.mjs'"), 'Static import getPinDetailPageHtml must be gone');
  assert(!pagesCode.includes("import { getCampaignFoldersPageHtml } from '../campaign-folders-ui.mjs'"), 'Static import getCampaignFoldersPageHtml must be gone');
  assert(!pagesCode.includes("import { getDomainsPageHtml } from '../domains-ui.mjs'"), 'Static import getDomainsPageHtml must be gone');
});

runAsyncTest('1.2: Dynamic import targets resolve and export real template generators', async () => {
  const dashMod = await import('../src/dashboard-ui.mjs');
  assert.strictEqual(typeof dashMod.getDashboardHtml, 'function');
  const dashHtml = dashMod.getDashboardHtml();
  assert(dashHtml.length > 50000, 'getDashboardHtml should return comprehensive HTML');

  const kwMod = await import('../src/keywords-ui.mjs');
  assert.strictEqual(typeof kwMod.getKeywordsPageHtml, 'function');
  const kwHtml = kwMod.getKeywordsPageHtml();
  assert(kwHtml.length > 50000, 'getKeywordsPageHtml should return comprehensive HTML');

  const discMod = await import('../src/discovery-ui.mjs');
  assert.strictEqual(typeof discMod.getDiscoveryPageHtml, 'function');
  const discHtml = discMod.getDiscoveryPageHtml();
  assert(discHtml.length > 20000, 'getDiscoveryPageHtml should return comprehensive HTML');

  const pinMod = await import('../src/pin-details-ui.mjs');
  assert.strictEqual(typeof pinMod.getPinDetailPageHtml, 'function');
  const pinHtml = pinMod.getPinDetailPageHtml('123456789012');
  assert(pinHtml.length > 20000, 'getPinDetailPageHtml should return comprehensive HTML');

  const folderMod = await import('../src/campaign-folders-ui.mjs');
  assert.strictEqual(typeof folderMod.getCampaignFoldersPageHtml, 'function');
  const folderHtml = folderMod.getCampaignFoldersPageHtml('campaign-123');
  assert(folderHtml.length > 20000, 'getCampaignFoldersPageHtml should return comprehensive HTML');

  const domainMod = await import('../src/domains-ui.mjs');
  assert.strictEqual(typeof domainMod.getDomainsPageHtml, 'function');
  const domainHtml = domainMod.getDomainsPageHtml('etsy.com');
  assert(domainHtml.length > 20000, 'getDomainsPageHtml should return comprehensive HTML');
});

// -------------------------------------------------------------
// SECTION 2: FAST HEAD RESPONSES & SHORT-CIRCUITS
// -------------------------------------------------------------
console.log('\n[*] Section 2: Fast HEAD Responses & Method Tampering...');

const uiEndpoints = [
  '/',
  '/accounts',
  '/keywords',
  '/related-pins',
  '/pins/123456789012345',
  '/folders/test-folder',
  '/domains/example.com'
];

for (const ep of uiEndpoints) {
  runAsyncTest(`2.1: HEAD ${ep} returns 200 with empty body and HTML_HEADERS`, async () => {
    const res = await worker.fetch(new Request(`https://worker.test${ep}`, { method: 'HEAD' }), mockEnv);
    assert.strictEqual(res.status, 200, `HEAD ${ep} must return 200`);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
    const body = await res.text();
    assert.strictEqual(body.length, 0, `HEAD ${ep} body must be empty`);
  });

  runAsyncTest(`2.2: Method tampering on ${ep} (POST/PUT/DELETE) is rejected with 405`, async () => {
    for (const m of ['POST', 'PUT', 'DELETE']) {
      const res = await worker.fetch(new Request(`https://worker.test${ep}`, { method: m }), mockEnv);
      assert.strictEqual(res.status, 405, `${m} ${ep} must return 405 Method Not Allowed`);
    }
  });
}

// -------------------------------------------------------------
// SECTION 3: PIN ID VALIDATION & ROUTING EDGE CASES
// -------------------------------------------------------------
console.log('\n[*] Section 3: Pin ID Validation & Routing Edge Cases...');

runAsyncTest('3.1: Malformed Pin ID on /pins/:id returns 400 Bad Request before dynamic import', async () => {
  const invalidIds = ['abc', '123', 'short', 'undefined', 'null', 'nan', '12345678901234567890123456789012345'];
  for (const badId of invalidIds) {
    const res = await worker.fetch(new Request(`https://worker.test/pins/${badId}`), mockEnv);
    assert.strictEqual(res.status, 400, `Bad pin ID '${badId}' must return 400`);
    const json = await res.json();
    assert.strictEqual(json.error, 'INVALID_PIN_ID');
  }
});

runAsyncTest('3.2: Malformed URI component in folders & domains does not throw URIError', async () => {
  // %E0%A4%A is malformed UTF-8
  const resFolder = await worker.fetch(new Request('https://worker.test/folders/%E0%A4%A'), mockEnv);
  assert.strictEqual(resFolder.status, 200);

  const resDomain = await worker.fetch(new Request('https://worker.test/domains/%E0%A4%A'), mockEnv);
  assert.strictEqual(resDomain.status, 200);
});

runAsyncTest('3.3: Preserved 301 Canonical URL redirect for legacy /:username/pin/:pin_id', async () => {
  const res = await worker.fetch(new Request('https://worker.test/someuser/pin/123456789012345'), mockEnv);
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get('Location'), '/pin/123456789012345?creator=someuser');
});

// -------------------------------------------------------------
// SECTION 4: CENTRAL HUB CREATOR AUTHORITY & LEGACY CLEANUP
// -------------------------------------------------------------
console.log('\n[*] Section 4: Central Hub Creator Authority & Zero Shard Fan-out...');

runAsyncTest('4.1: syncCompetitorAcrossFleet requires valid identifier', async () => {
  const res1 = await syncCompetitorAcrossFleet(null, '');
  assert.strictEqual(res1.ok, false);
  assert.strictEqual(res1.error, 'competitor identifier required');

  const res2 = await syncCompetitorAcrossFleet(null, null);
  assert.strictEqual(res2.ok, false);
});

runAsyncTest('4.2: syncCompetitorAcrossFleet queries only Central Hub and does not fan out to shards', async () => {
  let queriesExecuted = [];
  const mockHubSql = (strings, ...values) => {
    const query = strings.join('?');
    queriesExecuted.push({ query, values });
    if (query.includes('FROM competitor_profiles')) {
      return [{ id: 42, username: 'testcreator' }];
    }
    return [];
  };

  const result = await syncCompetitorAcrossFleet(mockHubSql, 'testcreator');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.username, 'testcreator');
  assert.strictEqual(result.synced_shards, 0);
  assert.strictEqual(result.boards_count, 0);
  assert.strictEqual(result.message, 'Competitors managed exclusively on Central Hub');

  // Verify only 1 query executed on Hub
  assert.strictEqual(queriesExecuted.length, 1);
  assert(queriesExecuted[0].query.includes('FROM competitor_profiles'));
  assert(!queriesExecuted.some(q => q.query.includes('neon_projects_registry')));
  assert(!queriesExecuted.some(q => q.query.includes('competitor_boards')));
  assert(!queriesExecuted.some(q => q.query.includes('pa_pin_metrics')));
});

runAsyncTest('4.3: bulkSyncCompetitorPinsToShard is safe no-op returning 0', async () => {
  const res = await bulkSyncCompetitorPinsToShard(null, null, [{ pin_id: '123' }]);
  assert.strictEqual(res, 0);
});

// -------------------------------------------------------------
// SECTION 5: LITERAL TEST SIGNATURES IN CRAWLER-ENGINE
// -------------------------------------------------------------
console.log('\n[*] Section 5: Literal Test Signatures in scripts/crawler-engine.mjs...');

runTest('5.1: scripts/crawler-engine.mjs preserves literal CONCURRENCY = 4', () => {
  const crawlerCode = fs.readFileSync(path.resolve('scripts/crawler-engine.mjs'), 'utf8');
  assert(crawlerCode.includes('const CONCURRENCY = 4;'), 'Must preserve literal const CONCURRENCY = 4;');
});

runTest('5.2: scripts/crawler-engine.mjs preserves literal batchGroupByShard signatures', () => {
  const crawlerCode = fs.readFileSync(path.resolve('scripts/crawler-engine.mjs'), 'utf8');
  assert(crawlerCode.includes('batchGroupByShard(sortedMetrics, 99)'), 'Must preserve batchGroupByShard(sortedMetrics, 99)');
  assert(crawlerCode.includes('batchGroupByShard(enrichedPins, 99)'), 'Must preserve batchGroupByShard(enrichedPins, 99)');
});

runTest('5.3: scripts/crawler-engine.mjs zero pa_pin_metrics queries', () => {
  const crawlerCode = fs.readFileSync(path.resolve('scripts/crawler-engine.mjs'), 'utf8');
  assert(!crawlerCode.includes('pa_pin_metrics'), 'Must have zero pa_pin_metrics occurrences in crawler-engine.mjs');
});

// -------------------------------------------------------------
// SECTION 6: ACORN AST INTEGRITY AUDIT
// -------------------------------------------------------------
console.log('\n[*] Section 6: Acorn AST Parsing & Syntactic Verification...');

const targets = [
  'src/routes/pages.mjs',
  'src/modules/fleet/service.mjs',
  'scripts/crawler-engine.mjs'
];

for (const t of targets) {
  runTest(`6.1: Acorn parses ${t} with zero syntax errors (ES2024 / Modules)`, () => {
    const code = fs.readFileSync(path.resolve(t), 'utf8');
    acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module'
    });
  });
}

(async () => {
  for (const { name, fn } of asyncTests) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      process.exitCode = 1;
      throw err;
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} WAVE 4 ADVERSARIAL STRESS TESTS PASSED (100% GREEN)`);
  console.log('================================================================\n');
})();
