import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  CANONICAL_FINGERPRINT,
  sanitizeGuestCookie,
  getStandardPinterestHeaders,
  getPinterestXhrHeaders,
  randomJitterMs,
  PinterestCircuitBreaker
} from '../src/core/pinterest/client.mjs';
import {
  formatPin,
  extractPinData,
  extractPinFromHtml,
  parseCleanMetric,
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE
} from '../src/core/pinterest/pins.mjs';
import {
  canonicalizeArticleUrlForCount,
  fetchUrlGlobalSaves
} from '../src/core/pinterest/urls.mjs';
import {
  normalizeWordLemma,
  extractCanonicalAnnotations,
  isSyntheticGarbageTitle,
  resolveCanonicalPinTitle,
  mineAnnotationNGrams,
  buildRichPinMetadataPayload,
  shouldSkipFreshPinEnrichment
} from '../src/domain/pin-intelligence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test('Pinterest client enforces strict _auth=0 guest cookies, Chrome 131 headers, jitter bounds, and circuit breaker transitions', async () => {
  assert.equal(sanitizeGuestCookie(null), '');
  assert.equal(sanitizeGuestCookie(''), '');
  assert.equal(sanitizeGuestCookie('session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('_auth=1; session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('_auth=0; session=abc'), '_auth=0; session=abc');
  assert.equal(sanitizeGuestCookie('session=abc; _auth="1"; other=1'), '_auth=0; session=abc; other=1');

  assert.equal(CANONICAL_FINGERPRINT.CHROME_MAJOR, '131');
  assert.equal(CANONICAL_FINGERPRINT.APP_VERSION, '9302641');
  assert.ok(CANONICAL_FINGERPRINT.USER_AGENT.includes('Chrome/131.0.0.0'));

  const headers = getStandardPinterestHeaders({ referer: 'https://www.pinterest.com/search/' });
  assert.equal(headers['User-Agent'], CANONICAL_FINGERPRINT.USER_AGENT);
  assert.equal(headers['X-App-Version'], '9302641');
  assert.equal(headers['Referer'], 'https://www.pinterest.com/search/');

  const xhrHeaders = getPinterestXhrHeaders('elite_creator', '_auth=1; test=1');
  assert.equal(xhrHeaders['Cookie'], '_auth=0; test=1');
  assert.equal(xhrHeaders['X-Pinterest-PWS-Handler'], 'www/elite_creator/_created.js');

  for (let i = 0; i < 15; i++) {
    const jitter = randomJitterMs(2500, 4000);
    assert.ok(jitter >= 2500 && jitter <= 4000);
  }

  const breaker = new PinterestCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 40 });
  assert.equal(breaker.canExecute(), true);
  breaker.recordFailure(429);
  breaker.recordFailure(429);
  breaker.recordFailure(429);
  assert.equal(breaker.getState().state, 'OPEN');
  assert.equal(breaker.canExecute(), false);

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.getState().state, 'HALF_OPEN');
  breaker.recordSuccess();
  assert.equal(breaker.getState().state, 'CLOSED');
});

test('formatPin preserves save_count = null on unhydrated pins, never copies repin_count, and guards 10M+ ceiling', () => {
  const unhydrated = formatPin({
    id: '998877665544',
    title: 'Unhydrated Stage-0 Pin',
    repin_count: 14,
    domain: 'example.com'
  });
  assert.ok(unhydrated);
  assert.equal(unhydrated.pin_id, '998877665544');
  assert.equal(unhydrated.save_count, null);
  assert.equal(unhydrated.saves, null);
  assert.equal(unhydrated.has_explicit_saves, false);
  assert.equal(unhydrated.repin_count, 14);
  assert.equal(unhydrated.velocity, null);

  const explicitZero = formatPin({
    id: '112233445566',
    title: 'Explicit Zero Saves Pin',
    aggregated_pin_data: {
      aggregated_stats: { saves: 0 }
    },
    repin_count: 3
  });
  assert.equal(explicitZero.save_count, 0);
  assert.equal(explicitZero.has_explicit_saves, true);
  assert.equal(explicitZero.repin_count, 3);

  assert.equal(parseCleanMetric('10m+'), MAX_METRIC_CAP);
  assert.equal(parseCleanMetric('10m+', 0, { preserveCeiling: true }), PINTEREST_CEILING_VALUE);
  assert.equal(parseCleanMetric(50000000), MAX_METRIC_CAP);
  assert.equal(parseCleanMetric('2.5k'), 2500);
  assert.equal(parseCleanMetric(null, 0), 0);
});

