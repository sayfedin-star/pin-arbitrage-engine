/**
 * src/modules/workspaces/service.mjs
 *
 * V4 Workspace Isolation, Settings SSOT, Watchlist & Unified 4-Source Campaign Pin Tracking Service.
 *
 * Design invariants:
 * - Every user-facing workspace query is strictly scoped by `workspace_id`.
 * - Fail-closed `assertFolderInWorkspace` rejects cross-workspace access with 404.
 * - Raw Pinterest tables remain a shared global background cache.
 * - Offline / no-DB mode gracefully resolves to Default Workspace (id = 1).
 */

import { decodeHtmlEntities } from '../newborn/surface-normalizers.mjs';

export const DEFAULT_WORKSPACE_ID = 1;
export const WORKSPACE_COOKIE_NAME = 'pae_workspace_id';
export const VALID_TRACKING_SOURCES = Object.freeze(['search', 'newborn', 'creator', 'related']);
export const VALID_WATCHLIST_TYPES = Object.freeze(['creator', 'domain', 'pin']);
export const VALID_CREATOR_TRACKING_MODES = Object.freeze(['metrics_only', 'metrics_full_catalog']);
export const VALID_PIN_GRAPH_SEED_STATUSES = Object.freeze(['queued', 'crawled', 'failed']);
export const VALID_PIN_GRAPH_SEED_SOURCES = Object.freeze(['manual', 'trigger', 'newborn', 'search']);

export const DEFAULT_WORKSPACE_ROW = Object.freeze({
  id: DEFAULT_WORKSPACE_ID,
  name: 'Default Workspace',
  slug: 'default',
  icon: 'briefcase',
  is_default: true,
  owner_user_id: null
});

export const DEFAULT_WORKSPACE_SETTINGS = Object.freeze({
  workspace_id: DEFAULT_WORKSPACE_ID,
  max_pin_age_days: 30,
  min_repin_count: 20,
  min_save_count: 0,
  default_serp_top_n: 20,
  execution_mode: 'auto',
  extraction_targets: {
    search: { enabled: true, target_pins: 500 },
    boards: { enabled: true, max_boards: 10, target_pins_per_board: 100 },
    idea_page: { enabled: true, target_pins: 250 },
    home_feed: { enabled: false, target_pins: 250 },
    related_pins: { enabled: false, target_pins: 300 }
  },
  pin_graph_rules: {
    auto_trigger_enabled: false,
    min_repins: 500,
    linkless_only: false,
    max_pages: 20
  },
  rule_profiles: []
});

/**
 * Parses a positive integer workspace ID or returns null.
 */
export function parsePositiveWorkspaceId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Extracts a single cookie value from a Cookie header string.
 */
export function readCookieValue(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string' || !name) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch (_) {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

/**
 * Parses requested workspace ID from HTTP request headers (`x-workspace-id`),
 * query param (`workspace_id`), or `pae_workspace_id` cookie. Falls back to `1`.
 */
export function parseWorkspaceIdFromRequest(request, searchParams = null) {
  const getHeader = (name) => {
    if (!request?.headers) return null;
    if (typeof request.headers.get === 'function') return request.headers.get(name);
    const val = request.headers[name.toLowerCase()] ?? request.headers[name];
    return val !== undefined ? String(val) : null;
  };

  const fromHeader = parsePositiveWorkspaceId(getHeader('x-workspace-id'));
  if (fromHeader) return fromHeader;

  if (searchParams && typeof searchParams.get === 'function') {
    const fromQuery = parsePositiveWorkspaceId(searchParams.get('workspace_id'));
    if (fromQuery) return fromQuery;
  }

  const cookieHeader = getHeader('cookie');
  const fromCookie = parsePositiveWorkspaceId(readCookieValue(cookieHeader, WORKSPACE_COOKIE_NAME));
  if (fromCookie) return fromCookie;

  return DEFAULT_WORKSPACE_ID;
}

/**
 * Builds an HttpOnly SameSite=Lax Set-Cookie header for switching the active workspace.
 */
export function buildWorkspaceCookieHeader(workspaceId, { secure = false } = {}) {
  const safeId = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const attrs = [
    `${WORKSPACE_COOKIE_NAME}=${safeId}`,
    'Path=/',
    'Max-Age=31536000',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * Converts a workspace name into a clean lowercase URL-safe slug.
 */
export function slugifyWorkspaceName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'workspace';
}

/**
 * Lists all workspaces ordered with the default workspace first.
 */
export async function listWorkspaces(sql, { ownerUserId = null } = {}) {
  if (!sql || typeof sql !== 'function') {
    return [{ ...DEFAULT_WORKSPACE_ROW, campaign_count: 0 }];
  }

  try {
    const rows = ownerUserId !== null && ownerUserId !== undefined
      ? await sql`
          SELECT
            w.id,
            w.name,
            w.slug,
            w.icon,
            w.is_default,
            w.owner_user_id,
            w.created_at,
            w.updated_at,
            COALESCE(fc.cnt, 0)::int AS campaign_count
          FROM workspaces w
          LEFT JOIN (
            SELECT workspace_id, COUNT(*)::int AS cnt
            FROM keyword_folders
            GROUP BY workspace_id
          ) fc ON fc.workspace_id = w.id
          WHERE w.owner_user_id = ${Number(ownerUserId)}
          ORDER BY w.is_default DESC, w.id ASC;
        `
      : await sql`
          SELECT
            w.id,
            w.name,
            w.slug,
            w.icon,
            w.is_default,
            w.owner_user_id,
            w.created_at,
            w.updated_at,
            COALESCE(fc.cnt, 0)::int AS campaign_count
          FROM workspaces w
          LEFT JOIN (
            SELECT workspace_id, COUNT(*)::int AS cnt
            FROM keyword_folders
            GROUP BY workspace_id
          ) fc ON fc.workspace_id = w.id
          ORDER BY w.is_default DESC, w.id ASC;
        `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return [{ ...DEFAULT_WORKSPACE_ROW, campaign_count: 0 }];
    }
    return rows.map((r) => ({
      ...r,
      id: Number(r.id),
      is_default: Boolean(r.is_default),
      campaign_count: Number(r.campaign_count || 0)
    }));
  } catch (err) {
    // Graceful fallback before migration 012 is applied on a pre-V4 database
    if (/relation\s+"?workspaces"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      return [{ ...DEFAULT_WORKSPACE_ROW, campaign_count: 0 }];
    }
    throw err;
  }
}

/**
 * Fetches a single workspace by ID (optionally enforcing owner_user_id).
 */
export async function getWorkspaceById(sql, workspaceId, { ownerUserId = null } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId);
  if (!wid) return null;
  if (!sql || typeof sql !== 'function') {
    return wid === DEFAULT_WORKSPACE_ID ? { ...DEFAULT_WORKSPACE_ROW } : null;
  }

  try {
    const rows = ownerUserId !== null && ownerUserId !== undefined
      ? await sql`
          SELECT id, name, slug, icon, is_default, owner_user_id, created_at, updated_at
          FROM workspaces
          WHERE id = ${wid} AND owner_user_id = ${Number(ownerUserId)}
          LIMIT 1;
        `
      : await sql`
          SELECT id, name, slug, icon, is_default, owner_user_id, created_at, updated_at
          FROM workspaces
          WHERE id = ${wid}
          LIMIT 1;
        `;
    const row = rows?.[0];
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      is_default: Boolean(row.is_default)
    };
  } catch (err) {
    if (/relation\s+"?workspaces"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      return wid === DEFAULT_WORKSPACE_ID ? { ...DEFAULT_WORKSPACE_ROW } : null;
    }
    throw err;
  }
}

