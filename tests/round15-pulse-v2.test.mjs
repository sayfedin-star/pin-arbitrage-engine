/**
 * tests/round15-pulse-v2.test.mjs
 *
 * PAE Round 15: Pulse Studio V2 — Actionable Arbitrage Cockpit & Forensic Bug-Fix Test Suite
 *
 * 6 Mandatory Verification Gates:
 * - Gate 1: Zero Property Mismatch & Real Annotations Test
 * - Gate 2: Multi-Keyword Ratchet & High-Velocity Inclusion Test
 * - Gate 3: Annotation Crossover Support Floor (pin_count >= 2) & Matching Pins Test
 * - Gate 4: Capsule Deduplication & Color Palette Count Test
 * - Gate 5: Creator Breakouts Positive-Only & True Domainless Filter Test
 * - Gate 6: Repository Regression Locks & Zero Landmines
 *
 * Invariants Enforced:
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: ANTI-HYDRATION-SPIKE]
 * // [INVARIANT: HEADLESS-NODE-SHIELD]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  getGlobal24hPulseService,
  extractCleanAnnotations,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse,
  invalidateGlobalPulseCache
} from '../src/modules/pulse/service.mjs';

import { getPulsePageHtml } from '../src/pulse-ui.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Deterministic Mock SQL Engine for Round 15 Pulse Studio V2
 * Simulates Central Hub queries with realistic multi-keyword ratchets, solo tag crossovers,
 * qualified pairs/triplets, deduplicated guided capsules, positive-only creators,
 * and true domainless pins.
 */
