import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clampSerpQuota,
  computePagesForQuota,
  resolveEffectiveSerpQuota,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug
} from '../src/modules/keywords/settings.mjs';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';
import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';

function normalizeSql(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function makeMockSql(handler, { withBegin = false } = {}) {
  const calls = [];
  const exec = (strings, ...values) => {
    const query = normalizeSql(strings);
    calls.push({ query, values });
    const rows = handler ? handler(query, values, calls) : [];
    const arr = Array.isArray(rows) ? rows : [];
    arr.count = rows?.count ?? arr.length;
    const p = Promise.resolve(arr);
    p.catch = (...args) => Promise.resolve(arr).catch(...args);
    return p;
  };
  if (withBegin) {
    exec.begin = async (fn) => fn(exec);
  }
  return { sql: exec, calls };
}

test('SSOT quota helpers clamp to [10, 2000] and preserve exact precedence', () => {
  assert.equal(clampSerpQuota(5), 10, 'Values below 10 clamp to UI slider minimum 10 (not 25)');
  assert.equal(clampSerpQuota(10), 10);
  assert.equal(clampSerpQuota(20), 20);
  assert.equal(clampSerpQuota(5000), 2000);
  assert.equal(clampSerpQuota('', 50), 50);
  assert.equal(clampSerpQuota(null, 50), 50);

  assert.equal(computePagesForQuota(10), 1);
  assert.equal(computePagesForQuota(20), 1);
  assert.equal(computePagesForQuota(26), 2);
  assert.equal(computePagesForQuota(50), 2);

  // Precedence: explicit > keyword > folder > appSettings > pages * 25 > 50
  assert.equal(
    resolveEffectiveSerpQuota({
      explicitMaxPins: 35,
      keywordTargetPins: 20,
      folderMaxPins: 100,
      appSettings: { max_serp_pins: 250, default_max_pins: 250 },
      keywordPagesLimit: 10
    }),
    35
  );
  assert.equal(
    resolveEffectiveSerpQuota({
      explicitMaxPins: '',
      keywordTargetPins: 20,
      folderMaxPins: 100,
      appSettings: { max_serp_pins: 250, default_max_pins: 250 },
      keywordPagesLimit: 10
    }),
    20
  );
  assert.equal(
    resolveEffectiveSerpQuota({
      folderMaxPins: 40,
      appSettings: { max_serp_pins: 250 },
      keywordPagesLimit: 10
    }),
    40
  );
  assert.equal(
    resolveEffectiveSerpQuota({
      appSettings: { max_serp_pins: 20, default_max_pins: 50 },
      keywordPagesLimit: 10
    }),
    20
  );
  assert.equal(
    resolveEffectiveSerpQuota({
      keywordPagesLimit: 3
    }),
    75
  );
  assert.equal(resolveEffectiveSerpQuota({}), 50);
});

test('updateAppSettings does NOT touch tracked_keywords when apply_to_all is false/omitted', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 50, default_max_pins: 50, default_crawl_pages: 2 } }];
    }
    return [];
  });

  const updated = await updateAppSettings(sql, {
    max_serp_pins: 20,
    default_max_pins: 20,
    apply_to_all: false
  });

  assert.equal(updated.max_serp_pins, 20);
  assert.equal(updated.default_crawl_pages, 1);
  assert.equal(calls.some((c) => c.query.includes('UPDATE tracked_keywords')), false);
  assert.equal(calls.some((c) => c.query.includes('UPDATE keyword_serp_positions')), false);

  const settingsInsert = calls.find((c) => c.query.includes('INSERT INTO app_settings'));
  assert.ok(settingsInsert);
  const storedJson = JSON.parse(settingsInsert.values[0]);
  assert.equal('apply_to_all' in storedJson, false, 'apply_to_all flag must not be persisted into app_settings JSONB');
});

test('updateAppSettings with apply_to_all=true atomically updates tracked_keywords and demotes excess active ranks to Vault', async () => {
  let beganTx = false;
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 50, default_max_pins: 50, default_crawl_pages: 2 } }];
    }
    return [];
  });
  sql.begin = async (fn) => {
    beganTx = true;
    return fn(sql);
  };

  const updated = await updateAppSettings(sql, {
    max_serp_pins: 20,
    default_max_pins: 20,
    default_crawl_pages: 1,
    default_inspection_mode: 'smart_breakout',
    apply_to_all: true
  });

  assert.equal(beganTx, true, 'Must execute apply_to_all propagation inside an atomic SQL transaction');
  assert.equal(updated.max_serp_pins, 20);

  const kwUpdate = calls.find((c) => c.query.includes('UPDATE tracked_keywords'));
  assert.ok(kwUpdate, 'Must update all tracked_keywords rows');
  assert.deepEqual(kwUpdate.values.slice(0, 3), [20, 1, 'smart_breakout']);

  const posTrim = calls.find((c) => c.query.includes('UPDATE keyword_serp_positions'));
  assert.ok(posTrim, 'Must demote overflow active SERP positions to Displaced Vault');
  assert.match(posTrim.query, /is_displaced = TRUE/);
  assert.match(posTrim.query, /rank_position = NULL/);
  assert.match(posTrim.query, /rank_position > /);
  assert.equal(posTrim.values[0], 20);

  const settingsInsert = calls.find((c) => c.query.includes('INSERT INTO app_settings'));
  const storedJson = JSON.parse(settingsInsert.values[0]);
  assert.equal('apply_to_all' in storedJson, false);
});

