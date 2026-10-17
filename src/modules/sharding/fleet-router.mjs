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

export const shardSqlClients = new Map(); // dsn -> neon client

/**
 * Test helper: Register in-memory SQL client for a DSN
 */
export function _setShardSqlClient(dsn, client) {
  shardSqlClients.set(enforceNeonPoolerUrl(dsn), client);
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
export async function resolveShardConnection({ hubSql, shardId, dsnTemplate = null, prefix = 'pin-arbitrage-shard', env = null }) {
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
    if (!shardSqlClients.has(pooledDsn)) {
      shardSqlClients.set(pooledDsn, neon(pooledDsn));
    }
    return shardSqlClients.get(pooledDsn);
  }

  // 2. Ultra-Fast In-Memory Lookup (0ms execution time from globalShardMap)
  const now = Date.now();
  if (globalShardMap.has(cleanId)) {
    const cachedEntry = globalShardMap.get(cleanId);
    if (cachedEntry?.database_url && (now - (cachedEntry.cachedAt || 0) < SHARD_MAP_TTL_MS)) {
      const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
      if (!shardSqlClients.has(pooledDsn)) {
        shardSqlClients.set(pooledDsn, neon(pooledDsn));
      }
      return shardSqlClients.get(pooledDsn);
    }
  }

  // 3. Lazy Singleflight Warmup from KV / Hub
  if (globalShardMap.size === 0 || (now - globalShardMapLastFetched >= SHARD_MAP_TTL_MS)) {
    await warmGlobalShardMap(hubSql, env);
    if (globalShardMap.has(cleanId)) {
      const cachedEntry = globalShardMap.get(cleanId);
      if (cachedEntry?.database_url) {
        const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
        if (!shardSqlClients.has(pooledDsn)) {
          shardSqlClients.set(pooledDsn, neon(pooledDsn));
        }
        return shardSqlClients.get(pooledDsn);
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
        if (!shardSqlClients.has(pooledDsn)) {
          shardSqlClients.set(pooledDsn, neon(pooledDsn));
        }
        return shardSqlClients.get(pooledDsn);
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
  if (!shardSqlClients.has(pooledDsn)) {
    shardSqlClients.set(pooledDsn, neon(pooledDsn));
  }
  return shardSqlClients.get(pooledDsn);
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
export async function executeShardQueryWithCircuitBreaker({
  shardId,
  shardSql,
  queryFn,
  fallbackFn = null,
  timeoutMs = 2500,
  batchId = null
}) {
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
  let shardSql;
  try {
    shardSql = await resolveShardConnection({ hubSql, shardId, env });
  } catch (_) {
    shardSql = hubSql; // Graceful degradation to Hub
  }

  // Tier 1: Check Cloudflare D1 edge database (3.4ms latency) with 12h TTL freshness guard
  let d1Record = null;
  if (env?.PIN_D1_DB && !bypassEdgeCache) {
    try {
      const row = await env.PIN_D1_DB.prepare(
        `SELECT pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, seo_alt_text, description, metadata, created_at_pinterest, updated_at FROM edge_pins_metadata WHERE pin_id = ? LIMIT 1`
      ).bind(cleanPinId).first();
      if (row) {
        const rowUpdatedAtMs = parseD1DateMs(row.updated_at);
        const isFresh = (Date.now() - rowUpdatedAtMs) < (12 * 60 * 60 * 1000);
        if (isFresh) {
          let parsedAnnotations = [];
          try { parsedAnnotations = typeof row.visual_annotations === 'string' ? JSON.parse(row.visual_annotations) : (row.visual_annotations || []); } catch (_) {}
          let parsedMeta = {};
          try { parsedMeta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}); } catch (_) {}
          d1Record = {
            ...row,
            metadata: parsedMeta,
            visual_annotations: parsedAnnotations,
            alt_text: row.seo_alt_text || ''
          };
        }
      }
    } catch (_) {}
  }

  // 1 & 2. Ultra-Low Latency Parallel Scatter-Gather (t=0 concurrent dispatch)
  // Concurrently fires Shard queries (with 5500ms scale-to-zero safe timeout) and Hub queries.
  let shardErrorReason = null;
  const dossierBatchId = `dossier_batch_${cleanPinId}_${Date.now()}_${Math.random()}`;
  const [
    initialMaster,
    initialSnapshots,
    hubSerpRowsRaw,
    hubSnapshotsRaw
  ] = await Promise.all([
    executeShardQueryWithCircuitBreaker({
      shardId,
      shardSql,
      queryFn: async (sqlClient) => {
        const [row] = await sqlClient`
          SELECT 
            pin_id, creator_username, board_id, board_name, board_slug, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
            first_discovered_pillar, first_discovered_at, updated_at, metadata
          FROM universal_master_pins
          WHERE pin_id = ${cleanPinId}
          LIMIT 1;
        `;
        return row || null;
      },
      fallbackFn: async (info) => {
        shardErrorReason = info?.reason || 'SHARD_UNAVAILABLE';
        return d1Record || null;
      },
      timeoutMs: 5500,
      batchId: dossierBatchId
    }),
    executeShardQueryWithCircuitBreaker({
      shardId,
      shardSql,
      queryFn: async (sqlClient) => {
        // 1. Query Two-Tier view pins_daily_rollups_v2 first
        try {
          const rollups = await sqlClient`
            SELECT 
              pin_id, snapshot_date, save_count, repin_count,
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
                  created_at: r.updated_at
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
                    created_at: r.updated_at
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
            id, snapshot_date, rank_position, is_displaced, save_count, repin_count,
            comment_count, share_count, reaction_count, daily_save_velocity,
            keyword_id, competitor_id, created_at
          FROM pins_daily_snapshots
          WHERE pin_id = ${cleanPinId}
          ORDER BY snapshot_date DESC, created_at DESC
          LIMIT 90;
        `;
        return rows;
      },
      fallbackFn: async () => [],
      timeoutMs: 5500,
      batchId: dossierBatchId
    }),
    hubSql`
      SELECT 
        sc.keyword_id, sc.pin_id, sc.title, sc.domain, sc.destination_url, sc.image_url,
        sc.creator_username, sc.board_name, sc.save_count, sc.repin_count,
        sc.daily_save_velocity, sc.dominant_color, sc.visual_annotations,
        sc.rank_position, sc.last_known_rank, sc.is_displaced, sc.metadata,
        tk.keyword AS keyword_name
      FROM keyword_serp_current sc
      LEFT JOIN tracked_keywords tk ON tk.id = sc.keyword_id
      WHERE sc.pin_id = ${cleanPinId}
      ORDER BY sc.save_count DESC;
    `.catch(() => []),
    hubSql`
      SELECT 
        kps.id, kps.pin_id, kps.title, kps.domain, kps.destination_url, kps.image_url,
        kps.snapshot_date, kps.rank_position, kps.last_known_rank, kps.is_displaced,
        kps.save_count, kps.repin_count, kps.comment_count,
        0 as share_count, 0 as reaction_count, kps.daily_save_velocity,
        kps.keyword_id, NULL as competitor_id,
        kps.created_at_pinterest, kps.creation_method, kps.metadata, kps.created_at,
        tk.keyword AS keyword_name
      FROM keyword_pins_snapshots kps
      LEFT JOIN tracked_keywords tk ON tk.id = kps.keyword_id
      WHERE kps.pin_id = ${cleanPinId}
      ORDER BY kps.snapshot_date DESC, kps.created_at DESC
      LIMIT 90;
    `.catch(() => [])
  ]);

  let masterRecord = initialMaster || d1Record;
  let snapshots = initialSnapshots;
  const hubSerpRows = Array.isArray(hubSerpRowsRaw) ? hubSerpRowsRaw : [];
  const hubSnapshots = Array.isArray(hubSnapshotsRaw) ? hubSnapshotsRaw : [];
  const snapRows = [...hubSnapshots]
    .sort((a, b) => (Boolean(b.metadata) - Boolean(a.metadata)) || (Number(b.save_count || 0) - Number(a.save_count || 0)))
    .slice(0, 10);

  // Helper to safely parse visual annotations
  function normalizeVisualAnnotations(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  // Compute Mathematical Set Union of Visual Annotations across all sources
  const unionSet = new Set();
  for (const tag of normalizeVisualAnnotations(masterRecord?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const row of hubSerpRows) {
    for (const tag of normalizeVisualAnnotations(row.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
  }

  // Historical snapshot recovery for rich algorithmic metadata, alt_text, description, or further annotations
  let hubHistoricalSnap = null;
  if (snapRows && snapRows.length > 0) {
    hubHistoricalSnap = snapRows[0];
    for (const sRow of snapRows) {
      for (const tag of normalizeVisualAnnotations(sRow.metadata?.visual_annotations)) {
        if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
      }
    }
  }

  // Hub Fallback & Synthesis: If masterRecord is missing on Shard N, synthesize from Hub SERP/Snapshots
  if (!masterRecord) {
    if (hubSerpRows.length > 0) {
      const topRow = hubSerpRows[0];
      masterRecord = {
        pin_id: topRow.pin_id,
        title: topRow.title,
        domain: topRow.domain,
        destination_url: topRow.destination_url,
        image_url: topRow.image_url,
        creator_username: topRow.creator_username || topRow.metadata?.pinner?.username || '',
        board_name: topRow.board_name || topRow.metadata?.board_name || '',
        save_count: topRow.save_count,
        repin_count: topRow.repin_count,
        daily_save_velocity: topRow.daily_save_velocity,
        dominant_color: topRow.dominant_color || topRow.metadata?.dominant_color || '#888888',
        alt_text: topRow.metadata?.alt_text || hubHistoricalSnap?.metadata?.alt_text || '',
        description: topRow.metadata?.description || hubHistoricalSnap?.metadata?.description || '',
        visual_annotations: Array.from(unionSet)
      };
    } else if (hubHistoricalSnap) {
      masterRecord = {
        pin_id: hubHistoricalSnap.pin_id,
        title: hubHistoricalSnap.title,
        domain: hubHistoricalSnap.domain,
        destination_url: hubHistoricalSnap.destination_url,
        image_url: hubHistoricalSnap.image_url,
        creator_username: hubHistoricalSnap.metadata?.pinner?.username || '',
        board_name: hubHistoricalSnap.metadata?.board_name || '',
        save_count: hubHistoricalSnap.save_count,
        repin_count: hubHistoricalSnap.repin_count,
        daily_save_velocity: hubHistoricalSnap.daily_save_velocity,
        dominant_color: hubHistoricalSnap.metadata?.dominant_color || '#888888',
        alt_text: hubHistoricalSnap.metadata?.alt_text || '',
        description: hubHistoricalSnap.metadata?.description || '',
        visual_annotations: Array.from(unionSet)
      };
    }
  } else {
    // Shard record exists: enrich missing alt_text or description if recovered from Hub
    if (!masterRecord.alt_text) {
      masterRecord.alt_text = hubSerpRows[0]?.metadata?.alt_text || hubHistoricalSnap?.metadata?.alt_text || '';
    }
    if (!masterRecord.description) {
      masterRecord.description = hubSerpRows[0]?.metadata?.description || hubHistoricalSnap?.metadata?.description || '';
    }
  }

  const finalVisualAnnotations = Array.from(unionSet)
    .map(t => String(t || '').trim())
    .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
    .slice(0, 15);

  // Auto-Backfill or Update target shard with complete metadata & Set Union annotations
  if (shardSql && shardSql !== hubSql && masterRecord) {
    const backfillPromise = (async () => {
      try {
        await shardSql`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations,
            first_discovered_pillar, first_discovered_at, updated_at
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

  function getSnapTimestamp(s) {
    const t = s.created_at || s.updated_at || s.snapshot_date;
    return t ? new Date(t).getTime() : 0;
  }

  // Populate map with Shard snapshots first
  for (const s of shardList) {
    const sDate = s.snapshot_date instanceof Date
      ? s.snapshot_date.toISOString().slice(0, 10)
      : String(s.snapshot_date || '').slice(0, 10);
    if (!sDate) continue;
    const dedupKey = `${sDate}_${s.keyword_id || 'global'}`;
    snapshotMap.set(dedupKey, s);
  }

  // Merge Hub snapshots with LWW and collect missing snapshots for Shard Read-Repair
  const missingFromShard = [];
  for (const h of hubSnapshots) {
    const hDate = h.snapshot_date instanceof Date
      ? h.snapshot_date.toISOString().slice(0, 10)
      : String(h.snapshot_date || '').slice(0, 10);
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
          const sDate = s.snapshot_date instanceof Date
            ? s.snapshot_date.toISOString().slice(0, 10)
            : String(s.snapshot_date || '').slice(0, 10);
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

        txQueries.push(shardSql`
          INSERT INTO pins_daily_snapshots (
            pin_id, keyword_id, snapshot_date, rank_position, is_displaced,
            save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, created_at
          )
          SELECT
            u.pin_id,
            u.keyword_id,
            u.snapshot_date::date,
            u.rank_position,
            u.is_displaced,
            u.save_count,
            u.repin_count,
            u.comment_count,
            u.share_count,
            u.reaction_count,
            u.daily_save_velocity,
            u.created_at::timestamptz
          FROM jsonb_to_recordset(${JSON.stringify(repairPayload)}::jsonb) AS u(
            pin_id text,
            keyword_id int,
            snapshot_date text,
            rank_position int,
            is_displaced boolean,
            save_count bigint,
            repin_count int,
            comment_count int,
            share_count int,
            reaction_count int,
            daily_save_velocity numeric,
            created_at text
          )
          ON CONFLICT (pin_id, keyword_id, snapshot_date) DO NOTHING;
        `);

        // Two-Tier Shard Read-Repair: Hydrate pins_daily_metrics
        const metricsMap = new Map();
        for (const s of repairPayload) {
          const d = s.snapshot_date;
          if (!metricsMap.has(d) || Number(s.save_count) > Number(metricsMap.get(d).save_count)) {
            metricsMap.set(d, s);
          }
        }
        const metricsRows = Array.from(metricsMap.values());
        if (metricsRows.length > 0) {
          txQueries.push(shardSql`
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
                WHEN EXCLUDED.daily_save_velocity > 0 THEN EXCLUDED.daily_save_velocity 
                ELSE pins_daily_metrics.daily_save_velocity 
              END,
              updated_at = NOW();
          `);
        }

        // Two-Tier Shard Read-Repair: Hydrate pin_serp_positions
        const positionRows = repairPayload.filter(s => s.keyword_id != null);
        if (positionRows.length > 0) {
          txQueries.push(shardSql`
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

        if (typeof shardSql.transaction === 'function') {
          await shardSql.transaction(txQueries);
        } else {
          for (const q of txQueries) {
            await q.catch(() => {});
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
    const sDate = s.snapshot_date instanceof Date
      ? s.snapshot_date.toISOString().slice(0, 10)
      : String(s.snapshot_date || '').slice(0, 10);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    const serpMatch = (kid ? serpByKeyword.get(kid) : null) || hubSerpRows[0] || null;
    const isDisplaced = Boolean(
      s.is_displaced ||
      serpMatch?.is_displaced ||
      (!s.rank_position && (s.last_known_rank || serpMatch?.last_known_rank))
    );
    const lastKnownRank = s.last_known_rank || serpMatch?.last_known_rank || (isDisplaced ? (s.rank_position || serpMatch?.rank_position) : null);
    const catalogRank = s.catalog_rank || (isDisplaced ? (100 + (sIdx + 1)) : (s.rank_position || 1));
    return {
      ...s,
      snapshot_date: sDate,
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
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        snapshot_date: dateKey,
        save_count: Number(s.save_count) || 0,
        repin_count: Number(s.repin_count) || 0,
        comment_count: Number(s.comment_count) || 0,
        share_count: Number(s.share_count) || 0,
        reaction_count: Number(s.reaction_count) || 0,
        daily_save_velocity: Number(s.daily_save_velocity) || 0,
        best_rank: (s.rank_position && s.rank_position > 0) ? s.rank_position : 999,
        ranking_keywords: []
      });
    }
    const day = dailyMap.get(dateKey);
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
    const diff = chronoDays[i].save_count - chronoDays[i - 1].save_count;
    if (diff >= 0) {
      chronoDays[i].daily_save_velocity = diff;
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
    ...(masterRecord?.metadata ? [masterRecord.metadata] : []),
    ...(snapRows || []).map(s => s.metadata).filter(Boolean),
    ...(hubSerpRows || []).map(s => s.metadata).filter(Boolean)
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

  // Primary source of algorithmic treasures is the Shard master record metadata
  const snapMeta = { 
    ...(masterRecord?.metadata || {}), 
    ...(hubSerpRows[0]?.metadata || {}), 
    ...(hubHistoricalSnap?.metadata || {}) 
  };

  // Tier 1 Edge Mirror: Write-through fresh shard metadata to Cloudflare D1 asynchronously
  if (env?.PIN_D1_DB && masterRecord) {
    const d1WritePromise = (async () => {
      try {
        const fullMetaObj = { ...snapMeta, ...(masterRecord.metadata || {}) };
        await env.PIN_D1_DB.prepare(`
          INSERT INTO edge_pins_metadata (
            pin_id, title, domain, destination_url, image_url,
            creator_username, board_name, dominant_color, visual_annotations,
            seo_alt_text, description, metadata, created_at_pinterest, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          masterRecord.created_at_pinterest ? new Date(masterRecord.created_at_pinterest).toISOString() : null
        ).run();
      } catch (_) {}
    })();
    if (ctx && typeof ctx.waitUntil === 'function') {
      safeWaitUntil(ctx, d1WritePromise, `d1_sync_${cleanPinId}`);
    }
  }

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
    image_dimensions: snapMeta.image_dimensions || null,
    creation_method: snapMeta.creation_method || snapMeta.method || hubHistoricalSnap?.creation_method || 'pinterest_platform',
    share_count: Number(snapMeta.share_count || 0),
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

  return {
    success: true,
    pin_id: cleanPinId,
    shard_id: shardId,
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
      image_signature: snapMeta.image_signature || '',
      canonical_pin_id: canonicalPinId,
      canonical_pin_url: canonicalPinUrl,
      is_canonical_root: isCanonicalRoot,
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
}

