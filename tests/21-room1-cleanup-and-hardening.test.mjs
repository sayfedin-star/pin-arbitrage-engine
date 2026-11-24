import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

import crypto from 'node:crypto';
import {
  isLinklessVacuumDomain,
  buildFolderCrossoverMatrix,
  calculateFolderCrossover,
  invalidateFolderCache,
  folderForceRefreshCooldown
} from '../src/modules/keywords/folders-crossover.mjs';
import { getFolder, listFolders, getPruningCandidates } from '../src/modules/keywords/folders-crud.mjs';
import { syncCampaignTopNSerpPins } from '../src/modules/workspaces/service.mjs';
import { splitSqlStatements } from '../scripts/migrate.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getFoldersClientAppScript } from '../src/ui/folders/folders-client-app.mjs';
import { getDashboardHtml } from '../src/ui/dashboard/index.mjs';
import { getKeywordsPageHtml } from '../src/ui/keywords/index.mjs';
import { getDomainsPageHtml } from '../src/ui/domains/index.mjs';

function instantiateFoldersApp(folderId = '5') {
  const html = getCampaignFoldersPageHtml(folderId);
  const scriptHtml = getFoldersClientAppScript();
  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/i);
  assert.ok(match && match[1], 'foldersApp script must be present in getFoldersClientAppScript()');
  const sandbox = {
    window: {
      location: { pathname: `/folders/${folderId}`, search: '', href: `http://localhost:3000/folders/${folderId}` },
      history: { pushState: () => {}, replaceState: () => {} },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {}
    },
    document: { documentElement: { classList: { toggle: () => {} } }, cookie: '' },
    URLSearchParams,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  return { app: sandbox.foldersApp(folderId), html };
}

test('Phase 1: isLinklessVacuumDomain handles all case variants and excludes real external domains', () => {
  assert.equal(isLinklessVacuumDomain(''), true);
  assert.equal(isLinklessVacuumDomain(null), true);
  assert.equal(isLinklessVacuumDomain('uploaded by user'), true);
  assert.equal(isLinklessVacuumDomain('Uploaded by user'), true);
  assert.equal(isLinklessVacuumDomain('UPLOADED BY USER'), true);
  assert.equal(isLinklessVacuumDomain('uploaded-by-user'), true);
  assert.equal(isLinklessVacuumDomain('organic'), true);
  assert.equal(isLinklessVacuumDomain('Organic'), true);

  assert.equal(isLinklessVacuumDomain('allrecipes.com'), false);
  assert.equal(isLinklessVacuumDomain('thekitchengirl.com'), false);
});

