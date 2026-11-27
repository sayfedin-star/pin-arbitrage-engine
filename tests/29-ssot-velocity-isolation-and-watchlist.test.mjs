import test from 'node:test';
import assert from 'node:assert/strict';

import { ingestPinsBatch } from '../src/modules/pins/repository.mjs';
import { processCreatorCatalogPin } from '../scripts/creator-velocity-crawler.mjs';
import { buildFolderCrossoverMatrix } from '../src/modules/keywords/folders-crossover-builders.mjs';
import { handlePinsRoutes } from '../src/routes/pins.mjs';
import { getWatchlistPageHtml } from '../src/ui/watchlist/index.mjs';
import { getPinDetailsBodyHtml } from '../src/ui/pin-details/page-template.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';

test('Anomaly 1A: ingestPinsBatch decodes HTML entities and enforces prior-day pins_daily_metrics SSOT precedence over intraday caller values', async () => {
  const executedQueries = [];
  const capturedValues = [];

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    executedQueries.push(q);
    capturedValues.push(values);
    if (q.includes('INSERT INTO universal_master_pins')) {
      return [{ pin_id: '1108026314613587867', is_insert: false }];
    }
    return [];
  };
  mockSql.begin = async (fn) => fn(mockSql);

  const res = await ingestPinsBatch(mockSql, [
    {
      pin_id: '1108026314613587867',
      title: 'Cranberry &amp; Orange Sauce &#8211; Best Holiday Recipe &#127837;',
      description: 'Jalape&#241;o dip &quot;extra creamy&quot;',
      alt_text: 'Turkey gravy &mdash; homemade',
      board_name: 'Thanksgiving &amp; Fall',
      save_count: 22493,
      repin_count: 20312,
      has_explicit_saves: true,
      has_explicit_repins: true,
      // Simulate stale/intraday caller values that previously corrupted DB
      daily_save_velocity: 894,
      delta_saves_24h: 894,
      delta_repins_24h: 9,
      was_live_scraped: true
    }
  ], { pillar: 'creator_catalog', skipSerpUpsert: true });

  assert.equal(res.ok, true);
  assert.equal(res.ingested, 1);

  const upsertIdx = executedQueries.findIndex((q) => q.includes('INSERT INTO universal_master_pins'));
  assert.ok(upsertIdx >= 0, 'ingestPinsBatch must execute universal_master_pins CTE');

  // Verify JSONB payload decoded HTML entities on all creative text fields before hitting Postgres
  const payloadStr = capturedValues[upsertIdx][0];
  const parsedRows = JSON.parse(payloadStr);
  assert.equal(parsedRows.length, 1);
  assert.equal(parsedRows[0].title, 'Cranberry & Orange Sauce \u2013 Best Holiday Recipe \uD83C\uDF5D');
  assert.equal(parsedRows[0].description, 'Jalape\u00F1o dip "extra creamy"');
  assert.equal(parsedRows[0].alt_text, 'Turkey gravy \u2014 homemade');
  assert.equal(parsedRows[0].board_name, 'Thanksgiving & Fall');

  // Verify computed_batch CTE evaluates prior-day pins_daily_metrics BEFORE caller-supplied velocity/deltas
  const cteSql = executedQueries[upsertIdx];
  const velStart = cteSql.indexOf('computed_batch AS');
  const velEnd = cteSql.indexOf('AS effective_save_velocity');
  const saveVelBlock = cteSql.slice(velStart, velEnd);
  assert.ok(
    saveVelBlock.indexOf('eb.prev_save_count IS NOT NULL') < saveVelBlock.indexOf('eb.daily_save_velocity IS NOT NULL'),
    'effective_save_velocity must evaluate prior-day pins_daily_metrics before caller daily_save_velocity'
  );

  const repinDeltaStart = cteSql.indexOf('AS true_delta_saves_24h');
  const repinDeltaEnd = cteSql.indexOf('AS true_delta_repins_24h');
  const repinDeltaBlock = cteSql.slice(repinDeltaStart, repinDeltaEnd);
  assert.ok(
    repinDeltaBlock.indexOf('eb.prev_repin_count IS NOT NULL') < repinDeltaBlock.indexOf('eb.delta_repins_24h IS NOT NULL'),
    'true_delta_repins_24h must evaluate prior-day pins_daily_metrics before caller delta_repins_24h'
  );
});

