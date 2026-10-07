#!/usr/bin/env node

/**
 * Migration Runner for 012_keyword_folders_and_crossover.sql
 * Executes idempotent schema updates on:
 * 1. Neon Master Hub Database (process.env.DATABASE_URL)
 * 2. All active fleet worker shards in neon_projects_registry
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);
const MIGRATION_FILE = path.join(__dirname, 'migrations', '012_keyword_folders_and_crossover.sql');

function splitSqlStatements(sqlText) {
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
  try {
    for (const stmt of statements) {
      await sql(stmt);
    }
    // Verify tables exist
    const [foldersCheck] = await sql`
      SELECT to_regclass('keyword_folders') as tbl;
    `;
    const [itemsCheck] = await sql`
      SELECT to_regclass('keyword_folder_items') as tbl;
    `;
    const verified = Boolean(foldersCheck?.tbl && itemsCheck?.tbl);
    return { ok: true, endpoint: endpointName, verified };
  } catch (err) {
    return { ok: false, endpoint: endpointName, error: err.message };
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 MIGRATION 012: KEYWORD FOLDERS & CROSSOVER ENGINE');
  console.log('================================================================');

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`[-] FATAL: Migration file not found: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = splitSqlStatements(sqlContent);
  console.log(`[*] Loaded ${statements.length} idempotent DDL statements.\n`);

  // Phase 1: Migrate Hub
  console.log('[*] Phase 1: Migrating Central Hub Database...');
  const hubRes = await migrateEndpoint(DATABASE_URL, 'Neon Hub (Primary)', statements);
  if (hubRes.ok) {
    console.log(`[+] Hub migrated successfully! Verification: ${hubRes.verified ? 'VERIFIED (keyword_folders & keyword_folder_items exist)' : 'FAILED'}\n`);
  } else {
    console.error(`[-] CRITICAL: Failed to migrate Hub:`, hubRes.error);
    process.exit(1);
  }

  // Phase 2: Migrate Fleet Shards
  console.log('[*] Phase 2: Fetching active worker shards from neon_projects_registry...');
  let shards = [];
  try {
    shards = await hubSql`
      SELECT id, project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
    console.log(`[*] Discovered ${shards.length} active worker shards in registry.\n`);
  } catch (err) {
    console.warn(`[!] neon_projects_registry query warning: ${err.message}. Proceeding with Hub.`);
  }

  if (shards.length > 0) {
    console.log(`[*] Phase 3: Applying migration across ${shards.length} worker shards...`);
    const CONCURRENCY = 10;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < shards.length; i += CONCURRENCY) {
      const batch = shards.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (shard) => {
        const res = await migrateEndpoint(shard.database_url, shard.project_name || shard.project_id, statements);
        if (res.ok) {
          succeeded++;
        } else {
          console.warn(`[-] Failed shard ${shard.project_id}: ${res.error}`);
          failed++;
        }
      }));
      console.log(`    Progress: ${Math.min(i + CONCURRENCY, shards.length)}/${shards.length} shards processed.`);
    }

    console.log(`\n[✓] Fleet Migration Completed! Succeeded: ${succeeded}, Failed: ${failed}`);
  }

  console.log('\n[✓] Migration 012 execution finished successfully.');
}

run().catch((err) => {
  console.error('[-] Fatal error running migration:', err);
  process.exit(1);
});
