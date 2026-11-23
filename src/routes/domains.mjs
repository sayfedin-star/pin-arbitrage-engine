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
    clampLimit,
    buildCanonicalCacheKey,
    getCachedOrFetch,
    invalidateEdgeCache,
    safeWaitUntil,
    redactSecrets
  } = routeCtx;

  // 1a. Dedicated Rollup Refresh & Edge Cache Invalidation Endpoint (POST with verifyApiAuthentication)
  if (pathname === '/api/domains/refresh-rollup' || pathname === '/api/domains/refresh') {
    if (method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method Not Allowed. Use POST with authentication.' }, 405);
    }
    const auth = verifyApiAuthentication(request, env);
    if (!auth.authorized) {
      return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: auth.reason || 'Authentication required' }, auth.status || 401);
    }
    try {
      await invalidateEdgeCache('domains:leaderboard');
      const refreshResult = await refreshDomainIntelligenceRollup(sql);
      return jsonResponse({ success: true, refreshed: true, ...refreshResult }, 200, 0);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 1. Domains Leaderboard Fast Listing
  if (method === 'GET' && pathname === '/api/domains') {
    try {
      const canMutateInBackground = Boolean(verifyApiAuthentication(request, env)?.authorized);
      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      if (isForceRefresh && canMutateInBackground) {
        await invalidateEdgeCache('domains:leaderboard');
      }

      const numericWid = Number(workspaceId) || 1;
      const explicitWsScope = searchParams.get('workspace_scope') === '1' || searchParams.get('workspace_scope') === 'true';
      const enforceWorkspaceScope = numericWid !== 1 || explicitWsScope;

      const cacheParams = {
        workspaceId: numericWid,
        workspaceScope: enforceWorkspaceScope ? 1 : 0,
        search: searchParams.get('search') || '',
        folderId: searchParams.get('folder_id') || '',
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
        page: Number(searchParams.get('page') || 1),
        limit: clampLimit(searchParams.get('limit'), 50, 200)
      };
      const queryParams = { ...cacheParams, allowBackgroundRefresh: canMutateInBackground, ctx };
      const cacheKey = buildCanonicalCacheKey('domains:leaderboard', cacheParams);
      const SIX_HOURS_MS = 21600000;
      const ONE_HOUR_MS = 3600000;
      const fetchDomains = async () => {
        if (!enforceWorkspaceScope) {
          const raw = await listDomainsIntelligenceFast(sql, queryParams);
          return { ...raw, workspace_id: numericWid };
        }
        const scopedQueryParams = {
          ...queryParams,
          page: 1,
          limit: Math.max(cacheParams.limit, 500)
        };
        const [raw, watchRows, pinnedRows, trackedRows] = await Promise.all([
          listDomainsIntelligenceFast(sql, scopedQueryParams),
          sql`
            SELECT LOWER(TRIM(entity_key)) AS dom
            FROM workspace_watchlist
            WHERE workspace_id = ${numericWid}
              AND entity_type = 'domain'
              AND entity_key IS NOT NULL;
          `.catch(() => []),
          sql`
            SELECT DISTINCT LOWER(TRIM(fpd.domain)) AS dom
            FROM folder_pinned_domains fpd
            JOIN keyword_folders kf ON kf.id = fpd.folder_id
            WHERE kf.workspace_id = ${numericWid}
              AND fpd.domain IS NOT NULL;
          `.catch(() => []),
          sql`
            SELECT DISTINCT LOWER(TRIM(COALESCE(ump.clean_domain, ''))) AS dom
            FROM campaign_tracked_pins ctp
            JOIN universal_master_pins ump ON ump.pin_id = ctp.pin_id
            WHERE ctp.workspace_id = ${numericWid}
              AND ump.clean_domain IS NOT NULL
              AND ump.clean_domain <> '';
          `.catch(() => [])
        ]);

        const allowedDomains = new Set();
        for (const list of [watchRows, pinnedRows, trackedRows]) {
          for (const r of (list || [])) {
            const d = String(r?.dom || '').trim().toLowerCase().replace(/^www\./, '');
            if (d) allowedDomains.add(d);
          }
        }

        const baseDomains = Array.isArray(raw?.domains) ? raw.domains : [];
        // Default workspace (id === 1) preserves full Radar discovery even after adding items to Watchlist;
        // non-default workspaces (id !== 1) always remain strictly isolated to workspace targets.
        const scopedDomains = numericWid === 1
          ? baseDomains
          : baseDomains.filter((d) => {
              const norm = String(d?.domain || d?.clean_domain || '').trim().toLowerCase().replace(/^www\./, '');
              return norm && allowedDomains.has(norm);
            });

        const pageNum = Math.max(1, Number(cacheParams.page) || 1);
        const pageLim = Math.max(1, Number(cacheParams.limit) || 50);
        const startIdx = (pageNum - 1) * pageLim;
        const pagedDomains = scopedDomains.slice(startIdx, startIdx + pageLim);

        return {
          ...raw,
          domains: pagedDomains,
          page: pageNum,
          limit: pageLim,
          total: scopedDomains.length,
          total_domains: scopedDomains.length,
          workspace_id: numericWid,
          workspace_scoped: true
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
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 2. Domain Deep Dossier
  if (method === 'GET' && pathname === '/api/domains/dossier') {
    const domain = searchParams.get('domain');
    if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
    try {
      const canMutateInBackground = Boolean(verifyApiAuthentication(request, env)?.authorized);
      const rawDomain = domain.trim();
      const isOrganicVault = rawDomain.toLowerCase() === 'uploaded by user' || rawDomain.toLowerCase() === 'uploaded-by-user' || rawDomain.toLowerCase() === 'organic';
      const cleanDomain = isOrganicVault ? 'Uploaded by user' : normalizeCleanDomain(rawDomain);
      if (!cleanDomain || (!isOrganicVault && !cleanDomain.includes('.'))) return jsonResponse({ error: 'Valid domain is required' }, 400);

      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      const folderId = searchParams.get('folder_id') || null;
      const keywordId = searchParams.get('keyword_id') || null;
      const displacedLimit = Math.min(200, Math.max(30, Number(searchParams.get('displaced_limit') || 30)));

      const cacheKey = buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain, folderId, keywordId, displacedLimit });

      if (isForceRefresh && canMutateInBackground && typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache(buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain }));
        await invalidateEdgeCache('domains:leaderboard');
      }

      const fetchDossier = async () => {
        const freshDossier = await getDomainDeepDossier(sql, cleanDomain, { folderId, keywordId, env, fastPath: true, displacedLimit });

        // [INVARIANT: DOSSIER-MICRO-SYNC-O1] Only dispatch DB rollup micro-sync when authenticated & unscoped
        if (canMutateInBackground && freshDossier?.success && !folderId) {
          safeWaitUntil(ctx, () => syncSingleDomainRollup(sql, cleanDomain, freshDossier), 'sync_single_domain_rollup');
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
              tasks.push(fetchAndCacheDomainAge(sql, cleanDomain).catch(() => {}));
            }
            if (dossier.needs_ad_enrichment) {
              tasks.push(fetchAndCacheDomainAdNetwork(sql, cleanDomain).catch(() => {}));
            }
            await Promise.all(tasks);

            if (typeof invalidateEdgeCache === 'function') {
              invalidateEdgeCache(buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain }));
            }
          },
          'bg_dossier_enrichment'
        );
      }

      return jsonResponse(dossier, 200, 30);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 400);
    }
  }

  // 3. Domain Arbitrage Blueprint
  if (method === 'GET' && pathname === '/api/domains/blueprint') {
    const domain = searchParams.get('domain');
    if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
    try {
      const folderId = searchParams.get('folder_id') || null;
      const blueprint = await generateDomainArbitrageBlueprint(sql, domain, { folderId });
      return jsonResponse(blueprint, 200, 30);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 400);
    }
  }

  // 4. Enrich Domain Age (WHOIS)
  if (method === 'POST' && pathname === '/api/domains/enrich-age') {
    invalidateEdgeCache('domains:leaderboard');
    try {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.domains) && body.domains.length > 0) {
        const batchLimit = Math.max(1, Math.min(Number(body.limit) || 50, 50));
        const batchRes = await enrichMissingDomainsBatch(sql, body.domains, batchLimit, { forceRefresh: Boolean(body.force) });
        return jsonResponse({ success: true, ...batchRes });
      }
      const singleDomain = body.domain || searchParams.get('domain');
      if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
      const clean = normalizeCleanDomain(singleDomain);
      if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      const ageData = await fetchAndCacheDomainAge(sql, clean, { forceRefresh: Boolean(body.force) });
      return jsonResponse({ success: true, age_info: ageData });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 5. Enrich Ad Networks (ads.txt)
  if (method === 'POST' && pathname === '/api/domains/enrich-ads') {
    invalidateEdgeCache('domains:leaderboard');
    try {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.domains) && body.domains.length > 0) {
        const batchLimit = Math.max(1, Math.min(Number(body.limit) || 20, 50));
        const batchRes = await enrichMissingAdNetworksBatch(sql, body.domains, batchLimit, { forceRefresh: Boolean(body.force) });
        return jsonResponse({ success: true, ...batchRes });
      }
      const singleDomain = body.domain || searchParams.get('domain');
      if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
      const clean = normalizeCleanDomain(singleDomain);
      if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
      const adData = await fetchAndCacheDomainAdNetwork(sql, clean, { forceRefresh: Boolean(body.force) });
      return jsonResponse({ success: true, ad_info: adData });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 6. Monetization Stats
  if (method === 'GET' && pathname === '/api/domains/ads-status') {
    try {
      const stats = await getDatabaseMonetizationStats(sql);
      return jsonResponse({ success: true, stats }, 200, 5);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 7. Enrichment Stats
  if (method === 'GET' && pathname === '/api/domains/enrich-status') {
    try {
      const stats = await getDatabaseEnrichmentStats(sql);
      return jsonResponse({ success: true, stats }, 200, 5);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 8. Enrich All Domains (Batch)
  if (method === 'POST' && pathname === '/api/domains/enrich-all') {
    invalidateEdgeCache('domains:leaderboard');
    try {
      const body = await request.json().catch(() => ({}));
      const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 20, 50));
      const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 3, 5));
      const forceRefresh = Boolean(body.force);
      const result = await enrichNextUncheckedBatch(sql, { batchSize, concurrency, forceRefresh });
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 9. Enrich All Ads (Batch)
  if (method === 'POST' && pathname === '/api/domains/enrich-ads-all') {
    invalidateEdgeCache('domains:leaderboard');
    try {
      const body = await request.json().catch(() => ({}));
      const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 15, 50));
      const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 2, 4));
      const forceRefresh = Boolean(body.force);
      const result = await enrichNextUncheckedAdsBatch(sql, { batchSize, concurrency, forceRefresh });
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  return null;
}
