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
import { resolveShardConnection } from '../modules/sharding/fleet-router.mjs';
import { maskDatabaseUrl } from '../utils.mjs';

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
    let projects = null;
    if (env?.PIN_ENGINE_KV) {
      try {
        projects = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
      } catch (_) {}
    }
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      const cacheKey = 'fleet_projects';
      projects = await getCachedOrFetch(cacheKey, () => getFleetProjects(sql), 10000, 30000);
      if (env?.PIN_ENGINE_KV && Array.isArray(projects) && projects.length > 0) {
        safeWaitUntil(ctx, env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(projects), { expirationTtl: 86400 }), 'kv_cache_shards_map');
      }
    }

    // Security: Mask database credentials before transmitting to client
    const clientProjects = (Array.isArray(projects) ? projects : []).map(p => {
      const masked = maskDatabaseUrl(p.database_url || '');
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

    if (shardIdsToPing.length > 0) {
      const uniqueShards = Array.from(new Set(shardIdsToPing)).slice(0, 10);
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
      shards_pinged: shardIdsToPing.length
    }, 200, 0);
  }

  return null;
}
