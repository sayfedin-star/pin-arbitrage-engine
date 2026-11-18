/**
 * scripts/refresh-domain-rollup.mjs
 *
 * Standalone CLI script to recompute the domain_intelligence_rollup table
 * and refresh mv_pulse_24h_summary against Unified PostgreSQL.
 */

import { createSqlClient } from '../src/db/client.mjs';
import { refreshDomainIntelligenceRollup } from '../src/modules/domains/service.mjs';
import { startInstaBoxActivityLease, loadDotEnvIfPresent } from './lib/cli-utils.mjs';

loadDotEnvIfPresent();
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = createSqlClient(dbUrl, {
  connection: {
    statement_timeout: 120000
  }
});

console.log('[DomainRollup] Starting domain intelligence rollup refresh...');
const lease = startInstaBoxActivityLease('refresh-domain-rollup');
const startTime = Date.now();

try {
  const res = await refreshDomainIntelligenceRollup(sql);

  // Refresh Materialized View for Pulse 24h Summary outside transaction
  try {
    console.log('[DomainRollup] Refreshing mv_pulse_24h_summary...');
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
    console.log('[DomainRollup] Successfully refreshed mv_pulse_24h_summary.');
  } catch (_) {
    try {
      await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
      console.log('[DomainRollup] Refreshed mv_pulse_24h_summary (standard mode).');
    } catch (e) {
      console.warn('[DomainRollup] Notice: mv_pulse_24h_summary refresh skipped:', e.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (res.success) {
    console.log(`[DomainRollup] Successfully refreshed domain intelligence rollup in ${elapsed}s.`);
  } else {
    console.error(`[DomainRollup] Refresh failed in ${elapsed}s:`, res.error);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[DomainRollup] Unexpected error:', err.message);
  process.exitCode = 1;
} finally {
  await lease.stop();
  await sql.end?.({ timeout: 2 }).catch(() => {});
}

process.exit(process.exitCode || 0);