const WORKSPACE_ID_CACHE_TTL_MS = 30_000;
const _validWorkspaceCacheBySql = new WeakMap();
let _workspaceCacheGen = 0;

export function invalidateWorkspaceCache(sql = null) {
  if (sql && typeof sql === 'function') {
    _validWorkspaceCacheBySql.delete(sql);
    return;
  }
  // WeakMap cannot be cleared globally; bump global generation counter so all cached entries expire immediately
  _workspaceCacheGen++;
}

/**
 * Resolves and validates the active workspace ID against the database (falls back to Default Workspace).
 * Uses a short 30s per-client WeakMap cache invalidated on workspace create/delete to avoid extra DB round-trips.
 */
export async function resolveActiveWorkspaceId(sql, request, searchParams = null, { ownerUserId = null, bypassCache = false } = {}) {
  const requestedId = parseWorkspaceIdFromRequest(request, searchParams);
  if (!sql || typeof sql !== 'function') return requestedId;

  const cacheScope = ownerUserId !== null && ownerUserId !== undefined ? `owner:${Number(ownerUserId)}` : 'global';
  const now = Date.now();
  if (!bypassCache) {
    const clientMap = _validWorkspaceCacheBySql.get(sql);
    const cached = clientMap?.get(cacheScope);
    if (cached && cached.gen === _workspaceCacheGen && now < cached.expiresAt) {
      if (cached.ids.has(requestedId)) return requestedId;
      return cached.fallbackId || DEFAULT_WORKSPACE_ID;
    }
  }

  const all = await listWorkspaces(sql, { ownerUserId });
  const ids = new Set((Array.isArray(all) ? all : []).map((w) => Number(w.id)).filter((id) => Number.isInteger(id) && id > 0));
  const fallbackId = all?.[0]?.id ? Number(all[0].id) : DEFAULT_WORKSPACE_ID;

  let clientMap = _validWorkspaceCacheBySql.get(sql);
  if (!clientMap) {
    clientMap = new Map();
    _validWorkspaceCacheBySql.set(sql, clientMap);
  }
  clientMap.set(cacheScope, {
    ids,
    fallbackId,
    gen: _workspaceCacheGen,
    expiresAt: now + WORKSPACE_ID_CACHE_TTL_MS
  });

  if (ids.has(requestedId)) return requestedId;
  return fallbackId;
}

/**
 * Creates a new Workspace + initializes its `workspace_settings` row.
 */
export async function createWorkspace(sql, { name, icon = 'briefcase', ownerUserId = null } = {}) {
  const cleanName = String(name || '').trim().slice(0, 120);
  if (!cleanName) {
    const err = new Error('Workspace name is required.');
    err.status = 400;
    throw err;
  }

  const cleanIcon = String(icon || 'briefcase').trim().slice(0, 64) || 'briefcase';
  const baseSlug = slugifyWorkspaceName(cleanName);
  const uniqueSlug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  const [created] = await sql`
    INSERT INTO workspaces (name, slug, icon, is_default, owner_user_id, created_at, updated_at)
    VALUES (${cleanName}, ${uniqueSlug}, ${cleanIcon}, FALSE, ${ownerUserId !== null ? Number(ownerUserId) : null}, NOW(), NOW())
    RETURNING id, name, slug, icon, is_default, owner_user_id, created_at, updated_at;
  `;

  if (created?.id) {
    await sql`
      INSERT INTO workspace_settings (workspace_id)
      VALUES (${created.id})
      ON CONFLICT (workspace_id) DO NOTHING;
    `.catch(() => {});
  }

  invalidateWorkspaceCache(sql);

  return created
    ? { ...created, id: Number(created.id), is_default: Boolean(created.is_default), campaign_count: 0 }
    : null;
}

/**
 * Updates a workspace's name or icon.
 */
export async function updateWorkspace(sql, workspaceId, { name, icon } = {}, { ownerUserId = null } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId);
  if (!wid) {
    const err = new Error('Valid numeric workspace ID is required.');
    err.status = 400;
    throw err;
  }

  const cleanName = name !== undefined ? String(name).trim().slice(0, 120) : null;
  if (name !== undefined && !cleanName) {
    const err = new Error('Workspace name cannot be empty.');
    err.status = 400;
    throw err;
  }
  const cleanIcon = icon !== undefined ? String(icon).trim().slice(0, 64) : null;

  const rows = ownerUserId !== null && ownerUserId !== undefined
    ? await sql`
        UPDATE workspaces
        SET
          name = COALESCE(${cleanName}, name),
          icon = COALESCE(${cleanIcon}, icon),
          updated_at = NOW()
        WHERE id = ${wid} AND owner_user_id = ${Number(ownerUserId)}
        RETURNING id, name, slug, icon, is_default, owner_user_id, created_at, updated_at;
      `
    : await sql`
        UPDATE workspaces
        SET
          name = COALESCE(${cleanName}, name),
          icon = COALESCE(${cleanIcon}, icon),
          updated_at = NOW()
        WHERE id = ${wid}
        RETURNING id, name, slug, icon, is_default, owner_user_id, created_at, updated_at;
      `;

  const updated = rows?.[0];
  if (!updated) return null;
  return { ...updated, id: Number(updated.id), is_default: Boolean(updated.is_default) };
}

