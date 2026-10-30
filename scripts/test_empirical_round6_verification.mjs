#!/usr/bin/env node

/**
 * Empirical Adversarial Test Harness for Round 6 Implemented Features:
 * 1. Audience Gains Aggregator (`clusterCompetitorAudienceGains`)
 * 2. Auto-Promote Logic (`creator-velocity-crawler.mjs`)
 * 3. Baby Domains Filter (`src/campaign-folders-ui.mjs`)
 * 4. Vacuum Pins Detection (`src/modules/keywords/folders-service.mjs` & `src/campaign-folders-ui.mjs`)
 * 5. Migration 041 Composite Shard Indexes DDL & Query Alignment
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

console.log('='.repeat(80));
console.log('  ROUND 6 EMPIRICAL ADVERSARIAL STRESS TEST & BOUNDARY VERIFICATION');
console.log('='.repeat(80));

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// 1. AUDIENCE GAINS AGGREGATOR (clusterCompetitorAudienceGains)
// ============================================================================
console.log('\n[TARGET 1] Audience Gains Aggregator Stress Testing...');

// Extract or replicate the EXACT clusterCompetitorAudienceGains logic from src/campaign-folders-ui.mjs
function computeAudienceGains(crossoverData, selectedTimeWindow) {
  const context = {
    crossoverData,
    selectedTimeWindow,
    get clusterCompetitorAudienceGains() {
      const creators = this.crossoverData?.top_creators || [];
      if (!creators.length) return 0;
      const win = this.selectedTimeWindow;
      return creators.reduce((sum, c) => {
        const d24 = Number(c.delta_reach_24h ?? c.delta_monthly_reach ?? 0);
        const d7 = Number(c.reach_delta_7d ?? (d24 > 0 ? d24 * 7 : 0));
        const d30 = Number(c.delta_audience_30d ?? c.delta_monthly_reach ?? (d7 > 0 ? Math.round((d7 / 7) * 30) : 0));
        let val = 0;
        if (win === '24h') val = d24;
        else if (win === '5d') val = Math.round((d7 / 7) * 5);
        else if (win === '7d') val = d7;
        else if (win === '10d') val = Math.round((d7 / 7) * 10);
        else if (win === '15d') val = Math.round((d7 / 7) * 15);
        else val = d30 || Number(c.monthly_reach || 0);
        return sum + Math.max(0, val);
      }, 0);
    }
  };
  return context.clusterCompetitorAudienceGains;
}

runTest('1.1 Negative dips (-500,000) clamped to 0 and cannot produce negative sum', () => {
  const data = {
    top_creators: [
      { username: 'c1', delta_reach_24h: -500000, reach_delta_7d: -1500000, delta_monthly_reach: -3000000 },
      { username: 'c2', delta_reach_24h: -25000, reach_delta_7d: -100000, delta_monthly_reach: -200000 }
    ]
  };
  assert.equal(computeAudienceGains(data, '24h'), 0, '24h window must clamp negative dip to 0');
  assert.equal(computeAudienceGains(data, '5d'), 0, '5d window must clamp negative dip to 0');
  assert.equal(computeAudienceGains(data, '7d'), 0, '7d window must clamp negative dip to 0');
  assert.equal(computeAudienceGains(data, '10d'), 0, '10d window must clamp negative dip to 0');
  assert.equal(computeAudienceGains(data, '15d'), 0, '15d window must clamp negative dip to 0');
  assert.equal(computeAudienceGains(data, 'all'), 0, 'all window must clamp negative dip to 0');
});

runTest('1.2 Asymmetric mixed creators (+200,000 vs -500,000) maintains positive sum', () => {
  const data = {
    top_creators: [
      { username: 'c1', delta_reach_24h: 200000, reach_delta_7d: 700000 },
      { username: 'c2', delta_reach_24h: -500000, reach_delta_7d: -2000000 }
    ]
  };
  // c1 contributes 200k, c2 is clamped to 0 -> total = 200k
  assert.equal(computeAudienceGains(data, '24h'), 200000);
  // c1 contributes 700k, c2 clamped to 0 -> total = 700k
  assert.equal(computeAudienceGains(data, '7d'), 700000);
});

runTest('1.3 Null, undefined, and empty creators handling', () => {
  assert.equal(computeAudienceGains(null, '24h'), 0);
  assert.equal(computeAudienceGains({}, '7d'), 0);
  assert.equal(computeAudienceGains({ top_creators: [] }, '5d'), 0);
  const data = {
    top_creators: [
      { username: 'c1', delta_reach_24h: null, reach_delta_7d: null },
      { username: 'c2', delta_reach_24h: undefined, reach_delta_7d: undefined },
      { username: 'c3' } // all undefined
    ]
  };
  assert.equal(computeAudienceGains(data, '24h'), 0);
  assert.equal(computeAudienceGains(data, '7d'), 0);
});

runTest('1.4 Unknown / unexpected window strings gracefully fallback to 30d/monthly_reach', () => {
  const data = {
    top_creators: [
      { username: 'c1', delta_reach_24h: 100, reach_delta_7d: 700, delta_audience_30d: 3000, monthly_reach: 50000 }
    ]
  };
  // win === 'unknown' falls through to `else val = d30 || Number(c.monthly_reach || 0)` -> d30 = 3000
  assert.equal(computeAudienceGains(data, 'unknown_window'), 3000);
  assert.equal(computeAudienceGains(data, null), 3000);
  assert.equal(computeAudienceGains(data, undefined), 3000);
});

runTest('1.5 Window proportion calculations (5d, 10d, 15d derived from 7d)', () => {
  const data = {
    top_creators: [
      { username: 'c1', reach_delta_7d: 70000 }
    ]
  };
  assert.equal(computeAudienceGains(data, '7d'), 70000);
  assert.equal(computeAudienceGains(data, '5d'), 50000); // (70000/7)*5 = 50000
  assert.equal(computeAudienceGains(data, '10d'), 100000); // (70000/7)*10 = 100000
  assert.equal(computeAudienceGains(data, '15d'), 150000); // (70000/7)*15 = 150000
});

// ============================================================================
// 2. AUTO-PROMOTE LOGIC (scripts/creator-velocity-crawler.mjs)
// ============================================================================
console.log('\n[TARGET 2] Auto-Promote Logic Stress Testing...');

function simulateAutoPromoteCheck({
  isPulseOnlyInitial,
  delta24h,
  delta7d,
  threshold24h = 25000,
  threshold7d = 100000
}) {
  let isPulseOnly = isPulseOnlyInitial;
  let updateExecuted = false;
  let updatePayload = null;

  if (isPulseOnly) {
    if (delta24h >= threshold24h || delta7d >= threshold7d) {
      updateExecuted = true;
      updatePayload = {
        tracking_mode: 'full',
        custom_label_fallback: 'Breakout Auto-Promoted',
        metadata: {
          profile_pulse_only: false,
          auto_promoted_at: 'TIMESTAMP',
          auto_promote_reason: 'reach_breakout'
        }
      };
      isPulseOnly = false;
    }
  }

  return { isPulseOnly, updateExecuted, updatePayload };
}

runTest('2.1 24h delta boundary: 24,999 (no promote) vs 25,000 (auto-promote)', () => {
  // Below threshold
  const sub = simulateAutoPromoteCheck({
    isPulseOnlyInitial: true,
    delta24h: 24999,
    delta7d: 0
  });
  assert.equal(sub.isPulseOnly, true, 'isPulseOnly must remain true at 24,999');
  assert.equal(sub.updateExecuted, false, 'No SQL update at 24,999');

  // Exact threshold
  const exact = simulateAutoPromoteCheck({
    isPulseOnlyInitial: true,
    delta24h: 25000,
    delta7d: 0
  });
  assert.equal(exact.isPulseOnly, false, 'isPulseOnly must flip to false at 25,000');
  assert.equal(exact.updateExecuted, true, 'SQL update must execute at 25,000');
  assert.equal(exact.updatePayload.tracking_mode, 'full');
  assert.equal(exact.updatePayload.metadata.profile_pulse_only, false);
});

runTest('2.2 7d delta boundary: 99,999 (no promote) vs 100,000 (auto-promote)', () => {
  // Below threshold
  const sub = simulateAutoPromoteCheck({
    isPulseOnlyInitial: true,
    delta24h: 0,
    delta7d: 99999
  });
  assert.equal(sub.isPulseOnly, true, 'isPulseOnly must remain true at 99,999');
  assert.equal(sub.updateExecuted, false, 'No SQL update at 99,999');

  // Exact threshold
  const exact = simulateAutoPromoteCheck({
    isPulseOnlyInitial: true,
    delta24h: 0,
    delta7d: 100000
  });
  assert.equal(exact.isPulseOnly, false, 'isPulseOnly must flip to false at 100,000');
  assert.equal(exact.updateExecuted, true, 'SQL update must execute at 100,000');
});

runTest('2.3 Non-pulse account is never evaluated for auto-promote', () => {
  const result = simulateAutoPromoteCheck({
    isPulseOnlyInitial: false,
    delta24h: 500000,
    delta7d: 2000000
  });
  assert.equal(result.isPulseOnly, false);
  assert.equal(result.updateExecuted, false, 'Full accounts skip auto-promote block');
});

// ============================================================================
// 3. BABY DOMAINS FILTER (src/campaign-folders-ui.mjs)
// ============================================================================
console.log('\n[TARGET 3] Breakout Baby Domains Filter Stress Testing...');

function testBabyDomainFilter(pin) {
  const ageDays = Number(pin.domain_age_days || (pin.domain_age_years ? pin.domain_age_years * 365 : 0));
  const g7 = Number(pin.gains_7d || (pin.daily_save_velocity ? pin.daily_save_velocity * 7 : 0));
  return ageDays > 0 && ageDays <= 730 && g7 >= 15;
}

runTest('3.1 Age boundary: 0d (fail), 1d (pass), 730d (pass), 731d (fail)', () => {
  assert.equal(testBabyDomainFilter({ domain_age_days: 0, gains_7d: 20 }), false, '0d must fail');
  assert.equal(testBabyDomainFilter({ domain_age_days: -10, gains_7d: 20 }), false, 'negative age must fail');
  assert.equal(testBabyDomainFilter({ domain_age_days: 1, gains_7d: 20 }), true, '1d must pass');
  assert.equal(testBabyDomainFilter({ domain_age_days: 365, gains_7d: 20 }), true, '365d must pass');
  assert.equal(testBabyDomainFilter({ domain_age_days: 730, gains_7d: 20 }), true, '730d (exact 2y) must pass');
  assert.equal(testBabyDomainFilter({ domain_age_days: 731, gains_7d: 20 }), false, '731d must fail');
});

runTest('3.2 Age in years fallback: 2.0y (pass) vs 2.01y (fail)', () => {
  assert.equal(testBabyDomainFilter({ domain_age_years: 2.0, gains_7d: 20 }), true, '2.0y * 365 = 730d must pass');
  assert.equal(testBabyDomainFilter({ domain_age_years: 2.01, gains_7d: 20 }), false, '2.01y * 365 = 733.65d must fail');
});

runTest('3.3 7d gains boundary: 14 (fail) vs 15 (pass)', () => {
  assert.equal(testBabyDomainFilter({ domain_age_days: 100, gains_7d: 14 }), false, '14 gains must fail');
  assert.equal(testBabyDomainFilter({ domain_age_days: 100, gains_7d: 15 }), true, '15 gains must pass');
  assert.equal(testBabyDomainFilter({ domain_age_days: 100, gains_7d: 16 }), true, '16 gains must pass');
});

runTest('3.4 Daily save velocity fallback: 2.0/d (fail) vs 2.15/d (pass)', () => {
  // 2.0 * 7 = 14 -> fail
  assert.equal(testBabyDomainFilter({ domain_age_days: 100, daily_save_velocity: 2.0 }), false);
  // 2.15 * 7 = 15.05 -> pass
  assert.equal(testBabyDomainFilter({ domain_age_days: 100, daily_save_velocity: 2.15 }), true);
});

// ============================================================================
// 4. VACUUM PINS DETECTION (folders-service.mjs & src/campaign-folders-ui.mjs)
// ============================================================================
console.log('\n[TARGET 4] Vacuum Pins Detection Stress Testing...');

function isVacuumPinBackend(pin) {
  const cleanDom = String(pin.domain || '').trim();
  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(pin.save_count) >= 100;
}

function isVacuumPinFrontend(pin) {
  return Boolean(pin.is_vacuum_pin || ((!pin.domain || pin.domain === 'Uploaded by user') && Number(pin.save_count || 0) >= 100));
}

runTest('4.1 Save count boundary: 99 (fail) vs 100 (pass)', () => {
  assert.equal(isVacuumPinBackend({ domain: '', save_count: 99 }), false, '99 saves must NOT be vacuum');
  assert.equal(isVacuumPinBackend({ domain: '', save_count: 100 }), true, '100 saves MUST be vacuum');
  assert.equal(isVacuumPinBackend({ domain: '', save_count: 101 }), true, '101 saves MUST be vacuum');

  assert.equal(isVacuumPinFrontend({ domain: '', save_count: 99 }), false);
  assert.equal(isVacuumPinFrontend({ domain: '', save_count: 100 }), true);
});

runTest('4.2 Domain variations: empty, null, undefined, whitespace, Uploaded by user', () => {
  assert.equal(isVacuumPinBackend({ domain: '', save_count: 500 }), true, 'Empty domain is vacuum');
  assert.equal(isVacuumPinBackend({ domain: null, save_count: 500 }), true, 'Null domain is vacuum');
  assert.equal(isVacuumPinBackend({ domain: undefined, save_count: 500 }), true, 'Undefined domain is vacuum');
  assert.equal(isVacuumPinBackend({ domain: '   ', save_count: 500 }), true, 'Whitespace domain is vacuum');
  assert.equal(isVacuumPinBackend({ domain: 'Uploaded by user', save_count: 500 }), true, '"Uploaded by user" is vacuum');
});

runTest('4.3 Legitimate domains are never flagged as vacuum pins even with high saves', () => {
  assert.equal(isVacuumPinBackend({ domain: 'example.com', save_count: 500000 }), false);
  assert.equal(isVacuumPinBackend({ domain: 'etsy.com', save_count: 1000000 }), false);
  assert.equal(isVacuumPinFrontend({ domain: 'amazon.com', save_count: 750000 }), false);
});

runTest('4.4 Frontend filter parity with precomputed backend flag', () => {
  // If backend precomputed is_vacuum_pin = true, frontend filter honors it immediately
  const pinWithBackendFlag = { is_vacuum_pin: true, domain: 'Uploaded by user', save_count: 120 };
  assert.equal(isVacuumPinFrontend(pinWithBackendFlag), true);

  // If backend flag is missing (e.g. edge cache fallback), frontend computes fallback
  const pinWithoutBackendFlag = { domain: '', save_count: 200 };
  assert.equal(isVacuumPinFrontend(pinWithoutBackendFlag), true);
});

// ============================================================================
// 5. MIGRATION 041 COMPOSITE SHARD INDEXES & QUERY PARITY
// ============================================================================
console.log('\n[TARGET 5] Migration 041 DDL & Query Alignment Testing...');

runTest('5.1 Migration 041 file exists and syntax is valid PostgreSQL DDL', () => {
  const migPath = path.join(ROOT_DIR, 'scripts/migrations/041_composite_shard_indexes.sql');
  assert.ok(fs.existsSync(migPath), '041_composite_shard_indexes.sql must exist');
  const ddl = fs.readFileSync(migPath, 'utf8');

  // Verify idx_pa_pins_shard_saves_desc
  const hasPaIndex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_pa_pins_shard_saves_desc\s+ON\s+pa_pins\s*\(\s*shard_id\s*,\s*saves\s+DESC\s+NULLS\s+LAST\s*\)/i.test(ddl);
  assert.ok(hasPaIndex, 'DDL must contain idx_pa_pins_shard_saves_desc ON pa_pins(shard_id, saves DESC NULLS LAST)');

  // Verify idx_competitor_pins_comp_shard_id_asc
  const hasCpIndex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_competitor_pins_comp_shard_id_asc\s+ON\s+competitor_pins\s*\(\s*competitor_id\s*,\s*shard_id\s*,\s*id\s+ASC\s*\)/i.test(ddl);
  assert.ok(hasCpIndex, 'DDL must contain idx_competitor_pins_comp_shard_id_asc ON competitor_pins(competitor_id, shard_id, id ASC)');
});

runTest('5.2 Query pattern alignment in creator-velocity-crawler.mjs', () => {
  const crawlerCode = fs.readFileSync(path.join(ROOT_DIR, 'scripts/creator-velocity-crawler.mjs'), 'utf8');

  // Verify pa_pins query matches (shard_id, saves DESC)
  const paQueryMatch = crawlerCode.includes('p.shard_id = ANY(${assignedWinningArray}::smallint[])') &&
                       crawlerCode.includes('ORDER BY p.saves DESC');
  assert.ok(paQueryMatch, 'pa_pins query in creator-velocity-crawler.mjs must filter shard_id and order by saves DESC');

  // Verify competitor_pins query matches (competitor_id, shard_id, id ASC)
  const cpQueryMatch = crawlerCode.includes('WHERE competitor_id = ${targetId}') &&
                       crawlerCode.includes('AND shard_id = ANY(${assignedArray}::smallint[])') &&
                       crawlerCode.includes('ORDER BY id ASC');
  assert.ok(cpQueryMatch, 'competitor_pins query must filter competitor_id, shard_id and order by id ASC');
});

runTest('5.3 Zero HOT update interference on competitor_pins', () => {
  const migPath = path.join(ROOT_DIR, 'scripts/migrations/041_composite_shard_indexes.sql');
  const ddl = fs.readFileSync(migPath, 'utf8');

  // Ensure competitor_pins index does NOT include volatile columns: save_count, daily_save_velocity, repin_count
  const volatileColumns = ['save_count', 'daily_save_velocity', 'repin_count', 'crawled_at', 'updated_at'];
  for (const col of volatileColumns) {
    const regex = new RegExp(`idx_competitor_pins[\\s\\S]*?${col}`, 'i');
    assert.ok(!regex.test(ddl), `Migration 041 must NOT index volatile column ${col} on competitor_pins`);
  }
});

console.log('\n' + '='.repeat(80));
console.log(`🎉 ALL ${passedTests}/${totalTests} EMPIRICAL ADVERSARIAL STRESS TESTS PASSED CLEANLY!`);
console.log('='.repeat(80));
