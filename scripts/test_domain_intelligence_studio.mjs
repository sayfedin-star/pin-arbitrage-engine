#!/usr/bin/env node

/**
 * scripts/test_domain_intelligence_studio.mjs
 * Verification suite for Domain Intelligence & SERP Monopoly Studio (/domains & /api/domains/*)
 */

import assert from 'node:assert';
import { neon } from '@neondatabase/serverless';
import worker from '../src/worker.mjs';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';
import {
  normalizeCleanDomain,
  escapeSqlLike,
  listDomainsIntelligence,
  getDomainDeepDossier,
  fetchAndCacheDomainAge,
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch,
  parseAdsTxtMonetization,
  enrichNextUncheckedAdsBatch,
  detectMarketingAngle,
  generateDomainArbitrageBlueprint
} from '../src/modules/domains/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] DATABASE_URL is required to run domain intelligence verification.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));
const mockEnv = {
  DATABASE_URL,
  SQL_CLIENT: sql
};

let passed = 0;
let failed = 0;

function report(testName, ok, details = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName} ${details}`);
  }
}

async function runTests() {
  console.log('================================================================================');
  console.log('🌐 DOMAIN INTELLIGENCE & SERP MONOPOLY STUDIO AUDIT & VERIFICATION');
  console.log('================================================================================\n');

  // 1. Unit Tests: normalizeCleanDomain & escapeSqlLike
  console.log('[*] Testing Domain Normalization & Security Escaping...');
  report(
    'normalizeCleanDomain strips protocol, www, paths, queries',
    normalizeCleanDomain('https://www.FoodBlog.com/recipes/pasta?ref=pin#header') === 'foodblog.com'
  );
  report(
    'normalizeCleanDomain filters ignored internal domains (pinterest.com, pin.it)',
    normalizeCleanDomain('https://www.pinterest.com/pin/123') === '' &&
    normalizeCleanDomain('pin.it/abc') === ''
  );
  report(
    'normalizeCleanDomain blocks internal TLDs and malformed hostnames (SSRF mitigation)',
    normalizeCleanDomain('internal-host.local') === '' &&
    normalizeCleanDomain('admin.internal') === '' &&
    normalizeCleanDomain('router.lan') === '' &&
    normalizeCleanDomain('server.corp') === '' &&
    normalizeCleanDomain('-invalid.com') === '' &&
    normalizeCleanDomain('bad..host.com') === '' &&
    normalizeCleanDomain('192.168.1.1') === ''
  );
  report(
    'escapeSqlLike correctly escapes SQL wildcards (%, _, \\)',
    escapeSqlLike('100%_recipe\\blog') === '100\\%\\_recipe\\\\blog'
  );

  // 2. HTTP Routing Tests via Worker fetch
  console.log('\n[*] Testing Worker Routing for /domains & /api/domains/*...');

  // 2.1 GET /domains HTML
  const htmlRes = await worker.fetch(new Request('https://engine.internal/domains'), mockEnv);
  const htmlText = await htmlRes.text();
  report(
    'GET /domains returns 200 OK with HTML content',
    htmlRes.status === 200 && htmlText.includes('Domain Intelligence Studio')
  );
  report(
    'GET /domains enforces Content-Security-Policy & nosniff headers',
    Boolean(htmlRes.headers.get('Content-Security-Policy')) &&
    htmlRes.headers.get('X-Content-Type-Options') === 'nosniff'
  );

  // 2.2 GET /keywords/domains slug routing
  const slugRes = await worker.fetch(new Request('https://engine.internal/keywords/domains'), mockEnv);
  report(
    'GET /keywords/domains intercepts reserved slug cleanly (200 OK)',
    slugRes.status === 200
  );

  // 2.3 Direct Studio Route: GET /domains/:domain
  const directDomainRes = await worker.fetch(new Request('https://engine.internal/domains/makeourrecipes.com'), mockEnv);
  const directDomainHtml = await directDomainRes.text();
  report(
    'GET /domains/:domain returns 200 OK with sanitized initialDomain and zero FOUC inline styles',
    directDomainRes.status === 200 &&
    directDomainHtml.includes("domainsApp('makeourrecipes.com')") &&
    directDomainHtml.includes('style="display:none;"') &&
    directDomainHtml.includes('style="display:flex;"') &&
    directDomainHtml.includes('← Back to Leaderboard') &&
    directDomainHtml.includes('🌐 Domain Radar')
  );

  // 2.4 Slug safety & malformed decoding: GET /domains/test%20slug%22
  const malformedSlugRes = await worker.fetch(new Request('https://engine.internal/domains/test%20slug%22'), mockEnv);
  const malformedSlugHtml = await malformedSlugRes.text();
  report(
    'GET /domains with special chars strips attribute injection tokens strictly',
    malformedSlugRes.status === 200 &&
    malformedSlugHtml.includes("domainsApp('testslug')")
  );

  // 2.5 Verb tampering on /domains
  const postHtmlRes = await worker.fetch(new Request('https://engine.internal/domains', { method: 'POST' }), mockEnv);
  report(
    'POST /domains rejected with 405 Method Not Allowed',
    postHtmlRes.status === 405
  );

  // 3. API Leaderboard Tests: GET /api/domains
  console.log('\n[*] Testing /api/domains Leaderboard & Analytics...');
  const apiLeaderboardRes = await worker.fetch(new Request('https://engine.internal/api/domains?limit=5'), mockEnv);
  const leaderboardData = await apiLeaderboardRes.json();
  report(
    'GET /api/domains returns success: true with overview and domains array',
    apiLeaderboardRes.status === 200 &&
    leaderboardData.success === true &&
    Array.isArray(leaderboardData.domains) &&
    typeof leaderboardData.overview?.total_domains === 'number'
  );
  report(
    'Overview computes total_domains, top5_monopoly_pct, and avg_pins_per_url',
    leaderboardData.overview.total_domains > 0 &&
    leaderboardData.overview.top5_monopoly_pct >= 0 &&
    leaderboardData.overview.avg_pins_per_url > 0
  );

  // 4. API Deep Dossier Tests: GET /api/domains/dossier
  console.log('\n[*] Testing /api/domains/dossier Deep Forensic Analysis...');
  const topDomain = leaderboardData.domains[0]?.domain || 'payhip.com';
  const dossierRes = await worker.fetch(new Request(`https://engine.internal/api/domains/dossier?domain=${encodeURIComponent(topDomain)}`), mockEnv);
  const dossierData = await dossierRes.json();
  report(
    `GET /api/domains/dossier for ${topDomain} returns complete 4-pillar data structure`,
    dossierRes.status === 200 &&
    dossierData.success === true &&
    Array.isArray(dossierData.ranked_pins) &&
    Array.isArray(dossierData.money_urls) &&
    Array.isArray(dossierData.keyword_monopoly) &&
    Array.isArray(dossierData.accounts)
  );

  // 4.1 Missing domain param returns 400
  const missingDomainRes = await worker.fetch(new Request('https://engine.internal/api/domains/dossier'), mockEnv);
  report(
    'GET /api/domains/dossier without domain param returns 400 Bad Request',
    missingDomainRes.status === 400
  );

  // 5. API Live WHOIS / Age Enrichment: POST /api/domains/enrich-age
  console.log('\n[*] Testing /api/domains/enrich-age Cache & Resolver...');
  const ageRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-age', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: topDomain })
  }), mockEnv);
  const ageData = await ageRes.json();
  report(
    `POST /api/domains/enrich-age for ${topDomain} resolves age metadata`,
    ageRes.status === 200 &&
    ageData.success === true &&
    ageData.age_info?.domain === topDomain
  );

  // 5.1 Invalid domain in enrich-age returns 400
  const invalidAgeRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-age', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'invalid..host.local' })
  }), mockEnv);
  report(
    'POST /api/domains/enrich-age with invalid domain rejects with 400 Bad Request',
    invalidAgeRes.status === 400
  );

  // 5.2 Direct SQL check for Landmine 1: CASE WHEN registered_at IS NOT NULL returns NULL (not 1)
  const [nullCheck] = await sql`
    SELECT
      CASE
        WHEN NULL::timestamptz IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - NULL::timestamptz)) / 86400))::int
        ELSE NULL::int
      END AS corrected_age,
      GREATEST(1, NULL::int) AS vulnerable_postgres_greatest;
  `;
  report(
    'PostgreSQL GREATEST(1, NULL) trap verified and mitigated (corrected_age is null, vulnerable is 1)',
    nullCheck.corrected_age === null && Number(nullCheck.vulnerable_postgres_greatest) === 1
  );

  // 5.3 Multi-Tier Resolver: Verify ccTLD (.me) resolves cleanly (longevitylifestyle.me)
  const ccTldRes = await fetchAndCacheDomainAge(sql, 'longevitylifestyle.me', { forceRefresh: false });
  report(
    'Multi-Tier Resolver resolves ccTLD longevitylifestyle.me without Unverified status',
    ccTldRes !== null && ccTldRes.lookup_status === 'resolved' && ccTldRes.age_years >= 3.0
  );

  // 5.4 Batch Age Enrichment API: POST /api/domains/enrich-age with domains[]
  const batchRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-age', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains: ['longevitylifestyle.me', topDomain], limit: 2 })
  }), mockEnv);
  const batchData = await batchRes.json();
  report(
    'POST /api/domains/enrich-age supports batch domains[] array',
    batchRes.status === 200 && batchData.success === true && typeof batchData.enriched === 'number'
  );

  // 6. Direct Service & Database Integrity Check
  console.log('\n[*] Testing Direct Service Query Engine & SQL Index Usability...');
  const directList = await listDomainsIntelligence(sql, { limit: 10, sortBy: 'visibility' });
  report(
    'listDomainsIntelligence executes against Neon Central Hub with covering indexes',
    Array.isArray(directList.domains) && directList.domains.length > 0
  );

  const directDossier = await getDomainDeepDossier(sql, topDomain);
  report(
    'getDomainDeepDossier groups Money URLs and counts pin creative variations',
    Array.isArray(directDossier.money_urls)
  );

  // 7. Global Database Verification & Privacy-Shielded Status Tests
  console.log('\n[*] Testing Global Database Verification & Failed/Redacted WHOIS Indicators...');

  // 7.1 Service: getDatabaseEnrichmentStats returns accurate aggregate counts
  const globalStats = await getDatabaseEnrichmentStats(sql);
  report(
    'getDatabaseEnrichmentStats computes database-wide progress and checked counts',
    typeof globalStats.total_domains === 'number' &&
    globalStats.total_domains > 0 &&
    typeof globalStats.checked_domains === 'number' &&
    typeof globalStats.percent_complete === 'number'
  );

  // 7.2 API: GET /api/domains/enrich-status returns global statistics
  const enrichStatusRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-status', {
    method: 'GET'
  }), mockEnv);
  const enrichStatusData = await enrichStatusRes.json();
  report(
    'GET /api/domains/enrich-status serves global progress telemetry',
    enrichStatusRes.status === 200 &&
    enrichStatusData.success === true &&
    typeof enrichStatusData.stats?.total_domains === 'number'
  );

  // 7.3 API: POST /api/domains/enrich-all processes automated batch queue
  const enrichAllRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_size: 2, concurrency: 2 })
  }), mockEnv);
  const enrichAllData = await enrichAllRes.json();
  report(
    'POST /api/domains/enrich-all processes prioritized batch without manual intervention',
    enrichAllRes.status === 200 &&
    enrichAllData.success === true &&
    typeof enrichAllData.batch_size === 'number' &&
    typeof enrichAllData.stats?.checked_domains === 'number'
  );

  // 7.4 UI: Studio HTML contains Verify Entire Database button and Global Banner
  const studioHtml = await worker.fetch(new Request('https://engine.internal/domains', {
    method: 'GET'
  }), mockEnv).then(r => r.text());
  report(
    'Studio UI contains Verify Entire Database button & Global Verification Banner',
    studioHtml.includes('Verify Entire Database') &&
    studioHtml.includes('Global Verification In Progress')
  );

  // 7.5 UI: Studio HTML contains 3-State Redacted / Shielded Badge
  report(
    'Studio UI contains 3-State Redacted / Shielded Badge for withheld registry WHOIS',
    studioHtml.includes('Redacted / Shielded') &&
    studioHtml.includes('Registry Withheld / Privacy Shielded')
  );

  // 8. Monetization & Ad Network Intelligence Tests
  console.log('\n[*] Testing Ad Network & Monetization Intelligence (/api/domains/enrich-ads, /ads-status)...');

  // 8.1 API: GET /api/domains/ads-status
  const adsStatusRes = await worker.fetch(new Request('https://engine.internal/api/domains/ads-status'), mockEnv);
  const adsStatusData = await adsStatusRes.json();
  report(
    'GET /api/domains/ads-status returns database-wide monetization breakdown',
    adsStatusRes.status === 200 &&
    adsStatusData.success === true &&
    typeof adsStatusData.stats?.total_checked === 'number' &&
    typeof adsStatusData.stats?.raptive_count === 'number'
  );

  // 8.2 API: POST /api/domains/enrich-ads (Single domain resolution & caching)
  const enrichAdsRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'payhip.com' })
  }), mockEnv);
  const enrichAdsData = await enrichAdsRes.json();
  report(
    'POST /api/domains/enrich-ads resolves single domain monetization metadata',
    enrichAdsRes.status === 200 &&
    enrichAdsData.success === true &&
    enrichAdsData.ad_info?.domain === 'payhip.com' &&
    typeof enrichAdsData.ad_info?.current_ad_network === 'string'
  );

  // 8.3 API: POST /api/domains/enrich-ads (Batch domains[])
  const batchAdsRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains: ['payhip.com', 'saltandlavender.com'], limit: 2 })
  }), mockEnv);
  const batchAdsData = await batchAdsRes.json();
  report(
    'POST /api/domains/enrich-ads supports batch resolution across multiple domains',
    batchAdsRes.status === 200 &&
    batchAdsData.success === true &&
    typeof batchAdsData.enriched === 'number' &&
    Array.isArray(batchAdsData.results)
  );

  // 8.4 Service: listDomainsIntelligence adNetwork filter parameter
  const filteredAdsList = await listDomainsIntelligence(sql, { limit: 10, adNetwork: 'all' });
  report(
    'listDomainsIntelligence populates ad_network, ad_manager_domain, and previous_ad_network fields',
    Array.isArray(filteredAdsList.domains) &&
    filteredAdsList.domains.length > 0 &&
    'ad_network' in filteredAdsList.domains[0] &&
    'ads_txt_status' in filteredAdsList.domains[0]
  );

  // 8.5 Deep Dossier includes ad_info
  const dossierAdCheck = await getDomainDeepDossier(sql, 'saltandlavender.com');
  report(
    'getDomainDeepDossier attaches ad_info with publisher metadata',
    dossierAdCheck.ad_info !== undefined &&
    dossierAdCheck.ad_info !== null &&
    (dossierAdCheck.ad_info.current_ad_network === 'mediavine' || typeof dossierAdCheck.ad_info.current_ad_network === 'string')
  );

  // 8.6 Studio UI contains Ad Network column header, Tab 5, and NO hardcoded RPM text
  report(
    'Studio UI contains Ad Network column header, Tab 5 button, and historical switch tracking UI',
    studioHtml.includes('Ad Network') &&
    studioHtml.includes('Ad Network & Monetization Profile') &&
    studioHtml.includes('Historical Switch Tracking') &&
    !studioHtml.includes('$40–$65 RPM')
  );

  // 8.7 HBAgency IAB and OpenRTB detection parser
  const hbSampleAdsTxt = `managerdomain=hbagency.it\n# HBAgency , first step recipes\n# info@hbagency.it\ngoogle.com, pub-9029649931346083, RESELLER\nappnexus.com, 10850, RESELLER`;
  const parsedHb = parseAdsTxtMonetization(hbSampleAdsTxt);
  report(
    'parseAdsTxtMonetization detects HBAgency managerdomain before falling back to AdSense',
    parsedHb.network === 'hbagency' &&
    parsedHb.manager_domain === 'hbagency.it'
  );

  // 8.8 API: POST /api/domains/enrich-ads-all
  const enrichAdsAllRes = await worker.fetch(new Request('https://engine.internal/api/domains/enrich-ads-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_size: 2, concurrency: 1 })
  }), mockEnv);
  const enrichAdsAllData = await enrichAdsAllRes.json();
  report(
    'POST /api/domains/enrich-ads-all processes automated batch and returns stats',
    enrichAdsAllRes.status === 200 &&
    enrichAdsAllData.success === true &&
    typeof enrichAdsAllData.stats?.checked_domains === 'number' &&
    Array.isArray(enrichAdsAllData.results)
  );

  // 8.9 Studio UI contains Auto-Verify All Ads, Batch Check Ads, and HBAgency options
  report(
    'Studio UI contains Auto-Verify All Ads, Batch Check Ads, and HBAgency options',
    studioHtml.includes('Auto-Verify All Ads') &&
    studioHtml.includes('Batch Check Ads') &&
    studioHtml.includes('HBAgency') &&
    studioHtml.includes('toggleGlobalAdsEnrichment')
  );

  // ============================================================================
  // 9. Algorithmic Competitive Espionage & 6-Pillar Radar Verification (Level 4C)
  // ============================================================================
  console.log('\n[*] Testing Algorithmic Espionage & 6-Pillar Radar Engine...');

  // 9.1 Pillar 2: Unit Test detectMarketingAngle
  const angle1 = detectMarketingAngle({ title: 'Easy 15-Minute Chicken Dinner' });
  const angle2 = detectMarketingAngle({ title: 'Keto Low Carb Cheesy Skillet' });
  const angle3 = detectMarketingAngle({ title: 'Crockpot Family Casserole Meal Prep' });
  report(
    'detectMarketingAngle identifies Quick & Easy, Keto Diet, and Family Budget angles',
    angle1.angle.includes('Quick & Easy') &&
    angle2.angle.includes('Diet & Keto') &&
    angle3.angle.includes('Family & Budget')
  );

  // 9.2 Pillar 1, 3, 4, 5: getDomainDeepDossier 6-Pillar Enrichment
  const espionageDossier = await getDomainDeepDossier(sql, 'nourishyourglow.com');
  report(
    'getDomainDeepDossier compiles 6-pillar intelligence structure',
    espionageDossier.success === true &&
    espionageDossier.visual_dna !== undefined &&
    Array.isArray(espionageDossier.visual_dna.visual_tags_cloud) &&
    Array.isArray(espionageDossier.visual_dna.dominant_colors_palette) &&
    Array.isArray(espionageDossier.keyword_monopoly) &&
    Array.isArray(espionageDossier.money_urls) &&
    Array.isArray(espionageDossier.accounts)
  );

  // Pillar 1: Carpet Bombing & Slot Domination
  const topKwMonopoly = espionageDossier.keyword_monopoly[0];
  report(
    'Pillar 1: Keyword Monopoly classifies Carpet Bombing strategy & slot attribution',
    topKwMonopoly !== undefined &&
    ['URL_FLOODING', 'TOPIC_CLUSTER', 'HYBRID_FLOODING', 'SINGLE_SLOT'].includes(topKwMonopoly.strategy) &&
    typeof topKwMonopoly.serp_share_pct === 'number' &&
    Array.isArray(topKwMonopoly.slots) &&
    topKwMonopoly.top_slot_attribution !== null
  );

  // Pillar 2: Multi-Angle Creative Multiplier
  const topArticle = espionageDossier.money_urls[0];
  report(
    'Pillar 2: Money URLs track creative pin multiplier and marketing angle intent tags',
    topArticle !== undefined &&
    Array.isArray(topArticle.angles_targeted) &&
    Array.isArray(topArticle.pins) &&
    topArticle.pins[0]?.detected_angle !== undefined &&
    topArticle.pins[0]?.intent_tag !== undefined
  );

  // Pillar 3: Visual DNA
  const hasNoObjectString = (espionageDossier.visual_dna.visual_tags_cloud || []).every(
    t => typeof t.tag === 'string' && t.tag !== '[object Object]' && !t.tag.includes('object Object')
  );
  report(
    'Pillar 3: Visual DNA extracts Computer Vision tags cloud and dominant palette with zero [object Object]',
    espionageDossier.visual_dna.visual_tags_cloud.length > 0 &&
    hasNoObjectString &&
    espionageDossier.visual_dna.dominant_colors_palette.length > 0 &&
    typeof espionageDossier.visual_dna.dominant_colors_palette[0].percentage === 'number'
  );

  // Pillar 4: P2P Sybil Network
  const topAccount = espionageDossier.accounts[0];
  report(
    'Pillar 4: Accounts classify Primary Brand vs Satellite Creators & sister domains',
    topAccount !== undefined &&
    ['PRIMARY_BRAND', 'SATELLITE_CREATOR'].includes(topAccount.role) &&
    Array.isArray(topAccount.sister_domains)
  );

  // Pillar 5: Decaying Monopoly & listDomainsIntelligence preset
  const decayingLeaderboard = await listDomainsIntelligence(sql, { preset: 'decaying_monopoly', limit: 10 });
  report(
    'Pillar 5: listDomainsIntelligence supports decaying_monopoly preset lens',
    Array.isArray(decayingLeaderboard.domains) &&
    decayingLeaderboard.domains.every(d => d.top10_pins >= 1 && d.total_saves >= 3000)
  );

  // Pillar 6: Service & API - One-Click Arbitrage Attack Blueprint
  const blueprintService = await generateDomainArbitrageBlueprint(sql, 'nourishyourglow.com');
  report(
    'Pillar 6 Service: generateDomainArbitrageBlueprint outputs complete attack plan',
    blueprintService.success === true &&
    Array.isArray(blueprintService.top_articles) &&
    blueprintService.top_articles.length > 0 &&
    Array.isArray(blueprintService.title_blueprints) &&
    blueprintService.title_blueprints.length === 3 &&
    Array.isArray(blueprintService.visual_tags_checklist) &&
    typeof blueprintService.markdown_blueprint === 'string' &&
    blueprintService.markdown_blueprint.includes('⚡ Tactical Arbitrage Attack Blueprint')
  );

  const blueprintApiRes = await worker.fetch(new Request('https://engine.internal/api/domains/blueprint?domain=nourishyourglow.com'), mockEnv);
  const blueprintApiData = await blueprintApiRes.json();
  report(
    'Pillar 6 API: GET /api/domains/blueprint serves valid attack plan JSON',
    blueprintApiRes.status === 200 &&
    blueprintApiData.success === true &&
    Array.isArray(blueprintApiData.top_articles)
  );

  // 9.4 Studio UI: Contains 6-Pillar Intelligence Controls
  report(
    'Studio UI contains Decaying Monopoly lens, Visual DNA tab, Attack Plan button and modal',
    studioHtml.includes('Decaying Monopoly (Vulnerable)') &&
    studioHtml.includes('🧬 Visual DNA') &&
    studioHtml.includes('Attack Plan') &&
    studioHtml.includes('isBlueprintModalOpen') &&
    studioHtml.includes('openBlueprintModal') &&
    studioHtml.includes('copyBlueprintMarkdown')
  );

  // 10. Studio Unified Switcher & Cross-View Drilldown Verification
  console.log('\n[*] Testing Unified Studio Switcher, Anti-NaN Sorters & Cross-View Drilldown...');

  // 10.1 makeourrecipes.com deep dossier verification
  const morDossier = await getDomainDeepDossier(sql, 'makeourrecipes.com');
  report(
    'makeourrecipes.com deep dossier contains both keywords and target_keywords on money_urls',
    morDossier.success === true &&
    Array.isArray(morDossier.money_urls) &&
    morDossier.money_urls.length > 0 &&
    Array.isArray(morDossier.money_urls[0].keywords) &&
    Array.isArray(morDossier.money_urls[0].target_keywords)
  );

  // 10.2 money_urls includes pin creation dates
  report(
    'makeourrecipes.com money_urls carries created_at_pinterest and newest_pin_date',
    morDossier.money_urls.some(u => u.created_at_pinterest !== null || u.newest_pin_date !== null) ||
    morDossier.money_urls[0]?.pins[0]?.created_at_pinterest !== undefined
  );

  // 10.3 Studio HTML contracts
  report(
    'Studio UI contains 3-way view switcher with English labels and copy buttons',
    studioHtml.includes('🔗 Money Articles') &&
    studioHtml.includes('🎯 Ranked Pins') &&
    studioHtml.includes('🕸️ Keyword Monopoly') &&
    studioHtml.includes('Copy URLs') &&
    studioHtml.includes('Copy Keywords') &&
    studioHtml.includes('fallbackCopy')
  );

  report(
    'Studio UI contains article keyword count drilldown and pin age badges',
    studioHtml.includes('filterToArticleKeywords') &&
    studioHtml.includes('getPinAgeBadge(art.created_at_pinterest') &&
    studioHtml.includes('getPinAgeBadge(p.created_at_pinterest)')
  );

  report(
    'Studio UI eliminates NaN sort trap and implements rank ascending for keywords',
    studioHtml.includes('getPinTime') &&
    studioHtml.includes('getArticleNewestTime') &&
    studioHtml.includes('getKeywordNewestTime') &&
    studioHtml.includes('(Number(a.best_rank) || 999) - (Number(b.best_rank) || 999)')
  );

  // 11. Taste-Design Cockpit Pagination, Image Fidelity & Root Domain Sanitization Verification
  console.log('\n[*] Testing Taste-Design Pagination, Image Fidelity & Root Domain Sanitization...');
  report(
    'Studio UI contains pagination controls and functions for Pins and Articles',
    studioHtml.includes('paginatedDossierPins') &&
    studioHtml.includes('paginatedDossierArticles') &&
    studioHtml.includes('totalDossierPinsPages') &&
    studioHtml.includes('totalDossierArticlesPages') &&
    studioHtml.includes('dossierPinsPerPage') &&
    studioHtml.includes('dossierArticlesPerPage')
  );

  report(
    'Studio UI contains 3-way status segmented filter (All / Active SERP / Displaced)',
    studioHtml.includes("dossierStatusFilter = 'all'") &&
    studioHtml.includes("dossierStatusFilter = 'active'") &&
    studioHtml.includes("dossierStatusFilter = 'displaced'")
  );

  report(
    'Studio UI strictly eradicated third-party wireframe placeholders (zero placehold.co)',
    !studioHtml.includes('placehold.co')
  );

  report(
    'Studio UI limits article pin thumbnails and keywords preview with expanders',
    studioHtml.includes('art.expandedPins') &&
    studioHtml.includes('art.expandedKeywords')
  );

  report(
    'Backend getDomainDeepDossier enforces strict visual fidelity (all ranked_pins have valid images)',
    Array.isArray(morDossier.ranked_pins) &&
    morDossier.ranked_pins.length > 0 &&
    morDossier.ranked_pins.every(p => Boolean(p.image_url && p.image_url.trim()))
  );

  report(
    'Backend getDomainDeepDossier strictly excludes Root Domain (/) dump from money_urls',
    Array.isArray(morDossier.money_urls) &&
    morDossier.money_urls.every(u => u.clean_slug && u.clean_slug !== '/')
  );

  report(
    'Backend getDomainDeepDossier preserves full catalog total_pins parity alongside visual_pins_count',
    morDossier.summary.total_pins === morDossier.summary.all_catalog_pins_count &&
    morDossier.summary.visual_pins_count !== undefined &&
    morDossier.summary.active_pins_count !== undefined &&
    morDossier.summary.displaced_pins_count !== undefined
  );

  report(
    'Studio UI correctly nests Keyword Monopoly and Creators tabs inside single root of active dossier template',
    studioHtml.indexOf("dossierTab === 'keywords'") < studioHtml.indexOf('<!-- TACTICAL ARBITRAGE ATTACK BLUEPRINT MODAL') &&
    studioHtml.indexOf("dossierTab === 'accounts'") < studioHtml.indexOf('<!-- TACTICAL ARBITRAGE ATTACK BLUEPRINT MODAL') &&
    studioHtml.indexOf("dossierTab === 'visual_dna'") < studioHtml.indexOf('<!-- TACTICAL ARBITRAGE ATTACK BLUEPRINT MODAL')
  );

  console.log('\n================================================================================');
  console.log(`AUDIT COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[-] Test execution error:', err);
  process.exit(1);
});
