import assert from 'node:assert';
import worker from '../src/worker.mjs';

async function testRoutes() {
  console.log('Testing Reorganized UI Routes...');
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
  };

  // 1. Root / -> Serves Dashboard with Executive Command Center
  {
    const res = await worker.fetch(new Request('https://worker.test/'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Executive Command Center'), 'Root / should contain Executive Command Center');
    assert(!html.includes('x-show="currentTab === \'keywords\'"'), 'Old keywords tab should be completely deleted');
    console.log('  ✓ [PASS] GET / -> Serves Executive Command Center');
  }

  // 2. /accounts -> Serves Dashboard
  {
    const res = await worker.fetch(new Request('https://worker.test/accounts'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Creator Intelligence & PinArchive'), 'GET /accounts should contain Creator & PinArchive');
    console.log('  ✓ [PASS] GET /accounts -> Serves Creator & PinArchive');
  }

  // 3. /keywords -> Serves dedicated Keywords Fleet Dashboard
  {
    const res = await worker.fetch(new Request('https://worker.test/keywords'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Keywords Fleet Dashboard'), 'GET /keywords should contain Keywords Fleet Dashboard');
    console.log('  ✓ [PASS] GET /keywords -> Serves Keywords Fleet Dashboard');
  }

  // 4. /board-idea (singular) -> Serves Board Ideas Radar Studio
  {
    const res = await worker.fetch(new Request('https://worker.test/board-idea'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Board Ideas Radar'), 'GET /board-idea should contain Board Ideas Radar');
    console.log('  ✓ [PASS] GET /board-idea -> Serves Board Ideas Radar Studio');
  }

  // 5. /board-ideas (plural) -> Serves Board Ideas Radar Studio
  {
    const res = await worker.fetch(new Request('https://worker.test/board-ideas'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Board Ideas Radar'), 'GET /board-ideas should contain Board Ideas Radar');
    console.log('  ✓ [PASS] GET /board-ideas -> Serves Board Ideas Radar Studio');
  }

  // 6. /related-pins -> Serves Related Pins
  {
    const res = await worker.fetch(new Request('https://worker.test/related-pins'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Related Pins Intelligence'), 'GET /related-pins should contain Related Pins');
    console.log('  ✓ [PASS] GET /related-pins -> Serves Related Pins');
  }

  // 7. /Related-Pins (case-insensitive) -> Serves Related Pins
  {
    const res = await worker.fetch(new Request('https://worker.test/Related-Pins'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Related Pins Intelligence'), 'GET /Related-Pins should contain Related Pins');
    console.log('  ✓ [PASS] GET /Related-Pins -> Serves Related Pins');
  }

  // 8. Double-slash robustness (e.g. //accounts, //keywords, //board-idea)
  {
    const resAccounts = await worker.fetch(new Request('https://worker.test//accounts'), mockEnv);
    assert.strictEqual(resAccounts.status, 200);
    const htmlAccounts = await resAccounts.text();
    assert(htmlAccounts.includes('Creator Intelligence & PinArchive'));

    const resKeywords = await worker.fetch(new Request('https://worker.test//keywords'), mockEnv);
    assert.strictEqual(resKeywords.status, 200);
    const htmlKeywords = await resKeywords.text();
    assert(htmlKeywords.includes('Keywords Fleet Dashboard'));

    const resBoard = await worker.fetch(new Request('https://worker.test//board-idea'), mockEnv);
    assert.strictEqual(resBoard.status, 200);
    const htmlBoard = await resBoard.text();
    assert(htmlBoard.includes('Board Ideas Radar'));

    const resRelated = await worker.fetch(new Request('https://worker.test//Related-Pins'), mockEnv);
    assert.strictEqual(resRelated.status, 200);
    const htmlRelated = await resRelated.text();
    assert(htmlRelated.includes('Related Pins Intelligence'));
    console.log('  ✓ [PASS] Double-slash routes (//accounts, //keywords, //board-idea, //Related-Pins) normalized to 200 OK');
  }

  // 9. Method Tampering Immunity (405 Method Not Allowed on mutative verbs)
  {
    const postAccounts = await worker.fetch(new Request('https://worker.test/accounts', { method: 'POST' }), mockEnv);
    assert.strictEqual(postAccounts.status, 405);

    const postBoard = await worker.fetch(new Request('https://worker.test/board-idea', { method: 'POST' }), mockEnv);
    assert.strictEqual(postBoard.status, 405);

    const postKeywords = await worker.fetch(new Request('https://worker.test/keywords', { method: 'POST' }), mockEnv);
    assert.strictEqual(postKeywords.status, 405);
    console.log('  ✓ [PASS] Method tampering on static HTML endpoints rejected with 405 Method Not Allowed');
  }

  console.log('\n[+] ALL UI ROUTE REORGANIZATION VERIFICATION TESTS PASSED (100% GREEN)!');
}

testRoutes().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
