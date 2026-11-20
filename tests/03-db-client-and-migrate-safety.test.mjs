import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import {
  isReadOnlyQuery,
  withDbRetry,
  attachTransactionBridge,
  createSqlClient
} from '../src/db/client.mjs';
import {
  calculateChecksum,
  getAppliedMigrations,
  findAppliedMigration,
  getMigrationFiles,
  runMigrations,
  listMigrations
} from '../scripts/migrate.mjs';
import { startInstaBoxActivityLease } from '../scripts/lib/fleet-runner.mjs';
import { patchPostgresFiles } from '../scripts/patch-postgres.mjs';

test('isReadOnlyQuery distinguishes pure read queries from locking, mutating, and multi-statement SQL', () => {
  assert.equal(isReadOnlyQuery('SELECT id, keyword FROM tracked_keywords WHERE is_active = TRUE;'), true);
  assert.equal(isReadOnlyQuery('EXPLAIN ANALYZE SELECT 1'), true);
  assert.equal(isReadOnlyQuery('SHOW statement_timeout'), true);
  assert.equal(isReadOnlyQuery("SELECT 'DROP TABLE users; -- literal' AS label"), true);
  assert.equal(isReadOnlyQuery('/* nested /* INSERT INTO x */ comment */ WITH cte AS (SELECT 1) SELECT * FROM cte'), true);

  assert.equal(isReadOnlyQuery('INSERT INTO tracked_keywords (keyword) VALUES ($1)'), false);
  assert.equal(isReadOnlyQuery('UPDATE universal_master_pins SET save_count = 10 WHERE pin_id = $1'), false);
  assert.equal(isReadOnlyQuery('WITH d AS (DELETE FROM tracked_keywords RETURNING id) SELECT * FROM d'), false);
  assert.equal(isReadOnlyQuery('SELECT * FROM tracked_keywords WHERE id = 1 FOR UPDATE'), false);
  assert.equal(isReadOnlyQuery("SELECT nextval('tracked_keywords_id_seq')"), false);
  assert.equal(isReadOnlyQuery('SELECT pg_advisory_lock(42)'), false);
  assert.equal(isReadOnlyQuery('SELECT 1; SELECT 2'), false);
});

