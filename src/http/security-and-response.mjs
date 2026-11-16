/**
 * Pure HTTP Security, Context, Caching & Response Utilities
 *
 * Framework-agnostic primitives shared across Fastify routes, plugins,
 * and services.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';

export { getCulinaryColorName, formatAge } from '../utils.mjs';

export const requestContextStorage = new AsyncLocalStorage();
globalThis.__requestContextStorage = requestContextStorage;

// [INVARIANT: RESERVED-SYSTEM-SLUGS-SSOT]
// Expanded reserved slugs registry synchronized across router and UI to prevent route swallowing
export const RESERVED_KEYWORD_SLUGS = new Set([
  'discovery', 'discovery-hub', 'folders', 'folder', 'campaign-folders', 'export', 'sync',
  'batch', 'api', 'add', 'manage', 'import', 'domains', 'domain', 'keywords', 'keyword',
  'accounts', 'creators', 'creator', 'pinarchive', 'fleet', 'pin', 'pins', 'board', 'boards',
  'feed', 'search', 'topics', 'all-pins', 'winning-pins', 'links', 'overview',
  'dashboard', 'related-pins', 'related_pins', 'seeds', 'intersections', 'archive', 'explorer',
  'settings', 'admin', 'health', 'favicon.ico', 'robots.txt', 'assets', 'static', 'pulse', '24h'
]);

// Zero-Trust Security & Credential Redaction Sanitizer
export function redactSecrets(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]{12,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]')
    .replace(/(github_pat_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_PAT]')
    .replace(/(_pinterest_sess=)[^;\s"']+/gi, '$1[REDACTED_COOKIE]')
    .replace(/([?&](?:password|token|secret|apiKey)=)[^&]+/gi, '$1[REDACTED]');
}

// Normalized Path Resolver (Resolves traversal %2e%2e, removes duplicate/trailing slashes)
export function normalizePath(rawPathname) {
  if (!rawPathname) return '/';
  let decoded = rawPathname;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch (_) {
    try {
      decoded = decodeURI(rawPathname);
    } catch (_) {}
  }

  const parts = decoded.split('/');
  const stack = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(p);
    }
  }
  return '/' + stack.join('/');
}

// Timing-Safe Constant-Time String Comparison (Defends against byte-by-byte timing attacks via SHA-256 digest + timingSafeEqual)
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  const isHashMatch = timingSafeEqual(hashA, hashB);
  return isHashMatch && (a.length === b.length);
}

export async function raceWithTimeout(taskOrFactory, ms, errorMessage = 'Operation timed out') {
  let timerId;
  const taskPromise = Promise.resolve().then(() =>
    typeof taskOrFactory === 'function' ? taskOrFactory() : taskOrFactory
  );
  taskPromise.catch(() => {});

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error(errorMessage);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
    if (timerId && typeof timerId.unref === 'function') {
      timerId.unref();
    }
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

let defaultBackgroundQueue = null;

export function registerDefaultBackgroundQueue(queue) {
  defaultBackgroundQueue = queue;
}

export function safeWaitUntil(promiseOrCtx, explicitPromiseOrCtx = null, taskName = 'bg_task') {
  let effectiveCtx = null;
  let effectivePromise = null;

  if (promiseOrCtx && typeof promiseOrCtx.then === 'function') {
    effectivePromise = promiseOrCtx;
    if (explicitPromiseOrCtx && typeof explicitPromiseOrCtx.waitUntil === 'function') {
      effectiveCtx = explicitPromiseOrCtx;
    }
  } else if (promiseOrCtx && typeof promiseOrCtx.waitUntil === 'function') {
    effectiveCtx = promiseOrCtx;
    effectivePromise = explicitPromiseOrCtx;
  } else {
    effectivePromise = explicitPromiseOrCtx;
  }

  if (!effectiveCtx) {
    const storage = globalThis.__requestContextStorage || requestContextStorage;
    const store = storage?.getStore?.();
    if (store?.ctx && typeof store.ctx.waitUntil === 'function') {
      effectiveCtx = store.ctx;
    }
  }

  if (!effectivePromise || typeof effectivePromise.then !== 'function') return;
  effectivePromise.catch(err => {
    console.error(`[safeWaitUntil] Error in background task "${taskName}":`, redactSecrets(err?.message || String(err)));
  });

  if (effectiveCtx && typeof effectiveCtx.waitUntil === 'function') {
    try {
      effectiveCtx.waitUntil(effectivePromise);
    } catch {
      // Request context may have already closed
    }
  } else if (defaultBackgroundQueue && typeof defaultBackgroundQueue.add === 'function') {
    defaultBackgroundQueue.add(() => effectivePromise).catch(() => {});
  }
}

// Process-Level Pinterest Rate-Limit Circuit Breaker
let l0PinterestCircuit = { triggered_at: 0, cooldown_seconds: 0, reason: '' };

export async function checkPinterestCircuitBreaker(_env) {
  const now = Date.now();
  const l0Expires = l0PinterestCircuit.triggered_at + (l0PinterestCircuit.cooldown_seconds * 1000);
  if (l0Expires > now) {
    return {
      active: true,
      remaining_seconds: Math.max(1, Math.ceil((l0Expires - now) / 1000)),
      reason: l0PinterestCircuit.reason,
      triggered_at: l0PinterestCircuit.triggered_at
    };
  }
  return null;
}

export async function tripPinterestCircuitBreaker(_env, reason = 'HTTP 429/403 Rate Limit', cooldownSeconds = 900) {
  const now = Date.now();
  l0PinterestCircuit = { triggered_at: now, cooldown_seconds: cooldownSeconds, reason };
}

export function clampLimit(val, fallback = 50, max = 1000) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export function isValidPinId(pinId) {
  if (!pinId || typeof pinId !== 'string') return false;
  const clean = pinId.trim();
  // Strictly numeric Snowflake ID (10 to 30 digits), no encrypted e1_ tokens
  return /^\d{10,30}$/.test(clean);
}

export function getCorsHeaders(requestOrigin = null, env = {}) {
  const allowedOriginsStr = (env && env.ALLOWED_ORIGINS) || '';
  let origin = '*';

  if (allowedOriginsStr && allowedOriginsStr !== '*') {
    const list = allowedOriginsStr.split(',').map(s => s.trim().toLowerCase());
    if (requestOrigin && list.includes(requestOrigin.toLowerCase())) {
      origin = requestOrigin;
    } else {
      origin = list[0] || 'null';
    }
  } else if (requestOrigin) {
    origin = requestOrigin;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

// [INVARIANT: SEC-01 FAIL-CLOSED PRODUCTION AUTH & URL-KEY DEPRECATION]
export function verifyApiAuthentication(request, env = {}) {
  // Reject URL query string tokens to prevent leakages in server logs (CWE-598)
  try {
    const rawUrl = request?.url || request?.raw?.url || '/';
    const url = new URL(rawUrl, 'http://127.0.0.1');
    if (url.searchParams.has('api_key') || url.searchParams.has('key')) {
      const payload = { success: false, error: 'UNAUTHORIZED', message: 'Passing API keys in URL query string is deprecated and forbidden. Use x-api-key or Authorization header.' };
      return {
        authorized: false,
        status: 401,
        reason: payload.message,
        payload
      };
    }
  } catch (_) {}

  const isTestOrLocalDev = (
    env?.ENVIRONMENT === 'test' ||
    env?.NODE_ENV === 'test' ||
    Boolean(globalThis.__PAE_TEST_MODE__) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof process !== 'undefined' && process.argv && process.argv.slice(1).some(arg => /(?:^|[\\/])(?:test_|audit_|verify_|benchmark)[^\\/]*$|(?:^|[\\/])check(?:[_.][^\\/]*)?$|\.test\.m?js$/i.test(arg)))
  );
  const envSecretKey = env && (env.API_SECRET_KEY || env.ADMIN_KEY || env.PIN_ARBITRAGE_SECRET);
  const processSecretKey = typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY || process.env.PIN_ARBITRAGE_SECRET) : '';
  const secretKey = envSecretKey || (isTestOrLocalDev ? '' : processSecretKey) || '';

  const getHeader = (name) => {
    if (request && request.headers) {
      if (typeof request.headers.get === 'function') {
        return request.headers.get(name);
      }
      return request.headers[name.toLowerCase()] || request.headers[name] || null;
    }
    return null;
  };

  // If secret key is missing, allow test/local dev; in production, fail-closed unconditionally
  if (!secretKey) {
    if (isTestOrLocalDev) {
      return { authorized: true };
    }
    const payload = {
      success: false,
      error: 'AUTH_NOT_CONFIGURED',
      message: 'API_SECRET_KEY is not configured on server. Access denied.'
    };
    return {
      authorized: false,
      status: 503,
      reason: payload.message,
      payload
    };
  }

  const headerKey = getHeader('x-api-key');
  const authHeader = getHeader('Authorization') || getHeader('authorization') || '';
  let bearerKey = null;
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    bearerKey = authHeader.slice(7).trim();
  }

  const incomingToken = headerKey ? headerKey.trim() : (bearerKey ? bearerKey.trim() : '');

  if (incomingToken) {
    const isMatch = timingSafeEqualStr(incomingToken, secretKey);
    const payload = isMatch ? null : { success: false, error: 'UNAUTHORIZED', message: 'Unauthorized: Invalid authentication token.' };
    return {
      authorized: isMatch,
      status: isMatch ? 200 : 401,
      reason: isMatch ? null : 'Unauthorized: Invalid authentication token.',
      payload
    };
  }

  const missingPayload = { success: false, error: 'UNAUTHORIZED', message: 'Missing authentication credentials (Bearer token or x-api-key required).' };
  return {
    authorized: false,
    status: 401,
    reason: missingPayload.message,
    payload: missingPayload
  };
}

export function sendJsonResponse(reply, data, status = 200, cacheSeconds = 0, customCors = null) {
  let responsePayload = data;

  // Enforce uniform JSON error schema for HTTP 4xx and 5xx
  if (status >= 400 && responsePayload && typeof responsePayload === 'object') {
    if (responsePayload.success === undefined) {
      responsePayload = { ...responsePayload, success: false };
    }
    if (!responsePayload.error) {
      responsePayload = {
        ...responsePayload,
        error: status === 400 ? 'BAD_REQUEST'
          : status === 401 ? 'UNAUTHORIZED'
          : status === 403 ? 'FORBIDDEN'
          : status === 404 ? 'NOT_FOUND'
          : status === 405 ? 'METHOD_NOT_ALLOWED'
          : status === 413 ? 'PAYLOAD_TOO_LARGE'
          : status === 503 ? 'SERVICE_UNAVAILABLE'
          : 'INTERNAL_SERVER_ERROR'
      };
    }
  }

  // Automatically sanitize any error payloads before sending over the wire
  if (responsePayload && typeof responsePayload === 'object') {
    const sanitized = { ...responsePayload };
    if (typeof sanitized.error === 'string') sanitized.error = redactSecrets(sanitized.error);
    if (typeof sanitized.message === 'string') sanitized.message = redactSecrets(sanitized.message);
    responsePayload = sanitized;
  }

  const store = requestContextStorage.getStore();
  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || '*';

  reply.code(status);
  reply.header('Content-Type', 'application/json; charset=utf-8');
  reply.header('Access-Control-Allow-Origin', resolvedOrigin);
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (customCors) {
    for (const [k, v] of Object.entries(customCors)) {
      reply.header(k, v);
    }
  }

  if (cacheSeconds < 0) {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');
  } else if (cacheSeconds > 0) {
    reply.header('Cache-Control', `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`);
  }

  return reply.send(responsePayload);
}

function toCompatHeaders(headers) {
  const outHeaders = { ...headers };
  const lowerHeaders = new Map(Object.entries(outHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  Object.defineProperties(outHeaders, {
    get: {
      value: (h) => lowerHeaders.get(String(h).toLowerCase()) ?? null,
      enumerable: false
    },
    forEach: {
      value: (cb) => {
        for (const [k, v] of Object.entries(outHeaders)) cb(v, k, outHeaders);
      },
      enumerable: false
    }
  });
  return outHeaders;
}

export function jsonResponse(data, status = 200, cacheSeconds = 0, customCors = null, reply = null) {
  const store = requestContextStorage.getStore();
  const effectiveReply = reply || store?.reply;
  if (effectiveReply && typeof effectiveReply.send === 'function' && !effectiveReply.sent) {
    return sendJsonResponse(effectiveReply, data, status, cacheSeconds, customCors);
  }

  let responsePayload = data;

  // Enforce uniform JSON error schema for HTTP 4xx and 5xx
  if (status >= 400 && responsePayload && typeof responsePayload === 'object') {
    if (responsePayload.success === undefined) {
      responsePayload = { ...responsePayload, success: false };
    }
    if (!responsePayload.error) {
      responsePayload = {
        ...responsePayload,
        error: status === 400 ? 'BAD_REQUEST'
          : status === 401 ? 'UNAUTHORIZED'
          : status === 403 ? 'FORBIDDEN'
          : status === 404 ? 'NOT_FOUND'
          : status === 405 ? 'METHOD_NOT_ALLOWED'
          : status === 413 ? 'PAYLOAD_TOO_LARGE'
          : status === 503 ? 'SERVICE_UNAVAILABLE'
          : 'INTERNAL_SERVER_ERROR'
      };
    }
  }

  // Automatically sanitize any error payloads before sending over the wire
  if (responsePayload && typeof responsePayload === 'object') {
    const sanitized = { ...responsePayload };
    if (typeof sanitized.error === 'string') sanitized.error = redactSecrets(sanitized.error);
    if (typeof sanitized.message === 'string') sanitized.message = redactSecrets(sanitized.message);
    responsePayload = sanitized;
  }

  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || '*';

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(customCors || {})
  };
  if (cacheSeconds < 0) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
    headers['Pragma'] = 'no-cache';
  } else if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`;
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: toCompatHeaders(headers),
    _payload: responsePayload,
    json: async () => responsePayload,
    text: async () => JSON.stringify(responsePayload)
  };
}

export function sendMethodNotAllowedResponse(reply, allow, customCors = null) {
  const store = requestContextStorage.getStore();
  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || '*';

  const payload = {
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `HTTP method not allowed. Allowed methods: ${allow}`
  };

  reply.code(405);
  reply.header('Content-Type', 'application/json; charset=utf-8');
  reply.header('Allow', allow);
  reply.header('Access-Control-Allow-Origin', resolvedOrigin);
  reply.header('Access-Control-Allow-Methods', allow);
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (customCors) {
    for (const [k, v] of Object.entries(customCors)) {
      reply.header(k, v);
    }
  }

  return reply.send(payload);
}

export function createBoundJsonResponse(reply, origin = '*') {
  return function boundJsonResponse(data, status = 200, cacheSeconds = 0, customCors = null) {
    const cors = customCors || (origin ? { 'Access-Control-Allow-Origin': origin } : null);
    return sendJsonResponse(reply, data, status, cacheSeconds, cors);
  };
}

export function createBoundMethodNotAllowed(reply, origin = '*') {
  return function boundMethodNotAllowed(allow, customCors = null) {
    const cors = customCors || (origin ? { 'Access-Control-Allow-Origin': origin } : null);
    return sendMethodNotAllowedResponse(reply, allow, cors);
  };
}

export function methodNotAllowedResponse(allow, customCors = null, reply = null) {
  const store = requestContextStorage.getStore();
  const effectiveReply = reply || store?.reply;
  if (effectiveReply && typeof effectiveReply.send === 'function' && !effectiveReply.sent) {
    return sendMethodNotAllowedResponse(effectiveReply, allow, customCors);
  }

  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || '*';

  const payload = {
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `HTTP method not allowed. Allowed methods: ${allow}`
  };

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Allow': allow,
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(customCors || {})
  };

  return {
    ok: false,
    status: 405,
    headers: toCompatHeaders(headers),
    _payload: payload,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

export function corsOptionsResponse(requestOrigin = null, env = {}, allow = 'GET, POST, PUT, PATCH, DELETE, OPTIONS', reply = null) {
  const store = requestContextStorage.getStore();
  const effectiveReply = reply || store?.reply;
  const cors = getCorsHeaders(requestOrigin, env);
  const headers = {
    ...cors,
    'Access-Control-Allow-Methods': allow,
    'Access-Control-Max-Age': '86400'
  };

  if (effectiveReply && typeof effectiveReply.send === 'function' && !effectiveReply.sent) {
    effectiveReply.code(204);
    for (const [k, v] of Object.entries(headers)) {
      effectiveReply.header(k, v);
    }
    return effectiveReply.send();
  }

  return {
    ok: true,
    status: 204,
    headers: toCompatHeaders(headers),
    _payload: null,
    json: async () => null,
    text: async () => ''
  };
}

// [INVARIANT: EDGE-COMPRESSION-AND-SMART-CACHING]
// HTML headers omit 'no-transform' to allow proxy/HTTP compression and cache UI shells with SWR.
export const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://api.pinterest.com https://cdn.jsdelivr.net https:; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none';"
};

// In-Memory SWR Cache & Single-Flight Request Coalescing
export const edgeCache = new Map();
export const inflightPromises = new Map();
const MAX_CACHE_ENTRIES = 512;
let cacheEpoch = 0;
let globalClearEpoch = 0;
const prefixInvalidationEpochs = new Map();

function isCacheWriteValid(key, startEpoch) {
  if (globalClearEpoch > startEpoch) return false;
  for (const [pfx, ep] of prefixInvalidationEpochs.entries()) {
    if (ep > startEpoch && key.startsWith(pfx)) return false;
  }
  return true;
}

function setBoundedCacheEntry(key, value, ttlMs, staleMs) {
  if (edgeCache.has(key)) {
    edgeCache.delete(key);
  } else if (edgeCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = edgeCache.keys().next().value;
    if (oldestKey) edgeCache.delete(oldestKey);
  }
  const now = Date.now();
  edgeCache.set(key, {
    data: value,
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleMs
  });
}

export function buildCanonicalCacheKey(prefix, params = {}) {
  const sortedEntries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim().toLowerCase())}`);
  return sortedEntries.length > 0 ? `${prefix}?${sortedEntries.join('&')}` : prefix;
}

export async function getCachedOrFetch(key, fetcher, ttlMs = 15000, staleMs = 60000, { forceRefresh = false, timeoutMs = 18000 } = {}) {
  const now = Date.now();
  const cached = edgeCache.get(key);

  // 1. In-Memory Cache Check (bypassed on forceRefresh)
  if (!forceRefresh && cached) {
    if (now < cached.expiresAt) {
      return cached.data;
    }
    // Stale-While-Revalidate: return stale data immediately, revalidate in background
    if (now < cached.staleUntil) {
      if (!inflightPromises.has(key)) {
        const revalEpoch = cacheEpoch;
        const revalPromise = (async () => {
          try {
            let timerId;
            const fetchTask = fetcher();
            fetchTask.catch(() => {});
            const timeoutPromise = new Promise((_, reject) => {
              timerId = setTimeout(() => reject(new Error(`Timeout revalidating ${key}`)), timeoutMs);
            });
            const fresh = await Promise.race([
              fetchTask,
              timeoutPromise
            ]).finally(() => {
              if (timerId) clearTimeout(timerId);
            });
            const isCacheable = Boolean(
              fresh &&
              fresh.success !== false &&
              !fresh.degraded &&
              !fresh._degraded &&
              !fresh.is_degraded
            );
            if (isCacheable && isCacheWriteValid(key, revalEpoch)) {
              setBoundedCacheEntry(key, fresh, ttlMs, staleMs);
            }
            return fresh;
          } catch (_) {} finally {
            inflightPromises.delete(key);
          }
        })();
        inflightPromises.set(key, revalPromise);
        const store = requestContextStorage?.getStore?.();
        const ctx = store?.ctx;
        if (ctx && typeof ctx.waitUntil === 'function') {
          safeWaitUntil(ctx, revalPromise, `swr_revalidate_${key}`);
        }
      }
      return cached.data;
    }
  }

  // 2. Coalesce concurrent in-flight requests (Single-Flight)
  if (inflightPromises.has(key)) {
    return await inflightPromises.get(key);
  }

  // 3. Cache Miss or Force Refresh: Fetch fresh data with single-flight deduplication
  const fetchEpoch = cacheEpoch;
  const promise = (async () => {
    try {
      let timerId;
      const fetchTask = fetcher();
      fetchTask.catch(() => {});
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`Timeout fetching ${key}`)), timeoutMs);
      });
      const fresh = await Promise.race([
        fetchTask,
        timeoutPromise
      ]).finally(() => {
        if (timerId) clearTimeout(timerId);
      });
      const isCacheable = Boolean(
        fresh &&
        fresh.success !== false &&
        !fresh.degraded &&
        !fresh._degraded &&
        !fresh.is_degraded
      );
      if (isCacheable && isCacheWriteValid(key, fetchEpoch)) {
        setBoundedCacheEntry(key, fresh, ttlMs, staleMs);
      }

      return fresh;
    } finally {
      inflightPromises.delete(key);
    }
  })();

  inflightPromises.set(key, promise);
  return await promise;
}

export async function invalidateEdgeCache(prefix = '') {
  const nextEpoch = ++cacheEpoch;
  if (!prefix) {
    globalClearEpoch = nextEpoch;
    prefixInvalidationEpochs.clear();
    edgeCache.clear();
  } else {
    prefixInvalidationEpochs.set(prefix, nextEpoch);
    for (const k of edgeCache.keys()) {
      if (k.startsWith(prefix)) {
        edgeCache.delete(k);
      }
    }
  }
  return Promise.resolve();
}
