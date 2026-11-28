/**
 * tests/30-campaign-pipeline-unification.test.mjs
 *
 * Pure behavioral verification for Campaign Folder pipeline unification across
 * Discover/Newborn & SERP pillars:
 *   1. Promoting Newborn pins or adding Campaign Tracked pins auto-links seed_query
 *      into tracked_keywords + keyword_folder_items (without fabricating SERP ranks).
 *   2. Folder header rollups (listFolders, getFolder), Creator Hub (listFolderCreatorsWithDiscovery),
 *      and Domain Studio (buildDomainAggregationCtes, getDomainDeepDossier) include
 *      active campaign_tracked_pins alongside keyword_serp_positions.
 *   3. Visual & Intent Matrix (buildFolderCrossoverMatrix) surfaces authentic tag bridges,
 *      dominant colors, creator monopoly, and creator/related scope counters for
 *      Discover/Newborn-only folders with 0 SERP rankings.
 *   4. Room 1 HTML eliminates the duplicate Daily Tracked Pins (4 Sources) block,
 *      consolidates Sync Top N + Pin Graph Seeds + Creators/Related scopes into
 *      All Cluster Pins, and fixes the residual Competitor Gains subtitle leak.
 *   5. Pin Dossier (/pin/:id) replaces static "Campaign / Seed" with a stateful
 *      Campaign Membership button (+ Add to Campaign / In Campaign: <name> / In N Campaigns)
 *      and modal with active membership list + inline Remove + separated Pin Graph Seed action.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { promoteNewbornCandidates, normalizeFolderLinkKeyword } from '../src/modules/newborn/promotions.mjs';
import { addCampaignTrackedPins } from '../src/modules/workspaces/service.mjs';
import { listFolders, getFolder, listFolderCreatorsWithDiscovery } from '../src/modules/keywords/folders-crud.mjs';
import { buildDomainAggregationCtes } from '../src/modules/domains/rollup-leaderboard-service.mjs';
import { getDomainDeepDossier } from '../src/modules/domains/dossier-blueprint-service.mjs';
import { buildFolderCrossoverMatrix } from '../src/modules/keywords/folders-crossover-builders.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getPinDetailPageHtml } from '../src/ui/pin-details/index.mjs';
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

test('normalizeFolderLinkKeyword accepts authentic queries and rejects synthetic refs', () => {
  assert.equal(normalizeFolderLinkKeyword('  Cranberry   Sauce  '), 'cranberry sauce');
  assert.equal(normalizeFolderLinkKeyword('green bean casserole'), 'green bean casserole');
  assert.equal(normalizeFolderLinkKeyword('pin_dossier'), '');
  assert.equal(normalizeFolderLinkKeyword('manual'), '');
  assert.equal(normalizeFolderLinkKeyword('1108026314613587867'), '');
  assert.equal(normalizeFolderLinkKeyword('snowball:81000000000001'), '');
  assert.equal(normalizeFolderLinkKeyword('a'), '');
});

test('promoteNewbornCandidates auto-links seed_query to keyword_folder_items without fabricating keyword_serp_positions', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM newborn_candidates')) {
      return [
        {
          id: 901,
          pin_id: '1108026314613587867',
          seed_query: 'cranberry sauce',
          save_count: 22493,
          repin_count: 20312,
          title: 'Turkey Gravy Recipe',
          domain: 'ideafactory247.com',
          creator_username: 'hollybest67',
          crossover_blueprint: { primary_keyword: 'cranberry sauce' }
        }
      ];
    }
    if (queryText.includes('FROM keyword_folders')) {
      return [{ id: 13, name: 'cranberry sauce', workspace_id: 1, metadata: {} }];
    }
    if (queryText.includes('FROM tracked_keywords') && queryText.includes('LOWER(keyword)')) {
      return [{ id: 77, keyword: 'cranberry sauce' }];
    }
    if (queryText.includes('INSERT INTO keyword_folder_items')) {
      return [{ folder_id: 13, keyword_id: 77 }];
    }
    if (queryText.includes('UPDATE newborn_candidates')) {
      return [{ id: 901, pin_id: '1108026314613587867', stage: 'promoted' }];
    }
    return [];
  });

  const res = await promoteNewbornCandidates(sql, {
    pinIds: ['1108026314613587867'],
    destinations: { promote_to_campaign_folder_id: 13 },
    workspaceId: 1
  });

  assert.equal(res.promoted_count, 1);
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('INSERT INTO keyword_folder_items') && q.values.includes(13) && q.values.includes(77)),
    'Expected seed_query keyword #77 to be auto-linked into keyword_folder_items for folder #13'
  );
  assert.equal(
    sql.queries.some((q) => q.queryText.includes('INSERT INTO keyword_serp_positions')),
    false,
    'Must NEVER fabricate fake keyword_serp_positions rows for promoted Newborn pins'
  );
});

test('addCampaignTrackedPins auto-links newborn seed_query into tracked_keywords and keyword_folder_items', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM keyword_folders')) {
      return [{ id: 5, name: 'high protein', workspace_id: 1, metadata: {} }];
    }
    if (queryText.includes('FROM tracked_keywords') && queryText.includes('LOWER(keyword)')) {
      return [{ id: 88, keyword: 'green bean casserole' }];
    }
    if (queryText.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ pin_id: '557531628905046632' }];
    }
    return [];
  });

  const result = await addCampaignTrackedPins(sql, {
    folderId: 5,
    workspaceId: 1,
    pinIds: ['557531628905046632'],
    sourceType: 'newborn',
    sourceRef: 'green bean casserole',
    seedQuery: 'green bean casserole'
  });

  assert.equal(result.folder_id, 5);
  assert.equal(result.added, 1);
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('INSERT INTO keyword_folder_items') && q.values.includes(5) && q.values.includes(88)),
    'Expected addCampaignTrackedPins to auto-link green bean casserole (#88) into folder #5'
  );
});

test('listFolders, getFolder, and listFolderCreatorsWithDiscovery unify campaign_tracked_pins into folder_pins / all_folder_pins CTEs', async () => {
  const sql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM keyword_folders')) {
      return [{ id: 13, name: 'cranberry sauce', pin_count: 26, keyword_count: 1, discovered_creator_count: 14, domain_count: 8 }];
    }
    return [];
  });

  const folders = await listFolders(sql, { workspaceId: 1 });
  assert.equal(folders.length, 1);
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('FROM campaign_tracked_pins ctp') && q.queryText.includes('UNION ALL')),
    'listFolders CTE must UNION ALL active campaign_tracked_pins'
  );

  sql.queries.length = 0;
  const folder = await getFolder(sql, 13, { workspaceId: 1 });
  assert.equal(folder.id, 13);
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('FROM campaign_tracked_pins ctp') && q.queryText.includes('UNION ALL')),
    'getFolder CTE must UNION ALL active campaign_tracked_pins'
  );

  sql.queries.length = 0;
  await listFolderCreatorsWithDiscovery(sql, 13, { workspaceId: 1 });
  assert.ok(
    sql.queries.some((q) => q.queryText.includes('all_folder_pins') && q.queryText.includes('FROM campaign_tracked_pins ctp')),
    'listFolderCreatorsWithDiscovery must include active campaign_tracked_pins in all_folder_pins'
  );
});

test('Domain Studio folder rollups and deep dossier include active campaign_tracked_pins', async () => {
  const ctes = buildDomainAggregationCtes({ fId: 13, kId: null, referenceTime: new Date('2026-11-27T12:00:00Z') });
  const flattenFrag = (frag) => {
    if (!frag) return { text: '', values: [] };
    if (!frag.__sqlFrag) return { text: String(frag), values: [] };
    let text = '';
    const values = [];
    for (let i = 0; i < frag.strings.length; i++) {
      text += frag.strings[i];
      if (i < frag.values.length) {
        const v = frag.values[i];
        if (v && v.__sqlFrag) {
          const nested = flattenFrag(v);
          text += nested.text;
          values.push(...nested.values);
        } else {
          text += '?';
          values.push(v);
        }
      }
    }
    return { text, values };
  };
  const flattened = flattenFrag(ctes.ctesSql || ctes.rawOccurrencesSql || ctes);
  assert.ok(
    flattened.text.includes('FROM campaign_tracked_pins ctp') && flattened.values.includes(13),
    'buildDomainAggregationCtes must UNION ALL folder-scoped active campaign_tracked_pins'
  );

  const dossierSql = createCapturingSql(({ queryText }) => {
    if (queryText.includes('FROM domain_profiles')) {
      return [{ domain: 'ideafactory247.com', first_seen_at: '2026-11-01T00:00:00Z' }];
    }
    if (queryText.includes('FROM campaign_tracked_pins ctp')) {
      return [
        {
          pin_id: '1123014857116521311',
          title: 'Cranberry Mocktail Recipe',
          clean_domain: 'ideafactory247.com',
          save_count: 3914,
          repin_count: 3893,
          daily_save_velocity: 149,
          delta_saves_24h: 149,
          delta_repins_24h: 147,
          rank_position: null,
          is_displaced: false,
          keyword: 'cranberry sauce',
          creator_username: 'ideafactory247'
        }
      ];
    }
    return [];
  });

  const dossier = await getDomainDeepDossier(dossierSql, 'ideafactory247.com', { folderId: 13, workspaceId: 1 });
  assert.ok(dossier, 'Expected non-null domain dossier for folder-tracked pin domain');
  assert.equal(dossier.summary.total_pins, 1);
  assert.ok(
    dossierSql.queries.some((q) => q.queryText.includes('FROM campaign_tracked_pins ctp')),
    'getDomainDeepDossier must query folder-scoped campaign_tracked_pins'
  );
});

test('buildFolderCrossoverMatrix produces authentic Visual Bridges, colors, and source counters for Discover/Newborn-only folder (0 SERP rows)', async () => {
  const sql = createCapturingSql(() => []);
  const matrix = await buildFolderCrossoverMatrix({
    sql,
    folder: { id: 13, name: 'cranberry sauce', items: [{ keyword_id: 77, keyword: 'cranberry sauce' }] },
    folderKeywords: [{ keyword_id: 77, keyword: 'cranberry sauce' }],
    totalKeywords: 1,
    pinRows: [
      {
        pin_id: '1108026314613587867',
        title: 'Turkey Gravy Recipe',
        clean_domain: 'ideafactory247.com',
        creator_username: 'hollybest67',
        save_count: 22493,
        repin_count: 20312,
        daily_save_velocity: 903,
        delta_saves_24h: 903,
        delta_repins_24h: 883,
        dominant_color: '#8b2635',
        visual_annotations: ['Cranberry Sauce', 'Thanksgiving Recipes', 'Holiday Side Dish'],
        rankings: [],
        tracked_sources: ['newborn'],
        newborn_seed_query: 'cranberry sauce',
        creator_source_ref: null,
        related_source_ref: null
      },
      {
        pin_id: '557531628905046632',
        title: 'Cranberry Jalapeno Dip',
        clean_domain: 'happytobehereblog.com',
        creator_username: 'victorgourmand',
        save_count: 5653,
        repin_count: 5618,
        daily_save_velocity: 499,
        delta_saves_24h: 499,
        delta_repins_24h: 496,
        dominant_color: '#8b2635',
        visual_annotations: ['Cranberry Sauce', 'Thanksgiving Recipes', 'Party Appetizer'],
        rankings: [],
        tracked_sources: ['newborn', 'creator'],
        newborn_seed_query: 'cranberry sauce',
        creator_source_ref: 'victorgourmand',
        related_source_ref: null
      },
      {
        pin_id: '912401205785408287',
        title: 'Cranberry Brie Bites',
        clean_domain: 'happytobehereblog.com',
        creator_username: 'watchyummycrumb',
        save_count: 2813,
        repin_count: 2792,
        daily_save_velocity: 224,
        delta_saves_24h: 224,
        delta_repins_24h: 221,
        dominant_color: '#d97706',
        visual_annotations: ['Cranberry Sauce', 'Puff Pastry'],
        rankings: [],
        tracked_sources: ['related'],
        newborn_seed_query: null,
        creator_source_ref: null,
        related_source_ref: '1108026314613587867'
      }
    ],
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: [],
    workspaceId: 1
  });

  assert.equal(matrix.summary.total_unique_pins, 3);
  assert.equal(matrix.summary.newborn_pins_count, 2);
  assert.equal(matrix.summary.creator_pins_count, 1);
  assert.equal(matrix.summary.related_pins_count, 1);
  assert.ok(matrix.summary.universal_tags_count >= 2, 'Expected >= 2 shared Visual Bridge tags across Discover/Newborn cluster pins');
  assert.ok(matrix.dominant_colors.length >= 2, 'Expected dominant color palette aggregated from Newborn tracked pins');
  assert.equal(matrix.all_pins[1].creator_source_ref, 'victorgourmand');
  assert.equal(matrix.all_pins[2].related_source_ref, '1108026314613587867');
});

test('Room 1 rendered HTML removes duplicate Daily Tracked Pins section, unifies controls, and fixes Competitor Gains subtitle leak', () => {
  const html = getCampaignFoldersPageHtml('13');
  assert.equal(html.includes('Daily Tracked Pins (4 Sources)'), false, 'Duplicate Daily Tracked Pins (4 Sources) card must be removed');
  assert.ok(html.includes('Sync Top '), 'Sync Top N button must live in All Cluster Pins header');
  assert.ok(html.includes('Pin Graph Seeds ('), 'Pin Graph Seeds toggle must live in All Cluster Pins header');
  assert.ok(html.includes("scopeFilter = 'creator_only'"), 'Creators scope pill must live in All Cluster Pins toolbar');
  assert.ok(html.includes("scopeFilter = 'related_only'"), 'Related scope pill must live in All Cluster Pins toolbar');
  assert.ok(html.includes('removeTrackedPin(sp.pin_id)'), 'Inline Untrack button must be present on tracked rows in All Cluster Pins');
  assert.equal(
    html.includes('matched_creators_count || (crossoverData?.top_creators?.length'),
    false,
    'Competitor Gains subtitle must NOT fall back to top_creators.length when matched_creators_count is 0'
  );
});

test('Pin Dossier (/pin/:id) renders stateful Campaign Membership CTA and modal without static Campaign / Seed label', () => {
  const html = getPinDetailPageHtml('1100145015261315845');
  assert.equal(html.includes('>Campaign / Seed<'), false, 'Static ambiguous "Campaign / Seed" label must be removed');
  assert.ok(html.includes('openV4CampaignModal()'), 'Stateful Campaign button must open the Campaign modal');
  assert.ok(html.includes('campaignButtonLabel'), 'Campaign button must render reactive campaignButtonLabel');
  assert.ok(html.includes('removePinFromCampaign('), 'Campaign modal must support inline removal from active campaigns');
  assert.ok(html.includes('Queue as Related Pin Graph Seed'), 'Pin Graph Seed must remain clearly separated as a secondary modal action');

  // Execute the pinDetailApp() factory to verify stateful label & membership transitions
  const clientJs = getPinDetailsClientAppScripts();
  const scriptMatch = clientJs.match(/function pinDetailApp\([\s\S]*?\n    \}/);
  assert.ok(scriptMatch, 'Expected pinDetailApp factory in Pin Dossier client script');
  const factory = new Function(`return (${scriptMatch[0]});`)();
  const state = factory('1100145015261315845');

  // 0 campaigns -> + Add to Campaign
  assert.equal(state.isInCampaign, false);
  assert.equal(state.campaignButtonLabel, '+ Add to Campaign');

  // 1 campaign -> In Campaign: <name>
  state.trackedCampaigns = [{ folder_id: 13, folder_name: 'cranberry sauce', source_type: 'newborn' }];
  assert.equal(state.isInCampaign, true);
  assert.equal(state.campaignButtonLabel, 'In Campaign: cranberry sauce');

  // 2 campaigns -> In 2 Campaigns (<first>, +1)
  state.trackedCampaigns = [
    { folder_id: 13, folder_name: 'cranberry sauce', source_type: 'newborn' },
    { folder_id: 5, folder_name: 'high protein', source_type: 'related' }
  ];
  assert.equal(state.isInCampaign, true);
  assert.equal(state.campaignButtonLabel, 'In 2 Campaigns (cranberry sauce, +1)');
});
