import test from 'node:test';
import assert from 'node:assert/strict';

import { ignoreAndRemoveSerpPin } from '../src/modules/keywords/service.mjs';
import { pruneFolderPins } from '../src/modules/keywords/folders-crud.mjs';
import { resolveGitHubAuth, dispatchGitHubWorkflow } from '../src/http/github-workflow.mjs';
import { handlePinsRoutes } from '../src/routes/pins.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { bootstrapUndiciKeepAliveDispatcher } from '../scripts/lib/cli-utils.mjs';

function createCapturingSql(responder = null) {
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => acc + s + (values[i] !== undefined ? `$${i + 1}` : ''), '');
    queries.push({ text, values });
    const rows = typeof responder === 'function' ? responder(text, values) : [];
    const p = Promise.resolve(Array.isArray(rows) ? rows : []);
    return p;
  };
  return { sql, queries };
}

function mockJsonResponse(data, status = 200) {
  return { status, body: data };
}

test('Audit 1C: ignoreAndRemoveSerpPin normalizes {keyword_id, pin_id} and {kid, pid} & pruneFolderPins sends valid pairs', async () => {
  const { sql, queries } = createCapturingSql((text) => {
    if (text.includes('DELETE FROM keyword_serp_positions')) {
      return [{ keyword_id: 11, pin_id: '123456789012345678' }];
    }
    return [];
  });

  const singleRes = await ignoreAndRemoveSerpPin(sql, {
    pairs: [{ kid: 11, pid: '123456789012345678' }],
    reason: 'folder_smart_pruning'
  });
  assert.strictEqual(singleRes.pairs.length, 1);
  assert.deepStrictEqual(singleRes.pairs[0], {
    keyword_id: 11,
    pin_id: '123456789012345678',
    ignored_reason: 'folder_smart_pruning'
  });
  assert.strictEqual(singleRes.deletedCount, 1);
  assert.ok(queries.some(q => q.text.includes('INSERT INTO keyword_ignored_pins') && q.values.includes(11)));
  assert.ok(queries.some(q => q.text.includes('DELETE FROM keyword_serp_positions') && q.values.includes('123456789012345678')));

  const pruneSqlState = createCapturingSql((text) => {
    if (text.includes('FROM keyword_folder_items')) {
      return [
        { keyword_id: 101, pin_id: '111111111111111111' },
        { keyword_id: 102, pin_id: '222222222222222222' }
      ];
    }
    if (text.includes('DELETE FROM keyword_serp_positions')) {
      return [
        { keyword_id: 101, pin_id: '111111111111111111' },
        { keyword_id: 102, pin_id: '222222222222222222' }
      ];
    }
    return [];
  });

  const pruneRes = await pruneFolderPins(pruneSqlState.sql, 7, { dryRun: false });
  assert.strictEqual(pruneRes.success, true);
  assert.strictEqual(pruneRes.pruned_count, 2);
  const batchInsert = pruneSqlState.queries.find(q => q.text.includes('INSERT INTO keyword_ignored_pins'));
  assert.ok(batchInsert, 'pruneFolderPins must execute batch INSERT INTO keyword_ignored_pins');
  assert.ok(batchInsert.values[0].includes('"keyword_id":101'), 'pairs payload must serialize canonical keyword_id');
  assert.ok(batchInsert.values[0].includes('"pin_id":"111111111111111111"'), 'pairs payload must serialize canonical pin_id');
});