test('formatPin and extractPinData parse Relay v3 JSON and SSR HTML fixtures accurately', async () => {
  const [v3JsonText, ssrHtmlText] = await Promise.all([
    readFile(path.join(FIXTURES_DIR, 'pin-v3-relay.json'), 'utf8'),
    readFile(path.join(FIXTURES_DIR, 'pin-ssr-page.html'), 'utf8')
  ]);

  const v3Raw = JSON.parse(v3JsonText);
  const formattedV3 = formatPin({ ...v3Raw, id: v3Raw.entityId });
  assert.ok(formattedV3);
  assert.equal(formattedV3.pin_id, '70437491132581');
  assert.equal(formattedV3.save_count, 23716);
  assert.equal(formattedV3.repin_count, 15272);
  assert.equal(formattedV3.share_count, 1742);
  assert.equal(formattedV3.domain, 'nourishyourglow.com');
  assert.equal(formattedV3.image_signature, '0892528dd65edc951b271ec3b26d3993');
  assert.ok(formattedV3.utm_link.includes('utm_source=Pinterest'));
  assert.ok(formattedV3.tags.some((t) => t.toLowerCase().includes('pork')));

  assert.equal(extractPinData, extractPinFromHtml);
  const extractedHtmlPin = extractPinData(ssrHtmlText, '70437491132581');
  assert.ok(extractedHtmlPin);
  assert.equal(extractedHtmlPin.pin_id, '70437491132581');
  assert.equal(extractedHtmlPin.save_count, 23716);
  assert.equal(extractedHtmlPin.repin_count, 15272);
  assert.equal(extractedHtmlPin.is_carousel, true);
  assert.equal(extractedHtmlPin.method, 'carousel');
  assert.equal(extractedHtmlPin.creator_followers, 48200);
  assert.equal(extractedHtmlPin.domain, 'nourishyourglow.com');
  assert.ok(extractedHtmlPin.utm_link.includes('utm_source=Pinterest'));
});

