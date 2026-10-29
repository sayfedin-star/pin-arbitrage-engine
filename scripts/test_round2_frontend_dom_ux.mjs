/**
 * Verification Test: test_round2_frontend_dom_ux.mjs
 * Validates:
 * 1. Room 5 un-nesting in src/campaign-folders-ui.mjs (x-show="activeFolderId" as ONLY x-show ancestor)
 * 2. Switch folder dropdown overflow and settings navigation in src/ui/campaign-workspace-header.mjs
 * 3. /pins/:id Timeframe selector, 7D default, 15D, dateMap delta against Day 8, hydration jump suppression, and [SERP #null] defense in src/pin-details-ui.mjs
 */

import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { renderCampaignWorkspaceHeader } from '../src/ui/campaign-workspace-header.mjs';
import { runDomNestingVerification } from './verify_dom_nesting.mjs';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('=== Running Round 2 Frontend & DOM Verification Suite ===\n');

// -------------------------------------------------------------
// Test 1: DOM Nesting in src/campaign-folders-ui.mjs
// -------------------------------------------------------------
console.log('--- Test 1: AST DOM Nesting Verification for Room 5 ---');
runDomNestingVerification();
console.log('✓ [PASS] Room 5 AST DOM Nesting verified.\n');

// -------------------------------------------------------------
// Test 2: Switch Folder Dropdown & Settings Navigation in Header
// -------------------------------------------------------------
console.log('--- Test 2: Campaign Workspace Header Structure & Actions ---');
const headerHtml = renderCampaignWorkspaceHeader({ activeRoom: 'crossover', folderId: 'folder_99' });

// 2.1 Check outer container has relative z-30 and NO overflow-hidden
assert(headerHtml.includes('relative z-30'), 'Header outer container must have relative z-30');
assert(!headerHtml.includes('rounded-2xl shadow-xs overflow-hidden flex flex-col mb-6'), 'Header outer container must NOT have overflow-hidden');
assert(headerHtml.includes('rounded-t-2xl border-b'), 'Top identity bar must have rounded-t-2xl');
assert(headerHtml.includes('rounded-b-2xl border-t'), 'Bottom tab bar must have rounded-b-2xl');

// 2.2 Check Settings button click handler
assert(headerHtml.includes("currentRoom = 'settings'"), "Settings button handler must set currentRoom = 'settings'");
assert(headerHtml.includes('/folders/folder_99/settings'), 'Settings button must target /folders/:id/settings');
console.log('✓ [PASS] Workspace Header dropdown unclipped and Settings button correctly routed.\n');

// -------------------------------------------------------------
// Test 3: /pins/:id Logic & Template Verification
// -------------------------------------------------------------
console.log('--- Test 3: /pins/:id Timeframe Selector, Delta Map, Hydration Jump & [SERP #null] Defense ---');
const pinHtml = getPinDetailPageHtml('123456789');

// 3.1 Check default chartTimeframe is '7d' and contains 15d
assert(pinHtml.includes("chartTimeframe: '7d'"), "pinDetailApp must initialize chartTimeframe to '7d'");
assert(pinHtml.includes("chartTimeframe = '15d'"), "Template must contain 15d timeframe selector");
assert(pinHtml.includes(">15D</button>"), "Template must render 15D button label");
assert(!pinHtml.includes("chartTimeframe = '14d'"), "14d timeframe must be completely replaced by 15d");

// 3.2 Check Synchronized Timeframe Selector Pill Bar in Ledger Controls Ribbon
assert(pinHtml.includes('Showing <span x-text="filteredDays().length"></span> of <span x-text="totalUnfilteredDaysCount()"></span> days'), 'Ledger ribbon must show Showing X of Y days count');

// 3.3 Extract pinDetailApp logic and test in JS environment
const appMatch = pinHtml.match(/function pinDetailApp\(pinId\)\s*\{([\s\S]*?)\n\s*\}\s*<\/script>/);
assert(appMatch, 'Must locate pinDetailApp in pin detail HTML');

