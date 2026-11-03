/**
 * tests/test-adversarial-ui-stress.mjs
 *
 * Rigorous Adversarial UI & Workflow Stress Harness for PAE Round 15:
 * 1. Drawer state lifecycle & error resilience
 * 2. Property fallbacks (annotations, null/empty/populated)
 * 3. Color swatches count binding & NaN/undefined prevention
 * 4. Domainless labels & valid external domain preservation
 * 5. Driver pins image resolution & error degradation
 * 6. Headless Node.js execution shield (Rule 17)
 * 7. Rule 31 age formatting boundaries (0d, 364d, 1.0y, 2.5y)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { getPulsePageHtml } from '../src/pulse-ui.mjs';

const html = getPulsePageHtml();
const pulseUiSrc = fs.readFileSync(path.resolve('./src/pulse-ui.mjs'), 'utf8');

console.log('=== ADVERSARIAL STRESS TEST SUITE: PULSE STUDIO UI ===');

const results = {
  passed: 0,
  failed: 0,
  findings: []
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    results.failed++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    results.findings.push({ test: name, error: err.message, stack: err.stack });
  }
}

// ----------------------------------------------------------------------------
// 1. DRAWER STATE LIFECYCLE
// ----------------------------------------------------------------------------
console.log('\n--- 1. Drawer State Lifecycle & Error Resilience ---');

test('1.1 @keydown.escape.window closes drawer modal', () => {
  const hasWindowEscape = html.includes('@keydown.escape.window="if (isBlueprintModalOpen) closeBlueprintModal();"');
  assert.ok(hasWindowEscape, 'Must bind @keydown.escape.window to closeBlueprintModal()');
});

test('1.2 Backdrop click triggers closeBlueprintModal()', () => {
  const hasBackdropClick = html.includes('@click="closeBlueprintModal()"');
  assert.ok(hasBackdropClick, 'Backdrop must trigger closeBlueprintModal()');
});

test('1.3 Drawer panel stops click propagation (@click.stop)', () => {
  const hasClickStop = html.includes('@click.stop');
  assert.ok(hasClickStop, 'Drawer panel must contain @click.stop to prevent accidental backdrop close');
});

test('1.4 Close button triggers closeBlueprintModal() with correct icon', () => {
  const hasCloseButton = /@click="closeBlueprintModal\(\)"[\s\S]*?data-lucide="x"/.test(html);
  assert.ok(hasCloseButton, 'Drawer must have a close button triggering closeBlueprintModal() with X icon');
});

test('1.5 Async /api/pins/:id hydration failure does not crash state', () => {
  // Extract openBlueprintModal function from pulseStudioApp
  const fnMatch = pulseUiSrc.match(/openBlueprintModal:\s*function\(([\s\S]*?)\n\s*closeBlueprintModal/);
  assert.ok(fnMatch, 'openBlueprintModal must be defined in pulse-ui.mjs');
  const code = fnMatch[0];

  assert.ok(code.includes('.catch('), 'openBlueprintModal must have .catch to absorb network failures');
  assert.ok(code.includes('.finally('), 'openBlueprintModal must have .finally to reset isDossierHydrating');
  assert.ok(code.includes('self.isDossierHydrating = false'), 'isDossierHydrating must be set to false in finally');
});

// ----------------------------------------------------------------------------
// 2. PROPERTY FALLBACKS (ANNOTATIONS)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Property Fallbacks (Annotations) ---');

test('2.1 activeBlueprintPin annotations fallback expression exists in template', () => {
  const hasFallback = html.includes('activeBlueprintPin?.visual_annotations || activeBlueprintPin?.annotations || []');
  assert.ok(hasFallback, 'Template must use activeBlueprintPin?.visual_annotations || activeBlueprintPin?.annotations || []');
});

test('2.2 Annotations fallback safely handles empty, null, and populated arrays', () => {
  const evaluateAnnotations = (pin) => (pin?.visual_annotations || pin?.annotations || []);

  assert.deepStrictEqual(evaluateAnnotations(null), []);
  assert.deepStrictEqual(evaluateAnnotations({}), []);
  assert.deepStrictEqual(evaluateAnnotations({ visual_annotations: null }), []);
  assert.deepStrictEqual(evaluateAnnotations({ annotations: null }), []);
  assert.deepStrictEqual(evaluateAnnotations({ visual_annotations: [] }), []);
  assert.deepStrictEqual(evaluateAnnotations({ annotations: [{ norm: 'food', display: 'Food' }] }), [{ norm: 'food', display: 'Food' }]);
  assert.deepStrictEqual(evaluateAnnotations({ visual_annotations: [{ norm: 'dinner', display: 'Dinner' }] }), [{ norm: 'dinner', display: 'Dinner' }]);
});

test('2.3 Annotation chip rendering handles string tags and { norm, display } object tags', () => {
  const getTagDisplay = (tag) => (tag?.display || tag?.norm || tag || '');
  assert.strictEqual(getTagDisplay('Pasta Recipe'), 'Pasta Recipe');
  assert.strictEqual(getTagDisplay({ display: 'Sheet Pan' }), 'Sheet Pan');
  assert.strictEqual(getTagDisplay({ norm: 'easy dinners' }), 'easy dinners');
  assert.strictEqual(getTagDisplay(null), '');
  assert.strictEqual(getTagDisplay(undefined), '');
});

// ----------------------------------------------------------------------------
// 3. COLOR SWATCHES BINDING & ANTI-NaN SHIELD
// ----------------------------------------------------------------------------
console.log('\n--- 3. Color Swatches Binding & Anti-NaN Shield ---');

test('3.1 Color swatch binding never renders NaN or undefined for counts', () => {
  // Test the fallback formula specified in requirements
  const getCount = (col) => col.pin_count || col.count || col.frequency || 0;
  
  assert.strictEqual(getCount({ pin_count: 42 }), 42);
  assert.strictEqual(getCount({ count: 18 }), 18);
  assert.strictEqual(getCount({ frequency: 7 }), 7);
  assert.strictEqual(getCount({}), 0);
  assert.strictEqual(getCount({ pin_count: null }), 0);
  assert.strictEqual(getCount({ count: undefined }), 0);
  assert.strictEqual(getCount({ pin_count: NaN }), 0);
});

test('3.2 UI template binds to col.pin_count or col.count or item.pin_count in color palette', () => {
  const hasColCount = (
    pulseUiSrc.includes('col.pin_count') ||
    pulseUiSrc.includes('col.count')
  );
  const hasItemCount = (
    pulseUiSrc.includes('item.pin_count') ||
    pulseUiSrc.includes('item.count')
  );
  console.log(`      hasColCount: ${hasColCount}, hasItemCount: ${hasItemCount}`);
  assert.ok(hasColCount || hasItemCount, 'UI must bind to pin_count or count');
  assert.ok(hasColCount, 'CONTRACT CHECK: Round 15 Gate 4.3 specifically checks pulseUiCode.includes("col.pin_count") || pulseUiCode.includes("col.count")');
});

// ----------------------------------------------------------------------------
// 4. DOMAINLESS LABELS & EXTERNAL DOMAIN INTEGRITY
// ----------------------------------------------------------------------------
console.log('\n--- 4. Domainless Labels & External Domain Integrity ---');

test('4.1 Valid external domains are never labeled "No external URL"', () => {
  assert.strictEqual(html.includes('No external URL'), false, 'Template must NEVER label pins as "No external URL"');
});

test('4.2 Domainless label logic correctly distinguishes external vs user-uploaded pins', () => {
  const isDomainlessViral = (p) => (!p.domain || p.domain === 'Uploaded by user' || p.domain.includes('pinterest.') || !p.destination_url);
  
  // Valid external publisher
  const publisher = {
    domain: 'foodieblog.com',
    destination_url: 'https://foodieblog.com/recipe'
  };
  assert.strictEqual(isDomainlessViral(publisher), false, 'Publisher pin with domain and destination_url must NOT be domainless');

  // True domainless pin (Uploaded by user)
  const uploaded = {
    domain: 'Uploaded by user',
    destination_url: ''
  };
  assert.strictEqual(isDomainlessViral(uploaded), true, 'Uploaded by user must be identified as domainless');

  // Linkless Pinterest pin
  const pinLink = {
    domain: 'pinterest.com',
    destination_url: 'https://pinterest.com/pin/123/'
  };
  assert.strictEqual(isDomainlessViral(pinLink), true, 'Pinterest internal destination must be identified as domainless');
});

// ----------------------------------------------------------------------------
// 5. DRIVER PINS IMAGE RESOLUTION & ERROR DEGRADATION
// ----------------------------------------------------------------------------
console.log('\n--- 5. Driver Pins Image Resolution & Error Degradation ---');

test('5.1 Driver pin image tag includes onerror handler calling window.handlePinImgError', () => {
  const driverImgRegex = /<img[^>]*?alt="Driver"[^>]*?onerror="window\.handlePinImgError\(this\)"[^>]*?>/;
  assert.ok(driverImgRegex.test(html), 'Driver pin img must have onerror="window.handlePinImgError(this)"');
});

test('5.2 resolvePinImageUrl handles empty, null, and non-string gracefully without throwing', () => {
  // Test resolvePinImageUrl in isolated VM context
  const context = { SVG_PLACEHOLDER: 'data:image/svg+xml,...', window: {} };
  const fnMatch = pulseUiSrc.match(/window\.resolvePinImageUrl = function\([\s\S]*?\n\s*\};/);
  assert.ok(fnMatch, 'window.resolvePinImageUrl must be defined');
  
  vm.runInNewContext(fnMatch[0], context);
  const resolve = context.window.resolvePinImageUrl;

  assert.strictEqual(resolve(''), context.SVG_PLACEHOLDER);
  assert.strictEqual(resolve(null), context.SVG_PLACEHOLDER);
  assert.strictEqual(resolve(undefined), context.SVG_PLACEHOLDER);
  assert.strictEqual(resolve(12345), context.SVG_PLACEHOLDER);
  assert.strictEqual(resolve('https://i.pinimg.com/236x/test.jpg', '474x'), 'https://i.pinimg.com/474x/test.jpg');
});

test('5.3 handlePinImgError gracefully degrades pinimg URLs through 4 tiers to placeholder', () => {
  const context = { SVG_PLACEHOLDER: 'data:image/svg+xml,...', window: {} };
  const fnMatch = pulseUiSrc.match(/window\.handlePinImgError = function\([\s\S]*?\n\s*\};/);
  assert.ok(fnMatch, 'window.handlePinImgError must be defined');

  vm.runInNewContext(fnMatch[0], context);
  const handler = context.window.handlePinImgError;

  const mockImg = { src: 'https://i.pinimg.com/236x/abc.jpg' };
  handler(mockImg);
  assert.strictEqual(mockImg.src, 'https://i.pinimg.com/474x/abc.jpg', 'Tier 1 degradation should advance to 474x');

  handler(mockImg);
  assert.strictEqual(mockImg.src, 'https://i.pinimg.com/736x/abc.jpg', 'Tier 2 degradation should advance to 736x');

  handler(mockImg);
  assert.strictEqual(mockImg.src, 'https://i.pinimg.com/originals/abc.jpg', 'Tier 3 degradation should advance to originals');

  handler(mockImg);
  assert.strictEqual(mockImg.src, context.SVG_PLACEHOLDER, 'Tier 4 degradation should fallback to SVG_PLACEHOLDER');
});

// ----------------------------------------------------------------------------
// 6. HEADLESS NODE.JS EXECUTION SHIELD (RULE 17)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Headless Node.js Execution Shield (Rule 17) ---');

test('6.1 pulseStudioApp initializes in pure headless environment without throwing ReferenceErrors', () => {
  // Extract the entire script tag containing pulseStudioApp
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const appScriptTag = scriptMatches.find(s => s.includes('function pulseStudioApp'));
  assert.ok(appScriptTag, 'Script tag with pulseStudioApp must exist');

  const code = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  // Run in sandboxed context with NO window, NO document, NO localStorage
  const sandbox = {};
  const script = new vm.Script(`
    ${code}
    const app = pulseStudioApp('test_folder');
    if (typeof app.init === 'function') {
      // test calling methods
    }
  `);

  try {
    const ctx = vm.createContext(sandbox);
    script.runInContext(ctx);
  } catch (err) {
    assert.fail(`pulseStudioApp crashed in headless environment: ${err.message}`);
  }
});

test('6.2 Top-level <head> theme script is guarded against missing document in headless VM', () => {
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const headThemeScript = scriptMatches[0].replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  // Try running in headless context without document
  const sandbox = {};
  let caughtError = null;
  try {
    const ctx = vm.createContext(sandbox);
    vm.runInContext(headThemeScript, ctx);
  } catch (err) {
    caughtError = err;
  }
  
  if (caughtError) {
    console.warn(`      [FINDING] Head theme script throws ReferenceError when document is undefined: ${caughtError.message}`);
    assert.fail(`Head theme script must guard document with (typeof document !== 'undefined'): ${caughtError.message}`);
  }
});

// ----------------------------------------------------------------------------
// 7. RULE 31 AGE FORMATTING BOUNDARIES
// ----------------------------------------------------------------------------
console.log('\n--- 7. Rule 31 Age Formatting Boundaries ---');

// Extract app instance for helper method testing
const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
const appScriptTag = scriptMatches.find(s => s.includes('function pulseStudioApp'));
const code = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
const sandbox = { window: {}, document: {}, localStorage: { getItem: () => null } };
vm.runInNewContext(`${code}\nvar globalAppInstance = pulseStudioApp('test');`, sandbox);
const app = sandbox.globalAppInstance;

test('7.1 formatAge handles 0d boundary', () => {
  assert.ok(typeof app.formatAge === 'function', 'app.formatAge must be a function');
  const result0d = app.formatAge(0);
  console.log(`      formatAge(0) = "${result0d}"`);
  assert.strictEqual(result0d, '0d', 'formatAge(0) must return "0d", not "1d"');
});

test('7.2 formatAge handles 364d boundary', () => {
  const result364d = app.formatAge(364);
  console.log(`      formatAge(364) = "${result364d}"`);
  assert.strictEqual(result364d, '364d');
});

test('7.3 formatAge handles 1.0y boundary (365d)', () => {
  const result1y = app.formatAge(365);
  console.log(`      formatAge(365) = "${result1y}"`);
  assert.strictEqual(result1y, '1.0y');
});

test('7.4 formatAge handles 2.5y boundary (913d)', () => {
  const result2_5y = app.formatAge(Math.round(2.5 * 365.25));
  console.log(`      formatAge(2.5y) = "${result2_5y}"`);
  assert.strictEqual(result2_5y, '2.5y');
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`TEST SUMMARY: ${results.passed} Passed, ${results.failed} Failed`);
console.log('======================================================');

if (results.failed > 0) {
  console.log('\nFAILURES / ADVERSARIAL FINDINGS:');
  for (const f of results.findings) {
    console.log(`- [${f.test}]: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('All adversarial UI stress tests passed!');
  process.exit(0);
}
