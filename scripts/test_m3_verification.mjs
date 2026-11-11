import assert from 'node:assert';
import { detectHydrationJump, calculateDailyVelocity } from '../src/lib/math.mjs';
import { isMultiStageHydrationJump } from '../src/modules/sharding/fleet-router.mjs';

console.log('=== Verifying Milestone 3 Hydration Jump & Ingestion Integrity ===\n');

// 1. Math.detectHydrationJump conditions 1 to 6
console.log('[Test 1] Verifying src/lib/math.mjs detectHydrationJump conditions 1-6...');
const c1 = detectHydrationJump(100, 0, 10, 0);
const c2 = detectHydrationJump(45, 9, 45, 20); // prevSaves (9) < prevRepins (20)
const c3 = detectHydrationJump(150, 10, 10, 10); // prevSaves === prevRepins (10) && curSaves (150) > curRepins (10)*1.35
const c4 = detectHydrationJump(260, 100, 30, 0); // prevRepins === 0, curRepins 30, curSaves 260 >= 100*2.5
const c5 = detectHydrationJump(3226, 138, 50, 20); // Pin 46373071159685897: 138 -> 3226
const c6 = detectHydrationJump(2500, 50, 10, 0); // rawDelta 2450 > 2000, prevSaves 50 < 500, ratio 50 > 20
const normal = detectHydrationJump(525, 500, 53, 50);

assert.strictEqual(c1, true, 'Condition 1 must detect hydration jump');
assert.strictEqual(c2, true, 'Condition 2 must detect hydration jump (prevSaves < prevRepins)');
assert.strictEqual(c3, true, 'Condition 3 must detect hydration jump (prevSaves === prevRepins and save surge)');
assert.strictEqual(c4, true, 'Condition 4 must detect hydration jump (prevRepins === 0 and save surge)');
assert.strictEqual(c5, true, 'Condition 5 must detect hydration jump on Pin 46373071159685897 (138 -> 3226)');
assert.strictEqual(c6, true, 'Condition 6 must detect hydration jump (20x delta > 2000)');
assert.strictEqual(normal, false, 'Normal growth must NOT be flagged as hydration jump');
console.log('  ✓ All 6 hydration conditions verified in src/lib/math.mjs');

// 2. FleetRouter isMultiStageHydrationJump conditions 1 to 6
console.log('\n[Test 2] Verifying src/modules/sharding/fleet-router.mjs isMultiStageHydrationJump conditions 1-6...');
const f_c1 = isMultiStageHydrationJump({ save_count: 0, repin_count: 0 }, { save_count: 100, repin_count: 10 });
const f_c2 = isMultiStageHydrationJump({ save_count: 9, repin_count: 20 }, { save_count: 45, repin_count: 45 });
const f_c3 = isMultiStageHydrationJump({ save_count: 10, repin_count: 10 }, { save_count: 150, repin_count: 10 });
const f_c4 = isMultiStageHydrationJump({ save_count: 100, repin_count: 0 }, { save_count: 260, repin_count: 30 });
const f_c5 = isMultiStageHydrationJump({ save_count: 138, repin_count: 20 }, { save_count: 3226, repin_count: 50 });
const f_c6 = isMultiStageHydrationJump({ save_count: 50, repin_count: 0 }, { save_count: 2500, repin_count: 10 });
const f_normal = isMultiStageHydrationJump({ save_count: 500, repin_count: 50 }, { save_count: 525, repin_count: 53 });

assert.strictEqual(f_c1, true, 'Condition 1 must detect hydration jump in fleet-router');
assert.strictEqual(f_c2, true, 'Condition 2 must detect hydration jump in fleet-router');
assert.strictEqual(f_c3, true, 'Condition 3 must detect hydration jump in fleet-router');
assert.strictEqual(f_c4, true, 'Condition 4 must detect hydration jump in fleet-router');
assert.strictEqual(f_c5, true, 'Condition 5 must detect hydration jump on Pin 46373071159685897 in fleet-router');
assert.strictEqual(f_c6, true, 'Condition 6 must detect hydration jump in fleet-router');
assert.strictEqual(f_normal, false, 'Normal growth must NOT be flagged as hydration jump in fleet-router');
console.log('  ✓ All 6 hydration conditions verified in src/modules/sharding/fleet-router.mjs');

// 3. Object unpack safety in isMultiStageHydrationJump
console.log('\n[Test 3] Verifying object unpack type safety in isMultiStageHydrationJump...');
const obj_c5 = isMultiStageHydrationJump(
  { saves: 138, repins: 20 },
  { saves: 3226, repins: 50 }
);
assert.strictEqual(obj_c5, true, 'Object-based input must detect hydration jump');
console.log('  ✓ Object unpack type safety verified');

// 4. Daily save velocity suppression on hydration jump
console.log('\n[Test 4] Verifying daily velocity suppression on hydration jump...');
const v_jump = calculateDailyVelocity({
  currentSaves: 3226,
  baselineSaves: 138,
  currentRepins: 50,
  baselineRepins: 20,
  baselineDate: new Date(Date.now() - 86400000),
  currentDate: new Date()
});
assert.strictEqual(v_jump, 0, `Hydration jump on Pin 46373071159685897 must be suppressed to 0, got ${v_jump}`);

const v_normal = calculateDailyVelocity({
  currentSaves: 525,
  baselineSaves: 500,
  currentRepins: 53,
  baselineRepins: 50,
  baselineDate: new Date(Date.now() - 86400000),
  currentDate: new Date()
});
assert.strictEqual(v_normal, 25, `Normal growth 500->525 in 1 day must have velocity 25, got ${v_normal}`);
console.log(`  ✓ Pin 46373071159685897 jump suppressed to ${v_jump}/day instead of unsuppressed 3088/day`);
console.log(`  ✓ Normal growth velocity accurately calculated as ${v_normal}/day`);

// 5. scripts/lib/pinterest.mjs Façade Verification
console.log('\n[Test 5] Verifying scripts/lib/pinterest.mjs Façade Adapter...');
const pLib = await import('./lib/pinterest.mjs');
assert.strictEqual(typeof pLib.fetchPinFromPinterest, 'function');
assert.strictEqual(typeof pLib.fetchPinFromPinResource, 'function');
assert.strictEqual(typeof pLib.fetchPinsBatchFromPidgets, 'function');
assert.strictEqual(typeof pLib.fetchUrlGlobalSaves, 'function');
assert.strictEqual(typeof pLib.fetchCreatorLatestPinsPidgets, 'function');
assert.strictEqual(typeof pLib.resolvePinterestShortlink, 'function');
assert.strictEqual(typeof pLib.fetchBoardSectionsResource, 'function');
assert.strictEqual(typeof pLib.canonicalizeArticleUrlForCount, 'function');
console.log('  ✓ scripts/lib/pinterest.mjs Façade re-exports all required functions cleanly');

console.log('\n🎉 ALL Milestone 3 Verification Checks Passed 100% Cleanly!');
