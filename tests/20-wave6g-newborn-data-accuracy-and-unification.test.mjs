/**
 * tests/20-wave6g-newborn-data-accuracy-and-unification.test.mjs
 *
 * Wave 6G — Phase 1 Offline Unit & Integration Test Suite:
 * 1. `extractPinAnnotationsDetailed` map & array parity + HTML entity decoding
 * 2. `decodeHtmlEntities` safety (numeric, hex, named, invalid code points, no double-decoding)
 * 3. `normalizeSurfaceCandidatePin` & `mergeCandidatePinRecords` (`is_repin` fix, canonical_pin isolation, Pidgets overwrite guard)
 * 4. `hydratePinZeroCookie` request shape (omits `fetch_visual_search_objects`, preserves `pin_join`)
 * 5. `classifyPinProvenance` (`photos` & `pin_scheduling` -> `UPLOADED` even with `is_idea_pin: true`)
 * 6. Pre-Age Gate + Pass 2 Winner Hydration Pass (including 429 halt & winner preservation)
 * 7. Silent 2-hop snowball fix (`buildHuntOverridesFromBody` for discover/cluster vs `isSnowball: true`)
 * 8. Upsert & telemetry integrity (`root_age_verified`, `pages_scrolled`, `matched_repins`, SQL ON CONFLICT clauses, fleet consolidate `surfaces_used` with `status` as `values[0]`)
 * 9. Queries, routes & `Pull Account` (`run_surface`, `creation_method`, `repin_filter`, `shares` sort, defensive entity decode, `run_id` cache bypass, `fetchNewbornCandidateAccounts` persistence)
 * 10. UI, sync `exportCsv`, paginated `exportAllCsv`, pagination, HTML/inline-JS size budgets, zero emojis, zero bare `>Shares<`/`>Comments<`/`>Reactions<`, `formatSurfaceLabel` fallback
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  decodeHtmlEntities,
  extractPinAnnotationsDetailed,
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from '../src/modules/newborn/surface-normalizers.mjs';
import {
  decodeHtmlEntities as decodeFromSurfaces,
  extractPinAnnotationsDetailed as extractFromSurfaces
} from '../src/modules/newborn/surfaces.mjs';
import {
  decodeHtmlEntities as decodeFromService,
  extractPinAnnotationsDetailed as extractFromService
} from '../src/modules/newborn/service.mjs';
import { hydratePinZeroCookie } from '../src/modules/newborn/surface-hydrators.mjs';
import { classifyPinProvenance } from '../src/modules/newborn/intelligence.mjs';
import {
  executeNewbornHarvestPipeline,
  upsertStagedCandidatesBatch
} from '../src/modules/newborn/harvester.mjs';
import { NewbornCookieRouter } from '../src/modules/newborn/cookie-router.mjs';
import { PinterestCircuitBreaker } from '../src/core/pinterest/client.mjs';
import { listNewbornCandidates, getNewbornCandidateDossier } from '../src/modules/newborn/queries.mjs';
import { fetchNewbornCandidateAccounts } from '../src/modules/newborn/launchpad.mjs';
import { buildHuntOverridesFromBody, handleNewbornRoutes } from '../src/routes/newborn.mjs';
import { runNewbornFleetConsolidate } from '../scripts/newborn-fleet.mjs';
import { getNewbornPageHtml } from '../src/ui/newborn/index.mjs';
import { getNewbornClientAppScript } from '../src/ui/newborn/newborn-client-app.mjs';

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body
  };
}

function makeFakeSql(handler) {
  const calls = [];
  const serializeFragment = (val) => {
    if (val && typeof val === 'object' && val.__isSqlFragment) {
      return val.sqlText;
    }
    return '?';
  };
  const sql = (strings, ...values) => {
    let query = '';
    if (Array.isArray(strings)) {
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) query += serializeFragment(values[i]);
      }
    } else {
      query = String(strings || '');
    }
    const flatValues = [];
    for (const v of values) {
      if (v && typeof v === 'object' && v.__isSqlFragment) {
        flatValues.push(...v.values);
      } else {
        flatValues.push(v);
      }
    }
    const entry = { query, strings, values: flatValues };
    let executed = null;
    const execute = () => {
      if (!executed) {
        calls.push(entry);
        executed = Promise.resolve(typeof handler === 'function' ? handler(entry, calls) : []);
      }
      return executed;
    };
    return {
      __isSqlFragment: true,
      sqlText: query,
      values: flatValues,
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return execute().catch(onRejected);
      },
      finally(onFinally) {
        return execute().finally(onFinally);
      }
    };
  };
  sql.begin = async (fn) => fn(sql);
  sql.calls = calls;
  return sql;
}

// ---------------------------------------------------------------------------
// 1. `extractPinAnnotationsDetailed` Map & Array Parity + Barrel Re-exports
// ---------------------------------------------------------------------------
test('Wave 6G [1]: extractPinAnnotationsDetailed handles Pinterest object-map & array annotations_with_links + entity decoding', () => {
  assert.strictEqual(decodeFromSurfaces, decodeHtmlEntities);
  assert.strictEqual(decodeFromService, decodeHtmlEntities);
  assert.strictEqual(extractFromSurfaces, extractPinAnnotationsDetailed);
  assert.strictEqual(extractFromService, extractPinAnnotationsDetailed);

  const mapRawPin = {
    pin_join: {
      annotations_with_links: {
        'Quick &amp; Easy Dinner': '/ideas/quick-easy-dinner/901/',
        'Meal Prep&#128523;': { url: '/ideas/meal-prep/902/', id: '902' },
        'Healthy&#x27;s Bowl': { name: 'Healthy&#x27;s Bowl', url: '/ideas/healthy-bowl/903/' }
      }
    }
  };
  const fromMap = extractPinAnnotationsDetailed(mapRawPin);
  assert.equal(fromMap.length, 3);
  assert.deepEqual(
    fromMap.map((a) => ({ name: a.name, url: a.url })),
    [
      { name: 'Quick & Easy Dinner', url: '/ideas/quick-easy-dinner/901/' },
      { name: 'Meal Prep\u{1F60B}', url: '/ideas/meal-prep/902/' },
      { name: "Healthy's Bowl", url: '/ideas/healthy-bowl/903/' }
    ]
  );

  const arrayRawPin = {
    pin_join: {
      annotations_with_links: [
        { name: 'Quick &amp; Easy Dinner', url: '/ideas/quick-easy-dinner/901/' },
        { name: 'Meal Prep&#128523;', url: '/ideas/meal-prep/902/' },
        { name: 'Healthy&#x27;s Bowl', url: '/ideas/healthy-bowl/903/' }
      ]
    }
  };
  const fromArray = extractPinAnnotationsDetailed(arrayRawPin);
  assert.deepEqual(
    fromArray.map((a) => ({ name: a.name, url: a.url })),
    fromMap.map((a) => ({ name: a.name, url: a.url }))
  );

  // Numeric-keyed string map (e.g. { "912345": "Parmesan Soup" }) must extract label as name and key as idea_id
  const numericKeyMap = extractPinAnnotationsDetailed({
    pin_join: { annotations_with_links: { '912345': 'Parmesan &amp; Herb Soup' } }
  });
  assert.deepEqual(numericKeyMap, [{ name: 'Parmesan & Herb Soup', url: null, idea_id: '912345' }]);
});

// ---------------------------------------------------------------------------
// 2. `decodeHtmlEntities` Safety & Single-Pass Guarantee
// ---------------------------------------------------------------------------
test('Wave 6G [2]: decodeHtmlEntities safely decodes numeric, hex, named entities without double-decoding or surrogate crashes', () => {
  assert.equal(decodeHtmlEntities('Cook it, Make it&#128523;'), 'Cook it, Make it\u{1F60B}');
  assert.equal(decodeHtmlEntities('Mac &amp; Cheese &quot;Deluxe&quot; &#x27;26'), 'Mac & Cheese "Deluxe" \'26');
  assert.equal(decodeHtmlEntities('A&nbsp;B &ndash; C &mdash; D &hellip;'), 'A B \u2013 C \u2014 D \u2026');
  // Single-pass guarantee: NEVER double-decode `&amp;lt;` into `<`
  assert.equal(decodeHtmlEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
  // Out-of-bounds / surrogate / zero code points preserved safely
  assert.equal(decodeHtmlEntities('bad &#0; &#55296; &#xDFFF; &#99999999;'), 'bad &#0; &#55296; &#xDFFF; &#99999999;');
  assert.equal(decodeHtmlEntities(null), '');
  assert.equal(decodeHtmlEntities(undefined), '');
});

// ---------------------------------------------------------------------------
// 3. `normalizeSurfaceCandidatePin` & `mergeCandidatePinRecords`
// ---------------------------------------------------------------------------
test('Wave 6G [3]: normalizeSurfaceCandidatePin fixes is_repin short-circuit, keeps canonical_pin isolated, and mergeCandidatePinRecords guards hydrated text', () => {
  // Explicit is_repin: false must NOT mask origin_pin.id !== pin.id
  const repinNorm = normalizeSurfaceCandidatePin({
    id: '111111111111111111',
    title: 'Creamy &amp; Dreamy Pasta&#128523;',
    description: 'Chef&#x27;s Choice',
    is_repin: false,
    origin_pin: { id: '222222222222222222' },
    board: { name: 'Cook it, Make it&#128523;', url: '/chef/cook-it/' },
    pinner: { username: 'repinner1', full_name: 'Jane &amp; Co' }
  }, { surface: 'pin_serp_capsules' });

  assert.equal(repinNorm.is_repin, true);
  assert.equal(repinNorm.title, 'Creamy & Dreamy Pasta\u{1F60B}');
  assert.equal(repinNorm.description, "Chef's Choice");
  assert.equal(repinNorm.board_name, 'Cook it, Make it\u{1F60B}');
  assert.equal(repinNorm.pinner_full_name, 'Jane & Co');

  // pin_join.canonical_pin.id alone must NOT trigger is_repin (preserves tests/10:2225)
  const canonicalOnly = normalizeSurfaceCandidatePin({
    id: '333333333333333333',
    title: 'Original Upload',
    is_repin: false,
    pin_join: { canonical_pin: { id: '444444444444444444' } },
    pinner: { username: 'creator1' }
  }, { surface: 'pin_serp_capsules' });
  assert.equal(canonicalOnly.is_repin, false);

  // Unhydrated Pidgets stub must NOT overwrite hydrated board_name or title
  const hydratedBase = {
    pin_id: '555555555555555555',
    title: 'Hydrated Clean Title',
    board_name: 'Hydrated Clean Board',
    is_hydrated: true,
    repin_count: 120,
    discovered_surfaces: ['pin_serp_capsules']
  };
  const pidgetsStub = {
    pin_id: '555555555555555555',
    title: 'Raw &amp; Messy Stub',
    board_name: 'Cook it, Make it&#128523;',
    is_hydrated: false,
    repin_count: 145,
    discovered_surfaces: ['pidgets']
  };
  const merged = mergeCandidatePinRecords(hydratedBase, pidgetsStub);
  assert.equal(merged.title, 'Hydrated Clean Title');
  assert.equal(merged.board_name, 'Hydrated Clean Board');
  assert.equal(merged.repin_count, 145);
});

// ---------------------------------------------------------------------------
// 4. `hydratePinZeroCookie` Request Shape
// ---------------------------------------------------------------------------
test('Wave 6G [4]: hydratePinZeroCookie omits fetch_visual_search_objects and extracts pin_join annotations', async () => {
  const seenUrls = [];
  const router = new NewbornCookieRouter({
    rawCookie: '',
    fetchImpl: async (url) => {
      seenUrls.push(String(url));
      return makeJsonResponse({
        resource_response: {
          data: {
            id: '777777777777777777',
            title: 'Spring Salad &amp; Dressing',
            created_at: 'Mon, 10 Nov 2026 12:00:00 +0000',
            repin_count: 85,
            aggregated_pin_data: { aggregated_stats: { saves: 120 } },
            share_count: 14,
            pin_join: {
              annotations_with_links: {
                'Spring Salad': '/ideas/spring-salad/101/'
              }
            }
          }
        }
      });
    }
  });

  const res = await hydratePinZeroCookie('777777777777777777', router, {
    nowMs: Date.parse('2026-11-20T12:00:00Z'),
    resolveRootPin: false
  });
  assert.equal(res.ok, true);
  assert.equal(seenUrls.length, 1);
  assert.equal(seenUrls[0].includes('fetch_visual_search_objects'), false, 'PinResource/get must NOT pass fetch_visual_search_objects');
  assert.equal(res.pin.title, 'Spring Salad & Dressing');
  assert.equal(res.pin.share_count, 14);
  assert.equal(res.pin.visual_annotations.length, 1);
  assert.equal(res.pin.visual_annotations[0].name, 'Spring Salad');

  // HTTP 429 on PinResource/get must NOT fire a second SSR HTML fallback request
  const seen429Urls = [];
  const router429 = new NewbornCookieRouter({
    rawCookie: '',
    fetchImpl: async (url) => {
      seen429Urls.push(String(url));
      return makeJsonResponse({ error: 'rate limited' }, 429);
    }
  });
  const res429 = await hydratePinZeroCookie('777777777777777778', router429, {
    nowMs: Date.parse('2026-11-20T12:00:00Z'),
    resolveRootPin: false
  });
  assert.equal(res429.ok, false);
  assert.equal(res429.status, 429);
  assert.equal(seen429Urls.length, 1, 'HTTP 429 must halt immediately without firing SSR HTML fallback');
});

// ---------------------------------------------------------------------------
// 5. `classifyPinProvenance` Fix
// ---------------------------------------------------------------------------
test('Wave 6G [5]: classifyPinProvenance maps photos & pin_scheduling to UPLOADED even when is_idea_pin is true', () => {
  assert.equal(
    classifyPinProvenance({ raw_creation_method: 'photos', is_idea_pin: true }).upload_provenance,
    'UPLOADED'
  );
  assert.equal(
    classifyPinProvenance({ raw_creation_method: 'pin_scheduling', is_idea_pin: true }).upload_provenance,
    'UPLOADED'
  );
  assert.equal(
    classifyPinProvenance({ raw_creation_method: 'ios_photos', is_idea_pin: true }).upload_provenance,
    'UPLOADED'
  );
  assert.equal(
    classifyPinProvenance({ raw_creation_method: 'story_pin_builder', is_idea_pin: true }).upload_provenance,
    'IDEA_PIN'
  );
});

// ---------------------------------------------------------------------------
// 6. Pre-Age Gate + Pass 2 Winner Hydration Pass (and 429 Halt Preservation)
// ---------------------------------------------------------------------------
test('Wave 6G [6A]: Pre-Age Gate skips >maxAge pins before hydration budget so all young winners hydrate in Pass 1 (immune to wall-clock drift)', async () => {
  // Deliberately use a historical nowMs (>2 years behind Date.now()) to prove Pre-Age Gate evaluates
  // created_at_pinterest against nowMs rather than formatPin's wall-clock Date.now() age_days.
  const nowMs = Date.parse('2024-06-15T12:00:00Z');
  const oldDate = new Date(nowMs - 120 * 86_400_000).toUTCString();
  const youngDate = new Date(nowMs - 5 * 86_400_000).toUTCString();

  const serpPins = [];
  // 100 old pins with huge repins (would previously steal the entire 10-pin hydration budget!)
  for (let i = 1; i <= 100; i++) {
    serpPins.push({
      id: String(810000000000000 + i),
      title: `Old Viral Pin ${i}`,
      created_at: oldDate,
      repin_count: 5000 + i,
      aggregated_pin_data: { aggregated_stats: { saves: 6000 + i } }
    });
  }
  // 10 young pins with modest repins
  const youngIds = new Set();
  for (let i = 1; i <= 10; i++) {
    const pid = String(820000000000000 + i);
    youngIds.add(pid);
    serpPins.push({
      id: pid,
      title: `Young Winner ${i}`,
      created_at: youngDate,
      repin_count: 50 + i,
      aggregated_pin_data: { aggregated_stats: { saves: 60 + i } }
    });
  }

  const hydratedPinIds = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource/get')) {
      return makeJsonResponse({
        resource_response: {
          data: { results: serpPins, guides: [] },
          bookmark: '-end-'
        }
      });
    }
    if (u.includes('PinResource/get')) {
      const m = u.match(/"id":"(\d+)"/) || decodeURIComponent(u).match(/"id":"(\d+)"/);
      const pid = m ? m[1] : '';
      hydratedPinIds.push(pid);
      return makeJsonResponse({
        resource_response: {
          data: {
            id: pid,
            title: `Hydrated ${pid}`,
            created_at: youngIds.has(pid) ? youngDate : oldDate,
            repin_count: 80,
            share_count: 9,
            pin_join: { annotations_with_links: { 'Fresh Niche': '/ideas/fresh-niche/1/' } }
          }
        }
      });
    }
    return makeJsonResponse({ resource_response: { data: [] } });
  };

  const res = await executeNewbornHarvestPipeline(null, {
    seedQueries: ['fresh niche'],
    nowMs,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 1, page_size: 110, target_pins: 110 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          related_pin_snowball: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        },
        snowball: { enabled: false, max_hops: 0 },
        hydration: {
          enable_pidgets_pretriage: false,
          max_pin_hydrations_per_run: 10,
          auto_fetch_accounts: false
        }
      },
      qualification: {
        min_age_days: 0,
        max_age_days: 30,
        min_repin_count: 20,
        min_save_count: 0,
        resolve_root_pin: false
      }
    },
    routerOptions: { rawCookie: '', fetchImpl }
  });

  assert.equal(res.status, 'completed');
  assert.equal(hydratedPinIds.length, 10, 'Exactly 10 young pins should be hydrated');
  for (const pid of hydratedPinIds) {
    assert.ok(youngIds.has(pid), `Pre-Age Gate must skip old pin ${pid}`);
  }
  assert.equal(res.candidates.length, 10);
  assert.ok(res.candidates.every((c) => c.is_hydrated && c.visual_annotations.length === 1));
});

test('Wave 6G [6B]: Pass 2 Winner Hydration hydrates qualified winners that missed Pass 1 budget, and halts cleanly on 429 preserving winners', async () => {
  const nowMs = Date.parse('2026-11-20T12:00:00Z');
  const youngDate = new Date(nowMs - 4 * 86_400_000).toUTCString();

  // 8 young pins with budget of 2 in Pass 1 -> remaining 6 must be hydrated by Pass 2!
  const serpPins = Array.from({ length: 8 }, (_, idx) => ({
    id: String(830000000000000 + idx + 1),
    title: `Pass2 Winner ${idx + 1}`,
    created_at: youngDate,
    repin_count: 100 - idx,
    aggregated_pin_data: { aggregated_stats: { saves: 120 - idx } }
  }));

  const pass2Hydrated = new Set();
  const fetchAllOk = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource/get')) {
      return makeJsonResponse({
        resource_response: { data: { results: serpPins, guides: [] }, bookmark: '-end-' }
      });
    }
    if (u.includes('PinResource/get')) {
      const m = decodeURIComponent(u).match(/"id":"(\d+)"/);
      const pid = m ? m[1] : '';
      pass2Hydrated.add(pid);
      return makeJsonResponse({
        resource_response: {
          data: {
            id: pid,
            title: `Hydrated ${pid}`,
            created_at: youngDate,
            repin_count: 95,
            share_count: 7,
            method: 'photos',
            pin_join: { annotations_with_links: { 'Winner Tag': '/ideas/winner-tag/1/' } }
          }
        }
      });
    }
    return makeJsonResponse({ resource_response: { data: [] } });
  };

  const baseOverrides = {
    discovery: {
      surfaces: {
        pin_serp_capsules: { enabled: true, max_pages: 1, page_size: 20, target_pins: 20 },
        fresh_boards: { enabled: false },
        board_feed: { enabled: false },
        board_more_ideas: { enabled: false },
        ideas_feeds: { enabled: false },
        home_feed: { enabled: false },
        related_pin_snowball: { enabled: false },
        growing_trends: { enabled: false },
        zero_query_popular: { enabled: false }
      },
      snowball: { enabled: false, max_hops: 0 },
      hydration: {
        enable_pidgets_pretriage: false,
        max_pin_hydrations_per_run: 2,
        auto_fetch_accounts: false
      }
    },
    qualification: { min_age_days: 0, max_age_days: 30, min_repin_count: 20, min_save_count: 0, resolve_root_pin: false }
  };

  const resOk = await executeNewbornHarvestPipeline(null, {
    seedQueries: ['winner tag'],
    nowMs,
    settingsOverrides: baseOverrides,
    routerOptions: { rawCookie: '', fetchImpl: fetchAllOk }
  });

  assert.equal(resOk.status, 'completed');
  assert.equal(resOk.candidates.length, 8);
  assert.equal(pass2Hydrated.size, 8, 'Pass 2 must hydrate all 6 remaining qualified winners beyond Pass 1 budget of 2');
  assert.ok(resOk.candidates.every((c) => c.is_hydrated && c.visual_annotations.length === 1 && c.upload_provenance === 'UPLOADED'));

  // Now simulate HTTP 429 during Pass 2 (on the 3rd PinResource/get call) -> must halt immediately and preserve all 8 already-qualified winners
  let pinResCalls = 0;
  const fetchWith429 = async (url) => {
    const u = String(url);
    if (u.includes('BaseSearchResource/get')) {
      return makeJsonResponse({
        resource_response: { data: { results: serpPins, guides: [] }, bookmark: '-end-' }
      });
    }
    if (u.includes('PinResource/get')) {
      pinResCalls += 1;
      if (pinResCalls >= 3) {
        return makeJsonResponse({ error: 'rate limited' }, 429);
      }
      const m = decodeURIComponent(u).match(/"id":"(\d+)"/);
      const pid = m ? m[1] : '';
      return makeJsonResponse({
        resource_response: {
          data: {
            id: pid,
            title: `Hydrated ${pid}`,
            created_at: youngDate,
            repin_count: 95,
            pin_join: { annotations_with_links: { 'Winner Tag': '/ideas/winner-tag/1/' } }
          }
        }
      });
    }
    return makeJsonResponse({ resource_response: { data: [] } });
  };

  const res429 = await executeNewbornHarvestPipeline(null, {
    seedQueries: ['winner tag'],
    nowMs,
    settingsOverrides: baseOverrides,
    routerOptions: {
      rawCookie: '',
      circuitBreaker: new PinterestCircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 }),
      fetchImpl: fetchWith429
    }
  });

  assert.equal(res429.status, 'partial_rate_limited');
  assert.equal(res429.stop_reason, 'rate_limited_hydration');
  assert.equal(res429.candidates.length, 8, 'All 8 already-qualified winners must be preserved when Pass 2 hits 429');
});

// ---------------------------------------------------------------------------
// 7. Silent 2-Hop Snowball Leak Fix
// ---------------------------------------------------------------------------
test('Wave 6G [7]: buildHuntOverridesFromBody disables snowball when paths.related is absent on discover/cluster, but keeps enabled for isSnowball: true', () => {
  // Standard discover hunt with paths omitting related
  const discoverOverrides = buildHuntOverridesFromBody({
    query: 'spring outfits',
    paths: {
      search: { enabled: true, target_pins: 500 },
      boards: { enabled: true, max_boards: 5, target_pins_per_board: 100 }
    }
  });
  assert.equal(discoverOverrides.discovery.surfaces.related_pin_snowball.enabled, false);
  assert.equal(discoverOverrides.discovery.snowball.enabled, false);
  assert.equal(discoverOverrides.discovery.snowball.max_hops, 0);

  // Body with no paths at all on non-snowball hunt
  const bareOverrides = buildHuntOverridesFromBody({ query: 'minimalist desk' });
  assert.equal(bareOverrides.discovery.surfaces.related_pin_snowball.enabled, false);
  assert.equal(bareOverrides.discovery.snowball.enabled, false);
  assert.equal(bareOverrides.discovery.snowball.max_hops, 0);

  // Explicit snowball hunt (even without target_pins / max_hops) MUST keep snowball enabled
  const snowballOverrides = buildHuntOverridesFromBody({ seed_pin_ids: ['123456789'] }, { isSnowball: true });
  assert.equal(snowballOverrides.discovery.surfaces.related_pin_snowball.enabled, true);
  assert.equal(snowballOverrides.discovery.snowball.enabled, true);
});

// ---------------------------------------------------------------------------
// 8. Upsert & Telemetry Integrity + Fleet Consolidate `surfaces_used`
// ---------------------------------------------------------------------------
test('Wave 6G [8]: Upsert SQL integrity, root_age_verified truthfulness, pages_scrolled/matched_repins accuracy, and fleet consolidate surfaces_used', async () => {
  const nowMs = Date.parse('2026-11-20T12:00:00Z');
  const sql = makeFakeSql(() => []);

  const unhydratedCand = {
    pin_id: '840000000000001',
    title: 'Unhydrated Candidate',
    first_surface: 'pin_serp_capsules',
    is_hydrated: false,
    root_age_verified: null,
    repin_count: 50,
    save_count: 60,
    qualified: true
  };
  const hydratedCand = {
    pin_id: '840000000000002',
    title: 'Hydrated Candidate',
    first_surface: 'board_more_ideas',
    is_hydrated: true,
    root_age_verified: true,
    repin_count: 90,
    save_count: 110,
    qualified: true
  };

  const upRes = await upsertStagedCandidatesBatch(sql, [unhydratedCand, hydratedCand], { runId: 24, nowMs });
  const unhydRow = upRes.rows.find((r) => r.pin_id === '840000000000001');
  const hydRow = upRes.rows.find((r) => r.pin_id === '840000000000002');
  assert.equal(unhydRow.metadata.root_age_verified, false, 'Unhydrated row must set root_age_verified=false');
  assert.equal(hydRow.metadata.root_age_verified, true, 'Hydrated verified row must set root_age_verified=true');

  const candInsert = sql.calls.find((c) => c.query.includes('INSERT INTO newborn_candidates'));
  assert.ok(candInsert, 'Expected INSERT INTO newborn_candidates SQL');
  assert.ok(candInsert.query.includes('COALESCE(EXCLUDED.destination_url, newborn_candidates.destination_url) IS NULL'), 'is_linkless must be derived from merged destination_url/clean_domain');
  assert.ok(candInsert.query.includes('GREATEST(newborn_candidates.save_count, EXCLUDED.save_count)'), 'save_count must use NULL-safe GREATEST');
  assert.ok(candInsert.query.includes('GREATEST(newborn_candidates.repin_count, EXCLUDED.repin_count)'), 'repin_count must use NULL-safe GREATEST');
  assert.ok(candInsert.query.includes('GREATEST(newborn_candidates.share_count, EXCLUDED.share_count)'), 'share_count must use NULL-safe GREATEST');
  assert.ok(
    candInsert.query.includes('jsonb_strip_nulls') && candInsert.query.includes("'{root_age_verified}'"),
    'ON CONFLICT metadata merge must preserve monotonic root_age_verified and non-null board counts'
  );

  const runCandInsert = sql.calls.find((c) => c.query.includes('INSERT INTO newborn_run_candidates'));
  assert.ok(runCandInsert, 'Expected INSERT INTO newborn_run_candidates SQL');
  assert.ok(
    runCandInsert.query.includes("newborn_run_candidates.surface <> 'related_pin_snowball'"),
    'newborn_run_candidates ON CONFLICT must preserve primary surface over related_pin_snowball'
  );

  // Verify pages_scrolled is NOT double-counted across 2 SERP pages
  const youngDate = new Date(nowMs - 3 * 86_400_000).toUTCString();
  let serpPage = 0;
  const harvestRes = await executeNewbornHarvestPipeline(null, {
    seedQueries: ['pasta'],
    nowMs,
    settingsOverrides: {
      discovery: {
        surfaces: {
          pin_serp_capsules: { enabled: true, max_pages: 2, page_size: 10, target_pins: 10 },
          fresh_boards: { enabled: false },
          board_feed: { enabled: false },
          board_more_ideas: { enabled: false },
          ideas_feeds: { enabled: false },
          home_feed: { enabled: false },
          related_pin_snowball: { enabled: false },
          growing_trends: { enabled: false },
          zero_query_popular: { enabled: false }
        },
        snowball: { enabled: false, max_hops: 0 },
        hydration: { enable_pidgets_pretriage: false, max_pin_hydrations_per_run: 5, auto_fetch_accounts: false }
      },
      qualification: { min_age_days: 0, max_age_days: 30, min_repin_count: 10, min_save_count: 0, resolve_root_pin: false }
    },
    routerOptions: {
      rawCookie: '',
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('BaseSearchResource/get')) {
          serpPage += 1;
          return makeJsonResponse({
            resource_response: {
              data: {
                results: [
                  { id: `85000000000000${serpPage}`, title: `Pasta ${serpPage}`, created_at: youngDate, repin_count: 40 }
                ],
                guides: []
              },
              bookmark: serpPage < 2 ? 'page_2_token' : '-end-'
            }
          });
        }
        return makeJsonResponse({
          resource_response: {
            data: {
              id: `85000000000000${serpPage}`,
              created_at: youngDate,
              repin_count: 40,
              pin_join: { annotations_with_links: { Pasta: '/ideas/pasta/1/' } }
            }
          }
        });
      }
    }
  });
  assert.equal(harvestRes.funnel.pages_scrolled, 2, '2 SERP pages must count as 2 (not double-counted as 4)');
  assert.equal(harvestRes.funnel.matched_repins, 2, 'matched_repins must reflect unique matched pin IDs');
  assert.deepEqual(harvestRes.surfaces_executed, ['pin_serp_capsules']);

  // Fleet consolidate merges & persists surfaces_used while keeping status as values[0]
  const fleetSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_runs') && entry.query.includes('WHERE id =')) {
      return [{
        id: 77,
        status: 'running',
        cancel_requested_at: null,
        shards_total: 2,
        shards_completed: 2,
        shards_failed: 0,
        surfaces_used: ['pin_serp_capsules'],
        telemetry: {
          shards: {
            '0': { scrolled_pins: 100, matched_repins: 20, hydrated_pins: 10, status: 'completed', surfaces_used: ['pin_serp_capsules', 'board_more_ideas'] },
            '1': { scrolled_pins: 80, matched_repins: 15, hydrated_pins: 8, status: 'completed', surfaces_used: ['ideas_feeds', 'board_more_ideas'] }
          }
        },
        candidates_discovered: 180,
        candidates_qualified: 12,
        golden_pins_count: 10
      }];
    }
    if (entry.query.includes('FROM newborn_run_candidates rc')) {
      return [{ verified_winners: 12, golden_pins_count: 10 }];
    }
    return [];
  });

  const cons = await runNewbornFleetConsolidate({
    sql: fleetSql,
    parsedArgs: { runId: 77 },
    env: {},
    nowMs
  });
  assert.deepEqual(cons.consolidated_run.surfaces_used, ['pin_serp_capsules', 'board_more_ideas', 'ideas_feeds']);
  const updateRunCall = fleetSql.calls.find((c) => c.query.includes('UPDATE newborn_runs'));
  assert.ok(updateRunCall);
  assert.equal(updateRunCall.values[0], 'completed', 'status = ${finalStatus} MUST remain values[0]');
  assert.ok(updateRunCall.query.includes('surfaces_used ='), 'Fleet consolidate must persist merged surfaces_used');
});

// ---------------------------------------------------------------------------
// 9. Queries, Routes & `Pull Account` Hydration Persistence
// ---------------------------------------------------------------------------
test('Wave 6G [9]: Queries expose run_surface/filters/shares sort/entity decode, run_id bypasses 10s cache, and Pull Account persists pin metadata', async () => {
  // A. listNewbornCandidates + getNewbornCandidateDossier
  const querySql = makeFakeSql((entry) => {
    if (entry.query.includes('SELECT COUNT(*)::int AS total')) {
      return [{ total: 1 }];
    }
    if (entry.query.includes('FROM newborn_candidates nc')) {
      return [{
        pin_id: '860000000000001',
        title: 'Best Pasta &amp; Sauce',
        description: 'Quick&#x27;s Recipe',
        board_name: 'Cook it, Make it&#128523;',
        pinner_full_name: 'Chef &amp; Co',
        first_surface: 'related_pin_snowball',
        run_surface: 'board_more_ideas',
        share_count: 42,
        raw_creation_method: 'photos',
        is_repin: true,
        visual_annotations: [{ name: 'Quick &amp; Easy', url: '/ideas/quick-easy/1/' }]
      }];
    }
    if (entry.query.includes('SELECT * FROM newborn_candidates WHERE pin_id')) {
      return [{
        pin_id: '860000000000001',
        title: 'Best Pasta &amp; Sauce',
        board_name: 'Cook it, Make it&#128523;',
        visual_annotations: [{ name: 'Quick &amp; Easy', url: '/ideas/quick-easy/1/' }]
      }];
    }
    return [];
  });

  const listed = await listNewbornCandidates(querySql, {
    run_id: 24,
    surface: 'board_more_ideas',
    creation_method: 'photos',
    repin_filter: 'repin',
    sort: 'shares',
    limit: 50,
    offset: 0
  });
  const selectCall = querySql.calls.find((c) => c.query.includes('FROM newborn_candidates nc') && c.query.includes('ORDER BY'));
  assert.ok(selectCall.query.includes('nrc.surface AS run_surface'));
  assert.ok(selectCall.query.includes('nrc.surface ='));
  assert.ok(selectCall.query.includes('nc.raw_creation_method'));
  assert.ok(selectCall.query.includes('nc.is_repin ='));
  assert.ok(selectCall.query.includes('ORDER BY nc.share_count DESC NULLS LAST'));

  assert.equal(listed.candidates[0].title, 'Best Pasta & Sauce');
  assert.equal(listed.candidates[0].board_name, 'Cook it, Make it\u{1F60B}');
  assert.equal(listed.candidates[0].visual_annotations[0].name, 'Quick & Easy');
  assert.equal(listed.candidates[0].run_surface, 'board_more_ideas');
  assert.equal(listed.candidates[0].effective_surface, 'board_more_ideas');

  // run_id: null with surface & cluster_hits sort must NEVER reference nrc alias in SQL
  const prevCallCount = querySql.calls.length;
  await listNewbornCandidates(querySql, {
    run_id: null,
    surface: 'board_more_ideas',
    sort: 'cluster_hits',
    limit: 50,
    offset: 0
  });
  const globalCalls = querySql.calls.slice(prevCallCount);
  assert.ok(globalCalls.length >= 2);
  for (const call of globalCalls) {
    assert.equal(call.query.includes('nrc.'), false, 'Global listNewbornCandidates (run_id: null) must NEVER reference nrc alias');
  }

  const dossier = await getNewbornCandidateDossier(querySql, '860000000000001');
  assert.equal(dossier.candidate.title, 'Best Pasta & Sauce');
  assert.equal(dossier.candidate.board_name, 'Cook it, Make it\u{1F60B}');
  assert.equal(dossier.candidate.visual_annotations[0].name, 'Quick & Easy');

  // B. GET /api/newborn/candidates?run_id=24 bypasses 10s server cache
  let dbHits = 0;
  let cacheHits = 0;
  const routeSql = makeFakeSql((entry) => {
    if (entry.query.includes('SELECT COUNT(*)::int AS total')) return [{ total: dbHits }];
    if (entry.query.includes('FROM newborn_candidates nc')) {
      dbHits += 1;
      return [{ pin_id: `86000000000001${dbHits}`, title: `Hit ${dbHits}`, first_surface: 'pin_serp_capsules' }];
    }
    return [];
  });
  const makeRouteCtx = (urlStr) => {
    const u = new URL(urlStr);
    return {
      pathname: u.pathname,
      method: 'GET',
      request: new Request(urlStr, { method: 'GET' }),
      searchParams: u.searchParams,
      env: {},
      sql: routeSql,
      jsonResponse: (body, status = 200) => makeJsonResponse(body, status),
      methodNotAllowedResponse: () => makeJsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405),
      clampLimit: (v, def, max) => Math.min(max, Math.max(1, parseInt(v || String(def), 10) || def)),
      buildCanonicalCacheKey: (prefix, sp) => `${prefix}:${sp.toString()}`,
      getCachedOrFetch: async (_k, fn) => {
        cacheHits += 1;
        return fn();
      }
    };
  };
  const r1 = await handleNewbornRoutes(makeRouteCtx('http://localhost/api/newborn/candidates?run_id=924&creation_method=photos&repin_filter=original&sort=shares'));
  const d1 = await r1.json();
  const r2 = await handleNewbornRoutes(makeRouteCtx('http://localhost/api/newborn/candidates?run_id=924&creation_method=photos&repin_filter=original&sort=shares'));
  const d2 = await r2.json();
  assert.equal(cacheHits, 0, 'run_id scoped /api/newborn/candidates must bypass getCachedOrFetch');
  assert.equal(dbHits, 2, 'run_id scoped /api/newborn/candidates must query DB directly on every call');
  assert.notEqual(d1.candidates[0].pin_id, d2.candidates[0].pin_id);

  await handleNewbornRoutes(makeRouteCtx('http://localhost/api/newborn/candidates?creation_method=photos&sort=shares'));
  assert.equal(cacheHits, 1, 'Global /api/newborn/candidates without run_id should still use getCachedOrFetch');

  // C. fetchNewbornCandidateAccounts hydrates unhydrated row even if username already exists, and persists full metadata
  let pinResourceCalled = false;
  const accSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_candidates') && entry.query.includes('WHERE pin_id = ANY')) {
      return [{
        pin_id: '870000000000001',
        effective_creator_username: 'knowncreator',
        is_hydrated: false,
        title: 'Old Stub Title',
        board_name: 'Old Stub Board',
        visual_annotations: [],
        repin_count: 55
      }];
    }
    return [];
  });

  const accRes = await fetchNewbornCandidateAccounts(accSql, ['870000000000001'], {
    nowMs: Date.parse('2026-11-20T12:00:00Z'),
    routerOptions: {
      rawCookie: '',
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('PinResource/get')) {
          pinResourceCalled = true;
          return makeJsonResponse({
            resource_response: {
              data: {
                id: '870000000000001',
                title: 'Hydrated Account Pin &amp; Guide',
                board: { name: 'Hydrated Board&#128523;', url: '/knowncreator/hydrated-board/' },
                share_count: 19,
                method: 'pin_scheduling',
                is_repin: true,
                pinner: { username: 'knowncreator' },
                pin_join: { annotations_with_links: { 'DIY Guide': '/ideas/diy-guide/1/' } }
              }
            }
          });
        }
        if (u.includes('UserResource/get')) {
          return makeJsonResponse({
            resource_response: {
              data: {
                username: 'knowncreator',
                follower_count: 4200,
                profile_reach: 310000,
                profile_views: 450000,
                pin_count: 95
              }
            }
          });
        }
        return makeJsonResponse({ resource_response: { data: {} } });
      }
    }
  });

  assert.equal(pinResourceCalled, true, 'Unhydrated row must call PinResource/get even if username already exists');
  assert.equal(accRes.ok, true);
  assert.equal(accRes.results[0].is_hydrated, true);
  assert.equal(accRes.results[0].share_count, 19);
  assert.equal(accRes.results[0].raw_creation_method, 'pin_scheduling');
  assert.equal(accRes.results[0].upload_provenance, 'UPLOADED', 'Pull Account must recompute and return UPLOADED provenance for pin_scheduling');
  assert.equal(accRes.results[0].visual_annotations[0].name, 'DIY Guide');
  const updateCandCall = accSql.calls.find((c) => c.query.includes('UPDATE newborn_candidates AS nc'));
  assert.ok(updateCandCall, 'Must run batched UPDATE newborn_candidates');
  assert.ok(updateCandCall.query.includes('visual_annotations = CASE'));
  assert.ok(updateCandCall.query.includes('share_count = CASE'));
  assert.ok(updateCandCall.query.includes('is_hydrated = (nc.is_hydrated OR u.is_hydrated)'));
  const persistedPayload = JSON.parse(updateCandCall.values[0]);
  assert.equal(persistedPayload[0].upload_provenance, 'UPLOADED', 'Batched UPDATE must persist recomputed UPLOADED provenance');

  // D. Even if UserResource fails (!u branch), newly hydrated pin must still persist recomputed upload_provenance
  const noUserSql = makeFakeSql((entry) => {
    if (entry.query.includes('FROM newborn_candidates') && entry.query.includes('WHERE pin_id = ANY')) {
      return [{
        pin_id: '870000000000002',
        effective_creator_username: 'missingcreator',
        is_hydrated: false,
        upload_provenance: 'UNKNOWN',
        visual_annotations: [],
        repin_count: 35
      }];
    }
    return [];
  });
  const noUserRes = await fetchNewbornCandidateAccounts(noUserSql, ['870000000000002'], {
    nowMs: Date.parse('2026-11-20T12:00:00Z'),
    routerOptions: {
      rawCookie: '',
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('PinResource/get')) {
          return makeJsonResponse({
            resource_response: {
              data: {
                id: '870000000000002',
                title: 'Hydrated Photos Pin',
                method: 'photos',
                share_count: 5,
                pinner: { username: 'missingcreator' },
                pin_join: { annotations_with_links: { 'Home Styling': '/ideas/home-styling/1/' } }
              }
            }
          });
        }
        return makeJsonResponse({ resource_response: { data: null } }, 404);
      }
    }
  });
  assert.equal(noUserRes.results[0].fetched, false);
  assert.equal(noUserRes.results[0].is_hydrated, true);
  assert.equal(noUserRes.results[0].upload_provenance, 'UPLOADED');
  const noUserUpdate = noUserSql.calls.find((c) => c.query.includes('UPDATE newborn_candidates AS nc'));
  assert.ok(noUserUpdate);
  assert.equal(JSON.parse(noUserUpdate.values[0])[0].upload_provenance, 'UPLOADED');
});

// ---------------------------------------------------------------------------
// 10. UI HTML Budgets, Guardrails, Pagination, Sync CSV & Paginated exportAllCsv
// ---------------------------------------------------------------------------
test('Wave 6G [10]: UI HTML size < 225 KB, inline JS < 2.5 KB, zero emojis, zero bare Shares/Comments/Reactions, sync exportCsv + paginated exportAllCsv', async () => {
  const html = getNewbornPageHtml('', 'hunt');
  const htmlKb = Buffer.byteLength(html, 'utf8') / 1024;
  assert.ok(htmlKb < 225, `Expected /newborn HTML < 225 KB, got ${htmlKb.toFixed(2)} KB`);

  const inlineScripts = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
  const inlineJsBytes = inlineScripts.reduce((sum, m) => sum + Buffer.byteLength(m[1] || '', 'utf8'), 0);
  assert.ok(inlineJsBytes < 2.5 * 1024, `Expected inline JS < 2.5 KB, got ${(inlineJsBytes / 1024).toFixed(2)} KB`);

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(mainMatch, 'Expected <main> element');
  assert.equal(/\p{Extended_Pictographic}/u.test(mainMatch[1]), false, 'Zero emojis allowed inside <main>');
  assert.equal(/>\s*(Comments|Reactions|Shares)\s*</i.test(html), false, 'Zero bare >Shares<, >Comments<, or >Reactions< allowed');
  assert.ok(html.includes('Export CSV'), 'Must preserve Export CSV text');
  assert.ok(html.includes('Sort: Pin Shares (High -&gt; Low)'), 'Must include Pin Shares sort option');
  assert.ok(html.includes('Pin Shares'), 'Must include Pin Shares dossier row');
  assert.ok(html.includes('exportAllCsv()'), 'Toolbar button must invoke exportAllCsv()');

  // Instantiate client controller in VM
  const rawScript = getNewbornClientAppScript().replace(/^\s*<script>\s*/i, '').replace(/\s*<\/script>\s*$/i, '');
  const sandbox = {
    console,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    document: undefined,
    window: undefined
  };
  vm.createContext(sandbox);
  vm.runInContext(rawScript, sandbox);
  const app = sandbox.newbornStudioApp('', 'hunt');
  app.toast = () => {};
  app.refreshIcons = () => {};

  // formatSurfaceLabel fallback must NOT default unknown surfaces to 'Search'
  assert.equal(app.formatSurfaceLabel('custom_surface'), 'custom_surface');
  assert.equal(app.formatSurfaceLabel(''), 'Unknown');
  assert.equal(app.formatSurfaceLabel('board_more_ideas'), 'Find More Ideas');

  // formatCreationMethodLabel
  assert.equal(app.formatCreationMethodLabel('share_extension_ios'), 'iOS Share');
  assert.equal(app.formatCreationMethodLabel('photos'), 'Photos');
  assert.equal(app.formatCreationMethodLabel('pin_scheduling'), 'Scheduled');
  assert.equal(app.formatCreationMethodLabel(''), '');

  // Synchronous exportCsv(rowsOverride)
  app.candidates = [
    {
      pin_id: '880000000000001',
      title: '=SUM(A1:A2)',
      repin_count: 100,
      save_count: 150,
      share_count: 12,
      raw_creation_method: 'photos',
      is_repin: true,
      first_surface: 'related_pin_snowball',
      run_surface: 'board_more_ideas',
      visual_annotations: [{ name: 'Pasta' }]
    }
  ];
  app.candidatesTotal = 1;
  const syncCsv = app.exportCsv();
  assert.equal(typeof syncCsv, 'string', 'exportCsv() MUST remain strictly synchronous returning string');
  assert.ok(syncCsv.includes('"Shares"'));
  assert.ok(syncCsv.includes('"Creation Method"'));
  assert.ok(syncCsv.includes('"Is Repin"'));
  assert.ok(syncCsv.includes('"Find More Ideas"'), 'CSV Discovery Source must prefer run_surface');
  assert.ok(syncCsv.includes('"\'=SUM(A1:A2)"'), 'CSV must preserve formula injection guard');

  // Pagination & multi-page exportAllCsv()
  const fetchedUrls = [];
  app.apiJson = async (url) => {
    fetchedUrls.push(String(url));
    const u = new URL('http://localhost' + url);
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 100);
    const total = 620;
    const count = Math.max(0, Math.min(limit, total - offset));
    const batch = Array.from({ length: count }, (_, i) => ({
      pin_id: String(890000000000000 + offset + i + 1),
      title: `Pin ${offset + i + 1}`,
      repin_count: 50,
      share_count: 3,
      first_surface: 'pin_serp_capsules'
    }));
    return { data: { total, candidates: batch } };
  };

  app.activeRunId = 24;
  app.filters.surface = 'board_more_ideas';
  app.filters.creationMethod = 'photos';
  app.filters.repinFilter = 'original';
  await app.loadCandidates(true);
  assert.equal(app.candidatesTotal, 620);
  assert.equal(app.candidates.length, 100);
  assert.equal(app.candidatesRangeStart(), 1);
  assert.equal(app.candidatesRangeEnd(), 100);
  assert.equal(app.hasPrevCandidatesPage(), false);
  assert.equal(app.hasNextCandidatesPage(), true);
  assert.ok(fetchedUrls[0].includes('surface=board_more_ideas'));
  assert.ok(fetchedUrls[0].includes('creation_method=photos'));
  assert.ok(fetchedUrls[0].includes('repin_filter=original'));
  assert.ok(fetchedUrls[0].includes('limit=100'));
  assert.ok(fetchedUrls[0].includes('offset=0'));

  await app.nextCandidatesPage();
  assert.equal(app.candidatesOffset, 100);
  assert.equal(app.candidatesRangeStart(), 101);
  assert.equal(app.candidatesRangeEnd(), 200);
  assert.equal(app.hasPrevCandidatesPage(), true);

  fetchedUrls.length = 0;
  const fullCsv = await app.exportAllCsv();
  assert.equal(fetchedUrls.length, 2, '620 rows at 500/page must fetch 2 pages (offset 0 and offset 500)');
  assert.ok(fetchedUrls[0].includes('limit=500&offset=0'));
  assert.ok(fetchedUrls[1].includes('limit=500&offset=500'));
  const csvLines = fullCsv.split('\n');
  assert.equal(csvLines.length, 621, 'CSV must have 1 header + 620 data rows');

  // Out-of-bounds offset clamping when page >= 2 becomes empty after discarding last item
  app.candidatesPageSize = 100;
  app.candidatesOffset = 100;
  app.apiJson = async (url) => {
    const u = new URL('http://localhost' + url);
    const offset = Number(u.searchParams.get('offset') || 0);
    if (offset >= 100) return { data: { total: 100, candidates: [] } };
    return {
      data: {
        total: 100,
        candidates: [{ pin_id: '899000000000001', title: 'Page 1 Item', repin_count: 50 }]
      }
    };
  };
  await app.loadCandidates(false);
  assert.equal(app.candidatesOffset, 0, 'Empty page >= 2 with total > 0 must clamp offset back to last valid page');
  assert.equal(app.candidates.length, 1);
});