test('Phase 1 & 3: buildFolderCrossoverMatrix unifies Super-Pins (Active+Vault >= 2), case-insensitive Vacuums, authentic Breakout Baby Domains, impossible tenure guard, and slim payload', async () => {
  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

  const folderKeywords = [
    { keyword_id: 101, keyword: 'high protein', slug: 'high-protein', category: 'Food', status: 'ACTIVE', created_at: daysAgo(60), added_at: daysAgo(45) },
    { keyword_id: 102, keyword: 'meal prep', slug: 'meal-prep', category: 'Food', status: 'ACTIVE', created_at: daysAgo(60), added_at: daysAgo(45) },
    { keyword_id: 103, keyword: 'healthy dinner', slug: 'healthy-dinner', category: 'Food', status: 'ACTIVE', created_at: daysAgo(60), added_at: daysAgo(45) }
  ];

  // Pre-aggregated SQL row shape (rankings jsonb array) simulating zero-truncation query
  const aggregatedPinRows = [
    {
      pin_id: '100001',
      title: 'High Protein Overnight Oats',
      description: 'Quick breakfast',
      image_url: 'https://i.pinimg.com/1.jpg',
      destination_url: '',
      domain: 'uploaded by user', // lowercase vacuum domain!
      save_count: 8882,
      repin_count: 4200,
      comment_count: 12,
      daily_save_velocity: 395,
      delta_saves_24h: 395,
      delta_repins_24h: 393,
      gains_5d: 1400,
      gains_7d: 2662,
      gains_10d: null,
      gains_15d: null,
      dominant_color: '#E6D5C3',
      visual_annotations: ['High Protein', 'Meal Prep'],
      creator_username: 'janetrhana',
      creator_name: 'Janet',
      created_at_pinterest: daysAgo(29), // Pin is 29d old
      pin_first_seen_at: null, // No first_seen_at -> falls back to keyword_added (45d > 29d impossible!)
      rankings: [
        { keyword_id: 101, keyword: 'high protein', rank_position: 1033, is_vault: true, added_at: daysAgo(45) },
        { keyword_id: 102, keyword: 'meal prep', rank_position: 1044, is_vault: true, added_at: daysAgo(45) }
      ]
    },
    {
      pin_id: '100002',
      title: 'Zero Gain Baby Domain Pin',
      description: 'Should NOT be flagged breakout when gains_7d is 0 despite velocity > 0',
      image_url: 'https://i.pinimg.com/2.jpg',
      destination_url: 'https://newblog.example.com/recipe',
      domain: 'newblog.example.com',
      save_count: 450,
      repin_count: 120,
      comment_count: 2,
      daily_save_velocity: 20, // high daily velocity, but gains_7d = 0!
      delta_saves_24h: 20,
      delta_repins_24h: 5,
      gains_5d: 0,
      gains_7d: 0,
      gains_10d: null,
      gains_15d: null,
      dominant_color: '#E6D5C3',
      visual_annotations: ['High Protein', 'Dinner'],
      creator_username: 'chefzero',
      creator_name: 'Chef Zero',
      created_at_pinterest: daysAgo(40),
      pin_first_seen_at: daysAgo(12),
      rankings: [
        { keyword_id: 101, keyword: 'high protein', rank_position: 4, is_vault: false, added_at: daysAgo(45) }
      ]
    },
    {
      pin_id: '100003',
      title: 'True Breakout Baby Domain Pin',
      description: 'Young domain with authentic 7d gains >= 15',
      image_url: 'https://i.pinimg.com/3.jpg',
      destination_url: 'https://risingkitchen.example.com/bowl',
      domain: 'risingkitchen.example.com',
      save_count: 1250,
      repin_count: 610,
      comment_count: 8,
      daily_save_velocity: 45,
      delta_saves_24h: 45,
      delta_repins_24h: 30,
      gains_5d: 180,
      gains_7d: 240,
      gains_10d: 310,
      gains_15d: null,
      dominant_color: '#B5482A',
      visual_annotations: ['High Protein', 'Meal Prep'],
      creator_username: 'risingchef',
      creator_name: 'Rising Chef',
      created_at_pinterest: daysAgo(10),
      pin_first_seen_at: daysAgo(6),
      rankings: [
        { keyword_id: 101, keyword: 'high protein', rank_position: 2, is_vault: false, added_at: daysAgo(45) },
        { keyword_id: 103, keyword: 'healthy dinner', rank_position: 1015, is_vault: true, added_at: daysAgo(45) }
      ]
    }
  ];

  // Add 22 more creators (total 25) to verify competitor_audience_gains aggregates ALL matched creators, not just top 20
  for (let i = 0; i < 22; i++) {
    aggregatedPinRows.push({
      pin_id: String(200000 + i),
      title: `Extra Creator Pin ${i}`,
      description: 'High protein lunch idea',
      image_url: `https://i.pinimg.com/e${i}.jpg`,
      destination_url: `https://extra${i}.example.com/p`,
      domain: `extra${i}.example.com`,
      save_count: 200,
      repin_count: 50,
      comment_count: 0,
      daily_save_velocity: 2,
      delta_saves_24h: 2,
      delta_repins_24h: 1,
      gains_5d: null,
      gains_7d: null,
      gains_10d: null,
      gains_15d: null,
      dominant_color: '#E6D5C3',
      visual_annotations: ['High Protein'],
      creator_username: `creator_${i}`,
      creator_name: `Creator ${i}`,
      created_at_pinterest: daysAgo(30),
      pin_first_seen_at: daysAgo(5),
      rankings: [
        { keyword_id: 101, keyword: 'high protein', rank_position: 20 + i, is_vault: false, added_at: daysAgo(45) }
      ]
    });
  }

  // Per-pin repin window rows
  const repinWindowRows = [
    { pin_id: '100001', repins_5d: 1200, repins_7d: 2100, repins_10d: null, repins_15d: null },
    { pin_id: '100002', repins_5d: 0, repins_7d: 0, repins_10d: null, repins_15d: null },
    { pin_id: '100003', repins_5d: 140, repins_7d: 195, repins_10d: 260, repins_15d: null }
  ];

  const mockSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM domain_intelligence_rollup')) {
      return [
        { domain: 'newblog.example.com', age_days: 300, age_years: 0.82, ad_network: 'Mediavine' },
        { domain: 'risingkitchen.example.com', age_days: 220, age_years: 0.6, ad_network: 'Raptive' }
      ];
    }
    if (q.includes('FROM competitor_profiles')) {
      const rows = [
        { username: 'janetrhana', monthly_reach: 1000, profile_views: 5000, delta_reach_24h: 10, reach_delta_7d: 50 },
        { username: 'chefzero', monthly_reach: 1000, profile_views: 5000, delta_reach_24h: 10, reach_delta_7d: 50 },
        { username: 'risingchef', monthly_reach: 1000, profile_views: 5000, delta_reach_24h: 10, reach_delta_7d: 50 }
      ];
      for (let i = 0; i < 22; i++) {
        rows.push({ username: `creator_${i}`, monthly_reach: 1000, profile_views: 5000, delta_reach_24h: 10, reach_delta_7d: 50 });
      }
      return rows;
    }
    return [];
  };

  const result = await buildFolderCrossoverMatrix({
    sql: mockSql,
    folder: { id: 5, name: 'high protein', description: '', color: '#ec4899', icon: 'folder', created_at: daysAgo(60) },
    folderKeywords,
    totalKeywords: folderKeywords.length,
    pinRows: aggregatedPinRows,
    displacedRows: [],
    capsuleRows: [
      { keyword_id: 101, keyword_text: 'high protein', term: 'breakfast', label: 'Breakfast', display_order: 1, score: 10, dominant_color: '#3b82f6' },
      { keyword_id: 102, keyword_text: 'meal prep', term: 'breakfast', label: 'Breakfast', display_order: 2, score: 8, dominant_color: '#3b82f6' }
    ],
    repinWindowRows,
    pulseAnalyticsPromise: Promise.resolve({ trendsLoaded: 0, trendsResults: [] })
  });

  // 1. Unified Super-Pins (Active + Vault >= 2 keywords)
  // Pin 100001 (2 vault kws) & Pin 100003 (1 active + 1 vault) are BOTH super pins!
  assert.equal(result.summary.super_pins_count, 2);
  assert.equal(result.all_pins.filter(p => p.is_super_pin).length, 2);
  assert.equal(result.super_pins.length, 2);

  const pin1 = result.all_pins.find(p => p.pin_id === '100001');
  const pin2 = result.all_pins.find(p => p.pin_id === '100002');
  const pin3 = result.all_pins.find(p => p.pin_id === '100003');

  // 2. Case-insensitive Linkless Vacuum detection
  assert.equal(pin1.is_vacuum_pin, true, 'lowercase "uploaded by user" with save_count >= 100 must be vacuum');
  assert.equal(pin2.is_vacuum_pin, false);
  assert.equal(result.summary.vacuum_pins_count, 1);

  // 3. Authentic Breakout Baby Domains (zero velocity || fallback)
  assert.equal(pin2.is_breakout_baby_domain, false, 'baby domain with gains_7d === 0 must NOT be breakout');
  assert.equal(pin3.is_breakout_baby_domain, true, 'baby domain with gains_7d >= 15 must be breakout');
  assert.equal(result.summary.breakout_baby_domains_count, 1);

  // 4. Impossible Pin Tenure guard
  assert.equal(pin1.folder_age_days, null, 'inherited folder_added_at > pin_age_days must be nulled out');
  assert.equal(pin3.folder_age_days, 6, 'authentic first_seen_at must be preserved');
  assert.equal(pin3.tenure_source, 'first_seen');

  // 5. Authentic per-pin repins & multi-window coverage (no fabrication for 15d)
  assert.equal(pin1.repins_gains_7d, 2100);
  assert.equal(pin1.repins_gains_15d, null);
  assert.equal(result.summary.multi_window_gains['7d'].saves, 2662 + 0 + 240);
  assert.equal(result.summary.multi_window_gains['7d'].repins, 2100 + 0 + 195);
  assert.equal(result.summary.multi_window_gains['15d'].saves, null);
  assert.equal(result.summary.multi_window_gains['15d'].repins, null);
  assert.equal(result.summary.multi_window_gains['15d'].saves_coverage, 0);

  // 6. Full-cluster competitor audience gains (25 creators * 10 = 250 for 24h, not truncated to 20!)
  assert.equal(result.summary.competitor_audience_gains['24h'], 250);
  assert.equal(result.summary.competitor_audience_gains['7d'], 1250);
  assert.equal(result.summary.competitor_audience_gains.all, 25000);
  assert.equal(result.summary.competitor_audience_gains.matched_creators_count, 25);

  // 7. Payload slimming (Phase 3)
  assert.deepEqual(result.domain_monopoly, [], 'dead domain_monopoly array must be empty');
  assert.equal(result.summary.monopoly_domain_count, 24, 'commercial domain count must exclude uploaded by user');
  assert.equal('creator_monopoly' in result, false, 'duplicate creator_monopoly must be omitted');
  assert.ok(Array.isArray(result.top_creators) && result.top_creators.length > 0, 'Lock 4 top_creators preserved');
  assert.deepEqual(result.seasonality.composite_wave, [], '52-week wave skipped when trendsLoaded === 0');
  assert.equal(result.seasonality.recommended_launch_window, 'Evergreen');
  for (const b of result.tag_bridges) {
    assert.equal('sample_pins' in b, false, 'tag_bridges must not embed redundant sample_pins');
  }
  for (const p of result.guided_pivots) {
    assert.equal('sample_pins' in p, false, 'guided_pivots must not embed redundant sample_pins');
  }
  for (const c of result.dominant_colors) {
    assert.equal('matching_pins' in c, false, 'dominant_colors must not embed redundant matching_pins');
  }
});

