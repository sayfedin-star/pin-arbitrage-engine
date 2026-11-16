import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

import { createFastifyApp } from '../src/server.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { ingestPinsBatch, resavePinsMetricsBatch } from '../src/modules/pins/repository.mjs';
import { reconcilePinMetricsAfterSnapshotDelete } from '../src/routes/pins.mjs';
import { ignoreAndRemoveSerpPin } from '../src/modules/keywords/service.mjs';
import { deleteCompetitor } from '../src/modules/creators/competitors-crud.mjs';
import { dispatchGitHubWorkflow } from '../src/http/github-workflow.mjs';

function createTxSpySql(responder = null) {
  const queries = [];
  let txCount = 0;
  let rollbacks = 0;

  const execSql = (isTx = false) => {
    const fn = async (strings, ...values) => {
      const sqlText = strings.join('?').replace(/\s+/g, ' ').trim();
      queries.push({ sql: sqlText, values, inTx: isTx });
      if (typeof responder === 'function') {
        return await responder(sqlText, values, isTx);
      }
      return [];
    };
    return fn;
  };

  const rootSql = execSql(false);
  rootSql.begin = async (callback) => {
    txCount++;
    const tx = execSql(true);
    try {
      return await callback(tx);
    } catch (err) {
      rollbacks++;
      throw err;
    }
  };
  rootSql.getStats = () => ({ queries, txCount, rollbacks });
  rootSql.clear = () => { queries.length = 0; txCount = 0; rollbacks = 0; };
  return rootSql;
}

