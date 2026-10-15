#!/usr/bin/env node

/**
 * scripts/enrich_domain_ads.mjs
 * High-Speed Ad Network & Monetization Intelligence Runner
 *
 * Scans candidate domains across Neon Serverless Postgres for IAB ads.txt,
 * classifies ad managers (Raptive, Mediavine, Journey, Ezoic, AdSense, Affiliate),
 * and tracks publisher network migrations.
 *
 * Usage:
 *   node --use-system-ca scripts/enrich_domain_ads.mjs
 *   npm run enrich:ads
 *   node scripts/enrich_domain_ads.mjs --batch=15 --concurrency=3
 */

import { neon } from '@neondatabase/serverless';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';
import {
  fetchAndCacheDomainAdNetwork,
  getDatabaseMonetizationStats,
  AD_NETWORK_DISPLAY_CONFIG
} from '../src/modules/domains/ad-network-service.mjs';
import {
  normalizeCleanDomain,
  IGNORED_INTERNAL_DOMAINS,
  ECOMMERCE_AND_SOCIAL_DOMAINS
} from '../src/modules/domains/service.mjs';
import { sleep, randomJitterMs } from './lib/pinterest.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const sql = neon(enforceNeonPoolerUrl(DATABASE_URL));

// Parse CLI flags
const args = process.argv.slice(2);
let batchSize = 15;
let concurrency = 3;
let maxTotal = Infinity;
let forceRefresh = false;

for (const arg of args) {
  if (arg.startsWith('--batch=')) batchSize = Math.max(5, Math.min(50, parseInt(arg.split('=')[1], 10) || 15));
  if (arg.startsWith('--concurrency=')) concurrency = Math.max(1, Math.min(5, parseInt(arg.split('=')[1], 10) || 3));
  if (arg.startsWith('--max=')) maxTotal = Math.max(1, parseInt(arg.split('=')[1], 10) || Infinity);
  if (arg === '--force') forceRefresh = true;
}

