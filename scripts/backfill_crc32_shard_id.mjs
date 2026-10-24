#!/usr/bin/env node

/**
 * scripts/backfill_crc32_shard_id.mjs
 *
 * Micro-batch backfill script for deterministic CRC32 shard_id on Central Hub.
 * Populates keyword_serp_current and keyword_displaced_index using pae_crc32_shard_id(pin_id, 99).
 *
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

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

const sql = neon(DATABASE_URL);

const BATCH_SIZE = 2500;

async function backfillKeywordSerpCurrent() {
  console.log('[*] Phase 1: Backfilling keyword_serp_current (micro-batches of 2,500)...');
  let totalUpdated = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const updatedRows = await sql`
      UPDATE keyword_serp_current
      SET shard_id = pae_crc32_shard_id(pin_id, 99)
      WHERE id IN (
        SELECT id
        FROM keyword_serp_current
        WHERE shard_id IS NULL AND pin_id IS NOT NULL
        LIMIT ${BATCH_SIZE}
      )
      RETURNING id;
    `;

    const count = Array.isArray(updatedRows) ? updatedRows.length : 0;
    totalUpdated += count;
    console.log(`  [Batch #${batchNum}] Updated ${count} rows in keyword_serp_current (cumulative: ${totalUpdated})`);

    if (count === 0) {
      break;
    }
  }

  console.log(`  ✓ [COMPLETE] Phase 1 finished: ${totalUpdated} total rows backfilled in keyword_serp_current.`);
  return totalUpdated;
}

async function backfillKeywordDisplacedIndex() {
  console.log('[*] Phase 2: Backfilling keyword_displaced_index (micro-batches of 2,500)...');
  let totalUpdated = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const updatedRows = await sql`
      UPDATE keyword_displaced_index kdi
      SET shard_id = pae_crc32_shard_id(kdi.pin_id, 99)
      FROM (
        SELECT keyword_id, pin_id
        FROM keyword_displaced_index
        WHERE shard_id IS NULL AND pin_id IS NOT NULL
        LIMIT ${BATCH_SIZE}
      ) b
      WHERE kdi.keyword_id = b.keyword_id AND kdi.pin_id = b.pin_id
      RETURNING kdi.keyword_id;
    `;

    const count = Array.isArray(updatedRows) ? updatedRows.length : 0;
    totalUpdated += count;
    console.log(`  [Batch #${batchNum}] Updated ${count} rows in keyword_displaced_index (cumulative: ${totalUpdated})`);

    if (count === 0) {
      break;
    }
  }

  console.log(`  ✓ [COMPLETE] Phase 2 finished: ${totalUpdated} total rows backfilled in keyword_displaced_index.`);
  return totalUpdated;
}

async function verifyNullCounts() {
  console.log('[*] Phase 3: Verifying remaining NULL shard_id counts on Central Hub...');
  const [kscNull] = await sql`
    SELECT COUNT(*)::int AS count
    FROM keyword_serp_current
    WHERE shard_id IS NULL AND pin_id IS NOT NULL;
  `;

  const [kdiNull] = await sql`
    SELECT COUNT(*)::int AS count
    FROM keyword_displaced_index
    WHERE shard_id IS NULL AND pin_id IS NOT NULL;
  `;

  const kscCount = Number(kscNull?.count || 0);
  const kdiCount = Number(kdiNull?.count || 0);

  console.log(`  - keyword_serp_current NULL shard_id: ${kscCount}`);
  console.log(`  - keyword_displaced_index NULL shard_id: ${kdiCount}`);

  if (kscCount > 0 || kdiCount > 0) {
    throw new Error(`Incomplete backfill: ${kscCount} rows in keyword_serp_current and ${kdiCount} rows in keyword_displaced_index remain with NULL shard_id.`);
  }

  console.log('  ✓ [VERIFIED] 0 rows with NULL shard_id remaining across both tables.');
}

async function main() {
  console.log('================================================================================');
  console.log('🚀 PAE CRC32 SHARD_ID BACKFILL RUNNER');
  console.log('================================================================================');

  try {
    const kscTotal = await backfillKeywordSerpCurrent();
    const kdiTotal = await backfillKeywordDisplacedIndex();
    await verifyNullCounts();

    console.log('================================================================================');
    console.log(`🏁 BACKFILL COMPLETED SUCCESSFULLY: ${kscTotal + kdiTotal} total rows updated.`);
    console.log('================================================================================');
  } catch (err) {
    console.error('[-] Fatal error during backfill:', err.message);
    process.exit(1);
  }
}

main();
