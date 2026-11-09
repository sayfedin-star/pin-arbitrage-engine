#!/usr/bin/env node

/**
 * scripts/resync_operational_hub_tables.mjs
 *
 * Fast Streaming Synchronization: Neon ➡️ InstaBox PostgreSQL
 * Refreshes operational tables with post-crawl Nov 9 state:
 * - keyword_serp_current (6,050 rows)
 * - keyword_displaced_index (22,505 rows)
 * - universal_master_pins (80,057 rows)
 * - domain_intelligence_rollup (4,185 rows)
 */

import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let neonUrl = process.env.SOURCE_DATABASE_URL || null;
if (!neonUrl) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const neonMatch = envContent.match(/NEON_DATABASE_URL=([^\r\n]+)/) || envContent.match(/DATABASE_URL=([^\r\n]+)/);
    if (neonMatch && neonMatch[1].includes('.neon.tech')) {
      neonUrl = neonMatch[1].trim();
    }
  }
}

if (!neonUrl) {
  neonUrl = 'postgresql://neondb_owner:npg_ZtNkg4DhfW6l@ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';
}
// On InstaBox: postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage
const boxUrl = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(neonUrl);
const boxSql = postgres(boxUrl, { max: 10, idle_timeout: 20 });

async function syncTable(tableName, { batchSize = 1000 } = {}) {
  const startTime = Date.now();
  console.log(`\n============================================================`);
  console.log(`[*] Synchronizing ${tableName}...`);
  console.log(`============================================================`);

  const [countRes] = await neonSql(`SELECT COUNT(*)::bigint AS cnt FROM ${tableName}`);
  const totalRows = Number(countRes?.cnt || 0);
  console.log(`[Neon] Total source rows: ${totalRows}`);

  if (totalRows === 0) {
    console.log(`[!] Table is empty on source, skipping.`);
    return;
  }

  // Fetch destination columns
  const colRows = await boxSql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position ASC;
  `;
  const cols = colRows.map(c => c.column_name);

  // Disable triggers and truncate destination
  await boxSql.unsafe(`ALTER TABLE ${tableName} DISABLE TRIGGER ALL;`).catch(() => {});
  await boxSql.unsafe(`TRUNCATE TABLE ${tableName};`);

  let offset = 0;
  let copied = 0;

  try {
    while (offset < totalRows) {
      const rows = await neonSql(`SELECT * FROM ${tableName} ORDER BY 1 ASC LIMIT ${batchSize} OFFSET ${offset}`);
      if (!rows || rows.length === 0) break;

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
      `;

      copied += rows.length;
      offset += batchSize;
      const pct = Math.round((copied / totalRows) * 100);
      process.stdout.write(`\r[*] ${tableName}: ${copied}/${totalRows} rows (${pct}%)`);
    }
  } finally {
    await boxSql.unsafe(`ALTER TABLE ${tableName} ENABLE TRIGGER ALL;`).catch(() => {});
  }

  const [boxRes] = await boxSql.unsafe(`SELECT COUNT(*)::bigint AS cnt FROM ${tableName}`);
  const boxRows = Number(boxRes?.cnt || 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ ${tableName} synchronized: ${boxRows}/${totalRows} rows in ${elapsed}s.`);
}

async function main() {
  const overallStart = Date.now();
  console.log('🚀 Starting Operational Hub Tables Synchronization (Neon ➡️ InstaBox)...');

  const tablesToSync = [
    'keyword_serp_current',
    'keyword_displaced_index',
    'universal_master_pins',
    'domain_intelligence_rollup'
  ];

  for (const table of tablesToSync) {
    await syncTable(table);
  }

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n🎉 All operational hub tables successfully synchronized in ${totalElapsed}s!`);
  await boxSql.end();
}

main().catch(err => {
  console.error('\n❌ Synchronization failed:', err);
  process.exit(1);
});
