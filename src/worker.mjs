/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cloudflare Worker Edge Entrypoint
 *
 * Runs on Cloudflare Workers edge runtime with Neon Serverless Postgres
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import { handlePagesRoutes } from './routes/pages.mjs';
import { handleFleetRoutes } from './routes/fleet.mjs';
import { handleCreatorsRoutes } from './routes/creators.mjs';
import { handleDomainsRoutes } from './routes/domains.mjs';
import { isClusterRoute, handleClusterRoutes } from './routes/cluster.mjs';
import { enforceNeonPoolerUrl, getFastEdgeDossier, getOrCreateShardSqlClient, getCachedShardSqlClient, setCachedShardSqlClient, shardSqlClients, wrapShardNeonTransaction, isValidShardDsn, normalizeAssignedShards } from './modules/sharding/fleet-router.mjs';
import { isKeywordsRoute, handleKeywordsRoutes } from './routes/keywords.mjs';
import { isPinsRoute, handlePinsRoutes } from './routes/pins.mjs';

export const requestContextStorage = new AsyncLocalStorage();
globalThis.__requestContextStorage = requestContextStorage;

// Reserved Keyword Slugs (Defends against route swallowing on /keywords/:slug)
export const RESERVED_KEYWORD_SLUGS = new Set([
  'discovery', 'folders', 'export', 'sync', 'batch', 'api', 'add', 'manage', 'import', 'domains'
]);

import { escapeSqlWildcards, maskDatabaseUrl } from './utils.mjs';

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

