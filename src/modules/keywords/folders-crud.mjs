/**
 * Campaign / Project Folder CRUD, Keyword Linking, Domain Pinning & Pruning Service
 * Extracted from src/modules/keywords/folders-service.mjs
 */

import {
  normalizePinterestUsername,
  RESERVED_PINTEREST_PATHS,
  syncCompetitorProfile,
  sanitizeStoredCeilingDelta
} from '../creators/competitors-crud.mjs';
import { normalizeFolderMetadata, invalidateFolderCache } from './folders-crossover.mjs';
import { ignoreAndRemoveSerpPin } from './displaced-and-tombstones.mjs';
import { safeWaitUntil } from '../../http/security-and-response.mjs';
import { DEFAULT_WORKSPACE_ID, parsePositiveWorkspaceId, resolveWorkspaceRawCookie } from '../workspaces/service.mjs';

function isMissingWorkspaceColumnError(err) {
  return /column\s+"?(?:workspace_id|serp_top_n|pin_graph_rules)"?\s+does\s+not\s+exist/i.test(err?.message || '');
}

function makeHttpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sanitizeHexColor(raw, fallback = null) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const s = String(raw).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw makeHttpError('Invalid hex color. Expected #RRGGBB.', 400);
  }
  return s;
}

function normalizePinGraphRulesObject(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (!trimmed) return {};
    try {
      obj = JSON.parse(trimmed);
      if (typeof obj === 'string') obj = JSON.parse(obj);
    } catch (_) {
      return {};
    }
  }
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}

function sanitizeFolderPinGraphRules(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw makeHttpError('pin_graph_rules must be a JSON object.', 400);
  }
  const keys = Object.keys(raw);
  if (keys.length === 0) return {};

  const out = {};
  if (raw.auto_trigger_enabled !== undefined) {
    if (typeof raw.auto_trigger_enabled !== 'boolean') {
      throw makeHttpError('pin_graph_rules.auto_trigger_enabled must be a boolean.', 400);
    }
    out.auto_trigger_enabled = raw.auto_trigger_enabled;
  }
  if (raw.linkless_only !== undefined) {
    if (typeof raw.linkless_only !== 'boolean') {
      throw makeHttpError('pin_graph_rules.linkless_only must be a boolean.', 400);
    }
    out.linkless_only = raw.linkless_only;
  }
  if (raw.min_repins !== undefined && raw.min_repins !== null && raw.min_repins !== '') {
    const n = Number(raw.min_repins);
    if (!Number.isFinite(n) || n < 0) {
      throw makeHttpError('pin_graph_rules.min_repins must be a non-negative finite number.', 400);
    }
    out.min_repins = Math.min(10_000_000, Math.max(0, Math.round(n)));
  }
  if (raw.max_pages !== undefined && raw.max_pages !== null && raw.max_pages !== '') {
    const n = Number(raw.max_pages);
    if (!Number.isFinite(n) || n < 1) {
      throw makeHttpError('pin_graph_rules.max_pages must be a positive finite number.', 400);
    }
    out.max_pages = Math.min(200, Math.max(1, Math.round(n)));
  }
  return out;
}

function parseOptionalNonNegativeInt(raw, fieldName) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw makeHttpError(`${fieldName} must be a non-negative finite number.`, 400);
  }
  return Math.round(n);
}

function parseOptionalBoolean(raw, defaultValue = false) {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return Boolean(raw);
}

function sanitizeFolderMetadataPatch(rawMeta) {
  const clean = { ...normalizeFolderMetadata(rawMeta) };
  if (clean.status !== undefined && clean.status !== null && String(clean.status).trim() !== '') {
    const normalizedStatus = String(clean.status).trim().toLowerCase();
    if (!['active', 'archived', 'paused', 'completed'].includes(normalizedStatus)) {
      throw makeHttpError('Invalid folder status. Allowed values: active, archived, paused, completed', 400);
    }
    clean.status = normalizedStatus;
  }
  for (const key of ['max_serp_pins', 'max_pins']) {
    if (clean[key] !== undefined && clean[key] !== null && String(clean[key]).trim() !== '') {
      const n = Number(clean[key]);
      if (!Number.isFinite(n)) {
        throw makeHttpError(`metadata.${key} must be a finite number.`, 400);
      }
      clean[key] = Math.min(500, Math.max(10, Math.round(n)));
    }
  }
  if (clean.max_serp_pins !== undefined && clean.max_serp_pins !== null && String(clean.max_serp_pins).trim() !== '') {
    clean.max_pins = clean.max_serp_pins;
  }
  for (const boolKey of [
    'pause_competitors',
    'pause_crawlers',
    'block_fleet',
    'auto_discover_creators',
    'enable_serp_harvest',
    'serp_top_n_inherited'
  ]) {
    if (clean[boolKey] !== undefined) {
      clean[boolKey] = parseOptionalBoolean(clean[boolKey], boolKey === 'auto_discover_creators' || boolKey === 'enable_serp_harvest');
    }
  }
  return clean;
}

/**
 * Lightweight folder listing for fast header dropdown / switcher (< 5ms)
 * Queries only keyword_folders and keyword_folder_items count.
 */
