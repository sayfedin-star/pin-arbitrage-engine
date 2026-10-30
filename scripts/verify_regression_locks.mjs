#!/usr/bin/env node

/**
 * scripts/verify_regression_locks.mjs
 * 
 * Automated Architectural Regression Gate
 * Fast (< 1s), zero-dependency automated verification script that inspects the
 * codebase and exits with code 1 if ANY of the 12 permanent architectural regression locks regress.
 * 
 * Enforces Invariants 32–41:
 * - Lock 1: Room 1–5 Sibling DOM Hierarchy & Unclipped Workspace Header
 * - Lock 2: Pin Dossier Timeframe & SERP Badge Integrity
 * - Lock 3: Universal Shard-Affine SQL Pushdown (Neon Egress Shield)
 * - Lock 4: Authentic Rolling Multi-Window Gains vs Fake Multiplier
 * - Lock 5: Context-Preserving Pin Navigation & Untracked Creator Shield
 * - Lock 6: Defensive D1 Coalescence & Epoch Cache Coherency
 * - Lock 7: Room 3 Creator Hub Discovery & Lightweight SERP Creator Pulse
 * - Lock 8: Daily Rolling Gains Workflow Automation
 * - Lock 9: Window-Aware Competitor Audience Gains
 * - Lock 10: Room 3 Single-Creator SERP Track Fallback
 * - Lock 11: Domain Studio -> /accounts Query Param Hydration & Crawler BigInt Parity
 * - Lock 12: Auto-Promote Pulse Breakout & Composite Shard Migration 041
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDomNestingVerification } from './verify_dom_nesting.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function readFile(relPath) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

const errors = [];

function check(lockName, assertion, failureMessage) {
  if (!assertion) {
    errors.push(`[${lockName}] REGRESSION DETECTED: ${failureMessage}`);
    console.error(`  ❌ [${lockName}] FAIL: ${failureMessage}`);
  } else {
    console.log(`  ✅ [${lockName}] PASS`);
  }
}

console.log('='.repeat(80));
console.log('   PIN ARBITRAGE ENGINE (PAE) - ARCHITECTURAL REGRESSION LOCK AUDIT');
console.log('='.repeat(80));

const startTime = performance.now();

try {
  // =========================================================================
  // LOCK 1: DOM Hierarchy & Header Dropdown
  // =========================================================================
  console.log('\n[Lock 1] Verifying Room 1–5 DOM Hierarchy & Unclipped Workspace Header...');
  
  // 1A. Sibling DOM hierarchy in src/campaign-folders-ui.mjs
  let domNestingPassed = false;
  try {
    domNestingPassed = runDomNestingVerification();
  } catch (err) {
    domNestingPassed = false;
  }
  check('Lock 1', domNestingPassed, 'Room 5 is nested inside Room 1 or failed DOM nesting tree verification in src/campaign-folders-ui.mjs');

  // 1B. Outer header wrapper must NOT contain overflow-hidden
  const headerContent = readFile('src/ui/campaign-workspace-header.mjs');
  const outerWrapperMatch = headerContent.match(/<!--\s*\[INVARIANT:\s*CAMPAIGN-WORKSPACE-HEADER-PARITY\][\s\S]*?<div\s+class="([^"]+)"/);
  const outerWrapperClasses = outerWrapperMatch ? outerWrapperMatch[1] : '';
  const hasOverflowHidden = /\boverflow-(hidden|clip|x-hidden|y-hidden)\b/.test(outerWrapperClasses);
  check('Lock 1', !hasOverflowHidden && outerWrapperMatch !== null, 'Outer header wrapper in src/ui/campaign-workspace-header.mjs contains overflow-hidden, which will clip the folder dropdown');

  // =========================================================================
  // LOCK 2: Pin Dossier Timeframe & SERP Badge
  // =========================================================================
  console.log('\n[Lock 2] Verifying Pin Dossier Timeframe & SERP Badge Integrity...');
  const pinDetailsContent = readFile('src/pin-details-ui.mjs');
  const mathContent = readFile('src/lib/math.mjs');
  const fleetRouterContent = readFile('src/modules/sharding/fleet-router.mjs');

  // 2A. Default timeframe must be '7d'
  const hasDefault7d = /chartTimeframe:\s*['"]7d['"]/.test(pinDetailsContent);
  check('Lock 2', hasDefault7d, "src/pin-details-ui.mjs changed default chartTimeframe away from '7d'");

  // 2B. Must include '15d' timeframe
  const has15d = /['"]15d['"]/.test(pinDetailsContent);
  check('Lock 2', has15d, "src/pin-details-ui.mjs omits '15d' timeframe support");

  // 2C. Must contain isKeywordDisplacedOrUnranked
  const hasDisplacedHelper = /isKeywordDisplacedOrUnranked\s*\(/.test(pinDetailsContent);
  check('Lock 2', hasDisplacedHelper, 'src/pin-details-ui.mjs lacks isKeywordDisplacedOrUnranked helper');

  // 2D. Must contain detectHydrationJump
  const hasHydrationJump = /export function detectHydrationJump\s*\(/.test(mathContent);
  check('Lock 2', hasHydrationJump, 'src/lib/math.mjs lacks detectHydrationJump function');

  // 2E. Must contain sanitizeDossierTrajectory
  const hasSanitizeDossier = /export function sanitizeDossierTrajectory\s*\(/.test(fleetRouterContent);
  check('Lock 2', hasSanitizeDossier, 'src/modules/sharding/fleet-router.mjs lacks sanitizeDossierTrajectory function');

  // =========================================================================
  // LOCK 3: Neon Egress & Shard Pushdown
  // =========================================================================
  console.log('\n[Lock 3] Verifying Neon Egress & Shard Pushdown (Creator & Keyword Crawlers)...');
  const creatorCrawlerContent = readFile('scripts/creator-velocity-crawler.mjs');
  const keywordCrawlerContent = readFile('scripts/keyword-velocity-crawler.mjs');

  // 3A. creator-velocity-crawler queries pa_pins with shard_id = ANY
  const paPinsPushdown = /FROM pa_pins[\s\S]*?WHERE[\s\S]*?shard_id\s*=\s*ANY/i.test(creatorCrawlerContent);
  check('Lock 3', paPinsPushdown, 'scripts/creator-velocity-crawler.mjs queries pa_pins without shard_id = ANY pushdown');

  // 3B. creator-velocity-crawler queries competitor_pins with shard_id = ANY
  const competitorPinsPushdown = /FROM competitor_pins[\s\S]*?WHERE[\s\S]*?shard_id\s*=\s*ANY/i.test(creatorCrawlerContent);
  check('Lock 3', competitorPinsPushdown, 'scripts/creator-velocity-crawler.mjs queries competitor_pins without shard_id = ANY pushdown');

  // 3C. keyword-velocity-crawler must NOT use hashtext(
  const usesHashtext = /hashtext\s*\(/i.test(keywordCrawlerContent);
  check('Lock 3', !usesHashtext, 'scripts/keyword-velocity-crawler.mjs uses banned hashtext( instead of pae_crc32_shard_id');

  // 3D. keyword-velocity-crawler must use pae_crc32_shard_id(
  const usesCrc32 = /pae_crc32_shard_id\s*\(/i.test(keywordCrawlerContent);
  check('Lock 3', usesCrc32, 'scripts/keyword-velocity-crawler.mjs lacks pae_crc32_shard_id deterministic sharding function');

  // =========================================================================
  // LOCK 4: Authentic Multi-Window Gains vs Fake Multiplier
  // =========================================================================
  console.log('\n[Lock 4] Verifying Authentic Rolling Multi-Window Gains...');
  const foldersServiceContent = readFile('src/modules/keywords/folders-service.mjs');

  // 4A. row.gains_7d must be read from SQL and assigned
  const readsRowGains7d = /c\.gains_7d/i.test(foldersServiceContent) && /gains_7d:\s*safeNum\(\s*row\.gains_7d/i.test(foldersServiceContent);
  check('Lock 4', readsRowGains7d, 'src/modules/keywords/folders-service.mjs does not read authentic row.gains_7d from keyword_serp_current');

  // 4B. Must not unconditionally assign Math.round(vel * 7) without row.gains_7d
  const hasRawVelMultiplierWithoutRow = /gains_7d:\s*Math\.round\(\s*(?:vel|daily_save_velocity)\s*\*\s*7\s*\)/i.test(foldersServiceContent);
  check('Lock 4', !hasRawVelMultiplierWithoutRow, 'src/modules/keywords/folders-service.mjs uses raw Math.round(vel * 7) without reading row.gains_7d');

  // 4C. top_creators must be wired in _executeFolderCrossover return
  const returnsTopCreators = /top_creators:\s*creatorMonopoly/i.test(foldersServiceContent);
  check('Lock 4', returnsTopCreators, 'src/modules/keywords/folders-service.mjs omits top_creators from _executeFolderCrossover return');

  // =========================================================================
  // LOCK 5: Breadcrumb & Untracked Creator Shield
  // =========================================================================
  console.log('\n[Lock 5] Verifying Context-Preserving Pin Navigation & Untracked Creator Shield...');
  const campaignFoldersContent = readFile('src/campaign-folders-ui.mjs');
  const dashboardContent = readFile('src/dashboard-ui.mjs');

  // 5A. Pin links in campaign-folders-ui.mjs must contain folder_id query parameter
  const pinLinkLines = campaignFoldersContent.split('\n').filter(line => line.includes("'/pins/'") || line.includes('"/pins/"'));
  const allPinLinksHaveFolderId = pinLinkLines.length > 0 && pinLinkLines.every(line => line.includes('folder_id'));
  check('Lock 5', allPinLinksHaveFolderId, "src/campaign-folders-ui.mjs contains bare '/pins/' + sp.pin_id links without folder_id parameter");

  // 5B. pin-details-ui.mjs must check /folders in document.referrer
  const checksFoldersReferrer = /refUrl\.pathname\.startsWith\(\s*['"]\/folders['"]\s*\)/.test(pinDetailsContent);
  check('Lock 5', checksFoldersReferrer, 'src/pin-details-ui.mjs fails to check /folders in document.referrer');

  // 5C. pin-details-ui.mjs must guard Tier 4 fallback with is_tracked_competitor
  const checksTrackedCompetitor = /creatorCtx\?\.is_tracked_competitor/.test(pinDetailsContent);
  check('Lock 5', checksTrackedCompetitor, 'src/pin-details-ui.mjs fails to check is_tracked_competitor in Tier 4 creator fallback');

  // 5D. dashboard-ui.mjs must guard openCreatorByHandle(...).then(...) with activeCreator
  const hasActiveCreatorGuard = /this\.openCreatorByHandle\(first,\s*['"]overview['"],\s*false\)\.then\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(!this\.activeCreator\)\s*return;/.test(dashboardContent);
  check('Lock 5', hasActiveCreatorGuard, 'src/dashboard-ui.mjs lacks if (!this.activeCreator) return; guard inside openCreatorByHandle(.then)');

  // =========================================================================
  // LOCK 6: D1 Non-Zeroing & Schema Parity
  // =========================================================================
  console.log('\n[Lock 6] Verifying D1 Non-Zeroing Defensive Coalescence & Schema Parity...');
  const workerContent = readFile('src/worker.mjs');
  const d1MetadataContent = readFile('src/modules/keywords/d1-metadata.mjs');

  // 6A. syncFolderToD1 must use COALESCE for creator_count & unique_pins_count
  const usesCoalesceCreator = /creator_count\s*=\s*COALESCE\s*\(\s*excluded\.creator_count/i.test(workerContent);
  const usesCoalesceUniquePins = /unique_pins_count\s*=\s*COALESCE\s*\(\s*excluded\.unique_pins_count/i.test(workerContent);
  check('Lock 6', usesCoalesceCreator && usesCoalesceUniquePins, 'src/worker.mjs (syncFolderToD1) lacks COALESCE protection on creator_count or unique_pins_count');

  // 6B. isFullCatalog must not default to keywords.length >= 20
  const hasDangerousFullCatalogDefault = /isFullCatalog\s*=\s*options\.isFullCatalog\s*\?\?\s*\(keywords\.length\s*>=\s*20\)/.test(workerContent);
  check('Lock 6', !hasDangerousFullCatalogDefault, 'src/worker.mjs has dangerous isFullCatalog default (keywords.length >= 20), risking catalog wipes');

  // 6C. getPinKvKeysToEvict must include v3 keys
  const hasV3Keys = workerContent.includes('pin:dossier:v3?pin_id=${pid}') && workerContent.includes('dossier:v3:pin:${pid}');
  check('Lock 6', hasV3Keys, 'src/worker.mjs (getPinKvKeysToEvict) omits v3 cache eviction keys');

  // 6D. d1-metadata.mjs must contain ALTER TABLE edge_pins_metadata ADD COLUMN metadata
  const hasAlterMetadata = /ALTER TABLE edge_pins_metadata ADD COLUMN metadata\b/i.test(d1MetadataContent);
  check('Lock 6', hasAlterMetadata, 'src/modules/keywords/d1-metadata.mjs lacks ALTER TABLE edge_pins_metadata ADD COLUMN metadata');

  // =========================================================================
  // LOCK 7: Room 3 Creator Hub & Lightweight Pulse
  // =========================================================================
  console.log('\n[Lock 7] Verifying Room 3 Creator Hub Discovery & Lightweight Pulse...');
  const serviceContent = readFile('src/modules/keywords/service.mjs');

  // 7A. filteredCompetitors must check this.creatorDiscoveryFilter
  const checksDiscoveryFilter = /this\.creatorDiscoveryFilter\s*===/i.test(dashboardContent);
  check('Lock 7', checksDiscoveryFilter, 'src/dashboard-ui.mjs (filteredCompetitors) omits this.creatorDiscoveryFilter');

  // 7B. creator-velocity-crawler must have tracking_mode === 'pulse_only' fast-path bypass
  const hasPulseOnlyBypass = /acc\.tracking_mode\s*===\s*['"]pulse_only['"]/.test(creatorCrawlerContent);
  check('Lock 7', hasPulseOnlyBypass, "scripts/creator-velocity-crawler.mjs lacks tracking_mode === 'pulse_only' fast-path bypass");

  // 7C. offloadKeywordCrawlToShards must check !isUnifiedPostgres(env)
  const checksUnifiedPostgres = /!isUnifiedPostgres\(\s*env\s*\)/.test(serviceContent);
  check('Lock 7', checksUnifiedPostgres, 'src/modules/keywords/service.mjs lacks !isUnifiedPostgres(env) guard');

  // =========================================================================
  // LOCK 8: Daily Rolling Gains Workflow Automation
  // =========================================================================
  console.log('\n[Lock 8] Verifying Daily Rolling Gains Workflow Automation...');
  const workflowContent = readFile('.github/workflows/keyword-intelligence-velocity.yml');
  const hasBackfillStep = /node\s+scripts\/backfill_rolling_window_gains\.mjs/.test(workflowContent);
  check('Lock 8', hasBackfillStep, '.github/workflows/keyword-intelligence-velocity.yml omits node scripts/backfill_rolling_window_gains.mjs');

  // =========================================================================
  // LOCK 9: Window-Aware Competitor Audience Gains
  // =========================================================================
  console.log('\n[Lock 9] Verifying Window-Aware Competitor Audience Gains...');
  const checksSelectedTimeWindow = /clusterCompetitorAudienceGains[\s\S]*?this\.selectedTimeWindow/.test(campaignFoldersContent);
  const usesMathMaxClamping = /clusterCompetitorAudienceGains[\s\S]*?Math\.max\(\s*0\s*,/.test(campaignFoldersContent);
  check('Lock 9', checksSelectedTimeWindow && usesMathMaxClamping, 'src/campaign-folders-ui.mjs (clusterCompetitorAudienceGains) omits this.selectedTimeWindow or Math.max(0, clamping');

  // =========================================================================
  // LOCK 10: Room 3 Single-Creator SERP Track Fallback
  // =========================================================================
  console.log('\n[Lock 10] Verifying Room 3 Single-Creator SERP Track Fallback...');
  const routesKeywordsContent = readFile('src/routes/keywords.mjs');
  const dashboardServerContent = readFile('scripts/dashboard.mjs');

  const routesHasToggleFallback = /\/api\/folders\/:id\/creators[\s\S]*?toggleFolderCreatorTracking/i.test(routesKeywordsContent);
  check('Lock 10', routesHasToggleFallback, 'src/routes/keywords.mjs lacks toggleFolderCreatorTracking fallback in POST /api/folders/:id/creators');

  const dashboardHasToggleFallback = /\/api\/folders\/:id\/creators[\s\S]*?toggleFolderCreatorTracking/i.test(dashboardServerContent);
  check('Lock 10', dashboardHasToggleFallback, 'scripts/dashboard.mjs lacks toggleFolderCreatorTracking fallback in POST /api/folders/:id/creators');

  // =========================================================================
  // LOCK 11: Domain Studio -> /accounts Hydration & Crawler BigInt Parity
  // =========================================================================
  console.log('\n[Lock 11] Verifying /accounts Query Param Hydration & BigInt Parity...');
  const crawlerEngineContent = readFile('scripts/crawler-engine.mjs');

  const parsesCreatorParam = /URLSearchParams\(\s*window\.location\.search[\s\S]*?['"]creator['"]/.test(dashboardContent);
  check('Lock 11', parsesCreatorParam, "src/dashboard-ui.mjs (initDashboard) omits URLSearchParams(window.location.search parsing for 'creator'");

  const hasIntCastSaves = /(?:COALESCE\s*\(\s*x\.saves|(?:x\.)?saves|save_count)[^;\n]*?::int\b/i.test(crawlerEngineContent);
  const hasIntCastRepins = /(?:COALESCE\s*\(\s*x\.repins|(?:x\.)?repins|repin_count)[^;\n]*?::int\b/i.test(crawlerEngineContent);
  check('Lock 11', !hasIntCastSaves && !hasIntCastRepins, 'scripts/crawler-engine.mjs contains unsafe x.saves::int or x.repins::int (must be ::bigint)');

  // =========================================================================
  // LOCK 12: Auto-Promote Pulse Breakout & Composite Shard Migration 041
  // =========================================================================
  console.log('\n[Lock 12] Verifying Auto-Promote Pulse Breakout & Migration 041...');
  const migration041Exists = fs.existsSync(path.join(ROOT_DIR, 'scripts/migrations/041_composite_shard_indexes.sql'));

  const hasAutoPromoteThreshold = creatorCrawlerContent.includes('AUTO_PROMOTE_PULSE_DELTA_24H');
  check('Lock 12', hasAutoPromoteThreshold, 'scripts/creator-velocity-crawler.mjs lacks AUTO_PROMOTE_PULSE_DELTA_24H constant');

  const hasBreakoutBabyFilter = campaignFoldersContent.includes('onlyBreakoutBabyDomains');
  const hasVacuumFilter = campaignFoldersContent.includes('onlyVacuumPins');
  check('Lock 12', hasBreakoutBabyFilter && hasVacuumFilter, 'src/campaign-folders-ui.mjs lacks onlyBreakoutBabyDomains or onlyVacuumPins filter state');

  check('Lock 12', migration041Exists, 'scripts/migrations/041_composite_shard_indexes.sql does not exist');

} catch (e) {
  errors.push(`Unexpected Gate Script Error: ${e.message}\n${e.stack}`);
  console.error(`💥 Execution failure:`, e);
}

const elapsed = (performance.now() - startTime).toFixed(1);

console.log('\n' + '='.repeat(80));
if (errors.length === 0) {
  console.log(`🎉 ALL 12 ARCHITECTURAL REGRESSION LOCKS VERIFIED CLEAN (Elapsed: ${elapsed}ms < 1000ms SLA)`);
  console.log('='.repeat(80));
  process.exit(0);
} else {
  console.error(`⛔ REGRESSION GATE VETO: ${errors.length} LOCK(S) BROKEN (Elapsed: ${elapsed}ms):`);
  errors.forEach(err => console.error(`  - ${err}`));
  console.log('='.repeat(80));
  process.exit(1);
}
