#!/usr/bin/env node

/**
 * scripts/migrate.mjs
 *
 * Canonical Unified Migration Runner for Pin Arbitrage Engine (PAE)
 * Applies SQL schema migrations sequentially from scripts/migrations/
 * while tracking idempotent execution status in schema_migrations.
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
import { fileURLToPath } from 'node:url';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env in Node runtime
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
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

if (typeof process.loadEnvFile === 'function') {
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

    // If currently inside a single-line comment (-- ...)
    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // If currently inside a block comment (/* ... */)
    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    // If currently inside a dollar-quoted string ($tag$ ... $tag$ or $$ ... $$)
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

    // If currently inside a single-quoted string (' ... ')
    if (inSingleQuote) {
      current += char;
      // Handle SQL escaped single quote: '' or \'
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

    // --- NORMAL CODE CONTEXT ---

    // 1. Line comment start: --
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      current += '--';
      i++;
      continue;
    }

    // 2. Block comment start: /*
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += '/*';
      i++;
      continue;
    }

    // 3. Dollar quote start: $$ or $tag$
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

    // 4. Single quote start: '
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    // 5. Statement delimiter: ;
    if (char === ';') {
      const stmt = current.trim();
      if (hasExecutableSql(stmt)) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    // Regular character
    current += char;
  }

  const finalStmt = current.trim();
  if (hasExecutableSql(finalStmt)) {
    statements.push(finalStmt);
  }

  return statements;
}

/**
 * Canonical special versions for migrations with shared numeric prefixes or custom names in schema_migrations.
 * Guarantees zero version collisions and zero false-pending flags on live database.
 */
export const CANONICAL_SPECIAL_VERSIONS = {
  '009_crawler_shard_heartbeats.sql': {
    version: '009_heartbeats',
    name: 'crawler_shard_heartbeats',
    aliases: ['009_heartbeats', '009_crawler_shard_heartbeats', 'crawler_shard_heartbeats']
  },
  '009_keyword_guided_capsules.sql': {
    version: '009_capsules',
    name: 'keyword_guided_capsules',
    aliases: ['009_capsules', '009_keyword_guided_capsules', 'keyword_guided_capsules']
  },
  '029_domain_monetization_metadata.sql': {
    version: '029',
    name: 'domain_monetization_metadata',
    aliases: ['029', 'domain_monetization_metadata']
  },
  '029_keyword_snapshots_not_null_displaced.sql': {
    version: '029_displaced',
    name: 'keyword_snapshots_not_null_displaced',
    aliases: ['029_displaced', 'keyword_snapshots_not_null_displaced']
  },
  '038_campaign_workspace_scoping.sql': {
    version: '038',
    name: '038_campaign_workspace_scoping.sql',
    aliases: ['038', '038_campaign_workspace_scoping.sql', '038_campaign_workspace_scoping']
  },
  '038_pa_pins_competitor_pins_shard_id.sql': {
    version: '038_shard_id',
    name: '038_pa_pins_competitor_pins_shard_id',
    aliases: ['038_shard_id', '038_pa_pins_competitor_pins_shard_id', 'pa_pins_competitor_pins_shard_id']
  },
  '042_hot_and_schema_compaction.sql': {
    version: '042',
    name: '042_hot_and_schema_compaction',
    aliases: ['042', '042_hot_and_schema_compaction', 'hot_and_schema_compaction']
  }
};

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
 * Retrieves Map of currently applied migrations from schema_migrations,
 * indexing by primary version and by name for drift-free lookup.
 */
export async function getAppliedMigrations(sql) {
  try {
    await ensureSchemaMigrationsTable(sql);
    const rows = await sql`
      SELECT version, name, checksum, applied_at
      FROM schema_migrations
      ORDER BY version ASC;
    `;
    const map = new Map();
    for (const r of rows) {
      const v = String(r.version).trim();
      const n = String(r.name || '').trim();
      const entry = {
        version: v,
        name: n,
        checksum: r.checksum,
        applied_at: r.applied_at
      };
      map.set(v, entry);
      if (n) {
        map.set(`name:${n}`, entry);
      }
    }
    return map;
  } catch (err) {
    console.warn('[-] Warning reading schema_migrations:', err.message);
    return new Map();
  }
}

/**
 * Robust matcher checking if a migration is already applied in schema_migrations.
 * Matches by primary version, canonical aliases, name, or filename stem.
 */