test('Phase 1 & 2: foldersApp enforces zero fake extrapolation, authentic Breakout/Vacuum filtering, and clean Room 1 HTML', () => {
  const { app, html } = instantiateFoldersApp('5');

  // Verify Room 1 HTML decluttering
  assert.equal(html.includes('Re-Run Crossover Analysis'), false, 'duplicate Re-Run button removed');
  assert.equal(html.includes('Visual Hub ↓'), false, 'duplicate Visual Hub link removed');
  assert.equal(html.includes('Winning Cluster Pins'), false, 'duplicate Winning Cluster Pins card removed');
  assert.equal(html.includes('UNIVERSAL BRIDGES'), false, 'redundant 6-KPI row removed');
  assert.ok(html.includes('Breakout Baby Domains'), 'Breakout Baby Domains signal button present');
  assert.ok(html.includes('Linkless Vacuums'), 'Linkless Vacuums signal button present');
  assert.ok(html.includes('Showing top 30 of'), 'Tracked Pins 30-item truncation indicator present');

  // Verify zero fake extrapolation when multi-window data is missing
  const pinMissing10d15d = {
    pin_id: '9001',
    domain: 'uploaded by user',
    save_count: 500,
    repin_count: 250,
    effective_velocity: 100,
    daily_save_velocity: 100,
    delta_repins_24h: 80,
    gains_5d: 450,
    gains_7d: null,
    gains_10d: null,
    gains_15d: null,
    repins_gains_5d: 320,
    repins_gains_7d: null,
    repins_gains_10d: null,
    repins_gains_15d: null,
    domain_age_days: 200,
    is_breakout_baby_domain: false,
    is_vacuum_pin: true
  };

  app.selectedTimeWindow = '7d';
  assert.equal(app.getPinWindowGain(pinMissing10d15d), null, 'must NOT extrapolate 7d saves from 24h * 7');
  assert.equal(app.getPinWindowRepins(pinMissing10d15d), null, 'must NOT extrapolate 7d repins from 24h * 7');
  assert.equal(app.formatPinWindowPrimary(pinMissing10d15d), '—');

  app.selectedTimeWindow = '15d';
  assert.equal(app.getPinWindowGain(pinMissing10d15d), null, 'must NOT extrapolate 15d saves');
  assert.equal(app.getPinWindowRepins(pinMissing10d15d), null, 'must NOT extrapolate 15d repins');
  assert.equal(app.formatPinWindowPrimary(pinMissing10d15d), '—');

  app.selectedTimeWindow = '5d';
  assert.equal(app.getPinWindowGain(pinMissing10d15d), 450);
  assert.equal(app.getPinWindowRepins(pinMissing10d15d), 320);

  // Verify Rollup Bar returns null (not fabricated extrapolation) when window has no coverage
  app.crossoverData = {
    summary: {
      multi_window_gains: {
        '24h': { saves: 1000, repins: 800, saves_coverage: 10, repins_coverage: 10 },
        '5d': { saves: 4000, repins: 3100, saves_coverage: 8, repins_coverage: 8 },
        '7d': { saves: 5200, repins: 4100, saves_coverage: 8, repins_coverage: 8 },
        '10d': { saves: null, repins: null, saves_coverage: 0, repins_coverage: 0 },
        '15d': { saves: null, repins: null, saves_coverage: 0, repins_coverage: 0 },
        all: { saves: 50000, repins: 35000, saves_coverage: 10, repins_coverage: 10 }
      },
      competitor_audience_gains: { '24h': 1200, '7d': 8400, all: 900000, matched_creators_count: 15 }
    },
    all_pins: [pinMissing10d15d]
  };

  app.selectedTimeWindow = '10d';
  assert.equal(app.clusterWindowSavesGains, null, '10d saves must be null when no 10d history exists');
  assert.equal(app.clusterWindowRepinsGains, null, '10d repins must be null when no 10d history exists');
  assert.equal(app.clusterCompetitorAudienceGains, null, 'competitor audience must be null on 10d (no fake d7/7*10)');

  app.selectedTimeWindow = '7d';
  assert.equal(app.clusterWindowSavesGains, 5200);
  assert.equal(app.clusterWindowRepinsGains, 4100);
  assert.equal(app.clusterCompetitorAudienceGains, 8400);

  // Verify Vacuum & Breakout filters on client
  app.onlyVacuumPins = true;
  app.onlyBreakoutBabyDomains = false;
  assert.equal(app.filteredPinsList().length, 1);
  app.onlyVacuumPins = false;
  app.onlyBreakoutBabyDomains = true;
  assert.equal(app.filteredPinsList().length, 0);
});

