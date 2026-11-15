#!/usr/bin/env node

/**
 * scripts/optimize_hub_storage.mjs
 *
 * Automated Zero-Bloat Hub Maintenance & Storage Optimization Engine
 *
 * Routinely maintains Central Metadata Hub storage:
 * 1. Strips bloated JSONB keys from keyword_serp_positions and tracked_keywords.
 * 2. Runs non-blocking VACUUM (ANALYZE) on target SSOT tables.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqlClient } from '../src/db/client.mjs';

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
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

/**
 * Core Reusable Storage Optimizer
 * @param {Function} sql - Postgres client instance connected to Hub
 */
export async function optimizeHubStorage(sql) {
  if (!sql) throw new Error('optimizeHubStorage requires an active SQL client.');

  const results = {
    archivedDisplaced: 0,
    prunedSnapshots: 0,
    compactedCompetitors: 0,
    cleanedSerpMetadata: 0,
    cleanedKwMetadata: 0,
    vacuumedTables: []
  };

  // 1. Strip bloated JSONB keys ONLY on rows that actually contain them
  try {
    const serpClean = await sql`
      UPDATE keyword_serp_positions
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'raw_saves' - 'crawled_at' - 'created_at' - 'share_count' - 'dominant_color' - 'board_name' - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['title','domain','destination_url','image_url','raw_saves','crawled_at','created_at','share_count','dominant_color','board_name','description','alt_text','rich_metadata','visual_objects','seo_related_interests'];
    `.catch(() => []);
    results.cleanedSerpMetadata = serpClean.length || 0;

    const kwClean = await sql`
      UPDATE tracked_keywords
      SET metadata = COALESCE(metadata, '{}'::jsonb) - 'last_dropped_pins' - 'popular_pins' - 'crawl_lock'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['last_dropped_pins', 'popular_pins', 'crawl_lock'];
    `.catch(() => []);
    results.cleanedKwMetadata = kwClean.length || 0;
  } catch (err) {
    console.warn('[optimizeHubStorage] Strip metadata warning:', err.message);
  }

  // 2. Non-blocking VACUUM (ANALYZE) on target SSOT tables
  const tablesToVacuum = [
    ['universal_master_pins', () => sql`VACUUM (ANALYZE) universal_master_pins;`],
    ['pins_daily_metrics', () => sql`VACUUM (ANALYZE) pins_daily_metrics;`],
    ['keyword_serp_positions', () => sql`VACUUM (ANALYZE) keyword_serp_positions;`],
    ['competitor_board_pins', () => sql`VACUUM (ANALYZE) competitor_board_pins;`],
    ['tracked_keywords', () => sql`VACUUM (ANALYZE) tracked_keywords;`],
    ['competitor_profiles', () => sql`VACUUM (ANALYZE) competitor_profiles;`],
    ['competitor_boards', () => sql`VACUUM (ANALYZE) competitor_boards;`],
    ['competitor_history_snapshots', () => sql`VACUUM (ANALYZE) competitor_history_snapshots;`],
    ['domain_intelligence_rollup', () => sql`VACUUM (ANALYZE) domain_intelligence_rollup;`]
  ];
  for (const [tblName, vacFn] of tablesToVacuum) {
    try {
      await vacFn();
      results.vacuumedTables.push(tblName);
    } catch (vacErr) {
      console.warn(`[optimizeHubStorage] VACUUM (ANALYZE) note on ${tblName}:`, vacErr.message);
    }
  }

  return results;
}

async function main() {
  console.log('================================================================');
  console.log('🧹 ROUTINE ZERO-BLOAT HUB STORAGE OPTIMIZATION');
  console.log('================================================================\n');

  if (!process.env.DATABASE_URL) {
    console.error('[-] FATAL: DATABASE_URL not found.');
    process.exit(1);
  }

  const sql = createSqlClient(process.env.DATABASE_URL);
  console.log('[*] Running automated maintenance...');
  const res = await optimizeHubStorage(sql);

  console.log(`  ✓ Cleaned SERP metadata:          ${res.cleanedSerpMetadata} rows`);
  console.log(`  ✓ Cleaned Keyword TOAST metadata: ${res.cleanedKwMetadata} rows`);
  console.log(`  ✓ Vacuumed & analyzed tables:     ${res.vacuumedTables.join(', ')}`);
  console.log('\n================================================================');
  console.log('✓ ROUTINE STORAGE OPTIMIZATION COMPLETE');
  console.log('================================================================');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('Execution error:', err);
    process.exit(1);
  });
}
