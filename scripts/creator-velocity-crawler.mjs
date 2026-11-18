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
 *      and daily snapshots to Unified PostgreSQL.
 * 
 * 2. MODE='single_account_swarm' (Single-Account 20-Worker Swarm):
 *    - Phase 1: Worker 0 conducts board and feed discovery up to max_pages.
 *      Workers 1..19 wait for Worker 0 via Barrier Sync.
 *    - Phase 2: All 20 runners slice the pin catalog (crc32(pin_id) % 20 === worker_index)
 *      for parallel enrichment, repository sync, and qualification reconciliation.
 */

// [INVARIANT: UNIFIED-POSTGRES-CLIENT]
import { createSqlClient, withDbRetry } from '../src/db/client.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  syncCompetitorProfile,
  normalizePinterestUsername
} from '../src/modules/creators/competitors-crud.mjs';
import {
  syncCompetitorBoards,
  syncCompetitorBoardPins
} from '../src/modules/creators/boards-service.mjs';
import {
  syncCompetitorPins,
  reconcileQualifiedCatalogPins
} from '../src/modules/creators/creator-ingest.mjs';
import { getCreatorHubSettings } from '../src/modules/creators/creator-analytics.mjs';
import {
  randomJitterMs,
  sleep,
  setDefaultDispatcher,
  fetchPinFromPinResource,
  fetchPinsBatchFromPidgets,
  fetchUserResource,
  fetchPinFromPinterest
} from '../src/core/pinterest/index.mjs';
import { ingestPinsBatch } from '../src/modules/pins/repository.mjs';
import { formatPinterestCookie, sanitizeForJsonb, Semaphore } from '../src/utils.mjs';
import { calculateDailyVelocity, isRepinHydrationJump, detectHydrationJump } from '../src/lib/math.mjs';
import { shouldSkipFreshPinEnrichment } from '../src/domain/pin-intelligence.mjs';
import { getEffectivePinterestCookie } from '../src/modules/keywords/settings.mjs';

import {
  closeCrawlerDb as closeDbClient,
  loadDotEnvIfPresent,
  bootstrapUndiciKeepAliveDispatcher,
  startInstaBoxActivityLease,
  resolveWorkerPartition
} from './lib/fleet-runner.mjs';

const isDirectCrawlerRun = Boolean(
  process.argv[1] && (
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('creator-velocity-crawler.mjs')
  )
);

