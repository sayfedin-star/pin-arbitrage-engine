import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_COOKIE_NAME,
  VALID_TRACKING_SOURCES,
  parseWorkspaceIdFromRequest,
  resolveActiveWorkspaceId,
  invalidateWorkspaceCache,
  deleteWorkspace,
  buildWorkspaceCookieHeader,
  slugifyWorkspaceName,
  assertFolderInWorkspace,
  addCampaignTrackedPins,
  listCampaignTrackedPins
} from '../src/modules/workspaces/service.mjs';
import { handleWorkspacesRoutes } from '../src/routes/workspaces.mjs';
import { handleFoldersRoutes } from '../src/routes/folders.mjs';
import { listFolders, getFoldersForKeyword } from '../src/modules/keywords/folders-crud.mjs';
import {
  requestContextStorage,
  sendJsonResponse,
  buildCanonicalCacheKey,
  getCachedOrFetch,
  invalidateEdgeCache,
  edgeCache
} from '../src/http/security-and-response.mjs';
import { TtlSingleflightCache } from '../src/lib/ttl-cache.mjs';
import { buildDomainAggregationCtes } from '../src/modules/domains/rollup-leaderboard-service.mjs';
import { fetchAndCacheDomainAge, getDatabaseEnrichmentStats } from '../src/modules/domains/whois-age-service.mjs';
import {
  DEFAULT_NEWBORN_SETTINGS,
  normalizeNewbornSettings
} from '../src/modules/newborn/settings.mjs';
import { getGlobal24hPulseService, pulseMemoryCache } from '../src/modules/pulse/service.mjs';
import { queryActiveSerp } from '../src/modules/pulse/pulse-queries.mjs';
import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function createMockReply() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    sent: false,
    code(c) {
      statusCode = c;
      return this;
    },
    header(k, v) {
      headers[String(k).toLowerCase()] = v;
      return this;
    },
    send(payload) {
      this.sent = true;
      body = payload;
      return { statusCode, headers, body };
    },
    getState() {
      return { statusCode, headers, body };
    }
  };
}

