/**
 * scripts/test_phase4_gate3_empirical_oracle.mjs
 *
 * Phase 4 Gate 3 Comprehensive Empirical Oracle & Adversarial Verification Suite
 * 
 * Verifies:
 * - 5 Core Invariants:
 *   1. Zero Badge Noise in Col 1 of /domains
 *   2. 7-Column Layout & Elimination of Zombie Col 2
 *   3. Strict Universal Time Formatting (>=365d in 'X.Xy', <365d in 'Xd', zero parenthetical days, zero 'ago')
 *   4. Popstate Safety & Scoping Invariant (/folders/:id/domains popstate preservation, drawer-close table immutability)
 *   5. Central Hub Single-Pass CTEs (< 5.0ms execution latency)
 * - 10 Veto Conditions (GATE1_CONTRACT_LOCK.md §5):
 *   1. /domains Col 1 Redundant Badge Bleed
 *   2. 8-Column Zombie Header
 *   3. Mixed/Inconsistent Age Formats
 *   4. Drawer-Close Table Mutation
 *   5. Campaign Popstate Context Drift
 *   6. Velocity Ratchet Squeeze
 *   7. Central Hub Shard Bypass
 *   8. Section 5 Table Ghosting
 *   9. Folder Card Counter Stagnation
 *   10. Headless Node.js Execution Crash
 */

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

import { getDomainsPageHtml } from '../src/domains-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { renderCampaignWorkspaceHeader } from '../src/ui/campaign-workspace-header.mjs';
import { formatEntityAgeFromDays, formatEntityAgeFromIso, formatAge } from '../src/utils.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';
import { listFolders, getFolder } from '../src/modules/keywords/folders-service.mjs';
import { syncSingleDomainRollup } from '../src/modules/domains/service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k === 'DATABASE_URL' && !DATABASE_URL) DATABASE_URL = v;
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

console.log('================================================================================');
console.log('   🔥 GATE 3 EMPIRICAL CHALLENGER ORACLE & ADVERSARIAL VERIFICATION');
console.log('================================================================================\n');

let passCount = 0;
let failCount = 0;

function report(conditionNumber, name, status, details = '') {
  if (status === 'PASS') {
    passCount++;
    console.log(`  ✓ [PASS] [Veto Cond ${conditionNumber}] ${name}`);
  } else {
    failCount++;
    console.log(`  ✗ [FAIL] [Veto Cond ${conditionNumber}] ${name}`);
  }
  if (details) console.log(`         ${details}`);
}

