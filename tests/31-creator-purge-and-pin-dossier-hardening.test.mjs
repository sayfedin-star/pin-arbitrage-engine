import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  isDeadZeroOrOneCreator,
  pruneDeadZeroOneCreators,
  trackCompetitor
} from '../src/modules/creators/competitors-crud.mjs';
import { fetchUniversalPinDossier } from '../src/modules/pins/dossier-reader.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';
import { getPinDetailsBodyHtml } from '../src/ui/pin-details/page-template.mjs';

function createPinDetailController(pinId = '1028861477393685945', envOverrides = {}) {
  const rawHtml = getPinDetailsClientAppScripts();
  const match = rawHtml.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match && match[1], 'Expected <script> block inside getPinDetailsClientAppScripts()');

  const fetchCalls = [];
  const defaultFetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts });
    return {
      ok: true,
      status: 200,
      async json() {
        return { success: true };
      }
    };
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    JSON,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    localStorage: {
      _map: new Map(),
      getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
      setItem(k, v) { this._map.set(k, String(v)); },
      removeItem(k) { this._map.delete(k); }
    },
    window: {
      location: { search: '', pathname: `/pin/${pinId}`, href: `http://localhost:3000/pin/${pinId}` },
      lucide: { createIcons() {} },
      dispatchEvent() {},
      addEventListener() {},
      removeEventListener() {}
    },
    document: {
      documentElement: { classList: { toggle() {}, add() {}, remove() {} } },
      createElement() {
        return { href: '', download: '', target: '', rel: '', click() {}, remove() {} };
      },
      body: { appendChild() {}, removeChild() {} }
    },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: envOverrides.fetch || defaultFetch,
    ...envOverrides
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  const script = new vm.Script(`${match[1]}\nthis.__pinDetailApp = pinDetailApp;`);
  script.runInContext(ctx);

  const app = ctx.__pinDetailApp(pinId);
  app.$nextTick = (fn) => { if (typeof fn === 'function') fn(); };
  return { app, fetchCalls, sandbox };
}

test('isDeadZeroOrOneCreator strictly matches ONLY synced (0,0) and (1,1) non-own/non-system profiles', () => {
  const syncedAt = '2026-11-27T11:03:00.000Z';

  // Must match: synced (0, 0) and (1, 1) competitor accounts
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 0, account_type: 'competitor', last_synced_at: syncedAt }), true);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 1, account_type: 'competitor', last_synced_at: syncedAt }), true);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: null, profile_views: 0, account_type: 'competitor', is_synced: true }), true);

  // Must NOT match: asymmetric accounts with real impressions or reach
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 424208, account_type: 'competitor', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 47, account_type: 'competitor', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 0, account_type: 'competitor', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 50, account_type: 'competitor', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 6820127, profile_views: 10000001, account_type: 'competitor', last_synced_at: syncedAt }), false);

  // Must NOT match: unsynced profiles awaiting initial crawl
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 0, account_type: 'competitor', last_synced_at: null }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 1, account_type: 'competitor', last_synced_at: null }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 0, account_type: 'competitor', is_synced: false }), false);

  // Must NOT match: protected account types
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 0, account_type: 'own', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 1, profile_views: 1, account_type: 'my_account', last_synced_at: syncedAt }), false);
  assert.equal(isDeadZeroOrOneCreator({ monthly_reach: 0, profile_views: 0, account_type: 'system', last_synced_at: syncedAt }), false);
});

