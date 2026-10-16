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

  // 0. Drop obsolete backup table if still present on Hub
  try {
    await sql`DROP TABLE IF EXISTS _backup_keyword_displaced_pins;`;
  } catch (_) {}

  // 1. Prune keyword_pins_snapshots on Hub:
  //    a) Remove displaced rows (displaced vault is already persisted in keyword_serp_current & 99 Shards)
  //    b) Enforce strict 2-snapshot rolling window per keyword
  try {
    const deletedDisplaced = await sql`
      DELETE FROM keyword_pins_snapshots
      WHERE is_displaced = TRUE
        AND snapshot_date < (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '14 days'
      RETURNING id;
    `;
    const deleted = await sql`
      WITH ranked_dates AS (
        SELECT keyword_id, snapshot_date,
               DENSE_RANK() OVER (PARTITION BY keyword_id ORDER BY snapshot_date DESC) AS dr
        FROM (
          SELECT DISTINCT keyword_id, snapshot_date
          FROM keyword_pins_snapshots
          WHERE keyword_id IS NOT NULL
            AND COALESCE(is_displaced, FALSE) = FALSE
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
        AND COALESCE(kps.is_displaced, FALSE) = FALSE
        AND kps.snapshot_date < c.keep_from_date
      RETURNING kps.id;
    `;
    results.prunedSnapshots = deletedDisplaced.length + deleted.length;
  } catch (err) {
    console.warn('[optimizeHubStorage] Prune snapshots warning:', err.message);
  }

  // 2. Strip bloated JSONB keys ONLY on rows that actually contain them (prevents 100% table MVCC churn & WAL history bloat)
  try {
    const serpClean = await sql`
      UPDATE keyword_serp_current
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'visual_annotations' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['title','domain','destination_url','image_url','visual_annotations','raw_saves','crawled_at','created_at','created_at_pinterest','method','creation_method']
      RETURNING id;
    `;
    results.cleanedSerpMetadata = serpClean.length;

    const snapClean = await sql`
      UPDATE keyword_pins_snapshots
      SET metadata = metadata - 'title' - 'domain' - 'destination_url' - 'image_url' - 'raw_saves' - 'crawled_at' - 'created_at' - 'created_at_pinterest' - 'method' - 'creation_method'
      WHERE metadata IS NOT NULL
        AND metadata ?| array['title','domain','destination_url','image_url','raw_saves','crawled_at','created_at','created_at_pinterest','method','creation_method']
      RETURNING id;
    `;
    results.cleanedSnapMetadata = snapClean.length;

    await sql`
      UPDATE tracked_keywords
      SET metadata = jsonb_set(
        metadata,
        '{last_dropped_pins}',
        COALESCE(
          (
            SELECT jsonb_agg(elem)
            FROM (
              SELECT elem
              FROM jsonb_array_elements(metadata->'last_dropped_pins') AS elem
              ORDER BY (elem->>'dropped_at') DESC NULLS LAST
              LIMIT 100
            ) sub
          ),
          '[]'::jsonb
        )
      )
      WHERE metadata ? 'last_dropped_pins'
        AND jsonb_typeof(metadata->'last_dropped_pins') = 'array'
        AND jsonb_array_length(metadata->'last_dropped_pins') > 100;
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

  // 4. Non-blocking VACUUM (ANALYZE) on target tables using tagged templates
  try { await sql`VACUUM (ANALYZE) keyword_pins_snapshots;`; results.vacuumedTables.push('keyword_pins_snapshots'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) keyword_serp_current;`; results.vacuumedTables.push('keyword_serp_current'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) competitor_pins;`; results.vacuumedTables.push('competitor_pins'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) pa_pins;`; results.vacuumedTables.push('pa_pins'); } catch (_) {}
  try { await sql`VACUUM (ANALYZE) tracked_keywords;`; results.vacuumedTables.push('tracked_keywords'); } catch (_) {}

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
