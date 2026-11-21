/**
 * src/core/pinterest/pin-fetchers.mjs
 *
 * Strict Guest Scraping, Hybrid PinResource Fallback, and Batch Pidgets Ingestion.
 *
 * // [INVARIANT: STRICT-GUEST-SCRAPING] Unauthenticated guest session headers (NO LOGGED-IN COOKIES)
 */

import {
  PINTEREST_PAGE_HEADERS,
  getPinterestXhrHeaders,
  sleep,
  exponentialBackoffWithFullJitter,
  getDefaultDispatcher,
  pinterestFetch,
  parseRetryAfterSeconds
} from './client.mjs';
import {
  PIDGETS_ZERO_COOKIE_HEADERS,
  extractUsernameFromProfileUrl,
  normalizeDomain
} from './pin-metrics.mjs';
import { formatPin } from './pin-formatter.mjs';
import { extractPinFromHtml, extractPinData } from './pin-html-extractor.mjs';

/**
 * Fetch single pin via PinResource/get/?data=... endpoint.
 * Supports both (pinId, options) and (pinId, dispatcher, returnEnvelope) calling conventions.
 *
 * @param {string} pinId
 * @param {object|null} [dispatcherOrOptions]
 * @param {boolean} [returnEnvelope=false]
 * @returns {Promise<object|null>}
 */
export async function fetchPinFromPinResource(pinId, dispatcherOrOptions = null, returnEnvelope = false) {
  const cleanId = String(pinId || '').trim();
  const isOptionsObj = Boolean(
    dispatcherOrOptions &&
    typeof dispatcherOrOptions === 'object' &&
    typeof dispatcherOrOptions.dispatch !== 'function' &&
    ('dispatcher' in dispatcherOrOptions || 'timeoutMs' in dispatcherOrOptions || Object.keys(dispatcherOrOptions).length === 0)
  );
  const actualDispatcher = isOptionsObj
    ? (dispatcherOrOptions.dispatcher || getDefaultDispatcher())
    : (dispatcherOrOptions || getDefaultDispatcher());
  const timeoutMs = (isOptionsObj && dispatcherOrOptions.timeoutMs) ? dispatcherOrOptions.timeoutMs : 8000;

  if (!cleanId) {
    return returnEnvelope ? { ok: false, status: 400, pin: null } : null;
  }

  const dataParam = encodeURIComponent(JSON.stringify({
    options: {
      id: cleanId,
      field_set_key: 'detailed'
    },
    context: {}
  }));
  const sourceUrl = encodeURIComponent(`/pin/${cleanId}/`);
  const url = `https://www.pinterest.com/resource/PinResource/get/?source_url=${sourceUrl}&data=${dataParam}`;

  const headers = getPinterestXhrHeaders('', '', {
    sourceUrl: `/pin/${cleanId}/`,
    handler: 'www/pin/[id].js'
  });

  let formattedPin = null;
  try {
    const res = await pinterestFetch(url, {
      headers,
      timeoutMs,
      dispatcher: actualDispatcher
    });
    if (res.ok) {
      const body = await res.json();
      const pinData = body?.resource_response?.data;
      if (pinData) {
        formattedPin = formatPin(pinData);
      }
    }
  } catch (_) {}

  if (returnEnvelope) {
    return { ok: Boolean(formattedPin), status: formattedPin ? 200 : 404, pin: formattedPin };
  }
  return formattedPin;
}

/**
 * Fallback to Pidgets endpoint
 *
 * @param {string|string[]} pinIds
 * @param {object} [options]
 * @returns {Promise<object[]|object|null>}
 */
