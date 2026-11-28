/**
 * Behavioral Unit Tests — Master Architectural SSOT Refactoring & Simplification
 *
 * Strictly behavioral (ZERO fs.readFileSync source-regex checks):
 *  1. Unified Pinterest Session Cookie SSOT (`resolveActivePinterestCookie` + WS 1 vs WS 2 isolation)
 *  2. Strict Numeric Snowflake Pin ID Gate (`extractCanonicalNumericPinId`, `formatPin`, `ingestPinsBatch`, `upsertCompetitorPins`)
 *  3. Keyword Crawl Settings downward quota/page sync (`updateAppSettings`, `updateKeywordSettings`)
 *  4. Creator Hub SSOT unification (live 24h saves gain, `top_urls_count`, strict third-party Community Curators isolation, `10M+` ceiling formatter)
 *  5. Crawl Intelligence & Depth Settings modal HTML excludes duplicate Section 4 cookie box & Creator UI excludes removed filter controls
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveActivePinterestCookie,
  saveWorkspaceCookie
} from '../src/modules/workspaces/service.mjs';
import {
  NUMERIC_PIN_ID_REGEX,
  extractCanonicalNumericPinId,
  formatPin
} from '../src/core/pinterest/pin-formatter.mjs';
import {
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings
} from '../src/modules/keywords/settings.mjs';
import { ingestPinsBatch } from '../src/modules/pins/repository.mjs';
import { upsertCompetitorPins } from '../src/modules/creators/creator-ingest.mjs';
import { getCompetitorDetail } from '../src/modules/creators/creator-analytics.mjs';
import { getKeywordDrawersAndModalsHtml } from '../src/ui/keywords-drawers.mjs';
import { renderCreatorsProfilePins } from '../src/ui/dashboard/creators-profile-pins.mjs';
import { getDashboardCreatorsHtml } from '../src/ui/dashboard/dashboard-creators.mjs';

function makeMockSql(handler) {
  const fn = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join('?') : String(strings);
    return handler(query, values);
  };
  fn.json = (v) => v;
  fn.begin = async (cb) => cb(fn);
  return fn;
}

// ---------------------------------------------------------------------------
// 1. Unified Pinterest Session Cookie SSOT (Zone A)
// ---------------------------------------------------------------------------
test('resolveActivePinterestCookie resolves workspace_settings SSOT with strict WS 2+ isolation', async () => {
  const store = new Map([
    [1, '_auth=1; _pinterest_sess="ws1_active_zone_a_cookie_token_12345"'],
    [2, '']
  ]);
  const sql = makeMockSql((q, vals) => {
    if (q.includes('FROM workspace_settings') && q.includes('pinterest_cookie_enc')) {
      const wid = Number(vals[0]);
      const val = store.get(wid) || null;
      return val ? [{ pinterest_cookie_enc: val }] : [];
    }
    return [];
  });

  // WS 1 returns its DB vault cookie
  const ws1 = await resolveActivePinterestCookie(sql, {
    workspaceId: 1,
    env: { PINTEREST_COOKIE: '_pinterest_sess="env_fallback_cookie_value"' }
  });
  assert.equal(ws1.hasCookie, true);
  assert.equal(ws1.source, 'workspace:1:pinterest_cookie_enc');
  assert.ok(ws1.formattedCookie.includes('ws1_active_zone_a_cookie_token_12345'));

  // WS 2 has no cookie and MUST NEVER inherit WS 1 or env.PINTEREST_COOKIE
  const ws2 = await resolveActivePinterestCookie(sql, {
    workspaceId: 2,
    env: { PINTEREST_COOKIE: '_pinterest_sess="env_fallback_cookie_value"' },
    runtimeCookie: '_pinterest_sess="runtime_cookie_value"'
  });
  assert.equal(ws2.hasCookie, false);
  assert.equal(ws2.formattedCookie, '');
  assert.equal(ws2.source, 'none');

  // WS 1 falls back to env.PINTEREST_COOKIE ONLY when DB vault is empty
  store.set(1, '');
  const ws1Fallback = await resolveActivePinterestCookie(sql, {
    workspaceId: 1,
    env: { PINTEREST_COOKIE: 'TWC9PS_RAW_SESS_TOKEN_99999999' }
  });
  assert.equal(ws1Fallback.hasCookie, true);
  assert.equal(ws1Fallback.source, 'env:PINTEREST_COOKIE');
  assert.ok(ws1Fallback.formattedCookie.includes('_pinterest_sess='));
  assert.ok(ws1Fallback.formattedCookie.includes('TWC9PS_RAW_SESS_TOKEN_99999999'));
});

test('saveWorkspaceCookie writes strictly to workspace_settings and never echoes raw cookie', async () => {
  const executed = [];
  const sql = makeMockSql((q, vals) => {
    executed.push({ q, vals });
    return [];
  });

  const secret = '_auth=1; _pinterest_sess="super_secret_token_never_echoed"';
  const res = await saveWorkspaceCookie(sql, 1, secret);
  assert.equal(res.has_cookie, true);
  assert.equal(res.is_configured, true);
  assert.equal(res.preview, '[CONFIGURED]');
  assert.equal(JSON.stringify(res).includes('super_secret_token_never_echoed'), false);
  assert.equal(executed.some((e) => e.q.includes('INSERT INTO workspace_settings')), true);
  assert.equal(executed.some((e) => e.q.includes('app_settings')), false);
});

// ---------------------------------------------------------------------------
// 2. Strict Numeric Snowflake Pin ID Gate (Zero e1_* Ingestion)
// ---------------------------------------------------------------------------
test('extractCanonicalNumericPinId & formatPin drop obfuscated e1_* IDs and preserve authentic numeric IDs', () => {
  assert.equal(NUMERIC_PIN_ID_REGEX.test('1028861477393685945'), true);
  assert.equal(NUMERIC_PIN_ID_REGEX.test('e1_AfqPShx001d0p2T95e8aAysoAMc2z'), false);

  // Pure obfuscated e1_ pin is dropped cleanly
  const poisonedRaw = {
    id: 'e1_AfqPShx001d0p2T95e8aAysoAMc2z',
    title: 'Poisoned Unauthenticated Pin',
    save_count: 8027
  };
  assert.equal(extractCanonicalNumericPinId(poisonedRaw), null);
  assert.equal(formatPin(poisonedRaw), null);

  // If a real canonical numeric ID exists in origin_pin_id, extractCanonicalNumericPinId recovers it
  const recoverableRaw = {
    id: 'e1_AfqPShx001d0p2T95e8aAysoAMc2z',
    origin_pin_id: '1028861477393685945',
    title: 'Authentic Crockpot Pin',
    aggregated_pin_data: { aggregated_stats: { saves: 21392 } }
  };
  assert.equal(extractCanonicalNumericPinId(recoverableRaw), '1028861477393685945');
  const formatted = formatPin(recoverableRaw);
  assert.ok(formatted);
  assert.equal(formatted.pin_id, '1028861477393685945');
});

test('ingestPinsBatch and upsertCompetitorPins reject e1_* poisoned pins before writing to DB', async () => {
  const insertedPinIds = [];
  const sql = makeMockSql((q, vals) => {
    if (q.includes('INSERT INTO universal_master_pins') || q.includes('INSERT INTO competitor_board_pins')) {
      for (const v of vals) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === 'object' && item.pin_id) insertedPinIds.push(item.pin_id);
          }
        }
      }
      return [];
    }
    if (q.includes('FROM competitor_profiles')) {
      return [{ id: 331, username: 'spiceupbites', website_url: 'https://spiceupbites.com' }];
    }
    return [];
  });

  const batchRes = await ingestPinsBatch(sql, [
    { pin_id: 'e1_AfqPShx001d0p2T95e8aAysoAMc2z', title: 'Bad E1 Pin', saves: 5000 },
    { pin_id: '1028861477393685945', title: 'Good Numeric Pin', saves: 21392 }
  ]);
  assert.equal(batchRes.ok, true);
  assert.equal(insertedPinIds.includes('e1_AfqPShx001d0p2T95e8aAysoAMc2z'), false);

  const compRes = await upsertCompetitorPins(sql, 331, [
    { pin_id: 'e1_AfqPShxHD3EcVCMdGxOPvB84rW', title: 'Bad E1 Creator Pin', saves: 5189 }
  ]);
  assert.equal(compRes, 0);
  assert.equal(insertedPinIds.includes('e1_AfqPShxHD3EcVCMdGxOPvB84rW'), false);
});

// ---------------------------------------------------------------------------
// 3. Keyword Crawl Settings Downward Quota/Page Sync
// ---------------------------------------------------------------------------
test('updateAppSettings shrinks default_crawl_pages cleanly when max_serp_pins drops from 250 to 20', async () => {
  const kvStore = new Map([
    ['keyword_crawl_settings', {
      default_max_pins: 250,
      max_serp_pins: 250,
      default_crawl_pages: 10,
      enable_serp_harvest: true
    }]
  ]);
  const updatedKeywordParams = [];

  const sql = makeMockSql((q, vals) => {
    if (q.includes('SELECT value FROM app_settings')) {
      const key = vals[0];
      const val = kvStore.get(key);
      return val ? [{ value: val }] : [];
    }
    if (q.includes('INSERT INTO app_settings')) {
      const key = vals[0];
      const parsed = typeof vals[1] === 'string' ? JSON.parse(vals[1]) : vals[1];
      kvStore.set(key, parsed);
      return [];
    }
    if (q.includes('UPDATE tracked_keywords')) {
      updatedKeywordParams.push({ q, vals });
      return [];
    }
    return [];
  });

  const updated = await updateAppSettings(sql, {
    max_serp_pins: 20,
    apply_to_all: true
  }, { workspaceId: 1 });

  assert.equal(updated.max_serp_pins, 20);
  assert.equal(updated.default_max_pins, 20);
  assert.equal(updated.default_crawl_pages, 1);
  assert.equal(updated.pinterest_cookie, '');
  assert.equal(updatedKeywordParams.length >= 1, true);
  assert.equal(updatedKeywordParams[0].vals[0], 20);
  assert.equal(updatedKeywordParams[0].vals[1], 1);

  // Verify updateKeywordSettings also shrinks crawl_pages_limit cleanly downward
  const kwSql = makeMockSql((q, vals) => {
    if (q.includes('UPDATE tracked_keywords')) {
      return [{ id: 42, keyword: 'cranberry sauce', crawl_pages_limit: vals[0], inspection_mode: vals[1], target_pin_count: vals[2] }];
    }
    return [];
  });
  const kwRes = await updateKeywordSettings(kwSql, 42, { target_pin_count: 20 });
  assert.equal(kwRes.target_pin_count, 20);
  assert.equal(kwRes.crawl_pages_limit, 1);

  // Verify getAppSettings is workspace-scoped and never leaks raw cookie
  const ws2Settings = await getAppSettings(sql, { workspaceId: 2 });
  assert.equal(ws2Settings.pinterest_cookie, '');
});

// ---------------------------------------------------------------------------
// 4. Creator Hub SSOT Detail (Live 24H SAVES GAIN + top_urls_count + Zero Split-Brain)
// ---------------------------------------------------------------------------
test('getCompetitorDetail computes live 24H SAVES GAIN and top_urls_count directly from unified official pins', async () => {
  const seenQueries = [];
  const sql = makeMockSql((q) => {
    seenQueries.push(q);
    if (q.includes('FROM competitor_profiles WHERE id =')) {
      return [{
        id: 331,
        username: 'spiceupbites',
        display_name: 'spiceupbites',
        website_url: 'https://spiceupbites.com',
        monthly_reach: 6840935,
        profile_views: 10000001,
        follower_count: 1079,
        total_pins: 14459,
        total_boards: 271,
        account_type: 'competitor'
      }];
    }
    if (q.includes('FROM competitor_boards cb')) {
      return [{ id: 1, competitor_id: 331, board_id: 'b1', name: 'Crockpot Recipes', pin_count: 50 }];
    }
    if (q.includes('FROM competitor_history_snapshots')) {
      return [
        { id: 1, competitor_id: 331, monthly_reach: 6820127, profile_views: 10000001, follower_count: 1073, total_pins: 14433, recorded_date: '2026-11-27', metadata: {} },
        { id: 2, competitor_id: 331, monthly_reach: 6840935, profile_views: 10000001, follower_count: 1079, total_pins: 14459, recorded_date: '2026-11-28', metadata: {} }
      ];
    }
    if (q.includes('live_delta_saves_24h')) {
      return [{
        total_catalog_pins: 32,
        external_pins_count: 0,
        total_saves: 28714,
        external_saves: 0,
        total_repins: 19400,
        total_shares: 120,
        live_delta_saves_24h: 202,
        pins_with_delta_saves: 14,
        live_delta_repins_24h: 44,
        pins_with_delta_repins: 10,
        winning_pins_count: 12,
        official_urls_count: 27,
        span_days: 90
      }];
    }
    if (q.includes('ecosystem_unique_urls')) {
      return [{
        curator_pins: 23,
        curator_saves: 4100,
        ecosystem_total_pins: 55,
        ecosystem_total_saves: 32814,
        ecosystem_unique_urls: 41
      }];
    }
    return [];
  });

  const detail = await getCompetitorDetail(sql, 331);
  assert.equal(detail.engagement.delta_saves_24h, 202);
  assert.equal(detail.engagement.delta_repins_24h, 44);
  assert.equal(detail.top_urls_count, 41);
  assert.equal(detail.domain_ecosystem.official_pins, 32);
  assert.equal(detail.domain_ecosystem.curator_pins, 23);

  // Confirm ZERO legacy split-brain NOT EXISTS (SELECT 1 FROM competitor_board_pins ...) clauses were executed
  for (const q of seenQueries) {
    assert.equal(q.includes('NOT EXISTS (SELECT 1 FROM competitor_board_pins'), false);
  }
});

// ---------------------------------------------------------------------------
// 5. UI Template Cleanups (Zero Duplicate Cookie Box & Zero Removed Filter Controls)
// ---------------------------------------------------------------------------
test('UI renderers exclude Section 4 duplicate cookie UI, High Velocity/Articles Only buttons, and Articles Only rules checkbox', () => {
  const drawersHtml = getKeywordDrawersAndModalsHtml();
  assert.equal(drawersHtml.includes('4. PINTEREST SESSION COOKIE'), false);
  assert.equal(drawersHtml.includes('savePinterestCookieSetting'), false);

  const pinsHtml = renderCreatorsProfilePins();
  assert.equal(pinsHtml.includes('High Velocity'), false);
  assert.equal(pinsHtml.includes('Articles Only'), false);

  const creatorViewHtml = getDashboardCreatorsHtml();
  assert.equal(creatorViewHtml.includes('Exclude E-commerce Products'), false);
  assert.equal(creatorViewHtml.includes('creatorRules.articles_only'), false);
  assert.equal(creatorViewHtml.includes('formatCeilingMetric('), true);
});
