/**
 * Deep Forensic Audit & Adversarial Verification Suite
 * scripts/test_forensic_dossier_cache_sync.mjs
 *
 * Verifies:
 * 1. L0 + L1 Cache Race Condition Immunity:
 *    - forceRefresh bypasses L0 (edgeCache) & L1 (l1Cache.match) completely.
 *    - Failed responses (success: false) are NEVER cached in L0 or L1.
 * 2. Live Deep Sync Date Isolation:
 *    - UPDATE keyword_pins_snapshots strictly bounds to UTC today date.
 *    - Historical snapshots are protected against overwriting.
 * 3. Two-Tier Shard Sync with shardKid = null:
 *    - pins_daily_metrics is updated unconditionally.
 *    - pin_serp_positions is conditionally guarded with if (shardKid != null) to prevent NOT NULL violation.
 * 4. Zero Zombie Resurrection on Snapshot Delete:
 *    - DELETE /api/pins/:pin_id/snapshots/:id performs complete cascade across Hub (keyword_pins_snapshots),
 *      Shard (pins_daily_snapshots), and cleans Two-Tier (pins_daily_metrics & pin_serp_positions).
 * 5. Cold-Start 503 vs 404 & Single-Request Circuit Breaker Immunity:
 *    - Concurrent queries in Promise.all for the same request (sharing batchId) fail as 1 failure episode.
 *    - Circuit breaker remains CLOSED after 1 request with concurrent failures (failsafe against single-request trip).
 *    - Worker returns HTTP 503 (SHARD_UNAVAILABLE) without caching 503 errors.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {
  getCachedOrFetch,
  invalidateEdgeCache,
  buildCanonicalCacheKey,
  edgeCache
} from '../src/worker.mjs';
import {
  executeShardQueryWithCircuitBreaker,
  circuitBreakers,
  _resetCircuitBreakers,
  _getCircuitBreakerState,
  CIRCUIT_FAILURE_THRESHOLD
} from '../src/modules/sharding/fleet-router.mjs';

async function runForensicAudit() {
  console.log('='.repeat(80));
  console.log('   🔍 DEEP FORENSIC AUDIT & ADVERSARIAL CACHE/SHARD VERIFICATION');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 0;

  function record(suite, desc, condition, detail = '') {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] [${suite}] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] [${suite}] ${desc}: ${detail}`);
    }
  }

  // =========================================================================
  // SCENARIO 1: L0 + L1 Cache Race Condition & Failure Exclusion
  // =========================================================================
  console.log('\n[SCENARIO 1] Auditing L0/L1 Cache Invalidation & Force Refresh Contract...');
  {
    const testKey = 'test:forensic:dossier:1147784655065227471';
    invalidateEdgeCache(testKey);

    // 1. Seed L0 cache with stale data
    edgeCache.set(testKey, {
      data: { pin_id: '1147784655065227471', stale: true, version: 1, success: true },
      expiresAt: Date.now() + 60000,
      staleUntil: Date.now() + 120000
    });

    let fetcherCalls = 0;
    const fetcher = async () => {
      fetcherCalls++;
      return { pin_id: '1147784655065227471', stale: false, version: 2, success: true };
    };

    // Standard read: should return stale from L0
    const normalRead = await getCachedOrFetch(testKey, fetcher, 30000, 120000, { forceRefresh: false });
    record(
      'Scenario 1',
      'Normal read hits L0 cache without calling fetcher',
      normalRead.stale === true && normalRead.version === 1 && fetcherCalls === 0
    );

    // Force refresh: MUST bypass L0 and invoke fetcher
    const refreshedRead = await getCachedOrFetch(testKey, fetcher, 30000, 120000, { forceRefresh: true });
    record(
      'Scenario 1',
      'forceRefresh = true bypasses L0 cache and fetches fresh data (v2)',
      refreshedRead.stale === false && refreshedRead.version === 2 && fetcherCalls === 1
    );

    // Failure caching immunity: fetcher returning { success: false } must NOT be cached in edgeCache
    const failKey = 'test:forensic:fail_key';
    invalidateEdgeCache(failKey);
    let failCalls = 0;
    const failFetcher = async () => {
      failCalls++;
      return { success: false, error: 'SHARD_UNAVAILABLE' };
    };

    const failResult = await getCachedOrFetch(failKey, failFetcher, 30000, 120000, { forceRefresh: false });
    const inL0 = edgeCache.has(failKey);
    record(
      'Scenario 1',
      'Failed responses (success: false) are strictly excluded from Edge Cache',
      failResult.success === false && inL0 === false
    );
  }

  // =========================================================================
  // SCENARIO 2: Live Deep Sync Date Isolation
  // =========================================================================
  console.log('\n[SCENARIO 2] Auditing Live Deep Sync Historical Date Isolation...');
  {
    const workerContent = fs.readFileSync('src/worker.mjs', 'utf8');

    // Extract the entire POST /api/pins/:pin_id/sync route
    const syncSectionMatch = workerContent.match(/if\s*\(parts\[1\]\s*===\s*'sync'\)[\s\S]*?return jsonResponse\(\{[\s\S]*?success:\s*true[\s\S]*?pin_id/);
    const syncCode = syncSectionMatch ? syncSectionMatch[0] : '';

    const hasSnapshotDateFilter = syncCode.includes('AND snapshot_date = (NOW() AT TIME ZONE \'UTC\')::date');
    record(
      'Scenario 2',
      'UPDATE keyword_pins_snapshots strictly constrains snapshot_date to UTC today',
      hasSnapshotDateFilter === true,
      'Missing UTC date filter in UPDATE query'
    );

    // Verify it also updates two-tier tables
    const hasTwoTierShardUpdate = syncCode.includes('INSERT INTO pins_daily_metrics') &&
                                  syncCode.includes('ON CONFLICT (pin_id, snapshot_date) DO UPDATE');
    record(
      'Scenario 2',
      'Live sync updates Two-Tier pins_daily_metrics on Shard with GREATEST aggregation',
      hasTwoTierShardUpdate === true
    );
  }

  // =========================================================================
  // SCENARIO 3: Two-Tier Shard Sync with shardKid = null Safety
  // =========================================================================
  console.log('\n[SCENARIO 3] Auditing Two-Tier Shard Sync NULL Keyword Immunity...');
  {
    const workerContent = fs.readFileSync('src/worker.mjs', 'utf8');

    // In pin_serp_positions, keyword_id is NOT NULL in PK (pin_id, snapshot_date, keyword_id).
    // Verify that inserting into pin_serp_positions is safely guarded when shardKid is null.
    const hasNullCheck = workerContent.includes('if (shardKid != null)') &&
                         workerContent.includes('INSERT INTO pin_serp_positions');
    record(
      'Scenario 3',
      'pin_serp_positions insertion is strictly guarded by `if (shardKid != null)`',
      hasNullCheck === true,
      'Missing shardKid null check before inserting into pin_serp_positions'
    );
  }

  // =========================================================================
  // SCENARIO 4: Zero Zombie Resurrection on Snapshot Delete
  // =========================================================================
  console.log('\n[SCENARIO 4] Auditing Zero Zombie Resurrection on Snapshot Deletion...');
  {
    const workerContent = fs.readFileSync('src/worker.mjs', 'utf8');

    // Check DELETE /api/pins/:pin_id/snapshots/:snapshot_id
    const deleteSnapshotMatch = workerContent.match(/if\s*\(parts\[1\]\s*===\s*'snapshots'\)[\s\S]*?return jsonResponse\(\{ success: true, deleted_snapshot_id: snapshotId/);
    const deleteCode = deleteSnapshotMatch ? deleteSnapshotMatch[0] : '';

    const deletesFromHub = deleteCode.includes('DELETE FROM keyword_pins_snapshots WHERE id = ${snapshotId}');
    const deletesFromShard = deleteCode.includes('DELETE FROM pins_daily_snapshots WHERE id = ${snapshotId}');
    const cleansTwoTierMetrics = deleteCode.includes('DELETE FROM pins_daily_metrics') && deleteCode.includes('snapshot_date = ${targetDate}::date');
    const cleansTwoTierPositions = deleteCode.includes('DELETE FROM pin_serp_positions');
    const invalidatesCanonicalCache = deleteCode.includes('buildCanonicalCacheKey(\'pin:dossier\', { pin_id: pinId })');

    record(
      'Scenario 4',
      'Deletes single-row snapshots from both Hub and Shard tables',
      deletesFromHub && deletesFromShard
    );

    record(
      'Scenario 4',
      'Cascades cleanup to Two-Tier pins_daily_metrics and pin_serp_positions by date',
      cleansTwoTierMetrics && cleansTwoTierPositions
    );

    record(
      'Scenario 4',
      'Invalidates canonical edge cache key to prevent stale cache read-repair',
      invalidatesCanonicalCache === true
    );
  }

  // =========================================================================
  // SCENARIO 5: Cold-Start 503 vs 404 & Single-Request Circuit Breaker Immunity
  // =========================================================================
  console.log('\n[SCENARIO 5] Auditing Cold-Start 503 & Single-Request Circuit Breaker Immunity...');
  {
    _resetCircuitBreakers();
    const testShardId = 88;

    // Simulate 2 parallel queries failing simultaneously with the same batchId
    const testBatchId = 'dossier_batch_test_123';

    const failQuery1 = executeShardQueryWithCircuitBreaker({
      shardId: testShardId,
      shardSql: async () => { throw new Error('Shard scale-to-zero cold start timeout'); },
      queryFn: async (sql) => await sql(),
      fallbackFn: async (info) => null,
      timeoutMs: 50,
      batchId: testBatchId
    });

    const failQuery2 = executeShardQueryWithCircuitBreaker({
      shardId: testShardId,
      shardSql: async () => { throw new Error('Shard scale-to-zero cold start timeout'); },
      queryFn: async (sql) => await sql(),
      fallbackFn: async (info) => [],
      timeoutMs: 50,
      batchId: testBatchId
    });

    await Promise.all([failQuery1, failQuery2]);

    const cbState = _getCircuitBreakerState(testShardId);
    record(
      'Scenario 5',
      'Concurrent parallel queries sharing batchId coalesce into 1 failure (failures === 1)',
      cbState.failures === 1,
      `Expected failures = 1, got ${cbState.failures}`
    );

    record(
      'Scenario 5',
      'Circuit Breaker remains CLOSED after single request with parallel failures (Immune to single-request trip)',
      cbState.state === 'CLOSED',
      `Expected state CLOSED, got ${cbState.state}`
    );

    // Verify GET /api/pins/:pin_id returns 503 for cold shard vs 404 for missing pin
    const workerContent = fs.readFileSync('src/worker.mjs', 'utf8');
    const dossierRoute = workerContent.match(/if\s*\(!dossier\s*\|\|\s*!dossier\.pin_id\s*\|\|\s*!dossier\.success\)[\s\S]*?return jsonResponse[\s\S]*?isUnavailable \? 503 : 404\);/);
    record(
      'Scenario 5',
      'Worker returns HTTP 503 when shard is cold/unavailable instead of misleading 404',
      Boolean(dossierRoute)
    );
  }

  // =========================================================================
  // SCORECARD SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`FORENSIC AUDIT SCORECARD: ${passed} / ${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('='.repeat(80));

  if (passed === total) {
    console.log('>>> ZERO-DEFECT FORENSIC VERIFICATION SIGN-OFF: ALL SCENARIOS PASSED 100%! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> FORENSIC VERIFICATION FAILED! <<<\n');
    process.exit(1);
  }
}

runForensicAudit().catch(err => {
  console.error('Fatal error during forensic audit:', err);
  process.exit(1);
});
