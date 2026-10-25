/**
 * Keyword Settings, Global App Configuration & Dynamic Registration
 *
 * Implements:
 * - Global App Crawl & Intelligence Settings Management
 * - Per-Keyword Dynamic Depth & Inspection Settings
 * - Keyword Creation & Slug Normalization
 *
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 */

/**
 * Retrieves global keyword app settings with fallback defaults.
 */
export async function getAppSettings(sql) {
  const defaultSettings = {
    enable_serp_harvest: true,
    default_crawl_pages: 2,
    default_max_pins: 50,
    max_serp_pins: 50,
    max_catalog_inspect: 0,
    default_crawl_scope: 'all_pins',
    default_inspection_mode: 'full_catalog',
    exclude_promoted: true,
    exclude_boards_and_suggestions: true,
    exclude_ignored_pins: true,
    breakout_rules: {
      max_pin_age_days: 14,
      min_daily_save_velocity: 3.0,
      min_repins: 1,
      target_rank_zone: [20, 400]
    }
  };
  try {
    const rows = await sql`SELECT key, value, updated_at FROM app_settings WHERE key = 'keyword_crawl_settings';`;
    if (rows.length > 0 && rows[0].value) {
      return {
        ...defaultSettings,
        ...rows[0].value,
        breakout_rules: {
          ...defaultSettings.breakout_rules,
          ...(rows[0].value.breakout_rules || {})
        }
      };
    }
  } catch (err) {
    console.warn('[Settings] Failed reading app_settings from DB:', err.message);
  }
  return defaultSettings;
}

/**
 * Update Global Keyword & Crawl Intelligence Settings
 */
export async function updateAppSettings(sql, newSettings = {}) {
  const current = await getAppSettings(sql);
  const merged = {
    ...current,
    ...newSettings,
    breakout_rules: {
      ...(current.breakout_rules || {}),
      ...(newSettings.breakout_rules || {})
    }
  };
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('keyword_crawl_settings', ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW();
  `;
  return merged;
}

/**
 * Update individual keyword settings (pages limit, inspection mode, target pin count)
 */
export async function updateKeywordSettings(sql, keywordId, settings = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');
  const pages = settings.crawl_pages_limit !== undefined ? Math.max(1, Math.min(40, Number(settings.crawl_pages_limit))) : null;
  const mode = settings.inspection_mode !== undefined ? String(settings.inspection_mode).trim() : null;
  const pinCount = settings.target_pin_count !== undefined 
    ? Math.max(25, Math.min(1000, Number(settings.target_pin_count))) 
    : (pages ? pages * 25 : null);

  const [updated] = await sql`
    UPDATE tracked_keywords
    SET 
      crawl_pages_limit = COALESCE(${pages}, crawl_pages_limit),
      inspection_mode = COALESCE(${mode}, inspection_mode),
      target_pin_count = COALESCE(${pinCount}, target_pin_count),
      updated_at = NOW()
    WHERE id = ${kid}
    RETURNING id, keyword, category, target_pin_count, crawl_pages_limit, inspection_mode;
  `;
  return updated;
}

/**
 * Add a new keyword to track with dynamic depth support
 */
export async function addKeyword(sql, { keyword, category = 'General', target_pin_count = 250, crawl_pages_limit = 10, inspection_mode = 'full_catalog' }) {
  const cleanKeyword = keyword.trim().toLowerCase();
  if (!cleanKeyword) throw new Error('Keyword is required.');

  const [row] = await sql`
    INSERT INTO tracked_keywords (
      keyword,
      category,
      target_pin_count,
      crawl_pages_limit,
      inspection_mode,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      ${cleanKeyword},
      ${category},
      ${target_pin_count},
      ${crawl_pages_limit},
      ${inspection_mode},
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT (keyword) DO UPDATE SET
      is_active = TRUE,
      target_pin_count = GREATEST(tracked_keywords.target_pin_count, EXCLUDED.target_pin_count),
      crawl_pages_limit = GREATEST(tracked_keywords.crawl_pages_limit, EXCLUDED.crawl_pages_limit),
      inspection_mode = EXCLUDED.inspection_mode,
      updated_at = NOW()
    RETURNING *;
  `;
  return row;
}

/**
 * Resolve or auto-register a keyword from a URL slug or search query
 * Supports: 'tater-tot-casserole', 'tater%20tot%20casserole', 'tater tot casserole'
 */
export async function resolveKeywordBySlug(sql, slug, autoCreate = true) {
  if (!slug || typeof slug !== 'string') return null;
  const raw = decodeURIComponent(slug).trim();
  if (!raw) return null;
  const normalized = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const cleanSlug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // [OPTIMIZED SARGABLE: Instant Unique Index Seek < 1ms via uq_canonical_tracked_keywords]
  const [existing] = await sql`
    SELECT *
    FROM tracked_keywords
    WHERE canonical_keyword = ${cleanSlug}
       OR keyword = ${normalized}
    ORDER BY created_at DESC
    LIMIT 1;
  `;

  if (existing) return existing;

  // If not found and autoCreate enabled, create new tracked keyword
  if (autoCreate && normalized.length >= 2) {
    const [created] = await sql`
      INSERT INTO tracked_keywords (
        keyword,
        canonical_keyword,
        category,
        target_pin_count,
        crawl_pages_limit,
        inspection_mode,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${normalized},
        ${cleanSlug},
        'Organic Search',
        50,
        2,
        'full_catalog',
        TRUE,
        NOW(),
        NOW()
      )
      ON CONFLICT (keyword) DO UPDATE SET
        canonical_keyword = COALESCE(tracked_keywords.canonical_keyword, EXCLUDED.canonical_keyword),
        is_active = TRUE,
        target_pin_count = GREATEST(tracked_keywords.target_pin_count, EXCLUDED.target_pin_count),
        crawl_pages_limit = GREATEST(tracked_keywords.crawl_pages_limit, EXCLUDED.crawl_pages_limit),
        inspection_mode = EXCLUDED.inspection_mode,
        updated_at = NOW()
      RETURNING *;
    `;
    return created;
  }

  return null;
}
