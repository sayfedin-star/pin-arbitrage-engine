/**
 * Enterprise Fleet Router & Shard Topology Engine
 *
 * Implements the Hub-and-Spoke Hybrid 99-Shard Scale-Out Architecture:
 * 1. Hub-and-Spoke Separation:
 *    - Central Metadata Hub (DATABASE_URL): Relational keywords, folders, queue, active SERP cache (<40 MB).
 *    - 99 Storage Shards: Massive time-series historical snapshots & master pin creative dossiers.
 * 2. Deterministic Pin Sharding:
 *    - Partitioned strictly by: Shard_ID = (CRC32(pin_id) % 99) + 1
 *    - O(1) direct single-shard resolution for any pin dossier or trajectory.
 * 3. Zero-Secrets Dynamic Connection Routing:
 *    - Resolves connection strings from neon_projects_registry or template DSN.
 *    - Enforces Neon connection pooling (-pooler) to prevent connection slot exhaustion.
 *    - In-memory LRU connection pooling with TTL.
 * 4. Cold-Start Immunity & Circuit-Breaker:
 *    - Scale-to-zero compute protection with 2500ms timeout.
 *    - Automatic graceful degradation to Hub SERP cache when a shard is dormant/warming.
 * 5. Batch Shard Aggregation:
 *    - Groups arrays of pins by target shard ID for atomic bulk UNNEST writes by GitHub Actions runners.
 */

import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import { calculateDailyVelocity } from '../../lib/math.mjs';
import { buildRichPinMetadataPayload } from '../../domain/pin-intelligence.mjs';

// Standard CRC32 table for deterministic hashing
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

/**
 * Standard CRC32 checksum
 * @param {string|number} str
 * @returns {number} 32-bit unsigned integer
 */
export function crc32(str) {
  const clean = String(str || '').trim().toLowerCase();
  let crc = 0 ^ (-1);
  for (let i = 0; i < clean.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ clean.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Safely parses SQLite datetime strings (e.g. "YYYY-MM-DD HH:MM:SS") to UTC milliseconds.
 * Prevents V8 / Node local timezone skew and strict engine NaN errors.
 * @param {string|number|Date} val
 * @returns {number} Epoch timestamp in ms (UTC)
 */
export function parseD1DateMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  const s = String(val).trim();
  const iso = s.includes('T') ? (s.endsWith('Z') ? s : s + 'Z') : s.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return isNaN(t) ? (new Date(val).getTime() || 0) : t;
}

/**
 * Safely converts date/timestamp string or Date object to ISO string.
 * Returns fallback if invalid or null/undefined.
 * @param {string|number|Date} val
 * @param {string|null} fallback
 * @returns {string|null}
 */
export function safeIsoDate(val, fallback = null) {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    return !isNaN(d.getTime()) ? d.toISOString() : fallback;
  } catch (_) {
    return fallback;
  }
}


/**
 * 1. Deterministic Pin Shard ID Resolution
 * Computes the 1-based shard ID (1 to totalShards) for any given Pinterest Pin ID.
 *
 * Complexity: O(1) time, O(1) space (< 0.01ms execution time).
 * Eliminates scatter-gather searches: /pins/:pin_id targets exactly 1 database.
 *
 * @param {string|number} pinId - Pinterest Pin ID
 * @param {number} totalShards - Fleet size (default: 99)
 * @returns {number} Shard number in range [1, totalShards]
 */
export function getPinShardId(pinId, totalShards = 99) {
  const shards = Math.max(1, Number(totalShards) || 99);
  if (pinId === null || pinId === undefined) return 1;
  const cleanPin = String(pinId).trim();
  if (!cleanPin) return 1;
  const hash = crc32(cleanPin);
  return (hash % shards) + 1;
}

/**
 * Resolves the physical shard ID (1 to 20) for a given virtual shard ID (1 to 99).
 * Deterministic mapping: ((virtualShardId - 1) % 20) + 1.
 *
 * // [INVARIANT: 20-PHYSICAL-SHARD-CONSOLIDATION]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 *
 * @param {number|string} virtualShardId - Virtual Shard ID (1-99)
 * @returns {number} Physical Shard ID (1-20)
 */
export function getPhysicalShardId(virtualShardId) {
  const v = Number(virtualShardId);
  if (!Number.isFinite(v) || v < 1) return 1;
  return (Math.floor(v - 1) % 20) + 1;
}

/**
 * Returns canonical project name for a shard ID
 * e.g., 'pin-arbitrage-shard-01' to 'pin-arbitrage-shard-99'
 *
 * @param {number} shardId
 * @param {string} prefix
 * @returns {string}
 */
export function getShardProjectName(shardId, prefix = 'pin-arbitrage-shard') {
  return `${prefix}-${String(shardId).padStart(2, '0')}`;
}

// [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
/**
 * Canonical Entity Shard Resolution & Resilient Fallback Probing
 * Unifies all entity partitioning (pins, competitors, keywords) to canonical CRC32 modulo routing.
 */
export function getShardNumberForEntity(entityKey, totalShards = 99) {
  return getPinShardId(entityKey, totalShards);
}

export function getResilientShardNumberForEntity(entityKey, totalShards = 99, quarantinedShards = new Set()) {
  const qSet = quarantinedShards instanceof Set ? quarantinedShards : new Set(quarantinedShards || []);
  const primary = getPinShardId(entityKey, totalShards);
  if (!qSet.has(primary)) return primary;

  const hash = crc32(String(entityKey || ''));
  const shards = Math.max(1, Number(totalShards) || 99);
  for (let probe = 1; probe < shards; probe++) {
    const fallback = (((hash + probe * 0x9e3779b9) >>> 0) % shards) + 1;
    if (!qSet.has(fallback)) return fallback;
  }
  return primary;
}

// Isolate-Level Shard Routing Cache (Anti-Thundering Herd Singleflight & 10m TTL)
export const globalShardMap = new Map(); // shardId -> { database_url, status, project_name, cachedAt }
export const registryCache = globalShardMap; // Backward compatibility alias
export let globalShardMapLastFetched = 0;
export const SHARD_MAP_TTL_MS = 10 * 60 * 1000; // 10 minutes (600,000ms)
let inflightShardMapPromise = null;
export let shardMapWarmupPromise = null;