export async function listFoldersLite(sql, { projectId = 'default', workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  let rows;
  try {
    rows = await sql`
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items
        GROUP BY folder_id
      )
      SELECT
        f.id,
        f.name,
        f.description,
        f.color,
        f.icon,
        f.project_id,
        f.workspace_id,
        f.serp_top_n,
        f.pin_graph_rules,
        f.metadata,
        f.created_at,
        f.updated_at,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(kw.keyword_count, 0) AS item_count
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      WHERE f.project_id = ${projectId}
        AND f.workspace_id = ${wid}
      ORDER BY f.updated_at DESC, f.created_at DESC;
    `;
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return [];
    rows = await sql`
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items
        GROUP BY folder_id
      )
      SELECT
        f.id,
        f.name,
        f.description,
        f.color,
        f.icon,
        f.project_id,
        f.metadata,
        f.created_at,
        f.updated_at,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(kw.keyword_count, 0) AS item_count
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      WHERE f.project_id = ${projectId}
      ORDER BY f.updated_at DESC, f.created_at DESC;
    `;
  }
  return rows.map(r => ({
    ...r,
    workspace_id: Number(r.workspace_id || wid),
    serp_top_n: Number(r.serp_top_n || 20),
    pin_graph_rules: normalizePinGraphRulesObject(r.pin_graph_rules),
    metadata: normalizeFolderMetadata(r.metadata),
    keyword_count: Number(r.keyword_count || 0),
    item_count: Number(r.item_count || r.keyword_count || 0)
  }));
}

/**
 * List all folders with item counts and keyword previews
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */
export async function listFolders(sql, { projectId = 'default', workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const runQuery = async (withWorkspaceFilter) => sql`
    WITH kw_counts AS (
      SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
      FROM keyword_folder_items GROUP BY folder_id
    ),
    creator_counts AS (
      SELECT folder_id, COUNT(competitor_id)::int AS creator_count
      FROM folder_competitor_items GROUP BY folder_id
    ),
    pinned_counts AS (
      SELECT folder_id, COUNT(id)::int AS pinned_domain_count
      FROM folder_pinned_domains GROUP BY folder_id
    ),
    folder_pins AS (
      SELECT
        kfi.folder_id,
        ksp.pin_id,
        CASE
          WHEN ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1 THEN 'active'
          WHEN ksp.is_displaced = TRUE THEN 'vault'
          ELSE 'other'
        END AS item_source,
        ksp.is_displaced,
        REGEXP_REPLACE(LOWER(TRIM(COALESCE(ump.clean_domain, ''))), '^www\\.', '') AS clean_domain,
        LOWER(TRIM(COALESCE(ump.creator_username, ''))) AS clean_username
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE (ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1)
         OR ksp.is_displaced = TRUE
    ),
    pin_status AS (
      SELECT
        folder_id,
        pin_id,
        BOOL_OR(item_source = 'active') AS has_active,
        BOOL_OR(item_source = 'vault') AS has_vault
      FROM folder_pins
      GROUP BY folder_id, pin_id
    ),
    pin_counts AS (
      SELECT
        folder_id,
        COUNT(*)::int AS unique_pins_count,
        COUNT(*) FILTER (WHERE has_active)::int AS active_pins_count,
        COUNT(*) FILTER (WHERE NOT has_active AND has_vault)::int AS vault_pins_count
      FROM pin_status
      GROUP BY folder_id
    ),
    entity_counts AS (
      SELECT
        folder_id,
        COUNT(DISTINCT clean_domain) FILTER (
          WHERE clean_domain IS NOT NULL AND clean_domain <> ''
            AND clean_domain NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pin.it')
            AND clean_domain !~ '(^|\\.)pinterest\\.[a-z.]+$'
            AND clean_domain !~ '(^|\\.)pinimg\\.com$'
            AND POSITION('.' IN clean_domain) > 0
        )::int AS domain_count,
        COUNT(DISTINCT clean_username) FILTER (
          WHERE clean_username IS NOT NULL AND clean_username <> ''
            AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
        )::int AS discovered_creator_count
      FROM (
        SELECT folder_id, clean_domain, clean_username FROM folder_pins
        UNION ALL
        SELECT fci.folder_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username
        FROM folder_competitor_items fci
        JOIN competitor_profiles cp ON cp.id = fci.competitor_id
        WHERE cp.username IS NOT NULL AND cp.username <> ''
      ) comb
      GROUP BY folder_id
    ),
    combined_summary AS (
      SELECT
        COALESCE(pc.folder_id, ec.folder_id) AS folder_id,
        COALESCE(pc.unique_pins_count, 0)::int AS unique_pins_count,
        COALESCE(pc.active_pins_count, 0)::int AS active_pins_count,
        COALESCE(pc.vault_pins_count, 0)::int AS vault_pins_count,
        COALESCE(ec.domain_count, 0)::int AS domain_count,
        COALESCE(ec.discovered_creator_count, 0)::int AS discovered_creator_count
      FROM pin_counts pc
      FULL OUTER JOIN entity_counts ec ON ec.folder_id = pc.folder_id
    )
    SELECT 
      f.id,
      f.name,
      f.description,
      f.color,
      f.icon,
      f.project_id,
      f.workspace_id,
      f.serp_top_n,
      f.pin_graph_rules,
      f.metadata,
      f.created_at,
      f.updated_at,
      COALESCE(kw.keyword_count, 0) AS keyword_count,
      COALESCE(cr.creator_count, 0) AS creator_count,
      COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count,
      COALESCE(cs.domain_count, 0) AS domain_count,
      COALESCE(cs.unique_pins_count, 0) AS pin_count,
      COALESCE(cs.unique_pins_count, 0) AS unique_pins_count,
      COALESCE(cs.unique_pins_count, 0) AS total_unique_pins,
      COALESCE(cs.active_pins_count, 0) AS active_pins_count,
      COALESCE(cs.vault_pins_count, 0) AS vault_pins_count,
      COALESCE(cs.discovered_creator_count, 0) AS discovered_creator_count,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', tk.id, 'keyword', tk.keyword))
          FROM keyword_folder_items kfi
          JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
          WHERE kfi.folder_id = f.id
        ),
        '[]'::json
      ) AS keywords_preview
    FROM keyword_folders f
    LEFT JOIN kw_counts kw ON kw.folder_id = f.id
    LEFT JOIN creator_counts cr ON cr.folder_id = f.id
    LEFT JOIN pinned_counts pd ON pd.folder_id = f.id
    LEFT JOIN combined_summary cs ON cs.folder_id = f.id
    WHERE f.project_id = ${projectId}
      AND (${!withWorkspaceFilter} OR f.workspace_id = ${wid})
    ORDER BY f.updated_at DESC, f.created_at DESC;
  `;

  let rows;
  try {
    rows = await runQuery(true);
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return [];
    rows = await sql`
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items GROUP BY folder_id
      ),
      creator_counts AS (
        SELECT folder_id, COUNT(competitor_id)::int AS creator_count
        FROM folder_competitor_items GROUP BY folder_id
      ),
      pinned_counts AS (
        SELECT folder_id, COUNT(id)::int AS pinned_domain_count
        FROM folder_pinned_domains GROUP BY folder_id
      ),
      folder_pins AS (
        SELECT
          kfi.folder_id,
          ksp.pin_id,
          CASE
            WHEN ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1 THEN 'active'
            WHEN ksp.is_displaced = TRUE THEN 'vault'
            ELSE 'other'
          END AS item_source,
          ksp.is_displaced,
          LOWER(TRIM(COALESCE(ump.clean_domain, ''))) AS clean_domain,
          LOWER(TRIM(COALESCE(ump.creator_username, ''))) AS clean_username
        FROM keyword_folder_items kfi
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE (ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1)
           OR ksp.is_displaced = TRUE
      ),
      pin_status AS (
        SELECT
          folder_id,
          pin_id,
          BOOL_OR(item_source = 'active') AS has_active,
          BOOL_OR(item_source = 'vault') AS has_vault
        FROM folder_pins
        GROUP BY folder_id, pin_id
      ),
      pin_counts AS (
        SELECT
          folder_id,
          COUNT(*)::int AS unique_pins_count,
          COUNT(*) FILTER (WHERE has_active)::int AS active_pins_count,
          COUNT(*) FILTER (WHERE NOT has_active AND has_vault)::int AS vault_pins_count
        FROM pin_status
        GROUP BY folder_id
      ),
      entity_counts AS (
        SELECT
          folder_id,
          COUNT(DISTINCT clean_domain) FILTER (
            WHERE clean_domain IS NOT NULL AND clean_domain <> ''
              AND clean_domain NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pinterest.com', 'www.pinterest.com', 'pin.it')
              AND POSITION('.' IN clean_domain) > 0
          )::int AS domain_count,
          COUNT(DISTINCT clean_username) FILTER (
            WHERE clean_username IS NOT NULL AND clean_username <> ''
              AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
          )::int AS discovered_creator_count
        FROM (
          SELECT folder_id, clean_domain, clean_username FROM folder_pins
          UNION ALL
          SELECT fci.folder_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username
          FROM folder_competitor_items fci
          JOIN competitor_profiles cp ON cp.id = fci.competitor_id
          WHERE cp.username IS NOT NULL AND cp.username <> ''
        ) comb
        GROUP BY folder_id
      ),
      combined_summary AS (
        SELECT
          COALESCE(pc.folder_id, ec.folder_id) AS folder_id,
          COALESCE(pc.unique_pins_count, 0)::int AS unique_pins_count,
          COALESCE(pc.active_pins_count, 0)::int AS active_pins_count,
          COALESCE(pc.vault_pins_count, 0)::int AS vault_pins_count,
          COALESCE(ec.domain_count, 0)::int AS domain_count,
          COALESCE(ec.discovered_creator_count, 0)::int AS discovered_creator_count
        FROM pin_counts pc
        FULL OUTER JOIN entity_counts ec ON ec.folder_id = pc.folder_id
      )
      SELECT 
        f.id,
        f.name,
        f.description,
        f.color,
        f.icon,
        f.project_id,
        f.metadata,
        f.created_at,
        f.updated_at,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(cr.creator_count, 0) AS creator_count,
        COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count,
        COALESCE(cs.domain_count, 0) AS domain_count,
        COALESCE(cs.unique_pins_count, 0) AS pin_count,
        COALESCE(cs.unique_pins_count, 0) AS unique_pins_count,
        COALESCE(cs.unique_pins_count, 0) AS total_unique_pins,
        COALESCE(cs.active_pins_count, 0) AS active_pins_count,
        COALESCE(cs.vault_pins_count, 0) AS vault_pins_count,
        COALESCE(cs.discovered_creator_count, 0) AS discovered_creator_count,
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', tk.id, 'keyword', tk.keyword))
            FROM keyword_folder_items kfi
            JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
            WHERE kfi.folder_id = f.id
          ),
          '[]'::json
        ) AS keywords_preview
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      LEFT JOIN creator_counts cr ON cr.folder_id = f.id
      LEFT JOIN pinned_counts pd ON pd.folder_id = f.id
      LEFT JOIN combined_summary cs ON cs.folder_id = f.id
      WHERE f.project_id = ${projectId}
      ORDER BY f.updated_at DESC, f.created_at DESC;
    `;
  }
  return rows.map(r => ({
    ...r,
    workspace_id: Number(r.workspace_id || wid),
    serp_top_n: Number(r.serp_top_n || 20),
    pin_graph_rules: normalizePinGraphRulesObject(r.pin_graph_rules),
    metadata: normalizeFolderMetadata(r.metadata),
    keyword_count: Number(r.keyword_count || 0),
    creator_count: Number(r.creator_count || 0),
    pinned_domain_count: Number(r.pinned_domain_count || 0),
    domain_count: Number(r.domain_count || 0),
    pin_count: Number(r.pin_count || r.unique_pins_count || 0),
    unique_pins_count: Number(r.unique_pins_count || r.pin_count || 0),
    total_unique_pins: Number(r.total_unique_pins || r.pin_count || 0),
    active_pins_count: Number(r.active_pins_count || 0),
    vault_pins_count: Number(r.vault_pins_count || 0),
    discovered_creator_count: Number(r.discovered_creator_count || 0)
  }));
}

/**
 * Get single folder with all tracked keyword details
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */
export async function getFolder(sql, folderId, { workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const fid = Number(folderId);
  if (!fid) return null;
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;

  let rows;
  try {
    rows = await sql`
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      creator_counts AS (
        SELECT folder_id, COUNT(competitor_id)::int AS creator_count
        FROM folder_competitor_items WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      pinned_counts AS (
        SELECT folder_id, COUNT(id)::int AS pinned_domain_count
        FROM folder_pinned_domains WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      folder_pins AS (
        SELECT
          kfi.folder_id,
          ksp.pin_id,
          CASE
            WHEN ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1 THEN 'active'
            WHEN ksp.is_displaced = TRUE THEN 'vault'
            ELSE 'other'
          END AS item_source,
          ksp.is_displaced,
          REGEXP_REPLACE(LOWER(TRIM(COALESCE(ump.clean_domain, ''))), '^www\\.', '') AS clean_domain,
          LOWER(TRIM(COALESCE(ump.creator_username, ''))) AS clean_username
        FROM keyword_folder_items kfi
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE kfi.folder_id = ${fid}
          AND ((ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1) OR ksp.is_displaced = TRUE)
      ),
      pin_status AS (
        SELECT
          folder_id,
          pin_id,
          BOOL_OR(item_source = 'active') AS has_active,
          BOOL_OR(item_source = 'vault') AS has_vault
        FROM folder_pins
        GROUP BY folder_id, pin_id
      ),
      pin_counts AS (
        SELECT
          folder_id,
          COUNT(*)::int AS unique_pins_count,
          COUNT(*) FILTER (WHERE has_active)::int AS active_pins_count,
          COUNT(*) FILTER (WHERE NOT has_active AND has_vault)::int AS vault_pins_count
        FROM pin_status
        GROUP BY folder_id
      ),
      entity_counts AS (
        SELECT
          folder_id,
          COUNT(DISTINCT clean_domain) FILTER (
            WHERE clean_domain IS NOT NULL AND clean_domain <> ''
              AND clean_domain NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pin.it')
              AND clean_domain !~ '(^|\\.)pinterest\\.[a-z.]+$'
              AND clean_domain !~ '(^|\\.)pinimg\\.com$'
              AND POSITION('.' IN clean_domain) > 0
          )::int AS domain_count,
          COUNT(DISTINCT clean_username) FILTER (
            WHERE clean_username IS NOT NULL AND clean_username <> ''
              AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
          )::int AS discovered_creator_count
        FROM (
          SELECT folder_id, clean_domain, clean_username FROM folder_pins
          UNION ALL
          SELECT fci.folder_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username
          FROM folder_competitor_items fci
          JOIN competitor_profiles cp ON cp.id = fci.competitor_id
          WHERE fci.folder_id = ${fid} AND cp.username IS NOT NULL AND cp.username <> ''
        ) comb
        GROUP BY folder_id
      ),
      combined_summary AS (
        SELECT
          COALESCE(pc.folder_id, ec.folder_id) AS folder_id,
          COALESCE(pc.unique_pins_count, 0)::int AS unique_pins_count,
          COALESCE(pc.active_pins_count, 0)::int AS active_pins_count,
          COALESCE(pc.vault_pins_count, 0)::int AS vault_pins_count,
          COALESCE(ec.domain_count, 0)::int AS domain_count,
          COALESCE(ec.discovered_creator_count, 0)::int AS discovered_creator_count
        FROM pin_counts pc
        FULL OUTER JOIN entity_counts ec ON ec.folder_id = pc.folder_id
      )
      SELECT 
        f.*,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(cr.creator_count, 0) AS creator_count,
        COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count,
        COALESCE(cs.domain_count, 0) AS domain_count,
        COALESCE(cs.unique_pins_count, 0) AS pin_count,
        COALESCE(cs.unique_pins_count, 0) AS unique_pins_count,
        COALESCE(cs.unique_pins_count, 0) AS total_unique_pins,
        COALESCE(cs.active_pins_count, 0) AS active_pins_count,
        COALESCE(cs.vault_pins_count, 0) AS vault_pins_count,
        COALESCE(cs.discovered_creator_count, 0) AS discovered_creator_count
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      LEFT JOIN creator_counts cr ON cr.folder_id = f.id
      LEFT JOIN pinned_counts pd ON pd.folder_id = f.id
      LEFT JOIN combined_summary cs ON cs.folder_id = f.id
      WHERE f.id = ${fid} AND f.workspace_id = ${wid}
      LIMIT 1;
    `;
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return null;
    rows = await sql`
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      creator_counts AS (
        SELECT folder_id, COUNT(competitor_id)::int AS creator_count
        FROM folder_competitor_items WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      pinned_counts AS (
        SELECT folder_id, COUNT(id)::int AS pinned_domain_count
        FROM folder_pinned_domains WHERE folder_id = ${fid} GROUP BY folder_id
      ),
      folder_pins AS (
        SELECT
          kfi.folder_id,
          ksp.pin_id,
          CASE
            WHEN ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1 THEN 'active'
            WHEN ksp.is_displaced = TRUE THEN 'vault'
            ELSE 'other'
          END AS item_source,
          ksp.is_displaced,
          LOWER(TRIM(COALESCE(ump.clean_domain, ''))) AS clean_domain,
          LOWER(TRIM(COALESCE(ump.creator_username, ''))) AS clean_username
        FROM keyword_folder_items kfi
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE kfi.folder_id = ${fid}
          AND ((ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1) OR ksp.is_displaced = TRUE)
      ),
      pin_status AS (
        SELECT
          folder_id,
          pin_id,
          BOOL_OR(item_source = 'active') AS has_active,
          BOOL_OR(item_source = 'vault') AS has_vault
        FROM folder_pins
        GROUP BY folder_id, pin_id
      ),
      pin_counts AS (
        SELECT
          folder_id,
          COUNT(*)::int AS unique_pins_count,
          COUNT(*) FILTER (WHERE has_active)::int AS active_pins_count,
          COUNT(*) FILTER (WHERE NOT has_active AND has_vault)::int AS vault_pins_count
        FROM pin_status
        GROUP BY folder_id
      ),
      entity_counts AS (
        SELECT
          folder_id,
          COUNT(DISTINCT clean_domain) FILTER (
            WHERE clean_domain IS NOT NULL AND clean_domain <> ''
              AND clean_domain NOT IN ('uploaded by user', 'uploaded-by-user', 'organic', 'pinterest.com', 'www.pinterest.com', 'pin.it')
              AND POSITION('.' IN clean_domain) > 0
          )::int AS domain_count,
          COUNT(DISTINCT clean_username) FILTER (
            WHERE clean_username IS NOT NULL AND clean_username <> ''
              AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
          )::int AS discovered_creator_count
        FROM (
          SELECT folder_id, clean_domain, clean_username FROM folder_pins
          UNION ALL
          SELECT fci.folder_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username
          FROM folder_competitor_items fci
          JOIN competitor_profiles cp ON cp.id = fci.competitor_id
          WHERE fci.folder_id = ${fid} AND cp.username IS NOT NULL AND cp.username <> ''
        ) comb
        GROUP BY folder_id
      ),
      combined_summary AS (
        SELECT
          COALESCE(pc.folder_id, ec.folder_id) AS folder_id,
          COALESCE(pc.unique_pins_count, 0)::int AS unique_pins_count,
          COALESCE(pc.active_pins_count, 0)::int AS active_pins_count,
          COALESCE(pc.vault_pins_count, 0)::int AS vault_pins_count,
          COALESCE(ec.domain_count, 0)::int AS domain_count,
          COALESCE(ec.discovered_creator_count, 0)::int AS discovered_creator_count
        FROM pin_counts pc
        FULL OUTER JOIN entity_counts ec ON ec.folder_id = pc.folder_id
      )
      SELECT 
        f.*,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(cr.creator_count, 0) AS creator_count,
        COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count,
        COALESCE(cs.domain_count, 0) AS domain_count,
        COALESCE(cs.unique_pins_count, 0) AS pin_count,
        COALESCE(cs.unique_pins_count, 0) AS unique_pins_count,
        COALESCE(cs.unique_pins_count, 0) AS total_unique_pins,
        COALESCE(cs.active_pins_count, 0) AS active_pins_count,
        COALESCE(cs.vault_pins_count, 0) AS vault_pins_count,
        COALESCE(cs.discovered_creator_count, 0) AS discovered_creator_count
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      LEFT JOIN creator_counts cr ON cr.folder_id = f.id
      LEFT JOIN pinned_counts pd ON pd.folder_id = f.id
      LEFT JOIN combined_summary cs ON cs.folder_id = f.id
      WHERE f.id = ${fid}
      LIMIT 1;
    `;
  }
  const [folder] = rows || [];

  if (!folder) return null;

  // [INVARIANT: AGGREGATED-JOIN-OPTIMIZATION]
  // Uses LEFT JOIN on an aggregated subquery (GROUP BY keyword_id) scoped to this folder
  // to eliminate O(N) per-row correlated index scans in Postgres.
  const items = await sql`
    SELECT 
      i.id as folder_item_id,
      i.folder_id,
      i.keyword_id,
      i.notes,
      i.added_at,
      tk.keyword,
      tk.category,
      tk.target_pin_count,
      tk.avg_daily_velocity,
      tk.top_pin_id,
      tk.top_pin_title,
      tk.top_pin_image,
      tk.last_crawled_at,
      tk.is_active,
      COALESCE(ksc.cnt, 0)::int as pin_count
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    LEFT JOIN (
      SELECT ksp.keyword_id, COUNT(*)::int as cnt
      FROM keyword_serp_positions ksp
      WHERE ksp.is_displaced = FALSE AND ksp.rank_position >= 1
        AND ksp.keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fid})
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
        )
      GROUP BY ksp.keyword_id
    ) ksc ON ksc.keyword_id = tk.id
    WHERE i.folder_id = ${fid}
    ORDER BY i.added_at DESC;
  `;

  const resolvedCount = Array.isArray(items)
    ? items.length
    : Number(folder.keyword_count ?? folder.item_count ?? 0);

  return {
    ...folder,
    workspace_id: Number(folder.workspace_id || wid),
    serp_top_n: Number(folder.serp_top_n || 20),
    pin_graph_rules: normalizePinGraphRulesObject(folder.pin_graph_rules),
    metadata: normalizeFolderMetadata(folder.metadata),
    keyword_count: resolvedCount,
    creator_count: Number(folder.creator_count || 0),
    pinned_domain_count: Number(folder.pinned_domain_count || 0),
    domain_count: Number(folder.domain_count || 0),
    pin_count: Number(folder.pin_count || folder.unique_pins_count || 0),
    unique_pins_count: Number(folder.unique_pins_count || folder.pin_count || 0),
    total_unique_pins: Number(folder.total_unique_pins || folder.pin_count || 0),
    active_pins_count: Number(folder.active_pins_count || 0),
    vault_pins_count: Number(folder.vault_pins_count || 0),
    discovered_creator_count: Number(folder.discovered_creator_count || 0),
    item_count: resolvedCount,
    items
  };
}

/**
 * Create a new folder
 */
export async function createFolder(sql, { 
  name, 
  description = '', 
  color = '#ec4899', 
  icon = 'folder', 
  projectId = 'default',
  workspaceId = DEFAULT_WORKSPACE_ID,
  serp_top_n = 20,
  pin_graph_rules = {},
  status = 'active',
  metadata = {} 
}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw makeHttpError('Folder name is required.', 400);
  }
  if (cleanName.length > 255) {
    throw makeHttpError('Folder name must be 255 characters or fewer.', 400);
  }

  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;
  const rawTopN = Math.round(Number(serp_top_n));
  const cleanSerpTopN = Number.isFinite(rawTopN) ? Math.min(100, Math.max(5, rawTopN)) : 20;
  const cleanColor = sanitizeHexColor(color, '#ec4899');
  const cleanPinGraphRules = sanitizeFolderPinGraphRules(pin_graph_rules);

  const validStatuses = ['active', 'archived', 'paused', 'completed'];
  const cleanStatus = validStatuses.includes(String(status).toLowerCase())
    ? String(status).toLowerCase()
    : 'active';

  const cleanMetadata = { ...sanitizeFolderMetadataPatch(metadata), status: cleanStatus };
  let created;
  try {
    const rows = await sql`
      INSERT INTO keyword_folders (
        name,
        description,
        color,
        icon,
        project_id,
        workspace_id,
        serp_top_n,
        pin_graph_rules,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${cleanName},
        ${String(description || '').trim()},
        ${cleanColor},
        ${String(icon || 'folder').trim()},
        ${String(projectId || 'default').trim()},
        ${wid},
        ${cleanSerpTopN},
        ${JSON.stringify(cleanPinGraphRules)}::jsonb,
        ${JSON.stringify(cleanMetadata)}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *;
    `;
    created = rows?.[0];
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    const rows = await sql`
      INSERT INTO keyword_folders (
        name,
        description,
        color,
        icon,
        project_id,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${cleanName},
        ${String(description || '').trim()},
        ${cleanColor},
        ${String(icon || 'folder').trim()},
        ${String(projectId || 'default').trim()},
        ${JSON.stringify(cleanMetadata)}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *;
    `;
    created = rows?.[0];
  }

  return created
    ? {
        ...created,
        workspace_id: Number(created.workspace_id || wid),
        serp_top_n: Number(created.serp_top_n || cleanSerpTopN),
        pin_graph_rules: normalizePinGraphRulesObject(created.pin_graph_rules),
        metadata: normalizeFolderMetadata(created.metadata)
      }
    : null;
}

/**
 * Update folder properties
 */
export async function updateFolder(sql, folderId, { 
  name, 
  description, 
  color, 
  icon, 
  status,
  serp_top_n,
  pin_graph_rules,
  workspaceId = DEFAULT_WORKSPACE_ID,
  metadata 
}) {
  const fid = Number(folderId);
  if (!fid || !Number.isInteger(fid) || fid <= 0) throw makeHttpError('Invalid folder ID', 400);
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;

  const cleanName = name !== undefined ? (name === null ? '' : String(name).trim()) : null;
  if (name !== undefined && !cleanName) throw makeHttpError('Folder name cannot be empty.', 400);
  if (cleanName !== null && cleanName.length > 255) {
    throw makeHttpError('Folder name must be 255 characters or fewer.', 400);
  }
  const cleanDescription = (description !== undefined && description !== null) ? String(description).trim() : null;
  const cleanIcon = (icon !== undefined && icon !== null) ? String(icon).trim() : null;

  const cleanColor = color !== undefined ? sanitizeHexColor(color) : null;

  let cleanSerpTopN = null;
  if (serp_top_n !== undefined && serp_top_n !== null && serp_top_n !== '') {
    const n = Number(serp_top_n);
    if (!Number.isFinite(n)) {
      throw makeHttpError('serp_top_n must be a finite number.', 400);
    }
    cleanSerpTopN = Math.min(100, Math.max(5, Math.round(n)));
  }
  const cleanPinGraphRules = pin_graph_rules !== undefined
    ? sanitizeFolderPinGraphRules(pin_graph_rules)
    : null;

  let cleanMetadata = metadata !== undefined ? sanitizeFolderMetadataPatch(metadata) : null;
  if (status !== undefined) {
    const validStatuses = ['active', 'archived', 'paused', 'completed'];
    const normalizedStatus = String(status).trim().toLowerCase();
    if (!validStatuses.includes(normalizedStatus)) {
      throw makeHttpError('Invalid folder status. Allowed values: active, archived, paused, completed', 400);
    }
    cleanMetadata = { ...(cleanMetadata || {}), status: normalizedStatus };
  }
  let updated;
  try {
    const rows = await sql`
      UPDATE keyword_folders
      SET 
        name = COALESCE(${cleanName}, name),
        description = COALESCE(${cleanDescription}, description),
        color = COALESCE(${cleanColor}, color),
        icon = COALESCE(${cleanIcon}, icon),
        serp_top_n = COALESCE(${cleanSerpTopN}, serp_top_n),
        pin_graph_rules = CASE
          WHEN ${cleanPinGraphRules !== null} THEN ${cleanPinGraphRules !== null ? JSON.stringify(cleanPinGraphRules) : null}::jsonb
          ELSE pin_graph_rules
        END,
        metadata = CASE
          WHEN ${cleanMetadata !== null} THEN (
            CASE
              WHEN jsonb_typeof(metadata) = 'object' THEN metadata
              WHEN jsonb_typeof(metadata) = 'string' AND LEFT(BTRIM(metadata #>> '{}'), 1) = '{' THEN (metadata #>> '{}')::jsonb
              ELSE '{}'::jsonb
            END
          ) || ${cleanMetadata !== null ? JSON.stringify(cleanMetadata) : null}::jsonb
          ELSE metadata
        END,
        updated_at = NOW()
      WHERE id = ${fid} AND workspace_id = ${wid}
      RETURNING *;
    `;
    updated = rows?.[0];
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return null;
    const rows = await sql`
      UPDATE keyword_folders
      SET 
        name = COALESCE(${cleanName}, name),
        description = COALESCE(${cleanDescription}, description),
        color = COALESCE(${cleanColor}, color),
        icon = COALESCE(${cleanIcon}, icon),
        metadata = CASE
          WHEN ${cleanMetadata !== null} THEN (
            CASE
              WHEN jsonb_typeof(metadata) = 'object' THEN metadata
              WHEN jsonb_typeof(metadata) = 'string' AND LEFT(BTRIM(metadata #>> '{}'), 1) = '{' THEN (metadata #>> '{}')::jsonb
              ELSE '{}'::jsonb
            END
          ) || ${cleanMetadata !== null ? JSON.stringify(cleanMetadata) : null}::jsonb
          ELSE metadata
        END,
        updated_at = NOW()
      WHERE id = ${fid}
      RETURNING *;
    `;
    updated = rows?.[0];
  }

  invalidateFolderCache(fid, wid);
  if (!updated) return null;
  const fullFolder = await getFolder(sql, fid, { workspaceId: wid }).catch(() => null);
  return fullFolder || {
    ...updated,
    workspace_id: Number(updated.workspace_id || wid),
    serp_top_n: Number(updated.serp_top_n || 20),
    pin_graph_rules: normalizePinGraphRulesObject(updated.pin_graph_rules),
    metadata: normalizeFolderMetadata(updated.metadata)
  };
}

/**
 * Delete folder and cascaded items
 */
export async function deleteFolder(sql, folderId, { workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;

  let deleted;
  try {
    const rows = await sql`
      DELETE FROM keyword_folders
      WHERE id = ${fid} AND workspace_id = ${wid}
      RETURNING id, name;
    `;
    deleted = rows?.[0];
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return null;
    const rows = await sql`
      DELETE FROM keyword_folders
      WHERE id = ${fid}
      RETURNING id, name;
    `;
    deleted = rows?.[0];
  }

  invalidateFolderCache(fid, wid);
  return deleted;
}

/**
 * Add keyword to folder
 */
export async function addKeywordToFolder(sql, folderId, keywordId, notes = '') {
  const fid = Number(folderId);
  const kid = Number(keywordId);
  if (!fid || !kid) throw new Error('Invalid folderId or keywordId');

  const [item] = await sql`
    INSERT INTO keyword_folder_items (
      folder_id,
      keyword_id,
      notes,
      added_at
    ) VALUES (
      ${fid},
      ${kid},
      ${String(notes || '').trim()},
      NOW()
    )
    ON CONFLICT (folder_id, keyword_id) DO UPDATE SET
      notes = EXCLUDED.notes
    RETURNING *;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return item;
}

/**
 * Batch add keywords to folder
 */
export async function batchAddKeywordsToFolder(sql, folderId, keywordIds = []) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');
  const validKids = (keywordIds || []).map(Number).filter(Boolean);
  if (!validKids.length) return { added: 0 };

  const buildInsertQuery = (db) => db`
    INSERT INTO keyword_folder_items (
      folder_id,
      keyword_id,
      added_at
    )
    SELECT
      ${fid},
      k_id,
      NOW()
    FROM UNNEST(${validKids}::int[]) AS k_id
    ON CONFLICT (folder_id, keyword_id) DO NOTHING
    RETURNING keyword_id;
  `;

  const buildUpdateQuery = (db) => db`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  // [INVARIANT: ATOMIC-TRANSACTION-BUILDER]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // [INVARIANT: UNIFIED-POSTGRES-SSOT]
  let inserted = [];
  if (typeof sql.transaction === 'function') {
    const res = await sql.transaction([
      (db) => buildInsertQuery(db),
      (db) => buildUpdateQuery(db)
    ]);
    inserted = res && res[0] ? res[0] : [];
  } else if (typeof sql.begin === 'function') {
    [inserted] = await sql.begin(async (tx) => {
      const rows = await buildInsertQuery(tx);
      await buildUpdateQuery(tx);
      return [rows];
    });
  } else {
    inserted = await buildInsertQuery(sql);
    await buildUpdateQuery(sql);
  }

  invalidateFolderCache(fid);
  return { added: (inserted || []).length };
}

/**
 * Remove keyword from folder
 */
export async function removeKeywordFromFolder(sql, folderId, keywordId) {
  const fid = Number(folderId);
  const kid = Number(keywordId);
  if (!fid || !kid) throw new Error('Invalid folderId or keywordId');

  const [deleted] = await sql`
    DELETE FROM keyword_folder_items
    WHERE folder_id = ${fid} AND keyword_id = ${kid}
    RETURNING id;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return deleted;
}

/**
 * Batch remove keywords from folder (preserves global tracked_keywords & SERP history for other folders)
 */
export async function batchRemoveKeywordsFromFolder(sql, folderId, keywordIds = []) {
  const fid = Number(folderId);
  const cleanIds = [...new Set((Array.isArray(keywordIds) ? keywordIds : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!fid || cleanIds.length === 0) return { removed: 0, removed_ids: [] };

  const deletedRows = await sql`
    DELETE FROM keyword_folder_items
    WHERE folder_id = ${fid} AND keyword_id = ANY(${cleanIds})
    RETURNING keyword_id;
  `;

  await sql`
    UPDATE keyword_folders
    SET updated_at = NOW()
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  const removedIds = (deletedRows || []).map(r => Number(r.keyword_id)).filter(Boolean);
  return { removed: removedIds.length, removed_ids: removedIds };
}

/**
 * Pin a domain to a campaign folder
 * // [INVARIANT: FOLDER-PINNED-DOMAINS]
 */
export async function pinDomainToFolder(sql, folderId, domain, notes = '') {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');
  const cleanDomain = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0];
  if (!cleanDomain) throw new Error('Valid domain is required');

  const [item] = await sql`
    INSERT INTO folder_pinned_domains (
      folder_id,
      domain,
      notes,
      pinned_at
    ) VALUES (
      ${fid},
      ${cleanDomain},
      ${String(notes || '').trim()},
      NOW()
    )
    ON CONFLICT (folder_id, domain) DO UPDATE SET
      notes = EXCLUDED.notes,
      pinned_at = NOW()
    RETURNING *;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return item;
}

/**
 * Unpin a domain from a campaign folder
 */
export async function unpinDomainFromFolder(sql, folderId, domain) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');
  const cleanDomain = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0];
  if (!cleanDomain) throw new Error('Valid domain is required');

  const [deleted] = await sql`
    DELETE FROM folder_pinned_domains
    WHERE folder_id = ${fid} AND domain = ${cleanDomain}
    RETURNING id, domain;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return deleted || { success: true, unpinned: cleanDomain };
}

/**
 * List all pinned domains for a campaign folder
 */
export async function listFolderPinnedDomains(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) return [];

  const rows = await sql`
    SELECT 
      fpd.id,
      fpd.folder_id,
      fpd.domain,
      fpd.notes,
      fpd.pinned_at,
      r.total_pins,
      r.total_saves,
      r.avg_velocity,
      r.ad_network,
      r.age_years,
      r.age_status
    FROM folder_pinned_domains fpd
    LEFT JOIN domain_intelligence_rollup r ON r.domain = fpd.domain
    WHERE fpd.folder_id = ${fid}
    ORDER BY fpd.pinned_at DESC;
  `;

  return rows;
}

export const listPinnedDomains = listFolderPinnedDomains;

/**
 * Link a creator (competitor) to a campaign folder
 * // [INVARIANT: FOLDER-COMPETITOR-ITEMS]
 */
export async function linkCreatorToFolder(sql, folderId, competitorId) {
  const fid = Number(folderId);
  const cid = Number(competitorId);
  if (!fid || !cid) throw new Error('Invalid folderId or competitorId');

  const [item] = await sql`
    INSERT INTO folder_competitor_items (
      folder_id,
      competitor_id,
      added_at
    ) VALUES (
      ${fid},
      ${cid},
      NOW()
    )
    ON CONFLICT (folder_id, competitor_id) DO NOTHING
    RETURNING *;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return item || { folder_id: fid, competitor_id: cid, already_linked: true };
}

/**
 * Unlink a creator from a campaign folder
 */
export async function unlinkCreatorFromFolder(sql, folderId, competitorId) {
  const fid = Number(folderId);
  const cid = Number(competitorId);
  if (!fid || !cid) throw new Error('Invalid folderId or competitorId');

  const [deleted] = await sql`
    DELETE FROM folder_competitor_items
    WHERE folder_id = ${fid} AND competitor_id = ${cid}
    RETURNING id;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);
  return deleted || { success: true };
}