if (isDirectCrawlerRun) {
  await bootstrapUndiciKeepAliveDispatcher(setDefaultDispatcher);
  loadDotEnvIfPresent();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (isDirectCrawlerRun && !DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = (DATABASE_URL && isDirectCrawlerRun) ? createSqlClient(DATABASE_URL) : null;
let lease = null;
const closeCrawlerDb = (exitCode = 0) => (
  sql
    ? closeDbClient(sql, exitCode, lease)
    : Promise.resolve().then(() => lease?.stop?.())
);
const mode = (process.env.MODE || 'creator_sweep').toLowerCase().trim();
const { workerIndex, workerTotal } = resolveWorkerPartition();

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

const AUTO_PROMOTE_PULSE_DELTA_24H = Number(process.env.AUTO_PROMOTE_PULSE_DELTA_24H || 25000);
const AUTO_PROMOTE_PULSE_DELTA_7D = Number(process.env.AUTO_PROMOTE_PULSE_DELTA_7D || 100000);
const rawPhase2MaxPins = parseInt(process.env.PHASE2_MAX_PINS || '250', 10);
const PHASE2_MAX_PINS = Number.isFinite(rawPhase2MaxPins) && rawPhase2MaxPins > 0 ? Math.min(2000, rawPhase2MaxPins) : 250;
const rawPhase2FreshHours = parseInt(process.env.PHASE2_FRESHNESS_HOURS || '18', 10);
const PHASE2_FRESHNESS_HOURS = Number.isFinite(rawPhase2FreshHours) && rawPhase2FreshHours > 0 ? rawPhase2FreshHours : 18;

/**
 * Route enriched pins to universal_master_pins and pins_daily_metrics via canonical PinRepository.ingestPinsBatch SSOT.
 * [INVARIANT: UNIFIED-MASTER-CATALOG]
 * [INVARIANT: UNIFIED-POSTGRES-SNAPSHOTS]
 */
export async function syncPinsToMasterCatalog(hubSql, enrichedPins, extraOptions = {}) {
  if (!Array.isArray(enrichedPins) || enrichedPins.length === 0) return 0;
  const dbSql = hubSql?.noRetry || hubSql;
  const normalizedMap = new Map();

  for (const p of enrichedPins) {
    const pid = String(p?.pin_id || '').trim();
    if (!pid) continue;

    let reactionCount = null;
    if (p.reaction_count != null) {
      reactionCount = Math.max(0, Number(p.reaction_count));
    } else if (p.reactions && typeof p.reactions === 'object' && Object.keys(p.reactions).length > 0) {
      reactionCount = Object.values(p.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0);
    } else if (p.reactions != null && !isNaN(Number(p.reactions))) {
      reactionCount = Math.max(0, Number(p.reactions));
    }

    const hasSaves = p.saves != null || p.save_count != null;
    const saveCount = hasSaves ? Math.max(0, Number(p.saves ?? p.save_count)) : null;
    const repinCount = (p.repins != null || p.repin_count != null) ? Math.max(0, Number(p.repins ?? p.repin_count)) : null;
    const vel = (p.velocity != null || p.daily_save_velocity != null) ? Number(p.velocity ?? p.daily_save_velocity) : null;
    const repinVel = (p.repin_velocity != null || p.daily_repin_velocity != null || p.delta_repins_24h != null || p.delta_repins != null)
      ? Number(p.repin_velocity ?? p.daily_repin_velocity ?? p.delta_repins_24h ?? p.delta_repins)
      : null;
    const resolvedCompId = p.competitor_id != null
      ? Number(p.competitor_id)
      : (extraOptions.competitor_id != null ? Number(extraOptions.competitor_id) : null);
    const resolvedBoardId = String(p.board_id || extraOptions.board_id || '').trim() || null;

    normalizedMap.set(pid, {
      ...p,
      pin_id: pid,
      competitor_id: resolvedCompId,
      board_id: resolvedBoardId,
      creator_username: String(p.account_username || p.creator_username || ''),
      save_count: saveCount,
      has_explicit_saves: saveCount !== null,
      repin_count: repinCount,
      has_explicit_repins: repinCount !== null,
      comment_count: (p.comments != null || p.comment_count != null) ? Math.max(0, Number(p.comments ?? p.comment_count)) : null,
      share_count: (p.shares != null || p.share_count != null) ? Math.max(0, Number(p.shares ?? p.share_count)) : null,
      reaction_count: reactionCount,
      is_hydrated: Boolean(p.is_hydrated || (hasSaves && saveCount !== null)),
      was_live_scraped: Boolean(p.is_hydrated || (hasSaves && saveCount !== null)),
      daily_save_velocity: vel,
      daily_repin_velocity: repinVel,
      delta_repins_24h: (p.delta_repins_24h != null || p.delta_repins != null)
        ? Math.max(0, Number(p.delta_repins_24h ?? p.delta_repins))
        : null
    });
  }

  const normalized = Array.from(normalizedMap.values()).sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
  let totalSynced = 0;
  for (let i = 0; i < normalized.length; i += 500) {
    const chunk = normalized.slice(i, i + 500);
    await withDbRetry(() => ingestPinsBatch(dbSql, chunk, {
      pillar: 'creator_hub',
      ...(extraOptions.competitor_id != null ? { competitor_id: Number(extraOptions.competitor_id) } : {}),
      ...(extraOptions.board_id ? { board_id: String(extraOptions.board_id) } : {})
    }), {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 2000
    });
    totalSynced += chunk.length;
  }
  return totalSynced;
}

/**
 * Stage-1 50-pin Pidgets pre-pass for Phase 2 catalog slices.
 * Skips pins already protected by the 18h freshness gate or lacking existing visual_annotations
 * (which still need PinResource/SSR deep extraction).
 */
export async function prehydrateCreatorCatalogWithPidgets(slicePins, options = {}) {
  const {
    useFreshnessGate = true,
    useUmpFields = false,
    batchPidgetsFn = fetchPinsBatchFromPidgets
  } = options;

  const pidgetsIds = [];
  for (const p of (Array.isArray(slicePins) ? slicePins : [])) {
    if (!p || !p.pin_id) continue;
    const rawPrevSaves = useUmpFields ? (p.ump_saves ?? p.save_count) : (p.saves ?? p.save_count);
    const prevSaves = rawPrevSaves != null ? Math.max(0, Number(rawPrevSaves)) : null;
    if (useFreshnessGate && prevSaves != null) {
      const masterSnapshot = {
        last_scraped_at: p.last_scraped_at,
        save_count: prevSaves,
        created_at_pinterest: p.created_at_pinterest,
        is_hydrated: p.is_hydrated ?? true,
        visual_annotations: p.visual_annotations,
        image_signature: p.image_signature,
        creation_method: p.creation_method,
        metadata: p.ump_metadata
      };
      if (shouldSkipFreshPinEnrichment(masterSnapshot, 18)) continue;
    }
    const hasExistingAnnotations = Array.isArray(p.visual_annotations) && p.visual_annotations.length > 0;
    if (hasExistingAnnotations) {
      pidgetsIds.push(String(p.pin_id));
    }
  }

  if (pidgetsIds.length === 0) return new Map();
  try {
    const res = await batchPidgetsFn(pidgetsIds);
    return res instanceof Map ? res : new Map();
  } catch (_) {
    return new Map();
  }
}

export const prefetchBatchPidgets = prehydrateCreatorCatalogWithPidgets;

/**
 * Shared pin enrichment and metric computation helper for Mode A & Mode B catalog refresh.
 */
export async function processCreatorCatalogPin(p, options, collectors) {
  const {
    fallbackUsername = '',
    useFreshnessGate = false,
    useUmpFields = false,
    pidgetsMap = null,
    requireDeepFields = false,
    fetchPinFromPinResourceFn = null,
    fetchPinFromPinterestFn = null
  } = options;
  const { refreshedPins, metricSnapshots, masterPinsToSync } = collectors;
  const effectivePidgetsMap = pidgetsMap instanceof Map ? pidgetsMap : (collectors.pidgetsMap instanceof Map ? collectors.pidgetsMap : null);

  const rawPrevSaves = useUmpFields ? (p.ump_saves ?? p.save_count) : (p.saves ?? p.save_count);
  const prevSaves = rawPrevSaves != null ? Math.max(0, Number(rawPrevSaves)) : null;
  const rawPrevRepins = useUmpFields ? (p.ump_repins ?? p.repin_count) : (p.repins ?? p.repin_count);
  const prevRepins = rawPrevRepins != null ? Math.max(0, Number(rawPrevRepins)) : null;
  const prevComments = Math.max(0, Number(useUmpFields ? (p.ump_comments ?? p.comment_count ?? 0) : (p.comments ?? p.comment_count ?? 0)));
  const prevShares = Math.max(0, Number(p.share_count ?? p.shares ?? 0));
  const prevVelocity = useUmpFields
    ? ((p.prev_velocity != null || p.ump_velocity != null) ? Number(p.prev_velocity ?? p.ump_velocity) : null)
    : (p.velocity != null ? Number(p.velocity) : null);

  if (useFreshnessGate && prevSaves != null) {
    const masterSnapshot = {
      last_scraped_at: p.last_scraped_at,
      save_count: prevSaves,
      created_at_pinterest: p.created_at_pinterest,
      is_hydrated: p.is_hydrated ?? true,
      visual_annotations: p.visual_annotations,
      image_signature: p.image_signature,
      creation_method: p.creation_method,
      metadata: p.ump_metadata
    };
    if (shouldSkipFreshPinEnrichment(masterSnapshot, 18)) {
      refreshedPins.push({
        pin_id: String(p.pin_id),
        saves: prevSaves,
        repins: prevRepins,
        comments: prevComments,
        share_count: Number(p.ump_shares ?? p.share_count ?? 0),
        velocity: prevVelocity != null ? prevVelocity : 0,
        delta_saves: prevVelocity != null ? prevVelocity : 0,
        delta_repins: 0,
        from_hydration_cache: true
      });
      return true;
    }
  }

  const pidgetsPin = effectivePidgetsMap ? effectivePidgetsMap.get(String(p.pin_id)) : null;
  const hasExistingAnnotations = Array.isArray(p.visual_annotations) && p.visual_annotations.length > 0;
  const pidgetsSaves = (pidgetsPin && !pidgetsPin.is_missing && pidgetsPin.has_explicit_saves && pidgetsPin.saves != null)
    ? Math.max(0, Number(pidgetsPin.saves))
    : null;
  const canUsePidgets = Boolean(
    !requireDeepFields &&
    hasExistingAnnotations &&
    pidgetsPin &&
    !pidgetsPin.is_missing &&
    pidgetsSaves !== null &&
    !(pidgetsSaves === 0 && (prevSaves ?? 0) > 0) &&
    !(prevSaves != null && prevSaves > 0 && pidgetsSaves < prevSaves * 0.8)
  );

  let fresh = canUsePidgets
    ? { ...pidgetsPin, visual_annotations: p.visual_annotations }
    : await (typeof fetchPinFromPinResourceFn === 'function' ? fetchPinFromPinResourceFn(p.pin_id) : fetchPinFromPinResource(p.pin_id)).catch(() => null);
  const rawSaves = fresh ? Math.max(0, Number(fresh.saves || fresh.save_count || 0)) : 0;

  if (!fresh || (rawSaves === 0 && (prevSaves ?? 0) > 0) || (prevSaves != null && prevSaves > 0 && rawSaves < prevSaves * 0.8)) {
    const fetchRes = await (typeof fetchPinFromPinterestFn === 'function' ? fetchPinFromPinterestFn(p.pin_id, '') : fetchPinFromPinterest(p.pin_id, '')).catch(() => null);
    if (fetchRes?.ok && fetchRes?.pin) {
      fresh = fresh ? { ...fresh, ...fetchRes.pin } : fetchRes.pin;
    }
  }

  if (!fresh) return false;

  const hasExplicitFreshSaves = fresh.has_explicit_saves === true || (fresh.saves != null && Number.isFinite(Number(fresh.saves))) || (fresh.save_count != null && Number.isFinite(Number(fresh.save_count)));
  const rawFreshSavesNum = hasExplicitFreshSaves ? Number(fresh.saves ?? fresh.save_count ?? 0) : null;
  const rawFreshSaves = (rawFreshSavesNum !== null && Number.isFinite(rawFreshSavesNum)) ? Math.max(0, rawFreshSavesNum) : null;
  const hasExplicitFreshRepins = fresh.has_explicit_repins === true;
  const rawFreshRepinsNum = (fresh.repins != null || fresh.repin_count != null) ? Number(fresh.repins ?? fresh.repin_count ?? 0) : null;
  const rawFreshRepins = (rawFreshRepinsNum !== null && Number.isFinite(rawFreshRepinsNum)) ? Math.max(0, rawFreshRepinsNum) : null;
  const rawFreshCommentsNum = Number(fresh.comments ?? fresh.comment_count ?? prevComments);
  const rawFreshComments = Number.isFinite(rawFreshCommentsNum) ? Math.max(0, rawFreshCommentsNum) : prevComments;
  const freshSharesNum = Number(fresh.share_count ?? fresh.shares ?? (useUmpFields ? 0 : prevShares));
  const freshShares = Number.isFinite(freshSharesNum) ? Math.max(0, freshSharesNum) : (useUmpFields ? 0 : prevShares);

  const freshRepins = (rawFreshRepins !== null && (rawFreshRepins > 0 || (hasExplicitFreshRepins && (prevRepins === null || prevRepins === 0))))
    ? rawFreshRepins
    : prevRepins;
  // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE] Never pass freshRepins to freshSaves
  const freshSaves = (rawFreshSaves !== null && (rawFreshSaves > 0 || (hasExplicitFreshSaves && (prevSaves === null || prevSaves === 0))))
    ? rawFreshSaves
    : prevSaves;
  const freshComments = rawFreshComments > 0 ? rawFreshComments : prevComments;

  const totalReactions = (typeof fresh.reactions === 'object' && fresh.reactions !== null)
    ? Object.values(fresh.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : Number(fresh.reactions || 0);

  const resolvedBoardId = String(
    p.board_id ||
    fresh.board_id ||
    fresh.board?.entityId ||
    fresh.board?.id ||
    ''
  ).trim() || null;

  const baseMasterRecord = {
    pin_id: String(p.pin_id),
    competitor_id: p.competitor_id != null ? Number(p.competitor_id) : (options.competitorId != null ? Number(options.competitorId) : null),
    board_id: resolvedBoardId,
    creator_username: useUmpFields ? fallbackUsername : (p.account_username || fallbackUsername || ''),
    board_name: p.board_name || fresh.board_name || fresh.board?.name || '',
    title: fresh.title || p.title || '',
    domain: fresh.domain || fresh.link_domain || (useUmpFields ? '' : (p.domain || '')),
    destination_url: fresh.link || fresh.destination_url || p.destination_url || p.link || '',
    image_url: fresh.image_url || p.image_url || '',
    description: fresh.description || (useUmpFields ? (p.description || '') : ''),
    alt_text: fresh.alt_text || (useUmpFields ? '' : (p.alt_text || '')),
    dominant_color: (() => {
      const c = String(fresh.dominant_color || (useUmpFields ? '' : (p.dominant_color || ''))).trim();
      return (!c || c.toLowerCase() === '#888888') ? null : c;
    })(),
    visual_annotations: fresh.visual_annotations || fresh.annotations || (useUmpFields ? [] : (p.annotations || [])),
    image_signature: fresh.image_signature || p.image_signature || null,
    creation_method: fresh.creation_method || fresh.method || p.creation_method || null,
    created_at_pinterest: p.created_at_pinterest || fresh.created_at || null,
    repins: freshRepins,
    comments: freshComments,
    share_count: freshShares,
    reactions: fresh.reactions || {}
  };

  if (freshSaves === null) {
    refreshedPins.push({
      pin_id: String(p.pin_id),
      saves: null,
      repins: freshRepins,
      comments: freshComments,
      share_count: freshShares,
      velocity: null,
      delta_saves: null,
      delta_repins: null
    });
    masterPinsToSync.push({
      ...baseMasterRecord,
      saves: null,
      velocity: null,
      daily_repin_velocity: null,
      delta_repins_24h: null,
      is_hydrated: false
    });
  } else {
    const safePrevSaves = prevSaves ?? 0;
    const safePrevRepins = prevRepins ?? 0;
    const safeFreshRepins = freshRepins ?? 0;

    const { velocity, deltaSaves } = computeNormalized24hVelocity(p, freshSaves, safePrevSaves, prevVelocity ?? 0, safeFreshRepins, safePrevRepins);
    const isRepinJump = isRepinHydrationJump(
      { save_count: safePrevSaves, repin_count: safePrevRepins },
      { save_count: freshSaves, repin_count: safeFreshRepins }
    );
    const deltaRepins = isRepinJump ? 0 : Math.max(0, safeFreshRepins - safePrevRepins);

    refreshedPins.push({
      pin_id: String(p.pin_id),
      saves: freshSaves,
      repins: safeFreshRepins,
      comments: freshComments,
      share_count: freshShares,
      velocity,
      delta_saves: deltaSaves,
      delta_repins: deltaRepins
    });

    metricSnapshots.push({
      pin_id: String(p.pin_id),
      saves: freshSaves,
      repins: safeFreshRepins,
      comments: freshComments,
      share_count: freshShares,
      reaction_count: totalReactions,
      velocity,
      repin_velocity: deltaRepins
    });

    masterPinsToSync.push({
      ...baseMasterRecord,
      saves: freshSaves,
      repins: safeFreshRepins,
      velocity,
      daily_repin_velocity: deltaRepins,
      delta_repins_24h: deltaRepins,
      is_hydrated: true
    });
  }

  return true;
}

/**
 * Multi-Day Time-Normalized Velocity Calculation with Intraday Ratchet Protection
 * [INVARIANT: VELOCITY-RATCHET-SYMMETRY]
 * [INVARIANT: ANTI-HYDRATION-SPIKE]
 */
function computeNormalized24hVelocity(pin, freshSaves, prevSaves, prevVelocity, freshRepins = 0, prevRepins = 0) {
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

  // Intraday same-day crawl handling
  if (isSameDay) {
    if (prevSaves <= 0) {
      return { velocity: 0, deltaSaves: 0 };
    }
    if (deltaSaves === 0) {
      return { velocity: safePrevVelocity, deltaSaves: 0 };
    }
    const isJump = detectHydrationJump(freshSaves, prevSaves, freshRepins, prevRepins);
    const safeDelta = isJump ? 0 : deltaSaves;
    return {
      velocity: Math.min(25000, Math.max(safePrevVelocity, safeDelta)),
      deltaSaves: safeDelta
    };
  }

  // [INVARIANT: ANTI-HYDRATION-SPIKE] Delegate to canonical velocity function with 0-baseline protection
  const baseDateRaw = pin.last_updated_at || pin.created_at_pinterest || null;
  if (baseDateRaw && (prevSaves > 0 || pin.created_at_pinterest)) {
    const computed = calculateDailyVelocity({
      currentSaves: freshSaves,
      baselineSaves: prevSaves,
      currentRepins: freshRepins,
      baselineRepins: prevRepins,
      currentDate: now,
      baselineDate: baseDateRaw,
      createdAt: pin.created_at_pinterest || null,
      maxCap: 25000
    });
    return { velocity: computed, deltaSaves };
  }

  // Fallback for unhydrated 0-baseline without creation timestamp: suppress velocity to 0 until Day-2 crawl
  let velocity = 0;
  if (prevSaves > 0) {
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
    let targetTrackingMode = 'full';

    if (!targetId) {
      const [row] = await sql`
        SELECT id, username, metadata, tracking_mode FROM competitor_profiles WHERE username = ${targetAccount} LIMIT 1;
      `;
      if (!row) {
        console.error(`[-] FATAL: Account @${targetAccount} not found in database.`);
        process.exit(1);
      }
      targetId = row.id;
      targetAccount = row.username;
      targetMetadata = row.metadata || {};
      targetTrackingMode = row.tracking_mode || 'full';
    } else {
      const [row] = await sql`
        SELECT id, username, metadata, tracking_mode FROM competitor_profiles WHERE id = ${targetId} LIMIT 1;
      `;
      if (row) {
        targetAccount = row.username || targetAccount;
        targetMetadata = row.metadata || {};
        targetTrackingMode = row.tracking_mode || 'full';
      }
    }

    const isPulseOnly = targetTrackingMode === 'pulse_only' || targetMetadata.profile_pulse_only === true;

    const accRules = targetMetadata.qualification_rules || {};
    const earlyStop = Number(accRules.early_stop_pages) || 3;
    const targetPages = crawlMode === 'deep' || crawlMode === 'all'
      ? (Number(accRules.max_pages) || maxPages || 500)
      : (crawlMode === 'refresh' ? earlyStop : (maxPages || 500));

    console.log(`\n[*] Target Creator: @${targetAccount} (ID: ${targetId}) [target: ${targetPages} pages, early-stop: ${earlyStop}, pulseOnly: ${isPulseOnly}]`);

    const runToken = String(
      process.env.CRAWL_RUN_ID ||
      (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}` : null) ||
      `bucket_${Math.floor(Date.now() / 600000)}`
    );

    // -------------------------------------------------------------------------
    // Phase 1: Profile & Board List on Worker 0, then 20-Worker Parallel Board Swarm
    // -------------------------------------------------------------------------
    if (workerIndex === 0) {
      console.log(`\n[*] [Phase 1: Worker 0] Ingesting profile, board list, and feed for @${targetAccount} (token: ${runToken})...`);
      await sql`
        UPDATE competitor_profiles
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('phase1_status', 'crawling_phase1', 'phase1_run_id', ${runToken}::text, 'phase1_time', NOW()::text)
        WHERE id = ${targetId};
      `.catch(() => {});

      try {
        try {
          await syncCompetitorProfile(sql, targetAccount, cookie, { pulseOnly: isPulseOnly });
        } catch (err) {
          console.warn(`[Phase 1] Profile sync warning:`, err.message);
        }

        if (!isPulseOnly) {
          try {
            await syncCompetitorBoards(sql, targetId, targetAccount, cookie);
          } catch (err) {
            console.warn(`[Phase 1] Boards sync warning:`, err.message);
          }

          try {
            await syncCompetitorPins(sql, targetId, targetAccount, {
              mode: crawlMode === 'refresh' ? 'refresh' : 'sharded_boards',
              maxPages: targetPages,
              cookie: cookie
            });
          } catch (err) {
            console.warn(`[Phase 1] Pins discovery warning:`, err.message);
          }
        } else {
          console.log(`[*] [Phase 1: Worker 0] Account @${targetAccount} is pulse_only. Skipping board and pin catalog discovery.`);
        }
      } finally {
        // Failure-Immune Barrier Signal: Always announce boards_ready so Workers 1..19 never stall
        await sql`
          UPDATE competitor_profiles
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('phase1_status', 'boards_ready', 'phase1_run_id', ${runToken}::text, 'phase1_time', NOW()::text)
          WHERE id = ${targetId};
        `.catch(() => {});
        console.log(`[*] [Phase 1: Worker 0] Announced boards_ready for parallel board swarm (token: ${runToken}).`);
      }
    } else {
      // Workers 1..19 wait for Worker 0 to announce boards_ready
      console.log(`\n[*] [Phase 1: Worker ${workerIndex + 1}/${workerTotal}] Waiting for Worker 0 to announce boards_ready (token: ${runToken})...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 180000; // 3 min ceiling
      const isCI = process.env.GITHUB_ACTIONS === 'true';

      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [prof] = await sql`
          SELECT metadata->>'phase1_status' AS status,
                 metadata->>'phase1_run_id' AS run_id
          FROM competitor_profiles
          WHERE id = ${targetId};
        `.catch(() => [null]);

        if (prof && prof.run_id === runToken && (prof.status === 'boards_ready' || prof.status === 'phase1_done')) {
          console.log(`[Phase 1] Boards ready signal received from Worker 0 in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }

        if (!isCI && (!prof || (prof.run_id !== runToken && prof.status !== 'crawling_phase1'))) {
          console.log(`[Phase 1] Local single-worker test detected. Proceeding.`);
          break;
        }

        await sleep(1500);
      }
    }

    if (isPulseOnly) {
      console.log(`\n[*] [Phase 2: Worker ${workerIndex + 1}/${workerTotal}] Account @${targetAccount} is in pulse_only mode. Skipping catalog pin scraping.`);
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 1B: Parallel Board Swarm (board_idx % workerTotal === workerIndex)
    // -------------------------------------------------------------------------
    if (crawlMode === 'sharded_boards' || targetBoardsInput || crawlMode !== 'refresh') {
      try {
        const boards = await sql`
          SELECT board_id, name, url, metadata
          FROM competitor_boards
          WHERE competitor_id = ${targetId}
          ORDER BY pin_count DESC NULLS LAST, board_id ASC;
        `;

        let filteredBoards = boards;
        if (personalBoardsOnly) {
          filteredBoards = filteredBoards.filter(b => !b.metadata?.is_group_board && !b.metadata?.is_collaborative);
        }
        if (targetBoardsInput) {
          const targets = targetBoardsInput.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          filteredBoards = filteredBoards.filter(b => targets.some(t => b.name.toLowerCase().includes(t) || b.board_id === t));
        }

        const candidateBoards = filteredBoards.slice(0, 60);
        const myBoards = candidateBoards.filter((_, boardIdx) => boardIdx % workerTotal === workerIndex);
        console.log(`[*] [Phase 1B: Worker ${workerIndex + 1}/${workerTotal}] Assigned ${myBoards.length}/${candidateBoards.length} board(s) for parallel board swarm.`);

        const BOARD_CONCURRENCY = 4;
        const boardSem = new Semaphore(BOARD_CONCURRENCY);
        await Promise.allSettled(myBoards.map(b => boardSem.run(async () => {
          try {
            await syncCompetitorBoardPins(sql, targetId, targetAccount, b, {
              mode: 'discovery',
              maxPages: Math.min(20, maxPages),
              cookie: cookie
            });
          } catch (bErr) {
            console.warn(`[Phase 1B] Board "${b.name}" crawl warning:`, bErr.message);
          }
        })));
      } catch (bQueryErr) {
        console.warn(`[Phase 1B] Boards query warning:`, bQueryErr.message);
      }
    }

    if (workerIndex === 0) {
      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${targetId};
      `.catch(() => {});
    }

    // -------------------------------------------------------------------------
    // Phase 2: Catalog Slice (ABS(hashtext(pin_id)) % workerTotal === workerIndex)
    // -------------------------------------------------------------------------
    console.log(`\n[*] [Phase 2: Worker ${workerIndex + 1}/${workerTotal}] Fetching catalog slice for @${targetAccount}...`);

    const catalogPins = await sql`
      SELECT DISTINCT ON (cbp.pin_id)
             cbp.pin_id, cbp.competitor_id, cbp.board_id,
             ump.board_name, ump.save_count, ump.repin_count, ump.comment_count,
             ump.created_at_pinterest, ump.updated_at AS last_updated_at,
             ump.daily_save_velocity AS prev_velocity,
             ump.last_scraped_at, ump.save_count AS ump_saves, ump.repin_count AS ump_repins, ump.comment_count AS ump_comments,
             ump.share_count AS ump_shares, ump.daily_save_velocity AS ump_velocity,
             ump.visual_annotations, ump.image_signature, ump.is_hydrated, ump.creation_method, ump.metadata AS ump_metadata
      FROM competitor_board_pins cbp
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE cbp.competitor_id = ${targetId}
        AND cbp.pin_id IS NOT NULL AND cbp.pin_id <> ''
        AND ${Number(workerTotal) === 20
          ? sql`(ABS(hashtext(cbp.pin_id::text)::bigint) % 20) = ${workerIndex}`
          : sql`(ABS(hashtext(cbp.pin_id::text)::bigint) % ${workerTotal}) = ${workerIndex}`}
      ORDER BY cbp.pin_id ASC, (CASE WHEN cbp.board_id <> '' THEN 0 ELSE 1 END) ASC;
    `;

    const myCatalogSlice = catalogPins;
    console.log(`[Phase 2] Worker #${workerIndex + 1}/${workerTotal} assigned ${myCatalogSlice.length} pins.`);

    let refreshedCount = 0;
    const refreshedPins = [];
    const metricSnapshots = [];
    const masterPinsToSync = [];

    if (myCatalogSlice.length > 0) {
      const pidgetsMap = await prehydrateCreatorCatalogWithPidgets(myCatalogSlice, {
        useFreshnessGate: true,
        useUmpFields: true
      });
      const CONCURRENCY = 8;
      const sem = new Semaphore(CONCURRENCY);

      await Promise.allSettled(myCatalogSlice.map(p => sem.run(async () => {
        const usedPidgets = Boolean(
          pidgetsMap.get(String(p.pin_id)) &&
          !pidgetsMap.get(String(p.pin_id)).is_missing &&
          Array.isArray(p.visual_annotations) &&
          p.visual_annotations.length > 0
        );
        const refreshed = await processCreatorCatalogPin(
          p,
          { fallbackUsername: targetAccount, competitorId: targetId, useFreshnessGate: true, useUmpFields: true },
          { refreshedPins, metricSnapshots, masterPinsToSync, pidgetsMap }
        );
        if (refreshed) refreshedCount++;
        if (!usedPidgets) {
          await sleep(randomJitterMs(150, 300));
        }
      })));
    }

    if (refreshedPins.length > 0 && masterPinsToSync.length > 0) {
      // Sync master pins & daily metric snapshots via canonical PinRepository.ingestPinsBatch SSOT
      await syncPinsToMasterCatalog(sql, masterPinsToSync, { competitor_id: targetId });
    }

    console.log(`\n✅ Worker #${workerIndex + 1}/${workerTotal} Complete: Refreshed ${refreshedCount}/${myCatalogSlice.length} pins.`);

    if (stepSummaryPath) {
      try {
        let md = `### 🐝 Swarm Worker #${workerIndex + 1}/${workerTotal} Summary (@${targetAccount})\n\n`;
        md += `- **Assigned Catalog Slice**: **${myCatalogSlice.length}** pins\n`;
        md += `- **Refreshed via Fast-Path (~90ms)**: **${refreshedCount}** pins\n`;
        md += `- **Daily Snapshots Committed to PostgreSQL**: **${metricSnapshots.length}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    await closeCrawlerDb(0);

  } else {
    // =========================================================================
    // EXECUTION MODE A: GLOBAL TWO-PHASE CREATOR SWARM (20 Workers)
    // Phase 1: Creator reach, boards & fresh pin discovery (early-stop: 3 pages)
    // Barrier Sync: Peer synchronization
    // Phase 2: Global winning pins slice refresh (crc32(pin_id) % 20 === worker_index)
    // =========================================================================
    let allFleetAccountIds = allAccountIdsInput.length > 0
      ? allAccountIdsInput
      : (accountIdsInput.length > 0 ? accountIdsInput : []);
    let myAccountIds = [];
    if (allFleetAccountIds.length === 0 && accountIdsInput.length === 0) {
      const rows = await sql`
        WITH ordered_creators AS (
          SELECT id, (ROW_NUMBER() OVER (ORDER BY last_synced_at ASC NULLS FIRST, id ASC) - 1) AS row_idx
          FROM competitor_profiles
          WHERE is_active = TRUE
            AND COALESCE(account_type, 'competitor') <> 'system'
        )
        SELECT id FROM ordered_creators
        WHERE MOD(row_idx, ${workerTotal}) = ${workerIndex};
      `;
      myAccountIds = rows.map(r => Number(r.id));
      allFleetAccountIds = myAccountIds;
    } else {
      myAccountIds = process.env.ACCOUNT_IDS !== undefined && accountIdsInput.length > 0
        ? accountIdsInput
        : allFleetAccountIds.filter((_, idx) => idx % workerTotal === workerIndex);
    }

    if (myAccountIds.length === 0 && accountIdsInput.length === 0) {
      console.log('[!] No active creators to sweep. Exiting cleanly.');
      await closeCrawlerDb(0);
    }

    console.log(`[Phase 1] Assigned ${myAccountIds.length} creator accounts to Worker #${workerIndex + 1}/${workerTotal}...`);

    let myAccounts = [];
    if (myAccountIds.length > 0) {
      myAccounts = await sql`
        SELECT id, username, display_name, avatar_url, monthly_reach, profile_views,
               total_pins, total_boards, follower_count, tracking_mode, custom_label,
               source_folder_id, metadata,
               (metadata->'qualification_rules') AS qualification_rules,
               (metadata->>'profile_pulse_only')::boolean AS profile_pulse_only
        FROM competitor_profiles
        WHERE id = ANY(${myAccountIds})
        ORDER BY 
          CASE WHEN tracking_mode = 'full' THEN 0 ELSE 1 END ASC,
          last_synced_at ASC NULLS FIRST,
          id ASC;
      `;
    }

    // -------------------------------------------------------------------------
    // PHASE 1: Creator Pulse & Discovery (Assigned Accounts)
    // -------------------------------------------------------------------------
    // Fetch Creator Hub dynamic auto-promote and qualification settings (once before Phase 1 loop)
    let creatorHubSettings = null;
    try {
      creatorHubSettings = await getCreatorHubSettings(sql);
      console.log(`[*] Loaded Creator Hub dynamic settings: auto_promote=${creatorHubSettings.auto_promote_enabled}, 24h_thresh=+${creatorHubSettings.auto_promote_delta_24h}, 7d_thresh=+${creatorHubSettings.auto_promote_delta_7d}`);
    } catch (setErr) {
      console.warn(`[!] Failed to load dynamic creator hub settings (using fallback defaults):`, setErr.message);
    }

    let accountsProcessed = 0;
    const pulseAccounts = [];
    const fullAccounts = [];

    for (const acc of myAccounts) {
      // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 7: Lightweight Creator Pulse Fast-Path Bypass
      const isPulseOnly = acc.tracking_mode === 'pulse_only' || (acc.profile_pulse_only ?? acc.metadata?.profile_pulse_only) === true;
      if (isPulseOnly) {
        pulseAccounts.push(acc);
      } else {
        fullAccounts.push(acc);
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 1A: Parallel Semaphore(6) + Batch JSONB Upsert (100/batch) for pulse_only
    // -------------------------------------------------------------------------
    if (pulseAccounts.length > 0) {
      console.log(`\n[*] [Phase 1A] High-Velocity Batch Pulse for ${pulseAccounts.length} pulse_only account(s) (Semaphore: 6, Batch: 100)...`);
      const pulseIds = pulseAccounts.map(a => Number(a.id)).filter(Boolean);
      const historyMap = new Map();

      try {
        const histRows = await sql`
          WITH p24 AS (
            SELECT DISTINCT ON (competitor_id)
              competitor_id, monthly_reach, profile_views, total_pins, total_boards
            FROM competitor_history_snapshots
            WHERE competitor_id = ANY(${pulseIds}::int[])
              AND recorded_date < CURRENT_DATE
            ORDER BY competitor_id, recorded_date DESC
          ),
          b7d AS (
            SELECT DISTINCT ON (competitor_id)
              competitor_id, monthly_reach, profile_views, total_pins, total_boards
            FROM competitor_history_snapshots
            WHERE competitor_id = ANY(${pulseIds}::int[])
              AND recorded_date <= CURRENT_DATE - INTERVAL '6 days'
            ORDER BY competitor_id, recorded_date DESC
          ),
          earliest AS (
            SELECT DISTINCT ON (competitor_id)
              competitor_id, monthly_reach, profile_views, total_pins, total_boards
            FROM competitor_history_snapshots
            WHERE competitor_id = ANY(${pulseIds}::int[])
              AND recorded_date < CURRENT_DATE
            ORDER BY competitor_id, recorded_date ASC
          )
          SELECT
            u.cid AS competitor_id,
            row_to_json(p24) AS prior_24h,
            COALESCE(row_to_json(b7d), row_to_json(earliest)) AS baseline_7d
          FROM unnest(${pulseIds}::int[]) AS u(cid)
          LEFT JOIN p24 ON p24.competitor_id = u.cid
          LEFT JOIN b7d ON b7d.competitor_id = u.cid
          LEFT JOIN earliest ON earliest.competitor_id = u.cid;
        `;
        for (const hr of (histRows || [])) {
          historyMap.set(Number(hr.competitor_id), {
            prior24h: hr.prior_24h || null,
            baseline7d: hr.baseline_7d || null
          });
        }
      } catch (hErr) {
        console.warn(`[Phase 1A] Batch history baseline lookup warning:`, hErr.message);
      }

      const resolvedPulseCookie = await getEffectivePinterestCookie(sql, cookie);
      const formattedCookie = formatPinterestCookie(resolvedPulseCookie);
      const PULSE_BATCH_SIZE = 100;
      let pulseBuffer = [];

      const flushPulseBatch = async (chunk) => {
        if (!chunk || chunk.length === 0) return;
        const sortedChunk = [...chunk].sort((a, b) => Number(a.competitor_id) - Number(b.competitor_id));
        const payloadJson = JSON.stringify(sanitizeForJsonb(sortedChunk));

        try {
          await sql`
            UPDATE competitor_profiles AS cp
            SET
              display_name = COALESCE(NULLIF(u.display_name, ''), cp.display_name),
              avatar_url = COALESCE(NULLIF(u.avatar_url, ''), cp.avatar_url),
              monthly_reach = CASE
                WHEN u.monthly_reach = 10000001 AND cp.monthly_reach > 10000001 THEN cp.monthly_reach
                WHEN u.monthly_reach > 0 THEN u.monthly_reach
                ELSE cp.monthly_reach
              END,
              delta_reach_24h = u.delta_reach_24h,
              reach_delta_7d = u.reach_delta_7d,
              profile_views = CASE
                WHEN u.profile_views = 10000001 AND cp.profile_views > 10000001 THEN cp.profile_views
                WHEN u.profile_views > 0 THEN u.profile_views
                ELSE cp.profile_views
              END,
              delta_views_24h = u.delta_views_24h,
              views_delta_7d = u.views_delta_7d,
              total_pins = GREATEST(cp.total_pins, u.total_pins),
              delta_pins_24h = u.delta_pins_24h,
              pins_delta_7d = u.pins_delta_7d,
              total_boards = GREATEST(cp.total_boards, u.total_boards),
              delta_boards_24h = u.delta_boards_24h,
              boards_delta_7d = u.boards_delta_7d,
              follower_count = CASE WHEN u.follower_count > 0 THEN u.follower_count ELSE cp.follower_count END,
              activity_status = COALESCE(NULLIF(u.activity_status, ''), cp.activity_status),
              tracking_mode = COALESCE(NULLIF(u.tracking_mode, ''), cp.tracking_mode),
              custom_label = CASE WHEN cp.custom_label IS NULL OR cp.custom_label = '' THEN COALESCE(u.custom_label, cp.custom_label) ELSE cp.custom_label END,
              metadata = COALESCE(cp.metadata, '{}'::jsonb) || COALESCE(u.meta_update, '{}'::jsonb),
              last_synced_at = NOW(),
              updated_at = NOW()
            FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
              competitor_id int,
              display_name text,
              avatar_url text,
              monthly_reach bigint,
              delta_reach_24h bigint,
              reach_delta_7d bigint,
              profile_views bigint,
              delta_views_24h bigint,
              views_delta_7d bigint,
              total_pins int,
              delta_pins_24h int,
              pins_delta_7d int,
              total_boards int,
              delta_boards_24h int,
              boards_delta_7d int,
              follower_count int,
              activity_status text,
              tracking_mode text,
              custom_label text,
              meta_update jsonb
            )
            WHERE cp.id = u.competitor_id;
          `;

          const insertSnapshots = () => sql`
            INSERT INTO competitor_history_snapshots (
              competitor_id,
              monthly_reach,
              profile_views,
              follower_count,
              total_pins,
              total_boards,
              recorded_date,
              metadata
            )
            SELECT
              u.competitor_id,
              u.monthly_reach,
              u.profile_views,
              u.follower_count,
              u.total_pins,
              u.total_boards,
              CURRENT_DATE,
              COALESCE(u.snap_meta, '{}'::jsonb)
            FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
              competitor_id int,
              monthly_reach bigint,
              profile_views bigint,
              follower_count int,
              total_pins int,
              total_boards int,
              snap_meta jsonb
            )
            ON CONFLICT (competitor_id, recorded_date) DO UPDATE SET
              monthly_reach = CASE
                WHEN EXCLUDED.monthly_reach = 10000001 AND competitor_history_snapshots.monthly_reach > 10000001 THEN competitor_history_snapshots.monthly_reach
                WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach
                ELSE competitor_history_snapshots.monthly_reach
              END,
              profile_views = CASE
                WHEN EXCLUDED.profile_views = 10000001 AND competitor_history_snapshots.profile_views > 10000001 THEN competitor_history_snapshots.profile_views
                WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views
                ELSE competitor_history_snapshots.profile_views
              END,
              follower_count = CASE WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count ELSE competitor_history_snapshots.follower_count END,
              total_pins = GREATEST(competitor_history_snapshots.total_pins, EXCLUDED.total_pins),
              total_boards = GREATEST(competitor_history_snapshots.total_boards, EXCLUDED.total_boards),
              metadata = COALESCE(competitor_history_snapshots.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
            WHERE
              competitor_history_snapshots.monthly_reach IS DISTINCT FROM EXCLUDED.monthly_reach
              OR competitor_history_snapshots.profile_views IS DISTINCT FROM EXCLUDED.profile_views
              OR competitor_history_snapshots.follower_count IS DISTINCT FROM EXCLUDED.follower_count
              OR competitor_history_snapshots.total_pins IS DISTINCT FROM EXCLUDED.total_pins
              OR competitor_history_snapshots.total_boards IS DISTINCT FROM EXCLUDED.total_boards;
          `;

          try {
            await insertSnapshots();
          } catch (snapErr) {
            if (String(snapErr.message || '').includes('competitor_history_snapshots_pkey')) {
              await sql`
                SELECT setval(
                  pg_get_serial_sequence('competitor_history_snapshots', 'id'),
                  GREATEST(COALESCE((SELECT MAX(id) FROM competitor_history_snapshots), 0) + 1, 1),
                  false
                );
              `.catch(() => {});
              await insertSnapshots();
            } else {
              throw snapErr;
            }
          }
        } catch (flushErr) {
          console.warn(`[Phase 1A] Batch pulse upsert warning:`, flushErr.message);
        }
      };

      const isAutoPromoteEnabled = creatorHubSettings?.auto_promote_enabled ?? false;
      const dynamicDelta24h = Number(creatorHubSettings?.auto_promote_delta_24h ?? AUTO_PROMOTE_PULSE_DELTA_24H);
      const dynamicDelta7d = Number(creatorHubSettings?.auto_promote_delta_7d ?? AUTO_PROMOTE_PULSE_DELTA_7D);

      const pulseSem = new Semaphore(6);
      await Promise.allSettled(pulseAccounts.map((acc) => pulseSem.run(async () => {
        const cleanUser = (acc.username || '').replace(/^@+/, '').trim();
        if (!cleanUser) return;

        try {
          const res = await fetchUserResource(cleanUser, formattedCookie);
          if (!res?.ok) return;

          const rawReach = Number(res.monthly_reach ?? res.total_audience ?? 0);
          const rawViews = Number(res.profile_views ?? res.monthly_views ?? 0);
          const rawPins = Number(res.total_pins ?? res.pin_count ?? 0);
          const rawBoards = Number(res.total_boards ?? res.board_count ?? 0);
          const rawFollowers = Number(res.follower_count ?? 0);
          const avatarUrl = res.avatar_url || acc.avatar_url || null;
          const displayName = res.display_name || acc.display_name || cleanUser;

          const prevExistingReach = Number(acc.monthly_reach || 0);
          const prevExistingViews = Number(acc.profile_views || 0);
          const prevExistingPins = Number(acc.total_pins || 0);
          const prevExistingBoards = Number(acc.total_boards || 0);
          const prevExistingFollowers = Number(acc.follower_count || 0);

          let monthlyReach = rawReach <= 0
            ? prevExistingReach
            : ((rawReach === 10000001 && prevExistingReach > 10000001) ? prevExistingReach : rawReach);
          let profileViews = rawViews <= 0
            ? prevExistingViews
            : ((rawViews === 10000001 && prevExistingViews > 10000001) ? prevExistingViews : rawViews);
          const totalPins = rawPins > 0 ? Math.max(rawPins, prevExistingPins) : prevExistingPins;
          const totalBoards = rawBoards > 0 ? Math.max(rawBoards, prevExistingBoards) : prevExistingBoards;
          const followers = rawFollowers > 0 ? rawFollowers : prevExistingFollowers;

          const hist = historyMap.get(Number(acc.id)) || {};
          const prior24h = hist.prior24h || null;
          const baseline7d = hist.baseline7d || null;

          const priorReach = Number(prior24h?.monthly_reach || 0);
          if (monthlyReach <= 0 && priorReach > 0) monthlyReach = priorReach;
          if (rawReach === 10000001 && priorReach > 10000001 && monthlyReach <= 10000001) monthlyReach = priorReach;
          const priorViews = Number(prior24h?.profile_views || 0);
          if (profileViews <= 0 && priorViews > 0) profileViews = priorViews;
          if (rawViews === 10000001 && priorViews > 10000001 && profileViews <= 10000001) profileViews = priorViews;

          let deltaReach24h = (prior24h && priorReach > 0 && monthlyReach > 0) ? (monthlyReach - priorReach) : 0;
          let deltaViews24h = (prior24h && priorViews > 0 && profileViews > 0) ? (profileViews - priorViews) : 0;
          if (rawReach === 10000001 || (priorReach === 10000001 && monthlyReach > 10000001)) deltaReach24h = 0;
          if (rawViews === 10000001 || (priorViews === 10000001 && profileViews > 10000001)) deltaViews24h = 0;
          const deltaPins24h = (prior24h && totalPins > 0) ? (totalPins - Number(prior24h.total_pins || 0)) : 0;
          const deltaBoards24h = (prior24h && totalBoards > 0) ? (totalBoards - Number(prior24h.total_boards || 0)) : 0;

          const baselineReach = Number(baseline7d?.monthly_reach || 0);
          if (rawReach === 10000001 && baselineReach > 10000001 && monthlyReach <= 10000001) monthlyReach = baselineReach;
          const baselineViews = Number(baseline7d?.profile_views || 0);
          if (rawViews === 10000001 && baselineViews > 10000001 && profileViews <= 10000001) profileViews = baselineViews;

          let reachDelta7d = (baseline7d && baselineReach > 0 && monthlyReach > 0) ? (monthlyReach - baselineReach) : 0;
          let viewsDelta7d = (baseline7d && baselineViews > 0 && profileViews > 0) ? (profileViews - baselineViews) : 0;
          if (rawReach === 10000001 || (baselineReach === 10000001 && monthlyReach > 10000001)) reachDelta7d = 0;
          if (rawViews === 10000001 || (baselineViews === 10000001 && profileViews > 10000001)) viewsDelta7d = 0;
          const pinsDelta7d = (baseline7d && totalPins > 0) ? (totalPins - Number(baseline7d.total_pins || 0)) : 0;
          const boardsDelta7d = (baseline7d && totalBoards > 0) ? (totalBoards - Number(baseline7d.total_boards || 0)) : 0;

          const metaUpdate = {};
          if (res.account_created_at) metaUpdate.account_created_at = res.account_created_at;
          if (res.last_pin_save_time) metaUpdate.last_pin_save_time = res.last_pin_save_time;
          if (res.pinterest_id) metaUpdate.pinterest_id = res.pinterest_id;
          if (res.group_board_count !== undefined) metaUpdate.group_board_count = res.group_board_count;
          if (res.domain_verified !== undefined) metaUpdate.domain_verified = res.domain_verified;
          if (res.is_verified_merchant !== undefined) metaUpdate.is_verified_merchant = res.is_verified_merchant;
          if (res.has_catalog !== undefined) metaUpdate.has_catalog = res.has_catalog;
          if (res.video_pin_count !== undefined) metaUpdate.video_pin_count = res.video_pin_count;
          if (res.story_pin_count !== undefined) metaUpdate.story_pin_count = res.story_pin_count;

          let activityStatus = 'just now';
          if (res.last_pin_save_time) {
            const diffMs = Date.now() - new Date(res.last_pin_save_time).getTime();
            if (!isNaN(diffMs) && diffMs > 0) {
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffHours / 24);
              activityStatus = diffDays >= 1 ? `${diffDays}d ago` : (diffHours >= 1 ? `${diffHours}h ago` : 'just now');
            }
          }

          let nextTrackingMode = 'pulse_only';
          let nextCustomLabel = acc.custom_label || '';

          // [INVARIANT: AUTO-PROMOTE-PULSE-BREAKOUT] Check if lightweight pulse creator breached breakout threshold
          if (isAutoPromoteEnabled && (deltaReach24h >= dynamicDelta24h || reachDelta7d >= dynamicDelta7d)) {
            console.log(`[🚀 AUTO-PROMOTE] @${cleanUser} exceeded breakout threshold (24h: +${deltaReach24h} vs ${dynamicDelta24h}, 7d: +${reachDelta7d} vs ${dynamicDelta7d}). Promoting pulse_only -> full!`);
            const configuredQualRules = creatorHubSettings?.qualification_rules || {};
            const minSaves = Number.isFinite(Number(configuredQualRules.min_saves)) ? Math.max(0, Number(configuredQualRules.min_saves)) : 500;
            const minVelocity = Number.isFinite(Number(configuredQualRules.min_velocity)) ? Math.max(0, Number(configuredQualRules.min_velocity)) : 10.0;
            const qualRulesToPersist = {
              tier1_min_saves: minSaves,
              tier2_min_repins: minSaves,
              tier2_min_velocity: minVelocity,
              tier3_min_saves: Math.min(minSaves, Math.max(25, Math.floor(minSaves / 2))),
              auto_promote_inherited: true
            };
            nextTrackingMode = 'full';
            if (!nextCustomLabel) nextCustomLabel = 'Breakout Auto-Promoted';
            metaUpdate.profile_pulse_only = false;
            metaUpdate.auto_promoted_at = new Date().toISOString();
            metaUpdate.auto_promote_reason = 'reach_breakout';
            metaUpdate.qualification_rules = qualRulesToPersist;

            acc.tracking_mode = 'full';
            acc.qualification_rules = qualRulesToPersist;
            acc._wasAutoPromotedInThisRun = true;
            fullAccounts.push(acc);
          }

          const snapMeta = {
            total_saves: 0,
            total_repins: 0,
            delta_reach_24h: deltaReach24h,
            reach_delta_7d: reachDelta7d,
            delta_views_24h: deltaViews24h,
            views_delta_7d: viewsDelta7d,
            delta_pins_24h: deltaPins24h,
            pins_delta_7d: pinsDelta7d,
            delta_boards_24h: deltaBoards24h,
            boards_delta_7d: boardsDelta7d
          };

          pulseBuffer.push({
            competitor_id: Number(acc.id),
            display_name: displayName,
            avatar_url: avatarUrl,
            monthly_reach: monthlyReach,
            delta_reach_24h: deltaReach24h,
            reach_delta_7d: reachDelta7d,
            profile_views: profileViews,
            delta_views_24h: deltaViews24h,
            views_delta_7d: viewsDelta7d,
            total_pins: totalPins,
            delta_pins_24h: deltaPins24h,
            pins_delta_7d: pinsDelta7d,
            total_boards: totalBoards,
            delta_boards_24h: deltaBoards24h,
            boards_delta_7d: boardsDelta7d,
            follower_count: followers,
            activity_status: activityStatus,
            tracking_mode: nextTrackingMode,
            custom_label: nextCustomLabel,
            meta_update: metaUpdate,
            snap_meta: snapMeta
          });

          if (pulseBuffer.length >= PULSE_BATCH_SIZE) {
            const chunkToFlush = pulseBuffer;
            pulseBuffer = [];
            await flushPulseBatch(chunkToFlush);
          }
        } catch (pErr) {
          console.warn(`[!] Pulse sync warning for @${cleanUser}:`, pErr.message);
        } finally {
          accountsProcessed++;
          if (accountsProcessed % 50 === 0) {
            console.log(`  [Phase 1A Progress] Inspected ${accountsProcessed}/${pulseAccounts.length} pulse_only accounts...`);
          }
          await sleep(randomJitterMs(120, 250));
        }
      })));

      if (pulseBuffer.length > 0) {
        await flushPulseBatch(pulseBuffer);
      }
      console.log(`[✓] [Phase 1A] Completed batch pulse for ${pulseAccounts.length} accounts.`);
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Full Catalog / Auto-Promoted Accounts Discovery
    // -------------------------------------------------------------------------
    const fullSem = new Semaphore(Math.min(3, Math.max(1, fullAccounts.length)));
    await Promise.allSettled(fullAccounts.map((acc, i) => fullSem.run(async () => {
      const cleanUser = (acc.username || '').replace(/^@+/, '').trim();
      const wasAutoPromotedInThisRun = Boolean(acc._wasAutoPromotedInThisRun);
      console.log(`\n----------------------------------------------------------------`);
      console.log(`[Phase 1B: ${i + 1}/${fullAccounts.length}] Full Creator Sync: @${cleanUser} (Account ID: ${acc.id})`);
      console.log(`----------------------------------------------------------------`);

      if (!wasAutoPromotedInThisRun) {
        try {
          console.log(`[*] Updating reach & impressions for @${cleanUser}...`);
          await syncCompetitorProfile(sql, cleanUser, cookie, { pulseOnly: false });
        } catch (pErr) {
          console.warn(`[!] Profile sync warning for @${cleanUser}:`, pErr.message);
        }
      }

      const shouldHarvest = !wasAutoPromotedInThisRun || (creatorHubSettings?.auto_harvest_pins !== false);
      if (shouldHarvest) {
        // 2. Discover Boards
        try {
          await syncCompetitorBoards(sql, acc.id, cleanUser, cookie);
        } catch (_) {}

        // 3. Discover Fresh Pins (early-stop: per-account rules or 3 pages or configured harvest pages)
        try {
          const accRules = acc.qualification_rules || acc.metadata?.qualification_rules || {};
          const earlyStop = Number(accRules.early_stop_pages) || 3;
          const harvestPages = Math.max(1, Math.ceil((Number(creatorHubSettings?.max_pins_harvest) || 150) / 50));
          const targetPages = crawlMode === 'deep' || crawlMode === 'all'
            ? (Number(accRules.max_pages) || maxPages || 500)
            : (wasAutoPromotedInThisRun ? harvestPages : earlyStop);
          console.log(`[*] Checking for fresh pins (target: ${targetPages} pages, early-stop: ${earlyStop})...`);
          await syncCompetitorPins(sql, acc.id, cleanUser, {
            mode: 'refresh',
            maxPages: targetPages,
            cookie: cookie
          });
          await reconcileQualifiedCatalogPins(sql, acc.id);
        } catch (_) {}
      } else {
        console.log(`[*] Account @${cleanUser} auto-promoted but auto_harvest_pins is disabled in settings. Skipping pin harvest.`);
      }

      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${acc.id};
      `.catch(() => {});

      accountsProcessed++;
    })));

    // -------------------------------------------------------------------------
    // PHASE 2: Global Master Pins Slice Refresh (ABS(hashtext(pin_id)) % workerTotal === workerIndex)
    // -------------------------------------------------------------------------
    console.log(`\n[*] [Phase 2] Querying all active master pins from universal_master_pins on Central Hub...`);

    const myWinningSlice = await sql`
      SELECT 
        p.pin_id, p.creator_username AS account_username, p.board_name, p.board_id,
        cp.id AS competitor_id,
        p.save_count AS saves, p.repin_count AS repins, p.comment_count AS comments, p.share_count,
        p.daily_save_velocity AS velocity, p.updated_at AS last_updated_at, p.created_at_pinterest,
        p.last_scraped_at, p.visual_annotations, p.image_signature, p.is_hydrated, p.creation_method, p.metadata AS ump_metadata
      FROM universal_master_pins p
      LEFT JOIN competitor_profiles cp ON cp.username = p.creator_username
      WHERE ${Number(workerTotal) === 20
        ? sql`(ABS(hashtext(p.pin_id::text)::bigint) % 20) = ${workerIndex}`
        : sql`(ABS(hashtext(p.pin_id::text)::bigint) % ${workerTotal}) = ${workerIndex}`}
        AND (cp.tracking_mode IS NULL OR cp.tracking_mode <> 'pulse_only')
        AND (p.last_scraped_at IS NULL OR p.last_scraped_at < NOW() - MAKE_INTERVAL(hours => ${PHASE2_FRESHNESS_HOURS}))
      ORDER BY p.last_scraped_at ASC NULLS FIRST, p.save_count DESC NULLS LAST
      LIMIT ${PHASE2_MAX_PINS};
    `;
    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} assigned ${myWinningSlice.length} global master pins (freshness >= ${PHASE2_FRESHNESS_HOURS}h, limit ${PHASE2_MAX_PINS}).`);

    let refreshedWinningCount = 0;
    const refreshedPins = [];
    const metricSnapshots = [];
    const masterPinsToSync = [];

    if (myWinningSlice.length > 0) {
      const pidgetsMap = await prehydrateCreatorCatalogWithPidgets(myWinningSlice, {
        useFreshnessGate: true,
        useUmpFields: false
      });
      const CONCURRENCY = 8;
      const sem = new Semaphore(CONCURRENCY);

      await Promise.allSettled(myWinningSlice.map(p => sem.run(async () => {
        const usedPidgets = Boolean(
          pidgetsMap.get(String(p.pin_id)) &&
          !pidgetsMap.get(String(p.pin_id)).is_missing &&
          Array.isArray(p.visual_annotations) &&
          p.visual_annotations.length > 0
        );
        try {
          const refreshed = await processCreatorCatalogPin(
            p,
            { useFreshnessGate: true, useUmpFields: false },
            { refreshedPins, metricSnapshots, masterPinsToSync, pidgetsMap }
          );
          if (refreshed) refreshedWinningCount++;
        } catch (_) {}
        if (!usedPidgets) {
          await sleep(randomJitterMs(150, 300));
        }
      })));
    }

    if (refreshedPins.length > 0 && masterPinsToSync.length > 0) {
      // Sync master pins & daily metric snapshots via canonical PinRepository.ingestPinsBatch SSOT
      await syncPinsToMasterCatalog(sql, masterPinsToSync);
    }

    console.log(`\n✅ Swarm Worker #${workerIndex + 1}/${workerTotal} Complete: Processed ${accountsProcessed} accounts | Refreshed ${refreshedWinningCount}/${myWinningSlice.length} winning pins.`);

    if (stepSummaryPath) {
      try {
        let md = `### 🐝 Swarm Worker #${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Accounts Processed (Phase 1)**: **${accountsProcessed}**\n`;
        md += `- **Winning Pins Slice (Phase 2)**: **${myWinningSlice.length}** pins\n`;
        md += `- **Refreshed via Fast-Path (~90ms)**: **${refreshedWinningCount}** pins\n`;
        md += `- **Daily Snapshots Committed to PostgreSQL**: **${metricSnapshots.length}**\n`;
        md += `- **Master Pins Synced to Universal Catalog**: **${masterPinsToSync.length}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    await closeCrawlerDb(0);
  }
}

if (isDirectCrawlerRun) {
  lease = startInstaBoxActivityLease('creator-velocity-crawler');
  (async () => {
    try {
      await run();
    } catch (err) {
      console.error('[-] Fatal Worker Error:', err);
      process.exitCode = 1;
    } finally {
      await lease.stop();
      if (sql && typeof sql.end === 'function') {
        await sql.end({ timeout: 3 }).catch(() => {});
      }
    }
    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  })();
}
