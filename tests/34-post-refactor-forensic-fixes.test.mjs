import test from 'node:test';
import assert from 'node:assert/strict';

import { getPinDossier } from '../src/modules/pins/dossier-reader.mjs';
import { listWatchlist, removeCampaignTrackedPin } from '../src/modules/workspaces/service.mjs';
import { getDomainDeepDossier } from '../src/modules/domains/dossier-blueprint-service.mjs';
import { deriveBrandPreviewAlias, listCompetitorAccountPins } from '../src/modules/creators/creator-analytics.mjs';
import { getPinDetailsBodyHtml } from '../src/ui/pin-details/page-template.mjs';
import { getWatchlistPageHtml } from '../src/ui/watchlist/index.mjs';
import { getDomainsStudioViewHtml } from '../src/ui/domains/domains-studio-view.mjs';
import { getDomainsClientAppScript } from '../src/ui/domains/domains-client-app.mjs';
import { renderCreatorsProfilePins } from '../src/ui/dashboard/creators-profile-pins.mjs';

function makeMockSql(handler) {
  const fn = async (strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join('$') : String(strings || '');
    return handler(text, values);
  };
  fn.unsafe = async (queryText, params = []) => handler(String(queryText || ''), params);
  return fn;
}

test('Bug 1: getPinDossier authoritatively includes promoted Newborn campaign membership and folder_name/folder_color', async () => {
  const queries = [];
  const mockSql = makeMockSql((text) => {
    queries.push(text);
    if (text.includes('FROM universal_master_pins') && text.includes('WHERE pin_id =')) {
      return [{
        pin_id: '1100145015261315845',
        title: 'Turtle Oreo Balls with Caramel and Pecans',
        description: 'Easy no-bake holiday treat',
        image_url: 'https://i.pinimg.com/736x/aa/bb/cc.jpg',
        destination_url: 'https://tr.ee/turtle-oreo-balls',
        clean_domain: 'tr.ee',
        creator_username: 'sweettreats',
        current_saves: 7500,
        current_repins: 7500,
        daily_save_velocity: 215,
        delta_saves_24h: 215,
        delta_repins_24h: 215,
        created_at_pinterest: '2026-10-01T00:00:00Z'
      }];
    }
    if (text.includes('FROM newborn_candidates nc') && text.includes('LEFT JOIN keyword_folders nkf')) {
      return [{
        pin_id: '1100145015261315845',
        stage: 'promoted',
        folder_id: 5,
        folder_name: 'high protein',
        folder_color: '#10b981',
        seed_query: 'green bean casserole',
        anchor_active: true,
        discovered_at: '2026-11-10T00:00:00Z'
      }];
    }
    if (text.includes('explicit_tracked AS') && text.includes('newborn_promoted AS')) {
      return [{
        folder_id: 5,
        folder_name: 'high protein',
        folder_color: '#10b981',
        source_type: 'newborn',
        seed_query: 'green bean casserole',
        added_at: '2026-11-10T00:00:00Z',
        notes: null,
        membership_type: 'tracked',
        can_remove: true,
        keyword_count: 0,
        best_rank: null
      }];
    }
    return [];
  });

  const dossier = await getPinDossier(mockSql, '1100145015261315845', { workspaceId: 1 });
  assert.ok(dossier, 'dossier should be returned');
  assert.ok(Array.isArray(dossier.tracked_campaigns), 'tracked_campaigns should be an array');
  assert.ok(Array.isArray(dossier.campaigns), 'campaigns alias should be an array');
  assert.equal(dossier.tracked_campaigns.length, 1);
  assert.equal(dossier.campaigns.length, 1);
  assert.equal(dossier.campaigns[0].folder_id, 5);
  assert.equal(dossier.campaigns[0].folder_name, 'high protein');
  assert.equal(dossier.campaigns[0].folder_color, '#10b981');
  assert.equal(dossier.campaigns[0].source_type, 'newborn');
  assert.equal(dossier.newborn_context.folder_id, 5);
  assert.equal(dossier.newborn_context.folder_name, 'high protein');
  assert.equal(dossier.newborn_context.folder_color, '#10b981');
});

