/**
 * Keywords, Folders & Settings Sub-Router
 *
 * Handles all keyword velocity tracker, trends, guides, serp-comparison, and app settings endpoints,
 * while delegating `/api/urls/*` to ./urls-global-saves.mjs and `/api/folders/*` to ./folders.mjs.
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
  updateKeywordSettings,
  ignoreAndRemoveSerpPin,
  resolveEffectiveSerpQuota,
  computePagesForQuota
} from '../modules/keywords/service.mjs';

import {
  fetchPinterestTrends,
  fetchPinterestTrendsPopularPins,
  fetchKeywordRelatedInterests
} from '../modules/keywords/trends-service.mjs';

import { batchAddKeywordsToFolder } from '../modules/keywords/folders-crud.mjs';
import {
  cacheFolderTrends,
  invalidateFolderCache
} from '../modules/keywords/folders-crossover.mjs';
import {
  DEFAULT_WORKSPACE_ID,
  assertFolderInWorkspace,
  resolveWorkspaceRawCookie
} from '../modules/workspaces/service.mjs';
import { dispatchGitHubWorkflow, resolveGitHubAuth } from '../http/github-workflow.mjs';
import { invalidateGlobalPulseCache } from '../modules/pulse/service.mjs';
import {
  searchMultiEntityAutocomplete,
  normalizeAutocompleteQuery,
  AUTOCOMPLETE_DEFAULT_LIMIT,
  AUTOCOMPLETE_MAX_LIMIT
} from '../modules/search/autocomplete-service.mjs';

import {
  BATCH_GLOBAL_SAVES_MAX_KEYS,
  _resetBatchGlobalSavesRateLimit,
  _getBatchGlobalSavesRateStoreStats,
  verifySameOriginBrowserOrApiRequest,
  enforceBatchGlobalSavesRateLimit,
  handleUrlGlobalSavesRoutes
} from './urls-global-saves.mjs';
import {
  isFoldersRoute,
  handleFoldersRoutes
} from './folders.mjs';

// Explicit named re-exports matching the exact original 7-symbol public surface
export {
  BATCH_GLOBAL_SAVES_MAX_KEYS,
  _resetBatchGlobalSavesRateLimit,
  _getBatchGlobalSavesRateStoreStats,
  verifySameOriginBrowserOrApiRequest,
  enforceBatchGlobalSavesRateLimit
};

/**
 * Fast URI discriminator for Keywords & Folders routes
 */
