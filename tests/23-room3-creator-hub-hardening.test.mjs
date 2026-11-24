import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';
import {
  getCompetitorDetail,
  listCompetitorAccountPins,
  listArchivedPins,
  computePinStage
} from '../src/modules/creators/creator-analytics.mjs';
import {
  getCompetitorRelatedIntersections
} from '../src/modules/creators/creator-harvest-and-archive.mjs';
import {
  listFolderCreatorsWithDiscovery,
  bulkPulseTrackFolderCreators
} from '../src/modules/keywords/folders-crud.mjs';
import { getDashboardHtml } from '../src/ui/dashboard/index.mjs';
import { getDashboardClientAppScript } from '../src/ui/dashboard/dashboard-client-app.mjs';
import { getDashboardBoardsAndPinMethods } from '../src/ui/dashboard/dashboard-client-boards.mjs';
import {
  getDashboardCreatorsFleetMethods,
  getDashboardCreatorsDossierMethods
} from '../src/ui/dashboard/dashboard-client-creators.mjs';
import { renderCreatorsLedgerView } from '../src/ui/dashboard/creators-ledger-view.mjs';
import { renderCreatorsProfileOverview } from '../src/ui/dashboard/creators-profile-overview.mjs';
import { renderCreatorsProfileBoards } from '../src/ui/dashboard/creators-profile-boards.mjs';
import { renderCreatorsAssignModal } from '../src/ui/dashboard/creators-assign-modal.mjs';

const noop = () => {};
const jsonResponse = (payload, status = 200) => ({ status, payload });
const methodNotAllowedResponse = (allowed = 'GET') => ({ status: 405, payload: { error: 'METHOD_NOT_ALLOWED', allowed } });

test('P0-1: POST /api/folders/:id/creators/bulk-remove and DELETE /api/folders/:id/creators/:cid only unlink folder rows (never global DELETE)', async () => {
  const executedSql = [];
  const invalidated = [];

  const mockSql = (strings, ...values) => {
    const q = strings.join(' ');
    executedSql.push({ q, values });
    if (q.includes('SELECT id, LOWER(username) AS uname') && q.includes('FROM competitor_profiles')) {
      return Promise.resolve([{ id: 202, uname: 'alpha' }]);
    }
    if (q.includes('DELETE FROM folder_competitor_items')) {
      const ids = values.find((v) => Array.isArray(v)) || [];
      return Promise.resolve(ids.map((id) => ({ competitor_id: id })));
    }
    if (q.includes('SELECT id FROM competitor_profiles WHERE LOWER(username)')) {
      const target = String(values[0] || '');
      return Promise.resolve(target === 'alpha' ? [{ id: 202 }] : []);
    }
    if ((q.includes('FROM keyword_folders') || q.includes('FROM folders')) && q.includes('WHERE id =')) {
      return Promise.resolve([{ id: 5, workspace_id: 1, name: 'Test Folder' }]);
    }
    return Promise.resolve([]);
  };
  mockSql.begin = async (fn) => fn(mockSql);

  const bulkRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators/bulk-remove',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/folders/5/creators/bulk-remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ competitor_ids: [101, 'serp_alpha', 'serp_missing'] })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (tag) => invalidated.push(tag)
  });

  assert.equal(bulkRes.status, 200);
  assert.equal(bulkRes.payload.success, true);
  assert.equal(bulkRes.payload.removed_count, 2);
  assert.equal(bulkRes.payload.skipped_count, 1);
  assert.ok(invalidated.includes('folders') && invalidated.includes('creators'));

  const serpDeleteRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators/serp_alpha',
    method: 'DELETE',
    request: new Request('https://app.hymum.com/api/folders/5/creators/serp_alpha', { method: 'DELETE' }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (tag) => invalidated.push(tag)
  });
  assert.equal(serpDeleteRes.status, 200);
  assert.equal(serpDeleteRes.payload.success, true);

  const unlinkedSerpDeleteRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators/serp_unknown',
    method: 'DELETE',
    request: new Request('https://app.hymum.com/api/folders/5/creators/serp_unknown', { method: 'DELETE' }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: mockSql,
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async (tag) => invalidated.push(tag)
  });
  assert.equal(unlinkedSerpDeleteRes.status, 200);
  assert.equal(unlinkedSerpDeleteRes.payload.unlinked, false);

  for (const { q } of executedSql) {
    assert.ok(!/DELETE\s+FROM\s+competitor_profiles/i.test(q), 'Scoped folder unlink MUST NEVER delete global competitor_profiles');
    assert.ok(!/DELETE\s+FROM\s+competitor_boards/i.test(q), 'Scoped folder unlink MUST NEVER delete competitor_boards');
  }

  const fleetSrc = getDashboardCreatorsFleetMethods();
  assert.ok(fleetSrc.includes("'/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/creators/bulk-remove'"), 'Client fleet bulk delete must call scoped bulk-remove');
  assert.ok(fleetSrc.includes("'/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/creators/' + encodeURIComponent(seg)"), 'Client single delete must call scoped folder creator DELETE');
});

