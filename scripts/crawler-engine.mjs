#!/usr/bin/env node

/**
 * scripts/crawler-engine.mjs
 *
 * Distributed Matrix Crawler & Intelligence Pipeline
 * Implements deterministic Modulo Sharding (20-Shard Parallel Architecture)
 * Unified for Creator Profiles & PinArchive Engine
 *
 * Reverse-Engineered Signals & Anti-Bot:
 * - Chrome 151 User-Agent & PWS Client Hints
 * - AbortSignal.timeout(8000) fail-safe
 * - Jitter delays (2500ms - 4000ms)
 * - 3-Tier Qualification (Saves >= 100, Repins >= 100, Fresh High Velocity)
 * - Raw Catalog Ingest to competitor_pins / creator_pins
 */

import { neon } from '@neondatabase/serverless';
import { syncCompetitorPins } from '../src/modules/competitors/service.mjs';

// Auto-load .env in local execution environments
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/**
 * Deterministic Modulo Sharding:
 * Assigns accounts across N shards based on index % shardTotal.
 * Guarantees Zero Collisions and 100% even load distribution.
 */
export async function getAccountsAssignedToShard(sqlClient, shardNumber, shardTotal) {
  // Try competitor_profiles or creator_profiles (backward/forward compatible)
  let allAccounts = [];
  try {
    allAccounts = await sqlClient`
      SELECT id, username, display_name, last_synced_at
      FROM competitor_profiles
      WHERE is_active = TRUE
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC;
    `;
  } catch (err) {
    try {
      allAccounts = await sqlClient`
        SELECT id, username, display_name, last_synced_at
        FROM creator_profiles
        WHERE is_active = TRUE
        ORDER BY last_synced_at ASC NULLS FIRST, id ASC;
      `;
    } catch (_) {
      console.error('[-] Failed to query active accounts table:', err.message);
      return [];
    }
  }

  if (!shardNumber || !shardTotal || Number(shardTotal) <= 1) {
    return allAccounts;
  }

  const sNum = parseInt(shardNumber, 10);
  const sTot = parseInt(shardTotal, 10);
  const shardIndex = sNum - 1; // 1-indexed to 0-indexed

  const assigned = allAccounts.filter((_, idx) => (idx % sTot) === shardIndex);
  console.log(`[Matrix Sharding] Shard ${sNum}/${sTot}: Assigned ${assigned.length} of ${allAccounts.length} active accounts.`);
  return assigned;
}

async function main() {
  const shardNumber = process.env.SHARD_NUMBER ? parseInt(process.env.SHARD_NUMBER, 10) : 1;
  const shardTotal = process.env.SHARD_TOTAL ? parseInt(process.env.SHARD_TOTAL, 10) : 1;
  const targetAccount = (process.env.TARGET_ACCOUNT || '').replace(/^@+/, '').trim();
  const crawlMode = (process.env.CRAWL_MODE || 'refresh').toLowerCase();
  const maxPagesInput = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : null;
  const cookie = process.env.PINTEREST_COOKIE || '';

  // Determine max pages: 'refresh' defaults to 3 (early stop), 'discovery' defaults to 500
  let maxPages = maxPagesInput;
  if (!maxPages || isNaN(maxPages)) {
    maxPages = crawlMode === 'discovery' ? 500 : 3;
  }

  console.log('================================================================');
  console.log(`🚀 Distributed Crawler Engine Starting`);
  console.log(`   Shard:      ${shardNumber}/${shardTotal}`);
  console.log(`   Mode:       ${crawlMode.toUpperCase()} (max_pages: ${maxPages})`);
  console.log(`   Target:     ${targetAccount || 'Scheduled Queue (Modulo Sharding)'}`);
  console.log('================================================================');

  let queue = [];

  if (targetAccount) {
    queue = [{ username: targetAccount, id: targetAccount }];
    console.log(`[Queue] Single target requested: @${targetAccount}`);
  } else {
    queue = await getAccountsAssignedToShard(sql, shardNumber, shardTotal);
    console.log(`[Queue] Loaded ${queue.length} assigned accounts for Shard ${shardNumber}`);
  }

  if (queue.length === 0) {
    console.log('[+] No accounts to process. Exiting cleanly.');
    process.exit(0);
  }

  let totalCrawled = 0;
  let totalQualified = 0;

  for (let i = 0; i < queue.length; i++) {
    const acc = queue[i];
    const username = (acc.username || '').replace(/^@+/, '').trim();
    console.log(`\n[${i + 1}/${queue.length}] Processing @${username} (Mode: ${crawlMode}, Max Pages: ${maxPages})...`);

    try {
      const result = await syncCompetitorPins(sql, acc.id, username, {
        mode: crawlMode,
        maxPages: maxPages,
        cookie: cookie
      });

      const crawled = result.crawled ?? result.total_fetched ?? 0;
      const qualified = result.qualified ?? result.qualified_archived ?? 0;
      totalCrawled += crawled;
      totalQualified += qualified;

      console.log(`[✓] Finished @${username}: ${crawled} pins crawled, ${qualified} qualified & mirrored to Winning Archive.`);
    } catch (err) {
      console.error(`[-] Error crawling @${username}:`, err.message);
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 Shard ${shardNumber}/${shardTotal} Execution Complete!`);
  console.log(`   Processed Accounts: ${queue.length}`);
  console.log(`   Total Pins Crawled: ${totalCrawled}`);
  console.log(`   Qualified Winners:  ${totalQualified}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('[-] Fatal Crawler Error:', err);
  process.exit(1);
});
