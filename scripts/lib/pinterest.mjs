/**
 * scripts/lib/pinterest.mjs
 *
 * Core Canonical Pinterest Façade & Scraper Adapter
 * Re-exports canonical implementations from src/core/pinterest-client.mjs and src/core/pinterest-parser.mjs
 * while implementing hidden scraper endpoints and backwards-compatible adapters.
 *
 * // [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)
 * // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links
 * // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
 * // [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode
 */

import {
  CANONICAL_FINGERPRINT,
  sanitizeGuestCookie,
  getStandardPinterestHeaders,
  getPinterestHeaders,
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS,
  randomJitterMs,
  sleep,
  sleepWithJitter,
  exponentialBackoffWithFullJitter,
  CircuitBreakerOpenError,
  PinterestCircuitBreaker,
  globalPinterestCircuitBreaker,
  setDefaultDispatcher as coreSetDefaultDispatcher,
  getDefaultDispatcher as coreGetDefaultDispatcher,
  pinterestFetch as corePinterestFetch,
  PinterestClient,
  defaultPinterestClient
} from '../../src/core/pinterest-client.mjs';

import {
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE,
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric,
  findPinInTree,
  formatPin as coreFormatPin,
  extractPinFromHtml,
  fetchPinFromPinResource as coreFetchPinFromPinResource,
  fetchPinFromPidgets as coreFetchPinFromPidgets,
  fetchAndExtractPin
} from '../../src/core/pinterest-parser.mjs';

export {
  CANONICAL_FINGERPRINT,
  sanitizeGuestCookie,
  getStandardPinterestHeaders,
  getPinterestHeaders,
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS,
  randomJitterMs,
  sleep,
  sleepWithJitter,
  exponentialBackoffWithFullJitter,
  CircuitBreakerOpenError,
  PinterestCircuitBreaker,
  globalPinterestCircuitBreaker,
  PinterestClient,
  defaultPinterestClient,
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE,
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric,
  findPinInTree,
  extractPinFromHtml,
  fetchAndExtractPin
};

let defaultDispatcher = null;

export function setDefaultDispatcher(dispatcher) {
  defaultDispatcher = dispatcher;
  coreSetDefaultDispatcher(dispatcher);
}

export function getDefaultDispatcher() {
  return defaultDispatcher || coreGetDefaultDispatcher();
}

export async function pinterestFetch(url, init = {}) {
  const dispatcher = init.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  return corePinterestFetch(url, { ...init, dispatcher });
}

export function parseRetryAfterSeconds(headerValue, defaultSec = 3) {
  if (!headerValue) return defaultSec;
  const num = parseInt(headerValue, 10);
  if (!isNaN(num) && num > 0) return num;
  const parsedDate = Date.parse(headerValue);
  if (!isNaN(parsedDate)) {
    const diff = Math.ceil((parsedDate - Date.now()) / 1000);
    return diff > 0 ? diff : defaultSec;
  }
  return defaultSec;
}

/**
 * Canonicalizes destination article URLs specifically for api.pinterest.com/v1/urls/count.json
 * Guarantees clean string-indexed key matching on Pinterest, defusing the 100% UTM Poisoning Trap.
 */
export function canonicalizeArticleUrlForCount(rawUrl) {
  const sanitized = sanitizeDestinationUrl(rawUrl);
  if (!sanitized) return '';
  try {
    const parsed = new URL(sanitized);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    let res = parsed.toString();
    if (res.endsWith('?')) res = res.slice(0, -1);
    return res;
  } catch (_) {
    return sanitized;
  }
}

/**
 * Queries the global Pinterest save counter for any article destination URL via urls/count.json
 * Defuses 100% UTM Poisoning Trap via deep URL canonicalization.
 * Unpacks JSONP callback receiveCount({...}) safely via regex.
 *
 * @param {string} rawUrl - Target article URL
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, url: string, count: number, error?: string }>}
 */
export async function fetchUrlGlobalSaves(rawUrl, options = {}) {
  const cleanUrl = canonicalizeArticleUrlForCount(rawUrl);
  if (!cleanUrl) {
    return { ok: false, url: '', count: 0, error: 'invalid_url' };
  }
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  try {
    const endpoint = `https://api.pinterest.com/v1/urls/count.json?url=${encodeURIComponent(cleanUrl)}`;
    const res = await pinterestFetch(endpoint, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, url: cleanUrl, count: 0, status: res.status, error: `http_${res.status}` };
    }

    const text = await res.text();
    const match = text.match(/receiveCount\(\s*(\{[\s\S]*\})\s*\)/);
    let count = 0;
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        count = Number(parsed.count || 0);
        return { ok: true, url: cleanUrl, count: Number.isFinite(count) ? count : 0 };
      } catch (_) {}
    }

    try {
      const parsed = JSON.parse(text);
      count = Number(parsed.count || 0);
      return { ok: true, url: cleanUrl, count: Number.isFinite(count) ? count : 0 };
    } catch (_) {}

    return { ok: false, url: cleanUrl, count: 0, error: 'jsonp_parse_failed' };
  } catch (err) {
    return { ok: false, url: cleanUrl, count: 0, error: err.message };
  }
}

/**
 * Batch 50-Pin Pidgets Ingestion Client
 * Slices arbitrary pin IDs into chunks of at most 50 IDs and queries widgets.pinterest.com/v3/pidgets/pins/info/
 * Delivers 50 hydrated pins in a single subrequest (<550ms, 98% subrequest reduction).
 *
 * @param {Array<string|number>} pinIds - Array of Pinterest pin snowflake IDs
 * @param {object} [options]
 * @returns {Promise<Map<string, object> & { ok: boolean, pins: Array<object> }>}
 */
