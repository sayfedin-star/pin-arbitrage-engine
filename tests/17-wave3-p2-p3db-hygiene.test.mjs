import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  getMigrationFiles,
  splitSqlStatements,
  applyMigration
} from '../scripts/migrate.mjs';
import {
  createSqlClient,
  attachTransactionBridge,
  getPoolStats,
  applyLifetimeJitter
} from '../src/db/client.mjs';
import {
  normalizePinterestCookie,
  formatPinterestCookie,
  sanitizeGuestCookie
} from '../src/utils.mjs';
import { formatAuthSessionCookie } from '../src/modules/newborn/cookie-router.mjs';
import * as pinterestBarrel from '../src/core/pinterest/index.mjs';
import * as pinterestClient from '../src/core/pinterest/client.mjs';
import {
  PINTEREST_CEILING_VALUE,
  normalizeCeilingMetric,
  sanitizeCeilingDelta,
  sanitizeStoredCeilingDelta
} from '../src/core/pinterest/index.mjs';
import {
  resolveQualificationRules,
  qualifyPin
} from '../src/modules/creators/competitors-crud.mjs';
import { ECOMMERCE_AND_SOCIAL_DOMAINS } from '../src/modules/domains/domain-constants.mjs';
import { listDomainsIntelligenceFast } from '../src/modules/domains/rollup-leaderboard-service.mjs';
import {
  getRecgptPlaybookService,
  getDiscoveryTypeaheadService
} from '../src/modules/cluster/service.mjs';
import { fetchNewbornCandidateAccounts } from '../src/modules/newborn/service.mjs';
import {
  buildPeerAnnotationCounts,
  synthesizeNewbornCrossoverBlueprint
} from '../src/modules/newborn/intelligence.mjs';
import {
  PULSE_MAX_PAYLOAD_BYTES,
  enforcePulsePayloadByteBudget,
  getGlobal24hPulseService,
  invalidateGlobalPulseCache
} from '../src/modules/pulse/service.mjs';
import {
  CRT_SH_MAX_BYTES,
  readBoundedJsonResponse,
  enrichNextUncheckedBatch
} from '../src/modules/domains/whois-age-service.mjs';
import {
  fetchKeywordRelatedInterests,
  fetchPinterestBatchVelocity
} from '../src/modules/keywords/trends-service.mjs';
import {
  enforceBatchGlobalSavesRateLimit,
  _resetBatchGlobalSavesRateLimit,
  _getBatchGlobalSavesRateStoreStats
} from '../src/routes/keywords.mjs';
import {
  startInstaBoxActivityLease,
  runFleetLifecycle
} from '../scripts/lib/fleet-runner.mjs';

function makeJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function buildSqlText(strings) {
  return Array.from(strings).join(' ? ').replace(/\s+/g, ' ').trim();
}

test('Wave 3.1: Migration 010 parses cleanly via migrate.mjs (18 transactional statements, preserves invariants)', async () => {
  const migrations = getMigrationFiles(path.resolve('scripts/migrations'));
  const mig010 = migrations.find((m) => m.version === '010');
  assert.ok(mig010, 'Migration 010 must be discovered by getMigrationFiles()');
  assert.equal(mig010.filename, '010_pg16_hot_hygiene_and_index_cleanup.sql');

  const rawSql = fs.readFileSync(mig010.filepath, 'utf8');
  const statements = splitSqlStatements(rawSql);
  assert.equal(statements.length, 18, `Expected exactly 18 SQL statements in 010, got ${statements.length}`);

  const noComments = rawSql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\bCONCURRENTLY\b/i.test(noComments), false, 'Migration 010 must be strictly transactional (no CONCURRENTLY)');

  const expectedDroppedIndexes = [
    'idx_dir_ad_network',
    'idx_dir_top10',
    'idx_newborn_keyword_clusters_updated',
    'idx_nc_last_run_id',
    'idx_candidates_saves',
    'idx_candidates_velocity',
    'idx_tracked_keywords_keyword',
    'idx_competitor_boards_comp_id',
    'idx_candidates_seed',
    'idx_capsules_seed',
    'idx_ump_is_product',
    'idx_kf_trgm_name',
    'idx_kw_folders_created',
    'idx_kw_folders_name',
    'idx_pvsc_expires'
  ];
  for (const idxName of expectedDroppedIndexes) {
    assert.match(
      noComments,
      new RegExp(`DROP\\s+INDEX\\s+IF\\s+EXISTS\\s+public\\.${idxName}\\s*;`, 'i'),
      `Migration 010 must drop public.${idxName}`
    );
  }

  // Critical invariants must NEVER be dropped or altered away
  assert.equal(/DROP\s+INDEX[^;]*idx_mv_pulse_24h_summary_id/i.test(noComments), false);
  assert.equal(/DROP\s+INDEX[^;]*idx_dir_trgm_domain/i.test(noComments), false);
  assert.equal(/fillfactor/i.test(noComments), false);

  // Per-table autovacuum tuning statements
  assert.match(
    noComments,
    /ALTER\s+TABLE\s+public\.domain_intelligence_rollup\s+SET\s*\(\s*autovacuum_vacuum_scale_factor\s*=\s*0\.05\s*,\s*autovacuum_analyze_scale_factor\s*=\s*0\.02\s*\)\s*;/i
  );
  assert.match(
    noComments,
    /ALTER\s+TABLE\s+public\.keyword_serp_positions\s+SET\s*\(\s*autovacuum_vacuum_scale_factor\s*=\s*0\.05\s*,\s*autovacuum_analyze_scale_factor\s*=\s*0\.02\s*\)\s*;/i
  );
  assert.match(
    noComments,
    /ALTER\s+TABLE\s+public\.keyword_guided_capsules\s+SET\s*\(\s*autovacuum_vacuum_scale_factor\s*=\s*0\.05\s*,\s*autovacuum_analyze_scale_factor\s*=\s*0\.05\s*\)\s*;/i
  );

  // Simulate transactional applyMigration offline
  let beginCalls = 0;
  const executed = [];
  let recordedVersion = null;
  const mockSql = Object.assign(
    async () => [],
    {
      unsafe: async (stmt) => { executed.push(stmt); return []; },
      begin: async (cb) => {
        beginCalls++;
        const tx = Object.assign(
          async (strings, ...vals) => {
            if (buildSqlText(strings).includes('INSERT INTO schema_migrations')) {
              recordedVersion = vals[0];
            }
            return [];
          },
          { unsafe: async (stmt) => { executed.push(stmt); return []; } }
        );
        return await cb(tx);
      }
    }
  );
  const res = await applyMigration(mockSql, mig010);
  assert.equal(res.success, true);
  assert.equal(res.statementsCount, 18);
  assert.equal(beginCalls, 1, 'Migration 010 must execute atomically inside a single sql.begin()');
  assert.equal(executed.length, 18);
  assert.equal(recordedVersion, '010');
});

