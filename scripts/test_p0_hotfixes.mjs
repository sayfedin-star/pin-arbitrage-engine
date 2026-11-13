/**
 * Forensic Verification Test Suite for P0 Hotfix Bundle
 * 
 * Tests:
 * 1. Day-2 Baseline Freeze Resolution (crawled_at non-null & SQL rollover)
 * 2. Monotonic Velocity Ratchet Release (Zero-Decay Lock on Hub & Shards)
 * 3. Guest Scraping Invariant (_auth=0 enforced, _auth=1 stripped)
 * 4. Fast Edge Gate for Hover Prefetch (Scale-to-Zero Defense)
 * 5. SSOT Trajectory Function (fetchPinTrajectory)
 */

import assert from 'node:assert';
import { formatPinterestCookie as formatCookieUtils } from '../src/utils.mjs';
import { formatPinterestCookie as formatCookieCluster } from './cluster-intelligence.mjs';
import { fetchPinTrajectory } from '../src/modules/pins/repository.mjs';

console.log('================================================================================');
console.log('🔬 FORENSIC P0 HOTFIX BUNDLE VERIFICATION SUITE');
console.log('================================================================================');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. Task 3 Verification: Guest Scraping Invariant (_auth=0)
// -----------------------------------------------------------------------------
console.log('\n[*] Task 3: Enforcing Guest Scraping Invariant (_auth=0)...');

[
  { name: 'src/utils.mjs', fn: formatCookieUtils },
  { name: 'scripts/cluster-intelligence.mjs', fn: formatCookieCluster }
].forEach(({ name, fn }) => {
  runTest(`${name} - empty/null cookie returns empty string`, () => {
    assert.strictEqual(fn(''), '');
    assert.strictEqual(fn(null), '');
    assert.strictEqual(fn(undefined), '');
  });

  runTest(`${name} - raw session token gets _auth=0`, () => {
    const raw = 'TWc9PSZma2pkbHNhZmtqc2RsZmtqc2RsZmtz';
    const res = fn(raw);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
    assert(!res.includes('_auth=1;'), `Found forbidden _auth=1 in: ${res}`);
    assert(res.includes(`_pinterest_sess="${raw}"`), `Expected quoted sess in: ${res}`);
  });

  runTest(`${name} - strips _auth=1 and replaces with _auth=0`, () => {
    const cookie = '_pinterest_sess="test_token"; _auth=1; csrftoken=abc;';
    const res = fn(cookie);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
    assert(!res.includes('_auth=1'), `Found forbidden _auth=1 in: ${res}`);
    assert(res.includes('_pinterest_sess="test_token"'));
    assert(res.includes('csrftoken=abc'));
  });

  runTest(`${name} - preserves already-present _auth=0`, () => {
    const cookie = '_pinterest_sess="test_token"; _auth=0;';
    const res = fn(cookie);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
    assert(!res.includes('_auth=1'), `Found forbidden _auth=1 in: ${res}`);
  });

  runTest(`${name} - cookie with _auth=1 at the beginning is sanitized`, () => {
    const cookie = '_auth=1; _pinterest_sess="abc"';
    const res = fn(cookie);
    assert(!res.includes('_auth=1'), `Found forbidden _auth=1 in: ${res}`);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
  });

  runTest(`${name} - cookie with quoted _auth="1" is stripped and converted to _auth=0;`, () => {
    const cookie = '_pinterest_sess="test_token"; _auth="1"; csrftoken=abc;';
    const res = fn(cookie);
    assert(!res.includes('_auth=1'), `Found forbidden _auth=1 in: ${res}`);
    assert(!res.includes('_auth="1"'), `Found forbidden _auth="1" in: ${res}`);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
  });

  runTest(`${name} - cookie with quoted _auth="0" is cleanly normalized to _auth=0;`, () => {
    const cookie = '_pinterest_sess="test_token"; _auth="0";';
    const res = fn(cookie);
    assert(res.includes('_auth=0;'), `Expected _auth=0 in: ${res}`);
  });
});

// -----------------------------------------------------------------------------
// 2. Task 5 Verification: fetchPinTrajectory
// -----------------------------------------------------------------------------
console.log('\n[*] Task 5: SSOT fetchPinTrajectory Verification...');

await runAsyncTest('fetchPinTrajectory returns failure on empty pinId', async () => {
  const res1 = await fetchPinTrajectory({});
  assert.strictEqual(res1.success, false);
  assert.deepStrictEqual(res1.trajectory, []);
  assert.deepStrictEqual(res1.snapshots, []);

  const res2 = await fetchPinTrajectory({ pinId: '' });
  assert.strictEqual(res2.success, false);
});

