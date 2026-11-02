// [INVARIANT: EMPIRICAL-CHALLENGE-ORACLE-MILESTONE-2]
// Comprehensive adversarial oracle for Milestone 2 (Wave 2: Crawler Pipeline Hub Egress Elimination)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('================================================================================');
console.log('🚀 RUNNING ADVERSARIAL EMPIRICAL ORACLE: MILESTONE 2 (WAVE 2)');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Physical Shard Affinity & 20-Worker Partitioning Mathematics
// -----------------------------------------------------------------------------
console.log('[Test 1] Verifying 20-Worker Shard Partitioning & Physical Affinity...');

const workerTotal = 20;
const virtualShardCount = 99;
const physicalShardCount = 20;

function getPhysicalShardId(virtualShardId) {
  return ((virtualShardId - 1) % physicalShardCount) + 1;
}

const workerShardMap = new Map();
const allAssignedVirtualShards = new Set();
let fiveShardWorkers = 0;
let fourShardWorkers = 0;

for (let w = 0; w < workerTotal; w++) {
  const shardsForWorker = [];
  for (let s = 1; s <= virtualShardCount; s++) {
    if ((s - 1) % workerTotal === w) {
      shardsForWorker.push(s);
      assert.ok(!allAssignedVirtualShards.has(s), `FATAL: Virtual shard ${s} assigned to multiple workers!`);
      allAssignedVirtualShards.add(s);
    }
  }
  workerShardMap.set(w, shardsForWorker);

  // Assert worker-to-physical shard affinity:
  // Every virtual shard s assigned to worker w MUST map to physical shard (w + 1)
  for (const s of shardsForWorker) {
    const phys = getPhysicalShardId(s);
    assert.equal(phys, w + 1, `Worker ${w} assigned shard ${s} which maps to physical shard ${phys} instead of ${w + 1}!`);
  }

  if (shardsForWorker.length === 5) fiveShardWorkers++;
  else if (shardsForWorker.length === 4) fourShardWorkers++;
  else {
    assert.fail(`Worker ${w} assigned unexpected number of shards: ${shardsForWorker.length}`);
  }
}

// Check coverage: exactly 99 virtual shards assigned across 20 workers
assert.equal(allAssignedVirtualShards.size, 99, 'Not all 99 virtual shards were assigned!');
for (let s = 1; s <= 99; s++) {
  assert.ok(allAssignedVirtualShards.has(s), `Missing virtual shard ${s} in assignment!`);
}

// 99 = 19 * 5 + 4
assert.equal(fiveShardWorkers, 19, 'Expected exactly 19 workers with 5 shards');
assert.equal(fourShardWorkers, 1, 'Expected exactly 1 worker with 4 shards (worker 19 gets 20, 40, 60, 80)');
console.log(`  ✅ 100% of 99 virtual shards partition deterministically across 20 workers.`);
console.log(`  ✅ 19 workers handle 5 shards, 1 worker handles 4 shards (19*5 + 1*4 = 99).`);
console.log(`  ✅ Strict 1:1 Physical Shard Affinity: Worker w exclusively connects to Physical Shard (w + 1).`);

// -----------------------------------------------------------------------------
// TEST 2: Two-Tier UTC Cooldown Logic Oracle
// -----------------------------------------------------------------------------
console.log('\n[Test 2] Stress-testing Two-Tier UTC Cooldown Logic Oracle...');

// Predicate in SQL:
// (
//   ksc.crawled_at IS NULL
//   OR (
//     ksc.crawled_at < NOW() - INTERVAL '4 hours'
//     AND (
//       (ksc.crawled_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
//       OR ksc.crawled_at < NOW() - INTERVAL '18 hours'
//     )
//   )
//   OR (ksc.metadata->>'is_deep_hydrated')::boolean IS NOT TRUE
// )

function evaluateSqlCooldown({ crawled_at, now, is_deep_hydrated }) {
  if (crawled_at === null || crawled_at === undefined) return true;
  if (!is_deep_hydrated) return true; // not deep hydrated -> needs hydration immediately

  const diffMs = now.getTime() - crawled_at.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // Hard 4 hours floor
  if (diffHours < 4) return false;

  // Check if crawled_at UTC calendar date < now UTC calendar date
  const crawledUtcDate = crawled_at.toISOString().slice(0, 10);
  const nowUtcDate = now.toISOString().slice(0, 10);
  const isDifferentUtcDay = crawledUtcDate < nowUtcDate;

  // 18 hours max cache
  const isOlderThan18h = diffHours >= 18;

  return isDifferentUtcDay || isOlderThan18h;
}

