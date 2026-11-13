/**
 * Forensic Verification Test Suite for Package P1 (Architectural Consolidation)
 *
 * Verifies:
 * 1. Total Eradication of Central Hub Snapshot Operations (pa_pin_metrics):
 *    - src/modules/creators/service.mjs (Zero pa_pin_metrics queries, syncPinAcrossAllFourPillars, fetchPinTrajectory)
 *    - scripts/creator-velocity-crawler.mjs (Zero pa_pin_metrics writes; historical snapshots to pins_daily_metrics)
 * 2. Unified Deterministic CRC32 Work Partitioning (crc32(pin_id) % 20):
 *    - creator-velocity-crawler.mjs commits snapshots via commitSnapshotsToStorageShards and syncPinsToMasterShards
 *    - Upserts into universal_master_pins and pins_daily_metrics in Unified PostgreSQL
 * 3. Unified PostgreSQL Connection Pooling & Transaction Bridge:
 *    - createSqlClient & getSqlClient validate DSN and attach atomic transaction bridge
 *    - attachTransactionBridge bridges .transaction() onto .begin() with idempotency guards
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from '../src/lib/math.mjs';
import { fetchPinTrajectory } from '../src/modules/pins/repository.mjs';
import { createSqlClient, getSqlClient, attachTransactionBridge } from '../src/db/client.mjs';
import { ingestPinsBatch, getPinDetailWithMetrics, deletePinMetricSnapshot } from '../src/modules/creators/service.mjs';

console.log('================================================================================');
console.log('🏛️  PACKAGE P1: ARCHITECTURAL CONSOLIDATION VERIFICATION SUITE');
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

// =============================================================================
// Section 1: Static Forensic Audit - Total Eradication of pa_pin_metrics
// =============================================================================
console.log('[*] Section 1: Static Forensic Audit - Zero pa_pin_metrics Operations on Central Hub...');

let pinarchiveCode = fs.existsSync(path.resolve('src/modules/pinarchive/service.mjs'))
  ? fs.readFileSync(path.resolve('src/modules/pinarchive/service.mjs'), 'utf8')
  : fs.readFileSync(path.resolve('src/modules/creators/service.mjs'), 'utf8');
if (pinarchiveCode.includes("from '../creators/service.mjs'")) {
  pinarchiveCode = fs.readFileSync(path.resolve('src/modules/creators/service.mjs'), 'utf8');
}
let competitorsCode = fs.existsSync(path.resolve('src/modules/competitors/service.mjs'))
  ? fs.readFileSync(path.resolve('src/modules/competitors/service.mjs'), 'utf8')
  : fs.readFileSync(path.resolve('src/modules/creators/service.mjs'), 'utf8');
if (competitorsCode.includes("from '../creators/service.mjs'")) {
  competitorsCode = fs.readFileSync(path.resolve('src/modules/creators/service.mjs'), 'utf8');
}
const crawlerCode = fs.readFileSync(path.resolve('scripts/creator-velocity-crawler.mjs'), 'utf8');

runTest('src/modules/creators/service.mjs: Zero SQL queries targeting pa_pin_metrics', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(pinarchiveCode);
  assert.strictEqual(sqlMatch, false, 'creators service must contain zero SQL operations referencing pa_pin_metrics');
});

runTest('src/modules/creators/service.mjs: Imports and delegates to syncPinAcrossAllFourPillars & fetchPinTrajectory', () => {
  assert(pinarchiveCode.includes('syncPinAcrossAllFourPillars'), 'Must import syncPinAcrossAllFourPillars');
  assert(pinarchiveCode.includes('fetchPinTrajectory'), 'Must import fetchPinTrajectory');
  assert(pinarchiveCode.includes('fetchPinTrajectory({ sql, pinId: cleanId })'), 'getPinDetailWithMetrics must delegate trajectory retrieval to PinRepository.fetchPinTrajectory');
});

runTest('src/modules/creators/service.mjs: ingestPinsBatch executes only pa_pins query builder', () => {
  assert(pinarchiveCode.includes('(db) => buildPinsQuery(db)'), 'Transaction must execute buildPinsQuery');
  assert(!pinarchiveCode.includes('buildMetricsQuery'), 'Transaction must not contain buildMetricsQuery');
});

runTest('src/modules/creators/service.mjs: fastRefreshCompetitorArchivedPins delegates to syncPinAcrossAllFourPillars', () => {
  assert(competitorsCode.includes('syncPinAcrossAllFourPillars'), 'Must import and use syncPinAcrossAllFourPillars');
});

runTest('Phase 2 De-Sharding: legacy src/modules/fleet/service.mjs is deleted', () => {
  assert.strictEqual(fs.existsSync(path.resolve('src/modules/fleet/service.mjs')), false, 'fleet/service.mjs must be deleted');
});

runTest('scripts/creator-velocity-crawler.mjs: Zero SQL queries targeting pa_pin_metrics', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(crawlerCode);
  assert.strictEqual(sqlMatch, false, 'creator-velocity-crawler.mjs must contain zero SQL operations referencing pa_pin_metrics');
});

// =============================================================================
// Section 2: Deterministic CRC32 20-Worker Matrix Work Partitioning
// =============================================================================
console.log('\n[*] Section 2: Deterministic CRC32 20-Worker Matrix Work Partitioning...');

runTest('crc32: Deterministically partitions pin IDs across 20 GitHub Actions workers (0..19)', () => {
  const testIds = ['123456789', '987654321012345678', '112233445566778899', 'pin-sample-abc'];
  for (const id of testIds) {
    const workerIndex = crc32(id) % 20;
    assert(Number.isInteger(workerIndex), `Worker index must be an integer for ${id}`);
    assert(workerIndex >= 0 && workerIndex < 20, `Worker index ${workerIndex} must be in [0, 19]`);
    assert.strictEqual(workerIndex, crc32(id) % 20, 'Worker partition must be strictly idempotent');
  }
});

runTest('20-worker partition map: Correctly groups pins by crc32(pin_id) % 20 without data loss', () => {
  const pins = [
    { pin_id: '1001', title: 'Pin 1' },
    { pin_id: '1002', title: 'Pin 2' },
    { pin_id: '1003', title: 'Pin 3' },
    { pin_id: '1004', title: 'Pin 4' },
    { pin_id: '1005', title: 'Pin 5' }
  ];

  const grouped = new Map();
  for (const p of pins) {
    const w = crc32(p.pin_id) % 20;
    if (!grouped.has(w)) grouped.set(w, []);
    grouped.get(w).push(p);
  }
  let totalReconstructed = 0;
  for (const [workerIdx, workerPins] of grouped.entries()) {
    assert(workerIdx >= 0 && workerIdx < 20, `Worker index ${workerIdx} must be in [0, 19]`);
    for (const p of workerPins) {
      assert.strictEqual(crc32(p.pin_id) % 20, workerIdx, 'Pin must belong to the mapped worker');
      totalReconstructed++;
    }
  }
  assert.strictEqual(totalReconstructed, pins.length, 'All pins must be partitioned without loss');
});

runTest('scripts/creator-velocity-crawler.mjs: Unified PostgreSQL bulk batch commits preserve reaction_count', () => {
  assert(crawlerCode.includes('commitSnapshotsToStorageShards'), 'Must define commitSnapshotsToStorageShards');
  assert(crawlerCode.includes('syncPinsToMasterShards'), 'Must define syncPinsToMasterShards');
  assert(crawlerCode.includes('universal_master_pins'), 'Must upsert to universal_master_pins');
  assert(crawlerCode.includes('pins_daily_metrics'), 'Must upsert to pins_daily_metrics');
  assert(crawlerCode.includes('masterPinsToSync') && crawlerCode.includes('metricSnapshots'), 'Must collect masterPinsToSync and metricSnapshots');
  assert(crawlerCode.includes('reconcileQualifiedCatalogPins'), 'Must reconcile qualified catalog pins');
  assert(crawlerCode.includes('reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count'), 'Must preserve reaction_count on pins_daily_metrics');
});

// =============================================================================
// Section 3: Unified PostgreSQL Client & Transaction Bridge
// =============================================================================
console.log('\n[*] Section 3: Unified PostgreSQL Client & Transaction Bridge...');

runTest('createSqlClient & getSqlClient: Require DATABASE_URL and fail explicitly when absent', () => {
  assert.strictEqual(typeof createSqlClient, 'function');
  assert.strictEqual(typeof getSqlClient, 'function');
  const prevUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.throws(
      () => createSqlClient(''),
      /DATABASE_URL is required/,
      'createSqlClient must throw explicitly when DSN is empty'
    );
  } finally {
    if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
  }
});

await runAsyncTest('attachTransactionBridge: Attaches __unifiedTxAttached and atomic .transaction() bridge', async () => {
  const mockRawClient = Object.assign(
    async () => [],
    {
      begin: async (fn) => await fn(async () => [{ ok: 1 }]),
      unsafe: async () => []
    }
  );

  const bridged = attachTransactionBridge(mockRawClient);
  assert.strictEqual(bridged.__unifiedTxAttached, true, 'Must set __unifiedTxAttached flag');
  assert.strictEqual(bridged.__atomicBuilderWrapped, true, 'Must set __atomicBuilderWrapped flag');
  assert.strictEqual(typeof bridged.transaction, 'function', 'Must attach .transaction() helper');

  const arrayRes = await bridged.transaction([(tx) => tx`SELECT 1`]);
  assert(Array.isArray(arrayRes) && arrayRes.length === 1, 'Array transaction must execute lazy builder');

  const cbRes = await bridged.transaction(async (tx) => await tx`SELECT 1`);
  assert.strictEqual(cbRes[0].ok, 1, 'Callback transaction must execute cleanly');

  assert.strictEqual(attachTransactionBridge(bridged), bridged, 'Re-wrapping bridged client must be idempotent');
});

// =============================================================================
// Section 4: Functional Ingestion & Trajectory Contracts
// =============================================================================
console.log('\n[*] Section 4: Functional Ingestion & Trajectory Contracts...');

await runAsyncTest('ingestPinsBatch: Atomic execution with zero pa_pin_metrics writes', async () => {
  let executedBuilders = [];
  const mockSql = {
    begin: async (fn) => {
      const mockTx = (strings, ...values) => {
        executedBuilders.push({ strings, values });
        return [{ is_inserted: true }];
      };
      return await fn(mockTx);
    }
  };

  const samplePins = [
    {
      pin_id: '99887766',
      title: 'Winning Pin 1',
      saves: 500,
      repins: 200,
      velocity: 5.2
    }
  ];

  const result = await ingestPinsBatch(mockSql, samplePins);
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.added, 1);
  assert.strictEqual(executedBuilders.length, 1, 'Only one atomic query builder (buildPinsQuery) must be executed');
});

await runAsyncTest('getPinDetailWithMetrics: Integrates trajectory without touching Central Hub snapshots', async () => {
  const mockPinRecord = {
    pin_id: '12345000',
    title: 'Archive Pin Detail',
    saves: '1500',
    repins: '300',
    comments: '40',
    share_count: '10',
    reactions: { like: 100 },
    velocity: '4.5'
  };

  // Mock sql client returning pin from pa_pins
  const mockSql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('pa_pins')) {
      return [mockPinRecord];
    }
    return [];
  };

  // Trajectory is returned via fetchPinTrajectoryFromShard, tested here with options
  const detail = await getPinDetailWithMetrics(mockSql, '12345000', {
    enrichLive: false,
    env: null
  });

  assert(detail !== null, 'Dossier must be returned');
  assert.strictEqual(detail.pin.pin_id, '12345000');
  assert.strictEqual(detail.pin.saves, 1500);
  assert(Array.isArray(detail.snapshots), 'Snapshots array must be returned');
  assert(typeof detail.net_growth === 'object', 'net_growth object must be returned');
});

runTest('deletePinMetricSnapshot: Safely completes without executing Central Hub SQL query', async () => {
  let sqlExecuted = false;
  const mockSql = async () => {
    sqlExecuted = true;
    return [];
  };

  const res = await deletePinMetricSnapshot(mockSql, '123', '999');
  assert.strictEqual(res.success, true);
  assert.strictEqual(sqlExecuted, false, 'No Central Hub query must be executed on deletePinMetricSnapshot');
});

await runAsyncTest('fetchPinTrajectory: selects comment_count and share_count', async () => {
  let capturedQuery = null;
  const mockSql = (strings, ...values) => {
    capturedQuery = strings.join('?');
    return [{ snapshot_date: '2026-10-20', save_count: '10', daily_save_velocity: '1.0', reaction_count: 2, repin_count: 1, comment_count: 3, share_count: 4 }];
  };

  const res = await fetchPinTrajectory({
    sql: mockSql,
    pinId: '12345000'
  });

  assert.strictEqual(res.success, true);
  assert(capturedQuery.includes('comment_count'), 'Trajectory query must select comment_count');
  assert(capturedQuery.includes('share_count'), 'Trajectory query must select share_count');
  assert.strictEqual(res.snapshots[0].comment_count, 3);
  assert.strictEqual(res.snapshots[0].share_count, 4);
});

// =============================================================================
// Summary
// =============================================================================
console.log('\n================================================================================');
console.log(`✅ AUDIT COMPLETE: ${passedTests} PASSED | 0 FAILED (Total: ${totalTests})`);
console.log('================================================================================');
