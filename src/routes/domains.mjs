/**
 * Domain Intelligence & SERP Monopoly Sub-Router
 *
 * Handles domain leaderboard, deep dossiers, arbitrage blueprints,
 * WHOIS domain age caching, and ads.txt monetization discovery.
 */

import { normalizeCleanDomain } from '../modules/domains/domain-constants.mjs';
import {
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch
} from '../modules/domains/ad-network-service.mjs';
import {
  fetchAndCacheDomainAge,
  enrichMissingDomainsBatch,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch
} from '../modules/domains/whois-age-service.mjs';
import {
  listDomainsIntelligenceFast,
  syncSingleDomainRollup,
  refreshDomainIntelligenceRollup
} from '../modules/domains/rollup-leaderboard-service.mjs';
import {
  getDomainDeepDossier,
  generateDomainArbitrageBlueprint
} from '../modules/domains/dossier-blueprint-service.mjs';
import { verifyApiAuthentication } from '../http/security-and-response.mjs';
import { assertFolderInWorkspace } from '../modules/workspaces/service.mjs';

function isOrganicVaultName(rawValue) {
  const s = String(rawValue || '').trim().toLowerCase();
  return s === 'uploaded by user' || s === 'uploaded-by-user' || s === 'organic';
}

function normalizeDomainKey(rawValue) {
  return String(rawValue || '').trim().toLowerCase().replace(/^www\./, '');
}

function getErrorStatus(err, fallback = 500) {
  const status = Number(err?.status);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : fallback;
}

function requireApiAuth(request, env, jsonResponse) {
  const auth = verifyApiAuthentication(request, env);
  if (!auth?.authorized) {
    return jsonResponse(
      auth?.payload || {
        success: false,
        error: auth?.status === 503 ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
        message: auth?.reason || 'Authentication required'
      },
      auth?.status || 401
    );
  }
  return null;
}

async function validateFolderScope(sql, rawFolderId, numericWid) {
  if (rawFolderId === null || rawFolderId === undefined) return null;
  const trimmed = String(rawFolderId).trim();
  if (!trimmed) return null;
  const fid = Number(trimmed);
  if (!Number.isInteger(fid) || fid <= 0) {
    const err = new Error('Valid numeric folder_id is required.');
    err.status = 400;
    throw err;
  }
  await assertFolderInWorkspace(sql, fid, numericWid);
  return fid;
}

function isMissingRelationError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || /relation\s+"?[^"]+"?\s+does\s+not\s+exist/i.test(msg);
}

async function queryAllowedDomainSet(sql, numericWid) {
  const runSafe = async (label, promise) => {
    try {
      return await promise;
    } catch (err) {
      if (isMissingRelationError(err)) {
        return [];
      }
      console.warn(`[domains-route] ${label} query error:`, err?.message || err);
      throw err;
    }
  };

  const [watchRows, pinnedRows, trackedRows] = await Promise.all([
    runSafe('workspace_watchlist', sql`
      SELECT LOWER(TRIM(entity_key)) AS dom
      FROM workspace_watchlist
      WHERE workspace_id = ${numericWid}
        AND entity_type = 'domain'
        AND entity_key IS NOT NULL;
    `),
    runSafe('folder_pinned_domains', sql`
      SELECT DISTINCT LOWER(TRIM(fpd.domain)) AS dom
      FROM folder_pinned_domains fpd
      JOIN keyword_folders kf ON kf.id = fpd.folder_id
      WHERE kf.workspace_id = ${numericWid}
        AND fpd.domain IS NOT NULL;
    `),
    runSafe('campaign_tracked_pins', sql`
      SELECT DISTINCT LOWER(TRIM(COALESCE(ump.clean_domain, ''))) AS dom
      FROM campaign_tracked_pins ctp
      JOIN universal_master_pins ump ON ump.pin_id = ctp.pin_id
      WHERE ctp.workspace_id = ${numericWid}
        AND ump.clean_domain IS NOT NULL
        AND ump.clean_domain <> '';
    `)
  ]);

  const allowed = new Set();
  for (const list of [watchRows, pinnedRows, trackedRows]) {
    for (const r of (list || [])) {
      const d = normalizeDomainKey(r?.dom);
      if (d) allowed.add(d);
    }
  }
  return allowed;
}

