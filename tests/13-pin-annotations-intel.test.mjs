import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { createFastifyApp } from '../src/server.mjs';
import {
  extractStoredPinAnnotations,
  resolveAnnotationsIntel
} from '../src/modules/pins/annotations-intel.mjs';
import { getPinDetailPageHtml } from '../src/ui/pin-details/index.mjs';

test('Annotations Intel Service: deduplicates visual_annotations + annotations_with_links, rejects [object Object], and caps at 15', () => {
  const tags = [
    'Italian Pasta Soup',
    '[object Object]',
    'italian pasta soup',
    'Easy Noodle Soup',
    ...Array.from({ length: 18 }, (_, idx) => `Extra Tag ${idx + 1}`)
  ];

  const extracted = extractStoredPinAnnotations({
    visual_annotations: tags,
    metadata: {
      annotations_with_links: [
        {
          name: 'Italian Pasta Soup',
          idea_id: '912345601',
          url: '/ideas/italian-pasta-soup/912345601/'
        },
        {
          name: 'Hidden Linked Tag',
          url: '/ideas/hidden-linked-tag/988776655/'
        }
      ]
    }
  });

  assert.equal(extracted.items.length, 15);
  assert.equal(extracted.capped, true);
  assert.equal(extracted.totalStoredCount, 21);
  assert.equal(extracted.items[0].name, 'Italian Pasta Soup');
  assert.equal(extracted.items[0].idea_id, '912345601');
  assert.ok(extracted.items.every((item) => item.name !== '[object Object]'));
});

test('Annotations Intel Service: enforces concurrency=4, sorts descending by search_volume, and extracts taxonomy + fallback annotation_id', async () => {
  const annotations = Array.from({ length: 10 }, (_, idx) => ({
    name: `Recipe Tag ${idx + 1}`,
    idea_id: idx === 9 ? '999000111' : null,
    url: idx === 9 ? '/ideas/recipe-tag-10/999000111/' : null
  }));

  let active = 0;
  let maxActive = 0;

  const mockFetchInterest = async (term) => {
    active++;
    if (active > maxActive) maxActive = active;
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;

    if (term === 'Recipe Tag 10') {
      // Simulate unindexed term falling back to stored annotations_with_links ID & URL
      return null;
    }

    const num = Number(term.replace(/\D+/g, ''));
    return {
      success: true,
      id: String(900000000 + num),
      key: term.toLowerCase(),
      url_name: term.toLowerCase().replace(/\s+/g, '-'),
      internal_search_count: num * 12500,
      feed_update_time: '2026-11-18T10:30:00Z',
      seo_breadcrumbs: ['Food and Drink', 'Recipes', `${term} Ideas`]
    };
  };

  const resolved = await resolveAnnotationsIntel({
    annotations,
    fetchInterestFn: mockFetchInterest,
    concurrency: 4
  });

  assert.ok(maxActive <= 4, `Expected concurrency <= 4, observed ${maxActive}`);
  assert.equal(resolved.checked_count, 10);
  assert.equal(resolved.resolved_count, 9);
  assert.equal(resolved.annotations[0].annotation, 'Recipe Tag 9');
  assert.equal(resolved.annotations[0].search_volume, 112500);
  assert.deepEqual(resolved.annotations[0].category_tree, ['Food and Drink', 'Recipes', 'Recipe Tag 9 Ideas']);
  assert.equal(resolved.annotations[0].category_tree_text, 'Food and Drink > Recipes > Recipe Tag 9 Ideas');
  assert.equal(resolved.annotations[0].last_updated, '2026-11-18T10:30:00Z');
  assert.equal(resolved.annotations[0].last_updated_display, 'Nov 18, 2026');
  assert.equal(resolved.annotations[0].annotation_id, '900000009');
  assert.equal(resolved.annotations[0].link, 'https://www.pinterest.com/ideas/recipe-tag-9/900000009/');

  // Descending order verified across all items
  for (let i = 1; i < resolved.annotations.length; i++) {
    assert.ok(resolved.annotations[i - 1].search_volume >= resolved.annotations[i].search_volume);
  }

  // Fallback to annotations_with_links when InterestResource returns null
  const lastRow = resolved.annotations[resolved.annotations.length - 1];
  assert.equal(lastRow.annotation, 'Recipe Tag 10');
  assert.equal(lastRow.search_volume, 0);
  assert.equal(lastRow.annotation_id, '999000111');
  assert.equal(lastRow.link, 'https://www.pinterest.com/ideas/recipe-tag-10/999000111/');

  // Total search volume = sum(1..9) * 12500 = 45 * 12500 = 562500
  assert.equal(resolved.total_search_volume, 562500);
});

