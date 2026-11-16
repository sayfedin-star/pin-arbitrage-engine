import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  evaluateCanonicalHydrationRules,
  detectHydrationJump,
  isMultiStageHydrationJump,
  isRepinHydrationJump,
  calculateVelocityAcceleration,
  computeAnscombeInflectionScore,
  computeCrossPillarConvictionScore
} from '../src/lib/math.mjs';

import {
  normalizeCleanDomain,
  resolveCanonicalPinTitle,
  isSyntheticGarbageTitle,
  extractCanonicalAnnotations
} from '../src/domain/pin-intelligence.mjs';

import {
  MIGRATION_062_EXPECTED_INDEXES,
  MIGRATION_062_DROPPED_INDEXES,
  MIGRATION_064_EXPECTED_INDEXES,
  MIGRATION_064_DROPPED_INDEXES,
  CANONICAL_FUNCTION_SIGNATURES
} from '../scripts/verify_sql_schema_parity.mjs';

import {
  ingestPinsBatch,
  syncPinAcrossAllFourPillars
} from '../src/modules/pins/repository.mjs';

test('Phase 5.1: Migration 062 DDL, Canonical Registration & Index Parity', () => {
  const m62Path = path.resolve(process.cwd(), 'scripts/migrations/062_ssot_hot_tuning_and_functions.sql');
  assert.ok(fs.existsSync(m62Path), 'Migration 062 file must exist');

  const m62Content = fs.readFileSync(m62Path, 'utf8');

  // 1. Recreates mv_pulse_24h_summary with strict 24h hydration filtering
  assert.match(m62Content, /CREATE MATERIALIZED VIEW public\.mv_pulse_24h_summary/i);
  assert.match(m62Content, /ump\.is_hydrated = TRUE/i);
  assert.match(m62Content, /ROUND\(AVG\(ump\.daily_save_velocity\)::numeric,\s*2\)/i);
  assert.match(m62Content, /CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id/i);

  // 2. Consolidates pa_topic_clusters_page
  assert.match(m62Content, /CREATE OR REPLACE FUNCTION public\.pa_topic_clusters_page/i);
  assert.match(m62Content, /DISTINCT ON \(e\.pin_id, LOWER\(e\.raw_topic\)\)/i);
  assert.match(m62Content, /ROUND\(AVG\(d\.velocity\)::numeric,\s*2\)/i);

  // 3. Drops HOT-blocking indexes
  for (const dropped of MIGRATION_062_DROPPED_INDEXES) {
    assert.match(m62Content, new RegExp(`DROP INDEX IF EXISTS public\\.${dropped}`, 'i'), `Must drop ${dropped}`);
  }

  // 4. Creates 20-worker modulo partition indexes and GIN
  assert.match(m62Content, /idx_ump_visual_annotations_gin/i);
  assert.match(m62Content, /idx_ump_hashtext_mod20/i);
  assert.match(m62Content, /idx_ksp_hashtext_mod20/i);
  assert.match(m62Content, /idx_cbp_hashtext_mod20/i);

  // 5. scripts/migrate.mjs registration
  const migrateContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrate.mjs'), 'utf8');
  assert.match(migrateContent, /'062_ssot_hot_tuning_and_functions\.sql':/i);
  assert.match(migrateContent, /'064_cleanup_and_index_hygiene\.sql':/i);

  // 6. scripts/ensure_indexes.mjs synchronization
  const ensureContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/ensure_indexes.mjs'), 'utf8');
  for (const dropped of MIGRATION_062_DROPPED_INDEXES) {
    assert.match(ensureContent, new RegExp(`DROP INDEX IF EXISTS ${dropped}`, 'i'), `ensure_indexes must drop ${dropped}`);
  }
  assert.match(ensureContent, /idx_ump_hashtext_mod20/i);
  assert.match(ensureContent, /idx_ksp_hashtext_mod20/i);
  assert.match(ensureContent, /idx_cbp_hashtext_mod20/i);
  assert.match(ensureContent, /idx_ump_destination_url_md5/i);
  assert.match(ensureContent, /DROP INDEX IF EXISTS idx_ump_visual_annotations_gin/i);
});