test('Phase 1: syncCampaignTopNSerpPins deactivates stale search-tracked pins outside current top-N', async () => {
  const executedSql = [];
  const mockSql = async (strings, ...values) => {
    const query = strings.join('?');
    executedSql.push({ query, values });
    if (query.includes('FROM keyword_folders')) {
      return [{ id: 5, workspace_id: 1, name: 'high protein' }];
    }
    if (query.includes('FROM workspace_settings')) {
      return [{ top_n_search_pins: 20 }];
    }
    if (query.includes('FROM keyword_folder_items') && query.includes('keyword_serp_positions')) {
      return [{ pin_id: '111111' }, { pin_id: '222222' }];
    }
    if (query.includes('INSERT INTO campaign_tracked_pins')) {
      return [{ pin_id: '111111' }, { pin_id: '222222' }];
    }
    if (query.includes('UPDATE campaign_tracked_pins') && query.includes('SET is_active = FALSE')) {
      return [{ pin_id: '999999' }];
    }
    return [];
  };

  const res = await syncCampaignTopNSerpPins(mockSql, { folderId: 5, workspaceId: 1, topN: 20 });
  assert.equal(res.synced, 2);
  assert.equal(res.deactivated, 1);
  const deactivateQuery = executedSql.find(q => q.query.includes('UPDATE campaign_tracked_pins') && q.query.includes('is_active = FALSE'));
  assert.ok(deactivateQuery, 'must execute UPDATE to deactivate stale search-tracked pins');
});

