import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeSqlWildcards } from '../src/utils.mjs';
import {
  AUTOCOMPLETE_MIN_CHARS,
  normalizeAutocompleteQuery,
  resolveKeywordUrl,
  resolveCreatorUrl,
  parseRequestedTypes,
  searchMultiEntityAutocomplete
} from '../src/modules/search/autocomplete-service.mjs';
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

function makeMockSql(handler) {
  const calls = [];
  const exec = (strings, ...values) => {
    const query = normalizeSql(strings);
    calls.push({ query, values });
    const rows = handler ? handler(query, values, calls) : [];
    const arr = Array.isArray(rows) ? rows : [];
    arr.count = rows?.count ?? arr.length;
    return Promise.resolve(arr);
  };
  exec.begin = async (fn) => fn(exec);
  return { sql: exec, calls };
}

test('escapeSqlWildcards and normalizeAutocompleteQuery sanitize SQL LIKE wildcards and enforce min_chars & reserved slugs', () => {
  assert.equal(escapeSqlWildcards('100%_pure\\recipe'), '100\\%\\_pure\\\\recipe');
  assert.equal(escapeSqlWildcards(''), '');
  assert.equal(escapeSqlWildcards(null), '');

  assert.equal(AUTOCOMPLETE_MIN_CHARS, 2);
  assert.equal(normalizeAutocompleteQuery(' m ').tooShort, true);
  assert.equal(normalizeAutocompleteQuery('@m').tooShort, true);

  const prefix2 = normalizeAutocompleteQuery('ma');
  assert.equal(prefix2.tooShort, false);
  assert.equal(prefix2.isShortPrefix, true);
  assert.equal(prefix2.prefixPattern, 'ma%');
  assert.equal(prefix2.matchPattern, 'ma%');

  const wildcardSub = normalizeAutocompleteQuery('  Mar%Co_  ');
  assert.equal(wildcardSub.tooShort, false);
  assert.equal(wildcardSub.isShortPrefix, false);
  assert.equal(wildcardSub.prefixPattern, 'mar\\%co\\_%');
  assert.equal(wildcardSub.matchPattern, '%mar\\%co\\_%');

  assert.equal(resolveKeywordUrl({ keyword: 'Easy Lunch Ideas', canonical_keyword: 'easy-lunch-ideas' }), '/keywords/easy-lunch-ideas');
  assert.equal(resolveCreatorUrl('@marthastewart'), '/marthastewart');
  assert.equal(resolveCreatorUrl('keywords'), '/accounts?creator=keywords');
  assert.equal(resolveCreatorUrl('domains'), '/accounts?creator=domains');

  assert.deepEqual(Array.from(parseRequestedTypes('creators, domains, invalid')).sort(), ['creators', 'domains']);
  assert.equal(parseRequestedTypes('').size, 4);
});

