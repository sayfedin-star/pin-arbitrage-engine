#!/usr/bin/env node

/**
 * scripts/verify_regression_locks.mjs
 *
 * Automated Architectural Regression Gate
 * Fast (< 1s), zero-dependency automated verification script that inspects the
 * codebase and exits with code 1 if ANY of the 14 permanent architectural regression locks regress.
 *
 * Enforces Invariants 32–42 + Unified PostgreSQL SSOT (Post-Migration 058):
 * - Lock 1: Room 1–5 Sibling DOM Hierarchy & Unclipped Workspace Header
 * - Lock 2: Pin Dossier Timeframe & SERP Badge Integrity
 * - Lock 3: Unified Single-DB SSOT, MD5 Work Partitioning & Zero Neon/Sharding Footprint
 * - Lock 4: Authentic Rolling Multi-Window Gains vs Fake Multiplier
 * - Lock 5: Context-Preserving Pin Navigation & Untracked Creator Shield
 * - Lock 6: Pure Unified PostgreSQL Architecture, Zero Cloudflare/D1/KV/Dual-Write Footprint
 * - Lock 7: Room 3 Creator Hub Discovery & Lightweight SERP Creator Pulse
 * - Lock 8: Daily Rolling Gains Workflow Automation
 * - Lock 9: Window-Aware Competitor Audience Gains
 * - Lock 10: Room 3 Single-Creator SERP Track Fallback
 * - Lock 11: Domain Studio -> /accounts Query Param Hydration & Crawler BigInt Parity
 * - Lock 12: Auto-Promote Pulse Breakout & Composite Index Migration 041
 * - Lock 13: Invariant & Memory Documentation Parity Gate
 * - Lock 14: Hidden Endpoints Parity, 1200x Media Waterfall, Deep UTM/Entity Sanitization & LND-801..824 Shields
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

function readFiles(relPaths) {
  return relPaths.map(readFile).join('\n');
}

function listMjsFiles(relDir) {
  const dirPath = path.join(ROOT_DIR, relDir);
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const rel = path.join(relDir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scratch') continue;
      results.push(...listMjsFiles(rel));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      results.push(rel);
    }
  }
  return results;
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
  } catch (_) {
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
  const pinDetailsContent = readFiles([
    'src/pin-details-ui.mjs',
    'src/ui/pin-details/styles.mjs',
    'src/ui/pin-details/page-template.mjs',
    'src/ui/pin-details/client-app.mjs'
  ]);
  const mathContent = readFile('src/lib/math.mjs');

  // 2A. Default timeframe must be '7d'
  const hasDefault7d = /chartTimeframe:\s*['"]7d['"]/.test(pinDetailsContent);
  check('Lock 2', hasDefault7d, "src/ui/pin-details/* changed default chartTimeframe away from '7d'");

  // 2B. Must include '15d' timeframe
  const has15d = /['"]15d['"]/.test(pinDetailsContent);
  check('Lock 2', has15d, "src/ui/pin-details/* omits '15d' timeframe support");

  // 2C. Must contain isKeywordDisplacedOrUnranked
  const hasDisplacedHelper = /isKeywordDisplacedOrUnranked\s*\(/.test(pinDetailsContent);
  check('Lock 2', hasDisplacedHelper, 'src/ui/pin-details/* lacks isKeywordDisplacedOrUnranked helper');

  // 2D. Must contain detectHydrationJump
  const hasHydrationJump = /export function detectHydrationJump\s*\(/.test(mathContent);
  check('Lock 2', hasHydrationJump, 'src/lib/math.mjs lacks detectHydrationJump function');

  // 2E. Must contain sanitizeDossierTrajectory
  const hasSanitizeDossier = /export function sanitizeDossierTrajectory\s*\(/.test(mathContent);
  check('Lock 2', hasSanitizeDossier, 'src/lib/math.mjs lacks sanitizeDossierTrajectory function');

  // =========================================================================
  // LOCK 3: Unified Single-DB SSOT, MD5 Work Partitioning & Zero Neon/Sharding Footprint
  // =========================================================================
  console.log('\n[Lock 3] Verifying Unified Single-DB SSOT, Clean Repository Wiring & Zero Legacy Sharding...');
  const creatorCrawlerContent = readFile('scripts/creator-velocity-crawler.mjs');
  const keywordCrawlerContent = readFile('scripts/keyword-velocity-crawler.mjs');
  const clusterCrawlerContent = readFile('scripts/cluster-intelligence.mjs');
  const pkgJsonContent = readFile('package.json');
  const serverContent = readFile('src/server.mjs');
  const apiRoutesContent = readFile('src/plugins/api-routes.mjs');
  const pinsRouteContent = readFile('src/routes/pins.mjs');
  const serviceKeywordsContent = readFile('src/modules/keywords/service.mjs');
  const serviceCreatorsContent = readFiles([
    'src/modules/creators/service.mjs',
    'src/modules/creators/competitors-crud.mjs',
    'src/modules/creators/creator-ingest.mjs',
    'src/modules/creators/boards-service.mjs',
    'src/modules/creators/creator-analytics.mjs'
  ]);

  // 3A. Crawlers must NOT reference dropped shard_id column or pae_crc32_shard_id SQL function
  const hasDroppedShardSqlInCrawlers = (
    /\b(?:cp|p|ksc|kdi|f|g)\.shard_id\b/i.test(creatorCrawlerContent) ||
    /\b(?:cp|p|ksc|kdi|f|g)\.shard_id\b/i.test(keywordCrawlerContent) ||
    /\bshard_id\s*=\s*ANY/i.test(creatorCrawlerContent) ||
    /\bshard_id\s*=\s*ANY/i.test(keywordCrawlerContent) ||
    /\bpae_crc32_shard_id\s*\(/i.test(creatorCrawlerContent) ||
    /\bpae_crc32_shard_id\s*\(/i.test(keywordCrawlerContent) ||
    /\bpae_crc32_shard_id\s*\(/i.test(clusterCrawlerContent)
  );
  check('Lock 3', !hasDroppedShardSqlInCrawlers, 'Crawlers still reference dropped shard_id column or pae_crc32_shard_id SQL function (conflicts with Migration 052)');

  // 3B. Crawlers must partition work using native PostgreSQL MD5 modulo
  const usesMd5ModuloPartition = (
    /SUBSTR\(MD5\(.*pin_id/i.test(creatorCrawlerContent) &&
    /SUBSTR\(MD5\(.*pin_id/i.test(keywordCrawlerContent) &&
    /SUBSTR\(MD5\(.*pin_id/i.test(clusterCrawlerContent)
  );
  check('Lock 3', usesMd5ModuloPartition, 'Crawlers are missing deterministic SUBSTR(MD5(pin_id::text), 1, 8) runner partitioning');

  // 3C. keyword-velocity-crawler must NOT use hashtext(
  const usesHashtext = /hashtext\s*\(/i.test(keywordCrawlerContent);
  check('Lock 3', !usesHashtext, 'scripts/keyword-velocity-crawler.mjs uses banned hashtext(');

  const dbClientContent = readFile('src/db/client.mjs');
  const pinRepoContent = readFile('src/modules/pins/repository.mjs');

  // 3D. Zero @neondatabase/serverless, @cloudflare/, or legacy sharding/dual-write imports across src/ and scripts/
  const allRuntimeFiles = [
    ...listMjsFiles('src'),
    ...listMjsFiles('scripts').filter(f => !path.basename(f).startsWith('test_') && path.normalize(f) !== path.normalize('scripts/verify_regression_locks.mjs'))
  ];
  const forbiddenPatterns = [
    /@neondatabase\/serverless/,
    /@cloudflare\//,
    /\bPIN_ENGINE_KV\b/,
    /\bPIN_D1_DB\b/,
    /\bcaches\.default\b/,
    /\bcreateHyperdriveClient\b/,
    /\bd1-metadata(?:\.mjs)?\b/,
    /\bfleet-router(?:\.mjs)?\b/,
    /\bresolveShardConnection\b/,
    /\bpae_crc32_shard_id\b/,
    /src\/worker\.mjs/,
    /\bisUnifiedPostgres\b/
  ];
  const legacyViolations = [];
  for (const relFile of allRuntimeFiles) {
    const fileText = readFile(relFile);
    for (const pat of forbiddenPatterns) {
      if (pat.test(fileText)) {
        legacyViolations.push(`${relFile} matches ${pat}`);
      }
    }
  }
  const hasNeonInPkg = pkgJsonContent.includes('@neondatabase/serverless');
  check(
    'Lock 3',
    !hasNeonInPkg && legacyViolations.length === 0,
    hasNeonInPkg
      ? 'package.json must not depend on @neondatabase/serverless'
      : `Legacy Cloudflare/Neon/Sharding symbols reintroduced: ${legacyViolations.slice(0, 5).join('; ')}`
  );

  // 3E. src/db/client.mjs must be imported and wired into server.mjs and api-routes.mjs
  const dbClientWired = (
    dbClientContent.includes('createSqlClient') &&
    dbClientContent.includes('getSqlClient') &&
    serverContent.includes("from './db/client.mjs'") &&
    apiRoutesContent.includes("from '../db/client.mjs'")
  );
  check('Lock 3', dbClientWired, 'src/db/client.mjs is not actively imported and wired into src/server.mjs and src/plugins/api-routes.mjs');

  // 3F. src/modules/pins/repository.mjs must be imported and wired across routes, services, and crawlers
  const pinRepoWired = (
    pinsRouteContent.includes('getPinDossier') &&
    serviceKeywordsContent.includes('insertNewPinsBatch') &&
    serviceKeywordsContent.includes('resavePinsMetricsBatch') &&
    serviceCreatorsContent.includes('insertNewPinsBatch') &&
    keywordCrawlerContent.includes('insertNewPinsBatch') &&
    keywordCrawlerContent.includes('resavePinsMetricsBatch')
  );
  check('Lock 3', pinRepoWired, 'src/modules/pins/repository.mjs (insertNewPinsBatch, resavePinsMetricsBatch, getPinDossier) is not wired across routes, services, and crawlers');

  // =========================================================================
  // LOCK 4: Authentic Multi-Window Gains vs Fake Multiplier
  // =========================================================================
  console.log('\n[Lock 4] Verifying Authentic Rolling Multi-Window Gains...');
  const foldersServiceContent = readFiles([
    'src/modules/keywords/folders-service.mjs',
    'src/modules/keywords/folders-crud.mjs',
    'src/modules/keywords/folders-crossover.mjs'
  ]);

  // 4A. row.gains_7d must be read from SQL and assigned
  const readsRowGains7d = /c\.gains_7d/i.test(foldersServiceContent) && /gains_7d:\s*safeNum\(\s*row\.gains_7d/i.test(foldersServiceContent);
  check('Lock 4', readsRowGains7d, 'src/modules/keywords/folders-*.mjs does not read authentic row.gains_7d from keyword_serp_current');

  // 4B. Must not unconditionally assign Math.round(vel * 7) without row.gains_7d
  const hasRawVelMultiplierWithoutRow = /gains_7d:\s*Math\.round\(\s*(?:vel|daily_save_velocity)\s*\*\s*7\s*\)/i.test(foldersServiceContent);
  check('Lock 4', !hasRawVelMultiplierWithoutRow, 'src/modules/keywords/folders-*.mjs uses raw Math.round(vel * 7) without reading row.gains_7d');

  // 4C. top_creators must be wired in _executeFolderCrossover return
  const returnsTopCreators = /top_creators:\s*creatorMonopoly/i.test(foldersServiceContent);
  check('Lock 4', returnsTopCreators, 'src/modules/keywords/folders-*.mjs omits top_creators from _executeFolderCrossover return');

  // 4D. folders-crossover.mjs must hydrate displaced Vault pins from Unified PostgreSQL with aspect_ratio projection and pin_age_days recomputation
  const foldersHydratesVault = (
    foldersServiceContent.includes('FROM universal_master_pins') &&
    foldersServiceContent.includes('isSyntheticPinTitle') &&
    (foldersServiceContent.includes(':crossover:v5') || foldersServiceContent.includes(':crossover:v4') || foldersServiceContent.includes(':crossover:v3')) &&
    foldersServiceContent.includes("(ump.metadata->>'aspect_ratio') AS aspect_ratio") &&
    /if\s*\(\s*!p\.created_at_pinterest\s*&&\s*meta\.created_at_pinterest\s*\)\s*\{[\s\S]*?p\.pin_age_days\s*=\s*Math\.max/.test(foldersServiceContent)
  );
  check('Lock 4', foldersHydratesVault, 'src/modules/keywords/folders-*.mjs is missing unified universal_master_pins hydration, aspect_ratio projection, or pin_age_days recomputation');

  // =========================================================================
  // LOCK 5: Breadcrumb & Untracked Creator Shield
  // =========================================================================
  console.log('\n[Lock 5] Verifying Context-Preserving Pin Navigation & Untracked Creator Shield...');
  const campaignFoldersContent = readFiles([
    'src/campaign-folders-ui.mjs',
    ...listMjsFiles('src/ui/folders')
  ]);
  const dashboardContent = readFiles([
    'src/dashboard-ui.mjs',
    ...listMjsFiles('src/ui/dashboard'),
    'src/ui/dashboard-modals.mjs'
  ]);

  // 5A. Pin links in campaign-folders-ui.mjs must contain folder_id query parameter
  const pinLinkLines = campaignFoldersContent.split('\n').filter(line => line.includes("'/pins/'") || line.includes('"/pins/"'));
  const allPinLinksHaveFolderId = pinLinkLines.length > 0 && pinLinkLines.every(line => line.includes('folder_id'));
  check('Lock 5', allPinLinksHaveFolderId, "src/campaign-folders-ui.mjs contains bare '/pins/' + sp.pin_id links without folder_id parameter");

  // 5B. pin-details UI must check /folders in document.referrer
  const checksFoldersReferrer = /refUrl\.pathname\.startsWith\(\s*['"]\/folders['"]\s*\)/.test(pinDetailsContent);
  check('Lock 5', checksFoldersReferrer, 'src/ui/pin-details/* fails to check /folders in document.referrer');

  // 5C. pin-details UI must guard Tier 4 fallback with is_tracked_competitor
  const checksTrackedCompetitor = /creatorCtx\?\.is_tracked_competitor/.test(pinDetailsContent);
  check('Lock 5', checksTrackedCompetitor, 'src/ui/pin-details/* fails to check is_tracked_competitor in Tier 4 creator fallback');

  // 5D. dashboard-ui.mjs must guard openCreatorByHandle(...).then(...) with activeCreator
  const hasActiveCreatorGuard = /this\.openCreatorByHandle\(first,\s*['"]overview['"],\s*false\)\.then\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(!this\.activeCreator\)\s*return;/.test(dashboardContent);
  check('Lock 5', hasActiveCreatorGuard, 'src/dashboard-ui.mjs lacks if (!this.activeCreator) return; guard inside openCreatorByHandle(.then)');

  // 5E. campaign-folders-ui.mjs must contain zero dead via.placeholder.com URLs
  const hasDeadPlaceholder = campaignFoldersContent.includes('via.placeholder.com');
  check('Lock 5', !hasDeadPlaceholder, 'src/campaign-folders-ui.mjs contains dead via.placeholder.com URL');

  // =========================================================================
  // LOCK 6: Pure Unified PostgreSQL Architecture & Zero Cloudflare/Dual-Write Footprint
  // =========================================================================
  console.log('\n[Lock 6] Verifying Pure Unified PostgreSQL SSOT & Zero Cloudflare/Dual-Write Footprint...');
  const deletedLegacyFilesExist = (
    fs.existsSync(path.join(ROOT_DIR, 'src/worker.mjs')) ||
    fs.existsSync(path.join(ROOT_DIR, 'src/modules/keywords/d1-metadata.mjs')) ||
    fs.existsSync(path.join(ROOT_DIR, 'src/modules/sharding/fleet-router.mjs')) ||
    fs.existsSync(path.join(ROOT_DIR, 'src/routes/fleet.mjs')) ||
    fs.existsSync(path.join(ROOT_DIR, 'src/modules/fleet/service.mjs'))
  );
  const migration058Exists = fs.existsSync(path.join(ROOT_DIR, 'scripts/migrations/058_phase4_ssot_compaction_and_cleanup.sql'));
  check('Lock 6', !deletedLegacyFilesExist && migration058Exists, 'Legacy worker/d1/sharding files must remain deleted and Migration 058 must be present');

  // 6B. Verify syncPinAcrossAllFourPillars does NOT dual-write heavy creative columns (description/alt_text) into competitor_pins or pa_pins
  const compUpdateMatch = pinRepoContent.match(/UPDATE competitor_pins\s+SET([\s\S]*?)WHERE pin_id =/);
  const paUpdateMatch = pinRepoContent.match(/UPDATE pa_pins\s+SET([\s\S]*?)WHERE pin_id =/);
  const hasCreativeDualWrite = (
    (compUpdateMatch && /\b(?:description|alt_text)\s*=/.test(compUpdateMatch[1])) ||
    (paUpdateMatch && /\b(?:description|alt_text)\s*=/.test(paUpdateMatch[1]))
  );
  check('Lock 6', !hasCreativeDualWrite, 'PinRepository.syncPinAcrossAllFourPillars must not dual-write description/alt_text into competitor_pins or pa_pins (SSOT is universal_master_pins)');

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

  // 7C. keywords/service.mjs must hydrate displaced pins directly from Unified PostgreSQL
  const usesUnifiedDisplacedHydration = (
    /hydrateDisplacedPinsMetadata/.test(serviceContent) &&
    !/resolveShardConnection/.test(serviceContent)
  );
  check('Lock 7', usesUnifiedDisplacedHydration, 'src/modules/keywords/service.mjs must use hydrateDisplacedPinsMetadata without legacy shard routing');

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

  const routesHasToggleFallback = /\/api\/folders\/:id\/creators[\s\S]*?toggleFolderCreatorTracking/i.test(routesKeywordsContent);
  check('Lock 10', routesHasToggleFallback, 'src/routes/keywords.mjs lacks toggleFolderCreatorTracking fallback in POST /api/folders/:id/creators');

  const duplicateDashboardDeleted = !fs.existsSync(path.join(ROOT_DIR, 'scripts/dashboard.mjs'));
  check('Lock 10', duplicateDashboardDeleted, 'scripts/dashboard.mjs duplicate server must remain deleted (Unified server is src/server.mjs)');

  // =========================================================================
  // LOCK 11: Domain Studio -> /accounts Hydration & Crawler BigInt Parity
  // =========================================================================
  console.log('\n[Lock 11] Verifying /accounts Query Param Hydration & BigInt Parity...');
  const parsesCreatorParam = /URLSearchParams\(\s*window\.location\.search[\s\S]*?['"]creator['"]/.test(dashboardContent);
  check('Lock 11', parsesCreatorParam, "src/dashboard-ui.mjs (initDashboard) omits URLSearchParams(window.location.search parsing for 'creator'");

  // Behavioral contract: all active ingestion paths must cast save counts as ::bigint (never ::int)
  const activeCreatorsIntCast = /(?:COALESCE\s*\(\s*x\.save_count|(?:x\.)?save_count|EXCLUDED\.save_count)[^;\n,]*?::int\b/i.test(creatorCrawlerContent) ||
    /(?:COALESCE\s*\(\s*x\.save_count|(?:x\.)?save_count|EXCLUDED\.save_count)[^;\n,]*?::int\b/i.test(pinRepoContent);
  check('Lock 11', !activeCreatorsIntCast, 'Active pin ingestion SQL contains unsafe ::int cast on save_count/saves (must be ::bigint)');

  // =========================================================================
  // LOCK 12: Auto-Promote Pulse Breakout & Composite Index Migration 041
  // =========================================================================
  console.log('\n[Lock 12] Verifying Auto-Promote Pulse Breakout & Migration 041...');
  const migration041Exists = fs.existsSync(path.join(ROOT_DIR, 'scripts/migrations/041_composite_shard_indexes.sql'));

  const hasAutoPromoteThreshold = creatorCrawlerContent.includes('AUTO_PROMOTE_PULSE_DELTA_24H');
  check('Lock 12', hasAutoPromoteThreshold, 'scripts/creator-velocity-crawler.mjs lacks AUTO_PROMOTE_PULSE_DELTA_24H constant');

  const hasBreakoutBabyFilter = campaignFoldersContent.includes('onlyBreakoutBabyDomains');
  const hasVacuumFilter = campaignFoldersContent.includes('onlyVacuumPins');
  check('Lock 12', hasBreakoutBabyFilter && hasVacuumFilter, 'src/campaign-folders-ui.mjs lacks onlyBreakoutBabyDomains or onlyVacuumPins filter state');

  check('Lock 12', migration041Exists, 'scripts/migrations/041_composite_shard_indexes.sql does not exist');

  // =========================================================================
  // LOCK 13: Invariant & Memory Documentation Parity Gate
  // =========================================================================
  console.log('\n[Lock 13] Verifying Invariant & Memory Documentation Parity...');

  // 13A. project-invariants.md must contain trigger: always_on and sections ## 32. through ## 42.
  const invariantsContent = readFile('.agents/rules/project-invariants.md');
  const invariantsHasAlwaysOn = /trigger:\s*always_on/.test(invariantsContent);
  const requiredSections = [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  const missingSections = requiredSections.filter(num => !new RegExp(`^##\\s+${num}\\.`, 'm').test(invariantsContent));
  const hasAllRequiredSections = missingSections.length === 0;

  check(
    'Lock 13',
    invariantsHasAlwaysOn && hasAllRequiredSections,
    `.agents/rules/project-invariants.md is missing ${!invariantsHasAlwaysOn ? 'trigger: always_on' : ''}${!invariantsHasAlwaysOn && !hasAllRequiredSections ? ' and ' : ''}${!hasAllRequiredSections ? `sections: ${missingSections.map(n => `## ${n}.`).join(', ')}` : ''}`.trim()
  );

  // 13B. beacon-autonomous-memory.md and lessons-learned-ledger.md must start with trigger: always_on
  const beaconPath = path.join(ROOT_DIR, '.agents/rules/beacon-autonomous-memory.md');
  const beaconExists = fs.existsSync(beaconPath);
  const beaconContent = beaconExists ? fs.readFileSync(beaconPath, 'utf8') : '';
  const beaconStartsAlwaysOn = /^\s*---\s*[\r\n]+[\s\S]*?trigger:\s*always_on[\s\S]*?[\r\n]+---/m.test(beaconContent) || /^\s*trigger:\s*always_on/m.test(beaconContent);

  const ledgerPath = path.join(ROOT_DIR, '.agents/rules/lessons-learned-ledger.md');
  const ledgerExists = fs.existsSync(ledgerPath);
  const ledgerContent = ledgerExists ? fs.readFileSync(ledgerPath, 'utf8') : '';
  const ledgerStartsAlwaysOn = /^\s*---\s*[\r\n]+[\s\S]*?trigger:\s*always_on[\s\S]*?[\r\n]+---/m.test(ledgerContent) || /^\s*trigger:\s*always_on/m.test(ledgerContent);

  const memoryRulesValid = beaconExists && beaconStartsAlwaysOn && ledgerExists && ledgerStartsAlwaysOn;
  check(
    'Lock 13',
    memoryRulesValid,
    `Memory rules frontmatter invalid: ${!beaconExists ? '.agents/rules/beacon-autonomous-memory.md missing' : !beaconStartsAlwaysOn ? '.agents/rules/beacon-autonomous-memory.md does not start with trigger: always_on' : ''} ${!ledgerExists ? '.agents/rules/lessons-learned-ledger.md missing' : !ledgerStartsAlwaysOn ? '.agents/rules/lessons-learned-ledger.md does not start with trigger: always_on' : ''}`.trim()
  );

  // 13C. Verify count of locks enforced in verify_regression_locks.mjs matches documented ledger (14 locks)
  const selfContent = readFile('scripts/verify_regression_locks.mjs');
  const documentedLocks = [...selfContent.matchAll(/\*\s*-\s*Lock\s+(\d+):/g)].map(m => Number(m[1]));
  const implementedLocks = [...selfContent.matchAll(/\/\/\s*LOCK\s+(\d+):/gi)].map(m => Number(m[1]));
  const checkedLocks = [...new Set([...selfContent.matchAll(/check\(\s*['"]Lock\s+(\d+)['"]/gi)].map(m => Number(m[1])))].sort((a, b) => a - b);

  const expectedLockCount = 14;
  const lockCountMatches = (
    documentedLocks.length === expectedLockCount &&
    implementedLocks.length === expectedLockCount &&
    checkedLocks.length === expectedLockCount &&
    checkedLocks.every((num, idx) => num === idx + 1)
  );

  check(
    'Lock 13',
    lockCountMatches,
    `Lock count mismatch in scripts/verify_regression_locks.mjs: documented=${documentedLocks.length}, implemented=${implementedLocks.length}, checked=${checkedLocks.length} (expected ${expectedLockCount} consecutive locks)`
  );

  // =========================================================================
  // LOCK 14: Hidden Endpoints Parity, 1200x Media Waterfall, Deep UTM/Entity Sanitization & LND-801..824 Shields
  // =========================================================================
  console.log('\n[Lock 14] Verifying Hidden Endpoints Parity, 1200x Media Waterfall & LND-801..824 Shields...');

  // 14A. Behavioral verification of Pinterest hidden endpoints, guest scraping & User-Agent
  const pinterestScraperContent = [
    readFile('scripts/lib/pinterest.mjs'),
    readFile('src/core/pinterest/urls.mjs'),
    readFile('src/core/pinterest/pins.mjs'),
    readFile('src/core/pinterest/creators.mjs')
  ].join('\n');
  const pinterestMod = await import('../scripts/lib/pinterest.mjs');
  const hasHiddenScraperEndpoints = (
    typeof pinterestMod.fetchPinsBatchFromPidgets === 'function' &&
    typeof pinterestMod.fetchUrlGlobalSaves === 'function' &&
    typeof pinterestMod.fetchCreatorLatestPinsPidgets === 'function' &&
    typeof pinterestMod.resolvePinterestShortlink === 'function' &&
    typeof pinterestMod.fetchBoardSectionsResource === 'function' &&
    typeof pinterestMod.canonicalizeArticleUrlForCount === 'function' &&
    pinterestMod.canonicalizeArticleUrlForCount('https://example.com/post?utm_source=pinterest&amp;id=1#frag') === 'https://example.com/post?id=1' &&
    pinterestScraperContent.includes('Chrome/131.0.0.0')
  );
  check(
    'Lock 14',
    hasHiddenScraperEndpoints,
    'scripts/lib/pinterest.mjs failed behavioral contract for hidden endpoints, URL canonicalization, or Chrome/131.0.0.0 User-Agent'
  );

  // 14B. Keywords service batch Pidgets velocity calculation and deadlock-free ordering + Auth & Barrier Security Contracts
  const keywordsServiceContent = readFile('src/modules/keywords/service.mjs');
  const securityHttpContent = readFile('src/http/security-and-response.mjs');
  const hasKeywordServiceGuards = (
    keywordsServiceContent.includes('calculateDailyVelocity') &&
    keywordsServiceContent.includes('fetchPinsBatchFromPidgets') &&
    keywordsServiceContent.includes('ORDER BY u.pin_id ASC') &&
    !apiRoutesContent.includes("pathname !== '/api/urls/batch-global-saves'") &&
    !securityHttpContent.includes("pathname !== '/api/urls/batch-global-saves'") &&
    keywordCrawlerContent.includes('phase1a_completed_token')
  );
  check(
    'Lock 14',
    hasKeywordServiceGuards,
    'Missing calculateDailyVelocity / ORDER BY u.pin_id ASC in keywords/service.mjs, secure auth on batch-global-saves, or phase1a_completed_token barrier in keyword-velocity-crawler.mjs'
  );

  // 14C. Defensive rolling gains coalescence & Migration 057 SARGable clean_domain index contract
  const backfillGainsContent = readFile('scripts/backfill_rolling_window_gains.mjs');
  const migration057Exists = fs.existsSync(path.join(ROOT_DIR, 'scripts/migrations/057_pa_pins_clean_domain_and_indexes.sql'));
  const hasDefensiveGainsCoalescence = (
    backfillGainsContent.includes('COALESCE(u.gains_7d, 0)') &&
    !backfillGainsContent.includes('computedDeltas.set(pinId, { pin_id: pinId, delta_repins_24h: 0, gains_5d: 0, gains_7d: 0') &&
    migration057Exists
  );
  check(
    'Lock 14',
    hasDefensiveGainsCoalescence,
    'scripts/backfill_rolling_window_gains.mjs is missing defensive gains_7d coalescence / Migration 057 clean_domain index'
  );

  // 14D. Frontend domains AbortController and deep-link query hydration + SARGable clean_domain
  const domainsUiContent = readFile('src/domains-ui.mjs');
  const domainsClientAppContent = readFile('src/ui/domains/domains-client-app.mjs');
  const domainsUiBundle = `${domainsUiContent}\n${domainsClientAppContent}`;
  const domainsServiceContent = readFile('src/modules/domains/service.mjs');
  const hasDomainsGuards = (
    domainsUiBundle.includes('_loadDomainsAbortController') &&
    domainsUiBundle.includes('window.location.search') &&
    domainsUiBundle.includes('URLSearchParams') &&
    !domainsServiceContent.includes('LOWER(TRIM(pa.domain))') &&
    !domainsServiceContent.includes('LOWER(TRIM(cp.link_domain))')
  );
  check(
    'Lock 14',
    hasDomainsGuards,
    'src/domains-ui.mjs or src/modules/domains/service.mjs failed AbortController, query hydration, or SARGable clean_domain contract'
  );

  // 14E. Dashboard UI string creator handle fallback and windowed pagination
  const dashboardUiContent = dashboardContent;
  const hasDashboardUiGuards = (
    dashboardUiContent.includes('assignCreatorToFolder') &&
    dashboardUiContent.includes('cleanUsername') &&
    dashboardUiContent.includes('paginatedCompetitors') &&
    dashboardUiContent.includes('totalCompetitorPages')
  );
  check(
    'Lock 14',
    hasDashboardUiGuards,
    'src/ui/dashboard/* is missing string creator handle resolution in assignCreatorToFolder or paginatedCompetitors'
  );

  // 14F. Zero Arabic character residue in dashboard modals
  const dashboardModalsContent = readFile('src/ui/dashboard-modals.mjs');
  const arabicMatches = dashboardModalsContent.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  const isZeroArabic = !arabicMatches || arabicMatches.length === 0;
  check(
    'Lock 14',
    isZeroArabic,
    `src/ui/dashboard-modals.mjs contains ${arabicMatches ? arabicMatches.length : 0} residual Arabic characters (LND-823)`
  );

  // 14G. Round 30 & Round 31 Anti-Scattering, Anti-Conflation, Anti-Compounding & Unified Single-DB Anti-Lock Shields
  const clusterServiceContent = readFile('src/modules/cluster/service.mjs');
  const pulseServiceContent = readFile('src/modules/pulse/service.mjs');
  const hasUnifiedClientAndRepo = (
    fs.existsSync(path.join(ROOT_DIR, 'src/db/client.mjs')) &&
    fs.existsSync(path.join(ROOT_DIR, 'src/modules/pins/repository.mjs')) &&
    fs.existsSync(path.join(ROOT_DIR, 'scripts/migrations/052_unified_clean_schema_ssot.sql'))
  );
  const antiScatteringGuards = (
    hasUnifiedClientAndRepo &&
    pinterestScraperContent.includes('has_explicit_saves:') &&
    !pinterestScraperContent.includes('canonicalPin?.saveCount') &&
    keywordCrawlerContent.includes('gains.daily_save_velocity') &&
    !keywordCrawlerContent.includes('gains.delta_saves_24h') &&
    !keywordCrawlerContent.includes('todayPrev.daily_save_velocity || 0) + intradayAdd') &&
    !keywordsServiceContent.includes('item?.aggregated_pin_data?.aggregated_stats?.saves || item.save_count || item.repin_count') &&
    !clusterServiceContent.includes('p.aggregated_pin_data?.aggregated_stats?.saves ?? (p.repin_count || 0)') &&
    !pinRepoContent.includes('existingPositiveVelocity + intradayStepGain') &&
    !pinRepoContent.includes('save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0))') &&
    !pinRepoContent.includes('runningMaxSaves') &&
    !pinRepoContent.includes('shouldBackfillUnified') &&
    !pulseServiceContent.includes('_warmupPins') &&
    !pulseServiceContent.includes('GREATEST(COALESCE(ksc.save_count, 0), COALESCE(ump.save_count, 0))') &&
    !domainsServiceContent.includes('GREATEST(COALESCE(ksc.save_count, 0), COALESCE(ump.save_count, 0))') &&
    !creatorCrawlerContent.includes('GREATEST(pins_daily_metrics.save_count') &&
    !creatorCrawlerContent.includes('GREATEST(p.saves') &&
    !keywordsServiceContent.includes('GREATEST(pins_daily_metrics.save_count')
  );
  check(
    'Lock 14',
    antiScatteringGuards,
    'Round 30/31 regression: detected save/repin conflation, gains.delta_saves_24h typo, intraday velocity compounding, runningMaxSaves ratchet, GREATEST save_count lock, or missing unified DB modules'
  );
} catch (e) {
  errors.push(`Unexpected Gate Script Error: ${e.message}\n${e.stack}`);
  console.error('💥 Execution failure:', e);
}

const elapsed = (performance.now() - startTime).toFixed(1);

console.log('\n' + '='.repeat(80));
if (errors.length === 0) {
  console.log(`🎉 ALL 14 ARCHITECTURAL REGRESSION LOCKS VERIFIED CLEAN (Elapsed: ${elapsed}ms < 1000ms SLA)`);
  console.log('='.repeat(80));
  process.exit(0);
} else {
  console.error(`⛔ REGRESSION GATE VETO: ${errors.length} LOCK(S) BROKEN (Elapsed: ${elapsed}ms):`);
  errors.forEach(err => console.error(`  - ${err}`));
  console.log('='.repeat(80));
  process.exit(1);
}
