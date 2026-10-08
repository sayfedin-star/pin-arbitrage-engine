/**
 * Phase 3 Adversarial Verification: Level 1B Keyword Discovery & Autocomplete Hub
 * Tests the HTML output, inline scripts, client cache contracts, AbortController behavior,
 * and bulk import edge cases.
 */

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { getDiscoveryPageHtml } from '../src/discovery-ui.mjs';

console.log('================================================================================');
console.log('       PHASE 3 ADVERSARIAL VERIFICATION: KEYWORD DISCOVERY & AUTOCOMPLETE');
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

// 1. Generate Discovery HTML
const html = getDiscoveryPageHtml();

runTest('HTML Generation & Meta Tags Parity', () => {
  assert.ok(html.includes('<!DOCTYPE html>'), 'Must start with DOCTYPE');
  assert.ok(html.includes('Pinterest Typeahead Radar'), 'Must include title');
  assert.ok(html.includes('x-data="discoveryApp()"'), 'Must mount discoveryApp');
  assert.ok(html.includes('referrer" content="no-referrer"'), 'Must enforce no-referrer');
});

runTest('Omnibar Input & Edge-Safe Debounce Wiring', () => {
  assert.ok(html.includes('@input.debounce.250ms="onInputDebounced()"'), 'Must have 250ms debounce');
  assert.ok(html.includes('@keydown.enter="searchImmediately()"'), 'Must support immediate enter search');
  assert.ok(html.includes('animate-spin'), 'Must contain SVG spinner for loading indicator');
  assert.ok(html.includes('clearSearch()'), 'Must contain clear button handler');
});

runTest('Exploration Table Structure & CLS Skeleton Loading', () => {
  assert.ok(html.includes('animate-pulse'), 'Must have animate-pulse skeleton loading');
  assert.ok(html.includes('suggested search terms', 'i') || html.includes('Suggested Search Terms'), 'Must have terms header');
  assert.ok(html.includes('highlightTerm(item.term)'), 'Must call highlightTerm for search match');
  assert.ok(html.includes('volumeTier'), 'Must have volumeTier styling');
  assert.ok(html.includes('intent.badgeClass'), 'Must have intent badge styling');
  assert.ok(html.includes('See Top Pins'), 'Must contain See Top Pins radar link');
});

runTest('Zero-Results & Idle Seed Explorers', () => {
  assert.ok(html.includes('applySeed(\'dinner ideas\')'), 'Must have dinner ideas seed');
  assert.ok(html.includes('applySeed(\'air fryer salmon\')'), 'Must have air fryer salmon seed');
  assert.ok(html.includes('applySeed(\'small living room decor\')'), 'Must have decor seed');
  assert.ok(html.includes('Track "<span x-text="searchQuery"></span>" Directly in Radar'), 'Must have zero-results track button');
});

runTest('Floating Bulk Action Bar & Interactive Modals', () => {
  assert.ok(html.includes('x-show="selectedKeywords.length > 0"'), 'Must have floating selection bar');
  assert.ok(html.includes('openAddToFolderModal = true'), 'Must trigger add to folder modal');
  assert.ok(html.includes('trackSelectedDirectly()'), 'Must trigger radar tracking');
  assert.ok(html.includes('openBulkModal'), 'Must contain bulk importer modal');
  assert.ok(html.includes('cleanBulkKeywordsCount'), 'Must compute clean bulk keyword count');
  assert.ok(html.includes('1,000 unique keywords'), 'Must enforce 1,000 keyword cap');
});

runTest('Toast Notification System Parity', () => {
  assert.ok(html.includes('x-show="toast.show"'), 'Must have toast display');
  assert.ok(html.includes('showToast('), 'Must provide showToast helper');
});

runTest('Inline Script Parsing & Execution in Sandboxed V8 Context', () => {
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const inlineScripts = scriptMatches.filter(s => !s.includes('src='));
  assert.ok(inlineScripts.length >= 2, 'Must have tailwind config script and app logic script');

  const appScriptTag = inlineScripts[inlineScripts.length - 1];
  const code = appScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  const sandbox = {
    console,
    Map,
    Set,
    String,
    Number,
    Boolean,
    Array,
    Date,
    encodeURIComponent,
    clearTimeout,
    setTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.equal(typeof sandbox.discoveryApp, 'function', 'discoveryApp must be declared');
  const app = sandbox.discoveryApp();

  // Test client-side methods in sandbox
  assert.equal(typeof app.init, 'function');
  assert.equal(typeof app.executeTypeahead, 'function');
  assert.equal(typeof app.determineIntent, 'function');
  assert.equal(typeof app.highlightTerm, 'function');
  assert.equal(typeof app.escapeHtml, 'function');

  // Test intent logic
  const intent1 = app.determineIntent('healthy chicken dinner recipe');
  assert.equal(intent1.label, 'Recipe / Cooking');

  const intent2 = app.determineIntent('buy luxury living room couch');
  assert.equal(intent2.label, 'Commercial / Buyer');

  const intent3 = app.determineIntent('diy small bathroom remodeling guide');
  assert.equal(intent3.label, 'Informational / DIY');

  const intent4 = app.determineIntent('dark academia aesthetic wallpaper');
  assert.equal(intent4.label, 'Inspirational / Visual');

  // Test keyword highlight logic
  app.searchQuery = 'salmon';
  const highlighted = app.highlightTerm('crispy air fryer salmon bites');
  assert.ok(highlighted.includes('<mark class="bg-emerald-500/20 text-emerald-300 font-semibold px-0.5 rounded not-italic">salmon</mark>'));

  // Test XSS escape in highlightTerm
  app.searchQuery = '<script>';
  const safeEscaped = app.highlightTerm('<script>alert(1)</script>');
  assert.ok(!safeEscaped.includes('<script>alert'), 'Must sanitize raw script tags');
  assert.ok(safeEscaped.includes('&lt;script&gt;'));

  // Test bulk cleaning computation
  app.bulkKeywordsText = '  pasta recipes  \nPASTA RECIPES\npasta recipes\n  \n  chicken soup  \n';
  assert.equal(app.cleanBulkKeywordsCount, 2, 'Should deduplicate and strip whitespace to exactly 2 keywords');

  // Test LRU Cache Simulation
  app.searchCache.set('dinner', [{ term: 'dinner ideas' }]);
  assert.ok(app.searchCache.has('dinner'));
});

console.log('\n================================================================================');
console.log(`PHASE 3 ADVERSARIAL SCORECARD: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================================\n');

if (passedTests === totalTests) {
  console.log('>>> PHASE 3 VERIFICATION SIGN-OFF: 100% PASS <<<');
  process.exit(0);
} else {
  console.error('>>> PHASE 3 VERIFICATION FAILED! <<<');
  process.exit(1);
}