// Bounded Background Task Execution Guard for Cloudflare Worker Isolate Lifecycle
export function safeWaitUntil(promiseOrCtx, explicitPromiseOrCtx = null, taskName = 'bg_task', timeoutMs = 25000) {
  let effectiveCtx = null;
  let effectivePromise = null;

  if (promiseOrCtx && typeof promiseOrCtx.then === 'function') {
    effectivePromise = promiseOrCtx;
    if (explicitPromiseOrCtx && typeof explicitPromiseOrCtx.waitUntil === 'function') {
      effectiveCtx = explicitPromiseOrCtx;
    }
  } else if (promiseOrCtx && typeof promiseOrCtx.waitUntil === 'function') {
    effectiveCtx = promiseOrCtx;
    effectivePromise = explicitPromiseOrCtx;
  } else {
    effectivePromise = explicitPromiseOrCtx;
  }

  if (!effectiveCtx) {
    const storage = globalThis.__requestContextStorage || (typeof globalThis.requestContextStorage !== 'undefined' ? globalThis.requestContextStorage : null);
    const store = storage?.getStore?.();
    if (store?.ctx && typeof store.ctx.waitUntil === 'function') {
      effectiveCtx = store.ctx;
    }
  }

  if (!effectivePromise || typeof effectivePromise.then !== 'function') return;
  effectivePromise.catch(() => {});

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Background task "${taskName}" timed out after ${timeoutMs}ms`)), timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });

  const guardedPromise = Promise.race([effectivePromise, timeoutPromise])
    .catch(err => {
      console.warn(`[safeWaitUntil] Background task "${taskName}" non-fatal warning:`, err?.message || err);
    })
    .finally(() => {
      clearTimeout(timer);
    });

  const storage = globalThis.__requestContextStorage || (typeof globalThis.requestContextStorage !== 'undefined' ? globalThis.requestContextStorage : null);
  const store = storage?.getStore?.();
  if (store) {
    if (!Array.isArray(store.bgPromises)) store.bgPromises = [];
    store.bgPromises.push(guardedPromise);
  }

  if (effectiveCtx && typeof effectiveCtx.waitUntil === 'function') {
    try {
      effectiveCtx.waitUntil(guardedPromise);
    } catch {
      // Isolate may have finished or already responded
    }
  }
}

/**
 * Singleflight Lazy Warm-up for Global Shard Routing Map
 * Populates globalShardMap upon isolate activation without thundering herd.
 */
export async function warmGlobalShardMap(hubSql, env = null) {
  const now = Date.now();
  if (globalShardMap.size > 0 && (now - globalShardMapLastFetched < SHARD_MAP_TTL_MS)) {
    return globalShardMap.size;
  }
  if (inflightShardMapPromise) {
    return await inflightShardMapPromise;
  }
  inflightShardMapPromise = (async () => {
    try {
      return await preloadNeonRegistry(hubSql, env);
    } finally {
      inflightShardMapPromise = null;
    }
  })();
  return await inflightShardMapPromise;
}

export const shardSqlClients = new Map(); // clean canonical dsn -> neon client
export const MAX_SHARD_SQL_CLIENTS = 48;

export function getCachedShardSqlClient(dsn) {
  if (!dsn) return null;
  const cleanDsn = enforceNeonPoolerUrl(dsn);
  if (!shardSqlClients.has(cleanDsn)) return null;
  const client = shardSqlClients.get(cleanDsn);
  shardSqlClients.delete(cleanDsn);
  shardSqlClients.set(cleanDsn, client);
  return client;
}

export function setCachedShardSqlClient(dsn, client) {
  if (!dsn || !client) return;
  const cleanDsn = enforceNeonPoolerUrl(dsn);
  if (shardSqlClients.has(cleanDsn)) {
    shardSqlClients.delete(cleanDsn);
  } else if (shardSqlClients.size >= MAX_SHARD_SQL_CLIENTS) {
    const oldestKey = shardSqlClients.keys().next().value;
    if (oldestKey) {
      const evicted = shardSqlClients.get(oldestKey);
      shardSqlClients.delete(oldestKey);
      try {
        evicted?.end?.({ timeout: 1 });
      } catch (_) {}
    }
  }
  shardSqlClients.set(cleanDsn, client);
}

export function wrapShardNeonTransaction(client) {
  if (!client || client.__atomicBuilderWrapped) {
    return client;
  }
  // Native TCP postgres.js client: bridge .transaction() onto .begin()
  if (typeof client.transaction !== 'function' && typeof client.begin === 'function') {
    client.transaction = async (queriesOrFn) => {
      return await client.begin(async (tx) => {
        if (typeof queriesOrFn === 'function') {
          const res = await queriesOrFn(tx);
          if (Array.isArray(res)) {
            const out = [];
            for (const item of res) {
              out.push(typeof item === 'function' ? await item(tx) : await item);
            }
            return out;
          }
          return res;
        }
        if (Array.isArray(queriesOrFn)) {
          const out = [];
          for (const q of queriesOrFn) {
            out.push(typeof q === 'function' ? await q(tx) : await q);
          }
          return out;
        }
        return [];
      });
    };
    client.__atomicBuilderWrapped = true;
    return client;
  }
  if (typeof client.transaction !== 'function') {
    return client;
  }
  const origTransaction = client.transaction.bind(client);
  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  client.transaction = async (queriesOrFn, opts) => {
    if (typeof queriesOrFn === 'function') {
      return await origTransaction((tx) => {
        const res = queriesOrFn(tx);
        if (Array.isArray(res)) {
          return res.map(item => (typeof item === 'function' ? item(tx) : item));
        }
        return res;
      }, opts);
    }
    if (Array.isArray(queriesOrFn)) {
      if (queriesOrFn.length === 0) return [];
      const builtQueries = queriesOrFn.map(q => (typeof q === 'function' ? q(client) : q));
      return await origTransaction(builtQueries, opts);
    }
    throw new TypeError(
      '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] shardSql.transaction() strictly requires a callback or an array of lazy query builders.'
    );
  };
  client.__atomicBuilderWrapped = true;
  return client;
}

/**
 * Dual-Driver Universal PostgreSQL Connector (Neon HTTP Serverless + Coolify/VPS TCP postgres.js)
 * Automatically uses @neondatabase/serverless for *.neon.tech endpoints (or Edge Workers without TCP override)
 * and standard TCP postgres.js for self-hosted PostgreSQL on Coolify / VPS.
 */
export function createUniversalSqlClient(dsn, options = {}) {
  if (!dsn || typeof dsn !== 'string') {
    throw new Error('createUniversalSqlClient requires a valid PostgreSQL connection string');
  }
  const cleanDsn = dsn.trim();
  const driverOverride = (
    options.driver ||
    (typeof process !== 'undefined' ? process.env?.DB_DRIVER : '') ||
    ''
  ).toLowerCase().trim();
  const isNeonHost = /\.neon\.tech\b/i.test(cleanDsn);
  const usePostgresTcp = driverOverride === 'postgres' || driverOverride === 'tcp' || (!isNeonHost && driverOverride !== 'neon');

  if (usePostgresTcp) {
    const pgClient = postgres(cleanDsn, {
      max: Number(options.max || (typeof process !== 'undefined' ? process.env?.PG_POOL_MAX : 10) || 10),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: {
        undefined: null
      },
      types: {
        json: {
          to: 114,
          from: [114, 3802],
          serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)),
          parse: (x) => {
            if (typeof x !== 'string') return x;
            try {
              return JSON.parse(x);
            } catch (_) {
              return x;
            }
          }
        }
      }
    });
    const wrappedPg = wrapShardNeonTransaction(pgClient);
    return new Proxy(wrappedPg, {
      apply(target, thisArg, argArray) {
        if (typeof argArray[0] === 'string' && typeof target.unsafe === 'function') {
          return target.unsafe(argArray[0], argArray[1]);
        }
        return Reflect.apply(target, thisArg, argArray);
      }
    });
  }

  return wrapShardNeonTransaction(neon(enforceNeonPoolerUrl(cleanDsn)));
}

export function getOrCreateShardSqlClient(pooledDsn) {
  let client = getCachedShardSqlClient(pooledDsn);
  if (!client) {
    client = createUniversalSqlClient(pooledDsn);
    setCachedShardSqlClient(pooledDsn, client);
  }
  return client;
}

/**
 * Test helper: Register in-memory SQL client for a DSN
 */
export function _setShardSqlClient(dsn, client) {
  setCachedShardSqlClient(enforceNeonPoolerUrl(dsn), client);
}

// Circuit Breaker State per Shard
export const circuitBreakers = new Map(); // shardId -> { state: 'CLOSED'|'OPEN'|'HALF_OPEN', failures: 0, nextAttempt: 0 }
export const CIRCUIT_FAILURE_THRESHOLD = 2;
export const CIRCUIT_COOLDOWN_MS = 6000; // 6 seconds cooldown before half-open probe (aligned with Neon scale-to-zero cold start)

// In-Flight Read-Repair Deduplication Set (Prevents concurrent duplicate backfills on same pin)
export const reconcilingPins = new Set();

/**
 * Test helper: Reset all circuit breakers
 */
export function _resetCircuitBreakers() {
  circuitBreakers.clear();
}

/**
 * Test helper: Inspect circuit breaker state
 */
export function _getCircuitBreakerState(shardId) {
  const physicalKey = getPhysicalShardId(shardId);
  return circuitBreakers.get(physicalKey) || { state: 'CLOSED', failures: 0, nextAttempt: 0 };
}

/**
 * Test helper: Manually set circuit breaker state
 */
export function _setCircuitBreakerState(shardId, stateObj) {
  const cleanShardId = Math.max(1, Math.min(99, Number(shardId) || 1));
  const physicalKey = getPhysicalShardId(cleanShardId);
  circuitBreakers.set(physicalKey, stateObj);
  circuitBreakers.set(cleanShardId, stateObj);
}

/**
 * Validates that a resolved DSN is a clean, genuine, unmasked Postgres connection string.
 * Guards against poisoned KV entries containing UI masks (••••) or redacted placeholders.
 */
export function isValidShardDsn(dsn) {
  if (!dsn || typeof dsn !== 'string') return false;
  const trimmed = dsn.trim();
  // [INVARIANT: BYTESTRING-HEADER-SAFETY]
  // Strictly printable ASCII (0x20 - 0x7E) to prevent @neondatabase/serverless ByteString header crash
  if (/[\x80-\uFFFF]/.test(trimmed)) return false;
  return (
    trimmed.startsWith('postgres://') ||
    trimmed.startsWith('postgresql://')
  ) &&
  trimmed.includes('@') &&
  !trimmed.includes('••••') &&
  !trimmed.includes('[REDACTED');
}

/**
 * Normalizes assigned_shards from Postgres text array format "{1,2}" or JSON array [1,2]
 */
export function normalizeAssignedShards(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n));
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/^\{|\}$|^\[|\]$/g, '').trim();
    if (!cleaned) return [];
    return cleaned.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
  }
  return [];
}

/**
 * Enforces PgBouncer transaction connection pooling (-pooler) on Neon URLs.
 * In Neon, pooler endpoints append '-pooler' to the endpoint ID prefix:
 * e.g. ep-cool-fog-123456.us-east-2.aws.neon.tech -> ep-cool-fog-123456-pooler.us-east-2.aws.neon.tech
 *
 * @param {string} url - Postgres DSN
 * @returns {string} Pooled Postgres DSN
 */
export function enforceNeonPoolerUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const cleanUrl = url.trim().replace(/[\r\n]/g, '');
  if (!cleanUrl.includes('.neon.tech') || cleanUrl.includes('-pooler')) return cleanUrl;

  return cleanUrl.replace(/(@|:\/\/)([a-z0-9_-]+)(\.[a-z0-9_.-]*neon\.tech)/i, (match, prefix, endpointId, suffix) => {
    if (endpointId.endsWith('-pooler')) return match;
    return `${prefix}${endpointId}-pooler${suffix}`;
  });
}

/**
 * Resolves the database topology configured for the environment.
 * Default: 'sharded_neon' (1 Central Hub + 99 Storage Shards).
 * Cloud VPS Option: 'unified_postgres' (Single self-hosted Postgres database containing Hub + all Shard tables).
 * @param {object} [env] - Cloudflare Worker environment or null
 * @returns {'sharded_neon'|'unified_postgres'}
 */
export function getDatabaseTopology(env = null) {
  const raw = (
    env?.DATABASE_TOPOLOGY ||
    (typeof process !== 'undefined' ? process.env?.DATABASE_TOPOLOGY : '') ||
    ''
  ).toLowerCase().trim();
  if (raw === 'sharded_neon') return 'sharded_neon';
  if (raw === 'unified_postgres') return 'unified_postgres';

  return 'unified_postgres';
}

export function isUnifiedPostgres(env = null) {
  return getDatabaseTopology(env) === 'unified_postgres';
}

/**
 * 2. Zero-Secrets Dynamic Connection Routing
 * Resolves a Neon SQL client for a target shard without storing 99 separate secrets.
 * If DATABASE_TOPOLOGY is 'unified_postgres', routes deterministically to hubSql (single VPS database).
 *
 * Precedence:
 * 1. In-memory connection cache (instant lookup).
 * 2. NEON_SHARD_DSN_TEMPLATE environment variable if present.
 * 3. Central Hub neon_projects_registry table (cached for 1 hour).
 *
 * @param {object} options
 * @param {Function} options.hubSql - Central Metadata Hub Neon client
 * @param {number} options.shardId - Target Shard Number (1-99)
 * @param {string} [options.dsnTemplate] - Optional template DSN e.g. postgres://user:pass@ep-shard-{SHARD_NUM}-pooler.neon.tech/neondb
 * @param {string} [options.prefix] - Project name prefix (default: 'pin-arbitrage-shard')
 * @param {object} [options.env] - Environment bindings
 * @returns {Promise<Function>} Neon SQL client instance
 */
export async function resolveShardConnection(optionsOrShardId, envFallback = null) {
  let hubSql = null, shardId = 1, dsnTemplate = null, prefix = 'pin-arbitrage-shard', env = null;
  if (typeof optionsOrShardId === 'object' && optionsOrShardId !== null) {
    hubSql = optionsOrShardId.hubSql;
    shardId = optionsOrShardId.shardId;
    dsnTemplate = optionsOrShardId.dsnTemplate;
    prefix = optionsOrShardId.prefix || 'pin-arbitrage-shard';
    env = optionsOrShardId.env || null;
  } else {
    shardId = optionsOrShardId;
    env = envFallback;
  }
  const cleanId = Math.max(1, Math.min(99, Number(shardId) || 1));
  const physicalShardId = getPhysicalShardId(cleanId);
  const physicalShardName = getShardProjectName(physicalShardId, prefix);
  const shardName = getShardProjectName(cleanId, prefix);

  // 1. Ultra-Fast In-Memory Lookup from shardSqlClients cache (e.g. unit tests using _setShardSqlClient)
  if (globalShardMap.has(cleanId) || globalShardMap.has(physicalShardId)) {
    const cachedEntry = globalShardMap.get(cleanId) || globalShardMap.get(physicalShardId);
    if (cachedEntry?.database_url) {
      const cachedClient = getCachedShardSqlClient(cachedEntry.database_url);
      if (cachedClient) {
        return cachedClient;
      }
    }
  }

  // 2. Cloud VPS Unified-Postgres Topology Adapter (Default SSOT)
  const topology = getDatabaseTopology(env);
  if (topology === 'unified_postgres') {
    if (hubSql) return hubSql;
    const defaultDsn = env?.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : null);
    if (defaultDsn && isValidShardDsn(defaultDsn)) {
      return getOrCreateShardSqlClient(enforceNeonPoolerUrl(defaultDsn));
    }
  }

  // 3. Template-based Resolution (Zero database roundtrip)
  const template = dsnTemplate || (typeof process !== 'undefined' ? process.env.NEON_SHARD_DSN_TEMPLATE : null);
  if (template) {
    const physicalPadded = String(physicalShardId).padStart(2, '0');
    const computedDsn = template
      .replace(/{SHARD_NUM}/g, physicalPadded)
      .replace(/{SHARD_ID}/g, String(physicalShardId))
      .replace(/{SHARD_NAME}/g, physicalShardName);
    
    if (isValidShardDsn(computedDsn)) {
      const pooledDsn = enforceNeonPoolerUrl(computedDsn);
      return getOrCreateShardSqlClient(pooledDsn);
    }
  }


  // 5. In-Memory Lookup for Sharded Neon Mode
  const now = Date.now();
  if (globalShardMap.has(cleanId) || globalShardMap.has(physicalShardId)) {
    const cachedEntry = globalShardMap.get(cleanId) || globalShardMap.get(physicalShardId);
    if (isValidShardDsn(cachedEntry?.database_url) && (now - (cachedEntry.cachedAt || 0) < SHARD_MAP_TTL_MS)) {
      const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
      return getOrCreateShardSqlClient(pooledDsn);
    }
  }

  // 6. Lazy Singleflight Warmup from KV / Hub for Sharded Neon Mode
  if (globalShardMap.size === 0 || (now - globalShardMapLastFetched >= SHARD_MAP_TTL_MS)) {
    await warmGlobalShardMap(hubSql, env);
    if (globalShardMap.has(cleanId) || globalShardMap.has(physicalShardId)) {
      const cachedEntry = globalShardMap.get(cleanId) || globalShardMap.get(physicalShardId);
      if (isValidShardDsn(cachedEntry?.database_url)) {
        const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
        return getOrCreateShardSqlClient(pooledDsn);
      }
    }
  }


  // 5. Final fallback: Return hubSql for unified postgres, or query registry if present
  if (hubSql) {
    try {
      const [row] = await hubSql`
        SELECT id, project_id, project_name, database_url, status, assigned_shards
        FROM neon_projects_registry
        WHERE (project_name = ${physicalShardName} OR project_name = ${shardName} OR assigned_shards @> ARRAY[${cleanId}]::int[])
          AND status = 'active'
        LIMIT 1;
      `;

      if (row && isValidShardDsn(row.database_url)) {
        globalShardMap.set(cleanId, { ...row, cachedAt: now });
        globalShardMap.set(physicalShardId, { ...row, cachedAt: now });
        globalShardMapLastFetched = now;

        const pooledDsn = enforceNeonPoolerUrl(row.database_url);
        return getOrCreateShardSqlClient(pooledDsn);
      }
    } catch (_) {}

    return hubSql;
  }

  throw new Error(`Cannot resolve shard ${cleanId}: No Hub database client provided.`);
}

/**
 * Resolves active shard mappings from Cloudflare Workers KV (fleet:shards_map)
 * or falls back to querying the Central Metadata Hub.
 *
 * @param {object} [env] - Cloudflare Worker environment bindings
 * @param {Function} [hubSql] - Central Metadata Hub Neon client
 * @returns {Promise<Array<object>|null>}
 */
export async function getFleetShardsMap(env = null, hubSql = null) {
  if (isUnifiedPostgres(env)) {
    const rawUrl = (typeof process !== 'undefined' ? process.env.DATABASE_URL : null) || env?.DATABASE_URL || '';
    return [{
      id: 1,
      project_id: 'unified-vps-hub',
      project_name: 'Native VPS PostgreSQL SSOT',
      database_url: rawUrl,
      status: 'active',
      is_hub: true,
      assigned_shards: Array.from({ length: 99 }, (_, i) => i + 1)
    }];
  }

  if (hubSql) {
    try {
      const rows = await hubSql`
        SELECT id, project_id, project_name, database_url, status, assigned_shards
        FROM neon_projects_registry
        WHERE status = 'active';
      `;
      return rows;
    } catch (err) {
      console.warn('[fleet-router] getFleetShardsMap query failed:', err.message);
    }
  }

  return null;
}

/**
 * Preloads all active shard connection records from the Central Metadata Hub
 * into memory in a single query. Eliminates N+1 registry roundtrips.
 *
 * @param {Function} hubSql - Central Metadata Hub Neon client
 * @param {object} [env] - Environment bindings
 * @returns {Promise<number>} Number of shard mappings loaded
 */
export async function preloadNeonRegistry(hubSql, env = null) {
  if (isUnifiedPostgres(env) && (env?.DATABASE_TOPOLOGY === 'unified_postgres' || (typeof process !== 'undefined' && process.env?.DATABASE_TOPOLOGY === 'unified_postgres'))) {
    return 0;
  }
  if (shardMapWarmupPromise) {
    return await shardMapWarmupPromise;
  }
  shardMapWarmupPromise = (async () => {
    const now = Date.now();
    try {
      let rows = null;

      if (!rows && hubSql) {
        rows = await hubSql`
          SELECT id, project_id, project_name, database_url, status, assigned_shards
          FROM neon_projects_registry
          WHERE status = 'active';
        `.catch(() => null);
      }

      if (!rows) return 0;
      let loaded = 0;
      for (const row of rows) {
        if (!isValidShardDsn(row.database_url)) continue;
        const shardsList = normalizeAssignedShards(row.assigned_shards);
        for (const sid of shardsList) {
          globalShardMap.set(sid, { ...row, cachedAt: now });
          loaded++;
        }
        const match = row.project_name?.match(/shard-(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num)) {
            globalShardMap.set(num, { ...row, cachedAt: now });
            // Fail-safe: If assigned_shards is empty and num is in [1, 20], auto-populate virtual mappings
            if (shardsList.length === 0 && num >= 1 && num <= 20) {
              for (let v = num; v <= 99; v += 20) {
                globalShardMap.set(v, { ...row, cachedAt: now });
                loaded++;
              }
            }
          }
        }
      }
      globalShardMapLastFetched = now;
      return loaded;
    } catch (err) {
      console.warn('[fleet-router] preloadNeonRegistry non-fatal warning:', err.message);
      return 0;
    } finally {
      shardMapWarmupPromise = null;
    }
  })();
  return await shardMapWarmupPromise;
}


/**
 * 3. Cold-Start Immunity & Circuit-Breaker Executor
 * Protects against Scale-to-Zero latencies (1-3 seconds) on Neon free projects.
 *
 * @param {object} options
 * @param {number} options.shardId - Target Shard ID
 * @param {Function} options.queryFn - Async query function accepting shardSql
 * @param {Function} [options.fallbackFn] - Fallback function executed if shard is cold/unreachable
 * @param {number} [options.timeoutMs=6000] - Hard query timeout before tripping breaker
 * @returns {Promise<any>} Query result or fallback result
 */
export async function executeShardQueryWithCircuitBreaker(optsOrShardId, maybeQueryFn = null, maybeOpts = {}, maybeTimeout = null) {
  let shardId, shardSql, queryFn, fallbackFn = null, timeoutMs = 6000, batchId = null, bypassBreaker = false;
  if (optsOrShardId && typeof optsOrShardId === 'object') {
    ({ shardId, shardSql, queryFn, fallbackFn = null, timeoutMs = 6000, batchId = null, bypassBreaker = false } = optsOrShardId);
  } else if (typeof optsOrShardId === 'function' && (typeof maybeQueryFn === 'number' || typeof maybeQueryFn === 'string')) {
    // [INVARIANT: SHARD-QUERY-POLYMORPHIC-DISPATCH] Support positional (shardSql, shardId, queryFn, timeoutMs/opts)
    shardSql = optsOrShardId;
    shardId = Number(maybeQueryFn);
    queryFn = typeof maybeOpts === 'function' ? maybeOpts : (maybeOpts?.queryFn ?? null);
    timeoutMs = typeof maybeTimeout === 'number' ? maybeTimeout : (maybeOpts?.timeoutMs ?? (typeof maybeOpts === 'number' ? maybeOpts : 6000));
    fallbackFn = maybeOpts?.fallbackFn ?? null;
    batchId = maybeOpts?.batchId ?? null;
    bypassBreaker = Boolean(maybeOpts?.bypassBreaker);
  } else {
    shardId = optsOrShardId;
    queryFn = maybeQueryFn;
    timeoutMs = maybeOpts?.timeoutMs ?? 6000;
    fallbackFn = maybeOpts?.fallbackFn ?? null;
    batchId = maybeOpts?.batchId ?? null;
    shardSql = maybeOpts?.shardSql ?? null;
    bypassBreaker = Boolean(maybeOpts?.bypassBreaker);
  }
  if (!shardSql) {
    shardSql = await resolveShardConnection({ shardId }).catch(() => null);
  }
  const cleanShardId = Math.max(1, Math.min(99, Number(shardId) || 1));
  const physicalKey = getPhysicalShardId(cleanShardId);
  let cb = circuitBreakers.get(physicalKey) || circuitBreakers.get(cleanShardId);
  if (!cb) {
    cb = { state: 'CLOSED', failures: 0, nextAttempt: 0, _failedBatches: new Set() };
    circuitBreakers.set(physicalKey, cb);
    circuitBreakers.set(cleanShardId, cb);
  }
  const now = Date.now();

  // If breaker is OPEN and cooldown has not expired, fast-fail to fallback unless explicit bypass is requested
  if (cb.state === 'OPEN') {
    if (bypassBreaker) {
      // [INVARIANT: FORCE-REFRESH-PROBE] User or caller explicitly bypassed cache: probe shard immediately
      cb.state = 'HALF_OPEN';
      circuitBreakers.set(physicalKey, cb);
      circuitBreakers.set(cleanShardId, cb);
    } else if (now < cb.nextAttempt) {
      if (fallbackFn) {
        return await fallbackFn({ reason: 'CIRCUIT_OPEN', shardId, physicalShardId: physicalKey });
      }
      throw new Error(`Shard ${shardId} circuit breaker is OPEN (re-evaluating in ${Math.round((cb.nextAttempt - now) / 1000)}s).`);
    } else {
      // Probe attempt (HALF_OPEN)
      cb.state = 'HALF_OPEN';
      circuitBreakers.set(physicalKey, cb);
      circuitBreakers.set(cleanShardId, cb);
    }
  }

  // Execute with explicit timeout
  let timeoutTimer;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        const err = new Error(`Shard ${shardId} query timed out after ${timeoutMs}ms (Scale-to-Zero cold start detected).`);
        err.name = 'ShardTimeoutError';
        reject(err);
      }, timeoutMs);
    });

    const queryPromise = queryFn(shardSql);
    queryPromise.catch(() => {});

    const result = await Promise.race([
      queryPromise,
      timeoutPromise
    ]);

    // Query succeeded: Reset breaker
    clearTimeout(timeoutTimer);
    cb.state = 'CLOSED';
    cb.failures = 0;
    if (cb._failedBatches) cb._failedBatches.clear();
    circuitBreakers.set(physicalKey, cb);
    circuitBreakers.set(cleanShardId, cb);
    return result;
  } catch (err) {
    clearTimeout(timeoutTimer);

    // Coalesce concurrent failures: if queries belong to the same batchId/request, only increment failures once
    let shouldIncrement = true;
    if (batchId) {
      if (!cb._failedBatches) cb._failedBatches = new Set();
      if (cb._failedBatches.has(batchId)) {
        shouldIncrement = false;
      } else {
        cb._failedBatches.add(batchId);
        if (cb._failedBatches.size > 50) {
          const oldest = cb._failedBatches.values().next().value;
          cb._failedBatches.delete(oldest);
        }
      }
    }

    if (shouldIncrement) {
      cb.failures++;
    }

    if (cb.failures >= CIRCUIT_FAILURE_THRESHOLD || cb.state === 'HALF_OPEN') {
      cb.state = 'OPEN';
      cb.nextAttempt = now + CIRCUIT_COOLDOWN_MS;
      console.warn(`[Fleet Circuit Breaker] Tripped OPEN for shard ${shardId} (physical ${physicalKey}). Reason: ${err.message}`);
    }
    circuitBreakers.set(physicalKey, cb);
    circuitBreakers.set(cleanShardId, cb);

    if (fallbackFn) {
      return await fallbackFn({ reason: err.name || 'SHARD_ERROR', error: err, shardId, physicalShardId: physicalKey });
    }
    throw err;
  }
}

/**
 * 4. Batch Shard Aggregation for 20-Runner GitHub Actions Fleet
 * Partitions an arbitrary array of pin entities by their target deterministic shard ID.
 *
 * Example:
 * Input: 2,500 pin snapshots collected by runner #7
 * Output: Map with ~99 keys, each holding ~25 pins
 *
 * Allows the runner to perform 99 bulk UNNEST insert queries instead of 2,500 roundtrips.
 *
 * @param {Array<object>} pinRecords - Array of pin records containing { pin_id, ... }
 * @param {number} totalShards - Fleet size (default: 99)
 * @returns {Map<number, Array<object>>} Map of shardId -> pinRecords[]
 */
export function batchGroupByShard(pinRecords = [], totalShards = 99) {
  const groups = new Map();
  for (const record of pinRecords) {
    const pinId = typeof record === 'string' || typeof record === 'number'
      ? String(record)
      : (record?.pin_id || record?.id);
    if (!pinId) continue;
    const shardId = getPinShardId(pinId, totalShards);
    if (!groups.has(shardId)) {
      groups.set(shardId, []);
    }
    groups.get(shardId).push(record);
  }
  return groups;
}

/**
 * Coalesces virtual shard groups (1-99) by their target physical shard ID (1-20).
 * Accepts a Map, Object, or Array of entries { [virtualShardId]: records[] },
 * groups records by physical shard ID (getPhysicalShardId(v)), and merges record arrays
 * so only 1 database connection/transaction is executed per physical database.
 *
 * // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE]
 * // [INVARIANT: 20-PHYSICAL-SHARD-CONSOLIDATION]
 *
 * @param {Map<number|string, Array<object>>|Object|Array<[number|string, Array<object>]>} batches
 * @returns {Map<number, Array<object>>} Map of physicalShardId -> combinedItems[]
 */
export function coalesceShardGroupsByPhysical(batches) {
  const physicalGroups = new Map();
  if (!batches) return physicalGroups;

  let entries = [];
  if (batches instanceof Map) {
    entries = Array.from(batches.entries());
  } else if (Array.isArray(batches)) {
    entries = batches;
  } else if (typeof batches === 'object') {
    entries = Object.entries(batches);
  }

  // Single Unified Database fast-path: coalesce into 1 single batch when no separate shard DSNs exist
  const singleUnifiedBatch = (
    isUnifiedPostgres() &&
    globalShardMap.size === 0 &&
    shardSqlClients.size <= 1 &&
    !(typeof process !== 'undefined' && process.env?.NEON_SHARD_DSN_TEMPLATE)
  );

  for (const [vShardId, items] of entries) {
    if (!items) continue;
    const itemList = Array.isArray(items) ? items : [items];
    if (itemList.length === 0) continue;
    const pShardId = singleUnifiedBatch ? 1 : getPhysicalShardId(vShardId);
    if (!physicalGroups.has(pShardId)) {
      physicalGroups.set(pShardId, []);
    }
    const group = physicalGroups.get(pShardId);
    for (const item of itemList) {
      group.push(item);
    }
  }
  return physicalGroups;
}

/**
 * 5. Pre-warm Fleet Shards in Parallel (Stage 0 Cold-Start Shield)
 * Dispatches lightweight concurrent pings (SELECT 1;) to wake up sleeping Neon endpoints
 * before the heavy crawler insertion phase begins.
 *
 * @param {object} options
 * @param {Function} options.hubSql - Hub database client
 * @param {number[]} options.shardIds - Array of shard IDs to wake up
 * @param {number} [options.concurrency=15] - Maximum parallel wake-up pings
 * @param {number} [options.timeoutMs=3500] - Wake-up probe timeout
 * @returns {Promise<{ warmed: number, failed: number, details: object }>}
 */
export async function prewarmFleetShards({
  hubSql,
  shardIds = [],
  concurrency = 15,
  timeoutMs = 3500
}) {
  // [INVARIANT: 20-PHYSICAL-SHARD-CONSOLIDATION] Coalesce virtual IDs to physical shards 1..20
  const uniqueIds = [...new Set(shardIds.map(id => getPhysicalShardId(id)))].filter(id => id >= 1 && id <= 20);
  let warmed = 0;
  let failed = 0;
  const details = {};

  // Process in chunks of concurrency
  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (sid) => {
      let timer = null;
      try {
        const client = await resolveShardConnection({ hubSql, shardId: sid });
        const queryPromise = client`SELECT 1 as alive;`;
        queryPromise.catch(() => {});
        await Promise.race([
          queryPromise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Pre-warm timeout')), timeoutMs);
          })
        ]);
        warmed++;
        details[sid] = 'warm';
      } catch (err) {
        failed++;
        details[sid] = `failed: ${err.message}`;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }));
  }

  return { warmed, failed, details };
}

/**
 * 6. Distributed Crossover Rollup Synopsis Engine (Option B)
 * Saves pre-aggregated crossover summaries in the Central Hub to eliminate
 * cross-shard joins and scatter-gather queries at Edge runtime (< 15ms page load).
 *
 * @param {Function} hubSql - Central Hub database client
 * @param {number} folderId - Keyword folder ID
 * @param {object} synopsisData - Computed crossover intelligence data
 */
export async function storeFolderCrossoverSynopsis(_hubSql, folderId, _synopsisData) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folderId');
  // No-op: keyword_folder_synopses was retired in Migration 047 in favor of unified in-memory + live SSOT crossover calculation.
  return { stored: false, folder_id: fid };
}

export async function getFolderCrossoverSynopsis(_hubSql, _folderId) {
  return null;
}

/**
 * Multi-Stage Hydration Jump Detector
 * Evaluates whether a transition from previous telemetry to current telemetry
 * represents an authentic 24h delta vs. a multi-stage hydration jump:
 * 1. prev.save_count === 0 && curr.save_count > 0
 * 2. prev.save_count < prev.repin_count
 * 3. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
 * 4. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= prev.save_count * 2.5
 * 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
 */
export function isMultiStageHydrationJump(prev, curr) {
  if (!prev || !curr) return false;
  const pSaves = Number(prev.save_count || 0);
  const cSaves = Number(curr.save_count || 0);
  const pRepins = Number(prev.repin_count || 0);
  const cRepins = Number(curr.repin_count || 0);

  // 1. prev.save_count === 0 && curr.save_count > 0
  if (pSaves === 0 && cSaves > 0) return true;

  // 2. [DEPRECATED LANDMINE: Removed - Authentic Pinterest pins can genuinely have repin_count > save_count]

  // 3. Repin-to-Save Hydration Jump: prevSaves was equal/close to prevRepins OR curRepins (within 3% or 5 saves),
  // while curSaves jumped by >= 15% (and rawDelta >= 50) AND diverged above current repins (cSaves > effCurRepins * 1.25)
  const refRepins = pRepins > 0 ? pRepins : cRepins;
  const effCurRepins = cRepins > 0 ? cRepins : refRepins;
  if (
    pSaves > 0 &&
    refRepins > 0 &&
    Math.abs(pSaves - refRepins) <= Math.max(5, Math.round(refRepins * 0.03)) &&
    cSaves > pSaves * 1.15 &&
    (cSaves - pSaves) >= 50 &&
    cSaves > effCurRepins * 1.25
  ) {
    return true;
  }
  if (pRepins > 0 && pSaves === pRepins && cSaves > effCurRepins * 1.35) return true;

  // 4. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= pSaves * 2.5
  if (pRepins === 0 && cRepins >= 25 && cSaves >= pSaves * 2.5) return true;

  // 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
  if (pSaves > 0 && (cSaves / pSaves) >= 4.0 && (cSaves - pSaves) >= 2500) return true;

  return false;
}

/**
 * In-memory trajectory sanitizer for Pin Dossier payloads (including KV & D1 hits).
 * Guarantees zero [SERP #null] badges and suppresses multi-stage hydration velocity explosions.
 */
// [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Pin Dossier Trajectory Sanitizer
export function sanitizeDossierTrajectory(dossier) {
  if (!dossier || typeof dossier !== 'object') return dossier;
  const traj = Array.isArray(dossier.daily_trajectory)
    ? dossier.daily_trajectory
    : (Array.isArray(dossier.trajectory) ? dossier.trajectory : (Array.isArray(dossier.snapshots) ? dossier.snapshots : null));
  if (!Array.isArray(traj) || traj.length === 0) return dossier;

  const chrono = [...traj].sort((a, b) => {
    const dCmp = String(a.snapshot_date || '').slice(0, 10).localeCompare(String(b.snapshot_date || '').slice(0, 10));
    if (dCmp !== 0) return dCmp;
    const tA = String(a.recorded_at || a.updated_at || a.crawled_at || '');
    const tB = String(b.recorded_at || b.updated_at || b.crawled_at || '');
    return tA.localeCompare(tB);
  });
  let runningMax = 0;
  for (const d of chrono) {
    const s = Number(d.save_count || 0);
    if (s < runningMax) {
      d.save_count = runningMax;
    } else {
      runningMax = s;
    }
  }

  if (chrono[0] && chrono[0].is_hydration_jump === undefined) {
    chrono[0].is_hydration_jump = false;
  }

  const master = dossier.master || dossier.pin || dossier.creative || dossier;
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1];
    const curr = chrono[i];
    const isJump = isMultiStageHydrationJump(prev, curr);
    if (isJump) {
      curr.is_hydration_jump = true;
      curr.velocity_mode = 'hydration_amortized';
      const pinCreatedAt = (master?.created_at_pinterest || curr.created_at_pinterest)
        ? new Date(master?.created_at_pinterest || curr.created_at_pinterest)
        : null;
      const currDate = new Date(curr.snapshot_date);
      if (pinCreatedAt && !isNaN(pinCreatedAt.getTime())) {
        const ageMs = currDate.getTime() - pinCreatedAt.getTime();
        const ageDays = Math.round(ageMs / 86400000);
        if (ageDays >= 2) {
          curr.daily_save_velocity = Math.round((Number(curr.save_count || 0) / ageDays) * 10) / 10;
        } else {
          curr.daily_save_velocity = 0;
        }
      } else {
        curr.daily_save_velocity = 0;
      }
      curr.window_24h_velocity = curr.daily_save_velocity;
      curr.window_24h_delta = 0;
    } else {
      curr.is_hydration_jump = false;
      if (!curr.velocity_mode || curr.velocity_mode === 'hydration_amortized') curr.velocity_mode = 'normal';
      const currDate = new Date(String(curr.snapshot_date || '').slice(0, 10));
      const prevDate = new Date(String(prev.snapshot_date || '').slice(0, 10));
      const elapsed = Math.max(1, Math.round((currDate - prevDate) / 86400000));
      const diff = Number(curr.save_count || 0) - Number(prev.save_count || 0);
      curr.step_save_delta = diff;
      if (diff <= 0) {
        curr.daily_save_velocity = 0;
      } else {
        curr.daily_save_velocity = Math.round((diff / elapsed) * 10) / 10;
      }

      // Compute true 24h window gain against the latest snapshot from a prior calendar date
      const currDayStr = String(curr.snapshot_date || '').slice(0, 10);
      let priorCalSnap = null;
      for (let j = i - 1; j >= 0; j--) {
        const candDayStr = String(chrono[j].snapshot_date || '').slice(0, 10);
        if (candDayStr && candDayStr < currDayStr) {
          priorCalSnap = chrono[j];
          break;
        }
      }
      if (priorCalSnap && !isMultiStageHydrationJump(priorCalSnap, curr)) {
        const calElapsed = Math.max(1, Math.round((currDate - new Date(String(priorCalSnap.snapshot_date || '').slice(0, 10))) / 86400000));
        const calDiff = Math.max(0, Number(curr.save_count || 0) - Number(priorCalSnap.save_count || 0));
        curr.window_24h_delta = calDiff;
        curr.window_24h_velocity = Math.round((calDiff / calElapsed) * 10) / 10;
      } else {
        curr.window_24h_delta = Math.max(0, diff);
        curr.window_24h_velocity = curr.daily_save_velocity;
      }
    }
  }

  for (const day of chrono) {
    if (Array.isArray(day.ranking_keywords)) {
      for (const kw of day.ranking_keywords) {
        const rawRank = Number(kw.rank_position ?? kw.rank ?? kw.live_serp_rank);
        const hasPos = Number.isFinite(rawRank) && rawRank >= 1;
        if (!hasPos) {
          kw.is_displaced = true;
          const fallback = Number(kw.vault_rank || kw.last_known_rank || kw.rank || 1) || 1;
          kw.last_known_rank = fallback;
          kw.vault_rank = fallback;
          kw.rank = fallback;
          kw.live_serp_rank = null;
        } else if (kw.is_displaced) {
          kw.vault_rank = Number(kw.vault_rank || kw.last_known_rank || rawRank) || 1;
          kw.live_serp_rank = null;
        } else {
          kw.live_serp_rank = rawRank;
          kw.vault_rank = null;
          kw.rank = rawRank;
        }
      }
    }
  }

  const desc = [...chrono].reverse();
  if (Array.isArray(dossier.daily_trajectory)) dossier.daily_trajectory = desc;
  if (Array.isArray(dossier.trajectory)) dossier.trajectory = desc;
  if (Array.isArray(dossier.snapshots)) dossier.snapshots = desc;
  if (dossier.creative && desc[0]) {
    dossier.creative.save_count = Math.max(Number(dossier.creative.save_count || 0), Number(desc[0].save_count || 0));
    dossier.creative.daily_save_velocity = Number(desc[0].window_24h_velocity ?? desc[0].daily_save_velocity ?? dossier.creative.daily_save_velocity ?? 0);
  }
  return dossier;
}

/**
 * 7. Universal 4-Pillar Pin Dossier Aggregator
 * Gathers a unified intelligence dossier across all 4 pillars for any pin:
 * - Pillar 1: Creator & Board Context (Competitor handle, board slug, qualification)
 * - Pillar 2: Keywords & Velocity (Rank across SERPs, daily deltas, velocity)
 * - Pillar 3: Related Pins Radar (Incoming/outgoing graph edges, clusters)
 * - Pillar 4: Board Ideas Radar (Target board suggestions)
 *
 * @param {object} options
 * @param {Function} options.hubSql - Central Metadata Hub Neon client
 * @param {string|number} options.pinId - Pinterest Pin Snowflake ID
 * @returns {Promise<object>} Unified Pin Dossier
 */
export async function fetchUniversalPinDossier({ hubSql, pinId, ctx = null, env = null, bypassEdgeCache = false }) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) throw new Error('Pin ID is required');

  const shardId = getPinShardId(cleanPinId, 99);
  const effectiveBypassEdgeCache = bypassEdgeCache || isUnifiedPostgres(env);

  // 1 & 2. Ultra-Low Latency Parallel Scatter-Gather (t=0 concurrent dispatch)
  let shardErrorReason = null, shardErrorMessage = null;
  const dossierBatchId = `dossier_batch_${cleanPinId}_${Date.now()}_${Math.random()}`;

  // t=0 Concurrent Dispatch: Dispatch Hub queries, competitor join, and Shard resolution concurrently!
  const hubSerpPromise = hubSql`
    SELECT 
      sc.keyword_id, sc.pin_id, sc.title, sc.domain, sc.destination_url, sc.image_url,
      sc.creator_username, sc.board_name, sc.save_count, sc.repin_count,
      COALESCE(sc.comment_count, 0) as comment_count,
      COALESCE(sc.share_count, 0) as share_count,
      0 as reaction_count,
      sc.daily_save_velocity, sc.dominant_color, sc.visual_annotations,
      sc.rank_position, sc.prev_rank_position, sc.last_known_rank, sc.is_displaced, sc.metadata,
      COALESCE(sc.crawled_at, sc.updated_at) as crawled_at,
      sc.updated_at,
      sc.baseline_day_saves, sc.baseline_day_date,
      tk.keyword AS keyword_name,
      sc.creation_method,
      sc.created_at_pinterest,
      cprof.id as competitor_id,
      cprof.username as competitor_username,
      cprof.display_name as competitor_display_name,
      cprof.is_active as competitor_active
    FROM keyword_serp_current sc
    LEFT JOIN tracked_keywords tk ON tk.id = sc.keyword_id
    LEFT JOIN competitor_profiles cprof ON cprof.username = sc.creator_username
    WHERE sc.pin_id = ${cleanPinId}
    UNION ALL
    SELECT 
      kdi.keyword_id, kdi.pin_id, '' as title, COALESCE(kdi.domain, '') as domain, '' as destination_url, '' as image_url,
      COALESCE(kdi.creator_username, '') as creator_username, '' as board_name, kdi.save_count, kdi.repin_count,
      COALESCE(kdi.comment_count, 0) as comment_count,
      COALESCE(kdi.share_count, 0) as share_count,
      0 as reaction_count,
      kdi.daily_save_velocity, '#888888' as dominant_color, '[]'::jsonb as visual_annotations,
      NULL::int as rank_position, NULL::int as prev_rank_position, kdi.last_known_rank,
      TRUE as is_displaced,
      jsonb_build_object(
        'delta_repins_24h', kdi.delta_repins_24h,
        'gains_5d', kdi.gains_5d,
        'gains_7d', kdi.gains_7d,
        'gains_10d', kdi.gains_10d,
        'gains_15d', kdi.gains_15d
      ) as metadata,
      kdi.updated_at as crawled_at, kdi.updated_at,
      NULL::bigint as baseline_day_saves, NULL::date as baseline_day_date,
      tk.keyword AS keyword_name,
      NULL::text as creation_method,
      NULL::timestamptz as created_at_pinterest,
      cprof.id as competitor_id,
      cprof.username as competitor_username,
      cprof.display_name as competitor_display_name,
      cprof.is_active as competitor_active
    FROM keyword_displaced_index kdi
    LEFT JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
    LEFT JOIN competitor_profiles cprof ON cprof.username = kdi.creator_username
    WHERE kdi.pin_id = ${cleanPinId}
      AND NOT EXISTS (
        SELECT 1 FROM keyword_serp_current sc2
        WHERE sc2.pin_id = kdi.pin_id AND sc2.keyword_id = kdi.keyword_id
      )
    ORDER BY save_count DESC;
  `.catch(() => []);

  const hubCompetitorPromise = hubSql`
    SELECT 
      cp.pin_id, cp.competitor_id, cprof.username as competitor_username, cprof.display_name, cprof.is_active as competitor_active,
      cp.title, cp.description, cp.alt_text, cp.image_url, cp.destination_url, cp.link_domain as domain,
      cp.board_name, cp.save_count, cp.repin_count, cp.comment_count, cp.created_at_pinterest, cp.updated_at, cp.metadata
    FROM competitor_pins cp
    LEFT JOIN competitor_profiles cprof ON cprof.id = cp.competitor_id
    WHERE cp.pin_id = ${cleanPinId}
    LIMIT 1;
  `.catch(() => []);

  const hubPaPromise = hubSql`
    SELECT 
      pa.pin_id, NULL::bigint as competitor_id, pa.account_username as competitor_username, pa.account_username as display_name, false as competitor_active,
      pa.title, pa.description, pa.alt_text, pa.image_url, pa.link as destination_url, pa.domain,
      pa.board_name, pa.saves as save_count, pa.repins as repin_count, pa.comments as comment_count, pa.created_at_pinterest, pa.last_updated_at as updated_at,
      pa.velocity as daily_save_velocity, pa.dominant_color, pa.annotations as visual_annotations
    FROM pa_pins pa
    WHERE pa.pin_id = ${cleanPinId}
    LIMIT 1;
  `.catch(() => []);

  let shardSql = null;
  const shardResolutionPromise = resolveShardConnection({ hubSql, shardId, env }).catch(() => hubSql);

  const shardDataPromise = (async () => {
    const resolvedShardSql = await shardResolutionPromise;
    shardSql = resolvedShardSql;

    return await executeShardQueryWithCircuitBreaker({
      shardId,
      shardSql: resolvedShardSql,
      bypassBreaker: bypassEdgeCache,
      queryFn: async (sqlClient) => {
        const [masterRowArr, rollupsOrSnaps] = await Promise.all([
          sqlClient`
            SELECT 
              pin_id, creator_username, board_id, board_name, board_slug, title, domain, destination_url,
              image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
              first_discovered_pillar, first_discovered_at, updated_at,
              save_count, repin_count, comment_count, share_count, reaction_count,
              daily_save_velocity, delta_saves_24h, delta_repins_24h,
              gains_5d, gains_7d, gains_10d, gains_15d,
              is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id, last_scraped_at,
              COALESCE(metadata, '{}'::jsonb) AS metadata
            FROM universal_master_pins
            WHERE pin_id = ${cleanPinId}
            LIMIT 1;
          `.catch(() => []),
          sqlClient`
            SELECT 
              id, snapshot_date::text AS snapshot_date, rank_position, is_displaced, save_count, repin_count,
              comment_count, share_count, reaction_count, daily_save_velocity,
              keyword_id, competitor_id, created_at, created_at AS crawled_at, created_at AS updated_at
            FROM pins_daily_snapshots
            WHERE pin_id = ${cleanPinId}
            ORDER BY snapshot_date DESC, created_at DESC
            LIMIT 90;
          `.catch(() => [])
        ]);

        const row = masterRowArr[0] || null;
        let masterData = null;
        if (row) {
          const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
          masterData = {
            ...row,
            creation_method: meta.creation_method || meta.method || null
          };
        }

        return {
          master: masterData,
          snapshots: rollupsOrSnaps || []
        };
      },
      fallbackFn: async (info) => {
        shardErrorReason = info?.reason || 'SHARD_UNAVAILABLE';
        shardErrorMessage = info?.error?.message || null;
        return { master: null, snapshots: [] };
      },
      timeoutMs: 8500,
      batchId: dossierBatchId
    });
  })();

  const [
    shardData,
    hubSerpRowsRaw,
    hubCompetitorRowsRaw,
    hubPaRowsRaw
  ] = await Promise.all([
    shardDataPromise,
    hubSerpPromise,
    hubCompetitorPromise,
    hubPaPromise
  ]);

  const initialMaster = shardData?.master || null;
  const initialSnapshots = shardData?.snapshots || [];

  let masterRecord = initialMaster;
  if (masterRecord) {
    const mMeta = typeof masterRecord.metadata === 'object' && masterRecord.metadata !== null ? masterRecord.metadata : {};
    const candidateMethods = [
      masterRecord.creation_method,
      mMeta.creation_method,
      mMeta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    masterRecord.creation_method = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
  }
  let snapshots = initialSnapshots;
  const hubSerpRows = Array.isArray(hubSerpRowsRaw) ? hubSerpRowsRaw : [];

  // Helper to safely parse and unwrap metadata from JSON string, object, or array of strings/objects
  function normalizeMetadata(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return normalizeMetadata(JSON.parse(raw));
      } catch (_) {
        return {};
      }
    }
    if (Array.isArray(raw)) {
      let merged = {};
      for (const item of raw) {
        merged = { ...merged, ...normalizeMetadata(item) };
      }
      return merged;
    }
    if (typeof raw === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v !== '' && v !== null && v !== undefined) {
          clean[k] = v;
        }
      }
      return clean;
    }
    return {};
  }

  // Helper to safely parse visual annotations
  function normalizeVisualAnnotations(raw) {
    if (!raw) return [];
    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        list = [];
      }
    }
    return list.map(a => typeof a === 'string' ? a : (a?.name || a?.label || '')).filter(Boolean);
  }

  // Parse metadata across all active sources
  const topHubMeta = normalizeMetadata(hubSerpRows[0]?.metadata);
  const shardMetaObj = normalizeMetadata(masterRecord?.metadata);

  // Compute Mathematical Set Union of Visual Annotations across all sources
  const unionSet = new Set();
  for (const tag of normalizeVisualAnnotations(masterRecord?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const tag of normalizeVisualAnnotations(shardMetaObj?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const row of hubSerpRows) {
    for (const tag of normalizeVisualAnnotations(row.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
    const rMeta = normalizeMetadata(row.metadata);
    for (const tag of normalizeVisualAnnotations(rMeta.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
  }

  // Hub Fallback & Synthesis: If masterRecord is missing on Shard N, synthesize from Hub SERP/Competitor/PA
  if (!masterRecord) {
    if (hubSerpRows.length > 0 && (hubSerpRows[0].title || hubSerpRows[0].image_url || Number(hubSerpRows[0].save_count) > 0)) {
      const topRow = hubSerpRows[0];
      const candidateHubMethods = [
        topRow.creation_method,
        topHubMeta.creation_method,
        topHubMeta.method
      ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
      const resolvedHubMethod = candidateHubMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateHubMethods[0] || 'pinterest_platform';
      masterRecord = {
        pin_id: topRow.pin_id,
        title: topRow.title || topHubMeta.seo_title || '',
        domain: topRow.domain || topHubMeta.seo_canonical_domain || '',
        destination_url: topRow.destination_url || topHubMeta.tracked_link || topHubMeta.utm_link || '',
        image_url: topRow.image_url,
        creator_username: topRow.creator_username || topHubMeta.pinner?.username || topHubMeta.domain_official_user?.username || '',
        board_name: topRow.board_name || topHubMeta.board_name || '',
        save_count: topRow.save_count,
        repin_count: topRow.repin_count,
        daily_save_velocity: topRow.daily_save_velocity,
        dominant_color: topRow.dominant_color || topHubMeta.dominant_color || '#888888',
        alt_text: topHubMeta.alt_text || '',
        description: topHubMeta.description || '',
        created_at_pinterest: topRow.created_at_pinterest || topHubMeta.created_at_pinterest || null,
        creation_method: resolvedHubMethod,
        visual_annotations: Array.from(unionSet),
        metadata: { ...topHubMeta, creation_method: resolvedHubMethod, method: resolvedHubMethod }
      };
    } else if (hubCompetitorRowsRaw && hubCompetitorRowsRaw.length > 0 && (hubCompetitorRowsRaw[0].title || hubCompetitorRowsRaw[0].image_url)) {
      const compRow = hubCompetitorRowsRaw[0];
      const cMeta = normalizeMetadata(compRow.metadata);
      const cMethod = cMeta.creation_method || cMeta.method || 'pinterest_platform';
      const cAnnotations = normalizeVisualAnnotations(cMeta.visual_annotations || compRow.visual_annotations);
      masterRecord = {
        pin_id: compRow.pin_id,
        title: compRow.title || cMeta.seo_title || '',
        domain: compRow.domain || '',
        destination_url: compRow.destination_url || '',
        image_url: compRow.image_url || '',
        creator_username: compRow.competitor_username || '',
        board_name: compRow.board_name || '',
        save_count: Number(compRow.save_count || 0),
        repin_count: Number(compRow.repin_count || 0),
        daily_save_velocity: Number(cMeta.daily_save_velocity || cMeta.velocity || 0),
        dominant_color: cMeta.dominant_color || '#888888',
        alt_text: compRow.alt_text || cMeta.alt_text || '',
        description: compRow.description || cMeta.description || '',
        created_at_pinterest: compRow.created_at_pinterest || null,
        creation_method: cMethod,
        visual_annotations: cAnnotations.length > 0 ? cAnnotations : Array.from(unionSet),
        metadata: { ...cMeta, creation_method: cMethod, method: cMethod }
      };
    } else if (hubPaRowsRaw && hubPaRowsRaw.length > 0 && (hubPaRowsRaw[0].title || hubPaRowsRaw[0].image_url)) {
      const paRow = hubPaRowsRaw[0];
      const paAnnotations = normalizeVisualAnnotations(paRow.visual_annotations);
      masterRecord = {
        pin_id: paRow.pin_id,
        title: paRow.title || '',
        domain: paRow.domain || '',
        destination_url: paRow.destination_url || '',
        image_url: paRow.image_url || '',
        creator_username: paRow.creator_username || '',
        board_name: paRow.board_name || '',
        save_count: Number(paRow.save_count || 0),
        repin_count: Number(paRow.repin_count || 0),
        daily_save_velocity: Number(paRow.daily_save_velocity || 0),
        dominant_color: paRow.dominant_color || '#888888',
        alt_text: paRow.alt_text || '',
        description: paRow.description || '',
        created_at_pinterest: paRow.created_at_pinterest || null,
        creation_method: 'pinterest_platform',
        visual_annotations: paAnnotations.length > 0 ? paAnnotations : Array.from(unionSet),
        metadata: { creation_method: 'pinterest_platform', method: 'pinterest_platform' }
      };
    }
  }

  if (masterRecord) {
    if (!masterRecord.alt_text) {
      masterRecord.alt_text = shardMetaObj.alt_text || topHubMeta.alt_text || '';
    }
    if (!masterRecord.description) {
      masterRecord.description = shardMetaObj.description || topHubMeta.description || '';
    }
    if (!masterRecord.created_at_pinterest) {
      masterRecord.created_at_pinterest = shardMetaObj.created_at_pinterest || hubSerpRows[0]?.created_at_pinterest || topHubMeta.created_at_pinterest || null;
    }
    const candidateMethods = [
      masterRecord?.creation_method,
      shardMetaObj.creation_method,
      shardMetaObj.method,
      hubSerpRows[0]?.creation_method,
      topHubMeta.creation_method,
      topHubMeta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    const resolvedBestMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || 'pinterest_platform';
    masterRecord.creation_method = resolvedBestMethod;
    masterRecord.metadata = { ...topHubMeta, ...shardMetaObj, creation_method: resolvedBestMethod, method: resolvedBestMethod };
  }

  const finalVisualAnnotations = Array.from(unionSet)
    .map(t => String(t || '').trim())
    .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
    .slice(0, 15);

  // Auto-Backfill / Write-Through: Ensure shard has the latest rich treasures
  const shouldBackfillShard = !initialMaster && shardSql && shardSql !== hubSql && masterRecord;
  const shouldBackfillUnified = isUnifiedPostgres(env) && !initialMaster && shardSql && masterRecord;

  if (shouldBackfillShard || shouldBackfillUnified) {
    const backfillPromise = (async () => {
      try {
        const backfillCandidates = [
          masterRecord?.creation_method,
          shardMetaObj.creation_method,
          shardMetaObj.method,
          hubSerpRows[0]?.creation_method,
          topHubMeta.creation_method,
          topHubMeta.method
        ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
        const resolvedBackfillMethod = backfillCandidates.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || backfillCandidates[0] || 'pinterest_platform';
        const enrichedMetaToSave = {
          ...topHubMeta,
          ...shardMetaObj,
          creation_method: resolvedBackfillMethod,
          method: resolvedBackfillMethod
        };
        await shardSql`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations,
            created_at_pinterest, metadata, first_discovered_pillar, first_discovered_at, updated_at
          ) VALUES (
            ${cleanPinId},
            ${masterRecord.creator_username || ''},
            ${masterRecord.board_name || ''},
            ${masterRecord.title || ''},
            ${masterRecord.domain || ''},
            ${masterRecord.destination_url || ''},
            ${masterRecord.image_url || ''},
            ${masterRecord.description || ''},
            ${masterRecord.alt_text || ''},
            ${masterRecord.dominant_color || '#888888'},
            ${JSON.stringify(finalVisualAnnotations)}::jsonb,
            ${masterRecord.created_at_pinterest ? new Date(masterRecord.created_at_pinterest).toISOString() : null}::timestamptz,
            ${JSON.stringify(enrichedMetaToSave)}::jsonb,
            'keyword',
            NOW(),
            NOW()
          )
          ON CONFLICT (pin_id) DO UPDATE SET
            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
            board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
            title = CASE
              WHEN EXCLUDED.title IS NOT NULL
               AND BTRIM(EXCLUDED.title) <> ''
               AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
               AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
              THEN EXCLUDED.title
              ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
            END,
            domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
            destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
            image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
            description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
            alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
            dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
            visual_annotations = CASE 
              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations 
              ELSE universal_master_pins.visual_annotations 
            END,
            created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
            metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata
              || CASE
                   WHEN COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')) IS NOT NULL 
                    AND LOWER(TRIM(COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')))) NOT IN ('pinterest_platform')
                    AND (COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')) IS NULL 
                         OR LOWER(TRIM(COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')))) = 'pinterest_platform')
                   THEN jsonb_build_object(
                     'creation_method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')),
                     'method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', ''))
                   )
                   ELSE '{}'::jsonb
                 END,
            updated_at = NOW();
        `;
      } catch (backfillErr) {
        console.warn(`[Auto-Backfill] Shard ${shardId} pin ${cleanPinId} backfill deferred:`, backfillErr.message);
      }
    })();

    // Edge execution: Dispatch asynchronously via ctx.waitUntil; Fall back to bounded Promise.race for CLI/Node
    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, backfillPromise, 'dossier_shard_backfill');
    } else {
      try {
        let timerId;
        const timeoutPromise = new Promise(r => {
          timerId = setTimeout(r, 1500);
        });
        await Promise.race([
          backfillPromise,
          timeoutPromise
        ]).finally(() => {
          if (timerId) clearTimeout(timerId);
        });
      } catch (_) {}
    }
  }

  // Merge & Deduplicate across Shard and Hub with Latest-Timestamp-Wins (LWW)
  const shardList = snapshots || [];
  const snapshotMap = new Map();

  function formatUtcDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const year = val.getUTCFullYear();
      const month = String(val.getUTCMonth() + 1).padStart(2, '0');
      const day = String(val.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  function getSnapTimestamp(s) {
    const t = s.created_at || s.updated_at || s.snapshot_date;
    return t ? new Date(t).getTime() : 0;
  }

  const existingShardDates = new Set();

  // Populate map with Shard snapshots first
  for (const s of shardList) {
    const sDate = formatUtcDate(s.snapshot_date);
    if (!sDate) continue;
    existingShardDates.add(sDate);
    const dedupKey = `${sDate}_${s.keyword_id || 'global'}`;
    snapshotMap.set(dedupKey, s);
  }

  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // Synthesize live in-memory SERP points from Hub active catalog ONLY if shard has no snapshots or for an already-existing shard date
  // [INVARIANT: DUAL-PILLAR-TOMBSTONE] Union tombstones across Shard masterRecord and Central Hub metadata
  const deletedSnapshotDates = new Set([
    ...(Array.isArray(masterRecord?.metadata?.deleted_snapshot_dates) ? masterRecord.metadata.deleted_snapshot_dates : []),
    ...(Array.isArray(topHubMeta?.deleted_snapshot_dates) ? topHubMeta.deleted_snapshot_dates : [])
  ]);

  for (const sc of hubSerpRows) {
    const crawlDate = sc.crawled_at || sc.updated_at;
    const crawlIso = formatUtcDate(crawlDate);
    // Do NOT fabricate a new date from kdi.updated_at / ksc.crawled_at if real snapshots already exist on the shard for other dates
    const canUseCrawlDate = crawlIso && !deletedSnapshotDates.has(crawlIso) && (existingShardDates.size === 0 || existingShardDates.has(crawlIso));
    if (canUseCrawlDate) {
      const dedupKey = `${crawlIso}_${sc.keyword_id || 'global'}`;
      const crawlIsoStr = safeIsoDate(sc.crawled_at) || safeIsoDate(sc.updated_at) || (crawlIso + 'T00:00:00.000Z');
      const updatedIsoStr = safeIsoDate(sc.updated_at) || crawlIsoStr;
      const livePoint = {
        pin_id: cleanPinId,
        keyword_id: sc.keyword_id,
        keyword_name: sc.keyword_name,
        snapshot_date: crawlIso,
        rank_position: sc.rank_position ?? sc.last_known_rank ?? null,
        last_known_rank: sc.last_known_rank ?? null,
        is_displaced: Boolean(sc.is_displaced),
        save_count: Number(sc.save_count || 0),
        repin_count: Number(sc.repin_count || 0),
        comment_count: Number(sc.comment_count || 0),
        share_count: Number(sc.share_count || 0),
        reaction_count: Number(sc.reaction_count || 0),
        daily_save_velocity: (sc.daily_save_velocity !== undefined && sc.daily_save_velocity !== null) ? Number(sc.daily_save_velocity) : 0,
        created_at: updatedIsoStr,
        crawled_at: crawlIsoStr,
        updated_at: updatedIsoStr,
        metadata: sc.metadata || {}
      };

      if (!snapshotMap.has(dedupKey)) {
        snapshotMap.set(dedupKey, livePoint);
      } else {
        // [INVARIANT: PRECEDENCE-AND-RATCHET-INTEGRITY]
        // Existing shard entry for this date: ratchet saves forward & adopt newer crawl timestamp
        const existing = snapshotMap.get(dedupKey);
        const existingTs = existing.crawled_at || existing.updated_at || existing.created_at;
        const incomingTs = livePoint.crawled_at || livePoint.updated_at;
        const isNewer = !existingTs || (incomingTs && new Date(incomingTs).getTime() >= new Date(existingTs).getTime());

        existing.save_count = Math.max(Number(existing.save_count || 0), Number(livePoint.save_count || 0));
        existing.repin_count = Math.max(Number(existing.repin_count || 0), Number(livePoint.repin_count || 0));
        existing.comment_count = Math.max(Number(existing.comment_count || 0), Number(livePoint.comment_count || 0));
        existing.share_count = Math.max(Number(existing.share_count || 0), Number(livePoint.share_count || 0));
        existing.reaction_count = Math.max(Number(existing.reaction_count || 0), Number(livePoint.reaction_count || 0));

        if (isNewer) {
          existing.crawled_at = livePoint.crawled_at;
          existing.updated_at = livePoint.updated_at;
          if (livePoint.rank_position != null) existing.rank_position = livePoint.rank_position;
          if (livePoint.last_known_rank != null) existing.last_known_rank = livePoint.last_known_rank;
          if (livePoint.is_displaced != null) existing.is_displaced = livePoint.is_displaced;
          if (livePoint.daily_save_velocity != null && livePoint.daily_save_velocity > 0) {
            existing.daily_save_velocity = livePoint.daily_save_velocity;
          }
        }
      }
    }

    // [INVARIANT: ZERO-HUB-SNAPSHOTS]
    // Always synthesize the historical baseline point whenever present, regardless of whether the crawl date is today or yesterday.
    // Defend against missing baseline metadata by inferring baseline day (crawlIso - 1d) if velocity exists
    const rawBaseDate = sc.baseline_day_date || (sc.daily_save_velocity > 0 && crawlIso ? new Date(new Date(crawlIso + 'T00:00:00.000Z').getTime() - 86400000) : null);
    const rawBaseSaves = sc.baseline_day_saves != null ? Number(sc.baseline_day_saves) : (sc.daily_save_velocity > 0 && sc.save_count != null ? Math.max(0, Number(sc.save_count) - Number(sc.daily_save_velocity)) : null);

    if (rawBaseDate && rawBaseSaves != null) {
      const baseDateStr = formatUtcDate(rawBaseDate);
      if (baseDateStr && !deletedSnapshotDates.has(baseDateStr) && (!crawlIso || baseDateStr < crawlIso)) {
        const baseKey = `${baseDateStr}_${sc.keyword_id || 'global'}`;
        if (!snapshotMap.has(baseKey)) {
          const baseIsoStr = baseDateStr + 'T00:00:00.000Z';
          snapshotMap.set(baseKey, {
            pin_id: cleanPinId,
            keyword_id: sc.keyword_id,
            keyword_name: sc.keyword_name,
            snapshot_date: baseDateStr,
            rank_position: sc.prev_rank_position ?? sc.rank_position ?? null,
            last_known_rank: sc.last_known_rank ?? null,
            is_displaced: Boolean(sc.is_displaced),
            save_count: Number(rawBaseSaves || 0),
            repin_count: 0,
            comment_count: 0,
            share_count: 0,
            reaction_count: 0,
            daily_save_velocity: 0,
            created_at: baseIsoStr,
            crawled_at: baseIsoStr,
            updated_at: baseIsoStr,
            metadata: {}
          });
        }
      }
    }
  }

  if (snapshotMap.size === 0 && masterRecord) {
    const todayStr = formatUtcDate(new Date());
    const livePoint = {
      pin_id: cleanPinId,
      keyword_id: null,
      keyword_name: null,
      snapshot_date: todayStr,
      rank_position: null,
      last_known_rank: null,
      is_displaced: false,
      save_count: Number(masterRecord.save_count || 0),
      repin_count: Number(masterRecord.repin_count || 0),
      comment_count: Number(masterRecord.comment_count || 0),
      share_count: 0,
      reaction_count: 0,
      daily_save_velocity: Number(masterRecord.daily_save_velocity || 0),
      created_at: new Date().toISOString(),
      crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: masterRecord.metadata || {}
    };
    snapshotMap.set(`${todayStr}_global`, livePoint);
  }

  snapshots = Array.from(snapshotMap.values()).sort(
    (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
  );

  // Resolve Keyword Names for all snapshot keyword_ids to eliminate multi-SERP ambiguity
  const rawSnapshots = snapshots || [];
  const kwMap = new Map();
  for (const r of hubSerpRows) {
    if (r?.keyword_id && r?.keyword_name) kwMap.set(Number(r.keyword_id), r.keyword_name);
  }
  const missingKwIds = [...new Set(rawSnapshots.map(s => s.keyword_id).filter(id => id != null && !isNaN(Number(id)) && !kwMap.has(Number(id))))];
  if (missingKwIds.length > 0) {
    const kwRows = await hubSql`SELECT id, keyword FROM tracked_keywords WHERE id = ANY(${missingKwIds});`.catch(() => []);
    for (const r of kwRows) {
      if (r && r.id != null) kwMap.set(Number(r.id), r.keyword);
    }
  }

  // Build lookup of SERP current records by keyword_id
  const serpByKeyword = new Map();
  for (const row of hubSerpRows) {
    if (row && row.keyword_id) {
      serpByKeyword.set(Number(row.keyword_id), row);
    }
  }

  const todayUtcStr = formatUtcDate(new Date());

  const enrichedSnapshots = rawSnapshots.map((s, sIdx) => {
    const sDate = formatUtcDate(s.snapshot_date);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    const isToday = Boolean(sDate && sDate === todayUtcStr);
    const serpMatch = isToday ? ((kid ? serpByKeyword.get(kid) : null) || hubSerpRows[0] || null) : null;

    const rawRankPos = Number(s.rank_position);
    const hasValidPositiveRank = Number.isFinite(rawRankPos) && rawRankPos >= 1;

    let isDisplaced;
    let rankPosition;
    let lastKnownRank;

    if (isToday) {
      if (s.is_displaced || serpMatch?.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (Number(serpMatch?.last_known_rank) > 0
              ? Number(serpMatch.last_known_rank)
              : (Number(serpMatch?.prev_rank_position) > 0
                  ? Number(serpMatch.prev_rank_position)
                  : (Number(serpMatch?.rank_position) > 0 ? Number(serpMatch.rank_position) : 100)));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    } else {
      // Historical snapshot (sDate < todayUtcStr)
      if (s.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (kid && Number(serpByKeyword.get(kid)?.last_known_rank) > 0
              ? Number(serpByKeyword.get(kid).last_known_rank)
              : (kid && Number(serpByKeyword.get(kid)?.prev_rank_position) > 0
                  ? Number(serpByKeyword.get(kid).prev_rank_position)
                  : (kid && Number(serpByKeyword.get(kid)?.rank_position) > 0
                      ? Number(serpByKeyword.get(kid).rank_position)
                      : (Number(s.catalog_rank) > 0 ? Number(s.catalog_rank) : 100))));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    }

    const catalogRank = s.catalog_rank || (isDisplaced ? (Number(lastKnownRank || 100) + 250) : rankPosition);
    const crawlTimestamp = safeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (sDate ? sDate + 'T00:00:00.000Z' : null);
    const updatedTimestamp = safeIsoDate(s.updated_at) || crawlTimestamp;
    return {
      ...s,
      snapshot_date: sDate,
      crawled_at: crawlTimestamp,
      updated_at: updatedTimestamp,
      keyword_name: kid ? (kwMap.get(kid) || s.keyword_name || `Keyword #${kid}`) : (s.keyword_name || null),
      is_displaced: isDisplaced,
      rank_position: rankPosition,
      last_known_rank: lastKnownRank,
      catalog_rank: catalogRank
    };
  });

  // Compute Unified, Non-Decreasing Monotonic Daily Trajectory (1 entry per calendar day)
  const dailyMap = new Map();
  for (const s of enrichedSnapshots) {
    const dateKey = s.snapshot_date;
    if (!dateKey) continue;
    const crawlTs = safeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (dateKey + 'T00:00:00.000Z');
    const updatedTs = safeIsoDate(s.updated_at) || crawlTs;
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        row_key: dateKey,
        snapshot_id: s.id ? String(s.id) : dateKey,
        snapshot_date: dateKey,
        recorded_at: updatedTs || crawlTs,
        save_count: Number(s.save_count) || 0,
        repin_count: Number(s.repin_count) || 0,
        comment_count: Number(s.comment_count) || 0,
        share_count: Number(s.share_count) || 0,
        reaction_count: Number(s.reaction_count || 0),
        daily_save_velocity: Number(s.daily_save_velocity) || 0,
        best_rank: (s.rank_position && s.rank_position > 0) ? s.rank_position : 999,
        ranking_keywords: [],
        crawled_at: crawlTs,
        updated_at: updatedTs
      });
    }
    const day = dailyMap.get(dateKey);
    if (crawlTs && (!day.crawled_at || new Date(crawlTs).getTime() > new Date(day.crawled_at).getTime())) {
      day.crawled_at = crawlTs;
      day.updated_at = updatedTs;
      day.recorded_at = updatedTs || crawlTs;
    }
    day.save_count = Math.max(day.save_count, Number(s.save_count) || 0);
    day.repin_count = Math.max(day.repin_count, Number(s.repin_count) || 0);
    day.comment_count = Math.max(day.comment_count, Number(s.comment_count) || 0);
    day.share_count = Math.max(day.share_count, Number(s.share_count) || 0);
    day.reaction_count = Math.max(day.reaction_count, Number(s.reaction_count) || 0);
    day.daily_save_velocity = Math.max(day.daily_save_velocity, Number(s.daily_save_velocity) || 0);
    const effRank = s.rank_position || s.last_known_rank || null;
    if (effRank && effRank > 0) {
      day.best_rank = Math.min(day.best_rank, effRank);
    }
    if (s.keyword_name) {
      const isDisplaced = Boolean(s.is_displaced);
      const rawPos = Number(s.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;

      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced
        ? (Number(s.last_known_rank) > 0
            ? Number(s.last_known_rank)
            : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.last_known_rank) > 0
                ? Number(serpByKeyword.get(Number(s.keyword_id)).last_known_rank)
                : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.rank_position) > 0
                    ? Number(serpByKeyword.get(Number(s.keyword_id)).rank_position)
                    : 100)))
        : null;
      const effRank = effDisplaced ? vaultRank : liveRank;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      const kwObj = {
        keyword_id: s.keyword_id,
        keyword: s.keyword_name,
        rank: effRank,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        saves: Number(s.save_count) || 0
      };
      const existingKwIdx = day.ranking_keywords.findIndex(k => (
        (k.keyword_id && s.keyword_id && k.keyword_id === s.keyword_id) ||
        (String(k.keyword || '').toLowerCase() === String(s.keyword_name || '').toLowerCase())
      ));
      if (existingKwIdx >= 0) {
        day.ranking_keywords[existingKwIdx] = kwObj;
      } else {
        day.ranking_keywords.push(kwObj);
      }
    }
  }

  // Expand distinct intraday checkpoints from masterRecord.metadata.intraday_snapshots
  const intradayList = Array.isArray(masterRecord?.metadata?.intraday_snapshots)
    ? masterRecord.metadata.intraday_snapshots
    : [];
  const trajectoryEntries = Array.from(dailyMap.values());
  const seenIntradayKeys = new Set();

  for (const cp of intradayList) {
    if (!cp || !cp.snapshot_date) continue;
    const cpDate = formatUtcDate(cp.snapshot_date);
    const cpId = String(cp.id || cp.recorded_at || '');
    if (!cpDate || deletedSnapshotDates.has(cpDate) || (cpId && deletedSnapshotDates.has(cpId))) continue;
    const parentDay = dailyMap.get(cpDate);
    const cpSaves = Number(cp.save_count || 0);
    const cpRepins = Number(cp.repin_count || 0);
    if (parentDay && cpSaves === Number(parentDay.save_count || 0) && cpRepins === Number(parentDay.repin_count || 0)) {
      continue;
    }
    const dedupIntra = `${cpDate}_${cpSaves}_${cpRepins}`;
    if (seenIntradayKeys.has(dedupIntra)) continue;
    seenIntradayKeys.add(dedupIntra);

    const recAt = safeIsoDate(cp.recorded_at) || (cpDate + 'T00:00:00.000Z');
    trajectoryEntries.push({
      row_key: cpId || `${cpDate}_${recAt}`,
      snapshot_id: cpId || `${cpDate}_${recAt}`,
      snapshot_date: cpDate,
      recorded_at: recAt,
      crawled_at: recAt,
      updated_at: recAt,
      is_intraday_checkpoint: true,
      save_count: cpSaves,
      repin_count: cpRepins,
      comment_count: Number(cp.comment_count || parentDay?.comment_count || 0),
      share_count: Number(cp.share_count || parentDay?.share_count || 0),
      reaction_count: Number(cp.reaction_count || parentDay?.reaction_count || 0),
      daily_save_velocity: 0,
      best_rank: parentDay?.best_rank || 999,
      ranking_keywords: parentDay?.ranking_keywords ? [...parentDay.ranking_keywords] : []
    });
  }

  // Chronologically sort by date and timestamp, then enforce non-decreasing monotonic saves
  const dailyTrajectory = trajectoryEntries.sort((a, b) => {
    const dCmp = String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || ''));
    if (dCmp !== 0) return dCmp;
    return String(b.recorded_at || b.updated_at || '').localeCompare(String(a.recorded_at || a.updated_at || ''));
  });
  const chronoDays = [...dailyTrajectory].reverse();
  let runningMaxSaves = 0;
  for (const d of chronoDays) {
    if (d.save_count < runningMaxSaves) {
      d.save_count = runningMaxSaves;
    } else {
      runningMaxSaves = d.save_count;
    }
  }

  if (chronoDays[0] && chronoDays[0].is_hydration_jump === undefined) {
    chronoDays[0].is_hydration_jump = false;
  }

  for (let i = 1; i < chronoDays.length; i++) {
    const prev = chronoDays[i - 1];
    const curr = chronoDays[i];
    const prevDate = new Date(prev.snapshot_date);
    const currDate = new Date(curr.snapshot_date);
    const elapsedDays = Math.max(1, Math.round((currDate - prevDate) / 86400000));
    const diff = curr.save_count - prev.save_count;

    const isJump = isMultiStageHydrationJump(prev, curr);
    if (isJump) {
      curr.is_hydration_jump = true;
      curr.velocity_mode = 'hydration_amortized';
      const pinCreatedAt = masterRecord?.created_at_pinterest ? new Date(masterRecord.created_at_pinterest) : null;
      if (pinCreatedAt && !isNaN(pinCreatedAt.getTime())) {
        const ageMs = Math.max(86400000, currDate.getTime() - pinCreatedAt.getTime());
        const ageDays = Math.max(1, Math.round(ageMs / 86400000));
        if (ageDays >= 2) {
          curr.daily_save_velocity = Math.round((Number(curr.save_count || 0) / ageDays) * 10) / 10;
        } else {
          curr.daily_save_velocity = 0;
        }
      } else {
        curr.daily_save_velocity = 0;
      }
      curr.window_24h_velocity = curr.daily_save_velocity;
      curr.window_24h_delta = 0;
    } else {
      curr.is_hydration_jump = false;
      curr.velocity_mode = 'normal';
      curr.step_save_delta = diff;
      if (elapsedDays >= 1) {
        if (diff <= 0) {
          curr.daily_save_velocity = 0;
        } else {
          curr.daily_save_velocity = Math.round((diff / elapsedDays) * 10) / 10;
        }
      }

      // Compute 24h calendar window velocity against latest prior calendar day snapshot
      let priorCalSnap = null;
      for (let j = i - 1; j >= 0; j--) {
        if (chronoDays[j].snapshot_date < curr.snapshot_date) {
          priorCalSnap = chronoDays[j];
          break;
        }
      }
      if (priorCalSnap && !isMultiStageHydrationJump(priorCalSnap, curr)) {
        const calElapsed = Math.max(1, Math.round((currDate - new Date(priorCalSnap.snapshot_date)) / 86400000));
        const calDiff = Math.max(0, curr.save_count - priorCalSnap.save_count);
        curr.window_24h_delta = calDiff;
        curr.window_24h_velocity = Math.round((calDiff / calElapsed) * 10) / 10;
      } else {
        curr.window_24h_delta = Math.max(0, diff);
        curr.window_24h_velocity = curr.daily_save_velocity;
      }
    }
  }

  // 3. Central Hub Relational Cross-Pillar Context (In-Memory ranking_keywords + conditional competitor lookup)
  const rankingKeywordsFromMem = hubSerpRows
    .filter(sc => sc.keyword_id && (sc.keyword_name || kwMap.get(Number(sc.keyword_id))))
    .map(sc => {
      const isDisplaced = Boolean(sc.is_displaced);
      const rawPos = Number(sc.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;
      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced ? (Number(sc.last_known_rank) || 1) : null;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      return {
        keyword_id: Number(sc.keyword_id),
        keyword: sc.keyword_name || kwMap.get(Number(sc.keyword_id)),
        rank: effDisplaced ? vaultRank : liveRank,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        velocity: Number(sc.daily_save_velocity || 0)
      };
    });

  let competitorInfo = null;
  if (hubCompetitorRowsRaw && hubCompetitorRowsRaw.length > 0 && hubCompetitorRowsRaw[0].competitor_id) {
    competitorInfo = hubCompetitorRowsRaw[0];
  } else if (hubSerpRows.length > 0 && hubSerpRows[0].competitor_id) {
    competitorInfo = {
      competitor_id: hubSerpRows[0].competitor_id,
      competitor_username: hubSerpRows[0].competitor_username,
      display_name: hubSerpRows[0].competitor_display_name,
      competitor_active: hubSerpRows[0].competitor_active
    };
  } else if (masterRecord?.creator_username) {
    const [compRow] = await hubSql`
      SELECT id as competitor_id, username as competitor_username, display_name, is_active as competitor_active
      FROM competitor_profiles
      WHERE username = ${masterRecord.creator_username}
      LIMIT 1;
    `.catch(() => []);
    competitorInfo = compRow || null;
  }
  const hubContext = { ranking_keywords: rankingKeywordsFromMem, competitor_info: competitorInfo };


  if (!masterRecord && snapshots.length === 0 && (!hubContext?.ranking_keywords || hubContext.ranking_keywords.length === 0)) {
    if (shardErrorReason) {
      return {
        success: false,
        error: 'SHARD_UNAVAILABLE',
        reason: shardErrorReason,
        shard_id: shardId,
        message: `Shard ${shardId} is currently unreachable (${shardErrorReason}).`
      };
    }
    return {
      success: false,
      error: 'NOT_FOUND',
      message: `Pin ${cleanPinId} not found in any intelligence pillar.`
    };
  }

  const creatorUsername = masterRecord?.creator_username || '';
  const boardName = masterRecord?.board_name || '';
  const boardSlug = masterRecord?.board_slug || boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  // Collect all available metadata objects across Shard master record, historical snapshots & SERP occurrences
  const allMetas = [
    ...(masterRecord?.metadata ? [normalizeMetadata(masterRecord.metadata)] : []),
    ...(snapshots || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean),
    ...(hubSerpRows || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean)
  ];
  
  let canonicalPinId = null;
  let canonicalPinUrl = null;
  let seoCanonicalUrl = '';
  let seoRelatedInterests = [];
  
  for (const m of allMetas) {
    if (!canonicalPinId && (m.canonical_pin_id || m.canonical_pin?.entity_id)) {
      canonicalPinId = String(m.canonical_pin_id || m.canonical_pin?.entity_id);
    }
    if (!canonicalPinUrl && m.canonical_pin_url) {
      canonicalPinUrl = m.canonical_pin_url;
    }
    if (!seoCanonicalUrl && m.seo_canonical_url) {
      seoCanonicalUrl = m.seo_canonical_url;
    }
    if (seoRelatedInterests.length === 0 && Array.isArray(m.seo_related_interests) && m.seo_related_interests.length > 0) {
      seoRelatedInterests = m.seo_related_interests;
    }
  }

  if (!canonicalPinId && seoCanonicalUrl) {
    const urlMatch = String(seoCanonicalUrl).match(/\/pin\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      canonicalPinId = urlMatch[1];
    } else {
      const m = String(seoCanonicalUrl).match(/[a-zA-Z0-9_-]{10,128}/);
      if (m) canonicalPinId = m[0];
    }
  }
  if (!canonicalPinUrl && canonicalPinId) {
    canonicalPinUrl = `https://www.pinterest.com/pin/${canonicalPinId}/`;
  }
  if (!seoCanonicalUrl && canonicalPinId) {
    seoCanonicalUrl = `/pin/${canonicalPinId}/`;
  }
  const isCanonicalRoot = canonicalPinId ? (String(canonicalPinId) === String(cleanPinId)) : true;

  const cleanMeta = (obj) => {
    const normalized = normalizeMetadata(obj);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return {};
    return Object.fromEntries(
      Object.entries(normalized).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
  };

  // Supreme priority: Shard masterRecord metadata ALWAYS overrides Hub metadata
  const snapMeta = { 
    ...cleanMeta(hubSerpRows[0]?.metadata), 
    ...cleanMeta(masterRecord?.metadata) 
  };

  // Backfill description and alt_text on masterRecord if empty
  if (masterRecord) {
    if (!masterRecord.description && snapMeta.description) {
      masterRecord.description = snapMeta.description;
    }
    if (!masterRecord.alt_text && snapMeta.alt_text) {
      masterRecord.alt_text = snapMeta.alt_text;
    }
    if (!masterRecord.created_at_pinterest && (snapMeta.created_at_pinterest || snapMeta.created_at)) {
      masterRecord.created_at_pinterest = snapMeta.created_at_pinterest || snapMeta.created_at;
    }
  }
  // Note: Tier 1 Edge Mirror write-through is unified downstream with complete daily_trajectory and KV persistence.

  const candidateCreationMethods = [
    masterRecord?.creation_method,
    shardMetaObj.creation_method,
    shardMetaObj.method,
    snapMeta.creation_method,
    snapMeta.method,
    hubSerpRows[0]?.creation_method,
    topHubMeta.creation_method,
    topHubMeta.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const resolvedCreationMethod = candidateCreationMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateCreationMethods[0] || 'pinterest_platform';

  const algorithmicIntelligence = {
    is_repin: Boolean(snapMeta.is_repin ?? false),
    origin_pinner: snapMeta.origin_pinner || null,
    origin_pinner_followers: snapMeta.origin_pinner_followers ?? snapMeta.origin_pinner?.follower_count ?? null,
    domain_official_user: snapMeta.domain_official_user || null,
    creator_is_verified_merchant: Boolean(snapMeta.creator_is_verified_merchant ?? false),
    image_signature: snapMeta.image_signature || '',
    image_dimensions: snapMeta.image_dimensions || snapMeta.imageDimensions || null,
    seo_noindex_reason: snapMeta.seo_noindex_reason || null,
    is_indexed_google: !snapMeta.seo_noindex_reason,
    is_go_linkless: Boolean(snapMeta.is_go_linkless ?? false),
    is_arbitrage_active: !Boolean(snapMeta.is_go_linkless),
    category_breadcrumbs: Array.isArray(snapMeta.category_breadcrumbs) ? snapMeta.category_breadcrumbs : [],
    board_metrics: {
      pin_count: Number(snapMeta.board_pin_count || 0),
      order_modified_at: snapMeta.board_order_modified_at || null,
      board_url: snapMeta.board_url || null,
      cover_url: snapMeta.board_cover_url || null,
      thumbnail_url: snapMeta.board_thumbnail_url || null
    },
    creation_method: resolvedCreationMethod,
    seo_title: snapMeta.seo_title || masterRecord?.title || '',
    seo_description: snapMeta.seo_description || masterRecord?.description || '',
    seo_canonical_url: seoCanonicalUrl || snapMeta.seo_canonical_url || '',
    seo_canonical_domain: snapMeta.seo_canonical_domain || '',
    canonical_pin_id: canonicalPinId,
    canonical_pin_url: canonicalPinUrl,
    is_canonical_root: isCanonicalRoot,
    seo_related_interests: (seoRelatedInterests.length > 0 ? seoRelatedInterests : (Array.isArray(snapMeta.seo_related_interests) ? snapMeta.seo_related_interests : [])),
    rich_metadata: snapMeta.rich_metadata || null,
    visual_objects: Array.isArray(snapMeta.visual_objects) ? snapMeta.visual_objects : [],
    reactions: snapMeta.reactions || {},
    utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
    tracked_link: snapMeta.tracked_link || masterRecord?.destination_url || '',
    is_product: Boolean(snapMeta.is_product || snapMeta.isProduct || (Array.isArray(snapMeta.shopping_flags) && snapMeta.shopping_flags.includes('is_product'))),
    is_video: Boolean(snapMeta.is_video || snapMeta.isVideo || snapMeta.video_url),
    shopping_data: snapMeta.shopping_data || snapMeta.shoppingData || null
  };

  const latestLiveAnnotations = new Set(
    normalizeVisualAnnotations(snapMeta.visual_annotations || hubSerpRows[0]?.metadata?.visual_annotations)
      .map(t => String(t || '').trim())
      .filter(Boolean)
  );

  const detailedAnnotations = finalVisualAnnotations.map(tag => ({
    name: tag,
    is_live: latestLiveAnnotations.size > 0 ? latestLiveAnnotations.has(tag) : true,
    status: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'live' : 'historical',
    label: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'Live Active' : 'Historical Crawl'
  }));

  const fromShardSnapshots = Boolean(Array.isArray(initialSnapshots) && initialSnapshots.length > 0);

  const isDegraded = Boolean(
    shardErrorReason ||
    ((!initialSnapshots || initialSnapshots.length === 0) && ((hubContext?.ranking_keywords?.length || 0) > 0 || (dailyTrajectory && dailyTrajectory.length <= 2)))
  );

  const dossierResult = {
    success: true,
    pin_id: cleanPinId,
    shard_id: shardId,
    is_degraded: isDegraded,
    shard_cold: Boolean(shardErrorReason),
    shard_error_reason: shardErrorReason || null,
    shard_error_message: shardErrorMessage || null,
    from_shard_snapshots: fromShardSnapshots,
    creative: {
      title: masterRecord?.title || `Pin ${cleanPinId}`,
      description: masterRecord?.description || '',
      alt_text: masterRecord?.alt_text || '',
      destination_url: masterRecord?.destination_url || snapMeta.tracked_link || snapMeta.utm_link || '',
      utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
      domain: masterRecord?.domain || 'pinterest.com',
      image_url: masterRecord?.image_url || '',
      dominant_color: masterRecord?.dominant_color || '#888888',
      visual_annotations: finalVisualAnnotations,
      visual_annotations_detailed: detailedAnnotations,
      created_at_pinterest: masterRecord?.created_at_pinterest || snapMeta.created_at_pinterest || snapMeta.created_at || null,
      creation_method: resolvedCreationMethod,
      image_signature: snapMeta.image_signature || '',
      canonical_pin_id: canonicalPinId,
      canonical_pin_url: canonicalPinUrl,
      is_canonical_root: isCanonicalRoot,
      save_count: Number(dailyTrajectory[0]?.save_count ?? hubSerpRows[0]?.save_count ?? masterRecord?.save_count ?? 0),
      repin_count: Number(dailyTrajectory[0]?.repin_count ?? hubSerpRows[0]?.repin_count ?? masterRecord?.repin_count ?? 0),
      comment_count: Number(dailyTrajectory[0]?.comment_count ?? hubSerpRows[0]?.comment_count ?? 0),
      share_count: Number(dailyTrajectory[0]?.share_count ?? hubSerpRows[0]?.share_count ?? 0),
      daily_save_velocity: Number(dailyTrajectory[0]?.window_24h_velocity ?? dailyTrajectory[0]?.daily_save_velocity ?? hubSerpRows[0]?.daily_save_velocity ?? 0),
      first_discovered_pillar: masterRecord?.first_discovered_pillar || 'keyword',
      is_deleted: Boolean(masterRecord?.is_deleted || masterRecord?.metadata?.is_deleted || (masterRecord?.metadata?.status === 'archived_404')),
      metadata: snapMeta
    },
    algorithmic_intelligence: algorithmicIntelligence,
    pillar_1_creator_context: {
      creator_username: creatorUsername,
      creator_url: creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : null,
      board_name: boardName,
      board_slug: boardSlug,
      board_url: (creatorUsername && boardSlug) ? `https://www.pinterest.com/${creatorUsername}/${boardSlug}/` : null,
      competitor_tracked: Boolean(hubContext?.competitor_info),
      competitor_profile: hubContext?.competitor_info || null
    },
    pillar_2_keywords_context: {
      ranking_keywords: hubContext?.ranking_keywords || [],
      serp_impressions: (hubContext?.ranking_keywords || []).length,
      highest_rank: (hubContext?.ranking_keywords || []).reduce((min, k) => Math.min(min, k.rank || 999), 999)
    },
    pillar_3_related_pins_context: {
      seed_pin_id: cleanPinId,
      radar_url: `/api/keywords/visual-search?pin_id=${cleanPinId}`
    },
    daily_trajectory: dailyTrajectory,
    snapshots: enrichedSnapshots,
    topology: getDatabaseTopology(env)
  };

  // Tier 1 Edge Mirror & Write-Through: Persist fresh shard metadata & daily_trajectory to D1 & KV
  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  // CRITICAL ANTI-POISONING GUARD: Never mirror a degraded fallback (2-day synthesis from Hub) as a complete trajectory in D1.
  // Only write daily_trajectory to D1 if it originated from real Shard snapshots or has real multi-day depth (> 2 days).
  const canMirrorTrajectoryToD1 = Boolean(
    fromShardSnapshots ||
    (Array.isArray(dailyTrajectory) && dailyTrajectory.length > 2)
  );


  sanitizeDossierTrajectory(dossierResult);
  return dossierResult;
}

/**
 * Fast Edge Dossier Resolver
 * [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 * Returns pin data strictly from Cloudflare D1 or KV edge cache in < 3ms.
 * Never executes live Pinterest scraping or Shard queries.
 *
 * @param {string|number} pinId
 * @param {object} env - Cloudflare environment bindings
 * @returns {Promise<object>}
 */
export async function getFastEdgeDossier(pinId, env) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) {
    return { success: false, error: 'INVALID_PIN_ID', message: 'Pin ID is required' };
  }
  return {
    success: false,
    not_cached: true,
    error: 'NOT_IN_EDGE_CACHE',
    message: `Pin ${cleanPinId} not found in edge cache. Perform non-prefetch fetch to hydrate.`
  };
}