test('Anomaly 1A: processCreatorCatalogPin on same-day second crawl emits null velocity/repin deltas instead of 2h intraday steps or frozen Math.max velocity', async () => {
  const nowMs = Date.now();
  // Simulate earlier crawl 2 hours ago on the SAME UTC calendar day (e.g., 09:37 UTC -> 11:03 UTC)
  const sameDayUtc = new Date(nowMs);
  sameDayUtc.setUTCHours(Math.max(0, sameDayUtc.getUTCHours() - 1), 0, 0, 0);

  const pinId = '1108026314613587867';
  const pidgetsMap = new Map([
    [
      pinId,
      {
        pin_id: pinId,
        saves: 22493,
        save_count: 22493,
        repins: 20312,
        repin_count: 20312,
        has_explicit_saves: true,
        has_explicit_repins: true,
        is_missing: false
      }
    ]
  ]);

  const collectors = { refreshedPins: [], metricSnapshots: [], masterPinsToSync: [] };
  const result = await processCreatorCatalogPin(
    {
      pin_id: pinId,
      title: 'a thanksgiving turkey gravy recipe with mashed potatoes',
      image_url: 'https://i.pinimg.com/gravy.jpg',
      domain: 'uploaded by user',
      creator_username: 'hollybest67',
      board_name: 'Recipes',
      creation_method: 'share_extension_android',
      visual_annotations: ['Thanksgiving Gravy'],
      ump_saves: 22484,
      ump_repins: 20303,
      ump_comments: 0,
      ump_shares: 344,
      prev_velocity: 894,
      last_scraped_at: sameDayUtc.toISOString(),
      last_updated_at: sameDayUtc.toISOString(),
      created_at_pinterest: '2026-10-23T00:00:00Z'
    },
    {
      fallbackUsername: 'hollybest67',
      useFreshnessGate: true,
      useUmpFields: true,
      forceRefresh: false,
      nowMs,
      pidgetsMap,
      fetchPinFromPinResourceFn: async () => null,
      fetchPinFromPinterestFn: async () => ({ ok: false })
    },
    collectors
  );

  assert.equal(result.refreshed, true);
  assert.equal(result.usedPidgets, true);
  assert.equal(collectors.masterPinsToSync.length, 1);

  const synced = collectors.masterPinsToSync[0];
  assert.equal(synced.saves, 22493);
  assert.equal(synced.repins, 20312);
  // Must NOT emit intraday +9 repins or frozen 894 velocity — must defer to prior-day DB SSOT via null
  assert.equal(synced.velocity, null, 'Same-day crawl must pass null velocity to defer to prior-day DB SSOT');
  assert.equal(synced.daily_save_velocity, null);
  assert.equal(synced.delta_saves_24h, null);
  assert.equal(synced.daily_repin_velocity, null);
  assert.equal(synced.delta_repins_24h, null, 'Same-day crawl must NEVER emit 2h intraday repin delta (+9)');
});

