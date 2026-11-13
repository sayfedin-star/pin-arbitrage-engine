import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isTransientPgConnectionError,
  isStatementTimeoutError,
  withDbRetry,
  attachTransactionBridge,
  createSqlClient
} from '../src/db/client.mjs';
import { optimizeHubStorage } from './optimize_hub_storage.mjs';
import { handleAppRequest } from '../src/server.mjs';
const worker = { fetch: handleAppRequest };
import {
  _resetBatchGlobalSavesRateLimit,
  verifySameOriginBrowserOrApiRequest,
  enforceBatchGlobalSavesRateLimit
} from '../src/routes/keywords.mjs';
import { getDomainDeepDossier } from '../src/modules/domains/service.mjs';
import { countTagBalance, runDomNestingVerification } from './verify_dom_nesting.mjs';

test('Phase 0 [LND-CON-06]: isTransientPgConnectionError excludes 57014 while isStatementTimeoutError isolates statement timeouts', () => {
  assert.equal(isTransientPgConnectionError({ code: '53300', message: 'too many clients already' }), true);
  assert.equal(isTransientPgConnectionError({ sqlState: '53400', message: 'configuration limit exceeded' }), true);
  assert.equal(isTransientPgConnectionError({ code: '08006', message: 'connection failure' }), true);
  assert.equal(isTransientPgConnectionError({ code: '08001', message: 'unable to connect' }), true);
  assert.equal(isTransientPgConnectionError(new Error('FATAL: sorry, too many clients already')), true);

  // 57014 must NOT trigger global automatic retries on Web APIs or non-idempotent writes
  assert.equal(isTransientPgConnectionError({ code: '57014', message: 'canceling statement due to statement timeout' }), false);
  assert.equal(isTransientPgConnectionError(new Error('ERROR: canceling statement due to statement timeout')), false);

  assert.equal(isStatementTimeoutError({ code: '57014', message: 'canceling statement due to statement timeout' }), true);
  assert.equal(isStatementTimeoutError(new Error('ERROR: canceling statement due to statement timeout')), true);
  assert.equal(isStatementTimeoutError({ code: '42P01', message: 'relation does not exist' }), false);

  assert.equal(isTransientPgConnectionError({ code: '42P01', message: 'relation does not exist' }), false);
  assert.equal(isTransientPgConnectionError({ code: '21000', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' }), false);
  assert.equal(isTransientPgConnectionError(null), false);
});

test('Phase 0 [LND-CON-06]: withDbRetry applies bounded exponential backoff + jitter and aborts on non-transient errors', async () => {
  const recordedDelays = [];
  let attempts = 0;

  const recovered = await withDbRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('sorry, too many clients already');
        err.code = '53300';
        throw err;
      }
      return 'ok-recovered';
    },
    {
      maxRetries: 4,
      baseDelayMs: 50,
      maxDelayMs: 400,
      jitterFn: () => 0.5,
      sleepFn: async (ms) => {
        recordedDelays.push(ms);
      }
    }
  );

  assert.equal(recovered, 'ok-recovered');
  assert.equal(attempts, 3);
  assert.deepEqual(recordedDelays, [62, 125]);

  let nonTransientAttempts = 0;
  await assert.rejects(
    () => withDbRetry(
      async () => {
        nonTransientAttempts += 1;
        const err = new Error('syntax error');
        err.code = '42601';
        throw err;
      },
      { maxRetries: 3, sleepFn: async () => {} }
    ),
    /syntax error/
  );
  assert.equal(nonTransientAttempts, 1);
});