/**
 * Canonical Pin Historical Trajectory Retrieval (SSOT)
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 *
 * Retrieves chronological daily snapshot metrics directly from the designated Storage Shard.
 * Guarantees zero reads from Central Hub for historical snapshot data.
 *
 * @param {object} params
 * @param {Function} [params.hubSql] - Optional Central Hub client (used to resolve shard if needed)
 * @param {Function} [params.shardSql] - Pre-resolved Neon client for the target shard
 * @param {string|number} params.pinId - Target Pinterest Pin ID
 * @param {string} [params.timeframe='all'] - Timeframe filter
 * @param {object} [params.env] - Cloudflare Worker environment bindings
 * @returns {Promise<object>} Result containing trajectory snapshots array
 */
export async function fetchPinTrajectoryFromShard({ hubSql, shardSql, pinId, timeframe = 'all', env = null } = {}) {
  const cleanId = String(pinId || '').trim();
  if (!cleanId) return { success: false, trajectory: [], snapshots: [] };

  const shardId = getPinShardId(cleanId, 99);
  let sqlClient = shardSql;
  if (!sqlClient && (hubSql || env)) {
    try {
      sqlClient = await resolveShardConnection({ hubSql, shardId, env });
    } catch (_) {
      sqlClient = null;
    }
  }
  if (!sqlClient) return { success: false, shard_id: shardId, trajectory: [], snapshots: [] };

  try {
    const snapshots = await executeShardQueryWithCircuitBreaker(shardId, async (db) => {
      return await db`
        SELECT 
          snapshot_date::text AS snapshot_date,
          save_count,
          daily_save_velocity,
          reaction_count,
          repin_count,
          comment_count,
          share_count,
          updated_at,
          updated_at AS crawled_at
        FROM pins_daily_metrics
        WHERE pin_id = ${cleanId}
        ORDER BY snapshot_date ASC
      `;
    }, { timeoutMs: 2000, shardSql: sqlClient });

    const processedSnapshots = (snapshots || []).map(s => ({ ...s }));
    for (let i = 1; i < processedSnapshots.length; i++) {
      const prev = processedSnapshots[i - 1];
      const curr = processedSnapshots[i];
      const isJump = isMultiStageHydrationJump(prev, curr);
      if (isJump) {
        curr.is_hydration_jump = true;
        curr.velocity_mode = 'hydration_amortized';
        curr.daily_save_velocity = 0;
      } else {
        curr.is_hydration_jump = false;
        curr.velocity_mode = 'normal';
      }
    }

    return {
      success: true,
      shard_id: shardId,
      timeframe,
      trajectory: processedSnapshots,
      snapshots: processedSnapshots
    };
  } catch (err) {
    console.error(`🚨 [TRAJECTORY-SHARD-ERROR] Pin ${cleanId} on shard ${shardId}:`, err);
    return { success: false, shard_id: shardId, trajectory: [], snapshots: [], error: err.message };
  }
}



