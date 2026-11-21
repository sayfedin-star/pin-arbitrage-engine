/**
 * src/plugins/api-routes.mjs
 *
 * Native Fastify API Plugin.
 * Dispatches domain API sub-routers directly inside Fastify without Web-Response
 * Readable.fromWeb stream bridging or double JSON serialization.
 */

import { getSqlClient } from '../db/client.mjs';
import { isClusterRoute, handleClusterRoutes } from '../routes/cluster.mjs';
import { isCreatorsRoute, handleCreatorsRoutes } from '../routes/creators.mjs';
import { isKeywordsRoute, handleKeywordsRoutes } from '../routes/keywords.mjs';
import { isPinsRoute, handlePinsRoutes } from '../routes/pins.mjs';
import { handleDomainsRoutes } from '../routes/domains.mjs';
import { isNewbornRoute, handleNewbornRoutes, NEWBORN_CRAWLER_PATHS } from '../routes/newborn.mjs';
import { invalidateFolderCache } from '../modules/keywords/folders-crossover.mjs';
import { invalidateGlobalPulseCache } from '../modules/pulse/service.mjs';
import {
  requestContextStorage,
  redactSecrets,
  safeWaitUntil,
  normalizePath,
  checkPinterestCircuitBreaker,
  tripPinterestCircuitBreaker,
  clampLimit,
  isValidPinId,
  getCorsHeaders,
  verifyApiAuthentication,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  createBoundJsonResponse,
  createBoundMethodNotAllowed
} from '../http/security-and-response.mjs';

const CREATOR_CRAWLER_PATHS = new Set([
  '/api/creators/dispatch-crawl',
  '/api/creators/sync',
  '/api/creators/sync-boards',
  '/api/creators/sync-pins',
  '/api/creators/fast-refresh',
  '/api/creators/audit-sweep',
  '/api/creators/quick-pulse',
  '/api/creators/deep-harvest',
  '/api/creators/related-pins/harvest-live'
]);

/**
 * Registers native Fastify API dispatch across all domain sub-routers.
 * Exact routes on the parent app (e.g. /api/health, /api/internal/*) continue to take precedence.
 */
