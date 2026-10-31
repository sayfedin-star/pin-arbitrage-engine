/**
 * Keywords, Folders & Settings Sub-Router
 * 
 * Handles all keyword velocity tracker, campaign folder, crossover matrix,
 * trends, guides, serp-comparison, and app settings endpoints.
 */

import {
  listKeywords,
  addKeyword,
  resolveKeywordBySlug,
  crawlKeywordSERP,
  getKeywordPins,
  fetchKeywordTypeahead,
  fetchVisualSearchLens,
  getKeywordGuides,
  getKeywordSERPComparison,
  getKeywordIntelligence,
  getKeywordDisplacedPins,
  getPinPerformanceTrajectory,
  getPinDeepDossier,
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings
} from '../modules/keywords/service.mjs';

import {
  fetchPinterestTrends,
  fetchPinterestTrendsPopularPins,
  fetchKeywordRelatedInterests
} from '../modules/keywords/trends-service.mjs';

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
  calculateFolderCrossover,
  normalizeFolderMetadata,
  listFolderCreators,
  listFolderCreatorsWithDiscovery,
  linkCreatorToFolder,
  unlinkCreatorFromFolder,
  listFolderPinnedDomains,
  listPinnedDomains,
  pinDomainToFolder,
  unpinDomainFromFolder,
  pruneFolderPins,
  cacheFolderTrends,
  invalidateFolderCache,
  bulkPulseTrackFolderCreators,
  toggleFolderCreatorTracking
} from '../modules/keywords/folders-service.mjs';

import {
  getPinShardId,
  resolveShardConnection
} from '../modules/sharding/fleet-router.mjs';

import { escapeSqlWildcards } from '../utils.mjs';
import { sanitizeDestinationUrl, fetchUrlGlobalSaves } from '../../scripts/lib/pinterest.mjs';

/**
 * Fast URI discriminator for Keywords & Folders routes
 */
export function isKeywordsRoute(pathname) {
  return pathname === '/api/keywords' ||
    pathname.startsWith('/api/keywords/') ||
    pathname === '/api/settings' ||
    pathname === '/api/search/autocomplete' ||
    pathname === '/api/folders' ||
    pathname.startsWith('/api/folders/') ||
    pathname === '/api/campaign-folders' ||
    pathname.startsWith('/api/campaign-folders/') ||
    pathname === '/api/urls/global-saves' ||
    pathname === '/api/urls/batch-global-saves';
}

/**
 * Main keywords & folders handler
 */