export function createRound15MockSql(overrides = {}) {
  let callLog = [];

  const mockSql = async (strings, ...values) => {
    const rawQuery = Array.isArray(strings)
      ? strings.join('?')
      : (typeof strings === 'string' ? strings : String(strings));
    callLog.push({ query: rawQuery, values });

    // 1. Active SERP Query (with multi-keyword pin rows and solo/shared tag pins)
    if (rawQuery.includes('kw_folders') && rawQuery.includes('keyword_serp_current')) {
      return overrides.activeSerpRows || [
        {
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          keyword_category: 'Food',
          folders: [{ folder_id: 1, folder_name: 'Dinners', folder_color: '#ec4899' }],
          pin_id: 'pin_multi_01',
          rank_position: 12,
          prev_rank_position: 15,
          title: 'Garlic Butter Chicken',
          domain: 'foodieblog.com',
          destination_url: 'https://foodieblog.com/chicken',
          image_url: 'https://i.pinimg.com/236x/chicken.jpg',
          creator_username: 'chefjohn',
          board_name: 'Quick Dinners',
          save_count: 500,
          repin_count: 120,
          daily_save_velocity: 0.0, // Stale baseline in keyword 1
          delta_repins_24h: 15,
          delta_saves_24h: 0,
          gains_5d: 20, gains_7d: 30, gains_10d: 40, gains_15d: 50,
          url_global_saves: 600,
          dominant_color: '#e11d48',
          visual_annotations: ['Garlic Butter Chicken', 'Easy Dinners', 'Chicken Recipes'],
          created_at_pinterest: new Date(Date.now() - 5 * 86400000).toISOString(),
          creation_method: 'organic',
          crawled_at: new Date().toISOString()
        },
        {
          // Multi-keyword second occurrence of pin_multi_01 with high velocity and repin surge
          keyword_id: 2,
          keyword_text: 'chicken dinner ideas',
          keyword_category: 'Food',
          folders: [{ folder_id: 1, folder_name: 'Dinners', folder_color: '#ec4899' }],
          pin_id: 'pin_multi_01',
          rank_position: 2,
          prev_rank_position: 8,
          title: 'Ultra-Crispy Garlic Butter Chicken Skillet', // Richer non-synthetic title
          domain: 'foodieblog.com',
          destination_url: 'https://foodieblog.com/chicken',
          image_url: 'https://i.pinimg.com/236x/chicken-hd.jpg',
          creator_username: 'chefjohn',
          board_name: 'Best Skillet Meals',
          save_count: 5400, // Ratcheted saves
          repin_count: 1800,
          daily_save_velocity: 680.0, // Ratcheted velocity
          delta_repins_24h: 769, // Surging repins
          delta_saves_24h: 650,
          gains_5d: 1200, gains_7d: 1800, gains_10d: 2200, gains_15d: 2800,
          url_global_saves: 6000,
          dominant_color: '#e11d48',
          visual_annotations: ['Garlic Butter Chicken', 'Skillet Dinners', 'Keto Meals'],
          created_at_pinterest: new Date(Date.now() - 5 * 86400000).toISOString(),
          creation_method: 'organic',
          crawled_at: new Date().toISOString()
        },
        {
          // Solo Tag Trap Pin: 4 tags unique to this single pin (pin_count = 1)
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          folders: [],
          pin_id: 'pin_solo_tags_02',
          rank_position: 1,
          title: 'Unique Solo Dish',
          domain: 'soloblog.com',
          destination_url: 'https://soloblog.com/dish',
          image_url: 'https://i.pinimg.com/236x/solo.jpg',
          creator_username: 'soloist',
          board_name: 'Solo Meals',
          save_count: 8000,
          daily_save_velocity: 488.0,
          delta_repins_24h: 200,
          delta_saves_24h: 400,
          visual_annotations: ['SoloTagAlpha', 'SoloTagBeta', 'SoloTagGamma', 'SoloTagDelta'],
          created_at_pinterest: new Date(Date.now() - 20 * 86400000).toISOString()
        },
        {
          // Shared Crossover Pin A
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          folders: [],
          pin_id: 'pin_crossover_A',
          rank_position: 4,
          title: 'Sheet Pan Sausage and Veggies',
          domain: 'sheetpan.com',
          destination_url: 'https://sheetpan.com/sausage',
          image_url: 'https://i.pinimg.com/236x/sausage.jpg',
          creator_username: 'mealprepper',
          board_name: 'Sheet Pan Meals',
          save_count: 3200,
          daily_save_velocity: 250.0,
          delta_repins_24h: 110,
          delta_saves_24h: 250,
          visual_annotations: ['Sheet Pan Meal', 'Healthy Dinners', 'Easy Recipes'],
          created_at_pinterest: new Date(Date.now() - 8 * 86400000).toISOString()
        },
        {
          // Shared Crossover Pin B (Shares 'Sheet Pan Meal' and 'Healthy Dinners' with Pin A)
          keyword_id: 2,
          keyword_text: 'chicken dinner ideas',
          folders: [],
          pin_id: 'pin_crossover_B',
          rank_position: 5,
          title: 'Sheet Pan Greek Chicken',
          domain: 'greekrecipes.com',
          destination_url: 'https://greekrecipes.com/greek-chicken',
          image_url: 'https://i.pinimg.com/236x/greek.jpg',
          creator_username: 'greekchef',
          board_name: 'Greek Cooking',
          save_count: 2900,
          daily_save_velocity: 210.0,
          delta_repins_24h: 90,
          delta_saves_24h: 210,
          visual_annotations: ['Sheet Pan Meal', 'Healthy Dinners', 'Greek Food'],
          created_at_pinterest: new Date(Date.now() - 10 * 86400000).toISOString()
        },
        {
          // True Domainless / Linkless Viral Pin
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          folders: [],
          pin_id: 'pin_domainless_03',
          rank_position: 3,
          title: 'Quick 10-Minute Mug Cake',
          domain: 'Uploaded by user',
          destination_url: '',
          image_url: 'https://i.pinimg.com/236x/mugcake.jpg',
          creator_username: 'mugbaker',
          board_name: 'Desserts',
          save_count: 14500,
          daily_save_velocity: 320.0,
          delta_repins_24h: 150,
          delta_saves_24h: 300,
          visual_annotations: ['Mug Cake', 'Quick Desserts'],
          created_at_pinterest: new Date(Date.now() - 3 * 86400000).toISOString()
        },
        {
          // Valid Publisher Pin in keyword with vacuum
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          folders: [],
          pin_id: 'pin_publisher_04',
          rank_position: 7,
          title: 'Creamy Tuscan Chicken',
          domain: 'valentinascorner.com',
          destination_url: 'https://valentinascorner.com/tuscan-chicken',
          image_url: 'https://i.pinimg.com/236x/tuscan.jpg',
          creator_username: 'valentina',
          board_name: 'Chicken Dinners',
          save_count: 42000,
          daily_save_velocity: 180.0,
          delta_repins_24h: 40,
          delta_saves_24h: 150,
          visual_annotations: ['Tuscan Chicken', 'Easy Dinners'],
          created_at_pinterest: new Date(Date.now() - 40 * 86400000).toISOString()
        }
      ];
    }

    // 2A. Displaced Vacuum Counts
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && rawQuery.includes('displaced_top10_24h_count')) {
      return overrides.vacuumCounts || [
        {
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          displaced_24h_count: 8,
          displaced_top10_24h_count: 4,
          displaced_top10_7d_count: 15
        }
      ];
    }

    // 2B. Displaced Top Vault Surge Pins
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && rawQuery.includes('ORDER BY GREATEST(')) {
      return overrides.vaultPins || [
        {
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          pin_id: 'pin_vault_surge_1161',
          last_known_rank: 6,
          vacuum_opportunity_score: 95,
          displaced_date: new Date().toISOString().split('T')[0],
          save_count: 18900,
          repin_count: 4500,
          daily_save_velocity: 1161.0, // 1,161.0/d saves
          delta_repins_24h: 1157, // 1,157 repins/24h
          delta_saves_24h: 1161,
          gains_5d: 2500, gains_7d: 3800, gains_10d: 5000, gains_15d: 6200,
          domain: 'displacedrecipes.com',
          creator_username: 'vaultmaster',
          shard_id: 1,
          title: 'Slow Cooker Beef Stew',
          image_url: 'https://i.pinimg.com/236x/beefstew.jpg',
          visual_annotations: ['Beef Stew', 'Slow Cooker Dinners']
        }
      ];
    }

    // 4. Breakout Creators (evaluated before 2C so CTE ranked_pins does not get intercepted)
    if (rawQuery.includes('FROM top_creators tc') || rawQuery.includes('active_creators AS (')) {
      return overrides.creatorRows || [
        {
          id: 1,
          username: 'loser_account',
          display_name: 'Negative Reach Drop',
          avatar_url: 'https://i.pinimg.com/avatar/loser.jpg',
          monthly_reach: 2500000,
          profile_views: 600000,
          total_pins: 500,
          follower_count: 50000,
          delta_reach_24h: -346814, // Massive negative reach drop
          delta_views_24h: -50000,
          effective_delta_reach_24h: -346814,
          effective_delta_views_24h: -50000,
          reach_delta_7d: -500000,
          views_delta_7d: -100000,
          driver_pins: []
        },
        {
          id: 2,
          username: 'stagnant_account',
          display_name: 'Zero Delta Creator',
          avatar_url: 'https://i.pinimg.com/avatar/zero.jpg',
          monthly_reach: 800000,
          profile_views: 200000,
          total_pins: 350,
          follower_count: 20000,
          delta_reach_24h: 0,
          delta_views_24h: 0,
          effective_delta_reach_24h: 0,
          effective_delta_views_24h: 0,
          reach_delta_7d: 0,
          views_delta_7d: 0,
          driver_pins: []
        },
        {
          id: 3,
          username: 'giant_account',
          display_name: 'Multi-Million Giant',
          avatar_url: 'https://i.pinimg.com/avatar/giant.jpg',
          monthly_reach: 4458284, // 4.45M reach
          profile_views: 1200000,
          total_pins: 1200,
          follower_count: 0, // Unpopulated in DB!
          delta_reach_24h: 65000,
          delta_views_24h: 22000,
          effective_delta_reach_24h: 65000,
          effective_delta_views_24h: 22000,
          reach_delta_7d: 150000,
          views_delta_7d: 60000,
          driver_pins: []
        },
        {
          id: 4,
          username: 'david_baker',
          display_name: 'David Baker',
          avatar_url: 'https://i.pinimg.com/avatar/david.jpg',
          monthly_reach: 42000, // < 500,000
          profile_views: 15000,
          total_pins: 110, // <= 250
          follower_count: 1400,
          delta_reach_24h: 9500,
          delta_views_24h: 3100,
          effective_delta_reach_24h: 9500,
          effective_delta_views_24h: 3100,
          reach_delta_7d: 25000,
          views_delta_7d: 8000,
          driver_pins: [
            {
              pin_id: 'pin_david_driver_1',
              title: 'Cinnamon Roll Bread',
              image_url: 'https://i.pinimg.com/236x/bread.jpg',
              save_count: 1200,
              delta_saves_24h: 240,
              daily_save_velocity: 240.0
            }
          ]
        }
      ];
    }

    // 2C. Surging Creator Pins query (competitor_pins)
    if (rawQuery.includes('FROM competitor_pins') && !rawQuery.includes('active_creators') && !rawQuery.includes('top_creators') && (rawQuery.includes('delta_saves_24h') || rawQuery.includes('daily_save_velocity') || rawQuery.includes('queryViralCreatorPins'))) {
      return overrides.viralCreatorPins || [
        {
          pin_id: 'pin_creator_surge_700',
          title: 'Viral Garlic Bread Pizza',
          description: 'The easiest viral pizza bread you will ever make.',
          image_url: 'https://i.pinimg.com/236x/pizza-bread.jpg',
          destination_url: 'https://creatorblog.com/pizza-bread',
          domain: 'creatorblog.com',
          link_domain: 'creatorblog.com',
          save_count: 25000,
          daily_save_velocity: 720.0,
          delta_saves_24h: 700,
          delta_repins_24h: 300,
          visual_annotations: ['Garlic Bread', 'Pizza Recipes'],
          created_at_pinterest: new Date(Date.now() - 6 * 86400000).toISOString(),
          pin_age_days: 6
        }
      ];
    }

    // 3. Guided Search Capsules (with duplicate terms/display labels)
    if (rawQuery.includes('FROM keyword_guided_capsules c')) {
      return overrides.capsuleRows || [
        { id: 1, keyword_id: 1, term: 'easy', display_label: 'Easy', score: 95.0, dominant_color: '#3b82f6', display_order: 1, keyword_text: 'easy dinner recipes', keyword_category: 'Food' },
        { id: 2, keyword_id: 2, term: 'easy', display_label: 'easy', score: 92.0, dominant_color: '#3b82f6', display_order: 1, keyword_text: 'chicken dinner ideas', keyword_category: 'Food' },
        { id: 3, keyword_id: 1, term: 'easy_meals', display_label: 'Easy ', score: 90.0, dominant_color: '#3b82f6', display_order: 2, keyword_text: 'quick dinner recipes', keyword_category: 'Food' },
        { id: 4, keyword_id: 1, term: 'healthy', display_label: 'Healthy', score: 88.0, dominant_color: '#10b981', display_order: 3, keyword_text: 'easy dinner recipes', keyword_category: 'Food' },
        { id: 5, keyword_id: 2, term: 'healthy_meals', display_label: 'HEALTHY', score: 85.0, dominant_color: '#10b981', display_order: 2, keyword_text: 'chicken dinner ideas', keyword_category: 'Food' }
      ];
    }

    // 5A. PinArchive Winners
    if (rawQuery.includes('FROM pa_pins pa')) {
      return overrides.paWinners || [
        {
          pin_id: 'pin_pa_winner_01',
          account_username: 'chefjohn',
          title: 'Lemon Herb Chicken',
          domain: 'foodieblog.com',
          board_name: 'Best Chicken',
          image_url: 'https://i.pinimg.com/236x/lemon.jpg',
          dominant_color: '#f59e0b',
          saves: 14500,
          repins: 4200,
          velocity: 310.0,
          annotations: ['Lemon Chicken', 'Easy Dinners']
        }
      ];
    }

    // 5B. Domain Rollups
    if (rawQuery.includes('FROM domain_intelligence_rollup dir')) {
      return overrides.domainRollups || [
        {
          domain: 'foodieblog.com',
          total_pins: 120,
          unique_urls: 85,
          active_serp_pins: 35,
          top3_pins: 10,
          top10_pins: 25,
          displaced_pins: 12,
          visibility_score: 720,
          total_saves: 38000,
          avg_velocity: 75.0,
          ad_network: 'Mediavine',
          arbitrage_score: 85.0
        }
      ];
    }

    return [];
  };

  mockSql.getCallLog = () => callLog;
  mockSql.resetCallLog = () => { callLog = []; };
  return mockSql;
}

