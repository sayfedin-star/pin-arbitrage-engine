/**
 * Keyword Velocity & SERP Tracker Service
 * Searches Pinterest for target keywords, tracks pin rank positions,
 * calculates daily save velocity, semantic capsules (rankedGuides),
 * predictive typeahead autocomplete, and visual similarity lens.
 *
 * Hardened for Production:
 * - Atomic Single-Transaction Batch Upserts (sql.transaction -> Zero deadlocks, zero dirty reads)
 * - Zero Duplicate Batch Crash (strict in-memory deduplication by conflict key before SQL)
 * - Distributed 60s Atomic Lease + Process-Local Mutex (zero race conditions across edge isolates)
 * - Safe Regex Numeric Casting on JSONB metadata (immune to dirty metadata)
 * - Intraday Velocity Preservation (anchored to prior-day baseline, avoiding reset corruption)
 * - Intraday Snapshot Pruning (prevents ghost row accumulation and duplicate ranks)
 * - Request-Coalescing in-flight cache & True LRU Cache (zero memory leaks, zero rate-limit pressure)
 * - Full 4 Endpoints: v3_typeahead, v3_search_pins, v3_guided_search, v3_visual_search
 * - PinArchive-parity metadata enrichment (aspect ratio, format badges, velocity tiers)
 */

import { formatPinterestCookie } from '../../utils.mjs';
import { getPinterestHeaders } from '../shared/pinterest-headers.mjs';
import { getCachedVisualSearchMatches, setCachedVisualSearchMatches } from './visual-lens-cache.mjs';
import {
  extractPinData,
  PINTEREST_PAGE_HEADERS,
  fetchPinFromPinterest,
  fetchPinsBatchFromPidgets
} from '../../../scripts/lib/pinterest.mjs';
import { derivePinTitle, autoDiscoverFolderCreatorsForKeyword } from './folders-service.mjs';
import { calculateDailyVelocity } from '../../lib/math.mjs';
import {
  getPinShardId,
  resolveShardConnection,
  executeShardQueryWithCircuitBreaker,
  batchGroupByShard,
  preloadNeonRegistry,
  syncPinAcrossAllFourPillars,
  fetchUniversalPinDossier,
  fetchPinTrajectoryFromShard,
  isUnifiedPostgres,
  isMultiStageHydrationJump,
  sanitizeDossierTrajectory,
  safeWaitUntil
} from '../sharding/fleet-router.mjs';

/**
 * Offloads crawled active pins and newly displaced pins directly to the 99 Neon Storage Shards
 * (universal_master_pins, pins_daily_metrics, pin_serp_positions, and pins_daily_snapshots)
 * partitioned strictly by Shard_ID = (CRC32(pin_id) % 99) + 1.
 */
// [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
// Modular D1 Edge Metadata Operations
export {
  isEdgePinsMetadataReady,
  ensureEdgePinsMetadataTable,
  syncPinsBatchToD1,
  hydratePinsFromD1
} from './d1-metadata.mjs';
import {
  ensureEdgePinsMetadataTable,
  syncPinsBatchToD1,
  hydratePinsFromD1
} from './d1-metadata.mjs';

export async function offloadKeywordCrawlToShards(hubSql, keywordId, activePins = [], displacedPins = [], env = null) {
  const kid = Number(keywordId);
  if (!hubSql || !kid) return 0;

  const combined = [];
  for (const p of (activePins || [])) {
    if (!p || !p.pin_id) continue;
    combined.push({
      pin_id: String(p.pin_id),
      keyword_id: kid,
      creator_username: String(p.metadata?.pinner?.username || p.creator_username || ''),
      board_name: String(p.metadata?.board_name || p.board_name || ''),
      title: String(p.title || ''),
      domain: String(p.domain || ''),
      destination_url: String(p.destination_url || ''),
      image_url: String(p.image_url || ''),
      description: String(p.description || p.metadata?.description || '').slice(0, 500),
      alt_text: String(p.alt_text || p.metadata?.alt_text || '').slice(0, 500),
      dominant_color: String(p.dominant_color || '#888888'),
      visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
      created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
      rank_position: p.rank_position ? Number(p.rank_position) : null,
      last_known_rank: p.rank_position ? Number(p.rank_position) : null,
      catalog_rank: p.rank_position ? Number(p.rank_position) : 1,
      is_displaced: false,
      save_count: Number(p.save_count || 0),
      repin_count: Number(p.repin_count || 0),
      comment_count: Number(p.comment_count || 0),
      share_count: Number(p.metadata?.share_count || 0),
      daily_save_velocity: Number(p.daily_save_velocity || 0),
      metadata: {
        ...(p.metadata || {}),
        creation_method: p.creation_method || p.metadata?.creation_method || null
      }
    });
  }

  for (const dp of (displacedPins || [])) {
    if (!dp || !dp.pin_id) continue;
    const lastRank = dp.last_known_rank || dp.rank_position || 100;
    combined.push({
      pin_id: String(dp.pin_id),
      keyword_id: kid,
      creator_username: String(dp.metadata?.pinner?.username || dp.creator_username || ''),
      board_name: String(dp.board_name || dp.metadata?.board_name || ''),
      title: String(dp.title || ''),
      domain: String(dp.domain || ''),
      destination_url: String(dp.destination_url || ''),
      image_url: String(dp.image_url || ''),
      description: String(dp.description || dp.metadata?.description || '').slice(0, 500),
      alt_text: String(dp.alt_text || dp.metadata?.alt_text || '').slice(0, 500),
      dominant_color: String(dp.dominant_color || '#888888'),
      visual_annotations: Array.isArray(dp.visual_annotations) ? dp.visual_annotations : [],
      created_at_pinterest: dp.created_at_pinterest ? new Date(dp.created_at_pinterest).toISOString() : null,
      rank_position: null,
      last_known_rank: Number(lastRank),
      catalog_rank: Number(lastRank) + 250,
      is_displaced: true,
      save_count: Number(dp.save_count || 0),
      repin_count: Number(dp.repin_count || 0),
      comment_count: Number(dp.comment_count || 0),
      share_count: Number(dp.metadata?.share_count || 0),
      daily_save_velocity: 0,
      metadata: {
        ...(dp.metadata || {}),
        creation_method: dp.creation_method || dp.metadata?.creation_method || null
      }
    });
  }

  if (combined.length === 0) return 0;

  try {
    await preloadNeonRegistry(hubSql, env);
  } catch (_) {}

  if (env?.PIN_D1_DB) {
    syncPinsBatchToD1(env, combined).catch(() => {});
  }

  const shardGroups = batchGroupByShard(combined, 99);
  const shardEntries = Array.from(shardGroups.entries());
  let shardsSynced = 0;
  // [INVARIANT: CLOUDFLARE-6-CONN-CEILING]
  const CONCURRENCY = 4;

  if (hubSql) {
    try {
      await preloadNeonRegistry(hubSql, env);
    } catch (_) {}
  }

  for (let i = 0; i < shardEntries.length; i += CONCURRENCY) {
    const chunk = shardEntries.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardPins]) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId, env });
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 7: Unified Postgres Toplogy Check
        if (!shardSql || (shardSql === hubSql && !isUnifiedPostgres(env))) return;
        const sorted = [...shardPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
        const payload = JSON.stringify(sorted);

        // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
        // [INVARIANT: ZERO-HUB-SNAPSHOTS]
        // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
        // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
        const buildMasterQuery = (db) => db`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations,
            created_at_pinterest, first_discovered_pillar, first_discovered_at, metadata, updated_at
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
            u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
            u.created_at_pinterest::timestamptz, 'keyword', NOW(), COALESCE(u.metadata, '{}'::jsonb), NOW()
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
            dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, '#888888'), universal_master_pins.dominant_color),
            visual_annotations = CASE 
              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
              THEN EXCLUDED.visual_annotations
              ELSE universal_master_pins.visual_annotations
            END,
            created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
            metadata = CASE 
              WHEN EXCLUDED.metadata IS NOT NULL AND EXCLUDED.metadata != '{}'::jsonb 
              THEN COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata 
              ELSE universal_master_pins.metadata 
            END,
            updated_at = NOW();
        `;

        const buildTwoTierQuery = (db) => db`
          WITH raw_batch AS (
            SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS u(
              pin_id text, keyword_id int, rank_position int, last_known_rank int,
              catalog_rank int, is_displaced boolean, save_count bigint, repin_count int,
              comment_count int, share_count int, daily_save_velocity numeric
            )
          ),
          dedup_metrics AS (
            SELECT 
              pin_id,
              MAX(save_count) AS save_count,
              MAX(repin_count) AS repin_count,
              MAX(comment_count) AS comment_count,
              MAX(share_count) AS share_count,
              MAX(daily_save_velocity) AS daily_save_velocity
            FROM raw_batch
            GROUP BY pin_id
          ),
          upsert_metrics AS (
            INSERT INTO pins_daily_metrics (
              pin_id, snapshot_date, save_count, repin_count, comment_count,
              share_count, daily_save_velocity, updated_at
            )
            SELECT 
              pin_id, (NOW() AT TIME ZONE 'UTC')::date, save_count, repin_count,
              comment_count, share_count, daily_save_velocity, NOW()
            FROM dedup_metrics
            ORDER BY pin_id ASC
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
          )
          INSERT INTO pin_serp_positions (
            pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
            last_known_rank, catalog_rank, updated_at
          )
          SELECT DISTINCT ON (pin_id, keyword_id)
            pin_id, (NOW() AT TIME ZONE 'UTC')::date, keyword_id, rank_position,
            COALESCE(is_displaced, FALSE), last_known_rank, catalog_rank, NOW()
          FROM raw_batch
          WHERE keyword_id IS NOT NULL AND keyword_id > 0
          ORDER BY pin_id ASC, keyword_id ASC
          ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
            rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
            is_displaced = EXCLUDED.is_displaced,
            last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
            catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
            updated_at = NOW();
        `;

        if (typeof shardSql.transaction === 'function') {
          await shardSql.transaction([
            (db) => buildMasterQuery(db),
            (db) => buildTwoTierQuery(db)
          ]);
        } else if (typeof shardSql.begin === 'function') {
          await shardSql.begin(async (tx) => {
            await buildMasterQuery(tx);
            await buildTwoTierQuery(tx);
          });
        } else {
          await buildMasterQuery(shardSql);
          await buildTwoTierQuery(shardSql);
        }
        shardsSynced++;
      } catch (err) {
        console.warn(`[offloadKeywordCrawlToShards] Shard #${shardId} write deferred:`, err.message);
      }
    }));
  }
  return shardsSynced;
}

/**
 * Batch-hydrates slim displaced index rows with creative metadata from Hub and deterministic shards
 */
export async function hydrateDisplacedIndexFromShards(hubSql, indexRows = [], env = null, skipShardHydration = false, ctx = null) {
  if (!Array.isArray(indexRows) || indexRows.length === 0) return [];
  const needsHydration = indexRows.filter(r => !r.title && !r.image_url);
  if (needsHydration.length === 0) return indexRows;

  try {
    const masterMap = new Map();

    // 1. Tier-1 Ultra-Fast Edge Hydration from Cloudflare D1 (`edge_pins_metadata` in < 3ms)
    if (env?.PIN_D1_DB) {
      const d1Map = await hydratePinsFromD1(env, needsHydration.map(r => String(r.pin_id)));
      for (const [pid, d1Row] of d1Map.entries()) {
        if (d1Row.title || d1Row.image_url) {
          masterMap.set(pid, d1Row);
        }
      }
    }

    // Tier 0 (Hub Pre-Hydration): Check Central Hub tables (keyword_serp_current, competitor_pins, pa_pins) via single fast ANY($1) query
    const missingAfterD1 = needsHydration.filter(r => !masterMap.has(String(r.pin_id)));
    if (hubSql && missingAfterD1.length > 0) {
      const missingIds = missingAfterD1.map(r => String(r.pin_id));
      try {
        const hubRows = await hubSql`
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, '' as board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM keyword_serp_current
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM competitor_pins
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM pa_pins
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          LIMIT 100;
        `.catch(() => []);
        for (const hr of (hubRows || [])) {
          if ((hr.title || hr.image_url) && !masterMap.has(String(hr.pin_id))) {
            masterMap.set(String(hr.pin_id), hr);
          }
        }
      } catch (_) {}
    }

    // 2. Only query Neon Shards for pins that were not found in Cloudflare D1 or Hub
    const stillMissing = needsHydration.filter(r => !masterMap.has(String(r.pin_id)));
    if (!skipShardHydration && stillMissing.length > 0) {
      await preloadNeonRegistry(hubSql, env);
      const shardGroups = batchGroupByShard(stillMissing, 99);
      const newlyHydratedFromShards = [];

      // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING] Chunk shard scatter-gather into groups of <= 4
      const shardEntries = Array.from(shardGroups.entries());
      const CONCURRENCY_LIMIT = 4;
      const SCATTER_GATHER_DEADLINE_MS = 2200;

      const scatterGatherTask = (async () => {
        for (let i = 0; i < shardEntries.length; i += CONCURRENCY_LIMIT) {
          const chunk = shardEntries.slice(i, i + CONCURRENCY_LIMIT);
          await Promise.allSettled(
            chunk.map(async ([shardId, pins]) => {
              const pids = pins.map(p => String(p.pin_id));
              const shardSql = await resolveShardConnection({ hubSql, shardId, env });
              if (!shardSql || (shardSql === hubSql && !isUnifiedPostgres(env))) return;
              const rows = await executeShardQueryWithCircuitBreaker({
                shardId,
                shardSql,
                // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict 2000ms circuit breaker timeout
                timeoutMs: 2000,
                queryFn: async (client) => {
                  return await client`
                    SELECT pin_id, title, domain, destination_url, image_url,
                           creator_username, board_name, dominant_color,
                           visual_annotations, alt_text, description, created_at_pinterest
                    FROM universal_master_pins
                    WHERE pin_id = ANY(${pids});
                  `;
                },
                fallbackFn: async () => []
              });
              for (const r of (rows || [])) {
                masterMap.set(String(r.pin_id), r);
                newlyHydratedFromShards.push(r);
              }
            })
          );
        }
      })();

      let deadlineTimerId;
      const deadlinePromise = new Promise(resolve => {
        deadlineTimerId = setTimeout(resolve, SCATTER_GATHER_DEADLINE_MS);
      });

      await Promise.race([scatterGatherTask, deadlinePromise]).finally(() => {
        if (deadlineTimerId) clearTimeout(deadlineTimerId);
      });

      // Backfill Cloudflare D1 asynchronously so subsequent requests hit D1 in < 3ms with 0 Shard HTTP calls
      if (env?.PIN_D1_DB && newlyHydratedFromShards.length > 0) {
        safeWaitUntil(ctx, syncPinsBatchToD1(env, newlyHydratedFromShards), 'sync_pins_batch_to_d1');
      }
    }

    return indexRows.map(row => {
      const m = masterMap.get(String(row.pin_id));
      if (!m) return row;
      return {
        ...row,
        title: row.title || m.title || '',
        domain: row.domain || m.domain || '',
        destination_url: row.destination_url || m.destination_url || '',
        image_url: row.image_url || m.image_url || '',
        creator_username: row.creator_username || m.creator_username || '',
        board_name: row.board_name || m.board_name || '',
        dominant_color: row.dominant_color || m.dominant_color || '#888888',
        annotations: (Array.isArray(row.annotations) && row.annotations.length > 0) ? row.annotations : (m.visual_annotations || []),
        visual_annotations: (Array.isArray(row.visual_annotations) && row.visual_annotations.length > 0) ? row.visual_annotations : (m.visual_annotations || []),
        seo_alt_text: row.seo_alt_text || m.alt_text || '',
        created_at_pinterest: row.created_at_pinterest || m.created_at_pinterest || null
      };
    });
  } catch (_) {
    return indexRows;
  }
}

