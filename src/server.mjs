#!/usr/bin/env node

/**
 * Pinterest Algorithmic Arbitrage Engine (PAE)
 * Universal Local Node.js Application Server
 *
 * Provides 100% route parity with Cloudflare Workers Edge runtime (src/worker.mjs).
 * Bridges Node.js http.Server to web-standard Fetch API (Request / Response).
 *
 * Runs on port 3456 (or process.env.PORT)
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import worker from './worker.mjs';

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
 * High-performance in-memory KV store implementing Cloudflare Workers KV API
 * for local development and offline test harnesses.
 */
export function createMemoryKV() {
  const store = new Map();
  return {
    async get(key, type = 'text') {
      const entry = store.get(String(key));
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(String(key));
        return null;
      }
      if (type === 'json') {
        try {
          return JSON.parse(entry.value);
        } catch (_) {
          return null;
        }
      }
      return entry.value;
    },

    async put(key, value, options = {}) {
      const ttlSec = options.expirationTtl ? Number(options.expirationTtl) : null;
      store.set(String(key), {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null
      });
    },

    async delete(key) {
      store.delete(String(key));
    },

    async list(options = {}) {
      const prefix = options.prefix || '';
      const now = Date.now();
      const keys = [];
      for (const [k, v] of store.entries()) {
        if (v.expiresAt && now > v.expiresAt) {
          store.delete(k);
          continue;
        }
        if (!prefix || k.startsWith(prefix)) {
          keys.push({ name: k });
        }
      }
      return { keys, list_complete: true };
    }
  };
}

const defaultKvStore = createMemoryKV();

/**
 * Creates an HTTP request listener that forwards requests to worker.fetch
 */
export function createRequestListener(customEnv = {}) {
  const localKv = customEnv.PIN_ENGINE_KV || defaultKvStore;

  return async function requestListener(req, res) {
    try {
      const host = req.headers.host || `127.0.0.1:${process.env.PORT || 3456}`;
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

      const sqlClient = customEnv.SQL_CLIENT || (process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : createMockSql());

      const env = {
        ...process.env,
        PIN_ENGINE_KV: localKv,
        SQL_CLIENT: sqlClient,
        DATABASE_URL: process.env.DATABASE_URL || '',
        ENVIRONMENT: process.env.ENVIRONMENT || 'development',
        NODE_ENV: process.env.NODE_ENV || 'development',
        ...customEnv
      };

      const bgPromises = [];
      const ctx = {
        waitUntil(p) {
          if (p && typeof p.then === 'function') {
            bgPromises.push(p.catch(err => {
              console.warn('[server.mjs background task note]:', err?.message || err);
            }));
          }
        }
      };

      const webResponse = await worker.fetch(webRequest, env, ctx);

      // Write response status and headers
      const resHeaders = {};
      webResponse.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      res.writeHead(webResponse.status, resHeaders);

      if (method === 'HEAD') {
        res.end();
        return;
      }

      // Stream response body
      if (webResponse.body) {
        const arrayBuf = await webResponse.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
      } else {
        res.end();
      }
    } catch (err) {
      console.error('[server.mjs unhandled error]:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
    }
  };
}

/**
 * Creates and configures the HTTP server instance
 */
export function createServer(customEnv = {}) {
  const handler = createRequestListener(customEnv);
  return http.createServer(handler);
}

/**
 * Starts the server on specified port and host
 */
export function startServer(port = Number(process.env.PORT || 3456), host = process.env.HOST || '127.0.0.1') {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      console.log(`[PAE Server] Running at http://${host}:${port}`);
      resolve(server);
    });
  });
}

// Auto-start when executed directly via node src/server.mjs
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectExecution) {
  const port = Number(process.env.PORT || 3456);
  const host = process.env.HOST || '127.0.0.1';
  startServer(port, host).catch(err => {
    console.error('[PAE Server] Fatal boot error:', err);
    process.exit(1);
  });
}

export default {
  createServer,
  createRequestListener,
  createMemoryKV,
  startServer
};
