/**
 * scripts/test_challenger_r16_gen2_empirical.mjs
 *
 * Empirical Adversarial Challenger Harness for Round 16 Gen 2:
 * 1. SQL Type-Safety & Malformed Metadata Resilience
 * 2. Vault Hub Enrichment (pa_pins + competitor_pins LATERAL JOIN)
 * 3. Anti-Skeleton Ranking (Hydrated pins rank above high-velocity skeletons)
 * 4. Zero-Fabrication Invariant (delta_saves_24h === 0 on Vault pins)
 * 5. Keyword Footprint Folder Name (populated from row.folders)
 * 6. Domainless Viral Pins Categorization
 * 7. Benchmark Stability & JIT Cold/Warm CPU profiling (10 passes)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function testAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

function createMockSql(overrides = {}) {
  const callLog = [];

  const defaultActiveSerp = [
    {
      keyword_id: 1,
      keyword_text: 'easy dinner recipes',
      keyword_category: 'Food and Drink',
      folders: [{ folder_id: 1, folder_name: 'Dinners', folder_color: '#ec4899' }],
      pin_id: 'serp_pin_1',
      rank_position: 1,
      prev_rank_position: 2,
      title: 'Delicious Chicken Parmesan',
      domain: 'foodblog.com',
      destination_url: 'https://foodblog.com/chicken-parm',
      image_url: 'https://i.pinimg.com/236x/chicken.jpg',
      creator_username: 'chef_maria',
      board_name: 'Italian Dinners',
      save_count: 12000,
      repin_count: 4000,
      daily_save_velocity: 350.0,
      delta_repins_24h: 320,
      delta_saves_24h: 350,
      gains_5d: 1400, gains_7d: 2100, gains_10d: 2800, gains_15d: 4200,
      url_global_saves: 24000,
      dominant_color: '#e11d48',
      visual_annotations: ['Chicken Parmesan', 'Italian Dinners'],
      created_at_pinterest: new Date(Date.now() - 10 * 86400000).toISOString(),
      creation_method: 'pinterest_platform',
      crawled_at: new Date().toISOString()
    }
  ];

  const defaultVaultPins = [
    {
      keyword_id: 1,
      keyword_text: 'easy dinner recipes',
      keyword_category: 'Food and Drink',
      pin_id: 'vault_pin_1',
      last_known_rank: 4,
      vacuum_opportunity_score: 90,
      displaced_date: '2026-11-03',
      save_count: 45000,
      repin_count: 12000,
      daily_save_velocity: 1161.0,
      delta_repins_24h: 1157,
      delta_saves_24h: 1161.0,
      gains_5d: 4500, gains_7d: 6500, gains_10d: 9000, gains_15d: 13000,
      domain: 'vaultsite.com',
      creator_username: 'vaultcreator',
      shard_id: 1,
      title: 'Slow Cooker Pot Roast Feast',
      description: 'Slow cooker pot roast recipe.',
      alt_text: 'Pot roast in slow cooker',
      image_url: 'https://i.pinimg.com/236x/roast.jpg',
      destination_url: 'https://vaultsite.com/pot-roast',
      board_name: 'Slow Cooker Meals',
      dominant_color: '#f59e0b',
      visual_annotations: ['Slow Cooker Pot Roast', 'Easy Dinners'],
      created_at_pinterest: new Date(Date.now() - 25 * 86400000).toISOString()
    }
  ];

  const defaultViralCreatorPins = [];
  const defaultCreators = [];
  const defaultCapsules = [];
  const defaultVacuum = [
    { keyword_id: 1, keyword_text: 'easy dinner recipes', displaced_24h_count: 2, displaced_top10_24h_count: 1, displaced_top10_7d_count: 4 }
  ];
  const defaultPaWinners = [];
  const defaultDomainRollup = [];

  const mockSql = async (strings, ...values) => {
    const rawQuery = Array.isArray(strings)
      ? strings.join('?')
      : (typeof strings === 'string' ? strings : String(strings));
    callLog.push({ query: rawQuery, values });

    if (rawQuery.includes('kw_folders') && rawQuery.includes('keyword_serp_current')) {
      return overrides.activeSerpRows !== undefined ? overrides.activeSerpRows : defaultActiveSerp;
    }
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && rawQuery.includes('displaced_top10_24h_count')) {
      return overrides.vacuumCounts !== undefined ? overrides.vacuumCounts : defaultVacuum;
    }
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && (rawQuery.includes('ORDER BY GREATEST(') || rawQuery.includes('daily_save_velocity > 0'))) {
      return overrides.vaultPins !== undefined ? overrides.vaultPins : defaultVaultPins;
    }
    if (rawQuery.includes('FROM top_creators tc') || rawQuery.includes('active_creators AS (')) {
      return overrides.creatorRows !== undefined ? overrides.creatorRows : defaultCreators;
    }
    if (rawQuery.includes('FROM competitor_pins') && !rawQuery.includes('active_creators') && !rawQuery.includes('top_creators')) {
      return overrides.viralCreatorPins !== undefined ? overrides.viralCreatorPins : defaultViralCreatorPins;
    }
    if (rawQuery.includes('FROM keyword_guided_capsules c')) {
      return overrides.capsuleRows !== undefined ? overrides.capsuleRows : defaultCapsules;
    }
    if (rawQuery.includes('FROM pa_pins pa')) {
      return overrides.paWinners !== undefined ? overrides.paWinners : defaultPaWinners;
    }
    if (rawQuery.includes('FROM domain_intelligence_rollup dir')) {
      return overrides.domainRollups !== undefined ? overrides.domainRollups : defaultDomainRollup;
    }
    return [];
  };

  mockSql.getCallLog = () => callLog;
  return mockSql;
}

async function runEmpiricalChallengerSuite() {
  console.log('='.repeat(80));
  console.log('   CHALLENGER R16_GEN2_2: EMPIRICAL ADVERSARIAL STRESS SUITE');
  console.log('='.repeat(80));

  const pulseService = await import('../src/modules/pulse/service.mjs');
  const {
    getGlobal24hPulseService,
    pulseMemoryCache,
    pulseForceRefreshCooldown,
    inflightPulse,
    fastNum
  } = pulseService;

  function clearCaches() {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  }

  // =========================================================================
  // SECTION 1: SQL Type-Safety & Malformed Creator Metadata Resilience
  // =========================================================================
  console.log('\n--- SECTION 1: SQL Type-Safety & Malformed Creator Metadata ---');

  test('1.1 fastNum handles adversarial inputs without NaN poisoning', () => {
    assert.strictEqual(fastNum(0), 0);
    assert.strictEqual(fastNum(42.5), 42.5);
    assert.strictEqual(fastNum(-15.2), -15.2);
    assert.strictEqual(fastNum(null), 0);
    assert.strictEqual(fastNum(undefined), 0);
    assert.strictEqual(fastNum(""), 0);
    assert.strictEqual(fastNum("   "), 0);
    assert.strictEqual(fastNum("null"), 0);
    assert.strictEqual(fastNum("undefined"), 0);
    assert.strictEqual(fastNum("NaN"), 0);
    assert.strictEqual(fastNum(NaN), 0);
    assert.strictEqual(fastNum(Infinity), 0);
    assert.strictEqual(fastNum(-Infinity), 0);
    assert.strictEqual(fastNum("123.45"), 123.45);
    assert.strictEqual(fastNum("-99.9"), -99.9);
  });

  await testAsync('1.2 queryViralCreatorPins and queryBreakoutCreators SQL AST inspection for LATERAL join regex stripping', async () => {
    clearCaches();
    const mockSql = createMockSql();
    await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const callLog = mockSql.getCallLog();

    const viralQuery = callLog.find(c =>
      c.query.includes('FROM competitor_pins') &&
      !c.query.includes('top_creators') &&
      !c.query.includes('active_creators')
    );
    assert.ok(viralQuery, 'queryViralCreatorPins must be called');
    assert.match(viralQuery.query, /CROSS\s+JOIN\s+LATERAL/i);
    assert.match(viralQuery.query, /regexp_replace\s*\(\s*cpin\.metadata->>'daily_save_velocity',\s*'\[\^0-9\.-]',\s*'',\s*'g'\s*\)/);
    assert.match(viralQuery.query, /NULLIF\s*\(\s*regexp_replace/);

    const breakoutQuery = callLog.find(c => c.query.includes('FROM top_creators') || c.query.includes('ranked_pins AS ('));
    assert.ok(breakoutQuery, 'queryBreakoutCreators must be called');
    assert.match(breakoutQuery.query, /CROSS\s+JOIN\s+LATERAL/i);
    assert.match(breakoutQuery.query, /regexp_replace\s*\(\s*cpin\.metadata->>'daily_save_velocity',\s*'\[\^0-9\.-]',\s*'',\s*'g'\s*\)/);
  });

  await testAsync('1.3 Adversarial malformed creator metadata with empty strings, negative floats, and corrupt strings', async () => {
    clearCaches();

    const adversarialCreatorPins = [
      {
        pin_id: 'pin_malformed_empty',
        title: 'Empty Metric Pin',
        image_url: 'https://i.pinimg.com/236x/p1.jpg',
        save_count: 500,
        repin_count: 100,
        daily_save_velocity: "",
        delta_saves_24h: "",
        delta_repins_24h: ""
      },
      {
        pin_id: 'pin_malformed_literal_null',
        title: 'Literal Null String Pin',
        image_url: 'https://i.pinimg.com/236x/p2.jpg',
        save_count: 800,
        repin_count: 200,
        daily_save_velocity: "null",
        delta_saves_24h: "null",
        delta_repins_24h: "null"
      },
      {
        pin_id: 'pin_malformed_negative_float',
        title: 'Negative Float Pin',
        image_url: 'https://i.pinimg.com/236x/p3.jpg',
        save_count: 1200,
        repin_count: 300,
        daily_save_velocity: -25.5,
        delta_saves_24h: "-12.75",
        delta_repins_24h: -5
      },
      {
        pin_id: 'pin_malformed_text_symbols',
        title: 'Symbols Pin',
        image_url: 'https://i.pinimg.com/236x/p4.jpg',
        save_count: 1500,
        repin_count: 400,
        daily_save_velocity: "$1,250.50 saves/d",
        delta_saves_24h: "abc-999.5xyz",
        delta_repins_24h: "N/A"
      }
    ];

    const mockSql = createMockSql({
      viralCreatorPins: adversarialCreatorPins
    });

    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });
    assert.ok(payload && payload.breakout_pins);

    // Verify all pins were safely parsed and none caused NaN in breakout_pins
    for (const p of payload.breakout_pins) {
      assert.ok(Number.isFinite(p.daily_save_velocity), `daily_save_velocity must be finite, got ${p.daily_save_velocity}`);
      assert.ok(Number.isFinite(p.delta_saves_24h), `delta_saves_24h must be finite, got ${p.delta_saves_24h}`);
      assert.ok(Number.isFinite(p.delta_repins_24h), `delta_repins_24h must be finite, got ${p.delta_repins_24h}`);
      assert.ok(Number.isFinite(p.effective_24h_gain), `effective_24h_gain must be finite, got ${p.effective_24h_gain}`);
    }
  });

  // =========================================================================
  // SECTION 2: Vault Hub Enrichment Verification
  // =========================================================================
  console.log('\n--- SECTION 2: Vault Hub Enrichment (pa_pins + competitor_pins JOINs) ---');

  await testAsync('2.1 SQL queryVaultAndVacuum LEFT JOINs pa_pins and LATERAL JOINs competitor_pins', async () => {
    clearCaches();
    const mockSql = createMockSql();
    await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const callLog = mockSql.getCallLog();
    const vaultQuery = callLog.find(c =>
      c.query.includes('FROM keyword_displaced_index kdi') &&
      c.query.includes('ORDER BY GREATEST(')
    );
    assert.ok(vaultQuery, 'queryVaultAndVacuum must be executed');

    const sqlStr = vaultQuery.query;

    // Verify LEFT JOIN pa_pins
    assert.match(
      sqlStr,
      /LEFT\s+JOIN\s+pa_pins\s+pa\s+ON\s+pa\.pin_id\s*=\s*kdi\.pin_id/i,
      'queryVaultAndVacuum must LEFT JOIN pa_pins on pin_id'
    );

    // Verify LEFT JOIN LATERAL competitor_pins
    assert.match(
      sqlStr,
      /LEFT\s+JOIN\s+LATERAL\s*\(\s*SELECT\s+title,\s*description,\s*alt_text,\s*image_url,\s*destination_url,\s*link_domain,\s*board_name,\s*metadata,\s*created_at_pinterest\s+FROM\s+(public\.)?competitor_pins\s+cp\s+WHERE\s+cp\.pin_id\s*=\s*kdi\.pin_id/i,
      'queryVaultAndVacuum must LEFT JOIN LATERAL competitor_pins'
    );

    // Verify COALESCE enrichment expressions
    assert.match(sqlStr, /COALESCE\s*\(\s*pa\.title,\s*cpin\.title,\s*''\s*\)\s+AS\s+title/i);
    assert.match(sqlStr, /COALESCE\s*\(\s*pa\.image_url,\s*cpin\.image_url,\s*''\s*\)\s+AS\s+image_url/i);
    assert.match(sqlStr, /COALESCE\s*\(\s*pa\.description,\s*cpin\.description,\s*''\s*\)\s+AS\s+description/i);
    assert.match(sqlStr, /COALESCE\s*\(\s*pa\.alt_text,\s*cpin\.alt_text,\s*''\s*\)\s+AS\s+alt_text/i);
  });

  await testAsync('2.2 Displaced Vault pin inherits pa_pins and competitor_pins Hub metadata', async () => {
    clearCaches();

    // Vault pin with skeletal data enriched by pa_pins
    const enrichedVaultPins = [
      {
        keyword_id: 1,
        keyword_text: 'easy dinner recipes',
        keyword_category: 'Food and Drink',
        pin_id: 'vault_enriched_by_pa_pins',
        last_known_rank: 5,
        vacuum_opportunity_score: 95,
        displaced_date: '2026-11-03',
        save_count: 55000,
        repin_count: 14000,
        daily_save_velocity: 850.0,
        delta_repins_24h: 800,
        delta_saves_24h: 0,
        domain: 'padomain.com',
        creator_username: 'pachef',
        shard_id: 1,
        title: 'Title From pa_pins Enriched',
        description: 'Description From pa_pins Enriched',
        alt_text: 'Alt-Text From pa_pins Enriched',
        image_url: 'https://i.pinimg.com/236x/pa_enriched.jpg',
        destination_url: 'https://padomain.com/recipe',
        board_name: 'PA Board',
        dominant_color: '#10b981',
        visual_annotations: ['Enriched Tag 1', 'Enriched Tag 2']
      }
    ];

    const mockSql = createMockSql({
      vaultPins: enrichedVaultPins
    });

    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });
    const p = payload.breakout_pins.find(pin => pin.pin_id === 'vault_enriched_by_pa_pins');
    assert.ok(p, 'Enriched vault pin must be in breakout_pins');

    assert.strictEqual(p.title, 'Title From pa_pins Enriched');
    assert.strictEqual(p.image_url, 'https://i.pinimg.com/236x/pa_enriched.jpg');
    assert.strictEqual(p.description, 'Description From pa_pins Enriched');
    assert.strictEqual(p.alt_text, 'Alt-Text From pa_pins Enriched');
    assert.strictEqual(p.is_vault_surge, true);
    assert.strictEqual(p.is_displaced, true);
  });

  // =========================================================================
  // SECTION 3: Anti-Skeleton Ranking Gate
  // =========================================================================
  console.log('\n--- SECTION 3: Anti-Skeleton Ranking Gate ---');

  await testAsync('3.1 Authentic hydrated pin ranks strictly above high-velocity blank & synthetic skeletons', async () => {
    clearCaches();

    const mockDataset = {
      vaultPins: [
        {
          keyword_id: 1,
          keyword_text: 'crockpot chicken',
          pin_id: 'skeleton_blank_huge_velocity',
          last_known_rank: 1,
          save_count: 90000,
          repin_count: 20000,
          daily_save_velocity: 2500.0, // HIGHEST VELOCITY IN DATASET
          delta_repins_24h: 2400,
          delta_saves_24h: 0,
          domain: '',
          creator_username: '',
          title: '', // BLANK SKELETON
          image_url: '' // BLANK SKELETON
        },
        {
          keyword_id: 1,
          keyword_text: 'crockpot chicken',
          pin_id: 'skeleton_synthetic_title',
          last_known_rank: 2,
          save_count: 80000,
          repin_count: 18000,
          daily_save_velocity: 2200.0, // SECOND HIGHEST
          delta_repins_24h: 2100,
          delta_saves_24h: 0,
          domain: '',
          creator_username: '',
          title: 'untitled pin 999999', // SYNTHETIC TITLE SKELETON
          image_url: '' // NO IMAGE
        },
        {
          keyword_id: 1,
          keyword_text: 'crockpot chicken',
          pin_id: 'skeleton_numeric_title',
          last_known_rank: 3,
          save_count: 70000,
          repin_count: 15000,
          daily_save_velocity: 1900.0, // THIRD HIGHEST
          delta_repins_24h: 1800,
          delta_saves_24h: 0,
          domain: '',
          creator_username: '',
          title: '987654321012345', // NUMERIC TITLE SKELETON
          image_url: '' // NO IMAGE
        }
      ],
      activeSerpRows: [
        {
          keyword_id: 1,
          keyword_text: 'crockpot chicken',
          pin_id: 'hydrated_pin_modest_velocity',
          rank_position: 8,
          title: 'Crispy Garlic Parmesan Skillet Chicken Thighs', // REAL TITLE
          domain: 'skilletdinners.com',
          destination_url: 'https://skilletdinners.com/garlic-parm-chicken',
          image_url: 'https://i.pinimg.com/236x/garlic_parm.jpg', // REAL IMAGE
          creator_username: 'chef_authentic',
          board_name: 'Skillet Classics',
          save_count: 15000,
          repin_count: 4000,
          daily_save_velocity: 75.0, // MODEST VELOCITY (75 vs 2500)
          delta_repins_24h: 70,
          delta_saves_24h: 75,
          visual_annotations: ['Garlic Parmesan Chicken', 'Skillet Dinners']
        }
      ]
    };

    const mockSql = createMockSql(mockDataset);
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pins = payload.breakout_pins;
    const hydratedIdx = pins.findIndex(p => p.pin_id === 'hydrated_pin_modest_velocity');
    const blankSkeletonIdx = pins.findIndex(p => p.pin_id === 'skeleton_blank_huge_velocity');
    const syntheticTitleIdx = pins.findIndex(p => p.pin_id === 'skeleton_synthetic_title');
    const numericTitleIdx = pins.findIndex(p => p.pin_id === 'skeleton_numeric_title');

    assert.ok(hydratedIdx !== -1, 'Hydrated pin must be found in breakout_pins');
    assert.ok(blankSkeletonIdx !== -1, 'Blank skeleton must be found in breakout_pins');
    assert.ok(syntheticTitleIdx !== -1, 'Synthetic skeleton must be found in breakout_pins');
    assert.ok(numericTitleIdx !== -1, 'Numeric skeleton must be found in breakout_pins');

    // The hydrated pin MUST rank at index 0 (Rank #1)
    assert.strictEqual(
      hydratedIdx,
      0,
      `Hydrated pin must be at index 0 (Rank #1), but was at index ${hydratedIdx}`
    );

    // Hydrated pin must rank ahead of all 3 skeletons
    assert.ok(hydratedIdx < blankSkeletonIdx, 'Hydrated pin must rank ahead of blank skeleton');
    assert.ok(hydratedIdx < syntheticTitleIdx, 'Hydrated pin must rank ahead of synthetic title skeleton');
    assert.ok(hydratedIdx < numericTitleIdx, 'Hydrated pin must rank ahead of numeric title skeleton');
  });

  // =========================================================================
  // SECTION 4: Zero-Fabrication Invariant (delta_saves_24h === 0 on Vault)
  // =========================================================================
  console.log('\n--- SECTION 4: Zero-Fabrication Invariant ---');

  await testAsync('4.1 Vault pin delta_saves_24h is strictly 0 and not copied from daily_save_velocity', async () => {
    clearCaches();

    const vaultPinsWithRawVelocity = [
      {
        keyword_id: 1,
        keyword_text: 'slow cooker beef',
        keyword_category: 'Food',
        pin_id: 'vault_pin_high_vel_1200',
        last_known_rank: 2,
        vacuum_opportunity_score: 95,
        displaced_date: '2026-11-03',
        save_count: 60000,
        repin_count: 15000,
        daily_save_velocity: 1200.0,
        delta_repins_24h: 1180,
        delta_saves_24h: 1200.0, // Stale / prior fabricated value before reset
        domain: 'potroastcentral.com',
        destination_url: 'https://potroastcentral.com/beef',
        creator_username: 'chef_beef',
        shard_id: 1,
        title: 'Melt in Your Mouth Beef Pot Roast',
        image_url: 'https://i.pinimg.com/236x/roast_beef.jpg'
      }
    ];

    const mockSql = createMockSql({ vaultPins: vaultPinsWithRawVelocity });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const p = payload.breakout_pins.find(pin => pin.pin_id === 'vault_pin_high_vel_1200');
    assert.ok(p, 'Vault pin must be present');

    // Anti-Fabrication invariant check
    assert.strictEqual(
      p.delta_saves_24h,
      0,
      `delta_saves_24h on Vault pin must be 0 (never copied from daily_save_velocity), got ${p.delta_saves_24h}`
    );
    assert.strictEqual(p.daily_save_velocity, 1200.0);
    assert.strictEqual(p.effective_24h_gain, 1200.0);
  });

  // =========================================================================
  // SECTION 5: Keyword Footprint Folder Name
  // =========================================================================
  console.log('\n--- SECTION 5: Keyword Footprint Folder Name ---');

  await testAsync('5.1 pin.keywords[].folder_name is populated from row.folders', async () => {
    clearCaches();

    const serpRowsWithFolders = [
      {
        keyword_id: 42,
        keyword_text: 'summer bbq ribs',
        keyword_category: 'Food and Drink',
        folders: [
          { folder_id: 99, folder_name: 'Summer BBQ Campaign', folder_color: '#f97316' }
        ],
        pin_id: 'pin_with_bbq_folder',
        rank_position: 2,
        prev_rank_position: 3,
        title: 'Smoked Honey Bourbon Ribs',
        domain: 'bbqmasters.com',
        destination_url: 'https://bbqmasters.com/ribs',
        image_url: 'https://i.pinimg.com/236x/ribs.jpg',
        creator_username: 'pitmaster_dan',
        board_name: 'BBQ Favorites',
        save_count: 22000,
        repin_count: 7000,
        daily_save_velocity: 450.0,
        delta_repins_24h: 400,
        delta_saves_24h: 450,
        visual_annotations: ['Smoked Ribs', 'BBQ Recipes']
      }
    ];

    const mockSql = createMockSql({ activeSerpRows: serpRowsWithFolders });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const p = payload.breakout_pins.find(pin => pin.pin_id === 'pin_with_bbq_folder');
    assert.ok(p, 'Pin with folder must be present in breakout_pins');
    assert.ok(Array.isArray(p.keywords), 'keywords must be an array');
    assert.ok(p.keywords.length > 0, 'keywords must not be empty');

    const kw = p.keywords.find(k => k.keyword_id === 42);
    assert.ok(kw, 'Keyword 42 must be in pin.keywords');
    assert.strictEqual(
      kw.folder_name,
      'Summer BBQ Campaign',
      `folder_name must be 'Summer BBQ Campaign', got '${kw.folder_name}'`
    );
  });

  // =========================================================================
  // SECTION 6: Domainless Viral Pins Categorization
  // =========================================================================
  console.log('\n--- SECTION 6: Domainless Viral Pins Categorization ---');

  await testAsync('6.1 High-save pins with empty/user/pinterest domains categorized as domainless viral pins', async () => {
    clearCaches();

    const domainTestPins = [
      {
        keyword_id: 1,
        keyword_text: 'easy dinner recipes',
        pin_id: 'domainless_pin_empty',
        rank_position: 1,
        title: 'Viral User Upload Recipe',
        domain: '', // EMPTY DOMAIN
        destination_url: '', // EMPTY URL
        image_url: 'https://i.pinimg.com/236x/user_upload.jpg',
        save_count: 45000,
        repin_count: 12000,
        daily_save_velocity: 320.0,
        delta_repins_24h: 300,
        delta_saves_24h: 320
      },
      {
        keyword_id: 1,
        keyword_text: 'easy dinner recipes',
        pin_id: 'domainless_pin_uploaded_by_user',
        rank_position: 2,
        title: 'Another User Upload Pin',
        domain: 'Uploaded by user', // UPLOADED BY USER
        destination_url: '',
        image_url: 'https://i.pinimg.com/236x/uploaded.jpg',
        save_count: 35000,
        repin_count: 9000,
        daily_save_velocity: 280.0,
        delta_repins_24h: 250,
        delta_saves_24h: 280
      },
      {
        keyword_id: 1,
        keyword_text: 'easy dinner recipes',
        pin_id: 'domainless_pin_pinterest_domain',
        rank_position: 3,
        title: 'Internal Pinterest Pin',
        domain: 'pinterest.com', // PINTEREST.COM
        destination_url: 'https://www.pinterest.com/pin/123456789/',
        image_url: 'https://i.pinimg.com/236x/pinterest_pin.jpg',
        save_count: 28000,
        repin_count: 8000,
        daily_save_velocity: 240.0,
        delta_repins_24h: 200,
        delta_saves_24h: 240
      },
      {
        keyword_id: 1,
        keyword_text: 'easy dinner recipes',
        pin_id: 'commercial_pin_with_blog_domain',
        rank_position: 4,
        title: 'Authentic Food Blog Recipe',
        domain: 'sweetpeasandsaffron.com', // VALID EXTERNAL BLOG DOMAIN
        destination_url: 'https://sweetpeasandsaffron.com/recipe',
        image_url: 'https://i.pinimg.com/236x/blog_pin.jpg',
        save_count: 50000,
        repin_count: 15000,
        daily_save_velocity: 500.0,
        delta_repins_24h: 480,
        delta_saves_24h: 500
      }
    ];

    const mockSql = createMockSql({ activeSerpRows: domainTestPins });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pEmpty = payload.breakout_pins.find(p => p.pin_id === 'domainless_pin_empty');
    const pUploaded = payload.breakout_pins.find(p => p.pin_id === 'domainless_pin_uploaded_by_user');
    const pPinterest = payload.breakout_pins.find(p => p.pin_id === 'domainless_pin_pinterest_domain');
    const pCommercial = payload.breakout_pins.find(p => p.pin_id === 'commercial_pin_with_blog_domain');

    assert.strictEqual(pEmpty.is_domainless_viral, true, 'Empty domain pin must be marked is_domainless_viral');
    assert.strictEqual(pUploaded.is_domainless_viral, true, 'Uploaded by user pin must be marked is_domainless_viral');
    assert.strictEqual(pPinterest.is_domainless_viral, true, 'pinterest.com domain pin must be marked is_domainless_viral');
    assert.strictEqual(pCommercial.is_domainless_viral, false, 'Valid blog domain pin must NOT be marked is_domainless_viral');

    // Verify presence in hidden_gems_telemetry.domainless_viral_pins
    const domainlessList = payload.hidden_gems_telemetry?.domainless_viral_pins || [];
    assert.ok(domainlessList.some(p => p.pin_id === 'domainless_pin_empty'), 'Empty domain pin must be in domainless_viral_pins');
    assert.ok(domainlessList.some(p => p.pin_id === 'domainless_pin_uploaded_by_user'), 'Uploaded by user pin must be in domainless_viral_pins');
    assert.ok(domainlessList.some(p => p.pin_id === 'domainless_pin_pinterest_domain'), 'pinterest.com pin must be in domainless_viral_pins');
    assert.ok(!domainlessList.some(p => p.pin_id === 'commercial_pin_with_blog_domain'), 'Valid blog domain pin must NEVER be in domainless_viral_pins');
  });

  // =========================================================================
  // SECTION 7: Production-Scale JIT Stability & Repeated Profiling
  // =========================================================================
  console.log('\n--- SECTION 7: Production-Scale Profiling (10 Repeated Passes) ---');

  const { buildProductionScaleDataset } = await import('../tests/round16-pulse-503-and-data-truth.test.mjs');
  const prodDataset = buildProductionScaleDataset();
  const prodMockSql = createMockSql({
    activeSerpRows: prodDataset.activeSerpRows,
    vaultPins: prodDataset.vaultPins,
    creatorRows: prodDataset.creatorRows,
    viralCreatorPins: prodDataset.viralCreatorPins,
    capsuleRows: prodDataset.capsuleRows,
    paWinners: prodDataset.paWinners,
    domainRollups: prodDataset.domainRollups,
    vacuumCounts: prodDataset.vacuumCounts
  });

  // Warm-up 2 passes
  await getGlobal24hPulseService(prodMockSql, {}, { forceRefresh: true });
  await getGlobal24hPulseService(prodMockSql, {}, { forceRefresh: true });

  const wallTimes = [];
  const cpuTimes = [];
  const payloadSizesKb = [];

  for (let pass = 1; pass <= 10; pass++) {
    clearCaches();

    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();

    const payload = await getGlobal24hPulseService(prodMockSql, {}, { forceRefresh: true });

    const wallElapsed = performance.now() - wallStart;
    const cpuDiff = process.cpuUsage(cpuStart);
    const cpuElapsed = (cpuDiff.user + cpuDiff.system) / 1000;
    const sizeKb = JSON.stringify(payload).length / 1024;

    wallTimes.push(wallElapsed);
    cpuTimes.push(cpuElapsed);
    payloadSizesKb.push(sizeKb);
  }

  const avgWall = (wallTimes.reduce((a, b) => a + b, 0) / wallTimes.length).toFixed(2);
  const minWall = Math.min(...wallTimes).toFixed(2);
  const maxWall = Math.max(...wallTimes).toFixed(2);

  const avgCpu = (cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length).toFixed(2);
  const minCpu = Math.min(...cpuTimes).toFixed(2);
  const maxCpu = Math.max(...cpuTimes).toFixed(2);

  const avgSize = (payloadSizesKb.reduce((a, b) => a + b, 0) / payloadSizesKb.length).toFixed(1);

  console.log(`  📊 Profiling Results across 10 passes:`);
  console.log(`     Wall Time: Avg ${avgWall}ms (Min: ${minWall}ms, Max: ${maxWall}ms) [SLA: < 80ms]`);
  console.log(`     CPU Time:  Avg ${avgCpu}ms (Min: ${minCpu}ms, Max: ${maxCpu}ms) [SLA: < 50ms]`);
  console.log(`     Payload:   Avg ${avgSize} KB [SLA: < 550 KB]`);

  test('7.1 Repeated execution stays consistently within sub-80ms wall and sub-50ms CPU bounds', () => {
    assert.ok(
      Number(avgWall) < 80,
      `Average wall time (${avgWall}ms) must be strictly < 80ms`
    );
    assert.ok(
      Number(avgCpu) < 50,
      `Average CPU time (${avgCpu}ms) must be strictly < 50ms`
    );
    assert.ok(
      Number(avgSize) < 550,
      `Average payload size (${avgSize} KB) must be strictly < 550 KB`
    );
  });

  console.log('='.repeat(80));
  console.log(`🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED! (${passedTests}/${totalTests})`);
  console.log('='.repeat(80));
}

runEmpiricalChallengerSuite().catch(err => {
  console.error('\n❌ EMPIRICAL HARNESS FAILED:', err);
  process.exit(1);
});
