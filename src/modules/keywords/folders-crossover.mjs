/**
 * Keyword Folders Crossover Matrix & Title/Tag Synthesis Engine
 * Extracted from src/modules/keywords/folders-service.mjs
 */

import {
  normalizeAnnotationTag,
  isSyntheticGarbageTitle,
  resolveCanonicalPinTitle,
  normalizeCleanDomain
} from '../../domain/pin-intelligence.mjs';
import { TtlSingleflightCache } from '../../lib/ttl-cache.mjs';
import { buildFolderCrossoverMatrix, synthesizeSpokeTitle } from './folders-crossover-builders.mjs';
export { buildFolderCrossoverMatrix, synthesizeSpokeTitle };

export const FOLDER_TRENDS_CACHE_MAX = 100;
export const folderTrendsCache = new TtlSingleflightCache({
  maxEntries: FOLDER_TRENDS_CACHE_MAX,
  defaultTtlMs: 60 * 60 * 1000
});

export function cacheFolderTrends(term, data) {
  if (!term || typeof term !== 'string') return;
  const cleanTerm = term.trim().toLowerCase();
  if (cleanTerm) {
    folderTrendsCache.set(cleanTerm, data);
  }
}

const CROSSOVER_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const CROSSOVER_CACHE_MAX = 50;
const crossoverCache = new TtlSingleflightCache({
  maxEntries: CROSSOVER_CACHE_MAX,
  defaultTtlMs: CROSSOVER_TTL_MS
});

export const FOLDER_FORCE_REFRESH_COOLDOWN_MS = 15 * 1000; // 15-second per-folder cooldown on forced ?refresh=true
export const folderForceRefreshCooldown = new TtlSingleflightCache({
  maxEntries: 200,
  defaultTtlMs: FOLDER_FORCE_REFRESH_COOLDOWN_MS
});

export function normalizeFolderMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '""' || trimmed === "''") return {};
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (_) {}
      }
      return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Invalidate in-memory crossover cache for a folder or all folders
 */
export function invalidateFolderCache(folderId) {
  if (folderId) {
    const key = String(Number(folderId));
    crossoverCache.delete(key);
    folderForceRefreshCooldown.delete(key);
  } else {
    crossoverCache.invalidate();
    folderForceRefreshCooldown.invalidate();
  }
  folderTrendsCache.invalidate();
}

/**
 * Detects whether a pin title is empty, generic, or a synthesized "<Keyword> Inspiration" fallback
 * Canonical implementation delegates to isSyntheticGarbageTitle from src/domain/pin-intelligence.mjs
 */
export function isSyntheticPinTitle(title) {
  if (!title || typeof title !== 'string') return true;
  return isSyntheticGarbageTitle(title);
}

/**
 * Intelligent Pin Title Fallback Derivation
 * Delegates to canonical resolveCanonicalPinTitle from src/domain/pin-intelligence.mjs
 */
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = [], description = '', altText = '', seoTitle = '') {
  return resolveCanonicalPinTitle({
    title,
    destination_url: destinationUrl,
    keyword,
    board_name: boardName,
    visual_annotations: visualAnnotations,
    description,
    alt_text: altText,
    metadata: { seo_title: seoTitle }
  });
}

/**
 * Robust English Lemmatizer / Stemmer for Pinterest Visual Tags & Search Capsules
 * Delegates to canonical normalizeAnnotationTag from src/domain/pin-intelligence.mjs
 */
export function normalizeTagLemma(tag) {
  if (!tag) return '';
  return normalizeAnnotationTag(tag, { lemmatize: true });
}

/**
 * Comprehensive NLP Stopwords Dictionary
 * Excludes pronouns, auxiliaries, numbers, conversational fluff, and generic category headers
 */
