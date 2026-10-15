#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  console.error('[-] FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 028: Domain Intelligence & Age Registry on Neon Hub...');
  console.log('[*] ==============================================================');

  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/028_domain_intelligence_and_age_registry.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 028 SQL SHA-256: ${checksum}`);

  console.log('[1/3] Creating domain_registry_metadata table on Central Hub...');
  await sql`
    CREATE TABLE IF NOT EXISTS domain_registry_metadata (
      domain VARCHAR(255) PRIMARY KEY,
      registered_at TIMESTAMPTZ,
      updated_at_whois TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      initial_age_days INT,
      initial_age_years NUMERIC(6, 2),
      lookup_source VARCHAR(32) DEFAULT 'domainee',
      lookup_status VARCHAR(32) DEFAULT 'pending',
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`ALTER TABLE domain_registry_metadata SET (fillfactor = 85);`.catch(() => {});
  await sql`CREATE INDEX IF NOT EXISTS idx_drm_registered_at ON domain_registry_metadata (registered_at DESC NULLS LAST) WHERE lookup_status = 'resolved';`;
  await sql`CREATE INDEX IF NOT EXISTS idx_drm_expires_at ON domain_registry_metadata (expires_at ASC NULLS LAST) WHERE expires_at IS NOT NULL;`;

  console.log('[2/3] Creating covering domain indexes on keyword_serp_current, pa_pins, and competitor_pins...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ksc_domain_serp_authority
    ON keyword_serp_current (LOWER(REGEXP_REPLACE(domain, '^www\\.', '')), is_displaced, rank_position ASC)
    INCLUDE (keyword_id, pin_id, save_count, repin_count, daily_save_velocity, creator_username, destination_url)
    WHERE domain IS NOT NULL AND domain <> '';
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pa_pins_domain_saves
    ON pa_pins (LOWER(REGEXP_REPLACE(domain, '^www\\.', '')), saves DESC)
    INCLUDE (pin_id, repins, velocity, account_username, is_product, link)
    WHERE domain IS NOT NULL AND domain <> '';
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cp_link_domain_saves
    ON competitor_pins (LOWER(REGEXP_REPLACE(link_domain, '^www\\.', '')), save_count DESC)
    INCLUDE (competitor_id, pin_id, repin_count, is_product, destination_url)
    WHERE link_domain IS NOT NULL AND link_domain <> '';
  `;

  console.log('[3/3] Registering Migration 028 in schema_migrations on Hub...');
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
    VALUES ('028', 'domain_intelligence_and_age_registry', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;

  console.log('[+] Migration 028 successfully applied and verified on Neon Central Hub!');
}

run().catch(err => {
  console.error('[-] Migration 028 failed:', err.message);
  process.exit(1);
});