test('Phase 0 [LND-CON-06]: attachTransactionBridge retries SQLSTATE 53300 on await while keeping nested PendingQuery fragments lazy', async () => {
  let fragmentExecuted = 0;
  let outerAttempts = 0;

  function makePendingQuery(sqlText, isFragment = false) {
    return {
      __sqlText: sqlText,
      then(resolve, reject) {
        if (isFragment) {
          fragmentExecuted += 1;
          return Promise.resolve([{ bad: true }]).then(resolve, reject);
        }
        outerAttempts += 1;
        if (outerAttempts === 1) {
          const err = new Error('remaining connection slots are reserved');
          err.code = '53300';
          return Promise.reject(err).then(resolve, reject);
        }
        return Promise.resolve([{ sqlText }]).then(resolve, reject);
      }
    };
  }

  const fakePg = (strings, ...values) => {
    const joined = strings.reduce((acc, part, idx) => {
      const val = idx < values.length ? values[idx] : '';
      const rendered = val && typeof val === 'object' && val.__sqlText ? val.__sqlText : String(val);
      return acc + part + rendered;
    }, '');
    const isFrag = joined.startsWith('AND status =');
    return makePendingQuery(joined, isFrag);
  };
  fakePg.begin = async (fn) => fn(fakePg);
  fakePg.unsafe = (query) => makePendingQuery(query, false);

  const bridged = attachTransactionBridge(fakePg, {
    maxRetries: 2,
    baseDelayMs: 10,
    jitterFn: () => 0,
    sleepFn: async () => {}
  });

  // Nested fragment must NOT execute when interpolated
  const fragment = bridged`AND status = 'active'`;
  const rows = await bridged`SELECT * FROM tracked_keywords WHERE 1=1 ${fragment}`;

  assert.equal(fragmentExecuted, 0, 'Nested PendingQuery fragment must remain lazy and unawaited');
  assert.equal(outerAttempts, 2, 'Outer query must retry once on SQLSTATE 53300');
  assert.equal(rows[0].sqlText.includes("AND status = 'active'"), true);

  // `.transaction()` delegates cleanly to `.begin()`
  const txRes = await bridged.transaction([
    (tx) => tx`SELECT 1`
  ]);
  assert.equal(Array.isArray(txRes), true);
  assert.equal(txRes.length, 1);
});

test('Phase 0 [LND-SQL-02]: optimizeHubStorage skips VIEW keyword_pins_snapshots and vacuums base tables in unified_postgres', async () => {
  const prevTopology = process.env.DATABASE_TOPOLOGY;
  process.env.DATABASE_TOPOLOGY = 'unified_postgres';

  const executedQueries = [];
  const mockSql = (strings) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    executedQueries.push(text);
    return Promise.resolve([]);
  };

  try {
    const res = await optimizeHubStorage(mockSql);
    assert.equal(res.prunedSnapshots, 0);

    const viewDeletes = executedQueries.filter(q => /DELETE\s+FROM\s+keyword_pins_snapshots/i.test(q));
    const viewVacuums = executedQueries.filter(q => /VACUUM\s*\(ANALYZE\)\s*keyword_pins_snapshots/i.test(q));
    assert.equal(viewDeletes.length, 0, 'Must never DELETE from keyword_pins_snapshots VIEW');
    assert.equal(viewVacuums.length, 0, 'Must never VACUUM keyword_pins_snapshots VIEW');

    assert.equal(res.vacuumedTables.includes('pin_serp_positions'), true);
    assert.equal(res.vacuumedTables.includes('pins_daily_metrics'), true);
    assert.equal(res.vacuumedTables.includes('keyword_pins_snapshots'), false);
  } finally {
    if (prevTopology === undefined) delete process.env.DATABASE_TOPOLOGY;
    else process.env.DATABASE_TOPOLOGY = prevTopology;
  }
});