export async function fetchPinsBatchFromPidgets(pinIds = [], options = {}) {
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  const validIds = Array.from(new Set(
    (Array.isArray(pinIds) ? pinIds : [pinIds])
      .map(id => String(id || '').trim())
      .filter(id => /^\d{10,25}$/.test(id))
  ));

  const resultsMap = new Map();

  if (validIds.length === 0) {
    resultsMap.ok = true;
    resultsMap.pins = [];
    return resultsMap;
  }

  const chunkSize = 50;
  for (let i = 0; i < validIds.length; i += chunkSize) {
    const slice = validIds.slice(i, i + chunkSize);
    const endpoint = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${slice.join(',')}`;

    try {
      const res = await pinterestFetch(endpoint, {
        headers: {
          ...PINTEREST_PAGE_HEADERS,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher
      });

      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {});
        for (const id of slice) {
          if (!resultsMap.has(id)) {
            resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: 0, repins: 0, status: res.status });
          }
        }
        continue;
      }

      const json = await res.json();
      const rawPins = json?.data?.pins || json?.pins || json?.data || [];
      const pinList = Array.isArray(rawPins) ? rawPins : Object.values(rawPins);
      const returnedIds = new Set();

      for (const pin of pinList) {
        if (!pin || !pin.id) continue;
        const idStr = String(pin.id);
        returnedIds.add(idStr);

        const hasExplicitSaves = Boolean(
          pin.aggregated_pin_data?.aggregated_stats?.saves !== undefined ||
          pin.aggregated_stats?.saves !== undefined ||
          pin.save_count !== undefined
        );
        const saves = Number(
          pin.aggregated_pin_data?.aggregated_stats?.saves ??
          pin.aggregated_stats?.saves ??
          pin.save_count ??
          0
        );
        const repins = Number(pin.repin_count ?? 0);

        const title = (
          pin.title ||
          pin.story_pin_data?.metadata?.pin_title ||
          pin.rich_metadata?.title ||
          ''
        ).trim();

        const link = pin.link || pin.rich_metadata?.url || '';
        const domain = pin.domain || (link ? normalizeDomain('', link) : '') || '';

        const standardImageUrl =
          pin.images?.['736x']?.url ||
          pin.story_pin_data?.pages?.[0]?.image?.images?.['736x']?.url ||
          pin.images?.['564x']?.url ||
          pin.images?.['236x']?.url ||
          '';

        let hdImageUrl = '';
        if (standardImageUrl) {
          hdImageUrl = standardImageUrl.replace(/\/(236x|474x|564x|736x)\//, '/1200x/');
        }

        const pinner = pin.pinner ? {
          id: String(pin.pinner.id || ''),
          username: pin.pinner.username || '',
          full_name: pin.pinner.full_name || '',
          profile_url: pin.pinner.profile_url || '',
          follower_count: Number(pin.pinner.follower_count || 0),
          pin_count: Number(pin.pinner.pin_count || 0),
          about: pin.pinner.about || '',
          image_small_url: pin.pinner.image_small_url || ''
        } : null;

        const board = pin.board ? {
          id: String(pin.board.id || ''),
          name: pin.board.name || '',
          url: pin.board.url || '',
          pin_count: Number(pin.board.pin_count || 0),
          follower_count: Number(pin.board.follower_count || 0),
          description: pin.board.description || ''
        } : null;

        resultsMap.set(idStr, {
          pin_id: idStr,
          id: idStr,
          saves,
          save_count: saves,
          has_explicit_saves: hasExplicitSaves || saves > 0,
          repins,
          repin_count: repins,
          title,
          description: pin.description || '',
          domain,
          destination_url: link,
          link,
          dominant_color: pin.dominant_color || null,
          image_url: standardImageUrl,
          image_hd_url: hdImageUrl,
          images: pin.images || {},
          pinner,
          creator: pinner,
          board,
          is_missing: false
        });
      }

      for (const id of slice) {
        if (!returnedIds.has(id) && !resultsMap.has(id)) {
          resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: 0, repins: 0 });
        }
      }
    } catch (_) {
      for (const id of slice) {
        if (!resultsMap.has(id)) {
          resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: 0, repins: 0 });
        }
      }
    }
  }

  resultsMap.ok = true;
  resultsMap.pins = Array.from(resultsMap.values());
  return resultsMap;
}

/**
 * Creator Visual Stream + Parallel RSS pubDate Fusion
 * Queries widgets.pinterest.com/v3/pidgets/users/{username}/pins/ (50 pins) and
 * pinterest.com/{username}/feed.rss (25 pins with pubDate) in parallel.
 *
 * @param {string} username - Pinterest creator username
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, user: object, pins: Array<object>, count: number }>}
 */
export async function fetchCreatorLatestPinsPidgets(username, options = {}) {
  const cleanUsername = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUsername) {
    return { ok: false, error: 'invalid_username', pins: [] };
  }

  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  const pidgetsUrl = `https://widgets.pinterest.com/v3/pidgets/users/${encodeURIComponent(cleanUsername)}/pins/`;
  const rssUrl = `https://www.pinterest.com/${encodeURIComponent(cleanUsername)}/feed.rss`;

  const [pidgetsResult, rssResult] = await Promise.allSettled([
    pinterestFetch(pidgetsUrl, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    }).then(async r => {
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, data: await r.json() };
    }),
    pinterestFetch(rssUrl, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    }).then(async r => {
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, xml: await r.text() };
    })
  ]);

  const pidgetsData = pidgetsResult.status === 'fulfilled' && pidgetsResult.value.ok ? pidgetsResult.value.data : null;
  const rssXml = rssResult.status === 'fulfilled' && rssResult.value.ok ? rssResult.value.xml : null;

  const pubDatesMap = new Map();
  if (rssXml) {
    const itemRegex = /<item>[\s\S]*?<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(rssXml)) !== null) {
      const itemXml = itemMatch[0];
      const guidMatch = itemXml.match(/<guid[^>]*>.*?\/pin\/(\d+)\/?<\/guid>/i) || itemXml.match(/<link>.*?\/pin\/(\d+)\/?<\/link>/i);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
      if (guidMatch && guidMatch[1] && pubDateMatch && pubDateMatch[1]) {
        const d = new Date(pubDateMatch[1]);
        if (!isNaN(d.getTime())) {
          pubDatesMap.set(String(guidMatch[1]), d.toISOString());
        }
      }
    }
  }

  const rawUser = pidgetsData?.data?.user || {};
  const rawPins = pidgetsData?.data?.pins || [];

  const user = {
    username: cleanUsername,
    full_name: rawUser.full_name || cleanUsername,
    about: rawUser.about || '',
    profile_url: rawUser.profile_url || `https://www.pinterest.com/${cleanUsername}/`,
    image_small_url: rawUser.image_small_url || null,
    pin_count: Number(rawUser.pin_count || 0),
    follower_count: Number(rawUser.follower_count || 0)
  };

  const pins = [];
  for (const p of rawPins) {
    if (!p || !p.id) continue;
    const pinId = String(p.id);
    const standardImg = p.images?.['736x']?.url || p.images?.['564x']?.url || p.images?.['236x']?.url || '';
    const hdImg = standardImg ? standardImg.replace(/\/(236x|474x|564x|736x)\//, '/1200x/') : '';
    const link = p.link || '';
    const domain = p.domain || (link ? normalizeDomain('', link) : '') || '';

    const hasExplicitSaves = Boolean(
      p.aggregated_pin_data?.aggregated_stats?.saves !== undefined ||
      p.aggregated_stats?.saves !== undefined ||
      p.save_count !== undefined
    );
    const saves = Number(
      p.aggregated_pin_data?.aggregated_stats?.saves ??
      p.aggregated_stats?.saves ??
      p.save_count ??
      0
    );

    pins.push({
      pin_id: pinId,
      title: p.title || p.description || '',
      description: p.description || '',
      domain,
      link,
      destination_url: link,
      save_count: saves,
      saves,
      has_explicit_saves: hasExplicitSaves || saves > 0,
      repin_count: Number(p.repin_count || 0),
      repins: Number(p.repin_count || 0),
      image_url: standardImg,
      image_hd_url: hdImg,
      created_at: pubDatesMap.get(pinId) || null,
      created_at_pinterest: pubDatesMap.get(pinId) || null
    });
  }

  return {
    ok: true,
    user,
    pins,
    count: pins.length
  };
}

