/**
 * Cluster Intelligence & Graph Discovery Sub-Router
 * 
 * Handles endpoints for:
 * - /api/overview
 * - /api/seeds, /api/seeds/bulk, /api/seeds/bulk-delete, /api/seeds/import-raw-json
 * - /api/candidates, /api/candidates/delete
 * - /api/workflow/runs, /api/workflow/trigger
 * - /api/recgpt-playbook
 * - /api/cluster-telemetry
 * - /api/guided-search
 * - /api/intersections
 * - /api/crawl, /api/crawl-status
 * - /api/settings/cookie
 * - /api/discovery/typeahead
 */

import {
  getClusterOverviewService,
  getClusterSeedsService,
  createClusterSeedService,
  bulkCreateClusterSeedsService,
  bulkDeleteClusterSeedsService,
  deleteClusterSeedService,
  deleteCandidatesService,
  getCandidatesService,
  getRecgptPlaybookService,
  getClusterTelemetryService,
  getGuidedSearchService,
  getIntersectionsService,
  importRawJsonClusterDataService,
  getDiscoveryTypeaheadService
} from '../modules/cluster/service.mjs';

import { getGlobal24hPulseService, synthesizePinBlueprint } from '../modules/pulse/service.mjs';

/**
 * Fast URI discriminator for Cluster & Discovery routes
 */
export function isClusterRoute(pathname) {
  return pathname === '/api/pulse/24h' ||
    pathname === '/api/pulse/blueprint' ||
    pathname === '/api/overview' ||
    pathname === '/api/seeds' ||
    pathname.startsWith('/api/seeds/') ||
    pathname === '/api/candidates' ||
    pathname === '/api/candidates/delete' ||
    pathname.startsWith('/api/workflow/') ||
    pathname === '/api/recgpt-playbook' ||
    pathname === '/api/cluster-telemetry' ||
    pathname === '/api/guided-search' ||
    pathname === '/api/intersections' ||
    pathname === '/api/crawl' ||
    pathname === '/api/crawl-status' ||
    pathname === '/api/settings/cookie' ||
    pathname === '/api/discovery/typeahead';
}

/**
 * Main cluster routes handler
 */
