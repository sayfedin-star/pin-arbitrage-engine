import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sanitizeVisualAnnotations,
  normalizeAnnotationTag,
  isAggregatedClusterPin
} from '../src/domain/pin-intelligence.mjs';
import {
  extractUsernameFromProfileUrl,
  fetchPinsBatchFromPidgets,
  formatPin,
  PIDGETS_ZERO_COOKIE_HEADERS
} from '../src/core/pinterest/pins.mjs';
import {
  ingestPinsBatch,
  syncPinAcrossAllFourPillars
} from '../src/modules/pins/repository.mjs';
import { sanitizeDossierTrajectory } from '../src/lib/math.mjs';
import {
  evaluateHydrationGuard,
  canSatisfyPinFromPidgets,
  hasCompleteStructuralDna,
  DEEP_DNA_RECHECK_WINDOW_MS,
  inspectPinsConcurrently
} from '../scripts/keyword-velocity-crawler.mjs';
import { refreshRollingWindowGainsBatch } from '../scripts/keyword-fleet.mjs';
import { getPinDetailsBodyHtml } from '../src/ui/pin-details/page-template.mjs';
import { getPulseStudioViewsHtml } from '../src/ui/pulse/pulse-views.mjs';

test('Pkg 3: sanitizeVisualAnnotations & normalizeAnnotationTag reject [object Object] and extract object names safely', () => {
  assert.equal(normalizeAnnotationTag('[object Object]'), '');
  assert.equal(normalizeAnnotationTag('object object'), '');
  assert.equal(normalizeAnnotationTag({ name: 'Creamy Chicken Pasta', url: '/ideas/creamy-chicken-pasta/' }), 'creamy chicken pasta');

  const cleaned = sanitizeVisualAnnotations([
    '[object Object]',
    { name: 'Dinner Recipes', url: '/ideas/dinner-recipes/' },
    { label: 'dinner recipes' },
    { display: 'Weeknight Meals' },
    'not-given',
    'object object',
    'a',
    'Quick Pasta'
  ]);
  assert.deepEqual(cleaned, ['Dinner Recipes', 'Weeknight Meals', 'Quick Pasta']);
});

test('Pkg 3: repository.mjs dedup merge branch never produces [object Object] and computed_batch guards cached carryover rows', async () => {
  const capturedPayloads = [];
  const capturedSqlText = [];
  const mockSql = async (strings, ...values) => {
    capturedSqlText.push(strings.join('?'));
    for (const v of values) {
      if (typeof v === 'string' && v.startsWith('[')) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) capturedPayloads.push(parsed);
        } catch (_) {}
      }
    }
    return [];
  };

  await ingestPinsBatch(mockSql, [
    {
      pin_id: '329888741477749727',
      keyword_id: 1,
      rank_position: 4,
      save_count: 13652,
      repin_count: 13601,
      was_live_scraped: false,
      from_hydration_cache: true,
      visual_annotations: [{ name: 'Christmas Nails', url: '/ideas/christmas-nails/' }, '[object Object]']
    },
    {
      pin_id: '329888741477749727',
      keyword_id: 2,
      rank_position: 9,
      save_count: 13652,
      repin_count: 13601,
      was_live_scraped: false,
      from_hydration_cache: true,
      visual_annotations: [{ label: 'Winter Nails' }, { name: 'christmas nails' }, '[object Object]']
    }
  ], { pillar: 'keyword' });

  const masterBatch = capturedPayloads.find((arr) => arr[0]?.pin_id === '329888741477749727' && Array.isArray(arr[0]?.visual_annotations));
  assert.ok(masterBatch, 'Expected master batch payload');
  assert.deepEqual(masterBatch[0].visual_annotations, ['Christmas Nails', 'Winter Nails']);
  assert.equal(masterBatch[0].is_cached_carryover, true);

  const combinedSql = capturedSqlText.join('\n');
  assert.match(combinedSql, /WHEN eb\.was_live_scraped = FALSE OR COALESCE\(eb\.is_cached_carryover, FALSE\) = TRUE THEN NULL/);
  assert.match(combinedSql, /LEFT JOIN keyword_serp_positions k_ex/);
});

