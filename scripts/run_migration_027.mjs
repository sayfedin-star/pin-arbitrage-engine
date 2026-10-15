#!/usr/bin/env node

/**
 * scripts/run_migration_027.mjs
 * Migration 027: Drop Board Ideas Radar (tracked_boards & board_idea_snapshots) across Hub and All Fleet Shards
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
  console.log('[*] Running Migration 027: Drop Board Ideas Radar');
  console.log('[*] ==============================================================');

  // Compute SHA-256 Checksum of 027 migration file
  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/027_drop_board_ideas_radar.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 027 SQL SHA-256: ${checksum}`);

  // 1. Drop from Central Hub
  console.log('\n[1/4] Dropping board_idea_snapshots and tracked_boards on Neon Central Hub...');
  await hubSql`DROP TABLE IF EXISTS board_idea_snapshots CASCADE;`;
  await hubSql`DROP TABLE IF EXISTS tracked_boards CASCADE;`;
  console.log('[+] Central Hub: Dropped board_idea_snapshots and tracked_boards tables.');

  // 2. Register in schema_migrations on Hub
  console.log('\n[2/4] Registering Migration 027 in schema_migrations...');
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
    VALUES ('027', '027_drop_board_ideas_radar', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;
  console.log('[+] Migration 027 successfully recorded in schema_migrations on Hub.');

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
        await shardSql`DROP TABLE IF EXISTS board_idea_snapshots CASCADE;`;
        await shardSql`DROP TABLE IF EXISTS tracked_boards CASCADE;`;
        await shardSql`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            checksum VARCHAR(64),
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `;
        await shardSql`
          INSERT INTO schema_migrations (version, name, checksum, applied_at)
          VALUES ('027', '027_drop_board_ideas_radar', ${checksum}, NOW())
          ON CONFLICT (version) DO UPDATE SET
            name = EXCLUDED.name,
            checksum = EXCLUDED.checksum,
            applied_at = NOW();
        `;
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
  const [hubBisCheck] = await hubSql`
    SELECT COUNT(*)::int as c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'board_idea_snapshots';
  `;
  const [hubTbCheck] = await hubSql`
    SELECT COUNT(*)::int as c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tracked_boards';
  `;
  const hubBisCount = hubBisCheck.c;
  const hubTbCount = hubTbCheck.c;

  // 4.2 Verify Shards
  let shardsVerifiedClean = 0;
  let shardVerifyFailed = 0;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const poolerUrl = enforceNeonPoolerUrl(shard.database_url);
        const shardSql = neon(poolerUrl);
        const [sBis] = await shardSql`
          SELECT COUNT(*)::int as c
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'board_idea_snapshots';
        `;
        const [sTb] = await shardSql`
          SELECT COUNT(*)::int as c
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'tracked_boards';
        `;
        if (sBis.c === 0 && sTb.c === 0) {
          shardsVerifiedClean++;
        } else {
          console.error(`[-] Shard ${shard.project_id || shard.project_name} residual found: board_idea_snapshots=${sBis.c}, tracked_boards=${sTb.c}`);
          shardVerifyFailed++;
        }
      } catch (err) {
        console.error(`[-] Failed to verify shard ${shard.project_id || shard.project_name}:`, err.message);
        shardVerifyFailed++;
      }
    }));
  }

  const totalFailedShards = dropFailed + shardVerifyFailed;

  console.log(`\nHub board_idea_snapshots: ${hubBisCount} | Hub tracked_boards: ${hubTbCount} | Shards Verified Clean: ${shardsVerifiedClean}/${registry.length} | Failed Shards: ${totalFailedShards}`);

  if (hubBisCount === 0 && hubTbCount === 0 && shardsVerifiedClean === registry.length && totalFailedShards === 0) {
    console.log('\n✅ [VERIFICATION PASSED] board_idea_snapshots and tracked_boards completely removed from Hub and all Fleet Shards!');
    process.exit(0);
  } else {
    console.error('\n❌ [VERIFICATION FAILED] Board Ideas Radar residuals detected or fleet communication failure!');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[-] Fatal Migration 027 error:', err);
  process.exit(1);
});