test('Phase 1: Scoped Rooms 2, 3, and 4 hide redundant inner Folder filter dropdowns', () => {
  const creatorsHtml = getDashboardHtml('5');
  assert.ok(
    creatorsHtml.includes('<template x-if="!scopedFolderId">') &&
    creatorsHtml.includes('x-model="folderFilter"'),
    'Room 3 (Creator Hub) must guard inner folderFilter select behind !scopedFolderId'
  );

  const keywordsHtml = getKeywordsPageHtml('', '', '5');
  assert.ok(
    keywordsHtml.includes('<template x-if="!activeFolderId">') &&
    keywordsHtml.includes('x-model="dashboardFolderFilter"'),
    'Room 2 (Keywords Fleet) must guard inner dashboardFolderFilter select behind !activeFolderId'
  );

  const domainsHtml = getDomainsPageHtml('', '5');
  assert.ok(
    domainsHtml.includes('<template x-if="!scopedFolderId">') &&
    domainsHtml.includes('x-model="selectedFolderId"'),
    'Room 4 (Domain Studio) must guard inner selectedFolderId select behind !scopedFolderId'
  );
});

test('Phase 1 & 3: Migration 013 exists and rapid calculateFolderCrossover refresh returns cooldown_cached flag', async () => {
  const migPath = path.join(process.cwd(), 'scripts', 'migrations', '013_campaign_room1_first_seen_and_indexes.sql');
  assert.ok(fs.existsSync(migPath), 'migration 013 SQL file must exist');
  const migSql = fs.readFileSync(migPath, 'utf8');
  assert.ok(migSql.includes('first_seen_at'), 'migration 013 must add first_seen_at');
  assert.ok(migSql.includes('idx_pdm_pin_date'), 'migration 013 must create idx_pdm_pin_date');

  // Verify cooldown_cached behavior on rapid force-refresh
  const fid = 99905;
  invalidateFolderCache(fid);
  folderForceRefreshCooldown.delete(`refresh:all:${fid}`);

  const mockSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('FROM keyword_folders')) {
      return [{ id: fid, name: 'Cooldown Test', description: '', color: '#ec4899', icon: 'folder', created_at: new Date().toISOString() }];
    }
    if (q.includes('FROM keyword_folder_items i') && q.includes('JOIN tracked_keywords')) {
      return [];
    }
    return [];
  };

  const first = await calculateFolderCrossover(mockSql, fid, { refresh: true });
  assert.ok(first && first.folder.id === fid);
  assert.equal(Boolean(first.cooldown_cached), false);

  const second = await calculateFolderCrossover(mockSql, fid, { refresh: true });
  assert.equal(second.cooldown_cached, true, 'rapid second ?refresh=true must return cooldown_cached: true');

  invalidateFolderCache(fid);
  folderForceRefreshCooldown.delete(`refresh:all:${fid}`);
});

test('Audit P0: Migration 014 repairs first_seen_at & drops duplicate idx_pdm_pin_date without modifying Migration 013 checksum', () => {
  const mig013Path = path.join(process.cwd(), 'scripts', 'migrations', '013_campaign_room1_first_seen_and_indexes.sql');
  const mig013Hash = crypto.createHash('sha256').update(fs.readFileSync(mig013Path, 'utf8')).digest('hex');
  assert.ok(mig013Hash.startsWith('452ef90c6f7b'), `Migration 013 checksum must remain locked (got ${mig013Hash.slice(0, 12)})`);

  const mig014Path = path.join(process.cwd(), 'scripts', 'migrations', '014_room1_first_seen_repair_and_drop_dup_index.sql');
  assert.ok(fs.existsSync(mig014Path), 'Migration 014 SQL file must exist');
  const mig014Sql = fs.readFileSync(mig014Path, 'utf8');
  const statements = splitSqlStatements(mig014Sql);
  assert.equal(statements.length, 2, 'Migration 014 must parse cleanly into 2 statements');
  assert.ok(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+public\.idx_pdm_pin_date/i.test(statements[0]), 'Statement 1 must drop duplicate idx_pdm_pin_date concurrently');
  assert.ok(statements[1].includes('pins_daily_metrics') && statements[1].includes('first_discovered_at') && statements[1].includes('UPDATE public.keyword_serp_positions'), 'Statement 2 must restore historical first_seen_at from pins_daily_metrics & universal_master_pins');
});