export async function fetchPinFromPidgets(pinIds, options = {}) {
  const ids = Array.isArray(pinIds) ? pinIds : [pinIds];
  const cleanIds = ids.map(id => String(id || '').trim()).filter(Boolean);
  if (cleanIds.length === 0) return Array.isArray(pinIds) ? [] : null;

  const url = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${cleanIds.join(',')}`;
  const headers = {
    'User-Agent': PINTEREST_PAGE_HEADERS['User-Agent'],
    'Accept': 'application/json',
    'Referer': 'https://widgets.pinterest.com/'
  };

  try {
    const res = await pinterestFetch(url, {
      headers,
      timeoutMs: options.timeoutMs || 8000,
      dispatcher: options.dispatcher || getDefaultDispatcher()
    });
    if (!res.ok) return Array.isArray(pinIds) ? [] : null;

    const data = await res.json();
    const rawPins = Array.isArray(data?.data?.pins) ? data.data.pins : (Array.isArray(data?.data) ? data.data : []);
    const formatted = rawPins.map(p => formatPin(p)).filter(Boolean);

    if (Array.isArray(pinIds)) {
      return formatted;
    }
    return formatted[0] || null;
  } catch (_) {
    return Array.isArray(pinIds) ? [] : null;
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
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;
  const concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || 5));
  const interChunkDelayMs = options.sleepMs !== undefined ? Math.max(0, Number(options.sleepMs) || 0) : 50;

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

  const sanitizedCustomHeaders = {};
  if (options.headers && typeof options.headers === 'object') {
    for (const [k, v] of Object.entries(options.headers)) {
      if (String(k).toLowerCase() === 'cookie') continue;
      sanitizedCustomHeaders[k] = v;
    }
  }
  const reqHeaders = {
    ...PIDGETS_ZERO_COOKIE_HEADERS,
    ...sanitizedCustomHeaders
  };

  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < validIds.length; i += chunkSize) {
    chunks.push(validIds.slice(i, i + chunkSize));
  }

  let nextChunkIdx = 0;
  const workerCount = Math.min(concurrency, chunks.length);

  const runChunkWorker = async () => {
    while (nextChunkIdx < chunks.length) {
      const idx = nextChunkIdx++;
      const slice = chunks[idx];
      if (!slice || slice.length === 0) continue;

      if (idx > 0 && interChunkDelayMs > 0) {
        const jitterMs = interChunkDelayMs + Math.floor(Math.random() * interChunkDelayMs);
        await sleep(jitterMs);
      }

      const endpoint = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${slice.join(',')}`;

      try {
        const res = await pinterestFetch(endpoint, {
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
          dispatcher
        });

        if (!res.ok) {
          if (res.body) await res.body.cancel().catch(() => {});
          for (const id of slice) {
            if (!resultsMap.has(id)) {
              resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false, status: res.status });
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
            (pin.aggregated_pin_data?.aggregated_stats?.saves !== undefined && pin.aggregated_pin_data?.aggregated_stats?.saves !== null) ||
            (pin.aggregated_stats?.saves !== undefined && pin.aggregated_stats?.saves !== null) ||
            (pin.save_count !== undefined && pin.save_count !== null)
          );
          const rawSaves = (
            pin.aggregated_pin_data?.aggregated_stats?.saves ??
            pin.aggregated_stats?.saves ??
            pin.save_count ??
            null
          );
          const parsedSaves = rawSaves !== null && Number.isFinite(Number(rawSaves)) ? Math.max(0, Number(rawSaves)) : null;
          const saves = parsedSaves !== null ? parsedSaves : null;

          const hasExplicitRepins = Boolean(pin.repin_count !== undefined && pin.repin_count !== null && Number.isFinite(Number(pin.repin_count)));
          const repins = hasExplicitRepins ? Math.max(0, Number(pin.repin_count)) : null;

          const rawComments = pin.comment_count ?? pin.aggregated_pin_data?.comment_count ?? null;
          const comments = rawComments !== null && rawComments !== undefined && Number.isFinite(Number(rawComments))
            ? Math.max(0, Number(rawComments))
            : null;

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

          const hdImageUrl = standardImageUrl
            ? standardImageUrl.replace(/\/(236x|474x|564x|736x)\//, '/1200x/')
            : '';

          const resolvedPinnerUsername = extractUsernameFromProfileUrl(pin.pinner?.profile_url, pin.pinner?.username);
          const pinner = pin.pinner ? {
            id: String(pin.pinner.id || ''),
            username: resolvedPinnerUsername,
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
            has_explicit_saves: Boolean(hasExplicitSaves && saves !== null),
            repins,
            repin_count: repins,
            has_explicit_repins: repins !== null,
            comments,
            comment_count: comments,
            title,
            description: pin.description || '',
            domain,
            destination_url: link,
            link,
            dominant_color: pin.dominant_color || null,
            image_url: standardImageUrl,
            image_hd_url: hdImageUrl,
            images: pin.images || {},
            creator_username: resolvedPinnerUsername,
            pinner,
            creator: pinner,
            board,
            is_missing: false
          });
        }

        for (const id of slice) {
          if (!returnedIds.has(id) && !resultsMap.has(id)) {
            resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false });
          }
        }
      } catch (_) {
        for (const id of slice) {
          if (!resultsMap.has(id)) {
            resultsMap.set(id, { pin_id: id, id, is_missing: true, saves: null, save_count: null, repins: null, repin_count: null, has_explicit_saves: false, has_explicit_repins: false });
          }
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runChunkWorker()));

  resultsMap.ok = true;
  resultsMap.pins = Array.from(resultsMap.values());
  return resultsMap;
}