test('Pkg 1 & 2: fetchPinsBatchFromPidgets uses zero-cookie headers, parses username from profile_url, preserves null saves, and flags missing pins', async () => {
  assert.equal(extractUsernameFromProfileUrl('https://www.pinterest.com/lovelykitchen/'), 'lovelykitchen');
  assert.equal(extractUsernameFromProfileUrl('https://www.pinterest.com/pin/123456/'), '');
  assert.equal(PIDGETS_ZERO_COOKIE_HEADERS.Cookie, undefined);
  assert.equal(PIDGETS_ZERO_COOKIE_HEADERS['X-Requested-With'], undefined);

  const originalFetch = globalThis.fetch;
  const seenHeaders = [];
  globalThis.fetch = async (url, init = {}) => {
    seenHeaders.push(init.headers || {});
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          pins: [
            {
              id: '329888741477749727',
              repin_count: 13601,
              aggregated_pin_data: { aggregated_stats: { saves: 13652 } },
              pinner: { full_name: 'Nail Studio', profile_url: 'https://www.pinterest.com/nailstudio/' },
              title: 'Festive Nails',
              domain: 'example.com'
            },
            {
              id: '574771971217813409',
              repin_count: 85,
              // aggregated_stats.saves intentionally omitted -> must stay null
              pinner: { full_name: 'Maker', profile_url: 'https://www.pinterest.com/makerhub/' }
            }
          ]
        }
      })
    };
  };

  try {
    const result = await fetchPinsBatchFromPidgets(
      ['329888741477749727', '574771971217813409', '999999999999999999'],
      { concurrency: 2, sleepMs: 0, headers: { Cookie: '_pinterest_sess=SHOULD_BE_STRIPPED' } }
    );

    assert.equal(seenHeaders.length, 1);
    assert.equal(seenHeaders[0].Cookie, undefined);
    assert.equal(seenHeaders[0].cookie, undefined);

    const active = result.get('329888741477749727');
    assert.equal(active.save_count, 13652);
    assert.equal(active.repin_count, 13601);
    assert.equal(active.has_explicit_saves, true);
    assert.equal(active.creator_username, 'nailstudio');
    assert.equal(active.is_missing, false);

    const noSaves = result.get('574771971217813409');
    assert.equal(noSaves.save_count, null);
    assert.equal(noSaves.has_explicit_saves, false);
    assert.equal(noSaves.repin_count, 85);

    const missing = result.get('999999999999999999');
    assert.equal(missing.is_missing, true);
    assert.equal(missing.save_count, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pkg 1 & 2: Two-Lane inspectPinsConcurrently serves complete pins via Pidgets with 0 deep calls and safely falls back on is_missing / cliff-drop / e1_ IDs', async () => {
  const nowMs = Date.now();
  const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  const oneMinAgo = new Date(nowMs - 60 * 1000).toISOString();

  const completePin = {
    pin_id: '329888741477749727',
    save_count: 12878,
    repin_count: 12829,
    created_at_pinterest: '2025-10-01T00:00:00Z',
    image_signature: 'sig123',
    visual_annotations: ['holiday nails'],
    is_hydrated: true,
    last_scraped_at: twoHoursAgo,
    crawled_at: oneMinAgo
  };

  const missingInPidgetsPin = {
    ...completePin,
    pin_id: '574771971217813409',
    save_count: 317
  };

  const encodedPin = {
    ...completePin,
    pin_id: 'e1_encoded_pin_abc'
  };

  // Strict 5-point Stage-1 contract checks
  assert.equal(
    canSatisfyPinFromPidgets(completePin, { save_count: 13652, has_explicit_saves: true, is_missing: false }),
    true
  );
  assert.equal(
    canSatisfyPinFromPidgets(completePin, { save_count: null, has_explicit_saves: false, is_missing: false }),
    false
  );
  assert.equal(
    canSatisfyPinFromPidgets(completePin, { save_count: 13652, has_explicit_saves: true, is_missing: true }),
    false
  );
  assert.equal(
    canSatisfyPinFromPidgets(completePin, { save_count: 500, has_explicit_saves: true, is_missing: false }),
    false,
    'Cliff-drop (<80% of prevSaves) must route to Stage 2'
  );
  assert.equal(
    canSatisfyPinFromPidgets(encodedPin, { save_count: 500, has_explicit_saves: true, is_missing: false }),
    false,
    'Non-numeric e1_ pin ID must route to Stage 2'
  );

  // Verify guard ignores crawled_at and routes structurally complete pin to Pidgets
  const guard = evaluateHydrationGuard(completePin, nowMs, { force: false });
  assert.equal(guard.lane, 'pidgets');

  const deepFetchedIds = [];
  const enriched = await inspectPinsConcurrently(
    [completePin, missingInPidgetsPin, encodedPin],
    { id: 1, keyword: 'nails' },
    'TestWorker',
    {
      nowMs,
      force: false,
      skipJitter: true,
      batchPidgetsFn: async (ids) => {
        assert.deepEqual(ids, ['329888741477749727', '574771971217813409']);
        return new Map([
          ['329888741477749727', {
            pin_id: '329888741477749727',
            save_count: 13652,
            repin_count: 13601,
            has_explicit_saves: true,
            has_explicit_repins: true,
            creator_username: 'nailstudio',
            is_missing: false
          }],
          ['574771971217813409', {
            pin_id: '574771971217813409',
            save_count: null,
            repin_count: null,
            has_explicit_saves: false,
            is_missing: true
          }]
        ]);
      },
      fetchPinHybridFn: async (pinId) => {
        deepFetchedIds.push(pinId);
        return {
          ok: true,
          fastPath: true,
          pin: {
            pin_id: pinId,
            saves: 1562,
            save_count: 1562,
            repins: 1500,
            repin_count: 1500,
            has_explicit_saves: true,
            has_explicit_repins: true,
            annotations: [{ name: 'Winter Nails' }, '[object Object]']
          }
        };
      }
    }
  );

  assert.equal(enriched.length, 3);
  const byId = new Map(enriched.map((p) => [p.pin_id, p]));
  assert.equal(byId.get('329888741477749727').save_count, 13652);
  assert.equal(byId.get('329888741477749727').enrichment_lane, 'pidgets');
  assert.equal(byId.get('329888741477749727').is_deleted, false);

  // Stage-2 fallback fired ONLY for is_missing + e1_ pin, never for the Stage-1 Pidgets hit
  assert.deepEqual(deepFetchedIds.sort(), ['574771971217813409', 'e1_encoded_pin_abc']);
  assert.equal(byId.get('574771971217813409').save_count, 1562);
  assert.equal(byId.get('574771971217813409').is_deleted, false);
  assert.deepEqual(byId.get('574771971217813409').visual_annotations, ['Winter Nails', 'holiday nails']);
});