/**
 * Deletes a non-default workspace (never allows deleting the default or last remaining workspace).
 */
export async function deleteWorkspace(sql, workspaceId, { ownerUserId = null } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId);
  if (!wid) {
    const err = new Error('Valid numeric workspace ID is required.');
    err.status = 400;
    throw err;
  }

  const target = await getWorkspaceById(sql, wid, { ownerUserId });
  if (!target) return null;
  if (target.is_default || target.id === DEFAULT_WORKSPACE_ID) {
    const err = new Error('Cannot delete the default workspace.');
    err.status = 400;
    throw err;
  }

  const remaining = await listWorkspaces(sql, { ownerUserId });
  if (Array.isArray(remaining) && remaining.length <= 1) {
    const err = new Error('Cannot delete the last remaining workspace.');
    err.status = 400;
    throw err;
  }

  const rows = ownerUserId !== null && ownerUserId !== undefined
    ? await sql`
        DELETE FROM workspaces
        WHERE id = ${wid}
          AND is_default = FALSE
          AND owner_user_id = ${Number(ownerUserId)}
          AND (SELECT COUNT(*) FROM workspaces WHERE owner_user_id = ${Number(ownerUserId)}) > 1
        RETURNING id, name, slug;
      `
    : await sql`
        DELETE FROM workspaces
        WHERE id = ${wid}
          AND is_default = FALSE
          AND (SELECT COUNT(*) FROM workspaces) > 1
        RETURNING id, name, slug;
      `;

  if (rows?.[0]) {
    invalidateWorkspaceCache(sql);
    return { ...rows[0], id: Number(rows[0].id) };
  }
  return null;
}

/**
 * Fail-closed ownership guard verifying that `folderId` belongs to `workspaceId`.
 * Returns the folder metadata row if owned, or throws a 404 Error if missing/cross-workspace.
 */
export async function assertFolderInWorkspace(sql, folderId, workspaceId) {
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!Number.isInteger(fid) || fid <= 0) {
    const err = new Error('Valid numeric folder ID is required.');
    err.status = 400;
    throw err;
  }
  if (!sql || typeof sql !== 'function') {
    const err = new Error(`Folder ${fid} not found in workspace ${wid}.`);
    err.status = 404;
    throw err;
  }

  let rows;
  try {
    rows = await sql`
      SELECT id, name, workspace_id, serp_top_n, metadata
      FROM keyword_folders
      WHERE id = ${fid} AND workspace_id = ${wid}
      LIMIT 1;
    `;
  } catch (err) {
    // Graceful compatibility if migration 012 hasn't been applied on an older DB
    if (/column\s+"?workspace_id"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      if (wid !== DEFAULT_WORKSPACE_ID) {
        const notFound = new Error(`Folder ${fid} not found.`);
        notFound.status = 404;
        throw notFound;
      }
      rows = await sql`
        SELECT id, name, metadata
        FROM keyword_folders
        WHERE id = ${fid}
        LIMIT 1;
      `;
    } else {
      throw err;
    }
  }

  const row = rows?.[0];
  if (!row) {
    const notFound = new Error(`Folder ${fid} not found.`);
    notFound.status = 404;
    throw notFound;
  }
  return row;
}

/**
 * Reads unified workspace settings (falling back cleanly to V4 defaults).
 */
function normalizeExtractionTargets(raw = {}, base = DEFAULT_WORKSPACE_SETTINGS.extraction_targets) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const fallback = (base && typeof base === 'object') ? base : DEFAULT_WORKSPACE_SETTINGS.extraction_targets;
  const clampInt = (v, fb, min, max) => {
    if (v === undefined || v === null || v === '') return fb;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  };
  const normBool = (v, fb) => (typeof v === 'boolean' ? v : fb);

  const mkTarget = (key, defaultObj, minPins, maxPins) => {
    const baseSub = (fallback[key] && typeof fallback[key] === 'object') ? fallback[key] : defaultObj;
    const patchSub = (src[key] && typeof src[key] === 'object') ? src[key] : {};
    return {
      enabled: normBool(patchSub.enabled, normBool(baseSub.enabled, defaultObj.enabled)),
      target_pins: clampInt(patchSub.target_pins, baseSub.target_pins ?? defaultObj.target_pins, minPins, maxPins)
    };
  };

  const baseBoards = (fallback.boards && typeof fallback.boards === 'object')
    ? fallback.boards
    : DEFAULT_WORKSPACE_SETTINGS.extraction_targets.boards;
  const patchBoards = (src.boards && typeof src.boards === 'object') ? src.boards : {};

  return {
    search: mkTarget('search', DEFAULT_WORKSPACE_SETTINGS.extraction_targets.search, 10, 5000),
    boards: {
      enabled: normBool(patchBoards.enabled, normBool(baseBoards.enabled, true)),
      max_boards: clampInt(patchBoards.max_boards, baseBoards.max_boards ?? 10, 1, 100),
      target_pins_per_board: clampInt(patchBoards.target_pins_per_board, baseBoards.target_pins_per_board ?? 100, 10, 2000)
    },
    idea_page: mkTarget('idea_page', DEFAULT_WORKSPACE_SETTINGS.extraction_targets.idea_page, 10, 5000),
    home_feed: mkTarget('home_feed', DEFAULT_WORKSPACE_SETTINGS.extraction_targets.home_feed, 10, 5000),
    related_pins: mkTarget('related_pins', DEFAULT_WORKSPACE_SETTINGS.extraction_targets.related_pins, 10, 5000)
  };
}

