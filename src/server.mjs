#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (PAE)
 * Universal Fastify Node.js Application Server
 *
 * Native Fastify runtime eliminating double Web-fetch bridge bottlenecks.
 * Features declarative Node-native route dispatch with p-limit(4) non-blocking background queue.
 *
 * // [INVARIANT: FASTIFY-NATIVE-RUNTIME]
 * // [INVARIANT: NON-BLOCKING-QUEUE-EXECUTION]
 * // [INVARIANT: ZERO-WEB-FETCH-BRIDGE-HEALTH]
 *
 * Runs on port 3000 (or process.env.PORT)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { createSqlClient, getSqlClient } from './db/client.mjs';
import { apiRoutesPlugin } from './plugins/api-routes.mjs';
import { handlePagesRoutes } from './routes/pages.mjs';
import {
  HTML_HEADERS,
  RESERVED_KEYWORD_SLUGS,
  requestContextStorage,
  redactSecrets,
  normalizePath,
  isValidPinId,
  getCorsHeaders,
  jsonResponse,
  methodNotAllowedResponse,
  corsOptionsResponse
} from './http/security-and-response.mjs';

export { createSqlClient, getSqlClient };

// Auto-load .env if present via built-in Node 20.12+/22+ API
if (typeof process !== 'undefined' && typeof process.loadEnvFile === 'function') {
  try {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('your_password')) {
      delete process.env.DATABASE_URL;
    }
    process.loadEnvFile();
  } catch (_) {}
}

let cachedServerSqlClient = null;
let cachedServerDsn = '';

export function getServerSqlClient(dsn) {
  const targetDsn = dsn || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') || '';
  if (!targetDsn) return null;
  if (cachedServerSqlClient && cachedServerDsn === targetDsn) {
    return cachedServerSqlClient;
  }
  cachedServerDsn = targetDsn;
  cachedServerSqlClient = createSqlClient(targetDsn, {
    max: Number(process.env.PG_POOL_MAX || 10)
  });
  return cachedServerSqlClient;
}

export const sql = (typeof process !== 'undefined' && process.env?.DATABASE_URL) ? getServerSqlClient() : null;

export async function dbHealthCheck(client) {
  const sqlClient = client || getServerSqlClient();
  if (!sqlClient) return { status: 'disconnected' };
  try {
    await sqlClient`SELECT 1 as alive;`;
    return { status: 'connected' };
  } catch (err) {
    return { status: 'error', error: err?.message || String(err) };
  }
}

export function getPoolStats() {
  return { active: 1, idle: 0 };
}

/**
 * Concurrency-limited in-memory background task queue (p-limit(4) pattern)
 * Decouples background tasks from HTTP response latency so responses complete immediately.
 */
export class AsyncTaskQueue {
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: typeof task === 'function' ? task : () => task,
        resolve,
        reject
      });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(() => item.fn())
        .then((res) => {
          item.resolve(res);
        })
        .catch((err) => {
          console.warn('[server.mjs background task note]:', err?.message || err);
          item.reject(err);
        })
        .finally(() => {
          this.running--;
          this._drain();
        });
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}

export const serverBackgroundTaskQueue = new AsyncTaskQueue(4);

/**
 * Git Commit SHA resolver for active runtime telemetry and CI/CD verification
 */
let cachedGitCommitSha = null;