export async function handleKeywordsRoutes({
  pathname,
  method,
  request,
  searchParams,
  env,
  ctx,
  sql,
  targetSql,
  jsonResponse,
  methodNotAllowedResponse,
  clampLimit,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  safeWaitUntil,
  readKeywordsFromD1,
  syncKeywordsCatalogToD1,
  syncKeywordsBatchToD1,
  syncKeywordToD1,
  evictKeywordsCatalogFromD1,
  syncFolderToD1,
  deleteFolderFromD1,
  getPinKvKeysToEvict,
  isValidPinId,
  tripPinterestCircuitBreaker,
  redactSecrets
}) {
  // 0A. GET /api/urls/global-saves?url=...
  if (pathname === '/api/urls/global-saves') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const rawUrl = searchParams.get('url') || searchParams.get('destination_url') || '';
    if (!rawUrl) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Missing url query parameter' }, 400);
    }
    const cleanUrl = sanitizeDestinationUrl(rawUrl);
    if (!cleanUrl) {
      return jsonResponse({ ok: false, error: 'BAD_REQUEST', message: 'Invalid destination url' }, 400);
    }
    const kvKey = `url_saves:${cleanUrl}`;

    if (env?.PIN_ENGINE_KV) {
      try {
        const cached = await env.PIN_ENGINE_KV.get(kvKey, 'json');
        if (cached && typeof cached.count === 'number') {
          return jsonResponse({
            ok: true,
            url: cleanUrl,
            count: cached.count,
            global_saves: cached.count,
            cached: true
          }, 200, 86400);
        }
      } catch (_) {}
    }

    try {
      const fetchRes = await fetchUrlGlobalSaves(cleanUrl);
      const count = Number(fetchRes?.count || 0);
      if (fetchRes && fetchRes.ok) {
        if (env?.PIN_ENGINE_KV) {
          safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(kvKey, JSON.stringify({ url: cleanUrl, count }), { expirationTtl: 86400 }).catch(() => {}), 'kv_put_url_saves');
        }
        if (sql && count > 0) {
          safeWaitUntil(ctx, (async () => {
            await sql`
              UPDATE keyword_serp_current
              SET url_global_saves = ${count}
              WHERE destination_url = ${cleanUrl}
                 OR destination_url = ${cleanUrl + '/'}
                 OR destination_url LIKE ${cleanUrl + '?%'};
            `.catch(() => {});
          })(), 'write_back_single_url_global_saves');
        }
        return jsonResponse({
          ok: true,
          url: cleanUrl,
          count,
          global_saves: count
        }, 200, 86400);
      }
      return jsonResponse({
        ok: false,
        url: cleanUrl,
        count: 0,
        global_saves: 0,
        error: fetchRes?.error || 'FETCH_FAILED'
      }, 502);
    } catch (err) {
      return jsonResponse({ ok: false, url: cleanUrl, count: 0, global_saves: 0, error: err.message }, 500);
    }
  }

  // 0B. POST /api/urls/batch-global-saves
  if (pathname === '/api/urls/batch-global-saves') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    const rawList = Array.isArray(body?.urls) ? body.urls : (Array.isArray(body?.destination_urls) ? body.destination_urls : []);
    const cleanUrls = Array.from(new Set(rawList.map(u => sanitizeDestinationUrl(u)).filter(Boolean))).slice(0, 15);

    if (cleanUrls.length === 0) {
      return jsonResponse({ ok: true, results: {}, counts: {}, total: 0 });
    }

    const results = {};
    const uncached = [];

    if (env?.PIN_ENGINE_KV) {
      try {
        const kvResults = await Promise.all(
          cleanUrls.map(async (u) => {
            const cached = await env.PIN_ENGINE_KV.get(`url_saves:${u}`, 'json').catch(() => null);
            return { url: u, cached };
          })
        );
        for (const item of kvResults) {
          if (item?.cached && typeof item.cached.count === 'number') {
            results[item.url] = item.cached.count;
          } else {
            uncached.push(item.url);
          }
        }
      } catch (_) {
        uncached.push(...cleanUrls);
      }
    } else {
      uncached.push(...cleanUrls);
    }

    const writeBackEntries = [];
    if (uncached.length > 0) {
      const fetchResults = await Promise.allSettled(
        uncached.map(u => fetchUrlGlobalSaves(u))
      );

      for (let i = 0; i < uncached.length; i++) {
        const targetUrl = uncached[i];
        const res = fetchResults[i];
        if (res.status === 'fulfilled' && res.value?.ok) {
          const count = Number(res.value.count || 0);
          results[targetUrl] = count;
          writeBackEntries.push({ url: targetUrl, count });
          if (env?.PIN_ENGINE_KV) {
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(
              `url_saves:${targetUrl}`,
              JSON.stringify({ url: targetUrl, count }),
              { expirationTtl: 86400 }
            ).catch(() => {}), 'kv_batch_url_saves');
          }
        } else {
          results[targetUrl] = 0;
        }
      }
    }

    // Write-Back UPDATE to keyword_serp_current.url_global_saves via safeWaitUntil
    if (sql && writeBackEntries.length > 0) {
      safeWaitUntil(ctx, (async () => {
        for (const entry of writeBackEntries) {
          if (entry.count > 0 && entry.url) {
            await sql`
              UPDATE keyword_serp_current
              SET url_global_saves = ${entry.count}
              WHERE destination_url = ${entry.url}
                 OR destination_url = ${entry.url + '/'}
                 OR destination_url LIKE ${entry.url + '?%'};
            `.catch(() => {});
          }
        }
      })(), 'write_back_batch_global_saves');
    }

    return jsonResponse({
      ok: true,
      results,
      counts: results,
      total: Object.keys(results).length
    });
  }

  // 1. GET /api/keywords
  if (method === 'GET' && pathname === '/api/keywords') {
    const search = searchParams.get('search') || '';
    const limit = clampLimit(searchParams.get('limit'), 1000, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const folderId = searchParams.get('folder_id') ? Number(searchParams.get('folder_id')) : (searchParams.get('folder') ? Number(searchParams.get('folder')) : null);

    // Check D1 Edge Keywords Catalog first (Sub-5ms Edge Reads)
    // When folderId is provided, bypass generic D1 full-catalog read so authoritative folder-scoped keywords are returned
    if (!folderId && !forceRefresh && env?.PIN_D1_DB && readKeywordsFromD1) {
      try {
        const d1Keywords = await readKeywordsFromD1(env, { search, limit, offset });
        if (Array.isArray(d1Keywords) && d1Keywords.length > 0) {
          return jsonResponse({
            success: true,
            keywords: d1Keywords,
            source: 'd1_edge'
          }, 200, 15);
        }
      } catch (d1Err) {
        console.warn('[D1 Keywords Read Error]', redactSecrets ? redactSecrets(d1Err.message) : d1Err.message);
      }
    }

    const cacheKey = buildCanonicalCacheKey('keywords:hub', {
      search,
      limit,
      offset,
      folder_id: folderId
    });

    if (forceRefresh) {
      // [INVARIANT: ZERO-BLACKOUT-D1-CATALOG]
      // Invalidate edge memory cache; do not blank D1 SQLite table during refresh
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache(cacheKey);
    }

    try {
      const keywords = await getCachedOrFetch(cacheKey, async () => {
        return await listKeywords(sql, {
          search,
          limit,
          offset,
          folderId
        });
      }, 30000, 120000, { forceRefresh });

      if (!folderId && Array.isArray(keywords) && keywords.length > 0 && env?.PIN_D1_DB) {
        if (!search && limit >= 1000) {
          safeWaitUntil(ctx, syncKeywordsCatalogToD1(env, keywords, { isFullCatalog: true }), 'syncKeywordsCatalogToD1');
        } else if (!search) {
          safeWaitUntil(ctx, (async () => {
            try {
              const fullCatalog = await listKeywords(sql, { limit: 1000 });
              await syncKeywordsCatalogToD1(env, fullCatalog, { isFullCatalog: true });
            } catch (_) {}
          })(), 'warmFullKeywordsCatalogToD1');
        } else {
          safeWaitUntil(ctx, syncKeywordsCatalogToD1(env, keywords, { isFullCatalog: false }), 'syncKeywordsCatalogToD1');
        }
        safeWaitUntil(ctx, syncKeywordsBatchToD1(env, keywords), 'syncKeywordsBatchToD1');
      }

      return jsonResponse({
        success: true,
        keywords: Array.isArray(keywords) ? keywords : [],
        source: 'neon_hub'
      }, 200, 8);
    } catch (err) {
      console.error('[Keywords Error]', err.message);
      return jsonResponse({ success: true, degraded: true, keywords: [] }, 200, 0);
    }
  }

  // 2. POST /api/keywords
  if (method === 'POST' && pathname === '/api/keywords') {
    invalidateEdgeCache('keywords');
    const body = await request.json().catch(() => ({}));
    const row = await addKeyword(sql, body);
    if (row && syncKeywordToD1) {
      safeWaitUntil(ctx, syncKeywordToD1(env, row), 'syncKeywordToD1');
    }
    return jsonResponse({ success: true, keyword: row });
  }

  // 3. GET /api/keywords/resolve
  if (method === 'GET' && pathname === '/api/keywords/resolve') {
    const slug = searchParams.get('slug') || searchParams.get('keyword') || searchParams.get('q');
    if (!slug) return jsonResponse({ error: 'slug or keyword query parameter is required' }, 400);
    // [INVARIANT: READ-ONLY-GET-SAFE] Auto-creation is strictly disabled by default on GET endpoints
    const autoCreate = searchParams.get('auto_create') === 'true';
    const row = await resolveKeywordBySlug(sql, slug, autoCreate);
    if (!row) return jsonResponse({ error: 'Keyword not found and could not be resolved' }, 404);
    if (row && syncKeywordToD1) {
      safeWaitUntil(ctx, syncKeywordToD1(env, row), 'syncKeywordToD1');
    }
    return jsonResponse({ success: true, keyword: row });
  }

  // 4. POST /api/keywords/sync
  if (method === 'POST' && pathname === '/api/keywords/sync') {
    invalidateEdgeCache('keywords');
    const body = await request.json().catch(() => ({}));
    let keywordId = Number(body.keyword_id || body.id);
    const slug = body.slug || body.keyword;
    let resolvedKw = null;
    if (!keywordId && slug) {
      resolvedKw = await resolveKeywordBySlug(sql, slug, true);
      if (resolvedKw) keywordId = resolvedKw.id;
    }
    if (!keywordId) return jsonResponse({ error: 'keyword_id or slug is required' }, 400);
    const force = Boolean(body.force);
    const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
    const crawlPages = body.crawl_pages || body.max_pages;
    const maxPins = body.max_pins;
    const res = await crawlKeywordSERP(sql, keywordId, { 
      cookie, 
      force,
      crawl_pages: Math.min(2, Number(crawlPages) || 2),
      max_pins: maxPins,
      skip_top_enrich: true,
      env
    });

    // [INVARIANT: EDGE-ONLY-SERP-DISCOVERY]
    // Table row re-crawls and synchronous SERP queries are strictly edge-only (< 2s).
    // Workflow dispatch to GitHub Actions occurs only when explicitly opted in via dispatch_workflow === true.
    const autoDispatch = body.dispatch_workflow === true;
    const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
    if (autoDispatch && token && res?.success) {
      const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
      const targetKw = res.keyword || body.target_keyword || body.keyword || resolvedKw?.keyword || '';
      const maxPinsInput = String(body.max_pins || resolvedKw?.target_pin_count || '50');
      const crawlScopeInput = String(body.crawl_scope || 'all_pins');
      // [INVARIANT: EDGE-ONLY-SERP-DISCOVERY]
      // When auto-dispatched from sync, SERP was already scraped on Edge (< 2s). Default enable_serp_harvest to 'false' unless explicitly overridden.
      const enableSerpHarvestInput = body.enable_serp_harvest !== undefined
        ? String(body.enable_serp_harvest)
        : 'false';
      const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
      const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
      const dispatchPromise = (async () => {
        try {
          const dRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`, {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': authHeader,
              'User-Agent': 'Pin-Arbitrage-Engine'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                target_keyword: targetKw,
                crawl_scope: crawlScopeInput,
                max_pins: maxPinsInput,
                enable_serp_harvest: enableSerpHarvestInput
              }
            })
          });
          if (dRes?.body && !dRes.bodyUsed) await dRes.body.cancel().catch(() => {});
        } catch (_) {}
      })();
      safeWaitUntil(ctx, dispatchPromise, 'github_workflow_dispatch');
    }

    // Asynchronously sync keyword autocomplete to D1 database
    if (res?.success && (res?.keyword || slug)) {
      if (syncKeywordToD1) {
        safeWaitUntil(ctx, syncKeywordToD1(env, {
          keyword: res.keyword || slug,
          search_volume: res.search_volume || 0,
          monthly_growth: res.monthly_growth || 0,
          pin_count: res.pins_collected || res.pin_count || 0
        }), 'syncKeywordToD1');
      }
    } else if (res?.status === 429 || res?.status === 403 || (res?.error && typeof res.error === 'string' && (res.error.includes('429') || res.error.includes('403')))) {
      if (tripPinterestCircuitBreaker) {
        safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, `HTTP ${res?.status || 429} Rate Limit/Block in /api/keywords/sync`, 900), 'tripPinterestCircuitBreaker');
      }
    }

    return jsonResponse({
      success: true,
      status: res?.success ? 'success' : 'accepted',
      keyword_id: keywordId,
      result: {
        success: res?.success ?? true,
        status: res?.success ? 'completed' : 'accepted',
        crawled_pins: res?.crawled_pins ?? res?.pins_collected ?? (res?.success ? 1 : 0),
        message: res?.message || (res?.success ? 'Dispatched and synchronized successfully' : 'Dispatched asynchronously'),
        ...res
      }
    });
  }

  // 5. GET /api/settings
  if (method === 'GET' && pathname === '/api/settings') {
    const settings = await getAppSettings(sql);
    return jsonResponse({ success: true, settings }, 200, 60);
  }

  // 6. POST /api/settings
  if (method === 'POST' && pathname === '/api/settings') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('settings');
    const body = await request.json().catch(() => ({}));
    const updated = await updateAppSettings(sql, body);
    return jsonResponse({ success: true, settings: updated });
  }

  // 7. POST /api/keywords/settings
  if (method === 'POST' && pathname === '/api/keywords/settings') {
    invalidateEdgeCache('keywords');
    const body = await request.json().catch(() => ({}));
    const keywordId = Number(body.keyword_id);
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const updated = await updateKeywordSettings(sql, keywordId, body);
    return jsonResponse({ success: true, keyword: updated });
  }

  // 8. POST /api/keywords/status || /api/keywords/toggle
  if (method === 'POST' && (pathname === '/api/keywords/status' || pathname === '/api/keywords/toggle')) {
    invalidateEdgeCache('keywords');
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id || body.keyword_id);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : undefined;

    if (ids.length > 0) {
      if (isActive !== undefined) {
        await sql`
          UPDATE tracked_keywords 
          SET is_active = ${isActive}, updated_at = NOW() 
          WHERE id = ANY(${ids});
        `;
      } else {
        await sql`
          UPDATE tracked_keywords 
          SET is_active = NOT COALESCE(is_active, TRUE), updated_at = NOW() 
          WHERE id = ANY(${ids});
        `;
      }
      return jsonResponse({ success: true, updated_ids: ids, is_active: isActive });
    }

    if (!id) return jsonResponse({ error: 'id, keyword_id, or ids array is required' }, 400);

    let row;
    if (isActive !== undefined) {
      [row] = await sql`
        UPDATE tracked_keywords 
        SET is_active = ${isActive}, updated_at = NOW() 
        WHERE id = ${id} 
        RETURNING *;
      `;
    } else {
      [row] = await sql`
        UPDATE tracked_keywords 
        SET is_active = NOT COALESCE(is_active, TRUE), updated_at = NOW() 
        WHERE id = ${id} 
        RETURNING *;
      `;
    }
    return jsonResponse({ success: true, keyword: row });
  }

  // 9. DELETE /api/keywords
  if (method === 'DELETE' && pathname === '/api/keywords') {
    invalidateEdgeCache('keywords');
    let id = searchParams.get('id');
    let keyword = searchParams.get('keyword');
    let body = {};
    try {
      body = await request.json();
      id = id || body.id || body.keyword_id;
      keyword = keyword || body.keyword;
    } catch (_) {}

    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Boolean) : [];
    let targetIds = [];
    if (ids.length > 0) {
      targetIds = ids;
    } else if (id && !isNaN(Number(id))) {
      targetIds = [Number(id)];
    } else if (keyword) {
      const cleanKeyword = keyword.toLowerCase().trim();
      const rows = await sql`SELECT id FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
      targetIds = rows.map(r => Number(r.id)).filter(Boolean);
    }

    if (targetIds.length === 0) {
      return jsonResponse({ error: 'id, keyword, or ids array is required to delete tracked keyword' }, 400);
    }

    // 1. Ensure persistent distributed tombstone table exists on Central Hub
    await sql`
      CREATE TABLE IF NOT EXISTS keyword_tombstones (
        keyword_id INT PRIMARY KEY,
        keyword TEXT,
        deleted_at TIMESTAMPTZ DEFAULT NOW(),
        shards_purged BOOLEAN DEFAULT FALSE,
        purged_at TIMESTAMPTZ
      );
    `.catch(() => {});

    // 2. Fetch keyword metadata for the tombstone audit trail
    const existingKw = await sql`
      SELECT id, keyword FROM tracked_keywords WHERE id = ANY(${targetIds});
    `.catch(() => []);

    // 3. Record tombstones for Shard Janitor GC (initiating 99 Shards cleanup lifecycle)
    if (existingKw.length > 0) {
      await sql`
        INSERT INTO keyword_tombstones (keyword_id, keyword, deleted_at, shards_purged)
        SELECT u.id, u.keyword, NOW(), FALSE
        FROM jsonb_to_recordset(${JSON.stringify(existingKw)}::jsonb) AS u(id int, keyword text)
        ON CONFLICT (keyword_id) DO UPDATE SET deleted_at = NOW(), shards_purged = FALSE;
      `.catch(() => {});
    }

    // 4. Clean Central Hub items & execute deletion from tracked_keywords
    await sql`DELETE FROM keyword_serp_current WHERE keyword_id = ANY(${targetIds});`.catch(() => {});
    await sql`DELETE FROM keyword_folder_items WHERE keyword_id = ANY(${targetIds});`.catch(() => {});
    await sql`DELETE FROM tracked_keywords WHERE id = ANY(${targetIds});`;

    return jsonResponse({ success: true, deleted_ids: targetIds });
  }

  // 10. DELETE /api/keywords/:keywordId/pins/:pinId (Manual Pin Catalog Deletion Directive)
  if (pathname.startsWith('/api/keywords/') && pathname.includes('/pins/')) {
    const parts = pathname.slice('/api/keywords/'.length).split('/').filter(Boolean);
    // Expected URL pattern: /api/keywords/:keywordId/pins/:pinId -> parts: [keywordId, 'pins', pinId]
    if (parts[1] === 'pins' && parts[2]) {
      if (method !== 'DELETE') {
        return methodNotAllowedResponse('DELETE, OPTIONS');
      }
      const keywordId = Number(parts[0]);
      const pinId = parts[2];
      if (!keywordId || isNaN(keywordId)) {
        return jsonResponse({ success: false, error: 'BAD_REQUEST', message: 'Valid numeric keywordId is required' }, 400);
      }
      if (!pinId || !isValidPinId(pinId)) {
        return jsonResponse({ success: false, error: 'INVALID_PIN_ID', message: 'Valid pinId is required (numeric Snowflake, 10-30 digits)' }, 400);
      }

      invalidateEdgeCache('keywords');

      // Phase 2: Tombstone Architecture - Record in keyword_ignored_pins to prevent zombie pin resurrection
      await sql`
        INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
        VALUES (${keywordId}, ${pinId}, 'manual_user_deletion', NOW())
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          ignored_reason = EXCLUDED.ignored_reason,
          ignored_at = EXCLUDED.ignored_at;
      `.catch((err) => {
        console.warn('[Tombstone] Failed to record ignored pin:', err.message);
      });

      // Manual Deletion Only Directive: remove from unified keyword catalog & keyword snapshots & displaced vault
      const delRes = await sql`
        DELETE FROM keyword_serp_current
        WHERE keyword_id = ${keywordId} AND pin_id = ${pinId}
        RETURNING pin_id;
      `;
      // [INVARIANT: ZERO-HUB-SNAPSHOTS] Target Shard pin_serp_positions directly; Central Hub has zero snapshots
      const targetShardId = getPinShardId(pinId, 99);
      const targetShardSql = await resolveShardConnection({ hubSql: sql, shardId: targetShardId, env }).catch(() => null);
      if (targetShardSql) {
        await targetShardSql`DELETE FROM pin_serp_positions WHERE pin_id = ${pinId} AND keyword_id = ${keywordId};`.catch(() => {});
      }
      await sql`
        DELETE FROM keyword_displaced_index
        WHERE keyword_id = ${keywordId} AND pin_id = ${pinId};
      `.catch(() => {});

      if (env?.PIN_ENGINE_KV) {
        const evictions = getPinKvKeysToEvict(pinId, [keywordId]).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
        evictions.push(
          env.PIN_ENGINE_KV.delete(`serp:comp:${keywordId}`).catch(() => {}),
          env.PIN_ENGINE_KV.delete(`displaced:kw:${keywordId}:50:0`).catch(() => {}),
          env.PIN_ENGINE_KV.delete(`displaced:kw:${keywordId}:100:0`).catch(() => {})
        );
        safeWaitUntil(ctx, Promise.all(evictions), 'kv_delete_keyword_pin_cache');
      }

      return jsonResponse({
        success: true,
        deleted: delRes.length > 0,
        keyword_id: keywordId,
        pin_id: pinId,
        message: `Pin ${pinId} manually removed and tombstoned for keyword #${keywordId}.`
      }, 200);
    }
  }

  // 11. GET /api/keywords/pins
  if (method === 'GET' && pathname === '/api/keywords/pins') {
    let keywordId = Number(searchParams.get('keyword_id'));
    const slug = searchParams.get('slug') || searchParams.get('keyword');
    if (!keywordId && slug) {
      const resolved = await resolveKeywordBySlug(sql, slug, false);
      if (resolved) keywordId = resolved.id;
    }
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const cacheKey = buildCanonicalCacheKey('keywords:pins', { keyword_id: keywordId, slug: slug || '' });
    const result = await getCachedOrFetch(cacheKey, async () => {
      const pins = await getKeywordPins(sql, keywordId);
      return { success: true, pins };
    }, 30000, 120000);
    return jsonResponse(result, 200, 15);
  }

  // 12. GET /api/keywords/typeahead
  if (method === 'GET' && pathname === '/api/keywords/typeahead') {
    const q = searchParams.get('q') || searchParams.get('term') || '';
    const result = await fetchKeywordTypeahead(q);
    return jsonResponse(result);
  }

  // 13. Edge-Native Search Autocomplete API via Cloudflare D1
  if (method === 'GET' && (pathname === '/api/search/autocomplete' || pathname === '/api/keywords/autocomplete')) {
    const q = String(searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q) {
      return jsonResponse({ success: true, results: [] });
    }

    // 1. Primary Edge Query: Cloudflare D1 Database
    if (env?.PIN_D1_DB) {
      try {
        const stmt = env.PIN_D1_DB.prepare(
          "SELECT keyword, search_volume, pin_count FROM search_autocomplete_index WHERE keyword LIKE ? LIMIT 10"
        ).bind(`${q}%`);
        const d1Res = await stmt.all();
        const rows = d1Res?.results || [];
        if (rows.length > 0) {
          return jsonResponse({ success: true, source: 'd1_edge', results: rows }, 200, 30);
        }
      } catch (err) {
        console.warn('[D1 Autocomplete] Non-fatal D1 query error:', redactSecrets ? redactSecrets(err.message) : err.message);
      }
    }

    // 2. Graceful Fallback: Neon Postgres Central Hub
    try {
      const cleanQ = (q && typeof q === 'string' && q.trim()) ? escapeSqlWildcards(q.toLowerCase().trim()) : '';
      const likePattern = `${cleanQ}%`;
      const rows = cleanQ ? await sql`
        SELECT keyword, COALESCE(target_pin_count, 0) as search_volume, COALESCE(target_pin_count, 0) as pin_count
        FROM tracked_keywords
        WHERE LOWER(keyword) LIKE ${likePattern}
        ORDER BY keyword ASC
        LIMIT 10;
      ` : [];
      if (Array.isArray(rows) && rows.length > 0 && env?.PIN_D1_DB && syncKeywordToD1) {
        safeWaitUntil(ctx, Promise.all(rows.map(r => syncKeywordToD1(env, r))), 'syncFallbackKeywordsToD1');
      }
      return jsonResponse({ success: true, source: 'neon_hub', results: rows }, 200, 15);
    } catch (_) {
      return jsonResponse({ success: true, source: 'empty_fallback', results: [], degraded: true }, 200, 0);
    }
  }

  // 14. GET /api/keywords/visual-search
  if (method === 'GET' && pathname === '/api/keywords/visual-search') {
    const pinId = searchParams.get('pin_id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
    const result = await fetchVisualSearchLens(sql, pinId, cookie, env);
    return jsonResponse(result, result.success ? 200 : 500);
  }

  // 15. GET /api/keywords/guides
  if (method === 'GET' && pathname === '/api/keywords/guides') {
    let keywordId = Number(searchParams.get('keyword_id'));
    const slug = searchParams.get('slug') || searchParams.get('keyword');
    if (!keywordId && slug) {
      const resolved = await resolveKeywordBySlug(sql, slug, false);
      if (resolved) keywordId = resolved.id;
    }
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const cacheKey = buildCanonicalCacheKey('keywords:guides', { keyword_id: keywordId, slug: slug || '' });
    const result = await getCachedOrFetch(cacheKey, async () => {
      const guides = await getKeywordGuides(sql, keywordId);
      return { success: true, guides };
    }, 30000, 120000);
    return jsonResponse(result, 200, 15);
  }

  // 16. GET /api/keywords/serp-compare
  if (method === 'GET' && pathname === '/api/keywords/serp-compare') {
    let keywordId = Number(searchParams.get('keyword_id'));
    const slug = searchParams.get('slug') || searchParams.get('keyword') || searchParams.get('q');
    let resolved = null;
    if (!keywordId && slug) {
      // [INVARIANT: READ-ONLY-GET-SAFE] Disable auto-creation on GET SERP comparison
      const autoCreate = searchParams.get('auto_create') === 'true';
      resolved = await resolveKeywordBySlug(sql, slug, autoCreate);
      if (resolved) keywordId = resolved.id;
    }
    if (!keywordId) return jsonResponse({ error: 'keyword_id or valid slug is required' }, 404);

    const cacheKey = buildCanonicalCacheKey('keywords:serp-compare', {
      keyword_id: keywordId,
      slug: slug || ''
    });

    const forceRefresh = searchParams.get('refresh') === 'true';
    const result = await getCachedOrFetch(cacheKey, async () => {
      return await getKeywordSERPComparison(sql, keywordId, resolved, { env, forceRefresh });
    }, 12000, 45000, { forceRefresh });

    return jsonResponse({ success: true, ...result }, 200, 10);
  }

  // 17. GET /api/keywords/intelligence
  if (method === 'GET' && pathname === '/api/keywords/intelligence') {
    const keywordId = Number(searchParams.get('keyword_id'));
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const cacheKey = buildCanonicalCacheKey('keywords:intelligence', { keyword_id: keywordId });
    const result = await getCachedOrFetch(cacheKey, async () => {
      return await getKeywordIntelligence(sql, keywordId);
    }, 30000, 120000);
    return jsonResponse(result, 200, 15);
  }

  // 17b. POST /api/keywords/trends/refresh
  if (method === 'POST' && (pathname === '/api/keywords/trends/refresh' || pathname === '/api/keywords/trends')) {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const term = body.term || body.keyword || body.q || searchParams.get('term') || searchParams.get('q') || '';
    const country = body.country || searchParams.get('country') || 'US';
    if (!term) return jsonResponse({ error: 'term is required' }, 400);

    const result = await fetchPinterestTrends(term, country, true);
    if (result && result.success) {
      cacheFolderTrends(term, result);
    }
    if (result && result.success && sql && term) {
      try {
        const popResult = await fetchPinterestTrendsPopularPins(sql, term, country, true);
        if (popResult?.success && popResult?.popular_pins) {
          result.popular_pins = popResult.popular_pins;
        }
        if ((!result.collage_images || result.collage_images.length === 0) && popResult?.collage_images?.length > 0) {
          result.collage_images = popResult.collage_images;
        }
      } catch (_) {}
    }
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // 18. GET /api/keywords/trends
  if (method === 'GET' && pathname === '/api/keywords/trends') {
    const term = searchParams.get('term') || searchParams.get('q') || searchParams.get('keyword') || '';
    const country = searchParams.get('country') || 'US';
    const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
    const result = await fetchPinterestTrends(term, country, force);
    if (result && result.success) {
      cacheFolderTrends(term, result);
    }
    if (result && result.success && sql && term) {
      try {
        const clean = term.trim().toLowerCase();
        const [kw] = await sql`
          SELECT popular_pins FROM tracked_keywords WHERE LOWER(keyword) = ${clean} LIMIT 1;
        `;
        if (!force && kw && Array.isArray(kw.popular_pins) && kw.popular_pins.length > 0) {
          result.popular_pins = kw.popular_pins;
        } else if (force || !kw?.popular_pins || kw.popular_pins.length === 0) {
          const popResult = await fetchPinterestTrendsPopularPins(sql, term, country, force);
          if (popResult?.success && popResult?.popular_pins) {
            result.popular_pins = popResult.popular_pins;
          }
          if ((!result.collage_images || result.collage_images.length === 0) && popResult?.collage_images?.length > 0) {
            result.collage_images = popResult.collage_images;
          }
        }
      } catch (_) {}
    }
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // 19. GET /api/keywords/displaced
  if (method === 'GET' && pathname === '/api/keywords/displaced') {
    const keywordId = Number(searchParams.get('keyword_id'));
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const status = searchParams.get('status') || 'ALL';
    // [INVARIANT: EDGE-SUBREQUEST-PAGINATION-SHIELD] Strict <= 30 limit per page
    const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit')) || 24));
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
    const cacheKey = buildCanonicalCacheKey('keywords:displaced', { keyword_id: keywordId, status, limit, offset });
    const forceRefresh = searchParams.get('refresh') === 'true';
    const result = await getCachedOrFetch(cacheKey, async () => {
      return await getKeywordDisplacedPins(sql, keywordId, { status, limit, offset, env, forceRefresh });
    }, 30000, 120000, { forceRefresh });
    return jsonResponse(result, 200, 15);
  }

  // 20. GET /api/keywords/pins/trajectory
  if (method === 'GET' && pathname === '/api/keywords/pins/trajectory') {
    const pinId = searchParams.get('pin_id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
    const range = searchParams.get('range') || 'all';
    const forceRefresh = searchParams.get('refresh') === 'true';
    const result = await getPinPerformanceTrajectory(sql, keywordId, pinId, range, { env, forceRefresh });
    return jsonResponse(result);
  }

  // 21. GET /api/keywords/pins/dossier
  if (method === 'GET' && pathname === '/api/keywords/pins/dossier') {
    const pinId = searchParams.get('pin_id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
    const forceRefresh = searchParams.get('refresh') === 'true';
    const cacheKey = buildCanonicalCacheKey('keywords:pin-dossier', { pin_id: pinId, keyword_id: keywordId || '' });
    if (forceRefresh) await invalidateEdgeCache(cacheKey);
    // [INVARIANT: READ-ONLY-GET-SAFE] Pass isReadOnly: true to prevent unauthenticated scraping storms
    const result = await getCachedOrFetch(cacheKey, () => getPinDeepDossier(sql, pinId, keywordId, { forceRefresh, env, isReadOnly: true }), 30000, 120000, { forceRefresh });
    return jsonResponse(result, 200, 15);
  }

  // 22. GET /api/keywords/related-interests
  if (pathname === '/api/keywords/related-interests') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'both'; // 'related', 'additions', 'both'
    if (!['both', 'related', 'additions'].includes(mode)) {
      return jsonResponse({ success: false, error: 'Invalid mode. Allowed values: both, related, additions' }, 400);
    }
    if (!q || q.trim().length < 2) {
      return jsonResponse({ success: false, error: 'Query term must be at least 2 characters' }, 400);
    }
    try {
      const result = await fetchKeywordRelatedInterests(q, mode);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'INTERNAL_ERROR',
        message: redactSecrets ? redactSecrets(err.message) : err.message
      }, 500);
    }
  }

  // 23. POST /api/keywords/bulk-import
  if (pathname === '/api/keywords/bulk-import') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 512 * 1024) {
      return jsonResponse({
        success: false,
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Payload size exceeds the 512KB limit'
      }, 413);
    }

    let body;
    try {
      const rawText = await request.text();
      if (rawText.length > 512 * 1024) {
        return jsonResponse({
          success: false,
          error: 'PAYLOAD_TOO_LARGE',
          message: 'Payload size exceeds the 512KB limit'
        }, 413);
      }
      body = JSON.parse(rawText);
    } catch (parseErr) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Malformed JSON payload: ' + parseErr.message
      }, 400);
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Request body must be a valid JSON object'
      }, 400);
    }

    let rawCandidates = [];
    if (Array.isArray(body.keywords)) {
      rawCandidates = body.keywords;
    } else if (typeof body.keywords === 'string') {
      rawCandidates = body.keywords.split('\n');
    } else {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'keywords field must be an array or multiline string'
      }, 400);
    }

    if (rawCandidates.length > 1000) {
      return jsonResponse({
        success: false,
        error: 'PAYLOAD_TOO_LARGE',
        message: `Batch contains ${rawCandidates.length} items. Maximum allowed is 1,000 keywords per request.`
      }, 413);
    }

    const validKeywords = [];
    for (const item of rawCandidates) {
      if (typeof item !== 'string' && typeof item !== 'number') continue;
      const str = String(item).trim();
      if (str.length < 2 || str.length > 100) continue;
      if (/<[a-z][\s\S]*>/i.test(str)) continue;
      if (/[\x00-\x1F\x7F]/.test(str)) continue;
      validKeywords.push(str.toLowerCase());
    }

    if (validKeywords.length === 0) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'No valid keywords provided. Each keyword must be a string between 2 and 100 characters.'
      }, 400);
    }

    invalidateEdgeCache('keywords');
    const folderId = body.folder_id ? Number(body.folder_id) : null;
    const category = body.category || 'General';
    const uniqueValidKeywords = [...new Set(validKeywords)];
    const imported = await sql`
      INSERT INTO tracked_keywords (
        keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active, updated_at
      )
      SELECT
        u.kw, ${category}, 50, 2, 'full_catalog', TRUE, NOW()
      FROM UNNEST(${uniqueValidKeywords}::text[]) AS u(kw)
      ON CONFLICT (keyword) DO UPDATE SET
        target_pin_count = COALESCE(tracked_keywords.target_pin_count, 50),
        crawl_pages_limit = COALESCE(tracked_keywords.crawl_pages_limit, 2),
        inspection_mode = 'full_catalog',
        updated_at = NOW(),
        is_active = TRUE
      RETURNING id, keyword, category;
    `.catch(err => {
      console.warn('[bulk-import] Database insert error:', redactSecrets ? redactSecrets(err?.message || 'DB error') : err?.message);
      return [];
    });

    if (folderId && Array.isArray(imported) && imported.length > 0) {
      const importedIds = imported.map(r => Number(r.id)).filter(Boolean);
      if (importedIds.length > 0) {
        await batchAddKeywordsToFolder(sql, folderId, importedIds).catch(() => {});
      }
    }

    const safeImported = Array.isArray(imported) ? imported : [];
    return jsonResponse({
      success: true,
      added: safeImported.length,
      count: safeImported.length,
      total_submitted: rawCandidates.length,
      folder_id: folderId,
      keywords: safeImported
    });
  }

  // 24. Raw Visual Annotations Crossover API
  if (
    (pathname.startsWith('/api/folders/') && (pathname.endsWith('/raw-visual-crossover') || pathname.endsWith('/crossover'))) ||
    (pathname.startsWith('/api/keywords/folders/') && (pathname.endsWith('/raw-visual-crossover') || pathname.endsWith('/crossover')))
  ) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const parts = pathname.split('/').filter(Boolean);
    const folderId = parts[2] === 'folders' ? parts[3] : parts[2];
    if (!folderId || isNaN(Number(folderId))) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Valid numeric folder_id is required'
      }, 400);
    }
    const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env });
    return jsonResponse({ success: true, crossover }, 200, refresh ? 0 : 30);
  }

  // 25. Dedicated Folder Cluster Fleet Audit Dispatch API
  const folderAuditMatch = method === 'POST' && pathname.match(/^\/api\/(?:folders|campaign-folders|keywords\/folders)\/(\d+)\/dispatch-audit$/);
  if (folderAuditMatch) {
    const folderId = folderAuditMatch[1];
    const [folderRow] = await targetSql`SELECT id, name, metadata FROM keyword_folders WHERE id = ${Number(folderId)} LIMIT 1;`;
    if (!folderRow) {
      return jsonResponse({ success: false, error: `Folder ${folderId} not found` }, 404);
    }
    const body = await request.json().catch(() => ({}));
    const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
    const crawlScopeInput = String(body.crawl_scope || folderMeta.crawl_scope || 'all_pins');
    const maxPinsInput = String(body.max_pins || folderMeta.max_pins || '50');
    const maxSerpPinsInput = String(body.max_serp_pins || body.max_pins || folderMeta.max_serp_pins || '50');
    const maxCatalogInspectInput = String(body.max_catalog_inspect || folderMeta.max_catalog_inspect || '0');
    const enableSerpHarvestInput = String(body.enable_serp_harvest ?? folderMeta.enable_serp_harvest ?? 'true');

    const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
    const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
    if (!token) {
      return jsonResponse({ success: false, error: 'GitHub Token secret not configured. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret in settings.' }, 400);
    }
    const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
    let dispatchRes;
    try {
      dispatchRes = await fetch(workflowUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': authHeader,
          'User-Agent': 'Pin-Arbitrage-Engine'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            target_keyword: '',
            folder_id: String(folderId),
            crawl_scope: crawlScopeInput,
            max_pins: maxPinsInput,
            max_serp_pins: maxSerpPinsInput,
            max_catalog_inspect: maxCatalogInspectInput,
            enable_serp_harvest: enableSerpHarvestInput
          }
        })
      });
      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        let errDetail = errText;
        if (dispatchRes.status === 401) {
          errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare/Koyeb has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
        }
        return jsonResponse({ success: false, error: `GitHub API error (${dispatchRes.status}): ${errDetail}` }, dispatchRes.status);
      }
      return jsonResponse({ 
        success: true, 
        folder_id: Number(folderId),
        folder_name: folderRow.name,
        message: `20-Runner Parallel Fleet Audit dispatched successfully for folder "${folderRow.name}"!` 
      });
    } finally {
      if (dispatchRes?.body && !dispatchRes.bodyUsed) {
        await dispatchRes.body.cancel().catch(() => {});
      }
    }
  }

  // 26. Aliased Campaign Folders CRUD API (/api/folders and /api/campaign-folders)
  const isFoldersRoute = (
    pathname === '/api/folders' || pathname.startsWith('/api/folders/') ||
    pathname === '/api/campaign-folders' || pathname.startsWith('/api/campaign-folders/')
  ) && !pathname.includes('crossover') && !pathname.includes('dispatch-audit');

  if (isFoldersRoute) {
    const basePrefix = pathname.startsWith('/api/campaign-folders') ? '/api/campaign-folders' : '/api/folders';
    const parts = pathname.slice(basePrefix.length).split('/').filter(Boolean);
    const folderId = parts[0] ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));

    // A0. Sub-route: /api/folders/:id/prune-pins (POST)
    if (parts.length >= 2 && parts[1] === 'prune-pins') {
      // [INVARIANT: PRUNE-TOMBSTONE-AND-EVICT] Pruning tombstones to keyword_ignored_pins and evicts edge_pins_metadata and PIN_ENGINE_KV
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

        let epoch = '0';
        if (!refresh && env?.PIN_ENGINE_KV) {
          try {
            epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            const kvKey = `fep:${epoch}:folder:${folderId}:creators:v2:${withDiscovery ? 'with_disc' : 'no_disc'}:${vaultScope}`;
            const kvCached = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
            if (kvCached) {
              return jsonResponse({ ...kvCached, source: 'kv_edge' }, 200, 30);
            }
          } catch (_) {}
        }

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

        if (env?.PIN_ENGINE_KV && payload) {
          try {
            if (!epoch || epoch === '0') {
              epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            }
            const kvKey = `fep:${epoch}:folder:${folderId}:creators:v2:${withDiscovery ? 'with_disc' : 'no_disc'}:${vaultScope}`;
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(payload), { expirationTtl: 86400 }), 'kv_put_folder_creators');
          } catch (_) {}
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

    const projectId = searchParams.get('project_id') || 'default';

    if (method === 'GET') {
      const isRefreshRequested = searchParams.get('refresh') === 'true';
      const isLite = searchParams.get('lite') === 'true';

      if (folderId && parts.length === 1) {
        let epoch = '0';
        if (!isRefreshRequested && env?.PIN_ENGINE_KV) {
          try {
            epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            const detailKey = `fep:${epoch}:folder:${folderId}:detail`;
            const cachedDetail = await env.PIN_ENGINE_KV.get(detailKey, { type: 'json' });
            if (cachedDetail) {
              return jsonResponse({ success: true, folder: cachedDetail, source: 'kv_edge' }, 200, 15);
            }
          } catch (_) {}
        }

        // [INVARIANT: D1-EDGE-CACHE-FIRST] Check D1 edge database first if fresh (< 60m) before hitting Neon Hub
        if (!isRefreshRequested && env?.PIN_D1_DB) {
          try {
            const d1Folder = await env.PIN_D1_DB.prepare(
              "SELECT id, name, color, description, item_count, keyword_count, creator_count, domain_count, pinned_domain_count, unique_pins_count, discovered_creator_count, status, metadata, updated_at FROM edge_campaign_folders WHERE id = ?"
            ).bind(String(folderId)).first();
            if (d1Folder) {
              const updatedTime = d1Folder.updated_at ? new Date(d1Folder.updated_at).getTime() : 0;
              const isFresh = !isNaN(updatedTime) && (Date.now() - updatedTime < 60 * 60 * 1000);
              if (isFresh) {
                const count = Number(d1Folder.keyword_count ?? d1Folder.item_count ?? 0);
                const normalizedD1Folder = {
                  ...d1Folder,
                  keyword_count: count,
                  item_count: count,
                  unique_pins_count: Number(d1Folder.unique_pins_count || 0),
                  creator_count: Number(d1Folder.creator_count || 0),
                  discovered_creator_count: Number(d1Folder.discovered_creator_count || d1Folder.creator_count || 0),
                  domain_count: Number(d1Folder.domain_count || 0),
                  pinned_domain_count: Number(d1Folder.pinned_domain_count || 0),
                  metadata: typeof d1Folder.metadata === 'string' ? JSON.parse(d1Folder.metadata || '{}') : (d1Folder.metadata || {}),
                  items: []
                };
                return jsonResponse({ success: true, folder: normalizedD1Folder, source: 'd1_edge' }, 200, 15);
              }
            }
          } catch (_) {}
        }

        // [INVARIANT: FOLDER-SSOT-LOOKUP] Serve authoritative live data from Central Hub getFolder(sql, folderId) (< 5ms)
        let folder = null;
        if (sql) {
          try {
            folder = await getFolder(sql, folderId);
          } catch (_) {}
        }
        if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
        if (syncFolderToD1) {
          safeWaitUntil(ctx, syncFolderToD1(env, folder), 'syncFolderToD1');
        }
        if (env?.PIN_ENGINE_KV && folder) {
          try {
            if (!epoch || epoch === '0') {
              epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            }
            const detailKey = `fep:${epoch}:folder:${folderId}:detail`;
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(detailKey, JSON.stringify(folder), { expirationTtl: 3600 }), 'kv_put_folder_detail');
          } catch (_) {}
        }
        return jsonResponse({ success: true, folder }, 200, 15);
      }

      // [INVARIANT: KV-EDGE-FOLDERS-LIST] Check Workers KV first (< 2ms)
      if (!isRefreshRequested && env?.PIN_ENGINE_KV) {
        try {
          const cachedList = await env.PIN_ENGINE_KV.get(`folders:list:v2:${projectId}`, { type: 'json' });
          if (cachedList && Array.isArray(cachedList) && cachedList.length > 0) {
            return jsonResponse({ success: true, folders: cachedList, source: 'kv_edge' }, 200, 10);
          }
        } catch (_) {}
      }

      // [INVARIANT: SWR-D1-EDGE-FOLDERS] Query ALL cached rows from D1 immediately (< 5ms)
      if (!isRefreshRequested && env?.PIN_D1_DB) {
        try {
          const d1Folders = await env.PIN_D1_DB.prepare(
            "SELECT id, name, color, description, item_count, keyword_count, creator_count, domain_count, pinned_domain_count, unique_pins_count, discovered_creator_count, status, metadata, updated_at FROM edge_campaign_folders ORDER BY updated_at DESC"
          ).all();
          if (d1Folders?.results?.length > 0) {
            const normalizedList = d1Folders.results.map(f => ({
              ...f,
              keyword_count: Number(f.keyword_count ?? f.item_count ?? 0),
              item_count: Number(f.keyword_count ?? f.item_count ?? 0),
              unique_pins_count: Number(f.unique_pins_count || 0),
              creator_count: Number(f.creator_count || 0),
              discovered_creator_count: Number(f.discovered_creator_count || f.creator_count || 0),
              domain_count: Number(f.domain_count || 0),
              pinned_domain_count: Number(f.pinned_domain_count || 0),
              metadata: typeof f.metadata === 'string' ? (() => { try { return JSON.parse(f.metadata); } catch (_) { return {}; } })() : (f.metadata || {})
            }));

            // Check if oldest row is older than 60 minutes for SWR background refresh
            const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
            const hasStaleRow = d1Folders.results.some(f => {
              const t = f.updated_at ? new Date(f.updated_at).getTime() : 0;
              return isNaN(t) || t < sixtyMinutesAgo;
            });
            if (hasStaleRow && !isLite && syncFolderToD1 && sql) {
              safeWaitUntil(ctx, (async () => {
                try {
                  const fresh = await listFolders(sql, { projectId });
                  if (Array.isArray(fresh) && fresh.length > 0) {
                    await Promise.all(fresh.map(f => syncFolderToD1(env, f)));
                    if (env?.PIN_ENGINE_KV) {
                      await env.PIN_ENGINE_KV.put(`folders:list:v2:${projectId}`, JSON.stringify(fresh), { expirationTtl: 1800 });
                    }
                  }
                } catch (e) {
                  console.warn('[SWR] Background folders refresh failed:', e.message);
                }
              })(), 'swrRefreshFoldersD1');
            }

            // Populate KV cache in background if missing
            if (env?.PIN_ENGINE_KV) {
              safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(`folders:list:v2:${projectId}`, JSON.stringify(normalizedList), { expirationTtl: 1800 }), 'kv_put_folders_list');
            }

            return jsonResponse({ success: true, folders: normalizedList, source: 'd1_edge' }, 200, 10);
          }
        } catch (_) {}
      }

      let folders = [];
      let foldersDegraded = false;
      if (isLite) {
        try {
          folders = await listFoldersLite(sql, { projectId });
        } catch (err) {
          console.warn('[Folders Fallback] listFoldersLite failed:', err.message);
          folders = [];
          foldersDegraded = true;
        }
      } else {
        try {
          folders = await listFolders(sql, { projectId });
        } catch (err) {
          console.warn('[Folders Fallback] listFolders failed:', err.message);
          folders = [];
          foldersDegraded = true;
        }
        if (Array.isArray(folders) && folders.length > 0) {
          if (syncFolderToD1) {
            safeWaitUntil(ctx, Promise.all(folders.map(f => syncFolderToD1(env, f))), 'syncAllFoldersToD1');
          }
          if (env?.PIN_ENGINE_KV && !isRefreshRequested) {
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.put(`folders:list:v2:${projectId}`, JSON.stringify(folders), { expirationTtl: 1800 }), 'kv_put_folders_list');
          }
        }
      }

      return jsonResponse({
        success: true,
        folders: Array.isArray(folders) ? folders : [],
        ...(foldersDegraded ? { degraded: true } : {})
      }, 200, foldersDegraded ? 0 : 10);
    }

    if (method === 'POST' && parts.length === 0) {
      const body = await request.json().catch(() => ({}));
      if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
        return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
      }
      const created = await createFolder(sql, body);
      if (syncFolderToD1) {
        safeWaitUntil(ctx, syncFolderToD1(env, created), 'syncFolderToD1');
      }
      if (env?.PIN_ENGINE_KV) {
        safeWaitUntil(ctx, (async () => {
          try {
            await env.PIN_ENGINE_KV.delete(`folders:list:v2:${projectId}`);
            await env.PIN_ENGINE_KV.delete('folders:list:v2:default');
          } catch (_) {}
        })(), 'kv_del_folders_list');
      }
      return jsonResponse({ success: true, folder: created });
    }

    if ((method === 'PUT' || method === 'PATCH') && folderId && parts.length === 1) {
      const body = await request.json().catch(() => ({}));
      if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
        return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
      }
      // Explicitly support folder settings controls: pause_competitors, pause_crawlers, block_fleet, max_serp_pins, crawl_scope, auto_discover_creators
      const {
        pause_competitors,
        pause_crawlers,
        block_fleet,
        max_serp_pins,
        crawl_scope,
        auto_discover_creators
      } = body;
      const updatedMetadata = {
        ...(body.metadata || {}),
        ...(pause_competitors !== undefined ? { pause_competitors: Boolean(pause_competitors) } : {}),
        ...(pause_crawlers !== undefined ? { pause_crawlers: Boolean(pause_crawlers), is_crawler_paused: Boolean(pause_crawlers) } : {}),
        ...(block_fleet !== undefined ? { block_fleet: Boolean(block_fleet), block_gha_fleet: Boolean(block_fleet) } : {}),
        ...(max_serp_pins !== undefined ? { max_serp_pins: Number(max_serp_pins) } : {}),
        ...(crawl_scope !== undefined ? { crawl_scope: String(crawl_scope) } : {}),
        ...(auto_discover_creators !== undefined ? { auto_discover_creators: Boolean(auto_discover_creators) } : {})
      };
      const updatePayload = {
        ...body,
        metadata: updatedMetadata
      };
      const updated = await updateFolder(sql, folderId, updatePayload);
      if (syncFolderToD1) {
        safeWaitUntil(ctx, syncFolderToD1(env, updated), 'syncFolderToD1');
      }
      if (env?.PIN_ENGINE_KV) {
        safeWaitUntil(ctx, (async () => {
          try {
            await env.PIN_ENGINE_KV.delete(`folders:list:v2:${projectId}`);
            await env.PIN_ENGINE_KV.delete('folders:list:v2:default');
            const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:detail`);
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v2`);
          } catch (_) {}
        })(), 'kv_del_folder_cache');
      }
      return jsonResponse({ success: true, folder: updated });
    }

    // [INVARIANT: GUARD-ACCIDENTAL-FOLDER-DELETION] Strictly guard folder deletion:
    // parts.length MUST equal 1 (e.g. DELETE /api/folders/5). Sub-route unpin/unlink operations MUST NEVER delete the folder!
    if (method === 'DELETE' && folderId && parts.length === 1) {
      const deleted = await deleteFolder(sql, folderId);
      if (deleteFolderFromD1) {
        safeWaitUntil(ctx, deleteFolderFromD1(env, folderId), 'deleteFolderFromD1');
      }
      if (env?.PIN_ENGINE_KV) {
        safeWaitUntil(ctx, (async () => {
          try {
            await env.PIN_ENGINE_KV.delete(`folders:list:v2:${projectId}`);
            await env.PIN_ENGINE_KV.delete('folders:list:v2:default');
            const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:detail`);
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v2`);
          } catch (_) {}
        })(), 'kv_del_folder_cache_del');
      }
      return jsonResponse({ success: true, deleted });
    }
  }

  // 27. GET /api/keywords/trends/popular-pins
  if (method === 'GET' && pathname === '/api/keywords/trends/popular-pins') {
    const term = searchParams.get('term') || searchParams.get('q') || searchParams.get('keyword') || '';
    const country = searchParams.get('country') || 'US';
    const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
    if (!term) return jsonResponse({ error: 'term is required' }, 400);
    const result = await fetchPinterestTrendsPopularPins(targetSql, term, country, force);
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // 28. POST /api/keywords/dispatch-workflow
  if (method === 'POST' && pathname === '/api/keywords/dispatch-workflow') {
    const body = await request.json().catch(() => ({}));
    const targetKw = body.target_keyword || body.keyword || '';
    const folderIdInput = body.folder_id ? String(body.folder_id).trim() : '';
    const maxPinsInput = String(body.max_pins || '50');
    const maxSerpPinsInput = String(body.max_serp_pins || body.max_pins || maxPinsInput);
    const maxCatalogInspectInput = String(body.max_catalog_inspect || '0');
    const enableSerpHarvestInput = body.enable_serp_harvest !== undefined && body.enable_serp_harvest !== null && body.enable_serp_harvest !== ''
      ? String(body.enable_serp_harvest)
      : (folderIdInput ? '' : 'true');
    const crawlScopeInput = String(body.crawl_scope || 'all_pins');
    const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
    const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
    if (!token) {
      return jsonResponse({ success: false, error: 'GitHub Token secret not configured. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret in settings.' }, 400);
    }
    const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
    const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
    const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
    let dispatchRes;
    try {
      dispatchRes = await fetch(workflowUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': authHeader,
          'User-Agent': 'Pin-Arbitrage-Engine'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            target_keyword: targetKw,
            folder_id: folderIdInput,
            crawl_scope: crawlScopeInput,
            max_pins: maxPinsInput,
            max_serp_pins: maxSerpPinsInput,
            max_catalog_inspect: maxCatalogInspectInput,
            enable_serp_harvest: enableSerpHarvestInput
          }
        })
      });
      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        let errDetail = errText;
        if (dispatchRes.status === 401) {
          errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare/Koyeb has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
        }
        return jsonResponse({ success: false, error: `GitHub API error (${dispatchRes.status}): ${errDetail}` }, dispatchRes.status);
      }
      return jsonResponse({ success: true, message: 'Workflow dispatched successfully' });
    } finally {
      if (dispatchRes?.body && !dispatchRes.bodyUsed) {
        await dispatchRes.body.cancel().catch(() => {});
      }
    }
  }

  // 29. GET /api/keywords/folders
  if (method === 'GET' && pathname === '/api/keywords/folders') {
    const isRefreshRequested = searchParams.get('refresh') === 'true';
    const folderId = searchParams.get('id') || searchParams.get('folder_id');
    if (folderId) {
      if (!isRefreshRequested && env?.PIN_D1_DB) {
        try {
          const d1Folder = await env.PIN_D1_DB.prepare(
            "SELECT id, name, color, description, item_count, item_count AS keyword_count, updated_at FROM edge_campaign_folders WHERE id = ?"
          ).bind(String(folderId)).first();
          if (d1Folder) {
            const updatedTime = d1Folder.updated_at ? new Date(d1Folder.updated_at).getTime() : 0;
            const isFresh = !isNaN(updatedTime) && (Date.now() - updatedTime < 10 * 60 * 1000);
            const count = Number(d1Folder.keyword_count ?? d1Folder.item_count ?? 0);
            if (isFresh && count > 0) {
              const normalizedD1Folder = {
                ...d1Folder,
                keyword_count: count,
                item_count: count,
                items: []
              };
              return jsonResponse({ success: true, folder: normalizedD1Folder, source: 'd1_edge' });
            }
          }
        } catch (_) {}
      }
      const folder = await getFolder(sql, folderId);
      if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
      if (syncFolderToD1) {
        safeWaitUntil(ctx, syncFolderToD1(env, folder), 'syncFolderToD1');
      }
      return jsonResponse({ success: true, folder });
    }
    if (!isRefreshRequested && env?.PIN_D1_DB) {
      try {
        const d1Folders = await env.PIN_D1_DB.prepare(
          "SELECT id, name, color, description, item_count, item_count AS keyword_count, updated_at FROM edge_campaign_folders ORDER BY updated_at DESC"
        ).all();
        if (d1Folders?.results?.length > 0) {
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          const allFresh = d1Folders.results.every(f => {
            const t = f.updated_at ? new Date(f.updated_at).getTime() : 0;
            return !isNaN(t) && t >= tenMinutesAgo;
          });
          const totalItems = d1Folders.results.reduce(
            (sum, f) => sum + Number(f.keyword_count ?? f.item_count ?? 0),
            0
          );
          if (allFresh && totalItems > 0) {
            const normalizedList = d1Folders.results.map(f => ({
              ...f,
              keyword_count: Number(f.keyword_count ?? f.item_count ?? 0)
            }));
            return jsonResponse({ success: true, folders: normalizedList, source: 'd1_edge' });
          }
        }
      } catch (_) {}
    }
    const folders = await listFolders(sql, {
      projectId: searchParams.get('project_id') || 'default'
    });
    if (Array.isArray(folders) && folders.length > 0 && syncFolderToD1) {
      safeWaitUntil(ctx, Promise.all(folders.map(f => syncFolderToD1(env, f))), 'syncAllFoldersToD1');
    }
    return jsonResponse({ success: true, folders }, 200, 8);
  }

  // 30. POST /api/keywords/folders
  if (method === 'POST' && pathname === '/api/keywords/folders') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    const body = await request.json().catch(() => ({}));
    const created = await createFolder(sql, body);
    if (syncFolderToD1) {
      safeWaitUntil(ctx, syncFolderToD1(env, created), 'syncFolderToD1');
    }
    return jsonResponse({ success: true, folder: created });
  }

  // 31. PUT / PATCH /api/keywords/folders
  if ((method === 'PUT' || method === 'PATCH') && pathname === '/api/keywords/folders') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    const body = await request.json().catch(() => ({}));
    const folderId = body.id || searchParams.get('id');
    if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
    const updated = await updateFolder(sql, folderId, body);
    if (syncFolderToD1) {
      safeWaitUntil(ctx, syncFolderToD1(env, updated), 'syncFolderToD1');
    }
    return jsonResponse({ success: true, folder: updated });
  }

  // 32. DELETE /api/keywords/folders
  if (method === 'DELETE' && pathname === '/api/keywords/folders') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    let folderId = searchParams.get('id') || searchParams.get('folder_id');
    if (!folderId) {
      try {
        const body = await request.json();
        folderId = body.id || body.folder_id;
      } catch (_) {}
    }
    if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
    const deleted = await deleteFolder(sql, folderId);
    if (deleteFolderFromD1) {
      safeWaitUntil(ctx, deleteFolderFromD1(env, folderId), 'deleteFolderFromD1');
    }
    return jsonResponse({ success: true, deleted });
  }

  // 33. POST /api/keywords/folders/items
  if (method === 'POST' && pathname === '/api/keywords/folders/items') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    const body = await request.json().catch(() => ({}));
    const folderId = body.folder_id || searchParams.get('folder_id');
    if (!folderId) return jsonResponse({ error: 'folder_id is required' }, 400);
    
    if (Array.isArray(body.keyword_ids)) {
      const result = await batchAddKeywordsToFolder(sql, folderId, body.keyword_ids);
      if (syncFolderToD1) {
        safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
      }
      return jsonResponse({ success: true, ...result });
    }
    
    const keywordId = body.keyword_id || searchParams.get('keyword_id');
    if (!keywordId) return jsonResponse({ error: 'keyword_id or keyword_ids is required' }, 400);
    const item = await addKeywordToFolder(sql, folderId, keywordId, body.notes || '');
    if (syncFolderToD1) {
      safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
    }
    return jsonResponse({ success: true, item });
  }

  // 34. DELETE /api/keywords/folders/items
  if (method === 'DELETE' && pathname === '/api/keywords/folders/items') {
    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    let folderId = searchParams.get('folder_id');
    let keywordId = searchParams.get('keyword_id');
    if (!folderId || !keywordId) {
      try {
        const body = await request.json();
        folderId = folderId || body.folder_id;
        keywordId = keywordId || body.keyword_id;
      } catch (_) {}
    }
    if (!folderId || !keywordId) return jsonResponse({ error: 'folder_id and keyword_id are required' }, 400);
    const deleted = await removeKeywordFromFolder(sql, folderId, keywordId);
    if (syncFolderToD1) {
      safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
    }
    return jsonResponse({ success: true, deleted });
  }

  // 35. GET /api/keywords/folders/by-keyword
  if (method === 'GET' && pathname === '/api/keywords/folders/by-keyword') {
    const keywordId = searchParams.get('keyword_id');
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const folders = await getFoldersForKeyword(sql, keywordId);
    return jsonResponse({ success: true, folders });
  }

  // 36. GET /api/keywords/folders/crossover
  if (method === 'GET' && pathname === '/api/keywords/folders/crossover') {
    const folderId = searchParams.get('folder_id') || searchParams.get('id');
    if (!folderId) return jsonResponse({ error: 'folder_id is required' }, 400);
    const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
    const crossover = await calculateFolderCrossover(sql, folderId, { refresh, env });
    return jsonResponse({ success: true, crossover });
  }

  return null;
}
