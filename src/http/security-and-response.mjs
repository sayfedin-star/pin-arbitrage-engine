/**
 * Pure HTTP Security, Context, Caching & Response Utilities
 *
 * Framework-agnostic primitives shared across Fastify routes, plugins,
 * and services (extracted during Phase 1 Worker-to-Fastify unification).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

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
    .replace(/([?&](?:password|token|secret|apiKey)=)[^&]+/gi, '$1[REDACTED]')
    .replace(/ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech/gi, '[REDACTED_NEON_HOST]');
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

// Timing-Safe Constant-Time String Comparison (Defends against byte-by-byte timing attacks)
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length === b.length ? 0 : 1;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= (charA ^ charB);
  }
  return mismatch === 0;
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

export function safeWaitUntil(promiseOrCtx, explicitPromiseOrCtx = null, taskName = 'bg_task', timeoutMs = 25000) {
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
  effectivePromise.catch(() => {});

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Background task "${taskName}" timed out after ${timeoutMs}ms`)), timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
  const guardedPromise = Promise.race([effectivePromise, timeoutPromise])
    .catch(err => {
      console.error(`[safeWaitUntil] Error in background task "${taskName}":`, redactSecrets(err?.message || String(err)));
    })
    .finally(() => {
      clearTimeout(timer);
    });

  const storage = globalThis.__requestContextStorage || requestContextStorage;
  const store = storage?.getStore?.();
  if (store) {
    if (!Array.isArray(store.bgPromises)) store.bgPromises = [];
    store.bgPromises.push(guardedPromise);
  }

  if (effectiveCtx && typeof effectiveCtx.waitUntil === 'function') {
    try {
      effectiveCtx.waitUntil(guardedPromise);
    } catch {
      // Request context may have already closed
    }
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
    const url = new URL(request.url);
    if (url.searchParams.has('api_key') || url.searchParams.has('key')) {
      return {
        authorized: false,
        status: 401,
        reason: 'Passing API keys in URL query string is deprecated and forbidden. Use x-api-key or Authorization header.',
        response: new Response(
          JSON.stringify({ success: false, error: 'Passing API keys in URL query string is deprecated and forbidden. Use x-api-key or Authorization header.' }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      };
    }
  } catch (_) {}

  const isTestOrLocalDev = (
    env?.ENVIRONMENT === 'test' ||
    env?.NODE_ENV === 'test' ||
    Boolean(globalThis.__PAE_TEST_MODE__) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof process !== 'undefined' && process.argv && process.argv.some(arg => /test_|audit_|verify_|check|benchmark/.test(arg)))
  );
  const envSecretKey = env && (env.API_SECRET_KEY || env.ADMIN_KEY || env.PIN_ARBITRAGE_SECRET);
  const processSecretKey = typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY || process.env.PIN_ARBITRAGE_SECRET) : '';
  const secretKey = envSecretKey || (isTestOrLocalDev ? '' : processSecretKey) || '';

  // If secret key is missing, allow test/local dev; in production, fail-closed unconditionally
  if (!secretKey) {
    if (isTestOrLocalDev) {
      return { authorized: true };
    }
    return {
      authorized: false,
      status: 503,
      reason: 'API_SECRET_KEY is not configured on server. Access denied.',
      response: new Response(
        JSON.stringify({
          success: false,
          error: 'AUTH_NOT_CONFIGURED',
          message: 'API_SECRET_KEY is not configured on server. Access denied.'
        }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
    };
  }

  const headerKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  let bearerKey = null;
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    bearerKey = authHeader.slice(7).trim();
  }

  const incomingToken = headerKey ? headerKey.trim() : (bearerKey ? bearerKey.trim() : '');

  if (incomingToken) {
    const isMatch = timingSafeEqualStr(incomingToken, secretKey);
    return {
      authorized: isMatch,
      status: isMatch ? 200 : 401,
      reason: isMatch ? null : 'Unauthorized: Invalid authentication token.',
      response: isMatch ? null : new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid authentication token.' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    };
  }

  return {
    authorized: false,
    status: 401,
    reason: 'Missing authentication credentials (Bearer token or x-api-key required).',
    response: new Response(
      JSON.stringify({ success: false, error: 'Missing authentication credentials (Bearer token or x-api-key required).' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    )
  };
}

export function jsonResponse(data, status = 200, cacheSeconds = 0, customCors = null) {
  const responsePayload = data;

  // Enforce uniform JSON error schema for HTTP 4xx and 5xx
  if (status >= 400 && responsePayload && typeof responsePayload === 'object') {
    if (responsePayload.success === undefined) {
      responsePayload.success = false;
    }
    if (!responsePayload.error) {
      responsePayload.error = status === 400 ? 'BAD_REQUEST'
        : status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 405 ? 'METHOD_NOT_ALLOWED'
        : status === 413 ? 'PAYLOAD_TOO_LARGE'
        : status === 503 ? 'SERVICE_UNAVAILABLE'
        : 'INTERNAL_SERVER_ERROR';
    }
  }

  // Automatically sanitize any error payloads before sending over the wire
  if (responsePayload && typeof responsePayload === 'object') {
    if (typeof responsePayload.error === 'string') responsePayload.error = redactSecrets(responsePayload.error);
    if (typeof responsePayload.message === 'string') responsePayload.message = redactSecrets(responsePayload.message);
  }

  const store = requestContextStorage.getStore();
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
  headers['Content-Type'] = 'application/json; charset=utf-8';
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`;
  }
  return new Response(JSON.stringify(responsePayload), {
    status,
    headers
  });
}

export function methodNotAllowedResponse(allow, customCors = null) {
  const store = requestContextStorage.getStore();
  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || '*';
  return new Response(JSON.stringify({
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `HTTP method not allowed. Allowed methods: ${allow}`
  }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Allow': allow,
      'Access-Control-Allow-Origin': resolvedOrigin,
      'Access-Control-Allow-Methods': allow,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(customCors || {})
    }
  });
}

export function corsOptionsResponse(requestOrigin = null, env = {}, allow = 'GET, POST, PUT, PATCH, DELETE, OPTIONS') {
  const cors = getCorsHeaders(requestOrigin, env);
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': allow,
      'Access-Control-Max-Age': '86400'
    }
  });
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
            if (isCacheable) {
              edgeCache.set(key, {
                data: fresh,
                expiresAt: Date.now() + ttlMs,
                staleUntil: Date.now() + ttlMs + staleMs
              });
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
      if (isCacheable) {
        if (edgeCache.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = edgeCache.keys().next().value;
          if (oldestKey) edgeCache.delete(oldestKey);
        }
        edgeCache.set(key, {
          data: fresh,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + ttlMs + staleMs
        });
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
  if (!prefix) {
    edgeCache.clear();
  } else {
    for (const k of edgeCache.keys()) {
      if (k.startsWith(prefix)) {
        edgeCache.delete(k);
      }
    }
  }
  return Promise.resolve();
}