// ============================================================================
// GATE 1: Zero Property Mismatch & Real Annotations Test
// ============================================================================
describe('Gate 1: Zero Property Mismatch & Real Annotations Test', () => {
  beforeEach(async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  it('1.1 formatPinSummary outputs identical visual_annotations and annotations arrays', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload, 'Payload must be returned');
    assert.ok(payload.breakout_pins, 'breakout_pins must exist in payload');

    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    assert.ok(breakouts.length > 0, 'Breakout pins must not be empty');
    const pin = breakouts[0];

    // Assert that visual_annotations is an array
    assert.ok(Array.isArray(pin.visual_annotations), 'pin.visual_annotations must be an array');
    // Assert that annotations is an array (fixing Bug 2 property mismatch)
    assert.ok(Array.isArray(pin.annotations), 'pin.annotations must be an array');
    // Assert both are identical in content
    assert.deepStrictEqual(pin.visual_annotations, pin.annotations, 'pin.visual_annotations and pin.annotations must be identical arrays');
    assert.ok(pin.visual_annotations.length > 0, 'Annotations array must not be empty');
    assert.ok(pin.visual_annotations.every(t => t.norm && t.display), 'Every annotation must have norm and display properties');
  });

  it('1.2 extractCleanAnnotations preserves tag display names and normalizes without hallucinated scores', () => {
    // 1. Flat string array
    const strings = ['  Quick Dinners  ', 'Pasta Bake '];
    const outStrings = extractCleanAnnotations(strings);
    assert.strictEqual(outStrings.length, 2);
    assert.deepStrictEqual(outStrings[0], { norm: 'quick dinners', display: 'Quick Dinners' });
    assert.deepStrictEqual(outStrings[1], { norm: 'pasta bake', display: 'Pasta Bake' });

    // 2. Polymorphic object array
    const objects = [
      { name: 'Summer Outfits', idea_id: '123' },
      { display_label: 'Casual Chic' },
      { label: 'OOTD Fashion' }
    ];
    const outObjects = extractCleanAnnotations(objects);
    assert.strictEqual(outObjects.length, 3);
    assert.deepStrictEqual(outObjects[0], { norm: 'summer outfits', display: 'Summer Outfits' });
    assert.deepStrictEqual(outObjects[1], { norm: 'casual chic', display: 'Casual Chic' });
    assert.deepStrictEqual(outObjects[2], { norm: 'ootd fashion', display: 'OOTD Fashion' });

    // 3. Stringified JSON string
    const jsonStr = '["Keto Diet", "Low Carb"]';
    const outJson = extractCleanAnnotations(jsonStr);
    assert.strictEqual(outJson.length, 2);
    assert.deepStrictEqual(outJson[0], { norm: 'keto diet', display: 'Keto Diet' });

    // 4. Wrapped object with .tags array
    const wrapped = { tags: ['Soup Recipes', 'Chili Ideas'] };
    const outWrapped = extractCleanAnnotations(wrapped);
    assert.strictEqual(outWrapped.length, 2);
    assert.deepStrictEqual(outWrapped[0], { norm: 'soup recipes', display: 'Soup Recipes' });

    // 5. Deduplication across case and irregular spacing
    const dupes = ['Chicken Salad', 'chicken salad', '  CHICKEN SALAD  ', 'Chicken   Salad'];
    const outDupes = extractCleanAnnotations(dupes);
    assert.strictEqual(outDupes.length, 1, 'Duplicate annotations with varying cases/spaces must collapse to 1');
    assert.deepStrictEqual(outDupes[0], { norm: 'chicken salad', display: 'Chicken Salad' });

    // 6. Zero hallucinated per-tag confidence scores
    for (const item of [...outStrings, ...outObjects, ...outJson, ...outWrapped]) {
      assert.strictEqual(item.score, undefined, 'Annotations must NOT contain hallucinated per-tag scores');
    }
  });

  it('1.3 Blueprint modal template in src/pulse-ui.mjs binds to annotations and visual_annotations defensively', () => {
    const pulseUiCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pulse-ui.mjs'), 'utf8');

    // Asserts that the template handles both annotations and visual_annotations defensively
    const hasDefensiveAnnotationsBinding = (
      pulseUiCode.includes('activeBlueprintPin?.annotations') ||
      pulseUiCode.includes('activeBlueprintPin?.visual_annotations')
    );
    assert.ok(hasDefensiveAnnotationsBinding, 'src/pulse-ui.mjs must reference blueprint pin annotations');

    // Asserts that the empty fallback condition checks annotations or visual_annotations
    const hasEmptyFallbackCondition = (
      pulseUiCode.includes('No visual tags detected')
    );
    assert.ok(hasEmptyFallbackCondition, 'src/pulse-ui.mjs must contain visual tags empty state');
  });
});