test('Red-Team Vector 3: pinDetailApp sanitizeReturnUrl blocks javascript:/data: XSS and open redirects', async () => {
  const html = getPinDetailPageHtml('1234567890123456');
  assert.match(html, /sanitizeReturnUrl\(originReturnUrl\)/, 'Pulse breadcrumb must sanitize originReturnUrl');

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const targetScript = scripts.find(s => s.includes('function pinDetailApp'));
  assert.ok(targetScript, 'Must include pinDetailApp script block');

  const runProbe = async (rawReturnUrl, storedReturnUrl = '') => {
    const storage = new Map();
    if (storedReturnUrl) {
      storage.set('pae_pin_breadcrumb_ctx', JSON.stringify({
        source: 'pulse',
        pinId: '1234567890123456',
        returnUrl: storedReturnUrl,
        ts: Date.now()
      }));
    }
    const ctx = {
      window: {
        location: {
          search: rawReturnUrl ? ('?return_url=' + encodeURIComponent(rawReturnUrl)) : '',
          pathname: '/pin/1234567890123456',
          origin: 'http://localhost:3000',
          href: ''
        },
        sessionStorage: {
          getItem: k => storage.get(k) || null,
          setItem: (k, v) => storage.set(k, v)
        },
        localStorage: { getItem: () => null, setItem: () => {} },
        history: { replaceState: () => {} }
      },
      document: {
        referrer: '',
        readyState: 'complete',
        documentElement: { classList: { add: () => {}, remove: () => {} } }
      },
      fetch: async () => ({ ok: true, json: async () => ({ success: true, pin_id: '1234567890123456', creative: {} }) }),
      URLSearchParams,
      URL,
      console,
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(targetScript, ctx);
    const app = ctx.pinDetailApp('1234567890123456');
    app.loadDossier = async () => {
      app.dossier = { success: true, pin_id: '1234567890123456', creative: {} };
    };
    await app.init();
    return app;
  };

  for (const evil of [
    'javascript:alert(1)',
    '  JaVaScRiPt:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'https://evil.example/phish',
    '//evil.example/protocol-relative',
    '\\\\evil.example\\unc',
    '/folders\n123'
  ]) {
    const app = await runProbe(evil);
    assert.strictEqual(app.originReturnUrl, '', `Must reject malicious return_url query: ${evil}`);
    assert.strictEqual(app.getBackUrl(), '/keywords', `getBackUrl must fall back safely for: ${evil}`);

    const storedApp = await runProbe('', evil);
    assert.notStrictEqual(storedApp.originReturnUrl, evil, `Must reject poisoned sessionStorage returnUrl: ${evil}`);
    assert.ok(!storedApp.getBackUrl().includes('evil.example') && !storedApp.getBackUrl().toLowerCase().startsWith('javascript:'));
  }

  // Valid relative paths and same-origin URLs remain allowed
  const validRel = await runProbe('/folders/42?tab=serp');
  assert.strictEqual(validRel.originReturnUrl, '/folders/42?tab=serp');
  assert.strictEqual(validRel.getBackUrl(), '/folders/42?tab=serp');

  const validSameOrigin = await runProbe('http://localhost:3000/pulse?window=7d');
  assert.strictEqual(validSameOrigin.originReturnUrl, '/pulse?window=7d');
  assert.strictEqual(validSameOrigin.getBackUrl(), '/pulse?window=7d');
});

test('Red-Team Vector 2: PinRepository prevents empty-string/NaN coercion, bogus is_hydrated=true, and bad dates', async () => {
  const spy = createTxSpySql((sqlText) => {
    if (sqlText.includes('upsert_pins AS') || sqlText.includes('INSERT INTO universal_master_pins')) {
      return [{ pin_id: '1111111111111111', is_insert: true }];
    }
    return [];
  });

  await ingestPinsBatch(spy, [
    { pin_id: '2222222222222222', saves: '', repins: '  ', comments: 'abc', created_at_pinterest: 'not-a-date' },
    { pin_id: '3333333333333333', saves: 'not-a-num', repins: 'Infinity', delta_saves_24h: 'bad' },
    { pin_id: '1111111111111111', saves: 10, repins: 2 },
    { pin_id: '1111111111111111', saves: 25, repins: 5 }
  ], { pillar: 'keywords' });

  const batchQuery = spy.getStats().queries.find(q => q.sql.includes('jsonb_to_recordset'));
  assert.ok(batchQuery, 'ingestPinsBatch must execute batch query');
  const rows = JSON.parse(batchQuery.values[0]);

  assert.deepStrictEqual(rows.map(r => r.pin_id), ['1111111111111111', '2222222222222222', '3333333333333333'], 'Must sort pin_id ASC deterministically');
  assert.strictEqual(rows[0].save_count, 25);
  assert.strictEqual(rows[0].repin_count, 5);
  assert.strictEqual(rows[0].is_hydrated, true);

  assert.strictEqual(rows[1].save_count, null, 'Empty string saves must remain NULL, not 0');
  assert.strictEqual(rows[1].repin_count, null, 'Whitespace repins must remain NULL, not 0');
  assert.strictEqual(rows[1].comment_count, null, 'Non-numeric comments must remain NULL');
  assert.strictEqual(rows[1].created_at_pinterest, null, 'Invalid timestamp must degrade to NULL without throwing');
  assert.strictEqual(rows[1].is_hydrated, false, 'Empty string saves must NOT mark is_hydrated=true');

  assert.strictEqual(rows[2].save_count, null, 'Non-numeric saves must remain NULL, not NaN');
  assert.strictEqual(rows[2].repin_count, null, 'Infinity repins must remain NULL');
  assert.strictEqual(rows[2].delta_saves_24h, null, 'Non-numeric delta_saves_24h must remain NULL');
  assert.strictEqual(rows[2].is_hydrated, false, 'NaN saves must NOT mark is_hydrated=true');

  spy.clear();
  await resavePinsMetricsBatch(spy, [
    { pin_id: '4444444444444444', saves: '', repins: 'abc', created_at_pinterest: 'invalid-date' }
  ]);
  const resaveQuery = spy.getStats().queries.find(q => q.sql.includes('jsonb_to_recordset'));
  const resaveRows = JSON.parse(resaveQuery.values[0]);
  assert.strictEqual(resaveRows[0].save_count, null);
  assert.strictEqual(resaveRows[0].repin_count, null);
  assert.strictEqual(resaveRows[0].is_hydrated, false);
  assert.strictEqual(resaveRows[0].created_at_pinterest, null);
});

test('Red-Team Vector 1 & 4: Wave 1-3 deletes execute atomically via sql.begin and roll back on SQL failure', async () => {
  // 1. reconcilePinMetricsAfterSnapshotDelete handles unsorted rows cleanly
  const outOfOrderSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('SELECT recorded_date, save_count')) {
      return [
        { recorded_date: '2026-11-01', save_count: 100, repin_count: 10 },
        { recorded_date: '2026-11-05', save_count: 140, repin_count: 18 },
        { recorded_date: '2026-11-10', save_count: 240, repin_count: 38 }
      ];
    }
    return [];
  });
  await reconcilePinMetricsAfterSnapshotDelete({ sql: outOfOrderSql, pinId: '1234567890123456' });
  const umpUpdate = outOfOrderSql.getStats().queries.find(q => q.sql.startsWith('UPDATE universal_master_pins SET'));
  assert.deepStrictEqual(umpUpdate.values.slice(0, 6), [240, 38, 20, 4, 20, 4]);

  // 2. ignoreAndRemoveSerpPin wraps tombstone + delete in transaction and propagates rollback
  const atomicSerpSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('DELETE FROM keyword_serp_positions')) {
      throw new Error('simulated SERP delete failure');
    }
    return [];
  });
  await assert.rejects(
    () => ignoreAndRemoveSerpPin(atomicSerpSql, { keywordId: 5, pinId: '1234567890123456', reason: 'manual_user_deletion' }),
    /simulated SERP delete failure/
  );
  assert.strictEqual(atomicSerpSql.getStats().txCount, 1);
  assert.strictEqual(atomicSerpSql.getStats().rollbacks, 1);

  // 3. deleteCompetitor executes inside sql.begin transaction
  const compSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('SELECT id, username FROM competitor_profiles')) {
      return [{ id: 7, username: 'compuser' }];
    }
    return [];
  });
  const delCompRes = await deleteCompetitor(compSql, 7);
  assert.strictEqual(delCompRes.ok, true);
  assert.strictEqual(compSql.getStats().txCount, 1);
  assert.ok(compSql.getStats().queries.every(q => q.inTx), 'All deleteCompetitor SQL statements must run inside transaction');

  // 4. Fastify inject tests for DELETE /api/pins/:pin_id, DELETE /api/keywords, DELETE /api/creators/pin-snapshot
  const appSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('SELECT id, keyword FROM tracked_keywords')) {
      return [{ id: 1, keyword: 'kw' }];
    }
    return [];
  });
  const app = createFastifyApp({ SQL_CLIENT: appSql, ENVIRONMENT: 'test' });
  await app.ready();

  try {
    appSql.clear();
    const pinDel = await app.inject({ method: 'DELETE', url: '/api/pins/1234567890123456' });
    assert.strictEqual(pinDel.statusCode, 200);
    assert.strictEqual(appSql.getStats().txCount, 1, 'DELETE /api/pins/:pin_id must use sql.begin transaction');
    assert.ok(appSql.getStats().queries.every(q => q.inTx));

    appSql.clear();
    const kwDel = await app.inject({ method: 'DELETE', url: '/api/keywords?id=1' });
    assert.strictEqual(kwDel.statusCode, 200);
    assert.strictEqual(appSql.getStats().txCount, 1, 'DELETE /api/keywords must use sql.begin transaction');

    appSql.clear();
    const snapBad = await app.inject({ method: 'DELETE', url: '/api/creators/pin-snapshot?id=99&pin_id=1234567890123456' });
    assert.strictEqual(snapBad.statusCode, 400);

    appSql.clear();
    const snapOk = await app.inject({ method: 'DELETE', url: '/api/creators/pin-snapshot?id=99&pin_id=1234567890123456&date=2026-11-16' });
    assert.strictEqual(snapOk.statusCode, 200);
    assert.strictEqual(appSql.getStats().txCount, 1, 'DELETE /api/creators/pin-snapshot must use sql.begin transaction');
  } finally {
    await app.close();
  }
});

