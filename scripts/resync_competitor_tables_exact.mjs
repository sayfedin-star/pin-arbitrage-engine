#!/usr/bin/env node

/**
 * scripts/resync_competitor_tables_exact.mjs
 *
 * Fast Streaming Synchronization: Neon ➡️ InstaBox PostgreSQL
 * Fixes timezone shift on competitor_history_snapshots (recorded_date::text)
 * and syncs all 5,611 competitor_profiles, 18,183 boards, and folder items.
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

// Helper function to sync a table in batches
async function syncTable(tableName, selectQuery, cols, orderBy = 'id ASC', batchSize = 1500) {
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
    const rows = await neonSql(`${selectQuery} ORDER BY ${orderBy} LIMIT ${batchSize} OFFSET ${offset}`);
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
  console.log('🚀 Starting Competitor Tables Synchronization (Neon ➡️ InstaBox)...');

  // Disable FK triggers & truncate in safe order
  console.log('[*] Truncating competitor tables on InstaBox...');
  await boxSql.unsafe(`
    TRUNCATE TABLE 
      folder_competitor_items,
      competitor_history_snapshots,
      competitor_boards,
      competitor_profiles
    CASCADE;
  `);

  // 1. competitor_profiles
  const profCols = [
    'id', 'username', 'display_name', 'avatar_url', 'bio', 'website_url',
    'monthly_reach', 'reach_delta_7d', 'profile_views', 'views_delta_7d',
    'total_pins', 'total_boards', 'follower_count', 'following_count',
    'account_type', 'activity_status', 'last_synced_at', 'is_active',
    'tags', 'metadata', 'created_at', 'updated_at', 'last_harvest_metadata',
    'tracking_mode', 'custom_label', 'source_folder_id', 'delta_reach_24h',
    'delta_views_24h', 'delta_pins_24h', 'delta_boards_24h', 'pins_delta_7d',
    'boards_delta_7d'
  ];
  await syncTable('competitor_profiles', 'SELECT * FROM competitor_profiles', profCols, 'id ASC');

  // 2. competitor_boards
  const boardCols = [
    'id', 'competitor_id', 'board_id', 'name', 'url', 'pin_count',
    'follower_count', 'last_pinned_at', 'metadata', 'created_at', 'updated_at'
  ];
  await syncTable('competitor_boards', 'SELECT * FROM competitor_boards', boardCols, 'id ASC');

  // 3. competitor_history_snapshots (CRITICAL: recorded_date::text to prevent -1 day timezone shift!)
  const snapCols = [
    'id', 'competitor_id', 'monthly_reach', 'profile_views', 'follower_count',
    'total_pins', 'total_boards', 'recorded_date', 'metadata', 'created_at'
  ];
  const snapSelect = `
    SELECT 
      id, competitor_id, monthly_reach, profile_views, follower_count,
      total_pins, total_boards, recorded_date::text AS recorded_date, metadata, created_at
    FROM competitor_history_snapshots
  `;
  await syncTable('competitor_history_snapshots', snapSelect, snapCols, 'id ASC');

  // 4. folder_competitor_items
  const fciCols = ['id', 'folder_id', 'competitor_id', 'added_at', 'custom_label', 'source'];
  await syncTable('folder_competitor_items', 'SELECT * FROM folder_competitor_items', fciCols, 'id ASC');

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n🎉 All competitor tables successfully synchronized with exact dates in ${totalElapsed}s!`);
  await boxSql.end();
}

main().catch(err => {
  console.error('\n❌ Competitor synchronization failed:', err);
  process.exit(1);
});