test('Pkg 4: refreshRollingWindowGainsBatch reconciles delta_repins_24h and daily_repin_velocity from pins_daily_metrics', async () => {
  const updates = [];
  let callIdx = 0;
  const mockSql = async (strings, ...values) => {
    callIdx++;
    if (callIdx === 1) {
      return [{
        pin_id: '329888741477749727',
        gains_5d: null,
        gains_7d: null,
        gains_10d: null,
        gains_15d: null,
        delta_repins_24h: 0,
        daily_repin_velocity: 0
      }];
    }
    if (callIdx === 2) {
      return [
        { pin_id: '329888741477749727', recorded_date: '2026-11-19', save_count: 13652, repin_count: 13601, daily_save_velocity: 774 },
        { pin_id: '329888741477749727', recorded_date: '2026-11-18', save_count: 12878, repin_count: 12829, daily_save_velocity: 0 }
      ];
    }
    for (const v of values) {
      if (typeof v === 'string' && v.startsWith('[')) {
        updates.push(...JSON.parse(v));
      }
    }
    return [];
  };

  const count = await refreshRollingWindowGainsBatch(mockSql);
  assert.equal(count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].delta_repins_24h, 772);
  assert.equal(updates[0].daily_repin_velocity, 772);
});

test('Pkg 4b: refreshRollingWindowGainsBatch uses bigint recordset columns and rounds fractional repin deltas safely', async () => {
  const updates = [];
  const updateSqlTexts = [];
  let callIdx = 0;
  const mockSql = async (strings, ...values) => {
    callIdx++;
    if (callIdx === 1) {
      return [{
        pin_id: '329888741477749728',
        gains_5d: null,
        gains_7d: null,
        gains_10d: null,
        gains_15d: null,
        delta_repins_24h: '2.5',
        daily_repin_velocity: 'not-a-number'
      }];
    }
    if (callIdx === 2) {
      return [
        { pin_id: '329888741477749728', recorded_date: '2026-11-20', save_count: 105, repin_count: 23, daily_save_velocity: 2.5 },
        { pin_id: '329888741477749728', recorded_date: '2026-11-18', save_count: 100, repin_count: 20, daily_save_velocity: 0 }
      ];
    }
    updateSqlTexts.push(strings.join(' '));
    for (const v of values) {
      if (typeof v === 'string' && v.startsWith('[')) {
        updates.push(...JSON.parse(v));
      }
    }
    return [];
  };

  const count = await refreshRollingWindowGainsBatch(mockSql);
  assert.equal(count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].delta_repins_24h, 2);
  assert.equal(Number.isInteger(updates[0].delta_repins_24h), true);
  assert.equal(updates[0].daily_repin_velocity, 1.5);
  assert.ok(updateSqlTexts[0].includes('gains_5d bigint'), 'refreshRollingWindowGainsBatch must cast gains_5d as bigint');
  assert.ok(updateSqlTexts[0].includes('delta_repins_24h bigint'), 'refreshRollingWindowGainsBatch must cast delta_repins_24h as bigint');
});

