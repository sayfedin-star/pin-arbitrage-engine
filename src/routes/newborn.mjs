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
import { dispatchGitHubWorkflow, resolveGitHubAuth } from '../http/github-workflow.mjs';
import {
  DEFAULT_WORKSPACE_ID,
  assertFolderInWorkspace,
  getWorkspaceSettings,
  saveWorkspaceCookie,
  clearWorkspaceCookie
} from '../modules/workspaces/service.mjs';
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
  deleteNewbornRun,
  deleteNewbornRunsBulk,
  clearFailedAndEmptyNewbornRuns,
  getNewbornRunById,
  listNewbornDailyAnchors,
  getNewbornCrossoverReport,
  getNewbornLaunchpadFeed,
  refreshNewbornLaunchpadFeed,
  getNewbornIdeaPageIntelligence,
  buildNewbornKeywordCluster,
  enrichClusterRemainingVolumes,
  listNewbornKeywordClusters,
  getNewbornKeywordClusterById,
  fetchNewbornCandidateAccounts,
  enqueueNewbornRun,
  cancelNewbornRun,
  createFleetBackedNewbornRun,
  promoteNewbornCandidates,
  promoteNewbornRookies
} from '../modules/newborn/service.mjs';

export const NEWBORN_CRAWLER_PATHS = new Set([
  '/api/newborn/discover',
  '/api/newborn/snowball',
  '/api/newborn/watchlist/poll',
  '/api/newborn/auto-run',
  '/api/newborn/launchpad',
  '/api/newborn/candidates/fetch-accounts',
  '/api/newborn/cluster/build',
  '/api/newborn/cluster/enrich',
  '/api/newborn/cluster/hunt'
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
export function buildHuntOverridesFromBody(body = {}, { isSnowball = false } = {}) {
  const explicit = body?.settings_overrides ?? body?.overrides ?? null;
  const patch = {};

  const f = (body?.filters && typeof body.filters === 'object') ? body.filters : {};
  const maxAge = f.max_age_days ?? body?.max_age_days;
  const minRepins = f.min_repin_count ?? f.min_repins ?? body?.min_repin_count ?? body?.min_repins;
  const minSaves = f.min_save_count ?? f.min_saves ?? body?.min_save_count ?? body?.min_saves;
  const resolveRootPin = f.resolve_root_pin ?? body?.resolve_root_pin ?? f.strict_root_age ?? body?.strict_root_age;

  if (maxAge !== undefined || minRepins !== undefined || minSaves !== undefined || resolveRootPin !== undefined) {
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
    if (resolveRootPin !== undefined) {
      patch.qualification.resolve_root_pin = Boolean(resolveRootPin);
    }
  }

  const maxHydrations = f.max_pin_hydrations_per_run ?? body?.max_pin_hydrations_per_run ?? body?.max_pin_hydrations ?? body?.hydration?.max_pin_hydrations_per_run;
  if (maxHydrations !== undefined && maxHydrations !== null && maxHydrations !== '') {
    patch.discovery = {
      ...(patch.discovery || {}),
      hydration: {
        max_pin_hydrations_per_run: Math.max(5, Math.min(5000, Math.round(Number(maxHydrations) || 500)))
      }
    };
  }

  const p = (body?.paths && typeof body.paths === 'object') ? body.paths : null;
  if (p) {
    const surfaces = {};
    if (p.search !== undefined) {
      const sObj = typeof p.search === 'boolean' ? { enabled: p.search } : (p.search || {});
      const targetPins = Math.max(25, Math.min(10000, Math.round(Number(sObj.target_pins ?? sObj.limit ?? 500) || 500)));
      surfaces.pin_serp_capsules = {
        enabled: sObj.enabled !== false,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(200, Math.ceil(targetPins / 50)))
      };
    }
    if (p.boards !== undefined) {
      const bObj = typeof p.boards === 'boolean' ? { enabled: p.boards } : (p.boards || {});
      const enabled = bObj.enabled !== false;
      const maxBoards = Math.max(1, Math.min(50, Math.round(Number(bObj.max_boards ?? bObj.count ?? 10) || 10)));
      const pinsPerBoard = Math.max(25, Math.min(1000, Math.round(Number(bObj.target_pins_per_board ?? bObj.pins_per_board ?? 100) || 100)));
      surfaces.fresh_boards = {
        enabled,
        max_boards: maxBoards,
        max_boards_to_expand: maxBoards,
        target_pins_per_board: pinsPerBoard
      };
      // Wave 6E: Disable `board_feed` completely on Boards path — extract pins ONLY from `board_more_ideas` ("Find more ideas")!
      surfaces.board_feed = {
        enabled: false,
        page_size: 100,
        target_pins_per_board: pinsPerBoard,
        max_pages: Math.max(1, Math.min(20, Math.ceil(pinsPerBoard / 100)))
      };
      surfaces.board_more_ideas = {
        enabled: Boolean(enabled),
        page_size: 25,
        target_pins_per_board: pinsPerBoard,
        max_pages: Math.max(1, Math.min(40, Math.ceil(pinsPerBoard / 25)))
      };
    }
    if (p.idea_page !== undefined) {
      const iObj = typeof p.idea_page === 'boolean' ? { enabled: p.idea_page } : (p.idea_page || {});
      const targetPins = Math.max(25, Math.min(5000, Math.round(Number(iObj.target_pins ?? iObj.limit ?? 250) || 250)));
      surfaces.ideas_feeds = {
        enabled: iObj.enabled !== false,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(100, Math.ceil(targetPins / 50)))
      };
    }
    if (p.home_feed !== undefined) {
      const hObj = typeof p.home_feed === 'boolean' ? { enabled: p.home_feed } : (p.home_feed || {});
      const targetPins = Math.max(25, Math.min(5000, Math.round(Number(hObj.target_pins ?? hObj.limit ?? 250) || 250)));
      surfaces.home_feed = {
        enabled: hObj.enabled === true,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(100, Math.ceil(targetPins / 50)))
      };
    }
    if (p.related !== undefined) {
      const rObj = typeof p.related === 'boolean' ? { enabled: p.related } : (p.related || {});
      const relatedEnabled = isSnowball ? true : Boolean(rObj.enabled);
      const targetPins = Math.max(25, Math.min(2000, Math.round(Number(rObj.target_pins ?? rObj.limit ?? 200) || 200)));
      surfaces.related_pin_snowball = {
        enabled: relatedEnabled,
        target_pins: targetPins,
        max_pages: Math.max(1, Math.min(80, Math.ceil(targetPins / 25)))
      };
      patch.discovery = deepMergePlain(patch.discovery || {}, {
        snowball: relatedEnabled ? { enabled: true } : { enabled: false, max_hops: 0 }
      });
    } else if (!isSnowball) {
      surfaces.related_pin_snowball = { enabled: false };
      patch.discovery = deepMergePlain(patch.discovery || {}, {
        snowball: { enabled: false, max_hops: 0 }
      });
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
      patch.discovery = deepMergePlain(patch.discovery || {}, { surfaces });
    }
  } else if (!isSnowball && !explicit?.discovery?.surfaces?.related_pin_snowball && !explicit?.discovery?.snowball) {
    patch.discovery = deepMergePlain(patch.discovery || {}, {
      surfaces: { related_pin_snowball: { enabled: false } },
      snowball: { enabled: false, max_hops: 0 }
    });
  }

  if (isSnowball) {
    const hasSnowballLimits = body?.target_pins !== undefined || body?.max_hops !== undefined;
    const targetPins = hasSnowballLimits
      ? Math.max(25, Math.min(2000, Math.round(Number(body?.target_pins ?? 200) || 200)))
      : null;
    patch.discovery = deepMergePlain(patch.discovery || {}, {
      surfaces: {
        related_pin_snowball: {
          enabled: true,
          ...(targetPins !== null ? { target_pins: targetPins, max_pages: Math.max(1, Math.min(80, Math.ceil(targetPins / 25))) } : {})
        }
      },
      snowball: {
        enabled: true,
        ...(body?.max_hops !== undefined ? { max_hops: Math.max(1, Math.min(3, Number(body.max_hops) || 1)) } : {})
      }
    });
  }

  const hasPatch = Object.keys(patch).length > 0;
  if (!hasPatch) return explicit;
  return explicit ? deepMergePlain(patch, explicit) : patch;
}

