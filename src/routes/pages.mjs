/**
 * UI HTML Pages Sub-Router
 * 
 * Serves all static and server-rendered HTML dashboard views.
 * Dispatched BEFORE API authentication gate to guarantee 405 Method Not Allowed
 * on mutative HTTP verbs (POST/PUT/DELETE) without requiring API authorization.
 */

import { getDashboardHtml } from '../dashboard-ui.mjs';
import { getKeywordsPageHtml } from '../keywords-ui.mjs';
import { getDiscoveryPageHtml } from '../discovery-ui.mjs';
import { getPinDetailPageHtml } from '../pin-details-ui.mjs';
import { getCampaignFoldersPageHtml } from '../campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../domains-ui.mjs';

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
    return new Response(method === 'HEAD' ? null : getDiscoveryPageHtml(), {
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
    return new Response(method === 'HEAD' ? null : getPinDetailPageHtml(cleanPinId), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 6. Level 4: Dedicated Campaign Folders & Crossover Studio (/folders and /folders/:id)
  if (pathLower === '/folders' || pathLower.startsWith('/folders/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const folderId = segments[1] || '';
    return new Response(method === 'HEAD' ? null : getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 7. Level 4B: Dedicated Domain Intelligence & SERP Monopoly Studio (/domains & /domains/:domain)
  if (pathLower === '/domains' || pathLower.startsWith('/domains/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    let domain = segments[1] || '';
    try { domain = decodeURIComponent(domain); } catch (_) {}
    return new Response(method === 'HEAD' ? null : getDomainsPageHtml(domain), {
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
        return new Response(method === 'HEAD' ? null : getDiscoveryPageHtml(), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'folders') {
        const folderId = segments[2] || '';
        return new Response(method === 'HEAD' ? null : getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'domains') {
        let domain = segments[2] || '';
        try { domain = decodeURIComponent(domain); } catch (_) {}
        return new Response(method === 'HEAD' ? null : getDomainsPageHtml(domain), {
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

    return new Response(method === 'HEAD' ? null : getKeywordsPageHtml(slug), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 9. Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme, /accounts)
  if (!pathLower.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(method === 'HEAD' ? null : getDashboardHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  return null;
}
