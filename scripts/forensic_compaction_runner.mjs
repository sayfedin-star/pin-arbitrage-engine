import fs from 'node:fs';
import path from 'node:path';
import { createSqlClient } from '../src/db/client.mjs';

// Load .env
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}
const envPath = path.resolve(process.cwd(), '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
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

const sql = process.env.DATABASE_URL ? createSqlClient(process.env.DATABASE_URL) : null;

export async function getStorageBreakdown() {
  const [dbSizeRow] = await sql`
    SELECT 
      pg_database_size(current_database()) AS raw_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS pretty_size;
  `;

  const tables = await sql`
    SELECT
      c.relname AS table_name,
      COALESCE(s.n_live_tup, 0) AS n_live_tup,
      COALESCE(s.n_dead_tup, 0) AS n_dead_tup,
      pg_relation_size(c.oid) AS raw_heap,
      pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
      pg_indexes_size(c.oid) AS raw_indexes,
      pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
      (pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) AS raw_toast,
      pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) AS toast_size,
      pg_total_relation_size(c.oid) AS raw_total,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC;
  `;

  for (const t of tables) {
    try {
      const safeTable = String(t.table_name).replace(/"/g, '""');
      const countRes = await sql.unsafe(`SELECT COUNT(*)::bigint AS cnt FROM public."${safeTable}"`);
      t.exact_count = countRes[0]?.cnt ? Number(countRes[0].cnt) : 0;
    } catch (_) {
      t.exact_count = Number(t.n_live_tup);
    }
  }

  const indexes = await sql`
    SELECT
      i.indexrelname,
      i.relname AS table_name,
      i.idx_scan,
      pg_relation_size(i.indexrelid) AS raw_size,
      pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size
    FROM pg_stat_user_indexes i
    JOIN pg_class c ON c.oid = i.indexrelid
    ORDER BY pg_relation_size(i.indexrelid) DESC
    LIMIT 20;
  `;

  return { dbSizeRow, tables, indexes };
}

export function printAuditTable(title, { dbSizeRow, tables, indexes }) {
  console.log(`\n================================================================================`);
  console.log(`📊 ${title}`);
  console.log(`   TOTAL DATABASE SIZE: ${dbSizeRow.pretty_size} (${dbSizeRow.raw_bytes} bytes)`);
  console.log(`================================================================================`);
  console.log(
    'Table Name'.padEnd(28) +
    'Exact Count'.padStart(13) +
    'Live Tup'.padStart(11) +
    'Dead Tup'.padStart(11) +
    'Heap Size'.padStart(12) +
    'Index Size'.padStart(12) +
    'Toast Size'.padStart(12) +
    'Total Size'.padStart(12)
  );
  console.log('-'.repeat(111));

  for (const t of tables) {
    console.log(
      t.table_name.padEnd(28) +
      String(t.exact_count.toLocaleString()).padStart(13) +
      String(t.n_live_tup.toLocaleString()).padStart(11) +
      String(t.n_dead_tup.toLocaleString()).padStart(11) +
      t.heap_size.padStart(12) +
      t.indexes_size.padStart(12) +
      t.toast_size.padStart(12) +
      t.total_size.padStart(12)
    );
  }

  console.log(`\nTop 15 Largest Indexes:`);
  console.log('-'.repeat(80));
  console.log('Index Name'.padEnd(42) + 'Table'.padEnd(24) + 'Scans'.padStart(8) + 'Size'.padStart(10));
  console.log('-'.repeat(80));
  for (const idx of indexes.slice(0, 15)) {
    console.log(
      idx.indexrelname.padEnd(42) +
      idx.table_name.padEnd(24) +
      String(idx.idx_scan).padStart(8) +
      idx.index_size.padStart(10)
    );
  }
}

async function run() {
  console.log('[*] Connecting to live PostgreSQL database for Forensic Storage Audit & Compaction...');
  const current = await getStorageBreakdown();
  printAuditTable('CURRENT LIVE STORAGE STATUS', current);

  const rawBytes = Number(current.dbSizeRow.raw_bytes);
  const targetBytes = 200 * 1024 * 1024;
  if (rawBytes <= targetBytes) {
    console.log(`\n🎉 COMPACTION VERIFIED: Database size (${current.dbSizeRow.pretty_size}) is below the 200 MB mandate!`);
  } else {
    console.warn(`\n⚠️ Database size (${current.dbSizeRow.pretty_size}) exceeds 200 MB.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('forensic_compaction_runner.mjs')) {
  run().catch(err => {
    console.error('Audit runner error:', err);
    process.exit(1);
  });
}
