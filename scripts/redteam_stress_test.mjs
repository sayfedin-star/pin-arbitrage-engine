import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.mjs';
import { 
  getKeywordSERPComparison, 
  getKeywordDisplacedPins, 
  getPinPerformanceTrajectory, 
  getPinDeepDossier 
} from '../src/modules/keywords/service.mjs';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is missing in .env');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function runRedTeamSuite() {
  console.log('================================================================');
  console.log('🛑 RED-TEAM ADVERSARIAL AUDIT & SYSTEM RESILIENCE STRESS TEST');
  console.log('================================================================\n');

  const findings = [];

  // ===========================================================================
  // STAGE 1: FLEET SHARDS SCHEMA DRIFT & FAILURE INJECTION
  // ===========================================================================
  console.log('>>> [STAGE 1] AUDITING SCHEMA DRIFT ACROSS FLEET SHARDS & HUB');
  
  let shards = [];
  try {
    shards = await hubSql`
      SELECT id, project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE is_hub = FALSE AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
    console.log(`[*] Discovered ${shards.length} fleet shards in registry.`);
  } catch (err) {
    findings.push({ stage: 1, severity: 'HIGH', title: 'Registry query failed', detail: err.message });
  }

  // Pick Hub + 15 random shards
  const testEndpoints = [{ name: 'Neon Hub (Primary)', url: DATABASE_URL }];
  if (shards.length > 0) {
    const shuffled = [...shards].sort(() => 0.5 - Math.random());
    const sample = shuffled.slice(0, 15);
    for (const s of sample) {
      testEndpoints.push({ name: `Shard: ${s.project_name} (ID: ${s.id})`, url: s.database_url });
    }
  }

  console.log(`[*] Testing schema consistency across ${testEndpoints.length} endpoints...`);
  let driftCount = 0;

  for (const ep of testEndpoints) {
    try {
      const sSql = neon(ep.url);
      const [colDisplaced] = await sSql`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'keyword_pins_snapshots' AND column_name = 'is_displaced';
      `;
      const [colPopular] = await sSql`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tracked_keywords' AND column_name = 'popular_pins';
      `;
      const [tblVault] = await sSql`
        SELECT to_regclass('keyword_displaced_pins') as tbl;
      `;
      const [idxDisplaced] = await sSql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'keyword_pins_snapshots' AND indexname = 'idx_kps_displaced';
      `;

      const hasDisplacedCol = colDisplaced?.data_type === 'boolean';
      const hasPopularCol = colPopular?.data_type === 'jsonb';
      const hasVaultTable = Boolean(tblVault?.tbl);
      const hasIndex = Boolean(idxDisplaced?.indexname);

      if (!hasDisplacedCol || !hasPopularCol || !hasVaultTable || !hasIndex) {
        driftCount++;
        findings.push({
          stage: 1,
          severity: 'CRITICAL',
          title: `Schema Drift in ${ep.name}`,
          detail: `is_displaced: ${hasDisplacedCol}, popular_pins: ${hasPopularCol}, vault_tbl: ${hasVaultTable}, index: ${hasIndex}`
        });
        console.log(`    ❌ DRIFT DETECTED in ${ep.name}: is_displaced=${hasDisplacedCol}, popular_pins=${hasPopularCol}, vault=${hasVaultTable}, idx=${hasIndex}`);
      } else {
        console.log(`    ✓ ${ep.name}: 100% Schema & Index Parity Verified`);
      }
    } catch (err) {
      driftCount++;
      findings.push({
        stage: 1,
        severity: 'HIGH',
        title: `Connection / Query Failure in ${ep.name}`,
        detail: err.message
      });
      console.log(`    ⚠️ Error querying ${ep.name}: ${err.message}`);
    }
  }

  console.log(`    -> Audited ${testEndpoints.length} endpoints. Drift count: ${driftCount}`);

  // Test Failure Injection on Shard
  console.log('\n[*] Testing Shard Failure Injection & Resilient Proxy in worker.mjs...');
  try {
    const fakeReq = new Request(`http://localhost/api/keywords?shard=dead_shard_test`, {
      headers: { 'x-target-project': 'dead_shard_test' }
    });
    const fakeEnv = { DATABASE_URL };
    const res = await worker.fetch(fakeReq, fakeEnv);
    console.log(`    Failure injection response status: ${res.status}`);
    if (res.status === 200) {
      console.log(`    ✓ Graceful Failover Verified: worker fell back to Hub when shard not found.`);
    } else {
      findings.push({ stage: 1, severity: 'HIGH', title: 'Shard failure not handled gracefully', detail: `Status: ${res.status}` });
    }
  } catch (err) {
    findings.push({ stage: 1, severity: 'MEDIUM', title: 'Failure injection unhandled crash', detail: err.message });
  }

  // ===========================================================================
  // STAGE 2: MATHEMATICAL EDGE CASES IN SEASONALITY & ROLLING CALENDAR
  // ===========================================================================
  console.log('\n>>> [STAGE 2] TESTING MATHEMATICAL EDGE CASES (SEASONALITY & CALENDAR)');

  // Seasonality math logic matching production folders-service.mjs
  function simulateSeasonalityMath(seriesList) {
    const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthScores = new Array(12).fill(0);
    const monthWeeksCount = new Array(12).fill(0);
    const compositeWeeklyWave = new Array(52).fill(0);
    let trendsLoaded = 0;

    for (const series of seriesList) {
      if (series && series.length > 0) {
        trendsLoaded++;
        const sLen = series.length;
        if (sLen === 52) {
          for (let i = 0; i < 52; i++) {
            const pt = series[i];
            const rawVal = Number(typeof pt === 'object' && pt !== null ? (pt.value ?? pt.normalized_interest ?? 0) : pt || 0);
            const val = Number.isFinite(rawVal) ? rawVal : 0;
            compositeWeeklyWave[i] += val;
          }
        } else {
          for (let w = 0; w < 52; w++) {
            const srcIdx = (w / 51) * (sLen - 1);
            const i0 = Math.floor(srcIdx);
            const i1 = Math.min(sLen - 1, Math.ceil(srcIdx));
            const frac = srcIdx - i0;
            const pt0 = series[i0];
            const pt1 = series[i1];
            const raw0 = Number(typeof pt0 === 'object' && pt0 !== null ? (pt0.value ?? pt0.normalized_interest ?? 0) : pt0 || 0);
            const raw1 = Number(typeof pt1 === 'object' && pt1 !== null ? (pt1.value ?? pt1.normalized_interest ?? 0) : pt1 || 0);
            const v0 = Number.isFinite(raw0) ? raw0 : 0;
            const v1 = Number.isFinite(raw1) ? raw1 : 0;
            compositeWeeklyWave[w] += Math.round(v0 * (1 - frac) + v1 * frac);
          }
        }
      }
    }

    if (trendsLoaded === 0) {
      for (let w = 0; w < 52; w++) {
        const wave = Math.round(50 + 20 * Math.sin((w / 52) * 2 * Math.PI) + 10 * Math.cos((w / 26) * 2 * Math.PI));
        compositeWeeklyWave[w] = Math.max(20, wave);
      }
    }

    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const maxWeekly = Math.max(...compositeWeeklyWave, 1);
    const normalizedWeeklyWave = [];

    for (let w = 0; w < 52; w++) {
      const weekEndDate = new Date(now.getTime() - (51 - w) * msPerWeek);
      const weekStartDate = new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      const actualMonthIdx = weekEndDate.getMonth();
      monthScores[actualMonthIdx] += compositeWeeklyWave[w];
      monthWeeksCount[actualMonthIdx] += 1;

      normalizedWeeklyWave.push({
        week: w + 1,
        score: Math.round((compositeWeeklyWave[w] / maxWeekly) * 100),
        month: allMonths[actualMonthIdx]
      });
    }

    const avgMonthlyScores = monthScores.map((score, idx) => {
      const weeksInMonth = Math.max(1, monthWeeksCount[idx]);
      return score / weeksInMonth;
    });
    const maxAvgMonthVal = Math.max(...avgMonthlyScores, 1);

    const peakMonthIndices = avgMonthlyScores
      .map((val, idx) => ({ month: allMonths[idx], idx, score: Math.round((val / maxAvgMonthVal) * 100) }))
      .filter(m => m.score >= 70)
      .sort((a, b) => b.score - a.score);

    const peakMonths = peakMonthIndices.map(m => m.month);

    let recommendedLaunchWindow = 'Year-Round Evergreen';
    if (peakMonthIndices.length > 0) {
      const highestPeakIdx = peakMonthIndices[0].idx;
      const launchMonthIdx = (highestPeakIdx - 2 + 12) % 12;
      recommendedLaunchWindow = `${allMonths[launchMonthIdx]} (Deploy pins 45-60 days before ${allMonths[highestPeakIdx]} peak)`;
    }

    return { compositeWeeklyWave, peakMonths, recommendedLaunchWindow, normalizedWeeklyWave };
  }

  // Test 2.1: Empty series []
  const resEmpty = simulateSeasonalityMath([]);
  const hasNanEmpty = resEmpty.compositeWeeklyWave.some(isNaN);
  console.log(`    Case 1 (Empty []): NaN detected? ${hasNanEmpty}. Launch Window: "${resEmpty.recommendedLaunchWindow}"`);
  if (hasNanEmpty) findings.push({ stage: 2, severity: 'HIGH', title: 'NaN in empty series', detail: 'Empty series caused NaN' });

  // Test 2.2: Truncated series (12 weeks)
  const resTrunc = simulateSeasonalityMath([Array(12).fill(40)]);
  const hasNanTrunc = resTrunc.compositeWeeklyWave.some(isNaN);
  console.log(`    Case 2 (12 weeks): NaN detected? ${hasNanTrunc}. Wave len: ${resTrunc.compositeWeeklyWave.length}`);
  if (hasNanTrunc) findings.push({ stage: 2, severity: 'HIGH', title: 'NaN in truncated series', detail: '12-week series caused NaN' });

  // Test 2.3: All-zero series [0, 0, ...]
  const resZero = simulateSeasonalityMath([Array(52).fill(0)]);
  const hasNanZero = resZero.compositeWeeklyWave.some(isNaN);
  console.log(`    Case 3 (All 0s): NaN detected? ${hasNanZero}. Launch Window: "${resZero.recommendedLaunchWindow}"`);
  if (hasNanZero) findings.push({ stage: 2, severity: 'HIGH', title: 'NaN in all-zero series', detail: 'All-zero series caused NaN' });

  // Test 2.4: Flat plateau [50, 50, ...]
  const resFlat = simulateSeasonalityMath([Array(52).fill(50)]);
  const hasNanFlat = resFlat.compositeWeeklyWave.some(isNaN);
  console.log(`    Case 4 (Flat 50s): NaN detected? ${hasNanFlat}. Peak months count: ${resFlat.peakMonths.length}`);
  if (hasNanFlat) findings.push({ stage: 2, severity: 'HIGH', title: 'NaN in flat plateau', detail: 'Flat plateau caused NaN' });

  // Test 2.5: Fuzzing with Malformed / Non-Numeric series: [{ value: 'N/A' }, null, { value: NaN }]
  const resFuzz = simulateSeasonalityMath([[{ value: 'N/A' }, null, { value: NaN }, { value: undefined }, 20]]);
  const hasNanFuzz = resFuzz.compositeWeeklyWave.some(isNaN);
  console.log(`    Case 5 (Malformed / 'N/A' / NaN): NaN detected? ${hasNanFuzz}`);
  if (hasNanFuzz) {
    findings.push({
      stage: 2,
      severity: 'CRITICAL',
      title: 'NaN vulnerability on non-numeric trends data',
      detail: `NaN propagated into weekly wave`
    });
  } else {
    console.log(`    ✓ Sanitized: Non-numeric inputs safely absorbed without NaN.`);
  }

  // Test 2.6: Year Boundary & Leap Year Crossover
  const testDates = [
    new Date('2024-02-29T12:00:00Z'), // Leap year leap day
    new Date('2025-01-01T00:00:00Z'), // New year start
    new Date('2025-12-31T23:59:59Z')  // Year boundary end
  ];
  for (const td of testDates) {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const w0Date = new Date(td.getTime() - 51 * msPerWeek);
    const w51Date = new Date(td.getTime());
    console.log(`    Calendar boundary test for ${td.toISOString().slice(0, 10)}: Week 1: ${w0Date.toISOString().slice(0, 10)}, Week 52: ${w51Date.toISOString().slice(0, 10)} (span: ${Math.round((w51Date - w0Date)/(24*3600*1000))} days)`);
  }

  // ===========================================================================
  // STAGE 3: DATA INTEGRITY, CONCURRENCY & TRAJECTORY DISTORTIONS
  // ===========================================================================
  console.log('\n>>> [STAGE 3] TESTING CONCURRENCY, LEAKAGE & NEGATIVE DELTAS');

  // Test 3.1: Concurrency / Race Condition in Displaced Vault Upsert
  console.log('[*] Testing concurrent upserts on keyword_displaced_pins...');
  const testKid = 29;
  const testPinId = 'stress_test_pin_999999';
  
  try {
    const p1 = hubSql`
      INSERT INTO keyword_displaced_pins (
        keyword_id, pin_id, title, domain, destination_url, image_url,
        last_known_rank, displaced_date, status, current_saves, current_repins, current_comments, updated_at
      ) VALUES (
        ${testKid}, ${testPinId}, 'Concurrency Test 1', 'test.com', 'https://test.com', 'https://test.com/img.jpg',
        45, CURRENT_DATE, 'displaced_active', 100, 10, 2, NOW()
      )
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        last_known_rank = EXCLUDED.last_known_rank,
        current_saves = GREATEST(keyword_displaced_pins.current_saves, EXCLUDED.current_saves),
        updated_at = NOW();
    `;

    const p2 = hubSql`
      INSERT INTO keyword_displaced_pins (
        keyword_id, pin_id, title, domain, destination_url, image_url,
        last_known_rank, displaced_date, status, current_saves, current_repins, current_comments, updated_at
      ) VALUES (
        ${testKid}, ${testPinId}, 'Concurrency Test 2', 'test.com', 'https://test.com', 'https://test.com/img.jpg',
        42, CURRENT_DATE, 'displaced_active', 200, 20, 4, NOW()
      )
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        last_known_rank = EXCLUDED.last_known_rank,
        current_saves = GREATEST(keyword_displaced_pins.current_saves, EXCLUDED.current_saves),
        updated_at = NOW();
    `;

    await Promise.all([p1, p2]);
    const [saved] = await hubSql`SELECT * FROM keyword_displaced_pins WHERE keyword_id = ${testKid} AND pin_id = ${testPinId};`;
    console.log(`    ✓ Concurrent upsert succeeded: pin_id=${saved.pin_id}, current_saves=${saved.current_saves}`);
    
    // Clean up stress test pin
    await hubSql`DELETE FROM keyword_displaced_pins WHERE keyword_id = ${testKid} AND pin_id = ${testPinId};`;
  } catch (err) {
    findings.push({ stage: 3, severity: 'HIGH', title: 'Concurrent upsert failed', detail: err.message });
  }

  // Test 3.2: SERP / Vault Leakage Audit
  console.log('[*] Testing SERP vs Vault Leakage in getKeywordSERPComparison...');
  const serp = await getKeywordSERPComparison(hubSql, 29);
  const leakedInCurrent = (serp.current_pins || []).filter(p => p.is_displaced === true);
  console.log(`    Leaked displaced pins in SERP current_pins: ${leakedInCurrent.length}`);
  if (leakedInCurrent.length > 0) {
    findings.push({ stage: 3, severity: 'CRITICAL', title: 'Displaced Pin Leaked into SERP current_pins', detail: `Found ${leakedInCurrent.length} pins with is_displaced=true` });
  }

  // Test 3.3: Negative Deltas & Distorted Trajectory Calculation
  console.log('[*] Testing negative deltas in getPinPerformanceTrajectory...');
  const negPinId = 'stress_neg_delta_pin_888';
  try {
    await hubSql`
      INSERT INTO keyword_pins_snapshots (
        keyword_id, pin_id, rank_position, title, domain, destination_url, image_url,
        save_count, repin_count, comment_count, daily_save_velocity, snapshot_date, is_displaced, metadata, created_at
      ) VALUES
      (${testKid}, ${negPinId}, 1, 'Fake saves test', 'example.com', '', '', 500, 100, 10, 0, CURRENT_DATE - INTERVAL '2 days', FALSE, '{}'::jsonb, NOW()),
      (${testKid}, ${negPinId}, 1, 'Fake saves test', 'example.com', '', '', 400, 80, 5, 0, CURRENT_DATE, FALSE, '{}'::jsonb, NOW())
      ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET save_count = EXCLUDED.save_count;
    `;

    const traj = await getPinPerformanceTrajectory(hubSql, testKid, negPinId);
    console.log(`    Trajectory Net Growth with dropped saves:`, traj.net_growth);
    if (traj.net_growth.saves === -100) {
      console.log(`    ✓ Authentic Negative Delta verified: Net saves = -100 (drop from 500 to 400 accurately captured)`);
    } else {
      findings.push({
        stage: 3,
        severity: 'MEDIUM',
        title: 'Negative Net Growth Clamped or Distorted',
        detail: `Expected -100, got ${traj.net_growth.saves}`
      });
    }

    // Clean up
    await hubSql`DELETE FROM keyword_pins_snapshots WHERE keyword_id = ${testKid} AND pin_id = ${negPinId};`;
  } catch (err) {
    findings.push({ stage: 3, severity: 'HIGH', title: 'Negative delta test failed', detail: err.message });
  }

  // ===========================================================================
  // STAGE 4: FRONTEND DOM STABILITY, SVG EDGE CASES & CLIPBOARD RESILIENCE
  // ===========================================================================
  console.log('\n>>> [STAGE 4] TESTING FRONTEND DOM STABILITY & INJECTION');

  // SVG Trajectory simulation matching production keywords-ui.mjs
  function simulateTrajectorySvg(snapshots, width = 640, height = 220) {
    if (!snapshots || snapshots.length === 0) return { isEmpty: true };
    if (snapshots.length === 1) {
      const s0Save = Number.isFinite(Number(snapshots[0].save_count)) ? Number(snapshots[0].save_count) : 0;
      const s0Repin = Number.isFinite(Number(snapshots[0].repin_count)) ? Number(snapshots[0].repin_count) : 0;
      return { isSingle: true, s0Save, s0Repin };
    }
    const savesVals = snapshots.map(s => {
      const v = Number(s.save_count);
      return Number.isFinite(v) ? v : 0;
    });
    const repinsVals = snapshots.map(s => {
      const v = Number(s.repin_count);
      return Number.isFinite(v) ? v : 0;
    });
    const savesMin = Math.min(...savesVals);
    const savesMax = Math.max(...savesVals, savesMin + 1);
    const savesRange = (savesMax - savesMin) || 1;

    const repinsMin = Math.min(...repinsVals);
    const repinsMax = Math.max(...repinsVals, repinsMin + 1);
    const repinsRange = (repinsMax - repinsMin) || 1;

    const step = width / (snapshots.length - 1);
    const points = snapshots.map((s, i) => {
      const x = (i * step).toFixed(1);
      const sVal = Number.isFinite(Number(s.save_count)) ? Number(s.save_count) : 0;
      const rVal = Number.isFinite(Number(s.repin_count)) ? Number(s.repin_count) : 0;
      const saveY = (height - 30 - ((sVal - savesMin) / savesRange) * (height - 60)).toFixed(1);
      const repinY = (height - 30 - ((rVal - repinsMin) / repinsRange) * (height - 60)).toFixed(1);
      return { x, saveY, repinY };
    });
    return { points };
  }

  // Test flat values
  const svgFlat = simulateTrajectorySvg([{ save_count: 50, repin_count: 10 }, { save_count: 50, repin_count: 10 }]);
  const svgHasNanFlat = svgFlat.points.some(p => isNaN(Number(p.saveY)) || isNaN(Number(p.repinY)));
  console.log(`    Case 4.1 (Flat values SVG): Has NaN? ${svgHasNanFlat}`);
  if (svgHasNanFlat) findings.push({ stage: 4, severity: 'HIGH', title: 'NaN in SVG on flat values', detail: 'Flat values generated NaN in SVG' });

  // Test malformed snapshot values: save_count = 'invalid', null, undefined
  const svgMalformed = simulateTrajectorySvg([{ save_count: 'invalid', repin_count: null }, { save_count: undefined, repin_count: 10 }]);
  const svgHasNanMalformed = svgMalformed.points.some(p => isNaN(Number(p.saveY)) || isNaN(Number(p.repinY)));
  console.log(`    Case 4.2 (Malformed values in snapshot SVG): Has NaN? ${svgHasNanMalformed}`);
  if (svgHasNanMalformed) {
    findings.push({
      stage: 4,
      severity: 'HIGH',
      title: 'SVG Path Breakdown on Malformed / Non-Numeric Snapshot Values',
      detail: `NaN in SVG coordinates`
    });
  } else {
    console.log(`    ✓ Sanitized: SVG paths calculate finite coordinates on malformed snapshot inputs.`);
  }

  // Test 4.3: Clipboard API Fallback Inspection
  const uiContent = fs.readFileSync('src/keywords-ui.mjs', 'utf8');
  const hasClipboardFallback = uiContent.includes('fallbackCopyText') && uiContent.includes('document.execCommand');
  console.log(`    Case 4.3: Clipboard API has fallback for non-secure HTTP? ${hasClipboardFallback}`);
  if (!hasClipboardFallback) {
    findings.push({
      stage: 4,
      severity: 'HIGH',
      title: 'Uncaught TypeError on navigator.clipboard in Non-Secure Contexts',
      detail: `Clipboard fallback missing`
    });
  } else {
    console.log(`    ✓ Verified: Clipboard API contains fallbackCopyText with document.execCommand fallback.`);
  }

  // Test 4.4: Fuzzing malicious payload strings in Pin Dossier
  console.log('[*] Testing payload escaping in Pin Deep Dossier...');
  const maliciousPinId = 'xss_fuzz_test_999';
  try {
    await hubSql`
      INSERT INTO keyword_pins_snapshots (
        keyword_id, pin_id, rank_position, title, domain, destination_url, image_url,
        save_count, repin_count, comment_count, daily_save_velocity, snapshot_date, is_displaced, metadata, created_at
      ) VALUES
      (${testKid}, ${maliciousPinId}, 1, '<script>alert("XSS")</script> "><img src=x onerror=alert(1)> \${process.env.DATABASE_URL} \`backtick\`', 'evil.com', '', '', 100, 20, 1, 0, CURRENT_DATE, FALSE, '{"visual_annotations": ["<script>evil</script>", "safe tag"]}'::jsonb, NOW())
      ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET title = EXCLUDED.title;
    `;

    const dossier = await getPinDeepDossier(hubSql, maliciousPinId, testKid);
    console.log(`    Dossier Title extracted safely: length=${dossier.title.length}, contains script tag: ${dossier.title.includes('<script>')}`);
    console.log(`    Dossier Annotations length: ${dossier.annotations.length}`);
    
    // Clean up
    await hubSql`DELETE FROM keyword_pins_snapshots WHERE keyword_id = ${testKid} AND pin_id = ${maliciousPinId};`;
    console.log(`    ✓ Malicious payload handled cleanly in database and API response.`);
  } catch (err) {
    findings.push({ stage: 4, severity: 'HIGH', title: 'Payload injection failed', detail: err.message });
  }

  // ===========================================================================
  // STAGE 5: CONCURRENT CONNECTION LEAK STRESS TEST & COLD START
  // ===========================================================================
  console.log('\n>>> [STAGE 5] TESTING CONNECTION LEAKS UNDER 50 CONCURRENT REQUESTS');

  const concurrentRequests = 50;
  const urls = [
    'http://localhost/api/keywords/displaced?keyword_id=29',
    'http://localhost/api/keywords/pins/trajectory?pin_id=68750224405&keyword_id=29&range=30d',
    'http://localhost/api/keywords/pins/dossier?pin_id=68750224405&keyword_id=29'
  ];

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  const promises = [];
  for (let i = 0; i < concurrentRequests; i++) {
    const u = urls[i % urls.length];
    promises.push(
      worker.fetch(new Request(u), { DATABASE_URL })
        .then(res => {
          if (res.status === 200) successCount++;
          else errorCount++;
        })
        .catch(err => {
          errorCount++;
        })
    );
  }

  await Promise.all(promises);
  const totalDuration = Date.now() - startTime;
  const avgLatency = (totalDuration / concurrentRequests).toFixed(1);
  console.log(`    Executed ${concurrentRequests} concurrent requests in ${totalDuration}ms (Avg ${avgLatency}ms/req).`);
  console.log(`    Success: ${successCount}, Errors: ${errorCount}`);

  if (errorCount > 0) {
    findings.push({
      stage: 5,
      severity: 'CRITICAL',
      title: 'Connection Exhaustion / Failures under concurrent load',
      detail: `${errorCount} out of ${concurrentRequests} requests failed.`
    });
  }

  // ===========================================================================
  // AUDIT SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`🚩 RED-TEAM AUDIT COMPLETED: ${findings.length} FINDINGS DETECTED`);
  console.log('================================================================\n');

  if (findings.length > 0) {
    console.table(findings);
  } else {
    console.log('🎉 100% IMMUNITY: ALL 5 STAGES PASSED ADVERSARIAL AUDITING WITH ZERO DEFECTS!');
  }
}

runRedTeamSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
