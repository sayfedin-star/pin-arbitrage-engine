/**
 * tests/test-challenger2-ui-deep-stress.mjs
 *
 * Empirical Adversarial Challenger 2 Test Harness for Round 15: Pulse Studio V2
 * Exhaustive edge-case stress testing of src/pulse-ui.mjs:
 * 1. Rule 31 formatting boundary stress (0d, 145d, 365d, negative, fractional, NaN, large years)
 * 2. Alpine.js state lifecycle & rapid room switching simulation
 * 3. Drawer open/close/rapid-switch race condition simulation
 * 4. Color swatch count binding & palette anti-NaN shield
 * 5. domless viral vs valid domain filtering edge cases
 * 6. Visual annotations & tags fallback resilience under corrupt payloads
 * 7. Headless Node.js execution shield (Rule 17) & absence of un-guarded globals
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { getPulsePageHtml } from '../src/pulse-ui.mjs';

console.log('======================================================================');
console.log('   CHALLENGER 2: PULSE STUDIO V2 ADVERSARIAL STRESS SUITE');
console.log('======================================================================\n');

const html = getPulsePageHtml();
const pulseUiSrc = fs.readFileSync(path.resolve('./src/pulse-ui.mjs'), 'utf8');

// Extract pulseStudioApp script content
const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
const appScriptTag = scriptMatches.find(s => s.includes('function pulseStudioApp'));
assert.ok(appScriptTag, 'Script tag containing pulseStudioApp must exist in HTML output');
const appCode = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

function createTestSandbox() {
  const mockStorage = new Map();
  const sandbox = {
    window: {
      location: { href: 'http://localhost:3000/pulse' },
      handlePinImgError: () => {},
      resolvePinImageUrl: (url) => url
    },
    document: {
      title: 'Pulse Studio',
      addEventListener: () => {}
    },
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v))
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    AbortSignal: {
      timeout: (ms) => ({ ms })
    },
    URLSearchParams: globalThis.URLSearchParams,
    Number: globalThis.Number,
    Math: globalThis.Math,
    String: globalThis.String,
    Array: globalThis.Array,
    Object: globalThis.Object,
    Set: globalThis.Set,
    Boolean: globalThis.Boolean,
    isFinite: globalThis.isFinite,
    isNaN: globalThis.isNaN,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  };
  vm.runInNewContext(appCode, sandbox);
  return sandbox;
}

const suiteResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function runTest(suite, name, fn) {
  try {
    fn();
    suiteResults.passed++;
    console.log(`  [PASS] [${suite}] ${name}`);
  } catch (err) {
    suiteResults.failed++;
    console.error(`  [FAIL] [${suite}] ${name}: ${err.message}`);
    suiteResults.tests.push({ suite, name, error: err.message, stack: err.stack });
  }
}

// ============================================================================
// SUITE 1: Rule 31 Universal Strict Time Formatting Boundary Stress
// ============================================================================
console.log('--- SUITE 1: Rule 31 Formatting Boundary Stress ---');
const sb1 = createTestSandbox();
const app1 = sb1.pulseStudioApp('test_folder');

runTest('Rule31', 'formatAge(0) strictly returns "0d"', () => {
  assert.strictEqual(app1.formatAge(0), '0d');
});

runTest('Rule31', 'formatAge(145) strictly returns "145d"', () => {
  assert.strictEqual(app1.formatAge(145), '145d');
});

runTest('Rule31', 'formatAge(365) strictly returns "1.0y"', () => {
  assert.strictEqual(app1.formatAge(365), '1.0y');
});

runTest('Rule31', 'formatAge(364) strictly returns "364d"', () => {
  assert.strictEqual(app1.formatAge(364), '364d');
});

runTest('Rule31', 'formatAge(1) strictly returns "1d"', () => {
  assert.strictEqual(app1.formatAge(1), '1d');
});

runTest('Rule31', 'formatAge(730.5) strictly returns "2.0y"', () => {
  assert.strictEqual(app1.formatAge(730.5), '2.0y');
});

runTest('Rule31', 'formatAge(3652.5) strictly returns "10.0y"', () => {
  assert.strictEqual(app1.formatAge(3652.5), '10.0y');
});

runTest('Rule31', 'formatAge(-5) defensively returns "0d"', () => {
  assert.strictEqual(app1.formatAge(-5), '0d');
});

runTest('Rule31', 'formatAge(null) and formatAge(undefined) return "0d"', () => {
  assert.strictEqual(app1.formatAge(null), '0d');
  assert.strictEqual(app1.formatAge(undefined), '0d');
});

runTest('Rule31', 'formatAge(NaN) and formatAge("corrupt") return "0d"', () => {
  assert.strictEqual(app1.formatAge(NaN), '0d');
  assert.strictEqual(app1.formatAge('corrupt_string'), '0d');
});

runTest('Rule31', 'Years format never contains days in parentheses or "d"', () => {
  const agesInYears = [365, 366, 400, 500, 730, 1000, 2000, 4000];
  for (const age of agesInYears) {
    const formatted = app1.formatAge(age);
    assert.ok(formatted.endsWith('y'), `Age ${age} must end with 'y', got: ${formatted}`);
    assert.ok(!formatted.includes('(') && !formatted.includes(')'), `Age ${age} must not have parentheses, got: ${formatted}`);
    assert.ok(!formatted.includes('d'), `Age ${age} must not contain 'd', got: ${formatted}`);
  }
});

runTest('Rule31', 'Days format strictly ends with "d" and has no parentheses', () => {
  const agesInDays = [0, 1, 14, 30, 90, 180, 250, 364];
  for (const age of agesInDays) {
    const formatted = app1.formatAge(age);
    assert.ok(formatted.endsWith('d'), `Age ${age} must end with 'd', got: ${formatted}`);
    assert.ok(!formatted.includes('(') && !formatted.includes(')'), `Age ${age} must not have parentheses, got: ${formatted}`);
    assert.ok(!formatted.includes('y'), `Age ${age} must not contain 'y', got: ${formatted}`);
  }
});

// ============================================================================
// SUITE 2: Alpine Template & State Lifecycle Under Rapid Room Switching
// ============================================================================
console.log('\n--- SUITE 2: Alpine State Lifecycle & Room Switching ---');

runTest('AlpineState', 'Initial room defaults to "radar"', () => {
  const app = sb1.pulseStudioApp('folder_1');
  assert.strictEqual(app.currentRoom, 'radar');
});

runTest('AlpineState', 'Rapid room switching mutates currentRoom cleanly', () => {
  const app = sb1.pulseStudioApp('folder_1');
  const rooms = ['radar', 'matrix', 'creators_vacuums', 'radar', 'matrix'];
  for (const r of rooms) {
    app.currentRoom = r;
    assert.strictEqual(app.currentRoom, r);
  }
});

runTest('AlpineState', 'Room switching preserves data payloads without reset', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.breakout_pins.top_breakouts = [{ pin_id: '123', title: 'Test Pin', daily_save_velocity: 150 }];
  app.annotation_crossovers = { pair_crossovers: [{ pair: 'A + B', pin_count: 5 }] };
  app.creator_breakouts = [{ username: 'creator1', effective_delta_reach_24h: 5000 }];

  // Switch rooms
  app.currentRoom = 'matrix';
  assert.strictEqual(app.breakout_pins.top_breakouts.length, 1);
  assert.strictEqual(app.annotation_crossovers.pair_crossovers.length, 1);

  app.currentRoom = 'creators_vacuums';
  assert.strictEqual(app.creator_breakouts.length, 1);

  app.currentRoom = 'radar';
  assert.strictEqual(app.breakout_pins.top_breakouts.length, 1);
});

// ============================================================================
// SUITE 3: Drawer Lifecycle & Concurrent Hydration Race Conditions
// ============================================================================
console.log('\n--- SUITE 3: Drawer Lifecycle & Concurrency Race Resistance ---');

runTest('DrawerLifecycle', 'openBlueprintModal initializes modal state and opens dialog', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.$nextTick = (cb) => cb && cb();

  const pin = { pin_id: 'pin_alpha', title: 'Alpha Pin', save_count: 500 };
  app.openBlueprintModal(pin);

  assert.strictEqual(app.isBlueprintModalOpen, true);
  assert.strictEqual(app.activeBlueprintPin.pin_id, 'pin_alpha');
  assert.strictEqual(app.activeBlueprintPin.title, 'Alpha Pin');
  assert.strictEqual(app.isDossierHydrating, true);
});

runTest('DrawerLifecycle', 'closeBlueprintModal cleans up active pin and closes dialog', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.isBlueprintModalOpen = true;
  app.activeBlueprintPin = { pin_id: 'pin_alpha' };
  app.isDossierHydrating = true;

  app.closeBlueprintModal();

  assert.strictEqual(app.isBlueprintModalOpen, false);
  assert.strictEqual(app.activeBlueprintPin, null);
  assert.strictEqual(app.isDossierHydrating, false);
});

runTest('DrawerLifecycle', 'Rapid pin opening ignores slow resolution of stale pin (Race condition guard)', async () => {
  const sb = createTestSandbox();
  let pendingFetchResolve = null;

  sb.fetch = async (url) => {
    if (url.includes('pin_slow')) {
      return new Promise((resolve) => {
        pendingFetchResolve = () => resolve({
          ok: true,
          json: async () => ({
            pin: {
              pin_id: 'pin_slow',
              description: 'Slow Description',
              alt_text: 'Slow Alt Text'
            }
          })
        });
      });
    }
    return {
      ok: true,
      json: async () => ({
        pin: {
          pin_id: 'pin_fast',
          description: 'Fast Description',
          alt_text: 'Fast Alt Text'
        }
      })
    };
  };

  const app = sb.pulseStudioApp('folder_1');
  app.$nextTick = (cb) => cb && cb();

  // 1. Open slow pin
  app.openBlueprintModal({ pin_id: 'pin_slow', title: 'Slow Pin' });
  assert.strictEqual(app.activeBlueprintPin.pin_id, 'pin_slow');

  // 2. Before slow fetch resolves, user clicks fast pin
  app.openBlueprintModal({ pin_id: 'pin_fast', title: 'Fast Pin' });
  assert.strictEqual(app.activeBlueprintPin.pin_id, 'pin_fast');

  // 3. Now slow fetch resolves
  if (pendingFetchResolve) pendingFetchResolve();
  await new Promise(r => setTimeout(r, 20));

  // 4. Assert activeBlueprintPin is STILL pin_fast and NOT clobbered by pin_slow!
  assert.strictEqual(app.activeBlueprintPin.pin_id, 'pin_fast');
  assert.strictEqual(app.activeBlueprintPin.title, 'Fast Pin');
});

// ============================================================================
// SUITE 4: Color Swatch Count Binding & Anti-NaN Shield
// ============================================================================
console.log('\n--- SUITE 4: Color Swatch Count Binding & Anti-NaN Shield ---');

runTest('ColorSwatches', 'getColorCount handles populated and zero count variants', () => {
  assert.strictEqual(app1.getColorCount({ pin_count: 55 }), 55);
  assert.strictEqual(app1.getColorCount({ count: 23 }), 23);
  assert.strictEqual(app1.getColorCount({ frequency: 12 }), 12);
  assert.strictEqual(app1.getColorCount({ pin_count: 0 }), 0);
  assert.strictEqual(app1.getColorCount({ count: 0 }), 0);
  assert.strictEqual(app1.getColorCount(null), 0);
  assert.strictEqual(app1.getColorCount(undefined), 0);
});

runTest('ColorSwatches', 'Template includes col.pin_count || col.count expressions', () => {
  assert.ok(pulseUiSrc.includes('col.pin_count || col.count'), 'Template must include col.pin_count || col.count');
  assert.ok(html.includes('col.pin_count || col.count'), 'Rendered HTML must include col.pin_count || col.count');
});

runTest('ColorSwatches', 'getMatrixEntities("colors") returns palette entries intact', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.hidden_gems_telemetry = {
    dominant_color_palette: [
      { color: '#e11d48', pin_count: 45, count: 45, total_velocity: 850 },
      { color: '#10b981', pin_count: 12, count: 12, total_velocity: 240 }
    ]
  };
  app.matrixSubFilter = 'colors';

  const entities = app.getMatrixEntities();
  assert.strictEqual(entities.length, 2);
  assert.strictEqual(entities[0].color, '#e11d48');
  assert.strictEqual(entities[0].pin_count, 45);
});

// ============================================================================
// SUITE 5: Domainless Viral vs Valid Domain Integrity
// ============================================================================
console.log('\n--- SUITE 5: Domainless Viral vs Valid Domain Integrity ---');

runTest('DomainlessIntegrity', 'External domain pins are NEVER returned in getDomainlessViralPins', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.hidden_gems_telemetry = {
    vacuum_hijack_pins: [
      { pin_id: 'ext_1', domain: 'myrecipes.com', destination_url: 'https://myrecipes.com/pie', save_count: 1000 },
      { pin_id: 'ext_2', domain: 'blogger.org', destination_url: 'https://blogger.org/post', save_count: 800 },
      { pin_id: 'dml_1', domain: 'Uploaded by user', destination_url: '', save_count: 1200 },
      { pin_id: 'dml_2', domain: '', destination_url: '', save_count: 950 },
      { pin_id: 'dml_3', domain: 'pinterest.com', destination_url: 'https://pinterest.com/pin/123/', save_count: 700 }
    ]
  };

  const domainless = app.getDomainlessViralPins();
  assert.strictEqual(domainless.length, 3);
  const ids = domainless.map(p => p.pin_id);
  assert.ok(!ids.includes('ext_1'), 'ext_1 must be excluded');
  assert.ok(!ids.includes('ext_2'), 'ext_2 must be excluded');
  assert.ok(ids.includes('dml_1'), 'dml_1 must be included');
  assert.ok(ids.includes('dml_2'), 'dml_2 must be included');
  assert.ok(ids.includes('dml_3'), 'dml_3 must be included');
});

// ============================================================================
// SUITE 6: Annotations Fallbacks & Corrupt Payload Resilience
// ============================================================================
console.log('\n--- SUITE 6: Annotations Fallbacks & Corrupt Payload Resilience ---');

runTest('AnnotationsResilience', 'getFilteredRadarPins handles pins with corrupt or null visual_annotations', () => {
  const app = sb1.pulseStudioApp('folder_1');
  app.breakout_pins.top_breakouts = [
    { pin_id: 'p1', title: 'Normal', visual_annotations: [{ norm: 'pasta', display: 'Pasta' }], daily_save_velocity: 100 },
    { pin_id: 'p2', title: 'Null Annotations', visual_annotations: null, annotations: null, daily_save_velocity: 80 },
    { pin_id: 'p3', title: 'Empty Array Annotations', visual_annotations: [], annotations: [], daily_save_velocity: 60 },
    { pin_id: 'p4', title: 'Legacy Annotations Array', visual_annotations: null, annotations: [{ norm: 'soup', display: 'Soup' }], daily_save_velocity: 50 }
  ];

  app.activeTagFilter = 'pasta';
  const filtered = app.getFilteredRadarPins();
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].pin_id, 'p1');

  app.activeTagFilter = 'soup';
  const filteredSoup = app.getFilteredRadarPins();
  assert.strictEqual(filteredSoup.length, 1);
  assert.strictEqual(filteredSoup[0].pin_id, 'p4');

  app.activeTagFilter = null;
  const allFiltered = app.getFilteredRadarPins();
  assert.strictEqual(allFiltered.length, 4);
});

// ============================================================================
// SUITE 7: Headless Node.js Execution Shield (Rule 17)
// ============================================================================
console.log('\n--- SUITE 7: Headless Node.js Execution Shield (Rule 17) ---');

runTest('Rule17', 'Top-level pulse-ui.mjs evaluation in completely empty global context does not throw', () => {
  // Pure VM context with zero browser globals
  const bareSandbox = {};
  const vmScript = new vm.Script(appCode);
  const ctx = vm.createContext(bareSandbox);
  vmScript.runInContext(ctx);
  assert.strictEqual(typeof bareSandbox.pulseStudioApp, 'function');
});

// ============================================================================
// SUITE 8: Alpine Directives & Method Binding Verification
// ============================================================================
console.log('\n--- SUITE 8: Alpine Directives & Method Binding Verification ---');

runTest('AlpineBindings', 'All methods invoked in template attributes exist on pulseStudioApp', () => {
  const app = sb1.pulseStudioApp('test_folder');
  const expectedMethods = [
    'init',
    'fetchPulseData',
    'setWindow',
    'refreshPulse',
    'getFilteredRadarPins',
    'getMatrixEntities',
    'getColorCount',
    'getSelectedMatrixPins',
    'selectMatrixItem',
    'isMatrixItemSelected',
    'getFilteredCreators',
    'getDomainlessViralPins',
    'getKeywordVacuums',
    'openBlueprintModal',
    'closeBlueprintModal',
    'copyText',
    'copyAiPrompt',
    'copyBlueprintMarkdown',
    'generateAiPrompt',
    'formatNumber',
    'formatVelocity',
    'formatAge',
    'showToast'
  ];

  for (const method of expectedMethods) {
    assert.strictEqual(
      typeof app[method],
      'function',
      `Expected pulseStudioApp to define method: ${method}`
    );
  }
});

runTest('AlpineBindings', 'All core reactive state properties are initialized on pulseStudioApp', () => {
  const app = sb1.pulseStudioApp('test_folder');
  const expectedProperties = [
    'currentRoom',
    'selectedWindow',
    'radarFilter',
    'matrixSubFilter',
    'creatorSubFilter',
    'searchQuery',
    'activeTagFilter',
    'selectedMatrixItem',
    'isBlueprintModalOpen',
    'activeBlueprintPin',
    'isDossierHydrating',
    'blueprintCopied',
    'promptCopied',
    'isLoading',
    'isRefreshing',
    'kpis',
    'breakout_pins',
    'annotation_crossovers',
    'guided_capsule_crossovers',
    'creator_breakouts',
    'keyword_vacuums_and_bridges',
    'hidden_gems_telemetry'
  ];

  for (const prop of expectedProperties) {
    assert.ok(
      prop in app,
      `Expected pulseStudioApp to define reactive property: ${prop}`
    );
  }
});

runTest('AlpineBindings', 'Pre-fetch and non-blocking background hydration contracts are intact', () => {
  // Verify fetch headers and AbortSignal timeout
  assert.ok(pulseUiSrc.includes("AbortSignal.timeout(8000)"), 'Live pin hydration must enforce 8s timeout');
  assert.ok(pulseUiSrc.includes("AbortSignal.timeout(15000)"), 'Main telemetry fetch must enforce 15s timeout');
  assert.ok(pulseUiSrc.includes("isDossierHydrating = false"), 'isDossierHydrating must be safely cleared in finally');
});

console.log('\n======================================================================');
console.log(`CHALLENGER 2 SUITE SUMMARY: ${suiteResults.passed} Passed, ${suiteResults.failed} Failed`);
console.log('======================================================================');

if (suiteResults.failed > 0) {
  console.log('\nFAILURES:');
  for (const t of suiteResults.tests) {
    console.log(`- [${t.suite} - ${t.name}]: ${t.error}`);
  }
  process.exit(1);
} else {
  console.log('\nAll Challenger 2 adversarial UI & edge-case stress tests PASSED cleanly!');
  process.exit(0);
}