test('canonicalizeArticleUrlForCount strips UTM/tracking params & fragments and fetchUrlGlobalSaves unpacks JSONP', async () => {
  assert.equal(
    canonicalizeArticleUrlForCount(
      'https://WWW.NourishYourGlow.com/01/parmesan-baked-pork-chops/?utm_source=Pinterest&amp;utm_medium=organic&fbclid=abc123&epik=ep9&recipe_step=2#jump-to-recipe'
    ),
    'https://www.nourishyourglow.com/01/parmesan-baked-pork-chops/?recipe_step=2'
  );
  assert.equal(
    canonicalizeArticleUrlForCount('https://example.com/post/?utm_campaign=spring&pin_it=1'),
    'https://example.com/post/'
  );
  assert.equal(canonicalizeArticleUrlForCount(''), '');

  const originalFetch = globalThis.fetch;
  let requestedEndpoint = '';
  globalThis.fetch = async (url) => {
    requestedEndpoint = String(url);
    return new Response('receiveCount({"url":"https://example.com/post/","count":4890})', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' }
    });
  };

  try {
    const res = await fetchUrlGlobalSaves('https://example.com/post/?utm_source=pinterest&gclid=xyz');
    assert.equal(res.ok, true);
    assert.equal(res.count, 4890);
    assert.equal(res.url, 'https://example.com/post/');
    assert.ok(requestedEndpoint.includes(encodeURIComponent('https://example.com/post/')));
    assert.equal(requestedEndpoint.includes('utm_source'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pin-intelligence normalizes lemmas, deduplicates annotations, resolves titles, mines n-grams, and gates fresh pins', () => {
  assert.equal(normalizeWordLemma('Recipes'), 'recipe');
  assert.equal(normalizeWordLemma('Strawberries'), 'strawberry');
  assert.equal(normalizeWordLemma('Potatoes'), 'potato');
  assert.equal(normalizeWordLemma('Christmas'), 'christmas');
  assert.equal(normalizeWordLemma('Hummus'), 'hummus');

  const cleanTags = extractCanonicalAnnotations(
    {
      title: 'Title Words Should Not Leak Into Annotations',
      visual_annotations: [
        'Beef Casserole Recipes',
        'beef casserole recipe',
        'Ground Beef And Potatoes',
        'https://spam.example/x',
        'not_given',
        '12345',
        'Dinner With Ground Beef'
      ]
    },
    { lemmatizeDedupe: true, titleCase: true }
  );
  assert.deepEqual(cleanTags, [
    'Beef Casserole Recipes',
    'Ground Beef And Potatoes',
    'Dinner With Ground Beef'
  ]);

  assert.equal(isSyntheticGarbageTitle('Untitled Pin', '123'), true);
  assert.equal(
    resolveCanonicalPinTitle({
      pin_id: '98765432101234',
      title: 'Untitled Pin',
      destination_url: 'https://nourishyourglow.com/recipes/cheesy-ground-beef-and-rice-casserole/'
    }),
    'Cheesy Ground Beef And Rice Casserole'
  );

  const { singleTags, tagPairs, tagTriplets } = mineAnnotationNGrams(
    [
      {
        pin_id: '1',
        daily_save_velocity: 100,
        save_count: 500,
        keywords: ['beef casserole'],
        visual_annotations: ['Beef Casserole Recipes', 'Ground Beef And Potatoes', 'Dinner With Ground Beef']
      },
      {
        pin_id: '2',
        daily_save_velocity: 50,
        save_count: 250,
        keywords: ['easy dinner'],
        visual_annotations: ['beef casserole recipe', 'Ground Beef And Potatoes', 'Dinner With Ground Beef']
      }
    ],
    { minPairPins: 2, minTripletPins: 2 }
  );
  assert.equal(singleTags.length, 3);
  assert.equal(tagPairs.length, 3);
  assert.equal(tagTriplets.length, 1);
  assert.equal(tagTriplets[0].total_velocity, 150);

  const richMeta = buildRichPinMetadataPayload({
    pin_id: '555666777',
    creation_method: 'Bookmarklet',
    is_repin: true,
    origin_pinner: { username: 'originalchef', follower_count: 54000 },
    image_signature: '0892528dd65edc951b271ec3b26d3993',
    category_breadcrumbs: ['Food and Drink', 'Main Dishes'],
    tracked_link: 'https://example.com/recipe?utm_source=pinterest'
  });
  assert.equal(richMeta.creation_method, 'Bookmarklet');
  assert.equal(richMeta.origin_pinner.username, 'originalchef');

  const now = Date.now();
  const basePin = {
    pin_id: '101',
    save_count: 350,
    created_at_pinterest: '2026-01-15T00:00:00Z',
    visual_annotations: ['dinner recipe'],
    last_scraped_at: new Date(now - 2 * 3600 * 1000).toISOString()
  };
  assert.equal(shouldSkipFreshPinEnrichment(basePin, 18, now), true);
  assert.equal(
    shouldSkipFreshPinEnrichment(
      { ...basePin, last_scraped_at: new Date(now - 24 * 3600 * 1000).toISOString() },
      18,
      now
    ),
    false
  );
});
