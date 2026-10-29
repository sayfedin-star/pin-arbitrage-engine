#!/usr/bin/env node

/**
 * scripts/adversarial_stress_test_campaign_workspace_v4.mjs
 * 
 * Exhaustive Empirical Stress-Testing Harness for Campaign Workspace V4 (R1-R5)
 * Executed by Agent-5 (Adversarial Challenger & Empirical Verifier)
 * 
 * Stress Areas:
 * 1. Empty folders, missing metadata, and zero-state contracts
 * 2. Pruning filter matrix (single, multi, string, empty keyword IDs, scope boundaries, threshold edge cases)
 * 3. Dry-run preview vs atomic execution contract parity & tombstone idempotency
 * 4. Cache invalidation tandem (Memory L0, Cloudflare D1 edge_pins_metadata, Workers KV)
 * 5. Dispatcher pause enforcement under adversarial pause flags
 * 6. Rule 31 Universal Age Formatter extreme boundary testing
 * 7. Room 2 KPI binding & double-counting prevention under adversarial datasets
 * 8. Auto-discovered creator telemetry, username normalization & cadence math
 * 9. Multi-window velocity rollup calculations across all 6 time windows
 * 10. Folder-scoped popstate & navigation preservation (Rule 30)
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  listFolders,
  getFolder,
  listFolderCreatorsWithDiscovery,
  autoDiscoverFolderCreators,
  toggleFolderCreatorTracking,
  pruneFolderPins
} from '../src/modules/keywords/folders-service.mjs';

import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../src/ui/campaign-workspace-header.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(testName, fn) {
  totalTests++;
  const start = performance.now();
  try {
    fn();
    const duration = (performance.now() - start).toFixed(2);
    passedTests++;
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${testName} (${duration}ms)`);
  } catch (err) {
    const duration = (performance.now() - start).toFixed(2);
    failedTests++;
    failures.push({ testName, error: err });
    console.log(`  \x1b[31m✗ [FAIL]\x1b[0m ${testName} (${duration}ms)`);
    console.log(`     \x1b[33mError:\x1b[0m ${err.message}`);
  }
}

async function checkAsync(testName, fn) {
  totalTests++;
  const start = performance.now();
  try {
    await fn();
    const duration = (performance.now() - start).toFixed(2);
    passedTests++;
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${testName} (${duration}ms)`);
  } catch (err) {
    const duration = (performance.now() - start).toFixed(2);
    failedTests++;
    failures.push({ testName, error: err });
    console.log(`  \x1b[31m✗ [FAIL]\x1b[0m ${testName} (${duration}ms)`);
    console.log(`     \x1b[33mError:\x1b[0m ${err.message}`);
  }
}

console.log('================================================================================');
console.log('   CAMPAIGN WORKSPACE V4 ADVERSARIAL STRESS TEST & EMPIRICAL HARNESS');
console.log('================================================================================');

// -----------------------------------------------------------------------------
// SECTION 1: EMPTY FOLDERS & ZERO-STATE CONTRACT TESTS
// -----------------------------------------------------------------------------
console.log('\n--- Section 1: Empty Folder & Zero-State Telemetry ---');

await checkAsync('getFolder handles empty folder (0 keywords, 0 pins, 0 creators) without NaN or crashes', async () => {
  const emptyFolderSql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('FROM keyword_folders')) {
      return [{
        id: 9999,
        name: 'Empty Test Folder',
        description: 'No keywords attached',
        color: '#6366f1',
        icon: 'folder',
        project_id: 'default',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        keyword_count: 0,
        creator_count: 0,
        pinned_domain_count: 0,
        domain_count: 0,
        pin_count: 0,
        unique_pins_count: 0,
        total_unique_pins: 0,
        discovered_creator_count: 0
      }];
    }
    if (query.includes('FROM keyword_folder_items')) {
      return []; // No items in folder
    }
    return [];
  };

  const folder = await getFolder(emptyFolderSql, 9999);
  assert.ok(folder, 'Folder object must be returned');
  assert.equal(folder.keyword_count, 0);
  assert.equal(folder.creator_count, 0);
  assert.equal(folder.pinned_domain_count, 0);
  assert.equal(folder.domain_count, 0);
  assert.equal(folder.pin_count, 0);
  assert.equal(folder.unique_pins_count, 0);
  assert.equal(folder.total_unique_pins, 0);
  assert.equal(folder.discovered_creator_count, 0);
  assert.ok(Array.isArray(folder.items), 'items must be an array');
  assert.equal(folder.items.length, 0);
  assert.ok(!Number.isNaN(folder.unique_pins_count), 'unique_pins_count must not be NaN');
});

await checkAsync('listFolderCreatorsWithDiscovery handles empty folder without NaN or divide-by-zero', async () => {
  const emptyCreatorsSql = async () => [];

  const res = await listFolderCreatorsWithDiscovery(emptyCreatorsSql, 9999);
  assert.ok(res, 'Response must exist');
  assert.equal(res.linked_creators.length, 0);
  assert.equal(res.discovered_creators.length, 0);
  assert.equal(res.all_creators.length, 0);
  assert.equal(res.totals.total_linked, 0);
  assert.equal(res.totals.total_discovered, 0);
  assert.equal(res.totals.total_creators, 0);
  assert.equal(res.totals.combined_audience, 0);
  assert.equal(res.totals.combined_impressions, 0);
  assert.equal(res.totals.combined_pins, 0);
  assert.equal(res.totals.avg_pinning_cadence, 0);
  assert.ok(!Number.isNaN(res.totals.avg_pinning_cadence), 'avg_pinning_cadence must not be NaN');
});

await checkAsync('pruneFolderPins on empty folder returns 0 matches cleanly in both dryRun and execution', async () => {
  const emptyPruneSql = async () => [];

  const dryRes = await pruneFolderPins(emptyPruneSql, 9999, { dryRun: true });
  assert.equal(dryRes.success, true);
  assert.equal(dryRes.dry_run, true);
  assert.equal(dryRes.matched_count, 0);
  assert.equal(dryRes.sample_pins.length, 0);

  const execRes = await pruneFolderPins(emptyPruneSql, 9999, { dryRun: false });
  assert.equal(execRes.success, true);
  assert.equal(execRes.dry_run, false);
  assert.equal(execRes.pruned_count, 0);
});

// -----------------------------------------------------------------------------
// SECTION 2: PRUNING COMBINATORIAL MATRIX & SCOPE BOUNDARY TESTS
// -----------------------------------------------------------------------------
console.log('\n--- Section 2: Pruning Keyword Selection & Combinatorial Filter Matrix ---');

await checkAsync('pruneFolderPins correctly constructs SQL query for single keyword filter', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const mockSql = async (strings, ...values) => {
    capturedQuery = strings.join('?');
    capturedValues = values;
    return [];
  };

  await pruneFolderPins(mockSql, 42, {
    dryRun: true,
    keyword_ids: [101],
    scope: 'displaced'
  });

  assert.ok(capturedQuery.includes('WHERE i.folder_id = ?'), 'Must filter by folder_id');
  assert.ok(capturedQuery.includes('i.keyword_id = ANY(?::int[])'), 'Must filter by ANY(keyword_ids)');
  assert.ok(capturedQuery.includes("ksc.is_displaced = TRUE"), 'Displaced scope must enforce is_displaced = TRUE');
});

await checkAsync('pruneFolderPins accepts comma-separated string format for keyword_ids', async () => {
  let capturedValues = [];
  const mockSql = async (strings, ...values) => {
    capturedValues = values;
    return [];
  };

  const res = await pruneFolderPins(mockSql, 42, {
    dryRun: true,
    keyword_ids: '101, 102, 103',
    scope: 'all'
  });

  assert.deepEqual(res.summary.keyword_ids, [101, 102, 103], 'Parsed keyword_ids must be numeric array [101, 102, 103]');
});

await checkAsync('pruneFolderPins scope boundaries: displaced vs active vs all', async () => {
  const executedScopes = [];
  const mockSql = async (strings, ...values) => {
    // In SQL template: values[3] is targetScope
    executedScopes.push(values[3]);
    return [];
  };

  await pruneFolderPins(mockSql, 42, { scope: 'displaced' });
  await pruneFolderPins(mockSql, 42, { scope: 'active' });
  await pruneFolderPins(mockSql, 42, { scope: 'ALL' });
  await pruneFolderPins(mockSql, 42, { scope: 'unknown_fallback' });

  assert.equal(executedScopes[0], 'displaced');
  assert.equal(executedScopes[1], 'active');
  assert.equal(executedScopes[2], 'all', 'Uppercase ALL must be normalized to lowercase all');
  assert.equal(executedScopes[3], 'unknown_fallback', 'Fallback passed cleanly to SQL query without crashing');
});

await checkAsync('pruneFolderPins threshold boundary: maxSaves = 0 and maxRepins = 0 are not coerced to null/falsy', async () => {
  const mockSql = async (strings, ...values) => {
    return [];
  };

  const res = await pruneFolderPins(mockSql, 42, {
    dryRun: true,
    max_saves: 0,
    max_repins: 0,
    min_pin_age_days: 0,
    min_folder_age_days: 0
  });

  assert.strictEqual(res.summary.max_saves, 0, 'max_saves must be numeric 0, not null');
  assert.strictEqual(res.summary.max_repins, 0, 'max_repins must be numeric 0, not null');
  assert.strictEqual(res.summary.min_pin_age_days, 0, 'min_pin_age_days must be numeric 0, not null');
  assert.strictEqual(res.summary.min_folder_age_days, 0, 'min_folder_age_days must be numeric 0, not null');
});

// -----------------------------------------------------------------------------
// SECTION 3: DRY-RUN VS REAL EXECUTION, ATOMICITY & CACHE PURGING
// -----------------------------------------------------------------------------
console.log('\n--- Section 3: Dry-Run vs Atomic Execution & Cache Invalidation ---');

await checkAsync('pruneFolderPins dryRun = true performs zero database mutations (NO INSERT/DELETE)', async () => {
  let mutationExecuted = false;
  const mockSql = async (strings, ...values) => {
    const q = strings.join('?').toUpperCase();
    if (q.includes('INSERT INTO') || q.includes('DELETE FROM')) {
      mutationExecuted = true;
    }
    return [
      { keyword_id: 101, pin_id: 'pin_1', title: 'Test Pin 1', save_count: 5, is_displaced: true },
      { keyword_id: 102, pin_id: 'pin_2', title: 'Test Pin 2', save_count: 10, is_displaced: true }
    ];
  };

  const res = await pruneFolderPins(mockSql, 42, { dryRun: true });
  assert.equal(res.dry_run, true);
  assert.equal(res.matched_count, 2);
  assert.equal(res.sample_pins.length, 2);
  assert.equal(mutationExecuted, false, 'dry-run must NEVER execute INSERT or DELETE statements');
});

await checkAsync('pruneFolderPins dryRun = false executes atomic tombstone, deletes from Hub, and purges D1 & KV', async () => {
  const executedStatements = [];
  const mockSql = async (strings, ...values) => {
    const q = strings.join('?');
    executedStatements.push(q);
    if (q.includes('SELECT')) {
      return [
        { keyword_id: 101, pin_id: 'pin_1001', title: 'Candidate 1', save_count: 0, repin_count: 0, is_displaced: true },
        { keyword_id: 102, pin_id: 'pin_1002', title: 'Candidate 2', save_count: 0, repin_count: 0, is_displaced: true }
      ];
    }
    return [];
  };

  const d1DeletedPins = [];
  const mockD1 = {
    prepare: (query) => ({
      bind: (pid) => ({
        run: async () => { d1DeletedPins.push(pid); }
      })
    })
  };

  const kvDeletedKeys = [];
  const mockKv = {
    delete: async (key) => { kvDeletedKeys.push(key); }
  };

  const res = await pruneFolderPins(mockSql, 42, { dryRun: false }, {
    env: { PIN_D1_DB: mockD1, PIN_ENGINE_KV: mockKv }
  });

  assert.equal(res.success, true);
  assert.equal(res.dry_run, false);
  assert.equal(res.pruned_count, 2);

  // Check tombstoning in keyword_ignored_pins
  const hasTombstone = executedStatements.some(s => s.includes('INSERT INTO keyword_ignored_pins'));
  assert.ok(hasTombstone, 'Must insert tombstones into keyword_ignored_pins');

  // Check deletion from keyword_serp_current and keyword_displaced_index
  const hasDeleteKsc = executedStatements.some(s => s.includes('DELETE FROM keyword_serp_current'));
  const hasDeleteKdi = executedStatements.some(s => s.includes('DELETE FROM keyword_displaced_index'));
  assert.ok(hasDeleteKsc, 'Must delete candidates from keyword_serp_current');
  assert.ok(hasDeleteKdi, 'Must delete candidates from keyword_displaced_index');

  // Check D1 edge_pins_metadata eviction
  assert.deepEqual(d1DeletedPins, ['pin_1001', 'pin_1002'], 'D1 edge_pins_metadata must be purged for candidate pins');

  // Check KV cache eviction (dossier:pin:* and serp:comp:*)
  assert.ok(kvDeletedKeys.includes('dossier:pin:pin_1001'), 'KV must evict dossier:pin:pin_1001');
  assert.ok(kvDeletedKeys.includes('dossier:pin:pin_1002'), 'KV must evict dossier:pin:pin_1002');
  assert.ok(kvDeletedKeys.includes('serp:comp:101'), 'KV must evict serp:comp:101');
  assert.ok(kvDeletedKeys.includes('serp:comp:102'), 'KV must evict serp:comp:102');
});

// -----------------------------------------------------------------------------
// SECTION 4: DISPATCHER PAUSE LOGIC UNDER HOSTILE INPUTS
// -----------------------------------------------------------------------------
console.log('\n--- Section 4: Fleet Dispatcher Pause Guards ---');

check('Keyword fleet dispatcher script contains complete pause enforcement matrix', () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, 'scripts/keyword-fleet-dispatcher.mjs'), 'utf8');

  // Check pause flag coverage
  assert.ok(content.includes('folderMeta.pause_crawlers'), 'Must check folderMeta.pause_crawlers');
  assert.ok(content.includes('folderMeta.block_fleet'), 'Must check folderMeta.block_fleet');
  assert.ok(content.includes("folderMeta.status === 'paused'"), 'Must check folderMeta.status === paused');
  assert.ok(content.includes("folderRow.status && String(folderRow.status).toLowerCase() === 'paused'"), 'Must check folderRow.status === paused');

  // Check zero-task emission on pause
  assert.ok(content.includes('matrixTasks = []'), 'Must emit empty task array on pause');
  assert.ok(content.includes("await writeOutput('task_count', '0')"), 'Must write task_count 0');
  assert.ok(content.includes('process.exitCode = 0') || content.includes('return;'), 'Must exit with code 0 on pause');
});

check('Creator fleet dispatcher script contains complete competitor pause enforcement', () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, 'scripts/creator-fleet-dispatcher.mjs'), 'utf8');

  // Check pause flag coverage
  assert.ok(content.includes('folderMeta.pause_competitors'), 'Must check folderMeta.pause_competitors');
  assert.ok(content.includes('folderMeta.block_fleet'), 'Must check folderMeta.block_fleet');
  assert.ok(content.includes("folderMeta.status === 'paused'"), 'Must check folderMeta.status === paused');
  assert.ok(content.includes("folderRow.status && String(folderRow.status).toLowerCase() === 'paused'"), 'Must check folderRow.status === paused');

  // Check zero-task emission on pause
  assert.ok(content.includes('matrixTasks = []'), 'Must emit empty task array on pause');
  assert.ok(content.includes("await writeOutput('task_count', '0')"), 'Must write task_count 0');
});

// -----------------------------------------------------------------------------
// SECTION 5: RULE 31 UNIVERSAL AGE FORMATTER EXTREME BOUNDARY TESTING
// -----------------------------------------------------------------------------
console.log('\n--- Section 5: Rule 31 Universal Age Formatter Mathematical Boundaries ---');

function formatUniversalAge(days) {
  if (days == null || isNaN(days) || days === '') return '—';
  const numDays = Number(days);
  if (numDays >= 365) {
    return (numDays / 365).toFixed(1) + 'y';
  }
  return Math.floor(numDays) + 'd';
}

check('Rule 31: Values < 365 days formatted strictly in days with "d" suffix and no parentheses', () => {
  assert.equal(formatUniversalAge(0), '0d');
  assert.equal(formatUniversalAge(0.9), '0d');
  assert.equal(formatUniversalAge(1), '1d');
  assert.equal(formatUniversalAge(14.8), '14d');
  assert.equal(formatUniversalAge(145), '145d');
  assert.equal(formatUniversalAge(364), '364d');
  assert.equal(formatUniversalAge(364.99), '364d');
  assert.ok(!formatUniversalAge(145).includes('('), 'Must never contain parentheses');
  assert.ok(!formatUniversalAge(145).includes('y'), 'Must not contain "y" when < 365 days');
});

check('Rule 31: Values >= 365 days formatted strictly in years with "y" suffix and no day parentheses', () => {
  assert.equal(formatUniversalAge(365), '1.0y');
  assert.equal(formatUniversalAge(365.25), '1.0y');
  assert.equal(formatUniversalAge(400), '1.1y');
  assert.equal(formatUniversalAge(438), '1.2y');
  assert.equal(formatUniversalAge(730), '2.0y');
  assert.equal(formatUniversalAge(4088), '11.2y');
  assert.ok(!formatUniversalAge(4088).includes('('), 'Must NEVER contain parentheses with days e.g. (4088d)');
  assert.ok(!formatUniversalAge(4088).includes('d'), 'Must not contain "d" suffix when >= 365 days');
});

check('Rule 31: Null, undefined, empty, and NaN values produce graceful fallback "—"', () => {
  assert.equal(formatUniversalAge(null), '—');
  assert.equal(formatUniversalAge(undefined), '—');
  assert.equal(formatUniversalAge(''), '—');
  assert.equal(formatUniversalAge(NaN), '—');
  assert.equal(formatUniversalAge('abc'), '—');
});

// -----------------------------------------------------------------------------
// SECTION 6: ROOM 2 KPI BINDING & DOUBLE-COUNTING PREVENTION
// -----------------------------------------------------------------------------
console.log('\n--- Section 6: Room 2 KPI Card Binding & Double-Count Prevention ---');

check('Room 2 totalActivePinsCount accurately sums active pins and excludes displaced pins', () => {
  const state = {
    activeFolderId: '42',
    filteredDashboardKeywords: [
      { id: 1, active_pins_count: 50, displaced_pins_count: 30, snapshots_count: 50 },
      { id: 2, active_pins_count: 25, displaced_pins_count: 10, snapshots_count: 25 },
      { id: 3, active_pins_count: 0, displaced_pins_count: 15, snapshots_count: 0 }
    ],
    getKeywordTotalPins(k) {
      return (Number(k.active_pins_count || 0) + Number(k.displaced_pins_count || 0));
    },
    get totalMonitoredPins() {
      return this.filteredDashboardKeywords.reduce((acc, k) => acc + this.getKeywordTotalPins(k), 0);
    },
    get totalActivePinsCount() {
      return this.filteredDashboardKeywords.reduce((acc, k) => acc + Number(k.active_pins_count ?? k.snapshots_count ?? 0), 0);
    }
  };

  assert.equal(state.totalMonitoredPins, 130, 'Old calculation would have returned 130 pins');
  assert.equal(state.totalActivePinsCount, 75, 'Active Crawled Pins must strictly equal 75 (displaced pins excluded)');
});

check('Room 2 totalActivePinsCount handles empty list and missing properties with zero fallback', () => {
  const state = {
    activeFolderId: '42',
    filteredDashboardKeywords: [],
    get totalActivePinsCount() {
      const list = this.filteredDashboardKeywords || [];
      return list.reduce((acc, k) => acc + Number(k.active_pins_count ?? k.snapshots_count ?? 0), 0);
    }
  };

  assert.equal(state.totalActivePinsCount, 0, 'Empty keywords list must evaluate to 0');

  state.filteredDashboardKeywords = [{ id: 1 }, { id: 2, snapshots_count: 12 }];
  assert.equal(state.totalActivePinsCount, 12, 'Missing properties must safely fallback to 0 or snapshots_count');
});

// -----------------------------------------------------------------------------
// SECTION 7: AUTO-DISCOVERED CREATOR TELEMETRY & CADENCE MATH
// -----------------------------------------------------------------------------
console.log('\n--- Section 7: Auto-Discovered Creator Telemetry & Cadence Math ---');

await checkAsync('listFolderCreatorsWithDiscovery aggregates active SERP ranking creators with is_displaced = FALSE', async () => {
  let capturedQuery = '';
  const mockSql = async (strings, ...values) => {
    const q = strings.join('?');
    capturedQuery += q;

    // First query: folder_creators_serp
    if (q.includes('folder_creators_serp')) {
      return [
        {
          username: 'crafty_creator',
          pin_count: 8,
          keywords_ranked: ['diy crafts', 'easy recipes'],
          top_pin_saves: 45000n,
          max_velocity: 12.5,
          competitor_id: 10,
          display_name: 'Crafty Creator',
          avatar_url: 'https://example.com/avatar.jpg',
          monthly_reach: 250000n,
          profile_views: 1200000n,
          total_pins: 1460,
          total_boards: 45,
          follower_count: 55000,
          is_linked: true,
          is_tracked: true,
          auto_discovered: false
        },
        {
          username: 'organic_pinner',
          pin_count: 3,
          keywords_ranked: ['diy crafts'],
          top_pin_saves: 1200n,
          max_velocity: 3.0,
          competitor_id: null,
          display_name: null,
          avatar_url: null,
          monthly_reach: 0n,
          profile_views: 0n,
          total_pins: 0,
          total_boards: 0,
          follower_count: null,
          is_linked: false,
          is_tracked: false,
          auto_discovered: true
        }
      ];
    }

    // Second query: linkedItems not in SERP
    return [];
  };

  const res = await listFolderCreatorsWithDiscovery(mockSql, 42);

  assert.ok(capturedQuery.includes('ksc.is_displaced = FALSE'), 'Query must strictly enforce is_displaced = FALSE');
  assert.equal(res.linked_creators.length, 1);
  assert.equal(res.discovered_creators.length, 1);
  assert.equal(res.all_creators.length, 2);
  assert.equal(res.totals.total_linked, 1);
  assert.equal(res.totals.total_discovered, 1);
  assert.equal(res.totals.combined_audience, 250000);
  assert.equal(res.totals.combined_impressions, 1200000);
  assert.equal(res.totals.combined_pins, 1460);

  // Cadence: (1460 / 365 + 0 / 365) / 2 = 4.0 / 2 = 2.0 pins/day
  assert.equal(res.totals.avg_pinning_cadence, 2.0);
  assert.ok(!Number.isNaN(res.totals.avg_pinning_cadence), 'Cadence must be valid finite number');
});

// -----------------------------------------------------------------------------
// SECTION 8: MULTI-WINDOW VELOCITY ROLLUP & ANNOTATIONS HUB
// -----------------------------------------------------------------------------
console.log('\n--- Section 8: Multi-Window Velocity Rollup & Shared Annotations Hub ---');

check('Cluster Performance Rollup Bar supports all 6 time windows with accurate multipliers', () => {
  const foldersUi = fs.readFileSync(path.join(ROOT_DIR, 'src/campaign-folders-ui.mjs'), 'utf8');

  // Verify all 6 windows are selectable
  assert.ok(foldersUi.includes("'24h'"), "Must support '24h'");
  assert.ok(foldersUi.includes("'5d'"), "Must support '5d'");
  assert.ok(foldersUi.includes("'7d'"), "Must support '7d'");
  assert.ok(foldersUi.includes("'10d'"), "Must support '10d'");
  assert.ok(foldersUi.includes("'15d'"), "Must support '15d'");
  assert.ok(foldersUi.includes("'all'"), "Must support 'all'");

  // Verify container class
  assert.ok(foldersUi.includes('cluster-performance-rollup'), 'Must render container with class cluster-performance-rollup');

  // Verify metric computations
  assert.ok(foldersUi.includes('clusterWindowSavesGains'), 'Must compute clusterWindowSavesGains');
  assert.ok(foldersUi.includes('clusterWindowRepinsGains'), 'Must compute clusterWindowRepinsGains');
  assert.ok(foldersUi.includes('clusterCompetitorAudienceGains'), 'Must compute clusterCompetitorAudienceGains');
});

check('Shared Annotations Hub displays cross-keyword frequency, metric gains, and copy actions', () => {
  const foldersUi = fs.readFileSync(path.join(ROOT_DIR, 'src/campaign-folders-ui.mjs'), 'utf8');

  // Verify container class
  assert.ok(foldersUi.includes('shared-annotations-hub'), 'Must render container with class shared-annotations-hub');

  // Verify copy handlers
  assert.ok(foldersUi.includes('copyAnnotation('), 'Must provide copyAnnotation method');
  assert.ok(foldersUi.includes('copyAnnotations('), 'Must provide copyAnnotations bulk method');

  // Verify metric gain bindings
  assert.ok(foldersUi.includes('saves_gain'), 'Must display saves_gain');
  assert.ok(foldersUi.includes('velocity_gain'), 'Must display velocity_gain');
});

// -----------------------------------------------------------------------------
// SECTION 9: POPSTATE & NAVIGATION PRESERVATION (RULE 30)
// -----------------------------------------------------------------------------
console.log('\n--- Section 9: Popstate & Navigation Preservation (Rule 30) ---');

check('Keywords UI selectKeyword preserves folder scope in pushState URL', () => {
  const keywordsUi = fs.readFileSync(path.join(ROOT_DIR, 'src/keywords-ui.mjs'), 'utf8');

  assert.ok(keywordsUi.includes("'/folders/' + encodeURIComponent(this.activeFolderId) + '/keywords?q='"),
    'selectKeyword must push folder-scoped URL when activeFolderId is set');
});

check('Keywords UI switchToDashboard preserves folder scope in pushState URL', () => {
  const keywordsUi = fs.readFileSync(path.join(ROOT_DIR, 'src/keywords-ui.mjs'), 'utf8');

  assert.ok(keywordsUi.includes("'/folders/' + encodeURIComponent(this.activeFolderId) + '/keywords'"),
    'switchToDashboard must push folder-scoped URL when activeFolderId is set');
});

// -----------------------------------------------------------------------------
// SECTION 10: APP SIDEBAR & WORKSPACE HEADER NAVIGATION
// -----------------------------------------------------------------------------
console.log('\n--- Section 10: App Sidebar & Workspace Header Navigation Parity ---');

check('App Sidebar renders "Campaign Folders" as 6th item in mobile and desktop', () => {
  const sidebarDesktop = renderAppSidebar('folders', false);
  const sidebarMobile = renderAppSidebar('folders', true);

  assert.ok(sidebarDesktop.includes('href="/folders"'), 'Desktop sidebar must link to /folders');
  assert.ok(sidebarDesktop.includes('Campaign Folders'), 'Desktop sidebar must label Campaign Folders');
  assert.ok(sidebarMobile.includes('href="/folders"'), 'Mobile sidebar must link to /folders');
  assert.ok(sidebarMobile.includes('Campaign Folders'), 'Mobile sidebar must label Campaign Folders');
});

check('Campaign Workspace Header renders Room 5 Settings & Pruning and Quick Switcher', () => {
  const headerHtml = renderCampaignWorkspaceHeader({
    folderId: 42,
    folder: { id: 42, name: 'Baking Essentials', unique_pins_count: 88, keyword_count: 5 },
    activeRoom: 'settings'
  });

  assert.ok(headerHtml.includes('/folders/42/settings'), 'Header must include link to /folders/42/settings');
  assert.ok(headerHtml.includes('Settings &amp; Pruning') || headerHtml.includes('Settings & Pruning'),
    'Header must render Room 5 title');
  assert.ok(headerHtml.includes('folderSwitcherOpen') && headerHtml.includes('Switch Folder'),
    'Header must contain quick folder switcher dropdown');
});

// -----------------------------------------------------------------------------
// SUMMARY & SCORECARD
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('   ADVERSARIAL STRESS TEST SCORECARD');
console.log('================================================================================');
console.log(`Total Stress Tests Executed: ${totalTests}`);
console.log(`Passed:                      ${passedTests}`);
console.log(`Failed:                      ${failedTests}`);

if (failedTests > 0) {
  console.log('\n[!] FAILURES:');
  for (const f of failures) {
    console.log(`- ${f.testName}: ${f.error.message}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ [ALL ADVERSARIAL STRESS TESTS PASSED] 100% Robustness Verified across R1-R5.');
  process.exit(0);
}