const appFn = new Function('pinId', appMatch[1]);
const app = appFn('123456789');
assert(app.chartTimeframe === '7d', 'App chartTimeframe must default to 7d');

// Setup mock trajectory with 14 days
const mockSnapshots = [];
for (let i = 14; i >= 1; i--) {
  mockSnapshots.push({
    snapshot_date: `2026-10-${String(i).padStart(2, '0')}`,
    save_count: 1000 + i * 50,
    daily_save_velocity: 50.0,
    repin_count: 100,
    ranking_keywords: [
      { keyword: 'test keyword', live_serp_rank: 5, is_displaced: false },
      { keyword: 'unranked keyword', live_serp_rank: null, rank: null, is_displaced: false, vault_rank: 12 },
      { keyword: 'displaced keyword', live_serp_rank: null, is_displaced: true, vault_rank: 8 }
    ]
  });
}

app.dossier = {
  creative: {
    save_count: 1700,
    daily_save_velocity: 50.0,
    created_at_pinterest: new Date(Date.now() - 400 * 86400000).toISOString()
  },
  daily_trajectory: mockSnapshots,
  snapshots: mockSnapshots
};

app.rebuildDateMapCache();

// 3.4 Slicing behavior:
app.chartTimeframe = '7d';
assert(app.filteredDays().length === 7, `7D mode must return 7 days, got ${app.filteredDays().length}`);
assert(app.chronologicalSnapshots().length === 7, `chronologicalSnapshots in 7D mode must return 7 days, got ${app.chronologicalSnapshots().length}`);

app.chartTimeframe = '15d';
assert(app.filteredDays().length === 14, `15D mode with 14 total days must return 14 days, got ${app.filteredDays().length}`);
assert(app.chronologicalSnapshots().length === 14, `chronologicalSnapshots in 15D mode must return 14 days, got ${app.chronologicalSnapshots().length}`);

// 3.5 Day 7 delta against Day 8 in 7D mode
app.chartTimeframe = '7d';
const days7 = app.filteredDays();
const day7 = days7[6]; // 7th day in the slice
const deltaDay7 = app.formatDayDelta(day7, 6);
assert(deltaDay7 === '+50 24h', `Day 7 must compute its delta against Day 8 (+50 24h), got: ${deltaDay7}`);

// 3.6 Hydration Jump Testing
const hydrationJumpDay = {
  snapshot_date: '2026-10-15',
  save_count: 208748,
  daily_save_velocity: 12.5,
  repin_count: 500,
  is_hydration_jump: true
};
const baselineDay = {
  snapshot_date: '2026-10-14',
  save_count: 0,
  daily_save_velocity: 0,
  repin_count: 0
};

assert(app.isHydrationJump(hydrationJumpDay, baselineDay) === true, 'isHydrationJump must be true for explicit flag or 0-baseline jump');

// Test heuristic 1: prev.save_count < prev.repin_count
assert(app.isHydrationJump({ save_count: 1000, repin_count: 100 }, { save_count: 50, repin_count: 60 }) === true, 'Heuristic 1 (prev saves < prev repins) must trigger jump');

// Test heuristic 2: prev.repin_count > 0 && prev.save_count === prev.repin_count && day.save_count > day.repin_count * 1.35
assert(app.isHydrationJump({ save_count: 500, repin_count: 100 }, { save_count: 100, repin_count: 100 }) === true, 'Heuristic 2 (saves === repins baseline jump) must trigger jump');

// Test heuristic 3: prev.repin_count === 0 && day.repin_count >= 25 && day.save_count >= prev.save_count * 2.5
assert(app.isHydrationJump({ save_count: 2500, repin_count: 30 }, { save_count: 1000, repin_count: 0 }) === true, 'Heuristic 3 (first repins appearance jump) must trigger jump');

// Test heuristic 4: prev.save_count > 0 && (day.save_count / prev.save_count) >= 4.0 && (day.save_count - prev.save_count) >= 2500
assert(app.isHydrationJump({ save_count: 208748, repin_count: 500 }, { save_count: 1000, repin_count: 500 }) === true, 'Heuristic 4 (4x saves and +2500 jump) must trigger jump');

