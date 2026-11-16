import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handleKeywordsRoutes } from '../src/routes/keywords.mjs';
import { handleClusterRoutes } from '../src/routes/cluster.mjs';
import { getAppSettings, updateAppSettings, savePinterestCookie } from '../src/modules/keywords/settings.mjs';
import { listKeywords } from '../src/modules/keywords/service.mjs';
import { verifyApiAuthentication, jsonResponse } from '../src/http/security-and-response.mjs';

function makeMockSql(handler) {
  return async function mockSql(strings, ...values) {
    return handler(strings.join('?'), values, strings);
  };
}

test('GET and POST /api/settings never leak pinterest_cookie plaintext and enforce Cache-Control: no-store', async () => {
  const secretCookie = '_auth=1; _pinterest_sess="SECRET_TOKEN_SHOULD_NEVER_BE_EXPOSED_1234567890"';
  let persistedJsonb = null;

  const mockSql = makeMockSql((query, values) => {
    if (query.includes('FROM app_settings') && query.includes('WHERE key IN')) {
      return [
        { key: 'pinterest_cookie', value: { cookie: secretCookie, formatted_cookie: secretCookie } },
        { key: 'keyword_crawl_settings', value: { default_crawl_pages: 3 } }
      ];
    }
    if (query.includes('INSERT INTO app_settings') && values[0]) {
      persistedJsonb = JSON.parse(values[0]);
      return [];
    }
    return [];
  });

  const getRes = await handleKeywordsRoutes({
    pathname: '/api/settings',
    method: 'GET',
    request: new Request('http://127.0.0.1:3000/api/settings', { method: 'GET' }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    jsonResponse,
    invalidateEdgeCache: () => {}
  });
  assert.equal(getRes.status, 200);
  assert.match(getRes.headers.get('cache-control') || '', /no-store/i);
  assert.match(getRes.headers.get('cache-control') || '', /private/i);

  const getBody = await getRes.json();
  assert.equal(getBody.success, true);
  assert.equal(getBody.settings.pinterest_cookie, '');
  assert.equal(getBody.settings.has_pinterest_cookie, true);
  assert.equal(JSON.stringify(getBody).includes('SECRET_TOKEN'), false);

  const postRes = await handleKeywordsRoutes({
    pathname: '/api/settings',
    method: 'POST',
    request: new Request('http://127.0.0.1:3000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_crawl_pages: 4 })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    jsonResponse,
    invalidateEdgeCache: () => {}
  });
  assert.equal(postRes.status, 200);
  assert.match(postRes.headers.get('cache-control') || '', /no-store/i);
  const postBody = await postRes.json();
  assert.equal(postBody.settings.pinterest_cookie, '');
  assert.equal(postBody.settings.has_pinterest_cookie, true);
  assert.equal(JSON.stringify(postBody).includes('SECRET_TOKEN'), false);

  // updateAppSettings must strip pinterest_cookie from keyword_crawl_settings JSONB
  assert.ok(persistedJsonb, 'Expected keyword_crawl_settings JSONB payload to be persisted');
  assert.equal('pinterest_cookie' in persistedJsonb, false);
  assert.equal('has_pinterest_cookie' in persistedJsonb, false);
  assert.equal(persistedJsonb.default_crawl_pages, 4);
});

test('/api/settings/cookie and savePinterestCookie mask cookie previews without exposing token prefixes', async () => {
  const secretCookie = '_auth=1; _pinterest_sess=ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
  const saved = await savePinterestCookie(null, secretCookie);
  assert.equal(saved.has_cookie, true);
  assert.equal(saved.preview, '[CONFIGURED]');
  assert.equal(saved.preview.includes('ABCDEF'), false);

  const mockSql = makeMockSql((query) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'pinterest_cookie', value: { cookie: secretCookie } }];
    }
    return [];
  });

  const getCookieRes = await handleClusterRoutes({
    pathname: '/api/settings/cookie',
    method: 'GET',
    request: new Request('http://127.0.0.1:3000/api/settings/cookie', { method: 'GET' }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    jsonResponse
  });
  assert.equal(getCookieRes.status, 200);
  assert.match(getCookieRes.headers.get('cache-control') || '', /no-store/i);
  const cookieBody = await getCookieRes.json();
  assert.equal(cookieBody.has_cookie, true);
  assert.equal(cookieBody.preview, '[CONFIGURED]');
  assert.equal(JSON.stringify(cookieBody).includes('ABCDEF'), false);

  // Ensure fallback route in src/plugins/api-routes.mjs also redacts prefix
  const apiRoutesSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/plugins/api-routes.mjs'), 'utf8');
  assert.doesNotMatch(apiRoutesSrc, /cookie\.slice\(0,\s*42\)/);

  // Internal DB callers via getAppSettings still receive the resolved cookie
  const internalSettings = await getAppSettings(mockSql);
  assert.equal(internalSettings.pinterest_cookie, secretCookie);
});