// In-Memory Mutex for process-local fast-fail
const activeKeywordCrawls = new Set();

// Modular Analytics, Outlier Suppression & Normalization
export {
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle,
  calculateMedian,
  calculateKeywordIntelligenceSummary
} from './analytics.mjs';
import {
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle,
  calculateMedian,
  calculateKeywordIntelligenceSummary
} from './analytics.mjs';

// In-Memory True LRU Cache for Visual Similarity Lens (max 500 entries, 15m TTL)
const visualSearchCache = new Map();
const inflightVisualSearch = new Map();
const VISUAL_CACHE_MAX = 500;
const VISUAL_TTL_MS = 15 * 60 * 1000;

/**
 * List all tracked keywords with velocity summaries
 */
export async function listKeywords(sql, { search = '', limit = 1000, offset = 0, folderId = null } = {}) {
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 1000 : Number(limit), 1000));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
  const fId = (folderId !== null && folderId !== undefined && !isNaN(Number(folderId))) ? Number(folderId) : null;
  if (search) {
    const pattern = `%${search.toLowerCase().trim()}%`;
    return await sql`
      WITH paged_keywords AS (
        SELECT 
          id, keyword, category, target_pin_count, refresh_interval_hours,
          last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
          avg_daily_velocity, is_active, tags,
          (COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins') AS metadata,
          created_at, updated_at, crawl_pages_limit, inspection_mode, canonical_keyword
        FROM tracked_keywords
        WHERE LOWER(keyword) LIKE ${pattern}
          AND (${fId}::int IS NULL OR id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        ORDER BY created_at DESC
        LIMIT ${lim} OFFSET ${off}
      ),
      pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_serp_current
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = FALSE
          AND rank_position IS NOT NULL
        GROUP BY keyword_id
      ),
      displaced_pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_displaced_index
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
        GROUP BY keyword_id
      ),
      folder_map AS (
        SELECT 
          kfi.keyword_id, 
          json_agg(json_build_object('id', f.id, 'name', f.name, 'color', f.color)) AS folders
        FROM keyword_folder_items kfi
        JOIN keyword_folders f ON f.id = kfi.folder_id
        WHERE kfi.keyword_id IN (SELECT id FROM paged_keywords)
        GROUP BY kfi.keyword_id
      )
      SELECT 
        pk.*,
        COALESCE(
          NULLIF(pc.cnt, 0),
          CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
          0
        )::int AS active_pins_count,
        COALESCE(dpc.cnt, 0)::int AS displaced_pins_count,
        COALESCE(
          NULLIF(pc.cnt, 0),
          CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
          0
        )::int AS snapshots_count,
        (
          COALESCE(
            NULLIF(pc.cnt, 0),
            CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
            0
          ) + COALESCE(dpc.cnt, 0)
        )::int AS total_pins_count,
        COALESCE(fm.folders, '[]'::json) AS folders
      FROM paged_keywords pk
      LEFT JOIN pin_counts pc ON pc.keyword_id = pk.id
      LEFT JOIN displaced_pin_counts dpc ON dpc.keyword_id = pk.id
      LEFT JOIN folder_map fm ON fm.keyword_id = pk.id
      ORDER BY pk.created_at DESC;
    `;
  } else {
    return await sql`
      WITH paged_keywords AS (
        SELECT 
          id, keyword, category, target_pin_count, refresh_interval_hours,
          last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
          avg_daily_velocity, is_active, tags,
          (COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins') AS metadata,
          created_at, updated_at, crawl_pages_limit, inspection_mode, canonical_keyword
        FROM tracked_keywords
        WHERE (${fId}::int IS NULL OR id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        ORDER BY created_at DESC
        LIMIT ${lim} OFFSET ${off}
      ),
      pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_serp_current
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = FALSE
          AND rank_position IS NOT NULL
        GROUP BY keyword_id
      ),
      displaced_pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_displaced_index
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
        GROUP BY keyword_id
      ),
      folder_map AS (
        SELECT 
          kfi.keyword_id, 
          json_agg(json_build_object('id', f.id, 'name', f.name, 'color', f.color)) AS folders
        FROM keyword_folder_items kfi
        JOIN keyword_folders f ON f.id = kfi.folder_id
        WHERE kfi.keyword_id IN (SELECT id FROM paged_keywords)
        GROUP BY kfi.keyword_id
      )
      SELECT 
        pk.*,
        COALESCE(
          NULLIF(pc.cnt, 0),
          CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
          0
        )::int AS active_pins_count,
        COALESCE(dpc.cnt, 0)::int AS displaced_pins_count,
        COALESCE(
          NULLIF(pc.cnt, 0),
          CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
          0
        )::int AS snapshots_count,
        (
          COALESCE(
            NULLIF(pc.cnt, 0),
            CASE WHEN pk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (pk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
            0
          ) + COALESCE(dpc.cnt, 0)
        )::int AS total_pins_count,
        COALESCE(fm.folders, '[]'::json) AS folders
      FROM paged_keywords pk
      LEFT JOIN pin_counts pc ON pc.keyword_id = pk.id
      LEFT JOIN displaced_pin_counts dpc ON dpc.keyword_id = pk.id
      LEFT JOIN folder_map fm ON fm.keyword_id = pk.id
      ORDER BY pk.created_at DESC;
    `;
  }
}

/**
 * Add a new keyword to track
 */
// Modular Keyword Settings & Configuration
export {
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug
} from './settings.mjs';
import {
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug
} from './settings.mjs';

// Modular Predictive Autocomplete & Typeahead
export { fetchKeywordTypeahead } from './typeahead.mjs';
import { fetchKeywordTypeahead } from './typeahead.mjs';

/**
 * Endpoint 4: v3_visual_search (Visual Similarity Lens)
 * Finds visually similar pins, competitor clones, and duplicate templates for a pin.
 * Protected with in-flight request coalescing and True LRU cache (15 min TTL, 500 items max).
 */
export async function fetchVisualSearchLens(sql, pinId, cookie = (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null), env = null) {
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('Pin ID is required for Visual Lens');

  const now = Date.now();

  // 1. Check LRU Cache
  const cached = visualSearchCache.get(cleanPin);
  if (cached) {
    if (now - cached.timestamp < VISUAL_TTL_MS) {
      visualSearchCache.delete(cleanPin);
      visualSearchCache.set(cleanPin, cached);
      return { success: true, pin_id: cleanPin, matches: cached.matches, seed_pin: cached.seed_pin || null, cached: true };
    } else {
      visualSearchCache.delete(cleanPin);
    }
  }

  // 1.1 Persistent L2 Edge KV + DB Cache (7-day TTL)
  const dbCached = await getCachedVisualSearchMatches(sql, cleanPin, env);
  if (dbCached) {
    let seedPin = null;
    try {
      const [row] = await sql`
        SELECT pin_id, title, image_url, domain, save_count
        FROM keyword_serp_current
        WHERE pin_id = ${cleanPin}
        ORDER BY updated_at DESC
        LIMIT 1;
      `;
      seedPin = row;
    } catch (_) {}
    visualSearchCache.set(cleanPin, { matches: dbCached.matches, seed_pin: seedPin, timestamp: Date.now() });
    return { success: true, pin_id: cleanPin, matches: dbCached.matches, seed_pin: seedPin, cached: true };
  }

  // 2. Coalesce in-flight requests
  if (inflightVisualSearch.has(cleanPin)) {
    return await inflightVisualSearch.get(cleanPin);
  }

  const promise = (async () => {
    // Look up pin details from active catalog to construct visual seed query
    let pinRow = null;
    try {
      const [row] = await sql`
        SELECT pin_id, title, image_url, domain, save_count
        FROM keyword_serp_current
        WHERE pin_id = ${cleanPin}
        ORDER BY updated_at DESC
        LIMIT 1;
      `;
      pinRow = row;
    } catch (err) {
      console.warn(`[fetchVisualSearchLens] Active SERP lookup warning for pin ${cleanPin}:`, err.message);
    }

    if (!pinRow) {
      try {
        const [paRow] = await sql`
          SELECT pin_id, title, image_url, domain, save_count
          FROM pa_pins
          WHERE pin_id = ${cleanPin}
          LIMIT 1;
        `;
        if (paRow) pinRow = paRow;
      } catch (_) {}
    }

    // Fallback if pin not yet crawled in snapshots: fetch public pin HTML
    if (!pinRow?.title) {
      let pinRes;
      try {
        const pinPageUrl = `https://www.pinterest.com/pin/${cleanPin}/`;
        pinRes = await fetch(pinPageUrl, { headers: PINTEREST_PAGE_HEADERS, signal: AbortSignal.timeout(6000) });
        if (pinRes.ok) {
          const html = await pinRes.text();
          const ext = extractPinData(html, cleanPin);
          if (ext) {
            pinRow = {
              pin_id: cleanPin,
              title: ext.title || ext.seo_title || ext.alt_text || '',
              domain: ext.domain || '',
              image_url: ext.image_url || null,
              save_count: Number(ext.saves || 0)
            };
          }
        }
      } catch (err) {
        console.warn(`[fetchVisualSearchLens] Fallback pin HTML fetch warning for pin ${cleanPin}:`, err.message);
      } finally {
        if (pinRes?.body && !pinRes.bodyUsed) {
          await pinRes.body.cancel().catch(() => {});
        }
      }
    }

    let rawResults = [];
    let matchProvenance = 'visual_live_lens';

    // 1. Attempt Pinterest's native VisualLiveSearchResource first (requires only pin_id, not title)
    if (cookie && String(cookie).trim()) {
      let vRes;
      try {
        const visualUrl = `https://www.pinterest.com/resource/VisualLiveSearchResource/get/?source_url=%2Fpin%2F${cleanPin}%2F&data=%7B%22options%22%3A%7B%22pin_id%22%3A%22${cleanPin}%22%7D%2C%22context%22%3A%7B%7D%7D`;
        const vHeaders = getPinterestHeaders({
          cookie,
          referer: `https://www.pinterest.com/pin/${cleanPin}/`,
          extra: {
            'x-pinterest-pws-handler': 'www/pin/[id].js'
          }
        });
        vRes = await fetch(visualUrl, { headers: vHeaders, signal: AbortSignal.timeout(8000) });
        if (vRes.ok) {
          const vData = await vRes.json();
          rawResults = vData?.resource_response?.data?.results || [];
        }
      } catch (_) {
      } finally {
        if (vRes?.body && !vRes.bodyUsed) await vRes.body.cancel().catch(() => {});
      }
    }

    // 2. Fallback to contextual text search ONLY if visual live search returned no results
    if (!rawResults || rawResults.length === 0) {
      matchProvenance = 'contextual_text_fallback';
      let searchQueryStr = (pinRow?.title && !/^\d+$/.test(pinRow.title.trim())) ? pinRow.title.trim() : '';
      if (!searchQueryStr && pinRow?.domain) {
        searchQueryStr = pinRow.domain;
      }
      if (!searchQueryStr) {
        return { success: true, pin_id: cleanPin, seed_pin: pinRow, matches: [] };
      }

      const searchQuery = encodeURIComponent(searchQueryStr);
      const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${searchQuery}&data=%7B%22options%22%3A%7B%22query%22%3A%22${searchQuery}%22%2C%22scope%22%3A%22pins%22%2C%22page_size%22%3A20%7D%2C%22context%22%3A%7B%7D%7D`;
      const headers = getPinterestHeaders({
        cookie,
        referer: `https://www.pinterest.com/search/pins/?q=${searchQuery}`,
        extra: {
          'x-pinterest-pws-handler': 'www/search/pins.js'
        }
      });

      let res;
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          rawResults = data?.resource_response?.data?.results || [];
        }
      } catch (err) {
        console.warn(`[fetchVisualSearchLens] Contextual search fallback error:`, err.message);
      } finally {
        if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      }
    }

    try {
      const matches = [];
      const seen = new Set([cleanPin]);
      const seedWords = (pinRow?.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);

      for (const item of rawResults) {
        if (!item || item.type !== 'pin' || item.format === 'Related Interests') continue;
        const cleanMatchId = [item?.id, item?.root_pin_id, item?.orig_pin_id, item?.aggregated_pin_data?.id]
          .map(v => String(v || '').trim())
          .find(v => /^(?:\d{10,30}|e1_[A-Za-z0-9_-]{15,90})$/.test(v));
        if (!cleanMatchId || seen.has(cleanMatchId)) continue;
        seen.add(cleanMatchId);

        const title = extractPinTitle(item);
        if (title === 'Explore featured boards') continue;
        const img = item.images?.['736x']?.url || item.images?.orig?.url || item.images?.['474x']?.url || item.images?.['236x']?.url || null;
        if (!img) continue;
        let domain = item.domain || '';
        if (!domain && item.link) {
          try { domain = new URL(item.link).hostname; } catch (_) {}
        }

        const saves = Math.max(
          Number(item.aggregated_pin_data?.aggregated_stats?.saves || 0),
          Number(item.save_count || 0),
          Number(item.repin_count || 0)
        );

        // Classify visual relationship
        const isSameDomain = Boolean(domain && pinRow?.domain && domain.toLowerCase() === pinRow.domain.toLowerCase());
        const itemWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const overlap = seedWords.filter(w => itemWords.includes(w)).length;
        const isTemplateMatch = !isSameDomain && seedWords.length > 0 && (overlap / seedWords.length) >= 0.4;

        let similarityType = 'VISUAL_SEARCH_MATCH';
        let similarityBadge = 'Similar Match';
        if (isSameDomain) {
          similarityType = 'DOMAIN_CLONE';
          similarityBadge = 'Competitor Clone';
        } else if (isTemplateMatch) {
          similarityType = 'TEMPLATE_CLONE';
          similarityBadge = 'Template Match';
        }

        matches.push({
          pin_id: cleanMatchId,
          title,
          image_url: img,
          domain,
          destination_url: item.link || '',
          save_count: saves,
          similarity_type: similarityType,
          similarity_badge: similarityBadge,
          provenance: matchProvenance
        });
      }

      // Evict if cache exceeds max
      if (visualSearchCache.size >= VISUAL_CACHE_MAX) {
        const oldestKey = visualSearchCache.keys().next().value;
        visualSearchCache.delete(oldestKey);
      }

      visualSearchCache.set(cleanPin, { matches, seed_pin: pinRow, timestamp: Date.now() });

      // Persist to L2 Edge KV & Sharded Database Cache (7-day TTL)
      await setCachedVisualSearchMatches(sql, cleanPin, matches, 7, env, pinRow);

      return {
        success: true,
        pin_id: cleanPin,
        seed_pin: pinRow,
        matches,
        cached: false
      };
    } catch (err) {
      console.warn(`[!] fetchVisualSearchLens error for pin ${cleanPin}:`, err.message);
      return { success: false, pin_id: cleanPin, matches: [], error: err.message };
    }
  })();

  inflightVisualSearch.set(cleanPin, promise);
  try {
    return await promise;
  } finally {
    inflightVisualSearch.delete(cleanPin);
  }
}

