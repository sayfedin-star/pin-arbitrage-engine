#!/usr/bin/env node

/**
 * scripts/crawler-engine.mjs
 *
 * Distributed Matrix Crawler & Intelligence Pipeline
 * Implements deterministic Modulo Sharding (20-Shard Parallel Architecture)
 * Unified for Creator Profiles & PinArchive Engine
 *
 * Dual-Mode Sharding:
 * 1. Account-Level Sharding: When TARGET_ACCOUNT is not specified, active accounts
 *    are partitioned across the 20 shards (idx % shardTotal === shardIndex).
 * 2. Board-Level Sharding: When TARGET_ACCOUNT is specified, that creator's boards
 *    are partitioned across the 20 shards (boardIdx % shardTotal === shardIndex).
 *    Supports TARGET_BOARDS filter for targeted board harvesting.
 *
 * Reverse-Engineered Signals & Anti-Bot:
 * - Chrome 151 User-Agent & PWS Client Hints
 * - AbortSignal.timeout(8000) fail-safe
 * - Jitter delays (2500ms - 4000ms)
 * - 3-Tier Qualification (Saves >= 100, Repins >= 100, Fresh High Velocity)
 * - Raw Catalog Ingest to competitor_pins / creator_pins
 */

import { neon } from '@neondatabase/serverless';
import {
  syncCompetitorPins,
  syncCompetitorBoardPins,
  syncCompetitorBoards,
  syncCompetitorProfile
} from '../src/modules/competitors/service.mjs';
import { fetchBoardsResource } from './lib/pinterest.mjs';

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
 * Deterministic Modulo Sharding across Accounts:
 * Assigns accounts across N shards based on index % shardTotal.
 * Guarantees Zero Collisions and 100% even load distribution.
 */
