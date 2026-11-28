/**
 * Keyword Settings, Global App Configuration & Dynamic Registration
 *
 * Implements:
 * - Global App Crawl & Intelligence Settings Management
 * - Per-Keyword Dynamic Depth & Inspection Settings
 * - Keyword Creation & Slug Normalization
 *
 * // [INVARIANT: UNIFIED-POSTGRES-SSOT]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { formatPinterestCookie } from '../../utils.mjs';
import {
  DEFAULT_WORKSPACE_ID,
  parsePositiveWorkspaceId,
  resolveActivePinterestCookie,
  saveWorkspaceCookie
} from '../workspaces/service.mjs';

export const DEFAULT_PINTEREST_SESSION_COOKIE = '';

export const MIN_SERP_QUOTA = 10;
export const MAX_SERP_QUOTA = 2000;
export const DEFAULT_SERP_QUOTA = 50;

function getKeywordSettingsStorageKey(workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  return wid === DEFAULT_WORKSPACE_ID ? 'keyword_crawl_settings' : `keyword_crawl_settings_ws_${wid}`;
}

/**
 * Clamps a SERP pin target count into [10, 2000], returning fallback if non-finite/non-positive.
 */
export function clampSerpQuota(value, fallback = DEFAULT_SERP_QUOTA) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(MIN_SERP_QUOTA, Math.min(MAX_SERP_QUOTA, Math.round(parsed)));
}

/**
 * Computes SERP crawl page count (~25 pins/page) from a pin quota, clamped to [1, 100].
 */
export function computePagesForQuota(pins) {
  const safePins = clampSerpQuota(pins, DEFAULT_SERP_QUOTA);
  return Math.max(1, Math.min(100, Math.ceil(safePins / 25)));
}

/**
 * Single Source of Truth precedence resolver for SERP pin harvest quota:
 *   explicitMaxPins > keywordTargetPins > folderMaxPins > appSettings > keywordPagesLimit * 25 > 50
 */
export function resolveEffectiveSerpQuota({
  explicitMaxPins = null,
  keywordTargetPins = null,
  keywordPagesLimit = null,
  folderMaxPins = null,
  appSettings = null
} = {}) {
  const candidates = [
    explicitMaxPins,
    keywordTargetPins,
    folderMaxPins,
    appSettings?.max_serp_pins,
    appSettings?.default_max_pins,
    (keywordPagesLimit !== undefined && keywordPagesLimit !== null && keywordPagesLimit !== '' && Number(keywordPagesLimit) > 0)
      ? Number(keywordPagesLimit) * 25
      : null
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) {
      return clampSerpQuota(num, DEFAULT_SERP_QUOTA);
    }
  }
  return DEFAULT_SERP_QUOTA;
}

/**
 * Resolves the effective Pinterest session cookie strictly via the unified Workspace Settings SSOT.
 */
export async function getEffectivePinterestCookie(sql, runtimeCookie = '', { workspaceId = DEFAULT_WORKSPACE_ID, env = null } = {}) {
  const resolved = await resolveActivePinterestCookie(sql, {
    workspaceId,
    env,
    runtimeCookie
  });
  return resolved.formattedCookie || '';
}

/**
 * Persists a Pinterest session cookie into the unified Workspace Settings vault without mutating process.env.
 */