test('Wave 3.2: db/client.mjs configures application_name, ±20% max_lifetime jitter, and accurate per-client getPoolStats()', async () => {
  // A. ±20% jitter math bounds
  assert.equal(applyLifetimeJitter(300, () => 0), 240);
  assert.equal(applyLifetimeJitter(300, () => 0.5), 300);
  assert.equal(applyLifetimeJitter(300, () => 1), 360);
  assert.equal(applyLifetimeJitter(0, () => 0.5), 0);
  assert.equal(applyLifetimeJitter(null, () => 0.5), null);
  assert.equal(applyLifetimeJitter(false, () => 0.5), false);

  // B. application_name precedence & max_lifetime function in createSqlClient
  const prevAppName = process.env.PGAPPNAME;
  const clientsToClose = [];
  try {
    process.env.PGAPPNAME = 'pae-env-worker';
    const cExplicit = createSqlClient('postgres://u:p@127.0.0.1:5432/db', {
      max: 4,
      applicationName: 'pae-custom-server',
      max_lifetime: 300,
      jitterFn: () => 0.25
    });
    clientsToClose.push(cExplicit);
    assert.equal(cExplicit.options.connection.application_name, 'pae-custom-server');
    assert.equal(typeof cExplicit.options.max_lifetime, 'function');
    assert.equal(cExplicit.options.max_lifetime(), 270);

    const cEnv = createSqlClient('postgres://u:p@127.0.0.1:5432/db', { max: 2 });
    clientsToClose.push(cEnv);
    assert.equal(cEnv.options.connection.application_name, 'pae-env-worker');
    const sampledLifetime = cEnv.options.max_lifetime();
    assert.ok(sampledLifetime >= 144 && sampledLifetime <= 360, `Expected jittered lifetime, got ${sampledLifetime}`);

    delete process.env.PGAPPNAME;
    const cDefault = createSqlClient('postgres://u:p@127.0.0.1:5432/db', { max: 2 });
    clientsToClose.push(cDefault);
    assert.equal(cDefault.options.connection.application_name, 'pae-node');
  } finally {
    if (prevAppName !== undefined) process.env.PGAPPNAME = prevAppName;
    else delete process.env.PGAPPNAME;
    for (const c of clientsToClose) {
      await c.end({ timeout: 1 }).catch(() => {});
    }
  }

  // C. Per-client getPoolStats() isolation, saturation clamping (`active` + `waiting`), `noRetry` tracking, and `end()` -> `idle: 0`
  const makeDeferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };

  const deferredsA = [];
  const rawClientA = Object.assign(
    () => {
      const d = makeDeferred();
      deferredsA.push(d);
      return d.promise;
    },
    {
      options: { max: 2 },
      unsafe: () => {
        const d = makeDeferred();
        deferredsA.push(d);
        return d.promise;
      },
      begin: async (cb) => cb(rawClientA),
      end: async () => {}
    }
  );
  const rawClientB = Object.assign(
    () => Promise.resolve([{ ok: 1 }]),
    {
      options: { max: 5 },
      unsafe: () => Promise.resolve([]),
      begin: async (cb) => cb(rawClientB),
      end: async () => {}
    }
  );

  const clientA = attachTransactionBridge(rawClientA);
  const clientB = attachTransactionBridge(rawClientB);

  // Launch 3 concurrent queries on clientA (max=2): 2 active + 1 waiting, including 1 via noRetry
  const q1 = clientA`SELECT 1`;
  const q2 = clientA.noRetry`SELECT 2`;
  const q3 = clientA.noRetry.unsafe('SELECT 3');

  // Attach .then() by awaiting in background so lazy query execution starts
  const pAll = Promise.all([q1, q2, q3]);
  await Promise.resolve();

  const statsAWhileBusy = getPoolStats(clientA);
  assert.equal(statsAWhileBusy.max, 2);
  assert.equal(statsAWhileBusy.active, 2, 'Active count must clamp at pool max');
  assert.equal(statsAWhileBusy.idle, 0);
  assert.equal(statsAWhileBusy.waiting, 1, 'Overflow queries beyond max must surface in waiting');
  assert.equal(statsAWhileBusy.total_executed, 3);

  // ClientB must be completely unaffected by ClientA's in-flight queries
  const statsB = getPoolStats(clientB);
  assert.equal(statsB.active, 0);
  assert.equal(statsB.idle, 5);
  assert.equal(statsB.waiting, 0);
  assert.equal(statsB.total_executed, 0);

  for (const d of deferredsA) d.resolve([{ ok: 1 }]);
  await pAll;

  const statsAAfterDone = getPoolStats(clientA);
  assert.equal(statsAAfterDone.active, 0);
  assert.equal(statsAAfterDone.idle, 2);
  assert.equal(statsAAfterDone.waiting, 0);
  assert.equal(statsAAfterDone.total_executed, 3);

  await clientA.end();
  const statsAAfterEnd = getPoolStats(clientA);
  assert.equal(statsAAfterEnd.idle, 0, 'Closed pool must report idle=0');
});

