/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cloudflare Worker Edge Entrypoint
 *
 * Runs on Cloudflare Workers edge runtime with Neon Serverless Postgres
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import { getDashboardHtml } from './dashboard-ui.mjs';
import { getKeywordsPageHtml } from './keywords-ui.mjs';
import { getDiscoveryPageHtml } from './discovery-ui.mjs';
import { getPinDetailPageHtml } from './pin-details-ui.mjs';
import { getCampaignFoldersPageHtml } from './campaign-folders-ui.mjs';
import { getDomainsPageHtml } from './domains-ui.mjs';
import {
  listDomainsIntelligence,
  listDomainsIntelligenceFast,
  getDomainDeepDossier,
  fetchAndCacheDomainAge,
  enrichMissingDomainsBatch,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch,
  normalizeCleanDomain,
  fetchAndCacheDomainAdNetwork,
  enrichMissingAdNetworksBatch,
  getDatabaseMonetizationStats,
  enrichNextUncheckedAdsBatch,
  generateDomainArbitrageBlueprint
} from './modules/domains/service.mjs';
import {
  fetchUniversalPinDossier,
  getPinShardId,
  resolveShardConnection,
  getFleetShardsMap,
  enforceNeonPoolerUrl
} from './modules/sharding/fleet-router.mjs';
import { fetchPinFromPinterest } from '../scripts/lib/pinterest.mjs';

export const requestContextStorage = new AsyncLocalStorage();
globalThis.__requestContextStorage = requestContextStorage;