test('Phase 5.2: Canonical Math SSOT - evaluateCanonicalHydrationRules & calculateVelocityAcceleration', () => {
  // Test 1: evaluateCanonicalHydrationRules suppresses jumps
  const isJump = evaluateCanonicalHydrationRules(5000, 50, 0, 0);
  assert.strictEqual(isJump, true, 'Low baseline to high saves must evaluate as jump');

  // Test 2: detectHydrationJump with objects (prev, curr)
  const isObjJump = detectHydrationJump(
    { save_count: 50, recorded_date: '2026-11-14' },
    { save_count: 5000, recorded_date: '2026-11-15' }
  );
  assert.strictEqual(isObjJump, true, 'detectHydrationJump with objects must detect jump');

  // Test 3: Authentic growth is preserved
  const isAuthentic = evaluateCanonicalHydrationRules(520, 500, 50, 48);
  assert.strictEqual(isAuthentic, false, 'Normal delta must not be flagged as jump');

  // Test 4: calculateVelocityAcceleration positional and pin object signatures
  const accelFromPin = calculateVelocityAcceleration({
    daily_save_velocity: 25,
    gains_7d: 140,
    created_at_pinterest: new Date(Date.now() - 30 * 86400000).toISOString()
  });
  assert.ok(typeof accelFromPin === 'number', 'Acceleration must return a number');
  assert.ok(isFinite(accelFromPin), 'Acceleration must be finite');

  const accelPositional = calculateVelocityAcceleration(25, 140, { isGains7d: true, ageDays: 30 });
  assert.ok(typeof accelPositional === 'number', 'Positional acceleration must return a number');
  assert.ok(Math.abs(accelFromPin - accelPositional) < 0.1, 'Object and positional calls should produce matching values');

  const anscombeTelemetry = computeAnscombeInflectionScore({
    daily_save_velocity: 45,
    gains_7d: 70,
    daily_repin_velocity: 12,
    pin_age_days: 30
  });
  assert.strictEqual(typeof anscombeTelemetry, 'object');
  assert.ok(Number.isFinite(anscombeTelemetry.anscombe_z_gain));
  assert.ok(Number.isFinite(anscombeTelemetry.repin_lead_score));
  assert.ok(Number.isFinite(anscombeTelemetry.acceleration_score));
  assert.ok(anscombeTelemetry.breakout_score >= 0 && anscombeTelemetry.breakout_score <= 100);

  const conviction = computeCrossPillarConvictionScore({
    seedOverlapCount: 3,
    dailyVelocity: 30,
    saves: 2500,
    serpRank: 2,
    serpKeywordsCount: 4,
    isSerpRanked: true,
    domainAgeDays: 180
  });
  assert.ok(conviction.conviction_score > 50);
  assert.strictEqual(conviction.pillar_convergence_count, 4);
  assert.strictEqual(conviction.convergence_tier, 'HIGH_CONVICTION_QUAD_PILLAR');
});