export function computeEstimatedPinBudget(body = {}, keywordsCount = 1, workspaceSettings = null) {
  const kwCount = Math.max(1, Number(keywordsCount) || 1);
  const p = (body?.paths && typeof body.paths === 'object')
    ? body.paths
    : (workspaceSettings?.extraction_targets && typeof workspaceSettings.extraction_targets === 'object'
        ? workspaceSettings.extraction_targets
        : null);
  if (!p) {
    // Default hunt budget (~500 Search + ~1000 Boards + ~250 Idea Page per keyword)
    return kwCount * 1750;
  }
  let perKeyword = 0;
  if (p.search !== undefined) {
    const sObj = typeof p.search === 'boolean' ? { enabled: p.search } : (p.search || {});
    if (sObj.enabled !== false) {
      perKeyword += Math.max(25, Math.min(10000, Number(sObj.target_pins ?? sObj.limit ?? 500) || 500));
    }
  }
  if (p.boards !== undefined) {
    const bObj = typeof p.boards === 'boolean' ? { enabled: p.boards } : (p.boards || {});
    if (bObj.enabled !== false) {
      const maxBoards = Math.max(1, Math.min(50, Number(bObj.max_boards ?? bObj.count ?? 10) || 10));
      const pinsPerBoard = Math.max(25, Math.min(1000, Number(bObj.target_pins_per_board ?? bObj.pins_per_board ?? 100) || 100));
      perKeyword += maxBoards * pinsPerBoard;
    }
  }
  if (p.idea_page !== undefined) {
    const iObj = typeof p.idea_page === 'boolean' ? { enabled: p.idea_page } : (p.idea_page || {});
    if (iObj.enabled !== false) {
      perKeyword += Math.max(25, Math.min(5000, Number(iObj.target_pins ?? iObj.limit ?? 250) || 250));
    }
  }
  let homeFeedPins = 0;
  if (p.home_feed !== undefined) {
    const hObj = typeof p.home_feed === 'boolean' ? { enabled: p.home_feed } : (p.home_feed || {});
    if (hObj.enabled === true) {
      homeFeedPins = Math.max(25, Math.min(5000, Number(hObj.target_pins ?? hObj.limit ?? 250) || 250));
    }
  }
  return (perKeyword * kwCount) + homeFeedPins;
}

