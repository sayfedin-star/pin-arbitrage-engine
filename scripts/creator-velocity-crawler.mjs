#!/usr/bin/env node

/**
 * scripts/creator-velocity-crawler.mjs
 * 
 * Creator Intelligence & Velocity Autonomous Fleet Worker (20-Runner Swarm)
 * 
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 * 
 * Execution Modes:
 * 1. MODE='creator_sweep' (Scheduled Multi-Creator Sweep):
 *    - Phase 1: Creator reach, boards, and fresh pins discovery (early_stop_pages = 3)
 *      for assigned accounts (idx % worker_total === worker_index), promoting winners via reconcileQualifiedCatalogPins.
 *    - Barrier Sync: Workers synchronize completion of Phase 1 before starting Phase 2.
 *    - Phase 2: Global winning pins slice (crc32(pin_id) % 20 === worker_index) refreshing metrics
 *      via PinResource fast path (~90ms), computing 24h save velocity, committing active records
 *      to Hub and daily snapshots to target Neon Shards via batchGroupByShard(pins, 99).
 * 
 * 2. MODE='single_account_swarm' (Single-Account 20-Worker Swarm):
 *    - Phase 1: Worker 0 conducts board and feed discovery up to max_pages.
 *      Workers 1..19 wait for Worker 0 via Barrier Sync.
 *    - Phase 2: All 20 runners slice the pin catalog (crc32(pin_id) % 20 === worker_index)
 *      for parallel enrichment, shard sync, and qualification reconciliation.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import {
  syncCompetitorProfile,
  syncCompetitorBoards,
  syncCompetitorBoardPins,
  syncCompetitorPins,
  reconcileQualifiedCatalogPins,
  normalizePinterestUsername
} from '../src/modules/creators/service.mjs';
import {
  fetchPinFromPinResource,
  fetchPinFromPinterest,
  setDefaultDispatcher,
  sleep,
  randomJitterMs
} from './lib/pinterest.mjs';
import {
  batchGroupByShard,
  resolveShardConnection,
  preloadNeonRegistry,
  getPinShardId,
  crc32
} from '../src/modules/sharding/fleet-router.mjs';
import { sanitizeForJsonb } from '../src/utils.mjs';

// Setup optional Undici keep-alive agent
let undiciAgent = null;
try {
  const { Agent } = await import('undici');
  const candidateAgent = new Agent({ keepAliveTimeout: 30000, connections: 50, pipelining: 1 });
  if (String(process.versions?.undici || '').startsWith('8.')) {
    undiciAgent = candidateAgent;
  }
  setDefaultDispatcher(undiciAgent);
} catch (_) {}

// Auto-load .env in local environments
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const mode = (process.env.MODE || 'creator_sweep').toLowerCase().trim();
const rawWorkerIndex = parseInt(process.env.WORKER_INDEX || '0', 10);
const workerIndex = Number.isFinite(rawWorkerIndex) ? Math.max(0, rawWorkerIndex) : 0;
const rawWorkerTotal = parseInt(process.env.WORKER_TOTAL || '20', 10);
const workerTotal = Number.isFinite(rawWorkerTotal) && rawWorkerTotal > 0 ? rawWorkerTotal : 20;

const targetAccountInput = normalizePinterestUsername(process.env.TARGET_ACCOUNT || '');
const accountIdInput = process.env.ACCOUNT_ID ? parseInt(process.env.ACCOUNT_ID, 10) : null;
const accountIdsInput = (process.env.ACCOUNT_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));
const allAccountIdsInput = (process.env.ALL_ACCOUNT_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));

const crawlMode = (process.env.CRAWL_MODE || 'refresh').toLowerCase().trim();
const maxPagesInput = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : (mode === 'creator_sweep' ? 500 : 1000);
const maxPages = Number.isFinite(maxPagesInput) && maxPagesInput > 0 ? maxPagesInput : (mode === 'creator_sweep' ? 500 : 1000);
const cookie = process.env.PINTEREST_COOKIE || null;
const personalBoardsOnly = process.env.PERSONAL_BOARDS_ONLY !== 'false';
const targetBoardsInput = (process.env.TARGET_BOARDS || '').trim();
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

/**
 * Concurrency Limiter Semaphore
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
  }
  release() {
    this.count--;
    if (this.queue.length > 0) {
      this.count++;
      const next = this.queue.shift();
      next();
    }
  }
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Commit daily metric snapshots exclusively to designated Neon Storage Shards.
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 */
async function commitSnapshotsToStorageShards(hubSql, metricSnapshots) {
  if (!Array.isArray(metricSnapshots) || metricSnapshots.length === 0) return 0;

  const uniqueMetricsMap = new Map();
  for (const m of metricSnapshots) {
    if (m && m.pin_id) {
      uniqueMetricsMap.set(String(m.pin_id), m);
    }
  }
  const sortedMetrics = Array.from(uniqueMetricsMap.values()).sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
  if (sortedMetrics.length === 0) return 0;

  await preloadNeonRegistry(hubSql);
  const shardGroups = batchGroupByShard(sortedMetrics, 99);
  let totalCommitted = 0;

  for (const [shardId, shardMetrics] of shardGroups.entries()) {
    try {
      const shardSql = await resolveShardConnection({ hubSql, shardId }).catch(() => null);
      if (!shardSql) continue;

      const cleanMetrics = sanitizeForJsonb(shardMetrics);
      const jsonPayload = JSON.stringify(cleanMetrics);

      await shardSql`
        INSERT INTO pins_daily_metrics (
          pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
        )
        SELECT 
          x.pin_id, 
          (NOW() AT TIME ZONE 'UTC')::date, 
          COALESCE(x.saves, 0)::bigint, 
          COALESCE(x.repins, 0)::int, 
          COALESCE(x.comments, 0)::int,
          COALESCE(x.share_count, 0)::int,
          COALESCE(x.reaction_count, 0)::int,
          COALESCE(x.velocity, 0)::numeric,
          NOW()
        FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS x(
          pin_id VARCHAR(64), saves BIGINT, repins BIGINT, comments INT, share_count INT, reaction_count INT, velocity NUMERIC
        )
        ORDER BY x.pin_id ASC
        ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
          save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
          comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
          share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
          reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
          daily_save_velocity = CASE
            WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
            ELSE pins_daily_metrics.daily_save_velocity
          END,
          updated_at = NOW();
      `;
      totalCommitted += cleanMetrics.length;
    } catch (err) {
      console.warn(`[commitSnapshotsToStorageShards] Warning for shard #${shardId}:`, err.message);
    }
  }

  return totalCommitted;
}