test('Phase 5.3: Domain Intelligence SSOT - canonicalization & garbage detection', () => {
  // normalizeCleanDomain
  assert.strictEqual(normalizeCleanDomain('https://www.Pinterest.com/pin/123/'), 'pinterest.com');
  assert.strictEqual(normalizeCleanDomain('WWW.RecipeTinEats.COM'), 'recipetineats.com');
  assert.strictEqual(normalizeCleanDomain('x.com', { strictFqdn: true }), 'x.com');
  assert.strictEqual(normalizeCleanDomain('t.co', { strictFqdn: true }), 't.co');

  // isSyntheticGarbageTitle
  assert.strictEqual(isSyntheticGarbageTitle('Untitled Pin'), true);
  assert.strictEqual(isSyntheticGarbageTitle('https://www.example.com/page'), true);
  assert.strictEqual(isSyntheticGarbageTitle('9876543210'), true);
  assert.strictEqual(isSyntheticGarbageTitle('Authentic Tuscan Garlic Bread'), false);

  // resolveCanonicalPinTitle falls back to description when title is synthetic
  const title = resolveCanonicalPinTitle({
    title: 'Untitled Pin',
    description: 'Delicious Creamy Garlic Pasta recipe'
  });
  assert.strictEqual(title, 'Delicious Creamy Garlic Pasta recipe');

  // extractCanonicalAnnotations (lowercase by default, Title Case when requested)
  const annotations = extractCanonicalAnnotations([
    { name: 'Pasta' },
    'Dinner Ideas',
    { name: 'Italian Food' },
    { name: '' },
    null
  ]);
  assert.deepStrictEqual(annotations, ['pasta', 'dinner ideas', 'italian food']);

  const titleCaseAnnotations = extractCanonicalAnnotations([
    { name: 'Pasta' },
    'dinner ideas'
  ], { titleCase: true });
  assert.deepStrictEqual(titleCaseAnnotations, ['Pasta', 'Dinner Ideas']);
});

test('Phase 5.4: Function Signatures & Dropped Index Registry Contract', () => {
  assert.ok(MIGRATION_062_EXPECTED_INDEXES.has('idx_mv_pulse_24h_summary_id'));
  assert.ok(MIGRATION_062_EXPECTED_INDEXES.has('idx_ump_hashtext_mod20'));
  assert.ok(MIGRATION_062_EXPECTED_INDEXES.has('idx_ksp_hashtext_mod20'));
  assert.ok(MIGRATION_062_EXPECTED_INDEXES.has('idx_cbp_hashtext_mod20'));
  assert.ok(MIGRATION_064_EXPECTED_INDEXES.has('idx_ksp_pin_id'));
  assert.ok(MIGRATION_064_EXPECTED_INDEXES.has('idx_ump_destination_url_md5'));
  assert.ok(MIGRATION_064_EXPECTED_INDEXES.has('idx_ump_is_hydrated'));

  assert.ok(MIGRATION_062_DROPPED_INDEXES.has('idx_ump_last_scraped_at_desc'));
  assert.ok(MIGRATION_062_DROPPED_INDEXES.has('idx_ump_updated_at_desc'));
  assert.ok(MIGRATION_062_DROPPED_INDEXES.has('idx_ksp_displaced_updated_desc'));
  assert.ok(MIGRATION_062_DROPPED_INDEXES.has('idx_pdm_pin_recorded_desc'));
  assert.ok(MIGRATION_064_DROPPED_INDEXES.has('idx_ump_visual_annotations_gin'));
  assert.ok(MIGRATION_064_DROPPED_INDEXES.has('idx_ump_destination_url'));
  assert.ok(MIGRATION_064_DROPPED_INDEXES.has('idx_ksp_pin_displaced_rank'));
  assert.ok(!MIGRATION_064_DROPPED_INDEXES.has('idx_ksp_pin_id'));

  const topicClustersSpec = CANONICAL_FUNCTION_SIGNATURES.pa_topic_clusters_page;
  assert.strictEqual(topicClustersSpec.args.length, 5);
  assert.deepStrictEqual(topicClustersSpec.args, ['p_min_pins', 'p_search', 'p_limit', 'p_offset', 'p_account']);
  assert.ok(topicClustersSpec.returnColumns.has('topic_name'));
  assert.ok(topicClustersSpec.returnColumns.has('avg_velocity'));
});

test('Phase 5.5: ingestPinsBatch delta guards cannot be bypassed and syncPinAcrossAllFourPillars uses bigint casts', () => {
  const repoContent = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pins/repository.mjs'), 'utf8');
  assert.doesNotMatch(repoContent, /COALESCE\(cb\.delta_saves_24h,\s*cb\.true_delta_saves_24h\)/);
  assert.doesNotMatch(repoContent, /COALESCE\(cb\.delta_repins_24h,\s*cb\.true_delta_repins_24h\)/);
  assert.match(repoContent, /cb\.true_delta_saves_24h,\s*\n\s*cb\.true_delta_repins_24h,/);
  assert.match(repoContent, /WHEN eb\.delta_saves_24h IS NOT NULL THEN LEAST\(25000::bigint,\s*GREATEST\(0::bigint,\s*eb\.delta_saves_24h\)\)/);
  assert.match(repoContent, /delta_saves_24h = CASE WHEN \$\{syncVelocity\} IS NOT NULL THEN ROUND\(\$\{syncVelocity\}::numeric\)::bigint ELSE delta_saves_24h END/);
  assert.match(repoContent, /delta_repins_24h = COALESCE\(\$\{syncRepinsDelta\}::bigint,\s*delta_repins_24h\)/);
});

