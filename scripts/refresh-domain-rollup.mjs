/**
 * scripts/refresh-domain-rollup.mjs
 * 
 * Standalone CLI script to recompute the domain_intelligence_rollup table
 * against Central Hub Postgres with zero catalog pin pollution.
 */

import fs from 'fs';
import { createSqlClient } from '../src/db/client.mjs';
import { refreshDomainIntelligenceRollup } from '../src/modules/domains/service.mjs';

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/DATABASE_URL="?([^"\r\n]+)"?/);
  if (match) dbUrl = match[1];
}

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
const startTime = Date.now();

try {
  const res = await refreshDomainIntelligenceRollup(sql);

  // [INVARIANT: REFRESH-PULSE-MV] Refresh Materialized View for Pulse 24h Summary
  try {
    console.log('[DomainRollup] Refreshing mv_pulse_24h_summary...');
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
    console.log('[DomainRollup] Successfully refreshed mv_pulse_24h_summary.');
  } catch (mvErr) {
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
    await sql.end?.({ timeout: 2 }).catch(() => {});
    process.exit(0);
  } else {
    console.error(`[DomainRollup] Refresh failed in ${elapsed}s:`, res.error);
    await sql.end?.({ timeout: 2 }).catch(() => {});
    process.exit(1);
  }
} catch (err) {
  console.error('[DomainRollup] Unexpected error:', err.message);
  await sql.end?.({ timeout: 2 }).catch(() => {});
  process.exit(1);
}
