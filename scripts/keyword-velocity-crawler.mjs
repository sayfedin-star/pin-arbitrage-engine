#!/usr/bin/env node

/**
 * scripts/keyword-velocity-crawler.mjs
 * 
 * Keyword Intelligence & Velocity Autonomous Fleet Worker (20-Runner Compatible)
 * 
 * Modes of Execution:
 * 1. MODE='pin_partition' (Single-Keyword Pin-Slice Sharding):
 *    Inspects its designated slice (pin_index % worker_total === worker_index) of candidate pins
 *    across both Active SERP and Displaced Vault. Runs in parallel on 20 runners (~30s total).
 * 
 * 2. MODE='keyword_sweep' (Multi-Keyword Broadcast):
 *    Crawls the assigned keyword's SERP and deep-inspects top candidate pins.
 * 
 * Production Features:
 * - Dead / 404 Pin Protection: Preserves historical saves, marks is_deleted in metadata.
 * - Zero-Loss JSONB Set Union for Visual Annotations in Unified PostgreSQL SSOT.
 * - Tracks Authentic Saves & Viral Repins (Daily Telemetry).
 * - Non-blocking Postgres Advisory Locks to prevent concurrent race conditions.
 * - Jitter backoff (2500ms-4000ms) with AbortSignal.timeout(8000).
 */

import {
  createSqlClient,
  withDbRetry,
  isTransientPgConnectionError,
  isStatementTimeoutError
} from '../src/db/client.mjs';
import fs from 'fs';
import crypto from 'node:crypto';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';
import { getEffectivePinterestCookie } from '../src/modules/keywords/settings.mjs';
import { autoDiscoverFolderCreatorsForKeyword } from '../src/modules/keywords/folders-crud.mjs';
import {
  randomJitterMs,
  sleep,
  setDefaultDispatcher,
  fetchPinFromPinterest,
  fetchPinFromPinResource,
  fetchPinHybrid,
  fetchPinsBatchFromPidgets
} from '../src/core/pinterest/index.mjs';
import {
  insertNewPinsBatch,
  resavePinsMetricsBatch,
  ingestPinsBatch
} from '../src/modules/pins/repository.mjs';
import { calculateDailyVelocity, calculateRollingGainsFromSnapshots } from '../src/lib/math.mjs';
import {
  buildRichPinMetadataPayload,
  sanitizeVisualAnnotations
} from '../src/domain/pin-intelligence.mjs';
import { Semaphore } from '../src/utils.mjs';

import {
  loadDotEnvIfPresent,
  bootstrapUndiciKeepAliveDispatcher,
  closeCrawlerDb as closeDbClient,
  startInstaBoxActivityLease,
  resolveWorkerPartition
} from './lib/fleet-runner.mjs';

const isMainModule = Boolean(process.argv[1] && (
  process.argv[1].endsWith('keyword-velocity-crawler.mjs') ||
  process.argv[1].endsWith('keyword-velocity-crawler')
));

if (isMainModule) {
  await bootstrapUndiciKeepAliveDispatcher(setDefaultDispatcher);
  loadDotEnvIfPresent();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && isMainModule && !process.env.INGEST_API_URL && !process.env.PAE_INGEST_ENDPOINT) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = (DATABASE_URL && isMainModule) ? createSqlClient(DATABASE_URL) : null;
function classifyFatalSerpSqlError(err) {
  if (isTransientPgConnectionError(err) || isStatementTimeoutError(err)) {
    return false;
  }
  const sqlState = String(err?.code || '');
  return /^(22|42|23)/.test(sqlState) || /jsonb_to_recordset|syntax error|column .* does not exist/i.test(String(err?.message || ''));
}
async function stampPhase1ABarrierToken(kid, token, leaseToken) {
  const barrierSql = sql?.noRetry || sql;
  await withDbRetry(() => barrierSql`
    UPDATE tracked_keywords
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{phase1a_completed_token}', to_jsonb(${token}::text)),
        updated_at = NOW(),
        crawl_lease_token = CASE WHEN crawl_lease_token = ${leaseToken}::uuid THEN NULL ELSE crawl_lease_token END,
        crawl_lease_until = CASE WHEN crawl_lease_token = ${leaseToken}::uuid THEN NULL ELSE crawl_lease_until END
    WHERE id = ${kid};
  `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });
}

let lease = null;
const closeCrawlerDb = (exitCode = 0) => closeDbClient(sql, exitCode, lease);
const mode = (process.env.MODE || 'keyword_sweep').toLowerCase().trim();
const { workerIndex, workerTotal } = resolveWorkerPartition();

const targetKeyword = (process.env.KEYWORD_IDS || process.env.ALL_KEYWORD_IDS)
  ? ''
  : (process.env.TARGET_KEYWORD || '').trim().toLowerCase();
const keywordIdInput = process.env.KEYWORD_ID ? parseInt(process.env.KEYWORD_ID, 10) : null;
const keywordIdsInput = (process.env.KEYWORD_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));
const allKeywordIdsInput = (process.env.ALL_KEYWORD_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));
const folderIdInput = process.env.FOLDER_ID ? parseInt(process.env.FOLDER_ID, 10) : null;
const crawlScope = (process.env.CRAWL_SCOPE || 'all_pins').toLowerCase().trim();
const cookie = process.env.PINTEREST_COOKIE || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;
const envSerpPins = process.env.MAX_SERP_PINS?.trim() || process.env.MAX_PINS?.trim();
const explicitMaxSerpPins = (envSerpPins && !isNaN(parseInt(envSerpPins, 10)))
  ? Math.max(10, Math.min(2000, parseInt(envSerpPins, 10)))
  : null;
const maxSerpPins = explicitMaxSerpPins;

const envCatalogInspect = process.env.MAX_CATALOG_INSPECT?.trim();
const maxCatalogInspect = (envCatalogInspect !== undefined && envCatalogInspect !== '' && !isNaN(parseInt(envCatalogInspect, 10)))
  ? Math.max(0, parseInt(envCatalogInspect, 10))
  : 0;

const envHarvest = process.env.ENABLE_SERP_HARVEST?.trim();
const enableSerpHarvest = (envHarvest !== undefined && envHarvest !== '')
  ? (envHarvest === 'true' || envHarvest === '1')
  : true;
const maxPins = maxSerpPins;


const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '12', 10));
const BATCH_SIZE = Math.max(10, parseInt(process.env.BATCH_SIZE || '250', 10));
const SLEEP_MS_MIN = Math.max(150, parseInt(process.env.SLEEP_MS_MIN || '300', 10));
const SLEEP_MS_MAX = Math.max(SLEEP_MS_MIN, parseInt(process.env.SLEEP_MS_MAX || '600', 10));

let rateLimitCooldownUntil = 0;
let consecutiveErrors = 0;
const CIRCUIT_BREAKER_LIMIT = 25;
let circuitBroken = false;

export const PIDGETS_DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10-minute dedup window for Pidgets fast telemetry
export const DEEP_DNA_RECHECK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14-day cooldown for pins confirmed annotationless on Pinterest

function resolveForceRefreshFlag(options = {}) {
  if (options.force !== undefined) return Boolean(options.force);
  return (
    process.argv.includes('--force') ||
    process.env.FORCE_REFRESH === 'true' ||
    process.env.FORCE_REFRESH === '1' ||
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  );
}

function resolveForceDeepFlag(options = {}) {
  if (options.forceDeep !== undefined) return Boolean(options.forceDeep);
  return (
    process.argv.includes('--force-deep') ||
    process.env.FORCE_DEEP_REFRESH === 'true' ||
    process.env.FORCE_DEEP_REFRESH === '1'
  );
}