export function safeWaitUntil(ctx, promise, taskName = 'bg_task', timeoutMs = 25000) {
  if (!promise || typeof promise.then !== 'function') return;
  promise.catch(() => {});
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Background task "${taskName}" timed out after ${timeoutMs}ms`)), timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
  const guardedPromise = Promise.race([promise, timeoutPromise])
    .catch(err => {
      console.error(`[safeWaitUntil] Error in background task "${taskName}":`, redactSecrets(err?.message || String(err)));
    })
    .finally(() => {
      clearTimeout(timer);
    });

  const store = requestContextStorage?.getStore?.();
  if (store) {
    if (!Array.isArray(store.bgPromises)) store.bgPromises = [];
    store.bgPromises.push(guardedPromise);
  }

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(guardedPromise);
  }
}

// L0 Isolate-Level Circuit Breaker State + L1 KV Persistence
let l0PinterestCircuit = { triggered_at: 0, cooldown_seconds: 0, reason: '' };

export async function checkPinterestCircuitBreaker(env) {
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
  if (!env?.PIN_ENGINE_KV) return null;
  try {
    const raw = await env.PIN_ENGINE_KV.get('circuit:pinterest:429', { type: 'json', cacheTtl: 30 });
    if (!raw) return null;
    const triggeredAt = Number(raw.triggered_at) || 0;
    const cooldownSec = Number(raw.cooldown_seconds) || 900;
    const expiresAt = triggeredAt + (cooldownSec * 1000);
    if (expiresAt > now) {
      l0PinterestCircuit = { triggered_at: triggeredAt, cooldown_seconds: cooldownSec, reason: raw.reason || 'HTTP 429/403' };
      return {
        active: true,
        remaining_seconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
        reason: l0PinterestCircuit.reason,
        triggered_at: triggeredAt
      };
    }
  } catch (_) {}
  return null;
}

export async function tripPinterestCircuitBreaker(env, reason = 'HTTP 429/403 Rate Limit', cooldownSeconds = 900) {
  const now = Date.now();
  l0PinterestCircuit = { triggered_at: now, cooldown_seconds: cooldownSeconds, reason };
  if (!env?.PIN_ENGINE_KV) return;
  try {
    await env.PIN_ENGINE_KV.put(
      'circuit:pinterest:429',
      JSON.stringify(l0PinterestCircuit),
      { expirationTtl: cooldownSeconds }
    );
  } catch (err) {
    console.warn('[circuit:pinterest:429] Failed to trip KV circuit breaker:', redactSecrets(err.message));
  }
}

/**
 * Derives comprehensive Cloudflare KV cache keys for a given pin to guarantee zero stale reads across ranges and keyword scopes.
 */
export function getPinKvKeysToEvict(pinId, associatedKids = []) {
  const pid = String(pinId || '').trim();
  if (!pid) return [];
  const keys = new Set([
    `dossier:pin:${pid}`,
    `dossier:pin:${pid}:0`,
    `pin:dossier:${pid}`,
    `pin:dossier?pin_id=${pid}`,
    `traj:pin:${pid}`,
    `traj:pin:${pid}:0`,
    `traj:pin:${pid}:all`,
    `traj:pin:${pid}:7d`,
    `traj:pin:${pid}:14d`,
    `traj:pin:${pid}:30d`,
    `pin:trajectory?pin_id=${pid}`
  ]);
  for (const kid of associatedKids) {
    if (kid != null && kid !== 0) {
      keys.add(`dossier:pin:${pid}:${kid}`);
      keys.add(`traj:pin:${pid}:${kid}`);
      keys.add(`serp:comp:${kid}`);
    }
  }
  return [...keys];
}


// Edge D1 Database Synchronization Helpers
export async function syncFolderToD1(env, folder) {
  if (!env?.PIN_D1_DB || !folder?.id) return;
  try {
    const id = String(folder.id);
    const name = String(folder.name || 'Untitled');
    const color = String(folder.color || '#e60023');
    const description = folder.description || null;
    const itemCount = Math.max(0, Number(
      folder.keyword_count ??
      folder.item_count ??
      (Array.isArray(folder.items) ? folder.items.length : 0) ??
      0
    ));
    const updatedAt = new Date().toISOString();

    await env.PIN_D1_DB.prepare(`
      INSERT INTO edge_campaign_folders (id, name, color, description, item_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        description = excluded.description,
        item_count = excluded.item_count,
        updated_at = excluded.updated_at
    `).bind(id, name, color, description, itemCount, updatedAt).run();
  } catch (err) {
    console.warn('[syncFolderToD1] Non-fatal D1 sync error:', redactSecrets(err.message));
  }
}

export async function deleteFolderFromD1(env, folderId) {
  if (!env?.PIN_D1_DB || !folderId) return;
  try {
    await env.PIN_D1_DB.prepare("DELETE FROM edge_campaign_folders WHERE id = ?").bind(String(folderId)).run();
  } catch (err) {
    console.warn('[deleteFolderFromD1] Non-fatal D1 delete error:', redactSecrets(err.message));
  }
}

export async function syncKeywordToD1(env, keywordObj) {
  if (!env?.PIN_D1_DB || !keywordObj?.keyword) return;
  try {
    const kw = String(keywordObj.keyword).trim();
    if (!kw) return;
    const searchVolume = Number(keywordObj.search_volume || keywordObj.monthly_search_volume || 0);
    const monthlyGrowth = Number(keywordObj.monthly_growth || keywordObj.velocity_score || 0);
    const pinCount = Number(keywordObj.pin_count || 0);
    const lastSyncedAt = new Date().toISOString();

    await env.PIN_D1_DB.prepare(`
      INSERT INTO search_autocomplete_index (keyword, search_volume, monthly_growth, pin_count, last_synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(keyword) DO UPDATE SET
        search_volume = excluded.search_volume,
        monthly_growth = excluded.monthly_growth,
        pin_count = excluded.pin_count,
        last_synced_at = excluded.last_synced_at
    `).bind(kw, searchVolume, monthlyGrowth, pinCount, lastSyncedAt).run();
  } catch (err) {
    console.warn('[syncKeywordToD1] Non-fatal D1 sync error:', redactSecrets(err.message));
  }
}

export async function syncKeywordsBatchToD1(env, keywords) {
  if (!env?.PIN_D1_DB || !Array.isArray(keywords) || keywords.length === 0) return;
  try {
    const lastSyncedAt = new Date().toISOString();
    const stmts = [];
    for (const k of keywords) {
      if (!k?.keyword) continue;
      const kw = String(k.keyword).trim();
      if (!kw) continue;
      const searchVolume = Number(k.search_volume || k.monthly_search_volume || 0);
      const monthlyGrowth = Number(k.monthly_growth || k.velocity_score || 0);
      const pinCount = Number(k.pin_count || k.total_pins_count || 0);
      stmts.push(
        env.PIN_D1_DB.prepare(`
          INSERT INTO search_autocomplete_index (keyword, search_volume, monthly_growth, pin_count, last_synced_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(keyword) DO UPDATE SET
            search_volume = excluded.search_volume,
            monthly_growth = excluded.monthly_growth,
            pin_count = excluded.pin_count,
            last_synced_at = excluded.last_synced_at
        `).bind(kw, searchVolume, monthlyGrowth, pinCount, lastSyncedAt)
      );
      if (stmts.length >= 100) break; // bounded batch size per subrequest limit
    }
    if (stmts.length > 0) {
      await env.PIN_D1_DB.batch(stmts);
    }
  } catch (err) {
    console.warn('[syncKeywordsBatchToD1] Non-fatal batch D1 sync error:', redactSecrets(err.message));
  }
}

let isEdgeKeywordsTableReady = false;

export async function ensureEdgeKeywordsCatalogTable(env) {
  if (isEdgeKeywordsTableReady || !env?.PIN_D1_DB) return;
  try {
    await env.PIN_D1_DB.prepare(`
      CREATE TABLE IF NOT EXISTS edge_keywords_catalog (
        id INTEGER PRIMARY KEY,
        keyword TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        target_pin_count INTEGER DEFAULT 50,
        refresh_interval_hours INTEGER DEFAULT 24,
        last_crawled_at TEXT,
        top_pin_id TEXT,
        top_pin_title TEXT,
        top_pin_image TEXT,
        avg_daily_velocity REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        tags TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        crawl_pages_limit INTEGER DEFAULT 2,
        inspection_mode TEXT DEFAULT 'full_catalog',
        canonical_keyword TEXT,
        snapshots_count INTEGER DEFAULT 0,
        total_pins_count INTEGER DEFAULT 0,
        folders TEXT DEFAULT '[]'
      )
    `).run().catch(() => {});
    await env.PIN_D1_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_edge_keywords_kw ON edge_keywords_catalog(keyword)`).run().catch(() => {});
    await env.PIN_D1_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_edge_keywords_created ON edge_keywords_catalog(created_at DESC)`).run().catch(() => {});
    await env.PIN_D1_DB.prepare(`
      CREATE TABLE IF NOT EXISTS edge_keywords_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run().catch(() => {});
    isEdgeKeywordsTableReady = true;
  } catch (err) {
    console.warn('[ensureEdgeKeywordsCatalogTable] Non-fatal init error:', redactSecrets(err.message));
  }
}

export async function readKeywordsFromD1(env, { search = '', limit = 1000, offset = 0 } = {}) {
  if (!env?.PIN_D1_DB) return null;
  await ensureEdgeKeywordsCatalogTable(env);
  try {
    // 1. Verify that D1 edge catalog has been fully warmed and seeded
    let meta = null;
    try {
      const metaRow = await env.PIN_D1_DB.prepare(
        "SELECT value FROM edge_keywords_meta WHERE key = ? LIMIT 1"
      ).bind('catalog_status').first();
      if (metaRow?.value) {
        meta = JSON.parse(metaRow.value);
      }
    } catch (_) {}

    // If edge catalog hasn't completed a full warm, treat as cold to allow Neon Hub to seed it
    if (!meta || !meta.is_warmed) {
      return null;
    }

    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 1000, 1000));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    let queryRes;
    if (search && search.trim()) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      queryRes = await env.PIN_D1_DB.prepare(`
        SELECT * FROM edge_keywords_catalog 
        WHERE LOWER(keyword) LIKE ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `).bind(pattern, lim, off).all();
    } else {
      queryRes = await env.PIN_D1_DB.prepare(`
        SELECT * FROM edge_keywords_catalog 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `).bind(lim, off).all();
    }

    if (!queryRes || !Array.isArray(queryRes.results)) return null;
    if (queryRes.results.length === 0) {
      if (!search && off === 0) return null;
      return [];
    }

    // If requesting full catalog without search filter and results are fewer than expected synced count, re-warm
    if (!search && off === 0 && lim >= meta.count && queryRes.results.length < meta.count) {
      return null;
    }

    return queryRes.results.map(row => {
      let m = {};
      if (typeof row.metadata === 'string') {
        try { m = JSON.parse(row.metadata); } catch (_) { m = {}; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        m = row.metadata;
      }

      let fldrs = [];
      if (typeof row.folders === 'string') {
        try { fldrs = JSON.parse(row.folders); } catch (_) { fldrs = []; }
      } else if (Array.isArray(row.folders)) {
        fldrs = row.folders;
      }

      return {
        ...row,
        id: Number(row.id),
        target_pin_count: Number(row.target_pin_count || 50),
        refresh_interval_hours: Number(row.refresh_interval_hours || 24),
        avg_daily_velocity: String(row.avg_daily_velocity || '0.00'),
        is_active: Boolean(row.is_active),
        crawl_pages_limit: Number(row.crawl_pages_limit || 2),
        snapshots_count: Number(row.snapshots_count || 0),
        active_pins_count: Number(row.active_pins_count ?? row.snapshots_count ?? 0),
        displaced_pins_count: Number(row.displaced_pins_count ?? Math.max(0, (row.total_pins_count || 0) - (row.snapshots_count || 0))),
        total_pins_count: Number(row.total_pins_count || 0),
        metadata: m,
        folders: fldrs
      };
    });
  } catch (err) {
    console.warn('[readKeywordsFromD1] Read error (falling back to Neon):', redactSecrets(err.message));
    return null;
  }
}