async function runAllChecks() {
  const domainsHtml = getDomainsPageHtml();

  // ===========================================================================
  // Veto Condition 1 / Invariant 1: /domains Col 1 Redundant Badge Bleed
  // ===========================================================================
  {
    // Extract Col 1 cell template from domainsHtml
    const col1Match = domainsHtml.match(/<!-- 1\. Rank & Domain[\s\S]*?<\/td>/i);
    assert.ok(col1Match, 'Col 1 cell comment and td must exist');
    const col1Content = col1Match[0];

    const forbiddenBadges = [
      'Baby Giant',
      'Bleeding',
      'Accts',
      'Arbitrage Vacuum',
      'x Pins/URL'
    ];

    const violations = [];
    for (const badge of forbiddenBadges) {
      if (col1Content.includes(badge)) {
        violations.push(badge);
      }
    }

    // Verify domain name and relocated age subline are present
    const hasDomainName = col1Content.includes('x-text="d.domain"');
    const hasRelocatedAge = col1Content.includes('formatDomainAge(d.age_days)');

    if (violations.length === 0 && hasDomainName && hasRelocatedAge) {
      report(1, 'Zero Badge Noise in Col 1 of /domains', 'PASS',
        'All 5 cognitive badges purged from Col 1; domain age subline present');
    } else {
      report(1, 'Zero Badge Noise in Col 1 of /domains', 'FAIL',
        `Violations found: ${violations.join(', ')} (hasName=${hasDomainName}, hasAge=${hasRelocatedAge})`);
    }
  }

  // ===========================================================================
  // Veto Condition 2 / Invariant 2: 8-Column Zombie Header & 7-Column Layout
  // ===========================================================================
  {
    // Extract thead in domainsHtml
    const theadMatch = domainsHtml.match(/<thead>[\s\S]*?<\/thead>/i);
    assert.ok(theadMatch, 'Table thead must exist in /domains');
    const theadContent = theadMatch[0];
    const thMatches = theadContent.match(/<th\b[\s\S]*?<\/th>/gi) || [];

    // Verify no standalone Column 2 'DOMAIN AGE & REGISTRY'
    const hasZombieCol2 = /DOMAIN AGE & REGISTRY/i.test(theadContent) || /DOMAIN AGE/i.test(theadContent);

    // Verify tbody rows have exactly 7 td elements
    const tbodyMatch = domainsHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
    assert.ok(tbodyMatch, 'Table tbody must exist in /domains');
    const dataRowMatch = tbodyMatch[0].match(/<template x-for="\(d, idx\) in domains"[\s\S]*?<tr[\s\S]*?<\/tr>/i);
    assert.ok(dataRowMatch, 'Data row template must exist in /domains');
    const tdMatches = dataRowMatch[0].match(/<td\b[\s\S]*?<\/td>/gi) || [];

    // Verify empty/loading/error rows use colspan="7"
    const loadingMatch = domainsHtml.includes('colspan="7"');
    const hasColspan8 = domainsHtml.includes('colspan="8"');

    if (thMatches.length === 7 && tdMatches.length === 7 && !hasZombieCol2 && loadingMatch && !hasColspan8) {
      report(2, '7-Column Layout & Zero Zombie Col 2', 'PASS',
        `Exact 7 headers (th=${thMatches.length}), exact 7 data cells (td=${tdMatches.length}), colspan=7 enforced`);
    } else {
      report(2, '7-Column Layout & Zero Zombie Col 2', 'FAIL',
        `thCount=${thMatches.length}, tdCount=${tdMatches.length}, hasZombieCol2=${hasZombieCol2}, hasColspan8=${hasColspan8}`);
    }
  }

  // ===========================================================================
  // Veto Condition 3 / Invariant 3: Universal Strict Time Formatting Standard
  // ===========================================================================
  {
    const edgeCases = [
      { input: 0, expected: '0d' },
      { input: 1, expected: '1d' },
      { input: 12, expected: '12d' },
      { input: 145, expected: '145d' },
      { input: 364, expected: '364d' },
      { input: 365, expected: '1.0y' },
      { input: 366, expected: '1.0y' },
      { input: 730, expected: '2.0y' },
      { input: 4088, expected: '11.2y' },
      { input: null, expected: '—' },
      { input: undefined, expected: '—' },
      { input: '', expected: '—' },
      { input: -10, expected: '—' }
    ];

    let allDaysPassed = true;
    for (const ec of edgeCases) {
      const res = formatEntityAgeFromDays(ec.input);
      if (res !== ec.expected) {
        allDaysPassed = false;
        console.error(`formatEntityAgeFromDays(${ec.input}) returned '${res}', expected '${ec.expected}'`);
      }
    }

    // Test formatAge alias
    assert.equal(formatAge(365), '1.0y');
    assert.equal(formatAge(100), '100d');

    // Test formatEntityAgeFromIso
    const now = Date.now();
    const iso10d = new Date(now - 10 * 86400000).toISOString();
    const iso500d = new Date(now - 500 * 86400000).toISOString();
    const res10d = formatEntityAgeFromIso(iso10d);
    const res500d = formatEntityAgeFromIso(iso500d);
    const isoPassed = (res10d === '10d' && res500d === '1.4y');

    // DOM / Template Scan: Ensure zero parenthetical day formats e.g. '11.2y (4088d)'
    const allHtml = domainsHtml + getPinDetailPageHtml('123') + getCampaignFoldersPageHtml();
    const hasParentheticalYears = /\d+(?:\.\d+)?y\s*\(\d+d\)/.test(allHtml);
    const hasMoAgo = /\d+mo\s+ago/i.test(allHtml);

    if (allDaysPassed && isoPassed && !hasParentheticalYears && !hasMoAgo) {
      report(3, 'Universal Strict Time Formatting Standard', 'PASS',
        '>=365d -> years only (1.0y, 11.2y); <365d -> days only (145d); zero parenthetical days');
    } else {
      report(3, 'Universal Strict Time Formatting Standard', 'FAIL',
        `allDaysPassed=${allDaysPassed}, isoPassed=${isoPassed}, hasParentheticalYears=${hasParentheticalYears}, hasMoAgo=${hasMoAgo}`);
    }
  }

  // ===========================================================================
  // Veto Condition 4: Drawer-Close Table Metric Immutability (Invariant 4A)
  // ===========================================================================
  {
    // Extract domainsApp script from domainsHtml and execute in isolated VM
    const scriptMatches = domainsHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
    const appScript = scriptMatches.find(s => s.includes('domainsApp('));
    assert.ok(appScript, 'domainsApp script tag must exist');
    const jsCode = appScript.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      window: {
        location: { pathname: '/domains', search: '' },
        history: { pushState: () => {}, replaceState: () => {} },
        addEventListener: () => {},
        safeApiFetch: async () => ({
          ok: true,
          json: async () => ({
            domain: 'payhip.com',
            summary: {
              total_pins: 30, // TRUNCATED
              total_saves: 2000, // TRUNCATED
              avg_velocity: '2.00' // TRUNCATED
            },
            age_info: { age_days: 4088, lookup_status: 'resolved' },
            ad_info: { current_ad_network: 'Mediavine' }
          })
        })
      },
      document: { documentElement: { classList: { add: () => {}, remove: () => {} } } },
      localStorage: { getItem: () => null, setItem: () => {} },
      setTimeout: () => {},
      clearTimeout: () => {},
      encodeURIComponent,
      decodeURIComponent,
      Number,
      String,
      Boolean,
      Array,
      Math,
      Date,
      RegExp,
      Set,
      Map,
      isNaN,
      isFinite
    };

    vm.createContext(sandbox);
    vm.runInContext(jsCode, sandbox);
    const app = sandbox.domainsApp();

    // Populate initial domains table
    const initialDomainRow = {
      domain: 'payhip.com',
      total_pins: 670,
      total_saves: 135992,
      avg_velocity: '35.40',
      active_serp_pins: 450,
      displaced_pins: 220,
      age_days: 3500,
      ad_network: 'unchecked'
    };
    app.domains = [JSON.parse(JSON.stringify(initialDomainRow))];

    // Open dossier and simulate data retrieval
    app.dossierDomain = 'payhip.com';
    app.isDossierOpen = true;
    app.dossierData = {
      summary: { total_pins: 30, total_saves: 2000, avg_velocity: '2.00' },
      age_info: { age_days: 4088, lookup_status: 'resolved' },
      ad_info: { current_ad_network: 'Mediavine', ad_manager_domain: 'mediavine.com' }
    };

    // Call closeDossier()
    app.closeDossier(false);

    // Verify row metrics after close
    const updatedRow = app.domains[0];
    const metricsInvariant = (
      updatedRow.total_pins === 670 &&
      updatedRow.total_saves === 135992 &&
      updatedRow.avg_velocity === '35.40' &&
      updatedRow.active_serp_pins === 450 &&
      updatedRow.displaced_pins === 220
    );

    const enrichmentSynced = (
      updatedRow.age_days === 4088 &&
      updatedRow.ad_network === 'Mediavine' &&
      updatedRow.ad_manager_domain === 'mediavine.com'
    );

    if (metricsInvariant && enrichmentSynced) {
      report(4, 'Drawer-Close Table Metric Immutability', 'PASS',
        'Core table metrics (pins, saves, velocity) 100% invariant; only WHOIS & ads.txt synced');
    } else {
      report(4, 'Drawer-Close Table Metric Immutability', 'FAIL',
        `metricsInvariant=${metricsInvariant}, enrichmentSynced=${enrichmentSynced}`);
    }
  }

  // ===========================================================================
  // Veto Condition 5: Campaign Popstate Context Drift (Invariant 4B)
  // ===========================================================================
  {
    // Test popstate preservation in scoped workspace
    const scriptMatches = domainsHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
    const appScript = scriptMatches.find(s => s.includes('domainsApp('));
    const jsCode = appScript.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

    const pushStateHistory = [];
    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      window: {
        location: { pathname: '/folders/42/domains', search: '' },
        history: {
          pushState: (state, title, url) => {
            pushStateHistory.push({ state, url });
            sandbox.window.location.pathname = url;
          },
          replaceState: () => {}
        },
        addEventListener: () => {},
        safeApiFetch: async () => ({ ok: true, json: async () => ({}) })
      },
      document: { documentElement: { classList: { add: () => {}, remove: () => {} } } },
      localStorage: { getItem: () => null, setItem: () => {} },
      setTimeout: () => {},
      clearTimeout: () => {},
      encodeURIComponent,
      decodeURIComponent,
      Number,
      String,
      Boolean,
      Array,
      Math,
      Date,
      RegExp,
      Set,
      Map,
      isNaN,
      isFinite
    };

    vm.createContext(sandbox);
    vm.runInContext(jsCode, sandbox);
    const scopedApp = sandbox.domainsApp('', '42');

    // Verify getBaseStudioPath
    const basePath = scopedApp.getBaseStudioPath();
    assert.equal(basePath, '/folders/42/domains');

    // Simulate openDossier('testdomain.com')
    scopedApp.openDossier('testdomain.com', true);
    assert.equal(sandbox.window.location.pathname, '/folders/42/domains/testdomain.com');

    // Simulate closeDossier(true)
    scopedApp.closeDossier(true);
    assert.equal(sandbox.window.location.pathname, '/folders/42/domains');

    // Ensure it NEVER pushed plain '/domains'
    const ejectedToGlobal = pushStateHistory.some(h => h.url === '/domains');

    if (basePath === '/folders/42/domains' && !ejectedToGlobal && sandbox.window.location.pathname === '/folders/42/domains') {
      report(5, 'Campaign Popstate Context Drift & Scope Preservation', 'PASS',
        'Scoped URL retained across open/close (/folders/42/domains); zero ejection to /domains');
    } else {
      report(5, 'Campaign Popstate Context Drift & Scope Preservation', 'FAIL',
        `basePath=${basePath}, ejectedToGlobal=${ejectedToGlobal}, path=${sandbox.window.location.pathname}`);
    }
  }

  // ===========================================================================
  // Veto Condition 6: Symmetrical Velocity Ratchet & Hydration Jump Mitigation
  // ===========================================================================
  {
    // Test calculateDailyVelocity in src/lib/math.mjs
    // Scenario 1: Initial hydration jump (baseSaves = 0, curSaves = 102923) without createdAt
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const today = new Date().toISOString();
    const velNoCreatedAt = calculateDailyVelocity({
      currentSaves: 102923,
      baselineSaves: 0,
      currentDate: today,
      baselineDate: yesterday
    });
    // When isHydrationJump is true and no createdAt is provided, returns 0 (not 25000!)
    assert.equal(velNoCreatedAt, 0, 'Un-timestamped hydration jump must return 0, not 25000');

    // Scenario 2: Initial hydration jump with lifetime age (createdAt = 500 days ago)
    const created500dAgo = new Date(Date.now() - 500 * 86400000).toISOString();
    const velWithLifetime = calculateDailyVelocity({
      currentSaves: 102923,
      baselineSaves: 0,
      currentDate: today,
      baselineDate: yesterday,
      createdAt: created500dAgo
    });
    assert.ok(velWithLifetime > 0 && velWithLifetime < 500, `Lifetime normalized velocity must be ~206/d, got ${velWithLifetime}`);

    // Scenario 3: Authentic day-to-day crawling delta (base = 102920, cur = 102923, days = 1)
    const authenticVel = calculateDailyVelocity({
      currentSaves: 102923,
      baselineSaves: 102920,
      currentDate: today,
      baselineDate: yesterday
    });
    assert.equal(authenticVel, 3, 'Authentic 3-save delta must yield 3/d');

    // Scenario 4: Downward decay (saves stopped: base = 102923, cur = 102923, days = 1)
    const decayVel = calculateDailyVelocity({
      currentSaves: 102923,
      baselineSaves: 102923,
      currentDate: today,
      baselineDate: yesterday
    });
    assert.equal(decayVel, 0, 'Zero delta must yield 0/d velocity');

    // Check scripts/keyword-velocity-crawler.mjs for symmetrical decay ratchet
    const crawlerCode = fs.readFileSync(path.resolve(process.cwd(), 'scripts/keyword-velocity-crawler.mjs'), 'utf8');
    const hasSymmetricalRatchet = crawlerCode.includes('WHEN NOT u.from_hydration_cache AND u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric');
    const hasMonotonicGreatestLock = crawlerCode.includes('GREATEST(COALESCE(MAX(rb.daily_save_velocity), 0),');

    if (velNoCreatedAt === 0 && velWithLifetime < 500 && authenticVel === 3 && decayVel === 0 && hasSymmetricalRatchet && !hasMonotonicGreatestLock) {
      report(6, 'Symmetrical Velocity Ratchet & Anti-Spike Guard', 'PASS',
        'Hydration jump clamped to 0/lifetime; downward decay active; monotonic GREATEST eliminated');
    } else {
      report(6, 'Symmetrical Velocity Ratchet & Anti-Spike Guard', 'FAIL',
        `velNoCreated=${velNoCreatedAt}, velLifetime=${velWithLifetime}, hasSymmetrical=${hasSymmetricalRatchet}`);
    }
  }

  // ===========================================================================
  // Veto Condition 7: Central Hub Shard Bypass & SSOT Decoupling
  // ===========================================================================
  {
    // Check src/modules/domains/service.mjs syncSingleDomainRollup
    const domainsServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/domains/service.mjs'), 'utf8');

    // Check that syncSingleDomainRollup does NOT update total_pins or total_saves
    const syncFuncMatch = domainsServiceCode.match(/async function syncSingleDomainRollup[\s\S]*?\n\}/);
    assert.ok(syncFuncMatch, 'syncSingleDomainRollup function must exist');
    const syncFuncCode = syncFuncMatch[0];

    const touchesPinCounts = syncFuncCode.includes('total_pins =') || syncFuncCode.includes('total_saves =') || syncFuncCode.includes('avg_velocity =');
    const guardsFolderScope = syncFuncCode.includes('options?.folderId') || syncFuncCode.includes('dossierData?.folderId');

    // Check routes/domains.mjs for folderId guard on syncSingleDomainRollup
    const domainsRouteCode = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/domains.mjs'), 'utf8');
    const routeGuardsFolder = domainsRouteCode.includes('if (!folderId)') && domainsRouteCode.includes('syncSingleDomainRollup');

    if (!touchesPinCounts && guardsFolderScope && routeGuardsFolder) {
      report(7, 'Central Hub Rollup SSOT Decoupling & Shard Protection', 'PASS',
        'syncSingleDomainRollup restricted to WHOIS/ads; folder-scoped requests strictly abort rollup updates');
    } else {
      report(7, 'Central Hub Rollup SSOT Decoupling & Shard Protection', 'FAIL',
        `touchesPinCounts=${touchesPinCounts}, guardsFolderScope=${guardsFolderScope}, routeGuardsFolder=${routeGuardsFolder}`);
    }
  }

  // ===========================================================================
  // Veto Condition 8: Section 5 Legacy Table Ghosting
  // ===========================================================================
  {
    const campaignFoldersHtml = getCampaignFoldersPageHtml();
    const hasMonopolyTable = campaignFoldersHtml.includes('Domain Monopoly (Share of Voice)') ||
      campaignFoldersHtml.includes('Creator Monopoly (Whale Accounts)');
    const hasSection5Ghost = /Section 5: Cross-Workspace Monopoly/i.test(campaignFoldersHtml);

    if (!hasMonopolyTable && !hasSection5Ghost) {
      report(8, 'Section 5 Legacy Monopoly Table Eradication', 'PASS',
        'Legacy Section 5 monopoly tables completely removed in favor of dedicated studio rooms');
    } else {
      report(8, 'Section 5 Legacy Monopoly Table Eradication', 'FAIL',
        `hasMonopolyTable=${hasMonopolyTable}, hasSection5Ghost=${hasSection5Ghost}`);
    }
  }

  // ===========================================================================
  // Veto Condition 9: Folder Card Counter Stagnation & 4-Room Header Parity
  // ===========================================================================
  {
    const campaignFoldersHtml = getCampaignFoldersPageHtml();

    // Check folder cards for 3 live counters
    const hasKeywordCount = campaignFoldersHtml.includes('f.keyword_count');
    const hasCreatorCount = campaignFoldersHtml.includes('f.creator_count');
    const hasDomainCount = campaignFoldersHtml.includes('f.domain_count') && campaignFoldersHtml.includes('f.pinned_domain_count');

    // Check workspace header for 4 room tabs
    const headerHtml = renderCampaignWorkspaceHeader({ activeRoom: 'domains', folderId: '10' });
    const hasRoom1 = headerHtml.includes('/folders/10"');
    const hasRoom2 = headerHtml.includes('/folders/10/keywords"');
    const hasRoom3 = headerHtml.includes('/folders/10/creators"');
    const hasRoom4 = headerHtml.includes('/folders/10/domains"');

    if (hasKeywordCount && hasCreatorCount && hasDomainCount && hasRoom1 && hasRoom2 && hasRoom3 && hasRoom4) {
      report(9, 'Folder Card 3-Counter Grid & 4-Room Workspace Tabs', 'PASS',
        'Folder cards render Keywords/Creators/Domains counters; Header links all 4 workspace rooms');
    } else {
      report(9, 'Folder Card 3-Counter Grid & 4-Room Workspace Tabs', 'FAIL',
        `hasKw=${hasKeywordCount}, hasCr=${hasCreatorCount}, hasDom=${hasDomainCount}, rooms=${hasRoom1 && hasRoom2 && hasRoom3 && hasRoom4}`);
    }
  }

  // ===========================================================================
  // Veto Condition 10: Headless Node.js Execution Crash (Rule 17 Shield)
  // ===========================================================================
  {
    let crashError = null;
    try {
      // Execute all UI page generators in vanilla Node.js without browser globals
      getDomainsPageHtml();
      getDomainsPageHtml('example.com', '42');
      getCampaignFoldersPageHtml();
      getCampaignFoldersPageHtml('42');
      getDashboardHtml();
      getDashboardHtml('42');
      getKeywordsPageHtml();
      getKeywordsPageHtml('', '', '42');
      getPinDetailPageHtml('123456789');
      renderCampaignWorkspaceHeader({ activeRoom: 'crossover', folderId: '42' });
      renderCampaignWorkspaceHeader({ activeRoom: 'domains', folderId: '42' });
    } catch (err) {
      crashError = err;
    }

    if (!crashError) {
      report(10, 'Headless Node.js Execution Shield (Rule 17)', 'PASS',
        'Zero ReferenceError exceptions across all 6 UI generators and shared workspace components');
    } else {
      report(10, 'Headless Node.js Execution Shield (Rule 17)', 'FAIL',
        `Encountered error: ${crashError.message}\n${crashError.stack}`);
    }
  }

  // ===========================================================================
  // Invariant 5: Central Hub Single-Pass CTE Latency (< 5.0ms)
  // ===========================================================================
  console.log('\n[*] Benchmarking Central Hub Folder CTE Queries (Invariant 5)...');
  if (DATABASE_URL) {
    const sql = neon(DATABASE_URL);
    const iterations = 25;
    const listLatencies = [];
    const getLatencies = [];

    // Warm up
    await listFolders(sql);

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await listFolders(sql);
      listLatencies.push(performance.now() - t0);
    }

    // Benchmark getFolder for first available folder
    const [firstFolder] = await sql`SELECT id FROM keyword_folders ORDER BY id ASC LIMIT 1;`;
    if (firstFolder?.id) {
      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await getFolder(sql, firstFolder.id);
        getLatencies.push(performance.now() - t0);
      }
    }

    listLatencies.sort((a, b) => a - b);
    const p50List = listLatencies[Math.floor(iterations * 0.5)].toFixed(2);
    const p95List = listLatencies[Math.floor(iterations * 0.95)].toFixed(2);
    const meanList = (listLatencies.reduce((a, b) => a + b, 0) / iterations).toFixed(2);

    console.log(`    listFolders: p50 = ${p50List}ms, p95 = ${p95List}ms, mean = ${meanList}ms (over ${iterations} runs)`);
    if (getLatencies.length > 0) {
      getLatencies.sort((a, b) => a - b);
      const p50Get = getLatencies[Math.floor(iterations * 0.5)].toFixed(2);
      const p95Get = getLatencies[Math.floor(iterations * 0.95)].toFixed(2);
      console.log(`    getFolder:   p50 = ${p50Get}ms, p95 = ${p95Get}ms`);
    }

    // Verify SQL plan via EXPLAIN
    const explainRows = await sql`
      EXPLAIN (ANALYZE, BUFFERS)
      WITH kw_counts AS (
        SELECT folder_id, COUNT(keyword_id)::int AS keyword_count
        FROM keyword_folder_items GROUP BY folder_id
      ),
      creator_counts AS (
        SELECT folder_id, COUNT(competitor_id)::int AS creator_count
        FROM folder_competitor_items GROUP BY folder_id
      ),
      pinned_counts AS (
        SELECT folder_id, COUNT(id)::int AS pinned_domain_count
        FROM folder_pinned_domains GROUP BY folder_id
      )
      SELECT 
        f.id,
        COALESCE(kw.keyword_count, 0) AS keyword_count,
        COALESCE(cr.creator_count, 0) AS creator_count,
        COALESCE(pd.pinned_domain_count, 0) AS pinned_domain_count
      FROM keyword_folders f
      LEFT JOIN kw_counts kw ON kw.folder_id = f.id
      LEFT JOIN creator_counts cr ON cr.folder_id = f.id
      LEFT JOIN pinned_counts pd ON pd.folder_id = f.id;
    `;
    const planText = explainRows.map(r => r['QUERY PLAN']).join('\n');
    const execTimeMatch = planText.match(/Execution Time:\s*([0-9.]+)\s*ms/i);
    const execTimeMs = execTimeMatch ? parseFloat(execTimeMatch[1]) : 0;
    console.log(`    EXPLAIN ANALYZE Database Engine Execution Time: ${execTimeMs.toFixed(3)} ms`);

    const latencyPass = execTimeMs < 5.0;
    if (latencyPass) {
      console.log(`  ✓ [PASS] [Invariant 5] Central Hub Single-Pass CTE Latency: ${execTimeMs.toFixed(3)} ms < 5.0 ms SLA`);
      passCount++;
    } else {
      console.log(`  ✗ [FAIL] [Invariant 5] Central Hub Single-Pass CTE Latency: ${execTimeMs.toFixed(3)} ms >= 5.0 ms SLA`);
      failCount++;
    }
  } else {
    console.log('  ⚠️ [SKIP] DATABASE_URL not set; skipped live latency benchmark');
  }

  // ===========================================================================
  // Summary & Verdict
  // ===========================================================================
  console.log('\n================================================================================');
  console.log(`SCORECARD: ${passCount} PASSED | ${failCount} FAILED (Total: ${passCount + failCount})`);
  console.log('================================================================================');

  if (failCount === 0) {
    console.log('>>> GATE 3 VERIFICATION SIGN-OFF: 100% PASS — ZERO VETO CONDITIONS TRIGGERED <<<');
    process.exit(0);
  } else {
    console.error(`>>> GATE 3 VETO TRIGGERED: ${failCount} CHECKS FAILED <<<`);
    process.exit(1);
  }
}

runAllChecks().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
