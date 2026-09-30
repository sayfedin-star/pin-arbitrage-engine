/**
 * Live Verification Script for P2 (Competitors & Boards) and P4 (PinArchive & Topic Intelligence)
 *
 * Runs strictly against live Neon Serverless Postgres (DATABASE_URL).
 * Tests all schema tables, lateral RPCs, monotonic triggers, and CAS concurrency logic.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getCompetitorBoards,
  getCompetitorsOverview,
  syncCompetitorPins
} from '../src/modules/competitors/service.mjs';

import {
  ingestPinsBatch,
  getPinArchiveOverview,
  getTopicClusters,
  listArchivedPins,
  stagePinsForRepurpose,
  claimStagedPinCas,
  listStagedPins,
  getQualificationRules,
  updateQualificationRules,
  qualifyPin,
  reEvaluateArchivedPins
} from '../src/modules/pinarchive/service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.resolve(__dirname, '../.env');
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
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ FATAL: DATABASE_URL is not set in environment or .env');
  process.exit(1);
}

const sql = neon(dbUrl);

console.log('🚀 Starting P2 & P4 Live Neon Serverless Integration Verification...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

async function runTests() {
  const TEST_COMPETITOR_USERNAME = 'test_verify_p2_bot';
  const TEST_PIN_ID = 'test_p4_pin_' + Date.now();
  let testCompetitorId = null;

  try {
    // ----------------------------------------------------
    // TEST SUITE 1: P2 Competitor Intelligence & Boards
    // ----------------------------------------------------
    console.log('=== TEST SUITE 1: P2 Competitor Boards & Lateral Snapshots ===');

    // 1.1 Create or fetch test competitor profile
    const [comp] = await sql`
      INSERT INTO competitor_profiles (
        username, display_name, account_type, monthly_reach, profile_views, total_pins, is_active
      ) VALUES (
        ${TEST_COMPETITOR_USERNAME}, 'Test P2 Competitor', 'competitor', 50000, 25000, 30, TRUE
      )
      ON CONFLICT (username) DO UPDATE SET
        monthly_reach = 50000,
        is_active = TRUE
      RETURNING id, username;
    `;
    testCompetitorId = comp.id;
    assert(testCompetitorId && typeof testCompetitorId === 'number', `Competitor profile created with INT id: ${testCompetitorId}`);

    // 1.2 Insert test competitor board
    await sql`
      INSERT INTO competitor_boards (
        competitor_id, board_id, name, url, pin_count, follower_count, last_pinned_at
      ) VALUES (
        ${testCompetitorId}, 'board_test_999', 'Winning Keto Dinners', 'https://pinterest.com/test/keto', 45, 1200, NOW()
      )
      ON CONFLICT (competitor_id, board_id) DO UPDATE SET
        pin_count = 45,
        follower_count = 1200,
        updated_at = NOW();
    `;

    // 1.3 Verify getCompetitorBoards service
    const boards = await getCompetitorBoards(sql, testCompetitorId);
    assert(boards.length >= 1 && boards[0].name === 'Winning Keto Dinners', 'getCompetitorBoards returned the tracked board');

    // 1.4 Test lateral snapshot RPC: get_latest_competitor_snapshots
    const lateralSnapshots = await sql`
      SELECT * FROM get_latest_competitor_snapshots(ARRAY[${testCompetitorId}]::INT[]);
    `;
    assert(Array.isArray(lateralSnapshots), 'get_latest_competitor_snapshots executed lateral query cleanly on Neon');

    // 1.5 Test board counts RPC: get_competitor_board_counts
    const boardCounts = await sql`
      SELECT * FROM get_competitor_board_counts();
    `;
    const ourBoardCount = boardCounts.find(b => Number(b.competitor_id) === testCompetitorId);
    assert(ourBoardCount && Number(ourBoardCount.board_count) >= 1, `get_competitor_board_counts returned count: ${ourBoardCount?.board_count}`);

    console.log('\n=== TEST SUITE 2: P4 PinArchive Monotonic Invariants & AI Topics ===');

    // 2.1 Ingest pin batch via ingestPinsBatch
    const mockPins = [
      {
        pin_id: TEST_PIN_ID,
        title: 'Creamy Garlic Butter Steak & Parmesan Potatoes',
        description: 'Flavor-packed 30-minute skillet dinner for busy weeknights',
        link: 'https://zizeeba.com/recipes/garlic-butter-steak',
        domain: 'zizeeba.com',
        board_name: 'Winning Keto Dinners',
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947',
        dominant_color: '#8b4513',
        saves: 500,
        repins: 250,
        comments: 35,
        share_count: 15,
        reactions: { '1': 42, '7': 8 },
        velocity: 68.4,
        annotations: ['Garlic Butter Steak', 'Keto Dinner Ideas', 'Quick Skillet Dinners']
      }
    ];

    const ingestRes = await ingestPinsBatch(sql, mockPins, TEST_COMPETITOR_USERNAME);
    assert(ingestRes.ok && ingestRes.total === 1, `ingestPinsBatch inserted test pin ${TEST_PIN_ID}`);

    // Verify pa_pins and pa_pin_metrics record
    const [insertedPin] = await sql`
      SELECT * FROM pa_pins WHERE pin_id = ${TEST_PIN_ID};
    `;
    assert(insertedPin && Number(insertedPin.saves) === 500, `pa_pins record verified with 500 saves`);

    const metricsRows = await sql`
      SELECT * FROM pa_pin_metrics WHERE pin_id = ${TEST_PIN_ID};
    `;
    assert(metricsRows.length >= 1, `pa_pin_metrics time-series snapshot recorded`);

    // 2.2 Test Monotonic Invariant Trigger (trg_pa_pins_monotonic_metrics)
    // Attempt to update with a lower saves count (e.g. 320) and a higher repins count (e.g. 400)
    await sql`
      UPDATE pa_pins
      SET saves = 320, repins = 400
      WHERE pin_id = ${TEST_PIN_ID};
    `;

    const [monotonicPin] = await sql`
      SELECT saves, repins FROM pa_pins WHERE pin_id = ${TEST_PIN_ID};
    `;
    assert(
      Number(monotonicPin.saves) === 500,
      `Monotonic Trigger GREATEST Invariant Preserved: saves remains 500 despite attempted lower update (320)`
    );
    assert(
      Number(monotonicPin.repins) === 400,
      `Monotonic Trigger updated repins upward to 400`
    );

    // 2.3 Test Topic Cluster RPC: pa_topic_clusters_page
    const clusters = await getTopicClusters(sql, { minPins: 1, search: 'Garlic Butter Steak' });
    const targetCluster = clusters.find(c => c.name.toLowerCase() === 'garlic butter steak');
    assert(
      Boolean(targetCluster && targetCluster.pins_count >= 1),
      `pa_topic_clusters_page extracted topic cluster 'Garlic Butter Steak' from JSONB annotations`
    );

    // 2.3.1 Test listArchivedPins topic filter
    const topicFilteredPins = await listArchivedPins(sql, { topic: 'Garlic Butter Steak', limit: 10 });
    assert(
      Array.isArray(topicFilteredPins) && topicFilteredPins.some(p => p.pin_id === TEST_PIN_ID),
      `listArchivedPins filtered by topic 'Garlic Butter Steak' correctly returned pin ${TEST_PIN_ID}`
    );
    const nonExistentTopicPins = await listArchivedPins(sql, { topic: 'NonExistentTopicX99', limit: 10 });
    assert(
      Array.isArray(nonExistentTopicPins) && !nonExistentTopicPins.some(p => p.pin_id === TEST_PIN_ID),
      `listArchivedPins with non-matching topic excluded pin ${TEST_PIN_ID}`
    );

    // 2.4 Test Overview RPC
    const overview = await getPinArchiveOverview(sql);
    assert(
      overview.total_pins >= 1 && overview.total_saves >= 500,
      `getPinArchiveOverview returned aggregated stats (pins: ${overview.total_pins}, saves: ${overview.total_saves})`
    );

    // 2.5 Test Staging and Atomic CAS Dispatch (pa_staged_pins)
    const stageRes = await stagePinsForRepurpose(sql, {
      pinIds: [TEST_PIN_ID],
      targetBoard: 'Keto Repurposed',
      overrideLink: 'https://zizeeba.com/viral'
    });
    assert(stageRes.ok && stageRes.stagedCount === 1, `stagePinsForRepurpose successfully staged pin in queue`);
    const stagedId = stageRes.items[0].id;

    // 2.5.1 Test duplicate staging prevention (idempotency)
    const dupStageRes = await stagePinsForRepurpose(sql, {
      pinIds: [TEST_PIN_ID],
      targetBoard: 'Keto Repurposed 2'
    });
    assert(
      dupStageRes.ok && dupStageRes.stagedCount === 0,
      `stagePinsForRepurpose idempotency verified: prevented duplicate active staging for pin ${TEST_PIN_ID}`
    );

    // 2.5.2 Test listStagedPins with status='all' and status='staged'
    const stagedAll = await listStagedPins(sql, { status: 'all' });
    assert(
      stagedAll.some(s => s.id === stagedId && s.status === 'staged'),
      `listStagedPins(status='all') retrieved staged pin without query failure`
    );

    // CAS Attempt 1: Should claim and transition status to 'dispatched'
    const cas1 = await claimStagedPinCas(sql, stagedId);
    assert(cas1.success === true && cas1.item.status === 'dispatched', `First CAS claim succeeded: status transitioned to 'dispatched'`);

    // CAS Attempt 2: Should fail gracefully with success === false (idempotent / race protected)
    const cas2 = await claimStagedPinCas(sql, stagedId);
    assert(cas2.success === false && cas2.item === null, `Second CAS claim rejected: atomic collision prevented duplicate posting`);

    // 2.5.3 Test listStagedPins with status='dispatched'
    const stagedDispatched = await listStagedPins(sql, { status: 'dispatched' });
    assert(
      stagedDispatched.some(s => s.id === stagedId && s.status === 'dispatched'),
      `listStagedPins(status='dispatched') retrieved dispatched pin`
    );

    console.log('\n=== TEST SUITE 3: Pin Qualification Rules (Anti-Bloat & Early-Stop) ===');

    // 3.1 Verify getQualificationRules returns default 3-tier rules
    const rules = await getQualificationRules(sql);
    assert(
      rules.tier1_min_saves === 100 &&
      rules.tier2_min_repins === 100 &&
      rules.tier3_max_age_days === 14 &&
      rules.tier3_min_saves === 25 &&
      rules.early_stop_pages === 3,
      `getQualificationRules returned expected defaults (T1: ≥100 saves, T2: ≥100 repins, T3: ≤14d & ≥25 saves, early_stop: 3p)`
    );

    // 3.2 Verify qualifyPin boundary logic (3 OR tiers)
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000).toISOString();

    const pinTier1 = { pin_id: 't1', saves: 100, repins: 0, created_at: thirtyDaysAgo };
    const q1 = qualifyPin(pinTier1, rules);
    assert(q1.qualified && q1.matchedTier === 'tier1', 'Pin with 100 saves qualifies under Tier 1 (High Saves)');

    const pinTier2 = { pin_id: 't2', saves: 5, repins: 100, created_at: thirtyDaysAgo };
    const q2 = qualifyPin(pinTier2, rules);
    assert(q2.qualified && q2.matchedTier === 'tier2', 'Pin with 100 repins qualifies under Tier 2 (High Repins)');

    const pinTier3 = { pin_id: 't3', saves: 25, repins: 2, created_at: tenDaysAgo };
    const q3 = qualifyPin(pinTier3, rules);
    assert(q3.qualified && q3.matchedTier === 'tier3', 'Pin 10 days old with 25 saves qualifies under Tier 3 (Fresh Breakout)');

    const pinDisqualified = { pin_id: 'td', saves: 20, repins: 15, created_at: thirtyDaysAgo };
    const qd = qualifyPin(pinDisqualified, rules);
    assert(!qd.qualified && qd.matchedTier === null, 'Pin 30 days old with 20 saves and 15 repins is DISQUALIFIED');

    // 3.2.1 Boundary: Pin with missing creation date must NOT qualify under Tier 3
    const pinUnknownDate = { pin_id: 't_unknown', saves: 25, repins: 2 };
    const qu = qualifyPin(pinUnknownDate, rules);
    assert(!qu.qualified, 'Pin with unknown creation date and 25 saves does NOT falsely qualify under Tier 3');

    // 3.3 Test updateQualificationRules and dual alias support
    const updatedRules = await updateQualificationRules(sql, { tier1_min_saves: 150, cron_enabled: true });
    assert(updatedRules.tier1_min_saves === 150 && updatedRules.cron_enabled === true, 'updateQualificationRules successfully updated tier1_min_saves to 150 and aliased cron_enabled');
    // Restore default
    await updateQualificationRules(sql, { tier1_min_saves: 100, master_ingest_enabled: true });

    // 3.4 Ingest batch with qualification filter: only qualified pins should enter pa_pins
    const TEST_QUALIFIED_PIN = 'test_p4_qual_' + Date.now();
    const TEST_UNQUALIFIED_PIN = 'test_p4_unqual_' + Date.now();
    const testBatch = [
      {
        pin_id: TEST_QUALIFIED_PIN,
        title: 'Winning Garlic Butter Steak (Qualified)',
        saves: 150,
        repins: 80,
        annotations: ['Garlic Steak', 'Keto Dinner']
      },
      {
        pin_id: TEST_UNQUALIFIED_PIN,
        title: 'Weak Potato Recipe (Disqualified)',
        saves: 10,
        repins: 5,
        created_at: thirtyDaysAgo,
        annotations: ['Potatoes']
      }
    ];

    const filterIngestRes = await ingestPinsBatch(sql, testBatch, TEST_COMPETITOR_USERNAME, { filterQualified: true });
    assert(filterIngestRes.ok && filterIngestRes.inserted === 1, 'ingestPinsBatch with filterQualified: true inserted ONLY 1 qualified pin');

    const [shouldExist] = await sql`SELECT pin_id FROM pa_pins WHERE pin_id = ${TEST_QUALIFIED_PIN};`;
    const [shouldNotExist] = await sql`SELECT pin_id FROM pa_pins WHERE pin_id = ${TEST_UNQUALIFIED_PIN};`;
    assert(Boolean(shouldExist), 'Qualified pin exists in pa_pins table');
    assert(!shouldNotExist, 'Unqualified pin was discarded and prevented database bloat');

    // 3.5 Test reEvaluateArchivedPins with rules argument
    const reEvalResult = await reEvaluateArchivedPins(sql, rules);
    assert(reEvalResult.ok && reEvalResult.total_evaluated >= 1 && reEvalResult.disqualified_count !== undefined, `reEvaluateArchivedPins evaluated ${reEvalResult.total_evaluated} pins successfully with disqualified count`);

    // 3.6 Test claimStagedPinCas by string pin_id (polymorphic claim)
    const stageQualRes = await stagePinsForRepurpose(sql, { pinIds: [TEST_QUALIFIED_PIN] });
    assert(stageQualRes.ok && stageQualRes.stagedCount === 1, 'Staged qualified pin successfully for raw pin_id claim');
    const casByPinId = await claimStagedPinCas(sql, TEST_QUALIFIED_PIN);
    assert(casByPinId.success === true && casByPinId.item.status === 'dispatched', 'claimStagedPinCas claimed pin by raw string pin_id');

    console.log('\n=== TEST SUITE 4: Cleanup ===');
    // Cleanup staged pins
    await sql`DELETE FROM pa_staged_pins WHERE pin_id IN (${TEST_PIN_ID}, ${TEST_QUALIFIED_PIN}, ${TEST_UNQUALIFIED_PIN});`;
    // Cleanup metrics
    await sql`DELETE FROM pa_pin_metrics WHERE pin_id IN (${TEST_PIN_ID}, ${TEST_QUALIFIED_PIN}, ${TEST_UNQUALIFIED_PIN});`;
    // Cleanup pa_pins
    await sql`DELETE FROM pa_pins WHERE pin_id IN (${TEST_PIN_ID}, ${TEST_QUALIFIED_PIN}, ${TEST_UNQUALIFIED_PIN});`;
    // Cleanup boards
    await sql`DELETE FROM competitor_boards WHERE competitor_id = ${testCompetitorId};`;
    // Cleanup profile
    await sql`DELETE FROM competitor_profiles WHERE id = ${testCompetitorId};`;
    console.log('  🧹 Cleaned up temporary test artifacts from Neon database.');

  } catch (err) {
    console.error('❌ Exception during verification:', err);
    failCount++;
  }

  console.log('\n========================================');
  console.log(`Verification Complete: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