function normalizePinGraphRules(raw = {}, base = DEFAULT_WORKSPACE_SETTINGS.pin_graph_rules) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const fallback = (base && typeof base === 'object') ? base : DEFAULT_WORKSPACE_SETTINGS.pin_graph_rules;
  const clampInt = (v, fb, min, max) => {
    if (v === undefined || v === null || v === '') return fb;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  };
  const autoTrigger = typeof src.auto_trigger_enabled === 'boolean'
    ? src.auto_trigger_enabled
    : (typeof fallback.auto_trigger_enabled === 'boolean' ? fallback.auto_trigger_enabled : false);
  const linklessOnly = typeof src.linkless_only === 'boolean'
    ? src.linkless_only
    : (typeof fallback.linkless_only === 'boolean' ? fallback.linkless_only : false);
  return {
    auto_trigger_enabled: autoTrigger,
    min_repins: clampInt(src.min_repins, fallback.min_repins ?? 500, 0, 10_000_000),
    linkless_only: linklessOnly,
    max_pages: clampInt(src.max_pages, fallback.max_pages ?? 20, 1, 200)
  };
}

export async function getWorkspaceSettings(sql, workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!sql || typeof sql !== 'function') {
    return {
      ...DEFAULT_WORKSPACE_SETTINGS,
      extraction_targets: normalizeExtractionTargets(),
      pin_graph_rules: normalizePinGraphRules(),
      workspace_id: wid
    };
  }

  try {
    const [row] = await sql`
      SELECT
        workspace_id,
        max_pin_age_days,
        min_repin_count,
        min_save_count,
        default_serp_top_n,
        execution_mode,
        extraction_targets,
        pin_graph_rules,
        (pinterest_cookie_enc IS NOT NULL AND pinterest_cookie_enc <> '') AS has_cookie,
        rule_profiles,
        updated_at
      FROM workspace_settings
      WHERE workspace_id = ${wid}
      LIMIT 1;
    `;
    if (!row) {
      return {
        ...DEFAULT_WORKSPACE_SETTINGS,
        extraction_targets: normalizeExtractionTargets(),
        pin_graph_rules: normalizePinGraphRules(),
        workspace_id: wid,
        has_cookie: false
      };
    }
    return {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...row,
      workspace_id: Number(row.workspace_id),
      max_pin_age_days: Number(row.max_pin_age_days ?? 30),
      min_repin_count: Number(row.min_repin_count ?? 20),
      min_save_count: Number(row.min_save_count ?? 0),
      default_serp_top_n: Number(row.default_serp_top_n ?? 20),
      extraction_targets: normalizeExtractionTargets(row.extraction_targets),
      pin_graph_rules: normalizePinGraphRules(row.pin_graph_rules),
      has_cookie: Boolean(row.has_cookie)
    };
  } catch (err) {
    if (/relation\s+"?workspace_settings"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      return {
        ...DEFAULT_WORKSPACE_SETTINGS,
        extraction_targets: normalizeExtractionTargets(),
        pin_graph_rules: normalizePinGraphRules(),
        workspace_id: wid,
        has_cookie: false
      };
    }
    throw err;
  }
}

/**
 * Updates unified workspace settings with strict bounds validation.
 */
export async function updateWorkspaceSettings(sql, workspaceId, patch = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const current = await getWorkspaceSettings(sql, wid);

  const clamp = (val, fallback, min, max) => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Math.round(Number(val));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const maxPinAgeDays = clamp(patch.max_pin_age_days, current.max_pin_age_days, 1, 3650);
  const minRepinCount = clamp(patch.min_repin_count, current.min_repin_count, 0, 10_000_000);
  const minSaveCount = clamp(patch.min_save_count, current.min_save_count, 0, 10_000_000);
  const defaultSerpTopN = clamp(patch.default_serp_top_n, current.default_serp_top_n, 5, 100);
  const rawMode = String(patch.execution_mode ?? current.execution_mode ?? 'auto').trim().toLowerCase();
  const executionMode = ['auto', 'direct', 'fleet'].includes(rawMode) ? rawMode : 'auto';
  const extractionTargets = normalizeExtractionTargets(
    patch.extraction_targets,
    current.extraction_targets
  );
  const pinGraphRules = normalizePinGraphRules(
    patch.pin_graph_rules,
    current.pin_graph_rules
  );
  const ruleProfiles = Array.isArray(patch.rule_profiles)
    ? patch.rule_profiles
    : (Array.isArray(current.rule_profiles) ? current.rule_profiles : []);

  const [saved] = await sql`
    INSERT INTO workspace_settings (
      workspace_id,
      max_pin_age_days,
      min_repin_count,
      min_save_count,
      default_serp_top_n,
      execution_mode,
      extraction_targets,
      pin_graph_rules,
      rule_profiles,
      updated_at
    ) VALUES (
      ${wid},
      ${maxPinAgeDays},
      ${minRepinCount},
      ${minSaveCount},
      ${defaultSerpTopN},
      ${executionMode},
      ${JSON.stringify(extractionTargets)}::jsonb,
      ${JSON.stringify(pinGraphRules)}::jsonb,
      ${JSON.stringify(ruleProfiles)}::jsonb,
      NOW()
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
      max_pin_age_days = EXCLUDED.max_pin_age_days,
      min_repin_count = EXCLUDED.min_repin_count,
      min_save_count = EXCLUDED.min_save_count,
      default_serp_top_n = EXCLUDED.default_serp_top_n,
      execution_mode = EXCLUDED.execution_mode,
      extraction_targets = EXCLUDED.extraction_targets,
      pin_graph_rules = EXCLUDED.pin_graph_rules,
      rule_profiles = EXCLUDED.rule_profiles,
      updated_at = NOW()
    RETURNING
      workspace_id,
      max_pin_age_days,
      min_repin_count,
      min_save_count,
      default_serp_top_n,
      execution_mode,
      extraction_targets,
      pin_graph_rules,
      (pinterest_cookie_enc IS NOT NULL AND pinterest_cookie_enc <> '') AS has_cookie,
      rule_profiles,
      updated_at;
  `;

  return {
    ...saved,
    extraction_targets: normalizeExtractionTargets(saved?.extraction_targets, extractionTargets),
    pin_graph_rules: normalizePinGraphRules(saved?.pin_graph_rules, pinGraphRules)
  };
}

