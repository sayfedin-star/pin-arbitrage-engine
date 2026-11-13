import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PINTEREST_SESSION_COOKIE } from '../src/modules/keywords/settings.mjs';
import { handleClusterRoutes } from '../src/routes/cluster.mjs';
import { fetchAdsTxt } from '../src/modules/domains/ad-network-service.mjs';
import { syncPinAcrossAllFourPillars } from '../src/modules/pins/repository.mjs';
import {
  upsertCompetitorPins,
  reEvaluateCompetitorPins,
  reconcileQualifiedCatalogPins
} from '../src/modules/creators/creator-ingest.mjs';

test('Phase 1.1: DEFAULT_PINTEREST_SESSION_COOKIE contains no hardcoded secret', () => {
  assert.equal(DEFAULT_PINTEREST_SESSION_COOKIE, '');
});

test('Phase 1.1: POST /api/settings/cookie never exposes formatted_cookie or full secret in HTTP response', async () => {
  const secretToken = '_pinterest_sess=TWc9PSZtestSecretSessionCookieValue1234567890';
  const mockSql = async () => [];
  const env = {};

  const request = new Request('http://localhost/api/settings/cookie', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cookie: secretToken })
  });

  const res = await handleClusterRoutes({
    pathname: '/api/settings/cookie',
    method: 'POST',
    request,
    searchParams: new URLSearchParams(),
    env,
    ctx: {},
    sql: mockSql,
    jsonResponse: (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' }
      }),
    methodNotAllowedResponse: () => new Response('Method Not Allowed', { status: 405 }),
    clampLimit: (v) => v,
    buildCanonicalCacheKey: (k) => k,
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: async () => {},
    safeWaitUntil: () => {},
    redactSecrets: (s) => s
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.has_cookie, true);
  assert.equal(body.is_configured, true);
  assert.equal('formatted_cookie' in body, false);
  assert.equal(JSON.stringify(body).includes('testSecretSessionCookieValue1234567890'), false);
});

