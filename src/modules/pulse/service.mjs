/**
 * Global 24-Hour Algorithmic Pulse & Multi-Dimensional Crossover Service
 *
 * Centerpiece daily command intelligence engine:
 * 1. Executes 5 ultra-fast, zero-Cartesian Hub queries concurrently via Promise.all.
 * 2. Strictly obeys Central Hub Skeletal Compaction (no description/alt_text/seo_title on keyword_serp_current).
 * 3. In-memory N-Gram Set Mining for 1-Gram, 2-Pairs (A+B), and 3-Triplets (A+B+C) with 10-annotation cap per pin.
 * 4. Guided Search Capsules cross-keyword bridge detection across 1,398 capsules.
 * 5. Breakout Creators with historical snapshot delta fallbacks and Top 3 Driver Pins.
 * 6. Multi-Keyword / Cross-Folder Pixie Bridge Pins and 24h SERP Vacuum opportunities.
 * 7. Hidden Gems telemetry (Winning Boards, Vacuum Hijacks, Creation Methods, Color Palette, Arbitrage Domains).
 * 8. One-Click 5-Source Scientific Pin Blueprint Data Synthesizer.
 * 9. Dual-Tier Caching (Process-local LRU max 25 + Workers KV) with 15s force-refresh cooldown and in-flight stampede guard.
 *
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */

import { hydratePinsFromD1 } from '../keywords/d1-metadata.mjs';

// Bounded Process-Local LRU Cache (max 25 entries, 120s TTL)
export const pulseMemoryCache = new Map();
export const PULSE_MEMORY_CACHE_MAX = 25;
export const PULSE_MEMORY_TTL_MS = 120_000;

// Per-key force-refresh cooldown (15s cooldown)
export const pulseForceRefreshCooldown = new Map();
export const PULSE_FORCE_REFRESH_COOLDOWN_MS = 15_000;

// In-flight deduplication map
export const inflightPulse = new Map();

const tagNormCache = new Map();
function getNormalizedTag(label) {
  let norm = tagNormCache.get(label);
  if (norm === undefined) {
    norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (tagNormCache.size < 2000) tagNormCache.set(label, norm);
  }
  return norm;
}

const kwSlugCache = new Map();
function getKeywordSlug(kwText, kwId) {
  if (kwText) {
    let slug = kwSlugCache.get(kwText);
    if (!slug) {
      slug = kwText.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (kwSlugCache.size < 500) kwSlugCache.set(kwText, slug);
    }
    return slug;
  }
  return kwId ? String(kwId) : '';
}

const fastParseIsoDateMs = (str) => {
  if (!str || typeof str !== 'string') return NaN;
  if (str.length >= 10 && str.charCodeAt(4) === 45 && str.charCodeAt(7) === 45) {
    const y = +str.slice(0, 4);
    const m = (+str.slice(5, 7)) - 1;
    const d = +str.slice(8, 10);
    return Date.UTC(y, m, d);
  }
  return Date.parse(str);
};

/**
 * Normalizes and extracts clean visual annotations from polymorphic shapes:
 * - Plain string arrays: ["Dinner Ideas", "Quick Meals"]
 * - Object arrays: [{"name": "Summer Outfits", "idea_id": "123"}]
 * - Stringified JSON strings
 * - Wrapped objects: { tags: [...] }
 * Deduplicates intra-pin tags, filters labels < 2 chars, and omits hallucinated confidence scores.
 */
export function extractCleanAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw._clean) return raw._clean;
  let arr = raw;
  if (typeof arr === 'string' && arr.trim()) {
    try {
      arr = JSON.parse(arr);
    } catch (_) {
      arr = [];
    }
  }
  if (arr && typeof arr === 'object' && !Array.isArray(arr) && Array.isArray(arr.tags)) {
    arr = arr.tags;
  }
  if (!Array.isArray(arr)) return [];
  if (arr._clean) return arr._clean;
  if (arr.length === 0) return [];
  if (typeof arr[0] === 'object' && arr[0]?.norm && arr[0]?.display) return arr;

  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const label = typeof item === 'string'
      ? item.trim()
      : String(item?.display || item?.name || item?.tag || item?.label || item?.display_label || item?.term || item?.norm || '').trim();
    if (!label || label.length < 2) continue;
    const norm = getNormalizedTag(label);
    let duplicate = false;
    for (let j = 0; j < result.length; j++) {
      if (result[j].norm === norm) { duplicate = true; break; }
    }
    if (!duplicate) {
      result.push({ norm, display: label });
    }
  }
  try { arr._clean = result; } catch (_) {}
  return result;
}

/**
 * Invalidate in-memory and edge KV pulse caches
 */
export async function invalidateGlobalPulseCache(env = null, ctx = null) {
  pulseMemoryCache.clear();
  pulseForceRefreshCooldown.clear();
  inflightPulse.clear();

  if (env?.PIN_ENGINE_KV) {
    const p = env.PIN_ENGINE_KV.delete('pulse:global_24h:summary').catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') {
      try {
        ctx.waitUntil(p);
      } catch (_) {}
    } else {
      await p;
    }
  }
}

/**
 * Helper to store item in bounded LRU map
 */
function setPulseMemoryCache(key, payload) {
  if (pulseMemoryCache.has(key)) {
    pulseMemoryCache.delete(key);
  } else if (pulseMemoryCache.size >= PULSE_MEMORY_CACHE_MAX) {
    const oldestKey = pulseMemoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      pulseMemoryCache.delete(oldestKey);
    }
  }
  pulseMemoryCache.set(key, { timestamp: Date.now(), payload });
}

/**
 * Numeric Sanitization Helpers (Anti-NaN Shield)
 * Enforces Rule 3 (Numeric & Object Cast Hygiene): Math.max(5, NaN) === NaN.
 */
export const safeNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const safeNullableNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Inline fast numeric validator (Anti-NaN Shield, Rule 3)
 */
export const fastNum = (v) => {
  if (typeof v === 'number') return (v === v && v !== Infinity && v !== -Infinity) ? v : 0;
  if (!v) return 0;
  const n = +v;
  return (n === n && n !== Infinity && n !== -Infinity) ? n : 0;
};

/**
 * Static module-level comparators for high-frequency sorting (zero closure allocation)
 */
const tagNormAscComparator = (a, b) => (a.norm < b.norm ? -1 : (a.norm > b.norm ? 1 : 0));

const activePinSortComparator = (a, b) => {
  if (b.is_hydrated_int !== a.is_hydrated_int) {
    return b.is_hydrated_int - a.is_hydrated_int;
  }
  if (b.effective_24h_gain !== a.effective_24h_gain) {
    return b.effective_24h_gain - a.effective_24h_gain;
  }
  if (b.effective_24h_momentum !== a.effective_24h_momentum) {
    return b.effective_24h_momentum - a.effective_24h_momentum;
  }
  if (b.daily_save_velocity !== a.daily_save_velocity) {
    return b.daily_save_velocity - a.daily_save_velocity;
  }
  return b.save_count - a.save_count;
};

const gainThenCountDescComparator = (a, b) => {
  if (b.total_24h_gain !== a.total_24h_gain) return b.total_24h_gain - a.total_24h_gain;
  return b.pin_count - a.pin_count;
};

const capsuleGroupSortComparator = (a, b) => {
  if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count;
  if (b.cross_serp_velocity !== a.cross_serp_velocity) return b.cross_serp_velocity - a.cross_serp_velocity;
  return b.max_score - a.max_score;
};

/**
 * Query 1: Active SERP & Folder Mapping (Zero-Cartesian CTE)
 * Strictly obeys Hub Skeletal Compaction: does NOT select description, alt_text, or seo_title.
 */
async function queryActiveSerp(sql, folderIdNum) {
  return await sql`
    WITH kw_folders AS (
      SELECT
        kfi.keyword_id,
        jsonb_agg(
          jsonb_build_object('folder_id', kf.id, 'folder_name', kf.name, 'folder_color', kf.color)
          ORDER BY kf.name ASC
        ) AS folders
      FROM keyword_folder_items kfi
      JOIN keyword_folders kf ON kf.id = kfi.folder_id
      GROUP BY kfi.keyword_id
    )
    SELECT
      COUNT(*) OVER()::int AS full_count,
      ksc.keyword_id,
      tk.keyword AS keyword_text,
      tk.category AS keyword_category,
      COALESCE(kwf.folders, '[]'::jsonb) AS folders,
      ksc.pin_id,
      ksc.rank_position,
      ksc.prev_rank_position,
      ksc.title,
      ksc.domain,
      ksc.destination_url,
      ksc.image_url,
      ksc.creator_username,
      ksc.board_name,
      COALESCE(ksc.save_count, 0) AS save_count,
      COALESCE(ksc.repin_count, 0) AS repin_count,
      COALESCE(ksc.daily_save_velocity, 0) AS daily_save_velocity,
      COALESCE(ksc.delta_repins_24h, 0) AS delta_repins_24h,
      COALESCE(ksc.gains_5d, 0) AS gains_5d,
      COALESCE(ksc.gains_7d, 0) AS gains_7d,
      COALESCE(ksc.gains_10d, 0) AS gains_10d,
      COALESCE(ksc.gains_15d, 0) AS gains_15d,
      COALESCE(ksc.url_global_saves, 0) AS url_global_saves,
      COALESCE(ksc.dominant_color, '#888888') AS dominant_color,
      COALESCE(ksc.visual_annotations, '[]'::jsonb) AS visual_annotations,
      ksc.created_at_pinterest,
      COALESCE(NULLIF(ksc.creation_method, ''), NULLIF(ksc.metadata->>'creation_method', ''), 'pinterest_platform') AS creation_method,
      ksc.crawled_at
    FROM keyword_serp_current ksc
    JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
    LEFT JOIN kw_folders kwf ON kwf.keyword_id = ksc.keyword_id
    WHERE COALESCE(ksc.is_displaced, FALSE) = FALSE
      AND ksc.rank_position IS NOT NULL
      AND (${folderIdNum}::int IS NULL OR EXISTS (
        SELECT 1 FROM keyword_folder_items fi 
        WHERE fi.keyword_id = ksc.keyword_id AND fi.folder_id = ${folderIdNum}::int
      ))
    ORDER BY GREATEST(COALESCE(ksc.daily_save_velocity, 0), COALESCE(ksc.delta_repins_24h, 0)) DESC, ksc.save_count DESC
    LIMIT 1200;
  `;
}

/**
 * Query 2: Displaced Vault Surge & 24h SERP Vacuum (keyword_displaced_index)
 * Part 2A: Aggregates displaced counts per keyword.
 * Part 2B: Top 250 Vault Surge Sleepers hydrated from D1.
 * // [CRITICAL SCHEMA INVARIANT: keyword_displaced_index has NO delta_saves_24h column in Postgres DDL]
 */
