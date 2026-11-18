import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHydrationJump,
  calculateDailyVelocity,
  calculateRollingGainsFromSnapshots,
  sanitizeDossierTrajectory
} from '../src/lib/math.mjs';
import {
  ingestPinsBatch,
  resavePinsMetricsBatch,
  syncPinAcrossAllFourPillars
} from '../src/modules/pins/repository.mjs';
import {
  getQualificationRules,
  updateQualificationRules,
  getCompetitorRules,
  saveCompetitorRules,
  GLOBAL_QUALIFICATION_RULES_KEY
} from '../src/modules/creators/competitors-crud.mjs';
import {
  listDomainsIntelligenceFast,
  fetchAndCacheDomainAge,
  fetchAndCacheDomainAdNetwork
} from '../src/modules/domains/service.mjs';
import { getCrossPillarArbitrageTargets } from '../src/modules/cluster/service.mjs';
import {
  getMigrationFiles,
  findAppliedMigration,
  calculateChecksum
} from '../scripts/migrate.mjs';

function buildTaggedSqlCall(strings, values) {
  let text = '';
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), values };
}

test('detectHydrationJump and calculateDailyVelocity do NOT zero-lock pins where prev.save_count < prev.repin_count', () => {
  const prev = { save_count: 120, repin_count: 285 };
  const curr = { save_count: 148, repin_count: 298 };

  assert.equal(
    detectHydrationJump(prev, curr),
    false,
    'Legitimate Pinterest pins with save_count < repin_count must not be flagged as hydration jumps'
  );

  const velocity = calculateDailyVelocity({
    currentSaves: curr.save_count,
    baselineSaves: prev.save_count,
    currentRepins: curr.repin_count,
    baselineRepins: prev.repin_count,
    currentDate: '2026-11-18T00:00:00Z',
    baselineDate: '2026-11-17T00:00:00Z'
  });
  assert.equal(velocity, 28, 'Daily save velocity must reflect real 24h delta instead of locking to 0');

  // Authentic hydration jumps must still be suppressed
  assert.equal(
    detectHydrationJump({ save_count: 0, repin_count: 0 }, { save_count: 420, repin_count: 30 }),
    true,
    '0 -> positive saves transition must remain a hydration jump'
  );
  assert.equal(
    detectHydrationJump({ save_count: 180, repin_count: 180 }, { save_count: 900, repin_count: 185 }),
    true,
    'Cloned save_count === repin_count jumping > 1.35x must remain a hydration jump'
  );
  assert.equal(
    detectHydrationJump({ save_count: 500, repin_count: 90 }, { save_count: 3500, repin_count: 110 }),
    true,
    '>= 4x and >= 2500 spike must remain a hydration jump'
  );
});

