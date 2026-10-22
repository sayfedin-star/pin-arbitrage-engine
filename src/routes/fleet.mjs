/**
 * Fleet & Sharding Sub-Router
 * 
 * Handles multi-project shard registration, fleet database synchronization,
 * health checks, connection credentials (masked), and shard keep-alive pings.
 */

import {
  getFleetProjects,
  registerNewProject,
  syncFleetDatabases,
  pingFleetProject,
  getFleetProjectUrl
} from '../modules/fleet/service.mjs';
import { resolveShardConnection, getPinShardId, isValidShardDsn } from '../modules/sharding/fleet-router.mjs';
import { maskDatabaseUrl } from '../utils.mjs';

// Predictive Hover JIT Warming deduplication & rate limiting
const recentWarmedShards = new Map(); // shardId -> epochMs
const inFlightWarms = new Set(); // Set<shardId>
const MAX_CONCURRENT_WARMS = 4;
const WARM_COOLDOWN_MS = 15000;

/**
 * Handles incoming /api/fleet/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handleFleetRoutes(routeCtx) {
  const {
    pathname,
    method,
    request,
    searchParams,
    env,
    ctx,
    sql,
    jsonResponse,
    methodNotAllowedResponse,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil
  } = routeCtx;

  // 1. Neon Multi-Project Fleet API & Shards Map (KV Accelerated)
  if (method === 'GET' && (pathname === '/api/fleet/projects' || pathname === '/api/fleet/shards')) {
    let rawShards = null;
    if (env?.PIN_ENGINE_KV) {
      try {
        rawShards = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
        // Anti-Poisoning Check: Ensure cached KV data does not contain masked bullet URLs
        if (Array.isArray(rawShards) && rawShards.some(r => !isValidShardDsn(r?.database_url))) {
          rawShards = null; // Discard poisoned data
          safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_poisoned_shards_map');
        }
      } catch (_) {}
    }
    if (!rawShards || !Array.isArray(rawShards) || rawShards.length === 0) {
      // Query raw unmasked projects directly from Central Hub
      rawShards = await sql`
        SELECT 
          id, project_id, project_name, region_id, database_url,
          status, is_hub, assigned_shards, stats, created_at, updated_at
        FROM neon_projects_registry
        ORDER BY is_hub DESC, id ASC;
      `;
      if (env?.PIN_ENGINE_KV && Array.isArray(rawShards) && rawShards.length > 0) {
        // ALWAYS store RAW unmasked connection strings in the internal routing key 'fleet:shards_map'
        safeWaitUntil(ctx, env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(rawShards), { expirationTtl: 86400 }), 'kv_cache_shards_map');
      }
    }

    // Security: Mask database credentials before transmitting to client
    const clientProjects = (Array.isArray(rawShards) ? rawShards : []).map(p => {
      const rawUrl = p.database_url || '';
      const masked = maskDatabaseUrl(rawUrl);
      return {
        ...p,
        database_url: masked,
        masked_url: masked
      };
    });

    return jsonResponse({
      success: true,
      projects: clientProjects,
      shards: clientProjects,
      source: env?.PIN_ENGINE_KV ? 'kv_edge' : 'neon_hub'
    }, 200, 10);
  }

  // 2. Register New Project
  if (method === 'POST' && pathname === '/api/fleet/projects') {
    invalidateEdgeCache('fleet_projects');
    if (env?.PIN_ENGINE_KV) safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_shards_map');
    const body = await request.json().catch(() => ({}));
    const row = await registerNewProject(sql, body);
    return jsonResponse({ success: true, project: row });
  }

  // 3. Sync Fleet Databases
  if (method === 'POST' && pathname === '/api/fleet/sync') {
    invalidateEdgeCache('fleet_projects');
    if (env?.PIN_ENGINE_KV) safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_shards_map');
    const body = await request.json().catch(() => ({}));
    const targetProj = body?.project_id || searchParams.get('project_id');
    const syncRes = await syncFleetDatabases(sql, { targetProjectId: targetProj });
    return jsonResponse(syncRes);
  }

  // 4. Ping Project
  if (method === 'POST' && pathname === '/api/fleet/ping') {
    const body = await request.json().catch(() => ({}));
    const projId = body?.project_id || searchParams.get('project_id');
    try {
      const pingRes = await pingFleetProject(sql, projId);
      return jsonResponse({ success: true, ...pingRes });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // 5. Get Fleet Project URL
  if ((method === 'GET' || method === 'POST') && pathname === '/api/fleet/url') {
    const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
    const projId = body?.project_id || searchParams.get('project_id') || searchParams.get('id');
    try {
      const urlRes = await getFleetProjectUrl(sql, projId);
      return jsonResponse({ success: true, ...urlRes });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // 6. Fleet Keep-Alive & Shard Pre-Warming Ping API
  if (pathname === '/api/fleet/keep-alive') {
    if (method !== 'POST' && method !== 'GET') {
      return methodNotAllowedResponse('GET, POST, OPTIONS');
    }

    let shardIdsToPing = [];
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.shards)) {
        shardIdsToPing = body.shards.map(s => Number(s)).filter(s => s >= 1 && s <= 99);
      }
    }
    const qShard = searchParams.get('shard') || searchParams.get('shard_id');
    if (qShard && !isNaN(Number(qShard))) {
      shardIdsToPing.push(Number(qShard));
    }

    let uniqueShards = [];
    if (shardIdsToPing.length > 0) {
      uniqueShards = Array.from(new Set(shardIdsToPing)).slice(0, 10);
      safeWaitUntil(ctx, Promise.allSettled(uniqueShards.map(async (sid) => {
        try {
          const shardSql = await resolveShardConnection({ hubSql: sql, shardId: sid });
          await shardSql`SELECT 1;`;
        } catch (_) {}
      })), 'fleet_keep_alive_shards');
    }

    return jsonResponse({
      success: true,
      alive: true,
      timestamp: Date.now(),
      shards_pinged: uniqueShards.length
    }, 200, 0);
  }

  // 7. Predictive Hover JIT Warming API
  // [INVARIANT: PREDICTIVE-HOVER-JIT-WARMING]
  // Wakes up dormant Neon Shards (1-99) in the background before the user completes navigation click.
  // Safely guarded with deduplication (15s cooldown) and concurrency throttling (max 4 concurrent pings).
  if (pathname === '/api/fleet/warm') {
    if (method !== 'GET' && method !== 'POST') {
      return methodNotAllowedResponse('GET, POST, OPTIONS');
    }

    let targetShardId = null;
    const pinIdParam = searchParams.get('pin_id') || searchParams.get('pinId');
    const shardParam = searchParams.get('shard') || searchParams.get('shard_id');

    if (pinIdParam) {
      targetShardId = getPinShardId(pinIdParam, 99);
    } else if (shardParam && !isNaN(Number(shardParam))) {
      const sNum = Number(shardParam);
      if (sNum >= 1 && sNum <= 99) {
        targetShardId = sNum;
      }
    }

    if (!targetShardId && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body?.pin_id || body?.pinId) {
        targetShardId = getPinShardId(body.pin_id || body.pinId, 99);
      } else if (body?.shard || body?.shard_id) {
        const sNum = Number(body.shard || body.shard_id);
        if (sNum >= 1 && sNum <= 99) targetShardId = sNum;
      }
    }

    if (!targetShardId) {
      return jsonResponse({
        success: false,
        error: 'INVALID_PARAM',
        message: 'Provide pin_id or shard (1-99)'
      }, 400);
    }

    const now = Date.now();
    const lastWarmed = recentWarmedShards.get(targetShardId) || 0;

    // A. 15s Cooldown Deduplication: Shard is already awake or waking up
    if (now - lastWarmed < WARM_COOLDOWN_MS) {
      return jsonResponse({
        success: true,
        warmed: false,
        cached: true,
        shard_id: targetShardId,
        message: `Shard ${targetShardId} warming in cooldown (already active)`
      }, 200, 0);
    }

    // B. In-flight Guard: Ping already dispatched
    if (inFlightWarms.has(targetShardId)) {
      return jsonResponse({
        success: true,
        warmed: false,
        in_flight: true,
        shard_id: targetShardId,
        message: `Shard ${targetShardId} is currently warming`
      }, 200, 0);
    }

    // C. Concurrency Limiter: Shed extra requests if already at capacity
    if (inFlightWarms.size >= MAX_CONCURRENT_WARMS) {
      return jsonResponse({
        success: true,
        warmed: false,
        rate_limited: true,
        shard_id: targetShardId,
        message: 'Max concurrent warming operations reached'
      }, 200, 0);
    }

    recentWarmedShards.set(targetShardId, now);
    inFlightWarms.add(targetShardId);

    // Prune stale cache entries
    if (recentWarmedShards.size > 200) {
      for (const [s, ts] of recentWarmedShards.entries()) {
        if (now - ts > WARM_COOLDOWN_MS * 2) recentWarmedShards.delete(s);
      }
    }

    let warmShard = targetShardId;
    const warmPromise = (async () => {
      try {
        const shardSql = await resolveShardConnection({ hubSql: sql, shardId: warmShard, env });
        if (shardSql) {
          await shardSql`SELECT 1;`;
        }
      } catch (_) {
        // Non-fatal background wake-up ping
      } finally {
        if (warmShard != null) {
          inFlightWarms.delete(warmShard);
        }
      }
    })();

    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, warmPromise, `jit_warm_shard_${targetShardId}`);
    } else {
      warmPromise.catch(() => {});
    }

    return jsonResponse({
      success: true,
      warmed: true,
      shard_id: targetShardId,
      timestamp: now
    }, 200, 0);
  }

  return null;
}
