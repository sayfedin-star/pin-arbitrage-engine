#!/usr/bin/env node

/**
 * scripts/crawler-engine.mjs
 *
 * Distributed Matrix Crawler & Intelligence Pipeline
 * Implements:
 * 1. Stage 1 (Discovery): 100% pin ID ingestion from competitor feed & boards to competitor_pins (status = 'pending').
 * 2. Stage 2 (Enrichment Queue): 20-shard parallel execution using PostgreSQL Queue pattern (`FOR UPDATE SKIP LOCKED`).
 * 3. Daily Scheduled Cron: Profile & boards synchronization, daily snapshots with aggregate saves/repins,
 *    and daily winning pin deltas tracking.
 *
 * Reverse-Engineered Signals & Anti-Bot:
 * - Chrome 151 User-Agent & PWS Client Hints
 * - AbortSignal.timeout(8000) fail-safe
 * - Jitter delays (1200ms - 2500ms)
 * - 9-Field Deep Extraction via scripts/lib/pinterest.mjs (Relay v3 parser)
 */

import { neon } from '@neondatabase/serverless';
import {
  syncCompetitorPins,
  syncCompetitorBoardPins,
  syncCompetitorBoards,
  syncCompetitorProfile
} from '../src/modules/competitors/service.mjs';
import { syncCompetitorAcrossFleet } from '../src/modules/fleet/service.mjs';
import { fetchBoardsResource, fetchPinFromPinterest, sleep, randomJitterMs } from './lib/pinterest.mjs';

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
 * Deterministic Modulo Partitioning across Active Accounts
 */
