import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';

import {
  SsrfBlockedError,
  isBlockedIp,
  isBlockedHostname,
  validateSafeExternalUrl,
  resolveAndValidateHost,
  createPinnedSafeFetch,
  connectSafeTcpSocket
} from '../src/lib/net-guard.mjs';
import { TtlSingleflightCache } from '../src/lib/ttl-cache.mjs';
import {
  getGlobal24hPulseService,
  pulseMemoryCache,
  invalidateGlobalPulseCache
} from '../src/modules/pulse/service.mjs';
import { AsyncTaskQueue, createFastifyApp } from '../src/server.mjs';
import { listArchivedPins } from '../src/modules/creators/creator-analytics.mjs';
import { normalizeCleanDomain } from '../src/domain/pin-intelligence.mjs';
import { normalizeCleanDomain as normalizeDomainConstant } from '../src/modules/domains/domain-constants.mjs';
import { cleanExternalDomain } from '../src/modules/keywords/folders-crossover.mjs';
import { normalizeDomain } from '../src/core/pinterest/pins.mjs';

function buildTaggedSqlText(strings, values) {
  let text = '';
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}

test('net-guard blocks IPv4/IPv6 private/loopback/CGNAT/NAT64/6to4/mapped ranges and prevents DNS rebinding', async (t) => {
  // 1. IPv4 private, loopback, link-local, CGNAT, benchmark, broadcast
  for (const blockedV4 of [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.254',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255'
  ]) {
    assert.equal(isBlockedIp(blockedV4), true, `Expected IPv4 ${blockedV4} to be blocked`);
  }

  // 2. IPv6 loopback, ULA, link-local, IPv4-mapped IPv6, NAT64, 6to4, Teredo
  for (const blockedV6 of [
    '::',
    '::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.8',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1',
    '64:ff9b:1::1',
    '2002:7f00:0001::1',
    '2001::1'
  ]) {
    assert.equal(isBlockedIp(blockedV6), true, `Expected IPv6 ${blockedV6} to be blocked`);
  }

  // 3. Public IPv4 & IPv6 addresses remain permitted
  assert.equal(isBlockedIp('93.184.216.34'), false);
  assert.equal(isBlockedIp('1.1.1.1'), false);
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);

  // 4. Hostname & URL validation
  assert.equal(isBlockedHostname('localhost'), true);
  assert.equal(isBlockedHostname('metadata.google.internal'), true);
  assert.equal(isBlockedHostname('redis.local'), true);
  assert.equal(isBlockedHostname('example.com'), false);
  assert.equal(validateSafeExternalUrl('http://[::ffff:127.0.0.1]/ads.txt').safe, false);
  assert.equal(validateSafeExternalUrl('ftp://example.com/ads.txt').safe, false);
  assert.equal(validateSafeExternalUrl('https://user:pass@example.com/ads.txt').safe, false);
  assert.equal(validateSafeExternalUrl('https://example.com/ads.txt').safe, true);

  // 5. Mixed DNS answers (one public + one private) must fail closed
  await assert.rejects(
    () => resolveAndValidateHost('mixed.attacker-dns.net', {
      lookupFn: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 }
      ]
    }),
    (err) => err instanceof SsrfBlockedError && err.code === 'SSRF_BLOCKED'
  );

  // 6. Real socket-level DNS Rebinding defense:
  // Spin up a local loopback HTTP target; lookup #1 returns public IP 93.184.216.34, lookup #2 flips to 127.0.0.1.
  let loopbackHits = 0;
  const localServer = http.createServer((_req, res) => {
    loopbackHits += 1;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('INTERNAL_SECRET');
  });
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
  const { port } = localServer.address();

  let lookupCalls = 0;
  const rebindingLookup = async (_hostname, _opts) => {
    lookupCalls += 1;
    if (lookupCalls === 1) {
      return [{ address: '93.184.216.34', family: 4 }];
    }
    return [{ address: '127.0.0.1', family: 4 }];
  };

  const pinnedFetch = createPinnedSafeFetch({
    lookupFn: rebindingLookup,
    connectTimeoutMs: 60,
    keepAliveTimeoutMs: 100
  });

  t.after(async () => {
    await pinnedFetch.close();
    await new Promise((resolve) => localServer.close(resolve));
  });

  // Request #1: resolves once (lookupCalls === 1 -> 93.184.216.34) and pins socket to 93.184.216.34.
  // An unpinned fetch would perform a second lookup, get 127.0.0.1, and hit localServer!
  await assert.rejects(
    () => pinnedFetch(`http://rebind.attacker-dns.net:${port}/ads.txt`, { timeoutMs: 80 })
  );
  assert.equal(lookupCalls, 1, 'Pinned fetch must not perform an unpinned second DNS lookup per hop');
  assert.equal(loopbackHits, 0, 'Loopback server must NEVER be reached via DNS rebinding');

  // Request #2: DNS now returns 127.0.0.1 (lookupCalls === 2) -> blocked pre-connect with SSRF_BLOCKED
  await assert.rejects(
    () => pinnedFetch(`http://rebind.attacker-dns.net:${port}/ads.txt`, { timeoutMs: 80 }),
    (err) => err instanceof SsrfBlockedError && err.code === 'SSRF_BLOCKED'
  );
  assert.equal(lookupCalls, 2);
  assert.equal(loopbackHits, 0);

  // 7. connectSafeTcpSocket pins verified IP literal into net.createConnection and blocks rebinding
  let dialedOptions = null;
  let tcpLookupCalls = 0;
  const tcpRebindLookup = async () => {
    tcpLookupCalls += 1;
    return tcpLookupCalls === 1
      ? [{ address: '199.7.55.72', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  };

  const mockSocket = await connectSafeTcpSocket({
    host: 'whois.example.org',
    port: 43,
    timeoutMs: 500,
    lookupFn: tcpRebindLookup,
    createConnectionFn: (opts) => {
      dialedOptions = opts;
      const sock = new EventEmitter();
      sock.destroy = () => {};
      queueMicrotask(() => sock.emit('connect'));
      return sock;
    }
  });
  assert.ok(mockSocket);
  assert.deepEqual(dialedOptions, { host: '199.7.55.72', port: 43, family: 4 });

  await assert.rejects(
    () => connectSafeTcpSocket({
      host: 'whois.example.org',
      port: 43,
      lookupFn: tcpRebindLookup
    }),
    (err) => err instanceof SsrfBlockedError && err.code === 'SSRF_BLOCKED'
  );
});

