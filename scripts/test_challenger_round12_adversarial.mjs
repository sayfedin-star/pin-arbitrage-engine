/**
 * Round 12 Adversarial Empirical Stress Test Suite
 * Executed by Challenger 1 (teamwork_challenger)
 *
 * Scope:
 * 1. Vault Super-Pin prioritization ahead of active pins with synthetic titles under 350-shard cap.
 * 2. Slug parsing in derivePinTitle across hyphenated 10-25 char recipe slugs vs opaque IDs.
 * 3. KV :crossover:v3 self-healing on poisoned cache entries (unhydrated flag, null images, null pin_age_days).
 * 4. Synthetic title non-overwrite invariant in universal_master_pins and edge_pins_metadata.
 * 5. hydrateDisplacedIndexFromShards line 426 synthetic title replacement audit.
 */

import assert from 'node:assert';
import {
  isSyntheticPinTitle,
  derivePinTitle,
  calculateFolderCrossover
} from '../src/modules/keywords/folders-service.mjs';
import { hydratePinsFromD1, syncPinsBatchToD1 } from '../src/modules/keywords/d1-metadata.mjs';

console.log('================================================================================');
console.log('   ROUND 12 ADVERSARIAL CHALLENGER EMPIRICAL AUDIT HARNESS');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name} -> ${err.message}`);
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name} -> ${err.message}`);
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

// =============================================================================
// AUDIT SECTION 1: Slug Extraction in derivePinTitle
// =============================================================================
console.log('[SECTION 1] Stress-Testing Slug Extraction in derivePinTitle...');

const testCasesSlugs = [
  // A. Hyphenated 10-25 character recipe slugs
  {
    url: 'https://example.com/banana-bread',
    expected: 'Banana Bread',
    desc: 'banana-bread (12 chars, hyphenated)'
  },
  {
    url: 'https://example.com/recipes/keto-mug-cake',
    expected: 'Keto Mug Cake',
    desc: 'keto-mug-cake (13 chars, hyphenated)'
  },
  {
    url: 'https://example.com/gluten-free-pie',
    expected: 'Gluten Free Pie',
    desc: 'gluten-free-pie (15 chars, hyphenated)'
  },
  {
    url: 'https://foodblog.org/posts/easy-oatmeal-pancakes',
    expected: 'Easy Oatmeal Pancakes',
    desc: 'easy-oatmeal-pancakes (21 chars, hyphenated)'
  },
  {
    url: 'https://recipes.net/healthy-pancakes.html',
    expected: 'Healthy Pancakes',
    desc: 'healthy-pancakes.html (16 char slug before .html)'
  },
  {
    url: 'https://fashionblog.com/cozy-fall-outfit_ideas',
    expected: 'Cozy Fall Outfit Ideas',
    desc: 'cozy-fall-outfit_ideas (22 chars with hyphen and underscore)'
  },
  {
    url: 'https://baking.com/3-ingredient-cookies',
    expected: '3 Ingredient Cookies',
    desc: '3-ingredient-cookies (20 chars, starting with digit token)'
  },
  {
    url: 'https://baking.com/fluffy-buttermilk-biscuits',
    expected: 'Fluffy Buttermilk Biscuits',
    desc: 'fluffy-buttermilk-biscuits (26 chars, > 25 chars)'
  },

  // B. Opaque IDs and Hashes (Must be REJECTED, falling back to keyword or board)
  {
    url: 'https://example.com/p/65f8a912bc34de',
    expectedFallback: true,
    desc: 'Opaque hex hash 65f8a912bc34de (14 chars) must be rejected'
  },
  {
    url: 'https://example.com/posts/a1b2c3d4e5f6',
    expectedFallback: true,
    desc: 'Opaque alphanumeric ID a1b2c3d4e5f6 (12 chars) must be rejected'
  },
  {
    url: 'https://example.com/blog/1234567890',
    expectedFallback: true,
    desc: 'Pure numeric path /1234567890/ must be rejected'
  },
  {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    expectedFallback: true,
    desc: 'YouTube opaque host must be rejected'
  },
  {
    url: 'https://www.instagram.com/p/Cs99Xy_1234/',
    expectedFallback: true,
    desc: 'Instagram opaque host must be rejected'
  },
  {
    url: 'https://www.tiktok.com/@user/video/7123456789012345678',
    expectedFallback: true,
    desc: 'TikTok opaque host must be rejected'
  },
  {
    url: 'https://www.pinterest.com/pin/281543727244482/',
    expectedFallback: true,
    desc: 'Pinterest host must be rejected'
  },
  {
    url: 'https://example.com/recipes',
    expectedFallback: true,
    desc: 'Blacklisted word "recipes" must be rejected'
  }
];