export async function getAccountsAssignedToShard(sqlClient, shardNumber, shardTotal) {
  let allAccounts = [];
  try {
    allAccounts = await sqlClient`
      SELECT id, username, display_name, monthly_reach, profile_views, follower_count, total_pins, total_boards, last_synced_at
      FROM competitor_profiles
      WHERE is_active = TRUE
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC;
    `;
  } catch (err) {
    try {
      allAccounts = await sqlClient`
        SELECT id, username, display_name, monthly_reach, profile_views, follower_count, total_pins, total_boards, last_synced_at
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
  const shardIndex = sNum - 1;

  const assigned = allAccounts.filter((_, idx) => (idx % sTot) === shardIndex);
  console.log(`[Matrix Partitioning] Shard ${sNum}/${sTot}: Assigned ${assigned.length} of ${allAccounts.length} active accounts.`);
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

/**
 * Stage 1: Full Discovery Job (Ingest 100% of pins into competitor_pins as 'pending')
 */
async function runDiscoveryJob(sqlClient, shardSql, cleanUser, maxPages, cookie, targetBoardsRaw) {
  console.log(`\n================================================================`);
  console.log(`🔎 [STAGE 1: DISCOVERY] Starting Full Pin ID Ingestion for @${cleanUser}`);
  console.log(`================================================================`);

  // 1. Sync Profile & Baseline
  let compProfile = null;
  try {
    console.log(`[*] [1/4] Refreshing competitor profile for @${cleanUser}...`);
    const profRes = await syncCompetitorProfile(sqlClient, cleanUser, cookie);
    compProfile = profRes?.profile || null;
    if (shardSql) {
      await syncCompetitorProfile(shardSql, cleanUser, cookie).catch(() => {});
    }
    console.log(`    [✓] Profile synced (Reach: ${compProfile?.monthly_reach ?? 'N/A'}, Views: ${compProfile?.profile_views ?? 'N/A'})`);
  } catch (err) {
    console.warn(`[!] Profile sync warning:`, err.message);
  }

  // Look up competitor numeric ID
  let compId = compProfile?.id;
  if (!compId) {
    const [row] = await sqlClient`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
    compId = row?.id;
  }

  // 2. Discover Boards
  console.log(`[*] [2/4] Discovering boards for @${cleanUser}...`);
  let allBoards = await getBoardsForTargetAccount(sqlClient, cleanUser, cookie);
  if (targetBoardsRaw) {
    const filters = targetBoardsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (filters.length > 0) {
      const filtered = allBoards.filter(b => {
        const bName = (b.name || '').toLowerCase();
        const bId = String(b.board_id || '').toLowerCase();
        return filters.some(f => bName.includes(f) || bId === f);
      });
      if (filtered.length > 0) allBoards = filtered;
    }
  }
  console.log(`    [✓] Discovered ${allBoards.length} boards.`);

  // 3. Harvest Pins from Feed and Boards into competitor_pins (all marked as 'pending')
  console.log(`[*] [3/4] Deep crawling feeds & boards (maxPages: ${maxPages})...`);
  let totalDiscovered = 0;

  // 3a. Profile pin feed
  try {
    const feedRes = await syncCompetitorPins(sqlClient, compId || cleanUser, cleanUser, {
      mode: 'discovery',
      maxPages: maxPages,
      cookie: cookie
    });
    const cCount = feedRes?.crawled ?? feedRes?.total_fetched ?? 0;
    totalDiscovered += cCount;
    console.log(`    [✓] Profile Feed: Ingested ${cCount} pin IDs.`);
  } catch (feedErr) {
    console.warn(`[!] Profile feed ingest warning:`, feedErr.message);
  }

  // 3b. Crawl individual boards
  for (const board of allBoards) {
    try {
      const bRes = await syncCompetitorBoardPins(sqlClient, compId || cleanUser, cleanUser, board, {
        maxPages: maxPages,
        cookie: cookie
      });
      const bCount = bRes?.crawled ?? bRes?.total_fetched ?? 0;
      totalDiscovered += bCount;
      console.log(`    [✓] Board "${board.name}": Ingested ${bCount} pin IDs.`);
    } catch (bErr) {
      console.warn(`[!] Board "${board.name}" ingest warning:`, bErr.message);
    }
  }

  // 4. Record Daily Snapshot with Total Saves/Repins in Metadata
  if (compId) {
    console.log(`[*] [4/4] Recording daily baseline snapshot & aggregates...`);
    try {
      const [agg] = await sqlClient`
        SELECT 
          COALESCE(SUM(save_count), 0)::bigint AS total_saves,
          COALESCE(SUM(repin_count), 0)::bigint AS total_repins,
          COUNT(*)::int AS total_pins
        FROM competitor_pins
        WHERE competitor_id = ${compId};
      `;

      await sqlClient`
        INSERT INTO competitor_history_snapshots (
          competitor_id, monthly_reach, profile_views, follower_count, total_pins, total_boards, recorded_date, metadata
        ) VALUES (
          ${compId},
          ${compProfile?.monthly_reach || 0},
          ${compProfile?.profile_views || 0},
          ${compProfile?.follower_count || 0},
          ${agg?.total_pins || compProfile?.total_pins || 0},
          ${allBoards.length},
          CURRENT_DATE,
          ${JSON.stringify({ total_saves: Number(agg?.total_saves || 0), total_repins: Number(agg?.total_repins || 0) })}::jsonb
        )
        ON CONFLICT (competitor_id, recorded_date) DO UPDATE SET
          total_pins = GREATEST(competitor_history_snapshots.total_pins, EXCLUDED.total_pins),
          metadata = competitor_history_snapshots.metadata || EXCLUDED.metadata;
      `;
      console.log(`    [✓] Daily snapshot saved (Total Pins: ${agg?.total_pins}, Saves: ${agg?.total_saves}, Repins: ${agg?.total_repins})`);
    } catch (snapErr) {
      console.warn(`[!] Snapshot save warning:`, snapErr.message);
    }
  }

  // Fleet replication
  try {
    await syncCompetitorAcrossFleet(sqlClient, cleanUser);
  } catch (_) {}

  // Check pending pins count in queue
  let pendingCount = 0;
  try {
    const [pRow] = await sqlClient`
      SELECT COUNT(*)::int AS cnt 
      FROM competitor_pins 
      WHERE (${compId ? sqlClient`competitor_id = ${compId}` : sqlClient`TRUE`})
        AND enrichment_status = 'pending';
    `;
    pendingCount = pRow?.cnt || 0;
  } catch (_) {}

  console.log(`\n================================================================`);
  console.log(`🎉 [STAGE 1 COMPLETE] Discovery finished for @${cleanUser}!`);
  console.log(`   Total Discovered Pins: ${totalDiscovered}`);
  console.log(`   Queue Pending Pins:     ${pendingCount} (Ready for 20-Shard Parallel Enrichment)`);
  console.log(`================================================================\n`);
}

/**
 * Stage 2: 20-Shard Parallel Matrix Queue Worker
 * Consumes pending pins concurrently using PostgreSQL `FOR UPDATE SKIP LOCKED`.
 */
async function runEnrichmentQueue(sqlClient, shardSql, shardNumber, shardTotal, targetAccount, cookie) {
  const cleanUser = targetAccount ? targetAccount.replace(/^@+/, '').trim().toLowerCase() : '';
  
  let compId = null;
  if (cleanUser) {
    try {
      const [row] = await sqlClient`SELECT id FROM competitor_profiles WHERE LOWER(username) = ${cleanUser} LIMIT 1;`;
      compId = row?.id || null;
    } catch (_) {}
  }

  console.log(`\n================================================================`);
  console.log(`⚡ [STAGE 2: ENRICHMENT QUEUE] Shard ${shardNumber}/${shardTotal} Active`);
  console.log(`   Scope: ${cleanUser ? `@${cleanUser} (ID: ${compId || 'N/A'})` : 'Global Pending Queue'}`);
  console.log(`   Concurrency Model: PostgreSQL 'FOR UPDATE SKIP LOCKED'`);
  console.log(`================================================================\n`);

  let totalEnriched = 0;
  let totalFailed = 0;
  let batchIndex = 0;

  while (true) {
    batchIndex++;

    // 1. Claim a batch of 25 pending pins with SKIP LOCKED
    let claimed = [];
    try {
      claimed = await sqlClient`
        WITH batch AS (
          SELECT id, pin_id, competitor_id, board_name
          FROM competitor_pins
          WHERE (${compId ? sqlClient`competitor_id = ${compId}` : sqlClient`TRUE`})
            AND enrichment_status = 'pending'
          LIMIT 25 FOR UPDATE SKIP LOCKED
        )
        UPDATE competitor_pins
        SET enrichment_status = 'processing'
        FROM batch
        WHERE competitor_pins.id = batch.id
        RETURNING competitor_pins.id, competitor_pins.pin_id, competitor_pins.competitor_id, competitor_pins.board_name;
      `;
    } catch (err) {
      console.error(`[-] [Shard ${shardNumber}] Error claiming queue batch:`, err.message);
      break;
    }

    if (!claimed || claimed.length === 0) {
      console.log(`[*] [Shard ${shardNumber}/${shardTotal}] No more pending pins in queue. Worker finished cleanly!`);
      break;
    }

    console.log(`[*] [Shard ${shardNumber}] Batch #${batchIndex}: Claimed ${claimed.length} pins for deep 9-field enrichment.`);

    // 2. Deeply enrich each claimed pin using Relay v3 parser
    for (let i = 0; i < claimed.length; i++) {
      const item = claimed[i];
      try {
        const fetchRes = await fetchPinFromPinterest(item.pin_id, cookie);
        if (fetchRes.ok && fetchRes.pin) {
          const pin = fetchRes.pin;

          // Extract the 9 authentic fields
          const saves = Math.max(0, Number(pin.saves || pin.save_count || 0));
          const repins = Math.max(0, Number(pin.repins || pin.repin_count || 0));
          const comments = Math.max(0, Number(pin.comments || pin.comment_count || 0));
          const shares = Math.max(0, Number(pin.shares || pin.share_count || 0));
          const reactions = pin.reactions || {};
          const annotations = Array.isArray(pin.annotations) ? pin.annotations : [];
          const dominantColor = pin.dominant_color || '#e60023';
          const altText = pin.alt_text || pin.seo_alt_text || '';
          const velocity = Number(pin.velocity || 0);
          const createdAtPinterest = pin.created_at_pinterest || pin.created_at || null;

          // 2a. Upsert into pa_pins (Winning Pins & Intelligence Catalog)
          await sqlClient`
            INSERT INTO pa_pins (
              pin_id, account_username, title, description, link, domain,
              board_name, image_url, dominant_color, saves, repins, comments,
              share_count, reactions, velocity, annotations, is_video, is_product,
              alt_text, created_at_pinterest, first_seen_at, last_updated_at
            ) VALUES (
              ${item.pin_id}, ${cleanUser || pin.account_username || ''},
              ${pin.title || ''}, ${pin.description || ''}, ${pin.link || ''},
              ${pin.domain || pin.link_domain || ''}, ${item.board_name || pin.board_name || ''},
              ${pin.image_url || ''}, ${dominantColor}, ${saves}, ${repins}, ${comments},
              ${shares}, ${JSON.stringify(reactions)}::jsonb, ${velocity},
              ${JSON.stringify(annotations)}::jsonb, ${Boolean(pin.is_video)},
              ${Boolean(pin.is_product)}, ${altText},
              ${createdAtPinterest ? new Date(createdAtPinterest) : null}, NOW(), NOW()
            )
            ON CONFLICT (pin_id) DO UPDATE SET
              title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE pa_pins.title END,
              description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE pa_pins.description END,
              link = CASE WHEN EXCLUDED.link <> '' THEN EXCLUDED.link ELSE pa_pins.link END,
              domain = CASE WHEN EXCLUDED.domain <> '' THEN EXCLUDED.domain ELSE pa_pins.domain END,
              board_name = CASE WHEN EXCLUDED.board_name <> '' THEN EXCLUDED.board_name ELSE pa_pins.board_name END,
              image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE pa_pins.image_url END,
              saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
              repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
              comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
              share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
              reactions = CASE WHEN EXCLUDED.reactions != '{}'::jsonb THEN EXCLUDED.reactions ELSE pa_pins.reactions END,
              annotations = CASE WHEN jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
              dominant_color = COALESCE(EXCLUDED.dominant_color, pa_pins.dominant_color),
              alt_text = COALESCE(EXCLUDED.alt_text, pa_pins.alt_text),
              velocity = CASE WHEN EXCLUDED.velocity > 0 THEN EXCLUDED.velocity ELSE pa_pins.velocity END,
              last_updated_at = NOW();
          `;

          // 2b. Record metric snapshot in pa_pin_metrics
          await sqlClient`
            INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
            VALUES (${item.pin_id}, NOW(), ${saves}, ${repins}, ${comments})
            ON CONFLICT (pin_id, recorded_at) DO NOTHING;
          `;

          // 2c. Mark competitor_pins record as completed
          await sqlClient`
            UPDATE competitor_pins
            SET enrichment_status = 'completed',
                save_count = GREATEST(save_count, ${saves}),
                repin_count = GREATEST(repin_count, ${repins}),
                comment_count = GREATEST(comment_count, ${comments}),
                alt_text = COALESCE(alt_text, ${altText}),
                last_seen_at = NOW()
            WHERE id = ${item.id};
          `;

          // 2d. Dual-write to dedicated fleet shard if connected
          if (shardSql) {
            try {
              await shardSql`
                INSERT INTO pa_pins (
                  pin_id, account_username, title, description, link, domain,
                  board_name, image_url, dominant_color, saves, repins, comments,
                  share_count, reactions, velocity, annotations, is_video, is_product,
                  alt_text, created_at_pinterest, first_seen_at, last_updated_at
                ) VALUES (
                  ${item.pin_id}, ${cleanUser || pin.account_username || ''},
                  ${pin.title || ''}, ${pin.description || ''}, ${pin.link || ''},
                  ${pin.domain || pin.link_domain || ''}, ${item.board_name || pin.board_name || ''},
                  ${pin.image_url || ''}, ${dominantColor}, ${saves}, ${repins}, ${comments},
                  ${shares}, ${JSON.stringify(reactions)}::jsonb, ${velocity},
                  ${JSON.stringify(annotations)}::jsonb, ${Boolean(pin.is_video)},
                  ${Boolean(pin.is_product)}, ${altText},
                  ${createdAtPinterest ? new Date(createdAtPinterest) : null}, NOW(), NOW()
                )
                ON CONFLICT (pin_id) DO UPDATE SET
                  saves = GREATEST(pa_pins.saves, EXCLUDED.saves),
                  repins = GREATEST(pa_pins.repins, EXCLUDED.repins),
                  comments = GREATEST(pa_pins.comments, EXCLUDED.comments),
                  share_count = GREATEST(pa_pins.share_count, EXCLUDED.share_count),
                  reactions = CASE WHEN EXCLUDED.reactions != '{}'::jsonb THEN EXCLUDED.reactions ELSE pa_pins.reactions END,
                  annotations = CASE WHEN jsonb_array_length(EXCLUDED.annotations) > 0 THEN EXCLUDED.annotations ELSE pa_pins.annotations END,
                  dominant_color = COALESCE(EXCLUDED.dominant_color, pa_pins.dominant_color),
                  alt_text = COALESCE(EXCLUDED.alt_text, pa_pins.alt_text),
                  last_updated_at = NOW();
              `.catch(() => {});
            } catch (_) {}
          }

          totalEnriched++;
        } else {
          // If Pinterest returned 404 or interstitial, mark as failed
          await sqlClient`
            UPDATE competitor_pins
            SET enrichment_status = 'failed'
            WHERE id = ${item.id};
          `;
          totalFailed++;
        }
      } catch (pinErr) {
        console.warn(`[!] [Shard ${shardNumber}] Warning on pin ${item.pin_id}:`, pinErr.message);
        await sqlClient`
          UPDATE competitor_pins
          SET enrichment_status = 'failed'
          WHERE id = ${item.id};
        `.catch(() => {});
        totalFailed++;
      }

      // Jitter delay between requests to preserve IP health
      await sleep(randomJitterMs(1200, 2200));
    }
  }

  console.log(`\n================================================================`);
  console.log(`🎉 [Shard ${shardNumber}/${shardTotal} Execution Complete]`);
  console.log(`   Successfully Enriched: ${totalEnriched} pins`);
  console.log(`   Failed / Inaccessible:  ${totalFailed} pins`);
  console.log(`================================================================\n`);
}

/**
 * Stage 3: Daily Scheduled Mode (Cron Trigger 0 2 * * *)
 * Sweeps active competitors, records 24h snapshots, and updates winning pin deltas.
 */
async function runDailyScheduledMode(sqlClient, shardSql, shardNumber, shardTotal, crawlMode, maxPages, cookie) {
  const queue = await getAccountsAssignedToShard(sqlClient, shardNumber, shardTotal);
  console.log(`[Scheduled Pulse] Loaded ${queue.length} assigned active accounts for Shard ${shardNumber}/${shardTotal}`);

  if (queue.length === 0) {
    console.log('[+] No accounts assigned to this shard. Clean exit.');
    return;
  }

  for (let i = 0; i < queue.length; i++) {
    const acc = queue[i];
    const username = (acc.username || '').replace(/^@+/, '').trim();
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${queue.length}] Scheduled Pulse: @${username} (Shard ${shardNumber}/${shardTotal})`);
    console.log(`----------------------------------------------------------------`);

    // 1. Refresh Profile Stats & Capture Today's Snapshot
    console.log(`[*] [1/4 Profile Snapshot] Refreshing stats & recording today's snapshot...`);
    try {
      await syncCompetitorProfile(sqlClient, username, cookie);
      if (shardSql) {
        await syncCompetitorProfile(shardSql, username, cookie).catch(() => {});
      }
      console.log(`    [✓] Profile snapshot recorded in competitor_history_snapshots.`);
    } catch (pErr) {
      console.warn(`    [!] Profile sync warning:`, pErr.message);
    }

    // 2. Discover Boards
    console.log(`[*] [2/4 Boards] Syncing boards for @${username}...`);
    try {
      await syncCompetitorBoards(sqlClient, acc.id, username, cookie);
    } catch (_) {}

    // 3. Discover New Pins (Early stop page 1-2)
    console.log(`[*] [3/4 New Pins Discovery] Checking for fresh pins...`);
    try {
      await syncCompetitorPins(sqlClient, acc.id, username, {
        mode: 'refresh',
        maxPages: 3,
        cookie: cookie
      });
    } catch (_) {}

    // 4. Winning Pins Metric Refresh (Updating 24h Saves Deltas & Velocity)
    console.log(`[*] [4/4 Winning Pins Delta] Refreshing active winning pins in pa_pins...`);
    try {
      const winningPins = await sqlClient`
        SELECT pin_id, saves, repins, comments
        FROM pa_pins
        WHERE LOWER(account_username) = ${username.toLowerCase()}
        ORDER BY saves DESC
        LIMIT 75;
      `;

      let refreshed = 0;
      for (const p of winningPins) {
        try {
          const fetchRes = await fetchPinFromPinterest(p.pin_id, cookie);
          if (fetchRes.ok && fetchRes.pin) {
            const fresh = fetchRes.pin;
            const freshSaves = Math.max(0, Number(fresh.saves || fresh.save_count || p.saves || 0));
            const freshRepins = Math.max(0, Number(fresh.repins || fresh.repin_count || p.repins || 0));
            const freshComments = Math.max(0, Number(fresh.comments || fresh.comment_count || p.comments || 0));
            const prevSaves = Number(p.saves || 0);
            const deltaSaves = Math.max(0, freshSaves - prevSaves);

            // Update pa_pins
            await sqlClient`
              UPDATE pa_pins
              SET saves = GREATEST(pa_pins.saves, ${freshSaves}::bigint),
                  repins = GREATEST(pa_pins.repins, ${freshRepins}::bigint),
                  comments = GREATEST(pa_pins.comments, ${freshComments}::int),
                  velocity = CASE WHEN ${deltaSaves} > 0 THEN ${deltaSaves} ELSE pa_pins.velocity END,
                  last_updated_at = NOW()
              WHERE pin_id = ${p.pin_id};
            `;

            // Insert daily point in pa_pin_metrics
            await sqlClient`
              INSERT INTO pa_pin_metrics (pin_id, recorded_at, saves, repins, comments)
              VALUES (${p.pin_id}, NOW(), ${freshSaves}, ${freshRepins}, ${freshComments})
              ON CONFLICT (pin_id, recorded_at) DO NOTHING;
            `;

            refreshed++;
          }
        } catch (_) {}
        await sleep(randomJitterMs(1000, 1800));
      }
      console.log(`    [✓] Refreshed ${refreshed}/${winningPins.length} winning pins for @${username}.`);
    } catch (wErr) {
      console.warn(`    [!] Winning pins refresh warning:`, wErr.message);
    }

    // Fleet cross-replication
    try {
      await syncCompetitorAcrossFleet(sqlClient, username);
    } catch (_) {}
  }

  // Also consume any pending items in queue
  console.log(`[*] Checking for pending pins across active queue...`);
  await runEnrichmentQueue(sqlClient, shardSql, shardNumber, shardTotal, '', cookie);
}