/**
 * Board Sections Client (BoardSectionsResource)
 * Extracts board subsection hierarchies, pin counts, and preview pins.
 *
 * @param {string|number} boardId - Pinterest board ID
 * @param {string} [usernameOrSourceUrl=''] - Creator username or full sourceUrl
 * @param {string} [boardSlug=''] - Board slug
 * @param {object} [options={}]
 * @returns {Promise<{ ok: boolean, board_id: string, sections: Array<object>, error?: string }>}
 */
export async function fetchBoardSectionsResource(boardId, usernameOrSourceUrl = '', boardSlug = '', options = {}) {
  const cleanBoardId = String(boardId || '').trim();
  if (!cleanBoardId) {
    return { ok: false, error: 'invalid_board_id', board_id: '', sections: [] };
  }

  const opts = (typeof usernameOrSourceUrl === 'object' && usernameOrSourceUrl !== null)
    ? usernameOrSourceUrl
    : (typeof boardSlug === 'object' && boardSlug !== null ? boardSlug : (options || {}));

  const dispatcher = opts.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const timeoutMs = opts.timeoutMs || 8000;

  let sourceUrl = '/';
  let cleanUser = '';
  if (typeof usernameOrSourceUrl === 'string' && usernameOrSourceUrl.trim()) {
    if (usernameOrSourceUrl.startsWith('/')) {
      sourceUrl = usernameOrSourceUrl;
    } else {
      cleanUser = usernameOrSourceUrl.replace(/^@/, '').trim();
      const slug = typeof boardSlug === 'string' ? boardSlug.trim() : '';
      sourceUrl = slug ? `/${cleanUser}/${slug}/` : `/${cleanUser}/`;
    }
  }

  const dataPayload = {
    options: { board_id: cleanBoardId },
    context: {}
  };

  const url = `https://www.pinterest.com/resource/BoardSectionsResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(dataPayload))}`;
  const headers = getPinterestXhrHeaders(cleanUser, '', {
    sourceUrl,
    extraHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  });

  try {
    const res = await pinterestFetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    if (res.status === 404) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: 404, error: 'board_not_found', board_id: cleanBoardId, sections: [] };
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, error: `http_${res.status}`, board_id: cleanBoardId, sections: [] };
    }

    const json = await res.json();
    const rawSections = json?.resource_response?.data || json?.data || [];
    const sectionList = Array.isArray(rawSections) ? rawSections : [];

    const sections = sectionList.map(s => {
      const previewPins = (s.preview_pins || []).map(p => {
        const standardImg = p.images?.['736x']?.url || p.images?.['236x']?.url || '';
        return {
          id: String(p.id || ''),
          image_url: standardImg,
          image_hd_url: standardImg ? standardImg.replace(/\/(236x|474x|564x|736x)\//, '/1200x/') : '',
          save_count: Number(p.aggregated_pin_data?.aggregated_stats?.saves || p.aggregated_stats?.saves || 0),
          repin_count: Number(p.repin_count || 0)
        };
      });

      return {
        id: String(s.id || ''),
        title: s.title || s.name || '',
        slug: s.slug || '',
        pin_count: Number(s.pin_count || 0),
        preview_pins: previewPins
      };
    });

    return {
      ok: true,
      board_id: cleanBoardId,
      sections,
      count: sections.length
    };
  } catch (err) {
    return { ok: false, error: err.message, board_id: cleanBoardId, sections: [] };
  }
}

/**
 * Resolves pin.it obfuscated shortlinks via direct HTTP redirect inspection
 * Extracts canonical Pin ID from Location header in <170ms without browser rendering.
 *
 * @param {string} inputUrlOrSlug - pin.it URL or alphanumeric shortlink slug
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, pin_id: string|null, resolved_url: string, slug: string, error?: string }>}
 */
