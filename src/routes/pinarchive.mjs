/**
 * PinArchive Elite Surveillance Sub-Router
 * 
 * Handles elite pin surveillance, tier qualification rules, dynamic re-evaluation,
 * topic cluster discovery, archived pin retrieval, and pin metric snapshot deletion.
 */

import {
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  getQualificationRules,
  updateQualificationRules,
  reEvaluateArchivedPins,
  getPinDetailWithMetrics,
  deletePinMetricSnapshot
} from '../modules/pinarchive/service.mjs';

/**
 * Handles incoming /api/pinarchive/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handlePinarchiveRoutes(routeCtx) {
  const {
    pathname,
    method,
    request,
    searchParams,
    targetSql,
    reqProjectId,
    jsonResponse,
    clampLimit,
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache
  } = routeCtx;

  // 1. PinArchive Overview
  if (method === 'GET' && pathname === '/api/pinarchive/overview') {
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
    invalidateEdgeCache('pinarchive');
    invalidateEdgeCache('topics');
    const body = await request.json().catch(() => ({}));
    const rules = await updateQualificationRules(targetSql, body);
    return jsonResponse({ success: true, rules });
  }

  // 4. Re-evaluate Archived Pins
  if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
    invalidateEdgeCache('pinarchive');
    invalidateEdgeCache('topics');
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
  }

  // 5. Topic Clusters API
  if (method === 'GET' && pathname === '/api/pinarchive/topics') {
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
  if (method === 'GET' && pathname === '/api/pinarchive/pins') {
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
  if (method === 'GET' && pathname === '/api/pinarchive/pin-detail') {
    const pinId = searchParams.get('pin_id') || searchParams.get('id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const refresh = searchParams.get('refresh') === 'true';
    const detail = await getPinDetailWithMetrics(targetSql, pinId, { refresh });
    if (!detail) return jsonResponse({ error: 'Pin not found' }, 404);
    return jsonResponse({ success: true, ...detail }, 200, refresh ? 0 : 60);
  }

  // 8. Delete Pin Metric Snapshot
  if (method === 'DELETE' && pathname === '/api/pinarchive/pin-snapshot') {
    invalidateEdgeCache('pinarchive');
    const body = await request.json().catch(() => ({}));
    const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
    const pinId = searchParams.get('pin_id') || body.pin_id;
    if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
    const result = await deletePinMetricSnapshot(targetSql, snapshotId, pinId);
    return jsonResponse(result);
  }

  return null;
}