export async function handleClusterRoutes({
  pathname,
  method,
  request,
  searchParams,
  env,
  ctx,
  sql,
  jsonResponse,
  methodNotAllowedResponse,
  clampLimit,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  safeWaitUntil,
  redactSecrets
}) {
  // 0. /api/pulse/24h (Global 24-Hour Algorithmic Pulse & Crossover Matrix)
  if (pathname === '/api/pulse/24h') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const folderId = searchParams.get('folder_id') || searchParams.get('folderId') || '';
    const windowParam = searchParams.get('window') || '24h';
    const forceRefresh = searchParams.get('force_refresh') === 'true' || searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
    const minAudience = Number(searchParams.get('min_audience') || searchParams.get('minAudience') || 0);

    try {
      const payload = await getGlobal24hPulseService(sql, env, {
        folderId,
        window: windowParam,
        forceRefresh,
        minAudience,
        ctx
      });
      return jsonResponse(payload, 200, 10);
    } catch (err) {
      console.error('[Pulse 24h Route Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'PULSE_SERVICE_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message
      }, 500);
    }
  }

  // 0B. /api/pulse/blueprint (One-Click 5-Source Scientific Pin Blueprint)
  if (pathname === '/api/pulse/blueprint') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const pinId = searchParams.get('pin_id') || searchParams.get('id') || '';
    if (!pinId) {
      return jsonResponse({ success: false, error: 'pin_id query parameter is required' }, 400);
    }
    const folderId = searchParams.get('folder_id') || searchParams.get('folderId') || '';
    const windowParam = searchParams.get('window') || '24h';

    try {
      const pulseData = await getGlobal24hPulseService(sql, env, {
        folderId,
        window: windowParam,
        ctx
      });
      const blueprint = synthesizePinBlueprint(pinId, pulseData);
      if (!blueprint) {
        return jsonResponse({ success: false, error: 'Blueprint could not be synthesized for this pin' }, 404);
      }
      return jsonResponse({ success: true, blueprint }, 200, 10);
    } catch (err) {
      console.error('[Pulse Blueprint Route Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'PULSE_SERVICE_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message
      }, 500);
    }
  }

  // 1. GET /api/overview
  if (method === 'GET' && pathname === '/api/overview') {
    const cacheKey = buildCanonicalCacheKey('api:overview', {});
    const payload = await getCachedOrFetch(cacheKey, async () => {
      return await getClusterOverviewService(sql);
    }, 30000, 120000);

    return jsonResponse(payload);
  }

  // 2A. POST /api/seeds/bulk [LITERAL MATCH BEFORE BASE]
  if (method === 'POST' && pathname === '/api/seeds/bulk') {
    const body = await request.json().catch(() => ({}));
    const rawSeeds = [];
    if (Array.isArray(body.seeds)) {
      for (const s of body.seeds) {
        const pid = String(s.pin_id || '').trim();
        if (pid && /^\d+$/.test(pid)) {
          rawSeeds.push({
            pin_id: pid,
            label: String(s.label || `Tracked Seed ${pid}`).trim(),
            is_competitor: Boolean(s.is_competitor ?? true)
          });
        }
      }
    } else if (Array.isArray(body.pin_ids)) {
      const isComp = Boolean(body.is_competitor ?? true);
      const prefix = String(body.label_prefix || 'Tracked Seed').trim();
      for (const raw of body.pin_ids) {
        const pid = String(raw || '').trim();
        if (pid && /^\d+$/.test(pid)) {
          rawSeeds.push({
            pin_id: pid,
            label: `${prefix} ${pid}`,
            is_competitor: isComp
          });
        }
      }
    }

    if (rawSeeds.length === 0) {
      return jsonResponse({ error: 'No valid numeric pin IDs provided in payload' }, 400);
    }

    const dedupSeedsMap = new Map();
    for (const s of rawSeeds) {
      if (s?.pin_id) dedupSeedsMap.set(String(s.pin_id), s);
    }
    const uniqueSeeds = Array.from(dedupSeedsMap.values());
    const inserted = await bulkCreateClusterSeedsService(sql, uniqueSeeds);

    await invalidateEdgeCache('api:overview');
    await invalidateEdgeCache('api:seeds');
    await invalidateEdgeCache('candidates');
    await invalidateEdgeCache('intersections');
    await invalidateEdgeCache('api:recgpt-playbook');
    await invalidateEdgeCache('api:cluster-telemetry');
    await invalidateEdgeCache('api:guided-search');
    return jsonResponse({ success: true, count: inserted.length, seeds: inserted }, 201);
  }

  // 2B. POST /api/seeds/bulk-delete [LITERAL MATCH BEFORE BASE]
  if (method === 'POST' && pathname === '/api/seeds/bulk-delete') {
    const body = await request.json().catch(() => ({}));
    const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids.map(p => String(p).trim()).filter(Boolean) : [];
    const purgeDatabase = Boolean(body.purge_database ?? true);

    if (pinIds.length === 0) {
      return jsonResponse({ error: 'pin_ids array is required' }, 400);
    }

    await bulkDeleteClusterSeedsService(sql, { pinIds, purgeDatabase });

    await invalidateEdgeCache('api:overview');
    await invalidateEdgeCache('api:seeds');
    await invalidateEdgeCache('candidates');
    await invalidateEdgeCache('intersections');
    await invalidateEdgeCache('api:recgpt-playbook');
    await invalidateEdgeCache('api:cluster-telemetry');
    await invalidateEdgeCache('api:guided-search');

    return jsonResponse({
      success: true,
      deleted_count: pinIds.length,
      purged_database: purgeDatabase,
      deleted_pin_ids: pinIds
    });
  }

  // 2C. POST /api/seeds/import-raw-json [LITERAL MATCH BEFORE BASE]
  if (method === 'POST' && pathname === '/api/seeds/import-raw-json') {
    const body = await request.json().catch(() => ({}));
    const seedPinId = String(body.seed_pin_id || '').trim();
    let rawJson = body.raw_json;

    if (!seedPinId) {
      return jsonResponse({ error: 'seed_pin_id is required' }, 400);
    }

    let parsedBlocks = [];
    if (typeof rawJson === 'string') {
      try {
        parsedBlocks = [JSON.parse(rawJson)];
      } catch (err) {
        return jsonResponse({ error: 'Invalid JSON payload: ' + err.message }, 400);
      }
    } else if (Array.isArray(rawJson)) {
      parsedBlocks = rawJson;
    } else if (rawJson && typeof rawJson === 'object') {
      parsedBlocks = [rawJson];
    }

    try {
      const res = await importRawJsonClusterDataService(sql, { seedPinId, parsedBlocks });
      invalidateEdgeCache('api:recgpt-playbook');
      invalidateEdgeCache('api:cluster-telemetry');
      invalidateEdgeCache('api:guided-search');
      return jsonResponse({
        success: true,
        candidates_imported: res.candidates_imported,
        capsules_imported: res.capsules_imported,
        authoritative_counts: res.authoritative_counts
      });
    } catch (err) {
      return jsonResponse({ error: err.message }, 400);
    }
  }

  // 2D. Base /api/seeds operations (GET, POST, DELETE)
  if (pathname === '/api/seeds') {
    if (method === 'GET') {
      const cacheKey = buildCanonicalCacheKey('api:seeds', {});
      const seeds = await getCachedOrFetch(cacheKey, async () => {
        return await getClusterSeedsService(sql);
      }, 30000, 120000);

      return jsonResponse(seeds);
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pinId = String(body.pin_id || '').trim();
      const label = String(body.label || 'Manual Tracked Seed').trim();
      const isCompetitor = Boolean(body.is_competitor ?? true);

      if (!pinId) {
        return jsonResponse({ error: 'pin_id is required' }, 400);
      }

      const seed = await createClusterSeedService(sql, { pinId, label, isCompetitor });
      await invalidateEdgeCache('api:overview');
      await invalidateEdgeCache('api:seeds');
      await invalidateEdgeCache('candidates');
      await invalidateEdgeCache('intersections');
      await invalidateEdgeCache('api:recgpt-playbook');
      await invalidateEdgeCache('api:cluster-telemetry');
      await invalidateEdgeCache('api:guided-search');
      return jsonResponse({ success: true, seed }, 201);
    }

    if (method === 'DELETE') {
      const pinId = searchParams.get('pin_id');
      const purgeData = searchParams.get('purge_data') === 'true' || searchParams.get('purge_database') === 'true';
      if (!pinId) {
        return jsonResponse({ error: 'pin_id query parameter is required' }, 400);
      }
      await deleteClusterSeedService(sql, { pinId, purgeData });
      await invalidateEdgeCache('api:overview');
      await invalidateEdgeCache('api:seeds');
      await invalidateEdgeCache('candidates');
      await invalidateEdgeCache('intersections');
      await invalidateEdgeCache('api:recgpt-playbook');
      await invalidateEdgeCache('api:cluster-telemetry');
      await invalidateEdgeCache('api:guided-search');

      return jsonResponse({ success: true, deleted_pin_id: pinId, purged_database: purgeData });
    }
  }

  // 3A. POST /api/candidates/delete [LITERAL MATCH BEFORE BASE]
  if (method === 'POST' && pathname === '/api/candidates/delete') {
    const body = await request.json().catch(() => ({}));
    const candIds = Array.isArray(body.candidate_pin_ids) ? body.candidate_pin_ids.map(c => String(c).trim()).filter(Boolean) : [];
    const seedPinId = body.seed_pin_id ? String(body.seed_pin_id).trim() : null;

    if (candIds.length === 0) {
      return jsonResponse({ error: 'candidate_pin_ids array is required' }, 400);
    }

    await deleteCandidatesService(sql, { candIds, seedPinId });

    invalidateEdgeCache('api:recgpt-playbook');
    invalidateEdgeCache('api:cluster-telemetry');
    invalidateEdgeCache('api:guided-search');
    return jsonResponse({ success: true, deleted_count: candIds.length });
  }

  // 3B. GET /api/candidates
  if (method === 'GET' && pathname === '/api/candidates') {
    const seedPinId = searchParams.get('seed_pin_id');
    const limit = clampLimit(searchParams.get('limit'), 1000, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
    const query = (searchParams.get('q') || '').trim();
    const sort = (searchParams.get('sort') || 'saves').toLowerCase();

    const cacheKey = buildCanonicalCacheKey('candidates', {
      seed_pin_id: seedPinId,
      limit,
      offset,
      q: query,
      sort
    });

    const enriched = await getCachedOrFetch(cacheKey, async () => {
      return await getCandidatesService(sql, { seedPinId, limit, offset, query, sort });
    }, 8000, 30000);

    return jsonResponse(enriched, 200, 8);
  }

  // 4. GET /api/workflow/runs (Cloudflare Worker GitHub API integration)
  if (method === 'GET' && pathname === '/api/workflow/runs') {
    const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
    const repo = 'sayfedin-star/pin-arbitrage-engine';
    try {
      const headers = {
        'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
        'Accept': 'application/vnd.github.v3+json'
      };
      if (ghToken) {
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        headers['Authorization'] = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
      }
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/runs?per_page=15`, { headers });
      if (res.ok) {
        const data = await res.json();
        const formatted = (data.workflow_runs || []).map(r => ({
          databaseId: r.id,
          status: r.status,
          conclusion: r.conclusion,
          createdAt: r.created_at,
          url: r.html_url,
          event: r.event,
          displayTitle: r.display_title || r.name,
          headBranch: r.head_branch
        }));
        return jsonResponse(formatted);
      }
      if (res?.body) await res.body.cancel().catch(() => {});
      return jsonResponse([]);
    } catch (e) {
      return jsonResponse([]);
    }
  }

  // 5. POST /api/workflow/trigger (Cloudflare Worker GitHub API dispatch)
  if (method === 'POST' && pathname === '/api/workflow/trigger') {
    const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
    if (!ghToken) {
      return jsonResponse({
        success: false,
        error: 'GitHub Token secret not configured in Cloudflare Workers settings. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret.'
      }, 400);
    }
    const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const body = await request.json().catch(() => ({}));
    let target = '';
    if (Array.isArray(body.seed_pin_ids) && body.seed_pin_ids.length > 0) {
      target = body.seed_pin_ids.map(s => {
        const m = String(s).match(/\d{10,25}/);
        return m ? m[0] : String(s).trim();
      }).filter(Boolean).join(',');
    } else if (body.seed_pin_id) {
      target = String(body.seed_pin_id).split(',').map(s => {
        const m = String(s).match(/\d{10,25}/);
        return m ? m[0] : String(s).trim();
      }).filter(Boolean).join(',');
    }
    const maxPages = body.max_pages ? String(body.max_pages).trim() : '60';

    const repo = 'sayfedin-star/pin-arbitrage-engine';
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/dispatches`, {
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
          seed_pin_id: target,
          max_pages: maxPages
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok || res.status === 204) {
      if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      return jsonResponse({
        success: true,
        seed_pin_id: target || 'all_queued',
        max_pages: maxPages,
        message: 'Workflow dispatched successfully to GitHub Actions.'
      });
    } else {
      const errText = await res.text();
      let errDetail = errText;
      if (res.status === 401) {
        errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
      }
      return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errDetail}` }, res.status);
    }
  }

  // 6. GET /api/recgpt-playbook
  if (method === 'GET' && pathname === '/api/recgpt-playbook') {
    const seedPinId = searchParams.get('seed_pin_id');
    const cacheKey = buildCanonicalCacheKey('api:recgpt-playbook', {
      seed_pin_id: seedPinId || 'all'
    });

    const playbookData = await getCachedOrFetch(cacheKey, async () => {
      return await getRecgptPlaybookService(sql, { seedPinId });
    }, 20000, 60000);

    return jsonResponse(playbookData, 200, 20);
  }

  // 7. GET /api/cluster-telemetry
  if (method === 'GET' && pathname === '/api/cluster-telemetry') {
    const seedPinIdParam = searchParams.get('seed_pin_id') || '';
    const cacheKey = buildCanonicalCacheKey('api:cluster-telemetry', {
      seed_pin_id: seedPinIdParam
    });

    const telemetryData = await getCachedOrFetch(cacheKey, async () => {
      return await getClusterTelemetryService(sql, { seedPinIdParam });
    }, 20000, 60000);

    return jsonResponse(telemetryData, 200, 20);
  }

  // 8. GET /api/guided-search
  if (method === 'GET' && pathname === '/api/guided-search') {
    const seedPinId = searchParams.get('seed_pin_id');
    const cacheKey = buildCanonicalCacheKey('api:guided-search', {
      seed_pin_id: seedPinId || 'all'
    });

    const rows = await getCachedOrFetch(cacheKey, async () => {
      return await getGuidedSearchService(sql, { seedPinId });
    }, 20000, 60000);

    return jsonResponse(rows, 200, 20);
  }

  // 9. GET /api/intersections
  if (method === 'GET' && pathname === '/api/intersections') {
    const minOverlap = Number(searchParams.get('min_overlap')) || 2;
    const limit = clampLimit(searchParams.get('limit'), 1000, 1000);

    const cacheKey = buildCanonicalCacheKey('intersections', {
      min_overlap: minOverlap,
      limit
    });

    try {
      const enrichedRows = await getCachedOrFetch(cacheKey, async () => {
        return await getIntersectionsService(sql, { minOverlap, limit });
      }, 8000, 30000);

      return jsonResponse(Array.isArray(enrichedRows) ? enrichedRows : [], 200, 8);
    } catch (err) {
      console.error('[Intersections Error]', err.message);
      return jsonResponse([], 200);
    }
  }

  // 10. POST /api/crawl (Serverless trigger info)
  if (method === 'POST' && pathname === '/api/crawl') {
    return jsonResponse({
      status: 'info',
      message: 'Background crawls are executed serverlessly via GitHub Actions. Please trigger the GitHub Actions workflow cluster-intelligence.yml or run locally with npm run crawl.',
      action_url: 'https://github.com/sayfedin-star/pin-arbitrage-engine/actions'
    });
  }

  // 11. GET /api/crawl-status
  if (method === 'GET' && pathname === '/api/crawl-status') {
    return jsonResponse({
      is_crawling: false,
      mode: 'github_actions_pipeline',
      message: 'Managed in GitHub Actions'
    });
  }

  // 12. GET /api/settings/cookie
  if (method === 'GET' && pathname === '/api/settings/cookie') {
    const { getEffectivePinterestCookie, DEFAULT_PINTEREST_SESSION_COOKIE } = await import('../modules/keywords/settings.mjs');
    const envCookie = env?.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : '') || '';
    const effective = await getEffectivePinterestCookie(sql, envCookie).catch(() => envCookie || DEFAULT_PINTEREST_SESSION_COOKIE);
    const hasCookie = Boolean(effective && effective.trim().length > 10);
    return jsonResponse({
      has_cookie: hasCookie,
      is_configured: hasCookie,
      preview: hasCookie ? `${effective.slice(0, 42)}...` : '',
      source: sql ? 'database_or_env' : 'node_native_env'
    });
  }

  // 13. POST /api/settings/cookie
  if (method === 'POST' && pathname === '/api/settings/cookie') {
    const { savePinterestCookie } = await import('../modules/keywords/settings.mjs');
    const body = await request.json().catch(() => ({}));
    const rawCookie = String(body.cookie || '').trim();
    const saved = await savePinterestCookie(sql, rawCookie).catch((err) => {
      console.warn('[Cookie Save Warning]', err.message);
      return {
        raw: rawCookie,
        formatted: rawCookie,
        has_cookie: Boolean(rawCookie && rawCookie.length > 10),
        preview: rawCookie ? `${rawCookie.slice(0, 42)}...` : ''
      };
    });
    if (env && typeof env === 'object') {
      env.PINTEREST_COOKIE = saved.formatted;
    }
    return jsonResponse({
      success: true,
      has_cookie: saved.has_cookie,
      is_configured: saved.has_cookie,
      preview: saved.preview,
      formatted_cookie: saved.formatted,
      source: 'database',
      note: 'Cookie persisted to PostgreSQL app_settings and activated for SERP & Competitor crawlers.'
    });
  }

  // 14. GET /api/discovery/typeahead
  if (pathname === '/api/discovery/typeahead') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('query') || '';
    const cleanQ = String(q || '').trim();
    try {
      const result = await getDiscoveryTypeaheadService({ cleanQ });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'INTERNAL_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message
      }, 500);
    }
  }

  return null;
}