test('Bug 1: removeCampaignTrackedPin detaches promoted newborn_candidates and newborn_daily_anchors cleanly', async () => {
  const executed = [];
  const mockSql = makeMockSql((text, params) => {
    executed.push({ text, params });
    if (text.includes('FROM keyword_folders') && text.includes('WHERE id =')) {
      return [{ id: 5, name: 'high protein', workspace_id: 1 }];
    }
    if (text.includes('DELETE FROM campaign_tracked_pins')) {
      return [{ id: 99 }];
    }
    return [];
  });

  const result = await removeCampaignTrackedPin(mockSql, {
    folderId: 5,
    workspaceId: 1,
    pinId: '1100145015261315845',
    sourceType: 'newborn'
  });

  assert.equal(result.removed, 1);
  assert.ok(
    executed.some((q) => q.text.includes('UPDATE newborn_candidates') && q.text.includes('folder_id = NULL')),
    'should detach newborn_candidates.folder_id'
  );
  assert.ok(
    executed.some((q) => q.text.includes('UPDATE newborn_daily_anchors') && q.text.includes('folder_id = NULL')),
    'should detach newborn_daily_anchors.folder_id'
  );
});

test('Bug 2: listWatchlist enriches Saved Pins with 24h velocity deltas and workspace-scoped campaigns[]', async () => {
  const mockSql = makeMockSql((text) => {
    if (text.includes('SELECT entity_type, COUNT(*)::int AS cnt') && text.includes('FROM workspace_watchlist')) {
      return [{ entity_type: 'pin', cnt: 1 }];
    }
    if (text.includes('FROM workspace_watchlist w') && text.includes('pin_delta_saves_24h')) {
      return [{
        id: 101,
        workspace_id: 1,
        entity_type: 'pin',
        entity_key: '1100145015261315845',
        display_label: 'Turtle Oreo Balls with Caramel and Pecans',
        pin_title: 'Turtle Oreo Balls with Caramel and Pecans',
        pin_image_url: 'https://i.pinimg.com/736x/aa/bb/cc.jpg',
        pin_domain: 'tr.ee',
        pin_save_count: 7500,
        pin_repin_count: 7500,
        pin_daily_save_velocity: 215,
        pin_daily_repin_velocity: 215,
        pin_delta_saves_24h: 215,
        pin_delta_repins_24h: 215
      }];
    }
    if (text.includes('FROM campaign_tracked_pins ctp') && text.includes('newborn_candidates nc')) {
      return [{
        pin_id: '1100145015261315845',
        folder_id: 5,
        folder_name: 'high protein',
        folder_color: '#10b981',
        source_type: 'newborn'
      }];
    }
    return [];
  });

  const out = await listWatchlist(mockSql, { workspaceId: 1, entityType: 'pin' });
  assert.equal(out.items.length, 1);
  const item = out.items[0];
  assert.equal(item.pin_delta_saves_24h, 215);
  assert.equal(item.pin_delta_repins_24h, 215);
  assert.equal(item.pin_daily_repin_velocity, 215);
  assert.ok(Array.isArray(item.campaigns));
  assert.equal(item.campaigns.length, 1);
  assert.equal(item.campaigns[0].folder_id, 5);
  assert.equal(item.campaigns[0].folder_name, 'high protein');
  assert.equal(item.campaigns[0].folder_color, '#10b981');
});

test('Bug 3: getDomainDeepDossier returns 100% 1:1 parity (55 ranked_pins === 55 total_pins, zero 30-pin cap, zero empty-image drop)', async () => {
  const activeRows = Array.from({ length: 5 }, (_, i) => ({
    pin_id: `100000000000000000${i + 1}`,
    title: `Active Recipe Pin ${i + 1}`,
    image_url: `https://i.pinimg.com/736x/a/${i}.jpg`,
    destination_url: `https://spiceupbites.com/active-recipe-${i + 1}/`,
    clean_domain: 'spiceupbites.com',
    creator_username: 'spiceupbites',
    saves: 1000 - i * 50,
    repins: 800 - i * 40,
    velocity: 20 - i,
    delta_saves_24h: 20 - i,
    delta_repins_24h: 15 - i,
    gains_5d: 80,
    gains_7d: 120,
    gains_10d: 160,
    gains_15d: 210,
    rank_position: i + 1,
    prev_rank_position: i + 2,
    last_known_rank: i + 1,
    keyword_id: 10 + i,
    keyword_name: `crockpot meal ${i + 1}`,
    is_displaced: false,
    first_seen_at: '2026-10-01T00:00:00Z'
  }));

  const displacedRows = Array.from({ length: 50 }, (_, i) => ({
    pin_id: `20000000000000000${String(i + 1).padStart(2, '0')}`,
    title: `Vault Recipe Pin ${i + 1}`,
    // Deliberately make one pin have an empty image_url to prove zero silent dropping!
    image_url: i === 49 ? '' : `https://i.pinimg.com/736x/v/${i}.jpg`,
    destination_url: `https://spiceupbites.com/vault-recipe-${i + 1}/`,
    clean_domain: 'spiceupbites.com',
    creator_username: i < 4 ? 'preview_spiceupbites_com' : (i < 31 ? 'spiceupbites' : `curator_${i}`),
    saves: 500 - i * 5,
    repins: 400 - i * 4,
    velocity: 3,
    delta_saves_24h: 3,
    delta_repins_24h: 2,
    gains_5d: 10,
    gains_7d: 15,
    gains_10d: 20,
    gains_15d: 30,
    rank_position: null,
    prev_rank_position: null,
    last_known_rank: i + 6,
    keyword_id: 100 + i,
    keyword_name: `vault keyword ${i + 1}`,
    is_displaced: true,
    first_seen_at: '2026-09-01T00:00:00Z'
  }));

  const mockSql = makeMockSql((text) => {
    if (text.includes('FROM keyword_serp_positions ksp')) {
      return [...activeRows, ...displacedRows];
    }
    if (text.includes('FROM universal_master_pins ump')) {
      return [...activeRows, ...displacedRows];
    }
    return [];
  });

  const dossier = await getDomainDeepDossier(mockSql, 'spiceupbites.com', { fastPath: true });
  assert.equal(dossier.summary.total_pins, 55);
  assert.equal(dossier.summary.active_pins_count, 5);
  assert.equal(dossier.summary.displaced_total_count, 50);
  assert.equal(dossier.summary.displaced_pins_count, 50);
  assert.equal(dossier.summary.displaced_remaining_count, 0);
  assert.equal(dossier.ranked_pins.length, 55, 'ranked_pins must match summary.total_pins 1:1 with zero 30-pin truncation');
  assert.ok(
    dossier.ranked_pins.some((p) => p.pin_id === '2000000000000000050' && p.image_url === ''),
    'pin without image_url must not be silently dropped from ranked_pins'
  );
});