test('GET /api/pins/:pin_id/annotations-intel enforces auth, private no-store cache, validation, 404, and sorted response', async (t) => {
  const PIN_ID = '574771971217813409';
  const MISSING_PIN_ID = '574771971217813499';
  const forceCalls = [];

  const mockSql = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join(' ') : String(strings);
    if (query.includes('FROM universal_master_pins')) {
      const requestedPinId = String(values[0] || '');
      if (requestedPinId === PIN_ID) {
        return [{
          pin_id: PIN_ID,
          visual_annotations: [
            'Italian Ditalini Soup',
            'Easy Noodle Soup',
            'Italian Pasta Soup'
          ],
          metadata: {
            annotations_with_links: [
              { name: 'Italian Ditalini Soup', idea_id: '904440001', url: '/ideas/italian-ditalini-soup/904440001/' },
              { name: 'Easy Noodle Soup', idea_id: '904440002', url: '/ideas/easy-noodle-soup/904440002/' },
              { name: 'Italian Pasta Soup', idea_id: '904440003', url: '/ideas/italian-pasta-soup/904440003/' }
            ]
          }
        }];
      }
      return [];
    }
    return [];
  };
  mockSql.end = async () => {};

  const mockInterestMap = {
    'italian ditalini soup': {
      success: true,
      id: '904440001',
      key: 'italian ditalini soup',
      url_name: 'italian-ditalini-soup',
      internal_search_count: 14200,
      feed_update_time: '2026-11-17T08:00:00Z',
      seo_breadcrumbs: ['Food and Drink', 'Soups', 'Italian Ditalini Soup']
    },
    'easy noodle soup': {
      success: true,
      id: '904440002',
      key: 'easy noodle soup',
      url_name: 'easy-noodle-soup',
      internal_search_count: 185000,
      feed_update_time: '2026-11-19T06:00:00Z',
      seo_breadcrumbs: ['Food and Drink', 'Soup Recipes', 'Easy Noodle Soup']
    },
    'italian pasta soup': {
      success: true,
      id: '904440003',
      key: 'italian pasta soup',
      url_name: 'italian-pasta-soup',
      internal_search_count: 64300,
      feed_update_time: '2026-11-18T12:00:00Z',
      seo_breadcrumbs: ['Food and Drink', 'Pasta', 'Italian Pasta Soup']
    }
  };

  const app = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'test-annotations-intel-secret',
    DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/mock',
    SQL_CLIENT: mockSql,
    FETCH_INTEREST_VOLUME: async (term, opts = {}) => {
      forceCalls.push({ term, force: Boolean(opts?.force) });
      return mockInterestMap[String(term || '').toLowerCase()] || null;
    }
  });

  t.after(async () => {
    await app.close();
  });

  // 1. Unauthenticated request in production -> 401
  const resUnauth = await app.inject({
    method: 'GET',
    url: `/api/pins/${PIN_ID}/annotations-intel`
  });
  assert.equal(resUnauth.statusCode, 401);

  // 2. Method not allowed on POST -> 405
  const resMethod = await app.inject({
    method: 'POST',
    url: `/api/pins/${PIN_ID}/annotations-intel`,
    headers: { 'x-api-key': 'test-annotations-intel-secret' }
  });
  assert.equal(resMethod.statusCode, 405);

  // 3. Invalid pin ID -> 400
  const resBadId = await app.inject({
    method: 'GET',
    url: '/api/pins/not-a-pin/annotations-intel',
    headers: { 'x-api-key': 'test-annotations-intel-secret' }
  });
  assert.equal(resBadId.statusCode, 400);

  // 4. Unknown pin -> 404 with no-store
  const resMissing = await app.inject({
    method: 'GET',
    url: `/api/pins/${MISSING_PIN_ID}/annotations-intel`,
    headers: { 'x-api-key': 'test-annotations-intel-secret' }
  });
  assert.equal(resMissing.statusCode, 404);
  assert.ok(String(resMissing.headers['cache-control'] || '').includes('no-store'));

  // 5. Authenticated GET -> 200, private + no-store, sorted descending by search_volume
  const resOk = await app.inject({
    method: 'GET',
    url: `/api/pins/${PIN_ID}/annotations-intel`,
    headers: { 'x-api-key': 'test-annotations-intel-secret' }
  });
  assert.equal(resOk.statusCode, 200);
  const cc = String(resOk.headers['cache-control'] || '');
  assert.ok(cc.includes('no-store') && cc.includes('private'), `Expected private + no-store Cache-Control, got "${cc}"`);

  const body = resOk.json();
  assert.equal(body.success, true);
  assert.equal(body.pin_id, PIN_ID);
  assert.equal(body.checked_count, 3);
  assert.equal(body.total_search_volume, 185000 + 64300 + 14200);
  assert.deepEqual(
    body.annotations.map((a) => a.annotation),
    ['Easy Noodle Soup', 'Italian Pasta Soup', 'Italian Ditalini Soup']
  );
  assert.equal(body.annotations[0].annotation_id, '904440002');
  assert.equal(body.annotations[0].last_updated, '2026-11-19T06:00:00Z');
  assert.deepEqual(body.annotations[0].category_tree, ['Food and Drink', 'Soup Recipes', 'Easy Noodle Soup']);
  assert.equal(body.annotations[0].category_tree_text, 'Food and Drink > Soup Recipes > Easy Noodle Soup');
  assert.equal(body.annotations[0].link, 'https://www.pinterest.com/ideas/easy-noodle-soup/904440002/');

  // 6. ?refresh=true propagates force=true to interest lookup
  forceCalls.length = 0;
  const resRefresh = await app.inject({
    method: 'GET',
    url: `/api/pins/${PIN_ID}/annotations-intel?refresh=true`,
    headers: { 'x-api-key': 'test-annotations-intel-secret' }
  });
  assert.equal(resRefresh.statusCode, 200);
  assert.equal(forceCalls.length, 3);
  assert.ok(forceCalls.every((c) => c.force === true));
});

