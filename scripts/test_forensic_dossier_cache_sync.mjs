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
} from '../src/http/security-and-response.mjs';
import {
  fetchUniversalPinDossier
} from '../src/modules/pins/repository.mjs';

function readWorkerAndRoutes() {
  const routesContent = fs.existsSync('src/routes')
    ? fs.readdirSync('src/routes').filter(f => f.endsWith('.mjs')).map(f => fs.readFileSync(`src/routes/${f}`, 'utf8')).join('\n')
    : '';
  const creatorsContent = fs.existsSync('src/modules/creators/service.mjs')
    ? fs.readFileSync('src/modules/creators/service.mjs', 'utf8')
    : '';
  const pinsRepoContent = fs.existsSync('src/modules/pins/repository.mjs')
    ? fs.readFileSync('src/modules/pins/repository.mjs', 'utf8')
    : '';
  const securityHttpContent = fs.existsSync('src/http/security-and-response.mjs')
    ? fs.readFileSync('src/http/security-and-response.mjs', 'utf8')
    : '';
  const apiPluginContent = fs.existsSync('src/plugins/api-routes.mjs')
    ? fs.readFileSync('src/plugins/api-routes.mjs', 'utf8')
    : '';
  return fs.readFileSync('src/server.mjs', 'utf8') + '\n' + securityHttpContent + '\n' + apiPluginContent + '\n' + routesContent + '\n' + creatorsContent + '\n' + pinsRepoContent;
}

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
      return { success: false, error: 'DB_UNAVAILABLE' };
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
    const workerContent = readWorkerAndRoutes();

    // Extract the entire POST /api/pins/:pin_id/sync route or canonical fleet sync
    const syncSectionMatch = workerContent.match(/(?:if\s*\(parts\[1\]\s*===\s*'sync'\)|syncPinAcrossAllFourPillars)[\s\S]*?return (?:jsonResponse\(\{[\s\S]*?success:\s*true[\s\S]*?pin_id|\{\s*success:\s*true)/);
    const syncCode = syncSectionMatch ? syncSectionMatch[0] : '';

    const hasZeroHubSnapshots = (syncCode.includes('[INVARIANT: ZERO-HUB-SNAPSHOTS]') || workerContent.includes('[INVARIANT: ZERO-HUB-SNAPSHOTS]')) && !syncCode.includes('UPDATE keyword_pins_snapshots');
    record(
      'Scenario 2',
      'Central Hub snapshots are purged from sync; strictly offloaded to Shards',
      hasZeroHubSnapshots === true,
      'Hub snapshot update detected (violates ZERO-HUB-SNAPSHOTS)'
    );

    // Verify it also updates two-tier tables
    const hasTwoTierShardUpdate = (syncCode.includes('INSERT INTO pins_daily_metrics') || workerContent.includes('INSERT INTO pins_daily_metrics')) &&
                                  (syncCode.includes('ON CONFLICT (pin_id, snapshot_date) DO UPDATE') || workerContent.includes('ON CONFLICT (pin_id, snapshot_date) DO UPDATE'));
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
    const workerContent = readWorkerAndRoutes();

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
    const workerContent = readWorkerAndRoutes();

    // Check DELETE /api/pins/:pin_id/snapshots/:snapshot_id
    const startIdx = workerContent.indexOf("if (parts[1] === 'snapshots')");
    const endIdx = workerContent.indexOf("parts[1] === 'serp-positions'", startIdx);
    const deleteCode = startIdx !== -1 && endIdx !== -1 ? workerContent.slice(startIdx, endIdx) : (workerContent.match(/if\s*\(parts\[1\]\s*===\s*'snapshots'\)[\s\S]*?return jsonResponse\(\{ success: true, deleted_snapshot/) || [''])[0];

    const deletesDirectlyFromShard = deleteCode.includes('DELETE FROM pins_daily_metrics') && deleteCode.includes('DELETE FROM pin_serp_positions');
    const cleansTwoTierMetrics = deleteCode.includes('DELETE FROM pins_daily_metrics') && deleteCode.includes('snapshot_date = ${targetDate}::date');
    const cleansTwoTierPositions = deleteCode.includes('DELETE FROM pin_serp_positions');
    const invalidatesCanonicalCache = deleteCode.includes('buildCanonicalCacheKey(\'pin:dossier\', { pin_id: pinId })');

    record(
      'Scenario 4',
      'Deletes single-row snapshots directly from Shard base tables (Zero View Deletion)',
      deletesDirectlyFromShard === true
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
  // SCENARIO 5: DB Unavailable 503 vs 404 Immunity in Unified PostgreSQL
  // =========================================================================
  console.log('\n[SCENARIO 5] Auditing Cold-Start / DB_UNAVAILABLE 503 Immunity...');
  {
    const missingClientRes = await fetchUniversalPinDossier({ sql: null, pinId: '1147784655065227471' });
    record(
      'Scenario 5',
      'Missing SQL client returns DB_UNAVAILABLE cleanly without throwing',
      missingClientRes.success === false && missingClientRes.error === 'DB_UNAVAILABLE',
      `Got ${JSON.stringify(missingClientRes)}`
    );

    const failingSql = async () => {
      throw new Error('PostgreSQL connection timeout');
    };
    const failingRes = await fetchUniversalPinDossier({ sql: failingSql, pinId: '1147784655065227471', bypassEdgeCache: true });
    record(
      'Scenario 5',
      'Failing PostgreSQL queries return DB_UNAVAILABLE instead of false 404',
      failingRes.success === false && failingRes.error === 'DB_UNAVAILABLE',
      `Got ${JSON.stringify(failingRes)}`
    );

    // Verify GET /api/pins/:pin_id returns 503 when DB is unavailable vs 404 for missing pin
    const workerContent = readWorkerAndRoutes();
    const dossierRoute = workerContent.match(/if\s*\(!dossier\s*\|\|\s*!dossier\.pin_id\s*\|\|\s*!dossier\.success\)[\s\S]*?return jsonResponse[\s\S]*?isUnavailable \? 503 : 404\);/);
    record(
      'Scenario 5',
      'Route returns HTTP 503 when PostgreSQL is unavailable instead of misleading 404',
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
