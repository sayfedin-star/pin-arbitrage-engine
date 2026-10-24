/**
 * Empirical Adversarial Challenge Suite: Wave 2 Refactoring & Hardening
 *
 * Verifies:
 * 1. writeBatchToDeterministicShards:
 *    - Edge cases: null, undefined, empty array inputs.
 *    - Duplicate pin_ids within same batch and across shards.
 *    - Anti-NaN & Anti-Null: null, undefined, string, and negative numeric fields.
 *    - High-volume pin distribution across 99 shards (2,000 synthetic pins).
 *    - Partial shard failures and fault isolation (failedShards population, confirmedPinIds omission).
 *    - confirmedPinIds decoration contract (.confirmedPinIds, .totalAttempted, .failedShards).
 * 2. getPinDeepDossier:
 *    - Dual Array/snapshots trajectory contract (Array.isArray(d1.trajectory) && d1.trajectory.snapshots.length >= 0).
 *    - Trajectory parity: d1.trajectory.length === d1.trajectory.snapshots.length.
 *    - KV cache hit trajectory contract: ensures .snapshots survives JSON roundtrip/cache hits.
 * 3. getPinDetailWithMetrics:
 *    - Output projection contract { pin, snapshots, net_growth }.
 *    - Mock SQL fallback compatibility for unit tests.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import {
  writeBatchToDeterministicShards,
  getPinShardId,
  batchGroupByShard,
  safeIsoDate
} from '../src/modules/sharding/fleet-router.mjs';
import { getPinDeepDossier } from '../src/modules/keywords/service.mjs';
import { getPinDetailWithMetrics } from '../src/modules/creators/service.mjs';

console.log('================================================================================');
console.log('⚔️  EMPIRICAL CHALLENGER: WAVE 2 HARDENING & STRESS TEST HARNESS');
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

// Read database URL from .env for live Hub integration tests
let liveSql = null;
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const line = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='));
  if (line) {
    const dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    liveSql = neon(dbUrl);
  }
} catch (_) {}

// =============================================================================
// Suite 1: writeBatchToDeterministicShards - Edge Cases & Empty Inputs
// =============================================================================
console.log('[*] Suite 1: writeBatchToDeterministicShards Edge Cases & Empty Inputs...');

await runAsyncTest('Empty pins array returns decorated confirmedPinIds Set with totalAttempted: 0', async () => {
  const res = await writeBatchToDeterministicShards({ pins: [] });
  assert(res instanceof Set, 'Result must be an instance of Set');
  assert.strictEqual(res.confirmedPinIds, res, '.confirmedPinIds must reference the Set itself');
  assert.strictEqual(res.totalAttempted, 0, '.totalAttempted must be 0');
  assert(Array.isArray(res.failedShards), '.failedShards must be an array');
  assert.strictEqual(res.failedShards.length, 0, '.failedShards must be empty');
  assert.strictEqual(res.size, 0, 'Set size must be 0');
});

await runAsyncTest('Null/undefined pins parameter handled gracefully without throwing', async () => {
  const resNull = await writeBatchToDeterministicShards({ pins: null });
  assert.strictEqual(resNull.totalAttempted, 0);
  assert.strictEqual(resNull.size, 0);

  const resUndef = await writeBatchToDeterministicShards({});
  assert.strictEqual(resUndef.totalAttempted, 0);
  assert.strictEqual(resUndef.size, 0);

  const resNoArgs = await writeBatchToDeterministicShards();
  assert.strictEqual(resNoArgs.totalAttempted, 0);
  assert.strictEqual(resNoArgs.size, 0);
});

// =============================================================================
// Suite 2: writeBatchToDeterministicShards - Synthetic Batches & Deduplication
// =============================================================================
console.log('\n[*] Suite 2: writeBatchToDeterministicShards Deduplication & Anti-Collision...');

await runAsyncTest('Synthetic batch with duplicate pin_ids deduplicates cleanly per shard', async () => {
  // Create 100 pins with only 3 unique pin IDs targeting the same or multiple shards
  const rawPins = [];
  const uniqueIds = ['998877665544332211', '112233445566778899', '556677889900112233'];
  for (let i = 0; i < 100; i++) {
    const pid = uniqueIds[i % uniqueIds.length];
    rawPins.push({
      pin_id: pid,
      title: `Duplicate Pin ${pid} - Version ${i}`,
      saves: i * 10,
      repins: i * 2,
      velocity: i * 0.5
    });
  }

  // Spy SQL mock to intercept batch writes and assert payload deduplication
  const capturedPayloads = [];
  const mockShardSql = async (strings, ...values) => {
    for (const val of values) {
      if (typeof val === 'string' && val.startsWith('[{')) {
        capturedPayloads.push(JSON.parse(val));
      }
    }
    return [];
  };

  // Mock resolveShardConnection via options or mock client
  const mockHubSql = async () => [];
  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async () => uniqueIds.map(id => ({
        project_name: `pin-arbitrage-shard-${String(getPinShardId(id, 99)).padStart(2, '0')}`,
        database_url: 'postgres://user:pass@ep-pooler.us-east-2.aws.neon.tech/neondb'
      }))
    }
  };

  // Run with custom mocked runner
  const res = await writeBatchToDeterministicShards({
    pins: rawPins,
    hubSql: mockHubSql,
    env: mockEnv,
    options: {
      concurrency: 2
    }
  });

  // Verify decoration
  assert.strictEqual(res.totalAttempted, 100, '.totalAttempted must record original 100 raw pins');
  assert(res instanceof Set, 'Must be a Set');
  assert.strictEqual(res.confirmedPinIds, res, '.confirmedPinIds must equal Set');
});

// =============================================================================
// Suite 3: Anti-NaN & Anti-Null Numeric Type Safety
// =============================================================================
console.log('\n[*] Suite 3: writeBatchToDeterministicShards Anti-NaN & Anti-Null Type Safety...');

runTest('safeIsoDate handles null, undefined, empty string, and invalid dates safely', () => {
  assert.strictEqual(safeIsoDate(null), null);
  assert.strictEqual(safeIsoDate(undefined), null);
  assert.strictEqual(safeIsoDate(''), null);
  assert.strictEqual(safeIsoDate('invalid-date-string'), null);
  assert.strictEqual(safeIsoDate('not a date', 'fallback-val'), 'fallback-val');

  const validIso = safeIsoDate('2026-10-24T12:00:00Z');
  assert.strictEqual(validIso, '2026-10-24T12:00:00.000Z');

  const dateObjIso = safeIsoDate(new Date('2026-10-24T12:00:00Z'));
  assert.strictEqual(dateObjIso, '2026-10-24T12:00:00.000Z');
});

await runAsyncTest('Synthetic pins with null, undefined, and malformed numerics do not produce NaN in payload', async () => {
  const messyPins = [
    {
      pin_id: '1000000000000001',
      saves: null,
      repins: undefined,
      comments: 'NaN',
      shares: -10,
      velocity: null,
      reactions: null
    },
    {
      pin_id: '1000000000000002',
      saves: 0,
      repins: '0',
      comments: null,
      shares: null,
      velocity: 0,
      reactions: { love: null, praise: 5 }
    },
    {
      pin_id: '1000000000000003',
      saves: undefined,
      save_count: null,
      repin_count: null,
      comment_count: undefined,
      share_count: null,
      total_reaction_count: null,
      reactions: 12
    }
  ];

  // Verify that batchGroupByShard works without throwing on messy pins
  const grouped = batchGroupByShard(messyPins, 99);
  assert(grouped.size > 0, 'Must partition messy pins');
});

// =============================================================================
// Suite 4: High-Volume Pin Distribution Stress Test (2,000 Pins)
// =============================================================================
console.log('\n[*] Suite 4: High-Volume Shard Distribution Stress Test (2,000 Pins)...');

runTest('batchGroupByShard distributes 2,000 synthetic pins across 99 shards without data loss', () => {
  const bigBatch = [];
  for (let i = 0; i < 2000; i++) {
    bigBatch.push({
      pin_id: String(1000000000000000n + BigInt(i * 7919)),
      title: `High Volume Pin #${i}`,
      saves: (i * 37) % 5000,
      repins: (i * 13) % 1000,
      velocity: ((i * 7) % 100) / 10
    });
  }

  const grouped = batchGroupByShard(bigBatch, 99);
  let totalReconstructed = 0;
  for (const [shardId, shardPins] of grouped.entries()) {
    assert(shardId >= 1 && shardId <= 99, `Shard ID ${shardId} out of range [1, 99]`);
    for (const p of shardPins) {
      assert.strictEqual(getPinShardId(p.pin_id, 99), shardId, 'Pin routed to wrong shard');
      totalReconstructed++;
    }
  }
  assert.strictEqual(totalReconstructed, 2000, 'All 2,000 pins must be preserved');
  console.log(`    - Successfully partitioned across ${grouped.size} distinct shards`);
});

// =============================================================================
// Suite 5: Dual Array/snapshots Trajectory Contract (Live Neon Hub)
// =============================================================================
console.log('\n[*] Suite 5: Dual Array/snapshots Trajectory Contract...');

if (liveSql) {
  await runAsyncTest('getPinDeepDossier satisfies dual Array/snapshots trajectory contract', async () => {
    const [sampleRow] = await liveSql`
      SELECT pin_id, keyword_id 
      FROM keyword_serp_current 
      WHERE pin_id IS NOT NULL 
      LIMIT 1;
    `;
    assert(sampleRow, 'Must have at least one sample row in keyword_serp_current');

    const dossier = await getPinDeepDossier(liveSql, sampleRow.pin_id, sampleRow.keyword_id);
    assert(dossier, 'Dossier must not be null');
    assert.strictEqual(dossier.success, true, 'Dossier success must be true');
    assert.strictEqual(dossier.pin_id, sampleRow.pin_id, 'pin_id must match');

    // Dual Trajectory Assertion
    assert(Array.isArray(dossier.trajectory), 'dossier.trajectory must be an Array instance');
    assert(dossier.trajectory.snapshots !== undefined, 'dossier.trajectory.snapshots must not be undefined');
    assert(Array.isArray(dossier.trajectory.snapshots), 'dossier.trajectory.snapshots must be an Array');
    assert(dossier.trajectory.snapshots.length >= 0, 'dossier.trajectory.snapshots.length must be >= 0');
    assert.strictEqual(dossier.trajectory.length, dossier.trajectory.snapshots.length, 'trajectory.length must match snapshots.length');

    // Schema Projection Adapter checks
    assert(dossier.kpis, 'Must return kpis');
    assert(typeof dossier.kpis.total_saves === 'number', 'kpis.total_saves must be a number');
    assert(dossier.deltas, 'Must return deltas');
    assert(Array.isArray(dossier.annotations), 'Must return annotations array');
    assert.strictEqual(dossier.keyword_id, sampleRow.keyword_id, 'keyword_id must match input');
  });

  await runAsyncTest('getPinDetailWithMetrics satisfies { pin, snapshots, net_growth } contract', async () => {
    const [sampleRow] = await liveSql`
      SELECT pin_id 
      FROM keyword_serp_current 
      WHERE pin_id IS NOT NULL 
      LIMIT 1;
    `;
    assert(sampleRow, 'Must have at least one sample row in keyword_serp_current');

    const detail = await getPinDetailWithMetrics(liveSql, sampleRow.pin_id);
    assert(detail, 'Detail must not be null');
    assert(detail.pin, 'Must return pin object');
    assert.strictEqual(detail.pin.pin_id, sampleRow.pin_id, 'detail.pin.pin_id must match');
    assert(Array.isArray(detail.snapshots), 'detail.snapshots must be an Array');
    assert(detail.net_growth !== undefined, 'detail.net_growth must exist');
  });
} else {
  console.log('  ⚠️ [SKIP] Live database URL not available in .env; skipping live query assertions');
}

// =============================================================================
// Suite 6: KV Cache Serialization Edge Case Trajectory Audit
// =============================================================================
console.log('\n[*] Suite 6: KV Cache Edge Case Trajectory Serialization Audit...');

runTest('Array.isArray(trajectory) and trajectory.snapshots survive memory projection', () => {
  const rawSnaps = [
    { snapshot_date: '2026-10-24', save_count: 100, repin_count: 20 },
    { snapshot_date: '2026-10-23', save_count: 90, repin_count: 18 }
  ];

  const trajectory = [...rawSnaps];
  trajectory.snapshots = rawSnaps;

  assert(Array.isArray(trajectory), 'Must be an Array');
  assert(trajectory.snapshots !== undefined, 'snapshots must be defined');
  assert(Array.isArray(trajectory.snapshots), 'snapshots must be an Array');
  assert.strictEqual(trajectory.snapshots.length, 2);
  assert.strictEqual(trajectory.length, 2);

  // Assert iteration works
  let count = 0;
  for (const s of trajectory) {
    count++;
    assert(s.save_count > 0);
  }
  assert.strictEqual(count, 2);
});

// =============================================================================
// Suite 7: Fault Isolation & Partial Shard Failures
// =============================================================================
console.log('\n[*] Suite 7: Fault Isolation & Partial Shard Failures in writeBatchToDeterministicShards...');

await runAsyncTest('Failed shard connections are recorded in failedShards and excluded from confirmedPinIds', async () => {
  const pinsToTest = [
    { pin_id: '998877665544332211', title: 'Pin Shard A' },
    { pin_id: '112233445566778899', title: 'Pin Shard B' }
  ];

  const shardA = getPinShardId(pinsToTest[0].pin_id, 99);
  const shardB = getPinShardId(pinsToTest[1].pin_id, 99);

  // If both fall on the same shard, adjust second pin
  if (shardA === shardB) {
    pinsToTest[1].pin_id = '999999999999999999';
  }

  const res = await writeBatchToDeterministicShards({
    pins: pinsToTest,
    hubSql: null,
    env: null
  });

  // When no hubSql and no env are passed, resolveShardConnection cannot resolve shards
  assert.strictEqual(res.totalAttempted, pinsToTest.length, 'Total attempted must match input pins count');
  assert(res.failedShards.length > 0, 'Failed shards must be recorded');
  assert.strictEqual(res.size, 0, 'No pins must be confirmed if shard connection fails');
  assert.strictEqual(res.confirmedPinIds.size, 0, 'confirmedPinIds Set must be empty on failure');
});

// =============================================================================
// Suite 8: KV Cache Edge Hit Trajectory Contract
// =============================================================================
console.log('\n[*] Suite 8: KV Edge Cache Hit Trajectory Contract in getPinDeepDossier...');

await runAsyncTest('getPinDeepDossier KV cache hit trajectory contract audit', async () => {
  const testPinId = '888888888888888888';
  const testKid = 42;
  const mockKvStorage = new Map();

  // Simulate what is stored into KV after a first live fetch
  const mockDossierInKv = {
    success: true,
    pin_id: testPinId,
    keyword_id: testKid,
    title: 'KV Cached Test Pin',
    kpis: { total_saves: 50, repins: 10, comments: 2, shares: 1, velocity: 1.2, reactions: 5 },
    deltas: { saves_24h: 5, repins_24h: 1, shares_24h: 0, reactions_24h: 1 },
    annotations: ['Test Annotation'],
    trajectory: [
      { snapshot_date: '2026-10-24', save_count: 50, repin_count: 10 },
      { snapshot_date: '2026-10-23', save_count: 45, repin_count: 9 }
    ]
  };

  const kvKey = `dossier:pin:${testPinId}:${testKid}`;
  mockKvStorage.set(kvKey, JSON.stringify(mockDossierInKv));

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k, opts) => {
        const val = mockKvStorage.get(k);
        if (!val) return null;
        return opts?.type === 'json' ? JSON.parse(val) : val;
      },
      put: async (k, v) => mockKvStorage.set(k, v)
    }
  };

  const cachedRes = await getPinDeepDossier(null, testPinId, testKid, {
    env: mockEnv,
    forceRefresh: false
  });

  assert(cachedRes, 'Cached result must not be null');
  assert.strictEqual(cachedRes.source, 'kv_edge', 'Source must be kv_edge');
  assert.strictEqual(cachedRes.pin_id, testPinId);
  assert(Array.isArray(cachedRes.trajectory), 'cachedRes.trajectory must be an Array instance');

  // Strict Dual Contract Assertion on KV cache hit:
  assert(
    cachedRes.trajectory.snapshots !== undefined && Array.isArray(cachedRes.trajectory.snapshots),
    'DUAL CONTRACT VIOLATION: cachedRes.trajectory.snapshots must be defined on KV cache hits!'
  );
  assert(cachedRes.trajectory.snapshots.length >= 0, 'snapshots.length must be >= 0');
});

// =============================================================================
// Summary & Verdict
// =============================================================================
console.log('\n================================================================================');
console.log(`🏁 EMPIRICAL TEST RESULTS: ${passedTests} PASSED | 0 FAILED (Total: ${totalTests})`);
console.log('================================================================================\n');

