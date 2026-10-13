#!/usr/bin/env node

/**
 * scripts/migrate_pins_daily_rollups_v2.mjs
 * Rolls out the optimized LEFT JOIN LATERAL pins_daily_rollups_v2 view across Central Hub and all 99 Storage Shards
 */

import { neon } from '@neondatabase/serverless';
import { preloadNeonRegistry, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

const OPTIMIZED_VIEW_SQL = `
  CREATE OR REPLACE VIEW pins_daily_rollups_v2 AS
  SELECT 
    m.pin_id,
    m.snapshot_date,
    COALESCE(m.save_count, 0) AS save_count,
    COALESCE(m.repin_count, 0) AS repin_count,
    COALESCE(m.comment_count, 0) AS comment_count,
    COALESCE(m.share_count, 0) AS share_count,
    COALESCE(m.reaction_count, 0) AS reaction_count,
    COALESCE(m.daily_save_velocity, 0) AS daily_save_velocity,
    m.updated_at,
    COALESCE(sp.serp_rankings, '[]'::jsonb) AS serp_rankings
  FROM pins_daily_metrics m
  LEFT JOIN LATERAL (
    SELECT 
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'keyword_id', p.keyword_id,
            'rank_position', p.rank_position,
            'is_displaced', p.is_displaced,
            'last_known_rank', p.last_known_rank,
            'catalog_rank', p.catalog_rank
          ) ORDER BY p.rank_position ASC NULLS LAST
        ) FILTER (WHERE p.keyword_id IS NOT NULL),
        '[]'::jsonb
      ) AS serp_rankings
    FROM pin_serp_positions p
    WHERE p.pin_id = m.pin_id 
      AND p.snapshot_date = m.snapshot_date
  ) sp ON TRUE;
`;

async function run() {
  console.log('===============================================================');
  console.log('🚀 OPTIMIZED pins_daily_rollups_v2 VIEW ROLLOUT (HUB + 99 SHARDS)');
  console.log('===============================================================');

  // 1. Roll out on Central Hub (if tables exist)
  try {
    const hubHasMetrics = await hubSql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pins_daily_metrics'
      ) as exists;
    `;
    if (hubHasMetrics[0]?.exists) {
      await hubSql(OPTIMIZED_VIEW_SQL);
      console.log('[+] Applied optimized pins_daily_rollups_v2 view to Central Hub.');
    }
  } catch (err) {
    console.warn('[-] Hub view rollout note:', err.message);
  }

  // 2. Preload Shard Registry
  await preloadNeonRegistry(hubSql);

  const isCanary = process.argv.includes('--canary') || process.env.CANARY_ONLY === 'true';
  const targetShardArg = process.argv.find(a => a.startsWith('--shard='));
  const specificShard = targetShardArg ? parseInt(targetShardArg.split('=')[1], 10) : (isCanary ? 1 : null);

  if (specificShard) {
    console.log(`\n[*] 🧪 CANARY MODE: Testing view rollout on single shard #${specificShard}...`);
    try {
      const canarySql = await resolveShardConnection({ hubSql, shardId: specificShard });
      await canarySql(OPTIMIZED_VIEW_SQL);
      console.log(`[+] Successfully applied OPTIMIZED_VIEW_SQL to Canary Shard #${specificShard}.`);
      
      // Probe query to verify column resolution and execution plan
      const probeRows = await canarySql`
        SELECT pin_id, snapshot_date, save_count, serp_rankings 
        FROM pins_daily_rollups_v2 
        LIMIT 2;
      `;
      console.log(`[+] Canary query executed successfully! Rows returned: ${probeRows.length}`);
      console.log('✅ Canary Shard verification PASSED. Ready for full fleet propagation.');
      return;
    } catch (canaryErr) {
      console.error(`[-] ❌ Canary Shard #${specificShard} FAILED:`, canaryErr.message);
      process.exit(1);
    }
  }

  const shardIds = Array.from({ length: 99 }, (_, i) => i + 1);
  const CONCURRENCY = 15;
  let successfulShards = 0;
  let failedShards = 0;

  for (let i = 0; i < shardIds.length; i += CONCURRENCY) {
    const chunk = shardIds.slice(i, i + CONCURRENCY);
    console.log(`[*] Updating views on Shards [${chunk[0]}..${chunk[chunk.length - 1]}]...`);

    await Promise.allSettled(chunk.map(async (shardId) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId });
        await shardSql(OPTIMIZED_VIEW_SQL);
        successfulShards++;
      } catch (err) {
        failedShards++;
        console.warn(`  [!] Shard #${shardId} failed: ${err.message}`);
      }
    }));
  }

  console.log('\n===============================================================');
  console.log(`📊 ROLLOUT SUMMARY:`);
  console.log(`   - Successful Shards: ${successfulShards} / 99`);
  console.log(`   - Failed Shards:     ${failedShards} / 99`);
  console.log('===============================================================');

  if (successfulShards === 99) {
    console.log('✅ 100% of shards updated with optimized view!');
    process.exitCode = 0;
  } else {
    console.error('⚠️ Partial rollout to shards.');
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('[-] Fatal view rollout error:', err);
  process.exit(1);
});
