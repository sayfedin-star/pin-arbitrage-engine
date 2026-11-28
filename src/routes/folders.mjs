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
  batchRemoveKeywordsFromFolder,
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
import { addKeyword } from '../modules/keywords/service.mjs';
import { invalidateGlobalPulseCache } from '../modules/pulse/service.mjs';
import {
  DEFAULT_WORKSPACE_ID,
  assertFolderInWorkspace,
  getWorkspaceSettings,
  addCampaignTrackedPins,
  getCampaignTrackedPinsSummary,
  syncCampaignTopNSerpPins,
  removeCampaignTrackedPin,
  listCampaignPinGraphSeeds,
  addCampaignPinGraphSeeds,
  removeCampaignPinGraphSeed
} from '../modules/workspaces/service.mjs';

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
  workspaceId = DEFAULT_WORKSPACE_ID,
  jsonResponse,
  methodNotAllowedResponse,
  buildCanonicalCacheKey = null,
  invalidateEdgeCache
}) {
  const invalidateFolderCrossCaches = async (fid = null, { includeCreators = false } = {}) => {
    invalidateFolderCache(fid, workspaceId);
    if (typeof invalidateEdgeCache === 'function') {
      await Promise.all([
        invalidateEdgeCache('keywords'),
        invalidateEdgeCache('folders'),
        invalidateEdgeCache('domains:leaderboard'),
        invalidateEdgeCache('domains:dossier'),
        ...(includeCreators ? [invalidateEdgeCache('creators')] : [])
      ].map((p) => Promise.resolve(p).catch(() => {})));
    }
    await invalidateGlobalPulseCache(env, ctx).catch(() => {});
  };

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
    await assertFolderInWorkspace(sql, Number(folderId), workspaceId);
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx, workspaceId });
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
    await assertFolderInWorkspace(sql, Number(folderId), workspaceId);
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx, workspaceId });
    return jsonResponse({ success: true, crossover }, 200, refresh ? 0 : 30);
  }

  // 25. Dedicated Folder Cluster Fleet Audit Dispatch API
  const folderAuditMatch = method === 'POST' && pathname.match(/^\/api\/folders\/(\d+)\/dispatch-audit$/);
  if (folderAuditMatch) {
    const folderId = folderAuditMatch[1];
    const folderRow = await assertFolderInWorkspace(sql, Number(folderId), workspaceId);
    const body = await request.json().catch(() => ({}));
    const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
    const isCrawlingPaused = Boolean(
      folderMeta.block_fleet ||
      folderMeta.block_gha_fleet ||
      folderMeta.pause_crawlers ||
      folderMeta.is_crawler_paused ||
      ['paused', 'archived'].includes(String(folderMeta.status || '').toLowerCase())
    );
    if (isCrawlingPaused) {
      return jsonResponse({
        success: false,
        error: 'FOLDER_CRAWLING_PAUSED',
        message: 'Crawling is paused or fleet ingestion is blocked for this campaign. Update Settings & Pruning to resume.'
      }, 409);
    }
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
      const folders = await getFoldersForKeyword(sql, keywordId, { workspaceId });
      return jsonResponse({ success: true, folders });
    }

    // Sub-route: /api/folders/items (POST / DELETE without path :id)
    if (parts.length === 1 && parts[0] === 'items') {
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const itemFolderId = body.folder_id || searchParams.get('folder_id');
        if (!itemFolderId) return jsonResponse({ success: false, error: 'folder_id is required' }, 400);
        await assertFolderInWorkspace(sql, itemFolderId, workspaceId);
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, itemFolderId, body.keyword_ids);
          await invalidateFolderCrossCaches(itemFolderId);
          return jsonResponse({ success: true, ...result });
        }
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id or keyword_ids is required' }, 400);
        const item = await addKeywordToFolder(sql, itemFolderId, keywordId, body.notes || '');
        await invalidateFolderCrossCaches(itemFolderId);
        return jsonResponse({ success: true, item });
      }
      if (method === 'DELETE') {
        let itemFolderId = searchParams.get('folder_id');
        let keywordId = searchParams.get('keyword_id');
        let keywordIds = null;
        const rawQueryIds = typeof searchParams.getAll === 'function' ? searchParams.getAll('keyword_ids') : [];
        const singleQueryIds = rawQueryIds.length === 0 ? searchParams.get('keyword_ids') : null;
        const combinedQueryIds = rawQueryIds.length > 0 ? rawQueryIds : (singleQueryIds ? [singleQueryIds] : []);
        if (combinedQueryIds.length > 0) {
          const parsedQueryIds = combinedQueryIds
            .flatMap((v) => String(v || '').split(','))
            .map((v) => Number(v.trim()))
            .filter((n) => Number.isInteger(n) && n > 0);
          if (parsedQueryIds.length > 0) {
            keywordIds = parsedQueryIds;
          }
        }
        try {
          const body = await request.json();
          itemFolderId = itemFolderId || body.folder_id;
          keywordId = keywordId || body.keyword_id;
          if (Array.isArray(body.keyword_ids) && (body.keyword_ids.length > 0 || keywordIds === null)) {
            keywordIds = body.keyword_ids;
          }
        } catch (_) {}
        if (!itemFolderId) return jsonResponse({ success: false, error: 'folder_id is required' }, 400);
        await assertFolderInWorkspace(sql, itemFolderId, workspaceId);
        if (Array.isArray(keywordIds)) {
          const result = await batchRemoveKeywordsFromFolder(sql, itemFolderId, keywordIds);
          await invalidateFolderCrossCaches(itemFolderId);
          return jsonResponse({ success: true, ...result });
        }
        if (!keywordId) return jsonResponse({ error: 'folder_id and keyword_id (or keyword_ids) are required' }, 400);
        const deleted = await removeKeywordFromFolder(sql, itemFolderId, keywordId);
        await invalidateFolderCrossCaches(itemFolderId);
        return jsonResponse({ success: true, deleted });
      }
      return jsonResponse({ success: false, error: 'Method not allowed on /items' }, 405);
    }

    // A00. Sub-route: /api/folders/:id/tracked-pins (Unified 4-source V4 daily tracking)
    if (parts.length >= 2 && parts[1] === 'tracked-pins') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      if (parts.length === 3 && parts[2] === 'sync-top-n') {
        if (method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed on /tracked-pins/sync-top-n' }, 405);
        const body = await request.json().catch(() => ({}));
        const result = await syncCampaignTopNSerpPins(sql, {
          folderId,
          workspaceId,
          topN: body?.top_n ?? body?.serp_top_n ?? null
        });
        await invalidateFolderCrossCaches(folderId);
        return jsonResponse({ success: true, ...result });
      }
      if (method === 'GET') {
        const sourceType = searchParams.get('source_type') || searchParams.get('source') || null;
        const limit = Number(searchParams.get('limit') || 250);
        const offset = Number(searchParams.get('offset') || 0);
        const summary = await getCampaignTrackedPinsSummary(sql, { folderId, workspaceId, sourceType, limit, offset });
        return jsonResponse({
          success: true,
          folder_id: summary.folder_id,
          workspace_id: summary.workspace_id,
          serp_top_n: summary.serp_top_n,
          total: summary.total,
          source_counts: summary.source_counts,
          tracked_pins: summary.items,
          items: summary.items
        });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids : (body.pin_id ? [body.pin_id] : []);
        const result = await addCampaignTrackedPins(sql, {
          folderId,
          workspaceId,
          pinIds,
          sourceType: body.source_type || body.source || 'newborn',
          sourceRef: body.source_ref || ''
        });
        await invalidateFolderCrossCaches(folderId);
        if (typeof invalidateEdgeCache === 'function') {
          const effectiveWid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;
          await Promise.all(
            pinIds.slice(0, 100).map((pid) => {
              const cleanPid = String(pid || '').trim();
              if (!cleanPid) return Promise.resolve();
              return Promise.all([
                Promise.resolve(invalidateEdgeCache(`pin:dossier?pin_id=${cleanPid}`)).catch(() => {}),
                typeof buildCanonicalCacheKey === 'function'
                  ? Promise.resolve(invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: cleanPid, workspace_id: effectiveWid }))).catch(() => {})
                  : Promise.resolve()
              ]);
            })
          );
        }
        return jsonResponse({ success: true, ...result });
      }
      if (method === 'DELETE') {
        let pinId = parts[2] || searchParams.get('pin_id');
        let sourceType = searchParams.get('source_type') || searchParams.get('source') || null;
        if (!pinId) {
          const body = await request.json().catch(() => ({}));
          pinId = body.pin_id || '';
          sourceType = sourceType || body.source_type || body.source || null;
        }
        if (!pinId) return jsonResponse({ success: false, error: 'pin_id is required' }, 400);
        const result = await removeCampaignTrackedPin(sql, { folderId, workspaceId, pinId, sourceType });
        await invalidateFolderCrossCaches(folderId);
        if (typeof invalidateEdgeCache === 'function') {
          const cleanPid = String(pinId || '').trim();
          const effectiveWid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;
          await Promise.all([
            Promise.resolve(invalidateEdgeCache(`pin:dossier?pin_id=${cleanPid}`)).catch(() => {}),
            typeof buildCanonicalCacheKey === 'function'
              ? Promise.resolve(invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: cleanPid, workspace_id: effectiveWid }))).catch(() => {})
              : Promise.resolve()
          ]);
        }
        return jsonResponse({ success: true, ...result });
      }
      return jsonResponse({ success: false, error: 'Method not allowed on /tracked-pins' }, 405);
    }

    // A00b. Sub-route: /api/folders/:id/pin-graph-seeds (Related Pins seed queue)
    if (parts.length >= 2 && parts[1] === 'pin-graph-seeds') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      if (method === 'GET') {
        const status = searchParams.get('status') || null;
        const seeds = await listCampaignPinGraphSeeds(sql, { folderId, workspaceId, status });
        return jsonResponse({ success: true, folder_id: Number(folderId), workspace_id: workspaceId, seeds });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pinIds = Array.isArray(body.pin_ids)
          ? body.pin_ids
          : (Array.isArray(body.seed_pin_ids) ? body.seed_pin_ids : (body.pin_id || body.seed_pin_id ? [body.pin_id || body.seed_pin_id] : []));
        const result = await addCampaignPinGraphSeeds(sql, {
          folderId,
          workspaceId,
          pinIds,
          sourceType: body.source_type || body.source || 'manual',
          depth: body.depth ?? 1
        });
        invalidateFolderCache(folderId, workspaceId);
        return jsonResponse({ success: true, ...result });
      }
      if (method === 'DELETE') {
        let pinId = parts[2] || searchParams.get('pin_id') || searchParams.get('seed_pin_id');
        if (!pinId) {
          const body = await request.json().catch(() => ({}));
          pinId = body.pin_id || body.seed_pin_id || '';
        }
        if (!pinId) return jsonResponse({ success: false, error: 'pin_id is required' }, 400);
        const result = await removeCampaignPinGraphSeed(sql, { folderId, workspaceId, pinId });
        invalidateFolderCache(folderId, workspaceId);
        return jsonResponse({ success: true, ...result });
      }
      return jsonResponse({ success: false, error: 'Method not allowed on /pin-graph-seeds' }, 405);
    }

    // A0. Sub-route: /api/folders/:id/prune-pins (POST)
    if (parts.length >= 2 && parts[1] === 'prune-pins') {
      // [INVARIANT: PRUNE-TOMBSTONE-AND-EVICT] Pruning tombstones to keyword_ignored_pins
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      if (method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
      await assertFolderInWorkspace(sql, folderId, workspaceId);
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
        maxRepins,
        skip_rising_velocity,
        skipRisingVelocity
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
        maxRepins,
        skip_rising_velocity,
        skipRisingVelocity
      }, { env, ctx, workspaceId });
      if (!result?.dry_run) {
        await invalidateFolderCrossCaches(folderId);
      }
      return jsonResponse(result);
    }

    // A. Sub-route: /api/folders/:id/creators
    if (parts.length >= 2 && parts[1] === 'creators') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      const folderRow = await assertFolderInWorkspace(sql, folderId, workspaceId);

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
            vault_scope: vaultScope,
            totals: discoveryData.totals
          };
        } else {
          const creators = await listFolderCreators(sql, folderId);
          payload = { success: true, creators, folder_id: folderId, vault_scope: vaultScope };
        }

        return jsonResponse(payload, 200, refresh ? 0 : 30);
      }

      // POST /api/folders/:id/creators/bulk-pulse-track -> bulkPulseTrackFolderCreators(sql, folderId, body, { env, ctx, workspaceId })
      if (method === 'POST' && parts.length === 3 && parts[2] === 'bulk-pulse-track') {
        const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
        if (
          folderMeta.pause_competitors ||
          folderMeta.block_fleet ||
          folderMeta.block_gha_fleet ||
          ['paused', 'archived'].includes(String(folderMeta.status || '').toLowerCase())
        ) {
          return jsonResponse({
            success: false,
            error: 'FOLDER_COMPETITORS_PAUSED',
            message: 'Competitor crawling is paused or fleet ingestion is blocked for this campaign.'
          }, 409);
        }
        const body = await request.json().catch(() => ({}));
        if (body && body.cookie !== undefined && String(body.cookie).trim() !== '') {
          return jsonResponse({
            ok: false,
            error: 'CLIENT_COOKIE_FORBIDDEN',
            message: 'Client-supplied cookies are rejected; workspace cookies are resolved server-side.'
          }, 400);
        }
        const result = await bulkPulseTrackFolderCreators(sql, folderId, body, { env, ctx, workspaceId });
        await invalidateFolderCrossCaches(folderId, { includeCreators: true });
        return jsonResponse(result, 200);
      }

      // POST /api/folders/:id/creators/bulk-remove -> unlink selected creators ONLY from this folder
      if (method === 'POST' && parts.length === 3 && parts[2] === 'bulk-remove') {
        const body = await request.json().catch(() => ({}));
        const rawIds = Array.isArray(body.competitor_ids) ? body.competitor_ids : (Array.isArray(body.ids) ? body.ids : []);
        const rawUsernames = Array.isArray(body.usernames) ? body.usernames : [];

        const numericIds = new Set();
        const candidateUsernames = new Set();
        let skippedCount = 0;

        for (const item of rawIds) {
          const str = String(item ?? '').trim();
          if (!str) continue;
          if (/^\d+$/.test(str)) {
            numericIds.add(Number(str));
          } else {
            const clean = str.replace(/^serp_/, '').replace(/^@+/, '').trim().toLowerCase();
            if (clean) candidateUsernames.add(clean);
            else skippedCount++;
          }
        }
        for (const u of rawUsernames) {
          const clean = String(u ?? '').replace(/^serp_/, '').replace(/^@+/, '').trim().toLowerCase();
          if (clean) candidateUsernames.add(clean);
        }

        if (candidateUsernames.size > 0) {
          const userArr = Array.from(candidateUsernames);
          const matchedRows = await sql`
            SELECT id, LOWER(username) AS uname
            FROM competitor_profiles
            WHERE LOWER(username) = ANY(${userArr}::text[]);
          `;
          const matchedSet = new Set();
          for (const r of (matchedRows || [])) {
            if (r?.id) numericIds.add(Number(r.id));
            if (r?.uname) matchedSet.add(r.uname);
          }
          for (const u of candidateUsernames) {
            if (!matchedSet.has(u)) skippedCount++;
          }
        }

        const idsToUnlink = Array.from(numericIds).filter((n) => Number.isFinite(n) && n > 0);
        let removedCount = 0;
        if (idsToUnlink.length > 0) {
          const deleted = await sql`
            DELETE FROM folder_competitor_items
            WHERE folder_id = ${Number(folderId)}
              AND competitor_id = ANY(${idsToUnlink}::int[])
            RETURNING competitor_id;
          `;
          removedCount = Array.isArray(deleted) ? deleted.length : 0;
        }

        await invalidateFolderCrossCaches(folderId, { includeCreators: true });
        return jsonResponse({
          success: true,
          folder_id: Number(folderId),
          removed_count: removedCount,
          skipped_count: skippedCount
        }, 200);
      }

      // POST /api/folders/:id/creators -> linkCreatorToFolder or toggleFolderCreatorTracking fallback
      if (method === 'POST' && parts.length === 2) {
        const body = await request.json().catch(() => ({}));
        const numericCid = Number(body.competitor_id || body.creator_id || body.id);
        if (Number.isFinite(numericCid) && numericCid > 0) {
          const linked = await linkCreatorToFolder(sql, folderId, numericCid);
          await invalidateFolderCrossCaches(folderId, { includeCreators: true });
          return jsonResponse({ success: true, linked, folder_id: folderId });
        }
        const rawUser = String(body.username || body.competitor_id || body.creator_id || body.id || '');
        const cleanUsername = rawUser.replace(/^serp_/, '').trim().toLowerCase().replace(/^@/, '');
        if (cleanUsername) {
          const linkOnly = String(body.action || '').toLowerCase() === 'link';
          const result = await toggleFolderCreatorTracking(sql, folderId, cleanUsername, { linkOnly });
          await invalidateFolderCrossCaches(folderId, { includeCreators: true });
          return jsonResponse({ success: true, linked: result.is_tracked, folder_id: folderId, ...result });
        }
        return jsonResponse({ success: false, error: 'Valid competitor_id or username is required' }, 400);
      }

      // DELETE /api/folders/:id/creators/:cid OR DELETE /api/folders/:id/creators (with query/body)
      if (method === 'DELETE' && (parts.length === 2 || parts.length === 3)) {
        let competitorId = null;
        let rawUser = '';
        if (parts.length === 3) {
          const segment = decodeURIComponent(parts[2]);
          const num = Number(segment);
          if (Number.isFinite(num) && num > 0 && /^\d+$/.test(segment.trim())) {
            competitorId = num;
          } else {
            rawUser = segment;
          }
        } else if (parts.length === 2) {
          const body = await request.json().catch(() => ({}));
          const rawId = searchParams.get('competitor_id') || searchParams.get('cid') || body.competitor_id || body.creator_id || body.id;
          const rawIdStr = String(rawId ?? '').trim();
          if (rawIdStr && /^\d+$/.test(rawIdStr)) {
            competitorId = Number(rawIdStr);
          } else {
            rawUser = searchParams.get('username') || body.username || rawIdStr || '';
          }
        }

        const cleanUsername = String(rawUser || '').replace(/^serp_/, '').trim().toLowerCase().replace(/^@/, '');
        if (!competitorId && cleanUsername) {
          const [existing] = await sql`
            SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1;
          `;
          if (existing?.id) {
            competitorId = existing.id;
          } else {
            return jsonResponse({ success: true, unlinked: false, skipped: true, folder_id: folderId });
          }
        }

        if (!competitorId) {
          return jsonResponse({ success: false, error: 'Valid creator ID or username is required' }, 400);
        }
        const unlinked = await unlinkCreatorFromFolder(sql, folderId, competitorId);
        await invalidateFolderCrossCaches(folderId, { includeCreators: true });
        return jsonResponse({ success: true, unlinked, folder_id: folderId });
      }

      return jsonResponse({ success: false, error: 'Method not allowed on /creators' }, 405);
    }

    // B. Sub-route: /api/folders/:id/domains
    if (parts.length >= 2 && parts[1] === 'domains') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      await assertFolderInWorkspace(sql, folderId, workspaceId);

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
        await invalidateFolderCrossCaches(folderId);
        return jsonResponse({ success: true, pinned, folder_id: folderId });
      }

      // DELETE /api/folders/:id/domains/:domain -> unpinDomainFromFolder(sql, folderId, domain)
      if (method === 'DELETE' && parts.length >= 3) {
        const domain = decodeURIComponent(parts.slice(2).join('/'));
        if (!domain) {
          return jsonResponse({ success: false, error: 'domain is required' }, 400);
        }
        const unpinned = await unpinDomainFromFolder(sql, folderId, domain);
        await invalidateFolderCrossCaches(folderId);
        return jsonResponse({ success: true, unpinned, folder_id: folderId });
      }

      return jsonResponse({ success: false, error: 'Method not allowed on /domains' }, 405);
    }

    // C. Sub-route: /api/folders/:id/items
    if (parts.length >= 2 && parts[1] === 'items') {
      if (!folderId) return jsonResponse({ success: false, error: 'Valid folder ID is required' }, 400);
      await assertFolderInWorkspace(sql, folderId, workspaceId);
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (Array.isArray(body.keywords) && body.keywords.length > 0) {
          const cleanTerms = Array.from(new Set(
            body.keywords
              .map((k) => String(typeof k === 'string' ? k : (k?.keyword || '')).trim())
              .filter(Boolean)
          ));
          if (cleanTerms.length === 0) {
            return jsonResponse({ success: false, error: 'keywords must contain at least one non-empty keyword' }, 400);
          }
          const createdIds = [];
          for (const term of cleanTerms) {
            const row = await addKeyword(sql, { keyword: term });
            if (row?.id) createdIds.push(Number(row.id));
          }
          const result = createdIds.length > 0
            ? await batchAddKeywordsToFolder(sql, folderId, createdIds)
            : { added: 0 };
          await invalidateFolderCrossCaches(folderId);
          return jsonResponse({
            success: true,
            keyword_ids: createdIds,
            added_count: createdIds.length,
            ...result
          });
        }
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, folderId, body.keyword_ids);
          await invalidateFolderCrossCaches(folderId);
          return jsonResponse({ success: true, ...result });
        }
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id, keyword_ids, or keywords is required' }, 400);
        const item = await addKeywordToFolder(sql, folderId, keywordId, body.notes || '');
        await invalidateFolderCrossCaches(folderId);
        return jsonResponse({ success: true, item });
      }
      if (method === 'DELETE') {
        let keywordId = parts[2] || searchParams.get('keyword_id');
        let body = {};
        try {
          body = await request.json();
          keywordId = keywordId || body.keyword_id;
        } catch (_) {}
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const deleted = await removeKeywordFromFolder(sql, folderId, keywordId);
        await invalidateFolderCrossCaches(folderId);
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
        if (!sql) {
          return jsonResponse({
            success: false,
            error: 'DB_UNAVAILABLE',
            degraded: true,
            message: 'Campaign folder temporarily unavailable while database is waking up. Retry in 3 seconds.'
          }, 503, 0, { 'Retry-After': '3' });
        }
        let folder = null;
        try {
          folder = await getFolder(sql, folderId, { workspaceId });
        } catch (err) {
          console.warn('[Folders Fallback] getFolder failed:', err.message);
          return jsonResponse({
            success: false,
            error: 'DB_UNAVAILABLE',
            degraded: true,
            message: 'Campaign folder temporarily unavailable while database is waking up. Retry in 3 seconds.'
          }, 503, 0, { 'Retry-After': '3' });
        }
        const refreshFolder = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
        if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
        return jsonResponse({ success: true, folder }, 200, refreshFolder ? 0 : 15);
      }

      try {
        const folders = isLite
          ? await listFoldersLite(sql, { projectId, workspaceId })
          : await listFolders(sql, { projectId, workspaceId });
        return jsonResponse({
          success: true,
          workspace_id: workspaceId,
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
      const body = await request.json().catch(() => ({}));
      if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
        return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
      }
      let effectiveSerpTopN = body.serp_top_n;
      if (effectiveSerpTopN === undefined || effectiveSerpTopN === null || effectiveSerpTopN === '') {
        const wsSettings = await getWorkspaceSettings(sql, workspaceId).catch(() => null);
        if (wsSettings && Number.isFinite(Number(wsSettings.default_serp_top_n))) {
          effectiveSerpTopN = Math.min(100, Math.max(5, Math.round(Number(wsSettings.default_serp_top_n))));
        }
      }
      const created = await createFolder(sql, {
        ...body,
        ...(effectiveSerpTopN !== undefined ? { serp_top_n: effectiveSerpTopN } : {}),
        workspaceId
      });
      await invalidateFolderCrossCaches(created?.id || null);
      return jsonResponse({ success: true, folder: created });
    }

    if ((method === 'PUT' || method === 'PATCH') && (parts.length === 0 || (parts.length === 1 && firstSegIsNumeric))) {
      const body = await request.json().catch(() => ({}));
      const targetFolderId = firstSegIsNumeric ? Number(parts[0]) : (body.id || body.folder_id || searchParams.get('id') || searchParams.get('folder_id'));
      if (!targetFolderId) return jsonResponse({ success: false, error: 'Folder id is required' }, 400);
      await assertFolderInWorkspace(sql, targetFolderId, workspaceId);

      const updatePatch = { ...body, workspaceId };
      const wantsResetSerpTopN = body.reset_serp_top_n === true || body.serp_top_n === null;
      if (wantsResetSerpTopN) {
        const wsSettings = await getWorkspaceSettings(sql, workspaceId).catch(() => null);
        const wsTopN = Number.isFinite(Number(wsSettings?.default_serp_top_n))
          ? Math.min(100, Math.max(5, Math.round(Number(wsSettings.default_serp_top_n))))
          : 20;
        updatePatch.serp_top_n = wsTopN;
        updatePatch.metadata = {
          ...(normalizeFolderMetadata(body.metadata)),
          serp_top_n_inherited: true
        };
      } else if (body.serp_top_n !== undefined && body.serp_top_n !== '') {
        const baseMeta = normalizeFolderMetadata(body.metadata);
        if (baseMeta.serp_top_n_inherited === undefined) {
          updatePatch.metadata = { ...baseMeta, serp_top_n_inherited: false };
        }
      }

      if (body.reset_pin_graph_rules === true) {
        updatePatch.pin_graph_rules = {};
      }

      const updated = await updateFolder(sql, targetFolderId, updatePatch);
      if (!updated) {
        return jsonResponse({ success: false, error: 'Folder not found' }, 404);
      }
      await invalidateFolderCrossCaches(targetFolderId);
      return jsonResponse({ success: true, folder: updated });
    }

    // [INVARIANT: GUARD-ACCIDENTAL-FOLDER-DELETION] Strictly guard folder deletion:
    // Allowed only on DELETE /api/folders/:id (numeric) or DELETE /api/folders?id=:id (parts.length === 0). Sub-route unpin/unlink operations MUST NEVER delete the folder!
    if (method === 'DELETE' && ((parts.length === 1 && firstSegIsNumeric) || parts.length === 0)) {
      let delFolderId = firstSegIsNumeric ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));
      if (!delFolderId && parts.length === 0) {
        try {
          const body = await request.json();
          delFolderId = body.id || body.folder_id;
        } catch (_) {}
      }
      if (!delFolderId) return jsonResponse({ success: false, error: 'Folder id is required' }, 400);
      await assertFolderInWorkspace(sql, delFolderId, workspaceId);
      const deleted = await deleteFolder(sql, delFolderId, { workspaceId });
      await invalidateFolderCrossCaches(delFolderId);
      return jsonResponse({ success: true, deleted });
    }
  }

  return null;
}