test('Anomaly 1B: buildFolderCrossoverMatrix isolates competitor_profiles strictly to active folder_id & workspace_id via folder_competitor_items', async () => {
  // Simulated relational tables: creators belong to Folder #8 (workspace 1) and Folder #99 (workspace 2), NOT Folder #13
  const competitorProfiles = [
    { id: 1, username: 'watchyummycrumb', monthly_reach: 120000, profile_views: 500000, delta_reach_24h: 19940, reach_delta_7d: 45000 },
    { id: 2, username: 'upstramblings', monthly_reach: 90000, profile_views: 400000, delta_reach_24h: 15680, reach_delta_7d: 30000 },
    { id: 3, username: 'betrfromscratch', monthly_reach: 60000, profile_views: 250000, delta_reach_24h: 3782, reach_delta_7d: 12000 }
  ];
  const keywordFolders = [
    { id: 8, workspace_id: 1, name: 'thanksgiving' },
    { id: 13, workspace_id: 1, name: 'cranberry sauce' },
    { id: 99, workspace_id: 2, name: 'other workspace' }
  ];
  const folderCompetitorItems = [
    { folder_id: 8, competitor_id: 1 },
    { folder_id: 8, competitor_id: 2 },
    { folder_id: 8, competitor_id: 3 },
    { folder_id: 99, competitor_id: 1 }
    // Folder #13 has ZERO rows in folder_competitor_items!
  ];

  const relationalMockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM domain_intelligence_rollup')) return [];
    if (q.includes('FROM competitor_profiles')) {
      assert.ok(
        q.includes('JOIN folder_competitor_items'),
        'competitor_profiles enrichment MUST join folder_competitor_items'
      );
      assert.ok(
        q.includes('JOIN keyword_folders'),
        'competitor_profiles enrichment MUST join keyword_folders for workspace scoping'
      );
      const [folderIdParam, widParam1, widParam2, usernamesParam] = values;
      const effectiveWid = widParam1 ?? widParam2 ?? null;
      const wantedUsers = new Set((usernamesParam || []).map((u) => String(u).toLowerCase()));
      return competitorProfiles.filter((cp) => {
        if (!wantedUsers.has(cp.username.toLowerCase())) return false;
        return folderCompetitorItems.some((fci) => {
          if (fci.competitor_id !== cp.id || fci.folder_id !== Number(folderIdParam)) return false;
          const kf = keywordFolders.find((f) => f.id === fci.folder_id);
          if (!kf) return false;
          return effectiveWid == null || kf.workspace_id === Number(effectiveWid);
        });
      });
    }
    return [];
  };

  const samplePins = [
    {
      pin_id: '912401205785408287',
      title: 'Cranberry brie bites',
      domain: 'uploaded by user',
      save_count: 2813,
      repin_count: 2792,
      daily_save_velocity: 224,
      delta_saves_24h: 224,
      delta_repins_24h: 221,
      creator_username: 'watchyummycrumb',
      is_newborn_tracked: true,
      rankings: []
    },
    {
      pin_id: '557531628905046632',
      title: 'Cranberry Dip',
      domain: 'uploaded by user',
      save_count: 5653,
      repin_count: 5618,
      daily_save_velocity: 499,
      delta_saves_24h: 499,
      delta_repins_24h: 496,
      creator_username: 'upstramblings',
      is_newborn_tracked: true,
      rankings: []
    }
  ];

  // Folder #13 (0 linked creators in Creator Hub) must show 0 competitor gains, NOT +39,402 leaked from Folder #8
  const folder13Matrix = await buildFolderCrossoverMatrix({
    sql: relationalMockSql,
    folder: { id: 13, workspace_id: 1, name: 'cranberry sauce', created_at: '2026-11-26T00:00:00Z' },
    folderKeywords: [],
    totalKeywords: 0,
    pinRows: samplePins,
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: [],
    workspaceId: 1,
    pulseAnalyticsPromise: Promise.resolve({ trendsLoaded: 0, trendsResults: [] })
  });

  assert.equal(folder13Matrix.summary.competitor_audience_gains.matched_creators_count, 0);
  assert.equal(folder13Matrix.summary.competitor_audience_gains['24h'], 0);
  assert.equal(folder13Matrix.summary.competitor_audience_gains['7d'], 0);
  assert.equal(folder13Matrix.summary.competitor_audience_gains.all, 0);

  // Folder #8 in workspace 1 DOES have those creators linked -> returns exact 2 matched creators (+35,620)
  const folder8Matrix = await buildFolderCrossoverMatrix({
    sql: relationalMockSql,
    folder: { id: 8, workspace_id: 1, name: 'thanksgiving', created_at: '2026-11-20T00:00:00Z' },
    folderKeywords: [],
    totalKeywords: 0,
    pinRows: samplePins,
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: [],
    workspaceId: 1,
    pulseAnalyticsPromise: Promise.resolve({ trendsLoaded: 0, trendsResults: [] })
  });

  assert.equal(folder8Matrix.summary.competitor_audience_gains.matched_creators_count, 2);
  assert.equal(folder8Matrix.summary.competitor_audience_gains['24h'], 19940 + 15680);

  // Folder #8 queried from wrong workspace 2 -> strict workspace isolation returns 0
  const wrongWsMatrix = await buildFolderCrossoverMatrix({
    sql: relationalMockSql,
    folder: { id: 8, workspace_id: 1, name: 'thanksgiving', created_at: '2026-11-20T00:00:00Z' },
    folderKeywords: [],
    totalKeywords: 0,
    pinRows: samplePins,
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: [],
    workspaceId: 2,
    pulseAnalyticsPromise: Promise.resolve({ trendsLoaded: 0, trendsResults: [] })
  });

  assert.equal(wrongWsMatrix.summary.competitor_audience_gains.matched_creators_count, 0);
  assert.equal(wrongWsMatrix.summary.competitor_audience_gains['24h'], 0);
});