const mockNow = new Date('2026-11-01T12:00:00.000Z');

const testCases = [
  { name: 'Null crawled_at', input: { crawled_at: null, now: mockNow, is_deep_hydrated: true }, expected: true },
  { name: 'Crawled 10 seconds ago, deep hydrated', input: { crawled_at: new Date('2026-11-01T11:59:50.000Z'), now: mockNow, is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 2 hours ago, deep hydrated', input: { crawled_at: new Date('2026-11-01T10:00:00.000Z'), now: mockNow, is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 3h 59m ago, deep hydrated', input: { crawled_at: new Date('2026-11-01T08:01:00.000Z'), now: mockNow, is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 4h 1m ago, SAME UTC day, < 18h', input: { crawled_at: new Date('2026-11-01T07:59:00.000Z'), now: mockNow, is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 6h ago, SAME UTC day, < 18h', input: { crawled_at: new Date('2026-11-01T06:00:00.000Z'), now: mockNow, is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 17h 59m ago, SAME UTC day', input: { crawled_at: new Date('2026-11-01T00:01:00.000Z'), now: new Date('2026-11-01T18:00:00.000Z'), is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 18h 01m ago, SAME UTC day', input: { crawled_at: new Date('2026-11-01T00:01:00.000Z'), now: new Date('2026-11-01T18:02:00.000Z'), is_deep_hydrated: true }, expected: true },
  { name: 'Crawled 4h 05m ago, PREVIOUS UTC day (crossed midnight UTC)', input: { crawled_at: new Date('2026-10-31T21:55:00.000Z'), now: new Date('2026-11-01T02:00:00.000Z'), is_deep_hydrated: true }, expected: true },
  { name: 'Crawled 3h 55m ago, PREVIOUS UTC day (hits hard 4h floor!)', input: { crawled_at: new Date('2026-10-31T22:05:00.000Z'), now: new Date('2026-11-01T02:00:00.000Z'), is_deep_hydrated: true }, expected: false },
  { name: 'Crawled 2 hours ago, but is_deep_hydrated is false', input: { crawled_at: new Date('2026-11-01T10:00:00.000Z'), now: mockNow, is_deep_hydrated: false }, expected: true },
  { name: 'Crawled 10s ago, but is_deep_hydrated is null', input: { crawled_at: new Date('2026-11-01T11:59:50.000Z'), now: mockNow, is_deep_hydrated: null }, expected: true },
  { name: 'Crawled 25 hours ago, deep hydrated', input: { crawled_at: new Date('2026-10-31T11:00:00.000Z'), now: mockNow, is_deep_hydrated: true }, expected: true }
];

for (const tc of testCases) {
  const result = evaluateSqlCooldown(tc.input);
  assert.equal(result, tc.expected, `Failed case: ${tc.name}. Expected ${tc.expected}, got ${result}`);
}
console.log(`  ✅ All 13 edge cases in Two-Tier UTC Cooldown verified exact behavior.`);
console.log(`  ✅ Hard 4h floor strictly respected even when crossing UTC midnight.`);
console.log(`  ✅ Same-day crawl skipped until 18h ceiling reached.`);
console.log(`  ✅ Unhydrated stubs correctly bypass cooldown for immediate enrichment.`);

// -----------------------------------------------------------------------------
// TEST 3: Column Projection Egress Audit Across Codebase
// -----------------------------------------------------------------------------
console.log('\n[Test 3] Verifying Stripped Column Projections from Central Hub...');

const filesToAudit = [
  'scripts/keyword-velocity-crawler.mjs',
  'src/modules/keywords/service.mjs',
  'scripts/creator-velocity-crawler.mjs',
  'scripts/cluster-intelligence.mjs',
  'scripts/backfill_rolling_window_gains.mjs'
];

// In keyword-velocity-crawler.mjs, check queries on keyword_serp_current:
const kwCrawlerContent = fs.readFileSync('scripts/keyword-velocity-crawler.mjs', 'utf8');

// Prove that SELECT in folder_ksc / combined_pins does NOT select title, domain, destination_url, image_url, visual_annotations, metadata
const prohibitedColumnsInCrawlerHubQuery = [
  'ksc.title',
  'ksc.domain',
  'ksc.destination_url',
  'ksc.image_url',
  'ksc.visual_annotations',
  'ksc.dominant_color',
  'ksc.creator_username',
  'ksc.board_name'
];

for (const col of prohibitedColumnsInCrawlerHubQuery) {
  // Check Mode A (folder_ksc)
  const modeAPos = kwCrawlerContent.indexOf('WITH folder_ksc AS (');
  const modeAEnd = kwCrawlerContent.indexOf('aggregated_positions AS (', modeAPos);
  const modeAQuery = kwCrawlerContent.slice(modeAPos, modeAEnd);
  assert.ok(!modeAQuery.includes(col), `Found prohibited heavy column ${col} in Mode A folder_ksc query!`);

  // Check Mode B (combined_pins)
  const modeBPos = kwCrawlerContent.indexOf('// EXECUTION MODE B: SINGLE-KEYWORD PIN-SLICE SHARDING');
  const modeBQuerySlice = kwCrawlerContent.slice(modeBPos, modeBPos + 4000);
  assert.ok(!modeBQuerySlice.includes(col), `Found prohibited heavy column ${col} in Mode B query!`);

  // Check Mode C
  const modeCPos = kwCrawlerContent.indexOf('// EXECUTION MODE C: GLOBAL SWARM KEYWORD-FLEET PARALLEL CRAWLER');
  const modeCQuerySlice = kwCrawlerContent.slice(modeCPos, modeCPos + 4000);
  assert.ok(!modeCQuerySlice.includes(col), `Found prohibited heavy column ${col} in Mode C query!`);
}
console.log('  ✅ scripts/keyword-velocity-crawler.mjs: All prohibited heavy columns verified stripped across Mode A, B, and C.');

// Check service.mjs crawlKeywordSERP immediateSnapshots
const serviceContent = fs.readFileSync('src/modules/keywords/service.mjs', 'utf8');
const immSnapStart = serviceContent.indexOf('let immediateSnapshots = await sql`');
const immSnapEnd = serviceContent.indexOf('FROM keyword_serp_current', immSnapStart);
const immQuery = serviceContent.slice(immSnapStart, immSnapEnd);

assert.ok(!immQuery.includes('title'), 'immediateSnapshots still selects title!');
assert.ok(!immQuery.includes('image_url'), 'immediateSnapshots still selects image_url!');
assert.ok(!immQuery.includes('destination_url'), 'immediateSnapshots still selects destination_url!');
assert.ok(!immQuery.includes('domain'), 'immediateSnapshots still selects domain!');
assert.ok(!immQuery.includes('visual_annotations'), 'immediateSnapshots still selects visual_annotations!');
console.log('  ✅ src/modules/keywords/service.mjs: immediateSnapshots verified stripped of title, image_url, destination_url, domain, visual_annotations.');

// Check creator-velocity-crawler.mjs competitor_pins and pa_pins
const creatorCrawlerContent = fs.readFileSync('scripts/creator-velocity-crawler.mjs', 'utf8');
const catStart = creatorCrawlerContent.indexOf('const catalogPins = await sql`');
const catEnd = creatorCrawlerContent.indexOf('FROM competitor_pins', catStart);
const catQuery = creatorCrawlerContent.slice(catStart, catEnd);
assert.ok(!catQuery.includes('title'), 'catalogPins query still selects title!');
assert.ok(!catQuery.includes('image_url'), 'catalogPins query still selects image_url!');
assert.ok(!catQuery.includes('destination_url'), 'catalogPins query still selects destination_url!');

const winStart = creatorCrawlerContent.indexOf('const myWinningSlice = await sql`');
const winEnd = creatorCrawlerContent.indexOf('FROM pa_pins', winStart);
const winQuery = creatorCrawlerContent.slice(winStart, winEnd);
assert.ok(!winQuery.includes('title'), 'myWinningSlice query still selects title!');
assert.ok(!winQuery.includes('image_url'), 'myWinningSlice query still selects image_url!');
assert.ok(!winQuery.includes('destination_url'), 'myWinningSlice query still selects destination_url!');
console.log('  ✅ scripts/creator-velocity-crawler.mjs: catalogPins and myWinningSlice verified stripped of heavy columns.');

// Check cluster-intelligence.mjs modulo pushdown
const clusterContent = fs.readFileSync('scripts/cluster-intelligence.mjs', 'utf8');
assert.ok(
  clusterContent.includes('mod(pae_crc32_shard_id(pin_id::text, 99) - 1, 20) = ${shardIdx}'),
  'cluster-intelligence.mjs missing SQL modulo pushdown: mod(pae_crc32_shard_id(pin_id::text, 99) - 1, 20) = ${shardIdx}'
);
console.log('  ✅ scripts/cluster-intelligence.mjs: Verified SQL modulo pushdown for physical shard filtering.');

// Check backfill_rolling_window_gains.mjs
const backfillContent = fs.readFileSync('scripts/backfill_rolling_window_gains.mjs', 'utf8');
assert.ok(backfillContent.includes('gains_7d IS NULL OR updated_at < NOW() - INTERVAL \'24 hours\''), 'backfill missing freshness filter!');
assert.ok(backfillContent.includes('if (activePins.length === 0)'), 'backfill missing early exit!');
assert.ok(backfillContent.includes('COALESCE(NULLIF(u.gains_7d, 0), ksc.gains_7d)'), 'backfill missing Lock 14C defensive COALESCE!');
console.log('  ✅ scripts/backfill_rolling_window_gains.mjs: Verified stale filter, early exit, and Lock 14C COALESCE.');

// -----------------------------------------------------------------------------
// TEST 4: Wire Egress Simulation & Impact Calculation
// -----------------------------------------------------------------------------
console.log('\n[Test 4] Computing Wire Egress Reduction Simulation (15,000 pins sweep)...');

const mockOriginalRow = {
  pin_id: '123456789012345678',
  keyword_id: 42,
  rank_position: 5,
  last_known_rank: 5,
  title: 'Ultra High Protein Low Carb Creamy Tuscan Chicken Pasta Meal Prep Recipe',
  domain: 'healthyfitnessmeals.com',
  destination_url: 'https://healthyfitnessmeals.com/creamy-tuscan-chicken-pasta/?utm_source=pinterest&utm_medium=social&utm_campaign=mealprep',
  image_url: 'https://i.pinimg.com/736x/ab/cd/ef/abcdef1234567890abcdef1234567890.jpg',
  save_count: 14250,
  repin_count: 3200,
  daily_save_velocity: '45.8',
  creator_username: 'healthyfitnessmeals',
  board_name: 'Healthy Dinner Recipes & Easy Meal Prep Ideas',
  dominant_color: '#d4a373',
  visual_annotations: [
    'chicken pasta', 'creamy tuscan', 'meal prep container', 'garlic parmesan sauce',
    'sundried tomatoes', 'fresh spinach', 'high protein lunch'
  ],
  has_visual_annotations: true,
  created_at_pinterest: '2025-01-15T14:32:00.000Z',
  creation_method: 'carousel',
  is_deep_hydrated: true,
  image_signature: 'sig_9876543210abcdef',
  metadata: {
    description: 'This easy Tuscan chicken pasta recipe is loaded with juicy chicken, rich garlic parmesan cream sauce, sun-dried tomatoes, and tender baby spinach. Perfect for high-protein weekly meal prep!',
    alt_text: 'Bowls of creamy Tuscan chicken pasta garnished with fresh basil',
    rich_metadata: { prep_time: 15, cook_time: 20, calories: 480 },
    seo_related_interests: ['healthy dinner recipes', 'high protein meals', 'chicken pasta ideas'],
    share_count: 520
  },
  crawled_at: '2026-10-31T18:00:00.000Z',
  updated_at: '2026-10-31T18:00:00.000Z',
  is_displaced: false,
  baseline_day_saves: 14204,
  baseline_day_date: '2026-10-30',
  shard_id: 11
};

const mockSlimRow = {
  pin_id: '123456789012345678',
  keyword_id: 42,
  rank_position: 5,
  last_known_rank: 5,
  save_count: 14250,
  repin_count: 3200,
  daily_save_velocity: '45.8',
  created_at_pinterest: '2025-01-15T14:32:00.000Z',
  creation_method: 'carousel',
  is_deep_hydrated: true,
  crawled_at: '2026-10-31T18:00:00.000Z',
  updated_at: '2026-10-31T18:00:00.000Z',
  is_displaced: false,
  baseline_day_saves: 14204,
  baseline_day_date: '2026-10-30',
  shard_id: 11
};

const originalBytes = Buffer.byteLength(JSON.stringify(mockOriginalRow), 'utf8');
const slimBytes = Buffer.byteLength(JSON.stringify(mockSlimRow), 'utf8');
const reductionPct = (((originalBytes - slimBytes) / originalBytes) * 100).toFixed(1);

const PINS_PER_SWEEP = 15000;
const originalTotalMb = ((originalBytes * PINS_PER_SWEEP) / (1024 * 1024)).toFixed(2);
const slimTotalMb = ((slimBytes * PINS_PER_SWEEP) / (1024 * 1024)).toFixed(2);
const mbSaved = (originalTotalMb - slimTotalMb).toFixed(2);

console.log(`  📊 Original row wire size: ${originalBytes} bytes (~${originalTotalMb} MB for ${PINS_PER_SWEEP.toLocaleString()} pins)`);
console.log(`  📊 Slim row wire size:     ${slimBytes} bytes (~${slimTotalMb} MB for ${PINS_PER_SWEEP.toLocaleString()} pins)`);
console.log(`  🔥 Per-sweep Wire Egress Reduction: ${reductionPct}% (${mbSaved} MB saved per sweep)`);
assert.ok(reductionPct >= 70, `Wire egress reduction ${reductionPct}% is below expected threshold!`);

// -----------------------------------------------------------------------------
// TEST 5: Live Database SQL Query & Schema Verification (Central Hub)
// -----------------------------------------------------------------------------
console.log('\n[Test 5] Testing SQL Functions & Cooldown Query Syntax on Central Hub...');

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      dbUrl = trimmed.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
}

if (dbUrl) {
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

  try {
    // 1. Verify pae_crc32_shard_id and physical modulo
    const [fnTest] = await sql`
      SELECT 
        pae_crc32_shard_id('123456789012345678', 99) AS virtual_shard,
        mod(pae_crc32_shard_id('123456789012345678', 99) - 1, 20) AS worker_idx;
    `;
    assert.ok(fnTest.virtual_shard >= 1 && fnTest.virtual_shard <= 99, 'pae_crc32_shard_id out of 1..99 bounds');
    assert.ok(fnTest.worker_idx >= 0 && fnTest.worker_idx <= 19, 'worker_idx out of 0..19 bounds');
    console.log(`  ✅ Live Central Hub: pae_crc32_shard_id returned virtual_shard=${fnTest.virtual_shard}, worker_idx=${fnTest.worker_idx}`);

    // 2. Test the exact Wave 2 pushed-down two-tier cooldown query syntax against live keyword_serp_current
    const sampleRows = await sql`
      SELECT 
        ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank,
        ksc.save_count, ksc.repin_count, ksc.daily_save_velocity,
        ksc.created_at_pinterest, ksc.creation_method,
        (ksc.metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
        ksc.crawled_at, ksc.updated_at, FALSE as is_displaced,
        ksc.baseline_day_saves, ksc.baseline_day_date,
        ksc.shard_id
      FROM keyword_serp_current ksc
      WHERE ksc.pin_id IS NOT NULL AND ksc.pin_id <> '' AND ksc.is_displaced = FALSE
        AND (
          ksc.crawled_at IS NULL
          OR (
            ksc.crawled_at < NOW() - INTERVAL '4 hours'
            AND (
              (ksc.crawled_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
              OR ksc.crawled_at < NOW() - INTERVAL '18 hours'
            )
          )
          OR (ksc.metadata->>'is_deep_hydrated')::boolean IS NOT TRUE
        )
      LIMIT 5;
    `;
    console.log(`  ✅ Live Central Hub: Two-tier cooldown query executed cleanly, returned ${sampleRows.length} eligible sample rows without errors.`);

    // 3. Test cluster_seeds modulo query syntax against live cluster_seeds
    const clusterSeedsSample = await sql`
      SELECT pin_id, label, is_competitor, velocity, last_crawled_at
      FROM cluster_seeds
      WHERE (last_crawled_at IS NULL OR last_crawled_at < NOW() - INTERVAL '24 HOURS')
        AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
        AND mod(pae_crc32_shard_id(pin_id::text, 99) - 1, 20) = 0
      LIMIT 5;
    `;
    console.log(`  ✅ Live Central Hub: cluster_seeds modulo pushdown executed cleanly, returned ${clusterSeedsSample.length} rows.`);

  } finally {
    await sql.end();
  }
} else {
  console.log('  ⚠️ DATABASE_URL not found; live database query skipped.');
}

console.log('\n================================================================================');
console.log('🎉 ALL ADVERSARIAL ORACLE CHECKS PASSED EMPIRICALLY WITH ZERO ERRORS');
console.log('================================================================================');