export function getGitCommitSha(forceRefresh = false) {
  if (cachedGitCommitSha && !forceRefresh) return cachedGitCommitSha;
  if (process.env.COMMIT_SHA && !forceRefresh) {
    cachedGitCommitSha = process.env.COMMIT_SHA.trim();
    return cachedGitCommitSha;
  }
  if (process.env.GITHUB_SHA && !forceRefresh) {
    cachedGitCommitSha = process.env.GITHUB_SHA.trim();
    return cachedGitCommitSha;
  }
  try {
    const gitHeadPath = path.resolve(process.cwd(), '.git/HEAD');
    if (fs.existsSync(gitHeadPath)) {
      const headRef = fs.readFileSync(gitHeadPath, 'utf8').trim();
      if (headRef.startsWith('ref: ')) {
        const refPath = path.resolve(process.cwd(), '.git', headRef.slice(5));
        if (fs.existsSync(refPath)) {
          cachedGitCommitSha = fs.readFileSync(refPath, 'utf8').trim();
          return cachedGitCommitSha;
        }
        const packedRefsPath = path.resolve(process.cwd(), '.git/packed-refs');
        if (fs.existsSync(packedRefsPath)) {
          const targetRef = headRef.slice(5);
          const lines = fs.readFileSync(packedRefsPath, 'utf8').split('\n');
          for (const line of lines) {
            if (line.endsWith(targetRef)) {
              const [sha] = line.split(' ');
              if (sha) {
                cachedGitCommitSha = sha.trim();
                return cachedGitCommitSha;
              }
            }
          }
        }
      }
      cachedGitCommitSha = headRef;
      return cachedGitCommitSha;
    }
  } catch (_) {}
  return 'unknown';
}

/**
 * Timing-safe string comparison to prevent timing side-channel attacks on secret keys
 */
