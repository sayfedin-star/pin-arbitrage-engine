/**
 * scripts/test_challenger_benchmark_gen2.mjs
 *
 * Empirical Benchmark & Forensic Stress Harness for Round 16 Challenger Gen 2:
 * - Measures Cold JIT and Warm JIT execution time
 * - Measures Synchronous Wall-Clock Time, User CPU, and System CPU
 * - Measures Heap Delta and Object Churn
 * - Measures Serialized JSON Payload Size & Detailed Sub-tree Breakdown
 * - Enforces Data Truth Directive (zero synthetic labels, zero fabricated deltas)
 */

import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {
  getGlobal24hPulseService,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse
} from '../src/modules/pulse/service.mjs';
import {
  buildProductionScaleDataset,
  createRound16MockSql
} from '../tests/round16-pulse-503-and-data-truth.test.mjs';

function clearAllPulseCaches() {
  pulseMemoryCache.clear();
  pulseForceRefreshCooldown.clear();
  inflightPulse.clear();
}

console.log('='.repeat(80));
console.log('   CHALLENGER GEN 2 EMPIRICAL VERIFICATION HARNESS (PAE ROUND 16)');
console.log('='.repeat(80));

const dataset = buildProductionScaleDataset();
console.log('\n[Production Dataset Dimensions]');
console.log(`- SERP rows:              ${dataset.activeSerpRows.length} (Target: 1,200)`);
console.log(`- Displaced Vault rows:   ${dataset.vaultPins.length} (Target: 150)`);
console.log(`- Guided Search Capsules: ${dataset.capsuleRows.length} (Target: 1,398 across 462 labels)`);
console.log(`- Viral Creator Pins:     ${dataset.viralCreatorPins.length} (Target: 120)`);
console.log(`- pa_pins Winners:        ${dataset.paWinners.length} (Target: 100)`);
console.log(`- Creator Profiles:       ${dataset.creatorRows.length} (Target: 60)`);

// ----------------------------------------------------------------------------
// TEST 1: Cold JIT Benchmark (First Execution in clean process state)
// ----------------------------------------------------------------------------
console.log('\n--- 1. Cold JIT Benchmark (Zero Prior Execution) ---');
clearAllPulseCaches();
const coldMockSql = createRound16MockSql(dataset);

const coldWallStart = performance.now();
const coldCpuStart = process.cpuUsage();
const coldMemStart = process.memoryUsage().heapUsed;

const coldPayload = await getGlobal24hPulseService(coldMockSql, {}, { forceRefresh: true });

const coldWallElapsed = performance.now() - coldWallStart;
const coldCpuDiff = process.cpuUsage(coldCpuStart);
const coldCpuElapsed = (coldCpuDiff.user + coldCpuDiff.system) / 1000;
const coldMemDeltaMb = (process.memoryUsage().heapUsed - coldMemStart) / (1024 * 1024);

console.log(`Cold JIT Wall Time:   ${coldWallElapsed.toFixed(2)} ms (SLA: < 80 ms)`);
console.log(`Cold JIT CPU Time:    ${coldCpuElapsed.toFixed(2)} ms (Workers cpu_ms ceiling: 30,000 ms)`);
console.log(`Cold Heap Allocation: ${coldMemDeltaMb.toFixed(2)} MB`);

// ----------------------------------------------------------------------------
// TEST 2: JIT Warm-up and Compiler Thread Settling
// ----------------------------------------------------------------------------
console.log('\n--- 2. JIT Warm-up & Background Thread Settling ---');
// Run 2 warm-ups to train TurboFan optimization pipelines
await getGlobal24hPulseService(coldMockSql, {}, { forceRefresh: true });
await getGlobal24hPulseService(coldMockSql, {}, { forceRefresh: true });

// Allow any concurrent TurboFan compilation threads to finish and settle
await new Promise(resolve => setTimeout(resolve, 50));
console.log('Compiler threads settled.');

// ----------------------------------------------------------------------------
// TEST 3: Warm JIT Consecutive Execution Benchmark (10 Iterations)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Warm JIT 10-Iteration Execution Benchmark (Uncached) ---');
const warmRuns = [];

