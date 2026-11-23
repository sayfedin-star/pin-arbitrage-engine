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

export const DEFAULT_WORKSPACE_ID = 1;
export const WORKSPACE_COOKIE_NAME = 'pae_workspace_id';
export const VALID_TRACKING_SOURCES = Object.freeze(['search', 'newborn', 'creator', 'related']);
export const VALID_WATCHLIST_TYPES = Object.freeze(['creator', 'domain', 'pin']);
export const VALID_CREATOR_TRACKING_MODES = Object.freeze(['metrics_only', 'metrics_full_catalog']);

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
export async function getWorkspaceSettings(sql, workspaceId = DEFAULT_WORKSPACE_ID) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  if (!sql || typeof sql !== 'function') {
    return { ...DEFAULT_WORKSPACE_SETTINGS, workspace_id: wid };
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
      return { ...DEFAULT_WORKSPACE_SETTINGS, workspace_id: wid, has_cookie: false };
    }
    return {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...row,
      workspace_id: Number(row.workspace_id),
      max_pin_age_days: Number(row.max_pin_age_days ?? 30),
      min_repin_count: Number(row.min_repin_count ?? 20),
      min_save_count: Number(row.min_save_count ?? 0),
      default_serp_top_n: Number(row.default_serp_top_n ?? 20),
      has_cookie: Boolean(row.has_cookie)
    };
  } catch (err) {
    if (/relation\s+"?workspace_settings"?\s+does\s+not\s+exist/i.test(err?.message || '')) {
      return { ...DEFAULT_WORKSPACE_SETTINGS, workspace_id: wid, has_cookie: false };
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
  const extractionTargets = (patch.extraction_targets && typeof patch.extraction_targets === 'object')
    ? { ...(current.extraction_targets || {}), ...patch.extraction_targets }
    : (current.extraction_targets || DEFAULT_WORKSPACE_SETTINGS.extraction_targets);
  const pinGraphRules = (patch.pin_graph_rules && typeof patch.pin_graph_rules === 'object')
    ? { ...(current.pin_graph_rules || {}), ...patch.pin_graph_rules }
    : (current.pin_graph_rules || DEFAULT_WORKSPACE_SETTINGS.pin_graph_rules);
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

  return saved;
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
    return { added: 0, folder_id: Number(folderId), source_type: cleanSource };
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

  return {
    added: Array.isArray(rows) ? rows.length : 0,
    folder_id: fid,
    workspace_id: wid,
    source_type: cleanSource
  };
}

/**
 * Lists tracked pins for a Campaign, optionally filtered by `sourceType`.
 */
export async function listCampaignTrackedPins(sql, { folderId, workspaceId, sourceType = null } = {}) {
  await assertFolderInWorkspace(sql, folderId, workspaceId);
  const fid = Number(folderId);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const cleanSource = sourceType && VALID_TRACKING_SOURCES.includes(String(sourceType).toLowerCase())
    ? String(sourceType).toLowerCase()
    : null;

  return await sql`
    SELECT folder_id, workspace_id, pin_id, source_type, source_ref, is_active, added_at
    FROM campaign_tracked_pins
    WHERE folder_id = ${fid}
      AND workspace_id = ${wid}
      AND is_active = TRUE
      AND (${cleanSource}::text IS NULL OR source_type = ${cleanSource})
    ORDER BY added_at DESC;
  `;
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