export function resolveExecutionMode({ requestedMode = 'auto', keywordsCount = 0, estimatedPins = 0, env = null } = {}) {
  const raw = String(requestedMode || 'auto').trim().toLowerCase();
  const ghAuth = resolveGitHubAuth(env, { allowPat: true });
  const hasGitHubToken = Boolean(ghAuth?.token);

  if (raw === 'direct') {
    return { mode: 'direct', hasGitHubToken };
  }
  if (raw === 'fleet') {
    if (!hasGitHubToken) {
      return {
        mode: 'fleet',
        hasGitHubToken: false,
        error: 'GITHUB_TOKEN_MISSING',
        status: 400,
        message: 'Fleet execution mode requires GITHUB_TOKEN or GITHUB_PAT to be configured on the server.'
      };
    }
    return { mode: 'fleet', hasGitHubToken: true };
  }
  // Default 'auto': route to 20-Runner Fleet when GitHub token is configured AND multi-keyword (>3) or heavy (>3000 pins)
  if (hasGitHubToken && (keywordsCount > 3 || estimatedPins > 3000)) {
    return { mode: 'fleet', hasGitHubToken: true, autoRouted: true };
  }
  return { mode: 'direct', hasGitHubToken, autoRouted: true };
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
  reply,
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
  checkPinterestCircuitBreaker,
  tripPinterestCircuitBreaker,
  redactSecrets
}) {
  const checkDirectModeCircuitBreaker = async () => {
    if (typeof checkPinterestCircuitBreaker !== 'function') return null;
    const cb = await checkPinterestCircuitBreaker(env);
    if (!cb?.active) return null;
    if (reply && typeof reply.header === 'function') {
      reply.header('Retry-After', String(cb.remaining_seconds));
      reply.header('X-Circuit-Breaker', 'OPEN');
    }
    return jsonResponse({
      success: false,
      error: 'PINTEREST_RATE_LIMITED',
      message: `Pinterest rate-limit circuit breaker is active. Operations cooling down for ${cb.remaining_seconds}s.`,
      retry_after: cb.remaining_seconds,
      reason: cb.reason
    }, 429, -1);
  };
  // 1. /api/newborn/settings (GET, PUT, PATCH) — strictly no-store
  if (pathname === '/api/newborn/settings') {
    if (method === 'GET') {
      const [settings, cookieStatus, profiles] = await Promise.all([
        getNewbornSettings(sql, { workspaceId }),
        getNewbornCookieStatus(sql, env, { workspaceId }),
        sql ? listNewbornRuleProfiles(sql, { includeInactive: true, workspaceId }).catch(() => []) : Promise.resolve([])
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
        ? await updateNewbornSettings(sql, rawPayload, { workspaceId })
        : await patchNewbornSettings(sql, rawPayload, { workspaceId });
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
    const settings = await resetNewbornSettings(sql, { workspaceId });
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
      if (folderId !== null && String(folderId).trim() !== '') {
        await assertFolderInWorkspace(sql, folderId, workspaceId);
      }
      const profiles = await listNewbornRuleProfiles(sql, { includeInactive, folderId, workspaceId });
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
      if (body?.folder_id !== undefined && body?.folder_id !== null && String(body.folder_id).trim() !== '') {
        await assertFolderInWorkspace(sql, body.folder_id, workspaceId);
      }
      const profile = await createNewbornRuleProfile(sql, body, { workspaceId });
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
      const profile = await getNewbornRuleProfile(sql, idOrSlug, { workspaceId });
      if (!profile) {
        return jsonResponse({
          success: false,
          error: 'NOT_FOUND',
          message: `Rule profile "${idOrSlug}" not found.`
        }, 404, -1);
      }
      const { settings: effectiveSettings } = await resolveEffectiveNewbornSettings(sql, { profileId: profile.id, workspaceId });
      return jsonResponse({
        success: true,
        profile,
        effective_settings: effectiveSettings
      }, 200, -1);
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await request.json();
      if (body?.folder_id !== undefined && body?.folder_id !== null && String(body.folder_id).trim() !== '') {
        await assertFolderInWorkspace(sql, body.folder_id, workspaceId);
      }
      const updated = await updateNewbornRuleProfile(sql, idOrSlug, body || {}, { workspaceId });
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
      const delRes = await deleteNewbornRuleProfile(sql, idOrSlug, { workspaceId });
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

  // 3. /api/newborn/cookie (GET, POST, PUT, DELETE) — strictly redacted, workspace-isolated & no-store
  if (pathname === '/api/newborn/cookie') {
    const numericWid = Number(workspaceId) || DEFAULT_WORKSPACE_ID;
    const isDefaultWorkspace = numericWid === DEFAULT_WORKSPACE_ID;
    if (method === 'GET') {
      const status = await getNewbornCookieStatus(sql, env, { workspaceId: numericWid });
      return jsonResponse({
        success: true,
        workspace_id: numericWid,
        ...status
      }, 200, -1);
    }

    if (method === 'POST' || method === 'PUT') {
      try {
        const body = await request.json().catch(() => ({}));
        const rawCookie = typeof body?.cookie === 'string'
          ? body.cookie
          : (typeof body?.pinterest_cookie === 'string' ? body.pinterest_cookie : '');
        if (!isDefaultWorkspace) {
          const wsStatus = await saveWorkspaceCookie(sql, numericWid, rawCookie);
          if (typeof invalidateEdgeCache === 'function') {
            await invalidateEdgeCache(`ws:${numericWid}:`);
          }
          return jsonResponse({
            success: true,
            workspace_id: numericWid,
            has_cookie: Boolean(wsStatus.has_cookie),
            is_configured: Boolean(wsStatus.is_configured),
            preview: '[CONFIGURED]',
            zone_routing_mode: 'two_zone_auth_plus_zero_cookie'
          }, 200, -1);
        }
        if (rawCookie.trim().length > 10) {
          await saveWorkspaceCookie(sql, numericWid, rawCookie).catch(() => null);
        }
        const status = await saveNewbornCookie(sql, rawCookie, {
          alsoUpdateShared: Boolean(body?.also_update_shared)
        });
        if (typeof invalidateEdgeCache === 'function') {
          await invalidateEdgeCache(`ws:${numericWid}:`);
          await invalidateEdgeCache('newborn');
        }
        return jsonResponse({
          success: true,
          workspace_id: numericWid,
          ...status
        }, 200, -1);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 400, -1);
      }
    }

    if (method === 'DELETE') {
      if (!isDefaultWorkspace) {
        await clearWorkspaceCookie(sql, numericWid);
        if (typeof invalidateEdgeCache === 'function') {
          await invalidateEdgeCache(`ws:${numericWid}:`);
        }
        return jsonResponse({
          success: true,
          workspace_id: numericWid,
          has_cookie: false,
          is_configured: false,
          preview: '',
          zone_routing_mode: 'guest_zero_cookie_fallback'
        }, 200, -1);
      }
      await clearWorkspaceCookie(sql, numericWid).catch(() => null);
      const status = await clearNewbornCookie(sql);
      if (typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache(`ws:${numericWid}:`);
        await invalidateEdgeCache('newborn');
      }
      return jsonResponse({
        success: true,
        workspace_id: numericWid,
        ...status
      }, 200, -1);
    }

    return methodNotAllowedResponse('GET, POST, PUT, DELETE, OPTIONS');
  }

  // Fail-closed folder ownership guard on all GET /api/newborn/* routes when ?folder_id is supplied
  if (method === 'GET') {
    const rawQueryFolderId = searchParams.get('folder_id');
    if (rawQueryFolderId !== null && rawQueryFolderId !== '') {
      try {
        await assertFolderInWorkspace(sql, rawQueryFolderId, workspaceId);
      } catch (err) {
        return jsonResponse({
          success: false,
          error: err.status === 400 ? 'BAD_REQUEST' : 'NOT_FOUND',
          message: err.message
        }, err.status || 404, -1);
      }
    }
  }

  // 4. /api/newborn/overview (GET) — strictly no-store (live run counts + cookie status)
  if (pathname === '/api/newborn/overview' || pathname === '/api/newborn') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const folderId = searchParams.get('folder_id') || null;
    const payload = await getNewbornOverview(sql, env, { workspaceId, folderId });
    return jsonResponse(payload, 200, -1);
  }

  // 4B. /api/newborn/idea-intelligence (GET) — Official Idea Page URL, Search Volume & Growth %
  if (pathname === '/api/newborn/idea-intelligence') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const q = String(searchParams.get('q') || searchParams.get('term') || searchParams.get('keyword') || '').trim();
    const isOversizedOrInvalid = Boolean(
      q.length > 120 ||
      /https?:\/\//i.test(q) ||
      /[\r\n]/.test(q) ||
      q.split(/\s+/).filter(Boolean).length > 12
    );
    if (isOversizedOrInvalid) {
      return jsonResponse({
        success: true,
        ok: true,
        found: false,
        skipped_reason: 'query_too_long_or_not_keyword',
        term: q.slice(0, 120),
        idea_url: null,
        internal_search_count: 0,
        formatted_volume: '0',
        weekly_change: null,
        monthly_change: null,
        yearly_change: null,
        seo_breadcrumbs: [],
        related_interests: [],
        ideas_pivots: []
      }, 200, -1);
    }
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
      workspace_id: workspaceId,
      run_id: searchParams.get('run_id') || null,
      folder_id: searchParams.get('folder_id') || null,
      stage: searchParams.get('stage') || null,
      surface: searchParams.get('surface') || null,
      provenance: searchParams.get('provenance') || null,
      creation_method: searchParams.get('creation_method') || null,
      repin_filter: searchParams.get('repin_filter') || null,
      golden_only: searchParams.get('golden_only') || searchParams.get('golden') || null,
      rookie_only: searchParams.get('rookie_only') || searchParams.get('rookie') || null,
      link_filter: searchParams.get('link_filter') || null,
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
    const cacheKey = buildCanonicalCacheKey(`newborn:candidates:ws${workspaceId}`, searchParams);
    const bypassCache = Boolean(
      filters.run_id ||
      filters.folder_id ||
      filters.annotation ||
      (filters.link_filter && filters.link_filter !== 'all') ||
      filters.linkless_only
    );
    const data = bypassCache
      ? await listNewbornCandidates(sql, filters)
      : await getCachedOrFetch(cacheKey, () => listNewbornCandidates(sql, filters), 10_000);
    return jsonResponse({ success: true, ...data }, 200, bypassCache ? -1 : 10);
  }

  // 5B. /api/newborn/candidates/stage (POST bulk stage transition)
  if (pathname === '/api/newborn/candidates/stage') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json();
    const pinIds = body?.pin_ids || body?.pinIds || (body?.pin_id ? [body.pin_id] : []);
    const result = await updateNewbornCandidateStage(sql, pinIds, body?.stage, { workspaceId });
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
        workspaceId,
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
      const dossier = await getNewbornCandidateDossier(sql, pinId, { workspaceId });
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
      const result = await updateNewbornCandidateStage(sql, [pinId], body?.stage, { workspaceId });
      return jsonResponse({ success: true, ...result }, 200, -1);
    }

    if (method === 'DELETE') {
      const result = await deleteNewbornCandidate(sql, [pinId], { workspaceId });
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
      workspace_id: workspaceId,
      run_id: searchParams.get('run_id') || null,
      stage: searchParams.get('stage') || null,
      search: searchParams.get('search') || searchParams.get('q') || '',
      limit: clampLimit(searchParams.get('limit'), 50, 200),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
    };
    const cacheKey = buildCanonicalCacheKey(`newborn:rookies:ws${workspaceId}`, searchParams);
    const data = await getCachedOrFetch(cacheKey, () => listNewbornRookies(sql, filters), 10_000);
    return jsonResponse({ success: true, ...data }, 200, filters.run_id ? -1 : 10);
  }

  // 7. /api/newborn/crossover (GET)
  if (pathname === '/api/newborn/crossover') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const runId = searchParams.get('run_id') || null;
    const folderId = searchParams.get('folder_id') || null;
    const stage = searchParams.get('stage') || null;
    const goldenOnly = searchParams.get('golden_only') === 'true';
    const linkFilter = searchParams.get('link_filter') || null;
    const linklessOnly = searchParams.get('linkless_only') === 'true' || searchParams.get('linkless') === 'true';
    const surface = searchParams.get('surface') || null;
    const creationMethod = searchParams.get('creation_method') || null;
    const repinFilter = searchParams.get('repin_filter') || null;
    const search = searchParams.get('search') || searchParams.get('q') || null;
    const limit = clampLimit(searchParams.get('limit'), 30, 100);
    const reportOpts = {
      workspaceId,
      runId,
      folderId,
      stage,
      goldenOnly,
      linkFilter,
      linklessOnly,
      surface,
      creationMethod,
      repinFilter,
      search,
      limit
    };
    const cacheKey = buildCanonicalCacheKey(`newborn:crossover:ws${workspaceId}`, searchParams);
    const bypassCache = Boolean(
      runId ||
      folderId ||
      (linkFilter && linkFilter !== 'all') ||
      linklessOnly ||
      surface ||
      creationMethod ||
      repinFilter ||
      search
    );
    const report = bypassCache
      ? await getNewbornCrossoverReport(sql, reportOpts)
      : await getCachedOrFetch(
          cacheKey,
          () => getNewbornCrossoverReport(sql, reportOpts),
          15_000
        );
    return jsonResponse({ success: true, ...report }, 200, bypassCache ? -1 : 15);
  }

  // 8. /api/newborn/runs (GET list, DELETE bulk clear failed & empty) — strictly no-store
  if (pathname === '/api/newborn/runs') {
    if (method === 'GET') {
      const limit = clampLimit(searchParams.get('limit'), 30, 100);
      const folderId = searchParams.get('folder_id') || null;
      const runs = await listNewbornRuns(sql, { limit, folderId, workspaceId });
      return jsonResponse({ success: true, runs }, 200, -1);
    }
    if (method === 'DELETE') {
      const folderId = searchParams.get('folder_id') || null;
      const res = await clearFailedAndEmptyNewbornRuns(sql, { workspaceId, folderId });
      return jsonResponse({ success: true, ...res }, 200, -1);
    }
    return methodNotAllowedResponse('GET, DELETE, OPTIONS');
  }

  // 8A. /api/newborn/runs/clear-empty (POST bulk clear failed & empty Past Hunts)
  if (pathname === '/api/newborn/runs/clear-empty') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json().catch(() => ({}));
    const folderId = body?.folder_id ?? searchParams.get('folder_id') ?? null;
    const res = await clearFailedAndEmptyNewbornRuns(sql, { workspaceId, folderId });
    return jsonResponse({ success: true, ...res }, 200, -1);
  }

  // 8A2. /api/newborn/runs/bulk-delete (POST multi-select delete Past Hunts with strict workspace isolation)
  if (pathname === '/api/newborn/runs/bulk-delete') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json().catch(() => ({}));
    const rawIds = body?.run_ids ?? body?.runIds ?? [];
    const res = await deleteNewbornRunsBulk(sql, rawIds, { workspaceId });
    if (!res.ok) {
      return jsonResponse({
        success: false,
        error: res.error || 'BAD_REQUEST',
        message: res.message || 'Failed to bulk-delete selected Past Hunts.'
      }, res.status || 400, -1);
    }
    return jsonResponse({ success: true, ...res }, 200, -1);
  }

  // 8B0. /api/newborn/runs/:id/cancel (POST) — cooperative cancellation for Direct & Fleet runs
  const runCancelMatch = pathname.match(/^\/api\/newborn\/runs\/([^/]+)\/cancel$/);
  if (runCancelMatch) {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const rawRunId = decodeURIComponent(runCancelMatch[1]).trim();
    if (!/^\d+$/.test(rawRunId)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: `Invalid run ID "${rawRunId}". Expected a positive integer.`
      }, 400, -1);
    }
    const cancelRes = await cancelNewbornRun(sql, Number(rawRunId), { env, workspaceId });
    if (!cancelRes.ok) {
      return jsonResponse({
        success: false,
        error: cancelRes.error || 'NOT_FOUND',
        message: cancelRes.message || `Newborn run #${rawRunId} not found.`
      }, cancelRes.status || 404, -1);
    }
    return jsonResponse({ success: true, ...cancelRes }, 200, -1);
  }

  // 8B. /api/newborn/runs/:id (GET live progress polling, DELETE Past Hunt) — strictly no-store
  const runDetailMatch = pathname.match(/^\/api\/newborn\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    if (method !== 'GET' && method !== 'DELETE') {
      return methodNotAllowedResponse('GET, DELETE, OPTIONS');
    }
    const rawRunId = decodeURIComponent(runDetailMatch[1]).trim();
    if (!/^\d+$/.test(rawRunId)) {
      return jsonResponse({
        success: false,
        error: 'BAD_REQUEST',
        message: `Invalid run ID "${rawRunId}". Expected a positive integer.`
      }, 400, -1);
    }
    if (method === 'DELETE') {
      const delRes = await deleteNewbornRun(sql, Number(rawRunId), { workspaceId });
      if (!delRes.ok) {
        return jsonResponse({
          success: false,
          error: delRes.error || 'DELETE_FAILED',
          message: delRes.message || `Failed to delete Hunt #${rawRunId}.`
        }, delRes.status || 400, -1);
      }
      return jsonResponse({ success: true, ...delRes }, 200, -1);
    }
    const lite = searchParams.get('lite') === '1' || searchParams.get('lite') === 'true';
    const run = await getNewbornRunById(sql, Number(rawRunId), { lite, workspaceId });
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
    const folderId = searchParams.get('folder_id') || null;
    const limit = clampLimit(searchParams.get('limit'), 100, 500);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const anchors = await listNewbornDailyAnchors(sql, { workspaceId, activeOnly, folderId, limit, offset });
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
    const moments = searchParams.get('moments') || '';
    const age = searchParams.get('age') || '';
    const gender = searchParams.get('gender') || '';
    const includeTerms = searchParams.get('include_terms') || searchParams.get('includeTerms') || '';
    const excludeTerms = searchParams.get('exclude_terms') || searchParams.get('excludeTerms') || '';
    const limit = clampLimit(searchParams.get('limit'), 50, 100);
    const cacheKey = buildCanonicalCacheKey('newborn:launchpad', searchParams);
    const feed = await getCachedOrFetch(
      cacheKey,
      () => getNewbornLaunchpadFeed(sql, {
        country,
        trendType,
        l1Interest,
        moments,
        age,
        gender,
        includeTerms,
        excludeTerms,
        limit,
        workspaceId
      }),
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
        run_id: body?.run_id != null && body.run_id !== '' ? String(body.run_id) : '',
        cluster_id: body?.cluster_id != null && body.cluster_id !== '' ? String(body.cluster_id) : '',
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

  // 9D. Wave 6E Keyword Cluster Read Endpoints (`GET /api/newborn/clusters`, `GET /api/newborn/clusters/:id`)
  if (pathname === '/api/newborn/clusters') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const limit = clampLimit(searchParams.get('limit'), 20, 100);
    const folderId = searchParams.get('folder_id') || null;
    const clusters = await listNewbornKeywordClusters(sql, { limit, workspaceId, folderId });
    return jsonResponse({ success: true, clusters }, 200, -1);
  }

  const clusterByIdMatch = pathname.match(/^\/api\/newborn\/clusters\/(\d+)$/);
  if (clusterByIdMatch) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const cluster = await getNewbornKeywordClusterById(sql, Number(clusterByIdMatch[1]), { workspaceId });
    if (!cluster) {
      return jsonResponse({
        success: false,
        error: 'NOT_FOUND',
        message: `Keyword cluster #${clusterByIdMatch[1]} not found.`
      }, 404, -1);
    }
    return jsonResponse({ success: true, cluster }, 200, -1);
  }

  // 10. Live Harvesting, Cluster Explorer, Snowball, Watchlist Polling, Launchpad Refresh & Auto-Run Endpoints (POST)
  if (NEWBORN_CRAWLER_PATHS.has(pathname)) {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }

    const body = await request.json().catch(() => ({}));
    try {
      const folderScopedPaths = new Set([
        '/api/newborn/cluster/build',
        '/api/newborn/cluster/hunt',
        '/api/newborn/discover',
        '/api/newborn/snowball',
        '/api/newborn/watchlist/poll',
        '/api/newborn/auto-run'
      ]);
      const rawBodyFolderId = body?.folder_id != null && body.folder_id !== '' ? Number(body.folder_id) : null;
      if (folderScopedPaths.has(pathname) && rawBodyFolderId !== null && Number.isFinite(rawBodyFolderId) && rawBodyFolderId > 0) {
        await assertFolderInWorkspace(sql, rawBodyFolderId, workspaceId);
      }

      if (pathname === '/api/newborn/candidates/fetch-accounts') {
        const pinIds = body?.pin_ids || body?.pinIds || (body?.pin_id ? [body.pin_id] : []);
        const result = await fetchNewbornCandidateAccounts(sql, pinIds, {
          workspaceId,
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

      if (pathname === '/api/newborn/cluster/build') {
        const cbBlocked = await checkDirectModeCircuitBreaker();
        if (cbBlocked) return cbBlocked;

        const cluster = await buildNewbornKeywordCluster(sql, {
          workspaceId,
          folderId: body?.folder_id ?? null,
          seedKeyword: body?.seed_keyword ?? body?.keyword ?? body?.query,
          country: body?.country || 'US',
          l1Interest: body?.l1_interest ?? body?.interest ?? 'all',
          includeTerms: body?.include_terms ?? body?.includeTerms ?? [],
          excludeTerms: body?.exclude_terms ?? body?.excludeTerms ?? [],
          enrichLimit: body?.enrich_limit ?? body?.enrichLimit ?? 20,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env
        });
        return jsonResponse({ success: true, cluster }, 200, -1);
      }

      if (pathname === '/api/newborn/cluster/enrich') {
        const cbBlocked = await checkDirectModeCircuitBreaker();
        if (cbBlocked) return cbBlocked;

        const clusterId = Number(body?.cluster_id ?? body?.id);
        if (!Number.isFinite(clusterId) || clusterId <= 0) {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Provide a valid numeric "cluster_id" to enrich remaining volumes.'
          }, 400, -1);
        }
        const cluster = await enrichClusterRemainingVolumes(sql, clusterId, {
          workspaceId,
          batchLimit: body?.batch_limit ?? body?.limit ?? 40,
          retryKeywords: Array.isArray(body?.retry_keywords)
            ? body.retry_keywords
            : (Array.isArray(body?.retryKeywords) ? body.retryKeywords : null),
          retryErrorsOnly: Boolean(body?.retry_errors ?? body?.retryErrors),
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env
        });
        return jsonResponse({ success: true, cluster }, 200, -1);
      }

      if (pathname === '/api/newborn/cluster/hunt') {
        const clusterId = body?.cluster_id != null && Number(body.cluster_id) > 0 ? Number(body.cluster_id) : null;
        if (clusterId !== null && Number(workspaceId) !== DEFAULT_WORKSPACE_ID) {
          const clusterRow = await getNewbornKeywordClusterById(sql, clusterId, { workspaceId });
          if (!clusterRow) {
            return jsonResponse({
              success: false,
              error: 'NOT_FOUND',
              message: `Keyword cluster #${clusterId} not found in current workspace.`
            }, 404, -1);
          }
        }
        const rawSelected = Array.isArray(body?.keywords)
          ? body.keywords
          : (Array.isArray(body?.seed_queries) ? body.seed_queries : []);
        const dedupedKeywords = Array.from(new Set(
          rawSelected
            .map((k) => String(typeof k === 'string' ? k : (k?.keyword || k?.term || '')).trim().toLowerCase())
            .filter(Boolean)
        ));

        if (dedupedKeywords.length === 0) {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Select at least 1 keyword to launch a Cluster Newborn Hunt.'
          }, 400, -1);
        }

        const wsSettings = sql ? await getWorkspaceSettings(sql, workspaceId).catch(() => null) : null;
        const estimatedPins = computeEstimatedPinBudget(body, dedupedKeywords.length, wsSettings);
        const explicitRequestedMode = body?.execution_mode ?? body?.executionMode ?? null;
        const ghAuth = resolveGitHubAuth(env, { allowPat: true });
        const effectiveRequestedMode = explicitRequestedMode
          || (ghAuth?.token ? (wsSettings?.execution_mode || 'fleet') : 'auto');
        const modeDecision = resolveExecutionMode({
          requestedMode: effectiveRequestedMode,
          keywordsCount: dedupedKeywords.length,
          estimatedPins,
          env
        });

        if (modeDecision.error) {
          return jsonResponse({
            success: false,
            error: modeDecision.error,
            message: modeDecision.message
          }, modeDecision.status || 400, -1);
        }

        // Uncapped: send ALL selected keywords without silent 25 or 100 truncation!
        const selectedKeywords = dedupedKeywords;

        const baseOverrides = buildHuntOverridesFromBody(body, { isSnowball: false }) || {};
        const clusterOverrides = deepMergePlain(baseOverrides, {
          discovery: {
            max_queries_per_run: Math.max(selectedKeywords.length, 25)
          }
        });

        if (modeDecision.mode === 'fleet') {
          const requestedShards = body?.shards != null && Number(body.shards) > 0
            ? Math.min(20, Math.max(1, Number(body.shards)))
            : Math.min(20, Math.max(1, selectedKeywords.length));
          const fleetRes = await createFleetBackedNewbornRun(sql, {
            runType: 'discovery',
            seedQueries: selectedKeywords,
            selectedKeywords,
            profileId: body?.profile_id ?? body?.profile ?? null,
            folderId: body?.folder_id ?? null,
            workspaceId,
            clusterId,
            settingsOverrides: clusterOverrides,
            shards: requestedShards,
            env
          });
          if (!fleetRes.ok) {
            return jsonResponse({
              success: false,
              error: fleetRes.error || 'DISPATCH_FAILED',
              message: fleetRes.message || 'Failed to dispatch Fleet Cluster Hunt.'
            }, fleetRes.status || 502, -1);
          }
          return jsonResponse({
            success: true,
            cluster_id: clusterId,
            selected_keywords_count: selectedKeywords.length,
            estimated_pins: estimatedPins,
            ...fleetRes
          }, 202, -1);
        }

        const cbBlocked = await checkDirectModeCircuitBreaker();
        if (cbBlocked) return cbBlocked;

        const queued = await enqueueNewbornRun(sql, {
          runType: 'discovery',
          seedQueries: selectedKeywords,
          profileId: body?.profile_id ?? body?.profile ?? null,
          folderId: body?.folder_id ?? null,
          workspaceId,
          clusterId,
          settingsOverrides: clusterOverrides,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({
          success: true,
          cluster_id: clusterId,
          selected_keywords_count: selectedKeywords.length,
          estimated_pins: estimatedPins,
          ...queued
        }, 202, -1);
      }

      if (pathname === '/api/newborn/launchpad') {
        const result = await refreshNewbornLaunchpadFeed(sql, {
          country: body?.country || null,
          trendType: body?.trend_type || body?.type || 'growing',
          l1Interest: body?.l1_interest || body?.interest || 'all',
          moments: body?.moments || '',
          age: body?.age || '',
          gender: body?.gender || '',
          includeTerms: body?.include_terms ?? body?.includeTerms ?? '',
          excludeTerms: body?.exclude_terms ?? body?.excludeTerms ?? '',
          limit: Math.max(5, Math.min(100, Number(body?.limit) || 50)),
          workspaceId,
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
        const wsSettings = sql ? await getWorkspaceSettings(sql, workspaceId).catch(() => null) : null;
        const estimatedPins = computeEstimatedPinBudget(body, Math.max(1, parsedQueries.length), wsSettings);
        const explicitRequestedMode = body?.execution_mode ?? body?.executionMode ?? null;
        const ghAuth = resolveGitHubAuth(env, { allowPat: true });
        const effectiveRequestedMode = explicitRequestedMode
          || (ghAuth?.token ? (wsSettings?.execution_mode || 'fleet') : 'auto');
        const modeDecision = resolveExecutionMode({
          requestedMode: effectiveRequestedMode,
          keywordsCount: parsedQueries.length,
          estimatedPins,
          env
        });

        if (modeDecision.error) {
          return jsonResponse({
            success: false,
            error: modeDecision.error,
            message: modeDecision.message
          }, modeDecision.status || 400, -1);
        }

        const dedupedDiscoverQueries = Array.from(new Set(parsedQueries));
        if (modeDecision.mode === 'fleet') {
          const selectedKeywords = dedupedDiscoverQueries;
          const seedCount = Math.max(1, selectedKeywords.length || parsedBoards.length || 1);
          const requestedShards = body?.shards != null && Number(body.shards) > 0
            ? Math.min(20, Math.max(1, Number(body.shards)))
            : Math.min(20, Math.max(1, seedCount));
          const fleetOverrides = selectedKeywords.length > 25
            ? deepMergePlain(mergedOverrides || {}, { discovery: { max_queries_per_run: selectedKeywords.length } })
            : mergedOverrides;
          const fleetRes = await createFleetBackedNewbornRun(sql, {
            runType: 'discovery',
            seedQueries: selectedKeywords,
            seedBoards: parsedBoards,
            seedPinIds: parsedPinIds,
            selectedKeywords,
            profileId: body?.profile_id ?? body?.profile ?? null,
            folderId: body?.folder_id ?? null,
            workspaceId,
            settingsOverrides: fleetOverrides,
            shards: requestedShards,
            env
          });
          if (!fleetRes.ok) {
            return jsonResponse({
              success: false,
              error: fleetRes.error || 'DISPATCH_FAILED',
              message: fleetRes.message || 'Failed to dispatch Fleet Discovery Hunt.'
            }, fleetRes.status || 502, -1);
          }
          return jsonResponse({ success: true, estimated_pins: estimatedPins, ...fleetRes }, 202, -1);
        }

        const cbBlocked = await checkDirectModeCircuitBreaker();
        if (cbBlocked) return cbBlocked;

        const directOverrides = dedupedDiscoverQueries.length > 25
          ? deepMergePlain(mergedOverrides || {}, { discovery: { max_queries_per_run: dedupedDiscoverQueries.length } })
          : mergedOverrides;

        const queued = await enqueueNewbornRun(sql, {
          runType: 'discovery',
          seedQueries: dedupedDiscoverQueries,
          seedPinIds: parsedPinIds,
          seedBoards: parsedBoards,
          profileId: body?.profile_id ?? body?.profile ?? null,
          folderId: body?.folder_id ?? null,
          workspaceId,
          settingsOverrides: directOverrides,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, estimated_pins: estimatedPins, ...queued }, 202, -1);
      }

      if (pathname === '/api/newborn/snowball') {
        const rawPinIds = body?.seed_pin_ids || body?.pin_ids || (body?.pin_id ? [body.pin_id] : []);
        const seedPinIds = Array.from(new Set(
          (Array.isArray(rawPinIds) ? rawPinIds : [rawPinIds])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        ));
        const mergedOverrides = buildHuntOverridesFromBody(body, { isSnowball: true });
        const wsSettings = sql ? await getWorkspaceSettings(sql, workspaceId).catch(() => null) : null;
        const targetPerSeed = Math.max(10, Math.min(2000, Number(body?.target_pins ?? body?.paths?.related?.target_pins ?? 200) || 200));
        const estimatedPins = Math.max(1, seedPinIds.length || 1) * targetPerSeed;
        const explicitRequestedMode = body?.execution_mode ?? body?.executionMode ?? null;
        const ghAuth = resolveGitHubAuth(env, { allowPat: true });
        const effectiveRequestedMode = explicitRequestedMode
          || (ghAuth?.token ? (wsSettings?.execution_mode || 'fleet') : 'auto');
        const modeDecision = resolveExecutionMode({
          requestedMode: effectiveRequestedMode,
          keywordsCount: seedPinIds.length,
          estimatedPins,
          env
        });

        if (modeDecision.error) {
          return jsonResponse({
            success: false,
            error: modeDecision.error,
            message: modeDecision.message
          }, modeDecision.status || 400, -1);
        }

        if (modeDecision.mode === 'fleet') {
          const requestedShards = body?.shards != null && Number(body.shards) > 0
            ? Math.min(20, Math.max(1, Number(body.shards)))
            : Math.min(20, Math.max(1, seedPinIds.length || 1));
          const fleetRes = await createFleetBackedNewbornRun(sql, {
            runType: 'snowball',
            seedPinIds,
            profileId: body?.profile_id ?? body?.profile ?? null,
            folderId: body?.folder_id ?? null,
            workspaceId,
            settingsOverrides: mergedOverrides,
            shards: requestedShards,
            env
          });
          if (!fleetRes.ok) {
            return jsonResponse({
              success: false,
              error: fleetRes.error || 'DISPATCH_FAILED',
              message: fleetRes.message || 'Failed to dispatch Fleet Related Pins Snowball.'
            }, fleetRes.status || 502, -1);
          }
          return jsonResponse({ success: true, estimated_pins: estimatedPins, ...fleetRes }, 202, -1);
        }

        const cbBlocked = await checkDirectModeCircuitBreaker();
        if (cbBlocked) return cbBlocked;

        const queued = await enqueueNewbornRun(sql, {
          runType: 'snowball',
          seedPinIds,
          profileId: body?.profile_id ?? body?.profile ?? null,
          folderId: body?.folder_id ?? null,
          workspaceId,
          settingsOverrides: mergedOverrides,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, estimated_pins: estimatedPins, ...queued }, 202, -1);
      }

      if (pathname === '/api/newborn/watchlist/poll') {
        const queued = await enqueueNewbornRun(sql, {
          runType: 'watchlist_poll',
          profileId: body?.profile_id ?? null,
          folderId: body?.folder_id ?? null,
          workspaceId,
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
          workspaceId,
          routerOptions: { env, ...(typeof env?.NEWBORN_FETCH_IMPL === 'function' ? { fetchImpl: env.NEWBORN_FETCH_IMPL } : {}) },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...queued }, 202, -1);
      }
    } catch (err) {
      if (err?.status >= 400 && err?.status < 500) {
        const msg = err.message || 'Request error.';
        return jsonResponse({
          success: false,
          error: err.code || (err.status === 404 ? 'NOT_FOUND' : 'REQUEST_ERROR'),
          message: typeof redactSecrets === 'function' ? redactSecrets(msg) : String(msg)
        }, err.status, -1);
      }
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

    const targetFolderCandidates = [
      body?.folder_id,
      body?.promote_to_campaign_folder_id,
      body?.destinations?.promote_to_campaign_folder_id,
      body?.destinations?.folder_id
    ].filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    for (const candidateFolderId of targetFolderCandidates) {
      try {
        await assertFolderInWorkspace(sql, candidateFolderId, workspaceId);
      } catch (err) {
        return jsonResponse({
          success: false,
          error: err.status === 400 ? 'BAD_REQUEST' : 'NOT_FOUND',
          message: err.message
        }, err.status || 404, -1);
      }
    }

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
          workspaceId,
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
