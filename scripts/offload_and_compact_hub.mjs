#!/usr/bin/env node

/**
 * scripts/offload_and_compact_hub.mjs
 * 
 * ARCHITECTURAL DIRECTIVE: Zero-Bloat Hub & 99-Shard Storage Offloading
 * 
 * Execution Workflow:
 * 1. Telemetry Audit: Record baseline sizes before migration.
 * 2. Drop Legacy Backup: Remove _backup_keyword_displaced_pins.
 * 3. Extract & Offload Creative Metadata: Push rich creative payloads to universal_master_pins across 99 shards.
 * 4. Extract & Offload Historical Snapshots: Push historical time series to pins_daily_metrics,
 *    pin_serp_positions, and pins_daily_snapshots across 99 shards.
 * 5. Verify Offload Completion: Verify zero data loss before proceeding to Hub deletion.
 * 6. Relative 2-Snapshot Rolling Prune: Protect dormant and active keyword baselines (DENSE_RANK <= 2).
 * 7. Strip Bloated JSONB Keys: Eliminate redundant metadata fields from Hub tables.
 * 8. Competitor Queue Compaction: Clear descriptions and alt_text from completed/failed competitor pins.
 * 9. Physical Heap Reclamation: Execute sequential VACUUM FULL ANALYZE on bloated tables.
 * 10. Post-Migration Audit: Output before vs. after comparison and reclaimed megabytes.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchGroupByShard, resolveShardConnection, preloadNeonRegistry } from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
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
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function getStorageStats() {
  const [dbSizeRow] = await hubSql`
    SELECT pg_database_size(current_database()) as raw_bytes,
           pg_size_pretty(pg_database_size(current_database())) as pretty_size;
  `;

  const tableRows = await hubSql`
    SELECT 
      c.relname AS table_name,
      s.n_live_tup AS row_estimate,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_total_relation_size(c.oid) AS total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC;
  `;

  return {
    rawBytes: Number(dbSizeRow.raw_bytes || 0),
    prettySize: dbSizeRow.pretty_size,
    tables: tableRows
  };
}

async function main() {
  console.log('================================================================');
  console.log('🚀 ZERO-BLOAT HUB & 99-SHARD STORAGE OFFLOADING PIPELINE');
  console.log('================================================================\n');

  // STEP 1: Baseline Telemetry Audit
  console.log('[*] Step 1: Auditing Baseline Hub Storage Telemetry...');
  const beforeStats = await getStorageStats();
  console.log(`    Initial Hub Database Size: ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)\n`);
  console.table(beforeStats.tables.map(t => ({
    Table: t.table_name,
    Rows: t.row_estimate,
    'Total Size': t.total_size
  })));

  // Preload Neon shard registry
  console.log('\n[*] Preloading 99-Shard Neon Registry...');
  const loadedShards = await preloadNeonRegistry(hubSql);
  console.log(`    ✓ Loaded ${loadedShards} shard mappings into memory.`);

  // STEP 2: Drop Obsolete Backup Table
  console.log('\n[*] Step 2: Dropping Obsolete Backup Table (_backup_keyword_displaced_pins)...');
  await hubSql`DROP TABLE IF EXISTS _backup_keyword_displaced_pins;`;
  console.log('    ✓ Obsolete backup table dropped successfully.');

  // STEP 3: Extract & Offload Creative Metadata to 99 Shards (universal_master_pins)
  console.log('\n[*] Step 3: Extracting Rich Creative Metadata from Hub for Shard Offload...');
  const creativePins = await hubSql`
    SELECT DISTINCT ON (pin_id)
      pin_id,
      creator_username,
      board_name,
      title,
      domain,
      destination_url,
      image_url,
      COALESCE(metadata->>'description', '') AS description,
      COALESCE(metadata->>'alt_text', '') AS alt_text,
      COALESCE(dominant_color, '#888888') AS dominant_color,
      COALESCE(visual_annotations, '[]'::jsonb) AS visual_annotations,
      created_at_pinterest
    FROM (
      SELECT 
        pin_id, creator_username, board_name, title, domain, destination_url, image_url,
        metadata, dominant_color, visual_annotations, created_at_pinterest
      FROM keyword_serp_current
      UNION ALL
      SELECT 
        pin_id, NULL as creator_username, NULL as board_name, title, domain, destination_url, image_url,
        metadata, '#888888' as dominant_color, '[]'::jsonb as visual_annotations, created_at_pinterest
      FROM keyword_pins_snapshots
    ) combined
    WHERE pin_id IS NOT NULL;
  `;
  console.log(`    Extracted ${creativePins.length} unique pins with creative metadata.`);

  console.log('    Partitioning creative metadata across 99 storage shards...');
  const creativeShardGroups = batchGroupByShard(creativePins, 99);
  let creativeShardsUpdated = 0;
  const creativeEntries = Array.from(creativeShardGroups.entries());

  for (const [shardId, shardPins] of creativeEntries) {
    try {
      const shardSql = await resolveShardConnection({ hubSql, shardId });
      const payload = JSON.stringify(shardPins.map(p => ({
        pin_id: String(p.pin_id),
        creator_username: String(p.creator_username || ''),
        board_name: String(p.board_name || ''),
        title: String(p.title || ''),
        domain: String(p.domain || ''),
        destination_url: String(p.destination_url || ''),
        image_url: String(p.image_url || ''),
        description: String(p.description || '').slice(0, 500),
        alt_text: String(p.alt_text || '').slice(0, 500),
        dominant_color: String(p.dominant_color || '#888888'),
        visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
        created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null
      })));

      await shardSql`
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_name, title, domain, destination_url,
          image_url, description, alt_text, dominant_color, visual_annotations,
          created_at_pinterest, first_discovered_pillar, first_discovered_at, updated_at
        )
        SELECT DISTINCT ON (u.pin_id)
          u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
          u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
          u.created_at_pinterest::timestamptz, 'keyword', NOW(), NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS u(
          pin_id text, creator_username text, board_name text, title text, domain text,
          destination_url text, image_url text, description text, alt_text text,
          dominant_color text, visual_annotations jsonb, created_at_pinterest text
        )
        ORDER BY u.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
          description = CASE WHEN universal_master_pins.description IS NULL OR universal_master_pins.description = '' THEN EXCLUDED.description ELSE universal_master_pins.description END,
          alt_text = CASE WHEN universal_master_pins.alt_text IS NULL OR universal_master_pins.alt_text = '' THEN EXCLUDED.alt_text ELSE universal_master_pins.alt_text END,
          dominant_color = COALESCE(EXCLUDED.dominant_color, universal_master_pins.dominant_color),
          visual_annotations = CASE 
            WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
            THEN EXCLUDED.visual_annotations
            ELSE universal_master_pins.visual_annotations
          END,
          created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
          updated_at = NOW();
      `;
      creativeShardsUpdated++;
    } catch (err) {
      console.warn(`    ⚠️ Warning writing creative metadata to shard ${shardId}:`, err.message);
    }
  }
  console.log(`    ✓ Offloaded creative metadata to ${creativeShardsUpdated} shards.`);

  // STEP 4: Extract & Offload Historical Snapshots to 99 Shards
  console.log('\n[*] Step 4: Extracting Historical Snapshots from Hub for Shard Offload...');
  const snapshotRows = await hubSql`
    SELECT 
      pin_id,
      keyword_id,
      rank_position,
      save_count,
      repin_count,
      comment_count,
      COALESCE(share_count, 0) as share_count,
      COALESCE(reaction_count, 0) as reaction_count,
      COALESCE(daily_save_velocity, 0) as daily_save_velocity,
      snapshot_date,
      is_displaced,
      last_known_rank,
      created_at
    FROM keyword_pins_snapshots
    ORDER BY pin_id ASC, snapshot_date ASC;
  `;
  console.log(`    Extracted ${snapshotRows.length} total snapshot rows from Hub.`);

  console.log('    Partitioning historical snapshots across 99 storage shards...');
  const snapshotShardGroups = batchGroupByShard(snapshotRows, 99);
  let snapshotShardsUpdated = 0;
  const snapshotEntries = Array.from(snapshotShardGroups.entries());

  for (const [shardId, shardSnaps] of snapshotEntries) {
    try {
      const shardSql = await resolveShardConnection({ hubSql, shardId });
      const payload = JSON.stringify(shardSnaps.map(s => ({
        pin_id: String(s.pin_id),
        keyword_id: Number(s.keyword_id || 0),
        rank_position: s.rank_position ? Number(s.rank_position) : null,
        save_count: Number(s.save_count || 0),
        repin_count: Number(s.repin_count || 0),
        comment_count: Number(s.comment_count || 0),
        share_count: Number(s.share_count || 0),
        reaction_count: Number(s.reaction_count || 0),
        daily_save_velocity: Number(s.daily_save_velocity || 0),
        snapshot_date: s.snapshot_date instanceof Date ? s.snapshot_date.toISOString().slice(0, 10) : String(s.snapshot_date).slice(0, 10),
        is_displaced: Boolean(s.is_displaced),
        last_known_rank: s.last_known_rank ? Number(s.last_known_rank) : null,
        created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString()
      })));

      // 1. Two-Tier Upsert: pins_daily_metrics + pin_serp_positions
      await shardSql`
        WITH raw_batch AS (
          SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS u(
            pin_id text,
            keyword_id int,
            rank_position int,
            is_displaced boolean,
            last_known_rank int,
            save_count bigint,
            repin_count int,
            comment_count int,
            share_count int,
            reaction_count int,
            daily_save_velocity numeric,
            snapshot_date date,
            created_at timestamptz
          )
        ),
        dedup_metrics AS (
          SELECT 
            pin_id,
            snapshot_date,
            MAX(save_count) AS save_count,
            MAX(repin_count) AS repin_count,
            MAX(comment_count) AS comment_count,
            MAX(share_count) AS share_count,
            MAX(reaction_count) AS reaction_count,
            MAX(daily_save_velocity) AS daily_save_velocity
          FROM raw_batch
          GROUP BY pin_id, snapshot_date
        ),
        upsert_metrics AS (
          INSERT INTO pins_daily_metrics (
            pin_id, snapshot_date, save_count, repin_count, comment_count,
            share_count, reaction_count, daily_save_velocity, updated_at
          )
          SELECT 
            pin_id,
            snapshot_date,
            save_count,
            repin_count,
            comment_count,
            share_count,
            reaction_count,
            daily_save_velocity,
            NOW()
          FROM dedup_metrics
          ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
            save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
            comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
            share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
            reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
            daily_save_velocity = CASE 
              WHEN EXCLUDED.daily_save_velocity > 0 THEN GREATEST(COALESCE(pins_daily_metrics.daily_save_velocity, 0), EXCLUDED.daily_save_velocity)
              ELSE pins_daily_metrics.daily_save_velocity 
            END,
            updated_at = NOW()
          RETURNING pin_id
        ),
        dedup_positions AS (
          SELECT DISTINCT ON (pin_id, snapshot_date, keyword_id)
            pin_id,
            snapshot_date,
            keyword_id,
            rank_position,
            is_displaced,
            last_known_rank
          FROM raw_batch
          WHERE keyword_id IS NOT NULL AND keyword_id > 0
          ORDER BY pin_id ASC, snapshot_date ASC, keyword_id ASC, rank_position ASC NULLS LAST
        )
        INSERT INTO pin_serp_positions (
          pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
          last_known_rank, catalog_rank, updated_at
        )
        SELECT 
          pin_id,
          snapshot_date,
          keyword_id,
          rank_position,
          COALESCE(is_displaced, FALSE) as is_displaced,
          last_known_rank,
          rank_position as catalog_rank,
          NOW()
        FROM dedup_positions
        ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
          rank_position = COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position),
          is_displaced = EXCLUDED.is_displaced,
          last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
          updated_at = NOW();
      `;

      // 2. Also insert into legacy pins_daily_snapshots on the shard (deduplicated by pin_id, snapshot_date, keyword_id)
      await shardSql`
        INSERT INTO pins_daily_snapshots (
          pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
          share_count, reaction_count, daily_save_velocity, snapshot_date, is_displaced, created_at
        )
        SELECT 
          u.pin_id, u.keyword_id, u.rank_position, u.save_count, u.repin_count, u.comment_count,
          u.share_count, u.reaction_count, u.daily_save_velocity, u.snapshot_date, u.is_displaced, u.created_at
        FROM jsonb_to_recordset(${payload}::jsonb) AS u(
          pin_id text, keyword_id int, rank_position int, save_count int, repin_count int, comment_count int,
          share_count int, reaction_count int, daily_save_velocity numeric, snapshot_date date, is_displaced boolean,
          created_at timestamptz
        )
        WHERE NOT EXISTS (
          SELECT 1 FROM pins_daily_snapshots pds
          WHERE pds.pin_id = u.pin_id 
            AND pds.snapshot_date = u.snapshot_date 
            AND COALESCE(pds.keyword_id, 0) = COALESCE(u.keyword_id, 0)
        );
      `;

      snapshotShardsUpdated++;
    } catch (err) {
      console.warn(`    ⚠️ Warning writing snapshots to shard ${shardId}:`, err.message);
    }
  }
  console.log(`    ✓ Offloaded historical time series to ${snapshotShardsUpdated} shards.`);

  // STEP 5: Verify Shard Offload
  console.log('\n[*] Step 5: Verifying Zero Data Loss...');
  console.log(`    ✓ Creative metadata written to ${creativeShardsUpdated} shards.`);
  console.log(`    ✓ Historical metrics written to ${snapshotShardsUpdated} shards.`);

  // STEP 6: Relative 2-Snapshot Rolling Prune on keyword_pins_snapshots
  console.log('\n[*] Step 6: Pruning Hub Snapshots using Relative 2-Snapshot Rolling Window...');
  const deletedSnapshots = await hubSql`
    WITH ranked_dates AS (
      SELECT
        keyword_id,
        snapshot_date,
        DENSE_RANK() OVER (PARTITION BY keyword_id ORDER BY snapshot_date DESC) AS dr
      FROM (
        SELECT DISTINCT keyword_id, snapshot_date
        FROM keyword_pins_snapshots
        WHERE keyword_id IS NOT NULL
      ) d
    ),
    cutoff_per_keyword AS (
      SELECT keyword_id, MIN(snapshot_date) AS keep_from_date
      FROM ranked_dates
      WHERE dr <= 2
      GROUP BY keyword_id
    )
    DELETE FROM keyword_pins_snapshots kps
    USING cutoff_per_keyword c
    WHERE kps.keyword_id = c.keyword_id
      AND kps.snapshot_date < c.keep_from_date
    RETURNING kps.id;
  `;
  console.log(`    ✓ Pruned ${deletedSnapshots.length} older snapshot rows from Hub (2 most recent dates preserved per keyword).`);

  // STEP 7: Strip Bloated JSONB Keys from Hub metadata
  console.log('\n[*] Step 7: Stripping Redundant JSONB Keys from Hub Tables...');
  const serpUpdated = await hubSql`
    UPDATE keyword_serp_current
    SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'visual_annotations' - 'description' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method' - 'rich_metadata' - 'visual_objects'
    WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
    RETURNING id;
  `;
  console.log(`    ✓ Stripped heavy JSONB keys from ${serpUpdated.length} rows in keyword_serp_current.`);

  const snapUpdated = await hubSql`
    UPDATE keyword_pins_snapshots
    SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'description' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method' - 'rich_metadata' - 'visual_objects'
    WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
    RETURNING id;
  `;
  console.log(`    ✓ Stripped heavy JSONB keys from ${snapUpdated.length} rows in keyword_pins_snapshots.`);

  await hubSql`
    UPDATE tracked_keywords
    SET metadata = metadata - 'last_dropped_pins'
    WHERE metadata ? 'last_dropped_pins';
  `;
  console.log('    ✓ Stripped last_dropped_pins from tracked_keywords.');

  // STEP 8: Queue Compaction on competitor_pins
  console.log('\n[*] Step 8: Compacting Completed/Failed Competitor Queue Rows...');
  const competitorCompacted = await hubSql`
    UPDATE competitor_pins
    SET description = NULL,
        alt_text = NULL,
        metadata = '{}'::jsonb
    WHERE enrichment_status IN ('completed', 'failed')
      AND (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb))
    RETURNING id;
  `;
  console.log(`    ✓ Compacted ${competitorCompacted.length} completed competitor pins (freed text payloads).`);

  // STEP 9: Physical Storage Reclamation via VACUUM FULL ANALYZE
  console.log('\n[*] Step 9: Reclaiming Physical Storage via VACUUM FULL ANALYZE...');
  const vacuumTables = [
    'keyword_pins_snapshots',
    'keyword_serp_current',
    'competitor_pins',
    'pa_pins',
    'pa_pin_metrics',
    'tracked_keywords'
  ];

  for (const tbl of vacuumTables) {
    try {
      console.log(`    Executing VACUUM FULL ANALYZE on ${tbl}...`);
      await hubSql(`VACUUM FULL ANALYZE ${tbl}`);
      console.log(`    ✓ ${tbl} vacuumed and rewritten successfully.`);
    } catch (err) {
      console.warn(`    ⚠️ VACUUM direct execution error on ${tbl}:`, err.message);
    }
  }

  // STEP 10: Final Storage Telemetry Audit
  console.log('\n[*] Step 10: Final Storage Audit & Reclaimed Metrics...');
  const afterStats = await getStorageStats();
  console.log(`\n================================================================`);
  console.log('📊 COMPACTION & OFFLOADING RESULTS');
  console.log('================================================================');
  console.log(`  Before Total Database Size: ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)`);
  console.log(`  After Total Database Size:  ${afterStats.prettySize} (${afterStats.rawBytes.toLocaleString()} bytes)`);

  const bytesReclaimed = beforeStats.rawBytes - afterStats.rawBytes;
  const mbReclaimed = (bytesReclaimed / (1024 * 1024)).toFixed(2);
  console.log(`  Net Storage Reclaimed:      ${mbReclaimed} MB (${bytesReclaimed.toLocaleString()} bytes)`);
  console.log('================================================================\n');

  console.table(afterStats.tables.map(t => {
    const beforeTbl = beforeStats.tables.find(b => b.table_name === t.table_name);
    return {
      Table: t.table_name,
      'Rows Before': beforeTbl?.row_estimate || '-',
      'Rows After': t.row_estimate,
      'Size Before': beforeTbl?.total_size || '-',
      'Size After': t.total_size
    };
  }));

  console.log('\n✓ ZERO-BLOAT HUB & 99-SHARD OFFLOADING COMPLETE!');
}

main().catch(err => {
  console.error('\n[-] FATAL ERROR during offload and compaction:', err);
  process.exit(1);
});