test('searchMultiEntityAutocomplete runs 4 parallel entity queries, honors @creator prefix, and degrades cleanly on DB error', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM tracked_keywords')) {
      return [{ id: 11, keyword: 'marry me chicken', canonical_keyword: 'marry-me-chicken', category: 'Dinner', is_active: true, target_pin_count: 20, avg_daily_velocity: 42.5, active_pin_count: 19 }];
    }
    if (query.includes('FROM competitor_profiles')) {
      return [{ id: 7, username: 'marthastewart', display_name: 'Martha Stewart', avatar_url: 'https://i.pinimg.com/a.jpg', monthly_reach: 1200000, follower_count: 500000, total_pins: 1800, account_type: 'competitor' }];
    }
    if (query.includes('FROM keyword_folders')) {
      return [{ id: 3, name: 'Marketing Crafts', description: 'Seasonal cluster', color: '#10b981', icon: 'folder', keyword_count: 8 }];
    }
    if (query.includes('FROM domain_intelligence_rollup')) {
      return [{ domain: 'marthastewart.com', total_pins: 84, active_serp_pins: 22, total_saves: 14500, avg_velocity: 18.2, ad_network: 'Mediavine', age_years: 28.1 }];
    }
    return [];
  });

  const shortRes = await searchMultiEntityAutocomplete(sql, { query: 'm' });
  assert.equal(shortRes.source, 'min_chars');
  assert.equal(calls.length, 0);

  const res = await searchMultiEntityAutocomplete(sql, { query: 'mar', limit: 5 });
  assert.equal(calls.length, 4);
  assert.equal(res.success, true);
  assert.equal(res.counts.total, 4);
  assert.equal(res.results[0].keyword, 'marry me chicken');

  calls.length = 0;
  await searchMultiEntityAutocomplete(sql, { query: '@mar' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].query.includes('FROM competitor_profiles'));

  // Degraded fallback via route handler when SQL rejects
  const degradedRes = await handleKeywordsRoutes({
    pathname: '/api/search/autocomplete',
    method: 'GET',
    searchParams: new URLSearchParams('q=mar'),
    sql: () => Promise.reject(new Error('DB offline')),
    buildCanonicalCacheKey: (ns, p) => `${ns}:${JSON.stringify(p)}`,
    getCachedOrFetch: async (_k, fn) => fn(),
    clampLimit: (v, d) => Number(v) || d,
    jsonResponse: (data, status = 200, cacheSeconds = 0) => ({ status, cacheSeconds, body: data })
  });
  assert.equal(degradedRes.status, 200);
  assert.equal(degradedRes.cacheSeconds, 0);
  assert.equal(degradedRes.body.degraded, true);
});