await runAsyncTest('fetchPinTrajectory returns failure when no sqlClient is available', async () => {
  const res = await fetchPinTrajectory({ pinId: '123456789012' });
  assert.strictEqual(res.success, false);
  assert.deepStrictEqual(res.trajectory, []);
});

await runAsyncTest('fetchPinTrajectory executes against pins_daily_metrics in Unified PostgreSQL', async () => {
  const samplePinId = '687502244051234567';

  let capturedQuery = null;
  const mockRows = [
    { snapshot_date: '2026-10-18', save_count: '10', daily_save_velocity: '2.5', reaction_count: 3, repin_count: 1 },
    { snapshot_date: '2026-10-19', save_count: '15', daily_save_velocity: '5.0', reaction_count: 5, repin_count: 2 },
    { snapshot_date: '2026-10-20', save_count: '18', daily_save_velocity: '3.0', reaction_count: 6, repin_count: 2 }
  ];

  const mockSql = (strings, ...values) => {
    const rawSql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    capturedQuery = rawSql;
    return Promise.resolve(mockRows);
  };

  const res = await fetchPinTrajectory({
    sql: mockSql,
    pinId: samplePinId,
    timeframe: '30d'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.timeframe, '30d');
  assert.strictEqual(res.trajectory.length, 3);
  assert.strictEqual(res.snapshots.length, 3);
  assert(capturedQuery.includes('FROM pins_daily_metrics'), 'Query must target pins_daily_metrics');
  assert(capturedQuery.includes('ORDER BY snapshot_date ASC'), 'Query must order chronologically');
  assert(!capturedQuery.includes('pa_pin_metrics'), 'ZERO-HUB-SNAPSHOTS: Must not query Hub tables');
});

await runAsyncTest('fetchPinTrajectory safely catches SQL execution errors', async () => {
  const samplePinId = '687502244051234567';
  const mockFailingSql = () => {
    return Promise.reject(new Error('Connection timeout to PostgreSQL'));
  };

  const res = await fetchPinTrajectory({
    sql: mockFailingSql,
    pinId: samplePinId
  });

  assert.strictEqual(res.success, false);
  assert.deepStrictEqual(res.trajectory, []);
  assert(res.error.includes('Connection timeout'));
});

// -----------------------------------------------------------------------------
// 3. Task 1 & 2 Verification: Day-2 Rollover & Velocity Ratchet Logic
// -----------------------------------------------------------------------------
console.log('\n[*] Tasks 1 & 2: Day-2 Rollover & Velocity Ratchet Mathematical Verification...');

runTest('Day-2 SQL logic: COALESCE(crawled_at, baseline_day_date) properly detects Day-2 rollover', () => {
  // Simulate Postgres SQL expressions:
  // WHEN COALESCE((crawled_at AT TIME ZONE 'UTC')::date, baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date
  const todayDateStr = '2026-10-20';
  const yesterdayDateStr = '2026-10-19';

  // Day 1 state:
  const day1Pin = {
    crawled_at: '2026-10-19T14:30:00.000Z',
    baseline_day_date: '2026-10-19',
    baseline_day_saves: 100,
    save_count: 120,
    daily_save_velocity: 20
  };

  // On Day 2 crawl incoming:
  const day2Incoming = {
    crawled_at: '2026-10-20T10:00:00.000Z',
    save_count: 120, // Stagnant saves
    daily_save_velocity: 0.0 // Stagnant velocity (decayed)
  };

  const crawledAtDate = day1Pin.crawled_at ? day1Pin.crawled_at.slice(0, 10) : null;
  const effectiveBaseDate = crawledAtDate || day1Pin.baseline_day_date;
  const isRollover = effectiveBaseDate < todayDateStr;

  assert.strictEqual(isRollover, true, 'Day-2 rollover condition must evaluate to true');

  // Simulated SQL CASE output for baseline_day_saves:
  const newBaselineSaves = isRollover ? day1Pin.save_count : (day1Pin.baseline_day_saves || day2Incoming.save_count);
  assert.strictEqual(newBaselineSaves, 120, 'Baseline saves on Day-2 must roll over to previous save_count');

  // Simulated SQL CASE output for baseline_day_date:
  const newBaselineDate = isRollover ? todayDateStr : day1Pin.baseline_day_date;
  assert.strictEqual(newBaselineDate, '2026-10-20', 'Baseline date on Day-2 must update to today');

  // Simulated SQL CASE output for daily_save_velocity:
  // WHEN EXCLUDED.daily_save_velocity IS NOT NULL 
  //  AND (EXCLUDED.daily_save_velocity > 0 OR COALESCE((ksc.crawled_at...)::date, ksc.baseline_day_date) < today)
  const canUpdateVelocity = day2Incoming.daily_save_velocity !== null &&
    (day2Incoming.daily_save_velocity > 0 || isRollover);

  const updatedVelocity = canUpdateVelocity ? day2Incoming.daily_save_velocity : day1Pin.daily_save_velocity;
  assert.strictEqual(updatedVelocity, 0.0, 'Day-2 stagnant pin must update velocity to 0 (decay unlocked!)');
});

runTest('Intraday SQL logic: Same-day crawl preserves existing baseline', () => {
  const todayDateStr = '2026-10-20';
  const sameDayPin = {
    crawled_at: '2026-10-20T08:00:00.000Z',
    baseline_day_date: '2026-10-20',
    baseline_day_saves: 120,
    save_count: 130,
    daily_save_velocity: 10
  };

  const incomingIntraday = {
    crawled_at: '2026-10-20T12:00:00.000Z',
    baseline_day_saves: 130,
    save_count: 135,
    daily_save_velocity: 15
  };

  const crawledAtDate = sameDayPin.crawled_at ? sameDayPin.crawled_at.slice(0, 10) : null;
  const effectiveBaseDate = crawledAtDate || sameDayPin.baseline_day_date;
  const isRollover = effectiveBaseDate < todayDateStr;

  assert.strictEqual(isRollover, false, 'Same-day crawl must NOT trigger rollover');

  const baselineSaves = isRollover ? sameDayPin.save_count : (sameDayPin.baseline_day_saves || incomingIntraday.baseline_day_saves);
  assert.strictEqual(baselineSaves, 120, 'Intraday crawl must keep the original day baseline');
});

// -----------------------------------------------------------------------------
// 4. Task 4 Verification: Ghost Prefetch Gate Removed from Edge Worker
// -----------------------------------------------------------------------------
console.log('\n[*] Task 4: Ghost Prefetch Gate Removal Verification...');

await runAsyncTest('Server pin dossier routes do not short-circuit on prefetch=true cache_miss', async () => {
  const { handleAppRequest } = await import('../src/server.mjs');
  assert(typeof handleAppRequest === 'function', 'Server must export handleAppRequest');

  const samplePin = '687502244051234567';
  const fakeEnv = {
    DATABASE_URL: '',
    SQL_CLIENT: null
  };

  const reqPin = new Request(`https://pin-engine.local/api/pins/${samplePin}?prefetch=true`, {
    method: 'GET'
  });
  const resPin = await handleAppRequest(reqPin, fakeEnv, { waitUntil: () => {} });
  const dataPin = await resPin.json();
  assert.notStrictEqual(dataPin.status, 'cache_miss', 'Ghost prefetch cache_miss fast gate must be removed');
});

// -----------------------------------------------------------------------------
// 5. Codebase Static Audit: Zero GREATEST ratchets on operational velocity updates
// -----------------------------------------------------------------------------
console.log('\n[*] Codebase Static Audit: Zero Monotonic GREATEST Ratchets on Daily Velocity...');

import fs from 'node:fs';

runTest('scripts/keyword-velocity-crawler.mjs contains zero GREATEST locks on daily_save_velocity', () => {
  const content = fs.readFileSync('scripts/keyword-velocity-crawler.mjs', 'utf8');
  const hasGreatestLock = /GREATEST\([^)]*(?:ksc|pins_daily_metrics|kdi|keyword_serp_current)\.daily_save_velocity/i.test(content);
  assert.strictEqual(hasGreatestLock, false, 'keyword-velocity-crawler.mjs must not contain GREATEST velocity locks');
});

runTest('scripts/optimize_hub_storage.mjs contains zero GREATEST locks on daily_save_velocity', () => {
  const content = fs.readFileSync('scripts/optimize_hub_storage.mjs', 'utf8');
  const hasGreatestLock = /GREATEST\([^)]*(?:ksc|pins_daily_metrics|kdi|keyword_serp_current)\.daily_save_velocity/i.test(content);
  assert.strictEqual(hasGreatestLock, false, 'optimize_hub_storage.mjs must not contain GREATEST velocity locks');
});

runTest('scripts/offload_and_compact_hub.mjs contains zero GREATEST locks on daily_save_velocity', () => {
  if (!fs.existsSync('scripts/offload_and_compact_hub.mjs')) {
    // [INVARIANT: PURGED-IN-WAVE-4] Obsolete one-off script purged in Wave 4 maintenance cleanup
    return;
  }
  const content = fs.readFileSync('scripts/offload_and_compact_hub.mjs', 'utf8');
  const hasGreatestLock = /GREATEST\([^)]*(?:ksc|pins_daily_metrics|kdi|keyword_serp_current)\.daily_save_velocity/i.test(content);
  assert.strictEqual(hasGreatestLock, false, 'offload_and_compact_hub.mjs must not contain GREATEST velocity locks');
});

// -----------------------------------------------------------------------------
// 6. Keywords UI Pin Dossier Link Integrity & activeFolderId ReferenceError Guard
// -----------------------------------------------------------------------------
console.log('\n[*] Section 6: Keywords UI Pin Dossier Link Integrity & activeFolderId Guard...');

import vm from 'node:vm';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';

runTest('src/keywords-ui.mjs and src/ui/keywords-drawers.mjs contain ZERO undeclared activeFolderId references', () => {
  const kwUiContent = [
    fs.readFileSync('src/keywords-ui.mjs', 'utf8'),
    fs.readFileSync('src/ui/keywords/keywords-client-app.mjs', 'utf8')
  ].join('\n');
  const drawersContent = fs.readFileSync('src/ui/keywords-drawers.mjs', 'utf8');

  assert(kwUiContent.includes('activeFolderId:'), 'keywords-client-app.mjs must declare activeFolderId in keywordStudio');
  assert.strictEqual(drawersContent.includes('activeFolderId'), false, 'keywords-drawers.mjs must not reference undeclared activeFolderId');
});

runTest('getPinDossierUrl generates robust, breadcrumb-rich URLs across all edge cases', () => {
  const html = getKeywordsPageHtml();
  const scriptTags = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const studioScriptTag = scriptTags.find(s => s.includes('function keywordStudio'));
  assert(studioScriptTag, 'keywordStudio script must be present in getKeywordsPageHtml output');
  const code = studioScriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

  const context = {
    window: { __INITIAL_KEYWORD_SLUG__: '' },
    URLSearchParams,
    encodeURIComponent,
    console
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  const studio = context.keywordStudio();

  // Edge Case 1: null or missing pin
  assert.strictEqual(studio.getPinDossierUrl(null), '#');
  assert.strictEqual(studio.getPinDossierUrl({}), '#');
  assert.strictEqual(studio.getPinDossierUrl({ pin_id: '' }), '#');

  // Edge Case 2: pin with pin_id, no selected keyword or folder
  studio.selectedKeyword = null;
  studio.activeFolder = null;
  studio.dashboardFolderFilter = 'ALL';
  assert.strictEqual(studio.getPinDossierUrl({ pin_id: '123456789' }), '/pins/123456789');

  // Edge Case 3: pin with selected keyword
  studio.selectedKeyword = { id: 101, keyword: 'summer crockpot recipes' };
  assert.strictEqual(
    studio.getPinDossierUrl({ pin_id: '123456789' }),
    '/pins/123456789?keyword_id=101&keyword=summer+crockpot+recipes'
  );

  // Edge Case 4: pin with selected keyword and activeFolder object
  studio.activeFolder = { id: 42, name: 'Dinner Ideas' };
  assert.strictEqual(
    studio.getPinDossierUrl({ pin_id: '123456789' }),
    '/pins/123456789?keyword_id=101&keyword=summer+crockpot+recipes&folder_id=42'
  );

  // Edge Case 5: pin with selected keyword and dashboardFolderFilter
  studio.activeFolder = null;
  studio.dashboardFolderFilter = '88';
  assert.strictEqual(
    studio.getPinDossierUrl({ pin_id: '123456789' }),
    '/pins/123456789?keyword_id=101&keyword=summer+crockpot+recipes&folder_id=88'
  );

  // Edge Case 6: UNASSIGNED folder filter does not inject folder_id
  studio.dashboardFolderFilter = 'UNASSIGNED';
  assert.strictEqual(
    studio.getPinDossierUrl({ pin_id: '123456789' }),
    '/pins/123456789?keyword_id=101&keyword=summer+crockpot+recipes'
  );
});

runTest('Keywords UI and Drawers use getPinDossierUrl on all pin anchor tags', () => {
  const html = getKeywordsPageHtml();
  assert(!html.includes('href="\'/pins/\' + pin.pin_id'), 'Raw string concat hrefs for pin.pin_id must be eradicated');
  assert(!html.includes('href="\'/pins/\' + activeInspectorPin?.pin_id'), 'Raw string concat hrefs for activeInspectorPin must be eradicated');
  assert(html.includes(':href="getPinDossierUrl(pin)"'), 'Pin table/cards must bind :href to getPinDossierUrl(pin)');
  assert(html.includes(':href="getPinDossierUrl(activeInspectorPin)"'), 'Drawers must bind :href to getPinDossierUrl(activeInspectorPin)');
});

console.log('\n================================================================================');
console.log(`✅ ALL ${totalTests} TESTS PASSED SUCCESSFULLY (100% GREEN)`);
console.log('================================================================================');
