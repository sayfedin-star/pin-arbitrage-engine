/**
 * src/core/pinterest-client.mjs
 *
 * Core Canonical Pinterest Stateless Client
 * Enforces unauthenticated guest session invariants, browser fingerprint parity,
 * jittered rate-limiting, explicit timeouts, and circuit breaking across PAE v6.0.
 *
 * // [INVARIANT: STRICT-GUEST-SCRAPING]
 * // [INVARIANT: ZERO-LOGGED-IN-COOKIES]
 */

export const CANONICAL_FINGERPRINT = {
  CHROME_VERSION: '131.0.0.0',
  CHROME_MAJOR: '131',
  APP_VERSION: '9302641',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

/**
 * Sanitizes any cookie string to guarantee unauthenticated guest state (_auth=0).
 * Strips logged-in user tokens (_auth=1) which cause Pinterest to return zeros.
 *
 * @param {string|null|undefined} rawCookie
 * @returns {string}
 */
export function sanitizeGuestCookie(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') {
    return '';
  }
  let cookie = rawCookie.trim();
  if (cookie.startsWith('"') && cookie.endsWith('"')) {
    cookie = cookie.slice(1, -1).trim();
  }
  if (!cookie) return '';

  // Support raw _pinterest_sess token values (e.g. TWc9PS... or Mg==... without key=value format)
  if (
    !cookie.includes('=') ||
    cookie.startsWith('TWc9') ||
    cookie.startsWith('Mg==') ||
    (!cookie.includes(';') && !/^[a-zA-Z0-9_-]+\s*=/.test(cookie))
  ) {
    const cleanToken = cookie.replace(/"/g, '').trim();
    return `_auth=0; _pinterest_sess="${cleanToken}"`;
  }

  // [INVARIANT: STRICT-GUEST-SCRAPING]
  // Never allow _auth=1 (logged-in session). Strip any _auth key and enforce _auth=0.
  cookie = cookie.replace(/_auth\s*=\s*"?1"?;?\s*/gi, '').trim();
  cookie = cookie.replace(/_pinterest_sess=([^;\s"]+)/, '_pinterest_sess="$1"');
  if (!/_auth\s*=\s*"?0"?/i.test(cookie)) {
    cookie = `_auth=0; ${cookie}`.trim();
  }
  // Clean double semicolons and extra spaces
  return cookie
    .replace(/;\s*;/g, ';')
    .replace(/;\s+/g, '; ')
    .replace(/^;\s*/, '')
    .replace(/;\s*$/, '')
    .trim();
}

/**
 * Returns standard Pinterest request headers with 100% Client-Hints and fingerprint parity.
 *
 * @param {object} [options]
 * @param {string} [options.cookie]
 * @param {string} [options.referer]
 * @param {object} [options.extra]
 * @param {object} [options.extraHeaders]
 * @returns {Record<string, string>}
 */
export function getStandardPinterestHeaders(options = {}) {
  const headers = {
    'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
    'X-App-Version': CANONICAL_FINGERPRINT.APP_VERSION,
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Ch-Ua': `"Google Chrome";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Chromium";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Not_A Brand";v="24"`,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'priority': 'u=0, i'
  };

  if (options.referer && typeof options.referer === 'string') {
    headers['Referer'] = options.referer;
  }

  const rawCookie = options.cookie !== undefined
    ? options.cookie
    : (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : null);
  const cleanCookie = sanitizeGuestCookie(rawCookie);
  if (cleanCookie) {
    headers['Cookie'] = cleanCookie;
  }

  const customHeaders = options.extraHeaders || options.extra;
  if (customHeaders && typeof customHeaders === 'object') {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

export const getPinterestHeaders = getStandardPinterestHeaders;

/**
 * Page document navigation headers for full HTML fetches.
 */
export const PINTEREST_PAGE_HEADERS = {
  'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': `"Google Chrome";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Chromium";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Not_A Brand";v="24"`,
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

/**
 * Returns Pinterest XHR headers for internal resource endpoints.
 */
export function getPinterestXhrHeaders(username = '', activeCookie = '', options = {}) {
  const cleanUser = String(username || '').replace(/^@/, '').trim();
  const src = options.sourceUrl || (cleanUser ? `/${cleanUser}/_created/` : '/');
  const handler = options.handler || (cleanUser ? `www/${cleanUser}/_created.js` : 'www/index.js');

  const headers = {
    ...getStandardPinterestHeaders({
      cookie: activeCookie,
      referer: `https://www.pinterest.com${src}`,
      extraHeaders: {
        'X-Pinterest-AppState': 'active',
        'X-Pinterest-PWS-Handler': handler,
        'X-Pinterest-Source-Url': src,
        ...(options.extraHeaders || {})
      }
    })
  };

  return headers;
}

/**
 * Rate-Limiting Jitter Utilities
 * Fail-safe standards require 2500ms - 4000ms delay to absorb anti-bot gates cleanly.
 */
export function randomJitterMs(min = 2500, max = 4000) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(Math.random() * (high - low + 1));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export async function sleepWithJitter(min = 2500, max = 4000) {
  const delay = randomJitterMs(min, max);
  await sleep(delay);
  return delay;
}

export function exponentialBackoffWithFullJitter(attempt = 1, baseMs = 1500, capMs = 15000) {
  const exponent = Math.min(6, Math.max(0, attempt - 1));
  const temp = Math.min(capMs, baseMs * (2 ** exponent));
  return Math.floor(Math.random() * temp);
}

/**
 * Circuit Breaker implementation for Pinterest HTTP endpoints.
 * Automatically halts outbound requests when encountering repeated 429 (Rate Limit)
 * or 403 (Forbidden) responses to prevent IP blocks and runner bans.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN: Pinterest requests temporarily paused to absorb rate limiting') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.code = 'CIRCUIT_BREAKER_OPEN';
  }
}

export class PinterestCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000; // 30s cooldown
    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.openedAt = null;
    this.totalTrips = 0;
  }

  canExecute() {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now - this.openedAt >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    this.lastSuccessTime = Date.now();
  }

  recordFailure(status, error = null) {
    this.lastFailureTime = Date.now();
    const isRateLimitOrForbidden = status === 429 || status === 403;
    const isNetworkAbort = error?.name === 'TimeoutError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT';

    if (isRateLimitOrForbidden || isNetworkAbort) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.failureThreshold || this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.openedAt = Date.now();
        this.totalTrips += 1;
      }
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  getState() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalTrips: this.totalTrips
    };
  }
}

export const globalPinterestCircuitBreaker = new PinterestCircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000
});

let globalDefaultDispatcher = null;

export function setDefaultDispatcher(dispatcher) {
  globalDefaultDispatcher = dispatcher;
}

export function getDefaultDispatcher() {
  return globalDefaultDispatcher;
}

/**
 * Resilient unauthenticated fetcher for Pinterest endpoints.
 * Injects canonical browser fingerprint headers, strict unauthenticated cookies,
 * 8000ms AbortSignal timeout, and circuit breaker protection.
 *
 * @param {string} url
 * @param {object} [init]
 * @returns {Promise<Response>}
 */
export async function pinterestFetch(url, init = {}) {
  const {
    timeoutMs = 8000,
    signal: externalSignal,
    circuitBreaker = globalPinterestCircuitBreaker,
    dispatcher = globalDefaultDispatcher,
    skipCircuitBreaker = false,
    ...restInit
  } = init;

  // 1. Inspect Circuit Breaker
  if (!skipCircuitBreaker && circuitBreaker && !circuitBreaker.canExecute()) {
    throw new CircuitBreakerOpenError();
  }

  // 2. Invariant Timeout Guard (8000ms SLA)
  let timeoutController = null;
  let signal = externalSignal;

  if (typeof AbortSignal?.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (externalSignal && typeof AbortSignal?.any === 'function') {
      signal = AbortSignal.any([externalSignal, timeoutSignal]);
    } else if (!externalSignal) {
      signal = timeoutSignal;
    }
  } else {
    timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    signal = externalSignal || timeoutController.signal;
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    }
  }

  // 3. Sanitize Cookie in Headers if present
  const incomingHeaders = restInit.headers ? { ...restInit.headers } : {};
  if (incomingHeaders['Cookie'] || incomingHeaders['cookie']) {
    const raw = incomingHeaders['Cookie'] || incomingHeaders['cookie'];
    incomingHeaders['Cookie'] = sanitizeGuestCookie(raw);
    delete incomingHeaders['cookie'];
  }

  const fetchOpts = {
    ...restInit,
    headers: incomingHeaders,
    signal,
    ...(dispatcher ? { dispatcher } : {})
  };

  try {
    const response = await fetch(url, fetchOpts);
    if (response.status === 429 || response.status === 403) {
      circuitBreaker?.recordFailure(response.status);
    } else if (response.ok) {
      circuitBreaker?.recordSuccess();
    }
    return response;
  } catch (err) {
    circuitBreaker?.recordFailure(null, err);

    // Restrict fallback strictly to dispatcher mismatch errors between undici versions
    const isDispatcherMismatch = dispatcher && (
      err?.name === 'InvalidArgumentError' ||
      err?.code === 'UND_ERR_INVALID_ARG' ||
      err?.cause?.name === 'InvalidArgumentError' ||
      err?.cause?.code === 'UND_ERR_INVALID_ARG' ||
      String(err?.message || '').toLowerCase().includes('invalid dispatcher') ||
      String(err?.cause?.message || '').toLowerCase().includes('invalid dispatcher')
    );
    if (isDispatcherMismatch) {
      globalDefaultDispatcher = null;
      return await fetch(url, { ...restInit, headers: incomingHeaders, signal });
    }
    throw err;
  }
}

/**
 * PinterestClient instance bundling client configuration.
 */
export class PinterestClient {
  constructor(options = {}) {
    this.circuitBreaker = options.circuitBreaker || new PinterestCircuitBreaker(options);
    this.timeoutMs = options.timeoutMs || 8000;
    this.dispatcher = options.dispatcher || globalDefaultDispatcher;
  }

  async fetch(url, init = {}) {
    return pinterestFetch(url, {
      timeoutMs: this.timeoutMs,
      circuitBreaker: this.circuitBreaker,
      dispatcher: this.dispatcher,
      ...init
    });
  }

  async fetchJson(url, init = {}) {
    const res = await this.fetch(url, init);
    if (!res.ok) {
      throw new Error(`Pinterest HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  async fetchHtml(url, init = {}) {
    const headers = {
      ...PINTEREST_PAGE_HEADERS,
      ...(init.headers || {})
    };
    const res = await this.fetch(url, { ...init, headers });
    if (!res.ok) {
      throw new Error(`Pinterest HTTP ${res.status}: ${res.statusText}`);
    }
    return res.text();
  }
}

export const defaultPinterestClient = new PinterestClient();