export async function getAccountsAssignedToShard(sqlClient, shardNumber, shardTotal) {
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

/**
 * Discover or load boards for a targeted account
 */
export async function getBoardsForTargetAccount(sqlClient, username, cookie = '') {
  const cleanUsername = String(username).replace(/^@+/, '').trim().toLowerCase();

  // 1. Try competitor_boards from DB first
  let dbBoards = [];
  try {
    dbBoards = await sqlClient`
      SELECT cb.board_id, cb.name, cb.url, cb.pin_count, cb.follower_count
      FROM competitor_boards cb
      JOIN competitor_profiles cp ON cp.id = cb.competitor_id
      WHERE LOWER(cp.username) = ${cleanUsername}
      ORDER BY cb.pin_count DESC, cb.id ASC;
    `;
  } catch (_) {}

  if (dbBoards.length > 0) {
    const valid = dbBoards.filter(b => b.board_id && !String(b.board_id).startsWith('-'));
    if (valid.length > 0) return valid;
  }

  // 2. Sync boards from Pinterest BoardsResource to DB
  try {
    const syncRes = await syncCompetitorBoards(sqlClient, cleanUsername, cleanUsername, cookie);
    if (syncRes.ok && Array.isArray(syncRes.boards) && syncRes.boards.length > 0) {
      const valid = syncRes.boards.filter(b => b.board_id && !String(b.board_id).startsWith('-'));
      if (valid.length > 0) return valid;
    }
  } catch (err) {
    console.warn(`[!] Failed to sync boards via syncCompetitorBoards for @${cleanUsername}:`, err.message);
  }

  // 3. Direct Pinterest fetch fallback
  try {
    const pRes = await fetchBoardsResource(cleanUsername, cookie);
    if (pRes.ok && Array.isArray(pRes.boards)) {
      return pRes.boards.filter(b => b.board_id && !String(b.board_id).startsWith('-'));
    }
  } catch (_) {}

  return [];
}

async function main() {
  const shardNumber = process.env.SHARD_NUMBER ? parseInt(process.env.SHARD_NUMBER, 10) : 1;
  const shardTotal = process.env.SHARD_TOTAL ? parseInt(process.env.SHARD_TOTAL, 10) : 1;
  const targetAccount = (process.env.TARGET_ACCOUNT || '').replace(/^@+/, '').trim();
  const targetBoardsRaw = (process.env.TARGET_BOARDS || '').trim();
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
  console.log(`   Shard:          ${shardNumber}/${shardTotal}`);
  console.log(`   Mode:           ${crawlMode.toUpperCase()} (max_pages: ${maxPages})`);
  console.log(`   Target Account: ${targetAccount || 'Scheduled Queue (Account Modulo Sharding)'}`);
  if (targetAccount) {
    console.log(`   Target Boards:  ${targetBoardsRaw || 'ALL Boards (Board Modulo Sharding across 20 Shards)'}`);
  }
  console.log('================================================================');

  let totalCrawled = 0;
  let totalQualified = 0;

  // ============================================================================
  // CASE 1: TARGETED SINGLE ACCOUNT -> BOARD-LEVEL 20-SHARD MATRIX SHARDING
  // ============================================================================
  if (targetAccount) {
    const cleanUser = targetAccount.toLowerCase();

    // Shard 1 performs an initial fast profile sync to update reach/views/followers
    if (shardNumber === 1) {
      try {
        console.log(`[*] [Shard 1] Performing profile refresh for @${cleanUser}...`);
        await syncCompetitorProfile(sql, cleanUser, cookie);
      } catch (profErr) {
        console.warn(`[!] Profile refresh failed for @${cleanUser}:`, profErr.message);
      }
    }

    // Load all discovered boards for this target account
    console.log(`[*] Loading boards for @${cleanUser}...`);
    let allBoards = await getBoardsForTargetAccount(sql, cleanUser, cookie);

    // Apply TARGET_BOARDS filter if provided
    if (targetBoardsRaw) {
      const filters = targetBoardsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (filters.length > 0) {
        const filtered = allBoards.filter(b => {
          const bName = (b.name || '').toLowerCase();
          const bId = String(b.board_id || '').toLowerCase();
          return filters.some(f => bName.includes(f) || bId === f);
        });
        if (filtered.length > 0) {
          console.log(`[Board Filter] Matched ${filtered.length} of ${allBoards.length} boards using filter "${targetBoardsRaw}"`);
          allBoards = filtered;
        } else {
          console.warn(`[Board Filter] Filter "${targetBoardsRaw}" matched 0 boards. Falling back to all ${allBoards.length} boards.`);
        }
      }
    }

    // If no boards could be discovered at all, fall back to profile-level crawl on Shard 1
    if (allBoards.length === 0) {
      if (shardNumber === 1) {
        console.log(`[!] No boards found for @${cleanUser}. Shard 1 falling back to profile pin feed crawl...`);
        try {
          const res = await syncCompetitorPins(sql, cleanUser, cleanUser, {
            mode: crawlMode,
            maxPages: maxPages,
            cookie: cookie
          });
          totalCrawled = res.crawled ?? res.total_fetched ?? 0;
          totalQualified = res.qualified ?? res.qualified_archived ?? 0;
          console.log(`[✓] Profile feed crawl finished: ${totalCrawled} pins, ${totalQualified} qualified.`);
        } catch (err) {
          console.error(`[-] Error crawling profile feed for @${cleanUser}:`, err.message);
        }
      } else {
        console.log(`[+] No boards found for @${cleanUser}. Shard ${shardNumber}/${shardTotal} exiting cleanly.`);
      }
      printSummary(shardNumber, shardTotal, 1, totalCrawled, totalQualified);
      process.exit(0);
    }

    // Deterministic Modulo Sharding on Boards: (idx % shardTotal) === (shardNumber - 1)
    const shardIndex = shardNumber - 1;
    const assignedBoards = allBoards.filter((_, idx) => (idx % shardTotal) === shardIndex);

    console.log(`\n================================================================`);
    console.log(`📋 [Board Sharding] Account: @${cleanUser}`);
    console.log(`   Total Boards Discovered: ${allBoards.length}`);
    console.log(`   Assigned to Shard ${shardNumber}/${shardTotal}: ${assignedBoards.length} board(s)`);
    if (assignedBoards.length > 0) {
      assignedBoards.forEach((b, i) => {
        console.log(`   ${i + 1}. "${b.name}" (${b.board_id}) - ~${b.pin_count || 0} pins`);
      });
    } else {
      console.log(`   (No boards assigned to this shard - total boards < shard count)`);
    }
    console.log('================================================================\n');

    if (assignedBoards.length === 0) {
      console.log(`[+] Shard ${shardNumber}/${shardTotal} has no assigned boards. Clean exit.`);
      printSummary(shardNumber, shardTotal, 0, 0, 0);
      process.exit(0);
    }

    // Crawl each assigned board
    for (let i = 0; i < assignedBoards.length; i++) {
      const board = assignedBoards[i];
      console.log(`\n[${i + 1}/${assignedBoards.length}] Crawling Board "${board.name}" (ID: ${board.board_id}, Max Pages: ${maxPages})...`);

      try {
        const boardRes = await syncCompetitorBoardPins(sql, cleanUser, cleanUser, board, {
          maxPages: maxPages,
          cookie: cookie
        });

        const crawled = boardRes.crawled ?? boardRes.total_fetched ?? 0;
        const qualified = boardRes.qualified ?? 0;
        totalCrawled += crawled;
        totalQualified += qualified;

        console.log(`[✓] Finished Board "${board.name}": ${crawled} pins crawled, ${qualified} qualified & mirrored to Winning Archive.`);
      } catch (bErr) {
        console.error(`[-] Error crawling Board "${board.name}":`, bErr.message);
      }
    }

    printSummary(shardNumber, shardTotal, assignedBoards.length, totalCrawled, totalQualified, 'Boards');
    process.exit(0);
  }

  // ============================================================================
  // CASE 2: SCHEDULED RUN -> ACCOUNT-LEVEL 20-SHARD MATRIX SHARDING
  // ============================================================================
  const queue = await getAccountsAssignedToShard(sql, shardNumber, shardTotal);
  console.log(`[Queue] Loaded ${queue.length} assigned accounts for Shard ${shardNumber}/${shardTotal}`);

  if (queue.length === 0) {
    console.log('[+] No accounts to process. Exiting cleanly.');
    printSummary(shardNumber, shardTotal, 0, 0, 0);
    process.exit(0);
  }

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

  printSummary(shardNumber, shardTotal, queue.length, totalCrawled, totalQualified, 'Accounts');
}

function printSummary(shardNumber, shardTotal, itemsCount, crawled, qualified, unit = 'Items') {
  console.log('\n================================================================');
  console.log(`🎉 Shard ${shardNumber}/${shardTotal} Execution Complete!`);
  console.log(`   Processed ${unit}:    ${itemsCount}`);
  console.log(`   Total Pins Crawled: ${crawled}`);
  console.log(`   Qualified Winners:  ${qualified}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('[-] Fatal Crawler Error:', err);
  process.exit(1);
});
