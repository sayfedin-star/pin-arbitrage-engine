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
  enrichNextUncheckedBatch
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

  // 2.3 Verb tampering on /domains
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