async function main() {
  const shardNumber = process.env.SHARD_NUMBER ? parseInt(process.env.SHARD_NUMBER, 10) : 1;
  const shardTotal = process.env.SHARD_TOTAL ? parseInt(process.env.SHARD_TOTAL, 10) : 1;
  const targetAccount = (process.env.TARGET_ACCOUNT || '').replace(/^@+/, '').trim();
  const targetBoardsRaw = (process.env.TARGET_BOARDS || '').trim();
  const crawlMode = (process.env.CRAWL_MODE || 'discovery').toLowerCase();
  const crawlPhase = (process.env.CRAWL_PHASE || '').toLowerCase();
  const maxPagesInput = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : null;
  const cookie = process.env.PINTEREST_COOKIE || '';

  let maxPages = maxPagesInput;
  if (!maxPages || isNaN(maxPages)) {
    maxPages = crawlMode === 'discovery' ? 500 : 3;
  }

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

  // ============================================================================
  // DISPATCH BASED ON CRAWL_PHASE OR CONTEXT
  // ============================================================================
  if (crawlPhase === 'discovery') {
    // Explicit Stage 1: Discovery only
    await runDiscoveryJob(sql, shardSql, targetAccount, maxPages, cookie, targetBoardsRaw);
  } else if (crawlPhase === 'enrichment') {
    // Explicit Stage 2: Queue worker across 20 shards
    await runEnrichmentQueue(sql, shardSql, shardNumber, shardTotal, targetAccount, cookie);
  } else if (targetAccount) {
    // Legacy / Single-Workflow fallback:
    // If shard 1, perform discovery first, then all shards participate in queue enrichment
    if (shardNumber === 1) {
      await runDiscoveryJob(sql, shardSql, targetAccount, maxPages, cookie, targetBoardsRaw);
    } else {
      // Shards 2..20 give Shard 1 a brief 10s head-start to populate initial queue
      console.log(`[*] Shard ${shardNumber}/${shardTotal} waiting 10s for Discovery Job initial batch...`);
      await sleep(10000);
    }
    await runEnrichmentQueue(sql, shardSql, shardNumber, shardTotal, targetAccount, cookie);
  } else {
    // Scheduled Cron Sweep across all accounts
    await runDailyScheduledMode(sql, shardSql, shardNumber, shardTotal, crawlMode, maxPages, cookie);
  }
}

main().catch(err => {
  console.error('[-] Fatal Crawler Engine Error:', err);
  process.exit(1);
});
