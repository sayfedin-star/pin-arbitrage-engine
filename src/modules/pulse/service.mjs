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

/**
 * Normalizes and extracts clean visual annotations from polymorphic shapes:
 * - Plain string arrays: ["Dinner Ideas", "Quick Meals"]
 * - Object arrays: [{"name": "Summer Outfits", "idea_id": "123"}]
 * - Stringified JSON strings
 * - Wrapped objects: { tags: [...] }
 * Deduplicates intra-pin tags, filters labels < 2 chars, and omits hallucinated confidence scores.
 */
export function extractCleanAnnotations(raw) {
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

  const seen = new Set();
  const result = [];
  for (const item of arr) {
    const label = typeof item === 'string'
      ? item.trim()
      : String(item?.display || item?.name || item?.tag || item?.label || item?.display_label || item?.term || item?.norm || '').trim();
    if (!label || label.length < 2) continue;
    const norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push({ norm, display: label });
    }
  }
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
    ORDER BY ksc.daily_save_velocity DESC, ksc.delta_repins_24h DESC;
  `;
}

/**
 * Query 2: Displaced Vault Surge & 24h SERP Vacuum (keyword_displaced_index)
 * Part 2A: Aggregates displaced counts per keyword.
 * Part 2B: Top 50 Vault Surge Sleepers hydrated from D1.
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
        kdi.domain,
        kdi.creator_username,
        kdi.shard_id
      FROM keyword_displaced_index kdi
      JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
      WHERE (kdi.daily_save_velocity > 0 OR kdi.delta_repins_24h > 0)
        AND (${folderIdNum}::int IS NULL OR EXISTS (
          SELECT 1 FROM keyword_folder_items fi 
          WHERE fi.keyword_id = kdi.keyword_id AND fi.folder_id = ${folderIdNum}::int
        ))
      ORDER BY GREATEST(COALESCE(kdi.daily_save_velocity, 0), COALESCE(kdi.delta_repins_24h, 0)) DESC
      LIMIT 50;
    `
  ]);

  const vaultPins = vaultPinsRaw.map(r => ({
    ...r,
    pin_id: String(r.pin_id),
    save_count: Number(r.save_count || 0),
    repin_count: Number(r.repin_count || 0),
    daily_save_velocity: Number(r.daily_save_velocity || 0),
    delta_repins_24h: Number(r.delta_repins_24h || 0),
    gains_5d: Number(r.gains_5d || 0),
    gains_7d: Number(r.gains_7d || 0),
    gains_10d: Number(r.gains_10d || 0),
    gains_15d: Number(r.gains_15d || 0),
    last_known_rank: r.last_known_rank != null ? Number(r.last_known_rank) : null,
    vacuum_opportunity_score: Number(r.vacuum_opportunity_score || 0),
    title: '',
    image_url: '',
    destination_url: '',
    board_name: '',
    dominant_color: '#888888',
    visual_annotations: [],
    created_at_pinterest: null
  }));

  if (env?.PIN_D1_DB && vaultPins.length > 0) {
    try {
      const pinIds = vaultPins.map(p => p.pin_id);
      const d1Map = await hydratePinsFromD1(env, pinIds);
      if (d1Map && typeof d1Map.get === 'function') {
        for (const p of vaultPins) {
          const d1 = d1Map.get(p.pin_id);
          if (d1) {
            p.title = p.title || d1.title || '';
            p.image_url = p.image_url || d1.image_url || '';
            p.dominant_color = p.dominant_color || d1.dominant_color || '#888888';
            p.destination_url = p.destination_url || d1.destination_url || '';
            p.board_name = p.board_name || d1.board_name || '';
            p.visual_annotations = p.visual_annotations || d1.visual_annotations || [];
            p.created_at_pinterest = p.created_at_pinterest || d1.created_at_pinterest || null;
          }
        }
      }
    } catch (_) {}
  }

  return { vacuumRows, vaultPins };
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
      ORDER BY 
        GREATEST(ABS(effective_delta_reach_24h), ABS(effective_delta_views_24h)) DESC,
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
        COALESCE((cpin.metadata->>'delta_saves_24h')::numeric, (cpin.metadata->>'daily_save_velocity')::numeric, 0) AS delta_saves_24h,
        COALESCE((cpin.metadata->>'daily_save_velocity')::numeric, 0) AS daily_save_velocity,
        cpin.created_at_pinterest,
        ROW_NUMBER() OVER (
          PARTITION BY cpin.competitor_id
          ORDER BY COALESCE((cpin.metadata->>'delta_saves_24h')::numeric, (cpin.metadata->>'daily_save_velocity')::numeric, 0) DESC, cpin.save_count DESC
        ) AS rn
      FROM competitor_pins cpin
      JOIN top_creators tc ON tc.id = cpin.competitor_id
      WHERE cpin.is_deleted = FALSE
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
      GREATEST(ABS(tc.effective_delta_reach_24h), ABS(tc.effective_delta_views_24h)) DESC,
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
      LIMIT 40;
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
 * Main Service Function: getGlobal24hPulseService
 */
