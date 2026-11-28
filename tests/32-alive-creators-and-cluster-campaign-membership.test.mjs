/**
 * tests/32-alive-creators-and-cluster-campaign-membership.test.mjs
 *
 * Pure behavioral verification for:
 *  1. Alive-Creator SSOT across Folder Creator Hub (listFolderCreatorsWithDiscovery,
 *     listFolderCreators, listFolders, getFolder, autoDiscoverFolderCreatorsForKeyword,
 *     bulkPulseTrackFolderCreators) — permanently excludes (0,0) and (1,1) non-protected
 *     accounts, enriches real Newborn telemetry creators (e.g. alisongarnerrecipes),
 *     preserves own/system and asymmetric live accounts (1/424208, 1/0), and stops
 *     SERP auto-discovery from inserting 0/0 unsynced shells into competitor_profiles.
 *  2. Newborn Rookie staging (upsertStagedRookiesBatch) & promotion (promoteNewbornRookies)
 *     rejection of dead (0,0) and (1,1) accounts.
 *  3. Pin Dossier (/pin/:id) unified campaign membership SSOT (fetchUniversalPinDossier
 *     + Pin Details client controller) — surfaces both explicit campaign_tracked_pins
 *     and cluster SERP/Vault folders (keyword_serp_positions -> keyword_folder_items ->
 *     keyword_folders), deduplicates by folder_id, formats source/keyword/rank badges,
 *     and hides Remove (shows Open) for cluster-derived memberships (can_remove = false).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  isAliveFolderCreatorRow,
  listFolders,
  getFolder,
  listFolderCreators,
  listFolderCreatorsWithDiscovery,
  autoDiscoverFolderCreatorsForKeyword
} from '../src/modules/keywords/folders-crud.mjs';
import { upsertStagedRookiesBatch } from '../src/modules/newborn/harvester.mjs';
import { promoteNewbornRookies } from '../src/modules/newborn/promotions.mjs';
import { listNewbornRookies } from '../src/modules/newborn/queries.mjs';
import { fetchUniversalPinDossier } from '../src/modules/pins/dossier-reader.mjs';
import { getPinDetailsClientAppScripts } from '../src/ui/pin-details/client-app.mjs';

function createCapturingSql(handler) {
  const queries = [];
  const fn = async (strings, ...values) => {
    const queryText = Array.isArray(strings) ? strings.join('?') : String(strings);
    const entry = { queryText, values };
    queries.push(entry);
    if (typeof handler === 'function') {
      return handler(entry, queries);
    }
    return [];
  };
  fn.unsafe = async (queryText, values = []) => {
    const entry = { queryText: String(queryText), values };
    queries.push(entry);
    if (typeof handler === 'function') {
      return handler(entry, queries);
    }
    return [];
  };
  fn.begin = async (cb) => cb(fn);
  fn.queries = queries;
  return fn;
}

function instantiatePinDossierController(pinId = '743375482289034272') {
  const rawHtml = getPinDetailsClientAppScripts(pinId);
  const scriptSource = rawHtml.replace(/^[\s\S]*?<script[^>]*>/i, '').replace(/<\/script>[\s\S]*$/i, '');
  const sandbox = {
    window: {
      location: { pathname: `/pin/${pinId}`, search: '' },
      lucide: { createIcons() {} }
    },
    document: {
      documentElement: { classList: { contains: () => false } }
    },
    navigator: {},
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    JSON,
    encodeURIComponent,
    decodeURIComponent
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);
  const ctrl = sandbox.pinDetailApp(pinId);
  ctrl.$nextTick = (cb) => { if (typeof cb === 'function') cb(); };
  return { ctrl, sandbox };
}

test('isAliveFolderCreatorRow strictly rejects (0,0) and (1,1) while preserving genuine, asymmetric, and protected accounts', () => {
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 0, profile_views: 0, account_type: 'competitor' }), false);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 1, profile_views: 1, account_type: 'competitor' }), false);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: null, profile_views: null }), false);

  // Genuine accounts & Newborn-enriched creators
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 364514, profile_views: 564432 }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 6371269, profile_views: 10000001 }), true);

  // Asymmetric live accounts preserved
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 1, profile_views: 424208 }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 1, profile_views: 47 }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 1, profile_views: 0 }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 0, profile_views: 25 }), true);

  // Protected own/system accounts preserved even at (0,0)
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 0, profile_views: 0, account_type: 'own' }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 0, profile_views: 0, account_type: 'my_account' }), true);
  assert.equal(isAliveFolderCreatorRow({ monthly_reach: 1, profile_views: 1, account_type: 'system' }), true);
});

test('listFolderCreatorsWithDiscovery filters (0,0)/(1,1) ghosts, preserves Newborn-enriched & own rows, and uses newborn_creator_metrics CTE', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('WITH all_folder_pins AS') && !queryText.includes('FROM folder_competitor_items')) {
      return [
        {
          id: '101',
          competitor_id: 101,
          username: 'ideafactory247',
          pin_count: 1,
          active_pin_count: 1,
          vault_pin_count: 0,
          monthly_reach: 6371269,
          profile_views: 10000001,
          total_pins: 3244,
          total_boards: 20,
          account_type: 'competitor',
          is_linked: true,
          is_tracked: true,
          auto_discovered: false
        },
        {
          id: 'serp_alisongarnerrecipes',
          competitor_id: null,
          username: 'alisongarnerrecipes',
          pin_count: 1,
          active_pin_count: 1,
          vault_pin_count: 0,
          monthly_reach: 364514,
          profile_views: 564432,
          total_pins: 262,
          total_boards: 0,
          account_type: 'competitor',
          discovery_source: 'newborn_telemetry',
          is_linked: false,
          is_tracked: false,
          auto_discovered: true
        },
        {
          id: 'serp_hollybest67',
          competitor_id: null,
          username: 'hollybest67',
          pin_count: 1,
          active_pin_count: 1,
          vault_pin_count: 0,
          monthly_reach: 0,
          profile_views: 0,
          total_pins: 0,
          total_boards: 0,
          account_type: 'competitor',
          is_linked: false,
          is_tracked: false,
          auto_discovered: true
        },
        {
          id: 'serp_oneoneghost',
          competitor_id: null,
          username: 'oneoneghost',
          pin_count: 1,
          active_pin_count: 1,
          vault_pin_count: 0,
          monthly_reach: 1,
          profile_views: 1,
          total_pins: 0,
          total_boards: 0,
          account_type: 'competitor',
          is_linked: false,
          is_tracked: false,
          auto_discovered: true
        },
        {
          id: '999',
          competitor_id: 999,
          username: 'myownbrand',
          pin_count: 1,
          active_pin_count: 1,
          vault_pin_count: 0,
          monthly_reach: 0,
          profile_views: 0,
          total_pins: 5,
          total_boards: 2,
          account_type: 'own',
          is_linked: true,
          is_tracked: true,
          auto_discovered: false
        }
      ];
    }
    if (queryText.includes('SELECT metadata FROM keyword_folders')) {
      return [{ metadata: {} }];
    }
    return [];
  });

  const res = await listFolderCreatorsWithDiscovery(sql, 13, { vaultScope: 'high_signal' });
  const usernames = res.all_creators.map((c) => c.username);

  assert.deepEqual(usernames, ['ideafactory247', 'alisongarnerrecipes', 'myownbrand']);
  assert.equal(res.totals.total_creators, 3);
  assert.equal(res.totals.combined_audience, 6371269 + 364514);
  assert.equal(res.totals.combined_impressions, 10000001 + 564432);

  const discoverySql = sql.queries.find((q) => q.queryText.includes('newborn_creator_metrics'));
  assert.ok(discoverySql, 'listFolderCreatorsWithDiscovery must enrich creators from newborn_creator_metrics CTE');
  assert.ok(
    discoverySql.queryText.includes('COALESCE(cp.monthly_reach, ncm.monthly_reach, 0) = 1'),
    'SQL query must exclude (1,1) dead accounts'
  );
});

test('listFolders, getFolder, and listFolderCreators enforce alive_creator_handles parity', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM keyword_folders')) {
      return [{ id: 13, name: 'cranberry sauce', discovered_creator_count: 12, creator_count: 10 }];
    }
    if (queryText.includes('FROM folder_competitor_items fci')) {
      return [
        { competitor_id: 1, username: 'livecreator', monthly_reach: 50000, profile_views: 120000, account_type: 'competitor' },
        { competitor_id: 2, username: 'deadzero', monthly_reach: 0, profile_views: 0, account_type: 'competitor' }
      ];
    }
    return [];
  });

  await listFolders(sql, { workspaceId: 1 });
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('alive_creator_handles') && q.queryText.includes('ach.clean_username IS NOT NULL')),
    'listFolders must gate discovered_creator_count by alive_creator_handles'
  );

  sql.queries.length = 0;
  await getFolder(sql, 13, { workspaceId: 1 });
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('alive_creator_handles') && q.queryText.includes('ach.clean_username IS NOT NULL')),
    'getFolder must gate discovered_creator_count by alive_creator_handles'
  );

  sql.queries.length = 0;
  const linked = await listFolderCreators(sql, 13);
  assert.deepEqual(linked.map((r) => r.username), ['livecreator']);
});

test('autoDiscoverFolderCreatorsForKeyword never inserts unverified 0/0 shells into competitor_profiles', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM keyword_folder_items kfi')) {
      return [{ id: 7, name: 'crockpot meals', metadata: { auto_discover_creators: true } }];
    }
    if (queryText.includes('INSERT INTO folder_competitor_items')) {
      return [{ id: 1 }];
    }
    return [];
  });

  const res = await autoDiscoverFolderCreatorsForKeyword(sql, 42);
  assert.equal(res.discovered, 1);

  const linkQuery = sql.queries.find((q) => q.queryText.includes('INSERT INTO folder_competitor_items'));
  assert.ok(linkQuery, 'Expected folder_competitor_items insert query');
  assert.ok(
    linkQuery.queryText.includes('verified_newborn_creators') &&
    linkQuery.queryText.includes('HAVING (MAX(COALESCE(nc.creator_monthly_reach, 0)) > 0'),
    'autoDiscoverFolderCreatorsForKeyword must only promote creators with verified alive telemetry'
  );
  assert.equal(
    linkQuery.queryText.includes('FROM ranked_creators rc\n        ON CONFLICT'),
    false,
    'Must NOT blindly insert all ranked_creators as 0/0 shells'
  );
});

test('upsertStagedRookiesBatch, promoteNewbornRookies, and listNewbornRookies reject (0,0) and (1,1) dead accounts', async () => {
  const stageSql = createCapturingSql(() => []);
  const stageRes = await upsertStagedRookiesBatch(stageSql, [
    { username: 'dead_zero', monthly_reach: 0, profile_views: 0, rookie_score: 10 },
    { username: 'dead_one', monthly_reach: 1, profile_views: 1, rookie_score: 12 },
    { username: 'alive_rookie', monthly_reach: 120000, profile_views: 350000, rookie_score: 88 }
  ]);
  const stageInsert = stageSql.queries.find((q) => q.queryText.includes('INSERT INTO newborn_rookie_accounts'));
  assert.ok(stageInsert, 'Expected insert for alive rookie');
  const payload = JSON.parse(stageInsert.values[0]);
  assert.deepEqual(payload.map((r) => r.username), ['alive_rookie']);
  assert.equal(stageRes.upserted, 1);

  // All-dead batch skips DB insert cleanly
  const allDeadSql = createCapturingSql(() => []);
  const allDeadRes = await upsertStagedRookiesBatch(allDeadSql, [
    { username: 'dead_zero', monthly_reach: 0, profile_views: 0 }
  ]);
  assert.equal(allDeadRes.upserted, 0);
  assert.equal(allDeadRes.skipped_dead_count, 1);
  assert.equal(allDeadSql.queries.some((q) => q.queryText.includes('INSERT INTO newborn_rookie_accounts')), false);

  // promoteNewbornRookies skips dead rows before touching competitor_profiles
  const promoSql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM newborn_rookie_accounts')) {
      return [
        { username: 'dead_zero', monthly_reach: 0, profile_views: 0, pin_count: 10, board_count: 1, follower_count: 5 },
        { username: 'dead_one', monthly_reach: 1, profile_views: 1, pin_count: 10, board_count: 1, follower_count: 5 },
        { username: 'alive_rookie', monthly_reach: 150000, profile_views: 420000, pin_count: 250, board_count: 12, follower_count: 1800 }
      ];
    }
    if (queryText.includes('INSERT INTO competitor_profiles')) {
      return [{ id: 501, username: 'alive_rookie', tracking_mode: 'pulse_only' }];
    }
    return [];
  });
  const promoRes = await promoteNewbornRookies(promoSql, {
    usernames: ['dead_zero', 'dead_one', 'alive_rookie'],
    trackingMode: 'pulse_only'
  });
  assert.equal(promoRes.promoted_count, 1);
  assert.deepEqual(promoRes.competitors.map((c) => c.username), ['alive_rookie']);

  // listNewbornRookies excludes (0,0) and (1,1) in SQL
  const listSql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('COUNT(*)::int AS total')) return [{ total: 0 }];
    return [];
  });
  await listNewbornRookies(listSql, { workspaceId: 1 });
  assert.ok(
    listSql.queries.some((q) => q.queryText.includes('COALESCE(nra.monthly_reach, 0) = 1 AND COALESCE(nra.profile_views, 0) = 1')),
    'listNewbornRookies SQL must exclude (0,0) and (1,1) dead rookie rows'
  );
});

test('fetchUniversalPinDossier unifies explicit campaign_tracked_pins AND cluster SERP/Vault folders without duplicates', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM universal_master_pins') && queryText.includes('WHERE pin_id =')) {
      return [{
        pin_id: '743375482289034272',
        title: 'Crockpot Beef Tips & Gravy',
        creator_username: 'myfamilydinnerideas',
        save_count: 47228,
        repin_count: 42000,
        daily_save_velocity: 45,
        clean_domain: 'myfamilydinnerideas.com'
      }];
    }
    if (queryText.includes('WITH explicit_tracked AS') && queryText.includes('serp_cluster_folders')) {
      return [
        {
          folder_id: 7,
          folder_name: 'crockpot meals',
          source_type: 'vault',
          seed_query: null,
          added_at: '2026-11-20T00:00:00Z',
          notes: null,
          membership_type: 'cluster_serp',
          can_remove: false,
          keyword_count: 2,
          best_rank: 32
        }
      ];
    }
    if (queryText.includes('FROM competitor_profiles') && queryText.includes('LOWER(LTRIM(BTRIM(username)')) {
      return [{
        id: 88,
        username: 'myfamilydinnerideas',
        display_name: 'My Family Dinner Ideas',
        monthly_reach: 1001409,
        profile_views: 7993010,
        total_pins: 27210,
        total_boards: 85,
        follower_count: 45120
      }];
    }
    return [];
  });

  const res = await fetchUniversalPinDossier({ sql, pinId: '743375482289034272', workspaceId: 1 });
  assert.ok(res && res.success !== false, 'Dossier should resolve');
  const dossier = res.dossier || res;
  assert.equal(dossier.tracked_campaigns.length, 1);
  assert.deepEqual(dossier.tracked_campaigns[0], {
    folder_id: 7,
    folder_name: 'crockpot meals',
    source_type: 'vault',
    seed_query: null,
    added_at: '2026-11-20T00:00:00.000Z',
    notes: null,
    membership_type: 'cluster_serp',
    can_remove: false,
    keyword_count: 2,
    best_rank: 32
  });

  // Verify the SQL query joins keyword_serp_positions -> keyword_folder_items -> keyword_folders
  const campQuery = sql.queries.find((q) => q.queryText.includes('serp_cluster_folders'));
  assert.ok(campQuery, 'Dossier reader must execute unified serp_cluster_folders CTE');
  assert.ok(campQuery.queryText.includes('FROM keyword_serp_positions ksp'));
  assert.ok(campQuery.queryText.includes('JOIN keyword_folder_items kfi'));
  assert.ok(campQuery.queryText.includes('JOIN keyword_folders kf'));
  assert.ok(campQuery.queryText.includes('NOT EXISTS'));
});

test('Pin Dossier client controller displays In Campaign: crockpot meals (1 folder) and In 2 Campaigns (2 folders) with accurate badges', () => {
  const { ctrl } = instantiatePinDossierController('743375482289034272');

  // Pin in 1 cluster folder (crockpot meals)
  ctrl.trackedCampaigns = [
    {
      folder_id: 7,
      folder_name: 'crockpot meals',
      source_type: 'vault',
      membership_type: 'cluster_serp',
      can_remove: false,
      keyword_count: 2,
      best_rank: 32
    }
  ];
  assert.equal(ctrl.isInCampaign, true);
  assert.equal(ctrl.campaignButtonLabel, 'In Campaign: crockpot meals');
  assert.equal(ctrl.formatCampaignSourceBadge(ctrl.trackedCampaigns[0]), 'vault · 2 kws · #32');
  assert.equal(ctrl.formatCampaignSelectOption({ id: 7, name: 'crockpot meals' }), 'crockpot meals (In Cluster)');
  assert.equal(ctrl.formatCampaignSelectOption({ id: 13, name: 'cranberry sauce' }), 'cranberry sauce');

  // Pin in 2 cluster folders (Comfort Dinners & Casseroles + crockpot meals)
  ctrl.trackedCampaigns = [
    {
      folder_id: 2,
      folder_name: 'Comfort Dinners & Casseroles',
      source_type: 'vault',
      membership_type: 'cluster_serp',
      can_remove: false,
      keyword_count: 1,
      best_rank: 40
    },
    {
      folder_id: 7,
      folder_name: 'crockpot meals',
      source_type: 'vault',
      membership_type: 'cluster_serp',
      can_remove: false,
      keyword_count: 3,
      best_rank: 38
    }
  ];
  assert.equal(ctrl.isInCampaign, true);
  assert.equal(ctrl.campaignButtonLabel, 'In 2 Campaigns');
  assert.equal(ctrl.formatCampaignSourceBadge(ctrl.trackedCampaigns[0]), 'vault · 1 kw · #40');
});