test('Audit P1: buildFolderCrossoverMatrix preserves rankless Newborn Vault pins and honors zero super_pins_count fallback semantics', async () => {
  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

  const folderKeywords = [
    { keyword_id: 201, keyword: 'high protein', slug: 'high-protein', category: 'Food', status: 'ACTIVE', created_at: daysAgo(30), added_at: daysAgo(20) },
    { keyword_id: 202, keyword: 'meal prep', slug: 'meal-prep', category: 'Food', status: 'ACTIVE', created_at: daysAgo(30), added_at: daysAgo(20) }
  ];

  // Zero super pins (each pin ranks in only 1 keyword), plus one rankless Newborn Vault pin & one imageless linkless pin
  const pinRows = [
    {
      pin_id: '300001',
      title: 'Newborn Vault Pin Without Rank',
      description: 'Promoted from Newborn Hunter into Vault with NULL rank_position',
      image_url: 'https://i.pinimg.com/nb1.jpg',
      destination_url: 'https://cleanblog.example.com/nb',
      domain: 'cleanblog.example.com',
      save_count: 350,
      repin_count: 100,
      comment_count: 1,
      daily_save_velocity: 18,
      delta_saves_24h: 18,
      delta_repins_24h: 6,
      gains_5d: 80,
      gains_7d: 120,
      gains_10d: null,
      gains_15d: null,
      dominant_color: '#FFFFFF',
      visual_annotations: ['High Protein'],
      creator_username: 'nbcreator',
      creator_name: 'NB Creator',
      created_at_pinterest: daysAgo(12),
      pin_first_seen_at: daysAgo(8),
      rankings: [
        { keyword_id: 201, keyword: 'high protein', rank_position: null, is_vault: true, added_at: daysAgo(20) }
      ]
    },
    {
      pin_id: '300002',
      title: 'Imageless Linkless Pin',
      description: 'No image_url should NOT be counted as vacuum pin',
      image_url: '',
      destination_url: '',
      domain: 'uploaded by user',
      save_count: 900,
      repin_count: 400,
      comment_count: 0,
      daily_save_velocity: 10,
      delta_saves_24h: 10,
      delta_repins_24h: 4,
      gains_5d: 40,
      gains_7d: 60,
      gains_10d: null,
      gains_15d: null,
      dominant_color: '#000000',
      visual_annotations: ['Meal Prep'],
      creator_username: 'noimg',
      creator_name: 'No Img',
      created_at_pinterest: daysAgo(30),
      pin_first_seen_at: daysAgo(10),
      rankings: [
        { keyword_id: 202, keyword: 'meal prep', rank_position: 5, is_vault: false, added_at: daysAgo(20) }
      ]
    }
  ];

  const mockSql = async () => [];
  const result = await buildFolderCrossoverMatrix({
    sql: mockSql,
    folder: { id: 6, name: 'single-rank cluster', description: '', color: '#ec4899', icon: 'folder', created_at: daysAgo(30) },
    folderKeywords,
    totalKeywords: folderKeywords.length,
    pinRows,
    displacedRows: [],
    capsuleRows: [],
    repinWindowRows: [],
    pulseAnalyticsPromise: Promise.resolve({ trendsLoaded: 0, trendsResults: [] })
  });

  // Rankless Vault pin must be preserved
  const nbPin = result.all_pins.find(p => p.pin_id === '300001');
  assert.ok(nbPin, 'Rankless displaced Vault pin must be preserved in all_pins');
  assert.equal(nbPin.has_vault_rank, true);
  assert.equal(nbPin.has_active_rank, false);
  assert.equal(nbPin.min_rank, null);
  assert.equal(nbPin.rankings[0].rank_position, null);
  assert.equal(result.summary.vault_pins_count, 1);

  // Imageless linkless pin must NOT be vacuum
  const noImgPin = result.all_pins.find(p => p.pin_id === '300002');
  assert.equal(noImgPin.is_vacuum_pin, false);
  assert.equal(result.summary.vacuum_pins_count, 0);

  // When super_pins_count is 0, fallback super_pins still has topRankedPins, so client MUST honor summary.super_pins_count (0) and return [] in super_only scope
  assert.equal(result.summary.super_pins_count, 0);
  assert.ok(result.super_pins.length > 0, 'legacy fallback super_pins populates topRankedPins when 0 true super-pins');

  const { app, html } = instantiateFoldersApp('6');
  assert.ok(html.includes('crossoverData?.summary?.super_pins_count ??'), 'Super-Pins Scope button must use ?? not ||');
  assert.ok(html.includes('x-show="rk.rank_position != null"'), 'Rank badge must hide #null for rankless Vault pins');
  assert.ok(html.includes("selectedTimeWindow === 'all' ? 'Total Saves (All-Time)'"), 'All-time rollup label must not say Saves Gains');
  assert.ok(html.includes('Cluster gross saves gain'), 'Rollup subtitle must accurately say gross saves gain');

  app.crossoverData = result;
  app.scopeFilter = 'super_only';
  assert.equal(app.filteredPinsList().length, 0, 'super_only scope must return 0 when no pin has overlap_count >= 2');

  // Client Vacuum & Breakout fallback parity edge cases + pin_id search
  app.scopeFilter = 'all';
  app.crossoverData = {
    summary: { super_pins_count: 0 },
    all_pins: [
      { pin_id: '777888999', title: 'Alpha', domain: 'uploaded by user', image_url: '', save_count: 500, is_vacuum_pin: false },
      { pin_id: '777889000', title: 'Beta', domain: 'uploaded by user', image_url: '', save_count: 500 }, // missing boolean -> fallback must require image_url
      { pin_id: '777889001', title: 'Gamma', domain: 'baby.example.com', image_url: 'https://i.pinimg.com/g.jpg', save_count: 200, domain_age_days: 0, domain_age_years: 0.01, gains_7d: 50 } // 0 days must NOT fall back to domain_age_years * 365
    ]
  };

  app.onlyVacuumPins = true;
  assert.equal(app.filteredPinsList().length, 0, 'Client Vacuum filter must require image_url parity and respect boolean false');
  app.onlyVacuumPins = false;

  app.onlyBreakoutBabyDomains = true;
  assert.equal(app.filteredPinsList().length, 0, 'Client Breakout filter must not treat domain_age_days=0 as falsy and fall back to domain_age_years');
  app.onlyBreakoutBabyDomains = false;

  app.searchQuery = '777888999';
  assert.equal(app.filteredPinsList().length, 1, 'Search query must match pin_id for resolved pin.it shortlinks');
  assert.equal(app.filteredPinsList()[0].pin_id, '777888999');
});

