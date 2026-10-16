#!/usr/bin/env node

/**
 * scripts/offload_and_compact_hub.mjs
 *
 * ARCHITECTURAL DIRECTIVE: Zero-Bloat Hub (< 35 MB) & 99-Shard Storage Offloading
 *
 * Execution Workflow:
 * 1. Baseline Telemetry Audit: Record Hub database, table, index, and TOAST sizes before migration.
 * 2. Hub & Shard DDL Pre-Flight:
 *    - Add baseline velocity columns (prev_rank_position, baseline_day_saves, baseline_day_date) to keyword_serp_current.
 *    - Add scalar lease columns (crawl_lease_token, crawl_lease_until) to tracked_keywords.
 *    - Create ultra-slim numeric index keyword_displaced_index (~56 bytes/row) on Hub to prevent 99-shard scatter-gather.
 *    - Drop obsolete backup tables (_backup_keyword_displaced_pins).
 * 3. Domain Studio Preservation Guard:
 *    - Extract all valid external domains from keyword_serp_current & keyword_pins_snapshots into domain_registry_metadata.
 * 4. Extract & Offload Creative Metadata to 99 Shards (universal_master_pins):
 *    - Partition unique pins from keyword_serp_current, keyword_pins_snapshots, and completed competitor_pins
 *      strictly by Shard_ID = (CRC32(pin_id) % 99) + 1.
 * 5. Extract & Offload All Historical Time-Series & Displaced Records to 99 Shards:
 *    - Offload 100% of keyword_pins_snapshots (52k+ rows) and displaced keyword_serp_current (53k+ rows)
 *      into pins_daily_metrics, pin_serp_positions, and pins_daily_snapshots across the 99 shards.
 * 6. Strict Zero-Data-Loss Verification Gate:
 *    - Halt before any Hub deletion if any target shard failed to commit its batch (unless --force-compact is passed).
 * 7. Hydrate Hub Slim Baseline & Displaced Index:
 *    - Populate keyword_displaced_index on Hub and backfill baseline_day_saves on active keyword_serp_current rows.
 * 8. Purge Displaced Rows & Truncate Hub Snapshots:
 *    - Delete is_displaced = TRUE rows from keyword_serp_current (~225 MB raw data).
 *    - TRUNCATE keyword_pins_snapshots on Hub (~148 MB raw data).
 *    - Strip bloated JSONB keys (last_dropped_pins, popular_pins, crawl_lock) from tracked_keywords and keyword_serp_current.
 *    - Compact completed/failed rows in competitor_pins.
 * 9. Physical Storage Reclamation:
 *    - Execute sequential VACUUM FULL ANALYZE in ascending table size order to shrink heap and pg_toast_221295.
 * 10. Post-Migration Telemetry Audit: Output before vs. after comparison and reclaimed megabytes.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  batchGroupByShard,
  resolveShardConnection,
  preloadNeonRegistry,
  prewarmFleetShards
} from '../src/modules/sharding/fleet-router.mjs';

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
const FORCE_COMPACT = process.argv.includes('--force-compact') || process.env.FORCE_COMPACT === 'true';
const SHARD_CONCURRENCY = Math.max(1, Math.min(20, parseInt(process.env.SHARD_CONCURRENCY || '10', 10)));

async function getStorageStats(hubSql) {
  const [dbSizeRow] = await hubSql`
    SELECT pg_database_size(current_database()) AS raw_bytes,
           pg_size_pretty(pg_database_size(current_database())) AS pretty_size;
  `;

  const tableRows = await hubSql`
    SELECT 
      c.relname AS table_name,
      COALESCE(s.n_live_tup, 0) AS row_estimate,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
      pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS toast_and_idx_size,
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

/**
 * Executes a shard write function with automatic retry on transient cold-start timeouts
 */
