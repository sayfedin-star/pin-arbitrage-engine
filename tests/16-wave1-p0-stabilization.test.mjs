import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';

import { createFastifyApp, AsyncTaskQueue } from '../src/server.mjs';
import {
  isReadOnlyQuery,
  withDbRetry,
  attachTransactionBridge,
  createSqlClient
} from '../src/db/client.mjs';
import {
  splitSqlStatements,
  calculateChecksum,
  applyMigration,
  runMigrations
} from '../scripts/migrate.mjs';
import { searchMultiEntityAutocomplete } from '../src/modules/search/autocomplete-service.mjs';
import { listCompetitors } from '../src/modules/creators/competitors-crud.mjs';
import { getTopDestinationUrls, getTopicClusters } from '../src/modules/creators/creator-harvest-and-archive.mjs';
import { listCompetitorAccountPins, listArchivedPins } from '../src/modules/creators/creator-analytics.mjs';
import {
  buildDomainAggregationCtes,
  refreshDomainIntelligenceRollup
} from '../src/modules/domains/rollup-leaderboard-service.mjs';
import { sqlWithRetry } from '../scripts/cluster-intelligence.mjs';
import { safeWaitUntil, edgeCache } from '../src/http/security-and-response.mjs';
import { PinterestCircuitBreaker, pinterestFetch } from '../src/core/pinterest/client.mjs';
import { NewbornCookieRouter, fetchRelatedModulesWithZoneA } from '../src/modules/newborn/cookie-router.mjs';
import { TtlSingleflightCache } from '../src/lib/ttl-cache.mjs';
import {
  enqueueNewbornRun,
  newbornBackgroundQueue,
  clearNewbornInflightRunsForTest
} from '../src/modules/newborn/service.mjs';
import {
  parseNewbornFleetArgs,
  runNewbornFleetDispatch
} from '../scripts/newborn-fleet.mjs';
import { flushBatchToHub } from '../scripts/keyword-velocity-crawler.mjs';
import { parseHtmlElementTree } from '../scripts/check-syntax-and-templates.mjs';
import {
  getDashboardCreatorsFleetMethods,
  getDashboardCreatorsDossierMethods
} from '../src/ui/dashboard/dashboard-client-creators.mjs';

function buildTaggedSqlText(strings, values = []) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += `$${i + 1}`;
  }
  return out;
}

function collectNodes(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) {
    collectNodes(child, pred, acc);
  }
  return acc;
}

function extractSingleQuotedEscapeClauses(sqlText) {
  return [...sqlText.matchAll(/ESCAPE\s+'([^']*)'/gi)].map((m) => m[1]);
}

// ============================================================================
// WORKSTREAM 1: PostgreSQL Client, SQL Escaping, Transactions & Migrations
// ============================================================================

test('Wave 1.1: autocomplete-service and creator/domain LIKE queries emit single-backslash ESCAPE and avoid double-escaping', async () => {
  const executed = [];
  const captureSql = async (strings, ...values) => {
    const query = buildTaggedSqlText(strings, values);
    executed.push({ query, values });
    if (query.includes('FROM competitor_profiles') && query.includes('WHERE id =')) {
      return [{ id: 12, username: 'chef_amelia', website_url: 'https://chefamelia.com' }];
    }
    return [];
  };

  // 1. autocomplete-service.mjs: all 4 entities -> 10 ESCAPE clauses, every single one strictly 1 backslash '\'
  await searchMultiEntityAutocomplete(captureSql, { query: '100%_salad', limit: 5 });
  assert.equal(executed.length, 4, 'Autocomplete should execute 4 entity queries');

  let totalAutocompleteEscapes = 0;
  for (const call of executed) {
    const escapes = extractSingleQuotedEscapeClauses(call.query);
    assert.ok(escapes.length >= 2, `Expected >=2 ESCAPE clauses in query: ${call.query.slice(0, 120)}`);
    for (const esc of escapes) {
      assert.equal(esc, '\\', `ESCAPE literal must be single backslash (len 1), got "${esc}" (len ${esc.length})`);
      assert.equal(esc.length, 1);
      totalAutocompleteEscapes++;
    }
  }
  assert.equal(totalAutocompleteEscapes, 10, 'Expected all 10 ESCAPE clauses in autocomplete-service.mjs');

  // 2. competitors-crud.mjs, creator-harvest-and-archive.mjs, creator-analytics.mjs
  executed.length = 0;
  await listCompetitors(captureSql, { search: 'chef_100%' });
  await listCompetitors(captureSql, { account_type: 'competitor', search: 'chef_100%' });
  for (const call of executed) {
    const escapes = extractSingleQuotedEscapeClauses(call.query);
    assert.equal(escapes.length, 2);
    assert.ok(escapes.every((e) => e === '\\'));
  }

  executed.length = 0;
  await getTopDestinationUrls(captureSql, 12, { search: '50%_off' });
  const topUrlCall = executed.find((c) => c.query.includes('clean_slug LIKE'));
  assert.ok(topUrlCall);
  assert.deepEqual(extractSingleQuotedEscapeClauses(topUrlCall.query), ['\\']);

  executed.length = 0;
  await listCompetitorAccountPins(captureSql, 12, { search: '50%_off', scope: 'official' });
  const accPinCallsWithLike = executed.filter((c) => c.query.includes('LIKE $'));
  assert.ok(accPinCallsWithLike.length >= 1);
  for (const call of accPinCallsWithLike) {
    const likeCount = (call.query.match(/\bLIKE\s+\$\d+/g) || []).length;
    const escapes = extractSingleQuotedEscapeClauses(call.query);
    assert.equal(escapes.length, likeCount);
    assert.ok(escapes.every((e) => e === '\\'));
  }

  executed.length = 0;
  await listArchivedPins(captureSql, { search: 'a_b', board: 'b_1', topic: 't_1', account: 'u_1' });
  assert.equal(executed.length, 2);
  for (const call of executed) {
    const likeCount = (call.query.match(/\bLIKE\s+\$\d+/g) || []).length;
    const escapes = extractSingleQuotedEscapeClauses(call.query);
    assert.equal(escapes.length, likeCount, 'Every LIKE in listArchivedPins must have explicit ESCAPE');
    assert.ok(escapes.every((e) => e === '\\'));
  }

  // 3. getTopicClusters: primary stored proc gets raw search (no double escape), fallback CTE escapes once
  const topicCalls = [];
  const topicPrimarySql = async (strings, ...values) => {
    topicCalls.push({ query: buildTaggedSqlText(strings, values), values });
    return [];
  };
  await getTopicClusters(topicPrimarySql, { search: '100%_pasta' });
  assert.ok(topicCalls[0].query.includes('pa_topic_clusters_page'));
  assert.equal(topicCalls[0].values[1], '100%_pasta', 'Stored procedure handles its own escaping; JS must pass raw search');

  const fallbackCalls = [];
  const topicFallbackSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    fallbackCalls.push({ query: q, values });
    if (q.includes('pa_topic_clusters_page')) throw new Error('function pa_topic_clusters_page does not exist');
    return [];
  };
  await getTopicClusters(topicFallbackSql, { search: '100%_pasta' });
  const cteCall = fallbackCalls.find((c) => c.query.includes('ILIKE'));
  assert.ok(cteCall);
  assert.ok(cteCall.values.includes('%100\\%\\_pasta%'), 'Fallback CTE must escape wildcards exactly once');
  assert.equal(cteCall.values.includes('%100\\\\%\\\\_pasta%'), false, 'Fallback CTE must NEVER double-escape');
  assert.deepEqual(extractSingleQuotedEscapeClauses(cteCall.query), ['\\']);

  // 4. rollup-leaderboard-service.mjs unprotected LIKE clauses are escaped with single-backslash ESCAPE
  const ctes = buildDomainAggregationCtes({ referenceTime: new Date().toISOString() });
  const cteSql = ctes.strings.join(' ');
  assert.equal(cteSql.includes("NOT LIKE 'preview_%'"), false, 'Unescaped preview_% LIKE must be escaped');
  assert.ok(cteSql.includes("NOT LIKE 'preview\\_%' ESCAPE '\\'"));
  const dynamicLikeMatches = cteSql.match(/\bLIKE\s+'%'\s*\|\|/g) || [];
  const allEscapes = extractSingleQuotedEscapeClauses(cteSql);
  assert.ok(allEscapes.length >= dynamicLikeMatches.length + 3);
  assert.ok(allEscapes.every((e) => e === '\\'));
});