test('Phase 1.2: fetchAdsTxt rejects private IPs, metadata hosts, and unsafe redirects (SSRF guard)', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = 0;

  try {
    globalThis.fetch = async () => {
      fetchCalled++;
      return new Response('should not happen', { status: 200 });
    };

    const blockedTargets = [
      'localhost',
      '127.0.0.1',
      '169.254.169.254',
      '10.0.0.1',
      '192.168.1.10',
      '[::1]',
      '[::ffff:127.0.0.1]',
      'metadata.google.internal',
      'service.internal.local'
    ];

    for (const target of blockedTargets) {
      const res = await fetchAdsTxt(target);
      assert.equal(res.ok, false, `Expected ${target} to be blocked`);
      assert.equal(res.status, 'failed');
      assert.match(res.error || '', /Blocked unsafe target/i);
    }
    assert.equal(fetchCalled, 0);

    // Redirect hop to loopback IP must be blocked before second fetch
    let hopCalls = 0;
    globalThis.fetch = async (url) => {
      hopCalls++;
      if (String(url).startsWith('https://1.1.1.1/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/latest/meta-data/' }
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    };

    const redirectRes = await fetchAdsTxt('1.1.1.1');
    assert.equal(redirectRes.ok, false);
    assert.equal(hopCalls, 1);
    assert.match(redirectRes.error || '', /Blocked unsafe target/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 2.1: syncPinAcrossAllFourPillars keeps creative fields in universal_master_pins and strips them from secondary metadata', async () => {
  const queries = [];
  const mockSql = (strings, ...values) => {
    const queryText = strings.join(' ? ');
    queries.push({ queryText, values });
    if (queryText.includes('FROM keyword_serp_current') && queryText.includes('SELECT')) {
      return Promise.resolve([{
        keyword_id: 101,
        save_count: 50,
        repin_count: 10,
        baseline_day_saves: 40,
        baseline_day_date: '2026-11-12',
        crawled_at: '2026-11-12T00:00:00Z'
      }]);
    }
    return Promise.resolve([]);
  };

  await syncPinAcrossAllFourPillars({
    sql: mockSql,
    pinId: '998877665544',
    scrapedPin: {
      pin_id: '998877665544',
      title: 'Test Pin Title',
      domain: 'example.com',
      destination_url: 'https://example.com/recipe',
      image_url: 'https://i.pinimg.com/originals/test.jpg',
      description: 'Full creative description that should live only in master SSOT',
      alt_text: 'Detailed alt text for creative SSOT',
      seo_title: 'SEO creative title',
      seo_description: 'SEO creative description',
      board_name: 'Dinner Ideas',
      save_count: 120,
      repin_count: 35,
      creation_method: 'carousel'
    },
    fetchUniversalPinDossier: async () => ({ success: true, pin_id: '998877665544' })
  });

  const masterInsert = queries.find((q) => q.queryText.includes('INSERT INTO universal_master_pins'));
  assert.ok(masterInsert, 'Expected universal_master_pins insert');
  const masterMetaJson = masterInsert.values.find((v) => typeof v === 'string' && v.includes('"creation_method"'));
  assert.ok(masterMetaJson, 'Expected master metadata JSON');
  const masterMeta = JSON.parse(masterMetaJson);
  assert.equal(masterMeta.alt_text, 'Detailed alt text for creative SSOT');
  assert.equal(masterMeta.description, 'Full creative description that should live only in master SSOT');
  assert.equal(masterMeta.board_name, 'Dinner Ideas');

  const serpUpdate = queries.find((q) => q.queryText.includes('UPDATE keyword_serp_current'));
  assert.ok(serpUpdate, 'Expected keyword_serp_current update');
  const serpMetaJson = serpUpdate.values.find((v) => typeof v === 'string' && v.includes('"creation_method"'));
  assert.ok(serpMetaJson, 'Expected secondary metadata JSON for keyword_serp_current');
  const serpMeta = JSON.parse(serpMetaJson);
  assert.equal('alt_text' in serpMeta, false);
  assert.equal('description' in serpMeta, false);
  assert.equal('seo_title' in serpMeta, false);
  assert.equal('seo_description' in serpMeta, false);
  assert.equal('board_name' in serpMeta, false);
  assert.equal(serpMeta.creation_method, 'carousel');

  const compUpdate = queries.find((q) => q.queryText.includes('UPDATE competitor_pins'));
  assert.ok(compUpdate, 'Expected competitor_pins update');
  const compMetaJson = compUpdate.values.find((v) => typeof v === 'string' && v.includes('"creation_method"'));
  assert.ok(compMetaJson, 'Expected secondary metadata JSON for competitor_pins');
  const compMeta = JSON.parse(compMetaJson);
  assert.equal('alt_text' in compMeta, false);
  assert.equal('description' in compMeta, false);
  assert.equal('seo_title' in compMeta, false);
  assert.equal('seo_description' in compMeta, false);
  assert.equal('board_name' in compMeta, false);
});

test('Phase 2.2: creator-ingest omits description and alt_text writes on competitor_pins and pa_pins', async () => {
  const queries = [];
  const mockSql = (strings, ...values) => {
    const queryText = strings.join(' ? ');
    queries.push({ queryText, values });
    if (queryText.includes('FROM competitor_profiles') && queryText.includes('SELECT')) {
      return Promise.resolve([{
        id: 1,
        username: 'testcreator',
        qualification_rules: {}
      }]);
    }
    if (queryText.includes('FROM competitor_pins') && queryText.includes('SELECT')) {
      return Promise.resolve([
        {
          competitor_id: 1,
          pin_id: '1234567890',
          account_username: 'testcreator',
          title: 'Qualified Pin',
          link: 'https://example.com/post',
          domain: 'example.com',
          link_domain: 'example.com',
          destination_url: 'https://example.com/post',
          board_name: 'Board',
          board_slug: 'board',
          image_url: 'https://i.pinimg.com/originals/a.jpg',
          dominant_color: '#888888',
          saves: 500,
          repins: 120,
          comments: 10,
          share_count: 0,
          reactions: {},
          velocity: 10.5,
          annotations: [],
          is_video: false,
          save_count: 500,
          repin_count: 120,
          comment_count: 10,
          is_product: false,
          created_at_pinterest: new Date().toISOString(),
          first_seen_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString()
        }
      ]);
    }
    return Promise.resolve([]);
  };
  mockSql.json = (v) => JSON.stringify(v);

  await upsertCompetitorPins(mockSql, 1, [
    {
      pin_id: '1234567890',
      title: 'Qualified Pin',
      description: 'Should go to master SSOT only',
      link_domain: 'example.com',
      destination_url: 'https://example.com/post',
      board_name: 'Board',
      image_url: 'https://i.pinimg.com/originals/a.jpg',
      save_count: 500,
      repin_count: 120,
      comment_count: 10
    }
  ]);

  const compInsert = queries.find((q) => q.queryText.includes('INSERT INTO competitor_pins'));
  assert.ok(compInsert);
  assert.equal(/\bdescription\b/.test(compInsert.queryText), false);
  assert.equal(/\balt_text\b/.test(compInsert.queryText), false);

  queries.length = 0;
  await reEvaluateCompetitorPins(mockSql, 1);
  const paPromote = queries.find((q) => q.queryText.includes('INSERT INTO pa_pins'));
  assert.ok(paPromote);
  assert.equal(/\bdescription\b/.test(paPromote.queryText), false);
  assert.equal(/\balt_text\b/.test(paPromote.queryText), false);

  queries.length = 0;
  await reconcileQualifiedCatalogPins(mockSql);
  const paReconcile = queries.find((q) => q.queryText.includes('INSERT INTO pa_pins'));
  assert.ok(paReconcile);
  assert.equal(/\bdescription\b/.test(paReconcile.queryText), false);
  assert.equal(/\balt_text\b/.test(paReconcile.queryText), false);
});
