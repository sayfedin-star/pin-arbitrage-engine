import test from 'node:test';
import assert from 'node:assert/strict';

import { createFastifyApp } from '../src/server.mjs';
import {
  getStandardPinterestHeaders,
  PinterestCircuitBreaker
} from '../src/core/pinterest/client.mjs';
import { PINTEREST_CEILING_VALUE } from '../src/core/pinterest/pins.mjs';
import { RESERVED_KEYWORD_SLUGS } from '../src/http/security-and-response.mjs';
import {
  RESERVED_PINTEREST_PATHS,
  normalizePinterestUsername
} from '../src/modules/creators/competitors-crud.mjs';

import {
  COOKIE_ZONES,
  NewbornCookieRouter,
  formatAuthSessionCookie,
  resolveUrlCookieZone,
  extractPwsInitialProps,
  collectPinsFromSsrTree
} from '../src/modules/newborn/cookie-router.mjs';
import {
  DEFAULT_NEWBORN_SETTINGS,
  normalizeNewbornSettings,
  evaluateAutomationSchedule,
  getNewbornSettings,
  updateNewbornSettings,
  patchNewbornSettings,
  resetNewbornSettings,
  createNewbornRuleProfile,
  listNewbornRuleProfiles,
  updateNewbornRuleProfile,
  deleteNewbornRuleProfile,
  resolveEffectiveNewbornSettings,
  saveNewbornCookie,
  getNewbornCookieStatus,
  clearNewbornCookie
} from '../src/modules/newborn/settings.mjs';
import {
  extractUsernameFromProfileUrl,
  harvestGrowingTrendsSurface,
  harvestZeroQueryPopularSurface,
  harvestPinSerpWithCapsulesSurface,
  harvestFreshBoardsSurface,
  harvestBoardFeedSurface,
  harvestBoardMoreIdeasSurface,
  harvestIdeasHubSurface,
  harvestRelatedPinSnowballSurface,
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from '../src/modules/newborn/surfaces.mjs';
import {
  classifyPinProvenance,
  evaluateCandidateQualification,
  scoreNewbornCandidate,
  scoreRookieCreator,
  synthesizeNewbornCrossoverBlueprint,
  buildNewbornCrossoverMatrix
} from '../src/modules/newborn/intelligence.mjs';
import {
  runNewbornDiscovery,
  pollNewbornWatchlist,
  promoteNewbornCandidates
} from '../src/modules/newborn/service.mjs';
import { runKeywordFleetDispatch } from '../scripts/keyword-fleet.mjs';
import {
  fetchStandaloneNewbornAnchorsForWorker,
  markNewbornAnchorsCrawled
} from '../scripts/keyword-velocity-crawler.mjs';

/**
 * Lightweight stateful in-memory SQL mock supporting Newborn tables, `app_settings`,
 * and SSOT promotion tables (`universal_master_pins`, `pins_daily_metrics`, `newborn_daily_anchors`,
 * `tracked_keywords`, `keyword_folder_items`, `keyword_serp_positions`, `cluster_seeds`,
 * `competitor_profiles`, `competitor_history_snapshots`, `folder_competitor_items`).
 */
function createStatefulNewbornSqlMock() {
  const state = {
    appSettings: new Map(),
    profiles: new Map([
      [1, {
        id: 1,
        slug: 'default-golden-breakout',
        name: 'Default Golden Breakout',
        description: 'Default profile',
        is_default: true,
        is_active: true,
        folder_id: null,
        surfaces_config: {},
        qualification_config: { age_window_preset: '30d', max_age_days: 30 },
        automation_config: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }]
    ]),
    nextProfileId: 2,
    runs: new Map(),
    nextRunId: 1,
    candidates: new Map(),
    candidateSnapshots: new Map(),
    rookies: new Map(),
    anchors: new Map(),
    masterPins: new Map(),
    dailyMetrics: new Map(),
    trackedKeywords: new Map(),
    nextKeywordId: 1,
    folderItems: [],
    serpPositions: new Map(),
    clusterSeeds: new Map(),
    competitors: new Map(),
    nextCompetitorId: 1,
    competitorSnapshots: new Map(),
    folderCompetitorItems: []
  };

  const parseJsonArg = (val) => {
    if (!val) return [];
    if (typeof val === 'string') return JSON.parse(val);
    return val;
  };

  const sql = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join(' ') : String(strings);
    const q = query.replace(/\s+/g, ' ').trim();

    // app_settings
    if (/INSERT INTO app_settings/i.test(q)) {
      const key = String(values[0]);
      const val = typeof values[1] === 'string' ? JSON.parse(values[1]) : values[1];
      const now = new Date().toISOString();
      state.appSettings.set(key, { key, value: val, updated_at: now });
      return [{ updated_at: now }];
    }
    if (/DELETE FROM app_settings/i.test(q)) {
      const key = String(values[0]);
      state.appSettings.delete(key);
      return [];
    }
    if (/SELECT key, value(?:, updated_at)? FROM app_settings/i.test(q)) {
      if (q.includes('WHERE key =')) {
        const key = String(values[0]);
        const row = state.appSettings.get(key);
        return row ? [row] : [];
      }
      const out = [];
      for (const k of ['newborn_pinterest_cookie', 'pinterest_cookie', 'keyword_crawl_settings']) {
        if (state.appSettings.has(k)) out.push(state.appSettings.get(k));
      }
      return out;
    }

    // newborn_rule_profiles
    if (/UPDATE newborn_rule_profiles SET is_default = FALSE/i.test(q)) {
      for (const p of state.profiles.values()) p.is_default = false;
      return [];
    }
    if (/INSERT INTO newborn_rule_profiles/i.test(q)) {
      const [slug, name, description, is_default, is_active, folder_id, sCfg, qCfg, aCfg] = values;
      let existing = Array.from(state.profiles.values()).find((p) => p.slug === slug);
      const id = existing ? existing.id : state.nextProfileId++;
      const row = {
        id,
        slug,
        name,
        description,
        is_default: Boolean(is_default),
        is_active: Boolean(is_active),
        folder_id: folder_id ?? null,
        surfaces_config: parseJsonArg(sCfg),
        qualification_config: parseJsonArg(qCfg),
        automation_config: parseJsonArg(aCfg),
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.profiles.set(id, row);
      return [row];
    }
    if (/UPDATE newborn_rule_profiles SET/i.test(q)) {
      const [name, description, is_default, is_active, folder_id, sCfg, qCfg, aCfg, id] = values;
      const existing = state.profiles.get(Number(id));
      if (!existing) return [];
      const updated = {
        ...existing,
        name,
        description,
        is_default: Boolean(is_default),
        is_active: Boolean(is_active),
        folder_id: folder_id ?? null,
        surfaces_config: parseJsonArg(sCfg),
        qualification_config: parseJsonArg(qCfg),
        automation_config: parseJsonArg(aCfg),
        updated_at: new Date().toISOString()
      };
      state.profiles.set(Number(id), updated);
      return [updated];
    }
    if (/DELETE FROM newborn_rule_profiles WHERE id =/i.test(q)) {
      state.profiles.delete(Number(values[0]));
      return [];
    }
    if (/SELECT \* FROM newborn_rule_profiles/i.test(q)) {
      if (q.includes('WHERE id =')) {
        const p = state.profiles.get(Number(values[0]));
        return p ? [p] : [];
      }
      if (q.includes('WHERE slug =')) {
        const p = Array.from(state.profiles.values()).find((x) => x.slug === values[0]);
        return p ? [p] : [];
      }
      let list = Array.from(state.profiles.values());
      if (q.includes('is_active = TRUE')) list = list.filter((p) => p.is_active);
      return list.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.id - b.id);
    }

    // newborn_runs
    if (/INSERT INTO newborn_runs/i.test(q)) {
      const id = state.nextRunId++;
      const row = {
        id,
        run_type: values[0] || 'discovery',
        status: 'running',
        profile_id: values[1] ?? null,
        started_at: new Date().toISOString()
      };
      state.runs.set(id, row);
      return [{ id }];
    }
    if (/UPDATE newborn_runs/i.test(q)) {
      const id = Number(values[values.length - 1]);
      const prev = state.runs.get(id) || { id };
      state.runs.set(id, { ...prev, status: 'completed', completed_at: new Date().toISOString() });
      return [];
    }
    if (/FROM newborn_runs/i.test(q)) {
      return Array.from(state.runs.values()).reverse();
    }

    // newborn_candidates
    if (/INSERT INTO newborn_candidates/i.test(q)) {
      const records = parseJsonArg(values[0]);
      for (const r of records) {
        const prev = state.candidates.get(r.pin_id);
        const stage = (prev && (prev.stage === 'promoted' || prev.stage === 'discarded'))
          ? prev.stage
          : r.stage;
        state.candidates.set(r.pin_id, {
          ...(prev || {}),
          ...r,
          stage,
          first_seen_at: prev?.first_seen_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      return [];
    }
    if (/INSERT INTO newborn_candidate_snapshots/i.test(q)) {
      const records = parseJsonArg(values[0]);
      for (const s of records) {
        state.candidateSnapshots.set(`${s.pin_id}:${s.recorded_date}`, { ...s });
      }
      return [];
    }
    if (/UPDATE newborn_candidates SET stage = 'promoted'/i.test(q)) {
      const destinations = parseJsonArg(values[0]);
      const ids = values[1] || [];
      for (const pid of ids) {
        const cur = state.candidates.get(String(pid));
        if (cur) {
          cur.stage = 'promoted';
          cur.promoted_at = new Date().toISOString();
          cur.promoted_destinations = destinations;
        }
      }
      return [];
    }
    if (/UPDATE newborn_candidates SET stage =/i.test(q)) {
      const nextStage = values[0];
      const ids = values[values.length - 1] || [];
      const updated = [];
      for (const pid of ids) {
        const cur = state.candidates.get(String(pid));
        if (cur) {
          cur.stage = nextStage;
          updated.push({ pin_id: cur.pin_id, stage: nextStage });
        }
      }
      return updated;
    }
    if (/DELETE FROM newborn_candidates/i.test(q)) {
      const ids = values[0] || [];
      const deleted = [];
      for (const pid of ids) {
        if (state.candidates.delete(String(pid))) deleted.push({ pin_id: String(pid) });
      }
      return deleted;
    }
    if (/SELECT COUNT\(\*\)::int AS total_candidates[\s\S]*FROM newborn_candidates/i.test(q)) {
      const all = Array.from(state.candidates.values());
      const rks = Array.from(state.rookies.values());
      return [{
        total_candidates: all.length,
        discovered_count: all.filter((c) => c.stage === 'discovered').length,
        watchlist_count: all.filter((c) => c.stage === 'watchlist').length,
        promoted_count: all.filter((c) => c.stage === 'promoted').length,
        discarded_count: all.filter((c) => c.stage === 'discarded').length,
        golden_pins_count: all.filter((c) => c.is_golden_pin && c.stage !== 'discarded').length,
        linkless_vacuum_count: all.filter((c) => c.is_linkless && c.stage !== 'discarded').length,
        rookie_outliers_count: all.filter((c) => c.is_rookie_outlier && c.stage !== 'discarded').length,
        avg_golden_score: 78.5,
        rookie_accounts_count: rks.length,
        rookie_watchlist_count: rks.filter((r) => r.stage === 'watchlist').length,
        rookie_promoted_count: rks.filter((r) => r.stage === 'promoted').length,
        active_daily_anchors_count: Array.from(state.anchors.values()).filter((a) => a.is_active).length,
        active_profiles_count: state.profiles.size
      }];
    }
    if (/SELECT COUNT\(\*\)::int AS total FROM newborn_candidates/i.test(q)) {
      return [{ total: state.candidates.size }];
    }
    if (/FROM newborn_candidates/i.test(q)) {
      let rows = Array.from(state.candidates.values());
      if (q.includes('WHERE pin_id = ANY(')) {
        const set = new Set((values[0] || []).map(String));
        return rows.filter((r) => set.has(String(r.pin_id)));
      }
      if (q.includes('WHERE pin_id =')) {
        const found = state.candidates.get(String(values[0]));
        return found ? [found] : [];
      }
      if (q.includes("WHERE stage = 'watchlist'")) {
        return rows.filter((r) => r.stage === 'watchlist');
      }
      return rows.sort((a, b) => (b.golden_score || 0) - (a.golden_score || 0));
    }
    if (/FROM newborn_candidate_snapshots/i.test(q)) {
      const pid = String(values[0]);
      return Array.from(state.candidateSnapshots.values()).filter((s) => s.pin_id === pid);
    }

    // newborn_rookie_accounts
    if (/INSERT INTO newborn_rookie_accounts/i.test(q)) {
      const records = parseJsonArg(values[0]);
      for (const r of records) {
        const prev = state.rookies.get(r.username);
        const stage = (prev && (prev.stage === 'promoted' || prev.stage === 'discarded'))
          ? prev.stage
          : r.stage;
        state.rookies.set(r.username, { ...(prev || {}), ...r, stage });
      }
      return [];
    }
    if (/UPDATE newborn_rookie_accounts/i.test(q)) {
      const compId = Number(values[0]);
      const uname = String(values[1]);
      const rk = state.rookies.get(uname);
      if (rk) {
        rk.stage = 'promoted';
        rk.promoted_competitor_id = compId;
      }
      return [];
    }
    if (/SELECT COUNT\(\*\)::int AS total FROM newborn_rookie_accounts/i.test(q)) {
      return [{ total: state.rookies.size }];
    }
    if (/FROM newborn_rookie_accounts/i.test(q)) {
      const all = Array.from(state.rookies.values());
      if (q.includes('WHERE username = ANY(')) {
        const set = new Set((values[0] || []).map((u) => String(u).toLowerCase()));
        return all.filter((r) => set.has(r.username));
      }
      if (q.includes("WHERE stage = 'watchlist'")) {
        return all.filter((r) => r.stage === 'watchlist');
      }
      return all;
    }

    // universal_master_pins & pins_daily_metrics (ingestPinsBatch CTE)
    if (/WITH raw_batch AS[\s\S]*INSERT INTO universal_master_pins/i.test(q)) {
      const rows = parseJsonArg(values[0]);
      const today = new Date().toISOString().slice(0, 10);
      const ret = [];
      for (const r of rows) {
        const isInsert = !state.masterPins.has(r.pin_id);
        state.masterPins.set(r.pin_id, { ...r });
        state.dailyMetrics.set(`${r.pin_id}:${today}`, {
          pin_id: r.pin_id,
          recorded_date: today,
          save_count: r.save_count,
          repin_count: r.repin_count,
          daily_save_velocity: r.daily_save_velocity,
          daily_repin_velocity: r.daily_repin_velocity
        });
        ret.push({ pin_id: r.pin_id, is_insert: isInsert });
      }
      return ret;
    }
    if (/FROM pins_daily_metrics/i.test(q)) {
      const pid = String(values[0]);
      return Array.from(state.dailyMetrics.values()).filter((m) => m.pin_id === pid);
    }

    // newborn_daily_anchors
    if (/INSERT INTO newborn_daily_anchors/i.test(q)) {
      const rows = parseJsonArg(values[0]);
      for (const r of rows) {
        state.anchors.set(r.pin_id, {
          ...r,
          promoted_at: new Date().toISOString(),
          last_crawled_at: null
        });
      }
      return [];
    }
    if (/UPDATE newborn_daily_anchors/i.test(q)) {
      const ids = values[0] || [];
      const out = [];
      for (const pid of ids) {
        const a = state.anchors.get(String(pid));
        if (a && a.is_active) {
          a.last_crawled_at = new Date().toISOString();
          out.push({ pin_id: a.pin_id });
        }
      }
      return out;
    }
    if (/SELECT COUNT\(\*\)::int AS total FROM newborn_daily_anchors/i.test(q)) {
      const activeCount = Array.from(state.anchors.values()).filter((a) => a.is_active).length;
      return [{ total: activeCount }];
    }
    if (/FROM newborn_daily_anchors nda JOIN universal_master_pins ump/i.test(q)) {
      const out = [];
      for (const a of state.anchors.values()) {
        if (!a.is_active) continue;
        const mp = state.masterPins.get(a.pin_id) || {};
        out.push({
          ...a,
          save_count: mp.save_count ?? null,
          repin_count: mp.repin_count ?? null,
          daily_save_velocity: mp.daily_save_velocity ?? null,
          title: mp.title || '',
          domain: mp.clean_domain || '',
          destination_url: mp.destination_url || '',
          image_url: mp.image_url || '',
          is_newborn_anchor: true
        });
      }
      return out;
    }
    if (/SELECT \* FROM newborn_daily_anchors WHERE pin_id =/i.test(q)) {
      const a = state.anchors.get(String(values[0]));
      return a ? [a] : [];
    }

    // tracked_keywords, keyword_folder_items, keyword_serp_positions, cluster_seeds, competitor_profiles
    if (/INSERT INTO tracked_keywords/i.test(q)) {
      const kw = String(values[0]).trim().toLowerCase();
      let existing = Array.from(state.trackedKeywords.values()).find((k) => k.keyword === kw);
      if (!existing) {
        existing = { id: state.nextKeywordId++, keyword: kw, category: values[1] || 'General', is_active: true };
        state.trackedKeywords.set(existing.id, existing);
      }
      return [existing];
    }
    if (/FROM tracked_keywords/i.test(q)) {
      return Array.from(state.trackedKeywords.values()).filter((k) => k.is_active);
    }
    if (/INSERT INTO keyword_folder_items/i.test(q)) {
      state.folderItems.push({ folder_id: Number(values[0]), keyword_id: Number(values[1]) });
      return [];
    }
    if (/INSERT INTO keyword_serp_positions/i.test(q)) {
      const kid = Number(values[0]);
      const rows = parseJsonArg(values[1]);
      for (const r of rows) {
        state.serpPositions.set(`${kid}:${r.pin_id}`, { keyword_id: kid, pin_id: r.pin_id, rank_position: r.rank_position });
      }
      return [];
    }
    if (/INSERT INTO cluster_seeds/i.test(q)) {
      const seeds = parseJsonArg(values[0]);
      const out = [];
      for (const s of seeds) {
        state.clusterSeeds.set(s.pin_id, { ...s });
        out.push(s);
      }
      return out;
    }
    if (/INSERT INTO competitor_profiles/i.test(q)) {
      const uname = String(values[0]).toLowerCase();
      let comp = Array.from(state.competitors.values()).find((c) => c.username === uname);
      if (!comp) {
        comp = {
          id: state.nextCompetitorId++,
          username: uname,
          display_name: values[1],
          monthly_reach: values[4],
          profile_views: values[5],
          follower_count: values[8],
          tracking_mode: values[9]
        };
        state.competitors.set(comp.id, comp);
      }
      return [comp];
    }
    if (/INSERT INTO competitor_history_snapshots/i.test(q)) {
      state.competitorSnapshots.set(Number(values[0]), { competitor_id: Number(values[0]) });
      return [];
    }
    if (/INSERT INTO folder_competitor_items/i.test(q)) {
      state.folderCompetitorItems.push({ folder_id: Number(values[0]), competitor_id: Number(values[1]) });
      return [];
    }

    return [];
  };

  sql.begin = async (fn) => await fn(sql);
  sql.end = async () => {};
  sql.state = state;
  return sql;
}

test('Wave 6A.1: Two-Zone Cookie Router enforces strict _auth=1 vs zero-cookie boundaries and never trips circuit breaker on HTTP 412/401', async () => {
  assert.equal(
    formatAuthSessionCookie('TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA='),
    '_pinterest_sess="TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA="; _auth=1'
  );
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/RelatedModulesResource/get/').zone, COOKIE_ZONES.AUTH_SESSION);
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/BaseSearchResource/get/?data=%7B%22options%22%3A%7B%22scope%22%3A%22pins%22%7D%7D').zone, COOKIE_ZONES.AUTH_SESSION);
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/BaseSearchResource/get/?data=%7B%22options%22%3A%7B%22scope%22%3A%22boards%22%7D%7D').zone, COOKIE_ZONES.ZERO_COOKIE);
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/PinResource/get/').zone, COOKIE_ZONES.ZERO_COOKIE);
  assert.equal(resolveUrlCookieZone('https://widgets.pinterest.com/v3/pidgets/pins/info/').zone, COOKIE_ZONES.ZERO_COOKIE);
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/UserResource/get/').zone, COOKIE_ZONES.ZERO_COOKIE);
  assert.equal(resolveUrlCookieZone('https://www.pinterest.com/resource/InterestResource/get/').zone, COOKIE_ZONES.ZERO_COOKIE);
  assert.equal(resolveUrlCookieZone('https://trends.pinterest.com/top_trends_filtered/').zone, COOKIE_ZONES.ZERO_COOKIE);

  // Existing guest headers helper must remain strictly unauthenticated (_auth=0 / no cookie)
  const guestStd = getStandardPinterestHeaders({ cookie: '_auth=1; _pinterest_sess="abc"' });
  assert.ok(!guestStd.Cookie.includes('_auth=1'));
  assert.ok(guestStd.Cookie.includes('_auth=0'));

  const observedCalls = [];
  const breaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 });

  let searchPinsAttempt = 0;
  const mockFetch = async (url, init) => {
    const headers = init?.headers || {};
    observedCalls.push({ url, headers: { ...headers } });

    if (url.includes('PinResource/get')) {
      return new Response(JSON.stringify({ resource_response: { data: { id: '11223344556677' } } }), { status: 200 });
    }
    if (url.includes('trends.pinterest.com')) {
      return new Response(JSON.stringify({ trends: [{ term: 'matcha', weekly_change: 80 }] }), { status: 200 });
    }
    if (url.includes('RelatedModulesResource/get')) {
      return new Response(JSON.stringify({ message: 'Login required' }), { status: 412 });
    }
    if (url.includes('BaseSearchResource/get') && decodeURIComponent(url).includes('"scope":"pins"')) {
      searchPinsAttempt++;
      if (searchPinsAttempt === 1 && headers.Cookie) {
        return new Response(JSON.stringify({ message: 'Session expired' }), { status: 401 });
      }
      return new Response(JSON.stringify({ resource_response: { data: { results: [] } } }), { status: 200 });
    }
    return new Response('{}', { status: 429 });
  };

  // 1. Auth session router: PinResource & Trends strictly strip cookies; RelatedModules sends _auth=1 & handles 412 without tripping breaker
  const router = new NewbornCookieRouter({
    rawCookie: 'TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA=',
    circuitBreaker: breaker,
    fetchImpl: mockFetch
  });

  const pinRes = await router.requestJson('https://www.pinterest.com/resource/PinResource/get/?data={}', { endpointKey: 'pin_resource' });
  assert.equal(pinRes.ok, true);
  assert.equal(observedCalls[0].headers.Cookie, undefined);
  assert.equal(observedCalls[0].headers.cookie, undefined);

  const trendsRes = await router.requestJson('https://trends.pinterest.com/top_trends_filtered/', { endpointKey: 'trends_api' });
  assert.equal(trendsRes.ok, true);
  assert.equal(observedCalls[1].headers.Cookie, undefined);
  assert.equal(observedCalls[1].headers['x-new-site'], 'true');

  // RelatedModules returns 412 -> degrades session cleanly, zero circuit breaker failures!
  const relRes = await router.requestJson('https://www.pinterest.com/resource/RelatedModulesResource/get/?data={}', { endpointKey: 'related_modules' });
  assert.equal(relRes.ok, false);
  assert.equal(relRes.authRequiredFallback, true);
  assert.ok(observedCalls[2].headers.Cookie.includes('_auth=1'));
  assert.equal(breaker.getState().state, 'CLOSED');
  assert.equal(breaker.getState().consecutiveFailures, 0);
  assert.equal(router.effectiveMode, 'guest_fallback_412');

  // 2. Fresh router testing automatic guest retry on BaseSearchResource (401 -> zero-cookie retry succeeds!)
  const router2 = new NewbornCookieRouter({
    rawCookie: 'TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA=',
    circuitBreaker: breaker,
    fetchImpl: mockFetch
  });
  const searchRes = await router2.requestJson(
    'https://www.pinterest.com/resource/BaseSearchResource/get/?data=%7B%22options%22%3A%7B%22scope%22%3A%22pins%22%7D%7D',
    { endpointKey: 'search_pins' }
  );
  assert.equal(searchRes.ok, true);
  assert.equal(searchRes.fallbackFromAuth, true);
  assert.equal(breaker.getState().consecutiveFailures, 0);

  // Genuine 429 rate-limits still trip the circuit breaker
  await router2.requestJson('https://www.pinterest.com/resource/UserResource/get/?rate_limit=1', { endpointKey: 'user_resource' });
  await router2.requestJson('https://www.pinterest.com/resource/UserResource/get/?rate_limit=2', { endpointKey: 'user_resource' });
  assert.equal(breaker.getState().state, 'OPEN');
});

test('Wave 6A.2: All 8 surface harvesters, __PWS_INITIAL_PROPS__ SSR parser, Pidgets profile_url username, zero-cookie pin_join, and 10M+ UserResource work cleanly', async () => {
  // Reserved slug protection for 'newborn'
  assert.equal(RESERVED_KEYWORD_SLUGS.has('newborn'), true);
  assert.equal(RESERVED_PINTEREST_PATHS.has('newborn'), true);
  assert.equal(normalizePinterestUsername('newborn'), '');
  assert.equal(extractUsernameFromProfileUrl('https://www.pinterest.com/newborn/', ''), '');
  assert.equal(extractUsernameFromProfileUrl('https://www.pinterest.com/rookie_baker_2026/', ''), 'rookie_baker_2026');

  // 2026 <script id="__PWS_INITIAL_PROPS__"> SSR state extraction
  const ssrHtml = `
    <!doctype html><html><head></head><body>
      <script id="__PWS_INITIAL_PROPS__" type="application/json">
        {
          "initialReduxState": {
            "pins": {
              "99887766554433": {
                "id": "99887766554433",
                "type": "pin",
                "title": "Sourdough Brioche Cinnamon Rolls",
                "repin_count": 48,
                "images": { "736x": { "url": "https://i.pinimg.com/736x/aa/bb/cc.jpg" } }
              },
              "e1_encrypted_stub": {
                "id": "e1_encrypted_stub",
                "type": "pin",
                "title": "Encrypted Guest Stub"
              }
            }
          }
        }
      </script>
    </body></html>
  `;
  const props = extractPwsInitialProps(ssrHtml);
  const ssrPins = collectPinsFromSsrTree(props);
  assert.equal(ssrPins.length, 1);
  assert.equal(ssrPins[0].id, '99887766554433');

  const nowMs = Date.parse('2026-04-15T12:00:00Z');
  const threeDaysAgoIso = '2026-04-12T12:00:00Z';
  const ninetyDaysAgoIso = '2026-01-01T12:00:00Z';

  const mockFetch = async (url, init) => {
    const cookieHeader = init?.headers?.Cookie || init?.headers?.cookie || '';

    if (url.includes('trends.pinterest.com/top_trends_filtered')) {
      assert.equal(cookieHeader, '');
      assert.equal(init.headers['x-new-site'], 'true');
      return new Response(JSON.stringify({
        trends: [{ term: 'cottagecore patio', weekly_change: 145, monthly_change: 310 }]
      }), { status: 200 });
    }
    if (url.includes('trends.pinterest.com/metrics/')) {
      assert.equal(cookieHeader, '');
      assert.equal(init.headers['x-new-site'], 'true');
      return new Response(JSON.stringify({
        metrics: { 'cottagecore patio': { predicted: [{ value: 50 }, { value: 85 }] } }
      }), { status: 200 });
    }
    if (url.includes('SearchTabResource/get')) {
      assert.ok(cookieHeader.includes('_auth=1'));
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            popular_searches: [{ query: 'small balcony herb garden' }]
          }
        }
      }), { status: 200 });
    }
    if (url.includes('BaseSearchResource/get') && decodeURIComponent(url).includes('"scope":"pins"')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            guides: [{ term: 'budget', display: 'On A Budget', dominant_color: '#22aa66' }],
            results: [
              { id: 'e1_encrypted_bad_id', title: 'Should Skip' },
              { id: '11112222333344', is_promoted: true, title: 'Sponsored Ad' },
              {
                id: '22223333444455',
                type: 'pin',
                title: 'DIY Cedar Balcony Planter',
                repin_count: 34,
                images: { '736x': { url: 'https://i.pinimg.com/736x/22/33/44.jpg' } },
                pinner: { username: 'patiomaker', follower_count: 850 }
              }
            ]
          }
        }
      }), { status: 200 });
    }
    if (url.includes('BaseSearchResource/get') && decodeURIComponent(url).includes('"scope":"boards"')) {
      assert.equal(cookieHeader, '');
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            results: [
              {
                id: '555500001111',
                type: 'board',
                name: 'Cottagecore Patio Ideas',
                url: '/patiomaker/cottagecore-patio-ideas/',
                pin_count: 42,
                board_order_modified_at: threeDaysAgoIso
              },
              {
                id: '555500009999',
                type: 'board',
                name: 'Stale Old Board',
                url: '/olduser/stale-board/',
                pin_count: 900,
                board_order_modified_at: ninetyDaysAgoIso
              }
            ]
          }
        }
      }), { status: 200 });
    }
    if (url.includes('BoardFeedResource/get') && decodeURIComponent(url).includes('more_ideas')) {
      assert.ok(cookieHeader.includes('_auth=1'));
      assert.ok(decodeURIComponent(url).includes('"add_vase":true'));
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: '33334444555566',
            type: 'pin',
            title: 'Solar String Lights Pergola',
            repin_count: 29,
            images: { '736x': { url: 'https://i.pinimg.com/736x/33/44/55.jpg' } }
          }]
        }
      }), { status: 200 });
    }
    if (url.includes('BoardFeedResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: '44445555666677',
            type: 'pin',
            title: 'Pea Gravel Cozy Bistro Corner',
            repin_count: 41,
            images: { '736x': { url: 'https://i.pinimg.com/736x/44/55/66.jpg' } }
          }]
        }
      }), { status: 200 });
    }
    if (url.includes('InterestResource/get')) {
      assert.equal(cookieHeader, '');
      if (decodeURIComponent(url).includes('non-interest-random-slug')) {
        return new Response(JSON.stringify({
          resource_response: { data: { is_interest: false, id: null } }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            is_interest: true,
            id: '941234567890',
            key: 'cottagecore patio',
            url_name: 'cottagecore-patio',
            internal_search_count: 88000
          }
        }
      }), { status: 200 });
    }
    if (url.includes('BestPinsFeedAltResource/get')) {
      assert.ok(cookieHeader.includes('_auth=1'));
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: '55556666777788',
            type: 'pin',
            title: 'Wildflower Container Patio',
            repin_count: 52,
            images: { '736x': { url: 'https://i.pinimg.com/736x/55/66/77.jpg' } }
          }]
        }
      }), { status: 200 });
    }
    if (url.includes('RelatedModulesResource/get')) {
      assert.ok(cookieHeader.includes('_auth=1'));
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: '66667777888899',
            type: 'pin',
            title: 'Stone Firepit Seating Nook',
            repin_count: 67,
            images: { '736x': { url: 'https://i.pinimg.com/736x/66/77/88.jpg' } }
          }]
        }
      }), { status: 200 });
    }
    if (url.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
      assert.equal(cookieHeader, '');
      return new Response(JSON.stringify({
        data: [{
          id: '22223333444455',
          repin_count: 39,
          title: 'DIY Cedar Balcony Planter',
          pinner: {
            full_name: 'Rookie Patio Builder',
            profile_url: 'https://www.pinterest.com/rookie_patio_builder/',
            follower_count: 640
          },
          board: { id: '555500001111', name: 'Cottagecore Patio Ideas', url: '/rookie_patio_builder/cottagecore-patio-ideas/' }
        }]
      }), { status: 200 });
    }
    if (url.includes('PinResource/get')) {
      // Sending _auth=1 to PinResource strips pin_join on real Pinterest — assert strict zero-cookie!
      assert.equal(cookieHeader, '');
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: '22223333444455',
            title: 'DIY Cedar Balcony Planter',
            created_at: threeDaysAgoIso,
            repin_count: 42,
            aggregated_pin_data: { aggregated_stats: { saves: 68 } },
            insertion_source: 'share_extension_ios',
            is_repin: true,
            pinner: { username: 'giant_curator_hub', full_name: 'Giant Hub', follower_count: 950000 },
            origin_pinner: { username: 'rookie_patio_builder', full_name: 'Rookie Patio Builder', follower_count: 640 },
            board: { id: '555500001111', name: 'Cottagecore Patio Ideas' },
            pin_join: {
              visual_annotation: ['cottagecore patio', 'cedar planter box'],
              annotations_with_links: [
                { name: 'small patio garden', url: '/ideas/small-patio-garden/900111222/' }
              ]
            }
          }
        }
      }), { status: 200 });
    }
    if (url.includes('UserResource/get')) {
      assert.equal(cookieHeader, '');
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            username: 'rookie_patio_builder',
            full_name: 'Rookie Patio Builder',
            follower_count: 640,
            profile_reach: '10M+',
            profile_views: 1450000,
            pin_count: 38,
            board_count: 4
          }
        }
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const router = new NewbornCookieRouter({
    rawCookie: 'TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA=',
    fetchImpl: mockFetch
  });

  // 1. Growing Trends + 90d Forecast
  const s1 = await harvestGrowingTrendsSurface(router, { country: 'US', limit: 10 });
  assert.equal(s1.ok, true);
  assert.equal(s1.trends[0].term, 'cottagecore patio');
  assert.equal(s1.trends[0].predicted_90d_growth, 70);

  // 2. Zero-Query Popular
  const s2 = await harvestZeroQueryPopularSurface(router, { country: 'US' });
  assert.equal(s2.ok, true);
  assert.ok(s2.terms.includes('small balcony herb garden'));

  // 3. Pin SERP + Capsules (rejects e1_ and ads)
  const s3 = await harvestPinSerpWithCapsulesSurface(router, 'cottagecore patio', { maxPages: 1 });
  assert.equal(s3.pins.length, 1);
  assert.equal(s3.pins[0].pin_id, '22223333444455');
  assert.equal(s3.encrypted_skipped_count, 1);
  assert.equal(s3.capsules[0].term, 'budget');

  // 4. Fresh Boards (filters out 90d stale board when maxBoardAgeDays = 14)
  const s4 = await harvestFreshBoardsSurface(router, 'cottagecore patio', { maxBoardAgeDays: 14, nowMs });
  assert.equal(s4.boards.length, 1);
  assert.equal(s4.boards[0].board_id, '555500001111');

  // 5. Board Feed
  const s5 = await harvestBoardFeedSurface(router, s4.boards[0], { maxPages: 1 });
  assert.equal(s5.pins.length, 1);
  assert.equal(s5.pins[0].pin_id, '44445555666677');

  // 6. Board "Find more ideas" (/<user>/<slug>/more_ideas/ with add_vase: true)
  const s6 = await harvestBoardMoreIdeasSurface(router, s4.boards[0], { maxPages: 1 });
  assert.equal(s6.pins.length, 1);
  assert.equal(s6.pins[0].pin_id, '33334444555566');

  // 7. /ideas/ Hub checks is_interest gate first!
  const s7Skip = await harvestIdeasHubSurface(router, 'non-interest-random-slug', { maxPages: 1 });
  assert.equal(s7Skip.ok, false);
  assert.equal(s7Skip.skipped_non_interest, true);

  const s7Ok = await harvestIdeasHubSurface(router, 'cottagecore patio', { maxPages: 1 });
  assert.equal(s7Ok.ok, true);
  assert.equal(s7Ok.pins[0].pin_id, '55556666777788');

  // 8. Related Pin Snowball
  const s8 = await harvestRelatedPinSnowballSurface(router, '22223333444455', { maxPages: 1, hop: 1 });
  assert.equal(s8.ok, true);
  assert.equal(s8.pins[0].pin_id, '66667777888899');
  assert.equal(s8.pins[0].snowball_parent_pin_id, '22223333444455');

  // 9. Pidgets 50x pre-triage: extracts username from profile_url & preserves save_count = null when omitted
  const pidgetsMap = await pretriageCandidatesWithPidgets(['22223333444455'], router);
  const prePin = pidgetsMap.get('22223333444455');
  assert.equal(prePin.pinner_username, 'rookie_patio_builder');
  assert.equal(prePin.save_count, null);
  assert.equal(prePin.repin_count, 39);

  // 10. Zero-cookie PinResource hydration: preserves pin_join & separates origin_pinner vs giant repinner
  const hydPin = await hydratePinZeroCookie('22223333444455', router);
  assert.equal(hydPin.ok, true);
  assert.equal(hydPin.pin.pinner_username, 'giant_curator_hub');
  assert.equal(hydPin.pin.origin_creator_username, 'rookie_patio_builder');
  assert.equal(hydPin.pin.effective_creator_username, 'rookie_patio_builder');
  assert.equal(hydPin.pin.effective_creator_followers, 640);
  assert.equal(hydPin.pin.save_count, 68);
  assert.equal(hydPin.pin.visual_annotations.length, 3);
  assert.equal(hydPin.pin.is_linkless, true);

  // 11. Zero-cookie UserResource hydration: maps profile_reach -> monthly_reach & preserves 10M+ ceiling
  const hydUser = await hydrateUserZeroCookie('rookie_patio_builder', router);
  assert.equal(hydUser.ok, true);
  assert.equal(hydUser.user.monthly_reach, PINTEREST_CEILING_VALUE);
  assert.equal(hydUser.user.total_audience, PINTEREST_CEILING_VALUE);
  assert.equal(hydUser.user.profile_views, 1450000);
});