test('Wave 1.2: noRetry.begin marks __paeEnteredTxCallback, isReadOnlyQuery inspects nested fragments, and PG_POOL_MAX guards NaN/non-positive values', async () => {
  // 1. noRetry.begin sets __paeEnteredTxCallback so outer withDbRetry NEVER replays committed writes
  let beginCalls = 0;
  let callbackCalls = 0;
  let preFail = true;
  const rawClient = () => Promise.resolve([]);
  rawClient.begin = async (cb) => {
    beginCalls++;
    if (preFail) {
      preFail = false;
      const err = new Error('too many clients already');
      err.code = '53300';
      throw err;
    }
    await cb(async () => [{ ok: true }]);
    const drop = new Error('connection terminated mid-COMMIT');
    drop.code = 'ECONNRESET';
    throw drop;
  };
  const bridged = attachTransactionBridge(rawClient);

  await assert.rejects(
    () =>
      withDbRetry(
        () =>
          bridged.noRetry.begin(async (tx) => {
            callbackCalls++;
            return await tx();
          }),
        { maxRetries: 4, baseDelayMs: 10, maxDelayMs: 20, sleepFn: async () => {} }
      ),
    /connection terminated mid-COMMIT/
  );
  assert.equal(beginCalls, 2, 'Pre-callback 53300 retries once, mid-COMMIT drop after callback enters MUST NOT retry');
  assert.equal(callbackCalls, 1, 'Transaction callback must execute strictly once');

  // 2. isReadOnlyQuery inspects nested fragments & rejects mutating/locking/opaque fragments
  const safeFrag = { strings: ['AND is_active = ', ''], args: [true] };
  const deleteFrag = { strings: ['DELETE FROM tracked_keywords RETURNING *'], args: [] };
  const lockFrag = { strings: ['FOR UPDATE'], args: [] };
  const opaqueThenable = { then: () => {} };

  assert.equal(isReadOnlyQuery(['SELECT * FROM tracked_keywords WHERE 1=1 ', ''], [safeFrag]), true);
  assert.equal(isReadOnlyQuery(['SELECT * FROM tracked_keywords WHERE id = ANY(', ')'], [[1, 2, 3]]), true);
  assert.equal(isReadOnlyQuery(['WITH d AS (', ') SELECT * FROM d'], [deleteFrag]), false);
  assert.equal(isReadOnlyQuery(['SELECT * FROM tracked_keywords ', ''], [lockFrag]), false);
  assert.equal(isReadOnlyQuery(['SELECT * FROM tracked_keywords ', ''], [opaqueThenable]), false);

  // Verify Proxy tagged template call passes values to isReadOnlyQuery (mutating nested fragment does NOT auto-retry)
  let fragAttempts = 0;
  const fragRaw = () => {
    fragAttempts++;
    const err = new Error('ECONNRESET');
    err.code = 'ECONNRESET';
    return Promise.reject(err);
  };
  const fragBridged = attachTransactionBridge(fragRaw, { maxRetries: 2, baseDelayMs: 10, sleepFn: async () => {} });
  await assert.rejects(() => fragBridged`WITH d AS (${deleteFrag}) SELECT * FROM d`, /ECONNRESET/);
  assert.equal(fragAttempts, 1, 'Tagged template with mutating nested fragment must NOT auto-retry');

  // 3. PG_POOL_MAX parsing guards NaN, 0, negative, and honors valid positive integers
  const prevPoolMax = process.env.PG_POOL_MAX;
  const prevCi = process.env.GITHUB_ACTIONS;
  try {
    delete process.env.GITHUB_ACTIONS;
    for (const invalidVal of ['not-a-number', '-5', '0', 'NaN']) {
      process.env.PG_POOL_MAX = invalidVal;
      const c = createSqlClient('postgresql://u:p@127.0.0.1:5432/db');
      assert.equal(c.options.max, 15, `Invalid PG_POOL_MAX="${invalidVal}" must fallback to safe integer 15`);
      await c.end({ timeout: 0 });
    }
    process.env.PG_POOL_MAX = '10';
    const validClient = createSqlClient('postgresql://u:p@127.0.0.1:5432/db');
    assert.equal(validClient.options.max, 10);
    await validClient.end({ timeout: 0 });
  } finally {
    if (prevPoolMax === undefined) delete process.env.PG_POOL_MAX;
    else process.env.PG_POOL_MAX = prevPoolMax;
    if (prevCi === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = prevCi;
  }
});

test('Wave 1.3: cluster-intelligence sqlWithRetry routes via noRetry and refreshDomainIntelligenceRollup uses scoped timeout + singleflight mutex', async () => {
  // 1. sqlWithRetry passes sqlClient.noRetry (eliminating 3x5 retry amplification)
  let retryCalls = 0;
  let noRetryCalls = 0;
  const fakeClient = async () => {
    retryCalls++;
    return [{ from: 'outer' }];
  };
  fakeClient.noRetry = async () => {
    noRetryCalls++;
    if (noRetryCalls < 2) {
      const err = new Error('ECONNRESET');
      err.code = 'ECONNRESET';
      throw err;
    }
    return [{ from: 'noRetry' }];
  };

  const res = await sqlWithRetry((db) => db`SELECT 1`, 3, {
    sqlClient: fakeClient,
    baseDelayMs: 10,
    maxDelayMs: 20,
    sleepFn: async () => {}
  });
  assert.deepEqual(res, [{ from: 'noRetry' }]);
  assert.equal(noRetryCalls, 2);
  assert.equal(retryCalls, 0, 'sqlWithRetry must route exclusively through sql.noRetry');

  // 2. refreshDomainIntelligenceRollup coalesces concurrent calls and sets scoped statement_timeout inside sql.begin
  let beginCount = 0;
  const txQueries = [];
  const rollupSql = async (strings, ...values) => {
    txQueries.push(buildTaggedSqlText(strings, values));
    return [];
  };
  rollupSql.begin = async (cb) => {
    beginCount++;
    const tx = async (strings, ...values) => {
      const q = buildTaggedSqlText(strings, values);
      txQueries.push({ q, values });
      if (q.includes('INSERT INTO domain_intelligence_rollup')) {
        await new Promise((r) => setTimeout(r, 25));
      }
      return [{ domain: 'example.com' }];
    };
    return await cb(tx);
  };

  const [r1, r2] = await Promise.all([
    refreshDomainIntelligenceRollup(rollupSql),
    refreshDomainIntelligenceRollup(rollupSql)
  ]);
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(beginCount, 2, 'Concurrent callers must coalesce into 1 upsert tx + 1 prune tx (not 4)');
  assert.ok(
    txQueries.some((e) => typeof e === 'object' && e.q.includes('SET LOCAL statement_timeout') && e.values.includes('120000')),
    'Rollup upsert must set scoped 120s statement_timeout'
  );
});

test('Wave 1.4: migrate.mjs fixes splitSqlStatements, records schema_migrations inside sql.begin, checks SHA-256 checksums, and fails closed offline', async () => {
  // 1. splitSqlStatements: standard SQL \' does NOT escape quotes; E'...' DOES; $1$ is NOT a dollar-quote tag
  const stdSplit = splitSqlStatements("SELECT 'foo\\'; SELECT 2;");
  assert.equal(stdSplit.length, 2, "Standard SQL string 'foo\\' must close at the quote");
  assert.equal(stdSplit[0], "SELECT 'foo\\'");
  assert.equal(stdSplit[1], 'SELECT 2');

  const escSplit = splitSqlStatements("SELECT E'foo\\'bar;baz'; SELECT 2;");
  assert.equal(escSplit.length, 2, "PostgreSQL E'...' escape string must keep \\' and ; inside literal");
  assert.equal(escSplit[0], "SELECT E'foo\\'bar;baz'");
  assert.equal(escSplit[1], 'SELECT 2');

  const paramSplit = splitSqlStatements('SELECT $1$2; SELECT $1 + $2;');
  assert.equal(paramSplit.length, 2, 'Positional parameter $1 followed by $ must NOT start a dollar-quote block');

  const dollarSplit = splitSqlStatements("CREATE FUNCTION f() RETURNS text AS $body$ BEGIN RETURN 'a;b'; END; $body$ LANGUAGE plpgsql; SELECT 1;");
  assert.equal(dollarSplit.length, 2, 'Valid named dollar tag $body$ must preserve interior semicolons');

  // 2. Fail closed on ECONNREFUSED by default; allow offline only with allowOffline: true
  const offlineSql = async () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    err.code = 'ECONNREFUSED';
    throw err;
  };
  offlineSql.end = async () => {};

  await assert.rejects(() => runMigrations({ sqlClient: offlineSql }), /ECONNREFUSED/);
  const allowedRes = await runMigrations({ sqlClient: offlineSql, allowOffline: true });
  assert.equal(allowedRes.offline, true);

  // 3. applyMigration inserts schema_migrations INSIDE the same sql.begin transaction + checksum mismatch fails closed
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pae-wave1-mig-'));
  try {
    const migPath = path.join(tmpDir, '001_test_tx.sql');
    await writeFile(migPath, 'CREATE TABLE test_x (id int);', 'utf8');

    const txEvents = [];
    const txMockSql = async (strings) => {
      txEvents.push({ scope: 'outer', q: buildTaggedSqlText(strings) });
      return [];
    };
    txMockSql.unsafe = async (s) => {
      txEvents.push({ scope: 'outer_unsafe', q: s });
      return [];
    };
    txMockSql.begin = async (cb) => {
      txEvents.push({ scope: 'begin_start' });
      const tx = async (strings) => {
        txEvents.push({ scope: 'tx', q: buildTaggedSqlText(strings) });
        return [];
      };
      tx.unsafe = async (s) => {
        txEvents.push({ scope: 'tx_unsafe', q: s });
        return [];
      };
      await cb(tx);
      txEvents.push({ scope: 'begin_commit' });
    };

    await applyMigration(txMockSql, {
      version: '001',
      name: 'test_tx',
      filename: '001_test_tx.sql',
      filepath: migPath
    });

    const ddlIdx = txEvents.findIndex((e) => e.scope === 'tx_unsafe' && e.q.includes('CREATE TABLE test_x'));
    const recIdx = txEvents.findIndex((e) => e.scope === 'tx' && e.q.includes('INSERT INTO schema_migrations'));
    const commitIdx = txEvents.findIndex((e) => e.scope === 'begin_commit');
    assert.ok(ddlIdx >= 0 && recIdx > ddlIdx && recIdx < commitIdx, 'schema_migrations row MUST be written inside sql.begin before COMMIT');
    assert.equal(txEvents.some((e) => e.scope === 'outer' && e.q.includes('INSERT INTO schema_migrations')), false);

    // Checksum mismatch verification
    const mismatchSql = async (strings) => {
      const q = buildTaggedSqlText(strings);
      if (q.includes('FROM schema_migrations')) {
        return [{
          version: '001',
          name: 'test_tx',
          checksum: calculateChecksum('DIFFERENT CONTENT'),
          applied_at: '2026-01-01T00:00:00Z'
        }];
      }
      return [];
    };
    mismatchSql.end = async () => {};

    await assert.rejects(
      () => runMigrations({ migrationsDir: tmpDir, sqlClient: mismatchSql }),
      /Checksum mismatch/i
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// WORKSTREAM 2: Fastify Concurrency, Circuit Breaker, Cache & Auth Security
// ============================================================================

test('Wave 1.5: safeWaitUntil queues lazy thunks through AsyncTaskQueue respecting concurrency bounds', async () => {
  const queue = new AsyncTaskQueue(2, 20);
  const ctx = {
    __supportsThunkWaitUntil: true,
    waitUntil(task) {
      queue.add(typeof task === 'function' ? task : () => task).catch(() => {});
    }
  };

  let active = 0;
  let maxActive = 0;
  let completed = 0;
  for (let i = 0; i < 6; i++) {
    safeWaitUntil(
      ctx,
      async () => {
        active++;
        if (active > maxActive) maxActive = active;
        await new Promise((r) => setTimeout(r, 20));
        active--;
        completed++;
      },
      `lazy_task_${i}`
    );
  }

  await queue.drain(2000);
  assert.equal(completed, 6);
  assert.equal(maxActive, 2, 'Lazy thunks must respect AsyncTaskQueue concurrency cap (2)');
});

test('Wave 1.6: PinterestCircuitBreaker reopens from HALF_OPEN on HTTP 500/502/503 in client.mjs and cookie-router.mjs', async () => {
  // 1. src/core/pinterest/client.mjs
  const breaker1 = new PinterestCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
  breaker1.recordFailure(429);
  assert.equal(breaker1.state, 'OPEN');
  breaker1.openedAt = Date.now() - 6000;

  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Service Unavailable', { status: 503 });
    const res = await pinterestFetch('https://www.pinterest.com/resource/PinResource/get/', {
      circuitBreaker: breaker1,
      timeoutMs: 2000
    });
    assert.equal(res.status, 503);
    assert.equal(breaker1.state, 'OPEN', 'HTTP 503 in HALF_OPEN must call recordFailure and reopen breaker');
  } finally {
    globalThis.fetch = origFetch;
  }

  // 2. src/modules/newborn/cookie-router.mjs (NewbornCookieRouter + fetchRelatedModulesWithZoneA)
  const breaker2 = new PinterestCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
  breaker2.recordFailure(429);
  assert.equal(breaker2.state, 'OPEN');
  breaker2.openedAt = Date.now() - 6000;
  const router = new NewbornCookieRouter({
    rawCookie: '',
    circuitBreaker: breaker2,
    fetchImpl: async () => new Response('Bad Gateway', { status: 502 })
  });
  const routerRes = await router.requestJson('https://www.pinterest.com/resource/BaseSearchResource/get/', {
    timeoutMs: 2000
  });
  assert.equal(routerRes.status, 502);
  assert.equal(breaker2.state, 'OPEN', 'NewbornCookieRouter HTTP 502 in HALF_OPEN must call recordFailure and reopen breaker');

  const breaker3 = new PinterestCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
  breaker3.recordFailure(429);
  breaker3.openedAt = Date.now() - 6000;
  const zoneARes = await fetchRelatedModulesWithZoneA('https://www.pinterest.com/resource/RelatedModulesResource/get/', {
    pinId: '1098245059167667976',
    rawCookie: '',
    circuitBreaker: breaker3,
    fetchImpl: async () => new Response('Internal Server Error', { status: 500 })
  });
  assert.equal(zoneARes.status, 500);
  assert.equal(breaker3.state, 'OPEN', 'fetchRelatedModulesWithZoneA HTTP 500 in HALF_OPEN must call recordFailure and reopen breaker');
});

test('Wave 1.7: TtlSingleflightCache LRU epoch eviction preserves minEvictedEpoch floor and GET /api/pins/:id 404 never mutates edgeCache', async (t) => {
  // 1. TtlSingleflightCache LRU + minEvictedEpoch floor
  const cache = new TtlSingleflightCache({ maxPrefixEpochs: 3, maxKeyEpochs: 3 });
  cache.invalidate('creators:'); // epoch 1
  const staleStartEpoch = 0;

  // Touch 'creators:' via isWriteValid so it refreshes LRU recency, then flood 5 cold prefixes
  assert.equal(cache.isWriteValid('creators:list', staleStartEpoch), false);
  for (let i = 1; i <= 5; i++) {
    cache.invalidate(`cold:prefix:${i}:`);
  }
  assert.ok(cache.prefixEpochs.size <= 3);
  assert.ok(cache.minEvictedEpoch >= 1, 'Evicting old epoch entries must advance minEvictedEpoch floor');
  assert.equal(cache.isWriteValid('creators:list', staleStartEpoch), false, 'Stale pre-eviction write must remain blocked');
  assert.equal(cache.isWriteValid('creators:list', cache.epoch), true, 'Fresh post-eviction write must be allowed');

  // 2. Unauthenticated GET /api/pins/:id 404 does NOT mutate edgeCache epochs
  const noopSql = async () => [];
  noopSql.end = async () => {};
  const app = createFastifyApp({
    NODE_ENV: 'test',
    API_SECRET_KEY: 'wave1-pin-secret',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });
  t.after(async () => {
    await app.close();
  });

  const epochBefore = edgeCache.epoch;
  const prefixSizeBefore = edgeCache.prefixEpochs.size;
  const res404 = await app.inject({ method: 'GET', url: '/api/pins/1098245059167667976' });
  assert.equal(res404.statusCode, 404);
  assert.equal(edgeCache.epoch, epochBefore, 'Unauthenticated 404 on GET /api/pins/:id must NOT increment edgeCache.epoch');
  assert.equal(edgeCache.prefixEpochs.size, prefixSizeBefore, 'Unauthenticated 404 must NOT pollute edgeCache.prefixEpochs');
});

test('Wave 1.8: Auth & same-origin hardening — read-only GET /api/creators/board-detail, auth-gated ?_t=, and pae-shell.js same-origin x-api-key', async (t) => {
  const executedSql = [];
  let creatorsQueryCount = 0;
  const mockSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    executedSql.push(q);
    if (q.includes('FROM competitor_profiles') && q.includes('ORDER BY monthly_reach')) {
      creatorsQueryCount++;
      return [{ id: 1, username: 'chef_amelia', display_name: 'Chef Amelia', monthly_reach: 100000 }];
    }
    if (q.includes('FROM competitor_profiles') && q.includes('COUNT')) {
      return [{ total_creators: 1, total_reach: 100000, total_pins: 10 }];
    }
    if (q.includes('FROM competitor_profiles')) {
      return [{ id: 1, username: 'chef_amelia' }];
    }
    return [];
  };
  mockSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'test',
    API_SECRET_KEY: 'wave1-auth-secret',
    DATABASE_URL: '',
    SQL_CLIENT: mockSql
  });
  t.after(async () => {
    await app.close();
  });

  // 1. Unauthenticated GET /api/creators/board-detail with missing board_vase does NOT scrape or mutate DB
  let outboundFetches = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    outboundFetches++;
    return new Response('<html></html>', { status: 200 });
  };
  try {
    executedSql.length = 0;
    const boardRes = await app.inject({
      method: 'GET',
      url: '/api/creators/board-detail?username=chef_amelia&board=autumn-soups'
    });
    assert.equal(boardRes.statusCode, 200);
    assert.equal(outboundFetches, 0, 'Unauthenticated GET /api/creators/board-detail must NEVER scrape Pinterest');
    assert.equal(
      executedSql.some((q) => /\b(INSERT|DELETE|UPDATE)\b/i.test(q)),
      false,
      'Unauthenticated GET /api/creators/board-detail must NEVER execute DB writes'
    );
  } finally {
    globalThis.fetch = origFetch;
  }

  // 2. GET /api/creators?_t=... does NOT bust cache for unauthenticated callers, but DOES for authenticated callers
  edgeCache.clear();
  creatorsQueryCount = 0;
  const warmRes = await app.inject({ method: 'GET', url: '/api/creators?limit=5' });
  assert.equal(warmRes.statusCode, 200);
  const queriesAfterWarm = creatorsQueryCount;
  assert.ok(queriesAfterWarm >= 1);

  const unauthBustRes = await app.inject({ method: 'GET', url: '/api/creators?limit=5&_t=123456789' });
  assert.equal(unauthBustRes.statusCode, 200);
  assert.equal(creatorsQueryCount, queriesAfterWarm, 'Unauthenticated ?_t= must NOT bypass edge cache');

  const authBustRes = await app.inject({
    method: 'GET',
    url: '/api/creators?limit=5&_t=123456789',
    headers: { 'x-api-key': 'wave1-auth-secret' }
  });
  assert.equal(authBustRes.statusCode, 200);
  assert.equal(creatorsQueryCount, queriesAfterWarm * 2, 'Authenticated ?_t= should bypass cache');

  // 3. public/pae-shell.js restricts x-api-key strictly to same-origin /api/ URLs
  const shellRes = await app.inject({ method: 'GET', url: '/pae-shell.js' });
  assert.equal(shellRes.statusCode, 200);
  const fetchCalls = [];
  const win = {
    URL,
    Headers,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    location: { origin: 'https://pae.example.com' },
    localStorage: { getItem: (k) => (k === 'pae_admin_api_key' ? 'secret-admin-key' : null) },
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), key: new Headers(init.headers).get('x-api-key') });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  };
  win.window = win;
  win.globalThis = win;
  new vm.Script(shellRes.body, { filename: 'pae-shell.js' }).runInNewContext(win);

  await win.fetch('/api/creators');
  await win.fetch('https://pae.example.com/api/creators');
  await win.fetch('https://evil.com/api/steal');
  await win.fetch('//evil.com/api/steal');
  await win.fetch('https://pae.example.com/static/api/public');

  assert.equal(fetchCalls[0].key, 'secret-admin-key', 'Relative /api/ path must include x-api-key');
  assert.equal(fetchCalls[1].key, 'secret-admin-key', 'Same-origin /api/ URL must include x-api-key');
  assert.equal(fetchCalls[2].key, null, 'Cross-origin https://evil.com/api/ MUST NOT receive x-api-key');
  assert.equal(fetchCalls[3].key, null, 'Protocol-relative //evil.com/api/ MUST NOT receive x-api-key');
  assert.equal(fetchCalls[4].key, null, 'Non-/api/ path containing /api/ in middle MUST NOT receive x-api-key');
});