test('updateKeywordSettings accepts 10..20 and atomically trims active rank overflow for that keyword', async () => {
  let beganTx = false;
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('UPDATE tracked_keywords')) {
      return [{ id: 42, keyword: 'taco soup', category: 'Food', target_pin_count: 10, crawl_pages_limit: 1, inspection_mode: 'full_catalog' }];
    }
    return [];
  });
  sql.begin = async (fn) => {
    beganTx = true;
    return fn(sql);
  };

  const row = await updateKeywordSettings(sql, 42, { target_pin_count: 10 });
  assert.equal(beganTx, true);
  assert.equal(row.target_pin_count, 10);

  const kwUpdate = calls.find((c) => c.query.includes('UPDATE tracked_keywords'));
  assert.equal(kwUpdate.values[0], 1); // crawl_pages_limit = 1
  assert.equal(kwUpdate.values[2], 10); // target_pin_count = 10

  const posTrim = calls.find((c) => c.query.includes('UPDATE keyword_serp_positions'));
  assert.ok(posTrim);
  assert.deepEqual(posTrim.values, [42, 10]);
});

test('addKeyword and resolveKeywordBySlug(autoCreate=true) inherit app_settings when target_pin_count is omitted', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 20, default_max_pins: 20, default_crawl_pages: 1, default_inspection_mode: 'smart_breakout' } }];
    }
    if (query.includes('INSERT INTO tracked_keywords')) {
      return [{ id: 99, keyword: 'quick dinner', target_pin_count: 20, crawl_pages_limit: 1, inspection_mode: 'smart_breakout' }];
    }
    return [];
  });

  const added = await addKeyword(sql, { keyword: 'Quick Dinner' });
  assert.equal(added.target_pin_count, 20);
  const addInsert = calls.find((c) => c.query.includes('INSERT INTO tracked_keywords'));
  assert.equal(addInsert.values[2], 20);
  assert.equal(addInsert.values[3], 1);
  assert.equal(addInsert.values[4], 'smart_breakout');

  calls.length = 0;
  const resolved = await resolveKeywordBySlug(sql, 'quick-dinner', true);
  assert.equal(resolved.target_pin_count, 20);
  const slugInsert = calls.find((c) => c.query.includes('INSERT INTO tracked_keywords'));
  assert.ok(slugInsert);
  assert.equal(slugInsert.values[1], 20);
  assert.equal(slugInsert.values[2], 1);
  assert.equal(slugInsert.values[3], 'smart_breakout');
});

