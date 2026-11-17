import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { formatPin, fetchPinsBatchFromPidgets } from '../src/core/pinterest/pins.mjs';
import { calculateRollingGainsFromSnapshots } from '../scripts/backfill_rolling_window_gains.mjs';
import { syncPinAcrossAllFourPillars, ingestPinsBatch, resavePinsMetricsBatch, fetchUniversalPinDossier } from '../src/modules/pins/repository.mjs';

test('Phase 4.1: Migration 061 DDL and canonical registration', () => {
  const m61Path = path.resolve(process.cwd(), 'scripts/migrations/061_ssot_functions_views_and_indexes.sql');
  assert.ok(fs.existsSync(m61Path), 'Migration 061 file must exist');

  const m61Content = fs.readFileSync(m61Path, 'utf8');

  // Recreates mv_pulse_24h_summary and unique index
  assert.match(m61Content, /CREATE MATERIALIZED VIEW IF NOT EXISTS public\.mv_pulse_24h_summary/i);
  assert.match(m61Content, /CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id/i);

  // Rewrites pa_topic_clusters_page on universal_master_pins
  assert.match(m61Content, /CREATE OR REPLACE FUNCTION public\.pa_topic_clusters_page/i);
  assert.match(m61Content, /FROM public\.universal_master_pins ump/i);
  assert.match(m61Content, /ump\.creator_username/i);
  assert.match(m61Content, /ump\.daily_save_velocity/i);
  assert.match(m61Content, /ump\.visual_annotations/i);

  // Indexes
  assert.match(m61Content, /idx_ump_last_scraped_at_desc/i);
  assert.match(m61Content, /idx_ump_updated_at_desc/i);
  assert.match(m61Content, /idx_ump_destination_url/i);
  assert.match(m61Content, /idx_ksp_displaced_date/i);
  assert.match(m61Content, /idx_ksp_displaced_updated_desc/i);
  assert.match(m61Content, /idx_ksp_pin_displaced_rank/i);
  assert.match(m61Content, /DROP INDEX IF EXISTS public\.idx_cbp_pin/i);

  // scripts/migrate.mjs registration
  const migrateContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrate.mjs'), 'utf8');
  assert.match(migrateContent, /'061_ssot_functions_views_and_indexes\.sql':/i);

  // scripts/ensure_indexes.mjs registration
  const ensureContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/ensure_indexes.mjs'), 'utf8');
  assert.match(ensureContent, /DROP INDEX IF EXISTS idx_cbp_pin/i);
  assert.match(ensureContent, /idx_ump_last_scraped_at_desc/i);
  assert.match(ensureContent, /idx_ksp_pin_displaced_rank/i);
});