test('Wave 1.9: NewbornRunQueue eliminates enqueueNewbornRun TOCTOU races, prevents stuck running rows, and drains cleanly', async () => {
  clearNewbornInflightRunsForTest();
  await newbornBackgroundQueue.drain(2000);

  let insertCount = 0;
  let releaseWorker;
  const workerGate = new Promise((r) => { releaseWorker = r; });

  const mockSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    if (q.includes('INSERT INTO newborn_runs')) {
      await new Promise((r) => setTimeout(r, 20));
      insertCount++;
      return [{ id: 900 + insertCount, run_type: 'discovery', status: 'running', seed_queries: ['pasta'] }];
    }
    if (q.includes('FROM newborn_runs') && q.includes('WHERE id =')) {
      return [{ id: 901, run_type: 'discovery', status: 'running', seed_queries: ['pasta'] }];
    }
    return [];
  };

  try {
    const [first, second] = await Promise.all([
      enqueueNewbornRun(mockSql, {
        runType: 'discovery',
        seedQueries: ['pasta'],
        workerExecutor: async () => { await workerGate; }
      }),
      enqueueNewbornRun(mockSql, {
        runType: 'discovery',
        seedQueries: ['pasta'],
        workerExecutor: async () => { await workerGate; }
      })
    ]);

    assert.equal(insertCount, 1, 'Concurrent identical enqueueNewbornRun calls must insert strictly 1 row (no TOCTOU duplicate)');
    assert.equal(first.run_id, 901);
    assert.equal(second.run_id, 901);
    assert.equal(second.deduplicated, true);

    // Verify drain() waits for active worker to complete
    let drained = false;
    const drainPromise = newbornBackgroundQueue.drain(2000).then(() => { drained = true; });
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(drained, false, 'drain() must wait while background task is active');
    releaseWorker();
    await drainPromise;
    assert.equal(drained, true);
  } finally {
    releaseWorker();
    await newbornBackgroundQueue.drain(2000);
  }

  // Verify rejected enqueue marks inserted running row as failed and cleans up inflight entry
  const origAdd = newbornBackgroundQueue.add.bind(newbornBackgroundQueue);
  const failedUpdates = [];
  const rollbackSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    if (q.includes('INSERT INTO newborn_runs')) {
      return [{ id: 950, run_type: 'discovery', status: 'running', seed_queries: ['soup'] }];
    }
    if (q.includes('UPDATE newborn_runs') && q.includes("status = 'failed'")) {
      failedUpdates.push(q);
    }
    return [];
  };
  newbornBackgroundQueue.add = () => {
    const err = new Error('Newborn worker queue saturated');
    err.code = 'QUEUE_SATURATED';
    err.status = 503;
    return Promise.reject(err);
  };
  try {
    await assert.rejects(
      () => enqueueNewbornRun(rollbackSql, { runType: 'discovery', seedQueries: ['soup'] }),
      /saturated/i
    );
    assert.equal(failedUpdates.length, 1, 'Rejected enqueue must immediately mark inserted running row as failed');
  } finally {
    newbornBackgroundQueue.add = origAdd;
    clearNewbornInflightRunsForTest();
  }
});