/**
 * Route enriched pins to universal_master_pins on designated Neon Storage Shards.
 * [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */
async function syncPinsToMasterShards(hubSql, enrichedPins) {
  if (!Array.isArray(enrichedPins) || enrichedPins.length === 0) return 0;
  await preloadNeonRegistry(hubSql);
  const shardGroups = batchGroupByShard(enrichedPins, 99);
  let totalSynced = 0;

  for (const [shardId, shardPins] of shardGroups.entries()) {
    try {
      const shardSql = await resolveShardConnection({ hubSql, shardId }).catch(() => null);
      if (!shardSql) continue;

      const sortedPins = [...shardPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
      const payload = JSON.stringify(sortedPins.map(p => {
        const reactionCount = (p.reactions && typeof p.reactions === 'object' && p.reactions !== null)
          ? Object.values(p.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
          : (Number(p.reactions) || 0);

        return {
          pin_id: String(p.pin_id),
          creator_username: String(p.account_username || p.creator_username || ''),
          board_name: String(p.board_name || ''),
          title: String(p.title || ''),
          domain: String(p.domain || p.link_domain || ''),
          destination_url: String(p.link || p.destination_url || ''),
          image_url: String(p.image_url || ''),
          description: String(p.description || ''),
          alt_text: String(p.alt_text || ''),
          dominant_color: String(p.dominant_color || '#888888'),
          visual_annotations: p.annotations || p.visual_annotations || [],
          created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
          metadata: {
            is_product: Boolean(p.is_product),
            is_video: Boolean(p.is_video),
            reactions: p.reactions || {}
          },
          save_count: Number(p.saves || p.save_count || 0),
          repin_count: Number(p.repins || p.repin_count || 0),
          comment_count: Number(p.comments || p.comment_count || 0),
          share_count: Number(p.share_count || 0),
          reaction_count: reactionCount,
          daily_save_velocity: Number(p.velocity || p.daily_save_velocity || 0)
        };
      }));

      await shardSql`
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_name, title, domain, destination_url,
          image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
          first_discovered_pillar, first_discovered_at, updated_at
        )
        SELECT DISTINCT ON (u.pin_id)
          u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
          u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
          NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
          'competitor', NOW(), NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS u(
          pin_id text, creator_username text, board_name text, title text, domain text, destination_url text,
          image_url text, description text, alt_text text, dominant_color text, visual_annotations jsonb,
          created_at_pinterest text, metadata jsonb
        )
        ORDER BY u.pin_id ASC, u.title DESC NULLS LAST
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
          description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
          alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
          dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
          visual_annotations = CASE 
            WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
            THEN EXCLUDED.visual_annotations 
            ELSE universal_master_pins.visual_annotations 
          END,
          created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
          metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata
            || CASE
                 WHEN COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')) IS NOT NULL 
                  AND LOWER(TRIM(COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')))) NOT IN ('pinterest_platform')
                  AND (COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')) IS NULL 
                       OR LOWER(TRIM(COALESCE(NULLIF(EXCLUDED.metadata->>'creation_method', ''), NULLIF(EXCLUDED.metadata->>'method', '')))) = 'pinterest_platform')
                 THEN jsonb_build_object(
                   'creation_method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', '')),
                   'method', COALESCE(NULLIF(universal_master_pins.metadata->>'creation_method', ''), NULLIF(universal_master_pins.metadata->>'method', ''))
                 )
                 ELSE '{}'::jsonb
               END,
          updated_at = NOW();
      `;

      totalSynced += sortedPins.length;
    } catch (err) {
      console.warn(`[syncPinsToMasterShards] Warning for shard #${shardId}:`, err.message);
    }
  }

  return totalSynced;
}

/**
 * Multi-Day Time-Normalized Velocity Calculation with Intraday Ratchet Protection
 * [INVARIANT: VELOCITY-RATCHET-SYMMETRY]
 */
function computeNormalized24hVelocity(pin, freshSaves, prevSaves, prevVelocity) {
  const deltaSaves = Math.max(0, freshSaves - prevSaves);
  const now = new Date();
  const nowUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const baselineDateVal = pin.last_updated_at || pin.created_at_pinterest;
  let isSameDay = false;
  let elapsedDays = 1;

  if (baselineDateVal) {
    const baseD = baselineDateVal instanceof Date ? baselineDateVal : new Date(baselineDateVal);
    if (!isNaN(baseD.getTime())) {
      const baseUtcMidnight = Date.UTC(baseD.getUTCFullYear(), baseD.getUTCMonth(), baseD.getUTCDate());
      const msDiff = nowUtcMidnight - baseUtcMidnight;
      const days = Math.round(msDiff / 86400000);
      if (days <= 0 && pin.last_updated_at) {
        isSameDay = true;
      }
      elapsedDays = Math.max(1, days);
    }
  }

  const safePrevVelocity = Number.isFinite(prevVelocity) ? prevVelocity : 0;
  let velocity;
  if (isSameDay && deltaSaves === 0) {
    velocity = safePrevVelocity;
  } else if (isSameDay && deltaSaves > 0) {
    velocity = Math.max(safePrevVelocity, deltaSaves);
  } else {
    velocity = Math.round((deltaSaves / elapsedDays) * 10) / 10;
  }

  if (!Number.isFinite(velocity) || velocity < 0) {
    velocity = 0;
  }

  return { velocity, deltaSaves };
}

/**
 * Main Swarm Worker Engine
 */
async function run() {
  console.log('================================================================');
  console.log(`   🐝 CREATOR VELOCITY WORKER #${workerIndex + 1}/${workerTotal}`);
  console.log('================================================================');
  console.log(`[Worker] Mode:           ${mode}`);
  console.log(`[Worker] Target Account: "${targetAccountInput ? '@' + targetAccountInput : '<ALL>'}"`);
  console.log(`[Worker] Worker Slot:    ${workerIndex + 1} of ${workerTotal}`);
  console.log(`[Worker] Max Pages:      ${maxPages}`);

  if (mode === 'single_account_swarm') {
    // =========================================================================
    // EXECUTION MODE B: SINGLE-ACCOUNT SWARM
    // Worker 0 conducts board/feed ingestion; all 20 runners slice catalog
    // =========================================================================
    let targetAccount = targetAccountInput;
    let targetId = accountIdInput;
    let targetMetadata = {};

    if (!targetId) {
      const [row] = await sql`
        SELECT id, username, metadata FROM competitor_profiles WHERE username = ${targetAccount} LIMIT 1;
      `;
      if (!row) {
        console.error(`[-] FATAL: Account @${targetAccount} not found in database.`);
        process.exit(1);
      }
      targetId = row.id;
      targetAccount = row.username;
      targetMetadata = row.metadata || {};
    } else {
      const [row] = await sql`
        SELECT id, username, metadata FROM competitor_profiles WHERE id = ${targetId} LIMIT 1;
      `;
      if (row) {
        targetAccount = row.username || targetAccount;
        targetMetadata = row.metadata || {};
      }
    }

    const accRules = targetMetadata.qualification_rules || {};
    const earlyStop = Number(accRules.early_stop_pages) || 3;
    const targetPages = crawlMode === 'deep' || crawlMode === 'all'
      ? (Number(accRules.max_pages) || maxPages || 500)
      : (crawlMode === 'refresh' ? earlyStop : (maxPages || 500));

    console.log(`\n[*] Target Creator: @${targetAccount} (ID: ${targetId}) [target: ${targetPages} pages, early-stop: ${earlyStop}]`);

    // -------------------------------------------------------------------------
    // Phase 1: Ingestion on Worker 0
    // -------------------------------------------------------------------------
    if (workerIndex === 0) {
      console.log(`\n[*] [Phase 1: Worker 0] Ingesting profile and fresh catalog for @${targetAccount}...`);
      
      // Register Phase 1 heartbeat
      await sql`
        INSERT INTO crawler_shard_heartbeats (
          competitor_id, shard_number, shard_total, status, updated_at
        ) VALUES (
          ${targetId}, 0, ${workerTotal}, 'crawling_phase1', NOW()
        )
        ON CONFLICT (competitor_id, shard_number) DO UPDATE SET
          shard_total = ${workerTotal},
          status = 'crawling_phase1',
          updated_at = NOW();
      `.catch(() => {});

      try {
        await syncCompetitorProfile(sql, targetAccount, cookie);
      } catch (err) {
        console.warn(`[Phase 1] Profile sync warning:`, err.message);
      }

      try {
        await syncCompetitorBoards(sql, targetId, targetAccount, cookie);
      } catch (err) {
        console.warn(`[Phase 1] Boards sync warning:`, err.message);
      }

      let feedPinsCount = 0;
      try {
        const feedRes = await syncCompetitorPins(sql, targetId, targetAccount, {
          mode: crawlMode === 'refresh' ? 'refresh' : 'sharded_boards',
          maxPages: targetPages,
          cookie: cookie
        });
        feedPinsCount = feedRes?.total_fetched ?? feedRes?.crawled ?? 0;
      } catch (err) {
        console.warn(`[Phase 1] Pins discovery warning:`, err.message);
      }

      // If sharded_boards mode or target_boards specified or feed has few pins, crawl boards to ensure complete catalog
      if (crawlMode === 'sharded_boards' || targetBoardsInput || feedPinsCount < 100) {
        console.log(`[*] [Phase 1: Worker 0] Crawling creator boards for complete catalog ingestion...`);
        try {
          const boards = await sql`
            SELECT board_id, name, url, metadata
            FROM competitor_boards
            WHERE competitor_id = ${targetId}
            ORDER BY pin_count DESC NULLS LAST;
          `;
          
          let filteredBoards = boards;
          if (personalBoardsOnly) {
            filteredBoards = filteredBoards.filter(b => !b.metadata?.is_group_board && !b.metadata?.is_collaborative);
          }
          if (targetBoardsInput) {
            const targets = targetBoardsInput.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            filteredBoards = filteredBoards.filter(b => targets.some(t => b.name.toLowerCase().includes(t) || b.board_id === t));
          }

          console.log(`[*] Selected ${filteredBoards.length} board(s) for catalog ingestion.`);
          for (const b of filteredBoards.slice(0, 30)) {
            try {
              await syncCompetitorBoardPins(sql, targetId, targetAccount, b, {
                mode: 'discovery',
                maxPages: Math.min(20, maxPages),
                cookie: cookie
              });
            } catch (bErr) {
              console.warn(`[Phase 1] Board "${b.name}" crawl warning:`, bErr.message);
            }
          }
        } catch (bQueryErr) {
          console.warn(`[Phase 1] Boards query warning:`, bQueryErr.message);
        }
      }

      // Mark Phase 1 complete in heartbeats table
      await sql`
        UPDATE crawler_shard_heartbeats
        SET status = 'phase1_done',
            updated_at = NOW()
        WHERE competitor_id = ${targetId} AND shard_number = 0;
      `.catch(() => {});

      // Stamp updated_at on competitor_profiles
      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${targetId};
      `.catch(() => {});
      console.log(`[Phase 1: Worker 0] Ingestion phase complete for @${targetAccount}.`);
    } else {
      // Workers 1..19 Barrier Synchronization: Wait for Worker 0 to complete Phase 1
      console.log(`\n[*] [Phase 1: Worker ${workerIndex + 1}/${workerTotal}] Waiting at barrier for Worker 0 to complete discovery...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 300000; // 5 min ceiling
      const isCI = process.env.GITHUB_ACTIONS === 'true';

      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [hb] = await sql`
          SELECT status, updated_at
          FROM crawler_shard_heartbeats
          WHERE competitor_id = ${targetId} AND shard_number = 0;
        `.catch(() => [null]);

        if (hb && hb.status === 'phase1_done') {
          console.log(`[Phase 1] Barrier cleared! Worker 0 completed discovery in ${Math.round((Date.now() - barrierStart) / 1000)}s.`);
          break;
        }

        // Local single-worker test guard: If running locally and Worker 0 never registered, don't stall
        if (!isCI && (!hb || hb.status !== 'crawling_phase1')) {
          console.log(`[Phase 1] Local single-worker test detected (no active Worker 0 heartbeat). Proceeding.`);
          break;
        }

        await sleep(2500);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: 20-Runner Catalog Slice (CRC32 Modulo Partition)
    // -------------------------------------------------------------------------
    console.log(`\n[*] [Phase 2: Worker ${workerIndex + 1}/${workerTotal}] Fetching catalog slice for @${targetAccount}...`);

    const catalogPins = await sql`
      SELECT id, pin_id, competitor_id, board_name, save_count, repin_count, comment_count,
             enrichment_status, created_at_pinterest, title, description, destination_url, image_url, metadata
      FROM competitor_pins
      WHERE competitor_id = ${targetId}
        AND pin_id IS NOT NULL AND pin_id <> ''
      ORDER BY id ASC;
    `;

    // [INVARIANT: SHARD-AFFINE-PARTITIONING-CREATOR-FLEET]
    // Binds worker connections to at most 5 shards: S_w = { s in [1, 99] | (s - 1) % workerTotal === workerIndex }
    const assignedShards = new Set();
    for (let s = 1; s <= 99; s++) {
      if ((s - 1) % workerTotal === workerIndex) {
        assignedShards.add(s);
      }
    }
    console.log(`[Worker ${workerIndex + 1}/${workerTotal}] Shard-Affine Partition active: Assigned ${assignedShards.size} shards: [${Array.from(assignedShards).join(', ')}]`);

    // Filtering pins in memory strictly to assigned shards:
    const myCatalogSlice = catalogPins.filter(pin => {
      const targetShard = getPinShardId(pin.pin_id, 99);
      return assignedShards.has(targetShard);
    });
    console.log(`[Phase 2] Worker #${workerIndex + 1}/${workerTotal} assigned ${myCatalogSlice.length}/${catalogPins.length} pins.`);

    let refreshedCount = 0;
    const refreshedPins = [];
    const metricSnapshots = [];
    const masterPinsToSync = [];

    if (myCatalogSlice.length > 0) {
      const CONCURRENCY = 8;
      const sem = new Semaphore(CONCURRENCY);

      await Promise.allSettled(myCatalogSlice.map(p => sem.run(async () => {
        const prevSaves = Math.max(0, Number(p.save_count || 0));
        const prevRepins = Math.max(0, Number(p.repin_count || 0));
        const prevComments = Math.max(0, Number(p.comment_count || 0));
        const prevVelocity = Number(p.metadata?.daily_save_velocity || p.metadata?.velocity || 0);

        let fresh = await fetchPinFromPinResource(p.pin_id).catch(() => null);
        const rawSaves = fresh ? Math.max(0, Number(fresh.saves || fresh.save_count || 0)) : 0;
        const rawRepins = fresh ? Math.max(0, Number(fresh.repins || fresh.repin_count || 0)) : 0;

        if (!fresh || (rawSaves === 0 && prevSaves > 0) || (rawSaves < prevSaves * 0.8)) {
          const fetchRes = await fetchPinFromPinterest(p.pin_id, cookie).catch(() => null);
          if (fetchRes?.ok && fetchRes?.pin) {
            fresh = fresh ? { ...fresh, ...fetchRes.pin } : fetchRes.pin;
          }
        }

        if (fresh) {
          const rawFreshSaves = Math.max(0, Number(fresh.saves ?? fresh.save_count ?? 0));
          const rawFreshRepins = Math.max(0, Number(fresh.repins ?? fresh.repin_count ?? 0));
          const rawFreshComments = Math.max(0, Number(fresh.comments ?? fresh.comment_count ?? prevComments));
          const freshShares = Math.max(0, Number(fresh.share_count ?? fresh.shares ?? 0));

          const freshSaves = Math.max(prevSaves, rawFreshSaves);
          const freshRepins = Math.max(prevRepins, rawFreshRepins);
          const freshComments = Math.max(prevComments, rawFreshComments);

          const { velocity, deltaSaves } = computeNormalized24hVelocity(p, freshSaves, prevSaves, prevVelocity);
          const deltaRepins = Math.max(0, freshRepins - prevRepins);

          const totalReactions = (typeof fresh.reactions === 'object' && fresh.reactions !== null)
            ? Object.values(fresh.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
            : Number(fresh.reactions || 0);

          refreshedPins.push({
            pin_id: String(p.pin_id),
            saves: freshSaves,
            repins: freshRepins,
            comments: freshComments,
            share_count: freshShares,
            velocity: velocity,
            delta_saves: deltaSaves,
            delta_repins: deltaRepins
          });

          metricSnapshots.push({
            pin_id: String(p.pin_id),
            saves: freshSaves,
            repins: freshRepins,
            comments: freshComments,
            share_count: freshShares,
            reaction_count: totalReactions,
            velocity: velocity
          });

          masterPinsToSync.push({
            pin_id: String(p.pin_id),
            creator_username: targetAccount,
            board_name: p.board_name || '',
            title: fresh.title || p.title || '',
            domain: fresh.domain || fresh.link_domain || '',
            destination_url: fresh.link || fresh.destination_url || p.destination_url || '',
            image_url: fresh.image_url || p.image_url || '',
            description: fresh.description || p.description || '',
            alt_text: fresh.alt_text || '',
            dominant_color: fresh.dominant_color || '#888888',
            visual_annotations: fresh.visual_annotations || fresh.annotations || [],
            created_at_pinterest: p.created_at_pinterest || fresh.created_at || null,
            saves: freshSaves,
            repins: freshRepins,
            comments: freshComments,
            share_count: freshShares,
            reactions: fresh.reactions || {},
            velocity: velocity
          });

          refreshedCount++;
        }
        await sleep(randomJitterMs(150, 300));
      })));
    }

    if (refreshedPins.length > 0) {
      const sorted = [...refreshedPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
      const cleanRefreshed = sanitizeForJsonb(sorted);
      const jsonPayload = JSON.stringify(cleanRefreshed);

      // 1. Commit active telemetry to competitor_pins on Central Hub
      await sql`
        UPDATE competitor_pins AS cp
        SET save_count = GREATEST(cp.save_count, x.saves::int),
            repin_count = GREATEST(cp.repin_count, x.repins::int),
            comment_count = GREATEST(cp.comment_count, x.comments::int),
            enrichment_status = 'enriched',
            metadata = COALESCE(cp.metadata, '{}'::jsonb) || jsonb_build_object(
              'delta_saves_24h', x.delta_saves,
              'delta_repins_24h', x.delta_repins,
              'daily_save_velocity', x.velocity
            ),
            updated_at = NOW()
        FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS x(
          pin_id VARCHAR(64),
          saves BIGINT,
          repins BIGINT,
          comments INT,
          delta_saves NUMERIC,
          delta_repins NUMERIC,
          velocity NUMERIC
        )
        WHERE cp.competitor_id = ${targetId}
          AND cp.pin_id = x.pin_id;
      `;

      // 2. Commit daily snapshots to Neon Storage Shards
      // [INVARIANT: ZERO-HUB-SNAPSHOTS]
      if (metricSnapshots.length > 0) {
        await commitSnapshotsToStorageShards(sql, metricSnapshots);
      }

      // 3. Sync master pins to Neon Storage Shards
      if (masterPinsToSync.length > 0) {
        await syncPinsToMasterShards(sql, masterPinsToSync);
      }

      // 4. One-Way Promotion of qualified pins into pa_pins
      try {
        const recon = await reconcileQualifiedCatalogPins(sql, targetId);
        if (recon?.promoted_or_updated > 0) {
          console.log(`[Phase 2] Promoted ${recon.promoted_or_updated} qualified pins into pa_pins.`);
        }
      } catch (rErr) {
        console.warn(`[Phase 2] Qualification reconciliation warning:`, rErr.message);
      }
    }

    console.log(`\n✅ Worker #${workerIndex + 1}/${workerTotal} Complete: Refreshed ${refreshedCount}/${myCatalogSlice.length} pins.`);

    if (stepSummaryPath) {
      try {
        let md = `### 🐝 Swarm Worker #${workerIndex + 1}/${workerTotal} Summary (@${targetAccount})\n\n`;
        md += `- **Assigned Catalog Slice**: **${myCatalogSlice.length}** pins\n`;
        md += `- **Refreshed via Fast-Path (~90ms)**: **${refreshedCount}** pins\n`;
        md += `- **Daily Snapshots Committed to Shards**: **${metricSnapshots.length}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    process.exit(0);

  } else {
    // =========================================================================
    // EXECUTION MODE A: GLOBAL TWO-PHASE CREATOR SWARM (20 Workers)
    // Phase 1: Creator reach, boards & fresh pin discovery (early-stop: 3 pages)
    // Barrier Sync: Peer synchronization
    // Phase 2: Global winning pins slice refresh (crc32(pin_id) % 20 === worker_index)
    // =========================================================================
    let allFleetAccountIds = allAccountIdsInput.length > 0 ? allAccountIdsInput : [];
    if (allFleetAccountIds.length === 0) {
      const rows = await sql`
        SELECT id FROM competitor_profiles WHERE is_active = TRUE ORDER BY last_synced_at ASC NULLS FIRST, id ASC;
      `;
      allFleetAccountIds = rows.map(r => Number(r.id));
    }

    if (allFleetAccountIds.length === 0) {
      console.log('[!] No active creators to sweep. Exiting cleanly.');
      process.exit(0);
    }

    // Determine which accounts belong to this worker for Phase 1
    const myAccountIds = process.env.ACCOUNT_IDS !== undefined
      ? accountIdsInput
      : allFleetAccountIds.filter((_, idx) => idx % workerTotal === workerIndex);

    console.log(`[Phase 1] Assigned ${myAccountIds.length} creator accounts to Worker #${workerIndex + 1}/${workerTotal}...`);

    let myAccounts = [];
    if (myAccountIds.length > 0) {
      myAccounts = await sql`
        SELECT id, username, display_name, metadata
        FROM competitor_profiles
        WHERE id = ANY(${myAccountIds});
      `;
    }

    // -------------------------------------------------------------------------
    // PHASE 1: Creator Pulse & Discovery (Assigned Accounts)
    // -------------------------------------------------------------------------
    // Register Phase 1 heartbeat
    await sql`
      INSERT INTO crawler_shard_heartbeats (
        competitor_id, shard_number, shard_total, status, updated_at
      ) VALUES (
        0, ${workerIndex}, ${workerTotal}, 'crawling_phase1', NOW()
      )
      ON CONFLICT (competitor_id, shard_number) DO UPDATE SET
        shard_total = ${workerTotal},
        status = 'crawling_phase1',
        updated_at = NOW();
    `.catch(() => {});

    let accountsProcessed = 0;
    for (let i = 0; i < myAccounts.length; i++) {
      const acc = myAccounts[i];
      const cleanUser = (acc.username || '').replace(/^@+/, '').trim();
      console.log(`\n----------------------------------------------------------------`);
      console.log(`[Phase 1: ${i + 1}/${myAccounts.length}] Daily Pulse: @${cleanUser} (Account ID: ${acc.id})`);
      console.log(`----------------------------------------------------------------`);

      // 1. Sync Creator Profile & Reach
      try {
        console.log(`[*] Updating reach & impressions for @${cleanUser}...`);
        await syncCompetitorProfile(sql, cleanUser, cookie);
      } catch (pErr) {
        console.warn(`[!] Profile sync warning for @${cleanUser}:`, pErr.message);
      }

      // 2. Discover Boards
      try {
        await syncCompetitorBoards(sql, acc.id, cleanUser, cookie);
      } catch (_) {}

      // 3. Discover Fresh Pins (early-stop: per-account rules or 3 pages)
      try {
        const accRules = acc.metadata?.qualification_rules || {};
        const earlyStop = Number(accRules.early_stop_pages) || 3;
        const targetPages = crawlMode === 'deep' || crawlMode === 'all'
          ? (Number(accRules.max_pages) || maxPages || 500)
          : earlyStop;
        console.log(`[*] Checking for fresh pins (target: ${targetPages} pages, early-stop: ${earlyStop})...`);
        await syncCompetitorPins(sql, acc.id, cleanUser, {
          mode: 'refresh',
          maxPages: targetPages,
          cookie: cookie
        });
      } catch (_) {}

      // 4. Reconcile & Promote Qualified Catalog Pins into pa_pins
      try {
        const recon = await reconcileQualifiedCatalogPins(sql, acc.id);
        if (recon?.promoted_or_updated > 0) {
          console.log(`[✓] Reconciled and archived ${recon.promoted_or_updated} qualified pins into pa_pins.`);
        }
      } catch (rErr) {
        console.warn(`[!] Catalog reconciliation warning:`, rErr.message);
      }

      // Stamp updated_at so accounts reflect active sync
      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${acc.id};
      `.catch(() => {});

      accountsProcessed++;
    }

    // Mark Phase 1 complete in heartbeats table
    await sql`
      UPDATE crawler_shard_heartbeats
      SET status = 'phase1_done',
          updated_at = NOW()
      WHERE competitor_id = 0 AND shard_number = ${workerIndex};
    `.catch(() => {});

    // -------------------------------------------------------------------------
    // Barrier Sync across all 20 fleet workers
    // -------------------------------------------------------------------------
    if (workerTotal > 1) {
      console.log(`\n[*] Barrier Sync: Waiting for peer workers to complete discovery across ${allFleetAccountIds.length} accounts...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 120000; // 2 min max wait

      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [pendingRow] = await sql`
          SELECT COUNT(*)::int AS pending
          FROM crawler_shard_heartbeats
          WHERE competitor_id = 0
            AND shard_number <> ${workerIndex}
            AND status = 'crawling_phase1'
            AND updated_at > NOW() - INTERVAL '3 minutes';
        `.catch(() => [{ pending: 0 }]);

        const pendingCount = Number(pendingRow?.pending || 0);
        if (pendingCount === 0) {
          console.log(`[✓] Barrier Sync cleared in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }
        console.log(`  [Phase 1 Sync] ${pendingCount} peer worker(s) still in discovery...`);
        await sleep(2500);
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 2: Global Winning Pins Slice Refresh (crc32(pin_id) % 20 === worker_index)
    // -------------------------------------------------------------------------
    console.log(`\n[*] [Phase 2] Querying all active winning pins from pa_pins on Central Hub...`);

    const allWinningPins = await sql`
      SELECT 
        pin_id, title, description, link, domain, board_name, image_url, dominant_color,
        annotations, is_video, is_product, alt_text, saves, repins, comments, share_count,
        velocity, last_updated_at, created_at_pinterest, account_username
      FROM pa_pins
      ORDER BY saves DESC;
    `;

    // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
    // [INVARIANT: SHARD-AFFINE-PARTITIONING-CREATOR-FLEET]
    // Filter slice for this worker using shard-affine partitioning
    // Binds worker connections to at most 5 shards: S_w = { s in [1, 99] | (s - 1) % workerTotal === workerIndex }
    const assignedWinningShards = new Set();
    for (let s = 1; s <= 99; s++) {
      if ((s - 1) % workerTotal === workerIndex) {
        assignedWinningShards.add(s);
      }
    }
    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} Shard-Affine Partition active: Assigned ${assignedWinningShards.size} shards: [${Array.from(assignedWinningShards).join(', ')}]`);

    const myWinningSlice = allWinningPins.filter(p => {
      const targetShard = getPinShardId(p.pin_id, 99);
      return assignedWinningShards.has(targetShard);
    });
    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} assigned ${myWinningSlice.length}/${allWinningPins.length} global winning pins.`);

    let refreshedWinningCount = 0;
    const refreshedPins = [];
    const metricSnapshots = [];
    const masterPinsToSync = [];

    if (myWinningSlice.length > 0) {
      const CONCURRENCY = 8;
      const sem = new Semaphore(CONCURRENCY);

      await Promise.allSettled(myWinningSlice.map(p => sem.run(async () => {
        try {
          const prevSaves = Math.max(0, Number(p.saves || 0));
          const prevRepins = Math.max(0, Number(p.repins || 0));
          const prevComments = Math.max(0, Number(p.comments || 0));
          const prevShares = Math.max(0, Number(p.share_count || 0));
          const prevVelocity = Number(p.velocity || 0);

          let fresh = await fetchPinFromPinResource(p.pin_id).catch(() => null);
          const rawSaves = fresh ? Math.max(0, Number(fresh.saves || fresh.save_count || 0)) : 0;
          const rawRepins = fresh ? Math.max(0, Number(fresh.repins || fresh.repin_count || 0)) : 0;

          // Fallback to full scrape if suspicious drop or PinResource missing
          if (!fresh || (rawSaves === 0 && prevSaves > 0) || (rawSaves < prevSaves * 0.8)) {
            const fetchRes = await fetchPinFromPinterest(p.pin_id, cookie).catch(() => null);
            if (fetchRes?.ok && fetchRes?.pin) {
              fresh = fresh ? { ...fresh, ...fetchRes.pin } : fetchRes.pin;
            }
          }

          if (fresh) {
            const rawFreshSaves = Math.max(0, Number(fresh.saves ?? fresh.save_count ?? 0));
            const rawFreshRepins = Math.max(0, Number(fresh.repins ?? fresh.repin_count ?? 0));
            const rawFreshComments = Math.max(0, Number(fresh.comments ?? fresh.comment_count ?? prevComments));
            const freshShares = Math.max(0, Number(fresh.share_count ?? fresh.shares ?? prevShares));

            const freshSaves = Math.max(prevSaves, rawFreshSaves);
            const freshRepins = Math.max(prevRepins, rawFreshRepins);
            const freshComments = Math.max(prevComments, rawFreshComments);

            const { velocity, deltaSaves } = computeNormalized24hVelocity(p, freshSaves, prevSaves, prevVelocity);
            const deltaRepins = Math.max(0, freshRepins - prevRepins);

            const totalReactions = (typeof fresh.reactions === 'object' && fresh.reactions !== null)
              ? Object.values(fresh.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
              : Number(fresh.reactions || 0);

            refreshedPins.push({
              pin_id: String(p.pin_id),
              saves: freshSaves,
              repins: freshRepins,
              comments: freshComments,
              share_count: freshShares,
              velocity: velocity,
              delta_saves: deltaSaves,
              delta_repins: deltaRepins
            });

            metricSnapshots.push({
              pin_id: String(p.pin_id),
              saves: freshSaves,
              repins: freshRepins,
              comments: freshComments,
              share_count: freshShares,
              reaction_count: totalReactions,
              velocity: velocity
            });

            masterPinsToSync.push({
              pin_id: String(p.pin_id),
              creator_username: p.account_username || '',
              board_name: p.board_name || '',
              title: fresh.title || p.title || '',
              domain: fresh.domain || fresh.link_domain || p.domain || '',
              destination_url: fresh.link || fresh.destination_url || p.link || '',
              image_url: fresh.image_url || p.image_url || '',
              description: fresh.description || '',
              alt_text: fresh.alt_text || p.alt_text || '',
              dominant_color: fresh.dominant_color || p.dominant_color || '#888888',
              visual_annotations: fresh.visual_annotations || fresh.annotations || p.annotations || [],
              created_at_pinterest: p.created_at_pinterest || fresh.created_at || null,
              saves: freshSaves,
              repins: freshRepins,
              comments: freshComments,
              share_count: freshShares,
              reactions: fresh.reactions || {},
              velocity: velocity
            });

            refreshedWinningCount++;
          }
        } catch (_) {}
        await sleep(randomJitterMs(150, 300));
      })));
    }

    if (refreshedPins.length > 0) {
      const sorted = [...refreshedPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
      const cleanRefreshed = sanitizeForJsonb(sorted);
      const jsonPayload = JSON.stringify(cleanRefreshed);

      // 1. Atomic batch commit to pa_pins on Hub
      await sql`
        UPDATE pa_pins AS p
        SET saves = GREATEST(p.saves, x.saves),
            repins = GREATEST(p.repins, x.repins),
            comments = GREATEST(p.comments, x.comments),
            share_count = GREATEST(p.share_count, x.share_count),
            velocity = x.velocity,
            last_updated_at = NOW()
        FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS x(
          pin_id VARCHAR(64),
          saves BIGINT,
          repins BIGINT,
          comments INT,
          share_count BIGINT,
          velocity NUMERIC
        )
        WHERE p.pin_id = x.pin_id;
      `;

      // 2. Atomic batch commit to competitor_pins on Hub
      await sql`
        UPDATE competitor_pins AS cp
        SET save_count = GREATEST(cp.save_count, x.saves::int),
            repin_count = GREATEST(cp.repin_count, x.repins::int),
            comment_count = GREATEST(cp.comment_count, x.comments::int),
            metadata = COALESCE(cp.metadata, '{}'::jsonb) || jsonb_build_object(
              'delta_saves_24h', x.delta_saves,
              'delta_repins_24h', x.delta_repins,
              'daily_save_velocity', x.velocity
            ),
            updated_at = NOW()
        FROM jsonb_to_recordset(${jsonPayload}::jsonb) AS x(
          pin_id VARCHAR(64),
          saves BIGINT,
          repins BIGINT,
          comments INT,
          delta_saves NUMERIC,
          delta_repins NUMERIC,
          velocity NUMERIC
        )
        WHERE cp.pin_id = x.pin_id;
      `;

      // 3. Route historical snapshots to Storage Shards via CRC32
      // [INVARIANT: ZERO-HUB-SNAPSHOTS]
      // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
      if (metricSnapshots.length > 0) {
        await commitSnapshotsToStorageShards(sql, metricSnapshots);
      }

      // 4. Sync master pins to Neon Storage Shards
      // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
      if (masterPinsToSync.length > 0) {
        await syncPinsToMasterShards(sql, masterPinsToSync);
      }
    }

    console.log(`\n✅ Swarm Worker #${workerIndex + 1}/${workerTotal} Complete: Processed ${accountsProcessed} accounts | Refreshed ${refreshedWinningCount}/${myWinningSlice.length} winning pins.`);

    if (stepSummaryPath) {
      try {
        let md = `### 🐝 Swarm Worker #${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Accounts Processed (Phase 1)**: **${accountsProcessed}**\n`;
        md += `- **Winning Pins Slice (Phase 2)**: **${myWinningSlice.length}** pins\n`;
        md += `- **Refreshed via Fast-Path (~90ms)**: **${refreshedWinningCount}** pins\n`;
        md += `- **Daily Snapshots Committed to Shards**: **${metricSnapshots.length}**\n`;
        md += `- **Master Pins Synced to Shards**: **${masterPinsToSync.length}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    process.exit(0);
  }
}

run().catch(err => {
  console.error('[-] Fatal Worker Error:', err);
  process.exit(1);
});
