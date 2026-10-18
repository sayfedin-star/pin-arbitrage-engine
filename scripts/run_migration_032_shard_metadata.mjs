#!/usr/bin/env node

/**
 * scripts/run_migration_032_shard_metadata.mjs
 *
 * Migration 032: Add metadata JSONB column to universal_master_pins across Hub and all 99 Fleet Shards
 * Target: Neon Serverless Postgres (Hub & 99 Shards)
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';

// Auto-load .env
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
  console.log('[*] Running Migration 032: Add metadata JSONB to universal_master_pins');
  console.log('[*] ==============================================================');

  // Compute Checksum
  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/032_shard_metadata.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 032 SQL SHA-256: ${checksum}`);

  // 1. Apply to Central Hub
  console.log('\n[1/4] Applying to Central Metadata Hub...');
  await hubSql`
    ALTER TABLE universal_master_pins 
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  `;
  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_ump_metadata_gin 
      ON universal_master_pins USING gin (metadata);
  `;
  console.log('[+] Central Hub: Added metadata column and GIN index to universal_master_pins.');

  // 2. Register in schema_migrations on Hub
  console.log('\n[2/4] Registering Migration 032 in schema_migrations...');
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
    VALUES ('032', 'add_universal_master_pins_metadata', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;
  console.log('[+] Migration 032 recorded in schema_migrations.');

  // 3. Propagate to all active fleet shards
  console.log('\n[3/4] Propagating to all active Neon Fleet shards...');
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
  let succeeded = 0;
  let failed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const poolerUrl = enforceNeonPoolerUrl(shard.database_url);
        const shardSql = neon(poolerUrl);
        await shardSql`
          ALTER TABLE universal_master_pins 
            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
        `;
        await shardSql`
          CREATE INDEX IF NOT EXISTS idx_ump_metadata_gin 
            ON universal_master_pins USING gin (metadata);
        `;
        succeeded++;
      } catch (err) {
        console.error(`[-] Failed on shard ${shard.project_name || shard.id}:`, err.message);
        failed++;
      }
    }));
    console.log(`  Processed ${Math.min(i + BATCH_SIZE, registry.length)}/${registry.length} shards...`);
  }

  console.log(`[+] Fleet Shard execution complete: ${succeeded} succeeded, ${failed} failed.`);

  // 4. Deep Verification
  console.log('\n[4/4] Step 4 — Verification Check on Shard 1, 50, 99...');
  for (const sid of [1, 50, 99]) {
    const sEntry = registry.find(r => r.project_name === `pin-arbitrage-shard-${String(sid).padStart(2, '0')}`);
    if (sEntry) {
      const sSql = neon(enforceNeonPoolerUrl(sEntry.database_url));
      const cols = await sSql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'universal_master_pins' AND column_name = 'metadata';
      `;
      console.log(`  Shard #${sid} column 'metadata':`, cols.length > 0 ? `FOUND (${cols[0].data_type})` : 'MISSING');
    }
  }

  console.log('\n[✓] Migration 032 finished successfully!');
}

run().catch(err => {
  console.error('[-] Migration 032 failed:', err);
  process.exit(1);
});
