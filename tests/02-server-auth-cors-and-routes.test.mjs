import test from 'node:test';
import assert from 'node:assert/strict';
import { createFastifyApp, startServer } from '../src/server.mjs';
import {
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache
} from '../src/http/security-and-response.mjs';
import { verifySameOriginBrowserOrApiRequest } from '../src/routes/keywords.mjs';

function makeNoopSql() {
  const fn = async () => [];
  fn.end = async () => {};
  return fn;
}

test('Fastify fail-closed production auth returns 503 when API_SECRET_KEY is missing and 401 on invalid/query credentials', async (t) => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevEnv = process.env.ENVIRONMENT;
  const prevApiKey = process.env.API_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  process.env.ENVIRONMENT = 'production';
  delete process.env.API_SECRET_KEY;

  const unconfiguredApp = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });

  const configuredApp = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'prod-super-key-999',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });

  t.after(async () => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevEnv === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = prevEnv;
    if (prevApiKey === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = prevApiKey;
    await unconfiguredApp.close();
    await configuredApp.close();
  });

  // 1. Missing API_SECRET_KEY in production -> 503 fail-closed
  const res503Api = await unconfiguredApp.inject({
    method: 'POST',
    url: '/api/cache/invalidate',
    payload: {}
  });
  assert.equal(res503Api.statusCode, 503);
  assert.equal(res503Api.json().error, 'AUTH_NOT_CONFIGURED');

  const res503Internal = await unconfiguredApp.inject({
    method: 'POST',
    url: '/api/internal/ingest',
    payload: { pins: [] }
  });
  assert.equal(res503Internal.statusCode, 503);

  // 2. Configured secret -> 401 on missing, wrong header, or deprecated ?api_key= query string
  const resMissing = await configuredApp.inject({
    method: 'POST',
    url: '/api/cache/invalidate',
    payload: {}
  });
  assert.equal(resMissing.statusCode, 401);

  const resWrong = await configuredApp.inject({
    method: 'POST',
    url: '/api/cache/invalidate',
    headers: { 'x-api-key': 'wrong-token' },
    payload: {}
  });
  assert.equal(resWrong.statusCode, 401);

  const resQueryKey = await configuredApp.inject({
    method: 'POST',
    url: '/api/cache/invalidate?api_key=prod-super-key-999',
    headers: { 'x-api-key': 'prod-super-key-999' },
    payload: {}
  });
  assert.equal(resQueryKey.statusCode, 401);

  // 3. Valid x-api-key -> 200
  const resValid = await configuredApp.inject({
    method: 'POST',
    url: '/api/cache/invalidate',
    headers: { 'x-api-key': 'prod-super-key-999' },
    payload: { scope: 'all' }
  });
  assert.equal(resValid.statusCode, 200);
  assert.equal(resValid.json().invalidated, true);
});

test('Fastify enforces closed default CORS when ALLOWED_ORIGINS is unset and honors explicit allowlists', async (t) => {
  const closedCorsApp = createFastifyApp({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: '',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });

  const allowlistApp = createFastifyApp({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: 'https://app.hymum.com, https://staging.hymum.com',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });

  t.after(async () => {
    await closedCorsApp.close();
    await allowlistApp.close();
  });

  const evilGet = await closedCorsApp.inject({
    method: 'GET',
    url: '/api/crawl-status',
    headers: { Origin: 'https://evil.example' }
  });
  assert.equal(evilGet.statusCode, 200);
  assert.equal(evilGet.headers['access-control-allow-origin'], undefined);

  const evilOptions = await closedCorsApp.inject({
    method: 'OPTIONS',
    url: '/api/keywords',
    headers: { Origin: 'https://evil.example' }
  });
  assert.equal(evilOptions.statusCode, 204);
  assert.equal(evilOptions.headers['access-control-allow-origin'], undefined);

  const allowedOriginRes = await allowlistApp.inject({
    method: 'GET',
    url: '/api/crawl-status',
    headers: { Origin: 'https://app.hymum.com' }
  });
  assert.equal(allowedOriginRes.statusCode, 200);
  assert.equal(allowedOriginRes.headers['access-control-allow-origin'], 'https://app.hymum.com');
  assert.match(String(allowedOriginRes.headers.vary || ''), /Origin/i);

  const rejectedOriginRes = await allowlistApp.inject({
    method: 'GET',
    url: '/api/crawl-status',
    headers: { Origin: 'https://untrusted.example' }
  });
  assert.equal(rejectedOriginRes.headers['access-control-allow-origin'], undefined);
});

test('Fastify redacts secrets on /api/health errors and enforces 413 bodyLimit (512 KiB) on POST /api/keywords/bulk-import', async (t) => {
  const failingSql = async () => {
    throw new Error(
      'connect ECONNREFUSED postgresql://postgres:TopSecretDbPass77@db.hymum.com:5432/pin_arbitrage?password=TopSecretDbPass77'
    );
  };
  failingSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:TopSecretDbPass77@127.0.0.1:5432/pin_arbitrage',
    SQL_CLIENT: failingSql
  });

  t.after(async () => {
    await app.close();
  });

  const healthRes = await app.inject({
    method: 'GET',
    url: '/api/health'
  });
  assert.equal(healthRes.statusCode, 503);
  const healthBody = healthRes.json();
  assert.equal(healthBody.status, 'degraded');
  assert.equal(String(healthBody.error).includes('TopSecretDbPass77'), false);
  assert.ok(String(healthBody.error).includes('[REDACTED_DATABASE_URL]'));

  // Exceed 512 * 1024 byte limit on POST /api/keywords/bulk-import -> 413
  const oversizedPayload = JSON.stringify({
    keywords: Array.from({ length: 12000 }, (_, i) => `oversized-keyword-entry-${i}-${'x'.repeat(30)}`)
  });
  assert.ok(Buffer.byteLength(oversizedPayload) > 512 * 1024);

  const bulkRes = await app.inject({
    method: 'POST',
    url: '/api/keywords/bulk-import',
    headers: { 'content-type': 'application/json' },
    payload: oversizedPayload
  });
  assert.equal(bulkRes.statusCode, 413);
  assert.equal(bulkRes.json().error, 'PAYLOAD_TOO_LARGE');
});