test('Pin Details SSR HTML & Alpine controller render collapsible Annotations Inspector and lazy-fetch once on expand', async () => {
  const html = getPinDetailPageHtml('574771971217813409');

  // Verify SSR collapse toggle & 4-column table markup
  assert.ok(html.includes('Inspect Volume & Taxonomy ('), 'Missing toggle button label');
  assert.ok(html.includes('aria-controls="annotations-intel-panel"'), 'Missing aria-controls binding');
  assert.ok(html.includes('id="annotations-intel-panel"'), 'Missing collapsible panel container');
  assert.ok(html.includes('x-show="annotationsIntelOpen"'), 'Missing x-show collapse directive');
  assert.ok(html.includes('Total Search Volume'), 'Missing Total Search Volume summary metric');
  assert.ok(html.includes('Copy All Annotations'), 'Missing Copy All Annotations button');
  assert.ok(html.includes('>Annotation<'), 'Missing Annotation column header');
  assert.ok(html.includes('>Search Volume<'), 'Missing Search Volume column header');
  assert.ok(html.includes('>Category Tree<'), 'Missing Category Tree column header');
  assert.ok(html.includes('>Link<'), 'Missing Link column header');
  assert.ok(!html.includes('>Last Updated<'), 'Last Updated column should be hidden from the table');
  assert.ok(!html.includes('>Annotation ID<'), 'Annotation ID column should be hidden from the table');
  assert.ok(html.includes('colspan="4"'), 'Empty-state row should span 4 columns');
  assert.ok(html.includes("ID: ' + row.annotation_id") && html.includes("Updated: ' + formatAnnotationDate("), 'Tooltip should surface annotation_id and last_updated metadata');

  // Execute inline script in VM to verify lazy-fetch & caching behavior
  const scriptMatches = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const appScriptTag = scriptMatches.find((s) => s.includes('function pinDetailApp('));
  assert.ok(appScriptTag, 'Expected pinDetailApp script tag in SSR HTML');
  const scriptCode = appScriptTag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');

  const fetchCalls = [];
  const sandbox = {
    console,
    Date,
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          pin_id: '574771971217813409',
          total_search_volume: 249300,
          checked_count: 2,
          annotations: [
            {
              annotation: 'Easy Noodle Soup',
              search_volume: 185000,
              last_updated: '2026-11-19T06:00:00Z',
              last_updated_display: 'Nov 19, 2026',
              annotation_id: '904440002',
              category_tree: ['Food and Drink', 'Soup Recipes'],
              category_tree_text: 'Food and Drink > Soup Recipes',
              link: 'https://www.pinterest.com/ideas/easy-noodle-soup/904440002/',
              resolved: true
            },
            {
              annotation: 'Italian Pasta Soup',
              search_volume: 64300,
              last_updated: '2026-11-18T12:00:00Z',
              last_updated_display: 'Nov 18, 2026',
              annotation_id: '904440003',
              category_tree: ['Food and Drink', 'Pasta'],
              category_tree_text: 'Food and Drink > Pasta',
              link: 'https://www.pinterest.com/ideas/italian-pasta-soup/904440003/',
              resolved: true
            }
          ]
        })
      };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  const controller = sandbox.pinDetailApp('574771971217813409');
  assert.equal(controller.annotationsIntelOpen, false);
  assert.equal(fetchCalls.length, 0);

  // First expand -> triggers 1 lazy fetch
  await controller.toggleAnnotationsIntel();
  assert.equal(controller.annotationsIntelOpen, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], '/api/pins/574771971217813409/annotations-intel');
  assert.equal(controller.annotationsIntelRows().length, 2);
  assert.equal(controller.annotationsIntelData.total_search_volume, 249300);

  // Collapse and re-expand -> uses Alpine cache, 0 extra requests
  await controller.toggleAnnotationsIntel();
  assert.equal(controller.annotationsIntelOpen, false);
  await controller.toggleAnnotationsIntel();
  assert.equal(controller.annotationsIntelOpen, true);
  assert.equal(fetchCalls.length, 1);

  // Explicit Refresh -> triggers forced fetch with ?refresh=true
  await controller.loadAnnotationsIntel(true);
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls[1].startsWith('/api/pins/574771971217813409/annotations-intel?refresh=true'));
});