test('withDbRetry and attachTransactionBridge retry transient read drops and pre-callback 53300, but NEVER replay write callbacks', async () => {
  // 1. Direct withDbRetry on transient 53300
  let readAttempts = 0;
  const rows = await withDbRetry(
    async () => {
      readAttempts++;
      if (readAttempts < 3) {
        const err = new Error('sorry, too many clients already');
        err.code = '53300';
        throw err;
      }
      return [{ ok: 1 }];
    },
    { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 20, sleepFn: async () => {} }
  );
  assert.equal(readAttempts, 3);
  assert.deepEqual(rows, [{ ok: 1 }]);

  // 2. Tagged-template read query retries vs write query does NOT retry
  let selectCalls = 0;
  let insertCalls = 0;
  const rawClient = (strings) => {
    const q = strings.join(' ');
    if (q.includes('SELECT')) {
      selectCalls++;
      if (selectCalls === 1) {
        const err = new Error('read ECONNRESET');
        err.code = 'ECONNRESET';
        return Promise.reject(err);
      }
      return Promise.resolve([{ alive: 1 }]);
    }
    insertCalls++;
    const err = new Error('write ECONNRESET');
    err.code = 'ECONNRESET';
    return Promise.reject(err);
  };

  let beginInvocations = 0;
  let preConnectFailuresRemaining = 2;
  let failMidCommit = false;

  rawClient.begin = async (cb) => {
    beginInvocations++;
    if (preConnectFailuresRemaining > 0) {
      preConnectFailuresRemaining--;
      const slotErr = new Error('remaining connection slots are reserved');
      slotErr.code = '53300';
      throw slotErr;
    }
    const txRes = await cb(async () => [{ inserted: true }]);
    if (failMidCommit) {
      const commitDrop = new Error('socket hang up during COMMIT');
      commitDrop.code = 'ECONNRESET';
      throw commitDrop;
    }
    return txRes;
  };

  const bridged = attachTransactionBridge(rawClient, {
    maxRetries: 3,
    baseDelayMs: 10,
    maxDelayMs: 20,
    sleepFn: async () => {}
  });

  const selectRes = await bridged`SELECT 1 AS alive`;
  assert.equal(selectCalls, 2, 'Read-only template query should retry transient ECONNRESET');
  assert.deepEqual(selectRes, [{ alive: 1 }]);

  await assert.rejects(() => bridged`INSERT INTO tracked_keywords (keyword) VALUES (${'pasta'})`, /ECONNRESET/);
  assert.equal(insertCalls, 1, 'Mutating template query must NOT auto-retry');

  // 3a. Pre-callback 53300 slot exhaustion retries cleanly before callback enters
  let callbackRunsPre = 0;
  const txSuccess = await bridged.begin(async (tx) => {
    callbackRunsPre++;
    return await tx`INSERT INTO tracked_keywords (keyword) VALUES ('soup')`;
  });
  assert.equal(beginInvocations, 3, 'Should retry twice on pre-callback 53300 then succeed on 3rd');
  assert.equal(callbackRunsPre, 1, 'Callback itself ran exactly once');
  assert.deepEqual(txSuccess, [{ inserted: true }]);

  // 3b. Mid-callback or mid-COMMIT ECONNRESET NEVER replays the mutating callback!
  beginInvocations = 0;
  preConnectFailuresRemaining = 0;
  failMidCommit = true;
  let mutatingCallbackExecutions = 0;

  await assert.rejects(
    () =>
      bridged.begin(async (tx) => {
        mutatingCallbackExecutions++;
        await tx`INSERT INTO universal_master_pins (pin_id) VALUES ('123')`;
      }),
    /socket hang up during COMMIT/
  );
  assert.equal(mutatingCallbackExecutions, 1, 'Mutating callback MUST NEVER replay once entered');
  assert.equal(beginInvocations, 1, 'origBegin MUST NOT be re-invoked after callback entered');

  // 4. Verify idle_in_transaction_session_timeout >= statement_timeout defaults (local 30000, CI 60000)
  const prevCi = process.env.GITHUB_ACTIONS;
  try {
    delete process.env.GITHUB_ACTIONS;
    const localSql = createSqlClient('postgresql://u:p@127.0.0.1:5432/db');
    assert.equal(localSql.options.connection.statement_timeout, 15000);
    assert.equal(localSql.options.connection.idle_in_transaction_session_timeout, 30000);
    await localSql.end({ timeout: 0 });

    process.env.GITHUB_ACTIONS = 'true';
    const ciSql = createSqlClient('postgresql://u:p@127.0.0.1:5432/db');
    assert.equal(ciSql.options.connection.statement_timeout, 45000);
    assert.equal(ciSql.options.connection.idle_in_transaction_session_timeout, 60000);
    await ciSql.end({ timeout: 0 });
  } finally {
    if (prevCi === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = prevCi;
  }
});

test('migrate.mjs getAppliedMigrations fails closed on DB error, counts unique versions, and closes sql.end() in finally', async () => {
  // 1. Fail-closed on SQL error
  const brokenSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('SELECT version')) {
      throw new Error('permission denied for table schema_migrations');
    }
    return [];
  };
  await assert.rejects(() => getAppliedMigrations(brokenSql), /permission denied/);

  // 2. Accurate unique version count (no name: double counting) + alias lookup
  const mockAppliedRows = [
    { version: '001', name: 'core_registry', checksum: calculateChecksum('SELECT 1;'), applied_at: '2026-01-01T00:00:00Z' },
    { version: '060', name: 'clean_slate_4_table_ssot', checksum: 'def', applied_at: '2026-06-01T00:00:00Z' },
    { version: '066', name: 'db_hygiene_and_pulse_indexes', checksum: 'ghi', applied_at: '2026-11-01T00:00:00Z' }
  ];
  let endCalls = 0;
  const healthyMockSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM schema_migrations')) return mockAppliedRows;
    return [];
  };
  healthyMockSql.end = async () => {
    endCalls++;
  };

  const applied = await getAppliedMigrations(healthyMockSql);
  assert.equal(applied.size, 3, 'applied.size must equal unique version count (3, not 6)');
  assert.ok(findAppliedMigration(applied, { version: '060', name: 'clean_slate_4_table_ssot', aliases: ['060'] }));
  assert.ok(findAppliedMigration(applied, { version: '999', name: 'db_hygiene_and_pulse_indexes', aliases: [] }));
  assert.equal(findAppliedMigration(applied, { version: '067', name: 'future_mig', aliases: [] }), null);

  // Verify Array.prototype.find is NOT monkey-patched on getMigrationFiles()
  const files = getMigrationFiles();
  assert.equal(files.find, Array.prototype.find);

  // 3. listMigrations and runMigrations always invoke sql.end() in finally
  const tmpMigDir = await mkdtemp(path.join(os.tmpdir(), 'pae-mig-test-'));
  try {
    await writeFile(path.join(tmpMigDir, '001_core_registry.sql'), 'SELECT 1;', 'utf8');
    await listMigrations({ migrationsDir: tmpMigDir, sqlClient: healthyMockSql });
    assert.equal(endCalls, 1);

    const runRes = await runMigrations({ migrationsDir: tmpMigDir, sqlClient: healthyMockSql, dryRun: true });
    assert.equal(runRes.skipped, 1);
    assert.equal(endCalls, 2);
  } finally {
    await rm(tmpMigDir, { recursive: true, force: true });
  }
});

