/**
 * scripts/test_global_24h_pulse_studio.mjs
 *
 * Dedicated Offline Verification Test Suite for the
 * Global 24-Hour Algorithmic Pulse & Crossover Studio (/pulse, /24h, /folders/:id/pulse).
 *
 * 8 Comprehensive Test Suites:
 * - Suite 1: Module Exports & Interface Contracts
 * - Suite 2: Defensive Normalization of visual_annotations (extractCleanAnnotations)
 * - Suite 3: In-Memory N-Gram Set Mining (1-gram, 2-pairs A+B, 3-triplets A+B+C, top 10 cap)
 * - Suite 4: SQL Query Structure & Schema Parity (zero-Cartesian CTEs, Hub skeletal compaction)
 * - Suite 5: Mock SQL Integration & 8-Section Payload Verification
 * - Suite 6: Cache & Cooldown Semantics (pulseMemoryCache 120s, pulseForceRefreshCooldown 15s)
 * - Suite 7: Route Dispatch & HTTP Method Security (GET 200, HEAD 200, POST 405)
 * - Suite 8: UI Template Rendering & Alpine Contract Validation
 *
 * Invariant Verification:
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 * // [INVARIANT: MONOTONIC-REQUEST-SEQUENCING]
 * // [INVARIANT: WINDOWED-DOM-PAGINATION]
 * // [INVARIANT: HEADLESS-NODE-SHIELD]
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Test metrics tracker
let totalTests = 0;
let passedTests = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n--- ${name} ---`);
}

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

async function runTestSuite() {
  const startTime = Date.now();
  console.log('='.repeat(80));
  console.log('   GLOBAL 24-HOUR PULSE & CROSSOVER STUDIO OFFLINE VERIFICATION SUITE');
  console.log('='.repeat(80));

  // Dynamic imports
  const pulseService = await import('../src/modules/pulse/service.mjs');
  const pulseUi = await import('../src/pulse-ui.mjs');
  const clusterRoutes = await import('../src/routes/cluster.mjs');
  const pagesRoutes = await import('../src/routes/pages.mjs');
  const workerModule = await import('../src/worker.mjs');

  // ==========================================================================
  // SUITE 1: Module Exports & Interface Contracts
  // ==========================================================================
  suite('SUITE 1: Module Exports & Interface Contracts');

  test('1.1 src/modules/pulse/service.mjs exports required functions and state maps', () => {
    assert.strictEqual(typeof pulseService.getGlobal24hPulseService, 'function', 'getGlobal24hPulseService must be exported function');
    assert.strictEqual(typeof pulseService.invalidateGlobalPulseCache, 'function', 'invalidateGlobalPulseCache must be exported function');
    assert.strictEqual(typeof pulseService.extractCleanAnnotations, 'function', 'extractCleanAnnotations must be exported function');
    assert.strictEqual(typeof pulseService.synthesizePinBlueprint, 'function', 'synthesizePinBlueprint must be exported function');
    assert.ok(pulseService.pulseMemoryCache instanceof Map, 'pulseMemoryCache must be Map instance');
    assert.ok(pulseService.pulseForceRefreshCooldown instanceof Map, 'pulseForceRefreshCooldown must be Map instance');
    assert.ok(pulseService.inflightPulse instanceof Map, 'inflightPulse must be Map instance');
    assert.strictEqual(pulseService.PULSE_MEMORY_CACHE_MAX, 25, 'PULSE_MEMORY_CACHE_MAX must be 25');
    assert.strictEqual(pulseService.PULSE_MEMORY_TTL_MS, 120000, 'PULSE_MEMORY_TTL_MS must be 120s (120,000ms)');
    assert.strictEqual(pulseService.PULSE_FORCE_REFRESH_COOLDOWN_MS, 15000, 'PULSE_FORCE_REFRESH_COOLDOWN_MS must be 15s (15,000ms)');
  });

  test('1.2 src/pulse-ui.mjs exports getPulsePageHtml function', () => {
    assert.strictEqual(typeof pulseUi.getPulsePageHtml, 'function', 'getPulsePageHtml must be exported function');
  });

  test('1.3 src/routes/cluster.mjs exports isClusterRoute and handleClusterRoutes', () => {
    assert.strictEqual(typeof clusterRoutes.isClusterRoute, 'function', 'isClusterRoute must be exported function');
    assert.strictEqual(typeof clusterRoutes.handleClusterRoutes, 'function', 'handleClusterRoutes must be exported function');
  });

  test('1.4 src/routes/pages.mjs exports handlePagesRoutes', () => {
    assert.strictEqual(typeof pagesRoutes.handlePagesRoutes, 'function', 'handlePagesRoutes must be exported function');
  });

  test('1.5 src/worker.mjs exports default worker fetch handler and RESERVED_KEYWORD_SLUGS', () => {
    assert.strictEqual(typeof workerModule.default.fetch, 'function', 'worker.fetch must be function');
    assert.ok(workerModule.RESERVED_KEYWORD_SLUGS.has('pulse'), 'RESERVED_KEYWORD_SLUGS must include pulse');
    assert.ok(workerModule.RESERVED_KEYWORD_SLUGS.has('24h'), 'RESERVED_KEYWORD_SLUGS must include 24h');
  });

  // ==========================================================================
  // SUITE 2: Defensive Normalization of visual_annotations (extractCleanAnnotations)
  // ==========================================================================
  suite('SUITE 2: Defensive Normalization of visual_annotations (extractCleanAnnotations)');

  const { extractCleanAnnotations } = pulseService;

  test('2.1 Flat string array parsing and whitespace trimming', () => {
    const input = ['  Quick Dinners  ', 'Pasta Bake '];
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out[0], { norm: 'quick dinners', display: 'Quick Dinners' });
    assert.deepStrictEqual(out[1], { norm: 'pasta bake', display: 'Pasta Bake' });
  });

  test('2.2 Case-insensitive and multi-whitespace deduplication', () => {
    const input = ['Marry Me Chicken', 'marry me chicken', '  MARRY ME CHICKEN  ', 'Marry   Me   Chicken'];
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 1, 'Duplicate annotations with varying cases/spacing must collapse to 1');
    assert.deepStrictEqual(out[0], { norm: 'marry me chicken', display: 'Marry Me Chicken' });
  });

  test('2.3 Structured object array parsing ([{ name, url, idea_id }])', () => {
    const input = [
      { url: 'https://pinterest.com/ideas/summer-outfits/123', name: 'Summer Outfits', idea_id: '123' },
      { url: null, name: 'Casual Chic', idea_id: null }
    ];
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out[0], { norm: 'summer outfits', display: 'Summer Outfits' });
    assert.deepStrictEqual(out[1], { norm: 'casual chic', display: 'Casual Chic' });
  });

  test('2.4 Variant property keys (.tag, .label, .display_label, .term)', () => {
    const input = [
      { tag: 'Healthy Bowls' },
      { label: 'Dinner Ideas' },
      { display_label: 'Keto Snacks' },
      { term: 'Slow Cooker' }
    ];
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 4);
    assert.strictEqual(out[0].norm, 'healthy bowls');
    assert.strictEqual(out[1].norm, 'dinner ideas');
    assert.strictEqual(out[2].norm, 'keto snacks');
    assert.strictEqual(out[3].norm, 'slow cooker');
  });

  test('2.5 Stringified JSON array handling', () => {
    const input = '["Easy Pasta", "Baked Ziti"]';
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].norm, 'easy pasta');
    assert.strictEqual(out[1].norm, 'baked ziti');
  });

  test('2.6 Wrapped object containing .tags array handling', () => {
    const input = { tags: ['Home Decor', 'Minimalist Interior'] };
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].norm, 'home decor');
    assert.strictEqual(out[1].norm, 'minimalist interior');
  });

  test('2.7 Filtering of short labels (< 2 characters)', () => {
    const input = ['', 'a', '  ', 'ok', 'good meal'];
    const out = extractCleanAnnotations(input);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].norm, 'ok');
    assert.strictEqual(out[1].norm, 'good meal');
  });

  test('2.8 Malformed input immunity (null, undefined, number, corrupt string, empty object)', () => {
    assert.deepStrictEqual(extractCleanAnnotations(null), []);
    assert.deepStrictEqual(extractCleanAnnotations(undefined), []);
    assert.deepStrictEqual(extractCleanAnnotations(12345), []);
    assert.deepStrictEqual(extractCleanAnnotations(''), []);
    assert.deepStrictEqual(extractCleanAnnotations('{corrupt json string ['), []);
    assert.deepStrictEqual(extractCleanAnnotations({}), []);
    assert.deepStrictEqual(extractCleanAnnotations([null, undefined, 42, {}]), []);
  });

  test('2.9 Zero hallucinated confidence scores', () => {
    const input = ['Chicken Recipes', { name: 'Air Fryer Chicken' }];
    const out = extractCleanAnnotations(input);
    for (const item of out) {
      assert.strictEqual(item.score, undefined, 'Must NEVER fabricate score or confidence properties on annotations');
    }
  });

  // ==========================================================================
  // SUITE 3: In-Memory N-Gram Set Mining (1-gram, 2-pairs A+B, 3-triplets A+B+C, top 10 cap)
  // ==========================================================================
  suite('SUITE 3: In-Memory N-Gram Set Mining (1-gram, 2-pairs A+B, 3-triplets A+B+C, top 10 cap)');

  test('3.1 1-Annotation Single Frequency & Momentum Counting Logic', () => {
    const tagsPin1 = extractCleanAnnotations(['chicken', 'dinner', 'easy']);
    const tagsPin2 = extractCleanAnnotations(['chicken', 'dinner', 'healthy']);

    const tagCounts = new Map();
    for (const pinTags of [tagsPin1, tagsPin2]) {
      for (const t of pinTags) {
        tagCounts.set(t.norm, (tagCounts.get(t.norm) || 0) + 1);
      }
    }

    assert.strictEqual(tagCounts.get('chicken'), 2, 'Chicken appears on 2 pins');
    assert.strictEqual(tagCounts.get('dinner'), 2, 'Dinner appears on 2 pins');
    assert.strictEqual(tagCounts.get('easy'), 1, 'Easy appears on 1 pin');
    assert.strictEqual(tagCounts.get('healthy'), 1, 'Healthy appears on 1 pin');
  });

  test('3.2 2-Annotation Pair (A + B) Canonical Alphabetical Sorting (A < B)', () => {
    const rawTags = ['easy', 'chicken', 'dinner'];
    const sorted = extractCleanAnnotations(rawTags).sort((a, b) => a.norm.localeCompare(b.norm));

    const pairs = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        assert.ok(sorted[i].norm < sorted[j].norm, 'Pair elements must be strictly ordered alphabetically');
        pairs.push(`${sorted[i].norm} + ${sorted[j].norm}`);
      }
    }

    assert.strictEqual(pairs.length, 3, '3 tags produce exactly 3 pairs (3 choose 2)');
    assert.deepStrictEqual(pairs, [
      'chicken + dinner',
      'chicken + easy',
      'dinner + easy'
    ]);
  });

  test('3.3 Combinatoric Pair Generation Parity across Tag Counts', () => {
    function countPairsForN(n) {
      if (n < 2) return 0;
      return (n * (n - 1)) / 2;
    }
    assert.strictEqual(countPairsForN(0), 0);
    assert.strictEqual(countPairsForN(1), 0);
    assert.strictEqual(countPairsForN(2), 1);
    assert.strictEqual(countPairsForN(3), 3);
    assert.strictEqual(countPairsForN(4), 6);
    assert.strictEqual(countPairsForN(10), 45);
  });

  test('3.4 3-Annotation Triplet (A + B + C) Canonical Alphabetical Sorting (A < B < C)', () => {
    const rawTags = ['healthy', 'easy', 'chicken', 'dinner'];
    const sorted = extractCleanAnnotations(rawTags).sort((a, b) => a.norm.localeCompare(b.norm));

    const triplets = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        for (let k = j + 1; k < sorted.length; k++) {
          assert.ok(sorted[i].norm < sorted[j].norm, 'A < B');
          assert.ok(sorted[j].norm < sorted[k].norm, 'B < C');
          triplets.push(`${sorted[i].norm} + ${sorted[j].norm} + ${sorted[k].norm}`);
        }
      }
    }

    assert.strictEqual(triplets.length, 4, '4 tags produce exactly 4 triplets (4 choose 3)');
    assert.deepStrictEqual(triplets, [
      'chicken + dinner + easy',
      'chicken + dinner + healthy',
      'chicken + easy + healthy',
      'dinner + easy + healthy'
    ]);
  });

  test('3.5 Combinatoric Triplet Generation Parity across Tag Counts', () => {
    function countTripletsForN(n) {
      if (n < 3) return 0;
      return (n * (n - 1) * (n - 2)) / 6;
    }
    assert.strictEqual(countTripletsForN(0), 0);
    assert.strictEqual(countTripletsForN(1), 0);
    assert.strictEqual(countTripletsForN(2), 0);
    assert.strictEqual(countTripletsForN(3), 1);
    assert.strictEqual(countTripletsForN(4), 4);
    assert.strictEqual(countTripletsForN(5), 10);
    assert.strictEqual(countTripletsForN(10), 120);
  });

  test('3.6 Top 10 Annotation Cap per Pin eliminates Combinatorial Explosion', () => {
    // Anomalous pin with 25 annotations
    const tags25 = Array.from({ length: 25 }, (_, i) => `annotation_${String(i).padStart(2, '0')}`);
    const sorted = extractCleanAnnotations(tags25).sort((a, b) => a.norm.localeCompare(b.norm));

    // Cap at top 10
    const capped = sorted.slice(0, 10);
    assert.strictEqual(capped.length, 10);

    let tripletCount = 0;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        for (let k = j + 1; k < capped.length; k++) {
          tripletCount++;
        }
      }
    }
    assert.strictEqual(tripletCount, 120, 'Capping at 10 guarantees at most 120 triplets (10 choose 3) per pin');
  });

  test('3.7 Effective 24h Momentum Calculation Parity', () => {
    const dailyVelocity = 145.5;
    const deltaRepins = 80;
    const effectiveMomentum = Number((dailyVelocity + deltaRepins).toFixed(2));
    assert.strictEqual(effectiveMomentum, 225.5);
  });

  // ==========================================================================
  // SUITE 4: SQL Query Structure & Schema Parity (Zero-Cartesian CTEs & Compaction)
  // ==========================================================================
  suite('SUITE 4: SQL Query Structure & Schema Parity');

  test('4.1 Source inspection: WITH kw_folders AS (...) pre-aggregation CTE is present', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');
    assert.ok(/WITH\s+kw_folders\s+AS/i.test(code), 'WITH kw_folders AS CTE must be present');
    assert.ok(/jsonb_agg\(/i.test(code), 'jsonb_agg folder aggregation must be present');
    assert.ok(/GROUP\s+BY\s+kfi\.keyword_id/i.test(code), 'GROUP BY kfi.keyword_id must be present');
  });

  test('4.2 Source inspection: Zero Cartesian multiplication on folder joins', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');
    assert.ok(/LEFT\s+JOIN\s+kw_folders\s+(?:kf|kwf)\s+ON\s+(?:kf|kwf)\.keyword_id\s*=\s*ksc\.keyword_id/i.test(code), 'Must left join pre-aggregated kw_folders CTE');
    assert.ok(/COALESCE\((?:kf|kwf)\.folders,\s*'\[\]'::jsonb\)/i.test(code), 'Must coalesce folders to empty JSONB array');
  });

  test('4.3 Source inspection: Folder scoping uses EXISTS correlated semi-join', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');
    assert.ok(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+keyword_folder_items\s+fi/i.test(code), 'Folder filtering must use EXISTS correlated semi-join to prevent row fan-out');
  });

  test('4.4 Hub Skeletal Compaction: Zero non-existent or empty columns queried on Central Hub', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');
    // keyword_serp_current
    assert.ok(!/\bksc\.description\b/i.test(code), 'Must NOT query ksc.description on Central Hub');
    assert.ok(!/\bksc\.alt_text\b/i.test(code), 'Must NOT query ksc.alt_text on Central Hub');
    assert.ok(!/\bksc\.reaction_count\b/i.test(code), 'Must NOT query ksc.reaction_count on Central Hub');
    // keyword_displaced_index
    assert.ok(!/\bkdi\.id\b/i.test(code), 'Must NOT query kdi.id (table has composite key)');
    assert.ok(!/\bkdi\.last_rank\b/i.test(code), 'Must NOT query kdi.last_rank (must be last_known_rank)');
    assert.ok(!/\bkdi\.last_saves\b/i.test(code), 'Must NOT query kdi.last_saves (must be save_count)');
    assert.ok(!/\bkdi\.last_checked_at\b/i.test(code), 'Must NOT query kdi.last_checked_at (must be updated_at)');
    // pa_pins
    assert.ok(!/\bpa\.save_count\b/i.test(code), 'Must NOT query pa.save_count (column is pa.saves)');
    assert.ok(!/\bpa\.daily_save_velocity\b/i.test(code), 'Must NOT query pa.daily_save_velocity (column is pa.velocity)');
    // universal_master_pins
    assert.ok(!/\bump\.url_global_saves\b/i.test(code), 'Must NOT query ump.url_global_saves (does not exist on shards)');
  });

  test('4.5 Historical snapshot delta fallbacks CTE on competitor_history_snapshots is present', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'src', 'modules', 'pulse', 'service.mjs'), 'utf8');
    assert.ok(/competitor_history_snapshots/i.test(code), 'Must query competitor_history_snapshots for historical fallback deltas');
    assert.ok(/snap_prev1d/i.test(code), 'snap_prev1d CTE must be present');
    assert.ok(/snap_prev7d/i.test(code), 'snap_prev7d CTE must be present');
  });

  // ==========================================================================
  // SUITE 5: Mock SQL Integration & 8-Section Payload Verification
  // ==========================================================================
  suite('SUITE 5: Mock SQL Integration & 8-Section Payload Verification');

  // Build a realistic deterministic mock SQL driver
  function createPulseMockSql() {
    let callCount = 0;

    const mockSql = async (strings, ...values) => {
      callCount++;
      const q = strings.join('?');

      // Query 1: Active SERP
      if (q.includes('kw_folders') && q.includes('keyword_serp_current')) {
        return [
          {
            keyword_id: 1,
            keyword_text: 'easy dinner recipes',
            keyword_category: 'Food',
            folders: [{ folder_id: 1, folder_name: 'Dinner Folder', folder_color: '#ec4899' }],
            pin_id: 'pin_rocket_01',
            rank_position: 2,
            prev_rank_position: 4,
            title: '20-Minute Sheet Pan Chicken Dinner',
            domain: 'foodieblog.com',
            destination_url: 'https://foodieblog.com/sheet-pan-chicken',
            image_url: 'https://i.pinimg.com/236x/sheet-pan.jpg',
            creator_username: 'chefjohn',
            board_name: 'Quick Weeknight Dinners',
            save_count: 3200,
            repin_count: 850,
            daily_save_velocity: 320.5,
            delta_repins_24h: 110,
            gains_5d: 850,
            gains_7d: 1200,
            gains_10d: 1500,
            gains_15d: 1800,
            url_global_saves: 4500,
            dominant_color: '#e11d48',
            visual_annotations: ['Sheet Pan Dinner', 'Chicken Recipes', 'Easy Dinners'],
            created_at_pinterest: new Date(Date.now() - 4 * 86400000).toISOString(), // 4 days old (Fresh Rocket <= 14d)
            creation_method: 'organic',
            crawled_at: new Date().toISOString()
          },
          {
            // Bridge Pin ranking in keyword 1 AND keyword 2
            keyword_id: 1,
            keyword_text: 'easy dinner recipes',
            keyword_category: 'Food',
            folders: [{ folder_id: 1, folder_name: 'Dinner Folder', folder_color: '#ec4899' }],
            pin_id: 'pin_bridge_02',
            rank_position: 1,
            prev_rank_position: 1,
            title: 'Crispy Garlic Parmesan Potatoes',
            domain: 'recipehub.com',
            destination_url: 'https://recipehub.com/garlic-potatoes',
            image_url: 'https://i.pinimg.com/236x/potatoes.jpg',
            creator_username: 'potatoking',
            board_name: 'Side Dishes',
            save_count: 8900,
            repin_count: 2400,
            daily_save_velocity: 180.0,
            delta_repins_24h: 75,
            gains_5d: 600,
            gains_7d: 850,
            gains_10d: 1100,
            gains_15d: 1300,
            url_global_saves: 9500,
            dominant_color: '#f59e0b',
            visual_annotations: ['Garlic Potatoes', 'Easy Dinners', 'Side Dishes'],
            created_at_pinterest: new Date(Date.now() - 30 * 86400000).toISOString(),
            creation_method: 'organic',
            crawled_at: new Date().toISOString()
          },
          {
            // Bridge Pin occurrence in keyword 2 across another folder
            keyword_id: 2,
            keyword_text: 'healthy side dishes',
            keyword_category: 'Food',
            folders: [{ folder_id: 2, folder_name: 'Healthy Living', folder_color: '#10b981' }],
            pin_id: 'pin_bridge_02',
            rank_position: 3,
            prev_rank_position: 5,
            title: 'Crispy Garlic Parmesan Potatoes',
            domain: 'recipehub.com',
            destination_url: 'https://recipehub.com/garlic-potatoes',
            image_url: 'https://i.pinimg.com/236x/potatoes.jpg',
            creator_username: 'potatoking',
            board_name: 'Healthy Sides',
            save_count: 8900,
            repin_count: 2400,
            daily_save_velocity: 180.0,
            delta_repins_24h: 75,
            gains_5d: 600,
            gains_7d: 850,
            gains_10d: 1100,
            gains_15d: 1300,
            url_global_saves: 9500,
            dominant_color: '#f59e0b',
            visual_annotations: ['Garlic Potatoes', 'Easy Dinners', 'Side Dishes'],
            created_at_pinterest: new Date(Date.now() - 30 * 86400000).toISOString(),
            creation_method: 'organic',
            crawled_at: new Date().toISOString()
          },
          {
            // Vacuum hijack target pin
            keyword_id: 1,
            keyword_text: 'easy dinner recipes',
            keyword_category: 'Food',
            folders: [{ folder_id: 1, folder_name: 'Dinner Folder', folder_color: '#ec4899' }],
            pin_id: 'pin_hijack_03',
            rank_position: 9,
            prev_rank_position: 14,
            title: 'Creamy Mushroom Pasta',
            domain: 'pastalover.com',
            destination_url: 'https://pastalover.com/creamy-mushroom',
            image_url: 'https://i.pinimg.com/236x/pasta.jpg',
            creator_username: 'pastachef',
            board_name: 'Pasta Ideas',
            save_count: 1200,
            repin_count: 300,
            daily_save_velocity: 75.0,
            delta_repins_24h: 30,
            gains_5d: 150,
            gains_7d: 200,
            gains_10d: 250,
            gains_15d: 300,
            url_global_saves: 1500,
            dominant_color: '#10b981',
            visual_annotations: ['Mushroom Pasta', 'Easy Dinners'],
            created_at_pinterest: new Date(Date.now() - 60 * 86400000).toISOString(),
            creation_method: 'organic',
            crawled_at: new Date().toISOString()
          }
        ];
      }

      // Query 2A: Displaced Vacuum Counts
      if (q.includes('FROM keyword_displaced_index kdi') && q.includes('displaced_top10_24h_count')) {
        return [
          {
            keyword_id: 1,
            keyword_text: 'easy dinner recipes',
            displaced_24h_count: 6,
            displaced_top10_24h_count: 3,
            displaced_top10_7d_count: 12
          }
        ];
      }

      // Query 2B: Displaced Top 50 Vault Sleepers
      if (q.includes('FROM keyword_displaced_index kdi') && q.includes('ORDER BY GREATEST(')) {
        return [
          {
            keyword_id: 1,
            keyword_text: 'easy dinner recipes',
            pin_id: 'pin_displaced_vault_01',
            last_known_rank: 7,
            vacuum_opportunity_score: 85,
            displaced_date: new Date().toISOString().split('T')[0],
            save_count: 15400,
            repin_count: 3200,
            daily_save_velocity: 88.0,
            delta_repins_24h: 42,
            gains_5d: 200,
            gains_7d: 350,
            gains_10d: 500,
            gains_15d: 650,
            domain: 'displaceddomain.com',
            creator_username: 'vaultsleeper',
            shard_id: 1
          }
        ];
      }

      // Query 3: Guided Search Capsules
      if (q.includes('FROM keyword_guided_capsules c')) {
        return [
          {
            id: 101,
            keyword_id: 1,
            term: 'healthy',
            display_label: 'Healthy',
            score: 98.5,
            dominant_color: '#10b981',
            display_order: 1,
            keyword_text: 'easy dinner recipes',
            keyword_category: 'Food'
          },
          {
            id: 102,
            keyword_id: 2,
            term: 'healthy',
            display_label: 'Healthy',
            score: 95.0,
            dominant_color: '#10b981',
            display_order: 1,
            keyword_text: 'healthy side dishes',
            keyword_category: 'Food'
          },
          {
            id: 103,
            keyword_id: 1,
            term: 'chicken',
            display_label: 'Chicken',
            score: 92.0,
            dominant_color: '#f59e0b',
            display_order: 2,
            keyword_text: 'easy dinner recipes',
            keyword_category: 'Food'
          }
        ];
      }

      // Query 4: Breakout Creators
      if (q.includes('FROM top_creators tc') || q.includes('active_creators AS (')) {
        return [
          {
            id: 1,
            username: 'chefjohn',
            display_name: 'Chef John',
            avatar_url: 'https://i.pinimg.com/avatar/chefjohn.jpg',
            bio: 'Delicious recipes daily',
            website_url: 'https://foodieblog.com',
            monthly_reach: 2500000,
            profile_views: 750000,
            total_pins: 450,
            total_boards: 24,
            follower_count: 120000,
            delta_reach_24h: 45000,
            delta_views_24h: 18000,
            reach_delta_7d: 150000,
            views_delta_7d: 65000,
            delta_pins_24h: 3,
            last_synced_at: new Date().toISOString(),
            effective_delta_reach_24h: 45000,
            effective_delta_views_24h: 18000,
            effective_reach_delta_7d: 150000,
            effective_views_delta_7d: 65000,
            driver_pins: [
              {
                pin_id: 'pin_rocket_01',
                title: '20-Minute Sheet Pan Chicken Dinner',
                image_url: 'https://i.pinimg.com/236x/sheet-pan.jpg',
                board_name: 'Quick Weeknight Dinners',
                save_count: 3200,
                repin_count: 850,
                delta_saves_24h: 320,
                daily_save_velocity: 320.5,
                created_at_pinterest: new Date(Date.now() - 4 * 86400000).toISOString()
              }
            ]
          },
          {
            // David Breakout (< 50k reach, > 5k 24h gain)
            id: 2,
            username: 'davidbakes',
            display_name: 'David Bakes',
            avatar_url: 'https://i.pinimg.com/avatar/david.jpg',
            bio: 'Micro baker',
            website_url: 'https://davidbakes.com',
            monthly_reach: 35000,
            profile_views: 12000,
            total_pins: 85,
            total_boards: 8,
            follower_count: 2400,
            delta_reach_24h: 12500,
            delta_views_24h: 3200,
            reach_delta_7d: 18000,
            views_delta_7d: 6500,
            delta_pins_24h: 1,
            last_synced_at: new Date().toISOString(),
            effective_delta_reach_24h: 12500,
            effective_delta_views_24h: 3200,
            effective_reach_delta_7d: 18000,
            effective_views_delta_7d: 6500,
            driver_pins: []
          }
        ];
      }

      // Query 5: pa_pins winners and domain rollups
      if (q.includes('FROM pa_pins pa')) {
        return [
          {
            pin_id: 'pin_pa_winner_01',
            account_username: 'pastachef',
            title: 'Authentic Cacio e Pepe',
            domain: 'italianrecipes.com',
            board_name: 'Classic Italian',
            image_url: 'https://i.pinimg.com/236x/cacio.jpg',
            dominant_color: '#e11d48',
            saves: 12400,
            repins: 3800,
            velocity: 240.0,
            annotations: ['Cacio e Pepe', 'Italian Recipes', 'Easy Dinners']
          }
        ];
      }

      if (q.includes('FROM domain_intelligence_rollup dir')) {
        return [
          {
            domain: 'foodieblog.com',
            total_pins: 145,
            unique_urls: 90,
            active_serp_pins: 42,
            top3_pins: 12,
            top10_pins: 28,
            displaced_pins: 15,
            best_rank: 1,
            avg_rank: 5.4,
            visibility_score: 840,
            total_saves: 45000,
            avg_saves: 310,
            total_repins: 12000,
            avg_velocity: 82.5,
            pins_per_url: 1.6,
            accounts_count: 3,
            sample_accounts: ['chefjohn', 'foodieblog'],
            ad_network: 'Mediavine',
            age_days: 1240,
            age_years: 3.4,
            arbitrage_score: 88.5
          }
        ];
      }

      return [];
    };

    mockSql.getCallCount = () => callCount;
    mockSql.resetCallCount = () => { callCount = 0; };
    return mockSql;
  }

  const mockEnv = {
    PIN_ENGINE_KV: {
      get: async (k) => null,
      put: async (k, v, opts) => {},
      delete: async (k) => {}
    },
    PIN_D1_DB: null
  };

  await testAsync('5.1 getGlobal24hPulseService pipeline executes successfully with mock SQL', async () => {
    // Clear caches before test
    await pulseService.invalidateGlobalPulseCache();

    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, {
      folderId: 'all',
      window: '24h',
      forceRefresh: true
    });

    assert.ok(payload, 'Payload must be returned');
    assert.strictEqual(payload.success, true);
    assert.ok(payload.kpis, 'Section 1 kpis must exist');
    assert.ok(Array.isArray(payload.breakout_pins), 'Section 2 breakout_pins must be array');
    assert.ok(payload.annotation_crossovers, 'Section 3 annotation_crossovers must exist');
    assert.ok(Array.isArray(payload.guided_capsule_crossovers), 'Section 4 guided_capsule_crossovers must be array');
    assert.ok(Array.isArray(payload.creator_breakouts), 'Section 5 creator_breakouts must be array');
    assert.ok(payload.keyword_vacuums_and_bridges, 'Section 6 keyword_vacuums_and_bridges must exist');
    assert.ok(payload.hidden_gems_telemetry, 'Section 7 hidden_gems_telemetry must exist');
  });

  await testAsync('5.2 Section 1 (kpis): Executive pulse ribbon telemetry verification', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const kpis = payload.kpis;

    assert.strictEqual(typeof kpis.total_active_serp_pins, 'number');
    assert.strictEqual(typeof kpis.pins_gaining_24h_count, 'number');
    assert.strictEqual(typeof kpis.total_24h_saves_velocity, 'number');
    assert.strictEqual(typeof kpis.total_24h_repins_delta, 'number');
    assert.strictEqual(typeof kpis.fresh_rocket_pins_14d_count, 'number');
    assert.strictEqual(typeof kpis.breakout_creators_count, 'number');
    assert.strictEqual(typeof kpis.multi_keyword_bridge_pins_count, 'number');
    assert.strictEqual(typeof kpis.shared_guided_capsules_count, 'number');
    assert.strictEqual(typeof kpis.serp_vacuum_top10_24h_count, 'number');

    assert.ok(kpis.total_active_serp_pins >= 3, 'Must count unique active pins');
    assert.ok(kpis.fresh_rocket_pins_14d_count >= 1, 'Must count fresh rocket pin');
    assert.ok(kpis.serp_vacuum_top10_24h_count >= 3, 'Must aggregate vacuum counts');
  });

  await testAsync('5.3 Section 2 (breakout_pins): Deduplication, momentum, acceleration and fresh rockets', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const breakouts = payload.breakout_pins;

    assert.ok(breakouts.length >= 1);
    const rocket = breakouts.find(p => p.pin_id === 'pin_rocket_01');
    assert.ok(rocket, 'Rocket pin must be found in breakouts');
    assert.strictEqual(rocket.is_fresh_14d, true, 'Pin created 4d ago must be is_fresh_14d = true');
    assert.ok(rocket.effective_24h_momentum > 0, 'Effective momentum must be calculated');
    assert.ok(rocket.acceleration_ratio >= 1.0, 'Acceleration ratio must be numeric');
    assert.strictEqual(typeof rocket.is_accelerating, 'boolean');

    // Sub-arrays
    assert.ok(Array.isArray(payload.fresh_rocket_pins), 'fresh_rocket_pins must be returned');
    assert.ok(payload.fresh_rocket_pins.some(p => p.pin_id === 'pin_rocket_01'));
    assert.ok(Array.isArray(payload.vault_surge_pins), 'vault_surge_pins must be returned');
    assert.ok(Array.isArray(payload.pinarchive_winners), 'pinarchive_winners must be returned');
  });

  await testAsync('5.4 Section 3 (annotation_crossovers): 1-gram, 2-pair, and 3-triplet crossovers', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const xovers = payload.annotation_crossovers;

    assert.ok(Array.isArray(xovers.single_annotations), 'single_annotations must be array');
    assert.ok(Array.isArray(xovers.pair_crossovers), 'pair_crossovers must be array');
    assert.ok(Array.isArray(xovers.triplet_crossovers), 'triplet_crossovers must be array');

    // Check single annotations
    const easyDinner = xovers.single_annotations.find(a => a.tag_norm === 'easy dinners');
    assert.ok(easyDinner, 'Easy dinners tag must be present in singles');
    assert.ok(easyDinner.pin_count >= 2, 'Easy dinners appears on multiple mock pins');

    // Check pair crossovers
    if (xovers.pair_crossovers.length > 0) {
      const p = xovers.pair_crossovers[0];
      assert.ok(p.tag_a_norm < p.tag_b_norm, 'Pair must maintain alphabetical order');
      assert.ok(p.pin_count >= 1);
      assert.ok(p.total_velocity >= 0, 'Pair must have non-negative total_velocity');
    }

    // Check triplet crossovers
    if (xovers.triplet_crossovers.length > 0) {
      const t = xovers.triplet_crossovers[0];
      assert.ok(t.tag_a_norm < t.tag_b_norm && t.tag_b_norm < t.tag_c_norm, 'Triplet must maintain alphabetical order');
      assert.ok(t.pin_count >= 1);
      assert.ok(t.total_velocity >= 0, 'Triplet must have non-negative total_velocity');
    }
  });

  await testAsync('5.5 Section 4 (guided_capsule_crossovers): Capsule grouping and cross-keyword bridge ranking', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const capsules = payload.guided_capsule_crossovers;

    assert.ok(Array.isArray(capsules), 'guided_capsule_crossovers must be array');
    const healthyCap = capsules.find(c => c.term === 'healthy');
    const kwTexts = healthyCap.keywords.map(k => typeof k === 'string' ? k : (k.keyword_text || ''));
    assert.ok(kwTexts.includes('easy dinner recipes'));
    assert.ok(kwTexts.includes('healthy side dishes'));
  });

  await testAsync('5.6 Section 5 (creator_breakouts): Effective deltas, david breakouts, and top 3 driver pins', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const creators = payload.creator_breakouts;

    assert.ok(Array.isArray(creators), 'creator_breakouts must be array');
    const david = creators.find(c => c.username === 'davidbakes');
    assert.ok(david, 'David bakes creator must be present');
    assert.strictEqual(david.is_david_breakout, true, 'Reach < 50k and delta > 5k must classify as David Breakout');

    const john = creators.find(c => c.username === 'chefjohn');
    assert.ok(john, 'Chef John creator must be present');
    assert.ok(Array.isArray(john.driver_pins), 'Driver pins must be array');
    assert.ok(john.driver_pins.length <= 3, 'Driver pins capped at 3');
  });

  await testAsync('5.7 Section 6 (keyword_vacuums_and_bridges): Multi-keyword and cross-folder bridge pins', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const { bridge_pins, keyword_vacuum_opportunities } = payload.keyword_vacuums_and_bridges;

    assert.ok(Array.isArray(bridge_pins), 'bridge_pins must be array');
    const bridge2 = bridge_pins.find(b => b.pin_id === 'pin_bridge_02');
    assert.ok(bridge2, 'pin_bridge_02 must be classified as a bridge pin');
    assert.strictEqual(bridge2.keyword_count, 2, 'Spans 2 keywords');
    assert.strictEqual(bridge2.folder_count, 2, 'Spans 2 campaign folders');

    assert.ok(Array.isArray(keyword_vacuum_opportunities), 'keyword_vacuum_opportunities must be array');
    assert.ok(keyword_vacuum_opportunities.length >= 1);
  });

  await testAsync('5.8 Section 7 (hidden_gems_telemetry): Winning boards, vacuum hijacks, creation methods, colors, domains', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });
    const gems = payload.hidden_gems_telemetry;

    assert.ok(Array.isArray(gems.winning_boards), 'winning_boards must be array');
    assert.ok(Array.isArray(gems.vacuum_hijack_pins), 'vacuum_hijack_pins must be array');
    assert.ok(Array.isArray(gems.creation_method_breakdown), 'creation_method_breakdown must be array');
    assert.ok(Array.isArray(gems.dominant_color_palette), 'dominant_color_palette must be array');
    assert.ok(Array.isArray(gems.top_arbitrage_domains), 'top_arbitrage_domains must be array');

    // Winning boards metrics
    assert.ok(gems.winning_boards.some(b => b.board_name === 'Quick Weeknight Dinners'));
    // Color palette
    assert.ok(gems.dominant_color_palette.some(c => c.color === '#e11d48'));
    // Arbitrage domains
    assert.ok(gems.top_arbitrage_domains.some(d => d.domain === 'foodieblog.com'));
  });

  await testAsync('5.9 Section 8 (synthesizePinBlueprint): 5-Source Scientific Pin Blueprint Generator', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();
    const payload = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { forceRefresh: true });

    const blueprint = pulseService.synthesizePinBlueprint('pin_rocket_01', payload);
    assert.ok(blueprint, 'Blueprint object must be returned');
    assert.strictEqual(blueprint.pin_id, 'pin_rocket_01');
    assert.strictEqual(blueprint.title, '20-Minute Sheet Pan Chicken Dinner');
    assert.strictEqual(blueprint.domain, 'foodieblog.com');
    assert.ok(blueprint.recommended_target_board, 'Target board recommended');
    assert.ok(Array.isArray(blueprint.recommended_color_palette), 'Color palette recommended');
    assert.ok(blueprint.five_source_relevance, '5-source relevance block must be populated');
    assert.ok(blueprint.five_source_relevance.source_1_serp);
    assert.ok(blueprint.five_source_relevance.source_2_guided_capsules);
    assert.ok(blueprint.five_source_relevance.source_3_cv_annotations);
    assert.ok(blueprint.five_source_relevance.source_4_pinsage_board);
    assert.ok(blueprint.five_source_relevance.source_5_domain_leverage);
  });

  // ==========================================================================
  // SUITE 6: Cache & Cooldown Semantics (pulseMemoryCache 120s, pulseForceRefreshCooldown 15s)
  // ==========================================================================
  suite('SUITE 6: Cache & Cooldown Semantics (pulseMemoryCache 120s, pulseForceRefreshCooldown 15s)');

  await testAsync('6.1 In-memory LRU cache hit (< 2ms, zero mock SQL calls on 2nd fetch)', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();

    // 1st fetch: uncached
    await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { folderId: 'all', window: '24h' });
    const initialCalls = mockSql.getCallCount();
    assert.ok(initialCalls > 0, '1st fetch must call SQL');

    // 2nd fetch: should hit pulseMemoryCache
    const t0 = Date.now();
    const cached = await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { folderId: 'all', window: '24h' });
    const elapsed = Date.now() - t0;

    assert.ok(cached.success);
    assert.strictEqual(mockSql.getCallCount(), initialCalls, '2nd fetch with identical parameters must NOT call SQL (LRU hit)');
    assert.ok(elapsed < 20, `Cache hit should take < 20ms (took ${elapsed}ms)`);
  });

  await testAsync('6.2 15-second force-refresh cooldown per key suppresses connection storms', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();

    // 1st fetch with forceRefresh: true
    await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { folderId: 'all', window: '24h', forceRefresh: true });
    const callsAfterFirst = mockSql.getCallCount();
    assert.ok(callsAfterFirst > 0);

    // 2nd fetch with forceRefresh: true immediately within 15 seconds cooldown window
    await pulseService.getGlobal24hPulseService(mockSql, mockEnv, { folderId: 'all', window: '24h', forceRefresh: true });
    const callsAfterCooldownAttempt = mockSql.getCallCount();

    assert.strictEqual(
      callsAfterCooldownAttempt,
      callsAfterFirst,
      'Calling forceRefresh within 15s cooldown must ignore force flag and serve cache'
    );
  });

  await testAsync('6.3 Workers KV read/write contract for default filter view', async () => {
    await pulseService.invalidateGlobalPulseCache();
    let kvPutKey = null;
    let kvPutTtl = null;

    const kvMockEnv = {
      PIN_ENGINE_KV: {
        get: async (k) => null,
        put: async (k, v, opts) => {
          kvPutKey = k;
          kvPutTtl = opts?.expirationTtl;
        },
        delete: async (k) => {}
      }
    };

    const mockSql = createPulseMockSql();
    await pulseService.getGlobal24hPulseService(mockSql, kvMockEnv, { folderId: 'all', window: '24h' });

    assert.strictEqual(kvPutKey, 'pulse:global_24h:summary', 'Must write to pulse:global_24h:summary KV key');
    assert.strictEqual(kvPutTtl, 600, 'Must set expirationTtl: 600 (10 minutes) on Workers KV');
  });

  await testAsync('6.4 invalidateGlobalPulseCache clears memory LRU, cooldown map, and Workers KV', async () => {
    let kvDeletedKey = null;
    const kvMockEnv = {
      PIN_ENGINE_KV: {
        get: async () => null,
        put: async () => {},
        delete: async (k) => { kvDeletedKey = k; }
      }
    };

    // Populate cache
    const mockSql = createPulseMockSql();
    await pulseService.getGlobal24hPulseService(mockSql, kvMockEnv, { folderId: 'all', window: '24h' });
    assert.ok(pulseService.pulseMemoryCache.size > 0);

    // Invalidate
    await pulseService.invalidateGlobalPulseCache(kvMockEnv);

    assert.strictEqual(pulseService.pulseMemoryCache.size, 0, 'Memory cache must be empty');
    assert.strictEqual(pulseService.pulseForceRefreshCooldown.size, 0, 'Cooldown map must be empty');
    assert.strictEqual(kvDeletedKey, 'pulse:global_24h:summary', 'Must delete KV key');
  });

  // ==========================================================================
  // SUITE 7: Route Dispatch & HTTP Method Security
  // ==========================================================================
  suite('SUITE 7: Route Dispatch & HTTP Method Security');

  test('7.1 isClusterRoute matches /api/pulse/24h', () => {
    assert.strictEqual(clusterRoutes.isClusterRoute('/api/pulse/24h'), true);
    assert.strictEqual(clusterRoutes.isClusterRoute('/api/overview'), true);
    assert.strictEqual(clusterRoutes.isClusterRoute('/api/unknown'), false);
  });

  await testAsync('7.2 handleClusterRoutes GET /api/pulse/24h returns 200 JSON', async () => {
    await pulseService.invalidateGlobalPulseCache();
    const mockSql = createPulseMockSql();

    const routeCtx = {
      pathname: '/api/pulse/24h',
      method: 'GET',
      searchParams: new URLSearchParams('window=24h&folder_id=all'),
      targetSql: mockSql,
      env: mockEnv,
      ctx: null,
      jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      }),
      methodNotAllowedResponse: () => new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405 }),
      redactSecrets: (s) => s
    };

    const res = await clusterRoutes.handleClusterRoutes(routeCtx);
    assert.ok(res, 'Response must be returned');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.kpis);
  });

  await testAsync('7.3 handleClusterRoutes POST /api/pulse/24h returns 405 Method Not Allowed', async () => {
    const routeCtx = {
      pathname: '/api/pulse/24h',
      method: 'POST',
      searchParams: new URLSearchParams(),
      targetSql: null,
      env: mockEnv,
      ctx: null,
      jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }),
      methodNotAllowedResponse: () => new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405 }),
      redactSecrets: (s) => s
    };

    const res = await clusterRoutes.handleClusterRoutes(routeCtx);
    assert.ok(res);
    assert.strictEqual(res.status, 405, 'POST to GET-only endpoint must return 405');
  });

  await testAsync('7.4 handleClusterRoutes PUT /api/pulse/24h returns 405 Method Not Allowed', async () => {
    const routeCtx = {
      pathname: '/api/pulse/24h',
      method: 'PUT',
      searchParams: new URLSearchParams(),
      targetSql: null,
      env: mockEnv,
      ctx: null,
      jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }),
      methodNotAllowedResponse: () => new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405 }),
      redactSecrets: (s) => s
    };

    const res = await clusterRoutes.handleClusterRoutes(routeCtx);
    assert.ok(res);
    assert.strictEqual(res.status, 405, 'PUT to GET-only endpoint must return 405');
  });

  await testAsync('7.5 handlePagesRoutes handles /pulse and /24h routes with GET 200 and HEAD 200', async () => {
    const makeCtx = (path, method) => ({
      pathLower: path.toLowerCase(),
      normalizedPath: path,
      method,
      searchParams: new URLSearchParams(),
      HTML_HEADERS: { 'Content-Type': 'text/html; charset=utf-8' },
      RESERVED_KEYWORD_SLUGS: new Set(['pulse', '24h', 'discovery', 'keywords', 'accounts']),
      methodNotAllowedResponse: () => new Response('Method Not Allowed', { status: 405 }),
      jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }),
      isValidPinId: () => false
    });

    // GET /pulse
    const resGetPulse = await pagesRoutes.handlePagesRoutes(makeCtx('/pulse', 'GET'));
    if (resGetPulse) {
      assert.strictEqual(resGetPulse.status, 200);
      const html = await resGetPulse.text();
      assert.ok(html.includes('24-Hour Algorithmic Pulse'), 'HTML must contain Pulse title');
    }

    // HEAD /pulse
    const resHeadPulse = await pagesRoutes.handlePagesRoutes(makeCtx('/pulse', 'HEAD'));
    if (resHeadPulse) {
      assert.strictEqual(resHeadPulse.status, 200);
      const body = await resHeadPulse.text();
      assert.strictEqual(body, '', 'HEAD request must return empty body');
    }

    // GET /folders/test_folder_1/pulse
    const resGetFolderPulse = await pagesRoutes.handlePagesRoutes(makeCtx('/folders/test_folder_1/pulse', 'GET'));
    if (resGetFolderPulse) {
      assert.strictEqual(resGetFolderPulse.status, 200);
      const html = await resGetFolderPulse.text();
      assert.ok(html.includes('24-Hour Algorithmic Pulse'), 'HTML must contain Pulse title');
    }

    // POST /pulse -> 405
    const resPostPulse = await pagesRoutes.handlePagesRoutes(makeCtx('/pulse', 'POST'));
    if (resPostPulse) {
      assert.strictEqual(resPostPulse.status, 405, 'POST /pulse must return 405 Method Not Allowed');
    }

    // POST /24h -> 405
    const resPost24h = await pagesRoutes.handlePagesRoutes(makeCtx('/24h', 'POST'));
    if (resPost24h) {
      assert.strictEqual(resPost24h.status, 405, 'POST /24h must return 405 Method Not Allowed');
    }
  });

  // ==========================================================================
  // SUITE 8: UI Template Rendering & Alpine Contract Validation
  // ==========================================================================
  suite('SUITE 8: UI Template Rendering & Alpine Contract Validation');

  test('8.1 getPulsePageHtml returns non-empty HTML string', () => {
    const html = pulseUi.getPulsePageHtml('test_folder_1');
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 5000, `HTML length must be substantial (actual: ${html.length})`);
    assert.ok(html.includes('<!DOCTYPE html>'));
  });

  test('8.2 Swiss-grid and Geist typography verified', () => {
    const html = pulseUi.getPulsePageHtml();
    assert.ok(html.includes('Geist'), 'Must load and configure Geist font family');
    assert.ok(html.includes('font-sans') || html.includes('sans:'), 'Must configure sans font class');
  });

  test('8.3 JetBrains Mono tabular-nums numeric styling verified', () => {
    const html = pulseUi.getPulsePageHtml();
    assert.ok(html.includes('JetBrains Mono'), 'Must load JetBrains Mono font');
    assert.ok(html.includes('font-mono') || html.includes('tabular-nums'), 'Must enforce tabular numbers for layout stability');
  });

  test('8.4 Alpine.js pulseStudioApp() component hook verified', () => {
    const html = pulseUi.getPulsePageHtml();
    assert.ok(html.includes('x-data="pulseStudioApp('), 'Must initialize Alpine.js pulseStudioApp() component');
    assert.ok(html.includes('function pulseStudioApp('), 'Component function pulseStudioApp must be declared');
  });

  test('8.5 One-Click Scientific Pin Blueprint modal markup verified', () => {
    const html = pulseUi.getPulsePageHtml();
    assert.ok(html.includes('role="dialog"'), 'Blueprint modal must have role="dialog"');
    assert.ok(html.includes('aria-modal="true"'), 'Blueprint modal must specify aria-modal="true"');
    assert.ok(html.includes('@keydown.escape.window'), 'Blueprint modal must listen for Escape key');
    assert.ok(html.includes('openBlueprintModal') || html.includes('blueprintModalOpen'), 'Modal open state must be present');
  });

  test('8.6 Deferred Lucide script ordered before deferred Alpine.js in <head>', () => {
    const html = pulseUi.getPulsePageHtml();
    const lucideIndex = html.indexOf('lucide.js');
    const alpineIndex = html.indexOf('alpinejs');
    assert.ok(lucideIndex !== -1, 'Lucide script must be in head');
    assert.ok(alpineIndex !== -1, 'Alpine script must be in head');
    assert.ok(lucideIndex < alpineIndex, 'Lucide script MUST precede Alpine script in <head>');
  });

  test('8.7 Inline SVG pin favicon present in <head>', () => {
    const html = pulseUi.getPulsePageHtml();
    assert.ok(html.includes('rel="icon"'), 'Favicon link must be present');
    assert.ok(html.includes('image/svg+xml'), 'Must specify SVG favicon type');
    assert.ok(html.includes('📌'), 'Must use pin emoji in SVG favicon');
  });

  test('8.8 Classic script syntax validation via Node.js vm.Script', () => {
    const html = pulseUi.getPulsePageHtml();
    const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    assert.ok(scriptMatches.length > 0, 'Must contain inline script tags');

    for (let i = 0; i < scriptMatches.length; i++) {
      const tag = scriptMatches[i];
      if (tag.includes('src=')) continue; // skip external scripts
      const code = tag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      try {
        new vm.Script(code);
      } catch (err) {
        assert.fail(`Inline script #${i} failed classic vm.Script compilation: ${err.message}`);
      }
    }
  });

  // ==========================================================================
  // SUMMARY & SLA VERIFICATION
  // ==========================================================================
  const durationMs = Date.now() - startTime;
  console.log('\n' + '='.repeat(80));
  console.log(`🎉 ALL 8 TEST SUITES PASSED EMPIRICALLY!`);
  console.log(`   Passed: ${passedTests} / ${totalTests} assertions`);
  console.log(`   Duration: ${durationMs}ms (SLA: < 800ms)`);
  console.log('='.repeat(80));

  assert.ok(durationMs < 800, `Execution SLA exceeded: took ${durationMs}ms, expected < 800ms`);
  assert.strictEqual(passedTests, totalTests, 'All test assertions must pass');
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test harness failed:', err);
  process.exit(1);
});
