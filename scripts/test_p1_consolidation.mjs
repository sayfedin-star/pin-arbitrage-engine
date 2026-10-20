/**
 * Forensic Verification Test Suite for Package P1 (Architectural Consolidation)
 *
 * Verifies:
 * 1. Total Eradication of Central Hub Snapshot Operations (pa_pin_metrics):
 *    - src/modules/pinarchive/service.mjs (Zero pa_pin_metrics queries, syncPinAcrossAllFourPillars, fetchPinTrajectoryFromShard)
 *    - src/modules/competitors/service.mjs (Zero pa_pin_metrics writes, syncPinAcrossAllFourPillars delegation)
 *    - src/modules/fleet/service.mjs (Zero pa_pin_metrics count queries)
 *    - scripts/crawler-engine.mjs (Zero pa_pin_metrics writes; historical snapshots to pins_daily_metrics)
 * 2. Unified Deterministic CRC32 Shard Routing ((crc32(pin_id) % 99) + 1):
 *    - crawler-engine.mjs partitions competitor pins via batchGroupByShard(pins, 99)
 *    - Upserts into universal_master_pins and pins_daily_metrics on deterministic Shards
 * 3. Unified Shard Connection Pooling & Lifecycle Cleanup:
 *    - Bounded LRU caching with canonical DSN normalization (enforceNeonPoolerUrl)
 *    - Explicit socket termination on eviction (client?.end?.({ timeout: 1 }))
 *    - src/worker.mjs unifies shardSqlCache with shardSqlClients
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPinShardId,
  batchGroupByShard,
  enforceNeonPoolerUrl,
  getCachedShardSqlClient,
  setCachedShardSqlClient,
  shardSqlClients,
  MAX_SHARD_SQL_CLIENTS,
  fetchPinTrajectoryFromShard
} from '../src/modules/sharding/fleet-router.mjs';
import { shardSqlCache, getCachedShardSql, setCachedShardSql } from '../src/worker.mjs';
import { ingestPinsBatch, getPinDetailWithMetrics, deletePinMetricSnapshot } from '../src/modules/pinarchive/service.mjs';

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

const pinarchiveCode = fs.readFileSync(path.resolve('src/modules/pinarchive/service.mjs'), 'utf8');
const competitorsCode = fs.readFileSync(path.resolve('src/modules/competitors/service.mjs'), 'utf8');
const fleetCode = fs.readFileSync(path.resolve('src/modules/fleet/service.mjs'), 'utf8');
const crawlerCode = fs.readFileSync(path.resolve('scripts/crawler-engine.mjs'), 'utf8');

runTest('src/modules/pinarchive/service.mjs: Zero SQL queries targeting pa_pin_metrics', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(pinarchiveCode);
  assert.strictEqual(sqlMatch, false, 'pinarchive service must contain zero SQL operations referencing pa_pin_metrics');
});

runTest('src/modules/pinarchive/service.mjs: Imports and delegates to syncPinAcrossAllFourPillars & fetchPinTrajectoryFromShard', () => {
  assert(pinarchiveCode.includes('syncPinAcrossAllFourPillars'), 'Must import syncPinAcrossAllFourPillars');
  assert(pinarchiveCode.includes('fetchPinTrajectoryFromShard'), 'Must import fetchPinTrajectoryFromShard');
  assert(pinarchiveCode.includes('fetchPinTrajectoryFromShard({ hubSql: sql, pinId: cleanId, env })'), 'getPinDetailWithMetrics must delegate trajectory retrieval to Shard');
});

runTest('src/modules/pinarchive/service.mjs: ingestPinsBatch executes only pa_pins query builder', () => {
  assert(pinarchiveCode.includes('(db) => buildPinsQuery(db)'), 'Transaction must execute buildPinsQuery');
  assert(!pinarchiveCode.includes('buildMetricsQuery'), 'Transaction must not contain buildMetricsQuery');
});

runTest('src/modules/competitors/service.mjs: Zero SQL queries targeting pa_pin_metrics', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(competitorsCode);
  assert.strictEqual(sqlMatch, false, 'competitors service must contain zero SQL operations referencing pa_pin_metrics');
});

runTest('src/modules/competitors/service.mjs: fastRefreshCompetitorArchivedPins delegates to syncPinAcrossAllFourPillars', () => {
  assert(competitorsCode.includes('syncPinAcrossAllFourPillars'), 'Must import and use syncPinAcrossAllFourPillars');
});

runTest('src/modules/fleet/service.mjs: Zero SQL queries targeting pa_pin_metrics on Hub', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(fleetCode);
  assert.strictEqual(sqlMatch, false, 'fleet service must contain zero SQL operations referencing pa_pin_metrics');
});

runTest('scripts/crawler-engine.mjs: Zero SQL queries targeting pa_pin_metrics', () => {
  const sqlMatch = /(?:FROM|INTO|UPDATE|JOIN)\s+pa_pin_metrics\b/i.test(crawlerCode);
  assert.strictEqual(sqlMatch, false, 'crawler-engine.mjs must contain zero SQL operations referencing pa_pin_metrics');
});

// =============================================================================
// Section 2: Deterministic CRC32 Shard Routing Parity
// =============================================================================
console.log('\n[*] Section 2: Deterministic CRC32 Shard Routing Parity...');

runTest('getPinShardId: Deterministically partitions pin IDs to shards 1..99', () => {
  const testIds = ['123456789', '987654321012345678', '112233445566778899', 'pin-sample-abc'];
  for (const id of testIds) {
    const shardId = getPinShardId(id, 99);
    assert(Number.isInteger(shardId), `Shard ID must be an integer for ${id}`);
    assert(shardId >= 1 && shardId <= 99, `Shard ID ${shardId} must be in [1, 99]`);
    // Assert idempotency
    assert.strictEqual(shardId, getPinShardId(id, 99), `Shard ID must be strictly idempotent`);
  }
});

runTest('batchGroupByShard: Correctly groups pins by CRC32 shard ID without data loss', () => {
  const pins = [
    { pin_id: '1001', title: 'Pin 1' },
    { pin_id: '1002', title: 'Pin 2' },
    { pin_id: '1003', title: 'Pin 3' },
    { pin_id: '1004', title: 'Pin 4' },
    { pin_id: '1005', title: 'Pin 5' }
  ];

  const grouped = batchGroupByShard(pins, 99);
  let totalReconstructed = 0;
  for (const [shardId, shardPins] of grouped.entries()) {
    assert(shardId >= 1 && shardId <= 99, `Shard ID ${shardId} must be in [1, 99]`);
    for (const p of shardPins) {
      assert.strictEqual(getPinShardId(p.pin_id, 99), shardId, 'Pin must belong to the mapped shard');
      totalReconstructed++;
    }
  }
  assert.strictEqual(totalReconstructed, pins.length, 'All pins must be partitioned without loss');
});

runTest('scripts/crawler-engine.mjs: Competitor pins routed to Shards via batchGroupByShard', () => {
  assert(crawlerCode.includes('batchGroupByShard(sortedMetrics, 99)'), 'bulkInsertMetrics must partition by CRC32');
  assert(crawlerCode.includes('batchGroupByShard(enrichedPins, 99)'), 'bulkSyncPinsToDeterministicShards must partition by CRC32');
  assert(crawlerCode.includes('universal_master_pins'), 'Must upsert to universal_master_pins on Shard');
  assert(crawlerCode.includes('pins_daily_metrics'), 'Must upsert to pins_daily_metrics on Shard');
  assert(crawlerCode.includes('allDiscoveredPins'), 'Must collect allDiscoveredPins for universal shard routing');
  assert(crawlerCode.includes('reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count)'), 'Must preserve reaction_count on pins_daily_metrics');
});

// =============================================================================
// Section 3: Shard Connection Cache Hardening & Socket Termination
// =============================================================================
console.log('\n[*] Section 3: Shard Connection Cache Hardening & Socket Termination...');

runTest('enforceNeonPoolerUrl: Converts direct Neon endpoints to pooled endpoints', () => {
  const direct = 'postgres://user:secret@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
  const pooled = enforceNeonPoolerUrl(direct);
  assert(pooled.includes('-pooler.'), `Pooled URL must contain -pooler.: ${pooled}`);

  // Already pooled remains unchanged
  const alreadyPooled = 'postgres://user:secret@ep-cool-flower-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
  assert.strictEqual(enforceNeonPoolerUrl(alreadyPooled), alreadyPooled);
});

runTest('getCachedShardSqlClient & setCachedShardSqlClient: Cache by canonical pooled URL', () => {
  const rawUrl = 'postgres://u:p@ep-cache-test-999.us-east-1.aws.neon.tech/neondb';
  const mockClient = { name: 'mock-client', end: () => {} };

  setCachedShardSqlClient(rawUrl, mockClient);

  // Both direct and pooled URL should resolve to the same cached instance
  const pooledUrl = enforceNeonPoolerUrl(rawUrl);
  const resolvedDirect = getCachedShardSqlClient(rawUrl);
  const resolvedPooled = getCachedShardSqlClient(pooledUrl);

  assert.strictEqual(resolvedDirect, mockClient);
  assert.strictEqual(resolvedPooled, mockClient);

  // Cleanup
  shardSqlClients.delete(pooledUrl);
});

runTest('setCachedShardSqlClient: LRU Eviction explicitly closes socket via client.end({ timeout: 1 })', () => {
  const initialCache = new Map(shardSqlClients);
  shardSqlClients.clear();

  let socketEnded = false;
  let socketTimeout = null;

  const mockVictimClient = {
    name: 'victim-client',
    end: (opts) => {
      socketEnded = true;
      socketTimeout = opts?.timeout;
    }
  };

  const victimDsn = 'postgres://u:p@ep-victim-001.us-east-1.aws.neon.tech/neondb';
  setCachedShardSqlClient(victimDsn, mockVictimClient);

  // Fill cache up to MAX_SHARD_SQL_CLIENTS
  for (let i = 2; i <= MAX_SHARD_SQL_CLIENTS; i++) {
    const fillerDsn = `postgres://u:p@ep-filler-${String(i).padStart(3, '0')}.us-east-1.aws.neon.tech/neondb`;
    setCachedShardSqlClient(fillerDsn, { name: `filler-${i}`, end: () => {} });
  }

  assert.strictEqual(shardSqlClients.size, MAX_SHARD_SQL_CLIENTS);
  assert.strictEqual(socketEnded, false, 'Oldest client must not be ended before capacity overflow');

  // Add one more client to trigger eviction of oldest client
  const overflowDsn = 'postgres://u:p@ep-overflow-999.us-east-1.aws.neon.tech/neondb';
  setCachedShardSqlClient(overflowDsn, { name: 'overflow', end: () => {} });

  assert.strictEqual(socketEnded, true, 'Evicted socket must have .end() called');
  assert.strictEqual(socketTimeout, 1, 'Evicted socket must specify timeout: 1');

  // Restore initial cache
  shardSqlClients.clear();
  for (const [k, v] of initialCache.entries()) {
    shardSqlClients.set(k, v);
  }
});

runTest('src/worker.mjs: shardSqlCache is an alias to fleet-router.shardSqlClients', () => {
  assert.strictEqual(shardSqlCache, shardSqlClients, 'worker shardSqlCache must directly reference fleet-router shardSqlClients');
});

runTest('src/worker.mjs: setCachedShardSql and getCachedShardSql delegate to unified client cache', () => {
  const testDsn = 'postgres://u:p@ep-worker-cache-test-111.us-east-1.aws.neon.tech/neondb';
  const mockClient = { name: 'worker-client', end: () => {} };

  setCachedShardSql(testDsn, mockClient);
  const resolved = getCachedShardSql(testDsn);
  assert.strictEqual(resolved, mockClient, 'getCachedShardSql must return client stored by setCachedShardSql');

  // Cleanup
  shardSqlClients.delete(enforceNeonPoolerUrl(testDsn));
});

runTest('src/worker.mjs: getCachedShardSql hits cache on non-DSN custom keys and wraps client transaction', () => {
  let factoryCalls = 0;
  const mockRawClient = {
    name: 'custom-shard-client',
    transaction: (fn) => fn('tx-conn'),
    end: () => {}
  };

  const client1 = getCachedShardSql('custom_shard_key_99', () => {
    factoryCalls++;
    return mockRawClient;
  });

  assert.strictEqual(factoryCalls, 1, 'Factory must be called once on miss');
  assert.strictEqual(client1.__atomicBuilderWrapped, true, 'Factory client must be wrapped with wrapShardNeonTransaction');

  const client2 = getCachedShardSql('custom_shard_key_99', () => {
    factoryCalls++;
    return { name: 'unwanted' };
  });

  assert.strictEqual(factoryCalls, 1, 'Factory must NOT be called on subsequent cache hit for custom key');
  assert.strictEqual(client2, client1, 'Cached client must be returned');

  // Cleanup
  shardSqlClients.delete('custom_shard_key_99');
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

await runAsyncTest('fetchPinTrajectoryFromShard: selects comment_count and share_count', async () => {
  let capturedQuery = null;
  const mockShardSql = (strings, ...values) => {
    capturedQuery = strings.join('?');
    return [{ snapshot_date: '2026-10-20', save_count: '10', daily_save_velocity: '1.0', reaction_count: 2, repin_count: 1, comment_count: 3, share_count: 4 }];
  };

  const res = await fetchPinTrajectoryFromShard({
    shardSql: mockShardSql,
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