test('> 7 day crawl gaps compute decayed daily velocity and normalize multi-day repin velocity', async () => {
  const tenDayVelocity = calculateDailyVelocity({
    currentSaves: 1150,
    baselineSaves: 1000,
    currentRepins: 90,
    baselineRepins: 80,
    currentDate: '2026-11-15T00:00:00Z',
    baselineDate: '2026-11-05T00:00:00Z'
  });
  assert.equal(tenDayVelocity, 15, '150 saves gained across 10 days must decay to 15 saves/day');

  const rollingTwelveDayGap = calculateRollingGainsFromSnapshots([
    { recorded_date: '2026-11-13', save_count: 1240, repin_count: 160 },
    { recorded_date: '2026-11-01', save_count: 1000, repin_count: 100 }
  ]);
  assert.equal(rollingTwelveDayGap.daily_save_velocity, 20, '240 saves over 12 days must equal 20 saves/day');
  assert.equal(rollingTwelveDayGap.daily_repin_velocity, 5, '60 repins over 12 days must equal 5 repins/day');

  const sanitized = sanitizeDossierTrajectory({
    creative: { save_count: 1150, daily_save_velocity: 99 },
    daily_trajectory: [
      { snapshot_date: '2026-11-15', save_count: 1150, repin_count: 90, daily_save_velocity: 99 },
      { snapshot_date: '2026-11-05', save_count: 1000, repin_count: 80, daily_save_velocity: 12 }
    ]
  });
  assert.equal(sanitized.daily_trajectory[0].daily_save_velocity, 15);
  assert.equal(sanitized.creative.daily_save_velocity, 15);

  // Verify syncPinAcrossAllFourPillars divides rawRepinDelta by daysElapsed across multi-day gaps
  const capturedUpserts = [];
  const syncMockSql = (strings, ...values) => {
    const call = buildTaggedSqlCall(strings, values);
    capturedUpserts.push(call);
    if (call.text.includes('FROM pins_daily_metrics') && call.text.includes('LIMIT 3')) {
      return Promise.resolve([{
        snapshot_date: '2026-11-10',
        save_count: 500,
        repin_count: 100,
        daily_save_velocity: 4,
        daily_repin_velocity: 2
      }]);
    }
    return Promise.resolve([]);
  };

  const realDateNow = Date.now;
  const fixedNowMs = Date.parse('2026-11-15T12:00:00Z');
  Date.now = () => fixedNowMs;
  const RealDate = globalThis.Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNowMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedNowMs;
    }
  }
  globalThis.Date = MockDate;

  try {
    const syncRes = await syncPinAcrossAllFourPillars({
      sql: syncMockSql,
      pinId: '1098245059167667976',
      scrapedPin: {
        pin_id: '1098245059167667976',
        title: 'Multi-day sync check',
        save_count: 600,
        repin_count: 150,
        has_explicit_saves: true,
        destination_url: 'https://example.com/post'
      },
      fetchUniversalPinDossier: async () => ({ success: true, pin_id: '1098245059167667976' })
    });
    assert.equal(syncRes.syncVelocity, 20, '100 saves over 5 days must equal 20 saves/day');
    const umpUpsert = capturedUpserts.find((c) => c.text.includes('INSERT INTO universal_master_pins'));
    assert.ok(umpUpsert, 'Should delegate to ingestPinsBatch universal_master_pins CTE');
    const batchPayload = JSON.parse(umpUpsert.values[0]);
    assert.equal(batchPayload[0].daily_save_velocity, 20);
    assert.equal(
      batchPayload[0].daily_repin_velocity,
      10,
      '50 repins over 5 days must normalize daily_repin_velocity to 10'
    );
    assert.equal(batchPayload[0].delta_repins_24h, 10);
  } finally {
    globalThis.Date = RealDate;
    Date.now = realDateNow;
  }
});