test('crawlKeywordSERP enforces target_pin_count=10 (no floor 25) and scales minRequiredForEviction so displacement works cleanly', async () => {
  const originalFetch = globalThis.fetch;
  const mockPins = Array.from({ length: 15 }, (_, idx) => ({
    id: String(10000000001 + idx),
    type: 'pin',
    title: `Mock Pin ${idx + 1}`,
    domain: 'example.com',
    link: `https://example.com/p/${idx + 1}`,
    images: { '736x': { url: `https://i.pinimg.com/736x/${idx + 1}.jpg` } },
    aggregated_pin_data: { aggregated_stats: { saves: 100 + idx } },
    repin_count: 5,
    comment_count: 1,
    share_count: 0
  }));

  globalThis.fetch = async (url) => {
    const strUrl = String(url);
    if (strUrl.includes('BaseSearchResource')) {
      return new Response(
        JSON.stringify({
          resource_response: {
            data: { results: mockPins },
            bookmark: '-end-'
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ resource_response: { data: {} } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const txQueries = [];
    const { sql } = makeMockSql((query) => {
      txQueries.push(query);
      if (query.includes('UPDATE tracked_keywords SET crawl_lease_token =')) {
        return [{ id: 77 }];
      }
      if (query.includes('SELECT id, keyword, target_pin_count')) {
        return [{
          id: 77,
          keyword: 'easy lunch ideas',
          target_pin_count: 10,
          crawl_pages_limit: 1,
          is_active: true,
          metadata: {},
          top_pin_id: null,
          top_pin_title: null,
          top_pin_image: null,
          avg_daily_velocity: 0,
          last_crawled_at: null
        }];
      }
      if (query.includes('FROM app_settings')) {
        return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 20, default_max_pins: 20 } }];
      }
      if (query.includes('FROM keyword_serp_positions ksp') && query.includes('is_displaced = FALSE')) {
        // Simulate 25 previously active pins before target was lowered to 10
        return Array.from({ length: 25 }, (_, i) => ({
          pin_id: String(20000000001 + i),
          rank_position: i + 1,
          save_count: 50,
          repin_count: 1,
          comment_count: 0,
          title: `Old Pin ${i + 1}`,
          image_url: null,
          domain: 'old.com',
          destination_url: '',
          creator_username: '',
          visual_annotations: [],
          crawled_at: new Date(),
          metadata: {}
        }));
      }
      return [];
    });

    const result = await crawlKeywordSERP(sql, 77, { skip_top_enrich: true, force: true });
    assert.equal(result.success, true);
    assert.equal(result.crawled_pins, 10, 'crawlKeywordSERP must stop at target_pin_count=10 (not enforce a 25-pin floor)');
    assert.equal(
      txQueries.some((q) => q.includes('UPDATE keyword_serp_positions SET is_displaced = TRUE')),
      true,
      'With expectedCount=10, minRequiredForEviction must scale <= 10 so older active rows displace cleanly'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/keywords/bulk-import and POST /api/keywords/dispatch-workflow respect app_settings / empty override contracts', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 20, default_max_pins: 20, default_crawl_pages: 1, default_inspection_mode: 'smart_breakout' } }];
    }
    if (query.includes('INSERT INTO tracked_keywords')) {
      return [{ id: 10, keyword: 'meal prep', category: 'Food' }];
    }
    return [];
  });

  const baseCtx = {
    env: { GITHUB_TOKEN: 'ghp_test_token', GITHUB_REPO: 'sayfedin-star/pin-arbitrage-engine' },
    ctx: {},
    sql,
    invalidateEdgeCache: async () => {},
    jsonResponse: (d, s = 200) => new Response(JSON.stringify(d), { status: s }),
    methodNotAllowedResponse: () => new Response('', { status: 405 }),
    getCachedOrFetch: async (_k, fn) => fn(),
    buildCanonicalCacheKey: (k) => k,
    clampLimit: (v, d) => Number(v) || d,
    safeWaitUntil: () => {},
    isValidPinId: (id) => /^\d{10,30}$/.test(String(id || '')),
    tripPinterestCircuitBreaker: null,
    redactSecrets: (s) => s
  };

  const bulkRes = await handleKeywordsRoutes({
    ...baseCtx,
    pathname: '/api/keywords/bulk-import',
    method: 'POST',
    request: {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: { keywords: ['meal prep'], category: 'Food' }
    },
    searchParams: new URLSearchParams()
  });
  assert.equal(bulkRes.status, 200);
  const bulkInsert = calls.find((c) => c.query.includes('INSERT INTO tracked_keywords'));
  assert.ok(bulkInsert);
  assert.equal(bulkInsert.values[1], 20, 'bulk-import must default new keywords to app_settings quota (20)');
  assert.equal(bulkInsert.values[2], 1, 'bulk-import must default pages to 1 for quota 20');
  assert.equal(bulkInsert.values[3], 'smart_breakout');

  const originalFetch = globalThis.fetch;
  const dispatchedPayloads = [];
  globalThis.fetch = async (url, init) => {
    dispatchedPayloads.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(null, { status: 204 });
  };

  try {
    const dispatchReqOmitted = new Request('https://example.test/api/keywords/dispatch-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_keyword: 'easy lunch ideas' })
    });
    const dispatchResOmitted = await handleKeywordsRoutes({
      ...baseCtx,
      pathname: '/api/keywords/dispatch-workflow',
      method: 'POST',
      request: dispatchReqOmitted,
      searchParams: new URLSearchParams()
    });
    assert.equal(dispatchResOmitted.status, 200);
    assert.equal(dispatchedPayloads[0]?.body?.inputs?.max_pins, '', 'Omitting max_pins must send empty string so dispatcher reads DB SSOT');
    assert.equal(dispatchedPayloads[0]?.body?.inputs?.max_serp_pins, '');

    const dispatchReqExplicit = new Request('https://example.test/api/keywords/dispatch-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_keyword: 'easy lunch ideas', max_pins: 20, max_serp_pins: 20 })
    });
    const dispatchResExplicit = await handleKeywordsRoutes({
      ...baseCtx,
      pathname: '/api/keywords/dispatch-workflow',
      method: 'POST',
      request: dispatchReqExplicit,
      searchParams: new URLSearchParams()
    });
    assert.equal(dispatchResExplicit.status, 200);
    assert.equal(dispatchedPayloads[1]?.body?.inputs?.max_pins, '20');
    assert.equal(dispatchedPayloads[1]?.body?.inputs?.max_serp_pins, '20');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Verify GitHub Actions workflow & dispatcher do NOT re-introduce hardcoded '50' overrides
  const workflowYml = fs.readFileSync(path.resolve('.github/workflows/keyword-intelligence-velocity.yml'), 'utf8');
  assert.doesNotMatch(workflowYml, /MAX_PINS:\s*\$\{\{\s*inputs\.max_pins\s*\|\|\s*'50'/);
  assert.match(workflowYml, /max_pins:[\s\S]*?default:\s*''/);

  const dispatcherSrc = fs.readFileSync(path.resolve('scripts/keyword-fleet-dispatcher.mjs'), 'utf8');
  assert.match(dispatcherSrc, /explicitEnvSerpPins/);
  assert.match(dispatcherSrc, /globalFallbackSerpPins/);
});
