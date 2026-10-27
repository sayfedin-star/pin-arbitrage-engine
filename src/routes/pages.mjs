/**
 * UI HTML Pages Sub-Router
 * 
 * Serves all static and server-rendered HTML dashboard views.
 * Dispatched BEFORE API authentication gate to guarantee 405 Method Not Allowed
 * on mutative HTTP verbs (POST/PUT/DELETE) without requiring API authorization.
 * 
 * [INVARIANT: DYNAMIC-UI-LAZY-LOADING]
 * All 6 UI template modules are loaded lazily via dynamic await import() inside
 * handlePagesRoutes to eliminate 1.65 MB of cold-start V8 compilation overhead
 * on all /api/... requests and health checks.
 */

// [INVARIANT: FAST-EDGE-FAVICON]
// Clean inline SVG pin favicon to serve browser requests instantly (0ms network round-trip)
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📌</text></svg>';

// [INVARIANT: STATIC-ASSETS-FAST-404]
// Supported static asset file extensions to prevent missing assets from triggering expensive dashboard SSR (902KB)
const STATIC_ASSET_REGEX = /\.(?:ico|png|jpe?g|gif|svg|webp|css|js|map|woff2?|ttf|xml|txt|json)$/i;

/**
 * Handles incoming UI HTML page requests.
 * Returns Response if handled, or null if the request should proceed to API routers.
 */