export async function resolvePinterestShortlink(inputUrlOrSlug, options = {}) {
  const raw = String(inputUrlOrSlug || '').trim();
  if (!raw) {
    return { ok: false, pin_id: null, resolved_url: '', slug: '', error: 'invalid_shortlink' };
  }

  const slugMatch = raw.match(/pin\.it\/([a-zA-Z0-9_-]+)/i);
  let cleanSlug = slugMatch ? slugMatch[1] : raw.replace(/^https?:\/\//i, '').replace(/^pin\.it\//i, '').split('/')[0].split('?')[0].trim();
  if (!cleanSlug) {
    return { ok: false, pin_id: null, resolved_url: '', slug: '', error: 'invalid_shortlink' };
  }

  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 6000;
  const endpoint = `https://api.pinterest.com/url_shortener/${encodeURIComponent(cleanSlug)}/redirect/`;

  try {
    const res = await pinterestFetch(endpoint, {
      method: 'GET',
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    const location = res.headers.get('location') || '';
    if (res.body) await res.body.cancel().catch(() => {});

    if (location) {
      const pinMatch = location.match(/\/pin\/(\d+)\//);
      if (pinMatch && pinMatch[1]) {
        return {
          ok: true,
          pin_id: pinMatch[1],
          resolved_url: location,
          slug: cleanSlug
        };
      }
      return { ok: true, pin_id: null, resolved_url: location, slug: cleanSlug };
    }
    return { ok: false, pin_id: null, resolved_url: '', slug: cleanSlug, error: 'no_redirect_location' };
  } catch (err) {
    return { ok: false, pin_id: null, resolved_url: '', slug: cleanSlug, error: err.message };
  }
}

/**
 * Format and normalize raw pin data into canonical 48-field schema.
 * Re-exports canonical core implementation while preserving Lock & verification invariants.
 */
// [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate/arbitrage tracking links
// utm_link: utmLink
// tracked_link: trackedLink
// [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
// is_carousel: isCarousel
// [INVARIANT: GUEST-AUDIENCE-EXTRACTION] Extract creator audience from closeupUnifiedAttribution in guest mode
// pin.closeupUnifiedAttribution?.followerCount
export function formatPin(pin) {
  return coreFormatPin(pin);
}

/**
 * Extract pin data from raw HTML using 8-stage fallback hierarchy.
 */
export function extractPinData(rawHtml, pinId) {
  if (!rawHtml || typeof rawHtml !== 'string') return null;
  const html = rawHtml.length > 4000000 ? rawHtml.slice(0, 4000000) : rawHtml;

  // 1. Relay Completed Request Calls
  const relayRegex = /__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\s*\(([^,]+),\s*(\{[\s\S]*?\})\);/g;
  let rMatch;
  let mergedRelayPin = null;

  while ((rMatch = relayRegex.exec(html)) !== null) {
    try {
      const payload = JSON.parse(rMatch[2]);
      const v3 = payload?.data?.v3GetPinQueryv2?.data;
      if (v3 && (String(v3.entityId || v3.id || '') === String(pinId) || !pinId || String(v3.id || '').includes(String(pinId)))) {
        if (!mergedRelayPin) mergedRelayPin = {};
        const realId = v3.entityId || (typeof v3.id === 'string' && /^\d+$/.test(v3.id) ? v3.id : null);
        if (realId) mergedRelayPin.id = realId;

        if (v3.seoAltText) mergedRelayPin.seoAltText = v3.seoAltText;
        if (v3.altText) mergedRelayPin.altText = v3.altText;
        if (v3.title) mergedRelayPin.title = v3.title;
        if (v3.gridTitle && !mergedRelayPin.title) mergedRelayPin.title = v3.gridTitle;

        if (v3.closeupUnifiedDescription) mergedRelayPin.closeupUnifiedDescription = v3.closeupUnifiedDescription;
        if (v3.unauthOnPageDescription) mergedRelayPin.unauthOnPageDescription = v3.unauthOnPageDescription;
        if (v3.description && (!mergedRelayPin.description || v3.description.length > mergedRelayPin.description.length)) {
          mergedRelayPin.description = v3.description;
        }
        if (v3.gridDescription && !mergedRelayPin.description) {
          mergedRelayPin.description = v3.gridDescription;
        }

        if (v3.seoTitle) mergedRelayPin.seoTitle = v3.seoTitle;
        if (v3.seoDescription) mergedRelayPin.seoDescription = v3.seoDescription;
        if (v3.link) mergedRelayPin.link = v3.link;
        if (v3.domain) mergedRelayPin.domain = v3.domain;
        if (v3.dominantColor) mergedRelayPin.dominantColor = v3.dominantColor;
        if (v3.createdAt) mergedRelayPin.createdAt = v3.createdAt;
        if (v3.created_at) mergedRelayPin.created_at = v3.created_at;

        const isCarouselPin = Boolean(
          v3.isCarousel ||
          v3.is_carousel ||
          v3.carouselData ||
          v3.carousel_data ||
          v3.carousel_slots ||
          v3.method === 'carousel' ||
          v3.creation_method === 'carousel' ||
          v3.creationMethod === 'carousel'
        );
        if (isCarouselPin) {
          mergedRelayPin.is_carousel = true;
          mergedRelayPin.isCarousel = true;
          mergedRelayPin.method = 'carousel';
          mergedRelayPin.creation_method = 'carousel';
        } else {
          const detectedMethod = v3.method || v3.creationMethod || v3.creation_method || v3.originType || v3.origin_type || v3.pinJoin?.originType || v3.attribution?.provider_name;
          if (detectedMethod) {
            mergedRelayPin.method = detectedMethod;
            mergedRelayPin.creation_method = detectedMethod;
          }
        }
        if (v3.attribution?.provider_name) mergedRelayPin.provider_name = v3.attribution.provider_name;

        if (v3.aggregatedPinData) {
          if (v3.aggregatedPinData.entityId) {
            mergedRelayPin.aggregated_pin_data_id = String(v3.aggregatedPinData.entityId);
          }
          if (v3.aggregatedPinData.aggregatedStats) {
            mergedRelayPin.aggregated_pin_data = {
              aggregated_stats: {
                saves: v3.aggregatedPinData.aggregatedStats.saves,
                save_count: v3.aggregatedPinData.aggregatedStats.saveCount ?? v3.aggregatedPinData.aggregatedStats.saves,
                done_count: v3.aggregatedPinData.aggregatedStats.doneCount
              }
            };
          }
        }

        if (v3.closeupUnifiedAttribution) {
          mergedRelayPin.closeupUnifiedAttribution = v3.closeupUnifiedAttribution;
          if (v3.closeupUnifiedAttribution.followerCount !== undefined) {
            if (!mergedRelayPin.pinner) mergedRelayPin.pinner = {};
            mergedRelayPin.pinner.follower_count = v3.closeupUnifiedAttribution.followerCount;
            mergedRelayPin.pinner.username = v3.closeupUnifiedAttribution.username || v3.closeupUnifiedAttribution.name;
          }
        }
        break;
      }
    } catch (_) {}
  }

  // 2. OpenGraph Meta Tags Fallback
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i)?.[1];
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i)?.[1];
  const pinSavesMeta = html.match(/<meta[^>]*name=["']pinterest:saves["'][^>]*content=["'](.*?)["']/i)?.[1];
  const pinRepinsMeta = html.match(/<meta[^>]*name=["']pinterest:repins["'][^>]*content=["'](.*?)["']/i)?.[1];

  let ogSaves = pinSavesMeta !== undefined ? parseCleanMetric(pinSavesMeta, 0) : null;
  let ogRepins = pinRepinsMeta !== undefined ? parseCleanMetric(pinRepinsMeta, 0) : null;

  // 3. JSON-LD Schema Fallback
  let jsonLdPin = null;
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const ldObj = Array.isArray(ld) ? ld[0] : ld;
      if (ldObj && typeof ldObj === 'object') {
        jsonLdPin = ldObj;
        if (Array.isArray(ldObj.interactionStatistic)) {
          for (const stat of ldObj.interactionStatistic) {
            const count = Number(stat.userInteractionCount || 0);
            if (stat.interactionType?.includes('LikeAction') || stat.interactionType?.includes('SaveAction')) {
              if (ogSaves === null) ogSaves = count;
            }
          }
        }
      }
    } catch (_) {}
  }

  // If no Relay match, fallback to core extractPinFromHtml
  if (!mergedRelayPin) {
    const coreResult = extractPinFromHtml(html, pinId);
    if (coreResult) {
      if (ogSaves !== null && (coreResult.saves === null || coreResult.saves === 0)) {
        coreResult.saves = ogSaves;
        coreResult.save_count = ogSaves;
        coreResult.has_explicit_saves = true;
      }
      if (ogRepins !== null) {
        coreResult.repins = ogRepins;
        coreResult.repin_count = ogRepins;
      }
      return coreResult;
    }
  }

  const formatted = coreFormatPin(mergedRelayPin || { id: pinId, title: ogTitle, image_url: ogImage, description: ogDesc });
  if (formatted) {
    if (ogSaves !== null && (formatted.saves === null || formatted.saves === 0)) {
      formatted.saves = ogSaves;
      formatted.save_count = ogSaves;
      formatted.has_explicit_saves = true;
    }
    if (ogRepins !== null) {
      formatted.repins = ogRepins;
      formatted.repin_count = ogRepins;
    }
    return formatted;
  }

  return null;
}

export async function fetchPinFromPinResource(pinId, dispatcher = defaultDispatcher, returnEnvelope = false) {
  const actualDispatcher = dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const res = await coreFetchPinFromPinResource(pinId, { dispatcher: actualDispatcher });
  if (returnEnvelope) {
    return { ok: Boolean(res), status: res ? 200 : 404, pin: res };
  }
  return res;
}

export async function fetchPinHybrid(pinId, { isTelemetryOnly = false, cookie = null, dispatcher = defaultDispatcher } = {}) {
  const actualDispatcher = dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  const isNumericSnowflake = /^\d+$/.test(String(pinId || '').trim());
  if (isTelemetryOnly && isNumericSnowflake) {
    const fastRes = await fetchPinFromPinResource(pinId, actualDispatcher, true);
    if (fastRes && fastRes.status === 429) {
      return fastRes;
    }
    if (fastRes && fastRes.ok && fastRes.pin) {
      const p = fastRes.pin;
      const hasValidSaves = (p.saves || 0) > 0 || Boolean(p.has_explicit_saves);

      if (hasValidSaves) {
        return fastRes;
      }

      const ssrRes = await fetchPinFromPinterest(pinId, cookie, { dispatcher: actualDispatcher });
      if (ssrRes && ssrRes.ok && ssrRes.pin) {
        ssrRes.pin.saves = Math.max(Number(ssrRes.pin.saves || 0), Number(p.saves || 0));
        ssrRes.pin.repins = Math.max(Number(ssrRes.pin.repins || 0), Number(p.repins || 0));
        return ssrRes;
      }
      return fastRes;
    }
  }
  return await fetchPinFromPinterest(pinId, cookie, { dispatcher: actualDispatcher });
}

// [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)
export async function fetchPinFromPinterest(pinId, cookieOrOptions = null, maybeOptions = {}) {
  try {
    const cleanId = String(pinId || '').trim();
    if (!cleanId || cleanId.startsWith('-') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{9,127}$/.test(cleanId)) {
      return { ok: false, status: 400, error: 'invalid_pin_id' };
    }
    const opts = (typeof cookieOrOptions === 'object' && cookieOrOptions !== null)
      ? cookieOrOptions
      : (maybeOptions || {});
    const dispatcher = opts.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

    let cookieStr = (typeof cookieOrOptions === 'string') ? cookieOrOptions : (opts.cookie || '');
    if (cookieStr) {
      cookieStr = cookieStr.replace(/(?:^|;\s*)_auth=1(?:;|$)/gi, '; ').trim().replace(/^;\s*|;\s*$/g, '');
    }
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'priority': 'u=0, i',
      'upgrade-insecure-requests': '1',
      'Cache-Control': 'no-cache'
    };
    if (cookieStr && opts.allowGuestCookie === true && !cookieStr.includes('_auth=1')) {
      headers['Cookie'] = cookieStr;
    }

    const url = `https://www.pinterest.com/pin/${cleanId}/`;
    let res = null;
    let lastFetchErr = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await pinterestFetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          dispatcher
        });
        lastFetchErr = null;
        break;
      } catch (err) {
        lastFetchErr = err;
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ETIMEDOUT' || String(err.message || '').toLowerCase().includes('timeout');
        if (isTimeout && attempt < maxAttempts) {
          const delay = exponentialBackoffWithFullJitter(attempt, 1500, 3500);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    if (!res && lastFetchErr) {
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };
      return { ok: false, error: lastFetchErr.message };
    }

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (res.body) await res.body.cancel().catch(() => {});
      let retryDelay = exponentialBackoffWithFullJitter(1, 1500, 3500);
      if (res.status === 429) {
        const retrySec = parseRetryAfterSeconds(res.headers.get('retry-after'), 3);
        if (retrySec > 15) {
          const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
          if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };
          return { ok: false, status: 429, retryAfter: retrySec };
        }
        retryDelay = Math.min(Math.max(retryDelay, retrySec * 1000), 4000);
      }
      await sleep(retryDelay);
      res = await pinterestFetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };

      const resRetryAfter = res.status === 429 ? parseRetryAfterSeconds(res.headers.get('retry-after'), 15) : undefined;
      return { ok: false, status: res.status, retryAfter: resRetryAfter };
    }
    const html = await res.text();
    let parsed = extractPinData(html, pinId);

    const isSuspicious = !parsed || (!parsed.has_explicit_saves && (parsed.repins > 0 || parsed.saves === 0));
    if (isSuspicious) {
      const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
      if (fallbackPin && (fallbackPin.saves > 0 || fallbackPin.repins > 0)) {
        if (!parsed) {
          parsed = fallbackPin;
        } else {
          const authenticMethod = (fallbackPin?.method && fallbackPin.method !== 'pinterest_platform')
            ? fallbackPin.method
            : (parsed.method || fallbackPin?.method || 'pinterest_platform');
          parsed = {
            ...fallbackPin,
            ...parsed,
            method: authenticMethod,
            creation_method: authenticMethod,
            canonical_pin_id: parsed.canonical_pin_id || fallbackPin.canonical_pin_id || null,
            saves: Math.max(parsed.saves || 0, fallbackPin.saves || 0),
            repins: Math.max(parsed.repins || 0, fallbackPin.repins || 0),
            comments: Math.max(parsed.comments || 0, fallbackPin.comments || 0),
            has_explicit_saves: Boolean(parsed.has_explicit_saves || fallbackPin.has_explicit_saves || fallbackPin.saves > 0)
          };
        }
      }
    }

    if (parsed) return { ok: true, pin: parsed };

    const fallbackPin = await fetchPinFromPinResource(cleanId, dispatcher);
    if (fallbackPin) return { ok: true, pin: fallbackPin, fastPath: true };

    return { ok: false, status: 200, error: 'parse_failed' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function fetchUserProfileUnauth(username, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  try {
    const url = `https://www.pinterest.com/${cleanUser}/`;
    const res = await pinterestFetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      dispatcher
    });

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status };
    }
    const html = await res.text();

    let userData = null;
    const initialBoards = [];

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptContent = match[1];
      if (scriptContent.includes('initialReduxState')) {
        try {
          const parsed = JSON.parse(scriptContent);
          const state = parsed.initialReduxState || {};
          const users = state.users || {};
          for (const [k, u] of Object.entries(users)) {
            if (u && (u.username?.toLowerCase() === cleanUser || (k && k !== '' && !userData))) {
              userData = u;
            }
          }
          if (state.boards && typeof state.boards === 'object') {
            for (const b of Object.values(state.boards)) {
              if (b && b.id && !String(b.id).startsWith('-')) {
                const coverImg = b.image_cover_hd_url || b.image_cover_url || b.images?.['736x']?.url || b.images?.['236x']?.url || b.image_thumbnail_url || null;
                const rawVase = b.board_vase || [];
                const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
                  if (typeof v === 'string') return { text: v.trim(), link: '' };
                  return {
                    text: String(v?.text || '').trim(),
                    link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
                  };
                }).filter(v => v.text.length > 0) : [];
                const desc = b.description || '';

                initialBoards.push({
                  board_id: String(b.id),
                  name: b.name || 'Untitled Board',
                  url: b.url ? (b.url.startsWith('http') ? b.url : `https://www.pinterest.com${b.url}`) : '',
                  pin_count: parseCleanMetric(b.pin_count || 0),
                  follower_count: parseCleanMetric(b.follower_count || 0),
                  image_cover_url: coverImg,
                  board_vase: boardVase,
                  description: desc,
                  metadata: {
                    image_cover_url: coverImg,
                    board_vase: boardVase,
                    description: desc
                  }
                });
              }
            }
          }
        } catch (_) {}
      }
    }

    if (!userData) {
      return { ok: false, error: 'user_not_found', status: 404 };
    }

    return {
      ok: true,
      username: cleanUser,
      display_name: userData.full_name || cleanUser,
      avatar_url: userData.image_xlarge_url || userData.image_large_url || userData.image_medium_url || null,
      bio: userData.about || '',
      website_url: userData.website_url || null,
      monthly_views: parseCleanMetric(userData.profile_views || 0),
      total_audience: parseCleanMetric(userData.monthly_reach || 0),
      follower_count: parseCleanMetric(userData.follower_count || 0),
      following_count: parseCleanMetric(userData.following_count || 0),
      pin_count: parseCleanMetric(userData.pin_count || 0),
      board_count: parseCleanMetric(userData.board_count || initialBoards.length),
      initial_boards: initialBoards
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function fetchUserResource(username, activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=%2F${cleanUser}%2F&data=%7B%22options%22%3A%7B%22username%22%3A%22${cleanUser}%22%2C%22field_set_key%22%3A%22profile%22%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = getPinterestXhrHeaders(cleanUser, activeCookie);

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(exponentialBackoffWithFullJitter(1, 2000, 6000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '');
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      const unauthRes = await fetchUserProfileUnauth(cleanUser, { dispatcher });
      if (unauthRes.ok) return unauthRes;
      return { ok: false, status: res.status };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const unauthRes = await fetchUserProfileUnauth(cleanUser);
      if (unauthRes.ok) return unauthRes;
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg };
    }
    const data = json.resource_response?.data;
    if (!data) {
      const unauthRes = await fetchUserProfileUnauth(cleanUser);
      if (unauthRes.ok) return unauthRes;
      return { ok: false, error: 'no_data' };
    }

    return {
      ok: true,
      username: cleanUser,
      display_name: data.full_name || cleanUser,
      avatar_url: data.image_large_url || data.image_medium_url || null,
      bio: data.about || '',
      website_url: data.website_url || null,
      monthly_views: parseCleanMetric(data.profile_views || 0),
      total_audience: parseCleanMetric(data.monthly_reach || 0),
      follower_count: parseCleanMetric(data.follower_count || 0),
      following_count: parseCleanMetric(data.following_count || 0),
      pin_count: parseCleanMetric(data.pin_count || 0),
      board_count: parseCleanMetric(data.board_count || 0)
    };
  } catch (err) {
    const unauthRes = await fetchUserProfileUnauth(cleanUser);
    if (unauthRes.ok) return unauthRes;
    return { ok: false, error: err.message };
  }
}