// Reserved Keyword Slugs (Defends against route swallowing on /keywords/:slug)
export const RESERVED_KEYWORD_SLUGS = new Set([
  'discovery', 'folders', 'export', 'sync', 'batch', 'api', 'add', 'manage', 'import', 'domains'
]);
import {
  getCompetitorsOverview,
  listCompetitors,
  trackCompetitor,
  syncCompetitorProfile,
  getCompetitorBoards,
  syncCompetitorBoards,
  syncCompetitorPins,
  getCompetitorDetail,
  deleteCompetitorSnapshot,
  updateCompetitorStatus,
  listCompetitorAccountPins,
  getOrSyncBoardDetail,
  getTopDestinationUrls,
  getCompetitorRules,
  saveCompetitorRules,
  reEvaluateCompetitorPins,
  getCompetitorSeeds,
  addCompetitorSeeds,
  deleteCompetitorSeed,
  getCompetitorRelatedIntersections,
  harvestSinglePinRelatedLive
} from './modules/competitors/service.mjs';
import {
  listKeywords,
  addKeyword,
  resolveKeywordBySlug,
  crawlKeywordSERP,
  getKeywordPins,
  fetchKeywordTypeahead,
  fetchVisualSearchLens,
  getKeywordGuides,
  getKeywordSERPComparison,
  getKeywordIntelligence,
  getKeywordDisplacedPins,
  getPinPerformanceTrajectory,
  getPinDeepDossier,
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings
} from './modules/keywords/service.mjs';
import { fetchPinterestTrends, fetchPinterestTrendsPopularPins, fetchPinterestInterestVolume, fetchKeywordRelatedInterests, fetchPinterestBatchVelocity } from './modules/keywords/trends-service.mjs';
import {
  listFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  addKeywordToFolder,
  batchAddKeywordsToFolder,
  removeKeywordFromFolder,
  getFoldersForKeyword,
  calculateFolderCrossover,
  normalizeFolderMetadata
} from './modules/keywords/folders-service.mjs';
import { getFleetProjects, registerNewProject, syncFleetDatabases, syncCompetitorAcrossFleet, pingFleetProject, getFleetProjectUrl } from './modules/fleet/service.mjs';
import {
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  getQualificationRules,
  updateQualificationRules,
  reEvaluateArchivedPins,
  getPinDetailWithMetrics,
  deletePinMetricSnapshot
} from './modules/pinarchive/service.mjs';
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
    `traj:pin:${pid}`,
    `traj:pin:${pid}:0`,
    `traj:pin:${pid}:all`,
    `traj:pin:${pid}:7d`,
    `traj:pin:${pid}:14d`,
    `traj:pin:${pid}:30d`
  ]);
  for (const kid of associatedKids) {
    if (kid != null && kid !== 0) {
      keys.add(`dossier:pin:${pid}:${kid}`);
      keys.add(`traj:pin:${pid}:${kid}`);
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
    const itemCount = Number(folder.item_count || folder.keyword_count || 0);
    const updatedAt = folder.updated_at ? new Date(folder.updated_at).toISOString() : new Date().toISOString();

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

export const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-cache, no-transform, max-age=0, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none';"
};

// Culinary Color Name Mapper
export function getCulinaryColorName(hex) {
  if (!hex || typeof hex !== 'string') return 'Culinary Accent';
  const cleanHex = hex.replace('#', '').toLowerCase();
  if (cleanHex.length < 6) return 'Culinary Accent';

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;

  if (delta !== 0) {
    if (max === r / 255) h = ((g / 255 - b / 255) / delta) % 6;
    else if (max === g / 255) h = (b / 255 - r / 255) / delta + 2;
    else h = (r / 255 - g / 255) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Refined Culinary & Dessert/Bakery Boundaries
  if (l >= 0.82) return 'Whipped Vanilla / Glaze Cream';
  if (l <= 0.18) return 'Charred Espresso / Dark Truffle';
  if (h >= 345 || h <= 10) return 'Cranberry Glaze / Red Reduction';
  if (h > 10 && h <= 30 && l < 0.38) return 'Toasted Cinnamon / Dutch Cocoa';
  if (h > 10 && h <= 32 && l >= 0.38 && l < 0.55) return 'Roasted Pumpkin / Warm Amber';
  if (h > 32 && h <= 55 && l >= 0.40) return 'Golden Brioche / Honey Glaze';
  if (h > 10 && h <= 45 && l < 0.45) return 'Caramelized Pecan / Spice Crumble';
  if (h > 55 && h <= 165) return 'Fresh Herb / Sage Infusion';
  if (h > 165 && h <= 260) return 'Nordic Sea Salt / Steel Cookware';
  
  return 'Artisan Blend / Culinary Accent';
}

function formatAge(days) {
  const d = Number(days || 1);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
}

// Bounded database connection cache to prevent connection/memory leaks in Workers (max 128)
const shardSqlCache = new Map();
function setCachedShardSql(key, client) {
  if (!key || !client) return;
  if (shardSqlCache.has(key)) {
    shardSqlCache.delete(key);
  } else if (shardSqlCache.size >= 128) {
    const oldestKey = shardSqlCache.keys().next().value;
    if (oldestKey) shardSqlCache.delete(oldestKey);
  }
  shardSqlCache.set(key, client);
}

function getCachedShardSql(key, factory) {
  if (shardSqlCache.has(key)) {
    const client = shardSqlCache.get(key);
    shardSqlCache.delete(key);
    shardSqlCache.set(key, client);
    return client;
  }
  const client = factory();
  setCachedShardSql(key, client);
  return client;
}

export function createHyperdriveClient(connectionString, customOpts = {}) {
  const pSql = postgres(connectionString, {
    max: 3,
    fetch_types: false,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 3,
    ...customOpts
  });
  pSql.transaction = async (queriesOrFn) => {
    if (typeof queriesOrFn === 'function') {
      return await pSql.begin(async (tx) => {
        const res = await queriesOrFn(tx);
        return Array.isArray(res) ? await Promise.all(res) : res;
      });
    }
    return await Promise.all(Array.isArray(queriesOrFn) ? queriesOrFn : [queriesOrFn]);
  };
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

export async function getCachedOrFetch(key, fetcher, ttlMs = 15000, staleMs = 60000, { forceRefresh = false } = {}) {
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
              timerId = setTimeout(() => reject(new Error(`Timeout revalidating ${key}`)), 7500);
            });
            const fresh = await Promise.race([
              fetchTask,
              timeoutPromise
            ]).finally(() => {
              if (timerId) clearTimeout(timerId);
            });
            if (fresh && fresh.success !== false && !fresh.degraded && !fresh._degraded) {
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
        timerId = setTimeout(() => reject(new Error(`Timeout fetching ${key}`)), 7500);
      });
      const fresh = await Promise.race([
        fetchTask,
        timeoutPromise
      ]).finally(() => {
        if (timerId) clearTimeout(timerId);
      });
      if (fresh && fresh.success !== false && !fresh.degraded && !fresh._degraded) {
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

    // 1. Level 1B: Keyword Discovery & Autocomplete Hub
    if (pathLower === '/keywords/discovery' || pathLower === '/discovery' || pathLower.startsWith('/keywords/discovery/') || pathLower.startsWith('/discovery/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      return new Response(getDiscoveryPageHtml(), {
        status: 200,
        headers: HTML_HEADERS
      });
    }

    // 2. Level 3: Dedicated Pin Intelligence Page (/pins/:pin_id or /pin/:pin_id) [CAP-07]
    if (pathLower.startsWith('/pins/') || pathLower.startsWith('/pin/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      const segments = normalizedPath.split('/').filter(Boolean);
      const rawPinId = segments[1] || '';
      const cleanPinId = String(rawPinId).trim();
      if (!cleanPinId || !isValidPinId(cleanPinId)) {
        return jsonResponse({ success: false, error: 'INVALID_PIN_ID', message: 'Pin ID is required (numeric Snowflake, 10-30 digits)' }, 400);
      }
      return new Response(getPinDetailPageHtml(cleanPinId), {
        status: 200,
        headers: HTML_HEADERS
      });
    }

    // 3. Level 4: Dedicated Campaign Folders & Crossover Studio (/folders and /folders/:id)
    if (pathLower === '/folders' || pathLower.startsWith('/folders/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      const segments = normalizedPath.split('/').filter(Boolean);
      const folderId = segments[1] || '';
      return new Response(getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
        status: 200,
        headers: HTML_HEADERS
      });
    }

    // Level 4B: Dedicated Domain Intelligence & SERP Monopoly Studio (/domains)
    if (pathLower === '/domains' || pathLower.startsWith('/domains/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      return new Response(getDomainsPageHtml(), {
        status: 200,
        headers: HTML_HEADERS
      });
    }

    // 4. Level 1A & Level 2: Keywords Dashboard (/keywords) & SERP Radar (/keywords/:slug)
    if (pathLower === '/keywords' || pathLower.startsWith('/keywords/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      const segments = normalizedPath.split('/').filter(Boolean);
      const rawSlug = segments[1] || '';
      const slugLower = rawSlug.toLowerCase();
      
      // Defend against reserved slugs
      if (rawSlug && RESERVED_KEYWORD_SLUGS.has(slugLower)) {
        if (slugLower === 'discovery') {
          return new Response(getDiscoveryPageHtml(), {
            status: 200,
            headers: HTML_HEADERS
          });
        }
        if (slugLower === 'folders') {
          const folderId = segments[2] || '';
          return new Response(getCampaignFoldersPageHtml(decodeURIComponent(folderId)), {
            status: 200,
            headers: HTML_HEADERS
          });
        }
        if (slugLower === 'domains') {
          return new Response(getDomainsPageHtml(), {
            status: 200,
            headers: HTML_HEADERS
          });
        }
      }

      // Query parameter fallback (?q=... or ?keyword=...)
      let slug = rawSlug;
      const queryParam = searchParams.get('q') || searchParams.get('keyword') || searchParams.get('slug');
      if (!slug && queryParam) {
        slug = queryParam.trim();
      }

      return new Response(getKeywordsPageHtml(slug), {
        status: 200,
        headers: HTML_HEADERS
      });
    }

    // Serve Frontend Dashboard HTML for root or any creator handle route (e.g. /wifesrecipesbyme)
    if (!pathLower.startsWith('/api/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      return new Response(getDashboardHtml(), {
        status: 200,
        headers: HTML_HEADERS
      });
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
            if (!cachedMap || !Array.isArray(cachedMap) || cachedMap.length === 0) {
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
      pathname === '/api/pinarchive/pin-detail' ||
      pathname.startsWith('/api/pins/')
    );
    const isCrawlerEndpoint =
      pathname === '/api/crawl' ||
      pathname.startsWith('/api/crawl/') ||
      pathname === '/api/keywords/sync' ||
      pathname === '/api/competitors/dispatch-crawl' ||
      pathname === '/api/competitors/sync' ||
      pathname === '/api/competitors/sync-boards' ||
      pathname === '/api/competitors/sync-pins' ||
      pathname === '/api/competitors/related-pins/harvest-live' ||
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
              if (prop === 'transaction') {
                return async (queriesOrFn) => {
                  try {
                    return await target.transaction(queriesOrFn);
                  } catch (err) {
                    console.warn(`[Hyperdrive Tx Fallback] Tx failed (${redactSecrets(err.message)}). Degrading to direct Neon HTTP tx.`);
                    if (typeof queriesOrFn === 'function') {
                      return await queriesOrFn(directSql);
                    }
                    return await directSql.transaction(queriesOrFn);
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
      if (shardSqlCache.has(cleanKey)) {
        targetSql = shardSqlCache.get(cleanKey);
      } else {
        try {
          let shardsMap = null;
          if (env?.PIN_ENGINE_KV) {
            try {
              shardsMap = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
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
              (Array.isArray(p.assigned_shards) && p.assigned_shards.map(Number).includes(Number(cleanKey)))
            );
          }
          if (proj && proj.database_url) {
            const pooledShardUrl = enforceNeonPoolerUrl(proj.database_url);
            targetSql = getCachedShardSql(pooledShardUrl, () => neon(pooledShardUrl));
            setCachedShardSql(cleanKey, targetSql);
            if (proj.project_id) setCachedShardSql(proj.project_id, targetSql);
            if (proj.project_name) setCachedShardSql(proj.project_name, targetSql);
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

    // 1. GET /api/overview
    if (method === 'GET' && pathname === '/api/overview') {
        const cacheKey = buildCanonicalCacheKey('api:overview', {});
        const payload = await getCachedOrFetch(cacheKey, async () => {
          const overviewRows = await targetSql`
            SELECT 
              (SELECT COUNT(*) FROM cluster_seeds) AS total_seeds,
              (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NOT NULL) AS indexed_seeds,
              (SELECT COUNT(*) FROM cluster_seeds WHERE last_crawled_at IS NULL) AS queued_seeds,
              (SELECT COUNT(*) FROM candidate_graph_nodes) AS total_candidates,
              (SELECT COUNT(*) FROM candidate_graph_nodes WHERE is_product = true) AS total_products,
              (SELECT COALESCE(ROUND(AVG(commercial_gap_ratio)::numeric, 2), 0) FROM cluster_arbitrage_metrics) AS avg_commercial_gap,
              (SELECT COUNT(*) FROM (
                  SELECT candidate_pin_id 
                  FROM candidate_graph_nodes 
                  GROUP BY candidate_pin_id 
                  HAVING COUNT(DISTINCT seed_pin_id) >= 2
              ) sub) AS intersecting_hubs_count;
          `;

          const overview = overviewRows[0] || {};
          const totalCandidates = Number(overview.total_candidates || 0);
          const totalProducts = Number(overview.total_products || 0);
          const avgCommercialGap = Number(overview.avg_commercial_gap || 0);
          const intersectingHubsCount = Number(overview.intersecting_hubs_count || 0);

          const shoppingPresencePct = totalCandidates > 0
            ? Number(((totalProducts / totalCandidates) * 100).toFixed(1))
            : 0;

          const vulnerabilityIndex = Number(Math.min(99.9, Math.max(15, (avgCommercialGap * 0.75 + (intersectingHubsCount > 0 ? 25 : 10)))).toFixed(1));

          return {
            total_seeds: Number(overview.total_seeds || 0),
            indexed_seeds: Number(overview.indexed_seeds || 0),
            queued_seeds: Number(overview.queued_seeds || 0),
            total_candidates: totalCandidates,
            total_products: totalProducts,
            shopping_presence_pct: shoppingPresencePct,
            avg_commercial_gap: avgCommercialGap,
            intersecting_hubs_count: intersectingHubsCount,
            cluster_vulnerability_index: vulnerabilityIndex,
            utility_advantage_multiplier: 5.12,
            expected_prod_utility: 383.34,
            organic_peak_utility: -74.91,
            semantically_aligned: true
          };
        }, 30000, 120000);

        return jsonResponse(payload);
      }

      // 2. GET /api/seeds
      if (method === 'GET' && pathname === '/api/seeds') {
        const cacheKey = buildCanonicalCacheKey('api:seeds', {});
        const seeds = await getCachedOrFetch(cacheKey, async () => {
          return await targetSql`
            SELECT 
                s.pin_id,
                s.label,
                s.is_competitor,
                s.created_at,
                s.last_crawled_at,
                COALESCE(m.total_candidates, c_count.count, 0) AS total_candidates,
                COALESCE(m.total_candidates, c_count.count, 0) AS candidate_count,
                COALESCE(cap_count.count, 0) AS total_capsules,
                COALESCE(cap_count.count, 0) AS capsule_count,
                m.total_candidates AS metrics_candidates,
                m.recgpt_count,
                m.navboost_count,
                m.randomwalk_count,
                m.two_tower_count,
                m.fresh_candidate_count,
                m.product_count,
                m.commercial_gap_ratio,
                m.winning_color_centroids,
                m.high_save_tokens,
                m.utility_snapshot,
                m.analyzed_at
            FROM cluster_seeds s
            LEFT JOIN LATERAL (
                SELECT * FROM cluster_arbitrage_metrics 
                WHERE seed_pin_id = s.pin_id 
                ORDER BY analyzed_at DESC 
                LIMIT 1
            ) m ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS count
                FROM candidate_graph_nodes
                WHERE seed_pin_id = s.pin_id
                  AND m.total_candidates IS NULL
            ) c_count ON m.total_candidates IS NULL
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS count
                FROM seed_guided_search_capsules
                WHERE seed_pin_id = s.pin_id
            ) cap_count ON true
            ORDER BY s.created_at DESC;
          `;
        }, 30000, 120000);

        return jsonResponse(seeds);
      }

      // 3. POST /api/seeds
      if (method === 'POST' && pathname === '/api/seeds') {
        const body = await request.json().catch(() => ({}));
        const pinId = String(body.pin_id || '').trim();
        const label = String(body.label || 'Manual Tracked Seed').trim();
        const isCompetitor = Boolean(body.is_competitor ?? true);

        if (!pinId) {
          return jsonResponse({ error: 'pin_id is required' }, 400);
        }

        const result = await targetSql`
          INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
          VALUES (${pinId}, ${label}, ${isCompetitor}, NOW())
          ON CONFLICT (pin_id) DO UPDATE SET
              label = EXCLUDED.label,
              is_competitor = EXCLUDED.is_competitor
          RETURNING pin_id, label, is_competitor, last_crawled_at;
        `;
        invalidateEdgeCache('api:overview');
        invalidateEdgeCache('api:seeds');
        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        return jsonResponse({ success: true, seed: result[0] }, 201);
      }

      // 3B. POST /api/seeds/bulk
      if (method === 'POST' && pathname === '/api/seeds/bulk') {
        const body = await request.json().catch(() => ({}));
        const rawSeeds = [];
        if (Array.isArray(body.seeds)) {
          for (const s of body.seeds) {
            const pid = String(s.pin_id || '').trim();
            if (pid && /^\d+$/.test(pid)) {
              rawSeeds.push({
                pin_id: pid,
                label: String(s.label || `Tracked Seed ${pid}`).trim(),
                is_competitor: Boolean(s.is_competitor ?? true)
              });
            }
          }
        } else if (Array.isArray(body.pin_ids)) {
          const isComp = Boolean(body.is_competitor ?? true);
          const prefix = String(body.label_prefix || 'Tracked Seed').trim();
          for (const raw of body.pin_ids) {
            const pid = String(raw || '').trim();
            if (pid && /^\d+$/.test(pid)) {
              rawSeeds.push({
                pin_id: pid,
                label: `${prefix} ${pid}`,
                is_competitor: isComp
              });
            }
          }
        }

        if (rawSeeds.length === 0) {
          return jsonResponse({ error: 'No valid numeric pin IDs provided in payload' }, 400);
        }

        const dedupSeedsMap = new Map();
        for (const s of rawSeeds) {
          if (s?.pin_id) dedupSeedsMap.set(String(s.pin_id), s);
        }
        const uniqueSeeds = Array.from(dedupSeedsMap.values());
        const inserted = await targetSql`
          INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
          SELECT u.pin_id, u.label, u.is_competitor, NOW()
          FROM jsonb_to_recordset(${JSON.stringify(uniqueSeeds)}::jsonb) AS u(
            pin_id text,
            label text,
            is_competitor boolean
          )
          ON CONFLICT (pin_id) DO UPDATE SET
            label = EXCLUDED.label,
            is_competitor = EXCLUDED.is_competitor
          RETURNING pin_id, label, is_competitor, last_crawled_at;
        `;

        invalidateEdgeCache('api:overview');
        invalidateEdgeCache('api:seeds');
        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        return jsonResponse({ success: true, count: inserted.length, seeds: inserted }, 201);
      }

      // 3C. POST /api/seeds/bulk-delete
      if (method === 'POST' && pathname === '/api/seeds/bulk-delete') {
        const body = await request.json().catch(() => ({}));
        const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids.map(p => String(p).trim()).filter(Boolean) : [];
        const purgeDatabase = Boolean(body.purge_database ?? true);

        if (pinIds.length === 0) {
          return jsonResponse({ error: 'pin_ids array is required' }, 400);
        }

        if (purgeDatabase) {
          await Promise.all([
            targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ANY(${pinIds});`,
            targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ANY(${pinIds});`,
            targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ANY(${pinIds});`
          ]);
        }
        await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ANY(${pinIds});`;

        invalidateEdgeCache('api:overview');
        invalidateEdgeCache('api:seeds');
        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        if (env?.PIN_ENGINE_KV && pinIds.length > 0) {
          const evictions = pinIds.flatMap(pid => 
            getPinKvKeysToEvict(pid).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}))
          );
          safeWaitUntil(ctx, Promise.all(evictions), 'kv_delete_seeds_cache');
        }
        return jsonResponse({
          success: true,
          deleted_count: pinIds.length,
          purged_database: purgeDatabase,
          deleted_pin_ids: pinIds
        });
      }

      // 4. DELETE /api/seeds
      if (method === 'DELETE' && pathname === '/api/seeds') {
        const pinId = searchParams.get('pin_id');
        const purgeData = searchParams.get('purge_data') === 'true' || searchParams.get('purge_database') === 'true';
        if (!pinId) {
          return jsonResponse({ error: 'pin_id query parameter is required' }, 400);
        }
        if (purgeData) {
          await Promise.all([
            targetSql`DELETE FROM candidate_graph_nodes WHERE seed_pin_id = ${pinId};`,
            targetSql`DELETE FROM seed_guided_search_capsules WHERE seed_pin_id = ${pinId};`,
            targetSql`DELETE FROM cluster_arbitrage_metrics WHERE seed_pin_id = ${pinId};`
          ]);
        }
        await targetSql`DELETE FROM cluster_seeds WHERE pin_id = ${pinId};`;
        invalidateEdgeCache('api:overview');
        invalidateEdgeCache('api:seeds');
        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        if (env?.PIN_ENGINE_KV && pinId) {
          const evictions = getPinKvKeysToEvict(pinId).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
          safeWaitUntil(ctx, Promise.all(evictions), 'kv_delete_seed_cache');
        }
        return jsonResponse({ success: true, deleted_pin_id: pinId, purged_database: purgeData });
      }

      // 4B. POST /api/candidates/delete
      if (method === 'POST' && pathname === '/api/candidates/delete') {
        const body = await request.json().catch(() => ({}));
        const candIds = Array.isArray(body.candidate_pin_ids) ? body.candidate_pin_ids.map(c => String(c).trim()).filter(Boolean) : [];
        const seedPinId = body.seed_pin_id ? String(body.seed_pin_id).trim() : null;

        if (candIds.length === 0) {
          return jsonResponse({ error: 'candidate_pin_ids array is required' }, 400);
        }

        if (seedPinId) {
          await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds}) AND seed_pin_id = ${seedPinId};`;
        } else {
          await targetSql`DELETE FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candIds});`;
        }

        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        return jsonResponse({ success: true, deleted_count: candIds.length });
      }

      // 4C. GET /api/workflow/runs (Cloudflare Worker GitHub API integration)
      if (method === 'GET' && pathname === '/api/workflow/runs') {
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        try {
          const headers = {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json'
          };
          if (ghToken) {
            const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
            headers['Authorization'] = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
          }
          const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/runs?per_page=15`, { headers });
          if (res.ok) {
            const data = await res.json();
            const formatted = (data.workflow_runs || []).map(r => ({
              databaseId: r.id,
              status: r.status,
              conclusion: r.conclusion,
              createdAt: r.created_at,
              url: r.html_url,
              event: r.event,
              displayTitle: r.display_title || r.name,
              headBranch: r.head_branch
            }));
            return jsonResponse(formatted);
          }
          if (res?.body) await res.body.cancel().catch(() => {});
          return jsonResponse([]);
        } catch (e) {
          return jsonResponse([]);
        }
      }

      // 4D. POST /api/workflow/trigger (Cloudflare Worker GitHub API dispatch)
      if (method === 'POST' && pathname === '/api/workflow/trigger') {
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GitHub Token secret not configured in Cloudflare Workers settings. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const body = await request.json().catch(() => ({}));
        let target = '';
        if (Array.isArray(body.seed_pin_ids) && body.seed_pin_ids.length > 0) {
          target = body.seed_pin_ids.map(s => {
            const m = String(s).match(/\d{10,25}/);
            return m ? m[0] : String(s).trim();
          }).filter(Boolean).join(',');
        } else if (body.seed_pin_id) {
          target = String(body.seed_pin_id).split(',').map(s => {
            const m = String(s).match(/\d{10,25}/);
            return m ? m[0] : String(s).trim();
          }).filter(Boolean).join(',');
        }
        const maxPages = body.max_pages ? String(body.max_pages).trim() : '60';

        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/cluster-intelligence.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              seed_pin_id: target,
              max_pages: maxPages
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            seed_pin_id: target || 'all_queued',
            max_pages: maxPages,
            message: 'Workflow dispatched successfully to GitHub Actions.'
          });
        } else {
          const errText = await res.text();
          let errDetail = errText;
          if (res.status === 401) {
            errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
          }
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errDetail}` }, res.status);
        }
      }

      // 5. GET /api/candidates
      if (method === 'GET' && pathname === '/api/candidates') {
        const seedPinId = searchParams.get('seed_pin_id');
        const limit = clampLimit(searchParams.get('limit'), 1000, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
        const query = (searchParams.get('q') || '').trim();
        const sort = (searchParams.get('sort') || 'saves').toLowerCase();
        const shardKey = reqProjectId || 'hub';

        const cacheKey = buildCanonicalCacheKey(`candidates:${shardKey}`, {
          seed_pin_id: seedPinId,
          limit,
          offset,
          q: query,
          sort
        });

        const enriched = await getCachedOrFetch(cacheKey, async () => {
          let rows;
          const cleanQuery = (query && typeof query === 'string' && query.trim()) ? escapeSqlWildcards(query.toLowerCase().trim()) : null;
          if (seedPinId && cleanQuery) {
            const qPattern = `%${cleanQuery}%`;
            rows = sort === 'velocity' ? await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId}
                AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
              ORDER BY daily_velocity DESC NULLS LAST, saves DESC
              LIMIT ${limit} OFFSET ${offset};
            ` : await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId}
                AND (LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern})
              ORDER BY saves DESC NULLS LAST, daily_velocity DESC
              LIMIT ${limit} OFFSET ${offset};
            `;
          } else if (seedPinId) {
            rows = sort === 'velocity' ? await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId}
              ORDER BY daily_velocity DESC NULLS LAST, saves DESC
              LIMIT ${limit} OFFSET ${offset};
            ` : await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE seed_pin_id = ${seedPinId}
              ORDER BY saves DESC NULLS LAST, daily_velocity DESC
              LIMIT ${limit} OFFSET ${offset};
            `;
          } else if (cleanQuery) {
            const qPattern = `%${cleanQuery}%`;
            rows = sort === 'velocity' ? await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
              ORDER BY daily_velocity DESC NULLS LAST, saves DESC
              LIMIT ${limit} OFFSET ${offset};
            ` : await targetSql`
              SELECT * FROM candidate_graph_nodes
              WHERE LOWER(title) LIKE ${qPattern} OR LOWER(domain) LIKE ${qPattern} OR LOWER(COALESCE(ocr_text, '')) LIKE ${qPattern} OR candidate_pin_id LIKE ${qPattern}
              ORDER BY saves DESC NULLS LAST, daily_velocity DESC
              LIMIT ${limit} OFFSET ${offset};
            `;
          } else {
            rows = sort === 'velocity' ? await targetSql`
              SELECT * FROM candidate_graph_nodes
              ORDER BY daily_velocity DESC NULLS LAST, saves DESC
              LIMIT ${limit} OFFSET ${offset};
            ` : await targetSql`
              SELECT * FROM candidate_graph_nodes
              ORDER BY saves DESC NULLS LAST, daily_velocity DESC
              LIMIT ${limit} OFFSET ${offset};
            `;
          }

          return rows.map((r) => {
            const saves = Number(r.saves || 0);
            const ar = Number(r.aspect_ratio || 0.56);
            let format = 'ORGANIC PIN';
            if (r.is_product) format = 'PRODUCT CARD';
            else if (r.is_video) format = 'VIDEO PIN';
            else if (ar > 1.3) format = 'IDEA PIN';

            let engine = r.provenance_engine;
            if (!engine) {
              const age = Number(r.age_days || 180);
              const role = r.sequence_role || '';
              const vel = Number(r.daily_velocity || 0);
              if (r.is_product) engine = 'P2P_SHOPPING_CORPUS';
              else if (age <= 22 && saves < 800) engine = 'FRESH_COLD_START';
              else if (saves >= 6500 || vel >= 20.0) engine = 'P2P_NAVBOOST';
              else if (['DESSERT_HERO', 'BEVERAGE_PAIRING', 'PASTRY_BITES', 'SESSION_FINISHER'].includes(role) && saves >= 350) engine = 'P2P_RECGPT';
              else if (saves >= 1200) engine = 'P2P_RANDOMWALK';
              else engine = 'P2P_TWO_TOWER';
            }

            const velocity = Number(r.daily_velocity || 0);
            let velocityTier = 'stagnant';
            if (velocity >= 50) velocityTier = 'explosive';
            else if (velocity >= 10) velocityTier = 'trending';

            const prodScore = Number(r.individual_prod_score != null ? r.individual_prod_score : (r.is_product ? 203.29 : -17.58));
            const prodSpread = Number((203.29 - prodScore).toFixed(1));

            return {
              ...r,
              total_saves: saves,
              total_repins: Number(r.repins || 0),
              avg_save_rate: Number(r.save_rate || 0),
              daily_velocity: velocity,
              age_days: Number(r.age_days || 1),
              age_display: formatAge(r.age_days),
              velocity_tier: velocityTier,
              individual_prod_score: prodScore,
              prod_spread: prodSpread,
              sequence_role: r.sequence_role || 'DIRECT_MATCH',
              recgpt_transition_score: Number(r.recgpt_transition_score || 0),
              is_recgpt_candidate: Boolean(r.is_recgpt_candidate),
              culinary_color_name: getCulinaryColorName(r.dominant_color),
              winning_color: r.dominant_color || '#888888',
              format_type: format,
              is_vacuum_target: !r.is_product && saves >= 5000,
              engine_source: engine,
              image_url: r.image_url || '',
              is_video: Boolean(r.is_video),
              ingestion_method: r.ingestion_method || 'uploaded'
            };
          });
        }, 8000, 30000);

        return jsonResponse(enriched, 200, 8);
      }

      // 6. GET /api/recgpt-playbook
      if (method === 'GET' && pathname === '/api/recgpt-playbook') {
        const seedPinId = searchParams.get('seed_pin_id');
        const cacheKey = buildCanonicalCacheKey('api:recgpt-playbook', {
          seed_pin_id: seedPinId || 'all',
          shard: reqProjectId || 'hub'
        });

        const playbookData = await getCachedOrFetch(cacheKey, async () => {
          let dinnerAnchor = null;
          let navboostSide = null;
          let sessionFinisher = null;

          let isBakerySeed = false;
          if (seedPinId) {
            const sInfo = await targetSql`SELECT label FROM cluster_seeds WHERE pin_id = ${seedPinId} LIMIT 1;`;
            if (sInfo.length > 0) {
              isBakerySeed = /\b(muffin|muffins|cake|cakes|cookie|cookies|brownie|brownies|roll|rolls|cinnamon|pie|pies|tart|bread|cupcake|cupcakes|donut|donuts|pastry|pastries|bake|baking|dessert|sweet|chocolate|caramel|pumpkin spice)\b/i.test(sInfo[0].label || '');
            }

            if (isBakerySeed) {
              const dRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('DESSERT_HERO', 'DINNER_ANCHOR')
                ORDER BY (sequence_role = 'DESSERT_HERO') DESC, saves DESC LIMIT 1;
              `;
              if (dRows.length > 0) dinnerAnchor = dRows[0];

              const nRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('BEVERAGE_PAIRING', 'NAVBOOST_CO_VISITOR')
                  AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
                ORDER BY (sequence_role = 'BEVERAGE_PAIRING') DESC, saves DESC LIMIT 1;
              `;
              if (nRows.length > 0) navboostSide = nRows[0];

              const sRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role IN ('PASTRY_BITES', 'SESSION_FINISHER')
                  AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
                  AND candidate_pin_id != ${navboostSide?.candidate_pin_id || ''}
                ORDER BY (sequence_role = 'PASTRY_BITES') DESC, saves DESC LIMIT 1;
              `;
              if (sRows.length > 0) sessionFinisher = sRows[0];
            } else {
              const dRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'DINNER_ANCHOR'
                ORDER BY saves DESC LIMIT 1;
              `;
              if (dRows.length > 0) dinnerAnchor = dRows[0];

              const nRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'NAVBOOST_CO_VISITOR'
                ORDER BY saves DESC LIMIT 1;
              `;
              if (nRows.length > 0) navboostSide = nRows[0];

              const sRows = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND sequence_role = 'SESSION_FINISHER'
                ORDER BY saves DESC LIMIT 1;
              `;
              if (sRows.length > 0) sessionFinisher = sRows[0];
            }

            // Seed-scoped fallbacks: never cross into another seed
            if (!dinnerAnchor) {
              const f = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId}
                ORDER BY saves DESC LIMIT 1;
              `;
              dinnerAnchor = f[0] || null;
            }
            if (!navboostSide) {
              const f = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId} AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
                ORDER BY saves DESC LIMIT 1;
              `;
              navboostSide = f[0] || null;
            }
            if (!sessionFinisher) {
              const f = await targetSql`
                SELECT * FROM candidate_graph_nodes
                WHERE seed_pin_id = ${seedPinId}
                  AND candidate_pin_id != ${dinnerAnchor?.candidate_pin_id || ''}
                  AND candidate_pin_id != ${navboostSide?.candidate_pin_id || ''}
                ORDER BY saves DESC LIMIT 1;
              `;
              sessionFinisher = f[0] || null;
            }
          } else {
            // Global explorer fallbacks only when no specific seed is requested
            if (!dinnerAnchor) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'DINNER_ANCHOR' ORDER BY saves DESC LIMIT 1;`;
              dinnerAnchor = f[0] || null;
            }
            if (!navboostSide) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'NAVBOOST_CO_VISITOR' ORDER BY saves DESC LIMIT 1;`;
              navboostSide = f[0] || null;
            }
            if (!sessionFinisher) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes WHERE sequence_role = 'SESSION_FINISHER' ORDER BY saves DESC LIMIT 1;`;
              sessionFinisher = f[0] || null;
            }

            if (!dinnerAnchor) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC LIMIT 1;`;
              dinnerAnchor = f[0] || null;
            }
            if (!navboostSide) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 1 LIMIT 1;`;
              navboostSide = f[0] || null;
            }
            if (!sessionFinisher) {
              const f = await targetSql`SELECT * FROM candidate_graph_nodes ORDER BY saves DESC OFFSET 2 LIMIT 1;`;
              sessionFinisher = f[0] || null;
            }
          }

          const formatCard = (node, defaultTitle, defaultRole, defaultPrep) => {
            if (!node) {
              return {
                title: defaultTitle,
                candidate_pin_id: '',
                saves: 0,
                save_rate: 0,
                daily_velocity: 0,
                recgpt_transition_score: 0,
                prep_time: defaultPrep,
                sequence_role: defaultRole,
                winning_color: '#888888',
                culinary_color_name: 'Pending Crawl Data',
                provenance_engine: 'P2P_RECGPT',
                is_pending_data: true
              };
            }
            return {
              title: node.title,
              candidate_pin_id: node.candidate_pin_id,
              saves: Number(node.saves || 0),
              save_rate: Number(node.save_rate || 0),
              daily_velocity: Number(node.daily_velocity || 0),
              recgpt_transition_score: Number(node.recgpt_transition_score || (Number(node.save_rate || 0) * 0.95).toFixed(1)),
              prep_time: defaultPrep,
              sequence_role: node.sequence_role || defaultRole,
              winning_color: node.dominant_color || '#888888',
              culinary_color_name: getCulinaryColorName(node.dominant_color),
              provenance_engine: node.provenance_engine || 'P2P_RECGPT',
              ocr_text: node.ocr_text || '',
              image_url: node.image_url || '',
              is_video: Boolean(node.is_video),
              ingestion_method: node.ingestion_method || 'uploaded'
            };
          };

          return {
            seed_pin_id: seedPinId,
            dinner_anchor: formatCard(dinnerAnchor, 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes', 'DINNER_ANCHOR', '15m'),
            navboost_co_visitor: formatCard(navboostSide, 'Cast Iron Skillet Garlic Cheddar Honey Biscuits', 'NAVBOOST_CO_VISITOR', '20m'),
            session_finisher: formatCard(sessionFinisher, 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream', 'SESSION_FINISHER', '10m')
          };
        }, 20000, 60000);

        return jsonResponse(playbookData, 200, 20);
      }

      // 7. GET /api/cluster-telemetry
      if (method === 'GET' && pathname === '/api/cluster-telemetry') {
        const seedPinIdParam = searchParams.get('seed_pin_id') || '';
        const cacheKey = buildCanonicalCacheKey('api:cluster-telemetry', {
          seed_pin_id: seedPinIdParam,
          shard: reqProjectId || 'hub'
        });

        const telemetryData = await getCachedOrFetch(cacheKey, async () => {
          let seedPinId = seedPinIdParam;
          if (!seedPinId) {
            const latestSeed = await targetSql`
              SELECT pin_id FROM cluster_seeds
              WHERE last_crawled_at IS NOT NULL
              ORDER BY last_crawled_at DESC
              LIMIT 1;
            `;
            if (latestSeed.length > 0) {
              seedPinId = latestSeed[0].pin_id;
            }
          }

          if (!seedPinId) {
            return {
              recgpt_count: 0,
              navboost_count: 0,
              randomwalk_count: 0,
              two_tower_count: 0,
              fresh_candidate_count: 0,
              product_count: 0,
              total_engine_quota: 0,
              color_centroids: [],
              high_save_tokens: []
            };
          }

          const metricsRows = await targetSql`
            SELECT *
            FROM cluster_arbitrage_metrics
            WHERE seed_pin_id = ${seedPinId}
            ORDER BY analyzed_at DESC
            LIMIT 1;
          `;

          const m = metricsRows[0] || {};
          const recgpt = Number(m.recgpt_count || 0);
          const navboost = Number(m.navboost_count || 0);
          const randomwalk = Number(m.randomwalk_count || 0);
          const twoTower = Number(m.two_tower_count || 0);
          const fresh = Number(m.fresh_candidate_count || 0);
          const productCount = Number(m.product_count || 0);

          const totalEngineQuota = recgpt + navboost + randomwalk + twoTower + fresh || 1;
          const calcPct = (val) => Number(((val / totalEngineQuota) * 100).toFixed(1));

          const countRows = await targetSql`
            SELECT COUNT(*) AS count
            FROM candidate_graph_nodes
            WHERE seed_pin_id = ${seedPinId};
          `;
          const extractedCount = Number(countRows[0]?.count || 0);

          return {
            seed_pin_id: seedPinId,
            recgpt_count: recgpt,
            recgpt_pct: calcPct(recgpt),
            navboost_count: navboost,
            navboost_pct: calcPct(navboost),
            randomwalk_count: randomwalk,
            randomwalk_pct: calcPct(randomwalk),
            two_tower_count: twoTower,
            two_tower_pct: calcPct(twoTower),
            fresh_candidate_count: fresh,
            fresh_pct: calcPct(fresh),
            fresh_candidate_pct: calcPct(fresh),
            product_count: productCount,
            product_pct: calcPct(productCount),
            total_engine_quota: (totalEngineQuota > 1 ? totalEngineQuota : 0),
            extracted_count: extractedCount,
            commercial_gap_ratio: Number(m.commercial_gap_ratio || 0),
            color_centroids: m.winning_color_centroids || [],
            high_save_tokens: m.high_save_tokens || [],
            utility_snapshot: m.utility_snapshot || null,
            analyzed_at: m.analyzed_at || null
          };
        }, 20000, 60000);

        return jsonResponse(telemetryData, 200, 20);
      }

      // 8. GET /api/guided-search
      if (method === 'GET' && pathname === '/api/guided-search') {
        const seedPinId = searchParams.get('seed_pin_id');
        const cacheKey = buildCanonicalCacheKey('api:guided-search', {
          seed_pin_id: seedPinId || 'all',
          shard: reqProjectId || 'hub'
        });

        const rows = await getCachedOrFetch(cacheKey, async () => {
          if (seedPinId && seedPinId !== 'all') {
            return await targetSql`
              SELECT g.*, s.label AS seed_label
              FROM seed_guided_search_capsules g
              LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
              WHERE g.seed_pin_id = ${seedPinId}
              ORDER BY g.discovered_at DESC;
            `;
          } else {
            return await targetSql`
              SELECT g.*, s.label AS seed_label
              FROM seed_guided_search_capsules g
              LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
              ORDER BY g.discovered_at DESC;
            `;
          }
        }, 20000, 60000);

        return jsonResponse(rows, 200, 20);
      }

      // 9. GET /api/intersections (Uncapped, authentic Pixie Multi-Hit ranking)
      if (method === 'GET' && pathname === '/api/intersections') {
        const shardKey = reqProjectId || 'hub';
        const minOverlap = Number(searchParams.get('min_overlap')) || 2;
        const limit = clampLimit(searchParams.get('limit'), 1000, 1000);

        const cacheKey = buildCanonicalCacheKey(`intersections:${shardKey}`, {
          min_overlap: minOverlap,
          limit
        });

        try {
          const enrichedRows = await getCachedOrFetch(cacheKey, async () => {
            const allSeeds = await targetSql`SELECT pin_id, label, is_competitor FROM cluster_seeds;`.catch(() => []);
            const seedMap = new Map();
            for (const s of allSeeds) seedMap.set(s.pin_id, s);

            const rows = await targetSql`
              SELECT 
                  c.candidate_pin_id,
                  MAX(c.title) AS title,
                  MAX(c.domain) AS domain,
                  BOOL_OR(c.is_product) AS is_product,
                  MAX(c.dominant_color) AS winning_color,
                  MAX(c.ocr_text) AS ocr_text,
                  MAX(c.aspect_ratio) AS aspect_ratio,
                  MAX(c.daily_velocity) AS daily_velocity,
                  MAX(c.pin_created_at) AS pin_created_at,
                  MAX(c.sequence_role) AS sequence_role,
                  MAX(c.provenance_engine) AS provenance_engine,
                  MAX(c.repins) AS total_repins,
                  MAX(c.image_url) AS image_url,
                  BOOL_OR(c.is_video) AS is_video,
                  MAX(c.ingestion_method) AS ingestion_method,
                  ROUND(AVG(c.save_rate)::numeric, 2) AS avg_save_rate,
                  COUNT(DISTINCT c.seed_pin_id) AS seed_overlap_count,
                  ROUND(POWER(SUM(SQRT(GREATEST(c.saves, 1))), 2)::numeric, 2) AS pixie_multihit_score,
                  MAX(c.saves) AS total_saves,
                  ARRAY_AGG(DISTINCT c.seed_pin_id) AS originating_seeds
              FROM candidate_graph_nodes c
              GROUP BY c.candidate_pin_id
              HAVING COUNT(DISTINCT c.seed_pin_id) >= ${minOverlap}
              ORDER BY pixie_multihit_score DESC
              LIMIT ${limit};
            `.catch(() => []);

            const totalSeedsCount = Math.max((allSeeds || []).length, 1);
            const computedCouplings = (rows || []).map((r) => {
              const overlap = Number(r.seed_overlap_count || 1);
              const saves = Number(r.total_saves || 0);
              const multihitWeight = Math.sqrt(Math.max(saves, 1)) * overlap;
              const nodeStrength = Math.max(saves, 1);
              return multihitWeight / Math.sqrt(totalSeedsCount * nodeStrength);
            });
            const meanRho = computedCouplings.reduce((acc, v) => acc + v, 0) / Math.max(computedCouplings.length, 1);

            return (rows || []).map((r, idx) => {
              const saves = Number(r.total_saves || 0);
              const engine = r.provenance_engine || 'P2P_TWO_TOWER';
              const couplingRho = Number((computedCouplings[idx] || 0).toFixed(4));
              const passesRelativeThreshold = couplingRho >= (0.5 * meanRho);

              const ar = Number(r.aspect_ratio || 0.56);
              let format = 'ORGANIC PIN';
              if (r.is_product) format = 'PRODUCT CARD';
              else if (r.is_video) format = 'VIDEO PIN';
              else if (ar > 1.3) format = 'IDEA PIN';

              const seedDetails = (r.originating_seeds || []).map((sid) => {
                const found = seedMap.get(sid);
                return {
                  pin_id: sid,
                  label: found ? found.label : `Seed ${sid}`,
                  is_competitor: found ? found.is_competitor : false
                };
              });

              return {
                ...r,
                engine_source: engine,
                coupling_rho: couplingRho,
                coupling_drift: !passesRelativeThreshold,
                format_type: format,
                culinary_color_name: getCulinaryColorName(r.winning_color),
                is_vacuum_target: !r.is_product && saves >= 5000,
                originating_seed_details: seedDetails,
                image_url: r.image_url || '',
                is_video: Boolean(r.is_video),
                ingestion_method: r.ingestion_method || 'uploaded'
              };
            });
          }, 8000, 30000);

          return jsonResponse(Array.isArray(enrichedRows) ? enrichedRows : [], 200, 8);
        } catch (err) {
          console.error('[Intersections Error]', err.message);
          return jsonResponse([], 200);
        }
      }

      // 10. POST /api/crawl (Instruct user or trigger)
      if (method === 'POST' && pathname === '/api/crawl') {
        return jsonResponse({
          status: 'info',
          message: 'Background crawls are executed serverlessly via GitHub Actions. Please trigger the GitHub Actions workflow cluster-intelligence.yml or run locally with npm run crawl.',
          action_url: 'https://github.com/sayfedin-star/pin-arbitrage-engine/actions'
        });
      }

      // 11. GET /api/crawl-status
      if (method === 'GET' && pathname === '/api/crawl-status') {
        return jsonResponse({
          is_crawling: false,
          mode: 'github_actions_pipeline',
          message: 'Managed in GitHub Actions'
        });
      }

      // 12. GET /api/settings/cookie [CAP-05]
      if (method === 'GET' && pathname === '/api/settings/cookie') {
        const cookie = env.PINTEREST_COOKIE || '';
        return jsonResponse({
          has_cookie: Boolean(cookie && cookie.trim().length > 10),
          is_configured: Boolean(cookie && cookie.trim().length > 10),
          source: 'cloudflare_env'
        });
      }

      // 13. POST /api/settings/cookie [CAP-05]
      if (method === 'POST' && pathname === '/api/settings/cookie') {
        const body = await request.json().catch(() => ({}));
        const cookie = String(body.cookie || '').trim();
        return jsonResponse({
          success: true,
          has_cookie: Boolean(cookie && cookie.length > 10),
          is_configured: Boolean(cookie && cookie.length > 10),
          note: 'For edge worker execution, add PINTEREST_COOKIE in Cloudflare Worker Secrets.'
        });
      }

      // 14. POST /api/seeds/import-raw-json
      if (method === 'POST' && pathname === '/api/seeds/import-raw-json') {
        const body = await request.json().catch(() => ({}));
        const seedPinId = String(body.seed_pin_id || '').trim();
        let rawJson = body.raw_json;

        if (!seedPinId) {
          return jsonResponse({ error: 'seed_pin_id is required' }, 400);
        }

        let parsedBlocks = [];
        if (typeof rawJson === 'string') {
          try {
            parsedBlocks = [JSON.parse(rawJson)];
          } catch (err) {
            return jsonResponse({ error: 'Invalid JSON payload: ' + err.message }, 400);
          }
        } else if (Array.isArray(rawJson)) {
          parsedBlocks = rawJson;
        } else if (rawJson && typeof rawJson === 'object') {
          parsedBlocks = [rawJson];
        }

        const items = [];
        for (const block of parsedBlocks) {
          const resp = block?.resource_response || block;
          if (Array.isArray(resp?.data)) {
            items.push(...resp.data);
          } else if (Array.isArray(resp)) {
            items.push(...resp);
          }
        }

        if (items.length === 0) {
          return jsonResponse({ error: 'No data items found in JSON (expected resource_response.data array)' }, 400);
        }

        let authoritativeCounts = null;
        let utilityWeights = null;
        for (const item of items) {
          if (!authoritativeCounts && item?.aux_fields?.candidate_counts) {
            try {
              const rawCounts = typeof item.aux_fields.candidate_counts === 'string'
                ? JSON.parse(item.aux_fields.candidate_counts)
                : item.aux_fields.candidate_counts;
              authoritativeCounts = {
                navboost: Number(rawCounts["P2P_NAVBOOST_CAND"] || 0),
                recgpt: Number(rawCounts["P2P_RECGPT"] || 0),
                randomwalk: Number(rawCounts["P2P_RANDOMWALK_CAND"] || 0),
                two_tower: Number(rawCounts["P2P_TWO_TOWER_EMBEDDING_CAND"] || 0),
                fresh: Number(rawCounts["P2P_TWO_TOWER_MID_FUNNEL_FRESH_EMBEDDING_CAND"] || 0)
              };
            } catch (e) {}
          }
          if (!utilityWeights && item?.aux_fields?.utility_config?.weights) {
            utilityWeights = item.aux_fields.utility_config.weights;
          }
        }

        const capturedCapsules = [];
        const inspectAndCapture = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          const hasExplore = (
            obj.type === 'explorearticle' ||
            obj.story_type === 'BUBBLE_ONE_COL' ||
            obj.story_type === 'explore_article' ||
            obj.story_type === 'guide' ||
            Boolean(obj.cover_images && (obj.title?.format || obj.title)) ||
            Boolean(obj.cover_image && (obj.title?.format || obj.title)) ||
            Boolean(obj.node_id && String(obj.node_id).startsWith('RXhwbG9yZ'))
          );
          if (hasExplore) {
            const titleVal = obj.title?.format || obj.title?.text || obj.title?.title || obj.title || obj.copy?.title || obj.query || obj.label;
            const qTerm = typeof titleVal === 'string' ? titleVal.trim() : (titleVal?.format || '');
            if (qTerm && !['more to explore', 'related pins', 'ideas', 'explore'].includes(qTerm.toLowerCase())) {
              const imgUrl = (
                obj.cover_images?.[0]?.['750x']?.url ||
                obj.cover_images?.[0]?.url ||
                obj.cover_image?.['750x']?.url ||
                obj.cover_image?.url ||
                obj.images?.['750x']?.url ||
                obj.images?.['474x']?.url ||
                obj.images?.orig?.url ||
                obj.image_large_url ||
                ''
              );
              const searchUrl = obj.link || obj.action_link || obj.url || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(qTerm)}`;
              capturedCapsules.push({
                seed_pin_id: seedPinId,
                query_term: qTerm,
                normalized_query: qTerm.toLowerCase().trim(),
                image_url: imgUrl,
                search_url: searchUrl,
                node_id: String(obj.node_id || obj.id || '')
              });
            }
          }
          if (Array.isArray(obj.objects)) for (const s of obj.objects) inspectAndCapture(s);
          if (Array.isArray(obj.items)) for (const s of obj.items) inspectAndCapture(s);
          if (Array.isArray(obj.bubbles)) for (const s of obj.bubbles) inspectAndCapture(s);
          if (Array.isArray(obj.expanded_viewport_objects)) for (const s of obj.expanded_viewport_objects) inspectAndCapture(s);
        };

        for (const item of items) inspectAndCapture(item);

        if (capturedCapsules.length > 0) {
          const dedupCapMap = new Map();
          for (const cap of capturedCapsules) {
            if (cap?.normalized_query) dedupCapMap.set(`${cap.seed_pin_id}_${cap.normalized_query}`, cap);
          }
          const uniqueCaps = Array.from(dedupCapMap.values());
          await targetSql`
            INSERT INTO seed_guided_search_capsules (
              seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
            )
            SELECT
              u.seed_pin_id, u.query_term, u.normalized_query, u.image_url, u.search_url, u.node_id, NOW()
            FROM jsonb_to_recordset(${JSON.stringify(uniqueCaps)}::jsonb) AS u(
              seed_pin_id text,
              query_term text,
              normalized_query text,
              image_url text,
              search_url text,
              node_id text
            )
            ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE SET
              image_url = EXCLUDED.image_url,
              search_url = EXCLUDED.search_url,
              node_id = EXCLUDED.node_id;
          `;
        }

        const rawCandidates = [];
        for (const item of items) {
          const list = [];
          if (item.type === 'pin' || item.images || item.story_pin_data) list.push(item);
          if (Array.isArray(item.pins)) list.push(...item.pins);
          if (Array.isArray(item.objects)) list.push(...item.objects.filter(o => o.type === 'pin' || o.images));

          for (const p of list) {
            const candidatePinId = String(p.id || p.pin_id || '').trim();
            if (!candidatePinId || candidatePinId === seedPinId || candidatePinId.startsWith('-') || !/^\d+$/.test(candidatePinId)) continue;

            const title = (p.title || p.grid_title || p.auto_alt_text || p.description || '').slice(0, 255).trim() || `Pin ${candidatePinId}`;
            const domain = p.domain || p.link_domain?.id || 'Uploaded by user';
            const dominantColor = (p.dominant_color && typeof p.dominant_color === 'string') ? p.dominant_color : '#888888';
            const saves = Number(p.aggregated_pin_data?.aggregated_stats?.saves ?? (p.repin_count || 0));
            const repins = Number(p.repin_count || 0);
            const saveRate = saves > 0 ? Number(((repins / saves) * 100).toFixed(2)) : 0;
            const isProduct = Boolean(p.is_eligible_for_pdp || (p.price_value && Number(p.price_value) > 0) || p.product_metadata || (Array.isArray(p.shopping_flags) && p.shopping_flags.length > 0));
            const ocrText = p.auto_alt_text || '';
            const imageUrl = p.images?.['236x']?.url || p.images?.['474x']?.url || p.images?.orig?.url || p.image_large_url || '';
            const isVideo = Boolean(p.is_video || p.videos != null);
            const ingestionMethod = p.method || 'RAW_PAYLOAD_DIRECT_IMPORT';

            let pinCreatedAt = p.created_at ? new Date(p.created_at).toISOString() : new Date(Date.now() - 180 * 86400000).toISOString();
            const ageDays = Math.max(1, Math.floor((Date.now() - new Date(pinCreatedAt).getTime()) / 86400000));
            const dailyVelocity = Number((saves / ageDays).toFixed(2));
            const provenanceEngine = saves >= 30000 ? 'P2P_NAVBOOST' : (saves >= 8000 ? 'P2P_RANDOMWALK' : 'P2P_TWO_TOWER');

            rawCandidates.push({
              seed_pin_id: seedPinId,
              candidate_pin_id: candidatePinId,
              title,
              dominant_color: dominantColor,
              aspect_ratio: 0.56,
              saves,
              repins,
              save_rate: saveRate,
              domain,
              is_product: isProduct,
              ocr_text: ocrText,
              pin_created_at: pinCreatedAt,
              age_days: ageDays,
              daily_velocity: dailyVelocity,
              provenance_engine: provenanceEngine,
              individual_prod_score: isProduct ? 203.29 : -17.58,
              recgpt_transition_score: Number((saveRate * 0.9).toFixed(1)),
              sequence_role: 'DIRECT_MATCH',
              is_recgpt_candidate: false,
              visual_entropy_score: 0.5,
              image_url: imageUrl,
              is_video: isVideo,
              ingestion_method: ingestionMethod
            });
          }
        }

        if (rawCandidates.length > 0) {
          const dedupCandMap = new Map();
          for (const node of rawCandidates) {
            if (node?.candidate_pin_id) dedupCandMap.set(`${node.seed_pin_id}_${node.candidate_pin_id}`, node);
          }
          const uniqueCandidates = Array.from(dedupCandMap.values());
          const candChunkSize = 250;
          for (let i = 0; i < uniqueCandidates.length; i += candChunkSize) {
            const chunk = uniqueCandidates.slice(i, i + candChunkSize);
            await targetSql`
              INSERT INTO candidate_graph_nodes (
                seed_pin_id, candidate_pin_id, title,
                dominant_color, aspect_ratio, saves,
                repins, save_rate, domain,
                is_product, ocr_text, extracted_at,
                pin_created_at, age_days, daily_velocity,
                provenance_engine, individual_prod_score,
                recgpt_transition_score, sequence_role,
                is_recgpt_candidate, visual_entropy_score,
                image_url, is_video, ingestion_method
              )
              SELECT
                u.seed_pin_id, u.candidate_pin_id, u.title,
                u.dominant_color, u.aspect_ratio, u.saves,
                u.repins, u.save_rate, u.domain,
                u.is_product, u.ocr_text, NOW(),
                u.pin_created_at::timestamptz, u.age_days, u.daily_velocity,
                u.provenance_engine, u.individual_prod_score,
                u.recgpt_transition_score, u.sequence_role,
                u.is_recgpt_candidate, u.visual_entropy_score,
                u.image_url, u.is_video, u.ingestion_method
              FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS u(
                seed_pin_id text, candidate_pin_id text, title text,
                dominant_color text, aspect_ratio text, saves int,
                repins int, save_rate numeric, domain text,
                is_product boolean, ocr_text text,
                pin_created_at text, age_days int, daily_velocity numeric,
                provenance_engine text, individual_prod_score numeric,
                recgpt_transition_score numeric, sequence_role text,
                is_recgpt_candidate boolean, visual_entropy_score numeric,
                image_url text, is_video boolean, ingestion_method text
              )
              ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
                title = EXCLUDED.title,
                dominant_color = EXCLUDED.dominant_color,
                aspect_ratio = EXCLUDED.aspect_ratio,
                saves = GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves),
                repins = GREATEST(candidate_graph_nodes.repins, EXCLUDED.repins),
                save_rate = EXCLUDED.save_rate,
                domain = EXCLUDED.domain,
                is_product = EXCLUDED.is_product,
                ocr_text = COALESCE(NULLIF(EXCLUDED.ocr_text, ''), candidate_graph_nodes.ocr_text),
                extracted_at = NOW(),
                pin_created_at = COALESCE(EXCLUDED.pin_created_at, candidate_graph_nodes.pin_created_at),
                age_days = EXCLUDED.age_days,
                daily_velocity = GREATEST(candidate_graph_nodes.daily_velocity, EXCLUDED.daily_velocity),
                provenance_engine = EXCLUDED.provenance_engine,
                individual_prod_score = EXCLUDED.individual_prod_score,
                recgpt_transition_score = EXCLUDED.recgpt_transition_score,
                image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), candidate_graph_nodes.image_url),
                is_video = EXCLUDED.is_video,
                ingestion_method = EXCLUDED.ingestion_method;
            `;
          }
        }

        if (authoritativeCounts) {
          const existingMetrics = await targetSql`
            SELECT id FROM cluster_arbitrage_metrics
            WHERE seed_pin_id = ${seedPinId}
            ORDER BY analyzed_at DESC
            LIMIT 1;
          `;

          if (existingMetrics.length > 0) {
            await targetSql`
              UPDATE cluster_arbitrage_metrics
              SET
                recgpt_count = ${authoritativeCounts.recgpt},
                navboost_count = ${authoritativeCounts.navboost},
                randomwalk_count = ${authoritativeCounts.randomwalk},
                two_tower_count = ${authoritativeCounts.two_tower},
                fresh_candidate_count = ${authoritativeCounts.fresh},
                analyzed_at = NOW()
              WHERE id = ${existingMetrics[0].id};
            `;
          }
        }

        invalidateEdgeCache('api:recgpt-playbook');
        invalidateEdgeCache('api:cluster-telemetry');
        invalidateEdgeCache('api:guided-search');
        return jsonResponse({
          success: true,
          candidates_imported: rawCandidates.length,
          capsules_imported: capturedCapsules.length,
          authoritative_counts: authoritativeCounts
        });
      }

      // 15. Competitor Intelligence API
      if (method === 'GET' && pathname === '/api/competitors') {
        const shardKey = reqProjectId || 'hub';
        const account_type = searchParams.get('account_type') || 'all';
        const search = searchParams.get('search') || '';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

        const cacheKey = buildCanonicalCacheKey(`competitors:${shardKey}`, {
          account_type,
          search,
          limit,
          offset
        });

        try {
          const data = await getCachedOrFetch(cacheKey, async () => {
            const overview = await getCompetitorsOverview(targetSql);
            const competitors = await listCompetitors(targetSql, {
              account_type,
              search,
              limit,
              offset
            });
            const isDegraded = Boolean(overview?._degraded || competitors?._degraded);
            return { overview, competitors, ...(isDegraded ? { degraded: true } : {}) };
          }, 8000, 30000);

          const isDegraded = Boolean(data?.degraded || data?.overview?._degraded || data?.competitors?._degraded);
          return jsonResponse({ success: true, ...data }, 200, isDegraded ? 0 : 8);
        } catch (err) {
          console.error('[Competitors Error]', err.message);
          return jsonResponse({
            success: true,
            degraded: true,
            overview: { tracked_profiles: 0, competitor_count: 0, own_count: 0, combined_reach: 0, total_audience: 0, pins_tracked: 0, top_competitor: null },
            competitors: []
          }, 200, 0);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors') {
        invalidateEdgeCache('competitors');
        const body = await request.json().catch(() => ({}));
        const row = await trackCompetitor(targetSql, body);
        if (row?.username) {
          safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, row.username), 'syncCompetitorAcrossFleet');
        }
        return jsonResponse({ success: true, competitor: row });
      }

      if (method === 'POST' && pathname === '/api/competitors/sync') {
        invalidateEdgeCache('competitors');
        const body = await request.json().catch(() => ({}));
        const username = body.username;
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        try {
          const updated = await syncCompetitorProfile(targetSql, username, cookie);
          if (updated?.username) {
            safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, updated.username), 'syncCompetitorAcrossFleet');
          }
          return jsonResponse({ success: true, profile: updated });
        } catch (err) {
          if (err.message && (err.message.includes('429') || err.message.includes('rate limit'))) {
            safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, 'HTTP 429 Rate Limit in /api/competitors/sync', 900), 'tripPinterestCircuitBreaker');
            return jsonResponse({ error: 'PINTEREST_RATE_LIMITED', message: err.message }, 429);
          } else if (err.message && (err.message.includes('403') || err.message.includes('access denied'))) {
            safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, 'HTTP 403 Forbidden in /api/competitors/sync', 900), 'tripPinterestCircuitBreaker');
            return jsonResponse({ error: 'PINTEREST_ACCESS_DENIED', message: err.message }, 403);
          }
          throw err;
        }
      }

      if (method === 'DELETE' && pathname === '/api/competitors') {
        invalidateEdgeCache('competitors');
        let id = searchParams.get('id');
        let username = searchParams.get('username');
        if (!id && !username) {
          try {
            const body = await request.json();
            id = body.id || body.competitor_id;
            username = body.username;
          } catch (_) {}
        }
        if (username) {
          const cleanUser = String(username).replace(/^@/, '').trim().toLowerCase();
          await targetSql`DELETE FROM competitor_profiles WHERE LOWER(username) = ${cleanUser};`;
          return jsonResponse({ success: true, deleted_username: cleanUser });
        } else if (id && !isNaN(Number(id))) {
          await targetSql`DELETE FROM competitor_profiles WHERE id = ${Number(id)};`;
          return jsonResponse({ success: true, deleted_id: Number(id) });
        }
        return jsonResponse({ error: 'id or username is required to delete competitor' }, 400);
      }

      if (method === 'GET' && pathname === '/api/competitors/boards') {
        const username = searchParams.get('username') || searchParams.get('account');
        const competitorId = searchParams.get('competitor_id') || searchParams.get('id');
        const idOrUser = username || competitorId;
        if (!idOrUser) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
        const shardKey = reqProjectId || 'hub';
        const cacheKey = buildCanonicalCacheKey(`competitors:boards:${shardKey}`, { idOrUser, username: username || '' });
        const boardsData = await getCachedOrFetch(cacheKey, async () => {
          const boards = await getCompetitorBoards(targetSql, idOrUser, { username });
          return { success: true, boards };
        }, 30000, 60000);
        return jsonResponse(boardsData, 200, 30);
      }

      if (method === 'POST' && pathname === '/api/competitors/sync-boards') {
        invalidateEdgeCache('competitors');
        try {
          const body = await request.json().catch(() => ({}));
          const { competitor_id, username } = body;
          if (!competitor_id && !username) return jsonResponse({ error: 'competitor_id or username is required' }, 400);
          const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
          const result = await syncCompetitorBoards(targetSql, competitor_id, username, cookie);
          if (result?.ok && (username || competitor_id)) {
            syncCompetitorAcrossFleet(sql, username || competitor_id).catch(() => {});
          }
          if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/sync-pins') {
        invalidateEdgeCache('competitors');
        const body = await request.json().catch(() => ({}));
        const { competitor_id, username, mode, max_pages } = body;
        if (!username && !competitor_id) return jsonResponse({ error: 'username or competitor_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const result = await syncCompetitorPins(targetSql, competitor_id, username, { mode, maxPages: max_pages, cookie });
        if (!result.ok) return jsonResponse({ success: false, ...result }, 400);
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'GET' && pathname === '/api/competitors/detail') {
        const username = searchParams.get('username') || searchParams.get('account');
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        const idOrUser = username || id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        try {
          const shardKey = reqProjectId || 'hub';
          const cacheKey = buildCanonicalCacheKey(`competitors:detail:${shardKey}`, { idOrUser, username: username || '' });
          const detailData = await getCachedOrFetch(cacheKey, async () => {
            const detail = await getCompetitorDetail(targetSql, idOrUser, { username });
            return { success: true, ...detail };
          }, 20000, 60000);
          return jsonResponse(detailData, 200, 20);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/board-detail') {
        const username = searchParams.get('username') || searchParams.get('account') || searchParams.get('id');
        const board = searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug');
        if (!username || !board) return jsonResponse({ error: 'username and board are required' }, 400);
        try {
          const forceRefresh = searchParams.get('refresh') === 'true';
          const boardData = await getOrSyncBoardDetail(targetSql, username, board, { forceRefresh });
          return jsonResponse({ success: true, board: boardData }, 200, forceRefresh ? 0 : 60);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/all-pins') {
        const username = searchParams.get('username') || searchParams.get('account');
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        const idOrUser = username || id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        try {
          const shardKey = reqProjectId || 'hub';
          const cacheParams = {
            idOrUser,
            username: username || '',
            search: searchParams.get('search') || '',
            board: searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug') || '',
            min_saves: Number(searchParams.get('min_saves') || 0),
            sort: searchParams.get('sort') || 'saves_desc',
            page: Number(searchParams.get('page') || 1),
            limit: clampLimit(searchParams.get('limit'), 50, 1000),
            qualified_only: searchParams.get('qualified_only') === 'true',
            product_only: searchParams.get('product_only') === 'true',
            articles_only: searchParams.get('articles_only') === 'true'
          };
          const cacheKey = buildCanonicalCacheKey(`competitors:all-pins:${shardKey}`, cacheParams);
          const allPinsData = await getCachedOrFetch(cacheKey, async () => {
            const data = await listCompetitorAccountPins(targetSql, idOrUser, cacheParams);
            return { success: true, ...data };
          }, 20000, 60000);
          return jsonResponse(allPinsData, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/top-urls') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const shardKey = reqProjectId || 'hub';
          const cacheParams = {
            id,
            limit: clampLimit(searchParams.get('limit'), 50, 1000),
            page: Number(searchParams.get('page') || 1),
            search: searchParams.get('search') || '',
            sort: searchParams.get('sort') || 'saves_desc',
            filter_type: searchParams.get('filter_type') || 'all'
          };
          const cacheKey = buildCanonicalCacheKey(`competitors:top-urls:${shardKey}`, cacheParams);
          const topUrlsData = await getCachedOrFetch(cacheKey, async () => {
            const result = await getTopDestinationUrls(targetSql, id, cacheParams);
            return { success: true, ...result };
          }, 20000, 60000);
          return jsonResponse(topUrlsData, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/rules') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorRules(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/rules') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await saveCompetitorRules(targetSql, id, body.rules || body);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/re-evaluate') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await reEvaluateCompetitorPins(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/dispatch-crawl') {
        const body = await request.json().catch(() => ({}));
        const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_account: username,
              target_boards: String(body.target_boards || body.boards || '').trim(),
              crawl_mode: body.crawl_mode || 'sharded_boards',
              max_pages: String(body.max_pages || '1000'),
              personal_boards_only: String(body.personal_boards_only !== false)
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            target_account: username,
            target_boards: body.target_boards || '',
            crawl_mode: body.crawl_mode || 'discovery',
            message: `Two-Stage Pipeline (Discovery + 20-Shard Parallel Matrix) dispatched successfully on GitHub Actions for @${username}!${body.target_boards ? ` (Target Boards: ${body.target_boards})` : ''}`
          });
        } else {
          const errText = await res.text();
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
        }
      }

      // Account-Scoped Related Pins & Graph Intersections Radar
      if (method === 'GET' && pathname === '/api/competitors/related-pins/seeds') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorSeeds(targetSql, id);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/seeds') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await addCompetitorSeeds(targetSql, id, body.pin_ids || body.pins || []);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'DELETE' && pathname === '/api/competitors/related-pins/seeds') {
        let id = searchParams.get('competitor_id') || searchParams.get('id');
        let pinId = searchParams.get('pin_id') || searchParams.get('pin_ids');
        if (!id || !pinId) {
          const body = await request.json().catch(() => ({}));
          id = id || body.competitor_id || body.id;
          pinId = pinId || body.pin_id || body.pin_ids;
        }
        if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
        try {
          const result = await deleteCompetitorSeed(targetSql, id, pinId);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/related-pins/intersections') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getCompetitorRelatedIntersections(targetSql, id, {
            min_overlap: Number(searchParams.get('min_overlap') || 2),
            page: Number(searchParams.get('page') || 1),
            limit: clampLimit(searchParams.get('limit'), 50, 1000),
            filter: searchParams.get('filter') || 'all',
            search: searchParams.get('search') || ''
          });
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/harvest-live') {
        const body = await request.json().catch(() => ({}));
        const id = body.competitor_id || body.id;
        const pinId = body.pin_id;
        if (!id || !pinId) return jsonResponse({ error: 'competitor_id and pin_id are required' }, 400);
        try {
          const result = await harvestSinglePinRelatedLive(targetSql, id, pinId);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/competitors/related-pins/dispatch-workflow') {
        const body = await request.json().catch(() => ({}));
        const username = (body.username || body.target_account || '').replace(/^@+/, '').trim();
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const ghToken = env.GITHUB_TOKEN || env.GH_TOKEN || env.GH_REFRESH_TOKEN;
        if (!ghToken) {
          return jsonResponse({
            success: false,
            error: 'GITHUB_TOKEN secret is not configured in Cloudflare Workers settings. Please configure GITHUB_TOKEN to enable automatic GitHub Actions dispatching.'
          }, 400);
        }
        const cleanToken = String(ghToken).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const repo = 'sayfedin-star/pin-arbitrage-engine';
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/account-related-pins.yml/dispatches`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Pin-Arbitrage-Engine',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_account: username,
              pin_ids: String(body.pin_ids || body.pins || '').trim(),
              max_pages_per_seed: String(body.max_pages_per_seed || '2')
            }
          })
        });

        if (res.ok || res.status === 204) {
          if (res?.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
          return jsonResponse({
            success: true,
            target_account: username,
            message: `Account Related Pins Harvester workflow dispatched successfully on GitHub Actions for @${username}!`
          });
        } else {
          const errText = await res.text();
          return jsonResponse({ success: false, error: `GitHub API error (${res.status}): ${errText}` }, res.status);
        }
      }

      if (method === 'DELETE' && (pathname === '/api/competitors/snapshot' || pathname === '/api/competitors/snapshots')) {
        invalidateEdgeCache('competitors');
        let snapshotId = searchParams.get('id') || searchParams.get('snapshot_id');
        if (!snapshotId) {
          try {
            const body = await request.json();
            snapshotId = body.snapshot_id || body.id;
          } catch (_) {}
        }
        if (!snapshotId) return jsonResponse({ error: 'snapshot_id is required' }, 400);
        await deleteCompetitorSnapshot(targetSql, snapshotId);
        return jsonResponse({ success: true, deleted_snapshot_id: snapshotId });
      }

      if (method === 'POST' && (pathname === '/api/competitors/status' || pathname === '/api/competitors/toggle')) {
        invalidateEdgeCache('competitors');
        const body = await request.json();
        const idOrUser = body.username || body.id || body.competitor_id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
        return jsonResponse({ success: true, competitor: row });
      }

      // 16. Keyword Velocity Tracker API (Central Metadata Hub)
      if (method === 'GET' && pathname === '/api/keywords') {
        const search = searchParams.get('search') || '';
        const limit = clampLimit(searchParams.get('limit'), 1000, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
        const forceRefresh = searchParams.get('refresh') === 'true';

        // 1. Check D1 Edge Keywords Catalog first (Sub-5ms Edge Reads)
        if (!forceRefresh && env?.PIN_D1_DB) {
          try {
            const d1Keywords = await readKeywordsFromD1(env, { search, limit, offset });
            if (Array.isArray(d1Keywords) && d1Keywords.length > 0) {
              return jsonResponse({
                success: true,
                keywords: d1Keywords,
                source: 'd1_edge'
              }, 200, 15);
            }
          } catch (d1Err) {
            console.warn('[D1 Keywords Read Error]', redactSecrets(d1Err.message));
          }
        }

        const cacheKey = buildCanonicalCacheKey('keywords:hub', {
          search,
          limit,
          offset
        });

        if (forceRefresh) {
          if (env?.PIN_D1_DB) {
            await evictKeywordsCatalogFromD1(env).catch(() => {});
          }
          await invalidateEdgeCache('keywords');
          await invalidateEdgeCache(cacheKey);
        }

        try {
          const keywords = await getCachedOrFetch(cacheKey, async () => {
            return await listKeywords(sql, {
              search,
              limit,
              offset
            });
          }, 30000, 120000, { forceRefresh });

          if (Array.isArray(keywords) && keywords.length > 0 && env?.PIN_D1_DB) {
            if (!search && limit >= 1000) {
              safeWaitUntil(ctx, syncKeywordsCatalogToD1(env, keywords, { isFullCatalog: true }), 'syncKeywordsCatalogToD1');
            } else if (!search) {
              // Partial query (e.g. limit=5): don't seed D1 partially; fetch and warm full catalog in background
              safeWaitUntil(ctx, (async () => {
                try {
                  const fullCatalog = await listKeywords(sql, { limit: 1000 });
                  await syncKeywordsCatalogToD1(env, fullCatalog, { isFullCatalog: true });
                } catch (_) {}
              })(), 'warmFullKeywordsCatalogToD1');
            } else {
              safeWaitUntil(ctx, syncKeywordsCatalogToD1(env, keywords, { isFullCatalog: false }), 'syncKeywordsCatalogToD1');
            }
            safeWaitUntil(ctx, syncKeywordsBatchToD1(env, keywords), 'syncKeywordsBatchToD1');
          }

          return jsonResponse({
            success: true,
            keywords: Array.isArray(keywords) ? keywords : [],
            source: 'neon_hub'
          }, 200, 8);
        } catch (err) {
          console.error('[Keywords Error]', err.message);
          return jsonResponse({ success: true, degraded: true, keywords: [] }, 200, 0);
        }
      }

      if (method === 'POST' && pathname === '/api/keywords') {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        const row = await addKeyword(sql, body);
        if (row) {
          safeWaitUntil(ctx, syncKeywordToD1(env, row), 'syncKeywordToD1');
        }
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'GET' && pathname === '/api/keywords/resolve') {
        const slug = searchParams.get('slug') || searchParams.get('keyword') || searchParams.get('q');
        if (!slug) return jsonResponse({ error: 'slug or keyword query parameter is required' }, 400);
        const autoCreate = searchParams.get('auto_create') !== 'false';
        const row = await resolveKeywordBySlug(sql, slug, autoCreate);
        if (!row) return jsonResponse({ error: 'Keyword not found and could not be resolved' }, 404);
        if (row) {
          safeWaitUntil(ctx, syncKeywordToD1(env, row), 'syncKeywordToD1');
        }
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'POST' && pathname === '/api/keywords/sync') {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        let keywordId = Number(body.keyword_id || body.id);
        const slug = body.slug || body.keyword;
        let resolvedKw = null;
        if (!keywordId && slug) {
          resolvedKw = await resolveKeywordBySlug(sql, slug, true);
          if (resolvedKw) keywordId = resolvedKw.id;
        }
        if (!keywordId) return jsonResponse({ error: 'keyword_id or slug is required' }, 400);
        const force = Boolean(body.force);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const crawlPages = body.crawl_pages || body.max_pages;
        const maxPins = body.max_pins;
        const res = await crawlKeywordSERP(sql, keywordId, { 
          cookie, 
          force,
          crawl_pages: Math.min(2, Number(crawlPages) || 2),
          max_pins: maxPins,
          skip_top_enrich: true,
          env
        });

        // Trigger Stage 2 Deep Crawler in GitHub Actions asynchronously (< 3s edge response preserved)
        const autoDispatch = body.dispatch_workflow !== false;
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
        if (autoDispatch && token && res?.success) {
          const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
          const targetKw = res.keyword || body.target_keyword || body.keyword || resolvedKw?.keyword || '';
          const maxPinsInput = String(body.max_pins || resolvedKw?.target_pin_count || '50');
          const crawlScopeInput = String(body.crawl_scope || 'all_pins');
          const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
          const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
          const dispatchPromise = (async () => {
            try {
              const dRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`, {
                method: 'POST',
                headers: {
                  'Accept': 'application/vnd.github.v3+json',
                  'Authorization': authHeader,
                  'User-Agent': 'Pin-Arbitrage-Engine'
                },
                body: JSON.stringify({
                  ref: 'main',
                  inputs: {
                    target_keyword: targetKw,
                    crawl_scope: crawlScopeInput,
                    max_pins: maxPinsInput
                  }
                })
              });
              if (dRes?.body && !dRes.bodyUsed) await dRes.body.cancel().catch(() => {});
            } catch (_) {}
          })();
          safeWaitUntil(ctx, dispatchPromise, 'github_workflow_dispatch');
        }

        // Asynchronously sync keyword autocomplete to D1 database
        if (res?.success && (res?.keyword || slug)) {
          safeWaitUntil(ctx, syncKeywordToD1(env, {
            keyword: res.keyword || slug,
            search_volume: res.search_volume || 0,
            monthly_growth: res.monthly_growth || 0,
            pin_count: res.pins_collected || res.pin_count || 0
          }), 'syncKeywordToD1');
        } else if (res?.status === 429 || res?.status === 403 || (res?.error && typeof res.error === 'string' && (res.error.includes('429') || res.error.includes('403')))) {
          safeWaitUntil(ctx, tripPinterestCircuitBreaker(env, `HTTP ${res?.status || 429} Rate Limit/Block in /api/keywords/sync`, 900), 'tripPinterestCircuitBreaker');
        }

        return jsonResponse({
          success: true,
          status: res?.success ? 'success' : 'accepted',
          keyword_id: keywordId,
          result: {
            success: res?.success ?? true,
            status: res?.success ? 'completed' : 'accepted',
            crawled_pins: res?.crawled_pins ?? res?.pins_collected ?? (res?.success ? 1 : 0),
            message: res?.message || (res?.success ? 'Dispatched and synchronized successfully' : 'Dispatched asynchronously'),
            ...res
          }
        });
      }

      if (method === 'GET' && pathname === '/api/settings') {
        const settings = await getAppSettings(sql);
        return jsonResponse({ success: true, settings }, 200, 60);
      }

      if (method === 'POST' && pathname === '/api/settings') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('settings');
        const body = await request.json().catch(() => ({}));
        const updated = await updateAppSettings(sql, body);
        return jsonResponse({ success: true, settings: updated });
      }

      if (method === 'POST' && pathname === '/api/keywords/settings') {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        const keywordId = Number(body.keyword_id);
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const updated = await updateKeywordSettings(sql, keywordId, body);
        return jsonResponse({ success: true, keyword: updated });
      }

      if (method === 'POST' && (pathname === '/api/keywords/status' || pathname === '/api/keywords/toggle')) {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        const id = Number(body.id || body.keyword_id);
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
        const isActive = body.is_active !== undefined ? Boolean(body.is_active) : undefined;

        if (ids.length > 0) {
          if (isActive !== undefined) {
            await sql`
              UPDATE tracked_keywords 
              SET is_active = ${isActive}, updated_at = NOW() 
              WHERE id = ANY(${ids});
            `;
          } else {
            await sql`
              UPDATE tracked_keywords 
              SET is_active = NOT COALESCE(is_active, TRUE), updated_at = NOW() 
              WHERE id = ANY(${ids});
            `;
          }
          return jsonResponse({ success: true, updated_ids: ids, is_active: isActive });
        }

        if (!id) return jsonResponse({ error: 'id, keyword_id, or ids array is required' }, 400);

        let row;
        if (isActive !== undefined) {
          [row] = await sql`
            UPDATE tracked_keywords 
            SET is_active = ${isActive}, updated_at = NOW() 
            WHERE id = ${id} 
            RETURNING *;
          `;
        } else {
          [row] = await sql`
            UPDATE tracked_keywords 
            SET is_active = NOT COALESCE(is_active, TRUE), updated_at = NOW() 
            WHERE id = ${id} 
            RETURNING *;
          `;
        }
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'DELETE' && pathname === '/api/keywords') {
        invalidateEdgeCache('keywords');
        let id = searchParams.get('id');
        let keyword = searchParams.get('keyword');
        let body = {};
        try {
          body = await request.json();
          id = id || body.id || body.keyword_id;
          keyword = keyword || body.keyword;
        } catch (_) {}

        const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Boolean) : [];
        let targetIds = [];
        if (ids.length > 0) {
          targetIds = ids;
        } else if (id && !isNaN(Number(id))) {
          targetIds = [Number(id)];
        } else if (keyword) {
          const cleanKeyword = keyword.toLowerCase().trim();
          const rows = await sql`SELECT id FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
          targetIds = rows.map(r => Number(r.id)).filter(Boolean);
        }

        if (targetIds.length === 0) {
          return jsonResponse({ error: 'id, keyword, or ids array is required to delete tracked keyword' }, 400);
        }

        // 1. Ensure persistent distributed tombstone table exists on Central Hub
        await sql`
          CREATE TABLE IF NOT EXISTS keyword_tombstones (
            keyword_id INT PRIMARY KEY,
            keyword TEXT,
            deleted_at TIMESTAMPTZ DEFAULT NOW(),
            shards_purged BOOLEAN DEFAULT FALSE,
            purged_at TIMESTAMPTZ
          );
        `.catch(() => {});

        // 2. Fetch keyword metadata for the tombstone audit trail
        const existingKw = await sql`
          SELECT id, keyword FROM tracked_keywords WHERE id = ANY(${targetIds});
        `.catch(() => []);

        // 3. Record tombstones for Shard Janitor GC (initiating 99 Shards cleanup lifecycle)
        if (existingKw.length > 0) {
          await sql`
            INSERT INTO keyword_tombstones (keyword_id, keyword, deleted_at, shards_purged)
            SELECT u.id, u.keyword, NOW(), FALSE
            FROM jsonb_to_recordset(${JSON.stringify(existingKw)}::jsonb) AS u(id int, keyword text)
            ON CONFLICT (keyword_id) DO UPDATE SET deleted_at = NOW(), shards_purged = FALSE;
          `.catch(() => {});
        }

        // 4. Clean Central Hub items & execute deletion from tracked_keywords
        await sql`DELETE FROM keyword_serp_current WHERE keyword_id = ANY(${targetIds});`.catch(() => {});
        await sql`DELETE FROM keyword_folder_items WHERE keyword_id = ANY(${targetIds});`.catch(() => {});
        await sql`DELETE FROM tracked_keywords WHERE id = ANY(${targetIds});`;

        return jsonResponse({ success: true, deleted_ids: targetIds });
      }

      // DELETE /api/keywords/:keywordId/pins/:pinId (Manual Pin Catalog Deletion Directive)
      if (pathname.startsWith('/api/keywords/') && pathname.includes('/pins/')) {
        const parts = pathname.slice('/api/keywords/'.length).split('/').filter(Boolean);
        // Expected URL pattern: /api/keywords/:keywordId/pins/:pinId -> parts: [keywordId, 'pins', pinId]
        if (parts[1] === 'pins' && parts[2]) {
          if (method !== 'DELETE') {
            return methodNotAllowedResponse('DELETE, OPTIONS');
          }
          const keywordId = Number(parts[0]);
          const pinId = parts[2];
          if (!keywordId || isNaN(keywordId)) {
            return jsonResponse({ success: false, error: 'BAD_REQUEST', message: 'Valid numeric keywordId is required' }, 400);
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({ success: false, error: 'INVALID_PIN_ID', message: 'Valid pinId is required (numeric Snowflake, 10-30 digits)' }, 400);
          }

          invalidateEdgeCache('keywords');

          // Phase 2: Tombstone Architecture - Record in keyword_ignored_pins to prevent zombie pin resurrection
          await sql`
            INSERT INTO keyword_ignored_pins (keyword_id, pin_id, ignored_reason, ignored_at)
            VALUES (${keywordId}, ${pinId}, 'manual_user_deletion', NOW())
            ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
              ignored_reason = EXCLUDED.ignored_reason,
              ignored_at = EXCLUDED.ignored_at;
          `.catch((err) => {
            console.warn('[Tombstone] Failed to record ignored pin:', err.message);
          });

          // Manual Deletion Only Directive: remove from unified keyword catalog & keyword snapshots & displaced vault
          const delRes = await sql`
            DELETE FROM keyword_serp_current
            WHERE keyword_id = ${keywordId} AND pin_id = ${pinId}
            RETURNING pin_id;
          `;
          await sql`
            DELETE FROM keyword_pins_snapshots
            WHERE keyword_id = ${keywordId} AND pin_id = ${pinId};
          `.catch(() => {});
          await sql`
            DELETE FROM keyword_displaced_index
            WHERE keyword_id = ${keywordId} AND pin_id = ${pinId};
          `.catch(() => {});

          if (env?.PIN_ENGINE_KV) {
            const evictions = getPinKvKeysToEvict(pinId, [keywordId]).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
            evictions.push(
              env.PIN_ENGINE_KV.delete(`serp:comp:${keywordId}`).catch(() => {}),
              env.PIN_ENGINE_KV.delete(`displaced:kw:${keywordId}:50:0`).catch(() => {}),
              env.PIN_ENGINE_KV.delete(`displaced:kw:${keywordId}:100:0`).catch(() => {})
            );
            safeWaitUntil(ctx, Promise.all(evictions), 'kv_delete_keyword_pin_cache');
          }

          return jsonResponse({
            success: true,
            deleted: delRes.length > 0,
            keyword_id: keywordId,
            pin_id: pinId,
            message: `Pin ${pinId} manually removed and tombstoned for keyword #${keywordId}.`
          }, 200);
        }
      }

      if (method === 'GET' && pathname === '/api/keywords/pins') {
        let keywordId = Number(searchParams.get('keyword_id'));
        const slug = searchParams.get('slug') || searchParams.get('keyword');
        if (!keywordId && slug) {
          const resolved = await resolveKeywordBySlug(sql, slug, false);
          if (resolved) keywordId = resolved.id;
        }
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const cacheKey = buildCanonicalCacheKey('keywords:pins', { keyword_id: keywordId, slug: slug || '' });
        const result = await getCachedOrFetch(cacheKey, async () => {
          const pins = await getKeywordPins(sql, keywordId);
          return { success: true, pins };
        }, 30000, 120000);
        return jsonResponse(result, 200, 15);
      }

      if (method === 'GET' && pathname === '/api/keywords/typeahead') {
        const q = searchParams.get('q') || searchParams.get('term') || '';
        const result = await fetchKeywordTypeahead(q);
        return jsonResponse(result);
      }

      // Edge-Native Search Autocomplete API via Cloudflare D1 (Sub-10ms UI Autocomplete)
      if (method === 'GET' && (pathname === '/api/search/autocomplete' || pathname === '/api/keywords/autocomplete')) {
        const q = String(searchParams.get('q') || searchParams.get('query') || '').trim();
        if (!q) {
          return jsonResponse({ success: true, results: [] });
        }

        // 1. Primary Edge Query: Cloudflare D1 Database
        if (env?.PIN_D1_DB) {
          try {
            const stmt = env.PIN_D1_DB.prepare(
              "SELECT keyword, search_volume, pin_count FROM search_autocomplete_index WHERE keyword LIKE ? LIMIT 10"
            ).bind(`${q}%`);
            const d1Res = await stmt.all();
            const rows = d1Res?.results || [];
            if (rows.length > 0) {
              return jsonResponse({ success: true, source: 'd1_edge', results: rows }, 200, 30);
            }
          } catch (err) {
            console.warn('[D1 Autocomplete] Non-fatal D1 query error:', redactSecrets(err.message));
          }
        }

        // 2. Graceful Fallback: Neon Postgres Central Hub
        try {
          const cleanQ = (q && typeof q === 'string' && q.trim()) ? escapeSqlWildcards(q.toLowerCase().trim()) : '';
          const likePattern = `${cleanQ}%`;
          const rows = cleanQ ? await sql`
            SELECT keyword, COALESCE(target_pin_count, 0) as search_volume, COALESCE(target_pin_count, 0) as pin_count
            FROM tracked_keywords
            WHERE LOWER(keyword) LIKE ${likePattern}
            ORDER BY keyword ASC
            LIMIT 10;
          ` : [];
          if (Array.isArray(rows) && rows.length > 0 && env?.PIN_D1_DB) {
            safeWaitUntil(ctx, Promise.all(rows.map(r => syncKeywordToD1(env, r))), 'syncFallbackKeywordsToD1');
          }
          return jsonResponse({ success: true, source: 'neon_hub', results: rows }, 200, 15);
        } catch (_) {
          return jsonResponse({ success: true, source: 'empty_fallback', results: [], degraded: true }, 200, 0);
        }
      }

      if (method === 'GET' && pathname === '/api/keywords/visual-search') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const result = await fetchVisualSearchLens(sql, pinId, cookie, env);
        return jsonResponse(result, result.success ? 200 : 500);
      }

      if (method === 'GET' && pathname === '/api/keywords/guides') {
        let keywordId = Number(searchParams.get('keyword_id'));
        const slug = searchParams.get('slug') || searchParams.get('keyword');
        if (!keywordId && slug) {
          const resolved = await resolveKeywordBySlug(sql, slug, false);
          if (resolved) keywordId = resolved.id;
        }
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const cacheKey = buildCanonicalCacheKey('keywords:guides', { keyword_id: keywordId, slug: slug || '' });
        const result = await getCachedOrFetch(cacheKey, async () => {
          const guides = await getKeywordGuides(sql, keywordId);
          return { success: true, guides };
        }, 30000, 120000);
        return jsonResponse(result, 200, 15);
      }

      if (method === 'GET' && pathname === '/api/keywords/serp-compare') {
        let keywordId = Number(searchParams.get('keyword_id'));
        const slug = searchParams.get('slug') || searchParams.get('keyword') || searchParams.get('q');
        let resolved = null;
        if (!keywordId && slug) {
          resolved = await resolveKeywordBySlug(sql, slug, true);
          if (resolved) keywordId = resolved.id;
        }
        if (!keywordId) return jsonResponse({ error: 'keyword_id or valid slug is required' }, 400);

        const cacheKey = buildCanonicalCacheKey('keywords:serp-compare', {
          keyword_id: keywordId,
          slug: slug || ''
        });

        const forceRefresh = searchParams.get('refresh') === 'true';
        const result = await getCachedOrFetch(cacheKey, async () => {
          return await getKeywordSERPComparison(sql, keywordId, resolved, { env, forceRefresh });
        }, 12000, 45000, { forceRefresh });

        return jsonResponse({ success: true, ...result }, 200, 10);
      }

      if (method === 'GET' && pathname === '/api/keywords/intelligence') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const cacheKey = buildCanonicalCacheKey('keywords:intelligence', { keyword_id: keywordId });
        const result = await getCachedOrFetch(cacheKey, async () => {
          return await getKeywordIntelligence(sql, keywordId);
        }, 30000, 120000);
        return jsonResponse(result, 200, 15);
      }

      if (method === 'GET' && pathname === '/api/keywords/trends') {
        const term = searchParams.get('term') || searchParams.get('q') || searchParams.get('keyword') || '';
        const country = searchParams.get('country') || 'US';
        const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
        const result = await fetchPinterestTrends(term, country, force);
        if (result && result.success && sql && term) {
          try {
            const clean = term.trim().toLowerCase();
            const [kw] = await sql`
              SELECT popular_pins FROM tracked_keywords WHERE LOWER(keyword) = ${clean} LIMIT 1;
            `;
            if (!force && kw && Array.isArray(kw.popular_pins) && kw.popular_pins.length > 0) {
              result.popular_pins = kw.popular_pins;
            } else if (force || !kw?.popular_pins || kw.popular_pins.length === 0) {
              const popResult = await fetchPinterestTrendsPopularPins(sql, term, country, force);
              if (popResult?.success && popResult?.popular_pins) {
                result.popular_pins = popResult.popular_pins;
              }
              if ((!result.collage_images || result.collage_images.length === 0) && popResult?.collage_images?.length > 0) {
                result.collage_images = popResult.collage_images;
              }
            }
          } catch (_) {}
        }
        return jsonResponse(result, result.success ? 200 : 400);
      }

      if (method === 'GET' && pathname === '/api/keywords/displaced') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const status = searchParams.get('status') || 'ALL';
        const limit = clampLimit(searchParams.get('limit'), 100, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
        const cacheKey = buildCanonicalCacheKey('keywords:displaced', { keyword_id: keywordId, status, limit, offset });
        const forceRefresh = searchParams.get('refresh') === 'true';
        const result = await getCachedOrFetch(cacheKey, async () => {
          return await getKeywordDisplacedPins(sql, keywordId, { status, limit, offset, env, forceRefresh });
        }, 30000, 120000, { forceRefresh });
        return jsonResponse(result, 200, 15);
      }

      if (method === 'GET' && pathname === '/api/keywords/pins/trajectory') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
        const range = searchParams.get('range') || 'all';
        const forceRefresh = searchParams.get('refresh') === 'true';
        const result = await getPinPerformanceTrajectory(sql, keywordId, pinId, range, { env, forceRefresh });
        return jsonResponse(result);
      }

      if (method === 'GET' && pathname === '/api/keywords/pins/dossier') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
        const forceRefresh = searchParams.get('refresh') === 'true';
        const cacheKey = buildCanonicalCacheKey('keywords:pin-dossier', { pin_id: pinId, keyword_id: keywordId || '' });
        if (forceRefresh) await invalidateEdgeCache(cacheKey);
        const result = await getCachedOrFetch(cacheKey, () => getPinDeepDossier(sql, pinId, keywordId, { forceRefresh, env }), 30000, 120000, { forceRefresh });
        return jsonResponse(result, 200, 15);
      }

      // Universal Pin Intelligence API (/api/pins/:pin_id & /api/pins/:pin_id/snapshots/:snapshot_id)
      if (pathname.startsWith('/api/pins/')) {
        const parts = pathname.slice('/api/pins/'.length).split('/').filter(Boolean);
        const pinId = parts[0];

        // 1. DELETE /api/pins/:pin_id/snapshots/:snapshot_id (Legacy backward compatibility)
        if (parts[1] === 'snapshots') {
          if (method !== 'DELETE') {
            return methodNotAllowedResponse('DELETE, OPTIONS');
          }
          const snapshotId = Number(parts[2]);
          if (!snapshotId || isNaN(snapshotId)) {
            return jsonResponse({
              success: false,
              error: 'BAD_REQUEST',
              message: 'Valid numeric snapshot_id is required'
            }, 400);
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
            }, 400);
          }
          const shardId = getPinShardId(pinId, 99);
          const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

          // 1. Fetch snapshot metadata to identify date and keyword before deletion
          const [hubSnap] = await sql`
            SELECT snapshot_date, keyword_id FROM keyword_pins_snapshots WHERE id = ${snapshotId} LIMIT 1;
          `.catch(() => []);
          const [shardSnap] = await shardSql`
            SELECT snapshot_date, keyword_id FROM pins_daily_snapshots WHERE id = ${snapshotId} LIMIT 1;
          `.catch(() => []);
          const targetDate = hubSnap?.snapshot_date || shardSnap?.snapshot_date;
          const targetKwId = hubSnap?.keyword_id || shardSnap?.keyword_id;

          // 2. Delete from single-row snapshot tables on Hub
          await sql`DELETE FROM keyword_pins_snapshots WHERE id = ${snapshotId};`.catch(() => {});

          // 3. Clean Two-Tier Shard tables (pins_daily_metrics & pin_serp_positions)
          if (targetDate) {
            if (targetKwId) {
              await shardSql`
                DELETE FROM pin_serp_positions
                WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date AND keyword_id = ${targetKwId};
              `.catch(() => {});
            }
            // Check if any other snapshots remain on that date for this pin
            const [remHub] = await sql`
              SELECT id FROM keyword_pins_snapshots WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date LIMIT 1;
            `.catch(() => []);
            const [remShard] = await shardSql`
              SELECT pin_id FROM pin_serp_positions WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date LIMIT 1;
            `.catch(() => []);
            if (!remHub && !remShard) {
              await shardSql`
                DELETE FROM pins_daily_metrics
                WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
              `.catch(() => {});
              await shardSql`
                DELETE FROM pin_serp_positions
                WHERE pin_id = ${pinId} AND snapshot_date = ${targetDate}::date;
              `.catch(() => {});
            }
          }

          await invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
          await invalidateEdgeCache(buildCanonicalCacheKey('pin:dossier', { pin_id: pinId }));
          if (env?.PIN_ENGINE_KV) {
            const evictions = getPinKvKeysToEvict(pinId, targetKwId ? [targetKwId] : []).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
            safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_snapshot_${snapshotId}`);
          }
          return jsonResponse({ success: true, deleted_snapshot_id: snapshotId, pin_id: pinId });
        }

        // 1A. DELETE /api/pins/:pin_id/serp-positions (Delete specific SERP position for a keyword on a date)
        if (parts[1] === 'serp-positions') {
          if (method !== 'DELETE') {
            return methodNotAllowedResponse('DELETE, OPTIONS');
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
            }, 400);
          }

          let body = {};
          if (request.headers.get('content-type')?.includes('application/json')) {
            try { body = await request.json(); } catch (_) {}
          }
          const kwId = Number(body.keyword_id || searchParams.get('keyword_id'));
          const snapshotDate = String(body.snapshot_date || searchParams.get('snapshot_date') || '').trim();

          if (!kwId || isNaN(kwId) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
            return jsonResponse({
              success: false,
              error: 'BAD_REQUEST',
              message: 'Valid numeric keyword_id and YYYY-MM-DD snapshot_date are required'
            }, 400);
          }

          const shardId = getPinShardId(pinId, 99);
          const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

          // Delete from Two-Tier positions table on shard
          await shardSql`
            DELETE FROM pin_serp_positions
            WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date AND keyword_id = ${kwId};
          `.catch(() => {});

          // Delete from Hub snapshots
          await sql`
            DELETE FROM keyword_pins_snapshots
            WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date AND keyword_id = ${kwId};
          `.catch(() => {});

          invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
          if (env?.PIN_ENGINE_KV) {
            const evictions = getPinKvKeysToEvict(pinId, [kwId]).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
            safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_serp_${pinId}_${kwId}`);
          }
          return jsonResponse({
            success: true,
            pin_id: pinId,
            keyword_id: kwId,
            snapshot_date: snapshotDate
          });
        }

        // 1B. DELETE /api/pins/:pin_id/daily-metrics/:date (Delete entire day's metrics and all ranks)
        if (parts[1] === 'daily-metrics') {
          if (method !== 'DELETE') {
            return methodNotAllowedResponse('DELETE, OPTIONS');
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
            }, 400);
          }
          const snapshotDate = String(parts[2] || searchParams.get('snapshot_date') || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
            return jsonResponse({
              success: false,
              error: 'BAD_REQUEST',
              message: 'Valid YYYY-MM-DD snapshot_date is required in path (/api/pins/:pinId/daily-metrics/YYYY-MM-DD)'
            }, 400);
          }

          const shardId = getPinShardId(pinId, 99);
          const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

          // Delete metrics and positions from shard
          await shardSql`
            DELETE FROM pins_daily_metrics
            WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
          `.catch(() => {});

          await shardSql`
            DELETE FROM pin_serp_positions
            WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
          `.catch(() => {});

          // Delete from Hub snapshots
          await sql`
            DELETE FROM keyword_pins_snapshots
            WHERE pin_id = ${pinId} AND snapshot_date = ${snapshotDate}::date;
          `.catch(() => {});

          invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
          if (env?.PIN_ENGINE_KV) {
            const evictions = getPinKvKeysToEvict(pinId).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
            safeWaitUntil(ctx, Promise.all(evictions), `kv_delete_daily_metrics_${pinId}`);
          }
          return jsonResponse({
            success: true,
            pin_id: pinId,
            snapshot_date: snapshotDate
          });
        }

        // 2. POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
        if (parts[1] === 'sync') {
          if (method !== 'POST') {
            return methodNotAllowedResponse('POST, OPTIONS');
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid identifier (alphanumeric, 10-128 chars)'
            }, 400);
          }
          try {
            const pinResult = await fetchPinFromPinterest(pinId);
            if (!pinResult?.ok || !pinResult.pin) {
              return jsonResponse({
                success: false,
                error: 'SCRAPE_FAILED',
                message: pinResult?.error || 'Failed to fetch live telemetry from Pinterest. Pin may be private or rate limited.',
                pin_id: pinId
              }, 502);
            }
            const pin = pinResult.pin;
            const shardId = getPinShardId(pinId, 99);
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => targetSql);

            const rawMetaToStore = {
              alt_text: pin.alt_text || pin.seo_title || '',
              description: pin.description || '',
              board_name: pin.board_name || '',
              creation_method: pin.creation_method || pin.method || 'pinterest_platform',
              created_at_pinterest: pin.created_at_pinterest || pin.created_at || '',
              is_repin: Boolean(pin.is_repin),
              origin_pinner: pin.origin_pinner || null,
              domain_official_user: pin.domain_official_user || null,
              creator_is_verified_merchant: Boolean(pin.creator_is_verified_merchant),
              board_pin_count: Number(pin.board_pin_count || 0),
              board_order_modified_at: pin.board_order_modified_at || null,
              board_url: pin.board_url || null,
              board_cover_url: pin.board_cover_url || null,
              board_thumbnail_url: pin.board_thumbnail_url || null,
              image_signature: pin.image_signature || '',
              seo_title: pin.seo_title || '',
              seo_description: pin.seo_description || '',
              seo_canonical_url: pin.seo_canonical_url || '',
              seo_canonical_domain: pin.seo_canonical_domain || '',
              canonical_pin_id: pin.canonical_pin_id || null,
              canonical_pin_url: pin.canonical_pin_url || null,
              seo_related_interests: pin.seo_related_interests || [],
              rich_metadata: pin.rich_metadata || null,
              visual_objects: pin.visual_objects || [],
              reactions: pin.reactions || {},
              seo_noindex_reason: pin.seo_noindex_reason || null,
              is_go_linkless: Boolean(pin.is_go_linkless),
              utm_link: pin.utm_link || '',
              tracked_link: pin.tracked_link || '',
              category_breadcrumbs: pin.category_breadcrumbs || [],
              top_interest_id: pin.top_interest_id || null,
              unauth_on_page_title: pin.unauth_on_page_title || '',
              unauth_on_page_description: pin.unauth_on_page_description || '',
              image_dimensions: pin.image_dimensions || null,
              share_count: Number(pin.share_count || 0),
              dominant_color: pin.dominant_color || '#888888',
              visual_annotations: pin.annotations?.map(a => a.name) || []
            };

            const metaToStore = {};
            for (const [k, v] of Object.entries(rawMetaToStore)) {
              if (v === null || v === undefined || v === '') continue;
              if (Array.isArray(v) && v.length === 0) continue;
              if (typeof v === 'object' && Object.keys(v).length === 0) continue;
              metaToStore[k] = v;
            }

            // A. Master pin record on target shard
            await shardSql`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations,
                created_at_pinterest, metadata,
                first_discovered_pillar, first_discovered_at, updated_at
              ) VALUES (
                ${pinId},
                ${pin.creator_username || ''},
                ${pin.board_name || ''},
                ${pin.title || ''},
                ${pin.domain || ''},
                ${pin.link || ''},
                ${pin.image_url || ''},
                ${pin.description || ''},
                ${pin.alt_text || pin.seo_title || ''},
                ${pin.dominant_color || '#888888'},
                ${JSON.stringify(pin.annotations?.map(a => a.name) || [])}::jsonb,
                ${pin.created_at_pinterest ? new Date(pin.created_at_pinterest).toISOString() : null}::timestamptz,
                ${JSON.stringify(metaToStore)}::jsonb,
                'live_sync',
                NOW(),
                NOW()
              )
              ON CONFLICT (pin_id) DO UPDATE SET
                creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
                board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
                title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
                domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
                destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
                image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
                description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
                alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
                dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
                visual_annotations = CASE 
                  WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                  THEN EXCLUDED.visual_annotations 
                  ELSE universal_master_pins.visual_annotations 
                END,
                created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
                metadata = universal_master_pins.metadata || EXCLUDED.metadata,
                updated_at = NOW();
            `.catch(() => {});

            // Phase 4: Concurrency Guard - Prevent State Flapping During Active Crawl
            const activeCrawlKeywords = await sql`
              SELECT tk.id, tk.crawl_lease_until
              FROM tracked_keywords tk
              WHERE tk.id IN (
                SELECT DISTINCT keyword_id FROM keyword_serp_current WHERE pin_id = ${pinId}
              )
              AND tk.crawl_lease_until > NOW();
            `.catch(() => []);
            const isCrawlInProgress = activeCrawlKeywords.length > 0;

            // B1. Hub keyword_serp_current (Unified Operational Catalog)
            // Telemetry & descriptive metadata update only - never touch is_displaced or rank_position
            await sql`
              UPDATE keyword_serp_current SET
                save_count = GREATEST(save_count, ${Number(pin.saves || 0)}::bigint),
                repin_count = GREATEST(repin_count, ${Number(pin.repins || 0)}::int),
                comment_count = GREATEST(COALESCE(comment_count, 0), ${Number(pin.comments || 0)}::int),
                share_count = GREATEST(COALESCE(share_count, 0), ${Number(pin.share_count || 0)}::int),
                title = CASE WHEN ${pin.title || ''}::text <> '' THEN ${pin.title}::text ELSE title END,
                domain = CASE WHEN ${pin.domain || ''}::text <> '' THEN ${pin.domain}::text ELSE domain END,
                destination_url = CASE WHEN ${pin.link || ''}::text <> '' THEN ${pin.link}::text ELSE destination_url END,
                image_url = CASE WHEN ${pin.image_url || ''}::text <> '' THEN ${pin.image_url}::text ELSE image_url END,
                creator_username = CASE WHEN ${pin.creator_username || pin.pinner?.username || ''}::text <> '' THEN ${pin.creator_username || pin.pinner?.username}::text ELSE creator_username END,
                board_name = CASE WHEN ${pin.board_name || ''}::text <> '' THEN ${pin.board_name}::text ELSE board_name END,
                dominant_color = CASE WHEN ${pin.dominant_color || ''}::text <> '' THEN ${pin.dominant_color}::text ELSE dominant_color END,
                visual_annotations = CASE 
                  WHEN jsonb_typeof(${JSON.stringify(pin.annotations?.map(a => a.name) || [])}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(pin.annotations?.map(a => a.name) || [])}::jsonb) > 0 
                  THEN ${JSON.stringify(pin.annotations?.map(a => a.name) || [])}::jsonb 
                  ELSE visual_annotations 
                END,
                created_at_pinterest = CASE WHEN ${pin.created_at_pinterest}::timestamptz IS NOT NULL THEN ${pin.created_at_pinterest}::timestamptz ELSE created_at_pinterest END,
                creation_method = CASE WHEN ${pin.creation_method || ''}::text <> '' THEN ${pin.creation_method}::text ELSE creation_method END,
                metadata = CASE 
                  WHEN jsonb_typeof(metadata) = 'object' THEN metadata || ${JSON.stringify(metaToStore)}::jsonb 
                  ELSE ${JSON.stringify(metaToStore)}::jsonb 
                END,
                crawled_at = NOW(),
                updated_at = NOW()
              WHERE pin_id = ${pinId};
            `.catch(() => {});

            // C. Shard daily snapshot record for all keywords associated with pin
            const serpRows = await sql`
              SELECT keyword_id, rank_position, last_known_rank, is_displaced 
              FROM keyword_serp_current 
              WHERE pin_id = ${pinId};
            `.catch(() => []);
            const targetRows = serpRows.length > 0
              ? serpRows
              : [{ keyword_id: null, rank_position: null, is_displaced: false }];

            // Get baseline from shard pins_daily_metrics to preserve or compute velocity
            const [prevShardMetric] = await shardSql`
              SELECT save_count, snapshot_date, daily_save_velocity
              FROM pins_daily_metrics
              WHERE pin_id = ${pinId} AND snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
              ORDER BY snapshot_date DESC
              LIMIT 1;
            `.catch(() => []);

            let syncVelocity = 0;
            const newSaves = Number(pin.saves || 0);
            if (prevShardMetric && prevShardMetric.snapshot_date) {
              const prevDate = new Date(prevShardMetric.snapshot_date);
              const todayDate = new Date();
              const elapsedDays = Math.max(1, Math.round((todayDate - prevDate) / 86400000));
              const prevSaves = Number(prevShardMetric.save_count || 0);
              const diff = newSaves - prevSaves;
              if (diff > 0) {
                syncVelocity = Math.round((diff / elapsedDays) * 10) / 10;
              } else if (diff === 0 && Number(prevShardMetric.daily_save_velocity) > 0) {
                syncVelocity = Number(prevShardMetric.daily_save_velocity);
              }
            }

            for (const sRow of targetRows) {
              const shardKid = sRow.keyword_id || null;
              const shardDisplaced = Boolean(sRow.is_displaced ?? false);
              const shardRank = shardDisplaced ? null : (sRow.rank_position ?? null);

              // Write to pin_serp_positions (pins_daily_snapshots is a consolidated VIEW)
              if (shardKid != null) {
                const shardLastKnown = sRow.last_known_rank ?? sRow.rank_position ?? null;
                const shardCatalogRank = shardDisplaced ? ((Number(shardLastKnown || 50) + 100)) : (shardRank ?? shardLastKnown ?? null);
                await shardSql`
                  INSERT INTO pin_serp_positions (
                    pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
                  ) VALUES (
                    ${pinId}, (NOW() AT TIME ZONE 'UTC')::date, ${shardKid}, ${shardRank}, ${shardDisplaced},
                    ${shardLastKnown}, ${shardCatalogRank}, NOW()
                  )
                  ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
                    rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
                    is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
                    last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
                    catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
                    updated_at = NOW();
                `.catch(() => {});
              }
            }

            // Update two-tier modern shard tables (pins_daily_metrics)
            await shardSql`
              INSERT INTO pins_daily_metrics (
                pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
              ) VALUES (
                ${pinId}, (NOW() AT TIME ZONE 'UTC')::date, ${newSaves}, ${Number(pin.repins || 0)},
                ${Number(pin.comments || 0)}, ${Number(pin.share_count || 0)}, 0, ${syncVelocity}, NOW()
              )
              ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
                repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
                comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
                share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
                daily_save_velocity = GREATEST(pins_daily_metrics.daily_save_velocity, EXCLUDED.daily_save_velocity),
                updated_at = NOW();
            `.catch(() => {});

            // D. Refreshed dossier
            const refreshedDossier = await fetchUniversalPinDossier({ hubSql: sql, pinId, ctx, env, bypassEdgeCache: true });
            invalidateEdgeCache(`pin:dossier?pin_id=${pinId}`);
            invalidateEdgeCache(`pin:trajectory?pin_id=${pinId}`);
            if (env?.PIN_ENGINE_KV) {
              const associatedKids = [...new Set(targetRows.map(r => r.keyword_id).filter(Boolean))];
              const evictions = getPinKvKeysToEvict(pinId, associatedKids).map(k => env.PIN_ENGINE_KV.delete(k).catch(() => {}));
              safeWaitUntil(ctx, Promise.all(evictions), `kv_sync_evict_${pinId}`);
            }

            return jsonResponse({
              success: true,
              synced: true,
              pin_id: pinId,
              pin,
              dossier: refreshedDossier
            }, 200, 0);
          } catch (err) {
            return jsonResponse({
              success: false,
              error: 'SYNC_ERROR',
              message: redactSecrets(err.message),
              pin_id: pinId
            }, 500);
          }
        }

        // 3. GET /api/pins/:pin_id (Universal 4-Pillar Dossier via fleet-router - Zero-Blocking)
        if (parts.length === 1) {
          if (method !== 'GET') {
            return methodNotAllowedResponse('GET, OPTIONS');
          }
          if (!pinId || !isValidPinId(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid identifier (numeric Snowflake, 10-30 digits)'
            }, 400);
          }
          try {
            const forceRefresh = searchParams.get('refresh') === 'true';
            const dossierCacheKey = buildCanonicalCacheKey('pin:dossier', { pin_id: pinId });
            if (forceRefresh) {
              await invalidateEdgeCache(dossierCacheKey);
            }

            const dossier = await getCachedOrFetch(dossierCacheKey, async () => {
              return await fetchUniversalPinDossier({ hubSql: sql, pinId, ctx, env, bypassEdgeCache: forceRefresh });
            }, 30000, 120000, { forceRefresh });

            // Edge cache poisoning guard: If dossier has 0 snapshots or failed, invalidate cache so future calls re-fetch
            if (!dossier?.success || (!dossier?.daily_trajectory?.length && !dossier?.snapshots?.length)) {
              invalidateEdgeCache(dossierCacheKey);
            }

            // Non-Blocking Background Auto-Enrichment via safeWaitUntil (0ms user wait)
            if (dossier?.success && (!dossier?.algorithmic_intelligence?.canonical_pin_id || !dossier?.algorithmic_intelligence?.seo_related_interests?.length)) {
              const bgEnrichPromise = (async () => {
                try {
                  let timerId;
                  const liveTask = fetchPinFromPinterest(pinId);
                  liveTask.catch(() => {});
                  const timeoutPromise = new Promise((_, reject) => {
                    timerId = setTimeout(() => reject(new Error('timeout')), 3000);
                  });
                  const liveRes = await Promise.race([
                    liveTask,
                    timeoutPromise
                  ]).finally(() => {
                    if (timerId) clearTimeout(timerId);
                  });
                  if (liveRes?.ok && liveRes.pin) {
                    const p = liveRes.pin;
                    const rawAutoMeta = {
                      alt_text: p.alt_text || p.seo_title || '',
                      description: p.description || '',
                      board_name: p.board_name || '',
                      creation_method: p.creation_method || p.method || 'pinterest_platform',
                      created_at_pinterest: p.created_at_pinterest || p.created_at || '',
                      is_repin: Boolean(p.is_repin),
                      origin_pinner: p.origin_pinner || null,
                      domain_official_user: p.domain_official_user || null,
                      creator_is_verified_merchant: Boolean(p.creator_is_verified_merchant),
                      board_pin_count: Number(p.board_pin_count || 0),
                      board_order_modified_at: p.board_order_modified_at || null,
                      board_url: p.board_url || null,
                      board_cover_url: p.board_cover_url || null,
                      board_thumbnail_url: p.board_thumbnail_url || null,
                      image_signature: p.image_signature || '',
                      seo_title: p.seo_title || '',
                      seo_description: p.seo_description || '',
                      seo_canonical_url: p.seo_canonical_url || '',
                      seo_canonical_domain: p.seo_canonical_domain || '',
                      canonical_pin_id: p.canonical_pin_id || null,
                      canonical_pin_url: p.canonical_pin_url || null,
                      seo_related_interests: p.seo_related_interests || [],
                      rich_metadata: p.rich_metadata || null,
                      visual_objects: p.visual_objects || [],
                      reactions: p.reactions || {},
                      seo_noindex_reason: p.seo_noindex_reason || null,
                      is_go_linkless: Boolean(p.is_go_linkless),
                      utm_link: p.utm_link || '',
                      tracked_link: p.tracked_link || '',
                      category_breadcrumbs: p.category_breadcrumbs || [],
                      top_interest_id: p.top_interest_id || null,
                      unauth_on_page_title: p.unauth_on_page_title || '',
                      unauth_on_page_description: p.unauth_on_page_description || '',
                      image_dimensions: p.image_dimensions || null,
                      share_count: Number(p.share_count || 0),
                      dominant_color: p.dominant_color || '#888888',
                      visual_annotations: p.annotations?.map(a => a.name) || []
                    };

                    const autoMeta = {};
                    for (const [k, v] of Object.entries(rawAutoMeta)) {
                      if (v === null || v === undefined || v === '') continue;
                      if (Array.isArray(v) && v.length === 0) continue;
                      if (typeof v === 'object' && Object.keys(v).length === 0) continue;
                      autoMeta[k] = v;
                    }

                    const shardId = getPinShardId(pinId, 99);
                    const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env }).catch(() => null);

                    const dbTasks = [
                      sql`
                        UPDATE keyword_serp_current SET
                          save_count = GREATEST(save_count, ${Number(p.saves || p.save_count || 0)}),
                          repin_count = GREATEST(repin_count, ${Number(p.repins || p.repin_count || 0)}),
                          comment_count = GREATEST(COALESCE(comment_count, 0), ${Number(p.comments || p.comment_count || 0)}),
                          share_count = GREATEST(COALESCE(share_count, 0), ${Number(p.share_count || 0)}),
                          visual_annotations = CASE 
                            WHEN jsonb_typeof(${JSON.stringify(p.annotations?.map(a => a.name) || [])}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(p.annotations?.map(a => a.name) || [])}::jsonb) > 0 
                            THEN ${JSON.stringify(p.annotations?.map(a => a.name) || [])}::jsonb 
                            ELSE visual_annotations 
                          END,
                          creator_username = CASE WHEN ${p.creator_username || p.pinner?.username || ''}::text <> '' THEN ${p.creator_username || p.pinner?.username}::text ELSE creator_username END,
                          board_name = CASE WHEN ${p.board_name || ''}::text <> '' THEN ${p.board_name}::text ELSE board_name END,
                          dominant_color = CASE WHEN ${p.dominant_color || ''}::text <> '' THEN ${p.dominant_color}::text ELSE dominant_color END,
                          created_at_pinterest = CASE WHEN ${p.created_at_pinterest || null}::timestamptz IS NOT NULL THEN ${p.created_at_pinterest}::timestamptz ELSE created_at_pinterest END,
                          metadata = CASE 
                            WHEN jsonb_typeof(metadata) = 'object' THEN metadata || ${JSON.stringify(autoMeta)}::jsonb 
                            ELSE ${JSON.stringify(autoMeta)}::jsonb 
                          END,
                          destination_url = CASE WHEN ${p.link || ''}::text <> '' THEN ${p.link}::text ELSE destination_url END,
                          updated_at = NOW()
                        WHERE pin_id = ${pinId};
                      `
                    ];

                    if (shardSql && shardSql !== sql) {
                      dbTasks.push(
                        shardSql`
                          INSERT INTO universal_master_pins (
                            pin_id, creator_username, board_name, title, domain, destination_url,
                            image_url, description, alt_text, dominant_color, visual_annotations,
                            created_at_pinterest, metadata,
                            first_discovered_pillar, first_discovered_at, updated_at
                          ) VALUES (
                            ${pinId},
                            ${p.creator_username || p.pinner?.username || ''},
                            ${p.board_name || ''},
                            ${p.title || ''},
                            ${p.domain || ''},
                            ${p.link || ''},
                            ${p.image_url || ''},
                            ${p.description || ''},
                            ${p.alt_text || p.seo_title || ''},
                            ${p.dominant_color || '#888888'},
                            ${JSON.stringify(p.annotations?.map(a => a.name) || [])}::jsonb,
                            ${p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null}::timestamptz,
                            ${JSON.stringify(autoMeta)}::jsonb,
                            'auto_enrich',
                            NOW(),
                            NOW()
                          )
                          ON CONFLICT (pin_id) DO UPDATE SET
                            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
                            board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
                            title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
                            domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
                            destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
                            image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
                            description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
                            alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
                            dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
                            visual_annotations = CASE 
                              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                              THEN EXCLUDED.visual_annotations 
                              ELSE universal_master_pins.visual_annotations 
                            END,
                            created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
                            metadata = universal_master_pins.metadata || EXCLUDED.metadata,
                            updated_at = NOW();
                        `.catch(() => {}),
                        shardSql`
                          INSERT INTO pins_daily_metrics (
                            pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
                          ) VALUES (
                            ${pinId}, (NOW() AT TIME ZONE 'UTC')::date,
                            ${Number(p.saves || p.save_count || 0)},
                            ${Number(p.repins || p.repin_count || 0)},
                            ${Number(p.comments || p.comment_count || 0)},
                            ${Number(p.share_count || 0)},
                            0, 0, NOW()
                          )
                          ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                            save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
                            repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
                            comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
                            share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
                            updated_at = NOW();
                        `.catch(() => {})
                      );
                    }

                    await Promise.allSettled(dbTasks);
                    invalidateEdgeCache(dossierCacheKey);
                  }
                } catch (_) {}
              })();
              safeWaitUntil(ctx, bgEnrichPromise, `bg_enrich_pin_${pinId}`);
            }

            if (!dossier || !dossier.pin_id || !dossier.success) {
              invalidateEdgeCache(dossierCacheKey);
              const isUnavailable = dossier?.error === 'SHARD_UNAVAILABLE' || dossier?.circuit_broken || dossier?.is_degraded;
              return jsonResponse({
                success: false,
                error: isUnavailable ? 'SHARD_UNAVAILABLE' : 'NOT_FOUND',
                message: dossier?.message || (isUnavailable ? `Pin storage shard is currently cold/unavailable. Please retry.` : `Pin dossier not found for pin_id: ${pinId}`)
              }, isUnavailable ? 503 : 404);
            }
            return jsonResponse(dossier, 200, 15);
          } catch (err) {
            return jsonResponse({
              success: false,
              error: 'INTERNAL_ERROR',
              message: redactSecrets(err.message),
              pin_id: pinId
            }, 500);
          }
        }
      }

      // Level 1B: Discovery Typeahead API (Enriched with real Pinterest internal_search_count + Seed Term)
      if (pathname === '/api/discovery/typeahead') {
        if (method !== 'GET') {
          return methodNotAllowedResponse('GET, OPTIONS');
        }
        const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('query') || '';
        const cleanQ = String(q || '').trim();
        const result = await fetchKeywordTypeahead(cleanQ);

        // Prepend root seed keyword at index 0 so user sees the searched term's volume & taxonomy
        let targetSuggestions = Array.isArray(result?.suggestions) ? [...result.suggestions] : [];
        if (cleanQ.length >= 2) {
          const lowerQ = cleanQ.toLowerCase();
          const exists = targetSuggestions.some(item => {
            const s = typeof item === 'string' ? item : (item.term || item.query || '');
            return s.trim().toLowerCase() === lowerQ;
          });
          if (!exists) {
            targetSuggestions.unshift({ term: cleanQ, is_seed: true });
          } else {
            targetSuggestions = targetSuggestions.map(item => {
              const s = typeof item === 'string' ? item : (item.term || item.query || '');
              if (s.trim().toLowerCase() === lowerQ) {
                return { term: s.trim(), is_seed: true };
              }
              return item;
            });
            const seedIdx = targetSuggestions.findIndex(item => (typeof item === 'object' && item.is_seed));
            if (seedIdx > 0) {
              const [seedItem] = targetSuggestions.splice(seedIdx, 1);
              targetSuggestions.unshift(seedItem);
            }
          }
        }

        if (targetSuggestions.length > 0) {
          const suggestionTerms = targetSuggestions.map(item => 
            typeof item === 'string' ? item : (item.term || item.query || '')
          ).filter(Boolean);

          const [velocityMapResult, enriched] = await Promise.all([
            fetchPinterestBatchVelocity(cleanQ, suggestionTerms).catch(() => new Map()),
            Promise.allSettled(targetSuggestions.map(async (item) => {
              const termStr = typeof item === 'string' ? item : (item.term || item.query || '');
              const isSeed = (typeof item === 'object' && Boolean(item.is_seed)) || (termStr.toLowerCase() === cleanQ.toLowerCase());
              try {
                const interest = await fetchPinterestInterestVolume(termStr);
                const hasAnno = interest && interest.id && String(interest.id) !== '0' && (interest.internal_search_count > 0);
                const breadcrumbs = (hasAnno && Array.isArray(interest.seo_breadcrumbs)) ? interest.seo_breadcrumbs : [];
                return {
                  term: termStr,
                  is_seed: isSeed,
                  search_volume: hasAnno ? interest.internal_search_count : null,
                  annotation_id: hasAnno ? interest.id : null,
                  category_tree: breadcrumbs,
                  category_path: breadcrumbs.length > 0 ? breadcrumbs.join(' > ') : '',
                  url: hasAnno && interest.url_name ? `https://www.pinterest.com/ideas/${interest.url_name}/${interest.id}/` : null
                };
              } catch (_) {
                return { term: termStr, is_seed: isSeed, search_volume: null, annotation_id: null, category_tree: [], category_path: '', url: null };
              }
            }))
          ]);

          const velocityMap = (velocityMapResult instanceof Map) ? velocityMapResult : new Map();

          result.success = true;
          result.term = cleanQ;
          result.suggestions = suggestionTerms;
          result.enriched_suggestions = enriched.map((r, i) => {
            const base = r.status === 'fulfilled' ? r.value : { 
              term: suggestionTerms[i] || '', 
              is_seed: (suggestionTerms[i] || '').toLowerCase() === cleanQ.toLowerCase(), 
              search_volume: null, 
              category_tree: [], 
              category_path: '', 
              url: null 
            };
            const cleanT = String(base.term || '').trim().toLowerCase();
            const velData = velocityMap.get(cleanT);
            return {
              ...base,
              weekly_change: (velData && typeof velData.weekly_change === 'number') ? velData.weekly_change : null,
              monthly_change: (velData && typeof velData.monthly_change === 'number') ? velData.monthly_change : null,
              yearly_change: (velData && typeof velData.yearly_change === 'number') ? velData.yearly_change : null,
              velocity_30d: (velData && typeof velData.velocity_30d === 'number') ? velData.velocity_30d : null,
              counts: Array.isArray(velData?.counts) ? velData.counts : [],
              has_prediction: Boolean(velData?.hasPrediction)
            };
          });
        }
        return jsonResponse(result);
      }

      // Level 1B: Pinterest Related Interests & Additions API
      if (pathname === '/api/keywords/related-interests') {
        if (method !== 'GET') {
          return methodNotAllowedResponse('GET, OPTIONS');
        }
        const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('query') || '';
        const mode = searchParams.get('mode') || 'both'; // 'related', 'additions', 'both'
        if (!['both', 'related', 'additions'].includes(mode)) {
          return jsonResponse({ success: false, error: 'Invalid mode. Allowed values: both, related, additions' }, 400);
        }
        if (!q || q.trim().length < 2) {
          return jsonResponse({ success: false, error: 'Query term must be at least 2 characters' }, 400);
        }
        try {
          const result = await fetchKeywordRelatedInterests(q, mode);
          return jsonResponse(result);
        } catch (err) {
          return jsonResponse({
            success: false,
            error: 'INTERNAL_ERROR',
            message: redactSecrets(err.message)
          }, 500);
        }
      }

      // Level 1B: Bulk Keywords Importer API
      if (pathname === '/api/keywords/bulk-import') {
        if (method !== 'POST') {
          return methodNotAllowedResponse('POST, OPTIONS');
        }

        // Payload Flooding Ceiling: Reject payloads > 512KB
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 512 * 1024) {
          return jsonResponse({
            success: false,
            error: 'PAYLOAD_TOO_LARGE',
            message: 'Payload size exceeds the 512KB limit'
          }, 413);
        }

        let body;
        try {
          const rawText = await request.text();
          if (rawText.length > 512 * 1024) {
            return jsonResponse({
              success: false,
              error: 'PAYLOAD_TOO_LARGE',
              message: 'Payload size exceeds the 512KB limit'
            }, 413);
          }
          body = JSON.parse(rawText);
        } catch (parseErr) {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Malformed JSON payload: ' + parseErr.message
          }, 400);
        }

        if (!body || typeof body !== 'object') {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Request body must be a valid JSON object'
          }, 400);
        }

        let rawCandidates = [];
        if (Array.isArray(body.keywords)) {
          rawCandidates = body.keywords;
        } else if (typeof body.keywords === 'string') {
          rawCandidates = body.keywords.split('\n');
        } else {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'keywords field must be an array or multiline string'
          }, 400);
        }

        // Batch Volume Ceiling: Max 1,000 items
        if (rawCandidates.length > 1000) {
          return jsonResponse({
            success: false,
            error: 'PAYLOAD_TOO_LARGE',
            message: `Batch contains ${rawCandidates.length} items. Maximum allowed is 1,000 keywords per request.`
          }, 413);
        }

        // Type poisoning, malicious HTML, script tags & control chars filtering
        const validKeywords = [];
        for (const item of rawCandidates) {
          if (typeof item !== 'string' && typeof item !== 'number') continue;
          const str = String(item).trim();
          if (str.length < 2 || str.length > 100) continue;
          if (/<[a-z][\s\S]*>/i.test(str)) continue; // Reject HTML/script tags
          if (/[\x00-\x1F\x7F]/.test(str)) continue; // Reject control characters
          validKeywords.push(str.toLowerCase());
        }

        if (validKeywords.length === 0) {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'No valid keywords provided. Each keyword must be a string between 2 and 100 characters.'
          }, 400);
        }

        invalidateEdgeCache('keywords');
        const folderId = body.folder_id ? Number(body.folder_id) : null;
        const category = body.category || 'General';
        const uniqueValidKeywords = [...new Set(validKeywords)];
        const imported = await sql`
          INSERT INTO tracked_keywords (
            keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active, updated_at
          )
          SELECT
            u.kw, ${category}, 50, 2, 'full_catalog', TRUE, NOW()
          FROM UNNEST(${uniqueValidKeywords}::text[]) AS u(kw)
          ON CONFLICT (keyword) DO UPDATE SET
            target_pin_count = COALESCE(tracked_keywords.target_pin_count, 50),
            crawl_pages_limit = COALESCE(tracked_keywords.crawl_pages_limit, 2),
            inspection_mode = 'full_catalog',
            updated_at = NOW(),
            is_active = TRUE
          RETURNING id, keyword, category;
        `.catch(err => {
          console.warn('[bulk-import] Database insert error:', redactSecrets(err?.message || 'DB error'));
          return [];
        });

        if (folderId && Array.isArray(imported) && imported.length > 0) {
          const importedIds = imported.map(r => Number(r.id)).filter(Boolean);
          if (importedIds.length > 0) {
            await batchAddKeywordsToFolder(sql, folderId, importedIds).catch(() => {});
          }
        }

        const safeImported = Array.isArray(imported) ? imported : [];
        return jsonResponse({
          success: true,
          added: safeImported.length,
          count: safeImported.length,
          total_submitted: rawCandidates.length,
          folder_id: folderId,
          keywords: safeImported
        });
      }

      // Level 4: Raw Visual Annotations Crossover API (/api/folders/:id/raw-visual-crossover)
      if (
        (pathname.startsWith('/api/folders/') && (pathname.endsWith('/raw-visual-crossover') || pathname.endsWith('/crossover'))) ||
        (pathname.startsWith('/api/keywords/folders/') && (pathname.endsWith('/raw-visual-crossover') || pathname.endsWith('/crossover')))
      ) {
        if (method !== 'GET') {
          return methodNotAllowedResponse('GET, OPTIONS');
        }
        const parts = pathname.split('/').filter(Boolean);
        const folderId = parts[2] === 'folders' ? parts[3] : parts[2];
        if (!folderId || isNaN(Number(folderId))) {
          return jsonResponse({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Valid numeric folder_id is required'
          }, 400);
        }
        const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
        const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh });
        return jsonResponse({ success: true, crossover }, 200, refresh ? 0 : 30);
      }

      // 16.4 Dedicated Folder Cluster Fleet Audit Dispatch API (Unified Aliases: /api/folders, /api/campaign-folders, /api/keywords/folders)
      const folderAuditMatch = method === 'POST' && pathname.match(/^\/api\/(?:folders|campaign-folders|keywords\/folders)\/(\d+)\/dispatch-audit$/);
      if (folderAuditMatch) {
        const folderId = folderAuditMatch[1];
        const [folderRow] = await targetSql`SELECT id, name, metadata FROM keyword_folders WHERE id = ${Number(folderId)} LIMIT 1;`;
        if (!folderRow) {
          return jsonResponse({ success: false, error: `Folder ${folderId} not found` }, 404);
        }
        const body = await request.json().catch(() => ({}));
        const folderMeta = normalizeFolderMetadata(folderRow?.metadata);
        const crawlScopeInput = String(body.crawl_scope || folderMeta.crawl_scope || 'all_pins');
        const maxPinsInput = String(body.max_pins || folderMeta.max_pins || '50');
        const maxSerpPinsInput = String(body.max_serp_pins || body.max_pins || folderMeta.max_serp_pins || '50');
        const maxCatalogInspectInput = String(body.max_catalog_inspect || folderMeta.max_catalog_inspect || '0');
        const enableSerpHarvestInput = String(body.enable_serp_harvest ?? folderMeta.enable_serp_harvest ?? 'true');

        const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
        if (!token) {
          return jsonResponse({ success: false, error: 'GitHub Token secret not configured. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret in settings.' }, 400);
        }
        const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
        let dispatchRes;
        try {
          dispatchRes = await fetch(workflowUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': authHeader,
              'User-Agent': 'Pin-Arbitrage-Engine'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                target_keyword: '',
                folder_id: String(folderId),
                crawl_scope: crawlScopeInput,
                max_pins: maxPinsInput,
                max_serp_pins: maxSerpPinsInput,
                max_catalog_inspect: maxCatalogInspectInput,
                enable_serp_harvest: enableSerpHarvestInput
              }
            })
          });
          if (!dispatchRes.ok) {
            const errText = await dispatchRes.text();
            let errDetail = errText;
            if (dispatchRes.status === 401) {
              errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare/Koyeb has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
            }
            return jsonResponse({ success: false, error: `GitHub API error (${dispatchRes.status}): ${errDetail}` }, dispatchRes.status);
          }
          return jsonResponse({ 
            success: true, 
            folder_id: Number(folderId),
            folder_name: folderRow.name,
            message: `20-Runner Parallel Fleet Audit dispatched successfully for folder "${folderRow.name}"!` 
          });
        } finally {
          if (dispatchRes?.body && !dispatchRes.bodyUsed) {
            await dispatchRes.body.cancel().catch(() => {});
          }
        }
      }

      // Aliased Campaign Folders CRUD API (/api/folders and /api/campaign-folders)
      const isFoldersRoute = (
        pathname === '/api/folders' || pathname.startsWith('/api/folders/') ||
        pathname === '/api/campaign-folders' || pathname.startsWith('/api/campaign-folders/')
      ) && !pathname.includes('crossover') && !pathname.includes('dispatch-audit');

      if (isFoldersRoute) {
        const basePrefix = pathname.startsWith('/api/campaign-folders') ? '/api/campaign-folders' : '/api/folders';
        const parts = pathname.slice(basePrefix.length).split('/').filter(Boolean);
        const folderId = parts[0] ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));

        if (method === 'GET') {
          if (folderId) {
            // Check D1 edge database first (sub-5ms reads)
            if (env?.PIN_D1_DB) {
              try {
                const d1Folder = await env.PIN_D1_DB.prepare(
                  "SELECT id, name, color, description, item_count, updated_at FROM edge_campaign_folders WHERE id = ?"
                ).bind(String(folderId)).first();
                if (d1Folder) {
                  return jsonResponse({ success: true, folder: d1Folder, source: 'd1_edge' }, 200, 15);
                }
              } catch (_) {}
            }
            const folder = await getFolder(sql, folderId);
            if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
            safeWaitUntil(ctx, syncFolderToD1(env, folder), 'syncFolderToD1');
            return jsonResponse({ success: true, folder }, 200, 15);
          }
          // Try D1 edge folders listing
          if (env?.PIN_D1_DB) {
            try {
              const d1Folders = await env.PIN_D1_DB.prepare(
                "SELECT id, name, color, description, item_count, updated_at FROM edge_campaign_folders ORDER BY updated_at DESC"
              ).all();
              if (d1Folders?.results?.length > 0) {
                return jsonResponse({ success: true, folders: d1Folders.results, source: 'd1_edge' }, 200, 10);
              }
            } catch (_) {}
          }
          let folders = [];
          let foldersDegraded = false;
          try {
            folders = await listFolders(sql, {
              projectId: searchParams.get('project_id') || 'default'
            });
          } catch (err) {
            console.warn('[Folders Fallback] listFolders failed:', err.message);
            folders = [];
            foldersDegraded = true;
          }
          if (Array.isArray(folders) && folders.length > 0) {
            safeWaitUntil(ctx, Promise.all(folders.map(f => syncFolderToD1(env, f))), 'syncAllFoldersToD1');
          }
          return jsonResponse({
            success: true,
            folders: Array.isArray(folders) ? folders : [],
            ...(foldersDegraded ? { degraded: true } : {})
          }, 200, foldersDegraded ? 0 : 10);
        }

        if (method === 'POST' && parts.length === 0) {
          const body = await request.json().catch(() => ({}));
          if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
            return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
          }
          const created = await createFolder(sql, body);
          safeWaitUntil(ctx, syncFolderToD1(env, created), 'syncFolderToD1');
          return jsonResponse({ success: true, folder: created });
        }

        if ((method === 'PUT' || method === 'PATCH') && folderId) {
          const body = await request.json().catch(() => ({}));
          if (body.status && !['active', 'archived', 'paused', 'completed'].includes(String(body.status).toLowerCase())) {
            return jsonResponse({ success: false, error: 'Invalid folder status. Allowed values: active, archived, paused, completed' }, 400);
          }
          const updated = await updateFolder(sql, folderId, body);
          safeWaitUntil(ctx, syncFolderToD1(env, updated), 'syncFolderToD1');
          return jsonResponse({ success: true, folder: updated });
        }

        if (method === 'DELETE' && folderId) {
          const deleted = await deleteFolder(sql, folderId);
          safeWaitUntil(ctx, deleteFolderFromD1(env, folderId), 'deleteFolderFromD1');
          return jsonResponse({ success: true, deleted });
        }
      }

      if (method === 'GET' && pathname === '/api/keywords/trends/popular-pins') {
        const term = searchParams.get('term') || searchParams.get('q') || searchParams.get('keyword') || '';
        const country = searchParams.get('country') || 'US';
        const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
        if (!term) return jsonResponse({ error: 'term is required' }, 400);
        const result = await fetchPinterestTrendsPopularPins(targetSql, term, country, force);
        return jsonResponse(result, result.success ? 200 : 400);
      }

      if (method === 'POST' && pathname === '/api/keywords/dispatch-workflow') {
        const body = await request.json().catch(() => ({}));
        const targetKw = body.target_keyword || body.keyword || '';
        const folderIdInput = body.folder_id ? String(body.folder_id).trim() : '';
        const maxPinsInput = String(body.max_pins || '50');
        const maxSerpPinsInput = String(body.max_serp_pins || body.max_pins || maxPinsInput);
        const maxCatalogInspectInput = String(body.max_catalog_inspect || '0');
        const enableSerpHarvestInput = String(body.enable_serp_harvest ?? 'true');
        const crawlScopeInput = String(body.crawl_scope || 'all_pins');
        const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT || env?.GH_TOKEN || env?.GH_REFRESH_TOKEN)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN || process.env?.GH_REFRESH_TOKEN) : null);
        if (!token) {
          return jsonResponse({ success: false, error: 'GitHub Token secret not configured. Please add GITHUB_TOKEN or GH_REFRESH_TOKEN secret in settings.' }, 400);
        }
        const cleanToken = String(token).replace(/^(token|Bearer)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        const authHeader = cleanToken.startsWith('ghp_') ? `token ${cleanToken}` : `Bearer ${cleanToken}`;
        const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
        let dispatchRes;
        try {
          dispatchRes = await fetch(workflowUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': authHeader,
              'User-Agent': 'Pin-Arbitrage-Engine'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                target_keyword: targetKw,
                folder_id: folderIdInput,
                crawl_scope: crawlScopeInput,
                max_pins: maxPinsInput,
                max_serp_pins: maxSerpPinsInput,
                max_catalog_inspect: maxCatalogInspectInput,
                enable_serp_harvest: enableSerpHarvestInput
              }
            })
          });
          if (!dispatchRes.ok) {
            const errText = await dispatchRes.text();
            let errDetail = errText;
            if (dispatchRes.status === 401) {
              errDetail = 'GitHub Token rejected (401 Bad credentials). Ensure your token in Cloudflare/Koyeb has both "repo" and "workflow" scopes enabled at https://github.com/settings/tokens';
            }
            return jsonResponse({ success: false, error: `GitHub API error (${dispatchRes.status}): ${errDetail}` }, dispatchRes.status);
          }
          return jsonResponse({ success: true, message: 'Workflow dispatched successfully' });
        } finally {
          if (dispatchRes?.body && !dispatchRes.bodyUsed) {
            await dispatchRes.body.cancel().catch(() => {});
          }
        }
      }

      // 16.5 Keyword Folders & Algorithmic Crossover Matrix API
      if (method === 'GET' && pathname === '/api/keywords/folders') {
        const folderId = searchParams.get('id') || searchParams.get('folder_id');
        if (folderId) {
          if (env?.PIN_D1_DB) {
            try {
              const d1Folder = await env.PIN_D1_DB.prepare(
                "SELECT id, name, color, description, item_count, updated_at FROM edge_campaign_folders WHERE id = ?"
              ).bind(String(folderId)).first();
              if (d1Folder) {
                return jsonResponse({ success: true, folder: d1Folder, source: 'd1_edge' });
              }
            } catch (_) {}
          }
          const folder = await getFolder(sql, folderId);
          if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
          safeWaitUntil(ctx, syncFolderToD1(env, folder), 'syncFolderToD1');
          return jsonResponse({ success: true, folder });
        }
        if (env?.PIN_D1_DB) {
          try {
            const d1Folders = await env.PIN_D1_DB.prepare(
              "SELECT id, name, color, description, item_count, updated_at FROM edge_campaign_folders ORDER BY updated_at DESC"
            ).all();
            if (d1Folders?.results?.length > 0) {
              return jsonResponse({ success: true, folders: d1Folders.results, source: 'd1_edge' });
            }
          } catch (_) {}
        }
        const folders = await listFolders(sql, {
          projectId: searchParams.get('project_id') || 'default'
        });
        if (Array.isArray(folders) && folders.length > 0) {
          safeWaitUntil(ctx, Promise.all(folders.map(f => syncFolderToD1(env, f))), 'syncAllFoldersToD1');
        }
        return jsonResponse({ success: true, folders }, 200, 8);
      }

      if (method === 'POST' && pathname === '/api/keywords/folders') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('folders');
        const body = await request.json().catch(() => ({}));
        const created = await createFolder(sql, body);
        safeWaitUntil(ctx, syncFolderToD1(env, created), 'syncFolderToD1');
        return jsonResponse({ success: true, folder: created });
      }

      if ((method === 'PUT' || method === 'PATCH') && pathname === '/api/keywords/folders') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('folders');
        const body = await request.json().catch(() => ({}));
        const folderId = body.id || searchParams.get('id');
        if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
        const updated = await updateFolder(sql, folderId, body);
        safeWaitUntil(ctx, syncFolderToD1(env, updated), 'syncFolderToD1');
        return jsonResponse({ success: true, folder: updated });
      }

      if (method === 'DELETE' && pathname === '/api/keywords/folders') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('folders');
        let folderId = searchParams.get('id') || searchParams.get('folder_id');
        if (!folderId) {
          try {
            const body = await request.json();
            folderId = body.id || body.folder_id;
          } catch (_) {}
        }
        if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
        const deleted = await deleteFolder(sql, folderId);
        safeWaitUntil(ctx, deleteFolderFromD1(env, folderId), 'deleteFolderFromD1');
        return jsonResponse({ success: true, deleted });
      }

      if (method === 'POST' && pathname === '/api/keywords/folders/items') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('folders');
        const body = await request.json().catch(() => ({}));
        const folderId = body.folder_id || searchParams.get('folder_id');
        if (!folderId) return jsonResponse({ error: 'folder_id is required' }, 400);
        
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, folderId, body.keyword_ids);
          safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
          return jsonResponse({ success: true, ...result });
        }
        
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id or keyword_ids is required' }, 400);
        const item = await addKeywordToFolder(sql, folderId, keywordId, body.notes || '');
        safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
        return jsonResponse({ success: true, item });
      }

      if (method === 'DELETE' && pathname === '/api/keywords/folders/items') {
        invalidateEdgeCache('keywords');
        invalidateEdgeCache('folders');
        let folderId = searchParams.get('folder_id');
        let keywordId = searchParams.get('keyword_id');
        if (!folderId || !keywordId) {
          try {
            const body = await request.json();
            folderId = folderId || body.folder_id;
            keywordId = keywordId || body.keyword_id;
          } catch (_) {}
        }
        if (!folderId || !keywordId) return jsonResponse({ error: 'folder_id and keyword_id are required' }, 400);
        const deleted = await removeKeywordFromFolder(sql, folderId, keywordId);
        safeWaitUntil(ctx, getFolder(sql, folderId).then(f => f && syncFolderToD1(env, f)), 'syncFolderItemCount');
        return jsonResponse({ success: true, deleted });
      }

      if (method === 'GET' && pathname === '/api/keywords/folders/by-keyword') {
        const keywordId = searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const folders = await getFoldersForKeyword(sql, keywordId);
        return jsonResponse({ success: true, folders });
      }

      if (method === 'GET' && pathname === '/api/keywords/folders/crossover') {
        const folderId = searchParams.get('folder_id') || searchParams.get('id');
        if (!folderId) return jsonResponse({ error: 'folder_id is required' }, 400);
        const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';
        const crossover = await calculateFolderCrossover(sql, folderId, { refresh });
        return jsonResponse({ success: true, crossover });
      }

      // 17. Neon Multi-Project Fleet API & Shards Map (KV Accelerated)
      if (method === 'GET' && (pathname === '/api/fleet/projects' || pathname === '/api/fleet/shards')) {
        let projects = null;
        if (env?.PIN_ENGINE_KV) {
          try {
            projects = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
          } catch (_) {}
        }
        if (!projects || !Array.isArray(projects) || projects.length === 0) {
          const cacheKey = 'fleet_projects';
          projects = await getCachedOrFetch(cacheKey, () => getFleetProjects(sql), 10000, 30000);
          if (env?.PIN_ENGINE_KV && Array.isArray(projects) && projects.length > 0) {
            safeWaitUntil(ctx, env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(projects), { expirationTtl: 86400 }), 'kv_cache_shards_map');
          }
        }

        // Security: Mask database credentials before transmitting to client
        const clientProjects = (Array.isArray(projects) ? projects : []).map(p => {
          const masked = maskDatabaseUrl(p.database_url || '');
          return {
            ...p,
            database_url: masked,
            masked_url: masked
          };
        });

        return jsonResponse({
          success: true,
          projects: clientProjects,
          shards: clientProjects,
          source: env?.PIN_ENGINE_KV ? 'kv_edge' : 'neon_hub'
        }, 200, 10);
      }

      if (method === 'POST' && pathname === '/api/fleet/projects') {
        invalidateEdgeCache('fleet_projects');
        if (env?.PIN_ENGINE_KV) safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_shards_map');
        const body = await request.json().catch(() => ({}));
        const row = await registerNewProject(sql, body);
        return jsonResponse({ success: true, project: row });
      }

      if (method === 'POST' && pathname === '/api/fleet/sync') {
        invalidateEdgeCache('fleet_projects');
        if (env?.PIN_ENGINE_KV) safeWaitUntil(ctx, env.PIN_ENGINE_KV.delete('fleet:shards_map'), 'kv_evict_shards_map');
        const body = await request.json().catch(() => ({}));
        const targetProj = body?.project_id || searchParams.get('project_id');
        const syncRes = await syncFleetDatabases(sql, { targetProjectId: targetProj });
        return jsonResponse(syncRes);
      }

      if (method === 'POST' && pathname === '/api/fleet/ping') {
        const body = await request.json().catch(() => ({}));
        const projId = body?.project_id || searchParams.get('project_id');
        try {
          const pingRes = await pingFleetProject(sql, projId);
          return jsonResponse({ success: true, ...pingRes });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if ((method === 'GET' || method === 'POST') && pathname === '/api/fleet/url') {
        const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
        const projId = body?.project_id || searchParams.get('project_id') || searchParams.get('id');
        try {
          const urlRes = await getFleetProjectUrl(sql, projId);
          return jsonResponse({ success: true, ...urlRes });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      // 18. PinArchive & Topic Clusters API
      if (method === 'GET' && pathname === '/api/pinarchive/overview') {
        const shardKey = reqProjectId || 'hub';
        const cacheKey = buildCanonicalCacheKey(`pinarchive:overview:${shardKey}`, {});
        try {
          const overview = await getCachedOrFetch(cacheKey, async () => {
            return await getPinArchiveOverview(targetSql);
          }, 15000, 60000);
          return jsonResponse({ success: true, overview }, 200, 15);
        } catch (err) {
          console.error('[PinArchive Overview Error]', err.message);
          return jsonResponse({ success: true, degraded: true, overview: { total_pins: 0, high_velocity_pins: 0, dormant_pins: 0, cooling_pins: 0, mature_pins: 0, growing_pins: 0 } }, 200, 0);
        }
      }

      if (method === 'GET' && pathname === '/api/pinarchive/rules') {
        try {
          const rules = await getQualificationRules(targetSql);
          return jsonResponse({ success: true, rules });
        } catch (err) {
          console.error('[PinArchive Rules Error]', err.message);
          return jsonResponse({ success: true, degraded: true, rules: {} }, 200, 0);
        }
      }

      if (method === 'POST' && pathname === '/api/pinarchive/rules') {
        invalidateEdgeCache('pinarchive');
        invalidateEdgeCache('topics');
        const body = await request.json().catch(() => ({}));
        const rules = await updateQualificationRules(targetSql, body);
        return jsonResponse({ success: true, rules });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
        invalidateEdgeCache('pinarchive');
        invalidateEdgeCache('topics');
        const body = await request.json().catch(() => ({}));
        const account = searchParams.get('account') || searchParams.get('username') || body.account_username || null;
        const hasRuleOverride = Boolean(body && (
          body.tier1_min_saves !== undefined ||
          body.tier2_min_repins !== undefined ||
          body.tier3_max_age_days !== undefined ||
          body.tier3_min_saves !== undefined ||
          body.master_ingest_enabled !== undefined ||
          (body.rules && typeof body.rules === 'object')
        ));
        const rulesPayload = hasRuleOverride ? (body.rules || body) : null;
        const audit = await reEvaluateArchivedPins(targetSql, rulesPayload, account);
        return jsonResponse({ success: true, ...audit });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/topics') {
        const shardKey = reqProjectId || 'hub';
        const minPins = Number(searchParams.get('min_pins') || 1);
        const search = searchParams.get('search') || '';
        const account = searchParams.get('account') || '';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

        const cacheKey = buildCanonicalCacheKey(`topics:${shardKey}`, {
          minPins,
          search,
          account,
          limit,
          offset
        });

        try {
          const topics = await getCachedOrFetch(cacheKey, async () => {
            return await getTopicClusters(targetSql, { minPins, search, account, limit, offset });
          }, 8000, 30000);
          return jsonResponse({ success: true, topics: Array.isArray(topics) ? topics : [] }, 200, 8);
        } catch (err) {
          console.error('[Topics Error]', err.message);
          return jsonResponse({ success: true, degraded: true, topics: [] }, 200, 0);
        }
      }

      if (method === 'GET' && pathname === '/api/pinarchive/pins') {
        const search = searchParams.get('search') || '';
        const topic = searchParams.get('topic') || '';
        const board = searchParams.get('board') || '';
        const stage = searchParams.get('stage') || '';
        const account = searchParams.get('account') || searchParams.get('username') || '';
        const minSaves = Number(searchParams.get('min_saves') || 0);
        const maxSaves = searchParams.get('max_saves') ? Number(searchParams.get('max_saves')) : null;
        const timeframe = searchParams.get('timeframe') || '24h';
        const changedOnly = searchParams.get('changed_only') === 'true' || searchParams.get('changed_only') === '1';
        const sortBy = searchParams.get('sort') || searchParams.get('sort_by') || 'saves';
        const order = searchParams.get('order') || 'desc';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

        const shardKey = reqProjectId || 'hub';
        const cacheKey = buildCanonicalCacheKey(`pinarchive:pins:${shardKey}`, {
          search,
          topic,
          board,
          stage,
          account,
          min_saves: minSaves,
          max_saves: maxSaves ?? '',
          timeframe,
          changed_only: changedOnly,
          sort: sortBy,
          order,
          limit,
          offset
        });

        const data = await getCachedOrFetch(cacheKey, async () => {
          const pins = await listArchivedPins(targetSql, { search, topic, board, stage, account, minSaves, maxSaves, timeframe, changedOnly, sortBy, order, limit, offset });
          return { success: true, pins, total: pins.total ?? pins.length };
        }, 10000, 30000);

        return jsonResponse(data, 200, 10);
      }

      if (method === 'GET' && pathname === '/api/pinarchive/pin-detail') {
        const pinId = searchParams.get('pin_id') || searchParams.get('id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const refresh = searchParams.get('refresh') === 'true';
        const detail = await getPinDetailWithMetrics(targetSql, pinId, { refresh });
        if (!detail) return jsonResponse({ error: 'Pin not found' }, 404);
        return jsonResponse({ success: true, ...detail }, 200, refresh ? 0 : 60);
      }

      if (method === 'DELETE' && pathname === '/api/pinarchive/pin-snapshot') {
        invalidateEdgeCache('pinarchive');
        const body = await request.json().catch(() => ({}));
        const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
        const pinId = searchParams.get('pin_id') || body.pin_id;
        if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
        const result = await deletePinMetricSnapshot(targetSql, snapshotId, pinId);
        return jsonResponse(result);
      }

      // Domain Intelligence & SERP Monopoly API
      if (method === 'GET' && pathname === '/api/domains') {
        try {
          const cacheParams = {
            search: searchParams.get('search') || '',
            folderId: searchParams.get('folder_id') || '',
            keywordId: searchParams.get('keyword_id') || '',
            pillar: searchParams.get('pillar') || 'all',
            preset: searchParams.get('preset') || 'all',
            adNetwork: searchParams.get('ad_network') || 'all',
            ageFilter: searchParams.get('age_filter') || 'all',
            rankFilter: searchParams.get('rank_filter') || 'all',
            savesFilter: searchParams.get('saves_filter') || 'all',
            sizeFilter: searchParams.get('size_filter') || 'all',
            logicMode: searchParams.get('logic_mode') || 'and',
            excludeMarketplaces: searchParams.get('exclude_marketplaces') !== 'false',
            minPins: Number(searchParams.get('min_pins') || 1),
            sortBy: searchParams.get('sort') || 'visibility',
            page: Number(searchParams.get('page') || 1),
            limit: clampLimit(searchParams.get('limit'), 50, 200)
          };
          const cacheKey = buildCanonicalCacheKey('domains:leaderboard', cacheParams);
          const data = await getCachedOrFetch(cacheKey, async () => {
            return await listDomainsIntelligenceFast(sql, cacheParams);
          }, 15000, 60000);

          // Non-blocking background WHOIS/Age enrichment for unchecked domains on current page
          if (Array.isArray(data?.missing_age_domains) && data.missing_age_domains.length > 0) {
            safeWaitUntil(
              ctx,
              enrichMissingDomainsBatch(sql, data.missing_age_domains, 6).then(() => invalidateEdgeCache('domains:leaderboard')),
              'bg_enrich_domain_ages'
            );
          }

          // Non-blocking background Ad Network enrichment for unchecked domains on current page
          if (Array.isArray(data?.missing_ad_domains) && data.missing_ad_domains.length > 0) {
            safeWaitUntil(
              ctx,
              enrichMissingAdNetworksBatch(sql, data.missing_ad_domains, 6).then(() => invalidateEdgeCache('domains:leaderboard')),
              'bg_enrich_domain_ads'
            );
          }

          return jsonResponse({ success: true, ...data }, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/domains/dossier') {
        const domain = searchParams.get('domain');
        if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
        try {
          const folderId = searchParams.get('folder_id') || null;
          const keywordId = searchParams.get('keyword_id') || null;
          const dossier = await getDomainDeepDossier(sql, domain, { folderId, keywordId });
          return jsonResponse(dossier, 200, 30);
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 400);
        }
      }

      if (method === 'GET' && pathname === '/api/domains/blueprint') {
        const domain = searchParams.get('domain');
        if (!domain) return jsonResponse({ error: 'domain query parameter is required' }, 400);
        try {
          const blueprint = await generateDomainArbitrageBlueprint(sql, domain);
          return jsonResponse(blueprint, 200, 30);
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 400);
        }
      }

      if (method === 'POST' && pathname === '/api/domains/enrich-age') {
        invalidateEdgeCache('domains:leaderboard');
        try {
          const body = await request.json().catch(() => ({}));
          if (Array.isArray(body.domains) && body.domains.length > 0) {
            const batchLimit = Math.max(1, Math.min(Number(body.limit) || 50, 50));
            const batchRes = await enrichMissingDomainsBatch(sql, body.domains, batchLimit, { forceRefresh: Boolean(body.force) });
            return jsonResponse({ success: true, ...batchRes });
          }
          const singleDomain = body.domain || searchParams.get('domain');
          if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
          const clean = normalizeCleanDomain(singleDomain);
          if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
          const ageData = await fetchAndCacheDomainAge(sql, clean, { forceRefresh: Boolean(body.force) });
          return jsonResponse({ success: true, age_info: ageData });
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/domains/enrich-ads') {
        invalidateEdgeCache('domains:leaderboard');
        try {
          const body = await request.json().catch(() => ({}));
          if (Array.isArray(body.domains) && body.domains.length > 0) {
            const batchLimit = Math.max(1, Math.min(Number(body.limit) || 20, 50));
            const batchRes = await enrichMissingAdNetworksBatch(sql, body.domains, batchLimit, { forceRefresh: Boolean(body.force) });
            return jsonResponse({ success: true, ...batchRes });
          }
          const singleDomain = body.domain || searchParams.get('domain');
          if (!singleDomain) return jsonResponse({ error: 'domain or domains[] is required' }, 400);
          const clean = normalizeCleanDomain(singleDomain);
          if (!clean) return jsonResponse({ success: false, error: 'Invalid domain format' }, 400);
          const adData = await fetchAndCacheDomainAdNetwork(sql, clean, { forceRefresh: Boolean(body.force) });
          return jsonResponse({ success: true, ad_info: adData });
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/domains/ads-status') {
        try {
          const stats = await getDatabaseMonetizationStats(sql);
          return jsonResponse({ success: true, stats }, 200, 5);
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/domains/enrich-status') {
        try {
          const stats = await getDatabaseEnrichmentStats(sql);
          return jsonResponse({ success: true, stats }, 200, 5);
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/domains/enrich-all') {
        invalidateEdgeCache('domains:leaderboard');
        try {
          const body = await request.json().catch(() => ({}));
          const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 20, 50));
          const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 3, 5));
          const forceRefresh = Boolean(body.force);
          const result = await enrichNextUncheckedBatch(sql, { batchSize, concurrency, forceRefresh });
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/domains/enrich-ads-all') {
        invalidateEdgeCache('domains:leaderboard');
        try {
          const body = await request.json().catch(() => ({}));
          const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 15, 50));
          const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 2, 4));
          const forceRefresh = Boolean(body.force);
          const result = await enrichNextUncheckedAdsBatch(sql, { batchSize, concurrency, forceRefresh });
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: redactSecrets(err.message) }, 500);
        }
      }

      // 19. Fleet Keep-Alive & Shard Pre-Warming Ping API
      if (pathname === '/api/fleet/keep-alive') {
        if (method !== 'POST' && method !== 'GET') {
          return methodNotAllowedResponse('GET, POST, OPTIONS');
        }

        let shardIdsToPing = [];
        if (method === 'POST') {
          const body = await request.json().catch(() => ({}));
          if (Array.isArray(body.shards)) {
            shardIdsToPing = body.shards.map(s => Number(s)).filter(s => s >= 1 && s <= 99);
          }
        }
        const qShard = searchParams.get('shard') || searchParams.get('shard_id');
        if (qShard && !isNaN(Number(qShard))) {
          shardIdsToPing.push(Number(qShard));
        }

        if (shardIdsToPing.length > 0) {
          const uniqueShards = Array.from(new Set(shardIdsToPing)).slice(0, 10);
          safeWaitUntil(ctx, Promise.allSettled(uniqueShards.map(async (sid) => {
            try {
              const shardSql = await resolveShardConnection({ hubSql: sql, shardId: sid });
              await shardSql`SELECT 1;`;
            } catch (_) {}
          })), 'fleet_keep_alive_shards');
        }

        return jsonResponse({
          success: true,
          alive: true,
          timestamp: Date.now(),
          shards_pinged: shardIdsToPing.length
        }, 200, 0);
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
        const pendingBg = Array.isArray(store.bgPromises) ? store.bgPromises : [];
        const closePromise = (pendingBg.length > 0 ? Promise.allSettled(pendingBg) : Promise.resolve())
          .then(() => hyperdriveClient.end({ timeout: 5 }).catch(() => {}));
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