export function findAppliedMigration(appliedMap, migration) {
  if (!appliedMap || appliedMap.size === 0 || !migration) return null;
  // 1. Direct version match (e.g. '001', '029', '029_displaced', '009_heartbeats')
  if (migration.version && appliedMap.has(migration.version)) {
    return appliedMap.get(migration.version);
  }
  // 2. Known aliases
  if (Array.isArray(migration.aliases)) {
    for (const alias of migration.aliases) {
      if (appliedMap.has(alias)) return appliedMap.get(alias);
      if (appliedMap.has(`name:${alias}`)) return appliedMap.get(`name:${alias}`);
    }
  }
  // 3. Name match (e.g. 'name:crawler_shard_heartbeats', 'name:domain_monetization_metadata')
  if (migration.name && appliedMap.has(`name:${migration.name}`)) {
    return appliedMap.get(`name:${migration.name}`);
  }
  // 4. Filename base match without .sql
  const baseName = migration.filename ? migration.filename.replace(/\.sql$/i, '') : null;
  if (baseName && appliedMap.has(`name:${baseName}`)) {
    return appliedMap.get(`name:${baseName}`);
  }
  return null;
}

/**
 * Discovers and naturally sorts SQL migration files in the migrations directory.
 */
export function getMigrationFiles(migrationsDir = path.join(__dirname, 'migrations')) {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      // Natural sort by numeric prefix e.g. 001, 002, ..., 029, 029_displaced, 035
      const numA = parseInt(a.split('_')[0], 10);
      const numB = parseInt(b.split('_')[0], 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });

  return files.map(filename => {
    const special = CANONICAL_SPECIAL_VERSIONS[filename];
    const numPrefix = parseInt(filename.split('_')[0], 10);
    const numericPrefix = isNaN(numPrefix) ? null : numPrefix;

    if (special) {
      return {
        filename,
        filepath: path.join(migrationsDir, filename),
        version: special.version,
        name: special.name,
        aliases: special.aliases || [],
        numericPrefix
      };
    }

    const match = filename.match(/^(\d+)_(.*)\.sql$/i);
    const version = match ? match[1] : filename.replace(/\.sql$/i, '');
    const name = match ? match[2] : filename.replace(/\.sql$/i, '');
    return {
      filename,
      filepath: path.join(migrationsDir, filename),
      version,
      name,
      aliases: [filename.replace(/\.sql$/i, '')],
      numericPrefix
    };
  });
}

export const discoverMigrations = getMigrationFiles;

/**
 * Calculates SHA-256 checksum of SQL migration content.
 */
export function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Executes a single migration file against the database endpoint with cold-start retries.
 */
export async function applyMigration(sql, migration, { dryRun = false, force = false, maxRetries = 3 } = {}) {
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
      for (const stmt of statements) {
        // Execute each discrete statement
        await sql(stmt);
      }

      // Record in schema_migrations
      await sql`
        INSERT INTO schema_migrations (version, name, checksum, applied_at)
        VALUES (${migration.version}, ${migration.name}, ${checksum}, NOW())
        ON CONFLICT (version) DO UPDATE SET
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
  singleFile = null
} = {}) {
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const pooledUrl = enforceNeonPoolerUrl(dbUrl);
  const sql = neon(pooledUrl);

  await ensureSchemaMigrationsTable(sql);
  const applied = await getAppliedMigrations(sql);
  const allFiles = getMigrationFiles(migrationsDir);

  console.log('================================================================================');
  console.log('🏛️  PIN ARBITRAGE ENGINE: CANONICAL MIGRATION RUNNER');
  console.log('================================================================================');
  console.log(`[*] Target Database:     ${pooledUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`[*] Migrations Directory: ${migrationsDir}`);
  console.log(`[*] Discovered Files:    ${allFiles.length}`);
  console.log(`[*] Currently Applied:   ${applied.size}`);
  if (dryRun) console.log(`[*] Mode:                DRY RUN (no changes committed)`);
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
}

/**
 * Lists all migration files and their status against schema_migrations.
 */
export async function listMigrations({
  dbUrl = process.env.DATABASE_URL,
  migrationsDir = path.join(__dirname, 'migrations')
} = {}) {
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to list migrations.');
  }

  const pooledUrl = enforceNeonPoolerUrl(dbUrl);
  const sql = neon(pooledUrl);
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
    listMigrations({ dbUrl }).catch(err => {
      console.error('[-] Fatal error listing migrations:', err.message);
      process.exit(1);
    });
  } else {
    runMigrations({ dbUrl, dryRun, force, upToVersion, singleFile }).catch(err => {
      console.error('[-] Fatal error running migrations:', err.message);
      process.exit(1);
    });
  }
}
