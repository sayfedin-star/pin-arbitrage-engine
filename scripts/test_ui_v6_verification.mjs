/**
 * Automated Forensic & UI/UX Verification Script for PAE v6.0 Rebuild
 * Author: verifier-ui-e2e
 */

import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
    failures.push(message);
  }
}

export function runUiVerification(baseDir = process.cwd()) {
  console.log('\n=== PAE v6.0 Frontend & UI/UX Forensic Audit ===\n');

  const pinDetailsPath = path.join(baseDir, 'src', 'pin-details-ui.mjs');
  const pulseUiPath = path.join(baseDir, 'src', 'pulse-ui.mjs');
  const aistudioDir = path.join(baseDir, 'public', 'assets', 'aistudio');

  if (!fs.existsSync(pinDetailsPath)) {
    assert(false, `src/pin-details-ui.mjs exists at ${pinDetailsPath}`);
    return { passed, failed, failures };
  }

  const pinDetailsSubdir = path.join(baseDir, 'src', 'ui', 'pin-details');
  const pinDetailsFiles = [pinDetailsPath];
  if (fs.existsSync(pinDetailsSubdir)) {
    for (const f of fs.readdirSync(pinDetailsSubdir).filter(n => n.endsWith('.mjs'))) {
      pinDetailsFiles.push(path.join(pinDetailsSubdir, f));
    }
  }
  const pinDetailsContent = pinDetailsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

  // 1. Check computeChartPoints filters leading 0-save days prior to first hydration day
  console.log('[Check 1] computeChartPoints leading 0-save filtering:');
  const hasLeadingFilter = /snaps\s*=\s*snaps\.filter|snaps\.slice|firstPositiveIdx|firstHydrated|firstNonZero|find(?:Index)?\([^)]*save_count\s*>\s*0\)/i.test(pinDetailsContent) ||
    /exclude leading zero-save/i.test(pinDetailsContent) ||
    /firstIndexWithSaves|firstHydrationIndex/i.test(pinDetailsContent);
  assert(hasLeadingFilter, 'computeChartPoints() filters leading 0-save days prior to first hydration day');

  // 2. Check isHydrationJump condition (prevSaves <= 0 && currSaves > 0)
  console.log('\n[Check 2] isHydrationJump condition:');
  const hasCorrectHydrationJump = /prevSaves\s*<=\s*0\s*&&\s*currSaves\s*>\s*0/.test(pinDetailsContent) ||
    /prevSaves\s*===\s*0\s*&&\s*currSaves\s*>\s*0/.test(pinDetailsContent);
  assert(hasCorrectHydrationJump, 'isHydrationJump() contains `prevSaves <= 0 && currSaves > 0` condition');

  // 3. Check format24hSaveDelta renders '0 today (Hydrated Baseline)'
  console.log('\n[Check 3] format24hSaveDelta hydrated baseline rendering:');
  const hasHydratedBaselineText = pinDetailsContent.includes('0 today (Hydrated Baseline)');
  assert(hasHydratedBaselineText, "format24hSaveDelta() renders '0 today (Hydrated Baseline)' when delta === null");

  const hasOldAmortizedFallback = /delta\s*===\s*null[\s\S]{1,300}Amortized/.test(pinDetailsContent);
  assert(!hasOldAmortizedFallback, "format24hSaveDelta() does NOT show '(Amortized)' for null delta hydrated baseline");

  // 4. Check TOTAL ENGAGEMENT card reactions rendering
  console.log('\n[Check 4] TOTAL ENGAGEMENT reactions rendering:');
  const totalEngagementIdx = pinDetailsContent.indexOf('Total Engagement');
  const totalSharesIdx = totalEngagementIdx !== -1 ? pinDetailsContent.indexOf('totalShares', totalEngagementIdx) : -1;
  const totalEngagementSection = (totalEngagementIdx !== -1 && totalSharesIdx !== -1)
    ? pinDetailsContent.slice(totalEngagementIdx, totalSharesIdx + 50)
    : '';
  const hasReactionsInCard = /totalReactions|reactions/i.test(totalEngagementSection);
  assert(hasReactionsInCard, 'TOTAL ENGAGEMENT card renders reactions count alongside comments and shares');

  // 5. Check is_canonical_root detection & styling
  console.log('\n[Check 5] Canonical Root detection:');
  const hasCanonicalRoot = /is_canonical_root|canonical_pin_id\s*!==\s*pinId|canonical_pin_id\s*===\s*pinId/i.test(pinDetailsContent);
  assert(hasCanonicalRoot, 'Canonical pin badge checks authentic canonical root status');

  // 6. Check pulse-ui.mjs retry resiliency
  console.log('\n[Check 6] pulse-ui.mjs retry resiliency:');
  if (fs.existsSync(pulseUiPath)) {
    const pulseContent = fs.readFileSync(pulseUiPath, 'utf8');
    // Check if retry logic specifically catches network/timeout errors or retries with fresh signal/attempt loop
    const hasRetryLoop = /(?:for\s*\(\s*(?:var|let)\s*attempt|while\s*\(\s*attempt|retryAttempt|maxRetries)/i.test(pulseContent) ||
      /try\s*\{[\s\S]{1,250}fetch[\s\S]{1,250}\}\s*catch[\s\S]{1,350}(?:retry|fetchPulseData)/i.test(pulseContent);
    const retriesNetworkAndTimeout = hasRetryLoop || /fetchWithRetry|retryFetch/i.test(pulseContent);
    assert(retriesNetworkAndTimeout, 'pulse-ui.mjs contains retry loop/helper handling network errors and timeouts');
  } else {
    assert(false, 'src/pulse-ui.mjs exists');
  }

  // 7. Check obsolete assets in public/assets/aistudio/
  console.log('\n[Check 7] public/assets/aistudio/ asset cleanup:');
  if (fs.existsSync(aistudioDir)) {
    const files = fs.readdirSync(aistudioDir);
    const pngFiles = files.filter(f => f.endsWith('.png'));
    const totalSize = files.reduce((acc, f) => {
      try { return acc + fs.statSync(path.join(aistudioDir, f)).size; } catch (_) { return acc; }
    }, 0);
    const sizeMb = (totalSize / (1024 * 1024)).toFixed(1);
    console.log(`  Current aistudio directory size: ${sizeMb} MB (${pngFiles.length} PNGs, ${files.length} total files)`);
    assert(files.length === 0 || totalSize < 1024 * 1024, `public/assets/aistudio/ is cleaned up (size < 1MB, currently ${sizeMb} MB)`);
  } else {
    assert(true, 'public/assets/aistudio/ directory removed or empty');
  }

  console.log(`\nAudit Results: ${passed} Passed, ${failed} Failed`);
  return { passed, failed, failures };
}

if (process.argv[1] && process.argv[1].endsWith('test_ui_v6_verification.mjs')) {
  const result = runUiVerification();
  process.exit(result.failed > 0 ? 1 : 0);
}