test('pruneDeadZeroOneCreators atomically deletes doomed profiles, unlinks rookies, cleans watchlist, and no-ops on empty match', async () => {
  const executedQueries = [];
  const makeMockSql = (doomedRows) => {
    const fn = async (strings, ...values) => {
      const text = strings.join('?').replace(/\s+/g, ' ').trim();
      executedQueries.push({ text, values });
      if (/SELECT id, username FROM competitor_profiles/i.test(text)) {
        return doomedRows;
      }
      if (/DELETE FROM competitor_seed_pins/i.test(text)) {
        return [];
      }
      if (/DELETE FROM workspace_watchlist/i.test(text)) {
        return [{ id: 88 }];
      }
      if (/DELETE FROM competitor_profiles/i.test(text)) {
        return doomedRows;
      }
      return [];
    };
    fn.unsafe = async (raw) => {
      executedQueries.push({ text: raw, values: [] });
      return [];
    };
    fn.begin = async (cb) => cb(fn);
    return fn;
  };

  // Targeted prune with 2 doomed accounts
  const sqlTargeted = makeMockSql([
    { id: 101, username: 'mayzee48' },
    { id: 102, username: '@foisylinda6' }
  ]);
  const res = await pruneDeadZeroOneCreators(sqlTargeted, { competitorIds: [101, 102] });
  assert.equal(res.deleted_count, 2);
  assert.deepEqual(res.deleted_ids, [101, 102]);
  assert.deepEqual(res.deleted_usernames, ['mayzee48', 'foisylinda6']);
  assert.equal(res.deleted_watchlist_count, 1);
  assert.ok(executedQueries.some((q) => /UPDATE newborn_rookie_accounts SET promoted_competitor_id = NULL/i.test(q.text)));
  assert.ok(executedQueries.some((q) => /DELETE FROM workspace_watchlist/i.test(q.text)));
  assert.ok(executedQueries.some((q) => /DELETE FROM competitor_profiles/i.test(q.text)));

  // Global prune when no dead accounts exist
  executedQueries.length = 0;
  const sqlEmpty = makeMockSql([]);
  const emptyRes = await pruneDeadZeroOneCreators(sqlEmpty);
  assert.equal(emptyRes.deleted_count, 0);
  assert.equal(emptyRes.deleted_watchlist_count, 0);
  assert.equal(executedQueries.some((q) => /DELETE FROM competitor_profiles/i.test(q.text)), false);

  // Explicit empty array short-circuits without touching DB
  executedQueries.length = 0;
  const shortRes = await pruneDeadZeroOneCreators(sqlEmpty, { competitorIds: [] });
  assert.equal(shortRes.deleted_count, 0);
  assert.equal(executedQueries.length, 0);
});

test('trackCompetitor honors explicit tracking_mode (pulse_only vs full)', async () => {
  const capturedValues = [];
  const mockSql = async (strings, ...values) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/INSERT INTO competitor_profiles/i.test(text)) {
      capturedValues.push(values);
      return [{ id: 501, username: values[0], tracking_mode: values[6] }];
    }
    return [];
  };

  const pulseRes = await trackCompetitor(mockSql, { username: '@SpiceUpBites', tracking_mode: 'pulse_only' });
  assert.equal(pulseRes.tracking_mode, 'pulse_only');
  assert.equal(capturedValues[0][6], 'pulse_only');

  const fullRes = await trackCompetitor(mockSql, { username: 'spiceupbites', tracking_mode: 'full' });
  assert.equal(fullRes.tracking_mode, 'full');
  assert.equal(capturedValues[1][6], 'full');
});