/**
 * Returns strictly redacted Zone-A cookie status for a workspace.
 * [INVARIANT: ZERO-SECRET-LEAK] NEVER returns raw cookie value or token prefixes.
 */
export async function getWorkspaceCookieStatus(sql, workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!sql || typeof sql !== 'function') {
    return { workspace_id: wid, has_cookie: false, is_configured: false, preview: '' };
  }
  try {
    const [row] = await sql`
      SELECT (pinterest_cookie_enc IS NOT NULL AND pinterest_cookie_enc <> '') AS has_cookie, updated_at
      FROM workspace_settings
      WHERE workspace_id = ${wid}
      LIMIT 1;
    `;
    const hasCookie = Boolean(row?.has_cookie);
    return {
      workspace_id: wid,
      has_cookie: hasCookie,
      is_configured: hasCookie,
      preview: hasCookie ? '[CONFIGURED]' : '',
      updated_at: row?.updated_at || null
    };
  } catch (err) {
    if (/relation\s+"?workspace_settings"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      return { workspace_id: wid, has_cookie: false, is_configured: false, preview: '' };
    }
    throw err;
  }
}

/**
 * Write-only Zone-A Pinterest Session Cookie persistence per workspace.
 * Stores into workspace_settings.pinterest_cookie_enc and NEVER returns raw cookie text.
 */
export async function saveWorkspaceCookie(sql, workspaceId = DEFAULT_WORKSPACE_ID, rawCookie = '') {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanRaw = String(rawCookie || '').trim();
  if (cleanRaw.length <= 10) {
    const err = new Error('A valid Pinterest session cookie string (> 10 characters) is required.');
    err.status = 400;
    throw err;
  }
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to save workspace cookie.');
  }

  await sql`
    INSERT INTO workspace_settings (workspace_id, pinterest_cookie_enc, updated_at)
    VALUES (${wid}, ${cleanRaw}, NOW())
    ON CONFLICT (workspace_id) DO UPDATE SET
      pinterest_cookie_enc = EXCLUDED.pinterest_cookie_enc,
      updated_at = NOW();
  `;

  return {
    workspace_id: wid,
    has_cookie: true,
    is_configured: true,
    preview: '[CONFIGURED]'
  };
}

/**
 * Clears the Zone-A Pinterest Session Cookie for a workspace.
 */
export async function clearWorkspaceCookie(sql, workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to clear workspace cookie.');
  }

  await sql`
    UPDATE workspace_settings
    SET pinterest_cookie_enc = NULL, updated_at = NOW()
    WHERE workspace_id = ${wid};
  `;

  return {
    workspace_id: wid,
    has_cookie: false,
    is_configured: false,
    preview: ''
  };
}

/**
 * Internal resolver for a specific workspace's stored Pinterest session cookie.
 * [INVARIANT: ZERO-SECRET-LEAK] NEVER return the raw cookie value in any HTTP response or log.
 */
export async function resolveWorkspaceRawCookie(sql, workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId);
  if (!wid || !sql || typeof sql !== 'function') {
    return { rawCookie: '', source: 'none' };
  }
  try {
    const [row] = await sql`
      SELECT pinterest_cookie_enc
      FROM workspace_settings
      WHERE workspace_id = ${wid}
      LIMIT 1;
    `;
    const raw = typeof row?.pinterest_cookie_enc === 'string' ? row.pinterest_cookie_enc.trim() : '';
    if (raw.length > 10) {
      return { rawCookie: raw, source: `workspace:${wid}:pinterest_cookie_enc` };
    }
  } catch (_) {}
  return { rawCookie: '', source: 'none' };
}

/**
 * Adds one or more pins to a Campaign's unified 4-source daily tracking table (`campaign_tracked_pins`).
 * Supports source_type: 'search' | 'newborn' | 'creator' | 'related'.
 */