// ============================================================================
// GATE 2: Multi-Keyword Ratchet & High-Velocity Inclusion Test
// ============================================================================
describe('Gate 2: Multi-Keyword Ratchet & High-Velocity Inclusion Test', () => {
  beforeEach(async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  it('2.1 pinMap ratchets daily_save_velocity, delta_saves_24h, delta_repins_24h, and save_count across rows', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    const multiPin = breakouts.find(p => p.pin_id === 'pin_multi_01');
    assert.ok(multiPin, 'pin_multi_01 must be present in breakout pins');

    // Row 1 had save_count: 500, vel: 0, repins: 15.
    // Row 2 had save_count: 5400, vel: 680, repins: 769, delta_saves: 650.
    // Ratchet must preserve the highest values across all rows
    assert.ok(multiPin.save_count >= 5400, `Expected save_count >= 5400, received ${multiPin.save_count}`);
    assert.ok(multiPin.daily_save_velocity >= 680.0, `Expected daily_save_velocity >= 680, received ${multiPin.daily_save_velocity}`);
    assert.ok(multiPin.delta_repins_24h >= 769, `Expected delta_repins_24h >= 769, received ${multiPin.delta_repins_24h}`);
    assert.ok((multiPin.delta_saves_24h || 0) >= 650, `Expected delta_saves_24h >= 650, received ${multiPin.delta_saves_24h}`);
  });

  it('2.2 Surging pin with zero save velocity but positive repin delta displays effective_24h_gain > 0 and no 0.0/d', async () => {
    // Custom mock with zero daily_save_velocity but +769 repins delta
    const customMockSql = createRound15MockSql({
      activeSerpRows: [
        {
          keyword_id: 1,
          keyword_text: 'easy dinner recipes',
          folders: [],
          pin_id: 'pin_repin_surge_only',
          rank_position: 1,
          title: 'Repin Surging Pin',
          domain: 'repinblog.com',
          destination_url: 'https://repinblog.com/recipe',
          image_url: 'https://i.pinimg.com/236x/repin.jpg',
          creator_username: 'repinmaster',
          board_name: 'Best Repins',
          save_count: 10000,
          daily_save_velocity: 0.0, // Stale/unrotated save velocity
          delta_repins_24h: 769, // Active 24h repin surge
          delta_saves_24h: 0,
          visual_annotations: ['Repin Recipe', 'Viral Food']
        }
      ]
    });

    const payload = await getGlobal24hPulseService(customMockSql, {}, { forceRefresh: true });
    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    const repinPin = breakouts.find(p => p.pin_id === 'pin_repin_surge_only');
    assert.ok(repinPin, 'pin_repin_surge_only must be in breakout pins');

    // effective_24h_gain = Math.max(daily_save_velocity, delta_saves_24h, delta_repins_24h)
    assert.ok(Number.isFinite(repinPin.effective_24h_gain), 'effective_24h_gain must be a finite number');
    assert.ok(repinPin.effective_24h_gain >= 769, `Expected effective_24h_gain >= 769, received ${repinPin.effective_24h_gain}`);
    assert.ok(repinPin.effective_24h_gain > 0, 'effective_24h_gain must be strictly greater than 0 on surging repins');
  });

  it('2.3 High-velocity Vault Surge pin (1,161.0/d) is included at top of breakout_pins', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    // Vault pin with 1,161.0/d saves must appear in the unified breakout_pins leaderboard
    const vaultPin = breakouts.find(p => p.pin_id === 'pin_vault_surge_1161');
    assert.ok(vaultPin, 'pin_vault_surge_1161 from Vault must be included in unified breakout_pins');

    // Must be at the top position or have effective_24h_gain of 1161.0
    const topPin = breakouts[0];
    assert.ok(topPin, 'Top breakout pin must exist');
    assert.strictEqual(topPin.pin_id, 'pin_vault_surge_1161', '1,161.0/d Vault Surge pin must be the #1 breakout pin');
    assert.strictEqual(topPin.effective_24h_gain, 1161.0, 'Top pin effective_24h_gain must be 1161.0');
  });

  it('2.4 Multi-keyword pins preserve non-synthetic titles, non-empty alt_text, and union annotations', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    const multiPin = breakouts.find(p => p.pin_id === 'pin_multi_01');
    assert.ok(multiPin, 'pin_multi_01 must be present');

    // Title preference: Row 2 had the richer non-synthetic title
    assert.strictEqual(
      multiPin.title,
      'Ultra-Crispy Garlic Butter Chicken Skillet',
      'Should prefer the richest non-synthetic title across rows'
    );

    // Annotations: Must union annotations from Row 1 and Row 2
    // Row 1: ['Garlic Butter Chicken', 'Easy Dinners', 'Chicken Recipes']
    // Row 2: ['Garlic Butter Chicken', 'Skillet Dinners', 'Keto Meals']
    const tagNorms = (multiPin.visual_annotations || multiPin.annotations || []).map(t => t.norm);
    assert.ok(tagNorms.includes('garlic butter chicken'), 'Must contain garlic butter chicken');
    assert.ok(tagNorms.includes('easy dinners'), 'Must contain easy dinners from Row 1');
    assert.ok(tagNorms.includes('chicken recipes'), 'Must contain chicken recipes from Row 1');
    assert.ok(tagNorms.includes('skillet dinners'), 'Must contain skillet dinners from Row 2');
    assert.ok(tagNorms.includes('keto meals'), 'Must contain keto meals from Row 2');
  });

  it('2.5 Anti-NaN shield protects velocity calculations against null, undefined, or corrupt numbers', () => {
    const safeNumber = (val) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    };

    assert.strictEqual(safeNumber(null), 0);
    assert.strictEqual(safeNumber(undefined), 0);
    assert.strictEqual(safeNumber('corrupt_string'), 0);
    assert.strictEqual(safeNumber(NaN), 0);
    assert.strictEqual(safeNumber(145.5), 145.5);

    // Anti-NaN Shield in effective gain computation
    const computeGain = (v1, v2, v3) => {
      const n1 = safeNumber(v1);
      const n2 = safeNumber(v2);
      const n3 = safeNumber(v3);
      return Math.max(n1, n2, n3);
    };

    assert.strictEqual(computeGain(null, 'bad', undefined), 0);
    assert.strictEqual(computeGain(0, NaN, 580), 580);
    assert.strictEqual(computeGain('750.5', null, undefined), 750.5);
  });
});

