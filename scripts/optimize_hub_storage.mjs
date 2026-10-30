#!/usr/bin/env node

/**
 * scripts/optimize_hub_storage.mjs
 *
 * Automated Zero-Bloat Hub Maintenance & Storage Optimization Engine
 *
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
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
      domain VARCHAR(128),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (keyword_id, pin_id)
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_kdi_kw_score
    ON keyword_displaced_index (keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC NULLS LAST);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_kdi_domain
    ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';
  `;

  // 1. Archive any residual displaced rows in keyword_serp_current -> keyword_displaced_index & 99 Shards
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
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
      const confirmedPinIdsSet = new Set();

      for (let i = 0; i < shardEntries.length; i += 10) {
        const chunk = shardEntries.slice(i, i + 10);
        await Promise.allSettled(chunk.map(async ([shardId, pins]) => {
          try {
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
            if (!shardSql || shardSql === sql) {
              throw new Error(`Shard #${shardId} resolved to invalid or fallback Hub connection.`);
            }

            const sanitizeMeta = (raw) => {
              if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
              const clean = {};
              for (const [k, v] of Object.entries(raw)) {
                if (v !== null && v !== undefined && v !== '') {
                  clean[k] = v;
                }
              }
              return clean;
            };

            const sortedPins = [...pins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
            const payload = JSON.stringify(sortedPins.map(p => ({
              pin_id: String(p.pin_id),
              keyword_id: Number(p.keyword_id || 0),
              creator_username: String(p.creator_username || ''),
              board_name: String(p.board_name || ''),
              title: String(p.title || ''),
              domain: String(p.domain || ''),
              destination_url: String(p.destination_url || ''),
              image_url: String(p.image_url || ''),
              description: String(p.metadata?.description || ''),
              alt_text: String(p.metadata?.alt_text || ''),
              dominant_color: String(p.dominant_color || '#888888'),
              visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
              created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
              metadata: sanitizeMeta(p.metadata),
              last_known_rank: p.last_known_rank ? Number(p.last_known_rank) : (p.rank_position ? Number(p.rank_position) : null),
              save_count: Number(p.save_count || 0),
              repin_count: Number(p.repin_count || 0),
              comment_count: Number(p.comment_count || 0),
              share_count: Number(p.share_count || 0),
              daily_save_velocity: Number(p.daily_save_velocity || 0),
              snapshot_date: p.displaced_date instanceof Date
                ? p.displaced_date.toISOString().slice(0, 10)
                : String(p.displaced_date || new Date().toISOString()).slice(0, 10)
            })));

            // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
            const buildMasterUpsert = (db) => db`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations,
                created_at_pinterest, metadata,
                first_discovered_pillar, first_discovered_at, updated_at
              )
              SELECT DISTINCT ON (u.pin_id)
                u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
                u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
                NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
                'keyword', NOW(), NOW()
              FROM jsonb_to_recordset(${payload}::jsonb) AS u(
                pin_id text, creator_username text, board_name text, title text, domain text,
                destination_url text, image_url text, description text, alt_text text,
                dominant_color text, visual_annotations jsonb, created_at_pinterest text, metadata jsonb
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
                dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
                visual_annotations = CASE 
                  WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                  THEN EXCLUDED.visual_annotations 
                  ELSE universal_master_pins.visual_annotations 
                END,
                created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
                metadata = CASE 
                  WHEN EXCLUDED.metadata IS NOT NULL AND EXCLUDED.metadata <> '{}'::jsonb 
                  THEN COALESCE(universal_master_pins.metadata, '{}'::jsonb) || jsonb_strip_nulls(EXCLUDED.metadata)
                  ELSE COALESCE(universal_master_pins.metadata, '{}'::jsonb)
                END,
                updated_at = NOW();
            `;

            // [INVARIANT: TWO-TIER-MODERN-SHARDING]
            // Deduplicate by (pin_id, snapshot_date) via GROUP BY with MAX(save_count) to prevent SQLSTATE 21000
            // when a pin is displaced across multiple keywords on the same date.
            const buildTwoTierUpsert = (db) => db`
              WITH raw_batch AS (
                SELECT
                  u.pin_id,
                  COALESCE(NULLIF(TRIM(u.snapshot_date), '')::date, (NOW() AT TIME ZONE 'UTC')::date) AS snapshot_date,
                  u.keyword_id,
                  u.last_known_rank,
                  COALESCE(u.save_count, 0)::bigint AS save_count,
                  COALESCE(u.repin_count, 0)::int AS repin_count,
                  COALESCE(u.comment_count, 0)::int AS comment_count,
                  COALESCE(u.share_count, 0)::int AS share_count,
                  COALESCE(u.daily_save_velocity, 0)::numeric AS daily_save_velocity
                FROM jsonb_to_recordset(${payload}::jsonb) AS u(
                  pin_id text,
                  snapshot_date text,
                  keyword_id int,
                  last_known_rank int,
                  save_count bigint,
                  repin_count int,
                  comment_count int,
                  share_count int,
                  daily_save_velocity numeric
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
                  0,
                  daily_save_velocity,
                  NOW()
                FROM dedup_metrics
                ORDER BY pin_id ASC, snapshot_date ASC
                ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                  save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
                  repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
                  comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
                  share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
                  daily_save_velocity = CASE
                    WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
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
                  COALESCE(last_known_rank, 100)::int AS last_known_rank
                FROM raw_batch
                WHERE keyword_id IS NOT NULL AND keyword_id > 0
                ORDER BY pin_id ASC, snapshot_date ASC, keyword_id ASC, last_known_rank ASC NULLS LAST
              )
              INSERT INTO pin_serp_positions (
                pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
                last_known_rank, catalog_rank, updated_at
              )
              SELECT
                pin_id,
                snapshot_date,
                keyword_id,
                NULL,
                TRUE,
                last_known_rank,
                COALESCE(last_known_rank, 100) + 250,
                NOW()
              FROM dedup_positions
              ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
                rank_position = NULL,
                is_displaced = TRUE,
                last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
                updated_at = NOW();
            `;

            // Zero unchecked catches: if either query fails, throw and abort this shard batch
            if (typeof shardSql.transaction === 'function') {
              await shardSql.transaction([buildMasterUpsert, buildTwoTierUpsert]);
            } else {
              await buildMasterUpsert(shardSql);
              await buildTwoTierUpsert(shardSql);
            }

            // Strictly record confirmed pin IDs only after 100% of Shard writes succeed
            for (const p of sortedPins) {
              if (p.pin_id) confirmedPinIdsSet.add(String(p.pin_id));
            }
          } catch (shardErr) {
            console.warn(`[optimizeHubStorage] Aborted Hub deletion for shard #${shardId} due to shard write failure:`, shardErr.message);
          }
        }));
      }

      const confirmedPinIds = Array.from(confirmedPinIdsSet);
      if (confirmedPinIds.length > 0) {
        await sql`
          INSERT INTO keyword_displaced_index (
            keyword_id, pin_id, creator_username, last_known_rank, vacuum_opportunity_score,
            displaced_date, save_count, repin_count, comment_count, share_count,
            daily_save_velocity, domain, updated_at
          )
          SELECT
            keyword_id,
            pin_id,
            NULLIF(LOWER(TRIM(creator_username)), ''),
            LEAST(32767, GREATEST(1, COALESCE(last_known_rank, rank_position, 100)))::smallint,
            LEAST(100, GREATEST(0, COALESCE(vacuum_opportunity_score, 60)))::smallint,
            COALESCE(displaced_date, CURRENT_DATE),
            COALESCE(save_count, 0),
            COALESCE(repin_count, 0),
            COALESCE(comment_count, 0),
            COALESCE(share_count, 0),
            COALESCE(daily_save_velocity, 0),
            COALESCE(domain, ''),
            NOW()
          FROM keyword_serp_current
          WHERE is_displaced = TRUE AND pin_id = ANY(${confirmedPinIds})
          ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), keyword_displaced_index.creator_username),
            last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_displaced_index.last_known_rank),
            vacuum_opportunity_score = GREATEST(COALESCE(keyword_displaced_index.vacuum_opportunity_score, 0), COALESCE(EXCLUDED.vacuum_opportunity_score, 0)),
            save_count = GREATEST(COALESCE(keyword_displaced_index.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
            repin_count = GREATEST(COALESCE(keyword_displaced_index.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
            comment_count = GREATEST(COALESCE(keyword_displaced_index.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
            share_count = GREATEST(COALESCE(keyword_displaced_index.share_count, 0), COALESCE(EXCLUDED.share_count, 0)),
            daily_save_velocity = CASE
              WHEN EXCLUDED.daily_save_velocity > 0 THEN EXCLUDED.daily_save_velocity
              ELSE keyword_displaced_index.daily_save_velocity
            END,
            domain = COALESCE(NULLIF(EXCLUDED.domain, ''), keyword_displaced_index.domain),
            updated_at = NOW();
        `;

        const purged = await sql`
          DELETE FROM keyword_serp_current
          WHERE is_displaced = TRUE AND pin_id = ANY(${confirmedPinIds})
          RETURNING id;
        `;
        totalDisplacedPurged += purged.length;
      } else {
        // If no shards succeeded in this iteration, break to prevent an infinite loop
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
            if (!shardSql || shardSql === sql) {
              throw new Error(`Shard #${shardId} resolved to invalid or fallback Hub connection.`);
            }

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
                    WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
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
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'raw_saves' - 'crawled_at' - 'created_at' - 'method' - 'creation_method' - 'share_count' - 'dominant_color' - 'board_name' - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['title','domain','destination_url','image_url','raw_saves','crawled_at','created_at','method','creation_method','share_count','dominant_color','board_name','description','alt_text','rich_metadata','visual_objects','seo_related_interests']
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

  // 4. Compact completed/failed competitor pins queue (strips heavy text while retaining skeletal index to prevent re-crawl loop)
  try {
    const compacted = await sql`
      UPDATE competitor_pins
      SET description = NULL,
          alt_text = NULL,
          enrichment_status = 'compacted',
          updated_at = NOW()
      WHERE enrichment_status IN ('completed', 'failed')
        AND updated_at < NOW() - INTERVAL '7 days'
      RETURNING id;
    `;
    results.compactedCompetitors = compacted.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Compact competitor pins warning:', err.message);
  }

  // 5. Non-blocking VACUUM (ANALYZE) on target Hub tables
  const tablesToVacuum = [
    ['tracked_keywords', () => sql`VACUUM (ANALYZE) tracked_keywords;`],
    ['keyword_serp_current', () => sql`VACUUM (ANALYZE) keyword_serp_current;`],
    ['keyword_displaced_index', () => sql`VACUUM (ANALYZE) keyword_displaced_index;`],
    ['keyword_pins_snapshots', () => sql`VACUUM (ANALYZE) keyword_pins_snapshots;`],
    ['competitor_pins', () => sql`VACUUM (ANALYZE) competitor_pins;`],
    ['pa_pins', () => sql`VACUUM (ANALYZE) pa_pins;`]
  ];
  for (const [tblName, vacFn] of tablesToVacuum) {
    try {
      await vacFn();
      results.vacuumedTables.push(tblName);
    } catch (vacErr) {
      console.warn(`[optimizeHubStorage] VACUUM (ANALYZE) note on ${tblName}:`, vacErr.message);
    }
  }

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
