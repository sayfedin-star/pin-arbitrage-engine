#!/usr/bin/env node

/**
 * scripts/domain-enrich.mjs
 *
 * Unified Global Domain Intelligence CLI Engine:
 *   --mode=whois  -> Multi-tier RDAP / Port-43 WHOIS / CT Log domain age verification
 *   --mode=ads    -> IAB ads.txt & publisher monetization network classification
 *   --mode=rollup -> Recompute domain_intelligence_rollup + refresh mv_pulse_24h_summary
 *   --mode=all    -> Execute whois -> ads -> rollup sequentially
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch
} from '../src/modules/domains/whois-age-service.mjs';
import {
  fetchAndCacheDomainAdNetwork,
  getDatabaseMonetizationStats,
  AD_NETWORK_DISPLAY_CONFIG
} from '../src/modules/domains/ad-network-service.mjs';
import { normalizeCleanDomain } from '../src/modules/domains/domain-constants.mjs';
import { refreshDomainIntelligenceRollup } from '../src/modules/domains/rollup-leaderboard-service.mjs';
import { sleep, randomJitterMs } from '../src/core/pinterest/index.mjs';
import {
  runFleetLifecycle,
  renderProgressBar,
  parseCliFlags
} from './lib/fleet-runner.mjs';

export const VALID_DOMAIN_ENRICH_MODES = Object.freeze(['whois', 'ads', 'rollup', 'all']);

/**
 * Parses and validates `--mode=whois|ads|rollup|all` plus `--batch`, `--concurrency`, `--max`, `--force`.
 */
export function parseDomainEnrichArgs(argv = process.argv.slice(2), env = process.env) {
  const { flags } = parseCliFlags(argv);
  const rawMode = String(flags.mode ?? env?.ENRICH_MODE ?? '').trim().toLowerCase();
  if (!VALID_DOMAIN_ENRICH_MODES.includes(rawMode)) {
    throw new Error(
      `Invalid or missing --mode="${rawMode}" for domain-enrich.mjs. Expected --mode=whois, --mode=ads, --mode=rollup, or --mode=all.`
    );
  }

  const parsedBatch = flags.batch !== undefined ? parseInt(String(flags.batch), 10) : NaN;
  const parsedConcurrency = flags.concurrency !== undefined ? parseInt(String(flags.concurrency), 10) : NaN;
  const parsedMax = flags.max !== undefined ? parseInt(String(flags.max), 10) : NaN;

  return {
    mode: rawMode,
    whoisBatchSize: Number.isFinite(parsedBatch) ? Math.max(5, Math.min(50, parsedBatch)) : 25,
    adsBatchSize: Number.isFinite(parsedBatch) ? Math.max(5, Math.min(50, parsedBatch)) : 15,
    whoisConcurrency: Number.isFinite(parsedConcurrency) ? Math.max(1, Math.min(5, parsedConcurrency)) : 4,
    adsConcurrency: Number.isFinite(parsedConcurrency) ? Math.max(1, Math.min(5, parsedConcurrency)) : 3,
    maxTotal: Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : Infinity,
    forceRefresh: flags.force === true || flags.force === 'true' || flags.force === '1',
    flags
  };
}

/**
 * Mode `whois`: Multi-tier RDAP / Port-43 WHOIS / CT Log domain age verification
 */
