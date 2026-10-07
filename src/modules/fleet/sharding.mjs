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

