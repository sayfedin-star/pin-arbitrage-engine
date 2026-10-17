#!/usr/bin/env node

/**
 * scripts/optimize_hub_storage.mjs
 *
 * Automated Zero-Bloat Hub Maintenance & Storage Optimization Engine
 *
 * Routinely maintains Central Metadata Hub storage < 35 MB:
 * 1. Archives any residual displaced rows in keyword_serp_current into keyword_displaced_index
 *    and offloads their static/time-series payloads to the 99 Shards before deleting from keyword_serp_current.
 * 2. Offloads any residual rows in keyword_pins_snapshots to the 99 Shards and truncates/prunes Hub snapshots.
 * 3. Strips bloated JSONB keys (last_dropped_pins, popular_pins, crawl_lock, duplicate URLs) from Hub tables.
 * 4. Compacts completed/failed rows in competitor_pins queue table.
 * 5. Runs non-blocking VACUUM (ANALYZE) on target Hub tables.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  batchGroupByShard,
  resolveShardConnection,
  preloadNeonRegistry
} from '../src/modules/sharding/fleet-router.mjs';

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

/**
 * Core Reusable Storage Optimizer
 * @param {Function} sql - Neon client instance connected to Hub
 */
export async function optimizeHubStorage(sql) {
  if (!sql) throw new Error('optimizeHubStorage requires an active SQL client.');

  const results = {
    archivedDisplaced: 0,
    prunedSnapshots: 0,
    compactedCompetitors: 0,
    cleanedSerpMetadata: 0,
    cleanedKwMetadata: 0,
    vacuumedTables: []
  };

  // 0. Ensure keyword_displaced_index exists & drop obsolete backup table
  try {
    await sql`DROP TABLE IF EXISTS _backup_keyword_displaced_pins;`;
    await sql`
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
    await sql`
      CREATE INDEX IF NOT EXISTS idx_kdi_kw_score
      ON keyword_displaced_index (keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC NULLS LAST);
    `;
  } catch (_) {}

  // 1. Archive any residual displaced rows in keyword_serp_current -> keyword_displaced_index & 99 Shards
  try {
    await preloadNeonRegistry(sql);
    let totalDisplacedPurged = 0;

    while (true) {
      const displacedRows = await sql`
        SELECT
          keyword_id, pin_id, title, domain, destination_url, image_url,
          creator_username, board_name, rank_position, last_known_rank,
          displaced_date, save_count, repin_count, comment_count, share_count,
          daily_save_velocity, vacuum_opportunity_score, dominant_color,
          visual_annotations, created_at_pinterest, metadata, crawled_at
        FROM keyword_serp_current
        WHERE is_displaced = TRUE
        LIMIT 5000;
      `;

      if (!displacedRows || displacedRows.length === 0) {
        break;
      }

      const shardGroups = batchGroupByShard(displacedRows, 99);
      const shardEntries = Array.from(shardGroups.entries());
      const confirmedPinIds = [];

      for (let i = 0; i < shardEntries.length; i += 10) {
        const chunk = shardEntries.slice(i, i + 10);
        await Promise.allSettled(chunk.map(async ([shardId, pins]) => {
          try {
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
            const payload = JSON.stringify(pins.map(p => ({
              pin_id: String(p.pin_id),
              keyword_id: Number(p.keyword_id || 0),
              creator_username: String(p.creator_username || ''),
              board_name: String(p.board_name || ''),
              title: String(p.title || ''),
              domain: String(p.domain || ''),
              destination_url: String(p.destination_url || ''),
              image_url: String(p.image_url || ''),
              description: String(p.metadata?.description || '').slice(0, 500),
              alt_text: String(p.metadata?.alt_text || '').slice(0, 500),
              dominant_color: String(p.dominant_color || '#888888'),
              visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
              last_known_rank: p.last_known_rank ? Number(p.last_known_rank) : (p.rank_position ? Number(p.rank_position) : null),
              save_count: Number(p.save_count || 0),
              repin_count: Number(p.repin_count || 0),
              comment_count: Number(p.comment_count || 0),
              share_count: Number(p.share_count || 0),
              daily_save_velocity: Number(p.daily_save_velocity || 0),
              snapshot_date: p.displaced_date instanceof Date ? p.displaced_date.toISOString().slice(0, 10) : String(p.displaced_date || new Date().toISOString()).slice(0, 10)
            })));

            await shardSql`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations,
                first_discovered_pillar, first_discovered_at, updated_at
              )
              SELECT DISTINCT ON (u.pin_id)
                u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
                u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
                'keyword', NOW(), NOW()
              FROM jsonb_to_recordset(${payload}::jsonb) AS u(
                pin_id text, creator_username text, board_name text, title text, domain text,
                destination_url text, image_url text, description text, alt_text text,
                dominant_color text, visual_annotations jsonb
              )
              ORDER BY u.pin_id ASC
              ON CONFLICT (pin_id) DO UPDATE SET
                title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
                domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
                destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
                image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
                updated_at = NOW();
            `;

            for (const p of pins) {
              if (p.pin_id) confirmedPinIds.push(String(p.pin_id));
            }
          } catch (shardErr) {
            console.warn(`[optimizeHubStorage] Warning: Failed to offload displaced pins to shard #${shardId}:`, shardErr.message);
          }
        }));
      }

      if (confirmedPinIds.length > 0) {
        await sql`
          INSERT INTO keyword_displaced_index (
            keyword_id, pin_id, last_known_rank, vacuum_opportunity_score,
            displaced_date, save_count, repin_count, comment_count, share_count,
            daily_save_velocity, updated_at
          )
          SELECT
            keyword_id,
            pin_id,
            LEAST(32767, GREATEST(1, COALESCE(last_known_rank, rank_position, 100)))::smallint,
            LEAST(100, GREATEST(0, COALESCE(vacuum_opportunity_score, 60)))::smallint,
            COALESCE(displaced_date, CURRENT_DATE),
            COALESCE(save_count, 0),
            COALESCE(repin_count, 0),
            COALESCE(comment_count, 0),
            COALESCE(share_count, 0),
            COALESCE(daily_save_velocity, 0),
            NOW()
          FROM keyword_serp_current
          WHERE is_displaced = TRUE AND pin_id = ANY(${confirmedPinIds})
          ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
            last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_displaced_index.last_known_rank),
            vacuum_opportunity_score = GREATEST(keyword_displaced_index.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
            save_count = GREATEST(keyword_displaced_index.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(keyword_displaced_index.repin_count, EXCLUDED.repin_count),
            updated_at = NOW();
        `;

        const purged = await sql`
          DELETE FROM keyword_serp_current
          WHERE is_displaced = TRUE AND pin_id = ANY(${confirmedPinIds})
          RETURNING id;
        `;
        totalDisplacedPurged += purged.length;
      } else {
        // If all shards failed, break to prevent an infinite loop
        break;
      }
    }

    results.archivedDisplaced = totalDisplacedPurged;
  } catch (err) {
    console.warn('[optimizeHubStorage] Displaced archive warning:', err.message);
  }

  // 2. Offload residual keyword_pins_snapshots to 99 Shards before pruning
  try {
    await preloadNeonRegistry(sql);
    let totalSnapshotsPruned = 0;

    while (true) {
      const snapshotRows = await sql`
        SELECT
          id,
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
        WHERE is_displaced = TRUE
           OR snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
        LIMIT 5000;
      `;

      if (!snapshotRows || snapshotRows.length === 0) {
        break;
      }

      const snapShardGroups = batchGroupByShard(snapshotRows, 99);
      const snapShardEntries = Array.from(snapShardGroups.entries());
      const confirmedSnapshotIds = [];

      for (let i = 0; i < snapShardEntries.length; i += 10) {
        const chunk = snapShardEntries.slice(i, i + 10);
        await Promise.allSettled(chunk.map(async ([shardId, shardSnaps]) => {
          try {
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
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

            // Upsert into two-tier metrics + positions
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

            // Backward compatible pins_daily_snapshots
            await shardSql`
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
              ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                rank_position = COALESCE(EXCLUDED.rank_position, pins_daily_snapshots.rank_position),
                save_count = GREATEST(pins_daily_snapshots.save_count, EXCLUDED.save_count),
                repin_count = GREATEST(pins_daily_snapshots.repin_count, EXCLUDED.repin_count),
                comment_count = GREATEST(pins_daily_snapshots.comment_count, EXCLUDED.comment_count),
                share_count = GREATEST(pins_daily_snapshots.share_count, EXCLUDED.share_count),
                reaction_count = GREATEST(pins_daily_snapshots.reaction_count, EXCLUDED.reaction_count),
                daily_save_velocity = CASE 
                  WHEN EXCLUDED.daily_save_velocity > 0 THEN GREATEST(COALESCE(pins_daily_snapshots.daily_save_velocity, 0), EXCLUDED.daily_save_velocity)
                  ELSE pins_daily_snapshots.daily_save_velocity 
                END,
                is_displaced = EXCLUDED.is_displaced;
            `;

            for (const s of shardSnaps) {
              if (s.id) confirmedSnapshotIds.push(s.id);
            }
          } catch (shardErr) {
            console.warn(`[optimizeHubStorage] Warning: Failed to offload snapshots to shard #${shardId}:`, shardErr.message);
          }
        }));
      }

      if (confirmedSnapshotIds.length > 0) {
        const deleted = await sql`
          DELETE FROM keyword_pins_snapshots
          WHERE id = ANY(${confirmedSnapshotIds})
          RETURNING id;
        `;
        totalSnapshotsPruned += deleted.length;
      } else {
        break;
      }
    }

    results.prunedSnapshots = totalSnapshotsPruned;
  } catch (err) {
    console.warn('[optimizeHubStorage] Prune snapshots warning:', err.message);
  }

  // 3. Strip bloated JSONB keys ONLY on rows that actually contain them (prevents MVCC & TOAST churn)
  try {
    const serpClean = await sql`
      UPDATE keyword_serp_current
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'raw_saves' - 'crawled_at' - 'created_at' - 'method'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['title','domain','destination_url','image_url','raw_saves','crawled_at','created_at','method']
      RETURNING id;
    `;
    results.cleanedSerpMetadata = serpClean.length;

    const kwClean = await sql`
      UPDATE tracked_keywords
      SET metadata = COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins' - 'crawl_lock'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['last_dropped_pins', 'popular_pins', 'crawl_lock']
      RETURNING id;
    `;
    results.cleanedKwMetadata = kwClean.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Strip metadata warning:', err.message);
  }

  // 4. Purge completed/failed competitor pins queue (data resides in Shards / D1)
  try {
    const purged = await sql`
      DELETE FROM competitor_pins
      WHERE enrichment_status IN ('completed', 'failed')
      RETURNING id;
    `;
    results.compactedCompetitors = purged.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Purge competitor pins warning:', err.message);
  }

  // 5. Non-blocking VACUUM (ANALYZE) on target Hub tables
  try { await sql`VACUUM (ANALYZE) tracked_keywords;`; results.vacuumedTables.push('tracked_keywords'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) keyword_serp_current;`; results.vacuumedTables.push('keyword_serp_current'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) keyword_displaced_index;`; results.vacuumedTables.push('keyword_displaced_index'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) keyword_pins_snapshots;`; results.vacuumedTables.push('keyword_pins_snapshots'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) competitor_pins;`; results.vacuumedTables.push('competitor_pins'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) pa_pins;`; results.vacuumedTables.push('pa_pins'); } catch (_) {}

  return results;
}

async function main() {
  console.log('================================================================');
  console.log('🧹 ROUTINE ZERO-BLOAT HUB STORAGE OPTIMIZATION');
  console.log('================================================================\n');

  if (!process.env.DATABASE_URL) {
    console.error('[-] FATAL: DATABASE_URL not found.');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  console.log('[*] Running automated maintenance...');
  const res = await optimizeHubStorage(sql);

  console.log(`  ✓ Archived & purged displaced:    ${res.archivedDisplaced} rows`);
  console.log(`  ✓ Pruned older snapshots:         ${res.prunedSnapshots} rows`);
  console.log(`  ✓ Cleaned SERP metadata:          ${res.cleanedSerpMetadata} rows`);
  console.log(`  ✓ Cleaned Keyword TOAST metadata: ${res.cleanedKwMetadata} rows`);
  console.log(`  ✓ Compacted competitor queue:     ${res.compactedCompetitors} rows`);
  console.log(`  ✓ Vacuumed & analyzed tables:     ${res.vacuumedTables.join(', ')}`);
  console.log('\n================================================================');
  console.log('✓ ROUTINE STORAGE OPTIMIZATION COMPLETE');
  console.log('================================================================');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('Execution error:', err);
    process.exit(1);
  });
}