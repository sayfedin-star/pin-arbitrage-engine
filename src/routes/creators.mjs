/**
 * Creator & Competitor Intelligence Sub-Router
 *
 * Canonical `/api/creators/*` route table (`apiRoutesPlugin` rewrites `/api/competitors/*` -> `/api/creators/*`
 * via a Fastify `onRequest` hook, and `handleCreatorsRoutes` also normalizes direct programmatic calls).
 *
 * [INVARIANT: LITERAL-MATCHES-FIRST] All subpaths (/api/creators/sync, /boards, etc.)
 * are evaluated strictly with literal equality before the root resource /api/creators.
 */

import {
  getCompetitorsOverview,
  listCompetitors,
  trackCompetitor,
  syncCompetitorProfile,
  deleteCompetitorSnapshot,
  updateCompetitorStatus,
  getCompetitorRules,
  saveCompetitorRules,
  getCompetitorSeeds,
  addCompetitorSeeds,
  deleteCompetitorSeed,
  getQualificationRules,
  updateQualificationRules,
  deleteCompetitor,
  sanitizeStoredCeilingDelta,
  formatMetric
} from '../modules/creators/competitors-crud.mjs';
import { escapeSqlWildcards } from '../utils.mjs';
import {
  syncCompetitorPins,
  reEvaluateArchivedPins,
  reEvaluateCompetitorPins,
  fastRefreshCompetitorArchivedPins
} from '../modules/creators/creator-ingest.mjs';
import {
  getCompetitorBoards,
  syncCompetitorBoards,
  getOrSyncBoardDetail
} from '../modules/creators/boards-service.mjs';
import {
  getCompetitorDetail,
  listCompetitorAccountPins,
  listArchivedPins,
  getPinArchiveOverview,
  getTopicClusters,
  getPinDetailWithMetrics,
  getTopDestinationUrls,
  getCompetitorRelatedIntersections,
  harvestSinglePinRelatedLive,
  auditSweepCompetitor,
  quickPulseCreator,
  deepHarvestCreator,
  getCreatorHubSettings,
  updateCreatorHubSettings
} from '../modules/creators/creator-analytics.mjs';
import { fetchCreatorLatestPinsPidgets, fetchBoardSectionsResource } from '../core/pinterest/index.mjs';
import { dispatchGitHubWorkflow, resolveGitHubAuth } from '../http/github-workflow.mjs';
import { verifyApiAuthentication } from '../http/security-and-response.mjs';
import { deletePinSnapshotByTarget } from '../modules/pins/snapshot-service.mjs';
import { DEFAULT_WORKSPACE_ID, resolveActivePinterestCookie, assertFolderInWorkspace } from '../modules/workspaces/service.mjs';
import { invalidateFolderCache, normalizeFolderMetadata } from '../modules/keywords/folders-crossover.mjs';
import { invalidateGlobalPulseCache } from '../modules/pulse/service.mjs';

const CLIENT_COOKIE_FORBIDDEN_PAYLOAD = {
  ok: false,
  error: 'CLIENT_COOKIE_FORBIDDEN',
  message: 'Client-supplied cookies are rejected; workspace cookies are resolved server-side.'
};

function hasForbiddenClientCookie(body) {
  return Boolean(body && body.cookie !== undefined && String(body.cookie).trim() !== '');
}

async function resolveWorkspaceCookieForCreators(sql, workspaceId, env) {
  const numericWid = Number(workspaceId) || DEFAULT_WORKSPACE_ID;
  const resolved = await resolveActivePinterestCookie(sql, { workspaceId: numericWid, env })
    .catch(() => ({ rawCookie: '' }));
  return resolved?.rawCookie || '';
}

/**
 * Fast URI discriminator for Creators & Boards routes
 */
export function isCreatorsRoute(pathname) {
  return pathname.startsWith('/api/creators') ||
    pathname.startsWith('/api/competitors') ||
    pathname.startsWith('/api/boards');
}

/**
 * Handles incoming `/api/creators/*` (and normalized `/api/competitors/*`) requests.
 */