function timingSafeEqualStr(a, b) {
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

/**
 * Creates and configures the native Fastify application instance.
 * Eliminates double Web-fetch bridge bottlenecks for declarative routes.
 */
export function createFastifyApp(customEnv = {}) {
  const app = Fastify({
    logger: false,
    keepAliveTimeout: 60000,
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: true,
    rewriteUrl(req) {
      const raw = req.url || '/';
      const qIdx = raw.indexOf('?');
      const pathPart = qIdx === -1 ? raw : raw.slice(0, qIdx);
      const queryPart = qIdx === -1 ? '' : raw.slice(qIdx);
      return normalizePath(pathPart) + queryPart;
    }
  });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || !body.trim()) {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.setErrorHandler((err, _request, reply) => {
    const isSyntax = err instanceof SyntaxError || err?.name === 'SyntaxError' || err?.code === 'FST_ERR_CTP_INVALID_JSON_BODY';
    const status = isSyntax ? 400 : (err?.statusCode || err?.status || 500);
    const errorCode = status === 400 ? 'BAD_REQUEST'
      : status === 401 ? 'UNAUTHORIZED'
      : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND'
      : status === 405 ? 'METHOD_NOT_ALLOWED'
      : status === 413 ? 'PAYLOAD_TOO_LARGE'
      : status === 503 ? 'SERVICE_UNAVAILABLE'
      : 'INTERNAL_SERVER_ERROR';
    return reply
      .code(status)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({
        success: false,
        error: errorCode,
        message: redactSecrets(err?.message || 'An unexpected internal error occurred')
      });
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('X-Content-Type-Options')) reply.header('X-Content-Type-Options', 'nosniff');
    if (!reply.hasHeader('X-Frame-Options')) reply.header('X-Frame-Options', 'DENY');
    if (!reply.hasHeader('Referrer-Policy')) reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  const sqlClient = customEnv.SQL_CLIENT || getServerSqlClient(process.env.DATABASE_URL);

  const env = {
    ...process.env,
    DATABASE_TOPOLOGY: customEnv.DATABASE_TOPOLOGY || process.env.DATABASE_TOPOLOGY || 'unified_postgres',
    SQL_CLIENT: sqlClient,
    DATABASE_URL: process.env.DATABASE_URL || '',
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    NODE_ENV: process.env.NODE_ENV || 'development',
    ...customEnv
  };

  // Non-blocking background task queue context
  const ctx = {
    waitUntil(p) {
      const store = requestContextStorage?.getStore?.();
      if (store?.customCtx && store.customCtx !== ctx && typeof store.customCtx.waitUntil === 'function') {
        return store.customCtx.waitUntil(p);
      }
      if (p) {
        serverBackgroundTaskQueue.add(typeof p === 'function' ? p : () => p).catch((err) => {
          console.warn('[server.mjs background task note]:', err?.message || err);
        });
      }
    }
  };

  // 1. Native Fastify GET /api/health (Zero-copy, zero-bridge)
  app.get('/api/health', async (request, reply) => {
    const currentSql = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
    let dbStatus = 'disconnected';
    let dbError = null;

    if (currentSql) {
      try {
        await currentSql`SELECT 1 as alive;`;
        dbStatus = 'connected';
      } catch (err) {
        dbError = err?.message || String(err);
      }
    }

    const isHealthy = dbStatus === 'connected' || !env.DATABASE_URL;
    const payload = {
      status: isHealthy ? 'healthy' : 'degraded',
      server: 'node_native_pae_server',
      database: dbStatus,
      topology: env.DATABASE_TOPOLOGY || 'unified_postgres',
      commit: getGitCommitSha(),
      uptime_seconds: Math.floor(process.uptime()),
      background_queue: {
        pending: serverBackgroundTaskQueue.pending,
        active: serverBackgroundTaskQueue.active
      },
      timestamp: new Date().toISOString()
    };

    if (dbError) payload.error = dbError;

    return reply
      .code(isHealthy ? 200 : 503)
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .send(payload);
  });

  // 2. Native Fastify POST /api/internal/ingest (Zero-copy JSON parsing & Auth)
  app.post('/api/internal/ingest', async (request, reply) => {
    const secretKey = env.API_SECRET_KEY || env.ADMIN_KEY || env.INTERNAL_INGEST_KEY || (typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY) : '') || '';
    const isTestOrDev = env.NODE_ENV === 'test' || env.ENVIRONMENT === 'test' || Boolean(globalThis.__PAE_TEST_MODE__);

    const authHeader = request.headers.authorization || '';
    const headerKey = request.headers['x-api-key'] || '';
    let bearerToken = '';
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      bearerToken = authHeader.slice(7).trim();
    }
    const token = (typeof headerKey === 'string' ? headerKey.trim() : '') || bearerToken;

    if (!secretKey && !isTestOrDev) {
      return reply.code(503).header('Content-Type', 'application/json').send({
        success: false,
        error: 'AUTH_NOT_CONFIGURED',
        message: 'API_SECRET_KEY is not configured on server. Internal ingestion denied.'
      });
    }

    if (secretKey) {
      const isMatch = token && timingSafeEqualStr(token, secretKey);
      if (!isMatch) {
        return reply.code(401).header('Content-Type', 'application/json').send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Unauthorized: Invalid ingestion authentication token.'
        });
      }
    }

    const payload = request.body || {};
    const items = Array.isArray(payload.pins) ? payload.pins : (Array.isArray(payload.items) ? payload.items : []);
    const creator = payload.creator || payload.account_username || null;
    const ingestType = payload.type || (creator ? 'competitor_pins' : 'pins');

    const currentSql = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
    if (items.length > 0 && currentSql) {
      serverBackgroundTaskQueue.add(async () => {
        try {
          if (creator) {
            const { ingestPinsBatch } = await import('./modules/creators/service.mjs');
            await ingestPinsBatch(currentSql, items, creator, { filterQualified: Boolean(payload.filterQualified) });
          } else {
            const { ingestPinsBatch } = await import('./modules/pins/repository.mjs');
            await ingestPinsBatch(currentSql, items, { pillar: 'internal_ingest' });
          }
        } catch (ingestErr) {
          console.error('[POST /api/internal/ingest background note]:', ingestErr?.message || ingestErr);
        }
      });
    }

    return reply.code(202).header('Content-Type', 'application/json').send({
      success: true,
      queued: true,
      type: ingestType,
      received: items.length,
      creator: creator || null,
      message: `Successfully accepted and queued ${items.length} items for background ingestion.`
    });
  });

  // 3. Native Fastify GET /api/internal/queue
  app.get('/api/internal/queue', async (request, reply) => {
    return reply.code(200).header('Content-Type', 'application/json').send({
      success: true,
      pending: serverBackgroundTaskQueue.pending,
      active: serverBackgroundTaskQueue.active
    });
  });

  // 3b. Native Fastify POST /api/internal/self-update (Layer 3 Webhook Self-Sync)
  app.post('/api/internal/self-update', async (request, reply) => {
    const secretKey = env.API_SECRET_KEY || env.ADMIN_KEY || env.INTERNAL_INGEST_KEY || (typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY) : '') || '';
    const isTestOrDev = env.NODE_ENV === 'test' || env.ENVIRONMENT === 'test' || Boolean(globalThis.__PAE_TEST_MODE__);

    const authHeader = request.headers.authorization || '';
    const headerKey = request.headers['x-api-key'] || '';
    let bearerToken = '';
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      bearerToken = authHeader.slice(7).trim();
    }
    const token = (typeof headerKey === 'string' ? headerKey.trim() : '') || bearerToken;

    if (!secretKey && !isTestOrDev) {
      return reply.code(503).header('Content-Type', 'application/json').send({
        success: false,
        error: 'AUTH_NOT_CONFIGURED',
        message: 'API_SECRET_KEY is not configured on server.'
      });
    }

    if (secretKey) {
      const isMatch = token && timingSafeEqualStr(token, secretKey);
      if (!isMatch) {
        return reply.code(401).header('Content-Type', 'application/json').send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Unauthorized: Invalid self-update authentication token.'
        });
      }
    }

    const currentSha = getGitCommitSha(true);
    serverBackgroundTaskQueue.add(async () => {
      const scriptPath = path.resolve(process.cwd(), 'scripts/instabox-boot-sync.sh');
      if (fs.existsSync(scriptPath)) {
        await new Promise((resolve) => {
          execFile('bash', [scriptPath, '--force'], { timeout: 120000 }, () => {
            const updatedSha = getGitCommitSha(true);
            if (updatedSha !== currentSha && fs.existsSync('/data/app/.git')) {
              setTimeout(() => {
                execFile('sudo', ['systemctl', 'restart', 'pae-server'], () => {});
              }, 1000);
            }
            resolve();
          });
        });
      }
    });

    return reply.code(202).header('Content-Type', 'application/json').send({
      success: true,
      queued: true,
      previous_commit: currentSha,
      message: 'Self-update and migration check queued in background.'
    });
  });

  // 3c. Native Fastify Domain API Plugin (eliminates Web-Request / Readable.fromWeb bridge for /api/*)
  app.register(apiRoutesPlugin, { env, ctx });

  // 4. Native Fastify UI Pages Handler (non-API routes)
  app.all('/*', async (request, reply) => {
    const rawUrl = request.raw?.url || request.url || '/';
    const host = request.headers?.host || `127.0.0.1:${process.env.PORT || 3000}`;
    const protocol = request.protocol || 'http';
    const fullUrl = `${protocol}://${host}${rawUrl}`;
    const method = (request.method || 'GET').toUpperCase();
    const requestOrigin = request.headers?.origin || null;
    const dynamicCors = getCorsHeaders(requestOrigin, env);
    const outerStore = requestContextStorage.getStore();
    const externalCustomCtx = outerStore?.customCtx && outerStore.customCtx !== ctx ? outerStore.customCtx : null;
    const effectiveCtx = externalCustomCtx || ctx;

    if (method === 'OPTIONS') {
      const optRes = corsOptionsResponse(requestOrigin, env, 'GET, POST, DELETE, OPTIONS');
      reply.code(optRes.status);
      optRes.headers.forEach((val, key) => reply.header(key, val));
      return reply.send();
    }

    const webResponse = await requestContextStorage.run(
      { request, env, ctx: effectiveCtx, customCtx: externalCustomCtx, origin: dynamicCors['Access-Control-Allow-Origin'], bgPromises: [] },
      async () => {
        try {
          const url = new URL(fullUrl);
          const normalizedPath = normalizePath(url.pathname);
          const pathLower = normalizedPath.toLowerCase();
          const { searchParams } = url;

          const pageResponse = await handlePagesRoutes({
            pathLower,
            normalizedPath,
            pathname: normalizedPath,
            method,
            searchParams,
            HTML_HEADERS,
            RESERVED_KEYWORD_SLUGS,
            methodNotAllowedResponse,
            jsonResponse,
            isValidPinId
          });
          if (pageResponse) return pageResponse;

          return jsonResponse({
            success: false,
            error: 'NOT_FOUND',
            message: `Endpoint '${normalizedPath}' not found on pin-arbitrage-engine.`
          }, 404);
        } finally {
          const store = requestContextStorage.getStore();
          if (store?.bgPromises?.length) {
            // [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]
            // Drain in-flight background promises iteratively with a 26-second ceiling. Offloaded completely to ctx.waitUntil
            // so the HTTP response stream is returned immediately to the client without stalling.
            const closePromise = (async () => {
              let drainTimerId = null;
              try {
                const deadlineMs = Date.now() + 26000;
                let processedCount = 0;

                while (
                  Array.isArray(store.bgPromises) &&
                  processedCount < store.bgPromises.length &&
                  Date.now() < deadlineMs
                ) {
                  const batch = store.bgPromises.slice(processedCount);
                  processedCount = store.bgPromises.length;
                  const remainingMs = Math.max(50, deadlineMs - Date.now());

                  const timeoutGuard = new Promise((resolve) => {
                    drainTimerId = setTimeout(resolve, remainingMs);
                    if (drainTimerId && typeof drainTimerId.unref === 'function') drainTimerId.unref();
                  });

                  try {
                    await Promise.race([
                      Promise.allSettled(batch),
                      timeoutGuard
                    ]);
                  } finally {
                    if (drainTimerId !== null) {
                      clearTimeout(drainTimerId);
                      drainTimerId = null;
                    }
                  }
                }
              } catch (drainErr) {
                console.warn('[Drain] Background tasks drain warning:', redactSecrets(drainErr?.message || String(drainErr)));
              } finally {
                if (drainTimerId !== null) {
                  clearTimeout(drainTimerId);
                  drainTimerId = null;
                }
              }
            })();

            if (effectiveCtx && typeof effectiveCtx.waitUntil === 'function') {
              effectiveCtx.waitUntil(closePromise);
            }
          }
        }
      }
    );

    reply.code(webResponse.status);
    webResponse.headers.forEach((val, key) => {
      reply.header(key, val);
    });

    if (method === 'HEAD' || webResponse.status === 204 || webResponse.status === 301 || webResponse.status === 302 || !webResponse.body) {
      return reply.send();
    }
    const buf = Buffer.from(await webResponse.arrayBuffer());
    return reply.send(buf);
  });

  return app;
}

