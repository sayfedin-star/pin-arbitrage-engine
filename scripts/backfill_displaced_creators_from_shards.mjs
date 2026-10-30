#!/usr/bin/env node

/**
 * scripts/backfill_displaced_creators_from_shards.mjs
 *
 * Dedicated, idempotent backfill script for un-attributed displaced pins in Central Hub
 * keyword_displaced_index by querying the 99 Storage Shards (universal_master_pins).
 *
 * // [INVARIANT: DISPLACED-VAULT-CREATOR-ATTRIBUTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ANTI-DUPLICATE-UPSERT-MAP]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPinShardId,
  resolveShardConnection,
  enforceNeonPoolerUrl
} from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env in Node runtime
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (_) {}
}

if (!process.env.DATABASE_URL) {
  console.error('[-] Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const hubSql = neon(enforceNeonPoolerUrl(process.env.DATABASE_URL));

export async function runDisplacedCreatorsShardBackfill() {
  console.log('================================================================================');
  console.log('🏛️  BACKFILL DISPLACED CREATORS FROM STORAGE SHARDS');
  console.log('================================================================================\n');

  // Phase 1: Query Central Hub for displaced pins with missing creator_username
  console.log('[*] Phase 1: Querying un-attributed displaced pins on Central Hub...');
  const missingPins = await hubSql`
    SELECT DISTINCT pin_id
    FROM keyword_displaced_index
    WHERE creator_username IS NULL OR creator_username = '';
  `;

  console.log(`[+] Found ${missingPins.length} un-attributed displaced pins in keyword_displaced_index.`);
  if (missingPins.length === 0) {
    console.log('[+] 100% of displaced pins already attributed. Nothing to backfill.');
    return { totalMissing: 0, totalAttributed: 0 };
  }

  // Phase 2: Partition pin IDs across 99 shards
  console.log('\n[*] Phase 2: Partitioning pins across shards using IEEE 802.3 CRC32...');
  const shardMap = new Map();
  for (const row of missingPins) {
    const pinId = String(row.pin_id);
    const shardId = getPinShardId(pinId, 99);
    if (!shardMap.has(shardId)) shardMap.set(shardId, []);
    shardMap.get(shardId).push(pinId);
  }
  console.log(`[+] Mapped ${missingPins.length} pins across ${shardMap.size} active shards.`);

  // Phase 3: Query universal_master_pins on each shard
  console.log('\n[*] Phase 3: Querying universal_master_pins on storage shards...');
  const attributedMap = new Map();
  let shardsProcessed = 0;

  for (const [shardId, pinIds] of shardMap.entries()) {
    shardsProcessed++;
    try {
      const shardSql = await resolveShardConnection({ hubSql, shardId });
      const shardPins = await shardSql`
        SELECT pin_id, creator_username
        FROM universal_master_pins
        WHERE pin_id = ANY(${pinIds})
          AND creator_username IS NOT NULL AND creator_username <> '';
      `;

      for (const row of shardPins) {
        const cleanCreator = String(row.creator_username || '').trim().toLowerCase();
        if (cleanCreator) {
          attributedMap.set(String(row.pin_id), cleanCreator);
        }
      }

      if (shardsProcessed % 10 === 0 || shardsProcessed === shardMap.size) {
        console.log(`  -> Checked ${shardsProcessed}/${shardMap.size} shards (Found ${attributedMap.size} creator attributions so far)...`);
      }
    } catch (err) {
      console.warn(`  [-] Warning querying Shard #${shardId}: ${err.message}. Skipping for ${pinIds.length} pins.`);
    }
  }

  console.log(`[+] Extracted creator usernames for ${attributedMap.size}/${missingPins.length} pins from shards.`);
  if (attributedMap.size === 0) {
    console.log('[-] No additional creator usernames resolved from shards.');
    return { totalMissing: missingPins.length, totalAttributed: 0 };
  }

  // Phase 4: Batch update Central Hub keyword_displaced_index
  console.log('\n[*] Phase 4: Batch updating Central Hub keyword_displaced_index...');
  const entries = Array.from(attributedMap.entries()).map(([pin_id, creator_username]) => ({
    pin_id,
    creator_username
  }));

  const BATCH_SIZE = 250;
  let updatedCount = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const payloadJson = JSON.stringify(chunk);

    await hubSql`
      UPDATE keyword_displaced_index kdi
      SET
        creator_username = LOWER(TRIM(u.creator_username)),
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        creator_username text
      )
      WHERE kdi.pin_id = u.pin_id
        AND (kdi.creator_username IS NULL OR kdi.creator_username = '');
    `;

    updatedCount += chunk.length;
    if (updatedCount % 1000 === 0 || updatedCount === entries.length) {
      console.log(`  -> Updated ${updatedCount}/${entries.length} pins on Central Hub...`);
    }
  }

  console.log(`\n✅ Shard backfill complete. Successfully attributed ${updatedCount} pins on Central Hub.`);
  return { totalMissing: missingPins.length, totalAttributed: updatedCount };
}

// Execute standalone if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfill_displaced_creators_from_shards.mjs');

if (isMainModule) {
  runDisplacedCreatorsShardBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Fatal backfill error:', err);
      process.exit(1);
    });
}