export async function syncKeywordsCatalogToD1(env, keywords, options = {}) {
  if (!env?.PIN_D1_DB || !Array.isArray(keywords) || keywords.length === 0) return;
  await ensureEdgeKeywordsCatalogTable(env);
  const isFullCatalog = options.isFullCatalog ?? (keywords.length >= 20);
  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < keywords.length; i += CHUNK_SIZE) {
      const slice = keywords.slice(i, i + CHUNK_SIZE);
      const stmts = [];
      for (const k of slice) {
        if (!k || !k.id || !k.keyword) continue;
        const id = Number(k.id);
        const keyword = String(k.keyword).trim();
        const category = String(k.category || 'General');
        const targetPinCount = Number(k.target_pin_count || 50);
        const refreshInterval = Number(k.refresh_interval_hours || 24);
        const lastCrawledAt = k.last_crawled_at ? new Date(k.last_crawled_at).toISOString() : null;
        const topPinId = k.top_pin_id ? String(k.top_pin_id) : null;
        const topPinTitle = k.top_pin_title ? String(k.top_pin_title) : null;
        const topPinImage = k.top_pin_image ? String(k.top_pin_image) : null;
        const avgVelocity = Number(k.avg_daily_velocity || 0);
        const isActive = k.is_active === false ? 0 : 1;
        const tags = typeof k.tags === 'string' ? k.tags : JSON.stringify(k.tags || {});
        const metadata = typeof k.metadata === 'string' ? k.metadata : JSON.stringify(k.metadata || {});
        const createdAt = k.created_at ? new Date(k.created_at).toISOString() : new Date().toISOString();
        const updatedAt = k.updated_at ? new Date(k.updated_at).toISOString() : new Date().toISOString();
        const crawlPagesLimit = Number(k.crawl_pages_limit || 2);
        const inspectionMode = String(k.inspection_mode || 'full_catalog');
        const canonicalKeyword = k.canonical_keyword ? String(k.canonical_keyword) : null;
        const snapshotsCount = Number(k.snapshots_count || 0);
        const totalPinsCount = Number(k.total_pins_count || 0);
        const folders = typeof k.folders === 'string' ? k.folders : JSON.stringify(k.folders || []);

        stmts.push(
          env.PIN_D1_DB.prepare(`
            INSERT INTO edge_keywords_catalog (
              id, keyword, category, target_pin_count, refresh_interval_hours,
              last_crawled_at, top_pin_id, top_pin_title, top_pin_image,
              avg_daily_velocity, is_active, tags, metadata,
              created_at, updated_at, crawl_pages_limit, inspection_mode,
              canonical_keyword, snapshots_count, total_pins_count, folders
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              keyword = excluded.keyword,
              category = excluded.category,
              target_pin_count = excluded.target_pin_count,
              refresh_interval_hours = excluded.refresh_interval_hours,
              last_crawled_at = excluded.last_crawled_at,
              top_pin_id = excluded.top_pin_id,
              top_pin_title = excluded.top_pin_title,
              top_pin_image = excluded.top_pin_image,
              avg_daily_velocity = excluded.avg_daily_velocity,
              is_active = excluded.is_active,
              tags = excluded.tags,
              metadata = excluded.metadata,
              updated_at = excluded.updated_at,
              crawl_pages_limit = excluded.crawl_pages_limit,
              inspection_mode = excluded.inspection_mode,
              canonical_keyword = excluded.canonical_keyword,
              snapshots_count = excluded.snapshots_count,
              total_pins_count = excluded.total_pins_count,
              folders = excluded.folders
          `).bind(
            id, keyword, category, targetPinCount, refreshInterval,
            lastCrawledAt, topPinId, topPinTitle, topPinImage,
            avgVelocity, isActive, tags, metadata,
            createdAt, updatedAt, crawlPagesLimit, inspectionMode,
            canonicalKeyword, snapshotsCount, totalPinsCount, folders
          )
        );
      }
      if (stmts.length > 0) {
        await env.PIN_D1_DB.batch(stmts);
      }
    }

    if (isFullCatalog) {
      await env.PIN_D1_DB.prepare(`
        INSERT INTO edge_keywords_meta (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind('catalog_status', JSON.stringify({ is_warmed: true, count: keywords.length, synced_at: new Date().toISOString() })).run().catch(() => {});
    }
  } catch (err) {
    console.warn('[syncKeywordsCatalogToD1] Non-fatal catalog D1 sync error:', redactSecrets(err.message));
  }
}

export async function evictKeywordsCatalogFromD1(env, keywordId = null) {
  if (!env?.PIN_D1_DB) return;
  await ensureEdgeKeywordsCatalogTable(env);
  try {
    if (keywordId) {
      await env.PIN_D1_DB.prepare("DELETE FROM edge_keywords_catalog WHERE id = ?").bind(Number(keywordId)).run();
    } else {
      await env.PIN_D1_DB.prepare("DELETE FROM edge_keywords_catalog").run();
      await env.PIN_D1_DB.prepare("DELETE FROM edge_keywords_meta WHERE key = 'catalog_status'").run().catch(() => {});
    }
  } catch (err) {
    console.warn('[evictKeywordsCatalogFromD1] Non-fatal D1 eviction error:', redactSecrets(err.message));
  }
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-target-project, x-api-key',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

export function verifyApiAuthentication(request, env = {}) {
  const secretKey = (env && (env.API_SECRET_KEY || env.ADMIN_KEY || env.PIN_ARBITRAGE_SECRET)) ||
                    (typeof process !== 'undefined' ? (process.env.API_SECRET_KEY || process.env.ADMIN_KEY || process.env.PIN_ARBITRAGE_SECRET) : '') || '';
  // If no secret key is configured in the environment, allow execution (single-tenant / default instance)
  if (!secretKey) return { authorized: true };

  const authHeader = request.headers.get('Authorization') || '';
  const apiKeyHeader = request.headers.get('x-api-key') || '';
  let queryKey = '';
  try {
    const u = new URL(request.url);
    queryKey = u.searchParams.get('api_key') || u.searchParams.get('key') || '';
  } catch (_) {}

  let incomingToken = '';
  if (authHeader.startsWith('Bearer ')) {
    incomingToken = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    incomingToken = apiKeyHeader.trim();
  } else if (queryKey) {
    incomingToken = queryKey.trim();
  }

  if (incomingToken) {
    const isMatch = timingSafeEqualStr(incomingToken, secretKey);
    return { authorized: isMatch, reason: isMatch ? null : 'Invalid authentication token.' };
  }

  return { authorized: false, reason: 'Missing authentication credentials (Bearer token or x-api-key required).' };
}

export function setDefaultCorsOrigin(_origin) {}

export function jsonResponse(data, status = 200, cacheSeconds = 0, customCors = null) {
  let responsePayload = data;
  
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-target-project, x-api-key',
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-target-project, x-api-key',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(customCors || {})
    }
  });
}

export function corsOptionsResponse(requestOrigin = null, env = {}, allow = 'GET, POST, DELETE, OPTIONS') {
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
// HTML headers configured to enable Cloudflare Edge Brotli/Gzip compression by omitting 'no-transform'.
// 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' instructs Cloudflare Edge to cache the
// static UI shells for up to 1 hour (revalidating in background for 24 hours), while browsers always
// revalidate with edge (max-age=0) ensuring immediate UI updates upon deployment.
export const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none';"
};

// Culinary Color & Age Utilities
export { getCulinaryColorName, formatAge } from './utils.mjs';

// Bounded database connection cache unified with fleet-router (shardSqlClients)
// to eliminate dual cache thrashing and socket leaks. Single canonical DSN key per shard.
export const shardSqlCache = shardSqlClients;
const shardKeyToDsn = new Map(); // cleanKey -> canonical pooled DSN

export function setCachedShardSql(key, client) {
  setCachedShardSqlClient(key, client);
}

export function getCachedShardSql(key, factory) {
  if (!key) return null;
  if (typeof key === 'string' && key.startsWith('postgres')) {
    return getOrCreateShardSqlClient(key);
  }
  const cachedDsn = shardKeyToDsn.get(key);
  if (cachedDsn) {
    return getOrCreateShardSqlClient(cachedDsn);
  }
  const existing = getCachedShardSqlClient(key);
  if (existing) {
    return existing;
  }
  if (typeof factory === 'function') {
    const rawClient = factory();
    const client = wrapShardNeonTransaction(rawClient);
    setCachedShardSqlClient(key, client);
    return client;
  }
  return null;
}

export function createHyperdriveClient(connectionString, customOpts = {}) {
  const pSql = postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 3,
    ...customOpts
  });
  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  pSql.transaction = async (queriesOrFn) => {
    if (typeof queriesOrFn === 'function') {
      return await pSql.begin(async (tx) => {
        const res = await queriesOrFn(tx);
        if (Array.isArray(res)) {
          const results = [];
          for (const item of res) {
            if (typeof item === 'function') {
              results.push(await item(tx));
            } else {
              results.push(await item);
            }
          }
          return results;
        }
        return res;
      });
    }
    if (Array.isArray(queriesOrFn)) {
      if (queriesOrFn.length === 0) return [];
      const hasNonFunction = queriesOrFn.some(q => typeof q !== 'function');
      if (hasNonFunction) {
        throw new TypeError(
          '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] pSql.transaction() strictly requires lazy query builder functions `(db) => db`...``. Passing pre-instantiated query promises is forbidden.'
        );
      }
      return await pSql.begin(async (tx) => {
        const results = [];
        for (const builder of queriesOrFn) {
          results.push(await builder(tx));
        }
        return results;
      });
    }
    throw new TypeError(
      '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] pSql.transaction() strictly requires a callback `(tx) => ...` or an array of lazy query builders `[(db) => db`...`]`. Raw pre-instantiated promises are forbidden.'
    );
  };
  pSql.__atomicBuilderWrapped = true;
  return pSql;
}

// Edge Data Cache & Single-Flight Request Coalescing (Anti-Thundering Herd & SWR)
export const edgeCache = new Map();
export const inflightPromises = new Map();
const MAX_CACHE_ENTRIES = 512;

// Node.js Test Guard for Cloudflare Worker Cache API (L1 Edge Cache)
export const l1Cache = (typeof caches !== 'undefined' && caches?.default) ? caches.default : null;

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

  // 1. L0 In-Memory Cache Check (bypassed on forceRefresh)
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
              !fresh.is_degraded &&
              !fresh.shard_cold &&
              (fresh.from_shard_snapshots !== false || (Array.isArray(fresh.daily_trajectory) && fresh.daily_trajectory.length > 2))
            );
            if (isCacheable) {
              edgeCache.set(key, {
                data: fresh,
                expiresAt: Date.now() + ttlMs,
                staleUntil: Date.now() + ttlMs + staleMs
              });
              if (l1Cache) {
                const cacheUrl = `https://edge-cache.internal/${encodeURIComponent(key)}`;
                const cacheReq = new Request(cacheUrl, { method: 'GET' });
                const cacheHeaders = {
                  'Content-Type': 'application/json',
                  'Cache-Control': `public, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(staleMs / 1000)}`
                };
                await l1Cache.put(cacheReq, new Response(JSON.stringify(fresh), { headers: cacheHeaders })).catch(() => {});
              }
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

  // 3. L1 Edge Cache (Cache API) Lookup (bypassed on forceRefresh)
  if (!forceRefresh && l1Cache) {
    try {
      const cacheUrl = `https://edge-cache.internal/${encodeURIComponent(key)}`;
      const cacheReq = new Request(cacheUrl, { method: 'GET' });
      const matched = await l1Cache.match(cacheReq);
      if (matched) {
        const l1Data = await matched.json();
        // Warm L0 memory cache
        edgeCache.set(key, {
          data: l1Data,
          expiresAt: now + ttlMs,
          staleUntil: now + ttlMs + staleMs
        });
        return l1Data;
      }
    } catch (_) {}
  }

  // 4. Cache Miss or Force Refresh: Fetch fresh data with single-flight deduplication
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
        !fresh.is_degraded &&
        !fresh.shard_cold &&
        (fresh.from_shard_snapshots !== false || (Array.isArray(fresh.daily_trajectory) && fresh.daily_trajectory.length > 2))
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

        // Write to L1 Edge Cache with Cache-Control
        if (l1Cache) {
          try {
            const cacheUrl = `https://edge-cache.internal/${encodeURIComponent(key)}`;
            const cacheReq = new Request(cacheUrl, { method: 'GET' });
            const cacheHeaders = {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(staleMs / 1000)}`
            };
            const putPromise = l1Cache.put(cacheReq, new Response(JSON.stringify(fresh), { headers: cacheHeaders })).catch(() => {});
            const store = requestContextStorage?.getStore?.();
            const ctx = store?.ctx;
            if (ctx && typeof ctx.waitUntil === 'function') {
              safeWaitUntil(ctx, putPromise, `l1_cache_put_${key}`);
            }
          } catch (_) {}
        }
      }

      return fresh;
    } finally {
      inflightPromises.delete(key);
    }
  })();

  inflightPromises.set(key, promise);
  return await promise;
}

export function invalidateEdgeCache(prefix = '') {
  const keysToInvalidate = [];
  if (!prefix) {
    keysToInvalidate.push(...edgeCache.keys());
    edgeCache.clear();
  } else {
    for (const k of edgeCache.keys()) {
      if (k.startsWith(prefix)) {
        keysToInvalidate.push(k);
        edgeCache.delete(k);
      }
    }
    if (!keysToInvalidate.includes(prefix)) {
      keysToInvalidate.push(prefix);
    }
  }

  if (l1Cache) {
    try {
      const store = requestContextStorage?.getStore?.();
      const ctx = store?.ctx;
      const delPromises = keysToInvalidate.map(k => {
        const cacheUrl = `https://edge-cache.internal/${encodeURIComponent(k)}`;
        const cacheReq = new Request(cacheUrl, { method: 'GET' });
        return l1Cache.delete(cacheReq).catch(() => {});
      });
      const allDel = Promise.all(delPromises).catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') {
        safeWaitUntil(ctx, allDel, `l1_cache_evict_${prefix || 'all'}`);
      }
    } catch (_) {}
  }

  const store = requestContextStorage?.getStore?.();
  const env = store?.env;
  const ctx = store?.ctx;
  if ((!prefix || prefix.startsWith('keywords')) && env?.PIN_D1_DB) {
    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, evictKeywordsCatalogFromD1(env), 'd1_evict_keywords_catalog');
    } else {
      evictKeywordsCatalogFromD1(env).catch(() => {});
    }
  }

  return Promise.resolve();
}