function createInMemoryWorkspaceSql() {
  const workspaces = [
    { id: 1, name: 'Default Workspace', slug: 'default', icon: 'briefcase', is_default: true, owner_user_id: null },
    { id: 2, name: 'Food Site', slug: 'food-site', icon: 'utensils', is_default: false, owner_user_id: null }
  ];
  const folders = [
    { id: 101, name: 'Workspace 1 Campaign', workspace_id: 1, project_id: 'default', serp_top_n: 20, metadata: {} },
    { id: 202, name: 'Workspace 2 Campaign', workspace_id: 2, project_id: 'default', serp_top_n: 20, metadata: {} }
  ];
  const trackedPins = [];
  let nextWsId = 3;

  return async function mockSql(strings, ...values) {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();

    if (/FROM workspaces\s+w\s+LEFT JOIN/i.test(query)) {
      return workspaces.map((w) => ({
        ...w,
        campaign_count: folders.filter((f) => f.workspace_id === w.id).length
      }));
    }
    if (/SELECT id, name, slug, icon, is_default, owner_user_id.*FROM workspaces WHERE id = \?/i.test(query)) {
      const id = Number(values[0]);
      const found = workspaces.find((w) => w.id === id);
      return found ? [found] : [];
    }
    if (/INSERT INTO workspaces/i.test(query)) {
      const ws = {
        id: nextWsId++,
        name: values[0],
        slug: values[1],
        icon: values[2],
        is_default: false,
        owner_user_id: values[3] ?? null
      };
      workspaces.push(ws);
      return [ws];
    }
    if (/INSERT INTO workspace_settings/i.test(query)) {
      return [{ workspace_id: Number(values[0]), max_pin_age_days: 30, min_repin_count: 20, default_serp_top_n: 20 }];
    }
    if (/DELETE FROM workspaces/i.test(query)) {
      const targetId = Number(values[0]);
      const idx = workspaces.findIndex((w) => w.id === targetId && !w.is_default);
      if (idx === -1 || workspaces.length <= 1) return [];
      const [removed] = workspaces.splice(idx, 1);
      return [{ id: removed.id, name: removed.name, slug: removed.slug }];
    }
    if (/SELECT id, name, workspace_id, serp_top_n, metadata FROM keyword_folders WHERE id = \? AND workspace_id = \?/i.test(query)) {
      const fid = Number(values[0]);
      const wid = Number(values[1]);
      const match = folders.find((f) => f.id === fid && f.workspace_id === wid);
      return match ? [match] : [];
    }
    if (/FROM keyword_folders f.*WHERE f\.id = \? AND f\.workspace_id = \?/i.test(query)) {
      const fid = Number(values[values.length - 2]);
      const wid = Number(values[values.length - 1]);
      const match = folders.find((f) => f.id === fid && f.workspace_id === wid);
      return match ? [match] : [];
    }
    if (/FROM keyword_folder_items i JOIN keyword_folders f ON f\.id = i\.folder_id WHERE i\.keyword_id = \? AND f\.workspace_id = \?/i.test(query)) {
      const wid = Number(values[1]);
      return folders.filter((f) => f.workspace_id === wid).map((f) => ({
        id: f.id,
        name: f.name,
        color: '#6366f1',
        icon: 'folder',
        workspace_id: f.workspace_id,
        added_at: new Date().toISOString()
      }));
    }
    if (/FROM keyword_folder_items i/i.test(query)) {
      return [];
    }
    if (/INSERT INTO campaign_tracked_pins/i.test(query)) {
      const [fid, wid, sourceType, sourceRef, pinIds] = values;
      const inserted = [];
      for (const pid of (Array.isArray(pinIds) ? pinIds : [])) {
        const existing = trackedPins.find((p) => p.folder_id === fid && p.pin_id === pid && p.source_type === sourceType);
        if (!existing) {
          const row = { folder_id: fid, workspace_id: wid, pin_id: pid, source_type: sourceType, source_ref: sourceRef, is_active: true };
          trackedPins.push(row);
        }
        inserted.push({ pin_id: pid, source_type: sourceType });
      }
      return inserted;
    }
    if (/FROM campaign_tracked_pins/i.test(query)) {
      const [fid, wid, sourceType] = values;
      return trackedPins.filter(
        (p) => p.folder_id === Number(fid) && p.workspace_id === Number(wid) && (!sourceType || p.source_type === sourceType)
      );
    }
    return [];
  };
}

