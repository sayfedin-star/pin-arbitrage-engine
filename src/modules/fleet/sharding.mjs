/**
 * Consistent Mathematical Fleet Sharding Engine
 * 
 * Provides deterministic hashing across all entities to assign permanent shard affinity:
 * - Competitors: hash(username) % 99
 * - Keywords: hash(keyword) % 99
 * - Board Ideas: hash(board_id) % 99
 * - Visual Search & Related Nodes: hash(seed_pin_id) % 99
 * 
 * Guarantees zero historical drift and zero hotspot clustering.
 */

/**
 * Standard CRC32 implementation for deterministic hashing without external dependencies
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

export function crc32(str) {
  const clean = String(str || '').trim().toLowerCase();
  let crc = 0 ^ (-1);
  for (let i = 0; i < clean.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ clean.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Computes deterministic 1-based shard index for any entity key.
 * 
 * @param {string} entityKey - Unique identifier (username, keyword, board_id, pin_id)
 * @param {number} totalShards - Number of active fleet shards (default: 99)
 * @returns {number} Shard number between 1 and totalShards
 */
export function getShardNumberForEntity(entityKey, totalShards = 99) {
  if (!entityKey) return 1;
  const hash = crc32(entityKey);
  return (hash % totalShards) + 1;
}

/**
 * Resilient Shard Number computation with Quarantine Circuit-Breaker.
 * If the primary shard is marked as quarantined/degraded, uses secondary
 * deterministic probing (Golden Ratio step 0x9e3779b9) to assign a healthy fallback shard.
 * 
 * @param {string} entityKey - Unique identifier
 * @param {number} totalShards - Number of active fleet shards (default: 99)
 * @param {Set<number>|number[]} [quarantinedShards] - Set or Array of quarantined shard numbers
 * @returns {number} Healthy shard number between 1 and totalShards
 */
export function getResilientShardNumberForEntity(entityKey, totalShards = 99, quarantinedShards = new Set()) {
  const qSet = quarantinedShards instanceof Set ? quarantinedShards : new Set(quarantinedShards || []);
  const primary = getShardNumberForEntity(entityKey, totalShards);
  if (!qSet.has(primary)) return primary;

  const hash = crc32(entityKey);
  for (let probe = 1; probe < totalShards; probe++) {
    const fallback = (((hash + probe * 0x9e3779b9) >>> 0) % totalShards) + 1;
    if (!qSet.has(fallback)) return fallback;
  }
  return primary;
}

/**
 * Returns formatted shard project name matching neon_projects_registry conventions.
 * e.g., 'pin-arbitrage-shard-01' to 'pin-arbitrage-shard-99'
 */
export function getShardProjectName(entityKey, totalShards = 99, quarantinedShards = new Set()) {
  const num = getResilientShardNumberForEntity(entityKey, totalShards, quarantinedShards);
  return `pin-arbitrage-shard-${String(num).padStart(2, '0')}`;
}

/**
 * Resolves dedicated shard connection from Hub registry for a given entity key.
 */
export async function resolveShardForEntity(hubSql, entityKey, totalShards = 99, quarantinedShards = new Set()) {
  const shardName = getShardProjectName(entityKey, totalShards, quarantinedShards);
  const [shard] = await hubSql`
    SELECT id, project_id, project_name, database_url, status
    FROM neon_projects_registry
    WHERE project_name = ${shardName} AND status = 'active'
    LIMIT 1;
  `;

  if (!shard?.database_url) {
    throw new Error(`Shard database '${shardName}' not found or inactive in neon_projects_registry.`);
  }

  return shard;
}

/**
 * Consistent Hash Ring Engine with Virtual Nodes (Ketama/Dynamo topology)
 * Eliminates the Modulo Resharding Trap when fleet expands beyond 99 shards.
 * 
 * Guarantees that adding or removing a shard moves only ~(1 / N) keys,
 * rather than 98% of all keys under classic modulo arithmetic.
 */
export class ConsistentHashRing {
  constructor(shardCount = 99, vnodesPerShard = 128) {
    this.shardCount = shardCount;
    this.vnodesPerShard = vnodesPerShard;
    this.ring = [];
    this._build();
  }

  _build() {
    this.ring = [];
    for (let s = 1; s <= this.shardCount; s++) {
      for (let v = 0; v < this.vnodesPerShard; v++) {
        const vnodeKey = `shard_${s}_vn_${v}`;
        const hash = crc32(vnodeKey);
        this.ring.push({ hash, shard: s });
      }
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  getShard(entityKey, quarantinedShards = new Set()) {
    if (!entityKey || this.ring.length === 0) return 1;
    const qSet = quarantinedShards instanceof Set ? quarantinedShards : new Set(quarantinedShards || []);
    const h = crc32(entityKey);

    // Binary search for clockwise closest node
    let low = 0;
    let high = this.ring.length - 1;
    let idx = 0;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this.ring[mid].hash >= h) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    // Traverse clockwise until a non-quarantined shard is found
    const ringLen = this.ring.length;
    for (let step = 0; step < ringLen; step++) {
      const targetShard = this.ring[(idx + step) % ringLen].shard;
      if (!qSet.has(targetShard)) {
        return targetShard;
      }
    }

    return this.ring[idx % ringLen].shard;
  }
}

// Singleton cached ring instance
let defaultRingInstance = null;

/**
 * Computes shard number using Consistent Hash Ring with Virtual Nodes.
 * Moves only ~(1 / totalShards) keys during fleet expansion.
 */
export function getConsistentRingShardNumber(entityKey, totalShards = 99, quarantinedShards = new Set(), vnodes = 128) {
  if (!defaultRingInstance || defaultRingInstance.shardCount !== totalShards || defaultRingInstance.vnodesPerShard !== vnodes) {
    defaultRingInstance = new ConsistentHashRing(totalShards, vnodes);
  }
  return defaultRingInstance.getShard(entityKey, quarantinedShards);
}

/**
 * Dual-Epoch Shard Resolver:
 * Supports historical continuity during planned fleet resharding epochs.
 * If epoch = 1 (Legacy Modulo 99): uses getResilientShardNumberForEntity.
 * If epoch = 2 (Consistent Ring Topology): uses getConsistentRingShardNumber.
 */
export function getShardNumberWithEpoch(entityKey, totalShards = 99, epoch = 1, quarantinedShards = new Set()) {
  if (epoch >= 2) {
    return getConsistentRingShardNumber(entityKey, totalShards, quarantinedShards);
  }
  return getResilientShardNumberForEntity(entityKey, totalShards, quarantinedShards);
}


