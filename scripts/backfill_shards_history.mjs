/**
 * scripts/backfill_shards_history.mjs
 * 
 * Fleet Cold Shards Historical Backfill Engine
 * Atomically migrates historical data from legacy `pins_daily_snapshots`
 * into Two-Tier tables (`pins_daily_metrics` & `pin_serp_positions`) across all 99 Neon shards.
 */

import { neon } from '@neondatabase/serverless';
import { preloadNeonRegistry, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for shard backfill.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function backfillFleetShards() {
  console.log('================================================================');
  console.log('⚡ FLEET COLD SHARDS HISTORICAL BACKFILL (99 NEON SHARDS)');
  console.log('================================================================');

  const startTime = Date.now();
  console.log('[*] Preloading Neon Shard Registry from Central Hub...');
  const activeMappings = await preloadNeonRegistry(hubSql);
  console.log(`[+] Loaded ${activeMappings} shard mappings from registry.`);

  const shardIds = Array.from({ length: 99 }, (_, i) => i + 1);
  const SHARD_CONCURRENCY = 10;
  let totalMetricsMigrated = 0;
  let totalPositionsMigrated = 0;
  let successfulShards = 0;
  let failedShards = 0;
  const failureLog = [];

  for (let i = 0; i < shardIds.length; i += SHARD_CONCURRENCY) {
    const chunk = shardIds.slice(i, i + SHARD_CONCURRENCY);
    console.log(`[*] Backfilling Shards [${chunk[0]}..${chunk[chunk.length - 1]}]...`);

    const results = await Promise.allSettled(chunk.map(async (shardId) => {
      const shardSql = await resolveShardConnection({ hubSql, shardId });
      
      const [res] = await shardSql`
        WITH ins_metrics AS (
          INSERT INTO pins_daily_metrics (
            pin_id, snapshot_date, save_count, repin_count, comment_count,
            share_count, daily_save_velocity, updated_at
          )
          SELECT 
            pin_id, snapshot_date, MAX(save_count), MAX(repin_count), MAX(comment_count),
            MAX(share_count), MAX(daily_save_velocity), NOW()
          FROM pins_daily_snapshots
          GROUP BY pin_id, snapshot_date
          ON CONFLICT (pin_id, snapshot_date) DO NOTHING
          RETURNING 1
        ),
        ins_positions AS (
          INSERT INTO pin_serp_positions (
            pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
            last_known_rank, catalog_rank, updated_at
          )
          SELECT DISTINCT ON (pin_id, snapshot_date, keyword_id)
            pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
            rank_position, COALESCE(rank_position, 101), NOW()
          FROM pins_daily_snapshots
          WHERE keyword_id IS NOT NULL
          ORDER BY pin_id, snapshot_date, keyword_id, rank_position ASC NULLS LAST
          ON CONFLICT (pin_id, snapshot_date, keyword_id) DO NOTHING
          RETURNING 1
        )
        SELECT 
          (SELECT count(*)::int FROM ins_metrics) as metrics_migrated,
          (SELECT count(*)::int FROM ins_positions) as positions_migrated;
      `;

      return {
        shardId,
        metricsMigrated: Number(res?.metrics_migrated || 0),
        positionsMigrated: Number(res?.positions_migrated || 0)
      };
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') {
        successfulShards++;
        totalMetricsMigrated += r.value.metricsMigrated;
        totalPositionsMigrated += r.value.positionsMigrated;
      } else {
        failedShards++;
        failureLog.push(r.reason?.message || 'Unknown error');
      }
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================');
  console.log('✅ HISTORICAL BACKFILL SUMMARY');
  console.log('================================================================');
  console.log(`  - Shards Processed:            ${successfulShards} / ${shardIds.length} (${failedShards} failures)`);
  console.log(`  - Daily Metrics Migrated:      ${totalMetricsMigrated.toLocaleString()} rows`);
  console.log(`  - SERP Positions Migrated:     ${totalPositionsMigrated.toLocaleString()} rows`);
  console.log(`  - Total Two-Tier Rows Seeded:  ${(totalMetricsMigrated + totalPositionsMigrated).toLocaleString()} rows`);
  console.log(`  - Execution Duration:          ${durationSec}s`);
  console.log('================================================================');

  if (failedShards > 0) {
    console.warn(`[!] Failures encountered:`, failureLog);
    process.exit(1);
  }
}

backfillFleetShards().catch(err => {
  console.error('[-] Fatal Backfill Error:', err);
  process.exit(1);
});