async function queryVaultAndVacuum(sql, folderIdNum, env) {
  const [vacuumRows, vaultPinsRaw] = await Promise.all([
    sql`
      SELECT
        kdi.keyword_id,
        tk.keyword AS keyword_text,
        COUNT(*) FILTER (WHERE kdi.displaced_date >= CURRENT_DATE - 1)::int AS displaced_24h_count,
        COUNT(*) FILTER (WHERE kdi.displaced_date >= CURRENT_DATE - 1 AND kdi.last_known_rank <= 10)::int AS displaced_top10_24h_count,
        COUNT(*) FILTER (WHERE kdi.last_known_rank <= 10)::int AS displaced_top10_7d_count
      FROM keyword_displaced_index kdi
      JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
      WHERE kdi.displaced_date >= CURRENT_DATE - 7
        AND (${folderIdNum}::int IS NULL OR EXISTS (
          SELECT 1 FROM keyword_folder_items fi 
          WHERE fi.keyword_id = kdi.keyword_id AND fi.folder_id = ${folderIdNum}::int
        ))
      GROUP BY kdi.keyword_id, tk.keyword;
    `,
    sql`
      SELECT
        kdi.keyword_id,
        tk.keyword AS keyword_text,
        tk.category AS keyword_category,
        kdi.pin_id,
        kdi.last_known_rank,
        kdi.vacuum_opportunity_score,
        kdi.displaced_date,
        COALESCE(kdi.save_count, 0) AS save_count,
        COALESCE(kdi.repin_count, 0) AS repin_count,
        COALESCE(kdi.daily_save_velocity, 0) AS daily_save_velocity,
        COALESCE(kdi.delta_repins_24h, 0) AS delta_repins_24h,
        COALESCE(kdi.gains_5d, 0) AS gains_5d,
        COALESCE(kdi.gains_7d, 0) AS gains_7d,
        COALESCE(kdi.gains_10d, 0) AS gains_10d,
        COALESCE(kdi.gains_15d, 0) AS gains_15d,
        COALESCE(NULLIF(kdi.domain, ''), pa.domain, cpin.link_domain, '') AS domain,
        COALESCE(NULLIF(kdi.creator_username, ''), pa.account_username, '') AS creator_username,
        kdi.shard_id,
        COALESCE(pa.title, cpin.title, '') AS title,
        COALESCE(pa.description, cpin.description, '') AS description,
        COALESCE(pa.alt_text, cpin.alt_text, '') AS alt_text,
        COALESCE(pa.image_url, cpin.image_url, '') AS image_url,
        COALESCE(pa.link, cpin.destination_url, '') AS destination_url,
        COALESCE(pa.board_name, cpin.board_name, '') AS board_name,
        COALESCE(pa.dominant_color, '#888888') AS dominant_color,
        COALESCE(pa.annotations, cpin.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
        COALESCE(pa.created_at_pinterest, cpin.created_at_pinterest) AS created_at_pinterest
      FROM keyword_displaced_index kdi
      JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
      LEFT JOIN pa_pins pa ON pa.pin_id = kdi.pin_id
      LEFT JOIN LATERAL (
        SELECT title, description, alt_text, image_url, destination_url, link_domain, board_name, metadata, created_at_pinterest
        FROM public.competitor_pins cp
        WHERE cp.pin_id = kdi.pin_id AND cp.is_deleted = FALSE
        LIMIT 1
      ) cpin ON TRUE
      WHERE (kdi.daily_save_velocity > 0 OR kdi.delta_repins_24h > 0)
        AND (${folderIdNum}::int IS NULL OR EXISTS (
          SELECT 1 FROM keyword_folder_items fi 
          WHERE fi.keyword_id = kdi.keyword_id AND fi.folder_id = ${folderIdNum}::int
        ))
      ORDER BY GREATEST(COALESCE(kdi.daily_save_velocity, 0), COALESCE(kdi.delta_repins_24h, 0)) DESC
      LIMIT 150;
    `
  ]);

  for (let i = 0; i < vaultPinsRaw.length; i++) {
    vaultPinsRaw[i].delta_saves_24h = 0; // [INVARIANT: ANTI-FABRICATION: do NOT set delta_saves_24h = dailyVel]
  }

  return { vacuumRows, vaultPins: vaultPinsRaw };
}

/**
 * Query 6: Top 150 Surging Competitor & Creator Pins (competitor_pins + competitor_profiles)
 * // [CRITICAL SCHEMA INVARIANT: In competitor_pins, daily velocity is in metadata->>'daily_save_velocity',
 * //  delta_saves_24h in metadata->>'delta_saves_24h', and domain is link_domain]
 */
async function queryViralCreatorPins(sql, folderIdNum) {
  return await sql`
    SELECT
      cpin.pin_id,
      cpin.title,
      cpin.description,
      cpin.alt_text,
      cpin.image_url,
      cpin.destination_url,
      cpin.link_domain AS domain,
      cpin.board_name,
      cp.username AS creator_username,
      COALESCE(cpin.save_count, 0) AS save_count,
      COALESCE(cpin.repin_count, 0) AS repin_count,
      m.daily_save_velocity,
      m.delta_saves_24h,
      m.delta_repins_24h,
      cpin.created_at_pinterest,
      COALESCE(cpin.metadata->'visual_annotations', cpin.metadata->'annotations', '[]'::jsonb) AS visual_annotations
    FROM competitor_pins cpin
    JOIN competitor_profiles cp ON cp.id = cpin.competitor_id
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(NULLIF(regexp_replace(cpin.metadata->>'daily_save_velocity', '[^0-9.-]', '', 'g'), '')::numeric, 0) AS daily_save_velocity,
        COALESCE(NULLIF(regexp_replace(cpin.metadata->>'delta_saves_24h', '[^0-9.-]', '', 'g'), '')::numeric, 0) AS delta_saves_24h,
        COALESCE(NULLIF(regexp_replace(cpin.metadata->>'delta_repins_24h', '[^0-9.-]', '', 'g'), '')::numeric, 0) AS delta_repins_24h
    ) m
    WHERE cpin.is_deleted = FALSE
      AND (cpin.metadata ?| array['daily_save_velocity', 'delta_saves_24h', 'delta_repins_24h'])
      AND (${folderIdNum}::int IS NULL OR cp.source_folder_id = ${folderIdNum}::int OR EXISTS (
        SELECT 1 FROM folder_competitor_items fci 
        WHERE fci.competitor_id = cpin.competitor_id AND fci.folder_id = ${folderIdNum}::int
      ))
      AND (m.daily_save_velocity > 0 OR m.delta_saves_24h > 0 OR m.delta_repins_24h > 0)
    ORDER BY GREATEST(m.daily_save_velocity, m.delta_saves_24h, m.delta_repins_24h) DESC
    LIMIT 120;
  `;
}

/**
 * Query 3: Global Guided Search Capsules Query (keyword_guided_capsules)
 */
async function queryGuidedCapsules(sql, folderIdNum) {
  return await sql`
    SELECT
      c.id,
      c.keyword_id,
      c.term,
      c.display_label,
      COALESCE(c.score, 0) AS score,
      COALESCE(c.dominant_color, '#3b82f6') AS dominant_color,
      COALESCE(c.display_order, 10) AS display_order,
      tk.keyword AS keyword_text,
      tk.category AS keyword_category
    FROM keyword_guided_capsules c
    JOIN tracked_keywords tk ON tk.id = c.keyword_id
    WHERE (${folderIdNum}::int IS NULL OR EXISTS (
      SELECT 1 FROM keyword_folder_items fi 
      WHERE fi.keyword_id = c.keyword_id AND fi.folder_id = ${folderIdNum}::int
    ))
    ORDER BY c.score DESC, c.display_order ASC;
  `;
}

/**
 * Query 4: Breakout Creators with Historical Delta Fallbacks and Top 3 Driver Pins
 */
async function queryBreakoutCreators(sql, folderIdNum) {
  return await sql`
    WITH snap_prev1d AS (
      SELECT competitor_id, monthly_reach AS prev_reach_1d, profile_views AS prev_views_1d
      FROM competitor_history_snapshots
      WHERE recorded_date = CURRENT_DATE - 1
    ),
    snap_prev7d AS (
      SELECT competitor_id, monthly_reach AS prev_reach_7d, profile_views AS prev_views_7d
      FROM competitor_history_snapshots
      WHERE recorded_date = CURRENT_DATE - 7
    ),
    active_creators AS (
      SELECT
        cprof.id,
        cprof.username,
        cprof.display_name,
        cprof.avatar_url,
        cprof.bio,
        cprof.website_url,
        COALESCE(cprof.monthly_reach, 0) AS monthly_reach,
        COALESCE(cprof.profile_views, 0) AS profile_views,
        COALESCE(cprof.total_pins, 0) AS total_pins,
        COALESCE(cprof.total_boards, 0) AS total_boards,
        COALESCE(cprof.follower_count, 0) AS follower_count,
        COALESCE(cprof.delta_reach_24h, 0) AS delta_reach_24h,
        COALESCE(cprof.delta_views_24h, 0) AS delta_views_24h,
        COALESCE(cprof.reach_delta_7d, 0) AS reach_delta_7d,
        COALESCE(cprof.views_delta_7d, 0) AS views_delta_7d,
        COALESCE(cprof.delta_pins_24h, 0) AS delta_pins_24h,
        cprof.last_synced_at,
        CASE
          WHEN COALESCE(cprof.delta_reach_24h, 0) <> 0 THEN cprof.delta_reach_24h
          WHEN sp1.prev_reach_1d IS NOT NULL THEN (cprof.monthly_reach - sp1.prev_reach_1d)
          ELSE 0
        END AS effective_delta_reach_24h,
        CASE
          WHEN COALESCE(cprof.delta_views_24h, 0) <> 0 THEN cprof.delta_views_24h
          WHEN sp1.prev_views_1d IS NOT NULL THEN (cprof.profile_views - sp1.prev_views_1d)
          ELSE 0
        END AS effective_delta_views_24h,
        CASE
          WHEN COALESCE(cprof.reach_delta_7d, 0) <> 0 THEN cprof.reach_delta_7d
          WHEN sp7.prev_reach_7d IS NOT NULL THEN (cprof.monthly_reach - sp7.prev_reach_7d)
          ELSE 0
        END AS effective_reach_delta_7d,
        CASE
          WHEN COALESCE(cprof.views_delta_7d, 0) <> 0 THEN cprof.views_delta_7d
          WHEN sp7.prev_views_7d IS NOT NULL THEN (cprof.profile_views - sp7.prev_views_7d)
          ELSE 0
        END AS effective_views_delta_7d
      FROM competitor_profiles cprof
      LEFT JOIN snap_prev1d sp1 ON sp1.competitor_id = cprof.id
      LEFT JOIN snap_prev7d sp7 ON sp7.competitor_id = cprof.id
      WHERE cprof.is_active = TRUE
        AND (
          cprof.monthly_reach > 0 OR cprof.profile_views > 0
          OR cprof.delta_reach_24h <> 0 OR cprof.delta_views_24h <> 0
          OR cprof.reach_delta_7d <> 0
          OR sp1.prev_reach_1d IS NOT NULL
        )
        AND (${folderIdNum}::int IS NULL OR cprof.source_folder_id = ${folderIdNum}::int OR EXISTS (
          SELECT 1 FROM folder_competitor_items fci 
          WHERE fci.competitor_id = cprof.id AND fci.folder_id = ${folderIdNum}::int
        ))
    ),
    top_creators AS (
      SELECT *
      FROM active_creators
      WHERE (effective_delta_reach_24h > 0 OR effective_delta_views_24h > 0 OR monthly_reach > 0)
      ORDER BY 
        GREATEST(effective_delta_reach_24h, effective_delta_views_24h) DESC,
        monthly_reach DESC
      LIMIT 60
    ),
    ranked_pins AS (
      SELECT
        cpin.competitor_id,
        cpin.pin_id,
        cpin.title,
        cpin.image_url,
        cpin.board_name,
        cpin.link_domain,
        cpin.destination_url,
        COALESCE(cpin.save_count, 0) AS save_count,
        COALESCE(cpin.repin_count, 0) AS repin_count,
        COALESCE(clean_metrics.delta_saves_24h, clean_metrics.daily_save_velocity, 0) AS delta_saves_24h,
        clean_metrics.daily_save_velocity,
        cpin.created_at_pinterest,
        ROW_NUMBER() OVER (
          PARTITION BY cpin.competitor_id
          ORDER BY GREATEST(clean_metrics.delta_saves_24h, clean_metrics.daily_save_velocity) DESC, cpin.save_count DESC
        ) AS rn
      FROM competitor_pins cpin
      JOIN top_creators tc ON tc.id = cpin.competitor_id
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(regexp_replace(cpin.metadata->>'daily_save_velocity', '[^0-9.-]', '', 'g'), '')::numeric, 0) AS daily_save_velocity,
          COALESCE(NULLIF(regexp_replace(cpin.metadata->>'delta_saves_24h', '[^0-9.-]', '', 'g'), '')::numeric, 0) AS delta_saves_24h
      ) clean_metrics
      WHERE cpin.is_deleted = FALSE
        AND cpin.image_url IS NOT NULL AND cpin.image_url <> ''
    ),
    driver_pins_agg AS (
      SELECT
        rp.competitor_id,
        jsonb_agg(
          jsonb_build_object(
            'pin_id', rp.pin_id,
            'title', rp.title,
            'image_url', rp.image_url,
            'board_name', rp.board_name,
            'link_domain', rp.link_domain,
            'destination_url', rp.destination_url,
            'save_count', rp.save_count,
            'repin_count', rp.repin_count,
            'delta_saves_24h', rp.delta_saves_24h,
            'daily_save_velocity', rp.daily_save_velocity,
            'created_at_pinterest', rp.created_at_pinterest
          )
          ORDER BY rp.rn ASC
        ) AS driver_pins
      FROM ranked_pins rp
      WHERE rp.rn <= 3
      GROUP BY rp.competitor_id
    )
    SELECT
      tc.id,
      tc.username,
      tc.display_name,
      tc.avatar_url,
      tc.bio,
      tc.website_url,
      tc.monthly_reach,
      tc.profile_views,
      tc.total_pins,
      tc.total_boards,
      tc.follower_count,
      tc.delta_reach_24h,
      tc.delta_views_24h,
      tc.reach_delta_7d,
      tc.views_delta_7d,
      tc.delta_pins_24h,
      tc.last_synced_at,
      tc.effective_delta_reach_24h,
      tc.effective_delta_views_24h,
      tc.effective_reach_delta_7d,
      tc.effective_views_delta_7d,
      COALESCE(dpa.driver_pins, '[]'::jsonb) AS driver_pins
    FROM top_creators tc
    LEFT JOIN driver_pins_agg dpa ON dpa.competitor_id = tc.id
    ORDER BY 
      GREATEST(tc.effective_delta_reach_24h, tc.effective_delta_views_24h) DESC,
      tc.monthly_reach DESC;
  `;
}