// ============================================================================
// WORKSTREAM 3: Crawler Sharding & Mode C Folder Flush Fixes
// ============================================================================

test('Wave 1.10: newborn-fleet dispatch + worker round-trip preserves 100% of queries (no double-modulo drop) and seedBoards', async () => {
  const dispatchSql = async () => [{ total: 0 }];
  const parsedDispatch = parseNewbornFleetArgs(
    [
      '--mode=dispatch',
      '--target-mode=discovery',
      '--shards=3',
      '--force=true',
      '--query=q0,q1,q2,q3,q4,q5,/alice/board-one/,/bob/board-two/,/carol/board-three/'
    ],
    {}
  );
  const dispatchRes = await runNewbornFleetDispatch({
    sql: dispatchSql,
    parsedArgs: parsedDispatch,
    env: { GITHUB_EVENT_NAME: 'workflow_dispatch' }
  });

  assert.equal(dispatchRes.matrixTasks.length, 3);
  const collectedQueries = [];
  const collectedBoards = [];

  for (const task of dispatchRes.matrixTasks) {
    const workerArgs = parseNewbornFleetArgs([], {
      NEWBORN_MODE: task.mode,
      NEWBORN_QUERY: task.query,
      NEWBORN_BOARDS: task.boards,
      NEWBORN_PIN_IDS: task.pin_ids,
      WORKER_INDEX: String(task.worker_index),
      WORKER_TOTAL: String(task.worker_total)
    });
    collectedQueries.push(...workerArgs.seedQueries);
    collectedBoards.push(...workerArgs.seedBoards.map((b) => b.clean_path));
  }

  for (const expectedQ of ['q0', 'q1', 'q2', 'q3', 'q4', 'q5']) {
    assert.ok(collectedQueries.includes(expectedQ), `Expected query "${expectedQ}" to survive dispatch->worker sharding`);
  }
  assert.deepEqual(
    collectedBoards.sort(),
    ['/alice/board-one/', '/bob/board-two/', '/carol/board-three/'],
    'All seedBoards must serialize through matrixTasks and hydrate cleanly on workers'
  );
});