export async function runDomainWhoisEnrich(sql, {
  batchSize = 25,
  concurrency = 4,
  maxTotal = Infinity
} = {}) {
  console.log('==============================================================');
  console.log('🚀 Universal Domain Intelligence Global Age Verification Engine');
  console.log('==============================================================');
  console.log(`[*] Configuration: batchSize=${batchSize}, concurrency=${concurrency}`);

  const startStats = await getDatabaseEnrichmentStats(sql);
  console.log('[*] Database Status:');
  console.log(`    Total Unique Domains: ${startStats.total_domains}`);
  console.log(`    Already Checked:     ${startStats.checked_domains} (${startStats.percent_complete}%)`);
  console.log(`    - Resolved:          ${startStats.resolved_domains}`);
  console.log(`    - Privacy Shielded:  ${startStats.failed_domains}`);
  console.log(`    Unchecked Remaining: ${startStats.unchecked_domains}`);
  console.log('--------------------------------------------------------------');

  if (startStats.unchecked_domains === 0) {
    console.log('[✓] All domains in the database are already verified!');
    return { processed: 0, resolved: 0, failed: 0 };
  }

  let isInterrupted = false;
  const sigintHandler = () => {
    console.log('\n[!] Gracefully pausing after current batch completes...');
    isInterrupted = true;
  };
  process.once('SIGINT', sigintHandler);

  const startTime = Date.now();
  let totalProcessedThisRun = 0;
  let totalResolvedThisRun = 0;
  let totalFailedThisRun = 0;

  try {
    while (!isInterrupted && totalProcessedThisRun < maxTotal) {
      const batchRes = await enrichNextUncheckedBatch(sql, { batchSize, concurrency });
      if (!batchRes || batchRes.batch_size === 0 || batchRes.is_complete) {
        break;
      }

      totalProcessedThisRun += batchRes.enriched;
      totalResolvedThisRun += batchRes.resolved;
      totalFailedThisRun += batchRes.failed;

      const currentStats = batchRes.stats || await getDatabaseEnrichmentStats(sql);
      const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
      const rate = (totalProcessedThisRun / elapsedSec).toFixed(1);
      const pBar = renderProgressBar(currentStats.checked_domains, currentStats.total_domains);

      process.stdout.write(
        `\r${pBar} | Run: +${totalProcessedThisRun} (🌱 ${totalResolvedThisRun} / 🔒 ${totalFailedThisRun}) | ${rate} dom/s`
      );

      if (currentStats.unchecked_domains === 0) {
        break;
      }

      await new Promise(r => setTimeout(r, 400));
    }
  } finally {
    process.removeListener('SIGINT', sigintHandler);
  }

  console.log('\n--------------------------------------------------------------');
  const finalStats = await getDatabaseEnrichmentStats(sql);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('[✓] Verification Run Completed:');
  console.log(`    Time Elapsed:       ${totalElapsed}s`);
  console.log(`    Domains Checked:    ${totalProcessedThisRun}`);
  console.log(`    - Newly Resolved:   ${totalResolvedThisRun}`);
  console.log(`    - Privacy Shielded: ${totalFailedThisRun}`);
  console.log(`    Global Complete:    ${finalStats.checked_domains} / ${finalStats.total_domains} (${finalStats.percent_complete}%)`);
  console.log(`    Unchecked Left:     ${finalStats.unchecked_domains}`);
  console.log('==============================================================');

  return {
    processed: totalProcessedThisRun,
    resolved: totalResolvedThisRun,
    failed: totalFailedThisRun
  };
}

/**
 * Mode `ads`: IAB ads.txt & publisher monetization network classification
 */
