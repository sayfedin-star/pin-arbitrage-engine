import test from 'node:test';
import assert from 'node:assert/strict';
import wakeShieldWorker, {
  _resetWakeShieldState,
  issueShieldCookieToken,
  verifyShieldCookieToken,
  serializeSafeJsonForScript,
  renderWakingHtml
} from '../workers/wake-shield/src/index.mjs';

function makeEnv(overrides = {}) {
  return {
    SHIELD_PIN: '948271',
    API_SECRET_KEY: 'pae-edge-origin-key-xyz',
    INSTABOX_MACHINE_ID: 'm_agq2t32m5xv5joj67rqoze5h4u',
    INSTABOX_API_KEY: 'ib_test_key_001',
    ...overrides
  };
}

function extractCookieValue(setCookieHeader, name = 'pae_shield_auth') {
  const match = String(setCookieHeader || '').match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : '';
}

test('Wake-Shield fails closed (503) when secrets are missing and blocks unauthenticated requests (401) before touching origin', async () => {
  _resetWakeShieldState();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response('should-not-run', { status: 200 });
  };

  try {
    const unconfiguredRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords'),
      {},
      {}
    );
    assert.equal(unconfiguredRes.status, 503);
    const unconfiguredBody = await unconfiguredRes.json();
    assert.equal(unconfiguredBody.error, 'AUTH_NOT_CONFIGURED');

    const unauthApiRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        headers: { Accept: 'application/json' }
      }),
      makeEnv(),
      {}
    );
    assert.equal(unauthApiRes.status, 401);

    const unauthHtmlRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/keywords', {
        headers: { Accept: 'text/html' }
      }),
      makeEnv(),
      {}
    );
    assert.equal(unauthHtmlRes.status, 401);
    const gateHtml = await unauthHtmlRes.text();
    assert.ok(gateHtml.includes('Protected Operator Gateway'));
    assert.equal(fetchCount, 0, 'Unauthenticated requests must never touch origin or InstaBox');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield issues HMAC-SHA256 expiring cookies with SameSite=Strict and rejects expired or tampered tokens', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  const capturedOriginRequests = [];

  globalThis.fetch = async (reqOrUrl) => {
    const urlStr = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
    if (urlStr.includes('api.instabox.sh')) {
      return new Response(JSON.stringify({ id: 'op_1', state: 'running' }), { status: 200 });
    }
    capturedOriginRequests.push(reqOrUrl);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const loginRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/shield-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.10'
        },
        body: JSON.stringify({ pin: '948271' })
      }),
      env,
      {}
    );
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('Set-Cookie') || '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /Path=\//i);

    const token = extractCookieValue(setCookie);
    assert.match(token, /^\d{10,12}\.[0-9a-f]{64}$/);
    assert.equal(await verifyShieldCookieToken(token, [env.SHIELD_PIN, env.API_SECRET_KEY]), true);

    // Expired token must fail verification and return 401 via fetch
    const expiredToken = await issueShieldCookieToken(env.SHIELD_PIN, Date.now() - 120_000, 60);
    assert.equal(await verifyShieldCookieToken(expiredToken, [env.SHIELD_PIN]), false);

    const expiredRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        headers: {
          Cookie: `pae_shield_auth=${expiredToken}`,
          Accept: 'application/json'
        }
      }),
      env,
      {}
    );
    assert.equal(expiredRes.status, 401);

    // Tampered expiration with original HMAC must fail
    const [expPart, hmacPart] = token.split('.');
    const tamperedToken = `${Number(expPart) + 3600}.${hmacPart}`;
    assert.equal(await verifyShieldCookieToken(tamperedToken, [env.SHIELD_PIN]), false);

    // Valid cookie on GET forwards request with injected x-api-key
    const validGetRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        method: 'GET',
        headers: {
          Cookie: `pae_shield_auth=${token}`,
          Accept: 'application/json'
        }
      }),
      env,
      {}
    );
    assert.equal(validGetRes.status, 200);
    assert.equal(capturedOriginRequests.length, 1);
    assert.equal(capturedOriginRequests[0].headers.get('x-api-key'), env.API_SECRET_KEY);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield enforces PIN brute-force rate limit (max 5 failures per 10m -> 429 with Retry-After)', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });

  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const failRes = await wakeShieldWorker.fetch(
        new Request('https://app.hymum.com/api/shield-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.77'
          },
          body: JSON.stringify({ pin: `wrong-${attempt}` })
        }),
        env,
        {}
      );
      assert.equal(failRes.status, 401, `Attempt ${attempt} should return 401`);
    }

    // 6th attempt from same IP is blocked with 429 + Retry-After
    const blockedRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/shield-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.77'
        },
        body: JSON.stringify({ pin: env.SHIELD_PIN })
      }),
      env,
      {}
    );
    assert.equal(blockedRes.status, 429);
    const retryAfter = Number(blockedRes.headers.get('Retry-After'));
    assert.ok(Number.isFinite(retryAfter) && retryAfter > 0, '429 response must include positive Retry-After header');

    // Different IP is unaffected
    const otherIpRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/shield-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.88'
        },
        body: JSON.stringify({ pin: env.SHIELD_PIN })
      }),
      env,
      {}
    );
    assert.equal(otherIpRes.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield blocks cross-origin cookie-authenticated mutating requests (403) BEFORE x-api-key injection or origin wakeup', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const validCookie = await issueShieldCookieToken(env.SHIELD_PIN);
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];

  globalThis.fetch = async (reqOrUrl) => {
    upstreamCalls.push(reqOrUrl);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    // 1. Cross-origin Origin header -> 403 before fetch
    const crossOriginPost = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        method: 'POST',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Origin: 'https://evil.example',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keyword: 'csrf' })
      }),
      env,
      {}
    );
    assert.equal(crossOriginPost.status, 403);
    assert.equal(upstreamCalls.length, 0);

    // 2. Missing Origin header on mutating cookie request -> 403 before fetch
    const missingOriginDelete = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords?id=5', {
        method: 'DELETE',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`
        }
      }),
      env,
      {}
    );
    assert.equal(missingOriginDelete.status, 403);
    assert.equal(upstreamCalls.length, 0);

    // 3. Matching Origin but Sec-Fetch-Site: cross-site -> 403 before fetch
    const crossFetchSite = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/settings', {
        method: 'POST',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Origin: 'https://app.hymum.com',
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json'
        },
        body: '{}'
      }),
      env,
      {}
    );
    assert.equal(crossFetchSite.status, 403);
    assert.equal(upstreamCalls.length, 0);

    // 4. Legitimate same-origin browser POST -> 200 and injects x-api-key
    const sameOriginPost = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        method: 'POST',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Origin: 'https://app.hymum.com',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keyword: 'soup' })
      }),
      env,
      {}
    );
    assert.equal(sameOriginPost.status, 200);
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].headers.get('x-api-key'), env.API_SECRET_KEY);

    // 5. Explicit x-api-key header client (authSource === 'header') without Origin -> allowed
    const headerApiPost = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/internal/ingest', {
        method: 'POST',
        headers: {
          'x-api-key': env.API_SECRET_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pins: [] })
      }),
      env,
      {}
    );
    assert.equal(headerApiPost.status, 200);
    assert.equal(upstreamCalls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield neutralizes //evil.com?logout=true open redirects and escapes <script> + redacts machineId', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const validCookie = await issueShieldCookieToken(env.SHIELD_PIN);

  // 1. Protocol-relative //evil.com?logout=true open-redirect attempt
  const logoutRes = await wakeShieldWorker.fetch(
    new Request('https://app.hymum.com//evil.com?logout=true&tab=1'),
    env,
    {}
  );
  assert.equal(logoutRes.status, 302);
  const location = logoutRes.headers.get('Location') || '';
  assert.equal(location.startsWith('//'), false, 'Redirect Location must never be protocol-relative //evil.com');
  assert.equal(new URL(location, 'https://app.hymum.com').origin, 'https://app.hymum.com');
  assert.equal(location, '/evil.com?tab=1');
  assert.match(logoutRes.headers.get('Set-Cookie') || '', /Max-Age=0.*SameSite=Strict/i);

  // 2. Safe JSON-in-script escaping and machineId redaction on waking splash & 503 JSON
  const safeJson = serializeSafeJsonForScript({ phase: '</script><script>alert(1)&</script>' });
  assert.equal(safeJson.includes('</script>'), false);
  assert.ok(safeJson.includes('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u0026\\u003c/script\\u003e'));

  const directWakingHtml = renderWakingHtml({
    state: 'resuming',
    phase: '</script><script>window.pwned=1</script>',
    errorCode: 'err_<&>'
  });
  assert.equal(directWakingHtml.includes('<script>window.pwned=1</script>'), false);
  assert.ok(directWakingHtml.includes('\\u003c/script\\u003e'));
  assert.equal(directWakingHtml.includes('m_agq2t32m'), false);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (reqOrUrl) => {
    const u = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
    if (u.includes('api.instabox.sh')) {
      return new Response(
        JSON.stringify({ error: { code: '</script><script>evil()</script>', retryAfterSeconds: 9 } }),
        { status: 429 }
      );
    }
    return new Response('Bad Gateway', { status: 502 });
  };

  try {
    const htmlWakeRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/keywords', {
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Accept: 'text/html'
        }
      }),
      env,
      {}
    );
    assert.equal(htmlWakeRes.status, 200);
    const bodyHtml = await htmlWakeRes.text();
    assert.equal(bodyHtml.includes('</script><script>evil()'), false);
    assert.ok(bodyHtml.includes('\\u003c/script\\u003e'));
    assert.equal(bodyHtml.includes(env.INSTABOX_MACHINE_ID), false);
    assert.equal(bodyHtml.includes(env.INSTABOX_MACHINE_ID.slice(0, 10)), false);

    const apiWakeRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Accept: 'application/json'
        }
      }),
      env,
      {}
    );
    assert.equal(apiWakeRes.status, 503);
    const apiWakeJson = await apiWakeRes.json();
    assert.equal('machineId' in apiWakeJson, false, '503 JSON must not leak raw machineId');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield transparently retries safe GET navigations with full 15s budget when /api/health confirms origin is awake', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const validCookie = await issueShieldCookieToken(env.SHIELD_PIN);
  const originalFetch = globalThis.fetch;

  let creatorsAttempts = 0;
  let healthAttempts = 0;
  globalThis.fetch = async (reqOrUrl) => {
    const u = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
    if (u.endsWith('/api/health')) {
      healthAttempts++;
      return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
    }
    if (u.includes('/folders/5/creators')) {
      creatorsAttempts++;
      if (creatorsAttempts === 1) {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      return new Response('<html><body>Creator Hub OK</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response('unexpected', { status: 500 });
  };

  try {
    const res = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/folders/5/creators', {
        method: 'GET',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Accept: 'text/html'
        }
      }),
      env,
      {}
    );
    assert.equal(res.status, 200);
    assert.equal(creatorsAttempts, 2, 'Safe GET navigation must retry once after /api/health confirms VM is awake');
    assert.equal(healthAttempts, 1);
    const body = await res.text();
    assert.ok(body.includes('Creator Hub OK'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wake-Shield retries transient 502 on GET when healthy, returns styled 504 if retry also times out, and never retries POST mutations', async () => {
  _resetWakeShieldState();
  const env = makeEnv();
  const validCookie = await issueShieldCookieToken(env.SHIELD_PIN);
  const originalFetch = globalThis.fetch;

  // Case 1: Transient 502 on GET recovers on retry
  let transientAttempts = 0;
  globalThis.fetch = async (reqOrUrl) => {
    const u = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
    if (u.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
    }
    transientAttempts++;
    if (transientAttempts === 1) {
      return new Response('Bad Gateway', { status: 502 });
    }
    return new Response('<html><body>Recovered</body></html>', { status: 200 });
  };

  try {
    const recoveredRes = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/folders/5/creators', {
        headers: { Cookie: `pae_shield_auth=${validCookie}`, Accept: 'text/html' }
      }),
      env,
      {}
    );
    assert.equal(recoveredRes.status, 200);
    assert.equal(transientAttempts, 2);

    // Case 2: Both initial GET and retry time out while /api/health is healthy -> 504 with Reload button
    let doubleTimeoutAttempts = 0;
    globalThis.fetch = async (reqOrUrl) => {
      const u = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      if (u.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
      }
      doubleTimeoutAttempts++;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };

    const html504Res = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/folders/5/creators', {
        headers: { Cookie: `pae_shield_auth=${validCookie}`, Accept: 'text/html' }
      }),
      env,
      {}
    );
    assert.equal(html504Res.status, 504);
    assert.equal(doubleTimeoutAttempts, 2);
    const html504 = await html504Res.text();
    assert.ok(html504.includes('15000ms'));
    assert.ok(html504.includes('Reload Page'));
    assert.equal(html504.includes(env.INSTABOX_MACHINE_ID), false);

    // Case 3: Non-idempotent POST timeout must NOT retry
    let postAttempts = 0;
    globalThis.fetch = async (reqOrUrl) => {
      const u = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      if (u.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
      }
      postAttempts++;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };

    const post504Res = await wakeShieldWorker.fetch(
      new Request('https://app.hymum.com/api/keywords', {
        method: 'POST',
        headers: {
          Cookie: `pae_shield_auth=${validCookie}`,
          Origin: 'https://app.hymum.com',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ keyword: 'soup' })
      }),
      env,
      {}
    );
    assert.equal(post504Res.status, 504);
    assert.equal(postAttempts, 1, 'Mutating POST requests must never be retried automatically');
    const post504Json = await post504Res.json();
    assert.equal(post504Json.error, 'GATEWAY_TIMEOUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