const injectedAppCache = new WeakMap();
let defaultInjectedAppEntry = null;

function getOrCreateInjectedApp(customEnv) {
  if (customEnv && typeof customEnv === 'object') {
    let entry = injectedAppCache.get(customEnv);
    if (!entry) {
      const app = createFastifyApp(customEnv);
      entry = { app, readyPromise: app.ready() };
      injectedAppCache.set(customEnv, entry);
    }
    return entry;
  }
  if (!defaultInjectedAppEntry) {
    const app = createFastifyApp({});
    defaultInjectedAppEntry = { app, readyPromise: app.ready() };
  }
  return defaultInjectedAppEntry;
}

/**
 * Unified Web-Request <-> Fastify adapter for programmatic callers & test suites.
 */
export async function handleAppRequest(request, customEnv = {}, customCtx = null) {
  const { app, readyPromise } = getOrCreateInjectedApp(customEnv);
  await readyPromise;

  const parsedUrl = new URL(request.url);
  const headers = {};
  request.headers.forEach((val, key) => {
    headers[key] = val;
  });
  if (!headers.host) headers.host = parsedUrl.host;
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = parsedUrl.protocol.replace(':', '');
  }

  const method = (request.method || 'GET').toUpperCase();
  let payload;
  if (method !== 'GET' && method !== 'HEAD') {
    const ab = await request.arrayBuffer();
    if (ab.byteLength > 0) {
      payload = Buffer.from(ab);
    }
  }

  const runInject = () => app.inject({
    method,
    url: `${parsedUrl.pathname}${parsedUrl.search}`,
    headers,
    payload
  });

  const injectRes = customCtx
    ? await requestContextStorage.run({ customCtx }, runInject)
    : await runInject();

  const resHeaders = new Headers();
  for (const [key, val] of Object.entries(injectRes.headers)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const item of val) resHeaders.append(key, String(item));
    } else {
      resHeaders.set(key, String(val));
    }
  }

  const isNullBodyStatus = method === 'HEAD' || injectRes.statusCode === 204 || injectRes.statusCode === 304;
  return new Response(isNullBodyStatus ? null : injectRes.rawPayload, {
    status: injectRes.statusCode,
    headers: resHeaders
  });
}

