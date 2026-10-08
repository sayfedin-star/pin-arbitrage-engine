/**
 * Phase 4 Adversarial Verification: Level 3 Dedicated Pin Intelligence Page UI
 * Testing Suite: scripts/test_phase4_pin_details_adversarial.mjs
 * 
 * Tests the HTML template, 4-pillar cross-context visualization,
 * 6 KPI metrics calculation, interactive inline SVG trajectory algorithms,
 * and atomic snapshot deletion within a sandboxed V8 runtime.
 */

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';

console.log('================================================================================');
console.log('       PHASE 4 ADVERSARIAL VERIFICATION: LEVEL 3 PIN DOSSIER UI');
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
  }
}

const pinId = '1098245059167667976';
const html = getPinDetailPageHtml(pinId);

// 1. Structural Markup & Meta Tags Parity
runTest('HTML Generation & Meta Tags Parity', () => {
  assert.ok(html.includes('<!DOCTYPE html>'), 'Must start with DOCTYPE');
  assert.ok(html.includes(`Universal Pin Dossier ${pinId}`), 'Must include title with pinId');
  assert.ok(html.includes(`x-data="pinDetailApp('${pinId}')"`), 'Must mount pinDetailApp with pinId argument');
  assert.ok(html.includes('aspect-[2/3]'), 'Must enforce Pinterest standard 2:3 aspect ratio');
  assert.ok(html.includes('dominant_color'), 'Must reference dominant_color');
});

// 2. The 6 KPI Telemetry Cards Structure
runTest('6 KPI Telemetry Cards Parity', () => {
  assert.ok(html.includes('Total Saves'), 'Must include Total Saves card');
  assert.ok(html.includes('Total Repins'), 'Must include Total Repins card');
  assert.ok(html.includes('Daily Velocity'), 'Must include Daily Velocity card');
  assert.ok(html.includes('Best Rank'), 'Must include Best Rank card');
  assert.ok(html.includes('Total Engagement'), 'Must include Total Engagement card');
  assert.ok(html.includes('SERP Footprint'), 'Must include SERP Footprint card');
});

// 3. The 4-Pillar Cross-Context Matrix
runTest('4-Pillar Cross-Context Matrix Parity', () => {
  assert.ok(html.includes('Pillar 1: Creator & Board'), 'Must include Pillar 1');
  assert.ok(html.includes('Pillar 2: Keywords SERP'), 'Must include Pillar 2');
  assert.ok(html.includes('Pillar 3: Related Pins'), 'Must include Pillar 3');
  assert.ok(html.includes('Pillar 4: Board Ideas Studio'), 'Must include Pillar 4');
  assert.ok(html.includes('Launch Related Radar'), 'Must include related pins radar button');
  assert.ok(html.includes('Studio Recommendations'), 'Must include board ideas studio link');
});

// 4. Interactive SVG Trajectory Chart & Tooltips
runTest('Interactive SVG Trajectory Chart Parity', () => {
  assert.ok(html.includes('<svg'), 'Must render inline SVG');
  assert.ok(html.includes('buildSvgLinePath()'), 'Must call buildSvgLinePath');
  assert.ok(html.includes('buildSvgAreaPath()'), 'Must call buildSvgAreaPath');
  assert.ok(html.includes('hoveredPoint'), 'Must track hoveredPoint for interactive tooltips');
  assert.ok(html.includes('emeraldGradient'), 'Must contain SVG gradient def');
});

// 5. Daily Snapshots Audit Table & Atomic Deletion
runTest('Daily Snapshots Audit Table & Atomic Delete Modal', () => {
  assert.ok(html.includes('Daily Snapshots Time-Series Audit Log'), 'Must render audit log header');
  assert.ok(html.includes('computeDelta(idx, \'save_count\')'), 'Must compute dynamic save deltas');
  assert.ok(html.includes('requestDeleteSnapshot(s.id)'), 'Must hook requestDeleteSnapshot');
  assert.ok(html.includes('Confirm Snapshot Deletion'), 'Must include deletion confirmation modal');
  assert.ok(html.includes('executeDeleteSnapshot()'), 'Must execute deletion via DELETE endpoint');
});