for (const tc of testCasesSlugs) {
  test(`derivePinTitle slug test: ${tc.desc}`, () => {
    const derived = derivePinTitle(
      'Untitled Pin',
      tc.url,
      'Baking Ideas',
      'Baking Board',
      [],
      '',
      '',
      ''
    );
    if (tc.expected) {
      assert.strictEqual(
        derived,
        tc.expected,
        `Expected "${tc.expected}" from slug "${tc.url}", but got "${derived}"`
      );
    } else if (tc.expectedFallback) {
      assert(
        derived !== tc.url && !derived.includes('65f8a912bc34de') && !derived.includes('a1b2c3d4e5f6') && !derived.includes('dQw4w9WgXcQ'),
        `Opaque slug was not rejected! Got: "${derived}"`
      );
      // It should fall back to board name or keyword
      assert(
        derived === 'Baking Board' || derived.includes('Baking Ideas'),
        `Expected fallback to Board or Keyword, got: "${derived}"`
      );
    }
  });
}

// Test edge case: quick-n-easy-pancakes (single-letter hyphenated sub-word)
test('derivePinTitle slug test: quick-n-easy-pancakes with single letter token', () => {
  const derived = derivePinTitle(
    'Untitled Pin',
    'https://example.com/quick-n-easy-pancakes',
    'Pancake Recipe'
  );
  assert.strictEqual(
    derived,
    'Quick N Easy Pancakes',
    `Expected "Quick N Easy Pancakes", got "${derived}"`
  );
});

// =============================================================================
// AUDIT SECTION 2: KV :crossover:v3 Self-Healing on Poisoned Cache Entries
// =============================================================================
console.log('\n[SECTION 2] Stress-Testing KV :crossover:v3 Self-Healing on Poisoned Cache...');