test('Wave 3.3: resolveQualificationRules SSOT, PINTEREST_CEILING_VALUE helpers, marketplace SSOT & cookie/header unification', async () => {
  // A. resolveQualificationRules defaults, overrides, aliases & NaN guards
  const defRules = resolveQualificationRules();
  assert.equal(defRules.tier1_min_saves, 100);
  assert.equal(defRules.tier2_min_repins, 100);
  assert.equal(defRules.tier2_min_velocity, 3.5);
  assert.equal(defRules.tier2_max_age_days, 60);
  assert.equal(defRules.tier3_max_age_days, 14);
  assert.equal(defRules.tier3_min_saves, 25);
  assert.equal(defRules.master_ingest_enabled, true);

  const aliasRules = resolveQualificationRules(
    { min_saves: 400, min_velocity: '8.5', fresh_min_saves: 'NaN', cron_enabled: false },
    { deriveTiersFromSaves: true, minVelocityFloor: 0.1 }
  );
  assert.equal(aliasRules.tier1_min_saves, 400);
  assert.equal(aliasRules.tier2_min_repins, 400, 'deriveTiersFromSaves derives tier2_min_repins from tier1_min_saves');
  assert.equal(aliasRules.tier2_min_velocity, 8.5);
  assert.equal(aliasRules.tier3_min_saves, 200, 'NaN fresh_min_saves falls back cleanly to derived tier3 saves');
  assert.equal(aliasRules.master_ingest_enabled, false);
  assert.equal(aliasRules.cron_enabled, false);

  const floorRules = resolveQualificationRules({ tier2_min_velocity: 0 }, { minVelocityFloor: 0.1 });
  assert.equal(floorRules.tier2_min_velocity, 0.1);

  assert.equal(qualifyPin({ saves: 250, repins: 5, age_days: 90, is_product: true }, { tier1_min_saves: 200 }).qualified, true);
  assert.equal(qualifyPin({ saves: 250, repins: 5, age_days: 90, is_product: true }, { tier1_min_saves: 200, articles_only: true }).qualified, false);

  // B. PINTEREST_CEILING_VALUE & helpers + zero hardcoded 10000001 literals in deduplicated modules
  assert.equal(PINTEREST_CEILING_VALUE, 10000001);
  assert.equal(normalizeCeilingMetric(10000001, 14500000), 14500000);
  assert.equal(normalizeCeilingMetric(10000001, 10000001, 12000000), 12000000);
  assert.equal(normalizeCeilingMetric(0, 82000), 82000);
  assert.equal(normalizeCeilingMetric(13000000, 14500000), 13000000);
  assert.equal(sanitizeCeilingDelta(14500000, 10000001, 14500000), 0);
  assert.equal(sanitizeCeilingDelta(14500000, 12000000, 10000001), 0);
  assert.equal(sanitizeCeilingDelta(14500000, 12000000, 14500000), 2500000);
  assert.equal(sanitizeStoredCeilingDelta(14500000, 4499999), 0);
  assert.equal(sanitizeStoredCeilingDelta(14500000, 500000), 500000);

  for (const relPath of [
    'src/modules/creators/competitors-crud.mjs',
    'src/modules/creators/creator-analytics.mjs',
    'scripts/creator-velocity-crawler.mjs',
    'scripts/creator-fleet.mjs'
  ]) {
    const src = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.equal(/\b10000001\b/.test(src), false, `Found hardcoded 10000001 literal in ${relPath}`);
  }

  // C. Marketplace/social domains SSOT in rollup-leaderboard-service.mjs
  const capturedRollupCalls = [];
  const mockRollupSql = async (strings, ...values) => {
    const q = buildSqlText(strings);
    capturedRollupCalls.push({ sql: q, values });
    if (q.includes('COUNT(*)')) return [{ total: 1, checked: 1 }];
    return [{ domain: 'example.com', total_pins: 5, _total_count: 1 }];
  };
  await listDomainsIntelligenceFast(mockRollupSql, { excludeMarketplaces: true, limit: 10 });
  const mainQuery = capturedRollupCalls.find((c) => c.sql.includes('FROM domain_intelligence_rollup r'));
  assert.ok(mainQuery, 'Expected rollup_src query');
  assert.match(mainQuery.sql, /r\.domain\s*<>\s*ALL\(\s*\?\s*::text\[\]\)/i);
  assert.equal(mainQuery.values.includes(ECOMMERCE_AND_SOCIAL_DOMAINS), true, 'Expected ECOMMERCE_AND_SOCIAL_DOMAINS bound parameter');
  const rollupSrc = fs.readFileSync(path.resolve('src/modules/domains/rollup-leaderboard-service.mjs'), 'utf8');
  assert.equal(/r\.domain\s+NOT\s+IN\s*\(/i.test(rollupSrc), false, 'Duplicate hardcoded marketplace NOT IN list must be removed');

  // D. normalizePinterestCookie unification & getPinterestHeaders removal
  assert.equal(normalizePinterestCookie(null, { authFlag: 0 }), '');
  assert.equal(normalizePinterestCookie('TWc9PSabc', { authFlag: 0 }), '_auth=0; _pinterest_sess="TWc9PSabc"');
  assert.equal(normalizePinterestCookie('TWc9PSabc', { authFlag: 1 }), '_pinterest_sess="TWc9PSabc"; _auth=1');
  assert.equal(normalizePinterestCookie('"_auth=1; _pinterest_sess=tok123; csrftoken=zz"', { authFlag: 0 }), '_auth=0; _pinterest_sess="tok123"; csrftoken=zz');
  assert.equal(normalizePinterestCookie('_auth=0; _pinterest_sess=tok123', { authFlag: 1 }), '_pinterest_sess="tok123"; _auth=1');
  assert.equal(normalizePinterestCookie('_auth=1', { authFlag: 0 }), '_auth=0');
  assert.equal(normalizePinterestCookie('_auth=0', { authFlag: 1 }), '');
  assert.equal(sanitizeGuestCookie('_auth=1; session=abc'), '_auth=0; session=abc');
  assert.equal(formatPinterestCookie('TWc9PSxyz'), '_pinterest_sess="TWc9PSxyz"; _auth=0;');
  assert.equal(formatAuthSessionCookie('TWc9PSxyz'), '_pinterest_sess="TWc9PSxyz"; _auth=1');
  assert.equal(formatAuthSessionCookie('_auth=0'), '');

  assert.equal('getPinterestHeaders' in pinterestClient, false, 'getPinterestHeaders alias must be removed from client.mjs');
  assert.equal('getPinterestHeaders' in pinterestBarrel, false, 'getPinterestHeaders alias must be removed from core/pinterest/index.mjs');
  assert.equal(typeof pinterestBarrel.getStandardPinterestHeaders, 'function');
});

test('Wave 3.4: getRecgptPlaybookService consolidates into 1 ROW_NUMBER() query & fetchNewbornCandidateAccounts batches UPDATE', async () => {
  // A. getRecgptPlaybookService (Seed bakery mode — 1 query)
  const seedQueries = [];
  const seedSql = async (strings, ...values) => {
    seedQueries.push({ sql: buildSqlText(strings), values });
    return [
      { candidate_pin_id: '101', title: 'Chocolate Cake', sequence_role: 'DESSERT_HERO', saves: 9000, seed_label: 'Chocolate Cake Ideas' },
      { candidate_pin_id: '102', title: 'Iced Latte', sequence_role: 'BEVERAGE_PAIRING', saves: 5000, seed_label: 'Chocolate Cake Ideas' },
      { candidate_pin_id: '103', title: 'Mini Croissants', sequence_role: 'PASTRY_BITES', saves: 4000, seed_label: 'Chocolate Cake Ideas' },
      { candidate_pin_id: '104', title: 'Dinner Roast', sequence_role: 'DINNER_ANCHOR', saves: 15000, seed_label: 'Chocolate Cake Ideas' }
    ];
  };
  const bakeryPlaybook = await getRecgptPlaybookService(seedSql, { seedPinId: '999001' });
  assert.equal(seedQueries.length, 1, `Expected 1 single query for seed playbook, got ${seedQueries.length}`);
  assert.match(seedQueries[0].sql, /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION\s+BY\s+cgn\.sequence_role\s+ORDER\s+BY\s+cgn\.saves\s+DESC/i);
  assert.equal(bakeryPlaybook.dinner_anchor.candidate_pin_id, '101', 'Bakery seed prioritizes DESSERT_HERO over DINNER_ANCHOR');
  assert.equal(bakeryPlaybook.navboost_co_visitor.candidate_pin_id, '102');
  assert.equal(bakeryPlaybook.session_finisher.candidate_pin_id, '103');

  // B. getRecgptPlaybookService (Global mode with missing roles — 1 query + INNER JOIN cluster_seeds + distinct fallbacks)
  const globalQueries = [];
  const globalSql = async (strings, ...values) => {
    globalQueries.push({ sql: buildSqlText(strings), values });
    return [
      { candidate_pin_id: '201', title: 'Top Pin A', sequence_role: 'DIRECT_MATCH', saves: 8000 },
      { candidate_pin_id: '202', title: 'Top Pin B', sequence_role: 'DIRECT_MATCH', saves: 6000 },
      { candidate_pin_id: '203', title: 'Top Pin C', sequence_role: 'DIRECT_MATCH', saves: 4000 }
    ];
  };
  const globalPlaybook = await getRecgptPlaybookService(globalSql, { seedPinId: null });
  assert.equal(globalQueries.length, 1, `Expected 1 single query for global playbook, got ${globalQueries.length}`);
  assert.match(globalQueries[0].sql, /INNER\s+JOIN\s+cluster_seeds\s+cs\s+ON\s+cs\.pin_id\s*=\s*cgn\.seed_pin_id/i);
  assert.deepEqual(
    [globalPlaybook.dinner_anchor.candidate_pin_id, globalPlaybook.navboost_co_visitor.candidate_pin_id, globalPlaybook.session_finisher.candidate_pin_id],
    ['201', '202', '203']
  );

  // C. fetchNewbornCandidateAccounts issues 1 single batched UPDATE ... FROM jsonb_to_recordset(...)
  const updateCalls = [];
  const nbSql = async (strings, ...values) => {
    const q = buildSqlText(strings);
    if (q.includes('FROM newborn_candidates') && q.includes('WHERE pin_id = ANY')) {
      return [
        { pin_id: '80000000000003', effective_creator_username: 'alice', repin_count: 150, save_count: 200, age_days: 5 },
        { pin_id: '80000000000001', effective_creator_username: 'bob', repin_count: 220, save_count: 350, age_days: 4 },
        { pin_id: '80000000000002', effective_creator_username: 'alice', repin_count: 180, save_count: 280, age_days: 6 }
      ];
    }
    if (q.includes('FROM app_settings')) return [];
    if (/UPDATE\s+newborn_candidates/i.test(q)) {
      updateCalls.push({ sql: q, values });
      return [];
    }
    return [];
  };
  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('UserResource')) {
      const isAlice = u.includes('alice');
      return makeJsonResponse({
        resource_response: {
          status: 'success',
          data: {
            username: isAlice ? 'alice' : 'bob',
            full_name: isAlice ? 'Alice Creator' : 'Bob Creator',
            follower_count: isAlice ? 1200 : 800,
            profile_reach: isAlice ? 450000 : 320000,
            profile_views: isAlice ? 610000 : 410000,
            pin_count: isAlice ? 90 : 40,
            board_count: 12
          }
        }
      });
    }
    return makeJsonResponse({ resource_response: { status: 'success', data: {} } });
  };
  const accRes = await fetchNewbornCandidateAccounts(
    nbSql,
    ['80000000000003', '80000000000001', '80000000000002'],
    { routerOptions: { fetchImpl: mockFetch, minDelayMs: 0, maxDelayMs: 0 } }
  );
  assert.equal(accRes.ok, true);
  assert.equal(accRes.fetched_count, 3);
  assert.equal(updateCalls.length, 1, `Expected 1 batched UPDATE newborn_candidates, got ${updateCalls.length}`);
  assert.match(updateCalls[0].sql, /FROM\s+jsonb_to_recordset/i);
  const parsedBatch = JSON.parse(updateCalls[0].values[0]);
  assert.deepEqual(
    parsedBatch.map((r) => r.pin_id),
    ['80000000000001', '80000000000002', '80000000000003'],
    'Batched UPDATE payload must be deterministically sorted by pin_id ASC'
  );
});

