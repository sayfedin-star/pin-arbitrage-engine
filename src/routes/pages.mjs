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

  // 1. Level 1B: Keyword Discovery & Autocomplete Hub
  if (
    pathLower === '/keywords/discovery' ||
    pathLower === '/discovery' ||
    pathLower.startsWith('/keywords/discovery/') ||
    pathLower.startsWith('/discovery/')
  ) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(getDiscoveryPageHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 2. Level 3: Dedicated Pin Intelligence Page (/pins/:pin_id or /pin/:pin_id) [CAP-07]
  if (pathLower.startsWith('/pins/') || pathLower.startsWith('/pin/')) {
    if (method !== 'GET') {
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
    return new Response(getPinDetailPageHtml(cleanPinId), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 3. Level 4: Dedicated Campaign Folders & Crossover Studio (/folders and /folders/:id)
  if (pathLower === '/folders' || pathLower.startsWith('/folders/')) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const folderId = segments[1] || '';
    return new Response(getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // Level 4B: Dedicated Domain Intelligence & SERP Monopoly Studio (/domains)
  if (pathLower === '/domains' || pathLower.startsWith('/domains/')) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(getDomainsPageHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 4. Level 1A & Level 2: Keywords Dashboard (/keywords) & SERP Radar (/keywords/:slug)
  if (pathLower === '/keywords' || pathLower.startsWith('/keywords/')) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const rawSlug = segments[1] || '';
    const slugLower = rawSlug.toLowerCase();

    // Defend against reserved slugs
    if (rawSlug && RESERVED_KEYWORD_SLUGS.has(slugLower)) {
      if (slugLower === 'discovery') {
        return new Response(getDiscoveryPageHtml(), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'folders') {
        const folderId = segments[2] || '';
        return new Response(getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
          status: 200,
          headers: HTML_HEADERS
        });
      }
      if (slugLower === 'domains') {
        return new Response(getDomainsPageHtml(), {
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

    return new Response(getKeywordsPageHtml(slug), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  // 5. Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme, /accounts)
  if (!pathLower.startsWith('/api/')) {
    if (method !== 'GET') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return new Response(getDashboardHtml(), {
      status: 200,
      headers: HTML_HEADERS
    });
  }

  return null;
}