export const STOPWORDS = new Set([
  // Grammar, Pronouns & Determiners
  'the', 'a', 'an', 'and', 'or', 'nor', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'into', 'about', 'against', 'between', 'through', 'during', 'before', 'after', 'above', 'below',
  'under', 'up', 'down', 'out', 'off', 'over', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'both', 'half', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'can', 'will', 'just', 'should', 'now', 'this', 'that', 'these', 'those', 'such',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'us',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'whose', 'whatever', 'whoever',

  // Numbers & Quantifiers
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', 'single', 'double', 'triple', 'many', 'much', 'some', 'few',
  'any', 'every', 'each', 'other', 'another', 'several', 'lot', 'lots', 'couple', 'full', 'quarter',

  // Conversational Verbs & Auxiliaries
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'would', 'shall', 'could', 'may', 'might', 'must',
  'make', 'makes', 'making', 'made', 'cook', 'cooks', 'cooking', 'cooked',
  'eat', 'eats', 'eating', 'ate', 'try', 'tries', 'trying', 'tried',
  'want', 'wants', 'need', 'needs', 'get', 'gets', 'getting', 'got',
  'like', 'likes', 'liked', 'love', 'loves', 'loving', 'loved',
  'see', 'look', 'watch', 'show', 'shows', 'enjoy', 'serve', 'serves',
  'prep', 'prepare', 'use', 'uses', 'using', 'used', 'let', 'keep', 'start',

  // Subjective / Evaluative / Clickbait Adjectives
  'delicious', 'deliciou', 'delish', 'yummy', 'amazing', 'awesome', 'incredible', 'fantastic',
  'great', 'good', 'best', 'better', 'easy', 'simple', 'quick', 'fast', 'slow', 'super',
  'real', 'true', 'ultimate', 'perfect', 'favorite', 'favourite', 'popular', 'crazy', 'insane',
  'tasty', 'fresh', 'hot', 'cold', 'warm', 'new', 'clean', 'budget', 'cheap', 'top', 'busy',
  'homemade', 'special', 'secret', 'classic', 'must', 'ever',

  // Generic Media, Publishing & Pinterest Metadata
  'pin', 'pins', 'click', 'link', 'bio', 'website', 'post', 'posts', 'video', 'videos',
  'photo', 'photos', 'image', 'images', 'pic', 'pics', 'picture', 'pictures', 'untitled',
  'board', 'boards', 'guide', 'guides', 'blueprint', 'blueprints', 'idea', 'ideas',
  'step', 'steps', 'way', 'ways', 'hack', 'hacks', 'tip', 'tips', 'thing', 'things',
  'item', 'items', 'stuff', 'something', 'recipe', 'recipes',

  // Time & Frequency
  'minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months',
  'year', 'years', 'night', 'nights', 'morning', 'mornings', 'tonight', 'today', 'tomorrow',
  'time', 'times', 'season', 'seasons', 'weeknight', 'weeknights',

  // Broad Umbrella Containers (Non-Specific Culinary Fillers)
  'food', 'meal', 'meals', 'dish', 'dishes', 'dinner', 'dinners', 'lunch', 'lunches',
  'breakfast', 'friend', 'friends', 'family', 'kid', 'kids', 'crowd', 'potluck'
]);

/**
 * Commercial Domain Sanitizer
 * Thin option-preset alias delegating to canonical `normalizeCleanDomain` SSOT.
 */
export function cleanExternalDomain(domainStr) {
  return normalizeCleanDomain(domainStr, {
    strictFqdn: true,
    preserveOrganic: false,
    excludeInternal: true
  });
}

/**
 * Helper to extract title entities / stopword-filtered n-grams
 */
export function extractTitleKeywords(title = '') {
  if (!title) return [];
  const tokens = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
    .map(t => normalizeTagLemma(t))
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));

  return [...new Set(tokens)];
}

/**
 * Extracts authentic database rolling-window gains without fake extrapolation.
 */
export function extractAuthenticRowGains(row, safeNum) {
  return {
    gains_5d: safeNum(row.gains_5d, null),
    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Authentic Multi-Window Gains
    gains_7d: safeNum(row.gains_7d, null),
    gains_10d: safeNum(row.gains_10d, null),
    gains_15d: safeNum(row.gains_15d, null),
    gains_24h: (row.gains_24h != null && Number.isFinite(Number(row.gains_24h))) ? Number(row.gains_24h) : null
  };
}