test('Screenshots 5 & 6: GET /api/pins/:id returns workspace-scoped watchlist state & decoded entities, and Watchlist + Pin Dossier UI render inline SVG actions and active toggle state', async () => {
  const watchlistTable = [
    { id: 42, workspace_id: 1, entity_type: 'pin', entity_key: '1100145015261315845', notes: 'Turtle Oreo Balls' }
  ];

  const mockSql = async (strings, ...values) => {
    const q = strings.join(' ');
    if (q.includes('FROM universal_master_pins')) {
      return [
        {
          pin_id: '1100145015261315845',
          title: 'Turtle Oreo Balls &amp; Caramel &#8211; Easy Dessert',
          description: 'Rich chocolate &quot;no-bake&quot; treat',
          alt_text: 'Hand holding Oreo ball',
          board_name: 'Holiday &amp; Desserts',
          domain: 'tr.ee',
          destination_url: 'https://tr.ee/oreo-balls',
          image_url: 'https://i.pinimg.com/oreo.jpg',
          creator_username: 'sweetbaker',
          save_count: 7311,
          repin_count: 7301,
          daily_save_velocity: 213,
          delta_saves_24h: 213,
          delta_repins_24h: 210,
          metadata: {}
        }
      ];
    }
    if (q.includes('FROM pins_daily_metrics')) {
      return [
        { pin_id: '1100145015261315845', snapshot_date: '2026-11-27', save_count: 7311, repin_count: 7301, daily_save_velocity: 213, daily_repin_velocity: 210 },
        { pin_id: '1100145015261315845', snapshot_date: '2026-11-26', save_count: 7098, repin_count: 7091, daily_save_velocity: 0, daily_repin_velocity: 0 }
      ];
    }
    if (q.includes('FROM workspace_watchlist')) {
      const [wid, pid] = values;
      return watchlistTable.filter((w) => w.workspace_id === Number(wid) && w.entity_key === String(pid));
    }
    return [];
  };

  const makeRouteArgs = (workspaceId) => ({
    pathname: '/api/pins/1100145015261315845',
    method: 'GET',
    request: { headers: new Headers() },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId,
    jsonResponse: (payload, status = 200) => ({ status, body: payload }),
    methodNotAllowedResponse: () => ({ status: 405 }),
    buildCanonicalCacheKey: (k, p) => `${k}:${JSON.stringify(p)}`,
    invalidateEdgeCache: async () => {},
    isValidPinId: () => true,
    redactSecrets: (s) => s
  });

  // Workspace 1 has Pin #1100145015261315845 watchlisted
  const ws1Res = await handlePinsRoutes(makeRouteArgs(1));
  assert.equal(ws1Res.status, 200);
  assert.equal(ws1Res.body.is_watchlisted, true);
  assert.equal(ws1Res.body.watchlist_item_id, 42);
  assert.equal(ws1Res.body.watchlist.workspace_id, 1);
  assert.equal(ws1Res.body.creative.title, 'Turtle Oreo Balls & Caramel \u2013 Easy Dessert');
  assert.equal(ws1Res.body.creative.description, 'Rich chocolate "no-bake" treat');
  assert.equal(ws1Res.body.pillar_1_creator_context.board_name, 'Holiday & Desserts');

  // Workspace 2 does NOT have it watchlisted (strict workspace isolation)
  const ws2Res = await handlePinsRoutes(makeRouteArgs(2));
  assert.equal(ws2Res.status, 200);
  assert.equal(ws2Res.body.is_watchlisted, false);
  assert.equal(ws2Res.body.watchlist_item_id, null);

  // Verify Watchlist HTML renders inline SVG remove buttons & Open Pin link (no blank Actions column)
  const watchlistHtml = getWatchlistPageHtml('pin');
  assert.ok(!watchlistHtml.includes('data-lucide="trash-2"'), 'Dynamic Watchlist table rows must use inline SVGs instead of data-lucide="trash-2"');
  assert.ok(watchlistHtml.includes('Open Pin'), 'Saved Pins Actions column must include Open Pin action');
  assert.ok(watchlistHtml.includes('aria-label="Remove pin from Watchlist"'), 'Saved Pins Actions column must include accessible Remove button');

  // Verify Pin Details HTML renders reactive active Watchlisted state & inline SVG bookmark
  const pinHtml = getPinDetailsBodyHtml('1100145015261315845');
  assert.ok(pinHtml.includes(':data-watchlisted="isWatchlisted ? \'true\' : \'false\'"'));
  assert.ok(pinHtml.includes(':fill="isWatchlisted ? \'currentColor\' : \'none\'"'));
  assert.ok(pinHtml.includes("'Watchlisted' : 'Watchlist'"));

  // Behaviorally execute pinDetailApp() toggle logic to verify save -> watchlisted -> delete -> unwatchlisted transitions
  const scriptSrc = getPinDetailsClientAppScripts().replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
  const factory = new Function('window', 'document', 'localStorage', 'fetch', `${scriptSrc}\nreturn pinDetailApp;`);
  const fetchLog = [];
  const fakeFetch = async (url, opts = {}) => {
    fetchLog.push({ url, method: opts.method || 'GET' });
    if (url.startsWith('/api/pins/')) {
      return { ok: true, status: 200, json: async () => ws1Res.body };
    }
    if (url === '/api/watchlist/42' && opts.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({ success: true, deleted_id: 42 }) };
    }
    if (url === '/api/watchlist' && opts.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, item: { id: 99 } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const fakeWindow = { safeApiFetch: fakeFetch, location: { origin: 'http://localhost:3000', search: '' } };
  const fakeDoc = { referrer: '', documentElement: { classList: { contains: () => false } } };
  const pinDetailAppFn = factory(fakeWindow, fakeDoc, { getItem: () => null, setItem: () => {} }, fakeFetch);
  const app = pinDetailAppFn('1100145015261315845');

  // Stub DOM-only helper
  app.rebuildDateMapCache = () => {};
  app.hydrateUrlGlobalSaves = () => {};

  await app.loadDossier();
  assert.equal(app.isWatchlisted, true, 'loadDossier must hydrate isWatchlisted=true from /api/pins/:id');
  assert.equal(app.watchlistItemId, 42, 'loadDossier must hydrate watchlistItemId=42');

  // Click Watchlist button while watchlisted -> DELETE /api/watchlist/42
  await app.savePinToWatchlist();
  assert.equal(app.isWatchlisted, false, 'Clicking Watchlisted button must remove pin and set isWatchlisted=false');
  assert.equal(app.watchlistItemId, null);
  assert.ok(fetchLog.some((r) => r.method === 'DELETE' && r.url === '/api/watchlist/42'));

  // Click Watchlist button again -> POST /api/watchlist -> re-saves with item id 99
  await app.savePinToWatchlist();
  assert.equal(app.isWatchlisted, true, 'Clicking Watchlist button when unsaved must save pin and set isWatchlisted=true');
  assert.equal(app.watchlistItemId, 99);
  assert.ok(fetchLog.some((r) => r.method === 'POST' && r.url === '/api/watchlist'));
});