test('fetchUniversalPinDossier surfaces full DB competitor_profile telemetry and sets both is_tracked_competitor & competitor_tracked', async () => {
  const pinId = '1028861477393685945';
  const mockSql = async (strings) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/FROM universal_master_pins/i.test(text)) {
      return [{
        pin_id: pinId,
        title: 'Best Crockpot White Chicken Chili',
        description: 'Creamy cozy slow cooker dinner',
        image_url: 'https://i.pinimg.com/originals/aa/bb/cc.jpg',
        destination_url: 'https://spiceupbites.com/crockpot-white-chicken-chili/',
        domain: 'spiceupbites.com',
        creator_username: 'spiceupbites',
        board_name: 'Crockpot Recipes',
        board_url: '/spiceupbites/crockpot-recipes/',
        pin_created_at: '2026-10-15T00:00:00.000Z',
        first_seen_at: '2026-11-20T00:00:00.000Z',
        last_seen_at: '2026-11-27T11:03:00.000Z',
        total_saves: 1240,
        repins: 1180,
        comments: 4,
        reactions: 12,
        shares: 35,
        creation_method: 'PIN_SCHEDULING',
        media_type: 'image',
        metadata: {
          pinner: { username: 'spiceupbites', follower_count: 1073, full_name: 'Spice Up Bites' },
          board: { name: 'Crockpot Recipes', pin_count: 85 }
        }
      }];
    }
    if (/FROM competitor_profiles/i.test(text)) {
      return [{
        id: 331,
        username: 'spiceupbites',
        display_name: 'Spice Up Bites',
        avatar_url: 'https://i.pinimg.com/avatars/spiceupbites.jpg',
        account_type: 'competitor',
        tracking_mode: 'pulse_only',
        is_paused: false,
        follower_count: 1073,
        monthly_reach: 6820127,
        profile_views: 10000001,
        total_pins: 14433,
        total_boards: 269,
        delta_reach_24h: 14200,
        reach_delta_7d: 88000,
        delta_views_24h: 0,
        views_delta_7d: 0,
        delta_pins_24h: 12,
        pins_delta_7d: 75,
        delta_boards_24h: 0,
        boards_delta_7d: 1,
        activity_status: 'active',
        last_synced_at: '2026-11-27T11:03:23.764946Z'
      }];
    }
    if (/FROM pins_daily_metrics/i.test(text)) {
      return [
        {
          id: 9001,
          recorded_date: '2026-11-26',
          save_count: 1100,
          repin_count: 1050,
          comment_count: 3,
          reaction_count: 10,
          share_count: 30,
          daily_save_velocity: 0,
          daily_repin_velocity: 0,
          recorded_at: '2026-11-26T11:00:00.000Z'
        },
        {
          id: 9002,
          recorded_date: '2026-11-27',
          save_count: 1240,
          repin_count: 1180,
          comment_count: 4,
          reaction_count: 12,
          share_count: 35,
          daily_save_velocity: 140,
          daily_repin_velocity: 130,
          recorded_at: '2026-11-27T11:03:00.000Z'
        }
      ];
    }
    return [];
  };

  const dossier = await fetchUniversalPinDossier({ sql: mockSql, pinId });
  assert.ok(dossier, 'Expected dossier object');
  assert.notEqual(dossier.success, false, 'Expected dossier lookup to succeed');
  const p1 = dossier.pillar_1_creator_context;
  assert.equal(p1.is_tracked_competitor, true);
  assert.equal(p1.competitor_tracked, true);
  assert.ok(p1.competitor_profile, 'Expected competitor_profile payload');
  assert.equal(p1.competitor_profile.username, 'spiceupbites');
  assert.equal(p1.competitor_profile.monthly_reach, 6820127);
  assert.equal(p1.competitor_profile.total_audience, 6820127);
  assert.equal(p1.competitor_profile.profile_views, 10000001);
  assert.equal(p1.competitor_profile.impressions, 10000001);
  assert.equal(p1.competitor_profile.total_pins, 14433);
  assert.equal(p1.competitor_profile.total_boards, 269);
  assert.equal(p1.competitor_profile.follower_count, 1073);
  assert.equal(p1.competitor_profile.tracking_mode, 'pulse_only');
  assert.equal(p1.competitor_profile.is_synced, true);
});

