#!/usr/bin/env node

/**
 * scripts/enrich_all_domains.mjs
 * Automated Global Domain Intelligence & WHOIS Age Verification Runner
 *
 * Verifies all unchecked domains across the Neon database with multi-tier resolution:
 * Tier 1: Authoritative Registry RDAP (Verisign, PIR, Identity Digital)
 * Tier 2: Direct Socket WHOIS Port 43 for ccTLDs (.me, .co, .io, .ai, .uk, etc.)
 * Tier 3: Primary Multi-TLD Resolver Gateway
 * Tier 4: Certificate Transparency Logs (crt.sh)
 *
 * Usage:
 *   node --use-system-ca scripts/enrich_all_domains.mjs
 *   npm run enrich:domains
 *   node scripts/enrich_all_domains.mjs --batch=30 --concurrency=4
 */

import { createSqlClient } from '../src/db/client.mjs';
import {
  getDatabaseEnrichmentStats,
  enrichNextUncheckedBatch
} from '../src/modules/domains/service.mjs';
import { renderProgressBar, loadDotEnvIfPresent } from './lib/cli-utils.mjs';

loadDotEnvIfPresent();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const sql = createSqlClient(DATABASE_URL);

// Parse CLI flags
const args = process.argv.slice(2);
let batchSize = 25;
let concurrency = 4;
let maxTotal = Infinity;

for (const arg of args) {
  if (arg.startsWith('--batch=')) batchSize = Math.max(5, Math.min(50, parseInt(arg.split('=')[1], 10) || 25));
  if (arg.startsWith('--concurrency=')) concurrency = Math.max(1, Math.min(5, parseInt(arg.split('=')[1], 10) || 4));
  if (arg.startsWith('--max=')) maxTotal = Math.max(1, parseInt(arg.split('=')[1], 10) || Infinity);
}

async function main() {
  try {
  console.log('==============================================================');
  console.log('🚀 Universal Domain Intelligence Global Age Verification Engine');
  console.log('==============================================================');
  console.log(`[*] Target: Central Neon Serverless Hub`);
  console.log(`[*] Configuration: batchSize=${batchSize}, concurrency=${concurrency}`);

  const startStats = await getDatabaseEnrichmentStats(sql);
  console.log(`[*] Database Status:`);
  console.log(`    Total Unique Domains: ${startStats.total_domains}`);
  console.log(`    Already Checked:     ${startStats.checked_domains} (${startStats.percent_complete}%)`);
  console.log(`    - Resolved:          ${startStats.resolved_domains}`);
  console.log(`    - Privacy Shielded:  ${startStats.failed_domains}`);
  console.log(`    Unchecked Remaining: ${startStats.unchecked_domains}`);
  console.log('--------------------------------------------------------------');

  if (startStats.unchecked_domains === 0) {
    console.log('[✓] All domains in the database are already verified!');
    return;
  }

  let isInterrupted = false;
  process.on('SIGINT', () => {
    console.log('\n[!] Gracefully pausing after current batch completes...');
    isInterrupted = true;
  });

  const startTime = Date.now();
  let totalProcessedThisRun = 0;
  let totalResolvedThisRun = 0;
  let totalFailedThisRun = 0;

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

    // Brief inter-batch breathing room
    await new Promise(r => setTimeout(r, 400));
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
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

main().catch(err => {
  console.error('\n[-] Fatal error during domain verification:', err);
  process.exit(1);
});
