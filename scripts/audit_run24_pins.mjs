// scripts/audit_run24_pins.mjs
import { neon } from '@neondatabase/serverless';
import { preloadNeonRegistry, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';

const sql = neon(process.env.DATABASE_URL);

async function verifyRun24() {
  console.log('=============================================================================');
  console.log('   🔍 FORENSIC AUDIT: PIPELINE RUN #24 VERIFICATION (CENTRAL HUB & SHARDS)');
  console.log('=============================================================================');

  console.log('\n=== 1. Tracked Keywords Last Crawl Window ===');
  const keywords = await sql`
    SELECT 
      id, 
      keyword, 
      category, 
      target_pin_count, 
      avg_daily_velocity, 
      last_crawled_at,
      CASE 
        WHEN last_crawled_at >= NOW() - INTERVAL '6 hours' THEN '🟢 Updated Today'
        ELSE '🔴 Stale / Not Updated'
      END as status
    FROM tracked_keywords
    WHERE is_active = TRUE
    ORDER BY last_crawled_at DESC NULLS LAST;
  `;
  console.table(keywords);

  console.log('\n=== 2. Detailed Pin Inspection Counts per Keyword (Last 6 Hours) ===');
  // Note: ksc uses crawled_at (not last_crawled_at).
  const pinAudit = await sql`
    SELECT 
      tk.id as keyword_id,
      tk.keyword,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.is_displaced = FALSE) as active_serp_pins,
      COUNT(DISTINCT ksc.pin_id) as total_catalog_pins,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.crawled_at >= NOW() - INTERVAL '6 hours') as inspected_today,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.daily_save_velocity IS NOT NULL) as pins_with_velocity,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.daily_save_velocity > 0) as rising_pins,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.daily_save_velocity = 0) as zero_velocity_pins,
      COUNT(DISTINCT ksc.pin_id) FILTER (WHERE ksc.metadata->>'status' = 'archived_404') as dead_404_pins,
      ROUND(AVG(ksc.daily_save_velocity), 2) as calculated_avg_velocity,
      MAX(ksc.crawled_at) as latest_pin_crawled_at
    FROM tracked_keywords tk
    LEFT JOIN keyword_serp_current ksc ON ksc.keyword_id = tk.id
    WHERE tk.is_active = TRUE
    GROUP BY tk.id, tk.keyword
    ORDER BY tk.id ASC;
  `;
  console.table(pinAudit);

  console.log('\n=== 3. Central Hub Snapshots Telemetry Audit (keyword_pins_snapshots) ===');
  const hubSnapshots = await sql`
    SELECT 
      tk.keyword,
      COUNT(DISTINCT kps.pin_id) as unique_pins_recorded_today,
      COUNT(*) as total_metric_snapshots_today,
      MIN(kps.created_at) as earliest_snapshot,
      MAX(kps.created_at) as latest_snapshot
    FROM keyword_pins_snapshots kps
    JOIN tracked_keywords tk ON kps.keyword_id = tk.id
    WHERE kps.created_at >= NOW() - INTERVAL '6 hours'
    GROUP BY tk.keyword
    ORDER BY unique_pins_recorded_today DESC;
  `;
  console.table(hubSnapshots);

  console.log('\n=== 4. Two-Tier Multi-SERP Shard Telemetry Audit (pins_daily_metrics on Shards) ===');
  await preloadNeonRegistry(sql);
  let totalShardMetrics = 0;
  let totalShardPositions = 0;
  let sampledShardsCount = 0;
  const sampleShards = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

  for (const shardId of sampleShards) {
    try {
      const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
      const [mRow] = await shardSql`
        SELECT COUNT(*) as count FROM pins_daily_metrics 
        WHERE snapshot_date = (NOW() AT TIME ZONE 'UTC')::date;
      `;
      const [pRow] = await shardSql`
        SELECT COUNT(*) as count FROM pin_serp_positions 
        WHERE snapshot_date = (NOW() AT TIME ZONE 'UTC')::date;
      `;
      totalShardMetrics += Number(mRow.count);
      totalShardPositions += Number(pRow.count);
      sampledShardsCount++;
    } catch (_) {}
  }

  const estimatedFleetMetrics = Math.round((totalShardMetrics / sampledShardsCount) * 99);
  const estimatedFleetPositions = Math.round((totalShardPositions / sampledShardsCount) * 99);
  console.log(`Sampled ${sampledShardsCount} shards: found ${totalShardMetrics} metric rows & ${totalShardPositions} position rows today.`);
  console.log(`Extrapolated 99-Shard Fleet Total: ~${estimatedFleetMetrics} pins_daily_metrics snapshots & ~${estimatedFleetPositions} pin_serp_positions for today.`);
}

verifyRun24().catch(console.error);