test('Wave 3.5: /api/pulse/24h enforces < 900 KB byte budget, omits raw description on pinarchive_winners, and preserves KPIs', async () => {
  // A. Direct programmatic budget trimming test on an oversized >1.3 MB payload
  const hugeDesc = 'D'.repeat(2000);
  const makeBigPin = (i) => ({
    pin_id: String(900000000000 + i),
    title: `High Velocity Recipe Idea #${i} `.repeat(6),
    description: hugeDesc,
    alt_text: hugeDesc,
    annotations: Array.from({ length: 12 }, (_, j) => ({ name: `tag-${i}-${j}`, norm: `tag-${i}-${j}` })),
    keywords: Array.from({ length: 8 }, (_, j) => ({ keyword_id: j, keyword_text: `kw-${j}` })),
    saves: 500 + i,
    velocity: 100 - (i % 50)
  });

  const oversized = {
    success: true,
    generated_at: new Date().toISOString(),
    filters: { folder_id: 'all', window: '24h', min_audience: 0 },
    kpis: { total_active_serp_pins: 4200, pins_gaining_24h_count: 850, from_matview: true },
    breakout_pins: Array.from({ length: 250 }, (_, i) => makeBigPin(i)),
    fresh_rocket_pins: Array.from({ length: 100 }, (_, i) => makeBigPin(1000 + i)),
    vault_surge_pins: Array.from({ length: 150 }, (_, i) => makeBigPin(2000 + i)),
    pinarchive_winners: Array.from({ length: 10 }, (_, i) => makeBigPin(3000 + i)),
    annotation_crossovers: {
      single_annotations: Array.from({ length: 200 }, (_, i) => ({ label: `single-${i}`, count: i })),
      pair_crossovers: Array.from({ length: 200 }, (_, i) => ({ pair: `a-${i}+b-${i}`, count: i })),
      triplet_crossovers: Array.from({ length: 200 }, (_, i) => ({ triplet: `a-${i}+b-${i}+c-${i}`, count: i }))
    },
    guided_capsule_crossovers: Array.from({ length: 100 }, (_, i) => ({ term: `capsule-${i}` })),
    creator_breakouts: Array.from({ length: 40 }, (_, i) => ({ username: `c${i}`, driver_pins: [makeBigPin(4000 + i)] })),
    keyword_vacuums_and_bridges: {
      bridge_pins: Array.from({ length: 100 }, (_, i) => makeBigPin(5000 + i)),
      keyword_vacuum_opportunities: Array.from({ length: 100 }, (_, i) => ({ keyword: `kw-${i}`, score: i }))
    },
    hidden_gems_telemetry: {
      winning_boards: Array.from({ length: 50 }, (_, i) => ({ board_name: `Board ${i}` })),
      vacuum_hijack_pins: Array.from({ length: 100 }, (_, i) => makeBigPin(6000 + i)),
      domainless_viral_pins: Array.from({ length: 100 }, (_, i) => makeBigPin(7000 + i)),
      creation_method_breakdown: [],
      dominant_color_palette: [],
      top_arbitrage_domains: Array.from({ length: 50 }, (_, i) => ({ domain: `d${i}.com` }))
    }
  };

  const beforeBytes = Buffer.byteLength(JSON.stringify(oversized), 'utf8');
  assert.ok(beforeBytes > PULSE_MAX_PAYLOAD_BYTES, `Precondition: payload (${beforeBytes}B) must exceed 900 KB`);

  const trimmed = enforcePulsePayloadByteBudget(oversized, PULSE_MAX_PAYLOAD_BYTES);
  const afterBytes = Buffer.byteLength(JSON.stringify(trimmed), 'utf8');
  assert.ok(afterBytes < PULSE_MAX_PAYLOAD_BYTES, `Trimmed payload (${afterBytes}B) must stay strictly < ${PULSE_MAX_PAYLOAD_BYTES}B`);
  assert.deepEqual(trimmed.kpis, { total_active_serp_pins: 4200, pins_gaining_24h_count: 850, from_matview: true }, 'KPIs must never be mutated');
  assert.equal('description' in (trimmed.breakout_pins[0] || {}), false, 'Verbose description must be stripped');

  // B. End-to-end getGlobal24hPulse omits raw description in pinarchive_winners & keeps < 900 KB
  invalidateGlobalPulseCache();
  const mockPulseSql = async (strings) => {
    const q = buildSqlText(strings);
    if (q.includes('FROM mv_pulse_24h_summary')) return [];
    if (q.includes('AS account_username') && q.includes('FROM universal_master_pins ump')) {
      return [
        {
          pin_id: '555000111222',
          account_username: 'chef_demo',
          title: 'X'.repeat(160),
          description: 'RAW_DESCRIPTION_MUST_NOT_LEAK_'.repeat(50),
          link: 'https://example.com/recipe',
          domain: 'example.com',
          board_name: 'Recipes',
          image_url: 'https://i.pinimg.com/236x/demo.jpg',
          dominant_color: '#cc5500',
          saves: 420,
          repins: 110,
          comments: 3,
          velocity: 45,
          annotations: ['A', 'B', 'C', 'D', 'E', 'F'],
          created_at_pinterest: '2026-11-18T00:00:00Z'
        }
      ];
    }
    return [];
  };
  const pulse = await getGlobal24hPulseService(mockPulseSql, {}, { bypassCache: true });
  assert.equal(pulse.success, true);
  assert.equal(pulse.pinarchive_winners.length, 1);
  assert.equal('description' in pulse.pinarchive_winners[0], false, 'pinarchive_winners must omit raw description');
  assert.ok(pulse.pinarchive_winners[0].title.length <= 105);
  assert.ok(pulse.pinarchive_winners[0].annotations.length <= 4);
  assert.ok(Buffer.byteLength(JSON.stringify(pulse), 'utf8') < PULSE_MAX_PAYLOAD_BYTES);
});

