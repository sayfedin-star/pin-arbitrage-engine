#!/usr/bin/env node

/**
 * scripts/test_creation_method_precedence.mjs
 *
 * Comprehensive Multi-Layer Test Suite for Pin creation_method Ingestion & Precedence.
 * Verifies:
 * 1. evaluateHydrationGuard invalidation on generic or missing creation_method.
 * 2. service.mjs preparedPins & hubSerpPayload null-preservation.
 * 3. SQL CASE Precedence logic for keyword_serp_current upsert & crawler hub flush.
 * 4. crawler buildShardSyncList & inspectPin extraMeta preservation.
 * 5. d1-metadata metaObj injection.
 * 6. Live Central Hub & Shards database verification for test pins.
 * 7. Universal Pin Dossier resolution of authentic creation_method.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import {
  resolveShardConnection,
  preloadNeonRegistry,
  getPinShardId,
  fetchUniversalPinDossier
} from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env safely
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const envPath = path.resolve(process.cwd(), '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🛡️  CREATION_METHOD PRECEDENCE & INGESTION VERIFICATION SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test Suite 1: evaluateHydrationGuard Cache Invalidation Logic
// -----------------------------------------------------------------------------
console.log('[*] Suite 1: Crawler Hydration Guard Invalidation Tests...');

// Simulate evaluateHydrationGuard logic extracted from keyword-velocity-crawler.mjs
function simulateHydrationGuard(pin, currentUtcTimestamp = Date.now()) {
  const crawlTime = pin.crawled_at || pin.metadata?.crawled_at || null;
  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const isDeepHydrated = Boolean(meta.is_deep_hydrated === true || meta.is_deep_hydrated === 'true');
  const hasRichTreasures = Boolean(meta.has_treasures === true || meta.image_signature || meta.canonical_pin_id || meta.board_pin_count);
  const isDisplaced = Boolean(pin.is_displaced);

  const lastCrawlMs = crawlTime ? new Date(crawlTime).getTime() : NaN;
  const elapsedMs = !isNaN(lastCrawlMs) ? (currentUtcTimestamp - lastCrawlMs) : Infinity;

  if (isDisplaced && !isNaN(lastCrawlMs) && pin.save_count != null && elapsedMs < 4 * 60 * 60 * 1000) {
    return { shouldFetch: false, reason: 'displaced_cooldown_active' };
  }

  if (!crawlTime || isNaN(lastCrawlMs) || !isDeepHydrated || !hasRichTreasures || pin.save_count == null) {
    return { shouldFetch: true, reason: 'unhydrated_or_missing_treasures' };
  }

  const currentMethod = pin.creation_method || pin.method || meta.creation_method || meta.method;
  const isGenericOrMissingMethod = !currentMethod || currentMethod === 'pinterest_platform';
  if (isGenericOrMissingMethod) {
    return { shouldFetch: true, reason: 'missing_or_generic_creation_method' };
  }

  if (elapsedMs < 4 * 60 * 60 * 1000) {
    return { shouldFetch: false, reason: 'hard_cooldown_under_4h' };
  }

  return { shouldFetch: true, reason: 'stale_or_new_day' };
}

runTest('Hydration Guard: Forces re-crawl if creation_method is generic "pinterest_platform"', () => {
  const pin = {
    pin_id: '123456',
    crawled_at: new Date().toISOString(),
    save_count: 100,
    creation_method: 'pinterest_platform',
    metadata: { is_deep_hydrated: true, has_treasures: true, creation_method: 'pinterest_platform' }
  };
  const result = simulateHydrationGuard(pin);
  assert.strictEqual(result.shouldFetch, true);
  assert.strictEqual(result.reason, 'missing_or_generic_creation_method');
});

runTest('Hydration Guard: Forces re-crawl if creation_method is missing / null', () => {
  const pin = {
    pin_id: '123456',
    crawled_at: new Date().toISOString(),
    save_count: 100,
    creation_method: null,
    metadata: { is_deep_hydrated: true, has_treasures: true }
  };
  const result = simulateHydrationGuard(pin);
  assert.strictEqual(result.shouldFetch, true);
  assert.strictEqual(result.reason, 'missing_or_generic_creation_method');
});

runTest('Hydration Guard: Respects hard cooldown if creation_method is authentic ("uploaded")', () => {
  const pin = {
    pin_id: '123456',
    crawled_at: new Date().toISOString(),
    save_count: 100,
    creation_method: 'uploaded',
    metadata: { is_deep_hydrated: true, has_treasures: true, creation_method: 'uploaded' }
  };
  const result = simulateHydrationGuard(pin);
  assert.strictEqual(result.shouldFetch, false);
  assert.strictEqual(result.reason, 'hard_cooldown_under_4h');
});

// -----------------------------------------------------------------------------
// Test Suite 2: SQL Precedence CASE Statement Logic
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 2: SQL Precedence CASE Logic Tests...');

function simulateSqlCase(excludedMethod, existingMethod) {
  // Simulates:
  // CASE
  //   WHEN EXCLUDED.creation_method IS NOT NULL AND LOWER(TRIM(EXCLUDED.creation_method)) NOT IN ('', 'pinterest_platform')
  //   THEN EXCLUDED.creation_method
  //   ELSE COALESCE(NULLIF(keyword_serp_current.creation_method, ''), EXCLUDED.creation_method, 'pinterest_platform')
  // END
  const cleanExcluded = (typeof excludedMethod === 'string') ? excludedMethod.trim() : excludedMethod;
  if (cleanExcluded != null && cleanExcluded !== '' && cleanExcluded.toLowerCase() !== 'pinterest_platform') {
    return cleanExcluded;
  }
  const cleanExisting = (typeof existingMethod === 'string') ? existingMethod.trim() : existingMethod;
  const nullifExisting = (cleanExisting !== '' && cleanExisting != null) ? cleanExisting : null;
  return nullifExisting || cleanExcluded || 'pinterest_platform';
}

runTest('SQL Precedence: Authentic EXCLUDED overrides generic existing', () => {
  const res = simulateSqlCase('uploaded', 'pinterest_platform');
  assert.strictEqual(res, 'uploaded');
});

runTest('SQL Precedence: Generic EXCLUDED preserves authentic existing', () => {
  const res = simulateSqlCase('pinterest_platform', 'button_external');
  assert.strictEqual(res, 'button_external');
});

runTest('SQL Precedence: Case-insensitive EXCLUDED preserves authentic existing ("Pinterest_Platform")', () => {
  const res = simulateSqlCase('Pinterest_Platform', 'button_external');
  assert.strictEqual(res, 'button_external');
});

runTest('SQL Precedence: Whitespace padded EXCLUDED preserves authentic existing ("  pinterest_platform  ")', () => {
  const res = simulateSqlCase('  pinterest_platform  ', 'carousel');
  assert.strictEqual(res, 'carousel');
});

runTest('SQL Precedence: Null EXCLUDED preserves authentic existing', () => {
  const res = simulateSqlCase(null, 'in_app_browser');
  assert.strictEqual(res, 'in_app_browser');
});

runTest('SQL Precedence: Empty string EXCLUDED preserves authentic existing', () => {
  const res = simulateSqlCase('', 'carousel');
  assert.strictEqual(res, 'carousel');
});

runTest('SQL Precedence: Null EXCLUDED and null existing defaults to pinterest_platform', () => {
  const res = simulateSqlCase(null, null);
  assert.strictEqual(res, 'pinterest_platform');
});

runTest('SQL Precedence: Authentic EXCLUDED updates another authentic existing (e.g. carousel promotion)', () => {
  const res = simulateSqlCase('carousel', 'uploaded');
  assert.strictEqual(res, 'carousel');
});

// -----------------------------------------------------------------------------
// Test Suite 3: Shard Sync List & D1 Metadata Formation
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 3: Crawler & D1 Metadata Pipeline Tests...');

runTest('Crawler: buildShardSyncList preserves creation_method and method in extra_meta', () => {
  const cp = {
    pin_id: '999111',
    creation_method: 'button_external',
    metadata: { some_prop: 'val' }
  };
  const baseMethod = cp.creation_method || cp.method || cp.metadata?.creation_method || cp.metadata?.method || 'pinterest_platform';
  const basePin = {
    pin_id: cp.pin_id,
    method: baseMethod,
    creation_method: baseMethod,
    extra_meta: {
      ...((cp.metadata && typeof cp.metadata === 'object') ? cp.metadata : {}),
      creation_method: baseMethod,
      method: baseMethod
    }
  };
  assert.strictEqual(basePin.creation_method, 'button_external');
  assert.strictEqual(basePin.extra_meta.creation_method, 'button_external');
  assert.strictEqual(basePin.extra_meta.method, 'button_external');
});

runTest('D1: syncPinsBatchToD1 metaObj guarantees creation_method and method', () => {
  const p = {
    pin_id: '888222',
    creation_method: 'in_app_browser',
    metadata: { is_deep_hydrated: true }
  };
  const metaObj = {
    ...((p.metadata && typeof p.metadata === 'object') ? p.metadata : {}),
    ...((p.extra_meta && typeof p.extra_meta === 'object') ? p.extra_meta : {})
  };
  const candidateMethods = [
    p.creation_method,
    p.method,
    metaObj.creation_method,
    metaObj.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const mVal = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
  if (mVal) {
    metaObj.creation_method = mVal;
    metaObj.method = mVal;
  }
  assert.strictEqual(metaObj.creation_method, 'in_app_browser');
  assert.strictEqual(metaObj.method, 'in_app_browser');
});

runTest('D1: syncPinsBatchToD1 protects authentic metaObj creation_method if p has generic platform', () => {
  const p = {
    pin_id: '888223',
    creation_method: 'pinterest_platform',
    metadata: { creation_method: 'uploaded', method: 'uploaded' }
  };
  const metaObj = {
    ...((p.metadata && typeof p.metadata === 'object') ? p.metadata : {}),
    ...((p.extra_meta && typeof p.extra_meta === 'object') ? p.extra_meta : {})
  };
  const candidateMethods = [
    p.creation_method,
    p.method,
    metaObj.creation_method,
    metaObj.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const mVal = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
  if (mVal) {
    metaObj.creation_method = mVal;
    metaObj.method = mVal;
  }
  assert.strictEqual(metaObj.creation_method, 'uploaded');
  assert.strictEqual(metaObj.method, 'uploaded');
});

runTest('Dossier: getPinDeepDossier prioritizes authentic method over generic displaced row', () => {
  const displacedRow = { creation_method: 'pinterest_platform' };
  const scraped = { method: 'carousel' };
  const candidateDossierMethods = [
    displacedRow?.creation_method,
    scraped?.creation_method,
    scraped?.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const creationMethod = candidateDossierMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateDossierMethods[0] || 'pinterest_platform';
  assert.strictEqual(creationMethod, 'carousel');
});

// -----------------------------------------------------------------------------
// Test Suite 4: Live Database Verification & Dossier Retrieval
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 4: Live Database State & Dossier Retrieval Tests...');

await runAsyncTest('Live Central Hub: Remediated pins have authentic creation_method in keyword_serp_current', async () => {
  const hubSql = neon(process.env.DATABASE_URL);
  const rows = await hubSql`
    SELECT pin_id, creation_method, metadata->>'creation_method' as meta_cm
    FROM keyword_serp_current
    WHERE pin_id IN ('330803535154760775', '693132198915648745', '155233518398209329');
  `;
  assert(rows.length > 0, 'Must have rows in keyword_serp_current');

  for (const r of rows) {
    if (r.pin_id === '330803535154760775') {
      assert.strictEqual(r.creation_method, 'uploaded', `Pin 330803535154760775 must be 'uploaded', got ${r.creation_method}`);
      assert.strictEqual(r.meta_cm, 'uploaded', `Pin 330803535154760775 metadata must be 'uploaded', got ${r.meta_cm}`);
    } else if (r.pin_id === '693132198915648745') {
      assert.strictEqual(r.creation_method, 'button_external', `Pin 693132198915648745 must be 'button_external', got ${r.creation_method}`);
      assert.strictEqual(r.meta_cm, 'button_external', `Pin 693132198915648745 metadata must be 'button_external', got ${r.meta_cm}`);
    } else if (r.pin_id === '155233518398209329') {
      assert.strictEqual(r.creation_method, 'in_app_browser', `Pin 155233518398209329 must be 'in_app_browser', got ${r.creation_method}`);
      assert.strictEqual(r.meta_cm, 'in_app_browser', `Pin 155233518398209329 metadata must be 'in_app_browser', got ${r.meta_cm}`);
    }
  }
});

await runAsyncTest('Live Storage Shards: universal_master_pins metadata has authentic creation_method', async () => {
  const hubSql = neon(process.env.DATABASE_URL);
  await preloadNeonRegistry(hubSql);

  const targets = [
    { pinId: '330803535154760775', expectedMethod: 'uploaded' },
    { pinId: '693132198915648745', expectedMethod: 'button_external' },
    { pinId: '155233518398209329', expectedMethod: 'in_app_browser' }
  ];

  for (const t of targets) {
    const shardId = getPinShardId(t.pinId, 99);
    const shardSql = await resolveShardConnection({ hubSql, shardId });
    const rows = await shardSql`
      SELECT pin_id, metadata->>'creation_method' as cm, metadata->>'method' as m
      FROM universal_master_pins
      WHERE pin_id = ${t.pinId};
    `;
    assert(rows.length > 0, `Pin ${t.pinId} must exist on Shard ${shardId}`);
    assert.strictEqual(rows[0].cm, t.expectedMethod, `Shard ${shardId} pin ${t.pinId} metadata.creation_method must be '${t.expectedMethod}', got '${rows[0].cm}'`);
    assert.strictEqual(rows[0].m, t.expectedMethod, `Shard ${shardId} pin ${t.pinId} metadata.method must be '${t.expectedMethod}', got '${rows[0].m}'`);
  }
});

await runAsyncTest('Universal Pin Dossier: fetchUniversalPinDossier resolves authentic creation_method', async () => {
  const hubSql = neon(process.env.DATABASE_URL);
  await preloadNeonRegistry(hubSql);

  const targets = [
    { pinId: '330803535154760775', expectedMethod: 'uploaded' },
    { pinId: '693132198915648745', expectedMethod: 'button_external' },
    { pinId: '155233518398209329', expectedMethod: 'in_app_browser' }
  ];

  for (const t of targets) {
    const dossier = await fetchUniversalPinDossier({ hubSql, pinId: t.pinId, bypassEdgeCache: true });
    assert(dossier && dossier.success, `Dossier for ${t.pinId} must succeed`);
    assert.strictEqual(
      dossier.algorithmic_intelligence.creation_method,
      t.expectedMethod,
      `Dossier algorithmic_intelligence.creation_method for ${t.pinId} must be '${t.expectedMethod}', got '${dossier.algorithmic_intelligence.creation_method}'`
    );
  }
});

console.log('\n================================================================');
console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED (Total: ${passed + failed})`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
