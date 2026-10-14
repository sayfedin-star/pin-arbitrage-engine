#!/usr/bin/env node

/**
 * scripts/optimize_hub_storage.mjs
 * 
 * Automated Zero-Bloat Hub Maintenance & Storage Optimization Engine
 * 
 * Routinely maintains Central Metadata Hub storage < 65 MB:
 * 1. Prunes keyword_pins_snapshots using the relative 2-snapshot window per keyword.
 * 2. Compacts completed/failed rows in competitor_pins queue table.
 * 3. Strips bloated JSONB keys from Hub tables.
 * 4. Runs non-blocking VACUUM (ANALYZE) on target tables.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * @param {Function} sql - Neon client instance connected to Hub
 */
export async function optimizeHubStorage(sql) {
  if (!sql) throw new Error('optimizeHubStorage requires an active SQL client.');

  const results = {
    prunedSnapshots: 0,
    compactedCompetitors: 0,
    cleanedSerpMetadata: 0,
    cleanedSnapMetadata: 0,
    vacuumedTables: []
  };

  // 1. Prune keyword_pins_snapshots using relative 2-snapshot window per keyword
  try {
    const deleted = await sql`
      WITH ranked_dates AS (
        SELECT keyword_id, snapshot_date,
               DENSE_RANK() OVER (PARTITION BY keyword_id ORDER BY snapshot_date DESC) AS dr
        FROM (
          SELECT DISTINCT keyword_id, snapshot_date
          FROM keyword_pins_snapshots
          WHERE keyword_id IS NOT NULL
        ) d
      ),
      cutoff_per_keyword AS (
        SELECT keyword_id, MIN(snapshot_date) AS keep_from_date
        FROM ranked_dates
        WHERE dr <= 2
        GROUP BY keyword_id
      )
      DELETE FROM keyword_pins_snapshots kps
      USING cutoff_per_keyword c
      WHERE kps.keyword_id = c.keyword_id
        AND kps.snapshot_date < c.keep_from_date
      RETURNING kps.id;
    `;
    results.prunedSnapshots = deleted.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Prune snapshots warning:', err.message);
  }

  // 2. Strip bloated JSONB keys from Hub tables
  try {
    const serpClean = await sql`
      UPDATE keyword_serp_current
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'visual_annotations' - 'description' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method' - 'rich_metadata' - 'visual_objects'
      WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
      RETURNING id;
    `;
    results.cleanedSerpMetadata = serpClean.length;

    const snapClean = await sql`
      UPDATE keyword_pins_snapshots
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'description' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method' - 'rich_metadata' - 'visual_objects'
      WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
      RETURNING id;
    `;
    results.cleanedSnapMetadata = snapClean.length;

    await sql`
      UPDATE tracked_keywords
      SET metadata = metadata - 'last_dropped_pins'
      WHERE metadata ? 'last_dropped_pins';
    `;
  } catch (err) {
    console.warn('[optimizeHubStorage] Strip metadata warning:', err.message);
  }

  // 3. Compact completed/failed competitor pins queue
  try {
    const compacted = await sql`
      UPDATE competitor_pins
      SET description = NULL,
          alt_text = NULL,
          metadata = '{}'::jsonb
      WHERE enrichment_status IN ('completed', 'failed')
        AND (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb))
      RETURNING id;
    `;
    results.compactedCompetitors = compacted.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Compact competitor pins warning:', err.message);
  }

  // 4. Non-blocking VACUUM (ANALYZE) on target tables
  const targetTables = [
    'keyword_pins_snapshots',
    'keyword_serp_current',
    'competitor_pins',
    'pa_pins',
    'tracked_keywords'
  ];

  for (const tbl of targetTables) {
    try {
      await sql(`VACUUM (ANALYZE) ${tbl}`);
      results.vacuumedTables.push(tbl);
    } catch (_) {
      try {
        await sql(`ANALYZE ${tbl}`);
        results.vacuumedTables.push(`${tbl} (analyze only)`);
      } catch (_) {}
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

  const sql = neon(process.env.DATABASE_URL);
  console.log('[*] Running automated maintenance...');
  const res = await optimizeHubStorage(sql);

  console.log(`  ✓ Pruned older snapshots:         ${res.prunedSnapshots} rows`);
  console.log(`  ✓ Cleaned SERP metadata:          ${res.cleanedSerpMetadata} rows`);
  console.log(`  ✓ Cleaned Snapshot metadata:      ${res.cleanedSnapMetadata} rows`);
  console.log(`  ✓ Compacted competitor queue:     ${res.compactedCompetitors} rows`);
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