test('calculateRollingGainsFromSnapshots enforces >= 60% span and <= 40% tolerance without cloning short spans', () => {
  // 1. 2-day span: MUST return null for all 5d/7d/10d/15d windows (never clone 2-day delta)
  const twoDayPin = calculateRollingGainsFromSnapshots([
    { recorded_date: '2026-11-18', save_count: 560, repin_count: 40 },
    { recorded_date: '2026-11-16', save_count: 500, repin_count: 35 }
  ], '2026-11-18T08:00:00Z');
  assert.equal(twoDayPin.daily_save_velocity, 30);
  assert.equal(twoDayPin.gains_5d, null);
  assert.equal(twoDayPin.gains_7d, null);
  assert.equal(twoDayPin.gains_10d, null);
  assert.equal(twoDayPin.gains_15d, null);

  // 2. 4-day span: qualifies for 5d (ceil(5*0.6)=3, |4-5|=1 <= 2), null for 7d/10d/15d
  const fourDayPin = calculateRollingGainsFromSnapshots([
    { recorded_date: '2026-11-18', save_count: 640, repin_count: 45 },
    { recorded_date: '2026-11-14', save_count: 500, repin_count: 35 }
  ], '2026-11-18T08:00:00Z');
  assert.equal(fourDayPin.gains_5d, 140);
  assert.equal(fourDayPin.gains_7d, null);
  assert.equal(fourDayPin.gains_10d, null);
  assert.equal(fourDayPin.gains_15d, null);

  // 3. Full 15-day trajectory with exact window anchors
  const fullHistory = calculateRollingGainsFromSnapshots([
    { recorded_date: '2026-11-18', save_count: 1000, repin_count: 120 },
    { recorded_date: '2026-11-17', save_count: 975, repin_count: 118 },
    { recorded_date: '2026-11-13', save_count: 900, repin_count: 110 },
    { recorded_date: '2026-11-11', save_count: 840, repin_count: 105 },
    { recorded_date: '2026-11-08', save_count: 750, repin_count: 98 },
    { recorded_date: '2026-11-03', save_count: 600, repin_count: 85 }
  ], '2026-11-18T08:00:00Z');
  assert.equal(fullHistory.daily_save_velocity, 25);
  assert.equal(fullHistory.gains_5d, 100);
  assert.equal(fullHistory.gains_7d, 160);
  assert.equal(fullHistory.gains_10d, 250);
  assert.equal(fullHistory.gains_15d, 400);

  // 4. Sparse 15-day endpoints only (d0 and d15): 15d valid, but 5d/7d rejected by <= 40% tolerance
  const sparseEndpoints = calculateRollingGainsFromSnapshots([
    { recorded_date: '2026-11-18', save_count: 1000, repin_count: 120 },
    { recorded_date: '2026-11-03', save_count: 600, repin_count: 85 }
  ], '2026-11-18T08:00:00Z');
  assert.equal(sparseEndpoints.gains_5d, null);
  assert.equal(sparseEndpoints.gains_7d, null);
  assert.equal(sparseEndpoints.gains_15d, 400);
});

test('ingestPinsBatch excludes disqualified pins from SERP and board child maps, orders upsert_pins first, and delegates resavePinsMetricsBatch', async () => {
  const txStatements = [];
  const createTxRunner = () => {
    const tx = (strings, ...values) => {
      const call = buildTaggedSqlCall(strings, values);
      txStatements.push(call);
      if (call.text.includes('INSERT INTO universal_master_pins')) {
        return Promise.resolve([{ pin_id: '111111111111111111' }]);
      }
      return Promise.resolve([]);
    };
    return tx;
  };

  const mockSql = (strings, ...values) => {
    const call = buildTaggedSqlCall(strings, values);
    txStatements.push(call);
    return Promise.resolve([]);
  };
  mockSql.begin = async (fn) => fn(createTxRunner());

  const rules = {
    tier1_min_saves: 100,
    tier2_min_repins: 100,
    tier2_min_velocity: 5.0,
    tier2_max_age_days: 60,
    tier3_max_age_days: 14,
    tier3_min_saves: 30,
    master_ingest_enabled: true
  };

  const batchResult = await ingestPinsBatch(
    mockSql,
    [
      {
        pin_id: '111111111111111111',
        title: 'Qualified Winner Pin',
        save_count: 450,
        repin_count: 60,
        has_explicit_saves: true,
        destination_url: 'https://winner-blog.com/easy-dinner',
        creator_username: 'winnerchef',
        keyword_id: 12,
        rank_position: 3,
        competitor_id: 44,
        board_id: 'board_alpha'
      },
      {
        pin_id: '222222222222222222',
        title: 'Disqualified Low-Metric Pin',
        save_count: 4,
        repin_count: 0,
        has_explicit_saves: true,
        created_at_pinterest: '2023-05-01T00:00:00Z',
        destination_url: 'https://low-blog.com/old-post',
        creator_username: 'winnerchef',
        keyword_id: 12,
        rank_position: 28,
        competitor_id: 44,
        board_id: 'board_alpha'
      }
    ],
    'creator',
    { filterQualified: true, qualificationRules: rules }
  );

  assert.equal(batchResult.ok, true);
  assert.equal(batchResult.ingested, 1);
  assert.equal(batchResult.filtered, 1);
  assert.equal(batchResult.total, 2);

  const umpIdx = txStatements.findIndex((s) => s.text.includes('INSERT INTO universal_master_pins'));
  const serpIdx = txStatements.findIndex((s) => s.text.includes('INSERT INTO keyword_serp_positions'));
  const boardIdx = txStatements.findIndex((s) => s.text.includes('INSERT INTO competitor_board_pins'));

  assert.ok(umpIdx >= 0, 'Must execute universal_master_pins upsert');
  assert.ok(serpIdx > umpIdx, 'universal_master_pins upsert MUST execute BEFORE keyword_serp_positions to satisfy FK');
  assert.ok(boardIdx > umpIdx, 'universal_master_pins upsert MUST execute BEFORE competitor_board_pins to satisfy FK');

  const serpPayload = JSON.parse(txStatements[serpIdx].values[0]);
  const boardPayload = JSON.parse(txStatements[boardIdx].values[0]);
  assert.deepEqual(
    serpPayload.map((r) => r.pin_id),
    ['111111111111111111'],
    'Disqualified pin must be excluded from keyword_serp_positions payload'
  );
  assert.deepEqual(
    boardPayload.map((r) => r.pin_id),
    ['111111111111111111'],
    'Disqualified pin must be excluded from competitor_board_pins payload'
  );

  // Verify resavePinsMetricsBatch delegates cleanly to ingestPinsBatch and preserves { updated } contract
  txStatements.length = 0;
  const resaveRes = await resavePinsMetricsBatch(mockSql, [
    {
      pin_id: '111111111111111111',
      save_count: 470,
      repin_count: 65,
      has_explicit_saves: true
    }
  ]);
  assert.deepEqual(resaveRes, { updated: 1 });
  assert.ok(
    txStatements.some((s) => s.text.includes('INSERT INTO universal_master_pins')),
    'resavePinsMetricsBatch should delegate through ingestPinsBatch CTE'
  );
});