test('P0-2 & P1-1: getCompetitorDetail uses real SUM(share_count), UMP fallback, and computes winning_hit_rate_pct with >= 2 snapshots', async () => {
  const executedSql = [];
  const mockSql = (strings) => {
    const q = strings.join(' ');
    executedSql.push(q);
    if (q.includes('FROM competitor_profiles')) {
      return Promise.resolve([{
        id: 390,
        username: 'thecozycook',
        display_name: 'The Cozy Cook',
        website_url: 'thecozycook.com',
        monthly_reach: 500000,
        profile_views: 1200000,
        total_pins: 37,
        total_boards: 4,
        follower_count: 85000,
        metadata: {}
      }]);
    }
    if (q.includes('FROM competitor_boards')) {
      return Promise.resolve([]);
    }
    if (q.includes('FROM competitor_history_snapshots')) {
      return Promise.resolve([
        { id: 1, competitor_id: 390, monthly_reach: 450000, profile_views: 1000000, follower_count: 80000, total_pins: 30, total_boards: 4, recorded_date: '2026-10-01', created_at: '2026-10-01T00:00:00Z', metadata: {} },
        { id: 2, competitor_id: 390, monthly_reach: 500000, profile_views: 1200000, follower_count: 85000, total_pins: 37, total_boards: 4, recorded_date: '2026-10-20', created_at: '2026-10-20T00:00:00Z', metadata: {} }
      ]);
    }
    if (q.includes('AS total_shares') && q.includes('AS total_catalog_pins')) {
      return Promise.resolve([{
        total_catalog_pins: 37,
        total_saves: 1215662,
        total_repins: 5000,
        total_shares: 4689,
        winning_pins_count: 15,
        official_urls_count: 37,
        external_pins_count: 0,
        external_saves: 0,
        dated_pins_count: 37,
        earliest_pin_at: '2026-01-01T00:00:00Z',
        latest_pin_at: '2026-10-20T00:00:00Z',
        span_days: 292
      }]);
    }
    if (q.includes('AS curator_pins')) {
      return Promise.resolve([{
        curator_pins: 0,
        curator_saves: 0,
        ecosystem_total_pins: 37,
        ecosystem_total_saves: 1215662,
        ecosystem_unique_urls: 37
      }]);
    }
    return Promise.resolve([]);
  };

  const detail = await getCompetitorDetail(mockSql, 390);
  assert.ok(detail, 'detail must resolve');
  assert.equal(detail.engagement.total_saves, 1215662);
  assert.equal(detail.engagement.total_shares, 4689, 'Must use real SUM(share_count), not fabricated repin formula');
  assert.equal(detail.pinning_velocity.winning_pins_count, 15);
  assert.equal(detail.pinning_velocity.winning_hit_rate_pct, 40.5, 'winning_hit_rate_pct must be computed even with >= 2 snapshots');
  assert.equal(detail.pinning_velocity.pins_per_winner, 2.5);

  const aggSql = executedSql.find((q) => q.includes('AS total_shares'));
  assert.ok(aggSql && aggSql.includes('LOWER(TRIM(ump.creator_username))') && aggSql.includes('NOT EXISTS (SELECT 1 FROM competitor_board_pins'), 'getCompetitorDetail aggregate must include UMP creator_username fallback');
});

