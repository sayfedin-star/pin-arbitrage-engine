#!/usr/bin/env node

/**
 * scripts/truncate_retired_shards.mjs
 *
 * Safe Storage Release Runner for Pin Arbitrage Engine (PAE)
 * Empties historical tables on retired legacy shards (21..99)
 * releasing ~4.0 GB of storage in Neon Serverless Postgres.
 *
 * // [INVARIANT: SAFE-STORAGE-RELEASE]
 * // [INVARIANT: RETIRED-SHARDS-ONLY-GUARD]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isValidShardDsn,
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

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

export async function releaseRetiredShardsStorage(options = {}) {
  const isDryRun = options.dryRun || process.argv.includes('--dry-run');
  const targetShardFilter = options.shard ? Number(options.shard) : null;

  console.log('='.repeat(80));
  console.log(`   PIN ARBITRAGE ENGINE (PAE) — RETIRED SHARDS STORAGE RELEASE RUNNER ${isDryRun ? '[DRY-RUN]' : '[LIVE]'}`);
  console.log('='.repeat(80));

  const hubUrl = process.env.DATABASE_URL;
  if (!hubUrl || !isValidShardDsn(hubUrl)) {
    console.error('[release] Error: DATABASE_URL is not set or invalid.');
    process.exit(1);
  }

  const hubSql = neon(enforceNeonPoolerUrl(hubUrl));

  // 1. Fetch retired shards from Central Hub registry
  console.log('[release] Querying Central Hub for retired storage shards (21..99)...');
  const retiredRows = await hubSql`
    SELECT id, project_id, project_name, database_url, status, assigned_shards
    FROM neon_projects_registry
    WHERE status = 'retired'
      AND project_name ~ '^pin-arbitrage-shard-(2[1-9]|[3-9][0-9])$'
    ORDER BY project_name ASC;
  `;

  if (retiredRows.length === 0) {
    console.log('[release] No retired shards found matching criteria (21..99). Nothing to release.');
    return { ok: true, releasedCount: 0 };
  }

  console.log(`[release] Found ${retiredRows.length} retired physical shards eligible for storage release.`);

  let processedCount = 0;
  let errorCount = 0;

  for (const row of retiredRows) {
    const match = row.project_name?.match(/shard-(\d+)/i);
    const shardNum = match ? parseInt(match[1], 10) : null;

    if (!shardNum || shardNum < 21 || shardNum > 99) {
      console.warn(`  ⚠️ Skipping ${row.project_name}: Shard number out of range (must be 21..99).`);
      continue;
    }

    if (targetShardFilter && shardNum !== targetShardFilter) {
      continue;
    }

    if (!isValidShardDsn(row.database_url)) {
      console.warn(`  ⚠️ Skipping ${row.project_name}: Invalid DSN.`);
      continue;
    }

    console.log(`\n[release] Processing Retired Shard #${shardNum} (${row.project_name})...`);

    if (isDryRun) {
      console.log(`  [DRY-RUN] Would TRUNCATE tables and VACUUM ANALYZE on Shard #${shardNum}.`);
      processedCount++;
      continue;
    }

    const shardSql = neon(enforceNeonPoolerUrl(row.database_url));

    try {
      // 1. Truncate core time-series tables with CASCADE
      console.log(`  -> Truncating historical tables on Shard #${shardNum}...`);
      await shardSql`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_master_pins') THEN
            TRUNCATE TABLE universal_master_pins CASCADE;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pins_daily_metrics') THEN
            TRUNCATE TABLE pins_daily_metrics CASCADE;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pin_serp_positions') THEN
            TRUNCATE TABLE pin_serp_positions CASCADE;
          END IF;
          -- Also clean any legacy tables if present
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'competitor_pins') THEN
            TRUNCATE TABLE competitor_pins CASCADE;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pa_pins') THEN
            TRUNCATE TABLE pa_pins CASCADE;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pa_pin_metrics') THEN
            TRUNCATE TABLE pa_pin_metrics CASCADE;
          END IF;
        END $$;
      `;

      // 2. Run VACUUM FULL / ANALYZE to reclaim disk space immediately
      console.log(`  -> Running VACUUM ANALYZE to reclaim disk pages on Shard #${shardNum}...`);
      await shardSql`VACUUM ANALYZE;`;

      console.log(`  ✅ Shard #${shardNum} (${row.project_name}) storage successfully released!`);
      processedCount++;
    } catch (err) {
      console.error(`  ❌ Failed to release storage on Shard #${shardNum}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🎉 Storage release complete: ${processedCount} retired shards purged. Errors: ${errorCount}.`);
  console.log('='.repeat(80));

  return { ok: errorCount === 0, processedCount, errorCount };
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  releaseRetiredShardsStorage()
    .then((res) => {
      process.exit(res.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error('[release] Fatal error:', err);
      process.exit(1);
    });
}
