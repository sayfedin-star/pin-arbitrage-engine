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

import { formatPinterestCookie } from '../../utils.mjs';

export const DEFAULT_PINTEREST_SESSION_COOKIE = 'TWc9PSY3MWdsMGRpd3NEVkQ4Mjg0cm1la2crV29mVS80ckp0SVRpTFZISk40MjlNWk1kSDE0Sm9aZDNrYXozZjc5aHZiOGZUT0YvYTYxK2hsa2Q1WnBrU01SYkdobTM5bFVwVzVtTjZzOWhLNHpoSWVLaGo2WkdJWWM1WmhQWkc5RSs2SE9nUStiNFJleTJoQ0VqYUxMT1hZVW1lQ2xnekVic2xtZUpiMi91SnZWbDZKNnBjNmVlYldEQUU5TVVtT29pd2lqcmZBOWVpQXVnZXYrcGZNaWI2QWd2ZkN5OVdXV3dHUStRUmJBUWFROWdacjJoVWNsY1JBRzNKbXN4cjQ1dUI3T25SQUJhWGlvUUg0Q3J0YzViNjVkQm5XQWthT2Y2azhqY25NMnoxMjFNcHhxN2pLcUQ1WDhOT0pCVzgzeEpkWGd1NkpkemtGdnRBNGdDeGtyWWZUdHFsQ3V5eFRsbWZ4cFEwdGRwc25rdkFobFdqOFdVc25kSnl2cU5SV3hYTEw1Ny9laWFQbGtaMTRGNHFKb2MxMkMxbUg3TXdRWTI1UE1KQ1BtN0hWWmhKeWxwWS95bzJtQUxoTHVjbkFlR2lRc0ZKTU42SlhFdnFhNXI2c05xNHZaNXFHOUs5RGF4VHVCRytEQzhRVTdvUDFLMWlGNFlWcUI2SlhKSDMvVVNVc3RiTWF5VFE5OXIvYlFWTFNrTWhWNGkzQnZPQ1pkVEJpQ3ZQWXpTeEFNZFdKRUVBamtHdGIrMGRjNWpjcGNWbXpOUDhGOHdYckJjVWRzTExQazYwYzRJOXV6UW1VQVpKK3kwZHcxMGlxNXNaRUk4ZUxZbU1wZDQwMTZUajRYMVZYY3Z1NTczNEZDOHEzNjJGSnpUdkFMbkx1WVpReTR2UTVZdUYvVXdUZXV1MGhSbDFLbDd2OTh1KytxNTc1VDQ0UUtDZzE0ZDdzcEZRZjJkSHBBVFExYVZkWFN4dVZKcE12bm90WkdCemlDaGJaVU0zZHRUYW5RN1pWcThoQmtCa2ZxdnJjUGFMT2RVa01OYzRPVTErOFdSSkVxa0g1M2QxVDU2Y2YyMEdCdmtXTVlHcEUzTjVnNEdlcXhXclZTaldibWMwWHJwTHpYMUs4bWtxSlFZVFdyQkVCQmZFdmEwd1hFaWtJUlpBMnl2T3ZHdlRJNzEzQ2lKVkI1Ym9GWldqRHl1NERmczRkMzJIWTV5T2ZZU1ZIbUtBSlB5Nms5ZTZSTnNNYVBXeFVSWFBuaktHM29MS0JoMXY3WDRpa3ZJTER3TWdPTlRLNC9WV2N3TDZXVjFSa01LdTVia2xlQWg4UnJNMi9hN3NNM002VFAxV25LN3hPS1Z1aG9Gd3pCV3hQdGxqeVkyNUl6SlVJeUNLbDd4U2d3T1doeTFxSWVwL1pvMWNiMXNGc1NkY2xyaERpME1VcGV5cFIySzE4UlB2YzhpazA4SGh3dWF5TmV0WnBWb2Q2YXVLM3FtWVhxdHF3Mk9ZN0plRXFKWWlGSDVyaDd0TDBla2FlWGZDODVjZ2N6MmRvcmgySnl5RTVtTDl0dVVmTGtncjBzS1pRVDdTU0VIcEU2Mk96VkRZN1h4RXYycDQ0OTZqSVRaZEV1akIwN3hKcldxbGY5RG82TUdCTFZPZW11bGRFY3ZnSGF5Nlp0WXNXa3F2ckwxR05vZ29JbXlmSlVmSE1VY0VTRmF5MjVtSzQvbDF0WW1XcmMrRU1qcVVVU21EdGlBN2dESGNUQzk2bk5XbithYnh3d3N0ZEY1MWlsMnp4K2RoUzRweXAmM0ZoQlBRa2puNGd5OUFTWkZqTTZQeFdOYlZjPQ==';

/**
 * Resolves the effective Pinterest session cookie across DB app_settings, process.env, and fallback.
 */