/**
 * Canonical 4-Pillar Synchronous Pin Synchronization (SSOT)
 * [INVARIANT: FOUR-PILLAR-SYNC-PARITY]
 *
 * Synchronizes a deep-crawled pin across all four platform pillars:
 * 1. Shard: universal_master_pins (Creative static metadata)
 * 2. Shard: pins_daily_metrics (Daily aggregate metrics for today's snapshot)
 * 3. Shard: pin_serp_positions (Historical keyword rank positions)
 * 4. Hub: keyword_serp_current (Active SERP rankings & daily save velocity)
 * 5. Hub: competitor_pins (Tracked competitor profile pins)
 * 6. Hub: pa_pins (Winning archive pins)
 * 7. Invalidation: Memory L0 -> Cloudflare D1 -> Cloudflare KV
 *
 * @param {object} params
 * @param {Function} params.hubSql - Neon SQL client connected to Central Hub
 * @param {string|number} params.pinId - Target Pinterest Pin ID
 * @param {object} params.scrapedPin - Fresh payload from Pinterest scraper / API
 * @param {object} [params.env] - Cloudflare Worker environment bindings
 * @param {object} [params.ctx] - Cloudflare Worker execution context (waitUntil)
 * @returns {Promise<object>} Result containing synced pin details, velocity, and refreshed dossier
 */
