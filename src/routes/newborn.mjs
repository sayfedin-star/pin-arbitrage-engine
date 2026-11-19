/**
 * src/routes/newborn.mjs
 *
 * Fastify Native API Sub-Router for `/newborn` Studio:
 * - Dynamic Settings & Schedule Control (`/api/newborn/settings`, `/api/newborn/settings/reset`)
 * - Flexible Named Rule Profiles (`/api/newborn/rules`, `/api/newborn/profiles`)
 * - Two-Zone Cookie Configuration (`/api/newborn/cookie` — strictly redacted, Cache-Control: no-store)
 * - Studio Overview, Candidates, Dossiers, Rookie Radar, Crossover, Runs & Daily Anchors
 * - 8-Surface Discovery, Snowball, Watchlist Polling, Auto-Run & Multi-Destination Promotion
 */

import { CircuitBreakerOpenError } from '../core/pinterest/client.mjs';
import { dispatchGitHubWorkflow } from '../http/github-workflow.mjs';
import {
  SURFACES_CATALOG,
  VALID_UPLOAD_PROVENANCE,
  OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES,
  SUPPORTED_TREND_COUNTRIES,
  parseSmartHuntInput,
  getNewbornSettings,
  updateNewbornSettings,
  patchNewbornSettings,
  resetNewbornSettings,
  evaluateAutomationSchedule,
  listNewbornRuleProfiles,
  getNewbornRuleProfile,
  createNewbornRuleProfile,
  updateNewbornRuleProfile,
  deleteNewbornRuleProfile,
  resolveEffectiveNewbornSettings,
  getNewbornCookieStatus,
  saveNewbornCookie,
  clearNewbornCookie,
  getNewbornOverview,
  listNewbornCandidates,
  getNewbornCandidateDossier,
  updateNewbornCandidateStage,
  deleteNewbornCandidate,
  listNewbornRookies,
  listNewbornRuns,
  getNewbornRunById,
  listNewbornDailyAnchors,
  getNewbornCrossoverReport,
  getNewbornLaunchpadFeed,
  refreshNewbornLaunchpadFeed,
  getNewbornIdeaPageIntelligence,
  fetchNewbornCandidateAccounts,
  enqueueNewbornRun,
  promoteNewbornCandidates,
  promoteNewbornRookies
} from '../modules/newborn/service.mjs';

export const NEWBORN_CRAWLER_PATHS = new Set([
  '/api/newborn/discover',
  '/api/newborn/snowball',
  '/api/newborn/watchlist/poll',
  '/api/newborn/auto-run',
  '/api/newborn/launchpad',
  '/api/newborn/candidates/fetch-accounts'
]);

