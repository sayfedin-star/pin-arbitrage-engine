/**
 * Campaign Folders Sub-Router (`/api/folders` and `/api/folders/*`)
 * Extracted from src/routes/keywords.mjs
 *
 * Handles folder CRUD, keyword/creator/domain linking, pruning, visual crossover,
 * and folder cluster fleet audit dispatch.
 */

import {
  listFolders,
  listFoldersLite,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  addKeywordToFolder,
  batchAddKeywordsToFolder,
  removeKeywordFromFolder,
  getFoldersForKeyword,
  listFolderCreators,
  listFolderCreatorsWithDiscovery,
  linkCreatorToFolder,
  unlinkCreatorFromFolder,
  listFolderPinnedDomains,
  pinDomainToFolder,
  unpinDomainFromFolder,
  pruneFolderPins,
  bulkPulseTrackFolderCreators,
  toggleFolderCreatorTracking
} from '../modules/keywords/folders-crud.mjs';
import {
  calculateFolderCrossover,
  normalizeFolderMetadata,
  invalidateFolderCache
} from '../modules/keywords/folders-crossover.mjs';
import { dispatchGitHubWorkflow } from '../http/github-workflow.mjs';

/**
 * Fast URI discriminator for Campaign Folders routes
 */
export function isFoldersRoute(pathname) {
  return pathname === '/api/folders' || pathname.startsWith('/api/folders/');
}

/**
 * Handles `/api/folders` and `/api/folders/*` endpoints.
 * Returns null if no route matched.
 */
