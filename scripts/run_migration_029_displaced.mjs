#!/usr/bin/env node

/**
 * scripts/run_migration_029_displaced.mjs
 *
 * Migration Runner: Enforce NOT NULL on keyword_pins_snapshots.is_displaced
 * Target: Neon Serverless Postgres (Central Hub)
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  console.error('[-] FATAL: DATABASE_URL is required to run migration.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 029_displaced: Enforce NOT NULL on is_displaced...');
  console.log('[*] ==============================================================');

  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/029_keyword_snapshots_not_null_displaced.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 029_displaced SQL SHA-256: ${checksum}`);

  console.log('[1/4] Ensuring DEFAULT is FALSE...');
  await sql`
    ALTER TABLE keyword_pins_snapshots 
    ALTER COLUMN is_displaced SET DEFAULT FALSE;
  `;

  console.log('[2/4] Backfilling existing NULL rows to FALSE...');
  const updateRes = await sql`
    UPDATE keyword_pins_snapshots 
    SET is_displaced = FALSE 
    WHERE is_displaced IS NULL;
  `;
  console.log(`[+] Backfilled rows: ${updateRes.count ?? 'OK'}`);

  console.log('[3/4] Enforcing NOT NULL constraint on is_displaced...');
  await sql`
    ALTER TABLE keyword_pins_snapshots 
    ALTER COLUMN is_displaced SET NOT NULL;
  `;

  console.log('[4/4] Registering in schema_migrations...');
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
    VALUES ('029_displaced', 'keyword_snapshots_not_null_displaced', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  // Verify
  const [record] = await sql`
    SELECT version, name, applied_at 
    FROM schema_migrations 
    WHERE version = '029_displaced';
  `;
  console.log('[+] Migration 029_displaced applied and verified successfully:', record);

  // Verify column nullability
  const colInfo = await sql`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'keyword_pins_snapshots' AND column_name = 'is_displaced';
  `;
  console.log('[+] Verified column definition:', colInfo);
  console.log('[*] ==============================================================');
}

run().catch((err) => {
  console.error('[-] Migration 029_displaced FAILED:', err.message);
  process.exit(1);
});