test('Wave 1.11: keyword-velocity-crawler flushBatchToHub updates keyword_serp_positions in Mode C folder_pin_partition', async () => {
  const queries = [];
  const mockSql = async (strings, ...values) => {
    queries.push({ q: buildTaggedSqlText(strings, values), values });
    return [];
  };

  // Explicit all_keyword_ids path
  await flushBatchToHub(
    [{ pin_id: '1098245059167667976', was_live_scraped: true }],
    { folder_id: 7, keyword: 'Dinner Folder', all_keyword_ids: [101, 102] },
    mockSql
  );
  const explicitUpdate = queries.find((e) => e.q.includes('UPDATE keyword_serp_positions'));
  assert.ok(explicitUpdate, 'Mode C folder flush must update keyword_serp_positions');
  assert.ok(explicitUpdate.values.some((v) => Array.isArray(v) && v.includes(101) && v.includes(102)));

  // Defense-in-depth fallback path deriving keyword IDs from folder_positions
  queries.length = 0;
  await flushBatchToHub(
    [{ pin_id: '1098245059167667976', was_live_scraped: true, folder_positions: [{ keyword_id: 205 }, { keyword_id: 206 }] }],
    { folder_id: 7, keyword: 'Dinner Folder' },
    mockSql
  );
  const fallbackUpdate = queries.find((e) => e.q.includes('UPDATE keyword_serp_positions'));
  assert.ok(fallbackUpdate, 'Folder flush fallback must derive keyword_ids from folder_positions');
  assert.ok(fallbackUpdate.values.some((v) => Array.isArray(v) && v.includes(205) && v.includes(206)));
});