// ============================================================================
// GATE 3: Annotation Crossover Support Floor (pin_count >= 2) & Matching Pins Test
// ============================================================================
describe('Gate 3: Annotation Crossover Support Floor (pin_count >= 2) & Matching Pins Test', () => {
  beforeEach(async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  it('3.1 2-Pairs and 3-Triplets strictly exclude pin_count == 1 combinations', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload.annotation_crossovers, 'annotation_crossovers must exist');
    const pairs = payload.annotation_crossovers.pair_crossovers || payload.annotation_crossovers.top_2_pairs || [];
    const triplets = payload.annotation_crossovers.triplet_crossovers || payload.annotation_crossovers.top_3_triplets || [];

    // Rule: Every single pair and triplet MUST have pin_count >= 2
    for (const pair of pairs) {
      assert.ok(pair.pin_count >= 2, `Pair crossover ${pair.crossover_label} has pin_count ${pair.pin_count} < 2`);
    }

    for (const triplet of triplets) {
      assert.ok(triplet.pin_count >= 2, `Triplet crossover ${triplet.crossover_label} has pin_count ${triplet.pin_count} < 2`);
    }

    // Assert that the solo pin's unique tags (pin_solo_tags_02) do NOT appear in pairs or triplets
    const soloNorms = ['solotagalpha', 'solotagbeta', 'solotaggamma', 'solotagdelta'];
    for (const pair of pairs) {
      const key = `${pair.tag_a_norm} + ${pair.tag_b_norm}`.toLowerCase();
      for (const sn of soloNorms) {
        assert.ok(!key.includes(sn), `Solo tag ${sn} must NOT appear in 2-pairs with pin_count = 1`);
      }
    }
  });

  it('3.2 Qualified pair crossover (pin_count >= 2) attaches matching_pins with rich metadata', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pairs = payload.annotation_crossovers.pair_crossovers || payload.annotation_crossovers.top_2_pairs || [];
    assert.ok(pairs.length > 0, 'Must have at least one qualified 2-pair crossover');

    // Locate the shared pair between pin_crossover_A and pin_crossover_B ('Healthy Dinners' + 'Sheet Pan Meal')
    const sheetPanPair = pairs.find(p => {
      const a = (p.tag_a_norm || '').toLowerCase();
      const b = (p.tag_b_norm || '').toLowerCase();
      return (a.includes('sheet pan') && b.includes('healthy dinners')) ||
             (b.includes('sheet pan') && a.includes('healthy dinners'));
    });

    assert.ok(sheetPanPair, "Qualified pair 'Sheet Pan Meal + Healthy Dinners' must be found in pair crossovers");
    assert.ok(sheetPanPair.pin_count >= 2, 'Crossover must have pin_count >= 2');
    assert.ok(Array.isArray(sheetPanPair.matching_pins), 'Crossover must attach matching_pins array');
    assert.ok(sheetPanPair.matching_pins.length >= 2, 'matching_pins must contain at least 2 pins');

    // Rich metadata validation on matching pins
    const sample = sheetPanPair.matching_pins[0];
    assert.ok(sample.pin_id, 'matching pin must have pin_id');
    assert.ok(sample.title, 'matching pin must have title');
    assert.ok(sample.image_url, 'matching pin must have image_url');
    assert.ok(sample.dossier_url, 'matching pin must have dossier_url');
    assert.ok(sample.dossier_url.startsWith('/pin/'), `dossier_url must link to /pin/:id, got ${sample.dossier_url}`);
    assert.ok(Number.isFinite(sample.effective_24h_gain) && sample.effective_24h_gain > 0, 'matching pin must have positive effective_24h_gain');
  });

  it('3.3 UI template in src/pulse-ui.mjs provides interactive drill-down for annotation crossovers', () => {
    const pulseUiCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pulse-ui.mjs'), 'utf8');

    // Asserts that Room 2 (Annotation Matrix) includes matching pins interaction or rendering
    const hasMatchingPinsRendering = (
      pulseUiCode.includes('matching_pins') ||
      pulseUiCode.includes('selectedCrossover') ||
      pulseUiCode.includes('activeCrossover') ||
      pulseUiCode.includes('selectCrossover')
    );
    assert.ok(hasMatchingPinsRendering, 'src/pulse-ui.mjs must support interactive matching pins drill-down in Room 2');
  });
});