export function isKeywordsRoute(pathname) {
  return pathname === '/api/keywords' ||
    pathname.startsWith('/api/keywords/') ||
    pathname === '/api/settings' ||
    pathname === '/api/search/autocomplete' ||
    isFoldersRoute(pathname) ||
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
  workspaceId = 1,
  jsonResponse,
  methodNotAllowedResponse,
  clampLimit,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  safeWaitUntil,
  isValidPinId,
  tripPinterestCircuitBreaker,
  redactSecrets
}) {
  // 0A & 0B. /api/urls/global-saves & /api/urls/batch-global-saves
  if (pathname === '/api/urls/global-saves' || pathname === '/api/urls/batch-global-saves') {
    const urlSavesRes = await handleUrlGlobalSavesRoutes({
      pathname,
      method,
      request,
      searchParams,
      env,
      ctx,
      sql,
      jsonResponse,
      methodNotAllowedResponse,
      safeWaitUntil
    });
    if (urlSavesRes) return urlSavesRes;
  }

  // 1. GET /api/keywords
  if (method === 'GET' && pathname === '/api/keywords') {
    const search = searchParams.get('search') || '';
    const limit = clampLimit(searchParams.get('limit'), 1000, 1000);
    const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const rawFolderId = searchParams.get('folder_id') ?? searchParams.get('folder');
    let folderId = null;
    if (rawFolderId !== null && String(rawFolderId).trim() !== '') {
      const trimmedFolder = String(rawFolderId).trim();
      const parsedFolder = Number(trimmedFolder);
      if (!/^\d+$/.test(trimmedFolder) || !Number.isSafeInteger(parsedFolder) || parsedFolder <= 0) {
        return jsonResponse({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Valid positive integer folder_id is required'
        }, 400);
      }
      folderId = parsedFolder;
      try {
        await assertFolderInWorkspace(sql, folderId, workspaceId);
      } catch (err) {
        if (err?.status === 404 || err?.statusCode === 404) {
          return jsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: err.message || 'Folder not found in current workspace'
          }, 404);
        }
        throw err;
      }
    }

    const cacheKey = buildCanonicalCacheKey('keywords:hub', {
      workspace_id: workspaceId,
      search,
      limit,
      offset,
      folder_id: folderId
    });

    if (forceRefresh) {
      // Invalidate edge memory cache
      await invalidateEdgeCache('keywords');
      await invalidateEdgeCache(cacheKey);
    }

    // 6 hours TTL (21,600,000 ms) + 1 hour stale-while-revalidate (3,600,000 ms)
    const SIX_HOURS_MS = 21600000;
    const ONE_HOUR_MS = 3600000;

    try {
      const keywords = await getCachedOrFetch(cacheKey, async () => {
        return await listKeywords(sql, {
          search,
          limit,
          offset,
          folderId,
          workspaceId
        });
      }, SIX_HOURS_MS, ONE_HOUR_MS, { forceRefresh });

      return jsonResponse({
        success: true,
        keywords: Array.isArray(keywords) ? keywords : [],
        source: 'unified_postgres'
      }, 200, 8);
    } catch (err) {
      console.error('[Keywords Error]', err.message);
      return jsonResponse({
        success: false,
        error: 'DB_UNAVAILABLE',
        degraded: true,
        message: 'Keywords hub temporarily unavailable while database is waking up. Retry in 3 seconds.'
      }, 503, 0, { 'Retry-After': '3' });
    }
  }

  // 2. POST /api/keywords
  if (method === 'POST' && pathname === '/api/keywords') {
    const body = await request.json().catch(() => ({}));
    const row = await addKeyword(sql, body);
    await Promise.all([
      invalidateEdgeCache('keywords'),
      invalidateEdgeCache('folders')
    ].map(p => Promise.resolve(p).catch(() => {})));
    invalidateFolderCache(null, workspaceId);
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
    return jsonResponse({ success: true, keyword: row });
  }

  // 4. POST /api/keywords/sync
  if (method === 'POST' && pathname === '/api/keywords/sync') {
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
    // [INVARIANT: WORKSPACE-COOKIE-ISOLATION]
    // Resolve Zone A cookie strictly for the active workspace; fallback to global env cookie only for default workspace #1.
    const wsCookie = await resolveWorkspaceRawCookie(sql, workspaceId).catch(() => '');
    const envFallbackCookie = Number(workspaceId) === DEFAULT_WORKSPACE_ID
      ? (env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null))
      : null;
    const cookie = (wsCookie && String(wsCookie).trim()) ? String(wsCookie).trim() : envFallbackCookie;
    const hasExplicitPages = body.crawl_pages !== undefined || body.max_pages !== undefined;
    const crawlPages = hasExplicitPages ? Math.max(1, Math.min(40, Number(body.crawl_pages || body.max_pages) || 2)) : undefined;
    const maxPins = body.max_pins ?? body.max_serp_pins;
    const res = await crawlKeywordSERP(sql, keywordId, {
      cookie,
      force,
      ...(crawlPages !== undefined ? { crawl_pages: crawlPages } : {}),
      ...(maxPins !== undefined && maxPins !== null && maxPins !== '' ? { max_pins: maxPins } : {}),
      skip_top_enrich: true,
      env
    });

    if (res?.success) {
      invalidateGlobalPulseCache(env, ctx).catch(() => {});
      invalidateFolderCache(null, workspaceId);
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.all([
          invalidateEdgeCache('keywords'),
          invalidateEdgeCache('folders')
        ].map(p => Promise.resolve(p).catch(() => {})));
      }
    }

    // [INVARIANT: EDGE-ONLY-SERP-DISCOVERY]
    // Table row re-crawls and synchronous SERP queries are strictly edge-only (< 2s).
    // Workflow dispatch to GitHub Actions occurs only when explicitly opted in via dispatch_workflow === true.
    const autoDispatch = body.dispatch_workflow === true;
    const { token } = resolveGitHubAuth(env);
    if (autoDispatch && token && res?.success) {
      const targetKw = res.keyword || body.target_keyword || body.keyword || resolvedKw?.keyword || '';
      const rawDispatchMax = body.max_serp_pins || body.max_pins || resolvedKw?.target_pin_count || '';
      const maxPinsInput = rawDispatchMax ? String(rawDispatchMax) : '';
      const crawlScopeInput = String(body.crawl_scope || 'all_pins');
      // [INVARIANT: EDGE-ONLY-SERP-DISCOVERY]
      // When auto-dispatched from sync, SERP was already scraped on Edge (< 2s). Default enable_serp_harvest to 'false' unless explicitly overridden.
      const enableSerpHarvestInput = body.enable_serp_harvest !== undefined
        ? String(body.enable_serp_harvest)
        : 'false';
      safeWaitUntil(ctx, () => dispatchGitHubWorkflow(env, {
        workflowFile: 'keyword-intelligence-velocity.yml',
        timeoutMs: 10000,
        inputs: {
          target_keyword: targetKw,
          crawl_scope: crawlScopeInput,
          max_pins: maxPinsInput,
          enable_serp_harvest: enableSerpHarvestInput
        }
      }), 'github_workflow_dispatch');
    }

    if (res?.status === 429 || res?.status === 403 || (res?.error && typeof res.error === 'string' && (res.error.includes('429') || res.error.includes('403')))) {
      if (tripPinterestCircuitBreaker) {
        safeWaitUntil(ctx, () => tripPinterestCircuitBreaker(env, `HTTP ${res?.status || 429} Rate Limit/Block in /api/keywords/sync`, 900), 'tripPinterestCircuitBreaker');
      }
    }

    const syncSucceeded = Boolean(res?.success);
    return jsonResponse({
      success: syncSucceeded,
      status: syncSucceeded ? 'success' : 'failed',
      keyword_id: keywordId,
      result: {
        ...res,
        success: syncSucceeded,
        status: syncSucceeded ? 'completed' : 'failed',
        crawled_pins: Number(res?.crawled_pins ?? res?.pins_collected ?? 0),
        message: res?.message || (syncSucceeded ? 'Synchronized successfully' : (res?.error || 'SERP synchronization failed'))
      }
    });
  }

  // 5. GET /api/settings
  if (method === 'GET' && pathname === '/api/settings') {
    const settings = await getAppSettings(sql);
    const hasCookie = Boolean(settings?.has_pinterest_cookie || (settings?.pinterest_cookie && String(settings.pinterest_cookie).trim().length > 10));
    const safeSettings = {
      ...settings,
      pinterest_cookie: '',
      has_pinterest_cookie: hasCookie
    };
    return jsonResponse({ success: true, settings: safeSettings }, 200, -1);
  }

  // 6. POST /api/settings
  if (method === 'POST' && pathname === '/api/settings') {
    const body = await request.json().catch(() => ({}));
    const updated = await updateAppSettings(sql, body);
    await Promise.all([
      invalidateEdgeCache('keywords'),
      invalidateEdgeCache('keywords:hub'),
      invalidateEdgeCache('keywords:pins'),
      invalidateEdgeCache('keywords:serp-compare'),
      invalidateEdgeCache('folders'),
      invalidateEdgeCache('settings')
    ].map(p => Promise.resolve(p).catch(() => {})));
    invalidateFolderCache(null, workspaceId);
    const hasCookie = Boolean(updated?.has_pinterest_cookie || (updated?.pinterest_cookie && String(updated.pinterest_cookie).trim().length > 10));
    const safeSettings = {
      ...updated,
      pinterest_cookie: '',
      has_pinterest_cookie: hasCookie
    };
    return jsonResponse({ success: true, settings: safeSettings }, 200, -1);
  }

  // 7. POST /api/keywords/settings
  if (method === 'POST' && pathname === '/api/keywords/settings') {
    const body = await request.json().catch(() => ({}));
    const keywordId = Number(body.keyword_id);
    if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
    const updated = await updateKeywordSettings(sql, keywordId, body);
    await Promise.all([
      invalidateEdgeCache('keywords'),
      invalidateEdgeCache('keywords:hub'),
      invalidateEdgeCache('keywords:pins'),
      invalidateEdgeCache('keywords:serp-compare'),
      invalidateEdgeCache('folders')
    ].map(p => Promise.resolve(p).catch(() => {})));
    invalidateFolderCache(null, workspaceId);
    return jsonResponse({ success: true, keyword: updated });
  }

  // 8. POST /api/keywords/status || /api/keywords/toggle
  if (method === 'POST' && (pathname === '/api/keywords/status' || pathname === '/api/keywords/toggle')) {
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
      await Promise.all([
        invalidateEdgeCache('keywords'),
        invalidateEdgeCache('folders')
      ].map(p => Promise.resolve(p).catch(() => {})));
      invalidateFolderCache(null, workspaceId);
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
    await Promise.all([
      invalidateEdgeCache('keywords'),
      invalidateEdgeCache('folders')
    ].map(p => Promise.resolve(p).catch(() => {})));
    invalidateFolderCache(null, workspaceId);
    return jsonResponse({ success: true, keyword: row });
  }

  // 9. DELETE /api/keywords
  if (method === 'DELETE' && pathname === '/api/keywords') {
    let id = searchParams.get('id');
    let keyword = searchParams.get('keyword');
    let body = {};
    try {
      body = await request.json();
      id = id || body.id || body.keyword_id;
      keyword = keyword || body.keyword;
    } catch (_) {}

    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
    let targetIds = [];
    if (ids.length > 0) {
      targetIds = [...new Set(ids)];
    } else if (id && Number.isInteger(Number(id)) && Number(id) > 0) {
      targetIds = [Number(id)];
    } else if (keyword) {
      const cleanKeyword = keyword.toLowerCase().trim();
      const rows = await sql`SELECT id FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
      targetIds = [...new Set(rows.map(r => Number(r.id)).filter(n => Number.isInteger(n) && n > 0))];
    }

    if (targetIds.length === 0) {
      return jsonResponse({ error: 'id, keyword, or ids array is required to delete tracked keyword' }, 400);
    }

    const runInTx = async (fn) => (typeof sql?.begin === 'function' ? sql.begin(fn) : fn(sql));
    try {
      await runInTx(async (tx) => {
        // Delete child SERP/capsule/folder rows and tracked_keywords (backed by ON DELETE CASCADE)
        await tx`DELETE FROM keyword_serp_positions WHERE keyword_id = ANY(${targetIds});`;
        await tx`DELETE FROM keyword_ignored_pins WHERE keyword_id = ANY(${targetIds});`;
        await tx`DELETE FROM keyword_guided_capsules WHERE keyword_id = ANY(${targetIds});`;
        await tx`DELETE FROM keyword_folder_items WHERE keyword_id = ANY(${targetIds});`;
        await tx`DELETE FROM tracked_keywords WHERE id = ANY(${targetIds});`;
      });
    } catch (err) {
      console.error('[KeywordsRoute.DELETE] atomic keyword delete failed:', err?.message || err);
      return jsonResponse({
        success: false,
        error: 'KEYWORD_DELETE_FAILED',
        message: redactSecrets ? redactSecrets(err?.message || String(err)) : (err?.message || String(err))
      }, 500);
    }

    invalidateEdgeCache('keywords');
    invalidateEdgeCache('folders');
    invalidateEdgeCache('domains:leaderboard');
    invalidateEdgeCache('keywords:pin-dossier');
    invalidateFolderCache(null, workspaceId);

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

      const { deletedCount } = await ignoreAndRemoveSerpPin(sql, {
        keywordId,
        pinId,
        reason: 'manual_user_deletion'
      });

      await Promise.all([
        invalidateEdgeCache('keywords'),
        invalidateEdgeCache('folders'),
        invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`),
        invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId })),
        invalidateEdgeCache('keywords:pin-dossier')
      ].map(p => Promise.resolve(p).catch(() => {})));
      invalidateFolderCache(null, workspaceId);

      return jsonResponse({
        success: true,
        deleted: deletedCount > 0,
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

  // 13. Fast Multi-Entity Search Autocomplete API (Keywords, Creators, Folders, Domains)
  if (method === 'GET' && (pathname === '/api/search/autocomplete' || pathname === '/api/keywords/autocomplete')) {
    const q = String(searchParams.get('q') || searchParams.get('query') || '').trim();
    const rawLimit = searchParams.get('limit');
    const lim = typeof clampLimit === 'function'
      ? clampLimit(rawLimit, AUTOCOMPLETE_DEFAULT_LIMIT, AUTOCOMPLETE_MAX_LIMIT)
      : Math.max(1, Math.min(Number(rawLimit) || AUTOCOMPLETE_DEFAULT_LIMIT, AUTOCOMPLETE_MAX_LIMIT));
    const typesParam = searchParams.get('types') || '';
    const projectId = searchParams.get('project_id') || 'default';
    const norm = normalizeAutocompleteQuery(q);

    if (norm.tooShort) {
      const emptyRes = await searchMultiEntityAutocomplete(null, { query: q, limit: lim });
      return jsonResponse(emptyRes, 200, 15);
    }

    try {
      const cacheKey = typeof buildCanonicalCacheKey === 'function'
        ? buildCanonicalCacheKey('search:autocomplete', { q: norm.lower, limit: lim, types: typesParam || 'all', projectId })
        : `search:autocomplete:${norm.lower}:${lim}:${typesParam || 'all'}:${projectId}`;

      const fetchAutocomplete = () => searchMultiEntityAutocomplete(sql, {
        query: q,
        limit: lim,
        types: typesParam || null,
        projectId
      });

      const payload = typeof getCachedOrFetch === 'function'
        ? await getCachedOrFetch(cacheKey, fetchAutocomplete, 15000, 45000)
        : await fetchAutocomplete();

      return jsonResponse(payload, 200, 15);
    } catch (_) {
      return jsonResponse({
        success: true,
        source: 'empty_fallback',
        query: norm.raw,
        counts: { keywords: 0, creators: 0, folders: 0, domains: 0, total: 0 },
        entities: { keywords: [], creators: [], folders: [], domains: [] },
        results: [],
        degraded: true
      }, 200, 0);
    }
  }

  // 14. GET /api/keywords/visual-search
  if (method === 'GET' && pathname === '/api/keywords/visual-search') {
    const pinId = searchParams.get('pin_id');
    if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
    // [INVARIANT: WORKSPACE-COOKIE-ISOLATION]
    // Resolve Zone A cookie strictly for the active workspace; fallback to global env cookie only for default workspace #1.
    const wsCookie = await resolveWorkspaceRawCookie(sql, workspaceId).catch(() => '');
    const envFallbackCookie = Number(workspaceId) === DEFAULT_WORKSPACE_ID
      ? (env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null))
      : null;
    const cookie = (wsCookie && String(wsCookie).trim()) ? String(wsCookie).trim() : envFallbackCookie;
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
          // [INVARIANT: READ-ONLY-GET-SAFE] Never persist DB mutations inside GET /api/keywords/trends
          const popResult = await fetchPinterestTrendsPopularPins(null, term, country, force);
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
    // Bound displaced pins page size to <= 500 per request
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 500));
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
    if (request.body && typeof request.body === 'object') {
      body = request.body;
    } else {
      try {
        const rawText = typeof request.text === 'function' ? await request.text() : (typeof request.body === 'string' ? request.body : '');
        if (rawText.length > 512 * 1024) {
          return jsonResponse({
            success: false,
            error: 'PAYLOAD_TOO_LARGE',
            message: 'Payload size exceeds the 512KB limit'
          }, 413);
        }
        body = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        return jsonResponse({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Malformed JSON payload: ' + parseErr.message
        }, 400);
      }
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

    let folderId = null;
    if (body.folder_id !== undefined && body.folder_id !== null && String(body.folder_id).trim() !== '') {
      const trimmedFolder = String(body.folder_id).trim();
      const parsedFolder = Number(trimmedFolder);
      if (!/^\d+$/.test(trimmedFolder) || !Number.isSafeInteger(parsedFolder) || parsedFolder <= 0) {
        return jsonResponse({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Valid positive integer folder_id is required'
        }, 400);
      }
      folderId = parsedFolder;
      try {
        await assertFolderInWorkspace(sql, folderId, workspaceId);
      } catch (err) {
        if (err?.status === 404 || err?.statusCode === 404) {
          return jsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: err.message || 'Folder not found in current workspace'
          }, 404);
        }
        throw err;
      }
    }

    const category = body.category || 'General';
    const uniqueValidKeywords = [...new Set(validKeywords)];
    const appSettings = await getAppSettings(sql).catch(() => null);
    const defaultPins = resolveEffectiveSerpQuota({
      explicitMaxPins: body.target_pin_count ?? body.max_pins ?? body.max_serp_pins,
      appSettings
    });
    const defaultPages = computePagesForQuota(defaultPins);
    const defaultMode = body.inspection_mode
      ? String(body.inspection_mode).trim()
      : (appSettings?.default_inspection_mode || 'full_catalog');
    let imported;
    try {
      imported = await sql`
        INSERT INTO tracked_keywords (
          keyword, canonical_keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active, updated_at
        )
        SELECT
          u.kw,
          NULL,
          ${category}, ${defaultPins}, ${defaultPages}, ${defaultMode}, TRUE, NOW()
        FROM UNNEST(${uniqueValidKeywords}::text[]) AS u(kw)
        ON CONFLICT (keyword) DO UPDATE SET
          canonical_keyword = COALESCE(NULLIF(tracked_keywords.canonical_keyword, ''), NULL),
          target_pin_count = COALESCE(tracked_keywords.target_pin_count, ${defaultPins}),
          crawl_pages_limit = COALESCE(tracked_keywords.crawl_pages_limit, ${defaultPages}),
          inspection_mode = COALESCE(NULLIF(tracked_keywords.inspection_mode, ''), ${defaultMode}),
          updated_at = NOW(),
          is_active = TRUE
        RETURNING id, keyword, category;
      `;
    } catch (err) {
      const safeMsg = redactSecrets ? redactSecrets(err?.message || 'Database insert error') : (err?.message || 'Database insert error');
      console.warn('[bulk-import] Database insert error:', safeMsg);
      return jsonResponse({
        success: false,
        error: 'BULK_IMPORT_FAILED',
        message: safeMsg
      }, 500);
    }

    if (folderId && Array.isArray(imported) && imported.length > 0) {
      const importedIds = imported.map(r => Number(r.id)).filter(Boolean);
      if (importedIds.length > 0) {
        await batchAddKeywordsToFolder(sql, folderId, importedIds);
      }
    }
    await Promise.all([
      invalidateEdgeCache('keywords'),
      invalidateEdgeCache('folders')
    ].map(p => Promise.resolve(p).catch(() => {})));
    invalidateFolderCache(folderId, workspaceId);

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

  // 24-26. Campaign Folders Sub-Router (/api/folders & /api/folders/*)
  if (isFoldersRoute(pathname)) {
    const foldersRes = await handleFoldersRoutes({
      pathname,
      method,
      request,
      searchParams,
      env,
      ctx,
      sql,
      workspaceId,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache
    });
    if (foldersRes) return foldersRes;
  }

  // 27. GET /api/keywords/trends/popular-pins
  if (method === 'GET' && pathname === '/api/keywords/trends/popular-pins') {
    const term = searchParams.get('term') || searchParams.get('q') || searchParams.get('keyword') || '';
    const country = searchParams.get('country') || 'US';
    const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
    if (!term) return jsonResponse({ error: 'term is required' }, 400);
    // [INVARIANT: READ-ONLY-GET-SAFE] Never persist DB mutations inside GET /api/keywords/trends/popular-pins
    const result = await fetchPinterestTrendsPopularPins(null, term, country, force);
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // 28. POST /api/keywords/dispatch-workflow
  if (method === 'POST' && pathname === '/api/keywords/dispatch-workflow') {
    const body = await request.json().catch(() => ({}));
    const targetKw = body.target_keyword || body.keyword || '';
    const folderIdInput = body.folder_id ? String(body.folder_id).trim() : '';
    if (folderIdInput) {
      const parsedFolder = Number(folderIdInput);
      if (!/^\d+$/.test(folderIdInput) || !Number.isSafeInteger(parsedFolder) || parsedFolder <= 0) {
        return jsonResponse({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Valid positive integer folder_id is required'
        }, 400);
      }
      try {
        await assertFolderInWorkspace(sql, parsedFolder, workspaceId);
      } catch (err) {
        if (err?.status === 404 || err?.statusCode === 404) {
          return jsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: err.message || 'Folder not found in current workspace'
          }, 404);
        }
        throw err;
      }
    }
    const maxPinsInput = (body.max_pins !== undefined && body.max_pins !== null) ? String(body.max_pins).trim() : '';
    const maxSerpPinsInput = (body.max_serp_pins !== undefined && body.max_serp_pins !== null)
      ? String(body.max_serp_pins).trim()
      : maxPinsInput;
    const maxCatalogInspectInput = String(body.max_catalog_inspect || '0');
    const enableSerpHarvestInput = body.enable_serp_harvest !== undefined && body.enable_serp_harvest !== null && body.enable_serp_harvest !== ''
      ? String(body.enable_serp_harvest)
      : (folderIdInput ? '' : 'true');
    const crawlScopeInput = String(body.crawl_scope || 'all_pins');
    const dRes = await dispatchGitHubWorkflow(env, {
      workflowFile: 'keyword-intelligence-velocity.yml',
      timeoutMs: 8000,
      inputs: {
        target_keyword: targetKw,
        folder_id: folderIdInput,
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
    return jsonResponse({ success: true, message: 'Workflow dispatched successfully' });
  }

  return null;
}