function deepMergePlain(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMergePlain(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Translates direct Wave 6D Hunt Card inputs (`filters`, `paths`, `target_pins`) into
 * normalized `settings_overrides` merged with any explicit `settings_overrides` / `overrides`.
 */
function buildHuntOverridesFromBody(body = {}, { isSnowball = false } = {}) {
  const explicit = body?.settings_overrides ?? body?.overrides ?? null;
  const patch = {};

  const f = (body?.filters && typeof body.filters === 'object') ? body.filters : {};
  const maxAge = f.max_age_days ?? body?.max_age_days;
  const minRepins = f.min_repin_count ?? f.min_repins ?? body?.min_repin_count ?? body?.min_repins;
  const minSaves = f.min_save_count ?? f.min_saves ?? body?.min_save_count ?? body?.min_saves;
  const strictRootAge = f.strict_root_age ?? body?.strict_root_age;

  if (maxAge !== undefined || minRepins !== undefined || minSaves !== undefined || strictRootAge !== undefined) {
    patch.qualification = {};
    if (maxAge !== undefined && maxAge !== null && maxAge !== '') {
      patch.qualification.max_age_days = Math.max(1, Math.min(365, Number(maxAge) || 30));
    }
    if (minRepins !== undefined && minRepins !== null && minRepins !== '') {
      patch.qualification.min_repin_count = Math.max(0, Math.min(100000, Number(minRepins) || 0));
    }
    if (minSaves !== undefined && minSaves !== null && minSaves !== '') {
      patch.qualification.min_save_count = Math.max(0, Math.min(100000, Number(minSaves) || 0));
    }
    if (strictRootAge !== undefined) {
      patch.qualification.strict_root_age = Boolean(strictRootAge);
    }
  }

  const p = (body?.paths && typeof body.paths === 'object') ? body.paths : null;
  if (p) {
    const surfaces = {};
    if (p.search !== undefined) {
      const sObj = typeof p.search === 'boolean' ? { enabled: p.search } : (p.search || {});
      const targetPins = Math.max(50, Math.min(5000, Number(sObj.target_pins ?? sObj.limit ?? 500) || 500));
      surfaces.pin_serp_capsules = {
        enabled: sObj.enabled !== false,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(100, Math.ceil(targetPins / 50)))
      };
    }
    if (p.boards !== undefined) {
      const bObj = typeof p.boards === 'boolean' ? { enabled: p.boards } : (p.boards || {});
      const enabled = bObj.enabled !== false;
      const maxBoards = Math.max(1, Math.min(50, Number(bObj.max_boards ?? bObj.count ?? 10) || 10));
      const pinsPerBoard = Math.max(25, Math.min(1000, Number(bObj.target_pins_per_board ?? bObj.pins_per_board ?? 100) || 100));
      surfaces.fresh_boards = {
        enabled,
        max_boards: maxBoards,
        max_boards_to_expand: maxBoards,
        target_pins_per_board: pinsPerBoard
      };
      surfaces.board_feed = {
        enabled,
        page_size: 100,
        target_pins_per_board: pinsPerBoard,
        max_pages: Math.max(1, Math.min(20, Math.ceil(pinsPerBoard / 100)))
      };
      surfaces.board_more_ideas = {
        enabled: Boolean(enabled && bObj.find_more_ideas !== false),
        max_boards: Math.min(20, maxBoards)
      };
    }
    if (p.idea_page !== undefined) {
      const iObj = typeof p.idea_page === 'boolean' ? { enabled: p.idea_page } : (p.idea_page || {});
      const targetPins = Math.max(50, Math.min(2000, Number(iObj.target_pins ?? iObj.limit ?? 250) || 250));
      surfaces.ideas_feeds = {
        enabled: iObj.enabled !== false,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(40, Math.ceil(targetPins / 50)))
      };
    }
    if (p.home_feed !== undefined) {
      const hObj = typeof p.home_feed === 'boolean' ? { enabled: p.home_feed } : (p.home_feed || {});
      const targetPins = Math.max(50, Math.min(2000, Number(hObj.target_pins ?? hObj.limit ?? 250) || 250));
      surfaces.home_feed = {
        enabled: hObj.enabled === true,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(40, Math.ceil(targetPins / 50)))
      };
    }
    if (p.related !== undefined) {
      const rObj = typeof p.related === 'boolean' ? { enabled: p.related } : (p.related || {});
      const targetPins = Math.max(50, Math.min(1000, Number(rObj.target_pins ?? rObj.limit ?? 200) || 200));
      surfaces.related_pin_snowball = {
        enabled: Boolean(rObj.enabled),
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(40, Math.ceil(targetPins / 25)))
      };
    }
    // Keep Trend/Zero-Query seed expansion off when user picks explicit Hunt Card paths unless explicitly toggled
    if (p.growing_trends === undefined) {
      surfaces.growing_trends = { enabled: false };
    } else {
      surfaces.growing_trends = { enabled: Boolean(typeof p.growing_trends === 'boolean' ? p.growing_trends : p.growing_trends?.enabled) };
    }
    if (p.zero_query_popular === undefined) {
      surfaces.zero_query_popular = { enabled: false };
    } else {
      surfaces.zero_query_popular = { enabled: Boolean(typeof p.zero_query_popular === 'boolean' ? p.zero_query_popular : p.zero_query_popular?.enabled) };
    }

    if (Object.keys(surfaces).length > 0) {
      patch.discovery = { ...(patch.discovery || {}), surfaces };
    }
  }

  if (isSnowball && (body?.target_pins !== undefined || body?.max_hops !== undefined)) {
    const targetPins = Math.max(50, Math.min(1000, Number(body?.target_pins ?? 200) || 200));
    patch.discovery = deepMergePlain(patch.discovery || {}, {
      surfaces: {
        related_pin_snowball: {
          enabled: true,
          target_pins: targetPins,
          max_pages: Math.max(1, Math.min(40, Math.ceil(targetPins / 25)))
        }
      },
      ...(body?.max_hops !== undefined ? { snowball: { enabled: true, max_hops: Math.max(1, Math.min(3, Number(body.max_hops) || 1)) } } : {})
    });
  }

  const hasPatch = Object.keys(patch).length > 0;
  if (!hasPatch) return explicit;
  return explicit ? deepMergePlain(patch, explicit) : patch;
}

