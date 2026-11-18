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
  listNewbornDailyAnchors,
  getNewbornCrossoverReport,
  getNewbornLaunchpadFeed,
  refreshNewbornLaunchpadFeed,
  runNewbornDiscovery,
  runNewbornSnowball,
  pollNewbornWatchlist,
  runNewbornAutoCycle,
  promoteNewbornCandidates,
  promoteNewbornRookies
} from '../modules/newborn/service.mjs';

export const NEWBORN_CRAWLER_PATHS = new Set([
  '/api/newborn/discover',
  '/api/newborn/snowball',
  '/api/newborn/watchlist/poll',
  '/api/newborn/auto-run',
  '/api/newborn/launchpad'
]);

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

  // 4. /api/newborn/overview (GET)
  if (pathname === '/api/newborn/overview' || pathname === '/api/newborn') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const cacheKey = buildCanonicalCacheKey('newborn:overview', searchParams);
    const payload = await getCachedOrFetch(cacheKey, () => getNewbornOverview(sql, env), 10);
    return jsonResponse(payload, 200, 10);
  }

  // 5. /api/newborn/candidates (GET)
  if (pathname === '/api/newborn/candidates') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const filters = {
      stage: searchParams.get('stage') || null,
      surface: searchParams.get('surface') || null,
      provenance: searchParams.get('provenance') || null,
      golden_only: searchParams.get('golden_only') || searchParams.get('golden') || null,
      rookie_only: searchParams.get('rookie_only') || searchParams.get('rookie') || null,
      linkless_only: searchParams.get('linkless_only') || searchParams.get('linkless') || null,
      min_golden_score: searchParams.get('min_golden_score') || null,
      max_age_days: searchParams.get('max_age_days') || null,
      search: searchParams.get('search') || searchParams.get('q') || '',
      sort: searchParams.get('sort') || 'golden_score',
      limit: clampLimit(searchParams.get('limit'), 50, 500),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
    };
    const cacheKey = buildCanonicalCacheKey('newborn:candidates', searchParams);
    const data = await getCachedOrFetch(cacheKey, () => listNewbornCandidates(sql, filters), 10);
    return jsonResponse({ success: true, ...data }, 200, 10);
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
      stage: searchParams.get('stage') || null,
      search: searchParams.get('search') || searchParams.get('q') || '',
      limit: clampLimit(searchParams.get('limit'), 50, 200),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
    };
    const cacheKey = buildCanonicalCacheKey('newborn:rookies', searchParams);
    const data = await getCachedOrFetch(cacheKey, () => listNewbornRookies(sql, filters), 10);
    return jsonResponse({ success: true, ...data }, 200, 10);
  }

  // 7. /api/newborn/crossover (GET)
  if (pathname === '/api/newborn/crossover') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const stage = searchParams.get('stage') || null;
    const goldenOnly = searchParams.get('golden_only') === 'true';
    const limit = clampLimit(searchParams.get('limit'), 30, 100);
    const cacheKey = buildCanonicalCacheKey('newborn:crossover', searchParams);
    const report = await getCachedOrFetch(
      cacheKey,
      () => getNewbornCrossoverReport(sql, { stage, goldenOnly, limit }),
      15
    );
    return jsonResponse({ success: true, ...report }, 200, 15);
  }

  // 8. /api/newborn/runs (GET)
  if (pathname === '/api/newborn/runs') {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const limit = clampLimit(searchParams.get('limit'), 30, 100);
    const runs = await listNewbornRuns(sql, { limit });
    return jsonResponse({ success: true, runs }, 200, -1);
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
      15
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
      if (pathname === '/api/newborn/launchpad') {
        const result = await refreshNewbornLaunchpadFeed(sql, {
          country: body?.country || null,
          trendType: body?.trend_type || body?.type || 'growing',
          l1Interest: body?.l1_interest || body?.interest || 'all',
          limit: body?.limit || 25,
          routerOptions: { env },
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

        const result = await runNewbornDiscovery(sql, {
          seedQueries: parsedQueries,
          seedPinIds: parsedPinIds,
          seedBoards: parsedBoards,
          profileId: body?.profile_id ?? body?.profile ?? null,
          settingsOverrides: body?.settings_overrides ?? body?.overrides ?? null,
          routerOptions: { env },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...result }, 200, -1);
      }

      if (pathname === '/api/newborn/snowball') {
        const seedPinIds = body?.seed_pin_ids || body?.pin_ids || (body?.pin_id ? [body.pin_id] : []);
        const result = await runNewbornSnowball(sql, {
          seedPinIds,
          profileId: body?.profile_id ?? body?.profile ?? null,
          settingsOverrides: body?.settings_overrides ?? body?.overrides ?? null,
          routerOptions: { env },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...result }, 200, -1);
      }

      if (pathname === '/api/newborn/watchlist/poll') {
        const result = await pollNewbornWatchlist(sql, {
          profileId: body?.profile_id ?? null,
          workerIndex: body?.worker_index ?? 0,
          workerTotal: body?.worker_total ?? 1,
          autoPromote: body?.auto_promote ?? null,
          routerOptions: { env },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...result }, 200, -1);
      }

      if (pathname === '/api/newborn/auto-run') {
        const result = await runNewbornAutoCycle(sql, {
          force: Boolean(body?.force),
          forceDiscovery: Boolean(body?.force_discovery),
          forceWatchlist: Boolean(body?.force_watchlist),
          seedQueries: body?.seed_queries || [],
          profileId: body?.profile_id ?? null,
          routerOptions: { env },
          env,
          ctx
        });
        return jsonResponse({ success: true, ...result }, 200, -1);
      }
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

    const [pinsResult, rookiesResult] = await Promise.all([
      Array.isArray(pinIds) && pinIds.length > 0
        ? promoteNewbornCandidates(sql, {
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
        : Promise.resolve(null),
      Array.isArray(usernames) && usernames.length > 0
        ? promoteNewbornRookies(sql, {
            usernames,
            trackingMode: body?.tracking_mode || 'pulse_only',
            folderId: body?.folder_id ?? null,
            source: body?.source || 'manual',
            env,
            ctx
          })
        : Promise.resolve(null)
    ]);

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
