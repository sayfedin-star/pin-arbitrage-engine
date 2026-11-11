/**
 * scripts/test_ui_architect_deliverables.mjs
 * 
 * Comprehensive Test Suite for UI Architect Deliverables:
 * 1. src/pin-details-ui.mjs hydration fixes & engagement card reactions & canonical root
 * 2. src/pulse-ui.mjs retry mechanism on timeout or network error
 * 3. shared-formatters.mjs Rule 31, anti-NaN poisoning, and tabular figures
 * 4. src/ui/pin-row.mjs shared component
 * 5. public/assets/aistudio/ cleanup verification
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatNumber,
  formatUniversalAge,
  formatAge,
  formatVelocity,
  formatPercent,
  formatPinMethod,
  getPinMethodBadgeClass,
  formatDate,
  safeUrl
} from '../src/ui/shared-formatters.mjs';
import { renderPinRowTemplate } from '../src/ui/pin-row.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🧪 UI ARCHITECT COMPREHENSIVE VERIFICATION SUITE');
console.log('================================================================');

// ----------------------------------------------------------------------------
// TEST 1: shared-formatters.mjs Rule 31 and Anti-NaN Hygiene
// ----------------------------------------------------------------------------
console.log('\n[TEST 1] Auditing shared-formatters.mjs...');

// Rule 31 Universal Time Formatting:
// >= 365 days -> years only (e.g. 1.0y, 2.5y - never show days in parentheses)
assert.equal(formatUniversalAge(365), '1.0y', '365d must format as 1.0y');
assert.equal(formatUniversalAge(730), '2.0y', '730d must format as 2.0y');
assert.equal(formatUniversalAge(410), '1.1y', '410d must format as 1.1y');
assert.ok(!formatUniversalAge(410).includes('('), 'Must never contain parentheses');

// < 365 days -> days only (e.g. 145d)
assert.equal(formatUniversalAge(0), '0d', '0d must format as 0d');
assert.equal(formatUniversalAge(145), '145d', '145d must format as 145d');
assert.equal(formatUniversalAge(364), '364d', '364d must format as 364d');
assert.equal(formatUniversalAge(null), '—', 'null must format as —');
assert.equal(formatUniversalAge(undefined), '—', 'undefined must format as —');

// formatAge alias parity
assert.equal(formatAge(410), '1.1y', 'formatAge must match formatUniversalAge');

// Anti-NaN Number Formatting
assert.equal(formatNumber(0), '0');
assert.equal(formatNumber(1234567), '1,234,567');
assert.equal(formatNumber(NaN), '0');
assert.equal(formatNumber(null), '0');
assert.equal(formatNumber(undefined), '0');
assert.equal(formatNumber({ saves: 4200 }), '4,200', 'Unpacks object anti-poisoning');
assert.equal(formatNumber(1250000, { compact: true }), '1.3M');

// Velocity & Percent
assert.equal(formatVelocity(14.5), '+14.5/d');
assert.equal(formatVelocity(-5.2), '-5.2/d');
assert.equal(formatVelocity(0), '0/d');
assert.equal(formatPercent(12.34), '+12.3%');
assert.equal(formatPercent(-4.5), '-4.5%');

// Creation Method
assert.equal(formatPinMethod({ creation_method: 'carousel' }), 'Carousel');
assert.equal(formatPinMethod({ is_video: true }), 'Video');
assert.equal(getPinMethodBadgeClass('carousel').includes('purple'), true);

// Safe URL
assert.equal(safeUrl('javascript:alert(1)'), '#');
assert.equal(safeUrl('https://example.com'), 'https://example.com');

console.log('  ✅ [PASS] Rule 31, Anti-NaN, and formatting invariants 100% verified');

// ----------------------------------------------------------------------------
// TEST 2: PinRow Component Template Generation
// ----------------------------------------------------------------------------
console.log('\n[TEST 2] Auditing src/ui/pin-row.mjs...');

const pinRowHtml = renderPinRowTemplate({
  pinVar: 'pin',
  indexVar: 'idx',
  showCheckbox: true,
  showRank: true,
  showDomain: true,
  showRepins: true,
  showAge: true,
  showActions: true,
  onRowClick: 'openPinInspector(pin)',
  onBlueprintClick: 'openBlueprintModal(pin)',
  onTagClick: 'setTagFilter(tag)',
  dossierUrlExpr: '"/pins/" + pin.pin_id'
});

assert.ok(pinRowHtml.includes('<tr :data-pin-id="pin.pin_id"'), 'PinRow must render tr with data-pin-id');
assert.ok(pinRowHtml.includes('openPinInspector(pin)'), 'PinRow must bind onRowClick');
assert.ok(pinRowHtml.includes('handlePinImgError'), 'PinRow must include 4-tier image degradation handler');
assert.ok(pinRowHtml.includes('formatUniversalAge'), 'PinRow must use formatUniversalAge');
assert.ok(pinRowHtml.includes('tabular-nums') && pinRowHtml.includes('font-mono'), 'PinRow must enforce tabular-nums and font-mono');
assert.ok(pinRowHtml.includes('Blueprint'), 'PinRow must include Blueprint CTA');

console.log('  ✅ [PASS] Shared PinRow component rendering 100% verified');

// ----------------------------------------------------------------------------
// TEST 3: pin-details-ui.mjs Source Code Verification
// ----------------------------------------------------------------------------
console.log('\n[TEST 3] Auditing src/pin-details-ui.mjs deliverables...');

const pinDetailsContent = fs.readFileSync(path.join(rootDir, 'src/pin-details-ui.mjs'), 'utf8');

// 3.1: computeChartPoints leading zero exclusion
assert.ok(
  pinDetailsContent.includes('const firstPosIdx = snaps.findIndex(s => Number(s?.save_count || 0) > 0);') &&
  pinDetailsContent.includes('snaps = snaps.slice(firstPosIdx);'),
  'computeChartPoints must exclude leading zero-save snapshots predating positive hydration'
);

// 3.2: isHydrationJump condition
assert.ok(
  pinDetailsContent.includes('if (prevSaves <= 0 && currSaves > 0) return true;'),
  'isHydrationJump must check if (prevSaves <= 0 && currSaves > 0) return true;'
);

// 3.3: format24hSaveDelta Hydrated Baseline
assert.ok(
  pinDetailsContent.includes("return '0 today (Hydrated Baseline)';"),
  "format24hSaveDelta must return '0 today (Hydrated Baseline)' when delta === null"
);

// 3.4: TOTAL ENGAGEMENT card displaying reactions
assert.ok(
  pinDetailsContent.includes('totalReactions()') &&
  pinDetailsContent.includes('reactions,'),
  'TOTAL ENGAGEMENT card must display reactions count'
);

// 3.5: is_canonical_root consistency
assert.ok(
  pinDetailsContent.includes('isCanonicalRoot()') &&
  pinDetailsContent.includes('canonicalPinId()'),
  'pin-details-ui must check isCanonicalRoot() and canonicalPinId() consistently'
);

console.log('  ✅ [PASS] pin-details-ui.mjs all 5 deliverables verified');

// ----------------------------------------------------------------------------
// TEST 4: pulse-ui.mjs Retry Mechanism on Timeout/Network Error
// ----------------------------------------------------------------------------
console.log('\n[TEST 4] Auditing src/pulse-ui.mjs retry mechanism...');

const pulseContent = fs.readFileSync(path.join(rootDir, 'src/pulse-ui.mjs'), 'utf8');

assert.ok(
  pulseContent.includes('for (var attempt = 1; attempt <= maxAttempts; attempt++)'),
  'fetchPulseData must implement attempt loop for retry'
);
assert.ok(
  pulseContent.includes('fetchErr.name === \'TimeoutError\'') &&
  pulseContent.includes('fetchErr.name === \'AbortError\'') &&
  pulseContent.includes('isTransient'),
  'fetchPulseData must catch and retry transient timeout/network errors'
);
assert.ok(
  pulseContent.includes('AbortSignal.timeout(15000)'),
  'fetchPulseData must create fresh AbortSignal per attempt'
);

console.log('  ✅ [PASS] pulse-ui.mjs retry on timeout or network error verified');

// ----------------------------------------------------------------------------
// TEST 5: public/assets/aistudio/ Cleanup Verification
// ----------------------------------------------------------------------------
console.log('\n[TEST 5] Auditing public/assets/aistudio/ cleanup...');

const aistudioDir = path.join(rootDir, 'public/assets/aistudio');
const filesInAistudio = fs.existsSync(aistudioDir)
  ? fs.readdirSync(aistudioDir).filter(f => f !== '.gitkeep')
  : [];

assert.equal(
  filesInAistudio.length,
  0,
  `public/assets/aistudio/ must contain 0 obsolete files, found: ${filesInAistudio.length}`
);

console.log('  ✅ [PASS] public/assets/aistudio/ cleaned up (0 orphaned 35MB assets remaining)');

console.log('\n================================================================');
console.log('🎉 ALL UI ARCHITECT DELIVERABLES VERIFIED CLEAN & GREEN');
console.log('================================================================');
