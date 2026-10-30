import {
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  getQualificationRules,
  updateQualificationRules,
  reEvaluateArchivedPins,
  getPinDetailWithMetrics,
  deletePinMetricSnapshot
} from '../modules/creators/service.mjs';

/**
 * Competitor Intelligence Sub-Router
 * 
 * Handles competitor profile tracking, board synchronization, pin harvesting,
 * rules evaluation, destination URL tracking, and related pins graph intersections.
 * 
 * [INVARIANT: LITERAL-MATCHES-FIRST] All subpaths (/api/competitors/sync, /boards, etc.)
 * are evaluated strictly with literal equality before the root resource /api/competitors.
 */

import {
  getCompetitorsOverview,
  listCompetitors,
  trackCompetitor,
  syncCompetitorProfile,
  getCompetitorBoards,
  syncCompetitorBoards,
  syncCompetitorPins,
  getCompetitorDetail,
  deleteCompetitorSnapshot,
  updateCompetitorStatus,
  listCompetitorAccountPins,
  getOrSyncBoardDetail,
  getTopDestinationUrls,
  getCompetitorRules,
  saveCompetitorRules,
  reEvaluateCompetitorPins,
  getCompetitorSeeds,
  addCompetitorSeeds,
  deleteCompetitorSeed,
  getCompetitorRelatedIntersections,
  fastRefreshCompetitorArchivedPins,
  auditSweepCompetitor,
  quickPulseCreator,
  deepHarvestCreator,
  harvestSinglePinRelatedLive
} from '../modules/creators/service.mjs';
import { syncCompetitorAcrossFleet } from '../modules/fleet/service.mjs';
import { fetchCreatorLatestPinsPidgets, fetchBoardSectionsResource } from '../../scripts/lib/pinterest.mjs';

/**
 * Fast URI discriminator for Creators & Competitors routes
 */
export function isCreatorsRoute(pathname) {
  return pathname.startsWith('/api/creators') ||
    pathname.startsWith('/api/competitors') ||
    pathname.startsWith('/api/pinarchive') ||
    pathname.startsWith('/api/boards');
}

