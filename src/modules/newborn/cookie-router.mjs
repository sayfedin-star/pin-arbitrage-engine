/**
 * src/modules/newborn/cookie-router.mjs
 *
 * Two-Zone Pinterest 2026 Cookie Router & SSR __PWS_INITIAL_PROPS__ Extractor.
 *
 * Empirical 2026 Cookie Boundary Invariants:
 * 1. ZONE_AUTH_SESSION (`_auth=1` session cookie unlocks clean Snowflake IDs & graphs):
 *    - `RelatedModulesResource/get` (HTTP 412 Login required without `_auth=1`)
 *    - `BaseSearchResource/get` (`scope: "pins"` — avoids `e1_` encrypted IDs)
 *    - `BoardFeedResource/get` (including `/<user>/<slug>/more_ideas/` with `add_vase: true`)
 *    - `BestPinsFeedAltResource/get` (deep `/ideas/` pagination)
 *    - `SearchTabResource/get` (`Ideas for you`)
 *
 * 2. ZONE_ZERO_COOKIE (Strictly ZERO session cookies — sending `_auth=1` strips `pin_join`!):
 *    - `PinResource/get` (preserves `pin_join.visual_annotation` & `annotations_with_links`)
 *    - `widgets.pinterest.com/v3/pidgets/*` (50x batch pin info + board pins)
 *    - `UserResource/get` (`profile_reach` = Total audience, `profile_views` = Impressions)
 *    - `BaseSearchResource/get` (`scope: "boards"` — 50 clean boards with `board_order_modified_at`)
 *    - `InterestResource/get` (`is_interest` gate before `/ideas/`)
 *    - `trends.pinterest.com/top_trends_filtered/` + `/metrics/?predicted_days=90` (`x-new-site: "true"`)
 *
 * 3. Circuit Breaker & Secret Hygiene:
 *    - `HTTP 412` (Login required) and `HTTP 401` (Session expired) NEVER trip the IP-ban
 *      `PinterestCircuitBreaker`; instead, the router gracefully degrades to guest surfaces.
 *    - Genuine `HTTP 429` / `HTTP 403` rate limits still record circuit-breaker failures.
 *    - Existing `getStandardPinterestHeaders` and default `pinterestFetch` remain `_auth=0` untouched.
 */

import {
  CANONICAL_FINGERPRINT,
  PINTEREST_PAGE_HEADERS,
  CircuitBreakerOpenError,
  globalPinterestCircuitBreaker,
  getDefaultDispatcher
} from '../../core/pinterest/client.mjs';
import { extractRelayCompletedPayloads } from '../../core/pinterest/pins.mjs';
import { redactSecrets } from '../../http/security-and-response.mjs';
import { resolveNewbornRawCookie } from './settings.mjs';

export const COOKIE_ZONES = Object.freeze({
  AUTH_SESSION: 'auth_session',
  ZERO_COOKIE: 'zero_cookie'
});

export const ENDPOINT_BOUNDARY_RULES = Object.freeze({
  related_modules: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: false,
    requiresAuthCookie: true
  },
  search_pins: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: true,
    requiresAuthCookie: false
  },
  board_feed: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: true,
    requiresAuthCookie: false
  },
  board_more_ideas: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: false,
    requiresAuthCookie: true
  },
  best_pins_ideas: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: false,
    requiresAuthCookie: false
  },
  search_tab_ideas: {
    zone: COOKIE_ZONES.AUTH_SESSION,
    allowGuestRetry: false,
    requiresAuthCookie: false
  },
  pin_resource: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  },
  pidgets: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  },
  user_resource: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  },
  search_boards: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  },
  interest_resource: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  },
  trends_api: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true,
    extraHeaders: { 'x-new-site': 'true' }
  },
  ssr_page_zero_cookie: {
    zone: COOKIE_ZONES.ZERO_COOKIE,
    strictZeroCookie: true
  }
});