test('TtlSingleflightCache enforces maxEntries LRU, epoch invalidation, and SWR error isolation', async () => {
  // 1. maxEntries LRU eviction
  const lruCache = new TtlSingleflightCache({ maxEntries: 3, defaultTtlMs: 60_000 });
  lruCache.set('k1', 'v1');
  lruCache.set('k2', 'v2');
  lruCache.set('k3', 'v3');
  // Touch k1 so k2 becomes least-recently-used
  assert.equal(lruCache.get('k1'), 'v1');
  lruCache.set('k4', 'v4');
  assert.equal(lruCache.size, 3);
  assert.equal(lruCache.get('k2'), undefined, 'LRU entry k2 should be evicted');
  assert.equal(lruCache.get('k1'), 'v1');
  assert.equal(lruCache.get('k3'), 'v3');
  assert.equal(lruCache.get('k4'), 'v4');

  // 2. Epoch invalidation prevents in-flight stale queries from overwriting cleared cache
  const epochCache = new TtlSingleflightCache({ maxEntries: 10, defaultTtlMs: 60_000 });
  let resolveSlowStale;
  const staleBarrier = new Promise((r) => { resolveSlowStale = r; });

  const staleFlight = epochCache.getOrFetch('pulse:24h', async () => {
    await staleBarrier;
    return { version: 'STALE_BEFORE_INVALIDATE' };
  });

  // Invalidate while staleFlight is still running
  epochCache.invalidate();
  resolveSlowStale();
  const staleCallerResult = await staleFlight;
  assert.deepEqual(staleCallerResult, { version: 'STALE_BEFORE_INVALIDATE' });
  assert.equal(epochCache.get('pulse:24h'), undefined, 'In-flight pre-invalidation query must NOT write back to cache');

  const freshResult = await epochCache.getOrFetch('pulse:24h', async () => ({ version: 'FRESH_POST_INVALIDATE' }));
  assert.deepEqual(freshResult, { version: 'FRESH_POST_INVALIDATE' });

  // Also verify pulseMemoryCache epoch invalidation end-to-end via invalidateGlobalPulseCache
  await invalidateGlobalPulseCache();
  let releasePulseQuery;
  const pulseGate = new Promise((r) => { releasePulseQuery = r; });
  let pulseBatch = 0;
  let gatedFirstQuery = false;
  const slowPulseSql = async () => {
    if (!gatedFirstQuery) {
      gatedFirstQuery = true;
      pulseBatch = 1;
      await pulseGate;
      return [];
    }
    return [];
  };

  const inFlightPulse = getGlobal24hPulseService(slowPulseSql, {}, { forceRefresh: false });
  await new Promise((r) => setTimeout(r, 10));
  await invalidateGlobalPulseCache();
  releasePulseQuery();
  await inFlightPulse;
  assert.equal(pulseBatch, 1);
  assert.equal(pulseMemoryCache.size, 0, 'Pre-invalidation in-flight pulse computation must NOT repopulate pulseMemoryCache');

  await getGlobal24hPulseService(slowPulseSql, {}, { forceRefresh: false });
  assert.equal(pulseMemoryCache.size, 1, 'Subsequent post-invalidation pulse read caches fresh result cleanly');

  // 3. SWR background error isolation from concurrent foreground forceRefresh
  let clock = 1_000_000;
  const swrCache = new TtlSingleflightCache({
    maxEntries: 10,
    defaultTtlMs: 1_000,
    nowFn: () => clock
  });

  await swrCache.getOrFetch('domains:top', async () => ({ ok: true, rev: 1 }), { ttlMs: 1_000, swrMs: 5_000 });
  // Advance into stale-while-revalidate window
  clock += 1_500;

  let rejectSwr;
  const swrGate = new Promise((_, rej) => { rejectSwr = rej; });
  const staleServed = await swrCache.getOrFetch(
    'domains:top',
    () => swrGate,
    { ttlMs: 1_000, swrMs: 5_000 }
  );
  assert.deepEqual(staleServed, { ok: true, rev: 1 });

  // Concurrent foreground forceRefresh must NOT attach to the failing SWR promise or receive undefined
  const fgPromise = swrCache.getOrFetch(
    'domains:top',
    async () => ({ ok: true, rev: 2 }),
    { ttlMs: 1_000, swrMs: 5_000, forceRefresh: true }
  );
  rejectSwr(new Error('transient background SWR failure'));

  const fgResult = await fgPromise;
  assert.deepEqual(fgResult, { ok: true, rev: 2 });
  assert.deepEqual(swrCache.get('domains:top'), { ok: true, rev: 2 });
});