test('Phase 4.2: syncPinAcrossAllFourPillars uses recorded_date and joins universal_master_pins metrics', async () => {
  const queries = [];
  const mockSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    queries.push({ rawSql, values });

    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) {
      return Promise.resolve([{
        keyword_id: 10,
        rank_position: 2,
        is_displaced: false,
        crawled_at: '2026-11-10T00:00:00Z',
        last_known_rank: 2,
        vacuum_opportunity_score: null,
        save_count: 500,
        repin_count: 50,
        daily_save_velocity: 15,
        delta_repins_24h: 3,
        daily_repin_velocity: 3,
        last_scraped_at: '2026-11-10T00:00:00Z'
      }]);
    }
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockSql,
    pinId: '123456789012',
    scrapedPin: {
      pin_id: '123456789012',
      title: 'Phase 4 Test Pin',
      domain: 'test.com',
      destination_url: 'https://test.com/pin',
      saves: 520,
      repins: 55,
      comments: 4,
      shares: 2
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789012' })
  });

  // Verify pins_daily_metrics insert targets recorded_date inside unified CTE
  const pdmInsert = queries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(pdmInsert, 'Must insert into pins_daily_metrics');
  assert.match(pdmInsert.rawSql, /recorded_date/, 'Insert must specify recorded_date');
  assert.doesNotMatch(pdmInsert.rawSql, /INSERT INTO pins_daily_metrics \([^)]*\bsnapshot_date\b[^)]*\)/, 'Insert must not specify snapshot_date column');
  assert.match(pdmInsert.rawSql, /ON CONFLICT \(pin_id, recorded_date\)/, 'Conflict clause must target (pin_id, recorded_date)');
  assert.match(pdmInsert.rawSql, /daily_repin_velocity/, 'Insert must include daily_repin_velocity');

  // Verify universal_master_pins upsert preserves hydration and daily_repin_velocity
  const umpUpsert = queries.find(q => q.rawSql.includes('INSERT INTO universal_master_pins'));
  assert.ok(umpUpsert, 'Must upsert universal_master_pins with fresh metrics');
  const happyRow = JSON.parse(umpUpsert.values[0])[0];
  assert.strictEqual(happyRow.save_count, 520);
  assert.strictEqual(happyRow.repin_count, 55);
  assert.strictEqual(happyRow.is_hydrated, true);
  assert.match(umpUpsert.rawSql, /is_hydrated = \(universal_master_pins\.is_hydrated OR EXCLUDED\.is_hydrated OR EXCLUDED\.save_count IS NOT NULL\)/i, 'Must set is_hydrated with explicit saves');
  assert.match(umpUpsert.rawSql, /daily_repin_velocity =/, 'Must update daily_repin_velocity');

  // Verify positive repin scrape preserves/updates repin_count via CASE in both CTE branches
  assert.match(pdmInsert.rawSql, /repin_count = CASE/);
  assert.match(umpUpsert.rawSql, /repin_count = CASE/);

  // Verify unhydrated pin sync preserves NULL and does not force is_hydrated = TRUE
  const unhydratedQueries = [];
  const mockUnhydratedSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    unhydratedQueries.push({ rawSql, values });
    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) return Promise.resolve([]);
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) return Promise.resolve([]);
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockUnhydratedSql,
    pinId: '123456789013',
    scrapedPin: {
      pin_id: '123456789013',
      title: 'Unhydrated Sync Pin',
      domain: 'test.com',
      destination_url: 'https://test.com/pin2',
      saves: null,
      repins: null,
      has_explicit_saves: false
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789013' })
  });

  const unhydratedBatch = unhydratedQueries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(unhydratedBatch, 'Must insert into pins_daily_metrics');
  const unhydratedRow = JSON.parse(unhydratedBatch.values[0])[0];
  assert.strictEqual(unhydratedRow.save_count, null, 'Must pass NULL save_count into unified batch');
  assert.strictEqual(unhydratedRow.repin_count, null, 'Must pass NULL repin_count into unified batch');
  assert.strictEqual(unhydratedRow.is_hydrated, false, 'Must keep is_hydrated false when unhydrated');
  assert.match(unhydratedBatch.rawSql, /is_hydrated = \(universal_master_pins\.is_hydrated OR EXCLUDED\.is_hydrated OR EXCLUDED\.save_count IS NOT NULL\)/i, 'Must preserve existing hydration when scrape is unhydrated');
  assert.match(unhydratedBatch.rawSql, /ELSE COALESCE\(EXCLUDED\.save_count, universal_master_pins\.save_count\)\s+END/, 'Must preserve existing save_count without coercing to 0');

  // Verify scrape with saves: 0 and has_explicit_saves: false is preserved as unhydrated NULL
  const falseZeroQueries = [];
  const mockFalseZeroSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    falseZeroQueries.push({ rawSql, values });
    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) return Promise.resolve([]);
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) return Promise.resolve([]);
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockFalseZeroSql,
    pinId: '123456789014',
    scrapedPin: {
      pin_id: '123456789014',
      title: 'False Zero Pin',
      saves: 0,
      repins: 0,
      has_explicit_saves: false
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789014' })
  });

  const falseZeroBatch = falseZeroQueries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(falseZeroBatch);
  const falseZeroRow = JSON.parse(falseZeroBatch.values[0])[0];
  assert.strictEqual(falseZeroRow.save_count, null, 'Must pass NULL save_count for has_explicit_saves = false');
  assert.strictEqual(falseZeroRow.repin_count, null, 'Must pass NULL repin_count for has_explicit_saves = false');
  assert.strictEqual(falseZeroRow.is_hydrated, false, 'Must keep is_hydrated = false for unhydrated zero');

  // Verify scrape with saves: 0 and has_explicit_saves: true is saved as authentic 0
  const trueZeroQueries = [];
  const mockTrueZeroSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    trueZeroQueries.push({ rawSql, values });
    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) return Promise.resolve([]);
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) return Promise.resolve([]);
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockTrueZeroSql,
    pinId: '123456789015',
    scrapedPin: {
      pin_id: '123456789015',
      title: 'True Zero Pin',
      saves: 0,
      repins: 0,
      has_explicit_saves: true
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789015' })
  });

  const trueZeroBatch = trueZeroQueries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(trueZeroBatch);
  const trueZeroRow = JSON.parse(trueZeroBatch.values[0])[0];
  assert.strictEqual(trueZeroRow.save_count, 0, 'Must pass 0 save_count when has_explicit_saves = true');
  assert.strictEqual(trueZeroRow.repin_count, 0, 'Must pass 0 repin_count when has_explicit_saves = true');
  assert.strictEqual(trueZeroRow.is_hydrated, true, 'Must set is_hydrated = TRUE when has_explicit_saves = true');

  // Verify scrape with saves: 150 and repins: null preserves existing repin_count (no NULL overwrite)
  const repinNullQueries = [];
  const mockRepinNullSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    repinNullQueries.push({ rawSql, values });
    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) return Promise.resolve([]);
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) return Promise.resolve([]);
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockRepinNullSql,
    pinId: '123456789016',
    scrapedPin: {
      pin_id: '123456789016',
      title: 'Repin Null Pin',
      saves: 150,
      repins: null
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789016' })
  });

  const repinNullBatch = repinNullQueries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(repinNullBatch);
  const repinNullRow = JSON.parse(repinNullBatch.values[0])[0];
  assert.strictEqual(repinNullRow.save_count, 150, 'Must pass 150 saves');
  assert.strictEqual(repinNullRow.repin_count, null, 'Must pass null repins');
  assert.match(repinNullBatch.rawSql, /repin_count = CASE[\s\S]+?ELSE COALESCE\(EXCLUDED\.repin_count, pins_daily_metrics\.repin_count\)\s+END/, 'Conflict DO UPDATE must preserve existing pins_daily_metrics.repin_count when EXCLUDED.repin_count is null');
  assert.match(repinNullBatch.rawSql, /repin_count = CASE[\s\S]+?ELSE COALESCE\(EXCLUDED\.repin_count, universal_master_pins\.repin_count\)\s+END/, 'universal_master_pins upsert must preserve existing repin_count when newRepins is null');

  // Verify explicit 0 repins with has_explicit_repins: true updates repin_count to 0
  const explicitZeroRepinsQueries = [];
  const mockExplicitZeroRepinsSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    explicitZeroRepinsQueries.push({ rawSql, values });
    if (rawSql.includes('FROM keyword_serp_positions') && rawSql.includes('SELECT')) return Promise.resolve([]);
    if (rawSql.includes('FROM pins_daily_metrics') && rawSql.includes('SELECT')) return Promise.resolve([]);
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockExplicitZeroRepinsSql,
    pinId: '123456789017',
    scrapedPin: {
      pin_id: '123456789017',
      title: 'Explicit Zero Repins Pin',
      saves: 150,
      repins: 0,
      has_explicit_repins: true
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '123456789017' })
  });

  const zeroRepinBatch = explicitZeroRepinsQueries.find(q => q.rawSql.includes('INSERT INTO pins_daily_metrics'));
  assert.ok(zeroRepinBatch);
  const zeroRepinRow = JSON.parse(zeroRepinBatch.values[0])[0];
  assert.strictEqual(zeroRepinRow.save_count, 150);
  assert.strictEqual(zeroRepinRow.repin_count, 0, 'Must pass 0 repins when has_explicit_repins = true');
  assert.match(zeroRepinBatch.rawSql, /repin_count = CASE/);
});