test('startInstaBoxActivityLease calls PUT and DELETE on /v1/machines/{id}/activity-leases/{taskId}, and patchPostgresFiles degrades safely', async () => {
  const leaseCalls = [];
  const mockFetch = async (url, init = {}) => {
    leaseCalls.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const lease = startInstaBoxActivityLease('keyword-crawler', {
    machineId: 'm_agq2t32m5xv5joj67rqoze5h4u',
    apiKey: 'ib_live_key_test',
    pid: 4242,
    intervalMs: 60_000,
    ttlSeconds: 600,
    fetchImpl: mockFetch
  });

  assert.equal(lease.active, true);
  assert.equal(lease.taskId, 'pae-keyword-crawler-4242');
  await lease.ready;

  assert.equal(leaseCalls.length, 1);
  assert.equal(
    leaseCalls[0].url,
    'https://api.instabox.sh/v1/machines/m_agq2t32m5xv5joj67rqoze5h4u/activity-leases/pae-keyword-crawler-4242'
  );
  assert.equal(leaseCalls[0].method, 'PUT');
  assert.equal(leaseCalls[0].headers['Authorization'], 'Bearer ib_live_key_test');
  assert.equal(leaseCalls[0].headers['X-API-Key'], 'ib_live_key_test');
  assert.equal(leaseCalls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(leaseCalls[0].body, { ttlSeconds: 600 });

  await lease.stop();
  await lease.stop(); // Idempotent second call must not send duplicate DELETE

  assert.equal(leaseCalls.length, 2);
  assert.equal(
    leaseCalls[1].url,
    'https://api.instabox.sh/v1/machines/m_agq2t32m5xv5joj67rqoze5h4u/activity-leases/pae-keyword-crawler-4242'
  );
  assert.equal(leaseCalls[1].method, 'DELETE');
  assert.equal(leaseCalls[1].headers['Authorization'], 'Bearer ib_live_key_test');
  assert.equal(leaseCalls[1].headers['X-API-Key'], 'ib_live_key_test');

  // Verify patchPostgresFiles warns and returns skipped_upstream_changed instead of throwing when upstream changes
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'pae-pg-patch-'));
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const pgSrc = path.join(tmpRoot, 'node_modules', 'postgres', 'src');
    await mkdir(pgSrc, { recursive: true });
    await writeFile(path.join(tmpRoot, 'node_modules', 'postgres', 'package.json'), '{"version":"4.0.0"}', 'utf8');
    await writeFile(path.join(pgSrc, 'connection.js'), 'export function upstreamChanged() {}\n', 'utf8');
    await writeFile(path.join(pgSrc, 'index.js'), 'export default function sql() {}\n', 'utf8');

    const res = patchPostgresFiles(tmpRoot);
    assert.equal(res.version, '4.0.0');
    assert.equal(res.nextWrite, 'skipped_upstream_changed');
    assert.equal(res.closed, 'skipped_upstream_changed');
    assert.equal(res.rollback, 'skipped_upstream_changed');
  } finally {
    console.warn = origWarn;
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
