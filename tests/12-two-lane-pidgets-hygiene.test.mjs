import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sanitizeVisualAnnotations,
  normalizeAnnotationTag
} from '../src/domain/pin-intelligence.mjs';
import {
  extractUsernameFromProfileUrl,
  fetchPinsBatchFromPidgets,
  PIDGETS_ZERO_COOKIE_HEADERS
} from '../src/core/pinterest/pins.mjs';
import { ingestPinsBatch } from '../src/modules/pins/repository.mjs';
import { sanitizeDossierTrajectory } from '../src/lib/math.mjs';
import {
  evaluateHydrationGuard,
  canSatisfyPinFromPidgets,
  inspectPinsConcurrently
} from '../scripts/keyword-velocity-crawler.mjs';
import { refreshRollingWindowGainsBatch } from '../scripts/keyword-fleet.mjs';
import { getPinDetailsBodyHtml } from '../src/ui/pin-details/page-template.mjs';

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
  assert.deepEqual(byId.get('574771971217813409').visual_annotations, ['holiday nails', 'Winter Nails']);
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