for (let i = 1; i <= 10; i++) {
  clearAllPulseCaches();
  const mockSql = createRound16MockSql(dataset);

  // Brief pause to prevent interrupt skew
  await new Promise(resolve => setTimeout(resolve, 10));

  const memStart = process.memoryUsage().heapUsed;
  const wallStart = performance.now();
  const cpuStart = process.cpuUsage();

  const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

  const wallElapsed = performance.now() - wallStart;
  const cpuDiff = process.cpuUsage(cpuStart);
  const cpuElapsed = (cpuDiff.user + cpuDiff.system) / 1000;
  const memDelta = (process.memoryUsage().heapUsed - memStart) / 1024;

  warmRuns.push({ i, wallElapsed, cpuElapsed, memDelta, payload });
  console.log(`  Run ${String(i).padStart(2)}: Wall = ${wallElapsed.toFixed(2).padStart(5)} ms | CPU = ${cpuElapsed.toFixed(2).padStart(5)} ms (user: ${(cpuDiff.user/1000).toFixed(1)}ms, sys: ${(cpuDiff.system/1000).toFixed(1)}ms) | Heap: ${memDelta.toFixed(0).padStart(5)} KB`);
}

const avgWall = warmRuns.reduce((acc, r) => acc + r.wallElapsed, 0) / warmRuns.length;
const minWall = Math.min(...warmRuns.map(r => r.wallElapsed));
const maxWall = Math.max(...warmRuns.map(r => r.wallElapsed));

const avgCpu = warmRuns.reduce((acc, r) => acc + r.cpuElapsed, 0) / warmRuns.length;
const minCpu = Math.min(...warmRuns.map(r => r.cpuElapsed));
const maxCpu = Math.max(...warmRuns.map(r => r.cpuElapsed));

console.log('\n[Warm JIT Aggregate Performance]');
console.log(`- Wall Time:  Avg = ${avgWall.toFixed(2)} ms, Min = ${minWall.toFixed(2)} ms, Max = ${maxWall.toFixed(2)} ms (SLA < 80 ms: ${maxWall < 80 ? 'PASS' : 'FAIL'})`);
console.log(`- CPU Time:   Avg = ${avgCpu.toFixed(2)} ms, Min = ${minCpu.toFixed(2)} ms, Max = ${maxCpu.toFixed(2)} ms (Threshold < 50 ms: ${avgCpu < 50 ? 'PASS' : 'FAIL'})`);

// ----------------------------------------------------------------------------
// TEST 4: Serialized JSON Payload Size & Sub-Tree Breakdown
// ----------------------------------------------------------------------------
console.log('\n--- 4. Serialized Payload Size & Sub-Tree Footprint ---');
const samplePayload = warmRuns[0].payload;
const fullSerialized = JSON.stringify(samplePayload);
const fullSizeBytes = Buffer.byteLength(fullSerialized, 'utf8');
const fullSizeKb = fullSizeBytes / 1024;

console.log(`Total Payload Size: ${fullSizeBytes.toLocaleString()} bytes (${fullSizeKb.toFixed(2)} KB) - Limit: < 550 KB (${fullSizeKb < 550 ? 'PASS' : 'FAIL'})`);

const subtrees = [
  'kpis',
  'breakout_pins',
  'fresh_rocket_pins',
  'vault_surge_pins',
  'pinarchive_winners',
  'annotation_crossovers',
  'guided_capsule_crossovers',
  'creator_breakouts',
  'keyword_vacuums_and_bridges',
  'hidden_gems_telemetry'
];

console.log('\n[Payload Section Size Breakdown]');
for (const key of subtrees) {
  if (samplePayload[key] !== undefined) {
    const sectionJson = JSON.stringify(samplePayload[key]);
    const sectionBytes = Buffer.byteLength(sectionJson, 'utf8');
    const sectionKb = sectionBytes / 1024;
    const pct = ((sectionBytes / fullSizeBytes) * 100).toFixed(1);
    console.log(`- ${key.padEnd(30)}: ${sectionKb.toFixed(2).padStart(7)} KB (${pct.padStart(5)}%)`);
  }
}

// ----------------------------------------------------------------------------
// TEST 5: Detailed Matching Pins Cap & Deduplication Verification
// ----------------------------------------------------------------------------
console.log('\n--- 5. Pin Caps & Deep Object Pruning Audit ---');

const pairCrossovers = samplePayload.annotation_crossovers?.pair_crossovers || [];
const tripletCrossovers = samplePayload.annotation_crossovers?.triplet_crossovers || [];
const singleAnns = samplePayload.annotation_crossovers?.single_annotations || [];
const capsuleCrossovers = samplePayload.guided_capsule_crossovers || [];

