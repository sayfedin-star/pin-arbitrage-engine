/**
 * Keyword SERP Read, Comparison, Visual Similarity Lens & Pin Deep Dossier Service
 * Extracted from src/modules/keywords/service.mjs
 */

import { escapeSqlWildcards } from '../../utils.mjs';
import { getCachedVisualSearchMatches, setCachedVisualSearchMatches } from './visual-lens-cache.mjs';
import {
  extractPinData,
  getPinterestHeaders,
  PINTEREST_PAGE_HEADERS,
  fetchPinFromPinterest,
  pinterestFetch
} from '../../core/pinterest/index.mjs';
import { derivePinTitle } from './folders-service.mjs';
import { isMultiStageHydrationJump } from '../../lib/math.mjs';
import {
  syncPinAcrossAllFourPillars,
  fetchUniversalPinDossier,
  fetchPinTrajectory
} from '../pins/repository.mjs';
import {
  extractPinTitle,
  calculateKeywordIntelligenceSummary
} from './analytics.mjs';
import { getKeywordDisplacedPins } from './service.mjs';

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
    const pattern = `%${escapeSqlWildcards(search.toLowerCase().trim())}%`;
    return await sql`
      WITH paged_keywords AS (
        SELECT 
          id, keyword, category, target_pin_count, refresh_interval_hours,
          last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
          avg_daily_velocity, is_active, tags,
          (COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins') AS metadata,
          created_at, updated_at, crawl_pages_limit, inspection_mode, canonical_keyword
        FROM tracked_keywords
        WHERE LOWER(keyword) LIKE ${pattern} ESCAPE '\\'
          AND (${fId}::int IS NULL OR id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fId}))
        ORDER BY created_at DESC
        LIMIT ${lim} OFFSET ${off}
      ),
      pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_serp_positions
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = FALSE
          AND rank_position IS NOT NULL
        GROUP BY keyword_id
      ),
      displaced_pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_serp_positions
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = TRUE
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
        FROM keyword_serp_positions
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = FALSE
          AND rank_position IS NOT NULL
        GROUP BY keyword_id
      ),
      displaced_pin_counts AS (
        SELECT keyword_id, COUNT(*)::int AS cnt
        FROM keyword_serp_positions
        WHERE keyword_id IN (SELECT id FROM paged_keywords)
          AND is_displaced = TRUE
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

  // 1.1 Persistent L2 Unified PostgreSQL Cache (7-day TTL)
  const dbCached = await getCachedVisualSearchMatches(sql, cleanPin, env);
  if (dbCached) {
    let seedPin = null;
    try {
      const [row] = await sql`
        SELECT pin_id, title, image_url, clean_domain AS domain, save_count
        FROM universal_master_pins
        WHERE pin_id = ${cleanPin}
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
    // Look up pin details from canonical pin catalog to construct visual seed query
    let pinRow = null;
    try {
      const [row] = await sql`
        SELECT pin_id, title, image_url, clean_domain AS domain, save_count
        FROM universal_master_pins
        WHERE pin_id = ${cleanPin}
        LIMIT 1;
      `;
      pinRow = row;
    } catch (err) {
      console.warn(`[fetchVisualSearchLens] Master pins lookup warning for pin ${cleanPin}:`, err.message);
    }

    // Fallback if pin not yet crawled in snapshots: fetch public pin HTML
    if (!pinRow?.title) {
      let pinRes;
      try {
        const pinPageUrl = `https://www.pinterest.com/pin/${cleanPin}/`;
        pinRes = await pinterestFetch(pinPageUrl, { headers: PINTEREST_PAGE_HEADERS, signal: AbortSignal.timeout(6000) });
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
        vRes = await pinterestFetch(visualUrl, { headers: vHeaders, signal: AbortSignal.timeout(8000) });
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
        res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000) });
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
          Number(item.save_count || 0)
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

      // Persist to L2 Unified PostgreSQL Cache (7-day TTL)
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
 * Retrieve pins for a specific keyword ordered by rank
 * Reads directly from active catalog (keyword_serp_positions JOIN universal_master_pins).
 */