test('Red-Team Vector 3: dispatchGitHubWorkflow rejects path traversal / invalid workflowFile, repo, and ref', async () => {
  const badWorkflow = await dispatchGitHubWorkflow(
    { GITHUB_TOKEN: 'ghp_123', GITHUB_REPOSITORY: 'owner/repo' },
    { workflowFile: '../../pulls', inputs: {} }
  );
  assert.strictEqual(badWorkflow.ok, false);
  assert.strictEqual(badWorkflow.status, 400);

  const badRepo = await dispatchGitHubWorkflow(
    { GITHUB_TOKEN: 'ghp_123', GITHUB_REPOSITORY: 'owner/../other/repo' },
    { workflowFile: 'sync.yml' }
  );
  assert.strictEqual(badRepo.ok, false);
  assert.strictEqual(badRepo.status, 400);

  const badRef = await dispatchGitHubWorkflow(
    { GITHUB_TOKEN: 'ghp_123', GITHUB_REPOSITORY: 'owner/repo' },
    { workflowFile: 'sync.yml', ref: 'main?evil=1' }
  );
  assert.strictEqual(badRef.ok, false);
  assert.strictEqual(badRef.status, 400);
});

test('Red-Team Vector 2: pulse-queries.mjs does not fabricate #888888 defaults for missing dominant_color', () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pulse/pulse-queries.mjs'), 'utf8');
  assert.doesNotMatch(code, /COALESCE\([\s\S]*?'#888888'\)\s+AS dominant_color/i, 'pulse-queries must return NULL instead of #888888');
});
