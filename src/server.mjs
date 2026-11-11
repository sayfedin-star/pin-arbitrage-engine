#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (PAE)
 * Universal Local Node.js Application Server
 *
 * Provides 100% route parity with Cloudflare Workers Edge runtime (src/worker.mjs).
 * Bridges Node.js http.Server to web-standard Fetch API (Request / Response).
 * Features declarative Node-native route dispatch with p-limit(4) non-blocking background queue.
 *
 * Runs on port 3456 (or process.env.PORT)
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSqlClient, getSqlClient } from './db/client.mjs';
import worker from './worker.mjs';

export { createSqlClient, getSqlClient };

// Auto-load .env if present via built-in Node 20.12+/22+ API (zero node:fs import in src/)
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

/**
 * Concurrency-limited in-memory background task queue (p-limit(4) pattern)
 * Decouples background tasks from HTTP response latency so res.end() completes immediately.
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

export function registerRoute(method, path, handler) {
  declarativeRoutes.push({
    method: method.toUpperCase(),
    path,
    handler
  });
}

// -------------------------------------------------------------
// Declarative Endpoint: GET /api/health
// -------------------------------------------------------------
registerRoute('GET', '/api/health', async ({ env }) => {
  const sql = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
  let dbStatus = 'disconnected';
  let dbError = null;

  if (sql) {
    try {
      await sql`SELECT 1 as alive;`;
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
registerRoute('POST', '/api/internal/ingest', async ({ env, webRequest, bodyBuffer }) => {
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

  const sql = env.SQL_CLIENT || getServerSqlClient(env.DATABASE_URL);
  if (items.length > 0 && sql) {
    serverBackgroundTaskQueue.add(async () => {
      try {
        if (creator) {
          const { ingestPinsBatch } = await import('./modules/creators/service.mjs');
          await ingestPinsBatch(sql, items, creator, { filterQualified: Boolean(payload.filterQualified) });
        } else {
          const { writeBatchToDeterministicShards } = await import('./modules/sharding/fleet-router.mjs');
          await writeBatchToDeterministicShards({ pins: items, hubSql: sql, env });
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

/**
 * Creates an HTTP request listener that forwards requests to declarative routes or worker.fetch
 */
export function createRequestListener(customEnv = {}) {
  return async function requestListener(req, res) {
    try {
      const host = req.headers.host || `127.0.0.1:${process.env.PORT || 3000}`;
      const protocol = req.socket?.encrypted ? 'https' : 'http';
      const fullUrl = new URL(req.url, `${protocol}://${host}`);

      // Read request body if present
      const method = (req.method || 'GET').toUpperCase();
      let body = null;
      if (method !== 'GET' && method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        if (chunks.length > 0) {
          body = Buffer.concat(chunks);
        }
      }

      // Convert Node headers to Web Headers
      const webHeaders = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) webHeaders.append(key, v);
        } else if (value !== undefined) {
          webHeaders.set(key, value);
        }
      }

      const webRequest = new Request(fullUrl.toString(), {
        method,
        headers: webHeaders,
        body
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

      // Non-blocking background task queue integration via serverBackgroundTaskQueue (p-limit(4))
      const ctx = {
        waitUntil(p) {
          if (p) {
            serverBackgroundTaskQueue.add(p).catch((err) => {
              console.warn('[server.mjs background task note]:', err?.message || err);
            });
          }
        }
      };

      // 1. Dispatch through Declarative Route Registry
      let response = null;
      for (const route of declarativeRoutes) {
        if (route.method === method && route.path === fullUrl.pathname) {
          response = await route.handler({
            req,
            res,
            env,
            ctx,
            url: fullUrl,
            webRequest,
            bodyBuffer: body
          });
          break;
        }
      }

      // 2. Fallback to Cloudflare Worker entrypoint (src/worker.mjs) for 100% route parity
      if (!response) {
        response = await worker.fetch(webRequest, env, ctx);
      }

      // Send status code immediately
      res.statusCode = response.status;

      // Transfer response headers to Node response
      response.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      // Stream response body back to Node client
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      }

      // Immediately terminate HTTP response stream without stalling on background promises
      res.end();
    } catch (err) {
      console.error('[PAE Server Error]', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: err.message
        }));
      } else {
        res.end();
      }
    }
  };
}

/**
 * Creates Node.js HTTP server instance
 */
export function createServer(customEnv = {}) {
  return http.createServer(createRequestListener(customEnv));
}

/**
 * Boots the HTTP server
 */
export async function startServer(port = 3456, host = '0.0.0.0', customEnv = {}) {
  const server = createServer(customEnv);
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`[PAE Server] Running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
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
  createServer,
  createRequestListener,
  startServer,
  registerRoute,
  serverBackgroundTaskQueue,
  AsyncTaskQueue
};