/**
 * List all creators linked to a campaign folder
 */
export async function listFolderCreators(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) return [];

  const rows = await sql`
    SELECT 
      fci.id as folder_item_id,
      fci.folder_id,
      fci.competitor_id,
      fci.added_at,
      cp.username,
      cp.display_name,
      cp.avatar_url,
      cp.monthly_reach,
      cp.profile_views,
      cp.total_pins,
      cp.total_boards,
      cp.follower_count,
      cp.activity_status
    FROM folder_competitor_items fci
    JOIN competitor_profiles cp ON cp.id = fci.competitor_id
    WHERE fci.folder_id = ${fid}
    ORDER BY fci.added_at DESC;
  `;

  return rows;
}

/**
 * Auto-discover ranking creators in active SERP (WHERE is_displaced = FALSE)
 * and correlate with linked competitors (R3)
 */
export async function listFolderCreatorsWithDiscovery(sql, folderId, { vaultScope = 'high_signal' } = {}) {
  const fid = Number(folderId);
  if (!fid) {
    return {
      linked_creators: [],
      discovered_creators: [],
      all_creators: [],
      auto_discovered: [],
      auto_discover_creators: true,
      vault_scope: vaultScope,
      totals: {
        total_linked: 0,
        total_discovered: 0,
        total_creators: 0,
        combined_audience: 0,
        combined_impressions: 0,
        combined_pins: 0,
        avg_pinning_cadence: 0
      }
    };
  }

  // Extract unique creators from active SERP (WHERE is_displaced = FALSE) and displaced vault pins
  const rows = await sql`
    WITH all_folder_pins AS (
      SELECT
        kfi.folder_id,
        ksp.keyword_id,
        ksp.pin_id,
        LOWER(TRIM(ump.creator_username)) AS clean_username,
        ump.save_count,
        ump.daily_save_velocity,
        COALESCE(ksp.rank_position, ksp.last_known_rank) AS current_rank,
        ksp.is_displaced
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE kfi.folder_id = ${fid}
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
        )
        AND ump.creator_username IS NOT NULL AND ump.creator_username <> ''
        AND LOWER(TRIM(ump.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
    ),
    aggregated_creators AS (
      SELECT
        afp.clean_username,
        COUNT(DISTINCT afp.pin_id)::int AS pin_count,
        COUNT(DISTINCT afp.pin_id) FILTER (WHERE NOT afp.is_displaced)::int AS active_pin_count,
        COUNT(DISTINCT afp.pin_id) FILTER (WHERE afp.is_displaced)::int AS vault_pin_count,
        MAX(afp.save_count)::bigint AS top_pin_saves,
        MAX(COALESCE(afp.daily_save_velocity, 0))::numeric AS max_velocity,
        MIN(afp.current_rank)::int AS min_rank,
        BOOL_OR(NOT afp.is_displaced) AS has_active_pins,
        BOOL_OR(afp.is_displaced) AS has_vault_pins
      FROM all_folder_pins afp
      GROUP BY afp.clean_username
    ),
    folder_creators_serp AS (
      SELECT *
      FROM aggregated_creators
      WHERE ${vaultScope === 'all'} = TRUE
         OR has_active_pins = TRUE
         OR pin_count >= 2
         OR top_pin_saves >= 5
         OR min_rank <= 50
    )
    SELECT
      COALESCE(cp.id::text, 'serp_' || fcs.clean_username) AS id,
      cp.id AS competitor_id,
      fcs.clean_username AS username,
      fcs.pin_count,
      fcs.active_pin_count,
      fcs.vault_pin_count,
      fcs.has_active_pins,
      fcs.has_vault_pins,
      fcs.top_pin_saves,
      fcs.max_velocity,
      cp.display_name,
      cp.avatar_url,
      COALESCE(cp.monthly_reach, 0)::bigint AS monthly_reach,
      COALESCE(cp.profile_views, 0)::bigint AS profile_views,
      COALESCE(cp.total_pins, 0)::int AS total_pins,
      COALESCE(cp.total_boards, 0)::int AS total_boards,
      cp.follower_count,
      cp.activity_status,
      COALESCE(cp.tracking_mode, 'pulse_only') AS tracking_mode,
      COALESCE(fci.custom_label, cp.custom_label, '') AS custom_label,
      COALESCE(fci.source, 'discovered') AS discovery_source,
      COALESCE(cp.delta_reach_24h, 0)::bigint AS delta_reach_24h,
      COALESCE(cp.reach_delta_7d, 0)::bigint AS reach_delta_7d,
      COALESCE(cp.delta_views_24h, 0)::bigint AS delta_views_24h,
      COALESCE(cp.views_delta_7d, 0)::bigint AS views_delta_7d,
      COALESCE(cp.delta_pins_24h, 0)::int AS delta_pins_24h,
      COALESCE(cp.delta_boards_24h, 0)::int AS delta_boards_24h,
      COALESCE(cp.pins_delta_7d, 0)::int AS pins_delta_7d,
      COALESCE(cp.boards_delta_7d, 0)::int AS boards_delta_7d,
      (fci.id IS NOT NULL) AS is_linked,
      (fci.id IS NOT NULL) AS is_tracked,
      (fci.id IS NULL) AS auto_discovered
    FROM folder_creators_serp fcs
    LEFT JOIN competitor_profiles cp ON LOWER(cp.username) = fcs.clean_username
    LEFT JOIN folder_competitor_items fci ON fci.folder_id = ${fid} AND fci.competitor_id = cp.id
    ORDER BY (fci.id IS NOT NULL) DESC, fcs.pin_count DESC, COALESCE(cp.monthly_reach, 0) DESC;
  `;

  // Also include any explicitly linked competitors that might not have passed the high-signal SERP filter
  const linkedItems = await sql`
    WITH all_folder_pins AS (
      SELECT
        ksp.pin_id,
        LOWER(TRIM(ump.creator_username)) AS clean_username,
        ump.save_count,
        ump.daily_save_velocity,
        ksp.is_displaced
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE kfi.folder_id = ${fid}
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
        )
        AND ump.creator_username IS NOT NULL AND ump.creator_username <> ''
    ),
    aggregated_creators AS (
      SELECT
        clean_username,
        COUNT(DISTINCT pin_id)::int AS pin_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE NOT is_displaced)::int AS active_pin_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE is_displaced)::int AS vault_pin_count,
        COALESCE(MAX(save_count), 0)::bigint AS top_pin_saves,
        COALESCE(MAX(COALESCE(daily_save_velocity, 0)), 0)::numeric AS max_velocity,
        COALESCE(BOOL_OR(NOT is_displaced), FALSE) AS has_active_pins,
        COALESCE(BOOL_OR(is_displaced), FALSE) AS has_vault_pins
      FROM all_folder_pins
      GROUP BY clean_username
    )
    SELECT
      cp.id::text AS id,
      cp.id AS competitor_id,
      LOWER(TRIM(cp.username)) AS username,
      COALESCE(ac.pin_count, 0)::int AS pin_count,
      COALESCE(ac.active_pin_count, 0)::int AS active_pin_count,
      COALESCE(ac.vault_pin_count, 0)::int AS vault_pin_count,
      COALESCE(ac.has_active_pins, FALSE) AS has_active_pins,
      COALESCE(ac.has_vault_pins, FALSE) AS has_vault_pins,
      COALESCE(ac.top_pin_saves, 0)::bigint AS top_pin_saves,
      COALESCE(ac.max_velocity, 0)::numeric AS max_velocity,
      cp.display_name,
      cp.avatar_url,
      COALESCE(cp.monthly_reach, 0)::bigint AS monthly_reach,
      COALESCE(cp.profile_views, 0)::bigint AS profile_views,
      COALESCE(cp.total_pins, 0)::int AS total_pins,
      COALESCE(cp.total_boards, 0)::int AS total_boards,
      cp.follower_count,
      cp.activity_status,
      COALESCE(cp.tracking_mode, 'full') AS tracking_mode,
      COALESCE(fci.custom_label, cp.custom_label, '') AS custom_label,
      COALESCE(fci.source, 'manual') AS discovery_source,
      COALESCE(cp.delta_reach_24h, 0)::bigint AS delta_reach_24h,
      COALESCE(cp.reach_delta_7d, 0)::bigint AS reach_delta_7d,
      COALESCE(cp.delta_views_24h, 0)::bigint AS delta_views_24h,
      COALESCE(cp.views_delta_7d, 0)::bigint AS views_delta_7d,
      COALESCE(cp.delta_pins_24h, 0)::int AS delta_pins_24h,
      COALESCE(cp.delta_boards_24h, 0)::int AS delta_boards_24h,
      COALESCE(cp.pins_delta_7d, 0)::int AS pins_delta_7d,
      COALESCE(cp.boards_delta_7d, 0)::int AS boards_delta_7d,
      TRUE AS is_linked,
      TRUE AS is_tracked,
      FALSE AS auto_discovered
    FROM folder_competitor_items fci
    JOIN competitor_profiles cp ON cp.id = fci.competitor_id
    LEFT JOIN aggregated_creators ac ON ac.clean_username = LOWER(TRIM(cp.username))
    WHERE fci.folder_id = ${fid};
  `;

  const existingUsernames = new Set(rows.map(r => (r.username || '').toLowerCase()));
  const dedupedLinked = linkedItems.filter(r => !existingUsernames.has((r.username || '').toLowerCase()));
  const allRows = [...rows, ...dedupedLinked].map(r => {
    const monthlyReach = Number(r.monthly_reach || 0);
    const profileViews = Number(r.profile_views || 0);
    const pinsDelta7d = Number(r.pins_delta_7d || 0);
    const deltaPins24h = Number(r.delta_pins_24h || 0);
    const measuredCadence = pinsDelta7d > 0
      ? Number((pinsDelta7d / 7).toFixed(1))
      : (deltaPins24h > 0 ? Number(deltaPins24h.toFixed(1)) : null);

    return {
      ...r,
      pin_count: Number(r.pin_count || 0),
      active_pin_count: Number(r.active_pin_count || 0),
      vault_pin_count: Number(r.vault_pin_count || 0),
      has_active_pins: Boolean(r.has_active_pins),
      has_vault_pins: Boolean(r.has_vault_pins),
      top_pin_saves: Number(r.top_pin_saves || 0),
      follower_count: Number(r.follower_count || 0),
      monthly_reach: monthlyReach,
      profile_views: profileViews,
      total_pins: Number(r.total_pins || 0),
      total_boards: Number(r.total_boards || 0),
      delta_reach_24h: sanitizeStoredCeilingDelta(monthlyReach, r.delta_reach_24h),
      reach_delta_7d: sanitizeStoredCeilingDelta(monthlyReach, r.reach_delta_7d),
      delta_views_24h: sanitizeStoredCeilingDelta(profileViews, r.delta_views_24h),
      views_delta_7d: sanitizeStoredCeilingDelta(profileViews, r.views_delta_7d),
      delta_pins_24h: deltaPins24h,
      pins_delta_7d: pinsDelta7d,
      delta_boards_24h: Number(r.delta_boards_24h || 0),
      boards_delta_7d: Number(r.boards_delta_7d || 0),
      pins_per_day: measuredCadence
    };
  });
  const linked = allRows.filter(r => r.is_linked);
  const discovered = allRows.filter(r => !r.is_linked);

  const totalAudience = allRows.reduce((sum, r) => sum + Number(r.monthly_reach || 0), 0);
  const totalImpressions = allRows.reduce((sum, r) => sum + Number(r.profile_views || 0), 0);
  const totalPins = allRows.reduce((sum, r) => sum + Number(r.total_pins || 0), 0);
  const nonAggregatorRows = allRows.filter(r => Number(r.total_pins || 0) < 1000000);
  const totalPinsExAggregators = nonAggregatorRows.reduce((sum, r) => sum + Number(r.total_pins || 0), 0);
  const megaAggregatorCount = allRows.length - nonAggregatorRows.length;
  const cadenceRows = nonAggregatorRows.filter(r => r.pins_per_day !== null && r.pins_per_day > 0);
  const avgCadence = cadenceRows.length > 0
    ? Number((cadenceRows.reduce((sum, r) => sum + Number(r.pins_per_day || 0), 0) / cadenceRows.length).toFixed(1))
    : 0;

  const totalDeltaAudience24h = allRows.reduce((sum, r) => sum + Number(r.delta_reach_24h || 0), 0);
  const totalDeltaImpressions24h = allRows.reduce((sum, r) => sum + Number(r.delta_views_24h || 0), 0);
  const totalDeltaPins24h = allRows.reduce((sum, r) => sum + Number(r.delta_pins_24h || 0), 0);

  const [folderMetaRow] = await sql`
    SELECT metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
  `.catch(() => []);
  const folderMeta = normalizeFolderMetadata(folderMetaRow?.metadata);
  const autoDiscoverCreatorsEnabled = folderMeta.auto_discover_creators !== false;

  return {
    linked_creators: linked,
    discovered_creators: discovered,
    all_creators: allRows,
    auto_discovered: discovered,
    auto_discover_creators: autoDiscoverCreatorsEnabled,
    vault_scope: vaultScope,
    totals: {
      total_linked: linked.length,
      total_discovered: discovered.length,
      total_creators: allRows.length,
      combined_audience: totalAudience,
      combined_impressions: totalImpressions,
      combined_pins: totalPins,
      combined_pins_ex_aggregators: totalPinsExAggregators,
      mega_aggregator_count: megaAggregatorCount,
      avg_pinning_cadence: avgCadence,
      delta_24h: totalDeltaAudience24h,
      delta_reach_24h: totalDeltaAudience24h,
      delta_impressions_24h: totalDeltaImpressions24h,
      delta_pins_24h: totalDeltaPins24h
    }
  };
}