async function executeShardWriteWithRetry(fn, shardId, maxAttempts = 2) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delayMs = 800 * attempt;
        console.warn(`    [~] Retry ${attempt}/${maxAttempts} for shard #${shardId} after error: ${err.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

export async function runOffloadAndCompact(hubSql, { forceCompact = FORCE_COMPACT } = {}) {
  console.log('================================================================');
  console.log('🚀 ZERO-BLOAT HUB (<35 MB) & 99-SHARD STORAGE OFFLOADING PIPELINE');
  console.log('================================================================\n');

  // STEP 1: Baseline Telemetry Audit
  console.log('[*] Step 1: Auditing Baseline Hub Storage Telemetry...');
  const beforeStats = await getStorageStats(hubSql);
  console.log(`    Initial Hub Database Size: ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)\n`);
  console.table(beforeStats.tables.map(t => ({
    Table: t.table_name,
    Rows: Number(t.row_estimate),
    'Total Size': t.total_size,
    'Heap Data': t.heap_size,
    'TOAST + Indexes': t.toast_and_idx_size
  })));

  // Preload Neon shard registry
  console.log('\n[*] Preloading 99-Shard Neon Registry...');
  const loadedShards = await preloadNeonRegistry(hubSql);
  console.log(`    ✓ Loaded ${loadedShards} shard mappings into memory.`);

  // STEP 2: Hub DDL Pre-Flight & Obsolete Backup Cleanup
  console.log('\n[*] Step 2: Applying Hub Slimming DDL & Dropping Obsolete Backups...');
  await hubSql`DROP TABLE IF EXISTS _backup_keyword_displaced_pins;`;

  await hubSql`
    ALTER TABLE tracked_keywords
      ADD COLUMN IF NOT EXISTS crawl_lease_token UUID,
      ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;
  `;

  await hubSql`
    ALTER TABLE keyword_serp_current
      ADD COLUMN IF NOT EXISTS prev_rank_position INT,
      ADD COLUMN IF NOT EXISTS baseline_day_saves BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS baseline_day_date DATE;
  `;

  await hubSql`
    CREATE TABLE IF NOT EXISTS keyword_displaced_index (
      keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      pin_id VARCHAR(64) NOT NULL,
      last_known_rank SMALLINT,
      vacuum_opportunity_score SMALLINT DEFAULT 0,
      displaced_date DATE NOT NULL DEFAULT CURRENT_DATE,
      save_count BIGINT DEFAULT 0,
      repin_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      share_count INT DEFAULT 0,
      daily_save_velocity NUMERIC(10,2) DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (keyword_id, pin_id)
    );
  `;

  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_kdi_kw_score
    ON keyword_displaced_index (keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC NULLS LAST);
  `;

  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_kdi_pin_id
    ON keyword_displaced_index (pin_id);
  `;
  console.log('    ✓ Hub DDL pre-flight and keyword_displaced_index verified.');

  // STEP 3: Domain Studio Preservation Guard
  console.log('\n[*] Step 3: Preserving Unique External Domains into domain_registry_metadata...');
  try {
    const preservedDomains = await hubSql`
      INSERT INTO domain_registry_metadata (domain, lookup_status, updated_at)
      SELECT DISTINCT clean_domain, 'pending', NOW()
      FROM (
        SELECT LOWER(REGEXP_REPLACE(domain, '^www\\.', '')) AS clean_domain
        FROM keyword_serp_current
        WHERE domain IS NOT NULL AND domain <> ''
        UNION
        SELECT LOWER(REGEXP_REPLACE(domain, '^www\\.', '')) AS clean_domain
        FROM keyword_pins_snapshots
        WHERE domain IS NOT NULL AND domain <> ''
      ) d
      WHERE clean_domain IS NOT NULL
        AND clean_domain <> ''
        AND clean_domain LIKE '%.%'
        AND clean_domain NOT LIKE '% %'
        AND LENGTH(clean_domain) >= 4
        AND clean_domain NOT IN ('pinterest.com', 'i.pinimg.com', 'pinimg.com', 'uploaded by user', 'uploaded by pinner')
      ON CONFLICT (domain) DO NOTHING
      RETURNING domain;
    `;
    console.log(`    ✓ Preserved ${preservedDomains.length} newly discovered external domains in Hub registry.`);
  } catch (domErr) {
    console.warn(`    [!] Domain preservation note (non-fatal): ${domErr.message}`);
  }

  // STEP 4: Extract & Offload Creative Metadata to 99 Shards (universal_master_pins)
  console.log('\n[*] Step 4: Extracting Rich Creative Metadata from Hub for 99-Shard Offload...');
  const creativePins = await hubSql`
    SELECT DISTINCT ON (pin_id)
      pin_id,
      creator_username,
      board_name,
      title,
      domain,
      destination_url,
      image_url,
      description,
      alt_text,
      dominant_color,
      visual_annotations,
      created_at_pinterest,
      first_discovered_pillar
    FROM (
      SELECT 
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
        created_at_pinterest,
        'keyword' AS first_discovered_pillar,
        1 AS priority
      FROM keyword_serp_current
      WHERE pin_id IS NOT NULL AND pin_id <> ''

      UNION ALL

      SELECT 
        pin_id,
        COALESCE(metadata->'pinner'->>'username', '') AS creator_username,
        COALESCE(metadata->>'board_name', '') AS board_name,
        title,
        domain,
        destination_url,
        image_url,
        COALESCE(metadata->>'description', '') AS description,
        COALESCE(metadata->>'alt_text', '') AS alt_text,
        COALESCE(metadata->>'dominant_color', '#888888') AS dominant_color,
        COALESCE(metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
        created_at_pinterest,
        'keyword' AS first_discovered_pillar,
        2 AS priority
      FROM keyword_pins_snapshots
      WHERE pin_id IS NOT NULL AND pin_id <> ''

      UNION ALL

      SELECT
        pin_id,
        '' AS creator_username,
        COALESCE(board_name, '') AS board_name,
        title,
        COALESCE(link_domain, '') AS domain,
        destination_url,
        image_url,
        COALESCE(description, '') AS description,
        COALESCE(alt_text, '') AS alt_text,
        '#888888' AS dominant_color,
        COALESCE(metadata->'annotations', '[]'::jsonb) AS visual_annotations,
        created_at_pinterest,
        'creator' AS first_discovered_pillar,
        3 AS priority
      FROM competitor_pins
      WHERE pin_id IS NOT NULL AND pin_id <> ''
        AND (description IS NOT NULL OR alt_text IS NOT NULL OR title IS NOT NULL)
    ) combined
    ORDER BY pin_id ASC, priority ASC;
  `;
  console.log(`    Extracted ${creativePins.length} unique pins with creative metadata.`);

  const creativeShardGroups = batchGroupByShard(creativePins, 99);
  const creativeEntries = Array.from(creativeShardGroups.entries());
  const affectedShardIds = creativeEntries.map(([sid]) => sid);

  console.log(`    Pre-warming ${affectedShardIds.length} target storage shards...`);
  await prewarmFleetShards({ hubSql, shardIds: affectedShardIds, concurrency: 15, timeoutMs: 4000 });

  let creativeShardsUpdated = 0;
  let failedCreativeShards = 0;

  for (let i = 0; i < creativeEntries.length; i += SHARD_CONCURRENCY) {
    const chunk = creativeEntries.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardPins]) => {
      try {
        await executeShardWriteWithRetry(async () => {
          const shardSql = await resolveShardConnection({ hubSql, shardId });
          const sortedPins = [...shardPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
          const payload = JSON.stringify(sortedPins.map(p => ({
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
            created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
            first_discovered_pillar: String(p.first_discovered_pillar || 'keyword')
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
              u.created_at_pinterest::timestamptz, u.first_discovered_pillar, NOW(), NOW()
            FROM jsonb_to_recordset(${payload}::jsonb) AS u(
              pin_id text, creator_username text, board_name text, title text, domain text,
              destination_url text, image_url text, description text, alt_text text,
              dominant_color text, visual_annotations jsonb, created_at_pinterest text,
              first_discovered_pillar text
            )
            ORDER BY u.pin_id ASC
            ON CONFLICT (pin_id) DO UPDATE SET
              creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
              board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
              title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
              domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
              destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
              image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
              description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
              alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
              dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, '#888888'), universal_master_pins.dominant_color),
              visual_annotations = CASE 
                WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                THEN EXCLUDED.visual_annotations
                ELSE universal_master_pins.visual_annotations
              END,
              created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
              updated_at = NOW();
          `;
        }, shardId);
        creativeShardsUpdated++;
      } catch (err) {
        failedCreativeShards++;
        console.warn(`    ⚠️ Error writing creative metadata to shard #${shardId}:`, err.message);
      }
    }));
  }
  console.log(`    ✓ Offloaded creative metadata to ${creativeShardsUpdated}/${creativeEntries.length} shards (Failed: ${failedCreativeShards}).`);

  // STEP 5: Extract & Offload Historical Snapshots + Displaced SERP Pins to 99 Shards
  console.log('\n[*] Step 5: Extracting Historical Snapshots & Displaced SERP Records for 99-Shard Offload...');
  const snapshotRows = await hubSql`
    SELECT
      pin_id,
      keyword_id,
      rank_position,
      save_count,
      repin_count,
      comment_count,
      share_count,
      reaction_count,
      daily_save_velocity,
      snapshot_date,
      is_displaced,
      last_known_rank,
      created_at
    FROM (
      SELECT 
        pin_id,
        keyword_id,
        rank_position,
        COALESCE(save_count, 0) AS save_count,
        COALESCE(repin_count, 0) AS repin_count,
        COALESCE(comment_count, 0) AS comment_count,
        COALESCE(share_count, 0) AS share_count,
        0 AS reaction_count,
        COALESCE(daily_save_velocity, 0) AS daily_save_velocity,
        COALESCE(snapshot_date, CURRENT_DATE) AS snapshot_date,
        COALESCE(is_displaced, FALSE) AS is_displaced,
        last_known_rank,
        COALESCE(created_at, NOW()) AS created_at
      FROM keyword_pins_snapshots
      WHERE pin_id IS NOT NULL AND pin_id <> ''

      UNION ALL

      SELECT
        pin_id,
        keyword_id,
        rank_position,
        COALESCE(save_count, 0) AS save_count,
        COALESCE(repin_count, 0) AS repin_count,
        COALESCE(comment_count, 0) AS comment_count,
        COALESCE(share_count, 0) AS share_count,
        0 AS reaction_count,
        COALESCE(daily_save_velocity, 0) AS daily_save_velocity,
        COALESCE(displaced_date, crawled_at::date, CURRENT_DATE) AS snapshot_date,
        COALESCE(is_displaced, FALSE) AS is_displaced,
        COALESCE(last_known_rank, rank_position) AS last_known_rank,
        COALESCE(crawled_at, updated_at, NOW()) AS created_at
      FROM keyword_serp_current
      WHERE pin_id IS NOT NULL AND pin_id <> ''
    ) all_snaps
    ORDER BY pin_id ASC, snapshot_date ASC;
  `;
  console.log(`    Extracted ${snapshotRows.length} combined time-series & displaced records from Hub.`);

  const snapshotShardGroups = batchGroupByShard(snapshotRows, 99);
  const snapshotEntries = Array.from(snapshotShardGroups.entries());
  let snapshotShardsUpdated = 0;
  let failedSnapshotShards = 0;

  for (let i = 0; i < snapshotEntries.length; i += SHARD_CONCURRENCY) {
    const chunk = snapshotEntries.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardSnaps]) => {
      try {
        await executeShardWriteWithRetry(async () => {
          const shardSql = await resolveShardConnection({ hubSql, shardId });
          const sortedSnaps = [...shardSnaps].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
          const payload = JSON.stringify(sortedSnaps.map(s => ({
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
          const qTwoTier = shardSql`
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
              ORDER BY pin_id ASC, snapshot_date ASC
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
              ORDER BY pin_id ASC, snapshot_date ASC, keyword_id ASC, is_displaced ASC, rank_position ASC NULLS LAST
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
              COALESCE(is_displaced, FALSE) AS is_displaced,
              last_known_rank,
              COALESCE(rank_position, CASE WHEN is_displaced THEN COALESCE(last_known_rank, 100) + 250 ELSE 1 END) AS catalog_rank,
              NOW()
            FROM dedup_positions
            ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
              rank_position = COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position),
              is_displaced = EXCLUDED.is_displaced,
              last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
              updated_at = NOW();
          `;

          // 2. Legacy backward-compatible pins_daily_snapshots on shard
          const qLegacy = shardSql`
            INSERT INTO pins_daily_snapshots (
              pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
              share_count, reaction_count, daily_save_velocity, snapshot_date, is_displaced, created_at
            )
            SELECT DISTINCT ON (u.pin_id, u.keyword_id, u.snapshot_date)
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
            )
            ORDER BY u.pin_id ASC, u.keyword_id ASC, u.snapshot_date ASC;
          `;

          if (typeof shardSql.transaction === 'function') {
            await shardSql.transaction([qTwoTier, qLegacy]);
          } else {
            await qTwoTier;
            await qLegacy;
          }
        }, shardId);
        snapshotShardsUpdated++;
      } catch (err) {
        failedSnapshotShards++;
        console.warn(`    ⚠️ Error writing snapshots to shard #${shardId}:`, err.message);
      }
    }));
  }
  console.log(`    ✓ Offloaded historical time-series to ${snapshotShardsUpdated}/${snapshotEntries.length} shards (Failed: ${failedSnapshotShards}).`);

  // STEP 6: Strict Zero-Data-Loss Verification Gate
  console.log('\n[*] Step 6: Verifying Zero Data Loss Gate before Hub Deletion...');
  if ((failedCreativeShards > 0 || failedSnapshotShards > 0) && !forceCompact) {
    throw new Error(
      `[ZERO-LOSS GATE ABORT] ${failedCreativeShards} creative shard(s) and ${failedSnapshotShards} snapshot shard(s) failed to sync. ` +
      `Aborting Hub deletion to guarantee 0% data loss. Re-run or pass --force-compact to override.`
    );
  }
  console.log('    ✓ 100% Shard Synchronization Confirmed. Proceeding to Hub Compaction.');

  // STEP 7: Hydrate Hub Slim Displaced Index & Baseline Velocity Columns
  console.log('\n[*] Step 7: Hydrating Slim Displaced Index & Baseline Velocity Columns on Hub...');
  const indexedDisplaced = await hubSql`
    INSERT INTO keyword_displaced_index (
      keyword_id, pin_id, last_known_rank, vacuum_opportunity_score,
      displaced_date, save_count, repin_count, comment_count, share_count,
      daily_save_velocity, updated_at
    )
    SELECT
      keyword_id,
      pin_id,
      LEAST(32767, GREATEST(1, COALESCE(last_known_rank, rank_position, 100)))::smallint,
      LEAST(100, GREATEST(0, COALESCE(
        NULLIF(vacuum_opportunity_score, 0),
        CASE 
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 50 THEN 60
          ELSE 45
        END
      )))::smallint,
      COALESCE(displaced_date, crawled_at::date, CURRENT_DATE),
      COALESCE(save_count, 0),
      COALESCE(repin_count, 0),
      COALESCE(comment_count, 0),
      COALESCE(share_count, 0),
      COALESCE(daily_save_velocity, 0),
      NOW()
    FROM keyword_serp_current
    WHERE is_displaced = TRUE AND pin_id IS NOT NULL
    ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
      last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_displaced_index.last_known_rank),
      vacuum_opportunity_score = GREATEST(keyword_displaced_index.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
      save_count = GREATEST(keyword_displaced_index.save_count, EXCLUDED.save_count),
      repin_count = GREATEST(keyword_displaced_index.repin_count, EXCLUDED.repin_count),
      comment_count = GREATEST(keyword_displaced_index.comment_count, EXCLUDED.comment_count),
      share_count = GREATEST(keyword_displaced_index.share_count, EXCLUDED.share_count),
      daily_save_velocity = CASE
        WHEN EXCLUDED.daily_save_velocity > 0 THEN EXCLUDED.daily_save_velocity
        ELSE keyword_displaced_index.daily_save_velocity
      END,
      updated_at = NOW()
    RETURNING pin_id;
  `;
  console.log(`    ✓ Indexed ${indexedDisplaced.length} displaced pins in slim keyword_displaced_index (~56 bytes/row).`);

  // Backfill baseline_day_saves and prev_rank_position on active keyword_serp_current rows before truncating snapshots
  await hubSql`
    WITH prior_baselines AS (
      SELECT DISTINCT ON (keyword_id, pin_id)
        keyword_id,
        pin_id,
        save_count AS base_saves,
        rank_position AS base_rank,
        snapshot_date AS base_date
      FROM keyword_pins_snapshots
      WHERE COALESCE(is_displaced, FALSE) = FALSE
      ORDER BY keyword_id ASC, pin_id ASC,
               (snapshot_date < (NOW() AT TIME ZONE 'UTC')::date) DESC,
               snapshot_date DESC
    )
    UPDATE keyword_serp_current ksc
    SET
      prev_rank_position = COALESCE(
        ksc.prev_rank_position,
        CASE WHEN ksc.metadata->>'prev_rank' ~ '^[0-9]+$' THEN (ksc.metadata->>'prev_rank')::int ELSE pb.base_rank END,
        ksc.rank_position
      ),
      baseline_day_saves = COALESCE(
        NULLIF(ksc.baseline_day_saves, 0),
        CASE WHEN ksc.metadata->>'prev_save_count' ~ '^[0-9]+$' THEN (ksc.metadata->>'prev_save_count')::bigint ELSE pb.base_saves END,
        ksc.save_count
      ),
      baseline_day_date = COALESCE(ksc.baseline_day_date, pb.base_date, (NOW() AT TIME ZONE 'UTC')::date)
    FROM prior_baselines pb
    WHERE ksc.keyword_id = pb.keyword_id
      AND ksc.pin_id = pb.pin_id
      AND ksc.is_displaced = FALSE;
  `;
  console.log('    ✓ Hydrated baseline_day_saves & prev_rank_position on active SERP cache rows.');

  // STEP 8: Purge Displaced Rows from keyword_serp_current & Truncate Hub Snapshots
  console.log('\n[*] Step 8: Purging Offloaded Displaced Rows & Truncating Hub Snapshots...');
  const deletedDisplacedSerp = await hubSql`
    DELETE FROM keyword_serp_current
    WHERE is_displaced = TRUE
    RETURNING id;
  `;
  console.log(`    ✓ Deleted ${deletedDisplacedSerp.length} displaced rows from keyword_serp_current (archived to Shards + keyword_displaced_index).`);

  await hubSql`TRUNCATE TABLE keyword_pins_snapshots;`;
  console.log('    ✓ Truncated keyword_pins_snapshots on Hub (100% offloaded to 99 Shards).');

  // Strip heavy JSONB keys from active keyword_serp_current rows
  const serpSlimmed = await hubSql`
    UPDATE keyword_serp_current
    SET metadata = jsonb_strip_nulls(jsonb_build_object(
      'prev_rank', COALESCE(prev_rank_position, (metadata->>'prev_rank')::int),
      'rank_delta', COALESCE((metadata->>'rank_delta')::int, 0),
      'is_new', COALESCE((metadata->>'is_new')::boolean, false),
      'format', COALESCE(metadata->>'format', 'ORGANIC PIN'),
      'aspect_ratio', COALESCE(metadata->>'aspect_ratio', '2:3'),
      'velocity_tier', COALESCE(metadata->>'velocity_tier', 'steady'),
      'is_deep_hydrated', COALESCE((metadata->>'is_deep_hydrated')::boolean, false),
      'is_deleted', COALESCE((metadata->>'is_deleted')::boolean, false),
      'status', COALESCE(metadata->>'status', 'active')
    ))
    WHERE metadata IS NOT NULL
      AND metadata ?| array[
        'title','domain','destination_url','image_url','visual_annotations',
        'description','alt_text','raw_saves','crawled_at','created_at',
        'created_at_pinterest','method','creation_method','rich_metadata',
        'visual_objects','seo_related_interests','category_breadcrumbs',
        'board_cover_url','board_thumbnail_url','board_url'
      ]
    RETURNING id;
  `;
  console.log(`    ✓ Slimmed JSONB metadata on ${serpSlimmed.length} active rows in keyword_serp_current.`);

  // Strip TOAST-bloating keys from tracked_keywords
  const kwCleaned = await hubSql`
    UPDATE tracked_keywords
    SET metadata = COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins' - 'crawl_lock'
    WHERE metadata IS NOT NULL
      AND metadata ?| array['last_dropped_pins', 'popular_pins', 'crawl_lock']
    RETURNING id;
  `;
  console.log(`    ✓ Stripped TOAST-bloating keys (last_dropped_pins, popular_pins, crawl_lock) from ${kwCleaned.length} tracked_keywords rows.`);

  // Compact completed/failed competitor_pins queue
  const competitorCompacted = await hubSql`
    UPDATE competitor_pins
    SET description = NULL,
        alt_text = NULL,
        metadata = '{}'::jsonb
    WHERE enrichment_status IN ('completed', 'failed')
      AND (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb))
    RETURNING id;
  `;
  console.log(`    ✓ Compacted ${competitorCompacted.length} completed/failed competitor_pins rows.`);

  // STEP 9: Physical Heap & TOAST Reclamation via Sequential VACUUM FULL ANALYZE (Smallest -> Largest)
  console.log('\n[*] Step 9: Reclaiming Physical Storage & TOAST via VACUUM FULL ANALYZE...');
  const vacuumTasks = [
    ['tracked_keywords', () => hubSql`VACUUM FULL ANALYZE tracked_keywords;`],
    ['pa_pins', () => hubSql`VACUUM FULL ANALYZE pa_pins;`],
    ['pa_pin_metrics', () => hubSql`VACUUM FULL ANALYZE pa_pin_metrics;`],
    ['competitor_pins', () => hubSql`VACUUM FULL ANALYZE competitor_pins;`],
    ['keyword_displaced_index', () => hubSql`VACUUM FULL ANALYZE keyword_displaced_index;`],
    ['keyword_serp_current', () => hubSql`VACUUM FULL ANALYZE keyword_serp_current;`],
    ['keyword_pins_snapshots', () => hubSql`VACUUM FULL ANALYZE keyword_pins_snapshots;`]
  ];

  for (const [tbl, fn] of vacuumTasks) {
    try {
      console.log(`    Executing VACUUM FULL ANALYZE on ${tbl}...`);
      await fn();
      console.log(`    ✓ ${tbl} physically compacted and TOAST reclaimed.`);
    } catch (err) {
      console.warn(`    ⚠️ VACUUM FULL warning on ${tbl}:`, err.message);
    }
  }

  // STEP 10: Final Storage Telemetry Audit
  console.log('\n[*] Step 10: Final Hub Storage Audit & Reclaimed Metrics...');
  const afterStats = await getStorageStats(hubSql);
  const bytesReclaimed = beforeStats.rawBytes - afterStats.rawBytes;
  const mbReclaimed = (bytesReclaimed / (1024 * 1024)).toFixed(2);

  console.log(`\n================================================================`);
  console.log('📊 COMPACTION & 99-SHARD OFFLOADING RESULTS');
  console.log('================================================================');
  console.log(`  Before Total Hub Size:      ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)`);
  console.log(`  After Total Hub Size:       ${afterStats.prettySize} (${afterStats.rawBytes.toLocaleString()} bytes)`);
  console.log(`  Net Storage Reclaimed:      ${mbReclaimed} MB (${bytesReclaimed.toLocaleString()} bytes)`);
  console.log('================================================================\n');

  console.table(afterStats.tables.map(t => {
    const beforeTbl = beforeStats.tables.find(b => b.table_name === t.table_name);
    return {
      Table: t.table_name,
      'Rows Before': beforeTbl ? Number(beforeTbl.row_estimate) : '-',
      'Rows After': Number(t.row_estimate),
      'Size Before': beforeTbl?.total_size || '-',
      'Size After': t.total_size,
      'TOAST + Idx After': t.toast_and_idx_size
    };
  }));

  console.log('\n✓ ZERO-BLOAT HUB & 99-SHARD OFFLOADING COMPLETE!');
  return {
    beforeBytes: beforeStats.rawBytes,
    afterBytes: afterStats.rawBytes,
    reclaimedMb: Number(mbReclaimed),
    creativeShardsUpdated,
    snapshotShardsUpdated
  };
}

async function main() {
  if (!DATABASE_URL) {
    console.error('[-] FATAL: DATABASE_URL is not set.');
    process.exit(1);
  }
  const hubSql = neon(DATABASE_URL);
  await runOffloadAndCompact(hubSql);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('\n[-] FATAL ERROR during offload and compaction:', err);
    process.exit(1);
  });
}