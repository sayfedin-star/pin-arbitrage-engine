/**
 * scripts/migrate_two_tier_shards.mjs
 * Two-Tier Schema Rollout across the 99 Neon Storage Shards
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

async function rolloutShardsDDL() {
  console.log('===============================================================');
  console.log('🚀 TWO-TIER SHARD DDL ROLLOUT (99 NEON STORAGE SHARDS)');
  console.log('===============================================================');

  console.log('[*] Preloading Neon Shard Registry from Central Hub...');
  const activeMappings = await preloadNeonRegistry(hubSql);
  console.log(`[+] Loaded ${activeMappings} shard mappings from registry.`);

  const shardIds = Array.from({ length: 99 }, (_, i) => i + 1);
  const SHARD_CONCURRENCY = 10;
  let successfulShards = 0;
  let failedShards = 0;
  const failureLog = [];

  for (let i = 0; i < shardIds.length; i += SHARD_CONCURRENCY) {
    const chunk = shardIds.slice(i, i + SHARD_CONCURRENCY);
    console.log(`[*] Processing Shards [${chunk[0]}..${chunk[chunk.length - 1]}]...`);

    await Promise.allSettled(chunk.map(async (shardId) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId });

        // 1. Table pins_daily_metrics
        await shardSql`
          CREATE TABLE IF NOT EXISTS pins_daily_metrics (
            pin_id VARCHAR(64) NOT NULL,
            snapshot_date DATE NOT NULL,
            save_count BIGINT NOT NULL DEFAULT 0,
            repin_count INT NOT NULL DEFAULT 0,
            comment_count INT NOT NULL DEFAULT 0,
            share_count INT NOT NULL DEFAULT 0,
            reaction_count INT NOT NULL DEFAULT 0,
            daily_save_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_pins_daily_metrics PRIMARY KEY (pin_id, snapshot_date)
          );
        `;

        await shardSql`
          CREATE INDEX IF NOT EXISTS idx_pdm_pin_date_desc 
          ON pins_daily_metrics (pin_id, snapshot_date DESC);
        `;

        // 2. Table pin_serp_positions (with snapshot_date in the middle for chronological joins)
        await shardSql`
          CREATE TABLE IF NOT EXISTS pin_serp_positions (
            pin_id VARCHAR(64) NOT NULL,
            snapshot_date DATE NOT NULL,
            keyword_id INT NOT NULL,
            rank_position INT,
            is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
            last_known_rank INT,
            catalog_rank INT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_pin_serp_positions PRIMARY KEY (pin_id, snapshot_date, keyword_id)
          );
        `;

        await shardSql`
          CREATE INDEX IF NOT EXISTS idx_psp_kw_date 
          ON pin_serp_positions (keyword_id, snapshot_date DESC);
        `;

        // 3. View pins_daily_rollups_v2 (Optimized LEFT JOIN LATERAL with index pushdown)
        await shardSql`
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

        successfulShards++;
      } catch (err) {
        failedShards++;
        failureLog.push(`Shard #${shardId}: ${err.message}`);
        console.warn(`  [!] Shard #${shardId} failed: ${err.message}`);
      }
    }));
  }

  console.log('\n===============================================================');
  console.log(`📊 ROLLOUT SUMMARY:`);
  console.log(`   - Successful Shards: ${successfulShards} / 99 (${Math.round((successfulShards / 99) * 100)}%)`);
  console.log(`   - Failed Shards:     ${failedShards} / 99`);
  if (failureLog.length > 0) {
    console.log(`   - Failures:\n     ${failureLog.join('\n     ')}`);
  }
  console.log('===============================================================');

  if (successfulShards === 99) {
    console.log('🟢 VERIFICATION GATE 2: PASSED 100% ACROSS ALL 99 SHARDS!');
    process.exitCode = 0;
  } else {
    console.error('🔴 VERIFICATION GATE 2: PARTIAL OR FAILED ROLLOUT');
    process.exitCode = 1;
  }
}

rolloutShardsDDL().catch(err => {
  console.error('[-] Fatal Rollout Error:', err);
  process.exitCode = 1;
});
