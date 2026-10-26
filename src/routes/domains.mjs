/**
 * Domain Intelligence & SERP Monopoly Sub-Router
 * 
 * Handles domain leaderboard, deep dossiers, arbitrage blueprints,
 * WHOIS domain age caching, and ads.txt monetization discovery.
 */

import {
  listDomainsIntelligenceFast,
  getDomainDeepDossier,
  syncSingleDomainRollup,
  fetchAndCacheDomainAge,
  enrichMissingDomainsBatch,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch,
  normalizeCleanDomain,
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch,
  generateDomainArbitrageBlueprint,
  refreshDomainIntelligenceRollup
} from '../modules/domains/service.mjs';
import { verifyApiAuthentication } from '../worker.mjs';

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
      if (auth.response) return auth.response;
      return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: auth.reason || 'Authentication required' }, auth.status || 401);
    }
    try {
      invalidateEdgeCache('domains:leaderboard');
      const refreshResult = await refreshDomainIntelligenceRollup(sql);
      return jsonResponse({ success: true, refreshed: true, ...refreshResult }, 200, 0);
    } catch (err) {
      return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
    }
  }

  // 1. Domains Leaderboard Fast Listing
  if (method === 'GET' && pathname === '/api/domains') {
    try {
      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      if (isForceRefresh) {
        invalidateEdgeCache('domains:leaderboard');
        // [INVARIANT: READ-ONLY-GET-SAFE] Ban full-table rollup mutation on unauthenticated GET.
        // Dedicated rollup execution is strictly isolated to POST /api/domains/refresh-rollup.
      }
      const cacheParams = {
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
        excludeMarketplaces: searchParams.get('exclude_marketplaces') !== 'false',
        minPins: Number(searchParams.get('min_pins') || 1),
        sortBy: searchParams.get('sort') || 'visibility',
        page: Number(searchParams.get('page') || 1),
        limit: clampLimit(searchParams.get('limit'), 50, 200)
      };
      const cacheKey = buildCanonicalCacheKey('domains:leaderboard', cacheParams);
      const data = isForceRefresh
        ? await listDomainsIntelligenceFast(sql, cacheParams)
        : await getCachedOrFetch(cacheKey, async () => {
            return await listDomainsIntelligenceFast(sql, cacheParams);
          }, 15000, 60000);

      // Non-blocking background WHOIS/Age enrichment for unchecked domains on current page
      if (Array.isArray(data?.missing_age_domains) && data.missing_age_domains.length > 0) {
        safeWaitUntil(
          ctx,
          enrichMissingDomainsBatch(sql, data.missing_age_domains, 4).catch(() => {}),
          'bg_enrich_domain_ages'
        );
      }

      // Non-blocking background Ad Network enrichment for unchecked domains on current page
      if (Array.isArray(data?.missing_ad_domains) && data.missing_ad_domains.length > 0) {
        safeWaitUntil(
          ctx,
          enrichMissingAdNetworksBatch(sql, data.missing_ad_domains, 4).catch(() => {}),
          'bg_enrich_domain_ads'
        );
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
      const cleanDomain = normalizeCleanDomain(domain);
      if (!cleanDomain) return jsonResponse({ error: 'Valid domain is required' }, 400);

      const isForceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
      const folderId = searchParams.get('folder_id') || null;
      const keywordId = searchParams.get('keyword_id') || null;

      const cacheKey = buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain, folderId, keywordId });
      const kvKey = `dossier:domain:${cleanDomain}${folderId ? `:${folderId}` : ''}${keywordId ? `:${keywordId}` : ''}`;

      if (isForceRefresh) {
        if (typeof invalidateEdgeCache === 'function') {
          invalidateEdgeCache(buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain }));
          invalidateEdgeCache('domains:leaderboard');
        }
        if (env?.PIN_ENGINE_KV) {
          safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete(kvKey).catch(() => {}), 'kv_evict_domain_dossier');
          if (kvKey !== `dossier:domain:${cleanDomain}`) {
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete(`dossier:domain:${cleanDomain}`).catch(() => {}), 'kv_evict_domain_dossier_base');
          }
        }
      }

      const fetchDossier = async () => {
        // [INVARIANT: EDGE-KV-CACHE-FIRST] Check Workers KV first for sub-5ms response
        if (env?.PIN_ENGINE_KV && !isForceRefresh) {
          try {
            // [INVARIANT: NO-MUTABLE-KV-CACHE-TTL] Eliminate cacheTtl on mutable keys to prevent stale edge PoP reads
            const kvCached = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
            if (kvCached) return kvCached;
          } catch (_) {}
        }

        const freshDossier = await getDomainDeepDossier(sql, cleanDomain, { folderId, keywordId, env, fastPath: true });

        // [INVARIANT: DOSSIER-MICRO-SYNC-O1] Non-blocking single-domain rollup sync (<5ms)
        if (freshDossier?.success) {
          safeWaitUntil(ctx, syncSingleDomainRollup(sql, cleanDomain, freshDossier), 'sync_single_domain_rollup');
          if (typeof invalidateEdgeCache === 'function') {
            invalidateEdgeCache('domains:leaderboard');
          }
        }

        // Cache in Workers KV: 900s (15 min) for full dossier, or short 30s TTL if enrichment is pending
        if (env?.PIN_ENGINE_KV && freshDossier?.success) {
          const isPending = Boolean(freshDossier?.needs_age_enrichment || freshDossier?.needs_ad_enrichment);
          const expirationTtl = isPending ? 30 : 900;
          safeWaitUntil(
            ctx,
            env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(freshDossier), { expirationTtl }).catch(() => {}),
            'kv_cache_domain_dossier'
          );
        }

        return freshDossier;
      };

      const dossier = await getCachedOrFetch(cacheKey, fetchDossier, 60000, 900000, {
        forceRefresh: isForceRefresh,
        timeoutMs: 27000
      });

      // Non-blocking background enrichment for missing WHOIS or ads
      if (dossier?.needs_age_enrichment || dossier?.needs_ad_enrichment) {
        safeWaitUntil(
          ctx,
          (async () => {
            const tasks = [];
            if (dossier.needs_age_enrichment) {
              tasks.push(fetchAndCacheDomainAge(sql, cleanDomain).catch(() => {}));
            }
            if (dossier.needs_ad_enrichment) {
              tasks.push(fetchAndCacheDomainAdNetwork(sql, cleanDomain).catch(() => {}));
            }
            await Promise.all(tasks);

            // Once background enrichment completes in Postgres, purge pending dossier from KV and edge cache
            if (env?.PIN_ENGINE_KV) {
              await env.PIN_ENGINE_KV.delete(kvKey).catch(() => {});
              if (kvKey !== `dossier:domain:${cleanDomain}`) {
                await env.PIN_ENGINE_KV.delete(`dossier:domain:${cleanDomain}`).catch(() => {});
              }
            }
            if (typeof invalidateEdgeCache === 'function') {
              invalidateEdgeCache(buildCanonicalCacheKey('domains:dossier', { domain: cleanDomain }));
            }
          })(),
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
      const blueprint = await generateDomainArbitrageBlueprint(sql, domain);
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