test('Bug 4: deriveBrandPreviewAlias and listCompetitorAccountPins reconcile brand alias and Active+Vault SERP totals', async () => {
  assert.equal(deriveBrandPreviewAlias('spiceupbites.com'), 'preview_spiceupbites_com');
  assert.equal(deriveBrandPreviewAlias('https://www.spiceupbites.com/recipes'), 'preview_spiceupbites_com');
  assert.equal(deriveBrandPreviewAlias(''), '');

  const observedQueries = [];
  const mockSql = makeMockSql((text, params) => {
    observedQueries.push({ text, params });
    if (text.includes('FROM competitor_profiles') && text.includes('LOWER(username)')) {
      return [{
        id: 7,
        username: 'spiceupbites',
        website_url: 'https://spiceupbites.com/'
      }];
    }
    if (text.includes('GROUP BY board_name')) {
      return [{ board_name: 'Crockpot Recipes', count: 36 }];
    }
    if (text.includes('FROM classified_cp')) {
      return [{
        catalog_total: 36,
        qualified_total: 9,
        ranked_total: 36,
        active_serp_total: 5,
        vault_serp_total: 31,
        high_velocity_total: 12,
        external_pins_total: 0
      }];
    }
    if (text.includes('curator_pins_total') && text.includes('curator_ranked_total')) {
      return [{
        curator_pins_total: 19,
        curator_qualified_total: 4,
        curator_ranked_total: 19,
        curator_active_serp_total: 0,
        curator_vault_serp_total: 19,
        curator_high_velocity_total: 3
      }];
    }
    if (text.includes('AS full_count')) {
      return [
        {
          pin_id: '1028861477393685945',
          title: 'Crockpot Kielbasa Potatoes and Green Beans',
          image_url: 'https://i.pinimg.com/736x/1.jpg',
          destination_url: 'https://spiceupbites.com/crockpot-kielbasa',
          link_domain: 'spiceupbites.com',
          save_count: 21392,
          repin_count: 16928,
          delta_saves_24h: 131,
          delta_repins_24h: 132,
          daily_save_velocity: 131,
          is_ranked: true,
          is_active_serp: true,
          is_vault_serp: false,
          active_serp_rank: 4,
          vault_serp_rank: null,
          rank_position: 4,
          attribution_source: 'official',
          full_count: 55
        },
        {
          pin_id: '6680356752260334626',
          title: 'High Protein Beef and Cheese Burritos',
          image_url: 'https://i.pinimg.com/736x/2.jpg',
          destination_url: 'https://spiceupbites.com/high-protein-burritos',
          link_domain: 'spiceupbites.com',
          save_count: 305,
          repin_count: 303,
          delta_saves_24h: 10,
          delta_repins_24h: 10,
          daily_save_velocity: 10,
          is_ranked: true,
          is_active_serp: false,
          is_vault_serp: true,
          active_serp_rank: null,
          vault_serp_rank: 37,
          rank_position: 37,
          attribution_source: 'official',
          full_count: 55
        }
      ];
    }
    return [];
  });

  const res = await listCompetitorAccountPins(mockSql, 'spiceupbites', { scope: 'ecosystem', page: 1, limit: 25 });
  assert.equal(res.catalog_total, 36, 'official account catalog includes primary brand + preview_spiceupbites_com');
  assert.equal(res.curator_pins_total, 19, 'community curators excludes preview_spiceupbites_com');
  assert.equal(res.ecosystem_catalog_total, 55, '36 official + 19 community = 55');
  assert.equal(res.scope_total, 55);
  assert.equal(res.ranked_total, 55, 'SERP Ranked reconciles Active (5) + Vault (50) = 55');
  assert.equal(res.active_serp_total, 5);
  assert.equal(res.vault_serp_total, 50);
  assert.equal(res.pins[0].is_active_serp, true);
  assert.equal(res.pins[1].is_vault_serp, true);
  assert.equal(res.pins[1].vault_serp_rank, 37);
  assert.ok(
    observedQueries.some((q) => Array.isArray(q.params) && q.params.includes('preview_spiceupbites_com')),
    'SQL parameters should pass derived brand preview alias preview_spiceupbites_com'
  );
});