test('Audit P1: Header Refresh calls loadActiveFolder(true) which refreshes metadata & crossover with ?refresh=true and shows cooldown toast', async () => {
  const { app, html } = instantiateFoldersApp('5');
  assert.ok(html.includes("typeof loadActiveFolder === 'function' ? loadActiveFolder(true)"), 'Header Refresh must call loadActiveFolder(true) in Room 1/5');

  const fetchedUrls = [];
  const toasts = [];
  app.showToast = (msg, type) => toasts.push({ msg, type });
  app.loadTrackedPinsSummary = async () => {};
  app.loadPinGraphSeeds = async () => {};

  // Inject mock fetch into app's global window via safeApiFetch isn't directly on app; test via globalThis/window override inside fresh sandbox
  const scriptHtml = getFoldersClientAppScript();
  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/i);
  const sandbox = {
    window: {
      location: { pathname: '/folders/5', search: '', href: 'http://localhost:3000/folders/5' },
      history: { pushState: () => {}, replaceState: () => {} },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      safeApiFetch: async (url) => {
        fetchedUrls.push(url);
        if (url.includes('/raw-visual-crossover')) {
          return {
            ok: true,
            json: async () => ({
              crossover: {
                folder: { id: 5, name: 'high protein' },
                summary: { total_unique_pins: 1, super_pins_count: 0 },
                all_pins: [],
                super_pins: [],
                cooldown_cached: true
              },
              cooldown_cached: true
            })
          };
        }
        return {
          ok: true,
          json: async () => ({ folder: { id: 5, name: 'high protein', domain_count: 10, items: [] } })
        };
      }
    },
    document: { documentElement: { classList: { toggle: () => {} } }, cookie: '' },
    URLSearchParams,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  const liveApp = sandbox.foldersApp('5');
  liveApp.showToast = (msg, type) => toasts.push({ msg, type });
  liveApp.loadTrackedPinsSummary = async () => {};
  liveApp.loadPinGraphSeeds = async () => {};

  await liveApp.loadActiveFolder(true);
  assert.ok(fetchedUrls.includes('/api/folders/5?refresh=true'), 'must refresh /api/folders/:id?refresh=true');
  assert.ok(fetchedUrls.includes('/api/folders/5/raw-visual-crossover?refresh=true'), 'must refresh /raw-visual-crossover?refresh=true');
  assert.ok(toasts.some(t => t.msg.includes('15s refresh cooldown')), 'must display cooldown toast when cooldown_cached is true');

  // Settings room must skip crossover fetch and show settings toast
  fetchedUrls.length = 0;
  toasts.length = 0;
  liveApp.currentRoom = 'settings';
  await liveApp.loadActiveFolder(true);
  assert.ok(fetchedUrls.includes('/api/folders/5?refresh=true'));
  assert.equal(fetchedUrls.some(u => u.includes('/raw-visual-crossover')), false, 'settings room must bypass crossover fetch');
  assert.ok(toasts.some(t => t.msg.includes('Folder settings refreshed')));
});