test('P0-2 & P2: listFolderCreatorsWithDiscovery computes real cadence, keeps combined_pins + ex-mega sub-line, and excludes keyword_ignored_pins', async () => {
  const executedSql = [];
  const mockSql = (strings) => {
    const q = strings.join(' ');
    executedSql.push(q);
    if (q.includes('SELECT id, name FROM folders') || q.includes('FROM keyword_folders')) {
      return Promise.resolve([{ id: 5, workspace_id: 1, name: 'Test Folder' }]);
    }
    if (q.includes('WITH all_folder_pins AS') && !q.includes('FROM folder_competitor_items')) {
      return Promise.resolve([
        {
          id: '10',
          competitor_id: 10,
          username: 'thecozycook',
          pin_count: 18,
          active_pin_count: 15,
          vault_pin_count: 3,
          top_pin_saves: 50000,
          max_velocity: 120,
          display_name: 'The Cozy Cook',
          avatar_url: 'https://i.pinimg.com/thecozycook.jpg',
          monthly_reach: 500000,
          profile_views: 1200000,
          total_pins: 3650,
          total_boards: 20,
          follower_count: 85000,
          tracking_mode: 'full',
          custom_label: 'Niche',
          discovery_source: 'serp_auto',
          delta_reach_24h: 1000,
          reach_delta_7d: 5000,
          delta_views_24h: 2000,
          views_delta_7d: 10000,
          delta_pins_24h: 5,
          delta_boards_24h: 1,
          pins_delta_7d: 35,
          boards_delta_7d: 1,
          is_linked: true,
          is_tracked: true,
          auto_discovered: true
        },
        {
          id: '11',
          competitor_id: 11,
          username: 'etsy',
          pin_count: 4,
          active_pin_count: 4,
          vault_pin_count: 0,
          top_pin_saves: 12000,
          max_velocity: 15,
          display_name: 'Etsy',
          avatar_url: '',
          monthly_reach: 10000000,
          profile_views: 10000001,
          total_pins: 956000000,
          total_boards: 50,
          follower_count: 1000000,
          tracking_mode: 'pulse_only',
          custom_label: '',
          discovery_source: 'serp_auto',
          delta_reach_24h: -500,
          reach_delta_7d: 0,
          delta_views_24h: 0,
          views_delta_7d: 0,
          delta_pins_24h: 0,
          delta_boards_24h: 0,
          pins_delta_7d: 0,
          boards_delta_7d: 0,
          is_linked: true,
          is_tracked: true,
          auto_discovered: true
        }
      ]);
    }
    return Promise.resolve([]);
  };

  const res = await listFolderCreatorsWithDiscovery(mockSql, 5, { includeDiscovery: true });
  assert.equal(res.all_creators.length, 2);
  const cozy = res.all_creators.find((c) => c.username === 'thecozycook');
  const etsy = res.all_creators.find((c) => c.username === 'etsy');
  assert.equal(cozy.pins_per_day, 5, 'Cadence must use pins_delta_7d/7 = 5, NOT total_pins/365 = 10');
  assert.equal(etsy.pins_per_day, null, 'Creator without measured pin delta must return pins_per_day: null (no /365 fabrication)');
  assert.equal(res.totals.combined_pins, 956003650);
  assert.equal(res.totals.combined_pins_ex_aggregators, 3650);
  assert.equal(res.totals.mega_aggregator_count, 1);
  assert.equal(res.totals.delta_24h, 500, 'Signed net delta_24h must preserve negatives (1000 + -500 = 500)');

  const ceilingRes = await listFolderCreatorsWithDiscovery((strings) => {
    const q = strings.join(' ');
    if (q.includes('SELECT id, name FROM folders') || q.includes('FROM keyword_folders')) {
      return Promise.resolve([{ id: 5, workspace_id: 1, name: 'Test Folder' }]);
    }
    if (q.includes('WITH all_folder_pins AS') && !q.includes('FROM folder_competitor_items')) {
      return Promise.resolve([{
        id: '12',
        competitor_id: 12,
        username: 'ceiling_creator',
        pin_count: 5,
        active_pin_count: 5,
        vault_pin_count: 0,
        top_pin_saves: 1000,
        max_velocity: 10,
        monthly_reach: 14000000,
        profile_views: 15000000,
        total_pins: 500,
        total_boards: 10,
        follower_count: 1000,
        delta_reach_24h: 3999999,
        reach_delta_7d: 3999999,
        delta_views_24h: 4999999,
        views_delta_7d: 4999999,
        delta_pins_24h: 0,
        pins_delta_7d: 0,
        is_linked: true,
        is_tracked: true,
        auto_discovered: false
      }]);
    }
    return Promise.resolve([]);
  }, 5, { includeDiscovery: true });
  assert.equal(ceilingRes.all_creators[0].delta_reach_24h, 0, 'sanitizeStoredCeilingDelta must suppress 10M+ ceiling delta');
  assert.equal(ceilingRes.totals.delta_24h, 0);

  const rankingSql = executedSql.find((q) => q.includes('WITH all_folder_pins AS') && !q.includes('FROM folder_competitor_items'));
  const linkedSql = executedSql.find((q) => q.includes('WITH all_folder_pins AS') && q.includes('FROM folder_competitor_items'));
  assert.ok(rankingSql.includes('keyword_ignored_pins'), 'Discovery CTE must exclude keyword_ignored_pins');
  assert.ok(linkedSql.includes('keyword_ignored_pins') && linkedSql.includes('LEFT JOIN aggregated_creators'), 'Linked items query must LEFT JOIN aggregated_creators and exclude keyword_ignored_pins');

  const ledgerHtml = renderCreatorsLedgerView();
  const overviewHtml = renderCreatorsProfileOverview();
  const fleetSrc = getDashboardCreatorsFleetMethods();
  assert.ok(!ledgerHtml.includes("'1d ago'") && !fleetSrc.includes("'1d ago'"), 'No fabricated 1d ago fallback');
  assert.ok(!overviewHtml.includes("'20d span'"), 'No fabricated 20d span fallback');
  assert.ok(!ledgerHtml.includes('images.unsplash.com'), 'No broken external Unsplash image URLs');
});