test('Rendered UI contracts: zero redundant Action/Inspect/Open Pin columns, direct /pin/ links, velocity & campaign columns present', () => {
  const pinHtml = getPinDetailsBodyHtml('1100145015261315845');
  assert.ok(pinHtml.includes('data-testid="pin-campaign-provenance"'));
  assert.ok(pinHtml.includes('uniqueTrackedCampaigns'));
  assert.ok(pinHtml.includes('isFolderAssigned(f.id)'));

  const watchlistHtml = getWatchlistPageHtml('pin');
  assert.ok(watchlistHtml.includes('24h Velocity'));
  assert.ok(watchlistHtml.includes('Campaign'));
  assert.ok(watchlistHtml.includes('catalogSummaryText'));
  assert.ok(!watchlistHtml.includes('Open Pin'), 'redundant Open Pin button must be removed from Watchlist Saved Pins');
  assert.ok(!watchlistHtml.includes('(Total indexed: '), 'contradictory hardcoded Total indexed subtitle must be replaced');

  const domainHtml = getDomainsStudioViewHtml({ hasInitialDomain: true });
  assert.ok(!domainHtml.includes('Inspect ↗'), 'redundant Inspect ↗ button must be removed from Domain Studio pin tables');
  assert.ok(!domainHtml.includes('Load +50 Displaced Vault Pins'), 'obsolete displaced loader banner must be removed');
  assert.ok(domainHtml.includes(':href="getPinInspectUrl(p.pin_id)"'), 'pin thumbnails and titles must link directly to /pin/:id');

  const creatorPinsHtml = renderCreatorsProfilePins();
  assert.ok(!creatorPinsHtml.includes('visibleMasterColumns.actions'), 'redundant Actions column must be removed from Creator All Account Pins');
  assert.ok(creatorPinsHtml.includes(':href="\'/pin/\' + encodeURIComponent(p.pin_id)"'), 'creator pin thumbnails and titles must be semantic anchor links');
  assert.ok(creatorPinsHtml.includes('Vault #'), 'creator status column must distinguish Vault SERP rankings');
});

test('Bug 3 client parity: filteredDossierPins and filteredDossierArticles preserve pins with missing image_url (55 === 55)', () => {
  const script = getDomainsClientAppScript().replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
  const factory = new Function('window', 'document', 'localStorage', 'sessionStorage', `${script}\nreturn domainsApp;`);
  const app = factory(
    { location: { pathname: '/domains/spiceupbites.com', search: '' }, history: { pushState: () => {}, replaceState: () => {} } },
    { documentElement: { classList: { contains: () => false } } },
    { getItem: () => null, setItem: () => {} },
    { getItem: () => null, setItem: () => {} }
  )();

  const pins = Array.from({ length: 55 }, (_, i) => ({
    pin_id: String(1000 + i),
    title: `Pin ${i}`,
    image_url: i === 1 ? '' : 'https://i.pinimg.com/236x/a.jpg',
    clean_slug: '/recipe-1',
    saves: 100 + i,
    is_displaced: i >= 5,
    best_rank: i < 5 ? i + 1 : null
  }));
  app.dossierData = {
    ranked_pins: pins,
    money_urls: [{ clean_slug: '/recipe-1', pins: [pins[0], pins[1]] }]
  };
  assert.equal(app.filteredDossierPins().length, 55, 'filteredDossierPins must keep all 55 pins including empty image_url');
  assert.equal(app.filteredDossierArticles()[0].pins.length, 2, 'filteredDossierArticles must preserve pins without image_url');
});