/**
 * Universal Pin Deep Extractor with 3-tier Fallback Hierarchy:
 * Tier 1: SSR __PWS_DATA__ HTML parsing
 * Tier 2: PinResource/get/?data=... closeup fallback (~90ms)
 * Tier 3: Pidgets batch fallback
 *
 * @param {string} pinId
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchAndExtractPin(pinId, options = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) return null;

  // Tier 1: Fetch HTML and parse SSR data
  const pinPageUrl = `https://www.pinterest.com/pin/${cleanId}/`;
  let pinResult = null;

  try {
    const htmlRes = await pinterestFetch(pinPageUrl, {
      headers: PINTEREST_PAGE_HEADERS,
      timeoutMs: options.timeoutMs || 8000,
      dispatcher: options.dispatcher
    });
    if (htmlRes.ok) {
      const htmlText = await htmlRes.text();
      pinResult = extractPinFromHtml(htmlText, cleanId);
    }
  } catch (_) {}

  // If pin has explicit saves, return immediately
  if (pinResult && pinResult.has_explicit_saves && pinResult.save_count !== null) {
    return pinResult;
  }

  // Tier 2: Fallback to PinResource/get/?data=...
  try {
    const resourcePin = await fetchPinFromPinResource(cleanId, options);
    if (resourcePin) {
      if (!pinResult) {
        pinResult = resourcePin;
      } else {
        if (resourcePin.has_explicit_saves && resourcePin.save_count !== null) {
          pinResult.save_count = resourcePin.save_count;
          pinResult.saves = resourcePin.saves;
          pinResult.has_explicit_saves = true;
        }
        if (resourcePin.has_explicit_repins) {
          pinResult.has_explicit_repins = true;
        }
        if (resourcePin.repin_count) pinResult.repin_count = resourcePin.repin_count;
        if (resourcePin.comment_count) pinResult.comment_count = resourcePin.comment_count;
        if (resourcePin.annotations && resourcePin.annotations.length > 0) {
          pinResult.annotations = resourcePin.annotations;
          pinResult.tags = resourcePin.tags;
        }
      }
    }
  } catch (_) {}

  if (pinResult && pinResult.has_explicit_saves && pinResult.save_count !== null) {
    return pinResult;
  }

  // Tier 3: Fallback to Pidgets
  try {
    const pidgetsPin = await fetchPinFromPidgets(cleanId, options);
    if (pidgetsPin) {
      if (!pinResult) {
        pinResult = pidgetsPin;
      } else {
        if (pidgetsPin.has_explicit_saves && pidgetsPin.save_count !== null) {
          pinResult.save_count = pidgetsPin.save_count;
          pinResult.saves = pidgetsPin.saves;
          pinResult.has_explicit_saves = true;
        }
        if (pidgetsPin.has_explicit_repins) {
          pinResult.has_explicit_repins = true;
        }
        if (pidgetsPin.repin_count) pinResult.repin_count = pidgetsPin.repin_count;
      }
    }
  } catch (_) {}

  return pinResult;
}

export async function fetchPinHybrid(pinId, { isTelemetryOnly = false, cookie = null, dispatcher = null } = {}) {
  const actualDispatcher = dispatcher || getDefaultDispatcher();
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
        if (p.saves !== null && p.saves !== undefined) {
          ssrRes.pin.saves = (ssrRes.pin.saves !== null && ssrRes.pin.saves !== undefined)
            ? Math.max(Number(ssrRes.pin.saves), Number(p.saves))
            : Number(p.saves);
          ssrRes.pin.save_count = ssrRes.pin.saves;
          if (p.has_explicit_saves || Number(p.saves) > 0) ssrRes.pin.has_explicit_saves = true;
        }
        if (p.repins !== null && p.repins !== undefined) {
          ssrRes.pin.repins = (ssrRes.pin.repins !== null && ssrRes.pin.repins !== undefined)
            ? Math.max(Number(ssrRes.pin.repins), Number(p.repins))
            : Number(p.repins);
          ssrRes.pin.repin_count = ssrRes.pin.repins;
          if (p.has_explicit_repins || Number(p.repins) > 0) ssrRes.pin.has_explicit_repins = true;
        }
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
    const dispatcher = opts.dispatcher || getDefaultDispatcher();

    let cookieStr = (typeof cookieOrOptions === 'string') ? cookieOrOptions : (opts.cookie || '');
    if (cookieStr) {
      cookieStr = cookieStr.replace(/(?:^|;\s*)_auth=1(?:;|$)/gi, '; ').trim().replace(/^;\s*|;\s*$/g, '');
    }
    const headers = { ...PINTEREST_PAGE_HEADERS };
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

          const mergedSaves = (parsed.saves !== null && parsed.saves !== undefined)
            ? ((fallbackPin.saves !== null && fallbackPin.saves !== undefined) ? Math.max(Number(parsed.saves), Number(fallbackPin.saves)) : Number(parsed.saves))
            : ((fallbackPin.saves !== null && fallbackPin.saves !== undefined) ? Number(fallbackPin.saves) : null);

          const mergedRepins = (parsed.repins !== null && parsed.repins !== undefined)
            ? ((fallbackPin.repins !== null && fallbackPin.repins !== undefined) ? Math.max(Number(parsed.repins), Number(fallbackPin.repins)) : Number(parsed.repins))
            : ((fallbackPin.repins !== null && fallbackPin.repins !== undefined) ? Number(fallbackPin.repins) : null);

          parsed = {
            ...fallbackPin,
            ...parsed,
            method: authenticMethod,
            creation_method: authenticMethod,
            canonical_pin_id: parsed.canonical_pin_id || fallbackPin.canonical_pin_id || null,
            saves: mergedSaves,
            save_count: mergedSaves,
            repins: mergedRepins,
            repin_count: mergedRepins,
            comments: Math.max(Number(parsed.comments || 0), Number(fallbackPin.comments || 0)),
            has_explicit_saves: Boolean(parsed.has_explicit_saves || fallbackPin.has_explicit_saves || (fallbackPin.saves !== null && fallbackPin.saves > 0)),
            has_explicit_repins: Boolean(parsed.has_explicit_repins || fallbackPin.has_explicit_repins || (fallbackPin.repins !== null && fallbackPin.repins > 0))
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
