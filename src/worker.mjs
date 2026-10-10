/**
 * Pinterest Algorithmic Arbitrage Engine
 * Cloudflare Worker Edge Entrypoint
 *
 * Runs on Cloudflare Workers edge runtime with Neon Serverless Postgres
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { neon } from '@neondatabase/serverless';
import { getDashboardHtml } from './dashboard-ui.mjs';
import { getKeywordsPageHtml } from './keywords-ui.mjs';
import { getBoardIdeasPageHtml } from './board-ideas-ui.mjs';
import { getDiscoveryPageHtml } from './discovery-ui.mjs';
import { getPinDetailPageHtml } from './pin-details-ui.mjs';
import { getCampaignFoldersPageHtml } from './campaign-folders-ui.mjs';
import {
  fetchUniversalPinDossier,
  getPinShardId,
  resolveShardConnection
} from './modules/sharding/fleet-router.mjs';
import { fetchPinFromPinterest } from '../scripts/lib/pinterest.mjs';

// Reserved Keyword Slugs (Defends against route swallowing on /keywords/:slug)
export const RESERVED_KEYWORD_SLUGS = new Set([
  'discovery', 'folders', 'export', 'sync', 'batch', 'api', 'add', 'manage', 'import'
]);
import {
  resolveBoardIdentity,
  syncBoardIdeas,
  getBoardIdeasComparison,
  listAvailableBoards,
  deleteTrackedBoard
} from './modules/boards/service.mjs';
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
  getPinDeepDossier
} from './modules/keywords/service.mjs';
import { fetchPinterestTrends, fetchPinterestTrendsPopularPins } from './modules/keywords/trends-service.mjs';
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
  calculateFolderCrossover
} from './modules/keywords/folders-service.mjs';
import { getFleetProjects, registerNewProject, syncFleetDatabases, syncCompetitorAcrossFleet, pingFleetProject, getFleetProjectUrl } from './modules/fleet/service.mjs';
import {
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  stagePinsForRepurpose,
  listStagedPins,
  claimStagedPinCas,
  cancelStagedPin,
  getQualificationRules,
  updateQualificationRules,
  reEvaluateArchivedPins,
  getPinDetailWithMetrics,
  deletePinMetricSnapshot
} from './modules/pinarchive/service.mjs';

// Zero-Trust Security & Credential Redaction Sanitizer
export function redactSecrets(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]{12,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]')
    .replace(/(github_pat_[A-Za-z0-9_]{20,})/gi, '[REDACTED_GH_PAT]')
    .replace(/([?&](?:password|token|secret|apiKey)=)[^&]+/gi, '$1[REDACTED]')
    .replace(/ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.aws\.neon\.tech/gi, '[REDACTED_NEON_HOST]');
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

// Bounded Background Task Execution Guard for Cloudflare Worker Isolate Lifecycle
export function safeWaitUntil(ctx, promise, taskName = 'bg_task', timeoutMs = 25000) {
  if (!promise || typeof promise.then !== 'function') return;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Background task "${taskName}" timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  const guardedPromise = Promise.race([promise, timeoutPromise])
    .catch(err => {
      console.error(`[safeWaitUntil] Error in background task "${taskName}":`, redactSecrets(err.message));
    })
    .finally(() => {
      clearTimeout(timer);
    });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(guardedPromise);
  }
}

export function clampLimit(val, fallback = 50, max = 1000) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return fallback;
  return Math.min(n, max);
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
  // Fail-Closed Security Policy: Mutating endpoints strictly require configured secret
  if (!secretKey) return { authorized: false, reason: 'API_SECRET_NOT_CONFIGURED' };

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

export const requestContextStorage = new AsyncLocalStorage();
let currentDefaultOrigin = '*';
export function setDefaultCorsOrigin(origin) {
  currentDefaultOrigin = origin || '*';
}

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
  const resolvedOrigin = customCors?.['Access-Control-Allow-Origin'] || store?.origin || currentDefaultOrigin;

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
  return new Response(JSON.stringify({
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `HTTP method not allowed. Allowed methods: ${allow}`
  }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Allow': allow,
      'Access-Control-Allow-Origin': customCors?.['Access-Control-Allow-Origin'] || '*',
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
  'Cache-Control': 'no-cache',
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
    shardSqlCache.set(key, client);
    return;
  }
  if (shardSqlCache.size >= 128) {
    const oldestKey = shardSqlCache.keys().next().value;
    if (oldestKey) shardSqlCache.delete(oldestKey);
  }
  shardSqlCache.set(key, client);
}

function getCachedShardSql(key, factory) {
  if (shardSqlCache.has(key)) return shardSqlCache.get(key);
  const client = factory();
  setCachedShardSql(key, client);
  return client;
}

// Edge Data Cache & Single-Flight Request Coalescing (Anti-Thundering Herd & SWR)
export const edgeCache = new Map();
export const inflightPromises = new Map();
const MAX_CACHE_ENTRIES = 512;

export function buildCanonicalCacheKey(prefix, params = {}) {
  const sortedEntries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim().toLowerCase())}`);
  return `${prefix}?${sortedEntries.join('&')}`;
}

export async function getCachedOrFetch(key, fetcher, ttlMs = 15000, staleMs = 60000) {
  const now = Date.now();
  const cached = edgeCache.get(key);

  if (cached) {
    if (now < cached.expiresAt) {
      return cached.data;
    }
    // Stale-While-Revalidate: return stale data immediately, revalidate in background
    if (now < cached.staleUntil) {
      if (!inflightPromises.has(key)) {
        const revalPromise = (async () => {
          try {
            const fresh = await Promise.race([
              fetcher(),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout revalidating ${key}`)), 7500))
            ]);
            edgeCache.set(key, {
              data: fresh,
              expiresAt: Date.now() + ttlMs,
              staleUntil: Date.now() + ttlMs + staleMs
            });
          } catch (_) {} finally {
            inflightPromises.delete(key);
          }
        })();
        inflightPromises.set(key, revalPromise);
      }
      return cached.data;
    }
  }

  // Cache miss or expired beyond stale window: Single-flight coalescing
  if (inflightPromises.has(key)) {
    return await inflightPromises.get(key);
  }

  const promise = (async () => {
    try {
      const fresh = await Promise.race([
        fetcher(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching ${key}`)), 7500))
      ]);
      if (edgeCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = edgeCache.keys().next().value;
        if (oldestKey) edgeCache.delete(oldestKey);
      }
      edgeCache.set(key, {
        data: fresh,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs + staleMs
      });
      return fresh;
    } finally {
      inflightPromises.delete(key);
    }
  })();

  inflightPromises.set(key, promise);
  return await promise;
}

export function invalidateEdgeCache(prefix = '') {
  if (!prefix) {
    edgeCache.clear();
    return;
  }
  for (const k of edgeCache.keys()) {
    if (k.startsWith(prefix)) edgeCache.delete(k);
  }
}

// Adaptive Bulkhead Isolation for Central Hub Protection (Anti-Cascading Meltdown)
let activeHubFallbacks = 0;
const MAX_CONCURRENT_HUB_FALLBACKS = 6;

export default {
  async fetch(request, env, ctx) {
    const requestOrigin = request.headers.get('Origin');
    const dynamicCors = getCorsHeaders(requestOrigin, env);
    setDefaultCorsOrigin(dynamicCors['Access-Control-Allow-Origin']);

    if (request.method.toUpperCase() === 'OPTIONS') {
      return corsOptionsResponse(requestOrigin, env);
    }

    return requestContextStorage.run({ request, env, origin: dynamicCors['Access-Control-Allow-Origin'] }, async () => {
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
      const cleanPinId = String(rawPinId).replace(/[^0-9]/g, '').slice(0, 32);
      if (!cleanPinId) {
        return jsonResponse({ success: false, error: 'INVALID_PIN_ID', message: 'Pin ID must be numeric' }, 400);
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

    // 5. Level 4B: Dedicated Board Ideas Radar Studio HTML
    if (pathLower === '/board-ideas' || pathLower.startsWith('/board-ideas/')) {
      if (method !== 'GET') {
        return methodNotAllowedResponse('GET, OPTIONS');
      }
      return new Response(getBoardIdeasPageHtml(), {
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
      const dbUrl = env.DATABASE_URL || (typeof process !== 'undefined' ? process.env.DATABASE_URL : null);
      if (!dbUrl) {
        return jsonResponse({
          status: 'degraded',
          database: 'missing_database_url',
          error: 'DATABASE_URL secret is not set in Cloudflare Workers settings.',
          timestamp: new Date().toISOString()
        }, 503);
      }
      try {
        const sql = neon(dbUrl);
        await sql`SELECT 1 as alive;`;
        return jsonResponse({
          status: 'healthy',
          database: 'connected',
          runtime: 'cloudflare_workers',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        return jsonResponse({
          status: 'error',
          database: 'disconnected',
          error: err.message,
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

    const dbUrl = env.DATABASE_URL || (typeof process !== 'undefined' ? process.env.DATABASE_URL : null);
    if (!dbUrl) {
      return jsonResponse({
        error: 'DATABASE_URL secret is not set in Cloudflare Workers environment.',
        hint: 'Add DATABASE_URL in Cloudflare Dashboard -> Workers & Pages -> pin-arbitrage-engine -> Settings -> Variables and Secrets.'
      }, 500);
    }

    const sql = env.SQL_CLIENT || getCachedShardSql(dbUrl, () => neon(dbUrl));
    let targetSql = sql;
    const reqProjectId = searchParams.get('project_id') || searchParams.get('shard') || request.headers.get('x-target-project');
    if (reqProjectId && reqProjectId !== 'all' && reqProjectId !== 'hub') {
      const cleanKey = String(reqProjectId).trim();
      if (shardSqlCache.has(cleanKey)) {
        targetSql = shardSqlCache.get(cleanKey);
      } else {
        try {
          const [proj] = await sql`
            SELECT project_id, project_name, database_url FROM neon_projects_registry 
            WHERE (project_id = ${cleanKey} OR project_name = ${cleanKey}) AND status = 'active' 
            LIMIT 1;
          `;
          if (proj && proj.database_url) {
            targetSql = getCachedShardSql(proj.database_url, () => neon(proj.database_url));
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
                return Reflect.apply(sql, thisArg, argArray).finally(() => {
                  activeHubFallbacks--;
                });
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

    try {
      // 1. GET /api/overview
      if (method === 'GET' && pathname === '/api/overview') {
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

        return jsonResponse({
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
        });
      }

      // 2. GET /api/seeds
      if (method === 'GET' && pathname === '/api/seeds') {
        const seeds = await targetSql`
          SELECT 
              s.pin_id,
              s.label,
              s.is_competitor,
              s.created_at,
              s.last_crawled_at,
              COALESCE(c_count.count, 0) AS total_candidates,
              COALESCE(c_count.count, 0) AS candidate_count,
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
              SELECT COUNT(*) AS count
              FROM candidate_graph_nodes
              WHERE seed_pin_id = s.pin_id
          ) c_count ON true
          LEFT JOIN LATERAL (
              SELECT COUNT(*) AS count
              FROM seed_guided_search_capsules
              WHERE seed_pin_id = s.pin_id
          ) cap_count ON true
          LEFT JOIN LATERAL (
              SELECT * FROM cluster_arbitrage_metrics 
              WHERE seed_pin_id = s.pin_id 
              ORDER BY analyzed_at DESC 
              LIMIT 1
          ) m ON true
          ORDER BY s.created_at DESC;
        `;
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

        const inserted = [];
        const chunkSize = 20;
        for (let i = 0; i < rawSeeds.length; i += chunkSize) {
          const chunk = rawSeeds.slice(i, i + chunkSize);
          const chunkResults = await Promise.all(chunk.map(s => targetSql`
            INSERT INTO cluster_seeds (pin_id, label, is_competitor, created_at)
            VALUES (${s.pin_id}, ${s.label}, ${s.is_competitor}, NOW())
            ON CONFLICT (pin_id) DO UPDATE SET
              label = EXCLUDED.label,
              is_competitor = EXCLUDED.is_competitor
            RETURNING pin_id, label, is_competitor, last_crawled_at;
          `));
          inserted.push(...chunkResults.flat());
        }

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
          if (seedPinId && query) {
            const qPattern = `%${query.toLowerCase()}%`;
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
          } else if (query) {
            const qPattern = `%${query.toLowerCase()}%`;
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

        return jsonResponse({
          seed_pin_id: seedPinId,
          dinner_anchor: formatCard(dinnerAnchor, 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes', 'DINNER_ANCHOR', '15m'),
          navboost_co_visitor: formatCard(navboostSide, 'Cast Iron Skillet Garlic Cheddar Honey Biscuits', 'NAVBOOST_CO_VISITOR', '20m'),
          session_finisher: formatCard(sessionFinisher, 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream', 'SESSION_FINISHER', '10m')
        });
      }

      // 7. GET /api/cluster-telemetry
      if (method === 'GET' && pathname === '/api/cluster-telemetry') {
        let seedPinId = searchParams.get('seed_pin_id');
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
          return jsonResponse({
            recgpt_count: 0,
            navboost_count: 0,
            randomwalk_count: 0,
            two_tower_count: 0,
            fresh_candidate_count: 0,
            product_count: 0,
            total_engine_quota: 0,
            color_centroids: [],
            high_save_tokens: []
          });
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

        return jsonResponse({
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
        });
      }

      // 8. GET /api/guided-search
      if (method === 'GET' && pathname === '/api/guided-search') {
        const seedPinId = searchParams.get('seed_pin_id');
        let rows;
        if (seedPinId && seedPinId !== 'all') {
          rows = await targetSql`
            SELECT g.*, s.label AS seed_label
            FROM seed_guided_search_capsules g
            LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
            WHERE g.seed_pin_id = ${seedPinId}
            ORDER BY g.discovered_at DESC;
          `;
        } else {
          rows = await targetSql`
            SELECT g.*, s.label AS seed_label
            FROM seed_guided_search_capsules g
            LEFT JOIN cluster_seeds s ON s.pin_id = g.seed_pin_id
            ORDER BY g.discovered_at DESC;
          `;
        }
        return jsonResponse(rows);
      }

      // 9. GET /api/intersections (Uncapped, authentic Pixie Multi-Hit ranking)
      if (method === 'GET' && pathname === '/api/intersections') {
        const minOverlap = Number(searchParams.get('min_overlap')) || 2;
        const limit = clampLimit(searchParams.get('limit'), 1000, 1000);

        const allSeeds = await targetSql`SELECT pin_id, label, is_competitor FROM cluster_seeds;`;
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
        `;

        const totalSeedsCount = Math.max(allSeeds.length, 1);
        const computedCouplings = rows.map((r) => {
          const overlap = Number(r.seed_overlap_count || 1);
          const saves = Number(r.total_saves || 0);
          const multihitWeight = Math.sqrt(Math.max(saves, 1)) * overlap;
          const nodeStrength = Math.max(saves, 1);
          return multihitWeight / Math.sqrt(totalSeedsCount * nodeStrength);
        });
        const meanRho = computedCouplings.reduce((acc, v) => acc + v, 0) / Math.max(computedCouplings.length, 1);

        const enrichedRows = rows.map((r, idx) => {
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

        return jsonResponse(enrichedRows);
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

        const capChunkSize = 20;
        for (let i = 0; i < capturedCapsules.length; i += capChunkSize) {
          const chunk = capturedCapsules.slice(i, i + capChunkSize);
          await Promise.all(chunk.map(cap => targetSql`
            INSERT INTO seed_guided_search_capsules (
              seed_pin_id, query_term, normalized_query, image_url, search_url, node_id, discovered_at
            ) VALUES (
              ${cap.seed_pin_id}, ${cap.query_term}, ${cap.normalized_query}, ${cap.image_url}, ${cap.search_url}, ${cap.node_id}, NOW()
            )
            ON CONFLICT (seed_pin_id, normalized_query) DO UPDATE
            SET image_url = EXCLUDED.image_url, search_url = EXCLUDED.search_url, node_id = EXCLUDED.node_id;
          `));
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

        const candChunkSize = 20;
        for (let i = 0; i < rawCandidates.length; i += candChunkSize) {
          const chunk = rawCandidates.slice(i, i + candChunkSize);
          await Promise.all(chunk.map(node => targetSql`
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
            ) VALUES (
              ${node.seed_pin_id}, ${node.candidate_pin_id}, ${node.title},
              ${node.dominant_color}, ${node.aspect_ratio}, ${node.saves},
              ${node.repins}, ${node.save_rate}, ${node.domain},
              ${node.is_product}, ${node.ocr_text}, NOW(),
              ${node.pin_created_at}, ${node.age_days}, ${node.daily_velocity},
              ${node.provenance_engine}, ${node.individual_prod_score},
              ${node.recgpt_transition_score}, ${node.sequence_role},
              ${node.is_recgpt_candidate}, ${node.visual_entropy_score},
              ${node.image_url}, ${node.is_video}, ${node.ingestion_method}
            )
            ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
              title = EXCLUDED.title,
              dominant_color = EXCLUDED.dominant_color,
              saves = GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves),
              repins = CASE WHEN EXCLUDED.repins > 0 THEN EXCLUDED.repins ELSE candidate_graph_nodes.repins END,
              save_rate = CASE
                WHEN EXCLUDED.repins > 0 AND GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves) > 0
                  THEN ROUND((EXCLUDED.repins::numeric / GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves)::numeric) * 100, 2)
                WHEN candidate_graph_nodes.repins > 0 AND GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves) > 0
                  THEN ROUND((candidate_graph_nodes.repins::numeric / GREATEST(candidate_graph_nodes.saves, EXCLUDED.saves)::numeric) * 100, 2)
                ELSE candidate_graph_nodes.save_rate
              END,
              domain = EXCLUDED.domain,
              is_product = EXCLUDED.is_product,
              ocr_text = EXCLUDED.ocr_text,
              extracted_at = NOW(),
              image_url = EXCLUDED.image_url,
              is_video = EXCLUDED.is_video;
          `));
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

        const data = await getCachedOrFetch(cacheKey, async () => {
          const overview = await getCompetitorsOverview(targetSql);
          const competitors = await listCompetitors(targetSql, {
            account_type,
            search,
            limit,
            offset
          });
          return { overview, competitors };
        }, 8000, 30000);

        return jsonResponse({ success: true, ...data }, 200, 8);
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
        const body = await request.json().catch(() => ({}));
        const username = body.username;
        if (!username) return jsonResponse({ error: 'username is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const updated = await syncCompetitorProfile(targetSql, username, cookie);
        if (updated?.username) {
          safeWaitUntil(ctx, syncCompetitorAcrossFleet(sql, updated.username), 'syncCompetitorAcrossFleet');
        }
        return jsonResponse({ success: true, profile: updated });
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
        const boards = await getCompetitorBoards(targetSql, idOrUser, { username });
        return jsonResponse({ success: true, boards }, 200, 30);
      }

      if (method === 'POST' && pathname === '/api/competitors/sync-boards') {
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
          const detail = await getCompetitorDetail(targetSql, idOrUser, { username });
          return jsonResponse({ success: true, ...detail }, 200, 20);
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
          const data = await listCompetitorAccountPins(targetSql, idOrUser, {
            username,
            search: searchParams.get('search') || '',
            board: searchParams.get('board') || searchParams.get('board_name') || searchParams.get('slug') || '',
            min_saves: Number(searchParams.get('min_saves') || 0),
            sort: searchParams.get('sort') || 'saves_desc',
            page: Number(searchParams.get('page') || 1),
            limit: clampLimit(searchParams.get('limit'), 50, 1000),
            qualified_only: searchParams.get('qualified_only') === 'true',
            product_only: searchParams.get('product_only') === 'true',
            articles_only: searchParams.get('articles_only') === 'true'
          });
          return jsonResponse({ success: true, ...data }, 200, 15);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/competitors/top-urls') {
        const id = searchParams.get('id') || searchParams.get('competitor_id');
        if (!id) return jsonResponse({ error: 'competitor_id is required' }, 400);
        try {
          const result = await getTopDestinationUrls(targetSql, id, {
            limit: clampLimit(searchParams.get('limit'), 50, 1000),
            page: Number(searchParams.get('page') || 1),
            search: searchParams.get('search') || '',
            sort: searchParams.get('sort') || 'saves_desc',
            filter_type: searchParams.get('filter_type') || 'all'
          });
          return jsonResponse({ success: true, ...result }, 200, 15);
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
        const body = await request.json();
        const idOrUser = body.username || body.id || body.competitor_id;
        if (!idOrUser) return jsonResponse({ error: 'id or username is required' }, 400);
        const row = await updateCompetitorStatus(targetSql, idOrUser, body.is_active);
        return jsonResponse({ success: true, competitor: row });
      }

      // 16. Keyword Velocity Tracker API (Central Metadata Hub)
      if (method === 'GET' && pathname === '/api/keywords') {
        const search = searchParams.get('search') || '';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);

        const cacheKey = buildCanonicalCacheKey('keywords:hub', {
          search,
          limit,
          offset
        });

        const keywords = await getCachedOrFetch(cacheKey, async () => {
          return await listKeywords(sql, {
            search,
            limit,
            offset
          });
        }, 8000, 30000);

        return jsonResponse({ success: true, keywords }, 200, 8);
      }

      if (method === 'POST' && pathname === '/api/keywords') {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        const row = await addKeyword(sql, body);
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'GET' && pathname === '/api/keywords/resolve') {
        const slug = searchParams.get('slug') || searchParams.get('keyword') || searchParams.get('q');
        if (!slug) return jsonResponse({ error: 'slug or keyword query parameter is required' }, 400);
        const autoCreate = searchParams.get('auto_create') !== 'false';
        const row = await resolveKeywordBySlug(sql, slug, autoCreate);
        if (!row) return jsonResponse({ error: 'Keyword not found and could not be resolved' }, 404);
        return jsonResponse({ success: true, keyword: row });
      }

      if (method === 'POST' && pathname === '/api/keywords/sync') {
        invalidateEdgeCache('keywords');
        const body = await request.json().catch(() => ({}));
        let keywordId = Number(body.keyword_id);
        const slug = body.slug || body.keyword;
        let resolvedKw = null;
        if (!keywordId && slug) {
          resolvedKw = await resolveKeywordBySlug(sql, slug, true);
          if (resolvedKw) keywordId = resolvedKw.id;
        }
        if (!keywordId) return jsonResponse({ error: 'keyword_id or slug is required' }, 400);
        const force = Boolean(body.force);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const res = await crawlKeywordSERP(sql, keywordId, { cookie, force });

        // Trigger Stage 2 Deep Crawler in GitHub Actions asynchronously (< 3s edge response preserved)
        const autoDispatch = body.dispatch_workflow !== false;
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN) : null);
        if (autoDispatch && token && res?.success) {
          const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
          const targetKw = res.keyword || body.target_keyword || body.keyword || resolvedKw?.keyword || '';
          const maxPinsInput = String(body.max_pins || '100');
          const crawlScopeInput = String(body.crawl_scope || 'all_pins');
          const dispatchPromise = (async () => {
            try {
              const dRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`, {
                method: 'POST',
                headers: {
                  'Accept': 'application/vnd.github.v3+json',
                  'Authorization': `Bearer ${token}`,
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
          if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(dispatchPromise);
          }
        }

        return jsonResponse({ success: true, result: res });
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

        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
        if (ids.length > 0) {
          await sql`DELETE FROM tracked_keywords WHERE id = ANY(${ids});`;
          return jsonResponse({ success: true, deleted_ids: ids });
        }

        if (id && !isNaN(Number(id))) {
          await sql`DELETE FROM tracked_keywords WHERE id = ${Number(id)};`;
          return jsonResponse({ success: true, deleted_id: Number(id) });
        } else if (keyword) {
          const cleanKeyword = keyword.toLowerCase().trim();
          await sql`DELETE FROM tracked_keywords WHERE LOWER(keyword) = ${cleanKeyword};`;
          return jsonResponse({ success: true, deleted_keyword: cleanKeyword });
        }
        return jsonResponse({ error: 'id, keyword, or ids array is required to delete tracked keyword' }, 400);
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
          if (!pinId || !/^\d{10,30}$/.test(pinId)) {
            return jsonResponse({ success: false, error: 'INVALID_PIN_ID', message: 'Valid numeric pinId is required' }, 400);
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

          // Manual Deletion Only Directive: remove from unified keyword catalog & keyword snapshots
          const delRes = await sql`
            DELETE FROM keyword_serp_current
            WHERE keyword_id = ${keywordId} AND pin_id = ${pinId}
            RETURNING pin_id;
          `;
          await sql`
            DELETE FROM keyword_pins_snapshots
            WHERE keyword_id = ${keywordId} AND pin_id = ${pinId};
          `.catch(() => {});

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
        const pins = await getKeywordPins(sql, keywordId);
        return jsonResponse({ success: true, pins });
      }

      if (method === 'GET' && pathname === '/api/keywords/typeahead') {
        const q = searchParams.get('q') || searchParams.get('term') || '';
        const result = await fetchKeywordTypeahead(q);
        return jsonResponse(result);
      }

      if (method === 'GET' && pathname === '/api/keywords/visual-search') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null);
        const result = await fetchVisualSearchLens(sql, pinId, cookie);
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
        const guides = await getKeywordGuides(sql, keywordId);
        return jsonResponse({ success: true, guides });
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

        const result = await getCachedOrFetch(cacheKey, async () => {
          return await getKeywordSERPComparison(sql, keywordId, resolved);
        }, 12000, 45000);

        return jsonResponse({ success: true, ...result }, 200, 10);
      }

      if (method === 'GET' && pathname === '/api/keywords/intelligence') {
        const keywordId = Number(searchParams.get('keyword_id'));
        if (!keywordId) return jsonResponse({ error: 'keyword_id is required' }, 400);
        const result = await getKeywordIntelligence(sql, keywordId);
        return jsonResponse(result);
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
        const result = await getKeywordDisplacedPins(sql, keywordId, { status, limit, offset });
        return jsonResponse(result);
      }

      if (method === 'GET' && pathname === '/api/keywords/pins/trajectory') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
        const range = searchParams.get('range') || 'all';
        const result = await getPinPerformanceTrajectory(sql, keywordId, pinId, range);
        return jsonResponse(result);
      }

      if (method === 'GET' && pathname === '/api/keywords/pins/dossier') {
        const pinId = searchParams.get('pin_id');
        if (!pinId) return jsonResponse({ error: 'pin_id is required' }, 400);
        const keywordId = Number(searchParams.get('keyword_id') || 0) || null;
        const result = await getPinDeepDossier(sql, pinId, keywordId);
        return jsonResponse(result);
      }

      // Universal Pin Intelligence API (/api/pins/:pin_id & /api/pins/:pin_id/snapshots/:snapshot_id)
      if (pathname.startsWith('/api/pins/')) {
        const parts = pathname.slice('/api/pins/'.length).split('/').filter(Boolean);
        const pinId = parts[0];

        // 1. DELETE /api/pins/:pin_id/snapshots/:snapshot_id
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
          if (!pinId || !/^\d{10,30}$/.test(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid numeric Snowflake identifier (10-30 digits)'
            }, 400);
          }
          const shardId = getPinShardId(pinId, 99);
          const shardSql = await resolveShardConnection({ hubSql: sql, shardId }).catch(() => targetSql);
          await shardSql`DELETE FROM pins_daily_snapshots WHERE id = ${snapshotId};`.catch(() => {});
          await shardSql`DELETE FROM keyword_pins_snapshots WHERE id = ${snapshotId};`.catch(() => {});
          return jsonResponse({ success: true, deleted_snapshot_id: snapshotId, pin_id: pinId });
        }

        // 2. POST /api/pins/:pin_id/sync (Live Pinterest Deep Sync with 48 Algorithmic Fields)
        if (parts[1] === 'sync') {
          if (method !== 'POST') {
            return methodNotAllowedResponse('POST, OPTIONS');
          }
          if (!pinId || !/^\d{10,30}$/.test(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid numeric Snowflake identifier (10-30 digits)'
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
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId }).catch(() => targetSql);

            const metaToStore = {
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

            // A. Master pin record on target shard
            await shardSql`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations,
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
                visual_annotations = EXCLUDED.visual_annotations,
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
                metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metaToStore)}::jsonb,
                crawled_at = NOW(),
                updated_at = NOW()
              WHERE pin_id = ${pinId};
            `.catch(() => {});

            // B2. Hub keyword_pins_snapshots
            // Telemetry metrics update only
            const updateResult = await sql`
              UPDATE keyword_pins_snapshots SET
                save_count = GREATEST(save_count, ${Number(pin.saves || 0)}),
                repin_count = GREATEST(repin_count, ${Number(pin.repins || 0)}),
                comment_count = GREATEST(comment_count, ${Number(pin.comments || 0)}),
                share_count = GREATEST(COALESCE(share_count, 0), ${Number(pin.share_count || 0)}),
                created_at_pinterest = CASE WHEN ${pin.created_at_pinterest}::timestamptz IS NOT NULL THEN ${pin.created_at_pinterest}::timestamptz ELSE created_at_pinterest END,
                creation_method = CASE WHEN ${pin.creation_method}::text <> '' THEN ${pin.creation_method}::text ELSE creation_method END,
                metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metaToStore)}::jsonb
              WHERE pin_id = ${pinId}
              RETURNING id;
            `.catch(() => []);

            // If no snapshot exists today, insert only if no crawl is active, and inherit current catalog status
            if (!updateResult || updateResult.length === 0) {
              if (!isCrawlInProgress) {
                const [kwRow] = await sql`
                  SELECT keyword_id, rank_position, is_displaced 
                  FROM keyword_serp_current 
                  WHERE pin_id = ${pinId} 
                  LIMIT 1;
                `.catch(() => []);
                const targetKid = kwRow?.keyword_id || 1;
                const currentDisplaced = kwRow?.is_displaced ?? false;
                const currentRank = currentDisplaced ? null : (kwRow?.rank_position ?? null);

                await sql`
                  INSERT INTO keyword_pins_snapshots (
                    keyword_id, pin_id, rank_position, title, domain, destination_url, image_url,
                    save_count, repin_count, comment_count, share_count, daily_save_velocity,
                    snapshot_date, is_displaced, created_at_pinterest, creation_method, metadata, created_at
                  )
                  SELECT
                    ${targetKid}, ${pinId}, ${currentRank}, ${pin.title || ''}, ${pin.domain || ''}, ${pin.link || ''}, ${pin.image_url || ''},
                    ${Number(pin.saves || 0)}, ${Number(pin.repins || 0)}, ${Number(pin.comments || 0)}, ${Number(pin.share_count || 0)}, 0,
                    (NOW() AT TIME ZONE 'UTC')::date, ${currentDisplaced},
                    ${pin.created_at_pinterest ? pin.created_at_pinterest : null}, ${pin.creation_method || 'pinterest_platform'},
                    ${JSON.stringify(metaToStore)}::jsonb, NOW()
                  WHERE NOT EXISTS (
                    SELECT 1 FROM keyword_ignored_pins kip
                    WHERE kip.keyword_id = ${targetKid} AND kip.pin_id = ${pinId}
                  )
                  ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET
                    save_count = GREATEST(keyword_pins_snapshots.save_count, EXCLUDED.save_count),
                    repin_count = GREATEST(keyword_pins_snapshots.repin_count, EXCLUDED.repin_count),
                    metadata = COALESCE(keyword_pins_snapshots.metadata, '{}'::jsonb) || EXCLUDED.metadata;
                `.catch(() => {});
              } else {
                console.warn(`[Sync Concurrency Guard] Crawl lease active for pin #${pinId} keywords (${activeCrawlKeywords.map(k=>k.id).join(',')}). Snapshot insertion deferred to active crawler.`);
              }
            }

            // C. Shard daily snapshot record
            await shardSql`
              INSERT INTO pins_daily_snapshots (
                pin_id, snapshot_date, rank_position, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, created_at
              ) VALUES (
                ${pinId}, (NOW() AT TIME ZONE 'UTC')::date, NULL,
                ${Number(pin.saves || 0)}, ${Number(pin.repins || 0)}, ${Number(pin.comments || 0)}, ${Number(pin.share_count || 0)}, 0, 0, NOW()
              )
              ON CONFLICT (pin_id, keyword_id, snapshot_date) DO UPDATE SET
                save_count = GREATEST(pins_daily_snapshots.save_count, EXCLUDED.save_count),
                repin_count = GREATEST(pins_daily_snapshots.repin_count, EXCLUDED.repin_count),
                comment_count = GREATEST(pins_daily_snapshots.comment_count, EXCLUDED.comment_count),
                share_count = GREATEST(pins_daily_snapshots.share_count, EXCLUDED.share_count);
            `.catch(() => {});

            // D. Refreshed dossier
            const refreshedDossier = await fetchUniversalPinDossier({ hubSql: sql, pinId });

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

        // 3. GET /api/pins/:pin_id (Universal 4-Pillar Dossier via fleet-router)
        if (parts.length === 1) {
          if (method !== 'GET') {
            return methodNotAllowedResponse('GET, OPTIONS');
          }
          if (!pinId || !/^\d{10,30}$/.test(pinId)) {
            return jsonResponse({
              success: false,
              error: 'INVALID_PIN_ID',
              message: 'Pin ID must be a valid numeric Snowflake identifier (10-30 digits)'
            }, 400);
          }
          try {
            let dossier = await fetchUniversalPinDossier({ hubSql: sql, pinId });

            // Auto-Enrichment Guard: If dossier exists but lacks deep algorithmic telemetry
            // (e.g. only shallow SERP snapshot without canonical_pin_id or seo_related_interests)
            if (dossier?.success && (!dossier?.algorithmic_intelligence?.canonical_pin_id || !dossier?.algorithmic_intelligence?.seo_related_interests?.length)) {
              try {
                const liveRes = await Promise.race([
                  fetchPinFromPinterest(pinId),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                ]);
                if (liveRes?.ok && liveRes.pin) {
                  const p = liveRes.pin;
                  const autoMeta = {
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

                  await sql`
                    UPDATE keyword_serp_current SET
                      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(autoMeta)}::jsonb,
                      destination_url = CASE WHEN ${p.link || ''}::text <> '' THEN ${p.link}::text ELSE destination_url END,
                      updated_at = NOW()
                    WHERE pin_id = ${pinId};
                  `.catch(() => {});

                  await sql`
                    UPDATE keyword_pins_snapshots SET
                      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(autoMeta)}::jsonb
                    WHERE pin_id = ${pinId};
                  `.catch(() => {});

                  dossier = await fetchUniversalPinDossier({ hubSql: sql, pinId });
                }
              } catch (_) {}
            }

            if (!dossier || !dossier.pin_id || !dossier.success) {
              return jsonResponse({
                success: false,
                error: 'NOT_FOUND',
                message: dossier?.message || `Pin dossier not found for pin_id: ${pinId}`
              }, 404);
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

      // Level 1B: Discovery Typeahead API
      if (pathname === '/api/discovery/typeahead') {
        if (method !== 'GET') {
          return methodNotAllowedResponse('GET, OPTIONS');
        }
        const q = searchParams.get('q') || searchParams.get('term') || searchParams.get('query') || '';
        const result = await fetchKeywordTypeahead(q);
        return jsonResponse(result);
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
        const imported = [];

        for (const cleanKw of validKeywords) {
          try {
            const [row] = await sql`
              INSERT INTO tracked_keywords (
                keyword, category, is_active, updated_at
              ) VALUES (
                ${cleanKw}, ${category}, TRUE, NOW()
              )
              ON CONFLICT (keyword) DO UPDATE SET
                updated_at = NOW(),
                is_active = TRUE
              RETURNING id, keyword, category;
            `;
            if (row) {
              imported.push(row);
              if (folderId) {
                await addKeywordToFolder(sql, folderId, row.id).catch(() => {});
              }
            }
          } catch (_) {}
        }

        return jsonResponse({
          success: true,
          added: imported.length,
          count: imported.length,
          total_submitted: rawCandidates.length,
          folder_id: folderId,
          keywords: imported
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
        const crossover = await calculateFolderCrossover(sql, Number(folderId));
        return jsonResponse({ success: true, crossover });
      }

      // Aliased Campaign Folders CRUD API (/api/folders)
      if ((pathname === '/api/folders' || pathname.startsWith('/api/folders/')) && !pathname.includes('crossover')) {
        const parts = pathname.slice('/api/folders'.length).split('/').filter(Boolean);
        const folderId = parts[0] ? Number(parts[0]) : (searchParams.get('id') || searchParams.get('folder_id'));

        if (method === 'GET') {
          if (folderId) {
            const folder = await getFolder(sql, folderId);
            if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
            return jsonResponse({ success: true, folder });
          }
          const folders = await listFolders(sql, {
            projectId: searchParams.get('project_id') || 'default'
          });
          return jsonResponse({ success: true, folders });
        }

        if (method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const created = await createFolder(sql, body);
          return jsonResponse({ success: true, folder: created });
        }

        if (method === 'DELETE' && folderId) {
          const deleted = await deleteFolder(sql, folderId);
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
        const maxPinsInput = String(body.max_pins || '100');
        const crawlScopeInput = String(body.crawl_scope || 'all_pins');
        const repo = (typeof env !== 'undefined' && env?.GITHUB_REPOSITORY) || (typeof process !== 'undefined' ? process.env?.GITHUB_REPOSITORY : null) || 'sayfedin-star/pin-arbitrage-engine';
        const token = (typeof env !== 'undefined' && (env?.GITHUB_TOKEN || env?.GITHUB_PAT)) || (typeof process !== 'undefined' ? (process.env?.GITHUB_TOKEN || process.env?.GITHUB_PAT || process.env?.GH_TOKEN) : null);
        if (!token) {
          return jsonResponse({ success: false, error: 'GITHUB_TOKEN environment variable is not configured' }, 400);
        }
        const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/keyword-intelligence-velocity.yml/dispatches`;
        let dispatchRes;
        try {
          dispatchRes = await fetch(workflowUrl, {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${token}`,
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
          if (!dispatchRes.ok) {
            const errText = await dispatchRes.text();
            return jsonResponse({ success: false, error: `GitHub API error: ${errText}` }, dispatchRes.status);
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
          const folder = await getFolder(sql, folderId);
          if (!folder) return jsonResponse({ error: 'Folder not found' }, 404);
          return jsonResponse({ success: true, folder });
        }
        const folders = await listFolders(sql, {
          projectId: searchParams.get('project_id') || 'default'
        });
        return jsonResponse({ success: true, folders });
      }

      if (method === 'POST' && pathname === '/api/keywords/folders') {
        const body = await request.json().catch(() => ({}));
        const created = await createFolder(sql, body);
        return jsonResponse({ success: true, folder: created });
      }

      if ((method === 'PUT' || method === 'PATCH') && pathname === '/api/keywords/folders') {
        const body = await request.json().catch(() => ({}));
        const folderId = body.id || searchParams.get('id');
        if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
        const updated = await updateFolder(sql, folderId, body);
        return jsonResponse({ success: true, folder: updated });
      }

      if (method === 'DELETE' && pathname === '/api/keywords/folders') {
        let folderId = searchParams.get('id') || searchParams.get('folder_id');
        if (!folderId) {
          try {
            const body = await request.json();
            folderId = body.id || body.folder_id;
          } catch (_) {}
        }
        if (!folderId) return jsonResponse({ error: 'Folder id is required' }, 400);
        const deleted = await deleteFolder(sql, folderId);
        return jsonResponse({ success: true, deleted });
      }

      if (method === 'POST' && pathname === '/api/keywords/folders/items') {
        const body = await request.json().catch(() => ({}));
        const folderId = body.folder_id || searchParams.get('folder_id');
        if (!folderId) return jsonResponse({ error: 'folder_id is required' }, 400);
        
        if (Array.isArray(body.keyword_ids)) {
          const result = await batchAddKeywordsToFolder(sql, folderId, body.keyword_ids);
          return jsonResponse({ success: true, ...result });
        }
        
        const keywordId = body.keyword_id || searchParams.get('keyword_id');
        if (!keywordId) return jsonResponse({ error: 'keyword_id or keyword_ids is required' }, 400);
        const item = await addKeywordToFolder(sql, folderId, keywordId, body.notes || '');
        return jsonResponse({ success: true, item });
      }

      if (method === 'DELETE' && pathname === '/api/keywords/folders/items') {
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
        const crossover = await calculateFolderCrossover(sql, folderId);
        return jsonResponse({ success: true, crossover });
      }

      // 17. Neon Multi-Project Fleet API
      if (method === 'GET' && pathname === '/api/fleet/projects') {
        const cacheKey = 'fleet_projects';
        const projects = await getCachedOrFetch(cacheKey, () => getFleetProjects(sql), 10000, 30000);
        return jsonResponse({ success: true, projects }, 200, 10);
      }

      if (method === 'POST' && pathname === '/api/fleet/projects') {
        invalidateEdgeCache('fleet_projects');
        const body = await request.json().catch(() => ({}));
        const row = await registerNewProject(sql, body);
        return jsonResponse({ success: true, project: row });
      }

      if (method === 'POST' && pathname === '/api/fleet/sync') {
        invalidateEdgeCache('fleet_projects');
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
        const overview = await getPinArchiveOverview(targetSql);
        return jsonResponse({ success: true, overview });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/rules') {
        const rules = await getQualificationRules(targetSql);
        return jsonResponse({ success: true, rules });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/rules') {
        const body = await request.json().catch(() => ({}));
        const rules = await updateQualificationRules(targetSql, body);
        return jsonResponse({ success: true, rules });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/re-evaluate') {
        const body = await request.json().catch(() => ({}));
        const account = searchParams.get('account') || searchParams.get('username') || body.account_username || null;
        const audit = await reEvaluateArchivedPins(targetSql, (body && Object.keys(body).length > 0) ? body : null, account);
        return jsonResponse({ success: true, ...audit });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/topics') {
        const minPins = Number(searchParams.get('min_pins') || 1);
        const search = searchParams.get('search') || '';
        const account = searchParams.get('account') || '';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
        const topics = await getTopicClusters(targetSql, { minPins, search, account, limit, offset });
        return jsonResponse({ success: true, topics });
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
        const pins = await listArchivedPins(targetSql, { search, topic, board, stage, account, minSaves, maxSaves, timeframe, changedOnly, sortBy, order, limit, offset });
        return jsonResponse({ success: true, pins, total: pins.total ?? pins.length });
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
        const body = await request.json().catch(() => ({}));
        const snapshotId = searchParams.get('id') || searchParams.get('snapshot_id') || body.id || body.snapshot_id;
        const pinId = searchParams.get('pin_id') || body.pin_id;
        if (!snapshotId || !pinId) return jsonResponse({ error: 'snapshot_id and pin_id are required' }, 400);
        const result = await deletePinMetricSnapshot(targetSql, snapshotId, pinId);
        return jsonResponse(result);
      }

      if (method === 'POST' && pathname === '/api/pinarchive/stage') {
        const body = await request.json().catch(() => ({}));
        const pinIds = body.pin_ids || body.pinIds;
        const targetBoard = body.target_board || body.targetBoard || '';
        const overrideLink = body.override_link || body.overrideLink || '';
        if (!pinIds || !pinIds.length) return jsonResponse({ error: 'pin_ids are required' }, 400);
        const result = await stagePinsForRepurpose(targetSql, { pinIds, targetBoard, overrideLink });
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'GET' && pathname === '/api/pinarchive/staged') {
        const status = searchParams.get('status') || 'staged';
        const limit = clampLimit(searchParams.get('limit'), 50, 1000);
        const offset = Math.max(0, parseInt(searchParams.get('offset'), 10) || 0);
        const items = await listStagedPins(targetSql, { status, limit, offset });
        return jsonResponse({ success: true, staged: items, items });
      }

      if (method === 'POST' && pathname === '/api/pinarchive/claim-cas') {
        const body = await request.json().catch(() => ({}));
        const stagedId = body.staged_id || body.id || body.pin_id;
        if (!stagedId) return jsonResponse({ error: 'staged_id or pin_id is required' }, 400);
        const result = await claimStagedPinCas(targetSql, stagedId);
        if (!result.success) {
          return jsonResponse({ success: false, error: 'CAS Conflict: pin already dispatched or not in staged status' }, 409);
        }
        return jsonResponse({ success: true, ...result });
      }

      if (method === 'DELETE' && (pathname === '/api/pinarchive/staged' || pathname === '/api/pinarchive/cancel-staged')) {
        const body = await request.json().catch(() => ({}));
        const stagedId = searchParams.get('id') || searchParams.get('staged_id') || body.staged_id || body.id || body.pin_id;
        if (!stagedId) return jsonResponse({ error: 'staged_id or pin_id is required' }, 400);
        const result = await cancelStagedPin(targetSql, stagedId);
        if (!result.success) {
          return jsonResponse({ success: false, error: 'Staged pin not found or already dispatched/cancelled', ...result }, 404);
        }
        return jsonResponse({ success: true, ...result });
      }

      // Board Ideas Radar API
      if (method === 'GET' && pathname === '/api/board-ideas/boards') {
        try {
          const data = await listAvailableBoards(targetSql);
          return jsonResponse({ success: true, ...data });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'POST' && pathname === '/api/board-ideas/resolve') {
        try {
          const body = await request.json().catch(() => ({}));
          const url = body.url || body.board_url || '';
          if (!url) return jsonResponse({ error: 'url is required' }, 400);
          const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null) || '';
          const board = await resolveBoardIdentity(targetSql, url, cookie);
          return jsonResponse({ success: true, board });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }

      if (method === 'POST' && pathname === '/api/board-ideas/sync') {
        try {
          const body = await request.json().catch(() => ({}));
          const boardId = body.board_id;
          if (!boardId) return jsonResponse({ error: 'board_id is required' }, 400);
          const maxPages = Number(body.max_pages || 1);
          const cookie = env.PINTEREST_COOKIE || (typeof process !== 'undefined' ? process.env.PINTEREST_COOKIE : null) || '';
          const result = await syncBoardIdeas(targetSql, boardId, cookie, maxPages);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'GET' && pathname === '/api/board-ideas/details') {
        try {
          const boardId = searchParams.get('board_id') || searchParams.get('id');
          if (!boardId) return jsonResponse({ error: 'board_id is required' }, 400);
          const details = await getBoardIdeasComparison(targetSql, boardId);
          return jsonResponse({ success: true, ...details });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (method === 'DELETE' && pathname === '/api/board-ideas') {
        try {
          let boardId = searchParams.get('board_id') || searchParams.get('id');
          if (!boardId) {
            try {
              const body = await request.json().catch(() => ({}));
              boardId = body.board_id || body.id;
            } catch (_) {}
          }
          if (!boardId) return jsonResponse({ error: 'board_id is required' }, 400);
          const result = await deleteTrackedBoard(targetSql, boardId);
          return jsonResponse({ success: true, ...result });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
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
    }
    });
  },

  /**
   * Cloudflare Worker Scheduled Cron Handler
   * 100% reliant on GitHub Actions (20-Shard Parallel Matrix) for harvesting.
   * Dispatches crawler-pipeline.yml on GitHub Actions rather than harvesting on Worker.
   */
  async scheduled(event, env, ctx) {
    const githubToken = env.GITHUB_TOKEN || env.GITHUB_PAT;
    const repo = env.GITHUB_REPOSITORY || 'sayfedin-star/pin-arbitrage-engine';

    if (githubToken) {
      console.log(`[Worker Cron] Delegating scheduled crawl to GitHub Actions 20-shard pipeline (${repo})...`);
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawler-pipeline.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
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
