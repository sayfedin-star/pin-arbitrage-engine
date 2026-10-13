#!/usr/bin/env node

/**
 * scripts/run_migration_024.mjs
 * Migration 024: Full Fleet MVCC HOT Updates & Fillfactor 80 Hardening
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  console.log('[*] Running Migration 024: Fillfactor 80 Hardening on Neon Central Hub...');

  await sql`SET lock_timeout = '3000';`;

  const tables = [
    'keyword_serp_current',
    'pa_pins',
    'pa_pin_metrics',
    'universal_master_pins',
    'competitor_profiles',
    'competitor_pins',
    'tracked_boards',
    'tracked_keywords',
    'candidate_graph_nodes'
  ];

  for (const tbl of tables) {
    try {
      await sql(`ALTER TABLE ${tbl} SET (fillfactor = 80);`);
      console.log(`[+] Table ${tbl} fillfactor set to 80.`);
    } catch (err) {
      console.warn(`[!] Warning on table ${tbl}:`, err.message);
    }
  }

  // Register in schema_migrations
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
    VALUES ('024', 'fillfactor_hot_hardening', NOW())
    ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
  `;
  console.log('[+] Migration 024 registered in schema_migrations.');

  // Verification
  const verified = await sql`
    SELECT relname, reloptions
    FROM pg_class
    WHERE relname IN (${tables[0]}, ${tables[1]}, ${tables[2]}, ${tables[3]}, ${tables[4]}, ${tables[5]}, ${tables[6]}, ${tables[7]}, ${tables[8]});
  `;
  console.log('[+] Verified table storage options in database:');
  for (const v of verified) {
    console.log(`    - ${v.relname}: ${JSON.stringify(v.reloptions)}`);
  }

  console.log('✅ Migration 024 completed successfully on Central Hub!');
}

run().catch(err => {
  console.error('[-] Migration 024 failed:', err);
  process.exit(1);
});