// ============================================================================
// WORKSTREAM 4: UI P0 Fixes, Light-Mode Default & False-Success Toast Guards
// ============================================================================

test('Wave 1.12: Light-Mode default (§5.1), Launch Related Radar non-API link, no .dark on <body>, and Alpine v3 sidebar shortcut', async (t) => {
  const noopSql = async () => [];
  noopSql.end = async () => {};
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });
  t.after(async () => {
    await app.close();
  });

  // 1. /pin/:id: no hardcoded class="dark" on <html>, light default in pinDetailApp, Launch Related Radar does NOT link to /api/
  const pinRes = await app.inject({ method: 'GET', url: '/pin/1098245059167667976' });
  assert.equal(pinRes.statusCode, 200);
  const pinTree = parseHtmlElementTree(pinRes.body);
  const htmlNode = collectNodes(pinTree, (n) => n.tag === 'html')[0];
  assert.ok(htmlNode);
  assert.equal(String(htmlNode.attrs?.class || '').includes('dark'), false, '/pin/:id <html> must NOT hardcode class="dark"');

  const radarLinks = collectNodes(
    pinTree,
    (n) => n.tag === 'a' && String(n.attrs?.[':href'] || n.attrs?.href || '').includes('/api/keywords/visual-search')
  );
  assert.equal(radarLinks.length, 0, 'Launch Related Radar must NOT link directly to raw /api/keywords/visual-search JSON endpoint');

  const loadPageAssetScript = async (html, assetName) => {
    const match = html.match(new RegExp(`<script\\s+src="(/assets/js/${assetName}\\.js\\?v=[a-f0-9]{12})"><\\/script>`, 'i'));
    assert.ok(match, `Expected content-hashed /assets/js/${assetName}.js script tag in SSR HTML`);
    const assetRes = await app.inject({ method: 'GET', url: match[1] });
    assert.equal(assetRes.statusCode, 200, `Expected 200 OK for ${match[1]}`);
    return assetRes.body;
  };

  const pinCtrlScript = await loadPageAssetScript(pinRes.body, 'pin-details');
  assert.ok(pinCtrlScript.includes('function pinDetailApp('));
  const docClassList = new Set(['dark']);
  const pinVmCtx = {
    URL,
    URLSearchParams,
    console,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      documentElement: {
        classList: {
          add: (c) => docClassList.add(c),
          remove: (c) => docClassList.delete(c)
        }
      }
    },
    window: { location: { origin: 'https://pae.example.com', search: '' }, sessionStorage: { getItem: () => null, setItem: () => {} } }
  };
  pinVmCtx.globalThis = pinVmCtx;
  new vm.Script(pinCtrlScript).runInNewContext(pinVmCtx);
  const pinApp = pinVmCtx.pinDetailApp('1098245059167667976');
  assert.equal(pinApp.isDark, false, 'pinDetailApp must default to light mode');
  pinApp.initTheme();
  assert.equal(pinApp.isDark, false);
  assert.equal(docClassList.has('dark'), false, 'initTheme() with empty localStorage must remove dark class');

  // 2. /domains and /pulse: <body> must NOT apply .dark via :class
  for (const route of ['/domains', '/pulse']) {
    const r = await app.inject({ method: 'GET', url: route });
    assert.equal(r.statusCode, 200);
    const tree = parseHtmlElementTree(r.body);
    const bodyNode = collectNodes(tree, (n) => n.tag === 'body')[0];
    assert.equal(String(bodyNode.attrs?.[':class'] || '').includes('dark'), false, `${route} <body> must NOT bind .dark class`);
  }

  // 3. /keywords: keywordStudio().init() defaults to light mode when localStorage is empty
  const kwRes = await app.inject({ method: 'GET', url: '/keywords' });
  assert.equal(kwRes.statusCode, 200);
  const kwCtrlScript = await loadPageAssetScript(kwRes.body, 'keywords');
  assert.ok(kwCtrlScript.includes('function keywordStudio('));
  const kwClassSet = new Set(['dark']);
  const kwVmCtx = {
    URL,
    URLSearchParams,
    console,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      documentElement: { classList: { add: (c) => kwClassSet.add(c), remove: (c) => kwClassSet.delete(c) } },
      addEventListener: () => {}
    },
    window: {
      location: { origin: 'https://pae.example.com', pathname: '/keywords', search: '' },
      addEventListener: () => {},
      safeApiFetch: async () => new Response(JSON.stringify({ success: true, keywords: [], folders: [], settings: {} }), { status: 200 }),
      apiFetch: async () => new Response(JSON.stringify({ success: true, keywords: [], folders: [], settings: {} }), { status: 200 })
    }
  };
  kwVmCtx.globalThis = kwVmCtx;
  new vm.Script(kwCtrlScript).runInNewContext(kwVmCtx);
  const kwApp = kwVmCtx.keywordStudio();
  kwApp.$nextTick = () => {};
  kwApp.$watch = () => {};
  kwApp.fetchSettings = () => {};
  kwApp.fetchFolders = () => {};
  kwApp.fetchKeywords = () => {};
  kwApp.init();
  assert.equal(kwApp.darkMode, false, 'keywordStudio must default to light mode when pa_theme is unset');
  assert.equal(kwApp.isDark, false);
  assert.equal(kwClassSet.has('dark'), false);

  // 4. app-sidebar.mjs: Ctrl+B calls Alpine v3 Alpine.$data(el).toggleSidebar() and ignores input focus
  const sidebarScript = await loadPageAssetScript(kwRes.body, 'command-palette');
  assert.ok(sidebarScript.includes('refreshAppSidebarIcons'));
  let toggleCalls = 0;
  let keydownHandler = null;
  const activeElRef = { current: { tagName: 'BODY', isContentEditable: false } };
  const sidebarVm = {
    setTimeout: () => 1,
    document: {
      readyState: 'complete',
      get activeElement() { return activeElRef.current; },
      querySelector: () => ({ id: 'root-x-data' }),
      addEventListener: () => {}
    },
    window: {
      Alpine: { $data: () => ({ toggleSidebar: () => { toggleCalls++; } }) },
      addEventListener: (ev, fn) => { if (ev === 'keydown') keydownHandler = fn; }
    }
  };
  sidebarVm.globalThis = sidebarVm;
  new vm.Script(sidebarScript).runInNewContext(sidebarVm);
  assert.equal(typeof keydownHandler, 'function');

  // Focused on INPUT -> ignored
  activeElRef.current = { tagName: 'INPUT', isContentEditable: false };
  keydownHandler({ ctrlKey: true, key: 'b', preventDefault: () => {} });
  assert.equal(toggleCalls, 0, 'Ctrl+B must be ignored while focused inside an INPUT');

  // Focused on BODY -> toggles via Alpine v3 $data
  activeElRef.current = { tagName: 'BODY', isContentEditable: false };
  keydownHandler({ ctrlKey: true, key: 'b', preventDefault: () => {} });
  assert.equal(toggleCalls, 1, 'Ctrl+B must invoke Alpine.$data(el).toggleSidebar()');
});

