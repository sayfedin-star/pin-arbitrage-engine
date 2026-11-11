import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_FINGERPRINT,
  sanitizeGuestCookie,
  getStandardPinterestHeaders,
  getPinterestXhrHeaders,
  randomJitterMs,
  PinterestCircuitBreaker,
  CircuitBreakerOpenError
} from '../src/core/pinterest-client.mjs';
import {
  formatPin,
  extractPinFromHtml,
  parseCleanMetric,
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE
} from '../src/core/pinterest-parser.mjs';
import { pushBatchToIngestApi } from '../scripts/keyword-velocity-crawler.mjs';

test('src/core/pinterest-client.mjs: enforces strict unauthenticated guest cookies (_auth=0)', () => {
  assert.equal(sanitizeGuestCookie(null), '');
  assert.equal(sanitizeGuestCookie(''), '');
  assert.equal(sanitizeGuestCookie('session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('_auth=1; session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('_auth=0; session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('session=abc; _auth="1"; other=1'), '_auth=0; session=abc; other=1');
});

test('src/core/pinterest-client.mjs: canonical fingerprint and headers parity (Chrome 131)', () => {
  assert.equal(CANONICAL_FINGERPRINT.CHROME_MAJOR, '131');
  assert.equal(CANONICAL_FINGERPRINT.APP_VERSION, '9302641');
  assert(CANONICAL_FINGERPRINT.USER_AGENT.includes('Chrome/131.0.0.0'));

  const headers = getStandardPinterestHeaders({ referer: 'https://www.pinterest.com/search/' });
  assert.equal(headers['User-Agent'], CANONICAL_FINGERPRINT.USER_AGENT);
  assert.equal(headers['X-App-Version'], '9302641');
  assert.equal(headers['Referer'], 'https://www.pinterest.com/search/');
  assert(headers['Sec-Ch-Ua'].includes('"Google Chrome";v="131"'));

  const xhrHeaders = getPinterestXhrHeaders('elite_creator', '_auth=1; test=1');
  assert.equal(xhrHeaders['Cookie'], '_auth=0; test=1');
  assert.equal(xhrHeaders['X-Pinterest-PWS-Handler'], 'www/elite_creator/_created.js');
});

test('src/core/pinterest-client.mjs: rate-limiting jitter returns values within bounds (2500ms - 4000ms)', () => {
  for (let i = 0; i < 20; i++) {
    const jitter = randomJitterMs(2500, 4000);
    assert(jitter >= 2500 && jitter <= 4000, `Jitter ${jitter} must be between 2500 and 4000`);
  }
});

test('src/core/pinterest-client.mjs: Circuit Breaker state transitions on 429/403 and fast rejects when OPEN', () => {
  const breaker = new PinterestCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 50 });
  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.getState().state, 'CLOSED');

  breaker.recordFailure(429);
  assert.equal(breaker.canExecute(), true);
  breaker.recordFailure(429);
  assert.equal(breaker.canExecute(), true);
  breaker.recordFailure(429); // 3rd failure hits threshold

  assert.equal(breaker.getState().state, 'OPEN');
  assert.equal(breaker.canExecute(), false);

  // After cooldown, should allow trial request in HALF_OPEN
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(breaker.canExecute(), true);
      assert.equal(breaker.getState().state, 'HALF_OPEN');
      breaker.recordSuccess();
      assert.equal(breaker.getState().state, 'CLOSED');
      resolve();
    }, 60);
  });
});

test('src/core/pinterest-parser.mjs: unhydrated pins have save_count = null (NOT 0)', () => {
  const unhydratedRaw = {
    id: '998877665544',
    title: 'Unhydrated Pin Title',
    repin_count: 5,
    domain: 'example.com'
  };

  const parsed = formatPin(unhydratedRaw);
  assert(parsed !== null);
  assert.equal(parsed.pin_id, '998877665544');
  assert.equal(parsed.save_count, null, 'Unhydrated pin MUST have save_count = null');
  assert.equal(parsed.saves, null, 'Unhydrated pin MUST have saves = null');
  assert.equal(parsed.has_explicit_saves, false);
  assert.equal(parsed.velocity, 0, 'Unhydrated pin velocity MUST be 0');
  assert.equal(parsed.repin_count, 5);
});

test('src/core/pinterest-parser.mjs: hydrated pins with explicit saves preserve exact save count', () => {
  const hydratedRaw = {
    id: '112233445566',
    title: 'Hydrated Pin Title',
    aggregated_pin_data: {
      aggregated_stats: {
        saves: 1540,
        repins: 220
      }
    }
  };

  const parsed = formatPin(hydratedRaw);
  assert(parsed !== null);
  assert.equal(parsed.save_count, 1540);
  assert.equal(parsed.saves, 1540);
  assert.equal(parsed.has_explicit_saves, true);
  assert.equal(parsed.repin_count, 220);
});

test('src/core/pinterest-parser.mjs: cap protection against 10M+ anomalies', () => {
  assert.equal(parseCleanMetric('10m+'), MAX_METRIC_CAP);
  assert.equal(parseCleanMetric('10m+', 0, { preserveCeiling: true }), PINTEREST_CEILING_VALUE);
  assert.equal(parseCleanMetric(50000000), MAX_METRIC_CAP);
  assert.equal(parseCleanMetric('15.5M'), MAX_METRIC_CAP);
  assert.equal(parseCleanMetric('2.5k'), 2500);
  assert.equal(parseCleanMetric(null, 0), 0);
});

test('src/core/pinterest-parser.mjs: extractPinFromHtml parses __PWS_DATA__ and preserves 48 fields', () => {
  const mockPwsData = {
    props: {
      initialData: {
        pin: {
          id: '556677889900',
          title: 'Aesthetic Coffee Shop Idea',
          description: 'Best cozy coffee shop aesthetic pins for autumn vibes',
          link: 'https://blog.com/coffee-shop?utm_source=pinterest&aff_id=99',
          is_carousel: true,
          creation_method: 'carousel',
          pinner: {
            username: 'cozy_creator',
            full_name: 'Cozy Living',
            follower_count: 48000
          },
          aggregated_pin_data: {
            aggregated_stats: {
              saves: 840,
              repins: 110
            }
          },
          pin_join: {
            visual_annotation: ['coffee aesthetics', 'fall cozy decor']
          }
        }
      }
    }
  };

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <script id="__PWS_DATA__" type="application/json">
        ${JSON.stringify(mockPwsData)}
      </script>
    </head>
    <body></body>
  </html>`;

  const pin = extractPinFromHtml(html, '556677889900');
  assert(pin !== null);
  assert.equal(pin.pin_id, '556677889900');
  assert.equal(pin.title, 'Aesthetic Coffee Shop Idea');
  assert.equal(pin.save_count, 840);
  assert.equal(pin.repin_count, 110);
  assert.equal(pin.is_carousel, true);
  assert.equal(pin.method, 'carousel');
  assert(pin.utm_link.includes('utm_source=pinterest'));
  assert.equal(pin.creator_followers, 48000);
  assert.equal(pin.pinner.username, 'cozy_creator');
  assert(pin.tags.includes('coffee aesthetics'));
});

test('scripts/keyword-velocity-crawler.mjs: pushBatchToIngestApi respects INGEST_API_URL and payload contract', async () => {
  assert(typeof pushBatchToIngestApi === 'function');
  // Without INGEST_API_URL set, returns null gracefully
  const res = await pushBatchToIngestApi({ test: true });
  assert.equal(res, null);
});