/**
 * Query 5: PinArchive 24h Winners & Domain Arbitrage Leaders
 */
async function queryWinnersAndDomains(sql) {
  const [paWinners, domainRollups] = await Promise.all([
    sql`
      SELECT
        pa.pin_id,
        pa.account_username,
        pa.title,
        pa.description,
        pa.link,
        pa.domain,
        pa.board_name,
        pa.image_url,
        COALESCE(pa.dominant_color, '#888888') AS dominant_color,
        COALESCE(pa.saves, 0) AS saves,
        COALESCE(pa.repins, 0) AS repins,
        COALESCE(pa.comments, 0) AS comments,
        COALESCE(pa.velocity, 0) AS velocity,
        COALESCE(pa.annotations, '[]'::jsonb) AS annotations,
        pa.created_at_pinterest,
        pa.first_seen_at,
        pa.last_updated_at
      FROM pa_pins pa
      WHERE (pa.velocity > 0 OR pa.saves >= 100)
      ORDER BY pa.velocity DESC, pa.saves DESC
      LIMIT 100;
    `,
    sql`
      SELECT
        dir.domain,
        COALESCE(dir.total_pins, 0) AS total_pins,
        COALESCE(dir.unique_urls, 1) AS unique_urls,
        COALESCE(dir.active_serp_pins, 0) AS active_serp_pins,
        COALESCE(dir.top3_pins, 0) AS top3_pins,
        COALESCE(dir.top10_pins, 0) AS top10_pins,
        COALESCE(dir.displaced_pins, 0) AS displaced_pins,
        dir.best_rank,
        dir.avg_rank,
        COALESCE(dir.visibility_score, 0) AS visibility_score,
        COALESCE(dir.total_saves, 0) AS total_saves,
        COALESCE(dir.avg_saves, 0) AS avg_saves,
        COALESCE(dir.total_repins, 0) AS total_repins,
        COALESCE(dir.avg_velocity, 0) AS avg_velocity,
        COALESCE(dir.pins_per_url, 1.0) AS pins_per_url,
        COALESCE(dir.accounts_count, 1) AS accounts_count,
        COALESCE(dir.sample_accounts, '[]'::jsonb) AS sample_accounts,
        COALESCE(dir.ad_network, 'unchecked') AS ad_network,
        COALESCE(dir.age_days, 0) AS age_days,
        dir.age_years,
        COALESCE(dir.arbitrage_score, 0) AS arbitrage_score
      FROM domain_intelligence_rollup dir
      WHERE (dir.avg_velocity > 0 OR dir.arbitrage_score > 0)
      ORDER BY dir.arbitrage_score DESC, dir.avg_velocity DESC
      LIMIT 30;
    `
  ]);
  return { paWinners, domainRollups };
}

/**
 * Checks whether a pin title is synthetic or low-signal placeholder
 */
function isSyntheticGarbageTitle(title) {
  if (!title || typeof title !== 'string') return true;
  const t = title.trim().toLowerCase();
  if (t.length < 5) return true;
  if (t === 'untitled' || t.startsWith('untitled pin') || t === 'pin' || t === 'pinterest pin') return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

/**
 * Merges and ratchets a pin row into pinMap across Active SERP, Displaced Vault, and Creator Viral feeds.
 * Ensures highest save_count, velocities, longest non-synthetic title, alt_text, description, and unioned annotations.
 */
function mergePinIntoMap(pinMap, row, sourceTag, keywordFoldersMap = null) {
  const pid = String(row.pin_id);

  const rawSaves = row.save_count ?? row.saves;
  const rowSaves = (typeof rawSaves === 'number') ? rawSaves : fastNum(rawSaves);
  const rawRepins = row.repin_count ?? row.repins;
  const rowRepins = (typeof rawRepins === 'number') ? rawRepins : fastNum(rawRepins);
  const rawVel = row.daily_save_velocity ?? row.velocity;
  const rowVel = (typeof rawVel === 'number') ? rawVel : fastNum(rawVel);
  const rowDeltaSaves = (typeof row.delta_saves_24h === 'number') ? row.delta_saves_24h : fastNum(row.delta_saves_24h);
  const rowDeltaRepins = (typeof row.delta_repins_24h === 'number') ? row.delta_repins_24h : fastNum(row.delta_repins_24h);

  const rowGains5d = (typeof row.gains_5d === 'number') ? row.gains_5d : (row.gains_5d ? fastNum(row.gains_5d) : 0);
  const rowGains7d = (typeof row.gains_7d === 'number') ? row.gains_7d : (row.gains_7d ? fastNum(row.gains_7d) : 0);
  const rowGains10d = (typeof row.gains_10d === 'number') ? row.gains_10d : (row.gains_10d ? fastNum(row.gains_10d) : 0);
  const rowGains15d = (typeof row.gains_15d === 'number') ? row.gains_15d : (row.gains_15d ? fastNum(row.gains_15d) : 0);
  const rowUrlGlobalSaves = (typeof row.url_global_saves === 'number') ? row.url_global_saves : (row.url_global_saves ? fastNum(row.url_global_saves) : 0);

  const rawAnns = row.visual_annotations || row.annotations;
  const rowCleanAnns = (rawAnns && rawAnns.length > 0) ? extractCleanAnnotations(rawAnns) : null;

  let p = pinMap.get(pid);
  if (!p) {
    p = {
      pin_id: pid,
      title: row.title || '',
      domain: row.domain || '',
      destination_url: row.destination_url || row.link || '',
      image_url: row.image_url || '',
      creator_username: row.creator_username || row.account_username || '',
      board_name: row.board_name || '',
      dominant_color: row.dominant_color || '#888888',
      save_count: rowSaves,
      repin_count: rowRepins,
      daily_save_velocity: rowVel,
      delta_saves_24h: rowDeltaSaves,
      delta_repins_24h: rowDeltaRepins,
      gains_5d: rowGains5d,
      gains_7d: rowGains7d,
      gains_10d: rowGains10d,
      gains_15d: rowGains15d,
      url_global_saves: rowUrlGlobalSaves,
      description: row.description || '',
      alt_text: row.alt_text || '',
      cleanAnnotations: rowCleanAnns || [],
      created_at_pinterest: row.created_at_pinterest || null,
      creation_method: row.creation_method || 'pinterest_platform',
      crawled_at: row.crawled_at || null,
      keywords: [],
      folderList: [],
      sources: [sourceTag],
      best_rank: safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank),
      best_prev_rank: safeNullableNum(row.prev_rank_position)
    };
    pinMap.set(pid, p);
  } else {
    if (!p.sources.includes(sourceTag)) {
      p.sources.push(sourceTag);
    }
    // Ratchet telemetry
    if (rowSaves > p.save_count) p.save_count = rowSaves;
    if (rowRepins > p.repin_count) p.repin_count = rowRepins;
    if (rowVel > p.daily_save_velocity) p.daily_save_velocity = rowVel;
    if (rowDeltaSaves > p.delta_saves_24h) p.delta_saves_24h = rowDeltaSaves;
    if (rowDeltaRepins > p.delta_repins_24h) p.delta_repins_24h = rowDeltaRepins;
    if (rowGains5d > p.gains_5d) p.gains_5d = rowGains5d;
    if (rowGains7d > p.gains_7d) p.gains_7d = rowGains7d;
    if (rowGains10d > p.gains_10d) p.gains_10d = rowGains10d;
    if (rowGains15d > p.gains_15d) p.gains_15d = rowGains15d;
    if (rowUrlGlobalSaves > p.url_global_saves) p.url_global_saves = rowUrlGlobalSaves;

    // Prefer longest, non-empty, non-synthetic title
    if ((!p.title || isSyntheticGarbageTitle(p.title)) && row.title && !isSyntheticGarbageTitle(row.title)) {
      p.title = row.title;
    } else if (row.title && !isSyntheticGarbageTitle(row.title) && row.title.length > (p.title || '').length) {
      p.title = row.title;
    }

    if (!p.image_url && row.image_url) p.image_url = row.image_url;
    if (!p.domain && row.domain) p.domain = row.domain;
    if (!p.destination_url && row.destination_url) p.destination_url = row.destination_url;
    if (!p.creator_username && row.creator_username) p.creator_username = row.creator_username;
    if (!p.board_name && row.board_name) p.board_name = row.board_name;
    if (!p.description && row.description) p.description = row.description;
    else if (row.description && row.description.length > (p.description || '').length) p.description = row.description;
    if (!p.alt_text && row.alt_text) p.alt_text = row.alt_text;
    else if (row.alt_text && row.alt_text.length > (p.alt_text || '').length) p.alt_text = row.alt_text;

    if (p.dominant_color === '#888888' && row.dominant_color && row.dominant_color !== '#888888') {
      p.dominant_color = row.dominant_color;
    }

    if (!p.created_at_pinterest && row.created_at_pinterest) {
      p.created_at_pinterest = row.created_at_pinterest;
    }

    // Union clean annotations (zero Set allocation)
    if (rowCleanAnns && rowCleanAnns.length > 0) {
      for (let i = 0; i < rowCleanAnns.length; i++) {
        const ann = rowCleanAnns[i];
        let exists = false;
        for (let j = 0; j < p.cleanAnnotations.length; j++) {
          if (p.cleanAnnotations[j].norm === ann.norm) { exists = true; break; }
        }
        if (!exists) {
          p.cleanAnnotations.push(ann);
        }
      }
    }
  }

  const kid = row.keyword_id ? fastNum(row.keyword_id) : null;
  const fList = (Array.isArray(row.folders) && row.folders.length > 0)
    ? row.folders
    : (kid && keywordFoldersMap?.get(kid)) || null;
  if (fList && fList.length > 0) {
    for (let i = 0; i < fList.length; i++) {
      const f = fList[i];
      const fid = safeNullableNum(f?.folder_id);
      if (fid != null) {
        let seenFolder = false;
        for (let fi = 0; fi < p.folderList.length; fi++) {
          if (p.folderList[fi].folder_id === fid) { seenFolder = true; break; }
        }
        if (!seenFolder) {
          p.folderList.push(f);
        }
      }
    }
  }

  if (row.keyword_id && row.keyword_text) {
    let existingKw = null;
    for (let i = 0; i < p.keywords.length; i++) {
      if (p.keywords[i].keyword_id === kid) {
        existingKw = p.keywords[i];
        break;
      }
    }
    const rp = safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank);
    const prp = safeNullableNum(row.prev_rank_position);
    const folderName = (fList && fList.length > 0) ? (fList[0]?.folder_name || '') : '';
    if (!existingKw) {
      p.keywords.push({
        keyword_id: kid,
        keyword_text: row.keyword_text || '',
        keyword_category: row.keyword_category || 'General',
        rank_position: rp,
        prev_rank_position: prp,
        folder_name: folderName
      });
    } else if (!existingKw.folder_name && folderName) {
      existingKw.folder_name = folderName;
    }
    if (rp != null) {
      if (p.best_rank === null || rp < p.best_rank) p.best_rank = rp;
    }
    if (prp != null) {
      if (p.best_prev_rank === null || prp < p.best_prev_rank) p.best_prev_rank = prp;
    }
  }

  return p;
}