export async function handleCreatorsRoutes(routeCtx) {
  let { pathname } = routeCtx;
  if (/^\/api\/competitors(?=\/|$)/i.test(pathname)) {
    pathname = pathname.replace(/^\/api\/competitors/i, '/api/creators');
  }

  const {
    method,
    request,
    searchParams,
    env,
    ctx,
    sql,
    workspaceId = 1,
    jsonResponse,
    clampLimit,
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil,
    tripPinterestCircuitBreaker
  } = routeCtx;

  const invalidateCreatorsCache = () => {
    invalidateFolderCache(null, workspaceId);
    if (typeof invalidateEdgeCache === 'function') {
      invalidateEdgeCache('creators');
      invalidateEdgeCache('competitors');
      invalidateEdgeCache('folders');
      invalidateEdgeCache('pinarchive');
      invalidateEdgeCache('topics');
      invalidateEdgeCache('settings');
      invalidateEdgeCache('domains:leaderboard');
      invalidateEdgeCache('domains:dossier');
    }
    invalidateGlobalPulseCache(env, ctx).catch(() => {});
  };

  // 0. GET & POST /api/creators/settings
  // [INVARIANT: LITERAL-MATCHES-FIRST] Handled strictly before root /api/creators
  if (pathname === '/api/creators/settings') {
    if (method === 'GET') {
      const settings = await getCreatorHubSettings(sql);
      return jsonResponse({ success: true, settings }, 200, -1);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const updated = await updateCreatorHubSettings(sql, body);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, settings: updated }, 200, -1);
    }
    return (typeof routeCtx.methodNotAllowedResponse === 'function'
      ? routeCtx.methodNotAllowedResponse('GET, POST')
      : jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Allowed methods: GET, POST' }, 405));
  }

  // 0A. GET /api/boards/:boardId/sections
  const boardSectionsMatch = pathname.match(/^\/api\/boards\/([^/]+)\/sections\/?$/i);
  if (boardSectionsMatch) {
    if (method !== 'GET') {
      return (routeCtx.methodNotAllowedResponse ? routeCtx.methodNotAllowedResponse('GET, OPTIONS') : jsonResponse({ error: 'Method Not Allowed' }, 405));
    }
    const boardId = decodeURIComponent(boardSectionsMatch[1]);
    if (!boardId) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'boardId is required' }, 400);
    }

    try {
      const username = searchParams.get('username') || '';
      const boardSlug = searchParams.get('slug') || searchParams.get('board') || '';
      const res = await fetchBoardSectionsResource(boardId, username, boardSlug);

      return jsonResponse({
        ok: res.ok,
        board_id: boardId,
        sections: res.sections || [],
        count: (res.sections || []).length,
        ...(res.error ? { error: res.error } : {})
      }, res.ok ? 200 : 502, 21600);
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message, board_id: boardId, sections: [] }, 500);
    }
  }

  // 0B. GET /api/creators/:username/latest-pins
  const latestPinsMatch = pathname.match(/^\/api\/creators\/([^/]+)\/latest-pins\/?$/i);
  if (latestPinsMatch) {
    if (method !== 'GET') {
      return (routeCtx.methodNotAllowedResponse ? routeCtx.methodNotAllowedResponse('GET, OPTIONS') : jsonResponse({ error: 'Method Not Allowed' }, 405));
    }
    const username = decodeURIComponent(latestPinsMatch[1]);
    if (!username) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'username is required' }, 400);
    }
    try {
      const res = await fetchCreatorLatestPinsPidgets(username);
      return jsonResponse({
        ok: res.ok,
        user: res.user || { username },
        pins: res.pins || [],
        count: (res.pins || []).length,
        ...(res.error ? { error: res.error } : {})
      }, res.ok ? 200 : 502);
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message, user: { username }, pins: [] }, 500);
    }
  }

  // 0C. Smart Sync Endpoints (Quick Pulse & Deep Harvest)
  if (method === 'POST' && pathname === '/api/creators/quick-pulse') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const targetId = body.id || body.username || searchParams.get('id') || searchParams.get('username');
    if (!targetId) return jsonResponse({ error: 'Creator ID or username is required' }, 400);
    // [INVARIANT: WORKSPACE-COOKIE-ISOLATION] Reject client-supplied body.cookie; resolve strictly from active workspace.
    const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
    try {
      const result = await quickPulseCreator(sql, targetId, cookie, { disableGlobalCookieFallback: true });
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('403')) && typeof tripPinterestCircuitBreaker === 'function') {
        safeWaitUntil?.(ctx, () => tripPinterestCircuitBreaker(env, `Rate limit in quick-pulse: ${err.message}`, 900), 'tripPinterestCircuitBreaker');
      }
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  if (method === 'POST' && pathname === '/api/creators/deep-harvest') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const targetId = body.id || body.username || searchParams.get('id') || searchParams.get('username');
    if (!targetId) return jsonResponse({ error: 'Creator ID or username is required' }, 400);
    // [INVARIANT: WORKSPACE-COOKIE-ISOLATION] Reject client-supplied body.cookie; resolve strictly from active workspace.
    const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
    const maxBoards = Math.max(1, Math.min(Number(body.max_boards || 12), 25));
    const maxPagesPerBoard = Math.max(1, Math.min(Number(body.max_pages_per_board || 10), 25));
    const maxPages = Math.max(1, Math.min(Number(body.max_pages || 30), 60));
    const maxDurationMs = Math.max(5_000, Math.min(Number(body.max_duration_ms || 45_000), 90_000));
    try {
      const result = await deepHarvestCreator(sql, targetId, {
        cookie,
        disableGlobalCookieFallback: true,
        env,
        maxBoards,
        maxPagesPerBoard,
        maxPages,
        maxDurationMs
      });
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('403')) && typeof tripPinterestCircuitBreaker === 'function') {
        safeWaitUntil?.(ctx, () => tripPinterestCircuitBreaker(env, `Rate limit in deep-harvest: ${err.message}`, 900), 'tripPinterestCircuitBreaker');
      }
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // 1. Literal Sub-Routes (Evaluated in strict order)

  // POST /api/creators/sync
  if (method === 'POST' && pathname === '/api/creators/sync') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const username = body.username;
    if (!username) return jsonResponse({ error: 'username is required' }, 400);
    const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
    try {
      const updated = await syncCompetitorProfile(sql, username, cookie, { disableGlobalCookieFallback: true });
      invalidateCreatorsCache();
      if (updated?.pruned) {
        return jsonResponse({
          success: true,
          pruned: true,
          deleted: true,
          profile: updated,
          message: `Creator @${updated.username} had ${updated.monthly_reach} audience and ${updated.profile_views} impressions and was permanently removed.`
        });
      }
      return jsonResponse({ success: true, profile: updated });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('rate limit'))) {
        safeWaitUntil(ctx, () => tripPinterestCircuitBreaker(env, 'HTTP 429 Rate Limit in /api/creators/sync', 900), 'tripPinterestCircuitBreaker');
        return jsonResponse({ error: 'PINTEREST_RATE_LIMITED', message: err.message }, 429);
      } else if (err.message && (err.message.includes('403') || err.message.includes('access denied'))) {
        safeWaitUntil(ctx, () => tripPinterestCircuitBreaker(env, 'HTTP 403 Forbidden in /api/creators/sync', 900), 'tripPinterestCircuitBreaker');
        return jsonResponse({ error: 'PINTEREST_ACCESS_DENIED', message: err.message }, 403);
      }
      throw err;
    }
  }

  // GET /api/creators/boards
  if (method === 'GET' && pathname === '/api/creators/boards') {
    const username = searchParams.get('username') || searchParams.get('account');
    const competitorId = searchParams.get('competitor_id') || searchParams.get('id');
    const idOrUser = username || competitorId;
    if (!idOrUser) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
    const cacheKey = buildCanonicalCacheKey('creators:boards', { idOrUser, username: username || '' });
    try {
      const boardsData = await getCachedOrFetch(cacheKey, async () => {
        const boards = await getCompetitorBoards(sql, idOrUser, { username });
        return { success: true, boards };
      }, 30000, 60000);
      return jsonResponse(boardsData, 200, 30);
    } catch (err) {
      console.error('[CreatorsRoute.GET /boards] DB error:', err?.message || err);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Competitor boards temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // POST /api/creators/sync-boards
  if (method === 'POST' && pathname === '/api/creators/sync-boards') {
    try {
      const body = await request.json().catch(() => ({}));
      if (hasForbiddenClientCookie(body)) {
        return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
      }
      const { competitor_id, username } = body;
      if (!competitor_id && !username) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
      const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
      const result = await syncCompetitorBoards(sql, competitor_id, username, cookie);
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/sync-pins
  if (method === 'POST' && pathname === '/api/creators/sync-pins') {
    try {
      const body = await request.json().catch(() => ({}));
      if (hasForbiddenClientCookie(body)) {
        return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
      }
      const { competitor_id, username, mode, max_pages } = body;
      if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
      const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
      const result = await syncCompetitorPins(sql, competitor_id, username, { mode, maxPages: max_pages, cookie });
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/fast-refresh
  if (method === 'POST' && pathname === '/api/creators/fast-refresh') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const { competitor_id, username, competitor_ids } = body;
    const fastRefreshOpts = {
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      ...(body.requireDeepFields !== undefined ? { requireDeepFields: Boolean(body.requireDeepFields) } : {}),
      env
    };
    try {
      if (Array.isArray(competitor_ids) && competitor_ids.length > 0) {
        const results = [];
        let totalRefreshed = 0;
        for (const cId of competitor_ids) {
          try {
            const r = await fastRefreshCompetitorArchivedPins(sql, cId, fastRefreshOpts);
            totalRefreshed += (r.refreshed_count || 0);
            results.push({ id: cId, ...r });
          } catch (itemErr) {
            results.push({ id: cId, ok: false, error: itemErr.message });
          }
        }
        if (results.some(r => r.ok)) {
          invalidateCreatorsCache();
        }
        return jsonResponse({
          success: true,
          creators_refreshed: results.filter(r => r.ok).length,
          total_refreshed: totalRefreshed,
          results
        });
      }
      if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
      const result = await fastRefreshCompetitorArchivedPins(sql, competitor_id || username, fastRefreshOpts);
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/audit-sweep
  if (method === 'POST' && pathname === '/api/creators/audit-sweep') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const { competitor_id, username, competitor_ids } = body;
    const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
    const sweepOpts = { cookie, disableGlobalCookieFallback: true };
    try {
      if (Array.isArray(competitor_ids) && competitor_ids.length > 0) {
        const results = [];
        let totalPinsAudited = 0;
        let totalBoardsSynced = 0;
        for (const cId of competitor_ids) {
          try {
            const r = await auditSweepCompetitor(sql, cId, sweepOpts);
            totalPinsAudited += (r.total_pins_inventory || 0);
            totalBoardsSynced += (r.boards_synced || 0);
            results.push({ id: cId, ...r });
          } catch (itemErr) {
            results.push({ id: cId, ok: false, error: itemErr.message });
          }
        }
        if (results.some(r => r.ok)) {
          invalidateCreatorsCache();
        }
        return jsonResponse({
          success: true,
          creators_audited: results.filter(r => r.ok).length,
          total_pins_audited: totalPinsAudited,
          total_boards_synced: totalBoardsSynced,
          results
        });
      }
      if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
      const result = await auditSweepCompetitor(sql, competitor_id || username, sweepOpts);
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/detail
  if (method === 'GET' && pathname === '/api/creators/detail') {
    const username = searchParams.get('username') || searchParams.get('account');
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    const idOrUser = username || id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    try {
      const cacheKey = buildCanonicalCacheKey('creators:detail', { idOrUser, username: username || '' });
      const detailData = await getCachedOrFetch(cacheKey, async () => {
        const detail = await getCompetitorDetail(sql, idOrUser, { username });
        return { success: true, ...detail };
      }, 20000, 60000);
      return jsonResponse(detailData, 200, 20);
    } catch (err) {
      const isNotFound = err.message && err.message.toLowerCase().includes('not found');
      return jsonResponse({ success: false, error: err.message }, isNotFound ? 404 : 500);
    }
  }

  // POST /api/creators/board-detail/sync (or /api/creators/board-detail with POST)
  if (method === 'POST' && (pathname === '/api/creators/board-detail/sync' || pathname === '/api/creators/board-detail')) {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const username = body.username || body.account || body.id || searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
    const board = body.board || body.board_name || body.slug || searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
    if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
    try {
      const boardData = await getOrSyncBoardDetail(sql, username, board, {
        forceRefresh: true,
        allowScrape: true,
        readOnly: false
      });
      invalidateCreatorsCache();
      return jsonResponse({ success: true, board: boardData }, 200, 0);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/board-detail ([INVARIANT: READ-ONLY-GET-SAFE]: never scrape or mutate DB on GET; use POST /api/creators/board-detail/sync)
  if (method === 'GET' && pathname === '/api/creators/board-detail') {
    const username = searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
    const board = searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug') || searchParams.get('board_slug');
    if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
    try {
      const boardData = await getOrSyncBoardDetail(sql, username, board, {
        forceRefresh: false,
        allowScrape: false,
        readOnly: true
      });
      return jsonResponse({ success: true, board: boardData }, 200, 60);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/all-pins
  if (method === 'GET' && pathname === '/api/creators/all-pins') {
    const username = searchParams.get('username') || searchParams.get('account');
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    const idOrUser = username || id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    try {
      const cacheParams = {
        idOrUser,
        username: username || '',
        search: searchParams.get('search') || '',
        board: searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug') || '',
        min_saves: Number(searchParams.get('min_saves') || 0),
        sort: searchParams.get('sort') || 'saves_desc',
        page: Number(searchParams.get('page') || 1),
        limit: clampLimit(searchParams.get('limit'), 50, 1000),
        qualified_only: searchParams.get('qualified_only') === 'true',
        product_only: searchParams.get('product_only') === 'true',
        articles_only: searchParams.get('articles_only') === 'true',
        ranked_only: searchParams.get('ranked_only') === 'true',
        stage: searchParams.get('stage') || '',
        high_velocity: searchParams.get('high_velocity') === 'true',
        changed_only: searchParams.get('changed_only') === 'true',
        scope: searchParams.get('scope') || 'official'
      };
      const cacheKey = buildCanonicalCacheKey('creators:all-pins', cacheParams);
      const allPinsData = await getCachedOrFetch(cacheKey, async () => {
        const data = await listCompetitorAccountPins(sql, idOrUser, cacheParams);
        return { success: true, ...data };
      }, 20000, 60000);
      return jsonResponse(allPinsData, 200, 15);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/top-urls
  if (method === 'GET' && pathname === '/api/creators/top-urls') {
    const id = searchParams.get('id') || searchParams.get('competitor_id') || searchParams.get('username') || searchParams.get('account');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const cacheParams = {
        id,
        limit: clampLimit(searchParams.get('limit'), 50, 1000),
        page: Number(searchParams.get('page') || 1),
        search: searchParams.get('search') || '',
        sort: searchParams.get('sort') || 'saves_desc',
        filter_type: searchParams.get('filter_type') || 'all',
        scope: searchParams.get('scope') || 'ecosystem'
      };
      const cacheKey = buildCanonicalCacheKey('creators:top-urls', cacheParams);
      const topUrlsData = await getCachedOrFetch(cacheKey, async () => {
        const result = await getTopDestinationUrls(sql, id, cacheParams);
        return { success: true, ...result };
      }, 20000, 60000);
      return jsonResponse(topUrlsData, 200, 15);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/rules -> per-creator when id/username provided, else global qualification rules
  if (method === 'GET' && pathname === '/api/creators/rules') {
    const id = searchParams.get('id') || searchParams.get('competitor_id') || searchParams.get('username') || searchParams.get('account');
    try {
      if (id) {
        const result = await getCompetitorRules(sql, id);
        return jsonResponse({ success: true, ...result });
      }
      const rules = await getQualificationRules(sql, { throwOnError: true });
      return jsonResponse({ success: true, rules });
    } catch (err) {
      if (!id) {
        console.error('[Creator Rules Error]', err.message);
        return jsonResponse({
          success: false,
          error: 'DB_UNAVAILABLE',
          degraded: true,
          message: 'Creator qualification rules temporarily unavailable while database is waking up. Retry in 3 seconds.'
        }, 503, 0, { 'Retry-After': '3' });
      }
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/rules -> per-creator when competitor_id provided, else global qualification rules
  if (method === 'POST' && pathname === '/api/creators/rules') {
    const body = await request.json().catch(() => ({}));
    const isGlobalPayload = body.scope === 'global' || (
      !body.competitor_id && (
        body.tier1_min_saves !== undefined ||
        body.tier2_min_repins !== undefined ||
        body.tier3_max_age_days !== undefined ||
        body.tier3_min_saves !== undefined ||
        body.master_ingest_enabled !== undefined ||
        body.cron_enabled !== undefined ||
        body.paused_policy !== undefined
      )
    );
    const id = body.competitor_id || (!isGlobalPayload ? body.id : null);
    try {
      if (id) {
        const result = await saveCompetitorRules(sql, id, body.rules || body);
        invalidateCreatorsCache();
        return jsonResponse({ success: true, ...result });
      }
      const rules = await updateQualificationRules(sql, body);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, rules });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/re-evaluate -> per-creator when competitor_id provided, else global archive evaluation
  if (method === 'POST' && pathname === '/api/creators/re-evaluate') {
    const body = await request.json().catch(() => ({}));
    const isGlobalPayload = body.scope === 'global' || (
      !body.competitor_id && (
        body.tier1_min_saves !== undefined ||
        body.tier2_min_repins !== undefined ||
        body.tier3_max_age_days !== undefined ||
        body.tier3_min_saves !== undefined ||
        body.master_ingest_enabled !== undefined ||
        body.cron_enabled !== undefined ||
        (body.rules && typeof body.rules === 'object')
      )
    );
    const id = body.competitor_id || (!isGlobalPayload ? body.id : null);
    try {
      if (id) {
        const result = await reEvaluateCompetitorPins(sql, id);
        invalidateCreatorsCache();
        return jsonResponse({ success: true, ...result });
      }
      const account = searchParams.get('account') || searchParams.get('username') || body.account_username || null;
      const hasRuleOverride = Boolean(body && (
        body.tier1_min_saves !== undefined ||
        body.tier2_min_repins !== undefined ||
        body.tier3_max_age_days !== undefined ||
        body.tier3_min_saves !== undefined ||
        body.master_ingest_enabled !== undefined ||
        body.cron_enabled !== undefined ||
        (body.rules && typeof body.rules === 'object')
      ));
      const rulesPayload = hasRuleOverride ? (body.rules || body) : null;
      const audit = await reEvaluateArchivedPins(sql, rulesPayload, account);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...audit });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/dispatch-crawl
  if (method === 'POST' && pathname === '/api/creators/dispatch-crawl') {
    const body = await request.json().catch(() => ({}));
    const scopedFolderId = body.folder_id ?? searchParams?.get?.('folder_id') ?? null;
    if (scopedFolderId !== null && scopedFolderId !== undefined && String(scopedFolderId).trim() !== '') {
      const folderRow = await assertFolderInWorkspace(sql, scopedFolderId, workspaceId);
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
    }
    const rawUsernames = Array.isArray(body.usernames) ? body.usernames : [body.username || body.target_account || ''];
    const usernames = rawUsernames.map(u => String(u || '').replace(/^@+/, '').trim()).filter(Boolean);
    if (!usernames.length) return jsonResponse({ error: 'username or target_account is required' }, 400);

    const { token: ghToken } = resolveGitHubAuth(env);
    if (!ghToken) {
      return jsonResponse({
        success: false,
        error: 'GITHUB_TOKEN secret is not configured in server environment. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
      }, 400);
    }

    const dispatchMode = body.crawl_mode || 'discovery';
    const maxPages = String(body.max_pages || (dispatchMode === 'refresh' ? '10' : dispatchMode === 'discovery' ? '3' : '500'));
    const personalOnly = String(body.personal_boards_only !== false);

    const results = [];
    for (const targetUser of usernames) {
      const dRes = await dispatchGitHubWorkflow(env, {
        workflowFile: 'crawler-pipeline.yml',
        inputs: {
          target_account: targetUser,
          folder_id: scopedFolderId !== null && scopedFolderId !== undefined ? String(scopedFolderId).trim() : '',
          target_boards: String(body.target_boards || body.boards || '').trim(),
          crawl_mode: dispatchMode,
          max_pages: maxPages,
          personal_boards_only: personalOnly
        }
      });
      if (dRes.ok) {
        results.push({ username: targetUser, ok: true });
      } else {
        results.push({ username: targetUser, ok: false, error: dRes.error });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const modeLabel = dispatchMode === 'refresh'
      ? 'Winning Pins Refresh'
      : dispatchMode === 'discovery'
        ? `Recent Pins Discovery (${maxPages} pages)`
        : `Full Catalog & Boards (${maxPages} pages)`;

    return jsonResponse({
      success: successCount > 0,
      dispatched_count: successCount,
      total: usernames.length,
      crawl_mode: dispatchMode,
      max_pages: maxPages,
      message: `${modeLabel} dispatched successfully on GitHub Actions for ${successCount} creator(s)!`,
      results
    }, successCount > 0 ? 200 : 500);
  }

  // GET /api/creators/related-pins/seeds
  if (method === 'GET' && pathname === '/api/creators/related-pins/seeds') {
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await getCompetitorSeeds(sql, id);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/related-pins/seeds
  if (method === 'POST' && pathname === '/api/creators/related-pins/seeds') {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await addCompetitorSeeds(sql, id, body.pin_ids || body.pins || []);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // DELETE /api/creators/related-pins/seeds
  if (method === 'DELETE' && pathname === '/api/creators/related-pins/seeds') {
    let id = searchParams.get('competitor_id') || searchParams.get('id');
    let pinId = searchParams.get('pin_id') || searchParams.get('pin_ids');
    if (!id || !pinId) {
      const body = await request.json().catch(() => ({}));
      id = id || body.competitor_id || body.id;
      pinId = pinId || body.pin_id || body.pin_ids;
    }
    if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
    try {
      const result = await deleteCompetitorSeed(sql, id, pinId);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/creators/related-pins/intersections
  if (method === 'GET' && pathname === '/api/creators/related-pins/intersections') {
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await getCompetitorRelatedIntersections(sql, id, {
        min_overlap: Number(searchParams.get('min_overlap') || 2),
        page: Number(searchParams.get('page') || 1),
        limit: clampLimit(searchParams.get('limit'), 50, 1000),
        filter: searchParams.get('filter') || 'all',
        search: searchParams.get('search') || ''
      });
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/related-pins/harvest-live
  if (method === 'POST' && pathname === '/api/creators/related-pins/harvest-live') {
    const body = await request.json().catch(() => ({}));
    if (hasForbiddenClientCookie(body)) {
      return jsonResponse(CLIENT_COOKIE_FORBIDDEN_PAYLOAD, 400);
    }
    const id = body.competitor_id || body.id;
    const pinId = body.pin_id;
    if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
    const cookie = await resolveWorkspaceCookieForCreators(sql, workspaceId, env);
    try {
      const result = await harvestSinglePinRelatedLive(sql, id, pinId, { env, rawCookie: cookie });
      invalidateCreatorsCache();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/creators/related-pins/dispatch-workflow
  if (method === 'POST' && pathname === '/api/creators/related-pins/dispatch-workflow') {
    const body = await request.json().catch(() => ({}));
    const scopedFolderId = body.folder_id ?? searchParams?.get?.('folder_id') ?? null;
    const isFolderMetaPaused = (meta = {}) => Boolean(
      meta.pause_competitors ||
      meta.pause_crawlers ||
      meta.is_crawler_paused ||
      meta.crawler_paused ||
      meta.block_fleet ||
      meta.block_gha_fleet ||
      ['paused', 'archived'].includes(String(meta.status || '').toLowerCase())
    );
    if (scopedFolderId !== null && scopedFolderId !== undefined && String(scopedFolderId).trim() !== '') {
      const folderRow = await assertFolderInWorkspace(sql, scopedFolderId, workspaceId);
      const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
      if (isFolderMetaPaused(folderMeta)) {
        return jsonResponse({
          success: false,
          error: 'FOLDER_COMPETITORS_PAUSED',
          message: 'Competitor crawling is paused or fleet ingestion is blocked for this campaign.'
        }, 409);
      }
    }
    const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
    if (!username) return jsonResponse({ error: 'username is required' }, 400);
    if (scopedFolderId === null || scopedFolderId === undefined || String(scopedFolderId).trim() === '') {
      const cleanLower = username.toLowerCase();
      let isOnWatchlist = false;
      try {
        const [wwRow] = await sql`
          SELECT 1
          FROM workspace_watchlist
          WHERE entity_type = 'creator'
            AND LOWER(LTRIM(BTRIM(entity_key), '@')) = ${cleanLower}
          LIMIT 1;
        `;
        isOnWatchlist = Boolean(wwRow);
      } catch (err) {
        if (String(err?.code || '') !== '42P01') throw err;
      }
      if (!isOnWatchlist) {
        const linkedFolders = await sql`
          SELECT kf.metadata
          FROM folder_competitor_items fci
          JOIN competitor_profiles cp ON cp.id = fci.competitor_id
          JOIN keyword_folders kf ON kf.id = fci.folder_id
          WHERE LOWER(LTRIM(BTRIM(cp.username), '@')) = ${cleanLower};
        `.catch((err) => {
          if (String(err?.code || '') === '42P01') return [];
          throw err;
        });
        if (Array.isArray(linkedFolders) && linkedFolders.length > 0) {
          const allLinkedPaused = linkedFolders.every((row) => isFolderMetaPaused(normalizeFolderMetadata(row?.metadata)));
          if (allLinkedPaused) {
            return jsonResponse({
              success: false,
              error: 'FOLDER_COMPETITORS_PAUSED',
              message: 'Competitor crawling is paused or fleet ingestion is blocked across all campaigns linked to this creator.'
            }, 409);
          }
        }
      }
    }
    const maxPages = String(body.max_pages || body.max_pages_per_seed || '2').trim() || '2';
    const dRes = await dispatchGitHubWorkflow(env, {
      workflowFile: 'related-pins-crawler.yml',
      inputs: {
        mode: 'account_quick',
        target_account: username,
        pin_ids: String(body.pin_ids || body.pins || '').trim(),
        max_pages: maxPages
      }
    });

    if (dRes.ok) {
      return jsonResponse({
        success: true,
        workflow: 'related-pins-crawler.yml',
        mode: 'account_quick',
        target_account: username,
        max_pages: maxPages,
        message: `Related Pins Crawler (account_quick) dispatched successfully on GitHub Actions for @${username}!`
      });
    }
    return jsonResponse({ success: false, error: dRes.error }, dRes.status);
  }

  // DELETE /api/creators/snapshot or snapshots
  if (method === 'DELETE' && (pathname === '/api/creators/snapshot' || pathname === '/api/creators/snapshots')) {
    let snapshotId = searchParams.get('id') || searchParams.get('snapshot_id');
    if (!snapshotId) {
      try {
        const body = await request.json();
        snapshotId = body.snapshot_id || body.id;
      } catch (_) {}
    }
    if (!snapshotId) return jsonResponse({ error: 'snapshot_id is required' }, 400);
    await deleteCompetitorSnapshot(sql, snapshotId);
    invalidateCreatorsCache();
    return jsonResponse({ success: true, deleted_snapshot_id: snapshotId });
  }

  // POST /api/creators/status or toggle
  if (method === 'POST' && (pathname === '/api/creators/status' || pathname === '/api/creators/toggle')) {
    const body = await request.json();
    const idOrUser = body.username || body.id || body.competitor_id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    const row = await updateCompetitorStatus(sql, idOrUser, body.is_active);
    invalidateCreatorsCache();
    return jsonResponse({ success: true, competitor: row });
  }

  // 2. Base Resource /api/creators (Strict Exact Equality)

  // GET /api/creators
  if (method === 'GET' && pathname === '/api/creators') {
    const account_type = searchParams.get('account_type') || 'all';
    const search = searchParams.get('search') || '';
    const limit = clampLimit(searchParams.get('limit'), 5000, 5000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
    const numericWid = Number(workspaceId) || 1;
    const explicitWsScope = searchParams.get('workspace_scope') === '1' || searchParams.get('workspace_scope') === 'true';
    const enforceWorkspaceScope = numericWid !== 1 || explicitWsScope;
    const useGlobalFallback = numericWid === 1;

    const cacheKey = buildCanonicalCacheKey('creators', {
      workspaceId: numericWid,
      workspace_scope: enforceWorkspaceScope ? 1 : 0,
      account_type,
      search,
      limit,
      offset
    });

    try {
      const data = await getCachedOrFetch(cacheKey, async () => {
        if (!enforceWorkspaceScope || useGlobalFallback) {
          const [overview, competitors] = await Promise.all([
            getCompetitorsOverview(sql),
            listCompetitors(sql, { account_type, search, limit, offset })
          ]);
          if (overview?._degraded || competitors?._degraded) {
            const degradedErr = new Error('Creators overview or list query degraded due to transient DB failure');
            degradedErr.status = 503;
            throw degradedErr;
          }
          if (!enforceWorkspaceScope) {
            return { overview, competitors, workspace_id: numericWid };
          }
          const totalScopedCreators = Math.max(Number(overview?.tracked_profiles ?? overview?.competitor_count ?? 0), competitors.length);
          const totalImpressions = Number(overview?.total_impressions ?? 0);
          const totalAudience = Number(overview?.total_audience ?? 0);
          const pinsTracked = Number(overview?.pins_tracked ?? 0);
          return {
            overview: {
              ...overview,
              tracked_profiles: totalScopedCreators,
              total_scoped_creators: totalScopedCreators,
              total_audience: totalAudience,
              total_impressions: totalImpressions,
              avg_monthly_views: totalScopedCreators > 0 ? Math.round(totalImpressions / totalScopedCreators) : 0,
              combined_reach: totalAudience,
              pins_tracked: pinsTracked
            },
            competitors,
            workspace_id: numericWid,
            workspace_scoped: true
          };
        }

        // Workspace-scoped filter via workspace_watchlist + folder_competitor_items for this workspace
        let wsScopeDegraded = false;
        const [watchRows, folderRows] = await Promise.all([
          sql`
            SELECT LOWER(TRIM(entity_key)) AS handle
            FROM workspace_watchlist
            WHERE workspace_id = ${numericWid}
              AND entity_type = 'creator'
              AND entity_key IS NOT NULL;
          `.catch(() => {
            wsScopeDegraded = true;
            return [];
          }),
          sql`
            SELECT DISTINCT fci.competitor_id, LOWER(TRIM(cp.username)) AS handle
            FROM folder_competitor_items fci
            JOIN keyword_folders kf ON kf.id = fci.folder_id
            JOIN competitor_profiles cp ON cp.id = fci.competitor_id
            WHERE kf.workspace_id = ${numericWid};
          `.catch(() => {
            wsScopeDegraded = true;
            return [];
          })
        ]);

        const allowedHandles = new Set();
        const allowedIds = new Set();
        for (const r of (watchRows || [])) {
          const h = String(r?.handle || '').replace(/^@/, '').trim().toLowerCase();
          if (h) allowedHandles.add(h);
        }
        for (const r of (folderRows || [])) {
          if (r?.competitor_id) allowedIds.add(Number(r.competitor_id));
          const h = String(r?.handle || '').replace(/^@/, '').trim().toLowerCase();
          if (h) allowedHandles.add(h);
        }

        if (allowedIds.size === 0 && allowedHandles.size === 0) {
          return {
            overview: {
              tracked_profiles: 0,
              total_scoped_creators: 0,
              active_count: 0,
              paused_count: 0,
              competitor_count: 0,
              own_count: 0,
              total_audience: 0,
              total_impressions: 0,
              avg_monthly_views: 0,
              combined_reach: 0,
              pins_tracked: 0,
              top_competitor: null
            },
            competitors: [],
            workspace_id: numericWid,
            workspace_scoped: true,
            ...(wsScopeDegraded ? { degraded: true } : {})
          };
        }

        const allowedIdsArr = Array.from(allowedIds).filter((n) => Number.isFinite(n) && n > 0);
        const allowedHandlesArr = Array.from(allowedHandles);
        const cleanSearch = (search && typeof search === 'string' && search.trim())
          ? escapeSqlWildcards(search.toLowerCase().replace('@', '').trim())
          : null;
        const searchPattern = cleanSearch ? `%${cleanSearch}%` : null;
        const filterAccountType = (account_type && account_type !== 'all') ? account_type : null;

        const [scopedOverviewRows, scopedCompetitorRows] = await Promise.all([
          sql`
            WITH ws_profiles AS (
              SELECT id, username, account_type, is_active, monthly_reach, profile_views, total_pins
              FROM competitor_profiles
              WHERE COALESCE(account_type, 'competitor') <> 'system'
                AND (
                  id = ANY(${allowedIdsArr}::int[])
                  OR LOWER(TRIM(username)) = ANY(${allowedHandlesArr}::text[])
                )
            ),
            top_ws AS (
              SELECT username, monthly_reach
              FROM ws_profiles
              WHERE monthly_reach > 0
              ORDER BY monthly_reach DESC
              LIMIT 1
            )
            SELECT
              COUNT(*)::int AS total_scoped_creators,
              COUNT(CASE WHEN is_active = TRUE THEN 1 END)::int AS active_count,
              COUNT(CASE WHEN is_active = FALSE THEN 1 END)::int AS paused_count,
              COUNT(CASE WHEN account_type = 'competitor' THEN 1 END)::int AS competitor_count,
              COUNT(CASE WHEN account_type = 'own' THEN 1 END)::int AS own_count,
              COALESCE(SUM(monthly_reach), 0)::bigint AS total_audience,
              COALESCE(SUM(profile_views), 0)::bigint AS total_impressions,
              COALESCE(SUM(total_pins), 0)::bigint AS pins_tracked,
              (SELECT username FROM top_ws) AS top_username,
              (SELECT monthly_reach FROM top_ws) AS top_monthly_reach
            FROM ws_profiles;
          `,
          sql`
            SELECT
              id, username, display_name, avatar_url, website_url,
              account_type, is_active, tracking_mode, source_folder_id, custom_label,
              monthly_reach, delta_reach_24h, reach_delta_7d,
              profile_views, delta_views_24h, views_delta_7d,
              total_pins, delta_pins_24h, pins_delta_7d,
              total_boards, delta_boards_24h, boards_delta_7d,
              follower_count, activity_status, last_synced_at, updated_at, created_at
            FROM competitor_profiles
            WHERE COALESCE(account_type, 'competitor') <> 'system'
              AND (
                id = ANY(${allowedIdsArr}::int[])
                OR LOWER(TRIM(username)) = ANY(${allowedHandlesArr}::text[])
              )
              AND (${filterAccountType}::text IS NULL OR account_type = ${filterAccountType})
              AND (${searchPattern}::text IS NULL OR LOWER(username) LIKE ${searchPattern} ESCAPE '\\' OR LOWER(COALESCE(display_name, '')) LIKE ${searchPattern} ESCAPE '\\')
            ORDER BY monthly_reach DESC
            LIMIT ${limit} OFFSET ${offset};
          `
        ]);

        const filteredScopedRows = (Array.isArray(scopedCompetitorRows) ? scopedCompetitorRows : []).filter((c) => {
          const handle = String(c?.username || '').replace(/^@/, '').trim().toLowerCase();
          return allowedIds.has(Number(c?.id)) || (handle && allowedHandles.has(handle));
        });

        const pagedCompetitors = filteredScopedRows.map((p) => {
          const mReach = Number(p.monthly_reach || 0);
          const pViews = Number(p.profile_views || 0);
          return {
            ...p,
            handle: `@${p.username}`,
            monthly_reach: mReach,
            delta_reach_24h: sanitizeStoredCeilingDelta(mReach, p.delta_reach_24h),
            reach_delta_7d: sanitizeStoredCeilingDelta(mReach, p.reach_delta_7d),
            profile_views: pViews,
            delta_views_24h: sanitizeStoredCeilingDelta(pViews, p.delta_views_24h),
            views_delta_7d: sanitizeStoredCeilingDelta(pViews, p.views_delta_7d),
            total_pins: Number(p.total_pins || 0),
            delta_pins_24h: Number(p.delta_pins_24h || 0),
            pins_delta_7d: Number(p.pins_delta_7d || 0),
            total_boards: Number(p.total_boards || 0),
            delta_boards_24h: Number(p.delta_boards_24h || 0),
            boards_delta_7d: Number(p.boards_delta_7d || 0),
            follower_count: Number(p.follower_count || 0)
          };
        });

        const overviewRow = Array.isArray(scopedOverviewRows) ? scopedOverviewRows[0] : null;
        let scopedOverview;
        if (overviewRow && overviewRow.total_scoped_creators !== undefined) {
          const totalScopedCreators = Number(overviewRow.total_scoped_creators || 0);
          const totalAudience = Number(overviewRow.total_audience || 0);
          const totalImpressions = Number(overviewRow.total_impressions || 0);
          const pinsTracked = Number(overviewRow.pins_tracked || 0);
          const topUser = overviewRow.top_username ? String(overviewRow.top_username).trim() : '';
          const topReach = Number(overviewRow.top_monthly_reach || 0);
          scopedOverview = {
            tracked_profiles: totalScopedCreators,
            total_scoped_creators: totalScopedCreators,
            active_count: Number(overviewRow.active_count || 0),
            paused_count: Number(overviewRow.paused_count || 0),
            competitor_count: Number(overviewRow.competitor_count || 0),
            own_count: Number(overviewRow.own_count || 0),
            total_audience: totalAudience,
            total_impressions: totalImpressions,
            avg_monthly_views: totalScopedCreators > 0 ? Math.round(totalImpressions / totalScopedCreators) : 0,
            combined_reach: totalAudience,
            pins_tracked: pinsTracked,
            top_competitor: topUser && topReach > 0 ? { handle: `@${topUser}`, reach: formatMetric(topReach, true) } : null
          };
        } else {
          const totalScopedCreators = pagedCompetitors.length;
          const totalAudience = pagedCompetitors.reduce((sum, c) => sum + Number(c?.monthly_reach || 0), 0);
          const totalImpressions = pagedCompetitors.reduce((sum, c) => sum + Number(c?.profile_views || 0), 0);
          const pinsTracked = pagedCompetitors.reduce((sum, c) => sum + Number(c?.total_pins || 0), 0);
          const topCreator = [...pagedCompetitors]
            .filter((c) => Number(c?.monthly_reach || 0) > 0)
            .sort((a, b) => Number(b.monthly_reach || 0) - Number(a.monthly_reach || 0))[0] || null;
          scopedOverview = {
            tracked_profiles: totalScopedCreators,
            total_scoped_creators: totalScopedCreators,
            active_count: pagedCompetitors.filter((c) => c?.is_active !== false).length,
            paused_count: pagedCompetitors.filter((c) => c?.is_active === false).length,
            competitor_count: pagedCompetitors.filter((c) => (c?.account_type || 'competitor') === 'competitor').length,
            own_count: pagedCompetitors.filter((c) => c?.account_type === 'own').length,
            total_audience: totalAudience,
            total_impressions: totalImpressions,
            avg_monthly_views: totalScopedCreators > 0 ? Math.round(totalImpressions / totalScopedCreators) : 0,
            combined_reach: totalAudience,
            pins_tracked: pinsTracked,
            top_competitor: topCreator ? { handle: `@${topCreator.username}`, reach: formatMetric(topCreator.monthly_reach, true) } : null
          };
        }

        return {
          overview: scopedOverview,
          competitors: pagedCompetitors,
          workspace_id: numericWid,
          workspace_scoped: true
        };
      }, 8000, 30000, {
        forceRefresh: Boolean(verifyApiAuthentication(request, env)?.authorized) && (
          searchParams.get('refresh') === 'true' || searchParams.has('_t')
        )
      });

      return jsonResponse({ success: true, ...data }, 200, 0);
    } catch (err) {
      console.error('[Creators Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Creators hub temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // POST /api/creators
  if (method === 'POST' && pathname === '/api/creators') {
    const body = await request.json().catch(() => ({}));
    const row = await trackCompetitor(sql, body);
    invalidateCreatorsCache();
    return jsonResponse({ success: true, competitor: row });
  }

  // DELETE /api/creators
  if (method === 'DELETE' && pathname === '/api/creators') {
    let id = searchParams.get('id');
    let username = searchParams.get('username');
    if (!id && !username) {
      try {
        const body = await request.json();
        id = body.id || body.competitor_id;
        username = body.username;
      } catch (_) {}
    }
    if (username) {
      const cleanUser = String(username).replace(/^@/, '').trim().toLowerCase();
      await deleteCompetitor(sql, cleanUser);
      invalidateCreatorsCache();
      return jsonResponse({ success: true, deleted_username: cleanUser });
    } else if (id && !isNaN(Number(id))) {
      await deleteCompetitor(sql, Number(id));
      invalidateCreatorsCache();
      return jsonResponse({ success: true, deleted_id: Number(id) });
    }
    return jsonResponse({ error: 'id or username is required to delete competitor' }, 400);
  }

  // =========================================================================
  // UNIFIED CREATOR ARCHIVE, TOPICS, PINS & SNAPSHOT ROUTES
  // =========================================================================

  // 1. Archive Overview (GET /api/creators/archive-overview & /api/creators/pinarchive-overview)
  if (method === 'GET' && (pathname === '/api/creators/archive-overview' || pathname === '/api/creators/pinarchive-overview')) {
    const cacheKey = buildCanonicalCacheKey('pinarchive:overview', {});
    try {
      const overview = await getCachedOrFetch(cacheKey, async () => {
        return await getPinArchiveOverview(sql);
      }, 15000, 60000);
      return jsonResponse({ success: true, overview }, 200, 15);
    } catch (err) {
      console.error('[Creator Archive Overview Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Creator archive overview temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // 2. Topic Clusters API (GET /api/creators/topics)
  if (method === 'GET' && pathname === '/api/creators/topics') {
    const minPins = Number(searchParams.get('min_pins') || 1);
    const search = searchParams.get('search') || '';
    const account = searchParams.get('account') || '';
    const limit = clampLimit(searchParams.get('limit'), 50, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

    const cacheKey = buildCanonicalCacheKey('topics', {
      minPins,
      search,
      account,
      limit,
      offset
    });

    try {
      const topics = await getCachedOrFetch(cacheKey, async () => {
        return await getTopicClusters(sql, { minPins, search, account, limit, offset });
      }, 8000, 30000);
      return jsonResponse({ success: true, topics: Array.isArray(topics) ? topics : [] }, 200, 8);
    } catch (err) {
      console.error('[Topics Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Creator topics temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // 3. Archived Pins Listing (GET /api/creators/pins)
  if (method === 'GET' && pathname === '/api/creators/pins') {
    const search = searchParams.get('search') || '';
    const topic = searchParams.get('topic') || '';
    const board = searchParams.get('board') || '';
    const stage = searchParams.get('stage') || '';
    const account = searchParams.get('account') || searchParams.get('username') || '';
    const minSaves = Number(searchParams.get('min_saves') || 0);
    const maxSaves = searchParams.get('max_saves') ? Number(searchParams.get('max_saves')) : null;
    const timeframe = searchParams.get('timeframe') || '24h';
    const changedOnly = searchParams.get('changed_only') === 'true' || searchParams.get('changed_only') === '1';
    const sortBy = searchParams.get('sort') || searchParams.get('sort_by') || 'saves';
    const order = searchParams.get('order') || 'desc';
    const limit = clampLimit(searchParams.get('limit'), 50, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

    const cacheKey = buildCanonicalCacheKey('pinarchive:pins', {
      search,
      topic,
      board,
      stage,
      account,
      min_saves: minSaves,
      max_saves: maxSaves ?? '',
      timeframe,
      changed_only: changedOnly,
      sort: sortBy,
      order,
      limit,
      offset
    });

    try {
      const data = await getCachedOrFetch(cacheKey, async () => {
        const pins = await listArchivedPins(sql, {
          search,
          topic,
          board,
          stage,
          account,
          minSaves,
          maxSaves,
          timeframe,
          changedOnly,
          sortBy,
          order,
          limit,
          offset
        });
        return { success: true, pins, total: pins.total ?? pins.length };
      }, 10000, 30000);

      return jsonResponse(data, 200, 10);
    } catch (err) {
      console.error('[CreatorsRoute.GET /pins] DB error:', err?.message || err);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Creator pins temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // 4. Pin Detail With Metrics (GET /api/creators/pin-detail)
  if (method === 'GET' && pathname === '/api/creators/pin-detail') {
    const pinId = searchParams.get('pin_id') || searchParams.get('id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const refresh = searchParams.get('refresh') === 'true';
    try {
      // [INVARIANT: READ-ONLY-GET-SAFE] Read-only GET cache-busting without live scraping
      const detail = await getPinDetailWithMetrics(sql, pinId, { refresh, env, isReadOnly: true });
      if (detail?._dbUnavailable || detail?.error === 'DB_UNAVAILABLE') {
        return jsonResponse({
          success: false,
          error: 'DB_UNAVAILABLE',
          degraded: true,
          message: detail.message || 'Pin detail temporarily unavailable while database is waking up. Retry in 3 seconds.'
        }, 503, 0, { 'Retry-After': '3' });
      }
      if (!detail) return jsonResponse({ error: 'Pin not found' }, 404);
      return jsonResponse({ success: true, ...detail }, 200, refresh ? 0 : 60);
    } catch (err) {
      console.error('[CreatorsRoute.GET /pin-detail] DB error:', err?.message || err);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Pin detail temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // 5. Delete Pin Metric Snapshot (DELETE /api/creators/pin-snapshot)
  if (method === 'DELETE' && pathname === '/api/creators/pin-snapshot') {
    const body = await request.json().catch(() => ({}));
    const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
    const pinId = searchParams.get('pin_id') || body.pin_id;
    if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
    let delRes;
    try {
      delRes = await deletePinSnapshotByTarget({
        sql,
        pinId,
        rawTarget: snapshotId,
        fallbackDate: searchParams.get('date') || body.date || null,
        throwOnError: true
      });
    } catch (err) {
      console.error(`[CreatorsRoute.DELETE snapshots] delete failed for pin ${pinId}:`, err?.message || err);
      return jsonResponse({
        success: false,
        error: 'SNAPSHOT_DELETE_FAILED',
        message: err?.message || String(err)
      }, 500);
    }
    if (!delRes.ok) {
      return jsonResponse({ error: delRes.message || 'Valid YYYY-MM-DD snapshot date or intraday checkpoint ID is required' }, delRes.status || 400);
    }
    invalidateCreatorsCache();
    if (typeof invalidateEdgeCache === 'function') {
      await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
      if (typeof buildCanonicalCacheKey === 'function') {
        await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
      }
      await invalidateEdgeCache('keywords:pin-dossier');
    }
    return jsonResponse({ success: true, deleted_snapshot: snapshotId, deleted_date: delRes.deletedDate, pin_id: pinId });
  }

  return null;
}
