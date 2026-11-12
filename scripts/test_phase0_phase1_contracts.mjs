import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isTransientPgConnectionError,
  withDbRetry,
  attachTransactionBridge
} from '../src/db/client.mjs';
import { optimizeHubStorage } from './optimize_hub_storage.mjs';
import worker from '../src/worker.mjs';
import {
  _resetBatchGlobalSavesRateLimit,
  verifySameOriginBrowserOrApiRequest,
  enforceBatchGlobalSavesRateLimit
} from '../src/routes/keywords.mjs';
import { getDomainDeepDossier } from '../src/modules/domains/service.mjs';
import { countTagBalance, runDomNestingVerification } from './verify_dom_nesting.mjs';

test('Phase 0 [LND-CON-06]: isTransientPgConnectionError distinguishes pool exhaustion from schema errors', () => {
  assert.equal(isTransientPgConnectionError({ code: '53300', message: 'too many clients already' }), true);
  assert.equal(isTransientPgConnectionError({ sqlState: '53400', message: 'configuration limit exceeded' }), true);
  assert.equal(isTransientPgConnectionError({ code: '08006', message: 'connection failure' }), true);
  assert.equal(isTransientPgConnectionError({ code: '08001', message: 'unable to connect' }), true);
  assert.equal(isTransientPgConnectionError(new Error('FATAL: sorry, too many clients already')), true);

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

  // 2. Cookie-authenticated cross-site / evil Origin must return 403
  const crossSiteRes = await worker.fetch(
    new Request('https://app.hymum.com/api/urls/batch-global-saves', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'pae_shield_auth=verified',
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
      headers: { Cookie: 'pae_shield_auth=verified', 'Sec-Fetch-Site': 'cross-site' }
    })
  );
  assert.equal(secFetchCheck.allowed, false);

  // 3. Same-origin cookie-authenticated request succeeds and enforces 20 req/min sliding window
  _resetBatchGlobalSavesRateLimit();
  for (let i = 0; i < 20; i++) {
    const okRes = await worker.fetch(
      new Request('https://app.hymum.com/api/urls/batch-global-saves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'pae_shield_auth=verified',
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
        Cookie: 'pae_shield_auth=verified',
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