test('Pkg 5: sanitizeDossierTrajectory zeroes Day-1 baseline velocity even on multi-day series and Pin Details UI removes duplicate reactions', () => {
  const dossier = sanitizeDossierTrajectory({
    daily_trajectory: [
      { snapshot_date: '2026-11-19', save_count: 13652, repin_count: 13601, daily_save_velocity: 774 },
      { snapshot_date: '2026-11-18', save_count: 12878, repin_count: 12829, daily_save_velocity: 12878 }
    ]
  });
  const sanitized = dossier.daily_trajectory;

  assert.equal(sanitized.length, 2);
  // Output preserves descending order (newest first); oldest baseline is at index 1
  const day1 = sanitized.find((d) => d.snapshot_date === '2026-11-18');
  const day2 = sanitized.find((d) => d.snapshot_date === '2026-11-19');
  assert.equal(day2.daily_save_velocity, 774);
  assert.equal(day1.is_baseline, true);
  assert.equal(day1.daily_save_velocity, 0);

  const html = getPinDetailsBodyHtml('329888741477749727');
  assert.ok(html.includes('formatNumber(totalComments())'), 'Expected totalComments() in Total Engagement card');
  assert.ok(!html.includes('<template x-if="totalReactions() > 0"><span>, <span x-text="totalReactions()"></span> reactions</span></template>'), 'Duplicate reactions template must be removed');
  assert.ok(html.includes("day.is_baseline ? 'Baseline'"), 'Expected Baseline velocity label for Day-1 snapshot');

  const clientAppSrc = fs.readFileSync('src/ui/pin-details/client-app.mjs', 'utf8');
  assert.ok(clientAppSrc.includes('totalComments()'), 'Expected totalComments() helper in Pin Details client app');

  // Verify Phase 1A skip_top_enrich gate in keywords/service.mjs
  const kwServiceSrc = fs.readFileSync('src/modules/keywords/service.mjs', 'utf8');
  assert.match(kwServiceSrc, /if\s*\(\s*!options\.skip_top_enrich\s*&&\s*typeof fetchPinsBatchFromPidgets === 'function'/);
});

test('Wave 7.1: formatPin prioritizes pin_join.annotations_with_links (Object Map & name->url Map) before visual_annotation', () => {
  const formattedObjMap = formatPin({
    id: '574771971217813409',
    title: 'Italian Parmesan Pasta Soup',
    aggregated_pin_data: { aggregated_stats: { saves: 1703 } },
    repin_count: 1700,
    pin_join: {
      annotations_with_links: {
        '912345601': {
          name: 'Parmesan Italian Ditalini Soup',
          url: '/ideas/parmesan-italian-ditalini-soup/912345601/'
        },
        '912345602': {
          name: 'Easy Fast Soup Recipes',
          url: '/ideas/easy-fast-soup-recipes/912345602/'
        },
        'bad': { name: '[object Object]', url: '/ideas/bad/1/' }
      },
      visual_annotation: ['Soup Recipe', 'Easy Fast Soup Recipes', 'Italian Soups']
    }
  });

  assert.equal(formattedObjMap.has_linked_annotations, true);
  assert.deepEqual(
    formattedObjMap.tags,
    ['Parmesan Italian Ditalini Soup', 'Easy Fast Soup Recipes', 'Soup Recipe', 'Italian Soups']
  );
  assert.deepEqual(formattedObjMap.annotations_with_links, [
    {
      name: 'Parmesan Italian Ditalini Soup',
      idea_id: '912345601',
      url: '/ideas/parmesan-italian-ditalini-soup/912345601/'
    },
    {
      name: 'Easy Fast Soup Recipes',
      idea_id: '912345602',
      url: '/ideas/easy-fast-soup-recipes/912345602/'
    }
  ]);

  // Also verify { "Annotation Name": "/ideas/.../12345/" } string-map shape
  const formattedUrlMap = formatPin({
    id: '951878071269307477',
    title: 'Dump And Go Crockpot Meals',
    aggregated_pin_data: { aggregated_stats: { saves: 9254 } },
    pin_join: {
      annotations_with_links: {
        'Cheap Dump And Go Crockpot': '/ideas/cheap-dump-and-go-crockpot/94881122/',
        'Cold Day Dinner Ideas Crockpot': '/ideas/cold-day-dinner-ideas-crockpot/94881123/'
      },
      visual_annotation: ['Crock Pot Ideas']
    }
  });

  assert.equal(formattedUrlMap.has_linked_annotations, true);
  assert.deepEqual(formattedUrlMap.tags.slice(0, 2), [
    'Cheap Dump And Go Crockpot',
    'Cold Day Dinner Ideas Crockpot'
  ]);
  assert.equal(formattedUrlMap.annotations_with_links[0].idea_id, '94881122');
  assert.equal(formattedUrlMap.annotations_with_links[0].url, '/ideas/cheap-dump-and-go-crockpot/94881122/');
});

test('Wave 7.2: deep_dna_checked_at stops infinite Deep loop for 14d, stamps only on verified live deep fetch, and rechecks after 14d', async () => {
  const nowMs = Date.UTC(2026, 10, 19, 16, 0, 0);
  const fiveDaysAgoIso = new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString();
  const fifteenDaysAgoIso = new Date(nowMs - 15 * 24 * 60 * 60 * 1000).toISOString();
  const twoHoursAgoIso = new Date(nowMs - 2 * 3600 * 1000).toISOString();

  assert.equal(DEEP_DNA_RECHECK_WINDOW_MS, 14 * 24 * 60 * 60 * 1000);

  const annotationlessBase = {
    pin_id: '777777777777777777',
    created_at_pinterest: '2026-09-01T00:00:00Z',
    image_signature: 'sig_no_anns',
    visual_annotations: [],
    save_count: 420,
    repin_count: 410,
    is_hydrated: true,
    creation_method: 'organic_pin',
    last_scraped_at: twoHoursAgoIso
  };

  // Never deep-checked -> must route to Deep
  assert.equal(hasCompleteStructuralDna(annotationlessBase, nowMs), false);
  assert.equal(evaluateHydrationGuard(annotationlessBase, nowMs, { force: false }).lane, 'deep');

  // Deep-checked 5 days ago (< 14d) -> accepted by Pidgets 50x fast lane
  const freshCheckedPin = {
    ...annotationlessBase,
    metadata: { deep_dna_checked_at: fiveDaysAgoIso }
  };
  assert.equal(hasCompleteStructuralDna(freshCheckedPin, nowMs), true);
  assert.equal(evaluateHydrationGuard(freshCheckedPin, nowMs, { force: false }).lane, 'pidgets');
  assert.equal(
    canSatisfyPinFromPidgets(freshCheckedPin, {
      pin_id: freshCheckedPin.pin_id,
      save_count: 435,
      has_explicit_saves: true,
      is_missing: false
    }, nowMs),
    true
  );

  // Deep-checked 15 days ago (>= 14d) -> expires and routes back to Deep
  const expiredCheckedPin = {
    ...annotationlessBase,
    metadata: { deep_dna_checked_at: fifteenDaysAgoIso }
  };
  assert.equal(hasCompleteStructuralDna(expiredCheckedPin, nowMs), false);
  assert.equal(evaluateHydrationGuard(expiredCheckedPin, nowMs, { force: false }).lane, 'deep');

  // Live deep scrape stamps deep_dna_checked_at ONLY when annotations_with_links exist OR PinResource/get was verified;
  // SSR-only HTML without linked annotations & failed PinResource, timeout/failure, and partial fallback must NOT stamp it.
  const pinsToInspect = [
    { ...annotationlessBase, pin_id: '777777777777777701', metadata: {} },
    { ...annotationlessBase, pin_id: '777777777777777702', metadata: {} },
    { ...annotationlessBase, pin_id: '777777777777777703', metadata: {} },
    { ...annotationlessBase, pin_id: '777777777777777704', metadata: {} },
    { ...annotationlessBase, pin_id: '777777777777777705', metadata: {} }
  ];

  const pinResourceCalls = [];
  const inspected = await inspectPinsConcurrently(pinsToInspect, null, 'DeepDnaTestWorker', {
    skipJitter: true,
    forceRefresh: true,
    fetchPinsBatchFromPidgetsFn: async () => new Map(),
    fetchPinHybridFn: async (pinId) => {
      if (pinId === '777777777777777701' || pinId === '777777777777777704') {
        return {
          ok: true,
          pin: {
            pin_id: pinId,
            saves: 430,
            save_count: 430,
            has_explicit_saves: true,
            repins: 418,
            repin_count: 418,
            has_explicit_repins: true,
            created_at_pinterest: '2026-09-01T00:00:00Z',
            image_signature: 'sig_no_anns',
            annotations: []
          }
        };
      }
      if (pinId === '777777777777777705') {
        return {
          ok: true,
          pin: {
            pin_id: pinId,
            saves: 435,
            save_count: 435,
            has_explicit_saves: true,
            repins: 420,
            repin_count: 420,
            has_explicit_repins: true,
            created_at_pinterest: '2026-09-01T00:00:00Z',
            image_signature: 'sig_linked',
            has_linked_annotations: true,
            annotations: [{ name: 'Easy Soup', idea_id: '912345601', url: '/ideas/easy-soup/912345601/' }],
            annotations_with_links: [{ name: 'Easy Soup', idea_id: '912345601', url: '/ideas/easy-soup/912345601/' }]
          }
        };
      }
      if (pinId === '777777777777777702') {
        return { ok: false, error: 'ETIMEDOUT timeout' };
      }
      return {
        ok: true,
        isPartialFallback: true,
        pin: {
          pin_id: pinId,
          saves: 420,
          save_count: 420,
          has_explicit_saves: true,
          annotations: []
        }
      };
    },
    fetchPinFromPinResourceFn: async (pinId) => {
      pinResourceCalls.push(pinId);
      if (pinId === '777777777777777701') {
        // Verified PinResource/get lookup returning genuinely 0 annotations
        return { pin_id: pinId, annotations: [], annotations_with_links: [] };
      }
      // Pin 777777777777777704 fails PinResource/get -> must NOT stamp deep_dna_checked_at
      return null;
    },
    fetchPinFromPinterestFn: async () => ({ ok: false, error: 'ETIMEDOUT timeout' })
  });

  const verifiedResourcePin = inspected.find((p) => p.pin_id === '777777777777777701');
  const failedPin = inspected.find((p) => p.pin_id === '777777777777777702');
  const partialPin = inspected.find((p) => p.pin_id === '777777777777777703');
  const ssrOnlyUnverifiedPin = inspected.find((p) => p.pin_id === '777777777777777704');
  const linkedPin = inspected.find((p) => p.pin_id === '777777777777777705');

  assert.ok(verifiedResourcePin?.extra_meta?.deep_dna_checked_at, 'Verified PinResource/get check must stamp deep_dna_checked_at');
  assert.ok(!Number.isNaN(new Date(verifiedResourcePin.extra_meta.deep_dna_checked_at).getTime()));
  assert.ok(linkedPin?.extra_meta?.deep_dna_checked_at, 'Pin with annotations_with_links must stamp deep_dna_checked_at');
  assert.ok(!pinResourceCalls.includes('777777777777777705'), 'Pin already containing annotations_with_links must skip extra PinResource call');
  assert.equal(ssrOnlyUnverifiedPin?.extra_meta?.deep_dna_checked_at, null, 'SSR-only HTML without linked annotations & failed PinResource must NOT stamp deep_dna_checked_at');
  assert.equal(failedPin, undefined, 'Timed-out deep fetch must not return a stamped record');
  assert.equal(partialPin?.extra_meta?.deep_dna_checked_at, null, 'Partial fallback deep fetch must NOT stamp deep_dna_checked_at');
});

test('Wave 7.3: Live Deep Sync overwrites visual_annotations with linked annotations and persists metadata', async () => {
  const capturedPayloads = [];
  const mockSql = async (strings, ...values) => {
    for (const v of values) {
      if (typeof v === 'string' && v.startsWith('[')) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) capturedPayloads.push(parsed);
        } catch (_) {}
      }
    }
    return [];
  };
  mockSql.begin = async (fn) => fn(mockSql);

  await syncPinAcrossAllFourPillars({
    sql: mockSql,
    pinId: '574771971217813409',
    scrapedPin: {
      pin_id: '574771971217813409',
      title: 'Italian Parmesan Pasta Soup',
      saves: 1703,
      save_count: 1703,
      has_explicit_saves: true,
      repins: 1700,
      repin_count: 1700,
      has_explicit_repins: true,
      has_linked_annotations: true,
      annotations: [
        { name: 'Parmesan Italian Ditalini Soup', idea_id: '912345601', url: '/ideas/parmesan-italian-ditalini-soup/912345601/' },
        { name: 'Easy Fast Soup Recipes', idea_id: '912345602', url: '/ideas/easy-fast-soup-recipes/912345602/' }
      ],
      annotations_with_links: [
        { name: 'Parmesan Italian Ditalini Soup', idea_id: '912345601', url: '/ideas/parmesan-italian-ditalini-soup/912345601/' },
        { name: 'Easy Fast Soup Recipes', idea_id: '912345602', url: '/ideas/easy-fast-soup-recipes/912345602/' }
      ]
    }
  });

  const masterBatch = capturedPayloads.find((arr) => arr[0]?.pin_id === '574771971217813409' && Array.isArray(arr[0]?.visual_annotations));
  assert.ok(masterBatch, 'Expected master batch upsert from Live Deep Sync');
  assert.deepEqual(masterBatch[0].visual_annotations, ['Parmesan Italian Ditalini Soup', 'Easy Fast Soup Recipes']);
  assert.equal(masterBatch[0].metadata.annotations_with_links.length, 2);
  assert.equal(masterBatch[0].metadata.annotations_with_links[0].idea_id, '912345601');
  assert.ok(masterBatch[0].metadata.deep_dna_checked_at);
});

