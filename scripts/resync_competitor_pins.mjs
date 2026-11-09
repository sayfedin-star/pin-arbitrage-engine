#!/usr/bin/env node

/**
 * scripts/resync_competitor_pins.mjs
 *
 * Fast Streaming Synchronization of competitor_pins, competitor_seed_pins, competitor_related_nodes
 * Neon ➡️ InstaBox PostgreSQL
 */

import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

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

async function syncTable(tableName, cols, orderBy = 'id ASC', batchSize = 1000) {
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

  let offset = 0;
  let copied = 0;

  while (offset < totalRows) {
    const rows = await neonSql(`SELECT ${cols.join(', ')} FROM ${tableName} ORDER BY ${orderBy} LIMIT ${batchSize} OFFSET ${offset}`);
    if (!rows || rows.length === 0) break;

    // Deduplicate in-memory to prevent PostgreSQL 21000
    const cleanRows = [];
    const seen = new Set();
    for (const r of rows) {
      const key = tableName === 'competitor_pins' ? `${r.competitor_id}:${r.pin_id}` : (r.id || JSON.stringify(r));
      if (!seen.has(key)) {
        seen.add(key);
        const clean = {};
        for (const col of cols) {
          if (r[col] !== undefined) {
            clean[col] = r[col];
          }
        }
        cleanRows.push(clean);
      }
    }

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

  const [boxRes] = await boxSql.unsafe(`SELECT COUNT(*)::bigint AS cnt FROM ${tableName}`);
  const boxRows = Number(boxRes?.cnt || 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ ${tableName} synchronized: ${boxRows}/${totalRows} rows in ${elapsed}s.`);
}

async function main() {
  const overallStart = Date.now();
  console.log('🚀 Starting Competitor Pins Synchronization (Neon ➡️ InstaBox)...');

  // 1. competitor_pins
  const cpCols = [
    'id', 'competitor_id', 'pin_id', 'title', 'description', 'link_domain',
    'destination_url', 'board_name', 'image_url', 'save_count', 'repin_count',
    'comment_count', 'created_at_pinterest', 'first_seen_at', 'last_seen_at',
    'metadata', 'is_product', 'alt_text', 'enrichment_status', 'updated_at',
    'enrich_attempts', 'claim_token', 'board_slug', 'is_deleted', 'shard_id'
  ];
  await syncTable('competitor_pins', cpCols, 'id ASC', 1000);

  // 2. competitor_seed_pins
  const cspCols = [
    'id', 'competitor_id', 'pin_id', 'title', 'image_url', 'board_name',
    'save_count', 'created_at', 'last_crawled_at'
  ];
  await syncTable('competitor_seed_pins', cspCols, 'id ASC', 1000);

  // 3. competitor_related_nodes
  const crnCols = [
    'id', 'competitor_id', 'seed_pin_id', 'candidate_pin_id', 'title',
    'image_url', 'dominant_color', 'saves', 'repins', 'domain',
    'destination_url', 'is_product', 'is_same_account', 'creator_username',
    'creator_name', 'provenance_engine', 'discovered_at'
  ];
  await syncTable('competitor_related_nodes', crnCols, 'id ASC', 1000);

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n🎉 All competitor child tables successfully synchronized in ${totalElapsed}s!`);
  await boxSql.end();
}

main().catch(err => {
  console.error('\n❌ Synchronization failed:', err);
  process.exit(1);
});