async function queryPinnedDomainSet(sql, numericWid, validatedFolderId) {
  try {
    const rows = validatedFolderId
      ? await sql`
          SELECT DISTINCT LOWER(TRIM(fpd.domain)) AS dom
          FROM folder_pinned_domains fpd
          WHERE fpd.folder_id = ${validatedFolderId}
            AND fpd.domain IS NOT NULL;
        `
      : await sql`
          SELECT DISTINCT LOWER(TRIM(fpd.domain)) AS dom
          FROM folder_pinned_domains fpd
          JOIN keyword_folders kf ON kf.id = fpd.folder_id
          WHERE kf.workspace_id = ${numericWid}
            AND fpd.domain IS NOT NULL;
        `;
    const pinned = new Set();
    for (const r of (rows || [])) {
      const d = normalizeDomainKey(r?.dom);
      if (d) pinned.add(d);
    }
    return pinned;
  } catch (err) {
    if (isMissingRelationError(err)) {
      return new Set();
    }
    console.warn('[domains-route] queryPinnedDomainSet error:', err?.message || err);
    throw err;
  }
}

function recomputeOverviewFromDomains(domains) {
  const list = Array.isArray(domains) ? domains : [];
  if (list.length === 0) {
    return {
      total_domains: 0,
      top5_monopoly_pct: 0,
      baby_giants_count: 0,
      multi_account_count: 0,
      avg_pins_per_url: 1.0
    };
  }

  const globalTop10Raw = list.reduce((acc, d) => acc + Number(d?.top10_pins || 0), 0);
  let top5MonopolyPct = 0;
  if (globalTop10Raw > 0) {
    const sortedByVis = [...list].sort(
      (a, b) =>
        (Number(b?.visibility_score || 0) - Number(a?.visibility_score || 0)) ||
        (Number(b?.total_saves || 0) - Number(a?.total_saves || 0))
    );
    const top5Share = sortedByVis.slice(0, 5).reduce((acc, d) => acc + Number(d?.top10_pins || 0), 0);
    top5MonopolyPct = Number(Math.min(100, Math.max(0, (top5Share / globalTop10Raw) * 100)).toFixed(1));
  }

  let babyGiants = 0;
  let multiAccount = 0;
  let sumMultiplier = 0;
  for (const d of list) {
    const ageYears = d?.age_years != null ? Number(d.age_years) : null;
    if (ageYears !== null && Number.isFinite(ageYears) && ageYears <= 2.0 && (Number(d?.top10_pins || 0) >= 1 || Number(d?.total_saves || 0) >= 1000)) {
      babyGiants++;
    }
    if (Number(d?.accounts_count || 0) >= 2) {
      multiAccount++;
    }
    sumMultiplier += Number(d?.pins_per_url || 1.0);
  }

  return {
    total_domains: list.length,
    top5_monopoly_pct: top5MonopolyPct,
    baby_giants_count: babyGiants,
    multi_account_count: multiAccount,
    avg_pins_per_url: Number((sumMultiplier / list.length).toFixed(2))
  };
}

function buildEmptyDomainsResponse({ page, limit, workspaceId, workspaceScoped, pinnedScoped = false }) {
  return {
    overview: {
      total_domains: 0,
      top5_monopoly_pct: 0,
      baby_giants_count: 0,
      multi_account_count: 0,
      avg_pins_per_url: 1.0
    },
    domains: [],
    missing_age_domains: [],
    missing_ad_domains: [],
    page,
    limit,
    total: 0,
    total_domains: 0,
    total_pages: 1,
    workspace_id: workspaceId,
    workspace_scoped: Boolean(workspaceScoped),
    pinned_scoped: Boolean(pinnedScoped)
  };
}

function extractMissingEnrichmentDomains(domains) {
  const list = Array.isArray(domains) ? domains : [];
  return {
    missing_age_domains: list
      .filter((r) => (!r?.age_status || r.age_status === 'unchecked') && r?.domain && !isOrganicVaultName(r.domain))
      .map((r) => r.domain)
      .slice(0, 8),
    missing_ad_domains: list
      .filter((r) => (!r?.ad_network || r.ad_network === 'unchecked') && r?.domain && !isOrganicVaultName(r.domain))
      .map((r) => r.domain)
      .slice(0, 10)
  };
}