test('Wave 7.4: isAggregatedClusterPin dual condition, Pulse UI parity, crawler SQL hygiene & topToEnrich repin velocity sync', () => {
  // True: vel >= 50, delta_repins/vel < 0.10, repin_count/save_count < 0.25 (works regardless of domain)
  assert.equal(isAggregatedClusterPin({
    domain: 'uploaded by user',
    daily_save_velocity: 1111,
    delta_repins_24h: 29,
    save_count: 4500,
    repin_count: 180
  }), true);
  assert.equal(isAggregatedClusterPin({
    domain: 'example.com',
    daily_save_velocity: 120,
    delta_repins_24h: 4,
    save_count: 1000,
    repin_count: 50
  }), true);

  // False: 1-day snapshot jitter where cumulative repin_count/save_count is healthy (>= 0.25)
  assert.equal(isAggregatedClusterPin({
    daily_save_velocity: 200,
    delta_repins_24h: 5,
    save_count: 5000,
    repin_count: 4950
  }), false);

  // False: velocity < 50 or missing repin_count
  assert.equal(isAggregatedClusterPin({
    daily_save_velocity: 40,
    delta_repins_24h: 0,
    save_count: 500,
    repin_count: 10
  }), false);
  assert.equal(isAggregatedClusterPin({
    daily_save_velocity: 500,
    delta_repins_24h: 0,
    save_count: 5000,
    repin_count: null
  }), false);

  const pulseViewsHtml = getPulseStudioViewsHtml();
  assert.ok(pulseViewsHtml.includes('isAggregatedClusterPin(pin)'), 'Expected Aggregated Cluster check in Pulse table');
  assert.ok(pulseViewsHtml.includes('Aggregated Cluster'), 'Expected Aggregated Cluster micro-label in Pulse views');

  // Verify Pulse client-app unifies save_count ?? saves and repin_count ?? repins
  const pulseClientSrc = fs.readFileSync('src/ui/pulse/pulse-client-app.mjs', 'utf8');
  assert.match(pulseClientSrc, /pin\.saves/, 'Pulse client isAggregatedClusterPin must fall back to pin.saves');
  assert.match(pulseClientSrc, /pin\.repins/, 'Pulse client isAggregatedClusterPin must fall back to pin.repins');

  // Verify keyword-velocity-crawler Mode A/B/C all select baseline_day_saves & baseline_day_date and guard displaced updated_at
  const kwCrawlerSrc = fs.readFileSync('scripts/keyword-velocity-crawler.mjs', 'utf8');
  const baselineSavesMatches = kwCrawlerSrc.match(/AS baseline_day_saves/g) || [];
  const baselineDateMatches = kwCrawlerSrc.match(/AS baseline_day_date/g) || [];
  assert.ok(baselineSavesMatches.length >= 3, `Expected baseline_day_saves in Mode A, Mode B, and Mode C (found ${baselineSavesMatches.length})`);
  assert.ok(baselineDateMatches.length >= 3, `Expected baseline_day_date in Mode A, Mode B, and Mode C (found ${baselineDateMatches.length})`);
  assert.match(kwCrawlerSrc, /ksp\.vacuum_opportunity_score IS DISTINCT FROM/, 'flushBatchToHub must avoid no-op updated_at churn on cached displaced rows');

  // Verify src/modules/keywords/service.mjs topToEnrich syncs daily_repin_velocity with isRepinHydrationJump guard
  const kwServiceSrc = fs.readFileSync('src/modules/keywords/service.mjs', 'utf8');
  const repinJumpGuards = kwServiceSrc.match(/isRepinHydrationJump\(/g) || [];
  const repinVelSyncs = kwServiceSrc.match(/p\.daily_repin_velocity = computedRepinDelta;/g) || [];
  assert.ok(repinJumpGuards.length >= 2, 'Both Pidgets pre-enrich and topToEnrich must guard against repin hydration jumps');
  assert.ok(repinVelSyncs.length >= 2, 'Both Pidgets pre-enrich and topToEnrich must sync daily_repin_velocity alongside delta_repins_24h');

  // Verify all 5 workflow files enable FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 and cache refresh logs HTTP status
  for (const wf of [
    '.github/workflows/ci.yml',
    '.github/workflows/keyword-intelligence-velocity.yml',
    '.github/workflows/crawler-pipeline.yml',
    '.github/workflows/related-pins-crawler.yml',
    '.github/workflows/newborn-hunter.yml'
  ]) {
    const content = fs.readFileSync(wf, 'utf8');
    assert.match(content, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/, `Expected Node 24 opt-in in ${wf}`);
  }
  for (const wf of [
    '.github/workflows/keyword-intelligence-velocity.yml',
    '.github/workflows/crawler-pipeline.yml'
  ]) {
    const content = fs.readFileSync(wf, 'utf8');
    assert.match(content, /API_SECRET_KEY secret is not configured/, `Expected explicit missing-secret warning in ${wf}`);
    assert.match(content, /returned HTTP \$\{HTTP_CODE\}/, `Expected HTTP code logging in ${wf}`);
  }
});