test('app_settings qualification rules, single-table domain services, null age_days cluster scoring, and 2-file migration discovery work cleanly', async () => {
  // 1. Global qualification rules persist in app_settings (key = pin_qualification_rules) while per-competitor overrides stay on competitor_profiles
  const settingsStore = new Map();
  const competitorStore = new Map([[7, { id: 7, username: 'chef_anna', rules: null }]]);
  const touchedTables = [];

  const rulesSql = (strings, ...values) => {
    const call = buildTaggedSqlCall(strings, values);
    if (call.text.includes('FROM app_settings')) {
      touchedTables.push('app_settings:read');
      const key = call.values[0];
      const entry = settingsStore.get(key);
      return Promise.resolve(entry ? [{ rules: entry.value, updated_at: entry.updated_at }] : []);
    }
    if (call.text.includes('INSERT INTO app_settings')) {
      touchedTables.push('app_settings:write');
      const [key, jsonVal] = call.values;
      const parsed = JSON.parse(jsonVal);
      const entry = { value: parsed, updated_at: '2026-11-18T00:00:00Z' };
      settingsStore.set(key, entry);
      return Promise.resolve([{ rules: entry.value, updated_at: entry.updated_at }]);
    }
    if (call.text.includes('SELECT id FROM competitor_profiles')) {
      const id = Number(call.values[0]);
      const c = competitorStore.get(id);
      return Promise.resolve(c ? [{ id: c.id }] : []);
    }
    if (call.text.includes("SELECT id, username, metadata->'qualification_rules'")) {
      const id = Number(call.values[0]);
      const c = competitorStore.get(id);
      return Promise.resolve(c ? [{ id: c.id, username: c.username, rules: c.rules }] : []);
    }
    if (call.text.includes('UPDATE competitor_profiles')) {
      const [rulesJson, id] = call.values;
      const c = competitorStore.get(Number(id));
      c.rules = JSON.parse(rulesJson);
      return Promise.resolve([{ id: c.id, username: c.username, rules: c.rules }]);
    }
    throw new Error(`Unexpected SQL in rules test: ${call.text}`);
  };

  const defaults = await getQualificationRules(rulesSql);
  assert.equal(defaults.tier1_min_saves, 100);

  const savedGlobal = await updateQualificationRules(rulesSql, {
    tier1_min_saves: 250,
    tier2_min_velocity: 6.5,
    paused_policy: 'allow'
  });
  assert.equal(savedGlobal.tier1_min_saves, 250);
  assert.equal(savedGlobal.tier2_min_velocity, 6.5);
  assert.equal(settingsStore.has(GLOBAL_QUALIFICATION_RULES_KEY), true);

  const reloadedGlobal = await getQualificationRules(rulesSql);
  assert.equal(reloadedGlobal.tier1_min_saves, 250);
  assert.equal(reloadedGlobal.paused_policy, 'allow');

  const savedCreator = await saveCompetitorRules(rulesSql, 7, { tier1_min_saves: 400 });
  assert.equal(savedCreator.ok, true);
  assert.equal(savedCreator.rules.tier1_min_saves, 400);
  const loadedCreator = await getCompetitorRules(rulesSql, 7);
  assert.equal(loadedCreator.rules.tier1_min_saves, 400);

  // 2. listDomainsIntelligenceFast enforces r.total_pins >= minPins even when minPins === 1 and escapes LIKE wildcards
  const rollupRows = [
    { domain: 'ghost-zero.com', total_pins: 0, unique_urls: 1, pins_per_url: 1, top10_pins: 0, visibility_score: 0, total_saves: 0 },
    { domain: '100%_authentic.com', total_pins: 3, unique_urls: 2, pins_per_url: 1.5, top10_pins: 2, visibility_score: 145, total_saves: 2400 },
    { domain: 'authentic-blog.com', total_pins: 5, unique_urls: 2, pins_per_url: 2.5, top10_pins: 1, visibility_score: 45, total_saves: 900 },
    { domain: '1000x_fake.com', total_pins: 4, unique_urls: 2, pins_per_url: 2.0, top10_pins: 1, visibility_score: 40, total_saves: 700 }
  ];
  const domainSqlCalls = [];
  const domainSql = (strings, ...values) => {
    const call = buildTaggedSqlCall(strings, values);
    domainSqlCalls.push(call);
    if (call.text.includes('FROM domain_intelligence_rollup r')) {
      const minPinsVal = Number(call.values[0]);
      const patternVal = call.values[1];
      const filtered = rollupRows.filter((row) => {
        if (row.total_pins < minPinsVal) return false;
        if (patternVal) {
          // Convert SQL LIKE pattern with ESCAPE '\' into RegExp
          let rx = '^';
          for (let i = 0; i < patternVal.length; i++) {
            const ch = patternVal[i];
            if (ch === '\\' && i + 1 < patternVal.length) {
              rx += patternVal[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            } else if (ch === '%') {
              rx += '.*';
            } else if (ch === '_') {
              rx += '.';
            } else {
              rx += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
          }
          rx += '$';
          if (!new RegExp(rx, 'i').test(row.domain)) return false;
        }
        return true;
      });
      return Promise.resolve(
        filtered.map((r) => ({
          ...r,
          total_filtered_domains: filtered.length,
          global_top10_slots: filtered.reduce((acc, x) => acc + x.top10_pins, 0),
          top5_global_slots: filtered.reduce((acc, x) => acc + x.top10_pins, 0),
          baby_giants_count: 0,
          multi_account_domains_count: 0,
          global_avg_multiplier: 1.5
        }))
      );
    }
    if (call.text.includes('SELECT 1 FROM domain_intelligence_rollup')) {
      return Promise.resolve([{ '?column?': 1 }]);
    }
    if (call.text.includes('FROM domain_intelligence_rollup')) {
      return Promise.resolve([{
        domain: 'authentic-blog.com',
        registered_at: '2024-06-01T00:00:00Z',
        lookup_status: 'resolved',
        age_status: 'resolved',
        age_days: 500,
        age_years: 1.37,
        current_ad_network: 'mediavine',
        ad_network: 'mediavine',
        checked_at: new Date().toISOString(),
        ads_txt_status: 'resolved',
        network_history: []
      }]);
    }
    throw new Error(`Unexpected domain SQL: ${call.text}`);
  };

  const fastAll = await listDomainsIntelligenceFast(domainSql, { minPins: 1 });
  assert.deepEqual(
    fastAll.domains.map((d) => d.domain),
    ['100%_authentic.com', 'authentic-blog.com', '1000x_fake.com'],
    'minPins=1 must still exclude total_pins=0 rows'
  );

  const fastWildcard = await listDomainsIntelligenceFast(domainSql, { minPins: 1, search: '100%_' });
  assert.deepEqual(
    fastWildcard.domains.map((d) => d.domain),
    ['100%_authentic.com'],
    'Escaped wildcard search with ESCAPE \\ must match literal % and _ only'
  );
  assert.ok(
    domainSqlCalls[0].text.includes("ESCAPE '\\'"),
    'Rollup LIKE predicate must specify ESCAPE clause'
  );

  // Cached single-table reads on domain_intelligence_rollup
  const cachedAge = await fetchAndCacheDomainAge(domainSql, 'authentic-blog.com');
  assert.equal(cachedAge.lookup_status, 'resolved');
  const cachedAd = await fetchAndCacheDomainAdNetwork(domainSql, 'authentic-blog.com');
  assert.equal(cachedAd.current_ad_network, 'mediavine');
  assert.ok(
    domainSqlCalls.every((c) => !c.text.includes('domain_registry_metadata') && !c.text.includes('domain_monetization_metadata')),
    'Domain services must query domain_intelligence_rollup exclusively'
  );

  // 3. getCrossPillarArbitrageTargets returns null domain_age_days when dir.age_days IS NULL (never defaults to 365)
  const clusterCalls = [];
  const clusterSql = (strings, ...values) => {
    const call = buildTaggedSqlCall(strings, values);
    clusterCalls.push(call);
    return Promise.resolve([
      {
        pin_id: '999888777666555444',
        title: 'Unchecked Domain Candidate',
        clean_domain: 'unknown-age.com',
        destination_url: 'https://unknown-age.com/article',
        image_url: 'https://i.pinimg.com/236x/ab/cd.jpg',
        creator_username: 'creator1',
        board_name: 'Ideas',
        save_count: 800,
        repin_count: 90,
        velocity: 12.5,
        p2p_transition_score: 0.8,
        seed_clusters_count: 2,
        organic_keywords_count: 1,
        best_serp_rank: 6,
        domain_age_days: null,
        domain_age_years: null,
        ad_network: 'unchecked',
        domain_arbitrage_score: 0,
        convergence_score: 72.1,
        full_count: 1
      }
    ]);
  };
  const arbTargets = await getCrossPillarArbitrageTargets(clusterSql, { limit: 10 });
  assert.equal(arbTargets.success, true);
  assert.equal(arbTargets.items[0].domain_age_days, null);
  assert.equal(arbTargets.items[0].domain_age_years, null);

  // 4. Squashed migrations directory contains strictly 001 + 002 with real SHA-256 checksums
  const migrations = getMigrationFiles();
  assert.equal(migrations.length, 2);
  assert.deepEqual(migrations.map((m) => m.version), ['001', '002']);
  assert.deepEqual(migrations.map((m) => m.name), ['baseline_schema', 'wave2_hygiene_and_unification']);
  assert.match(calculateChecksum('SELECT 1;'), /^[a-f0-9]{64}$/);

  const legacyApplied = new Map([
    ['001', { version: '001', name: 'core_registry', checksum: null, applied_at: '2026-01-01T00:00:00Z' }]
  ]);
  assert.equal(
    findAppliedMigration(legacyApplied, migrations[0]),
    null,
    'Pre-squash 001:core_registry row must NOT cause 001:baseline_schema to be skipped'
  );

  const canonicalApplied = new Map([
    ['001', { version: '001', name: 'baseline_schema', checksum: 'abc', applied_at: '2026-11-18T00:00:00Z' }]
  ]);
  assert.equal(
    findAppliedMigration(canonicalApplied, migrations[0])?.name,
    'baseline_schema',
    'Canonical 001:baseline_schema row must match on subsequent idempotent runs'
  );
});