test('P0-3: Workspace cookie isolation rejects body.cookie, unpacks { rawCookie }, secures audit-sweep, and bulkPulseTrackFolderCreators preserves full tracking', async () => {
  const outboundCookies = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const c = init?.headers?.Cookie || init?.headers?.cookie || '';
    outboundCookies.push(String(c));
    return new Response(JSON.stringify({ resource_response: { data: { username: 'target', monthly_reach: 100 } } }), { status: 200 });
  };

  try {
    for (const ep of [
      '/api/creators/quick-pulse',
      '/api/creators/deep-harvest',
      '/api/creators/audit-sweep',
      '/api/creators/sync',
      '/api/creators/sync-boards',
      '/api/creators/sync-pins',
      '/api/creators/related-pins/harvest-live'
    ]) {
      const rejectRes = await handleCreatorsRoutes({
        pathname: ep,
        method: 'POST',
        request: new Request(`https://app.hymum.com${ep}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 10, competitor_id: 10, username: 'target', pin_id: '123456', cookie: 'csrftoken=hijack; _pinterest_sess=hijack' })
        }),
        searchParams: new URLSearchParams(),
        env: { PINTEREST_COOKIE: 'csrftoken=ws1; _pinterest_sess=ws1_secret' },
        ctx: {},
        sql: () => Promise.resolve([]),
        workspaceId: 2,
        jsonResponse,
        clampLimit: (v, d) => Number(v) || d,
        buildCanonicalCacheKey: () => 'k',
        getCachedOrFetch: async (_k, fn) => fn(),
        invalidateEdgeCache: noop,
        safeWaitUntil: noop,
        tripPinterestCircuitBreaker: noop
      });
      assert.equal(rejectRes.status, 400, `${ep} must reject client body.cookie with HTTP 400`);
      assert.equal(rejectRes.payload.error, 'CLIENT_COOKIE_FORBIDDEN');
    }

    const folderRejectRes = await handleFoldersRoutes({
      pathname: '/api/folders/5/creators/bulk-pulse-track',
      method: 'POST',
      request: new Request('https://app.hymum.com/api/folders/5/creators/bulk-pulse-track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: ['target'], cookie: 'csrftoken=hijack; _pinterest_sess=hijack' })
      }),
      searchParams: new URLSearchParams(),
      env: {},
      ctx: {},
      sql: (strings) => {
        const q = strings.join(' ');
        if (q.includes('FROM keyword_folders') || q.includes('FROM folders')) {
          return Promise.resolve([{ id: 5, workspace_id: 2, name: 'F5' }]);
        }
        return Promise.resolve([]);
      },
      workspaceId: 2,
      jsonResponse,
      methodNotAllowedResponse,
      invalidateEdgeCache: noop
    });
    assert.equal(folderRejectRes.status, 400, 'POST /api/folders/:id/creators/bulk-pulse-track must reject body.cookie with HTTP 400');

    const ws2Sql = (strings) => {
      const q = strings.join(' ');
      if (q.includes('FROM workspace_settings')) return Promise.resolve([]);
      if (q.includes('FROM competitor_profiles')) return Promise.resolve([{ id: 10, username: 'target' }]);
      return Promise.resolve([]);
    };

    const pulseRes = await handleCreatorsRoutes({
      pathname: '/api/creators/quick-pulse',
      method: 'POST',
      request: new Request('https://app.hymum.com/api/creators/quick-pulse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 10 })
      }),
      searchParams: new URLSearchParams(),
      env: { PINTEREST_COOKIE: 'csrftoken=ws1_leak; _pinterest_sess=ws1_leak' },
      ctx: {},
      sql: ws2Sql,
      workspaceId: 2,
      jsonResponse,
      clampLimit: (v, d) => Number(v) || d,
      buildCanonicalCacheKey: () => 'k',
      getCachedOrFetch: async (_k, fn) => fn(),
      invalidateEdgeCache: noop,
      safeWaitUntil: noop,
      tripPinterestCircuitBreaker: noop
    });
    assert.equal(pulseRes.status, 200);

    for (const sweepBody of [{ competitor_id: 10, username: 'target' }, { competitor_ids: [10] }]) {
      const sweepRes = await handleCreatorsRoutes({
        pathname: '/api/creators/audit-sweep',
        method: 'POST',
        request: new Request('https://app.hymum.com/api/creators/audit-sweep', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sweepBody)
        }),
        searchParams: new URLSearchParams(),
        env: { PINTEREST_COOKIE: 'csrftoken=ws1_leak; _pinterest_sess=ws1_leak' },
        ctx: {},
        sql: ws2Sql,
        workspaceId: 2,
        jsonResponse,
        clampLimit: (v, d) => Number(v) || d,
        buildCanonicalCacheKey: () => 'k',
        getCachedOrFetch: async (_k, fn) => fn(),
        invalidateEdgeCache: noop,
        safeWaitUntil: noop,
        tripPinterestCircuitBreaker: noop
      });
      assert.equal(sweepRes.status, 200);
    }

    const bulkQueries = [];
    const bulkSql = (strings) => {
      const q = strings.join(' ');
      bulkQueries.push(q);
      if (q.includes('FROM keyword_folders')) {
        return Promise.resolve([{ id: 5, name: 'F5', workspace_id: 2, metadata: {} }]);
      }
      if (q.includes('FROM workspace_settings')) {
        return Promise.resolve([]);
      }
      if (q.includes('INSERT INTO competitor_profiles')) {
        return Promise.resolve([{ id: 10, username: 'thecozycook' }]);
      }
      return Promise.resolve([]);
    };

    const prevProcCookie = process.env.PINTEREST_COOKIE;
    process.env.PINTEREST_COOKIE = 'csrftoken=ws1_leak; _pinterest_sess=ws1_leak';
    try {
      await bulkPulseTrackFolderCreators(bulkSql, 5, {
        usernames: ['thecozycook'],
        custom_label: 'CustomTag',
        sync_now: true
      }, { env: { PINTEREST_COOKIE: 'csrftoken=ws1_leak; _pinterest_sess=ws1_leak' }, workspaceId: 2 });
    } finally {
      if (prevProcCookie === undefined) delete process.env.PINTEREST_COOKIE;
      else process.env.PINTEREST_COOKIE = prevProcCookie;
    }

    const upsertSql = bulkQueries.find((q) => q.includes('INSERT INTO competitor_profiles'));
    assert.ok(upsertSql, 'Expected bulkPulseTrackFolderCreators upsert SQL');
    assert.ok(upsertSql.includes("WHEN competitor_profiles.tracking_mode = 'full' THEN 'full'"), 'Must preserve full tracking_mode');
    assert.ok(upsertSql.includes('NULLIF(TRIM(competitor_profiles.custom_label)'), 'Must preserve existing custom_label');

    assert.ok(outboundCookies.length > 0, 'Expected outbound fetch calls');
    assert.ok(outboundCookies.every((c) => !c.includes('ws1_leak')), `Workspace 2 outbound calls MUST NEVER leak Workspace 1 cookie (got: ${outboundCookies.join(' | ')})`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P0-4 & P0-5: Anti-NaN selection keys, pulsing null guard, assign modal wiring, and folder linking', async () => {
  const vmCtx = {};
  const joinedMethods = [getDashboardCreatorsFleetMethods(), getDashboardCreatorsDossierMethods()]
    .map((s) => s.trim().replace(/,\s*$/, ''))
    .filter(Boolean)
    .join(',\n');
  const fnBody = `return { ${joinedMethods} };`;
  const methods = new Function(fnBody)();
  const sampleRows = [
    { id: 'serp_alpha', username: 'alpha' },
    { id: 12, username: 'beta' },
    { id: null, username: 'gamma' }
  ];
  Object.assign(vmCtx, methods, {
    competitors: sampleRows,
    filteredCompetitors: sampleRows,
    selectedCompetitorIds: []
  });

  assert.equal(vmCtx.getCreatorSelectionKey({ id: 'serp_alpha', username: 'alpha' }), 'serp_alpha');
  assert.equal(vmCtx.getCreatorSelectionKey({ id: null, username: 'gamma' }), 'serp_gamma');
  assert.equal(vmCtx.getCreatorSelectionKey({ id: 12, username: 'beta' }), '12');

  vmCtx.toggleSelectCompetitor('serp_alpha');
  assert.deepEqual(vmCtx.selectedCompetitorIds, ['serp_alpha']);
  assert.ok(!vmCtx.selectedCompetitorIds.some((x) => Number.isNaN(x)), 'Must never push NaN');
  vmCtx.toggleSelectCompetitor('serp_alpha');
  assert.deepEqual(vmCtx.selectedCompetitorIds, [], 'Toggling serp_* twice must cleanly unselect');

  vmCtx.toggleSelectAllCompetitors();
  assert.equal(vmCtx.selectedCompetitorIds.length, 3);
  assert.ok(vmCtx.selectedCompetitorIds.every((x) => typeof x === 'string' && !x.includes('NaN')));

  const ledgerHtml = renderCreatorsLedgerView();
  assert.ok(ledgerHtml.includes('pulsingCreatorId !== null && pulsingCreatorId === getCreatorSelectionKey(c)'), 'Pulse button must guard against null === null');

  const assignHtml = renderCreatorsAssignModal();
  assert.ok(assignHtml.includes('assignCatalogCreators'), 'Assign modal must read from assignCatalogCreators');
  assert.ok(assignHtml.includes('c.avatar_url') && !assignHtml.includes('c.image_url'), 'Assign modal must render c.avatar_url');

  const boardsSrc = fs.readFileSync(path.join(process.cwd(), 'src/ui/dashboard/dashboard-client-boards.mjs'), 'utf8');
  assert.ok(boardsSrc.includes('await this.ensureCreatorLinkedToFolder(createdCompetitorId || handle, this.scopedFolderId)'), 'submitTrackCreatorUnified must idempotently link creator into scopedFolderId');

  // Behavioral check: submitTrackCreatorUnified on an already-linked creator must NEVER send DELETE
  const prevWin = globalThis.window;
  const apiCalls = [];
  globalThis.window = {
    apiFetch: async (url, opts = {}) => {
      apiCalls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body || null });
      if (String(url).endsWith('/api/creators') && opts.method === 'POST') {
        return { ok: true, json: async () => ({ success: true, competitor: { id: 77, username: 'already_linked' } }) };
      }
      return { ok: true, json: async () => ({ success: true, creators: [] }) };
    },
    safeApiFetch: async (url, opts = {}) => {
      apiCalls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body || null });
      return { ok: true, json: async () => ({ success: true }) };
    },
    lucide: { createIcons: noop }
  };
  try {
    const boardsMethods = new Function(`return { ${getDashboardBoardsAndPinMethods().trim().replace(/,\s*$/, '')} };`)();
    const trackCtx = {
      ...methods,
      ...boardsMethods,
      scopedFolderId: '5',
      newCompetitorHandle: 'already_linked',
      newCompetitorAlsoTrack: true,
      newCompetitorDiscoverPins: false,
      newCompetitorInterval: 'daily',
      newCompetitorAutoArchiveWinning: true,
      folderCreatorMap: { '5': new Set([77, 'already_linked']) },
      foldersList: [{ id: 5, name: 'F5', creator_count: 1 }],
      getApiUrl: (u) => u,
      showToast: noop,
      syncCompetitor: async () => {},
      loadFolderCreators: async () => {},
      $nextTick: noop
    };
    await trackCtx.submitTrackCreatorUnified();
    assert.equal(apiCalls.some((c) => c.method === 'DELETE'), false, 'submitTrackCreatorUnified must NEVER unlink an already-linked creator');
  } finally {
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }

  // Server check: POST /api/folders/:id/creators with action:'link' must NOT unlink an already-linked creator
  const linkSqlQueries = [];
  const linkRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators',
    method: 'POST',
    request: new Request('https://app.hymum.com/api/folders/5/creators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'already_linked', action: 'link' })
    }),
    searchParams: new URLSearchParams(),
    env: {},
    ctx: {},
    sql: (strings) => {
      const q = strings.join(' ');
      linkSqlQueries.push(q);
      if (q.includes('FROM keyword_folders') || q.includes('FROM folders')) return Promise.resolve([{ id: 5, workspace_id: 1 }]);
      if (q.includes('FROM competitor_profiles')) return Promise.resolve([{ id: 77 }]);
      if (q.includes('FROM folder_competitor_items')) return Promise.resolve([{ id: 999 }]);
      return Promise.resolve([]);
    },
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(linkRes.status, 200);
  assert.equal(linkRes.payload.linked, true);
  assert.equal(linkSqlQueries.some((q) => /DELETE\s+FROM\s+folder_competitor_items/i.test(q)), false, 'action:link must never DELETE existing link');

  // Behavioral check: folderCompetitorTotals must return zeroes when filter/search yields 0 rows
  const appScriptBody = getDashboardClientAppScript()
    .replace(/^\s*<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '');
  const makeApp = new Function(`${appScriptBody}\nreturn dashboardApp;`)();
  const appInstance = makeApp('5');
  appInstance.competitors = [{ id: 1, username: 'alpha', monthly_reach: 50000, profile_views: 120000, total_pins: 300, delta_reach_24h: 250 }];
  appInstance.folderCompetitorTotalsData = { combined_audience: 50000, combined_impressions: 120000, combined_pins: 300, total_creators: 1, delta_24h: 250 };
  appInstance.competitorSearch = 'nonexistent_creator_xyz';
  assert.equal(appInstance.filteredCompetitors.length, 0);
  assert.deepEqual(appInstance.folderCompetitorTotals, {
    combined_audience: 0,
    combined_impressions: 0,
    combined_pins: 0,
    combined_pins_ex_aggregators: 0,
    mega_aggregator_count: 0,
    total_creators: 0,
    delta_24h: 0,
    avg_pinning_cadence: 0
  });
});

test('P1-2, P1-3 & P1-4: listCompetitorAccountPins scope=all + keyword_ignored_pins + delta_saves_24h null, intersections 0%, cb hash, board sections & read-only board-detail', async () => {
  const capturedQueries = [];
  const mockSql = (strings) => {
    const q = strings.join(' ');
    capturedQueries.push(q);
    if (q.includes('FROM competitor_profiles')) {
      return Promise.resolve([{ id: 455, username: 'curator', website_url: 'https://curator.example', primary_domain: 'curator.example' }]);
    }
    if (q.includes('SELECT DISTINCT board_name, board_slug')) {
      return Promise.resolve([]);
    }
    if (q.includes('SELECT clean_dom FROM')) {
      return Promise.resolve([{ clean_dom: 'curator.example' }]);
    }
    if (q.includes('SELECT') && q.includes('AS catalog_total')) {
      return Promise.resolve([{ catalog_total: 2, external_pins_total: 0, qualified_total: 2, ranked_total: 1, high_velocity_total: 1 }]);
    }
    if (q.includes('AS curator_pins_total')) {
      return Promise.resolve([{ curator_pins_total: 5 }]);
    }
    if (q.includes('AS full_count')) {
      return Promise.resolve([{
        full_count: 2,
        pin_id: 'p1',
        title: 'Growing Pin',
        save_count: 500,
        repin_count: 100,
        comment_count: 12,
        share_count: 25,
        velocity: 18.5,
        board_name: 'Recipes',
        board_slug: 'recipes',
        clean_domain: 'curator.example',
        is_official_domain: true,
        is_product: true,
        curator_username: 'curator',
        created_at_pinterest: '2026-01-01T00:00:00Z',
        first_discovered_at: '2026-01-01T00:00:00Z'
      }]);
    }
    return Promise.resolve([]);
  };

  const pinsResult = await listCompetitorAccountPins(mockSql, 455, {
    scope: 'all',
    stage: 'GROWING',
    product_only: 'true',
    limit: 500
  });

  assert.equal(pinsResult.total, 2);
  assert.equal(pinsResult.pins.length, 1);
  assert.equal(pinsResult.pins[0].delta_saves_24h, null, 'delta_saves_24h must be null rather than copying velocity');

  const mainPinQuery = capturedQueries.find((q) => q.includes('AS full_count'));
  const totalsQuery = capturedQueries.find((q) => q.includes('AS catalog_total'));
  assert.ok(mainPinQuery.includes("'all'") && mainPinQuery.includes('keyword_ignored_pins') && mainPinQuery.includes('LOWER(TRIM(ump.creator_username))'), 'Main pin query must handle scope=all, UMP fallback, and keyword_ignored_pins');
  assert.ok(mainPinQuery.includes("INTERVAL '14 days'") && !mainPinQuery.includes('ep.repin_count >= 100'), 'COOLING must enforce 14d age guard and eco_pool qualification must match direct scope');
  assert.ok(totalsQuery.includes('keyword_ignored_pins') && totalsQuery.includes('LOWER(TRIM(ump.creator_username))'), 'Unfiltered totals query must exclude keyword_ignored_pins and include UMP fallback');

  assert.equal(computePinStage(1.0, 0, 5), 'NEW');
  assert.equal(computePinStage(1.0, 0, null), 'COOLING', 'NULL-date pin must not falsely classify as NEW');

  const archived = await listArchivedPins((strings) => {
    const q = strings.join(' ');
    if (q.includes('SELECT COUNT(*)')) return Promise.resolve([{ total: 1 }]);
    return Promise.resolve([{
      pin_id: 'arch1',
      saves: 120,
      repins: 10,
      comments: 0,
      share_count: 0,
      velocity: 6.4,
      delta_saves_24h: null,
      delta_repins_24h: null,
      created_at_pinterest: null,
      first_seen_at: null
    }]);
  }, { limit: 10 });
  assert.equal(archived[0].delta_saves_24h, null, 'listArchivedPins must return null when delta_saves_24h is null');
  assert.equal(archived[0].stage, 'MATURE');

  const emptyIntersections = await getCompetitorRelatedIntersections((strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM competitor_profiles')) return Promise.resolve([{ id: 390 }]);
    if (q.includes('FROM competitor_seed_pins')) {
      return Promise.resolve([{ total_seeds: 0, total_nodes: 0, same_account_nodes: 0, same_account_high_rep: 0, rival_nodes: 0 }]);
    }
    return Promise.resolve([]);
  }, 390);
  assert.equal(emptyIntersections.stats.total_nodes, 0);
  assert.equal(emptyIntersections.stats.leakage_rate_pct, 0, 'Empty graph must have 0% leakage, NOT 100%');

  const ingestSrc = fs.readFileSync(path.join(process.cwd(), 'src/modules/creators/creator-ingest.mjs'), 'utf8');
  assert.ok(ingestSrc.includes("md5(${String(numericId)} || ':' || lower(trim(cp.board_name)))"), 'cb-* synthetic board hash must include numericId prefix');

  const boardsHtml = renderCreatorsProfileBoards();
  assert.ok(boardsHtml.includes('openBoardSectionsModal(b.board_id || b.id, b.name)'), 'Board sections modal must prefer real Pinterest b.board_id');

  const crudSrc = fs.readFileSync(path.join(process.cwd(), 'src/modules/creators/competitors-crud.mjs'), 'utf8');
  assert.ok(
    crudSrc.includes('avatar_url, display_name, monthly_reach, profile_views') &&
      crudSrc.includes('total_pins, total_boards, follower_count'),
    'syncCompetitorProfile SELECT must include Zero-Drop Shield columns'
  );

  let fetchCalled = false;
  const writeQueries = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => { fetchCalled = true; throw new Error('Should not fetch on GET'); };
  try {
    const bdRes = await handleCreatorsRoutes({
      pathname: '/api/creators/board-detail',
      method: 'GET',
      request: new Request('https://app.hymum.com/api/creators/board-detail?username=curator&board=recipes&refresh=true'),
      searchParams: new URLSearchParams('username=curator&board=recipes&refresh=true'),
      env: {},
      ctx: {},
      sql: (strings) => {
        const q = strings.join(' ');
        if (/^(?:\s)*(?:INSERT|UPDATE|DELETE)/i.test(q)) writeQueries.push(q);
        return Promise.resolve([{ board_id: '99', name: 'Test Board', pin_count: 10 }]);
      },
      workspaceId: 1,
      jsonResponse,
      clampLimit: (v, d) => Number(v) || d,
      buildCanonicalCacheKey: () => 'k',
      getCachedOrFetch: async (_k, fn) => fn(),
      invalidateEdgeCache: noop,
      safeWaitUntil: noop,
      tripPinterestCircuitBreaker: noop
    });
    assert.equal(bdRes.status, 200);
    assert.equal(fetchCalled, false, 'GET /api/creators/board-detail must not execute external fetches');
    assert.equal(writeQueries.length, 0, 'GET /api/creators/board-detail must be strictly read-only');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P2 & P3: Room 3 HTML < 430 KiB, omits linked_creators & 5000-row scan, reserves system slugs, and supports popstate', async () => {
  const html = getDashboardHtml('5');
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.ok(bytes < 430 * 1024, `Room 3 HTML must be < 430 KiB (got ${(bytes / 1024).toFixed(2)} KiB)`);
  assert.ok(!html.includes('getOverviewTabHtml') && !html.includes('Overview</span>') && !html.includes('images.unsplash.com') && !html.includes('>General<'));

  const folderRes = await handleFoldersRoutes({
    pathname: '/api/folders/5/creators',
    method: 'GET',
    request: new Request('https://app.hymum.com/api/folders/5/creators?discovery=true'),
    searchParams: new URLSearchParams('discovery=true'),
    env: {},
    ctx: {},
    sql: (strings) => {
      const q = strings.join(' ');
      if (q.includes('FROM keyword_folders') || q.includes('FROM folders')) return Promise.resolve([{ id: 5, workspace_id: 1, name: 'F5' }]);
      return Promise.resolve([]);
    },
    workspaceId: 1,
    jsonResponse,
    methodNotAllowedResponse,
    invalidateEdgeCache: async () => {}
  });
  assert.equal(folderRes.status, 200);
  assert.equal('linked_creators' in folderRes.payload, false, 'GET /api/folders/:id/creators must omit duplicate linked_creators key');
  assert.ok('combined_pins_ex_aggregators' in folderRes.payload.totals);

  let requestedLimit = null;
  await handleCreatorsRoutes({
    pathname: '/api/creators',
    method: 'GET',
    request: new Request('https://app.hymum.com/api/creators?limit=10&workspace_scope=1'),
    searchParams: new URLSearchParams('limit=10&workspace_scope=1'),
    env: {},
    ctx: {},
    sql: (strings, ...values) => {
      const q = strings.join(' ');
      if (q.includes('FROM competitor_profiles') && q.includes('COUNT(*)')) {
        return Promise.resolve([{ total_profiles: 80, total_audience: 1000, total_impressions: 5000, total_pins_tracked: 200 }]);
      }
      if (q.includes('FROM competitor_profiles') && q.includes('OFFSET')) {
        requestedLimit = values.find((v) => typeof v === 'number');
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    },
    workspaceId: 1,
    jsonResponse,
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (_n, p) => JSON.stringify(p),
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: noop,
    safeWaitUntil: noop,
    tripPinterestCircuitBreaker: noop
  });
  assert.equal(requestedLimit, 10, 'Workspace 1 GET /api/creators?limit=10 must pass limit=10 (never scan 5000 rows)');

  // Workspace 2 GET /api/creators?limit=10 must enforce LIMIT 10 in SQL and NEVER leak WS1 top_competitor / counts
  let ws2RequestedLimit = null;
  let ws2CalledGlobalOverview = false;
  const ws2CreatorsRes = await handleCreatorsRoutes({
    pathname: '/api/creators',
    method: 'GET',
    request: new Request('https://app.hymum.com/api/creators?limit=10'),
    searchParams: new URLSearchParams('limit=10'),
    env: {},
    ctx: {},
    sql: (strings, ...values) => {
      const q = strings.join(' ');
      if (q.includes('FROM workspace_watchlist')) {
        return Promise.resolve([{ handle: 'ws2_only' }]);
      }
      if (q.includes('FROM folder_competitor_items')) {
        return Promise.resolve([]);
      }
      if (q.includes('total_profiles')) {
        ws2CalledGlobalOverview = true;
        return Promise.resolve([{ total_profiles: 99, competitor_count: 90, own_count: 9, total_audience: 9999999 }]);
      }
      if (q.includes('total_scoped_creators')) {
        return Promise.resolve([{
          total_scoped_creators: 1,
          active_count: 1,
          paused_count: 0,
          competitor_count: 1,
          own_count: 0,
          total_audience: 42000,
          total_impressions: 120000,
          pins_tracked: 85,
          top_username: 'ws2_only',
          top_monthly_reach: 42000
        }]);
      }
      if (q.includes('FROM competitor_profiles') && q.includes('LIMIT')) {
        ws2RequestedLimit = values.find((v) => typeof v === 'number');
        return Promise.resolve([{
          id: 88,
          username: 'ws2_only',
          account_type: 'competitor',
          is_active: true,
          monthly_reach: 42000,
          profile_views: 120000,
          total_pins: 85
        }]);
      }
      return Promise.resolve([]);
    },
    workspaceId: 2,
    jsonResponse,
    clampLimit: (v, d) => Number(v) || d,
    buildCanonicalCacheKey: (_n, p) => JSON.stringify(p),
    getCachedOrFetch: async (_k, fn) => fn(),
    invalidateEdgeCache: noop,
    safeWaitUntil: noop,
    tripPinterestCircuitBreaker: noop
  });
  assert.equal(ws2CreatorsRes.status, 200);
  assert.equal(ws2CalledGlobalOverview, false, 'Workspace 2 must NEVER invoke global getCompetitorsOverview');
  assert.equal(ws2RequestedLimit, 10, 'Workspace 2 GET /api/creators?limit=10 must pass LIMIT 10 (never 5000)');
  assert.equal(ws2CreatorsRes.payload.overview.competitor_count, 1);
  assert.equal(ws2CreatorsRes.payload.overview.own_count, 0);
  assert.equal(ws2CreatorsRes.payload.overview.top_competitor?.handle, '@ws2_only');

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/ui/dashboard/dashboard-client-app.mjs'), 'utf8');
  for (const slug of ['watchlist', 'radar', 'campaigns', 'pulse']) {
    assert.ok(appSrc.includes(`'${slug}'`), `RESERVED_SYSTEM_SLUGS must include '${slug}'`);
  }
  assert.ok(appSrc.includes("cleanPFirst === 'folders' && pSecond && (pThird || '').toLowerCase() === 'creators'"), 'popstate handler must support /folders/:id/creators');
});
