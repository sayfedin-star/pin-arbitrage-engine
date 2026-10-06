#!/usr/bin/env node

/**
 * Universal Neon Fleet Migration Runner (Production Grade)
 * 
 * Executes idempotent, zero-drift database migrations across the entire Neon fleet:
 * - 1 Master Hub Database
 * - 99 Worker Shard Databases
 * 
 * Features:
 * - Bounded Concurrency Worker Pool (default: 10 parallel shards)
 * - Exponential Backoff & Jitter for Serverless Cold-Start Recovery
 * - Idempotent Multi-Statement SQL Parsing preserving $$ function blocks
 * - Schema Versioning Handshake via `schema_migrations` table
 * - Zero-Downtime Non-Blocking DDL Execution
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);
const MIGRATION_FILE = path.join(__dirname, 'migrations', '011_universal_fleet_parity.sql');

/**
 * Splits SQL script into discrete statements preserving $$ blocks and string literals.
 */
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

/**
 * Executes migration statements on a single database endpoint with auto-retry on cold starts.
 */
export async function migrateEndpoint(dbUrl, endpointName = 'Unknown', statements = [], options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const sql = neon(dbUrl);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 1. Ensure schema_migrations table exists
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          checksum VARCHAR(64),
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;

      // 2. Check if migration 011 has already been applied (Fast-path skip)
      if (!options.force) {
        const [applied] = await sql`
          SELECT 1 FROM schema_migrations WHERE version = '011' LIMIT 1;
        `.catch(() => [null]);

        if (applied) {
          return { ok: true, skipped: true, endpoint: endpointName, message: 'Already at version 011' };
        }
      }

      // 3. Execute all statements sequentially
      for (const stmt of statements) {
        await sql(stmt);
      }

      return { ok: true, skipped: false, endpoint: endpointName, statementsCount: statements.length };
    } catch (err) {
      const isTransient = /cold start|timeout|fetch failed|connection reset|ECONNRESET/i.test(err.message);
      if (attempt < maxAttempts && isTransient) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
        console.warn(`[~] [${endpointName}] Cold start / transient glitch (Attempt ${attempt}/${maxAttempts}). Retrying in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
      } else {
        return { ok: false, endpoint: endpointName, error: err.message, attempt };
      }
    }
  }
}

/**
 * Main migration entry point
 */
async function main() {
  console.log('================================================================');
  console.log('🚀 UNIVERSAL NEON FLEET PARITY MIGRATION ENGINE');
  console.log('   Target: 1 Hub + 99 Dynamic Shards (Total: 100 Databases)');
  console.log('================================================================');

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`[-] FATAL: Migration file not found: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = splitSqlStatements(sqlContent);
  console.log(`[*] Loaded ${statements.length} idempotent DDL statements from 011_universal_fleet_parity.sql\n`);

  // Phase 1: Migrate Hub
  console.log('[*] Phase 1: Migrating Central Hub Database...');
  const hubRes = await migrateEndpoint(DATABASE_URL, 'Neon Hub (Primary)', statements, { force: true });
  if (hubRes.ok) {
    console.log(`[+] Hub migrated successfully (${hubRes.statementsCount} statements executed).\n`);
  } else {
    console.error(`[-] CRITICAL: Failed to migrate Hub:`, hubRes.error);
    process.exit(1);
  }

  // Phase 2: Fetch Active Fleet Shards
  console.log('[*] Phase 2: Fetching active worker shards from neon_projects_registry...');
  const shards = await hubSql`
    SELECT id, project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE is_hub = FALSE AND status = 'active'
    ORDER BY id ASC;
  `;
  console.log(`[*] Discovered ${shards.length} active worker shards in registry.\n`);

  // Phase 3: Bounded Concurrency Batch Execution
  const CONCURRENCY_POOL = 10;
  const forceMode = process.argv.includes('--force');
  console.log(`[*] Phase 3: Executing shard migrations (Concurrency Pool: ${CONCURRENCY_POOL} parallel nodes, Force: ${forceMode})...`);
  
  const results = {
    total: shards.length,
    success: 0,
    skipped: 0,
    failed: 0,
    failures: []
  };

  const startTime = Date.now();

  for (let i = 0; i < shards.length; i += CONCURRENCY_POOL) {
    const batch = shards.slice(i, i + CONCURRENCY_POOL);
    const progress = Math.min(i + CONCURRENCY_POOL, shards.length);
    process.stdout.write(`[*] Migrating shards [${i + 1} - ${progress}] / ${shards.length}... `);

    const batchResults = await Promise.allSettled(
      batch.map(shard => migrateEndpoint(shard.database_url, shard.project_name, statements, { force: forceMode }))
    );

    let batchSuccess = 0;
    for (const res of batchResults) {
      if (res.status === 'fulfilled' && res.value.ok) {
        if (res.value.skipped) {
          results.skipped++;
        } else {
          results.success++;
        }
        batchSuccess++;
      } else {
        results.failed++;
        const errDetail = res.status === 'fulfilled' ? res.value : { error: res.reason?.message };
        results.failures.push(errDetail);
      }
    }

    console.log(`[Done: ${batchSuccess}/${batch.length}]`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log('🎉 FLEET PARITY MIGRATION COMPLETE');
  console.log(`   Execution Time:    ${durationSec}s`);
  console.log(`   Total Shards:      ${results.total}`);
  console.log(`   Successfully Updated: ${results.success}`);
  console.log(`   Already at Parity: ${results.skipped}`);
  console.log(`   Failed Shards:     ${results.failed}`);
  console.log('================================================================');

  if (results.failed > 0) {
    console.error('\n[-] Failure Details:');
    for (const f of results.failures) {
      console.error(`  - ${f.endpoint}: ${f.error}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate_all_shards.mjs')) {
  main().catch(err => {
    console.error('[-] Fatal Migration Runner Error:', err);
    process.exit(1);
  });
}