test('AsyncTaskQueue enforces maxPending cap and POST /api/internal/ingest returns 503 on saturation', async (t) => {
  // 1. Direct AsyncTaskQueue unit verification
  const queue = new AsyncTaskQueue(1, 2);
  const blockers = [];
  const makeBlocker = () => new Promise((resolve) => { blockers.push(resolve); });

  const t1 = queue.add(() => makeBlocker()); // active (1/1)
  const t2 = queue.add(() => makeBlocker()); // pending (1/2)
  const t3 = queue.add(() => makeBlocker()); // pending (2/2 -> saturated)
  assert.equal(queue.active, 1);
  assert.equal(queue.pending, 2);
  assert.equal(queue.isSaturated, true);

  await assert.rejects(
    () => queue.add(async () => 'overflow'),
    (err) => err.code === 'QUEUE_SATURATED' && err.statusCode === 503
  );

  while (blockers.length > 0) {
    blockers.shift()();
    await new Promise((r) => setTimeout(r, 5));
  }
  await Promise.all([t1, t2, t3]);

  // 2. HTTP 503 backpressure on POST /api/internal/ingest when taskQueue is saturated
  let releaseGate;
  const holdGate = new Promise((resolve) => { releaseGate = resolve; });
  const fastNoopSql = async () => [];
  fastNoopSql.begin = async (cb) => cb(fastNoopSql);
  fastNoopSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'wave3-secret-token',
    QUEUE_CONCURRENCY: 1,
    QUEUE_MAX_PENDING: 2,
    DATABASE_URL: '',
    SQL_CLIENT: fastNoopSql
  });

  t.after(async () => {
    releaseGate();
    await app.close();
  });

  // Saturate the server's internal taskQueue (1 active + 2 pending)
  const holdPromises = [
    app.taskQueue.add(() => holdGate),
    app.taskQueue.add(() => holdGate),
    app.taskQueue.add(() => holdGate)
  ];
  assert.equal(app.taskQueue.isSaturated, true);

  const res503 = await app.inject({
    method: 'POST',
    url: '/api/internal/ingest',
    headers: { 'x-api-key': 'wave3-secret-token' },
    payload: { pins: [{ pin_id: '123456789012345' }] }
  });
  assert.equal(res503.statusCode, 503);
  assert.equal(res503.headers['retry-after'], '5');
  const body503 = res503.json();
  assert.equal(body503.error, 'QUEUE_SATURATED');
  assert.equal(body503.queued, false);

  releaseGate();
  await Promise.allSettled(holdPromises);

  // Once drained, ingest succeeds with 202 Accepted
  const res202 = await app.inject({
    method: 'POST',
    url: '/api/internal/ingest',
    headers: { 'x-api-key': 'wave3-secret-token' },
    payload: { pins: [] }
  });
  assert.equal(res202.statusCode, 202);
  assert.equal(res202.json().queued, true);
});