test('Wave 6A.3: Settings & Rule Profiles engine validates bounds, syncs presets/cadences, and evaluates UTC automation windows & cooldowns', async () => {
  const sql = createStatefulNewbornSqlMock();

  const defaults = await getNewbornSettings(sql);
  assert.equal(defaults.qualification.max_age_days, 30);
  assert.equal(defaults.automation.auto_track_enabled, false);

  // Partial PATCH with 7d preset, provenance filters, Linkless Vacuum only, and custom schedule window
  const patched = await patchNewbornSettings(sql, {
    discovery: {
      enabled_surfaces: ['growing_trends', 'pin_serp_capsules', 'related_pin_snowball'],
      max_board_age_days: 14,
      snowball: { max_hops: 3, seed_cap: 15 }
    },
    qualification: {
      age_window_preset: '7d',
      min_repin_count: 12,
      min_repin_per_day: 3.5,
      max_creator_followers: 8000,
      enforce_max_followers_filter: true,
      provenance: {
        allowed_sources: ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED'],
        ai_disclosure_policy: 'exclude'
      },
      linkless_vacuum: { mode: 'only', score_boost: 18 }
    },
    automation: {
      auto_track_enabled: true,
      schedule: {
        cadence: 'every_3h',
        target_window_utc: { start_hour: 2, end_hour: 6 },
        cooldown_minutes: 45
      },
      pin_promotion_rules: {
        promote_thresholds: { min_consecutive_days: 3, min_golden_score: 80 }
      }
    }
  });

  assert.equal(patched.qualification.max_age_days, 7);
  assert.equal(patched.qualification.linkless_vacuum.linkless_vacuum_only, true);
  assert.equal(patched.discovery.surfaces.growing_trends.enabled, true);
  assert.equal(patched.discovery.surfaces.fresh_boards.enabled, false);
  assert.equal(patched.discovery.snowball.max_hops, 3);
  assert.equal(patched.automation.schedule.interval_minutes, 180);

  // Schedule evaluation inside vs outside UTC target window and during cooldown
  const dueAt03Utc = evaluateAutomationSchedule(patched, new Date('2026-04-15T03:00:00Z'));
  assert.equal(dueAt03Utc.in_target_window, true);
  assert.equal(dueAt03Utc.discovery_due, true);
  assert.equal(dueAt03Utc.watchlist_poll_due, true);

  const outsideAt15Utc = evaluateAutomationSchedule(patched, new Date('2026-04-15T15:00:00Z'));
  assert.equal(outsideAt15Utc.in_target_window, false);
  assert.equal(outsideAt15Utc.discovery_due, false);

  const withRecentRun = normalizeNewbornSettings({
    automation: { schedule: { last_discovery_run_at: '2026-04-15T02:30:00Z' } }
  }, patched);
  const inCooldown = evaluateAutomationSchedule(withRecentRun, new Date('2026-04-15T03:00:00Z'));
  assert.equal(inCooldown.cooldown_active, true);
  assert.equal(inCooldown.discovery_due, false);
  assert.equal(inCooldown.watchlist_poll_due, false);

  // Rule Profiles CRUD + inheritance over global settings
  const createdProfile = await createNewbornRuleProfile(sql, {
    name: '90d Seasonal Evergreen',
    qualification_config: { age_window_preset: '90d', min_repin_count: 40 }
  });
  assert.equal(createdProfile.slug, '90d-seasonal-evergreen');

  const resolved = await resolveEffectiveNewbornSettings(sql, { profileId: createdProfile.id });
  assert.equal(resolved.settings.qualification.max_age_days, 90);
  assert.equal(resolved.settings.qualification.min_repin_count, 40);

  const profiles = await listNewbornRuleProfiles(sql);
  assert.equal(profiles.length, 2);

  const updatedProfile = await updateNewbornRuleProfile(sql, createdProfile.id, {
    description: 'Updated seasonal rules'
  });
  assert.equal(updatedProfile.description, 'Updated seasonal rules');

  // Default profile cannot be deleted
  await assert.rejects(
    () => deleteNewbornRuleProfile(sql, 1),
    /Cannot delete the active default rule profile/
  );
  const delNonDefault = await deleteNewbornRuleProfile(sql, createdProfile.id);
  assert.equal(delNonDefault.deleted, true);

  // Reset global settings
  const reset = await resetNewbornSettings(sql);
  assert.equal(reset.qualification.max_age_days, DEFAULT_NEWBORN_SETTINGS.qualification.max_age_days);
  assert.equal(await updateNewbornSettings(sql, { qualification: { max_age_days: 14 } }).then((s) => s.qualification.age_window_preset), '14d');

  // Redacted cookie persistence
  const savedCookie = await saveNewbornCookie(sql, '_pinterest_sess="SUPER_SECRET_SESSION_VAL_999"');
  assert.equal(savedCookie.has_cookie, true);
  assert.equal(savedCookie.preview, '[CONFIGURED]');
  assert.equal(JSON.stringify(savedCookie).includes('SUPER_SECRET'), false);

  const statusAfterSave = await getNewbornCookieStatus(sql);
  assert.equal(statusAfterSave.has_cookie, true);
  assert.equal(JSON.stringify(statusAfterSave).includes('SUPER_SECRET'), false);

  const cleared = await clearNewbornCookie(sql);
  assert.equal(cleared.has_cookie, false);
});