test('Phase 4.3: ingestPinsBatch preserves rolling gains and gates velocity on positive prior saves', async () => {
  const queries = [];
  const mockSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    queries.push({ rawSql, values });
    return Promise.resolve([]);
  };

  await ingestPinsBatch(mockSql, [{
    pin_id: '777888999000',
    title: 'Gains Test Pin',
    save_count: 200,
    repin_count: 20,
    gains_5d: 25,
    gains_7d: 35,
    gains_10d: 50,
    gains_15d: 70
  }]);

  const batchQuery = queries.find(q => q.rawSql.includes('WITH raw_batch AS'));
  assert.ok(batchQuery, 'Must execute batch CTE query');
  assert.match(batchQuery.rawSql, /gains_5d bigint, gains_7d bigint, gains_10d bigint, gains_15d bigint/, 'Recordset must declare gains columns');
  assert.match(batchQuery.rawSql, /gains_5d = COALESCE\(EXCLUDED\.gains_5d, universal_master_pins\.gains_5d\)/, 'Conflict must update gains_5d');
  assert.match(batchQuery.rawSql, /(prev\.save_count|prev_save_count) > 0/, 'Velocity must gate on prev.save_count > 0');
});

test('Phase 4.4: formatPin and fetchPinsBatchFromPidgets null preservation and zero velocity', async () => {
  // formatPin on unhydrated pin
  const formattedUnhydrated = formatPin({
    id: '555444333222',
    title: 'Unhydrated'
  });
  assert.strictEqual(formattedUnhydrated.save_count, null);
  assert.strictEqual(formattedUnhydrated.repin_count, null);
  assert.strictEqual(formattedUnhydrated.velocity, null, 'Velocity must not be computed from ageDays and must default to null');

  // formatPin on pin with explicit 0 saves
  const formattedZero = formatPin({
    id: '555444333223',
    save_count: 0,
    repin_count: 0
  });
  assert.strictEqual(formattedZero.save_count, 0);
  assert.strictEqual(formattedZero.repin_count, 0);

  // calculateRollingGainsFromSnapshots preserves NULL for unhydrated pins (< 2 snapshots)
  const singleSnapGains = calculateRollingGainsFromSnapshots([
    { snapshot_date: '2026-11-14', save_count: 100, repin_count: 10 }
  ]);
  assert.strictEqual(singleSnapGains.daily_save_velocity, null);
  assert.strictEqual(singleSnapGains.daily_repin_velocity, null);
  assert.strictEqual(singleSnapGains.gains_7d, null);
});