export async function handleFoldersRoutes({
  pathname,
  method,
  request,
  searchParams,
  env,
  ctx,
  sql,
  jsonResponse,
  methodNotAllowedResponse,
  invalidateEdgeCache
}) {
  // 24. Raw Visual Annotations Crossover API
  if (method === 'GET' && pathname === '/api/folders/crossover') {
    const folderId = searchParams.get('folder_id') || searchParams.get('id');
    if (!folderId || isNaN(Number(folderId))) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric folder_id is required'
      }, 400);
    }
    const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx });
    return jsonResponse({ success: true, crossover }, 200, refresh ? 0 : 30);
  }

  if (pathname.startsWith('/api/folders/') && (pathname.endsWith('/raw-visual-crossover') || pathname.endsWith('/crossover'))) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const parts = pathname.split('/').filter(Boolean);
    const folderId = parts[2];
    if (!folderId || isNaN(Number(folderId))) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric folder_id is required'
      }, 400);
    }
    const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx });
    return jsonResponse({ success: true, crossover }, 200, refresh ? 0 : 30);
  }

  // 25. Dedicated Folder Cluster Fleet Audit Dispatch API
  const folderAuditMatch = method === 'POST' && pathname.match(/^\/api\/folders\/(\d+)\/dispatch-audit$/);
  if (folderAuditMatch) {
    const folderId = folderAuditMatch[1];
    const [folderRow] = await sql`SELECT id, name, metadata FROM keyword_folders WHERE id = ${Number(folderId)} LIMIT 1;`;
    if (!folderRow) {
      return jsonResponse({ success: false, error: `Folder ${folderId} not found` }, 404);
    }
    const body = await request.json().catch(() => ({}));
    const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
    const crawlScopeInput = String(body.crawl_scope || folderMeta.crawl_scope || 'all_pins');
    const rawFolderMaxPins = body.max_pins ?? folderMeta.max_pins ?? '';
    const rawFolderMaxSerpPins = body.max_serp_pins ?? body.max_pins ?? folderMeta.max_serp_pins ?? folderMeta.max_pins ?? '';
    const maxPinsInput = rawFolderMaxPins !== undefined && rawFolderMaxPins !== null ? String(rawFolderMaxPins).trim() : '';
    const maxSerpPinsInput = rawFolderMaxSerpPins !== undefined && rawFolderMaxSerpPins !== null ? String(rawFolderMaxSerpPins).trim() : maxPinsInput;
    const maxCatalogInspectInput = String(body.max_catalog_inspect || folderMeta.max_catalog_inspect || '0');
    const enableSerpHarvestInput = String(body.enable_serp_harvest ?? folderMeta.enable_serp_harvest ?? 'true');

    const dRes = await dispatchGitHubWorkflow(env, {
      workflowFile: 'keyword-intelligence-velocity.yml',
      timeoutMs: 8000,
      inputs: {
        target_keyword: '',
        folder_id: String(folderId),
        crawl_scope: crawlScopeInput,
        max_pins: maxPinsInput,
        max_serp_pins: maxSerpPinsInput,
        max_catalog_inspect: maxCatalogInspectInput,
        enable_serp_harvest: enableSerpHarvestInput
      }
    });
    if (!dRes.ok) {
      return jsonResponse({ success: false, error: dRes.error }, dRes.status);
    }
    return jsonResponse({
      success: true,
      folder_id: Number(folderId),
      folder_name: folderRow.name,
      message: `20-Runner Parallel Fleet Audit dispatched successfully for folder "${folderRow.name}"!`
    });
  }

  // 26. Unified Campaign Folders CRUD API (/api/folders and /api/folders/*)
  const isFoldersCrudRoute = (
    pathname === '/api/folders' || pathname.startsWith('/api/folders/')
  ) && !pathname.includes('crossover') && !pathname.includes('dispatch-audit');

  if (isFoldersCrudRoute) {
    const parts = pathname.slice('/api/folders'.length).split('/').filter(Boolean);
    const firstSegIsNumeric = Boolean(parts[0] && /^\d+$/.test(parts[0]));
    const folderId = firstSegIsNumeric ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));

    // Sub-route: /api/folders/by-keyword (GET)
    if (parts.length === 1 && parts[0] === 'by-keyword') {
      if (method !== 'GET') return methodNotAllowedResponse('GET, OPTIONS');
      const keywordId = searchParams.get('keyword_id');
      if (!keywordId) return jsonResponse({ success: false, error: 'keyword_id is required' }, 400);
      const folders = await getFoldersForKeyword(sql, keywordId);
      return jsonResponse({ success: true, folders });
    }

    // Sub-route: /api/folders/items (POST / DELETE without path :id)
    if (parts.length === 1 && parts[0] === 'items') {
      if (method === 'POST') {
        await invalidateEdgeCache('keywords');
        await invalidateEdgeCache('folders');
        const body = await request.json().catch(() => ({}));
        const itemFolderId = body.folder_id || searchParams.get('folder_id');
        if (!itemFolderId) return jsonResponse({ success: false, error: 'folder_id is required' }, 400);
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, itemFolderId, body.keyword_ids);
          invalidateFolderCache(itemFolderId);
          return jsonResponse({ success: true, ...result });
        }
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ success: false, error: 'keyword_id or keyword_ids is required' }, 400);
        const item = await addKeywordToFolder(sql, itemFolderId, keywordId, body.notes || '');
        invalidateFolderCache(itemFolderId);
        return jsonResponse({ success: true, item });
      }
      if (method === 'DELETE') {
        await invalidateEdgeCache('keywords');
        await invalidateEdgeCache('folders');
        let itemFolderId = searchParams.get('folder_id');
        let keywordId = searchParams.get('keyword_id');
        try {
          const body = await request.json();
          itemFolderId = itemFolderId || body.folder_id;
          keywordId = keywordId || body.keyword_id;
        } catch (_) {}
        if (!itemFolderId || !keywordId) return jsonResponse({ success: false, error: 'folder_id and keyword_id are required' }, 400);
        const deleted = await removeKeywordFromFolder(sql, itemFolderId, keywordId);
        invalidateFolderCache(itemFolderId);
        return jsonResponse({ success: true, deleted });
      }
      return jsonResponse({ success: false, error: 'Method not allowed on /items' }, 405);
    }

    // A0. Sub-route: /api/folders/:id/prune-pins (POST)
    if (parts.length >= 2 && parts[1] === 'prune-pins') {
      // [INVARIANT: PRUNE-TOMBSTONE-AND-EVICT] Pruning tombstones to keyword_ignored_pins
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      if (method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
      const body = await request.json().catch(() => ({}));
      const {
        dry_run,
        dryRun,
        keyword_ids,
        keywordIds,
        scope,
        min_folder_age_days,
        minFolderAgeDays,
        min_pin_age_days,
        minPinAgeDays,
        max_saves,
        maxSaves,
        max_repins,
        maxRepins
      } = body;
      const result = await pruneFolderPins(sql, folderId, {
        dry_run,
        dryRun,
        keyword_ids,
        keywordIds,
        scope,
        min_folder_age_days,
        minFolderAgeDays,
        min_pin_age_days,
        minPinAgeDays,
        max_saves,
        maxSaves,
        max_repins,
        maxRepins
      }, { env, ctx });
      const isDry = dry_run !== undefined ? Boolean(dry_run) : Boolean(dryRun);
      if (!isDry && typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache('folders').catch(() => {});
        await invalidateEdgeCache('keywords').catch(() => {});
      }
      return jsonResponse(result);
    }

    // A. Sub-route: /api/folders/:id/creators
    if (parts.length >= 2 && parts[1] === 'creators') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);

      // GET /api/folders/:id/creators -> listFolderCreators(sql, folderId) with auto-discovery
      if (method === 'GET' && parts.length === 2) {
        const withDiscovery = searchParams.get('discovery') !== 'false';
        const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
        const vaultScope = searchParams.get('vault_scope') || 'high_signal';

        let payload;
        if (withDiscovery) {
          const discoveryData = await listFolderCreatorsWithDiscovery(sql, folderId, { vaultScope });
          payload = {
            success: true,
            folder_id: folderId,
            creators: discoveryData.all_creators,
            linked_creators: discoveryData.linked_creators,
            vault_scope: vaultScope,
            totals: discoveryData.totals
          };
        } else {
          const creators = await listFolderCreators(sql, folderId);
          payload = { success: true, creators, folder_id: folderId, vault_scope: vaultScope };
        }

        return jsonResponse(payload, 200, refresh ? 0 : 30);
      }

      // POST /api/folders/:id/creators/bulk-pulse-track -> bulkPulseTrackFolderCreators(sql, folderId, body, { env, ctx })
      if (method === 'POST' && parts.length === 3 && parts[2] === 'bulk-pulse-track') {
        const body = await request.json().catch(() => ({}));
        const result = await bulkPulseTrackFolderCreators(sql, folderId, body, { env, ctx });
        return jsonResponse(result, 200);
      }

      // POST /api/folders/:id/creators -> linkCreatorToFolder or toggleFolderCreatorTracking fallback
      if (method === 'POST' && parts.length === 2) {
        const body = await request.json().catch(() => ({}));
        const numericCid = Number(body.competitor_id || body.creator_id || body.id);
        if (Number.isFinite(numericCid) && numericCid > 0) {
          const linked = await linkCreatorToFolder(sql, folderId, numericCid);
          invalidateFolderCache(folderId);
          return jsonResponse({ success: true, linked, folder_id: folderId });
        }
        const rawUser = String(body.username || body.competitor_id || body.creator_id || body.id || '');
        const cleanUsername = rawUser.replace(/^serp_/, '').trim().toLowerCase().replace(/^@/, '');
        if (cleanUsername) {
          const result = await toggleFolderCreatorTracking(sql, folderId, cleanUsername);
          invalidateFolderCache(folderId);
          return jsonResponse({ success: true, linked: result.is_tracked, folder_id: folderId, ...result });
        }
        return jsonResponse({ success: false, error: 'Valid competitor_id or username is required' }, 400);
      }

      // DELETE /api/folders/:id/creators/:cid OR DELETE /api/folders/:id/creators (with body/query)
      if (method === 'DELETE' && (parts.length === 2 || parts.length === 3)) {
        let competitorId = null;
        let rawUser = '';
        if (parts.length === 3) {
          const segment = parts[2];
          const num = Number(segment);
          if (Number.isFinite(num) && num > 0) {
            competitorId = num;
          } else {
            rawUser = segment;
          }
        } else if (parts.length === 2) {
          const body = await request.json().catch(() => ({}));
          const rawId = body.competitor_id || body.creator_id || body.id || searchParams.get('competitor_id') || searchParams.get('cid');
          const num = Number(rawId);
          if (Number.isFinite(num) && num > 0) {
            competitorId = num;
          } else {
            rawUser = body.username || rawId || searchParams.get('username') || '';
          }
        }

        if (!competitorId && rawUser) {
          const cleanUsername = String(rawUser).replace(/^serp_/, '').trim().toLowerCase().replace(/^@/, '');
          if (cleanUsername) {
            const [existing] = await sql`
              SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;
            `;
            if (existing?.id) {
              competitorId = existing.id;
            }
          }
        }

        if (!competitorId) {
          return jsonResponse({ success: false, error: 'Valid creator ID or username is required' }, 400);
        }
        const unlinked = await unlinkCreatorFromFolder(sql, folderId, competitorId);
        invalidateFolderCache(folderId);
        return jsonResponse({ success: true, unlinked, folder_id: folderId });
      }

      return jsonResponse({ success: false, error: 'Method not allowed on /creators' }, 405);
    }

    // B. Sub-route: /api/folders/:id/domains
    if (parts.length >= 2 && parts[1] === 'domains') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);

      // GET /api/folders/:id/domains -> listFolderPinnedDomains(sql, folderId)
      if (method === 'GET' && parts.length === 2) {
        const domains = await listFolderPinnedDomains(sql, folderId);
        return jsonResponse({ success: true, domains, pinned_domains: domains, folder_id: folderId });
      }

      // POST /api/folders/:id/domains -> pinDomainToFolder(sql, folderId, domain, notes)
      if (method === 'POST' && parts.length === 2) {
        const body = await request.json().catch(() => ({}));
        const domain = body.domain;
        if (!domain) {
          return jsonResponse({ success: false, error: 'domain is required' }, 400);
        }
        const pinned = await pinDomainToFolder(sql, folderId, domain, body.notes || '');
        return jsonResponse({ success: true, pinned, folder_id: folderId });
      }

      // DELETE /api/folders/:id/domains/:domain -> unpinDomainFromFolder(sql, folderId, domain)
      if (method === 'DELETE' && parts.length >= 3) {
        const domain = decodeURIComponent(parts.slice(2).join('/'));
        if (!domain) {
          return jsonResponse({ success: false, error: 'domain is required' }, 400);
        }
        const unpinned = await unpinDomainFromFolder(sql, folderId, domain);
        return jsonResponse({ success: true, unpinned, folder_id: folderId });
      }

      return jsonResponse({ success: false, error: 'Method not allowed on /domains' }, 405);
    }

    // C. Sub-route: /api/folders/:id/items
    if (parts.length >= 2 && parts[1] === 'items') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      if (method === 'POST') {
        await invalidateEdgeCache('keywords');
        await invalidateEdgeCache('folders');
        const body = await request.json().catch(() => ({}));
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, folderId, body.keyword_ids);
          invalidateFolderCache(folderId);
          return jsonResponse({ success: true, ...result });
        }
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id or keyword_ids is required' }, 400);
        const item = await addKeywordToFolder(sql, folderId, keywordId, body.notes || '');
        invalidateFolderCache(folderId);
        return jsonResponse({ success: true, item });
      }
      if (method === 'DELETE') {
        await invalidateEdgeCache('keywords');
        await invalidateEdgeCache('folders');
        let keywordId = parts[2] || searchParams.get('keyword_id');
        let body = {};
        try {
          body = await request.json();
          keywordId = keywordId || body.keyword_id;
        } catch (_) {}
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const deleted = await removeKeywordFromFolder(sql, folderId, keywordId);
        invalidateFolderCache(folderId);
        return jsonResponse({ success: true, deleted });
      }
      return jsonResponse({ success: false, error: 'Method not allowed on /items' }, 405);
    }

    const projectId = searchParams.get('project_id') || 'default';

    if (method === 'GET') {
      const isLite = searchParams.get('lite') === 'true';
      const hasExplicitIdQuery = Boolean(searchParams.get('id') || searchParams.get('folder_id'));

      if (folderId && (parts.length === 1 || (parts.length === 0 && hasExplicitIdQuery))) {
        // [INVARIANT: FOLDER-SSOT-LOOKUP] Serve authoritative live data from Central Hub getFolder(sql, folderId) (< 5ms)
        let folder = null;
        if (sql) {
          try {
            folder = await getFolder(sql, folderId);
          } catch (_) {}
        }
        if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
        return jsonResponse({ success: true, folder }, 200, 15);
      }

      try {
        const folders = isLite
          ? await listFoldersLite(sql, { projectId })
          : await listFolders(sql, { projectId });
        return jsonResponse({
          success: true,
          folders: Array.isArray(folders) ? folders : []
        }, 200, 10);
      } catch (err) {
        console.warn('[Folders Fallback] listFolders failed:', err.message);
        return jsonResponse({
          success: false,
          error: 'DB_UNAVAILABLE',
          degraded: true,
          message: 'Folders hub temporarily unavailable while database is waking up. Retry in 3 seconds.'
        }, 503, 0, { 'Retry-After': '3' });
      }
    }

    if (method === 'POST' && parts.length === 0) {
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache('folders');
      const body = await request.json().catch(() => ({}));
      if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
        return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
      }
      const created = await createFolder(sql, body);
      return jsonResponse({ success: true, folder: created });
    }

    if ((method === 'PUT' || method === 'PATCH') && (parts.length === 0 || (parts.length === 1 && firstSegIsNumeric))) {
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache('folders');
      const body = await request.json().catch(() => ({}));
      const targetFolderId = firstSegIsNumeric ? Number(parts[0]) : (body.id || body.folder_id || searchParams.get('id') || searchParams.get('folder_id'));
      if (!targetFolderId) return jsonResponse({ success: false, error: 'Folder id is required' }, 400);
      const updated = await updateFolder(sql, targetFolderId, body);
      invalidateFolderCache(targetFolderId);
      return jsonResponse({ success: true, folder: updated });
    }

    // [INVARIANT: GUARD-ACCIDENTAL-FOLDER-DELETION] Strictly guard folder deletion:
    // Allowed only on DELETE /api/folders/:id (numeric) or DELETE /api/folders?id=:id (parts.length === 0). Sub-route unpin/unlink operations MUST NEVER delete the folder!
    if (method === 'DELETE' && ((parts.length === 1 && firstSegIsNumeric) || parts.length === 0)) {
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache('folders');
      let delFolderId = firstSegIsNumeric ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));
      if (!delFolderId && parts.length === 0) {
        try {
          const body = await request.json();
          delFolderId = body.id || body.folder_id;
        } catch (_) {}
      }
      if (!delFolderId) return jsonResponse({ success: false, error: 'Folder id is required' }, 400);
      const deleted = await deleteFolder(sql, delFolderId);
      invalidateFolderCache(delFolderId);
      return jsonResponse({ success: true, deleted });
    }
  }

  return null;
}
