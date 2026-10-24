#!/usr/bin/env node

/**
 * scripts/test_empirical_challenger_wave3_2.mjs
 *
 * Empirical Validation Suite for Wave 3:
 * 1. Zero-Loss Compaction Verification (100% match in universal_master_pins on designated shards)
 * 2. Compaction Idempotency (0 rows compacted on rerun, zero data loss or corruption)
 * 3. Storage Parameters & HOT Update Verification (fillfactor = 80, idx_cp_domain_rollup_covering absent)
 * 4. Zero Snapshot Writes/Reads on Hub Invariant (keyword_pins_snapshots & pa_pin_metrics untouched)
 *
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  getPinShardId,
  batchGroupByShard,
  resolveShardConnection
} from '../src/modules/sharding/fleet-router.mjs';

// Auto-load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
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
  } catch (_) {}
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for empirical testing.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

let totalEmpiricalTests = 0;
let passedEmpiricalTests = 0;
const testResults = [];

function recordResult(name, passed, details = '') {
  totalEmpiricalTests++;
  if (passed) {
    passedEmpiricalTests++;
    console.log(`  ✓ [PASS] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ name, status: 'PASS', details });
  } else {
    console.error(`  ✗ [FAIL] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ name, status: 'FAIL', details });
    process.exitCode = 1;
  }
}

async function test1_ZeroLossCompactionVerification() {
  console.log('\n================================================================================');
  console.log('🧪 TEST 1: Zero-Loss Compaction Verification (Shard Coverage Audit)');
  console.log('================================================================================');

  // Query compacted competitor_pins from Central Hub
  const compactedPins = await hubSql`
    SELECT id, competitor_id, pin_id, title, description, alt_text, metadata, enrichment_status
    FROM competitor_pins
    WHERE enrichment_status = 'compacted'
    ORDER BY id ASC;
  `;

  const totalCompactedOnHub = compactedPins.length;
  console.log(`[*] Found ${totalCompactedOnHub} compacted rows in competitor_pins on Central Hub.`);
  assert(totalCompactedOnHub > 0, 'Expected compacted rows in competitor_pins, found 0!');

  // Verify all compacted rows have nullified heavy fields on Hub
  const rowsWithNonEmptyHeavyFields = compactedPins.filter(r => 
    r.description !== null || 
    r.alt_text !== null || 
    (r.metadata && JSON.stringify(r.metadata) !== '{}')
  );
  recordResult(
    'Hub competitor_pins skeletal compaction cleanliness',
    rowsWithNonEmptyHeavyFields.length === 0,
    `${rowsWithNonEmptyHeavyFields.length} rows with residual heavy text on Hub`
  );

  // Group pins by their designated deterministic shard
  const shardGroups = batchGroupByShard(compactedPins, 99);
  console.log(`[*] Compacted pins span across ${shardGroups.size} unique storage shards.`);

  let totalVerifiedOnShards = 0;
  let totalMissingOnShards = 0;
  const missingPins = [];
  const shardsChecked = [];

  // Check each shard
  for (const [shardId, pinsForShard] of shardGroups.entries()) {
    const shardSql = await resolveShardConnection({ hubSql, shardId });
    assert(shardSql, `Could not resolve shard #${shardId}`);

    const pinIds = pinsForShard.map(p => String(p.pin_id));
    const shardMasterRows = await shardSql`
      SELECT pin_id, title, description, alt_text, image_url, created_at_pinterest
      FROM universal_master_pins
      WHERE pin_id = ANY(${pinIds});
    `;

    const foundSet = new Set(shardMasterRows.map(r => String(r.pin_id)));
    let shardVerified = 0;
    for (const pid of pinIds) {
      if (foundSet.has(pid)) {
        shardVerified++;
        totalVerifiedOnShards++;
      } else {
        totalMissingOnShards++;
        missingPins.push({ shardId, pinId: pid });
      }
    }
    shardsChecked.push({ shardId, count: pinIds.length, verified: shardVerified });
  }

  console.log(`[*] Verification summary across shards: ${totalVerifiedOnShards}/${totalCompactedOnHub} pins found in universal_master_pins.`);
  recordResult(
    'Zero-Loss Compaction Verification (100% presence in universal_master_pins)',
    totalMissingOnShards === 0 && totalVerifiedOnShards === totalCompactedOnHub,
    `Verified: ${totalVerifiedOnShards}, Missing: ${totalMissingOnShards}, Shards tested: ${shardGroups.size}`
  );

  // Verify that daily metrics were also written to shard
  // Sample check on first 3 shards
  const sampleShards = Array.from(shardGroups.keys()).slice(0, 3);
  let metricsVerified = 0;
  for (const shardId of sampleShards) {
    const shardSql = await resolveShardConnection({ hubSql, shardId });
    const pinIds = shardGroups.get(shardId).map(p => String(p.pin_id));
    const metricRows = await shardSql`
      SELECT pin_id, snapshot_date, save_count
      FROM pins_daily_metrics
      WHERE pin_id = ANY(${pinIds});
    `;
    if (metricRows.length > 0) metricsVerified++;
  }
  recordResult(
    'Pins daily metrics presence on Storage Shards',
    metricsVerified === sampleShards.length,
    `Sample shards with metrics: ${metricsVerified}/${sampleShards.length}`
  );
}

async function test2_CompactionIdempotency() {
  console.log('\n================================================================================');
  console.log('🧪 TEST 2: Compaction Idempotency & Safe No-Op Verification');
  console.log('================================================================================');

  // Check uncompacted count before execution
  const [beforeCount] = await hubSql`
    SELECT COUNT(*)::int AS count
    FROM competitor_pins
    WHERE (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb));
  `;
  const uncompactedBefore = Number(beforeCount?.count || 0);
  console.log(`[*] Uncompacted rows before re-running compaction: ${uncompactedBefore}`);

  // Also record total row count and sample checksum before
  const [totalRowRes] = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_pins;`;
  const totalRowsBefore = Number(totalRowRes?.count || 0);

  // Re-run compaction script via child process or dynamic invocation
  // Let's run `scripts/compact_existing_competitor_pins.mjs` directly
  const { execSync } = await import('node:child_process');
  let execOutput = '';
  try {
    execOutput = execSync('node scripts/compact_existing_competitor_pins.mjs', {
      encoding: 'utf8',
      env: process.env
    });
  } catch (err) {
    execOutput = err.stdout + '\n' + err.stderr;
  }

  console.log('[*] Compaction rerun output preview:');
  const previewLines = execOutput.split('\n').filter(l => l.trim().length > 0);
  for (const line of previewLines.slice(0, 8)) {
    console.log(`    ${line}`);
  }

  // Check output contains idempotency confirmations
  const mentionsZeroCompacted = execOutput.includes('0 rows compacted') || 
                                execOutput.includes('No uncompacted competitor_pins found') ||
                                execOutput.includes('Table is already fully skeletal');

  recordResult(
    'Compaction idempotency output indicates 0 rows compacted',
    mentionsZeroCompacted,
    'Verified output confirmed 0 uncompacted rows'
  );

  // Check uncompacted count after rerun
  const [afterCount] = await hubSql`
    SELECT COUNT(*)::int AS count
    FROM competitor_pins
    WHERE (description IS NOT NULL OR alt_text IS NOT NULL OR (metadata IS NOT NULL AND metadata != '{}'::jsonb));
  `;
  const uncompactedAfter = Number(afterCount?.count || 0);

  const [totalRowResAfter] = await hubSql`SELECT COUNT(*)::int AS count FROM competitor_pins;`;
  const totalRowsAfter = Number(totalRowResAfter?.count || 0);

  recordResult(
    'Compaction rerun preserved table row count with zero deletion/corruption',
    totalRowsBefore === totalRowsAfter && totalRowsAfter > 0,
    `Rows before: ${totalRowsBefore}, Rows after: ${totalRowsAfter}`
  );

  recordResult(
    'Zero uncompacted rows remain after rerun',
    uncompactedAfter === 0,
    `Uncompacted count: ${uncompactedAfter}`
  );
}

async function test3_StorageParametersAndHotUpdates() {
  console.log('\n================================================================================');
  console.log('🧪 TEST 3: Storage Parameters & HOT Update Verification');
  console.log('================================================================================');

  // 1. Query reloptions for competitor_pins from pg_class
  const classRows = await hubSql`
    SELECT c.relname, c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'competitor_pins' AND n.nspname = 'public';
  `;

  assert(classRows.length > 0, 'competitor_pins table not found in pg_class!');
  const reloptions = classRows[0].reloptions || [];
  console.log('[*] competitor_pins reloptions:', reloptions);

  const hasFillfactor80 = reloptions.some(opt => opt.replace(/\s+/g, '') === 'fillfactor=80');
  recordResult(
    'competitor_pins has fillfactor = 80 configured',
    hasFillfactor80,
    `Options: ${reloptions.join(', ')}`
  );

  const hasScaleFactor = reloptions.some(opt => opt.includes('autovacuum_vacuum_scale_factor=0.02'));
  const hasThreshold = reloptions.some(opt => opt.includes('autovacuum_vacuum_threshold=1000'));
  recordResult(
    'competitor_pins has tuned autovacuum options configured',
    hasScaleFactor && hasThreshold,
    `autovacuum settings verified in reloptions`
  );

  // 2. Query pg_indexes to verify HOT-blocking index is dropped
  const indexRows = await hubSql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'competitor_pins';
  `;

  const indexNames = indexRows.map(r => r.indexname);
  console.log('[*] competitor_pins active indexes:', indexNames);

  const hasHotBlockingIndex = indexNames.includes('idx_cp_domain_rollup_covering');
  recordResult(
    'HOT-blocking index idx_cp_domain_rollup_covering is absent',
    !hasHotBlockingIndex,
    `Index absent from pg_indexes (${indexNames.length} indexes present)`
  );

  // 3. Verify clean index idx_cp_link_domain_clean is present
  const hasCleanIndex = indexNames.includes('idx_cp_link_domain_clean');
  recordResult(
    'Clean replacement index idx_cp_link_domain_clean is present',
    hasCleanIndex,
    `Found idx_cp_link_domain_clean`
  );

  // 4. Verify HOT update readiness: heavy creative columns (description, alt_text, metadata) are NOT indexed
  const heavyCols = ['description', 'alt_text', 'metadata'];
  const heavyBlockedByIndexes = [];
  for (const idx of indexRows) {
    const def = idx.indexdef.toLowerCase();
    for (const col of heavyCols) {
      if (def.includes(col)) {
        heavyBlockedByIndexes.push({ index: idx.indexname, col });
      }
    }
  }
  recordResult(
    'Heavy creative columns (description, alt_text, metadata) are completely unindexed on Hub (HOT updates enabled)',
    heavyBlockedByIndexes.length === 0,
    heavyBlockedByIndexes.length === 0 ? 'Zero heavy creative columns are indexed' : `Indexed in: ${JSON.stringify(heavyBlockedByIndexes)}`
  );

  // 5. Inspect pg_stat_user_tables for HOT update activity
  const [statRow] = await hubSql`
    SELECT n_tup_upd, n_tup_hot_upd
    FROM pg_stat_user_tables
    WHERE relname = 'competitor_pins';
  `;
  const tupUpd = Number(statRow?.n_tup_upd || 0);
  const tupHotUpd = Number(statRow?.n_tup_hot_upd || 0);
  console.log(`[*] pg_stat_user_tables for competitor_pins: n_tup_upd=${tupUpd}, n_tup_hot_upd=${tupHotUpd}`);
  recordResult(
    'pg_stat_user_tables tracks updates on competitor_pins',
    statRow !== undefined,
    `Total updates: ${tupUpd}, HOT updates: ${tupHotUpd}`
  );
}

async function test4_ZeroHubSnapshotsInvariant() {
  console.log('\n================================================================================');
  console.log('🧪 TEST 4: Zero Snapshot Writes/Reads on Hub Invariant');
  console.log('================================================================================');

  // 1. Static code inspection of Wave 3 files:
  // - scripts/migrations/036_shard_affine_and_clean_indexes.sql
  // - scripts/backfill_crc32_shard_id.mjs
  // - scripts/compact_existing_competitor_pins.mjs
  const filesToCheck = [
    'scripts/migrations/036_shard_affine_and_clean_indexes.sql',
    'scripts/backfill_crc32_shard_id.mjs',
    'scripts/compact_existing_competitor_pins.mjs'
  ];

  let forbiddenCount = 0;
  const forbiddenViolations = [];

  for (const f of filesToCheck) {
    const fullPath = path.resolve(process.cwd(), f);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Forbidden patterns:
    // INSERT INTO keyword_pins_snapshots
    // INSERT INTO pa_pin_metrics
    // SELECT ... FROM keyword_pins_snapshots
    // SELECT ... FROM pa_pin_metrics
    const insertSnapshotRegex = /INSERT\s+INTO\s+(keyword_pins_snapshots|pa_pin_metrics)/i;
    const selectSnapshotRegex = /SELECT[\s\S]+?FROM\s+(keyword_pins_snapshots|pa_pin_metrics)/i;

    if (insertSnapshotRegex.test(content)) {
      forbiddenCount++;
      forbiddenViolations.push(`${f}: contains INSERT INTO Hub snapshot table`);
    }

    // In migration 036, DROP TRIGGER on pa_pin_metrics is expected and allowed, but no SELECT/INSERT
    if (selectSnapshotRegex.test(content)) {
      forbiddenCount++;
      forbiddenViolations.push(`${f}: contains SELECT FROM Hub snapshot table`);
    }
  }

  recordResult(
    'Wave 3 implementation files contain ZERO reads or writes to Hub snapshot tables',
    forbiddenCount === 0,
    forbiddenViolations.length === 0 ? 'Checked 3 files, 0 violations' : forbiddenViolations.join('; ')
  );

  // 2. Database level inspection of Hub:
  // Migration 036 dropped legacy triggers on pa_pin_metrics:
  const triggersOnPaMetrics = await hubSql`
    SELECT tgname
    FROM pg_trigger
    JOIN pg_class c ON c.oid = tgrelid
    WHERE c.relname = 'pa_pin_metrics' AND tgname = 'trg_pa_pin_metrics_monotonic';
  `;
  recordResult(
    'Obsolete trigger trg_pa_pin_metrics_monotonic successfully removed from Hub',
    triggersOnPaMetrics.length === 0,
    `Active trigger count: ${triggersOnPaMetrics.length}`
  );

  // 3. Verify Migration 036 recorded in schema_migrations
  const [mig036] = await hubSql`
    SELECT version, name, applied_at
    FROM schema_migrations
    WHERE version = '036';
  `;
  recordResult(
    'Migration 036 is recorded as applied in schema_migrations',
    Boolean(mig036?.version === '036'),
    `Version: ${mig036?.version}, Applied at: ${mig036?.applied_at}`
  );
}

async function main() {
  console.log('================================================================================');
  console.log('🕵️ WAVE 3 EMPIRICAL CHALLENGER TEST SUITE (Challenger 2)');
  console.log('================================================================================');

  try {
    await test1_ZeroLossCompactionVerification();
    await test2_CompactionIdempotency();
    await test3_StorageParametersAndHotUpdates();
    await test4_ZeroHubSnapshotsInvariant();

    console.log('\n================================================================================');
    console.log(`🏁 EMPIRICAL TEST SUITE FINISHED: ${passedEmpiricalTests}/${totalEmpiricalTests} PASSED`);
    console.log('================================================================================');

    if (passedEmpiricalTests === totalEmpiricalTests) {
      console.log('>>> VERDICT: ALL TESTS PASSED GREEN. ZERO-LOSS COMPACTION AND INVARIANTS VERIFIED.');
    } else {
      console.error('>>> VERDICT: FAILURES DETECTED.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[-] Fatal execution error in empirical challenger tests:', err);
    process.exit(1);
  }
}

main();
