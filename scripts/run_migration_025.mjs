#!/usr/bin/env node

/**
 * scripts/run_migration_025.mjs
 * Migration 025: Drop Staged Repurposing Queue (pa_staged_pins) across Hub and All Fleet Shards
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

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

const hubSql = neon(DATABASE_URL);

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 025: Drop Staged Repurposing (pa_staged_pins)');
  console.log('[*] ==============================================================');

  // 1. Drop from Central Hub
  console.log('\n[1/3] Dropping pa_staged_pins on Neon Central Hub...');
  await hubSql`DROP INDEX IF EXISTS idx_pa_staged_pins_status;`;
  await hubSql`DROP TABLE IF EXISTS pa_staged_pins CASCADE;`;
  console.log('[+] Central Hub: Dropped pa_staged_pins table and idx_pa_staged_pins_status.');

  // 2. Register in schema_migrations on Hub
  console.log('\n[2/3] Registering Migration 025 in schema_migrations...');
  await hubSql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await hubSql`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES ('025', 'drop_staged_repurposing', NOW())
    ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
  `;
  console.log('[+] Migration 025 successfully recorded in schema_migrations.');

  // 3. Propagate to all active fleet shards
  console.log('\n[3/3] Propagating drop to all active Neon Fleet shards...');
  let registry = [];
  try {
    registry = await hubSql`
      SELECT id, project_id, project_name, is_hub, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
  } catch (err) {
    console.warn('[!] neon_projects_registry query skipped or not found:', err.message);
  }

  console.log(`[*] Discovered ${registry.length} active fleet shards to process.`);
  let succeeded = 0;
  let failed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const shardSql = neon(shard.database_url);
        await shardSql`DROP INDEX IF EXISTS idx_pa_staged_pins_status;`;
        await shardSql`DROP TABLE IF EXISTS pa_staged_pins CASCADE;`;
        succeeded++;
      } catch (err) {
        console.warn(`[-] Failed to drop on shard ${shard.project_id || shard.project_name}:`, err.message);
        failed++;
      }
    }));
  }

  console.log(`[+] Fleet Shard execution complete: ${succeeded} succeeded, ${failed} failed.`);

  // 4. Verification Check
  const [hubCheck] = await hubSql`
    SELECT COUNT(*)::int as c
    FROM information_schema.tables
    WHERE table_name = 'pa_staged_pins';
  `;

  if (hubCheck.c === 0) {
    console.log('\n✅ [VERIFICATION PASSED] pa_staged_pins is completely removed from database!');
  } else {
    console.error('\n❌ [VERIFICATION FAILED] pa_staged_pins still exists in database!');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[-] Fatal Migration 025 error:', err);
  process.exit(1);
});
