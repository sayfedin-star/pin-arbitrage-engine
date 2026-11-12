/**
 * src/plugins/api-routes.mjs
 *
 * Native Fastify API Plugin.
 * Dispatches domain API sub-routers directly inside Fastify without Web-Response
 * Readable.fromWeb stream bridging or double JSON serialization.
 */

import {
  createUniversalSqlClient,
  enforceNeonPoolerUrl
} from '../db/client.mjs';
import { isClusterRoute, handleClusterRoutes } from '../routes/cluster.mjs';
import { handleCreatorsRoutes } from '../routes/creators.mjs';
import { isKeywordsRoute, handleKeywordsRoutes } from '../routes/keywords.mjs';
import { isPinsRoute, handlePinsRoutes } from '../routes/pins.mjs';
import { handleFleetRoutes } from '../routes/fleet.mjs';
import { handleDomainsRoutes } from '../routes/domains.mjs';
import {
  requestContextStorage,
  redactSecrets,
  normalizePath,
  safeWaitUntil,
  checkPinterestCircuitBreaker,
  tripPinterestCircuitBreaker,
  clampLimit,
  isValidPinId,
  getCorsHeaders,
  verifyApiAuthentication,
  jsonResponse,
  methodNotAllowedResponse,
  corsOptionsResponse,
  getCachedShardSql,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache
} from '../worker.mjs';

function buildFastifyHeaders(rawHeaders = {}) {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) webHeaders.append(key, String(v));
    } else if (value !== undefined) {
      webHeaders.set(key, String(value));
    }
  }
  return webHeaders;
}

function buildNativeRequestAdapter(request, fullUrl, method, webHeaders) {
  const preParsedBody = request.body;
  return {
    url: fullUrl,
    method,
    headers: webHeaders,
    async json() {
      if (preParsedBody === undefined || preParsedBody === null) return {};
      if (typeof preParsedBody === 'string') {
        return preParsedBody ? JSON.parse(preParsedBody) : {};
      }
      if (Buffer.isBuffer(preParsedBody)) {
        const text = preParsedBody.toString('utf8');
        return text ? JSON.parse(text) : {};
      }
      return preParsedBody;
    },
    async text() {
      if (preParsedBody === undefined || preParsedBody === null) return '';
      if (typeof preParsedBody === 'string') return preParsedBody;
      if (Buffer.isBuffer(preParsedBody)) return preParsedBody.toString('utf8');
      return JSON.stringify(preParsedBody);
    }
  };
}

async function sendWebResponseViaFastify(reply, webResponse) {
  reply.code(webResponse.status);
  webResponse.headers.forEach((val, key) => {
    reply.header(key, val);
  });
  if (webResponse.status === 204 || !webResponse.body) {
    return reply.send();
  }
  const buf = Buffer.from(await webResponse.arrayBuffer());
  return reply.send(buf);
}

/**
 * Registers native Fastify API dispatch across all domain sub-routers.
 * Exact routes on the parent app (e.g. /api/health, /api/internal/*) continue to take precedence.
 */
