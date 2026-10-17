#!/usr/bin/env node

/**
 * scripts/run_migration_031.mjs
 *
 * Migration 031 Runner: Zero-HTTP Reconciliation Pipeline & Tier 2 Velocity Breakout
 * Target: Neon Serverless Postgres (Central Hub & Fleet Shards)
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';

// Auto-load .env
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required to run migration 031.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 031: Reconciliation & Velocity on Neon Hub...');
  console.log('[*] ==============================================================');

  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/031_reconciliation_and_velocity.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 031 SQL SHA-256: ${checksum}`);

  console.log('[1/3] Expanding pa_qualification_rules with Tier 2 velocity thresholds...');
  await sql`
    ALTER TABLE pa_qualification_rules
      ADD COLUMN IF NOT EXISTS tier2_min_velocity NUMERIC(6,2) DEFAULT 3.50,
      ADD COLUMN IF NOT EXISTS tier2_max_age_days INT DEFAULT 60,
      ADD COLUMN IF NOT EXISTS tier2_min_shares INT DEFAULT 15;
  `;

  console.log('[2/3] Adding is_deleted flag and reconciliation index on competitor_pins...');
  await sql`
    ALTER TABLE competitor_pins
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_comp_pins_reconcile_candidates
      ON competitor_pins (competitor_id, save_count DESC, repin_count DESC, created_at_pinterest DESC)
      WHERE is_deleted = FALSE;
  `;

  console.log('[3/3] Registering Migration 031 in schema_migrations...');
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES ('031', 'reconciliation_and_velocity_rules', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET 
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  console.log('[✓] Migration 031 applied successfully to Neon Hub!');
}

run().catch(err => {
  console.error('[-] Migration 031 failed:', err.message);
  process.exit(1);
});
