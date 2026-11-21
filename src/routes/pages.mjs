/**
 * UI HTML Pages & Static Shell Sub-Router
 *
 * Serves `/pae-shell.js` from an in-memory buffer with strong SHA-256 ETag and
 * renders all 8 server-rendered HTML studio views via lazy dynamic imports.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requestContextStorage } from '../http/security-and-response.mjs';
import { precompressStaticBuffer } from '../http/compression.mjs';
import { getClientJsAsset } from '../ui/client-assets.mjs';

const PAE_SHELL_PATH = fileURLToPath(new URL('../../public/pae-shell.js', import.meta.url));
export const PAE_SHELL_BUF = fs.readFileSync(PAE_SHELL_PATH);
export const PAE_SHELL_TEXT = PAE_SHELL_BUF.toString('utf8');
export const PAE_SHELL_HASH = crypto.createHash('sha256').update(PAE_SHELL_BUF).digest('hex');
export const PAE_SHELL_ETAG = `"${PAE_SHELL_HASH}"`;
export const PAE_SHELL_VERSION = PAE_SHELL_HASH.slice(0, 12);

precompressStaticBuffer(PAE_SHELL_BUF);

const CLIENT_JS_ASSET_ROUTE_REGEX = /^\/assets\/js\/([a-z0-9-]+)\.js$/;

function etagMatches(rawIfNoneMatch, targetEtag) {
  if (!rawIfNoneMatch || !targetEtag) return false;
  const stripWeak = (val) => val.trim().replace(/^W\//i, '');
  const normalizedTarget = stripWeak(targetEtag);
  return String(rawIfNoneMatch)
    .split(',')
    .some((candidate) => {
      const clean = candidate.trim();
      return clean === '*' || stripWeak(clean) === normalizedTarget;
    });
}

const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📌</text></svg>';

const STATIC_ASSET_REGEX = /\.(?:ico|png|jpe?g|gif|svg|webp|css|js|map|woff2?|ttf|xml|txt|json)$/i;

/**
 * Handles incoming UI HTML page and `/pae-shell.js` requests.
 * Sends via Fastify reply if handled, or returns null if the request should proceed to API routers.
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

  const store = requestContextStorage?.getStore?.();
  const effectiveReply = routeCtx.reply || store?.reply;
  const effectiveRequest = routeCtx.request || store?.request;

  const sendNative = (body, status = 200, headers = {}) => {
    if (!effectiveReply || typeof effectiveReply.send !== 'function') {
      throw new Error('[pages] handlePagesRoutes requires an active Fastify reply.');
    }
    if (effectiveReply.sent) return effectiveReply;
    const isBodyless = method === 'HEAD' || status === 204 || status === 304;
    effectiveReply.code(status);
    for (const [k, v] of Object.entries(headers)) {
      effectiveReply.header(k, v);
    }
    return effectiveReply.send(isBodyless ? '' : (body ?? ''));
  };

  // 0. Cached Shared Browser Runtime (/pae-shell.js) — served from memory BEFORE STATIC_ASSET_REGEX
  if (pathLower === '/pae-shell.js') {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, HEAD, OPTIONS');
    }
    const versionParam = searchParams?.get?.('v') || '';
    const isVersionPinned = versionParam === PAE_SHELL_VERSION;
    const shellHeaders = {
      'Content-Type': 'application/javascript; charset=utf-8',
      'ETag': PAE_SHELL_ETAG,
      'Cache-Control': isVersionPinned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    };
    const rawIfNoneMatch = effectiveRequest?.headers?.['if-none-match'] || '';
    if (etagMatches(rawIfNoneMatch, PAE_SHELL_ETAG)) {
      return sendNative(null, 304, shellHeaders);
    }
    return sendNative(PAE_SHELL_BUF, 200, shellHeaders);
  }

  // 0B. Content-Hashed Extracted Client Studio JS Assets (/assets/js/<name>.js?v=<sha12>)
  const clientAssetMatch = pathLower.match(CLIENT_JS_ASSET_ROUTE_REGEX);
  if (clientAssetMatch) {
    const asset = getClientJsAsset(clientAssetMatch[1]);
    if (asset) {
      if (method !== 'GET' && method !== 'HEAD') {
        return methodNotAllowedResponse('GET, HEAD, OPTIONS');
      }
      const versionParam = searchParams?.get?.('v') || '';
      const isVersionPinned = versionParam === asset.version;
      const assetHeaders = {
        'Content-Type': 'application/javascript; charset=utf-8',
        'ETag': asset.etag,
        'Cache-Control': isVersionPinned
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      };
      const rawIfNoneMatch = effectiveRequest?.headers?.['if-none-match'] || '';
      if (etagMatches(rawIfNoneMatch, asset.etag)) {
        return sendNative(null, 304, assetHeaders);
      }
      return sendNative(asset.buf, 200, assetHeaders);
    }
  }

  // 1. Fast Edge Favicon Interception
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
    return sendNative(FAVICON_SVG, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    });
  }

  // 2. Fast Edge Robots Policy Interception
  if (pathLower === '/robots.txt' || pathLower.endsWith('/robots.txt')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return sendNative('User-agent: *\nDisallow: /api/\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    });
  }

  // 3. Fast Edge Missing Static Assets Trap
  if (!pathLower.startsWith('/api/') && STATIC_ASSET_REGEX.test(pathLower)) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return sendNative('Asset Not Found', 404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
  }

  // 3B. Fast Edge /fleet Redirect
  if (pathLower === '/fleet' || pathLower === '/fleet/') {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    return sendNative(null, 302, {
      'Location': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
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
      return sendNative(null, 200, HTML_HEADERS);
    }
    const { getDiscoveryPageHtml } = await import('../ui/discovery/index.mjs');
    return sendNative(getDiscoveryPageHtml(), 200, HTML_HEADERS);
  }

  // 4C. Level 5: 24-Hour Algorithmic Pulse & Crossover Studio (/pulse, /24h)
  if (
    pathLower === '/pulse' ||
    pathLower === '/pulse/' ||
    pathLower === '/24h' ||
    pathLower === '/24h/' ||
    pathLower.startsWith('/pulse/') ||
    pathLower.startsWith('/24h/')
  ) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }
    const { getPulsePageHtml } = await import('../ui/pulse/index.mjs');
    return sendNative(getPulsePageHtml(''), 200, HTML_HEADERS);
  }

  // 4D. Level 6: Newborn Breakout Hunter & Automation Studio (/newborn)
  if (
    pathLower === '/newborn' ||
    pathLower === '/newborn/' ||
    pathLower.startsWith('/newborn/')
  ) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }
    const nbSegments = normalizedPath.split('/').filter(Boolean);
    const subRoom = (nbSegments[1] || '').toLowerCase();
    const { getNewbornPageHtml } = await import('../ui/newborn/index.mjs');
    return sendNative(getNewbornPageHtml('', subRoom), 200, HTML_HEADERS);
  }

  // 5. Level 3: Dedicated Pin Intelligence Page (/pins/:pin_id or /pin/:pin_id)
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
      return sendNative(null, 200, HTML_HEADERS);
    }
    const { getPinDetailPageHtml } = await import('../ui/pin-details/index.mjs');
    return sendNative(getPinDetailPageHtml(cleanPinId), 200, HTML_HEADERS);
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
      return sendNative(null, 301, {
        'Location': redirectLocation,
        'Cache-Control': 'public, max-age=86400'
      });
    }
  }

  // 6. Level 4: Dedicated Campaign Workspace Rooms (/folders, /folders/:id, and /folders/:id/*)
  if (pathLower === '/folders' || pathLower.startsWith('/folders/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length <= 1) {
      const { getCampaignFoldersPageHtml } = await import('../ui/folders/index.mjs');
      return sendNative(getCampaignFoldersPageHtml(''), 200, HTML_HEADERS);
    }

    let folderId = segments[1] || '';
    try { folderId = decodeURIComponent(folderId); } catch (_) {}
    const room = (segments[2] || '').toLowerCase();

    if (!room) {
      const { getCampaignFoldersPageHtml } = await import('../ui/folders/index.mjs');
      return sendNative(getCampaignFoldersPageHtml(folderId), 200, HTML_HEADERS);
    }

    if (room === 'keywords') {
      const { getKeywordsPageHtml } = await import('../ui/keywords/index.mjs');
      return sendNative(getKeywordsPageHtml('', '', folderId), 200, HTML_HEADERS);
    }

    if (room === 'creators') {
      const { getDashboardHtml } = await import('../ui/dashboard/index.mjs');
      return sendNative(getDashboardHtml(folderId), 200, HTML_HEADERS);
    }

    if (room === 'domains') {
      let domainParam = segments[3] || '';
      try { domainParam = decodeURIComponent(domainParam); } catch (_) {}
      const { getDomainsPageHtml } = await import('../ui/domains/index.mjs');
      return sendNative(getDomainsPageHtml(domainParam, folderId), 200, HTML_HEADERS);
    }

    if (room === 'settings') {
      const { getCampaignFoldersPageHtml } = await import('../ui/folders/index.mjs');
      return sendNative(getCampaignFoldersPageHtml(folderId, 'settings'), 200, HTML_HEADERS);
    }

    if (room === 'pulse' || room === '24h') {
      const { getPulsePageHtml } = await import('../ui/pulse/index.mjs');
      return sendNative(getPulsePageHtml(folderId), 200, HTML_HEADERS);
    }

    if (room === 'newborn') {
      const subRoom = (segments[3] || '').toLowerCase();
      const { getNewbornPageHtml } = await import('../ui/newborn/index.mjs');
      return sendNative(getNewbornPageHtml(folderId, subRoom), 200, HTML_HEADERS);
    }

    const { getCampaignFoldersPageHtml } = await import('../ui/folders/index.mjs');
    return sendNative(getCampaignFoldersPageHtml(folderId), 200, HTML_HEADERS);
  }

  // 7. Level 4B: Dedicated Domain Intelligence & SERP Monopoly Studio (/domains & /domains/:domain)
  if (pathLower === '/domains' || pathLower.startsWith('/domains/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    let domain = segments[1] || '';
    try { domain = decodeURIComponent(domain); } catch (_) {}
    const { getDomainsPageHtml } = await import('../ui/domains/index.mjs');
    return sendNative(getDomainsPageHtml(domain), 200, HTML_HEADERS);
  }

  // 8. Level 1A & Level 2: Keywords Dashboard (/keywords) & SERP Radar (/keywords/:slug)
  if (pathLower === '/keywords' || pathLower.startsWith('/keywords/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    const rawSlug = segments[1] || '';
    const slugLower = rawSlug.toLowerCase();

    if (rawSlug && RESERVED_KEYWORD_SLUGS.has(slugLower)) {
      if (slugLower === 'discovery') {
        if (method === 'HEAD') return sendNative(null, 200, HTML_HEADERS);
        const { getDiscoveryPageHtml } = await import('../ui/discovery/index.mjs');
        return sendNative(getDiscoveryPageHtml(), 200, HTML_HEADERS);
      }
      if (slugLower === 'folders') {
        if (method === 'HEAD') return sendNative(null, 200, HTML_HEADERS);
        const folderId = segments[2] || '';
        let cleanFolderId = folderId;
        try { cleanFolderId = decodeURIComponent(folderId); } catch (_) {}
        const { getCampaignFoldersPageHtml } = await import('../ui/folders/index.mjs');
        return sendNative(getCampaignFoldersPageHtml(cleanFolderId), 200, HTML_HEADERS);
      }
      if (slugLower === 'domains') {
        if (method === 'HEAD') return sendNative(null, 200, HTML_HEADERS);
        let domain = segments[2] || '';
        try { domain = decodeURIComponent(domain); } catch (_) {}
        const { getDomainsPageHtml } = await import('../ui/domains/index.mjs');
        return sendNative(getDomainsPageHtml(domain), 200, HTML_HEADERS);
      }
      if (slugLower === 'pulse' || slugLower === '24h') {
        if (method === 'HEAD') return sendNative(null, 200, HTML_HEADERS);
        const { getPulsePageHtml } = await import('../ui/pulse/index.mjs');
        return sendNative(getPulsePageHtml(''), 200, HTML_HEADERS);
      }
      if (slugLower === 'newborn') {
        if (method === 'HEAD') return sendNative(null, 200, HTML_HEADERS);
        const { getNewbornPageHtml } = await import('../ui/newborn/index.mjs');
        return sendNative(getNewbornPageHtml(''), 200, HTML_HEADERS);
      }
    }

    let slug = rawSlug;
    const queryParam = searchParams.get('q') || searchParams.get('keyword') || searchParams.get('slug');
    if (!slug && queryParam) {
      slug = queryParam.trim();
    }

    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }
    const { getKeywordsPageHtml } = await import('../ui/keywords/index.mjs');
    return sendNative(getKeywordsPageHtml(slug), 200, HTML_HEADERS);
  }

  // 9. Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme, /accounts)
  if (!pathLower.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      return methodNotAllowedResponse('GET, OPTIONS');
    }
    if (method === 'HEAD') {
      return sendNative(null, 200, HTML_HEADERS);
    }
    const { getDashboardHtml } = await import('../ui/dashboard/index.mjs');
    return sendNative(getDashboardHtml(), 200, HTML_HEADERS);
  }

  return null;
}