test('Phase 5.6: Unhydrated NULL preservation, dominant_color null hygiene, and Migration 064 index parity', async () => {
  const m64Content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrations/064_cleanup_and_index_hygiene.sql'), 'utf8');
  assert.match(m64Content, /DROP INDEX IF EXISTS public\.idx_ksp_pin_displaced_rank;/i);
  assert.match(m64Content, /CREATE INDEX IF NOT EXISTS idx_ksp_pin_id\b/i);
  assert.doesNotMatch(m64Content, /DROP INDEX IF EXISTS public\.idx_ksp_pin_id;/i);

  const captured = [];
  const mockSql = (strings, ...values) => {
    const sqlText = strings.join('?').replace(/\s+/g, ' ').trim();
    const jsonPayloads = values
      .filter((v) => typeof v === 'string' && v.startsWith('['))
      .map((v) => JSON.parse(v));
    captured.push({ sqlText, values, jsonPayloads });
    if (sqlText.includes('INSERT INTO universal_master_pins')) return Promise.resolve([{ is_inserted: true }]);
    return Promise.resolve([]);
  };
  mockSql.begin = async (cb) => cb(mockSql);
  mockSql.noRetry = mockSql;

  await ingestPinsBatch(mockSql, [
    { pin_id: 'unhydrated_1', saves: null, repins: null, is_hydrated: false, dominant_color: '#888888' },
    { pin_id: 'multi_board_1', competitor_id: 7, board_id: 'b1', board_name: 'Board A', saves: 10 },
    { pin_id: 'multi_board_1', competitor_id: 7, board_id: 'b2', board_name: 'Board B', saves: 15, dominant_color: '#10b981' }
  ], { pillar: 'creator_hub' });

  const umpCall = captured.find((c) => c.sqlText.includes('INSERT INTO universal_master_pins'));
  const rows = umpCall.jsonPayloads[0];
  const unhydratedRow = rows.find((r) => r.pin_id === 'unhydrated_1');
  const multiRow = rows.find((r) => r.pin_id === 'multi_board_1');

  assert.strictEqual(unhydratedRow.save_count, null);
  assert.strictEqual(unhydratedRow.repin_count, null);
  assert.strictEqual(unhydratedRow.is_hydrated, false);
  assert.strictEqual(unhydratedRow.daily_save_velocity, null);
  assert.strictEqual(unhydratedRow.dominant_color, null);
  assert.strictEqual(unhydratedRow.was_live_scraped, false);

  assert.strictEqual(multiRow.save_count, 15);
  assert.strictEqual(multiRow.dominant_color, '#10b981');

  const cbpCall = captured.find((c) => c.sqlText.includes('INSERT INTO competitor_board_pins'));
  assert.strictEqual(cbpCall.jsonPayloads[0].length, 2);

  captured.length = 0;
  await syncPinAcrossAllFourPillars({
    sql: mockSql,
    pinId: '998877665544',
    scrapedPin: { title: 'No Color Pin', saves: 100, has_explicit_saves: true },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '998877665544' })
  });
  const syncInsert = captured.find((c) => c.sqlText.includes('INSERT INTO universal_master_pins'));
  assert.ok(!syncInsert.values.includes('#888888'), 'syncPinAcrossAllFourPillars must pass NULL, never #888888');
  assert.ok(syncInsert.sqlText.includes("EXCLUDED.dominant_color NOT IN ('', '#888888')"));
});


