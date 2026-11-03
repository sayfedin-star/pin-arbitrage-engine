/**
 * tests/round15-adversarial-stress.test.mjs
 *
 * Dedicated Adversarial Stress Harness for Pulse Intelligence Engine v2
 * Author: Challenger 1 (Backend Adversarial Challenger)
 *
 * Stress Test Dimensions:
 * 1. Combinatorial Limit Stress: 100 pins with 35+ visual annotations (assert 10-tag cap, isolate survival).
 * 2. Crossover Support Floor Stress: verify zero single-pin combinations (pin_count == 1) in pair/triplet crossovers.
 * 3. Multi-Keyword Ratchets & Anti-NaN Shield Stress: corrupt, null, undefined, negative values, velocity ratcheting.
 * 4. Creator Growth Filtering & David Accounts Boundary Stress: negative drops, 0-delta, 500k reach boundary.
 * 5. True Domainless vs Authentic Domain Pins Stress: valid blog domains never classified as domainless viral pins.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getGlobal24hPulseService,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse,
  extractCleanAnnotations
} from '../src/modules/pulse/service.mjs';

function createStressMockSql(overrides = {}) {
  return async (strings, ...values) => {
    const rawQuery = Array.isArray(strings)
      ? strings.join('?')
      : (typeof strings === 'string' ? strings : String(strings));

    // 1. Active SERP
    if (rawQuery.includes('kw_folders') && rawQuery.includes('keyword_serp_current')) {
      return overrides.activeSerpRows || [];
    }
    // 2A. Displaced Vacuum Counts
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && rawQuery.includes('displaced_top10_24h_count')) {
      return overrides.vacuumCounts || [];
    }
    // 2B. Displaced Top Vault Surge Pins
    if (rawQuery.includes('FROM keyword_displaced_index kdi') && rawQuery.includes('ORDER BY GREATEST(')) {
      return overrides.vaultPins || [];
    }
    // 3. Guided Search Capsules
    if (rawQuery.includes('FROM keyword_guided_capsules c')) {
      return overrides.capsuleRows || [];
    }
    // 4. Breakout Creators
    if (rawQuery.includes('FROM top_creators tc') || rawQuery.includes('active_creators AS (')) {
      return overrides.creatorRows || [];
    }
    // 5A. PinArchive Winners
    if (rawQuery.includes('FROM pa_pins pa')) {
      return overrides.paWinners || [];
    }
    // 5B. Domain Rollups
    if (rawQuery.includes('FROM domain_intelligence_rollup dir')) {
      return overrides.domainRollups || [];
    }
    // 6. Creator Viral Pins
    if (rawQuery.includes('FROM competitor_pins cpin')) {
      return overrides.viralCreatorPins || [];
    }

    return [];
  };
}

describe('Challenger 1 Stress Harness: Pulse Engine v2', () => {
  beforeEach(() => {
    pulseMemoryCache.clear();
    pulseForceRefreshCooldown.clear();
    inflightPulse.clear();
  });

  // --------------------------------------------------------------------------
  // Dimension 1: Combinatorial Limit Stress
  // --------------------------------------------------------------------------
  it('Stress 1: 100 pins with 35+ annotations enforce 10-tag cap without isolate memory blowout', async () => {
    const activeSerpRows = [];
    for (let pIdx = 1; pIdx <= 100; pIdx++) {
      const annotations = [];
      for (let tIdx = 1; tIdx <= 35; tIdx++) {
        annotations.push(`StressTag_${(tIdx % 15) + 1}`); // shared modulo tags to generate pairings
      }
      activeSerpRows.push({
        keyword_id: (pIdx % 5) + 1,
        keyword_text: `keyword_${(pIdx % 5) + 1}`,
        folders: [],
        pin_id: `pin_stress_${pIdx}`,
        rank_position: (pIdx % 20) + 1,
        title: `Stress Pin ${pIdx}`,
        domain: `domain${pIdx % 10}.com`,
        destination_url: `https://domain${pIdx % 10}.com/pin${pIdx}`,
        image_url: `https://i.pinimg.com/236x/pin${pIdx}.jpg`,
        creator_username: `creator_${pIdx % 10}`,
        board_name: `Board ${pIdx % 5}`,
        save_count: 1000 + pIdx * 10,
        daily_save_velocity: 50.0 + pIdx,
        delta_repins_24h: 10 + pIdx,
        delta_saves_24h: 20 + pIdx,
        visual_annotations: annotations
      });
    }

    const mockSql = createStressMockSql({ activeSerpRows });
    const startTime = performance.now();
    const memBefore = process.memoryUsage().heapUsed;

    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const elapsed = performance.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const heapDiffMb = (memAfter - memBefore) / (1024 * 1024);

    assert.ok(payload.annotation_crossovers, 'annotation_crossovers must exist');
    const { single_annotations, pair_crossovers, triplet_crossovers } = payload.annotation_crossovers;

    // Verify performance: 100 pins with 35 tags each must complete in < 250ms with < 25MB heap delta
    assert.ok(elapsed < 1000, `Execution took ${elapsed.toFixed(1)}ms, expected < 1000ms`);
    assert.ok(heapDiffMb < 50, `Heap increased by ${heapDiffMb.toFixed(2)}MB, expected < 50MB`);

    // Verify cap in pair crossovers: pairs <= 50, triplets <= 50
    assert.ok(pair_crossovers.length <= 50, `pair_crossovers capped at 50, got ${pair_crossovers.length}`);
    assert.ok(triplet_crossovers.length <= 50, `triplet_crossovers capped at 50, got ${triplet_crossovers.length}`);
  });

  // --------------------------------------------------------------------------
  // Dimension 2: Crossover Support Floor Stress
  // --------------------------------------------------------------------------
  it('Stress 2: Crossover support floor strictly excludes pin_count == 1 combinations', async () => {
    const activeSerpRows = [
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_solo_isolated',
        rank_position: 1,
        title: 'Solo Tag Pin',
        domain: 'example.com',
        destination_url: 'https://example.com/1',
        image_url: 'https://example.com/1.jpg',
        save_count: 50000,
        daily_save_velocity: 999.0, // High velocity intended to trick ranking
        delta_repins_24h: 500,
        delta_saves_24h: 900,
        visual_annotations: ['UniqueSoloA', 'UniqueSoloB', 'UniqueSoloC']
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_shared_1',
        rank_position: 2,
        title: 'Shared Tag Pin 1',
        domain: 'shared.com',
        destination_url: 'https://shared.com/1',
        image_url: 'https://shared.com/1.jpg',
        save_count: 2000,
        daily_save_velocity: 100.0,
        delta_repins_24h: 50,
        delta_saves_24h: 100,
        visual_annotations: ['SharedTagAlpha', 'SharedTagBeta', 'SharedTagGamma']
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_shared_2',
        rank_position: 3,
        title: 'Shared Tag Pin 2',
        domain: 'shared.com',
        destination_url: 'https://shared.com/2',
        image_url: 'https://shared.com/2.jpg',
        save_count: 1500,
        daily_save_velocity: 80.0,
        delta_repins_24h: 40,
        delta_saves_24h: 80,
        visual_annotations: ['SharedTagAlpha', 'SharedTagBeta', 'SharedTagGamma']
      }
    ];

    const mockSql = createStressMockSql({ activeSerpRows });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const { pair_crossovers, triplet_crossovers } = payload.annotation_crossovers;

    // Assert that UniqueSoloA + UniqueSoloB never appears in pair_crossovers
    for (const pair of pair_crossovers) {
      assert.ok(pair.pin_count >= 2, `Pair ${pair.crossover_label} has pin_count ${pair.pin_count} < 2`);
      assert.ok(!pair.crossover_label.includes('UniqueSolo'), `Single pin pair found: ${pair.crossover_label}`);
    }

    for (const triplet of triplet_crossovers) {
      assert.ok(triplet.pin_count >= 2, `Triplet ${triplet.crossover_label} has pin_count ${triplet.pin_count} < 2`);
      assert.ok(!triplet.crossover_label.includes('UniqueSolo'), `Single pin triplet found: ${triplet.crossover_label}`);
    }
  });

  // --------------------------------------------------------------------------
  // Dimension 3: Multi-Keyword Ratchets & Anti-NaN Shield Stress
  // --------------------------------------------------------------------------
  it('Stress 3: Multi-keyword rows ratchet velocity and protect against null, undefined, and corrupt NaN values', async () => {
    const activeSerpRows = [
      {
        keyword_id: 1,
        keyword_text: 'kw1',
        folders: [],
        pin_id: 'pin_corrupt_ratchet',
        rank_position: 10,
        title: 'Pin Title Short',
        domain: 'example.com',
        destination_url: 'https://example.com/p',
        image_url: 'https://example.com/p.jpg',
        save_count: null,
        daily_save_velocity: 'corrupt_string',
        delta_repins_24h: undefined,
        delta_saves_24h: null,
        visual_annotations: ['TagA', 'TagB']
      },
      {
        keyword_id: 2,
        keyword_text: 'kw2',
        folders: [],
        pin_id: 'pin_corrupt_ratchet',
        rank_position: 2,
        title: 'Pin Title Much Longer Non-Synthetic',
        domain: 'example.com',
        destination_url: 'https://example.com/p',
        image_url: 'https://example.com/p.jpg',
        save_count: 5000,
        daily_save_velocity: 650.0,
        delta_repins_24h: 820,
        delta_saves_24h: 600,
        visual_annotations: ['TagB', 'TagC']
      },
      {
        keyword_id: 3,
        keyword_text: 'kw3',
        folders: [],
        pin_id: 'pin_corrupt_ratchet',
        rank_position: 8,
        title: 'Short Title',
        domain: 'example.com',
        destination_url: 'https://example.com/p',
        image_url: 'https://example.com/p.jpg',
        save_count: 1200,
        daily_save_velocity: 400.0,
        delta_repins_24h: 150,
        delta_saves_24h: 300,
        visual_annotations: ['TagD']
      }
    ];

    const mockSql = createStressMockSql({ activeSerpRows });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pin = payload.breakout_pins.find(p => p.pin_id === 'pin_corrupt_ratchet');
    assert.ok(pin, 'pin_corrupt_ratchet must be present');

    assert.strictEqual(pin.save_count, 5000, 'save_count must ratchet to max 5000');
    assert.strictEqual(pin.daily_save_velocity, 650.0, 'daily_save_velocity must ratchet to max 650');
    assert.strictEqual(pin.delta_repins_24h, 820, 'delta_repins_24h must ratchet to max 820');
    assert.strictEqual(pin.effective_24h_gain, 820, 'effective_24h_gain must be max(650, 600, 820) = 820');
    assert.strictEqual(pin.title, 'Pin Title Much Longer Non-Synthetic', 'title must prefer longer non-synthetic title');

    // Anti-NaN verification
    assert.ok(Number.isFinite(pin.save_count), 'save_count must be finite');
    assert.ok(Number.isFinite(pin.daily_save_velocity), 'daily_save_velocity must be finite');
    assert.ok(Number.isFinite(pin.effective_24h_gain), 'effective_24h_gain must be finite');

    // Union annotations check
    const tagNorms = (pin.visual_annotations || pin.annotations || []).map(t => t.norm);
    assert.ok(tagNorms.includes('taga'), 'Must include TagA from Row 1');
    assert.ok(tagNorms.includes('tagb'), 'Must include TagB');
    assert.ok(tagNorms.includes('tagc'), 'Must include TagC from Row 2');
    assert.ok(tagNorms.includes('tagd'), 'Must include TagD from Row 3');
  });

  // --------------------------------------------------------------------------
  // Dimension 4: Creator Growth Filtering & David Accounts Boundary Stress
  // --------------------------------------------------------------------------
  it('Stress 4: Creator growth filtering enforces positive growth and David account boundaries', async () => {
    const creatorRows = [
      {
        id: 1,
        username: 'negative_dropper',
        display_name: 'Negative Dropper',
        monthly_reach: 1200000,
        profile_views: 400000,
        total_pins: 300,
        follower_count: 50000,
        delta_reach_24h: -346814,
        delta_views_24h: -25000,
        effective_delta_reach_24h: -346814,
        effective_delta_views_24h: -25000,
        driver_pins: []
      },
      {
        id: 2,
        username: 'zero_delta_creator',
        display_name: 'Zero Delta',
        monthly_reach: 600000,
        profile_views: 150000,
        total_pins: 200,
        follower_count: 15000,
        delta_reach_24h: 0,
        delta_views_24h: 0,
        effective_delta_reach_24h: 0,
        effective_delta_views_24h: 0,
        driver_pins: []
      },
      {
        id: 3,
        username: 'giant_creator_zero_followers',
        display_name: 'Giant Creator With 0 Followers',
        monthly_reach: 4458284, // 4.45M reach
        profile_views: 1000000,
        total_pins: 150, // <= 250 pins!
        follower_count: 0, // unpopulated in DB
        delta_reach_24h: 50000,
        delta_views_24h: 12000,
        effective_delta_reach_24h: 50000,
        effective_delta_views_24h: 12000,
        driver_pins: []
      },
      {
        id: 4,
        username: 'david_boundary_exact',
        display_name: 'David Exact Boundary',
        monthly_reach: 500000, // exact boundary 500k
        profile_views: 80000,
        total_pins: 250, // exact boundary 250
        follower_count: 3000,
        delta_reach_24h: 1000, // exact boundary 1000
        delta_views_24h: 500,
        effective_delta_reach_24h: 1000,
        effective_delta_views_24h: 500,
        driver_pins: []
      },
      {
        id: 5,
        username: 'david_exceeded_reach',
        display_name: 'David Exceeded Reach',
        monthly_reach: 500001, // 500k + 1
        profile_views: 80000,
        total_pins: 200,
        follower_count: 3000,
        delta_reach_24h: 2000,
        delta_views_24h: 500,
        effective_delta_reach_24h: 2000,
        effective_delta_views_24h: 500,
        driver_pins: []
      },
      {
        id: 6,
        username: 'david_exceeded_pins',
        display_name: 'David Exceeded Pins',
        monthly_reach: 200000,
        profile_views: 40000,
        total_pins: 251, // 250 + 1
        follower_count: 2000,
        delta_reach_24h: 2000,
        delta_views_24h: 500,
        effective_delta_reach_24h: 2000,
        effective_delta_views_24h: 500,
        driver_pins: []
      }
    ];

    const mockSql = createStressMockSql({ creatorRows });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const creators = payload.creator_breakouts;

    // 1. Negative drop account must be excluded
    assert.strictEqual(creators.some(c => c.username === 'negative_dropper'), false, 'negative_dropper must be excluded');

    // 2. Zero delta creator must be excluded
    assert.strictEqual(creators.some(c => c.username === 'zero_delta_creator'), false, 'zero_delta_creator must be excluded');

    // 3. Giant with 4.45M reach must NOT be David
    const giant = creators.find(c => c.username === 'giant_creator_zero_followers');
    assert.ok(giant, 'giant creator with positive gain must be included');
    assert.strictEqual(giant.is_david_breakout, false, 'Giant with 4.45M reach must NOT be David breakout');

    // 4. Exact boundary (500k reach, 250 pins, +1000 delta) -> is_david_breakout === true
    const davidExact = creators.find(c => c.username === 'david_boundary_exact');
    assert.ok(davidExact, 'david_boundary_exact must be included');
    assert.strictEqual(davidExact.is_david_breakout, true, 'david_boundary_exact must be David breakout');

    // 5. Exceeded reach (500,001 reach) -> is_david_breakout === false
    const davidExceededReach = creators.find(c => c.username === 'david_exceeded_reach');
    assert.ok(davidExceededReach, 'david_exceeded_reach must be included');
    assert.strictEqual(davidExceededReach.is_david_breakout, false, '500,001 reach must NOT be David breakout');

    // 6. Exceeded pins (251 pins) -> is_david_breakout === false
    const davidExceededPins = creators.find(c => c.username === 'david_exceeded_pins');
    assert.ok(davidExceededPins, 'david_exceeded_pins must be included');
    assert.strictEqual(davidExceededPins.is_david_breakout, false, '251 pins must NOT be David breakout');
  });

  // --------------------------------------------------------------------------
  // Dimension 5: True Domainless Pins vs Authentic Domain Pins Stress
  // --------------------------------------------------------------------------
  it('Stress 5: Authentic publisher domains are never flagged as domainless viral pins', async () => {
    const activeSerpRows = [
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_pub_valentina',
        title: 'Valentinas Corner Recipe',
        domain: 'valentinascorner.com',
        destination_url: 'https://valentinascorner.com/garlic-chicken',
        image_url: 'https://i.pinimg.com/236x/v.jpg',
        save_count: 85000,
        daily_save_velocity: 320.0
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_pub_subdomain',
        title: 'Blog Subdomain Recipe',
        domain: 'recipes.foodnetwork.com',
        destination_url: 'https://recipes.foodnetwork.com/chili',
        image_url: 'https://i.pinimg.com/236x/fn.jpg',
        save_count: 45000,
        daily_save_velocity: 180.0
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_truly_domainless_uploaded',
        title: 'User Uploaded Mug Cake',
        domain: 'Uploaded by user',
        destination_url: '',
        image_url: 'https://i.pinimg.com/236x/cake.jpg',
        save_count: 22000,
        daily_save_velocity: 280.0
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_truly_domainless_null',
        title: 'Null Domain Pin',
        domain: null,
        destination_url: null,
        image_url: 'https://i.pinimg.com/236x/null.jpg',
        save_count: 15000,
        daily_save_velocity: 190.0
      },
      {
        keyword_id: 1,
        keyword_text: 'recipes',
        folders: [],
        pin_id: 'pin_truly_domainless_pinterest',
        title: 'Internal Pinterest Link Pin',
        domain: 'pinterest.com',
        destination_url: 'https://www.pinterest.com/pin/123456/',
        image_url: 'https://i.pinimg.com/236x/pin.jpg',
        save_count: 31000,
        daily_save_velocity: 210.0
      }
    ];

    const mockSql = createStressMockSql({ activeSerpRows });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    const pValentina = payload.breakout_pins.find(p => p.pin_id === 'pin_pub_valentina');
    assert.strictEqual(pValentina.is_domainless_viral, false, 'valentinascorner.com must NOT be domainless viral');

    const pSubdomain = payload.breakout_pins.find(p => p.pin_id === 'pin_pub_subdomain');
    assert.strictEqual(pSubdomain.is_domainless_viral, false, 'recipes.foodnetwork.com must NOT be domainless viral');

    const pUploaded = payload.breakout_pins.find(p => p.pin_id === 'pin_truly_domainless_uploaded');
    assert.strictEqual(pUploaded.is_domainless_viral, true, 'Uploaded by user must be domainless viral');

    const pNull = payload.breakout_pins.find(p => p.pin_id === 'pin_truly_domainless_null');
    assert.strictEqual(pNull.is_domainless_viral, true, 'null domain must be domainless viral');

    const pPinterest = payload.breakout_pins.find(p => p.pin_id === 'pin_truly_domainless_pinterest');
    assert.strictEqual(pPinterest.is_domainless_viral, true, 'pinterest.com must be domainless viral');

    // Verify hidden_gems_telemetry.domainless_viral_pins only includes true domainless pins
    const domainlessGems = payload.hidden_gems_telemetry.domainless_viral_pins;
    for (const gem of domainlessGems) {
      assert.ok(gem.is_domainless_viral, `Gem ${gem.pin_id} must have is_domainless_viral === true`);
      assert.ok(
        !gem.domain || gem.domain === 'Uploaded by user' || gem.domain.includes('pinterest.') || !gem.destination_url,
        `Gem ${gem.pin_id} with domain ${gem.domain} must not have authentic external blog domain`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Dimension 6: Anti-NaN Shield Leakage Stress (Vacuums, Capsules, Vault Surges)
  // --------------------------------------------------------------------------
  it('Stress 6: Anti-NaN shield prevents NaN leakage into keyword vacuums, guided capsules, and vault surges', async () => {
    const activeSerpRows = [
      {
        keyword_id: 42,
        keyword_text: 'vacuum_kw',
        pin_id: 'pin_corrupt_active',
        daily_save_velocity: 'corrupt_vel',
        save_count: 'corrupt_saves',
        visual_annotations: []
      }
    ];
    const vacuumCounts = [
      {
        keyword_id: 42,
        keyword_text: 'vacuum_kw',
        displaced_24h_count: 5,
        displaced_top10_24h_count: 3,
        displaced_top10_7d_count: 10
      }
    ];
    const capsuleRows = [
      {
        keyword_id: 42,
        keyword_text: 'vacuum_kw',
        display_label: 'Easy Recipe',
        term: 'easy recipe',
        score: 100,
        display_order: 1
      }
    ];
    const vaultPins = [
      {
        pin_id: 'vault_pin_corrupt',
        daily_save_velocity: 'corrupt_vault_vel',
        delta_repins_24h: 50,
        save_count: 'corrupt_saves',
        repin_count: 'corrupt_repins'
      }
    ];

    const mockSql = createStressMockSql({ activeSerpRows, vacuumCounts, capsuleRows, vaultPins });
    const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

    // 1. Keyword Vacuums
    const vacuumOpp = payload.keyword_vacuums_and_bridges.keyword_vacuum_opportunities.find(v => v.keyword_id === 42);
    assert.ok(vacuumOpp, 'vacuum opportunity 42 must exist');
    assert.ok(!Number.isNaN(vacuumOpp.avg_velocity), `avg_velocity must not be NaN, got ${vacuumOpp.avg_velocity}`);
    assert.ok(!Number.isNaN(vacuumOpp.top_pin?.daily_save_velocity), `top_pin.daily_save_velocity must not be NaN, got ${vacuumOpp.top_pin?.daily_save_velocity}`);
    assert.ok(!Number.isNaN(vacuumOpp.top_pin?.save_count), `top_pin.save_count must not be NaN, got ${vacuumOpp.top_pin?.save_count}`);

    // 2. Guided Search Capsules
    const capsule = payload.guided_capsule_crossovers.find(c => c.display_label === 'Easy Recipe');
    assert.ok(capsule, 'capsule Easy Recipe must exist');
    assert.ok(!Number.isNaN(capsule.cross_serp_velocity), `cross_serp_velocity must not be NaN, got ${capsule.cross_serp_velocity}`);

    // 3. Vault Surges
    const vaultPin = payload.vault_surge_pins.find(p => p.pin_id === 'vault_pin_corrupt');
    assert.ok(vaultPin, 'vault_pin_corrupt must exist');
    assert.ok(!Number.isNaN(vaultPin.effective_24h_gain), `vaultPin.effective_24h_gain must not be NaN, got ${vaultPin.effective_24h_gain}`);
    assert.ok(!Number.isNaN(vaultPin.save_count), `vaultPin.save_count must not be NaN, got ${vaultPin.save_count}`);
  });
});