/**
 * Creates an HTTP request listener that forwards requests to Fastify
 */
export function createRequestListener(customEnvOrFastify = {}) {
  if (customEnvOrFastify && typeof customEnvOrFastify.routing === 'function') {
    return (req, res) => customEnvOrFastify.routing(req, res);
  }
  const app = createFastifyApp(customEnvOrFastify);
  const readyPromise = app.ready();
  return async function requestListener(req, res) {
    await readyPromise;
    app.routing(req, res);
  };
}

/**
 * Creates Node.js HTTP server instance backed by Fastify
 */
export function createServer(customEnv = {}) {
  const app = createFastifyApp(customEnv);
  return app.server;
}

/**
 * Boots the Fastify HTTP server
 */
export async function startServer(
  port = 3000,
  host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  customEnv = {}
) {
  const resolvedDsn = customEnv.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') || '';
  const isTestEnv = (customEnv.NODE_ENV || process.env.NODE_ENV) === 'test';
  if (!customEnv.SQL_CLIENT && !resolvedDsn && !isTestEnv) {
    throw new Error('DATABASE_URL is not configured. Refusing to boot PAE Server without a PostgreSQL connection.');
  }
  const app = createFastifyApp(customEnv);
  await app.listen({ port: Number(port), host });
  const boundHost = (host === '0.0.0.0' || host === '::') ? 'localhost' : host;
  console.log(`[PAE Server] Running at http://${boundHost}:${port}`);

  // Layer 2: Ensure systemd ExecStartPre boot-sync hook is installed on InstaBox VPS (/data/app)
  if (fs.existsSync('/data/app/.git') && process.env.INSTABOX_BOOT_SYNC !== 'false') {
    const bootSyncScript = '/data/app/scripts/instabox-boot-sync.sh';
    const hookDropIn = '/etc/systemd/system/pae-server.service.d/boot-sync.conf';
    if (fs.existsSync(bootSyncScript) && !fs.existsSync(hookDropIn)) {
      execFile('bash', [bootSyncScript, '--install-hook'], { timeout: 15000 }, () => {});
    }
  }

  const server = app.server;
  server.fastify = app;
  return server;
}

// Standalone execution entrypoint
const isDirectExecution = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1] ||
  process.argv[1].endsWith('server.mjs')
);

if (isDirectExecution) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  startServer(port, host).catch(err => {
    console.error('[PAE Server] Fatal boot error:', err);
    process.exit(1);
  });
}

export default {
  createFastifyApp,
  handleAppRequest,
  createServer,
  createRequestListener,
  startServer,
  serverBackgroundTaskQueue,
  AsyncTaskQueue,
  getGitCommitSha,
  sql,
  dbHealthCheck,
  getPoolStats
};