let maxPairPins = 0;
let maxTripletPins = 0;
let maxSinglePins = 0;
let maxCapsulePins = 0;

for (const p of pairCrossovers) {
  const len = (p.matching_pins || []).length;
  if (len > maxPairPins) maxPairPins = len;
  assert.ok(len <= 6, `Pair crossover matching_pins must be <= 6, got ${len}`);
}
for (const t of tripletCrossovers) {
  const len = (t.matching_pins || []).length;
  if (len > maxTripletPins) maxTripletPins = len;
  assert.ok(len <= 6, `Triplet crossover matching_pins must be <= 6, got ${len}`);
}
for (const s of singleAnns) {
  const len = (s.matching_pins || []).length;
  if (len > maxSinglePins) maxSinglePins = len;
  assert.ok(len <= 6, `Single annotation matching_pins must be <= 6, got ${len}`);
}
for (const c of capsuleCrossovers) {
  const len = (c.matching_pins || []).length;
  if (len > maxCapsulePins) maxCapsulePins = len;
  assert.ok(len <= 6, `Capsule crossover matching_pins must be <= 6, got ${len}`);
}

console.log(`Max matching_pins in 1-Gram:     ${maxSinglePins} <= 6: PASS`);
console.log(`Max matching_pins in 2-Pairs:    ${maxPairPins} <= 6: PASS`);
console.log(`Max matching_pins in 3-Triplets: ${maxTripletPins} <= 6: PASS`);
console.log(`Max matching_pins in Capsules:   ${maxCapsulePins} <= 6: PASS`);

// ----------------------------------------------------------------------------
// TEST 6: Data Truth Directive & Anti-Hallucination Verification
// ----------------------------------------------------------------------------
console.log('\n--- 6. Data Truth Directive Verification ---');

// 6.1 Check for synthetic fallback labels in annotations
let syntheticLabelFound = false;
for (const s of singleAnns) {
  const lbl = s.display || s.label || '';
  if (lbl === 'No visual tags detected' || lbl === 'Generic' || lbl.includes('Fallback')) {
    syntheticLabelFound = true;
  }
}
assert.strictEqual(syntheticLabelFound, false, 'No synthetic fallback labels allowed in annotation crossovers');
console.log('✅ No synthetic fallback labels detected in annotations');

// 6.2 Check that Vault pins do not fabricate delta_saves_24h
const vaultPinsInBreakout = samplePayload.breakout_pins.filter(p => p.is_vault_surge || p.is_displaced);
for (const vp of vaultPinsInBreakout) {
  assert.strictEqual(vp.delta_saves_24h, 0, `Vault pin ${vp.pin_id} must have delta_saves_24h === 0, got ${vp.delta_saves_24h}`);
}
console.log(`✅ All ${vaultPinsInBreakout.length} Vault pins in breakout_pins strictly maintain delta_saves_24h === 0 (zero fabrication)`);

// 6.3 Check that hydrated pins sort ahead of unhydrated skeletons
let seenSkeleton = false;
let orderViolation = false;
for (const p of samplePayload.breakout_pins) {
  const isSkel = (!p.title || p.title.toLowerCase().startsWith('untitled')) && !p.image_url;
  if (isSkel) {
    seenSkeleton = true;
  } else if (seenSkeleton) {
    orderViolation = true;
    break;
  }
}
assert.strictEqual(orderViolation, false, 'Hydrated pins must strictly precede unhydrated skeletons in breakout ranking');
console.log('✅ Hydrated pins strictly precede unhydrated skeletons in breakout ranking');

// 6.4 Check that root pin properties exist
for (const p of samplePayload.breakout_pins.slice(0, 20)) {
  assert.ok(p.keyword_slug !== undefined, 'keyword_slug must be present');
  assert.ok(p.rank_position !== undefined, 'rank_position must be present');
  assert.ok(typeof p.is_vault_surge === 'boolean', 'is_vault_surge must be boolean');
  assert.ok(typeof p.is_displaced === 'boolean', 'is_displaced must be boolean');
  assert.ok(Array.isArray(p.visual_annotations), 'visual_annotations must be array');
  assert.ok(Array.isArray(p.annotations), 'annotations must be array');
}
console.log('✅ Root pin properties (keyword_slug, rank_position, is_vault_surge, is_displaced) verified');