/**
 * Classifies an arbitrary Pinterest URL + options into its mandatory cookie zone.
 */
export function resolveUrlCookieZone(urlStr, endpointHint = '') {
  if (endpointHint && ENDPOINT_BOUNDARY_RULES[endpointHint]) {
    return ENDPOINT_BOUNDARY_RULES[endpointHint];
  }
  const u = String(urlStr || '');
  if (/PinResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.pin_resource;
  if (/widgets\.pinterest\.com\/v3\/pidgets/i.test(u)) return ENDPOINT_BOUNDARY_RULES.pidgets;
  if (/UserResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.user_resource;
  if (/InterestResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.interest_resource;
  if (/trends\.pinterest\.com/i.test(u)) return ENDPOINT_BOUNDARY_RULES.trends_api;
  if (/BaseSearchResource\/get/i.test(u)) {
    let decoded = u;
    try { decoded = decodeURIComponent(u); } catch (_) {}
    if (/"scope"\s*:\s*"boards"/i.test(decoded)) {
      return ENDPOINT_BOUNDARY_RULES.search_boards;
    }
    return ENDPOINT_BOUNDARY_RULES.search_pins;
  }
  if (/RelatedModulesResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.related_modules;
  if (/BestPinsFeedAltResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.best_pins_ideas;
  if (/SearchTabResource\/get/i.test(u)) return ENDPOINT_BOUNDARY_RULES.search_tab_ideas;
  if (/BoardFeedResource\/get/i.test(u)) {
    let decoded = u;
    try { decoded = decodeURIComponent(u); } catch (_) {}
    if (/more_ideas/i.test(decoded) || /"add_vase"\s*:\s*true/i.test(decoded)) {
      return ENDPOINT_BOUNDARY_RULES.board_more_ideas;
    }
    return ENDPOINT_BOUNDARY_RULES.board_feed;
  }
  return ENDPOINT_BOUNDARY_RULES.ssr_page_zero_cookie;
}

/**
 * Formats a raw session token into an authenticated `_auth=1` cookie string
 * strictly for Newborn ZONE_AUTH_SESSION requests.
 */
export function formatAuthSessionCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return '';
  let cookie = rawCookie.trim();
  if ((cookie.startsWith('"') && cookie.endsWith('"')) || (cookie.startsWith("'") && cookie.endsWith("'"))) {
    cookie = cookie.slice(1, -1).trim();
  }
  if (!cookie) return '';

  // Bare _pinterest_sess token value (e.g. TWc9... / Mg==...)
  if (
    !cookie.includes('=') ||
    cookie.startsWith('TWc9') ||
    cookie.startsWith('Mg==') ||
    (!cookie.includes(';') && !/^[a-zA-Z0-9_-]+\s*=/.test(cookie))
  ) {
    const cleanToken = cookie.replace(/"/g, '').trim();
    return cleanToken ? `_pinterest_sess="${cleanToken}"; _auth=1` : '';
  }

  const parts = cookie
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^_auth\s*=/i.test(p))
    .map((p) => p.replace(/^_pinterest_sess=([^;\s"]+)$/, '_pinterest_sess="$1"'));

  if (parts.length === 0) return '';
  return `${parts.join('; ')}; _auth=1`;
}

/**
 * Deletes every Cookie header key (case-insensitive) to guarantee strict zero-cookie execution.
 */
export function stripAllCookiesFromHeaders(headers = {}) {
  const clean = { ...headers };
  for (const key of Object.keys(clean)) {
    if (key.toLowerCase() === 'cookie') {
      delete clean[key];
    }
  }
  return clean;
}

function buildBaseXhrHeaders({ sourceUrl = '/', handler = 'www/index.js', referer = null, extraHeaders = {} } = {}) {
  const cleanSource = sourceUrl.startsWith('/') ? sourceUrl : `/${sourceUrl}`;
  return {
    'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
    'X-App-Version': CANONICAL_FINGERPRINT.APP_VERSION,
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-AppState': 'active',
    'X-Pinterest-PWS-Handler': handler,
    'X-Pinterest-Source-Url': cleanSource,
    'Referer': referer || `https://www.pinterest.com${cleanSource}`,
    'Sec-Ch-Ua': `"Google Chrome";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Chromium";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Not_A Brand";v="24"`,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'priority': 'u=0, i',
    ...extraHeaders
  };
}

function buildTimeoutSignal(timeoutMs = 8000, externalSignal = null) {
  if (typeof AbortSignal?.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (externalSignal && typeof AbortSignal?.any === 'function') {
      return AbortSignal.any([externalSignal, timeoutSignal]);
    }
    return externalSignal || timeoutSignal;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return externalSignal || controller.signal;
}

/**
 * Stateful per-run Two-Zone Cookie Router.
 * Tracks auth session health, enforces strict zero-cookie stripping on Zone 2 endpoints,
 * and gracefully falls back on HTTP 412 / 401 without tripping the IP-ban circuit breaker.
 */
export class NewbornCookieRouter {
  constructor(options = {}) {
    const rawCookie = typeof options.rawCookie === 'string' ? options.rawCookie.trim() : '';
    this.authCookieHeader = formatAuthSessionCookie(rawCookie);
    this.hasInitialAuthCookie = Boolean(this.authCookieHeader && this.authCookieHeader.includes('_auth=1'));
    this.authDegraded = false;
    this.degradedReason = null;
    this.circuitBreaker = options.circuitBreaker !== undefined
      ? options.circuitBreaker
      : globalPinterestCircuitBreaker;
    this.dispatcher = options.dispatcher !== undefined ? options.dispatcher : getDefaultDispatcher();
    this.fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
    this.timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
    this.telemetry = {
      authZoneRequests: 0,
      zeroCookieZoneRequests: 0,
      http412Fallbacks: 0,
      http401Fallbacks: 0,
      guestRetriesSucceeded: 0,
      skippedAuthOnlyEndpoints: 0
    };
  }

  get canUseAuthSession() {
    return this.hasInitialAuthCookie && !this.authDegraded;
  }

  get effectiveMode() {
    if (!this.hasInitialAuthCookie) return 'guest_only';
    if (this.authDegraded) return 'guest_fallback_412';
    return 'auth_two_zone';
  }

  getRedactedTelemetry() {
    return {
      mode: this.effectiveMode,
      has_auth_cookie: this.hasInitialAuthCookie,
      auth_degraded: this.authDegraded,
      degraded_reason: this.degradedReason,
      ...this.telemetry
    };
  }

  async _executeRawFetch(url, headers, { timeoutMs, signal: externalSignal, skipCircuitBreaker = false } = {}) {
    if (externalSignal?.aborted) {
      throw externalSignal.reason || new DOMException('The operation was aborted.', 'AbortError');
    }

    if (!skipCircuitBreaker && this.circuitBreaker && !this.circuitBreaker.canExecute()) {
      throw new CircuitBreakerOpenError();
    }

    const signal = buildTimeoutSignal(timeoutMs || this.timeoutMs, externalSignal);
    const fetchOpts = {
      method: 'GET',
      headers,
      signal,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {})
    };

    try {
      const res = await this.fetchImpl(url, fetchOpts);
      // CRITICAL: HTTP 412 (Login required) and HTTP 401 (Session expired) are cookie-state signals,
      // NEVER IP-ban rate limits. Release HALF_OPEN probe cleanly without recording a failure!
      if (res.status === 412 || res.status === 401) {
        this.circuitBreaker?.releaseProbe?.();
      } else if (res.status === 429 || res.status === 403) {
        this.circuitBreaker?.recordFailure?.(res.status);
      } else if (res.ok || res.status === 404) {
        this.circuitBreaker?.recordSuccess?.();
      } else {
        this.circuitBreaker?.releaseProbe?.();
      }
      return res;
    } catch (err) {
      if (externalSignal?.aborted) {
        this.circuitBreaker?.releaseProbe?.();
        throw err;
      }
      this.circuitBreaker?.recordFailure?.(null, err);
      throw err;
    }
  }

  /**
   * Executes a zone-enforced request to Pinterest.
   */
  async requestJson(url, options = {}) {
    const {
      endpointKey = '',
      sourceUrl = '/',
      handler = 'www/index.js',
      referer = null,
      extraHeaders = {},
      isDocumentHtml = false,
      timeoutMs = this.timeoutMs,
      signal = null
    } = options;

    const rule = resolveUrlCookieZone(url, endpointKey);
    const baseHeaders = isDocumentHtml
      ? { ...PINTEREST_PAGE_HEADERS, ...(referer ? { Referer: referer } : {}), ...extraHeaders }
      : buildBaseXhrHeaders({
          sourceUrl,
          handler,
          referer,
          extraHeaders: {
            ...(rule.extraHeaders || {}),
            ...extraHeaders
          }
        });

    // ZONE 2: STRICT ZERO-COOKIE
    if (rule.zone === COOKIE_ZONES.ZERO_COOKIE) {
      const zeroHeaders = stripAllCookiesFromHeaders(baseHeaders);
      this.telemetry.zeroCookieZoneRequests++;
      const res = await this._executeRawFetch(url, zeroHeaders, { timeoutMs, signal });
      if (!res.ok) {
        if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
        return {
          ok: false,
          status: res.status,
          zone: COOKIE_ZONES.ZERO_COOKIE,
          usedAuthCookie: false,
          data: null,
          error: `HTTP_${res.status}`
        };
      }
      const data = isDocumentHtml ? await res.text() : await res.json();
      return {
        ok: true,
        status: res.status,
        zone: COOKIE_ZONES.ZERO_COOKIE,
        usedAuthCookie: false,
        data
      };
    }

    // ZONE 1: AUTH SESSION (`_auth=1`) WITH GRACEFUL FALLBACK
    if (!this.canUseAuthSession) {
      if (rule.requiresAuthCookie && !rule.allowGuestRetry) {
        this.telemetry.skippedAuthOnlyEndpoints++;
        return {
          ok: false,
          status: 412,
          zone: COOKIE_ZONES.AUTH_SESSION,
          usedAuthCookie: false,
          skippedAuthOnly: true,
          authRequiredFallback: true,
          data: null,
          error: this.authDegraded ? 'AUTH_SESSION_EXPIRED_412' : 'NO_AUTH_COOKIE_CONFIGURED'
        };
      }

      // Attempt guest zero-cookie execution when supported
      const guestHeaders = stripAllCookiesFromHeaders(baseHeaders);
      this.telemetry.zeroCookieZoneRequests++;
      const guestRes = await this._executeRawFetch(url, guestHeaders, { timeoutMs, signal });
      if (guestRes.status === 412 || guestRes.status === 401) {
        if (guestRes.body && !guestRes.bodyUsed) await guestRes.body.cancel().catch(() => {});
        this.telemetry.http412Fallbacks++;
        return {
          ok: false,
          status: guestRes.status,
          zone: COOKIE_ZONES.ZERO_COOKIE,
          usedAuthCookie: false,
          authRequiredFallback: true,
          data: null,
          error: `HTTP_${guestRes.status}`
        };
      }
      if (!guestRes.ok) {
        if (guestRes.body && !guestRes.bodyUsed) await guestRes.body.cancel().catch(() => {});
        return {
          ok: false,
          status: guestRes.status,
          zone: COOKIE_ZONES.ZERO_COOKIE,
          usedAuthCookie: false,
          data: null,
          error: `HTTP_${guestRes.status}`
        };
      }
      const guestData = isDocumentHtml ? await guestRes.text() : await guestRes.json();
      return {
        ok: true,
        status: guestRes.status,
        zone: COOKIE_ZONES.ZERO_COOKIE,
        usedAuthCookie: false,
        fallbackFromAuth: true,
        data: guestData
      };
    }

    // Execute authenticated `_auth=1` request
    const authHeaders = {
      ...stripAllCookiesFromHeaders(baseHeaders),
      Cookie: this.authCookieHeader
    };
    this.telemetry.authZoneRequests++;
    const res = await this._executeRawFetch(url, authHeaders, { timeoutMs, signal });

    if (res.status === 412 || res.status === 401) {
      if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      this.authDegraded = true;
      this.degradedReason = `HTTP_${res.status}`;
      if (res.status === 412) this.telemetry.http412Fallbacks++;
      else this.telemetry.http401Fallbacks++;

      if (rule.allowGuestRetry) {
        const retryGuestHeaders = stripAllCookiesFromHeaders(baseHeaders);
        this.telemetry.zeroCookieZoneRequests++;
        const retryRes = await this._executeRawFetch(url, retryGuestHeaders, { timeoutMs, signal });
        if (retryRes.ok) {
          this.telemetry.guestRetriesSucceeded++;
          const retryData = isDocumentHtml ? await retryRes.text() : await retryRes.json();
          return {
            ok: true,
            status: retryRes.status,
            zone: COOKIE_ZONES.ZERO_COOKIE,
            usedAuthCookie: false,
            fallbackFromAuth: true,
            data: retryData
          };
        }
        if (retryRes.body && !retryRes.bodyUsed) await retryRes.body.cancel().catch(() => {});
      }

      return {
        ok: false,
        status: res.status,
        zone: COOKIE_ZONES.AUTH_SESSION,
        usedAuthCookie: true,
        authRequiredFallback: true,
        data: null,
        error: redactSecrets(`Session cookie rejected with HTTP ${res.status}; degraded to guest surfaces.`)
      };
    }

    if (!res.ok) {
      if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
      return {
        ok: false,
        status: res.status,
        zone: COOKIE_ZONES.AUTH_SESSION,
        usedAuthCookie: true,
        data: null,
        error: `HTTP_${res.status}`
      };
    }

    const data = isDocumentHtml ? await res.text() : await res.json();
    return {
      ok: true,
      status: res.status,
      zone: COOKIE_ZONES.AUTH_SESSION,
      usedAuthCookie: true,
      data
    };
  }
}

/**
 * Extracts structured state from Pinterest 2026 SSR HTML (`<script id="__PWS_INITIAL_PROPS__">`),
 * with automatic fallback to `<script id="__PWS_DATA__">` and Relay completed payloads.
 */
export function extractPwsInitialProps(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return null;
  const html = rawHtml.length > 4_000_000 ? rawHtml.slice(0, 4_000_000) : rawHtml;

  // 1. Primary 2026 SSR state container: <script id="__PWS_INITIAL_PROPS__" type="application/json">
  const initialPropsMatch = html.match(/<script[^>]*\bid=["']__PWS_INITIAL_PROPS__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (initialPropsMatch && initialPropsMatch[1]) {
    try {
      return JSON.parse(initialPropsMatch[1]);
    } catch (_) {}
  }

  // 2. Legacy SSR fallback: <script id="__PWS_DATA__">
  const pwsDataMatch = html.match(/<script[^>]*\bid=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (pwsDataMatch && pwsDataMatch[1]) {
    try {
      return JSON.parse(pwsDataMatch[1]);
    } catch (_) {}
  }

  // 3. Relay register completed request payloads
  const relayPayloads = extractRelayCompletedPayloads(html);
  if (relayPayloads.length > 0) {
    return { relayPayloads };
  }

  return null;
}

/**
 * Walks an extracted SSR JSON tree (`__PWS_INITIAL_PROPS__` / `initialReduxState`) and collects
 * clean numeric Snowflake pin objects while ignoring `e1_` encrypted stubs and ads.
 */
export function collectPinsFromSsrTree(rootNode, maxPins = 200) {
  const collected = new Map();
  if (!rootNode || typeof rootNode !== 'object') return [];

  const visit = (node, depth) => {
    if (depth > 18 || !node || typeof node !== 'object' || collected.size >= maxPins) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
        if (collected.size >= maxPins) break;
      }
      return;
    }

    const rawId = node.id ?? node.entityId ?? node.pin_id ?? null;
    const idStr = rawId !== null && rawId !== undefined ? String(rawId).trim() : '';
    const hasValidPinStructure = Boolean(
      (node.images && typeof node.images === 'object') ||
      node.imageSpec_736x ||
      node.image_large_url ||
      node.repin_count !== undefined ||
      node.aggregated_pin_data ||
      node.pinner ||
      node.pin_join ||
      node.created_at
    );
    const looksLikePin = Boolean(
      /^\d{10,25}$/.test(idStr) &&
      node.type === 'pin' &&
      !node.is_promoted &&
      hasValidPinStructure
    );

    if (looksLikePin && !collected.has(idStr)) {
      collected.set(idStr, { ...node, id: idStr });
    }

    for (const key of Object.keys(node)) {
      if (key === 'story_pin_data' || key === 'carousel_data') continue;
      visit(node[key], depth + 1);
      if (collected.size >= maxPins) break;
    }
  };

  visit(rootNode, 0);
  return Array.from(collected.values());
}

/**
 * Zone-A Authenticated Header Builder for `RelatedModulesResource/get` callers
 * (`scripts/cluster-intelligence.mjs`, `scripts/account-related-crawler.mjs`,
 * and `src/modules/creators/creator-harvest-and-archive.mjs`).
 *
 * When a session cookie is available, attaches `_auth=1` session headers so callers
 * overcome Pinterest's 2026 `HTTP 412` login gate; when absent, emits clean zero-cookie
 * guest headers without ever mutating `process.env.PINTEREST_COOKIE` or `getStandardPinterestHeaders`.
 */
export function buildZoneARelatedModulesHeaders({ pinId = '', rawCookie = '', extraHeaders = {} } = {}) {
  const cleanPinId = String(pinId || '').trim();
  const sourceUrl = cleanPinId ? `/pin/${cleanPinId}/` : '/';
  const referer = cleanPinId ? `https://www.pinterest.com/pin/${cleanPinId}/` : 'https://www.pinterest.com/';
  const guestHeaders = stripAllCookiesFromHeaders(
    buildBaseXhrHeaders({
      sourceUrl,
      handler: 'www/pin/[id].js',
      referer,
      extraHeaders: {
        Origin: 'https://www.pinterest.com',
        'Screen-Dpr': '1',
        ...extraHeaders
      }
    })
  );

  const authCookie = formatAuthSessionCookie(rawCookie);
  const usedAuthCookie = Boolean(authCookie && authCookie.includes('_auth=1'));
  const headers = usedAuthCookie
    ? { ...guestHeaders, Cookie: authCookie }
    : { ...guestHeaders };

  return {
    headers,
    guestHeaders,
    usedAuthCookie
  };
}

/**
 * Executes a `RelatedModulesResource/get` request using Zone-A `_auth=1` session headers
 * when a cookie is available, with automatic zero-cookie guest fallback on missing cookie
 * or `HTTP 412` / `HTTP 401` (never tripping the IP-ban `PinterestCircuitBreaker` on 412/401).
 */
export async function fetchRelatedModulesWithZoneA(url, options = {}) {
  const {
    pinId = '',
    sql = null,
    env = null,
    rawCookie = undefined,
    fetchImpl = globalThis.fetch,
    dispatcher = undefined,
    timeoutMs = 8000,
    signal: externalSignal = null,
    extraHeaders = {},
    circuitBreaker = undefined,
    breaker = undefined,
    skipCircuitBreaker = false
  } = options;

  const activeBreaker = circuitBreaker !== undefined
    ? circuitBreaker
    : (breaker !== undefined ? breaker : globalPinterestCircuitBreaker);

  let resolvedCookie = '';
  if (typeof rawCookie === 'string') {
    resolvedCookie = rawCookie.trim();
  } else {
    const resolved = await resolveNewbornRawCookie(sql, env || {}).catch(() => ({ rawCookie: '' }));
    resolvedCookie = resolved?.rawCookie || '';
  }

  const { headers, guestHeaders, usedAuthCookie } = buildZoneARelatedModulesHeaders({
    pinId,
    rawCookie: resolvedCookie,
    extraHeaders
  });

  const effectiveDispatcher = dispatcher !== undefined ? dispatcher : getDefaultDispatcher();
  const execOnce = async (reqHeaders) => {
    if (externalSignal?.aborted) {
      throw externalSignal.reason || new DOMException('The operation was aborted.', 'AbortError');
    }
    if (!skipCircuitBreaker && activeBreaker && typeof activeBreaker.canExecute === 'function' && !activeBreaker.canExecute()) {
      throw new CircuitBreakerOpenError();
    }
    const signal = buildTimeoutSignal(timeoutMs, externalSignal);
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: reqHeaders,
        signal,
        ...(effectiveDispatcher ? { dispatcher: effectiveDispatcher } : {})
      });
      // CRITICAL: HTTP 412/401 are cookie-auth signals, NEVER IP-ban rate limits.
      if (res.status === 412 || res.status === 401) {
        activeBreaker?.releaseProbe?.();
      } else if (res.status === 429 || res.status === 403) {
        activeBreaker?.recordFailure?.(res.status);
      } else if (res.ok || res.status === 404) {
        activeBreaker?.recordSuccess?.();
      } else {
        activeBreaker?.releaseProbe?.();
      }
      return res;
    } catch (err) {
      if (externalSignal?.aborted) {
        activeBreaker?.releaseProbe?.();
        throw err;
      }
      activeBreaker?.recordFailure?.(null, err);
      throw err;
    }
  };

  const firstRes = await execOnce(headers);
  if (usedAuthCookie && (firstRes.status === 412 || firstRes.status === 401)) {
    if (firstRes.body && !firstRes.bodyUsed) await firstRes.body.cancel().catch(() => {});
    const retryRes = await execOnce(guestHeaders);
    if (!retryRes.ok) {
      if (retryRes.body && !retryRes.bodyUsed) await retryRes.body.cancel().catch(() => {});
      return {
        ok: false,
        status: retryRes.status,
        usedAuthCookie: false,
        usedGuestFallback: true,
        authRequired: retryRes.status === 412 || retryRes.status === 401,
        data: null,
        error: redactSecrets(`RelatedModulesResource HTTP ${retryRes.status} after guest fallback`)
      };
    }
    const retryData = await retryRes.json();
    return {
      ok: true,
      status: retryRes.status,
      usedAuthCookie: false,
      usedGuestFallback: true,
      authRequired: false,
      data: retryData
    };
  }

  if (!firstRes.ok) {
    if (firstRes.body && !firstRes.bodyUsed) await firstRes.body.cancel().catch(() => {});
    return {
      ok: false,
      status: firstRes.status,
      usedAuthCookie,
      usedGuestFallback: false,
      authRequired: firstRes.status === 412 || firstRes.status === 401,
      data: null,
      error: redactSecrets(`RelatedModulesResource HTTP ${firstRes.status}`)
    };
  }

  const data = await firstRes.json();
  return {
    ok: true,
    status: firstRes.status,
    usedAuthCookie,
    usedGuestFallback: false,
    authRequired: false,
    data
  };
}
