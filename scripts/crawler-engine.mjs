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
import { syncCompetitorAcrossFleet } from '../src/modules/fleet/service.mjs';
import { fetchBoardsResource, fetchPinFromPinterest } from './lib/pinterest.mjs';

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

  // Look up dedicated shard database in Neon registry if configured
  const shardName = `pin-arbitrage-shard-${String(shardNumber).padStart(2, '0')}`;
  let shardSql = null;
  try {
    const [sRow] = await sql`SELECT database_url FROM neon_projects_registry WHERE project_name = ${shardName} LIMIT 1;`;
    if (sRow?.database_url) {
      shardSql = neon(sRow.database_url);
      console.log(`[*] [Fleet Shard] Connected to dedicated shard DB: ${shardName}`);
    }
  } catch (_) {}

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
        await syncCompetitorAcrossFleet(sql, cleanUser);
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

        // Dual-write to dedicated shard database in Neon fleet if connected
        if (shardSql) {
          try {
            await syncCompetitorBoardPins(shardSql, cleanUser, cleanUser, board, {
              maxPages: maxPages,
              cookie: cookie
            });
          } catch (_) {}
        }

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

    // 1. Daily Competitor Profile Refresh (Monthly Reach, Views, Followers & History Snapshot)
    console.log(`[*] [1/5 Profile] Refreshing reach & follower stats for @${username}...`);
    try {
      await syncCompetitorProfile(sql, username, cookie);
      if (shardSql) {
        await syncCompetitorProfile(shardSql, username, cookie).catch(() => {});
      }
      console.log(`    [✓] Profile updated with latest Pinterest reach and snapshot recorded.`);
    } catch (profErr) {
      console.warn(`    [!] Profile refresh warning for @${username}:`, profErr.message);
    }

    // 2. Discover & Update Competitor Boards
    console.log(`[*] [2/5 Boards] Syncing discovered boards for @${username}...`);
    try {
      const bRes = await syncCompetitorBoards(sql, acc.id, username, cookie);
      if (shardSql) {
        await syncCompetitorBoards(shardSql, acc.id, username, cookie).catch(() => {});
      }
      console.log(`    [✓] Synced ${bRes?.boards?.length || bRes?.boards_synced || 0} boards.`);
    } catch (boardErr) {
      console.warn(`    [!] Board sync warning for @${username}:`, boardErr.message);
    }

    // 3. Harvest Latest Activity Pins (Anti-Bloat 3-Tier Filter)
    console.log(`[*] [3/5 Harvest] Ingesting latest pins for @${username}...`);
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

      // Dual-write to dedicated shard database in Neon fleet if connected
      if (shardSql) {
        try {
          await syncCompetitorPins(shardSql, acc.id, username, {
            mode: crawlMode,
            maxPages: maxPages,
            cookie: cookie
          });
        } catch (_) {}
      }

      console.log(`    [✓] Crawled ${crawled} new pins, ${qualified} newly qualified for Winning Archive.`);
    } catch (err) {
      console.error(`    [-] Error harvesting pins for @${username}:`, err.message);
    }

    // 4. Live Refresh of Existing Winning Pins in pa_pins (Capturing 24h Saves Deltas & Snapshots)
    console.log(`[*] [4/5 PinArchive] Refreshing metrics for archived winning pins of @${username}...`);
    try {
      const existingPins = await sql`
        SELECT pin_id, saves, repins, comments
        FROM pa_pins
        WHERE LOWER(account_username) = ${username.toLowerCase()}
        ORDER BY saves DESC
        LIMIT 50;
      `;
      if (existingPins.length > 0) {
        let refreshedCount = 0;
        for (const p of existingPins) {
          try {
            const fetchRes = await fetchPinFromPinterest(p.pin_id, '');
            if (fetchRes.ok && fetchRes.pin) {
              const fresh = fetchRes.pin;
              const freshSaves = Number(fresh.saves || fresh.save_count || p.saves || 0);
              const freshRepins = Number(fresh.repins || fresh.repin_count || p.repins || 0);
              const freshComments = Number(fresh.comments || fresh.comment_count || p.comments || 0);

              // Update pa_pins
              await sql`
                UPDATE pa_pins
                SET saves = GREATEST(pa_pins.saves, ${freshSaves}::bigint),
                    repins = GREATEST(pa_pins.repins, ${freshRepins}::bigint),
                    comments = GREATEST(pa_pins.comments, ${freshComments}::int),
                    last_updated_at = NOW()
                WHERE pin_id = ${p.pin_id};
              `;

              // Record time-series metric snapshot in pa_pin_metrics
              await sql`
                INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
                VALUES (${p.pin_id}, NOW(), ${freshSaves}, ${freshRepins}, ${freshComments})
                ON CONFLICT (pin_id, recorded_at) DO NOTHING;
              `;

              if (shardSql) {
                await shardSql`
                  UPDATE pa_pins
                  SET saves = GREATEST(pa_pins.saves, ${freshSaves}::bigint),
                      repins = GREATEST(pa_pins.repins, ${freshRepins}::bigint),
                      comments = GREATEST(pa_pins.comments, ${freshComments}::int),
                      last_updated_at = NOW()
                  WHERE pin_id = ${p.pin_id};
                `.catch(() => {});
                await shardSql`
                  INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
                  VALUES (${p.pin_id}, NOW(), ${freshSaves}, ${freshRepins}, ${freshComments})
                  ON CONFLICT (pin_id, recorded_at) DO NOTHING;
                `.catch(() => {});
              }
              refreshedCount++;
            }
          } catch (_) {}
        }
        console.log(`    [✓] Refreshed ${refreshedCount}/${existingPins.length} winning pins and captured time-series snapshots.`);
      } else {
        console.log(`    (No existing winning pins in pa_pins for @${username} yet)`);
      }
    } catch (refErr) {
      console.warn(`    [!] Pin metrics refresh warning for @${username}:`, refErr.message);
    }

    // 5. Fleet Cross-Database Replication
    console.log(`[*] [5/5 Fleet] Replicating updates for @${username} across fleet...`);
    try {
      await syncCompetitorAcrossFleet(sql, username);
      console.log(`    [✓] Fleet replicated.`);
    } catch (_) {}
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
