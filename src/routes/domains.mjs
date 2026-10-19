/**
 * Domain Intelligence & SERP Monopoly Sub-Router
 * 
 * Handles domain leaderboard, deep dossiers, arbitrage blueprints,
 * WHOIS domain age caching, and ads.txt monetization discovery.
 */

import {
  listDomainsIntelligenceFast,
  getDomainDeepDossier,
  fetchAndCacheDomainAge,
  enrichMissingDomainsBatch,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch,
  normalizeCleanDomain,
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch,
  generateDomainArbitrageBlueprint
} from '../modules/domains/service.mjs';

/**
 * Handles incoming /api/domains/* requests.
 * Returns Response if handled, or null if unhandled.
 */
export async function handleDomainsRoutes(routeCtx) {
  const {
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

  // 1. Domains Leaderboard Fast Listing
  if (method === 'GET' && pathname === '/api/domains') {
    try {
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
      const data = await getCachedOrFetch(cacheKey, async () => {
        return await listDomainsIntelligenceFast(sql, cacheParams);
      }, 15000, 60000);

      // Non-blocking background WHOIS/Age enrichment for unchecked domains on current page
      if (Array.isArray(data?.missing_age_domains) && data.missing_age_domains.length > 0) {
        safeWaitUntil(
          ctx,
          enrichMissingDomainsBatch(sql, data.missing_age_domains, 6).then(() => invalidateEdgeCache('domains:leaderboard')),
          'bg_enrich_domain_ages'
        );
      }

      // Non-blocking background Ad Network enrichment for unchecked domains on current page
      if (Array.isArray(data?.missing_ad_domains) && data.missing_ad_domains.length > 0) {
        safeWaitUntil(
          ctx,
          enrichMissingAdNetworksBatch(sql, data.missing_ad_domains, 6).then(() => invalidateEdgeCache('domains:leaderboard')),
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
      const folderId = searchParams.get('folder_id') || null;
      const keywordId = searchParams.get('keyword_id') || null;
      const dossier = await getDomainDeepDossier(sql, domain, { folderId, keywordId });
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