/**
 * Fast URI discriminator for `/api/newborn/*` routes.
 */
export function isNewbornRoute(pathname) {
  return pathname === '/api/newborn' || pathname.startsWith('/api/newborn/');
}

export async function handleNewbornRoutes({
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
  tripPinterestCircuitBreaker,
  redactSecrets
}) {
  // 1. /api/newborn/settings (GET, PUT, PATCH) — strictly no-store
  if (pathname === '/api/newborn/settings') {
    if (method === 'GET') {
      const [settings, cookieStatus, profiles] = await Promise.all([
        getNewbornSettings(sql),
        getNewbornCookieStatus(sql, env),
        sql ? listNewbornRuleProfiles(sql, { includeInactive: true }).catch(() => []) : Promise.resolve([])
      ]);
      const schedule = evaluateAutomationSchedule(settings);
      return jsonResponse({
        success: true,
        settings,
        schedule,
        cookie_status: cookieStatus,
        surfaces_catalog: SURFACES_CATALOG,
        valid_upload_provenance: VALID_UPLOAD_PROVENANCE,
        l1_interests_catalog: OFFICIAL_L1_INTERESTS,
        supported_trend_types: SUPPORTED_TREND_TYPES,
        supported_countries: SUPPORTED_TREND_COUNTRIES,
        profiles
      }, 200, -1);
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await request.json();
      const rawPayload = (body && typeof body === 'object' && body.settings && typeof body.settings === 'object')
        ? body.settings
        : (body || {});

      const settings = method === 'PUT'
        ? await updateNewbornSettings(sql, rawPayload)
        : await patchNewbornSettings(sql, rawPayload);
      const schedule = evaluateAutomationSchedule(settings);
      await invalidateEdgeCache('newborn');

      return jsonResponse({
        success: true,
        settings,
        schedule
      }, 200, -1);
    }

    return methodNotAllowedResponse('GET, PUT, PATCH, OPTIONS');
  }

  // 1B. /api/newborn/settings/reset (POST)
  if (pathname === '/api/newborn/settings/reset') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const settings = await resetNewbornSettings(sql);
    const schedule = evaluateAutomationSchedule(settings);
    await invalidateEdgeCache('newborn');
    return jsonResponse({
      success: true,
      settings,
      schedule
    }, 200, -1);
  }

  // 2. /api/newborn/rules & /api/newborn/profiles (GET, POST)
  if (pathname === '/api/newborn/rules' || pathname === '/api/newborn/profiles') {
    if (method === 'GET') {
      const includeInactive = searchParams.get('include_inactive') === 'true';
      const folderId = searchParams.get('folder_id') || null;
      const profiles = await listNewbornRuleProfiles(sql, { includeInactive, folderId });
      return jsonResponse({
        success: true,
        profiles
      }, 200, -1);
    }

    if (method === 'POST') {
      const body = await request.json();
      if (!body?.name || !String(body.name).trim()) {
        return jsonResponse({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Rule profile "name" is required.'
        }, 400, -1);
      }
      const profile = await createNewbornRuleProfile(sql, body);
      await invalidateEdgeCache('newborn');
      return jsonResponse({
        success: true,
        profile
      }, 201, -1);
    }

    return methodNotAllowedResponse('GET, POST, OPTIONS');
  }

  // 2B. /api/newborn/rules/:id & /api/newborn/profiles/:id (GET, PUT, PATCH, DELETE)
  const profileMatch = pathname.match(/^\/api\/newborn\/(?:rules|profiles)\/([^/]+)$/);
  if (profileMatch) {
    const idOrSlug = decodeURIComponent(profileMatch[1]);

    if (method === 'GET') {
      const profile = await getNewbornRuleProfile(sql, idOrSlug);
      if (!profile) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Rule profile "${idOrSlug}" not found.`
        }, 404, -1);
      }
      const { settings: effectiveSettings } = await resolveEffectiveNewbornSettings(sql, { profileId: profile.id });
      return jsonResponse({
        success: true,
        profile,
        effective_settings: effectiveSettings
      }, 200, -1);
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await request.json();
      const updated = await updateNewbornRuleProfile(sql, idOrSlug, body || {});
      if (!updated) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Rule profile "${idOrSlug}" not found.`
        }, 404, -1);
      }
      await invalidateEdgeCache('newborn');
      return jsonResponse({
        success: true,
        profile: updated
      }, 200, -1);
    }

    if (method === 'DELETE') {
      const delRes = await deleteNewbornRuleProfile(sql, idOrSlug);
      if (!delRes.deleted) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Rule profile "${idOrSlug}" not found.`
        }, 404, -1);
      }
      await invalidateEdgeCache('newborn');
      return jsonResponse({
        success: true,
        ...delRes
      }, 200, -1);
    }

    return methodNotAllowedResponse('GET, PUT, PATCH, DELETE, OPTIONS');
  }

  // 3. /api/newborn/cookie (GET, POST, PUT, DELETE) — strictly redacted & no-store
  if (pathname === '/api/newborn/cookie') {
    if (method === 'GET') {
      const status = await getNewbornCookieStatus(sql, env);
      return jsonResponse({
        success: true,
        ...status
      }, 200, -1);
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await request.json();
      const rawCookie = typeof body?.cookie === 'string'
        ? body.cookie
        : (typeof body?.pinterest_cookie === 'string' ? body.pinterest_cookie : '');
      const status = await saveNewbornCookie(sql, rawCookie, {
        alsoUpdateShared: Boolean(body?.also_update_shared)
      });
      await invalidateEdgeCache('newborn');
      return jsonResponse({
        success: true,
        ...status
      }, 200, -1);
    }

    if (method === 'DELETE') {
      const status = await clearNewbornCookie(sql);
      await invalidateEdgeCache('newborn');
      return jsonResponse({
        success: true,
        ...status
      }, 200, -1);
    }

    return methodNotAllowedResponse('GET, POST, PUT, DELETE, OPTIONS');
  }

  // 4. /api/newborn/overview (GET) — strictly no-store (live run counts + cookie status)
  if (pathname === '/api/newborn/overview' || pathname === '/api/newborn') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const payload = await getNewbornOverview(sql, env);
    return jsonResponse(payload, 200, -1);
  }

  // 4B. /api/newborn/idea-intelligence (GET) — Official Idea Page URL, Search Volume & Growth %
  if (pathname === '/api/newborn/idea-intelligence') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('keyword') || '';
    const country = searchParams.get('country') || 'US';
    const result = await getNewbornIdeaPageIntelligence(q, {
      country,
      routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
      env
    });
    return jsonResponse({ success: true, ...result }, 200, -1);
  }

  // 5. /api/newborn/candidates (GET)
  if (pathname === '/api/newborn/candidates') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const filters = {
      run_id: searchParams.get('run_id') || null,
      folder_id: searchParams.get('folder_id') || null,
      stage: searchParams.get('stage') || null,
      surface: searchParams.get('surface') || null,
      provenance: searchParams.get('provenance') || null,
      golden_only: searchParams.get('golden_only') || searchParams.get('golden') || null,
      rookie_only: searchParams.get('rookie_only') || searchParams.get('rookie') || null,
      linkless_only: searchParams.get('linkless_only') || searchParams.get('linkless') || null,
      qualified_only: searchParams.get('qualified_only') || null,
      min_golden_score: searchParams.get('min_golden_score') || null,
      min_repins: searchParams.get('min_repins') || searchParams.get('min_repin_count') || null,
      max_age_days: searchParams.get('max_age_days') || null,
      annotation: searchParams.get('annotation') || null,
      search: searchParams.get('search') || searchParams.get('q') || '',
      sort: searchParams.get('sort') || 'repins',
      limit: clampLimit(searchParams.get('limit'), 50, 500),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
    };
    const cacheKey = buildCanonicalCacheKey('newborn:candidates', searchParams);
    const data = await getCachedOrFetch(cacheKey, () => listNewbornCandidates(sql, filters), 10_000);
    return jsonResponse({ success: true, ...data }, 200, filters.run_id ? -1 : 10);
  }

  // 5B. /api/newborn/candidates/stage (POST bulk stage transition)
  if (pathname === '/api/newborn/candidates/stage') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json();
    const pinIds = body?.pin_ids || body?.pinIds || (body?.pin_id ? [body.pin_id] : []);
    const result = await updateNewbornCandidateStage(sql, pinIds, body?.stage);
    return jsonResponse({ success: true, ...result }, 200, -1);
  }

  // 5B2. /api/newborn/candidates/:pin_id/fetch-account (POST on-demand Zero-Cookie Account Reach & Impressions)
  const fetchAccountMatch = pathname.match(/^\/api\/newborn\/candidates\/([^/]+)\/fetch-account$/);
  if (fetchAccountMatch) {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const pinId = decodeURIComponent(fetchAccountMatch[1]).trim();
    try {
      const result = await fetchNewbornCandidateAccounts(sql, [pinId], {
        routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
        env
      });
      if (!result.ok) {
        return jsonResponse({
          success: false,
          error: result.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: result.message
        }, result.status || 400, -1);
      }
      return jsonResponse({ success: true, ...result }, 200, -1);
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError || err?.name === 'CircuitBreakerOpenError') {
        if (typeof tripPinterestCircuitBreaker === 'function') {
          await tripPinterestCircuitBreaker(env, 'Newborn CircuitBreakerOpenError', 300).catch(() => {});
        }
        return jsonResponse({
          success: false,
          error: 'PINTEREST_RATE_LIMITED',
          message: redactSecrets(err.message || 'Pinterest rate-limit circuit breaker is open.')
        }, 429, -1);
      }
      throw err;
    }
  }

  // 5C. /api/newborn/candidates/:pin_id (GET, PATCH, DELETE)
  const candMatch = pathname.match(/^\/api\/newborn\/candidates\/([^/]+)$/);
  if (candMatch) {
    const pinId = decodeURIComponent(candMatch[1]);

    if (method === 'GET') {
      const dossier = await getNewbornCandidateDossier(sql, pinId);
      if (!dossier) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Newborn candidate "${pinId}" not found.`
        }, 404, -1);
      }
      return jsonResponse({ success: true, ...dossier }, 200, -1);
    }

    if (method === 'PATCH') {
      const body = await request.json();
      const result = await updateNewbornCandidateStage(sql, [pinId], body?.stage);
      return jsonResponse({ success: true, ...result }, 200, -1);
    }

    if (method === 'DELETE') {
      const result = await deleteNewbornCandidate(sql, [pinId]);
      return jsonResponse({ success: true, ...result }, 200, -1);
    }

    return methodNotAllowedResponse('GET, PATCH, DELETE, OPTIONS');
  }

  // 6. /api/newborn/rookies (GET)
  if (pathname === '/api/newborn/rookies') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const filters = {
      run_id: searchParams.get('run_id') || null,
      stage: searchParams.get('stage') || null,
      search: searchParams.get('search') || searchParams.get('q') || '',
      limit: clampLimit(searchParams.get('limit'), 50, 200),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
    };
    const cacheKey = buildCanonicalCacheKey('newborn:rookies', searchParams);
    const data = await getCachedOrFetch(cacheKey, () => listNewbornRookies(sql, filters), 10_000);
    return jsonResponse({ success: true, ...data }, 200, filters.run_id ? -1 : 10);
  }

  // 7. /api/newborn/crossover (GET)
  if (pathname === '/api/newborn/crossover') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const runId = searchParams.get('run_id') || null;
    const stage = searchParams.get('stage') || null;
    const goldenOnly = searchParams.get('golden_only') === 'true';
    const limit = clampLimit(searchParams.get('limit'), 30, 100);
    const cacheKey = buildCanonicalCacheKey('newborn:crossover', searchParams);
    const report = await getCachedOrFetch(
      cacheKey,
      () => getNewbornCrossoverReport(sql, { runId, stage, goldenOnly, limit }),
      15_000
    );
    return jsonResponse({ success: true, ...report }, 200, runId ? -1 : 15);
  }

  // 8. /api/newborn/runs (GET) — strictly no-store
  if (pathname === '/api/newborn/runs') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const limit = clampLimit(searchParams.get('limit'), 30, 100);
    const folderId = searchParams.get('folder_id') || null;
    const runs = await listNewbornRuns(sql, { limit, folderId });
    return jsonResponse({ success: true, runs }, 200, -1);
  }

  // 8B. /api/newborn/runs/:id (GET) — live 1.5s progress polling, strictly no-store
  const runDetailMatch = pathname.match(/^\/api\/newborn\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const rawRunId = decodeURIComponent(runDetailMatch[1]).trim();
    if (!/^\d+$/.test(rawRunId)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: `Invalid run ID "${rawRunId}". Expected a positive integer.`
      }, 400, -1);
    }
    const run = await getNewbornRunById(sql, Number(rawRunId));
    if (!run) {
      return jsonResponse({
        success: false,
        error: 'NOT_FOUND',
        message: `Newborn run #${rawRunId} not found.`
      }, 404, -1);
    }
    return jsonResponse({ success: true, run }, 200, -1);
  }

  // 9. /api/newborn/anchors (GET)
  if (pathname === '/api/newborn/anchors') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const activeOnly = searchParams.get('active_only') !== 'false';
    const limit = clampLimit(searchParams.get('limit'), 100, 500);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const anchors = await listNewbornDailyAnchors(sql, { activeOnly, limit, offset });
    return jsonResponse({ success: true, anchors }, 200, -1);
  }

  // 9B. /api/newborn/launchpad (GET pure read; POST falls through to NEWBORN_CRAWLER_PATHS live refresh)
  if (pathname === '/api/newborn/launchpad' && method !== 'POST') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, POST, OPTIONS');
    }
    const country = searchParams.get('country') || null;
    const trendType = searchParams.get('trend_type') || searchParams.get('type') || 'growing';
    const l1Interest = searchParams.get('l1_interest') || searchParams.get('interest') || 'all';
    const cacheKey = buildCanonicalCacheKey('newborn:launchpad', searchParams);
    const feed = await getCachedOrFetch(
      cacheKey,
      () => getNewbornLaunchpadFeed(sql, { country, trendType, l1Interest }),
      15_000
    );
    return jsonResponse({ success: true, ...feed }, 200, -1);
  }

  // 9C. /api/newborn/fleet-dispatch (POST — Dispatches GitHub Actions newborn-hunter.yml)
  if (pathname === '/api/newborn/fleet-dispatch') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json().catch(() => ({}));
    const ghRes = await dispatchGitHubWorkflow(env, {
      workflowFile: 'newborn-hunter.yml',
      allowPat: true,
      inputs: {
        mode: String(body?.mode || 'auto_cycle'),
        profile: String(body?.profile || ''),
        query: String(body?.query || ''),
        shards: String(body?.shards || '4'),
        force: body?.force === false ? 'false' : 'true'
      }
    });
    if (!ghRes.ok) {
      return jsonResponse({
        success: false,
        error: ghRes.missingToken ? 'GITHUB_TOKEN_MISSING' : 'DISPATCH_FAILED',
        message: redactSecrets(ghRes.error || 'Failed to dispatch newborn-hunter.yml workflow.')
      }, ghRes.missingToken ? 400 : (ghRes.status || 502), -1);
    }
    return jsonResponse({
      success: true,
      dispatched: true,
      workflow: 'newborn-hunter.yml',
      repo: ghRes.githubRepo
    }, 200, -1);
  }

  // 10. Live Harvesting, Snowball, Watchlist Polling, Launchpad Refresh & Auto-Run Endpoints (POST)
  if (NEWBORN_CRAWLER_PATHS.has(pathname)) {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }

    const body = await request.json().catch(() => ({}));
    try {
      if (pathname === '/api/newborn/candidates/fetch-accounts') {
        const pinIds = body?.pin_ids || body?.pinIds || (body?.pin_id ? [body.pin_id] : []);
        const result = await fetchNewbornCandidateAccounts(sql, pinIds, {
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env
        });
        if (!result.ok) {
          return jsonResponse({
            success: false,
            error: result.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
            message: result.message
          }, result.status || 400, -1);
        }
        return jsonResponse({ success: true, ...result }, 200, -1);
      }

      if (pathname === '/api/newborn/launchpad') {
        const result = await refreshNewbornLaunchpadFeed(sql, {
          country: body?.country || null,
          trendType: body?.trend_type || body?.type || 'growing',
          l1Interest: body?.l1_interest || body?.interest || 'all',
          limit: body?.limit || 25,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env
        });
        return jsonResponse({ success: true, ...result }, 200, -1);
      }

      if (pathname === '/api/newborn/discover') {
        const rawInputs = [
          ...(Array.isArray(body?.seed_queries) ? body.seed_queries : []),
          ...(Array.isArray(body?.queries) ? body.queries : []),
          ...(body?.query ? [body.query] : []),
          ...(body?.seed_input ? [body.seed_input] : [])
        ];
        const parsedQueries = [];
        const parsedPinIds = [
          ...(Array.isArray(body?.seed_pin_ids) ? body.seed_pin_ids : []),
          ...(Array.isArray(body?.pin_ids) ? body.pin_ids : [])
        ];
        const parsedBoards = Array.isArray(body?.seed_boards) ? [...body.seed_boards] : [];

        for (const item of rawInputs) {
          const parsed = parseSmartHuntInput(item);
          if (!parsed) continue;
          if (parsed.kind === 'pin') {
            parsedPinIds.push(parsed.pinId);
          } else if (parsed.kind === 'board') {
            parsedBoards.push(parsed.board);
            if (parsed.query) parsedQueries.push(parsed.query);
          } else if (parsed.query) {
            parsedQueries.push(parsed.query);
          }
        }

        const mergedOverrides = buildHuntOverridesFromBody(body, { isSnowball: false });

        const queued = await enqueueNewbornRun(sql, {
          runType: 'discovery',
          seedQueries: parsedQueries,
          seedPinIds: parsedPinIds,
          seedBoards: parsedBoards,
          profileId: body?.profile_id ?? body?.profile ?? null,
          folderId: body?.folder_id ?? null,
          settingsOverrides: mergedOverrides,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...queued }, 202, -1);
      }

      if (pathname === '/api/newborn/snowball') {
        const rawPinIds = body?.seed_pin_ids || body?.pin_ids || (body?.pin_id ? [body.pin_id] : []);
        const seedPinIds = (Array.isArray(rawPinIds) ? rawPinIds : [rawPinIds])
          .map((id) => String(id || '').trim())
          .filter(Boolean);
        const mergedOverrides = buildHuntOverridesFromBody(body, { isSnowball: true });
        const queued = await enqueueNewbornRun(sql, {
          runType: 'snowball',
          seedPinIds,
          profileId: body?.profile_id ?? body?.profile ?? null,
          folderId: body?.folder_id ?? null,
          settingsOverrides: mergedOverrides,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...queued }, 202, -1);
      }

      if (pathname === '/api/newborn/watchlist/poll') {
        const queued = await enqueueNewbornRun(sql, {
          runType: 'watchlist_poll',
          profileId: body?.profile_id ?? null,
          folderId: body?.folder_id ?? null,
          workerIndex: body?.worker_index ?? 0,
          workerTotal: body?.worker_total ?? 1,
          autoPromote: body?.auto_promote ?? null,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...queued }, 202, -1);
      }

      if (pathname === '/api/newborn/auto-run') {
        const queued = await enqueueNewbornRun(sql, {
          runType: 'auto_cycle',
          force: Boolean(body?.force),
          forceDiscovery: Boolean(body?.force_discovery),
          forceWatchlist: Boolean(body?.force_watchlist),
          seedQueries: body?.seed_queries || [],
          profileId: body?.profile_id ?? null,
          folderId: body?.folder_id ?? null,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...queued }, 202, -1);
      }
    } catch (err) {
      if (err?.status === 503 || err?.code === 'QUEUE_SATURATED') {
        return jsonResponse({
          success: false,
          error: err.code || 'SERVICE_UNAVAILABLE',
          message: redactSecrets(err.message || 'Newborn queue is busy. Please retry shortly.')
        }, 503, -1);
      }
      if (err instanceof CircuitBreakerOpenError || err?.name === 'CircuitBreakerOpenError') {
        if (typeof tripPinterestCircuitBreaker === 'function') {
          await tripPinterestCircuitBreaker(env, 'Newborn CircuitBreakerOpenError', 300).catch(() => {});
        }
        return jsonResponse({
          success: false,
          error: 'PINTEREST_RATE_LIMITED',
          message: redactSecrets(err.message || 'Pinterest rate-limit circuit breaker is open.')
        }, 429, -1);
      }
      throw err;
    }
  }

  // 11. /api/newborn/promote (POST — Multi-Destination Pin & Rookie Promotion)
  if (pathname === '/api/newborn/promote') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json();
    const pinIds = body?.pin_ids || body?.pinIds || (body?.pin_id ? [body.pin_id] : []);
    const usernames = body?.usernames || body?.rookies || (body?.username ? [body.username] : []);

    if ((!Array.isArray(pinIds) || pinIds.length === 0) && (!Array.isArray(usernames) || usernames.length === 0)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Provide at least one "pin_ids" or "usernames" entry to promote.'
      }, 400, -1);
    }

    const pinsResult = (Array.isArray(pinIds) && pinIds.length > 0)
      ? await promoteNewbornCandidates(sql, {
          pinIds,
          destinations: body?.destinations || {
            promote_to_daily_ssot: body?.promote_to_daily_ssot !== false,
            promote_to_campaign_folder_id: body?.folder_id ?? body?.promote_to_campaign_folder_id ?? null,
            promote_top_annotation_as_keyword: Boolean(body?.promote_top_annotation_as_keyword || body?.keyword),
            keyword: body?.keyword || null,
            promote_to_cluster_seeds: Boolean(body?.promote_to_cluster_seeds)
          },
          source: body?.source || 'manual',
          notes: body?.notes || '',
          env,
          ctx
        })
      : null;

    const rookiesResult = (Array.isArray(usernames) && usernames.length > 0)
      ? await promoteNewbornRookies(sql, {
          usernames,
          trackingMode: body?.tracking_mode || 'pulse_only',
          folderId: body?.folder_id ?? null,
          source: body?.source || 'manual',
          env,
          ctx
        })
      : null;

    if (pinsResult?.status === 404 && !rookiesResult) {
      return jsonResponse({
        success: false,
        error: 'NOT_FOUND',
        message: pinsResult.message
      }, 404, -1);
    }
    if (rookiesResult?.status === 404 && !pinsResult) {
      return jsonResponse({
        success: false,
        error: 'NOT_FOUND',
        message: rookiesResult.message
      }, 404, -1);
    }

    return jsonResponse({
      success: true,
      pins: pinsResult,
      rookies: rookiesResult
    }, 200, -1);
  }

  return jsonResponse({
    success: false,
    error: 'NOT_FOUND',
    message: `Endpoint '${pathname}' not found on /api/newborn router.`
  }, 404, -1);
}
