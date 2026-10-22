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
import { calculateDailyVelocity } from '../../lib/math.mjs';
import { ensureEdgePinsMetadataTable } from '../keywords/d1-metadata.mjs';

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

// Bounded Background Task Execution Guard for Cloudflare Worker Isolate Lifecycle
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
      console.warn(`[safeWaitUntil] Background task "${taskName}" non-fatal warning:`, err?.message || err);
    })
    .finally(() => {
      clearTimeout(timer);
    });

  const storage = globalThis.__requestContextStorage;
  const store = storage?.getStore?.();
  if (store) {
    if (!Array.isArray(store.bgPromises)) store.bgPromises = [];
    store.bgPromises.push(guardedPromise);
  }

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(guardedPromise);
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
  if (!client || typeof client.transaction !== 'function' || client.__atomicBuilderWrapped) {
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

export function getOrCreateShardSqlClient(pooledDsn) {
  let client = getCachedShardSqlClient(pooledDsn);
  if (!client) {
    client = wrapShardNeonTransaction(neon(pooledDsn));
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
export const CIRCUIT_COOLDOWN_MS = 30000; // 30 seconds cooldown before half-open probe

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
  return circuitBreakers.get(shardId) || { state: 'CLOSED', failures: 0, nextAttempt: 0 };
}

/**
 * Test helper: Manually set circuit breaker state
 */
export function _setCircuitBreakerState(shardId, stateObj) {
  circuitBreakers.set(shardId, stateObj);
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
  if (!url.includes('.neon.tech') || url.includes('-pooler')) return url;

  return url.replace(/(@|:\/\/)([a-z0-9_-]+)(\.[a-z0-9_.-]*neon\.tech)/i, (match, prefix, endpointId, suffix) => {
    if (endpointId.endsWith('-pooler')) return match;
    return `${prefix}${endpointId}-pooler${suffix}`;
  });
}

/**
 * 2. Zero-Secrets Dynamic Connection Routing
 * Resolves a Neon SQL client for a target shard without storing 99 separate secrets.
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
 * @param {object} [options.env] - Cloudflare Workers environment bindings (PIN_ENGINE_KV)
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
  const shardName = getShardProjectName(cleanId, prefix);

  // 1. Template-based Resolution (Zero database roundtrip)
  const template = dsnTemplate || (typeof process !== 'undefined' ? process.env.NEON_SHARD_DSN_TEMPLATE : null);
  if (template) {
    const padded = String(cleanId).padStart(2, '0');
    const computedDsn = template
      .replace(/{SHARD_NUM}/g, padded)
      .replace(/{SHARD_ID}/g, String(cleanId))
      .replace(/{SHARD_NAME}/g, shardName);
    
    const pooledDsn = enforceNeonPoolerUrl(computedDsn);
    return getOrCreateShardSqlClient(pooledDsn);
  }

  // 2. Ultra-Fast In-Memory Lookup (0ms execution time from globalShardMap)
  const now = Date.now();
  if (globalShardMap.has(cleanId)) {
    const cachedEntry = globalShardMap.get(cleanId);
    if (cachedEntry?.database_url && (now - (cachedEntry.cachedAt || 0) < SHARD_MAP_TTL_MS)) {
      const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
      return getOrCreateShardSqlClient(pooledDsn);
    }
  }

  // 3. Lazy Singleflight Warmup from KV / Hub
  if (globalShardMap.size === 0 || (now - globalShardMapLastFetched >= SHARD_MAP_TTL_MS)) {
    await warmGlobalShardMap(hubSql, env);
    if (globalShardMap.has(cleanId)) {
      const cachedEntry = globalShardMap.get(cleanId);
      if (cachedEntry?.database_url) {
        const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
        return getOrCreateShardSqlClient(pooledDsn);
      }
    }
  }

  // 4. Workers KV Fast Shard Routing (fleet:shards_map)
  if (env?.PIN_ENGINE_KV) {
    const kvRows = await getFleetShardsMap(env, hubSql);
    if (Array.isArray(kvRows)) {
      const match = kvRows.find(r => 
        (r.project_name === shardName) ||
        (Array.isArray(r.assigned_shards) && r.assigned_shards.map(Number).includes(cleanId))
      );
      if (match?.database_url) {
        globalShardMap.set(cleanId, { ...match, cachedAt: now });
        globalShardMapLastFetched = now;
        const pooledDsn = enforceNeonPoolerUrl(match.database_url);
        return getOrCreateShardSqlClient(pooledDsn);
      }
    }
  }

  // 5. Final fallback: Refresh registry from Central Hub single row query
  if (!hubSql) {
    throw new Error(`Cannot resolve shard ${cleanId}: No Hub database client provided.`);
  }

  const [row] = await hubSql`
    SELECT id, project_id, project_name, database_url, status
    FROM neon_projects_registry
    WHERE (project_name = ${shardName} OR assigned_shards @> ARRAY[${cleanId}]::int[])
      AND status = 'active'
    LIMIT 1;
  `;

  if (!row || !row.database_url) {
    throw new Error(`Shard database '${shardName}' (ID: ${cleanId}) is not active in neon_projects_registry.`);
  }

  globalShardMap.set(cleanId, { ...row, cachedAt: now });
  globalShardMapLastFetched = now;

  const pooledDsn = enforceNeonPoolerUrl(row.database_url);
  return getOrCreateShardSqlClient(pooledDsn);
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
  if (env?.PIN_ENGINE_KV) {
    try {
      const kvData = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
      if (Array.isArray(kvData) && kvData.length > 0) {
        return kvData;
      }
    } catch (_) {}
  }

  if (hubSql) {
    try {
      const rows = await hubSql`
        SELECT id, project_id, project_name, database_url, status, assigned_shards
        FROM neon_projects_registry
        WHERE status = 'active';
      `;
      if (env?.PIN_ENGINE_KV && Array.isArray(rows) && rows.length > 0) {
        env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(rows), { expirationTtl: 86400 }).catch(() => {});
      }
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
 * @param {object} [env] - Cloudflare Workers environment bindings (PIN_ENGINE_KV)
 * @returns {Promise<number>} Number of shard mappings loaded
 */
export async function preloadNeonRegistry(hubSql, env = null) {
  const now = Date.now();
  try {
    let rows = null;
    if (env?.PIN_ENGINE_KV) {
      try {
        const kvData = await env.PIN_ENGINE_KV.get('fleet:shards_map', { type: 'json', cacheTtl: 300 });
        if (Array.isArray(kvData) && kvData.length > 0) {
          rows = kvData;
        }
      } catch (_) {}
    }

    if (!rows && hubSql) {
      rows = await hubSql`
        SELECT id, project_id, project_name, database_url, status, assigned_shards
        FROM neon_projects_registry
        WHERE status = 'active';
      `;
      if (env?.PIN_ENGINE_KV && Array.isArray(rows) && rows.length > 0) {
        env.PIN_ENGINE_KV.put('fleet:shards_map', JSON.stringify(rows), { expirationTtl: 86400 }).catch(() => {});
      }
    }

    if (!rows) return 0;
    let loaded = 0;
    for (const row of rows) {
      if (Array.isArray(row.assigned_shards)) {
        for (const sid of row.assigned_shards) {
          globalShardMap.set(Number(sid), { ...row, cachedAt: now });
          loaded++;
        }
      }
      const match = row.project_name?.match(/shard-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          globalShardMap.set(num, { ...row, cachedAt: now });
        }
      }
    }
    globalShardMapLastFetched = now;
    return loaded;
  } catch (err) {
    console.warn('[fleet-router] preloadNeonRegistry non-fatal warning:', err.message);
    return 0;
  }
}

/**
 * 3. Cold-Start Immunity & Circuit-Breaker Executor
 * Protects against Scale-to-Zero latencies (1-3 seconds) on Neon free projects.
 *
 * @param {object} options
 * @param {number} options.shardId - Target Shard ID
 * @param {Function} options.queryFn - Async query function accepting shardSql
 * @param {Function} [options.fallbackFn] - Fallback function executed if shard is cold/unreachable
 * @param {number} [options.timeoutMs=2500] - Hard query timeout before tripping breaker
 * @returns {Promise<any>} Query result or fallback result
 */
export async function executeShardQueryWithCircuitBreaker(optsOrShardId, maybeQueryFn = null, maybeOpts = {}) {
  let shardId, shardSql, queryFn, fallbackFn = null, timeoutMs = 2500, batchId = null;
  if (optsOrShardId && typeof optsOrShardId === 'object') {
    ({ shardId, shardSql, queryFn, fallbackFn = null, timeoutMs = 2500, batchId = null } = optsOrShardId);
  } else {
    shardId = optsOrShardId;
    queryFn = maybeQueryFn;
    timeoutMs = maybeOpts?.timeoutMs ?? 2500;
    fallbackFn = maybeOpts?.fallbackFn ?? null;
    batchId = maybeOpts?.batchId ?? null;
    shardSql = maybeOpts?.shardSql ?? null;
  }
  if (!shardSql) {
    shardSql = await resolveShardConnection({ shardId }).catch(() => null);
  }
  let cb = circuitBreakers.get(shardId);
  if (!cb) {
    cb = { state: 'CLOSED', failures: 0, nextAttempt: 0, _failedBatches: new Set() };
    circuitBreakers.set(shardId, cb);
  }
  const now = Date.now();

  // If breaker is OPEN and cooldown has not expired, fast-fail to fallback
  if (cb.state === 'OPEN') {
    if (now < cb.nextAttempt) {
      if (fallbackFn) {
        return await fallbackFn({ reason: 'CIRCUIT_OPEN', shardId });
      }
      throw new Error(`Shard ${shardId} circuit breaker is OPEN (re-evaluating in ${Math.round((cb.nextAttempt - now) / 1000)}s).`);
    }
    // Probe attempt (HALF_OPEN)
    cb.state = 'HALF_OPEN';
    circuitBreakers.set(shardId, cb);
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
    circuitBreakers.set(shardId, cb);
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
      console.warn(`[Fleet Circuit Breaker] Tripped OPEN for shard ${shardId}. Reason: ${err.message}`);
    }
    circuitBreakers.set(shardId, cb);

    if (fallbackFn) {
      return await fallbackFn({ reason: err.name || 'SHARD_ERROR', error: err, shardId });
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
  const uniqueIds = [...new Set(shardIds)].filter(id => id >= 1 && id <= 99);
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
export async function storeFolderCrossoverSynopsis(hubSql, folderId, synopsisData) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folderId');

  await hubSql`
    INSERT INTO keyword_folder_synopses (
      folder_id,
      synopsis_data,
      total_keywords,
      super_pins_count,
      universal_tags_count,
      shared_pivots_count,
      calculated_at,
      updated_at
    ) VALUES (
      ${fid},
      ${JSON.stringify(synopsisData)}::jsonb,
      ${synopsisData.summary?.total_keywords || 0},
      ${synopsisData.summary?.super_pins_count || 0},
      ${synopsisData.summary?.universal_tags_count || 0},
      ${synopsisData.summary?.shared_pivots_count || 0},
      NOW(),
      NOW()
    )
    ON CONFLICT (folder_id) DO UPDATE SET
      synopsis_data = EXCLUDED.synopsis_data,
      total_keywords = EXCLUDED.total_keywords,
      super_pins_count = EXCLUDED.super_pins_count,
      universal_tags_count = EXCLUDED.universal_tags_count,
      shared_pivots_count = EXCLUDED.shared_pivots_count,
      calculated_at = NOW(),
      updated_at = NOW();
  `;
}

/**
 * Fetches pre-aggregated crossover summary from Central Hub in < 15ms flat.
 *
 * @param {Function} hubSql - Central Hub database client
 * @param {number} folderId - Keyword folder ID
 * @returns {Promise<object|null>}
 */
export async function getFolderCrossoverSynopsis(hubSql, folderId) {
  const fid = Number(folderId);
  if (!fid) return null;

  const [row] = await hubSql`
    SELECT synopsis_data, calculated_at, updated_at
    FROM keyword_folder_synopses
    WHERE folder_id = ${fid}
    LIMIT 1;
  `;

  if (!row) return null;
  return {
    ...row.synopsis_data,
    cached: true,
    calculated_at: row.calculated_at
  };
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

  // Tier 1: Check Cloudflare D1 edge database (3.4ms latency) with 12h TTL freshness guard
  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  let d1Record = null;
  if (env?.PIN_D1_DB && !bypassEdgeCache) {
    try {
      await ensureEdgePinsMetadataTable(env);
      const row = await env.PIN_D1_DB.prepare(
        `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, daily_trajectory, created_at_pinterest, updated_at FROM edge_pins_metadata WHERE pin_id = ? LIMIT 1`
      ).bind(cleanPinId).first().catch(async () => {
        return await env.PIN_D1_DB.prepare(
          `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, created_at_pinterest, updated_at FROM edge_pins_metadata WHERE pin_id = ? LIMIT 1`
        ).bind(cleanPinId).first().catch(() => null);
      });
      if (row) {
        let parsedAnnotations = [];
        try { parsedAnnotations = typeof row.visual_annotations === 'string' ? JSON.parse(row.visual_annotations) : (row.visual_annotations || []); } catch (_) {}
        let parsedMeta = {};
        try { parsedMeta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}); } catch (_) {}
        let parsedTrajectory = [];
        if (row.daily_trajectory) {
          try {
            parsedTrajectory = typeof row.daily_trajectory === 'string'
              ? JSON.parse(row.daily_trajectory)
              : (Array.isArray(row.daily_trajectory) ? row.daily_trajectory : []);
          } catch (_) {}
        }
        d1Record = {
          ...row,
          metadata: parsedMeta,
          visual_annotations: parsedAnnotations,
          daily_trajectory: parsedTrajectory,
          alt_text: row.seo_alt_text || '',
          creation_method: parsedMeta.creation_method || parsedMeta.method || null
        };
      }
    } catch (_) {}
  }

  // 1 & 2. Ultra-Low Latency Parallel Scatter-Gather (t=0 concurrent dispatch)
  let shardErrorReason = null;
  const dossierBatchId = `dossier_batch_${cleanPinId}_${Date.now()}_${Math.random()}`;

  // [INVARIANT: D1-RICH-OR-BYPASS-GUARD]
  // Prevent hollow / empty D1 shells from being treated as valid cache hits for 12 hours.
  // A D1 cache record should ONLY be treated as a valid hit if it contains rich creative attributes:
  // - d1Record.pin_id
  // - (d1Record.title || d1Record.image_url)
  // - (d1Record.description && d1Record.description.length > 5)
  // - d1Record.created_at_pinterest
  // - d1UpdatedMs > 0 && (Date.now() - d1UpdatedMs) < 12 * 3600 * 1000
  // If a D1 record is a hollow shell (missing description or created_at_pinterest), hasValidD1 must be false,
  // allowing the query to fall through to the storage shard to fetch and upgrade the rich record!
  const d1UpdatedMs = parseD1DateMs(d1Record?.updated_at);
  const hasValidD1 = Boolean(
    d1Record && d1Record.pin_id &&
    (d1Record.title || d1Record.image_url) &&
    (d1Record.description && d1Record.description.length > 5) &&
    d1Record.created_at_pinterest &&
    d1UpdatedMs > 0 &&
    (Date.now() - d1UpdatedMs) < 12 * 3600 * 1000
  );

  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  // Zero-Wakeup Edge Resolution: When D1 contains a valid cached daily_trajectory with verified multi-day depth,
  // read-only views resolve in < 5ms without needing to wake up sleeping Neon Shard databases.
  // CRITICAL ANTI-POISONING GUARD: A 2-day fallback (today + yesterday baseline) is NOT verified shard history;
  // it must have > 2 days OR an explicit has_shard_trajectory flag to bypass the shard connection.
  const hasValidTrajectoryFromD1 = Boolean(
    !bypassEdgeCache &&
    hasValidD1 &&
    Array.isArray(d1Record?.daily_trajectory) &&
    (
      d1Record.daily_trajectory.length > 2 ||
      (d1Record.daily_trajectory.length >= 1 && d1Record.metadata?.has_shard_trajectory === true)
    )
  );

  let shardSql = null;
  if (!hasValidTrajectoryFromD1) {
    try {
      shardSql = await resolveShardConnection({ hubSql, shardId, env });
    } catch (_) {
      shardSql = hubSql; // Graceful degradation to Hub
    }
  }

  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  // Resolve master record: When fresh D1 record exists (or multi-day trajectory cached), resolve directly from D1
  const masterPromise = hasValidD1
    ? Promise.resolve(d1Record)
    : executeShardQueryWithCircuitBreaker({
        shardId,
        shardSql,
        queryFn: async (sqlClient) => {
          const [row] = await sqlClient`
            SELECT 
              pin_id, creator_username, board_id, board_name, board_slug, title, domain, destination_url,
              image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
              first_discovered_pillar, first_discovered_at, updated_at,
              COALESCE(metadata, '{}'::jsonb) AS metadata
            FROM universal_master_pins
            WHERE pin_id = ${cleanPinId}
            LIMIT 1;
          `;
          if (!row) return null;
          const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
          return {
            ...row,
            creation_method: meta.creation_method || meta.method || null
          };
        },
        fallbackFn: async (info) => {
          shardErrorReason = info?.reason || 'SHARD_UNAVAILABLE';
          return d1Record || null;
        },
        timeoutMs: 8500,
        batchId: dossierBatchId
      });

  // Zero-Wakeup Shard Immunity: When D1 contains a valid cached multi-day daily_trajectory,
  // resolve snapshots directly from edge D1 mirror without touching the dormant storage shard.
  const snapshotsPromise = hasValidTrajectoryFromD1
    ? Promise.resolve(d1Record.daily_trajectory)
    : executeShardQueryWithCircuitBreaker({
        shardId,
        shardSql,
        queryFn: async (sqlClient) => {
          // 1. Query Two-Tier view pins_daily_rollups_v2 first
          try {
            const rollups = await sqlClient`
              SELECT 
                pin_id, snapshot_date::text AS snapshot_date, save_count, repin_count,
                comment_count, share_count, reaction_count, daily_save_velocity,
                updated_at, serp_rankings
              FROM pins_daily_rollups_v2
              WHERE pin_id = ${cleanPinId}
              ORDER BY snapshot_date DESC
              LIMIT 90;
            `;
            if (rollups && rollups.length > 0) {
              const expanded = [];
              for (const r of rollups) {
                const rankings = Array.isArray(r.serp_rankings) ? r.serp_rankings : [];
                if (rankings.length === 0) {
                  expanded.push({
                    pin_id: r.pin_id,
                    snapshot_date: r.snapshot_date,
                    save_count: Number(r.save_count) || 0,
                    repin_count: Number(r.repin_count) || 0,
                    comment_count: Number(r.comment_count) || 0,
                    share_count: Number(r.share_count) || 0,
                    reaction_count: Number(r.reaction_count) || 0,
                    daily_save_velocity: Number(r.daily_save_velocity) || 0,
                    keyword_id: null,
                    rank_position: null,
                    is_displaced: false,
                    last_known_rank: null,
                    catalog_rank: null,
                    created_at: r.updated_at,
                    crawled_at: r.updated_at,
                    updated_at: r.updated_at
                  });
                } else {
                  for (const pos of rankings) {
                    expanded.push({
                      pin_id: r.pin_id,
                      snapshot_date: r.snapshot_date,
                      save_count: Number(r.save_count) || 0,
                      repin_count: Number(r.repin_count) || 0,
                      comment_count: Number(r.comment_count) || 0,
                      share_count: Number(r.share_count) || 0,
                      reaction_count: Number(r.reaction_count) || 0,
                      daily_save_velocity: Number(r.daily_save_velocity) || 0,
                      keyword_id: pos.keyword_id,
                      rank_position: pos.rank_position,
                      is_displaced: Boolean(pos.is_displaced),
                      last_known_rank: pos.last_known_rank,
                      catalog_rank: pos.catalog_rank,
                      created_at: r.updated_at,
                      crawled_at: r.updated_at,
                      updated_at: r.updated_at
                    });
                  }
                }
              }
              return expanded;
            }
          } catch (_) {}

          // 2. Graceful fallback to legacy pins_daily_snapshots
          const rows = await sqlClient`
            SELECT 
              id, snapshot_date::text AS snapshot_date, rank_position, is_displaced, save_count, repin_count,
              comment_count, share_count, reaction_count, daily_save_velocity,
              keyword_id, competitor_id, created_at, created_at AS crawled_at, created_at AS updated_at
            FROM pins_daily_snapshots
            WHERE pin_id = ${cleanPinId}
            ORDER BY snapshot_date DESC, created_at DESC
            LIMIT 90;
          `;
          return rows;
        },
        fallbackFn: async (info) => {
          if (!shardErrorReason) shardErrorReason = info?.reason || 'SHARD_UNAVAILABLE';
          return [];
        },
        timeoutMs: 8500,
        batchId: dossierBatchId
      });

  const [
    initialMaster,
    initialSnapshots,
    hubSerpRowsRaw,
    hubSnapshotsRaw
  ] = await Promise.all([
    masterPromise,
    snapshotsPromise,
    hubSql`
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
        sc.created_at_pinterest
      FROM keyword_serp_current sc
      LEFT JOIN tracked_keywords tk ON tk.id = sc.keyword_id
      WHERE sc.pin_id = ${cleanPinId}
      UNION ALL
      SELECT 
        kdi.keyword_id, kdi.pin_id, '' as title, '' as domain, '' as destination_url, '' as image_url,
        '' as creator_username, '' as board_name, kdi.save_count, kdi.repin_count,
        COALESCE(kdi.comment_count, 0) as comment_count,
        COALESCE(kdi.share_count, 0) as share_count,
        0 as reaction_count,
        kdi.daily_save_velocity, '#888888' as dominant_color, '[]'::jsonb as visual_annotations,
        NULL::int as rank_position, NULL::int as prev_rank_position, kdi.last_known_rank,
        TRUE as is_displaced, '{}'::jsonb as metadata,
        kdi.updated_at as crawled_at, kdi.updated_at,
        NULL::bigint as baseline_day_saves, NULL::date as baseline_day_date,
        tk.keyword AS keyword_name,
        NULL::text as creation_method,
        NULL::timestamptz as created_at_pinterest
      FROM keyword_displaced_index kdi
      LEFT JOIN tracked_keywords tk ON tk.id = kdi.keyword_id
      WHERE kdi.pin_id = ${cleanPinId}
        AND NOT EXISTS (
          SELECT 1 FROM keyword_serp_current sc2
          WHERE sc2.pin_id = kdi.pin_id AND sc2.keyword_id = kdi.keyword_id
        )
      ORDER BY save_count DESC;
    `.catch(() => []),
    // [INVARIANT: ZERO-HUB-SNAPSHOTS] Central Hub has no historical snapshot tables; time series lives strictly on Shards
    Promise.resolve([])
  ]);

  let masterRecord = initialMaster || d1Record;
  if (masterRecord && !masterRecord.creation_method) {
    const mMeta = typeof masterRecord.metadata === 'object' && masterRecord.metadata !== null ? masterRecord.metadata : {};
    masterRecord.creation_method = mMeta.creation_method || mMeta.method || null;
  }
  let snapshots = initialSnapshots;
  const hubSerpRows = Array.isArray(hubSerpRowsRaw) ? hubSerpRowsRaw : [];
  const hubSnapshots = Array.isArray(hubSnapshotsRaw) ? hubSnapshotsRaw : [];
  const snapRows = [...hubSnapshots]
    .sort((a, b) => (Boolean(b.metadata) - Boolean(a.metadata)) || (Number(b.save_count || 0) - Number(a.save_count || 0)))
    .slice(0, 10);

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
  let hubHistoricalSnap = (snapRows && snapRows.length > 0) ? snapRows[0] : null;
  const snapMetaObj = normalizeMetadata(hubHistoricalSnap?.metadata);
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
  for (const sRow of snapRows) {
    const sMeta = normalizeMetadata(sRow.metadata);
    for (const tag of normalizeVisualAnnotations(sMeta.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
  }

  // Hub Fallback & Synthesis: If masterRecord is missing on Shard N, synthesize from Hub SERP/Snapshots
  if (!masterRecord) {
    if (hubSerpRows.length > 0) {
      const topRow = hubSerpRows[0];
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
        alt_text: topHubMeta.alt_text || snapMetaObj.alt_text || '',
        description: topHubMeta.description || snapMetaObj.description || '',
        created_at_pinterest: topRow.created_at_pinterest || topHubMeta.created_at_pinterest || snapMetaObj.created_at_pinterest || null,
        creation_method: topRow.creation_method || topHubMeta.creation_method || snapMetaObj.creation_method || 'pinterest_platform',
        visual_annotations: Array.from(unionSet),
        metadata: { ...topHubMeta, ...snapMetaObj, creation_method: topRow.creation_method || topHubMeta.creation_method || snapMetaObj.creation_method || 'pinterest_platform' }
      };
    } else if (hubHistoricalSnap) {
      masterRecord = {
        pin_id: hubHistoricalSnap.pin_id,
        title: hubHistoricalSnap.title || snapMetaObj.seo_title || '',
        domain: hubHistoricalSnap.domain || snapMetaObj.seo_canonical_domain || '',
        destination_url: hubHistoricalSnap.destination_url || snapMetaObj.tracked_link || snapMetaObj.utm_link || '',
        image_url: hubHistoricalSnap.image_url,
        creator_username: snapMetaObj.pinner?.username || '',
        board_name: snapMetaObj.board_name || '',
        save_count: hubHistoricalSnap.save_count,
        repin_count: hubHistoricalSnap.repin_count,
        daily_save_velocity: hubHistoricalSnap.daily_save_velocity,
        dominant_color: snapMetaObj.dominant_color || '#888888',
        alt_text: snapMetaObj.alt_text || '',
        description: snapMetaObj.description || '',
        created_at_pinterest: hubHistoricalSnap.created_at_pinterest || snapMetaObj.created_at_pinterest || null,
        creation_method: snapMetaObj.creation_method || snapMetaObj.method || 'pinterest_platform',
        visual_annotations: Array.from(unionSet),
        metadata: { ...snapMetaObj, creation_method: snapMetaObj.creation_method || snapMetaObj.method || 'pinterest_platform' }
      };
    }
  } else {
    // Shard record exists: enrich missing alt_text, description, or created_at_pinterest if recovered from Hub
    if (!masterRecord.alt_text) {
      masterRecord.alt_text = shardMetaObj.alt_text || topHubMeta.alt_text || snapMetaObj.alt_text || '';
    }
    if (!masterRecord.description) {
      masterRecord.description = shardMetaObj.description || topHubMeta.description || snapMetaObj.description || '';
    }
    if (!masterRecord.created_at_pinterest) {
      masterRecord.created_at_pinterest = shardMetaObj.created_at_pinterest || hubSerpRows[0]?.created_at_pinterest || topHubMeta.created_at_pinterest || snapMetaObj.created_at_pinterest || null;
    }
    if (!masterRecord.creation_method) {
      masterRecord.creation_method = shardMetaObj.creation_method || hubSerpRows[0]?.creation_method || topHubMeta.creation_method || snapMetaObj.creation_method || null;
    }
    masterRecord.metadata = { ...topHubMeta, ...snapMetaObj, ...shardMetaObj };
  }

  const finalVisualAnnotations = Array.from(unionSet)
    .map(t => String(t || '').trim())
    .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
    .slice(0, 15);

  // Auto-Backfill / Write-Through: Ensure shard has the latest rich treasures
  const shouldBackfillShard = !initialMaster && !d1Record && shardSql && shardSql !== hubSql && masterRecord;

  if (shouldBackfillShard) {
    const backfillPromise = (async () => {
      try {
        const backfillCandidates = [
          shardMetaObj.creation_method,
          snapMetaObj.creation_method,
          snapMetaObj.method,
          hubSerpRows[0]?.creation_method,
          topHubMeta.creation_method
        ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
        const resolvedBackfillMethod = backfillCandidates.find(m => m !== 'pinterest_platform') || backfillCandidates[0] || 'pinterest_platform';
        const enrichedMetaToSave = {
          ...topHubMeta,
          ...snapMetaObj,
          ...shardMetaObj,
          creation_method: resolvedBackfillMethod
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
            title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
            image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
            description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
            alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
            dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
            visual_annotations = CASE 
              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations 
              ELSE universal_master_pins.visual_annotations 
            END,
            created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
            metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
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

  function safeIsoDate(val, fallback = null) {
    if (!val) return fallback;
    try {
      const d = new Date(val);
      return !isNaN(d.getTime()) ? d.toISOString() : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getSnapTimestamp(s) {
    const t = s.created_at || s.updated_at || s.snapshot_date;
    return t ? new Date(t).getTime() : 0;
  }

  // Populate map with Shard snapshots first
  for (const s of shardList) {
    const sDate = formatUtcDate(s.snapshot_date);
    if (!sDate) continue;
    const dedupKey = `${sDate}_${s.keyword_id || 'global'}`;
    snapshotMap.set(dedupKey, s);
  }

  // [INVARIANT: ZERO-HUB-SNAPSHOTS]
  // Synthesize live in-memory SERP points from Hub active catalog (read-time only, no DB writes)
  // Decoupled from strict todayUtc: Any valid crawl date represents a valid telemetry capture point
  for (const sc of hubSerpRows) {
    const crawlDate = sc.crawled_at || sc.updated_at;
    const crawlIso = formatUtcDate(crawlDate);
    if (crawlIso) {
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
      if (baseDateStr && (!crawlIso || baseDateStr < crawlIso)) {
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

  // Merge Hub snapshots with LWW and collect missing snapshots for Shard Read-Repair
  const missingFromShard = [];
  for (const h of hubSnapshots) {
    const hDate = formatUtcDate(h.snapshot_date);
    if (!hDate) continue;
    const dedupKey = `${hDate}_${h.keyword_id || 'global'}`;
    const existing = snapshotMap.get(dedupKey);

    if (!existing) {
      snapshotMap.set(dedupKey, h);
      missingFromShard.push(h);
    } else {
      const existingTime = getSnapTimestamp(existing);
      const incomingTime = getSnapTimestamp(h);
      if (incomingTime > existingTime || (incomingTime === existingTime && Number(h.id || 0) > Number(existing.id || 0))) {
        snapshotMap.set(dedupKey, h);
      }
    }
  }

  snapshots = Array.from(snapshotMap.values()).sort(
    (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
  );

  // Non-blocking Read-Repair: Backfill missing historical Hub snapshots into target shard
  if (shardSql && shardSql !== hubSql && missingFromShard.length > 0 && !reconcilingPins.has(cleanPinId)) {
    reconcilingPins.add(cleanPinId);
    const repairPromise = (async () => {
      try {
        const repairPayload = missingFromShard.slice(0, 90).map(s => {
          const sDate = formatUtcDate(s.snapshot_date);
          return {
            pin_id: cleanPinId,
            keyword_id: s.keyword_id != null && !isNaN(Number(s.keyword_id)) ? Number(s.keyword_id) : null,
            snapshot_date: sDate,
            rank_position: s.rank_position != null && !isNaN(Number(s.rank_position)) ? Number(s.rank_position) : null,
            is_displaced: Boolean(s.is_displaced),
            save_count: Number(s.save_count || 0),
            repin_count: Number(s.repin_count || 0),
            comment_count: Number(s.comment_count || 0),
            share_count: Number(s.share_count || 0),
            reaction_count: Number(s.reaction_count || 0),
            daily_save_velocity: Number(s.daily_save_velocity || 0),
            created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString()
          };
        });

        const txQueries = [];

        // Two-Tier Shard Read-Repair: Hydrate pins_daily_metrics (Note: pins_daily_snapshots is a consolidated VIEW)
        const metricsMap = new Map();
        for (const s of repairPayload) {
          const d = s.snapshot_date;
          if (!metricsMap.has(d) || Number(s.save_count) > Number(metricsMap.get(d).save_count)) {
            metricsMap.set(d, s);
          }
        }
        // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
        const metricsRows = Array.from(metricsMap.values());
        if (metricsRows.length > 0) {
          txQueries.push((db) => db`
            INSERT INTO pins_daily_metrics (
              pin_id, snapshot_date, save_count, repin_count,
              comment_count, share_count, reaction_count, daily_save_velocity, updated_at
            )
            SELECT
              u.pin_id, u.snapshot_date::date, u.save_count, u.repin_count,
              u.comment_count, u.share_count, u.reaction_count, u.daily_save_velocity, u.created_at::timestamptz
            FROM jsonb_to_recordset(${JSON.stringify(metricsRows)}::jsonb) AS u(
              pin_id text, snapshot_date text, save_count bigint, repin_count int,
              comment_count int, share_count int, reaction_count int, daily_save_velocity numeric, created_at text
            )
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
          `);
        }

        // Two-Tier Shard Read-Repair: Hydrate pin_serp_positions
        const positionRows = repairPayload.filter(s => s.keyword_id != null && Number(s.keyword_id) > 0);
        if (positionRows.length > 0) {
          txQueries.push((db) => db`
            INSERT INTO pin_serp_positions (
              pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
            )
            SELECT
              u.pin_id, u.snapshot_date::date, u.keyword_id, u.rank_position, u.is_displaced, u.rank_position,
              CASE WHEN u.is_displaced THEN (COALESCE(u.rank_position, 1) + 250) ELSE COALESCE(u.rank_position, 1) END, u.created_at::timestamptz
            FROM jsonb_to_recordset(${JSON.stringify(positionRows)}::jsonb) AS u(
              pin_id text, snapshot_date text, keyword_id int, rank_position int, is_displaced boolean, created_at text
            )
            ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
              rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
              is_displaced = COALESCE(EXCLUDED.is_displaced, pin_serp_positions.is_displaced),
              updated_at = NOW();
          `);
        }

        if (txQueries.length > 0) {
          if (typeof shardSql.transaction === 'function') {
            await shardSql.transaction(txQueries);
          } else {
            for (const buildQuery of txQueries) {
              await buildQuery(shardSql);
            }
          }
        }
      } catch (repairErr) {
        console.warn(`[Read-Repair] Shard ${shardId} pin ${cleanPinId} snapshot repair deferred:`, repairErr.message);
      } finally {
        reconcilingPins.delete(cleanPinId);
      }
    })();

    // Edge execution: Dispatch asynchronously via ctx.waitUntil; Fall back to bounded Promise.race for CLI/Node
    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, repairPromise, 'dossier_read_repair');
    } else {
      try {
        let timerId;
        const timeoutPromise = new Promise(r => {
          timerId = setTimeout(r, 1500);
        });
        await Promise.race([
          repairPromise,
          timeoutPromise
        ]).finally(() => {
          if (timerId) clearTimeout(timerId);
        });
      } catch (_) {}
    }
  }

  // Resolve Keyword Names for all snapshot keyword_ids to eliminate multi-SERP ambiguity
  const rawSnapshots = snapshots || [];
  const kwMap = new Map();
  for (const r of hubSerpRows) {
    if (r?.keyword_id && r?.keyword_name) kwMap.set(Number(r.keyword_id), r.keyword_name);
  }
  for (const r of hubSnapshots) {
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

  const enrichedSnapshots = rawSnapshots.map((s, sIdx) => {
    const sDate = formatUtcDate(s.snapshot_date);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    const serpMatch = (kid ? serpByKeyword.get(kid) : null) || hubSerpRows[0] || null;
    const isDisplaced = Boolean(
      s.is_displaced ||
      serpMatch?.is_displaced ||
      (!s.rank_position && (s.last_known_rank || serpMatch?.last_known_rank))
    );
    const lastKnownRank = s.last_known_rank || serpMatch?.last_known_rank || (isDisplaced ? (s.rank_position || serpMatch?.rank_position) : null);
    const catalogRank = s.catalog_rank || (isDisplaced ? (100 + (sIdx + 1)) : (s.rank_position || 1));
    const crawlTimestamp = safeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (sDate ? sDate + 'T00:00:00.000Z' : null);
    const updatedTimestamp = safeIsoDate(s.updated_at) || crawlTimestamp;
    return {
      ...s,
      snapshot_date: sDate,
      crawled_at: crawlTimestamp,
      updated_at: updatedTimestamp,
      keyword_name: kid ? (kwMap.get(kid) || `Keyword #${kid}`) : null,
      is_displaced: isDisplaced,
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
        snapshot_date: dateKey,
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
      day.ranking_keywords.push({
        keyword_id: s.keyword_id,
        keyword: s.keyword_name,
        rank: effRank,
        rank_position: s.rank_position || null,
        last_known_rank: s.last_known_rank || null,
        is_displaced: Boolean(s.is_displaced),
        saves: Number(s.save_count) || 0
      });
    }
  }

  // Chronologically sort and enforce non-decreasing monotonic saves (prevents sawtooth jumps)
  const dailyTrajectory = Array.from(dailyMap.values()).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  const chronoDays = [...dailyTrajectory].reverse();
  let runningMaxSaves = 0;
  for (const d of chronoDays) {
    if (d.save_count < runningMaxSaves) {
      d.save_count = runningMaxSaves;
    } else {
      runningMaxSaves = d.save_count;
    }
  }
  for (let i = 1; i < chronoDays.length; i++) {
    const prev = chronoDays[i - 1];
    const curr = chronoDays[i];
    const prevDate = new Date(prev.snapshot_date);
    const currDate = new Date(curr.snapshot_date);
    const elapsedDays = Math.max(1, Math.round((currDate - prevDate) / 86400000));
    const diff = curr.save_count - prev.save_count;

    if (diff > 0) {
      curr.daily_save_velocity = Math.max(Number(curr.daily_save_velocity || 0), Math.round((diff / elapsedDays) * 10) / 10);
    } else if (diff === 0) {
      if (elapsedDays >= 1 && (!curr.daily_save_velocity || curr.daily_save_velocity === 0)) {
        curr.daily_save_velocity = 0;
      }
    }
  }

  // 3. Central Hub Relational Cross-Pillar Context (In-Memory ranking_keywords + conditional competitor lookup)
  const rankingKeywordsFromMem = hubSerpRows
    .filter(sc => sc.keyword_id && (sc.keyword_name || kwMap.get(Number(sc.keyword_id))))
    .map(sc => ({
      keyword_id: Number(sc.keyword_id),
      keyword: sc.keyword_name || kwMap.get(Number(sc.keyword_id)),
      rank: sc.rank_position ?? sc.last_known_rank ?? null,
      rank_position: sc.rank_position ?? null,
      last_known_rank: sc.last_known_rank ?? null,
      is_displaced: Boolean(sc.is_displaced),
      catalog_rank: sc.is_displaced ? ((Number(sc.last_known_rank) || 1) + 250) : (Number(sc.rank_position) || 1),
      velocity: Number(sc.daily_save_velocity || 0)
    }));

  let competitorInfo = null;
  if (masterRecord?.creator_username) {
    const [compRow] = await hubSql`
      SELECT id as competitor_id, username as competitor_username, display_name, is_active as competitor_active
      FROM competitor_profiles
      WHERE LOWER(username) = LOWER(${masterRecord.creator_username})
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
    ...(snapRows || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean),
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
    ...cleanMeta(hubHistoricalSnap?.metadata), 
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
    snapMeta.creation_method,
    snapMeta.method,
    hubSerpRows[0]?.creation_method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const resolvedCreationMethod = candidateCreationMethods.find(m => m !== 'pinterest_platform') || candidateCreationMethods[0] || 'pinterest_platform';

  const algorithmicIntelligence = {
    is_repin: Boolean(snapMeta.is_repin ?? false),
    origin_pinner: snapMeta.origin_pinner || null,
    domain_official_user: snapMeta.domain_official_user || null,
    creator_is_verified_merchant: Boolean(snapMeta.creator_is_verified_merchant ?? false),
    image_signature: snapMeta.image_signature || '',
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
    tracked_link: snapMeta.tracked_link || masterRecord?.destination_url || ''
  };

  const latestLiveAnnotations = new Set(
    normalizeVisualAnnotations(snapMeta.visual_annotations || hubSerpRows[0]?.metadata?.visual_annotations || hubHistoricalSnap?.metadata?.visual_annotations)
      .map(t => String(t || '').trim())
      .filter(Boolean)
  );

  const detailedAnnotations = finalVisualAnnotations.map(tag => ({
    name: tag,
    is_live: latestLiveAnnotations.size > 0 ? latestLiveAnnotations.has(tag) : true,
    status: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'live' : 'historical',
    label: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'Live Active' : 'Historical Crawl'
  }));

  const fromShardSnapshots = Boolean(
    hasValidTrajectoryFromD1
      ? (d1Record?.metadata?.has_shard_trajectory || (Array.isArray(d1Record?.daily_trajectory) && d1Record.daily_trajectory.length > 2))
      : (Array.isArray(initialSnapshots) && initialSnapshots.length > 0)
  );

  const isDegraded = Boolean(
    shardErrorReason ||
    (!hasValidTrajectoryFromD1 && (!initialSnapshots || initialSnapshots.length === 0) && ((hubContext?.ranking_keywords?.length || 0) > 0 || (dailyTrajectory && dailyTrajectory.length <= 2)))
  );

  const dossierResult = {
    success: true,
    pin_id: cleanPinId,
    shard_id: shardId,
    is_degraded: isDegraded,
    shard_cold: Boolean(shardErrorReason),
    shard_error_reason: shardErrorReason || null,
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
      created_at_pinterest: masterRecord?.created_at_pinterest || hubHistoricalSnap?.created_at_pinterest || snapMeta.created_at_pinterest || snapMeta.created_at || null,
      creation_method: resolvedCreationMethod,
      image_signature: snapMeta.image_signature || '',
      canonical_pin_id: canonicalPinId,
      canonical_pin_url: canonicalPinUrl,
      is_canonical_root: isCanonicalRoot,
      save_count: Number(dailyTrajectory[0]?.save_count ?? hubSerpRows[0]?.save_count ?? masterRecord?.save_count ?? 0),
      repin_count: Number(dailyTrajectory[0]?.repin_count ?? hubSerpRows[0]?.repin_count ?? masterRecord?.repin_count ?? 0),
      comment_count: Number(dailyTrajectory[0]?.comment_count ?? hubSerpRows[0]?.comment_count ?? 0),
      share_count: Number(dailyTrajectory[0]?.share_count ?? hubSerpRows[0]?.share_count ?? 0),
      daily_save_velocity: Number(dailyTrajectory[0]?.daily_save_velocity ?? hubSerpRows[0]?.daily_save_velocity ?? 0),
      first_discovered_pillar: masterRecord?.first_discovered_pillar || 'keyword',
      is_deleted: Boolean(masterRecord?.is_deleted || hubHistoricalSnap?.metadata?.is_deleted || (hubHistoricalSnap?.metadata?.status === 'archived_404'))
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
    snapshots: enrichedSnapshots
  };

  // Tier 1 Edge Mirror & Write-Through: Persist fresh shard metadata & daily_trajectory to D1 & KV
  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  // CRITICAL ANTI-POISONING GUARD: Never mirror a degraded fallback (2-day synthesis from Hub) as a complete trajectory in D1.
  // Only write daily_trajectory to D1 if it originated from real Shard snapshots or has real multi-day depth (> 2 days).
  const canMirrorTrajectoryToD1 = Boolean(
    fromShardSnapshots ||
    (Array.isArray(dailyTrajectory) && dailyTrajectory.length > 2)
  );

  if ((env?.PIN_D1_DB || env?.PIN_ENGINE_KV) && masterRecord && (!hasValidTrajectoryFromD1 || bypassEdgeCache)) {
    const edgeWriteThroughPromise = (async () => {
      const fullMetaObj = { ...snapMeta, ...cleanMeta(masterRecord.metadata) };
      if (canMirrorTrajectoryToD1) {
        fullMetaObj.has_shard_trajectory = true;
      }
      // 1. Write to Cloudflare D1 edge_pins_metadata
      if (env?.PIN_D1_DB) {
        try {
          await ensureEdgePinsMetadataTable(env);
          await env.PIN_D1_DB.prepare(`
            INSERT INTO edge_pins_metadata (
              pin_id, title, domain, destination_url, image_url,
              creator_username, board_name, dominant_color, visual_annotations,
              seo_alt_text, description, metadata, daily_trajectory, created_at_pinterest, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(pin_id) DO UPDATE SET
              title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE edge_pins_metadata.title END,
              domain = CASE WHEN excluded.domain <> '' THEN excluded.domain ELSE edge_pins_metadata.domain END,
              destination_url = CASE WHEN excluded.destination_url <> '' THEN excluded.destination_url ELSE edge_pins_metadata.destination_url END,
              image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url ELSE edge_pins_metadata.image_url END,
              creator_username = CASE WHEN excluded.creator_username <> '' THEN excluded.creator_username ELSE edge_pins_metadata.creator_username END,
              board_name = CASE WHEN excluded.board_name <> '' THEN excluded.board_name ELSE edge_pins_metadata.board_name END,
              dominant_color = CASE WHEN excluded.dominant_color <> '#888888' THEN excluded.dominant_color ELSE edge_pins_metadata.dominant_color END,
              visual_annotations = CASE WHEN excluded.visual_annotations <> '[]' THEN excluded.visual_annotations ELSE edge_pins_metadata.visual_annotations END,
              seo_alt_text = CASE WHEN excluded.seo_alt_text <> '' THEN excluded.seo_alt_text ELSE edge_pins_metadata.seo_alt_text END,
              description = CASE WHEN excluded.description <> '' THEN excluded.description ELSE edge_pins_metadata.description END,
              metadata = CASE WHEN excluded.metadata <> '{}' AND excluded.metadata <> '' THEN excluded.metadata ELSE edge_pins_metadata.metadata END,
              daily_trajectory = CASE WHEN excluded.daily_trajectory <> '[]' AND excluded.daily_trajectory <> '' THEN excluded.daily_trajectory ELSE edge_pins_metadata.daily_trajectory END,
              created_at_pinterest = COALESCE(excluded.created_at_pinterest, edge_pins_metadata.created_at_pinterest),
              updated_at = excluded.updated_at
          `).bind(
            String(masterRecord.pin_id),
            String(masterRecord.title || ''),
            String(masterRecord.domain || ''),
            String(masterRecord.destination_url || ''),
            String(masterRecord.image_url || ''),
            String(masterRecord.creator_username || ''),
            String(masterRecord.board_name || ''),
            String(masterRecord.dominant_color || '#888888'),
            JSON.stringify(finalVisualAnnotations),
            String(masterRecord.alt_text || ''),
            String(masterRecord.description || ''),
            JSON.stringify(fullMetaObj),
            canMirrorTrajectoryToD1 ? JSON.stringify(dailyTrajectory || []) : (d1Record?.daily_trajectory ? JSON.stringify(d1Record.daily_trajectory) : '[]'),
            masterRecord.created_at_pinterest ? new Date(masterRecord.created_at_pinterest).toISOString() : null
          ).run();
        } catch (_) {}
      }

      // 2. Write to Cloudflare Workers KV (only if healthy and verified from shard)
      if (env?.PIN_ENGINE_KV && !isDegraded) {
        try {
          const kvPayload = JSON.stringify(dossierResult);
          await Promise.all([
            env.PIN_ENGINE_KV.put(`pin:dossier?pin_id=${cleanPinId}`, kvPayload, { expirationTtl: 43200 }),
            env.PIN_ENGINE_KV.put(`dossier:pin:${cleanPinId}`, kvPayload, { expirationTtl: 43200 })
          ]);
        } catch (_) {}
      }
    })();

    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, edgeWriteThroughPromise, `edge_sync_${cleanPinId}`);
    } else {
      try {
        let timerId;
        const timeoutPromise = new Promise(r => { timerId = setTimeout(r, 1500); });
        await Promise.race([edgeWriteThroughPromise, timeoutPromise]).finally(() => {
          if (timerId) clearTimeout(timerId);
        });
      } catch (_) {}
    }
  }

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

  // 1. Try KV Cache first (< 1ms)
  if (env?.PIN_ENGINE_KV) {
    try {
      const kvKey = `pin:dossier?pin_id=${cleanPinId}`;
      const kvData = await env.PIN_ENGINE_KV.get(kvKey, 'json');
      if (kvData) {
        return { ...kvData, source: 'edge_kv' };
      }
    } catch (_) {}
  }

  // 2. Try Cloudflare D1 edge mirror (< 3.5ms)
  // [INVARIANT: EDGE-D1-SNAPSHOT-MIRRORING]
  if (env?.PIN_D1_DB) {
    try {
      await ensureEdgePinsMetadataTable(env);
      let row = await env.PIN_D1_DB.prepare(
        `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, daily_trajectory, created_at_pinterest, updated_at FROM edge_pins_metadata WHERE pin_id = ? LIMIT 1`
      ).bind(cleanPinId).first().catch(async () => {
        return await env.PIN_D1_DB.prepare(
          `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, created_at_pinterest, updated_at FROM edge_pins_metadata WHERE pin_id = ? LIMIT 1`
        ).bind(cleanPinId).first().catch(() => null);
      });
      // [INVARIANT: D1-RICH-OR-BYPASS-GUARD]
      // Only serve edge prefetch if D1 record contains rich creative attributes (not a hollow shell)
      const isRichD1 = Boolean(
        row && (row.title || row.image_url) &&
        (row.description && row.description.length > 5) &&
        row.created_at_pinterest
      );
      if (isRichD1) {
        let parsedAnnotations = [];
        try { parsedAnnotations = typeof row.visual_annotations === 'string' ? JSON.parse(row.visual_annotations) : (row.visual_annotations || []); } catch (_) {}
        let parsedMeta = {};
        try { parsedMeta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}); } catch (_) {}
        let parsedTrajectory = [];
        if (row.daily_trajectory) {
          try {
            parsedTrajectory = typeof row.daily_trajectory === 'string'
              ? JSON.parse(row.daily_trajectory)
              : (Array.isArray(row.daily_trajectory) ? row.daily_trajectory : []);
          } catch (_) {}
        }

        return {
          success: true,
          pin_id: cleanPinId,
          source: 'edge_d1',
          creative: {
            title: row.title || `Pin ${cleanPinId}`,
            description: row.description || '',
            alt_text: row.seo_alt_text || '',
            destination_url: row.destination_url || '',
            domain: row.domain || 'pinterest.com',
            image_url: row.image_url || '',
            dominant_color: row.dominant_color || '#888888',
            visual_annotations: parsedAnnotations,
            created_at_pinterest: row.created_at_pinterest || null,
            canonical_pin_id: parsedMeta.canonical_pin_id || null,
            canonical_pin_url: parsedMeta.canonical_pin_url || null,
            save_count: Number(parsedTrajectory[0]?.save_count || parsedMeta.save_count || 0),
            repin_count: Number(parsedTrajectory[0]?.repin_count || parsedMeta.repin_count || 0),
            comment_count: Number(parsedTrajectory[0]?.comment_count || 0),
            share_count: Number(parsedTrajectory[0]?.share_count || 0),
            daily_save_velocity: Number(parsedTrajectory[0]?.daily_save_velocity || 0),
            creation_method: parsedMeta.creation_method || parsedMeta.method || 'pinterest_platform'
          },
          algorithmic_intelligence: {
            creation_method: parsedMeta.creation_method || parsedMeta.method || 'pinterest_platform',
            canonical_pin_id: parsedMeta.canonical_pin_id || null,
            canonical_pin_url: parsedMeta.canonical_pin_url || null,
            seo_related_interests: Array.isArray(parsedMeta.seo_related_interests) ? parsedMeta.seo_related_interests : []
          },
          pillar_1_creator_context: {
            creator_username: row.creator_username || '',
            board_name: row.board_name || ''
          },
          daily_trajectory: parsedTrajectory,
          snapshots: parsedTrajectory
        };
      }
    } catch (_) {}
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

    return {
      success: true,
      shard_id: shardId,
      timeframe,
      trajectory: snapshots || [],
      snapshots: snapshots || []
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
    shopping_flags: Array.isArray(scrapedPin.shopping_flags) ? scrapedPin.shopping_flags : []
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
      metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      updated_at = NOW();
  `;

  // 5. Query Central Hub Active SERP State (keyword_serp_current) including baseline velocity columns
  const targetRows = await hubSql`
    SELECT
      keyword_id, rank_position, is_displaced, save_count, repin_count,
      comment_count, share_count, baseline_day_saves, baseline_day_date,
      daily_save_velocity, crawled_at, last_known_rank
    FROM keyword_serp_current
    WHERE pin_id = ${cleanPinId};
  `;

  // 5B. Displaced / Competitor / Archive Fallback: Query keyword_displaced_index and Shard pins_daily_metrics
  let displacedRows = [];
  try {
    displacedRows = await hubSql`
      SELECT
        keyword_id, last_known_rank, displaced_date, save_count, repin_count,
        comment_count, share_count, daily_save_velocity, domain, updated_at
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
      LIMIT 2;
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

  if (targetRows.length > 0) {
    const r0 = targetRows[0];
    const baseDateIso = toIsoDateStr(r0.baseline_day_date);
    const crawlDateIso = toIsoDateStr(r0.crawled_at);

    if (baseDateIso && baseDateIso < todayUtcStr && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else if (crawlDateIso && crawlDateIso < todayUtcStr && Number.isFinite(Number(r0.save_count))) {
      baselineSaves = Number(r0.save_count);
      baselineDate = r0.crawled_at;
    } else if (priorDayShardRow && Number.isFinite(Number(priorDayShardRow.save_count))) {
      baselineSaves = Number(priorDayShardRow.save_count);
      baselineDate = priorDayShardRow.snapshot_date;
    } else if (r0.baseline_day_date && r0.baseline_day_saves != null && Number(r0.baseline_day_saves) > 0) {
      baselineSaves = Number(r0.baseline_day_saves);
      baselineDate = r0.baseline_day_date;
    } else {
      baselineSaves = Number.isFinite(Number(r0.save_count)) ? Number(r0.save_count) : 0;
      baselineDate = r0.crawled_at ? new Date(r0.crawled_at) : null;
    }
  } else if (priorDayShardRow && Number.isFinite(Number(priorDayShardRow.save_count))) {
    baselineSaves = Number(priorDayShardRow.save_count);
    baselineDate = priorDayShardRow.snapshot_date;
  } else if (displacedRows.length > 0) {
    const d0 = displacedRows[0];
    baselineSaves = Number.isFinite(Number(d0.save_count)) ? Number(d0.save_count) : 0;
    baselineDate = d0.displaced_date || d0.updated_at || null;
  } else if (todayShardRow && Number.isFinite(Number(todayShardRow.save_count))) {
    baselineSaves = Number(todayShardRow.save_count);
    baselineDate = todayShardRow.snapshot_date;
  }

  const computedVelocity = calculateDailyVelocity({
    currentSaves: newSaves,
    baselineSaves,
    currentDate: nowDate,
    baselineDate
  });

  const existingPositiveVelocity = Math.max(
    0,
    ...targetRows.map(r => Number(r.daily_save_velocity) || 0),
    ...displacedRows.map(r => Number(r.daily_save_velocity) || 0),
    Number(todayShardRow?.daily_save_velocity || 0)
  );

  const baselineDateIso = toIsoDateStr(baselineDate);
  const rawDelta = Math.max(0, newSaves - baselineSaves);

  // Intraday Ratchet Protection:
  // If rawDelta === 0 on the same UTC calendar day as baselineDate (or when re-syncing today with no new save delta),
  // preserve the existing positive daily_save_velocity rather than overwriting with 0.
  const syncVelocity = (rawDelta === 0 && existingPositiveVelocity > 0 && (!baselineDateIso || baselineDateIso === todayUtcStr))
    ? existingPositiveVelocity
    : computedVelocity;

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
      daily_save_velocity = CASE
        WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
        ELSE pins_daily_metrics.daily_save_velocity
      END,
      updated_at = NOW();
  `;

  // 8. Shard: Upsert SERP positions (pin_serp_positions) for each associated active or displaced keyword
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

  if (combinedKeywordRows.length > 0) {
    for (const row of combinedKeywordRows) {
      const shardKid = Number(row.keyword_id);
      if (shardKid != null) {
        if (shardKid > 0) {
          const isDisp = Boolean(row.is_displaced);
          const effLastRank = row.rank_position || row.last_known_rank || 100;
          const effCatalogRank = isDisp ? (Number(effLastRank) + 250) : Number(row.rank_position || 1);
          await shardSql`
            INSERT INTO pin_serp_positions (
              pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
            ) VALUES (
              ${cleanPinId}, (NOW() AT TIME ZONE 'UTC')::date, ${shardKid},
              ${isDisp ? null : row.rank_position},
              ${isDisp}, ${effLastRank},
              ${effCatalogRank}, NOW()
            )
            ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
              rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
              is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
              last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
              catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
              updated_at = NOW();
          `;
        }
      }
    }
  }

  // 9. Hub: Update active SERP state in keyword_serp_current
  if (targetRows.length > 0) {
    await hubSql`
      UPDATE keyword_serp_current
      SET
        title = COALESCE(NULLIF(${scrapedPin.title || ''}, ''), title),
        domain = COALESCE(NULLIF(${scrapedPin.domain || ''}, ''), domain),
        destination_url = COALESCE(NULLIF(${scrapedPin.link || scrapedPin.destination_url || ''}, ''), destination_url),
        image_url = COALESCE(NULLIF(${scrapedPin.image_url || ''}, ''), image_url),
        creation_method = COALESCE(NULLIF(${isCarousel ? 'carousel' : (scrapedPin.creation_method || scrapedPin.method || '')}, ''), creation_method),
        save_count = GREATEST(save_count, ${newSaves}),
        repin_count = GREATEST(repin_count, ${newRepins}),
        comment_count = GREATEST(comment_count, ${newComments}),
        share_count = GREATEST(share_count, ${newShares}),
        daily_save_velocity = CASE
          WHEN ${syncVelocity} IS NOT NULL AND (${syncVelocity} > 0 OR COALESCE((crawled_at AT TIME ZONE 'UTC')::date, baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN ${syncVelocity}
          ELSE daily_save_velocity
        END,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(rawMetaToStore)}::jsonb,
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
        daily_save_velocity = CASE
          WHEN ${syncVelocity} IS NOT NULL THEN ${syncVelocity}
          ELSE daily_save_velocity
        END,
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
      velocity = CASE
        WHEN ${syncVelocity} > 0 THEN ${syncVelocity}
        ELSE velocity
      END,
      reactions = COALESCE(reactions, '{}'::jsonb) || ${JSON.stringify(scrapedPin.reactions || {})}::jsonb,
      last_updated_at = NOW()
    WHERE pin_id = ${cleanPinId};
  `;

  // 12. Synchronous Cache Invalidation Protocol (Anti-Stale & Anti-Race Guard)
  // [INVARIANT: EDGE-EVICTION-TANDEM]
  // Step A: Evict Cloudflare D1 immediately to ensure subsequent reads fetch fresh data
  if (env?.PIN_D1_DB) {
    await env.PIN_D1_DB.prepare('DELETE FROM edge_pins_metadata WHERE pin_id = ?').bind(cleanPinId).run();
  }

  // Step B: Evict all Cloudflare KV key variants in tandem (active + displaced keyword scopes + all trajectory ranges)
  if (env?.PIN_ENGINE_KV) {
    const associatedKids = [
      ...new Set([
        ...targetRows.map(r => Number(r.keyword_id)),
        ...displacedRows.map(r => Number(r.keyword_id))
      ].filter(kid => Number.isFinite(kid) && kid > 0))
    ];
    const serpKeys = associatedKids.map(kid => `serp:comp:${kid}`);
    const evictions = [
      `dossier:pin:${cleanPinId}`,
      `dossier:pin:${cleanPinId}:0`,
      `pin:dossier:${cleanPinId}`,
      `pin:dossier?pin_id=${cleanPinId}`,
      `traj:pin:${cleanPinId}`,
      `traj:pin:${cleanPinId}:0`,
      `traj:pin:${cleanPinId}:all`,
      `traj:pin:${cleanPinId}:7d`,
      `traj:pin:${cleanPinId}:14d`,
      `traj:pin:${cleanPinId}:30d`,
      `pin:trajectory?pin_id=${cleanPinId}`,
      ...associatedKids.map(kid => `dossier:pin:${cleanPinId}:${kid}`),
      ...associatedKids.map(kid => `traj:pin:${cleanPinId}:${kid}`),
      ...serpKeys
    ].map(k => env.PIN_ENGINE_KV.delete(k));
    await Promise.all(evictions);
  }

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