test('Wave 1.13: Newborn polling pauses on document.hidden, enforces mutex & 5-error cap, and UI controllers block false-success toasts', async (t) => {
  const noopSql = async () => [];
  noopSql.end = async () => {};
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });
  t.after(async () => {
    await app.close();
  });

  const loadAssetScript = async (html, assetName) => {
    const match = html.match(new RegExp(`<script\\s+src="(/assets/js/${assetName}\\.js\\?v=[a-f0-9]{12})"><\\/script>`, 'i'));
    assert.ok(match, `Expected content-hashed /assets/js/${assetName}.js script tag in SSR HTML`);
    const assetRes = await app.inject({ method: 'GET', url: match[1] });
    assert.equal(assetRes.statusCode, 200, `Expected 200 OK for ${match[1]}`);
    return assetRes.body;
  };

  // 1. Newborn polling behavior (safeApiFetch, document.hidden, in-flight mutex, 5-failure bound)
  const nbRes = await app.inject({ method: 'GET', url: '/newborn' });
  assert.equal(nbRes.statusCode, 200);
  const nbCtrlScript = await loadAssetScript(nbRes.body, 'newborn');
  assert.ok(nbCtrlScript.includes('function newbornStudioApp('));

  let safeFetchCalls = 0;
  let rawFetchCalls = 0;
  let fetchResponder = async () => new Response(JSON.stringify({ run: { id: 55, status: 'running' } }), { status: 200 });
  const nbToasts = [];
  const hiddenRef = { value: false };
  const nbVmCtx = {
    URL,
    URLSearchParams,
    console,
    setInterval: () => 42,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async () => { rawFetchCalls++; return new Response('{}', { status: 200 }); },
    document: {
      get hidden() { return hiddenRef.value; },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    window: {
      location: { origin: 'https://pae.example.com', search: '' },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
      PAE: { toast: (msg, type) => nbToasts.push({ msg, type }) },
      safeApiFetch: async (...a) => {
        safeFetchCalls++;
        return fetchResponder(...a);
      }
    }
  };
  nbVmCtx.globalThis = nbVmCtx;
  new vm.Script(nbCtrlScript).runInNewContext(nbVmCtx);
  const nbApp = nbVmCtx.newbornStudioApp();

  // Hidden tab skips polling fetch
  hiddenRef.value = true;
  await nbApp.pollRunOnce(55);
  assert.equal(safeFetchCalls, 0, 'pollRunOnce must pause when document.hidden is true');
  assert.equal(rawFetchCalls, 0, 'apiJson must route through safeApiFetch, never raw fetch');

  // Visible tab enforces in-flight mutex
  hiddenRef.value = false;
  let releasePending;
  fetchResponder = () => new Promise((r) => {
    releasePending = () => r(new Response(JSON.stringify({ run: { id: 55, status: 'running' } }), { status: 200 }));
  });
  const p1 = nbApp.pollRunOnce(55);
  const p2 = nbApp.pollRunOnce(55);
  assert.equal(safeFetchCalls, 1, 'In-flight mutex must prevent overlapping poll requests');
  releasePending();
  await Promise.all([p1, p2]);

  // 5 consecutive errors halt polling and emit error toast
  nbApp.isPollingRun = true;
  nbApp.pollTimerId = 42;
  fetchResponder = async () => new Response(JSON.stringify({ error: 'DB_BUSY' }), { status: 503 });
  for (let i = 0; i < 5; i++) {
    await nbApp.pollRunOnce(55);
  }
  assert.equal(nbApp.isPollingRun, false, 'Polling must stop after 5 consecutive failures');
  assert.equal(nbApp.pollTimerId, null);
  assert.ok(nbToasts.some((toast) => toast.type === 'error' && toast.msg.includes('5 consecutive errors')));

  // 2. Dashboard creators false-success toast guards
  const creatorsMethodsCode = `({ ${getDashboardCreatorsFleetMethods()}\n${getDashboardCreatorsDossierMethods()} })`;
  const dashToasts = [];
  const creatorsVm = {
    console,
    setTimeout: (fn) => { fn(); return 1; },
    window: {
      PAE: { confirm: async () => true },
      safeApiFetch: async () => new Response(JSON.stringify({ error: 'FAIL' }), { status: 500 }),
      apiFetch: async () => new Response(JSON.stringify({ error: 'FAIL' }), { status: 500 })
    }
  };
  const creatorMethods = new vm.Script(creatorsMethodsCode).runInNewContext(creatorsVm);
  const creatorInst = Object.assign({
    competitors: [{ id: 1, username: 'alice', is_active: true }],
    selectedCompetitorIds: [1],
    activeCreatorSnapshots: [{ id: 77 }],
    getApiUrl: (u) => u,
    fetchCompetitors: async () => {},
    showToast: (m) => dashToasts.push(m),
    $nextTick: () => {}
  }, creatorMethods);

  await creatorInst.syncAllCompetitors();
  assert.equal(dashToasts.some((m) => m.includes('All competitor profiles updated successfully')), false, 'syncAllCompetitors must NOT toast full success on HTTP 500');

  dashToasts.length = 0;
  await creatorInst.bulkPulseSelected();
  assert.equal(dashToasts.some((m) => m.includes('1/1')), false, 'bulkPulseSelected must NOT count HTTP 500 as success');

  dashToasts.length = 0;
  await creatorInst.bulkToggleSelectedStatus(false);
  assert.equal(dashToasts.some((m) => m.includes('Paused ingestion')), false, 'bulkToggleSelectedStatus must NOT toast success on HTTP 500');
  assert.equal(creatorInst.competitors[0].is_active, true, 'Optimistic status must revert when all updates fail');

  dashToasts.length = 0;
  await creatorInst.deleteSnapshotAction(77);
  assert.equal(dashToasts.some((m) => m.includes('Snapshot deleted successfully')), false, 'deleteSnapshotAction must NOT toast success on HTTP 500');
  assert.equal(creatorInst.activeCreatorSnapshots.length, 1, 'Snapshot must remain in list on HTTP 500');

  // 3. Discovery submitAddToFolder aborts when POST /api/folders fails
  const discRes = await app.inject({ method: 'GET', url: '/discovery' });
  const discScript = await loadAssetScript(discRes.body, 'discovery');
  assert.ok(discScript.includes('function discoveryApp('));
  const discToasts = [];
  const discFetchUrls = [];
  const discVm = {
    console,
    URLSearchParams,
    setTimeout: () => 1,
    window: {
      apiFetch: async (url) => {
        discFetchUrls.push(String(url));
        return new Response(JSON.stringify({ error: 'CREATE_FAILED' }), { status: 500 });
      }
    }
  };
  discVm.globalThis = discVm;
  new vm.Script(discScript).runInNewContext(discVm);
  const discApp = discVm.discoveryApp();
  discApp.selectedKeywords = ['autumn soup'];
  discApp.newFolderName = 'Broken Folder';
  discApp.showToast = (msg, type) => discToasts.push({ msg, type });
  await discApp.submitAddToFolder();
  assert.deepEqual(discFetchUrls, ['/api/folders'], 'submitAddToFolder must abort instead of calling bulk-import when folder creation fails');
  assert.equal(discToasts.some((toast) => toast.msg.includes('Assigned')), false);
  assert.ok(discToasts.some((toast) => toast.type === 'error'));

  // 4. Keywords toggleCurrentKeywordFolder does NOT toast success on HTTP 500
  const kwRes = await app.inject({ method: 'GET', url: '/keywords' });
  const kwScript = await loadAssetScript(kwRes.body, 'keywords');
  assert.ok(kwScript.includes('function keywordStudio('));
  const kwToasts = [];
  const kwVm = {
    console,
    localStorage: { getItem: () => null },
    window: {
      location: { search: '' },
      apiFetch: async () => new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 })
    }
  };
  kwVm.globalThis = kwVm;
  new vm.Script(kwScript).runInNewContext(kwVm);
  const kwInst = kwVm.keywordStudio();
  kwInst.selectedKeyword = { id: 9 };
  kwInst.currentKeywordFolders = [];
  kwInst.showToast = (msg, type) => kwToasts.push({ msg, type });
  await kwInst.toggleCurrentKeywordFolder(4);
  assert.equal(kwToasts.some((toast) => toast.type === 'success'), false, 'toggleCurrentKeywordFolder must NOT toast success on HTTP 403');
  assert.ok(kwToasts.some((toast) => toast.type === 'error'));

  // 5. Pulse fetchPulseData(true) does NOT toast success when payload returns success: false
  const pulseRes = await app.inject({ method: 'GET', url: '/pulse' });
  const pulseScript = await loadAssetScript(pulseRes.body, 'pulse');
  assert.ok(pulseScript.includes('function pulseStudioApp('));
  const pulseToasts = [];
  const pulseVm = {
    console,
    URLSearchParams,
    setTimeout: () => 1,
    localStorage: { getItem: () => null },
    window: {
      apiFetch: async () => new Response(JSON.stringify({ success: false, message: 'Pulse degraded' }), { status: 200 })
    }
  };
  pulseVm.globalThis = pulseVm;
  new vm.Script(pulseScript).runInNewContext(pulseVm);
  const pulseInst = pulseVm.pulseStudioApp('');
  pulseInst.$nextTick = () => {};
  pulseInst.showToast = (msg, type) => pulseToasts.push({ msg, type });
  await pulseInst.fetchPulseData(true);
  assert.equal(pulseToasts.some((toast) => toast.type === 'success'), false, 'fetchPulseData must NOT toast success when success === false');
  assert.ok(pulseToasts.some((toast) => toast.type === 'error'));
});
