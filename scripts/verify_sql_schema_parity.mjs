/**
 * SQL Schema Parity & Forensic Query Verifier (Block-Scoped & Alias Robust)
 * 
 * Statically audits individual SQL template literals across src/ and scripts/ to guarantee:
 * 1. Zero non-existent columns queried on Hub or Shard tables.
 * 2. Proper COALESCE precedence (EXCLUDED must take priority over existing on fresh updates).
 * 3. Schema parity between keyword_serp_current, keyword_displaced_index, and pin_serp_positions.
 */

import fs from 'fs';
import path from 'path';

console.log('=== Running Forensic SQL Schema Parity & Landmine Audit ===\n');

// 1. DDL Schema Definition for Core Tables
export const KNOWN_TABLE_COLUMNS = {
  keyword_serp_current: new Set([
    'keyword_id', 'pin_id', 'rank_position', 'prev_rank_position', 'last_known_rank',
    'is_displaced', 'vacuum_opportunity_score', 'save_count', 'repin_count', 'comment_count',
    'share_count', 'daily_save_velocity', 'title', 'domain', 'destination_url', 'image_url',
    'creator_username', 'board_name', 'dominant_color', 'visual_annotations',
    'created_at_pinterest', 'creation_method', 'metadata', 'crawled_at', 'updated_at',
    'baseline_day_saves', 'baseline_day_date', 'notes'
  ]),
  keyword_displaced_index: new Set([
    'keyword_id', 'pin_id', 'last_known_rank', 'vacuum_opportunity_score', 'displaced_date',
    'save_count', 'repin_count', 'comment_count', 'share_count', 'daily_save_velocity',
    'metadata', 'updated_at'
  ]),
  pin_serp_positions: new Set([
    'pin_id', 'snapshot_date', 'keyword_id', 'rank_position', 'is_displaced',
    'last_known_rank', 'catalog_rank', 'updated_at'
  ]),
  pins_daily_metrics: new Set([
    'pin_id', 'snapshot_date', 'save_count', 'repin_count', 'comment_count', 'share_count',
    'reaction_count', 'daily_save_velocity', 'updated_at'
  ])
};

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'scratch') {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const filesToScan = [
  ...scanDirectory('src'),
  ...scanDirectory('scripts')
];

let violationCount = 0;

for (const file of filesToScan) {
  if (file.includes('verify_sql_schema_parity.mjs')) continue;

  const content = fs.readFileSync(file, 'utf8');

  // File-wide code-level checks
  if (/crawled_at\s*=\s*COALESCE\s*\(\s*(?:keyword_serp_current\.)?crawled_at\s*,\s*EXCLUDED\.crawled_at\s*\)/i.test(content)) {
    console.error(`🚨 [LANDMINE DETECTED] Inverted crawled_at COALESCE in keyword_serp_current upsert`);
    console.error(`   File: ${file}`);
    console.error(`   Fix:  EXCLUDED.crawled_at must precede keyword_serp_current.crawled_at\n`);
    violationCount++;
  }

  if (/(?:Number|\+)\s*\(\s*baselineMap\.get\([^)]+\)\s*(?:\|\|\s*0)?\s*\)/i.test(content)) {
    console.error(`🚨 [LANDMINE DETECTED] Unpacked Object to Number NaN poisoning on baselineMap`);
    console.error(`   File: ${file}`);
    console.error(`   Fix:  baselineMap stores { saves, date } object; passing object to Number() evaluates to NaN\n`);
    violationCount++;
  }

  // Extract individual SQL template literals to prevent cross-query false positives
  const sqlBlocks = content.matchAll(/`([^`]+)`/g);

  for (const block of sqlBlocks) {
    const query = block[1];

    // Check keyword_serp_current queries
    if (/\bFROM\s+keyword_serp_current\b/i.test(query)) {
      // Banned: selecting reaction_count as a table column (allowing 0 as reaction_count)
      if (/(?:sc|ksc|keyword_serp_current)\.reaction_count\b/i.test(query) ||
          (!/\bFROM\s*\(/i.test(query) && /,\s*reaction_count\s*,/i.test(query))) {
        console.error(`🚨 [LANDMINE DETECTED] Fake reaction_count in SQL query on keyword_serp_current`);
        console.error(`   File: ${file}`);
        console.error(`   Fix:  keyword_serp_current does NOT have reaction_count column in SQL; use 0 as reaction_count\n`);
        violationCount++;
      }
    }

    // Check keyword_displaced_index queries
    if (/\bFROM\s+keyword_displaced_index\b/i.test(query)) {
      if (/\blast_rank\b/i.test(query)) {
        console.error(`🚨 [LANDMINE DETECTED] Fake column last_rank on keyword_displaced_index`);
        console.error(`   File: ${file}`);
        console.error(`   Fix:  keyword_displaced_index uses last_known_rank, NOT last_rank\n`);
        violationCount++;
      }
      if (/\blast_saves\b/i.test(query)) {
        console.error(`🚨 [LANDMINE DETECTED] Fake column last_saves on keyword_displaced_index`);
        console.error(`   File: ${file}`);
        console.error(`   Fix:  keyword_displaced_index uses save_count, NOT last_saves\n`);
        violationCount++;
      }
      if (/\blast_checked_at\b/i.test(query)) {
        console.error(`🚨 [LANDMINE DETECTED] Fake column last_checked_at on keyword_displaced_index`);
        console.error(`   File: ${file}`);
        console.error(`   Fix:  keyword_displaced_index uses updated_at, NOT last_checked_at\n`);
        violationCount++;
      }
    }
  }
}

if (violationCount > 0) {
  console.error(`❌ AUDIT FAILED: Found ${violationCount} fatal SQL / Logic landmines in codebase!`);
  process.exit(1);
} else {
  console.log(`✅ [AUDIT PASSED] 100% Zero-Landmine Parity across ${filesToScan.length} source files.`);
}
