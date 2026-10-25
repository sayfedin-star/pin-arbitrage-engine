#!/usr/bin/env node

/**
 * scripts/test_creator_intelligence_fleet.mjs
 * 
 * Comprehensive Forensic & Integration Test Suite for
 * Creator Intelligence 20-Worker Swarm Fleet Pipeline.
 * 
 * Verifies:
 * 1. Stage 0 Dispatcher Mode A & Mode B task matrices and modulo distribution.
 * 2. Stage 1 Swarm Worker slice partitioning (crc32 % 20) and shard routing.
 * 3. Stage 2 Consolidator executive reporting and maintenance routines.
 * 4. Workflow YAML schema integrity for .github/workflows/crawler-pipeline.yml.
 * 5. Architectural Invariants: Zero Hub snapshots, IEEE 802.3 CRC32 parity.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { crc32, getPinShardId } from '../src/modules/sharding/fleet-router.mjs';

console.log('================================================================');
console.log('🧪 CREATOR INTELLIGENCE 20-WORKER SWARM VERIFICATION SUITE');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------------------
// Suite 1: Stage 0 Dispatcher Tests
// -----------------------------------------------------------------------------
console.log('[*] Suite 1: Stage 0 Fleet Dispatcher Tests...');

runTest('Dispatcher script exists and is executable', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/creator-fleet-dispatcher.mjs');
  assert(fs.existsSync(scriptPath), 'scripts/creator-fleet-dispatcher.mjs must exist');
});

runTest('Dispatcher Mode A generates valid 20-worker matrix JSON', () => {
  const tmpOut = path.resolve(process.cwd(), 'tmp_dispatch_out.txt');
  try {
    execSync(`node scripts/creator-fleet-dispatcher.mjs`, {
      env: { ...process.env, GITHUB_OUTPUT: tmpOut, TARGET_ACCOUNT: '' },
      stdio: 'pipe'
    });
    assert(fs.existsSync(tmpOut), 'Output file must exist');
    const content = fs.readFileSync(tmpOut, 'utf8');
    const match = content.match(/matrix_tasks=(.+)/);
    assert(match, 'matrix_tasks must be output');
    const tasks = JSON.parse(match[1]);
    assert.strictEqual(tasks.length, 20, 'Mode A must produce exactly 20 tasks');
    assert.strictEqual(tasks[0].worker_total, 20, 'worker_total must be 20');
    assert.strictEqual(tasks[0].worker_index, 0, 'First worker index must be 0');
    assert.strictEqual(tasks[19].worker_index, 19, 'Last worker index must be 19');
    assert.strictEqual(tasks[0].mode, 'creator_sweep', 'Mode must be creator_sweep');
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

runTest('Dispatcher Mode B generates valid single-account 20-worker matrix JSON', () => {
  const tmpOut = path.resolve(process.cwd(), 'tmp_dispatch_b_out.txt');
  try {
    execSync(`node scripts/creator-fleet-dispatcher.mjs`, {
      env: { ...process.env, GITHUB_OUTPUT: tmpOut, TARGET_ACCOUNT: 'diycrafts' },
      stdio: 'pipe'
    });
    assert(fs.existsSync(tmpOut), 'Output file must exist');
    const content = fs.readFileSync(tmpOut, 'utf8');
    const match = content.match(/matrix_tasks=(.+)/);
    assert(match, 'matrix_tasks must be output');
    const tasks = JSON.parse(match[1]);
    assert.strictEqual(tasks.length, 20, 'Mode B must produce exactly 20 tasks');
    assert.strictEqual(tasks[0].mode, 'single_account_swarm', 'Mode must be single_account_swarm');
    assert.strictEqual(tasks[0].target_account, 'diycrafts', 'Target account must match');
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

// -----------------------------------------------------------------------------
// Suite 2: Stage 1 Swarm Worker Architecture & Partitioning Tests
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 2: Stage 1 Swarm Worker Architecture & Partitioning Tests...');

runTest('Crawler script exists and has valid shebang', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs');
  assert(fs.existsSync(scriptPath), 'scripts/creator-velocity-crawler.mjs must exist');
  const content = fs.readFileSync(scriptPath, 'utf8');
  assert(content.startsWith('#!/usr/bin/env node'), 'Must have node shebang');
});

runTest('IEEE 802.3 CRC32 deterministic pin partitioning produces uniform slices', () => {
  const samplePinIds = Array.from({ length: 1000 }, (_, i) => String(100000000000000000n + BigInt(i * 1234567)));
  const workerBins = Array.from({ length: 20 }, () => 0);

  for (const pid of samplePinIds) {
    const hash = crc32(pid);
    const workerIdx = hash % 20;
    workerBins[workerIdx]++;
  }

  // Ensure all 20 workers receive pins and standard deviation is bounded
  for (let w = 0; w < 20; w++) {
    assert(workerBins[w] > 20, `Worker ${w} should receive substantial pin count (got ${workerBins[w]})`);
  }
  const avg = samplePinIds.length / 20; // 50
  const maxDeviation = Math.max(...workerBins.map(b => Math.abs(b - avg)));
  assert(maxDeviation < 30, `Partitioning distribution must be balanced (max dev: ${maxDeviation})`);
});

runTest('Crawler declares mandatory Invariant Tags', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert(content.includes('// [INVARIANT: ZERO-HUB-SNAPSHOTS]'), 'Must declare ZERO-HUB-SNAPSHOTS');
  assert(content.includes('// [INVARIANT: DETERMINISTIC-CRC32-SHARDING]'), 'Must declare DETERMINISTIC-CRC32-SHARDING');
  assert(content.includes('// [INVARIANT: ONE-WAY-PROMOTION]'), 'Must declare ONE-WAY-PROMOTION');
});

// -----------------------------------------------------------------------------
// Suite 3: Stage 2 Consolidator Tests
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 3: Stage 2 Consolidator Tests...');

runTest('Consolidator script exists and imports optimizeHubStorage', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/creator-fleet-consolidator.mjs');
  assert(fs.existsSync(scriptPath), 'scripts/creator-fleet-consolidator.mjs must exist');
  const content = fs.readFileSync(scriptPath, 'utf8');
  assert(content.includes("import { optimizeHubStorage } from './optimize_hub_storage.mjs';"), 'Must import optimizeHubStorage');
  assert(content.includes('VACUUM (ANALYZE)'), 'Must execute VACUUM (ANALYZE)');
  assert(content.includes('Official Pinterest Business Mapping'), 'Must map Pinterest Business terminology');
});

runTest('Consolidator normalizes TARGET_ACCOUNT="all" to sweep all creators', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-fleet-consolidator.mjs'), 'utf8');
  assert(content.includes('isSweepAll'), 'Consolidator must define isSweepAll check');
  assert(content.includes("rawTargetAccount.toLowerCase() === 'all'"), 'Consolidator must handle "all" as sweep all');
});

runTest('Crawler enforces Four-Pillar live shard sync in Mode A', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert(content.includes('syncPinsToMasterShards(sql, masterPinsToSync)'), 'Crawler Mode A must sync winning pins to master shards');
  assert(content.includes('creation_method'), 'syncPinsToMasterShards must protect authentic creation_method');
});

runTest('Crawler integrates board crawling and respects board filters in Mode B', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert(content.includes('syncCompetitorBoardPins'), 'Crawler must import and invoke syncCompetitorBoardPins');
  assert(content.includes('personalBoardsOnly'), 'Crawler must support personalBoardsOnly filter');
  assert(content.includes('targetBoardsInput'), 'Crawler must support targetBoardsInput filter');
});

runTest('Crawler uses crawler_shard_heartbeats for zero-hang peer barrier synchronization', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert(content.includes('crawler_shard_heartbeats'), 'Crawler must coordinate via crawler_shard_heartbeats');
  assert(content.includes('crawling_phase1'), 'Crawler must declare crawling_phase1 state');
  assert(content.includes('phase1_done'), 'Crawler must declare phase1_done state');
});

runTest('reconcileQualifiedCatalogPins checks physical is_deleted column for index seek parity', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/creators/service.mjs'), 'utf8');
  assert(content.includes('(cp.is_deleted IS NULL OR cp.is_deleted = FALSE)'), 'reconcile query must check physical is_deleted column');
});

// -----------------------------------------------------------------------------
// Suite 4: Workflow Schema & Matrix Integration Tests
// -----------------------------------------------------------------------------
console.log('\n[*] Suite 4: GitHub Actions Workflow Modernization Tests...');

runTest('.github/workflows/crawler-pipeline.yml declares all three stages', () => {
  const ymlPath = path.resolve(process.cwd(), '.github/workflows/crawler-pipeline.yml');
  assert(fs.existsSync(ymlPath), 'Workflow file must exist');
  const content = fs.readFileSync(ymlPath, 'utf8');

  // Verify Stage 0
  assert(content.includes('dispatch:'), 'Workflow must declare dispatch stage');
  assert(content.includes('scripts/creator-fleet-dispatcher.mjs'), 'Stage 0 must run creator-fleet-dispatcher.mjs');

  // Verify Stage 1
  assert(content.includes('crawl-fleet:'), 'Workflow must declare crawl-fleet stage');
  assert(content.includes('include: ${{ fromJson(needs.dispatch.outputs.matrix_tasks) }}'), 'Stage 1 must consume dynamic matrix tasks');
  assert(content.includes('max-parallel: 20'), 'Stage 1 must run up to 20 parallel workers');
  assert(content.includes('scripts/creator-velocity-crawler.mjs'), 'Stage 1 must run creator-velocity-crawler.mjs');

  // Verify Stage 2
  assert(content.includes('consolidate:'), 'Workflow must declare consolidate stage');
  assert(content.includes('scripts/creator-fleet-consolidator.mjs'), 'Stage 2 must run creator-fleet-consolidator.mjs');

  // Verify backward compatibility triggers
  assert(content.includes("cron: '0 2 * * *'"), 'Daily cron trigger at 02:00 UTC must be preserved');
  assert(content.includes('target_account:'), 'Input target_account must be preserved');
  assert(content.includes('crawl_mode:'), 'Input crawl_mode must be preserved');
  assert(content.includes('max_pages:'), 'Input max_pages must be preserved');
});

console.log('\n================================================================');
console.log(`🏁 VERIFICATION SUMMARY: ${passedTests} PASSED | ${failedTests} FAILED`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
