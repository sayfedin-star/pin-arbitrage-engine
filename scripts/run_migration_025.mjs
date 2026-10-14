#!/usr/bin/env node

/**
 * scripts/run_migration_025.mjs
 * Migration 025: Drop Staged Repurposing Queue (pa_staged_pins) across Hub and All Fleet Shards
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
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
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const hubSql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 025: Drop Staged Repurposing (pa_staged_pins)');
  console.log('[*] ==============================================================');

  // Compute SHA-256 Checksum of 025 migration file
  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/025_drop_staged_repurposing.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 025 SQL SHA-256: ${checksum}`);

  // 1. Drop from Central Hub
  console.log('\n[1/4] Dropping pa_staged_pins on Neon Central Hub...');
  await hubSql`DROP INDEX IF EXISTS idx_pa_staged_pins_status;`;
  await hubSql`DROP TABLE IF EXISTS pa_staged_pins CASCADE;`;
  console.log('[+] Central Hub: Dropped pa_staged_pins table and idx_pa_staged_pins_status.');

  // 2. Register in schema_migrations on Hub
  console.log('\n[2/4] Registering Migration 025 in schema_migrations...');
  await hubSql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await hubSql`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES ('025', 'drop_staged_repurposing', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;
  console.log('[+] Migration 025 successfully recorded in schema_migrations.');

  // 3. Propagate to all active fleet shards
  console.log('\n[3/4] Propagating drop to all active Neon Fleet shards...');
  let registry = [];
  try {
    registry = await hubSql`
      SELECT id, project_id, project_name, is_hub, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
  } catch (err) {
    console.error('[-] Fatal: Failed to query neon_projects_registry:', err.message);
    process.exit(1);
  }

  console.log(`[*] Discovered ${registry.length} active fleet shards to process.`);
  let dropSucceeded = 0;
  let dropFailed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const poolerUrl = enforceNeonPoolerUrl(shard.database_url);
        const shardSql = neon(poolerUrl);
        await shardSql`DROP INDEX IF EXISTS idx_pa_staged_pins_status;`;
        await shardSql`DROP TABLE IF EXISTS pa_staged_pins CASCADE;`;
        dropSucceeded++;
      } catch (err) {
        console.error(`[-] Failed to drop on shard ${shard.project_id || shard.project_name}:`, err.message);
        dropFailed++;
      }
    }));
  }

  console.log(`[+] Fleet Shard drop execution complete: ${dropSucceeded} succeeded, ${dropFailed} failed.`);

  // 4. Deep Fleet-Wide Verification Check
  console.log('\n[4/4] Step 4 — Deep Fleet-Wide Verification Check...');

  // 4.1 Verify Hub
  const [hubTableCheck] = await hubSql`
    SELECT COUNT(*)::int as c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pa_staged_pins';
  `;
  const [hubIndexCheck] = await hubSql`
    SELECT COUNT(*)::int as c
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_pa_staged_pins_status';
  `;
  const hubTableCount = hubTableCheck.c;
  const hubIndexCount = hubIndexCheck.c;

  // 4.2 Verify Shards
  let shardsVerifiedClean = 0;
  let shardVerifyFailed = 0;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const poolerUrl = enforceNeonPoolerUrl(shard.database_url);
        const shardSql = neon(poolerUrl);
        const [stCheck] = await shardSql`
          SELECT COUNT(*)::int as c
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'pa_staged_pins';
        `;
        const [siCheck] = await shardSql`
          SELECT COUNT(*)::int as c
          FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_pa_staged_pins_status';
        `;
        if (stCheck.c === 0 && siCheck.c === 0) {
          shardsVerifiedClean++;
        } else {
          console.error(`[-] Shard ${shard.project_id || shard.project_name} residual found: table=${stCheck.c}, index=${siCheck.c}`);
          shardVerifyFailed++;
        }
      } catch (err) {
        console.error(`[-] Failed to verify shard ${shard.project_id || shard.project_name}:`, err.message);
        shardVerifyFailed++;
      }
    }));
  }

  const totalFailedShards = dropFailed + shardVerifyFailed;

  console.log(`\nHub Table Count: ${hubTableCount} | Hub Index Count: ${hubIndexCount} | Shards Verified Clean: ${shardsVerifiedClean}/${registry.length} | Failed Shards: ${totalFailedShards}`);

  if (hubTableCount === 0 && hubIndexCount === 0 && shardsVerifiedClean === registry.length && totalFailedShards === 0) {
    console.log('\n✅ [VERIFICATION PASSED] pa_staged_pins and idx_pa_staged_pins_status completely removed from Hub and all 99 Fleet Shards!');
    process.exit(0);
  } else {
    console.error('\n❌ [VERIFICATION FAILED] Staged Repurposing residuals detected or fleet communication failure!');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[-] Fatal Migration 025 error:', err);
  process.exit(1);
});