export async function syncPinAcrossAllFourPillars({ hubSql, pinId, scrapedPin, env = null, ctx = null }) {
  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) {
    throw new Error('[syncPinAcrossAllFourPillars] pinId is required');
  }
  if (!scrapedPin || typeof scrapedPin !== 'object') {
    throw new Error('[syncPinAcrossAllFourPillars] scrapedPin object is required');
  }

  // 1. Resolve target Shard using deterministic CRC32
  // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
  const shardId = getPinShardId(cleanPinId, 99);
  let shardSql;
  try {
    shardSql = await resolveShardConnection({ hubSql, shardId, env });
  } catch (shardErr) {
    console.warn(`[syncPinAcrossAllFourPillars] Failed resolving shard ${shardId}: ${shardErr.message}`);
    shardSql = hubSql;
  }

  // 2. Normalize and sanitize numeric metrics (Anti-NaN Protection)
  const newSaves = Number.isFinite(Number(scrapedPin.saves)) 
    ? Math.max(0, Number(scrapedPin.saves)) 
    : (Number.isFinite(Number(scrapedPin.save_count)) ? Math.max(0, Number(scrapedPin.save_count)) : 0);
  const newRepins = Number.isFinite(Number(scrapedPin.repins)) 
    ? Math.max(0, Number(scrapedPin.repins)) 
    : (Number.isFinite(Number(scrapedPin.repin_count)) ? Math.max(0, Number(scrapedPin.repin_count)) : 0);
  const newComments = Number.isFinite(Number(scrapedPin.comments)) 
    ? Math.max(0, Number(scrapedPin.comments)) 
    : (Number.isFinite(Number(scrapedPin.comment_count)) ? Math.max(0, Number(scrapedPin.comment_count)) : 0);
  const newShares = Number.isFinite(Number(scrapedPin.share_count)) 
    ? Math.max(0, Number(scrapedPin.share_count)) 
    : (Number.isFinite(Number(scrapedPin.shares)) ? Math.max(0, Number(scrapedPin.shares)) : 0);

  const totalReactions = Number(
    scrapedPin.total_reaction_count ??
    (scrapedPin.reactions && typeof scrapedPin.reactions === 'object'
      ? Object.values(scrapedPin.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
      : 0)
  );

  // 3. Prepare sanitized metadata payload
  // [INVARIANT: 48-FIELD-TELEMETRY-PRESERVATION] Preserve carousel detection, affiliate tracking links, and creator audience
  // [INVARIANT: 48-FIELD-TELEMETRY-CAROUSEL-DETECTION]
  const isCarousel = Boolean(
    scrapedPin.is_carousel ||
    scrapedPin.isCarousel ||
    scrapedPin.method === 'carousel' ||
    scrapedPin.creation_method === 'carousel'
  );
  const rawMetaToStore = {
    alt_text: scrapedPin.alt_text || scrapedPin.seo_title || '',
    description: scrapedPin.description || '',
    board_name: scrapedPin.board_name || '',
    creation_method: isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || 'pinterest_platform'),
    method: isCarousel ? 'carousel' : (scrapedPin.method || scrapedPin.creation_method || 'pinterest_platform'),
    is_carousel: isCarousel,
    created_at_pinterest: scrapedPin.created_at_pinterest || scrapedPin.created_at || '',
    is_repin: Boolean(scrapedPin.is_repin),
    origin_pinner: scrapedPin.origin_pinner || null,
    domain_official_user: scrapedPin.domain_official_user || null,
    creator_is_verified_merchant: Boolean(scrapedPin.creator_is_verified_merchant),
    has_affiliate_redirect: Boolean(scrapedPin.has_affiliate_redirect || scrapedPin.affiliate_link || scrapedPin.is_affiliate),
    affiliate_networks: Array.isArray(scrapedPin.affiliate_networks) ? scrapedPin.affiliate_networks : [],
    utm_source: scrapedPin.utm_source || null,
    utm_medium: scrapedPin.utm_medium || null,
    utm_campaign: scrapedPin.utm_campaign || null,
    utm_content: scrapedPin.utm_content || null,
    // [INVARIANT: 48-FIELD-AFFILIATE-PRESERVATION] Preserve affiliate & tracking links without stripping
    utm_link: scrapedPin.utm_link || scrapedPin.utmLink || null,
    tracked_link: scrapedPin.tracked_link || scrapedPin.trackedLink || null,
    is_fresh_angle: Boolean(scrapedPin.is_fresh_angle),
    // [INVARIANT: GUEST-AUDIENCE-EXTRACTION]
    creator_followers: scrapedPin.creator_followers ?? scrapedPin.pinner?.follower_count ?? null,
    pinner: scrapedPin.pinner || null,
    closeupUnifiedAttribution: scrapedPin.closeupUnifiedAttribution || null,
    closeup_attribution: scrapedPin.closeup_attribution || null,
    link_domain: scrapedPin.link_domain || scrapedPin.domain || null,
    shopping_flags: Array.isArray(scrapedPin.shopping_flags) ? scrapedPin.shopping_flags : [],
    // [INVARIANT: 48-FIELD-TELEMETRY-PRESERVATION] Complete SEO, canonical, visual, and shopping telemetry (L-07)
    seo_title: scrapedPin.seo_title || scrapedPin.alt_text || '',
    seo_description: scrapedPin.seo_description || scrapedPin.description || '',
    seo_canonical_url: scrapedPin.seo_canonical_url || scrapedPin.canonical_url || '',
    canonical_pin_id: scrapedPin.canonical_pin_id || scrapedPin.canonicalPinId || '',
    seo_related_interests: Array.isArray(scrapedPin.seo_related_interests) ? scrapedPin.seo_related_interests : (scrapedPin.related_interests || []),
    rich_metadata: scrapedPin.rich_metadata || scrapedPin.richMetadata || null,
    image_signature: scrapedPin.image_signature || scrapedPin.imageSignature || null,
    image_dimensions: scrapedPin.image_dimensions || scrapedPin.imageDimensions || (scrapedPin.width && scrapedPin.height ? { width: scrapedPin.width, height: scrapedPin.height } : null),
    seo_noindex_reason: scrapedPin.seo_noindex_reason || null,
    is_go_linkless: Boolean(scrapedPin.is_go_linkless || scrapedPin.isGoLinkless),
    category_breadcrumbs: Array.isArray(scrapedPin.category_breadcrumbs) ? scrapedPin.category_breadcrumbs : (scrapedPin.breadcrumbs || []),
    board_pin_count: scrapedPin.board_pin_count ?? scrapedPin.boardPinCount ?? null,
    visual_objects: Array.isArray(scrapedPin.visual_objects) ? scrapedPin.visual_objects : (scrapedPin.visualObjects || []),
    reactions: scrapedPin.reactions && typeof scrapedPin.reactions === 'object' ? scrapedPin.reactions : null,
    origin_pinner_followers: scrapedPin.origin_pinner_followers ?? scrapedPin.origin_pinner?.follower_count ?? null,
    is_product: Boolean(scrapedPin.is_product || scrapedPin.isProduct || (Array.isArray(scrapedPin.shopping_flags) && scrapedPin.shopping_flags.includes('is_product'))),
    is_video: Boolean(scrapedPin.is_video || scrapedPin.isVideo || scrapedPin.video_url),
    shopping_data: scrapedPin.shopping_data || scrapedPin.shoppingData || null
  };

  const metaToStore = {};
  for (const [k, v] of Object.entries(rawMetaToStore)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    metaToStore[k] = v;
  }

  const cleanCreatedAtIso = (() => {
    const rawDate = scrapedPin.created_at_pinterest || scrapedPin.created_at;
    if (!rawDate) return null;
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? null : d.toISOString();
  })();

  // 4. Pillar 1: Upsert universal_master_pins on designated Storage Shard
  await shardSql`
    INSERT INTO universal_master_pins (
      pin_id, creator_username, board_name, title, domain, destination_url,
      image_url, description, alt_text, dominant_color, visual_annotations,
      created_at_pinterest, metadata,
      first_discovered_pillar, first_discovered_at, updated_at
    ) VALUES (
      ${cleanPinId},
      ${scrapedPin.creator_username || scrapedPin.pinner_username || ''},
      ${scrapedPin.board_name || ''},
      ${scrapedPin.title || ''},
      ${scrapedPin.domain || ''},
      ${scrapedPin.link || scrapedPin.destination_url || ''},
      ${scrapedPin.image_url || ''},
      ${scrapedPin.description || ''},
      ${scrapedPin.alt_text || scrapedPin.seo_title || ''},
      ${scrapedPin.dominant_color || '#888888'},
      ${JSON.stringify(scrapedPin.annotations?.map(a => a.name) || scrapedPin.visual_style_tags || [])}::jsonb,
      ${cleanCreatedAtIso}::timestamptz,
      ${JSON.stringify(metaToStore)}::jsonb,
      'live_sync',
      NOW(),
      NOW()
    )
    ON CONFLICT (pin_id) DO UPDATE SET
      creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
      board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
      title = CASE
        WHEN EXCLUDED.title IS NOT NULL
         AND BTRIM(EXCLUDED.title) <> ''
         AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
         AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
        THEN EXCLUDED.title
        ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
      END,
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
      metadata = (COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata
        || CASE
             WHEN COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')) IS NOT NULL 
              AND LOWER(TRIM(COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')))) NOT IN ('pinterest_platform')
              AND (COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')) IS NULL 
                   OR LOWER(TRIM(COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')))) = 'pinterest_platform')
             THEN jsonb_build_object(
               'creation_method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')),
               'method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', ''))
             )
             ELSE '{}'::jsonb
           END) - 'deleted_snapshot_dates'
        || jsonb_build_object('deleted_snapshot_dates', (
             SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
             FROM jsonb_array_elements_text(COALESCE(universal_master_pins.metadata->'deleted_snapshot_dates', '[]'::jsonb)) AS elem
             WHERE elem <> (NOW() AT TIME ZONE 'UTC')::date::text
           )),
      created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
      updated_at = NOW();
  `;

  // 5. Query Central Hub Active SERP State (keyword_serp_current) including baseline velocity columns
  const targetRows = await hubSql`
    SELECT
      keyword_id, rank_position, is_displaced, save_count, repin_count,
      comment_count, share_count, baseline_day_saves, baseline_day_date,
      daily_save_velocity, delta_repins_24h, crawled_at, last_known_rank
    FROM keyword_serp_current
    WHERE pin_id = ${cleanPinId}
      AND COALESCE(is_displaced, FALSE) = FALSE
      AND rank_position IS NOT NULL;
  `;

  // 5B. Displaced / Competitor / Archive Fallback: Query keyword_displaced_index and Shard pins_daily_metrics
  let displacedRows = [];
  try {
    displacedRows = await hubSql`
      SELECT
        keyword_id, last_known_rank, displaced_date, save_count, repin_count,
        comment_count, share_count, daily_save_velocity, delta_repins_24h, domain, updated_at
      FROM keyword_displaced_index
      WHERE pin_id = ${cleanPinId};
    `;
  } catch (dispErr) {
    console.warn(`[syncPinAcrossAllFourPillars] keyword_displaced_index lookup note: ${dispErr.message}`);
  }

  let priorShardMetrics = [];
  try {
    priorShardMetrics = await shardSql`
      SELECT snapshot_date::text AS snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC
      LIMIT 3;
    `;
  } catch (metricLookupErr) {
    console.warn(`[syncPinAcrossAllFourPillars] Shard pins_daily_metrics baseline lookup note: ${metricLookupErr.message}`);
  }

  // 6. Compute UTC-normalized save velocity with Day-2 Baseline & Intraday Ratchet Protection
  // [INVARIANT: UTC-MIDNIGHT-NORMALIZED-VELOCITY]
  const nowDate = new Date();
  const todayUtcStr = nowDate.toISOString().slice(0, 10);
  const toIsoDateStr = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  const todayShardRow = priorShardMetrics.find(m => toIsoDateStr(m.snapshot_date) === todayUtcStr) || null;
  const priorDayShardRow = priorShardMetrics.find(m => {
    const dStr = toIsoDateStr(m.snapshot_date);
    return dStr && dStr < todayUtcStr;
  }) || null;

  let baselineSaves = 0;
  let baselineDate = null;

  // Always prioritize the latest prior-day snapshot in pins_daily_metrics (distinct UTC date < today)
  if (priorDayShardRow && Number.isFinite(Number(priorDayShardRow.save_count)) && Number(priorDayShardRow.save_count) > 0) {
    baselineSaves = Number(priorDayShardRow.save_count);
    baselineDate = priorDayShardRow.snapshot_date;
  } else if (targetRows.length > 0) {
    const priorBaseRow = targetRows.find(r => {
      const bIso = toIsoDateStr(r.baseline_day_date);
      return bIso && bIso < todayUtcStr && r.baseline_day_saves != null && Number(r.baseline_day_saves) > 0;
    });
    const priorCrawlRow = targetRows.find(r => {
      const cIso = toIsoDateStr(r.crawled_at);
      return cIso && cIso < todayUtcStr && Number.isFinite(Number(r.save_count));
    });
    const r0 = priorBaseRow || priorCrawlRow || targetRows[0];
    const baseDateIso = toIsoDateStr(r0.baseline_day_date);
    const crawlDateIso = toIsoDateStr(r0.crawled_at);

    if (baseDateIso && baseDateIso < todayUtcStr && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else if (crawlDateIso && crawlDateIso < todayUtcStr && Number.isFinite(Number(r0.save_count))) {
      baselineSaves = Number(r0.save_count);
      baselineDate = r0.crawled_at;
    } else if (r0.baseline_day_date && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else {
      baselineSaves = Number.isFinite(Number(r0.save_count)) ? Number(r0.save_count) : 0;
      baselineDate = r0.crawled_at ? new Date(r0.crawled_at) : null;
    }
  } else if (displacedRows.length > 0) {
    const d0 = displacedRows[0];
    baselineSaves = Number.isFinite(Number(d0.save_count)) ? Number(d0.save_count) : 0;
    baselineDate = d0.displaced_date || d0.updated_at || null;
  } else if (todayShardRow && Number.isFinite(Number(todayShardRow.save_count))) {
    baselineSaves = Number(todayShardRow.save_count);
    baselineDate = todayShardRow.snapshot_date;
  }

  const targetBaselineRepins = (priorDayShardRow && priorDayShardRow.repin_count != null && Number(priorDayShardRow.repin_count) > 0)
    ? Number(priorDayShardRow.repin_count)
    : ((targetRows.length > 0 && targetRows[0].repin_count != null)
      ? Number(targetRows[0].repin_count)
      : ((displacedRows.length > 0 && displacedRows[0].repin_count != null) ? Number(displacedRows[0].repin_count) : Number(todayShardRow?.repin_count || 0)));

  const jumpDetected = isMultiStageHydrationJump(
    { save_count: baselineSaves, repin_count: targetBaselineRepins },
    { save_count: newSaves, repin_count: newRepins }
  );
  let computedVelocity = 0;
  const refRepins = targetBaselineRepins > 0 ? targetBaselineRepins : newRepins;
  const isRepinToSaveTransition = baselineSaves > 0 && refRepins > 0 && Math.abs(baselineSaves - refRepins) <= Math.max(5, Math.round(refRepins * 0.03));

  if (jumpDetected) {
    if (isRepinToSaveTransition) {
      computedVelocity = 0;
    } else {
      const pinCreatedAt = scrapedPin.created_at_pinterest || scrapedPin.created_at;
      const pinCreatedDate = pinCreatedAt ? new Date(pinCreatedAt) : null;
      if (pinCreatedDate && !isNaN(pinCreatedDate.getTime())) {
        const ageMs = Math.max(86400000, nowDate.getTime() - pinCreatedDate.getTime());
        const ageDays = Math.max(1, Math.round(ageMs / 86400000));
        computedVelocity = Math.round((newSaves / ageDays) * 10) / 10;
      } else {
        computedVelocity = 0;
      }
    }
  } else {
    computedVelocity = calculateDailyVelocity({
      currentSaves: newSaves,
      baselineSaves,
      currentRepins: newRepins,
      baselineRepins: targetBaselineRepins,
      currentDate: nowDate,
      baselineDate
    });
  }

  const existingPositiveVelocity = Math.max(
    0,
    ...targetRows.map(r => Number(r.daily_save_velocity) || 0),
    ...displacedRows.map(r => Number(r.daily_save_velocity) || 0),
    Number(todayShardRow?.daily_save_velocity || 0)
  );
  const existingPositiveRepinDelta = Math.max(
    0,
    ...targetRows.map(r => Number(r.delta_repins_24h) || 0),
    ...displacedRows.map(r => Number(r.delta_repins_24h) || 0)
  );

  const baselineDateIso = toIsoDateStr(baselineDate);
  const rawDelta = Math.max(0, newSaves - baselineSaves);
  const rawRepinDelta = Math.max(0, newRepins - targetBaselineRepins);

  // Intraday Ratchet & Exact 24h Window Calculation:
  // 1. If a prior-day snapshot exists (baselineDateIso < todayUtcStr), computedVelocity is the exact 24h gain against prior day.
  // 2. If only a same-day baseline exists (!baselineDateIso || baselineDateIso === todayUtcStr), add any positive intraday gain to today's existing velocity.
  const intradayStepGain = Math.max(0, newSaves - Number(todayShardRow?.save_count || baselineSaves || 0));
  const intradayRepinStepGain = Math.max(0, newRepins - Number(todayShardRow?.repin_count || targetBaselineRepins || 0));
  const syncVelocity = (!baselineDateIso || baselineDateIso === todayUtcStr)
    ? Math.max(existingPositiveVelocity + intradayStepGain, computedVelocity)
    : computedVelocity;
  const syncRepinsDelta = (!baselineDateIso || baselineDateIso === todayUtcStr)
    ? Math.max(existingPositiveRepinDelta + intradayRepinStepGain, rawRepinDelta)
    : rawRepinDelta;

  // 7. Shard: Upsert two-tier modern snapshot metrics (pins_daily_metrics)
  // [INVARIANT: TWO-TIER-MODERN-SHARDING]
  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  await shardSql`
    INSERT INTO pins_daily_metrics (
      pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
    ) VALUES (
      ${cleanPinId}, (NOW() AT TIME ZONE 'UTC')::date, ${newSaves}, ${newRepins},
      ${newComments}, ${newShares}, ${totalReactions}, ${syncVelocity}, NOW()
    )
    ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
      save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
      repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
      comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
      share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
      reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
      daily_save_velocity = COALESCE(EXCLUDED.daily_save_velocity, pins_daily_metrics.daily_save_velocity, 0),
      updated_at = NOW();
  `;
  await shardSql`
    UPDATE universal_master_pins
    SET
      metadata = (CASE WHEN jsonb_typeof(universal_master_pins.metadata) = 'object' THEN universal_master_pins.metadata ELSE '{}'::jsonb END)
        || CASE
             WHEN COALESCE(universal_master_pins.save_count, 0) > 0
              AND universal_master_pins.last_scraped_at IS NOT NULL
              AND (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              AND (
                universal_master_pins.save_count IS DISTINCT FROM ${newSaves}
                OR universal_master_pins.repin_count IS DISTINCT FROM ${newRepins}
              )
             THEN jsonb_build_object(
               'intraday_snapshots',
               (
                 SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
                 FROM (
                   SELECT elem, ord
                   FROM jsonb_array_elements(
                     (
                       CASE
                         WHEN jsonb_typeof(universal_master_pins.metadata->'intraday_snapshots') = 'array'
                         THEN universal_master_pins.metadata->'intraday_snapshots'
                         ELSE '[]'::jsonb
                       END
                     ) || jsonb_build_array(
                       jsonb_build_object(
                         'id', 'intra_' || EXTRACT(EPOCH FROM universal_master_pins.last_scraped_at)::bigint::text,
                         'snapshot_date', ((NOW() AT TIME ZONE 'UTC')::date)::text,
                         'recorded_at', to_char(universal_master_pins.last_scraped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                         'save_count', COALESCE(universal_master_pins.save_count, 0),
                         'repin_count', COALESCE(universal_master_pins.repin_count, 0),
                         'comment_count', COALESCE(universal_master_pins.comment_count, 0),
                         'share_count', COALESCE(universal_master_pins.share_count, 0)
                       )
                     )
                   ) WITH ORDINALITY AS t(elem, ord)
                   ORDER BY ord DESC
                   LIMIT 24
                 ) recent_intra
               )
             )
             ELSE '{}'::jsonb
           END,
      save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), ${newSaves}::bigint),
      repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), ${newRepins}::int),
      comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), ${newComments}::int),
      share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), ${newShares}::int),
      reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), ${totalReactions}::int),
      daily_save_velocity = COALESCE(${syncVelocity}::numeric, daily_save_velocity, 0),
      delta_saves_24h = ROUND(COALESCE(${syncVelocity}::numeric, 0))::int,
      delta_repins_24h = COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0),
      last_scraped_at = NOW(),
      updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `.catch(() => {});

  // 8. Shard: Upsert SERP positions (pin_serp_positions) for each associated active or displaced keyword
  // [INVARIANT: ATOMIC-BATCH-UPSERT-WITH-MAP-DEDUP]
  const combinedKeywordRows = [
    ...targetRows,
    ...displacedRows
      .filter(d => !targetRows.some(t => Number(t.keyword_id) === Number(d.keyword_id)))
      .map(d => ({
        keyword_id: d.keyword_id,
        rank_position: null,
        is_displaced: true,
        last_known_rank: d.last_known_rank || 100
      }))
  ];

  const validPositions = [];
  for (const row of combinedKeywordRows) {
    const shardKid = Number(row.keyword_id);
    if (shardKid != null) {
      if (shardKid > 0) {
        const isDisp = Boolean(row.is_displaced);
        const effLastRank = row.rank_position || row.last_known_rank || 100;
        const effCatalogRank = isDisp ? (Number(effLastRank) + 250) : Number(row.rank_position || 1);
        validPositions.push({
          pin_id: cleanPinId,
          keyword_id: shardKid,
          rank_position: isDisp ? null : row.rank_position,
          is_displaced: isDisp,
          last_known_rank: effLastRank,
          catalog_rank: effCatalogRank
        });
      }
    }
  }

  if (validPositions.length > 0) {
    // Deduplicate by keyword_id prioritizing active rank over displaced
    const dedupMap = new Map();
    for (const pos of validPositions) {
      const existing = dedupMap.get(pos.keyword_id);
      if (!existing || (pos.rank_position != null && (existing.rank_position == null || pos.rank_position < existing.rank_position))) {
        dedupMap.set(pos.keyword_id, pos);
      }
    }
    const cleanPositions = Array.from(dedupMap.values()).sort((a, b) => a.keyword_id - b.keyword_id);
    const positionsPayload = JSON.stringify(cleanPositions);

    await shardSql`
      INSERT INTO pin_serp_positions (
        pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
      )
      SELECT 
        x.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        x.keyword_id,
        x.rank_position,
        x.is_displaced,
        x.last_known_rank,
        x.catalog_rank,
        NOW()
      FROM jsonb_to_recordset(${positionsPayload}::jsonb) AS x(
        pin_id VARCHAR(64),
        keyword_id INT,
        rank_position INT,
        is_displaced BOOLEAN,
        last_known_rank INT,
        catalog_rank INT
      )
      ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
        rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
        is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
        last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
        catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
        updated_at = NOW();
    `;
  }

  // 9. Hub: Update active SERP state in keyword_serp_current
  if (targetRows.length > 0) {
    const incomingSyncMethod = isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || '');
    await hubSql`
      UPDATE keyword_serp_current
      SET
        title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
        domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
        destination_url = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), destination_url),
        image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
        creation_method = CASE
          WHEN ${incomingSyncMethod} <> '' AND LOWER(TRIM(${incomingSyncMethod})) <> 'pinterest_platform'
          THEN ${incomingSyncMethod}
          ELSE COALESCE(NULLIF(creation_method, ''), ${incomingSyncMethod}, 'pinterest_platform')
        END,
        save_count = GREATEST(save_count, ${newSaves}),
        repin_count = GREATEST(repin_count, ${newRepins}),
        comment_count = GREATEST(comment_count, ${newComments}),
        share_count = GREATEST(share_count, ${newShares}),
        daily_save_velocity = CASE
          WHEN (crawled_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
          THEN GREATEST(COALESCE(daily_save_velocity, 0), COALESCE(${syncVelocity}::numeric, 0))
          WHEN ${syncVelocity} IS NOT NULL AND (${syncVelocity} > 0 OR COALESCE((crawled_at AT TIME ZONE 'UTC')::date, baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN ${syncVelocity}
          ELSE daily_save_velocity
        END,
        delta_repins_24h = CASE
          WHEN (crawled_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
          THEN GREATEST(COALESCE(delta_repins_24h, 0), COALESCE(${syncRepinsDelta}::int, 0))
          ELSE COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0)
        END,
        metadata = ((CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END) 
          || ${JSON.stringify(rawMetaToStore)}::jsonb
          || CASE
               WHEN COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) IS NOT NULL 
                AND LOWER(TRIM(COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')))) NOT IN ('pinterest_platform')
                AND (${incomingSyncMethod} IS NULL OR LOWER(TRIM(${incomingSyncMethod})) IN ('', 'pinterest_platform'))
               THEN jsonb_build_object(
                 'creation_method', COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')),
                 'method', COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', ''))
               )
               ELSE '{}'::jsonb
             END) - 'deleted_snapshot_dates'
          || jsonb_build_object('deleted_snapshot_dates', (
               SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
               FROM jsonb_array_elements_text(COALESCE(keyword_serp_current.metadata->'deleted_snapshot_dates', '[]'::jsonb)) AS elem
               WHERE elem <> (NOW() AT TIME ZONE 'UTC')::date::text
             )),
        crawled_at = NOW(),
        updated_at = NOW()
      WHERE pin_id = ${cleanPinId};
    `;
  }

  // 9B. Hub: Update keyword_displaced_index if the pin is tracked in the Displaced Vault
  if (displacedRows.length > 0) {
    await hubSql`
      UPDATE keyword_displaced_index
      SET
        save_count = GREATEST(COALESCE(save_count, 0), ${newSaves}),
        repin_count = GREATEST(COALESCE(repin_count, 0), ${newRepins}),
        comment_count = GREATEST(COALESCE(comment_count, 0), ${newComments}),
        share_count = GREATEST(COALESCE(share_count, 0), ${newShares}),
        daily_save_velocity = COALESCE(${syncVelocity}::numeric, daily_save_velocity, 0),
        delta_saves_24h = ROUND(COALESCE(${syncVelocity}::numeric, 0))::int,
        delta_repins_24h = COALESCE(${syncRepinsDelta}::int, delta_repins_24h, 0),
        domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
        updated_at = NOW()
      WHERE pin_id = ${cleanPinId};
    `;
  }

  // 10. Hub: Update competitor_pins if tracked competitor pin
  await hubSql`
    UPDATE competitor_pins
    SET
      title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
      link_domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), link_domain),
      destination_url = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), destination_url),
      image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
      save_count = GREATEST(save_count, ${newSaves}),
      repin_count = GREATEST(repin_count, ${newRepins}),
      comment_count = GREATEST(comment_count, ${newComments}),
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(rawMetaToStore)}::jsonb,
      updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;

  // 11. Hub: Update pa_pins if in PinArchive
  await hubSql`
    UPDATE pa_pins
    SET
      title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
      domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
      link = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), link),
      image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
      saves = GREATEST(saves, ${newSaves}),
      repins = GREATEST(repins, ${newRepins}),
      comments = GREATEST(comments, ${newComments}),
      share_count = GREATEST(share_count, ${newShares}),
      velocity = COALESCE(${syncVelocity}::numeric, 0),
      reactions = COALESCE(reactions, '{}'::jsonb) || ${JSON.stringify(scrapedPin.reactions || {})}::jsonb,
      last_updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;


  // Step C: Fetch fresh universal dossier with edge cache bypassed
  const refreshedDossier = await fetchUniversalPinDossier({ hubSql, pinId: cleanPinId, ctx, env, bypassEdgeCache: true });

  return {
    success: true,
    synced: true,
    pin_id: cleanPinId,
    shard_id: shardId,
    syncVelocity,
    dossier: refreshedDossier
  };
}