export async function getGlobal24hPulseService(sql, env, options = {}) {
  const folderId = options.folderId || options.folder_id || 'all';
  const windowParam = String(options.window || '24h').toLowerCase();
  const forceRefresh = Boolean(options.forceRefresh || options.force_refresh);
  const minAudience = Number(options.minAudience || options.min_audience || 0);
  const ctx = options.ctx || null;

  const folderIdNum = (folderId && folderId !== 'all') ? Number(folderId) : null;
  const cacheKey = `pulse:${folderId || 'all'}:${windowParam}:${minAudience}`;

  const now = Date.now();
  let effectiveRefresh = forceRefresh;
  if (effectiveRefresh) {
    const lastRefresh = pulseForceRefreshCooldown.get(cacheKey);
    if (lastRefresh && (now - lastRefresh < PULSE_FORCE_REFRESH_COOLDOWN_MS)) {
      effectiveRefresh = false;
    }
  }

  // 1. Process-local Memory Cache Check
  if (!effectiveRefresh && pulseMemoryCache.has(cacheKey)) {
    const cached = pulseMemoryCache.get(cacheKey);
    if (now - cached.timestamp <= PULSE_MEMORY_TTL_MS) {
      return cached.payload;
    }
  }

  if (effectiveRefresh) {
    pulseForceRefreshCooldown.set(cacheKey, now);
    pulseMemoryCache.delete(cacheKey);
  }

  // 2. Cloudflare Workers KV Cache Check (for default summary view)
  const isDefaultFilter = (!folderIdNum) && (windowParam === '24h') && (minAudience === 0);
  if (isDefaultFilter && !effectiveRefresh && env?.PIN_ENGINE_KV) {
    try {
      const kvCached = await env.PIN_ENGINE_KV.get('pulse:global_24h:summary', { type: 'json' });
      if (kvCached) {
        setPulseMemoryCache(cacheKey, kvCached);
        return kvCached;
      }
    } catch (_) {}
  }

  // 3. In-Flight Stampede Guard
  if (inflightPulse.has(cacheKey)) {
    return await inflightPulse.get(cacheKey);
  }

  let computePromise;
  computePromise = (async () => {
    // 4. Concurrent Execution of 5 Hub Queries
    const [
      activeSerpRows,
      vaultData,
      guidedCapsuleRows,
      creatorBreakoutRows,
      winnerData
    ] = await Promise.all([
      queryActiveSerp(sql, folderIdNum),
      queryVaultAndVacuum(sql, folderIdNum, env),
      queryGuidedCapsules(sql, folderIdNum),
      queryBreakoutCreators(sql, folderIdNum),
      queryWinnersAndDomains(sql)
    ]);

    const { vacuumRows, vaultPins } = vaultData;
    const { paWinners, domainRollups } = winnerData;

    // Vacuum Keyword Map for rapid lookup
    const vacuumKwMap = new Map();
    for (const v of vacuumRows) {
      vacuumKwMap.set(Number(v.keyword_id), {
        keyword_id: Number(v.keyword_id),
        keyword_text: v.keyword_text || '',
        displaced_24h_count: Number(v.displaced_24h_count || 0),
        displaced_top10_24h_count: Number(v.displaced_top10_24h_count || 0),
        displaced_top10_7d_count: Number(v.displaced_top10_7d_count || 0)
      });
    }

    // 5. Deduplicate and Group Active SERP Pins
    const pinMap = new Map();
    const keywordPinStats = new Map();

    for (const row of activeSerpRows) {
      const pid = String(row.pin_id);
      const kid = Number(row.keyword_id);

      // Aggregate keyword stats
      if (!keywordPinStats.has(kid)) {
        keywordPinStats.set(kid, {
          keyword_id: kid,
          keyword_text: row.keyword_text || '',
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        });
      }
      const kwStats = keywordPinStats.get(kid);
      kwStats.active_pins_count++;
      const rowVel = Number(row.daily_save_velocity || 0);
      kwStats.total_velocity += rowVel;
      if (!kwStats.top_pin || rowVel > Number(kwStats.top_pin.daily_save_velocity || 0)) {
        kwStats.top_pin = {
          pin_id: pid,
          title: row.title || '',
          image_url: row.image_url || '',
          save_count: Number(row.save_count || 0),
          daily_save_velocity: rowVel
        };
      }

      if (!pinMap.has(pid)) {
        pinMap.set(pid, {
          pin_id: pid,
          title: row.title || '',
          domain: row.domain || '',
          destination_url: row.destination_url || '',
          image_url: row.image_url || '',
          creator_username: row.creator_username || '',
          board_name: row.board_name || '',
          dominant_color: row.dominant_color || '#888888',
          save_count: Number(row.save_count || 0),
          repin_count: Number(row.repin_count || 0),
          daily_save_velocity: Number(row.daily_save_velocity || 0),
          delta_repins_24h: Number(row.delta_repins_24h || 0),
          gains_5d: Number(row.gains_5d || 0),
          gains_7d: Number(row.gains_7d || 0),
          gains_10d: Number(row.gains_10d || 0),
          gains_15d: Number(row.gains_15d || 0),
          url_global_saves: Number(row.url_global_saves || 0),
          visual_annotations: row.visual_annotations || [],
          created_at_pinterest: row.created_at_pinterest || null,
          creation_method: row.creation_method || 'pinterest_platform',
          crawled_at: row.crawled_at || null,
          keywords: [],
          foldersMap: new Map(),
          rank_positions: [],
          prev_rank_positions: []
        });
      }

      const pEntry = pinMap.get(pid);
      pEntry.keywords.push({
        keyword_id: kid,
        keyword_text: row.keyword_text || '',
        keyword_category: row.keyword_category || 'General',
        rank_position: row.rank_position != null ? Number(row.rank_position) : null,
        prev_rank_position: row.prev_rank_position != null ? Number(row.prev_rank_position) : null
      });

      if (row.rank_position != null) pEntry.rank_positions.push(Number(row.rank_position));
      if (row.prev_rank_position != null) pEntry.prev_rank_positions.push(Number(row.prev_rank_position));

      const fList = Array.isArray(row.folders) ? row.folders : [];
      for (const f of fList) {
        if (f?.folder_id) pEntry.foldersMap.set(Number(f.folder_id), f);
      }
    }

    // 6. Process Processed Pins & Extract N-Grams
    const allActivePins = [];
    let totalSavesVelocity = 0;
    let totalRepinsDelta = 0;
    let pinsGainingCount = 0;
    let freshRocketCount = 0;
    let bridgePinsCount = 0;

    // N-Gram mining storage
    const singleTagMap = new Map();
    const pairTagMap = new Map();
    const tripletTagMap = new Map();

    // Board & Color telemetry
    const boardStatsMap = new Map();
    const colorStatsMap = new Map();
    const creationMethodMap = new Map();

    const nowMs = Date.now();

    for (const p of pinMap.values()) {
      const overlapCount = p.keywords.length;
      if (overlapCount >= 2) bridgePinsCount++;

      const folders = Array.from(p.foldersMap.values());
      const folderOverlapCount = folders.length;
      const bestRank = p.rank_positions.length > 0 ? Math.min(...p.rank_positions) : null;
      const bestPrevRank = p.prev_rank_positions.length > 0 ? Math.min(...p.prev_rank_positions) : null;
      const rankClimb24h = (bestPrevRank != null && bestRank != null) ? (bestPrevRank - bestRank) : 0;

      // Calculate Age
      let pinAgeDays = null;
      if (p.created_at_pinterest) {
        const ms = nowMs - new Date(p.created_at_pinterest).getTime();
        if (isFinite(ms) && ms >= 0) {
          pinAgeDays = Math.floor(ms / (86400 * 1000));
        }
      }
      const isFresh14d = pinAgeDays !== null ? (pinAgeDays <= 14) : false;
      const isFresh30d = pinAgeDays !== null ? (pinAgeDays <= 30) : false;

      // Windowed Momentum Calculation
      let effectiveMomentum = p.daily_save_velocity;
      if (windowParam === '5d') effectiveMomentum = p.gains_5d;
      else if (windowParam === '7d') effectiveMomentum = p.gains_7d;
      else if (windowParam === '15d') effectiveMomentum = p.gains_15d;
      else effectiveMomentum = p.daily_save_velocity + (p.delta_repins_24h * 0.5);

      const dailyAvg7d = Math.max(1, p.gains_7d / 7);
      const accelerationRatio = Number((p.daily_save_velocity / dailyAvg7d).toFixed(2));
      const isAccelerating = accelerationRatio >= 1.5;

      const urlLeverageRatio = (p.url_global_saves > 0 && p.save_count > 0)
        ? Number((p.url_global_saves / p.save_count).toFixed(2))
        : 1.0;

      // Vacuum Target Check
      let isVacuumHijackTarget = false;
      for (const kw of p.keywords) {
        const vInfo = vacuumKwMap.get(kw.keyword_id);
        if (vInfo && vInfo.displaced_top10_24h_count > 0) {
          if (bestRank != null && (bestRank <= 15 || p.daily_save_velocity > 0 || rankClimb24h > 0)) {
            isVacuumHijackTarget = true;
            break;
          }
        }
      }

      totalSavesVelocity += p.daily_save_velocity;
      totalRepinsDelta += p.delta_repins_24h;
      if (p.daily_save_velocity > 0 || p.delta_repins_24h > 0) pinsGainingCount++;
      if (isFresh14d && (p.daily_save_velocity > 0 || p.delta_repins_24h > 0)) freshRocketCount++;

      // Clean annotations extraction
      const cleanAnnotations = extractCleanAnnotations(p.visual_annotations);

      const pinObject = {
        pin_id: p.pin_id,
        title: p.title,
        domain: p.domain,
        destination_url: p.destination_url,
        image_url: p.image_url,
        creator_username: p.creator_username,
        board_name: p.board_name,
        dominant_color: p.dominant_color,
        save_count: p.save_count,
        repin_count: p.repin_count,
        daily_save_velocity: p.daily_save_velocity,
        delta_repins_24h: p.delta_repins_24h,
        gains_5d: p.gains_5d,
        gains_7d: p.gains_7d,
        gains_10d: p.gains_10d,
        gains_15d: p.gains_15d,
        url_global_saves: p.url_global_saves,
        url_leverage_ratio: urlLeverageRatio,
        pin_age_days: pinAgeDays,
        is_fresh_14d: isFresh14d,
        is_fresh_30d: isFresh30d,
        effective_24h_momentum: Number(effectiveMomentum.toFixed(2)),
        acceleration_ratio: accelerationRatio,
        is_accelerating: isAccelerating,
        overlap_count: overlapCount,
        folder_overlap_count: folderOverlapCount,
        best_rank: bestRank,
        rank_climb_24h: rankClimb24h,
        is_vacuum_hijack_target: isVacuumHijackTarget,
        creation_method: p.creation_method,
        created_at_pinterest: p.created_at_pinterest,
        keywords: p.keywords,
        folders,
        visual_annotations: cleanAnnotations
      };

      allActivePins.push(pinObject);

      // In-Memory N-Gram Mining (Lexicographically sorted, capped at 10 tags)
      const sortedTags = cleanAnnotations.slice().sort((a, b) => a.norm.localeCompare(b.norm));
      const boundedTags = sortedTags.slice(0, 10);
      const K = boundedTags.length;

      // 1-Gram (single_annotations)
      for (let i = 0; i < K; i++) {
        const tag = boundedTags[i];
        if (!singleTagMap.has(tag.norm)) {
          singleTagMap.set(tag.norm, {
            tag_norm: tag.norm,
            tag_display: tag.display,
            pin_count: 0,
            keywordsSet: new Set(),
            total_velocity: 0,
            total_saves: 0,
            total_repins_delta: 0,
            sample_pins: []
          });
        }
        const st = singleTagMap.get(tag.norm);
        st.pin_count++;
        st.total_velocity += p.daily_save_velocity;
        st.total_saves += p.save_count;
        st.total_repins_delta += p.delta_repins_24h;
        for (const kw of p.keywords) st.keywordsSet.add(kw.keyword_id);
        if (st.sample_pins.length < 3) {
          st.sample_pins.push({
            pin_id: p.pin_id,
            title: p.title,
            image_url: p.image_url,
            rank_position: bestRank
          });
        }
      }

      // 2-Pairs (A + B)
      for (let i = 0; i < K - 1; i++) {
        for (let j = i + 1; j < K; j++) {
          const tA = boundedTags[i];
          const tB = boundedTags[j];
          const pairKey = `${tA.norm} +++ ${tB.norm}`;
          if (!pairTagMap.has(pairKey)) {
            pairTagMap.set(pairKey, {
              tag_a_norm: tA.norm,
              tag_a_display: tA.display,
              tag_b_norm: tB.norm,
              tag_b_display: tB.display,
              crossover_label: `${tA.display} + ${tB.display}`,
              pin_count: 0,
              keywordsSet: new Set(),
              total_velocity: 0,
              total_saves: 0,
              total_repins_delta: 0,
              sample_pins: []
            });
          }
          const pt = pairTagMap.get(pairKey);
          pt.pin_count++;
          pt.total_velocity += p.daily_save_velocity;
          pt.total_saves += p.save_count;
          pt.total_repins_delta += p.delta_repins_24h;
          for (const kw of p.keywords) pt.keywordsSet.add(kw.keyword_id);
          if (pt.sample_pins.length < 3) {
            pt.sample_pins.push({
              pin_id: p.pin_id,
              title: p.title,
              image_url: p.image_url,
              rank_position: bestRank
            });
          }
        }
      }

      // 3-Triplets (A + B + C)
      for (let i = 0; i < K - 2; i++) {
        for (let j = i + 1; j < K - 1; j++) {
          for (let k = j + 1; k < K; k++) {
            const tA = boundedTags[i];
            const tB = boundedTags[j];
            const tC = boundedTags[k];
            const tripKey = `${tA.norm} +++ ${tB.norm} +++ ${tC.norm}`;
            if (!tripletTagMap.has(tripKey)) {
              tripletTagMap.set(tripKey, {
                tag_a_norm: tA.norm,
                tag_a_display: tA.display,
                tag_b_norm: tB.norm,
                tag_b_display: tB.display,
                tag_c_norm: tC.norm,
                tag_c_display: tC.display,
                crossover_label: `${tA.display} + ${tB.display} + ${tC.display}`,
                pin_count: 0,
                keywordsSet: new Set(),
                total_velocity: 0,
                total_saves: 0,
                total_repins_delta: 0,
                sample_pins: []
              });
            }
            const tt = tripletTagMap.get(tripKey);
            tt.pin_count++;
            tt.total_velocity += p.daily_save_velocity;
            tt.total_saves += p.save_count;
            tt.total_repins_delta += p.delta_repins_24h;
            for (const kw of p.keywords) tt.keywordsSet.add(kw.keyword_id);
            if (tt.sample_pins.length < 3) {
              tt.sample_pins.push({
                pin_id: p.pin_id,
                title: p.title,
                image_url: p.image_url,
                rank_position: bestRank
              });
            }
          }
        }
      }

      // Board Telemetry
      const cleanBoard = (p.board_name || '').trim();
      if (cleanBoard && cleanBoard.toLowerCase() !== 'unknown') {
        if (!boardStatsMap.has(cleanBoard)) {
          boardStatsMap.set(cleanBoard, {
            board_name: cleanBoard,
            creator_username: p.creator_username || '',
            pin_count: 0,
            total_velocity: 0,
            total_saves: 0,
            sample_pins: []
          });
        }
        const bEntry = boardStatsMap.get(cleanBoard);
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
      const colorHex = (p.dominant_color || '#888888').trim().toLowerCase();
      if (colorHex) {
        if (!colorStatsMap.has(colorHex)) {
          colorStatsMap.set(colorHex, {
            color: colorHex,
            pin_count: 0,
            total_velocity: 0
          });
        }
        const cEntry = colorStatsMap.get(colorHex);
        cEntry.pin_count++;
        cEntry.total_velocity += p.daily_save_velocity;
      }

      // Creation Method Telemetry
      const cm = (p.creation_method || 'pinterest_platform').trim();
      if (!creationMethodMap.has(cm)) {
        creationMethodMap.set(cm, { method: cm, pin_count: 0, total_velocity: 0 });
      }
      const cmEntry = creationMethodMap.get(cm);
      cmEntry.pin_count++;
      cmEntry.total_velocity += p.daily_save_velocity;
    }

    // Sort Breakout Pins
    allActivePins.sort((a, b) => {
      if (b.effective_24h_momentum !== a.effective_24h_momentum) {
        return b.effective_24h_momentum - a.effective_24h_momentum;
      }
      if (b.daily_save_velocity !== a.daily_save_velocity) {
        return b.daily_save_velocity - a.daily_save_velocity;
      }
      return b.save_count - a.save_count;
    });

    const breakoutPinsTop150 = allActivePins.slice(0, 150);

    const freshRocketPinsTop50 = allActivePins
      .filter(p => p.is_fresh_14d && (p.daily_save_velocity > 0 || p.delta_repins_24h > 0))
      .sort((a, b) => b.daily_save_velocity - a.daily_save_velocity)
      .slice(0, 50);

    // Section 3: Format N-Gram Crossovers
    const singleAnnotations = Array.from(singleTagMap.values())
      .map(t => ({
        tag_norm: t.tag_norm,
        tag_display: t.tag_display,
        pin_count: t.pin_count,
        keyword_count: t.keywordsSet.size,
        total_velocity: Number(t.total_velocity.toFixed(2)),
        total_saves: t.total_saves,
        total_repins_delta: t.total_repins_delta,
        sample_pins: t.sample_pins
      }))
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 50);

    const pairCrossovers = Array.from(pairTagMap.values())
      .map(p => ({
        tag_a_norm: p.tag_a_norm,
        tag_a_display: p.tag_a_display,
        tag_b_norm: p.tag_b_norm,
        tag_b_display: p.tag_b_display,
        crossover_label: p.crossover_label,
        pin_count: p.pin_count,
        keyword_count: p.keywordsSet.size,
        total_velocity: Number(p.total_velocity.toFixed(2)),
        total_saves: p.total_saves,
        total_repins_delta: p.total_repins_delta,
        sample_pins: p.sample_pins
      }))
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 50);

    const tripletCrossovers = Array.from(tripletTagMap.values())
      .map(t => ({
        tag_a_norm: t.tag_a_norm,
        tag_a_display: t.tag_a_display,
        tag_b_norm: t.tag_b_norm,
        tag_b_display: t.tag_b_display,
        tag_c_norm: t.tag_c_norm,
        tag_c_display: t.tag_c_display,
        crossover_label: t.crossover_label,
        pin_count: t.pin_count,
        keyword_count: t.keywordsSet.size,
        total_velocity: Number(t.total_velocity.toFixed(2)),
        total_saves: t.total_saves,
        total_repins_delta: t.total_repins_delta,
        sample_pins: t.sample_pins
      }))
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 50);

    // Section 4: Group Guided Search Capsules Crossovers
    const capsuleGroupMap = new Map();
    for (const c of guidedCapsuleRows) {
      const termNorm = String(c.term || c.display_label || '').trim().toLowerCase();
      if (!termNorm) continue;
      if (!capsuleGroupMap.has(termNorm)) {
        capsuleGroupMap.set(termNorm, {
          term: c.term,
          display_label: c.display_label,
          dominant_color: c.dominant_color || '#3b82f6',
          max_score: Number(c.score || 0),
          keywordsSet: new Set(),
          keywords: []
        });
      }
      const cg = capsuleGroupMap.get(termNorm);
      const kid = Number(c.keyword_id);
      if (!cg.keywordsSet.has(kid)) {
        cg.keywordsSet.add(kid);
        cg.keywords.push({
          keyword_id: kid,
          keyword_text: c.keyword_text || '',
          keyword_category: c.keyword_category || 'General',
          score: Number(c.score || 0),
          display_order: Number(c.display_order || 10)
        });
      }
      if (Number(c.score || 0) > cg.max_score) cg.max_score = Number(c.score || 0);
    }

    let sharedCapsulesCount = 0;
    const guidedCapsuleCrossovers = Array.from(capsuleGroupMap.values())
      .map(cg => {
        const keywordCount = cg.keywordsSet.size;
        if (keywordCount >= 2) sharedCapsulesCount++;

        // Calculate cross-SERP 24h velocity from associated keywords
        let crossSerpVelocity = 0;
        let crossSerpPins = 0;
        for (const kw of cg.keywords) {
          const stats = keywordPinStats.get(kw.keyword_id);
          if (stats) {
            crossSerpVelocity += stats.total_velocity;
            crossSerpPins += stats.active_pins_count;
          }
        }

        return {
          term: cg.term,
          display_label: cg.display_label,
          dominant_color: cg.dominant_color,
          max_score: Number(cg.max_score.toFixed(2)),
          keyword_count: keywordCount,
          cross_serp_velocity: Number(crossSerpVelocity.toFixed(2)),
          cross_serp_pins: crossSerpPins,
          keywords: cg.keywords
        };
      })
      .sort((a, b) => {
        if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count;
        if (b.cross_serp_velocity !== a.cross_serp_velocity) return b.cross_serp_velocity - a.cross_serp_velocity;
        return b.max_score - a.max_score;
      })
      .slice(0, 60);

    // Section 5: Creator Breakouts with Snapshot Delta Fallbacks
    let breakoutCreatorsCount = 0;
    const creatorBreakouts = creatorBreakoutRows
      .filter(cp => {
        if (minAudience > 0 && Number(cp.monthly_reach || 0) < minAudience) return false;
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

        const audiencePerPin = totalPins > 0 ? Math.round(reach / totalPins) : 0;
        const isDavidBreakout = (totalPins <= 150 || followers <= 2500) && (deltaReach >= 10000 || reach >= 50000);

        let milestoneTier = 'Emerging';
        if (reach >= 10_000_000) milestoneTier = 'Titan (10M+)';
        else if (reach >= 1_000_000) milestoneTier = 'Whale (1M+)';
        else if (reach >= 250_000) milestoneTier = 'Established (250K+)';
        else if (reach >= 50_000) milestoneTier = 'Growth (50K+)';

        const driverPins = Array.isArray(cp.driver_pins) ? cp.driver_pins : [];

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
          milestone_tier: milestoneTier,
          driver_pins: driverPins
        };
      })
      .slice(0, 60);

    // Section 6: Keyword Vacuums & Multi-Keyword Pixie Bridges
    const bridgePins = allActivePins
      .filter(p => p.overlap_count >= 2)
      .map(p => ({
        pin_id: p.pin_id,
        title: p.title,
        image_url: p.image_url,
        domain: p.domain,
        creator_username: p.creator_username,
        board_name: p.board_name,
        dominant_color: p.dominant_color,
        save_count: p.save_count,
        daily_save_velocity: p.daily_save_velocity,
        delta_repins_24h: p.delta_repins_24h,
        keyword_count: p.overlap_count,
        keywords: p.keywords,
        folder_count: p.folder_overlap_count,
        folders: p.folders,
        bridge_score: Number((p.overlap_count * Math.max(1, p.daily_save_velocity)).toFixed(2))
      }))
      .sort((a, b) => {
        if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count;
        if (b.bridge_score !== a.bridge_score) return b.bridge_score - a.bridge_score;
        return b.daily_save_velocity - a.daily_save_velocity;
      })
      .slice(0, 60);

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
          avg_velocity: kwStats.active_pins_count > 0 ? Number((kwStats.total_velocity / kwStats.active_pins_count).toFixed(2)) : 0,
          top_pin: kwStats.top_pin,
          vacuum_score: vacuumScore,
          urgency
        };
      })
      .sort((a, b) => {
        if (b.vacuum_score !== a.vacuum_score) return b.vacuum_score - a.vacuum_score;
        return b.displaced_top10_24h_count - a.displaced_top10_24h_count;
      })
      .slice(0, 40);

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
      .slice(0, 30);

    const vacuumHijackPins = allActivePins
      .filter(p => p.is_vacuum_hijack_target)
      .sort((a, b) => {
        if (b.daily_save_velocity !== a.daily_save_velocity) return b.daily_save_velocity - a.daily_save_velocity;
        return (a.best_rank || 99) - (b.best_rank || 99);
      })
      .slice(0, 40);

    const totalActivePinsCount = allActivePins.length;
    const creationMethodBreakdown = Array.from(creationMethodMap.values())
      .map(cm => ({
        method: cm.method,
        pin_count: cm.pin_count,
        total_velocity: Number(cm.total_velocity.toFixed(2)),
        pct_of_active_serp: totalActivePinsCount > 0 ? Number(((cm.pin_count / totalActivePinsCount) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.pin_count - a.pin_count);

    const dominantColorPalette = Array.from(colorStatsMap.values())
      .map(c => ({
        color: c.color,
        pin_count: c.pin_count,
        total_velocity: Number(c.total_velocity.toFixed(2)),
        avg_velocity: c.pin_count > 0 ? Number((c.total_velocity / c.pin_count).toFixed(2)) : 0
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
      breakout_pins: breakoutPinsTop150,
      fresh_rocket_pins: freshRocketPinsTop50,
      vault_surge_pins: vaultPins,
      pinarchive_winners: paWinners.map(p => ({
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
        triplet_crossovers: tripletCrossovers
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
        creation_method_breakdown: creationMethodBreakdown,
        dominant_color_palette: dominantColorPalette,
        top_arbitrage_domains: topArbitrageDomains
      }
    };

    // Save into L1 memory cache
    setPulseMemoryCache(cacheKey, payload);
    pulseForceRefreshCooldown.set(cacheKey, Date.now());

    // Save into L2 Cloudflare Workers KV for default view
    if (isDefaultFilter && env?.PIN_ENGINE_KV) {
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

  inflightPulse.set(cacheKey, computePromise);

  try {
    return await computePromise;
  } finally {
    inflightPulse.delete(cacheKey);
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