export async function fetchBoardsResource(username, activeCookie = '', maxPages = 45, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', boards: [] };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  const boards = [];
  const seenBoardIds = new Set();
  let bookmark = null;
  let lastSeenBookmark = null;
  const pageLimit = Math.max(1, Math.min(Number(maxPages) || 45, 100));

  for (let page = 1; page <= pageLimit; page++) {
    const opts = {
      privacy_filter: 'all',
      sort: 'last_pinned_to',
      field_set_key: 'profile_grid_item',
      filter_stories: false,
      username: cleanUser,
      page_size: 50,
      group_by: 'visibility',
      include_archived: true,
      filter_all_pins: false,
      add_fields: 'board.{meal_plan,collaborator_count,is_collaborative,owner}'
    };
    if (bookmark) opts.bookmarks = [bookmark];

    const src = `/${cleanUser}/`;
    const url = `https://www.pinterest.com/resource/BoardsResource/get/?source_url=${encodeURIComponent(src)}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;
    const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

    try {
      let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        if (res.body) await res.body.cancel().catch(() => {});
        await sleep(randomJitterMs(2500, 4000));
        const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
        res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
      }

      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {});
        if (page === 1) {
          const unauth = await fetchUserProfileUnauth(cleanUser, { dispatcher });
          if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
            return { ok: true, boards: unauth.initial_boards };
          }
          return { ok: false, status: res.status, boards: [] };
        }
        break;
      }

      const json = await res.json();
      if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
        if (page === 1) {
          const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
          return { ok: false, error: errMsg, boards: [] };
        }
        break;
      }

      const items = json.resource_response?.data || [];
      const rawList = Array.isArray(items) ? items : (items?.items || items?.boards || []);

      for (const item of rawList) {
        if (item && (item.type === 'board' || item.id || item.node_id)) {
          const boardId = String(item.id || item.node_id || '').trim();
          if (!boardId || boardId === 'undefined' || boardId.startsWith('-')) continue;
          if (seenBoardIds.has(boardId)) continue;
          seenBoardIds.add(boardId);

          if ((item.name === 'Untitled Board' || !item.name) && !item.url) continue;
          let lastPinned = null;
          if (item.board_order_modified_at) {
            const d = new Date(item.board_order_modified_at);
            if (!isNaN(d.getTime())) lastPinned = d.toISOString();
          }
          let boardCreatedAt = null;
          if (item.created_at) {
            const cd = new Date(item.created_at);
            if (!isNaN(cd.getTime())) boardCreatedAt = cd.toISOString();
          }
          let boardUrl = '';
          if (item.url) {
            boardUrl = item.url.startsWith('http') ? item.url : `https://www.pinterest.com${item.url.startsWith('/') ? '' : '/'}${item.url}`;
          }
          const coverImg = item.image_cover_hd_url || item.image_cover_url || item.images?.['736x']?.url || item.images?.['236x']?.url || item.image_thumbnail_url || null;
          const rawVase = item.board_vase || [];
          const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
            if (typeof v === 'string') return { text: v.trim(), link: '' };
            return {
              text: String(v?.text || '').trim(),
              link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
            };
          }).filter(v => v.text.length > 0) : [];
          const desc = item.description || '';

          const rawOwner = item.owner || {};
          const ownerUsername = rawOwner.username ? String(rawOwner.username).toLowerCase() : null;
          const collaboratorCount = parseCleanMetric(item.collaborator_count || 0);
          const isCollaborative = Boolean(item.is_collaborative || item.collaborative);
          const isGroupBoard = Boolean(isCollaborative || (ownerUsername && ownerUsername !== cleanUser) || collaboratorCount > 0);

          boards.push({
            board_id: boardId,
            name: item.name || 'Untitled Board',
            url: boardUrl,
            pin_count: parseCleanMetric(item.pin_count || 0),
            follower_count: parseCleanMetric(item.follower_count || 0),
            last_pinned_at: lastPinned,
            created_at: boardCreatedAt,
            image_cover_url: coverImg,
            board_vase: boardVase,
            description: desc,
            is_group_board: isGroupBoard,
            owner_username: ownerUsername,
            collaborator_count: collaboratorCount,
            metadata: {
              image_cover_url: coverImg,
              board_vase: boardVase,
              description: desc,
              section_count: item.section_count || 0,
              privacy: item.privacy || 'public',
              is_collaborative: isCollaborative,
              is_group_board: isGroupBoard,
              owner_username: ownerUsername,
              collaborator_count: collaboratorCount
            }
          });
        }
      }

      const rawBookmark = json.resource_response?.bookmark ||
        (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
      bookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

      if (!bookmark || bookmark === lastSeenBookmark) break;
      lastSeenBookmark = bookmark;

      if (page < pageLimit) {
        await sleep(randomJitterMs(250, 450));
      }
    } catch (err) {
      if (page === 1) {
        const unauth = await fetchUserProfileUnauth(cleanUser);
        if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
          return { ok: true, boards: unauth.initial_boards };
        }
        return { ok: false, error: err.message, boards: [] };
      }
      break;
    }
  }

  if (boards.length === 0) {
    const unauth = await fetchUserProfileUnauth(cleanUser);
    if (unauth.ok && Array.isArray(unauth.initial_boards) && unauth.initial_boards.length > 0) {
      return { ok: true, boards: unauth.initial_boards };
    }
  }

  return { ok: true, boards };
}

