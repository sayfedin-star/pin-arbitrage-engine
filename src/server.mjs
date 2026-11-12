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
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { createSqlClient, getSqlClient } from './db/client.mjs';
import worker from './worker.mjs';

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
  if (!targetDsn) return createMockSql();
  if (cachedServerSqlClient && cachedServerDsn === targetDsn) {
    return cachedServerSqlClient;
  }
  cachedServerDsn = targetDsn;
  cachedServerSqlClient = createSqlClient(targetDsn, {
    max: Number(process.env.PG_POOL_MAX || 10)
  });
  return cachedServerSqlClient;
}

/**
 * Fallback SQL client for offline local dev and test harnesses
 */
export function createMockSql() {
  const mockSql = async () => [];
  mockSql.begin = async (cb) => cb(mockSql);
  mockSql.transaction = async (cb) => (typeof cb === 'function' ? cb(mockSql) : Promise.all(cb));
  return mockSql;
}

export const sql = (typeof process !== 'undefined' && process.env?.DATABASE_URL) ? getServerSqlClient() : createMockSql();

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
 * Declarative Node-native Route Registry
 * Maps HTTP methods and paths to declarative endpoint handlers.
 */
export const declarativeRoutes = [];

export function registerRoute(method, pathStr, handler) {
  declarativeRoutes.push({
    method: method.toUpperCase(),
    path: pathStr,
    handler
  });
}