test('buildCanonicalCacheKey preserves token/ID casing, getCachedOrFetch isolates SWR failures from forceRefresh, and verifySameOriginBrowserOrApiRequest fails closed', async () => {
  await invalidateEdgeCache();

  // 1. Case-preserving buildCanonicalCacheKey
  const key = buildCanonicalCacheKey('pins:list', {
    domain: 'Example.COM',
    keyword: 'Easy Pasta',
    cursor: 'AbCdEf_Token_99',
    bookmark: 'Y2JVS19X',
    pin_id: '70437491132581'
  });
  assert.ok(key.includes('domain=example.com'));
  assert.ok(key.includes('keyword=easy%20pasta'));
  assert.ok(key.includes('cursor=AbCdEf_Token_99'), 'Cursor/token casing must be preserved');
  assert.ok(key.includes('bookmark=Y2JVS19X'), 'Bookmark casing must be preserved');

  // 2. Background SWR failure logs warning and NEVER resolves concurrent foreground forceRefresh to undefined
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const swrKey = 'test:swr:isolation';
    const seed = await getCachedOrFetch(swrKey, async () => ({ success: true, version: 1 }), 15, 5000);
    assert.equal(seed.version, 1);

    await new Promise((r) => setTimeout(r, 25));

    let rejectSwr;
    const swrReturned = await getCachedOrFetch(
      swrKey,
      () => new Promise((_, reject) => {
        rejectSwr = reject;
      }),
      15,
      5000
    );
    assert.equal(swrReturned.version, 1, 'Stale caller gets cached v1 immediately');

    // Concurrent foreground forceRefresh while background SWR is still in flight and about to fail
    const fgPromise = getCachedOrFetch(
      swrKey,
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { success: true, version: 2 };
      },
      1000,
      5000,
      { forceRefresh: true }
    );

    rejectSwr(new Error('postgresql://user:SecretPass@host/db SWR transient failure'));
    const fgResult = await fgPromise;
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(fgResult !== undefined, 'Foreground forceRefresh must never resolve to undefined');
    assert.equal(fgResult.version, 2);
    assert.equal(warnings.some((w) => w.includes('Background SWR revalidation failed')), true);
    assert.equal(warnings.some((w) => w.includes('SecretPass')), false, 'SWR warning must redact secrets');
  } finally {
    console.warn = origWarn;
    await invalidateEdgeCache();
  }

  // 3. verifySameOriginBrowserOrApiRequest fails closed when Origin, Sec-Fetch-Site, and API headers are all absent
  const failClosedCheck = verifySameOriginBrowserOrApiRequest(
    { url: 'http://localhost:3000/api/urls/batch-global-saves', headers: new Headers() },
    {}
  );
  assert.equal(failClosedCheck.allowed, false);
});

test('All UI studio routes return 200 with private no-store + Vary: Cookie on GET/HEAD and 405 on POST', async (t) => {
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });

  t.after(async () => {
    await app.close();
  });

  const studioRoutes = [
    '/',
    '/keywords',
    '/keywords/easy-dinner',
    '/discovery',
    '/pin/1098245059167667976',
    '/folders',
    '/folders/42/settings',
    '/domains',
    '/domains/example.com',
    '/pulse'
  ];

  for (const route of studioRoutes) {
    const getRes = await app.inject({ method: 'GET', url: route });
    assert.equal(getRes.statusCode, 200, `GET ${route} should return 200`);
    assert.equal(getRes.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(getRes.headers.vary, 'Cookie');
    assert.match(String(getRes.headers['content-type']), /text\/html/i);
    assert.ok(getRes.body.includes('<!DOCTYPE html>'));

    const headRes = await app.inject({ method: 'HEAD', url: route });
    assert.equal(headRes.statusCode, 200, `HEAD ${route} should return 200`);
    assert.equal(headRes.body, '');

    const postRes = await app.inject({ method: 'POST', url: route, payload: {} });
    assert.equal(postRes.statusCode, 405, `POST ${route} should return 405`);
  }
});

test('startServer boots cleanly in development without DATABASE_URL and refuses to boot in production without DATABASE_URL', async (t) => {
  await assert.rejects(
    () => startServer(0, '127.0.0.1', { NODE_ENV: 'production', ENVIRONMENT: 'production', DATABASE_URL: '' }),
    /DATABASE_URL is not configured/
  );

  const server = await startServer(0, '127.0.0.1', { NODE_ENV: 'development', ENVIRONMENT: 'development', DATABASE_URL: '' });
  t.after(async () => {
    await server.fastify.close();
  });

  const healthRes = await server.fastify.inject({ method: 'GET', url: '/api/health' });
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.json().status, 'healthy');
  assert.equal(healthRes.json().database, 'disconnected');

  const pageRes = await server.fastify.inject({ method: 'GET', url: '/' });
  assert.equal(pageRes.statusCode, 200);
  assert.equal(pageRes.headers['x-frame-options'], undefined);
  assert.match(String(pageRes.headers['content-security-policy']), /frame-ancestors \*/);
});
