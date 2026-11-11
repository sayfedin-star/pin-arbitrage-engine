/**
 * Keyword Folders & Algorithmic Crossover Engine Service
 *
 * Provides:
 * 1. Campaign / Project Folder CRUD & keyword association.
 * 2. Multi-Dimensional Crossover Analysis:
 *    - Multi-ranking "Super-Pins" overlap (pins ranking across >=2 folder keywords)
 *    - Universal Visual Tag Bridges (CV annotations shared across keywords with frequency & %)
 *    - Shared Guided Pivots & Semantic Search Capsules (long-tail modifiers connecting keywords)
 *    - Whale Creators & Domain Authority Overlap (monopoly index across folder SERPs)
 *    - Composite 52-Week Seasonality Wave & Peak Month Launch Calendar
 *    - 1-Click Topic Cluster Blueprint & Content Generator (Pillar + Spoke pins with exportable CSV)
 *
 * Hardened with Neon Serverless Postgres (@neondatabase/serverless).
 */

import { fetchPinterestTrends } from './trends-service.mjs';
import { normalizePinterestUsername, RESERVED_PINTEREST_PATHS, syncCompetitorProfile } from '../creators/service.mjs';
import {
  safeWaitUntil,
  batchGroupByShard,
  coalesceShardGroupsByPhysical,
  resolveShardConnection,
  executeShardQueryWithCircuitBreaker,
  preloadNeonRegistry,
  isUnifiedPostgres
} from '../sharding/fleet-router.mjs';
import { extractCanonicalAnnotations, normalizeAnnotationTag } from '../../domain/pin-intelligence.mjs';
import { getFolderPulseCrossoverAnalytics } from '../pulse/service.mjs';

export const folderTrendsCache = new Map();
export const FOLDER_TRENDS_CACHE_MAX = 100;

export function cacheFolderTrends(term, data) {
  if (!term || typeof term !== 'string') return;
  const cleanTerm = term.trim().toLowerCase();
  if (cleanTerm) {
    if (folderTrendsCache.has(cleanTerm)) {
      folderTrendsCache.delete(cleanTerm);
    } else if (folderTrendsCache.size >= FOLDER_TRENDS_CACHE_MAX) {
      const oldestKey = folderTrendsCache.keys().next().value;
      if (oldestKey !== undefined) {
        folderTrendsCache.delete(oldestKey);
      }
    }
    folderTrendsCache.set(cleanTerm, { timestamp: Date.now(), data });
  }
}

const crossoverCache = new Map();
const CROSSOVER_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const CROSSOVER_CACHE_MAX = 50;
const inflightCrossover = new Map();
export const folderForceRefreshCooldown = new Map();
export const FOLDER_FORCE_REFRESH_COOLDOWN_MS = 15 * 1000; // 15-second per-folder cooldown on forced ?refresh=true

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
    crossoverCache.delete(Number(folderId));
    folderForceRefreshCooldown.delete(Number(folderId));
  } else {
    crossoverCache.clear();
    folderForceRefreshCooldown.clear();
  }
  folderTrendsCache.clear();
}

/**
 * Lightweight folder listing for fast header dropdown / switcher (< 5ms)
 * Queries only keyword_folders and keyword_folder_items count.
 */
export async function listFoldersLite(sql, { projectId = 'default' } = {}) {
  const rows = await sql`
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
  return rows.map(r => ({
    ...r,
    metadata: normalizeFolderMetadata(r.metadata),
    keyword_count: Number(r.keyword_count || 0),
    item_count: Number(r.item_count || r.keyword_count || 0)
  }));
}

/**
 * List all folders with item counts and keyword previews
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */
export async function listFolders(sql, { projectId = 'default' } = {}) {
  const rows = await sql`
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
    active_folder_pins AS (
      SELECT
        kfi.folder_id,
        ksc.pin_id,
        ksc.is_displaced,
        LOWER(TRIM(ksc.domain)) AS clean_domain,
        LOWER(TRIM(ksc.creator_username)) AS clean_username
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE ksc.is_displaced = FALSE
        AND ksc.rank_position IS NOT NULL
        AND ksc.rank_position >= 1
    ),
    vault_folder_pins AS (
      SELECT
        kfi.folder_id,
        kdi.pin_id,
        LOWER(TRIM(kdi.domain)) AS clean_domain,
        LOWER(TRIM(kdi.creator_username)) AS clean_username
      FROM keyword_folder_items kfi
      JOIN keyword_displaced_index kdi ON kdi.keyword_id = kfi.keyword_id
      WHERE kdi.last_known_rank IS NOT NULL
        AND kdi.last_known_rank >= 1
    ),
    active_unique_pins AS (
      SELECT
        kfi.folder_id,
        COUNT(DISTINCT ksc.pin_id)::int AS active_pins_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE ksc.is_displaced = FALSE
        AND ksc.rank_position IS NOT NULL
        AND ksc.rank_position >= 1
      GROUP BY kfi.folder_id
    ),
    combined_summary AS (
      SELECT
        folder_id,
        COUNT(DISTINCT pin_id)::int AS unique_pins_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE item_source = 'active')::int AS active_pins_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE item_source = 'vault')::int AS vault_pins_count,
        COUNT(DISTINCT clean_domain) FILTER (
          WHERE clean_domain IS NOT NULL AND clean_domain <> ''
            AND clean_domain NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it', 'localhost', 'direct', 'organic')
            AND clean_domain LIKE '%.%'
        )::int AS domain_count,
        COUNT(DISTINCT clean_username) FILTER (
          WHERE clean_username IS NOT NULL AND clean_username <> ''
            AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
        )::int AS discovered_creator_count
      FROM (
        SELECT folder_id, pin_id, clean_domain, clean_username, 'active' AS item_source, is_displaced FROM active_folder_pins
        UNION ALL
        SELECT folder_id, pin_id, clean_domain, clean_username, 'vault' AS item_source, TRUE AS is_displaced FROM vault_folder_pins
        UNION ALL
        SELECT fci.folder_id, NULL AS pin_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username, 'tracked' AS item_source, FALSE AS is_displaced
        FROM folder_competitor_items fci
        JOIN competitor_profiles cp ON cp.id = fci.competitor_id
        WHERE cp.username IS NOT NULL AND cp.username <> ''
      ) comb
      WHERE comb.is_displaced = FALSE OR comb.item_source = 'vault'
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
  return rows.map(r => ({
    ...r,
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
export async function getFolder(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) return null;

  const [folder] = await sql`
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
    active_folder_pins AS (
      SELECT
        kfi.folder_id,
        ksc.pin_id,
        ksc.is_displaced,
        LOWER(TRIM(ksc.domain)) AS clean_domain,
        LOWER(TRIM(ksc.creator_username)) AS clean_username
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.rank_position IS NOT NULL
        AND ksc.rank_position >= 1
    ),
    vault_folder_pins AS (
      SELECT
        kfi.folder_id,
        kdi.pin_id,
        LOWER(TRIM(kdi.domain)) AS clean_domain,
        LOWER(TRIM(kdi.creator_username)) AS clean_username
      FROM keyword_folder_items kfi
      JOIN keyword_displaced_index kdi ON kdi.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND kdi.last_known_rank IS NOT NULL
        AND kdi.last_known_rank >= 1
    ),
    active_unique_pins AS (
      SELECT
        kfi.folder_id,
        COUNT(DISTINCT ksc.pin_id)::int AS active_pins_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.rank_position IS NOT NULL
        AND ksc.rank_position >= 1
      GROUP BY kfi.folder_id
    ),
    combined_summary AS (
      SELECT
        folder_id,
        COUNT(DISTINCT pin_id)::int AS unique_pins_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE item_source = 'active')::int AS active_pins_count,
        COUNT(DISTINCT pin_id) FILTER (WHERE item_source = 'vault')::int AS vault_pins_count,
        COUNT(DISTINCT clean_domain) FILTER (
          WHERE clean_domain IS NOT NULL AND clean_domain <> ''
            AND clean_domain NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it', 'localhost', 'direct', 'organic')
            AND clean_domain LIKE '%.%'
        )::int AS domain_count,
        COUNT(DISTINCT clean_username) FILTER (
          WHERE clean_username IS NOT NULL AND clean_username <> ''
            AND clean_username NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
        )::int AS discovered_creator_count
      FROM (
        SELECT folder_id, pin_id, clean_domain, clean_username, 'active' AS item_source, is_displaced FROM active_folder_pins
        UNION ALL
        SELECT folder_id, pin_id, clean_domain, clean_username, 'vault' AS item_source, TRUE AS is_displaced FROM vault_folder_pins
        UNION ALL
        SELECT fci.folder_id, NULL AS pin_id, NULL AS clean_domain, LOWER(TRIM(cp.username)) AS clean_username, 'tracked' AS item_source, FALSE AS is_displaced
        FROM folder_competitor_items fci
        JOIN competitor_profiles cp ON cp.id = fci.competitor_id
        WHERE fci.folder_id = ${fid} AND cp.username IS NOT NULL AND cp.username <> ''
      ) comb
      WHERE comb.is_displaced = FALSE OR comb.item_source = 'vault'
      GROUP BY folder_id
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
      COALESCE(
        NULLIF(ksc.cnt, 0),
        CASE WHEN tk.metadata->>'last_crawled_pins_count' ~ '^[0-9]+$' THEN (tk.metadata->>'last_crawled_pins_count')::int ELSE 0 END,
        0
      )::int as pin_count
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    LEFT JOIN (
      SELECT keyword_id, COUNT(*)::int as cnt
      FROM keyword_serp_current
      WHERE is_displaced = FALSE AND rank_position >= 1
        AND keyword_id IN (SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${fid})
      GROUP BY keyword_id
    ) ksc ON ksc.keyword_id = tk.id
    WHERE i.folder_id = ${fid}
    ORDER BY i.added_at DESC;
  `;

  const resolvedCount = Array.isArray(items)
    ? items.length
    : Number(folder.keyword_count ?? folder.item_count ?? 0);

  return {
    ...folder,
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
  status = 'active',
  metadata = {} 
}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new Error('Folder name is required.');
  }

  const validStatuses = ['active', 'archived', 'paused', 'completed'];
  const cleanStatus = validStatuses.includes(String(status).toLowerCase())
    ? String(status).toLowerCase()
    : 'active';

  const cleanMetadata = { ...normalizeFolderMetadata(metadata), status: cleanStatus };
  const [created] = await sql`
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
      ${String(color || '#ec4899').trim()},
      ${String(icon || 'folder').trim()},
      ${String(projectId || 'default').trim()},
      ${JSON.stringify(cleanMetadata)}::jsonb,
      NOW(),
      NOW()
    )
    RETURNING *;
  `;

  return created ? { ...created, metadata: normalizeFolderMetadata(created.metadata) } : null;
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
  metadata 
}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const cleanName = name !== undefined ? String(name).trim() : null;
  if (name !== undefined && !cleanName) throw new Error('Folder name cannot be empty');

  let cleanMetadata = metadata !== undefined ? normalizeFolderMetadata(metadata) : null;
  if (status !== undefined) {
    const validStatuses = ['active', 'archived', 'paused', 'completed'];
    const cleanStatus = validStatuses.includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : 'active';
    cleanMetadata = { ...(cleanMetadata || {}), status: cleanStatus };
  }
  const [updated] = await sql`
    UPDATE keyword_folders
    SET 
      name = COALESCE(${cleanName}, name),
      description = COALESCE(${description !== undefined ? String(description).trim() : null}, description),
      color = COALESCE(${color !== undefined ? String(color).trim() : null}, color),
      icon = COALESCE(${icon !== undefined ? String(icon).trim() : null}, icon),
      metadata = CASE
        WHEN ${cleanMetadata !== null} THEN COALESCE(metadata, '{}'::jsonb) || ${cleanMetadata !== null ? JSON.stringify(cleanMetadata) : null}::jsonb
        ELSE metadata
      END,
      updated_at = NOW()
    WHERE id = ${fid}
    RETURNING *;
  `;

  invalidateFolderCache(fid);
  if (!updated) return null;
  const fullFolder = await getFolder(sql, fid).catch(() => null);
  return fullFolder || { ...updated, metadata: normalizeFolderMetadata(updated.metadata) };
}

/**
 * Delete folder and cascaded items
 */