/**
 * Handles incoming /api/domains/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handleDomainsRoutes(routeCtx) {
  const {
    env,
    pathname,
    method,
    request,
    searchParams,
    sql,
    ctx,
    workspaceId = 1,
    jsonResponse,
    methodNotAllowedResponse,
    clampLimit,
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil,
    redactSecrets
  } = routeCtx;

  const respond405 = (allowed = 'GET, OPTIONS') => {
    if (typeof methodNotAllowedResponse === 'function') {
      return methodNotAllowedResponse(allowed);
    }
    return jsonResponse({ success: false, error: 'METHOD_NOT_ALLOWED', allowed }, 405);
  };

  // 1a. Dedicated Rollup Refresh & Edge Cache Invalidation Endpoint (POST with verifyApiAuthentication)
  if (pathname === '/api/domains/refresh-rollup' || pathname === '/api/domains/refresh') {
    if (method !== 'POST') {
      return respond405('POST, OPTIONS');
    }
    const authErr = requireApiAuth(request, env, jsonResponse);
    if (authErr) return authErr;
    try {
      const refreshResult = await refreshDomainIntelligenceRollup(sql);
      if (refreshResult?.success === false) {
        return jsonResponse({
          success: false,
          refreshed: false,
          error: redactSecrets(refreshResult.error || 'Rollup refresh failed')
        }, 500, 0);
      }
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
      }
      return jsonResponse({ success: true, refreshed: true, ...refreshResult }, 200, 0);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 1. Domains Leaderboard Fast Listing
  if (pathname === '/api/domains') {
    if (method !== 'GET') {
      return respond405('GET, OPTIONS');
    }
    try {
      const canMutateInBackground = Boolean(verifyApiAuthentication(request, env)?.authorized);
      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      const numericWid = Number(workspaceId) || 1;
      const validatedFolderId = await validateFolderScope(sql, searchParams.get('folder_id'), numericWid);

      if (isForceRefresh && canMutateInBackground && typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
      }

      const explicitWsScope = searchParams.get('workspace_scope') === '1' || searchParams.get('workspace_scope') === 'true';
      const enforceWorkspaceScope = numericWid !== 1 || explicitWsScope;
      const pinnedOnly = searchParams.get('pinned_only') === 'true' || searchParams.get('pinned_only') === '1';

      const cacheParams = {
        workspaceId: numericWid,
        workspaceScope: enforceWorkspaceScope ? 1 : 0,
        pinnedOnly: pinnedOnly ? 1 : 0,
        search: searchParams.get('search') || '',
        folderId: validatedFolderId ? String(validatedFolderId) : '',
        keywordId: searchParams.get('keyword_id') || '',
        pillar: searchParams.get('pillar') || 'all',
        preset: searchParams.get('preset') || 'all',
        adNetwork: searchParams.get('ad_network') || 'all',
        ageFilter: searchParams.get('age_filter') || 'all',
        rankFilter: searchParams.get('rank_filter') || 'all',
        savesFilter: searchParams.get('saves_filter') || 'all',
        sizeFilter: searchParams.get('size_filter') || 'all',
        logicMode: searchParams.get('logic_mode') || 'and',
        minPins: Number(searchParams.get('min_pins') || 1),
        sortBy: searchParams.get('sort') || 'visibility',
        page: Math.max(1, Number(searchParams.get('page') || 1)),
        limit: clampLimit(searchParams.get('limit'), 50, 200)
      };
      const queryParams = { ...cacheParams, allowBackgroundRefresh: canMutateInBackground, ctx };
      const cacheKey = buildCanonicalCacheKey('domains:leaderboard', cacheParams);
      const SIX_HOURS_MS = 21600000;
      const ONE_HOUR_MS = 3600000;

      const fetchDomains = async () => {
        const pageNum = Math.max(1, Number(cacheParams.page) || 1);
        const pageLim = Math.max(1, Number(cacheParams.limit) || 50);

        const pinnedDomainSet = pinnedOnly
          ? await queryPinnedDomainSet(sql, numericWid, validatedFolderId)
          : null;

        if (pinnedOnly && (!pinnedDomainSet || pinnedDomainSet.size === 0)) {
          return buildEmptyDomainsResponse({
            page: pageNum,
            limit: pageLim,
            workspaceId: numericWid,
            workspaceScoped: enforceWorkspaceScope,
            pinnedScoped: true
          });
        }

        // Case A: Non-default workspace (id !== 1) without explicit folder scope -> strict workspace target isolation
        if (numericWid !== 1 && !validatedFolderId) {
          let allowedDomains = await queryAllowedDomainSet(sql, numericWid);
          if (pinnedDomainSet) {
            allowedDomains = new Set([...allowedDomains].filter((d) => pinnedDomainSet.has(d)));
          }
          if (allowedDomains.size === 0) {
            return buildEmptyDomainsResponse({
              page: pageNum,
              limit: pageLim,
              workspaceId: numericWid,
              workspaceScoped: true,
              pinnedScoped: pinnedOnly
            });
          }

          const allowedList = Array.from(allowedDomains);
          const raw = await listDomainsIntelligenceFast(sql, {
            ...queryParams,
            allowedDomains: allowedList,
            page: 1,
            limit: Math.max(pageLim, allowedList.length, 500)
          });

          const baseDomains = Array.isArray(raw?.domains) ? raw.domains : [];
          const scopedDomains = baseDomains.filter((d) => {
            const norm = normalizeDomainKey(d?.domain || d?.clean_domain);
            return norm && allowedDomains.has(norm);
          });

          const startIdx = (pageNum - 1) * pageLim;
          const pagedDomains = scopedDomains.slice(startIdx, startIdx + pageLim);
          const missingEnrich = extractMissingEnrichmentDomains(pagedDomains);

          return {
            ...raw,
            overview: recomputeOverviewFromDomains(scopedDomains),
            domains: pagedDomains,
            ...missingEnrich,
            page: pageNum,
            limit: pageLim,
            total: scopedDomains.length,
            total_domains: scopedDomains.length,
            total_pages: Math.max(1, Math.ceil(scopedDomains.length / pageLim)),
            workspace_id: numericWid,
            workspace_scoped: true,
            pinned_scoped: pinnedOnly
          };
        }

        // Case B: pinned_only filter on Workspace 1 or a verified folder scope
        if (pinnedOnly && pinnedDomainSet) {
          const pinnedList = Array.from(pinnedDomainSet);
          const raw = await listDomainsIntelligenceFast(sql, {
            ...queryParams,
            allowedDomains: pinnedList,
            page: 1,
            limit: Math.max(pageLim, pinnedList.length, 500)
          });

          const baseDomains = Array.isArray(raw?.domains) ? raw.domains : [];
          const scopedDomains = baseDomains.filter((d) => {
            const norm = normalizeDomainKey(d?.domain || d?.clean_domain);
            return norm && pinnedDomainSet.has(norm);
          });

          const startIdx = (pageNum - 1) * pageLim;
          const pagedDomains = scopedDomains.slice(startIdx, startIdx + pageLim);
          const missingEnrich = extractMissingEnrichmentDomains(pagedDomains);

          return {
            ...raw,
            overview: recomputeOverviewFromDomains(scopedDomains),
            domains: pagedDomains,
            ...missingEnrich,
            page: pageNum,
            limit: pageLim,
            total: scopedDomains.length,
            total_domains: scopedDomains.length,
            total_pages: Math.max(1, Math.ceil(scopedDomains.length / pageLim)),
            workspace_id: numericWid,
            workspace_scoped: enforceWorkspaceScope,
            pinned_scoped: true
          };
        }

        // Case C: Default Workspace 1 or verified folder scope without pinned_only
        const raw = await listDomainsIntelligenceFast(sql, queryParams);
        return {
          ...raw,
          workspace_id: numericWid,
          workspace_scoped: enforceWorkspaceScope
        };
      };

      const data = isForceRefresh
        ? await fetchDomains()
        : await getCachedOrFetch(cacheKey, fetchDomains, SIX_HOURS_MS, ONE_HOUR_MS, { forceRefresh: isForceRefresh });

      // Gate background external WHOIS/RDAP & ads.txt scraping + DB mutations strictly behind verified API auth
      if (canMutateInBackground) {
        if (Array.isArray(data?.missing_age_domains) && data.missing_age_domains.length > 0) {
          safeWaitUntil(
            ctx,
            () => enrichMissingDomainsBatch(sql, data.missing_age_domains, 4),
            'bg_enrich_domain_ages'
          );
        }

        if (Array.isArray(data?.missing_ad_domains) && data.missing_ad_domains.length > 0) {
          safeWaitUntil(
            ctx,
            () => enrichMissingAdNetworksBatch(sql, data.missing_ad_domains, 4),
            'bg_enrich_domain_ads'
          );
        }
      }

      return jsonResponse({ success: true, ...data }, 200, 15);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 2. Domain Deep Dossier
  if (pathname === '/api/domains/dossier') {
    if (method !== 'GET') {
      return respond405('GET, OPTIONS');
    }
    const domain = searchParams.get('domain');
    if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
    try {
      const canMutateInBackground = Boolean(verifyApiAuthentication(request, env)?.authorized);
      const numericWid = Number(workspaceId) || 1;
      const rawDomain = domain.trim();
      const isOrganicVault = isOrganicVaultName(rawDomain);
      const cleanDomain = isOrganicVault ? 'Uploaded by user' : normalizeCleanDomain(rawDomain);
      if (!cleanDomain || (!isOrganicVault && !cleanDomain.includes('.'))) {
        return jsonResponse({ error: 'Valid domain is required' }, 400);
      }

      const validatedFolderId = await validateFolderScope(sql, searchParams.get('folder_id'), numericWid);
      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      const folderId = validatedFolderId ? String(validatedFolderId) : null;
      const keywordId = searchParams.get('keyword_id') || null;
      const rawDisplacedLimit = Number(searchParams.get('displaced_limit'));
      const displacedLimit = Math.min(500, Math.max(30, Number.isFinite(rawDisplacedLimit) && rawDisplacedLimit > 0 ? rawDisplacedLimit : 30));

      const cacheKey = buildCanonicalCacheKey('domains:dossier', {
        workspaceId: numericWid,
        domain: cleanDomain,
        folderId,
        keywordId,
        displacedLimit
      });

      if (isForceRefresh && canMutateInBackground && typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
      }

      const fetchDossier = async () => {
        const freshDossier = await getDomainDeepDossier(sql, cleanDomain, {
          folderId,
          keywordId,
          env,
          fastPath: true,
          displacedLimit
        });

        // [INVARIANT: DOSSIER-MICRO-SYNC-O1] Only dispatch DB rollup micro-sync when authenticated & unscoped
        if (canMutateInBackground && freshDossier?.success && !folderId && !keywordId) {
          safeWaitUntil(ctx, () => syncSingleDomainRollup(sql, cleanDomain, freshDossier, { folderId, keywordId }), 'sync_single_domain_rollup');
        }

        return freshDossier;
      };

      const dossier = await getCachedOrFetch(cacheKey, fetchDossier, 60000, 900000, {
        forceRefresh: isForceRefresh,
        timeoutMs: 27000
      });

      // Gate background WHOIS/Age & ads.txt scraping + DB mutations strictly behind verified API auth
      if (canMutateInBackground && (dossier?.needs_age_enrichment || dossier?.needs_ad_enrichment)) {
        safeWaitUntil(
          ctx,
          async () => {
            const tasks = [];
            if (dossier.needs_age_enrichment) {
              tasks.push(
                fetchAndCacheDomainAge(sql, cleanDomain).catch((err) => {
                  console.warn(`[domains-route] bg WHOIS enrichment warning for ${cleanDomain}:`, err?.message || err);
                })
              );
            }
            if (dossier.needs_ad_enrichment) {
              tasks.push(
                fetchAndCacheDomainAdNetwork(sql, cleanDomain).catch((err) => {
                  console.warn(`[domains-route] bg ads enrichment warning for ${cleanDomain}:`, err?.message || err);
                })
              );
            }
            await Promise.all(tasks);

            if (typeof invalidateEdgeCache === 'function') {
              await Promise.resolve(invalidateEdgeCache('domains:dossier'));
              await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
            }
          },
          'bg_dossier_enrichment'
        );
      }

      return jsonResponse(dossier, 200, 30);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 400));
    }
  }

  // 3. Domain Arbitrage Blueprint
  if (pathname === '/api/domains/blueprint') {
    if (method !== 'GET') {
      return respond405('GET, OPTIONS');
    }
    const domain = searchParams.get('domain');
    if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
    try {
      const numericWid = Number(workspaceId) || 1;
      const rawDomain = domain.trim();
      const isOrganicVault = isOrganicVaultName(rawDomain);
      const cleanDomain = isOrganicVault ? 'Uploaded by user' : normalizeCleanDomain(rawDomain);
      if (!cleanDomain || (!isOrganicVault && !cleanDomain.includes('.'))) {
        return jsonResponse({ error: 'Valid domain is required' }, 400);
      }
      const validatedFolderId = await validateFolderScope(sql, searchParams.get('folder_id'), numericWid);
      const folderId = validatedFolderId ? String(validatedFolderId) : null;
      const keywordId = searchParams.get('keyword_id') || null;
      const blueprint = await generateDomainArbitrageBlueprint(sql, cleanDomain, { folderId, keywordId });
      return jsonResponse(blueprint, 200, 30);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 400));
    }
  }

  // 4. Enrich Domain Age (WHOIS)
  if (pathname === '/api/domains/enrich-age') {
    if (method !== 'POST') {
      return respond405('POST, OPTIONS');
    }
    const authErr = requireApiAuth(request, env, jsonResponse);
    if (authErr) return authErr;
    try {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.domains) && body.domains.length > 0) {
        const batchLimit = Math.max(1, Math.min(Number(body.limit) || 50, 50));
        const batchRes = await enrichMissingDomainsBatch(sql, body.domains, batchLimit, { forceRefresh: Boolean(body.force) });
        if (typeof invalidateEdgeCache === 'function') {
          await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
          await Promise.resolve(invalidateEdgeCache('domains:dossier'));
        }
        return jsonResponse({ success: true, ...batchRes });
      }
      const singleDomain = body.domain || searchParams.get('domain');
      if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
      if (isOrganicVaultName(singleDomain)) {
        return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      }
      const clean = normalizeCleanDomain(singleDomain);
      if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      const ageData = await fetchAndCacheDomainAge(sql, clean, {
        forceRefresh: Boolean(body.force),
        throwOnDbError: true
      });
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
      }
      return jsonResponse({ success: true, age_info: ageData });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 5. Enrich Ad Networks (ads.txt)
  if (pathname === '/api/domains/enrich-ads') {
    if (method !== 'POST') {
      return respond405('POST, OPTIONS');
    }
    const authErr = requireApiAuth(request, env, jsonResponse);
    if (authErr) return authErr;
    try {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.domains) && body.domains.length > 0) {
        const batchLimit = Math.max(1, Math.min(Number(body.limit) || 20, 50));
        const batchRes = await enrichMissingAdNetworksBatch(sql, body.domains, batchLimit, {
          forceRefresh: Boolean(body.force),
          throwOnDbError: true
        });
        if (typeof invalidateEdgeCache === 'function') {
          await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
          await Promise.resolve(invalidateEdgeCache('domains:dossier'));
        }
        return jsonResponse({ success: true, ...batchRes });
      }
      const singleDomain = body.domain || searchParams.get('domain');
      if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
      if (isOrganicVaultName(singleDomain)) {
        return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      }
      const clean = normalizeCleanDomain(singleDomain);
      if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      const adData = await fetchAndCacheDomainAdNetwork(sql, clean, {
        forceRefresh: Boolean(body.force),
        throwOnDbError: true
      });
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
      }
      return jsonResponse({ success: true, ad_info: adData });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 6. Monetization Stats
  if (pathname === '/api/domains/ads-status') {
    if (method !== 'GET') {
      return respond405('GET, OPTIONS');
    }
    try {
      const stats = await getDatabaseMonetizationStats(sql);
      if (stats?.error) {
        return jsonResponse({ success: false, error: redactSecrets(stats.error) }, 500, 0);
      }
      return jsonResponse({ success: true, stats }, 200, 5);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 7. Enrichment Stats
  if (pathname === '/api/domains/enrich-status') {
    if (method !== 'GET') {
      return respond405('GET, OPTIONS');
    }
    try {
      const stats = await getDatabaseEnrichmentStats(sql);
      if (stats?.error) {
        return jsonResponse({ success: false, error: redactSecrets(stats.error) }, 500, 0);
      }
      return jsonResponse({ success: true, stats }, 200, 5);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 8. Enrich All Domains (Batch)
  if (pathname === '/api/domains/enrich-all') {
    if (method !== 'POST') {
      return respond405('POST, OPTIONS');
    }
    const authErr = requireApiAuth(request, env, jsonResponse);
    if (authErr) return authErr;
    try {
      const body = await request.json().catch(() => ({}));
      const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 20, 50));
      const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 3, 5));
      const forceRefresh = Boolean(body.force);
      const result = await enrichNextUncheckedBatch(sql, { batchSize, concurrency, forceRefresh });
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
      }
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  // 9. Enrich All Ads (Batch)
  if (pathname === '/api/domains/enrich-ads-all') {
    if (method !== 'POST') {
      return respond405('POST, OPTIONS');
    }
    const authErr = requireApiAuth(request, env, jsonResponse);
    if (authErr) return authErr;
    try {
      const body = await request.json().catch(() => ({}));
      const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 15, 50));
      const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 2, 4));
      const forceRefresh = Boolean(body.force);
      const result = await enrichNextUncheckedAdsBatch(sql, { batchSize, concurrency, forceRefresh });
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.resolve(invalidateEdgeCache('domains:leaderboard'));
        await Promise.resolve(invalidateEdgeCache('domains:dossier'));
      }
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, getErrorStatus(err, 500));
    }
  }

  return null;
}