test('updateAppSettings isolates pinterest_cookie row from keyword_crawl_settings JSONB', async () => {
  const writes = [];
  const mockSql = makeMockSql((query, values) => {
    if (query.includes('FROM app_settings')) {
      return [{ key: 'keyword_crawl_settings', value: { default_crawl_pages: 2 } }];
    }
    if (query.includes('INSERT INTO app_settings')) {
      writes.push({ query, values });
    }
    return [];
  });

  const updated = await updateAppSettings(mockSql, {
    default_crawl_pages: 5,
    pinterest_cookie: '_auth=1; _pinterest_sess=NEW_COOKIE_VALUE_LONG_ENOUGH'
  });

  assert.equal(writes.length, 2, 'Should write pinterest_cookie and keyword_crawl_settings separately');
  const crawlWrite = writes.find((w) => w.query.includes("'keyword_crawl_settings'"));
  assert.ok(crawlWrite, 'Must persist keyword_crawl_settings');
  const parsed = JSON.parse(crawlWrite.values[0]);
  assert.equal('pinterest_cookie' in parsed, false);
  assert.equal(parsed.default_crawl_pages, 5);
  assert.equal(updated.has_pinterest_cookie, true);
});

test('listKeywords escapes SQL LIKE wildcards (% and _) and uses ESCAPE clause', async () => {
  let capturedQuery = '';
  let capturedPattern = '';
  const mockSql = makeMockSql((query, values) => {
    if (query.includes('FROM tracked_keywords')) {
      capturedQuery = query;
      capturedPattern = values[0];
    }
    return [];
  });

  await listKeywords(mockSql, { search: '100%_off\\test', limit: 20, offset: 0 });
  assert.equal(capturedPattern, '%100\\%\\_off\\\\test%');
  assert.match(capturedQuery, /ESCAPE '\\'/);
});

test('cluster, analytics, pulse, and consolidator SQL hardening contracts hold', () => {
  const clusterSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/cluster/service.mjs'), 'utf8');
  assert.ok(
    clusterSrc.includes("WHEN TRIM(COALESCE(u.aspect_ratio, '')) ~ '^[+-]?(\\d+(\\.\\d+)?|\\.\\d+)$'"),
    'cluster/service.mjs must validate numeric format before casting u.aspect_ratio'
  );
  assert.match(clusterSrc, /THEN TRIM\(u\.aspect_ratio\)::numeric/);

  const analyticsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/creators/creator-analytics.mjs'), 'utf8');
  const matches = analyticsSrc.match(/LOWER\(COALESCE\(creator_username,\s*''\)\) LIKE \$\{accountPattern\}/g) || [];
  assert.equal(matches.length, 2, 'Both data and count queries in listArchivedPins must lowercase creator_username');

  const pulseSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pulse/service.mjs'), 'utf8');
  assert.match(pulseSrc, /LOWER\(TRIM\(REPLACE\(COALESCE\(ump\.creator_username,\s*''\),\s*'@',\s*''\)\)\)/);

  const consolidatorSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-fleet-consolidator.mjs'), 'utf8');
  assert.doesNotMatch(consolidatorSrc, /Executing Hub Sequential Table Vacuum & Statistics Refresh/);
});

test('verifyApiAuthentication does not treat directory paths like /app/check/server.mjs as test mode', () => {
  const prevArgv = [...process.argv];
  const prevFlag = globalThis.__PAE_TEST_MODE__;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    globalThis.__PAE_TEST_MODE__ = false;
    process.env.NODE_ENV = 'production';
    process.argv = ['node', '/app/check/server.mjs'];
    const res = verifyApiAuthentication(
      new Request('http://127.0.0.1:3000/api/settings'),
      { NODE_ENV: 'production', ENVIRONMENT: 'production', API_SECRET_KEY: 'topsecret123' }
    );
    assert.equal(res.authorized, false);
    assert.equal(res.status, 401);
  } finally {
    process.argv = prevArgv;
    globalThis.__PAE_TEST_MODE__ = prevFlag;
    process.env.NODE_ENV = prevNodeEnv;
  }
});