export async function apiRoutesPlugin(app, options = {}) {
  const env = options.env || {};
  const ctx = options.ctx || null;

  // Canonical compatibility rewrite: map /api/competitors & /api/competitors/* -> /api/creators & /api/creators/*
  app.addHook('onRequest', async (request) => {
    const raw = request.raw?.url || '';
    if (/^\/api\/competitors(?=\/|\?|$)/i.test(raw)) {
      request.raw.url = raw.replace(/^\/api\/competitors/i, '/api/creators');
    }
  });

  async function dispatchApiRequest(request, reply) {
    const rawUrl = request.raw?.url || request.url || '/api';
    const host = request.headers?.host || `127.0.0.1:${process.env.PORT || 3000}`;
    const protocol = request.protocol || 'http';
    const fullUrl = `${protocol}://${host}${rawUrl}`;
    const method = (request.method || 'GET').toUpperCase();
    const requestOrigin = request.headers?.origin || request.headers?.Origin || null;
    const dynamicCors = getCorsHeaders(requestOrigin, env, fullUrl);

    if (method === 'OPTIONS') {
      reply.code(204);
      for (const [k, v] of Object.entries(dynamicCors)) {
        reply.header(k, v);
      }
      if (dynamicCors['Access-Control-Allow-Origin']) {
        reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        reply.header('Access-Control-Max-Age', '86400');
      }
      return reply.send();
    }

    if (typeof request.headers.get !== 'function') {
      request.headers.get = (name) => {
        const val = request.headers[String(name).toLowerCase()];
        return val !== undefined ? String(val) : null;
      };
    }
    if (typeof request.json !== 'function') {
      request.json = async () => {
        if (request.body === undefined || request.body === null) return {};
        if (typeof request.body === 'string') {
          return request.body ? JSON.parse(request.body) : {};
        }
        if (Buffer.isBuffer(request.body)) {
          const text = request.body.toString('utf8');
          return text ? JSON.parse(text) : {};
        }
        return request.body;
      };
    }
    if (typeof request.text !== 'function') {
      request.text = async () => {
        if (request.body === undefined || request.body === null) return '';
        if (typeof request.body === 'string') return request.body;
        if (Buffer.isBuffer(request.body)) return request.body.toString('utf8');
        return JSON.stringify(request.body);
      };
    }
    request.fullUrl = fullUrl;

    const outerStore = requestContextStorage.getStore();
    const externalCustomCtx = outerStore?.customCtx && outerStore.customCtx !== ctx ? outerStore.customCtx : null;
    const effectiveCtx = externalCustomCtx || ctx;
    const origin = dynamicCors['Access-Control-Allow-Origin'];
    const boundJsonResponse = createBoundJsonResponse(reply, origin);
    const boundMethodNotAllowed = createBoundMethodNotAllowed(reply, origin);

    const routeResult = await requestContextStorage.run(
      {
        request,
        reply,
        env,
        ctx: effectiveCtx,
        customCtx: externalCustomCtx,
        origin,
        bgPromises: []
      },
      async () => {
        try {
          const url = new URL(fullUrl);
          const pathname = normalizePath(url.pathname);
          const { searchParams } = url;

          // 0. Decommissioned Endpoints Gate (RFC 404 compliance before auth gate)
          if (
            pathname === '/api/board-ideas' ||
            pathname.startsWith('/api/board-ideas/') ||
            pathname === '/api/fleet' ||
            pathname.startsWith('/api/fleet/')
          ) {
            return boundJsonResponse({
              success: false,
              error: 'NOT_FOUND',
              message: `Endpoint '${pathname}' not found on pin-arbitrage-engine API.`
            }, 404);
          }

          // 1. Security Authentication Gate for Mutating Methods, Sensitive Endpoints & Side-Effecting GETs
          const isMutatingMethod = method === 'POST' || method === 'DELETE' || method === 'PUT' || method === 'PATCH';
          const isSensitiveEndpoint = pathname === '/api/cache/invalidate' || pathname.startsWith('/api/crawl/dispatch');
          const isSideEffectingGet = method === 'GET' && (
            searchParams.get('auto_create') === 'true' ||
            searchParams.get('refresh') === 'true' ||
            searchParams.get('force') === 'true' ||
            searchParams.get('force_refresh') === 'true' ||
            pathname === '/api/keywords/visual-search' ||
            pathname === '/api/urls/global-saves' ||
            pathname === '/api/pins/resolve-shortlink' ||
            /^\/api\/pins\/[^/]+\/annotations-intel$/.test(pathname)
          );

          if (isMutatingMethod || isSensitiveEndpoint || isSideEffectingGet) {
            const auth = verifyApiAuthentication(request, env);
            if (!auth.authorized) {
              return boundJsonResponse(
                auth.payload || {
                  success: false,
                  error: auth.status === 503 ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
                  message: auth.reason || 'Authentication required for mutating or side-effecting operations.'
                },
                auth.status || 401
              );
            }
          }

          // 2. Pinterest Rate-Limit Circuit Breaker Gate
          const isAnnotationsIntelGet = method === 'GET' && /^\/api\/pins\/[^/]+\/annotations-intel$/.test(pathname);
          const isLiveScrapeGet = isAnnotationsIntelGet || (
            method === 'GET' && searchParams.get('refresh') === 'true' && (
              pathname === '/api/creators/board-detail' ||
              pathname === '/api/creators/pin-detail' ||
              pathname.startsWith('/api/pins/')
            )
          );
          const isFleetRoutableNewbornPath =
            pathname === '/api/newborn/cluster/hunt' ||
            pathname === '/api/newborn/discover';
          const isCrawlerEndpoint =
            pathname === '/api/crawl' ||
            pathname.startsWith('/api/crawl/') ||
            pathname === '/api/keywords/sync' ||
            CREATOR_CRAWLER_PATHS.has(pathname) ||
            (NEWBORN_CRAWLER_PATHS.has(pathname) && !isFleetRoutableNewbornPath) ||
            /^\/api\/newborn\/candidates\/[^/]+\/fetch-account$/.test(pathname) ||
            (pathname.startsWith('/api/pins/') && pathname.endsWith('/sync')) ||
            isLiveScrapeGet;

          if (isCrawlerEndpoint && (isMutatingMethod || pathname.startsWith('/api/crawl/dispatch') || isLiveScrapeGet)) {
            const cb = await checkPinterestCircuitBreaker(env);
            if (cb?.active) {
              reply.code(429);
              reply.header('Content-Type', 'application/json; charset=utf-8');
              reply.header('Retry-After', String(cb.remaining_seconds));
              reply.header('X-Circuit-Breaker', 'OPEN');
              for (const [k, v] of Object.entries(dynamicCors)) {
                reply.header(k, v);
              }
              return reply.send({
                success: false,
                error: 'PINTEREST_RATE_LIMITED',
                message: `Pinterest rate-limit circuit breaker is active. Operations cooling down for ${cb.remaining_seconds}s.`,
                retry_after: cb.remaining_seconds,
                reason: cb.reason
              });
            }
          }

          // 3. Scale-to-Zero Lightweight Non-DB Endpoints
          if (method === 'GET' && pathname === '/api/crawl-status') {
            return boundJsonResponse({
              is_crawling: false,
              mode: 'github_actions_pipeline',
              message: 'Managed in GitHub Actions'
            });
          }

          if (method === 'GET' && pathname === '/api/settings/cookie' && !env?.DATABASE_URL && !env?.SQL_CLIENT && !process.env?.DATABASE_URL) {
            const cookie = env?.PINTEREST_COOKIE || process.env?.PINTEREST_COOKIE || '';
            const hasCookie = Boolean(cookie && cookie.trim().length > 10);
            return boundJsonResponse({
              has_cookie: hasCookie,
              is_configured: hasCookie,
              preview: hasCookie ? '[CONFIGURED]' : '',
              source: 'node_native_env'
            }, 200, -1);
          }

          // 3B. Authenticated Cache Invalidation Endpoint (for GitHub Actions & Internal Pipelines)
          if (pathname === '/api/cache/invalidate') {
            if (method !== 'POST') {
              return boundMethodNotAllowed('POST, OPTIONS');
            }
            const body = await request.json().catch(() => ({}));
            invalidateFolderCache();
            await invalidateEdgeCache();
            await invalidateGlobalPulseCache(env, ctx).catch(() => {});
            return boundJsonResponse({
              success: true,
              invalidated: true,
              epoch: String(Date.now()),
              scope: body?.scope || 'all',
              event: body?.event || 'manual'
            });
          }

          // 4. Unified SQL Client Resolution
          let sql = env?.SQL_CLIENT;
          if (!sql && (env?.DATABASE_URL || process.env?.DATABASE_URL)) {
            sql = getSqlClient(env);
          }

          if (!sql) {
            const isNonDbRoute =
              pathname === '/api/pins/resolve-shortlink' ||
              pathname === '/api/urls/global-saves' ||
              pathname === '/api/urls/batch-global-saves' ||
              (method === 'GET' && (
                pathname === '/api/newborn/settings' ||
                pathname === '/api/newborn/cookie' ||
                pathname === '/api/newborn/launchpad' ||
                pathname === '/api/newborn/idea-intelligence' ||
                pathname === '/api/newborn/clusters'
              )) ||
              pathname.startsWith('/api/boards') ||
              pathname.endsWith('/latest-pins');

            if (!isNonDbRoute) {
              return boundJsonResponse({
                error: 'DATABASE_URL secret is not set on server environment.',
                hint: 'Configure DATABASE_URL in .env or environment settings.'
              }, 500);
            }
          }

          // 5. Native Sub-Router Dispatch
          if (isClusterRoute(pathname)) {
            const clusterRes = await handleClusterRoutes({
              pathname,
              method,
              request,
              reply,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              redactSecrets
            });
            if (clusterRes) return clusterRes;
          }

          if (isCreatorsRoute(pathname)) {
            const creatorsRes = await handleCreatorsRoutes({
              pathname,
              method,
              request,
              reply,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              tripPinterestCircuitBreaker
            });
            if (creatorsRes) return creatorsRes;
          }

          if (isKeywordsRoute(pathname)) {
            const keywordsRes = await handleKeywordsRoutes({
              pathname,
              method,
              request,
              reply,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              isValidPinId,
              tripPinterestCircuitBreaker,
              redactSecrets
            });
            if (keywordsRes) return keywordsRes;
          }

          if (isPinsRoute(pathname)) {
            const pinsRes = await handlePinsRoutes({
              pathname,
              method,
              request,
              reply,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              isValidPinId,
              redactSecrets
            });
            if (pinsRes) return pinsRes;
          }

          if (pathname.startsWith('/api/domains')) {
            const domainsRes = await handleDomainsRoutes({
              env,
              pathname,
              method,
              request,
              reply,
              searchParams,
              sql,
              ctx,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              redactSecrets
            });
            if (domainsRes) return domainsRes;
          }

          if (isNewbornRoute(pathname)) {
            const newbornRes = await handleNewbornRoutes({
              pathname,
              method,
              request,
              reply,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse: boundJsonResponse,
              methodNotAllowedResponse: boundMethodNotAllowed,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              checkPinterestCircuitBreaker,
              tripPinterestCircuitBreaker,
              redactSecrets
            });
            if (newbornRes) return newbornRes;
          }

          return boundJsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: `Endpoint '${pathname}' not found on pin-arbitrage-engine API.`
          }, 404);
        } catch (err) {
          const isSyntaxError = err instanceof SyntaxError || err.name === 'SyntaxError';
          const status = isSyntaxError ? 400 : (err.status || 500);
          return boundJsonResponse({
            success: false,
            error: status === 400 ? 'BAD_REQUEST'
              : status === 404 ? 'NOT_FOUND'
              : status === 405 ? 'METHOD_NOT_ALLOWED'
              : status === 413 ? 'PAYLOAD_TOO_LARGE'
              : status === 503 ? 'SERVICE_UNAVAILABLE'
              : 'INTERNAL_SERVER_ERROR',
            message: redactSecrets(err?.message || 'An unexpected internal error occurred')
          }, status);
        }
      }
    );

    if (reply.sent) {
      return reply;
    }
    if (routeResult !== undefined && routeResult !== reply) {
      return reply.code(200).header('Content-Type', 'application/json; charset=utf-8').send(routeResult);
    }
    return reply.send();
  }

  // Clean route registration: explicit 512 KiB bodyLimit on bulk-import + unified /api & /api/* catch-alls
  app.post('/api/keywords/bulk-import', { bodyLimit: 512 * 1024 }, dispatchApiRequest);
  app.all('/api', dispatchApiRequest);
  app.all('/api/*', dispatchApiRequest);
}

export default apiRoutesPlugin;