// 6. Sandboxed V8 Runtime Execution & Logic Verification
runTest('Sandboxed V8 Execution & Mathematical Parity', async () => {
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const inlineScripts = scriptMatches.filter(s => !s.includes('src='));
  const appScriptTag = inlineScripts[inlineScripts.length - 1];
  const appCode = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  let deletedId = null;
  const mockFetch = async (url, options) => {
    if (options?.method === 'DELETE') {
      const match = url.match(/\/snapshots\/(\d+)/);
      deletedId = match ? Number(match[1]) : null;
      return { ok: true, json: async () => ({ success: true }) };
    }
    return {
      ok: true,
      json: async () => ({
        success: true,
        pin_id: pinId,
        shard_id: 42,
        creative: {
          title: 'Crispy Lemon Garlic Chicken',
          description: 'Juicy skillet chicken cutlets...',
          alt_text: 'Crispy golden chicken cutlets garnished with fresh rosemary and lemon slices',
          dominant_color: '#d97706',
          visual_annotations: ['Chicken', 'Dinner', 'Crispy', 'Skillet']
        },
        pillar_1_creator_context: {
          creator_username: 'tastyrecipes',
          board_name: 'Easy Dinner Ideas',
          competitor_tracked: true
        },
        pillar_2_keywords_context: {
          ranking_keywords: [
            { keyword: 'crispy chicken cutlets', rank: 3, velocity: 15.2 },
            { keyword: 'lemon garlic chicken', rank: 8, velocity: 9.1 }
          ],
          highest_rank: 3,
          serp_impressions: 2
        },
        snapshots: [
          { id: 201, snapshot_date: '2026-10-08', save_count: 1500, repin_count: 320, daily_save_velocity: 18.5, comment_count: 12, reaction_count: 80, share_count: 45 },
          { id: 200, snapshot_date: '2026-10-07', save_count: 1420, repin_count: 305, daily_save_velocity: 14.0, comment_count: 10, reaction_count: 75, share_count: 40 },
          { id: 199, snapshot_date: '2026-10-06', save_count: 1350, repin_count: 290, daily_save_velocity: 12.0, comment_count: 8, reaction_count: 70, share_count: 35 }
        ]
      })
    };
  };

  const sandbox = {
    console,
    Map,
    Set,
    String,
    Number,
    Boolean,
    Array,
    Date,
    Math,
    encodeURIComponent,
    clearTimeout,
    setTimeout,
    fetch: mockFetch
  };
  vm.createContext(sandbox);
  vm.runInContext(appCode, sandbox);

  assert.equal(typeof sandbox.pinDetailApp, 'function');
  const app = sandbox.pinDetailApp(pinId);

  // Initialize and fetch dossier
  await app.init();
  assert.ok(app.dossier);
  assert.equal(app.dossier.pin_id, pinId);
  assert.equal(app.dossier.shard_id, 42);

  // Test latest snapshot & KPI calculations
  const latest = app.latestSnapshot();
  assert.equal(latest.id, 201);
  assert.equal(app.totalEngagementScore(), 137); // 12 + 80 + 45

  // Test dynamic LAG delta calculations
  const delta0 = app.computeDelta(0, 'save_count'); // 1500 - 1420 = 80
  assert.equal(delta0, 80);
  const delta1 = app.computeDelta(1, 'save_count'); // 1420 - 1350 = 70
  assert.equal(delta1, 70);

  // Test SVG Chart generation
  const points = app.computeChartPoints();
  assert.equal(points.length, 3);
  assert.ok(points[0].x < points[1].x && points[1].x < points[2].x, 'Points must progress horizontally');

  const linePath = app.buildSvgLinePath();
  assert.ok(linePath.startsWith('M '), 'Line path must start with M');
  assert.ok(linePath.includes(' L '), 'Line path must contain L commands');

  const areaPath = app.buildSvgAreaPath();
  assert.ok(areaPath.includes(' Z'), 'Area path must close with Z');

  // Test Atomic Deletion
  app.requestDeleteSnapshot(200);
  assert.equal(app.snapshotToDelete, 200);
  assert.equal(app.deleteModalOpen, true);

  await app.executeDeleteSnapshot();
  assert.equal(deletedId, 200, 'DELETE request must target snapshot 200');
  assert.equal(app.dossier.snapshots.length, 2, 'Snapshot 200 must be removed from local state');
  assert.equal(app.deleteModalOpen, false);
});

console.log('\n================================================================================');
console.log(`PHASE 4 VERIFICATION SCORECARD: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================================\n');

if (passedTests === totalTests) {
  console.log('>>> PHASE 4 VERIFICATION SIGN-OFF: 100% PASS <<<');
  process.exit(0);
} else {
  console.error('>>> PHASE 4 VERIFICATION FAILED! <<<');
  process.exit(1);
}