test('Pin Dossier UI controller: Creator DB metrics, 10M+ ceiling formatting, and tracked detection', () => {
  const { app } = createPinDetailController();

  assert.equal(app.isCreatorCeilingMetric(10000001), true);
  assert.equal(app.isCreatorCeilingMetric(10000000), false);
  assert.equal(app.formatCreatorMetric(10000001), '10M+');
  assert.equal(app.formatCreatorMetric(6820127), '6,820,127');
  assert.equal(app.formatCreatorMetric(null), '--');

  // Legacy competitor_tracked flag still recognized
  app.dossier = {
    pillar_1_creator_context: {
      competitor_tracked: true,
      competitor_profile: {
        username: 'spiceupbites',
        monthly_reach: 6820127,
        profile_views: 10000001,
        total_pins: 14433,
        total_boards: 269,
        follower_count: 1073,
        tracking_mode: 'pulse_only',
        is_synced: true
      }
    }
  };
  assert.equal(app.isTrackedCreator(), true);

  const metrics = app.getCreatorDbMetrics();
  assert.equal(metrics.hasMetrics, true);
  assert.equal(metrics.totalAudience, 6820127);
  assert.equal(metrics.impressions, 10000001);
  assert.equal(metrics.totalPins, 14433);
  assert.equal(metrics.totalBoards, 269);
  assert.equal(metrics.followers, 1073);
  assert.equal(metrics.trackingMode, 'pulse_only');

  // Untracked creator falls back cleanly to newborn_context metrics when available
  app.dossier = {
    pillar_1_creator_context: {
      is_tracked_competitor: false,
      competitor_tracked: false,
      competitor_profile: null
    },
    newborn_context: {
      creator_monthly_reach: 450000,
      creator_profile_views: 980000,
      creator_pin_count: 320,
      effective_creator_followers: 88
    }
  };
  assert.equal(app.isTrackedCreator(), false);
  const nbMetrics = app.getCreatorDbMetrics();
  assert.equal(nbMetrics.hasMetrics, true);
  assert.equal(nbMetrics.totalAudience, 450000);
  assert.equal(nbMetrics.impressions, 980000);
  assert.equal(nbMetrics.totalPins, 320);
  assert.equal(nbMetrics.followers, 88);
});

test('Pin Dossier UI controller: requestDeleteSnapshot + confirmDelete executes DELETE without isDeleting double-lock and reloads dossier', async () => {
  const requests = [];
  const { app } = createPinDetailController('1028861477393685945', {
    fetch: async (url, opts = {}) => {
      requests.push({ url: String(url), method: opts.method || 'GET' });
      if (String(url).includes('/snapshots/9002')) {
        return { ok: true, status: 200, async json() { return { success: true }; } };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            pin_id: '1028861477393685945',
            creative: { pin_id: '1028861477393685945', title: 'Updated' },
            snapshots: []
          };
        }
      };
    }
  });

  app.dossier = {
    pin_id: '1028861477393685945',
    creative: { pin_id: '1028861477393685945', title: 'Test' },
    snapshots: [{ id: 9002, snapshot_date: '2026-11-27', save_count: 1240 }]
  };
  app.requestDeleteSnapshot(9002);
  assert.equal(app.deleteModalOpen, true);
  assert.equal(app.deleteType, 'SNAPSHOT');

  await app.confirmDelete();

  assert.equal(app.isDeleting, false, 'isDeleting must reset cleanly after confirmDelete');
  assert.equal(app.deleteModalOpen, false, 'deleteModalOpen must close');
  assert.ok(
    requests.some((r) => r.method === 'DELETE' && r.url === '/api/pins/1028861477393685945/snapshots/9002'),
    'confirmDelete(SNAPSHOT) must fire DELETE /api/pins/:pinId/snapshots/:id (regression check for double-lock bug)'
  );
  assert.ok(
    requests.some((r) => r.method === 'GET' && r.url.startsWith('/api/pins/1028861477393685945')),
    'confirmDelete(SNAPSHOT) must refresh dossier after snapshot removal'
  );
  assert.equal(app.toast.show, true);
  assert.equal(app.toast.type, 'success');
});

test('Pin Dossier UI controller: savePinToWatchlist fails loudly on HTTP 500 instead of falsely removing', async () => {
  const { app } = createPinDetailController('1028861477393685945', {
    fetch: async () => ({
      ok: false,
      status: 500,
      async json() { return { error: 'Database unavailable' }; }
    })
  });

  app.isWatchlisted = true;
  app.watchlistItemId = null;

  await app.savePinToWatchlist();

  assert.equal(app.isWatchlisted, true, 'Must keep isWatchlisted=true when lookup fails');
  assert.equal(app.v4WatchlistBusy, false, 'Must release busy state');
  assert.equal(app.toast.show, true);
  assert.equal(app.toast.type, 'error', 'Must emit error toast on failed watchlist lookup');
  assert.match(app.toast.message, /Database unavailable/i);
});

