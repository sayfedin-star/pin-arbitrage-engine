#!/usr/bin/env node

/**
 * scripts/compact_existing_competitor_pins.mjs
 *
 * Skeletal Compaction for competitor_pins on Central Neon Hub.
 * Offloads rich creative data to 99 Storage Shards via writeBatchToDeterministicShards,
 * verifies zero-loss confirmation, compacts description/alt_text/metadata to NULL/'{}',
 * and executes interleaved VACUUM every 10,000 rows.
 *
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { writeBatchToDeterministicShards } from '../src/modules/sharding/fleet-router.mjs';

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

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

const BATCH_SIZE = 2500;
const VACUUM_INTERVAL = 10000;

async function runSkeletalCompaction() {
  console.log('================================================================================');
  console.log('🧹 PAE SKELETAL COMPACTION RUNNER (competitor_pins)');
  console.log('================================================================================');

  let lastId = 0;
  let batchNum = 0;
  let totalProcessed = 0;
  let totalCompacted = 0;
  let rowsSinceLastVacuum = 0;

  // Initial assessment
  const [initialCount] = await hubSql`
    SELECT COUNT(*)::int AS count
    FROM competitor_pins
    WHERE (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb));
  `;
  const initialUncompacted = Number(initialCount?.count || 0);
  console.log(`[*] Initial uncompacted rows in competitor_pins: ${initialUncompacted}`);

  if (initialUncompacted === 0) {
    console.log('  ✓ [COMPLETE] No uncompacted competitor_pins found. Table is already fully skeletal.');
    return { initialUncompacted: 0, totalCompacted: 0 };
  }

  while (true) {
    batchNum++;
    console.log(`\n[*] [Batch #${batchNum}] Fetching up to ${BATCH_SIZE} rows with id > ${lastId}...`);

    const rows = await hubSql`
      SELECT cpins.id, cpins.competitor_id, cpins.pin_id, cpins.title, cpins.description, cpins.link_domain,
             cpins.destination_url, cpins.board_name, cpins.image_url,
             cpins.save_count, cpins.repin_count, cpins.comment_count, cpins.created_at_pinterest,
             cpins.metadata, cpins.alt_text, cp.username AS creator_username
      FROM competitor_pins cpins
      LEFT JOIN competitor_profiles cp ON cp.id = cpins.competitor_id
      WHERE cpins.id > ${lastId}
        AND (cpins.description IS NOT NULL OR cpins.alt_text IS NOT NULL OR (cpins.metadata IS NOT NULL AND cpins.metadata != '{}'::jsonb))
      ORDER BY cpins.id ASC
      LIMIT ${BATCH_SIZE};
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('  ✓ No more uncompacted rows found past lastId.');
      break;
    }

    lastId = rows[rows.length - 1].id;
    totalProcessed += rows.length;
    console.log(`  Fetched ${rows.length} rows (new cursor lastId: ${lastId}, total scanned: ${totalProcessed})`);

    // 1. Offload batch to deterministic storage shards
    console.log(`  Offloading ${rows.length} pins to deterministic shards (concurrency: 4)...`);
    const confirmedPinIds = await writeBatchToDeterministicShards({
      hubSql,
      pins: rows,
      options: { concurrency: 4 }
    });

    const confirmedCount = confirmedPinIds instanceof Set ? confirmedPinIds.size : (confirmedPinIds?.confirmedPinIds?.size || 0);
    console.log(`  Shard write confirmed: ${confirmedCount}/${rows.length} pins successfully persisted on shards.`);

    // Zero-Loss Invariant Guard: Abort batch if zero pins were confirmed
    if (confirmedCount === 0) {
      console.error(`[-] FATAL: Zero pins confirmed by storage shards in batch #${batchNum}. Aborting to prevent data loss!`);
      process.exit(1);
    }

    // 2. Compact ONLY confirmed pins on Central Hub
    const confirmedArray = Array.from(confirmedPinIds);
    await hubSql`
      UPDATE competitor_pins
      SET description = NULL,
          alt_text = NULL,
          metadata = '{}'::jsonb,
          enrichment_status = 'compacted',
          updated_at = NOW()
      WHERE pin_id = ANY(${confirmedArray});
    `;

    totalCompacted += confirmedArray.length;
    rowsSinceLastVacuum += confirmedArray.length;
    console.log(`  ✓ Compacted ${confirmedArray.length} rows in competitor_pins (cumulative compacted: ${totalCompacted})`);

    // 3. Interleaved VACUUM every 10,000 rows
    if (rowsSinceLastVacuum >= VACUUM_INTERVAL) {
      console.log(`\n  [*] [VACUUM] Executing standalone VACUUM competitor_pins (${rowsSinceLastVacuum} rows since last vacuum)...`);
      const vStart = Date.now();
      await hubSql('VACUUM competitor_pins;');
      console.log(`  ✓ [VACUUM] Completed in ${Date.now() - vStart}ms.`);
      rowsSinceLastVacuum = 0;
    }
  }

  // Final VACUUM if any rows were compacted
  if (totalCompacted > 0 && rowsSinceLastVacuum > 0) {
    console.log(`\n[*] [FINAL VACUUM] Executing final standalone VACUUM competitor_pins...`);
    const vStart = Date.now();
    await hubSql('VACUUM competitor_pins;');
    console.log(`  ✓ [FINAL VACUUM] Completed in ${Date.now() - vStart}ms.`);
  }

  // Verification
  console.log('\n[*] Verifying remaining uncompacted rows in competitor_pins...');
  const [finalCount] = await hubSql`
    SELECT COUNT(*)::int AS count
    FROM competitor_pins
    WHERE (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb));
  `;
  const remainingUncompacted = Number(finalCount?.count || 0);
  console.log(`  - Remaining uncompacted rows: ${remainingUncompacted}`);

  console.log('================================================================================');
  console.log(`🏁 SKELETAL COMPACTION COMPLETED: ${totalCompacted} rows compacted, ${remainingUncompacted} remaining.`);
  console.log('================================================================================');

  return { initialUncompacted, totalCompacted, remainingUncompacted };
}

runSkeletalCompaction().catch(err => {
  console.error('[-] Fatal error during skeletal compaction:', err);
  process.exit(1);
});
