#!/usr/bin/env node

/**
 * scripts/migrate.mjs
 *
 * Canonical Unified Migration Runner for Pin Arbitrage Engine (PAE)
 * Applies SQL schema migrations sequentially from scripts/migrations/
 * while tracking idempotent execution status and SHA-256 checksums in schema_migrations.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSqlClient } from '../src/db/client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env in Node runtime (skipped in test mode to prevent live DB side effects)
const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.ENVIRONMENT === 'test';
const envPath = path.resolve(process.cwd(), '.env');
if (!isTestRuntime && fs.existsSync(envPath)) {
  try {
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
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (_) {}
}

if (!isTestRuntime && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

/**
 * Check if a statement has any executable SQL tokens (ignoring comments and whitespace).
 */
export function hasExecutableSql(stmt) {
  if (!stmt) return false;
  const stripped = stmt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();
  return stripped.length > 0;
}

/**
 * Splits SQL script into discrete statements preserving $$ blocks, $tag$ blocks,
 * string literals (with SQL escapes), line comments (--), and block comments (/* *\/).
 */
export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let inLineComment = false;
  let inBlockComment = false;

  const len = sqlText.length;
  for (let i = 0; i < len; i++) {
    const char = sqlText[i];
    const nextChar = i + 1 < len ? sqlText[i + 1] : '';

    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (inDollarQuote) {
      if (char === '$' && sqlText.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        inDollarQuote = false;
        dollarTag = '';
        continue;
      }
      current += char;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'" && nextChar === "'") {
        current += "'";
        i++;
        continue;
      }
      if (char === '\\' && nextChar === "'") {
        current += "'";
        i++;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      current += '--';
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += '/*';
      i++;
      continue;
    }

    if (char === '$') {
      const match = sqlText.slice(i).match(/^(\$[A-Za-z0-9_]*\$)/);
      if (match) {
        dollarTag = match[1];
        inDollarQuote = true;
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === ';') {
      const stmt = current.trim();
      if (hasExecutableSql(stmt)) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const finalStmt = current.trim();
  if (hasExecutableSql(finalStmt)) {
    statements.push(finalStmt);
  }

  return statements;
}

/**
 * Calculates SHA-256 checksum of SQL migration content.
 */
export function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ensures schema_migrations tracking table exists on the target database.
 */
export async function ensureSchemaMigrationsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

/**
 * Retrieves Map of currently applied migrations from schema_migrations.
 * Fails closed (throws) on SQL errors after connection and stores strictly one Map entry per unique version
 * so `applied.size` reflects exact unique applied versions (secondary name index lives on `applied.byName`).
 */
export async function getAppliedMigrations(sql) {
  await ensureSchemaMigrationsTable(sql);
  const rows = await sql`
    SELECT version, name, checksum, applied_at
    FROM schema_migrations
    ORDER BY version ASC;
  `;
  const map = new Map();
  const byName = new Map();
  for (const r of rows) {
    const v = String(r.version || '').trim();
    if (!v) continue;
    const n = String(r.name || '').trim();
    const entry = {
      version: v,
      name: n,
      checksum: r.checksum,
      applied_at: r.applied_at
    };
    map.set(v, entry);
    if (n) {
      byName.set(n, entry);
    }
  }
  Object.defineProperty(map, 'byName', {
    value: byName,
    enumerable: false,
    configurable: true
  });
  return map;
}

/**
 * Checks if a migration is already applied in schema_migrations.
 * Requires matching name when both stored entry and target migration define a name,
 * preventing pre-squash legacy versions ('001:core_registry', '002:competitor_intelligence')
 * from falsely shadowing squashed canonical migrations ('001:baseline_schema', '002:wave2_hygiene_and_unification').
 */
export function findAppliedMigration(appliedMap, migration) {
  if (!appliedMap || appliedMap.size === 0 || !migration) return null;
  const byName = appliedMap.byName instanceof Map ? appliedMap.byName : null;
  const baseName = migration.filename ? migration.filename.replace(/\.sql$/i, '') : null;

  const lookupByName = (candidateName) => {
    if (!candidateName) return null;
    if (byName && byName.has(candidateName)) return byName.get(candidateName);
    for (const entry of appliedMap.values()) {
      if (entry && entry.name === candidateName) return entry;
    }
    return null;
  };

  // 1. Direct version match (verified against migration name when present)
  if (migration.version && appliedMap.has(migration.version)) {
    const entry = appliedMap.get(migration.version);
    if (
      !migration.name ||
      !entry.name ||
      entry.name === migration.name ||
      entry.name === migration.filename ||
      (baseName && entry.name === baseName)
    ) {
      return entry;
    }
  }

  // 2. Known aliases
  if (Array.isArray(migration.aliases)) {
    for (const alias of migration.aliases) {
      if (appliedMap.has(alias)) {
        const aliasEntry = appliedMap.get(alias);
        if (
          !migration.name ||
          !aliasEntry.name ||
          aliasEntry.name === migration.name ||
          aliasEntry.name === alias ||
          (baseName && aliasEntry.name === baseName)
        ) {
          return aliasEntry;
        }
      }
      const aliasHit = lookupByName(alias);
      if (aliasHit) return aliasHit;
    }
  }

  // 3. Name match
  const nameHit = lookupByName(migration.name);
  if (nameHit) return nameHit;

  // 4. Filename stem match without .sql
  if (baseName) {
    if (appliedMap.has(baseName)) return appliedMap.get(baseName);
    const stemHit = lookupByName(baseName);
    if (stemHit) return stemHit;
  }
  return null;
}

/**
 * Discovers and naturally sorts SQL migration files in the migrations directory,
 * computing exact SHA-256 checksums for each file.
 */
export function getMigrationFiles(migrationsDir = path.join(__dirname, 'migrations')) {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.split('_')[0], 10);
      const numB = parseInt(b.split('_')[0], 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });

  return files.map(filename => {
    const filepath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    const checksum = calculateChecksum(content);
    const numPrefix = parseInt(filename.split('_')[0], 10);
    const numericPrefix = isNaN(numPrefix) ? null : numPrefix;
    const match = filename.match(/^(\d+)_(.*)\.sql$/i);
    const stem = filename.replace(/\.sql$/i, '');
    const version = match ? match[1] : stem;
    const name = match ? match[2] : stem;
    return {
      filename,
      filepath,
      version,
      name,
      checksum,
      aliases: [stem],
      numericPrefix
    };
  });
}

