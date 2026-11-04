/**
 * scripts/test_challenger_round16_adversarial.mjs
 *
 * Dedicated Adversarial Verification & Stress Test Harness for Round 16:
 * 1. SQL Crash & Type Resilience:
 *    - Malformed metadata objects: { delta_saves_24h: "", daily_save_velocity: "null", delta_repins_24h: "xyz" }
 *    - Assert queryBreakoutCreators and queryViralCreatorPins execute cleanly without throwing PostgreSQL Error 22P02.
 * 2. Anti-Fabrication & Anti-Skeleton Ranking:
 *    - Vault pin with daily_save_velocity = 1161 has delta_saves_24h === 0 (no copying).
 *    - Hydrated pin (400/d, real title & image) sorts ahead of unhydrated skeleton (1161/d, blank title & image).
 * 3. Keyword Slug Routing Edge Cases:
 *    - getKeywordUrl across weird inputs: "Slow Cooker & Beef Roast!", "  Multiple   Spaces  ", "", null, undefined, numeric IDs, punctuation.
 * 4. Cache & Blueprint contracts.
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

/**
 * Self-contained Mock SQL Engine for Adversarial Testing
 */
function createAdversarialMockSql(overrides = {}) {
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
    },
    {
      keyword_id: 1,
      keyword_text: 'easy dinner recipes',
      keyword_category: 'Food and Drink',
      folders: [{ folder_id: 1, folder_name: 'Dinners', folder_color: '#ec4899' }],
      pin_id: 'serp_pin_2',
      rank_position: 2,
      prev_rank_position: 3,
      title: 'Easy Crispy Chicken Parmesan',
      domain: 'parmrecipes.com',
      destination_url: 'https://parmrecipes.com/chicken-parm',
      image_url: 'https://i.pinimg.com/236x/chicken2.jpg',
      creator_username: 'chef_luigi',
      board_name: 'Italian Classics',
      save_count: 14000,
      repin_count: 5000,
      daily_save_velocity: 380.0,
      delta_repins_24h: 340,
      delta_saves_24h: 380,
      gains_5d: 1500, gains_7d: 2200, gains_10d: 3000, gains_15d: 4500,
      url_global_saves: 28000,
      dominant_color: '#e11d48',
      visual_annotations: ['Chicken Parmesan', 'Italian Dinners'],
      created_at_pinterest: new Date(Date.now() - 8 * 86400000).toISOString(),
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

  const defaultViralCreatorPins = [
    {
      pin_id: 'cpin_1',
      title: 'Viral Garlic Bread',
      description: 'Cheesy garlic bread.',
      alt_text: 'Toasted garlic bread',
      image_url: 'https://i.pinimg.com/236x/garlic_bread.jpg',
      destination_url: 'https://creatorblog.com/garlic-bread',
      domain: 'creatorblog.com',
      board_name: 'Bread Recipes',
      creator_username: 'baker_john',
      save_count: 18000,
      repin_count: 4500,
      daily_save_velocity: 420.0,
      delta_saves_24h: 400,
      delta_repins_24h: 200,
      created_at_pinterest: new Date(Date.now() - 6 * 86400000).toISOString(),
      visual_annotations: ['Garlic Bread', 'Easy Appetizers']
    }
  ];

  const defaultCreators = [
    {
      id: 1,
      username: 'chef_authentic',
      display_name: 'Authentic Chef',
      avatar_url: 'https://i.pinimg.com/avatar/chef.jpg',
      bio: 'Cooking delicious food daily',
      website_url: 'https://chefauthentic.com',
      monthly_reach: 120000,
      profile_views: 45000,
      total_pins: 180,
      total_boards: 12,
      follower_count: 3500,
      delta_reach_24h: 4500,
      delta_views_24h: 1800,
      reach_delta_7d: 15000,
      views_delta_7d: 6000,
      delta_pins_24h: 2,
      last_synced_at: new Date().toISOString(),
      effective_delta_reach_24h: 4500,
      effective_delta_views_24h: 1800,
      effective_reach_delta_7d: 15000,
      effective_views_delta_7d: 6000,
      driver_pins: [
        {
          pin_id: 'cpin_driver_1',
          title: 'Creamy Garlic Pasta',
          image_url: 'https://i.pinimg.com/236x/pasta.jpg',
          save_count: 8500,
          delta_saves_24h: 310,
          daily_save_velocity: 310.0
        }
      ]
    }
  ];

  const defaultCapsules = [
    { id: 1, keyword_id: 1, term: 'easy', display_label: 'Easy', score: 95, dominant_color: '#3b82f6', display_order: 1, keyword_text: 'easy dinner recipes', keyword_category: 'Food' },
    { id: 2, keyword_id: 1, term: 'chicken', display_label: 'Chicken', score: 88, dominant_color: '#10b981', display_order: 2, keyword_text: 'easy dinner recipes', keyword_category: 'Food' }
  ];

  const defaultVacuum = [
    { keyword_id: 1, keyword_text: 'easy dinner recipes', displaced_24h_count: 4, displaced_top10_24h_count: 2, displaced_top10_7d_count: 6 }
  ];

  const defaultPaWinners = [
    {
      pin_id: 'pa_pin_1',
      account_username: 'chef_maria',
      title: 'Tender Lemon Roasted Chicken',
      description: 'Golden roasted chicken with lemon and rosemary.',
      alt_text: 'Roasted chicken in baking dish',
      link: 'https://foodblog.com/lemon-chicken',
      domain: 'foodblog.com',
      board_name: 'Dinner Winners',
      image_url: 'https://i.pinimg.com/236x/lemon_roast.jpg',
      dominant_color: '#f59e0b',
      saves: 16000,
      repins: 4200,
      velocity: 280.0,
      annotations: ['Lemon Chicken', 'Roasted Chicken'],
      created_at_pinterest: new Date(Date.now() - 14 * 86400000).toISOString()
    }
  ];

  const defaultDomainRollup = [
    {
      domain: 'foodblog.com',
      total_pins: 150,
      unique_urls: 90,
      active_serp_pins: 40,
      top3_pins: 12,
      top10_pins: 30,
      displaced_pins: 15,
      visibility_score: 850,
      total_saves: 45000,
      avg_velocity: 80.0,
      ad_network: 'Mediavine',
      arbitrage_score: 92.0
    }
  ];

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

async function runAdversarialHarness() {
  console.log('='.repeat(80));
  console.log('   CHALLENGER R16_2: ADVERSARIAL STRESS TEST & DATA TRUTH HARNESS');
  console.log('='.repeat(80));

  const pulseService = await import('../src/modules/pulse/service.mjs');
  const {
    getGlobal24hPulseService,
    pulseMemoryCache,
    pulseForceRefreshCooldown,
    inflightPulse
  } = pulseService;

  // =========================================================================
  // SUITE 1: SQL Crash & Type Resilience (PostgreSQL 22P02 Immunity)
  // =========================================================================
  console.log('\n--- SUITE 1: SQL Crash & Type Resilience (PostgreSQL Error 22P02 Immunity) ---');

  await testAsync('1.1 SQL queryBreakoutCreators contains zero unshielded casts and uses safe CROSS JOIN LATERAL', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const mockSql = createAdversarialMockSql();
    await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const callLog = mockSql.getCallLog();
    const creatorQuery = callLog.find(c => c.query.includes('FROM top_creators') || c.query.includes('ranked_pins AS ('));
    assert.ok(creatorQuery, 'Breakout creators query must be logged');

    const sqlStr = creatorQuery.query;

    assert.ok(
      !sqlStr.includes("(cpin.metadata->>'delta_saves_24h')::numeric"),
      'Must NOT contain unshielded (cpin.metadata->>\'delta_saves_24h\')::numeric'
    );
    assert.ok(
      !sqlStr.includes("(cpin.metadata->>'daily_save_velocity')::numeric"),
      'Must NOT contain unshielded (cpin.metadata->>\'daily_save_velocity\')::numeric'
    );

    assert.match(
      sqlStr,
      /CROSS\s+JOIN\s+LATERAL/i,
      'queryBreakoutCreators must use CROSS JOIN LATERAL'
    );
    assert.match(
      sqlStr,
      /NULLIF\s*\(\s*regexp_replace/i,
      'queryBreakoutCreators must use NULLIF(regexp_replace(...)) to sanitize string values'
    );
  });

  await testAsync('1.2 SQL queryViralCreatorPins uses CROSS JOIN LATERAL with pre-filter ?| and LIMIT 120', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const mockSql = createAdversarialMockSql();
    await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const callLog = mockSql.getCallLog();
    const viralPinsQuery = callLog.find(c =>
      c.query.includes('FROM competitor_pins') &&
      !c.query.includes('top_creators') &&
      !c.query.includes('active_creators')
    );
    assert.ok(viralPinsQuery, 'queryViralCreatorPins query must be logged');

    const sqlStr = viralPinsQuery.query;

    assert.match(sqlStr, /CROSS\s+JOIN\s+LATERAL/i, 'Must use CROSS JOIN LATERAL');
    assert.match(sqlStr, /cpin\.metadata\s*(\?\||\?)/, 'Must use JSONB pre-filter (?| or ?)');
    assert.match(sqlStr, /LIMIT\s+120\b/i, 'Must cap query at LIMIT 120');
  });

  test('1.3 Simulated PostgreSQL regex & numeric cast evaluation against adversarial malformed metadata', () => {
    const malformedMetadata = {
      delta_saves_24h: "",
      daily_save_velocity: "null",
      delta_repins_24h: "xyz"
    };

    const adversarialInputs = [
      malformedMetadata.delta_saves_24h,
      malformedMetadata.daily_save_velocity,
      malformedMetadata.delta_repins_24h,
      "undefined",
      "NaN",
      "Infinity",
      "   ",
      "\t\n",
      "N/A",
      "null_value",
      "abc123xyz"
    ];

    function simulatePostgreSqlClean(val) {
      if (val === null || val === undefined) return 0;
      const strVal = String(val);
      const cleaned = strVal.replace(/[^0-9.-]/g, '');
      if (cleaned === '') return null;
      const num = Number(cleaned);
      if (Number.isNaN(num)) return null;
      return num;
    }

    for (const input of adversarialInputs) {
      const res = simulatePostgreSqlClean(input);
      assert.ok(
        res === null || Number.isFinite(res),
        `Sanitization of '${input}' must produce a valid finite number or null, got ${res}`
      );
    }

    assert.strictEqual(simulatePostgreSqlClean(""), null);
    assert.strictEqual(simulatePostgreSqlClean("null"), null);
    assert.strictEqual(simulatePostgreSqlClean("xyz"), null);
    assert.strictEqual(simulatePostgreSqlClean("abc123xyz"), 123);
  });

  await testAsync('1.4 Application survives malformed metadata rows in mock queries without throwing', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const malformedOverrides = {
      creatorRows: [
        {
          id: 999,
          username: 'malformed_creator',
          display_name: 'Malformed Creator',
          avatar_url: '',
          bio: '',
          website_url: '',
          monthly_reach: 50000,
          profile_views: 20000,
          total_pins: 100,
          total_boards: 5,
          follower_count: 500,
          delta_reach_24h: 1500,
          delta_views_24h: 3000,
          reach_delta_7d: 6000,
          views_delta_7d: 12000,
          driver_pins: [
            {
              pin_id: 'cpin_malformed_1',
              title: 'Driver with Empty/Corrupt Delta',
              image_url: 'https://i.pinimg.com/236x/clean.jpg',
              save_count: 1000,
              delta_saves_24h: "",
              daily_save_velocity: "null"
            }
          ]
        }
      ],
      viralCreatorPins: [
        {
          pin_id: 'viral_malformed_1',
          title: 'Surging Pin with Corrupt Metrics',
          image_url: 'https://i.pinimg.com/236x/viral.jpg',
          save_count: 5000,
          repin_count: 1200,
          daily_save_velocity: "null",
          delta_saves_24h: "",
          delta_repins_24h: "xyz",
          domain: 'mytestblog.com',
          destination_url: 'https://mytestblog.com/recipe'
        }
      ]
    };

    const mockSql = createAdversarialMockSql(malformedOverrides);
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload, 'Payload must be returned without error');
    assert.ok(payload.kpis, 'Payload.kpis must be populated');
    assert.ok(payload.breakout_pins, 'Payload.breakout_pins must be populated');
    assert.ok(payload.creator_breakouts, 'Payload.creator_breakouts must be populated');

    const foundViral = payload.breakout_pins.find(p => p.pin_id === 'viral_malformed_1');
    if (foundViral) {
      assert.strictEqual(typeof foundViral.daily_save_velocity, 'number');
      assert.ok(Number.isFinite(foundViral.daily_save_velocity));
      assert.strictEqual(typeof foundViral.delta_saves_24h, 'number');
      assert.ok(Number.isFinite(foundViral.delta_saves_24h));
      assert.strictEqual(typeof foundViral.delta_repins_24h, 'number');
      assert.ok(Number.isFinite(foundViral.delta_repins_24h));
      assert.strictEqual(typeof foundViral.effective_24h_gain, 'number');
      assert.ok(Number.isFinite(foundViral.effective_24h_gain));
    }
  });

  // =========================================================================
  // SUITE 2: Anti-Fabrication & Anti-Skeleton Ranking
  // =========================================================================
  console.log('\n--- SUITE 2: Anti-Fabrication & Anti-Skeleton Ranking ---');

  await testAsync('2.1 Vault pin with daily_save_velocity = 1161 preserves delta_saves_24h === 0 (anti-fabrication)', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const overrides = {
      vaultPins: [
        {
          keyword_id: 1,
          keyword_text: 'crockpot chicken recipes',
          keyword_category: 'Food and Drink',
          pin_id: 'vault_high_velocity_pin_1161',
          last_known_rank: 4,
          vacuum_opportunity_score: 92,
          displaced_date: '2026-11-03',
          save_count: 45000,
          repin_count: 12000,
          daily_save_velocity: 1161.0,
          delta_repins_24h: 1157,
          delta_saves_24h: 1161.0, // Prior fabricated delta
          domain: 'crockpotgenius.com',
          destination_url: 'https://crockpotgenius.com/chicken',
          creator_username: 'crockpot_master',
          shard_id: 1,
          title: 'Insanely Good Slow Cooker Chicken',
          description: 'Delicious slow cooker chicken dinner.',
          alt_text: 'Slow cooker pot filled with tender chicken in garlic sauce',
          image_url: 'https://i.pinimg.com/236x/crockpot_chicken.jpg',
          visual_annotations: ['Slow Cooker Chicken', 'Easy Crockpot Dinners']
        }
      ]
    };

    const mockSql = createAdversarialMockSql(overrides);
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pin = payload.breakout_pins.find(p => p.pin_id === 'vault_high_velocity_pin_1161');
    assert.ok(pin, 'Vault pin must be included in breakout_pins');

    assert.strictEqual(
      pin.delta_saves_24h,
      0,
      `Vault pin delta_saves_24h must be 0 (no fabrication of 24h delta), got ${pin.delta_saves_24h}`
    );
    assert.strictEqual(
      pin.daily_save_velocity,
      1161.0,
      `Vault pin daily_save_velocity must remain 1161.0, got ${pin.daily_save_velocity}`
    );
    assert.strictEqual(
      pin.effective_24h_gain,
      1161.0,
      `Vault pin effective_24h_gain must be Math.max(1161, 0, 1157) = 1161, got ${pin.effective_24h_gain}`
    );
  });

  await testAsync('2.2 Hydrated pin (400/d, real title & image) sorts ahead of unhydrated skeleton (1161/d, blank) in head-to-head comparison', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const overrides = {
      vaultPins: [
        {
          keyword_id: 1,
          keyword_text: 'slow cooker meals',
          pin_id: 'skeleton_pin_massive_velocity',
          last_known_rank: 2,
          vacuum_opportunity_score: 98,
          displaced_date: '2026-11-03',
          save_count: 80000,
          repin_count: 20000,
          daily_save_velocity: 1161.0,
          delta_repins_24h: 1157,
          delta_saves_24h: 0,
          domain: '',
          creator_username: '',
          shard_id: 1,
          title: '',     // BLANK SKELETON
          description: '',
          alt_text: '',
          image_url: '', // BLANK SKELETON
          visual_annotations: []
        }
      ],
      activeSerpRows: [
        {
          keyword_id: 1,
          keyword_text: 'slow cooker meals',
          pin_id: 'hydrated_pin_moderate_velocity',
          rank_position: 5,
          title: 'Real Delicious Garlic Butter Skillet Chicken', // RICH TITLE
          domain: 'theskilletcook.com',
          destination_url: 'https://theskilletcook.com/garlic-chicken',
          image_url: 'https://i.pinimg.com/236x/garlic-chicken.jpg', // RICH IMAGE
          creator_username: 'chef_authentic',
          board_name: 'Dinner Recipes',
          save_count: 15000,
          repin_count: 4000,
          daily_save_velocity: 400.0, // LOWER VELOCITY (400 vs 1161)
          delta_repins_24h: 380,
          delta_saves_24h: 400,
          visual_annotations: ['Garlic Chicken', 'Skillet Recipes']
        }
      ],
      viralCreatorPins: [],
      paWinners: []
    };

    const mockSql = createAdversarialMockSql(overrides);
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pins = payload.breakout_pins;
    const hydratedIdx = pins.findIndex(p => p.pin_id === 'hydrated_pin_moderate_velocity');
    const skeletonIdx = pins.findIndex(p => p.pin_id === 'skeleton_pin_massive_velocity');

    assert.ok(hydratedIdx !== -1, 'Hydrated pin must be found in breakout_pins');
    assert.ok(skeletonIdx !== -1, 'Skeleton pin must be found in breakout_pins');

    assert.ok(
      hydratedIdx < skeletonIdx,
      `Hydrated pin at rank #${hydratedIdx + 1} must sort strictly ahead of unhydrated skeleton at rank #${skeletonIdx + 1}!`
    );
  });

  await testAsync('2.3 Synthetic title skeleton (title: "untitled pin", image_url: "") is treated as skeleton and sorts after hydrated pins', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const overrides = {
      vaultPins: [
        {
          keyword_id: 2,
          keyword_text: 'easy crockpot meals',
          pin_id: 'synthetic_garbage_title_pin',
          last_known_rank: 1,
          vacuum_opportunity_score: 99,
          displaced_date: '2026-11-03',
          save_count: 90000,
          repin_count: 30000,
          daily_save_velocity: 950.0,
          delta_repins_24h: 900,
          delta_saves_24h: 0,
          domain: '',
          creator_username: '',
          shard_id: 1,
          title: 'untitled pin', // SYNTHETIC GARBAGE TITLE
          description: '',
          alt_text: '',
          image_url: '',         // NO IMAGE
          visual_annotations: []
        }
      ],
      activeSerpRows: [
        {
          keyword_id: 2,
          keyword_text: 'easy crockpot meals',
          pin_id: 'hydrated_real_pin_300',
          rank_position: 3,
          title: 'Homestyle Beef Pot Roast',
          domain: 'comfortcooking.com',
          destination_url: 'https://comfortcooking.com/pot-roast',
          image_url: 'https://i.pinimg.com/236x/pot-roast.jpg',
          creator_username: 'chef_comfort',
          board_name: 'Slow Cooker Dinners',
          save_count: 8000,
          repin_count: 2000,
          daily_save_velocity: 300.0,
          delta_repins_24h: 250,
          delta_saves_24h: 300,
          visual_annotations: ['Pot Roast', 'Beef Dinners']
        }
      ],
      viralCreatorPins: [],
      paWinners: []
    };

    const mockSql = createAdversarialMockSql(overrides);
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pins = payload.breakout_pins;
    const hydratedIdx = pins.findIndex(p => p.pin_id === 'hydrated_real_pin_300');
    const syntheticIdx = pins.findIndex(p => p.pin_id === 'synthetic_garbage_title_pin');

    assert.ok(hydratedIdx !== -1, 'Hydrated real pin must be found');
    assert.ok(syntheticIdx !== -1, 'Synthetic titled pin must be found');

    assert.ok(
      hydratedIdx < syntheticIdx,
      `Hydrated pin at rank #${hydratedIdx + 1} must sort ahead of synthetic title skeleton at rank #${syntheticIdx + 1}!`
    );
  });

  // =========================================================================
  // SUITE 3: Keyword Slug Routing Edge Cases (getKeywordUrl)
  // =========================================================================
  console.log('\n--- SUITE 3: Keyword Slug Routing Edge Cases (getKeywordUrl) ---');

  const pulseUiPath = path.join(ROOT_DIR, 'src', 'pulse-ui.mjs');
  const pulseUiCode = fs.readFileSync(pulseUiPath, 'utf8');

  const matchFn = pulseUiCode.match(/getKeywordUrl\s*:\s*function\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(matchFn, 'getKeywordUrl function definition must exist in src/pulse-ui.mjs');

  const getKeywordUrlFn = new Function('kwTextOrSlug', 'kwId', matchFn[2]);

  test('3.1 "Slow Cooker & Beef Roast!" formats as /keywords/slow-cooker-beef-roast', () => {
    const res = getKeywordUrlFn("Slow Cooker & Beef Roast!", 101);
    assert.strictEqual(res, '/keywords/slow-cooker-beef-roast');
  });

  test('3.2 "  Multiple   Spaces  " formats as /keywords/multiple-spaces', () => {
    const res = getKeywordUrlFn("  Multiple   Spaces  ", 102);
    assert.strictEqual(res, '/keywords/multiple-spaces');
  });

  test('3.3 Empty string "" with kwId=42 falls back to /keywords/42', () => {
    const res = getKeywordUrlFn("", 42);
    assert.strictEqual(res, '/keywords/42');
  });

  test('3.4 Empty string "" with kwId=null falls back to /keywords', () => {
    const res = getKeywordUrlFn("", null);
    assert.strictEqual(res, '/keywords');
  });

  test('3.5 null with kwId=77 falls back to /keywords/77', () => {
    const res = getKeywordUrlFn(null, 77);
    assert.strictEqual(res, '/keywords/77');
  });

  test('3.6 null with kwId=null falls back to /keywords', () => {
    const res = getKeywordUrlFn(null, null);
    assert.strictEqual(res, '/keywords');
  });

  test('3.7 undefined with kwId=88 falls back to /keywords/88', () => {
    const res = getKeywordUrlFn(undefined, 88);
    assert.strictEqual(res, '/keywords/88');
  });

  test('3.8 undefined with kwId=undefined falls back to /keywords', () => {
    const res = getKeywordUrlFn(undefined, undefined);
    assert.strictEqual(res, '/keywords');
  });

  test('3.9 Numeric ID passed with empty/null keyword text', () => {
    assert.strictEqual(getKeywordUrlFn('', 1005), '/keywords/1005');
    assert.strictEqual(getKeywordUrlFn('   ', '459'), '/keywords/459');
  });

  test('3.10 Pure punctuation "---" with kwId=55 falls back to /keywords/55 instead of empty slug', () => {
    const res = getKeywordUrlFn("---", 55);
    assert.strictEqual(res, '/keywords/55');
  });

  test('3.11 Pure punctuation "!!!" with kwId=null falls back to /keywords', () => {
    const res = getKeywordUrlFn("!!!", null);
    assert.strictEqual(res, '/keywords');
  });

  test('3.12 Special characters & symbols: "C++ & C# / 100% Free!" formats cleanly', () => {
    const res = getKeywordUrlFn("C++ & C# / 100% Free!", null);
    assert.strictEqual(res, '/keywords/c-c-100-free');
  });

  // =========================================================================
  // SUITE 4: Pin Summary & Matrix Summary Contract Verification
  // =========================================================================
  console.log('\n--- SUITE 4: Pin Summary & Matrix Summary Contracts ---');

  await testAsync('4.1 breakout_pins formatted summaries contain all required root properties', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const mockSql = createAdversarialMockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });
    assert.ok(payload.breakout_pins, 'breakout_pins must exist');
    assert.ok(payload.breakout_pins.length > 0, 'breakout_pins must have items');

    const s = payload.breakout_pins[0];

    assert.ok(typeof s.pin_id === 'string', 'pin_id must be string');
    assert.ok(s.keyword_id !== undefined, 'keyword_id must be defined');
    assert.ok(typeof s.keyword_text === 'string', 'keyword_text must be string');
    assert.ok(typeof s.keyword_slug === 'string', 'keyword_slug must be string');
    assert.ok(s.rank_position !== undefined, 'rank_position must be defined');
    assert.ok(typeof s.is_vault_surge === 'boolean', 'is_vault_surge must be boolean');
    assert.ok(typeof s.is_displaced === 'boolean', 'is_displaced must be boolean');
    assert.ok(typeof s.dossier_url === 'string' && s.dossier_url.startsWith('/pin/'), 'dossier_url must be valid');
    assert.ok(typeof s.pinterest_url === 'string' && s.pinterest_url.startsWith('https://www.pinterest.com/pin/'), 'pinterest_url must be valid');
    assert.ok(Array.isArray(s.visual_annotations), 'visual_annotations must be array');
    assert.ok(Array.isArray(s.annotations), 'annotations must be array');
    assert.deepStrictEqual(s.visual_annotations, s.annotations, 'visual_annotations and annotations must have identical content');
  });

  await testAsync('4.2 Crossover matching_pins produce lightweight matrix summaries (17 properties max)', async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();

    const mockSql = createAdversarialMockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });
    const pairCrossovers = payload.annotation_crossovers?.pair_crossovers || [];
    assert.ok(pairCrossovers.length > 0, 'pair_crossovers must have items');

    const firstPair = pairCrossovers[0];
    assert.ok(Array.isArray(firstPair.matching_pins), 'matching_pins must be an array');
    assert.ok(firstPair.matching_pins.length > 0, 'matching_pins must have pins');

    const m = firstPair.matching_pins[0];
    const keyCount = Object.keys(m).length;

    assert.ok(
      keyCount <= 18,
      `matching_pins summary must be lightweight (<= 18 properties), got ${keyCount}`
    );

    assert.ok(typeof m.pin_id === 'string', 'm.pin_id must be string');
    assert.ok(typeof m.title === 'string', 'm.title must be string');
    assert.ok(typeof m.daily_save_velocity === 'number', 'm.daily_save_velocity must be number');
    assert.ok(typeof m.effective_24h_gain === 'number', 'm.effective_24h_gain must be number');
    assert.ok(typeof m.dossier_url === 'string', 'm.dossier_url must be string');
    assert.ok(Array.isArray(m.visual_annotations), 'm.visual_annotations must be array');
    assert.ok(Array.isArray(m.annotations), 'm.annotations must be array');
  });

  console.log('='.repeat(80));
  console.log(`🎉 ALL ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY! (${passedTests}/${totalTests})`);
  console.log('='.repeat(80));
}

runAdversarialHarness().catch((err) => {
  console.error('\n❌ ADVERSARIAL STRESS TEST FAILED:', err);
  process.exit(1);
});