export async function getEffectivePinterestCookie(sql, runtimeCookie = '') {
  let raw = '';
  if (sql && typeof sql === 'function') {
    try {
      const rows = await sql`
        SELECT key, value
        FROM app_settings
        WHERE key IN ('pinterest_cookie', 'keyword_crawl_settings')
        ORDER BY CASE WHEN key = 'pinterest_cookie' THEN 0 ELSE 1 END ASC;
      `;
      for (const r of (rows || [])) {
        const val = r?.value;
        if (!val) continue;
        if (typeof val === 'string' && val.trim().length > 10) {
          raw = val.trim();
          break;
        }
        if (typeof val === 'object') {
          const candidate = val.cookie || val.raw_cookie || val.pinterest_cookie || val.formatted_cookie || '';
          if (typeof candidate === 'string' && candidate.trim().length > 10) {
            raw = candidate.trim();
            break;
          }
        }
      }
    } catch (_) {}
  }

  if (!raw && runtimeCookie && typeof runtimeCookie === 'string' && runtimeCookie.trim().length > 10) {
    raw = runtimeCookie.trim();
  }
  if (!raw && typeof process !== 'undefined' && process.env?.PINTEREST_COOKIE && process.env.PINTEREST_COOKIE.trim().length > 10) {
    raw = process.env.PINTEREST_COOKIE.trim();
  }
  if (!raw) {
    raw = DEFAULT_PINTEREST_SESSION_COOKIE;
  }

  const formatted = formatPinterestCookie(raw);
  if (formatted && typeof process !== 'undefined' && process.env && !process.env.PINTEREST_COOKIE) {
    process.env.PINTEREST_COOKIE = formatted;
  }
  return formatted;
}

/**
 * Persists a Pinterest session cookie to PostgreSQL app_settings and updates process.env in memory.
 */
export async function savePinterestCookie(sql, rawCookie = '') {
  const cleanRaw = String(rawCookie || '').trim();
  const formatted = formatPinterestCookie(cleanRaw);
  if (typeof process !== 'undefined' && process.env) {
    process.env.PINTEREST_COOKIE = formatted;
  }
  if (sql && typeof sql === 'function') {
    const payload = {
      cookie: cleanRaw,
      formatted_cookie: formatted,
      has_cookie: Boolean(formatted && formatted.length > 10),
      updated_at: new Date().toISOString()
    };
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('pinterest_cookie', ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;
  }
  return {
    raw: cleanRaw,
    formatted,
    has_cookie: Boolean(formatted && formatted.length > 10),
    preview: formatted ? `${formatted.slice(0, 38)}...` : ''
  };
}

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
    pinterest_cookie: DEFAULT_PINTEREST_SESSION_COOKIE,
    breakout_rules: {
      max_pin_age_days: 14,
      min_daily_save_velocity: 3.0,
      min_repins: 1,
      target_rank_zone: [20, 400]
    }
  };
  try {
    const rows = await sql`SELECT key, value, updated_at FROM app_settings WHERE key IN ('keyword_crawl_settings', 'pinterest_cookie');`;
    let kwSettings = {};
    let cookieOverride = '';
    for (const r of (rows || [])) {
      if (r.key === 'keyword_crawl_settings' && r.value && typeof r.value === 'object') {
        kwSettings = r.value;
      } else if (r.key === 'pinterest_cookie' && r.value) {
        cookieOverride = typeof r.value === 'string'
          ? r.value
          : (r.value.cookie || r.value.formatted_cookie || '');
      }
    }
    const resolvedCookie = cookieOverride || kwSettings.pinterest_cookie || (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : '') || DEFAULT_PINTEREST_SESSION_COOKIE;
    return {
      ...defaultSettings,
      ...kwSettings,
      pinterest_cookie: resolvedCookie,
      has_pinterest_cookie: Boolean(resolvedCookie && String(resolvedCookie).trim().length > 10),
      breakout_rules: {
        ...defaultSettings.breakout_rules,
        ...(kwSettings.breakout_rules || {})
      }
    };
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
  if (newSettings.pinterest_cookie !== undefined && String(newSettings.pinterest_cookie || '').trim()) {
    await savePinterestCookie(sql, newSettings.pinterest_cookie);
  }
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
  const pages = settings.crawl_pages_limit !== undefined ? Math.max(1, Math.min(100, Number(settings.crawl_pages_limit))) : null;
  const mode = settings.inspection_mode !== undefined ? String(settings.inspection_mode).trim() : null;
  const pinCount = settings.target_pin_count !== undefined 
    ? Math.max(10, Math.min(2000, Number(settings.target_pin_count))) 
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
// [INVARIANT: READ-ONLY-GET-SAFE] Default autoCreate to false to protect read-only endpoints
export async function resolveKeywordBySlug(sql, slug, autoCreate = false) {
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