export const discoverMigrations = getMigrationFiles;

/**
 * Executes a single migration file against the database endpoint with cold-start retries.
 */
export async function applyMigration(sql, migration, { dryRun = false, maxRetries = 3 } = {}) {
  const content = fs.readFileSync(migration.filepath, 'utf8');
  const checksum = calculateChecksum(content);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would apply migration ${migration.version} (${migration.filename}) [checksum: ${checksum.slice(0, 8)}...]`);
    return { success: true, dryRun: true, version: migration.version, checksum };
  }

  const statements = splitSqlStatements(content);
  console.log(`  [*] Applying migration ${migration.version}: ${migration.filename} (${statements.length} statements)...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (typeof sql.begin === 'function' && typeof sql.unsafe === 'function') {
        await sql.begin(async (tx) => {
          for (const stmt of statements) {
            const cleanToken = stmt
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/--.*$/gm, '')
              .trim();
            if (/^(BEGIN|COMMIT)(\s+TRANSACTION)?$/i.test(cleanToken)) continue;
            await tx.unsafe(stmt);
          }
        });
      } else {
        for (const stmt of statements) {
          if (typeof sql.unsafe === 'function') {
            await sql.unsafe(stmt);
          } else {
            await sql(stmt);
          }
        }
      }

      await sql`
        INSERT INTO schema_migrations (version, name, checksum, applied_at)
        VALUES (${migration.version}, ${migration.name}, ${checksum}, NOW())
        ON CONFLICT (version) DO UPDATE SET
          name = EXCLUDED.name,
          checksum = EXCLUDED.checksum,
          applied_at = NOW();
      `;

      console.log(`  ✓ [PASS] Migration ${migration.version} successfully applied.`);
      return { success: true, version: migration.version, checksum, statementsCount: statements.length };
    } catch (err) {
      const isTransient = /cold start|timeout|fetch failed|connection reset|ECONNRESET/i.test(err.message);
      if (attempt < maxRetries && isTransient) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1);
        console.warn(`  [~] Transient database cold start (Attempt ${attempt}/${maxRetries}). Retrying in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
      } else {
        console.error(`  ❌ [FAIL] Migration ${migration.version} failed:`, err.message);
        throw err;
      }
    }
  }
}

/**
 * Runs all pending migrations sequentially against the target database.
 */
export async function runMigrations({
  dbUrl = process.env.DATABASE_URL,
  migrationsDir = path.join(__dirname, 'migrations'),
  dryRun = false,
  force = false,
  upToVersion = null,
  singleFile = null,
  sqlClient = null
} = {}) {
  if (!dbUrl && !sqlClient) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  let sql = null;
  try {
    sql = sqlClient || createSqlClient(dbUrl);

    let applied;
    try {
      applied = await getAppliedMigrations(sql);
    } catch (connErr) {
      if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(connErr.message)) {
        console.warn('================================================================================');
        console.warn('🏛️  PIN ARBITRAGE ENGINE: CANONICAL MIGRATION RUNNER');
        console.warn('================================================================================');
        console.warn(`[!] Target Database:     ${String(dbUrl || '').replace(/:[^:@]+@/, ':***@')}`);
        console.warn(`[!] Status:              Database is offline or unreachable (${connErr.message}).`);
        console.warn('    Schema migrations will be applied when the database container boots up.');
        console.warn('================================================================================\n');
        return { applied: 0, skipped: 0, total: 0, offline: true };
      }
      throw connErr;
    }

    const allFiles = getMigrationFiles(migrationsDir);

    console.log('================================================================================');
    console.log('🏛️  PIN ARBITRAGE ENGINE: CANONICAL MIGRATION RUNNER');
    console.log('================================================================================');
    console.log(`[*] Target Database:     ${String(dbUrl || '').replace(/:[^:@]+@/, ':***@')}`);
    console.log(`[*] Migrations Directory: ${migrationsDir}`);
    console.log(`[*] Discovered Files:    ${allFiles.length}`);
    console.log(`[*] Currently Applied:   ${applied.size}`);
    if (dryRun) console.log('[*] Mode:                DRY RUN (no changes committed)');
    if (upToVersion) console.log(`[*] Target Version Cap:  ${upToVersion}`);
    console.log('--------------------------------------------------------------------------------\n');

    let targetFiles = allFiles;
    if (singleFile) {
      const cleanSearch = singleFile.trim();
      targetFiles = allFiles.filter(f =>
        f.filename === cleanSearch ||
        f.version === cleanSearch ||
        (f.aliases && f.aliases.includes(cleanSearch)) ||
        f.filename.replace(/\.sql$/i, '') === cleanSearch
      );
      if (targetFiles.length === 0) {
        throw new Error(`Migration file or version '${singleFile}' not found in ${migrationsDir}`);
      }
    }

    const results = {
      applied: 0,
      skipped: 0,
      total: targetFiles.length,
      details: []
    };

    for (const mig of targetFiles) {
      if (upToVersion) {
        const numMig = mig.numericPrefix ?? parseInt(mig.version, 10);
        const numTarget = parseInt(upToVersion, 10);
        if (!isNaN(numMig) && !isNaN(numTarget) && numMig > numTarget) {
          console.log(`  [-] Reached target cap ${upToVersion}. Halting migrations.`);
          break;
        }
      }

      const appliedEntry = findAppliedMigration(applied, mig);
      const isApplied = Boolean(appliedEntry);
      if (isApplied && !force) {
        console.log(`  - [SKIPPED] Migration ${mig.version} (${mig.filename}) already applied at ${appliedEntry.applied_at}`);
        results.skipped++;
        results.details.push({ version: mig.version, status: 'skipped' });
        continue;
      }

      const res = await applyMigration(sql, mig, { dryRun, force });
      results.applied++;
      results.details.push({ version: mig.version, status: 'applied', ...res });
    }

    console.log('\n================================================================================');
    console.log(`🏁 MIGRATION RUN COMPLETE: ${results.applied} applied, ${results.skipped} skipped, ${results.total} total.`);
    console.log('================================================================================\n');

    return results;
  } finally {
    if (sql && typeof sql.end === 'function') {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }
}

/**
 * Lists all migration files and their status against schema_migrations.
 */
export async function listMigrations({
  dbUrl = process.env.DATABASE_URL,
  migrationsDir = path.join(__dirname, 'migrations'),
  sqlClient = null
} = {}) {
  if (!dbUrl && !sqlClient) {
    throw new Error('DATABASE_URL is required to list migrations.');
  }

  let sql = null;
  try {
    sql = sqlClient || createSqlClient(dbUrl);
    const applied = await getAppliedMigrations(sql);
    const allFiles = getMigrationFiles(migrationsDir);

    console.log('================================================================================');
    console.log('📋 MIGRATION STATUS REPORT');
    console.log('================================================================================\n');

    for (const mig of allFiles) {
      const app = findAppliedMigration(applied, mig);
      if (app) {
        console.log(`  ✅ [APPLIED] ${mig.version.padEnd(16)} ${mig.filename.padEnd(50)} (Applied: ${app.applied_at})`);
      } else {
        console.log(`  ⏳ [PENDING] ${mig.version.padEnd(16)} ${mig.filename.padEnd(50)}`);
      }
    }

    console.log('\n================================================================================\n');
    return { appliedCount: applied.size, totalFiles: allFiles.length };
  } finally {
    if (sql && typeof sql.end === 'function') {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const isList = args.includes('--list') || args.includes('--status');

  const upToArg = args.find(a => a.startsWith('--up-to='));
  const upToVersion = upToArg ? upToArg.split('=')[1] : null;

  const fileArg = args.find(a => a.startsWith('--file='));
  const singleFile = fileArg ? fileArg.split('=')[1] : null;

  const urlArg = args.find(a => a.startsWith('--url='));
  const dbUrl = urlArg ? urlArg.split('=')[1] : process.env.DATABASE_URL;

  if (isList) {
    listMigrations({ dbUrl })
      .then(() => process.exit(0))
      .catch(err => {
        console.error('[-] Fatal error listing migrations:', err.message);
        process.exit(1);
      });
  } else {
    runMigrations({ dbUrl, dryRun, force, upToVersion, singleFile })
      .then(() => process.exit(0))
      .catch(err => {
        console.error('[-] Fatal error running migrations:', err.message);
        process.exit(1);
      });
  }
}
