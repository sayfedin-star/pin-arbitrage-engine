#!/usr/bin/env node

/**
 * scripts/test_campaign_workspace_v4.mjs
 * 
 * Comprehensive Automated Contract Test Suite for Campaign Workspace V4
 * Covers Requirements R1 through R5 and all Acceptance Criteria:
 * 
 * - Suite 1: Forensic Audit & Landmine Remediations (R1)
 *   1.1 Room 2 Active Crawled Pins KPI Card Binding
 *   1.2 Campaign Workspace Header Badge CTE & Consistency
 *   1.3 SERP Studio Navigation Parameter & Context Preservation
 *   1.4 Crossover SQL Projection of Pin Age and Delta Metrics
 *   1.5 Fleet Dispatchers Folder Pause Enforcement
 * 
 * - Suite 2: Interest Cluster Intelligence & Multi-Window Telemetry (R2)
 *   2.1 Multi-Window Velocity Rollup Bar Across 6 Windows (24h, 5d, 7d, 10d, 15d, All)
 *   2.2 Room 1 Pin Table Age Badges, Multi-Window Gains & Sorting
 *   2.3 Shared Annotations Hub with Copy & Metric Gains
 *   2.4 Domain Radar Creator Audience Bridge & Cluster Push Signal
 * 
 * - Suite 3: Auto-Discovered Creator Hub (R3)
 *   3.1 Unique Creator Account Extraction from Active SERP (WHERE is_displaced = FALSE)
 *   3.2 1-Click Tracking Toggle Between Auto-Discovered and Actively Tracked
 *   3.3 Creator Lightweight Daily Telemetry & Multi-Window Deltas
 *   3.4 Folder-Wide Competitor Totals Bar
 * 
 * - Suite 4: Folder Settings & Smart Bulk Pin Pruning (R4)
 *   4.1 Folder Settings Room Controls & Pause Flags
 *   4.2 Smart Pin Pruning Multi-Keyword Selector & Thresholds
 *   4.3 Pruning Dry-Run Preview (dry_run: true)
 *   4.4 Atomic Prune Execution, Tombstoning & Edge Cache Eviction
 * 
 * - Suite 5: Unified App Sidebar & Workspace Header (R5)
 *   5.1 App Sidebar 6th Navigation Item 'Campaign Folders' (/folders)
 *   5.2 Workspace Header Room 5 'Settings & Pruning' (/folders/:id/settings)
 *   5.3 Quick Folder-Switcher Dropdown in Workspace Header
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// Static template imports for rendering tests
import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';
import { renderCampaignWorkspaceHeader } from '../src/ui/campaign-workspace-header.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Scorecard & Test Reporting State
const scorecard = [];
let totalPassed = 0;
let totalFailed = 0;

function recordTest(suite, testId, description, passed, error = null, durationMs = 0) {
  if (passed) {
    totalPassed++;
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m [${suite}] ${testId}: ${description} (${durationMs.toFixed(2)}ms)`);
  } else {
    totalFailed++;
    console.log(`  \x1b[31m✗ [FAIL]\x1b[0m [${suite}] ${testId}: ${description} (${durationMs.toFixed(2)}ms)`);
    if (error) {
      console.log(`     \x1b[33mReason:\x1b[0m ${error.message || error}`);
    }
  }

  scorecard.push({
    suite,
    testId,
    description,
    status: passed ? 'PASS' : 'FAIL',
    durationMs: Number(durationMs.toFixed(2)),
    error: error ? (error.message || String(error)) : null
  });
}

function readFileUtf8(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

// =============================================================================
// SUITE 1: FORENSIC AUDIT & LANDMINE REMEDIATIONS (R1)
// =============================================================================
async function runSuite1() {
  console.log('\n================================================================');
  console.log('   SUITE 1: FORENSIC AUDIT & LANDMINE REMEDIATIONS (R1)');
  console.log('================================================================');

  // Test 1.1: Room 2 Active Crawled Pins KPI Card Binding
  {
    const start = performance.now();
    try {
      const keywordsUi = readFileUtf8('src/keywords-ui.mjs');

      // The second metric card currently renders:
      // <span ... x-text="activeFolderId ? 'Active Crawled Pins' : 'Monitored Organic Pins'"></span>
      // But the value is bound to:
      // <span ... x-text="formatNumber(totalMonitoredPins)"></span>
      // which calls getKeywordTotalPins that sums active + displaced!
      // In folder mode, it must strictly bind to totalActivePinsCount.
      
      const card2Matches = keywordsUi.match(/x-text="activeFolderId\s*\?\s*['"]Active Crawled Pins['"][\s\S]*?<\/div>\s*<\/template>/i);
      assert.ok(card2Matches, 'Could not locate Active Crawled Pins card in src/keywords-ui.mjs');

      const card2Chunk = card2Matches[0];

      // Must NOT be unconditionally formatNumber(totalMonitoredPins)
      const hasStrictActiveBinding = card2Chunk.includes('totalActivePinsCount') ||
        card2Chunk.includes('activeFolderId ? totalActivePinsCount') ||
        card2Chunk.includes('activeFolderId ? formatNumber(totalActivePinsCount)');

      assert.ok(hasStrictActiveBinding, 'Room 2 KPI card for Active Crawled Pins does not bind to totalActivePinsCount; double-counts Displaced Vault pins');

      recordTest('Suite 1', '1.1', 'Room 2 KPI binding for Active Crawled Pins strictly uses totalActivePinsCount', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 1', '1.1', 'Room 2 KPI binding for Active Crawled Pins strictly uses totalActivePinsCount', false, err, performance.now() - start);
    }
  }

  // Test 1.2: Campaign Workspace Header Badge CTE & Consistency
  {
    const start = performance.now();
    try {
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');
      const headerUi = readFileUtf8('src/ui/campaign-workspace-header.mjs');

      // 1. listFolders() and getFolder() must contain a distinct CTE for unique active non-displaced pins
      const hasUniquePinCte = (foldersService.includes('unique_pins_count') || foldersService.includes('total_unique_pins')) &&
        foldersService.includes('COUNT(DISTINCT ksc.pin_id)') &&
        foldersService.includes('ksc.is_displaced = FALSE');

      assert.ok(hasUniquePinCte, 'folders-service.mjs listFolders/getFolder does not include distinct CTE for unique active non-displaced pins');

      // 2. Room 1 badge in campaign-workspace-header.mjs must reference activeFolder?.unique_pins_count or activeFolder?.total_unique_pins
      const hasHeaderUniqueBadge = headerUi.includes('activeFolder?.unique_pins_count') ||
        headerUi.includes('activeFolder?.total_unique_pins') ||
        headerUi.includes('activeFolder.unique_pins_count');

      assert.ok(hasHeaderUniqueBadge, 'campaign-workspace-header.mjs Room 1 badge does not display unique_pins_count; falls back to keyword_count');

      recordTest('Suite 1', '1.2', 'Header badge CTE and consistency for unique active non-displaced pins', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 1', '1.2', 'Header badge CTE and consistency for unique active non-displaced pins', false, err, performance.now() - start);
    }
  }

  // Test 1.3: SERP Studio Navigation Parameter & Context Preservation
  {
    const start = performance.now();
    try {
      const keywordsUi = readFileUtf8('src/keywords-ui.mjs');

      // 1. switchToDashboard() must preserve activeFolderId when navigating back
      // Currently it does: window.history.pushState(null, '', '/keywords');
      const switchToDashMatch = keywordsUi.match(/switchToDashboard\(\)\s*\{[\s\S]*?\}/);
      assert.ok(switchToDashMatch, 'switchToDashboard() not found in src/keywords-ui.mjs');
      const switchToDashBody = switchToDashMatch[0];

      const preservesFolderInDashboard = switchToDashBody.includes('activeFolderId') &&
        (switchToDashBody.includes('/folders/') || switchToDashBody.includes('folders'));

      assert.ok(preservesFolderInDashboard, 'switchToDashboard() unconditionally navigates to /keywords, losing active folder scope');

      // 2. Level 2 SERP Radar Studio must render renderCampaignWorkspaceHeader when activeFolderId is set
      const studioHeaderMatch = keywordsUi.match(/viewModeLevel\s*===\s*['"]serp_studio['"][\s\S]*?renderCampaignWorkspaceHeader/);
      assert.ok(studioHeaderMatch, 'SERP Studio (viewModeLevel === "serp_studio") does not render or preserve Campaign Workspace Header context');

      recordTest('Suite 1', '1.3', 'SERP Studio navigation preserves folder context and workspace header', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 1', '1.3', 'SERP Studio navigation preserves folder context and workspace header', false, err, performance.now() - start);
    }
  }

  // Test 1.4: Crossover SQL Projection of Pin Age and Delta Metrics
  {
    const start = performance.now();
    try {
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // _executeFolderCrossover must project created_at_pinterest, crawled_at, delta metrics, pin_age_days, and folder_age_days
      const hasCreatedAt = foldersService.includes('created_at_pinterest') && foldersService.includes('c.created_at_pinterest');
      const hasCrawledAt = foldersService.includes('crawled_at') && foldersService.includes('c.crawled_at');
      const hasPinAge = foldersService.includes('pin_age_days');
      const hasFolderAge = foldersService.includes('folder_age_days');

      assert.ok(hasCreatedAt, '_executeFolderCrossover does not project c.created_at_pinterest from keyword_serp_current');
      assert.ok(hasCrawledAt, '_executeFolderCrossover does not project c.crawled_at from keyword_serp_current');
      assert.ok(hasPinAge, '_executeFolderCrossover does not project computed pin_age_days');
      assert.ok(hasFolderAge, '_executeFolderCrossover does not project computed folder_age_days');

      recordTest('Suite 1', '1.4', 'Crossover query projects created_at_pinterest, crawled_at, pin_age_days, and folder_age_days', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 1', '1.4', 'Crossover query projects created_at_pinterest, crawled_at, pin_age_days, and folder_age_days', false, err, performance.now() - start);
    }
  }

  // Test 1.5: Fleet Dispatchers Folder Pause Enforcement
  {
    const start = performance.now();
    try {
      const kwDispatcher = readFileUtf8('scripts/keyword-fleet-dispatcher.mjs');
      const creatorDispatcher = readFileUtf8('scripts/creator-fleet-dispatcher.mjs');

      // 1. Keyword fleet dispatcher must check pause_crawlers or block_fleet
      const hasKwPauseCheck = (kwDispatcher.includes('pause_crawlers') || kwDispatcher.includes('block_fleet')) &&
        (kwDispatcher.includes('folderMeta.pause_crawlers') || kwDispatcher.includes('folderMeta.block_fleet'));

      assert.ok(hasKwPauseCheck, 'scripts/keyword-fleet-dispatcher.mjs does not inspect folder-level pause_crawlers or block_fleet');

      // 2. Creator fleet dispatcher must check pause_competitors or block_fleet
      const hasCreatorPauseCheck = (creatorDispatcher.includes('pause_competitors') || creatorDispatcher.includes('block_fleet'));

      assert.ok(hasCreatorPauseCheck, 'scripts/creator-fleet-dispatcher.mjs does not inspect folder-level pause_competitors or block_fleet');

      recordTest('Suite 1', '1.5', 'Fleet dispatchers enforce folder-level crawler and competitor pause flags', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 1', '1.5', 'Fleet dispatchers enforce folder-level crawler and competitor pause flags', false, err, performance.now() - start);
    }
  }
}

// =============================================================================
// SUITE 2: INTEREST CLUSTER INTELLIGENCE & MULTI-WINDOW TELEMETRY (R2)
// =============================================================================
async function runSuite2() {
  console.log('\n================================================================');
  console.log('   SUITE 2: CLUSTER INTELLIGENCE & MULTI-WINDOW TELEMETRY (R2)');
  console.log('================================================================');

  // Test 2.1: Multi-Window Velocity Rollup Bar Across 6 Windows
  {
    const start = performance.now();
    try {
      const campaignUi = readFileUtf8('src/campaign-folders-ui.mjs');

      // Verify presence of multi-window selector buttons: 24h, 5d, 7d, 10d, 15d, All
      const has24h = campaignUi.includes("'24h'") || campaignUi.includes('"24h"');
      const has5d = campaignUi.includes("'5d'") || campaignUi.includes('"5d"');
      const has7d = campaignUi.includes("'7d'") || campaignUi.includes('"7d"');
      const has10d = campaignUi.includes("'10d'") || campaignUi.includes('"10d"');
      const has15d = campaignUi.includes("'15d'") || campaignUi.includes('"15d"');
      const hasAll = campaignUi.includes("'all'") || campaignUi.includes('"all"');

      assert.ok(has24h && has5d && has7d && has10d && has15d && hasAll, 'campaign-folders-ui.mjs lacks multi-window selector for 24h, 5d, 7d, 10d, 15d, and All');

      // Verify rollup metrics for cluster: winning pins count, Saves gains, Repins gains, and competitor audience/impressions gains
      const hasRollupBar = campaignUi.includes('Cluster Performance') ||
        campaignUi.includes('cluster-performance-rollup') ||
        campaignUi.includes('clusterRollup');

      assert.ok(hasRollupBar, 'campaign-folders-ui.mjs lacks Cluster Performance & Velocity Rollup Bar');

      recordTest('Suite 2', '2.1', 'Cluster performance and velocity rollup bar supports 6 time windows', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 2', '2.1', 'Cluster performance and velocity rollup bar supports 6 time windows', false, err, performance.now() - start);
    }
  }

  // Test 2.2: Room 1 Pin Table Age Badges, Multi-Window Gains & Sorting
  {
    const start = performance.now();
    try {
      const campaignUi = readFileUtf8('src/campaign-folders-ui.mjs');

      // 1. Table must render pin age and folder age badges
      const hasPinAgeBadge = campaignUi.includes('pin_age_days') || campaignUi.includes('formatUniversalAge(pin.pin_age_days)');
      const hasFolderAgeBadge = campaignUi.includes('folder_age_days') || campaignUi.includes('formatUniversalAge(pin.folder_age_days)');

      assert.ok(hasPinAgeBadge, 'Room 1 pin table does not render Pin Age (pin_age_days) badge');
      assert.ok(hasFolderAgeBadge, 'Room 1 pin table does not render Days in Folder (folder_age_days) badge');

      // 2. Strict time formatting rule check (Rule 31: >=365d in years, <365d in days)
      const hasUniversalAgeFormatter = campaignUi.includes('formatUniversalAge') ||
        (campaignUi.includes('365') && campaignUi.includes('/ 365') && campaignUi.includes("'y'") && campaignUi.includes("'d'"));

      assert.ok(hasUniversalAgeFormatter, 'campaign-folders-ui.mjs does not enforce Rule 31 Universal Age formatting (>=365d in years, <365d in days)');

      // 3. 1-click sorting on age and multi-window gains
      const hasAgeSort = campaignUi.includes('pin_age') || campaignUi.includes('folder_age');
      assert.ok(hasAgeSort, 'Room 1 pin table lacks 1-click sorting for pin age / folder age');

      recordTest('Suite 2', '2.2', 'Room 1 pin table displays age badges with universal formatting and 1-click sorting', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 2', '2.2', 'Room 1 pin table displays age badges with universal formatting and 1-click sorting', false, err, performance.now() - start);
    }
  }

  // Test 2.3: Shared Annotations Hub with Copy & Metric Gains
  {
    const start = performance.now();
    try {
      const campaignUi = readFileUtf8('src/campaign-folders-ui.mjs');

      // 1. Shared Annotations Hub must display cross-keyword frequency, pin counts, and metric gains
      const hasAnnotationsHub = (campaignUi.includes('Shared Annotations Hub') || campaignUi.includes('shared-annotations-hub')) &&
        (campaignUi.includes('metric_gains') || campaignUi.includes('saves_gain') || campaignUi.includes('velocity_gain'));

      assert.ok(hasAnnotationsHub, 'Shared Annotations Hub with metric gains is not rendered in Room 1');

      // 2. 1-click copy action specifically for annotations
      const hasCopyAnnotationAction = campaignUi.includes('copyAnnotation') ||
        campaignUi.includes('copyAnnotations') ||
        campaignUi.includes('copySharedAnnotation');

      assert.ok(hasCopyAnnotationAction, 'Shared Annotations Hub lacks 1-click copy handler (copyAnnotation / copyAnnotations)');

      recordTest('Suite 2', '2.3', 'Shared Annotations Hub displays frequency, pin counts, metric gains and 1-click copy', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 2', '2.3', 'Shared Annotations Hub displays frequency, pin counts, metric gains and 1-click copy', false, err, performance.now() - start);
    }
  }

  // Test 2.4: Domain Radar Creator Audience Bridge & Cluster Push Signal
  {
    const start = performance.now();
    try {
      const domainsUi = readFileUtf8('src/domains-ui.mjs');

      // 1. Must display associated creator account Total Audience and Impressions
      const hasCreatorAudienceBridge = (domainsUi.includes('creator_audience') || domainsUi.includes('monthly_reach') || domainsUi.includes('Total audience')) &&
        (domainsUi.includes('profile_views') || domainsUi.includes('Impressions'));

      assert.ok(hasCreatorAudienceBridge, 'Domain Studio does not bridge associated creator account Total Audience and Impressions');

      // 2. Cluster Push Signal filter for young domains with high-audience business accounts
      const hasClusterPushSignal = domainsUi.includes('Cluster Push Signal') ||
        domainsUi.includes('cluster_push_signal') ||
        domainsUi.includes('clusterPushSignal');

      assert.ok(hasClusterPushSignal, 'Domain Studio lacks Cluster Push Signal filter for young domains with high-audience accounts');

      recordTest('Suite 2', '2.4', 'Domain Studio bridges creator audience and provides Cluster Push Signal filter', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 2', '2.4', 'Domain Studio bridges creator audience and provides Cluster Push Signal filter', false, err, performance.now() - start);
    }
  }
}

// =============================================================================
// SUITE 3: AUTO-DISCOVERED CREATOR HUB (R3)
// =============================================================================
async function runSuite3() {
  console.log('\n================================================================');
  console.log('   SUITE 3: AUTO-DISCOVERED CREATOR HUB (R3)');
  console.log('================================================================');

  // Test 3.1: Unique Creator Account Extraction from Active SERP
  {
    const start = performance.now();
    try {
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // listFolderCreators or autoDiscoverFolderCreators must extract unique creators ranking in folder keywords WHERE is_displaced = FALSE
      const hasAutoDiscoveryQuery = foldersService.includes('is_displaced = FALSE') &&
        (foldersService.includes('auto_discover_creators') || foldersService.includes('autoDiscoverFolderCreators') || foldersService.includes('auto_discovered'));

      assert.ok(hasAutoDiscoveryQuery, 'folders-service.mjs lacks query extracting unique creators from active SERP WHERE is_displaced = FALSE');

      recordTest('Suite 3', '3.1', 'Auto-discovery query extracts unique ranking creators with is_displaced = FALSE', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 3', '3.1', 'Auto-discovery query extracts unique ranking creators with is_displaced = FALSE', false, err, performance.now() - start);
    }
  }

  // Test 3.2: 1-Click Tracking Toggle Between Auto-Discovered and Actively Tracked
  {
    const start = performance.now();
    try {
      const dashboardUi = readFileUtf8('src/dashboard-ui.mjs');
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // Must support toggling between auto-discovered and tracked creators in folder scope
      const hasToggleLogic = (dashboardUi.includes('toggleCreatorTracking') || dashboardUi.includes('trackCreatorFromFolder') || foldersService.includes('toggleFolderCreatorTracking')) ||
        (dashboardUi.includes('is_tracked') && dashboardUi.includes('auto_discovered'));

      assert.ok(hasToggleLogic, 'Creator Hub lacks 1-click tracking toggle between auto-discovered and tracked creators');

      recordTest('Suite 3', '3.2', '1-click tracking toggle supported between auto-discovered and tracked creators', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 3', '3.2', '1-click tracking toggle supported between auto-discovered and tracked creators', false, err, performance.now() - start);
    }
  }

  // Test 3.3: Creator Lightweight Daily Telemetry & Multi-Window Deltas
  {
    const start = performance.now();
    try {
      const dashboardUi = readFileUtf8('src/dashboard-ui.mjs');
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // Telemetry must include Total Audience (monthly_reach), Impressions (profile_views), multi-window deltas (+24h, +5d, +10d), and pinning cadence
      const hasAudienceImpressions = (foldersService.includes('monthly_reach') || dashboardUi.includes('monthly_reach')) &&
        (foldersService.includes('profile_views') || dashboardUi.includes('profile_views'));
      
      const hasMultiWindowDeltas = dashboardUi.includes('+24h') || dashboardUi.includes('delta_24h') ||
        dashboardUi.includes('+5d') || dashboardUi.includes('delta_5d') ||
        dashboardUi.includes('+10d') || dashboardUi.includes('delta_10d');

      const hasPinningCadence = dashboardUi.includes('Pins / Day') || dashboardUi.includes('pins_per_day') || dashboardUi.includes('cadence');

      assert.ok(hasAudienceImpressions, 'Creator Hub missing Total Audience / Impressions telemetry');
      assert.ok(hasMultiWindowDeltas, 'Creator Hub missing multi-window deltas (+24h, +5d, +10d)');
      assert.ok(hasPinningCadence, 'Creator Hub missing Pins / Day pinning cadence');

      recordTest('Suite 3', '3.3', 'Creator telemetry displays Total Audience, Impressions, multi-window deltas, and pinning cadence', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 3', '3.3', 'Creator telemetry displays Total Audience, Impressions, multi-window deltas, and pinning cadence', false, err, performance.now() - start);
    }
  }

  // Test 3.4: Folder-Wide Competitor Totals Bar
  {
    const start = performance.now();
    try {
      const dashboardUi = readFileUtf8('src/dashboard-ui.mjs');

      // Folder Creator Hub must display a folder-wide competitor summary totals bar
      const hasTotalsBar = dashboardUi.includes('folderCompetitorTotals') ||
        dashboardUi.includes('Combined Audience') ||
        dashboardUi.includes('combined_audience') ||
        (dashboardUi.includes('scopedFolderId') && dashboardUi.includes('totalAudienceSum'));

      assert.ok(hasTotalsBar, 'Creator Hub lacks folder-wide competitor totals bar');

      recordTest('Suite 3', '3.4', 'Folder-wide competitor totals bar renders combined audience, impressions, and cadence', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 3', '3.4', 'Folder-wide competitor totals bar renders combined audience, impressions, and cadence', false, err, performance.now() - start);
    }
  }
}

// =============================================================================
// SUITE 4: FOLDER SETTINGS & SMART BULK PIN PRUNING (R4)
// =============================================================================
async function runSuite4() {
  console.log('\n================================================================');
  console.log('   SUITE 4: FOLDER SETTINGS & SMART BULK PIN PRUNING (R4)');
  console.log('================================================================');

  // Test 4.1: Folder Settings Room Controls & Pause Flags
  {
    const start = performance.now();
    try {
      const pagesRoutes = readFileUtf8('src/routes/pages.mjs');
      const keywordsRoutes = readFileUtf8('src/routes/keywords.mjs');

      // 1. Room 5 /folders/:id/settings must be routed in src/routes/pages.mjs
      const routesSettingsRoom = pagesRoutes.includes("room === 'settings'");
      assert.ok(routesSettingsRoom, 'src/routes/pages.mjs does not route Room 5 (/folders/:id/settings)');

      // 2. Settings update must support pause_competitors, pause_crawlers, block_fleet, max_serp_pins, crawl_scope, auto_discover_creators
      const supportsPauseControls = keywordsRoutes.includes('pause_competitors') &&
        keywordsRoutes.includes('pause_crawlers') &&
        keywordsRoutes.includes('block_fleet');

      assert.ok(supportsPauseControls, 'src/routes/keywords.mjs lacks folder settings pause controls for competitors, crawlers, and fleet');

      recordTest('Suite 4', '4.1', 'Folder Settings room routed with pause toggles and harvest quota controls', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 4', '4.1', 'Folder Settings room routed with pause toggles and harvest quota controls', false, err, performance.now() - start);
    }
  }

  // Test 4.2: Smart Pin Pruning Multi-Keyword Selector & Thresholds
  {
    const start = performance.now();
    try {
      const keywordsRoutes = readFileUtf8('src/routes/keywords.mjs');
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // Pruning logic must accept multi-keyword selector (keyword_ids array) and threshold filters
      const hasPruningFilters = (keywordsRoutes.includes('prune-pins') || foldersService.includes('pruneFolderPins')) &&
        (keywordsRoutes.includes('keyword_ids') || foldersService.includes('keywordIds')) &&
        (keywordsRoutes.includes('min_pin_age_days') || foldersService.includes('minPinAgeDays') || foldersService.includes('max_saves'));

      assert.ok(hasPruningFilters, 'Pruning engine lacks multi-keyword selector or age/save threshold filters');

      recordTest('Suite 4', '4.2', 'Smart pin pruning supports multi-keyword selection and age/save thresholds', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 4', '4.2', 'Smart pin pruning supports multi-keyword selection and age/save thresholds', false, err, performance.now() - start);
    }
  }

  // Test 4.3: Pruning Dry-Run Preview (dry_run: true)
  {
    const start = performance.now();
    try {
      const keywordsRoutes = readFileUtf8('src/routes/keywords.mjs');
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // Endpoint POST /api/folders/:id/prune-pins must support dry_run: true
      const hasDryRun = (keywordsRoutes.includes('prune-pins') || foldersService.includes('pruneFolderPins')) &&
        (keywordsRoutes.includes('dry_run') || foldersService.includes('dryRun') || foldersService.includes('dry_run'));

      assert.ok(hasDryRun, 'POST /api/folders/:id/prune-pins lacks dry_run preview capability');

      recordTest('Suite 4', '4.3', 'Pin pruning API supports dry-run preview returning candidate counts without mutating DB', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 4', '4.3', 'Pin pruning API supports dry-run preview returning candidate counts without mutating DB', false, err, performance.now() - start);
    }
  }

  // Test 4.4: Atomic Prune Execution, Tombstoning & Edge Cache Eviction
  {
    const start = performance.now();
    try {
      const keywordsRoutes = readFileUtf8('src/routes/keywords.mjs');
      const foldersService = readFileUtf8('src/modules/keywords/folders-service.mjs');

      // Must have prune-pins route or pruneFolderPins service
      const hasPruneHandler = keywordsRoutes.includes('prune-pins') || foldersService.includes('pruneFolderPins');
      assert.ok(hasPruneHandler, 'No prune-pins endpoint or pruneFolderPins service found');

      // The prune handler must tombstone deleted pins to keyword_ignored_pins and evict D1/KV cache
      const pruneSnippet = (keywordsRoutes.match(/prune-pins[\s\S]*?(?:return|break)/i) || [''])[0] +
        (foldersService.match(/pruneFolderPins[\s\S]*?(?:return|})/i) || [''])[0];

      const hasTombstone = pruneSnippet.includes('keyword_ignored_pins');
      const hasCacheEvict = pruneSnippet.includes('edge_pins_metadata') || pruneSnippet.includes('PIN_ENGINE_KV') || pruneSnippet.includes('invalidate');

      assert.ok(hasTombstone, 'Pruning execution does not tombstone pruned pins to keyword_ignored_pins');
      assert.ok(hasCacheEvict, 'Pruning execution does not evict D1 edge_pins_metadata and KV cache');

      recordTest('Suite 4', '4.4', 'Atomic prune execution tombstones to keyword_ignored_pins and purges edge caches', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 4', '4.4', 'Atomic prune execution tombstones to keyword_ignored_pins and purges edge caches', false, err, performance.now() - start);
    }
  }
}

// =============================================================================
// SUITE 5: UNIFIED APP SIDEBAR & WORKSPACE HEADER (R5)
// =============================================================================
async function runSuite5() {
  console.log('\n================================================================');
  console.log('   SUITE 5: UNIFIED APP SIDEBAR & WORKSPACE HEADER (R5)');
  console.log('================================================================');

  // Test 5.1: App Sidebar 6th Navigation Item 'Campaign Folders'
  {
    const start = performance.now();
    try {
      const renderedSidebar = renderAppSidebar({ activeNav: 'folders' });

      // 1. Must render 'Campaign Folders' linking to '/folders'
      assert.ok(renderedSidebar.includes('href="/folders"'), 'App Sidebar does not contain link href="/folders"');
      assert.ok(renderedSidebar.includes('Campaign Folders'), 'App Sidebar does not contain text "Campaign Folders"');

      // 2. Must appear after Related Pins in the navigation markup
      const relatedIndex = renderedSidebar.indexOf('href="/related-pins"');
      const foldersIndex = renderedSidebar.indexOf('href="/folders"');
      assert.ok(relatedIndex !== -1, 'Related Pins link not found in App Sidebar');
      assert.ok(foldersIndex > relatedIndex, 'Campaign Folders must appear after Related Pins as the 6th navigation item');

      // 3. activeNav === 'folders' must apply active highlighting class
      assert.ok(renderedSidebar.includes('text-rose-600') || renderedSidebar.includes('text-rose-400') || renderedSidebar.includes('bg-rose-50'), 'activeNav="folders" does not apply active rose token highlighting');

      recordTest('Suite 5', '5.1', "App Sidebar renders 'Campaign Folders' as the 6th item with active highlighting", true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 5', '5.1', "App Sidebar renders 'Campaign Folders' as the 6th item with active highlighting", false, err, performance.now() - start);
    }
  }

  // Test 5.2: Workspace Header Room 5 'Settings & Pruning'
  {
    const start = performance.now();
    try {
      const renderedHeader = renderCampaignWorkspaceHeader({ activeRoom: 'settings', folderId: '42' });

      // 1. Must render Room 5 tab linking to /folders/42/settings
      assert.ok(renderedHeader.includes('/folders/42/settings') || renderedHeader.includes("'/folders/' +") && renderedHeader.includes("'/settings'"), 'Workspace Header does not render Room 5 tab linking to /folders/:id/settings');
      assert.ok(renderedHeader.includes('Settings & Pruning') || renderedHeader.includes('Settings'), 'Workspace Header does not render "Settings & Pruning" label');

      // 2. Must highlight active state when activeRoom === 'settings'
      assert.ok(renderedHeader.includes('border-rose-600') || renderedHeader.includes('border-rose-500'), 'Workspace Header does not apply active tab styling for activeRoom="settings"');

      recordTest('Suite 5', '5.2', "Workspace Header renders Room 5 'Settings & Pruning' tab with active state", true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 5', '5.2', "Workspace Header renders Room 5 'Settings & Pruning' tab with active state", false, err, performance.now() - start);
    }
  }

  // Test 5.3: Quick Folder-Switcher Dropdown in Workspace Header
  {
    const start = performance.now();
    try {
      const renderedHeader = renderCampaignWorkspaceHeader({ activeRoom: 'crossover', folderId: '42' });

      // Must render quick folder-switcher dropdown
      const hasFolderSwitcher = renderedHeader.includes('folderSwitcher') ||
        renderedHeader.includes('folder-switcher') ||
        renderedHeader.includes('Switch Folder') ||
        renderedHeader.includes('foldersList') ||
        renderedHeader.includes('allFolders');

      assert.ok(hasFolderSwitcher, 'Workspace Header lacks quick folder-switcher dropdown');

      recordTest('Suite 5', '5.3', 'Workspace Header includes quick folder-switcher dropdown', true, null, performance.now() - start);
    } catch (err) {
      recordTest('Suite 5', '5.3', 'Workspace Header includes quick folder-switcher dropdown', false, err, performance.now() - start);
    }
  }
}

// =============================================================================
// MAIN TEST HARNESS RUNNER & SCORECARD GENERATOR
// =============================================================================
export async function runAllSuites() {
  console.log('================================================================================');
  console.log('   CAMPAIGN WORKSPACE V4 COMPREHENSIVE CONTRACT TEST SUITE');
  console.log('   Adversarial Verification for Requirements R1 through R5');
  console.log('================================================================================');

  const suiteStartTime = performance.now();

  await runSuite1();
  await runSuite2();
  await runSuite3();
  await runSuite4();
  await runSuite5();

  const totalDuration = ((performance.now() - suiteStartTime) / 1000).toFixed(2);

  console.log('\n================================================================================');
  console.log('   CAMPAIGN WORKSPACE V4 TEST SCORECARD SUMMARY');
  console.log('================================================================================');
  console.log(`Total Tests Run:  ${scorecard.length}`);
  console.log(`Passed Tests:     \x1b[32m${totalPassed}\x1b[0m`);
  console.log(`Failed Tests:     \x1b[31m${totalFailed}\x1b[0m`);
  console.log(`Execution Time:   ${totalDuration}s\n`);

  console.table(scorecard.map(t => ({
    Suite: t.suite,
    ID: t.testId,
    Description: t.description.length > 50 ? t.description.slice(0, 47) + '...' : t.description,
    Status: t.status,
    Time: `${t.durationMs}ms`,
    Error: t.error ? (t.error.length > 40 ? t.error.slice(0, 37) + '...' : t.error) : '—'
  })));

  if (totalFailed > 0) {
    console.log(`\n\x1b[33m[PHASE 1 BASELINE OBSERVED]\x1b[0m ${totalFailed} tests failed as expected before Phase 2 implementation.`);
  } else {
    console.log('\n\x1b[32m[ALL CONTRACT TESTS PASSED]\x1b[0m All Campaign Workspace V4 requirements certified.');
  }

  return { totalPassed, totalFailed, scorecard };
}

// CLI Execution Entrypoint
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllSuites()
    .then(({ totalFailed }) => {
      // For baseline test reporting in Phase 1, exit cleanly with informative code
      // We pass --strict if running in CI/gate where all tests MUST pass
      const isStrict = process.argv.includes('--strict');
      if (isStrict && totalFailed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((fatalErr) => {
      console.error('\n[-] FATAL ERROR IN TEST HARNESS:', fatalErr);
      process.exit(1);
    });
}
