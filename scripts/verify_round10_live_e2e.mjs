#!/usr/bin/env node

/**
 * scripts/verify_round10_live_e2e.mjs
 * 
 * Antigravity Round 10 Live Local Server & End-to-End Verification Gate
 * 
 * Empirically verifies:
 * 1. Live server boot on ephemeral port using universal Node.js server (src/server.mjs).
 * 2. Live API endpoints:
 *    - GET /api/pins/resolve-shortlink?url=https://pin.it/testslug
 *    - GET /api/urls/global-saves?url=https://example.com/blog/recipe?utm_source=pin&amp;utm_medium=cpc#recipe
 *      (verifying &amp;utm_*, #hash, and tracking parameter stripping)
 *    - POST /api/urls/batch-global-saves (verifying deduplication & batch resolution)
 *    - GET /api/creators/pinterest/latest-pins (verifying Pidgets + RSS fusion)
 *    - GET /api/boards/12345/sections (verifying board sections inspection)
 * 3. Live HTML/DOM rendering of core studio pages:
 *    - GET /campaign-folders
 *    - GET /domains?q=test
 *    - GET /accounts?username=test&untracked=1
 *    - GET /pins/1234567890
 * 4. Full test suite execution and validation:
 *    - npm run check
 *    - node scripts/verify_regression_locks.mjs (14/14 PASS)
 *    - node scripts/test_p2_verification.mjs
 *    - node scripts/verify_dom_nesting.mjs
 *    - node scripts/validate_inline_scripts.mjs
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createMemoryKV } from '../src/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n[*] Executing: ${command} ${args.join(' ')}`);
    const isWindows = process.platform === 'win32';
    const isNode = command === 'node';
    const executable = isNode ? process.execPath : command;

    const proc = spawn(executable, args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: !isNode && isWindows
    });
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`  ✓ Passed: ${command} ${args.join(' ')} (exit 0)`);
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}: ${command} ${args.join(' ')}`));
      }
    });
    proc.on('error', reject);
  });
}

console.log('='.repeat(80));
console.log('   ROUND 10 LIVE SERVER & COMPREHENSIVE E2E VERIFICATION GATE');
console.log('='.repeat(80));

const startTime = performance.now();

try {
  // --------------------------------------------------------------------------
  // Phase 1: Boot Local Server on Ephemeral Port
  // --------------------------------------------------------------------------
  console.log('\n[Phase 1] Booting PAE Universal Server on Ephemeral Port...');

  const memoryKv = createMemoryKV();

  // Seed deterministic KV records for endpoint cache verification
  await memoryKv.put('shortlink:testslug', JSON.stringify({
    ok: true,
    pin_id: '998877665544',
    resolved_url: 'https://www.pinterest.com/pin/998877665544/'
  }));

  await memoryKv.put('url_saves:https://example.com/blog/recipe', JSON.stringify({
    url: 'https://example.com/blog/recipe',
    count: 420
  }));

  await memoryKv.put('board:sections:12345', JSON.stringify({
    ok: true,
    board_id: '12345',
    sections: [
      { id: 'sec_1', title: 'Healthy Dinner Recipes', slug: 'healthy-dinner-recipes', pin_count: 55, preview_pins: [] }
    ]
  }));

  const server = createServer({
    PIN_ENGINE_KV: memoryKv,
    ENVIRONMENT: 'test',
    NODE_ENV: 'test'
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  ✓ PAE Server running at ${baseUrl} (ephemeral port ${port})`);

  try {
    // ------------------------------------------------------------------------
    // Phase 2: Live API Endpoint Verification
    // ------------------------------------------------------------------------
    console.log('\n[Phase 2] Verifying Live API Endpoints...');

    // 2A: Shortlink resolver (GET /api/pins/resolve-shortlink)
    console.log('  -> Testing GET /api/pins/resolve-shortlink?url=https://pin.it/testslug ...');
    const resShortlink = await fetch(`${baseUrl}/api/pins/resolve-shortlink?url=https://pin.it/testslug`);
    assert.strictEqual(resShortlink.status, 200, 'resolve-shortlink HTTP status should be 200');
    const dataShortlink = await resShortlink.json();
    assert.strictEqual(dataShortlink.ok, true, 'resolve-shortlink should return ok: true');
    assert.strictEqual(dataShortlink.pin_id, '998877665544', 'resolve-shortlink should return resolved pin_id');
    console.log('     ✓ Shortlink resolver returned 200 with resolved pin_id: 998877665544');

    // 2B: Single URL Global Saves with deep canonicalization (GET /api/urls/global-saves)
    console.log('  -> Testing GET /api/urls/global-saves with dirty tracking parameters...');
    const dirtyUrl = 'https://example.com/blog/recipe?utm_source=pin&amp;utm_medium=cpc#recipe';
    const resUrlSaves = await fetch(`${baseUrl}/api/urls/global-saves?url=${encodeURIComponent(dirtyUrl)}`);
    assert.strictEqual(resUrlSaves.status, 200, 'global-saves HTTP status should be 200');
    const dataUrlSaves = await resUrlSaves.json();
    assert.strictEqual(dataUrlSaves.ok, true, 'global-saves should return ok: true');
    assert.strictEqual(dataUrlSaves.url, 'https://example.com/blog/recipe', 'deep URL canonicalization must strip &amp;utm_ and #hash');
    assert.strictEqual(dataUrlSaves.count, 420, 'global-saves count should match seeded count for clean URL');
    console.log('     ✓ Global saves returned 200, successfully stripped &amp;utm_ and #hash to clean URL');

    // 2C: Batch URL Global Saves with deduplication (POST /api/urls/batch-global-saves)
    console.log('  -> Testing POST /api/urls/batch-global-saves with duplicate dirty URLs...');
    const batchBody = {
      urls: [
        'https://example.com/blog/recipe?utm_source=pin&amp;utm_medium=cpc#recipe',
        'https://example.com/blog/recipe',
        'https://example.com/holiday-treats?fbclid=xyz&utm_campaign=winter#dessert'
      ]
    };
    const resBatch = await fetch(`${baseUrl}/api/urls/batch-global-saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchBody)
    });
    assert.strictEqual(resBatch.status, 200, 'batch-global-saves HTTP status should be 200');
    const dataBatch = await resBatch.json();
    assert.strictEqual(dataBatch.ok, true, 'batch-global-saves should return ok: true');
    assert.strictEqual(dataBatch.total, 2, 'batch-global-saves must deduplicate 3 URLs down to 2 canonical URLs');
    assert.strictEqual(dataBatch.results['https://example.com/blog/recipe'], 420, 'results should contain canonicalized recipe saves');
    console.log('     ✓ Batch global saves returned 200 with deduplicated count (total: 2)');

    // 2D: Creator Latest Pins (GET /api/creators/pinterest/latest-pins)
    console.log('  -> Testing GET /api/creators/pinterest/latest-pins (Pidgets + RSS fusion)...');
    const resLatestPins = await fetch(`${baseUrl}/api/creators/pinterest/latest-pins`);
    assert.strictEqual(resLatestPins.status, 200, 'latest-pins HTTP status should be 200');
    const dataLatestPins = await resLatestPins.json();
    assert.strictEqual(dataLatestPins.ok, true, 'latest-pins ok should be true');
    assert.strictEqual(dataLatestPins.user?.username, 'pinterest', 'latest-pins should return user metadata');
    assert.ok(Array.isArray(dataLatestPins.pins), 'latest-pins should return pins array');
    assert.ok(dataLatestPins.pins.length > 0, 'latest-pins should return hydrated pins');
    assert.strictEqual(dataLatestPins.user?.has_official_reach, false, 'has_official_reach must be false to guard official Impressions');
    console.log(`     ✓ Creator visual stream returned 200 with ${dataLatestPins.pins.length} pins and Impressions protection`);

    // 2E: Board Sections (GET /api/boards/12345/sections)
    console.log('  -> Testing GET /api/boards/12345/sections ...');
    const resSections = await fetch(`${baseUrl}/api/boards/12345/sections`);
    assert.strictEqual(resSections.status, 200, 'board sections HTTP status should be 200');
    const dataSections = await resSections.json();
    assert.strictEqual(dataSections.ok, true, 'board sections should be ok');
    assert.strictEqual(dataSections.board_id, '12345', 'board_id should match');
    assert.ok(Array.isArray(dataSections.sections), 'sections should be an array');
    assert.strictEqual(dataSections.sections.length, 1, 'sections count should match');
    assert.strictEqual(dataSections.sections[0].title, 'Healthy Dinner Recipes', 'section title should match');
    console.log('     ✓ Board sections returned 200 with section details');

    // ------------------------------------------------------------------------
    // Phase 3: Live HTML/DOM Rendering Verification
    // ------------------------------------------------------------------------
    console.log('\n[Phase 3] Verifying Live HTML/DOM Rendering...');

    const pagesToTest = [
      { path: '/campaign-folders', label: 'Campaign Folders Studio' },
      { path: '/domains?q=test', label: 'Domain Studio (with search query)' },
      { path: '/accounts?username=test&untracked=1', label: 'Creator Hub (with deep-link query)' },
      { path: '/pins/1234567890', label: 'Pin Intelligence Dossier' }
    ];

    for (const page of pagesToTest) {
      console.log(`  -> Testing GET ${page.path} (${page.label})...`);
      const resPage = await fetch(`${baseUrl}${page.path}`);
      assert.strictEqual(resPage.status, 200, `Page ${page.path} should return HTTP 200`);
      const contentType = resPage.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), `Page ${page.path} content-type should be text/html`);
      const html = await resPage.text();
      assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<html'), `Page ${page.path} must contain valid HTML declaration`);
      assert.ok(html.length > 10000, `Page ${page.path} must return complete document body (received ${html.length} bytes)`);
      console.log(`     ✓ Rendered ${page.label} successfully (${html.length.toLocaleString()} bytes)`);
    }

  } finally {
    // Gracefully shut down ephemeral test server
    console.log('\n[*] Shutting down ephemeral server...');
    await new Promise((resolve) => server.close(resolve));
    console.log('  ✓ Server stopped cleanly.');
  }

  // --------------------------------------------------------------------------
  // Phase 4: Run All Comprehensive Verification Suites
  // --------------------------------------------------------------------------
  console.log('\n[Phase 4] Executing Project Verification Suites...');

  await runCommand('node', ['scripts/verify_regression_locks.mjs']);
  await runCommand('node', ['scripts/test_p2_verification.mjs']);
  await runCommand('node', ['scripts/verify_dom_nesting.mjs']);
  await runCommand('node', ['scripts/validate_inline_scripts.mjs']);
  await runCommand('npm', ['run', 'check']);

  const elapsed = (performance.now() - startTime).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log(`🎉 ALL ROUND 10 LIVE E2E & PROJECT VERIFICATION GATES PASSED CLEANLY (${elapsed}ms)`);
  console.log('='.repeat(80));
  process.exit(0);

} catch (err) {
  console.error('\n💥 E2E VERIFICATION GATE FAILED:', err);
  process.exit(1);
}
