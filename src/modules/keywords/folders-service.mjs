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
import { safeWaitUntil } from '../sharding/fleet-router.mjs';

export const folderTrendsCache = new Map();

export function cacheFolderTrends(term, data) {
  if (!term || typeof term !== 'string') return;
  const cleanTerm = term.trim().toLowerCase();
  if (cleanTerm) {
    folderTrendsCache.set(cleanTerm, { timestamp: Date.now(), data });
  }
}

const crossoverCache = new Map();
const CROSSOVER_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const CROSSOVER_CACHE_MAX = 50;
const inflightCrossover = new Map();

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
  } else {
    crossoverCache.clear();
  }
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
    domain_counts AS (
      SELECT kfi.folder_id, COUNT(DISTINCT LOWER(TRIM(ksc.domain)))::int AS domain_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE ksc.is_displaced = FALSE
        AND ksc.domain IS NOT NULL AND ksc.domain <> ''
        AND ksc.domain NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it', 'localhost', 'direct')
        AND ksc.domain LIKE '%.%'
      GROUP BY kfi.folder_id
    ),
    pin_counts AS (
      SELECT kfi.folder_id,
        COUNT(DISTINCT ksc.pin_id)::int AS unique_pins_count,
        COUNT(DISTINCT ksc.pin_id)::int AS total_unique_pins,
        COUNT(DISTINCT ksc.pin_id)::int AS pin_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE ksc.is_displaced = FALSE
      GROUP BY kfi.folder_id
    ),
    discovered_creator_counts AS (
      SELECT kfi.folder_id, COUNT(DISTINCT LOWER(TRIM(ksc.creator_username)))::int AS discovered_creator_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE ksc.is_displaced = FALSE
        AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
        AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
      GROUP BY kfi.folder_id
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
      COALESCE(dc.domain_count, 0) AS domain_count,
      COALESCE(pc.pin_count, 0) AS pin_count,
      COALESCE(pc.unique_pins_count, 0) AS unique_pins_count,
      COALESCE(pc.total_unique_pins, 0) AS total_unique_pins,
      COALESCE(dcr.discovered_creator_count, 0) AS discovered_creator_count,
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
    LEFT JOIN domain_counts dc ON dc.folder_id = f.id
    LEFT JOIN pin_counts pc ON pc.folder_id = f.id
    LEFT JOIN discovered_creator_counts dcr ON dcr.folder_id = f.id
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
    domain_counts AS (
      SELECT kfi.folder_id, COUNT(DISTINCT LOWER(TRIM(ksc.domain)))::int AS domain_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.domain IS NOT NULL AND ksc.domain <> ''
        AND ksc.domain NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it', 'localhost', 'direct')
        AND ksc.domain LIKE '%.%'
      GROUP BY kfi.folder_id
    ),
    pin_counts AS (
      SELECT kfi.folder_id,
        COUNT(DISTINCT ksc.pin_id)::int AS unique_pins_count,
        COUNT(DISTINCT ksc.pin_id)::int AS total_unique_pins,
        COUNT(DISTINCT ksc.pin_id)::int AS pin_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
      GROUP BY kfi.folder_id
    ),
    discovered_creator_counts AS (
      SELECT kfi.folder_id, COUNT(DISTINCT LOWER(TRIM(ksc.creator_username)))::int AS discovered_creator_count
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
        AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
      GROUP BY kfi.folder_id
    )
    SELECT 
      f.*,
      COALESCE(kw.keyword_count, 0) AS keyword_count,
      COALESCE(cr.creator_count, 0) AS creator_count,
      COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count,
      COALESCE(dc.domain_count, 0) AS domain_count,
      COALESCE(pc.pin_count, 0) AS pin_count,
      COALESCE(pc.unique_pins_count, 0) AS unique_pins_count,
      COALESCE(pc.total_unique_pins, 0) AS total_unique_pins,
      COALESCE(dcr.discovered_creator_count, 0) AS discovered_creator_count
    FROM keyword_folders f
    LEFT JOIN kw_counts kw ON kw.folder_id = f.id
    LEFT JOIN creator_counts cr ON cr.folder_id = f.id
    LEFT JOIN pinned_counts pd ON pd.folder_id = f.id
    LEFT JOIN domain_counts dc ON dc.folder_id = f.id
    LEFT JOIN pin_counts pc ON pc.folder_id = f.id
    LEFT JOIN discovered_creator_counts dcr ON dcr.folder_id = f.id
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
export async function listFolderCreatorsWithDiscovery(sql, folderId) {
  const fid = Number(folderId);
  if (!fid) {
    return {
      linked_creators: [],
      discovered_creators: [],
      all_creators: [],
      auto_discovered: [],
      auto_discover_creators: true,
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

  // Extract unique creators from active SERP (WHERE is_displaced = FALSE) for this folder's keywords
  const rows = await sql`
    WITH folder_creators_serp AS (
      SELECT
        LOWER(TRIM(ksc.creator_username)) AS clean_username,
        COUNT(DISTINCT ksc.pin_id)::int AS pin_count,
        ARRAY_AGG(DISTINCT tk.keyword) AS keywords_ranked,
        MAX(ksc.save_count)::bigint AS top_pin_saves,
        MAX(COALESCE(ksc.daily_save_velocity, 0))::numeric AS max_velocity
      FROM keyword_folder_items kfi
      JOIN keyword_serp_current ksc ON ksc.keyword_id = kfi.keyword_id
      JOIN tracked_keywords tk ON tk.id = ksc.keyword_id
      WHERE kfi.folder_id = ${fid}
        AND ksc.is_displaced = FALSE
        AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> ''
        AND LOWER(TRIM(ksc.creator_username)) NOT IN ('uploaded by user', 'uploaded by pinner', 'pinterest', 'anonymous')
      GROUP BY LOWER(TRIM(ksc.creator_username))
    )
    SELECT
      COALESCE(cp.id::text, 'serp_' || fcs.clean_username) AS id,
      cp.id AS competitor_id,
      fcs.clean_username AS username,
      fcs.pin_count,
      fcs.keywords_ranked,
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
      cp.metadata,
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
      ARRAY[]::text[] AS keywords_ranked,
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
      cp.metadata,
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

  const allRows = [...rows, ...linkedItems];
  const linked = allRows.filter(r => r.is_linked);
  const discovered = allRows.filter(r => !r.is_linked);

  const totalAudience = allRows.reduce((sum, r) => sum + Number(r.monthly_reach || 0), 0);
  const totalImpressions = allRows.reduce((sum, r) => sum + Number(r.profile_views || 0), 0);
  const totalPins = allRows.reduce((sum, r) => sum + Number(r.total_pins || 0), 0);
  const avgCadence = allRows.length > 0
    ? Number((allRows.reduce((sum, r) => sum + (Number(r.total_pins || 0) / 365), 0) / allRows.length).toFixed(1))
    : 0;

  return {
    linked_creators: linked,
    discovered_creators: discovered,
    all_creators: allRows,
    auto_discovered: discovered,
    auto_discover_creators: true,
    totals: {
      total_linked: linked.length,
      total_discovered: discovered.length,
      total_creators: allRows.length,
      combined_audience: totalAudience,
      combined_impressions: totalImpressions,
      combined_pins: totalPins,
      avg_pinning_cadence: avgCadence
    }
  };
}

/**
 * Auto-discover creator accounts from folder SERP
 */
export async function autoDiscoverFolderCreators(sql, folderId) {
  const result = await listFolderCreatorsWithDiscovery(sql, folderId);
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
        ${resolvedMinPinAge === null} OR
        (ksc.created_at_pinterest IS NOT NULL AND ksc.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval)
      )
      AND (
        ${resolvedMinFolderAge === null} OR
        (i.added_at <= NOW() - (${resolvedMinFolderAge} || ' days')::interval)
      )

    UNION ALL

    SELECT
      kdi.keyword_id,
      kdi.pin_id,
      NULL::text AS title,
      kdi.save_count,
      kdi.repin_count,
      kdi.daily_save_velocity,
      TRUE AS is_displaced,
      NULL::timestamptz AS created_at_pinterest,
      tk.keyword,
      i.added_at AS folder_added_at
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    JOIN keyword_displaced_index kdi ON kdi.keyword_id = i.keyword_id
    WHERE i.folder_id = ${fid}
      AND (${validKids.length === 0} OR i.keyword_id = ANY(${validKids}::int[]))
      AND (${targetScope} IN ('all', 'displaced'))
      AND (${resolvedMaxSaves === null} OR COALESCE(kdi.save_count, 0) <= ${resolvedMaxSaves})
      AND (${resolvedMaxRepins === null} OR COALESCE(kdi.repin_count, 0) <= ${resolvedMaxRepins})
      AND (${resolvedMinPinAge === null})
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
  // Pruning execution tombstones candidate pins to keyword_ignored_pins and evicts D1 edge_pins_metadata and PIN_ENGINE_KV
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

  // C. Evict Edge Caches (Cloudflare D1 edge_pins_metadata and PIN_ENGINE_KV)
  if (env?.DB || env?.PIN_D1_DB) {
    const d1 = env.DB || env.PIN_D1_DB;
    try {
      if (typeof d1.batch === 'function') {
        const statements = uniquePinIds.map(pid =>
          d1.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pid)
        );
        for (let i = 0; i < statements.length; i += 50) {
          await d1.batch(statements.slice(i, i + 50));
        }
      } else {
        for (const pid of uniquePinIds) {
          await d1.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(pid).run().catch(() => {});
        }
      }
    } catch (d1Err) {
      console.warn(`[pruneFolderPins] D1 edge cache eviction warning: ${d1Err.message}`);
    }
  }

  if (env?.PIN_ENGINE_KV) {
    try {
      // [LND-805 FIX] Replace unbounded 18-key-per-pin loop (~3,600 subrequests)
      // with epoch bump (fleet:cache_epoch) + bounded primary key eviction (<= 20 keys via safeWaitUntil)
      const newEpoch = String(Date.now());
      safeWaitUntil(ctx, env.PIN_ENGINE_KV.put('fleet:cache_epoch', newEpoch), 'kv_bump_epoch');
      const primaryKeys = Array.from(new Set(uniquePairs.map(p => `pin:dossier:v3?pin_id=${p.pid}`))).slice(0, 20);
      safeWaitUntil(ctx, Promise.all(primaryKeys.map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}))), 'kv_prune_primary');
    } catch (kvErr) {
      console.warn(`[pruneFolderPins] KV eviction warning: ${kvErr.message}`);
    }
  }

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
 * Intelligent Pin Title Fallback Derivation
 * Eradicates "Untitled Pin" and empty titles by extracting clean human-readable titles from
 * destination link slugs, board names, visual annotations, or keyword context.
 */
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = []) {
  const rawTitle = String(title || '').trim();
  const isGeneric = !rawTitle || 
    /^untitled(\s+pin)?$/i.test(rawTitle) || 
    /^pin\s*#?\s*\w+$/i.test(rawTitle) || 
    rawTitle.toLowerCase() === 'recipe' || 
    rawTitle.toLowerCase() === 'pin';

  if (!isGeneric) {
    return rawTitle;
  }

  // 1. Try URL slug
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
          !/^[a-zA-Z0-9_-]{10,25}$/.test(s)
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

  // 3. Try Visual Annotations
  if (Array.isArray(visualAnnotations) && visualAnnotations.length > 0) {
    const topVa = visualAnnotations.find(v => typeof v === 'string' && v.trim().length >= 4);
    if (topVa) {
      const formatted = topVa.trim().charAt(0).toUpperCase() + topVa.trim().slice(1);
      return keyword ? `${formatted} - ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}` : formatted;
    }
  }

  // 4. Fallback to Keyword
  if (keyword) {
    return keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' Inspiration';
  }

  return rawTitle || 'Pinterest Visual Guide';
}

/**
 * Robust English Lemmatizer / Stemmer for Pinterest Visual Tags & Search Capsules
 * Robust English Lemmatizer / Stemmer for Pinterest Visual Tags & Search Capsules
 * Unifies singular/plural variants while strictly protecting non-plural suffixes (-ous, -us, -is, -ss, -ness, -ics)
 */
export function normalizeTagLemma(tag) {
  let t = String(tag || '').trim().toLowerCase();
  if (!t || t.length < 3) return '';
  // Unicode NFKD normalization decomposes combined characters (e.g. é -> e + ́), then strip combining marks
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Retain Unicode letters, numbers, and spaces while stripping punctuation/symbols
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 3) return '';

  const irregulars = {
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
  if (irregulars[t]) return irregulars[t];

  // Protected non-plural suffixes: do NOT strip 's' (e.g. delicious, hummus, citrus, grass)
  if (/(ous|us|is|ss|ness|ics)$/.test(t)) {
    return t;
  }

  // Safe plural rules
  if (t.endsWith('ies') && t.length > 5) return t.slice(0, -3) + 'y';
  if (t.endsWith('ves') && t.length > 4) return t.slice(0, -3) + 'f';
  if (t.endsWith('es') && t.length > 4 && /(s|ch|sh|x|z)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
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
function extractTitleKeywords(title = '') {
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
export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const now = Date.now();
  if (!refresh) {
    const cached = crossoverCache.get(fid);
    if (cached && (now - cached.timestamp < CROSSOVER_TTL_MS)) {
      return cached.data;
    }
    if (env?.PIN_ENGINE_KV) {
      try {
        const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
        const kvKey = `fep:${epoch}:folder:${fid}:crossover`;
        const kvData = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
        if (kvData) {
          crossoverCache.set(fid, { timestamp: now, data: kvData });
          return kvData;
        }
      } catch (_) {}
    }
  }

  const flightKey = `${fid}:${refresh ? 'refresh' : 'standard'}`;
  if (inflightCrossover.has(flightKey)) {
    return await inflightCrossover.get(flightKey);
  }

  const computePromise = (async () => {
    try {
      const result = await _executeFolderCrossover(sql, fid);
      if (crossoverCache.size >= CROSSOVER_CACHE_MAX) {
        const oldest = crossoverCache.keys().next().value;
        if (oldest) crossoverCache.delete(oldest);
      }
      crossoverCache.set(fid, { timestamp: Date.now(), data: result });
      if (env?.PIN_ENGINE_KV) {
        try {
          const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
          const kvKey = `fep:${epoch}:folder:${fid}:crossover`;
          await env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(result), { expirationTtl: 86400 });
        } catch (_) {}
      }
      return result;
    } finally {
      inflightCrossover.delete(flightKey);
    }
  })();

  inflightCrossover.set(flightKey, computePromise);
  return await computePromise;
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

  // 2. Query Live Active Catalog from keyword_serp_current for all folder keywords (Migration 019)
  // [INVARIANT: TARGETED-JSONB-PROJECTION]
  // Select targeted JSONB fields ((c.metadata->>'aspect_ratio'), (c.metadata->>'format')) instead of fetching
  // the entire raw c.metadata JSONB blob, reducing network transfer by ~15MB-20MB across thousands of pins.
  let pinRows = await sql`
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
      c.updated_at as snapshot_date,
      (c.metadata->>'aspect_ratio') as aspect_ratio,
      (c.metadata->>'format') as format,
      tk.keyword as keyword_text,
      i.added_at as folder_added_at
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    JOIN keyword_serp_current c ON c.keyword_id = i.keyword_id
    WHERE i.folder_id = ${fid}
      AND c.is_displaced IS FALSE
      AND c.rank_position IS NOT NULL
      AND c.rank_position >= 1
    ORDER BY c.save_count DESC, c.daily_save_velocity DESC;
  `;

  // [INVARIANT: ZERO-HUB-SNAPSHOTS] Fallback to empty array; Central Hub holds zero historical snapshots
  if (!pinRows) {
    pinRows = [];
  }

  // 3. Query Guided Search Capsules for all folder keywords
  const capsuleRows = await sql`
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
  `;

  // =========================================================================
  // DIMENSION A: MULTI-RANKING SUPER-PINS OVERLAP
  // =========================================================================
  const pinMap = new Map(); // pin_id -> { pin data, keywords: [] }
  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const nowMs = Date.now();
  const folderCreatedMs = folder.created_at ? new Date(folder.created_at).getTime() : null;

  for (const row of pinRows) {
    const pid = String(row.pin_id).trim();
    if (!pid) continue;

    const rankNum = Number(row.rank_position);
    if (!Number.isFinite(rankNum) || rankNum < 1 || row.is_displaced === true) {
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

    const vel = safeNum(row.daily_save_velocity);

    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const cleanTitle = derivePinTitle(
        row.title || meta.title,
        row.destination_url || meta.destination_url || '',
        row.keyword_text || '',
        row.board_name || meta.board_name || '',
        rowVisualAnnotations
      );

      pinMap.set(pid, {
        pin_id: pid,
        title: cleanTitle,
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: safeNum(row.save_count ?? meta.raw_saves ?? 0),
        is_vacuum_pin: (!row.domain || row.domain === 'Uploaded by user') && safeNum(row.save_count ?? meta.raw_saves ?? 0) >= 100,
        repin_count: safeNum(row.repin_count),
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || '2:3',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
        visual_annotations: rowVisualAnnotations,
        created_at_pinterest: row.created_at_pinterest,
        crawled_at: row.crawled_at,
        pin_age_days: pinAgeDays,
        folder_age_days: folderAgeDays,
        delta_saves_24h: vel,
        delta_repins_24h: safeNum(row.delta_repins_24h, Math.round(vel * 0.1)),
        gains_5d: safeNum(row.gains_5d, Math.round(vel * 5)),
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Authentic Multi-Window Gains
        gains_7d: safeNum(row.gains_7d, Math.round(vel * 7)),
        gains_10d: safeNum(row.gains_10d, Math.round(vel * 10)),
        gains_15d: safeNum(row.gains_15d, Math.round(vel * 15)),
        rankings: []
      });
    } else {
      const existingPin = pinMap.get(pid);
      existingPin.save_count = Math.max(existingPin.save_count, safeNum(row.save_count));
      existingPin.repin_count = Math.max(existingPin.repin_count, safeNum(row.repin_count));
      existingPin.comment_count = Math.max(existingPin.comment_count, safeNum(row.comment_count));
      existingPin.daily_save_velocity = Math.max(existingPin.daily_save_velocity, vel);
      existingPin.delta_saves_24h = existingPin.daily_save_velocity;
      existingPin.delta_repins_24h = Math.max(existingPin.delta_repins_24h || 0, safeNum(row.delta_repins_24h, Math.round(existingPin.daily_save_velocity * 0.1)));
      existingPin.gains_5d = Math.max(existingPin.gains_5d || 0, safeNum(row.gains_5d, Math.round(existingPin.daily_save_velocity * 5)));
      existingPin.gains_7d = Math.max(existingPin.gains_7d || 0, safeNum(row.gains_7d, Math.round(existingPin.daily_save_velocity * 7)));
      existingPin.gains_10d = Math.max(existingPin.gains_10d || 0, safeNum(row.gains_10d, Math.round(existingPin.daily_save_velocity * 10)));
      existingPin.gains_15d = Math.max(existingPin.gains_15d || 0, safeNum(row.gains_15d, Math.round(existingPin.daily_save_velocity * 15)));
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
      daily_save_velocity: safeNum(row.daily_save_velocity),
      snapshot_date: row.snapshot_date
    });
  }

  const allPins = Array.from(pinMap.values());
  let vacuumPinsCount = 0;
  for (const p of allPins) {
    p.overlap_count = p.rankings.length;
    p.overlap_percentage = Math.round((p.overlap_count / totalKeywords) * 100);
    p.is_super_pin = p.overlap_count >= 2 && p.rankings.every(r => Number.isFinite(r.rank_position) && r.rank_position >= 1);
    p.min_rank = p.rankings.length > 0 ? Math.min(...p.rankings.map(r => r.rank_position)) : 1;
    p.avg_rank = p.rankings.length > 0 ? Number((p.rankings.reduce((sum, r) => sum + r.rank_position, 0) / p.rankings.length).toFixed(1)) : 1;
    // Sort rankings by rank position ASC
    p.rankings.sort((a, b) => a.rank_position - b.rank_position);

    // [INVARIANT: VACUUM-PIN-CALCULATION]
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // Super Pins: Strictly confirmed multi-ranking pins (rank >= 1 across >= 2 keywords)
  const superPins = allPins
    .filter(p => p.overlap_count >= (totalKeywords > 1 ? 2 : 1) && p.rankings.length >= (totalKeywords > 1 ? 2 : 1) && p.rankings.every(r => r.rank_position >= 1))
    .sort((a, b) => {
      if (b.overlap_count !== a.overlap_count) {
        return b.overlap_count - a.overlap_count;
      }
      return b.save_count - a.save_count;
    });

  // Top overall pins if no super pins or total keywords is 1
  const topRankedPins = allPins
    .sort((a, b) => b.save_count - a.save_count)
    .slice(0, 30);

  // =========================================================================
  // DIMENSION B: UNIVERSAL TAG BRIDGES (CV & Semantic Annotations Overlap)
  // =========================================================================
  const tagMap = new Map(); // cleanTag -> { tag, display_name, keywords: Set, count: int, saves: int, sample_pins: [] }

  for (const pin of allPins) {
    const rawTags = new Set();
    // 1. From visual annotations (Pinterest Computer Vision labels)
    for (const va of pin.visual_annotations) {
      if (typeof va === 'string' && va.trim().length >= 3) {
        const cleanVa = va.trim().toLowerCase();
        if (STOPWORDS.has(cleanVa)) continue;
        const lemma = normalizeTagLemma(cleanVa);
        if (lemma && lemma.length >= 3 && !STOPWORDS.has(lemma)) {
          rawTags.add(lemma);
        }
      }
    }
    // 2. From title entities (already lemmatized and stopword-filtered)
    const titleTokens = extractTitleKeywords(pin.title);
    for (const tt of titleTokens) {
      if (tt && tt.length >= 3 && !STOPWORDS.has(tt.toLowerCase())) {
        rawTags.add(tt);
      }
    }

    const pinKeywords = pin.rankings.map(r => r.keyword);

    for (const t of rawTags) {
      if (!t || t.length < 3 || STOPWORDS.has(t.toLowerCase())) continue;
      if (!tagMap.has(t)) {
        tagMap.set(t, {
          tag: t,
          display_name: t.charAt(0).toUpperCase() + t.slice(1),
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          sample_pins: []
        });
      }
      const record = tagMap.get(t);
      record.pin_count++;
      record.total_saves += pin.save_count;
      for (const kw of pinKeywords) {
        record.keywords_set.add(kw);
      }
      if (record.sample_pins.length < 3) {
        record.sample_pins.push({
          pin_id: pin.pin_id,
          title: pin.title,
          image_url: pin.image_url,
          save_count: pin.save_count
        });
      }
    }
  }

  const tagBridges = Array.from(tagMap.values()).map(t => {
    const kwCount = t.keywords_set.size;
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);
    return {
      tag: t.display_name,
      raw_tag: t.tag,
      keywords: Array.from(t.keywords_set),
      keyword_overlap_count: kwCount,
      overlap_percentage: overlapPct,
      pin_count: t.pin_count,
      total_saves: t.total_saves,
      is_universal: overlapPct >= 50,
      bridge_tier: overlapPct >= 80 ? 'Master Bridge (80%+)' : overlapPct >= 50 ? 'Strong Bridge (50%+)' : 'Secondary Bridge',
      sample_pins: t.sample_pins
    };
  })
  .sort((a, b) => {
    if (b.keyword_overlap_count !== a.keyword_overlap_count) {
      return b.keyword_overlap_count - a.keyword_overlap_count;
    }
    if (b.pin_count !== a.pin_count) {
      return b.pin_count - a.pin_count;
    }
    return b.total_saves - a.total_saves;
  })
  .slice(0, 50);

  // Link universal bridge visual tags back to each pin record for inline display
  const bridgeTagMap = new Map();
  for (const tb of tagBridges) {
    if (tb.is_universal) {
      bridgeTagMap.set(tb.raw_tag.toLowerCase(), tb);
    }
  }

  for (const pin of allPins) {
    const matchedBridges = [];
    for (const va of pin.visual_annotations) {
      const clean = typeof va === 'string' ? normalizeTagLemma(va.trim().toLowerCase()) : '';
      if (clean && bridgeTagMap.has(clean)) {
        matchedBridges.push(bridgeTagMap.get(clean).tag);
      }
    }
    pin.bridge_tags = Array.from(new Set(matchedBridges));
  }

  // =========================================================================
  // DIMENSION C: SHARED GUIDED SEARCH CAPSULES & SEMANTIC PIVOTS
  // =========================================================================
  const pivotMap = new Map(); // cleanKey -> { term, display_label, keywords_map: Map, total_score: float, dominant_color }
  for (const c of capsuleRows) {
    const label = String(c.display_label || '').trim();
    const rawKey = label ? normalizeTagLemma(label) : normalizeTagLemma(c.term);
    if (!rawKey || rawKey.length < 2) continue;

    if (!pivotMap.has(rawKey)) {
      const displayLabel = label 
        ? (label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()) 
        : (c.term.charAt(0).toUpperCase() + c.term.slice(1).toLowerCase());

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
    if (!rec.keywords_map.has(c.keyword_text)) {
      rec.keywords_map.set(c.keyword_text, {
        keyword: c.keyword_text,
        display_order: c.display_order,
        score: c.score
      });
    }
  }

  const guidedPivots = Array.from(pivotMap.values()).map(p => {
    const kwList = Array.from(p.keywords_map.values());
    const count = kwList.length;
    const overlapPct = Math.round((count / totalKeywords) * 100);
    return {
      term: p.term,
      display_label: p.display_label,
      shared_keywords: kwList,
      shared_count: count,
      overlap_percentage: overlapPct,
      composite_score: Number(p.total_score.toFixed(4)),
      dominant_color: p.dominant_color,
      is_connector: count >= 2
    };
  })
  .sort((a, b) => {
    if (b.shared_count !== a.shared_count) {
      return b.shared_count - a.shared_count;
    }
    return b.composite_score - a.composite_score;
  })
  .slice(0, 40);

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

  // Enrich domain age & monetization from domain_intelligence_rollup
  const domainNames = Array.from(domainMap.keys()).filter(Boolean);
  const domainRollupMap = new Map();
  if (domainNames.length > 0) {
    const domainRows = await sql`
      SELECT domain, age_days, age_years, ad_network
      FROM domain_intelligence_rollup
      WHERE domain = ANY(${domainNames})
    `.catch(() => []);
    for (const dr of (domainRows || [])) {
      if (dr.domain) domainRollupMap.set(dr.domain.toLowerCase(), dr);
    }
  }

  for (const p of allPins) {
    const dom = cleanExternalDomain(p.domain);
    const dr = dom ? domainRollupMap.get(dom.toLowerCase()) : null;
    p.domain_age_days = dr?.age_days != null ? Number(dr.age_days) : null;
    p.domain_age_years = dr?.age_years != null ? Number(dr.age_years) : null;
    p.ad_network = dr?.ad_network || null;
  }

  const creatorUsernames = Array.from(creatorMap.keys()).filter(Boolean);
  const creatorProfilesMap = new Map();
  if (creatorUsernames.length > 0) {
    const creatorRows = await sql`
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
    `;
    for (const cp of (creatorRows || [])) {
      if (cp.username) creatorProfilesMap.set(cp.username.toLowerCase(), cp);
    }
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

  const topicClusterBlueprint = {
    folder_name: folder.name,
    pillar_concept: pillarTitle,
    target_keywords: folderKeywords.map(k => k.keyword),
    universal_tag_blueprint: topTagNames.join(', '),
    top_connectors: topPivotTerms,
    spoke_angles: spokeAngles,
    csv_rows: csvRows
  };

  return {
    folder,
    summary: {
      total_keywords: totalKeywords,
      total_unique_pins: allPins.length,
      super_pins_count: superPins.length,
      vacuum_pins_count: vacuumPinsCount,
      universal_tags_count: tagBridges.filter(t => t.is_universal).length,
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
    super_pins: superPins.length > 0 ? superPins : topRankedPins,
    all_pins: allPins.slice().sort((a, b) => (b.save_count || 0) - (a.save_count || 0) || (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0)),
    has_super_pins: superPins.length > 0,
    tag_bridges: tagBridges,
    guided_pivots: guidedPivots,
    domain_monopoly: domainMonopoly,
    creator_monopoly: creatorMonopoly,
    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Top Creators Rollup Wiring
    top_creators: creatorMonopoly,
    seasonality: {
      status: hasTrends ? 'available' : 'insufficient_data',
      composite_wave: normalizedWeeklyWave,
      rolling_months: rollingMonths,
      peak_months: hasTrends && peakMonths.length > 0 ? peakMonths : (hasTrends ? ['Year-round'] : []),
      recommended_launch_window: recommendedLaunchWindow,
      trends_loaded_count: trendsLoaded
    },
    topic_cluster_blueprint: topicClusterBlueprint
  };
}