// Adaptive Bulkhead Isolation for Central Hub Protection (Anti-Cascading Meltdown)
let activeHubFallbacks = 0;
const MAX_CONCURRENT_HUB_FALLBACKS = 6;

export default {
  async fetch(request, env, ctx) {
    const requestOrigin = request.headers.get('Origin');
    const dynamicCors = getCorsHeaders(requestOrigin, env, request.url);

    if (request.method.toUpperCase() === 'OPTIONS') {
      return corsOptionsResponse(requestOrigin, env, 'GET, POST, DELETE, OPTIONS', request.url);
    }

    return requestContextStorage.run({ request, env, ctx, origin: dynamicCors['Access-Control-Allow-Origin'], bgPromises: [] }, async () => {
      try {
        const url = new URL(request.url);
      const normalizedPath = normalizePath(url.pathname);
      const pathLower = normalizedPath.toLowerCase();
      const pathname = normalizedPath;
      const { searchParams } = url;
      const method = request.method.toUpperCase();

    // [INVARIANT: UI-PAGES-BEFORE-AUTH-GATE]
    // UI HTML routes are dispatched before API auth gate to preserve 405 Method Not Allowed on mutative verbs
    const pageResponse = await handlePagesRoutes({
      pathLower,
      normalizedPath,
      pathname,
      method,
      searchParams,
      HTML_HEADERS,
      RESERVED_KEYWORD_SLUGS,
      methodNotAllowedResponse,
      jsonResponse,
      isValidPinId
    });
    if (pageResponse) {
      return pageResponse;
    }

    // Health check endpoint
    if (pathname === '/api/health') {
      const isHyperdriveConfigured = Boolean(env?.HYPERDRIVE?.connectionString);
      const isKvConfigured = Boolean(env?.PIN_ENGINE_KV);
      const isD1Configured = Boolean(env?.PIN_D1_DB);
      const directNeonUrl = env?.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : null);

      let sql = env?.SQL_CLIENT;
      let usedHyperdrive = false;

      if (!sql) {
        if (isHyperdriveConfigured) {
          try {
            const store = requestContextStorage.getStore();
            let hyperdriveSql = store?.hyperdriveSql;
            if (!hyperdriveSql) {
              hyperdriveSql = createHyperdriveClient(env.HYPERDRIVE.connectionString);
              if (store) store.hyperdriveSql = hyperdriveSql;
            }
            sql = hyperdriveSql;
            usedHyperdrive = true;
          } catch (_) {}
        }
        if (!sql && directNeonUrl) {
          sql = neon(enforceNeonPoolerUrl(directNeonUrl));
        }
      }

      if (!sql) {
        return jsonResponse({
          status: 'degraded',
          database: 'missing_database_url',
          error: 'DATABASE_URL or HYPERDRIVE secret is not set in Cloudflare Workers settings.',
          hyperdrive_accelerated: false,
          hyperdrive: isHyperdriveConfigured ? 'failed' : 'fallback',
          neon: 'unconfigured',
          kv: isKvConfigured ? 'connected' : 'unconfigured',
          kv_configured: isKvConfigured,
          d1: isD1Configured ? 'connected' : 'unconfigured',
          d1_configured: isD1Configured,
          timestamp: new Date().toISOString()
        }, 503);
      }
      try {
        await sql`SELECT 1 as alive;`;
        let kvShardsCount = 0;
        if (isKvConfigured) {
          try {
            let cachedMap = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json' });
            if (!cachedMap || !Array.isArray(cachedMap) || cachedMap.length === 0 || cachedMap.some(r => !isValidShardDsn(r?.database_url))) {
              const rows = await sql`
                SELECT id, project_id, project_name, database_url, status, assigned_shards
                FROM neon_projects_registry 
                WHERE status = 'active';
              `;
              if (Array.isArray(rows) && rows.length > 0) {
                await env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(rows), { expirationTtl: 86400 });
                cachedMap = rows;
              }
            }
            kvShardsCount = Array.isArray(cachedMap) ? cachedMap.length : 0;
            await env.PIN_ENGINE_KV.put('fleet:health', JSON.stringify({
              status: 'healthy',
              shards_count: kvShardsCount,
              updated_at: new Date().toISOString()
            }), { expirationTtl: 86400 });
          } catch (_) {}
        }
        const hyperdriveAccelerated = Boolean(isHyperdriveConfigured && (usedHyperdrive || env?.SQL_CLIENT));
        return jsonResponse({
          status: 'healthy',
          database: 'connected',
          runtime: 'cloudflare_workers',
          hyperdrive_accelerated: hyperdriveAccelerated,
          hyperdrive: hyperdriveAccelerated ? 'active' : 'fallback',
          neon: 'connected',
          direct_neon_configured: Boolean(directNeonUrl),
          kv: isKvConfigured ? 'connected' : 'unconfigured',
          kv_configured: isKvConfigured,
          kv_shards_cached: kvShardsCount,
          d1: isD1Configured ? 'connected' : 'unconfigured',
          d1_configured: isD1Configured,
          timestamp: new Date().toISOString()
        }, 200);
      } catch (err) {
        // Fallback: If Hyperdrive TCP check threw an error and directNeonUrl is available, try direct Neon HTTP
        if (usedHyperdrive && directNeonUrl) {
          try {
            const fallbackSql = neon(enforceNeonPoolerUrl(directNeonUrl));
            await fallbackSql`SELECT 1 as alive;`;
            return jsonResponse({
              status: 'healthy',
              database: 'connected',
              runtime: 'cloudflare_workers',
              hyperdrive_accelerated: false,
              hyperdrive: 'fallback',
              neon: 'connected',
              kv: isKvConfigured ? 'connected' : 'unconfigured',
              kv_configured: isKvConfigured,
              d1: isD1Configured ? 'connected' : 'unconfigured',
              d1_configured: isD1Configured,
              hyperdrive_error: redactSecrets(err.message),
              timestamp: new Date().toISOString()
            }, 200);
          } catch (_) {}
        }
        return jsonResponse({
          status: 'error',
          database: 'disconnected',
          error: redactSecrets(err.message),
          hyperdrive_accelerated: isHyperdriveConfigured,
          hyperdrive: isHyperdriveConfigured ? 'active' : 'fallback',
          neon: 'disconnected',
          kv: isKvConfigured ? 'connected' : 'unconfigured',
          kv_configured: isKvConfigured,
          d1: isD1Configured ? 'connected' : 'unconfigured',
          d1_configured: isD1Configured,
          timestamp: new Date().toISOString()
        }, 500);
      }
    }

    // Security Authentication Gate for Mutating Methods & Sensitive Operations [CAP-02, CAP-03, CAP-04]
    const isMutatingMethod = method === 'POST' || method === 'DELETE' || method === 'PUT' || method === 'PATCH';
    const isSensitiveEndpoint = pathname === '/api/fleet/url' || pathname.startsWith('/api/crawl/dispatch');
    if (isMutatingMethod || isSensitiveEndpoint) {
      const auth = verifyApiAuthentication(request, env);
      if (!auth.authorized) {
        return jsonResponse({
          success: false,
          error: 'UNAUTHORIZED',
          message: auth.reason || 'Authentication required for mutating or sensitive operations.'
        }, 401);
      }
    }

    // Edge Circuit Breaker Gate for Pinterest Rate Limits (HTTP 429 & 403)
    const isLiveScrapeGet = method === 'GET' && searchParams.get('refresh') === 'true' && (
      pathname === '/api/competitors/board-detail' ||
      pathname === '/api/creators/board-detail' ||
      pathname === '/api/pinarchive/pin-detail' ||
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

    // [INVARIANT: SINGLE-OPERATOR-SCALE-TO-ZERO] Bypass SQL connection entirely for lightweight non-DB endpoints
    if (method === 'GET' && pathname === '/api/crawl-status') {
      return jsonResponse({
        is_crawling: false,
        mode: 'github_actions_pipeline',
        message: 'Managed in GitHub Actions'
      });
    }

    if (method === 'GET' && pathname === '/api/settings/cookie') {
      const cookie = env.PINTEREST_COOKIE || '';
      return jsonResponse({
        has_cookie: Boolean(cookie && cookie.trim().length > 10),
        is_configured: Boolean(cookie && cookie.trim().length > 10),
        source: 'cloudflare_env'
      });
    }

    // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY] Return immediately before instantiating Hyperdrive TCP
    if (method === 'GET' && searchParams.get('prefetch') === 'true' && isPinsRoute(pathname)) {
      const parts = pathname.slice('/api/pins/'.length).split('/').filter(Boolean);
      if (parts.length === 1) {
        const pinId = parts[0];
        if (pinId && isValidPinId(pinId)) {
          const edgeFast = await getFastEdgeDossier(pinId, env);
          return jsonResponse(edgeFast, edgeFast.success ? 200 : 404, 300);
        }
      }
    }

    let sql = env?.SQL_CLIENT;
    if (!sql) {
      const isHyperdriveConfigured = Boolean(env?.HYPERDRIVE?.connectionString);
      const directNeonUrl = env?.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : null);

      if (isHyperdriveConfigured) {
        const hyperdriveConn = env.HYPERDRIVE.connectionString;
        const store = requestContextStorage.getStore();
        let hyperdriveSql = store?.hyperdriveSql;
        if (!hyperdriveSql) {
          hyperdriveSql = createHyperdriveClient(hyperdriveConn);
          if (store) store.hyperdriveSql = hyperdriveSql;
        }
        if (directNeonUrl) {
          const pooledDirectUrl = enforceNeonPoolerUrl(directNeonUrl);
          const directSql = getCachedShardSql(pooledDirectUrl, () => neon(pooledDirectUrl));
          sql = new Proxy(hyperdriveSql, {
            apply(target, thisArg, argArray) {
              try {
                const res = Reflect.apply(target, thisArg, argArray);
                if (res && typeof res.catch === 'function') {
                  return res.catch(err => {
                    console.warn(`[Hyperdrive Fallback] Query failed (${redactSecrets(err.message)}). Degrading to direct Neon HTTP.`);
                    return Reflect.apply(directSql, thisArg, argArray);
                  });
                }
                return res;
              } catch (syncErr) {
                console.warn(`[Hyperdrive Sync Fallback] Query failed synchronously (${redactSecrets(syncErr.message)}). Degrading to direct Neon HTTP.`);
                return Reflect.apply(directSql, thisArg, argArray);
              }
            },
            get(target, prop, receiver) {
              if (prop === '__atomicBuilderWrapped') {
                return true;
              }
              if (prop === 'begin') {
                // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] Force all transactional callers through the managed .transaction() trap
                return undefined;
              }
              if (prop === 'transaction') {
                return async (queriesOrFn) => {
                  try {
                    return await target.transaction(queriesOrFn);
                  } catch (err) {
                    if (err instanceof TypeError && err.message.includes('HYPERDRIVE-ATOMIC-BUILDER')) {
                      throw err;
                    }
                    console.warn(`[Hyperdrive Tx Fallback] Tx failed (${redactSecrets(err.message)}). Degrading to direct Neon HTTP tx.`);
                    if (typeof queriesOrFn === 'function') {
                      return await directSql.transaction(queriesOrFn);
                    }
                    if (Array.isArray(queriesOrFn)) {
                      if (queriesOrFn.length === 0) return [];
                      if (queriesOrFn.some(q => typeof q !== 'function')) {
                        throw new TypeError(
                          '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] sql.transaction() strictly requires lazy query builder functions `(db) => db`...``.'
                        );
                      }
                      return await directSql.transaction(queriesOrFn);
                    }
                    throw new TypeError(
                      '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] sql.transaction() strictly requires lazy query builders.'
                    );
                  }
                };
              }
              const val = Reflect.get(target, prop, receiver);
              if (typeof val === 'function') {
                return val.bind(target);
              }
              return val;
            }
          });
        } else {
          sql = hyperdriveSql;
        }
      } else if (directNeonUrl) {
        const pooledDirectUrl = enforceNeonPoolerUrl(directNeonUrl);
        sql = getCachedShardSql(pooledDirectUrl, () => neon(pooledDirectUrl));
      }
    }

    if (!sql) {
      return jsonResponse({
        error: 'DATABASE_URL secret is not set in Cloudflare Workers environment.',
        hint: 'Add DATABASE_URL in Cloudflare Dashboard -> Workers & Pages -> pin-arbitrage-engine -> Settings -> Variables and Secrets.'
      }, 500);
    }
    let targetSql = sql;
    const reqProjectId = searchParams.get('project_id') || searchParams.get('shard') || request.headers.get('x-target-project');
    if (reqProjectId && reqProjectId !== 'all' && reqProjectId !== 'hub') {
      const cleanKey = String(reqProjectId).trim();
      const cachedDsn = shardKeyToDsn.get(cleanKey);
      if (cachedDsn) {
        targetSql = getOrCreateShardSqlClient(cachedDsn);
      } else {
        try {
          let shardsMap = null;
          if (env?.PIN_ENGINE_KV) {
            try {
              shardsMap = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
              if (Array.isArray(shardsMap) && shardsMap.some(r => !isValidShardDsn(r?.database_url))) {
                shardsMap = null;
                safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_shards_map');
              }
            } catch (_) {}
          }
          if (!shardsMap) {
            shardsMap = await sql`
              SELECT id, project_id, project_name, database_url, status, assigned_shards
              FROM neon_projects_registry 
              WHERE status = 'active';
            `;
            if (env?.PIN_ENGINE_KV && Array.isArray(shardsMap) && shardsMap.length > 0) {
              safeWaitUntil(ctx, env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(shardsMap), { expirationTtl: 86400 }), 'kv_cache_shards_map');
            }
          }
          let proj = null;
          if (Array.isArray(shardsMap)) {
            proj = shardsMap.find(p => 
              (p.project_id && String(p.project_id).trim() === cleanKey) ||
              (p.project_name && String(p.project_name).trim() === cleanKey) ||
              (normalizeAssignedShards(p.assigned_shards).includes(Number(cleanKey)))
            );
          }
          if (proj && isValidShardDsn(proj.database_url)) {
            const canonicalUrl = enforceNeonPoolerUrl(proj.database_url);
            shardKeyToDsn.set(cleanKey, canonicalUrl);
            if (proj.project_id) shardKeyToDsn.set(String(proj.project_id).trim(), canonicalUrl);
            if (proj.project_name) shardKeyToDsn.set(String(proj.project_name).trim(), canonicalUrl);
            targetSql = getOrCreateShardSqlClient(canonicalUrl);
          } else if (method !== 'GET') {
            return jsonResponse({
              error: 'Target shard not found or inactive',
              message: `Shard '${cleanKey}' is not active in neon_projects_registry. Write mutation rejected to protect Hub integrity.`
            }, 404);
          }
        } catch (_) {}
      }

      // Resilient Shard Fallback:
      // Reads (GET): Safe Read Degradation to Hub if shard connection fails.
      // Writes (POST/PUT/DELETE): STRICT QUARANTINE - Rejects mutation to prevent split-brain desynchronization.
      if (targetSql !== sql) {
        const shardInstance = targetSql;
        const isReadOperation = method === 'GET';
        targetSql = new Proxy(shardInstance, {
          apply(target, thisArg, argArray) {
            return Reflect.apply(target, thisArg, argArray).catch(err => {
              if (isReadOperation) {
                // Adaptive Bulkhead: Shed requests if Hub fallback is saturated to prevent Cascading Hub Meltdown
                if (activeHubFallbacks >= MAX_CONCURRENT_HUB_FALLBACKS) {
                  console.warn(`[Bulkhead Protection] Hub fallback saturated (${activeHubFallbacks}/${MAX_CONCURRENT_HUB_FALLBACKS} in-flight). Shedding query with fast 503.`);
                  const shedError = new Error('Central database fallback is temporarily saturated (Bulkhead Protection). Please retry shortly.');
                  shedError.status = 503;
                  throw shedError;
                }
                activeHubFallbacks++;
                console.warn(`[Shard Read Fallback] Shard read query failed (${redactSecrets(err.message)}). Safely degrading to Hub (Bulkhead: ${activeHubFallbacks}/${MAX_CONCURRENT_HUB_FALLBACKS}).`);
                try {
                  return Promise.resolve(Reflect.apply(sql, thisArg, argArray)).finally(() => {
                    activeHubFallbacks--;
                  });
                } catch (fallbackSyncErr) {
                  activeHubFallbacks--;
                  throw fallbackSyncErr;
                }
              }
              console.error(`[Split-Brain Guard] Write mutation rejected because shard is unreachable (${redactSecrets(err.message)}).`);
              const splitBrainError = new Error(`Shard database '${cleanKey}' is temporarily unreachable. Write mutation rejected to prevent split-brain desynchronization.`);
              splitBrainError.status = 503;
              throw splitBrainError;
            });
          }
        });
      }
    }

      // 1. Cluster Intelligence & Graph Discovery Sub-Router
      if (isClusterRoute(pathname)) {
        const clusterRes = await handleClusterRoutes({
          pathname,
          method,
          request,
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
          getPinKvKeysToEvict,
          redactSecrets
        });
        if (clusterRes) return clusterRes;
      }

      // 15. Creator Hub Sub-Router (/api/creators/*, /api/competitors/*, /api/pinarchive/*)
      if (pathname.startsWith('/api/creators') || pathname.startsWith('/api/competitors') || pathname.startsWith('/api/pinarchive')) {
        const creatorsRes = await handleCreatorsRoutes({
          pathname,
          method,
          request,
          searchParams,
          env,
          ctx,
          sql,
          targetSql,
          reqProjectId,
          jsonResponse,
          clampLimit,
          buildCanonicalCacheKey,
          getCachedOrFetch,
          invalidateEdgeCache,
          safeWaitUntil,
          tripPinterestCircuitBreaker
        });
        if (creatorsRes) return creatorsRes;
      }

      // 16. Keywords, Folders & Settings Sub-Router
      if (isKeywordsRoute(pathname)) {
        const keywordsRes = await handleKeywordsRoutes({
          pathname,
          method,
          request,
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
          readKeywordsFromD1,
          syncKeywordsCatalogToD1,
          syncKeywordsBatchToD1,
          syncKeywordToD1,
          evictKeywordsCatalogFromD1,
          syncFolderToD1,
          deleteFolderFromD1,
          getPinKvKeysToEvict,
          isValidPinId,
          tripPinterestCircuitBreaker,
          redactSecrets
        });
        if (keywordsRes) return keywordsRes;
      }

      // 16B. Universal Pin Intelligence Sub-Router
      if (isPinsRoute(pathname)) {
        const pinsRes = await handlePinsRoutes({
          pathname,
          method,
          request,
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
          getPinKvKeysToEvict,
          isValidPinId,
          redactSecrets
        });
        if (pinsRes) return pinsRes;
      }

      // 17. Neon Multi-Project Fleet API & Shards Map Sub-Router
      if (pathname.startsWith('/api/fleet')) {
        const fleetRes = await handleFleetRoutes({
          pathname,
          method,
          request,
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


      // 19. Domain Intelligence & SERP Monopoly Sub-Router
      if (pathname.startsWith('/api/domains')) {
        const domainsRes = await handleDomainsRoutes({
          env,
          pathname,
          method,
          request,
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



      // Default 404
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
        message: redactSecrets(err.message || 'An unexpected internal error occurred')
      }, status);
    } finally {
      const store = requestContextStorage.getStore();
      if (store?.hyperdriveSql && typeof store.hyperdriveSql.end === 'function') {
        const hyperdriveClient = store.hyperdriveSql;

        // [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]
        // [INVARIANT: SAFE-DRAIN-BEFORE-SOCKET-CLOSE]
        // Drain in-flight background promises iteratively with a 26-second ceiling
        // before safely closing the Hyperdrive TCP socket. Offloaded completely to ctx.waitUntil
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
            console.warn('[Hyperdrive Drain] Background tasks drain warning:', redactSecrets(drainErr?.message || String(drainErr)));
          } finally {
            if (drainTimerId !== null) {
              clearTimeout(drainTimerId);
              drainTimerId = null;
            }
            store.hyperdriveSql = null;
            try {
              await hyperdriveClient.end({ timeout: 3 });
            } catch (closeErr) {
              console.warn('[Hyperdrive Socket Close] Non-fatal teardown note:', redactSecrets(closeErr?.message || String(closeErr)));
            }
          }
        })();

        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(closePromise);
        }
      }
    }
    });
  },

  /**
   * Cloudflare Worker Scheduled Cron Handler
   * 100% reliant on GitHub Actions (20-Shard Parallel Matrix) for harvesting.
   * Dispatches crawler-pipeline.yml on GitHub Actions rather than harvesting on Worker.
   */
  async scheduled(event, env, ctx) {
    const githubToken = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
    const repo = env.GITHUB_REPOSITORY || 'sayfedin-star/pin-arbitrage-engine';

    if (githubToken) {
      console.log(`[Worker Cron] Delegating scheduled crawl to GitHub Actions 20-shard pipeline (${repo})...`);
      const cleanToken = String(githubToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
      const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Pin-Arbitrage-Engine-EdgeWorker'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              crawl_mode: 'refresh',
              max_pages: '3'
            }
          })
        });
        if (res.ok) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          console.log('[Worker Cron] Successfully dispatched crawler-pipeline.yml to GitHub Actions.');
        } else {
          const errText = await res.text();
          console.warn(`[Worker Cron] GitHub Actions dispatch returned ${res.status}: ${errText}`);
        }
      } catch (err) {
        console.error('[Worker Cron] GitHub dispatch error:', err.message);
      }
    } else {
      console.log('[Worker Cron] Automated crawl delegated 100% to GitHub Actions native daily cron schedule (.github/workflows/crawler-pipeline.yml)');
    }
  }
};