test('Wave 6A.4: Provenance filters, Origin Creator separation, Golden Pin Breakout scoring, Rookie Radar & Crossover Blueprints', () => {
  const nowMs = Date.parse('2026-04-15T12:00:00Z');

  assert.equal(classifyPinProvenance({ raw_creation_method: 'share_extension_ios' }).upload_provenance, 'SHARE_EXTENSION_IOS');
  assert.equal(classifyPinProvenance({ raw_creation_method: 'share_extension_android' }).upload_provenance, 'SHARE_EXTENSION_ANDROID');
  assert.equal(classifyPinProvenance({ raw_creation_method: 'uploaded' }).upload_provenance, 'UPLOADED');

  const strictSettings = normalizeNewbornSettings({
    qualification: {
      age_window_preset: '14d',
      min_repin_count: 10,
      min_save_count: 20,
      min_repin_per_day: 2.0,
      max_creator_followers: 5000,
      enforce_max_followers_filter: true,
      provenance: {
        allowed_sources: ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED'],
        ai_disclosure_policy: 'exclude'
      },
      linkless_vacuum: { mode: 'only', score_boost: 15 }
    }
  });

  // Repinned by a 750,000-follower mega account, but ORIGIN creator has 900 followers!
  const viralRookiePin = {
    pin_id: '77778888999900',
    title: 'Small Entryway Mudroom Bench DIY',
    board_name: 'Small Entryway Ideas & Mudroom Storage',
    created_at_pinterest: '2026-04-11T12:00:00Z', // 4 days old
    repin_count: 44,
    save_count: 92,
    share_count: 8,
    comment_count: 3,
    is_hydrated: true,
    raw_creation_method: 'share_extension_ios',
    has_ai_disclosure: false,
    destination_url: null,
    clean_domain: null,
    is_linkless: true,
    pinner_username: 'mega_decor_reposter',
    pinner_followers: 750000,
    origin_creator_username: 'tiny_woodshop_rookie',
    origin_creator_followers: 900,
    discovered_surfaces: ['fresh_boards', 'board_more_ideas', 'related_pin_snowball'],
    visual_annotations: [
      { name: 'small entryway ideas', url: '/ideas/small-entryway-ideas/123/' },
      { name: 'mudroom bench storage', url: null }
    ],
    guided_capsules: [{ term: 'storage', display: 'Storage' }]
  };

  const scored = scoreNewbornCandidate(viralRookiePin, strictSettings, { nowMs });
  assert.equal(scored.qualified, true);
  assert.equal(scored.effective_creator_username, 'tiny_woodshop_rookie');
  assert.equal(scored.effective_creator_followers, 900);
  assert.equal(scored.is_rookie_outlier, true);
  assert.equal(scored.is_golden_pin, true);
  assert.ok(scored.golden_score >= 75);

  // AI-disclosed pin is rejected under ai_disclosure_policy: 'exclude'
  const aiRejected = evaluateCandidateQualification(
    { ...viralRookiePin, has_ai_disclosure: true },
    strictSettings,
    { nowMs }
  );
  assert.equal(aiRejected.qualified, false);
  assert.ok(aiRejected.reasons.includes('excluded_ai_disclosure'));

  // External linked article is rejected when Linkless Vacuum is 'only'
  const linkedRejected = evaluateCandidateQualification(
    { ...viralRookiePin, is_linkless: false, destination_url: 'https://blog.example.com/post', clean_domain: 'blog.example.com' },
    strictSettings,
    { nowMs }
  );
  assert.equal(linkedRejected.qualified, false);
  assert.ok(linkedRejected.reasons.includes('requires_linkless_vacuum'));

  // Crossover Blueprint & Matrix (3-way crossover: visual_annotation + board_title + guided_capsule ranks #1)
  const blueprint = synthesizeNewbornCrossoverBlueprint(scored, []);
  assert.equal(blueprint.primary_keyword, 'mudroom bench storage');
  assert.equal(blueprint.secondary_keyword, 'small entryway ideas');
  assert.ok(blueprint.exact_crossover_count >= 2);
  assert.equal(blueprint.linkless_vacuum_opportunity, true);

  const matrix = buildNewbornCrossoverMatrix([scored]);
  assert.ok(matrix.length >= 2);
  assert.equal(matrix[0].board_title_matches, 1);

  // Rookie Creator scoring
  const rookie = scoreRookieCreator(
    {
      username: 'tiny_woodshop_rookie',
      display_name: 'Tiny Woodshop',
      follower_count: 900,
      monthly_reach: 420000,
      profile_views: 610000,
      pin_count: 24,
      board_count: 3
    },
    [scored],
    strictSettings
  );
  assert.equal(rookie.is_qualified_rookie, true);
  assert.ok(rookie.rookie_score >= 70);
  assert.ok(rookie.outlier_multiplier > 400);
});