test('Phase 1 [LND-SEC-07]: /api/urls/batch-global-saves enforces fail-closed auth, origin checks, and 20 req/min rate limit', async () => {
  _resetBatchGlobalSavesRateLimit();

  const prodEnv = { API_SECRET_KEY: 'top-secret-key-xyz' };

  // 1. Unauthenticated POST must fail closed (never exempted)
  const unauthRes = await worker.fetch(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com/post'] })
    }),
    prodEnv,
    { waitUntil() {} }
  );
  assert.equal(unauthRes.status, 401);

  // 1b. Spoofed pae_shield_auth cookie without x-api-key/Bearer MUST fail closed with 401
  const spoofedCookieRes = await worker.fetch(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'pae_shield_auth=verified',
        Origin: 'https://app.hymum.com'
      },
      body: JSON.stringify({ urls: ['https://example.com/post'] })
    }),
    prodEnv,
    { waitUntil() {} }
  );
  assert.equal(spoofedCookieRes.status, 401);

  // 2. API-authenticated cross-site / evil Origin must return 403
  const crossSiteRes = await worker.fetch(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'top-secret-key-xyz',
        Origin: 'https://evil.example',
        'cf-connecting-ip': '203.0.113.10'
      },
      body: JSON.stringify({ urls: ['https://example.com/post'] })
    }),
    prodEnv,
    { waitUntil() {} }
  );
  assert.equal(crossSiteRes.status, 403);

  const secFetchCheck = verifySameOriginBrowserOrApiRequest(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: { 'x-api-key': 'top-secret-key-xyz', 'Sec-Fetch-Site': 'cross-site' }
    })
  );
  assert.equal(secFetchCheck.allowed, false);

  // 3. Same-origin authenticated request succeeds and enforces 20 req/min sliding window
  _resetBatchGlobalSavesRateLimit();
  for (let i = 0; i < 20; i++) {
    const okRes = await worker.fetch(
      new Request('https://app.hymum.com/api/urls/batch-global-saves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'top-secret-key-xyz',
          Origin: 'https://app.hymum.com',
          'Sec-Fetch-Site': 'same-origin',
          'cf-connecting-ip': '203.0.113.42'
        },
        body: JSON.stringify({ urls: [] })
      }),
      prodEnv,
      { waitUntil() {} }
    );
    assert.equal(okRes.status, 200);
  }

  const limitedRes = await worker.fetch(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'top-secret-key-xyz',
        Origin: 'https://app.hymum.com',
        'Sec-Fetch-Site': 'same-origin',
        'cf-connecting-ip': '203.0.113.42'
      },
      body: JSON.stringify({ urls: [] })
    }),
    prodEnv,
    { waitUntil() {} }
  );
  assert.equal(limitedRes.status, 429);
  assert.ok(Number(limitedRes.headers.get('Retry-After')) >= 1);

  // Sliding window reset recovers after 60s
  const directCheck = enforceBatchGlobalSavesRateLimit(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.42' }
    }),
    Date.now() + 61_000
  );
  assert.equal(directCheck.limited, false);
});