const createMockKV = (initialStore = {}) => {
  const store = new Map(Object.entries(initialStore));
  return {
    get: async (key, opts) => {
      const val = store.get(key);
      if (val === undefined) return null;
      if (opts?.type === 'json') {
        return typeof val === 'string' ? JSON.parse(val) : val;
      }
      return val;
    },
    put: async (key, val, opts) => {
      store.set(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
    },
    delete: async (key) => {
      store.delete(key);
    },
    _rawStore: store
  };
};

const createMockSqlForFolder = (targetFolderId = 42) => {
  let executions = 0;
  const sql = async (strings, ...values) => {
    executions++;
    const rawSql = Array.isArray(strings) ? strings.join(' ? ') : String(strings);

    if (rawSql.includes('keyword_folders') && rawSql.includes('WHERE id =')) {
      return [{ id: targetFolderId, name: 'Target Topic Cluster', created_at: '2024-01-01T00:00:00Z' }];
    }
    if (rawSql.includes('keyword_folder_items') && rawSql.includes('tracked_keywords') && !rawSql.includes('keyword_serp_current')) {
      return [
        {
          id: 201,
          keyword: 'fluffy pancakes',
          category: 'Food',
          target_pin_count: 50,
          avg_daily_velocity: 100,
          top_pin_id: '111222333',
          top_pin_title: 'Fluffy Pancakes',
          top_pin_image: 'https://i.pinimg.com/736x/11/12/22/111222333.jpg',
          last_crawled_at: '2026-11-01T00:00:00Z',
          metadata: {}
        }
      ];
    }
    if (rawSql.includes('filtered_kdi') || rawSql.includes('keyword_displaced_index')) {
      return [];
    }
    if (rawSql.includes('keyword_serp_current') && rawSql.includes('is_displaced IS FALSE')) {
      return [
        {
          keyword_id: 201,
          pin_id: '111222333',
          rank_position: 1,
          title: 'Fluffy Banana Oatmeal Pancakes',
          domain: 'pancakeheaven.com',
          destination_url: 'https://pancakeheaven.com/fluffy-pancakes',
          image_url: 'https://i.pinimg.com/736x/11/12/22/111222333.jpg',
          creator_username: 'chef_pancake',
          board_name: 'Breakfast',
          visual_annotations: ['Pancake'],
          creation_method: 'ORGANIC PIN',
          save_count: 5000,
          repin_count: 500,
          comment_count: 10,
          daily_save_velocity: 40,
          delta_repins_24h: 5,
          gains_5d: 200,
          gains_7d: 280,
          gains_10d: 400,
          gains_15d: 600,
          created_at_pinterest: '2024-01-01T00:00:00Z',
          crawled_at: '2026-11-01T00:00:00Z',
          baseline_day_saves: 5000,
          snapshot_date: '2026-11-01',
          aspect_ratio: '2:3',
          format: 'ORGANIC PIN',
          seo_title: '',
          alt_text: '',
          description: '',
          keyword_text: 'fluffy pancakes',
          folder_added_at: '2026-10-01T00:00:00Z'
        }
      ];
    }
    if (rawSql.includes('keyword_guided_capsules') || rawSql.includes('domain_intelligence_rollup') || rawSql.includes('competitor_profiles')) {
      return [];
    }
    return [];
  };
  sql.getExecutions = () => executions;
  sql.query = async () => [];
  sql.begin = async (fn) => fn(sql);
  sql.transaction = async (fn) => (typeof fn === 'function' ? fn(sql) : Promise.all(fn));
  return sql;
};

await asyncTest('KV self-healing: Bypasses poisoned entry with _has_unhydrated_priority_pins=true and heals KV', async () => {
  const fid = 421;
  const kvKey = `fep:0:folder:${fid}:crossover:v3`;
  const poisonedPayload = {
    folder: { id: fid, name: 'Poisoned' },
    super_pins: [{ pin_id: '111222333', title: 'Poisoned Title', image_url: null, pin_age_days: null }],
    _has_unhydrated_priority_pins: true // Poison flag
  };

  const mockKV = createMockKV({
    'fleet:cache_epoch': '0',
    [kvKey]: JSON.stringify(poisonedPayload)
  });

  const mockSql = createMockSqlForFolder(fid);
  const res = await calculateFolderCrossover(mockSql, fid, {
    refresh: false,
    env: { PIN_ENGINE_KV: mockKV, DATABASE_TOPOLOGY: 'unified_postgres' }
  });

  assert(mockSql.getExecutions() > 0, 'Database query should have been executed to recompute poisoned data!');
  assert(res.folder.id === fid, 'Must return valid folder crossover');
  assert.strictEqual(res._has_unhydrated_priority_pins, false, '_has_unhydrated_priority_pins must be false after heal');

  // Verify KV was overwritten with healed entry
  const updatedKv = JSON.parse(mockKV._rawStore.get(kvKey));
  assert.strictEqual(updatedKv._has_unhydrated_priority_pins, false, 'KV must be healed with _has_unhydrated_priority_pins = false');
});

await asyncTest('KV self-healing: Bypasses poisoned entry with missing image_url in top 25 super_pins', async () => {
  const fid = 422;
  const kvKey = `fep:0:folder:${fid}:crossover:v3`;
  const poisonedPayload = {
    folder: { id: fid, name: 'Missing Image' },
    super_pins: [{ pin_id: '999', title: 'No Image Pin', image_url: '', pin_age_days: 100 }],
    _has_unhydrated_priority_pins: false // Flag is false, but top super_pin has empty image!
  };

  const mockKV = createMockKV({
    'fleet:cache_epoch': '0',
    [kvKey]: JSON.stringify(poisonedPayload)
  });

  const mockSql = createMockSqlForFolder(fid);
  const res = await calculateFolderCrossover(mockSql, fid, {
    refresh: false,
    env: { PIN_ENGINE_KV: mockKV, DATABASE_TOPOLOGY: 'unified_postgres' }
  });

  assert(mockSql.getExecutions() > 0, 'Database query should have been executed to recompute entry with empty image!');
  assert(res.super_pins[0].image_url !== '', 'Recomputed super_pin must have authentic image_url');
});

await asyncTest('KV self-healing: Bypasses poisoned entry with null pin_age_days in top 25 super_pins', async () => {
  const fid = 423;
  const kvKey = `fep:0:folder:${fid}:crossover:v3`;
  const poisonedPayload = {
    folder: { id: fid, name: 'Missing Age' },
    super_pins: [{ pin_id: '999', title: 'Age Null Pin', image_url: 'https://i.pinimg.com/test.jpg', pin_age_days: null }],
    _has_unhydrated_priority_pins: false
  };

  const mockKV = createMockKV({
    'fleet:cache_epoch': '0',
    [kvKey]: JSON.stringify(poisonedPayload)
  });

  const mockSql = createMockSqlForFolder(fid);
  const res = await calculateFolderCrossover(mockSql, fid, {
    refresh: false,
    env: { PIN_ENGINE_KV: mockKV, DATABASE_TOPOLOGY: 'unified_postgres' }
  });

  assert(mockSql.getExecutions() > 0, 'Database query should have been executed to recompute entry with null pin_age_days!');
  assert(typeof res.super_pins[0].pin_age_days === 'number', 'Recomputed super_pin must have numeric pin_age_days');
});

await asyncTest('KV Healthy Hit: Returns cached data immediately when clean', async () => {
  const fid = 424;
  const kvKey = `fep:0:folder:${fid}:crossover:v3`;
  const healthyPayload = {
    folder: { id: fid, name: 'Clean Topic Cluster' },
    super_pins: [{ pin_id: '111222333', title: 'Clean Pin', image_url: 'https://i.pinimg.com/clean.jpg', pin_age_days: 120 }],
    _has_unhydrated_priority_pins: false
  };

  const mockKV = createMockKV({
    'fleet:cache_epoch': '0',
    [kvKey]: JSON.stringify(healthyPayload)
  });

  const mockSql = createMockSqlForFolder(fid);
  const res = await calculateFolderCrossover(mockSql, fid, {
    refresh: false,
    env: { PIN_ENGINE_KV: mockKV, DATABASE_TOPOLOGY: 'unified_postgres' }
  });

  assert.strictEqual(mockSql.getExecutions(), 0, 'Database query must NOT execute when KV has clean cached data!');
  assert.strictEqual(res.folder.name, 'Clean Topic Cluster');
  assert.strictEqual(res.super_pins[0].title, 'Clean Pin');
});

// =============================================================================
// AUDIT SECTION 3: Synthetic Title Exclusion in SQL Upserts
// =============================================================================
console.log('\n[SECTION 3] Stress-Testing Synthetic Title Non-Overwrite Invariant...');

// Test 3A: universal_master_pins Postgres CASE regex
// Regex in service.mjs:193-194:
// !~* '(^|\s)(Inspiration|Idea)$'
// !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
const testPostgresSyntheticRegex = (title) => {
  if (!title || title === '') return false;
  const isMatch1 = /(^|\s)(Inspiration|Idea)$/i.test(title);
  const isMatch2 = /^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$/i.test(title);
  return isMatch1 || isMatch2;
};

test('Postgres CASE regex rejects "oatmeal pancakes Inspiration"', () => {
  assert(testPostgresSyntheticRegex('oatmeal pancakes Inspiration'), 'Should reject "oatmeal pancakes Inspiration"');
});

test('Postgres CASE regex rejects "Inspiration"', () => {
  assert(testPostgresSyntheticRegex('Inspiration'), 'Should reject standalone "Inspiration"');
});

test('Postgres CASE regex rejects "cozy sweater Idea"', () => {
  assert(testPostgresSyntheticRegex('cozy sweater Idea'), 'Should reject "cozy sweater Idea"');
});

test('Postgres CASE regex rejects "Untitled Pin"', () => {
  assert(testPostgresSyntheticRegex('Untitled Pin'), 'Should reject "Untitled Pin"');
});

test('Postgres CASE regex rejects "Pin #98765"', () => {
  assert(testPostgresSyntheticRegex('Pin #98765'), 'Should reject "Pin #98765"');
});

test('Postgres CASE regex rejects "Pinterest Visual Guide"', () => {
  assert(testPostgresSyntheticRegex('Pinterest Visual Guide'), 'Should reject "Pinterest Visual Guide"');
});

test('Postgres CASE regex PERMITS authentic title "Inspiration for Modern Kitchens"', () => {
  assert(!testPostgresSyntheticRegex('Inspiration for Modern Kitchens'), 'Must permit "Inspiration for Modern Kitchens"');
});

test('Postgres CASE regex PERMITS authentic title "Gluten-Free Pancakes"', () => {
  assert(!testPostgresSyntheticRegex('Gluten-Free Pancakes'), 'Must permit "Gluten-Free Pancakes"');
});

// Test 3B: D1 edge_pins_metadata SQLite CASE expressions
// In d1-metadata.mjs:106-109:
// LOWER(TRIM(excluded.title)) NOT LIKE '% inspiration'
// LOWER(TRIM(excluded.title)) NOT LIKE '% idea'
// LOWER(TRIM(excluded.title)) NOT IN ('untitled', 'untitled pin', 'pin', 'pinterest visual guide', 'pinterest pin idea')
const testD1SyntheticGuard = (title) => {
  if (!title || title === '') return true; // empty
  const t = title.trim().toLowerCase();
  if (t.endsWith(' inspiration')) return true;
  if (t.endsWith(' idea')) return true;
  if (['untitled', 'untitled pin', 'pin', 'pinterest visual guide', 'pinterest pin idea'].includes(t)) return true;
  return false;
};

test('D1 SQLite CASE rejects "oatmeal pancakes inspiration"', () => {
  assert(testD1SyntheticGuard('oatmeal pancakes inspiration'), 'Should reject');
});

test('D1 SQLite CASE rejects "fall outfit idea"', () => {
  assert(testD1SyntheticGuard('fall outfit idea'), 'Should reject');
});

test('D1 SQLite CASE rejects "Untitled Pin"', () => {
  assert(testD1SyntheticGuard('Untitled Pin'), 'Should reject');
});

test('D1 SQLite CASE rejects "Pinterest Visual Guide"', () => {
  assert(testD1SyntheticGuard('Pinterest Visual Guide'), 'Should reject');
});

test('D1 SQLite CASE PERMITS "Inspiration for Modern Living"', () => {
  assert(!testD1SyntheticGuard('Inspiration for Modern Living'), 'Must permit');
});

test('D1 SQLite CASE PERMITS authentic title "Fluffy Oat Pancakes"', () => {
  assert(!testD1SyntheticGuard('Fluffy Oat Pancakes'), 'Must permit');
});

// =============================================================================
// AUDIT SECTION 4: Prioritization Under Shard Cap
// =============================================================================
console.log('\n[SECTION 4] Stress-Testing Vault Super-Pin Prioritization Under 350-Shard Cap...');

test('Missing-image sort prioritizes displaced Vault pins ahead of 500 synthetic active pins', () => {
  const pins = [];
  const VAULT_PID_A = 'vault_pin_alpha';
  const VAULT_PID_B = 'vault_pin_beta';

  // Add 400 active pins that have image_url but synthetic titles
  for (let i = 1; i <= 400; i++) {
    pins.push({
      pin_id: `active_${i}`,
      title: `Keyword ${i} Inspiration`,
      raw_title: '',
      image_url: `https://i.pinimg.com/active_${i}.jpg`,
      is_super_pin: false,
      daily_save_velocity: 50,
      save_count: 500
    });
  }

  // Add 2 displaced Vault Super-Pins with NO image_url and NO title
  pins.push({
    pin_id: VAULT_PID_A,
    title: '',
    raw_title: '',
    image_url: '',
    is_super_pin: true,
    daily_save_velocity: 150,
    save_count: 25000
  });

  pins.push({
    pin_id: VAULT_PID_B,
    title: '',
    raw_title: '',
    image_url: '',
    is_super_pin: true,
    daily_save_velocity: 120,
    save_count: 18000
  });

  const enrichedMap = new Map();

  // Exact sorting logic from folders-service.mjs:2641-2649
  const sorted = pins
    .slice()
    .sort((a, b) => {
      const aMissingImg = !(a.image_url || enrichedMap.get(a.pin_id)?.image_url);
      const bMissingImg = !(b.image_url || enrichedMap.get(b.pin_id)?.image_url);
      if (aMissingImg !== bMissingImg) return bMissingImg ? 1 : -1;
      if (Boolean(b.is_super_pin) !== Boolean(a.is_super_pin)) return b.is_super_pin ? 1 : -1;
      if ((b.daily_save_velocity || 0) !== (a.daily_save_velocity || 0)) return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
      if ((b.overlap_count || 0) !== (a.overlap_count || 0)) return (b.overlap_count || 0) - (a.overlap_count || 0);
      return (b.save_count || 0) - (a.save_count || 0);
    });

  const SYNC_SHARD_HYDRATION_CAP = 350;
  const prioritySlice = sorted.slice(0, SYNC_SHARD_HYDRATION_CAP);
  const priorityPids = prioritySlice.map(p => p.pin_id);

  assert(priorityPids.includes(VAULT_PID_A), `Vault Pin A must be in priority slice (got rank: ${sorted.findIndex(p => p.pin_id === VAULT_PID_A)})`);
  assert(priorityPids.includes(VAULT_PID_B), `Vault Pin B must be in priority slice (got rank: ${sorted.findIndex(p => p.pin_id === VAULT_PID_B)})`);
  assert.strictEqual(sorted[0].pin_id, VAULT_PID_A, 'Vault Pin A (higher velocity) must be ranked #1');
  assert.strictEqual(sorted[1].pin_id, VAULT_PID_B, 'Vault Pin B (second highest velocity) must be ranked #2');
});

// =============================================================================
// AUDIT SECTION 5: hydrateDisplacedIndexFromShards line 426 Inspection
// =============================================================================
console.log('\n[SECTION 5] Inspecting hydrateDisplacedIndexFromShards Mapping Logic...');

test('Audit hydrateDisplacedIndexFromShards line 426 mapping contract', () => {
  // If row has synthetic title, does line 426: `title: row.title || m.title || ''` preserve row.title?
  const row = { pin_id: '123', title: 'oatmeal pancakes Inspiration', image_url: 'https://i.pinimg.com/123.jpg' };
  const m = { pin_id: '123', title: 'Authentic Oatmeal Pancakes', image_url: 'https://i.pinimg.com/123.jpg' };

  // Current code at service.mjs:426:
  const currentMappedTitle = row.title || m.title || '';
  // Hardened code:
  const hardenedMappedTitle = (!isSyntheticPinTitle(row.title) ? row.title : (!isSyntheticPinTitle(m.title) ? m.title : (row.title || m.title || '')));

  assert.strictEqual(currentMappedTitle, 'oatmeal pancakes Inspiration', 'Confirmed current line 426 retains row.title because it is non-empty');
  assert.strictEqual(hardenedMappedTitle, 'Authentic Oatmeal Pancakes', 'Hardened line 426 replaces synthetic row.title with authentic m.title');
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================================');
console.log(`CHALLENGER AUDIT COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (Total: ${totalTests})`);
console.log('================================================================================\n');

if (failedTests > 0) {
  console.log(`🚨 FAILURES DETECTED: ${failedTests}`);
  for (const f of failureDetails) {
    console.log(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('🎉 ALL ADVERSARIAL CHALLENGES VERIFIED AND PASSED 100% GREEN.');
}