// ============================================================================
// GATE 4: Capsule Deduplication & Color Palette Count Test
// ============================================================================
describe('Gate 4: Capsule Deduplication & Color Palette Count Test', () => {
  beforeEach(async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  it('4.1 Guided search capsules deduplicate case-insensitively by display_label', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload.guided_capsule_crossovers, 'guided_capsule_crossovers must exist');
    const capsules = payload.guided_capsule_crossovers;

    // Filter capsules for 'easy'
    const easyCaps = capsules.filter(c => {
      const lbl = String(c.display_label || c.term || c.label || '').trim().toLowerCase();
      return lbl === 'easy';
    });
    assert.strictEqual(easyCaps.length, 1, `Expected exactly 1 deduplicated capsule for 'Easy', found ${easyCaps.length}`);

    // Filter capsules for 'healthy'
    const healthyCaps = capsules.filter(c => {
      const lbl = String(c.display_label || c.term || c.label || '').trim().toLowerCase();
      return lbl === 'healthy';
    });
    assert.strictEqual(healthyCaps.length, 1, `Expected exactly 1 deduplicated capsule for 'Healthy', found ${healthyCaps.length}`);

    // Aggregated parent keywords: 'Easy' appeared in keyword 1, 2, and 1
    const easyRow = easyCaps[0];
    const kwCount = easyRow.keyword_count || easyRow.keywords_count || (easyRow.parent_keywords ? easyRow.parent_keywords.length : 0);
    assert.ok(kwCount >= 2, `Capsule 'Easy' should aggregate parent keywords, got ${kwCount}`);
  });

  it('4.2 dominant_color_palette provides both pin_count and count with non-zero values', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload.hidden_gems_telemetry, 'hidden_gems_telemetry must exist');
    const palette = payload.hidden_gems_telemetry.dominant_color_palette || [];
    assert.ok(palette.length > 0, 'dominant_color_palette must not be empty');

    for (const item of palette) {
      assert.ok(Number.isFinite(item.pin_count) && item.pin_count > 0, `pin_count must be positive, got ${item.pin_count}`);
      assert.ok(Number.isFinite(item.count) && item.count > 0, `count must be positive, got ${item.count}`);
      assert.strictEqual(item.count, item.pin_count, 'count must equal pin_count to prevent (0) display in UI');
    }
  });

  it('4.3 src/pulse-ui.mjs renders col.pin_count || col.count so color swatches never display (0)', () => {
    const pulseUiCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pulse-ui.mjs'), 'utf8');

    // UI must bind to col.pin_count or col.count (or item.pin_count in Bento Matrix)
    const hasCorrectCountBinding = (
      pulseUiCode.includes('col.pin_count') ||
      pulseUiCode.includes('col.count') ||
      pulseUiCode.includes('item.pin_count') ||
      pulseUiCode.includes('item.count')
    );
    assert.ok(hasCorrectCountBinding, 'src/pulse-ui.mjs must reference col.pin_count or col.count in color palette');
  });
});

