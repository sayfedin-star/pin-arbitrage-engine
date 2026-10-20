#!/usr/bin/env node

/**
 * scripts/run_migration_035.mjs
 *
 * Migration 035 Runner: Add domain column to keyword_displaced_index
 * Target: Neon Serverless Postgres (Central Hub)
 *
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';

// Auto-load .env
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {
    // .env file optional when environment variables are injected directly
  }
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
  if (!fs.existsSync(migrationSqlPath)) {
    throw new Error(`Migration SQL file not found at ${migrationSqlPath}`);
  }
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 035 SQL SHA-256: ${checksum}`);

  // Phase 1: Execute DDL inside an atomic transaction with SET LOCAL lock_timeout = '3000'
  // Releases AccessExclusiveLock immediately upon transaction completion.
  console.log('[1/4] Adding domain column to keyword_displaced_index (atomic lock_timeout=3000ms)...');
  await sql.transaction([
    sql`SET LOCAL lock_timeout = '3000';`,
    sql`
      ALTER TABLE keyword_displaced_index
        ADD COLUMN IF NOT EXISTS domain VARCHAR(128);
    `
  ]);

  // Phase 2: Build partial index CONCURRENTLY outside any transaction block
  console.log('[2/4] Creating partial index CONCURRENTLY on keyword_displaced_index(domain)...');
  await sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kdi_domain
      ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';
  `;

  // Phase 3: Non-blocking batched backfill (2,000 rows per batch)
  console.log('[3/4] Backfilling domain from keyword_serp_current in 2,000-row batches...');
  const BATCH_SIZE = 2000;
  let totalBackfilled = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const updatedRows = await sql`
      WITH batch AS (
        SELECT kdi.keyword_id, kdi.pin_id, ksc.domain
        FROM keyword_displaced_index kdi
        JOIN keyword_serp_current ksc
          ON ksc.keyword_id = kdi.keyword_id
         AND ksc.pin_id = kdi.pin_id
        WHERE (kdi.domain IS NULL OR kdi.domain = '')
          AND (ksc.domain IS NOT NULL AND ksc.domain <> '')
        LIMIT ${BATCH_SIZE}
      )
      UPDATE keyword_displaced_index kdi
      SET domain = batch.domain,
          updated_at = NOW()
      FROM batch
      WHERE kdi.keyword_id = batch.keyword_id
        AND kdi.pin_id = batch.pin_id
      RETURNING kdi.pin_id;
    `;

    const count = Array.isArray(updatedRows) ? updatedRows.length : 0;
    totalBackfilled += count;
    console.log(`    [+] Batch #${batchNum}: updated ${count} row(s) (Cumulative: ${totalBackfilled})`);

    if (count < BATCH_SIZE) {
      break;
    }
  }

  // Phase 4: Verify schema & index presence and register Migration 035
  console.log('[4/4] Verifying schema & registering Migration 035 in schema_migrations...');
  const [colCheck] = await sql`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'keyword_displaced_index'
      AND column_name = 'domain';
  `;
  if (!colCheck) {
    throw new Error('Verification failed: column "domain" was not created on keyword_displaced_index.');
  }

  const [idxCheck] = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'keyword_displaced_index'
      AND indexname = 'idx_kdi_domain';
  `;
  if (!idxCheck) {
    throw new Error('Verification failed: index "idx_kdi_domain" was not created on keyword_displaced_index.');
  }

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
    VALUES ('035', 'add_domain_to_keyword_displaced_index', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  const [record] = await sql`
    SELECT version, name, checksum, applied_at
    FROM schema_migrations
    WHERE version = '035';
  `;
  console.log(`[+] Migration 035 verified & registered on Hub: ${JSON.stringify(record)}`);
  console.log('[*] Migration 035 complete!');
}

run().catch(err => {
  console.error('[-] Migration 035 failed:', err);
  process.exit(1);
});
