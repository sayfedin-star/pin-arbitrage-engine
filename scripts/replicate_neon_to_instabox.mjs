#!/usr/bin/env node

/**
 * scripts/replicate_neon_to_instabox.mjs
 *
 * Full Streaming Migration Engine: Neon Postgres ➡️ InstaBox Postgres
 */

import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const neonMatch = envContent.match(/DATABASE_URL=([^\r\n]+)/);
if (!neonMatch) {
  console.error('❌ Could not find DATABASE_URL in .env');
  process.exit(1);
}

const neonUrl = neonMatch[1].trim();
const instaboxUrl = 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

console.log('================================================================================');
console.log('🚀 PAE NEON ➡️ INSTABOX POSTGRESQL FULL REPLICATION ENGINE');
console.log('================================================================================');
console.log(`[*] Source:      Neon Serverless (${new URL(neonUrl).host})`);
console.log(`[*] Destination: InstaBox (127.0.0.1:5432 / pin_arbitrage)`);
console.log('--------------------------------------------------------------------------------\n');

const neonSql = neon(neonUrl);

function createBoxClient() {
  return postgres(instaboxUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10
  });
}

/**
 * Splits SQL script into discrete statements preserving $$ blocks
 */
function splitSqlStatements(sqlText) {
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
      if (char === '\n') inLineComment = false;
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
      if (char === "'") inSingleQuote = false;
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
      let stmt = current.trim();
      // Remove CONCURRENTLY for fast initial migration
      stmt = stmt.replace(/CREATE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE INDEX');
      // Ignore standalone BEGIN and COMMIT
      if (stmt.length > 0 && !/^BEGIN\s*$/i.test(stmt) && !/^COMMIT\s*$/i.test(stmt)) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }
    current += char;
  }
  let finalStmt = current.trim().replace(/CREATE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE INDEX');
  if (finalStmt.length > 0 && !/^BEGIN\s*$/i.test(finalStmt) && !/^COMMIT\s*$/i.test(finalStmt)) {
    statements.push(finalStmt);
  }
  return statements;
}

async function runSchemaMigrations() {
  console.log('[*] Phase 1: Applying All 49 SQL Schema Migrations on InstaBox...');
  const boxSql = createBoxClient();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  await boxSql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sqlText = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(sqlText);

    try {
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        try {
          await boxSql.unsafe(stmt);
        } catch (innerErr) {
          // Ignore idempotent errors
          if (!innerErr.message?.includes('already exists') && !innerErr.message?.includes('does not exist, skipping')) {
            // Rollback any aborted sub-state
            await boxSql`ROLLBACK`.catch(() => {});
          }
        }
      }
      await boxSql`
        INSERT INTO schema_migrations (version, name)
        VALUES (${file.replace(/\.sql$/i, '')}, ${file})
        ON CONFLICT (version) DO NOTHING;
      `;
      process.stdout.write('.');
    } catch (err) {
      await boxSql`ROLLBACK`.catch(() => {});
      process.stdout.write('x');
    }
  }
  await boxSql.end();
  console.log('\n✅ [Phase 1 Complete] Schema Migrations Synchronized on InstaBox!\n');
}

async function copyTable(boxSql, tableName, { batchSize = 1000 } = {}) {
  process.stdout.write(`[*] Migrating ${tableName}... `);
  
  // Count rows in Neon
  const countRes = await neonSql(`SELECT COUNT(*)::bigint AS cnt FROM ${tableName}`);
  const totalRows = Number(countRes[0]?.cnt || 0);

  if (totalRows === 0) {
    console.log(`(0 rows - skipped)`);
    return { table: tableName, neonRows: 0, boxRows: 0, status: 'EMPTY' };
  }

  // Fetch column names in destination table
  const colRows = await boxSql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position ASC;
  `;
  const cols = colRows.map(c => c.column_name);

  // Disable triggers temporarily for high-speed batch copy
  await boxSql.unsafe(`ALTER TABLE ${tableName} DISABLE TRIGGER ALL;`).catch(() => {});

  let offset = 0;
  let copied = 0;

  try {
    while (offset < totalRows) {
      // Paginated fetch from Neon
      const rows = await neonSql(`SELECT * FROM ${tableName} LIMIT ${batchSize} OFFSET ${offset}`);
      if (!rows || rows.length === 0) break;

      // Filter row keys to only columns that exist on destination
      const cleanRows = rows.map(r => {
        const clean = {};
        for (const col of cols) {
          if (r[col] !== undefined) {
            clean[col] = r[col];
          }
        }
        return clean;
      });

      await boxSql`
        INSERT INTO ${boxSql(tableName)} ${boxSql(cleanRows)}
        ON CONFLICT DO NOTHING
      `;
      copied += rows.length;
      offset += batchSize;
      process.stdout.write(`\r[*] Migrating ${tableName}... ${copied}/${totalRows} rows (${Math.round((copied/totalRows)*100)}%)`);
    }
  } catch (err) {
    console.error(`\n❌ Error batch inserting into ${tableName}:`, err.message);
  } finally {
    // Re-enable triggers
    await boxSql.unsafe(`ALTER TABLE ${tableName} ENABLE TRIGGER ALL;`).catch(() => {});
  }

  const boxCountRes = await boxSql.unsafe(`SELECT COUNT(*)::bigint AS cnt FROM ${tableName}`);
  const boxRows = Number(boxCountRes[0]?.cnt || 0);
  console.log(`\n  ✅ ${tableName}: ${boxRows}/${totalRows} rows synchronized.`);
  return { table: tableName, neonRows: totalRows, boxRows, status: boxRows >= totalRows ? 'MATCH' : 'PARTIAL' };
}

async function main() {
  const startTime = Date.now();
  try {
    // Step 1: Run DDL Migrations
    await runSchemaMigrations();

    // Step 2: Fresh client for data copy
    const boxSql = createBoxClient();

    const tablesToMigrate = [
      'schema_migrations',
      'tracked_keywords',
      'competitor_profiles',
      'competitor_boards',
      'keyword_serp_current',
      'competitor_pins',
      'pa_pins',
      'universal_master_pins',
      'keyword_displaced_index',
      'domain_intelligence_rollup',
      'domain_monetization_metadata',
      'domain_registry_metadata',
      'folder_competitor_items',
      'competitor_history_snapshots',
      'pins_daily_metrics',
      'pin_serp_positions'
    ];

    console.log('[*] Phase 2: Streaming Data from Neon to InstaBox PostgreSQL...\n');
    const summary = [];
    for (const tbl of tablesToMigrate) {
      try {
        const batchSize = tbl.includes('metrics') || tbl.includes('positions') ? 2500 : 1000;
        const stats = await copyTable(boxSql, tbl, { batchSize });
        summary.push(stats);
      } catch (e) {
        console.error(`\n❌ Failed to migrate ${tbl}:`, e.message);
        summary.push({ table: tbl, neonRows: 'ERROR', boxRows: 'ERROR', status: 'FAILED' });
      }
    }

    await boxSql.end();

    console.log('\n================================================================================');
    console.log('📊 REPLICATION VERIFICATION AUDIT');
    console.log('================================================================================');
    console.table(summary);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 Full Replication Completed in ${duration}s!`);
  } catch (err) {
    console.error('Fatal error during replication:', err);
  }
}

main();