/**
 * Endpoints 2 & 3: v3_search_pins (BaseSearchResource) & v3_guided_search (Guided Capsules)
 * Crawls Pinterest SERP for target keyword, extracts 50 organic pins,
 * calculates save velocities, saves semantic capsules (rankedGuides),
 * and records rank movement deltas.
 *
 * Hardened for Production:
 * - 100% Atomic Single-Transaction Batch Upserts (sql.transaction -> Zero deadlocks, zero dirty reads)
 * - Distributed 60s lease with safe regex numeric cast + Process-local Mutex.
 * - Deduplication of pins by pin_id and guides by term -> Zero Batch Conflict Crashes.
 * - Deterministic conflict-key sorting -> Zero Deadlocks.
 * - Intraday snapshot pruning -> Exactly 50 pins preserved with clean rank sequencing.
 * - Separation of intraday rank movements vs prior-day save velocity baseline.
 */
/**
 * Comprehensive Pinterest Ad & Commercial Post Detector
 * Exhaustively checks all nested attributes to prevent sponsored/shopping ad leakage into organic SERPs
 */
export function isCommercialOrAdPin(it) {
  if (!it) return false;
  return Boolean(
    it.is_promoted ||
    it.promoted ||
    it.is_sponsored ||
    it.ad ||
    it.advertiser_name ||
    it.promoter ||
    it.tracking_params?.ad_id ||
    it.tracking_params?.campaign_id ||
    it.attribution?.provider_name === 'ad' ||
    it.type === 'ad' ||
    it.type === 'promoted_pin'
  );
}