test('Phase 4.5: folders-crossover preserves authentic NULL gains without fake extrapolation', () => {
  const crossoverCode = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/keywords/folders-crossover.mjs'), 'utf8');
  assert.doesNotMatch(crossoverCode, /Math\.round\(vel \* 7\)/, 'Must not use fake Math.round(vel * 7) fallback');
  assert.doesNotMatch(crossoverCode, /Math\.round\(vel \* 5\)/, 'Must not use fake Math.round(vel * 5) fallback');
  assert.match(crossoverCode, /gains_7d:\s*safeNum\(row\.gains_7d,\s*null\)/, 'Must preserve authentic null gains_7d');
});

test('Phase 4.6: pulse service uses indexed queries instead of ORDER BY GREATEST', () => {
  const pulseServiceCode =
    fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pulse/service.mjs'), 'utf8') + '\n' +
    fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pulse/pulse-queries.mjs'), 'utf8');
  assert.doesNotMatch(pulseServiceCode, /ORDER BY GREATEST\([^)]*daily_save_velocity/i, 'Must not use ORDER BY GREATEST');
  assert.match(pulseServiceCode, /ORDER BY ump\.daily_save_velocity DESC NULLS LAST, ump\.save_count DESC NULLS LAST/, 'Must use indexed SARGable sort');
});

test('Phase 4.7: listCompetitorAccountPins paginates in CTE before lateral join when ranked_only = false', () => {
  const creatorAnalyticsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/creators/creator-analytics.mjs'), 'utf8');
  assert.match(creatorAnalyticsCode, /WITH filtered_pins AS \(/, 'Must paginate in filtered_pins CTE');
  assert.match(creatorAnalyticsCode, /LIMIT \$\{pLim\} OFFSET \$\{offset\}\s*\)\s*SELECT\s+fp\./, 'Must apply LIMIT before joining keyword_serp_positions');
});

test('Phase 4.8: reconcilePinMetricsAfterSnapshotDelete uses batch update and clears stale hydration on 0 snapshots', () => {
  const pinsRouteCode = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pins.mjs'), 'utf8');
  assert.match(pinsRouteCode, /is_hydrated = FALSE/, 'Must reset is_hydrated = FALSE on 0 snapshots');
  assert.match(pinsRouteCode, /jsonb_to_recordset/, 'Must batch update velocities via jsonb_to_recordset');
});

test('Phase 4.9: InstaBox free-tier resilience (420m epoch reset and activity lease)', () => {
  const bootScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/instabox-boot-sync.sh'), 'utf8');
  assert.match(bootScript, /check_and_reset_uptime_epoch/, 'Must define check_and_reset_uptime_epoch');
  assert.match(bootScript, /420/, 'Must check >= 420 minutes continuous uptime');
  assert.match(bootScript, /instabox suspend && sleep 5 && instabox resume/, 'Must perform suspend/resume cycle');

  const domainRollup = fs.readFileSync(path.resolve(process.cwd(), 'scripts/refresh-domain-rollup.mjs'), 'utf8');
  assert.match(domainRollup, /startInstaBoxActivityLease/, 'Must start activity lease in refresh-domain-rollup');

  const rollingGains = fs.readFileSync(path.resolve(process.cwd(), 'scripts/backfill_rolling_window_gains.mjs'), 'utf8');
  assert.match(rollingGains, /startInstaBoxActivityLease/, 'Must start activity lease in backfill_rolling_window_gains');
});