// -------------------------------------------------------------
// Declarative Endpoint: GET /api/health
// -------------------------------------------------------------
registerRoute('GET', '/api/health', async ({ env = {} }) => {
  const sqlClient = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
  let dbStatus = 'disconnected';
  let dbError = null;

  if (sqlClient) {
    try {
      await sqlClient`SELECT 1 as alive;`;
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

  return new Response(JSON.stringify(payload), {
    status: isHealthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
});

// -------------------------------------------------------------
// Declarative Endpoint: POST /api/internal/ingest
// Secure internal ingestion route for crawler fleet & batch ingestion
// -------------------------------------------------------------
registerRoute('POST', '/api/internal/ingest', async ({ env = {}, webRequest, bodyBuffer }) => {
  const secretKey = env.API_SECRET_KEY || env.ADMIN_KEY || env.INTERNAL_INGEST_KEY || (typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY) : '') || '';
  const isTestOrDev = env.NODE_ENV === 'test' || env.ENVIRONMENT === 'test' || Boolean(globalThis.__PAE_TEST_MODE__);

  const authHeader = webRequest.headers.get('authorization') || '';
  const headerKey = webRequest.headers.get('x-api-key') || '';
  let bearerToken = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }
  const token = headerKey.trim() || bearerToken;

  if (!secretKey && !isTestOrDev) {
    return new Response(JSON.stringify({
      success: false,
      error: 'AUTH_NOT_CONFIGURED',
      message: 'API_SECRET_KEY is not configured on server. Internal ingestion denied.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (secretKey) {
    const isMatch = token && timingSafeEqualStr(token, secretKey);
    if (!isMatch) {
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Unauthorized: Invalid ingestion authentication token.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  let payload = {};
  try {
    const rawText = bodyBuffer ? bodyBuffer.toString('utf8') : await webRequest.text();
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    return new Response(JSON.stringify({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Malformed JSON payload in ingestion request.'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const items = Array.isArray(payload.pins) ? payload.pins : (Array.isArray(payload.items) ? payload.items : []);
  const creator = payload.creator || payload.account_username || null;
  const ingestType = payload.type || (creator ? 'competitor_pins' : 'pins');

  const sqlClient = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
  if (items.length > 0 && sqlClient) {
    serverBackgroundTaskQueue.add(async () => {
      try {
        if (creator) {
          const { ingestPinsBatch } = await import('./modules/creators/service.mjs');
          await ingestPinsBatch(sqlClient, items, creator, { filterQualified: Boolean(payload.filterQualified) });
        } else {
          const { writeBatchToDeterministicShards } = await import('./modules/sharding/fleet-router.mjs');
          await writeBatchToDeterministicShards({ pins: items, hubSql: sqlClient, env });
        }
      } catch (ingestErr) {
        console.error('[POST /api/internal/ingest background note]:', ingestErr?.message || ingestErr);
      }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    queued: true,
    type: ingestType,
    received: items.length,
    creator: creator || null,
    message: `Successfully accepted and queued ${items.length} items for background ingestion.`
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
});

// -------------------------------------------------------------
// Declarative Endpoint: GET /api/internal/queue
// -------------------------------------------------------------
registerRoute('GET', '/api/internal/queue', async () => {
  return new Response(JSON.stringify({
    success: true,
    pending: serverBackgroundTaskQueue.pending,
    active: serverBackgroundTaskQueue.active
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

// -------------------------------------------------------------
// Declarative Endpoint: POST /api/internal/self-update
// Authenticated Layer-3 Self-Update & Migration Webhook for InstaBox VM
// -------------------------------------------------------------
registerRoute('POST', '/api/internal/self-update', async ({ env = {}, webRequest }) => {
  const secretKey = env.API_SECRET_KEY || env.ADMIN_KEY || env.INTERNAL_INGEST_KEY || (typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY) : '') || '';
  const isTestOrDev = env.NODE_ENV === 'test' || env.ENVIRONMENT === 'test' || Boolean(globalThis.__PAE_TEST_MODE__);

  const authHeader = webRequest.headers.get('authorization') || '';
  const headerKey = webRequest.headers.get('x-api-key') || '';
  let bearerToken = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }
  const token = headerKey.trim() || bearerToken;

  if (!secretKey && !isTestOrDev) {
    return new Response(JSON.stringify({
      success: false,
      error: 'AUTH_NOT_CONFIGURED',
      message: 'API_SECRET_KEY is not configured on server.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (secretKey) {
    const isMatch = token && timingSafeEqualStr(token, secretKey);
    if (!isMatch) {
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Unauthorized: Invalid self-update authentication token.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
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

  return new Response(JSON.stringify({
    success: true,
    queued: true,
    previous_commit: currentSha,
    message: 'Self-update and migration check queued in background.'
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
});

/**
 * Creates and configures the native Fastify application instance.
 * Eliminates double Web-fetch bridge bottlenecks for declarative routes.
 */
export function createFastifyApp(customEnv = {}) {
  const app = Fastify({
    logger: false,
    keepAliveTimeout: 60000,
    bodyLimit: 10 * 1024 * 1024
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
      if (p) {
        serverBackgroundTaskQueue.add(p).catch((err) => {
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
            const { writeBatchToDeterministicShards } = await import('./modules/sharding/fleet-router.mjs');
            await writeBatchToDeterministicShards({ pins: items, hubSql: currentSql, env });
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

  // 4. Fallback Handler for Cloudflare Worker entrypoint & edge routes
  app.all('/*', async (request, reply) => {
    const host = request.headers.host || `127.0.0.1:${process.env.PORT || 3000}`;
    const fullUrl = `${request.protocol}://${host}${request.raw.url}`;
    const webHeaders = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) webHeaders.append(key, v);
      } else if (value !== undefined) {
        webHeaders.set(key, value);
      }
    }

    let body = null;
    const method = (request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      if (request.body !== undefined && request.body !== null) {
        if (Buffer.isBuffer(request.body) || typeof request.body === 'string') {
          body = request.body;
        } else {
          body = JSON.stringify(request.body);
        }
      }
    }

    const webRequest = new Request(fullUrl, {
      method,
      headers: webHeaders,
      body
    });

    const response = await worker.fetch(webRequest, env, ctx);
    reply.code(response.status);
    response.headers.forEach((val, key) => {
      reply.header(key, val);
    });

    if (response.body) {
      return reply.send(Readable.fromWeb(response.body));
    }
    return reply.send();
  });

  return app;
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
export async function startServer(port = 3456, host = '0.0.0.0', customEnv = {}) {
  const app = createFastifyApp(customEnv);
  await app.listen({ port: Number(port), host });
  const boundHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`[PAE Server] Running at http://${boundHost}:${port}`);

  // Layer 2: Ensure systemd ExecStartPre boot-sync hook is installed on InstaBox VPS (/data/app)
  if (fs.existsSync('/data/app/.git') && process.env.INSTABOX_BOOT_SYNC !== 'false') {
    const bootSyncScript = '/data/app/scripts/instabox-boot-sync.sh';
    if (fs.existsSync(bootSyncScript)) {
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
  const host = process.env.HOST || '0.0.0.0';
  startServer(port, host).catch(err => {
    console.error('[PAE Server] Fatal boot error:', err);
    process.exit(1);
  });
}

export default {
  createFastifyApp,
  createServer,
  createRequestListener,
  startServer,
  registerRoute,
  serverBackgroundTaskQueue,
  declarativeRoutes,
  AsyncTaskQueue,
  getGitCommitSha,
  sql,
  dbHealthCheck,
  getPoolStats
};