export async function savePinterestCookie(sql, rawCookie = '', { workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const cleanRaw = String(rawCookie || '').trim();
  const formatted = formatPinterestCookie(cleanRaw);
  if (sql && typeof sql === 'function') {
    const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
    await saveWorkspaceCookie(sql, wid, cleanRaw);
  }
  const hasCookie = Boolean(formatted && formatted.length > 10);
  return {
    raw: cleanRaw,
    formatted,
    has_cookie: hasCookie,
    preview: hasCookie ? '[CONFIGURED]' : ''
  };
}

/**
 * Retrieves workspace-scoped keyword crawl intelligence settings with unified cookie status.
 * [INVARIANT: ZERO-SECRET-LEAK] Never returns raw Pinterest cookies in settings objects.
 */
export async function getAppSettings(sql, { workspaceId = DEFAULT_WORKSPACE_ID, env = null } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const storageKey = getKeywordSettingsStorageKey(wid);
  const defaultSettings = {
    workspace_id: wid,
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
    has_pinterest_cookie: false,
    breakout_rules: {
      max_pin_age_days: 14,
      min_daily_save_velocity: 3.0,
      min_repins: 1,
      target_rank_zone: [20, 400]
    }
  };

  let kwSettings = {};
  if (sql && typeof sql === 'function') {
    try {
      const rows = wid === DEFAULT_WORKSPACE_ID
        ? await sql`SELECT key, value, updated_at FROM app_settings WHERE key = ${storageKey};`
        : await sql`
            SELECT key, value, updated_at
            FROM app_settings
            WHERE key IN (${storageKey}, 'keyword_crawl_settings')
            ORDER BY CASE WHEN key = ${storageKey} THEN 0 ELSE 1 END ASC;
          `;
      for (const r of (rows || [])) {
        if (r?.value && typeof r.value === 'object') {
          kwSettings = r.value;
          break;
        }
      }
    } catch (err) {
      console.warn('[Settings] Failed reading app_settings from DB:', err.message);
    }
  }

  const cookieState = await resolveActivePinterestCookie(sql, { workspaceId: wid, env })
    .catch(() => ({ hasCookie: false }));

  const {
    pinterest_cookie: _legacyCookie,
    has_pinterest_cookie: _legacyHasCookie,
    ...cleanKwSettings
  } = kwSettings || {};

  return {
    ...defaultSettings,
    ...cleanKwSettings,
    workspace_id: wid,
    pinterest_cookie: '',
    has_pinterest_cookie: Boolean(cookieState?.hasCookie),
    breakout_rules: {
      ...defaultSettings.breakout_rules,
      ...(cleanKwSettings.breakout_rules || {})
    }
  };
}

/**
 * Update Keyword & Crawl Intelligence Settings (workspace-scoped).
 * Optionally propagates updated limits atomically (including downward shrinks) to workspace tracked_keywords
 * and demotes active ranks exceeding the updated target_pin_count to the Displaced Vault.
 */
export async function updateAppSettings(sql, newSettings = {}, { workspaceId = DEFAULT_WORKSPACE_ID, env = null } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const storageKey = getKeywordSettingsStorageKey(wid);
  const current = await getAppSettings(sql, { workspaceId: wid, env });

  const {
    pinterest_cookie: _curCookie,
    has_pinterest_cookie: _curHasCookie,
    apply_to_all: _curApplyToAll,
    apply_global_to_keywords: _curApplyGlobal,
    ...safeCurrent
  } = current;

  const rawIncoming = (newSettings && typeof newSettings === 'object' ? newSettings : {});
  const applyToAll = Boolean(
    rawIncoming.apply_to_all === true ||
    rawIncoming.apply_to_all === 'true' ||
    rawIncoming.apply_global_to_keywords === true
  );
  const {
    pinterest_cookie: _newCookie,
    has_pinterest_cookie: _newHasCookie,
    apply_to_all: _newApplyToAll,
    apply_global_to_keywords: _newApplyGlobal,
    ...safeIncoming
  } = rawIncoming;

  const merged = {
    ...safeCurrent,
    ...safeIncoming,
    workspace_id: wid,
    breakout_rules: {
      ...(safeCurrent.breakout_rules || {}),
      ...(safeIncoming.breakout_rules || {})
    }
  };

  // Always keep max_serp_pins, default_max_pins, and default_crawl_pages in lockstep (supporting downward shrinks cleanly)
  if (safeIncoming.max_serp_pins !== undefined || safeIncoming.default_max_pins !== undefined) {
    const syncedQuota = clampSerpQuota(safeIncoming.max_serp_pins ?? safeIncoming.default_max_pins, DEFAULT_SERP_QUOTA);
    merged.max_serp_pins = syncedQuota;
    merged.default_max_pins = syncedQuota;
    merged.default_crawl_pages = computePagesForQuota(syncedQuota);
  } else if (safeIncoming.default_crawl_pages !== undefined) {
    const pages = Math.max(1, Math.min(100, Math.round(Number(safeIncoming.default_crawl_pages) || 2)));
    merged.default_crawl_pages = pages;
  }

  if (safeIncoming.max_catalog_inspect !== undefined) {
    const rawCap = Math.round(Number(safeIncoming.max_catalog_inspect));
    merged.max_catalog_inspect = Number.isFinite(rawCap) && rawCap >= 0 ? Math.min(5000, rawCap) : 0;
  }

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  await runInTx(async (tx) => {
    await tx`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${storageKey}, ${JSON.stringify(merged)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;

    if (applyToAll) {
      const targetPinCount = resolveEffectiveSerpQuota({
        explicitMaxPins: merged.max_serp_pins ?? merged.default_max_pins,
        keywordPagesLimit: merged.default_crawl_pages
      });
      const pagesLimit = computePagesForQuota(targetPinCount);
      const inspMode = merged.default_inspection_mode ? String(merged.default_inspection_mode).trim() : null;

      if (wid === DEFAULT_WORKSPACE_ID) {
        await tx`
          UPDATE tracked_keywords
          SET
            target_pin_count = ${targetPinCount},
            crawl_pages_limit = ${pagesLimit},
            inspection_mode = COALESCE(${inspMode}, inspection_mode),
            updated_at = NOW();
        `;

        await tx`
          UPDATE keyword_serp_positions
          SET
            is_displaced = TRUE,
            last_known_rank = COALESCE(rank_position, last_known_rank),
            rank_position = NULL,
            displaced_date = COALESCE(displaced_date, (NOW() AT TIME ZONE 'UTC')::date),
            updated_at = NOW()
          WHERE is_displaced = FALSE
            AND rank_position IS NOT NULL
            AND rank_position > ${targetPinCount};
        `;
      } else {
        await tx`
          UPDATE tracked_keywords tk
          SET
            target_pin_count = ${targetPinCount},
            crawl_pages_limit = ${pagesLimit},
            inspection_mode = COALESCE(${inspMode}, tk.inspection_mode),
            updated_at = NOW()
          WHERE EXISTS (
            SELECT 1
            FROM keyword_folder_items kfi
            JOIN keyword_folders kf ON kf.id = kfi.folder_id
            WHERE kfi.keyword_id = tk.id
              AND kf.workspace_id = ${wid}
          );
        `;

        await tx`
          UPDATE keyword_serp_positions ksp
          SET
            is_displaced = TRUE,
            last_known_rank = COALESCE(ksp.rank_position, ksp.last_known_rank),
            rank_position = NULL,
            displaced_date = COALESCE(ksp.displaced_date, (NOW() AT TIME ZONE 'UTC')::date),
            updated_at = NOW()
          WHERE ksp.is_displaced = FALSE
            AND ksp.rank_position IS NOT NULL
            AND ksp.rank_position > ${targetPinCount}
            AND EXISTS (
              SELECT 1
              FROM keyword_folder_items kfi
              JOIN keyword_folders kf ON kf.id = kfi.folder_id
              WHERE kfi.keyword_id = ksp.keyword_id
                AND kf.workspace_id = ${wid}
            );
        `;
      }
    }
  });

  return {
    ...merged,
    pinterest_cookie: '',
    has_pinterest_cookie: Boolean(_curHasCookie)
  };
}

/**
 * Update individual keyword settings (pages limit, inspection mode, target pin count)
 * and atomically demote active ranks exceeding the updated target_pin_count to the Displaced Vault.
 */
export async function updateKeywordSettings(sql, keywordId, settings = {}) {
  const kid = Number(keywordId);
  if (!kid) throw new Error('Valid keyword ID is required');
  const hasExplicitPins = settings.target_pin_count !== undefined && settings.target_pin_count !== null && settings.target_pin_count !== '';
  const hasExplicitPages = settings.crawl_pages_limit !== undefined && settings.crawl_pages_limit !== null && settings.crawl_pages_limit !== '';
  const pinCount = hasExplicitPins
    ? clampSerpQuota(settings.target_pin_count, DEFAULT_SERP_QUOTA)
    : (hasExplicitPages ? clampSerpQuota(Number(settings.crawl_pages_limit) * 25, DEFAULT_SERP_QUOTA) : null);
  // Keep pages cleanly aligned with explicit pinCount so shrinking quota shrinks crawl_pages_limit downward
  const pages = pinCount !== null
    ? computePagesForQuota(pinCount)
    : (hasExplicitPages ? Math.max(1, Math.min(100, Math.round(Number(settings.crawl_pages_limit) || 1))) : null);
  const mode = settings.inspection_mode !== undefined ? String(settings.inspection_mode).trim() : null;

  const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
  const updated = await runInTx(async (tx) => {
    const [row] = await tx`
      UPDATE tracked_keywords
      SET
        crawl_pages_limit = COALESCE(${pages}, crawl_pages_limit),
        inspection_mode = COALESCE(${mode}, inspection_mode),
        target_pin_count = COALESCE(${pinCount}, target_pin_count),
        updated_at = NOW()
      WHERE id = ${kid}
      RETURNING id, keyword, category, target_pin_count, crawl_pages_limit, inspection_mode;
    `;
    const effectiveLimit = row?.target_pin_count != null ? Number(row.target_pin_count) : pinCount;
    if (effectiveLimit && Number.isFinite(effectiveLimit) && effectiveLimit > 0) {
      await tx`
        UPDATE keyword_serp_positions
        SET
          is_displaced = TRUE,
          last_known_rank = COALESCE(rank_position, last_known_rank),
          rank_position = NULL,
          displaced_date = COALESCE(displaced_date, (NOW() AT TIME ZONE 'UTC')::date),
          updated_at = NOW()
        WHERE keyword_id = ${kid}
          AND is_displaced = FALSE
          AND rank_position IS NOT NULL
          AND rank_position > ${effectiveLimit};
      `;
    }
    return row;
  });

  return updated;
}

/**
 * Add a new keyword to track with dynamic depth support inheriting global app_settings when omitted.
 */
export async function addKeyword(sql, { keyword, category = 'General', target_pin_count, crawl_pages_limit, inspection_mode }) {
  const cleanKeyword = keyword.trim().toLowerCase();
  if (!cleanKeyword) throw new Error('Keyword is required.');

  const hasExplicitPins = target_pin_count !== undefined && target_pin_count !== null && target_pin_count !== '';
  const hasExplicitPages = crawl_pages_limit !== undefined && crawl_pages_limit !== null && crawl_pages_limit !== '';
  const hasExplicitMode = typeof inspection_mode === 'string' && inspection_mode.trim().length > 0;

  let appSettings = null;
  if (!hasExplicitPins || !hasExplicitMode) {
    appSettings = await getAppSettings(sql).catch(() => null);
  }

  const resolvedPins = resolveEffectiveSerpQuota({
    explicitMaxPins: hasExplicitPins ? target_pin_count : null,
    keywordPagesLimit: hasExplicitPages ? crawl_pages_limit : null,
    appSettings
  });
  const resolvedPages = hasExplicitPages
    ? Math.max(1, Math.min(100, Number(crawl_pages_limit) || computePagesForQuota(resolvedPins)))
    : computePagesForQuota(resolvedPins);
  const resolvedMode = hasExplicitMode
    ? inspection_mode.trim()
    : (appSettings?.default_inspection_mode || 'full_catalog');

  const explicitPinVal = hasExplicitPins ? resolvedPins : null;
  const explicitPageVal = hasExplicitPages ? resolvedPages : (hasExplicitPins ? resolvedPages : null);

  const [row] = await sql`
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
      ${cleanKeyword},
      NULL,
      ${category},
      ${resolvedPins},
      ${resolvedPages},
      ${resolvedMode},
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT (keyword) DO UPDATE SET
      canonical_keyword = COALESCE(NULLIF(tracked_keywords.canonical_keyword, ''), NULL),
      is_active = TRUE,
      target_pin_count = COALESCE(${explicitPinVal}::int, tracked_keywords.target_pin_count, EXCLUDED.target_pin_count),
      crawl_pages_limit = COALESCE(${explicitPageVal}::int, tracked_keywords.crawl_pages_limit, EXCLUDED.crawl_pages_limit),
      inspection_mode = COALESCE(NULLIF(${hasExplicitMode ? resolvedMode : ''}, ''), tracked_keywords.inspection_mode, EXCLUDED.inspection_mode),
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

  // If not found and autoCreate enabled, create new tracked keyword using global appSettings defaults
  if (autoCreate && normalized.length >= 2) {
    const appSettings = await getAppSettings(sql).catch(() => null);
    const defaultPins = resolveEffectiveSerpQuota({ appSettings });
    const defaultPages = computePagesForQuota(defaultPins);
    const defaultMode = appSettings?.default_inspection_mode || 'full_catalog';

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
        NULL,
        'Organic Search',
        ${defaultPins},
        ${defaultPages},
        ${defaultMode},
        TRUE,
        NOW(),
        NOW()
      )
      ON CONFLICT (keyword) DO UPDATE SET
        canonical_keyword = COALESCE(NULLIF(tracked_keywords.canonical_keyword, ''), NULL),
        is_active = TRUE,
        target_pin_count = COALESCE(tracked_keywords.target_pin_count, EXCLUDED.target_pin_count),
        crawl_pages_limit = COALESCE(tracked_keywords.crawl_pages_limit, EXCLUDED.crawl_pages_limit),
        inspection_mode = COALESCE(tracked_keywords.inspection_mode, EXCLUDED.inspection_mode),
        updated_at = NOW()
      RETURNING *;
    `;
    return created;
  }

  return null;
}