test('Fastify /api/competitors/* rewrite, side-effecting GET auth, pure-read domains, domain normalizers & real creator deltas', async (t) => {
  // 1. Canonical domain normalizer parity across all preset aliases
  assert.equal(normalizeCleanDomain('https://WWW.ModernFarmhouse.com/recipes/pie?utm=1'), 'modernfarmhouse.com');
  assert.equal(normalizeDomainConstant('https://sub.blog.co.uk/post'), 'sub.blog.co.uk');
  assert.equal(normalizeDomainConstant('not_a_domain'), '');
  assert.equal(cleanExternalDomain('https://www.pinterest.com/pin/123/'), '');
  assert.equal(cleanExternalDomain('https://www.seriouseats.com/pasta'), 'seriouseats.com');
  assert.equal(normalizeDomain('https://www.RecipesByJane.com/soup'), 'recipesbyjane.com');

  // 2. Creator analytics returns real non-zero delta_saves_24h & gains_7d (dead empty metricsMap removed)
  const mockCreatorSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    if (q.includes('SELECT COUNT(*)::int as total FROM universal_master_pins')) {
      return [{ total: 1 }];
    }
    if (q.includes('FROM universal_master_pins')) {
      return [{
        pin_id: '987654321098765432',
        account_username: 'chef_amelia',
        title: 'Crispy Garlic Parmesan Potatoes',
        description: 'Oven roasted potatoes',
        board_name: 'Dinner Recipes',
        domain: 'chefamelia.com',
        link: 'https://chefamelia.com/garlic-potatoes',
        image_url: 'https://i.pinimg.com/736x/aa/bb/cc.jpg',
        dominant_color: '#aa6633',
        saves: 840,
        repins: 215,
        comments: 12,
        share_count: 9,
        velocity: 18.4,
        delta_saves_24h: 24,
        delta_repins_24h: 7,
        daily_repin_velocity: 6.5,
        gains_5d: 95,
        gains_7d: 142,
        gains_10d: 180,
        gains_15d: 240,
        annotations: ['garlic potatoes', 'dinner'],
        is_video: false,
        is_product: false,
        created_at_pinterest: new Date(Date.now() - 30 * 86400_000).toISOString(),
        first_seen_at: new Date(Date.now() - 20 * 86400_000).toISOString(),
        last_updated_at: new Date().toISOString()
      }];
    }
    return [];
  };

  const archived = await listArchivedPins(mockCreatorSql, { limit: 10 });
  assert.equal(archived.length, 1);
  assert.equal(archived.total, 1);
  assert.equal(archived[0].delta_saves_24h, 24);
  assert.equal(archived[0].delta_saves, 24);
  assert.equal(archived[0].delta_repins_24h, 7);
  assert.equal(archived[0].delta_repins, 7);
  assert.equal(archived[0].gains_5d, 95);
  assert.equal(archived[0].gains_7d, 142);
  assert.equal(archived[0].delta_saves_7d, 142);

  // 3. Fastify /api/competitors/* -> /api/creators/* rewrite & side-effecting GET authentication
  let sqlQueries = [];
  const routeMockSql = async (strings, ...values) => {
    if (Array.isArray(strings)) {
      const q = buildTaggedSqlText(strings, values);
      sqlQueries.push(q);
      if (q.includes('FROM competitor_profiles')) {
        return [{
          id: 7,
          username: 'chef_amelia',
          display_name: 'Chef Amelia',
          follower_count: 15200,
          monthly_reach: 1200000,
          total_pins: 450,
          total_boards: 14,
          is_active: true
        }];
      }
      if (q.includes('FROM domain_intelligence_rollup')) {
        return [];
      }
    }
    return [];
  };
  routeMockSql.unsafe = async () => [];
  routeMockSql.end = async () => {};

  const prevNodeEnv = process.env.NODE_ENV;
  const prevEnvironment = process.env.ENVIRONMENT;
  process.env.NODE_ENV = 'production';
  process.env.ENVIRONMENT = 'production';

  const app = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'wave3-route-secret',
    DATABASE_URL: '',
    SQL_CLIENT: routeMockSql
  });

  t.after(async () => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = prevEnvironment;
    await app.close();
  });

  // 3a. /api/competitors and /api/competitors/* seamlessly route to /api/creators/* handlers
  const resCreators = await app.inject({ method: 'GET', url: '/api/creators?limit=5' });
  const resCompetitors = await app.inject({ method: 'GET', url: '/api/competitors?limit=5' });
  assert.equal(resCreators.statusCode, 200);
  assert.equal(resCompetitors.statusCode, 200);
  assert.deepEqual(resCompetitors.json().competitors, resCreators.json().competitors);

  const resCompRules = await app.inject({ method: 'GET', url: '/api/competitors/rules' });
  assert.equal(resCompRules.statusCode, 200);
  assert.equal(resCompRules.json().success, true);

  // 3b. Side-effecting GET parameters (?auto_create=true, ?refresh=true, ?force=true) and live-scrape GETs reject unauthenticated callers with 401
  for (const protectedGetUrl of [
    '/api/competitors/detail?username=chef_amelia&auto_create=true',
    '/api/creators/board-detail?username=chef_amelia&board_slug=dinner&refresh=true',
    '/api/pins/987654321098765432?refresh=true',
    '/api/domains?limit=5&force=true',
    '/api/keywords/visual-search?q=garlic+potatoes',
    '/api/urls/global-saves?url=https%3A%2F%2Fchefamelia.com%2Fgarlic-potatoes',
    '/api/pins/resolve-shortlink?url=https%3A%2F%2Fpin.it%2Fabc123'
  ]) {
    const unauthRes = await app.inject({ method: 'GET', url: protectedGetUrl });
    assert.equal(unauthRes.statusCode, 401, `Expected 401 on unauthenticated GET ${protectedGetUrl}`);
  }

  // Authenticated caller with x-api-key passes the auth gate cleanly
  const authForceRes = await app.inject({
    method: 'GET',
    url: '/api/domains?limit=5&force=true',
    headers: { 'x-api-key': 'wave3-route-secret' }
  });
  assert.equal(authForceRes.statusCode, 200);

  // 3c. Unauthenticated GET /api/domains is pure-read and queues zero background tasks
  sqlQueries = [];
  const unauthDomainsRes = await app.inject({
    method: 'GET',
    url: '/api/domains?limit=5'
  });
  assert.equal(unauthDomainsRes.statusCode, 200);
  assert.equal(app.taskQueue.pending, 0);
  assert.equal(app.taskQueue.active, 0);
});