/**
 * Handles incoming /api/competitors/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handleCreatorsRoutes(routeCtx) {
  let { pathname } = routeCtx;
  const originalPathname = pathname;
  // Normalize /api/creators/* to /api/competitors/* for unified handling
  if (pathname.startsWith('/api/creators')) {
    pathname = pathname.replace(/^\/api\/creators\b/, '/api/competitors');
  }
  const {
    method,
    request,
    searchParams,
    env,
    ctx,
    sql,
    targetSql,
    reqProjectId,
    jsonResponse,
    clampLimit,
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil,
    tripPinterestCircuitBreaker
  } = routeCtx;

  
  const invalidateCreatorsCache = () => {
    if (typeof invalidateEdgeCache === 'function') {
      invalidateEdgeCache('creators');
      invalidateEdgeCache('competitors');
      invalidateEdgeCache('pinarchive');
      invalidateEdgeCache('topics');
    }
  };

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
    const kvKey = `board:sections:${boardId}`;
    if (env?.PIN_ENGINE_KV) {
      try {
        const cached = await env.PIN_ENGINE_KV.get(kvKey, 'json');
        if (cached && Array.isArray(cached.sections)) {
          return jsonResponse({ ok: true, board_id: boardId, sections: cached.sections, count: cached.sections.length, cached: true }, 200, 21600);
        }
      } catch (_) {}
    }
    try {
      const username = searchParams.get('username') || '';
      const boardSlug = searchParams.get('slug') || searchParams.get('board') || '';
      const res = await fetchBoardSectionsResource(boardId, username, boardSlug);
      if (res.ok && env?.PIN_ENGINE_KV) {
        if (typeof safeWaitUntil === 'function') {
          safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(res), { expirationTtl: 21600 }).catch(() => {}), 'kv_cache_board_sections');
        }
      }
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

  // 0B. GET /api/creators/:username/latest-pins (or /api/competitors/:username/latest-pins)
  const latestPinsMatch = pathname.match(/^\/api\/competitors\/([^/]+)\/latest-pins\/?$/i);
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

  // 0. Smart Sync Endpoints (Quick Pulse & Deep Harvest)
  if (method === 'POST' && (pathname === '/api/creators/quick-pulse' || pathname === '/api/competitors/quick-pulse')) {
    const body = await request.json().catch(() => ({}));
    const targetId = body.id || body.username || searchParams.get('id') || searchParams.get('username');
    if (!targetId) return jsonResponse({ error: 'Creator ID or username is required' }, 400);
    const cookie = body.cookie || env?.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : null);
    try {
      const result = await quickPulseCreator(targetSql, targetId, cookie);
      if (result?.username && typeof safeWaitUntil === 'function') {
        safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, result.username), 'syncCompetitorAcrossFleet');
      }
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('403')) && typeof tripPinterestCircuitBreaker === 'function') {
        safeWaitUntil?.(ctx, tripPinterestCircuitBreaker(env, `Rate limit in quick-pulse: ${err.message}`, 900), 'tripPinterestCircuitBreaker');
      }
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  if (method === 'POST' && (pathname === '/api/creators/deep-harvest' || pathname === '/api/competitors/deep-harvest')) {
    const body = await request.json().catch(() => ({}));
    const targetId = body.id || body.username || searchParams.get('id') || searchParams.get('username');
    if (!targetId) return jsonResponse({ error: 'Creator ID or username is required' }, 400);
    const cookie = body.cookie || env?.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : null);
    try {
      const result = await deepHarvestCreator(targetSql, targetId, { cookie, env });
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('403')) && typeof tripPinterestCircuitBreaker === 'function') {
        safeWaitUntil?.(ctx, tripPinterestCircuitBreaker(env, `Rate limit in deep-harvest: ${err.message}`, 900), 'tripPinterestCircuitBreaker');
      }
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // 1. Literal Sub-Routes (Evaluated in strict order)

  // POST /api/competitors/sync
  if (method === 'POST' && pathname === '/api/competitors/sync') {
    const body = await request.json().catch(() => ({}));
    const username = body.username;
    if (!username) return jsonResponse({ error: 'username is required' }, 400);
    const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
    try {
      const updated = await syncCompetitorProfile(targetSql, username, cookie);
      if (updated?.username) {
        safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, updated.username), 'syncCompetitorAcrossFleet');
      }
      return jsonResponse({ success: true, profile: updated });
    } catch (err) {
      if (err.message && (err.message.includes('429') || err.message.includes('rate limit'))) {
        safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, 'HTTP 429 Rate Limit in /api/competitors/sync', 900), 'tripPinterestCircuitBreaker');
        return jsonResponse({ error: 'PINTEREST_RATE_LIMITED', message: err.message }, 429);
      } else if (err.message && (err.message.includes('403') || err.message.includes('access denied'))) {
        safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, 'HTTP 403 Forbidden in /api/competitors/sync', 900), 'tripPinterestCircuitBreaker');
        return jsonResponse({ error: 'PINTEREST_ACCESS_DENIED', message: err.message }, 403);
      }
      throw err;
    } finally {
      invalidateCreatorsCache();
    }
  }

  // GET /api/competitors/boards
  if (method === 'GET' && pathname === '/api/competitors/boards') {
    const username = searchParams.get('username') || searchParams.get('account');
    const competitorId = searchParams.get('competitor_id') || searchParams.get('id');
    const idOrUser = username || competitorId;
    if (!idOrUser) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
    const shardKey = reqProjectId || 'hub';
    const cacheKey = buildCanonicalCacheKey(`competitors:boards:${shardKey}`, { idOrUser, username: username || '' });
    const boardsData = await getCachedOrFetch(cacheKey, async () => {
      const boards = await getCompetitorBoards(targetSql, idOrUser, { username });
      return { success: true, boards };
    }, 30000, 60000);
    return jsonResponse(boardsData, 200, 30);
  }

  // POST /api/competitors/sync-boards
  if (method === 'POST' && pathname === '/api/competitors/sync-boards') {
    try {
      const body = await request.json().catch(() => ({}));
      const { competitor_id, username } = body;
      if (!competitor_id && !username) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
      const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
      const result = await syncCompetitorBoards(targetSql, competitor_id, username, cookie);
      if (result?.ok && (username || competitor_id)) {
        syncCompetitorAcrossFleet(sql, username || competitor_id).catch(() => {});
      }
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/sync-pins
  if (method === 'POST' && pathname === '/api/competitors/sync-pins') {
    try {
      const body = await request.json().catch(() => ({}));
      const { competitor_id, username, mode, max_pages } = body;
      if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
      const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
      const result = await syncCompetitorPins(targetSql, competitor_id, username, { mode, maxPages: max_pages, cookie });
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/fast-refresh
  if (method === 'POST' && pathname === '/api/competitors/fast-refresh') {
    const body = await request.json().catch(() => ({}));
    const { competitor_id, username, competitor_ids } = body;
    try {
      if (Array.isArray(competitor_ids) && competitor_ids.length > 0) {
        const results = [];
        let totalRefreshed = 0;
        for (const cId of competitor_ids) {
          try {
            const r = await fastRefreshCompetitorArchivedPins(targetSql, cId);
            totalRefreshed += (r.refreshed_count || 0);
            results.push({ id: cId, ...r });
          } catch (itemErr) {
            results.push({ id: cId, ok: false, error: itemErr.message });
          }
        }
        return jsonResponse({
          success: true,
          creators_refreshed: results.filter(r => r.ok).length,
          total_refreshed: totalRefreshed,
          results
        });
      }
      if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
      const result = await fastRefreshCompetitorArchivedPins(targetSql, competitor_id || username, body);
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/audit-sweep
  if (method === 'POST' && pathname === '/api/competitors/audit-sweep') {
    const body = await request.json().catch(() => ({}));
    const { competitor_id, username, competitor_ids } = body;
    try {
      if (Array.isArray(competitor_ids) && competitor_ids.length > 0) {
        const results = [];
        let totalPinsAudited = 0;
        let totalBoardsSynced = 0;
        for (const cId of competitor_ids) {
          try {
            const r = await auditSweepCompetitor(targetSql, cId);
            totalPinsAudited += (r.total_pins_inventory || 0);
            totalBoardsSynced += (r.boards_synced || 0);
            results.push({ id: cId, ...r });
          } catch (itemErr) {
            results.push({ id: cId, ok: false, error: itemErr.message });
          }
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
      const result = await auditSweepCompetitor(targetSql, competitor_id || username, body);
      if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // GET /api/competitors/detail
  if (method === 'GET' && pathname === '/api/competitors/detail') {
    const username = searchParams.get('username') || searchParams.get('account');
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    const idOrUser = username || id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    try {
      const shardKey = reqProjectId || 'hub';
      const cacheKey = buildCanonicalCacheKey(`competitors:detail:${shardKey}`, { idOrUser, username: username || '' });
      const detailData = await getCachedOrFetch(cacheKey, async () => {
        const detail = await getCompetitorDetail(targetSql, idOrUser, { username });
        return { success: true, ...detail };
      }, 20000, 60000);
      return jsonResponse(detailData, 200, 20);
    } catch (err) {
      const isNotFound = err.message && err.message.toLowerCase().includes('not found');
      return jsonResponse({ success: false, error: err.message }, isNotFound ? 404 : 500);
    }
  }

  // POST /api/competitors/board-detail/sync (or /api/competitors/board-detail with POST)
  if (method === 'POST' && (pathname === '/api/competitors/board-detail/sync' || pathname === '/api/competitors/board-detail')) {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const username = body.username || body.account || body.id || searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
    const board = body.board || body.board_name || body.slug || searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
    if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
    try {
      const boardData = await getOrSyncBoardDetail(targetSql, username, board, { forceRefresh: true });
      return jsonResponse({ success: true, board: boardData }, 200, 0);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/board-detail (Read-only)
  if (method === 'GET' && pathname === '/api/competitors/board-detail') {
    const username = searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
    const board = searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
    if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
    try {
      const boardData = await getOrSyncBoardDetail(targetSql, username, board, { forceRefresh: false });
      return jsonResponse({ success: true, board: boardData }, 200, 60);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/all-pins
  if (method === 'GET' && pathname === '/api/competitors/all-pins') {
    const username = searchParams.get('username') || searchParams.get('account');
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    const idOrUser = username || id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    try {
      const shardKey = reqProjectId || 'hub';
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
        changed_only: searchParams.get('changed_only') === 'true'
      };
      const cacheKey = buildCanonicalCacheKey(`competitors:all-pins:${shardKey}`, cacheParams);
      const allPinsData = await getCachedOrFetch(cacheKey, async () => {
        const data = await listCompetitorAccountPins(targetSql, idOrUser, cacheParams);
        return { success: true, ...data };
      }, 20000, 60000);
      return jsonResponse(allPinsData, 200, 15);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/top-urls
  if (method === 'GET' && pathname === '/api/competitors/top-urls') {
    const id = searchParams.get('id') || searchParams.get('competitor_id') || searchParams.get('username') || searchParams.get('account');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const shardKey = reqProjectId || 'hub';
      const cacheParams = {
        id,
        limit: clampLimit(searchParams.get('limit'), 50, 1000),
        page: Number(searchParams.get('page') || 1),
        search: searchParams.get('search') || '',
        sort: searchParams.get('sort') || 'saves_desc',
        filter_type: searchParams.get('filter_type') || 'all'
      };
      const cacheKey = buildCanonicalCacheKey(`competitors:top-urls:${shardKey}`, cacheParams);
      const topUrlsData = await getCachedOrFetch(cacheKey, async () => {
        const result = await getTopDestinationUrls(targetSql, id, cacheParams);
        return { success: true, ...result };
      }, 20000, 60000);
      return jsonResponse(topUrlsData, 200, 15);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/rules
  if (method === 'GET' && pathname === '/api/competitors/rules') {
    const id = searchParams.get('id') || searchParams.get('competitor_id') || searchParams.get('username') || searchParams.get('account');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await getCompetitorRules(targetSql, id);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/competitors/rules and /api/creators/rules
  if (method === 'POST' && (pathname === '/api/competitors/rules' || pathname === '/api/creators/rules')) {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await saveCompetitorRules(targetSql, id, body.rules || body);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/re-evaluate and /api/creators/re-evaluate
  if (method === 'POST' && (pathname === '/api/competitors/re-evaluate' || pathname === '/api/creators/re-evaluate')) {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await reEvaluateCompetitorPins(targetSql, id);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/dispatch-crawl and /api/creators/dispatch-crawl
  if (method === 'POST' && (pathname === '/api/competitors/dispatch-crawl' || pathname === '/api/creators/dispatch-crawl')) {
    const body = await request.json().catch(() => ({}));
    const rawUsernames = Array.isArray(body.usernames) ? body.usernames : [body.username || body.target_account || ''];
    const usernames = rawUsernames.map(u => String(u || '').replace(/^@+/, '').trim()).filter(Boolean);
    if (!usernames.length) return jsonResponse({ error: 'username or target_account is required' }, 400);

    const ghToken = env?.GITHUB_TOKEN || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GH_TOKEN) : null);
    if (!ghToken) {
      return jsonResponse({
        success: false,
        error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
      }, 400);
    }
    const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const repo = 'sayfedin-star/pin-arbitrage-engine';

    const dispatchMode = body.crawl_mode || 'discovery';
    const maxPages = String(body.max_pages || (dispatchMode === 'refresh' ? '10' : dispatchMode === 'discovery' ? '3' : '500'));
    const personalOnly = String(body.personal_boards_only !== false);

    const results = [];
    for (const targetUser of usernames) {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_account: targetUser,
              target_boards: String(body.target_boards || body.boards || '').trim(),
              crawl_mode: dispatchMode,
              max_pages: maxPages,
              personal_boards_only: personalOnly
            }
          })
        });
        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          results.push({ username: targetUser, ok: true });
        } else {
          const errText = await res.text().catch(() => '');
          results.push({ username: targetUser, ok: false, error: `GitHub API error (${res.status}): ${errText}` });
        }
      } catch (dErr) {
        results.push({ username: targetUser, ok: false, error: dErr.message });
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

  // GET /api/competitors/related-pins/seeds
  if (method === 'GET' && pathname === '/api/competitors/related-pins/seeds') {
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await getCompetitorSeeds(targetSql, id);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/competitors/related-pins/seeds
  if (method === 'POST' && pathname === '/api/competitors/related-pins/seeds') {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await addCompetitorSeeds(targetSql, id, body.pin_ids || body.pins || []);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // DELETE /api/competitors/related-pins/seeds
  if (method === 'DELETE' && pathname === '/api/competitors/related-pins/seeds') {
    let id = searchParams.get('competitor_id') || searchParams.get('id');
    let pinId = searchParams.get('pin_id') || searchParams.get('pin_ids');
    if (!id || !pinId) {
      const body = await request.json().catch(() => ({}));
      id = id || body.competitor_id || body.id;
      pinId = pinId || body.pin_id || body.pin_ids;
    }
    if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
    try {
      const result = await deleteCompetitorSeed(targetSql, id, pinId);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/related-pins/intersections
  if (method === 'GET' && pathname === '/api/competitors/related-pins/intersections') {
    const id = searchParams.get('id') || searchParams.get('competitor_id');
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await getCompetitorRelatedIntersections(targetSql, id, {
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

  // POST /api/competitors/related-pins/harvest-live
  if (method === 'POST' && pathname === '/api/competitors/related-pins/harvest-live') {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    const pinId = body.pin_id;
    if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
    try {
      const result = await harvestSinglePinRelatedLive(targetSql, id, pinId);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/competitors/related-pins/dispatch-workflow
  if (method === 'POST' && pathname === '/api/competitors/related-pins/dispatch-workflow') {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
    if (!username) return jsonResponse({ error: 'username is required' }, 400);
    const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
    if (!ghToken) {
      return jsonResponse({
        success: false,
        error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
      }, 400);
    }
    const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const repo = 'sayfedin-star/pin-arbitrage-engine';
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/account-related-pins.yml/dispatches`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          target_account: username,
          pin_ids: String(body.pin_ids || body.pins || '').trim(),
          max_pages_per_seed: String(body.max_pages_per_seed || '2')
        }
      })
    });

    if (res.ok || res.status === 204) {
      if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      return jsonResponse({
        success: true,
        target_account: username,
        message: `Account Related Pins Harvester workflow dispatched successfully on GitHub Actions for @${username}!`
      });
    } else {
      const errText = await res.text();
      return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
    }
  }

  // DELETE /api/competitors/snapshot or snapshots
  if (method === 'DELETE' && (pathname === '/api/competitors/snapshot' || pathname === '/api/competitors/snapshots')) {
    try {
      let snapshotId = searchParams.get('id') || searchParams.get('snapshot_id');
      if (!snapshotId) {
        try {
          const body = await request.json();
          snapshotId = body.snapshot_id || body.id;
        } catch (_) {}
      }
      if (!snapshotId) return jsonResponse({ error: 'snapshot_id is required' }, 400);
      await deleteCompetitorSnapshot(targetSql, snapshotId);
      return jsonResponse({ success: true, deleted_snapshot_id: snapshotId });
    } finally {
      invalidateCreatorsCache();
    }
  }

  // POST /api/competitors/status or toggle
  if (method === 'POST' && (pathname === '/api/competitors/status' || pathname === '/api/competitors/toggle')) {
    try {
      const body = await request.json();
      const idOrUser = body.username || body.id || body.competitor_id;
      if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
      const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
      return jsonResponse({ success: true, competitor: row });
    } finally {
      invalidateCreatorsCache();
    }
  }

  // 2. Base Resource /api/competitors (Strict Exact Equality)

  // GET /api/competitors
  if (method === 'GET' && pathname === '/api/competitors') {
    const shardKey = reqProjectId || 'hub';
    const account_type = searchParams.get('account_type') || 'all';
    const search = searchParams.get('search') || '';
    const limit = clampLimit(searchParams.get('limit'), 50, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

    const cacheKey = buildCanonicalCacheKey(`competitors:${shardKey}`, {
      account_type,
      search,
      limit,
      offset
    });

    try {
      const data = await getCachedOrFetch(cacheKey, async () => {
        const overview = await getCompetitorsOverview(targetSql);
        const competitors = await listCompetitors(targetSql, {
          account_type,
          search,
          limit,
          offset
        });
        const isDegraded = Boolean(overview?._degraded || competitors?._degraded);
        return { overview, competitors, ...(isDegraded ? { degraded: true } : {}) };
      }, 8000, 30000, { forceRefresh: searchParams.get('refresh') === 'true' || searchParams.has('_t') });

      return jsonResponse({ success: true, ...data }, 200, 0, {
        'Cache-Control': 'private, no-cache, must-revalidate'
      });
    } catch (err) {
      console.error('[Competitors Error]', err.message);
      return jsonResponse({
        success: true,
        degraded: true,
        overview: { tracked_profiles: 0, competitor_count: 0, own_count: 0, combined_reach: 0, total_audience: 0, pins_tracked: 0, top_competitor: null },
        competitors: []
      }, 200, 0);
    }
  }

  // POST /api/competitors
  if (method === 'POST' && pathname === '/api/competitors') {
    try {
      const body = await request.json().catch(() => ({}));
      const row = await trackCompetitor(targetSql, body);
      if (row?.username) {
        safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, row.username), 'syncCompetitorAcrossFleet');
      }
      return jsonResponse({ success: true, competitor: row });
    } finally {
      invalidateCreatorsCache();
    }
  }

  // DELETE /api/competitors
  if (method === 'DELETE' && pathname === '/api/competitors') {
    try {
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
        await targetSql`DELETE FROM competitor_profiles WHERE LOWER(username) = ${cleanUser};`;
        await targetSql`DELETE FROM competitor_profiles WHERE username IS NULL OR TRIM(username) = '' OR username = '@';`.catch(() => {});
        return jsonResponse({ success: true, deleted_username: cleanUser });
      } else if (id && !isNaN(Number(id))) {
        await targetSql`DELETE FROM competitor_profiles WHERE id = ${Number(id)};`;
        await targetSql`DELETE FROM competitor_profiles WHERE username IS NULL OR TRIM(username) = '' OR username = '@';`.catch(() => {});
        return jsonResponse({ success: true, deleted_id: Number(id) });
      }
      return jsonResponse({ error: 'id or username is required to delete competitor' }, 400);
    } finally {
      invalidateCreatorsCache();
    }
  }

  
  // =========================================================================
  // PINARCHIVE ROUTING INTEGRATION
  // =========================================================================


  // 1. PinArchive Overview
  if (method === 'GET' && (pathname === '/api/pinarchive/overview' || pathname === '/api/competitors/archive-overview' || originalPathname === '/api/creators/archive-overview' || originalPathname === '/api/creators/pinarchive-overview')) {
    const shardKey = reqProjectId || 'hub';
    const cacheKey = buildCanonicalCacheKey(`pinarchive:overview:${shardKey}`, {});
    try {
      const overview = await getCachedOrFetch(cacheKey, async () => {
        return await getPinArchiveOverview(targetSql);
      }, 15000, 60000);
      return jsonResponse({ success: true, overview }, 200, 15);
    } catch (err) {
      console.error('[PinArchive Overview Error]', err.message);
      return jsonResponse({
        success: true,
        degraded: true,
        overview: {
          total_pins: 0,
          high_velocity_pins: 0,
          dormant_pins: 0,
          cooling_pins: 0,
          mature_pins: 0,
          growing_pins: 0
        }
      }, 200, 0);
    }
  }

  // 2. Qualification Rules (GET)
  if (method === 'GET' && pathname === '/api/pinarchive/rules') {
    try {
      const rules = await getQualificationRules(targetSql);
      return jsonResponse({ success: true, rules });
    } catch (err) {
      console.error('[PinArchive Rules Error]', err.message);
      return jsonResponse({ success: true, degraded: true, rules: {} }, 200, 0);
    }
  }

  // 3. Qualification Rules (POST)
  if (method === 'POST' && pathname === '/api/pinarchive/rules') {
    try {
      const body = await request.json().catch(() => ({}));
      const rules = await updateQualificationRules(targetSql, body);
      return jsonResponse({ success: true, rules });
    } finally {
      invalidateCreatorsCache();
    }
  }

  // 4. Re-evaluate Archived Pins
  if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
    try {
      const body = await request.json().catch(() => ({}));
      const account = searchParams.get('account') || searchParams.get('username') || body.account_username || null;
      const hasRuleOverride = Boolean(body && (
        body.tier1_min_saves !== undefined ||
        body.tier2_min_repins !== undefined ||
        body.tier3_max_age_days !== undefined ||
        body.tier3_min_saves !== undefined ||
        body.master_ingest_enabled !== undefined ||
        (body.rules && typeof body.rules === 'object')
      ));
      const rulesPayload = hasRuleOverride ? (body.rules || body) : null;
      const audit = await reEvaluateArchivedPins(targetSql, rulesPayload, account);
      return jsonResponse({ success: true, ...audit });
    } finally {
      invalidateCreatorsCache();
    }
  }

  // 5. Topic Clusters API
  if (method === 'GET' && (pathname === '/api/pinarchive/topics' || pathname === '/api/competitors/topics' || originalPathname === '/api/creators/topics')) {
    const shardKey = reqProjectId || 'hub';
    const minPins = Number(searchParams.get('min_pins') || 1);
    const search = searchParams.get('search') || '';
    const account = searchParams.get('account') || '';
    const limit = clampLimit(searchParams.get('limit'), 50, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

    const cacheKey = buildCanonicalCacheKey(`topics:${shardKey}`, {
      minPins,
      search,
      account,
      limit,
      offset
    });

    try {
      const topics = await getCachedOrFetch(cacheKey, async () => {
        return await getTopicClusters(targetSql, { minPins, search, account, limit, offset });
      }, 8000, 30000);
      return jsonResponse({ success: true, topics: Array.isArray(topics) ? topics : [] }, 200, 8);
    } catch (err) {
      console.error('[Topics Error]', err.message);
      return jsonResponse({ success: true, degraded: true, topics: [] }, 200, 0);
    }
  }

  // 6. Archived Pins Listing
  if (method === 'GET' && (pathname === '/api/pinarchive/pins' || pathname === '/api/competitors/pins' || originalPathname === '/api/creators/pins')) {
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

    const shardKey = reqProjectId || 'hub';
    const cacheKey = buildCanonicalCacheKey(`pinarchive:pins:${shardKey}`, {
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

    const data = await getCachedOrFetch(cacheKey, async () => {
      const pins = await listArchivedPins(targetSql, {
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
  }

  // 7. Pin Detail With Metrics
  if (method === 'GET' && (pathname === '/api/pinarchive/pin-detail' || pathname === '/api/competitors/pin-detail' || originalPathname === '/api/creators/pin-detail')) {
    const pinId = searchParams.get('pin_id') || searchParams.get('id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const refresh = searchParams.get('refresh') === 'true';
    // [INVARIANT: READ-ONLY-GET-SAFE] Read-only GET cache-busting without live scraping
    const detail = await getPinDetailWithMetrics(targetSql, pinId, { refresh, env, isReadOnly: true });
    if (!detail) return jsonResponse({ error: 'Pin not found' }, 404);
    return jsonResponse({ success: true, ...detail }, 200, refresh ? 0 : 60);
  }

  // 8. Delete Pin Metric Snapshot
  if (method === 'DELETE' && (pathname === '/api/pinarchive/pin-snapshot' || pathname === '/api/competitors/pin-snapshot' || originalPathname === '/api/creators/pin-snapshot')) {
    invalidateCreatorsCache();
    const body = await request.json().catch(() => ({}));
    const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
    const pinId = searchParams.get('pin_id') || body.pin_id;
    if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
    const result = await deletePinMetricSnapshot(targetSql, snapshotId, pinId);
    return jsonResponse(result);
  }

  
  return null;
}


// Backward-compatible router aliases
export const handleCompetitorsRoutes = handleCreatorsRoutes;
export const handlePinarchiveRoutes = handleCreatorsRoutes;