export async function runDomainAdsEnrich(sql, {
  concurrency = 3,
  maxTotal = Infinity,
  forceRefresh = false
} = {}) {
  console.log('='.repeat(80));
  console.log('💰 GLOBAL AD NETWORK & MONETIZATION INTELLIGENCE RUNNER');
  console.log('='.repeat(80));

  const initialStats = await getDatabaseMonetizationStats(sql);
  console.log('[*] Initial Database Monetization Status:');
  console.log(`    Total Scanned:  ${initialStats.total_checked}`);
  console.log(`    💎 Raptive:     ${initialStats.raptive_count}`);
  console.log(`    🍇 Mediavine:   ${initialStats.mediavine_count}`);
  console.log(`    🚀 Journey:     ${initialStats.journey_count}`);
  console.log(`    ⚡ Ezoic:       ${initialStats.ezoic_count}`);
  console.log(`    🟡 AdSense:     ${initialStats.adsense_count}`);
  console.log(`    🛒 Affiliate:   ${initialStats.affiliate_count}`);
  console.log(`    🔄 Switched:    ${initialStats.switched_count}`);
  console.log('-'.repeat(80));

  const candidateRows = await sql`
    WITH all_candidates AS (
      SELECT
        ump.clean_domain,
        SUM(GREATEST(0, (51 - COALESCE(ksp.rank_position, 50))))::bigint AS visibility_score,
        SUM(COALESCE(ump.save_count, 0))::bigint AS total_saves
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
      GROUP BY ump.clean_domain

      UNION ALL

      SELECT
        ump.clean_domain,
        0::bigint AS visibility_score,
        SUM(COALESCE(ump.save_count, 0))::bigint AS total_saves
      FROM universal_master_pins ump
      WHERE ump.clean_domain IS NOT NULL AND ump.clean_domain <> ''
      GROUP BY ump.clean_domain
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
      GROUP BY clean_domain
    )
    SELECT agg.domain
    FROM aggregated agg
    LEFT JOIN domain_intelligence_rollup dir ON dir.domain = agg.domain
    WHERE (
      ${forceRefresh} = TRUE
      OR dir.domain IS NULL
      OR dir.ad_network IS NULL
      OR dir.ad_network = 'unchecked'
      OR (dir.ad_network = 'failed' AND COALESCE(dir.ads_checked_at, dir.updated_at) < NOW() - INTERVAL '14 days')
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
    return { processed: 0, detectedCounts: {} };
  }

  let processedCount = 0;
  const detectedCounts = {
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

  return { processed: processedCount, detectedCounts };
}

/**
 * Mode `rollup`: Recompute domain_intelligence_rollup and refresh mv_pulse_24h_summary
 */
export async function runDomainRollupRefresh(sql) {
  console.log('[DomainRollup] Starting domain intelligence rollup refresh...');
  const startTime = Date.now();
  const res = await refreshDomainIntelligenceRollup(sql);

  try {
    console.log('[DomainRollup] Refreshing mv_pulse_24h_summary...');
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
    await sql`VACUUM public.mv_pulse_24h_summary;`;
    console.log('[DomainRollup] Successfully refreshed and vacuumed mv_pulse_24h_summary.');
  } catch (_) {
    try {
      await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
      await sql`VACUUM public.mv_pulse_24h_summary;`;
      console.log('[DomainRollup] Refreshed and vacuumed mv_pulse_24h_summary (standard mode).');
    } catch (e) {
      console.warn('[DomainRollup] Notice: mv_pulse_24h_summary refresh skipped:', e.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (!res?.success) {
    throw new Error(`Domain intelligence rollup refresh failed in ${elapsed}s: ${res?.error || 'unknown error'}`);
  }
  console.log(`[DomainRollup] Successfully refreshed domain intelligence rollup in ${elapsed}s.`);
  return res;
}

export async function runDomainEnrich(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const parsed = parseDomainEnrichArgs(argv, env);
  const needsExtendedTimeout = parsed.mode === 'rollup' || parsed.mode === 'all';
  const sqlOptions = needsExtendedTimeout
    ? { connection: { statement_timeout: 120000 } }
    : undefined;

  return runFleetLifecycle(
    `domain-enrich-${parsed.mode}`,
    async ({ sql }) => {
      if (parsed.mode === 'whois') {
        return runDomainWhoisEnrich(sql, {
          batchSize: parsed.whoisBatchSize,
          concurrency: parsed.whoisConcurrency,
          maxTotal: parsed.maxTotal
        });
      }
      if (parsed.mode === 'ads') {
        return runDomainAdsEnrich(sql, {
          concurrency: parsed.adsConcurrency,
          maxTotal: parsed.maxTotal,
          forceRefresh: parsed.forceRefresh
        });
      }
      if (parsed.mode === 'rollup') {
        return runDomainRollupRefresh(sql);
      }

      const whois = await runDomainWhoisEnrich(sql, {
        batchSize: parsed.whoisBatchSize,
        concurrency: parsed.whoisConcurrency,
        maxTotal: parsed.maxTotal
      });
      const ads = await runDomainAdsEnrich(sql, {
        concurrency: parsed.adsConcurrency,
        maxTotal: parsed.maxTotal,
        forceRefresh: parsed.forceRefresh
      });
      const rollup = await runDomainRollupRefresh(sql);
      return { whois, ads, rollup };
    },
    {
      ...options,
      sqlOptions: options.sqlOptions ?? sqlOptions
    }
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runDomainEnrich().catch((err) => {
    console.error('[-] Fatal Domain Enrich Error:', err?.message || err);
    process.exit(1);
  });
}