/**
 * Auto-discover creator accounts from folder SERP
 */
export async function autoDiscoverFolderCreators(sql, folderId, options = {}) {
  const result = await listFolderCreatorsWithDiscovery(sql, folderId, options);
  return result.discovered_creators;
}

/**
 * Toggle creator tracking between auto-discovered and actively tracked
 */
export async function toggleFolderCreatorTracking(sql, folderId, competitorIdOrUsername, { linkOnly = false } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  let competitorId = Number(competitorIdOrUsername);
  if (!competitorId && typeof competitorIdOrUsername === 'string') {
    const cleanUser = competitorIdOrUsername.trim().toLowerCase().replace(/^serp_/, '').replace(/^@/, '');
    const [existing] = await sql`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
    if (existing) {
      competitorId = existing.id;
    } else {
      const [created] = await sql`
        INSERT INTO competitor_profiles (
          username, display_name, account_type, is_active,
          tracking_mode, source_folder_id,
          metadata, created_at, updated_at
        )
        VALUES (
          ${cleanUser}, ${cleanUser}, 'competitor', TRUE,
          'pulse_only', ${fid},
          jsonb_build_object('profile_pulse_only', true, 'discovery_source', 'serp_auto', 'discovered_from_folder_id', ${fid}),
          NOW(), NOW()
        )
        ON CONFLICT (username) DO UPDATE SET
          is_active = TRUE,
          tracking_mode = COALESCE(competitor_profiles.tracking_mode, 'pulse_only'),
          source_folder_id = COALESCE(competitor_profiles.source_folder_id, EXCLUDED.source_folder_id),
          metadata = COALESCE(competitor_profiles.metadata, '{}'::jsonb) || jsonb_build_object('profile_pulse_only', true, 'discovery_source', 'serp_auto', 'discovered_from_folder_id', ${fid}),
          updated_at = NOW()
        RETURNING id;
      `;
      competitorId = created?.id;
    }
  }

  if (!competitorId) throw new Error('Invalid competitor ID or username');

  const [existingLink] = await sql`
    SELECT id FROM folder_competitor_items
    WHERE folder_id = ${fid} AND competitor_id = ${competitorId}
    LIMIT 1;
  `;

  if (existingLink) {
    if (linkOnly) {
      return { success: true, is_tracked: true, auto_discovered: false, already_linked: true, folder_id: fid, competitor_id: competitorId };
    }
    await unlinkCreatorFromFolder(sql, fid, competitorId);
    return { success: true, is_tracked: false, auto_discovered: true, folder_id: fid, competitor_id: competitorId };
  } else {
    await linkCreatorToFolder(sql, fid, competitorId);
    return { success: true, is_tracked: true, auto_discovered: false, folder_id: fid, competitor_id: competitorId };
  }
}

/**
 * Bulk-track creators for a folder in lightweight pulse-only mode (R3)
 * Auto-extracts SERP ranking creators if usernames omitted.
 * Sets custom_label (defaulting to 'SERP Auto • ${folder.name}') and tracking_mode = 'pulse_only'.
 * Triggers initial lightweight pulse if options.sync_now === true.
 */
export async function bulkPulseTrackFolderCreators(sql, folderId, options = {}, { env = null, ctx = null, workspaceId = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const [folder] = await sql`
    SELECT id, name, workspace_id, metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
  `;
  if (!folder) throw new Error(`Folder ${fid} not found`);

  const effectiveWid = Number(workspaceId || folder.workspace_id || DEFAULT_WORKSPACE_ID);
  const resolvedCookieObj = await resolveWorkspaceRawCookie(sql, effectiveWid).catch(() => ({ rawCookie: '' }));
  const rawWsCookie = typeof resolvedCookieObj === 'string'
    ? resolvedCookieObj.trim()
    : String(resolvedCookieObj?.rawCookie || '').trim();
  const wsCookie = rawWsCookie || (
    effectiveWid === DEFAULT_WORKSPACE_ID
      ? (env?.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : '') || '')
      : ''
  );

  const customLabel = (typeof options.custom_label === 'string' && options.custom_label.trim())
    ? options.custom_label.trim()
    : `SERP Auto • ${folder.name || 'Folder ' + fid}`;
  const trackingMode = (typeof options.tracking_mode === 'string' && options.tracking_mode.trim())
    ? options.tracking_mode.trim()
    : 'pulse_only';

  let targetUsernames = [];
  if (Array.isArray(options.usernames) && options.usernames.length > 0) {
    targetUsernames = options.usernames
      .map(u => normalizePinterestUsername(u))
      .filter(u => u && !RESERVED_PINTEREST_PATHS.has(u));
  } else {
    // Extract unique ranking creators from active SERP for this folder's keywords
    const serpCreators = await sql`
      SELECT DISTINCT LOWER(TRIM(ump.creator_username)) AS username
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE kfi.folder_id = ${fid}
        AND ksp.is_displaced IS FALSE
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
        )
        AND ump.creator_username IS NOT NULL AND ump.creator_username <> ''
        AND LOWER(TRIM(ump.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous');
    `;
    targetUsernames = (serpCreators || [])
      .map(r => normalizePinterestUsername(r.username))
      .filter(u => u && !RESERVED_PINTEREST_PATHS.has(u));
  }

  // Deduplicate target usernames
  targetUsernames = [...new Set(targetUsernames)];
  if (targetUsernames.length === 0) {
    return {
      success: true,
      folder_id: fid,
      tracked_count: 0,
      custom_label: customLabel,
      tracking_mode: trackingMode,
      synced_count: 0,
      items: []
    };
  }

  // Atomically upsert into competitor_profiles and link into folder_competitor_items
  const linkedRows = await sql`
    WITH target_handles AS (
      SELECT UNNEST(${targetUsernames}::text[]) AS username
    ),
    upserted_profiles AS (
      INSERT INTO competitor_profiles (
        username,
        display_name,
        account_type,
        is_active,
        tracking_mode,
        custom_label,
        source_folder_id,
        created_at,
        updated_at
      )
      SELECT
        th.username,
        th.username,
        'competitor',
        TRUE,
        ${trackingMode},
        ${customLabel},
        ${fid},
        NOW(),
        NOW()
      FROM target_handles th
      ON CONFLICT (username) DO UPDATE SET
        tracking_mode = CASE
          WHEN competitor_profiles.tracking_mode = 'full' THEN 'full'
          ELSE COALESCE(EXCLUDED.tracking_mode, competitor_profiles.tracking_mode)
        END,
        custom_label = COALESCE(NULLIF(TRIM(competitor_profiles.custom_label), ''), EXCLUDED.custom_label),
        source_folder_id = COALESCE(competitor_profiles.source_folder_id, EXCLUDED.source_folder_id),
        updated_at = NOW()
      RETURNING id, username
    ),
    all_profiles AS (
      SELECT id, username FROM upserted_profiles
      UNION
      SELECT cp.id, cp.username
      FROM competitor_profiles cp
      JOIN target_handles th ON LOWER(cp.username) = LOWER(th.username)
    )
    INSERT INTO folder_competitor_items (
      folder_id,
      competitor_id,
      custom_label,
      source,
      added_at
    )
    SELECT
      ${fid},
      ap.id,
      ${customLabel},
      'serp_auto',
      NOW()
    FROM all_profiles ap
    ON CONFLICT (folder_id, competitor_id) DO UPDATE SET
      custom_label = COALESCE(NULLIF(TRIM(folder_competitor_items.custom_label), ''), EXCLUDED.custom_label),
      source = COALESCE(NULLIF(TRIM(folder_competitor_items.source), ''), 'serp_auto')
    RETURNING folder_id, competitor_id;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid, effectiveWid);

  // If sync_now requested, perform initial pulse sync on target creators
  let syncedCount = 0;
  if (options.sync_now === true) {
    const pulseTargets = targetUsernames.slice(0, 10);
    const backgroundTargets = targetUsernames.slice(10);

    for (const username of pulseTargets) {
      try {
        await syncCompetitorProfile(sql, username, wsCookie, { pulseOnly: true, disableGlobalCookieFallback: true });
        syncedCount++;
      } catch (err) {
        console.warn(`[BulkPulseTrack] Initial sync failed for ${username}:`, err.message);
      }
    }

    if (backgroundTargets.length > 0 && ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(
        ctx,
        async () => {
          for (const username of backgroundTargets) {
            try {
              await syncCompetitorProfile(sql, username, wsCookie, { pulseOnly: true, disableGlobalCookieFallback: true });
            } catch (_) {}
          }
        },
        'bulk_pulse_track_sync'
      );
    }
  }

  return {
    success: true,
    folder_id: fid,
    tracked_count: linkedRows.length,
    custom_label: customLabel,
    tracking_mode: trackingMode,
    synced_count: syncedCount,
    items: linkedRows
  };
}

/**
 * Auto-discover SERP creators for a keyword and associate them with all folders tracking that keyword
 * Hooked after keyword SERP crawl when folder.metadata.auto_discover_creators !== false.
 */
export async function autoDiscoverFolderCreatorsForKeyword(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) return { discovered: 0 };

  const folders = await sql`
    SELECT f.id, f.name, f.metadata
    FROM keyword_folder_items kfi
    JOIN keyword_folders f ON f.id = kfi.folder_id
    WHERE kfi.keyword_id = ${kid};
  `;

  if (!folders || folders.length === 0) return { discovered: 0 };

  let totalDiscovered = 0;
  for (const folder of folders) {
    const meta = normalizeFolderMetadata(folder.metadata);
    if (
      meta.auto_discover_creators === false ||
      meta.pause_competitors === true ||
      meta.block_fleet === true ||
      meta.block_gha_fleet === true ||
      ['paused', 'archived'].includes(String(meta.status || '').toLowerCase())
    ) {
      continue;
    }

    const fid = folder.id;
    const customLabel = `SERP Auto • ${folder.name || 'Folder ' + fid}`;

    const linked = await sql`
      WITH ranked_creators AS (
        SELECT DISTINCT LOWER(TRIM(ump.creator_username)) AS username
        FROM keyword_serp_positions ksp
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE ksp.keyword_id = ${kid}
          AND ksp.is_displaced IS FALSE
          AND ump.creator_username IS NOT NULL AND ump.creator_username <> ''
          AND LOWER(TRIM(ump.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
      ),
      upserted_profiles AS (
        INSERT INTO competitor_profiles (
          username,
          display_name,
          account_type,
          is_active,
          tracking_mode,
          custom_label,
          source_folder_id,
          created_at,
          updated_at
        )
        SELECT
          rc.username,
          rc.username,
          'competitor',
          TRUE,
          'pulse_only',
          ${customLabel},
          ${fid},
          NOW(),
          NOW()
        FROM ranked_creators rc
        ON CONFLICT (username) DO UPDATE SET
          updated_at = NOW()
        RETURNING id, username
      ),
      all_target_profiles AS (
        SELECT id, username FROM upserted_profiles
        UNION
        SELECT cp.id, cp.username
        FROM competitor_profiles cp
        JOIN ranked_creators rc ON LOWER(cp.username) = LOWER(rc.username)
      )
      INSERT INTO folder_competitor_items (
        folder_id,
        competitor_id,
        custom_label,
        source,
        added_at
      )
      SELECT
        ${fid},
        atp.id,
        ${customLabel},
        'serp_auto',
        NOW()
      FROM all_target_profiles atp
      ON CONFLICT (folder_id, competitor_id) DO NOTHING
      RETURNING id;
    `;

    totalDiscovered += (linked ? linked.length : 0);
  }

  return { discovered: totalDiscovered };
}

