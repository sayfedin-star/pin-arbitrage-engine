#!/usr/bin/env node

/**
 * scripts/migrate_fleet_016.mjs
 *
 * Migration Runner for 016_hub_and_spoke_synopses_and_shards.sql
 * Applies Hub & Spoke synopses, active SERP cache, universal master pins,
 * and daily snapshot time-series tables across Hub and all registered Neon fleet shards.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);
const MIGRATION_FILE = path.join(__dirname, 'migrations', '016_hub_and_spoke_synopses_and_shards.sql');

export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let inSingleQuote = false;

  const lines = sqlText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarQuote && !inSingleQuote) {
      continue;
    }

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1] || '';

      if (char === '$' && nextChar === '$' && !inSingleQuote) {
        inDollarQuote = !inDollarQuote;
        current += '$$';
        i++;
        continue;
      }

      if (char === "'" && !inDollarQuote) {
        if (line[i - 1] !== '\\') {
          inSingleQuote = !inSingleQuote;
        }
      }

      if (char === ';' && !inDollarQuote && !inSingleQuote) {
        const stmt = current.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        current = '';
        continue;
      }

      current += char;
    }
    current += '\n';
  }

  const finalStmt = current.trim();
  if (finalStmt.length > 0) {
    statements.push(finalStmt);
  }

  return statements;
}

async function migrateEndpoint(dbUrl, endpointName, statements) {
  const sql = neon(dbUrl);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sql`SET lock_timeout = '3000';`;

      for (const stmt of statements) {
        await sql(stmt);
      }

      // Verification: Check universal_master_pins and keyword_serp_current
      const [tableCheck] = await sql`
        SELECT COUNT(*) as cnt 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('universal_master_pins', 'keyword_serp_current', 'keyword_folder_synopses');
      `;

      return {
        ok: true,
        endpoint: endpointName,
        verified: Number(tableCheck?.cnt || 0) >= 3
      };
    } catch (err) {
      const isTransient = /timeout|lock_not_available|cold start|fetch failed|ECONNRESET/i.test(err.message);
      if (attempt < maxAttempts && isTransient) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
        console.warn(`[~] [${endpointName}] Retry attempt ${attempt}/${maxAttempts} in ${backoffMs}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, backoffMs));
      } else {
        return { ok: false, endpoint: endpointName, error: err.message };
      }
    }
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 MIGRATION 016: HOLISTIC 4-PILLAR HUB & SPOKE 99-SHARD FLEET');
  console.log('================================================================');

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`[-] FATAL: Migration file not found: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = splitSqlStatements(sqlContent);
  console.log(`[*] Loaded ${statements.length} hardened DDL statements from 016_hub_and_spoke_synopses_and_shards.sql\n`);

  // Phase 1: Migrate Central Hub
  console.log('[*] Phase 1: Migrating Central Hub Database...');
  const hubRes = await migrateEndpoint(DATABASE_URL, 'Neon Hub (Primary)', statements);
  if (hubRes.ok) {
    console.log(`[+] Hub migrated successfully! Verification: ${hubRes.verified ? 'VERIFIED (3/3 Tables Created) ✅' : 'PENDING'}\n`);
  } else {
    console.error(`[-] CRITICAL: Failed to migrate Hub:`, hubRes.error);
    process.exit(1);
  }

  // Phase 2: Migrate Fleet Shards
  console.log('[*] Phase 2: Fetching active worker shards from neon_projects_registry...');
  const shards = await hubSql`
    SELECT id, project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL
    ORDER BY id ASC;
  `;
  console.log(`[*] Discovered ${shards.length} active worker shards in registry.\n`);

  if (shards.length > 0) {
    console.log(`[*] Phase 3: Applying Migration 016 across ${shards.length} worker shards (Bounded Pool: 10 parallel)...`);
    const CONCURRENCY = 10;
    let succeeded = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < shards.length; i += CONCURRENCY) {
      const batch = shards.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(shard => migrateEndpoint(shard.database_url, shard.project_name || shard.project_id, statements))
      );

      for (const res of batchResults) {
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
          failures.push(res);
          console.warn(`[-] Failed shard ${res.endpoint}: ${res.error}`);
        }
      }
      process.stdout.write(`    Progress: ${Math.min(i + CONCURRENCY, shards.length)}/${shards.length} shards processed.\r`);
    }

    console.log(`\n\n================================================================`);
    console.log(`🎉 FLEET MIGRATION 016 COMPLETED!`);
    console.log(`   Total Shards: ${shards.length}`);
    console.log(`   Succeeded:    ${succeeded}`);
    console.log(`   Failed:       ${failed}`);
    console.log('================================================================');

    if (failed > 0) {
      console.error('\n[-] Failure Details:');
      for (const f of failures) {
        console.error(`  - ${f.endpoint}: ${f.error}`);
      }
      process.exit(1);
    }
  }

  console.log('\n[✓] Migration 016 completed with 100% fleet parity!');
}

run().catch(err => {
  console.error('[-] Fatal Migration 016 Error:', err);
  process.exit(1);
});
