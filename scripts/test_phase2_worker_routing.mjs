/**
 * Test Suite for Phase 2: Worker Routing Disambiguation & API Endpoints
 * 
 * Tests Cloudflare Worker request handler routing for:
 * 1. Disambiguation of reserved keyword slugs vs dynamic keyword slugs
 * 2. HTML template routing:
 *    - /keywords/discovery & /discovery
 *    - /pins/:pin_id & /pin/:pin_id
 *    - /folders & /folders/:id
 *    - /keywords & /keywords/:slug
 * 3. REST API routing and parameter validations:
 *    - /api/pins/:pin_id
 *    - /api/pins/:pin_id/snapshots/:snapshot_id
 *    - /api/discovery/typeahead
 *    - /api/keywords/bulk-import
 *    - /api/folders/:id/raw-visual-crossover
 */

import worker, { RESERVED_KEYWORD_SLUGS } from '../src/worker.mjs';

async function runPhase2Tests() {
  console.log('='.repeat(80));
  console.log('   PHASE 2 WORKER ROUTING & DISAMBIGUATION TEST SUITE');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 0;

  function assert(desc, condition, details = '') {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} - ${details}`);
    }
  }

  // Mock environment (no active live DB queries needed for routing checks)
  const mockEnv = {
    DATABASE_URL: 'postgres://dummy:dummy@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
  };

  // 1. Reserved Keyword Slugs Guard
  console.log('\n[TEST GROUP 1] RESERVED_KEYWORD_SLUGS Set Verification');
  assert(
    'RESERVED_KEYWORD_SLUGS has discovery, folders, export, sync, batch, api, add, manage, import',
    RESERVED_KEYWORD_SLUGS.has('discovery') &&
    RESERVED_KEYWORD_SLUGS.has('folders') &&
    RESERVED_KEYWORD_SLUGS.has('export') &&
    RESERVED_KEYWORD_SLUGS.has('sync') &&
    RESERVED_KEYWORD_SLUGS.has('batch') &&
    RESERVED_KEYWORD_SLUGS.has('api') &&
    RESERVED_KEYWORD_SLUGS.has('add') &&
    RESERVED_KEYWORD_SLUGS.has('manage') &&
    RESERVED_KEYWORD_SLUGS.has('import')
  );

  // 2. HTML Routes Verification
  console.log('\n[TEST GROUP 2] HTML Routing Disambiguation');
  
  // 2.1 /keywords/discovery
  {
    const req = new Request('https://worker.test/keywords/discovery');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /keywords/discovery serves Discovery HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('Discovery & Autocomplete Hub')
    );
  }

  // 2.2 /discovery
  {
    const req = new Request('https://worker.test/discovery');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /discovery serves Discovery HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('Discovery & Autocomplete Hub')
    );
  }

  // 2.3 /pins/:pin_id
  {
    const req = new Request('https://worker.test/pins/1098245059167667976');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /pins/:pin_id serves Dedicated Pin Intelligence HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('1098245059167667976')
    );
  }

  // 2.4 /pin/:pin_id
  {
    const req = new Request('https://worker.test/pin/1098245059167667976');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /pin/:pin_id serves Dedicated Pin Intelligence HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('1098245059167667976')
    );
  }

  // 2.5 /folders
  {
    const req = new Request('https://worker.test/folders');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /folders serves Campaign Folders HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('Campaign Folders & Crossover Studio')
    );
  }

  // 2.6 /folders/:id
  {
    const req = new Request('https://worker.test/folders/42');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /folders/:id serves Campaign Folders HTML with folder context',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes("foldersApp('42')")
    );
  }

  // 2.7 /keywords
  {
    const req = new Request('https://worker.test/keywords');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /keywords serves Keywords Dashboard HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('Keyword Intelligence & Velocity')
    );
  }

  // 2.8 /keywords/sourdough-bread
  {
    const req = new Request('https://worker.test/keywords/sourdough-bread');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /keywords/sourdough-bread serves SERP Radar for dynamic keyword slug',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('sourdough-bread')
    );
  }

  // 2.9 Disambiguation: /keywords/folders should NOT be treated as a keyword slug
  {
    const req = new Request('https://worker.test/keywords/folders');
    const res = await worker.fetch(req, mockEnv);
    const html = await res.text();
    assert(
      'GET /keywords/folders correctly disambiguated to Campaign Folders HTML',
      res.status === 200 && res.headers.get('Content-Type').includes('text/html') && html.includes('Campaign Folders & Crossover Studio')
    );
  }

  // 3. API Routes Validation
  console.log('\n[TEST GROUP 3] API Request Validation & Security Boundaries');

  // 3.1 OPTIONS preflight
  {
    const req = new Request('https://worker.test/api/pins/1098245059167667976', { method: 'OPTIONS' });
    const res = await worker.fetch(req, mockEnv);
    assert(
      'OPTIONS /api/pins/:id returns 204 with CORS headers',
      res.status === 204 && res.headers.get('Access-Control-Allow-Methods').includes('GET')
    );
  }

  // 3.2 DELETE /api/pins/:pin_id/snapshots/:snapshot_id with invalid snapshot_id
  {
    const req = new Request('https://worker.test/api/pins/1098245059167667976/snapshots/invalid_nan', { method: 'DELETE' });
    const res = await worker.fetch(req, mockEnv);
    const data = await res.json();
    assert(
      'DELETE /api/pins/:pin_id/snapshots/invalid_nan rejects with 400',
      res.status === 400 && ((data.error && data.error.includes('BAD_REQUEST')) || (data.message && data.message.includes('snapshot_id')))
    );
  }

  // 3.3 POST /api/keywords/bulk-import with empty body
  {
    const req = new Request('https://worker.test/api/keywords/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const res = await worker.fetch(req, mockEnv);
    const data = await res.json();
    assert(
      'POST /api/keywords/bulk-import without keywords rejects with 400',
      res.status === 400 && ((data.error && data.error.includes('BAD_REQUEST')) || (data.message && data.message.includes('keywords')))
    );
  }

  // 3.4 GET /api/folders/:id/raw-visual-crossover with invalid id
  {
    const req = new Request('https://worker.test/api/folders/not_a_number/raw-visual-crossover');
    const res = await worker.fetch(req, mockEnv);
    const data = await res.json();
    assert(
      'GET /api/folders/not_a_number/raw-visual-crossover rejects with 400',
      res.status === 400 && ((data.error && data.error.includes('BAD_REQUEST')) || (data.message && data.message.includes('folder_id')))
    );
  }

  // 3.5 Unknown endpoint returns 404
  {
    const req = new Request('https://worker.test/api/unknown-non-existent-route');
    const res = await worker.fetch(req, mockEnv);
    const data = await res.json();
    assert(
      'Unknown /api/* route returns 404 JSON',
      res.status === 404 && data.error === 'NOT_FOUND' && data.message.includes('not found')
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 2 AUDIT SCORECARD: ${passed} / ${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('='.repeat(80));

  if (passed === total) {
    console.log('>>> ZERO-DEFECT PHASE 2 SIGN-OFF: ALL ROUTING & ENDPOINT CHECKS PASSED 100%! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> FAILURES DETECTED IN PHASE 2 AUDIT <<<\n');
    process.exit(1);
  }
}

runPhase2Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
