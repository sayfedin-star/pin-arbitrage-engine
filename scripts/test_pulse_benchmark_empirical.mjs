/**
 * scripts/test_pulse_benchmark_empirical.mjs
 *
 * Empirical Challenger Adversarial Stress Harness for getGlobal24hPulseService
 */

import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {
  getGlobal24hPulseService,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse
} from '../src/modules/pulse/service.mjs';
import { buildProductionScaleDataset, createRound16MockSql } from '../tests/round16-pulse-503-and-data-truth.test.mjs';

function clearAllPulseCaches() {
  pulseMemoryCache.clear();
  pulseForceRefreshCooldown.clear();
  inflightPulse.clear();
}

console.log('================================================================================');
console.log('   EMPIRICAL ADVERSARIAL STRESS HARNESS: getGlobal24hPulseService (Round 16)');
console.log('================================================================================\n');

// 1. Build Production Scale Dataset:
// 1,200 SERP rows, 250 Vault rows (expanding from 150 to 250 for stress testing),
// 1,398 capsules across 462 labels, 120 viral creator pins, 100 pa_pins.
const baseDataset = buildProductionScaleDataset();

// Expand vaultPins to 250 if not already
const extraVaultPins = [];
for (let i = baseDataset.vaultPins.length; i < 250; i++) {
  extraVaultPins.push({
    keyword_id: (i % 30) + 1,
    keyword_text: 'easy dinner recipes ' + (i + 1),
    keyword_category: 'Food and Drink',
    pin_id: 'pin_vault_stress_' + (i + 1),
    last_known_rank: (i % 40) + 1,
    vacuum_opportunity_score: 85.5,
    displaced_date: '2026-11-02',
    save_count: 5000 + i * 10,
    repin_count: 200 + i,
    daily_save_velocity: 150.0 + (i % 20),
    delta_repins_24h: 15,
    gains_5d: 200,
    gains_7d: 250,
    gains_10d: 300,
    gains_15d: 350,
    domain: 'vaultblog' + (i % 20) + '.com',
    creator_username: 'vaultchef_' + (i % 20),
    shard_id: (i % 99) + 1,
    title: 'Surging Displaced Vault Pin ' + (i + 1),
    description: 'Rich description for vault pin ' + (i + 1),
    alt_text: 'Alt text for vault pin ' + (i + 1),
    image_url: 'https://i.pinimg.com/236x/vault_' + (i + 1) + '.jpg',
    destination_url: 'https://vaultblog' + (i % 20) + '.com/recipe-' + (i + 1),
    board_name: 'Dinner Ideas',
    dominant_color: '#3b82f6',
    visual_annotations: ['Dinner Ideas', 'Quick Recipes', 'Healthy Meals'],
    created_at_pinterest: '2026-05-01T00:00:00Z'
  });
}
const stressDataset = {
  ...baseDataset,
  vaultPins: [...baseDataset.vaultPins, ...extraVaultPins]
};

console.log(`[Dataset Built]`);
console.log(`- SERP rows: ${stressDataset.activeSerpRows.length}`);
console.log(`- Vault rows: ${stressDataset.vaultPins.length}`);
console.log(`- Capsule rows: ${stressDataset.capsuleRows.length}`);
console.log(`- Viral creator pins: ${stressDataset.viralCreatorPins.length}`);
console.log(`- pa_pins winners: ${stressDataset.paWinners.length}`);
console.log(`- Creator profiles: ${stressDataset.creatorRows.length}`);
console.log('');

// Warm-up run to allow V8 JIT compilation and shape feedback
console.log('--- Phase 0: JIT Warm-up Run ---');
clearAllPulseCaches();
const mockSqlWarmup = createRound16MockSql(stressDataset);
await getGlobal24hPulseService(mockSqlWarmup, {}, { forceRefresh: true });
console.log('Warm-up complete.\n');

// Phase 1: 5 Consecutive Runs (measuring Wall-Clock & CPU time on fresh uncached state)
console.log('--- Phase 1: 5 Consecutive Measured Execution Runs (Uncached) ---');
const runs = [];
let lastPayload = null;

for (let r = 1; r <= 5; r++) {
  clearAllPulseCaches();
  const mockSql = createRound16MockSql(stressDataset);

  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();

  const payload = await getGlobal24hPulseService(mockSql, {}, { forceRefresh: true });

  const wallElapsedMs = performance.now() - wallStart;
  const cpuDiff = process.cpuUsage(cpuStart);
  const cpuElapsedMs = (cpuDiff.user + cpuDiff.system) / 1000;

  lastPayload = payload;
  runs.push({ run: r, wallElapsedMs, cpuElapsedMs });
  console.log(`  Run ${r}: Wall = ${wallElapsedMs.toFixed(2)}ms, CPU = ${cpuElapsedMs.toFixed(2)}ms`);
}

console.log('\n--- Phase 2: Performance Threshold Assertions ---');
let allWallOk = true;
let allCpuOk = true;

for (const r of runs) {
  if (r.wallElapsedMs >= 80) allWallOk = false;
  if (r.cpuElapsedMs >= 50) allCpuOk = false;
}

console.log(`Wall-clock < 80ms: ${allWallOk ? 'PASS' : 'FAIL'}`);
console.log(`CPU time < 50ms:   ${allCpuOk ? 'PASS' : 'FAIL'}`);

// Phase 3: Inspect Serialized Payload Size & Pin Caps
console.log('\n--- Phase 3: Payload Size & Pin Caps Verification ---');
const serialized = JSON.stringify(lastPayload);
const payloadSizeBytes = Buffer.byteLength(serialized, 'utf8');
const payloadSizeKb = payloadSizeBytes / 1024;

console.log(`Serialized payload size: ${payloadSizeBytes} bytes (${payloadSizeKb.toFixed(2)} KB)`);
const payloadSizeOk = payloadSizeKb < 550;
console.log(`Payload size < 550 KB: ${payloadSizeOk ? 'PASS' : 'FAIL'} (Target: ~450-490 KB)`);

// Pin caps assertions
const pairCrossovers = lastPayload.annotation_crossovers?.pair_crossovers || [];
const tripletCrossovers = lastPayload.annotation_crossovers?.triplet_crossovers || [];
const capsuleCrossovers = lastPayload.guided_capsule_crossovers || [];

let maxPairPins = 0;
for (const p of pairCrossovers) {
  const len = (p.matching_pins || []).length;
  if (len > maxPairPins) maxPairPins = len;
}

let maxTripletPins = 0;
for (const t of tripletCrossovers) {
  const len = (t.matching_pins || []).length;
  if (len > maxTripletPins) maxTripletPins = len;
}

let maxCapsulePins = 0;
for (const c of capsuleCrossovers) {
  const len = (c.matching_pins || []).length;
  if (len > maxCapsulePins) maxCapsulePins = len;
}

console.log(`Max matching_pins in pair crossovers:    ${maxPairPins} (Limit: <= 6)`);
console.log(`Max matching_pins in triplet crossovers: ${maxTripletPins} (Limit: <= 6)`);
console.log(`Max matching_pins in capsule crossovers: ${maxCapsulePins} (Limit: <= 6)`);

const pinCapsOk = maxPairPins <= 6 && maxTripletPins <= 6 && maxCapsulePins <= 6;
console.log(`Matching pins cap <= 6: ${pinCapsOk ? 'PASS' : 'FAIL'}`);

console.log('\n================================================================================');
console.log(`SUMMARY VERDICT: ${allWallOk && allCpuOk && payloadSizeOk && pinCapsOk ? 'APPROVE' : 'REQUEST_CHANGES'}`);
console.log('================================================================================');