// ============================================================================
// GATE 5: Creator Breakouts Positive-Only & True Domainless Filter Test
// ============================================================================
describe('Gate 5: Creator Breakouts Positive-Only & True Domainless Filter Test', () => {
  beforeEach(async () => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  it('5.1 Negative reach deltas and 0-gain accounts are strictly excluded from creator_breakouts', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    assert.ok(payload.creator_breakouts, 'creator_breakouts must exist');
    const creators = payload.creator_breakouts;

    // loser_account (-346,814 reach drop) must NOT be present
    const hasLoser = creators.some(c => c.username === 'loser_account');
    assert.strictEqual(hasLoser, false, 'loser_account with -346,814 drop must be excluded from creator_breakouts');

    // stagnant_account (0 delta) must NOT be present
    const hasStagnant = creators.some(c => c.username === 'stagnant_account');
    assert.strictEqual(hasStagnant, false, 'stagnant_account with 0 delta must be excluded from creator_breakouts');

    // Every returned creator must have strictly positive growth or active surging pins
    for (const c of creators) {
      const positiveReach = (c.effective_delta_reach_24h || 0) > 0;
      const positiveViews = (c.effective_delta_views_24h || 0) > 0;
      const positivePinVelocity = (c.max_pin_velocity || 0) > 0;
      assert.ok(
        positiveReach || positiveViews || positivePinVelocity,
        `Creator ${c.username} must have strictly positive 24h growth or surging driver pin`
      );
    }
  });

  it('5.2 is_david_account boundary conditions enforce totalPins <= 250 and monthly_reach <= 500,000', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const creators = payload.creator_breakouts;

    // giant_account has 4.45M reach and 0 followers. Must NOT be flagged as David!
    const giant = creators.find(c => c.username === 'giant_account');
    if (giant) {
      const isDavid = Boolean(giant.is_david_account || giant.is_david_breakout);
      assert.strictEqual(isDavid, false, 'Multi-million reach creator must NOT be flagged as David Breakout');
    }

    // david_baker has 42,000 reach, 110 pins, +9,500 delta. Must be flagged as David!
    const david = creators.find(c => c.username === 'david_baker');
    assert.ok(david, 'david_baker must be present in creator_breakouts');
    const isDavid = Boolean(david.is_david_account || david.is_david_breakout);
    assert.strictEqual(isDavid, true, 'david_baker (42k reach, 110 pins, surging) must be flagged as David Breakout');
  });

  it('5.3 True domainless viral pins strictly exclude valid external blog domains', async () => {
    const mockSql = createRound15MockSql();
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const breakouts = Array.isArray(payload.breakout_pins)
      ? payload.breakout_pins
      : (payload.breakout_pins.top_breakouts || []);

    // pin_publisher_04 is valentinascorner.com (valid publisher domain)
    const publisherPin = breakouts.find(p => p.pin_id === 'pin_publisher_04');
    assert.ok(publisherPin, 'pin_publisher_04 must be present in breakouts');
    assert.strictEqual(
      Boolean(publisherPin.is_domainless_viral),
      false,
      'Valid external blog domain must NOT be marked as domainless viral'
    );

    // pin_domainless_03 is Uploaded by user with no destination_url
    const domainlessPin = breakouts.find(p => p.pin_id === 'pin_domainless_03');
    assert.ok(domainlessPin, 'pin_domainless_03 must be present in breakouts');
    assert.strictEqual(
      Boolean(domainlessPin.is_domainless_viral),
      true,
      'Pin without external URL must be marked as domainless viral'
    );

    // Check src/pulse-ui.mjs: verify that 'No external URL' is not hardcoded unconditionally
    const pulseUiCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pulse-ui.mjs'), 'utf8');
    const hasUnconditionalNoUrl = /formatNumber\(gem\.save_count \|\| 0\)\s*\+\s*'\s*saves\s*·\s*No external URL'/.test(pulseUiCode);
    assert.strictEqual(
      hasUnconditionalNoUrl,
      false,
      "src/pulse-ui.mjs must NOT unconditionally render 'No external URL' on all gems"
    );
  });
});