test('Pin Dossier UI controller: loadDossier differentiates HTTP 503/500; downloadHdAsset blocks javascript: URLs; trackCreatorPulse updates both flags', async () => {
  // 503 DB busy preserves server error message and sets isDbBusy
  const env503 = createPinDetailController('1028861477393685945', {
    fetch: async () => ({ ok: false, status: 503, async json() { return { error: 'Pool saturated' }; } })
  });
  await env503.app.loadDossier();
  assert.equal(env503.app.isDbBusy, true);
  assert.match(env503.app.errorMessage, /Pool saturated/i);

  // 500 Server Error surfaces real error message (not "Not Found")
  const env500 = createPinDetailController('1028861477393685945', {
    fetch: async () => ({ ok: false, status: 500, async json() { return { error: 'Query timeout' }; } })
  });
  await env500.app.loadDossier();
  assert.equal(env500.app.isDbBusy, false);
  assert.match(env500.app.errorMessage, /Query timeout/i);

  // downloadHdAsset blocks javascript: URL
  await env500.app.downloadHdAsset('javascript:alert(1)', '1028861477393685945');
  assert.equal(env500.app.toast.show, true);
  assert.equal(env500.app.toast.type, 'error');
  assert.match(env500.app.toast.message, /invalid|unsafe/i);

  // trackCreatorPulse sets both flags and hydrates competitor_profile
  const envTrack = createPinDetailController('1028861477393685945', {
    fetch: async (url, opts = {}) => {
      if (opts.method === 'POST' && String(url) === '/api/creators') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              success: true,
              profile: {
                id: 331,
                username: 'spiceupbites',
                monthly_reach: 6820127,
                profile_views: 10000001,
                total_pins: 14433,
                total_boards: 269,
                follower_count: 1073,
                tracking_mode: 'pulse_only',
                last_synced_at: '2026-11-27T11:03:23.000Z'
              }
            };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            creative: { pin_id: '1028861477393685945' },
            pillar_1_creator_context: {
              is_tracked_competitor: true,
              competitor_tracked: true,
              competitor_profile: {
                id: 331,
                username: 'spiceupbites',
                monthly_reach: 6820127,
                profile_views: 10000001,
                total_pins: 14433,
                total_boards: 269,
                follower_count: 1073,
                tracking_mode: 'pulse_only',
                is_synced: true
              }
            },
            snapshots: []
          };
        }
      };
    }
  });
  envTrack.app.dossier = {
    creative: { pin_id: '1028861477393685945', creator_username: 'spiceupbites' },
    pillar_1_creator_context: { is_tracked_competitor: false, competitor_tracked: false }
  };
  await envTrack.app.trackCreatorPulse('spiceupbites');
  assert.equal(envTrack.app.isTrackedCreator(), true);
  assert.equal(envTrack.app.dossier.pillar_1_creator_context.is_tracked_competitor, true);
  assert.equal(envTrack.app.dossier.pillar_1_creator_context.competitor_tracked, true);
  assert.equal(envTrack.app.dossier.pillar_1_creator_context.competitor_profile.total_pins, 14433);
});

test('Pin Dossier page template renders Creator DB metrics container and bounded chart tooltip clamp', () => {
  const html = getPinDetailsBodyHtml('1028861477393685945');
  assert.ok(html.includes('data-testid="creator-db-metrics"'), 'Expected data-testid="creator-db-metrics" in Provenance Ledger');
  assert.ok(html.includes('isTrackedCreator()'), 'Expected isTrackedCreator() binding in page template');
  assert.ok(html.includes('formatCreatorMetric('), 'Expected formatCreatorMetric() formatting in page template');
  assert.ok(html.includes('Math.min(72, Math.max(4,'), 'Expected percentage-clamped chart hover tooltip');
});