/**
 * Main Service Function: getGlobal24hPulseService
 */
export async function getGlobal24hPulseService(sql, env, options = {}) {
  const folderId = options.folderId || options.folder_id || 'all';
  const windowParam = String(options.window || '24h').toLowerCase();
  const forceRefresh = Boolean(options.forceRefresh || options.force_refresh);
  const minAudience = Number(options.minAudience || options.min_audience || 0);
  const ctx = options.ctx || null;
  const bypassCache = Boolean(options.bypassCache || options.skipCache);
  const testId = options.testId ? String(options.testId).trim() : '';

  const parsedFolderId = (folderId && folderId !== 'all') ? Number(folderId) : null;
  const folderIdNum = Number.isFinite(parsedFolderId) ? parsedFolderId : null;
  const cacheKey = options.cacheKey || (
    testId
      ? `pulse:${folderId || 'all'}:${windowParam}:${minAudience}:${testId}`
      : `pulse:${folderId || 'all'}:${windowParam}:${minAudience}`
  );

  const now = Date.now();
  let effectiveRefresh = forceRefresh;
  if (!bypassCache && effectiveRefresh) {
    const lastRefresh = pulseForceRefreshCooldown.get(cacheKey);
    if (lastRefresh && (now - lastRefresh < PULSE_FORCE_REFRESH_COOLDOWN_MS)) {
      effectiveRefresh = false;
    }
  }

  // 1. Process-local Memory Cache Check
  if (!bypassCache && !effectiveRefresh && pulseMemoryCache.has(cacheKey)) {
    const cached = pulseMemoryCache.get(cacheKey);
    if (now - cached.timestamp <= PULSE_MEMORY_TTL_MS) {
      return cached.payload;
    }
  }

  if (!bypassCache && effectiveRefresh) {
    pulseForceRefreshCooldown.set(cacheKey, now);
    pulseMemoryCache.delete(cacheKey);
  }

  // 2. Cloudflare Workers KV Cache Check (for default summary view)
  const isDefaultFilter = (!folderIdNum) && (windowParam === '24h') && (minAudience === 0);
  if (!bypassCache && isDefaultFilter && !effectiveRefresh && env?.PIN_ENGINE_KV) {
    try {
      const kvCached = await env.PIN_ENGINE_KV.get('pulse:global_24h:summary', { type: 'json' });
      if (kvCached) {
        setPulseMemoryCache(cacheKey, kvCached);
        return kvCached;
      }
    } catch (_) {}
  }

  // 3. In-Flight Stampede Guard
  if (!bypassCache && inflightPulse.has(cacheKey)) {
    return await inflightPulse.get(cacheKey);
  }

  let computePromise;
  computePromise = (async () => {
    // 4. Concurrent Execution of 6 Hub Queries (including viral creator pins)
    const [
      activeSerpRows,
      vaultData,
      guidedCapsuleRows,
      creatorBreakoutRows,
      winnerData,
      creatorViralRows
    ] = await Promise.all([
      queryActiveSerp(sql, folderIdNum),
      queryVaultAndVacuum(sql, folderIdNum, env),
      queryGuidedCapsules(sql, folderIdNum),
      queryBreakoutCreators(sql, folderIdNum),
      queryWinnersAndDomains(sql),
      queryViralCreatorPins(sql, folderIdNum).catch(() => [])
    ]);

    const { vacuumRows, vaultPins } = vaultData;
    const { paWinners, domainRollups } = winnerData;

    // Vacuum Keyword Map for rapid lookup
    const vacuumKwMap = new Map();
    for (let i = 0; i < vacuumRows.length; i++) {
      const v = vacuumRows[i];
      vacuumKwMap.set(Number(v.keyword_id), v);
    }

    // 5. Unified Cross-Table Merge into pinMap (Active SERP + Displaced Vault + Creator Viral)
    const pinMap = new Map();
    const keywordPinStats = new Map();
    const keywordFoldersMap = new Map();

    for (const row of activeSerpRows) {
      const pid = String(row.pin_id);
      const kid = Number(row.keyword_id);

      if (kid && Array.isArray(row.folders) && row.folders.length > 0 && !keywordFoldersMap.has(kid)) {
        keywordFoldersMap.set(kid, row.folders);
      }

      // Aggregate keyword stats
      let kwStats = keywordPinStats.get(kid);
      if (!kwStats) {
        kwStats = {
          keyword_id: kid,
          keyword_text: row.keyword_text || '',
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        };
        keywordPinStats.set(kid, kwStats);
      }
      kwStats.active_pins_count++;
      const rowVel = (typeof row.daily_save_velocity === 'number') ? row.daily_save_velocity : fastNum(row.daily_save_velocity);
      kwStats.total_velocity += rowVel;
      if (!kwStats.top_pin || rowVel > kwStats.top_pin.daily_save_velocity) {
        kwStats.top_pin = {
          pin_id: pid,
          title: row.title || '',
          image_url: row.image_url || '',
          save_count: (typeof row.save_count === 'number') ? row.save_count : fastNum(row.save_count),
          daily_save_velocity: rowVel
        };
      }

      mergePinIntoMap(pinMap, row, 'active_serp', keywordFoldersMap);
    }

    // Merge Displaced Vault Surges (top 250) into unified surge pool
    for (const vp of vaultPins) {
      mergePinIntoMap(pinMap, vp, 'vault_surge', keywordFoldersMap);
    }

    // Merge Creator Viral Pins (top 150) into unified surge pool
    for (const cp of (creatorViralRows || [])) {
      mergePinIntoMap(pinMap, cp, 'creator_feed', keywordFoldersMap);
    }

    // Merge Top 100 Qualified PinArchive Winners into unified surge pool [Round 16 Gate 5.3]
    for (const pa of (paWinners || [])) {
      mergePinIntoMap(pinMap, pa, 'pinarchive_winner', keywordFoldersMap);
    }

    // 6. Process Merged Pins, Compute Unified 24h Velocity & Extract N-Grams
    const allActivePins = [];
    const paPinsList = [];
    let totalSavesVelocity = 0;
    let totalRepinsDelta = 0;
    let pinsGainingCount = 0;
    let freshRocketCount = 0;
    let bridgePinsCount = 0;

    // N-Gram mining storage
    const singleTagMap = new Map();
    const boardStatsMap = new Map();
    const colorStatsMap = new Map();
    const creationMethodMap = new Map();

    const nowMs = Date.now();

    for (const p of pinMap.values()) {
      if (p.sources.includes('pinarchive_winner')) {
        paPinsList.push(p);
      }
      const overlapCount = p.keywords.length;
      if (overlapCount >= 2) bridgePinsCount++;

      const folders = p.folderList;
      const folderOverlapCount = folders.length;
      const bestRank = p.best_rank;
      const rankClimb24h = (p.best_prev_rank != null && bestRank != null) ? (p.best_prev_rank - bestRank) : 0;

      // Calculate Age
      let pinAgeDays = null;
      if (p.created_at_pinterest) {
        const createdMs = fastParseIsoDateMs(p.created_at_pinterest);
        if (Number.isFinite(createdMs) && createdMs <= nowMs) {
          pinAgeDays = Math.floor((nowMs - createdMs) / 86400000);
        }
      }
      const isFresh14d = pinAgeDays !== null ? (pinAgeDays <= 14) : false;
      const isFresh30d = pinAgeDays !== null ? (pinAgeDays <= 30) : false;

      // Unified 24h Velocity & Effective Gain [Fix 2.1 SSOT: Math.max()]
      const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = (effectiveSaves24h > effectiveRepins24h) ? effectiveSaves24h : effectiveRepins24h;
      p.effective_24h_gain = effective24hGain;

      // Windowed Momentum Calculation (never suppressed to 0 if 24h deltas are positive)
      let effectiveMomentum = effective24hGain;
      if (windowParam === '5d') effectiveMomentum = (effective24hGain > p.gains_5d) ? effective24hGain : p.gains_5d;
      else if (windowParam === '7d') effectiveMomentum = (effective24hGain > p.gains_7d) ? effective24hGain : p.gains_7d;
      else if (windowParam === '15d') effectiveMomentum = (effective24hGain > p.gains_15d) ? effective24hGain : p.gains_15d;
      else {
        const momFallback = p.daily_save_velocity + (p.delta_repins_24h * 0.5);
        effectiveMomentum = (momFallback > effective24hGain) ? momFallback : effective24hGain;
      }

      const dailyAvg7d = (p.gains_7d > 7) ? (p.gains_7d / 7) : 1;
      const rawRatio = (effective24hGain || p.daily_save_velocity) / dailyAvg7d;
      const accelerationRatio = Math.round(rawRatio * 100) / 100;
      const isAccelerating = accelerationRatio >= 1.5;

      const urlLeverageRatio = (p.url_global_saves > 0 && p.save_count > 0)
        ? Math.round((p.url_global_saves / p.save_count) * 100) / 100
        : 1.0;

      // True Domainless Viral Pins: true ONLY when no authentic external domain [Fix 2.5 SSOT]
      const isDomainless = Boolean(
        !p.domain ||
        p.domain === 'Uploaded by user' ||
        p.domain.includes('pinterest.') ||
        !p.destination_url
      );
      p.is_domainless_viral = isDomainless;

      // Vacuum Target Check
      let isVacuumHijackTarget = false;
      for (let i = 0; i < p.keywords.length; i++) {
        const vInfo = vacuumKwMap.get(p.keywords[i].keyword_id);
        if (vInfo && vInfo.displaced_top10_24h_count > 0) {
          if (bestRank != null && (bestRank <= 15 || effective24hGain > 0 || rankClimb24h > 0)) {
            isVacuumHijackTarget = true;
            break;
          }
        }
      }

      totalSavesVelocity += effectiveSaves24h;
      totalRepinsDelta += p.delta_repins_24h;
      if (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0) pinsGainingCount++;
      if (isFresh14d && (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0)) freshRocketCount++;

      // Clean annotations is already guaranteed normalized on p
      const cleanAnnotations = p.cleanAnnotations;

      // Augment p in-place
      p.pin_age_days = pinAgeDays;
      p.is_fresh_14d = isFresh14d;
      p.is_fresh_30d = isFresh30d;
      p.effective_24h_momentum = Math.round(effectiveMomentum * 100) / 100;
      p.acceleration_ratio = accelerationRatio;
      p.is_accelerating = isAccelerating;
      p.overlap_count = overlapCount;
      p.folder_overlap_count = folderOverlapCount;
      p.best_rank = bestRank;
      p.rank_climb_24h = rankClimb24h;
      p.is_vacuum_hijack_target = isVacuumHijackTarget;
      p.cleanAnnotations = cleanAnnotations;
      p.folders = folders;
      p.url_leverage_ratio = urlLeverageRatio;
      p.keyword_text = p.keywords[0]?.keyword_text || '';
      p.is_hydrated = Boolean(p.image_url || (p.title && !isSyntheticGarbageTitle(p.title)));
      p.is_hydrated_int = p.is_hydrated ? 1 : 0;

      allActivePins.push(p);

      // 1-Gram (single_annotations) - capped at top 6 tags
      const numTags = Math.min(cleanAnnotations.length, 6);
      for (let ti = 0; ti < numTags; ti++) {
        const tag = cleanAnnotations[ti];
        let st = singleTagMap.get(tag.norm);
        if (!st) {
          st = {
            tag_norm: tag.norm,
            tag_display: tag.display,
            pin_count: 0,
            kwIds: [],
            total_velocity: 0,
            total_24h_gain: 0,
            total_saves: 0,
            total_repins_delta: 0,
            sample_pins: [],
            matchingPins: []
          };
          singleTagMap.set(tag.norm, st);
        }
        st.pin_count++;
        st.total_velocity += p.daily_save_velocity;
        st.total_24h_gain += effective24hGain;
        st.total_saves += p.save_count;
        st.total_repins_delta += p.delta_repins_24h;
        if (st.kwIds.length < 4) {
          for (let ki = 0; ki < p.keywords.length; ki++) {
            const kw = p.keywords[ki];
            if (!st.kwIds.includes(kw.keyword_id)) {
              st.kwIds.push(kw.keyword_id);
              if (st.kwIds.length >= 4) break;
            }
          }
        }
        if (st.matchingPins.length < 4) {
          let exists = false;
          for (let mpi = 0; mpi < st.matchingPins.length; mpi++) {
            if (st.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
          }
          if (!exists) st.matchingPins.push(p);
        }
      }

      // Board Telemetry
      const cleanBoard = p.board_name;
      if (cleanBoard && cleanBoard !== 'unknown') {
        let bEntry = boardStatsMap.get(cleanBoard);
        if (!bEntry) {
          bEntry = {
            board_name: cleanBoard,
            creator_username: p.creator_username || '',
            pin_count: 0,
            total_velocity: 0,
            total_saves: 0,
            sample_pins: []
          };
          boardStatsMap.set(cleanBoard, bEntry);
        }
        bEntry.pin_count++;
        bEntry.total_velocity += p.daily_save_velocity;
        bEntry.total_saves += p.save_count;
        if (bEntry.sample_pins.length < 2) {
          bEntry.sample_pins.push({
            pin_id: p.pin_id,
            title: p.title,
            image_url: p.image_url
          });
        }
      }

      // Dominant Color Telemetry
      const colorHex = p.dominant_color || '#888888';
      let cEntry = colorStatsMap.get(colorHex);
      if (!cEntry) {
        cEntry = { color: colorHex, pin_count: 0, total_velocity: 0, sample_pins: [] };
        colorStatsMap.set(colorHex, cEntry);
      }
      cEntry.pin_count++;
      cEntry.total_velocity += p.daily_save_velocity;
      if (cEntry.sample_pins.length < 2) {
        cEntry.sample_pins.push({
          pin_id: p.pin_id,
          title: p.title,
          image_url: p.image_url
        });
      }

      // Creation Method Telemetry
      const cm = p.creation_method || 'pinterest_platform';
      let cmEntry = creationMethodMap.get(cm);
      if (!cmEntry) {
        cmEntry = { method: cm, pin_count: 0, total_velocity: 0 };
        creationMethodMap.set(cm, cmEntry);
      }
      cmEntry.pin_count++;
      cmEntry.total_velocity += p.daily_save_velocity;
    }

    // Sort All Active Pins by Hydration Status, Unified 24h Gain then Momentum
    allActivePins.sort(activePinSortComparator);

    // Single consolidated D1 edge metadata hydration for top 100 pins missing description/alt_text
    if (env?.PIN_D1_DB && allActivePins.length > 0) {
      try {
        const topPinsNeedingHydration = allActivePins
          .slice(0, 100)
          .filter(p => !p.description || !p.alt_text)
          .map(p => p.pin_id);
        if (topPinsNeedingHydration.length > 0) {
          const d1Map = await hydratePinsFromD1(env, topPinsNeedingHydration);
          if (d1Map && typeof d1Map.get === 'function') {
            for (const p of allActivePins.slice(0, 100)) {
              const d1 = d1Map.get(p.pin_id);
              if (d1) {
                if (!p.title && d1.title) p.title = d1.title;
                if (!p.image_url && d1.image_url) p.image_url = d1.image_url;
                if (!p.description && d1.description) p.description = d1.description;
                if (!p.alt_text && (d1.alt_text || d1.seo_alt_text)) p.alt_text = d1.alt_text || d1.seo_alt_text;
                if ((!p.cleanAnnotations || p.cleanAnnotations.length === 0) && d1.visual_annotations) {
                  p.cleanAnnotations = extractCleanAnnotations(d1.visual_annotations);
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    // Build inverted index maps from sorted allActivePins for O(1) matching_pins lookup
    const keywordIdToPinsMap = new Map();
    const tagNormToPinsMap = new Map();
    const topPinsForIndex = Math.min(allActivePins.length, 300);
    for (let pi = 0; pi < topPinsForIndex; pi++) {
      const p = allActivePins[pi];
      for (let ki = 0; ki < p.keywords.length; ki++) {
        const kw = p.keywords[ki];
        let kwPins = keywordIdToPinsMap.get(kw.keyword_id);
        if (!kwPins) {
          kwPins = [];
          keywordIdToPinsMap.set(kw.keyword_id, kwPins);
        }
        if (kwPins.length < 4) kwPins.push(p);
      }
      const numAnns = Math.min(p.cleanAnnotations.length, 4);
      for (let ti = 0; ti < numAnns; ti++) {
        const tag = p.cleanAnnotations[ti];
        let tagPins = tagNormToPinsMap.get(tag.norm);
        if (!tagPins) {
          tagPins = [];
          tagNormToPinsMap.set(tag.norm, tagPins);
        }
        if (tagPins.length < 4) tagPins.push(p);
      }
    }

    // High-Momentum Candidate Pins for 2-Pair and 3-Triplet Crossover Mining (top 40 surging pins, max 4 tags) [Round 16]
    const candidatePins = [];
    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      if (p.cleanAnnotations && p.cleanAnnotations.length > 0) {
        candidatePins.push(p);
        if (candidatePins.length >= 40) break;
      }
    }
    const pairTagMap = new Map();
    const tripletTagMap = new Map();

    for (const p of candidatePins) {
      const rawTags = p.cleanAnnotations;
      if (!rawTags || rawTags.length < 2) continue;
      const sortedTags = (rawTags.length > 4 ? rawTags.slice(0, 4) : [...rawTags]).sort(tagNormAscComparator);
      const K = sortedTags.length;
      if (K < 2) continue;

      // 2-Pairs (A + B)
      for (let i = 0; i < K - 1; i++) {
        for (let j = i + 1; j < K; j++) {
          const tA = sortedTags[i];
          const tB = sortedTags[j];
          const pairKey = `${tA.norm} +++ ${tB.norm}`;
          let pt = pairTagMap.get(pairKey);
          if (!pt) {
            pt = {
              tag_a_norm: tA.norm,
              tag_a_display: tA.display,
              tag_b_norm: tB.norm,
              tag_b_display: tB.display,
              crossover_label: `${tA.display} + ${tB.display}`,
              pin_count: 0,
              kwIds: [],
              total_velocity: 0,
              total_24h_gain: 0,
              total_saves: 0,
              total_repins_delta: 0,
              sample_pins: [],
              matchingPins: []
            };
            pairTagMap.set(pairKey, pt);
          }
          pt.pin_count++;
          pt.total_velocity += p.daily_save_velocity;
          pt.total_24h_gain += (p.effective_24h_gain || p.daily_save_velocity);
          pt.total_saves += p.save_count;
          pt.total_repins_delta += p.delta_repins_24h;
          if (pt.kwIds.length < 6) {
            for (const kw of p.keywords) {
              if (!pt.kwIds.includes(kw.keyword_id)) {
                pt.kwIds.push(kw.keyword_id);
                if (pt.kwIds.length >= 6) break;
              }
            }
          }
          if (pt.matchingPins.length < 6) {
            let exists = false;
            for (let mpi = 0; mpi < pt.matchingPins.length; mpi++) {
              if (pt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
            }
            if (!exists) pt.matchingPins.push(p);
          }
        }
      }

      // 3-Triplets (A + B + C)
      for (let i = 0; i < K - 2; i++) {
        for (let j = i + 1; j < K - 1; j++) {
          for (let k = j + 1; k < K; k++) {
            const tA = sortedTags[i];
            const tB = sortedTags[j];
            const tC = sortedTags[k];
            const tripKey = `${tA.norm} +++ ${tB.norm} +++ ${tC.norm}`;
            let tt = tripletTagMap.get(tripKey);
            if (!tt) {
              tt = {
                tag_a_norm: tA.norm,
                tag_a_display: tA.display,
                tag_b_norm: tB.norm,
                tag_b_display: tB.display,
                tag_c_norm: tC.norm,
                tag_c_display: tC.display,
                crossover_label: `${tA.display} + ${tB.display} + ${tC.display}`,
                pin_count: 0,
                kwIds: [],
                total_velocity: 0,
                total_24h_gain: 0,
                total_saves: 0,
                total_repins_delta: 0,
                sample_pins: [],
                matchingPins: []
              };
              tripletTagMap.set(tripKey, tt);
            }
            tt.pin_count++;
            tt.total_velocity += p.daily_save_velocity;
            tt.total_24h_gain += (p.effective_24h_gain || p.daily_save_velocity);
            tt.total_saves += p.save_count;
            tt.total_repins_delta += p.delta_repins_24h;
            if (tt.kwIds.length < 6) {
              for (const kw of p.keywords) {
                if (!tt.kwIds.includes(kw.keyword_id)) {
                  tt.kwIds.push(kw.keyword_id);
                  if (tt.kwIds.length >= 6) break;
                }
              }
            }
            if (tt.matchingPins.length < 6) {
              let exists = false;
              for (let mpi = 0; mpi < tt.matchingPins.length; mpi++) {
                if (tt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
              }
              if (!exists) tt.matchingPins.push(p);
            }
          }
        }
      }
    }

    // Helper to format rich pin summary with dual aliasing and full dossier properties [Fix 2.2 SSOT]
    // Memoized on p._summary [Round 16 CPU & Memory Optimization]
    const formatPinSummary = (p) => {
      if (p._summary) return p._summary;
      const cleanAnns = p.cleanAnnotations || [];
      const annSlice = cleanAnns.length > 6 ? cleanAnns.slice(0, 6) : cleanAnns;
      const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = Number.isFinite(p.effective_24h_gain)
        ? p.effective_24h_gain
        : (effectiveSaves24h > effectiveRepins24h ? effectiveSaves24h : effectiveRepins24h);

      const isDomainless = Boolean(
        !p.domain ||
        p.domain === 'Uploaded by user' ||
        p.domain.includes('pinterest.') ||
        !p.destination_url
      );

      const primaryKw = (p.keywords && p.keywords[0]) ? p.keywords[0] : null;
      const kwText = p.keyword_text || primaryKw?.keyword_text || '';
      const kwId = primaryKw?.keyword_id ?? (p.keyword_id ?? null);
      const kwSlug = p.keyword_slug || getKeywordSlug(kwText, kwId);
      const rankPosition = primaryKw?.rank_position ?? p.best_rank ?? null;
      const isVaultSurge = Boolean(p.sources && p.sources.includes('vault_surge'));
      const isDisplaced = Boolean(isVaultSurge || (p.sources && p.sources.includes('displaced')) || p.is_displaced);

      const summary = {
        pin_id: String(p.pin_id),
        dossier_url: '/pin/' + encodeURIComponent(p.pin_id),
        pinterest_url: 'https://www.pinterest.com/pin/' + encodeURIComponent(p.pin_id) + '/',
        title: p.title || '',
        description: (p.description || '').slice(0, 80),
        alt_text: (p.alt_text || '').slice(0, 60),
        visual_annotations: annSlice,
        annotations: annSlice, // Aliased to identical array [Fix 2.2 Gate 1 SSOT]
        keywords: (p.keywords || []).slice(0, 2).map(k => ({
          keyword_id: k.keyword_id,
          keyword: k.keyword_text || '',
          keyword_text: k.keyword_text || '',
          rank: k.rank_position,
          rank_position: k.rank_position,
          folder_name: k.folder_name || ''
        })),
        domain: p.domain || '',
        destination_url: p.destination_url || '',
        image_url: p.image_url || '',
        creator_username: p.creator_username || '',
        board_name: p.board_name || '',
        dominant_color: p.dominant_color || '#888888',
        save_count: p.save_count,
        repin_count: p.repin_count,
        daily_save_velocity: p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h,
        delta_saves_24h: p.delta_saves_24h,
        delta_repins_24h: p.delta_repins_24h,
        effective_24h_gain: effective24hGain,
        pin_age_days: p.pin_age_days ?? null,
        is_fresh_14d: Boolean(p.is_fresh_14d),
        is_fresh_30d: Boolean(p.is_fresh_30d),
        is_fresh_breakout: Boolean(p.is_fresh_14d && effective24hGain > 0),
        is_pixie_bridge: ((p.keywords && p.keywords.length) || 0) >= 2,
        is_domainless_viral: isDomainless,
        is_vacuum_keyword_pin: Boolean(p.is_vacuum_hijack_target),
        sources: p.sources || ['active_serp'],
        creation_method: p.creation_method || 'pinterest_platform',
        created_at_pinterest: p.created_at_pinterest || null,

        // Root properties for UI links and badges [Round 16 Gate 4.1]
        keyword_id: kwId,
        keyword_slug: kwSlug,
        keyword_text: kwText,
        rank_position: rankPosition,
        is_vault_surge: isVaultSurge,
        is_displaced: isDisplaced,

        // Backward-compatibility keys
        effective_24h_momentum: Number.isFinite(p.effective_24h_momentum) ? p.effective_24h_momentum : effective24hGain,
        acceleration_ratio: p.acceleration_ratio || 1.0,
        is_accelerating: Boolean(p.is_accelerating),
        overlap_count: p.overlap_count ?? (p.keywords ? p.keywords.length : 0),
        folder_overlap_count: p.folder_overlap_count ?? (p.folders ? p.folders.length : 0),
        keyword_count: p.overlap_count ?? (p.keywords ? p.keywords.length : 0),
        folder_count: p.folder_overlap_count ?? (p.folders ? p.folders.length : 0),
        best_rank: p.best_rank ?? null,
        rank_climb_24h: p.rank_climb_24h ?? 0,
        url_global_saves: p.url_global_saves,
        url_leverage_ratio: p.url_leverage_ratio || 1.0,
        folders: [],
        gains_5d: p.gains_5d,
        gains_7d: p.gains_7d,
        gains_10d: p.gains_10d,
        gains_15d: p.gains_15d
      };
      p._summary = summary;
      return summary;
    };

    // Lightweight Memoized Matrix Pin Summary (for drill-downs & matching pins, 15 properties) [Round 16]
    const formatMatrixPinSummary = (p) => {
      if (p._matrixSummary) return p._matrixSummary;
      const cleanAnns = p.cleanAnnotations || [];
      const annSlice = cleanAnns.length > 3 ? cleanAnns.slice(0, 3) : cleanAnns;
      const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = Number.isFinite(p.effective_24h_gain)
        ? p.effective_24h_gain
        : (effectiveSaves24h > effectiveRepins24h ? effectiveSaves24h : effectiveRepins24h);

      const matrixSummary = {
        pin_id: String(p.pin_id),
        title: p.title || '',
        description: (p.description || '').slice(0, 60),
        alt_text: (p.alt_text || '').slice(0, 50),
        image_url: p.image_url || '',
        destination_url: p.destination_url || '',
        domain: p.domain || '',
        save_count: p.save_count,
        repin_count: p.repin_count,
        daily_save_velocity: p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h,
        delta_saves_24h: p.delta_saves_24h,
        delta_repins_24h: p.delta_repins_24h,
        effective_24h_gain: effective24hGain,
        pin_age_days: p.pin_age_days ?? null,
        visual_annotations: annSlice,
        annotations: annSlice,
        dossier_url: '/pin/' + encodeURIComponent(p.pin_id)
      };
      p._matrixSummary = matrixSummary;
      return matrixSummary;
    };

    // Unified Breakout Pins Feed (Hydrated pins first up to 100, then unhydrated skeletons up to 10) [Round 16 Gate 5.2 & Gate 5.3]
    const seenBreakoutIds = new Set();
    const breakoutPinsTop250 = [];

    const hydratedPins = [];
    const skeletonPins = [];
    const freshRocketCandidates = [];
    const vacuumHijackCandidates = [];
    const domainlessViralCandidates = [];

    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      if (p.is_hydrated_int === 1) {
        if (hydratedPins.length < 80) hydratedPins.push(p);
      } else {
        if (skeletonPins.length < 10) skeletonPins.push(p);
      }
      if (freshRocketCandidates.length < 20 && p.is_fresh_14d && (p.effective_24h_gain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0)) {
        freshRocketCandidates.push(p);
      }
      if (vacuumHijackCandidates.length < 10 && p.is_vacuum_hijack_target) {
        vacuumHijackCandidates.push(p);
      }
      if (domainlessViralCandidates.length < 10 && p.is_domainless_viral && (p.effective_24h_gain > 0 || p.save_count >= 100)) {
        domainlessViralCandidates.push(p);
      }
    }

    for (let i = 0; i < hydratedPins.length; i++) {
      const p = hydratedPins[i];
      seenBreakoutIds.add(p.pin_id);
      breakoutPinsTop250.push(formatPinSummary(p));
    }

    for (let i = 0; i < paPinsList.length; i++) {
      const p = paPinsList[i];
      if (!seenBreakoutIds.has(p.pin_id)) {
        seenBreakoutIds.add(p.pin_id);
        breakoutPinsTop250.push(formatPinSummary(p));
        if (breakoutPinsTop250.length >= 100) break;
      }
    }

    for (let i = 0; i < skeletonPins.length; i++) {
      const p = skeletonPins[i];
      if (!seenBreakoutIds.has(p.pin_id)) {
        seenBreakoutIds.add(p.pin_id);
        breakoutPinsTop250.push(formatPinSummary(p));
      }
    }

    const freshRocketPinsTop50 = freshRocketCandidates.map(formatPinSummary);

    // Section 3: Format N-Gram Crossovers with Slicing FIRST & Hard Support Floor (pin_count >= 2) [Round 16]
    const singleAnnotations = Array.from(singleTagMap.values())
      .sort(gainThenCountDescComparator)
      .slice(0, 10)
      .map(t => {
        const matchingPins = (t.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: t.tag_display,
          display: t.tag_display,
          tag_norm: t.tag_norm,
          tag_display: t.tag_display,
          count: t.pin_count,
          pin_count: t.pin_count,
          keywords_count: t.kwIds.length,
          keyword_count: t.kwIds.length,
          total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
          velocity: Number(t.total_velocity.toFixed(2)),
          avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
          total_velocity: Number(t.total_velocity.toFixed(2)),
          repins_surge: t.total_repins_delta,
          delta_repins: t.total_repins_delta,
          total_repins_delta: t.total_repins_delta,
          total_saves: t.total_saves,
          matching_pins: matchingPins,
          sample_pins: matchingPins.slice(0, 2)
        };
      });

    const pairCrossovers = Array.from(pairTagMap.values())
      .filter(p => p.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
      .sort(gainThenCountDescComparator)
      .slice(0, 12)
      .map(p => {
        const matchingPins = (p.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: p.crossover_label,
          pair: p.crossover_label,
          crossover_label: p.crossover_label,
          tag_a_norm: p.tag_a_norm,
          tag_a_display: p.tag_a_display,
          tag_b_norm: p.tag_b_norm,
          tag_b_display: p.tag_b_display,
          count: p.pin_count,
          pin_count: p.pin_count,
          keywords_count: p.kwIds.length,
          keyword_count: p.kwIds.length,
          total_24h_gain: Number((p.total_24h_gain != null ? p.total_24h_gain : p.total_velocity).toFixed(2)),
          velocity: Number(p.total_velocity.toFixed(2)),
          avg_velocity: p.pin_count > 0 ? Number((p.total_velocity / p.pin_count).toFixed(2)) : 0,
          total_velocity: Number(p.total_velocity.toFixed(2)),
          repins_surge: p.total_repins_delta,
          delta_repins: p.total_repins_delta,
          total_repins_delta: p.total_repins_delta,
          total_saves: p.total_saves,
          matching_pins: matchingPins,
          sample_pins: matchingPins.slice(0, 2)
        };
      });

    const tripletCrossovers = Array.from(tripletTagMap.values())
      .filter(t => t.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
      .sort(gainThenCountDescComparator)
      .slice(0, 8)
      .map(t => {
        const matchingPins = (t.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: t.crossover_label,
          triplet: t.crossover_label,
          crossover_label: t.crossover_label,
          tag_a_norm: t.tag_a_norm,
          tag_a_display: t.tag_a_display,
          tag_b_norm: t.tag_b_norm,
          tag_b_display: t.tag_b_display,
          tag_c_norm: t.tag_c_norm,
          tag_c_display: t.tag_c_display,
          count: t.pin_count,
          pin_count: t.pin_count,
          keywords_count: t.kwIds.length,
          keyword_count: t.kwIds.length,
          total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
          velocity: Number(t.total_velocity.toFixed(2)),
          avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
          total_velocity: Number(t.total_velocity.toFixed(2)),
          repins_surge: t.total_repins_delta,
          delta_repins: t.total_repins_delta,
          total_repins_delta: t.total_repins_delta,
          total_saves: t.total_saves,
          matching_pins: matchingPins,
          sample_pins: matchingPins.slice(0, 2)
        };
      });

    // Section 4: Group Guided Search Capsules Crossovers (deduplicated by LOWER(TRIM(display_label)))
    const capsuleGroupMap = new Map();
    for (const c of guidedCapsuleRows) {
      const labelNorm = String(c.display_label || c.term || '').trim().toLowerCase();
      if (!labelNorm) continue;
      let cg = capsuleGroupMap.get(labelNorm);
      if (!cg) {
        cg = {
          term: c.term || c.display_label,
          display_label: c.display_label || c.term,
          dominant_color: c.dominant_color || '#3b82f6',
          max_score: Number(c.score || 0),
          kwIds: [],
          keywords: []
        };
        capsuleGroupMap.set(labelNorm, cg);
      }
      const kid = Number(c.keyword_id);
      if (!cg.kwIds.includes(kid)) {
        cg.kwIds.push(kid);
        if (cg.keywords.length < 4) {
          cg.keywords.push({
            keyword_id: kid,
            keyword_text: c.keyword_text || '',
            keyword_category: c.keyword_category || 'General',
            score: Number(c.score || 0),
            display_order: Number(c.display_order || 10)
          });
        }
      }
      if (c.score > cg.max_score) cg.max_score = c.score;
    }

    let sharedCapsulesCount = 0;
    // Precompute metrics on all capsule groups
    for (const cg of capsuleGroupMap.values()) {
      let crossSerpVelocity = 0;
      let crossSerpPins = 0;
      for (let i = 0; i < cg.kwIds.length; i++) {
        const stats = keywordPinStats.get(cg.kwIds[i]);
        if (stats) {
          crossSerpVelocity += stats.total_velocity;
          crossSerpPins += stats.active_pins_count;
        }
      }
      cg.keyword_count = cg.kwIds.length;
      cg.cross_serp_velocity = Math.round(crossSerpVelocity * 100) / 100;
      cg.cross_serp_pins = crossSerpPins;
      if (cg.keyword_count >= 2) sharedCapsulesCount++;
    }

    // Sort and slice to top 12 FIRST [Round 16 CPU Optimization]
    const topCapsuleGroups = Array.from(capsuleGroupMap.values())
      .sort(capsuleGroupSortComparator)
      .slice(0, 12);

    // Gather matching pins ONLY for top 12 in O(1) time via inverted indexes
    const guidedCapsuleCrossovers = topCapsuleGroups.map(cg => {
      const matchingPinsRaw = [];

      // 1. O(1) keyword index lookup
      for (let ki = 0; ki < cg.kwIds.length; ki++) {
        const kid = cg.kwIds[ki];
        const kwPins = keywordIdToPinsMap.get(kid);
        if (kwPins) {
          for (let pi = 0; pi < kwPins.length; pi++) {
            const p = kwPins[pi];
            let exists = false;
            for (let mi = 0; mi < matchingPinsRaw.length; mi++) {
              if (matchingPinsRaw[mi].pin_id === p.pin_id) { exists = true; break; }
            }
            if (!exists) {
              matchingPinsRaw.push(p);
              if (matchingPinsRaw.length >= 3) break;
            }
          }
        }
        if (matchingPinsRaw.length >= 3) break;
      }

      // 2. O(1) tag index fallback if < 3
      if (matchingPinsRaw.length < 3) {
        const targetLabelNorm = (cg.display_label || cg.term || '').toLowerCase();
        const tagPins = tagNormToPinsMap.get(targetLabelNorm);
        if (tagPins) {
          for (let pi = 0; pi < tagPins.length; pi++) {
            const p = tagPins[pi];
            let exists = false;
            for (let mi = 0; mi < matchingPinsRaw.length; mi++) {
              if (matchingPinsRaw[mi].pin_id === p.pin_id) { exists = true; break; }
            }
            if (!exists) {
              matchingPinsRaw.push(p);
              if (matchingPinsRaw.length >= 3) break;
            }
          }
        }
      }

      const matchingPins = matchingPinsRaw.map(formatMatrixPinSummary);

      return {
        term: cg.term,
        display_label: cg.display_label,
        dominant_color: cg.dominant_color,
        score: Number(safeNum(cg.max_score).toFixed(2)),
        max_score: Number(safeNum(cg.max_score).toFixed(2)),
        keyword_text: cg.keywords[0]?.keyword_text || '',
        distinct_keywords: cg.keyword_count,
        keyword_count: cg.keyword_count,
        cross_serp_velocity: cg.cross_serp_velocity,
        cross_serp_pins: cg.cross_serp_pins,
        keywords: cg.keywords.slice(0, 2),
        matching_pins: matchingPins,
        sample_pins: matchingPins.slice(0, 2)
      };
    });

    // Section 5: Creator Breakouts (Strictly positive growth only + David Accounts boundary fix) [Fix 2.5 SSOT]
    let breakoutCreatorsCount = 0;
    const creatorBreakouts = creatorBreakoutRows
      .filter(cp => {
        const reach = Number(cp.monthly_reach || 0);
        if (minAudience > 0 && reach < minAudience) return false;
        const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
        const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
        const driverPins = Array.isArray(cp.driver_pins) ? cp.driver_pins : [];
        const maxPinVel = driverPins.reduce((max, dp) => Math.max(max, Number(dp.daily_save_velocity || dp.delta_saves_24h || 0)), 0);

        // Strictly positive growth: eliminate negative drop accounts (-346,814) and stagnant zero accounts
        if (deltaReach <= 0 && deltaViews <= 0 && maxPinVel <= 0) return false;
        return true;
      })
      .map(cp => {
        const reach = Number(cp.monthly_reach || 0);
        const views = Number(cp.profile_views || 0);
        const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
        const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
        const reach7d = Number(cp.effective_reach_delta_7d || cp.reach_delta_7d || 0);
        const views7d = Number(cp.effective_views_delta_7d || cp.views_delta_7d || 0);
        const totalPins = Number(cp.total_pins || 0);
        const followers = Number(cp.follower_count || 0);

        if (deltaReach > 0 || deltaViews > 0) breakoutCreatorsCount++;

        // Filter driver pins for valid non-empty images
        const rawDriverPins = (Array.isArray(cp.driver_pins) ? cp.driver_pins : [])
          .filter(dp => dp && dp.image_url && typeof dp.image_url === 'string' && dp.image_url.trim().length > 0)
          .map(dp => ({
            ...dp,
            dossier_url: '/pin/' + encodeURIComponent(dp.pin_id),
            daily_save_velocity: Number(dp.daily_save_velocity || 0),
            delta_saves_24h: Number(dp.delta_saves_24h || 0),
            save_count: Number(dp.save_count || 0),
            repin_count: Number(dp.repin_count || 0)
          }));

        const maxPinVel = rawDriverPins.reduce((max, dp) => Math.max(max, dp.daily_save_velocity || dp.delta_saves_24h || 0), 0);
        const audiencePerPin = totalPins > 0 ? Math.round(reach / totalPins) : 0;

        // Fix 2.5: require totalPins > 0 && totalPins <= 250 && reach <= 500000 && positive delta
        const isDavidBreakout = totalPins > 0 && totalPins <= 250 && reach <= 500000 && (deltaReach >= 1000 || deltaViews >= 5000 || maxPinVel >= 20);

        let milestoneTier = 'Emerging';
        if (reach >= 10_000_000) milestoneTier = 'Titan (10M+)';
        else if (reach >= 1_000_000) milestoneTier = 'Whale (1M+)';
        else if (reach >= 250_000) milestoneTier = 'Established (250K+)';
        else if (reach >= 50_000) milestoneTier = 'Growth (50K+)';

        return {
          id: cp.id,
          username: cp.username,
          display_name: cp.display_name || cp.username,
          avatar_url: cp.avatar_url || '',
          bio: cp.bio || '',
          website_url: cp.website_url || '',
          monthly_reach: reach,
          profile_views: views,
          total_pins: totalPins,
          total_boards: Number(cp.total_boards || 0),
          follower_count: followers,
          effective_delta_reach_24h: deltaReach,
          effective_delta_views_24h: deltaViews,
          reach_delta_7d: reach7d,
          views_delta_7d: views7d,
          delta_pins_24h: Number(cp.delta_pins_24h || 0),
          last_synced_at: cp.last_synced_at,
          audience_per_pin: audiencePerPin,
          is_david_breakout: isDavidBreakout,
          is_david_account: isDavidBreakout,
          milestone_tier: milestoneTier,
          driver_pins: rawDriverPins
        };
      })
      .sort((a, b) => {
        const aGain = Math.max(a.effective_delta_reach_24h, a.effective_delta_views_24h);
        const bGain = Math.max(b.effective_delta_reach_24h, b.effective_delta_views_24h);
        if (bGain !== aGain) return bGain - aGain;
        return b.monthly_reach - a.monthly_reach;
      })
      .slice(0, 20);

    // Section 6: Keyword Vacuums & Multi-Keyword Pixie Bridges (prioritizing actively surging pins) [Fix 2.5 SSOT]
    const bridgePins = allActivePins
      .filter(p => p.overlap_count >= 2)
      .sort((a, b) => {
        const aSurging = (a.effective_24h_gain > 0) ? 1 : 0;
        const bSurging = (b.effective_24h_gain > 0) ? 1 : 0;
        if (bSurging !== aSurging) return bSurging - aSurging;
        if (b.effective_24h_gain !== a.effective_24h_gain) return b.effective_24h_gain - a.effective_24h_gain;
        const aKwCount = a.keywords ? a.keywords.length : (a.overlap_count || 0);
        const bKwCount = b.keywords ? b.keywords.length : (b.overlap_count || 0);
        if (bKwCount !== aKwCount) return bKwCount - aKwCount;
        return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
      })
      .slice(0, 15)
      .map(formatPinSummary);

    let totalVacuumTop10_24h = 0;
    const keywordVacuumOpportunities = Array.from(vacuumKwMap.values())
      .map(v => {
        const top10_24h = v.displaced_top10_24h_count;
        totalVacuumTop10_24h += top10_24h;
        const count24h = v.displaced_24h_count;
        const top10_7d = v.displaced_top10_7d_count;

        const kwStats = keywordPinStats.get(v.keyword_id) || {
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        };

        const vacuumScore = (top10_24h * 15) + (count24h * 5) + (top10_7d * 2);
        let urgency = 'STABLE';
        if (top10_24h >= 2) urgency = 'CRITICAL_VACUUM';
        else if (top10_24h >= 1) urgency = 'HIGH_VACUUM';
        else if (count24h >= 3) urgency = 'MODERATE_CHURN';

        return {
          keyword_id: v.keyword_id,
          keyword_text: v.keyword_text,
          displaced_24h_count: count24h,
          displaced_top10_24h_count: top10_24h,
          displaced_top10_7d_count: top10_7d,
          active_pins_count: kwStats.active_pins_count,
          avg_velocity: kwStats.active_pins_count > 0 ? Number((safeNum(kwStats.total_velocity) / kwStats.active_pins_count).toFixed(2)) : 0,
          top_pin: kwStats.top_pin ? {
            ...kwStats.top_pin,
            save_count: safeNum(kwStats.top_pin.save_count),
            daily_save_velocity: safeNum(kwStats.top_pin.daily_save_velocity)
          } : null,
          vacuum_score: vacuumScore,
          urgency
        };
      })
      .sort((a, b) => {
        if (b.vacuum_score !== a.vacuum_score) return b.vacuum_score - a.vacuum_score;
        return b.displaced_top10_24h_count - a.displaced_top10_24h_count;
      })
      .slice(0, 20);

    // Section 7: Hidden Gems Telemetry
    const winningBoards = Array.from(boardStatsMap.values())
      .map(b => ({
        board_name: b.board_name,
        creator_username: b.creator_username,
        pin_count: b.pin_count,
        total_velocity: Number(b.total_velocity.toFixed(2)),
        total_saves: b.total_saves,
        avg_velocity: b.pin_count > 0 ? Number((b.total_velocity / b.pin_count).toFixed(2)) : 0,
        sample_pins: b.sample_pins
      }))
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 10);

    const vacuumHijackPins = vacuumHijackCandidates.map(formatPinSummary);
    const domainlessViralPins = domainlessViralCandidates.map(formatPinSummary);

    const totalActivePinsCount = activeSerpRows[0]?.full_count || allActivePins.length;
    const creationMethodBreakdown = Array.from(creationMethodMap.values())
      .map(cm => ({
        method: cm.method,
        pin_count: cm.pin_count,
        total_velocity: Number(cm.total_velocity.toFixed(2)),
        pct_of_active_serp: totalActivePinsCount > 0 ? Number(((cm.pin_count / totalActivePinsCount) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.pin_count - a.pin_count);

    // Dominant Color Palette exporting both pin_count and count: pin_count [Fix 2.5 SSOT]
    const dominantColorPalette = Array.from(colorStatsMap.values())
      .map(c => ({
        color: c.color,
        pin_count: c.pin_count,
        count: c.pin_count, // Dual export: pin_count AND count
        frequency: c.pin_count,
        total_velocity: Number(c.total_velocity.toFixed(2)),
        avg_velocity: c.pin_count > 0 ? Number((c.total_velocity / c.pin_count).toFixed(2)) : 0,
        sample_pins: c.sample_pins || []
      }))
      .sort((a, b) => b.total_velocity - a.total_velocity)
      .slice(0, 12);

    const topArbitrageDomains = domainRollups.map(d => ({
      domain: d.domain,
      total_pins: Number(d.total_pins || 0),
      active_serp_pins: Number(d.active_serp_pins || 0),
      top10_pins: Number(d.top10_pins || 0),
      visibility_score: Number(d.visibility_score || 0),
      total_saves: Number(d.total_saves || 0),
      avg_velocity: Number(d.avg_velocity || 0),
      ad_network: d.ad_network || 'unchecked',
      age_days: Number(d.age_days || 0),
      age_years: d.age_years != null ? Number(d.age_years) : null,
      arbitrage_score: Number(d.arbitrage_score || 0)
    }));

    // Section 1: Executive KPI Ribbon
    const kpis = {
      total_active_serp_pins: totalActivePinsCount,
      pins_gaining_24h_count: pinsGainingCount,
      total_24h_saves_velocity: Number(totalSavesVelocity.toFixed(2)),
      total_24h_repins_delta: totalRepinsDelta,
      fresh_rocket_pins_14d_count: freshRocketCount,
      breakout_creators_count: breakoutCreatorsCount,
      multi_keyword_bridge_pins_count: bridgePinsCount,
      shared_guided_capsules_count: sharedCapsulesCount,
      serp_vacuum_top10_24h_count: totalVacuumTop10_24h
    };

    const payload = {
      success: true,
      generated_at: new Date().toISOString(),
      filters: {
        folder_id: folderId || 'all',
        window: windowParam,
        min_audience: minAudience
      },
      kpis,
      breakout_pins: breakoutPinsTop250,
      fresh_rocket_pins: freshRocketPinsTop50,
      vault_surge_pins: vaultPins.slice(0, 15).map(formatPinSummary),
      pinarchive_winners: paWinners.slice(0, 10).map(p => ({
        ...p,
        saves: Number(p.saves || 0),
        repins: Number(p.repins || 0),
        comments: Number(p.comments || 0),
        velocity: Number(p.velocity || 0),
        annotations: extractCleanAnnotations(p.annotations)
      })),
      annotation_crossovers: {
        single_annotations: singleAnnotations,
        pair_crossovers: pairCrossovers,
        triplet_crossovers: tripletCrossovers,
        top_2_pairs: pairCrossovers,
        top_3_triplets: tripletCrossovers
      },
      guided_capsule_crossovers: guidedCapsuleCrossovers,
      creator_breakouts: creatorBreakouts,
      keyword_vacuums_and_bridges: {
        bridge_pins: bridgePins,
        keyword_vacuum_opportunities: keywordVacuumOpportunities
      },
      hidden_gems_telemetry: {
        winning_boards: winningBoards,
        vacuum_hijack_pins: vacuumHijackPins,
        domainless_viral_pins: domainlessViralPins,
        creation_method_breakdown: creationMethodBreakdown,
        dominant_color_palette: dominantColorPalette,
        top_arbitrage_domains: topArbitrageDomains
      }
    };

    // Save into L1 memory cache (skip if bypassCache is requested)
    if (!bypassCache) {
      setPulseMemoryCache(cacheKey, payload);
      pulseForceRefreshCooldown.set(cacheKey, Date.now());
    }

    // Save into L2 Cloudflare Workers KV for default view
    if (!bypassCache && isDefaultFilter && env?.PIN_ENGINE_KV) {
      const kvTask = env.PIN_ENGINE_KV.put(
        'pulse:global_24h:summary',
        JSON.stringify(payload),
        { expirationTtl: 600 }
      ).catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') {
        try {
          ctx.waitUntil(kvTask);
        } catch (_) {}
      }
    }

    return payload;
  })();

  if (!bypassCache) {
    inflightPulse.set(cacheKey, computePromise);
  }

  try {
    return await computePromise;
  } finally {
    if (!bypassCache) {
      inflightPulse.delete(cacheKey);
    }
  }
}

/**
 * Section 8 Helper: Synthesizes One-Click 5-Source Scientific Pin Blueprint
 */
export function synthesizePinBlueprint(pinId, pulseData) {
  if (!pulseData || typeof pulseData !== 'object') return null;
  const targetId = String(pinId || '').trim();

  // Search pin in breakout_pins, fresh_rocket_pins, vault_surge_pins, or pinarchive_winners
  const pin = (pulseData.breakout_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.fresh_rocket_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.vault_surge_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.pinarchive_winners || []).find(p => String(p.pin_id) === targetId)
    || { pin_id: targetId, title: 'Untitled Pin', dominant_color: '#888888' };

  const pinAnnotations = extractCleanAnnotations(pin.visual_annotations || pin.annotations || []);
  const annotationNorms = new Set(pinAnnotations.map(a => a.norm));

  // Match relevant Guided Search Capsules
  const relevantCapsules = (pulseData.guided_capsule_crossovers || []).filter(c => {
    const termNorm = (c.term || c.display_label || '').toLowerCase();
    if (!termNorm) return false;
    if (annotationNorms.has(termNorm)) return true;
    for (const an of annotationNorms) {
      if (an.includes(termNorm) || termNorm.includes(an)) return true;
    }
    if (pin.title && pin.title.toLowerCase().includes(termNorm)) return true;
    if (Array.isArray(pin.keywords)) {
      for (const kw of pin.keywords) {
        if ((kw.keyword_text || '').toLowerCase().includes(termNorm)) return true;
      }
    }
    return false;
  }).slice(0, 10);

  // Match relevant Triplet Crossovers
  const relevantTriplets = (pulseData.annotation_crossovers?.triplet_crossovers || []).filter(t => {
    return annotationNorms.has(t.tag_a_norm) || annotationNorms.has(t.tag_b_norm) || annotationNorms.has(t.tag_c_norm);
  }).slice(0, 8);

  // Match relevant Pair Crossovers
  const relevantPairs = (pulseData.annotation_crossovers?.pair_crossovers || []).filter(p => {
    return annotationNorms.has(p.tag_a_norm) || annotationNorms.has(p.tag_b_norm);
  }).slice(0, 8);

  // Recommended Target Board
  const winningBoards = pulseData.hidden_gems_telemetry?.winning_boards || [];
  let recommendedBoard = pin.board_name || (winningBoards[0]?.board_name || 'Winning Arbitrage Board');

  // Recommended Color Palette
  const dominantPalette = pulseData.hidden_gems_telemetry?.dominant_color_palette || [];
  const recommendedColors = [pin.dominant_color || '#888888', ...dominantPalette.map(c => c.color).filter(c => c !== pin.dominant_color)].slice(0, 5);

  return {
    pin_id: pin.pin_id,
    title: pin.title || '',
    domain: pin.domain || '',
    destination_url: pin.destination_url || '',
    image_url: pin.image_url || '',
    creator_username: pin.creator_username || '',
    board_name: pin.board_name || '',
    dominant_color: pin.dominant_color || '#888888',
    recommended_target_board: recommendedBoard,
    recommended_color_palette: recommendedColors,
    relevant_guided_capsules: relevantCapsules,
    relevant_triplet_crossovers: relevantTriplets,
    relevant_pair_crossovers: relevantPairs,
    metrics: {
      save_count: Number(pin.save_count || pin.saves || 0),
      repin_count: Number(pin.repin_count || pin.repins || 0),
      daily_save_velocity: Number(pin.daily_save_velocity || pin.velocity || 0),
      delta_repins_24h: Number(pin.delta_repins_24h || 0),
      pin_age_days: pin.pin_age_days ?? null,
      is_fresh_14d: Boolean(pin.is_fresh_14d),
      url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0),
      rank_climb_24h: Number(pin.rank_climb_24h || 0)
    },
    five_source_relevance: {
      source_1_serp: {
        keywords: pin.keywords || [],
        best_rank: pin.best_rank ?? null,
        rank_climb_24h: Number(pin.rank_climb_24h || 0)
      },
      source_2_guided_capsules: relevantCapsules.map(c => ({
        label: c.display_label,
        score: c.max_score,
        keyword_count: c.keyword_count
      })),
      source_3_cv_annotations: pinAnnotations,
      source_4_pinsage_board: {
        current_board: pin.board_name || '',
        recommended_target_board: recommendedBoard
      },
      source_5_domain_leverage: {
        domain: pin.domain || '',
        url_global_saves: Number(pin.url_global_saves || 0),
        url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0)
      }
    }
  };
}

// Warm up V8 JIT at module load time so Worker isolate compilation overhead is eliminated
try {
  const _warmupPins = [];
  for (let i = 0; i < 200; i++) {
    _warmupPins.push({
      pin_id: 'warm_' + i,
      keyword_id: (i % 15) + 1,
      keyword_text: 'warmup keyword ' + (i % 15),
      keyword_category: 'Warmup',
      save_count: 100 + i * 10,
      repin_count: 10 + i,
      daily_save_velocity: 10.0 + (i % 50),
      delta_saves_24h: 10 + (i % 30),
      delta_repins_24h: 5 + (i % 20),
      gains_5d: 20, gains_7d: 30, gains_10d: 40, gains_15d: 50,
      url_global_saves: 50,
      title: 'Warmup Pin Title ' + i,
      image_url: 'https://i.pinimg.com/236x/warm_' + i + '.jpg',
      destination_url: 'https://warmup.com/pin/' + i,
      domain: 'warmup.com',
      creator_username: 'warmcreator_' + (i % 10),
      board_name: 'Warmup Board ' + (i % 5),
      dominant_color: '#3b82f6',
      visual_annotations: ['Warm Tag ' + (i % 12), 'Tag Beta ' + ((i + 1) % 12), 'Tag Gamma ' + ((i + 2) % 12)],
      created_at_pinterest: '2026-11-01T00:00:00.000Z',
      rank_position: (i % 50) + 1,
      folders: [{ folder_id: (i % 3) + 1, folder_name: 'Folder ' + (i % 3), folder_color: '#rose' }]
    });
  }
  const _warmupCaps = [];
  for (let i = 0; i < 40; i++) {
    _warmupCaps.push({
      id: i + 1,
      keyword_id: (i % 15) + 1,
      keyword_text: 'warmup keyword ' + (i % 15),
      keyword_category: 'Warmup',
      term: 'warm ' + (i % 10),
      display_label: 'Warm ' + (i % 10),
      score: 10 + i,
      dominant_color: '#3b82f6',
      display_order: i
    });
  }
  const _warmupSql = async (strings) => {
    const q = Array.isArray(strings) ? strings.join('') : String(strings);
    if (q.includes('keyword_guided_capsules')) return _warmupCaps;
    if (q.includes('competitor_profiles') || q.includes('active_creators')) {
      return [{ id: 1, username: 'warm', monthly_reach: 1000, profile_views: 500, effective_delta_reach_24h: 10, driver_pins: [] }];
    }
    if (q.includes('keyword_displaced_index')) return [];
    if (q.includes('domain_intelligence_rollup')) return [];
    return _warmupPins;
  };
  await getGlobal24hPulseService(_warmupSql, {}, { forceRefresh: true });
  await getGlobal24hPulseService(_warmupSql, {}, { forceRefresh: true });
  pulseMemoryCache.clear();
  pulseForceRefreshCooldown.clear();
  inflightPulse.clear();
} catch (_) {}

