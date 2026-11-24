/**
 * src/routes/watchlist.mjs
 *
 * V4 Unified Workspace Watchlist API (`/api/watchlist` & `/api/watchlist/:id`).
 * Strictly isolated per active `workspaceId` with `Cache-Control: private, no-store` + `Vary: Cookie`.
 */

import {
  DEFAULT_WORKSPACE_ID,
  VALID_WATCHLIST_TYPES,
  VALID_CREATOR_TRACKING_MODES,
  assertFolderInWorkspace,
  listWatchlist,
  upsertWatchlistItem,
  updateWatchlistItem,
  removeWatchlistItem
} from '../modules/workspaces/service.mjs';

export function isWatchlistRoute(pathname) {
  return pathname === '/api/watchlist' || /^\/api\/watchlist\/\d+$/.test(pathname);
}

export async function handleWatchlistRoutes({
  pathname,
  method,
  request,
  searchParams,
  sql,
  workspaceId = DEFAULT_WORKSPACE_ID,
  jsonResponse,
  methodNotAllowedResponse,
  invalidateEdgeCache = null
}) {
  if (!isWatchlistRoute(pathname)) return null;

  if (!sql) {
    return jsonResponse({ success: false, error: 'Database unavailable' }, 503);
  }

  const bustRadarCaches = async () => {
    if (typeof invalidateEdgeCache === 'function') {
      await Promise.all([
        Promise.resolve(invalidateEdgeCache('creators')).catch(() => {}),
        Promise.resolve(invalidateEdgeCache('domains:leaderboard')).catch(() => {})
      ]);
    }
  };

  // GET/POST /api/watchlist
  if (pathname === '/api/watchlist') {
    if (method === 'GET') {
      try {
        const entityType = searchParams?.get('entity_type') || null;
        const limit = Number(searchParams?.get('limit') || 250);
        const offset = Number(searchParams?.get('offset') || 0);
        const result = await listWatchlist(sql, {
          workspaceId,
          entityType,
          limit,
          offset
        });
        return jsonResponse({
          success: true,
          workspace_id: workspaceId,
          valid_entity_types: VALID_WATCHLIST_TYPES,
          valid_creator_tracking_modes: VALID_CREATOR_TRACKING_MODES,
          ...result
        }, 200);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 500);
      }
    }

    if (method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const rawFolderId = body?.added_from_folder_id ?? body?.folder_id ?? null;
        if (rawFolderId !== null && rawFolderId !== undefined && String(rawFolderId).trim() !== '') {
          const parsedFolder = Number(rawFolderId);
          if (!Number.isInteger(parsedFolder) || parsedFolder <= 0) {
            return jsonResponse({ success: false, error: 'Valid positive integer folder_id is required' }, 400);
          }
          await assertFolderInWorkspace(sql, parsedFolder, workspaceId);
        }
        const item = await upsertWatchlistItem(sql, {
          workspaceId,
          entityType: body?.entity_type,
          entityKey: body?.entity_key ?? body?.username ?? body?.domain ?? body?.pin_id,
          creatorTrackingMode: body?.creator_tracking_mode ?? 'metrics_only',
          notes: body?.notes ?? '',
          addedFromFolderId: rawFolderId
        });
        await bustRadarCaches();
        return jsonResponse({ success: true, item }, 201);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 400);
      }
    }

    return methodNotAllowedResponse('GET, POST, OPTIONS');
  }

  // PATCH/DELETE /api/watchlist/:id
  const idMatch = pathname.match(/^\/api\/watchlist\/(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);
    if (method === 'PATCH') {
      try {
        const body = await request.json().catch(() => ({}));
        const item = await updateWatchlistItem(sql, {
          workspaceId,
          id,
          creatorTrackingMode: body?.creator_tracking_mode,
          notes: body?.notes
        });
        await bustRadarCaches();
        return jsonResponse({ success: true, item }, 200);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 400);
      }
    }

    if (method === 'DELETE') {
      try {
        const result = await removeWatchlistItem(sql, { workspaceId, id });
        await bustRadarCaches();
        return jsonResponse({ success: true, ...result }, 200);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 400);
      }
    }

    return methodNotAllowedResponse('PATCH, DELETE, OPTIONS');
  }

  return null;
}
