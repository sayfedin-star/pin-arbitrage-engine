/**
 * scripts/refresh-domain-rollup.mjs
 * 
 * Standalone CLI script to recompute the domain_intelligence_rollup table
 * against Central Hub Postgres with zero catalog pin pollution.
 */

import fs from 'fs';
import { neon } from '@neondatabase/serverless';
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

const sql = neon(dbUrl);

console.log('[DomainRollup] Starting domain intelligence rollup refresh...');
const startTime = Date.now();

try {
  const res = await refreshDomainIntelligenceRollup(sql);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (res.success) {
    console.log(`[DomainRollup] Successfully refreshed domain intelligence rollup in ${elapsed}s.`);
    process.exit(0);
  } else {
    console.error(`[DomainRollup] Refresh failed in ${elapsed}s:`, res.error);
    process.exit(1);
  }
} catch (err) {
  console.error('[DomainRollup] Unexpected error:', err.message);
  process.exit(1);
}