/**
 * Deep Algorithmic Crossover Matrix Engine
 * Calculates multi-dimensional overlaps across all keywords in a folder:
 * 1. Multi-Ranking Super-Pins (pins occupying rank positions in >= 2 keywords)
 * 2. Universal Tag Bridges (CV annotations & tags shared across multiple keywords)
 * 3. Shared Guided Pivots (Search capsules that act as semantic connectors)
 * 4. Creator & Domain Monopoly Index (who owns authority across this niche)
 * 5. Composite 52-Week Seasonality Wave & Optimal Launch Calendar
 * 6. Algorithmic Topic Cluster Blueprint & CSV Content Plan
 * 7. Fast edge caching (10m TTL) with ?refresh=true bypass and inflight coalescing
 */
export async function calculateFolderCrossover(sql, folderId, { refresh = false } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const key = String(fid);
  let effectiveRefresh = Boolean(refresh);

  // [INVARIANT: FOLDER-FORCE-REFRESH-COOLDOWN]
  // 15-second per-folder in-memory cooldown on forced ?refresh=true requests
  if (effectiveRefresh && folderForceRefreshCooldown.has(key)) {
    effectiveRefresh = false;
  }

  if (!effectiveRefresh) {
    const cached = crossoverCache.get(key);
    if (cached && cached._crossover_schema_v === 6) {
      return cached;
    }
  }

  if (effectiveRefresh) {
    folderForceRefreshCooldown.set(key, Date.now());
  }

  try {
    return await crossoverCache.getOrFetch(
      key,
      async () => await _executeFolderCrossover(sql, fid),
      {
        ttlMs: CROSSOVER_TTL_MS,
        forceRefresh: effectiveRefresh,
        shouldCache: (val) => Boolean(val && val._crossover_schema_v === 6)
      }
    );
  } catch (err) {
    if (effectiveRefresh) {
      folderForceRefreshCooldown.delete(key);
    }
    throw err;
  }
}

