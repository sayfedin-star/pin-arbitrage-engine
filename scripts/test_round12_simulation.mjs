/**
 * Round 12 Empirical Simulation Test Suite
 *
 * Verification Gate 8:
 * Calls calculateFolderCrossover with >= 360 active pins having synthetic
 * "<Keyword> Inspiration" titles ahead of displaced Vault Super-Pins
 * (281543727244482, 524950900340768832) and asserts:
 *   - vp.image_url is non-empty (https://i.pinimg.com/...)
 *   - vp.title is non-synthetic (!isSyntheticPinTitle(vp.title))
 *   - vp.pin_age_days is a positive integer (typeof vp.pin_age_days === 'number' && vp.pin_age_days > 0)
 *   - vp.aspect_ratio is non-null ('2:3' or '9:16')
 */

import assert from 'node:assert';
import { isSyntheticPinTitle, calculateFolderCrossover } from '../src/modules/keywords/folders-service.mjs';

console.log('================================================================================');
console.log('   ROUND 12 EMPIRICAL SIMULATION GATE 8 AUDIT SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Build High-Fidelity Mock SQL Client
// -----------------------------------------------------------------------------
const ACTIVE_PIN_COUNT = 365; // >= 360 active pins to thoroughly stress the 350-shard cap
const VAULT_PIN_1 = '281543727244482';
const VAULT_PIN_2 = '524950900340768832';

let shardQueryExecutedCount = 0;
let shardQueryRequestedPids = [];

const mockSql = async (strings, ...values) => {
  const rawSql = Array.isArray(strings) ? strings.join(' ? ') : String(strings);

  // 1. Folder lookup
  if (rawSql.includes('keyword_folders') && rawSql.includes('WHERE id =')) {
    return [{ id: 999, name: 'Healthy Recipes Topic Cluster', created_at: '2024-01-01T00:00:00Z' }];
  }

  // 2. Folder keywords lookup
  if (rawSql.includes('keyword_folder_items') && rawSql.includes('tracked_keywords') && !rawSql.includes('keyword_serp_current')) {
    return [
      {
        id: 101,
        keyword: 'oatmeal pancakes',
        category: 'Food',
        target_pin_count: 50,
        avg_daily_velocity: 120,
        top_pin_id: VAULT_PIN_1,
        top_pin_title: 'oatmeal pancakes Inspiration',
        top_pin_image: 'https://i.pinimg.com/736x/28/15/43/281543727244482.jpg',
        last_crawled_at: '2026-11-01T00:00:00Z',
        metadata: {}
      },
      {
        id: 102,
        keyword: 'cozy sweater outfit',
        category: 'Fashion',
        target_pin_count: 50,
        avg_daily_velocity: 150,
        top_pin_id: VAULT_PIN_2,
        top_pin_title: 'cozy sweater outfit Inspiration',
        top_pin_image: 'https://i.pinimg.com/736x/52/49/50/524950900340768832.jpg',
        last_crawled_at: '2026-11-01T00:00:00Z',
        metadata: {}
      }
    ];
  }

  // 3. Displaced Vault Index (keyword_displaced_index): Return displaced Vault Super-Pins
  if (rawSql.includes('filtered_kdi') || rawSql.includes('WITH active_pin_ids') || rawSql.includes('keyword_displaced_index')) {
    return [
      {
        keyword_id: 101,
        pin_id: VAULT_PIN_1,
        rank_position: 2,
        domain: 'oatmealhealth.com',
        creator_username: 'chef_oats',
        save_count: 15000,
        repin_count: 1200,
        comment_count: 45,
        daily_save_velocity: 85,
        delta_repins_24h: 12,
        gains_5d: 425,
        gains_7d: 595,
        gains_10d: 850,
        gains_15d: 1275,
        snapshot_date: '2026-11-01',
        keyword_text: 'oatmeal pancakes',
        folder_added_at: '2026-10-01T00:00:00Z',
        is_displaced: true
      },
      {
        keyword_id: 102,
        pin_id: VAULT_PIN_1,
        rank_position: 4,
        domain: 'oatmealhealth.com',
        creator_username: 'chef_oats',
        save_count: 15000,
        repin_count: 1200,
        comment_count: 45,
        daily_save_velocity: 85,
        delta_repins_24h: 12,
        gains_5d: 425,
        gains_7d: 595,
        gains_10d: 850,
        gains_15d: 1275,
        snapshot_date: '2026-11-01',
        keyword_text: 'cozy sweater outfit',
        folder_added_at: '2026-10-01T00:00:00Z',
        is_displaced: true
      },
      {
        keyword_id: 101,
        pin_id: VAULT_PIN_2,
        rank_position: 3,
        domain: 'fallfashioncozy.com',
        creator_username: 'style_queen',
        save_count: 22000,
        repin_count: 1800,
        comment_count: 78,
        daily_save_velocity: 110,
        delta_repins_24h: 15,
        gains_5d: 550,
        gains_7d: 770,
        gains_10d: 1100,
        gains_15d: 1650,
        snapshot_date: '2026-11-01',
        keyword_text: 'oatmeal pancakes',
        folder_added_at: '2026-10-01T00:00:00Z',
        is_displaced: true
      },
      {
        keyword_id: 102,
        pin_id: VAULT_PIN_2,
        rank_position: 1,
        domain: 'fallfashioncozy.com',
        creator_username: 'style_queen',
        save_count: 22000,
        repin_count: 1800,
        comment_count: 78,
        daily_save_velocity: 110,
        delta_repins_24h: 15,
        gains_5d: 550,
        gains_7d: 770,
        gains_10d: 1100,
        gains_15d: 1650,
        snapshot_date: '2026-11-01',
        keyword_text: 'cozy sweater outfit',
        folder_added_at: '2026-10-01T00:00:00Z',
        is_displaced: true
      }
    ];
  }

  // 4. Active Catalog (keyword_serp_current): Return 365 active pins with synthetic "<Keyword> Inspiration" titles
  if (rawSql.includes('keyword_serp_current') && rawSql.includes('is_displaced IS FALSE')) {
    const activePins = [];
    for (let i = 1; i <= ACTIVE_PIN_COUNT; i++) {
      const kwId = i % 2 === 0 ? 101 : 102;
      const kwText = kwId === 101 ? 'oatmeal pancakes' : 'cozy sweater outfit';
      activePins.push({
        keyword_id: kwId,
        pin_id: `90000000000${String(i).padStart(4, '0')}`,
        rank_position: (i % 40) + 1,
        title: `${kwText} Inspiration`, // Pure synthetic title matching isSyntheticPinTitle
        domain: 'activehealthysite.com',
        destination_url: `https://activehealthysite.com/post-${i}`,
        image_url: `https://i.pinimg.com/736x/active/pin_${i}.jpg`,
        creator_username: 'active_creator',
        board_name: 'Healthy Ideas',
        visual_annotations: [],
        creation_method: 'ORGANIC PIN',
        save_count: 500 + i * 5,
        repin_count: 50,
        comment_count: 2,
        daily_save_velocity: 25,
        delta_repins_24h: 3,
        gains_5d: 125,
        gains_7d: 175,
        gains_10d: 250,
        gains_15d: 375,
        created_at_pinterest: '2025-01-01T00:00:00Z',
        crawled_at: '2026-11-01T00:00:00Z',
        baseline_day_saves: 500,
        snapshot_date: '2026-11-01',
        aspect_ratio: '2:3',
        format: 'ORGANIC PIN',
        seo_title: '',
        alt_text: '',
        description: '',
        keyword_text: kwText,
        folder_added_at: '2026-10-01T00:00:00Z'
      });
    }
    return activePins;
  }

  // 5. Capsules
  if (rawSql.includes('keyword_guided_capsules')) {
    return [];
  }

  // 6. Central Hub Tier 2 Fallback (Keyword Serp + Competitor Pins + PA Pins)
  if (rawSql.includes('UNION ALL') && (rawSql.includes('competitor_pins') || rawSql.includes('pa_pins'))) {
    return [];
  }

  // 7. Shard Registry
  if (rawSql.includes('neon_projects_registry')) {
    return [];
  }

  // 8. Distributed Shard universal_master_pins Hydration
  if (rawSql.includes('universal_master_pins')) {
    shardQueryExecutedCount++;
    const pidsArg = values.find(v => Array.isArray(v)) || [];
    const pidsSet = new Set(pidsArg.map(String));
    shardQueryRequestedPids.push(...pidsSet);

    const rows = [];
    if (pidsSet.has(VAULT_PIN_1)) {
      rows.push({
        pin_id: VAULT_PIN_1,
        title: 'Easy Gluten-Free Oatmeal Pancakes', // Authentic title
        domain: 'oatmealhealth.com',
        destination_url: 'https://oatmealhealth.com/gluten-free-oatmeal-pancakes',
        image_url: 'https://i.pinimg.com/736x/28/15/43/281543727244482.jpg',
        creator_username: 'chef_oats',
        board_name: 'Healthy Breakfast',
        dominant_color: '#d4a373',
        visual_annotations: ['Pancake', 'Oatmeal', 'Breakfast'],
        alt_text: 'Fluffy gluten-free oatmeal pancakes stacked on a plate with fresh berries and maple syrup',
        description: 'The easiest and fluffiest gluten-free oatmeal pancakes made in a blender in 5 minutes.',
        seo_title: 'Easy Gluten-Free Oatmeal Pancakes Recipe',
        created_at_pinterest: '2024-03-15T12:00:00Z',
        aspect_ratio: '2:3',
        creation_method: 'ORGANIC PIN'
      });
    }
    if (pidsSet.has(VAULT_PIN_2)) {
      rows.push({
        pin_id: VAULT_PIN_2,
        title: 'Cozy Oversized Knitted Sweater Outfit', // Authentic title
        domain: 'fallfashioncozy.com',
        destination_url: 'https://fallfashioncozy.com/oversized-knit-sweater-outfit',
        image_url: 'https://i.pinimg.com/736x/52/49/50/524950900340768832.jpg',
        creator_username: 'style_queen',
        board_name: 'Autumn Aesthetics',
        dominant_color: '#ccd5ae',
        visual_annotations: ['Sweater', 'Knitwear', 'Fall Fashion'],
        alt_text: 'Cozy oversized beige knitted sweater paired with denim and boots',
        description: 'How to style an oversized knit sweater for effortless fall cozy chic aesthetics.',
        seo_title: 'Cozy Oversized Knitted Sweater Outfit Ideas',
        created_at_pinterest: '2023-11-20T08:00:00Z',
        aspect_ratio: '9:16',
        creation_method: 'ORGANIC PIN'
      });
    }
    return rows;
  }

  // 9. Domain Rollup & Competitor Profiles
  if (rawSql.includes('domain_intelligence_rollup')) {
    return [];
  }
  if (rawSql.includes('competitor_profiles')) {
    return [];
  }

  return [];
};

mockSql.query = async () => [];
mockSql.begin = async (fn) => fn(mockSql);
mockSql.transaction = async (fn) => (typeof fn === 'function' ? fn(mockSql) : Promise.all(fn));

// -----------------------------------------------------------------------------
// Run calculateFolderCrossover with >= 360 active pins ahead of displaced pins
// -----------------------------------------------------------------------------
console.log(`[Gate 8 Execution] Running calculateFolderCrossover with ${ACTIVE_PIN_COUNT} synthetic active pins ahead of Vault Super-Pins...`);

const crossover = await calculateFolderCrossover(mockSql, 999, {
  refresh: true,
  env: { DATABASE_TOPOLOGY: 'unified_postgres' }
});

assert(crossover, 'calculateFolderCrossover returned falsy value');
assert(Array.isArray(crossover.super_pins), 'crossover.super_pins must be an array');
console.log(`  ✓ calculateFolderCrossover completed successfully with ${crossover.super_pins.length} super pins identified.`);

// Verify shard hydration priority sorting worked
console.log(`  ✓ Shard universal_master_pins queries executed: ${shardQueryExecutedCount}`);
assert(shardQueryExecutedCount > 0, 'Shard universal_master_pins query was never executed!');
assert(shardQueryRequestedPids.includes(VAULT_PIN_1), `Vault pin ${VAULT_PIN_1} was not in requested shard pids!`);
assert(shardQueryRequestedPids.includes(VAULT_PIN_2), `Vault pin ${VAULT_PIN_2} was not in requested shard pids!`);
console.log('  ✓ Missing-image priority sort successfully placed displaced Vault pins ahead of active pins in the shard hydration budget.');

// -----------------------------------------------------------------------------
// Assertions for Target Vault Super-Pins
// -----------------------------------------------------------------------------
const vp1 = crossover.super_pins.find(p => String(p.pin_id) === VAULT_PIN_1);
const vp2 = crossover.super_pins.find(p => String(p.pin_id) === VAULT_PIN_2);

assert(vp1, `Displaced Vault Super-Pin ${VAULT_PIN_1} must be present in super_pins!`);
assert(vp2, `Displaced Vault Super-Pin ${VAULT_PIN_2} must be present in super_pins!`);

const targetVaultPins = [
  { pin: vp1, expectedId: VAULT_PIN_1, expectedRatio: '2:3' },
  { pin: vp2, expectedId: VAULT_PIN_2, expectedRatio: '9:16' }
];

for (const { pin: vp, expectedId, expectedRatio } of targetVaultPins) {
  console.log(`\n[Asserting Vault Super-Pin ${expectedId}]`);
  console.log(`  - Title: "${vp.title}"`);
  console.log(`  - Image URL: "${vp.image_url}"`);
  console.log(`  - Pin Age (Days): ${vp.pin_age_days}`);
  console.log(`  - Aspect Ratio: "${vp.aspect_ratio}"`);

  // 1. vp.image_url is non-empty (https://i.pinimg.com/...)
  assert(
    typeof vp.image_url === 'string' && vp.image_url.startsWith('https://i.pinimg.com/'),
    `Pin ${expectedId}: image_url must be non-empty and start with https://i.pinimg.com/ (got: "${vp.image_url}")`
  );
  console.log(`  ✓ [PASS] vp.image_url is non-empty (${vp.image_url})`);

  // 2. vp.title is non-synthetic (!isSyntheticPinTitle(vp.title))
  assert(
    !isSyntheticPinTitle(vp.title),
    `Pin ${expectedId}: title must be authentic / non-synthetic (got: "${vp.title}")`
  );
  console.log(`  ✓ [PASS] vp.title is non-synthetic (!isSyntheticPinTitle: "${vp.title}")`);

  // 3. vp.pin_age_days is a positive integer (typeof vp.pin_age_days === 'number' && vp.pin_age_days > 0)
  assert(
    typeof vp.pin_age_days === 'number' && Number.isInteger(vp.pin_age_days) && vp.pin_age_days > 0,
    `Pin ${expectedId}: pin_age_days must be a positive integer (got: ${vp.pin_age_days})`
  );
  console.log(`  ✓ [PASS] vp.pin_age_days is a positive integer (${vp.pin_age_days} days)`);

  // 4. vp.aspect_ratio is non-null ('2:3' or '9:16')
  assert(
    vp.aspect_ratio === '2:3' || vp.aspect_ratio === '9:16',
    `Pin ${expectedId}: aspect_ratio must be '2:3' or '9:16' (got: "${vp.aspect_ratio}")`
  );
  console.log(`  ✓ [PASS] vp.aspect_ratio is non-null ('${vp.aspect_ratio}')`);
}

console.log('\n================================================================================');
console.log('🎉 GATE 8 EMPIRICAL SIMULATION AUDIT PASSED (100% GREEN)');
console.log('================================================================================');