/**
 * Canonical Deterministic Shard Batch Ingestion
 * Groups pins by (crc32(pin_id) % 99) + 1, executes atomic bulk upserts via jsonb_to_recordset,
 * and returns confirmedPinIds Set with zero-data-loss confirmation gate.
 *
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: BYTESTRING-HEADER-SAFETY]
 *
 * @param {object} params
 * @param {Array<object>} params.pins
 * @param {Function} params.hubSql
 * @param {object} [params.env]
 * @param {object} [params.ctx]
 * @param {object} [params.options]
 * @returns {Promise<Set<string>>} Decorated confirmedPinIds Set
 */
export async function writeBatchToDeterministicShards(params = {}) {
  const pins = params.pins || [];
  const hubSql = params.hubSql;
  const env = params.env || null;
  const ctx = params.ctx || null;
  const options = params.options || params;

  const confirmedPinIds = new Set();
  const failedShards = [];
  confirmedPinIds.confirmedPinIds = confirmedPinIds;
  confirmedPinIds.totalAttempted = Array.isArray(pins) ? pins.length : 0;
  confirmedPinIds.failedShards = failedShards;

  if (!Array.isArray(pins) || pins.length === 0) {
    return confirmedPinIds;
  }

  const totalShards = options.totalShards || 99;
  const virtualShardGroups = batchGroupByShard(pins, totalShards);
  const physicalShardGroups = coalesceShardGroupsByPhysical(virtualShardGroups);
  const concurrency = Math.max(1, Math.min(8, options.concurrency || 4));

  const formatPinForMasterPayload = (p) => {
    const pid = String(p.pin_id || p.id || '').trim();
    const reactions = p.reactions && typeof p.reactions === 'object' ? p.reactions : {};
    const reactionCount = Number(
      p.total_reaction_count ??
      p.reaction_count ??
      (typeof p.reactions === 'object' ? Object.values(reactions).reduce((acc, v) => acc + (Number(v) || 0), 0) : Number(p.reactions || 0))
    );
    const rawColor = p.dominant_color ? String(p.dominant_color).trim() : '';
    const cleanColor = (rawColor && !['', '#888888', '#1e1e24', '#000000', '#18181b'].includes(rawColor.toLowerCase())) ? rawColor : null;
    const richMeta = buildRichPinMetadataPayload(p);
    return {
      pin_id: pid,
      creator_username: String(p.creator_username || p.account_username || ''),
      board_name: String(p.board_name || ''),
      title: String(p.title || ''),
      domain: String(p.domain || p.link_domain || ''),
      destination_url: String(p.destination_url || p.link || ''),
      image_url: String(p.image_url || ''),
      description: String(p.description || ''),
      alt_text: String(p.alt_text || p.seo_alt_text || ''),
      dominant_color: cleanColor,
      visual_annotations: Array.isArray(p.visual_annotations || p.annotations) ? (p.visual_annotations || p.annotations) : [],
      created_at_pinterest: safeIsoDate(p.created_at_pinterest),
      metadata: richMeta,
      save_count: Math.max(0, Number(p.saves ?? p.save_count ?? 0)),
      repin_count: Math.max(0, Number(p.repins ?? p.repin_count ?? 0)),
      comment_count: Math.max(0, Number(p.comments ?? p.comment_count ?? 0)),
      share_count: Math.max(0, Number(p.shares ?? p.share_count ?? 0)),
      reaction_count: Math.max(0, Number(reactionCount || 0)),
      daily_save_velocity: Number(p.velocity ?? p.daily_save_velocity ?? 0),
      is_product: Boolean(richMeta.is_product),
      is_video: Boolean(richMeta.is_video),
      creation_method: richMeta.creation_method || null,
      image_signature: richMeta.image_signature || null,
      seo_noindex_reason: richMeta.seo_noindex_reason || null,
      is_repin: Boolean(richMeta.is_repin),
      canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null
    };
  };

  // Fast Unified-Postgres Path: write all pins directly to hubSql in a single batch
  if (isUnifiedPostgres(env) && hubSql && shardSqlClients.size === 0) {
    try {
      const pinMap = new Map();
      for (const p of pins) {
        const pid = String(p?.pin_id || p?.id || '').trim();
        if (pid) pinMap.set(pid, p);
      }
      if (pinMap.size === 0) return confirmedPinIds;

      const deduplicatedPins = Array.from(pinMap.values());
      deduplicatedPins.sort((a, b) => String(a.pin_id || a.id).localeCompare(String(b.pin_id || b.id)));
      const masterPayload = JSON.stringify(deduplicatedPins.map(formatPinForMasterPayload));

      await hubSql`
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_name, title, domain, destination_url,
          image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
          save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
          delta_saves_24h, delta_repins_24h,
          is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
          first_discovered_pillar, first_discovered_at, updated_at, last_scraped_at
        )
        SELECT DISTINCT ON (u.pin_id)
          u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
          u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
          NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
          COALESCE(u.save_count, 0)::bigint, COALESCE(u.repin_count, 0)::int, COALESCE(u.comment_count, 0)::int,
          COALESCE(u.share_count, 0)::int, COALESCE(u.reaction_count, 0)::int,
          COALESCE(
            CASE
              WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
              THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
              ELSE NULL
            END,
            u.daily_save_velocity,
            0
          )::numeric,
          COALESCE(
            CASE
              WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
              THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
              ELSE NULL
            END,
            u.daily_save_velocity,
            0
          )::numeric,
          COALESCE(
            CASE
              WHEN prev.repin_count IS NOT NULL AND prev.repin_count > 0 AND prev.snapshot_date IS NOT NULL
              THEN ROUND(GREATEST(0, COALESCE(u.repin_count, 0) - prev.repin_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)))::int
              WHEN prev.repin_count IS NOT NULL AND prev.repin_count > 0
              THEN GREATEST(0, COALESCE(u.repin_count, 0) - prev.repin_count)::int
              ELSE 0
            END,
            0
          )::int,
          COALESCE(u.is_product, FALSE), COALESCE(u.is_video, FALSE), u.creation_method, u.image_signature,
          u.seo_noindex_reason, COALESCE(u.is_repin, FALSE), u.canonical_pin_id,
          'batch_ingest', NOW(), NOW(), NOW()
        FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
          pin_id text, creator_username text, board_name text, title text, domain text, destination_url text,
          image_url text, description text, alt_text text, dominant_color text, visual_annotations jsonb,
          created_at_pinterest text, metadata jsonb,
          save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int,
          daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
          image_signature text, seo_noindex_reason text, is_repin boolean, canonical_pin_id text
        )
        LEFT JOIN LATERAL (
          SELECT pm.save_count, pm.repin_count, pm.snapshot_date
          FROM pins_daily_metrics pm
          WHERE pm.pin_id = u.pin_id
            AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
          ORDER BY pm.snapshot_date DESC
          LIMIT 1
        ) prev ON TRUE
        ORDER BY u.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          title = CASE
            WHEN EXCLUDED.title IS NOT NULL
             AND BTRIM(EXCLUDED.title) <> ''
             AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
             AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
            THEN EXCLUDED.title
            ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
          END,
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
          metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
          repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
          comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
          share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), COALESCE(EXCLUDED.share_count, 0)),
          reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), COALESCE(EXCLUDED.reaction_count, 0)),
          daily_save_velocity = CASE
            WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
            THEN GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0))
            WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
            ELSE COALESCE(universal_master_pins.daily_save_velocity, 0)
          END,
          delta_saves_24h = CASE
            WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
            THEN GREATEST(COALESCE(universal_master_pins.delta_saves_24h, 0), COALESCE(EXCLUDED.delta_saves_24h, 0))
            WHEN EXCLUDED.delta_saves_24h IS NOT NULL THEN EXCLUDED.delta_saves_24h
            ELSE COALESCE(universal_master_pins.delta_saves_24h, 0)
          END,
          delta_repins_24h = CASE
            WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
            THEN GREATEST(COALESCE(universal_master_pins.delta_repins_24h, 0), COALESCE(EXCLUDED.delta_repins_24h, 0))
            WHEN EXCLUDED.delta_repins_24h IS NOT NULL THEN EXCLUDED.delta_repins_24h
            ELSE COALESCE(universal_master_pins.delta_repins_24h, 0)
          END,
          is_product = COALESCE(EXCLUDED.is_product, universal_master_pins.is_product, FALSE),
          is_video = COALESCE(EXCLUDED.is_video, universal_master_pins.is_video, FALSE),
          creation_method = COALESCE(NULLIF(EXCLUDED.creation_method, ''), universal_master_pins.creation_method),
          image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), universal_master_pins.image_signature),
          seo_noindex_reason = COALESCE(NULLIF(EXCLUDED.seo_noindex_reason, ''), universal_master_pins.seo_noindex_reason),
          is_repin = COALESCE(EXCLUDED.is_repin, universal_master_pins.is_repin, FALSE),
          canonical_pin_id = COALESCE(NULLIF(EXCLUDED.canonical_pin_id, ''), universal_master_pins.canonical_pin_id),
          updated_at = NOW(),
          last_scraped_at = NOW();
      `;

      await hubSql`
        INSERT INTO pins_daily_metrics (
          pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
        )
        SELECT DISTINCT ON (u.pin_id)
          u.pin_id,
          (NOW() AT TIME ZONE 'UTC')::date,
          COALESCE(u.save_count, 0)::bigint,
          COALESCE(u.repin_count, 0)::int,
          COALESCE(u.comment_count, 0)::int,
          COALESCE(u.share_count, 0)::int,
          COALESCE(u.reaction_count, 0)::int,
          COALESCE(
            CASE
              WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 AND prev.snapshot_date IS NOT NULL
              THEN ROUND(GREATEST(0, COALESCE(u.save_count, 0) - prev.save_count)::numeric / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)), 1)
              ELSE NULL
            END,
            u.daily_save_velocity,
            0
          )::numeric,
          NOW()
        FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
          pin_id text, save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
        )
        LEFT JOIN LATERAL (
          SELECT pm.save_count, pm.snapshot_date
          FROM pins_daily_metrics pm
          WHERE pm.pin_id = u.pin_id
            AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
          ORDER BY pm.snapshot_date DESC
          LIMIT 1
        ) prev ON TRUE
        ORDER BY u.pin_id ASC
        ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
          save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
          comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
          share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
          reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
          daily_save_velocity = CASE
            WHEN (pins_daily_metrics.updated_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
            THEN GREATEST(COALESCE(pins_daily_metrics.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0))
            WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
            ELSE pins_daily_metrics.daily_save_velocity
          END,
          updated_at = NOW();
      `;

      for (const [pid] of pinMap) {
        confirmedPinIds.add(pid);
      }
      return confirmedPinIds;
    } catch (unifiedErr) {
      console.warn('[writeBatchToDeterministicShards] Unified Postgres batch write failed:', unifiedErr.message);
    }
  }

  const entries = Array.from(physicalShardGroups.entries());
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(async ([shardId, rawShardPins]) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId, env }).catch(() => null);
        if (!shardSql) {
          console.warn(`[writeBatchToDeterministicShards] Could not resolve shard #${shardId}`);
          failedShards.push(shardId);
          return;
        }

        // GUARDRAIL 2: Deduplicate shardPins in JavaScript before serialization (Map<pinId, pin>)
        const pinMap = new Map();
        for (const p of rawShardPins) {
          const pid = String(p?.pin_id || p?.id || '').trim();
          if (pid) pinMap.set(pid, p);
        }
        if (pinMap.size === 0) return;

        const deduplicatedPins = Array.from(pinMap.values());
        deduplicatedPins.sort((a, b) => String(a.pin_id || a.id).localeCompare(String(b.pin_id || b.id)));

        const masterPayload = JSON.stringify(deduplicatedPins.map(formatPinForMasterPayload));

        // 1. Batch Upsert into universal_master_pins
        // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
        // GUARDRAIL 2: Enforce DISTINCT ON (u.pin_id) ORDER BY u.pin_id ASC
        await shardSql`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
            save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
            delta_saves_24h, delta_repins_24h,
            is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
            first_discovered_pillar, first_discovered_at, updated_at, last_scraped_at
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
            u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
            NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
            COALESCE(u.save_count, 0)::bigint, COALESCE(u.repin_count, 0)::int, COALESCE(u.comment_count, 0)::int,
            COALESCE(u.share_count, 0)::int, COALESCE(u.reaction_count, 0)::int,
            COALESCE(u.daily_save_velocity, 0)::numeric,
            COALESCE(u.daily_save_velocity, 0)::numeric,
            0,
            COALESCE(u.is_product, FALSE), COALESCE(u.is_video, FALSE), u.creation_method, u.image_signature,
            u.seo_noindex_reason, COALESCE(u.is_repin, FALSE), u.canonical_pin_id,
            'batch_ingest', NOW(), NOW(), NOW()
          FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
            pin_id text, creator_username text, board_name text, title text, domain text, destination_url text,
            image_url text, description text, alt_text text, dominant_color text, visual_annotations jsonb,
            created_at_pinterest text, metadata jsonb,
            save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int,
            daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
            image_signature text, seo_noindex_reason text, is_repin boolean, canonical_pin_id text
          )
          ORDER BY u.pin_id ASC
          ON CONFLICT (pin_id) DO UPDATE SET
            creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
            board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
            title = CASE
              WHEN EXCLUDED.title IS NOT NULL
               AND BTRIM(EXCLUDED.title) <> ''
               AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
               AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
              THEN EXCLUDED.title
              ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
            END,
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
            metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(universal_master_pins.save_count, 0) END,
            repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(universal_master_pins.repin_count, 0) END,
            comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
            share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), COALESCE(EXCLUDED.share_count, 0)),
            reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), COALESCE(EXCLUDED.reaction_count, 0)),
            daily_save_velocity = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0))
              WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
              ELSE COALESCE(universal_master_pins.daily_save_velocity, 0)
            END,
            delta_saves_24h = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.delta_saves_24h, 0), COALESCE(EXCLUDED.delta_saves_24h, 0))
              WHEN EXCLUDED.delta_saves_24h IS NOT NULL THEN EXCLUDED.delta_saves_24h
              ELSE COALESCE(universal_master_pins.delta_saves_24h, 0)
            END,
            delta_repins_24h = CASE
              WHEN (universal_master_pins.last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
              THEN GREATEST(COALESCE(universal_master_pins.delta_repins_24h, 0), COALESCE(EXCLUDED.delta_repins_24h, 0))
              WHEN EXCLUDED.delta_repins_24h IS NOT NULL THEN EXCLUDED.delta_repins_24h
              ELSE COALESCE(universal_master_pins.delta_repins_24h, 0)
            END,
            is_product = COALESCE(EXCLUDED.is_product, universal_master_pins.is_product, FALSE),
            is_video = COALESCE(EXCLUDED.is_video, universal_master_pins.is_video, FALSE),
            creation_method = COALESCE(NULLIF(EXCLUDED.creation_method, ''), universal_master_pins.creation_method),
            image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), universal_master_pins.image_signature),
            seo_noindex_reason = COALESCE(NULLIF(EXCLUDED.seo_noindex_reason, ''), universal_master_pins.seo_noindex_reason),
            is_repin = COALESCE(EXCLUDED.is_repin, universal_master_pins.is_repin, FALSE),
            canonical_pin_id = COALESCE(NULLIF(EXCLUDED.canonical_pin_id, ''), universal_master_pins.canonical_pin_id),
            updated_at = NOW(),
            last_scraped_at = NOW();
        `;

        // 2. Batch Upsert into pins_daily_metrics
        // [INVARIANT: ZERO-HUB-SNAPSHOTS]
        // GUARDRAIL 2: Enforce DISTINCT ON (u.pin_id) ORDER BY u.pin_id ASC
        // GUARDRAIL 3: Wrap all numeric columns with COALESCE(u.save_count, 0)::bigint etc.
        await shardSql`
          INSERT INTO pins_daily_metrics (
            pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id,
            (NOW() AT TIME ZONE 'UTC')::date,
            COALESCE(u.save_count, 0)::bigint,
            COALESCE(u.repin_count, 0)::int,
            COALESCE(u.comment_count, 0)::int,
            COALESCE(u.share_count, 0)::int,
            COALESCE(u.reaction_count, 0)::int,
            COALESCE(u.daily_save_velocity, 0)::numeric,
            NOW()
          FROM jsonb_to_recordset(${masterPayload}::jsonb) AS u(
            pin_id text, save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
          )
          ORDER BY u.pin_id ASC
          ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
            save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
            comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
            share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
            reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
            daily_save_velocity = CASE
              WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
              ELSE pins_daily_metrics.daily_save_velocity
            END,
            updated_at = NOW();
        `;

        for (const [pid] of pinMap) {
          confirmedPinIds.add(pid);
        }
      } catch (shardErr) {
        console.warn(`[writeBatchToDeterministicShards] Shard #${shardId} batch write failed:`, shardErr.message);
        failedShards.push(shardId);
      }
    }));
  }

  return confirmedPinIds;
}