export async function apiRoutesPlugin(app, options = {}) {
  const env = options.env || {};
  const ctx = options.ctx || null;

  async function dispatchApiRequest(request, reply) {
    const rawUrl = request.raw?.url || request.url || '/api';
    const host = request.headers?.host || `127.0.0.1:${process.env.PORT || 3000}`;
    const protocol = request.protocol || 'http';
    const fullUrl = `${protocol}://${host}${rawUrl}`;
    const webHeaders = buildFastifyHeaders(request.headers);
    const method = (request.method || 'GET').toUpperCase();
    const requestOrigin = webHeaders.get('Origin');
    const dynamicCors = getCorsHeaders(requestOrigin, env, fullUrl);

    if (method === 'OPTIONS') {
      const optRes = corsOptionsResponse(requestOrigin, env, 'GET, POST, PUT, PATCH, DELETE, OPTIONS', fullUrl);
      return sendWebResponseViaFastify(reply, optRes);
    }

    const reqAdapter = buildNativeRequestAdapter(request, fullUrl, method, webHeaders);

    const webResponse = await requestContextStorage.run(
      { request: reqAdapter, env, ctx, origin: dynamicCors['Access-Control-Allow-Origin'], bgPromises: [] },
      async () => {
        try {
          const url = new URL(fullUrl);
          const pathname = normalizePath(url.pathname);
          const { searchParams } = url;

          // 1. Security Authentication Gate for Mutating Methods & Sensitive Endpoints
          const isMutatingMethod = method === 'POST' || method === 'DELETE' || method === 'PUT' || method === 'PATCH';
          const isSensitiveEndpoint = pathname === '/api/fleet/url' || pathname === '/api/fleet/warm' || pathname.startsWith('/api/crawl/dispatch');
          if (isMutatingMethod || isSensitiveEndpoint) {
            const auth = verifyApiAuthentication(reqAdapter, env);
            if (!auth.authorized) {
              if (auth.response) return auth.response;
              return jsonResponse({
                success: false,
                error: auth.status === 503 ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
                message: auth.reason || 'Authentication required for mutating or sensitive operations.'
              }, auth.status || 401);
            }
          }

          // 2. Pinterest Rate-Limit Circuit Breaker Gate
          const isLiveScrapeGet = method === 'GET' && searchParams.get('refresh') === 'true' && (
            pathname === '/api/competitors/board-detail' ||
            pathname === '/api/creators/board-detail' ||
            pathname === '/api/creators/pin-detail' ||
            pathname.startsWith('/api/pins/')
          );
          const isCrawlerEndpoint =
            pathname === '/api/crawl' ||
            pathname.startsWith('/api/crawl/') ||
            pathname === '/api/keywords/sync' ||
            pathname === '/api/competitors/dispatch-crawl' ||
            pathname === '/api/creators/dispatch-crawl' ||
            pathname === '/api/competitors/sync' ||
            pathname === '/api/creators/sync' ||
            pathname === '/api/competitors/sync-boards' ||
            pathname === '/api/creators/sync-boards' ||
            pathname === '/api/competitors/sync-pins' ||
            pathname === '/api/creators/sync-pins' ||
            pathname === '/api/competitors/fast-refresh' ||
            pathname === '/api/creators/fast-refresh' ||
            pathname === '/api/competitors/audit-sweep' ||
            pathname === '/api/creators/audit-sweep' ||
            pathname === '/api/creators/quick-pulse' ||
            pathname === '/api/competitors/quick-pulse' ||
            pathname === '/api/creators/deep-harvest' ||
            pathname === '/api/competitors/deep-harvest' ||
            pathname === '/api/competitors/related-pins/harvest-live' ||
            pathname === '/api/creators/related-pins/harvest-live' ||
            (pathname.startsWith('/api/pins/') && pathname.endsWith('/sync')) ||
            isLiveScrapeGet;

          if (isCrawlerEndpoint && (isMutatingMethod || pathname.startsWith('/api/crawl/dispatch') || isLiveScrapeGet)) {
            const cb = await checkPinterestCircuitBreaker(env);
            if (cb?.active) {
              return new Response(JSON.stringify({
                success: false,
                error: 'PINTEREST_RATE_LIMITED',
                message: `Pinterest rate-limit circuit breaker is active. Operations cooling down for ${cb.remaining_seconds}s.`,
                retry_after: cb.remaining_seconds,
                reason: cb.reason
              }), {
                status: 429,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Retry-After': String(cb.remaining_seconds),
                  'X-Circuit-Breaker': 'OPEN',
                  ...dynamicCors
                }
              });
            }
          }

          // 3. Scale-to-Zero Lightweight Non-DB Endpoints
          if (method === 'GET' && pathname === '/api/crawl-status') {
            return jsonResponse({
              is_crawling: false,
              mode: 'github_actions_pipeline',
              message: 'Managed in GitHub Actions'
            });
          }

          if (method === 'GET' && pathname === '/api/settings/cookie' && !env?.DATABASE_URL && !env?.SQL_CLIENT && !process.env?.DATABASE_URL) {
            const cookie = env?.PINTEREST_COOKIE || process.env?.PINTEREST_COOKIE || '';
            return jsonResponse({
              has_cookie: Boolean(cookie && cookie.trim().length > 10),
              is_configured: Boolean(cookie && cookie.trim().length > 10),
              preview: cookie ? `${cookie.slice(0, 42)}...` : '',
              source: 'node_native_env'
            });
          }

          // 4. SQL Client Resolution
          let sql = env?.SQL_CLIENT;
          if (!sql) {
            const directNeonUrl = env?.DATABASE_URL || process.env?.DATABASE_URL || null;
            if (directNeonUrl) {
              const pooledDirectUrl = enforceNeonPoolerUrl(directNeonUrl);
              sql = getCachedShardSql(pooledDirectUrl, () => createUniversalSqlClient(directNeonUrl));
            }
          }

          if (!sql) {
            const isNonDbRoute =
              pathname === '/api/pins/resolve-shortlink' ||
              pathname === '/api/urls/global-saves' ||
              pathname === '/api/urls/batch-global-saves' ||
              pathname.startsWith('/api/boards') ||
              pathname.endsWith('/latest-pins');

            if (!isNonDbRoute) {
              return jsonResponse({
                error: 'DATABASE_URL secret is not set on server environment.',
                hint: 'Configure DATABASE_URL in .env or environment settings.'
              }, 500);
            }
          }

          let targetSql = sql;
          const reqProjectId = searchParams.get('project_id') || (!pathname.startsWith('/api/fleet') ? searchParams.get('shard') : null) || webHeaders.get('x-target-project');
          if (reqProjectId && reqProjectId !== 'all' && reqProjectId !== 'hub') {
            const resolvedShardSql = getCachedShardSql(String(reqProjectId).trim());
            if (resolvedShardSql) {
              targetSql = resolvedShardSql;
            }
          }

          // 6. Native Sub-Router Dispatch
          if (isClusterRoute(pathname)) {
            const clusterRes = await handleClusterRoutes({
              pathname,
              method,
              request: reqAdapter,
              searchParams,
              env,
              ctx,
              sql,
              targetSql,
              reqProjectId,
              jsonResponse,
              methodNotAllowedResponse,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              redactSecrets
            });
            if (clusterRes) return clusterRes;
          }

          if (pathname.startsWith('/api/creators') || pathname.startsWith('/api/competitors') || pathname.startsWith('/api/boards')) {
            const creatorsRes = await handleCreatorsRoutes({
              pathname,
              method,
              request: reqAdapter,
              searchParams,
              env,
              ctx,
              sql,
              targetSql,
              reqProjectId,
              jsonResponse,
              methodNotAllowedResponse,
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
              request: reqAdapter,
              searchParams,
              env,
              ctx,
              sql,
              targetSql,
              jsonResponse,
              methodNotAllowedResponse,
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
              request: reqAdapter,
              searchParams,
              env,
              ctx,
              sql,
              targetSql,
              jsonResponse,
              methodNotAllowedResponse,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              isValidPinId,
              redactSecrets
            });
            if (pinsRes) return pinsRes;
          }

          if (pathname.startsWith('/api/fleet')) {
            const fleetRes = await handleFleetRoutes({
              pathname,
              method,
              request: reqAdapter,
              searchParams,
              env,
              ctx,
              sql,
              jsonResponse,
              methodNotAllowedResponse,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil
            });
            if (fleetRes) return fleetRes;
          }

          if (pathname.startsWith('/api/domains')) {
            const domainsRes = await handleDomainsRoutes({
              env,
              pathname,
              method,
              request: reqAdapter,
              searchParams,
              sql,
              ctx,
              jsonResponse,
              clampLimit,
              buildCanonicalCacheKey,
              getCachedOrFetch,
              invalidateEdgeCache,
              safeWaitUntil,
              redactSecrets
            });
            if (domainsRes) return domainsRes;
          }

          return jsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: `Endpoint '${pathname}' not found on pin-arbitrage-engine API.`
          }, 404);
        } catch (err) {
          const isSyntaxError = err instanceof SyntaxError || err.name === 'SyntaxError';
          const status = isSyntaxError ? 400 : (err.status || 500);
          return jsonResponse({
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

    return sendWebResponseViaFastify(reply, webResponse);
  }

  // Register explicit domain prefixes cleanly inside Fastify's native route tree
  app.all('/api/pins/*', dispatchApiRequest);
  app.all('/api/urls/*', dispatchApiRequest);
  app.all('/api/folders', dispatchApiRequest);
  app.all('/api/folders/*', dispatchApiRequest);
  app.all('/api/keywords', dispatchApiRequest);
  app.all('/api/keywords/*', dispatchApiRequest);
  app.all('/api/discovery/*', dispatchApiRequest);
  app.all('/api/settings/*', dispatchApiRequest);
  app.all('/api/creators', dispatchApiRequest);
  app.all('/api/creators/*', dispatchApiRequest);
  app.all('/api/competitors', dispatchApiRequest);
  app.all('/api/competitors/*', dispatchApiRequest);
  app.all('/api/boards/*', dispatchApiRequest);
  app.all('/api/fleet/*', dispatchApiRequest);
  app.all('/api/domains', dispatchApiRequest);
  app.all('/api/domains/*', dispatchApiRequest);
  app.all('/api/pulse/*', dispatchApiRequest);
  app.all('/api/*', dispatchApiRequest);
}

export default apiRoutesPlugin;