export async function getKeywordPins(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) return [];

  // 1. Direct Ultra-Low Latency Read from Active Catalog
  const activeRows = await sql`
    SELECT 
      ksp.pin_id, ksp.keyword_id, ksp.rank_position, ksp.last_known_rank,
      ump.title, COALESCE(ump.clean_domain, '') AS domain, ump.destination_url, ump.image_url,
      ump.save_count, ump.repin_count, ump.daily_save_velocity, ump.daily_repin_velocity,
      ump.creator_username,
      ump.board_name,
      ump.dominant_color,
      COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
      ump.created_at_pinterest, ump.creation_method,
      ump.metadata, ksp.crawled_at, ksp.updated_at, ksp.is_displaced, ksp.vacuum_opportunity_score
    FROM keyword_serp_positions ksp
    JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
    WHERE ksp.keyword_id = ${kid}
      AND ksp.is_displaced = FALSE
      AND ksp.rank_position IS NOT NULL
      AND ksp.rank_position >= 1
      AND NOT EXISTS (
        SELECT 1 FROM keyword_ignored_pins kip
        WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
      )
    ORDER BY ksp.rank_position ASC;
  `.catch(() => []);

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
  const { env = null } = opts;

  // Parallel fetch: keyword metadata (if not already known), active catalog pins, dropped pins, guided capsules, and true displaced count
  const [keywordRows, activeCatalogPins, displacedResultRaw, guides, displacedCountRow] = await Promise.all([
    actualKeyword ? Promise.resolve([actualKeyword]) : sql`
      SELECT id, keyword, category, is_active, last_crawled_at, updated_at, target_pin_count, crawl_pages_limit, avg_daily_velocity, metadata
      FROM tracked_keywords 
      WHERE id = ${kid};
    `,
    sql`
      SELECT 
        ksp.pin_id, ksp.keyword_id, ksp.rank_position, ksp.last_known_rank,
        ump.title, COALESCE(ump.clean_domain, '') AS domain, ump.destination_url, ump.image_url,
        ump.save_count, ump.repin_count, ump.daily_save_velocity, ump.daily_repin_velocity,
        ump.creator_username,
        ump.board_name,
        ump.dominant_color,
        COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
        ump.created_at_pinterest, ump.creation_method,
        ump.metadata, ksp.crawled_at, ksp.updated_at, ksp.is_displaced, ksp.vacuum_opportunity_score
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kid}
        AND ksp.is_displaced = FALSE
        AND ksp.rank_position IS NOT NULL
        AND ksp.rank_position >= 1
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = ksp.pin_id
        )
      ORDER BY ksp.rank_position ASC;
    `.catch(() => []),
    getKeywordDisplacedPins(sql, kid, { limit: 500, env }).catch(() => null),
    getKeywordGuides(sql, kid).catch(() => []),
    sql`
      SELECT COUNT(*)::int AS total 
      FROM keyword_serp_positions 
      WHERE keyword_id = ${kid}
        AND is_displaced = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kid} AND kip.pin_id = keyword_serp_positions.pin_id
        );
    `.catch(() => [{ total: 0 }])
  ]);

  const keyword = keywordRows[0];
  if (!keyword) throw new Error(`Keyword ID ${kid} not found`);

  const droppedOutPins = displacedResultRaw?.pins || [];

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
    p.title = derivePinTitle(p.title, p.destination_url, keyword.keyword, meta.board_name, meta.visual_annotations, meta.description || p.description || '', meta.alt_text || p.alt_text || p.seo_alt_text || '', meta.seo_title || p.seo_title || '');
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
    p.title = derivePinTitle(p.title, p.destination_url, keyword.keyword, p.board_name, meta.visual_annotations, meta.description || p.description || '', meta.alt_text || p.alt_text || p.seo_alt_text || '', meta.seo_title || p.seo_title || '');
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

  return {
    status: 'active',
    keyword,
    snapshot_date: latestDate,
    has_history: droppedOutPins.length > 0 || (currentPins.length > 0 && Boolean(keyword.last_crawled_at)),
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
}

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
 * Calculates continuous Decay- & Competition-Adjusted SERP Vacuum Opportunity Score (0..100)
 */
export function computeVacuumOpportunityScore({ lastKnownRank = 30, domainlessTop10Count = 0, saveCount = 0, medianTop10Saves = 100 } = {}) {
  const rank = Math.max(1, Number(lastKnownRank || 30));
  const rankScore = 55.0 * Math.exp(-0.045 * (rank - 1));
  const domainlessGapScore = Math.min(25, Number(domainlessTop10Count || 0) * 8);
  const savesRatio = Number(saveCount || 0) / Math.max(100, Number(medianTop10Saves || 100));
  const compScore = Math.min(20, Math.round(15.0 * savesRatio));
  return Math.min(100, Math.max(10, Math.round(rankScore + domainlessGapScore + compScore)));
}

/**
 * Retrieve chronological Performance Trajectory time series
 * Delegates to fetchPinTrajectory from pins/repository.mjs.
 * Supports range filtering: '7d', '14d', '30d', 'all'
 */
export async function getPinPerformanceTrajectory(sqlOrParams, keywordId, pinId, range = 'all') {
  let dbSql = null;
  let cleanPin = null;
  let cleanRange = range;

  if (sqlOrParams && typeof sqlOrParams === 'object' && !sqlOrParams.apply && ('pinId' in sqlOrParams || 'sql' in sqlOrParams || 'hubSql' in sqlOrParams)) {
    dbSql = sqlOrParams.sql || sqlOrParams.hubSql || null;
    cleanPin = String(sqlOrParams.pinId || '').trim();
    cleanRange = sqlOrParams.timeframe || sqlOrParams.range || 'all';
  } else {
    dbSql = sqlOrParams;
    cleanPin = String(pinId || '').trim();
    cleanRange = range || 'all';
  }

  if (!cleanPin) throw new Error('pin_id is required');

  const rawTraj = await fetchPinTrajectory({
    sql: dbSql,
    pinId: cleanPin,
    timeframe: cleanRange
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

  return {
    success: true,
    pin_id: cleanPin,
    keyword_id: (typeof keywordId === 'number' || typeof keywordId === 'string') ? Number(keywordId) || null : null,
    range: cleanRange,
    total_snapshots: snapshots.length,
    net_growth: netGrowth,
    snapshots,
    trajectory: snapshots
  };
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

  // [INVARIANT: READ-ONLY-GET-SAFE] Live scraping and 4-pillar sync are restricted to explicit POST endpoints (POST /api/pins/:id/sync)
  // GET requests with ?refresh=true strictly bypass the edge cache without initiating external Pinterest scraping storms
  if (forceRefresh && !options?.isReadOnly && options?.allowScrape === true) {
    try {
      const liveRes = await fetchPinFromPinterest(cleanPin);
      if (liveRes?.ok && liveRes.pin) {
        await syncPinAcrossAllFourPillars({
          sql,
          pinId: cleanPin,
          scrapedPin: liveRes.pin,
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
    sql,
    pinId: cleanPin,
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

  return {
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
}
