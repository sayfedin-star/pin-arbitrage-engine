#!/usr/bin/env node

/**
 * scripts/resync_operational_hub_tables.mjs
 *
 * Fast Streaming Synchronization: Neon ➡️ InstaBox PostgreSQL
 * Deterministic pagination + clean tagged template insert.
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

const boxUrl = process.env.TARGET_DATABASE_URL || 'postgresql://postgres:pae_secure_password_2026@127.0.0.1:5432/pin_arbitrage';

const neonSql = neon(neonUrl);
const boxSql = postgres(boxUrl, { max: 10, idle_timeout: 20 });

const tableConfigs = {
  keyword_serp_current: {
    orderBy: 'id ASC',
    conflictKey: 'id'
  },
  keyword_displaced_index: {
    orderBy: 'keyword_id ASC, pin_id ASC',
    conflictKey: 'keyword_id, pin_id'
  },
  universal_master_pins: {
    orderBy: 'pin_id ASC',
    conflictKey: 'pin_id'
  },
  domain_intelligence_rollup: {
    orderBy: 'domain ASC',
    conflictKey: 'domain'
  }
};

async function syncTable(tableName, { batchSize = 1500 } = {}) {
  const startTime = Date.now();
  const cfg = tableConfigs[tableName];
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

  // Disable triggers temporarily and truncate
  await boxSql.unsafe(`ALTER TABLE ${tableName} DISABLE TRIGGER ALL;`).catch(() => {});
  await boxSql.unsafe(`TRUNCATE TABLE ${tableName};`);

  let offset = 0;
  let copied = 0;

  try {
    while (offset < totalRows) {
      const rows = await neonSql(`SELECT * FROM ${tableName} ORDER BY ${cfg.orderBy} LIMIT ${batchSize} OFFSET ${offset}`);
      if (!rows || rows.length === 0) break;

      // In-memory deduplication by conflict key to prevent Postgres 21000
      const dedupMap = new Map();
      for (const r of rows) {
        const clean = {};
        for (const col of cols) {
          if (r[col] !== undefined) {
            clean[col] = r[col];
          }
        }
        const key = cfg.conflictKey.split(',').map(k => String(clean[k.trim()] || '')).join('::');
        dedupMap.set(key, clean);
      }

      const cleanRows = Array.from(dedupMap.values());

      if (cleanRows.length > 0) {
        await boxSql`
          INSERT INTO ${boxSql(tableName)} ${boxSql(cleanRows)}
          ON CONFLICT DO NOTHING
        `;
      }

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