test('Wave 6A.5: End-to-end 8-Surface Harvest + Snowball keeps staging isolated, tracks consecutive_qualifying_days, auto-promotes, and anchors 01:00 UTC velocity fleet', async () => {
  const sql = createStatefulNewbornSqlMock();
  const day1Ms = Date.parse('2026-04-15T10:00:00Z');
  const day2Ms = Date.parse('2026-04-16T10:00:00Z');

  await patchNewbornSettings(sql, {
    discovery: {
      enabled_surfaces: ['pin_serp_capsules', 'related_pin_snowball'],
      snowball: { enabled: true, max_hops: 1, seed_cap: 5, min_seed_golden_score: 60 }
    },
    qualification: {
      age_window_preset: '14d',
      min_repin_count: 10,
      min_save_count: 15,
      min_repin_per_day: 2.0
    },
    automation: {
      auto_track_enabled: true,
      pin_promotion_rules: {
        watchlist_thresholds: {
          min_repins: 10,
          min_saves: 15,
          min_repin_per_day: 2.0,
          max_age_days: 14,
          min_golden_score: 55
        },
        promote_thresholds: {
          min_repins: 20,
          min_saves: 30,
          min_repin_per_day: 4.0,
          max_age_days: 14,
          min_golden_score: 65,
          min_consecutive_days: 2
        },
        destinations: {
          stage_to_watchlist: true,
          promote_to_daily_ssot: true,
          promote_to_campaign_folder_id: 7,
          promote_top_annotation_as_keyword: true,
          promote_to_cluster_seeds: true
        }
      },
      rookie_promotion_rules: {
        enabled: true,
        max_followers: 5000,
        min_monthly_reach: 100000,
        min_golden_pins: 1,
        min_rookie_score: 65,
        min_consecutive_days: 2,
        destination_tracking_mode: 'pulse_only',
        destination_folder_id: 7
      }
    }
  });

  const created3dAgo = '2026-04-12T10:00:00Z';
  const mockFetch = async (url) => {
    if (url.includes('BaseSearchResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            results: [{
              id: '81000000000001',
              type: 'pin',
              title: 'Crispy Rice Paper Dumplings',
              repin_count: 35,
              images: { '736x': { url: 'https://i.pinimg.com/736x/81/01.jpg' } }
            }]
          }
        }
      }), { status: 200 });
    }
    if (url.includes('RelatedModulesResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: '81000000000002',
            type: 'pin',
            title: 'Chili Crisp Tofu Bites',
            repin_count: 28,
            images: { '736x': { url: 'https://i.pinimg.com/736x/81/02.jpg' } }
          }]
        }
      }), { status: 200 });
    }
    if (url.includes('widgets.pinterest.com/v3/pidgets/pins/info/')) {
      return new Response(JSON.stringify({
        data: [
          {
            id: '81000000000001',
            repin_count: 36,
            pinner: { profile_url: 'https://www.pinterest.com/dumpling_rookie/', follower_count: 720 }
          },
          {
            id: '81000000000002',
            repin_count: 30,
            pinner: { profile_url: 'https://www.pinterest.com/dumpling_rookie/', follower_count: 720 }
          }
        ]
      }), { status: 200 });
    }
    if (url.includes('PinResource/get')) {
      const isFirst = url.includes('81000000000001');
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            id: isFirst ? '81000000000001' : '81000000000002',
            title: isFirst ? 'Crispy Rice Paper Dumplings' : 'Chili Crisp Tofu Bites',
            created_at: created3dAgo,
            repin_count: isFirst ? 36 : 30,
            aggregated_pin_data: { aggregated_stats: { saves: isFirst ? 64 : 50 } },
            insertion_source: 'uploaded',
            pinner: { username: 'dumpling_rookie', follower_count: 720 },
            board: { id: '9001', name: 'Easy Asian Appetizers' },
            pin_join: { visual_annotation: ['rice paper dumplings', 'easy asian appetizers'] }
          }
        }
      }), { status: 200 });
    }
    if (url.includes('UserResource/get')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: {
            username: 'dumpling_rookie',
            full_name: 'Dumpling Rookie',
            follower_count: 720,
            profile_reach: 280000,
            profile_views: 410000,
            pin_count: 19,
            board_count: 3
          }
        }
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  // Day 1 Discovery: discovers SERP pin + expands Hop 1 Snowball pin -> stages to watchlist, ZERO pollution of SSOT!
  const discRes = await runNewbornDiscovery(sql, {
    seedQueries: ['rice paper dumplings'],
    rawCookieOverride: 'TWc9PSZWaV9zZXNzX3Rva2VuXzEyMzQ1Njc4OTA=',
    routerOptions: { fetchImpl: mockFetch },
    nowMs: day1Ms
  });

  assert.equal(discRes.ok, true);
  assert.equal(discRes.snowball_hops_executed, 1);
  assert.equal(sql.state.candidates.size, 2);
  assert.equal(sql.state.candidates.get('81000000000001').stage, 'watchlist');
  assert.equal(sql.state.candidates.get('81000000000001').consecutive_qualifying_days, 1);
  assert.equal(sql.state.candidates.get('81000000000002').snowball_parent_pin_id, '81000000000001');

  // Strict Zero-Pollution Verification on Day 1 (min_consecutive_days = 2 not yet met!)
  assert.equal(sql.state.masterPins.size, 0);
  assert.equal(sql.state.competitors.size, 0);

  // Same-day re-poll on Day 1 MUST be idempotent (consecutive_qualifying_days stays 1)
  const sameDayPoll = await pollNewbornWatchlist(sql, {
    routerOptions: { fetchImpl: mockFetch },
    nowMs: day1Ms + 3600_000
  });
  assert.equal(sameDayPoll.auto_promoted_pins.length, 0);
  assert.equal(sql.state.candidates.get('81000000000001').consecutive_qualifying_days, 1);
  assert.equal(sql.state.masterPins.size, 0);

  // Day 2 Watchlist Poll -> consecutive_qualifying_days reaches 2 -> auto-promotes pins & rookie creator!
  const day2Poll = await pollNewbornWatchlist(sql, {
    routerOptions: { fetchImpl: mockFetch },
    nowMs: day2Ms
  });
  assert.equal(day2Poll.auto_promoted_pins.length, 2);
  assert.deepEqual(day2Poll.auto_promoted_rookies, ['dumpling_rookie']);
  assert.equal(sql.state.masterPins.size, 2);
  assert.equal(sql.state.anchors.size, 2);
  assert.equal(sql.state.clusterSeeds.size, 2);
  assert.equal(sql.state.trackedKeywords.size, 1);
  assert.equal(sql.state.folderItems.length, 1);
  assert.equal(sql.state.competitors.size, 1);
  assert.equal(sql.state.folderCompetitorItems.length, 1);
  assert.equal(sql.state.candidates.get('81000000000001').stage, 'promoted');

  // Verify standalone 01:00 UTC velocity fleet continuity EVEN when 0 tracked keywords exist!
  const standaloneSql = createStatefulNewbornSqlMock();
  standaloneSql.state.candidates.set('92000000000009', {
    pin_id: '92000000000009',
    stage: 'discovered',
    title: 'Standalone Linkless Breakout Pin',
    repin_count: 55,
    save_count: 110,
    repin_per_day: 11,
    save_per_day: 22,
    is_hydrated: true,
    golden_score: 88,
    is_golden_pin: true
  });

  const standalonePromo = await promoteNewbornCandidates(standaloneSql, {
    pinIds: ['92000000000009'],
    destinations: {
      promote_to_daily_ssot: true,
      promote_top_annotation_as_keyword: false,
      promote_to_cluster_seeds: false
    }
  });
  assert.equal(standalonePromo.ok, true);
  assert.equal(standalonePromo.anchors_created, 1);
  assert.equal(standaloneSql.state.trackedKeywords.size, 0);

  const fleetDispatch = await runKeywordFleetDispatch({
    sql: standaloneSql,
    env: { TARGET_KEYWORD: '' }
  });
  assert.equal(fleetDispatch.mode, 'keyword_sweep');
  assert.equal(fleetDispatch.taskCount, 20);
  assert.equal(fleetDispatch.matrixTasks[0].enable_serp_harvest, false);
  assert.equal(fleetDispatch.matrixTasks[0].standalone_anchors_count, 1);

  const workerAnchors = await fetchStandaloneNewbornAnchorsForWorker(standaloneSql, { workerIndex: 0, workerTotal: 20 });
  assert.equal(workerAnchors.length, 1);
  assert.equal(workerAnchors[0].pin_id, '92000000000009');

  const stampedCount = await markNewbornAnchorsCrawled(standaloneSql, ['92000000000009']);
  assert.equal(stampedCount, 1);
  assert.ok(standaloneSql.state.anchors.get('92000000000009').last_crawled_at);
});