/**
 * Identify candidate pins for smart pruning across keyword_serp_positions
 */
export async function getPruningCandidates(sql, folderId, options = {}) {
  const fid = Number(folderId);
  if (!fid || !Number.isInteger(fid) || fid <= 0) {
    throw makeHttpError('Invalid folder ID', 400);
  }

  const {
    keywordIds = [],
    scope = 'displaced',
    minFolderAgeDays = null,
    minPinAgeDays = null,
    maxSaves = null,
    maxRepins = null,
    skipRisingVelocity = true,
    skip_rising_velocity
  } = options;

  const validKids = (Array.isArray(keywordIds) ? keywordIds : String(keywordIds).split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const targetScope = String(scope || 'displaced').trim().toLowerCase();
  if (!['displaced', 'all', 'active'].includes(targetScope)) {
    throw makeHttpError('Invalid pruning scope. Allowed values: displaced, active, all', 400);
  }
  const resolvedMinFolderAge = parseOptionalNonNegativeInt(minFolderAgeDays, 'min_folder_age_days');
  const resolvedMinPinAge = parseOptionalNonNegativeInt(minPinAgeDays, 'min_pin_age_days');
  const resolvedMaxSaves = parseOptionalNonNegativeInt(maxSaves, 'max_saves');
  const resolvedMaxRepins = parseOptionalNonNegativeInt(maxRepins, 'max_repins');
  const resolvedSkipRising = parseOptionalBoolean(
    skip_rising_velocity !== undefined ? skip_rising_velocity : skipRisingVelocity,
    true
  );

  const runCandidates = (withFirstSeen) => {
    if (withFirstSeen) {
      return sql`
        SELECT
          ksp.keyword_id,
          ksp.pin_id,
          ump.title,
          ump.image_url,
          ump.clean_domain AS domain,
          ump.save_count,
          ump.repin_count,
          ump.daily_save_velocity,
          ksp.is_displaced,
          ump.created_at_pinterest,
          tk.keyword,
          COALESCE(ksp.first_seen_at, i.added_at) AS folder_added_at
        FROM keyword_folder_items i
        JOIN tracked_keywords tk ON tk.id = i.keyword_id
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = i.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE i.folder_id = ${fid}
          AND (${validKids.length === 0} OR i.keyword_id = ANY(${validKids}::int[]))
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
          )
          AND (
            (${targetScope} = 'all') OR
            (${targetScope} = 'displaced' AND ksp.is_displaced = TRUE) OR
            (${targetScope} = 'active' AND ksp.is_displaced = FALSE)
          )
          AND (${resolvedMaxSaves === null} OR (ump.save_count IS NOT NULL AND ump.save_count <= ${resolvedMaxSaves}))
          AND (${resolvedMaxRepins === null} OR (ump.repin_count IS NOT NULL AND ump.repin_count <= ${resolvedMaxRepins}))
          AND (
            ${resolvedMinPinAge === null} OR ${resolvedMinPinAge <= 0} OR
            (ump.created_at_pinterest IS NOT NULL AND ump.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval)
          )
          AND (
            ${resolvedMinFolderAge === null} OR ${resolvedMinFolderAge <= 0} OR
            (COALESCE(ksp.first_seen_at, i.added_at) <= NOW() - (${resolvedMinFolderAge} || ' days')::interval)
          )
          AND (${!resolvedSkipRising} OR COALESCE(ump.daily_save_velocity, 0) <= 0);
      `;
    }
    return sql`
      SELECT
        ksp.keyword_id,
        ksp.pin_id,
        ump.title,
        ump.image_url,
        ump.clean_domain AS domain,
        ump.save_count,
        ump.repin_count,
        ump.daily_save_velocity,
        ksp.is_displaced,
        ump.created_at_pinterest,
        tk.keyword,
        i.added_at AS folder_added_at
      FROM keyword_folder_items i
      JOIN tracked_keywords tk ON tk.id = i.keyword_id
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = i.keyword_id
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE i.folder_id = ${fid}
        AND (${validKids.length === 0} OR i.keyword_id = ANY(${validKids}::int[]))
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
        )
        AND (
          (${targetScope} = 'all') OR
          (${targetScope} = 'displaced' AND ksp.is_displaced = TRUE) OR
          (${targetScope} = 'active' AND ksp.is_displaced = FALSE)
        )
        AND (${resolvedMaxSaves === null} OR (ump.save_count IS NOT NULL AND ump.save_count <= ${resolvedMaxSaves}))
        AND (${resolvedMaxRepins === null} OR (ump.repin_count IS NOT NULL AND ump.repin_count <= ${resolvedMaxRepins}))
        AND (
          ${resolvedMinPinAge === null} OR ${resolvedMinPinAge <= 0} OR
          (ump.created_at_pinterest IS NOT NULL AND ump.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval)
        )
        AND (
          ${resolvedMinFolderAge === null} OR ${resolvedMinFolderAge <= 0} OR
          (i.added_at <= NOW() - (${resolvedMinFolderAge} || ' days')::interval)
        )
        AND (${!resolvedSkipRising} OR COALESCE(ump.daily_save_velocity, 0) <= 0);
    `;
  };

  try {
    return await runCandidates(true);
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    const msg = String(err?.message || err?.cause?.message || '');
    if (code === '42703' && /first_seen_at/i.test(msg)) {
      return await runCandidates(false);
    }
    throw err;
  }
}

/**
 * Smart Pin Pruning Service (R4)
 * Supports dry-run preview and atomic deletion with keyword_ignored_pins tombstoning and edge cache evictions
 */
export async function pruneFolderPins(sql, folderId, options = {}, context = {}) {
  // [INVARIANT: PRUNE-TOMBSTONE-AND-EVICT]
  // Pruning execution tombstones candidate pins to keyword_ignored_pins
  const fid = Number(folderId);
  if (!fid || !Number.isInteger(fid) || fid <= 0) {
    throw makeHttpError('Invalid folder ID', 400);
  }

  const {
    dryRun = true,
    dry_run,
    keywordIds = [],
    keyword_ids,
    scope = 'displaced',
    minFolderAgeDays = null,
    min_folder_age_days,
    minPinAgeDays = null,
    min_pin_age_days,
    maxSaves = null,
    max_saves,
    maxRepins = null,
    max_repins,
    skipRisingVelocity = true,
    skip_rising_velocity
  } = options;

  const isDryRun = parseOptionalBoolean(dry_run !== undefined ? dry_run : dryRun, true);
  const rawKids = (keyword_ids !== undefined ? keyword_ids : keywordIds) || [];
  const validKids = (Array.isArray(rawKids) ? rawKids : String(rawKids).split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const targetScope = String(scope || 'displaced').trim().toLowerCase();
  if (!['displaced', 'all', 'active'].includes(targetScope)) {
    throw makeHttpError('Invalid pruning scope. Allowed values: displaced, active, all', 400);
  }
  const resolvedMinFolderAge = parseOptionalNonNegativeInt(
    min_folder_age_days ?? minFolderAgeDays,
    'min_folder_age_days'
  );
  const resolvedMinPinAge = parseOptionalNonNegativeInt(
    min_pin_age_days ?? minPinAgeDays,
    'min_pin_age_days'
  );
  const resolvedMaxSaves = parseOptionalNonNegativeInt(
    max_saves ?? maxSaves,
    'max_saves'
  );
  const resolvedMaxRepins = parseOptionalNonNegativeInt(
    max_repins ?? maxRepins,
    'max_repins'
  );
  const resolvedSkipRising = parseOptionalBoolean(
    skip_rising_velocity !== undefined ? skip_rising_velocity : skipRisingVelocity,
    true
  );

  // 1. Identify Candidate Pins from keyword_serp_positions
  const candidates = await getPruningCandidates(sql, fid, {
    keywordIds: validKids,
    scope: targetScope,
    minFolderAgeDays: resolvedMinFolderAge,
    minPinAgeDays: resolvedMinPinAge,
    maxSaves: resolvedMaxSaves,
    maxRepins: resolvedMaxRepins,
    skipRisingVelocity: resolvedSkipRising
  });

  if (isDryRun) {
    return {
      success: true,
      dry_run: true,
      dryRun: true,
      matched_count: candidates.length,
      candidates_count: candidates.length,
      sample_pins: candidates.slice(0, 30),
      summary: {
        scope: targetScope,
        keyword_ids: validKids,
        keywordIds: validKids,
        min_folder_age_days: resolvedMinFolderAge,
        minFolderAgeDays: resolvedMinFolderAge,
        min_pin_age_days: resolvedMinPinAge,
        minPinAgeDays: resolvedMinPinAge,
        max_saves: resolvedMaxSaves,
        maxSaves: resolvedMaxSaves,
        max_repins: resolvedMaxRepins,
        maxRepins: resolvedMaxRepins,
        skip_rising_velocity: resolvedSkipRising
      }
    };
  }

  if (candidates.length === 0) {
    return {
      success: true,
      dry_run: false,
      dryRun: false,
      matched_count: 0,
      candidates_count: 0,
      pruned_count: 0,
      pruned_pins: 0,
      untracked_campaign_pins: 0
    };
  }

  // Deduplicate exact (keyword_id, pin_id) candidate pairs to prevent Cartesian or duplicate execution
  const uniquePairs = [];
  const seenPair = new Set();
  for (const c of candidates) {
    const kid = Number(c.keyword_id);
    const pid = String(c.pin_id || '').trim();
    if (kid && pid) {
      const key = `${kid}:${pid}`;
      if (!seenPair.has(key)) {
        seenPair.add(key);
        uniquePairs.push({ keyword_id: kid, pin_id: pid });
      }
    }
  }

  const pruneKeywordIds = uniquePairs.map(p => p.keyword_id);
  const prunePinIds = uniquePairs.map(p => p.pin_id);
  const uniquePinIds = [...new Set(prunePinIds)];

  // A & B. Tombstone in keyword_ignored_pins and delete from keyword_serp_positions using atomic paired UNNEST tuple deletion
  // [INVARIANT: ATOMIC-UNNEST-TUPLE-DELETION]
  let deletedCount = 0;
  let deletedUniquePinsCount = 0;
  if (pruneKeywordIds.length > 0) {
    const removeResult = await ignoreAndRemoveSerpPin(sql, {
      pairs: uniquePairs,
      reason: 'folder_smart_pruning'
    });
    deletedCount = Number(removeResult?.deletedCount ?? 0);
    deletedUniquePinsCount = Array.isArray(removeResult?.deletedPinIds)
      ? removeResult.deletedPinIds.length
      : (deletedCount > 0 ? Math.min(uniquePinIds.length, deletedCount) : 0);
  }

  // C. Remove orphaned search-tracked rows from campaign_tracked_pins when no active folder SERP link remains
  let untrackedCampaignPins = 0;
  if (uniquePinIds.length > 0) {
    try {
      const untrackedRows = await sql`
        DELETE FROM campaign_tracked_pins ctp
        WHERE ctp.folder_id = ${fid}
          AND ctp.source_type = 'search'
          AND ctp.pin_id = ANY(${uniquePinIds}::text[])
          AND NOT EXISTS (
            SELECT 1
            FROM keyword_folder_items kfi
            JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
            WHERE kfi.folder_id = ${fid}
              AND ksp.pin_id = ctp.pin_id
              AND ksp.is_displaced = FALSE
          )
        RETURNING ctp.pin_id;
      `;
      untrackedCampaignPins = Array.isArray(untrackedRows) ? untrackedRows.length : 0;
    } catch (err) {
      const code = String(err?.code || err?.cause?.code || '');
      if (code !== '42P01') throw err;
    }
  }

  // D. Invalidate in-memory crossover cache (workspace-scoped when provided)
  invalidateFolderCache(fid, context?.workspaceId ?? null);

  return {
    success: true,
    dry_run: false,
    dryRun: false,
    matched_count: uniquePairs.length,
    candidates_count: uniquePairs.length,
    pruned_count: deletedCount,
    pruned_pins: deletedUniquePinsCount,
    untracked_campaign_pins: untrackedCampaignPins
  };
}

/**
 * Get folder membership for a keyword (strictly scoped to the active workspace)
 */
export async function getFoldersForKeyword(sql, keywordId, { workspaceId = DEFAULT_WORKSPACE_ID } = {}) {
  const kid = Number(keywordId);
  if (!kid) return [];
  const wid = parsePositiveWorkspaceId(workspaceId) || DEFAULT_WORKSPACE_ID;

  try {
    return await sql`
      SELECT 
        f.id,
        f.name,
        f.color,
        f.icon,
        f.workspace_id,
        i.added_at
      FROM keyword_folder_items i
      JOIN keyword_folders f ON f.id = i.folder_id
      WHERE i.keyword_id = ${kid}
        AND f.workspace_id = ${wid}
      ORDER BY f.name ASC;
    `;
  } catch (err) {
    if (!isMissingWorkspaceColumnError(err)) throw err;
    if (wid !== DEFAULT_WORKSPACE_ID) return [];
    return await sql`
      SELECT 
        f.id,
        f.name,
        f.color,
        f.icon,
        i.added_at
      FROM keyword_folder_items i
      JOIN keyword_folders f ON f.id = i.folder_id
      WHERE i.keyword_id = ${kid}
      ORDER BY f.name ASC;
    `;
  }
}