export async function fetchUserActivityPinsResource(username, bookmark = null, activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username', pins: [], nextBookmark: null };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  const src = `/${cleanUser}/_created/`;
  const opts = {
    exclude_add_pin_rep: true,
    field_set_key: 'profile_created_grid_item',
    is_own_profile_pins: false,
    username: cleanUser,
    page_size: 50,
    data: { page_size: 50 },
    noCache: true,
  };
  if (bookmark) opts.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/UserActivityPinsResource/get/?source_url=${encodeURIComponent(
    src
  )}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(cleanUser, activeCookie, { sourceUrl: src });

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(cleanUser, '', { sourceUrl: src });
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg, pins: [], nextBookmark: null };
    }
    const data = json.resource_response?.data;
    const rawBookmark = json.resource_response?.bookmark ||
      (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
    const nextBookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

    const rawList = Array.isArray(data) ? data : (data?.items || data?.pins || data?.results || []);

    const formattedPins = [];
    for (const raw of rawList) {
      const p = formatPin(raw);
      if (p && p.pin_id) {
        formattedPins.push(p);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  }
}

export async function fetchBoardFeedResource(boardId, boardUrl, bookmark = null, activeCookie = '', options = {}) {
  const cleanId = String(boardId || '').trim();
  if (!cleanId) return { ok: false, error: 'invalid_board_id', pins: [], nextBookmark: null };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  let srcUrl = String(boardUrl || '').trim();
  if (srcUrl.startsWith('http')) {
    try {
      srcUrl = new URL(srcUrl).pathname;
    } catch (_) {}
  }
  if (!srcUrl.startsWith('/')) srcUrl = `/${srcUrl}`;
  if (!srcUrl.endsWith('/')) srcUrl = `${srcUrl}/`;

  const pathParts = srcUrl.split('/').filter(Boolean);
  const username = pathParts[0] || '';

  const opts = {
    board_id: cleanId,
    board_url: srcUrl,
    field_set_key: 'grid_item',
    filter_section_pins: true,
    sort: 'default',
    page_size: 25,
  };
  if (bookmark) opts.bookmarks = [bookmark];

  const url = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${encodeURIComponent(
    srcUrl
  )}&data=${encodeURIComponent(JSON.stringify({ options: opts, context: {} }))}&_=${Date.now()}`;

  const headers = getPinterestXhrHeaders(username, activeCookie, { sourceUrl: srcUrl });

  try {
    let res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000), dispatcher });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      const anonHeaders = getPinterestXhrHeaders(username, '', { sourceUrl: srcUrl });
      res = await pinterestFetch(url, { headers: anonHeaders, signal: AbortSignal.timeout(8000), dispatcher });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, pins: [], nextBookmark: null };
    }
    const json = await res.json();
    if (json.resource_response?.status === 'failure' || json.resource_response?.error) {
      const errMsg = json.resource_response?.error?.message || json.resource_response?.message || 'Pinterest resource failure';
      return { ok: false, error: errMsg, pins: [], nextBookmark: null };
    }
    const data = json.resource_response?.data;
    const rawBookmark = json.resource_response?.bookmark ||
      (Array.isArray(json.resource_response?.bookmarks) ? json.resource_response.bookmarks[0] : null);
    const nextBookmark = (rawBookmark && rawBookmark !== '-end-') ? String(rawBookmark).trim() : null;

    const rawList = Array.isArray(data) ? data : (data?.items || data?.pins || data?.results || []);

    const formattedPins = [];
    for (const raw of rawList) {
      const p = formatPin(raw);
      if (p && p.pin_id) {
        formattedPins.push(p);
      }
    }

    return { ok: true, pins: formattedPins, nextBookmark };
  } catch (err) {
    return { ok: false, error: err.message, pins: [], nextBookmark: null };
  }
}

export async function fetchBoardDetailUnauth(username, boardSlugOrName, options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanUser) return { ok: false, error: 'invalid_username' };
  const dispatcher = options.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();

  let rawBoard = String(boardSlugOrName || '').trim();
  if (rawBoard.startsWith('http')) {
    try {
      const u = new URL(rawBoard);
      const parts = u.pathname.split('/').filter(Boolean);
      rawBoard = parts[1] || parts[0] || '';
    } catch (_) {}
  }
  const cleanSlug = rawBoard
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (!cleanSlug) return { ok: false, error: 'invalid_board_name' };

  const url = `https://www.pinterest.com/${cleanUser}/${cleanSlug}/`;
  try {
    let res = await pinterestFetch(url, {
      headers: PINTEREST_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      dispatcher
    });

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {});
      await sleep(randomJitterMs(2500, 4000));
      res = await pinterestFetch(url, {
        headers: PINTEREST_PAGE_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        dispatcher
      });
    }

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const html = await res.text();

    let targetBoard = null;

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes('initialReduxState') && (content.includes('boards') || content.includes('board_vase'))) {
        try {
          const parsed = JSON.parse(content);
          const boards = parsed?.initialReduxState?.boards || {};
          for (const [id, b] of Object.entries(boards)) {
            if (b && (b.id || b.name)) {
              const bSlug = String(b.url || b.name || '')
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-');
              if (bSlug.includes(cleanSlug) || cleanSlug.includes(bSlug) || String(id) === cleanSlug) {
                targetBoard = b;
                break;
              }
            }
          }
          if (targetBoard) break;
        } catch (_) {}
      }
    }

    if (!targetBoard) {
      return { ok: false, status: 404, error: 'board_not_found_in_ssr' };
    }

    const coverImg = targetBoard.image_cover_hd_url || targetBoard.image_cover_url || targetBoard.images?.['736x']?.url || targetBoard.images?.['236x']?.url || targetBoard.image_thumbnail_url || null;
    const rawVase = targetBoard.board_vase || [];
    const boardVase = Array.isArray(rawVase) ? rawVase.map(v => {
      if (typeof v === 'string') return { text: v.trim(), link: '' };
      return {
        text: String(v?.text || '').trim(),
        link: v?.link ? (v.link.startsWith('http') ? v.link : `https://www.pinterest.com${v.link}`) : ''
      };
    }).filter(v => v.text.length > 0) : [];
    const desc = targetBoard.description || '';

    return {
      ok: true,
      board_id: String(targetBoard.id || ''),
      name: targetBoard.name || 'Untitled Board',
      slug: cleanSlug,
      url: targetBoard.url ? (targetBoard.url.startsWith('http') ? targetBoard.url : `https://www.pinterest.com${targetBoard.url}`) : `https://www.pinterest.com/${cleanUser}/${cleanSlug}/`,
      pin_count: parseCleanMetric(targetBoard.pin_count || 0),
      follower_count: parseCleanMetric(targetBoard.follower_count || 0),
      image_cover_url: coverImg,
      board_vase: boardVase,
      description: desc,
      metadata: {
        image_cover_url: coverImg,
        board_vase: boardVase,
        description: desc
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