export async function addCampaignTrackedPins(sql, { folderId, workspaceId, pinIds = [], sourceType = 'newborn', sourceRef = '' } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);

  const cleanSource = String(sourceType || '').trim().toLowerCase();
  if (!VALID_TRACKING_SOURCES.includes(cleanSource)) {
    const err = new Error(`Invalid source_type. Allowed values: ${VALID_TRACKING_SOURCES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const cleanPinIds = Array.from(
    new Set(
      (Array.isArray(pinIds) ? pinIds : [pinIds])
        .map((id) => String(id || '').trim())
        .filter((id) => /^\d{6,30}$/.test(id))
    )
  );

  if (cleanPinIds.length === 0) {
    return { added: 0, added_count: 0, folder_id: Number(folderId), source_type: cleanSource };
  }

  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const fid = Number(folderId);
  const cleanRef = String(sourceRef || '').trim().slice(0, 255);

  const rows = await sql`
    INSERT INTO campaign_tracked_pins (folder_id, workspace_id, pin_id, source_type, source_ref, is_active, added_at)
    SELECT ${fid}, ${wid}, p_id, ${cleanSource}, ${cleanRef}, TRUE, NOW()
    FROM UNNEST(${cleanPinIds}::text[]) AS p_id
    ON CONFLICT (folder_id, pin_id, source_type) DO UPDATE SET
      is_active = TRUE,
      source_ref = CASE WHEN EXCLUDED.source_ref <> '' THEN EXCLUDED.source_ref ELSE campaign_tracked_pins.source_ref END
    RETURNING pin_id, source_type;
  `;

  const addedCount = Array.isArray(rows) ? rows.length : 0;
  return {
    added: addedCount,
    added_count: addedCount,
    folder_id: fid,
    workspace_id: wid,
    source_type: cleanSource
  };
}

/**
 * Lists tracked pins for a Campaign, enriched with live `universal_master_pins` metrics and decoded HTML entities.
 */
export async function listCampaignTrackedPins(sql, { folderId, workspaceId, sourceType = null, limit = 250, offset = 0 } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanSource = sourceType && VALID_TRACKING_SOURCES.includes(String(sourceType).toLowerCase())
    ? String(sourceType).toLowerCase()
    : null;
  const lim = Math.max(1, Math.min(500, Number(limit) || 250));
  const off = Math.max(0, Number(offset) || 0);

  const rows = await sql`
    SELECT
      ctp.folder_id,
      ctp.workspace_id,
      ctp.pin_id,
      ctp.source_type,
      ctp.source_ref,
      ctp.is_active,
      ctp.added_at,
      ump.title,
      ump.board_name,
      ump.image_url,
      COALESCE(ump.clean_domain, ump.domain, '') AS domain,
      ump.destination_url,
      ump.creator_username,
      ump.save_count,
      ump.repin_count,
      ump.daily_save_velocity,
      ump.daily_repin_velocity,
      ump.delta_saves_24h,
      ump.delta_repins_24h,
      ump.gains_5d,
      ump.gains_7d,
      ump.gains_10d,
      ump.gains_15d,
      ump.created_at_pinterest,
      ump.last_scraped_at
    FROM campaign_tracked_pins ctp
    LEFT JOIN universal_master_pins ump ON ump.pin_id = ctp.pin_id
    WHERE ctp.folder_id = ${fid}
      AND ctp.workspace_id = ${wid}
      AND ctp.is_active = TRUE
      AND (${cleanSource}::text IS NULL OR ctp.source_type = ${cleanSource})
    ORDER BY COALESCE(ump.daily_save_velocity, 0) DESC, ctp.added_at DESC
    LIMIT ${lim} OFFSET ${off};
  `;

  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    title: decodeHtmlEntities(r.title || ''),
    board_name: decodeHtmlEntities(r.board_name || '')
  }));
}

/**
 * Returns enriched tracked pins plus per-source counts (`all`, `search`, `newborn`, `creator`, `related`).
 */
export async function getCampaignTrackedPinsSummary(sql, { folderId, workspaceId, sourceType = null, limit = 250, offset = 0 } = {}) {
  const folder = await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;

  const [items, countRows] = await Promise.all([
    listCampaignTrackedPins(sql, { folderId: fid, workspaceId: wid, sourceType, limit, offset }),
    sql`
      SELECT source_type, COUNT(*)::int AS cnt
      FROM campaign_tracked_pins
      WHERE folder_id = ${fid}
        AND workspace_id = ${wid}
        AND is_active = TRUE
      GROUP BY source_type;
    `
  ]);

  const sourceCounts = { all: 0, search: 0, newborn: 0, creator: 0, related: 0 };
  for (const row of (Array.isArray(countRows) ? countRows : [])) {
    const key = String(row.source_type || '').toLowerCase();
    const cnt = Number(row.cnt || 0);
    if (key in sourceCounts) {
      sourceCounts[key] = cnt;
      sourceCounts.all += cnt;
    }
  }
  if (sourceCounts.all === 0 && items.length > 0) {
    for (const item of items) {
      const key = String(item.source_type || '').toLowerCase();
      if (key in sourceCounts) sourceCounts[key] += 1;
      sourceCounts.all += 1;
    }
  }

  return {
    folder_id: fid,
    workspace_id: wid,
    serp_top_n: Number(folder?.serp_top_n || 20),
    items,
    total: sourceType && sourceCounts[String(sourceType).toLowerCase()] != null
      ? sourceCounts[String(sourceType).toLowerCase()]
      : sourceCounts.all,
    source_counts: sourceCounts
  };
}

/**
 * Syncs Top-N active SERP pins from all keywords in a Campaign into `campaign_tracked_pins` (`source_type = 'search'`).
 */
export async function syncCampaignTopNSerpPins(sql, { folderId, workspaceId, topN = null } = {}) {
  const folder = await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const rawTopN = topN !== null && topN !== undefined && topN !== ''
    ? Math.round(Number(topN))
    : Math.round(Number(folder?.serp_top_n || 20));
  const cleanTopN = Number.isFinite(rawTopN) ? Math.min(100, Math.max(5, rawTopN)) : 20;

  const topSerpRows = await sql`
    SELECT DISTINCT ksp.pin_id
    FROM keyword_folder_items kfi
    JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
    WHERE kfi.folder_id = ${fid}
      AND ksp.is_displaced = FALSE
      AND ksp.rank_position IS NOT NULL
      AND ksp.rank_position >= 1
      AND ksp.rank_position <= ${cleanTopN}
      AND ksp.pin_id IS NOT NULL
      AND ksp.pin_id <> ''
    ORDER BY ksp.pin_id ASC;
  `;

  const pinIds = (Array.isArray(topSerpRows) ? topSerpRows : [])
    .map((r) => String(r.pin_id || '').trim())
    .filter((id) => /^\d{6,30}$/.test(id));

  if (pinIds.length === 0) {
    return {
      synced: 0,
      top_n: cleanTopN,
      folder_id: fid,
      workspace_id: wid,
      source_type: 'search'
    };
  }

  const res = await addCampaignTrackedPins(sql, {
    folderId: fid,
    workspaceId: wid,
    pinIds,
    sourceType: 'search',
    sourceRef: `serp_top_${cleanTopN}`
  });

  return {
    synced: res.added,
    top_n: cleanTopN,
    folder_id: fid,
    workspace_id: wid,
    source_type: 'search'
  };
}

/**
 * Removes (deactivates) a tracked pin from a Campaign.
 */
export async function removeCampaignTrackedPin(sql, { folderId, workspaceId, pinId, sourceType = null } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanPinId = String(pinId || '').trim();
  const cleanSource = sourceType && VALID_TRACKING_SOURCES.includes(String(sourceType).toLowerCase())
    ? String(sourceType).toLowerCase()
    : null;

  const deleted = await sql`
    DELETE FROM campaign_tracked_pins
    WHERE folder_id = ${fid}
      AND workspace_id = ${wid}
      AND pin_id = ${cleanPinId}
      AND (${cleanSource}::text IS NULL OR source_type = ${cleanSource})
    RETURNING pin_id, source_type;
  `;

  return { removed: Array.isArray(deleted) ? deleted.length : 0, pin_id: cleanPinId };
}

// =========================================================================
// CAMPAIGN PIN GRAPH SEEDS (`campaign_pin_graph_seeds`)
// =========================================================================

export async function listCampaignPinGraphSeeds(sql, { folderId, workspaceId, status = null } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const rawStatus = status ? String(status).trim().toLowerCase() : '';
  const mappedStatus = rawStatus === 'pending' ? 'queued' : (rawStatus === 'done' ? 'crawled' : rawStatus);
  const cleanStatus = mappedStatus && VALID_PIN_GRAPH_SEED_STATUSES.includes(mappedStatus)
    ? mappedStatus
    : null;

  const rows = await sql`
    SELECT
      s.folder_id,
      s.workspace_id,
      s.seed_pin_id,
      s.source_type,
      s.status,
      s.last_crawled_at,
      s.created_at,
      ump.title,
      ump.image_url,
      COALESCE(ump.clean_domain, ump.domain, '') AS domain,
      ump.save_count,
      ump.repin_count,
      ump.daily_save_velocity
    FROM campaign_pin_graph_seeds s
    LEFT JOIN universal_master_pins ump ON ump.pin_id = s.seed_pin_id
    WHERE s.folder_id = ${fid}
      AND s.workspace_id = ${wid}
      AND (${cleanStatus}::text IS NULL OR s.status = ${cleanStatus})
    ORDER BY s.created_at DESC;
  `;

  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    last_run_at: r.last_crawled_at || null,
    title: decodeHtmlEntities(r.title || '')
  }));
}

export async function addCampaignPinGraphSeeds(sql, { folderId, workspaceId, pinIds = [], sourceType = 'manual', depth = 1 } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanDepth = Math.min(3, Math.max(1, Math.round(Number(depth) || 1)));
  const rawSource = String(sourceType || 'manual').trim().toLowerCase();
  const cleanSource = VALID_PIN_GRAPH_SEED_SOURCES.includes(rawSource) ? rawSource : 'manual';
  const cleanPinIds = Array.from(
    new Set(
      (Array.isArray(pinIds) ? pinIds : [pinIds])
        .map((id) => String(id || '').trim())
        .filter((id) => /^\d{6,30}$/.test(id))
    )
  );

  if (cleanPinIds.length === 0) {
    return { added: 0, folder_id: fid, workspace_id: wid, source_type: cleanSource, depth: cleanDepth };
  }

  const rows = await sql`
    INSERT INTO campaign_pin_graph_seeds (folder_id, workspace_id, seed_pin_id, source_type, status, created_at)
    SELECT ${fid}, ${wid}, p_id, ${cleanSource}, 'queued', NOW()
    FROM UNNEST(${cleanPinIds}::text[]) AS p_id
    ON CONFLICT (folder_id, seed_pin_id) DO UPDATE SET
      source_type = CASE WHEN EXCLUDED.source_type <> 'manual' THEN EXCLUDED.source_type ELSE campaign_pin_graph_seeds.source_type END,
      status = CASE WHEN campaign_pin_graph_seeds.status = 'failed' THEN 'queued' ELSE campaign_pin_graph_seeds.status END
    RETURNING seed_pin_id, source_type, status;
  `;

  return {
    added: Array.isArray(rows) ? rows.length : 0,
    folder_id: fid,
    workspace_id: wid,
    source_type: cleanSource,
    depth: cleanDepth,
    seeds: Array.isArray(rows) ? rows : []
  };
}

export async function removeCampaignPinGraphSeed(sql, { folderId, workspaceId, pinId } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanPinId = String(pinId || '').trim();

  const deleted = await sql`
    DELETE FROM campaign_pin_graph_seeds
    WHERE folder_id = ${fid}
      AND workspace_id = ${wid}
      AND seed_pin_id = ${cleanPinId}
    RETURNING seed_pin_id;
  `;

  return { removed: Array.isArray(deleted) ? deleted.length : 0, seed_pin_id: cleanPinId };
}

// =========================================================================
// UNIFIED WORKSPACE WATCHLIST (`workspace_watchlist`)
// =========================================================================

export function normalizeWatchlistEntityKey(entityType, rawKey) {
  const type = String(entityType || '').trim().toLowerCase();
  const raw = String(rawKey || '').trim();
  if (!raw) return '';
  if (type === 'creator') {
    return raw.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
  }
  if (type === 'domain') {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '')
      .trim()
      .toLowerCase();
  }
  if (type === 'pin') {
    const match = raw.match(/(\d{6,30})/);
    return match ? match[1] : '';
  }
  return '';
}

export async function listWatchlist(sql, { workspaceId = DEFAULT_WORKSPACE_ID, entityType = null, limit = 250, offset = 0 } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!sql) {
    return { items: [], counts: { all: 0, creator: 0, domain: 0, pin: 0 } };
  }
  const cleanType = entityType && VALID_WATCHLIST_TYPES.includes(String(entityType).toLowerCase())
    ? String(entityType).toLowerCase()
    : null;
  const lim = Math.max(1, Math.min(500, Number(limit) || 250));
  const off = Math.max(0, Number(offset) || 0);

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        w.id,
        w.workspace_id,
        w.entity_type,
        w.entity_key,
        w.creator_tracking_mode,
        w.notes,
        w.added_from_folder_id,
        w.created_at,
        w.updated_at,
        cp.id AS competitor_id,
        cp.display_name AS creator_display_name,
        cp.avatar_url AS creator_avatar_url,
        cp.monthly_reach AS creator_monthly_reach,
        cp.profile_views AS creator_profile_views,
        cp.total_pins AS creator_total_pins,
        cp.total_boards AS creator_total_boards,
        ump.title AS pin_title,
        ump.image_url AS pin_image_url,
        ump.save_count AS pin_save_count,
        ump.repin_count AS pin_repin_count,
        ump.daily_save_velocity AS pin_daily_save_velocity,
        COALESCE(ump.clean_domain, ump.domain, '') AS pin_domain
      FROM workspace_watchlist w
      LEFT JOIN competitor_profiles cp
        ON w.entity_type = 'creator' AND LOWER(cp.username) = LOWER(w.entity_key)
      LEFT JOIN universal_master_pins ump
        ON w.entity_type = 'pin' AND ump.pin_id = w.entity_key
      WHERE w.workspace_id = ${wid}
        AND (${cleanType}::text IS NULL OR w.entity_type = ${cleanType})
      ORDER BY w.updated_at DESC, w.id DESC
      LIMIT ${lim} OFFSET ${off};
    `,
    sql`
      SELECT entity_type, COUNT(*)::int AS cnt
      FROM workspace_watchlist
      WHERE workspace_id = ${wid}
      GROUP BY entity_type;
    `
  ]);

  const counts = { all: 0, creator: 0, domain: 0, pin: 0 };
  for (const row of (Array.isArray(countRows) ? countRows : [])) {
    const key = String(row.entity_type || '').toLowerCase();
    const cnt = Number(row.cnt || 0);
    if (key in counts) {
      counts[key] = cnt;
      counts.all += cnt;
    }
  }

  const items = (Array.isArray(rows) ? rows : []).map((r) => {
    const decodedTitle = r.pin_title ? decodeHtmlEntities(r.pin_title) : null;
    return {
      ...r,
      id: Number(r.id),
      workspace_id: Number(r.workspace_id || wid),
      display_label: r.creator_display_name || decodedTitle || r.entity_key,
      is_active: true,
      added_at: r.created_at || null,
      pin_title: decodedTitle
    };
  });

  return { items, counts };
}