function renderProgressBar(current, total, width = 30) {
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percent.toFixed(1)}% (${current}/${total})`;
}

async function run() {
  console.log('='.repeat(80));
  console.log('💰 GLOBAL AD NETWORK & MONETIZATION INTELLIGENCE RUNNER');
  console.log('   Target: Neon Serverless Postgres Central Hub');
  console.log('='.repeat(80));

  const initialStats = await getDatabaseMonetizationStats(sql);
  console.log(`[*] Initial Database Monetization Status:`);
  console.log(`    Total Scanned:  ${initialStats.total_checked}`);
  console.log(`    💎 Raptive:     ${initialStats.raptive_count}`);
  console.log(`    🍇 Mediavine:   ${initialStats.mediavine_count}`);
  console.log(`    🚀 Journey:     ${initialStats.journey_count}`);
  console.log(`    ⚡ Ezoic:       ${initialStats.ezoic_count}`);
  console.log(`    🟡 AdSense:     ${initialStats.adsense_count}`);
  console.log(`    🛒 Affiliate:   ${initialStats.affiliate_count}`);
  console.log(`    🔄 Switched:    ${initialStats.switched_count}`);
  console.log('-'.repeat(80));

  // Find candidate domains ranked by visibility and saves
  const candidateRows = await sql`
    WITH all_candidates AS (
      SELECT
        LOWER(REGEXP_REPLACE(ksc.domain, '^www\\.', '')) AS clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(ksc.rank_position, 50))))::bigint AS visibility_score,
        SUM(COALESCE(ksc.save_count, 0))::bigint AS total_saves
      FROM keyword_serp_current ksc
      WHERE ksc.domain IS NOT NULL AND ksc.domain <> ''
      GROUP BY clean_domain

      UNION ALL

      SELECT
        LOWER(REGEXP_REPLACE(ump.domain, '^www\\.', '')) AS clean_domain,
        0::bigint AS visibility_score,
        0::bigint AS total_saves
      FROM universal_master_pins ump
      WHERE ump.domain IS NOT NULL AND ump.domain <> ''
      GROUP BY clean_domain

      UNION ALL

      SELECT
        LOWER(REGEXP_REPLACE(cp.link_domain, '^www\\.', '')) AS clean_domain,
        0::bigint AS visibility_score,
        SUM(COALESCE(cp.save_count, 0))::bigint AS total_saves
      FROM competitor_pins cp
      WHERE cp.link_domain IS NOT NULL AND cp.link_domain <> ''
      GROUP BY clean_domain
    ),
    aggregated AS (
      SELECT
        clean_domain AS domain,
        SUM(visibility_score)::bigint AS visibility_score,
        SUM(total_saves)::bigint AS total_saves
      FROM all_candidates
      WHERE clean_domain IS NOT NULL
        AND clean_domain <> ''
        AND clean_domain LIKE '%.%'
        AND clean_domain NOT LIKE '% %'
        AND LENGTH(clean_domain) >= 4
        AND clean_domain <> ALL(${IGNORED_INTERNAL_DOMAINS}::text[])
        AND clean_domain <> ALL(${ECOMMERCE_AND_SOCIAL_DOMAINS}::text[])
      GROUP BY clean_domain
    )
    SELECT agg.domain
    FROM aggregated agg
    LEFT JOIN domain_monetization_metadata dmm ON dmm.domain = agg.domain
    WHERE (
      ${forceRefresh} = TRUE
      OR dmm.domain IS NULL
      OR dmm.current_ad_network = 'unchecked'
      OR (dmm.current_ad_network = 'failed' AND dmm.checked_at < NOW() - INTERVAL '14 days')
    )
    ORDER BY agg.visibility_score DESC, agg.total_saves DESC
    LIMIT ${Number.isFinite(maxTotal) ? maxTotal : 500};
  `;

  const domainList = candidateRows
    .map(r => normalizeCleanDomain(r.domain))
    .filter(Boolean);

  const totalToEnrich = domainList.length;
  console.log(`[*] Discovered ${totalToEnrich} candidate domains pending ad network enrichment.`);
  if (totalToEnrich === 0) {
    console.log('[+] All domains in the database already have up-to-date monetization data!');
    return;
  }

  let processedCount = 0;
  let detectedCounts = {
    raptive: 0,
    mediavine: 0,
    journey: 0,
    ezoic: 0,
    adsense: 0,
    affiliate_only: 0,
    other: 0,
    switches: 0
  };

  const startTime = Date.now();

  for (let i = 0; i < domainList.length; i += concurrency) {
    const chunk = domainList.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (domain) => {
        try {
          return await fetchAndCacheDomainAdNetwork(sql, domain, { forceRefresh });
        } catch (_) {
          return { domain, current_ad_network: 'failed' };
        }
      })
    );

    for (const r of chunkResults) {
      if (!r) continue;
      processedCount++;
      const net = r.current_ad_network;
      if (detectedCounts[net] !== undefined) {
        detectedCounts[net]++;
      } else {
        detectedCounts.other++;
      }
      if (r.previous_ad_network) {
        detectedCounts.switches++;
      }

      const conf = AD_NETWORK_DISPLAY_CONFIG[net] || AD_NETWORK_DISPLAY_CONFIG.failed;
      const switchNotice = r.previous_ad_network ? ` (🔄 Ex-${r.previous_ad_network})` : '';
      console.log(`  [${processedCount}/${totalToEnrich}] ${r.domain.padEnd(28)} ➔ ${conf.badge}${switchNotice}`);
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const bar = renderProgressBar(processedCount, totalToEnrich);
    process.stdout.write(`\r[*] Progress: ${bar} | Elapsed: ${elapsedSec}s\n`);

    if (i + concurrency < domainList.length) {
      await sleep(randomJitterMs(200, 450));
    }
  }

  const finalStats = await getDatabaseMonetizationStats(sql);
  console.log('\n' + '='.repeat(80));
  console.log('✅ AD NETWORK INTELLIGENCE RUN COMPLETE');
  console.log('='.repeat(80));
  console.log(`Processed This Run:   ${processedCount} domains`);
  console.log(`New Raptive Sites:    ${detectedCounts.raptive}`);
  console.log(`New Mediavine Sites:  ${detectedCounts.mediavine}`);
  console.log(`New Journey Sites:    ${detectedCounts.journey}`);
  console.log(`New Ezoic Sites:      ${detectedCounts.ezoic}`);
  console.log(`AdSense Publishers:   ${detectedCounts.adsense}`);
  console.log(`Affiliate Only:       ${detectedCounts.affiliate_only}`);
  console.log(`Network Switches:     ${detectedCounts.switches}`);
  console.log('-'.repeat(80));
  console.log(`Database Total Checked: ${finalStats.total_checked} domains`);
  console.log('='.repeat(80));
}

run().catch((err) => {
  console.error('[-] Fatal Runner Error:', err);
  process.exit(1);
});
