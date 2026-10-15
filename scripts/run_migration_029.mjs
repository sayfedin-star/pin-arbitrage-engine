#!/usr/bin/env node

/**
 * scripts/run_migration_029.mjs
 *
 * Migration 029 Runner: Domain Monetization Intelligence & Historical Switch Tracking
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
  console.error('[-] FATAL: DATABASE_URL is required to run migration 029.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 029: Domain Monetization Intelligence on Neon Hub...');
  console.log('[*] ==============================================================');

  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/029_domain_monetization_metadata.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 029 SQL SHA-256: ${checksum}`);

  console.log('[1/3] Creating domain_monetization_metadata table...');
  await sql`
    CREATE TABLE IF NOT EXISTS domain_monetization_metadata (
      domain VARCHAR(255) PRIMARY KEY,
      current_ad_network VARCHAR(64) DEFAULT 'unchecked',
      ad_manager_domain VARCHAR(128),
      primary_pub_id VARCHAR(128),
      previous_ad_network VARCHAR(64),
      switched_at TIMESTAMPTZ,
      network_history JSONB DEFAULT '[]'::jsonb,
      ads_txt_status VARCHAR(32) DEFAULT 'pending',
      raw_header_snippet TEXT,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`ALTER TABLE domain_monetization_metadata SET (fillfactor = 85);`.catch(() => {});

  console.log('[2/3] Creating indexes on domain_monetization_metadata...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_dmm_current_network
    ON domain_monetization_metadata (current_ad_network, checked_at DESC);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_dmm_switched_at
    ON domain_monetization_metadata (switched_at DESC NULLS LAST)
    WHERE switched_at IS NOT NULL;
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_dmm_ads_txt_status
    ON domain_monetization_metadata (ads_txt_status, checked_at DESC);
  `;

  console.log('[3/3] Registering Migration 029 in schema_migrations...');
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
    VALUES ('029', 'domain_monetization_metadata', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  // Verify
  const [record] = await sql`SELECT version, name, applied_at FROM schema_migrations WHERE version = '029';`;
  console.log('[+] Migration 029 successfully applied and verified:', record);
  console.log('[*] ==============================================================');
}

run().catch((err) => {
  console.error('[-] Migration 029 FAILED:', err.message);
  process.exit(1);
});