export async function handlePagesRoutes(routeCtx) {
  const {
    pathLower,
    normalizedPath,
    method,
    searchParams,
    HTML_HEADERS,
    RESERVED_KEYWORD_SLUGS,
    methodNotAllowedResponse,
    jsonResponse,
    isValidPinId
  } = routeCtx;

  // 1. Fast Edge Favicon Interception [INVARIANT: FAST-EDGE-FAVICON]
  const isFavicon = pathLower === '/favicon.ico' ||
    pathLower === '/favicon.png' ||
    pathLower === '/favicon.svg' ||
    pathLower.endsWith('/favicon.ico') ||
    pathLower.endsWith('/favicon.png') ||
    pathLower.endsWith('/favicon.svg');

  if (isFavicon) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(method === 'HEAD' ? null : FAVICON_SVG, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // 2. Fast Edge Robots Policy Interception
  if (pathLower === '/robots.txt' || pathLower.endsWith('/robots.txt')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(method === 'HEAD' ? null : 'User-agent: *\nDisallow: /api/\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // 3. Fast Edge Missing Static Assets Trap [INVARIANT: STATIC-ASSETS-FAST-404] [INVARIANT: PREVENT-DASHBOARD-FALLTHROUGH]
  // Intercept any static asset extension across root or nested subpaths before triggering expensive SSR
  if (!pathLower.startsWith('/api/') && STATIC_ASSET_REGEX.test(pathLower)) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(method === 'HEAD' ? null : 'Asset Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // 3B. Fast Edge /fleet Redirect (Redirect legacy Fleet Manager UI to Overview)
  if (pathLower === '/fleet' || pathLower === '/fleet/') {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // 4. Level 1B: Keyword Discovery & Autocomplete Hub
  if (
    pathLower === '/keywords/discovery' ||
    pathLower === '/discovery' ||
    pathLower.startsWith('/keywords/discovery/') ||
    pathLower.startsWith('/discovery/')
  ) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }
    const { getDiscoveryPageHtml } = await import('../discovery-ui.mjs');
    return new Response(getDiscoveryPageHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 5. Level 3: Dedicated Pin Intelligence Page (/pins/:pin_id or /pin/:pin_id) [CAP-07]
  if (pathLower.startsWith('/pins/') || pathLower.startsWith('/pin/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const rawPinId = segments[1] || '';
    const cleanPinId = String(rawPinId).trim();
    if (!cleanPinId || !isValidPinId(cleanPinId)) {
      return jsonResponse(
        { success: false, error: 'INVALID_PIN_ID', message: 'Pin ID is required (numeric Snowflake, 10-30 digits)' },
        400
      );
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }
    const { getPinDetailPageHtml } = await import('../pin-details-ui.mjs');
    return new Response(getPinDetailPageHtml(cleanPinId), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 5B. Canonical URL Unification: 301 Permanent Redirect for legacy /:username/pin/:pin_id
  const pageSegments = normalizedPath.split('/').filter(Boolean);
  if (pageSegments.length === 3) {
    const seg0Lower = (pageSegments[0] || '').toLowerCase();
    const seg1Lower = (pageSegments[1] || '').toLowerCase();
    const cleanLegacyPinId = String(pageSegments[2] || '').trim();

    if (
      (seg1Lower === 'pin' || seg1Lower === 'pins') &&
      seg0Lower !== 'api' &&
      !RESERVED_KEYWORD_SLUGS.has(seg0Lower) &&
      isValidPinId(cleanLegacyPinId)
    ) {
      if (method !== 'GET' && method !== 'HEAD') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      const cleanCreator = pageSegments[0].replace(/^@+/, '').trim();
      const targetParams = new URLSearchParams(searchParams);
      if (!targetParams.has('creator') && !targetParams.has('account')) {
        targetParams.set('creator', cleanCreator);
      }
      const queryString = targetParams.toString();
      const redirectLocation = `/pin/${cleanLegacyPinId}${queryString ? `?${queryString}` : ''}`;
      return new Response(null, {
        status: 301,
        headers: {
          'Location': redirectLocation,
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
  }

  // [INVARIANT: SSR-WORKSPACE-ROOM-ROUTING]
  // 6. Level 4: Dedicated Campaign Workspace Rooms (/folders, /folders/:id, and /folders/:id/*)
  if (pathLower === '/folders' || pathLower.startsWith('/folders/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    // segments: ['folders'] or ['folders', ':id'] or ['folders', ':id', 'keywords'|'creators'|'domains']
    if (segments.length <= 1) {
      // /folders -> Folder Hub Index
      const { getCampaignFoldersPageHtml } = await import('../campaign-folders-ui.mjs');
      return new Response(getCampaignFoldersPageHtml(''), { status: 200, headers: HTML_HEADERS });
    }

    let folderId = segments[1] || '';
    try { folderId = decodeURIComponent(folderId); } catch (_) {}
    const room = (segments[2] || '').toLowerCase();

    if (!room) {
      // Room 1: /folders/:id -> Crossover & Super-Pins Room
      const { getCampaignFoldersPageHtml } = await import('../campaign-folders-ui.mjs');
      return new Response(getCampaignFoldersPageHtml(folderId), { status: 200, headers: HTML_HEADERS });
    }

    if (room === 'keywords') {
      // Room 2: /folders/:id/keywords -> Scoped Keywords Fleet Dashboard
      const { getKeywordsPageHtml } = await import('../keywords-ui.mjs');
      return new Response(getKeywordsPageHtml('', '', folderId), { status: 200, headers: HTML_HEADERS });
    }

    if (room === 'creators') {
      // Room 3: /folders/:id/creators -> Scoped Creator Hub
      const { getDashboardHtml } = await import('../dashboard-ui.mjs');
      return new Response(getDashboardHtml(folderId), { status: 200, headers: HTML_HEADERS });
    }

    if (room === 'domains') {
      // Room 4: /folders/:id/domains -> Scoped Domain Intelligence Studio
      let domainParam = segments[3] || '';
      try { domainParam = decodeURIComponent(domainParam); } catch (_) {}
      const { getDomainsPageHtml } = await import('../domains-ui.mjs');
      return new Response(getDomainsPageHtml(domainParam, folderId), { status: 200, headers: HTML_HEADERS });
    }

    // Fallback to Room 1
    const { getCampaignFoldersPageHtml } = await import('../campaign-folders-ui.mjs');
    return new Response(getCampaignFoldersPageHtml(folderId), { status: 200, headers: HTML_HEADERS });
  }

  // 7. Level 4B: Dedicated Domain Intelligence & SERP Monopoly Studio (/domains & /domains/:domain)
  if (pathLower === '/domains' || pathLower.startsWith('/domains/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    let domain = segments[1] || '';
    try { domain = decodeURIComponent(domain); } catch (_) {}
    const { getDomainsPageHtml } = await import('../domains-ui.mjs');
    return new Response(getDomainsPageHtml(domain), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 8. Level 1A & Level 2: Keywords Dashboard (/keywords) & SERP Radar (/keywords/:slug)
  if (pathLower === '/keywords' || pathLower.startsWith('/keywords/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const rawSlug = segments[1] || '';
    const slugLower = rawSlug.toLowerCase();

    // Defend against reserved slugs
    if (rawSlug && RESERVED_KEYWORD_SLUGS.has(slugLower)) {
      if (slugLower === 'discovery') {
        if (method === 'HEAD') return new Response(null, { status: 200, headers: HTML_HEADERS });
        const { getDiscoveryPageHtml } = await import('../discovery-ui.mjs');
        return new Response(getDiscoveryPageHtml(), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'folders') {
        if (method === 'HEAD') return new Response(null, { status: 200, headers: HTML_HEADERS });
        const folderId = segments[2] || '';
        let cleanFolderId = folderId;
        try { cleanFolderId = decodeURIComponent(folderId); } catch (_) {}
        const { getCampaignFoldersPageHtml } = await import('../campaign-folders-ui.mjs');
        return new Response(getCampaignFoldersPageHtml(cleanFolderId), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'domains') {
        if (method === 'HEAD') return new Response(null, { status: 200, headers: HTML_HEADERS });
        let domain = segments[2] || '';
        try { domain = decodeURIComponent(domain); } catch (_) {}
        const { getDomainsPageHtml } = await import('../domains-ui.mjs');
        return new Response(getDomainsPageHtml(domain), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
    }

    // Query parameter fallback (?q=... or ?keyword=...)
    let slug = rawSlug;
    const queryParam = searchParams.get('q') || searchParams.get('keyword') || searchParams.get('slug');
    if (!slug && queryParam) {
      slug = queryParam.trim();
    }

    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }
    const { getKeywordsPageHtml } = await import('../keywords-ui.mjs');
    return new Response(getKeywordsPageHtml(slug), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 9. Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme, /accounts)
  if (!pathLower.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: HTML_HEADERS });
    }
    const { getDashboardHtml } = await import('../dashboard-ui.mjs');
    return new Response(getDashboardHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  return null;
}