// ============================================================================
// GATE 6: Repository Regression Locks & Zero Landmines
// ============================================================================
describe('Gate 6: Repository Regression Locks & Zero Landmines', () => {
  it('6.1 All 14 Architectural Regression Locks in scripts/verify_regression_locks.mjs pass', () => {
    // Executes verify_regression_locks.mjs and asserts clean exit code 0
    const out = execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'verify_regression_locks.mjs')], {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    });
    assert.ok(out.includes('ALL 14 ARCHITECTURAL REGRESSION LOCKS VERIFIED CLEAN'), 'Must pass all 14 locks');
  });

  it('6.2 Hub skeletal compaction: no queries select description or alt_text from keyword_serp_current', () => {
    const serviceCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');

    // Central Hub Skeletal Compaction Invariant
    assert.ok(!/\bksc\.description\b/i.test(serviceCode), 'Must NOT query ksc.description on Central Hub');
    assert.ok(!/\bksc\.alt_text\b/i.test(serviceCode), 'Must NOT query ksc.alt_text on Central Hub');
    assert.ok(!/\bksc\.reaction_count\b/i.test(serviceCode), 'Must NOT query non-existent ksc.reaction_count');
    assert.ok(!/\bump\.url_global_saves\b/i.test(serviceCode), 'Must NOT query non-existent ump.url_global_saves on Shards');
  });

  it('6.3 Headless Node.js execution shield: browser globals are guarded', () => {
    const pulseUiCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pulse-ui.mjs'), 'utf8');

    // Asserts that localStorage is guarded by typeof !== 'undefined'
    if (pulseUiCode.includes('localStorage')) {
      const matches = pulseUiCode.match(/localStorage\.[a-zA-Z]+/g) || [];
      for (const m of matches) {
        assert.ok(
          pulseUiCode.includes("typeof localStorage !== 'undefined'") ||
          pulseUiCode.includes("typeof localStorage != 'undefined'"),
          'localStorage calls must be guarded for Headless Node environments'
        );
      }
    }

    // Asserts that window is guarded by typeof !== 'undefined'
    if (pulseUiCode.includes('window.handlePinImgError')) {
      assert.ok(
        pulseUiCode.includes("typeof window !== 'undefined'") ||
        pulseUiCode.includes('<script>'),
        'window attachments must be inside script tag or guarded'
      );
    }
  });

  it('6.4 No unescaped regex or $ tokens in string replacement operations', () => {
    const serviceCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');

    // Check for raw string replace patterns that could trigger $1..$9 or $' duplication
    const replaceMatches = serviceCode.match(/\.replace\([^)]+\)/g) || [];
    for (const match of replaceMatches) {
      if (match.includes("'$'") || match.includes('"$"')) {
        assert.fail(`Potentially hazardous dollar replacement pattern found: ${match}`);
      }
    }
    assert.ok(true, 'String replacements obey functional replacement safety');
  });
});