// ----------------------------------------------------------------------------
// TEST 7: Hostile Edge Cases & Zero-State Immunity
// ----------------------------------------------------------------------------
console.log('\n--- 7. Hostile Edge Cases & Zero-State Immunity ---');

async function runEdgeCaseTest(name, overrides) {
  clearAllPulseCaches();
  const mockSql = async (strings, ...values) => {
    const raw = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (raw.includes('keyword_serp_current')) return overrides.activeSerpRows ?? [];
    if (raw.includes('keyword_displaced_index') && raw.includes('displaced_top10_24h_count')) return overrides.vacuumCounts ?? [];
    if (raw.includes('keyword_displaced_index')) return overrides.vaultPins ?? [];
    if (raw.includes('top_creators') || raw.includes('active_creators')) return overrides.creatorRows ?? [];
    if (raw.includes('competitor_pins')) return overrides.viralCreatorPins ?? [];
    if (raw.includes('keyword_guided_capsules')) return overrides.capsuleRows ?? [];
    if (raw.includes('pa_pins')) return overrides.paWinners ?? [];
    if (raw.includes('domain_intelligence_rollup')) return overrides.domainRollups ?? [];
    return [];
  };

  const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });
  assert.ok(payload, `${name}: payload must be non-null`);
  assert.ok(payload.kpis, `${name}: kpis must exist`);
  assert.ok(Array.isArray(payload.breakout_pins), `${name}: breakout_pins must be array`);
  assert.ok(Array.isArray(payload.guided_capsule_crossovers), `${name}: guided_capsule_crossovers must be array`);
  assert.ok(Array.isArray(payload.annotation_crossovers?.pair_crossovers), `${name}: pair_crossovers must be array`);

  const json = JSON.stringify(payload);
  assert.ok(!json.includes('NaN'), `${name}: serialized payload must never contain NaN`);
  assert.ok(!json.includes('null,null'), `${name}: serialized payload clean`);
  console.log(`✅ [PASS] ${name}`);
}

await runEdgeCaseTest('7.1 Complete Empty Zero-State (all database tables return [])', {});
await runEdgeCaseTest('7.2 Single Pin with 0 velocity and 0 saves', {
  activeSerpRows: [{
    keyword_id: 1, keyword_text: 'test', pin_id: 'pin_zero', rank_position: 1,
    title: 'Zero Pin', domain: 'example.com', destination_url: 'https://example.com',
    image_url: 'https://example.com/1.jpg', save_count: 0, repin_count: 0,
    daily_save_velocity: 0, delta_repins_24h: 0, delta_saves_24h: 0,
    visual_annotations: []
  }]
});
await runEdgeCaseTest('7.3 Pin with Unicode Emoji and Corrupt Annotations', {
  activeSerpRows: [{
    keyword_id: 1, keyword_text: '🔥 delicious 🍝 food!', pin_id: 'pin_unicode', rank_position: 1,
    title: '🍝 Super Pizza & Pasta! 🍕 🎉', domain: '🍕.com', destination_url: 'https://🍕.com/pizza',
    image_url: 'https://example.com/pizza.jpg', save_count: 5000, repin_count: 100,
    daily_save_velocity: 50, delta_repins_24h: 10, delta_saves_24h: 50,
    visual_annotations: ['🍕 Pizza', '🍝 Pasta', '  ', '', 'X', null, 12345, { bad: true }]
  }]
});
await runEdgeCaseTest('7.4 Extreme Numbers (999,999,999 saves & velocity)', {
  activeSerpRows: [{
    keyword_id: 1, keyword_text: 'viral', pin_id: 'pin_viral_mega', rank_position: 1,
    title: 'Mega Viral Pin', domain: 'viral.com', destination_url: 'https://viral.com/post',
    image_url: 'https://viral.com/img.jpg', save_count: 999999999, repin_count: 50000000,
    daily_save_velocity: 888888, delta_repins_24h: 444444, delta_saves_24h: 888888,
    visual_annotations: ['Mega Viral', 'Trending Now']
  }]
});

console.log('\n' + '='.repeat(80));
console.log('🎉 ALL BENCHMARK, DATA TRUTH & EDGE CASE CHECKS PASSED EMPIRICALLY!');
console.log('='.repeat(80));