export async function deleteFolder(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const [deleted] = await sql`
    DELETE FROM keyword_folders
    WHERE id = ${fid}
    RETURNING id, name;
  `;

  invalidateFolderCache(fid);
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

  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
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
        ksc.keyword_id,
        ksc.pin_id,
        LOWER(TRIM(ksc.creator_username)) AS clean_username,
        ksc.save_count,
        ksc.daily_save_velocity,
        ksc.rank_position AS current_rank,
        FALSE AS is_displaced
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
        AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')

      UNION ALL

      SELECT
        kfi.folder_id,
        kdi.keyword_id,
        kdi.pin_id,
        LOWER(TRIM(kdi.creator_username)) AS clean_username,
        kdi.save_count,
        kdi.daily_save_velocity,
        kdi.last_known_rank AS current_rank,
        TRUE AS is_displaced
      FROM keyword_folder_items kfi
      JOIN keyword_displaced_index kdi ON kdi.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND kdi.creator_username IS NOT NULL AND kdi.creator_username <> ''
        AND LOWER(TRIM(kdi.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
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

  // Also include any explicitly linked competitors that might not have active pins in SERP currently
  const linkedItems = await sql`
    SELECT
      cp.id::text AS id,
      cp.id AS competitor_id,
      LOWER(TRIM(cp.username)) AS username,
      0::int AS pin_count,
      0::int AS active_pin_count,
      0::int AS vault_pin_count,
      FALSE AS has_active_pins,
      FALSE AS has_vault_pins,
      0::bigint AS top_pin_saves,
      0::numeric AS max_velocity,
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
    WHERE fci.folder_id = ${fid}
      AND LOWER(TRIM(cp.username)) NOT IN (
        SELECT LOWER(TRIM(ksc.creator_username))
        FROM keyword_folder_items kfi2
        JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi2.keyword_id
        WHERE kfi2.folder_id = ${fid} AND ksc.is_displaced = FALSE
          AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
      );
  `;

  const existingUsernames = new Set(rows.map(r => (r.username || '').toLowerCase()));
  const dedupedLinked = linkedItems.filter(r => !existingUsernames.has((r.username || '').toLowerCase()));
  const allRows = [...rows, ...dedupedLinked].map(r => ({
    ...r,
    pin_count: Number(r.pin_count || 0),
    active_pin_count: Number(r.active_pin_count || 0),
    vault_pin_count: Number(r.vault_pin_count || 0),
    has_active_pins: Boolean(r.has_active_pins),
    has_vault_pins: Boolean(r.has_vault_pins),
    top_pin_saves: Number(r.top_pin_saves || 0),
    follower_count: Number(r.follower_count || 0),
    monthly_reach: Number(r.monthly_reach || 0),
    profile_views: Number(r.profile_views || 0),
    total_pins: Number(r.total_pins || 0),
    total_boards: Number(r.total_boards || 0),
    delta_reach_24h: Number(r.delta_reach_24h || 0),
    reach_delta_7d: Number(r.reach_delta_7d || 0),
    delta_views_24h: Number(r.delta_views_24h || 0),
    views_delta_7d: Number(r.views_delta_7d || 0),
    delta_pins_24h: Number(r.delta_pins_24h || 0),
    pins_delta_7d: Number(r.pins_delta_7d || 0),
    delta_boards_24h: Number(r.delta_boards_24h || 0),
    boards_delta_7d: Number(r.boards_delta_7d || 0),
  }));
  const linked = allRows.filter(r => r.is_linked);
  const discovered = allRows.filter(r => !r.is_linked);

  const totalAudience = allRows.reduce((sum, r) => sum + Number(r.monthly_reach || 0), 0);
  const totalImpressions = allRows.reduce((sum, r) => sum + Number(r.profile_views || 0), 0);
  const totalPins = allRows.reduce((sum, r) => sum + Number(r.total_pins || 0), 0);
  const nonAggregatorRows = allRows.filter(r => Number(r.total_pins || 0) < 1000000);
  const cadencePool = nonAggregatorRows.length > 0 ? nonAggregatorRows : allRows;
  const avgCadence = cadencePool.length > 0
    ? Number((cadencePool.reduce((sum, r) => sum + (Number(r.total_pins || 0) / 365), 0) / cadencePool.length).toFixed(1))
    : 0;

  const totalDeltaAudience24h = allRows.reduce((sum, r) => sum + Math.max(0, Number(r.delta_reach_24h || 0)), 0);
  const totalDeltaImpressions24h = allRows.reduce((sum, r) => sum + Math.max(0, Number(r.delta_views_24h || 0)), 0);
  const totalDeltaPins24h = allRows.reduce((sum, r) => sum + Math.max(0, Number(r.delta_pins_24h || 0)), 0);

  return {
    linked_creators: linked,
    discovered_creators: discovered,
    all_creators: allRows,
    auto_discovered: discovered,
    auto_discover_creators: true,
    vault_scope: vaultScope,
    totals: {
      total_linked: linked.length,
      total_discovered: discovered.length,
      total_creators: allRows.length,
      combined_audience: totalAudience,
      combined_impressions: totalImpressions,
      combined_pins: totalPins,
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
export async function toggleFolderCreatorTracking(sql, folderId, competitorIdOrUsername) {
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
export async function bulkPulseTrackFolderCreators(sql, folderId, options = {}, { env = null, ctx = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const [folder] = await sql`
    SELECT id, name, metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
  `;
  if (!folder) throw new Error(`Folder ${fid} not found`);

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
      SELECT DISTINCT LOWER(TRIM(ksc.creator_username)) AS username
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced IS FALSE
        AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
        AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous');
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
        tracking_mode = COALESCE(EXCLUDED.tracking_mode, competitor_profiles.tracking_mode),
        custom_label = COALESCE(EXCLUDED.custom_label, competitor_profiles.custom_label),
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
      custom_label = COALESCE(EXCLUDED.custom_label, folder_competitor_items.custom_label),
      source = 'serp_auto'
    RETURNING folder_id, competitor_id;
  `;

  await sql`
    UPDATE keyword_folders 
    SET updated_at = NOW() 
    WHERE id = ${fid};
  `;

  invalidateFolderCache(fid);

  // If sync_now requested, perform initial pulse sync on target creators
  let syncedCount = 0;
  if (options.sync_now === true) {
    const pulseTargets = targetUsernames.slice(0, 10);
    const backgroundTargets = targetUsernames.slice(10);

    for (const username of pulseTargets) {
      try {
        await syncCompetitorProfile(sql, username, null, { pulseOnly: true });
        syncedCount++;
      } catch (err) {
        console.warn(`[BulkPulseTrack] Initial sync failed for ${username}:`, err.message);
      }
    }

    if (backgroundTargets.length > 0 && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil((async () => {
        for (const username of backgroundTargets) {
          try {
            await syncCompetitorProfile(sql, username, null, { pulseOnly: true });
          } catch (_) {}
        }
      })());
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
    if (meta.auto_discover_creators === false) {
      continue;
    }

    const fid = folder.id;
    const customLabel = `SERP Auto • ${folder.name || 'Folder ' + fid}`;

    const linked = await sql`
      WITH ranked_creators AS (
        SELECT DISTINCT LOWER(TRIM(ksc.creator_username)) AS username
        FROM keyword_serp_current ksc
        WHERE ksc.keyword_id = ${kid}
          AND ksc.is_displaced IS FALSE
          AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
          AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
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
 * Identify candidate pins for smart pruning across keyword_serp_current and keyword_displaced_index
 */
export async function getPruningCandidates(sql, folderId, options = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const {
    keywordIds = [],
    scope = 'displaced',
    minFolderAgeDays = null,
    minPinAgeDays = null,
    maxSaves = null,
    maxRepins = null
  } = options;

  const validKids = (Array.isArray(keywordIds) ? keywordIds : String(keywordIds).split(',')).map(Number).filter(Boolean);
  const targetScope = String(scope || 'displaced').toLowerCase();
  const resolvedMinFolderAge = minFolderAgeDays !== null && minFolderAgeDays !== undefined ? Number(minFolderAgeDays) : null;
  const resolvedMinPinAge = minPinAgeDays !== null && minPinAgeDays !== undefined ? Number(minPinAgeDays) : null;
  const resolvedMaxSaves = maxSaves !== null && maxSaves !== undefined ? Number(maxSaves) : null;
  const resolvedMaxRepins = maxRepins !== null && maxRepins !== undefined ? Number(maxRepins) : null;

  return await sql`
    SELECT
      ksc.keyword_id,
      ksc.pin_id,
      ksc.title,
      ksc.save_count,
      ksc.repin_count,
      ksc.daily_save_velocity,
      ksc.is_displaced,
      ksc.created_at_pinterest,
      tk.keyword,
      i.added_at AS folder_added_at
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    JOIN keyword_serp_current ksc ON ksc.keyword_id = i.keyword_id
    WHERE i.folder_id = ${fid}
      AND (${validKids.length === 0} OR i.keyword_id = ANY(${validKids}::int[]))
      AND (
        (${targetScope} = 'all') OR
        (${targetScope} = 'displaced' AND ksc.is_displaced = TRUE) OR
        (${targetScope} = 'active' AND ksc.is_displaced = FALSE)
      )
      AND (${resolvedMaxSaves === null} OR COALESCE(ksc.save_count, 0) <= ${resolvedMaxSaves})
      AND (${resolvedMaxRepins === null} OR COALESCE(ksc.repin_count, 0) <= ${resolvedMaxRepins})
      AND (
        ${resolvedMinPinAge === null} OR ${resolvedMinPinAge <= 0} OR
        ksc.created_at_pinterest IS NULL OR
        ksc.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval
      )
      AND (
        ${resolvedMinFolderAge === null} OR
        (i.added_at <= NOW() - (${resolvedMinFolderAge} || ' days')::interval)
      )

    UNION ALL

    SELECT
      kdi.keyword_id,
      kdi.pin_id,
      COALESCE(ump.title, NULL::text) AS title,
      kdi.save_count,
      kdi.repin_count,
      kdi.daily_save_velocity,
      TRUE AS is_displaced,
      ump.created_at_pinterest AS created_at_pinterest,
      tk.keyword,
      i.added_at AS folder_added_at
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    JOIN keyword_displaced_index kdi ON kdi.keyword_id = i.keyword_id
    LEFT JOIN universal_master_pins ump ON ump.pin_id = kdi.pin_id
    WHERE i.folder_id = ${fid}
      AND (${validKids.length === 0} OR i.keyword_id = ANY(${validKids}::int[]))
      AND (${targetScope} IN ('all', 'displaced'))
      AND (${resolvedMaxSaves === null} OR COALESCE(kdi.save_count, 0) <= ${resolvedMaxSaves})
      AND (${resolvedMaxRepins === null} OR COALESCE(kdi.repin_count, 0) <= ${resolvedMaxRepins})
      AND (
        ${resolvedMinPinAge === null} OR ${resolvedMinPinAge <= 0} OR
        ump.created_at_pinterest IS NULL OR
        ump.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval
      )
      AND (
        ${resolvedMinFolderAge === null} OR
        (i.added_at <= NOW() - (${resolvedMinFolderAge} || ' days')::interval)
      )
      AND NOT EXISTS (
        SELECT 1 FROM keyword_serp_current ksc_dup
        WHERE ksc_dup.keyword_id = kdi.keyword_id AND ksc_dup.pin_id = kdi.pin_id
      );
  `;
}

/**
 * Smart Pin Pruning Service (R4)
 * Supports dry-run preview and atomic deletion with keyword_ignored_pins tombstoning and edge cache evictions
 */
export async function pruneFolderPins(sql, folderId, options = {}, { env, ctx } = {}) {
  // [INVARIANT: PRUNE-TOMBSTONE-AND-EVICT]
  // Pruning execution tombstones candidate pins to keyword_ignored_pins
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const {
    dryRun = true,
    dry_run,
    keywordIds = [],
    keyword_ids,
    scope = 'displaced',
    minFolderAgeDays = null,
    min_folder_age_days = null,
    minPinAgeDays = null,
    min_pin_age_days = null,
    maxSaves = null,
    max_saves = null,
    maxRepins = null,
    max_repins = null
  } = options;

  const isDryRun = dry_run !== undefined ? Boolean(dry_run) : Boolean(dryRun);
  const rawKids = (keyword_ids !== undefined ? keyword_ids : keywordIds) || [];
  const validKids = (Array.isArray(rawKids) ? rawKids : String(rawKids).split(',')).map(Number).filter(Boolean);
  const targetScope = String(scope || 'displaced').toLowerCase();
  const resolvedMinFolderAge = min_folder_age_days !== null && min_folder_age_days !== undefined ? Number(min_folder_age_days) : (minFolderAgeDays !== null ? Number(minFolderAgeDays) : null);
  const resolvedMinPinAge = min_pin_age_days !== null && min_pin_age_days !== undefined ? Number(min_pin_age_days) : (minPinAgeDays !== null ? Number(minPinAgeDays) : null);
  const resolvedMaxSaves = max_saves !== null && max_saves !== undefined ? Number(max_saves) : (maxSaves !== null ? Number(maxSaves) : null);
  const resolvedMaxRepins = max_repins !== null && max_repins !== undefined ? Number(max_repins) : (maxRepins !== null ? Number(maxRepins) : null);

  // 1. Identify Candidate Pins from keyword_serp_current and keyword_displaced_index
  const candidates = await getPruningCandidates(sql, fid, {
    keywordIds: validKids,
    scope: targetScope,
    minFolderAgeDays: resolvedMinFolderAge,
    minPinAgeDays: resolvedMinPinAge,
    maxSaves: resolvedMaxSaves,
    maxRepins: resolvedMaxRepins
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
        maxRepins: resolvedMaxRepins
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
      pruned_pins: 0
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
        uniquePairs.push({ kid, pid });
      }
    }
  }

  const pruneKeywordIds = uniquePairs.map(p => p.kid);
  const prunePinIds = uniquePairs.map(p => p.pid);
  const uniqueKeywordIds = [...new Set(pruneKeywordIds)];
  const uniquePinIds = [...new Set(prunePinIds)];

  // A. Batched Tombstone in keyword_ignored_pins to prevent zombie resurrection on future crawls
  if (pruneKeywordIds.length > 0) {
    await sql`
      INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
      SELECT
        target.kid,
        target.pid,
        'folder_smart_pruning',
        NOW()
      FROM (
        SELECT UNNEST(${pruneKeywordIds}::int[]) AS kid, UNNEST(${prunePinIds}::text[]) AS pid
      ) target
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        ignored_reason = EXCLUDED.ignored_reason,
        ignored_at = EXCLUDED.ignored_at;
    `.catch((err) => {
      console.warn(`[pruneFolderPins] Tombstone batch insert warning: ${err.message}`);
    });
  }

  // B. Delete from Central Hub operational tables using atomic paired UNNEST tuple deletion
  // [INVARIANT: ATOMIC-UNNEST-TUPLE-DELETION]
  // Eliminates Cartesian cross-product (K x P) data-loss bug by strictly matching (keyword_id, pin_id) tuples
  if (pruneKeywordIds.length > 0) {
    await sql`
      DELETE FROM keyword_serp_current ksc
      USING (SELECT UNNEST(${pruneKeywordIds}::int[]) AS kid, UNNEST(${prunePinIds}::text[]) AS pid) target
      WHERE ksc.keyword_id = target.kid AND ksc.pin_id = target.pid;
    `;
    await sql`
      DELETE FROM keyword_displaced_index kdi
      USING (SELECT UNNEST(${pruneKeywordIds}::int[]) AS kid, UNNEST(${prunePinIds}::text[]) AS pid) target
      WHERE kdi.keyword_id = target.kid AND kdi.pin_id = target.pid;
    `;
  }

  // C. Pure Unified Architecture: Edge KV and D1 caches eliminated

  // D. Invalidate in-memory crossover cache
  invalidateFolderCache(fid);

  return {
    success: true,
    dry_run: false,
    dryRun: false,
    matched_count: candidates.length,
    candidates_count: candidates.length,
    pruned_count: candidates.length,
    pruned_pins: uniquePinIds.length
  };
}

/**
 * Get folder membership for a keyword (which folders contain this keyword)
 */
export async function getFoldersForKeyword(sql, keywordId) {
  const kid = Number(keywordId);
  if (!kid) return [];

  const rows = await sql`
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

  return rows;
}

/**
 * Detects whether a pin title is empty, generic, or a synthesized "<Keyword> Inspiration" fallback
 */
export function isSyntheticPinTitle(title) {
  if (!title || typeof title !== 'string') return true;
  const t = title.trim();
  if (!t || /^untitled(\s+pin)?$/i.test(t)) return true;
  if (/^pin(\s*#?\s*\w+)?$/i.test(t)) return true;
  if (/(^|\s+)(Inspiration|Idea)$/i.test(t) || t === 'Pinterest Visual Guide' || t === 'Pinterest Pin Idea') return true;
  return false;
}

/**
 * Intelligent Pin Title Fallback Derivation
 * Eradicates "Untitled Pin" and synthetic "<Keyword> Inspiration" titles by extracting clean human-readable
 * titles from SEO titles, destination link slugs (including 10-25 char hyphenated recipe slugs),
 * board names, visual annotations, alt text / descriptions, or keyword context.
 */
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = [], description = '', altText = '', seoTitle = '') {
  const rawTitle = String(title || '').trim();
  const isGeneric = !rawTitle ||
    isSyntheticPinTitle(rawTitle) ||
    rawTitle.toLowerCase() === 'recipe' ||
    rawTitle.toLowerCase() === 'pin';

  if (!isGeneric) {
    return rawTitle;
  }

  // 0. Try explicit SEO title if authentic
  const cleanSeo = String(seoTitle || '').trim();
  if (cleanSeo && !isSyntheticPinTitle(cleanSeo) && cleanSeo.toLowerCase() !== 'recipe') {
    return cleanSeo.slice(0, 140);
  }

  // 1. Try URL slug (preserving hyphenated human-readable slugs of any length while rejecting opaque ID tokens)
  if (destinationUrl) {
    try {
      const u = new URL(destinationUrl);
      const isOpaqueHost = u.hostname.includes('youtube.com') ||
                           u.hostname.includes('instagram.com') ||
                           u.hostname.includes('tiktok.com') ||
                           u.hostname.includes('pinterest.com');
      if (!isOpaqueHost) {
        const pathname = u.pathname.replace(/\/+$/, '');
        const segments = pathname.split('/').filter(Boolean);
        const meaningful = segments.reverse().find(s =>
          s.length > 3 &&
          !/^\d+$/.test(s) &&
          !/^(recipes?|blog|posts?|food|index|html|amp|p)$/i.test(s) &&
          (/[a-zA-Z]{2,}[-_][a-zA-Z]{2,}/.test(s) || !/^[a-zA-Z0-9_-]{10,25}$/.test(s))
        );
        if (meaningful) {
          const cleanSlug = decodeURIComponent(meaningful)
            .replace(/\.(html?|php|aspx?)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanSlug.length >= 3) {
            return cleanSlug
              .split(' ')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
          }
        }
      }
    } catch (_) {}
  }

  // 2. Try Board Name
  if (boardName && boardName.trim().length >= 3 && !/^pins?$/i.test(boardName)) {
    return boardName.trim();
  }

  // 3. Try Visual Annotations (supports string and { name } object formats)
  if (Array.isArray(visualAnnotations) && visualAnnotations.length > 0) {
    const topVaRaw = visualAnnotations
      .map(v => (typeof v === 'object' && v !== null) ? String(v.name || v.tag || v.label || '').trim() : String(v || '').trim())
      .find(v => v.length >= 4 && v !== '[object Object]');
    if (topVaRaw) {
      const formatted = topVaRaw.charAt(0).toUpperCase() + topVaRaw.slice(1);
      return keyword ? `${formatted} - ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}` : formatted;
    }
  }

  // 4. Try Alt Text or Description first sentence (critical for linkless Uploaded-by-user Vacuum pins)
  for (const cand of [altText, description]) {
    const rawCand = String(cand || '').trim();
    if (!rawCand || isSyntheticPinTitle(rawCand)) continue;
    const firstSentence = rawCand.split(/[\n.!?|]/)[0].replace(/\s+/g, ' ').trim();
    if (firstSentence.length >= 5 && !isSyntheticPinTitle(firstSentence)) {
      return firstSentence.length > 95 ? firstSentence.slice(0, 92).trim() + '...' : firstSentence;
    }
  }

  // 5. Fallback to Keyword
  if (keyword) {
    return keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' Inspiration';
  }

  return (!isSyntheticPinTitle(rawTitle) && rawTitle) ? rawTitle : 'Pinterest Visual Guide';
}

/**
 * Robust English Lemmatizer / Stemmer for Pinterest Visual Tags & Search Capsules
 * Robust English Lemmatizer / Stemmer for Pinterest Visual Tags & Search Capsules
 * Unifies singular/plural variants while strictly protecting non-plural suffixes (-ous, -us, -is, -ss, -ness, -ics)
 */
const TAG_LEMMA_CACHE = new Map();
const IRREGULAR_TAG_LEMMAS = {
  'potatoes': 'potato',
  'tomatoes': 'tomato',
  'dishes': 'dish',
  'fries': 'fry',
  'berries': 'berry',
  'strawberries': 'strawberry',
  'blueberries': 'blueberry',
  'raspberries': 'raspberry',
  'cherries': 'cherry',
  'cookies': 'cookie',
  'brownies': 'brownie',
  'smoothies': 'smoothie',
  'bites': 'bite',
  'steaks': 'steak',
  'chickens': 'chicken',
  'noodles': 'noodle',
  'sauces': 'sauce',
  'onions': 'onion',
  'garlics': 'garlic',
  'peppers': 'pepper',
  'mushrooms': 'mushroom',
  'casseroles': 'casserole',
  'dinners': 'dinner',
  'soups': 'soup',
  'salads': 'salad',
  'desserts': 'dessert',
  'recipes': 'recipe',
  'ideas': 'idea',
  'skillets': 'skillet',
  'crockpots': 'crockpot',
  'veggies': 'veggie',
  'vegetables': 'vegetable',
  'carrots': 'carrot',
  'beans': 'bean',
  'cheeses': 'cheese',
  'pastas': 'pasta',
  'breads': 'bread',
  'rolls': 'roll',
  'pies': 'pie',
  'cakes': 'cake',
  'muffins': 'muffin',
  'ribs': 'rib',
  'wings': 'wing',
  'burgers': 'burger',
  'sandwiches': 'sandwich',
  'tacos': 'taco',
  'bowls': 'bowl',
  'pizzas': 'pizza',
  'spices': 'spice',
  'herbs': 'herb',
  'dips': 'dip',
  'leaves': 'leaf',
  'halves': 'half',
  'loaves': 'loaf',
  'knives': 'knife'
};

export function normalizeTagLemma(tag) {
  if (!tag) return '';
  const rawKey = String(tag);
  const cached = TAG_LEMMA_CACHE.get(rawKey);
  if (cached !== undefined) return cached;

  let t = rawKey.trim().toLowerCase();
  if (!t || t.length < 3) {
    if (TAG_LEMMA_CACHE.size < 30000) TAG_LEMMA_CACHE.set(rawKey, '');
    return '';
  }
  // Unicode NFKD normalization decomposes combined characters (e.g. é -> e + ́), then strip combining marks
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Retain Unicode letters, numbers, and spaces while stripping punctuation/symbols
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 3) {
    if (TAG_LEMMA_CACHE.size < 30000) TAG_LEMMA_CACHE.set(rawKey, '');
    return '';
  }

  let result = t;
  if (IRREGULAR_TAG_LEMMAS[t]) {
    result = IRREGULAR_TAG_LEMMAS[t];
  } else if (/(ous|us|is|ss|ness|ics)$/.test(t)) {
    // Protected non-plural suffixes: do NOT strip 's' (e.g. delicious, hummus, citrus, grass)
    result = t;
  } else if (t.endsWith('ies') && t.length > 5) {
    result = t.slice(0, -3) + 'y';
  } else if (t.endsWith('ves') && t.length > 4) {
    result = t.slice(0, -3) + 'f';
  } else if (t.endsWith('es') && t.length > 4 && /(s|ch|sh|x|z)es$/.test(t)) {
    result = t.slice(0, -2);
  } else if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) {
    result = t.slice(0, -1);
  }

  if (TAG_LEMMA_CACHE.size < 30000) {
    TAG_LEMMA_CACHE.set(rawKey, result);
  }
  return result;
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
 * Strips internal, placeholder, and non-external domains (e.g. 'uploaded by user', 'pinterest.com')
 */
const INVALID_DOMAINS = new Set([
  'uploaded by user', 'uploaded by pinner', 'pinterest.com', 'i.pinimg.com', 
  'pinimg.com', 'pinterest', 'null', 'undefined', 'unknown', 'none', '', 'localhost', 'direct'
]);

export function cleanExternalDomain(domainStr) {
  if (!domainStr || typeof domainStr !== 'string') return '';
  let d = domainStr.trim().toLowerCase();
  
  try {
    if (d.startsWith('http://') || d.startsWith('https://')) {
      d = new URL(d).hostname.toLowerCase();
    }
  } catch (_) {}

  d = d.replace(/^www\./, '').replace(/\/.*$/, '').trim();

  if (INVALID_DOMAINS.has(d)) return '';
  if (d.includes('pinterest.') || d.includes('pinimg.') || d.includes('uploaded by')) return '';
  
  // Must be a valid domain: must contain a dot, no spaces, valid FQDN
  if (!d.includes('.') || /\s/.test(d) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
    return '';
  }

  return d;
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

function toTitleCase(str) {
  return String(str || '')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * High-Converting Pinterest Spoke Angle Synthesizer
 * Formulates natural, click-worthy titles from modifier pivots and target keywords.
 */
function synthesizeSpokeTitle(modifier, targetKw) {
  const kw = toTitleCase(targetKw);
  const modLower = String(modifier || '').toLowerCase().trim();

  if (modLower.includes('oven')) {
    return `Crispy Oven-Baked ${kw} (Foolproof Step-by-Step)`;
  }
  if (modLower.includes('twice')) {
    const cleanKw = kw.replace(/^baked\s+/i, '');
    return `Twice-Baked ${cleanKw} with Melted Cheese & Herbs`;
  }
  if (modLower.includes('crock') || modLower.includes('slow cooker')) {
    return `Slow Cooker ${kw}: Dump & Go Weeknight Comfort`;
  }
  if (modLower.includes('soup')) {
    return `Cozy Creamy ${kw} Soup: 30-Minute Dinner`;
  }
  if (modLower.includes('pasta')) {
    return `Creamy Garlic ${kw} with Al Dente Pasta`;
  }
  if (modLower.includes('bite')) {
    return `Tender Pan-Seared ${kw} Bites: Juicy & Quick`;
  }
  if (modLower.includes('bar')) {
    return `The Ultimate ${kw} Bar: Build-Your-Own Party Board`;
  }
  if (modLower.includes('air fryer')) {
    return `Ultra-Crispy Air Fryer ${kw} in 15 Minutes`;
  }
  if (modLower.includes('recipe')) {
    return `The Best ${kw} Recipe (Better Than Restaurant Quality)`;
  }
  if (modLower.includes('loaded')) {
    return `Loaded ${kw} with Crispy Bacon & Green Onions`;
  }
  if (modLower.includes('orzo')) {
    return `One-Pot Creamy ${kw} Orzo Skillet`;
  }
  if (modLower.includes('instant') || modLower.includes('pot')) {
    return `Instant Pot ${kw}: Fall-Apart Tender in Minutes`;
  }

  const cleanMod = toTitleCase(modifier);
  return `${cleanMod} ${kw}: Quick & Easy Step-by-Step`;
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
export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const now = Date.now();
  let effectiveRefresh = Boolean(refresh);

  // [INVARIANT: FOLDER-FORCE-REFRESH-COOLDOWN]
  // 15-second per-folder in-memory cooldown on forced ?refresh=true requests
  // Rapid repeated requests within 15 seconds serve the freshly computed cache instead of launching parallel 20-shard DoS storms.
  if (effectiveRefresh) {
    const lastRefresh = folderForceRefreshCooldown.get(fid);
    if (lastRefresh && (now - lastRefresh < FOLDER_FORCE_REFRESH_COOLDOWN_MS)) {
      effectiveRefresh = false;
    }
  }

  if (!effectiveRefresh) {
    // [INVARIANT: FOLDER-CROSSOVER-SCHEMA-VERSION] :crossover:v5
    const cached = crossoverCache.get(fid);
    const ttl = cached?.ttlMs || CROSSOVER_TTL_MS;
    if (cached && (now - cached.timestamp < ttl) && cached.data?._crossover_schema_v === 6) {
      return cached.data;
    }

  }

  const flightKey = `${fid}:${effectiveRefresh ? 'refresh' : 'standard'}`;
  if (inflightCrossover.has(flightKey)) {
    return await inflightCrossover.get(flightKey);
  }

  if (effectiveRefresh) {
    if (folderForceRefreshCooldown.size >= 200) {
      const oldest = folderForceRefreshCooldown.keys().next().value;
      if (oldest) folderForceRefreshCooldown.delete(oldest);
    }
    folderForceRefreshCooldown.set(fid, now);
  }

  const computePromise = (async () => {
    try {
      const result = await _executeFolderCrossover(sql, fid, { env, ctx, refresh: effectiveRefresh });
      if (crossoverCache.size >= CROSSOVER_CACHE_MAX) {
        const oldest = crossoverCache.keys().next().value;
        if (oldest) crossoverCache.delete(oldest);
      }
      const hasUnhydrated = Boolean(result?._has_unhydrated_priority_pins);
      const memTtlMs = hasUnhydrated ? (15 * 1000) : CROSSOVER_TTL_MS;
      const kvTtlSec = hasUnhydrated ? 60 : 86400;

      crossoverCache.set(fid, { timestamp: Date.now(), data: result, ttlMs: memTtlMs });

      return result;
    } catch (err) {
      if (effectiveRefresh) {
        folderForceRefreshCooldown.delete(fid);
      }
      throw err;
    } finally {
      inflightCrossover.delete(flightKey);
    }
  })();

  inflightCrossover.set(flightKey, computePromise);
  return await computePromise;
}

async function _executeFolderCrossover(sql, fid, { env = null, ctx = null, refresh = false } = {}) {
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

  // 2. Query Live Active Catalog from keyword_serp_current for all folder keywords (Migration 019)
  // [INVARIANT: TARGETED-JSONB-PROJECTION]
  // Select targeted JSONB fields ((c.metadata->>'aspect_ratio'), (c.metadata->>'format')) instead of fetching
  // the entire raw c.metadata JSONB blob, reducing network transfer by ~15MB-20MB across thousands of pins.
  const pulseAnalyticsPromise = getFolderPulseCrossoverAnalytics(sql, fid, { env, ctx, refresh: Boolean(refresh) }).catch(() => null);
  let [pinRows, displacedRows, capsuleRows] = await Promise.all([
    sql`
      WITH ranked_active AS (
        SELECT
          c.keyword_id,
          c.pin_id,
          c.rank_position,
          c.title,
          c.domain,
          c.destination_url,
          c.image_url,
          c.creator_username,
          c.board_name,
          c.dominant_color,
          c.visual_annotations,
          c.creation_method,
          c.save_count,
          c.repin_count,
          c.comment_count,
          c.daily_save_velocity,
          c.delta_repins_24h,
          c.gains_5d,
          c.gains_7d,
          c.gains_10d,
          c.gains_15d,
          c.created_at_pinterest,
          c.crawled_at,
          c.baseline_day_saves,
          c.updated_at AS snapshot_date,
          (c.metadata->>'aspect_ratio') AS aspect_ratio,
          (c.metadata->>'format') AS format,
          (c.metadata->>'seo_title') AS seo_title,
          tk.keyword AS keyword_text,
          i.added_at AS folder_added_at,
          ROW_NUMBER() OVER (PARTITION BY c.pin_id ORDER BY c.save_count DESC NULLS LAST, c.daily_save_velocity DESC NULLS LAST) AS pin_rn
        FROM keyword_folder_items i
        JOIN tracked_keywords tk ON tk.id = i.keyword_id
        JOIN keyword_serp_current c ON c.keyword_id = i.keyword_id
        WHERE i.folder_id = ${fid}
          AND c.is_displaced IS FALSE
          AND c.rank_position IS NOT NULL
          AND c.rank_position >= 1
      )
      SELECT
        ra.keyword_id,
        ra.pin_id,
        ra.rank_position,
        CASE WHEN ra.pin_rn = 1 THEN COALESCE(NULLIF(ra.title, ''), ump.title, '') ELSE NULL END AS title,
        COALESCE(NULLIF(ra.domain, ''), ump.domain, '') AS domain,
        CASE WHEN ra.pin_rn = 1 THEN COALESCE(NULLIF(ra.destination_url, ''), ump.destination_url, '') ELSE NULL END AS destination_url,
        CASE WHEN ra.pin_rn = 1 THEN COALESCE(NULLIF(ra.image_url, ''), ump.image_url, '') ELSE NULL END AS image_url,
        COALESCE(NULLIF(ra.creator_username, ''), ump.creator_username, '') AS creator_username,
        CASE WHEN ra.pin_rn = 1 THEN COALESCE(NULLIF(ra.board_name, ''), ump.board_name, '') ELSE NULL END AS board_name,
        COALESCE(NULLIF(NULLIF(ra.dominant_color, ''), '#888888'), NULLIF(ump.dominant_color, '#888888'), NULLIF(ra.dominant_color, ''), ump.dominant_color) AS dominant_color,
        CASE
          WHEN ra.pin_rn = 1 THEN
            CASE
              WHEN ra.visual_annotations IS NOT NULL AND jsonb_typeof(ra.visual_annotations) = 'array' AND jsonb_array_length(ra.visual_annotations) > 0 THEN ra.visual_annotations
              ELSE ump.visual_annotations
            END
          ELSE NULL
        END AS visual_annotations,
        ra.creation_method,
        COALESCE(NULLIF(ra.save_count, 0), ump.save_count, 0) AS save_count,
        COALESCE(NULLIF(ra.repin_count, 0), ump.repin_count, 0) AS repin_count,
        GREATEST(COALESCE(ra.comment_count, 0), COALESCE(ump.comment_count, 0)) AS comment_count,
        COALESCE(ra.daily_save_velocity, ump.daily_save_velocity, 0) AS daily_save_velocity,
        COALESCE(ra.delta_repins_24h, ump.delta_repins_24h, 0) AS delta_repins_24h,
        ra.gains_5d,
        ra.gains_7d,
        ra.gains_10d,
        ra.gains_15d,
        COALESCE(ra.created_at_pinterest, ump.created_at_pinterest) AS created_at_pinterest,
        ra.crawled_at,
        ra.baseline_day_saves,
        ra.snapshot_date,
        COALESCE(NULLIF(ra.aspect_ratio, ''), (ump.metadata->>'aspect_ratio')) AS aspect_ratio,
        ra.format,
        CASE WHEN ra.pin_rn = 1 THEN COALESCE(NULLIF(ra.seo_title, ''), (ump.metadata->>'seo_title')) ELSE NULL END AS seo_title,
        ra.keyword_text,
        ra.folder_added_at
      FROM ranked_active ra
      LEFT JOIN universal_master_pins ump ON ump.pin_id = ra.pin_id
      ORDER BY ra.pin_rn ASC, ra.save_count DESC, ra.daily_save_velocity DESC;
    `,
    sql`
      WITH active_pin_ids AS (
        SELECT DISTINCT c.pin_id
        FROM keyword_folder_items i
        JOIN keyword_serp_current c ON c.keyword_id = i.keyword_id
        WHERE i.folder_id = ${fid}
          AND c.is_displaced IS FALSE
          AND c.rank_position IS NOT NULL
          AND c.rank_position >= 1
      ),
      folder_kdi AS (
        SELECT
          kdi.keyword_id,
          kdi.pin_id,
          kdi.last_known_rank AS rank_position,
          COALESCE(kdi.domain, '') AS domain,
          COALESCE(kdi.creator_username, '') AS creator_username,
          COALESCE(kdi.save_count, 0) AS save_count,
          COALESCE(kdi.repin_count, 0) AS repin_count,
          COALESCE(kdi.comment_count, 0) AS comment_count,
          COALESCE(kdi.daily_save_velocity, 0) AS daily_save_velocity,
          COALESCE(kdi.delta_repins_24h, 0) AS delta_repins_24h,
          kdi.gains_5d,
          kdi.gains_7d,
          kdi.gains_10d,
          kdi.gains_15d,
          kdi.updated_at AS snapshot_date,
          tk.keyword AS keyword_text,
          i.added_at AS folder_added_at,
          TRUE AS is_displaced,
          (kdi.pin_id IN (SELECT pin_id FROM active_pin_ids)) AS in_active_serp,
          ROW_NUMBER() OVER (
            PARTITION BY kdi.pin_id
            ORDER BY (kdi.pin_id IN (SELECT pin_id FROM active_pin_ids)) DESC, kdi.daily_save_velocity DESC NULLS LAST, kdi.save_count DESC NULLS LAST
          ) AS pin_rn
        FROM keyword_folder_items i
        JOIN tracked_keywords tk ON tk.id = i.keyword_id
        JOIN keyword_displaced_index kdi ON kdi.keyword_id = i.keyword_id
        WHERE i.folder_id = ${fid}
          AND kdi.last_known_rank IS NOT NULL
          AND kdi.last_known_rank >= 1
      )
      SELECT
        keyword_id,
        pin_id,
        rank_position,
        domain,
        creator_username,
        save_count,
        repin_count,
        comment_count,
        daily_save_velocity,
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
    `
  ]);

  if (!pinRows) pinRows = [];
  if (!displacedRows) displacedRows = [];
  if (!capsuleRows) capsuleRows = [];

  const combinedCatalogRows = [...pinRows, ...displacedRows];

  // =========================================================================
  // DIMENSION A: MULTI-RANKING SUPER-PINS OVERLAP
  // =========================================================================
  const pinMap = new Map(); // pin_id -> { pin data, keywords: [] }
  const safeNum = (v, fallback = 0) => {
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const nowMs = Date.now();
  const folderCreatedMs = folder.created_at ? new Date(folder.created_at).getTime() : null;

  for (const row of combinedCatalogRows) {
    const pid = String(row.pin_id).trim();
    if (!pid) continue;

    const rankNum = Number(row.rank_position);
    if (!Number.isFinite(rankNum) || rankNum < 1) {
      continue;
    }

    const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
    const rowVisualAnnotations = Array.isArray(row.visual_annotations) && row.visual_annotations.length > 0
      ? row.visual_annotations
      : (Array.isArray(meta.visual_annotations) ? meta.visual_annotations : []);

    const pinCreatedMs = row.created_at_pinterest ? new Date(row.created_at_pinterest).getTime() : null;
    const pinAgeDays = (pinCreatedMs && !isNaN(pinCreatedMs))
      ? Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000))
      : null;

    const folderAddedMs = row.folder_added_at ? new Date(row.folder_added_at).getTime() : folderCreatedMs;
    const folderAgeDays = (folderAddedMs && !isNaN(folderAddedMs))
      ? Math.max(0, Math.floor((nowMs - folderAddedMs) / 86400000))
      : 0;

    let vel = safeNum(row.daily_save_velocity);
    const rowSaves = safeNum(row.save_count ?? meta.raw_saves ?? 0);
    const rowRepins = safeNum(row.repin_count);

    const rowGains5d = safeNum(row.gains_5d, null);
    const rowGains7d = safeNum(row.gains_7d, null);
    const rowGains10d = safeNum(row.gains_10d, null);
    const rowGains15d = safeNum(row.gains_15d, null);
    const rowGains24h = (row.gains_24h != null && Number.isFinite(Number(row.gains_24h))) ? Number(row.gains_24h) : null;

    let delta24h = (rowGains24h != null) ? rowGains24h : vel;
    const effectiveVel = vel;

    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const candidateRawTitle = String(row.title || meta.title || '').trim();
      const authenticTitle = !isSyntheticPinTitle(candidateRawTitle) ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: authenticTitle,
        title: authenticTitle,
        seo_title: row.seo_title || meta.seo_title || '',
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: rowSaves,
        is_vacuum_pin: Boolean(row.image_url || meta.image_url) && (!row.domain || row.domain === 'Uploaded by user') && rowSaves >= 100,
        board_name: row.board_name || meta.board_name || '',
        visual_annotations: rowVisualAnnotations,
        dominant_color: row.dominant_color || meta.dominant_color || null,
        created_at_pinterest: row.created_at_pinterest || meta.created_at_pinterest || null,
        alt_text: row.alt_text || meta.alt_text || '',
        description: row.description || meta.description || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || '2:3',
        creation_method: row.creation_method || meta.creation_method || null,
        repin_count: rowRepins,
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        effective_velocity: effectiveVel,
        velocity_source: vel > 0 ? 'saves' : (safeNum(row.delta_repins_24h, 0) > 0 ? 'repins' : 'saves'),
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
        crawled_at: row.crawled_at,
        pin_age_days: pinAgeDays,
        folder_age_days: folderAgeDays,
        delta_saves_24h: delta24h,
        delta_repins_24h: safeNum(row.delta_repins_24h, 0),
        gains_5d: safeNum(row.gains_5d, Math.round(vel * 5)),
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Authentic Multi-Window Gains
        gains_7d: safeNum(row.gains_7d, Math.round(vel * 7)),
        gains_10d: safeNum(row.gains_10d, Math.round(vel * 10)),
        gains_15d: safeNum(row.gains_15d, Math.round(vel * 15)),
        rankings: []
      });
    } else {
      const existingPin = pinMap.get(pid);
      const incomingTitle = String(row.title || meta.title || '').trim();
      if (!existingPin.raw_title && !isSyntheticPinTitle(incomingTitle)) {
        existingPin.raw_title = incomingTitle;
        existingPin.title = incomingTitle;
      }
      if (!existingPin.seo_title && (row.seo_title || meta.seo_title)) {
        existingPin.seo_title = row.seo_title || meta.seo_title;
      }
      if (!existingPin.image_url && (row.image_url || meta.image_url)) {
        existingPin.image_url = row.image_url || meta.image_url;
      }
      if (!existingPin.destination_url && (row.destination_url || meta.destination_url)) {
        existingPin.destination_url = row.destination_url || meta.destination_url;
      }
      if (!existingPin.board_name && (row.board_name || meta.board_name)) {
        existingPin.board_name = row.board_name || meta.board_name;
      }
      if (!existingPin.alt_text && (row.alt_text || meta.alt_text)) {
        existingPin.alt_text = row.alt_text || meta.alt_text;
      }
      if (!existingPin.description && (row.description || meta.description)) {
        existingPin.description = row.description || meta.description;
      }
      const incomingColor = row.dominant_color || meta.dominant_color || null;
      if (incomingColor && (!existingPin.dominant_color || existingPin.dominant_color === '#888888' || existingPin.dominant_color === '#000000' || existingPin.dominant_color === '#1e1e24')) {
        existingPin.dominant_color = incomingColor;
      }
      if (!row.is_displaced && rowSaves > 0) existingPin.save_count = rowSaves;
      else if (!existingPin.save_count && rowSaves > 0) existingPin.save_count = rowSaves;
      if (!row.is_displaced && rowRepins > 0) existingPin.repin_count = rowRepins;
      else if (!existingPin.repin_count && rowRepins > 0) existingPin.repin_count = rowRepins;
      existingPin.comment_count = Math.max(existingPin.comment_count, safeNum(row.comment_count));

      // Symmetrical velocity update: fresher crawl updates velocity downward or upward cleanly
      const existingCrawlMs = existingPin.crawled_at ? new Date(existingPin.crawled_at).getTime() : 0;
      const rowCrawlMs = row.crawled_at ? new Date(row.crawled_at).getTime() : 0;
      if (rowCrawlMs > existingCrawlMs && row.crawled_at) {
        existingPin.crawled_at = row.crawled_at;
        existingPin.daily_save_velocity = vel;
        existingPin.delta_saves_24h = delta24h;
        existingPin.delta_repins_24h = safeNum(row.delta_repins_24h, 0);
        existingPin.effective_velocity = effectiveVel;
        existingPin.velocity_source = vel > 0 ? 'saves' : (safeNum(row.delta_repins_24h, 0) > 0 ? 'repins' : 'saves');
      } else if (existingCrawlMs === 0 || rowCrawlMs === existingCrawlMs) {
        if (existingPin.daily_save_velocity == null || existingPin.daily_save_velocity === 0) {
          existingPin.daily_save_velocity = vel;
          existingPin.delta_saves_24h = delta24h;
        } else if (vel > 0 && vel !== existingPin.daily_save_velocity) {
          existingPin.daily_save_velocity = vel;
          existingPin.delta_saves_24h = delta24h;
        }
        existingPin.delta_repins_24h = Math.max(existingPin.delta_repins_24h || 0, safeNum(row.delta_repins_24h, 0));
        existingPin.effective_velocity = existingPin.daily_save_velocity || 0;
        existingPin.velocity_source = 'saves';
      }

      // Preserve authentic database rolling gains without blowing up by multiplying corrupted velocity
      if (rowGains5d != null && (existingPin.gains_5d == null || rowGains5d > existingPin.gains_5d)) existingPin.gains_5d = rowGains5d;
      // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Authentic Multi-Window Gains
      if (rowGains7d != null && (existingPin.gains_7d == null || rowGains7d > existingPin.gains_7d)) existingPin.gains_7d = rowGains7d;
      if (rowGains10d != null && (existingPin.gains_10d == null || rowGains10d > existingPin.gains_10d)) existingPin.gains_10d = rowGains10d;
      if (rowGains15d != null && (existingPin.gains_15d == null || rowGains15d > existingPin.gains_15d)) existingPin.gains_15d = rowGains15d;

      if (!existingPin.created_at_pinterest && row.created_at_pinterest) {
        existingPin.created_at_pinterest = row.created_at_pinterest;
        existingPin.pin_age_days = pinAgeDays;
      }
      if (folderAgeDays > 0 && (existingPin.folder_age_days === 0 || folderAgeDays > existingPin.folder_age_days)) {
        existingPin.folder_age_days = folderAgeDays;
      }
      if (!existingPin.creator_username && row.creator_username) {
        existingPin.creator_username = row.creator_username;
      }
      if (rowVisualAnnotations.length > existingPin.visual_annotations.length) {
        existingPin.visual_annotations = rowVisualAnnotations;
      }
    }

    const pinRecord = pinMap.get(pid);
    pinRecord.rankings.push({
      keyword_id: row.keyword_id,
      keyword: row.keyword_text,
      rank_position: rankNum,
      is_displaced: Boolean(row.is_displaced)
    });
  }

  let allPins = Array.from(pinMap.values());
  let vacuumPinsCount = 0;
  for (const p of allPins) {
    p.has_active_rank = p.rankings.some(r => !r.is_displaced);
    p.has_vault_rank = p.rankings.some(r => r.is_displaced);
    p.overlap_count = p.rankings.length;
    p.overlap_percentage = Math.round((p.overlap_count / totalKeywords) * 100);
    p.is_super_pin = p.overlap_count >= 2 && p.rankings.every(r => Number.isFinite(r.rank_position) && r.rank_position >= 1);
    p.min_rank = p.rankings.length > 0 ? Math.min(...p.rankings.map(r => r.rank_position)) : 1;
    p.avg_rank = p.rankings.length > 0 ? Number((p.rankings.reduce((sum, r) => sum + r.rank_position, 0) / p.rankings.length).toFixed(1)) : 1;
    // Sort rankings by rank position ASC
    p.rankings.sort((a, b) => a.rank_position - b.rank_position);

    // [INVARIANT: VACUUM-PIN-CALCULATION]
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = Boolean(p.image_url) && (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // =========================================================================
  // 4-TIER DISTRIBUTED CREATIVE METADATA HYDRATION (D1 -> Hub -> 20 Shards -> D1 Write-Back)
  // // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE]
  // // [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING]
  // // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
  // =========================================================================
  const missingMetaPins = allPins.filter(
    p => !p.raw_title || isSyntheticPinTitle(p.title) || !p.image_url || !p.created_at_pinterest
  );
  let hasUnhydratedPriorityPins = false;

  if (missingMetaPins.length > 0) {
    const missingPinIds = missingMetaPins.map(p => p.pin_id);
    const enrichedMap = new Map();

    const mergeEnrichedRow = (r) => {
      if (!r || !r.pin_id) return;
      const pid = String(r.pin_id);
      const existing = enrichedMap.get(pid) || {};
      const cleanIncomingTitle = (r.title && !isSyntheticPinTitle(r.title)) ? String(r.title).trim() : '';
      const cleanExistingTitle = (existing.title && !isSyntheticPinTitle(existing.title)) ? existing.title : '';

      let parsedAnnotations = Array.isArray(existing.visual_annotations) && existing.visual_annotations.length > 0
        ? existing.visual_annotations
        : [];
      if (parsedAnnotations.length === 0 && r.visual_annotations) {
        if (Array.isArray(r.visual_annotations)) {
          parsedAnnotations = r.visual_annotations;
        } else if (typeof r.visual_annotations === 'string' && r.visual_annotations.trim()) {
          try { parsedAnnotations = JSON.parse(r.visual_annotations); } catch (_) {}
        }
      }

      enrichedMap.set(pid, {
        pin_id: pid,
        title: cleanExistingTitle || cleanIncomingTitle || '',
        seo_title: existing.seo_title || r.seo_title || '',
        image_url: existing.image_url || r.image_url || '',
        destination_url: existing.destination_url || r.destination_url || '',
        domain: existing.domain || r.domain || '',
        creator_username: existing.creator_username || r.creator_username || '',
        board_name: existing.board_name || r.board_name || '',
        dominant_color: existing.dominant_color || r.dominant_color || '#888888',
        visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
        alt_text: existing.alt_text || r.alt_text || '',
        description: existing.description || r.description || '',
        created_at_pinterest: existing.created_at_pinterest || r.created_at_pinterest || null,
        aspect_ratio: existing.aspect_ratio || r.aspect_ratio || null,
        creation_method: existing.creation_method || r.creation_method || null,
        save_count: Number(r.save_count || existing.save_count || 0),
        repin_count: Number(r.repin_count || existing.repin_count || 0),
        comment_count: Math.max(Number(existing.comment_count || 0), Number(r.comment_count || 0)),
        daily_save_velocity: Number(r.daily_save_velocity ?? existing.daily_save_velocity ?? 0),
        delta_repins_24h: Number(r.delta_repins_24h ?? existing.delta_repins_24h ?? 0)
      });
    };

    // Central Hub Fallback: 100% Pure Unified PostgreSQL (universal_master_pins, keyword_serp_current, competitor_pins, pa_pins)
    const stillMissingFromHub = missingMetaPins.filter(p => {
      const e = enrichedMap.get(p.pin_id);
      const hasTitle = Boolean(p.raw_title || (e && e.title && !isSyntheticPinTitle(e.title)));
      const hasImg = Boolean(p.image_url || (e && e.image_url));
      return !hasTitle || !hasImg;
    });

    if (sql && stillMissingFromHub.length > 0) {
      const hubLookupIds = stillMissingFromHub.map(p => p.pin_id);
      try {
        const hubMeta = await sql`
          SELECT ump.pin_id, ump.title, ump.domain, ump.destination_url, ump.image_url,
                 ump.creator_username, ump.board_name, ump.dominant_color, ump.visual_annotations,
                 ump.alt_text,
                 ump.description,
                 (ump.metadata->>'seo_title') AS seo_title,
                 ump.created_at_pinterest,
                 (ump.metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(ump.metadata->>'creation_method', ''), NULLIF(ump.metadata->>'method', '')) AS creation_method,
                 ump.save_count,
                 ump.repin_count,
                 ump.comment_count,
                 ump.daily_save_velocity,
                 ump.delta_repins_24h
          FROM universal_master_pins ump
          WHERE ump.pin_id = ANY(${hubLookupIds}::text[])
            AND (ump.title <> '' OR ump.image_url <> '');
        `.catch(() => []);

        for (const row of (hubMeta || [])) {
          mergeEnrichedRow(row);
        }
      } catch (_) {}
    }

    // Tier 3: Distributed 20-Physical-Shard Hydration (universal_master_pins)
    // Strictly prioritize pins missing image_url (Vault pins) FIRST, then Super-Pins & high-velocity pins,
    // so active pins with synthetic titles never starve displaced Vault Super-Pins out of the 350 sync budget!
    const stillMissingAfterHub = missingMetaPins
      .filter(p => {
        const e = enrichedMap.get(p.pin_id);
        const hasTitle = Boolean(p.raw_title || (e && e.title && !isSyntheticPinTitle(e.title)));
        const hasImg = Boolean(p.image_url || (e && e.image_url));
        return !hasTitle || !hasImg;
      })
      .sort((a, b) => {
        const aMissingImg = !(a.image_url || enrichedMap.get(a.pin_id)?.image_url);
        const bMissingImg = !(b.image_url || enrichedMap.get(b.pin_id)?.image_url);
        if (aMissingImg !== bMissingImg) return bMissingImg ? 1 : -1;
        if (Boolean(b.is_super_pin) !== Boolean(a.is_super_pin)) return b.is_super_pin ? 1 : -1;
        if ((b.daily_save_velocity || 0) !== (a.daily_save_velocity || 0)) return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
        if ((b.overlap_count || 0) !== (a.overlap_count || 0)) return (b.overlap_count || 0) - (a.overlap_count || 0);
        return (b.save_count || 0) - (a.save_count || 0);
      });

    // [INVARIANT: PURE-UNIFIED-POSTGRES] In unified_postgres, universal_master_pins is queried directly on Central Hub (hubSql).
    // Dead 20-shard scatter-gather loop (resolveShardConnection({ hubSql: sql, shardId, env }), coalesceShardGroupsByPhysical) removed.

    // Apply hydrated creative metadata back to allPins BEFORE Dimension B (Tag Bridges) & Dimension D
    for (const p of missingMetaPins) {
      const meta = enrichedMap.get(String(p.pin_id));
      if (meta) {
        if ((!p.raw_title || isSyntheticPinTitle(p.title)) && meta.title && !isSyntheticPinTitle(meta.title)) {
          p.raw_title = String(meta.title).trim();
          p.title = p.raw_title;
        }
        if (!p.seo_title && meta.seo_title) p.seo_title = meta.seo_title;
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
        if (!p.domain && meta.domain) p.domain = meta.domain;
        if (!p.creator_username && meta.creator_username) {
          p.creator_username = meta.creator_username;
          if (!p.creator_name) p.creator_name = meta.creator_username;
        }
        if (!p.board_name && meta.board_name) p.board_name = meta.board_name;
        if ((!p.dominant_color || p.dominant_color === '#1e1e24' || p.dominant_color === '#888888' || p.dominant_color === '#000000') && meta.dominant_color && meta.dominant_color !== '#888888') {
          p.dominant_color = meta.dominant_color;
        }
        if ((!p.visual_annotations || p.visual_annotations.length === 0) && Array.isArray(meta.visual_annotations) && meta.visual_annotations.length > 0) {
          p.visual_annotations = meta.visual_annotations;
        }
        if (!p.alt_text && meta.alt_text) p.alt_text = meta.alt_text;
        if (!p.description && meta.description) p.description = meta.description;
        if (!p.created_at_pinterest && meta.created_at_pinterest) {
          p.created_at_pinterest = meta.created_at_pinterest;
          const pinCreatedMs = new Date(meta.created_at_pinterest).getTime();
          if (!isNaN(pinCreatedMs)) {
            p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
          }
        }
        if ((!p.aspect_ratio || p.aspect_ratio === '2:3') && meta.aspect_ratio) {
          p.aspect_ratio = meta.aspect_ratio;
        }
        if ((!p.format || p.format === 'ORGANIC PIN') && meta.creation_method) {
          p.format = String(meta.creation_method).toUpperCase();
        }
        if (!p.save_count && meta.save_count) p.save_count = Number(meta.save_count);
        if (!p.repin_count && meta.repin_count) p.repin_count = Number(meta.repin_count);
        if (meta.comment_count) p.comment_count = Math.max(p.comment_count || 0, Number(meta.comment_count));
        if (meta.daily_save_velocity !== undefined && meta.daily_save_velocity !== null) {
          p.daily_save_velocity = Number(meta.daily_save_velocity);
          p.delta_saves_24h = Number(meta.daily_save_velocity);
        }
        if (meta.delta_repins_24h !== undefined && meta.delta_repins_24h !== null) {
          p.delta_repins_24h = Number(meta.delta_repins_24h);
        }
        p.effective_velocity = p.daily_save_velocity || 0;
        p.velocity_source = 'saves';
      }
    }
  }

  // Final Pass: Synthesize fallback title via derivePinTitle across ALL pins ONLY if authentic title is STILL missing,
  // and recompute vacuumPinsCount + pin_age_days cleanly.
  const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
  vacuumPinsCount = 0;
  for (const p of allPins) {
    if (p.pin_age_days == null && p.created_at_pinterest) {
      const pinCreatedMs = new Date(p.created_at_pinterest).getTime();
      if (!isNaN(pinCreatedMs)) {
        p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
      }
    }
    if (!p.aspect_ratio) p.aspect_ratio = '2:3';
    if (!p.title || isSyntheticPinTitle(p.title)) {
      const pinKw = p.rankings[0]?.keyword || primaryKeyword;
      p.title = derivePinTitle(
        p.raw_title || '',
        p.destination_url || p.domain || '',
        pinKw,
        p.board_name || '',
        p.visual_annotations || [],
        p.description || '',
        p.alt_text || '',
        p.seo_title || ''
      );
    }
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = Boolean(p.image_url) && (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // Deduplicate allPins by canonical creative signature before deriving Super Pins
  // [INVARIANT: FOLDER-CROSSOVER-CREATIVE-DEDUPLICATION]
  const creativePinMap = new Map();
  for (const p of allPins) {
    const cKey = `pid:${p.pin_id}`;

    if (!creativePinMap.has(cKey)) {
      creativePinMap.set(cKey, p);
    } else {
      const existing = creativePinMap.get(cKey);
      const existingHasActive = existing.rankings?.some(r => !r.is_displaced && r.rank_position && r.rank_position <= 100);
      const incomingHasActive = p.rankings?.some(r => !r.is_displaced && r.rank_position && r.rank_position <= 100);

      let primary = existing;
      let secondary = p;

      if (!existingHasActive && incomingHasActive) {
        primary = p;
        secondary = existing;
        creativePinMap.set(cKey, primary);
      } else if (existingHasActive === incomingHasActive) {
        const pVel = p.daily_save_velocity || 0;
        const eVel = existing.daily_save_velocity || 0;
        if (pVel > eVel || (pVel === eVel && (p.save_count || 0) > (existing.save_count || 0))) {
          primary = p;
          secondary = existing;
          creativePinMap.set(cKey, primary);
        }
      }

      // Merge rankings arrays across distinct keyword_ids
      const seenKws = new Set(primary.rankings.map(r => r.keyword_id));
      for (const r of (secondary.rankings || [])) {
        if (!seenKws.has(r.keyword_id)) {
          seenKws.add(r.keyword_id);
          primary.rankings.push(r);
        } else {
          const existingR = primary.rankings.find(er => er.keyword_id === r.keyword_id);
          if (existingR && r.rank_position && (!existingR.rank_position || r.rank_position < existingR.rank_position)) {
            existingR.rank_position = r.rank_position;
            existingR.is_displaced = r.is_displaced;
          }
        }
      }
      primary.overlap_count = primary.rankings.length;
      primary.overlap_percentage = Math.round((primary.overlap_count / totalKeywords) * 100);
      primary.is_super_pin = primary.overlap_count >= (totalKeywords > 1 ? 2 : 1) && primary.rankings.every(r => Number.isFinite(r.rank_position) && r.rank_position >= 1);
      primary.has_active_rank = primary.rankings.some(r => !r.is_displaced);
      primary.has_vault_rank = primary.rankings.some(r => r.is_displaced);
      primary.min_rank = primary.rankings.length > 0 ? Math.min(...primary.rankings.map(r => r.rank_position)) : 1;
      if (!primary.save_count && secondary.save_count) primary.save_count = secondary.save_count;
      if (!primary.daily_save_velocity && secondary.daily_save_velocity) primary.daily_save_velocity = secondary.daily_save_velocity;
      if (!primary.delta_saves_24h && secondary.delta_saves_24h) primary.delta_saves_24h = secondary.delta_saves_24h;
      if (!primary.delta_repins_24h && secondary.delta_repins_24h) primary.delta_repins_24h = secondary.delta_repins_24h;
      primary.effective_velocity = primary.daily_save_velocity || 0;
      primary.velocity_source = 'saves';
      if (!primary.repin_count && secondary.repin_count) primary.repin_count = secondary.repin_count;
      if (!primary.image_url && secondary.image_url) primary.image_url = secondary.image_url;
      if ((!primary.dominant_color || primary.dominant_color === '#888888' || primary.dominant_color === '#000000') && secondary.dominant_color && secondary.dominant_color !== '#888888') {
        primary.dominant_color = secondary.dominant_color;
      }
      if ((!primary.raw_title || isSyntheticPinTitle(primary.title)) && secondary.title && !isSyntheticPinTitle(secondary.title)) {
        primary.title = secondary.title;
        primary.raw_title = secondary.raw_title;
      }
    }
  }
  allPins = Array.from(creativePinMap.values());

  // Check if any top-50 priority pin still lacks image_url (due to cold shard timeout)
  const top50PriorityCheck = allPins
    .slice()
    .sort((a, b) => (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0) || (b.save_count || 0) - (a.save_count || 0))
    .slice(0, 50);
  hasUnhydratedPriorityPins = top50PriorityCheck.some(p => !p.image_url);

  // Super Pins: Strictly confirmed multi-ranking pins (rank >= 1 across >= 2 keywords)
  // Sorted primarily by daily_save_velocity DESC (with overlap_count and save_count tie-breakers)
  const superPins = allPins
    .filter(p => p.overlap_count >= (totalKeywords > 1 ? 2 : 1) && p.rankings.length >= (totalKeywords > 1 ? 2 : 1) && p.rankings.every(r => r.rank_position >= 1))
    .sort((a, b) => {
      const aVel = (a.effective_velocity != null) ? a.effective_velocity : (a.daily_save_velocity || 0);
      const bVel = (b.effective_velocity != null) ? b.effective_velocity : (b.daily_save_velocity || 0);
      if (bVel !== aVel) {
        return bVel - aVel;
      }
      if (b.overlap_count !== a.overlap_count) {
        return b.overlap_count - a.overlap_count;
      }
      return (b.save_count || 0) - (a.save_count || 0);
    });

  // Top overall pins if no super pins or total keywords is 1
  const topRankedPins = allPins
    .sort((a, b) => {
      const aVel = (a.effective_velocity != null) ? a.effective_velocity : (a.daily_save_velocity || 0);
      const bVel = (b.effective_velocity != null) ? b.effective_velocity : (b.daily_save_velocity || 0);
      return (bVel - aVel) || (b.save_count || 0) - (a.save_count || 0);
    })
    .slice(0, 30);

  // =========================================================================
  // CREATIVE SIGNATURE DEDUPLICATION FOR MATRIX PATTERNS
  // Collapses syndicated repin clones sharing the same image signature or (normalized_title + '|' + clean_domain)
  // so 1 single creative pin repinned by 6-10 accounts counts as 1 unique creative pin (+X repin clones).
  // =========================================================================
  for (const pin of allPins) {
    const rawTags = new Set();
    const canonicalTags = extractCanonicalAnnotations(pin.visual_annotations, { lemmatizeDedupe: true, titleCase: false, limit: 25 });
    for (const rawTag of canonicalTags) {
      if (rawTag && rawTag.length >= 3 && !STOPWORDS.has(rawTag)) {
        const lemma = normalizeTagLemma(rawTag);
        if (lemma && lemma.length >= 3 && !STOPWORDS.has(lemma)) {
          rawTags.add(lemma);
        }
      }
    }
    pin._canonical_tags = Array.from(rawTags);
  }

  const deduplicateCreativeClusterPins = (pinsList) => {
    const sorted = (pinsList || []).slice().sort((a, b) => {
      const aVel = Number(a.effective_velocity ?? a.daily_save_velocity ?? 0);
      const bVel = Number(b.effective_velocity ?? b.daily_save_velocity ?? 0);
      if (bVel !== aVel) return bVel - aVel;
      if ((b.save_count || 0) !== (a.save_count || 0)) return (b.save_count || 0) - (a.save_count || 0);
      return (b.overlap_count || 0) - (a.overlap_count || 0);
    });

    const byImg = new Map();
    const byTitleDom = new Map();
    const byLongTitle = new Map();
    const uniqueList = [];

    for (const p of sorted) {
      const rawImg = String(p.image_url || '').trim().toLowerCase().split('?')[0];
      const imgSeg = rawImg ? (rawImg.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '') : '';
      const imgSig = imgSeg.length >= 8 ? `img:${imgSeg}` : '';

      const cleanDom = cleanExternalDomain(p.domain) || String(p.domain || '').toLowerCase().replace(/^www\./, '').trim();
      const normTitle = String(p.raw_title || p.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const hasRealTitle = normTitle.length >= 4 && normTitle !== 'untitled' && normTitle !== 'untitled pin' && !isSyntheticPinTitle(normTitle);
      const titleDomSig = (hasRealTitle && cleanDom) ? `td:${normTitle}|${cleanDom}` : '';
      const titleWordCount = hasRealTitle ? normTitle.split(' ').length : 0;
      const longTitleSig = (hasRealTitle && titleWordCount >= 3 && normTitle.length >= 14) ? `lt:${normTitle}` : '';

      const existing = (imgSig && byImg.get(imgSig)) ||
                       (titleDomSig && byTitleDom.get(titleDomSig)) ||
                       (longTitleSig && byLongTitle.get(longTitleSig)) ||
                       null;

      if (existing) {
        existing.repin_clones_count = (existing.repin_clones_count || 0) + 1;
        if (imgSig && !byImg.has(imgSig)) byImg.set(imgSig, existing);
        if (titleDomSig && !byTitleDom.has(titleDomSig)) byTitleDom.set(titleDomSig, existing);
        if (longTitleSig && !byLongTitle.has(longTitleSig)) byLongTitle.set(longTitleSig, existing);

        const seenKw = new Set((existing.rankings || []).map(r => r.keyword));
        for (const r of (p.rankings || [])) {
          if (r.keyword && !seenKw.has(r.keyword)) {
            seenKw.add(r.keyword);
            existing.rankings.push(r);
          }
        }
        if ((!existing.dominant_color || existing.dominant_color === '#888888' || existing.dominant_color === '#000000') && p.dominant_color && p.dominant_color !== '#888888') {
          existing.dominant_color = p.dominant_color;
        }
        if (Array.isArray(p._canonical_tags) && p._canonical_tags.length > 0) {
          const mergedTags = new Set(existing._canonical_tags || []);
          for (const ct of p._canonical_tags) mergedTags.add(ct);
          existing._canonical_tags = Array.from(mergedTags);
        }
        continue;
      }

      const cloned = {
        ...p,
        repin_clones_count: 0,
        rankings: Array.isArray(p.rankings) ? p.rankings.slice() : [],
        _canonical_tags: Array.isArray(p._canonical_tags) ? p._canonical_tags.slice() : []
      };
      if (imgSig) byImg.set(imgSig, cloned);
      if (titleDomSig) byTitleDom.set(titleDomSig, cloned);
      if (longTitleSig) byLongTitle.set(longTitleSig, cloned);
      uniqueList.push(cloned);
    }

    return uniqueList;
  };

  const uniqueCreativePins = deduplicateCreativeClusterPins(allPins);

  // =========================================================================
  // DIMENSION B: UNIVERSAL TAG BRIDGES & 1-TAG POWER LEADERS (Unified SSOT)
  // =========================================================================
  const formatMatrixPin = (pin) => ({
    pin_id: pin.pin_id,
    title: pin.title || 'Untitled Pin',
    image_url: pin.image_url,
    domain: pin.domain || '',
    creator_username: pin.creator_username || '',
    save_count: Number(pin.save_count || 0),
    repin_count: Number(pin.repin_count || 0),
    repin_clones_count: Number(pin.repin_clones_count || 0),
    daily_save_velocity: Number(pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0),
    effective_velocity: Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0),
    delta_saves_24h: Number(pin.delta_saves_24h || 0),
    delta_repins_24h: Number(pin.delta_repins_24h || 0),
    gains_7d: pin.gains_7d != null ? Number(pin.gains_7d) : null,
    pin_age_days: pin.pin_age_days,
    folder_age_days: pin.folder_age_days,
    dominant_color: pin.dominant_color || null,
    aspect_ratio: pin.aspect_ratio || '2:3',
    overlap_count: pin.overlap_count || (pin.rankings ? pin.rankings.length : 1)
  });

  const tagMap = new Map(); // cleanTag -> { tag, display_name, keywords_set: Set, pin_count: int, total_saves: int, saves_gain: float, velocity_gain: float, repins_gain: float, matching_pins: [] }

  for (const pin of uniqueCreativePins) {
    const rawTags = pin._canonical_tags || [];
    const pinKeywords = pin.rankings.map(r => r.keyword).filter(Boolean);
    const pinVel = Math.max(0, Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0));
    const pinSavesGain = Math.max(0, Number(pin.delta_saves_24h || pin.daily_save_velocity || 0));
    const pinRepinsGain = Math.max(0, Number(pin.delta_repins_24h || 0));

    for (const t of rawTags) {
      if (!t || t.length < 3 || STOPWORDS.has(t.toLowerCase())) continue;
      if (!tagMap.has(t)) {
        tagMap.set(t, {
          tag: t,
          display_name: toTitleCase(t),
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          saves_gain: 0,
          velocity_gain: 0,
          repins_gain: 0,
          matching_pins: []
        });
      }
      const record = tagMap.get(t);
      record.pin_count++;
      record.total_saves += Number(pin.save_count || 0);
      record.saves_gain += pinSavesGain;
      record.velocity_gain += pinVel;
      record.repins_gain += pinRepinsGain;
      for (const kw of pinKeywords) {
        record.keywords_set.add(kw);
      }
      record.matching_pins.push(pin);
    }
  }

  const allTagBridges = Array.from(tagMap.values()).map(t => {
    const kwCount = t.keywords_set.size;
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);
    const sortedPins = t.matching_pins
      .slice()
      .sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0))
      .slice(0, 6)
      .map(formatMatrixPin);
    const velGain = Number(t.velocity_gain.toFixed(1));
    const savesGain = Math.round(t.saves_gain);
    const repinsGain = Math.round(t.repins_gain);
    return {
      tag: t.display_name,
      raw_tag: t.tag,
      keywords: Array.from(t.keywords_set),
      keyword_overlap_count: kwCount,
      keywords_count: kwCount,
      overlap_percentage: overlapPct,
      pin_count: t.pin_count,
      count: t.pin_count,
      total_saves: t.total_saves,
      saves_gain: savesGain,
      velocity_gain: velGain,
      total_velocity: velGain,
      total_repins_delta: repinsGain,
      metric_gains: {
        saves: savesGain,
        velocity: velGain,
        repins: repinsGain
      },
      is_universal: overlapPct >= 50,
      bridge_tier: overlapPct >= 80 ? 'Master Bridge (80%+)' : overlapPct >= 50 ? 'Strong Bridge (50%+)' : 'Secondary Bridge',
      sample_pins: sortedPins.slice(0, 3),
      matching_pins: sortedPins
    };
  })
  .sort((a, b) => {
    if (b.pin_count !== a.pin_count) {
      return b.pin_count - a.pin_count;
    }
    if (b.keyword_overlap_count !== a.keyword_overlap_count) {
      return b.keyword_overlap_count - a.keyword_overlap_count;
    }
    return b.total_velocity - a.total_velocity || b.total_saves - a.total_saves;
  });

  // Compute universalTagsCount and link universal bridge visual tags BEFORE slicing tagBridges to 150
  const universalTagsCount = allTagBridges.slice(0, 500).filter(t => t.is_universal).length;
  const bridgeTagMap = new Map();
  for (const tb of allTagBridges.slice(0, 500)) {
    if (tb.is_universal) {
      bridgeTagMap.set(tb.raw_tag.toLowerCase(), tb);
    }
  }

  const tagBridges = allTagBridges.slice(0, 150);

  for (const pin of allPins) {
    const matchedBridges = [];
    for (const lemma of (pin._canonical_tags || [])) {
      if (lemma && bridgeTagMap.has(lemma)) {
        matchedBridges.push(bridgeTagMap.get(lemma).tag);
      }
    }
    pin.bridge_tags = Array.from(new Set(matchedBridges));
  }

  // =========================================================================
  // DIMENSION C: SHARED GUIDED SEARCH CAPSULES & SEMANTIC PIVOTS (True Modifiers)
  // =========================================================================
  const allFolderKeywordStrings = folderKeywords.map(k => String(k.keyword || '').trim()).filter(Boolean);
  const GENERIC_CAPSULE_TERMS = new Set([
    'recipe', 'recipes', 'meal', 'meals', 'meal prep', 'prep', 'protein',
    'high protein', 'high protein meal', 'high protein meals',
    'high protein recipe', 'high protein recipes', 'high protein meal prep',
    'food', 'foods', 'idea', 'ideas', 'dish', 'dishes', 'dinner', 'dinners',
    'guide', 'diy', 'best', 'good', 'great', 'make', 'making', 'cook', 'cooking'
  ]);
  const folderUmbrellaTerms = new Set();
  const cleanFolderNameNorm = String(folder.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanFolderNameNorm) {
    folderUmbrellaTerms.add(cleanFolderNameNorm);
    const fnLemma = normalizeTagLemma(cleanFolderNameNorm);
    if (fnLemma) folderUmbrellaTerms.add(fnLemma);
    for (const w of cleanFolderNameNorm.split(' ')) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        folderUmbrellaTerms.add(w);
        const wLemma = normalizeTagLemma(w);
        if (wLemma) folderUmbrellaTerms.add(wLemma);
      }
    }
  }
  for (const fkw of allFolderKeywordStrings) {
    const fkwNorm = fkw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fkwNorm) folderUmbrellaTerms.add(fkwNorm);
    const fkwLemma = normalizeTagLemma(fkw);
    if (fkwLemma) folderUmbrellaTerms.add(fkwLemma);
    for (const w of fkwNorm.split(' ')) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        folderUmbrellaTerms.add(w);
        const wLemma = normalizeTagLemma(w);
        if (wLemma) folderUmbrellaTerms.add(wLemma);
      }
    }
  }

  const pivotMap = new Map(); // cleanKey -> { term, display_label, keywords_map: Map, total_score: float, dominant_color }
  for (const c of capsuleRows) {
    const label = String(c.display_label || '').trim();
    const rawKey = label ? normalizeTagLemma(label) : normalizeTagLemma(c.term);
    const rawLower = String(label || c.term || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawKey || rawKey.length < 2) continue;

    const parentKwNorm = String(c.keyword_text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const parentKwLemma = normalizeTagLemma(c.keyword_text || '');

    // Exclude generic umbrella terms, stopwords, or capsules identical to a tracked folder keyword
    if (
      STOPWORDS.has(rawKey) ||
      STOPWORDS.has(rawLower) ||
      GENERIC_CAPSULE_TERMS.has(rawKey) ||
      GENERIC_CAPSULE_TERMS.has(rawLower) ||
      folderUmbrellaTerms.has(rawKey) ||
      folderUmbrellaTerms.has(rawLower) ||
      rawKey === parentKwLemma ||
      rawLower === parentKwNorm
    ) {
      continue;
    }

    if (!pivotMap.has(rawKey)) {
      const displayLabel = label
        ? toTitleCase(label)
        : toTitleCase(c.term || rawKey);

      pivotMap.set(rawKey, {
        term: rawKey,
        display_label: displayLabel,
        keywords_map: new Map(),
        dominant_color: c.dominant_color || '#3b82f6',
        total_score: 0
      });
    }

    const rec = pivotMap.get(rawKey);
    rec.total_score += Number(c.score || 0);
    if (c.keyword_text && !rec.keywords_map.has(c.keyword_text)) {
      rec.keywords_map.set(c.keyword_text, {
        keyword: c.keyword_text,
        display_order: c.display_order,
        score: c.score
      });
    }
  }

  // Pre-index deduplicated creative pins via an O(1) Inverted Word Index for whole-word/phrase modifier matching
  const wordToCapsuleItems = new Map();
  for (let idx = 0; idx < uniqueCreativePins.length; idx++) {
    const pin = uniqueCreativePins[idx];
    const tagsStr = (pin._canonical_tags || []).join('  ');
    const titleStr = String(pin.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const descStr = String((pin.description || '') + '  ' + (pin.alt_text || '') + '  ' + (pin.seo_title || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const searchBlob = ` ${tagsStr}  ${titleStr}  ${descStr} `;
    const item = { pin, idx, searchBlob };

    const words = searchBlob.trim().split(/\s+/);
    const seenWords = new Set();
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      if (w.length >= 2 && !seenWords.has(w)) {
        seenWords.add(w);
        let bucket = wordToCapsuleItems.get(w);
        if (!bucket) {
          bucket = [];
          wordToCapsuleItems.set(w, bucket);
        }
        bucket.push(item);
      }
    }
  }

  const guidedPivots = Array.from(pivotMap.values()).map(p => {
    const termNorm = p.term.toLowerCase().trim();
    const displayNorm = String(p.display_label || p.term || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const paddedTerm = ` ${termNorm} `;
    const paddedDisplay = displayNorm ? ` ${displayNorm} ` : paddedTerm;
    const hasDistinctDisplay = Boolean(displayNorm && displayNorm !== termNorm);

    // 1. Keyword count strictly represents folder keywords where Pinterest recommended this capsule in keyword_guided_capsules
    // (or folder keywords containing this true sub-modifier if keywords_map is empty)
    const matchedKeywordsSet = new Set(p.keywords_map.keys());
    if (matchedKeywordsSet.size === 0) {
      for (const fkw of allFolderKeywordStrings) {
        const normFkw = ` ${fkw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
        if (normFkw.includes(paddedTerm) || normFkw.includes(paddedDisplay)) {
          matchedKeywordsSet.add(fkw);
        }
      }
    }

    // 2. Fast O(1) Inverted Word Index lookup + whole-phrase verification for multi-word capsules
    const matchingPinsRaw = [];
    const termFirstWord = termNorm.split(' ')[0];
    const isSingleWordTerm = !termNorm.includes(' ');
    const termBucket = termFirstWord ? (wordToCapsuleItems.get(termFirstWord) || []) : [];

    if (!hasDistinctDisplay) {
      if (isSingleWordTerm) {
        for (let i = 0; i < termBucket.length; i++) {
          matchingPinsRaw.push(termBucket[i].pin);
        }
      } else {
        for (let i = 0; i < termBucket.length; i++) {
          const item = termBucket[i];
          if (item.searchBlob.includes(paddedTerm)) {
            matchingPinsRaw.push(item.pin);
          }
        }
      }
    } else {
      const seenPinIdx = new Set();
      for (let i = 0; i < termBucket.length; i++) {
        const item = termBucket[i];
        if (isSingleWordTerm || item.searchBlob.includes(paddedTerm)) {
          seenPinIdx.add(item.idx);
          matchingPinsRaw.push(item.pin);
        }
      }
      const dispFirstWord = displayNorm.split(' ')[0];
      const isSingleWordDisp = !displayNorm.includes(' ');
      const dispBucket = dispFirstWord ? (wordToCapsuleItems.get(dispFirstWord) || []) : [];
      for (let i = 0; i < dispBucket.length; i++) {
        const item = dispBucket[i];
        if (!seenPinIdx.has(item.idx) && (isSingleWordDisp || item.searchBlob.includes(paddedDisplay))) {
          seenPinIdx.add(item.idx);
          matchingPinsRaw.push(item.pin);
        }
      }
    }

    matchingPinsRaw.sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0));
    const topMatchingPins = matchingPinsRaw.slice(0, 6).map(formatMatrixPin);
    const totalVel = Math.round(matchingPinsRaw.reduce((sum, pin) => sum + Math.max(0, Number(pin.effective_velocity ?? pin.daily_save_velocity ?? 0)), 0) * 10) / 10;
    const totalRepins = Math.round(matchingPinsRaw.reduce((sum, pin) => sum + Math.max(0, Number(pin.delta_repins_24h || 0)), 0));
    const totalSaves = matchingPinsRaw.reduce((sum, pin) => sum + Number(pin.save_count || 0), 0);

    const kwList = Array.from(matchedKeywordsSet).map(kw => p.keywords_map.get(kw) || { keyword: kw, display_order: 99, score: 1 });
    const kwCount = Math.max(1, matchedKeywordsSet.size);
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);

    return {
      term: p.term,
      display_label: p.display_label,
      shared_keywords: kwList,
      keywords: Array.from(matchedKeywordsSet),
      shared_count: kwCount,
      keyword_count: kwCount,
      distinct_keywords: kwCount,
      keywords_count: kwCount,
      pin_count: matchingPinsRaw.length,
      count: matchingPinsRaw.length,
      total_velocity: totalVel,
      cross_serp_velocity: totalVel,
      total_repins_delta: totalRepins,
      total_saves: totalSaves,
      overlap_percentage: overlapPct,
      composite_score: Number(p.total_score.toFixed(4)),
      dominant_color: p.dominant_color,
      is_connector: kwCount >= 2,
      matching_pins: topMatchingPins
    };
  })
  .filter(gp => gp.pin_count >= 1)
  .sort((a, b) => {
    if (b.keyword_count !== a.keyword_count) {
      return b.keyword_count - a.keyword_count;
    }
    if (b.total_velocity !== a.total_velocity) {
      return b.total_velocity - a.total_velocity;
    }
    return b.pin_count - a.pin_count || b.composite_score - a.composite_score;
  })
  .slice(0, 60);

  // =========================================================================
  // DIMENSION D: DOMAIN & CREATOR MONOPOLY OVERLAP
  // =========================================================================
  const domainMap = new Map();
  const creatorMap = new Map();

  for (const pin of allPins) {
    // 1. External Commercial Domain Only (Strips 'uploaded by user', 'pinterest.com', etc.)
    const dom = cleanExternalDomain(pin.domain);
    if (dom) {
      if (!domainMap.has(dom)) {
        domainMap.set(dom, {
          domain: dom,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const dRec = domainMap.get(dom);
      dRec.pin_count++;
      dRec.total_saves += pin.save_count;
      for (const r of pin.rankings) dRec.keywords_set.add(r.keyword);
      if (dRec.top_pins.length < 2) {
        dRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }

    // 2. Creator
    const cUser = (pin.creator_username || '').trim().toLowerCase();
    if (cUser) {
      if (!creatorMap.has(cUser)) {
        creatorMap.set(cUser, {
          username: cUser,
          display_name: pin.creator_name || cUser,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const cRec = creatorMap.get(cUser);
      cRec.pin_count++;
      cRec.total_saves += pin.save_count;
      for (const r of pin.rankings) cRec.keywords_set.add(r.keyword);
      if (cRec.top_pins.length < 2) {
        cRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }
  }

  const domainMonopoly = Array.from(domainMap.values()).map(d => ({
    domain: d.domain,
    keywords_covered: Array.from(d.keywords_set),
    keywords_count: d.keywords_set.size,
    overlap_percentage: Math.round((d.keywords_set.size / totalKeywords) * 100),
    pin_count: d.pin_count,
    total_saves: d.total_saves,
    top_pins: d.top_pins
  }))
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    if (b.pin_count !== a.pin_count) return b.pin_count - a.pin_count;
    return b.total_saves - a.total_saves;
  });

  // Enrich domain age & monetization from domain_intelligence_rollup and creator metrics in parallel
  const domainNames = Array.from(domainMap.keys()).filter(Boolean);
  const creatorUsernames = Array.from(creatorMap.keys()).filter(Boolean);
  const domainRollupMap = new Map();
  const creatorProfilesMap = new Map();

  const [domainRows, creatorRows] = await Promise.all([
    domainNames.length > 0
      ? sql`
          SELECT domain, age_days, age_years, ad_network
          FROM domain_intelligence_rollup
          WHERE domain = ANY(${domainNames})
        `.catch(() => [])
      : Promise.resolve([]),
    creatorUsernames.length > 0
      ? sql`
          SELECT 
            LOWER(username) AS username,
            monthly_reach,
            profile_views,
            delta_reach_24h,
            reach_delta_7d,
            delta_views_24h,
            views_delta_7d,
            delta_pins_24h,
            pins_delta_7d,
            delta_boards_24h,
            boards_delta_7d
          FROM competitor_profiles
          WHERE LOWER(username) = ANY(${creatorUsernames})
        `.catch(() => [])
      : Promise.resolve([])
  ]);

  for (const dr of (domainRows || [])) {
    if (dr.domain) domainRollupMap.set(dr.domain.toLowerCase(), dr);
  }
  for (const p of allPins) {
    const dom = cleanExternalDomain(p.domain);
    const dr = dom ? domainRollupMap.get(dom.toLowerCase()) : null;
    p.domain_age_days = dr?.age_days != null ? Number(dr.age_days) : null;
    p.domain_age_years = dr?.age_years != null ? Number(dr.age_years) : null;
    p.ad_network = dr?.ad_network || null;
  }
  for (const cp of (creatorRows || [])) {
    if (cp.username) creatorProfilesMap.set(cp.username.toLowerCase(), cp);
  }

  const creatorMonopoly = Array.from(creatorMap.values()).map(c => {
    const cp = creatorProfilesMap.get(c.username) || {};
    return {
      username: c.username,
      display_name: c.display_name,
      keywords_covered: Array.from(c.keywords_set),
      keywords_count: c.keywords_set.size,
      overlap_percentage: Math.round((c.keywords_set.size / totalKeywords) * 100),
      pin_count: c.pin_count,
      total_saves: c.total_saves,
      top_pins: c.top_pins,
      monthly_reach: cp.monthly_reach ?? null,
      profile_views: cp.profile_views ?? null,
      delta_monthly_reach: cp.delta_reach_24h ?? null,
      reach_delta_7d: cp.reach_delta_7d ?? null,
      delta_reach_24h: cp.delta_reach_24h ?? null,
      delta_views_24h: cp.delta_views_24h ?? null,
      views_delta_7d: cp.views_delta_7d ?? null,
      delta_pins_24h: cp.delta_pins_24h ?? null,
      pins_delta_7d: cp.pins_delta_7d ?? null,
      delta_boards_24h: cp.delta_boards_24h ?? null,
      boards_delta_7d: cp.boards_delta_7d ?? null,
      delta_audience_30d: (cp.reach_delta_7d ?? cp.delta_reach_24h ?? null)
    };
  })
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    return b.pin_count - a.pin_count;
  })
  .slice(0, 20);

  // =========================================================================
  // DIMENSION E: COMPOSITE 52-WEEK SEASONALITY WAVE & OPTIMAL LAUNCH CALENDAR
  // =========================================================================
  // =========================================================================
  // DIMENSION E: COMPOSITE 52-WEEK SEASONALITY WAVE & OPTIMAL LAUNCH CALENDAR
  // =========================================================================
  const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthScores = new Array(12).fill(0);
  const monthWeeksCount = new Array(12).fill(0);
  const compositeWeeklyWave = new Array(52).fill(0);
  let trendsLoaded = 0;

  // [INVARIANT: FAST-SYNCHRONOUS-CROSSOVER-NO-EXTERNAL-FETCH]
  // Eliminate blocking external fetchPinterestTrends calls during the synchronous read path (< 300ms SLA).
  // Rely strictly on in-memory cache and database keyword metadata.
  for (const kw of folderKeywords) {
    const term = String(kw?.keyword || '').trim().toLowerCase();
    if (!term) continue;
    let trendData = null;

    // 1. Check in-memory trends cache
    if (folderTrendsCache.has(term)) {
      const entry = folderTrendsCache.get(term);
      if (entry && (Date.now() - (entry.timestamp || 0) < 60 * 60 * 1000)) {
        trendData = entry.data || entry;
      }
    }

    // 2. Check keyword metadata from database (tk.metadata)
    if (!trendData && kw.metadata) {
      const meta = typeof kw.metadata === 'string'
        ? (() => { try { return JSON.parse(kw.metadata); } catch (_) { return null; } })()
        : kw.metadata;
      if (meta && typeof meta === 'object') {
        trendData = meta.trends || meta.trends_data || meta.seasonality || meta.trend_series || null;
      }
    }

    if (!trendData) continue;

    try {
      const series = Array.isArray(trendData?.counts_52_weeks) && trendData.counts_52_weeks.length > 0
        ? trendData.counts_52_weeks
        : (Array.isArray(trendData?.timeline) ? trendData.timeline.map(p => p.value ?? p.normalized_interest ?? p) : null);

      if (series && series.length > 0) {
        trendsLoaded++;
        const sLen = series.length;

        // Safe Binning: Exact 1-to-1 mapping when sLen === 52 to prevent IEEE 754 precision loss
        if (sLen === 52) {
          for (let i = 0; i < 52; i++) {
            const pt = series[i];
            const rawVal = Number(typeof pt === 'object' && pt !== null ? (pt.value ?? pt.normalized_interest ?? 0) : pt || 0);
            const val = Number.isFinite(rawVal) ? rawVal : 0;
            compositeWeeklyWave[i] += val;
          }
        } else {
          // Linear Interpolation for arbitrary series lengths
          for (let w = 0; w < 52; w++) {
            const srcIdx = (w / 51) * (sLen - 1);
            const i0 = Math.floor(srcIdx);
            const i1 = Math.min(sLen - 1, Math.ceil(srcIdx));
            const frac = srcIdx - i0;
            const pt0 = series[i0];
            const pt1 = series[i1];
            const raw0 = Number(typeof pt0 === 'object' && pt0 !== null ? (pt0.value ?? pt0.normalized_interest ?? 0) : pt0 || 0);
            const raw1 = Number(typeof pt1 === 'object' && pt1 !== null ? (pt1.value ?? pt1.normalized_interest ?? 0) : pt1 || 0);
            const v0 = Number.isFinite(raw0) ? raw0 : 0;
            const v1 = Number.isFinite(raw1) ? raw1 : 0;
            compositeWeeklyWave[w] += Math.round(v0 * (1 - frac) + v1 * frac);
          }
        }
      }
    } catch (_) {
      // Trends format fallback
    }
  }

  // Strict Zero-Hallucination Policy: Never fabricate artificial sine waves if trends data is missing
  const hasTrends = trendsLoaded > 0;

  // Derive Rolling 52-Week Calendar & Accurate Monthly Scores
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const maxWeekly = Math.max(...compositeWeeklyWave, 1);
  const normalizedWeeklyWave = [];

  for (let w = 0; w < 52; w++) {
    const weekEndDate = new Date(now.getTime() - (51 - w) * msPerWeek);
    const weekStartDate = new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const actualMonthIdx = weekEndDate.getMonth(); // 0 = Jan .. 11 = Dec

    monthScores[actualMonthIdx] += compositeWeeklyWave[w];
    monthWeeksCount[actualMonthIdx] += 1;

    normalizedWeeklyWave.push({
      week: w + 1,
      score: hasTrends ? Math.round((compositeWeeklyWave[w] / maxWeekly) * 100) : 0,
      month: allMonths[actualMonthIdx],
      start_date: weekStartDate.toISOString().slice(0, 10),
      end_date: weekEndDate.toISOString().slice(0, 10)
    });
  }

  // Chronological 12-Month Array for Rolling Timeline Display (Past 11 months -> Current month)
  const rollingMonths = [];
  const currentMonthIdx = now.getMonth();
  for (let i = 11; i >= 0; i--) {
    const m = (currentMonthIdx - i + 12) % 12;
    rollingMonths.push(allMonths[m]);
  }

  // Identify Peak Months based on Average Weekly Score per Month (Eliminating Month-Length Bias)
  const avgMonthlyScores = monthScores.map((score, idx) => {
    const weeksInMonth = Math.max(1, monthWeeksCount[idx]);
    return score / weeksInMonth;
  });
  const maxAvgMonthVal = Math.max(...avgMonthlyScores, 1);

  // Calibrate Seasonal Surge using Z-Scores (Standard Deviations above Cluster Mean)
  const meanMonthlyScore = avgMonthlyScores.reduce((sum, s) => sum + s, 0) / 12;
  const variance = avgMonthlyScores.reduce((sum, s) => sum + Math.pow(s - meanMonthlyScore, 2), 0) / 12;
  const stdDev = Math.sqrt(variance);

  const monthCandidates = avgMonthlyScores
    .map((val, idx) => {
      const zScore = stdDev > 0 ? (val - meanMonthlyScore) / stdDev : 0;
      const normalizedScore = Math.round((val / maxAvgMonthVal) * 100);
      return {
        month: allMonths[idx],
        idx,
        val,
        score: normalizedScore,
        zScore: Number(zScore.toFixed(2))
      };
    })
    .sort((a, b) => b.score - a.score);

  let peakMonths = [];
  let recommendedLaunchWindow = 'Insufficient trends data (synchronize keyword trends to derive peak window)';

  if (hasTrends) {
    // Algorithmic Peak Filtering:
    // 1. Primary: Months with Z-score >= 1.25 (statistically elevated above cluster baseline)
    // 2. Bound constraints: Strictly between 2 and 4 peak months maximum
    let selectedPeaks = monthCandidates.filter(m => m.zScore >= 1.25);
    if (selectedPeaks.length < 2) {
      selectedPeaks = monthCandidates.slice(0, 2);
    } else if (selectedPeaks.length > 4) {
      selectedPeaks = selectedPeaks.slice(0, 4);
    }

    const peakMonthIndices = selectedPeaks;
    peakMonths = peakMonthIndices.map(m => m.month);

    // Calculate Recommended Launch Window (45-60 days / ~2 months prior to highest peak)
    if (peakMonthIndices.length > 0) {
      const highestPeakIdx = peakMonthIndices[0].idx;
      const launchMonthIdx = (highestPeakIdx - 2 + 12) % 12;
      recommendedLaunchWindow = `${allMonths[launchMonthIdx]} (Deploy pins 45-60 days before ${allMonths[highestPeakIdx]} peak)`;
    }
  }

  // =========================================================================
  // DIMENSION F: 1-CLICK TOPIC CLUSTER BLUEPRINT & CONTENT GENERATOR
  // =========================================================================
  // Pure, concrete tags only (strictly exclude stopwords and generic wrappers)
  const topTagNames = tagBridges
    .map(t => t.tag)
    .filter(t => t && t.length >= 3 && !STOPWORDS.has(t.toLowerCase()))
    .slice(0, 12);
  const topPivotTerms = guidedPivots.slice(0, 8).map(p => p.display_label || p.term);

  // Synthesize Pillar title and concept with Co-occurrence Matrix Guard:
  // Do NOT blindly concatenate two keywords with '&' unless a verified Super-Pin ranks for both!
  const primaryKw = folderKeywords[0]?.keyword || 'Topic Cluster';
  const secondaryKw = folderKeywords[1]?.keyword || '';
  const cleanFolderName = folder.name?.replace(/\s*\([^)]*\)/g, '').trim() || '';

  let pillarTitle = '';

  const hasCooccurringPin = Boolean(
    secondaryKw && superPins.some(p => {
      const kwNames = new Set(p.rankings.map(r => r.keyword.toLowerCase()));
      return kwNames.has(primaryKw.toLowerCase()) && kwNames.has(secondaryKw.toLowerCase());
    })
  );

  if (hasCooccurringPin) {
    // Natural co-occurrence confirmed by actual Pinterest SERP overlap
    pillarTitle = `The Ultimate ${toTitleCase(primaryKw)} & ${toTitleCase(secondaryKw)} Master Guide`;
  } else if (cleanFolderName && cleanFolderName.toLowerCase() !== 'all' && cleanFolderName.length > 3) {
    // Co-occurrence not verified: anchor to overarching Umbrella Folder Concept
    pillarTitle = `The Complete ${toTitleCase(cleanFolderName)} Master Guide`;
  } else {
    pillarTitle = `The Ultimate ${toTitleCase(primaryKw)} Master Blueprint`;
  }

  // Synthesize 5 actionable spoke pins
  const spokeAngles = [];
  const modifiers = topPivotTerms.length > 0 ? topPivotTerms : ['Easy', 'Quick', 'Best', 'Healthy', 'Budget'];

  for (let i = 0; i < Math.min(5, Math.max(modifiers.length, 5)); i++) {
    const mod = modifiers[i] || `Angle ${i+1}`;
    const targetKw = folderKeywords[i % folderKeywords.length]?.keyword || primaryKw;
    const relevantTag = topTagNames[i] || 'Ideas';
    const spokeTitle = synthesizeSpokeTitle(mod, targetKw);

    spokeAngles.push({
      angle_number: i + 1,
      angle_title: spokeTitle,
      target_keyword: targetKw,
      modifier: mod,
      hook_concept: `Focus on visual clarity with ${relevantTag} close-up and bold overlay text.`,
      recommended_format: i === 0 ? 'VIDEO PIN' : (i % 2 === 0 ? 'PRODUCT CARD / CAROUSEL' : 'ORGANIC PIN (2:3 Standard)'),
      recommended_aspect_ratio: i === 0 ? '9:16 Story' : '2:3 Standard',
      target_tags: topTagNames.slice(i * 2, i * 2 + 4).join(', ')
    });
  }

  // Format CSV Export Rows
  const csvRows = spokeAngles.map((spoke, idx) => ({
    "Pin Slot": `Spoke #${idx + 1}`,
    "Working Title": spoke.angle_title,
    "Target Keyword": spoke.target_keyword,
    "Modifier Pivot": spoke.modifier,
    "Recommended Format": spoke.recommended_format,
    "Aspect Ratio": spoke.recommended_aspect_ratio,
    "Recommended Launch": recommendedLaunchWindow,
    "SEO Tags": spoke.target_tags,
    "Universal Folder Tags": topTagNames.join(' | ')
  }));

  const topicClusterBlueprint = null;

  // Aggregate Dominant Color Swatches across deduplicated creative pins with matching pins & keyword coverage
  const colorMap = new Map();
  for (const p of uniqueCreativePins) {
    const hex = String(p.dominant_color || '').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(hex) && hex !== '#888888' && hex !== '#000000' && hex !== '#1E1E24') {
      let cEntry = colorMap.get(hex);
      if (!cEntry) {
        cEntry = {
          hex,
          pin_count: 0,
          total_saves: 0,
          total_velocity: 0,
          total_repins_delta: 0,
          keywords_set: new Set(),
          matching_pins_raw: []
        };
        colorMap.set(hex, cEntry);
      }
      cEntry.pin_count += 1;
      cEntry.total_saves += Number(p.save_count || 0);
      cEntry.total_velocity += Number(p.effective_velocity ?? p.daily_save_velocity ?? 0);
      cEntry.total_repins_delta += Math.max(0, Number(p.delta_repins_24h || 0));
      for (const r of (p.rankings || [])) {
        if (r.keyword) cEntry.keywords_set.add(r.keyword);
      }
      cEntry.matching_pins_raw.push(p);
    }
  }
  const dominantColors = Array.from(colorMap.values())
    .map(c => {
      const sortedPins = c.matching_pins_raw
        .slice()
        .sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0))
        .slice(0, 6)
        .map(formatMatrixPin);
      const kwCount = c.keywords_set.size;
      return {
        hex: c.hex,
        pin_count: c.pin_count,
        count: c.pin_count,
        keywords_count: kwCount,
        keyword_overlap_count: kwCount,
        overlap_percentage: Math.round((kwCount / totalKeywords) * 100),
        keywords: Array.from(c.keywords_set),
        total_saves: c.total_saves,
        total_velocity: Math.round(c.total_velocity * 10) / 10,
        total_repins_delta: Math.round(c.total_repins_delta),
        matching_pins: sortedPins
      };
    })
    .sort((a, b) => b.pin_count - a.pin_count || b.total_velocity - a.total_velocity)
    .slice(0, 48);

  const rocketsCount = allPins.filter(p => p.pin_age_days != null && Number(p.pin_age_days) <= 14 && (Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0)).length;
  const surging24hCount = allPins.filter(p => Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0).length;

  // Clean up internal temporary property before returning
  for (const p of allPins) {
    delete p._canonical_tags;
  }

  return {
    _crossover_schema_v: 6,
    folder,
    summary: {
      total_keywords: totalKeywords,
      total_unique_pins: allPins.length,
      unique_creative_pins_count: uniqueCreativePins.length,
      active_pins_count: allPins.filter(p => p.has_active_rank).length,
      active_serp_slots_count: pinRows.length,
      vault_pins_count: allPins.filter(p => !p.has_active_rank && p.has_vault_rank).length,
      super_pins_count: superPins.length,
      vacuum_pins_count: vacuumPinsCount,
      rockets_count: rocketsCount,
      surging_24h_count: surging24hCount,
      universal_tags_count: universalTagsCount,
      shared_pivots_count: guidedPivots.filter(p => p.is_connector).length,
      monopoly_domain_count: domainMonopoly.length,
      monopoly_creator_count: creatorMonopoly.length,
      multi_window_gains: {
        '24h': { saves: allPins.reduce((sum, p) => sum + (p.delta_saves_24h || 0), 0), repins: allPins.reduce((sum, p) => sum + (p.delta_repins_24h || 0), 0) },
        '5d': { saves: allPins.reduce((sum, p) => sum + (p.gains_5d || 0), 0), repins: allPins.reduce((sum, p) => sum + Math.round((p.gains_5d || 0) * 0.1), 0) },
        '7d': { saves: allPins.reduce((sum, p) => sum + (p.gains_7d || 0), 0), repins: allPins.reduce((sum, p) => sum + Math.round((p.gains_7d || 0) * 0.1), 0) },
        '10d': { saves: allPins.reduce((sum, p) => sum + (p.gains_10d || 0), 0), repins: allPins.reduce((sum, p) => sum + Math.round((p.gains_10d || 0) * 0.1), 0) },
        '15d': { saves: allPins.reduce((sum, p) => sum + (p.gains_15d || 0), 0), repins: allPins.reduce((sum, p) => sum + Math.round((p.gains_15d || 0) * 0.1), 0) },
        'all': { saves: allPins.reduce((sum, p) => sum + (p.save_count || 0), 0), repins: allPins.reduce((sum, p) => sum + (p.repin_count || 0), 0) }
      }
    },
    super_pins: (superPins.length > 0 ? superPins : topRankedPins).slice(0, 20),
    all_pins: allPins.slice().sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0)),
    has_super_pins: superPins.length > 0,
    tag_bridges: tagBridges,
    guided_pivots: guidedPivots,
    dominant_colors: dominantColors,
    domain_monopoly: domainMonopoly,
    creator_monopoly: creatorMonopoly,
    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Top Creators Rollup Wiring
    top_creators: creatorMonopoly,
    pulse_analytics: await pulseAnalyticsPromise,
    seasonality: {
      status: hasTrends ? 'available' : 'insufficient_data',
      composite_wave: normalizedWeeklyWave,
      rolling_months: rollingMonths,
      peak_months: hasTrends && peakMonths.length > 0 ? peakMonths : (hasTrends ? ['Year-round'] : []),
      recommended_launch_window: recommendedLaunchWindow,
      trends_loaded_count: trendsLoaded
    },
    topic_cluster_blueprint: topicClusterBlueprint,
    has_unhydrated_priority_pins: hasUnhydratedPriorityPins,
    _has_unhydrated_priority_pins: hasUnhydratedPriorityPins
  };
}
