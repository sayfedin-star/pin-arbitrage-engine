/**
 * Campaign / Project Folder CRUD, Keyword Linking, Domain Pinning & Pruning Service
 * Extracted from src/modules/keywords/folders-service.mjs
 */

import { normalizePinterestUsername, RESERVED_PINTEREST_PATHS, syncCompetitorProfile } from '../creators/service.mjs';
import { normalizeFolderMetadata, invalidateFolderCache } from './folders-crossover.mjs';

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