test('Phase 1 [LND-PERF-03]: getDomainDeepDossier issues SARGable clean_domain queries without LOWER(TRIM(...))', async () => {
  const queries = [];
  const mockSql = (strings) => {
    const sqlText = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push(sqlText);
    return Promise.resolve([]);
  };

  await getDomainDeepDossier(mockSql, 'example.com');

  const dossierWhereQueries = queries.filter(q =>
    /FROM\s+(keyword_serp_current|pa_pins|competitor_pins|keyword_displaced_index|universal_master_pins)/i.test(q)
  );
  assert.equal(dossierWhereQueries.length >= 5, true, 'Expected 5 core domain dossier table queries');

  for (const q of dossierWhereQueries) {
    assert.equal(/\bclean_domain\s*=/i.test(q), true, `Expected SARGable clean_domain equality in query: ${q}`);
    assert.equal(/LOWER\s*\(\s*TRIM\s*\(/i.test(q), false, `Disallowed non-SARGable LOWER(TRIM()) found in: ${q}`);
  }
});

test('Phase 1 [LND-DOM-08]: SSR DOM tag balance & nesting verifier passes across all 8 views and catches imbalances', () => {
  assert.equal(runDomNestingVerification(), true);

  assert.throws(
    () => countTagBalance('<main><div></div></div></main>', 'extra-closing-div'),
    /tag imbalance/i
  );
  assert.throws(
    () => countTagBalance('<main><div></div></main></main>', 'extra-closing-main'),
    /<main> count imbalance/i
  );
});

test('Phase 0 & Phase 1 structural artifacts exist cleanly (Migration 057, zero hardcoded secret, CRAWL_RUN_ID barrier)', () => {
  const mig057 = fs.readFileSync(path.resolve(process.cwd(), 'scripts/migrations/057_pa_pins_clean_domain_and_indexes.sql'), 'utf8');
  assert.match(mig057, /ALTER TABLE\s+(?:public\.)?pa_pins\s+ADD COLUMN IF NOT EXISTS\s+clean_domain/i);
  assert.match(mig057, /idx_pa_pins_clean_domain/i);
  assert.match(mig057, /idx_cp_clean_domain/i);

  const remediateSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/remediate-canonical-poisoning.mjs'), 'utf8');
  assert.equal(/pae_secure_password_2026/.test(remediateSrc), false);
});

test('Fleet 20-Runner Thundering-Herd, Non-Stacking Retry & Timeout Shields (behavioral + contract checks)', async () => {
  // 1. Behavioral check: attachTransactionBridge does NOT retry 57014 globally,
  //    and sql.noRetry inside withDbRetry(..., { maxRetries: 2, retryOnStatementTimeout: true }) executes at most 3 total attempts (no 20x stacking)
  let rawCallCount = 0;
  function makeFailingQuery(code, message) {
    return {
      then(resolve, reject) {
        rawCallCount += 1;
        const err = new Error(message);
        err.code = code;
        return Promise.reject(err).then(resolve, reject);
      }
    };
  }

  const fakePg57014 = () => makeFailingQuery('57014', 'canceling statement due to statement timeout');
  fakePg57014.begin = async (fn) => fn(fakePg57014);
  const bridged = attachTransactionBridge(fakePg57014, { maxRetries: 4, baseDelayMs: 1, maxDelayMs: 2, sleepFn: async () => {} });

  rawCallCount = 0;
  await assert.rejects(async () => await bridged`SELECT 1`, /statement timeout/);
  assert.equal(rawCallCount, 1, 'Global bridged client must fail fast (1 attempt) on SQLSTATE 57014');

  const fakePg53300 = () => makeFailingQuery('53300', 'too many clients already');
  fakePg53300.begin = async (fn) => fn(fakePg53300);
  const bridged53300 = attachTransactionBridge(fakePg53300, { maxRetries: 4, baseDelayMs: 1, maxDelayMs: 2, sleepFn: async () => {} });

  rawCallCount = 0;
  await assert.rejects(
    () => withDbRetry(() => bridged53300.noRetry`SELECT 1`, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, retryOnStatementTimeout: true, sleepFn: async () => {} }),
    /too many clients/
  );
  assert.equal(rawCallCount, 3, 'sql.noRetry inside withDbRetry(maxRetries=2) must strictly execute 3 times (no 5x3=15 stacking)');

  // 2. Behavioral check: createSqlClient must NOT pass deprecated `timeout` option (which overwrites idle_timeout and logs noise)
  const client = createSqlClient('postgres://user:pass@127.0.0.1:5432/testdb');
  try {
    assert.equal(client.options.idle_timeout, 20, 'idle_timeout must stay 20 without being overwritten by deprecated timeout option');
    assert.equal(Object.hasOwn(client.options, 'timeout'), false, 'deprecated postgres.js timeout option must not be configured');
  } finally {
    await client.end({ timeout: 0 }).catch(() => {});
  }

  // 3. Behavioral check: attachTransactionBridge must pass scoped `tx` (NEVER outer pool client)
  //    to lazy array builders, and `noRetry.transaction` must bypass retry wrapper cleanly.
  let beginCalls = 0;
  let outerClientCalls = 0;
  let txScopedCalls = 0;
  const mockPoolClient = () => {
    outerClientCalls += 1;
    return Promise.resolve([{ outer: true }]);
  };
  mockPoolClient.begin = async (fn) => {
    beginCalls += 1;
    const txScoped = () => {
      txScopedCalls += 1;
      return Promise.resolve([{ txScoped: true }]);
    };
    return await fn(txScoped);
  };
  const universalMock = attachTransactionBridge(mockPoolClient, { maxRetries: 2, baseDelayMs: 1, sleepFn: async () => {} });
  assert.equal(universalMock.__unifiedTxAttached, true);
  assert.equal(universalMock.__atomicBuilderWrapped, true);
  await universalMock.transaction([
    (tx) => tx`SELECT 1`,
    (tx) => tx`SELECT 2`
  ]);
  assert.equal(beginCalls, 1, 'transaction() must open exactly one begin() block');
  assert.equal(outerClientCalls, 0, 'Lazy transaction builders must NEVER receive outer pool client (breaks atomicity & deadlocks pool)');
  assert.equal(txScopedCalls, 2, 'Both lazy transaction builders must execute inside scoped tx connection');

  // Behavioral check: noRetry.transaction bypasses begin() retry wrapper
  let retryBeginAttempts = 0;
  const failingBeginClient = () => Promise.resolve([]);
  failingBeginClient.begin = async () => {
    retryBeginAttempts += 1;
    const err = new Error('too many clients already');
    err.code = '53300';
    throw err;
  };
  const bridgedNoRetryTx = attachTransactionBridge(failingBeginClient, { maxRetries: 3, baseDelayMs: 1, sleepFn: async () => {} });
  await assert.rejects(() => bridgedNoRetryTx.noRetry.transaction([(tx) => tx`SELECT 1`]), /too many clients/);
  assert.equal(retryBeginAttempts, 1, 'sql.noRetry.transaction() must execute begin() once without stacking retries');

  // 4. Behavioral check: wrapPendingQueryRetry executes 1 + maxRetries total attempts (NEVER 1 + 1 + maxRetries) and NEVER fires a 0ms retry #1
  let persistentCalls = 0;
  const recordedRetryDelays = [];
  const persistent53300Client = () => ({
    then(resolve, reject) {
      persistentCalls += 1;
      const err = new Error('too many clients already');
      err.code = '53300';
      return Promise.reject(err).then(resolve, reject);
    }
  });
  persistent53300Client.begin = async (fn) => fn(persistent53300Client);
  const exactRetryClient = attachTransactionBridge(persistent53300Client, {
    maxRetries: 2,
    baseDelayMs: 25,
    maxDelayMs: 200,
    jitterFn: () => 0,
    sleepFn: async (ms) => { recordedRetryDelays.push(ms); }
  });
  await assert.rejects(async () => await exactRetryClient`SELECT 1`, /too many clients/);
  assert.equal(persistentCalls, 3, 'Total executions for maxRetries=2 must be strictly 1 + 2 = 3 (no extra attempt=0)');
  assert.deepEqual(recordedRetryDelays, [25, 50], 'Retry #1 must sleep baseDelayMs (no 0ms immediate retry)');

  // 5. Structural contract checks
  const dbClientSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/db/client.mjs'), 'utf8');
  assert.match(dbClientSrc, /const defaultStatementTimeoutMs = isCi \? 45000 : 15000;/);

  const kwServiceSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/keywords/service.mjs'), 'utf8');
  assert.match(kwServiceSrc, /insertNewPinsBatch\(sql, newSerpPins/);
  assert.match(kwServiceSrc, /existingSerpPins\.length > 0 && !options\?\.skip_top_enrich/);
  assert.equal(kwServiceSrc.includes('shouldSkipShard'), false);
  assert.equal(kwServiceSrc.includes('isUnifiedPostgres'), false);

  const crawlerSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-velocity-crawler.mjs'), 'utf8');
  assert.match(crawlerSrc, /const BARRIER_TIMEOUT_MS = 150000;/);
  assert.match(crawlerSrc, /await sleep\(workerIndex \* 350\);/);
  assert.match(crawlerSrc, /withDbRetry\(\(\) => phase1bSql/);
  assert.match(crawlerSrc, /const FLUSH_TIMEOUT_MS = 65000;/);
  assert.equal(crawlerSrc.includes('await syncTask.catch'), false, 'finally must never await syncTask synchronously after timeout');
  assert.equal(crawlerSrc.includes('${runStartTime}'), false, 'Displaced index SQL must not compare against VM runStartTime clock');
  assert.equal(crawlerSrc.includes('throw new Error(`[Phase 1A Total Failure]'), false);

  const workflowSrc = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/keyword-intelligence-velocity.yml'), 'utf8');
  assert.match(workflowSrc, /STAGE1_RESULT:\s*\$\{\{\s*needs\.crawl-fleet\.result\s*\}\}/);
  assert.match(workflowSrc, /SKIP_MV_REFRESH:\s*'true'/);
});

test('Phase 0 [SEC-HARDENING]: wake-shield fails closed (503) without PIN/key and server.mjs has zero createMockSql', async () => {
  const wakeShieldMod = await import('../workers/wake-shield/src/index.mjs');
  const res = await wakeShieldMod.default.fetch(
    new Request('https://app.hymum.com/'),
    {},
    { waitUntil() {} }
  );
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'AUTH_NOT_CONFIGURED');

  const serverMod = await import('../src/server.mjs');
  assert.equal(typeof serverMod.createMockSql, 'undefined', 'createMockSql must be completely removed from src/server.mjs');

  const prevDbUrl = process.env.DATABASE_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(serverMod.getServerSqlClient(''), null, 'getServerSqlClient must return null when DATABASE_URL is absent');
    await assert.rejects(
      () => serverMod.startServer(0, '127.0.0.1', {}),
      /DATABASE_URL is not configured/
    );
  } finally {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  }
});


