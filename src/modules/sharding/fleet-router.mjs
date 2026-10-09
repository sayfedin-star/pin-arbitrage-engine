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

// In-Memory Connection and Registry Caches
const registryCache = new Map(); // shardId -> { database_url, status, project_name }
let registryLastFetched = 0;
const REGISTRY_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('.neon.tech') && !parsed.hostname.includes('-pooler')) {
      const parts = parsed.hostname.split('.');
      if (parts[0].startsWith('ep-')) {
        parts[0] += '-pooler';
      } else {
        parts[0] += '-pooler';
      }
      parsed.hostname = parts.join('.');
      return parsed.toString();
    }
    return url;
  } catch (_) {
    // Fallback regex replacement for non-standard connection strings
    if (url.includes('.neon.tech') && !url.includes('-pooler')) {
      return url.replace(/(@ep-[a-z0-9_-]+)(\.[a-z0-9_.-]*neon\.tech)/i, '$1-pooler$2');
    }
    return url;
  }
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
 * @returns {Promise<Function>} Neon SQL client instance
 */
export async function resolveShardConnection({ hubSql, shardId, dsnTemplate = null, prefix = 'pin-arbitrage-shard' }) {
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

  // 2. Hub Registry Resolution with In-Memory Caching
  const now = Date.now();
  if (registryCache.has(cleanId) && (now - registryLastFetched < REGISTRY_TTL_MS)) {
    const cachedEntry = registryCache.get(cleanId);
    if (cachedEntry?.database_url) {
      const pooledDsn = enforceNeonPoolerUrl(cachedEntry.database_url);
      if (!shardSqlClients.has(pooledDsn)) {
        shardSqlClients.set(pooledDsn, neon(pooledDsn));
      }
      return shardSqlClients.get(pooledDsn);
    }
  }

  // Refresh registry from Hub
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

  registryCache.set(cleanId, row);
  registryLastFetched = now;

  const pooledDsn = enforceNeonPoolerUrl(row.database_url);
  if (!shardSqlClients.has(pooledDsn)) {
    shardSqlClients.set(pooledDsn, neon(pooledDsn));
  }
  return shardSqlClients.get(pooledDsn);
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
  timeoutMs = 2500
}) {
  const cb = circuitBreakers.get(shardId) || { state: 'CLOSED', failures: 0, nextAttempt: 0 };
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

    const result = await Promise.race([
      queryFn(shardSql),
      timeoutPromise
    ]);

    // Query succeeded: Reset breaker
    clearTimeout(timeoutTimer);
    cb.state = 'CLOSED';
    cb.failures = 0;
    circuitBreakers.set(shardId, cb);
    return result;
  } catch (err) {
    clearTimeout(timeoutTimer);
    cb.failures++;
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
      try {
        const client = await resolveShardConnection({ hubSql, shardId: sid });
        await Promise.race([
          client`SELECT 1 as alive;`,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Pre-warm timeout')), timeoutMs))
        ]);
        warmed++;
        details[sid] = 'warm';
      } catch (err) {
        failed++;
        details[sid] = `failed: ${err.message}`;
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
export async function fetchUniversalPinDossier({ hubSql, pinId }) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) throw new Error('Pin ID is required');

  const shardId = getPinShardId(cleanPinId, 99);
  let shardSql;
  try {
    shardSql = await resolveShardConnection({ hubSql, shardId });
  } catch (_) {
    shardSql = hubSql; // Graceful degradation to Hub
  }

  // 1 & 2. Fetch Master Creative Record and Historical Snapshots concurrently from target shard
  const [initialMaster, initialSnapshots] = await Promise.all([
    executeShardQueryWithCircuitBreaker({
      shardId,
      shardSql,
      queryFn: async (sqlClient) => {
        const [row] = await sqlClient`
          SELECT *
          FROM universal_master_pins
          WHERE pin_id = ${cleanPinId}
          LIMIT 1;
        `;
        return row || null;
      },
      fallbackFn: async () => null,
      timeoutMs: 2500
    }),
    executeShardQueryWithCircuitBreaker({
      shardId,
      shardSql,
      queryFn: async (sqlClient) => {
        const rows = await sqlClient`
          SELECT 
            id, snapshot_date, rank_position, save_count, repin_count,
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
      timeoutMs: 2000
    })
  ]);

  let masterRecord = initialMaster;
  let snapshots = initialSnapshots;

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

  // 2. Fetch all SERP occurrences for this pin across all keywords from Central Hub
  const hubSerpRows = await hubSql`
    SELECT 
      pin_id, title, domain, destination_url, image_url,
      creator_username, board_name, save_count, repin_count,
      daily_save_velocity, dominant_color, visual_annotations
    FROM keyword_serp_current
    WHERE pin_id = ${cleanPinId}
    ORDER BY save_count DESC;
  `.catch(() => []);

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

  // Historical snapshot recovery for alt_text, description, or further annotations
  let hubHistoricalSnap = null;
  if (!masterRecord || !masterRecord.alt_text || unionSet.size === 0) {
    const snapRows = await hubSql`
      SELECT 
        pin_id, title, domain, destination_url, image_url,
        save_count, repin_count, daily_save_velocity, metadata
      FROM keyword_pins_snapshots
      WHERE pin_id = ${cleanPinId}
      ORDER BY save_count DESC, created_at DESC
      LIMIT 10;
    `.catch(() => []);
    if (snapRows && snapRows.length > 0) {
      hubHistoricalSnap = snapRows[0];
      for (const sRow of snapRows) {
        for (const tag of normalizeVisualAnnotations(sRow.metadata?.visual_annotations)) {
          if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
        }
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
        creator_username: topRow.creator_username || '',
        board_name: topRow.board_name || '',
        save_count: topRow.save_count,
        repin_count: topRow.repin_count,
        daily_save_velocity: topRow.daily_save_velocity,
        dominant_color: topRow.dominant_color || '#888888',
        alt_text: hubHistoricalSnap?.metadata?.alt_text || '',
        description: hubHistoricalSnap?.metadata?.description || '',
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
    if (!masterRecord.alt_text && hubHistoricalSnap?.metadata?.alt_text) {
      masterRecord.alt_text = hubHistoricalSnap.metadata.alt_text;
    }
    if (!masterRecord.description && hubHistoricalSnap?.metadata?.description) {
      masterRecord.description = hubHistoricalSnap.metadata.description;
    }
  }

  const finalVisualAnnotations = Array.from(unionSet);

  // Auto-Backfill or Update target shard with complete metadata & Set Union annotations
  if (shardSql && shardSql !== hubSql && masterRecord) {
    (async () => {
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
              WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations 
              ELSE universal_master_pins.visual_annotations 
            END,
            updated_at = NOW();
        `;
      } catch (backfillErr) {
        console.warn(`[Auto-Backfill] Shard ${shardId} pin ${cleanPinId} backfill deferred:`, backfillErr.message);
      }
    })();
  }

  // Hub Fallback: If shard has no snapshots recorded yet, query Hub's keyword_pins_snapshots
  if (!snapshots || snapshots.length === 0) {
    const hubSnapshots = await hubSql`
      SELECT 
        id, snapshot_date, rank_position, save_count, repin_count,
        comment_count, 0 as share_count, 0 as reaction_count, daily_save_velocity,
        keyword_id, NULL as competitor_id, created_at
      FROM keyword_pins_snapshots
      WHERE pin_id = ${cleanPinId}
      ORDER BY snapshot_date DESC, created_at DESC
      LIMIT 90;
    `.catch(() => []);
    if (hubSnapshots && hubSnapshots.length > 0) {
      snapshots = hubSnapshots;
    }
  }

  // Resolve Keyword Names for all snapshot keyword_ids to eliminate multi-SERP ambiguity
  const rawSnapshots = snapshots || [];
  const kwIds = [...new Set(rawSnapshots.map(s => s.keyword_id).filter(id => id != null && !isNaN(Number(id))))];
  const kwMap = new Map();
  if (kwIds.length > 0) {
    try {
      const kwRows = await hubSql`
        SELECT id, keyword
        FROM tracked_keywords
        WHERE id = ANY(${kwIds});
      `.catch(() => []);
      for (const r of kwRows) {
        if (r && r.id != null) {
          kwMap.set(Number(r.id), r.keyword);
        }
      }
    } catch (_) {}
  }

  const enrichedSnapshots = rawSnapshots.map(s => {
    const sDate = s.snapshot_date instanceof Date
      ? s.snapshot_date.toISOString().slice(0, 10)
      : String(s.snapshot_date || '').slice(0, 10);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    return {
      ...s,
      snapshot_date: sDate,
      keyword_name: kid ? (kwMap.get(kid) || `Keyword #${kid}`) : null
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
    if (s.rank_position && s.rank_position > 0) {
      day.best_rank = Math.min(day.best_rank, s.rank_position);
    }
    if (s.keyword_name) {
      day.ranking_keywords.push({
        keyword_id: s.keyword_id,
        keyword: s.keyword_name,
        rank: s.rank_position,
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

  // 3. Query Central Hub for Relational Cross-Pillar Context
  const [hubContext] = await hubSql`
    WITH kw_context AS (
      SELECT 
        json_agg(json_build_object(
          'keyword_id', tk.id,
          'keyword', tk.keyword,
          'rank', sc.rank_position,
          'velocity', sc.daily_save_velocity
        )) as ranking_keywords
      FROM keyword_serp_current sc
      JOIN tracked_keywords tk ON tk.id = sc.keyword_id
      WHERE sc.pin_id = ${cleanPinId}
    ),
    comp_context AS (
      SELECT 
        cp.id as competitor_id,
        cp.username as competitor_username,
        cp.display_name,
        cp.is_active as competitor_active
      FROM competitor_profiles cp
      WHERE LOWER(cp.username) = LOWER(${masterRecord?.creator_username || ''})
      LIMIT 1
    )
    SELECT 
      COALESCE((SELECT ranking_keywords FROM kw_context), '[]'::json) as ranking_keywords,
      (SELECT to_json(comp_context.*) FROM comp_context) as competitor_info;
  `.catch(() => [{ ranking_keywords: [], competitor_info: null }]);

  if (!masterRecord && snapshots.length === 0 && (!hubContext?.ranking_keywords || hubContext.ranking_keywords.length === 0)) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: `Pin ${cleanPinId} not found in any intelligence pillar.`
    };
  }

  const creatorUsername = masterRecord?.creator_username || '';
  const boardName = masterRecord?.board_name || '';
  const boardSlug = masterRecord?.board_slug || boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

  return {
    success: true,
    pin_id: cleanPinId,
    shard_id: shardId,
    creative: {
      title: masterRecord?.title || `Pin ${cleanPinId}`,
      description: masterRecord?.description || '',
      alt_text: masterRecord?.alt_text || '',
      destination_url: masterRecord?.destination_url || '',
      domain: masterRecord?.domain || 'pinterest.com',
      image_url: masterRecord?.image_url || '',
      dominant_color: masterRecord?.dominant_color || '#888888',
      visual_annotations: finalVisualAnnotations,
      created_at_pinterest: masterRecord?.created_at_pinterest || null,
      first_discovered_pillar: masterRecord?.first_discovered_pillar || 'keyword'
    },
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
    pillar_4_board_ideas_context: {
      inferred_board_slug: boardSlug,
      board_radar_url: `/board-ideas?board_slug=${encodeURIComponent(boardSlug)}`
    },
    daily_trajectory: dailyTrajectory,
    snapshots: enrichedSnapshots
  };
}

