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

// Auto-load .env if present via built-in Node 20.12+/22+ API (zero node:fs import in src/)
if (typeof process !== 'undefined' && typeof process.loadEnvFile === 'function') {
  try {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('your_password')) {
      delete process.env.DATABASE_URL;
    }
    process.loadEnvFile();
  } catch (_) {}
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
 * Creates an HTTP request listener that forwards requests to worker.fetch
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

      const sqlClient = customEnv.SQL_CLIENT || (process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : createMockSql());

      const env = {
        ...process.env,
        DATABASE_TOPOLOGY: customEnv.DATABASE_TOPOLOGY || process.env.DATABASE_TOPOLOGY || 'unified_postgres',
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

      // Delegate request processing directly to Cloudflare Worker entrypoint
      const response = await worker.fetch(webRequest, env, ctx);

      // Drain background execution tasks before closing the HTTP response
      if (bgPromises.length > 0) {
        await Promise.allSettled(bgPromises);
      }

      // Send status code
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
  startServer
};
