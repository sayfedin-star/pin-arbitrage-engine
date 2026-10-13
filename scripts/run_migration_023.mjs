#!/usr/bin/env node

/**
 * scripts/run_migration_023.mjs
 * Migration 023: Enable pg_trgm & Create GIN Trigram + Composite Covering Indexes
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log('[*] Running Migration 023: Performance & Trigram Indexes on Neon Central Hub...');

  // 1. Enable pg_trgm extension
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;
  console.log('[+] Extension pg_trgm enabled.');

  // 2. Create GIN Trigram indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_tk_trgm_keyword 
    ON tracked_keywords USING gin (LOWER(keyword) gin_trgm_ops);
  `;
  console.log('[+] Index idx_tk_trgm_keyword created.');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_trgm_username 
    ON competitor_profiles USING gin (LOWER(username) gin_trgm_ops);
  `;
  console.log('[+] Index idx_cp_trgm_username created.');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_trgm_display_name 
    ON competitor_profiles USING gin (LOWER(COALESCE(display_name, '')) gin_trgm_ops);
  `;
  console.log('[+] Index idx_cp_trgm_display_name created.');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_tb_trgm_url 
    ON tracked_boards USING gin (url gin_trgm_ops);
  `;
  console.log('[+] Index idx_tb_trgm_url created.');

  // 3. Create composite covering index for keyword_serp_current
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ksc_active_covering 
    ON keyword_serp_current (keyword_id, is_displaced, rank_position);
  `;
  console.log('[+] Index idx_ksc_active_covering created.');

  // 4. Verification
  const indexes = await sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND indexname IN ('idx_tk_trgm_keyword', 'idx_cp_trgm_username', 'idx_cp_trgm_display_name', 'idx_tb_trgm_url', 'idx_ksc_active_covering');
  `;
  console.log('[+] Verified active indexes in database:', indexes.map(i => i.indexname));

  console.log('✅ Migration 023 completed successfully!');
}

run().catch(err => {
  console.error('[-] Migration 023 failed:', err);
  process.exit(1);
});