test('Phase 4.10: resavePinsMetricsBatch preserves NULL on rolling gains and repin deltas, and guards velocity on positive prior saves', async () => {
  const queries = [];
  const mockSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    queries.push({ rawSql, values });
    return Promise.resolve([]);
  };

  await resavePinsMetricsBatch(mockSql, [{
    pin_id: '111222333444',
    domain: 'example.com',
    save_count: 300,
    repin_count: null,
    gains_5d: null,
    gains_7d: null,
    gains_10d: null,
    gains_15d: null
  }]);

  const batchQuery = queries.find(q => q.rawSql.includes('WITH raw_batch AS'));
  assert.ok(batchQuery, 'Must execute batch CTE query');

  // Verify gains_* in upd_master do NOT fall back to 0
  assert.match(batchQuery.rawSql, /gains_5d = COALESCE\(cb\.gains_5d, ump\.gains_5d\),/);
  assert.match(batchQuery.rawSql, /gains_7d = COALESCE\(cb\.gains_7d, ump\.gains_7d\),/);
  assert.match(batchQuery.rawSql, /gains_10d = COALESCE\(cb\.gains_10d, ump\.gains_10d\),/);
  assert.match(batchQuery.rawSql, /gains_15d = COALESCE\(cb\.gains_15d, ump\.gains_15d\),/);
  assert.doesNotMatch(batchQuery.rawSql, /gains_5d = COALESCE\(cb\.gains_5d, ump\.gains_5d, 0\)/);

  // Verify velocity computation guards on prev.save_count > 0 and preserves caller velocity
  assert.match(batchQuery.rawSql, /WHEN (rb|eb)\.save_count IS NULL THEN NULL/);
  assert.match(batchQuery.rawSql, /WHEN (rb|eb)\.daily_save_velocity IS NOT NULL/);
  assert.match(batchQuery.rawSql, /(prev\.save_count|prev_save_count) > 0/);

  // Verify repin velocity computation guards on prev.save_count > 0 and repin_count IS NULL
  assert.match(batchQuery.rawSql, /WHEN (rb|eb)\.repin_count IS NULL THEN NULL/);
  assert.match(batchQuery.rawSql, /WHEN (rb|eb)\.daily_repin_velocity IS NOT NULL/);

  // Verify effective_delta_repins_24h returns NULL on NULL repin_count or prev.repin_count
  assert.match(batchQuery.rawSql, /WHEN (rb|eb)\.repin_count IS NULL/);
  assert.match(batchQuery.rawSql, /(prev\.repin_count|prev_repin_count) IS NOT NULL/);
  assert.match(batchQuery.rawSql, /delta_repins_24h = COALESCE\(cb\.effective_delta_repins_24h, ump\.delta_repins_24h\)/);

  // Verify JSON serialization preserves null for unhydrated repins and rolling gains
  const payloadPins = JSON.parse(batchQuery.values[0]);
  assert.strictEqual(payloadPins[0].repin_count, null);
  assert.strictEqual(payloadPins[0].gains_5d, null);
  assert.strictEqual(payloadPins[0].gains_7d, null);
  assert.strictEqual(payloadPins[0].gains_10d, null);
  assert.strictEqual(payloadPins[0].gains_15d, null);

  // Verify caller-supplied velocities and deltas are preserved in batch payload
  const populatedQueries = [];
  const mockPopulatedSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    populatedQueries.push({ rawSql, values });
    return Promise.resolve([]);
  };

  await resavePinsMetricsBatch(mockPopulatedSql, [{
    pin_id: '111222333445',
    domain: 'example.com',
    save_count: 500,
    repin_count: 50,
    daily_save_velocity: 15.5,
    daily_repin_velocity: 3.5,
    delta_repins_24h: 4,
    gains_5d: 20
  }]);

  const populatedBatchQuery = populatedQueries.find(q => q.rawSql.includes('WITH raw_batch AS'));
  assert.ok(populatedBatchQuery);
  const populatedPayload = JSON.parse(populatedBatchQuery.values[0]);
  assert.strictEqual(populatedPayload[0].daily_save_velocity, 15.5);
  assert.strictEqual(populatedPayload[0].daily_repin_velocity, 3.5);
  assert.strictEqual(populatedPayload[0].delta_repins_24h, 4);
  assert.strictEqual(populatedPayload[0].gains_5d, 20);
  assert.strictEqual(populatedPayload[0].repin_count, 50);
});