test('Audit P1: 42703 first_seen_at fallback paths work in calculateFolderCrossover & getPruningCandidates, and syncCampaignTopNSerpPins handles empty pinIds', async () => {
  const fid = 99908;
  invalidateFolderCache(fid);
  folderForceRefreshCooldown.delete(`refresh:all:${fid}`);

  let firstSeenErrorThrownInCrossover = false;
  const crossoverFallbackSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('c.first_seen_at')) {
      firstSeenErrorThrownInCrossover = true;
      const err = new Error('column c.first_seen_at does not exist');
      err.code = '42703';
      throw err;
    }
    if (q.includes('FROM keyword_folders')) {
      return [{ id: fid, name: 'Fallback Test', description: '', color: '#ec4899', icon: 'folder', created_at: new Date().toISOString() }];
    }
    if (q.includes('FROM keyword_folder_items i') && q.includes('JOIN tracked_keywords') && !q.includes('keyword_serp_positions')) {
      return [{ keyword_id: 501, keyword: 'protein', slug: 'protein', category: 'Food', status: 'ACTIVE', created_at: new Date().toISOString(), added_at: new Date().toISOString() }];
    }
    return [];
  };

  const crossRes = await calculateFolderCrossover(crossoverFallbackSql, fid, { refresh: true });
  assert.equal(firstSeenErrorThrownInCrossover, true, 'must attempt first_seen_at query first');
  assert.ok(crossRes && crossRes.folder.id === fid, 'calculateFolderCrossover must recover via 42703 fallback');
  invalidateFolderCache(fid);
  folderForceRefreshCooldown.delete(`refresh:all:${fid}`);

  let firstSeenErrorThrownInPruning = false;
  const pruningFallbackSql = async (strings) => {
    const q = strings.join(' ');
    if (q.includes('ksp.first_seen_at')) {
      firstSeenErrorThrownInPruning = true;
      const err = new Error('column ksp.first_seen_at does not exist');
      err.code = '42703';
      throw err;
    }
    return [{ keyword_id: 501, pin_id: '888', title: 'Old Pin', save_count: 5, repin_count: 1, daily_save_velocity: 0, is_displaced: true, created_at_pinterest: null, keyword: 'protein', folder_added_at: new Date().toISOString() }];
  };
  const candidates = await getPruningCandidates(pruningFallbackSql, fid, { minFolderAgeDays: 14 });
  assert.equal(firstSeenErrorThrownInPruning, true, 'getPruningCandidates must attempt first_seen_at query first');
  assert.equal(candidates.length, 1, 'getPruningCandidates must recover via 42703 fallback');

  // Empty Top-N deactivation branch in syncCampaignTopNSerpPins
  const executed = [];
  const emptyTopNSql = async (strings, ...values) => {
    const query = strings.join('?');
    executed.push({ query, values });
    if (query.includes('FROM keyword_folders')) return [{ id: 5, workspace_id: 1, name: 'empty' }];
    if (query.includes('FROM workspace_settings')) return [{ top_n_search_pins: 20 }];
    if (query.includes('FROM keyword_folder_items') && query.includes('keyword_serp_positions')) return [];
    if (query.includes('UPDATE campaign_tracked_pins') && query.includes('SET is_active = FALSE')) return [{ pin_id: 'old1' }, { pin_id: 'old2' }];
    return [];
  };
  const emptyRes = await syncCampaignTopNSerpPins(emptyTopNSql, { folderId: 5, workspaceId: 1, topN: 20 });
  assert.equal(emptyRes.synced, 0);
  assert.equal(emptyRes.deactivated, 2, 'empty top-N must deactivate all previously active search-tracked pins');
  assert.ok(executed.some(e => e.query.includes('UPDATE campaign_tracked_pins') && !e.query.includes('NOT (pin_id = ANY')));
});

test('Audit P1 & P2: folders-crud normalizes www/pinterest/pinimg domains, Room 2 avoids dead-click, Room 4 uses 6-col scoped grid', async () => {
  const crudQueries = [];
  const mockCrudSql = async (strings) => {
    const q = strings.join(' ');
    crudQueries.push(q);
    if (q.includes('WHERE id =') && q.includes('FROM keyword_folders')) {
      return [{ id: 5, name: 'high protein', items: [], workspace_id: 1 }];
    }
    return [];
  };

  await listFolders(mockCrudSql, { workspaceId: 1 });
  await getFolder(mockCrudSql, 5, { workspaceId: 1 });

  const normalizedDomainQueries = crudQueries.filter(q =>
    q.includes("REGEXP_REPLACE(LOWER(TRIM(COALESCE(ump.clean_domain, ''))), '^www\\.', '')") &&
    q.includes("pinterest\\.[a-z.]+$") &&
    q.includes("pinimg\\.com$")
  );
  assert.ok(normalizedDomainQueries.length >= 2, 'Both listFolders and getFolder must normalize www. and exclude pinterest.*/pinimg.com subdomains');

  const keywordsHtml = getKeywordsPageHtml('', '', '5');
  assert.ok(
    keywordsHtml.includes("activeFolderId ? (String(f.id) !== String(activeFolderId) ? (window.location.href = '/folders/' + encodeURIComponent(f.id) + '/keywords') : null) : filterByFolder(f.id)"),
    'Room 2 folder badges must navigate cleanly in scoped mode instead of dead-clicking filterByFolder'
  );

  const domainsHtml = getDomainsPageHtml('', '5');
  assert.ok(
    domainsHtml.includes(":class=\"scopedFolderId ? 'lg:grid-cols-6' : 'lg:grid-cols-7'\""),
    'Room 4 filter bar must switch to lg:grid-cols-6 when scopedFolderId hides the inner folder select'
  );
});

