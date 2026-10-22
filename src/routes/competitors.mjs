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
  harvestSinglePinRelatedLive,
  fastRefreshCompetitorArchivedPins,
  auditSweepCompetitor
} from '../modules/competitors/service.mjs';
import { syncCompetitorAcrossFleet } from '../modules/fleet/service.mjs';

/**
 * Handles incoming /api/competitors/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handleCompetitorsRoutes(routeCtx) {
  const {
    pathname,
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

  // 1. Literal Sub-Routes (Evaluated in strict order)

  // POST /api/competitors/sync
  if (method === 'POST' && pathname === '/api/competitors/sync') {
    invalidateEdgeCache('competitors');
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
    invalidateEdgeCache('competitors');
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
    }
  }

  // POST /api/competitors/sync-pins
  if (method === 'POST' && pathname === '/api/competitors/sync-pins') {
    invalidateEdgeCache('competitors');
    const body = await request.json().catch(() => ({}));
    const { competitor_id, username, mode, max_pages } = body;
    if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
    const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
    const result = await syncCompetitorPins(targetSql, competitor_id, username, { mode, maxPages: max_pages, cookie });
    if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
    return jsonResponse({ success: true, ...result });
  }

  // POST /api/competitors/fast-refresh
  if (method === 'POST' && pathname === '/api/competitors/fast-refresh') {
    invalidateEdgeCache('competitors');
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
    }
  }

  // POST /api/competitors/audit-sweep
  if (method === 'POST' && pathname === '/api/competitors/audit-sweep') {
    invalidateEdgeCache('competitors');
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
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // GET /api/competitors/board-detail
  if (method === 'GET' && pathname === '/api/competitors/board-detail') {
    const username = searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
    const board = searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
    if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
    try {
      const forceRefresh = searchParams.get('refresh') === 'true';
      const boardData = await getOrSyncBoardDetail(targetSql, username, board, { forceRefresh });
      return jsonResponse({ success: true, board: boardData }, 200, forceRefresh ? 0 : 60);
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
        ranked_only: searchParams.get('ranked_only') === 'true'
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

  // POST /api/competitors/rules
  if (method === 'POST' && pathname === '/api/competitors/rules') {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await saveCompetitorRules(targetSql, id, body.rules || body);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/competitors/re-evaluate
  if (method === 'POST' && pathname === '/api/competitors/re-evaluate') {
    const body = await request.json().catch(() => ({}));
    const id = body.competitor_id || body.id;
    if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
    try {
      const result = await reEvaluateCompetitorPins(targetSql, id);
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // POST /api/competitors/dispatch-crawl
  if (method === 'POST' && pathname === '/api/competitors/dispatch-crawl') {
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
          target_account: username,
          target_boards: String(body.target_boards || body.boards || '').trim(),
          crawl_mode: body.crawl_mode || 'sharded_boards',
          max_pages: String(body.max_pages || '1000'),
          personal_boards_only: String(body.personal_boards_only !== false)
        }
      })
    });

    if (res.ok || res.status === 204) {
      if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      return jsonResponse({
        success: true,
        target_account: username,
        target_boards: body.target_boards || '',
        crawl_mode: body.crawl_mode || 'discovery',
        message: `Two-Stage Pipeline (Discovery + 20-Shard Parallel Matrix) dispatched successfully on GitHub Actions for @${username}!${body.target_boards ? ` (Target Boards: ${body.target_boards})` : ''}`
      });
    } else {
      const errText = await res.text();
      return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
    }
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
    invalidateEdgeCache('competitors');
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
  }

  // POST /api/competitors/status or toggle
  if (method === 'POST' && (pathname === '/api/competitors/status' || pathname === '/api/competitors/toggle')) {
    invalidateEdgeCache('competitors');
    const body = await request.json();
    const idOrUser = body.username || body.id || body.competitor_id;
    if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
    const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
    return jsonResponse({ success: true, competitor: row });
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
      }, 8000, 30000);

      const isDegraded = Boolean(data?.degraded || data?.overview?._degraded || data?.competitors?._degraded);
      return jsonResponse({ success: true, ...data }, 200, isDegraded ? 0 : 8);
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
    invalidateEdgeCache('competitors');
    const body = await request.json().catch(() => ({}));
    const row = await trackCompetitor(targetSql, body);
    if (row?.username) {
      safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, row.username), 'syncCompetitorAcrossFleet');
    }
    return jsonResponse({ success: true, competitor: row });
  }

  // DELETE /api/competitors
  if (method === 'DELETE' && pathname === '/api/competitors') {
    invalidateEdgeCache('competitors');
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
      return jsonResponse({ success: true, deleted_username: cleanUser });
    } else if (id && !isNaN(Number(id))) {
      await targetSql`DELETE FROM competitor_profiles WHERE id = ${Number(id)};`;
      return jsonResponse({ success: true, deleted_id: Number(id) });
    }
    return jsonResponse({ error: 'id or username is required to delete competitor' }, 400);
  }

  return null;
}