export function hasCompleteStructuralDna(pin, currentUtcTimestamp = Date.now()) {
  const meta = (pin?.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const currentMethod = String(pin?.creation_method || pin?.method || meta.creation_method || meta.method || '').trim();
  if (currentMethod === 'unhydrated_stub' || pin?.is_hydrated === false) {
    return false;
  }
  const cleanAnns = sanitizeVisualAnnotations(pin?.visual_annotations ?? meta.visual_annotations, { maxItems: 15 });
  const hasAnnotations = pin?.has_visual_annotations === true || cleanAnns.length > 0;
  const rawCheckedAt = pin?.deep_dna_checked_at ?? meta?.deep_dna_checked_at ?? null;
  const checkedMs = rawCheckedAt ? new Date(rawCheckedAt).getTime() : NaN;
  const hasFreshDeepDnaCheck = (
    Number.isFinite(checkedMs) &&
    checkedMs > 0 &&
    (currentUtcTimestamp - checkedMs) >= 0 &&
    (currentUtcTimestamp - checkedMs) < DEEP_DNA_RECHECK_WINDOW_MS
  );
  const imgSig = String(pin?.image_signature || meta.image_signature || '').trim();
  return Boolean(
    pin?.created_at_pinterest &&
    (imgSig || meta.has_treasures === true) &&
    (hasAnnotations || hasFreshDeepDnaCheck)
  );
}

/**
 * Two-Lane Hydration Guard:
 * - Timestamp SSOT is strictly `last_scraped_at` (NEVER `keyword_serp_positions.crawled_at`).
 * - Lane 1 (`pidgets`): Structurally complete pins refresh live saves/repins via 50x Pidgets
 *   whenever older than the 10-minute dedup window (or immediately on `--force` / `workflow_dispatch`).
 * - Lane 2 (`deep`): Missing structural DNA, unhydrated stubs, or `--force-deep` route to `fetchPinHybrid`.
 */
export function evaluateHydrationGuard(pin, currentUtcTimestamp = Date.now(), options = {}) {
  const lastScrapedTs = pin?.last_scraped_at || pin?.metadata?.last_scraped_at || null;
  const meta = (pin?.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const currentMethod = String(pin?.creation_method || pin?.method || meta.creation_method || meta.method || '').trim();
  const isForce = resolveForceRefreshFlag(options);
  const isForceDeep = resolveForceDeepFlag(options);
  const dedupWindowMs = Number.isFinite(Number(options.dedupWindowMs))
    ? Math.max(0, Number(options.dedupWindowMs))
    : PIDGETS_DEDUP_WINDOW_MS;

  if (isForceDeep) {
    return { shouldFetch: true, lane: 'deep', shouldFetchDeep: true, reason: 'force_deep_refresh', reuseTelemetry: null };
  }

  if (currentMethod === 'unhydrated_stub' || pin?.is_hydrated === false) {
    return { shouldFetch: true, lane: 'deep', shouldFetchDeep: true, reason: 'unhydrated_stub', reuseTelemetry: null };
  }

  if (!pin?.created_at_pinterest) {
    return { shouldFetch: true, lane: 'deep', shouldFetchDeep: true, reason: 'missing_created_at_pinterest', reuseTelemetry: null };
  }

  if (pin?.save_count == null) {
    return { shouldFetch: true, lane: 'deep', shouldFetchDeep: true, reason: 'missing_save_count', reuseTelemetry: null };
  }

  if (!hasCompleteStructuralDna(pin, currentUtcTimestamp)) {
    return { shouldFetch: true, lane: 'deep', shouldFetchDeep: true, reason: 'missing_structural_dna', reuseTelemetry: null };
  }

  const lastScrapedMs = lastScrapedTs ? new Date(lastScrapedTs).getTime() : NaN;
  const elapsedMs = Number.isFinite(lastScrapedMs) ? (currentUtcTimestamp - lastScrapedMs) : Infinity;

  if (!isForce && Number.isFinite(lastScrapedMs) && elapsedMs >= 0 && elapsedMs < dedupWindowMs) {
    return {
      shouldFetch: false,
      lane: 'cache',
      shouldFetchDeep: false,
      reason: 'pidgets_dedup_window_10m',
      reuseTelemetry: {
        save_count: pin.save_count != null ? Number(pin.save_count) : null,
        repin_count: pin.repin_count != null ? Number(pin.repin_count) : null,
        comment_count: pin.comment_count != null ? Number(pin.comment_count) : null,
        share_count: pin.share_count != null ? Number(pin.share_count) : null,
        daily_save_velocity: null
      }
    };
  }

  return {
    shouldFetch: true,
    lane: 'pidgets',
    shouldFetchDeep: false,
    reason: isForce ? 'force_pidgets_refresh' : 'pidgets_fast_telemetry',
    reuseTelemetry: null
  };
}

/**
 * Strict 5-point Stage-1 acceptance contract for zero-cookie Pidgets 50x fast telemetry.
 * Any pin failing ANY condition falls back automatically to Stage 2 (`fetchPinHybrid`)
 * and is NEVER marked `is_deleted` from Pidgets alone.
 */
export function canSatisfyPinFromPidgets(pin, pidgetsPin, currentUtcTimestamp = Date.now()) {
  const pid = String(pin?.pin_id || '').trim();
  if (!/^\d{10,25}$/.test(pid)) return false;
  if (!pidgetsPin || typeof pidgetsPin !== 'object') return false;
  if (pidgetsPin.is_missing === true) return false;
  if (pidgetsPin.has_explicit_saves !== true || pidgetsPin.save_count === null || pidgetsPin.save_count === undefined) {
    return false;
  }
  const pidgetsSaves = Number(pidgetsPin.save_count);
  if (!Number.isFinite(pidgetsSaves) || pidgetsSaves < 0) return false;

  const prevSaves = pin?.save_count != null ? Number(pin.save_count) : null;
  if (pidgetsSaves === 0 && (prevSaves ?? 0) > 0) return false;
  if (prevSaves != null && prevSaves > 0 && pidgetsSaves < prevSaves * 0.8) return false;

  return hasCompleteStructuralDna(pin, currentUtcTimestamp);
}

function buildCachedCarryoverRecord(pin, kw, reuseTelemetry) {
  const cleanAnnotations = sanitizeVisualAnnotations(pin.visual_annotations ?? pin.metadata?.visual_annotations, { maxItems: 15 });
  const boardName = pin.board_name || pin.metadata?.board_name || '';
  return {
    pin_id: pin.pin_id,
    creator_username: pin.creator_username || pin.metadata?.pinner?.username || '',
    board_name: boardName,
    board_slug: boardName ? boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '',
    title: pin.title,
    domain: pin.domain,
    destination_url: pin.destination_url,
    image_url: pin.image_url,
    description: pin.description || '',
    alt_text: pin.alt_text || pin.metadata?.alt_text || '',
    dominant_color: (pin.dominant_color && String(pin.dominant_color).toLowerCase() !== '#888888') ? pin.dominant_color : null,
    visual_annotations: cleanAnnotations,
    method: pin.creation_method || pin.method || 'pinterest_platform',
    creation_method: pin.creation_method || pin.method || 'pinterest_platform',
    created_at_pinterest: pin.created_at_pinterest || null,
    created_at: pin.created_at_pinterest || null,
    save_count: reuseTelemetry.save_count,
    repin_count: reuseTelemetry.repin_count,
    comment_count: reuseTelemetry.comment_count,
    share_count: reuseTelemetry.share_count,
    daily_save_velocity: null,
    daily_repin_velocity: null,
    delta_saves_24h: null,
    delta_repins_24h: null,
    rank_position: pin.rank_position,
    catalog_rank: pin.catalog_rank || pin.rank_position,
    last_known_rank: pin.last_known_rank,
    is_displaced: Boolean(pin.is_displaced),
    keyword_id: pin.keyword_id || kw?.id || null,
    is_deleted: false,
    from_hydration_cache: true,
    was_live_scraped: false,
    is_hydrated: Boolean(pin.is_hydrated || pin.is_deep_hydrated || (reuseTelemetry.save_count != null)),
    extra_meta: (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : (pin.extra_meta || {})
  };
}

/**
 * Builds an enriched pin record directly from a verified Stage-1 Pidgets 50x payload
 * while preserving all immutable structural DNA already stored in `universal_master_pins`.
 */
export function buildPidgetsEnrichedPin(pin, pidgetsPin, kw = null) {
  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const authenticSaves = Math.max(0, Number(pidgetsPin.save_count));
  const rawPidgetsRepins = (pidgetsPin.repin_count != null || pidgetsPin.repins != null)
    ? Math.max(0, Number(pidgetsPin.repin_count ?? pidgetsPin.repins))
    : null;
  const authenticRepins = (
    rawPidgetsRepins !== null &&
    Number.isFinite(rawPidgetsRepins) &&
    (rawPidgetsRepins > 0 || (pidgetsPin.has_explicit_repins === true && (pin.repin_count == null || Number(pin.repin_count) === 0)))
  )
    ? rawPidgetsRepins
    : (pin.repin_count != null ? Number(pin.repin_count) : null);

  const rawPidgetsComments = (pidgetsPin.comment_count != null || pidgetsPin.comments != null)
    ? Math.max(0, Number(pidgetsPin.comment_count ?? pidgetsPin.comments))
    : null;
  const authenticComments = (rawPidgetsComments !== null && Number.isFinite(rawPidgetsComments) && rawPidgetsComments > 0)
    ? rawPidgetsComments
    : (pin.comment_count != null ? Number(pin.comment_count) : null);
  const authenticShares = pin.share_count != null ? Number(pin.share_count) : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const rawBaseDateObj = pin.baseline_day_date ? new Date(pin.baseline_day_date) : null;
  const rawBaseDateIso = rawBaseDateObj && !isNaN(rawBaseDateObj.getTime()) ? rawBaseDateObj.toISOString().slice(0, 10) : null;
  const hasExplicitBaseline = (
    pin.baseline_day_saves != null &&
    Number(pin.baseline_day_saves) > 0 &&
    (!rawBaseDateIso || rawBaseDateIso < todayIso)
  );
  const baselineSaves = hasExplicitBaseline
    ? Number(pin.baseline_day_saves)
    : (pin.save_count != null ? Number(pin.save_count) : null);

  let computedVelocity = (baselineSaves === null)
    ? null
    : ((baselineSaves <= 0) ? 0 : (pin.daily_save_velocity != null ? Number(pin.daily_save_velocity) : null));

  if (baselineSaves === null || baselineSaves <= 0 || authenticSaves < baselineSaves) {
    computedVelocity = 0;
  } else {
    const rawDelta = authenticSaves - baselineSaves;
    const baseDateRaw = (hasExplicitBaseline ? pin.baseline_day_date : null) || pin.last_scraped_at || pin.metadata?.last_scraped_at || null;
    if (rawDelta > 0 && baseDateRaw) {
      const parsedBase = new Date(baseDateRaw);
      const baseIso = !isNaN(parsedBase.getTime()) ? parsedBase.toISOString().slice(0, 10) : null;
      const calcVel = calculateDailyVelocity({
        currentSaves: authenticSaves,
        baselineSaves,
        currentRepins: authenticRepins,
        baselineRepins: Number(pin.repin_count || 0),
        currentDate: new Date(),
        baselineDate: baseDateRaw,
        createdAt: pin.created_at_pinterest || null,
        wasDeepHydrated: true,
        maxCap: 25000
      });
      computedVelocity = (!hasExplicitBaseline && baseIso === todayIso)
        ? Math.max(Number(pin.daily_save_velocity || 0), calcVel)
        : calcVel;
    } else if (rawDelta === 0 && baseDateRaw) {
      const parsedBase = new Date(baseDateRaw);
      if (!isNaN(parsedBase.getTime()) && parsedBase.toISOString().slice(0, 10) < todayIso) {
        computedVelocity = 0;
      }
    }
  }

  const cleanAnnotations = sanitizeVisualAnnotations(pin.visual_annotations ?? meta.visual_annotations, { maxItems: 15 });
  const creator = pidgetsPin.creator_username || pidgetsPin.pinner?.username || pin.creator_username || meta.pinner?.username || '';
  const board = pin.board_name || pidgetsPin.board_name || pidgetsPin.board?.name || meta.board_name || '';
  const method = pin.creation_method || pin.method || meta.creation_method || meta.method || 'pinterest_platform';
  const rawDominantColor = String(pidgetsPin.dominant_color || pin.dominant_color || '').trim();
  const dominantColor = (!rawDominantColor || rawDominantColor.toLowerCase() === '#888888') ? null : rawDominantColor;

  return {
    pin_id: pin.pin_id,
    creator_username: creator,
    board_name: board,
    board_slug: board ? board.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '',
    title: pidgetsPin.title || pin.title,
    domain: pidgetsPin.domain || pin.domain,
    destination_url: pidgetsPin.link || pin.destination_url,
    image_url: pidgetsPin.image_url || pin.image_url,
    description: pin.description || pidgetsPin.description || '',
    alt_text: pin.alt_text || meta.alt_text || '',
    dominant_color: dominantColor,
    visual_annotations: cleanAnnotations,
    method,
    creation_method: method,
    created_at_pinterest: pin.created_at_pinterest || null,
    created_at: pin.created_at_pinterest || null,
    save_count: authenticSaves,
    has_explicit_saves: true,
    repin_count: authenticRepins,
    has_explicit_repins: Boolean(pidgetsPin.has_explicit_repins),
    comment_count: authenticComments,
    share_count: authenticShares,
    daily_save_velocity: computedVelocity,
    rank_position: pin.rank_position,
    catalog_rank: pin.catalog_rank || pin.rank_position,
    last_known_rank: pin.last_known_rank,
    is_displaced: Boolean(pin.is_displaced),
    keyword_id: pin.keyword_id || kw?.id || null,
    is_deleted: false,
    from_hydration_cache: false,
    was_live_scraped: true,
    is_hydrated: true,
    enrichment_lane: 'pidgets',
    extra_meta: meta
  };
}

/**
 * Deep Closeup Inspection for a single pin entity (Stage 2 fallback, In-Memory Enrichment, Zero DB writes)
 */
async function inspectPin(pin, kw, options = {}) {
  if (circuitBroken) return null;

  // Hydration Guard Check: Zero network requests if pin is within 10-minute dedup window
  if (!options.skipGuard) {
    const guard = evaluateHydrationGuard(pin, options.nowMs ?? Date.now(), options);
    if (!guard.shouldFetch && guard.reuseTelemetry) {
      return buildCachedCarryoverRecord(pin, kw, guard.reuseTelemetry);
    }
  }

  // Active Cooldown Loop & Circuit Breaker Check
  while (Date.now() < rateLimitCooldownUntil) {
    if (circuitBroken) return null;
    const waitTime = Math.min(rateLimitCooldownUntil - Date.now(), 5000);
    await new Promise(r => setTimeout(r, Math.max(200, waitTime)));
  }
  if (circuitBroken) return null;

  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const wasDeepHydrated = Boolean(
    pin.is_deep_hydrated === true ||
    pin.is_deep_hydrated === 'true' ||
    pin.is_hydrated === true ||
    meta.is_deep_hydrated === true ||
    meta.is_deep_hydrated === 'true' ||
    (pin.creation_method && pin.creation_method !== 'unhydrated_stub')
  );

  // Use 3KB JSON PinResource fast path only if displaced OR (deep-hydrated AND already has clean visual annotations)
  // [INVARIANT: ANNOTATIONS-COMPLETENESS]
  const hasAnnotations = sanitizeVisualAnnotations(pin.visual_annotations ?? meta.visual_annotations, { maxItems: 15 }).length > 0;
  const isTelemetryOnly = Boolean(pin.is_displaced || (wasDeepHydrated && hasAnnotations));
  const hybridFn = typeof options.fetchPinHybridFn === 'function' ? options.fetchPinHybridFn : fetchPinHybrid;
  const htmlFn = typeof options.fetchPinFromPinterestFn === 'function' ? options.fetchPinFromPinterestFn : fetchPinFromPinterest;

  let detail = null;
  let isDead = false;
  let fetchError = null;
  let fetchRes = null;

  try {
    fetchRes = await hybridFn(pin.pin_id, { isTelemetryOnly });
    const isConfirmedDead = fetchRes?.status === 404 || String(fetchRes?.error || '').includes('404');
    const isRateLimited = fetchRes?.status === 429 || fetchRes?.code === 429 || String(fetchRes?.error || '').includes('429');
    if (!fetchRes?.ok && !isConfirmedDead && !isRateLimited) {
      const retryJitter = options.skipJitter ? 0 : (500 + Math.floor(Math.random() * 600));
      if (retryJitter > 0) await new Promise(r => setTimeout(r, retryJitter));
      fetchRes = await htmlFn(pin.pin_id, '');
    }
  } catch (err) {
    fetchError = err;
    const isConfirmedDead = String(err.message || '').includes('404');
    const isRateLimited = String(err.message || '').includes('429');
    if (!isConfirmedDead && !isRateLimited) {
      const retryJitter = options.skipJitter ? 0 : (500 + Math.floor(Math.random() * 600));
      if (retryJitter > 0) await new Promise(r => setTimeout(r, retryJitter));
      try {
        fetchRes = await htmlFn(pin.pin_id, '');
        fetchError = null;
      } catch (retryErr) {
        fetchError = retryErr;
      }
    }
  }

  const isTimeoutError = (e, res) => {
    const msg = `${e?.message || ''} ${res?.error || ''} ${e?.name || ''}`.toLowerCase();
    return msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('aborterror');
  };

  let pinResourceChecked = false;

  if (fetchRes?.ok && fetchRes.pin) {
    detail = fetchRes.pin;
    pinResourceChecked = Boolean(
      fetchRes.fastPath === true ||
      fetchRes.pinResourceChecked === true ||
      detail.pin_resource_checked === true ||
      detail.source === 'pin_resource_fast_path'
    );
    const hasLinkedInDetail = Boolean(
      detail.has_linked_annotations ||
      (Array.isArray(detail.annotations_with_links) && detail.annotations_with_links.length > 0) ||
      (Array.isArray(detail.annotations) && detail.annotations.some(a => a && typeof a === 'object' && (a.url || a.idea_id)))
    );
    // Parity with Live Deep Sync: if SSR HTML omitted annotations_with_links and PinResource/get has not been checked yet,
    // query PinResource/get (~90ms) so linked /ideas/ annotations are verified before stamping 14-day deep_dna_checked_at.
    const resourceFn = typeof options.fetchPinFromPinResourceFn === 'function'
      ? options.fetchPinFromPinResourceFn
      : (typeof options.fetchPinHybridFn === 'function' ? null : fetchPinFromPinResource);
    if (!hasLinkedInDetail && !pinResourceChecked && resourceFn && /^\d{10,25}$/.test(String(pin.pin_id || ''))) {
      try {
        const rawResource = await resourceFn(pin.pin_id);
        const resourcePin = rawResource && typeof rawResource === 'object'
          ? (rawResource.ok === true && rawResource.pin ? rawResource.pin : (rawResource.ok === false ? null : rawResource))
          : null;
        if (resourcePin && typeof resourcePin === 'object') {
          pinResourceChecked = true;
          if (
            Array.isArray(resourcePin.annotations) &&
            resourcePin.annotations.length > 0 &&
            (resourcePin.has_linked_annotations || !Array.isArray(detail.annotations) || detail.annotations.length === 0)
          ) {
            detail = {
              ...detail,
              annotations: resourcePin.annotations,
              tags: resourcePin.tags || detail.tags,
              annotations_with_links: resourcePin.annotations_with_links || detail.annotations_with_links || [],
              has_linked_annotations: Boolean(resourcePin.has_linked_annotations || (Array.isArray(resourcePin.annotations_with_links) && resourcePin.annotations_with_links.length > 0))
            };
          } else if (Array.isArray(resourcePin.annotations_with_links) && resourcePin.annotations_with_links.length > 0) {
            detail = {
              ...detail,
              annotations_with_links: resourcePin.annotations_with_links,
              has_linked_annotations: true
            };
          }
        }
      } catch (_) {
        // Fail-safe: leave pinResourceChecked = false so deep_dna_checked_at is NOT stamped for 14 days
      }
    }
    consecutiveErrors = 0;
  } else if (fetchRes?.status === 404 || String(fetchRes?.error || '').includes('404') || String(fetchError?.message || '').includes('404')) {
    isDead = true;
    fetchError = '404_not_found';
    consecutiveErrors = 0;
  } else if (fetchRes?.status === 429 || fetchRes?.code === 429 || String(fetchRes?.error || '').includes('429') || String(fetchError?.message || '').includes('429')) {
    const now = Date.now();
    const wasAlreadyInCooldown = now < rateLimitCooldownUntil;
    rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, now + 60000);
    if (!wasAlreadyInCooldown) {
      consecutiveErrors++;
      console.warn(`    [429 RATE LIMIT] Pin ${pin.pin_id} received 429. Cooldown initiated for 60s (consecutive error incidents: ${consecutiveErrors}/${CIRCUIT_BREAKER_LIMIT}).`);
    } else {
      console.log(`    [429 RATE LIMIT] Pin ${pin.pin_id} received 429 in-flight during active cooldown; incident coalesced.`);
    }
  } else if (isTimeoutError(fetchError, fetchRes)) {
    consecutiveErrors++;
    console.warn(`    [TIMEOUT/NETWORK] Pin ${pin.pin_id} timed out. (consecutive error incidents: ${consecutiveErrors}/${CIRCUIT_BREAKER_LIMIT}).`);
  } else {
    console.warn(`    [!] Pin ${pin.pin_id} fetch warning (non-fatal, isolated):`, fetchRes?.error || fetchError?.message || 'Empty response');
  }

  // Adaptive Jitter: 300-600ms for lightweight 3KB PinResource JSON; 900-1400ms for full SSR HTML
  if (!options.skipJitter) {
    const usedFastPath = Boolean(fetchRes?.fastPath);
    const minJitter = usedFastPath ? SLEEP_MS_MIN : Math.max(900, SLEEP_MS_MIN);
    const maxJitter = usedFastPath ? SLEEP_MS_MAX : Math.max(1400, SLEEP_MS_MAX);
    const jitter = minJitter + Math.floor(Math.random() * Math.max(1, maxJitter - minJitter));
    await new Promise(r => setTimeout(r, jitter));
  }

  if (consecutiveErrors >= CIRCUIT_BREAKER_LIMIT) {
    circuitBroken = true;
    console.error(`    [CIRCUIT BREAKER] Hit ${CIRCUIT_BREAKER_LIMIT} consecutive errors. Halting inspection.`);
    return null;
  }

  if (!detail && !isDead) {
    return null;
  }

  const detailSaves = (detail?.saves != null || detail?.save_count != null)
    ? Number(detail?.saves ?? detail?.save_count)
    : null;
  const prevKnownSaves = pin.save_count != null ? Number(pin.save_count) : null;
  const hasExplicitDetailSaves = Boolean(detail?.has_explicit_saves) || (detailSaves !== null && detailSaves > 0);
  // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]
  // Trust explicit live saves from Pinterest so previously inflated/repin-conflated save_count self-heals,
  // preserving prevKnownSaves only if an endpoint omitted the saves field completely (!hasExplicitDetailSaves).
  const authenticSaves = hasExplicitDetailSaves
    ? detailSaves
    : prevKnownSaves;
  const hasExplicitDetailRepins = detail?.has_explicit_repins === true;
  const detailRepins = (detail?.repins != null || detail?.repin_count != null)
    ? Math.max(Number(detail?.repins ?? detail?.repin_count ?? 0), Number(detail?.repin_count ?? detail?.repins ?? 0))
    : null;
  const authenticRepins = (
    detailRepins !== null &&
    Number.isFinite(detailRepins) &&
    (detailRepins > 0 || (hasExplicitDetailRepins && (pin.repin_count == null || Number(pin.repin_count) === 0)))
  )
    ? detailRepins
    : (pin.repin_count != null ? Number(pin.repin_count) : null);
  const authenticComments = (detail?.comments != null || detail?.comment_count != null)
    ? Number(detail?.comments ?? detail?.comment_count)
    : (pin.comment_count != null ? Number(pin.comment_count) : null);
  const authenticShares = (detail?.shares != null || detail?.share_count != null)
    ? Number(detail?.shares ?? detail?.share_count)
    : (pin.share_count != null ? Number(pin.share_count) : null);

  // Live Velocity Delta Generation (Immunized against Phase 1A -> Phase 1B same-day zeroing):
  const todayIso = new Date().toISOString().slice(0, 10);
  const rawBaseDateObj = pin.baseline_day_date ? new Date(pin.baseline_day_date) : null;
  const rawBaseDateIso = rawBaseDateObj && !isNaN(rawBaseDateObj.getTime()) ? rawBaseDateObj.toISOString().slice(0, 10) : null;
  const hasExplicitBaseline = (
    pin.baseline_day_saves != null &&
    Number(pin.baseline_day_saves) > 0 &&
    (!rawBaseDateIso || rawBaseDateIso < todayIso)
  );
  const baselineSaves = hasExplicitBaseline
    ? Number(pin.baseline_day_saves)
    : (pin.save_count != null ? Number(pin.save_count) : null);
  let computedVelocity = (baselineSaves === null)
    ? null
    : ((baselineSaves <= 0) ? 0 : (pin.daily_save_velocity != null ? Number(pin.daily_save_velocity) : null));

  if (authenticSaves === null) {
    computedVelocity = null;
  } else if (baselineSaves === null || baselineSaves <= 0) {
    // [INVARIANT: ANTI-HYDRATION-SPIKE] Transition from unhydrated/zero saves to positive is a baseline calibration.
    // If baselineSaves <= 0, do NOT retain dirty pin.daily_save_velocity; set it to 0.
    computedVelocity = 0;
  } else if (detail && authenticSaves < baselineSaves) {
    // Self-healed save_count dropped below a previously poisoned baseline: reset velocity to 0
    computedVelocity = 0;
  } else if (detail && !hasExplicitBaseline && baselineSaves === 0) {
    // First-time hydration from 0-save SERP skeleton: establish Day-1 baseline with 0 velocity (never treat total saves as 24h gain)
    computedVelocity = 0;
  } else if (detail && authenticSaves >= baselineSaves) {
    const rawDelta = authenticSaves - baselineSaves;
    const baseDateRaw = (hasExplicitBaseline ? pin.baseline_day_date : null) || pin.last_scraped_at || pin.metadata?.last_scraped_at || pin.baseline_day_date || null;
    if (rawDelta > 0 && baseDateRaw) {
      const parsedBase = new Date(baseDateRaw);
      const baseIso = !isNaN(parsedBase.getTime()) ? parsedBase.toISOString().slice(0, 10) : null;
      if (!hasExplicitBaseline && baseIso === todayIso) {
        // Intraday crawl where pin was already updated today: take max to preserve today's peak velocity, never compound monotonically
        computedVelocity = Math.max(Number(pin.daily_save_velocity || 0), calculateDailyVelocity({
          currentSaves: authenticSaves,
          baselineSaves,
          currentRepins: authenticRepins,
          baselineRepins: Number(pin.repin_count || 0),
          currentDate: new Date(),
          baselineDate: baseDateRaw,
          createdAt: pin.created_at_pinterest || detail?.created_at || detail?.createdAt || null,
          wasDeepHydrated,
          maxCap: 25000
        }));
      } else {
        computedVelocity = calculateDailyVelocity({
          currentSaves: authenticSaves,
          baselineSaves,
          currentRepins: authenticRepins,
          baselineRepins: Number(pin.repin_count || 0),
          currentDate: new Date(),
          baselineDate: baseDateRaw,
          createdAt: pin.created_at_pinterest || detail?.created_at || detail?.createdAt || null,
          wasDeepHydrated,
          maxCap: 25000
        });
      }
    } else if (rawDelta === 0 && baseDateRaw) {
      const parsedBase = new Date(baseDateRaw);
      const parsedUpdated = pin.last_scraped_at ? new Date(pin.last_scraped_at) : null;
      const updatedToday = parsedUpdated && !isNaN(parsedUpdated.getTime()) && parsedUpdated.toISOString().slice(0, 10) === todayIso;
      if (!updatedToday && !isNaN(parsedBase.getTime())) {
        const baseIso = parsedBase.toISOString().slice(0, 10);
        if (baseIso < todayIso) {
          computedVelocity = 0;
        }
      }
    }
  }

  const description = detail?.description || pin.description || '';
  const altText = detail?.alt_text || detail?.altText || detail?.seo_alt_text || pin.alt_text || '';
  const rawDominantColor = String(detail?.dominant_color || detail?.dominantColor || pin.dominant_color || '').trim();
  const dominantColor = (!rawDominantColor || rawDominantColor.toLowerCase() === '#888888') ? null : rawDominantColor;
  const creator = detail?.pinner?.username || detail?.creator_username || pin.creator_username || '';
  const board = detail?.board?.name || pin.board_name || '';
  const method = detail?.method || detail?.creation_method || pin.creation_method || pin.method || pin.metadata?.method || 'pinterest_platform';
  const createdAtPinterest = detail?.created_at_pinterest || detail?.created_at || pin.created_at_pinterest || pin.created_at || null;

  const cleanNewAnnotations = sanitizeVisualAnnotations(
    detail?.annotations || detail?.visual_annotations || detail?.tags || detail?.pinJoin?.visualAnnotation,
    { maxItems: 15 }
  );
  const cleanExistingAnnotations = sanitizeVisualAnnotations(pin.visual_annotations, { maxItems: 15 });
  const finalAnnotations = (detail?.has_linked_annotations && cleanNewAnnotations.length > 0)
    ? cleanNewAnnotations
    : sanitizeVisualAnnotations([...cleanNewAnnotations, ...cleanExistingAnnotations], { maxItems: 15 });

  const rawLinkedAnnotations = Array.isArray(detail?.annotations_with_links) && detail.annotations_with_links.length > 0
    ? detail.annotations_with_links
    : (Array.isArray(detail?.annotations) ? detail.annotations.filter(a => a && typeof a === 'object' && (a.url || a.idea_id)) : []);
  const cleanLinkedAnnotations = rawLinkedAnnotations
    .map(a => ({
      name: typeof a?.name === 'string' ? a.name.trim() : '',
      idea_id: a?.idea_id ? String(a.idea_id).trim() : null,
      url: typeof a?.url === 'string' && a.url.trim() ? a.url.trim() : null
    }))
    .filter(a => a.name.length >= 2 && !/^\[object\s+object\]$/i.test(a.name))
    .slice(0, 15);

  const isVerifiedLiveDeepFetch = Boolean(
    fetchRes?.ok === true &&
    detail &&
    !isDead &&
    !fetchError &&
    fetchRes?.isPartialFallback !== true &&
    detail?.is_partial_fallback !== true &&
    (hasExplicitDetailSaves || Boolean(createdAtPinterest) || Boolean(detail?.image_signature) || cleanNewAnnotations.length > 0)
  );
  const hasVerifiedDeepDnaCheck = cleanLinkedAnnotations.length > 0 || pinResourceChecked;
  const deepDnaCheckedAt = (isVerifiedLiveDeepFetch && hasVerifiedDeepDnaCheck)
    ? new Date().toISOString()
    : (meta.deep_dna_checked_at || null);

  const rawBoardCount = detail?.board_pin_count != null ? Number(detail.board_pin_count) : (meta.board_pin_count != null ? Number(meta.board_pin_count) : null);
  const validBoardCount = (rawBoardCount != null && !isNaN(rawBoardCount) && rawBoardCount > 0) ? rawBoardCount : null;

  const extraMeta = {
    creation_method: method,
    method: method,
    description: description ? String(description).trim() : null,
    seo_title: (detail?.seo_title || meta.seo_title || '').trim() || null,
    seo_description: (detail?.seo_description || meta.seo_description || '').trim() || null,
    canonical_pin_id: detail?.canonical_pin_id || meta.canonical_pin_id || null,
    canonical_pin_url: detail?.canonical_pin_url || meta.canonical_pin_url || null,
    seo_canonical_url: (detail?.seo_canonical_url || meta.seo_canonical_url || '').trim() || null,
    aggregated_pin_data_id: detail?.aggregated_pin_data_id || meta.aggregated_pin_data_id || null,
    domain_official_user: detail?.domain_official_user?.username ? detail.domain_official_user : (meta.domain_official_user || null),
    board_id: detail?.board_id || meta.board_id || null,
    board_url: detail?.board_url || meta.board_url || null,
    board_pin_count: validBoardCount,
    board_order_modified_at: detail?.board_order_modified_at || meta.board_order_modified_at || null,
    board_cover_url: detail?.board_cover_url || meta.board_cover_url || null,
    board_thumbnail_url: detail?.board_thumbnail_url || meta.board_thumbnail_url || null,
    image_signature: (detail?.image_signature || meta.image_signature || '').trim() || null,
    image_dimensions: detail?.image_dimensions || meta.image_dimensions || null,
    rich_metadata: detail?.rich_metadata || meta.rich_metadata || null,
    article_published_at: detail?.article_published_at || detail?.rich_metadata?.article_published_at || meta.article_published_at || null,
    seo_related_interests: Array.isArray(detail?.seo_related_interests) && detail.seo_related_interests.length > 0 ? detail.seo_related_interests : (meta.seo_related_interests || []),
    category_breadcrumbs: Array.isArray(detail?.category_breadcrumbs) && detail.category_breadcrumbs.length > 0 ? detail.category_breadcrumbs : (meta.category_breadcrumbs || []),
    visual_objects: Array.isArray(detail?.visual_objects) && detail.visual_objects.length > 0 ? detail.visual_objects : (meta.visual_objects || []),
    annotations_with_links: cleanLinkedAnnotations.length > 0 ? cleanLinkedAnnotations : (meta.annotations_with_links || []),
    deep_dna_checked_at: deepDnaCheckedAt,
    golden_set_interest: detail?.golden_set_interest || meta.golden_set_interest || null,
    is_repin: Boolean(detail?.is_repin ?? meta.is_repin ?? false),
    origin_pinner: detail?.origin_pinner || meta.origin_pinner || null,
    pinner: detail?.creator_username ? {
      username: detail.creator_username,
      full_name: detail.creator_name || meta.pinner?.full_name || '',
      follower_count: Number(detail.creator_followers || meta.pinner?.follower_count || 0),
      image_small_url: detail.creator_avatar_url || meta.pinner?.image_small_url || null,
      is_verified_merchant: Boolean(detail.creator_is_verified_merchant || meta.pinner?.is_verified_merchant)
    } : (meta.pinner || null)
  };

  return {
    pin_id: pin.pin_id,
    creator_username: creator,
    board_name: board,
    board_slug: board ? board.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '',
    title: detail?.title || pin.title,
    domain: detail?.domain || pin.domain,
    destination_url: detail?.link || pin.destination_url,
    image_url: detail?.image_url || pin.image_url,
    description,
    alt_text: altText,
    dominant_color: dominantColor,
    visual_annotations: finalAnnotations,
    method,
    creation_method: method,
    created_at_pinterest: createdAtPinterest,
    created_at: createdAtPinterest,
    save_count: authenticSaves,
    has_explicit_saves: hasExplicitDetailSaves,
    repin_count: authenticRepins,
    comment_count: authenticComments,
    share_count: authenticShares,
    daily_save_velocity: computedVelocity,
    rank_position: pin.rank_position,
    keyword_id: pin.keyword_id || kw?.id || null,
    is_deleted: isDead,
    from_hydration_cache: false,
    was_live_scraped: true,
    is_hydrated: Boolean(detail && (hasExplicitDetailSaves || (detailRepins !== null && detailRepins > 0)) && authenticSaves !== null),
    enrichment_lane: 'deep',
    extra_meta: extraMeta
  };
}

/**
 * Fetches active standalone Newborn daily crawler anchors (`newborn_daily_anchors`)
 * shard-partitioned across the 20-runner 01:00 UTC velocity fleet so promoted Golden Pins
 * receive daily `pins_daily_metrics` velocity updates even without a SERP keyword or tracked creator.
 */
export async function fetchStandaloneNewbornAnchorsForWorker(targetSql, { workerIndex = 0, workerTotal = 20 } = {}) {
  if (!targetSql || typeof targetSql !== 'function') return [];
  const wTotal = Math.max(1, Number(workerTotal) || 20);
  const wIdx = Math.max(0, Math.min(wTotal - 1, Number(workerIndex) || 0));

  try {
    if (wTotal === 20) {
      return await targetSql`
        SELECT
          nda.pin_id,
          NULL::int AS keyword_id,
          NULL::int AS rank_position,
          NULL::int AS last_known_rank,
          ump.creator_username,
          ump.board_name,
          ump.description,
          ump.alt_text,
          ump.dominant_color,
          ump.comment_count,
          ump.share_count,
          ump.save_count,
          ump.repin_count,
          ump.daily_save_velocity,
          ump.daily_repin_velocity,
          ump.created_at_pinterest,
          ump.creation_method,
          ump.is_hydrated,
          ump.is_hydrated AS is_deep_hydrated,
          ump.last_scraped_at,
          ump.visual_annotations,
          ump.image_signature,
          ump.metadata,
          ump.title,
          COALESCE(ump.clean_domain, ump.domain, '') AS domain,
          ump.destination_url,
          ump.image_url,
          COALESCE(nda.last_crawled_at, nda.promoted_at) AS crawled_at,
          nda.updated_at,
          FALSE AS is_displaced,
          TRUE AS is_newborn_anchor,
          CASE
            WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
             AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
            THEN ump.save_count
            ELSE NULL
          END AS baseline_day_saves,
          CASE
            WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
             AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
            THEN (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date
            ELSE NULL
          END AS baseline_day_date,
          '[]'::jsonb AS folder_positions
        FROM newborn_daily_anchors nda
        JOIN universal_master_pins ump ON ump.pin_id = nda.pin_id
        WHERE nda.is_active = TRUE
          AND (ABS(hashtext(nda.pin_id::text)::bigint) % 20) = ${wIdx}
        ORDER BY nda.pin_id ASC;
      `;
    }
    if (wTotal > 1) {
      return await targetSql`
        SELECT
          nda.pin_id,
          NULL::int AS keyword_id,
          NULL::int AS rank_position,
          NULL::int AS last_known_rank,
          ump.creator_username,
          ump.board_name,
          ump.description,
          ump.alt_text,
          ump.dominant_color,
          ump.comment_count,
          ump.share_count,
          ump.save_count,
          ump.repin_count,
          ump.daily_save_velocity,
          ump.daily_repin_velocity,
          ump.created_at_pinterest,
          ump.creation_method,
          ump.is_hydrated,
          ump.is_hydrated AS is_deep_hydrated,
          ump.last_scraped_at,
          ump.visual_annotations,
          ump.image_signature,
          ump.metadata,
          ump.title,
          COALESCE(ump.clean_domain, ump.domain, '') AS domain,
          ump.destination_url,
          ump.image_url,
          COALESCE(nda.last_crawled_at, nda.promoted_at) AS crawled_at,
          nda.updated_at,
          FALSE AS is_displaced,
          TRUE AS is_newborn_anchor,
          CASE
            WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
             AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
            THEN ump.save_count
            ELSE NULL
          END AS baseline_day_saves,
          CASE
            WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
             AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
            THEN (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date
            ELSE NULL
          END AS baseline_day_date,
          '[]'::jsonb AS folder_positions
        FROM newborn_daily_anchors nda
        JOIN universal_master_pins ump ON ump.pin_id = nda.pin_id
        WHERE nda.is_active = TRUE
          AND (ABS(hashtext(nda.pin_id::text)::bigint) % ${wTotal}) = ${wIdx}
        ORDER BY nda.pin_id ASC;
      `;
    }
    return await targetSql`
      SELECT
        nda.pin_id,
        NULL::int AS keyword_id,
        NULL::int AS rank_position,
        NULL::int AS last_known_rank,
        ump.creator_username,
        ump.board_name,
        ump.description,
        ump.alt_text,
        ump.dominant_color,
        ump.comment_count,
        ump.share_count,
        ump.save_count,
        ump.repin_count,
        ump.daily_save_velocity,
        ump.daily_repin_velocity,
        ump.created_at_pinterest,
        ump.creation_method,
        ump.is_hydrated,
        ump.is_hydrated AS is_deep_hydrated,
        ump.last_scraped_at,
        ump.visual_annotations,
        ump.image_signature,
        ump.metadata,
        ump.title,
        COALESCE(ump.clean_domain, ump.domain, '') AS domain,
        ump.destination_url,
        ump.image_url,
        COALESCE(nda.last_crawled_at, nda.promoted_at) AS crawled_at,
        nda.updated_at,
        FALSE AS is_displaced,
        TRUE AS is_newborn_anchor,
        CASE
          WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
           AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
          THEN ump.save_count
          ELSE NULL
        END AS baseline_day_saves,
        CASE
          WHEN COALESCE(nda.last_crawled_at, nda.promoted_at) IS NOT NULL
           AND (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
          THEN (COALESCE(nda.last_crawled_at, nda.promoted_at) AT TIME ZONE 'UTC')::date
          ELSE NULL
        END AS baseline_day_date,
        '[]'::jsonb AS folder_positions
      FROM newborn_daily_anchors nda
      JOIN universal_master_pins ump ON ump.pin_id = nda.pin_id
      WHERE nda.is_active = TRUE
      ORDER BY nda.pin_id ASC;
    `;
  } catch (err) {
    if (String(err?.code || '') === '42P01') {
      return [];
    }
    console.error('[keyword-velocity-crawler] fetchStandaloneNewbornAnchorsForWorker SQL error:', err?.message || err);
    if (classifyFatalSerpSqlError(err)) {
      throw err;
    }
    throw err;
  }
}

/**
 * Stamps `last_crawled_at` on active `newborn_daily_anchors` after daily velocity refresh.
 */
export async function markNewbornAnchorsCrawled(targetSql, pinIds = []) {
  if (!targetSql || typeof targetSql !== 'function') return 0;
  const cleanIds = Array.from(new Set((pinIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  if (cleanIds.length === 0) return 0;
  try {
    const updated = await targetSql`
      UPDATE newborn_daily_anchors
      SET last_crawled_at = NOW(),
          updated_at = NOW()
      WHERE pin_id = ANY(${cleanIds}::text[])
        AND is_active = TRUE
      RETURNING pin_id;
    `;
    return Array.isArray(updated) ? updated.length : 0;
  } catch (err) {
    if (String(err?.code || '') === '42P01') {
      return 0;
    }
    console.error('[keyword-velocity-crawler] markNewbornAnchorsCrawled SQL error:', err?.message || err);
    if (classifyFatalSerpSqlError(err)) {
      throw err;
    }
    throw err;
  }
}

/**
 * Atomic Multi-Recordset Batch Flush to Central Metadata Hub
 * Supports single-keyword, folder cluster, global fleet cross-keyword fan-out, and standalone Newborn anchors.
 */
async function flushBatchToHub(pinsChunk, kw, targetSql = null) {
  if (!pinsChunk || pinsChunk.length === 0) return;
  const isFolder = Boolean(kw?.folder_id);
  const isGlobalFleet = Boolean(kw?.is_global_fleet && Array.isArray(kw?.all_keyword_ids) && kw.all_keyword_ids.length > 0);

  const payloadJson = JSON.stringify(pinsChunk.map(p => ({
    pin_id: String(p.pin_id),
    from_hydration_cache: Boolean(p.from_hydration_cache),
    scrape_failed: Boolean(p.scrape_failed),
    was_live_scraped: p.was_live_scraped !== undefined
      ? Boolean(p.was_live_scraped)
      : (!p.from_hydration_cache && !p.scrape_failed)
  })));

  const rawKwIds = (isGlobalFleet || isFolder) ? (kw?.all_keyword_ids || [kw?.id]) : [kw?.id];
  const validKwIds = Array.from(new Set(
    (rawKwIds || []).map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0)
  ));
  const dbSql = targetSql || sql?.noRetry || sql;

  if (validKwIds.length > 0) {
    // Update keyword_serp_positions only for live-scraped rows or displaced rows whose vacuum_opportunity_score actually changes
    // (prevents no-op updated_at churn on cached is_displaced = TRUE rows).
    await dbSql`
      UPDATE keyword_serp_positions ksp
      SET
        vacuum_opportunity_score = CASE 
          WHEN ksp.is_displaced = TRUE AND COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 5 THEN 85
          WHEN ksp.is_displaced = TRUE AND COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 15 THEN 75
          WHEN ksp.is_displaced = TRUE AND COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 50 THEN 60
          WHEN ksp.is_displaced = TRUE THEN 45
          ELSE ksp.vacuum_opportunity_score
        END,
        crawled_at = CASE WHEN u.was_live_scraped = TRUE THEN NOW() ELSE ksp.crawled_at END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        from_hydration_cache boolean,
        scrape_failed boolean,
        was_live_scraped boolean
      )
      WHERE ksp.pin_id = u.pin_id
        AND ksp.keyword_id = ANY(${validKwIds}::int[])
        AND (
          u.was_live_scraped = TRUE
          OR (
            ksp.is_displaced = TRUE
            AND ksp.vacuum_opportunity_score IS DISTINCT FROM (
              CASE 
                WHEN COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 5 THEN 85
                WHEN COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 15 THEN 75
                WHEN COALESCE(ksp.last_known_rank, ksp.rank_position, 100) <= 50 THEN 60
                ELSE 45
              END
            )
          )
        );
    `;
  }

  const liveScrapedIds = pinsChunk
    .filter((p) => p && (p.was_live_scraped !== undefined ? Boolean(p.was_live_scraped) : (!p.from_hydration_cache && !p.scrape_failed)))
    .map((p) => String(p.pin_id));
  if (liveScrapedIds.length > 0) {
    await markNewbornAnchorsCrawled(dbSql, liveScrapedIds);
  }
}

/**
 * Push crawled results via HTTP POST /api/internal/ingest (Stateless Scraper Protocol)
 */
export async function pushBatchToIngestApi(payload, options = {}) {
  const ingestUrl = options.ingestUrl || process.env.INGEST_API_URL || process.env.PAE_INGEST_ENDPOINT;
  if (!ingestUrl) return null;

  const apiKey = options.apiKey || process.env.API_SECRET_KEY || process.env.INTERNAL_API_KEY || '';
  const cleanEndpoint = ingestUrl.endsWith('/api/internal/ingest')
    ? ingestUrl
    : `${ingestUrl.replace(/\/$/, '')}/api/internal/ingest`;

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey, 'Authorization': `Bearer ${apiKey}` } : {})
  };

  const res = await fetch(cleanEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Ingest API error HTTP ${res.status}: ${errorText}`);
  }

  return await res.json();
}

/**
 * Flush enriched pin records to Unified PostgreSQL SSOT.
 * Includes LATERAL historical baseline lookup on pins_daily_metrics to guarantee authentic Vault velocity.
 */
async function flushToUnifiedPostgres(enrichedPins, kw = null) {
  if (!enrichedPins || enrichedPins.length === 0) return 0;

  // [INVARIANT: STATELESS-SCRAPER-INGEST-HTTP]
  // In stateless runner mode, push crawled pins to internal ingestion route instead of opening direct DB connections.
  const ingestUrl = process.env.INGEST_API_URL || process.env.PAE_INGEST_ENDPOINT;
  if (ingestUrl && !sql) {
    try {
      console.log(`[Stateless Ingest] Pushing ${enrichedPins.length} pins to ${ingestUrl}...`);
      await pushBatchToIngestApi({
        batch_type: 'keyword_pins',
        keyword_id: kw ? kw.id : null,
        keyword: kw ? kw.keyword : null,
        worker_index: typeof workerIndex !== 'undefined' ? workerIndex : 0,
        worker_total: typeof workerTotal !== 'undefined' ? workerTotal : 20,
        pins: enrichedPins
      });
      console.log(`[Stateless Ingest] Successfully flushed ${enrichedPins.length} pins via Ingest API.`);
      return 1;
    } catch (ingestErr) {
      console.warn(`[!] Stateless Ingest API push failed, falling back to direct SQL: ${ingestErr.message}`);
    }
  }

  const FLUSH_TIMEOUT_MS = 65000;
  let timedOut = false;
  let timerId;

  const syncTask = withDbRetry(async () => {
    if (timedOut) {
      throw new Error(`Unified Postgres flush aborted after timeout (${FLUSH_TIMEOUT_MS}ms limit)`);
    }

    const activeSql = sql?.noRetry || sql;
    const sortedPins = [...enrichedPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));

    // 1. Fetch 16-day historical snapshots for rolling gains computation (satisfies up to 15-day window)
    const pinIds = sortedPins.map(sp => String(sp.pin_id));
    let snapshots = [];
    let snapQueryFailed = false;
    try {
      for (let i = 0; i < pinIds.length; i += 500) {
        const idChunk = pinIds.slice(i, i + 500);
        const chunkSnaps = await activeSql`
          SELECT pin_id, recorded_date AS snapshot_date, save_count, repin_count, daily_save_velocity, daily_repin_velocity
          FROM pins_daily_metrics
          WHERE pin_id = ANY(${idChunk}::text[])
            AND recorded_date >= CURRENT_DATE - INTERVAL '16 days'
          ORDER BY recorded_date DESC;
        `;
        if (Array.isArray(chunkSnaps) && chunkSnaps.length > 0) {
          snapshots.push(...chunkSnaps);
        }
      }
    } catch (snapErr) {
      if (isTransientPgConnectionError(snapErr) || isStatementTimeoutError(snapErr)) {
        throw snapErr;
      }
      snapQueryFailed = true;
      console.warn(`    [Unified DB] Snapshots query warning: ${snapErr.message}`);
    }

    const pinSnapshotsMap = new Map();
    for (const snap of snapshots) {
      if (!snap || !snap.pin_id) continue;
      if (!pinSnapshotsMap.has(snap.pin_id)) {
        pinSnapshotsMap.set(snap.pin_id, []);
      }
      pinSnapshotsMap.get(snap.pin_id).push(snap);
    }

    // 2. Compute authentic rolling deltas in-memory from distinct-date snapshots in pins_daily_metrics
    const todayUtcIso = new Date().toISOString().slice(0, 10);
    for (const sp of sortedPins) {
      sp.visual_annotations = sanitizeVisualAnnotations(sp.visual_annotations, { maxItems: 15 });

      // Never overwrite velocity/delta columns for cached carryover rows — let repository.mjs preserve existing DB values
      if (sp.was_live_scraped === false || sp.from_hydration_cache === true) {
        sp.daily_save_velocity = null;
        sp.daily_repin_velocity = null;
        sp.delta_saves_24h = null;
        sp.delta_repins_24h = null;
        sp.gains_5d = null;
        sp.gains_7d = null;
        sp.gains_10d = null;
        sp.gains_15d = null;
        continue;
      }

      const allSnaps = pinSnapshotsMap.get(String(sp.pin_id)) || [];
      const priorDaySnaps = [];
      let todayPrevSnap = null;
      for (const snap of allSnaps) {
        const snapIso = snap?.snapshot_date
          ? (snap.snapshot_date instanceof Date ? snap.snapshot_date.toISOString().slice(0, 10) : String(snap.snapshot_date).slice(0, 10))
          : null;
        if (snapIso === todayUtcIso) {
          if (!todayPrevSnap) todayPrevSnap = snap;
        } else if (snapIso && snapIso < todayUtcIso) {
          priorDaySnaps.push(snap);
        }
      }

      if (sp.save_count != null) {
        const currentSnap = {
          snapshot_date: todayUtcIso,
          save_count: Number(sp.save_count),
          repin_count: sp.repin_count != null ? Number(sp.repin_count) : 0
        };
        const gains = calculateRollingGainsFromSnapshots([currentSnap, ...priorDaySnaps]);
        if (priorDaySnaps.length > 0 && gains.daily_save_velocity != null) {
          sp.daily_save_velocity = Number(gains.daily_save_velocity);
          sp.delta_saves_24h = gains.delta_saves_24h ?? Number(gains.daily_save_velocity);
          sp.delta_repins_24h = gains.delta_repins_24h;
          sp.daily_repin_velocity = gains.daily_repin_velocity ?? gains.delta_repins_24h ?? null;
        } else if (todayPrevSnap) {
          const prevTodaySaves = Number(todayPrevSnap.save_count || 0);
          if (prevTodaySaves > 0) {
            const intradayDelta = Math.max(0, Number(sp.save_count || 0) - prevTodaySaves);
            const prevTodayVel = Number(todayPrevSnap.daily_save_velocity || 0) < prevTodaySaves
              ? Number(todayPrevSnap.daily_save_velocity || 0)
              : 0;
            sp.daily_save_velocity = Math.min(25000, Math.max(Number(sp.daily_save_velocity || 0), prevTodayVel, intradayDelta));
          } else {
            sp.daily_save_velocity = 0;
          }
          const prevTodayRepins = Number(todayPrevSnap.repin_count || 0);
          if (prevTodayRepins > 0 && sp.repin_count != null) {
            const intradayRepinDelta = Math.max(0, Number(sp.repin_count || 0) - prevTodayRepins);
            const prevTodayRepinVel = Number(todayPrevSnap.daily_repin_velocity || 0) < prevTodayRepins
              ? Number(todayPrevSnap.daily_repin_velocity || 0)
              : 0;
            const resolvedRepinVel = Math.min(25000, Math.max(prevTodayRepinVel, intradayRepinDelta));
            sp.delta_repins_24h = resolvedRepinVel;
            sp.daily_repin_velocity = resolvedRepinVel;
          } else {
            sp.delta_repins_24h = gains.delta_repins_24h;
            sp.daily_repin_velocity = gains.daily_repin_velocity ?? null;
          }
        } else if (priorDaySnaps.length === 0 && !snapQueryFailed) {
          sp.daily_save_velocity = gains.daily_save_velocity ?? null;
          sp.delta_repins_24h = gains.delta_repins_24h;
          sp.daily_repin_velocity = gains.daily_repin_velocity ?? null;
        }
        sp.gains_5d = gains.gains_5d;
        sp.gains_7d = gains.gains_7d;
        sp.gains_10d = gains.gains_10d;
        sp.gains_15d = gains.gains_15d;
      } else {
        sp.save_count = null;
        sp.repin_count = sp.repin_count != null ? Number(sp.repin_count) : null;
        sp.daily_save_velocity = null;
        sp.daily_repin_velocity = null;
        sp.delta_saves_24h = null;
        sp.delta_repins_24h = null;
        sp.gains_5d = null;
        sp.gains_7d = null;
        sp.gains_10d = null;
        sp.gains_15d = null;
        sp.is_hydrated = false;
      }
    }

    if (timedOut) {
      throw new Error(`Unified Postgres flush aborted after timeout (${FLUSH_TIMEOUT_MS}ms limit)`);
    }

    const sanitizePinMeta = (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (k === 'board_pin_count' && (Number(v) === 0 || isNaN(Number(v)))) continue;
        clean[k] = v;
      }
      return clean;
    };

    for (const sp of sortedPins) {
      const rawMeta = (sp.extra_meta && typeof sp.extra_meta === 'object') ? sp.extra_meta : (sp.metadata || {});
      sp.metadata = sanitizePinMeta({
        ...buildRichPinMetadataPayload(sp, rawMeta),
        ...rawMeta
      });
    }

    // [INVARIANT: PIN-REPOSITORY-SSOT-INGESTION]
    for (let i = 0; i < sortedPins.length; i += 500) {
      const batchSlice = sortedPins.slice(i, i + 500);
      if (process.env.INGEST_MODE === 'discrete') {
        await insertNewPinsBatch(activeSql, batchSlice, 'keyword');
        await resavePinsMetricsBatch(activeSql, batchSlice);
      } else if (typeof activeSql.transaction === 'function' && process.env.INGEST_MODE === 'tx') {
        await activeSql.transaction([
          (tx) => ingestPinsBatch(tx, batchSlice, { pillar: 'keyword' })
        ]);
      } else {
        await ingestPinsBatch(activeSql, batchSlice, { pillar: 'keyword' });
      }
    }

    if (kw) {
      const uniqueHubPinsMap = new Map();
      for (const sp of sortedPins) {
        if (sp && sp.pin_id && !uniqueHubPinsMap.has(String(sp.pin_id))) {
          uniqueHubPinsMap.set(String(sp.pin_id), sp);
        }
      }
      await flushBatchToHub(Array.from(uniqueHubPinsMap.values()), kw, activeSql);
    }
  }, { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 4000 });

  const timeoutTask = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Unified Postgres flush timeout (${FLUSH_TIMEOUT_MS}ms limit)`));
    }, FLUSH_TIMEOUT_MS);
  });

  try {
    await Promise.race([syncTask, timeoutTask]);
    return 1;
  } catch (err) {
    syncTask.catch(() => {});
    throw new Error(`[DB Flush Fatal] Unified Postgres write failed for ${enrichedPins.length} pins: ${err.message}`);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

/**
 * Guarantees 100% of candidate SERP pins are persisted to Unified PostgreSQL
 * even if individual live closeup requests are deferred during Stage 2.
 */
function buildUnifiedSyncList(candidatePins, enrichedPins, defaultKeywordId = null) {
  const enrichedMap = new Map();
  for (const ep of (enrichedPins || [])) {
    if (ep && ep.pin_id) enrichedMap.set(String(ep.pin_id), ep);
  }
  const merged = [];
  for (const cp of (candidatePins || [])) {
    if (!cp || !cp.pin_id) continue;
    const pid = String(cp.pin_id);
    const enriched = enrichedMap.get(pid);
    const baseMethod = cp.creation_method || cp.method || cp.metadata?.creation_method || cp.metadata?.method || 'pinterest_platform';
    const isCached = enriched ? Boolean(enriched.from_hydration_cache) : true;
    const wasLiveScraped = enriched ? Boolean(!enriched.from_hydration_cache && !enriched.scrape_failed) : false;
    const basePin = enriched ? {
      ...enriched,
      from_hydration_cache: isCached,
      was_live_scraped: wasLiveScraped
    } : {
      pin_id: pid,
      from_hydration_cache: true,
      was_live_scraped: false,
      creator_username: cp.creator_username || cp.metadata?.pinner?.username || '',
      board_name: cp.board_name || cp.metadata?.board_name || '',
      board_slug: (cp.board_name || cp.metadata?.board_name || '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'),
      title: cp.title || '',
      domain: cp.domain || '',
      destination_url: cp.destination_url || '',
      image_url: cp.image_url || '',
      description: cp.description || '',
      alt_text: cp.metadata?.alt_text || '',
      dominant_color: (cp.dominant_color && String(cp.dominant_color).toLowerCase() !== '#888888') ? cp.dominant_color : null,
      visual_annotations: sanitizeVisualAnnotations(cp.visual_annotations, { maxItems: 15 }),
      created_at_pinterest: cp.created_at_pinterest || null,
      method: baseMethod,
      creation_method: baseMethod,
      extra_meta: {
        ...((cp.metadata && typeof cp.metadata === 'object') ? cp.metadata : {}),
        creation_method: baseMethod,
        method: baseMethod
      },
      keyword_id: cp.keyword_id || defaultKeywordId || null,
      rank_position: cp.rank_position,
      catalog_rank: cp.catalog_rank || cp.rank_position,
      last_known_rank: cp.last_known_rank,
      is_displaced: Boolean(cp.is_displaced),
      save_count: cp.save_count != null ? Number(cp.save_count) : null,
      repin_count: cp.repin_count != null ? Number(cp.repin_count) : null,
      comment_count: cp.comment_count != null ? Number(cp.comment_count) : null,
      share_count: cp.share_count != null ? Number(cp.share_count) : null,
      daily_save_velocity: null,
      daily_repin_velocity: null,
      delta_saves_24h: null,
      delta_repins_24h: null,
      is_hydrated: Boolean(cp.is_hydrated || cp.is_deep_hydrated)
    };

    if (Array.isArray(cp.folder_positions) && cp.folder_positions.length > 0) {
      for (const pos of cp.folder_positions) {
        merged.push({
          ...basePin,
          keyword_id: pos.keyword_id || basePin.keyword_id,
          rank_position: pos.rank_position ?? (pos.is_displaced ? null : basePin.rank_position),
          catalog_rank: pos.is_displaced ? ((Number(pos.last_known_rank || 50) + 100)) : (pos.rank_position ?? basePin.catalog_rank),
          last_known_rank: pos.last_known_rank ?? basePin.last_known_rank,
          is_displaced: Boolean(pos.is_displaced)
        });
      }
    } else {
      merged.push(basePin);
    }
  }
  return merged;
}

/**
 * Two-Lane Concurrent Pin Inspection:
 * - Stage 1: Zero-cookie Pidgets 50x bulk pre-pass for all structurally complete pins.
 * - Stage 2: Deep `fetchPinHybrid` fallback ONLY for missing DNA, `--force-deep`, or Pidgets fallback cases.
 */
export async function inspectPinsConcurrently(pins, kw, label = 'Worker', options = {}) {
  if (!pins || pins.length === 0) return [];
  const sem = new Semaphore(CONCURRENCY);
  const enrichedPins = [];
  let completedCount = 0;
  let pidgetsHitCount = 0;
  let deepFallbackCount = 0;
  let cacheHitCount = 0;
  const total = pins.length;
  const nowMs = options.nowMs ?? Date.now();
  const batchPidgetsFn = typeof options.batchPidgetsFn === 'function' ? options.batchPidgetsFn : fetchPinsBatchFromPidgets;

  // Evaluate Two-Lane routing up front
  const pinDecisions = pins.map((p) => ({
    pin: p,
    guard: evaluateHydrationGuard(p, nowMs, options)
  }));

  const pidgetsCandidateIds = [];
  for (const { pin, guard } of pinDecisions) {
    const pid = String(pin?.pin_id || '').trim();
    if (guard.lane === 'pidgets' && /^\d{10,25}$/.test(pid)) {
      pidgetsCandidateIds.push(pid);
    }
  }

  let pidgetsMap = new Map();
  if (pidgetsCandidateIds.length > 0) {
    try {
      const batchRes = await batchPidgetsFn(pidgetsCandidateIds, { concurrency: 5 });
      if (batchRes instanceof Map) {
        pidgetsMap = batchRes;
      }
    } catch (pErr) {
      console.warn(`  [!] ${label}: Stage-1 Pidgets 50x pre-pass warning (falling back to Stage 2): ${pErr.message}`);
    }
  }

  console.log(`  [*] ${label}: Inspecting ${total} pins (Stage-1 Pidgets candidates: ${pidgetsCandidateIds.length}, Concurrency: ${CONCURRENCY}, Hub Batch: ${BATCH_SIZE})...`);

  const pool = pinDecisions.map(({ pin: p, guard }) => sem.run(async () => {
    if (circuitBroken) return;
    try {
      if (!guard.shouldFetch && guard.reuseTelemetry) {
        cacheHitCount++;
        enrichedPins.push(buildCachedCarryoverRecord(p, kw, guard.reuseTelemetry));
        return;
      }

      if (guard.lane === 'pidgets') {
        const pidgetsPin = pidgetsMap.get(String(p.pin_id));
        if (canSatisfyPinFromPidgets(p, pidgetsPin)) {
          pidgetsHitCount++;
          enrichedPins.push(buildPidgetsEnrichedPin(p, pidgetsPin, kw));
          return;
        }
      }

      deepFallbackCount++;
      const enriched = await inspectPin(p, kw, { ...options, skipGuard: true, nowMs });
      if (enriched) {
        enrichedPins.push(enriched);
      }
    } catch (err) {
      console.warn(`    [!] Pin #${p.pin_id} inspect error:`, err.message);
    } finally {
      completedCount++;
      if (completedCount % 50 === 0 || completedCount === total) {
        console.log(`  [Progress] ${label}: Inspected ${completedCount}/${total} pins (${Math.round((completedCount / total) * 100)}%) [Pidgets: ${pidgetsHitCount} | Deep: ${deepFallbackCount} | Cache: ${cacheHitCount}]...`);
      }
    }
  }));

  await Promise.allSettled(pool);

  return enrichedPins;
}

async function run() {
  console.log('===============================================================');
  console.log('🚀 KEYWORD INTELLIGENCE & VELOCITY AUTONOMOUS WORKER');
  console.log('===============================================================');
  console.log(`[Config] Execution Mode:  ${mode.toUpperCase()}`);
  console.log(`[Config] Worker Slot:     ${workerIndex + 1} / ${workerTotal}`);
  console.log(`[Config] Target Keyword:  "${targetKeyword || '<AUTO-RESOLVE>'}"`);
  console.log(`[Config] Crawl Scope:     ${crawlScope}`);

  if (mode === 'folder_pin_partition') {
    // =========================================================================
    // EXECUTION MODE C: FOLDER CLUSTER PIN-SLICE SHARDING
    // =========================================================================
    const fid = folderIdInput;
    if (!fid) {
      console.error(`[-] FATAL: FOLDER_ID is required for folder_pin_partition.`);
      await closeCrawlerDb(1);
    }

    const [folderRow] = await sql`
      SELECT id, name, description FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (!folderRow) {
      console.error(`[-] FATAL: Folder ${fid} not found in database.`);
      await closeCrawlerDb(1);
    }

    console.log(`[*] Target Folder Identified: "${folderRow.name}" (ID: ${folderRow.id})`);

    // -------------------------------------------------------------------------
    // PHASE 1A: Distributed Parallel SERP Ingestion Across 20 Egress IPs
    // -------------------------------------------------------------------------
    // [INVARIANT: LND-01 CLOCK-SKEW IMMUNE BARRIER VIA LOGICAL TOKEN (OPTION B)]
    const folderRunToken = String(
      process.env.CRAWL_RUN_ID ||
      (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}` : null) ||
      `bucket_${Math.floor(Date.now() / 600000)}`
    );

    let phase1aTotalFailureC = false;
    if (enableSerpHarvest && keywordIdsInput.length > 0) {
      console.log(`[Phase 1A] Runner ${workerIndex + 1}/${workerTotal}: Ingesting assigned ${keywordIdsInput.length} keywords in parallel (token: ${folderRunToken})...`);
      let fatalSerpDbErr = null;
      let serpSuccessCount = 0;
      let serpErrorCount = 0;
      const kwSem = new Semaphore(Math.min(4, Math.max(1, keywordIdsInput.length)));
      await Promise.allSettled(keywordIdsInput.map(kid => kwSem.run(async () => {
        const effectiveToken = crypto.randomUUID();
        try {
          console.log(`  [*] [Phase 1A] Harvesting SERP for Keyword ID ${kid}...`);
          const res = await crawlKeywordSERP(sql, kid, {
            cookie,
            ...(explicitMaxSerpPins !== null ? { max_serp_pins: explicitMaxSerpPins } : {}),
            skip_top_enrich: true,
            force: true,
            lease_token: effectiveToken
          });
          serpSuccessCount++;
          console.log(`  [+] [Phase 1A] Keyword ID ${kid} SERP harvest complete:`, res?.pins_collected || res?.total_pins_processed || 'OK');
        } catch (err) {
          serpErrorCount++;
          const isFatalSqlError = classifyFatalSerpSqlError(err);
          console.error(`  [!] [Phase 1A] Keyword ID ${kid} SERP error (code=${err?.code || 'N/A'}):`, err.message);
          if (isFatalSqlError && !fatalSerpDbErr) {
            fatalSerpDbErr = err;
          }
        } finally {
          // Failure-Immune Barrier Sync Guard: Always stamp updated_at so failure or incomplete crawl never blocks cluster barrier
          try {
            await stampPhase1ABarrierToken(kid, folderRunToken, effectiveToken);
          } catch (barrierErr) {
            console.warn(`  [!] [Phase 1A] Keyword ID ${kid} barrier token update failed: ${barrierErr?.message || barrierErr}`);
          }
        }
      })));
      if (fatalSerpDbErr) {
        throw new Error(`[Phase 1A Fatal DB Error] ${fatalSerpDbErr.message}`);
      }
      if (serpErrorCount > 0 && serpSuccessCount === 0) {
        phase1aTotalFailureC = true;
        console.warn(`[Phase 1A Warning] All ${serpErrorCount} assigned keyword SERP harvests failed on runner ${workerIndex + 1}/${workerTotal}. Proceeding to Phase 1B catalog slice inspection.`);
      }
    } else if (!enableSerpHarvest) {
      console.log(`[Phase 1A] SERP harvest disabled via ENABLE_SERP_HARVEST=false. Skipping directly to Phase 1B.`);
    } else {
      console.log(`[Phase 1A] No keywords assigned to this runner. Waiting for peers at barrier sync...`);
    }

    // Logical Token Barrier Sync: Wait for peer runners to complete parallel SERP ingestion (clock-skew immune)
    if (enableSerpHarvest && workerTotal > 1) {
      console.log(`[Phase 1A] Barrier Sync: Waiting for peer runners to complete parallel SERP ingestion (token: ${folderRunToken})...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 150000;
      const barrierPollSql = sql?.noRetry || sql;
      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        let pendingCount = 0;
        try {
          const [pendingRow] = await withDbRetry(() => barrierPollSql`
            SELECT COUNT(*)::int as pending
            FROM keyword_folder_items kfi
            JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
            WHERE kfi.folder_id = ${fid}
              AND tk.is_active = TRUE
              AND (tk.metadata->>'phase1a_completed_token') IS DISTINCT FROM ${folderRunToken};
          `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });
          pendingCount = Number(pendingRow?.pending || 0);
        } catch (pollErr) {
          console.warn(`  [Phase 1A Sync] Transient barrier poll warning: ${pollErr?.message || pollErr}`);
          await sleep(2500);
          continue;
        }
        if (pendingCount === 0) {
          console.log(`[Phase 1A] Barrier Sync cleared: 100% of cluster keywords ingested in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }
        console.log(`  [Phase 1A Sync] ${pendingCount} keyword(s) still harvesting SERP...`);
        await sleep(2500);
      }
      if (Date.now() - barrierStart >= BARRIER_TIMEOUT_MS) {
        console.warn(`[Phase 1A] Barrier Sync reached ${BARRIER_TIMEOUT_MS / 1000}s timeout limit. Proceeding to Phase 1B with harvested catalog.`);
      }
    }

    // Stagger Phase 1B catalog query across the 20 runners to prevent simultaneous thundering-herd I/O spikes
    if (workerTotal > 1 && workerIndex > 0) {
      await sleep(workerIndex * 350);
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Deterministic crc32(pin_id) % workerTotal Pin-Slice Deep Inspection
    // -------------------------------------------------------------------------
    // Fetch candidate pins across all folder keywords (use sql.noRetry to avoid stacked retries)
    const phase1bSql = sql?.noRetry || sql;
    const phase1bRetryOpts = { maxRetries: 2, baseDelayMs: 1500, maxDelayMs: 6000, retryOnStatementTimeout: true };
    let allPins = [];
    const isOnlyActive = crawlScope === 'active_serp';
    allPins = await withDbRetry(() => phase1bSql`
      WITH folder_ksp AS (
        SELECT 
          ksp.pin_id, ksp.keyword_id, ksp.rank_position, ksp.last_known_rank,
          ump.creator_username, ump.board_name, ump.description, ump.alt_text, ump.dominant_color,
          ump.comment_count, ump.share_count,
          ump.save_count, ump.repin_count, ump.daily_save_velocity,
          ump.created_at_pinterest, ump.creation_method,
          ump.is_hydrated, ump.is_hydrated AS is_deep_hydrated,
          ump.last_scraped_at, ump.visual_annotations, ump.image_signature, ump.metadata, ump.title, COALESCE(ump.clean_domain, ump.domain, '') AS domain, ump.destination_url, ump.image_url,
          ksp.crawled_at, ksp.updated_at, ksp.is_displaced,
          CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN ump.save_count ELSE NULL END AS baseline_day_saves,
          CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN (ump.last_scraped_at AT TIME ZONE 'UTC')::date ELSE NULL END AS baseline_day_date
        FROM keyword_serp_positions ksp
        JOIN keyword_folder_items kfi ON kfi.keyword_id = ksp.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE kfi.folder_id = ${fid} AND ksp.pin_id IS NOT NULL AND ksp.pin_id <> ''
          AND (${isOnlyActive}::boolean = FALSE OR ksp.is_displaced = FALSE)
          AND ${Number(workerTotal) === 20
            ? sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % 20) = ${workerIndex}`
            : sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % ${workerTotal}) = ${workerIndex}`}
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
          )
      ),
      aggregated_positions AS (
        SELECT 
          pin_id,
          jsonb_agg(jsonb_build_object(
            'keyword_id', keyword_id,
            'rank_position', rank_position,
            'is_displaced', is_displaced,
            'last_known_rank', last_known_rank
          )) AS folder_positions
        FROM folder_ksp
        GROUP BY pin_id
      )
      SELECT DISTINCT ON (f.pin_id)
        f.pin_id, f.keyword_id, f.rank_position, f.last_known_rank,
        f.creator_username, f.board_name, f.description, f.alt_text, f.dominant_color,
        f.comment_count, f.share_count,
        f.save_count, f.repin_count, f.daily_save_velocity,
        f.created_at_pinterest, f.creation_method,
        f.is_hydrated, f.is_deep_hydrated, f.last_scraped_at, f.visual_annotations, f.image_signature, f.metadata, f.title, f.domain, f.destination_url, f.image_url,
        f.crawled_at, f.updated_at, f.is_displaced,
        f.baseline_day_saves, f.baseline_day_date,
        ap.folder_positions
      FROM folder_ksp f
      JOIN aggregated_positions ap ON ap.pin_id = f.pin_id
      ORDER BY f.pin_id, f.is_displaced ASC, f.rank_position ASC NULLS LAST;
    `, phase1bRetryOpts);

    allPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    if (maxCatalogInspect > 0) {
      const perWorkerCap = Math.max(1, Math.ceil(maxCatalogInspect / workerTotal));
      if (allPins.length > perWorkerCap) {
        console.log(`  [*] Applying per-worker max_catalog_inspect cap: ${allPins.length} -> ${perWorkerCap} pins (total cap: ${maxCatalogInspect})`);
        allPins = allPins.slice(0, perWorkerCap);
      }
    }

    // [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    const myPins = allPins;

    console.log(`[*] Total Unique Folder Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      await closeCrawlerDb(0);
    }

    const enrichedList = await inspectPinsConcurrently(
      myPins,
      { folder_id: fid, keyword: folderRow.name },
      `Folder Slice ${workerIndex + 1}/${workerTotal}`
    );

    const unifiedDbSynced = await flushToUnifiedPostgres(
      buildUnifiedSyncList(myPins, enrichedList),
      { folder_id: fid, keyword: folderRow.name }
    );
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed to Unified PostgreSQL.`);

    const cachedCount = enrichedList.filter(p => p.from_hydration_cache).length;
    const fetchedCount = enrichedList.filter(p => !p.from_hydration_cache).length;
    const deadCount = enrichedList.filter(p => p.is_deleted).length;
    const deferredCount = myPins.length - enrichedList.length;

    if (stepSummaryPath) {
      try {
        let md = `### 📁 Folder Runner Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Folder**: \`${folderRow.name}\` (ID: ${fid})\n`;
        if (phase1aTotalFailureC) {
          md += `- **Phase 1A Status**: ⚠️ All assigned SERP harvests failed on this runner\n`;
        }
        md += `- **Assigned Slice Pins**: **${myPins.length}**\n`;
        md += `- **Reused from Fresh Hydration Cache**: **${cachedCount}**\n`;
        md += `- **Freshly Inspected via Pinterest API**: **${fetchedCount}**\n`;
        md += `- **Deferred / Failed**: **${deferredCount}**\n`;
        md += `- **Unified PostgreSQL Synchronized**: **${unifiedDbSynced > 0 ? 'Yes' : 'No'}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    await closeCrawlerDb(0);

  } else if (mode === 'pin_partition') {
    // =========================================================================
    // EXECUTION MODE B: SINGLE-KEYWORD PIN-SLICE SHARDING
    // =========================================================================
    let kwRow = null;
    if (keywordIdInput) {
      [kwRow] = await sql`
        SELECT id, keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, avg_daily_velocity, is_active, last_crawled_at, updated_at
        FROM tracked_keywords
        WHERE id = ${keywordIdInput};
      `;
    }
    if (!kwRow && targetKeyword) {
      [kwRow] = await sql`
        SELECT id, keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, avg_daily_velocity, is_active, last_crawled_at, updated_at
        FROM tracked_keywords
        WHERE LOWER(keyword) = ${targetKeyword};
      `;
    }
    if (!kwRow) {
      console.error(`[-] FATAL: Keyword "${targetKeyword}" not found for pin_partition.`);
      await closeCrawlerDb(1);
    }

    console.log(`[*] Target Keyword Identified: "${kwRow.keyword}" (ID: ${kwRow.id})`);

    // -------------------------------------------------------------------------
    // PHASE 1A: Single-Keyword SERP Ingestion (Lead Runner Ingests, Peers Sync)
    // -------------------------------------------------------------------------
    // [INVARIANT: LND-01 CLOCK-SKEW IMMUNE BARRIER VIA LOGICAL TOKEN (OPTION B)]
    const runToken = String(
      process.env.CRAWL_RUN_ID ||
      (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}` : null) ||
      `bucket_${Math.floor(Date.now() / 600000)}`
    );

    if (enableSerpHarvest) {
      if (workerIndex === 0) {
        console.log(`[Phase 1A] Runner 1/${workerTotal} (Lead): Ingesting SERP for "${kwRow.keyword}" (ID: ${kwRow.id})...`);
        const effectiveToken = crypto.randomUUID();
        let fatalSerpDbErrB = null;
        try {
          const res = await crawlKeywordSERP(sql, kwRow.id, {
            cookie,
            ...(explicitMaxSerpPins !== null ? { max_serp_pins: explicitMaxSerpPins } : {}),
            skip_top_enrich: true,
            force: true,
            lease_token: effectiveToken
          });
          console.log(`[Phase 1A] Lead Runner SERP ingest complete:`, res?.pins_collected || res?.total_pins_processed || 'OK');
        } catch (err) {
          const isFatalSqlError = classifyFatalSerpSqlError(err);
          console.warn(`[Phase 1A] Lead Runner SERP error (code=${err?.code || 'N/A'}):`, err.message);
          if (isFatalSqlError) {
            fatalSerpDbErrB = err;
          }
        } finally {
          // Failure-Immune Barrier Sync Guard: Always stamp updated_at so failure or incomplete crawl never hangs peer workers
          let barrierUpdated = false;
          try {
            await stampPhase1ABarrierToken(kwRow.id, runToken, effectiveToken);
            barrierUpdated = true;
          } catch (barrierErr) {
            console.warn(`[Worker 0] ⚠️ Phase 1A barrier token update failed: ${barrierErr?.message || barrierErr}`);
          }
          if (barrierUpdated) {
            console.log(`[Worker 0] Successfully sealed Phase 1A barrier token: ${runToken}`);
          }
        }
        if (fatalSerpDbErrB) {
          throw new Error(`[Phase 1A Fatal DB Error] ${fatalSerpDbErrB.message}`);
        }
      } else {
        console.log(`[Phase 1A] Runner ${workerIndex + 1}/${workerTotal}: Waiting for Runner 1 to complete SERP ingestion...`);
        let barrierCleared = false;
        const BARRIER_TIMEOUT_MS = 150000;
        const barrierDeadline = Date.now() + BARRIER_TIMEOUT_MS;
        const barrierPollSql = sql?.noRetry || sql;

        while (Date.now() < barrierDeadline) {
          let kwCheck = null;
          try {
            const rows = await withDbRetry(() => barrierPollSql`
              SELECT metadata->>'phase1a_completed_token' AS barrier_token
              FROM tracked_keywords
              WHERE id = ${kwRow.id}
            `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });
            kwCheck = rows?.[0] || null;
          } catch (pollErr) {
            console.warn(`[Worker ${workerIndex}] Transient barrier poll warning: ${pollErr?.message || pollErr}`);
            await sleep(1500);
            continue;
          }

          if (kwCheck && kwCheck.barrier_token === runToken) {
            barrierCleared = true;
            break;
          }

          await sleep(1500);
        }

        if (barrierCleared) {
          console.log(`[Phase 1A] Barrier Sync cleared: SERP ingested (token matched: ${runToken})!`);
        } else {
          console.warn(`[Worker ${workerIndex}] Barrier wait timed out after ${BARRIER_TIMEOUT_MS / 1000}s. Proceeding with caution.`);
        }
      }
    }

    // Stagger Phase 1B catalog query across the 20 runners to prevent simultaneous thundering-herd I/O spikes
    if (workerTotal > 1 && workerIndex > 0) {
      await sleep(workerIndex * 350);
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Deterministic crc32(pin_id) % workerTotal Pin-Slice Deep Inspection
    // -------------------------------------------------------------------------
    // Fetch candidate pins according to scope (use sql.noRetry to avoid stacked retries)
    const phase1bSqlB = sql?.noRetry || sql;
    const phase1bRetryOpts = { maxRetries: 2, baseDelayMs: 1500, maxDelayMs: 6000, retryOnStatementTimeout: true };
    let allPins = [];
    const isOnlyActive = crawlScope === 'active_serp';
    allPins = await withDbRetry(() => phase1bSqlB`
      SELECT 
        ksp.pin_id, ksp.keyword_id, ksp.rank_position, ksp.last_known_rank,
        ump.creator_username, ump.board_name, ump.description, ump.alt_text, ump.dominant_color,
        ump.comment_count, ump.share_count,
        ump.save_count, ump.repin_count, ump.daily_save_velocity,
        ump.created_at_pinterest, ump.creation_method,
        ump.is_hydrated, ump.is_hydrated AS is_deep_hydrated,
        ump.last_scraped_at, ump.visual_annotations, ump.image_signature, ump.metadata, ump.title, COALESCE(ump.clean_domain, ump.domain, '') AS domain, ump.destination_url, ump.image_url,
        ksp.crawled_at, ksp.updated_at, ksp.is_displaced,
        CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN ump.save_count ELSE NULL END AS baseline_day_saves,
        CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN (ump.last_scraped_at AT TIME ZONE 'UTC')::date ELSE NULL END AS baseline_day_date
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kwRow.id} AND ksp.pin_id IS NOT NULL AND ksp.pin_id <> ''
        AND (${isOnlyActive}::boolean = FALSE OR ksp.is_displaced = FALSE)
        AND ${Number(workerTotal) === 20
          ? sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % 20) = ${workerIndex}`
          : sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % ${workerTotal}) = ${workerIndex}`}
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip
          WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = ksp.pin_id
        )
      ORDER BY ksp.is_displaced ASC, ksp.rank_position ASC NULLS LAST;
    `, phase1bRetryOpts);

    // Deterministic sort to ensure identical order across all 20 runners (prioritizing numeric pins)
    allPins.sort((a, b) => {
      const isNumA = /^[0-9]+$/.test(a.pin_id);
      const isNumB = /^[0-9]+$/.test(b.pin_id);
      if (isNumA !== isNumB) return isNumA ? -1 : 1;
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    if (maxCatalogInspect > 0) {
      const perWorkerCap = Math.max(1, Math.ceil(maxCatalogInspect / workerTotal));
      if (allPins.length > perWorkerCap) {
        console.log(`  [*] Applying per-worker max_catalog_inspect cap: ${allPins.length} -> ${perWorkerCap} pins (total cap: ${maxCatalogInspect})`);
        allPins = allPins.slice(0, perWorkerCap);
      }
    }

    // [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    const myPins = allPins;
    console.log(`[*] Total Catalog Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      await closeCrawlerDb(0);
    }

    const enrichedList = await inspectPinsConcurrently(
      myPins,
      kwRow,
      `Keyword Slice ${workerIndex + 1}/${workerTotal}`
    );

    // Flush to Unified PostgreSQL SSOT
    const unifiedDbSynced = await flushToUnifiedPostgres(buildUnifiedSyncList(myPins, enrichedList, kwRow.id), kwRow);
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed to Unified PostgreSQL.`);

    const cachedCount = enrichedList.filter(p => p.from_hydration_cache).length;
    const fetchedCount = enrichedList.filter(p => !p.from_hydration_cache).length;
    const deadCount = enrichedList.filter(p => p.is_deleted).length;
    const deferredCount = myPins.length - enrichedList.length;

    // Write to step summary if available
    if (stepSummaryPath) {
      try {
        let md = `### 🧩 Runner Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Keyword**: \`${kwRow.keyword}\` (ID: ${kwRow.id})\n`;
        md += `- **Assigned Slice Pins**: **${myPins.length}**\n`;
        md += `- **Reused from Fresh Hydration Cache**: **${cachedCount}**\n`;
        md += `- **Freshly Inspected via Pinterest API**: **${fetchedCount}**\n`;
        md += `- **Deferred / Failed**: **${deferredCount}**\n`;
        md += `- **Unified PostgreSQL Synchronized**: **${unifiedDbSynced > 0 ? 'Yes' : 'No'}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    await closeCrawlerDb(0);

} else {
    // =========================================================================
    // EXECUTION MODE A: GLOBAL TWO-PHASE DISTRIBUTED PIN-PARTITION FLEET
    // Phase 1A: 20 Runners harvest SERPs in parallel (~5-6 keywords/runner)
    // Phase 1B: Push-Down SQL Hash Slice (bigint overflow-shielded) + 3KB JSON Vault Inspection
    // =========================================================================

    let allFleetKeywordIds = allKeywordIdsInput.length > 0 ? allKeywordIdsInput : [];
    if (allFleetKeywordIds.length === 0) {
      if (targetKeyword && workerTotal === 1) {
        const rows = await sql`
          SELECT id FROM tracked_keywords WHERE LOWER(keyword) = ${targetKeyword};
        `;
        allFleetKeywordIds = rows.map(r => Number(r.id));
      } else {
        const rows = await sql`
          SELECT id FROM tracked_keywords WHERE is_active = TRUE ORDER BY id ASC;
        `;
        allFleetKeywordIds = rows.map(r => Number(r.id));
      }
    }

    const preCheckAnchors = allFleetKeywordIds.length === 0
      ? await fetchStandaloneNewbornAnchorsForWorker(sql?.noRetry || sql, { workerIndex, workerTotal })
      : [];

    if (allFleetKeywordIds.length === 0 && preCheckAnchors.length === 0) {
      console.log('[!] No active keywords or standalone Newborn daily anchors in this worker slice. Exiting cleanly.');
      await closeCrawlerDb(0);
    }

    const mySerpKeywordIds = keywordIdsInput.length > 0
      ? keywordIdsInput
      : (keywordIdInput && workerTotal === 1
          ? [keywordIdInput]
          : allFleetKeywordIds.filter((_, idx) => idx % workerTotal === workerIndex));

    // [INVARIANT: LND-01 CLOCK-SKEW IMMUNE BARRIER VIA LOGICAL TOKEN (OPTION B)]
    if (workerTotal > 1 && !process.env.CRAWL_RUN_ID && !process.env.GITHUB_RUN_ID) {
      console.warn('[Phase 1A] Multi-worker mode without CRAWL_RUN_ID or GITHUB_RUN_ID; falling back to 10-minute bucket token.');
    }
    const fleetRunToken = String(
      process.env.CRAWL_RUN_ID ||
      (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}` : null) ||
      `bucket_${Math.floor(Date.now() / 600000)}`
    );

    // -------------------------------------------------------------------------
    // PHASE 1A: Distributed Parallel SERP Ingestion (Barrier-Safe)
    // -------------------------------------------------------------------------
    let phase1aTotalFailureA = false;
    if (enableSerpHarvest && mySerpKeywordIds.length > 0) {
      const effectiveSerpCookie = await getEffectivePinterestCookie(sql, cookie);
      console.log(`[Phase 1A] Worker ${workerIndex + 1}/${workerTotal}: Harvesting SERPs for ${mySerpKeywordIds.length} assigned keywords (token: ${fleetRunToken})...`);
      const serpSem = new Semaphore(2);
      let fatalSerpDbErr = null;
      let serpSuccessCount = 0;
      let serpErrorCount = 0;
      await Promise.allSettled(
        mySerpKeywordIds.map((kid) => serpSem.run(async () => {
          const effectiveToken = crypto.randomUUID();
          try {
            const res = await crawlKeywordSERP(sql, kid, {
              cookie: effectiveSerpCookie,
              ...(explicitMaxSerpPins !== null ? { max_serp_pins: explicitMaxSerpPins } : {}),
              skip_top_enrich: true,
              force: true,
              lease_token: effectiveToken
            });
            serpSuccessCount++;
            console.log(`  [+] [Phase 1A] Keyword ID ${kid} SERP harvest complete (${res?.crawled_pins || 0} pins)`);
          } catch (err) {
            serpErrorCount++;
            const isFatalSqlError = classifyFatalSerpSqlError(err);
            console.error(`  [!] [Phase 1A] Keyword ID ${kid} SERP error (code=${err?.code || 'N/A'}): ${err.message}`);
            if (isFatalSqlError && !fatalSerpDbErr) {
              fatalSerpDbErr = err;
            }
          } finally {
            // Failure-Immune Logical Barrier Sync Guard: Always stamp phase1a_completed_token so a failed keyword or clock skew never blocks the 20-worker barrier
            try {
              await stampPhase1ABarrierToken(kid, fleetRunToken, effectiveToken);
            } catch (barrierErr) {
              console.warn(`  [!] [Phase 1A] Keyword ID ${kid} barrier token update failed: ${barrierErr?.message || barrierErr}`);
            }
          }
        }))
      );
      if (fatalSerpDbErr) {
        throw new Error(`[Phase 1A Fatal DB Error] ${fatalSerpDbErr.message}`);
      }
      if (serpErrorCount > 0 && serpSuccessCount === 0) {
        phase1aTotalFailureA = true;
        console.warn(`[Phase 1A Warning] All ${serpErrorCount} assigned keyword SERP harvests failed on worker ${workerIndex + 1}/${workerTotal}. Proceeding to Phase 1B catalog slice inspection.`);
      }
    } else if (!enableSerpHarvest) {
      console.log(`[Phase 1A] SERP harvest disabled via ENABLE_SERP_HARVEST=false. Proceeding directly to Phase 1B.`);
    }

    // Failure-Immune Logical Token Barrier Sync across all 20 fleet workers
    if (enableSerpHarvest && workerTotal > 1 && allFleetKeywordIds.length > 0) {
      console.log(`[Phase 1A] Barrier Sync: Waiting for peer workers to complete SERP ingestion across ${allFleetKeywordIds.length} keywords (token: ${fleetRunToken})...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 150000;
      const barrierPollSql = sql?.noRetry || sql;
      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        let pendingCount = 0;
        try {
          const [pendingRow] = await withDbRetry(() => barrierPollSql`
            SELECT COUNT(*)::int AS pending
            FROM tracked_keywords
            WHERE id = ANY(${allFleetKeywordIds})
              AND is_active = TRUE
              AND (metadata->>'phase1a_completed_token') IS DISTINCT FROM ${fleetRunToken};
          `, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 });
          pendingCount = Number(pendingRow?.pending || 0);
        } catch (pollErr) {
          console.warn(`  [Phase 1A Sync] Transient barrier poll warning: ${pollErr?.message || pollErr}`);
          await sleep(1200);
          continue;
        }
        if (pendingCount === 0) {
          console.log(`[Phase 1A] Barrier Sync cleared in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }
        console.log(`  [Phase 1A Sync] ${pendingCount} keyword(s) still harvesting SERP...`);
        await sleep(1200);
      }
      if (Date.now() - barrierStart >= BARRIER_TIMEOUT_MS) {
        console.warn(`[Phase 1A] Barrier Sync reached ${BARRIER_TIMEOUT_MS / 1000}s timeout limit. Proceeding to Phase 1B with harvested catalog.`);
      }
    }

    // Stagger Phase 1B catalog query across the 20 workers to prevent simultaneous thundering-herd I/O spikes
    if (workerTotal > 1 && workerIndex > 0) {
      await sleep(workerIndex * 350);
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Push-Down SQL Shard-Affine Partitioning [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    // -------------------------------------------------------------------------
    const phase1bSqlA = sql?.noRetry || sql;
    const phase1bRetryOpts = { maxRetries: 2, baseDelayMs: 1500, maxDelayMs: 6000, retryOnStatementTimeout: true };
    let myPins = allFleetKeywordIds.length > 0
      ? await withDbRetry(() => phase1bSqlA`
          WITH global_ksp AS (
            SELECT 
              ksp.pin_id, ksp.keyword_id, ksp.rank_position, ksp.last_known_rank,
              ump.creator_username, ump.board_name, ump.description, ump.alt_text, ump.dominant_color,
              ump.comment_count, ump.share_count,
              ump.save_count, ump.repin_count, ump.daily_save_velocity,
              ump.created_at_pinterest, ump.creation_method,
              ump.is_hydrated, ump.is_hydrated AS is_deep_hydrated,
              ump.last_scraped_at, ump.visual_annotations, ump.image_signature, ump.metadata, ump.title, COALESCE(ump.clean_domain, ump.domain, '') AS domain, ump.destination_url, ump.image_url,
              ksp.crawled_at, ksp.updated_at, ksp.is_displaced,
              CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN ump.save_count ELSE NULL END AS baseline_day_saves,
              CASE WHEN ump.last_scraped_at IS NOT NULL AND (ump.last_scraped_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date THEN (ump.last_scraped_at AT TIME ZONE 'UTC')::date ELSE NULL END AS baseline_day_date
            FROM keyword_serp_positions ksp
            JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
            WHERE ksp.keyword_id = ANY(${allFleetKeywordIds})
              AND ksp.pin_id IS NOT NULL AND ksp.pin_id <> ''
              AND (${crawlScope === 'active_serp'}::boolean = FALSE OR ksp.is_displaced = FALSE)
              AND ${Number(workerTotal) === 20
                ? sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % 20) = ${workerIndex}`
                : sql`(ABS(hashtext(ksp.pin_id::text)::bigint) % ${workerTotal}) = ${workerIndex}`}
              AND (
                ksp.is_displaced = FALSE
                OR COALESCE(ksp.last_known_rank, 999) <= 50
                OR COALESCE(ump.daily_save_velocity, 0) >= 5
                OR ksp.updated_at >= NOW() - INTERVAL '3 days'
                OR MOD(EXTRACT(DOY FROM CURRENT_DATE)::int + ksp.keyword_id, 5) = 0
              )
              AND NOT EXISTS (
                SELECT 1 FROM keyword_ignored_pins kip
                WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
              )
          ),
          aggregated_positions AS (
            SELECT 
              pin_id,
              jsonb_agg(jsonb_build_object(
                'keyword_id', keyword_id,
                'rank_position', rank_position,
                'is_displaced', is_displaced,
                'last_known_rank', last_known_rank
              )) AS folder_positions
            FROM global_ksp
            GROUP BY pin_id
          )
          SELECT DISTINCT ON (g.pin_id)
            g.pin_id, g.keyword_id, g.rank_position, g.last_known_rank,
            g.creator_username, g.board_name, g.description, g.alt_text, g.dominant_color,
            g.comment_count, g.share_count,
            g.save_count, g.repin_count, g.daily_save_velocity,
            g.created_at_pinterest, g.creation_method,
            g.is_hydrated, g.is_deep_hydrated, g.last_scraped_at, g.visual_annotations, g.image_signature, g.metadata, g.title, g.domain, g.destination_url, g.image_url,
            g.crawled_at, g.updated_at, g.is_displaced,
            g.baseline_day_saves, g.baseline_day_date,
            ap.folder_positions
          FROM global_ksp g
          JOIN aggregated_positions ap ON ap.pin_id = g.pin_id
          ORDER BY g.pin_id, g.is_displaced ASC, g.rank_position ASC NULLS LAST;
        `, phase1bRetryOpts)
      : [];

    // Union standalone Newborn daily crawler anchors (`newborn_daily_anchors`) assigned to this shard
    const standaloneAnchors = allFleetKeywordIds.length === 0
      ? preCheckAnchors
      : await fetchStandaloneNewbornAnchorsForWorker(phase1bSqlA, { workerIndex, workerTotal });

    if (standaloneAnchors.length > 0) {
      const existingPinIds = new Set(myPins.map((p) => String(p.pin_id)));
      for (const anchorPin of standaloneAnchors) {
        if (anchorPin?.pin_id && !existingPinIds.has(String(anchorPin.pin_id))) {
          existingPinIds.add(String(anchorPin.pin_id));
          myPins.push(anchorPin);
        }
      }
    }

    myPins.sort((a, b) => {
      if (a.is_displaced !== b.is_displaced) return a.is_displaced ? 1 : -1;
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    if (maxCatalogInspect > 0) {
      const perWorkerCap = Math.max(1, Math.ceil(maxCatalogInspect / workerTotal));
      if (myPins.length > perWorkerCap) {
        myPins = myPins.slice(0, perWorkerCap);
      }
    }

    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} Assigned Unique Slice: ${myPins.length} pins (${myPins.filter(p => !p.is_displaced).length} active + ${myPins.filter(p => p.is_displaced).length} vault)`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      await closeCrawlerDb(0);
    }

    const enrichedList = await inspectPinsConcurrently(
      myPins,
      {
        is_global_fleet: true,
        all_keyword_ids: allFleetKeywordIds,
        id: mySerpKeywordIds[0] || allFleetKeywordIds[0]
      },
      `Global Swarm Slice ${workerIndex + 1}/${workerTotal}`
    );

    const unifiedDbSynced = await flushToUnifiedPostgres(
      buildUnifiedSyncList(myPins, enrichedList),
      {
        is_global_fleet: true,
        all_keyword_ids: allFleetKeywordIds,
        id: mySerpKeywordIds[0] || allFleetKeywordIds[0]
      }
    );
    console.log(`\n✅ Global Swarm Slice ${workerIndex + 1}/${workerTotal} Complete: Enriched ${enrichedList.length}/${myPins.length} unique pins | Synced to Unified PostgreSQL.`);

    if (stepSummaryPath) {
      try {
        const cachedCount = enrichedList.filter(p => p.from_hydration_cache).length;
        const fetchedCount = enrichedList.filter(p => !p.from_hydration_cache).length;
        const deadCount = enrichedList.filter(p => p.is_deleted).length;
        let md = `### 🌐 Global Swarm Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **SERP Keywords Harvested (Phase 1A)**: **${mySerpKeywordIds.length}**\n`;
        if (phase1aTotalFailureA) {
          md += `- **Phase 1A Status**: ⚠️ All assigned SERP harvests failed on this runner\n`;
        }
        md += `- **Unique Slice Pins (Phase 1B)**: **${myPins.length}**\n`;
        md += `- **Reused from Hydration Cache**: **${cachedCount}**\n`;
        md += `- **Freshly Inspected (Hybrid 3KB/SSR)**: **${fetchedCount}**\n`;
        md += `- **Unified PostgreSQL Synchronized**: **${unifiedDbSynced > 0 ? 'Yes' : 'No'}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    await closeCrawlerDb(0);
  }
}

if (isMainModule) {
  lease = startInstaBoxActivityLease('keyword-velocity-crawler');
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