export async function crawlKeywordSERP(sql, keywordId, optionsOrCookie = {}, maybeOptions = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  let cookie = (typeof process !== 'undefined' && process?.env ? process.env.PINTEREST_COOKIE : null);
  let force = false;
  let options = {};

  if (typeof optionsOrCookie === 'string') {
    cookie = optionsOrCookie;
    options = (maybeOptions && typeof maybeOptions === 'object') ? { ...maybeOptions } : {};
  } else if (optionsOrCookie && typeof optionsOrCookie === 'object') {
    options = { ...optionsOrCookie };
    if (options.cookie !== undefined) cookie = options.cookie;
  } else if (!optionsOrCookie && maybeOptions && typeof maybeOptions === 'object') {
    options = { ...maybeOptions };
    if (options.cookie !== undefined) cookie = options.cookie;
  }

  // Fallback to Worker or Cloudflare execution environment secrets if not provided directly
  if (!cookie) {
    cookie = options?.env?.PINTEREST_COOKIE || maybeOptions?.env?.PINTEREST_COOKIE || null;
  }

  if (options.force) force = Boolean(options.force);
  const env = options?.env || maybeOptions?.env || null;

  // 1. Process-local fast-fail check and lock acquisition
  if (activeKeywordCrawls.has(kid) && !force) {
    return { success: false, in_progress: true, message: `Crawl already in progress locally for keyword ID ${kid}` };
  }
  activeKeywordCrawls.add(kid);

  let leaseAcquired = false;
  let leaseCommittedInTx = false;
  const skipLeaseRelease = Boolean(options?.skip_lease_release);

  const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const callerLeaseToken = isUuid(options?.lease_token) ? options.lease_token : null;
  const effectiveToken = callerLeaseToken || (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : (await import('node:crypto')).randomUUID()
  );

  try {
    // [INVARIANT: DISTRIBUTED-CRAWL-LEASE-FENCING]
    // Even when force = true, active unexpired leases held by another node MUST be respected.
    // force = true only bypasses local in-memory lock (activeKeywordCrawls) and stale SERP freshness,
    // NEVER active distributed concurrency leases held by another worker.
    const leaseQuery = callerLeaseToken
      ? sql`
          UPDATE tracked_keywords
          SET crawl_lease_token = ${effectiveToken}::uuid,
              crawl_lease_until = GREATEST(COALESCE(crawl_lease_until, NOW()), NOW() + INTERVAL '15 minutes')
          WHERE id = ${kid}
            AND (crawl_lease_token = ${effectiveToken}::uuid OR crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING id;
        `
      : sql`
          UPDATE tracked_keywords
          SET crawl_lease_token = ${effectiveToken}::uuid,
              crawl_lease_until = NOW() + INTERVAL '90 seconds'
          WHERE id = ${kid}
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW() OR crawl_lease_token = ${effectiveToken}::uuid)
          RETURNING id;
        `;

    let leaseResult;
    try {
      leaseResult = await leaseQuery;
    } catch (lErr) {
      if (lErr.message && (lErr.message.includes('crawl_lease_until') || lErr.message.includes('column') || lErr.message.includes('does not exist'))) {
        console.warn(`[crawlKeywordSERP] crawl_lease_until column missing, proceeding without database lease: ${lErr.message}`);
        leaseResult = [{ id: kid }];
      } else {
        console.error(`[crawlKeywordSERP] Database error acquiring lease for keyword ID ${kid}:`, lErr.message);
        throw lErr;
      }
    }

    if (leaseResult.length === 0) {
      return { success: false, in_progress: true, message: `Crawl actively locked by another node for keyword ID ${kid}` };
    }
    leaseAcquired = true;

    const [keywordRow] = await sql`
      SELECT id, keyword, crawl_pages_limit, is_active, metadata FROM tracked_keywords WHERE id = ${kid};
    `;
    if (!keywordRow) throw new Error(`Keyword ID ${kid} not found.`);

    const query = encodeURIComponent(keywordRow.keyword);

    // Resolve Dynamic Depth from options -> keywordRow -> defaults
    const configuredPages = Math.max(1, Math.min(40, Number(
      options.crawl_pages || 
      options.max_pages || 
      keywordRow.crawl_pages_limit || 
      10
    )));
    const configuredTargetPins = Math.max(25, Math.min(1000, Number(
      options.max_serp_pins || 
      options.max_pins || 
      keywordRow.target_pin_count || 
      (configuredPages * 25)
    )));
    const targetCount = configuredTargetPins;
    // Replenishment Guard: Dynamic maxPages ensures excluded ads/boards/tombstone never starve targetCount
    const maxPages = Math.min(40, Math.max(configuredPages, Math.ceil(targetCount / 12)));

    // Resolve Filtration Exceptions from options -> app_settings -> default true
    const appSettings = await getAppSettings(sql);
    const excludePromoted = options.exclude_promoted ?? appSettings.exclude_promoted ?? true;
    const excludeBoardsAndSuggestions = options.exclude_boards_and_suggestions ?? appSettings.exclude_boards_and_suggestions ?? true;
    const excludeIgnoredPins = options.exclude_ignored_pins ?? appSettings.exclude_ignored_pins ?? true;

    // Phase 2 Tombstone Architecture: Pre-fetch Ignored Pins Registry to accurately gate paging quota
    const ignoredPinRows = await sql`
      SELECT pin_id
      FROM keyword_ignored_pins
      WHERE keyword_id = ${kid};
    `.catch(() => []);
    const ignoredPinSet = new Set(ignoredPinRows.map(r => String(r.pin_id)));

    const headers = getPinterestHeaders({
      cookie,
      referer: `https://www.pinterest.com/search/pins/?q=${query}`,
      extraHeaders: {
        'x-pinterest-pws-handler': 'www/search/pins.js'
      }
    });

    let rawResults = [];
    let bookmark = null;
    let page = 1;
    let rawGuides = [];
    const seenPagingIds = new Set();
    let organicPinsCollected = 0;
    let paginationAbortedByHttp = false;

    let lastHeartbeatTime = Date.now();
    const renewLeaseHeartbeat = async (extSeconds = 90) => {
      try {
        await sql`
          UPDATE tracked_keywords
          SET crawl_lease_until = NOW() + (${extSeconds} * INTERVAL '1 second')
          WHERE id = ${kid} AND crawl_lease_token = ${effectiveToken}::uuid;
        `;
        lastHeartbeatTime = Date.now();
      } catch (hbErr) {
        console.warn(`[crawlKeywordSERP] Lease heartbeat warning for keyword ${kid}:`, hbErr?.message);
      }
    };

    // Deep dynamic pagination: Follow bookmark stream up to maxPages / targetCount
    while (organicPinsCollected < targetCount && page <= maxPages) {
      const optionsObj = {
        query: decodeURIComponent(query),
        scope: 'pins',
        page_size: 50
      };
      if (bookmark) {
        optionsObj.bookmarks = [bookmark];
      }
      const dataParam = encodeURIComponent(JSON.stringify({
        options: optionsObj,
        context: {}
      }));
      const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${query}&data=${dataParam}`;

      let res;
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          const jitter = 2500 + Math.floor(Math.random() * 1500);
          await new Promise(r => setTimeout(r, jitter));
          const authHeaders = { ...headers };
          if (cookie && String(cookie).trim()) {
            authHeaders['Cookie'] = formatPinterestCookie(cookie);
          }
          res = await fetch(url, { headers: authHeaders, signal: AbortSignal.timeout(8000) });
        }

        if (!res.ok) {
          if (page === 1) {
            throw new Error(`Pinterest Search API returned HTTP ${res.status}`);
          }
          paginationAbortedByHttp = true;
          break;
        }

        const data = await res.json();
        if (page === 1) {
          rawGuides = data?.resource_response?.data?.rankedGuides || [];
        }

        const pageItems = data?.resource_response?.data?.results || [];
        if (pageItems.length === 0) break;
        rawResults = rawResults.concat(pageItems);

        if (page === 1 && pageItems.length > 0) {
          const hasObfuscated = pageItems.some(it => String(it?.id || '').startsWith('e1_'));
          if (hasObfuscated) {
            console.warn(`[BaseSearchResource] WARNING: Pinterest returned encrypted e1_ pin IDs for query "${query}". Your PINTEREST_COOKIE may be expired, invalid, or missing.`);
          }
        }

        for (const it of pageItems) {
          if (!it || it.type !== 'pin') continue;
          if (excludeBoardsAndSuggestions && (it.format === 'Related Interests' || it.format === 'board')) continue;
          if (excludePromoted && isCommercialOrAdPin(it)) continue;
          const pid = [it?.id, it?.root_pin_id, it?.orig_pin_id, it?.aggregated_pin_data?.id]
            .map(v => String(v || '').trim())
            .find(v => /^(?:\d{10,30}|e1_[A-Za-z0-9_-]{15,90})$/.test(v));
          if (!pid) continue;
          if (excludeIgnoredPins && ignoredPinSet.has(pid)) continue;
          if (!seenPagingIds.has(pid)) {
            seenPagingIds.add(pid);
            organicPinsCollected++;
          }
        }

        // Robust multi-path bookmark resolution
        const nextBookmark = data?.resource_response?.bookmark ||
          (Array.isArray(data?.resource_response?.bookmarks) ? data.resource_response.bookmarks[0] : null) ||
          data?.resource_response?.data?.bookmark ||
          null;

        if (!nextBookmark || nextBookmark === '-end-' || nextBookmark === bookmark) {
          break;
        }
        bookmark = nextBookmark;
        page++;

        if (organicPinsCollected < targetCount && page <= maxPages) {
          const jitter = options.skip_top_enrich
            ? (800 + Math.floor(Math.random() * 600))
            : (2500 + Math.floor(Math.random() * 1500));
          await new Promise(r => setTimeout(r, jitter));
        }

        if (Date.now() - lastHeartbeatTime > 25000) {
          await renewLeaseHeartbeat(90);
        }
      } catch (fetchErr) {
        if (page === 1) throw fetchErr;
        console.warn(`[crawlKeywordSERP] Pagination aborted on page ${page} due to network/fetch error:`, fetchErr?.message);
        paginationAbortedByHttp = true;
        break;
      } finally {
        if (res?.body && !res.bodyUsed) {
          await res.body.cancel().catch(() => {});
        }
      }
    }

    // Pre-query historical records from slim Hub active SERP cache (zero Hub snapshot bloat):
    // A) Immediate prior active SERP state (with fallback to keyword_pins_snapshots if cache is empty)
    let immediateSnapshots = await sql`
      SELECT
        NULL::int AS snapshot_id, pin_id, rank_position, prev_rank_position,
        save_count, baseline_day_saves, baseline_day_date,
        repin_count, comment_count, title, image_url, domain, destination_url,
        board_name, dominant_color, visual_annotations,
        metadata, COALESCE(crawled_at::date, CURRENT_DATE) AS snapshot_date,
        crawled_at AS created_at, created_at_pinterest, creation_method
      FROM keyword_serp_current
      WHERE keyword_id = ${kid}
        AND is_displaced = FALSE;
    `.catch(() => []);

    const immediateMap = new Map();
    const baselineMap = new Map();
    let baselineSnapshotDate = null;
    const todayIsoDate = new Date().toISOString().slice(0, 10);

    for (const s of (immediateSnapshots || [])) {
      const pid = String(s.pin_id);
      immediateMap.set(pid, {
        snapshotId: s.snapshot_id != null ? Number(s.snapshot_id) : null,
        rank: Number(s.rank_position || 0),
        saves: Number(s.save_count || 0),
        repins: Number(s.repin_count || 0),
        comments: Number(s.comment_count || 0),
        title: s.title || '',
        imageUrl: s.image_url || null,
        domain: s.domain || '',
        destinationUrl: s.destination_url || '',
        snapshotDate: s.snapshot_date,
        createdAt: s.created_at
      });

      const snapDateStr = s.snapshot_date instanceof Date
        ? s.snapshot_date.toISOString().slice(0, 10)
        : String(s.snapshot_date || '').slice(0, 10);
      const baseDateStr = s.baseline_day_date instanceof Date
        ? s.baseline_day_date.toISOString().slice(0, 10)
        : String(s.baseline_day_date || '').slice(0, 10);

      if (snapDateStr && snapDateStr < todayIsoDate) {
        baselineMap.set(pid, { saves: Number(s.save_count || 0), repins: Number(s.repin_count || 0), date: snapDateStr });
        if (!baselineSnapshotDate) baselineSnapshotDate = new Date(snapDateStr);
      } else if (s.baseline_day_saves !== null && s.baseline_day_saves !== undefined && baseDateStr) {
        baselineMap.set(pid, { saves: Number(s.baseline_day_saves || 0), repins: Number(s.repin_count || 0), date: baseDateStr });
        if (!baselineSnapshotDate) baselineSnapshotDate = new Date(baseDateStr);
      }
    }

    // C) Existing Displaced Pins Registry lookup (from slim keyword_displaced_index + keyword_serp_current)
    const existingDisplacedRows = await sql`
      SELECT pin_id, last_known_rank FROM keyword_displaced_index WHERE keyword_id = ${kid}
      UNION
      SELECT pin_id, last_known_rank FROM keyword_serp_current WHERE keyword_id = ${kid} AND is_displaced = TRUE;
    `.catch(() => []);
    const existingDisplacedMap = new Map();
    for (const d of existingDisplacedRows) {
      existingDisplacedMap.set(String(d.pin_id), d);
    }
    const resurgedPins = [];

    // System-wide maximum confirmed saves lookup across all keywords and unified catalog
    const discoveredPids = Array.from(seenPagingIds);
    const globalSavesMap = new Map();
    const globalRepinsMap = new Map();
    if (discoveredPids.length > 0) {
      const [histRows, dispRows] = await Promise.all([
        sql`
          SELECT pin_id, save_count AS max_saves, repin_count AS max_repins
          FROM keyword_displaced_index
          WHERE pin_id = ANY(${discoveredPids});
        `.catch(() => []),
        sql`
          SELECT pin_id, save_count AS current_saves, repin_count AS current_repins
          FROM keyword_serp_current
          WHERE pin_id = ANY(${discoveredPids});
        `.catch(() => [])
      ]);
      for (const r of histRows) {
        const pid = String(r.pin_id);
        const s = Number(r.max_saves || 0);
        const rep = Number(r.max_repins || 0);
        if (s > (globalSavesMap.get(pid) || 0)) globalSavesMap.set(pid, s);
        if (rep > (globalRepinsMap.get(pid) || 0)) globalRepinsMap.set(pid, rep);
      }
      for (const r of dispRows) {
        const pid = String(r.pin_id);
        const s = Number(r.current_saves || 0);
        const rep = Number(r.current_repins || 0);
        if (s > (globalSavesMap.get(pid) || 0)) globalSavesMap.set(pid, s);
        if (rep > (globalRepinsMap.get(pid) || 0)) globalRepinsMap.set(pid, rep);
      }
    }

    let rank = 1;
    let topPin = null;
    let totalVelocity = 0;
    const pinVelocities = [];
    const todayDate = new Date();
    const todayUtc = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate());
    const crawlNowIso = todayDate.toISOString();
    let climbedCount = 0;
    let droppedCount = 0;
    let stableCount = 0;
    let newEntryCount = 0;

    const preparedPins = [];
    const seenPinIds = new Set();

    for (const item of rawResults) {
      if (!item || item.type !== 'pin') continue;
      if (excludeBoardsAndSuggestions && (item.format === 'Related Interests' || item.format === 'board')) continue;
      if (excludePromoted && isCommercialOrAdPin(item)) continue;
      const pinId = [item?.id, item?.root_pin_id, item?.orig_pin_id, item?.aggregated_pin_data?.id]
        .map(v => String(v || '').trim())
        .find(v => /^(?:\d{10,30}|e1_[A-Za-z0-9_-]{15,90})$/.test(v));
      if (!pinId || seenPinIds.has(pinId)) continue;
      if (excludeIgnoredPins && ignoredPinSet.has(pinId)) continue;
      if (preparedPins.length >= targetCount) break;
      seenPinIds.add(pinId);

      if (existingDisplacedMap.has(pinId)) {
        resurgedPins.push({ pin_id: pinId, rank });
      }

      const title = extractPinTitle(item, keywordRow.keyword);
      
      let domain = (item.domain || '').slice(0, 255);
      if (!domain && item.link) {
        try {
          domain = (new URL(item.link).hostname || '').slice(0, 255);
        } catch (_) {
          domain = '';
        }
      }

      const destinationUrl = item.link || '';
      const imageUrl = item.images?.['736x']?.url || item.images?.orig?.url || item.images?.['474x']?.url || item.images?.['236x']?.url || null;
      
      const rawSaves = Math.max(
        Number(item.aggregated_pin_data?.aggregated_stats?.saves || 0),
        Number(item.save_count || 0),
        Number(item.repin_count || 0)
      );
      
      let reactions = 0;
      if (item.reaction_counts && typeof item.reaction_counts === 'object') {
        for (const v of Object.values(item.reaction_counts)) {
          const num = Number(v);
          if (!isNaN(num) && num > 0) reactions += num;
        }
      }
      if (reactions === 0) {
        reactions = Number(
          item.reaction_counts?.['1'] || 
          item.reaction_counts?.['like'] || 
          item.reaction_counts?.['heart'] || 
          item.reaction_counts?.['total'] || 
          0
        );
      }
      // Strictly keep authentic saves separate from reactions so save_count is never polluted by reaction_counts
      const saves = rawSaves;

      if (!topPin && imageUrl) {
        topPin = { pinId, title, imageUrl };
      }

      // Rank movements are evaluated against immediate prior crawl
      const immediateData = immediateMap.get(pinId);
      let rankDelta = 0;
      let prevRank = null;
      let isNew = false;

      if (immediateData) {
        prevRank = immediateData.rank;
        rankDelta = prevRank - rank;
        if (rankDelta > 0) climbedCount++;
        else if (rankDelta < 0) droppedCount++;
        else stableCount++;
      } else {
        isNew = true;
        rankDelta = 0;
        newEntryCount++;
      }

      // MONOTONIC SAVE RETENTION GUARD (IN-MEMORY):
      // Lifetime cumulative pin saves can NEVER legitimately drop to 0.
      const baseEntryForPin = baselineMap.get(pinId);
      const baseSavesForPin = (baseEntryForPin && typeof baseEntryForPin === 'object') ? Number(baseEntryForPin.saves || 0) : Number(baseEntryForPin || 0);
      const confirmedSaves = Math.max(
        saves,
        Number(immediateData?.saves || 0),
        baseSavesForPin,
        Number(globalSavesMap.get(pinId) || 0)
      );
      const confirmedRepins = Math.max(
        Number(item.repin_count || 0),
        Number(immediateData?.repins || 0),
        Number(globalRepinsMap.get(pinId) || 0)
      );
      const confirmedComments = Math.max(
        Number(item.comment_count || 0),
        Number(immediateData?.comments || 0)
      );

      // 24h Daily Save Velocity is evaluated against previous day's baseline
      // Time-Normalized: Divides delta by pure UTC calendar days via calculateDailyVelocity SSOT
      let velocity = 0;
      if (baselineMap.has(pinId)) {
        const baseDateStr = (baseEntryForPin && typeof baseEntryForPin === 'object') ? baseEntryForPin.date : null;
        velocity = calculateDailyVelocity({
          currentSaves: confirmedSaves,
          baselineSaves: baseSavesForPin,
          repinCount: confirmedRepins,
          currentRepins: confirmedRepins,
          baselineRepins: (baseEntryForPin && typeof baseEntryForPin === 'object' && baseEntryForPin.repins != null) ? Number(baseEntryForPin.repins) : 0,
          currentDate: todayDate,
          baselineDate: baseDateStr || baselineSnapshotDate,
          createdAt: item.created_at_pinterest || item.created_at || null,
          maxCap: 25000
        });
      } else if (immediateData) {
        const immDateStr = immediateData.snapshotDate instanceof Date
          ? immediateData.snapshotDate.toISOString().slice(0, 10)
          : (immediateData.snapshotDate ? String(immediateData.snapshotDate).slice(0, 10) : '');
        const todayIsoStr = todayDate.toISOString().slice(0, 10);
        if (immDateStr && immDateStr < todayIsoStr) {
          velocity = calculateDailyVelocity({
            currentSaves: confirmedSaves,
            baselineSaves: immediateData.saves,
            repinCount: confirmedRepins,
            currentRepins: confirmedRepins,
            baselineRepins: Number(immediateData.repins || 0),
            currentDate: todayDate,
            baselineDate: immediateData.snapshotDate,
            createdAt: item.created_at_pinterest || item.created_at || null,
            maxCap: 25000
          });
        }
      }

      // Sanity bound to protect against malicious bot-farm spikes
      velocity = Math.min(velocity, 25000);
      pinVelocities.push(velocity);
      totalVelocity += velocity;

      // Classify pin format & aspect ratio (PinArchive Parity)
      const isVideo = Boolean(item.is_video || item.videos);
      const isProduct = Boolean(item.is_promoted || item.is_buyable || item.price_value != null);
      const isIdea = Boolean(item.story_pin_data || item.pin_join?.story_pin_data);
      let format = 'ORGANIC PIN';
      if (isProduct) format = 'PRODUCT CARD';
      else if (isVideo) format = 'VIDEO PIN';
      else if (isIdea) format = 'IDEA PIN';

      // Aspect ratio classification (1:2, 2:3, 1:1, 9:16, 3:4, 16:9)
      const origW = Number(item.images?.['736x']?.width || item.images?.orig?.width || 236);
      const origH = Number(item.images?.['736x']?.height || item.images?.orig?.height || 354);
      let aspectRatio = '2:3';
      let aspectRatioTier = '2:3 Standard';
      if (origW > 0 && origH > 0) {
        const ratio = origW / origH;
        if (ratio <= 0.55) {
          aspectRatio = '1:2';
          aspectRatioTier = '1:2 Extra Tall';
        } else if (ratio <= 0.6) {
          aspectRatio = '9:16';
          aspectRatioTier = '9:16 Story';
        } else if (ratio > 0.6 && ratio <= 0.74) {
          aspectRatio = '2:3';
          aspectRatioTier = '2:3 Standard';
        } else if (ratio > 0.74 && ratio <= 0.92) {
          aspectRatio = '3:4';
          aspectRatioTier = '3:4 Medium';
        } else if (ratio > 0.92 && ratio < 1.08) {
          aspectRatio = '1:1';
          aspectRatioTier = '1:1 Square';
        } else if (ratio >= 1.08) {
          aspectRatio = '16:9';
          aspectRatioTier = '16:9 Landscape';
        }
      }

      let velocityTier = 'stagnant';
      if (velocity >= 50) velocityTier = 'explosive';
      else if (velocity >= 10) velocityTier = 'trending';
      else if (velocity > 0) velocityTier = 'steady';

      // Enriched Pinterest SERP intelligence attributes
      const pinner = item.pinner ? {
        username: item.pinner.username || '',
        full_name: item.pinner.full_name || '',
        follower_count: Number(item.pinner.follower_count || 0),
        image_small_url: item.pinner.image_small_url || ''
      } : null;

      const comments = confirmedComments;

      const createdAt = item.created_at || item.createdAt || null;
      const method = item.method || item.creation_method || item.creationMethod || item.attribution?.provider_name || null;
      let pinAgeDays = null;
      if (createdAt) {
        const createdMs = new Date(createdAt).getTime();
        if (!isNaN(createdMs)) {
          pinAgeDays = Math.max(0, Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24)));
        }
      }

      const visualAnnotations = Array.isArray(item.pin_join?.visual_annotation)
        ? item.pin_join.visual_annotation
            .map(t => String(t || '').trim())
            .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
            .slice(0, 15)
        : [];

      const description = (item.grid_description || item.closeup_unified_description || item.description || '').slice(0, 500);
      const altText = (item.closeup_unified_description || item.description || '').slice(0, 500);
      const boardName = item.board?.name || null;

      const finalTitle = derivePinTitle(title, destinationUrl, keywordRow.keyword, boardName, visualAnnotations);

      preparedPins.push({
        pin_id: pinId,
        rank_position: rank,
        title: finalTitle,
        description: description,
        alt_text: altText,
        domain,
        destination_url: destinationUrl,
        image_url: imageUrl,
        save_count: confirmedSaves,
        repin_count: confirmedRepins,
        comment_count: confirmedComments,
        daily_save_velocity: velocity,
        created_at_pinterest: createdAt,
        creation_method: method,
        dominant_color: item.dominant_color || '#888888',
        visual_annotations: visualAnnotations,
        crawled_at: crawlNowIso,
        metadata: {
          description: description,
          creation_method: method,
          prev_rank: prevRank,
          rank_delta: rankDelta,
          baseline_snapshot_id: immediateData?.snapshotId ?? null,
          baseline_date: immediateData?.snapshotDate ? (immediateData.snapshotDate instanceof Date ? immediateData.snapshotDate.toISOString().slice(0, 10) : String(immediateData.snapshotDate).slice(0, 10)) : null,
          is_new: isNew,
          prev_save_count: baselineMap.has(pinId) ? baseSavesForPin : (immediateData ? immediateData.saves : confirmedSaves),
          format,
          aspect_ratio: aspectRatio,
          aspect_ratio_tier: aspectRatioTier,
          velocity_tier: velocityTier,
          is_breakout_candidate: Boolean(
            rank >= 10 && (
              (pinAgeDays !== null && pinAgeDays <= 21 && (velocity >= 2.0 || confirmedSaves >= 10)) ||
              (rankDelta >= 10 && (velocity >= 1.0 || confirmedSaves >= 5)) ||
              (isNew && confirmedSaves >= 15)
            )
          ),
          breakout_score: Math.round((confirmedSaves / Math.max(1, pinAgeDays || 7)) * 10),
          pin_age_days: pinAgeDays,
          pinner,
          reactions,
          board_name: boardName,
          alt_text: (item.closeup_unified_description || item.description || '').slice(0, 500),
          is_deep_hydrated: false
        }
      });

      rank++;
    }

    // Batch Pidgets SERP Pre-Enrichment (LND-801)
    // Run fetchPinsBatchFromPidgets across 100% of SERP pins in chunks of 50
    if (typeof fetchPinsBatchFromPidgets === 'function' && preparedPins.length > 0) {
      const allPinIds = preparedPins.map(p => p.pin_id).filter(Boolean);
      for (let i = 0; i < allPinIds.length; i += 50) {
        const chunk = allPinIds.slice(i, i + 50);
        try {
          const pidgetsMap = await fetchPinsBatchFromPidgets(chunk);
          if (pidgetsMap) {
            for (const p of preparedPins) {
              const pidStr = String(p.pin_id);
              if (!pidgetsMap.has(pidStr)) continue;
              const pData = pidgetsMap.get(pidStr);
              if (!pData || pData.is_missing) continue;

              const pidgetSaves = Number(pData.saves ?? pData.save_count ?? 0);
              const pidgetRepins = Number(pData.repins ?? pData.repin_count ?? 0);
              if (pidgetSaves > 0) {
                p.save_count = Math.max(p.save_count, pidgetSaves);
              }
              if (pidgetRepins > 0) {
                p.repin_count = Math.max(p.repin_count, pidgetRepins);
              }
              if (pData.title && (!p.title || p.title === '')) {
                p.title = pData.title;
              }
              if (pData.image_hd_url) {
                p.image_hd_url = pData.image_hd_url;
                if (p.metadata) p.metadata.image_hd_url = pData.image_hd_url;
              }

              // Recalculate daily save velocity against baseline using calculateDailyVelocity to prevent hydration jumps (LND-801)
              const baseEntry = baselineMap.get(p.pin_id);
              if (baseEntry !== undefined && baseEntry !== null) {
                const baseSavesNum = (typeof baseEntry === 'object') ? Number(baseEntry.saves || 0) : Number(baseEntry || 0);
                const baseDateRaw = (typeof baseEntry === 'object' && baseEntry.date) ? new Date(baseEntry.date) : baselineSnapshotDate;
                const newVel = calculateDailyVelocity({
                  currentSaves: p.save_count,
                  baselineSaves: baseSavesNum,
                  currentRepins: p.repin_count,
                  baselineRepins: (baseEntry && typeof baseEntry === 'object' && baseEntry.repins != null) ? Number(baseEntry.repins) : Number(p.metadata?.baseline_repins || 0),
                  currentDate: new Date(),
                  baselineDate: baseDateRaw,
                  createdAt: p.created_at_pinterest || null,
                  maxCap: 25000
                });
                p.daily_save_velocity = newVel;
                const pIdxInPrepared = preparedPins.indexOf(p);
                if (pIdxInPrepared !== -1) {
                  pinVelocities[pIdxInPrepared] = newVel;
                }
                if (p.metadata) {
                  p.metadata.prev_save_count = baseSavesNum;
                  if (newVel >= 50) p.metadata.velocity_tier = 'explosive';
                  else if (newVel >= 10) p.metadata.velocity_tier = 'trending';
                  else if (newVel > 0) p.metadata.velocity_tier = 'steady';
                  else p.metadata.velocity_tier = 'stagnant';
                }
              }
            }
          }
        } catch (err) {
          console.warn('[crawlKeywordSERP] Batch Pidgets pre-enrichment chunk warning:', err?.message || err);
        }
      }
    }

    // Enrich top 10 ranking pins + up to 10 detected breakout candidates with verified live deep metrics via fetchPinFromPinterest
    const skipTopEnrich = Boolean(options.skip_top_enrich);
    const topSlice = skipTopEnrich ? [] : preparedPins.slice(0, 10);
    const breakoutSlice = skipTopEnrich ? [] : preparedPins.filter(p => p.metadata?.is_breakout_candidate && !topSlice.includes(p)).slice(0, 10);
    const topToEnrich = [...topSlice, ...breakoutSlice];
    if (topToEnrich.length > 0) {
      await Promise.allSettled(topToEnrich.map(async (p, idx) => {
        try {
          const detail = await fetchPinFromPinterest(p.pin_id, cookie);
          const scraped = detail?.pin || detail;
          if (scraped && (scraped.pin_id || scraped.id || scraped.title || scraped.saves !== undefined)) {
            p.crawled_at = new Date().toISOString();
            const enrichedSaves = Number(scraped.saves ?? scraped.save_count ?? p.save_count ?? 0);
            const enrichedRepins = Number(scraped.repins ?? scraped.repin_count ?? p.repin_count ?? 0);
            const enrichedComments = Number(scraped.comments ?? scraped.comment_count ?? p.comment_count ?? 0);
            const enrichedShares = Number(scraped.shares ?? scraped.share_count ?? 0);

            p.save_count = enrichedSaves >= 0 ? Math.max(p.save_count, enrichedSaves) : p.save_count;
            p.repin_count = Math.max(p.repin_count, enrichedRepins);
            p.comment_count = Math.max(p.comment_count, enrichedComments);
            if (scraped.created_at_pinterest || scraped.created_at) {
              const enrichedCreated = scraped.created_at_pinterest || scraped.created_at;
              p.created_at_pinterest = enrichedCreated;
            }
            if (scraped.method || scraped.creation_method) {
              const enrichedMethod = scraped.method || scraped.creation_method;
              p.creation_method = enrichedMethod;
              if (p.metadata) p.metadata.creation_method = enrichedMethod;
            }
            if (scraped.dominant_color) {
              p.dominant_color = scraped.dominant_color;
            }
            if (Array.isArray(scraped.visual_annotations) && scraped.visual_annotations.length > 0) {
              p.visual_annotations = scraped.visual_annotations;
            }
            if (p.metadata) {
              p.metadata.is_deep_hydrated = true;
              p.metadata.share_count = enrichedShares;
              if (scraped.alt_text || scraped.seo_alt_text) {
                const altStr = scraped.alt_text || scraped.seo_alt_text;
                p.alt_text = altStr;
                p.metadata.alt_text = altStr;
              }
              if (scraped.description) {
                const descStr = String(scraped.description).slice(0, 1000);
                p.description = descStr;
                p.metadata.description = descStr;
              }
              if (scraped.seo_title) p.metadata.seo_title = scraped.seo_title;
              if (scraped.seo_description) p.metadata.seo_description = scraped.seo_description;
              if (scraped.canonical_pin_id) p.metadata.canonical_pin_id = scraped.canonical_pin_id;
              if (scraped.canonical_pin_url) p.metadata.canonical_pin_url = scraped.canonical_pin_url;
              if (scraped.seo_canonical_url) p.metadata.seo_canonical_url = scraped.seo_canonical_url;
              if (scraped.aggregated_pin_data_id) p.metadata.aggregated_pin_data_id = scraped.aggregated_pin_data_id;
              if (scraped.domain_official_user?.username) p.metadata.domain_official_user = scraped.domain_official_user;
              if (scraped.board_pin_count) p.metadata.board_pin_count = Number(scraped.board_pin_count);
              if (scraped.board_order_modified_at) p.metadata.board_order_modified_at = scraped.board_order_modified_at;
              if (scraped.board_url) p.metadata.board_url = scraped.board_url;
              if (scraped.board_cover_url) p.metadata.board_cover_url = scraped.board_cover_url;
              if (scraped.board_thumbnail_url) p.metadata.board_thumbnail_url = scraped.board_thumbnail_url;
              if (scraped.image_signature) p.metadata.image_signature = scraped.image_signature;
              if (scraped.image_dimensions) p.metadata.image_dimensions = scraped.image_dimensions;
              if (scraped.rich_metadata) p.metadata.rich_metadata = scraped.rich_metadata;
              if (scraped.article_published_at) p.metadata.article_published_at = scraped.article_published_at;
              if (Array.isArray(scraped.seo_related_interests) && scraped.seo_related_interests.length > 0) {
                p.metadata.seo_related_interests = scraped.seo_related_interests;
              }
              if (Array.isArray(scraped.category_breadcrumbs) && scraped.category_breadcrumbs.length > 0) {
                p.metadata.category_breadcrumbs = scraped.category_breadcrumbs;
              }
              if (Array.isArray(scraped.visual_objects) && scraped.visual_objects.length > 0) {
                p.metadata.visual_objects = scraped.visual_objects;
              }
              if (scraped.golden_set_interest) p.metadata.golden_set_interest = scraped.golden_set_interest;
            }

            // Recalculate daily save velocity against baseline using calculateDailyVelocity to prevent hydration jumps (LND-801)
            const baseEntry = baselineMap.get(p.pin_id);
            if (baseEntry !== undefined && baseEntry !== null) {
              const baseSavesNum = (typeof baseEntry === 'object') ? Number(baseEntry.saves || 0) : Number(baseEntry || 0);
              const baseDateRaw = (typeof baseEntry === 'object' && baseEntry.date) ? new Date(baseEntry.date) : baselineSnapshotDate;
              const newVel = calculateDailyVelocity({
                currentSaves: p.save_count,
                baselineSaves: baseSavesNum,
                currentRepins: p.repin_count,
                baselineRepins: (baseEntry && typeof baseEntry === 'object' && baseEntry.repins != null) ? Number(baseEntry.repins) : Number(p.metadata?.baseline_repins || 0),
                repinCount: p.repin_count,
                currentDate: new Date(),
                baselineDate: baseDateRaw,
                createdAt: p.created_at_pinterest || null,
                maxCap: 25000
              });
              p.daily_save_velocity = newVel;
              const pIdxInPrepared = preparedPins.indexOf(p);
              if (pIdxInPrepared !== -1) {
                pinVelocities[pIdxInPrepared] = newVel;
              }
              if (p.metadata) {
                p.metadata.prev_save_count = (newVel === 0 && (baseSavesNum === 0 || Math.abs(baseSavesNum - Number(p.repin_count || 0)) <= Math.max(50, Number(p.repin_count || 0) * 0.03)))
                  ? p.save_count
                  : baseSavesNum;
                if (newVel >= 50) p.metadata.velocity_tier = 'explosive';
                else if (newVel >= 10) p.metadata.velocity_tier = 'trending';
                else if (newVel > 0) p.metadata.velocity_tier = 'steady';
                else p.metadata.velocity_tier = 'stagnant';
              }
            }
          }
        } catch (_) {
          // Fail-safe: keep BaseSearchResource fallback metrics if enrichment fails
        }
      }));
    }

    // PHASE 3: DYNAMIC SERP CIRCUIT BREAKER
    // Supporting niche keywords with only 20-30 pins: calculate expectedCount dynamically
    const priorActiveCount = immediateSnapshots.length;
    const effectiveTarget = targetCount || Number(keywordRow.target_pin_count) || 50;
    const expectedCount = priorActiveCount > 0
      ? Math.min(effectiveTarget, priorActiveCount)
      : effectiveTarget;

    const minRequiredForEviction = Math.max(10, Math.floor(expectedCount * 0.70));
    const isSuspectedIncompleteCrawl = preparedPins.length < minRequiredForEviction || paginationAbortedByHttp;
    const droppedOutList = [];

    if (isSuspectedIncompleteCrawl) {
      console.warn(`[Circuit Breaker] Suspected incomplete SERP crawl for keyword "${keywordRow.keyword}" (got ${preparedPins.length} pins vs ${priorActiveCount} prior, expected ${expectedCount}, min required ${minRequiredForEviction}, paginationAborted=${paginationAbortedByHttp}). Preserving rankings, skipping eviction.`);
    } else {
      for (const s of immediateSnapshots) {
        const pid = String(s.pin_id);
        if (!seenPinIds.has(pid) && !ignoredPinSet.has(pid)) {
          droppedOutList.push({
            pin_id: pid,
            rank_position: Number(s.rank_position || 1),
            save_count: Number(s.save_count || 0),
            repin_count: Number(s.repin_count || 0),
            comment_count: Number(s.comment_count || 0),
            title: s.title || '',
            image_url: s.image_url || null,
            domain: s.domain || '',
            destination_url: s.destination_url || '',
            board_name: s.board_name || s.metadata?.board_name || null,
            format: s.metadata?.format || 'ORGANIC PIN',
            created_at_pinterest: s.created_at_pinterest || s.metadata?.created_at_pinterest || s.metadata?.created_at || null,
            creation_method: s.creation_method || s.metadata?.creation_method || s.metadata?.method || 'pinterest_platform',
            metadata: s.metadata || {},
            dropped_at: new Date().toISOString()
          });
        }
      }
    }

    // DEADLOCK IMMUNITY: Sort deterministically by conflict key (pin_id)
    preparedPins.sort((a, b) => a.pin_id.localeCompare(b.pin_id));

    // Extract and store semantic guided search capsules (rankedGuides)
    let savedGuidesCount = 0;
    const seenGuideTerms = new Set();
    const preparedGuides = [];

    if (rawGuides.length > 0) {
      for (const g of rawGuides) {
        if (!g) continue;
        const term = String(g.term || g.display || '').trim();
        const termKey = term.toLowerCase();
        if (!term || seenGuideTerms.has(termKey)) continue;
        seenGuideTerms.add(termKey);
        preparedGuides.push({
          keyword_id: kid,
          term,
          display_label: String(g.display || g.term || '').trim(),
          score: Number(g.score || 0),
          dominant_color: String(g.dominant_color || '#10b981').slice(0, 64),
          display_order: preparedGuides.length + 1
        });
      }
      // Sort guides deterministically by term
      preparedGuides.sort((a, b) => a.term.localeCompare(b.term));
      savedGuidesCount = preparedGuides.length;
    }

    const crawledCount = rank - 1;
    if (crawledCount === 0) {
      const reason = priorActiveCount > 0 ? 'suspected_soft_block' : 'zero_organic_results';
      console.warn(`[SERP Integrity Guard] 0 pins collected for "${keywordRow.keyword}" (priorActive=${priorActiveCount}, reason=${reason}). Aborting state mutation.`);
      return {
        success: false,
        incomplete: true,
        reason,
        keyword: keywordRow.keyword,
        crawled_pins: 0,
        avg_velocity: Number(keywordRow.avg_daily_velocity || 0)
      };
    }

    // Statistical Winsorization (95th percentile upper clamp) to eliminate bot-farm metric distortion
    const robustVelocities = winsorize(pinVelocities, 0.95);
    const robustTotalVelocity = robustVelocities.reduce((acc, v) => acc + v, 0);
    const avgVelocity = crawledCount > 0 ? Number((robustTotalVelocity / crawledCount).toFixed(2)) : 0;

    // Track 14-day historical daily average velocity points for trend sparklines
    const baseMetadata = safeNormalizeMetadata(keywordRow.metadata);
    const prevHistory = Array.isArray(baseMetadata.velocity_history) ? [...baseMetadata.velocity_history] : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const filteredHistory = prevHistory.filter(h => h && h.date !== todayIso);
    if (!isSuspectedIncompleteCrawl) {
      filteredHistory.push({ date: todayIso, velocity: avgVelocity });
      if (filteredHistory.length > 14) filteredHistory.shift();
    }

    // Build slim metadata without last_dropped_pins or popular_pins (prevents pg_toast_221295 bloat!)
    const updatedMetadata = {
      ...baseMetadata,
      velocity_history: filteredHistory,
      last_crawled_pins_count: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawled_pins_count || crawledCount) : crawledCount,
      last_crawl_summary: {
        total: crawledCount,
        climbed: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.climbed || 0) : climbedCount,
        dropped: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.dropped || 0) : droppedCount,
        stable: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.stable || 0) : stableCount,
        new_entries: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.new_entries || 0) : newEntryCount,
        dropped_out: isSuspectedIncompleteCrawl ? (baseMetadata.last_crawl_summary?.dropped_out || 0) : droppedOutList.length
      }
    };
    delete updatedMetadata.crawl_lock;
    delete updatedMetadata.last_dropped_pins;
    delete updatedMetadata.popular_pins;

    // Prepare slimmed Hub SERP rows (strip heavy duplicate fields from Hub metadata JSONB)
    const hubSerpPayload = preparedPins.map(p => ({
      pin_id: p.pin_id,
      rank_position: p.rank_position,
      prev_rank_position: p.metadata?.prev_rank ?? p.rank_position,
      baseline_day_saves: (p.daily_save_velocity === 0 && p.metadata?.prev_save_count && Math.abs(Number(p.metadata.prev_save_count) - Number(p.repin_count || 0)) <= Math.max(50, Number(p.repin_count || 0) * 0.03))
        ? p.save_count
        : (p.metadata?.prev_save_count ?? p.save_count),
      baseline_day_date: p.metadata?.baseline_date || todayIso,
      title: p.title,
      domain: p.domain,
      destination_url: p.destination_url,
      image_url: p.image_url,
      creator_username: p.metadata?.pinner?.username || '',
      board_name: p.metadata?.board_name || '',
      save_count: p.save_count,
      repin_count: p.repin_count,
      comment_count: p.comment_count,
      daily_save_velocity: p.daily_save_velocity,
      dominant_color: p.dominant_color || '#888888',
      visual_annotations: p.visual_annotations || [],
      created_at_pinterest: p.created_at_pinterest,
      creation_method: p.creation_method || null,
      crawled_at: p.crawled_at || null,
      metadata: {
        prev_rank: p.metadata?.prev_rank ?? null,
        rank_delta: p.metadata?.rank_delta ?? 0,
        is_new: Boolean(p.metadata?.is_new),
        format: p.metadata?.format || 'ORGANIC PIN',
        aspect_ratio: p.metadata?.aspect_ratio || '2:3',
        aspect_ratio_tier: p.metadata?.aspect_ratio_tier || '2:3 Standard',
        velocity_tier: p.metadata?.velocity_tier || 'stagnant',
        is_breakout_candidate: Boolean(p.metadata?.is_breakout_candidate),
        breakout_score: Number(p.metadata?.breakout_score || 0),
        pin_age_days: p.metadata?.pin_age_days ?? null,
        pinner: p.metadata?.pinner ? {
          username: p.metadata.pinner.username || '',
          follower_count: Number(p.metadata.pinner.follower_count || 0)
        } : null,
        is_deep_hydrated: Boolean(p.metadata?.is_deep_hydrated),
        has_treasures: Boolean(p.metadata?.is_deep_hydrated || p.metadata?.has_treasures),
        image_signature: p.metadata?.image_signature || undefined,
        canonical_pin_id: p.metadata?.canonical_pin_id || undefined,
        board_pin_count: p.metadata?.board_pin_count || undefined
      }
    }));

    // ATOMIC MULTI-STATEMENT TRANSACTION VIA sql.transaction
    // Bundles Hub active SERP cache + slim displaced index updates into 1 ACID commit
    const txBatch = [];

    if (hubSerpPayload.length > 0 && !isSuspectedIncompleteCrawl) {
      // 1. Keep Hub's active SERP cache (keyword_serp_current) synchronized with inline baseline columns
      txBatch.push((db) => db`
        INSERT INTO keyword_serp_current (
          keyword_id,
          pin_id,
          rank_position,
          prev_rank_position,
          baseline_day_saves,
          baseline_day_date,
          title,
          domain,
          destination_url,
          image_url,
          creator_username,
          board_name,
          save_count,
          repin_count,
          comment_count,
          daily_save_velocity,
          dominant_color,
          visual_annotations,
          created_at_pinterest,
          creation_method,
          metadata,
          crawled_at
        )
        SELECT
          ${kid},
          u.pin_id,
          u.rank_position,
          u.prev_rank_position,
          u.baseline_day_saves,
          u.baseline_day_date::date,
          u.title,
          u.domain,
          u.destination_url,
          u.image_url,
          u.creator_username,
          u.board_name,
          u.save_count,
          u.repin_count,
          u.comment_count,
          u.daily_save_velocity,
          COALESCE(NULLIF(u.dominant_color, ''), '#888888'),
          COALESCE(u.visual_annotations, '[]'::jsonb),
          u.created_at_pinterest::timestamptz,
          COALESCE(u.creation_method, 'pinterest_platform'),
          COALESCE(u.metadata, '{}'::jsonb),
          u.crawled_at::timestamptz
        FROM jsonb_to_recordset(${JSON.stringify(hubSerpPayload)}::jsonb) AS u(
          pin_id text,
          rank_position int,
          prev_rank_position int,
          baseline_day_saves bigint,
          baseline_day_date text,
          title text,
          domain text,
          destination_url text,
          image_url text,
          creator_username text,
          board_name text,
          save_count bigint,
          repin_count int,
          comment_count int,
          daily_save_velocity numeric,
          dominant_color text,
          visual_annotations jsonb,
          created_at_pinterest text,
          creation_method text,
          metadata jsonb,
          crawled_at text
        )
        WHERE NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = u.pin_id
        )
        ORDER BY u.pin_id ASC
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          prev_rank_position = COALESCE(keyword_serp_current.rank_position, EXCLUDED.prev_rank_position),
          rank_position = EXCLUDED.rank_position,
          last_known_rank = EXCLUDED.rank_position,
          baseline_day_saves = CASE
            -- If prior baseline_day_saves was a repin_count artifact and real saves are now available, reset to save_count
            WHEN keyword_serp_current.repin_count > 0 
             AND ABS(keyword_serp_current.baseline_day_saves - keyword_serp_current.repin_count) <= GREATEST(50, keyword_serp_current.repin_count * 0.03)
             AND EXCLUDED.save_count > keyword_serp_current.repin_count
            THEN EXCLUDED.save_count
            WHEN COALESCE((keyword_serp_current.crawled_at AT TIME ZONE 'UTC')::date, keyword_serp_current.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date
            THEN keyword_serp_current.save_count
            ELSE COALESCE(NULLIF(keyword_serp_current.baseline_day_saves, 0), EXCLUDED.baseline_day_saves)
          END,
          baseline_day_date = CASE
            WHEN COALESCE((keyword_serp_current.crawled_at AT TIME ZONE 'UTC')::date, keyword_serp_current.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date
            THEN (NOW() AT TIME ZONE 'UTC')::date
            ELSE COALESCE(keyword_serp_current.baseline_day_date, EXCLUDED.baseline_day_date)
          END,
          is_displaced = FALSE,
          displaced_date = NULL,
          title = COALESCE(NULLIF(EXCLUDED.title, ''), keyword_serp_current.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), keyword_serp_current.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), keyword_serp_current.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), keyword_serp_current.image_url),
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), keyword_serp_current.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), keyword_serp_current.board_name),
          save_count = GREATEST(COALESCE(keyword_serp_current.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
          repin_count = GREATEST(COALESCE(keyword_serp_current.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
          comment_count = GREATEST(COALESCE(keyword_serp_current.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
          daily_save_velocity = CASE 
            -- Accept EXCLUDED velocity if current row holds a repin-to-save artifact or if EXCLUDED has fresh computation
            WHEN keyword_serp_current.repin_count > 0 
             AND ABS((keyword_serp_current.save_count - keyword_serp_current.repin_count) - keyword_serp_current.daily_save_velocity) <= GREATEST(50, keyword_serp_current.repin_count * 0.03)
             AND keyword_serp_current.daily_save_velocity >= 100
            THEN COALESCE(EXCLUDED.daily_save_velocity, 0)
            WHEN EXCLUDED.daily_save_velocity IS NOT NULL 
             AND (EXCLUDED.daily_save_velocity > 0 OR COALESCE((keyword_serp_current.crawled_at AT TIME ZONE 'UTC')::date, keyword_serp_current.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
            THEN EXCLUDED.daily_save_velocity 
            ELSE COALESCE(keyword_serp_current.daily_save_velocity, 0) 
          END,
          dominant_color = CASE 
            WHEN EXCLUDED.dominant_color IS NOT NULL AND EXCLUDED.dominant_color != '#888888' 
            THEN EXCLUDED.dominant_color 
            ELSE keyword_serp_current.dominant_color 
          END,
          visual_annotations = CASE 
            WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
            THEN EXCLUDED.visual_annotations 
            ELSE COALESCE(keyword_serp_current.visual_annotations, '[]'::jsonb) 
          END,
          created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, keyword_serp_current.created_at_pinterest),
          creation_method = CASE
            WHEN EXCLUDED.creation_method IS NOT NULL AND LOWER(TRIM(EXCLUDED.creation_method)) NOT IN ('', 'pinterest_platform')
            THEN EXCLUDED.creation_method
            ELSE COALESCE(NULLIF(keyword_serp_current.creation_method, ''), EXCLUDED.creation_method, 'pinterest_platform')
          END,
          metadata = (CASE WHEN jsonb_typeof(keyword_serp_current.metadata) = 'object' THEN keyword_serp_current.metadata ELSE '{}'::jsonb END)
            || EXCLUDED.metadata
            || jsonb_build_object(
              'is_deep_hydrated',
              (COALESCE((keyword_serp_current.metadata->>'is_deep_hydrated')::boolean, false) OR COALESCE((EXCLUDED.metadata->>'is_deep_hydrated')::boolean, false)),
              'creation_method',
              CASE
                WHEN EXCLUDED.creation_method IS NOT NULL AND LOWER(TRIM(EXCLUDED.creation_method)) NOT IN ('', 'pinterest_platform')
                THEN EXCLUDED.creation_method
                ELSE COALESCE(NULLIF(keyword_serp_current.creation_method, ''), EXCLUDED.creation_method, 'pinterest_platform')
              END
            ),
          crawled_at = COALESCE(EXCLUDED.crawled_at, keyword_serp_current.crawled_at),
          updated_at = NOW();
      `);

      // 2. Dynamic SERP Guard: Move displaced pins into slim keyword_displaced_index & delete from keyword_serp_current
      const pinIds = preparedPins.map(p => p.pin_id);
      const shouldApplyDisplacement = !isSuspectedIncompleteCrawl && pinIds.length >= minRequiredForEviction;

      if (shouldApplyDisplacement) {
        if (env?.PIN_D1_DB) {
          // [INVARIANT: WRITE-TIME-D1-PRESERVATION]
          // Preserve creative metadata of displaced pins in Cloudflare D1 before deletion from keyword_serp_current
          try {
            const displacedToPreserve = await sql`
              SELECT pin_id, title, domain, destination_url, image_url,
                     dominant_color, visual_annotations, description, created_at_pinterest
              FROM keyword_serp_current
              WHERE keyword_id = ${kid}
                AND NOT (pin_id = ANY(${pinIds}))
                AND (title <> '' OR image_url <> '');
            `.catch(() => []);
            if (displacedToPreserve && displacedToPreserve.length > 0) {
              syncPinsBatchToD1(env, displacedToPreserve).catch(() => {});
            }
          } catch (_) {}
        }

        // Remove any resurged pins from keyword_displaced_index
        txBatch.push((db) => db`
          DELETE FROM keyword_displaced_index
          WHERE keyword_id = ${kid}
            AND pin_id = ANY(${pinIds});
        `);

        // Archive displaced pins into slim keyword_displaced_index (56 bytes/row on Hub)
        txBatch.push((db) => db`
          INSERT INTO keyword_displaced_index (
            keyword_id, pin_id, domain, creator_username, last_known_rank, vacuum_opportunity_score,
            displaced_date, save_count, repin_count, comment_count, share_count,
            daily_save_velocity, updated_at
          )
          SELECT
            keyword_id,
            pin_id,
            domain,
            NULLIF(LOWER(TRIM(creator_username)), ''),
            LEAST(32767, GREATEST(1, COALESCE(rank_position, last_known_rank, 100)))::smallint,
            CASE 
              WHEN COALESCE(rank_position, last_known_rank, 100) <= 5 THEN 85
              WHEN COALESCE(rank_position, last_known_rank, 100) <= 15 THEN 75
              WHEN COALESCE(rank_position, last_known_rank, 100) <= 50 THEN 60
              ELSE 45
            END::smallint,
            (NOW() AT TIME ZONE 'UTC')::date,
            COALESCE(save_count, 0),
            COALESCE(repin_count, 0),
            COALESCE(comment_count, 0),
            COALESCE(share_count, 0),
            COALESCE(daily_save_velocity, 0),
            NOW()
          FROM keyword_serp_current
          WHERE keyword_id = ${kid}
            AND NOT (pin_id = ANY(${pinIds}))
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_current.pin_id
            )
          ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
            domain = COALESCE(NULLIF(EXCLUDED.domain, ''), keyword_displaced_index.domain),
            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), keyword_displaced_index.creator_username),
            last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_displaced_index.last_known_rank),
            vacuum_opportunity_score = GREATEST(keyword_displaced_index.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
            save_count = GREATEST(keyword_displaced_index.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(keyword_displaced_index.repin_count, EXCLUDED.repin_count),
            daily_save_velocity = EXCLUDED.daily_save_velocity,
            updated_at = NOW();
        `);

        // Evict displaced rows from keyword_serp_current so Hub SERP cache remains < 15 MB
        txBatch.push((db) => db`
          DELETE FROM keyword_serp_current
          WHERE keyword_id = ${kid}
            AND (is_displaced = TRUE OR NOT (pin_id = ANY(${pinIds})));
        `);
      } else if (pinIds.length > 0) {
        console.warn(`[SERP Guard] Crawl returned only ${pinIds.length} pins for keyword "${keywordRow.keyword}" (Dynamic Threshold: ${minRequiredForEviction}, Expected: ${expectedCount}, Prior Active: ${priorActiveCount}). Displacement skipped to protect active rankings.`);
      }
    }

    if (preparedGuides.length > 0) {
      txBatch.push((db) => db`
        INSERT INTO keyword_guided_capsules (
          keyword_id, term, display_label, score, dominant_color, display_order, discovered_at
        )
        SELECT
          u.keyword_id, u.term, u.display_label, u.score, u.dominant_color, u.display_order, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(preparedGuides)}::jsonb) AS u(
          keyword_id int,
          term text,
          display_label text,
          score numeric,
          dominant_color text,
          display_order int
        )
        ON CONFLICT (keyword_id, term) DO UPDATE SET
          display_label = EXCLUDED.display_label,
          score = EXCLUDED.score,
          dominant_color = EXCLUDED.dominant_color,
          display_order = EXCLUDED.display_order,
          discovered_at = NOW();
      `);
    }

    // Atomic update of tracked_keywords metadata AND release scalar crawl_lease_until
    const finalVelocity = isSuspectedIncompleteCrawl ? (Number(keywordRow.avg_daily_velocity) || 0) : avgVelocity;
    const lastCrawledAtVal = isSuspectedIncompleteCrawl
      ? (keywordRow.last_crawled_at ? new Date(keywordRow.last_crawled_at).toISOString() : null)
      : new Date().toISOString();

    txBatch.push((db) => db`
      UPDATE tracked_keywords SET
        top_pin_id = ${topPin && !isSuspectedIncompleteCrawl ? topPin.pinId : keywordRow.top_pin_id},
        top_pin_title = ${topPin && !isSuspectedIncompleteCrawl ? topPin.title : keywordRow.top_pin_title},
        top_pin_image = ${topPin && !isSuspectedIncompleteCrawl ? topPin.imageUrl : keywordRow.top_pin_image},
        avg_daily_velocity = ${finalVelocity},
        last_crawled_at = ${lastCrawledAtVal}::timestamptz,
        crawl_lease_token = CASE WHEN ${skipLeaseRelease} THEN crawl_lease_token ELSE NULL END,
        crawl_lease_until = CASE WHEN ${skipLeaseRelease} THEN crawl_lease_until ELSE NULL END,
        updated_at = NOW(),
        metadata = ${JSON.stringify(updatedMetadata)}::jsonb
      WHERE id = ${kid}
        AND (crawl_lease_token = ${effectiveToken}::uuid OR crawl_lease_token IS NULL);
    `);

    // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
    // Execute atomic Hub transaction in 1 atomic transaction / single roundtrip using lazy query builders
    // Supports both wrapped Worker clients (__atomicBuilderWrapped / Hyperdrive) and raw @neondatabase/serverless CLI clients
    if (typeof sql.transaction === 'function') {
      const isLazyRequired = Boolean(
        sql.__atomicBuilderWrapped ||
        typeof sql.begin === 'function' ||
        (sql.options && sql.options.max !== undefined)
      );
      const txPayload = isLazyRequired
        ? txBatch.map(b => (typeof b === 'function' ? b : (db) => b))
        : txBatch.map(b => (typeof b === 'function' ? b(sql) : b));
      await sql.transaction(txPayload);
    } else if (typeof sql.begin === 'function') {
      await sql.begin(async (tx) => {
        for (const builder of txBatch) {
          await builder(tx);
        }
      });
    } else {
      for (const builder of txBatch) {
        await builder(sql);
      }
    }
    leaseCommittedInTx = true;

    // Auto-discover newly ranked creators into tracking folders if enabled (R3)
    autoDiscoverFolderCreatorsForKeyword(sql, kid).catch(err => {
      console.warn(`[crawlKeywordSERP] Auto-discover folder creators warning for keyword ${kid}:`, err?.message);
    });

    // Route 100% of static creative metadata & historical time-series (active + displaced) directly to the 99 Shards + D1
    // Bypassed during Fleet Phase 1A when skip_shard_offload=true since Phase 1B performs global deduplicated shard sync
    const envObj = options?.env || null;
    if (!options?.skip_shard_offload && !isSuspectedIncompleteCrawl && (preparedPins.length > 0 || droppedOutList.length > 0)) {
      await offloadKeywordCrawlToShards(sql, kid, preparedPins, droppedOutList, envObj).catch(err => {
        console.warn(`[crawlKeywordSERP] Shard offload non-fatal warning for keyword ${kid}:`, err.message);
      });
    }

    // Invalidate stale Edge KV caches for this keyword immediately upon successful crawl
    if (envObj?.PIN_ENGINE_KV) {
      Promise.allSettled([
        envObj.PIN_ENGINE_KV.delete(`serp:comp:${kid}`),
        envObj.PIN_ENGINE_KV.delete(`displaced:kw:${kid}:150:0`),
        envObj.PIN_ENGINE_KV.delete(`displaced:kw:${kid}:100:0`),
        envObj.PIN_ENGINE_KV.delete(`displaced:kw:${kid}:250:0`)
      ]).catch(() => {});
    }

    return {
      success: true,
      keyword: keywordRow.keyword,
      crawled_pins: crawledCount,
      top_pin: topPin,
      avg_velocity: avgVelocity,
      guides_count: savedGuidesCount,
      summary: {
        total: crawledCount,
        climbed: climbedCount,
        dropped: droppedCount,
        stable: stableCount,
        new_entries: newEntryCount,
        dropped_out: droppedOutList.length
      }
    };
  } finally {
    // Release process-local mutex
    activeKeywordCrawls.delete(kid);

    // If this node acquired the lease and transaction failed or aborted early, heal scalar crawl_lease_until
    if (leaseAcquired && !leaseCommittedInTx && !skipLeaseRelease) {
      await sql`
        UPDATE tracked_keywords 
        SET crawl_lease_token = NULL,
            crawl_lease_until = NULL
        WHERE id = ${kid}
          AND crawl_lease_token = ${effectiveToken}::uuid;
      `.catch(() => {});
    }
  }
}

/**
 * Retrieve pins for a specific keyword ordered by rank
 * Reads directly from active catalog (keyword_serp_current) via idx_ksc_active_covering
 * with automatic fallback to historical keyword_pins_snapshots.
 */
export async function getKeywordPins(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) return [];

  // 1. Direct Ultra-Low Latency Read from Active Catalog (keyword_serp_current)
  const activeRows = await sql`
    SELECT 
      pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
      save_count, repin_count, daily_save_velocity, creator_username,
      board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
      metadata, crawled_at, updated_at, is_displaced, vacuum_opportunity_score
    FROM keyword_serp_current
    WHERE keyword_id = ${kid}
      AND is_displaced = FALSE
      AND rank_position IS NOT NULL
      AND rank_position >= 1
      AND NOT EXISTS (
        SELECT 1 FROM keyword_ignored_pins kip
        WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_current.pin_id
      )
    ORDER BY rank_position ASC;
  `.catch(() => []);

  // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub holds zero historical snapshots; active catalog is SSOT
  return activeRows || [];
}

/**
 * Retrieve semantic guided capsules for a keyword
 */
export async function getKeywordGuides(sql, keywordId) {
  const kid = Number(keywordId);
  try {
    return await sql`
      SELECT id, keyword_id, term, display_label, score, dominant_color, display_order, discovered_at
      FROM keyword_guided_capsules
      WHERE keyword_id = ${kid}
      ORDER BY display_order ASC, score DESC;
    `;
  } catch (err) {
    console.warn('[!] getKeywordGuides fallback:', err.message);
    return [];
  }
}

/**
 * SERP Deep-Dive & Rank Fluctuation Inspector:
 * Compares latest crawl vs previous crawl using atomic SQL subqueries:
 * - Current pins with rank positions & movement deltas (▲ climbed, ▼ dropped, = stable, ★ new)
 * - PinArchive metadata parity (format, velocity tier, aspect ratio)
 * - Velocity distribution sparkline histogram points
 * - Pins that fell out of top 50 (dropped_out_pins from persistent Vault)
 * - Semantic guided capsules
 */
export async function getKeywordSERPComparison(sql, keywordId, knownKeyword = null, options = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  let actualKeyword = knownKeyword;
  let opts = options;
  if (knownKeyword && typeof knownKeyword === 'object' && ('env' in knownKeyword || 'forceRefresh' in knownKeyword)) {
    opts = knownKeyword;
    actualKeyword = null;
  }
  const { env = null, forceRefresh = false } = opts;

  // 1. Check Cloudflare Edge KV (`serp:comp:${kid}`) for sub-5ms response
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      // [INVARIANT: NO-MUTABLE-KV-CACHE-TTL] Eliminate cacheTtl on mutable keys to prevent stale edge PoP reads
      const kvCached = await env.PIN_ENGINE_KV.get(`serp:comp:${kid}`, { type: 'json' });
      if (kvCached && kvCached.status === 'active' && Array.isArray(kvCached.current_pins) && kvCached.current_pins.length > 0 && kvCached.total_displaced_count !== undefined) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  // Parallel fetch: keyword metadata (if not already known), active catalog pins, distinct dates, dropped pins, guided capsules, and true displaced count
  const [keywordRows, activeCatalogPins, dates, displacedResultRaw, guides, displacedCountRow] = await Promise.all([
    actualKeyword ? Promise.resolve([actualKeyword]) : sql`
      SELECT id, keyword, category, is_active, last_crawled_at, updated_at, target_pin_count, avg_daily_velocity, metadata
      FROM tracked_keywords 
      WHERE id = ${kid};
    `,
    sql`
      SELECT 
        pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
        save_count, repin_count, daily_save_velocity, creator_username,
        board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
        metadata, crawled_at, updated_at, is_displaced, vacuum_opportunity_score
      FROM keyword_serp_current
      WHERE keyword_id = ${kid}
        AND is_displaced = FALSE
        AND rank_position IS NOT NULL
        AND rank_position >= 1
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_current.pin_id
        )
      ORDER BY rank_position ASC;
    `.catch(() => []),
    // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub holds zero historical snapshots
    Promise.resolve([]),
    getKeywordDisplacedPins(sql, kid, { limit: 24, env, skipShardHydration: true }).catch(() => null),
    getKeywordGuides(sql, kid).catch(() => []),
    sql`
      SELECT COUNT(*)::int AS total 
      FROM keyword_displaced_index 
      WHERE keyword_id = ${kid}
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_displaced_index.pin_id
        );
    `.catch(() => [{ total: 0 }])
  ]);

  const keyword = keywordRows[0];
  if (!keyword) throw new Error(`Keyword ID ${kid} not found`);

  let droppedOutPins = displacedResultRaw?.pins || [];
  if (droppedOutPins.length === 0 && Array.isArray(keyword.metadata?.last_dropped_pins) && keyword.metadata.last_dropped_pins.length > 0) {
    droppedOutPins = keyword.metadata.last_dropped_pins;
  }

  const countFromDb = Number(displacedCountRow?.[0]?.total || 0);
  const countFromResult = Number(displacedResultRaw?.total || 0);
  const totalDisplacedCount = Math.max(countFromDb, countFromResult, droppedOutPins.length);
  const totalCatalogPinsCount = (Array.isArray(activeCatalogPins) ? activeCatalogPins.length : 0) + totalDisplacedCount;

  const latestDate = activeCatalogPins?.[0]?.crawled_at ? new Date(activeCatalogPins[0].crawled_at).toISOString().slice(0, 10) : null;
  let currentPins = Array.isArray(activeCatalogPins) && activeCatalogPins.length > 0 ? activeCatalogPins : [];

  if (currentPins.length === 0) {
    return {
      status: 'never_crawled',
      keyword,
      current_pins: [],
      dropped_out_pins: droppedOutPins,
      total_displaced_count: totalDisplacedCount,
      total_catalog_pins_count: totalCatalogPinsCount,
      tag_frequencies: {},
      core_anchors: [],
      guides: guides || [],
      velocity_chart: { points: [], explosive: 0, trending: 0, steady: 0, stagnant: 0 },
      stats: { total: 0, climbed: 0, dropped: 0, stable: 0, new_entries: 0, dropped_out: totalDisplacedCount }
    };
  }

  // Calculate summary stats and build velocity chart data
  let climbed = 0;
  let dropped = 0;
  let stable = 0;
  let newEntries = 0;
  let explosiveCount = 0;
  let trendingCount = 0;
  let steadyCount = 0;
  let stagnantCount = 0;

  const sparklinePoints = [];

  for (const p of currentPins) {
    const meta = p.metadata || {};
    p.title = derivePinTitle(p.title, p.destination_url, keyword.keyword, meta.board_name, meta.visual_annotations);
    const delta = Number(meta.rank_delta || 0);
    const vel = Number(p.daily_save_velocity || 0);

    sparklinePoints.push(vel);

    if (vel >= 50) explosiveCount++;
    else if (vel >= 10) trendingCount++;
    else if (vel > 0) steadyCount++;
    else stagnantCount++;

    if (meta.is_new) {
      newEntries++;
    } else if (delta > 0) {
      climbed++;
    } else if (delta < 0) {
      dropped++;
    } else {
      stable++;
    }
  }

  for (const p of droppedOutPins) {
    const meta = p.metadata || {};
    p.board_name = p.board_name || meta.board_name || null;
    p.creation_method = p.creation_method || p.method || meta.creation_method || meta.method || null;
    p.created_at_pinterest = p.created_at_pinterest || meta.created_at_pinterest || meta.created_at || null;
    p.title = derivePinTitle(p.title, p.destination_url, keyword.keyword, p.board_name, meta.visual_annotations);
  }

  // Pre-calculate visual tag frequency crossover map on the server (sub-millisecond Node/V8)
  const tagFrequencies = {};
  const coreAnchors = [];
  for (const p of [...currentPins, ...droppedOutPins]) {
    const raw = p.metadata?.visual_annotations || p.annotations || p.visual_annotations || [];
    if (Array.isArray(raw)) {
      const seenForPin = new Set();
      for (const t of raw) {
        const str = typeof t === 'string' ? t.trim() : (t?.name || t?.label || t?.term || '').trim();
        if (str && str.length >= 2) {
          const lower = str.toLowerCase();
          if (!seenForPin.has(lower)) {
            seenForPin.add(lower);
            tagFrequencies[lower] = (tagFrequencies[lower] || 0) + 1;
          }
        }
      }
    }
  }
  for (const [tag, count] of Object.entries(tagFrequencies)) {
    if (count >= 3) {
      coreAnchors.push({ tag, count });
    }
  }
  coreAnchors.sort((a, b) => b.count - a.count);

  // Algorithmic StaticRank & Semantic Vacuum SERP Intelligence
  const intelligence = calculateKeywordIntelligenceSummary(currentPins);

  const totalVelocity = sparklinePoints.reduce((acc, v) => acc + (Number(v) || 0), 0);
  const avgVelocity = sparklinePoints.length > 0 ? Number((totalVelocity / sparklinePoints.length).toFixed(2)) : 0;

  const comparisonPayload = {
    status: 'active',
    keyword,
    snapshot_date: latestDate,
    has_history: dates.length > 1 || droppedOutPins.length > 0,
    current_pins: currentPins,
    dropped_out_pins: droppedOutPins,
    total_displaced_count: totalDisplacedCount,
    total_catalog_pins_count: totalCatalogPinsCount,
    tag_frequencies: tagFrequencies,
    core_anchors: coreAnchors,
    guides,
    intelligence,
    avg_velocity: avgVelocity,
    velocity_chart: {
      points: sparklinePoints,
      explosive: explosiveCount,
      trending: trendingCount,
      steady: steadyCount,
      stagnant: stagnantCount
    },
    stats: {
      total: currentPins.length,
      climbed,
      dropped,
      stable,
      new_entries: newEntries,
      dropped_out: totalDisplacedCount
    }
  };

  if (env?.PIN_ENGINE_KV && currentPins.length > 0) {
    try {
      await env.PIN_ENGINE_KV.put(`serp:comp:${kid}`, JSON.stringify(comparisonPayload), { expirationTtl: 1800 });
    } catch (_) {}
  }
  if (env?.PIN_D1_DB && currentPins.length > 0) {
    syncPinsBatchToD1(env, currentPins).catch(() => {});
  }

  return comparisonPayload;
}

// [INVARIANT: MODULAR-ANALYTICS]
// calculateKeywordIntelligenceSummary and calculateMedian are imported from ./analytics.mjs above.

/**
 * Retrieve standalone Algorithmic Intelligence Summary for a keyword
 */
export async function getKeywordIntelligence(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  const [keyword] = await sql`
    SELECT id, keyword, category, is_active FROM tracked_keywords WHERE id = ${kid};
  `;
  if (!keyword) throw new Error(`Keyword ID ${kid} not found`);

  const pins = await getKeywordPins(sql, kid);
  const intelligence = calculateKeywordIntelligenceSummary(pins);

  return {
    success: true,
    keyword_id: kid,
    keyword: keyword.keyword,
    category: keyword.category,
    pins_analyzed: pins.length,
    ...intelligence
  };
}

/**
 * ============================================================================
 * DISPLACED PINS VAULT & UNIFIED TIMELINE INTELLIGENCE (Phase 3)
 * ============================================================================
 */

/**
 * Retrieve persistent displaced pins for a keyword from keyword_serp_current (is_displaced = TRUE)
 * with calculated live deltas and arbitrage vacuum opportunity score.
 */
export async function getKeywordDisplacedPins(sql, keywordId, options = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');

  // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict pagination <= 30 pins per page
  const { status = 'ALL', limit = 24, offset = 0, env = null, forceRefresh = false, skipShardHydration = false } = options;
  const lim = Math.min(30, Math.max(1, Number(limit) || 24));
  const off = Math.max(0, Number(offset) || 0);

  const kvKey = `displaced:kw:${kid}:${lim}:${off}`;
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      // [INVARIANT: NO-MUTABLE-KV-CACHE-TTL] Eliminate cacheTtl on mutable keys to prevent stale edge PoP reads
      const kvCached = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
      if (kvCached && Array.isArray(kvCached.pins) && kvCached.pins.length > 0) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  // Query slim keyword_displaced_index (or fallback to keyword_serp_current WHERE is_displaced = TRUE)
  // and hydrate creative fields from deterministic shards in parallel
  let rawRows = await sql`
    SELECT
      kdi.keyword_id,
      kdi.pin_id,
      ksc.title,
      COALESCE(kdi.domain, ksc.domain) AS domain,
      ksc.destination_url,
      ksc.image_url,
      ksc.creator_username,
      ksc.board_name,
      kdi.last_known_rank,
      kdi.displaced_date,
      'displaced_active' AS status,
      kdi.save_count AS current_saves,
      kdi.save_count,
      kdi.repin_count AS current_repins,
      kdi.repin_count,
      kdi.comment_count AS current_comments,
      kdi.comment_count,
      kdi.share_count AS current_shares,
      kdi.share_count,
      kdi.daily_save_velocity,
      kdi.daily_save_velocity AS calculated_velocity,
      kdi.vacuum_opportunity_score,
      COALESCE(ksc.metadata->>'alt_text', '') AS seo_alt_text,
      COALESCE(ksc.visual_annotations, '[]'::jsonb) AS annotations,
      COALESCE(ksc.dominant_color, '#888888') AS dominant_color,
      ksc.created_at_pinterest,
      COALESCE(ksc.creation_method, 'pinterest_platform') AS creation_method,
      COALESCE(ksc.metadata, '{}'::jsonb) AS metadata,
      kdi.updated_at AS created_at
    FROM keyword_displaced_index kdi
    LEFT JOIN keyword_serp_current ksc
      ON ksc.keyword_id = kdi.keyword_id AND ksc.pin_id = kdi.pin_id
    WHERE kdi.keyword_id = ${kid}
      AND NOT EXISTS (
        SELECT 1 FROM keyword_ignored_pins kip
        WHERE kip.keyword_id = ${kid} AND kip.pin_id = kdi.pin_id
      )
    ORDER BY kdi.vacuum_opportunity_score DESC, kdi.last_known_rank ASC NULLS LAST
    LIMIT ${lim} OFFSET ${off};
  `.catch(() => []);

  let [cntRow] = await sql`
    SELECT COUNT(*)::int AS total
    FROM keyword_displaced_index kdi
    WHERE kdi.keyword_id = ${kid}
      AND NOT EXISTS (
        SELECT 1 FROM keyword_ignored_pins kip
        WHERE kip.keyword_id = ${kid} AND kip.pin_id = kdi.pin_id
      );
  `.catch(() => []);

  if (!cntRow || Number(cntRow.total || 0) === 0) {
    rawRows = await sql`
      SELECT 
        keyword_id, pin_id, title, domain, destination_url, image_url,
        creator_username, board_name,
        COALESCE(last_known_rank, rank_position) as last_known_rank,
        displaced_date,
        'displaced_active' as status,
        save_count as current_saves,
        save_count,
        repin_count as current_repins,
        repin_count,
        comment_count as current_comments,
        comment_count,
        share_count as current_shares,
        share_count,
        daily_save_velocity,
        daily_save_velocity as calculated_velocity,
        vacuum_opportunity_score,
        COALESCE(metadata->>'alt_text', '') as seo_alt_text,
        COALESCE(visual_annotations, '[]'::jsonb) as annotations,
        dominant_color,
        created_at_pinterest, creation_method, metadata, crawled_at as created_at
      FROM keyword_serp_current
      WHERE keyword_id = ${kid} AND is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_current.pin_id
        )
      ORDER BY vacuum_opportunity_score DESC, last_known_rank ASC NULLS LAST
      LIMIT ${lim} OFFSET ${off};
    `.catch(() => []);

    [cntRow] = await sql`
      SELECT COUNT(*)::int AS total 
      FROM keyword_serp_current 
      WHERE keyword_id = ${kid} AND is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_current.pin_id
        );
    `.catch(() => []);
  }

  const rows = await hydrateDisplacedIndexFromShards(sql, rawRows, env, skipShardHydration);

  // Calculate live deltas and vacuum opportunity score for each pin
  for (const pin of rows) {
    pin.save_count = Number(pin.save_count || pin.current_saves || 0);
    pin.repin_count = Number(pin.repin_count || pin.current_repins || 0);
    pin.comment_count = Number(pin.comment_count || pin.current_comments || 0);
    pin.share_count = Number(pin.share_count || pin.current_shares || 0);
    if (!pin.daily_save_velocity || pin.daily_save_velocity === 0) {
      pin.daily_save_velocity = Number(pin.calculated_velocity || 0);
    }
    pin.current_saves = pin.save_count;
    pin.current_repins = pin.repin_count;
    pin.current_comments = pin.comment_count;
    pin.current_shares = pin.share_count;
    pin.board_name = pin.board_name || pin.metadata?.board_name || null;
    pin.creation_method = pin.creation_method || pin.metadata?.creation_method || pin.metadata?.method || null;
    pin.created_at_pinterest = pin.created_at_pinterest || pin.metadata?.created_at_pinterest || pin.metadata?.created_at || null;

    if (!pin.vacuum_opportunity_score || pin.vacuum_opportunity_score === 0) {
      let rankScore = 10;
      const rank = Number(pin.last_known_rank || 100);
      if (rank <= 5) rankScore = 50;
      else if (rank <= 15) rankScore = 40;
      else if (rank <= 50) rankScore = 25;

      let velScore = 0;
      const vel = Number(pin.daily_save_velocity || 0);
      if (vel === 0) velScore = 35;
      else if (vel <= 5) velScore = 20;

      let ageScore = 0;
      if (pin.created_at_pinterest) {
        const ageDays = (Date.now() - new Date(pin.created_at_pinterest).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 365) ageScore = 15;
      }

      pin.vacuum_opportunity_score = Math.min(100, rankScore + velScore + ageScore);
    }
  }

  const displacedResult = {
    success: true,
    keyword_id: kid,
    total: cntRow?.total || rows.length,
    pins: rows,
    displaced_pins: rows
  };

  // [INVARIANT: ZERO-SKELETON-KV-POISONING] Only cache in KV when 100% of rows are hydrated
  if (env?.PIN_ENGINE_KV && rows.length > 0 && rows.every(r => Boolean(r.title || r.image_url))) {
    try {
      await env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(displacedResult), { expirationTtl: 1800 });
    } catch (_) {}
  }

  return displacedResult;
}

/**
 * Retrieve chronological Performance Trajectory time series
 * Cleanly delegates exclusively to fetchPinTrajectoryFromShard from fleet-router.mjs.
 * Supports range filtering: '7d', '14d', '30d', 'all'
 */
// [INVARIANT: SSOT-TRAJECTORY-FROM-SHARD]
export async function getPinPerformanceTrajectory(sqlOrParams, keywordId, pinId, range = 'all', options = {}) {
  let hubSql = null;
  let shardSql = null;
  let cleanPin = null;
  let cleanRange = range;
  let env = null;
  let forceRefresh = false;

  if (sqlOrParams && typeof sqlOrParams === 'object' && !sqlOrParams.apply && ('pinId' in sqlOrParams || 'shardSql' in sqlOrParams || 'hubSql' in sqlOrParams)) {
    hubSql = sqlOrParams.hubSql || null;
    shardSql = sqlOrParams.shardSql || null;
    cleanPin = String(sqlOrParams.pinId || '').trim();
    cleanRange = sqlOrParams.timeframe || sqlOrParams.range || 'all';
    env = sqlOrParams.env || null;
    forceRefresh = sqlOrParams.forceRefresh || false;
  } else {
    hubSql = sqlOrParams;
    cleanPin = String(pinId || '').trim();
    cleanRange = range || 'all';
    if (typeof options === 'object') {
      env = options?.env || null;
      forceRefresh = options?.forceRefresh || false;
    }
  }

  if (!cleanPin) throw new Error('pin_id is required');

  const trajKvKey = `traj:pin:${cleanPin}:${cleanRange}`;
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      // [INVARIANT: NO-MUTABLE-KV-CACHE-TTL] Eliminate cacheTtl on mutable keys to prevent stale edge PoP reads
      const kvCached = await env.PIN_ENGINE_KV.get(trajKvKey, { type: 'json' });
      if (kvCached && Array.isArray(kvCached.snapshots)) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  const rawTraj = await fetchPinTrajectoryFromShard({
    hubSql,
    shardSql,
    pinId: cleanPin,
    timeframe: cleanRange,
    env
  });

  let snapshots = Array.isArray(rawTraj?.snapshots) ? rawTraj.snapshots : (Array.isArray(rawTraj?.trajectory) ? rawTraj.trajectory : []);

  let intervalDays = null;
  if (cleanRange === '7d') intervalDays = 7;
  else if (cleanRange === '14d') intervalDays = 14;
  else if (cleanRange === '30d') intervalDays = 30;

  if (intervalDays) {
    const cutoffDate = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    snapshots = snapshots.filter(s => String(s.snapshot_date || '').slice(0, 10) >= cutoffDate);
  }

  // Calculate Net Growth summary (first snapshot vs latest snapshot)
  let netGrowth = {
    saves: 0,
    repins: 0,
    comments: 0,
    shares: 0,
    reactions: 0
  };

  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    netGrowth = {
      saves: Number(last.save_count || 0) - Number(first.save_count || 0),
      repins: Number(last.repin_count || 0) - Number(first.repin_count || 0),
      comments: Number(last.comment_count || 0) - Number(first.comment_count || 0),
      shares: Number(last.share_count || 0) - Number(first.share_count || 0),
      reactions: Number(last.reaction_count || 0) - Number(first.reaction_count || 0)
    };
  }

  const trajResult = {
    success: true,
    pin_id: cleanPin,
    keyword_id: (typeof keywordId === 'number' || typeof keywordId === 'string') ? Number(keywordId) || null : null,
    range: cleanRange,
    total_snapshots: snapshots.length,
    net_growth: netGrowth,
    snapshots,
    trajectory: snapshots
  };

  if (env?.PIN_ENGINE_KV && snapshots.length > 0) {
    try {
      await env.PIN_ENGINE_KV.put(trajKvKey, JSON.stringify(trajResult), { expirationTtl: 21600 });
    } catch (_) {}
  }

  return trajResult;
}

/**
 * Retrieve comprehensive Pin Deep Dossier matching Image 2:
 * Pulls cached Pinterest SEO Alt Text, 9 linked Annotations, 6 KPIs, and Trajectory.
 * Automatically enriches missing Alt Text via on-demand fetchPinFromPinterest.
 */
export async function getPinDeepDossier(sql, pinId, keywordId = null, options = {}) {
  const { forceRefresh = false, env = null, ctx = null } = options;
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('pin_id is required');
  const kid = keywordId ? Number(keywordId) : null;

  const dossierKvKey = `dossier:v3:pin:${cleanPin}:${kid || 0}`;
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      // [INVARIANT: NO-MUTABLE-KV-CACHE-TTL] Eliminate cacheTtl on mutable keys to prevent stale edge PoP reads
      let kvCached = await env.PIN_ENGINE_KV.get(dossierKvKey, { type: 'json' });
      if (!kvCached) {
        kvCached = await env.PIN_ENGINE_KV.get(`dossier:pin:${cleanPin}:${kid || 0}`, { type: 'json' });
      }
      if (kvCached && kvCached.success && kvCached.pin_id === cleanPin) {
        sanitizeDossierTrajectory(kvCached);
        // Re-hydrate dual trajectory contract after JSON deserialization from KV
        if (Array.isArray(kvCached.trajectory) && !kvCached.trajectory.snapshots) {
          kvCached.trajectory.snapshots = kvCached.trajectory;
        }
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  // [INVARIANT: READ-ONLY-GET-SAFE] Live scraping and 4-pillar sync are restricted to explicit POST endpoints (POST /api/pins/:id/sync)
  // GET requests with ?refresh=true strictly bypass the edge cache without initiating external Pinterest scraping storms
  if (forceRefresh && !options?.isReadOnly && options?.allowScrape === true) {
    try {
      const liveRes = await fetchPinFromPinterest(cleanPin);
      if (liveRes?.ok && liveRes.pin) {
        await syncPinAcrossAllFourPillars({
          hubSql: sql,
          pinId: cleanPin,
          scrapedPin: liveRes.pin,
          keywordId: kid,
          env,
          ctx
        });
      }
    } catch (err) {
      console.warn(`[getPinDeepDossier] Live scrape warning for ${cleanPin}:`, err?.message);
    }
  }

  // Canonical SSOT Dossier Retrieval
  const universal = await fetchUniversalPinDossier({
    hubSql: sql,
    pinId: cleanPin,
    keywordId: kid,
    ctx,
    env,
    bypassEdgeCache: Boolean(forceRefresh)
  });

  // GUARDRAIL 5: Schema Projection Adapter
  const creative = universal?.creative || {};
  const creatorContext = universal?.pillar_1_creator_context || {};
  const algoIntel = universal?.algorithmic_intelligence || {};
  const competitorProfile = creatorContext?.competitor_profile || {};
  const meta = creative.metadata || {};
  const pinner = meta.pinner || {};

  const traj = Array.isArray(universal?.daily_trajectory) ? universal.daily_trajectory : [];
  const rawSnaps = Array.isArray(universal?.snapshots) && universal.snapshots.length > 0
    ? universal.snapshots
    : traj;

  // GUARDRAIL 5: Dual Array/Object Trajectory Contract
  const trajectory = [...rawSnaps];
  trajectory.snapshots = rawSnaps;

  const latest = rawSnaps[0] || traj[0] || {};
  const prev = rawSnaps[1] || traj[1] || latest;

  const jump24h = isMultiStageHydrationJump(prev, latest);
  const rawSavesDiff = Number(latest.save_count ?? creative.save_count ?? 0) - Number(prev.save_count ?? latest.save_count ?? 0);
  const saves24h = jump24h ? 0 : Math.max(0, rawSavesDiff);
  const repins24h = Math.max(0, Number(latest.repin_count ?? creative.repin_count ?? 0) - Number(prev.repin_count ?? latest.repin_count ?? 0));
  const shares24h = Math.max(0, Number(latest.share_count ?? creative.share_count ?? 0) - Number(prev.share_count ?? latest.share_count ?? 0));
  const reactions24h = Math.max(0, Number(latest.reaction_count ?? 0) - Number(prev.reaction_count ?? 0));

  const annotations = Array.isArray(creative.visual_annotations)
    ? creative.visual_annotations.map(a => typeof a === 'string' ? a : (a?.name || a?.label || a?.display_label || a?.term || a?.title || '')).filter(Boolean)
    : [];

  const creatorUsername = creatorContext.creator_username || meta.creator_username || pinner.username || '';
  const creatorName = competitorProfile.full_name || competitorProfile.name || pinner.full_name || '';
  const creatorFollowers = Number(competitorProfile.follower_count || competitorProfile.followers || pinner.follower_count || 0);
  const creatorAvatar = competitorProfile.avatar_url || competitorProfile.image_url || pinner.image_url || pinner.image_small_url || null;
  const creatorIsMerchant = Boolean(competitorProfile.is_verified_merchant || pinner.is_verified_merchant);
  const boardName = creatorContext.board_name || meta.board_name || '';
  const boardUrl = creatorContext.board_url || (creatorUsername && boardName ? `https://www.pinterest.com/${creatorUsername}/${boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}/` : null);

  const title = creative.title || meta.seo_title || `Pin ${cleanPin}`;
  const creationMethod = creative.creation_method || meta.creation_method || meta.method || 'pinterest_platform';

  const projectedDossier = {
    ...universal,
    success: true,
    pin_id: cleanPin,
    keyword_id: kid,
    title,
    description: creative.description || meta.description || '',
    domain: creative.domain || '',
    destination_url: creative.destination_url || '',
    image_url: creative.image_url || '',
    board_name: boardName,
    board_url: boardUrl,
    board_pin_count: Number(competitorProfile.board_pin_count || meta.board_pin_count || 0),
    creator_username: creatorUsername,
    creator_name: creatorName,
    creator_avatar_url: creatorAvatar,
    creator_followers: creatorFollowers,
    creator_is_verified_merchant: creatorIsMerchant,
    creator_url: creatorContext.creator_url || (creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : ''),
    seo_alt_text: creative.alt_text || meta.alt_text || '',
    dominant_color: creative.dominant_color || '#888888',
    created_at_pinterest: creative.created_at_pinterest || meta.created_at_pinterest || null,
    first_pulled_at: creative.first_discovered_at || new Date().toISOString(),
    last_archived_at: creative.updated_at || new Date().toISOString(),
    image_signature: creative.image_signature || meta.image_signature || null,
    canonical_id: creative.canonical_pin_id || cleanPin,
    creation_method: creationMethod,
    is_repin: Boolean(creative.is_repin || meta.is_repin),
    origin_pinner: creative.origin_pinner || meta.origin_pinner || null,
    is_indexed_google: algoIntel.is_indexed_google ?? !(meta.seo_noindex_reason),
    is_go_linkless: Boolean(algoIntel.is_go_linkless || meta.is_go_linkless),
    category_breadcrumbs: algoIntel.category_breadcrumbs || meta.category_breadcrumbs || [],
    image_dimensions: algoIntel.image_dimensions || meta.image_dimensions || null,
    annotations,
    kpis: {
      total_saves: Number(creative.save_count || 0),
      repins: Number(creative.repin_count || 0),
      comments: Number(creative.comment_count || 0),
      shares: Number(creative.share_count || 0),
      velocity: Number(creative.daily_save_velocity || 0),
      reactions: Number(latest.reaction_count || 0)
    },
    deltas: {
      saves_24h: saves24h,
      repins_24h: repins24h,
      shares_24h: shares24h,
      reactions_24h: reactions24h
    },
    reactions_breakdown: meta.reactions || {},
    trajectory
  };

  if (env?.PIN_ENGINE_KV && title && title !== 'Untitled Pin') {
    try {
      const payloadStr = JSON.stringify(projectedDossier);
      await Promise.all([
        env.PIN_ENGINE_KV.put(dossierKvKey, payloadStr, { expirationTtl: 21600 }),
        env.PIN_ENGINE_KV.put(`dossier:pin:${cleanPin}:${kid || 0}`, payloadStr, { expirationTtl: 21600 })
      ]);
    } catch (_) {}
  }

  return projectedDossier;
}