// Test formatDayDelta on hydration jump
app.dossier.daily_trajectory.unshift(hydrationJumpDay);
app.rebuildDateMapCache();
const jumpDeltaStr = app.formatDayDelta(hydrationJumpDay, 0);
assert(jumpDeltaStr === 'Hydrated Baseline', `Hydration jump row must return 'Hydrated Baseline', got: ${jumpDeltaStr}`);

// Test format24hSaveDelta and formatLive24hVelocity suppression on hydration jump
const saveDeltaStr = app.format24hSaveDelta();
assert(saveDeltaStr.includes('(Amortized)'), `format24hSaveDelta must fall back to amortized rate, got: ${saveDeltaStr}`);
assert(!saveDeltaStr.includes('+208,748 today') && !saveDeltaStr.includes('+207'), `format24hSaveDelta must not display raw +208,748 today, got: ${saveDeltaStr}`);

const liveVelStr = app.formatLive24hVelocity();
assert(liveVelStr.includes('/d') && !liveVelStr.includes('208748'), `formatLive24hVelocity must fall back to lifetime rate, got: ${liveVelStr}`);

// 3.7 Defensive Guard Against [SERP #null]
const nullRankKw = { keyword: 'bad kw', live_serp_rank: null, rank: null, is_displaced: false, vault_rank: 7 };
const displacedKw = { keyword: 'displaced kw', live_serp_rank: 4, rank: 4, is_displaced: true, vault_rank: 9 };
const validRankKw = { keyword: 'good kw', live_serp_rank: 2, rank: 2, is_displaced: false };

assert(app.isKeywordDisplacedOrUnranked(nullRankKw) === true, 'nullRankKw must be detected as displaced or unranked');
assert(app.isKeywordDisplacedOrUnranked(displacedKw) === true, 'displacedKw must be detected as displaced or unranked');
assert(app.isKeywordDisplacedOrUnranked(validRankKw) === false, 'validRankKw must be detected as ranked');

assert(app.formatKeywordRankBadge(nullRankKw) === '[Vault #7]', `nullRankKw must format as [Vault #7], got: ${app.formatKeywordRankBadge(nullRankKw)}`);
assert(app.formatKeywordRankBadge(nullRankKw, true) === '[Vault #7]', `nullRankKw accordion must format as [Vault #7], got: ${app.formatKeywordRankBadge(nullRankKw, true)}`);
assert(app.formatKeywordRankBadge(displacedKw) === '[Vault #9]', `displacedKw must format as [Vault #9], got: ${app.formatKeywordRankBadge(displacedKw)}`);
assert(app.formatKeywordRankBadge(validRankKw) === '[SERP #2]', `validRankKw must format as [SERP #2], got: ${app.formatKeywordRankBadge(validRankKw)}`);
assert(app.formatKeywordRankBadge(validRankKw, true) === '#2', `validRankKw accordion must format as #2, got: ${app.formatKeywordRankBadge(validRankKw, true)}`);

// Edge case: kw without any rank info at all
const emptyKw = { keyword: 'ghost' };
assert(app.formatKeywordRankBadge(emptyKw) === '[Vault #?]', `emptyKw must format as [Vault #?], got: ${app.formatKeywordRankBadge(emptyKw)}`);
assert(!app.formatKeywordRankBadge(emptyKw).includes('null'), 'Empty kw must never output null');

// 3.8 Strict Universal Time Formatting (Rule 31)
const caption = app.formatLifetimeVelocityCaption();
assert(caption.includes('1.1y') && !caption.includes('(400d)'), `Rule 31 check: 400 days must be formatted in years (e.g. 1.1y), got: ${caption}`);

console.log('✓ [PASS] All /pins/:id timeframe, delta, hydration jump, [SERP #null], and Rule 31 verifications passed!\n');

console.log('🎉 ALL ROUND 2 FRONTEND & DOM UX SPECIALIST TESTS PASSED 100%! 🎉');
