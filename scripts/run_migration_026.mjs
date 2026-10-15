#!/usr/bin/env node

/**
 * scripts/run_migration_026.mjs
 * Migration 026: Neon Performance, HOT Indexes & SARGable Query Acceleration
 */

import { neon } from '@neondatabase/serverless';
import { enforceNeonPoolerUrl } from '../src/modules/fleet/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const DATABASE_URL = enforceNeonPoolerUrl(rawUrl);
const sql = neon(DATABASE_URL);

async function run() {
  console.log('[*] Running Migration 026: Performance & HOT Indexes on Neon Central Hub...');

  // 1. Ensure pg_trgm extension
  console.log('[1/7] Ensuring pg_trgm extension...');
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;

  // 2. Functional Expression Index on Normalized PinArchive Username
  console.log('[2/7] Creating functional expression index idx_pa_pins_account_norm...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pa_pins_account_norm 
    ON pa_pins (LOWER(REPLACE(account_username, '@', '')), saves DESC);
  `;

  // 3. Composite Index for Tier 3 SARGable Evaluation and Date Range Queries
  console.log('[3/7] Creating composite index idx_pa_pins_created_saves...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pa_pins_created_saves 
    ON pa_pins (created_at_pinterest DESC NULLS LAST, saves DESC);
  `;

  // 4. Trigram GIN Indexes
  console.log('[4/7] Creating trigram GIN indexes on pa_pins and competitor_pins...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pa_pins_trgm_title 
    ON pa_pins USING gin (LOWER(title) gin_trgm_ops);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pa_pins_trgm_board 
    ON pa_pins USING gin (LOWER(COALESCE(board_name, '')) gin_trgm_ops);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_pins_trgm_title 
    ON competitor_pins USING gin (LOWER(title) gin_trgm_ops);
  `;

  // 5. Partial Index on pending queue
  console.log('[5/7] Creating partial index idx_cp_pending_queue_hot...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_pending_queue_hot 
    ON competitor_pins (competitor_id, enrich_attempts ASC, id ASC) 
    WHERE enrichment_status = 'pending';
  `;

  // 6. Fillfactor HOT tuning
  console.log('[6/7] Applying HOT fillfactors with SET LOCAL lock_timeout = 3000ms...');
  try {
    await sql.transaction([
      sql`SET LOCAL lock_timeout = '3000';`,
      sql`ALTER TABLE competitor_history_snapshots SET (fillfactor = 80);`,
      sql`ALTER TABLE competitor_boards SET (fillfactor = 80);`,
      sql`ALTER TABLE crawler_shard_heartbeats SET (fillfactor = 70);`
    ]);
    console.log('[+] Fillfactor HOT tuning applied successfully.');
  } catch (ffErr) {
    console.warn('[!] Note on fillfactor tuning:', ffErr.message);
  }

  // 7. Schema migrations registration
  console.log('[7/7] Registering migration in schema_migrations...');
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES ('026', 'neon_performance_and_hot_indexes', NOW())
    ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
  `;

  console.log('✅ Migration 026 completed successfully on Central Hub!');
}

run().catch(err => {
  console.error('[-] Migration 026 failed:', err);
  process.exit(1);
});
