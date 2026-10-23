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
    assert(html.includes('Creator Hub'), 'GET /accounts should contain Creator Hub');
    console.log('  ✓ [PASS] GET /accounts -> Serves Creator Hub');
  }

  // 3. /keywords -> Serves dedicated Keywords Fleet Dashboard
  {
    const res = await worker.fetch(new Request('https://worker.test/keywords'), mockEnv);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Keywords Fleet Dashboard'), 'GET /keywords should contain Keywords Fleet Dashboard');
    console.log('  ✓ [PASS] GET /keywords -> Serves Keywords Fleet Dashboard');
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

  // 8. Double-slash robustness (e.g. //accounts, //keywords, //Related-Pins)
  {
    const resAccounts = await worker.fetch(new Request('https://worker.test//accounts'), mockEnv);
    assert.strictEqual(resAccounts.status, 200);
    const htmlAccounts = await resAccounts.text();
    assert(htmlAccounts.includes('Creator Hub'));

    const resKeywords = await worker.fetch(new Request('https://worker.test//keywords'), mockEnv);
    assert.strictEqual(resKeywords.status, 200);
    const htmlKeywords = await resKeywords.text();
    assert(htmlKeywords.includes('Keywords Fleet Dashboard'));

    const resRelated = await worker.fetch(new Request('https://worker.test//Related-Pins'), mockEnv);
    assert.strictEqual(resRelated.status, 200);
    const htmlRelated = await resRelated.text();
    assert(htmlRelated.includes('Related Pins Intelligence'));
    console.log('  ✓ [PASS] Double-slash routes (//accounts, //keywords, //Related-Pins) normalized to 200 OK');
  }

  // 9. Method Tampering Immunity (405 Method Not Allowed on mutative verbs, 200 on HEAD)
  {
    const postAccounts = await worker.fetch(new Request('https://worker.test/accounts', { method: 'POST' }), mockEnv);
    assert.strictEqual(postAccounts.status, 405);

    const postKeywords = await worker.fetch(new Request('https://worker.test/keywords', { method: 'POST' }), mockEnv);
    assert.strictEqual(postKeywords.status, 405);

    const headRoot = await worker.fetch(new Request('https://worker.test/', { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRoot.status, 200, 'HEAD / must return 200 OK');
    assert.strictEqual(headRoot.headers.get('Content-Type'), 'text/html; charset=utf-8');
    const headRootBody = await headRoot.text();
    assert.strictEqual(headRootBody.length, 0, 'HEAD / body must be empty');

    const headKeywords = await worker.fetch(new Request('https://worker.test/keywords', { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headKeywords.status, 200, 'HEAD /keywords must return 200 OK');
    const headKeywordsBody = await headKeywords.text();
    assert.strictEqual(headKeywordsBody.length, 0, 'HEAD /keywords body must be empty');

    console.log('  ✓ [PASS] Method tampering on static HTML endpoints rejected with 405; HEAD supported with 200 OK');
  }

  // 10. Favicon Interception & Fast Edge Delivery [INVARIANT: FAST-EDGE-FAVICON]
  {
    for (const favPath of ['/favicon.ico', '/favicon.png', '//favicon.ico', '/favicon.svg', '/keywords/favicon.ico', '/pin/favicon.ico']) {
      const res = await worker.fetch(new Request(`https://worker.test${favPath}`), mockEnv);
      assert.strictEqual(res.status, 200, `${favPath} should return 200 OK`);
      assert.strictEqual(res.headers.get('Content-Type'), 'image/svg+xml; charset=utf-8');
      assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
      assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
      const body = await res.text();
      assert(body.includes('<svg') && body.includes('📌'), `${favPath} should return SVG pin icon`);
    }

    const headFav = await worker.fetch(new Request('https://worker.test/favicon.ico', { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headFav.status, 200, 'HEAD /favicon.ico must return 200 OK');
    assert.strictEqual(headFav.headers.get('Content-Type'), 'image/svg+xml; charset=utf-8');
    const headBody = await headFav.text();
    assert.strictEqual(headBody.length, 0, 'HEAD /favicon.ico body must be empty');

    const postFav = await worker.fetch(new Request('https://worker.test/favicon.ico', { method: 'POST' }), mockEnv);
    assert.strictEqual(postFav.status, 405, 'POST /favicon.ico must return 405 Method Not Allowed');
    console.log('  ✓ [PASS] Favicon requests (/favicon.ico, /favicon.png) served instantly with immutable SVG pin');
  }

  // 11. Robots.txt Clean Text Response
  {
    for (const robPath of ['/robots.txt', '/keywords/robots.txt']) {
      const res = await worker.fetch(new Request(`https://worker.test${robPath}`), mockEnv);
      assert.strictEqual(res.status, 200, `${robPath} should return 200 OK`);
      assert.strictEqual(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
      const text = await res.text();
      assert.strictEqual(text, 'User-agent: *\nDisallow: /api/\n');
    }

    const headRobots = await worker.fetch(new Request('https://worker.test/robots.txt', { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headRobots.status, 200, 'HEAD /robots.txt must return 200 OK');
    const headRobotsBody = await headRobots.text();
    assert.strictEqual(headRobotsBody.length, 0, 'HEAD /robots.txt body must be empty');

    const postRobots = await worker.fetch(new Request('https://worker.test/robots.txt', { method: 'POST' }), mockEnv);
    assert.strictEqual(postRobots.status, 405, 'POST /robots.txt must return 405 Method Not Allowed');
    console.log('  ✓ [PASS] GET /robots.txt serves clean robots policy without SSR overhead');
  }

  // 12. Missing Static Assets Trap (Zero Dashboard SSR Fallthrough)
  {
    const staticSamples = [
      '/missing.ico', '/logo.png', '/banner.jpg', '/image.jpeg', '/anim.gif',
      '/vector.svg', '/hero.webp', '/theme.css', '/bundle.js', '/app.js.map',
      '/font.woff', '/font.woff2', '/font.ttf', '/feed.xml', '/readme.txt', '/manifest.json',
      // Nested subpaths that previously fell through into expensive HTML SSR
      '/keywords/bundle.js', '/discovery/app.js', '/domains/icon.png', '/folders/style.css', '/pin/missing.jpg'
    ];

    for (const sample of staticSamples) {
      const res = await worker.fetch(new Request(`https://worker.test${sample}`), mockEnv);
      assert.strictEqual(res.status, 404, `${sample} should return 404`);
      assert.strictEqual(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
      assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=3600');
      assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
      const text = await res.text();
      assert.strictEqual(text, 'Asset Not Found');
      assert(!text.includes('<!DOCTYPE html>'), `${sample} must never return dashboard HTML`);
    }

    const headAsset = await worker.fetch(new Request('https://worker.test/missing.png', { method: 'HEAD' }), mockEnv);
    assert.strictEqual(headAsset.status, 404, 'HEAD /missing.png must return 404');
    const headAssetBody = await headAsset.text();
    assert.strictEqual(headAssetBody.length, 0, 'HEAD /missing.png body must be empty');

    const postAsset = await worker.fetch(new Request('https://worker.test/missing.png', { method: 'POST' }), mockEnv);
    assert.strictEqual(postAsset.status, 405, 'POST to missing asset must return 405');
    console.log('  ✓ [PASS] Missing static assets intercepted with 404 (zero dashboard SSR fallthrough)');
  }

  // 13. HTML_HEADERS Compression & Edge Caching Configuration
  {
    const { HTML_HEADERS } = await import('../src/worker.mjs');
    assert(!HTML_HEADERS['Cache-Control'].includes('no-transform'), 'HTML_HEADERS must NOT contain no-transform');
    assert.strictEqual(
      HTML_HEADERS['Cache-Control'],
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'HTML_HEADERS Cache-Control must match edge-caching directive'
    );
    assert(HTML_HEADERS['Content-Security-Policy'], 'HTML_HEADERS must preserve CSP');
    console.log('  ✓ [PASS] HTML_HEADERS unlocks edge Brotli/Gzip compression and smart caching');
  }

  // 14. Inline SVG Favicons in <head> Across All 6 UI Templates
  {
    const { getDashboardHtml } = await import('../src/dashboard-ui.mjs');
    const { getKeywordsPageHtml } = await import('../src/keywords-ui.mjs');
    const { getDiscoveryPageHtml } = await import('../src/discovery-ui.mjs');
    const { getPinDetailPageHtml } = await import('../src/pin-details-ui.mjs');
    const { getCampaignFoldersPageHtml } = await import('../src/campaign-folders-ui.mjs');
    const { getDomainsPageHtml } = await import('../src/domains-ui.mjs');

    const expectedFaviconTag = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📌</text></svg>">`;

    const templates = [
      { name: 'Dashboard UI', html: getDashboardHtml() },
      { name: 'Keywords UI', html: getKeywordsPageHtml() },
      { name: 'Discovery UI', html: getDiscoveryPageHtml() },
      { name: 'Pin Details UI', html: getPinDetailPageHtml('123456789012345') },
      { name: 'Campaign Folders UI', html: getCampaignFoldersPageHtml() },
      { name: 'Domains UI', html: getDomainsPageHtml() }
    ];

    for (const t of templates) {
      assert(
        t.html.includes(expectedFaviconTag),
        `${t.name} must include inline SVG favicon in <head>`
      );
    }
    console.log('  ✓ [PASS] All 6 UI templates include inline SVG favicon in <head> (0ms network request)');
  }

  // 15. Non-Blocking Hyperdrive Socket Cleanup [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const workerContent = fs.readFileSync(path.resolve('src/worker.mjs'), 'utf8');

    assert(
      workerContent.includes('// [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]'),
      'worker.mjs must contain invariant tag [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]'
    );
    assert(
      workerContent.includes('ctx.waitUntil(closePromise);'),
      'worker.mjs must offload socket teardown to ctx.waitUntil(closePromise)'
    );
    assert(
      !workerContent.includes('await closePromise;'),
      'worker.mjs must NOT contain blocking await closePromise;'
    );
    console.log('  ✓ [PASS] Worker socket cleanup is non-blocking (await closePromise strictly eradicated)');
  }

  // 16. Eliminate Render-Blocking Head Scripts & Ensure Lucide/Alpine Deferral Ordering
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { getDashboardHtml } = await import('../src/dashboard-ui.mjs');
    const { getKeywordsPageHtml } = await import('../src/keywords-ui.mjs');
    const { getDiscoveryPageHtml } = await import('../src/discovery-ui.mjs');
    const { getPinDetailPageHtml } = await import('../src/pin-details-ui.mjs');
    const { getCampaignFoldersPageHtml } = await import('../src/campaign-folders-ui.mjs');
    const { getDomainsPageHtml } = await import('../src/domains-ui.mjs');

    const expectedLucideTag = '<script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js" defer></script>';
    const expectedAlpineTag = '<script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>';

    const templatesWithLucide = [
      { name: 'Dashboard UI', html: getDashboardHtml(), file: 'src/dashboard-ui.mjs' },
      { name: 'Keywords UI', html: getKeywordsPageHtml(), file: 'src/keywords-ui.mjs' },
      { name: 'Domains UI', html: getDomainsPageHtml(), file: 'src/domains-ui.mjs' }
    ];

    for (const t of templatesWithLucide) {
      assert(t.html.includes(expectedLucideTag), `${t.name} must include canonical deferred Lucide script in <head>`);
      const lucideIdx = t.html.indexOf(expectedLucideTag);
      const alpineIdx = t.html.indexOf(expectedAlpineTag);
      assert(alpineIdx > -1, `${t.name} must include deferred Alpine.js script`);
      assert(lucideIdx < alpineIdx, `${t.name} must order Lucide BEFORE Alpine.js so deferred execution is deterministic`);
      
      const fileCode = fs.readFileSync(path.resolve(t.file), 'utf8');
      assert(fileCode.includes('document.readyState'), `${t.name} must include defensive readyState check for icon initialization`);
    }

    const allTemplates = [
      { name: 'Dashboard UI', html: getDashboardHtml() },
      { name: 'Keywords UI', html: getKeywordsPageHtml() },
      { name: 'Discovery UI', html: getDiscoveryPageHtml() },
      { name: 'Pin Details UI', html: getPinDetailPageHtml('123456789012345') },
      { name: 'Campaign Folders UI', html: getCampaignFoldersPageHtml() },
      { name: 'Domains UI', html: getDomainsPageHtml() }
    ];

    for (const t of allTemplates) {
      assert(t.html.includes(expectedAlpineTag), `${t.name} must include deferred Alpine.js`);
      const nonDeferredLucide = /<script\s+src="[^"]*lucide[^"]*"(?![\s\S]*?\bdefer\b)[\s\S]*?>/i.test(t.html);
      assert(!nonDeferredLucide, `${t.name} must not contain any render-blocking Lucide script without defer`);
    }

    console.log('  ✓ [PASS] All UI templates eliminate render-blocking head scripts (Lucide & Alpine strictly deferred)');
  }

  console.log('\n[+] ALL UI ROUTE REORGANIZATION & LATENCY OPTIMIZATION TESTS PASSED (100% GREEN)!');
}

testRoutes().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