export async function upsertWatchlistItem(sql, {
  workspaceId = DEFAULT_WORKSPACE_ID,
  entityType,
  entityKey,
  creatorTrackingMode = 'metrics_only',
  notes = '',
  addedFromFolderId = null
} = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanType = String(entityType || '').trim().toLowerCase();
  if (!VALID_WATCHLIST_TYPES.includes(cleanType)) {
    const err = new Error(`Invalid entity_type. Allowed values: ${VALID_WATCHLIST_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const cleanKey = normalizeWatchlistEntityKey(cleanType, entityKey);
  if (!cleanKey) {
    const err = new Error(`Invalid entity_key for ${cleanType}.`);
    err.status = 400;
    throw err;
  }

  const rawMode = creatorTrackingMode !== undefined && creatorTrackingMode !== null
    ? String(creatorTrackingMode).trim().toLowerCase()
    : '';
  if (rawMode && !VALID_CREATOR_TRACKING_MODES.includes(rawMode)) {
    const err = new Error(`Invalid creator_tracking_mode. Allowed: ${VALID_CREATOR_TRACKING_MODES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const cleanMode = rawMode || 'metrics_only';
  const cleanNotes = String(notes || '').trim().slice(0, 1000);
  const parsedFolderId = Number(addedFromFolderId);
  const cleanFolderId = Number.isInteger(parsedFolderId) && parsedFolderId > 0 ? parsedFolderId : null;

  const [item] = await sql`
    INSERT INTO workspace_watchlist (
      workspace_id, entity_type, entity_key,
      creator_tracking_mode, notes, added_from_folder_id, created_at, updated_at
    ) VALUES (
      ${wid}, ${cleanType}, ${cleanKey},
      ${cleanMode}, ${cleanNotes}, ${cleanFolderId}, NOW(), NOW()
    )
    ON CONFLICT (workspace_id, entity_type, entity_key) DO UPDATE SET
      creator_tracking_mode = EXCLUDED.creator_tracking_mode,
      notes = CASE WHEN EXCLUDED.notes <> '' THEN EXCLUDED.notes ELSE workspace_watchlist.notes END,
      added_from_folder_id = COALESCE(EXCLUDED.added_from_folder_id, workspace_watchlist.added_from_folder_id),
      updated_at = NOW()
    RETURNING *;
  `;

  return item
    ? {
        ...item,
        id: Number(item.id),
        workspace_id: Number(item.workspace_id || wid),
        is_active: true,
        added_at: item.created_at || null
      }
    : null;
}

export async function updateWatchlistItem(sql, {
  workspaceId = DEFAULT_WORKSPACE_ID,
  id,
  creatorTrackingMode,
  notes
} = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    const err = new Error('Invalid watchlist item ID.');
    err.status = 400;
    throw err;
  }

  const cleanMode = creatorTrackingMode !== undefined
    ? (VALID_CREATOR_TRACKING_MODES.includes(String(creatorTrackingMode).trim().toLowerCase())
        ? String(creatorTrackingMode).trim().toLowerCase()
        : null)
    : null;
  if (creatorTrackingMode !== undefined && !cleanMode) {
    const err = new Error(`Invalid creator_tracking_mode. Allowed: ${VALID_CREATOR_TRACKING_MODES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const cleanNotes = notes !== undefined ? String(notes).trim().slice(0, 1000) : null;

  const [updated] = await sql`
    UPDATE workspace_watchlist
    SET
      creator_tracking_mode = COALESCE(${cleanMode}, creator_tracking_mode),
      notes = COALESCE(${cleanNotes}, notes),
      updated_at = NOW()
    WHERE id = ${itemId}
      AND workspace_id = ${wid}
    RETURNING *;
  `;

  if (!updated) {
    const err = new Error(`Watchlist item #${itemId} not found in active workspace.`);
    err.status = 404;
    throw err;
  }

  return {
    ...updated,
    id: Number(updated.id),
    workspace_id: Number(updated.workspace_id || wid),
    is_active: true,
    added_at: updated.created_at || null
  };
}

export async function removeWatchlistItem(sql, { workspaceId = DEFAULT_WORKSPACE_ID, id } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    const err = new Error('Invalid watchlist item ID.');
    err.status = 400;
    throw err;
  }

  const [deleted] = await sql`
    DELETE FROM workspace_watchlist
    WHERE id = ${itemId}
      AND workspace_id = ${wid}
    RETURNING id, entity_type, entity_key;
  `;

  if (!deleted) {
    const err = new Error(`Watchlist item #${itemId} not found in active workspace.`);
    err.status = 404;
    throw err;
  }

  return { removed: true, id: Number(deleted.id), entity_type: deleted.entity_type, entity_key: deleted.entity_key };
}
