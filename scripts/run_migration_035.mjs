#!/usr/bin/env node

/**
 * scripts/run_migration_035.mjs
 *
 * Migration 035 Runner: Add domain column to keyword_displaced_index
 * Target: Neon Serverless Postgres (Central Hub)
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
  console.error('[-] FATAL: DATABASE_URL is required to run migration 035.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 035: Add domain to keyword_displaced_index...');
  console.log('[*] ==============================================================');

  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/035_displaced_index_domain.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 035 SQL SHA-256: ${checksum}`);

  console.log('[1/4] Adding domain column to keyword_displaced_index...');
  await sql`
    ALTER TABLE keyword_displaced_index
      ADD COLUMN IF NOT EXISTS domain VARCHAR(128);
  `;

  console.log('[2/4] Creating partial index on keyword_displaced_index(domain)...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_kdi_domain
      ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';
  `;

  console.log('[3/4] Backfilling domain from keyword_serp_current...');
  await sql`
    UPDATE keyword_displaced_index kdi
    SET domain = ksc.domain
    FROM keyword_serp_current ksc
    WHERE ksc.keyword_id = kdi.keyword_id
      AND ksc.pin_id = kdi.pin_id
      AND (kdi.domain IS NULL OR kdi.domain = '')
      AND (ksc.domain IS NOT NULL AND ksc.domain <> '');
  `;

  console.log('[4/4] Registering Migration 035 in schema_migrations...');
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES ('035', 'add_domain_to_keyword_displaced_index', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  const [record] = await sql`SELECT version, name, applied_at FROM schema_migrations WHERE version = '035';`;
  console.log(`[+] Migration 035 successfully registered on Hub: ${JSON.stringify(record)}`);
  console.log('[*] Migration 035 complete!');
}

run().catch(err => {
  console.error('[-] Migration 035 failed:', err);
  process.exit(1);
});