test('Wave 6A.6: Fastify /api/newborn/* routes enforce auth fail-closed, Cache-Control: no-store, secret redaction, and CRUD workflows', async (t) => {
  const sql = createStatefulNewbornSqlMock();

  const app = createFastifyApp({
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    API_SECRET_KEY: 'wave6a-secret-key',
    DATABASE_URL: '',
    SQL_CLIENT: sql
  });

  const noDbApp = createFastifyApp({
    NODE_ENV: 'test',
    ENVIRONMENT: 'test',
    DATABASE_URL: ''
  });

  t.after(async () => {
    await app.close();
    await noDbApp.close();
  });

  // 1. Scale-to-zero / offline GET /api/newborn/settings works without DATABASE_URL
  const offlineRes = await noDbApp.inject({
    method: 'GET',
    url: '/api/newborn/settings'
  });
  assert.equal(offlineRes.statusCode, 200);
  assert.ok(String(offlineRes.headers['cache-control']).includes('no-store'));
  assert.equal(offlineRes.json().surfaces_catalog.length, 8);

  // 2. Unauthenticated PATCH /api/newborn/settings blocked in production (401)
  const unauthPatch = await app.inject({
    method: 'PATCH',
    url: '/api/newborn/settings',
    payload: { qualification: { max_age_days: 7 } }
  });
  assert.equal(unauthPatch.statusCode, 401);

  // 3. Authenticated PATCH /api/newborn/settings updates & persists settings with no-store
  const authHeaders = { 'x-api-key': 'wave6a-secret-key' };
  const authPatch = await app.inject({
    method: 'PATCH',
    url: '/api/newborn/settings',
    headers: authHeaders,
    payload: {
      qualification: { age_window_preset: '14d', min_repin_count: 15 },
      automation: { auto_track_enabled: true }
    }
  });
  assert.equal(authPatch.statusCode, 200);
  assert.ok(String(authPatch.headers['cache-control']).includes('no-store'));
  assert.equal(authPatch.json().settings.qualification.max_age_days, 14);
  assert.equal(authPatch.json().settings.qualification.min_repin_count, 15);
  assert.equal(authPatch.json().settings.automation.auto_track_enabled, true);

  // 4. Rule Profile creation & inspection over HTTP
  const createRuleRes = await app.inject({
    method: 'POST',
    url: '/api/newborn/rules',
    headers: authHeaders,
    payload: {
      name: 'Mobile Share Rockets',
      qualification_config: {
        age_window_preset: '7d',
        provenance: { allowed_sources: ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID'] }
      }
    }
  });
  assert.equal(createRuleRes.statusCode, 201);
  const createdRuleId = createRuleRes.json().profile.id;

  const getRuleRes = await app.inject({
    method: 'GET',
    url: `/api/newborn/rules/${createdRuleId}`
  });
  assert.equal(getRuleRes.statusCode, 200);
  assert.equal(getRuleRes.json().effective_settings.qualification.max_age_days, 7);

  // 5. Cookie save & status redaction over HTTP (zero secret leakage!)
  const saveCookieRes = await app.inject({
    method: 'POST',
    url: '/api/newborn/cookie',
    headers: authHeaders,
    payload: { cookie: 'TWc9PSZultra_sensitive_session_cookie_token_12345' }
  });
  assert.equal(saveCookieRes.statusCode, 200);
  assert.ok(String(saveCookieRes.headers['cache-control']).includes('no-store'));
  assert.equal(saveCookieRes.body.includes('ultra_sensitive_session_cookie_token'), false);

  const getCookieRes = await app.inject({
    method: 'GET',
    url: '/api/newborn/cookie'
  });
  assert.equal(getCookieRes.statusCode, 200);
  assert.equal(getCookieRes.json().has_cookie, true);
  assert.equal(getCookieRes.body.includes('ultra_sensitive_session_cookie_token'), false);

  // 6. Overview, Candidates stage PATCH, and Method Not Allowed (405)
  sql.state.candidates.set('61234567890123', {
    pin_id: '61234567890123',
    stage: 'discovered',
    title: 'Minimalist Linen Curtains',
    board_name: 'Bedroom Curtains Ideas',
    is_golden_pin: true,
    is_linkless: true,
    golden_score: 84.2,
    repin_per_day: 9.5,
    visual_annotations: [{ name: 'linen curtains', url: null }]
  });

  const overviewRes = await app.inject({
    method: 'GET',
    url: '/api/newborn/overview'
  });
  assert.equal(overviewRes.statusCode, 200);
  assert.equal(overviewRes.json().counts.total_candidates, 1);
  assert.equal(overviewRes.json().counts.golden_pins_count, 1);

  const stagePatchRes = await app.inject({
    method: 'PATCH',
    url: '/api/newborn/candidates/61234567890123',
    headers: authHeaders,
    payload: { stage: 'watchlist' }
  });
  assert.equal(stagePatchRes.statusCode, 200);
  assert.equal(stagePatchRes.json().stage, 'watchlist');

  const dossierRes = await app.inject({
    method: 'GET',
    url: '/api/newborn/candidates/61234567890123'
  });
  assert.equal(dossierRes.statusCode, 200);
  assert.equal(dossierRes.json().candidate.stage, 'watchlist');

  const method405 = await app.inject({
    method: 'DELETE',
    url: '/api/newborn/overview',
    headers: authHeaders
  });
  assert.equal(method405.statusCode, 405);
});