test('V4 Migration 012 defines all 5 new tables with HOT-safe fillfactor=80 and 4-source tracking constraint', () => {
  const migrationPath = path.join(ROOT, 'scripts/migrations/012_v4_workspaces_and_clean_slate.sql');
  assert.equal(fs.existsSync(migrationPath), true, '012_v4_workspaces_and_clean_slate.sql must exist');
  const sqlText = fs.readFileSync(migrationPath, 'utf8');

  for (const tableName of [
    'public.workspaces',
    'public.workspace_settings',
    'public.workspace_watchlist',
    'public.campaign_tracked_pins',
    'public.campaign_pin_graph_seeds'
  ]) {
    assert.ok(sqlText.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`), `Missing table DDL: ${tableName}`);
  }

  assert.ok(sqlText.includes("source_type IN ('search', 'newborn', 'creator', 'related')"), 'Must enforce 4 unified tracking sources');
  assert.ok(sqlText.includes("creator_tracking_mode IN ('metrics_only', 'metrics_full_catalog')"), 'Must enforce Watchlist creator modes');
  assert.ok(sqlText.includes('fillfactor = 80'), 'Tables must use PG16 HOT-safe fillfactor = 80');
  assert.ok(sqlText.includes('ALTER TABLE public.keyword_folders'), 'Must extend keyword_folders with workspace_id + serp_top_n');
  assert.ok(sqlText.includes('ALTER TABLE public.newborn_runs'), 'Must extend newborn_runs with workspace_id + folder_id');
  assert.ok(sqlText.includes('ALTER TABLE public.newborn_keyword_clusters'), 'Must extend newborn_keyword_clusters with workspace_id + folder_id');
  assert.ok(!/CREATE INDEX CONCURRENTLY/i.test(sqlText), 'Migration 012 should remain transactional without CONCURRENTLY');
});

test('Workspace request parser resolves x-workspace-id header, query param, cookie, and defaults to 1', () => {
  assert.equal(DEFAULT_WORKSPACE_ID, 1);
  assert.equal(slugifyWorkspaceName('  Food & Drink Site!  '), 'food-drink-site');

  const fromHeader = parseWorkspaceIdFromRequest({ headers: { 'x-workspace-id': '4', cookie: `${WORKSPACE_COOKIE_NAME}=2` } });
  assert.equal(fromHeader, 4);

  const fromQuery = parseWorkspaceIdFromRequest({ headers: { cookie: `${WORKSPACE_COOKIE_NAME}=2` } }, new URLSearchParams('workspace_id=3'));
  assert.equal(fromQuery, 3);

  const fromCookie = parseWorkspaceIdFromRequest({ headers: { cookie: `foo=bar; ${WORKSPACE_COOKIE_NAME}=7` } });
  assert.equal(fromCookie, 7);

  const fallback = parseWorkspaceIdFromRequest({ headers: { cookie: `${WORKSPACE_COOKIE_NAME}=invalid` } });
  assert.equal(fallback, 1);

  const cookieHeader = buildWorkspaceCookieHeader(5, { secure: true });
  assert.ok(cookieHeader.includes(`${WORKSPACE_COOKIE_NAME}=5`));
  assert.ok(cookieHeader.includes('HttpOnly'));
  assert.ok(cookieHeader.includes('SameSite=Lax'));
  assert.ok(cookieHeader.includes('Secure'));
});

test('Workspaces API router supports listing, creating, and switching workspaces with HttpOnly cookie', async () => {
  const sql = createInMemoryWorkspaceSql();

  const replyList = createMockReply();
  const listRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces',
    method: 'GET',
    request: { headers: {} },
    reply: replyList,
    sql,
    workspaceId: 2,
    jsonResponse: (d, s = 200) => replyList.code(s).send(d),
    methodNotAllowedResponse: () => replyList.code(405).send({})
  });
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.active_workspace_id, 2);
  assert.equal(listRes.body.workspaces.length, 2);

  const replySwitch = createMockReply();
  const switchRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/switch',
    method: 'POST',
    request: { protocol: 'https', headers: {}, json: async () => ({ workspace_id: 2 }) },
    reply: replySwitch,
    sql,
    workspaceId: 1,
    jsonResponse: (d, s = 200) => replySwitch.code(s).send(d),
    methodNotAllowedResponse: () => replySwitch.code(405).send({})
  });
  assert.equal(switchRes.statusCode, 200);
  assert.equal(switchRes.body.active_workspace_id, 2);
  assert.ok(String(switchRes.headers['set-cookie'] || '').includes(`${WORKSPACE_COOKIE_NAME}=2`));
  assert.ok(String(switchRes.headers['set-cookie'] || '').includes('HttpOnly'));
});

test('Zero-Leakage cross-workspace isolation rejects Workspace B accessing Workspace A folder with 404', async () => {
  const sql = createInMemoryWorkspaceSql();

  const owned = await assertFolderInWorkspace(sql, 101, 1);
  assert.equal(owned.id, 101);

  await assert.rejects(
    () => assertFolderInWorkspace(sql, 101, 2),
    (err) => err && err.status === 404
  );

  // Route-level check: GET /api/folders/101 under workspaceId = 2 must return 404
  const replyGet = createMockReply();
  const getRes = await handleFoldersRoutes({
    pathname: '/api/folders/101',
    method: 'GET',
    request: { headers: {}, json: async () => ({}) },
    searchParams: new URLSearchParams(),
    env: {},
    ctx: null,
    sql,
    workspaceId: 2,
    jsonResponse: (d, s = 200) => replyGet.code(s).send(d),
    methodNotAllowedResponse: () => replyGet.code(405).send({}),
    invalidateEdgeCache: async () => {}
  });
  assert.equal(getRes.statusCode, 404);

  // Unified 4-source tracked pins works inside owner workspace (ws=1) and rejects cross-workspace (ws=2)
  assert.deepEqual(VALID_TRACKING_SOURCES, ['search', 'newborn', 'creator', 'related']);
  const added = await addCampaignTrackedPins(sql, {
    folderId: 101,
    workspaceId: 1,
    pinIds: ['1234567890', '9876543210'],
    sourceType: 'newborn',
    sourceRef: 'high protein meals'
  });
  assert.equal(added.added, 2);
  const listed = await listCampaignTrackedPins(sql, { folderId: 101, workspaceId: 1, sourceType: 'newborn' });
  assert.equal(listed.length, 2);

  await assert.rejects(
    () => listCampaignTrackedPins(sql, { folderId: 101, workspaceId: 2 }),
    (err) => err && err.status === 404
  );
});

test('HTTP security headers enforce private no-store + Vary: Cookie and cache keys isolate workspaces', async () => {
  const reply = createMockReply();
  sendJsonResponse(reply, { success: true }, 200, 60);
  const { headers } = reply.getState();

  assert.ok(!String(headers['cache-control'] || '').includes('public'), 'Must NEVER emit Cache-Control: public');
  assert.ok(String(headers['cache-control'] || '').includes('private'), 'Must emit Cache-Control: private');
  assert.ok(String(headers['cache-control'] || '').includes('no-store'), 'Must emit no-store');
  assert.ok(String(headers.vary || '').includes('Cookie'), 'Must emit Vary: Cookie');

  const keyWs1 = requestContextStorage.run({ workspaceId: 1 }, () =>
    buildCanonicalCacheKey('domains:leaderboard', { page: 1 })
  );
  const keyWs2 = requestContextStorage.run({ workspaceId: 2 }, () =>
    buildCanonicalCacheKey('domains:leaderboard', { page: 1 })
  );
  assert.equal(keyWs1, 'ws:1:domains:leaderboard?page=1');
  assert.equal(keyWs2, 'ws:2:domains:leaderboard?page=1');
  assert.notEqual(keyWs1, keyWs2);

  // Pulse memory cache key isolates workspaces
  pulseMemoryCache.invalidate();
  const emptySql = async () => [];
  await getGlobal24hPulseService(emptySql, {}, { workspaceId: 1, folderId: 'all', window: '24h' });
  await getGlobal24hPulseService(emptySql, {}, { workspaceId: 2, folderId: 'all', window: '24h' });
  const pulseKeys = Array.from(pulseMemoryCache.keys());
  assert.ok(pulseKeys.some((k) => k.startsWith('ws:1:pulse:')));
  assert.ok(pulseKeys.some((k) => k.startsWith('ws:2:pulse:')));
});

test('Zero-Exclusion Domain Policy removes all default domain blacklists and keeps linkless Uploaded by user pins', () => {
  const leaderboardCtes = buildDomainAggregationCtes({
    fId: null,
    kId: null,
    pillar: 'all',
    searchPattern: null,
    minPins: 1,
    preset: 'all',
    adNetwork: 'all',
    referenceTime: new Date().toISOString(),
    forRollupRefresh: false
  });

  const flattenFrag = (frag) => {
    if (!frag || !frag.__sqlFrag) return '';
    let out = frag.strings[0] || '';
    for (let i = 0; i < frag.values.length; i++) {
      const v = frag.values[i];
      out += (v && v.__sqlFrag ? flattenFrag(v) : '?') + (frag.strings[i + 1] || '');
    }
    return out;
  };
  const fullSqlText = flattenFrag(leaderboardCtes);

  assert.ok(fullSqlText.includes("'Uploaded by user'"), 'Must normalize empty/null/organic domains to Uploaded by user');
  assert.ok(!fullSqlText.includes("WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''"), 'Must NOT drop NULL/empty linkless pins');
  assert.ok(!fullSqlText.includes("clean_domain LIKE '%.%'"), 'Must NOT filter out non-dot linkless domains');
  assert.ok(!fullSqlText.includes('<> ALL('), 'Must NOT exclude marketplace/social/internal domain lists');

  const whoisSrc = fs.readFileSync(path.join(ROOT, 'src/modules/domains/whois-age-service.mjs'), 'utf8');
  const adsSrc = fs.readFileSync(path.join(ROOT, 'src/modules/domains/ad-network-service.mjs'), 'utf8');
  const enrichSrc = fs.readFileSync(path.join(ROOT, 'scripts/domain-enrich.mjs'), 'utf8');
  assert.ok(!whoisSrc.includes('ECOMMERCE_AND_SOCIAL_DOMAINS'));
  assert.ok(!adsSrc.includes('ECOMMERCE_AND_SOCIAL_DOMAINS'));
  assert.ok(!enrichSrc.includes('ECOMMERCE_AND_SOCIAL_DOMAINS'));
});

test('V4 Newborn defaults disable all hidden filters and cap auto_fetch_accounts safely with Semaphore(4)', () => {
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.hydration.auto_fetch_accounts, true);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.discovery.hydration.max_user_hydrations_per_run, 50);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.qualification.provenance.exclude_products, false);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.qualification.provenance.exclude_videos, false);
  assert.equal(DEFAULT_NEWBORN_SETTINGS.qualification.provenance.ai_disclosure_policy, 'include');

  const clamped = normalizeNewbornSettings({
    discovery: { hydration: { max_user_hydrations_per_run: 999 } }
  });
  assert.equal(clamped.discovery.hydration.max_user_hydrations_per_run, 100, 'Must clamp max_user_hydrations_per_run to <= 100');

  const harvesterSrc = fs.readFileSync(path.join(ROOT, 'src/modules/newborn/harvester.mjs'), 'utf8');
  assert.ok(harvesterSrc.includes('new Semaphore(4)'), 'Harvester must retain Semaphore(4) guard for safe account hydration');
});

test('Sidebar renders accessible V4 Workspace Switcher in desktop and mobile navigation', () => {
  const html = renderAppSidebar({ activePage: 'overview' });
  assert.ok(html.includes('x-data="paeWorkspaceSwitcher()"'), 'Sidebar must mount paeWorkspaceSwitcher()');
  assert.ok(html.includes('aria-label="Switch Active Workspace"'), 'Workspace Switcher button must have accessible label');
  assert.ok(html.includes('New Workspace'), 'Workspace Switcher must expose + New Workspace action');
});

test('Phase 1.5 BLOCKER-1 regression: invalidateEdgeCache invalidates ws:<id>:* keys and blocks stale in-flight write-back', async () => {
  edgeCache.clear();
  const keyWs1 = requestContextStorage.run({ workspaceId: 1 }, () =>
    buildCanonicalCacheKey('domains:leaderboard', { page: 1 })
  );
  const keyWs2 = requestContextStorage.run({ workspaceId: 2 }, () =>
    buildCanonicalCacheKey('domains:leaderboard', { page: 1 })
  );
  const unrelatedKey = requestContextStorage.run({ workspaceId: 1 }, () =>
    buildCanonicalCacheKey('keywords', { page: 1 })
  );

  await getCachedOrFetch(keyWs1, async () => ({ success: true, ws: 1, rev: 1 }), 60_000, 0);
  await getCachedOrFetch(keyWs2, async () => ({ success: true, ws: 2, rev: 1 }), 60_000, 0);
  await getCachedOrFetch(unrelatedKey, async () => ({ success: true, type: 'kw' }), 60_000, 0);

  assert.equal(edgeCache.has(keyWs1), true);
  assert.equal(edgeCache.has(keyWs2), true);

  await invalidateEdgeCache('domains:leaderboard');
  assert.equal(edgeCache.has(keyWs1), false, 'ws:1:domains:leaderboard must be evicted');
  assert.equal(edgeCache.has(keyWs2), false, 'ws:2:domains:leaderboard must be evicted');
  assert.equal(edgeCache.has(unrelatedKey), true, 'Unrelated ws:1:keywords entry must remain intact');

  // Verify pre-invalidation in-flight fetch cannot write stale payload back
  let resolveInflight;
  const inflightPromise = getCachedOrFetch(
    keyWs1,
    () => new Promise((resolve) => { resolveInflight = resolve; }),
    60_000,
    0
  );
  await invalidateEdgeCache('domains:leaderboard');
  resolveInflight({ success: true, stale: true });
  await inflightPromise;
  assert.equal(edgeCache.has(keyWs1), false, 'Stale in-flight fetch started before invalidation must NOT populate cache');

  // Verify deleteKeysMatching clears in-flight singleflight keys too
  const localCache = new TtlSingleflightCache({ maxEntries: 16, defaultTtlMs: 60_000 });
  let releaseFolder;
  const folderFetch = localCache.getOrFetch('ws:2:folder:42', () => new Promise((r) => { releaseFolder = r; }));
  localCache.deleteKeysMatching((k) => k.endsWith(':folder:42'));
  releaseFolder({ stale: true });
  await folderFetch;
  assert.equal(localCache.has('ws:2:folder:42'), false, 'deleteKeysMatching must block stale in-flight folder write-back');
});

test('Phase 1.5 HIGH-1 & MEDIUM-3 regression: stale cookie fallback, active workspace deletion cookie reset, 404 switch & 400 default/last delete', async () => {
  const sql = createInMemoryWorkspaceSql();
  invalidateWorkspaceCache();

  // Valid workspace cookie resolves cleanly
  const ws2 = await resolveActiveWorkspaceId(sql, { headers: { cookie: `${WORKSPACE_COOKIE_NAME}=2` } });
  assert.equal(ws2, 2);

  // Stale/nonexistent workspace cookie falls back safely to Default Workspace (1)
  const fallbackWs = await resolveActiveWorkspaceId(sql, { headers: { cookie: `${WORKSPACE_COOKIE_NAME}=999` } });
  assert.equal(fallbackWs, DEFAULT_WORKSPACE_ID);

  // Switch to nonexistent workspace returns 404
  const reply404 = createMockReply();
  const switch404 = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/switch',
    method: 'POST',
    request: { headers: {}, json: async () => ({ workspace_id: 999 }) },
    reply: reply404,
    sql,
    workspaceId: 1,
    jsonResponse: (d, s = 200) => reply404.code(s).send(d),
    methodNotAllowedResponse: () => reply404.code(405).send({})
  });
  assert.equal(switch404.statusCode, 404);

  // Deleting Default Workspace #1 throws 400
  await assert.rejects(
    () => deleteWorkspace(sql, 1),
    (err) => err && err.status === 400
  );

  // Deleting currently active Workspace #2 emits Set-Cookie resetting back to Default Workspace (1) and invalidates cache
  const replyDel = createMockReply();
  const delRes = await handleWorkspacesRoutes({
    pathname: '/api/workspaces/2',
    method: 'DELETE',
    request: { protocol: 'https', headers: {} },
    reply: replyDel,
    sql,
    workspaceId: 2,
    jsonResponse: (d, s = 200) => replyDel.code(s).send(d),
    methodNotAllowedResponse: () => replyDel.code(405).send({}),
    invalidateEdgeCache: async () => {}
  });
  assert.equal(delRes.statusCode, 200);
  assert.equal(delRes.body.active_workspace_id, DEFAULT_WORKSPACE_ID);
  assert.ok(String(delRes.headers['set-cookie'] || '').includes(`${WORKSPACE_COOKIE_NAME}=1`), 'Must reset cookie to default workspace');

  // After deletion, cookie pointing to workspace 2 immediately falls back to 1
  const postDelFallback = await resolveActiveWorkspaceId(sql, { headers: { cookie: `${WORKSPACE_COOKIE_NAME}=2` } });
  assert.equal(postDelFallback, DEFAULT_WORKSPACE_ID);
});

test('Phase 1.5 HIGH-2, HIGH-3 & MEDIUM-1 regression: keyword folder lookup, pulse kw_folders CTE, and listFolders fields are workspace-scoped', async () => {
  const sql = createInMemoryWorkspaceSql();

  // HIGH-2: getFoldersForKeyword scopes strictly by workspaceId
  const ws1Folders = await getFoldersForKeyword(sql, 42, { workspaceId: 1 });
  const ws2Folders = await getFoldersForKeyword(sql, 42, { workspaceId: 2 });
  assert.equal(ws1Folders.length, 1);
  assert.equal(ws1Folders[0].name, 'Workspace 1 Campaign');
  assert.equal(ws2Folders.length, 1);
  assert.equal(ws2Folders[0].name, 'Workspace 2 Campaign');

  // HIGH-3: queryActiveSerp filters kw_folders CTE by kf.workspace_id = wid
  const capturedPulseSql = [];
  const spyPulseSql = async (strings, ...values) => {
    capturedPulseSql.push({ query: strings.join('?').replace(/\s+/g, ' '), values });
    return [];
  };
  await queryActiveSerp(spyPulseSql, null, 2);
  assert.equal(capturedPulseSql.length, 1);
  assert.ok(capturedPulseSql[0].query.includes('WHERE kf.workspace_id = ?'), 'kw_folders CTE must filter by kf.workspace_id');
  assert.equal(capturedPulseSql[0].values[0], 2, 'kw_folders CTE must bind active workspaceId');

  // MEDIUM-1: listFolders selects f.workspace_id, f.serp_top_n, f.pin_graph_rules and preserves custom values
  let listSqlQuery = '';
  const mockListSql = async (strings) => {
    listSqlQuery = strings.join('?').replace(/\s+/g, ' ');
    return [{
      id: 77,
      name: 'Top 50 Campaign',
      workspace_id: 2,
      serp_top_n: 50,
      pin_graph_rules: { auto_trigger_enabled: true, min_repins: 1000 },
      metadata: {}
    }];
  };
  const listed = await listFolders(mockListSql, { projectId: 'default', workspaceId: 2 });
  assert.ok(listSqlQuery.includes('f.serp_top_n'), 'listFolders SQL must select f.serp_top_n');
  assert.ok(listSqlQuery.includes('f.pin_graph_rules'), 'listFolders SQL must select f.pin_graph_rules');
  assert.equal(listed[0].serp_top_n, 50);
  assert.equal(listed[0].workspace_id, 2);
  assert.equal(listed[0].pin_graph_rules.min_repins, 1000);
});

test('Phase 1.5 MEDIUM-5 regression: Uploaded by user never triggers WHOIS lookups and is excluded from enrichment completion stats', async () => {
  const spySqlQueries = [];
  const spySql = async (strings) => {
    const q = strings.join('?').replace(/\s+/g, ' ');
    spySqlQueries.push(q);
    return [{
      total_domains: 10,
      checked_domains: 10,
      resolved_domains: 9,
      failed_domains: 1,
      unchecked_domains: 0,
      percent_complete: 100
    }];
  };

  const ageRes = await fetchAndCacheDomainAge(spySql, 'Uploaded by user');
  assert.equal(ageRes, null, 'Uploaded by user must be rejected before any WHOIS/RDAP or DB write');
  assert.equal(spySqlQueries.length, 0, 'No SQL queries should run for invalid non-DNS domain Uploaded by user');

  const stats = await getDatabaseEnrichmentStats(spySql);
  assert.equal(stats.unchecked_domains, 0);
  assert.ok(spySqlQueries[0].includes("domain <> 'Uploaded by user'"), 'Enrichment stats must exclude Uploaded by user');
});