test('Wave 3.6: whois-age-service caps crt.sh payload bytes and propagates DB errors in enrichNextUncheckedBatch', async () => {
  assert.ok(CRT_SH_MAX_BYTES >= 2 * 1024 * 1024 && CRT_SH_MAX_BYTES <= 5 * 1024 * 1024);

  // A. Content-Length cap rejection before reading body
  let headerCancelCalled = false;
  const fakeHeaderOversizedRes = {
    headers: new Headers({ 'content-length': String(10 * 1024 * 1024) }),
    body: {
      cancel: async () => { headerCancelCalled = true; },
      getReader: () => { throw new Error('Should not read body when Content-Length exceeds cap'); }
    }
  };
  await assert.rejects(
    () => readBoundedJsonResponse(fakeHeaderOversizedRes, 4096),
    (err) => err?.code === 'RESPONSE_TOO_LARGE'
  );
  assert.equal(headerCancelCalled, true);

  // B. Streaming ReadableStream cap rejection mid-stream (when Content-Length is absent)
  let streamCancelled = false;
  let chunksServed = 0;
  const oversizedStream = new ReadableStream({
    pull(controller) {
      chunksServed++;
      controller.enqueue(new Uint8Array(2048).fill(65));
      if (chunksServed >= 20) controller.close();
    },
    cancel() {
      streamCancelled = true;
    }
  });
  const fakeStreamRes = new Response(oversizedStream, { status: 200 });
  await assert.rejects(
    () => readBoundedJsonResponse(fakeStreamRes, 4096),
    (err) => err?.code === 'RESPONSE_TOO_LARGE'
  );
  assert.equal(streamCancelled, true, 'Oversized stream must be cancelled cleanly');
  assert.ok(chunksServed <= 4, `Expected early abort after exceeding 4096B, served ${chunksServed} chunks`);

  // C. Valid small stream parses cleanly
  const validRes = makeJsonResponse([{ not_before: '2020-05-01T00:00:00Z' }]);
  const parsed = await readBoundedJsonResponse(validRes, 4096);
  assert.equal(parsed[0].not_before, '2020-05-01T00:00:00Z');

  // D. enrichNextUncheckedBatch propagates DB errors instead of silently returning lookup_status='failed'
  const dbErrorSql = async (strings) => {
    const q = buildSqlText(strings);
    if (q.includes('WITH all_candidates')) {
      return [{ domain: 'example.com' }];
    }
    const pgErr = new Error('connection to server was lost');
    pgErr.code = '08006';
    throw pgErr;
  };
  await assert.rejects(
    () => enrichNextUncheckedBatch(dbErrorSql, { batchSize: 1, concurrency: 1 }),
    (err) => err?.isDbError === true && /connection to server was lost/i.test(err.message)
  );
});

