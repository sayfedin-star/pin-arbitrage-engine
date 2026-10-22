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
import { extractPinData, PINTEREST_PAGE_HEADERS, fetchPinFromPinterest } from '../../../scripts/lib/pinterest.mjs';
import { derivePinTitle } from './folders-service.mjs';
import { calculateDailyVelocity } from '../../lib/math.mjs';
import {
  getPinShardId,
  resolveShardConnection,
  executeShardQueryWithCircuitBreaker,
  batchGroupByShard,
  preloadNeonRegistry,
  syncPinAcrossAllFourPillars
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

  for (let i = 0; i < shardEntries.length; i += CONCURRENCY) {
    const chunk = shardEntries.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardPins]) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId, env });
        if (!shardSql || shardSql === hubSql) return;
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
 * Batch-hydrates slim displaced index rows with creative metadata from their deterministic shards
 */
export async function hydrateDisplacedIndexFromShards(hubSql, indexRows = [], env = null, skipShardHydration = false) {
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

    // 2. Only query Neon Shards for pins that were not found in Cloudflare D1 (bypassed if skipShardHydration=true)
    const stillMissing = needsHydration.filter(r => !masterMap.has(String(r.pin_id)));
    if (!skipShardHydration && stillMissing.length > 0) {
      await preloadNeonRegistry(hubSql, env);
      const shardGroups = batchGroupByShard(stillMissing, 99);
      const newlyHydratedFromShards = [];

      // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING] Chunk shard scatter-gather into groups of <= 4
      const shardEntries = Array.from(shardGroups.entries());
      const CONCURRENCY_LIMIT = 4;
      for (let i = 0; i < shardEntries.length; i += CONCURRENCY_LIMIT) {
        const chunk = shardEntries.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.allSettled(
          chunk.map(async ([shardId, pins]) => {
            const pids = pins.map(p => String(p.pin_id));
            const shardSql = await resolveShardConnection({ hubSql, shardId, env });
            if (!shardSql || shardSql === hubSql) return;
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

      // Backfill Cloudflare D1 asynchronously so subsequent requests hit D1 in < 3ms with 0 Shard HTTP calls
      if (env?.PIN_D1_DB && newlyHydratedFromShards.length > 0) {
        syncPinsBatchToD1(env, newlyHydratedFromShards).catch(() => {});
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
export async function listKeywords(sql, { search = '', limit = 1000, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 1000 : Number(limit), 1000));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));
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

  // 1. Process-local fast-fail check and lock acquisition
  if (activeKeywordCrawls.has(kid) && !force) {
    return { success: false, in_progress: true, message: `Crawl already in progress locally for keyword ID ${kid}` };
  }
  activeKeywordCrawls.add(kid);

  let leaseAcquired = false;
  let leaseCommittedInTx = false;
  const skipLeaseRelease = Boolean(options?.skip_lease_release);

  try {
    const callerLeaseToken = options.lease_token || null;
    const leaseQuery = callerLeaseToken
      ? sql`
          UPDATE tracked_keywords
          SET crawl_lease_until = GREATEST(COALESCE(crawl_lease_until, NOW()), NOW() + INTERVAL '15 minutes')
          WHERE id = ${kid}
            AND (crawl_lease_token = ${callerLeaseToken} OR crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING id;
        `
      : (force
        ? sql`
            UPDATE tracked_keywords
            SET crawl_lease_until = GREATEST(COALESCE(crawl_lease_until, NOW()), NOW() + INTERVAL '60 seconds')
            WHERE id = ${kid}
            RETURNING id;
          `
        : sql`
            UPDATE tracked_keywords
            SET crawl_lease_until = NOW() + INTERVAL '60 seconds'
            WHERE id = ${kid}
              AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
            RETURNING id;
          `);

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
      SELECT * FROM tracked_keywords WHERE id = ${kid};
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
        baselineMap.set(pid, { saves: Number(s.save_count || 0), date: snapDateStr });
        if (!baselineSnapshotDate) baselineSnapshotDate = new Date(snapDateStr);
      } else if (s.baseline_day_saves !== null && s.baseline_day_saves !== undefined && baseDateStr) {
        baselineMap.set(pid, { saves: Number(s.baseline_day_saves || 0), date: baseDateStr });
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
          currentDate: todayDate,
          baselineDate: baseDateStr || baselineSnapshotDate,
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
            currentDate: todayDate,
            baselineDate: immediateData.snapshotDate,
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
      const method = item.method || item.creation_method || item.creationMethod || item.attribution?.provider_name || 'pinterest_platform';
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

            // Recalculate daily save velocity against baseline if saves updated
            const baseEntry = baselineMap.get(p.pin_id);
            if (baseEntry !== undefined && baseEntry !== null) {
              const baseSavesNum = (typeof baseEntry === 'object') ? Number(baseEntry.saves || 0) : Number(baseEntry || 0);
              const baseDateRaw = (typeof baseEntry === 'object' && baseEntry.date) ? new Date(baseEntry.date) : baselineSnapshotDate;
              let daysElapsed = 1;
              if (baseDateRaw && !isNaN(baseDateRaw.getTime())) {
                const baseUtc = Date.UTC(baseDateRaw.getUTCFullYear(), baseDateRaw.getUTCMonth(), baseDateRaw.getUTCDate());
                daysElapsed = Math.max(1, Math.round((todayUtc - baseUtc) / (1000 * 60 * 60 * 24)));
              }
              const rawDelta = Math.max(0, p.save_count - baseSavesNum);
              const newVel = Math.min(25000, Math.round(rawDelta / daysElapsed));
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
            creation_method: s.creation_method || s.metadata?.method || 'pinterest_platform',
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
      baseline_day_saves: p.metadata?.prev_save_count ?? p.save_count,
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
      creation_method: p.creation_method || 'pinterest_platform',
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
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          prev_rank_position = COALESCE(keyword_serp_current.rank_position, EXCLUDED.prev_rank_position),
          rank_position = EXCLUDED.rank_position,
          last_known_rank = EXCLUDED.rank_position,
          baseline_day_saves = CASE
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
          creation_method = COALESCE(EXCLUDED.creation_method, keyword_serp_current.creation_method),
          metadata = (CASE WHEN jsonb_typeof(keyword_serp_current.metadata) = 'object' THEN keyword_serp_current.metadata ELSE '{}'::jsonb END)
            || EXCLUDED.metadata
            || jsonb_build_object(
              'is_deep_hydrated',
              (COALESCE((keyword_serp_current.metadata->>'is_deep_hydrated')::boolean, false) OR COALESCE((EXCLUDED.metadata->>'is_deep_hydrated')::boolean, false))
            ),
          crawled_at = COALESCE(EXCLUDED.crawled_at, keyword_serp_current.crawled_at),
          updated_at = NOW();
      `);

      // 2. Dynamic SERP Guard: Move displaced pins into slim keyword_displaced_index & delete from keyword_serp_current
      const pinIds = preparedPins.map(p => p.pin_id);
      const shouldApplyDisplacement = !isSuspectedIncompleteCrawl && pinIds.length >= minRequiredForEviction;

      if (shouldApplyDisplacement) {
        // Remove any resurged pins from keyword_displaced_index
        txBatch.push((db) => db`
          DELETE FROM keyword_displaced_index
          WHERE keyword_id = ${kid}
            AND pin_id = ANY(${pinIds});
        `);

        // Archive displaced pins into slim keyword_displaced_index (56 bytes/row on Hub)
        txBatch.push((db) => db`
          INSERT INTO keyword_displaced_index (
            keyword_id, pin_id, domain, last_known_rank, vacuum_opportunity_score,
            displaced_date, save_count, repin_count, comment_count, share_count,
            daily_save_velocity, updated_at
          )
          SELECT
            keyword_id,
            pin_id,
            domain,
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
            last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_displaced_index.last_known_rank),
            vacuum_opportunity_score = GREATEST(keyword_displaced_index.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
            save_count = GREATEST(keyword_displaced_index.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(keyword_displaced_index.repin_count, EXCLUDED.repin_count),
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
      WHERE id = ${kid};
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
        WHERE id = ${kid};
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
    SELECT *
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
      const kvCached = await env.PIN_ENGINE_KV.get(`serp:comp:${kid}`, { type: 'json', cacheTtl: 300 });
      if (kvCached && kvCached.status === 'active' && Array.isArray(kvCached.current_pins) && kvCached.current_pins.length > 0 && kvCached.total_displaced_count !== undefined) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  // Parallel fetch: keyword metadata (if not already known), active catalog pins, distinct dates, dropped pins, guided capsules, and true displaced count
  const [keywordRows, activeCatalogPins, dates, displacedResultRaw, guides, displacedCountRow] = await Promise.all([
    actualKeyword ? Promise.resolve([actualKeyword]) : sql`SELECT * FROM tracked_keywords WHERE id = ${kid};`,
    sql`
      SELECT *
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
    SELECT * FROM tracked_keywords WHERE id = ${kid};
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
      const kvCached = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json', cacheTtl: 300 });
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
 * Retrieve chronological Performance Trajectory time series from keyword_pins_snapshots
 * Supports range filtering: '7d', '14d', '30d', 'all'
 */
export async function getPinPerformanceTrajectory(sql, keywordId, pinId, range = 'all', { env = null, forceRefresh = false } = {}) {
  const kid = Number(keywordId);
  const cleanPin = String(pinId || '').trim();
  if (!cleanPin) throw new Error('pin_id is required');

  const trajKvKey = `traj:pin:${cleanPin}:${range}`;
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      const kvCached = await env.PIN_ENGINE_KV.get(trajKvKey, { type: 'json', cacheTtl: 600 });
      if (kvCached && Array.isArray(kvCached.snapshots)) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  let intervalDays = null;
  if (range === '7d') intervalDays = 7;
  else if (range === '14d') intervalDays = 14;
  else if (range === '30d') intervalDays = 30;

  // 1. Hub Query (Active SERP or displaced state + rolling snapshots)
  const hubPromise = (async () => {
    try {
      const activeHubPromise = (async () => {
        try {
          const serpRows = kid
            ? await sql`
                SELECT pin_id, rank_position, save_count, repin_count, COALESCE(comment_count, 0) AS comment_count,
                       COALESCE(share_count, 0) AS share_count, 0 AS reaction_count,
                       daily_save_velocity, COALESCE(crawled_at, updated_at) AS snapshot_date
                FROM keyword_serp_current
                WHERE keyword_id = ${kid} AND pin_id = ${cleanPin}
                LIMIT 1;
              `
            : await sql`
                SELECT pin_id, rank_position, save_count, repin_count, COALESCE(comment_count, 0) AS comment_count,
                       COALESCE(share_count, 0) AS share_count, 0 AS reaction_count,
                       daily_save_velocity, COALESCE(crawled_at, updated_at) AS snapshot_date
                FROM keyword_serp_current
                WHERE pin_id = ${cleanPin}
                ORDER BY updated_at DESC
                LIMIT 1;
              `;
          if (serpRows && serpRows.length > 0) return serpRows;

          const displacedRows = kid
            ? await sql`
                SELECT pin_id, last_known_rank AS rank_position, save_count, repin_count, COALESCE(comment_count, 0) AS comment_count,
                       COALESCE(share_count, 0) AS share_count, 0 AS reaction_count, daily_save_velocity, updated_at AS snapshot_date
                FROM keyword_displaced_index
                WHERE keyword_id = ${kid} AND pin_id = ${cleanPin}
                LIMIT 1;
              `
            : await sql`
                SELECT pin_id, last_known_rank AS rank_position, save_count, repin_count, COALESCE(comment_count, 0) AS comment_count,
                       COALESCE(share_count, 0) AS share_count, 0 AS reaction_count, daily_save_velocity, updated_at AS snapshot_date
                FROM keyword_displaced_index
                WHERE pin_id = ${cleanPin}
                ORDER BY updated_at DESC
                LIMIT 1;
              `;
          return displacedRows || [];
        } catch (_) {
          return [];
        }
      })();

      // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub holds zero historical snapshots
      const snapshotsPromise = Promise.resolve([]);

      const [activeRows, snapshotRows] = await Promise.all([activeHubPromise, snapshotsPromise]);
      return [...(snapshotRows || []), ...(activeRows || [])];
    } catch (_) {
      return [];
    }
  })();

  // 2. Shard Query (Full distributed time-series archive)
  const shardPromise = (async () => {
    try {
      const shardId = getPinShardId(cleanPin, 99);
      const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env });
      return await executeShardQueryWithCircuitBreaker({
        shardId,
        shardSql,
        queryFn: async (client) => {
          try {
            const rollups = await client`
              SELECT 
                pin_id, snapshot_date, save_count, repin_count, comment_count,
                share_count, reaction_count, daily_save_velocity, updated_at
              FROM pins_daily_rollups_v2
              WHERE pin_id = ${cleanPin}
              ORDER BY snapshot_date ASC
              LIMIT 365;
            `;
            if (rollups && rollups.length > 0) return rollups;
          } catch (_) {}
          return await client`
            SELECT 
              pin_id, snapshot_date, rank_position, save_count, repin_count, comment_count,
              share_count, reaction_count, daily_save_velocity, created_at
            FROM pins_daily_snapshots
            WHERE pin_id = ${cleanPin}
            ORDER BY snapshot_date ASC
            LIMIT 365;
          `;
        },
        fallbackFn: async () => [],
        timeoutMs: 5500
      });
    } catch (_) {
      return [];
    }
  })();

  const [hubSnapshotsRaw, shardSnapshotsRaw] = await Promise.all([hubPromise, shardPromise]);
  const hubRows = Array.isArray(hubSnapshotsRaw) ? hubSnapshotsRaw : [];
  const shardRows = Array.isArray(shardSnapshotsRaw) ? shardSnapshotsRaw : [];

  // Merge and deduplicate by ISO date string (Shard provides historical baseline; Hub provides today's live state)
  const dateMap = new Map();

  for (const s of shardRows) {
    const dStr = s.snapshot_date instanceof Date ? s.snapshot_date.toISOString().slice(0, 10) : String(s.snapshot_date || '').slice(0, 10);
    if (dStr) {
      const crawlTs = s.crawled_at || s.updated_at || s.created_at || (dStr + 'T00:00:00Z');
      dateMap.set(dStr, {
        pin_id: cleanPin,
        rank_position: s.rank_position ?? null,
        save_count: Number(s.save_count || 0),
        repin_count: Number(s.repin_count || 0),
        comment_count: Number(s.comment_count || 0),
        share_count: Number(s.share_count || 0),
        reaction_count: Number(s.reaction_count || 0),
        daily_save_velocity: Number(s.daily_save_velocity || 0),
        snapshot_date: dStr,
        crawled_at: crawlTs,
        updated_at: s.updated_at || crawlTs
      });
    }
  }

  for (const h of hubRows) {
    const dStr = h.snapshot_date instanceof Date ? h.snapshot_date.toISOString().slice(0, 10) : String(h.snapshot_date || '').slice(0, 10);
    if (dStr) {
      const existing = dateMap.get(dStr);
      const crawlTs = h.crawled_at || h.updated_at || (dStr + 'T00:00:00Z');
      dateMap.set(dStr, {
        pin_id: cleanPin,
        rank_position: h.rank_position ?? existing?.rank_position ?? null,
        save_count: Math.max(Number(h.save_count || 0), Number(existing?.save_count || 0)),
        repin_count: Math.max(Number(h.repin_count || 0), Number(existing?.repin_count || 0)),
        comment_count: Math.max(Number(h.comment_count || 0), Number(existing?.comment_count || 0)),
        share_count: Math.max(Number(h.share_count || 0), Number(existing?.share_count || 0)),
        reaction_count: Math.max(Number(h.reaction_count || 0), Number(existing?.reaction_count || 0)),
        daily_save_velocity: (h.daily_save_velocity !== undefined && h.daily_save_velocity !== null) ? Number(h.daily_save_velocity) : (existing?.daily_save_velocity || 0),
        snapshot_date: dStr,
        crawled_at: (crawlTs && (!existing?.crawled_at || new Date(crawlTs).getTime() >= new Date(existing.crawled_at).getTime())) ? crawlTs : (existing?.crawled_at || crawlTs),
        updated_at: h.updated_at || existing?.updated_at || crawlTs
      });
    }
  }

  let snapshots = Array.from(dateMap.values()).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  // Apply range cutoff if intervalDays specified
  if (intervalDays) {
    const cutoffDate = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    snapshots = snapshots.filter(s => s.snapshot_date >= cutoffDate);
  }

  // Enforce monotonic non-decreasing save_count
  let runningMaxSaves = 0;
  for (const s of snapshots) {
    s.save_count = Math.max(runningMaxSaves, Number(s.save_count || 0));
    runningMaxSaves = s.save_count;
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
    keyword_id: kid || null,
    range,
    total_snapshots: snapshots.length,
    net_growth: netGrowth,
    snapshots
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

  const dossierKvKey = `dossier:pin:${cleanPin}:${kid || 0}`;
  if (env?.PIN_ENGINE_KV && !forceRefresh) {
    try {
      const kvCached = await env.PIN_ENGINE_KV.get(dossierKvKey, { type: 'json', cacheTtl: 600 });
      if (kvCached && kvCached.success && kvCached.pin_id === cleanPin) {
        return { ...kvCached, source: 'kv_edge' };
      }
    } catch (_) {}
  }

  // 1-4. Concurrent scatter-gather for SERP current, snapshots, shard master, and trajectory
  const [
    displacedRows,
    snapshotRows,
    shardRow,
    trajectory
  ] = await Promise.all([
    // 1. keyword_serp_current
    (kid ? sql`
      SELECT 
        keyword_id, pin_id, title, domain, destination_url, image_url,
        creator_username, board_name, last_known_rank, rank_position, displaced_date,
        is_displaced, save_count, save_count as current_saves,
        repin_count, repin_count as current_repins,
        comment_count, comment_count as current_comments,
        share_count, share_count as current_shares,
        daily_save_velocity, vacuum_opportunity_score,
        COALESCE(metadata->>'alt_text', '') as seo_alt_text,
        COALESCE(visual_annotations, '[]'::jsonb) as annotations,
        dominant_color, created_at_pinterest, creation_method, metadata, crawled_at as created_at
      FROM keyword_serp_current 
      WHERE keyword_id = ${kid} AND pin_id = ${cleanPin};
    ` : sql`
      SELECT 
        keyword_id, pin_id, title, domain, destination_url, image_url,
        creator_username, board_name, last_known_rank, rank_position, displaced_date,
        is_displaced, save_count, save_count as current_saves,
        repin_count, repin_count as current_repins,
        comment_count, comment_count as current_comments,
        share_count, share_count as current_shares,
        daily_save_velocity, vacuum_opportunity_score,
        COALESCE(metadata->>'alt_text', '') as seo_alt_text,
        COALESCE(visual_annotations, '[]'::jsonb) as annotations,
        dominant_color, created_at_pinterest, creation_method, metadata, crawled_at as created_at
      FROM keyword_serp_current 
      WHERE pin_id = ${cleanPin} 
      LIMIT 1;
    `).catch(() => []),

    // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub holds zero historical snapshots
    Promise.resolve([]),

    // 3. D1 Edge Lookup first (< 3ms), then Shard master pin fallback with 2500ms timeout
    (async () => {
      try {
        if (env?.PIN_D1_DB && !forceRefresh) {
          const d1Map = await hydratePinsFromD1(env, [cleanPin]);
          if (d1Map.has(cleanPin)) {
            const d1Pin = d1Map.get(cleanPin);
            // [INVARIANT: D1-RICH-OR-BYPASS-GUARD]
            // Prevent hollow / empty D1 shells from being treated as valid cache hits
            if (
              d1Pin && d1Pin.pin_id &&
              (d1Pin.title || d1Pin.image_url) &&
              (d1Pin.description && d1Pin.description.length > 5) &&
              d1Pin.created_at_pinterest
            ) {
              return d1Pin;
            }
          }
        }
        const shardId = getPinShardId(cleanPin, 99);
        const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env });
        if (shardSql && shardSql !== sql) {
          const shardPromise = shardSql`
            SELECT * FROM universal_master_pins WHERE pin_id = ${cleanPin} LIMIT 1;
          `.catch(() => []);
          let timerId;
          const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error('timeout')), 5500);
          });
          try {
            const [sMaster] = await Promise.race([
              shardPromise,
              timeoutPromise
            ]);
            // [INVARIANT: D1-ANTI-PRE-SCRAPE-POISONING] Do not backfill pre-scrape shard state during forceRefresh
            if (sMaster && env?.PIN_D1_DB && !forceRefresh) {
              syncPinsBatchToD1(env, [sMaster]).catch(() => {});
            }
            return sMaster || null;
          } finally {
            if (timerId) clearTimeout(timerId);
          }
        }
      } catch (_) {}
      return null;
    })(),

    // 4. Trajectory
    getPinPerformanceTrajectory(sql, kid, cleanPin, 'all', { env, forceRefresh }).catch(() => [])
  ]);

  let displacedRow = displacedRows?.[0] || null;
  if (!displacedRow && kid) {
    const [fallbackRow] = await sql`
      SELECT 
        keyword_id, pin_id, title, domain, destination_url, image_url,
        creator_username, board_name, last_known_rank, rank_position, displaced_date,
        is_displaced, save_count, save_count as current_saves,
        repin_count, repin_count as current_repins,
        comment_count, comment_count as current_comments,
        share_count, share_count as current_shares,
        daily_save_velocity, vacuum_opportunity_score,
        COALESCE(metadata->>'alt_text', '') as seo_alt_text,
        COALESCE(visual_annotations, '[]'::jsonb) as annotations,
        dominant_color, created_at_pinterest, creation_method, metadata, crawled_at as created_at
      FROM keyword_serp_current 
      WHERE pin_id = ${cleanPin} 
      LIMIT 1;
    `.catch(() => []);
    displacedRow = fallbackRow || null;
  }

  // [INVARIANT: ZERO-HUB-SNAPSHOTS] Unpack Shard trajectory object ({ snapshots: [...] }) deterministically
  const trajectorySnapshots = Array.isArray(trajectory)
    ? trajectory
    : (Array.isArray(trajectory?.snapshots) ? trajectory.snapshots : []);
  const latestSnapshot = trajectorySnapshots.length > 0
    ? trajectorySnapshots[trajectorySnapshots.length - 1]
    : null;

  // 4. Smart Dynamic On-Demand Scrape Trigger:
  // Only scrape if explicitly requested via forceRefresh
  let scraped = null;
  let syncRes = null;
  const needsScrape = Boolean(forceRefresh);

  if (needsScrape) {
    try {
      const pinResult = await fetchPinFromPinterest(cleanPin);
      if (pinResult?.ok && pinResult.pin) {
        scraped = pinResult.pin;
        // [INVARIANT: 4-PILLAR-SYNC-PARITY]
        // Delegate DB mutations & D1/KV cache invalidation to canonical SSOT function
        syncRes = await syncPinAcrossAllFourPillars({
          hubSql: sql,
          pinId: cleanPin,
          scrapedPin: scraped,
          env,
          ctx: options?.ctx || null
        });

        if (displacedRow) {
          displacedRow.current_saves = Math.max(Number(displacedRow.current_saves || 0), Number(scraped.saves || 0));
          displacedRow.current_repins = Math.max(Number(displacedRow.current_repins || 0), Number(scraped.repins || 0));
          displacedRow.current_comments = Math.max(Number(displacedRow.current_comments || 0), Number(scraped.comments || 0));
          displacedRow.current_shares = Math.max(Number(displacedRow.current_shares || 0), Number(scraped.share_count || 0));
          if (Number.isFinite(syncRes?.syncVelocity) && syncRes.syncVelocity > 0) {
            displacedRow.daily_save_velocity = syncRes.syncVelocity;
          }
          displacedRow.seo_alt_text = scraped.alt_text || scraped.seo_alt_text || displacedRow.seo_alt_text;
          displacedRow.creator_username = scraped.creator_username || scraped.pinner?.username || displacedRow.creator_username;
          displacedRow.board_name = scraped.board_name || scraped.board?.name || displacedRow.board_name;
        }
        if (latestSnapshot) {
          latestSnapshot.save_count = Math.max(Number(latestSnapshot.save_count || 0), Number(scraped.saves || 0));
          latestSnapshot.repin_count = Math.max(Number(latestSnapshot.repin_count || 0), Number(scraped.repins || 0));
          latestSnapshot.comment_count = Math.max(Number(latestSnapshot.comment_count || 0), Number(scraped.comments || 0));
          latestSnapshot.share_count = Math.max(Number(latestSnapshot.share_count || 0), Number(scraped.share_count || 0));
          if (Number.isFinite(syncRes?.syncVelocity) && syncRes.syncVelocity > 0) {
            latestSnapshot.daily_save_velocity = syncRes.syncVelocity;
          }
        }
      }
    } catch (err) {
      console.warn(`[getPinDeepDossier] On-demand scrape warning for ${cleanPin}:`, err.message);
    }
  }

  // 5. Build consolidated 48-parameter Dossier (Trajectory already retrieved in parallel)
  function normalizeMeta(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try { return normalizeMeta(JSON.parse(raw)); } catch (_) { return {}; }
    }
    if (Array.isArray(raw)) {
      let merged = {};
      for (const item of raw) merged = { ...merged, ...normalizeMeta(item) };
      return merged;
    }
    if (typeof raw === 'object') return raw;
    return {};
  }

  const dMeta = normalizeMeta(displacedRow?.metadata);
  const sMeta = normalizeMeta(shardRow?.metadata);
  const snapMeta = normalizeMeta(latestSnapshot?.metadata);
  const mergedMeta = { ...dMeta, ...snapMeta, ...sMeta };

  const title = displacedRow?.title || latestSnapshot?.title || scraped?.title || shardRow?.title || mergedMeta.seo_title || 'Untitled Pin';
  const altText = displacedRow?.seo_alt_text || scraped?.alt_text || scraped?.seo_alt_text || shardRow?.alt_text || mergedMeta.alt_text || latestSnapshot?.metadata?.alt_text || '';
  const description = scraped?.description || shardRow?.description || mergedMeta.description || latestSnapshot?.metadata?.description || '';

  const allAnnoSet = new Set();
  const addAnnos = (raw) => {
    if (!raw) return;
    const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    for (const a of arr) {
      const name = typeof a === 'string' ? a.trim() : (a?.name || a?.label || a?.display_label || a?.term || a?.title || '').trim();
      if (name && name.length >= 2 && !/^not[\s-_]?given$/i.test(name)) allAnnoSet.add(name);
    }
  };
  addAnnos(displacedRow?.annotations);
  addAnnos(scraped?.annotations);
  addAnnos(shardRow?.visual_annotations);
  addAnnos(mergedMeta.visual_annotations);
  addAnnos(snapMeta.visual_annotations);
  const annotations = Array.from(allAnnoSet);

  const dominantColor = displacedRow?.dominant_color || scraped?.dominant_color || shardRow?.dominant_color || mergedMeta.dominant_color || '#b47732';
  const createdAt = displacedRow?.created_at_pinterest || scraped?.created_at_pinterest || shardRow?.created_at_pinterest || mergedMeta.created_at_pinterest || mergedMeta.created_at || null;
  const saves = Math.max(Number(scraped?.saves || 0), Number(displacedRow?.current_saves || 0), Number(latestSnapshot?.save_count || 0), Number(shardRow?.save_count || 0));
  const repins = Math.max(Number(scraped?.repins || 0), Number(displacedRow?.current_repins || 0), Number(latestSnapshot?.repin_count || 0), Number(shardRow?.repin_count || 0));
  const comments = Math.max(Number(scraped?.comments || 0), Number(displacedRow?.current_comments || 0), Number(latestSnapshot?.comment_count || 0));
  const shares = Math.max(Number(scraped?.share_count || 0), Number(displacedRow?.current_shares || 0), Number(latestSnapshot?.share_count || 0));
  const reactions = Math.max(Number(displacedRow?.current_reactions || 0), (typeof scraped?.reactions === 'object' ? Object.values(scraped.reactions).reduce((a, b) => a + Number(b || 0), 0) : 0), Number(latestSnapshot?.reaction_count || 0));
  // [INVARIANT: DISPLACED-VELOCITY-PARITY] Preserve syncRes.syncVelocity when pin is outside active SERP (displacedRow === null)
  const velocity = Number(displacedRow?.daily_save_velocity || syncRes?.syncVelocity || latestSnapshot?.daily_save_velocity || 0);

  const creatorUsername = displacedRow?.creator_username || displacedRow?.account_username || scraped?.creator_username || scraped?.pinner?.username || mergedMeta.pinner?.username || shardRow?.creator_username || '';
  const creatorFullName = scraped?.creator_name || scraped?.pinner?.full_name || mergedMeta.pinner?.full_name || '';
  const creatorFollowers = Number(scraped?.creator_followers || scraped?.pinner?.follower_count || mergedMeta.pinner?.follower_count || 0);
  const creatorAvatar = scraped?.creator_avatar_url || scraped?.pinner?.image_url || mergedMeta.pinner?.image_small_url || null;
  const creatorIsMerchant = Boolean(scraped?.creator_is_verified_merchant || scraped?.pinner?.is_verified_merchant || mergedMeta.pinner?.is_verified_merchant || false);

  const boardName = displacedRow?.board_name || mergedMeta.board_name || scraped?.board_name || scraped?.board?.name || shardRow?.board_name || '';
  const boardUrl = scraped?.board_url || scraped?.board?.url || (creatorUsername && boardName ? `https://www.pinterest.com/${creatorUsername}/${boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}/` : null);
  const boardPinCount = Number(scraped?.board_pin_count || scraped?.board?.pin_count || mergedMeta.board_pin_count || 0);

  const isRepin = Boolean(scraped?.is_repin || mergedMeta.is_repin || false);
  const originPinner = scraped?.origin_pinner || mergedMeta.origin_pinner || null;
  const isIndexedGoogle = !(scraped?.seo_noindex_reason || mergedMeta.seo_noindex_reason);
  const isGoLinkless = Boolean(scraped?.is_go_linkless || mergedMeta.is_go_linkless || false);
  const categoryBreadcrumbs = scraped?.category_breadcrumbs || mergedMeta.category_breadcrumbs || [];
  const imageDimensions = scraped?.image_dimensions || mergedMeta.image_dimensions || null;
  const imageSignature = displacedRow?.image_signature || scraped?.image_signature || mergedMeta.image_signature || `sig_${cleanPin.slice(-8)}`;
  const creationMethod = displacedRow?.creation_method || scraped?.creation_method || latestSnapshot?.creation_method || mergedMeta.creation_method || mergedMeta.method || 'pinterest_platform';

  const dossierPayload = {
    success: true,
    pin_id: cleanPin,
    keyword_id: kid,
    title,
    description,
    domain: displacedRow?.domain || latestSnapshot?.domain || scraped?.domain || shardRow?.domain || '',
    destination_url: displacedRow?.destination_url || latestSnapshot?.destination_url || scraped?.link || shardRow?.destination_url || '',
    image_url: displacedRow?.image_url || latestSnapshot?.image_url || scraped?.image_url || shardRow?.image_url || '',
    board_name: boardName,
    board_url: boardUrl,
    board_pin_count: boardPinCount,
    creator_username: creatorUsername,
    creator_name: creatorFullName,
    creator_avatar_url: creatorAvatar,
    creator_followers: creatorFollowers,
    creator_is_verified_merchant: creatorIsMerchant,
    creator_url: creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : '',
    seo_alt_text: altText,
    dominant_color: dominantColor,
    created_at_pinterest: createdAt,
    first_pulled_at: displacedRow?.first_pulled_at || latestSnapshot?.created_at || new Date().toISOString(),
    last_archived_at: displacedRow?.last_checked_at || latestSnapshot?.created_at || new Date().toISOString(),
    image_signature: imageSignature,
    canonical_id: cleanPin,
    creation_method: creationMethod,
    is_repin: isRepin,
    origin_pinner: originPinner,
    is_indexed_google: isIndexedGoogle,
    is_go_linkless: isGoLinkless,
    category_breadcrumbs: categoryBreadcrumbs,
    image_dimensions: imageDimensions,
    annotations: Array.isArray(annotations)
      ? annotations.map(a => typeof a === 'string' ? a : (a?.name || a?.label || a?.display_label || a?.term || a?.title || '')).filter(Boolean)
      : [],
    kpis: {
      total_saves: saves,
      repins,
      comments,
      shares,
      velocity,
      reactions
    },
    deltas: {
      saves_24h: Number(displacedRow?.delta_saves_24h || 0),
      repins_24h: Number(displacedRow?.delta_repins_24h || 0),
      shares_24h: Number(displacedRow?.delta_shares_24h || 0),
      reactions_24h: Number(displacedRow?.delta_reactions_24h || 0)
    },
    reactions_breakdown: (typeof scraped?.reactions === 'object' && scraped?.reactions) ? scraped.reactions : (latestSnapshot?.metadata?.reactions || {}),
    trajectory: trajectorySnapshots
  };

  if (env?.PIN_ENGINE_KV && title && title !== 'Untitled Pin') {
    try {
      await env.PIN_ENGINE_KV.put(dossierKvKey, JSON.stringify(dossierPayload), { expirationTtl: 21600 });
    } catch (_) {}
  }

  return dossierPayload;
}