async function _executeFolderCrossover(sql, fid) {
  // 1. Fetch Folder & Member Keywords
  const [folder] = await sql`
    SELECT * FROM keyword_folders WHERE id = ${fid} LIMIT 1;
  `;
  if (!folder) throw new Error('Folder not found');

  const folderKeywords = await sql`
    SELECT 
      tk.id,
      tk.keyword,
      tk.category,
      tk.target_pin_count,
      tk.avg_daily_velocity,
      tk.top_pin_id,
      tk.top_pin_title,
      tk.top_pin_image,
      tk.last_crawled_at,
      tk.metadata
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    WHERE i.folder_id = ${fid}
    ORDER BY tk.avg_daily_velocity DESC, tk.keyword ASC;
  `;

  const totalKeywords = folderKeywords.length;
  const keywordIds = folderKeywords.map(k => k.id);

  if (totalKeywords === 0) {
    return {
      folder,
      summary: {
        total_keywords: 0,
        total_unique_pins: 0,
        super_pins_count: 0,
        vacuum_pins_count: 0,
        universal_tags_count: 0,
        shared_pivots_count: 0,
        monopoly_domain_count: 0
      },
      super_pins: [],
      tag_bridges: [],
      guided_pivots: [],
      domain_monopoly: [],
      creator_monopoly: [],
      seasonality: {
        composite_wave: [],
        peak_months: [],
        recommended_launch_window: 'Add keywords to see launch window'
      },
      topic_cluster_blueprint: null
    };
  }

  // 2. Query Live Active Catalog & Vault from keyword_serp_positions in a single parallel pass
  // [INVARIANT: TARGETED-JSONB-PROJECTION]
  let [pinRows, displacedRows, capsuleRows, repinWindowRows] = await Promise.all([
    sql`
      WITH ranked_active AS (
        SELECT
          c.keyword_id,
          c.pin_id,
          c.rank_position,
          ump.title,
          COALESCE(ump.clean_domain, '') AS domain,
          ump.destination_url,
          ump.image_url,
          ump.creator_username,
          ump.board_name,
          ump.dominant_color,
          COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
          ump.creation_method,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.daily_save_velocity,
          ump.daily_repin_velocity,
          ump.delta_repins_24h,
          ump.gains_5d,
          ump.gains_7d,
          ump.gains_10d,
          ump.gains_15d,
          ump.created_at_pinterest,
          c.crawled_at,
          c.updated_at AS snapshot_date,
          (ump.metadata->>'aspect_ratio') AS aspect_ratio,
          (ump.metadata->>'format') AS format,
          (ump.metadata->>'seo_title') AS seo_title,
          tk.keyword AS keyword_text,
          i.added_at AS folder_added_at,
          ROW_NUMBER() OVER (PARTITION BY c.pin_id ORDER BY ump.save_count DESC NULLS LAST, ump.daily_save_velocity DESC NULLS LAST) AS pin_rn
        FROM keyword_folder_items i
        JOIN tracked_keywords tk ON tk.id = i.keyword_id
        JOIN keyword_serp_positions c ON c.keyword_id = i.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = c.pin_id
        WHERE i.folder_id = ${fid}
          AND c.is_displaced IS FALSE
          AND c.rank_position IS NOT NULL
          AND c.rank_position >= 1
      )
      SELECT
        ra.keyword_id,
        ra.pin_id,
        ra.rank_position,
        ra.title,
        ra.domain,
        ra.destination_url,
        ra.image_url,
        ra.creator_username,
        ra.board_name,
        ra.dominant_color,
        ra.visual_annotations,
        ra.creation_method,
        ra.save_count,
        ra.repin_count,
        ra.comment_count,
        ra.daily_save_velocity,
        ra.daily_repin_velocity,
        ra.delta_repins_24h,
        ra.gains_5d,
        ra.gains_7d,
        ra.gains_10d,
        ra.gains_15d,
        ra.created_at_pinterest,
        ra.crawled_at,
        ra.snapshot_date,
        ra.aspect_ratio,
        ra.format,
        ra.seo_title,
        ra.keyword_text,
        ra.folder_added_at
      FROM ranked_active ra
      ORDER BY ra.pin_rn ASC, ra.save_count DESC NULLS LAST, ra.daily_save_velocity DESC NULLS LAST
      LIMIT 2500;
    `,
    sql`
      WITH active_pin_ids AS (
        SELECT DISTINCT c.pin_id
        FROM keyword_folder_items i
        JOIN keyword_serp_positions c ON c.keyword_id = i.keyword_id
        WHERE i.folder_id = ${fid}
          AND c.is_displaced IS FALSE
          AND c.rank_position IS NOT NULL
          AND c.rank_position >= 1
      ),
      folder_kdi AS (
        SELECT
          kdi.keyword_id,
          kdi.pin_id,
          COALESCE(kdi.last_known_rank, kdi.rank_position) AS rank_position,
          COALESCE(ump.clean_domain, '') AS domain,
          COALESCE(ump.creator_username, '') AS creator_username,
          ump.title,
          ump.image_url,
          ump.destination_url,
          COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
          ump.created_at_pinterest,
          ump.save_count,
          ump.repin_count,
          ump.comment_count,
          ump.daily_save_velocity,
          ump.daily_repin_velocity,
          ump.delta_repins_24h,
          ump.gains_5d,
          ump.gains_7d,
          ump.gains_10d,
          ump.gains_15d,
          kdi.updated_at AS snapshot_date,
          tk.keyword AS keyword_text,
          i.added_at AS folder_added_at,
          TRUE AS is_displaced,
          (kdi.pin_id IN (SELECT pin_id FROM active_pin_ids)) AS in_active_serp,
          ROW_NUMBER() OVER (
            PARTITION BY kdi.pin_id
            ORDER BY (kdi.pin_id IN (SELECT pin_id FROM active_pin_ids)) DESC, ump.daily_save_velocity DESC NULLS LAST, ump.save_count DESC NULLS LAST
          ) AS pin_rn
        FROM keyword_folder_items i
        JOIN tracked_keywords tk ON tk.id = i.keyword_id
        JOIN keyword_serp_positions kdi ON kdi.keyword_id = i.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = kdi.pin_id
        WHERE i.folder_id = ${fid}
          AND kdi.is_displaced IS TRUE
      )
      SELECT
        keyword_id,
        pin_id,
        rank_position,
        title,
        image_url,
        destination_url,
        visual_annotations,
        created_at_pinterest,
        domain,
        creator_username,
        save_count,
        repin_count,
        comment_count,
        daily_save_velocity,
        daily_repin_velocity,
        delta_repins_24h,
        gains_5d,
        gains_7d,
        gains_10d,
        gains_15d,
        snapshot_date,
        keyword_text,
        folder_added_at,
        is_displaced
      FROM folder_kdi
      ORDER BY pin_rn ASC, in_active_serp DESC, daily_save_velocity DESC NULLS LAST, save_count DESC NULLS LAST
      LIMIT 2500;
    `,
    sql`
      SELECT 
        c.id,
        c.keyword_id,
        c.term,
        c.display_label,
        c.score,
        c.dominant_color,
        c.display_order,
        tk.keyword as keyword_text
      FROM keyword_guided_capsules c
      JOIN tracked_keywords tk ON tk.id = c.keyword_id
      WHERE c.keyword_id = ANY(${keywordIds})
      ORDER BY c.score DESC, c.display_order ASC;
    `,
    sql`
      WITH folder_pins AS (
        SELECT DISTINCT c.pin_id
        FROM keyword_folder_items i
        JOIN keyword_serp_positions c ON c.keyword_id = i.keyword_id
        WHERE i.folder_id = ${fid}
      ),
      pin_metrics AS (
        SELECT
          pdm.pin_id,
          pdm.recorded_date,
          pdm.repin_count,
          COALESCE(pdm.save_count, 0) AS save_count,
          FIRST_VALUE(pdm.repin_count) OVER (PARTITION BY pdm.pin_id ORDER BY pdm.recorded_date DESC) AS latest_repins,
          FIRST_VALUE(COALESCE(pdm.save_count, 0)) OVER (PARTITION BY pdm.pin_id ORDER BY pdm.recorded_date DESC) AS latest_saves,
          FIRST_VALUE(pdm.recorded_date) OVER (PARTITION BY pdm.pin_id ORDER BY pdm.recorded_date DESC) AS latest_date
        FROM pins_daily_metrics pdm
        JOIN folder_pins fp ON fp.pin_id = pdm.pin_id
        WHERE pdm.recorded_date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '18 days'
          AND pdm.repin_count IS NOT NULL
      ),
      pin_baselines AS (
        SELECT
          pm.pin_id,
          pm.latest_repins,
          pm.latest_saves,
          (ARRAY_AGG(pm.repin_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '5 days'))[1] AS base_repins_5d,
          (ARRAY_AGG(pm.save_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '5 days'))[1] AS base_saves_5d,
          (ARRAY_AGG(pm.repin_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '7 days'))[1] AS base_repins_7d,
          (ARRAY_AGG(pm.save_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '7 days'))[1] AS base_saves_7d,
          (ARRAY_AGG(pm.repin_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '10 days'))[1] AS base_repins_10d,
          (ARRAY_AGG(pm.save_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '10 days'))[1] AS base_saves_10d,
          (ARRAY_AGG(pm.repin_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '15 days'))[1] AS base_repins_15d,
          (ARRAY_AGG(pm.save_count ORDER BY pm.recorded_date DESC) FILTER (WHERE pm.recorded_date <= pm.latest_date - INTERVAL '15 days'))[1] AS base_saves_15d
        FROM pin_metrics pm
        GROUP BY pm.pin_id, pm.latest_repins, pm.latest_saves, pm.latest_date
      ),
      repin_deltas AS (
        SELECT
          pb.pin_id,
          CASE
            WHEN pb.base_repins_5d IS NULL THEN 0
            WHEN pb.base_repins_5d <= 0 AND pb.latest_repins >= 10 THEN 0
            WHEN pb.base_repins_5d > 0 AND pb.base_repins_5d < 100
              AND (pb.latest_repins - pb.base_repins_5d) >= 500
              AND GREATEST(0, pb.latest_saves - pb.base_saves_5d) < (pb.latest_repins - pb.base_repins_5d) * 0.25 THEN 0
            WHEN pb.base_repins_5d > 0
              AND pb.latest_repins >= pb.base_repins_5d * 4
              AND (pb.latest_repins - pb.base_repins_5d) >= 200
              AND GREATEST(0, pb.latest_saves - pb.base_saves_5d) < (pb.latest_repins - pb.base_repins_5d) * 0.15 THEN 0
            ELSE GREATEST(0, pb.latest_repins - pb.base_repins_5d)
          END AS repins_5d,
          CASE
            WHEN pb.base_repins_7d IS NULL THEN 0
            WHEN pb.base_repins_7d <= 0 AND pb.latest_repins >= 10 THEN 0
            WHEN pb.base_repins_7d > 0 AND pb.base_repins_7d < 100
              AND (pb.latest_repins - pb.base_repins_7d) >= 500
              AND GREATEST(0, pb.latest_saves - pb.base_saves_7d) < (pb.latest_repins - pb.base_repins_7d) * 0.25 THEN 0
            WHEN pb.base_repins_7d > 0
              AND pb.latest_repins >= pb.base_repins_7d * 4
              AND (pb.latest_repins - pb.base_repins_7d) >= 200
              AND GREATEST(0, pb.latest_saves - pb.base_saves_7d) < (pb.latest_repins - pb.base_repins_7d) * 0.15 THEN 0
            ELSE GREATEST(0, pb.latest_repins - pb.base_repins_7d)
          END AS repins_7d,
          CASE
            WHEN pb.base_repins_10d IS NULL THEN 0
            WHEN pb.base_repins_10d <= 0 AND pb.latest_repins >= 10 THEN 0
            WHEN pb.base_repins_10d > 0 AND pb.base_repins_10d < 100
              AND (pb.latest_repins - pb.base_repins_10d) >= 500
              AND GREATEST(0, pb.latest_saves - pb.base_saves_10d) < (pb.latest_repins - pb.base_repins_10d) * 0.25 THEN 0
            WHEN pb.base_repins_10d > 0
              AND pb.latest_repins >= pb.base_repins_10d * 4
              AND (pb.latest_repins - pb.base_repins_10d) >= 200
              AND GREATEST(0, pb.latest_saves - pb.base_saves_10d) < (pb.latest_repins - pb.base_repins_10d) * 0.15 THEN 0
            ELSE GREATEST(0, pb.latest_repins - pb.base_repins_10d)
          END AS repins_10d,
          CASE
            WHEN pb.base_repins_15d IS NULL THEN 0
            WHEN pb.base_repins_15d <= 0 AND pb.latest_repins >= 10 THEN 0
            WHEN pb.base_repins_15d > 0 AND pb.base_repins_15d < 100
              AND (pb.latest_repins - pb.base_repins_15d) >= 500
              AND GREATEST(0, pb.latest_saves - pb.base_saves_15d) < (pb.latest_repins - pb.base_repins_15d) * 0.25 THEN 0
            WHEN pb.base_repins_15d > 0
              AND pb.latest_repins >= pb.base_repins_15d * 4
              AND (pb.latest_repins - pb.base_repins_15d) >= 200
              AND GREATEST(0, pb.latest_saves - pb.base_saves_15d) < (pb.latest_repins - pb.base_repins_15d) * 0.15 THEN 0
            ELSE GREATEST(0, pb.latest_repins - pb.base_repins_15d)
          END AS repins_15d
        FROM pin_baselines pb
      )
      SELECT
        COALESCE(SUM(repins_5d), 0)::bigint AS repins_5d,
        COALESCE(SUM(repins_7d), 0)::bigint AS repins_7d,
        COALESCE(SUM(repins_10d), 0)::bigint AS repins_10d,
        COALESCE(SUM(repins_15d), 0)::bigint AS repins_15d
      FROM repin_deltas;
    `.catch((err) => {
      console.warn(`[calculateFolderCrossover] Rolling repin window query warning for folder ${fid}:`, err?.message || err);
      return [{ repins_5d: 0, repins_7d: 0, repins_10d: 0, repins_15d: 0 }];
    })
  ]);

  if (!pinRows) pinRows = [];
  if (!displacedRows) displacedRows = [];
  if (!capsuleRows) capsuleRows = [];
  if (!repinWindowRows) repinWindowRows = [];

  return await buildFolderCrossoverMatrix({
    sql,
    folder,
    folderKeywords,
    totalKeywords,
    pinRows,
    displacedRows,
    capsuleRows,
    repinWindowRows
  });
}