test('Wave 3.7: Semaphore(4) caps concurrent Pinterest fanout in trends-service.mjs and cluster/service.mjs', async () => {
  const originalFetch = globalThis.fetch;
  let inFlight = 0;
  let maxObservedInFlight = 0;
  let interestInFlight = 0;
  let maxInterestInFlight = 0;
  let totalCalls = 0;

  globalThis.fetch = async (url) => {
    const u = String(url);
    const isInterest = u.includes('InterestResource');
    inFlight++;
    if (isInterest) {
      interestInFlight++;
      if (interestInFlight > maxInterestInFlight) maxInterestInFlight = interestInFlight;
    }
    totalCalls++;
    if (inFlight > maxObservedInFlight) maxObservedInFlight = inFlight;
    try {
      await new Promise((r) => setTimeout(r, 15));
      if (isInterest) {
        const isMain = u.includes('semaphore-root-test-w3') || u.includes('semaphore_root_test_w3');
        return makeJsonResponse({
          resource_response: {
            data: {
              id: isMain ? '9001' : String(9001 + totalCalls),
              key: 'test',
              url_name: 'test',
              internal_search_count: 50000,
              seo_breadcrumbs: [{ name: 'Food' }],
              seo_related_interests: isMain
                ? Array.from({ length: 10 }, (_, i) => ({ id: String(1000 + i), name: `w3rel ${i}` }))
                : [],
              ideas_klp_pivots: isMain
                ? Array.from({ length: 6 }, (_, i) => ({
                    pivot_display_text: `p${i}`,
                    pivot_full_name: `w3piv ${i}`,
                    pivot_url: `/ideas/p${i}/${2000 + i}/`
                  }))
                : []
            }
          }
        });
      }
      if (u.includes('prefix_match')) {
        return makeJsonResponse([]);
      }
      if (u.includes('AdvancedTypeaheadResource')) {
        return makeJsonResponse({
          resource_response: {
            data: {
              items: Array.from({ length: 8 }, (_, i) => ({ query: `w3 ta term ${i}` }))
            }
          }
        });
      }
      return makeJsonResponse({ resource_response: { data: {} } });
    } finally {
      inFlight--;
      if (isInterest) interestInFlight--;
    }
  };

  try {
    // 1. fetchKeywordRelatedInterests (10 related + 6 pivots = 16 fanout calls)
    maxObservedInFlight = 0;
    maxInterestInFlight = 0;
    const relRes = await fetchKeywordRelatedInterests('semaphore root test w3', 'both');
    assert.equal(relRes.success, true);
    assert.equal(relRes.related_interests.length, 10);
    assert.equal(relRes.additions.length, 6);
    assert.ok(maxInterestInFlight >= 2 && maxInterestInFlight <= 4, `fetchKeywordRelatedInterests peak concurrency expected in [2,4], got ${maxInterestInFlight}`);

    // 2. fetchPinterestBatchVelocity (10 missing terms)
    maxObservedInFlight = 0;
    const terms = Array.from({ length: 10 }, (_, i) => `w3 vel miss ${i}`);
    await fetchPinterestBatchVelocity('w3 vel seed', terms);
    assert.ok(maxObservedInFlight >= 2 && maxObservedInFlight <= 4, `fetchPinterestBatchVelocity peak concurrency expected in [2,4], got ${maxObservedInFlight}`);

    // 3. getDiscoveryTypeaheadService (8 suggestions)
    maxObservedInFlight = 0;
    maxInterestInFlight = 0;
    const taRes = await getDiscoveryTypeaheadService({ cleanQ: 'w3 ta seed' });
    assert.equal(taRes.success, true);
    assert.equal(taRes.enriched_suggestions.length, 8);
    assert.ok(maxInterestInFlight >= 2 && maxInterestInFlight <= 4, `getDiscoveryTypeaheadService interest peak concurrency expected in [2,4], got ${maxInterestInFlight}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wave 3.8: batchGlobalSavesRateStore enforces hard LRU max-keys & per-key timestamp bounds, and peerAnnCounts matches O(N^2)', () => {
  // A. batchGlobalSavesRateStore LRU cap & per-key timestamp cap
  _resetBatchGlobalSavesRateLimit();
  const baseNow = 1_700_000_000_000;
  const mkReq = (ip) => ({ headers: new Headers({ 'cf-connecting-ip': ip }) });

  // Fill 5 keys with maxKeys=5, then touch ip-0 so ip-1 becomes LRU
  for (let i = 0; i < 5; i++) {
    const r = enforceBatchGlobalSavesRateLimit(mkReq(`10.0.0.${i}`), baseNow + i, 3, 5);
    assert.equal(r.limited, false);
  }
  enforceBatchGlobalSavesRateLimit(mkReq('10.0.0.0'), baseNow + 10, 3, 5);

  // Add 10 more unique active IPs within the same window -> store size MUST stay <= 5
  for (let i = 5; i < 15; i++) {
    enforceBatchGlobalSavesRateLimit(mkReq(`10.0.0.${i}`), baseNow + 20 + i, 3, 5);
  }
  let stats = _getBatchGlobalSavesRateStoreStats();
  assert.equal(stats.size, 5, `Rate store must never exceed maxKeys=5, got ${stats.size}`);

  // Hammer a single IP beyond maxRequests=3 -> limited=true and stored timestamps capped at <= 3
  for (let n = 0; n < 8; n++) {
    enforceBatchGlobalSavesRateLimit(mkReq('10.0.0.14'), baseNow + 50 + n, 3, 5);
  }
  const limitedRes = enforceBatchGlobalSavesRateLimit(mkReq('10.0.0.14'), baseNow + 60, 3, 5);
  assert.equal(limitedRes.limited, true);
  stats = _getBatchGlobalSavesRateStoreStats();
  assert.ok(stats.maxBucketLength <= 3, `Per-key timestamps must be capped <= 3, got ${stats.maxBucketLength}`);
  _resetBatchGlobalSavesRateLimit();

  // B. Precomputed buildPeerAnnotationCounts produces identical blueprints to raw peer array
  const cohort = [
    {
      pin_id: 'p1',
      title: 'Cozy Fall Kitchen',
      board_name: 'Fall Kitchen Decor',
      visual_annotations: ['Fall Kitchen', 'Fall Kitchen', 'Warm Wood', 'Copper Pot'],
      guided_capsules: ['cozy fall kitchen ideas']
    },
    {
      pin_id: 'p2',
      title: 'Warm Wood Shelves',
      board_name: 'Kitchen Ideas',
      visual_annotations: ['Warm Wood', 'Rustic Shelf'],
      guided_capsules: ['wood shelves']
    },
    {
      pin_id: 'p3',
      title: 'Copper Cookware',
      board_name: 'Copper Kitchen',
      visual_annotations: ['Copper Pot', 'Warm Wood'],
      guided_capsules: []
    }
  ];
  const precomputed = buildPeerAnnotationCounts(cohort);
  for (const cand of cohort) {
    const bpArray = synthesizeNewbornCrossoverBlueprint(cand, cohort);
    const bpMap = synthesizeNewbornCrossoverBlueprint(cand, precomputed);
    assert.deepEqual(bpMap, bpArray, `Precomputed peerAnnCounts diverged for ${cand.pin_id}`);
  }
});

test('Wave 3.9: Fleet runner awaits inflightRenewal before DELETE, closes dispatcher, manages signals; Workflows & account-related-crawler hygiene', async () => {
  // A. startInstaBoxActivityLease().stop() awaits in-flight renewal PUT before sending DELETE
  const timeline = [];
  let releaseRenewalPut = null;
  let putCount = 0;

  const mockLeaseFetch = async (_url, init) => {
    if (init.method === 'PUT') {
      putCount++;
      const seq = putCount;
      timeline.push(`PUT#${seq}:start`);
      if (seq === 2) {
        await new Promise((r) => { releaseRenewalPut = r; });
      }
      timeline.push(`PUT#${seq}:end`);
      return { ok: true, status: 200 };
    }
    timeline.push(`${init.method}:called`);
    return { ok: true, status: 200 };
  };

  const lease = startInstaBoxActivityLease('wave3-lease-test', {
    machineId: 'm_test',
    apiKey: 'k_test',
    intervalMs: 20,
    fetchImpl: mockLeaseFetch
  });
  await lease.ready;
  // Wait until interval renewal PUT#2 starts
  for (let i = 0; i < 30 && !releaseRenewalPut; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(releaseRenewalPut, 'Expected interval renewal PUT#2 to be in flight');

  const stopPromise = lease.stop();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(timeline.includes('DELETE:called'), false, 'DELETE must NOT fire while inflightRenewal PUT#2 is still pending');

  releaseRenewalPut();
  await stopPromise;
  assert.ok(
    timeline.indexOf('PUT#2:end') < timeline.indexOf('DELETE:called'),
    `Expected PUT#2:end before DELETE:called, got: ${JSON.stringify(timeline)}`
  );

  // B. runFleetLifecycle closes dispatcher in finally, passes applicationName, and removes SIGTERM/SIGINT handlers
  const sigtermBefore = process.listenerCount('SIGTERM');
  const sigintBefore = process.listenerCount('SIGINT');
  let dispatcherClosed = false;
  let sqlEnded = false;
  let leaseStopped = false;
  let capturedSqlOpts = null;

  await assert.rejects(
    () => runFleetLifecycle(
      'wave3-worker',
      async () => {
        assert.equal(process.listenerCount('SIGTERM'), sigtermBefore + 1);
        assert.equal(process.listenerCount('SIGINT'), sigintBefore + 1);
        throw new Error('simulated worker crash');
      },
      {
        dbUrl: 'postgres://u:p@127.0.0.1:5432/db',
        loadEnv: false,
        createSqlClientFn: (_url, opts) => {
          capturedSqlOpts = opts;
          return { end: async () => { sqlEnded = true; } };
        },
        lease: { stop: async () => { leaseStopped = true; } },
        dispatcher: { close: async () => { dispatcherClosed = true; } }
      }
    ),
    /simulated worker crash/
  );
  assert.equal(capturedSqlOpts?.applicationName, 'pae-wave3-worker');
  assert.equal(leaseStopped, true);
  assert.equal(sqlEnded, true);
  assert.equal(dispatcherClosed, true, 'Undici dispatcher must be closed in finally');
  assert.equal(process.listenerCount('SIGTERM'), sigtermBefore, 'SIGTERM handler must be cleaned up');
  assert.equal(process.listenerCount('SIGINT'), sigintBefore, 'SIGINT handler must be cleaned up');

  // C. GitHub Actions workflow cron schedule, single nightly rollup, and consolidate guards
  const kwYml = fs.readFileSync(path.resolve('.github/workflows/keyword-intelligence-velocity.yml'), 'utf8');
  const crYml = fs.readFileSync(path.resolve('.github/workflows/crawler-pipeline.yml'), 'utf8');
  const rpYml = fs.readFileSync(path.resolve('.github/workflows/related-pins-crawler.yml'), 'utf8');
  const nbYml = fs.readFileSync(path.resolve('.github/workflows/newborn-hunter.yml'), 'utf8');

  assert.match(kwYml, /cron:\s*'0 1 \* \* \*'/);
  assert.match(crYml, /cron:\s*'30 2 \* \* \*'/);
  assert.match(rpYml, /cron:\s*'15 4 \* \* \*'/);
  assert.match(nbYml, /cron:\s*'15 0,6,9,12,15,18,21 \* \* \*'/);

  // Consolidate guards & skip-wakeup: 'true'
  for (const [name, yml] of [
    ['keyword-intelligence-velocity.yml', kwYml],
    ['crawler-pipeline.yml', crYml],
    ['newborn-hunter.yml', nbYml]
  ]) {
    const consolidateSection = yml.slice(yml.indexOf('consolidate:'));
    assert.match(consolidateSection, /!cancelled\(\)/, `${name} consolidate must check !cancelled()`);
    assert.match(consolidateSection, /needs\.dispatch\.outputs\.task_count != '0'/, `${name} consolidate must guard task_count != '0'`);
    assert.match(consolidateSection, /skip-wakeup:\s*'true'/, `${name} consolidate must pass skip-wakeup: 'true'`);
    assert.equal(/skip-wakeup:\s*'false'/.test(consolidateSection), false, `${name} consolidate must not pass skip-wakeup: 'false'`);
  }
  // No duplicate nightly rollup: keyword workflow gates domain-enrich --mode=rollup to workflow_dispatch
  const kwConsolidate = kwYml.slice(kwYml.indexOf('consolidate:'));
  assert.match(kwConsolidate, /if:\s*github\.event_name == 'workflow_dispatch'[\s\S]{0,350}domain-enrich\.mjs --mode=rollup/);
  assert.match(crYml, /domain-enrich\.mjs --mode=rollup/);

  // D. account-related-crawler.mjs comment, top-level imports & hoisted resolveNewbornRawCookie
  const accCrawlerSrc = fs.readFileSync(path.resolve('scripts/account-related-crawler.mjs'), 'utf8');
  assert.equal(/100%\s+Zero-Cookie/i.test(accCrawlerSrc), false, 'Misleading 100% Zero-Cookie comment must be fixed');
  const lastImportIdx = Math.max(accCrawlerSrc.lastIndexOf('\nimport '), accCrawlerSrc.indexOf('import '));
  const firstFnIdx = accCrawlerSrc.indexOf('function getCliArg');
  assert.ok(lastImportIdx < firstFnIdx, 'All static import declarations must be hoisted to the top of account-related-crawler.mjs');
  const mainBody = accCrawlerSrc.slice(accCrawlerSrc.indexOf('async function main()'));
  const hoistedCookieIdx = mainBody.indexOf('resolveNewbornRawCookie(');
  const seedLoopIdx = mainBody.indexOf('for (let i = 0; i < seedIds.length; i++)');
  assert.ok(hoistedCookieIdx !== -1 && hoistedCookieIdx < seedLoopIdx, 'resolveNewbornRawCookie must be hoisted outside the seed loop in main()');
});