test('Audit 2A: resolveGitHubAuth and dispatchGitHubWorkflow support both arities, aliases, errors, and fetch catches', async () => {
  const auth = resolveGitHubAuth({ GITHUB_TOKEN: 'ghp_test_token', GITHUB_REPOSITORY: 'owner/repo' });
  assert.strictEqual(auth.token, 'ghp_test_token');
  assert.strictEqual(auth.githubToken, 'ghp_test_token');
  assert.strictEqual(auth.repo, 'owner/repo');
  assert.strictEqual(auth.githubRepo, 'owner/repo');
  assert.strictEqual(auth.authHeader, 'Bearer ghp_test_token');

  const origFetch = globalThis.fetch;
  const dispatchedCalls = [];
  try {
    globalThis.fetch = async (url, init) => {
      dispatchedCalls.push({ url, init });
      return new Response(null, { status: 204 });
    };

    // Two-arg signature: (env, options)
    const okRes = await dispatchGitHubWorkflow(
      { GITHUB_TOKEN: 't1', GITHUB_REPOSITORY: 'org/app' },
      { workflowFile: 'sync.yml', inputs: { mode: 'fast' } }
    );
    assert.strictEqual(okRes.ok, true);
    assert.strictEqual(okRes.status, 204);
    assert.strictEqual(dispatchedCalls[0].url, 'https://api.github.com/repos/org/app/actions/workflows/sync.yml/dispatches');

    // Legacy single-object signature: ({ env, workflowFile, ... })
    const singleObjRes = await dispatchGitHubWorkflow({
      env: { GITHUB_TOKEN: 't2', GITHUB_REPOSITORY: 'org/app2' },
      workflowFile: 'crawl.yml',
      inputs: { k: '1' }
    });
    assert.strictEqual(singleObjRes.ok, true);
    assert.strictEqual(dispatchedCalls[1].url, 'https://api.github.com/repos/org/app2/actions/workflows/crawl.yml/dispatches');

    // HTTP failure returns both error and errorText
    globalThis.fetch = async () => new Response('workflow disabled', { status: 422 });
    const httpErrRes = await dispatchGitHubWorkflow(
      { GITHUB_TOKEN: 't1', GITHUB_REPOSITORY: 'org/app' },
      { workflowFile: 'sync.yml' }
    );
    assert.strictEqual(httpErrRes.ok, false);
    assert.strictEqual(httpErrRes.status, 422);
    assert.strictEqual(httpErrRes.errorText, 'workflow disabled');
    assert.strictEqual(httpErrRes.error, 'workflow disabled');

    // Network throw is caught cleanly as 502
    globalThis.fetch = async () => { throw new Error('network timeout'); };
    const netErrRes = await dispatchGitHubWorkflow(
      { GITHUB_TOKEN: 't1', GITHUB_REPOSITORY: 'org/app' },
      { workflowFile: 'sync.yml' }
    );
    assert.strictEqual(netErrRes.ok, false);
    assert.strictEqual(netErrRes.status, 502);
    assert.match(netErrRes.error, /network timeout/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Audit 1D: DELETE /api/creators/pin-snapshot handles intra_* checkpoints, invalid dates, YYYY-MM-DD promotion & cache eviction', async () => {
  const evicted = [];
  const baseRouteCtx = {
    pathname: '/api/creators/pin-snapshot',
    method: 'DELETE',
    env: {},
    ctx: {},
    jsonResponse: mockJsonResponse,
    buildCanonicalCacheKey: (p, q) => `${p}?pin_id=${q.pin_id}`,
    invalidateEdgeCache: async (key) => { evicted.push(key); }
  };

  // 1. Intraday checkpoint deletion via /api/creators/pin-snapshot
  const intraSql = createCapturingSql(() => []);
  const intraRes = await handleCreatorsRoutes({
    ...baseRouteCtx,
    request: new Request('http://localhost/api/creators/pin-snapshot?pin_id=987654321098&snapshot_id=intra_2026-11-15T10', { method: 'DELETE' }),
    searchParams: new URLSearchParams('pin_id=987654321098&snapshot_id=intra_2026-11-15T10'),
    sql: intraSql.sql
  });
  assert.strictEqual(intraRes.status, 200);
  assert.strictEqual(intraRes.body.success, true);
  assert.ok(intraSql.queries.some(q => q.text.includes('intraday_snapshots')), 'must strip matching intraday checkpoint');
  assert.ok(intraSql.queries.some(q => q.text.includes('deleted_snapshot_dates')), 'must tombstone intraday checkpoint');
  assert.ok(evicted.includes('pinarchive'), 'must evict pinarchive cache');
  assert.ok(evicted.includes('pin:dossier?pin_id=987654321098'), 'must evict pin:dossier cache');
  assert.ok(evicted.includes('keywords:pin-dossier'), 'must evict keywords:pin-dossier cache');

  // 2. Invalid date -> 400
  const badRes = await handleCreatorsRoutes({
    ...baseRouteCtx,
    request: new Request('http://localhost/api/creators/pin-snapshot?pin_id=987654321098&snapshot_id=not-a-date', { method: 'DELETE' }),
    searchParams: new URLSearchParams('pin_id=987654321098&snapshot_id=not-a-date'),
    sql: intraSql.sql
  });
  assert.strictEqual(badRes.status, 400);

  // 3. YYYY-MM-DD deletion promotes latest intraday snapshot for that date and reconciles metrics
  const promoSql = createCapturingSql((text) => {
    if (text.includes('SELECT metadata FROM universal_master_pins')) {
      return [{
        metadata: {
          intraday_snapshots: [
            { id: 'intra_p1', snapshot_date: '2026-11-15', recorded_at: '2026-11-15T08:00:00.000Z', save_count: 120, repin_count: 20, comment_count: 1, share_count: 2 }
          ]
        }
      }];
    }
    if (text.includes('FROM pins_daily_metrics')) {
      return [
        { recorded_date: '2026-11-15', save_count: 120, repin_count: 20 },
        { recorded_date: '2026-11-14', save_count: 100, repin_count: 15 }
      ];
    }
    return [];
  });
  const promoRes = await handleCreatorsRoutes({
    ...baseRouteCtx,
    request: new Request('http://localhost/api/creators/pin-snapshot?pin_id=987654321098&snapshot_id=2026-11-15', { method: 'DELETE' }),
    searchParams: new URLSearchParams('pin_id=987654321098&snapshot_id=2026-11-15'),
    sql: promoSql.sql
  });
  assert.strictEqual(promoRes.status, 200);
  assert.strictEqual(promoRes.body.deleted_date, '2026-11-15');
  assert.ok(promoSql.queries.some(q => q.text.includes('UPDATE pins_daily_metrics') && q.values.includes(120)), 'must promote intraday checkpoint to pins_daily_metrics');
  assert.ok(promoSql.queries.some(q => q.text.includes('jsonb_to_recordset')), 'must batch recompute bridged velocities on pins_daily_metrics');
  assert.ok(promoSql.queries.some(q => q.text.includes('UPDATE universal_master_pins') && q.values.includes(120) && q.values.includes(20)), 'must reconcile universal_master_pins metrics');
});

test('Audit 1A & 1B: DELETE /api/pins/:pin_id and DELETE /api/keywords query valid schema tables & columns', async () => {
  const pinDelSql = createCapturingSql(() => []);
  const pinRes = await handlePinsRoutes({
    pathname: '/api/pins/123456789012345',
    method: 'DELETE',
    request: new Request('http://localhost/api/pins/123456789012345', { method: 'DELETE' }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: pinDelSql.sql,
    jsonResponse: mockJsonResponse,
    methodNotAllowedResponse: () => mockJsonResponse({ error: 'method' }, 405),
    buildCanonicalCacheKey: (p, q) => `${p}?pin_id=${q.pin_id}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    isValidPinId: (id) => /^[0-9a-zA-Z_-]{10,128}$/.test(String(id || '')),
    redactSecrets: (s) => s
  });
  assert.strictEqual(pinRes.status, 200);
  const relNodeQuery = pinDelSql.queries.find(q => q.text.includes('competitor_related_nodes'));
  assert.ok(relNodeQuery, 'must clean up competitor_related_nodes');
  assert.match(relNodeQuery.text, /candidate_pin_id\s*=/);
  assert.doesNotMatch(relNodeQuery.text, /\bWHERE\s+pin_id\s*=/);

  const kwDelSql = createCapturingSql((text) => {
    if (text.includes('SELECT id, keyword FROM tracked_keywords')) {
      return [{ id: 55, keyword: 'winter decor' }];
    }
    return [];
  });
  const kwRes = await handleKeywordsRoutes({
    pathname: '/api/keywords',
    method: 'DELETE',
    request: new Request('http://localhost/api/keywords?id=55', { method: 'DELETE' }),
    searchParams: new URLSearchParams('id=55'),
    env: {},
    ctx: {},
    sql: kwDelSql.sql,
    jsonResponse: mockJsonResponse,
    methodNotAllowedResponse: () => mockJsonResponse({ error: 'method' }, 405),
    buildCanonicalCacheKey: (p) => p,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    isValidPinId: () => true,
    redactSecrets: (s) => s
  });
  assert.strictEqual(kwRes.status, 200);
  assert.ok(kwDelSql.queries.some(q => q.text.includes('DELETE FROM keyword_guided_capsules')), 'must delete from keyword_guided_capsules');
  assert.ok(!kwDelSql.queries.some(q => q.text.includes('keyword_guides')), 'must never query non-existent keyword_guides');
});

test('Audit 2B: bootstrapUndiciKeepAliveDispatcher still constructs an Agent after undici is imported', async () => {
  const undiciMod = await import('undici');
  const agent = await bootstrapUndiciKeepAliveDispatcher();
  assert.ok(agent, 'must return an Agent instance even when undici was pre-imported');
  assert.strictEqual(agent instanceof undiciMod.Agent, true);
  assert.strictEqual(globalThis[Symbol.for('undici.globalDispatcher.1')], agent);
});