test('resolveEffectiveSerpQuota enforces [10, 2000] bounds and exact precedence hierarchy', () => {
  assert.equal(clampSerpQuota(5), 10);
  assert.equal(clampSerpQuota(20), 20);
  assert.equal(clampSerpQuota(5000), 2000);
  assert.equal(clampSerpQuota('', 50), 50);

  assert.equal(computePagesForQuota(10), 1);
  assert.equal(computePagesForQuota(26), 2);

  assert.equal(
    resolveEffectiveSerpQuota({
      explicitMaxPins: 35,
      keywordTargetPins: 20,
      folderMaxPins: 100,
      appSettings: { max_serp_pins: 250 },
      keywordPagesLimit: 10
    }),
    35
  );
  assert.equal(
    resolveEffectiveSerpQuota({
      explicitMaxPins: '',
      keywordTargetPins: 20,
      folderMaxPins: 100,
      appSettings: { max_serp_pins: 250 },
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
  assert.equal(resolveEffectiveSerpQuota({ keywordPagesLimit: 3 }), 75);
  assert.equal(resolveEffectiveSerpQuota({}), 50);
});

test('Quota settings propagation, crawlKeywordSERP target=10 displacement, and /api/urls/global-saves wildcard escaping work end-to-end', async () => {
  const { sql, calls } = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 20, default_max_pins: 20, default_crawl_pages: 1, default_inspection_mode: 'smart_breakout' } }];
    }
    if (query.includes('UPDATE tracked_keywords') && query.includes('RETURNING')) {
      return [{ id: 42, keyword: 'taco soup', target_pin_count: 10, crawl_pages_limit: 1 }];
    }
    if (query.includes('INSERT INTO tracked_keywords')) {
      return [{ id: 99, keyword: 'quick dinner', target_pin_count: 20, crawl_pages_limit: 1, inspection_mode: 'smart_breakout' }];
    }
    return [];
  });

  // 1. updateAppSettings with apply_to_all=true demotes overflow active SERP ranks
  await updateAppSettings(sql, {
    max_serp_pins: 20,
    default_max_pins: 20,
    default_crawl_pages: 1,
    default_inspection_mode: 'smart_breakout',
    apply_to_all: true
  });
  assert.equal(calls.some((c) => c.query.includes('UPDATE keyword_serp_positions') && c.query.includes('is_displaced = TRUE')), true);

  // 2. updateKeywordSettings + addKeyword + resolveKeywordBySlug
  const kwUpdated = await updateKeywordSettings(sql, 42, { target_pin_count: 10 });
  assert.equal(kwUpdated.target_pin_count, 10);
  const kwAdded = await addKeyword(sql, { keyword: 'Quick Dinner' });
  assert.equal(kwAdded.target_pin_count, 20);
  const kwSlug = await resolveKeywordBySlug(sql, 'quick-dinner', true);
  assert.equal(kwSlug.target_pin_count, 20);

  // 3. crawlKeywordSERP respects target_pin_count = 10 and displaces prior ranks > 10
  const originalFetch = globalThis.fetch;
  const mockSerpPins = Array.from({ length: 15 }, (_, idx) => ({
    id: String(10000000001 + idx),
    type: 'pin',
    title: `Mock Pin ${idx + 1}`,
    domain: 'example.com',
    link: `https://example.com/p/${idx + 1}`,
    images: { '736x': { url: `https://i.pinimg.com/736x/${idx + 1}.jpg` } },
    aggregated_pin_data: { aggregated_stats: { saves: 100 + idx } },
    repin_count: 5
  }));

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource')) {
      return new Response(
        JSON.stringify({ resource_response: { data: { results: mockSerpPins }, bookmark: '-end-' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.includes('urls/count.json')) {
      return new Response('receiveCount({"count":321})', { status: 200 });
    }
    return new Response(JSON.stringify({ resource_response: { data: {} } }), { status: 200 });
  };

  try {
    const serpMock = makeMockSql((query) => {
      if (query.includes('UPDATE tracked_keywords SET crawl_lease_token =')) return [{ id: 77 }];
      if (query.includes('SELECT id, keyword, target_pin_count')) {
        return [{ id: 77, keyword: 'easy lunch ideas', target_pin_count: 10, crawl_pages_limit: 1, is_active: true, metadata: {} }];
      }
      if (query.includes('FROM app_settings')) {
        return [{ key: 'keyword_crawl_settings', value: { max_serp_pins: 20, default_max_pins: 20 } }];
      }
      if (query.includes('FROM keyword_serp_positions ksp') && query.includes('is_displaced = FALSE')) {
        return Array.from({ length: 20 }, (_, i) => ({
          pin_id: String(20000000001 + i),
          rank_position: i + 1,
          save_count: 50,
          repin_count: 2,
          title: `Old Pin ${i + 1}`,
          domain: 'old.com',
          visual_annotations: [],
          metadata: {}
        }));
      }
      return [];
    });

    const serpRes = await crawlKeywordSERP(serpMock.sql, 77, { skip_top_enrich: true, force: true });
    assert.equal(serpRes.success, true);
    assert.equal(serpRes.crawled_pins, 10);
    assert.equal(
      serpMock.calls.some((c) => c.query.includes('UPDATE keyword_serp_positions SET is_displaced = TRUE')),
      true
    );

    // 4. Verify /api/urls/global-saves write-back escapes SQL wildcards with ESCAPE '\'
    const bgTasks = [];
    const urlSaveMock = makeMockSql();
    const urlSaveRes = await handleKeywordsRoutes({
      pathname: '/api/urls/global-saves',
      method: 'GET',
      searchParams: new URLSearchParams({ url: 'https://example.com/100%_recipe_idea' }),
      sql: urlSaveMock.sql,
      ctx: {},
      safeWaitUntil: (_ctx, p) => bgTasks.push(typeof p === 'function' ? p() : p),
      jsonResponse: (data, status = 200) => ({ status, body: data }),
      methodNotAllowedResponse: () => ({ status: 405 })
    });
    assert.equal(urlSaveRes.status, 200);
    assert.equal(urlSaveRes.body.count, 321);
    await Promise.all(bgTasks);

    const updateCall = urlSaveMock.calls.find((c) => c.query.includes('UPDATE universal_master_pins'));
    assert.ok(updateCall);
    assert.match(updateCall.query, /LIKE\s+.*ESCAPE\s+'\\'/i);
    assert.ok(updateCall.values.includes('https://example.com/100\\%\\_recipe\\_idea?%'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
