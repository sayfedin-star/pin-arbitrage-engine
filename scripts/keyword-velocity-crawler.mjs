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
 * - Zero-Loss JSONB Set Union for Visual Annotations across Central Hub and 99 Storage Shards.
 * - Tracks Authentic Saves & Viral Repins (Daily Telemetry).
 * - Non-blocking Postgres Advisory Locks to prevent concurrent race conditions.
 * - Jitter backoff (2500ms-4000ms) with AbortSignal.timeout(8000).
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';
import { fetchPinFromPinterest, fetchPinHybrid, setDefaultDispatcher } from './lib/pinterest.mjs';
import { batchGroupByShard, resolveShardConnection, preloadNeonRegistry, getPinShardId, crc32 } from '../src/modules/sharding/fleet-router.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';

const activeTargetShards = new Set();
let crawlerKeepAlive = null;

function registerTargetShards(pins) {
  if (!pins || !Array.isArray(pins)) return;
  for (const p of pins) {
    if (p && p.pin_id) {
      try {
        const sid = getPinShardId(p.pin_id, 99);
        activeTargetShards.add(sid);
      } catch (_) {}
    }
  }
}

let undiciAgent = null;
try {
  const { Agent } = await import('undici');
  const candidateAgent = new Agent({ keepAliveTimeout: 30000, connections: 50, pipelining: 1 });
  // Node 22 built-in fetch uses Undici v6; Undici v8 Agent throws InvalidArgumentError (fetch failed)
  if (String(process.versions?.undici || '').startsWith('8.')) {
    undiciAgent = candidateAgent;
  }
  setDefaultDispatcher(undiciAgent);
} catch (_) {}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const mode = (process.env.MODE || 'keyword_sweep').toLowerCase().trim();
const rawWorkerIndex = parseInt(process.env.WORKER_INDEX || '0', 10);
const workerIndex = Number.isFinite(rawWorkerIndex) ? Math.max(0, rawWorkerIndex) : 0;
const rawWorkerTotal = parseInt(process.env.WORKER_TOTAL || '20', 10);
const workerTotal = Number.isFinite(rawWorkerTotal) && rawWorkerTotal > 0 ? rawWorkerTotal : 20;

// [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
// Deterministically partition the 99 storage shards across the 20 matrix runners
const assignedShards = [];
for (let s = 1; s <= 99; s++) {
  if (((s - 1) % workerTotal) === (workerIndex % workerTotal)) {
    assignedShards.push(s);
  }
}
const assignedShardSet = new Set(assignedShards);
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
const maxSerpPins = (envSerpPins && !isNaN(parseInt(envSerpPins, 10)))
  ? Math.max(10, Math.min(2000, parseInt(envSerpPins, 10)))
  : 50;

const envCatalogInspect = process.env.MAX_CATALOG_INSPECT?.trim();
const maxCatalogInspect = (envCatalogInspect !== undefined && envCatalogInspect !== '' && !isNaN(parseInt(envCatalogInspect, 10)))
  ? Math.max(0, parseInt(envCatalogInspect, 10))
  : 0;

const envHarvest = process.env.ENABLE_SERP_HARVEST?.trim();
const enableSerpHarvest = (envHarvest !== undefined && envHarvest !== '')
  ? (envHarvest === 'true' || envHarvest === '1')
  : true;
const maxPins = maxSerpPins;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Concurrency & Rate Limiting Controls (Configurable via Environment)
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

const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '12', 10));
const BATCH_SIZE = Math.max(10, parseInt(process.env.BATCH_SIZE || '250', 10));
const SLEEP_MS_MIN = Math.max(150, parseInt(process.env.SLEEP_MS_MIN || '300', 10));
const SLEEP_MS_MAX = Math.max(SLEEP_MS_MIN, parseInt(process.env.SLEEP_MS_MAX || '600', 10));

let rateLimitCooldownUntil = 0;
let consecutiveErrors = 0;
const CIRCUIT_BREAKER_LIMIT = 25;
let circuitBroken = false;

const HARD_COOLDOWN_MS = 4 * 60 * 60 * 1000;    // 4 Hours Hard Floor
const MAX_SAME_DAY_TTL_MS = 18 * 60 * 60 * 1000; // 18 Hours Maximum Same-Day Cache

/**
 * Hardened Hydration Guard (Dual-Threshold: 4h Hard Floor + 18h Same-Day Cache)
 */
function evaluateHydrationGuard(pin, currentUtcTimestamp = Date.now()) {
  const crawlTime = pin.crawled_at || pin.metadata?.crawled_at || null;
  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const isDeepHydrated = Boolean(
    pin.is_deep_hydrated === true ||
    pin.is_deep_hydrated === 'true' ||
    meta.is_deep_hydrated === true ||
    meta.is_deep_hydrated === 'true'
  );
  const imgSig = pin.image_signature || meta.image_signature || '';
  const hasRichTreasures = Boolean(
    meta.has_treasures === true ||
    imgSig ||
    pin.has_visual_annotations === true ||
    meta.canonical_pin_id ||
    meta.board_pin_count
  );
  const isDisplaced = Boolean(pin.is_displaced);

  const lastCrawlMs = crawlTime ? new Date(crawlTime).getTime() : NaN;
  const elapsedMs = !isNaN(lastCrawlMs) ? (currentUtcTimestamp - lastCrawlMs) : Infinity;

  // Displaced pins lack full metadata column in keyword_displaced_index; guard by crawlTime / updated_at cooldown
  if (isDisplaced && !isNaN(lastCrawlMs) && pin.save_count != null && elapsedMs < HARD_COOLDOWN_MS) {
    return {
      shouldFetch: false,
      reason: 'displaced_cooldown_active',
      reuseTelemetry: {
        save_count: Number(pin.save_count || 0),
        repin_count: Number(pin.repin_count || 0),
        comment_count: Number(pin.comment_count || 0),
        share_count: Number(pin.share_count || 0),
        daily_save_velocity: Number(pin.daily_save_velocity || 0)
      }
    };
  }

  // Do not invalidate cache merely because save_count === 0 if the pin is verified deep-hydrated
  if (!crawlTime || isNaN(lastCrawlMs) || !isDeepHydrated || !hasRichTreasures || pin.save_count == null) {
    return { shouldFetch: true, reason: 'unhydrated_or_missing_treasures', reuseTelemetry: null };
  }

  // Self-Healing: Invalidate cache if pin creation_method is missing or degraded to generic 'pinterest_platform'
  const currentMethod = pin.creation_method || pin.method || meta.creation_method || meta.method;
  const isGenericOrMissingMethod = !currentMethod || currentMethod === 'pinterest_platform';
  if (isGenericOrMissingMethod) {
    return { shouldFetch: true, reason: 'missing_or_generic_creation_method', reuseTelemetry: null };
  }

  const lastCrawlDateStr = new Date(lastCrawlMs).toISOString().slice(0, 10);
  const currentUtcDateStr = new Date(currentUtcTimestamp).toISOString().slice(0, 10);
  const isSameCalendarDay = (lastCrawlDateStr === currentUtcDateStr);

  // 1. Hard Cooldown: Under 4 hours, preserve known saves so pins_daily_metrics is never dropped
  if (elapsedMs < HARD_COOLDOWN_MS) {
    if (!isSameCalendarDay) {
      return {
        shouldFetch: false,
        reason: 'hard_cooldown_cross_midnight_preserve_metrics',
        reuseTelemetry: {
          save_count: Number(pin.save_count || 0),
          repin_count: Number(pin.repin_count || 0),
          comment_count: Number(pin.comment_count || 0),
          share_count: Number(pin.share_count || 0),
          daily_save_velocity: 0
        }
      };
    }
    return {
      shouldFetch: false,
      reason: 'hard_cooldown_under_4h',
      reuseTelemetry: {
        save_count: Number(pin.save_count || 0),
        repin_count: Number(pin.repin_count || 0),
        comment_count: Number(pin.comment_count || 0),
        share_count: Number(pin.share_count || 0),
        daily_save_velocity: Number(pin.daily_save_velocity || 0)
      }
    };
  }

  // 2. Same-Day Cache: If within same calendar day and under 18 hours
  if (isSameCalendarDay && elapsedMs < MAX_SAME_DAY_TTL_MS) {
    return {
      shouldFetch: false,
      reason: 'fresh_same_day_cache',
      reuseTelemetry: {
        save_count: Number(pin.save_count),
        repin_count: Number(pin.repin_count || 0),
        comment_count: Number(pin.comment_count || 0),
        share_count: Number(pin.share_count || 0),
        daily_save_velocity: Number(pin.daily_save_velocity || 0)
      }
    };
  }

  return { shouldFetch: true, reason: 'stale_or_new_day', reuseTelemetry: null };
}

/**
 * Deep Closeup Inspection for a single pin entity (In-Memory Enrichment, Zero DB writes)
 */
async function inspectPin(pin, kw) {
  if (circuitBroken) return null;

  // Hydration Guard Check: Zero network requests if pin was hydrated recently
  const guard = evaluateHydrationGuard(pin);
  if (!guard.shouldFetch && guard.reuseTelemetry) {
    return {
      pin_id: pin.pin_id,
      creator_username: pin.creator_username || '',
      board_name: pin.board_name || '',
      board_slug: pin.board_name ? pin.board_name.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '',
      title: pin.title,
      domain: pin.domain,
      destination_url: pin.destination_url,
      image_url: pin.image_url,
      description: pin.description || '',
      alt_text: pin.alt_text || '',
      dominant_color: pin.dominant_color || '#888888',
      visual_annotations: pin.visual_annotations || [],
      method: pin.creation_method || pin.method || 'pinterest_platform',
      creation_method: pin.creation_method || pin.method || 'pinterest_platform',
      created_at_pinterest: pin.created_at_pinterest || null,
      created_at: pin.created_at_pinterest || null,
      save_count: guard.reuseTelemetry.save_count,
      repin_count: guard.reuseTelemetry.repin_count,
      comment_count: guard.reuseTelemetry.comment_count,
      share_count: guard.reuseTelemetry.share_count,
      daily_save_velocity: guard.reuseTelemetry.daily_save_velocity,
      rank_position: pin.rank_position,
      catalog_rank: pin.catalog_rank || pin.rank_position,
      last_known_rank: pin.last_known_rank,
      is_displaced: Boolean(pin.is_displaced),
      keyword_id: pin.keyword_id || kw?.id || null,
      is_deleted: false,
      from_hydration_cache: true,
      extra_meta: (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : (pin.extra_meta || {})
    };
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
    meta.is_deep_hydrated === true ||
    meta.is_deep_hydrated === 'true' ||
    (pin.creation_method && pin.creation_method !== 'pinterest_platform')
  );

  // Use 3KB JSON PinResource fast path for Displaced Vault pins & already-hydrated pins
  const isTelemetryOnly = Boolean(pin.is_displaced || wasDeepHydrated);

  let detail = null;
  let isDead = false;
  let fetchError = null;
  let fetchRes = null;

  try {
    fetchRes = await fetchPinHybrid(pin.pin_id, { isTelemetryOnly, cookie });
    const isConfirmedDead = fetchRes?.status === 404 || String(fetchRes?.error || '').includes('404');
    const isRateLimited = fetchRes?.status === 429 || fetchRes?.code === 429 || String(fetchRes?.error || '').includes('429');
    if (!fetchRes?.ok && !isConfirmedDead && !isRateLimited) {
      const retryJitter = 500 + Math.floor(Math.random() * 600);
      await new Promise(r => setTimeout(r, retryJitter));
      fetchRes = await fetchPinFromPinterest(pin.pin_id, cookie);
    }
  } catch (err) {
    fetchError = err;
    const isConfirmedDead = String(err.message || '').includes('404');
    const isRateLimited = String(err.message || '').includes('429');
    if (!isConfirmedDead && !isRateLimited) {
      const retryJitter = 500 + Math.floor(Math.random() * 600);
      await new Promise(r => setTimeout(r, retryJitter));
      try {
        fetchRes = await fetchPinFromPinterest(pin.pin_id, cookie);
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

  if (fetchRes?.ok && fetchRes.pin) {
    detail = fetchRes.pin;
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
  const usedFastPath = Boolean(fetchRes?.fastPath);
  const minJitter = usedFastPath ? SLEEP_MS_MIN : Math.max(900, SLEEP_MS_MIN);
  const maxJitter = usedFastPath ? SLEEP_MS_MAX : Math.max(1400, SLEEP_MS_MAX);
  const jitter = minJitter + Math.floor(Math.random() * Math.max(1, maxJitter - minJitter));
  await new Promise(r => setTimeout(r, jitter));

  if (consecutiveErrors >= CIRCUIT_BREAKER_LIMIT) {
    circuitBroken = true;
    console.error(`    [CIRCUIT BREAKER] Hit ${CIRCUIT_BREAKER_LIMIT} consecutive errors. Halting inspection.`);
    return null;
  }

  if (!detail && !isDead) {
    return null;
  }

  const detailSaves = Math.max(Number(detail?.saves || 0), Number(detail?.save_count || 0));
  const rawAuthenticSaves = (!wasDeepHydrated && detailSaves > 0)
    ? detailSaves
    : Math.max(Number(pin.save_count || 0), detailSaves);
  const authenticRepins = Math.max(
    Number(pin.repin_count || 0),
    Number(detail?.repins || 0),
    Number(detail?.repin_count || 0)
  );
  // Physical Invariant: Total saves must always be at least verified repin count
  const authenticSaves = Math.max(rawAuthenticSaves, authenticRepins);
  const authenticComments = Number(detail?.comments || detail?.comment_count || 0);
  const authenticShares = Number(detail?.shares || detail?.share_count || 0);

  // Live Velocity Delta Generation (Immunized against Phase 1A -> Phase 1B same-day zeroing):
  const hasExplicitBaseline = (pin.baseline_day_saves != null && Number(pin.baseline_day_saves) > 0);
  const baselineSaves = hasExplicitBaseline
    ? Number(pin.baseline_day_saves)
    : Number(pin.save_count || 0);
  let computedVelocity = Number(pin.daily_save_velocity || 0);

  if (detail && authenticSaves >= baselineSaves) {
    const rawDelta = authenticSaves - baselineSaves;
    const baseDateRaw = pin.baseline_day_date || pin.crawled_at || pin.metadata?.crawled_at || null;
    if (rawDelta > 0 && baseDateRaw) {
      computedVelocity = calculateDailyVelocity({
        currentSaves: authenticSaves,
        baselineSaves,
        currentDate: new Date(),
        baselineDate: baseDateRaw,
        createdAt: pin.created_at_pinterest || detail?.created_at || detail?.createdAt || null,
        maxCap: 25000
      });
    } else if (rawDelta === 0 && baseDateRaw) {
      const parsedBase = new Date(baseDateRaw);
      const parsedUpdated = pin.updated_at ? new Date(pin.updated_at) : null;
      const todayIso = new Date().toISOString().slice(0, 10);
      const updatedToday = parsedUpdated && !isNaN(parsedUpdated.getTime()) && parsedUpdated.toISOString().slice(0, 10) === todayIso;
      // Never zero out velocity if the pin was already updated today during Phase 1A SERP harvest!
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
  const dominantColor = detail?.dominant_color || detail?.dominantColor || pin.dominant_color || '#888888';
  const creator = detail?.pinner?.username || detail?.creator_username || pin.creator_username || '';
  const board = detail?.board?.name || pin.board_name || '';
  const method = detail?.method || detail?.creation_method || pin.creation_method || pin.method || pin.metadata?.method || 'pinterest_platform';
  const createdAtPinterest = detail?.created_at_pinterest || detail?.created_at || pin.created_at_pinterest || pin.created_at || null;

  let rawNewAnnotations = [];
  if (detail?.annotations && Array.isArray(detail.annotations) && detail.annotations.length > 0) {
    rawNewAnnotations = detail.annotations.map(a => typeof a === 'string' ? a : (a.name || a.label || ''));
  } else if (detail?.tags && Array.isArray(detail.tags)) {
    rawNewAnnotations = detail.tags;
  } else if (detail?.pinJoin?.visualAnnotation) {
    rawNewAnnotations = detail.pinJoin.visualAnnotation;
  }

  const cleanNewAnnotations = rawNewAnnotations
    .map(s => String(s || '').trim())
    .filter(s => s.length >= 2 && !s.toLowerCase().includes('not-given') && !s.toLowerCase().includes('not given'));

  let rawExistingAnnotations = [];
  if (Array.isArray(pin.visual_annotations)) {
    rawExistingAnnotations = pin.visual_annotations;
  } else if (typeof pin.visual_annotations === 'string' && pin.visual_annotations.trim()) {
    try {
      const parsed = JSON.parse(pin.visual_annotations);
      rawExistingAnnotations = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      rawExistingAnnotations = [];
    }
  }
  const cleanExistingAnnotations = rawExistingAnnotations
    .map(s => String(s || '').trim())
    .filter(s => s.length >= 2 && !s.toLowerCase().includes('not-given') && !s.toLowerCase().includes('not given'));

  const mergedTagsSet = new Set();
  for (const t of cleanExistingAnnotations) mergedTagsSet.add(t);
  for (const t of cleanNewAnnotations) mergedTagsSet.add(t);
  const finalAnnotations = Array.from(mergedTagsSet).slice(0, 15);

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
    repin_count: authenticRepins,
    comment_count: authenticComments,
    share_count: authenticShares,
    daily_save_velocity: computedVelocity,
    rank_position: pin.rank_position,
    keyword_id: pin.keyword_id || kw?.id || null,
    is_deleted: isDead,
    from_hydration_cache: false,
    extra_meta: extraMeta
  };
}

/**
 * Atomic Multi-Recordset Batch Flush to Central Metadata Hub
 * Replaces N individual roundtrips with 2 atomic set-based PostgreSQL queries.
 */
/**
 * Atomic Multi-Recordset Batch Flush to Central Metadata Hub
 * Supports single-keyword, folder cluster, and global fleet cross-keyword fan-out in 2 atomic SQL queries.
 */
async function flushBatchToHub(pinsChunk, kw) {
  if (!pinsChunk || pinsChunk.length === 0) return;
  const isFolder = Boolean(kw?.folder_id);
  const isGlobalFleet = Boolean(kw?.is_global_fleet && Array.isArray(kw?.all_keyword_ids) && kw.all_keyword_ids.length > 0);

  const payloadJson = JSON.stringify(pinsChunk.map(p => {
    const rawMeta = (p.extra_meta && typeof p.extra_meta === 'object') ? p.extra_meta : {};
    const imgSig = rawMeta.image_signature ? String(rawMeta.image_signature).trim() : null;
    const canId = rawMeta.canonical_pin_id ? String(rawMeta.canonical_pin_id).trim() : null;
    let bCount = null;
    if (rawMeta.board_pin_count != null && !isNaN(Number(rawMeta.board_pin_count))) {
      bCount = Number(rawMeta.board_pin_count);
    }
    return {
      pin_id: String(p.pin_id),
      authentic_saves: Number(p.save_count || 0),
      authentic_repins: Number(p.repin_count || 0),
      authentic_comments: Number(p.comment_count || 0),
      authentic_shares: Number(p.share_count || 0),
      daily_save_velocity: Number(p.daily_save_velocity || 0),
      from_hydration_cache: Boolean(p.from_hydration_cache),
      creator: String(p.creator_username || ''),
      board: String(p.board_name || ''),
      dominant_color: String(p.dominant_color || '#888888'),
      created_at_pinterest: p.created_at_pinterest || null,
      method: String(p.creation_method || p.method || 'pinterest_platform'),
      is_dead: Boolean(p.is_deleted),
      visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
      image_sig: imgSig || null,
      canonical_pin_id: canId || null,
      board_pin_count: bCount
    };
  }));

  if (isGlobalFleet) {
    await sql`
      UPDATE keyword_serp_current ksc
      SET 
        save_count = CASE
          WHEN NOT u.from_hydration_cache AND NOT u.is_dead AND u.authentic_saves > 0 AND COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, false) = false
          THEN u.authentic_saves::bigint
          ELSE GREATEST(ksc.save_count, u.authentic_saves::bigint)
        END,
        repin_count = GREATEST(ksc.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(COALESCE(ksc.comment_count, 0), u.authentic_comments::int),
        share_count = GREATEST(COALESCE(ksc.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN NOT u.from_hydration_cache AND u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          WHEN u.daily_save_velocity IS NOT NULL 
           AND (u.daily_save_velocity > 0 OR COALESCE((ksc.crawled_at AT TIME ZONE 'UTC')::date, ksc.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN u.daily_save_velocity::numeric
          ELSE COALESCE(ksc.daily_save_velocity, 0)
        END,
        creator_username = CASE WHEN u.creator <> '' THEN u.creator ELSE ksc.creator_username END,
        board_name = CASE WHEN u.board <> '' THEN u.board ELSE ksc.board_name END,
        dominant_color = CASE WHEN u.dominant_color <> '' THEN u.dominant_color ELSE ksc.dominant_color END,
        created_at_pinterest = CASE WHEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz IS NOT NULL THEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz ELSE ksc.created_at_pinterest END,
        creation_method = CASE
          WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
          ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
        END,
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        visual_annotations = CASE 
          WHEN jsonb_typeof(u.visual_annotations) = 'array' AND jsonb_array_length(u.visual_annotations) > 0 
          THEN u.visual_annotations 
          ELSE ksc.visual_annotations 
        END,
        metadata = ((CASE WHEN jsonb_typeof(ksc.metadata) = 'object' THEN ksc.metadata ELSE '{}'::jsonb END) - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests' - 'share_count' - 'dominant_color' - 'board_name') || jsonb_strip_nulls(jsonb_build_object(
          'creation_method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'is_deleted', u.is_dead::boolean,
          'is_deep_hydrated', CASE WHEN u.from_hydration_cache THEN COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, true) ELSE TRUE END,
          'has_treasures', TRUE,
          'status', CASE WHEN u.is_dead THEN 'archived_404' ELSE 'active' END,
          'image_signature', NULLIF(COALESCE(u.image_sig, ksc.metadata->>'image_signature'), ''),
          'canonical_pin_id', NULLIF(COALESCE(u.canonical_pin_id, ksc.metadata->>'canonical_pin_id'), ''),
          'board_pin_count', COALESCE(u.board_pin_count, (ksc.metadata->>'board_pin_count')::int)
        )),
        crawled_at = CASE WHEN u.from_hydration_cache THEN ksc.crawled_at ELSE NOW() END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean,
        creator text,
        board text,
        dominant_color text,
        created_at_pinterest text,
        method text,
        is_dead boolean,
        visual_annotations jsonb,
        image_sig text,
        canonical_pin_id text,
        board_pin_count int
      )
      WHERE ksc.pin_id = u.pin_id
        AND ksc.keyword_id = ANY(${kw.all_keyword_ids});
    `;

    await sql`
      UPDATE keyword_displaced_index kdi
      SET
        save_count = GREATEST(kdi.save_count, u.authentic_saves::bigint),
        repin_count = GREATEST(kdi.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(kdi.comment_count, u.authentic_comments::int),
        share_count = GREATEST(COALESCE(kdi.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          ELSE kdi.daily_save_velocity 
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean
      )
      WHERE kdi.pin_id = u.pin_id
        AND kdi.keyword_id = ANY(${kw.all_keyword_ids});
    `.catch(err => {
      console.warn('[DisplacedIndex] Global fleet kdi update warning:', err.message);
    });
  } else if (isFolder) {
    await sql`
      UPDATE keyword_serp_current ksc
      SET 
        save_count = CASE
          WHEN NOT u.from_hydration_cache AND NOT u.is_dead AND u.authentic_saves > 0 AND COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, false) = false
          THEN u.authentic_saves::bigint
          ELSE GREATEST(ksc.save_count, u.authentic_saves::bigint)
        END,
        repin_count = GREATEST(ksc.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(COALESCE(ksc.comment_count, 0), u.authentic_comments::int),
        share_count = GREATEST(COALESCE(ksc.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN NOT u.from_hydration_cache AND u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          WHEN u.daily_save_velocity IS NOT NULL 
           AND (u.daily_save_velocity > 0 OR COALESCE((ksc.crawled_at AT TIME ZONE 'UTC')::date, ksc.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN u.daily_save_velocity::numeric
          ELSE COALESCE(ksc.daily_save_velocity, 0)
        END,
        creator_username = CASE WHEN u.creator <> '' THEN u.creator ELSE ksc.creator_username END,
        board_name = CASE WHEN u.board <> '' THEN u.board ELSE ksc.board_name END,
        dominant_color = CASE WHEN u.dominant_color <> '' THEN u.dominant_color ELSE ksc.dominant_color END,
        created_at_pinterest = CASE WHEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz IS NOT NULL THEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz ELSE ksc.created_at_pinterest END,
        creation_method = CASE
          WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
          ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
        END,
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        visual_annotations = CASE 
          WHEN jsonb_typeof(u.visual_annotations) = 'array' AND jsonb_array_length(u.visual_annotations) > 0 
          THEN u.visual_annotations 
          ELSE ksc.visual_annotations 
        END,
        metadata = ((CASE WHEN jsonb_typeof(ksc.metadata) = 'object' THEN ksc.metadata ELSE '{}'::jsonb END) - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests' - 'share_count' - 'dominant_color' - 'board_name') || jsonb_strip_nulls(jsonb_build_object(
          'creation_method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'is_deleted', u.is_dead::boolean,
          'is_deep_hydrated', CASE WHEN u.from_hydration_cache THEN COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, true) ELSE TRUE END,
          'has_treasures', TRUE,
          'status', CASE WHEN u.is_dead THEN 'archived_404' ELSE 'active' END,
          'image_signature', NULLIF(COALESCE(u.image_sig, ksc.metadata->>'image_signature'), ''),
          'canonical_pin_id', NULLIF(COALESCE(u.canonical_pin_id, ksc.metadata->>'canonical_pin_id'), ''),
          'board_pin_count', COALESCE(u.board_pin_count, (ksc.metadata->>'board_pin_count')::int)
        )),
        crawled_at = CASE WHEN u.from_hydration_cache THEN ksc.crawled_at ELSE NOW() END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean,
        creator text,
        board text,
        dominant_color text,
        created_at_pinterest text,
        method text,
        is_dead boolean,
        visual_annotations jsonb,
        image_sig text,
        canonical_pin_id text,
        board_pin_count int
      )
      WHERE ksc.pin_id = u.pin_id
        AND ksc.keyword_id IN (
          SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${kw.folder_id}
        );
    `;

    await sql`
      UPDATE keyword_displaced_index kdi
      SET
        save_count = GREATEST(kdi.save_count, u.authentic_saves::bigint),
        repin_count = GREATEST(kdi.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(kdi.comment_count, u.authentic_comments::int),
        share_count = GREATEST(COALESCE(kdi.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          ELSE kdi.daily_save_velocity 
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean
      )
      WHERE kdi.pin_id = u.pin_id
        AND kdi.keyword_id IN (
          SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${kw.folder_id}
        );
    `.catch(err => {
      console.warn('[DisplacedIndex] Folder kdi update warning:', err.message);
    });
  } else {
    await sql`
      UPDATE keyword_serp_current ksc
      SET 
        save_count = CASE
          WHEN NOT u.from_hydration_cache AND NOT u.is_dead AND u.authentic_saves > 0 AND COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, false) = false
          THEN u.authentic_saves::bigint
          ELSE GREATEST(ksc.save_count, u.authentic_saves::bigint)
        END,
        repin_count = GREATEST(ksc.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(COALESCE(ksc.comment_count, 0), u.authentic_comments::int),
        share_count = GREATEST(COALESCE(ksc.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN NOT u.from_hydration_cache AND u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          WHEN u.daily_save_velocity IS NOT NULL 
           AND (u.daily_save_velocity > 0 OR COALESCE((ksc.crawled_at AT TIME ZONE 'UTC')::date, ksc.baseline_day_date) < (NOW() AT TIME ZONE 'UTC')::date)
          THEN u.daily_save_velocity::numeric
          ELSE COALESCE(ksc.daily_save_velocity, 0)
        END,
        creator_username = CASE WHEN u.creator <> '' THEN u.creator ELSE ksc.creator_username END,
        board_name = CASE WHEN u.board <> '' THEN u.board ELSE ksc.board_name END,
        dominant_color = CASE WHEN u.dominant_color <> '' THEN u.dominant_color ELSE ksc.dominant_color END,
        created_at_pinterest = CASE WHEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz IS NOT NULL THEN NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz ELSE ksc.created_at_pinterest END,
        creation_method = CASE
          WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
          ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
        END,
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(ksc.last_known_rank, ksc.rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        visual_annotations = CASE 
          WHEN jsonb_typeof(u.visual_annotations) = 'array' AND jsonb_array_length(u.visual_annotations) > 0 
          THEN u.visual_annotations 
          ELSE ksc.visual_annotations 
        END,
        metadata = ((CASE WHEN jsonb_typeof(ksc.metadata) = 'object' THEN ksc.metadata ELSE '{}'::jsonb END) - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests' - 'share_count' - 'dominant_color' - 'board_name') || jsonb_strip_nulls(jsonb_build_object(
          'creation_method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'method', CASE
            WHEN u.method <> '' AND LOWER(TRIM(u.method)) <> 'pinterest_platform' THEN u.method
            ELSE COALESCE(NULLIF(ksc.creation_method, ''), u.method, 'pinterest_platform')
          END,
          'is_deleted', u.is_dead::boolean,
          'is_deep_hydrated', CASE WHEN u.from_hydration_cache THEN COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, true) ELSE TRUE END,
          'has_treasures', TRUE,
          'status', CASE WHEN u.is_dead THEN 'archived_404' ELSE 'active' END,
          'image_signature', NULLIF(COALESCE(u.image_sig, ksc.metadata->>'image_signature'), ''),
          'canonical_pin_id', NULLIF(COALESCE(u.canonical_pin_id, ksc.metadata->>'canonical_pin_id'), ''),
          'board_pin_count', COALESCE(u.board_pin_count, (ksc.metadata->>'board_pin_count')::int)
        )),
        crawled_at = CASE WHEN u.from_hydration_cache THEN ksc.crawled_at ELSE NOW() END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean,
        creator text,
        board text,
        dominant_color text,
        created_at_pinterest text,
        method text,
        is_dead boolean,
        visual_annotations jsonb,
        image_sig text,
        canonical_pin_id text,
        board_pin_count int
      )
      WHERE ksc.pin_id = u.pin_id AND ksc.keyword_id = ${kw.id};
    `;

    await sql`
      UPDATE keyword_displaced_index kdi
      SET
        save_count = GREATEST(kdi.save_count, u.authentic_saves::bigint),
        repin_count = GREATEST(kdi.repin_count, u.authentic_repins::int),
        comment_count = GREATEST(kdi.comment_count, u.authentic_comments::int),
        share_count = GREATEST(COALESCE(kdi.share_count, 0), u.authentic_shares::int),
        daily_save_velocity = CASE 
          WHEN u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric
          ELSE kdi.daily_save_velocity 
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric,
        from_hydration_cache boolean
      )
      WHERE kdi.pin_id = u.pin_id AND kdi.keyword_id = ${kw.id};
    `.catch(err => {
      console.warn('[DisplacedIndex] Single kw kdi update warning:', err.message);
    });
  }
}

async function inspectAndSyncPin(pin, kw) {
  const enriched = await inspectPin(pin, kw);
  if (enriched) {
    await flushBatchToHub([enriched], kw).catch(err => {
      console.warn('    [inspectAndSyncPin Flush Warning]:', err.message);
    });
  }
  return enriched;
}

/**
 * Flush enriched pin records across the 99 Neon Storage Shards
 * Includes LATERAL historical baseline lookup on pins_daily_metrics to guarantee authentic Vault velocity.
 */
async function flushToStorageShards(enrichedPins) {
  if (!enrichedPins || enrichedPins.length === 0) return 0;
  await preloadNeonRegistry(sql);
  const shardGroups = batchGroupByShard(enrichedPins, 99);
  let shardsSynchronized = 0;

  const shardEntries = Array.from(shardGroups.entries());
  const SHARD_CONCURRENCY = 10;

  for (let i = 0; i < shardEntries.length; i += SHARD_CONCURRENCY) {
    const chunk = shardEntries.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async ([shardId, shardPins]) => {
        try {
          const syncTask = (async () => {
            const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
            const sortedPins = [...shardPins].sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
            const sanitizeShardMeta = (raw) => {
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

            const shardPayload = JSON.stringify(sortedPins.map(sp => {
              const rawMeta = (sp.extra_meta && typeof sp.extra_meta === 'object') ? sp.extra_meta : (sp.metadata || {});
              const methodVal = sp.creation_method || sp.method || rawMeta.creation_method || rawMeta.method || 'pinterest_platform';
              const enrichedShardMeta = sanitizeShardMeta({
                ...rawMeta,
                creation_method: methodVal,
                method: methodVal
              });
              return {
                pin_id: String(sp.pin_id),
                creator_username: String(sp.creator_username || ''),
                board_name: String(sp.board_name || ''),
                board_slug: String(sp.board_slug || ''),
                title: String(sp.title || ''),
                domain: String(sp.domain || ''),
                destination_url: String(sp.destination_url || ''),
                image_url: String(sp.image_url || ''),
                description: String(sp.description || ''),
                alt_text: String(sp.alt_text || ''),
                dominant_color: String(sp.dominant_color || '#888888'),
                visual_annotations: sp.visual_annotations || [],
                created_at_pinterest: sp.created_at_pinterest ? new Date(sp.created_at_pinterest).toISOString() : null,
                metadata: enrichedShardMeta,
                keyword_id: Number(sp.keyword_id || 0),
                rank_position: sp.rank_position ? Number(sp.rank_position) : null,
                save_count: sp.save_count != null ? Number(sp.save_count) : null,
                repin_count: sp.repin_count != null ? Number(sp.repin_count) : null,
                comment_count: sp.comment_count != null ? Number(sp.comment_count) : null,
                share_count: sp.share_count != null ? Number(sp.share_count) : null,
                daily_save_velocity: sp.daily_save_velocity != null ? Number(sp.daily_save_velocity) : null,
                is_displaced: Boolean(sp.is_displaced),
                last_known_rank: sp.last_known_rank ? Number(sp.last_known_rank) : null,
                catalog_rank: sp.catalog_rank ? Number(sp.catalog_rank) : (sp.rank_position ? Number(sp.rank_position) : null)
              };
            }));

            // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
            // [INVARIANT: ZERO-HUB-SNAPSHOTS]
            // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
            // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
            const buildQ1 = (db) => db`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, board_slug, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
                first_discovered_pillar, first_discovered_at, updated_at
              )
              SELECT DISTINCT ON (u.pin_id)
                u.pin_id, u.creator_username, u.board_name, u.board_slug, u.title, u.domain, u.destination_url,
                u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations, NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.metadata,
                'keyword', NOW(), NOW()
              FROM jsonb_to_recordset(${shardPayload}::jsonb) AS u(
                pin_id text, creator_username text, board_name text, board_slug text, title text, domain text,
                destination_url text, image_url text, description text, alt_text text, dominant_color text,
                visual_annotations jsonb, created_at_pinterest text, metadata jsonb
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
                metadata = (CASE WHEN jsonb_typeof(universal_master_pins.metadata) = 'object' THEN universal_master_pins.metadata ELSE '{}'::jsonb END)
                  || jsonb_strip_nulls(COALESCE(EXCLUDED.metadata, '{}'::jsonb))
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

            const buildQ2 = (db) => db`
              WITH raw_batch AS (
                SELECT * FROM jsonb_to_recordset(${shardPayload}::jsonb) AS u(
                  pin_id text,
                  keyword_id int,
                  rank_position int,
                  is_displaced boolean,
                  last_known_rank int,
                  catalog_rank int,
                  save_count bigint,
                  repin_count int,
                  comment_count int,
                  share_count int,
                  daily_save_velocity numeric
                )
              ),
              dedup_metrics AS (
                SELECT 
                  rb.pin_id,
                  COALESCE(MAX(rb.save_count), 0) AS save_count,
                  COALESCE(MAX(rb.repin_count), 0) AS repin_count,
                  COALESCE(MAX(rb.comment_count), 0) AS comment_count,
                  COALESCE(MAX(rb.share_count), 0) AS share_count,
                  CASE
                    -- Symmetrical ratchet: when JS computed velocity is available, allow downward decay without monotonic GREATEST lock
                    WHEN MAX(rb.daily_save_velocity) IS NOT NULL THEN LEAST(25000::numeric, GREATEST(0::numeric, MAX(rb.daily_save_velocity)))
                    WHEN prev.save_count IS NOT NULL AND prev.snapshot_date IS NOT NULL THEN
                      -- Shield against unhydrated 0-baseline jump in SQL fallback
                      CASE
                        WHEN (COALESCE(MAX(rb.save_count), 0) - prev.save_count) > 2000
                         AND prev.save_count < 500
                         AND (prev.save_count = 0 OR (COALESCE(MAX(rb.save_count), 0)::numeric / GREATEST(1, prev.save_count)) > 20)
                        THEN 0::numeric
                        ELSE LEAST(
                          25000::numeric,
                          COALESCE(
                            ROUND(
                              GREATEST(0, COALESCE(MAX(rb.save_count), 0) - prev.save_count)::numeric
                              / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date))
                            , 2),
                            0::numeric
                          )
                        )
                      END
                    ELSE 0::numeric
                  END AS daily_save_velocity
                FROM raw_batch rb
                LEFT JOIN LATERAL (
                  SELECT pm.save_count, pm.snapshot_date
                  FROM pins_daily_metrics pm
                  WHERE pm.pin_id = rb.pin_id
                    AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
                  ORDER BY pm.snapshot_date DESC
                  LIMIT 1
                ) prev ON TRUE
                GROUP BY rb.pin_id, prev.save_count, prev.snapshot_date
              ),
              upsert_metrics AS (
                INSERT INTO pins_daily_metrics (
                  pin_id, snapshot_date, save_count, repin_count, comment_count,
                  share_count, daily_save_velocity, updated_at
                )
                SELECT 
                  pin_id,
                  (NOW() AT TIME ZONE 'UTC')::date,
                  save_count,
                  repin_count,
                  comment_count,
                  share_count,
                  daily_save_velocity,
                  NOW()
                FROM dedup_metrics
                ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                  save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
                  repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
                  comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
                  share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
                  daily_save_velocity = CASE
                    WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
                    ELSE pins_daily_metrics.daily_save_velocity
                  END,
                  updated_at = NOW()
                RETURNING pin_id
              ),
              dedup_positions AS (
                SELECT DISTINCT ON (pin_id, keyword_id)
                  pin_id,
                  keyword_id,
                  rank_position,
                  is_displaced,
                  last_known_rank,
                  catalog_rank
                FROM raw_batch
                WHERE keyword_id IS NOT NULL AND keyword_id > 0
                ORDER BY pin_id ASC, keyword_id ASC, rank_position ASC NULLS LAST
              )
              INSERT INTO pin_serp_positions (
                pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
                last_known_rank, catalog_rank, updated_at
              )
              SELECT 
                pin_id,
                (NOW() AT TIME ZONE 'UTC')::date,
                keyword_id,
                rank_position,
                COALESCE(is_displaced, FALSE) as is_displaced,
                last_known_rank,
                catalog_rank,
                NOW()
              FROM dedup_positions
              ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
                rank_position = CASE WHEN EXCLUDED.is_displaced = TRUE THEN NULL ELSE EXCLUDED.rank_position END,
                is_displaced = COALESCE(EXCLUDED.is_displaced, FALSE),
                last_known_rank = COALESCE(EXCLUDED.last_known_rank, pin_serp_positions.last_known_rank),
                catalog_rank = COALESCE(EXCLUDED.catalog_rank, pin_serp_positions.catalog_rank),
                updated_at = NOW();
            `;

            if (typeof shardSql.begin === 'function') {
              await shardSql.begin(async (tx) => {
                await buildQ1(tx);
                await buildQ2(tx);
              });
            } else if (typeof shardSql.transaction === 'function') {
              await shardSql.transaction([
                buildQ1(shardSql),
                buildQ2(shardSql)
              ]);
            } else {
              await buildQ1(shardSql);
              await buildQ2(shardSql);
            }
          })();

          let timerId;
          const timeoutTask = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error(`Shard #${shardId} cold-start connection timeout (10000ms limit)`)), 10000);
          });

          syncTask.catch(() => {});

          try {
            await Promise.race([syncTask, timeoutTask]);
            shardsSynchronized++;
          } finally {
            if (timerId) clearTimeout(timerId);
          }
        } catch (shardErr) {
          console.warn(`    [Shard ${shardId} Non-Blocking Guard] Shard write deferred: ${shardErr.message}`);
        }
      })
    );
  }

  return shardsSynchronized;
}

/**
 * Guarantees 100% of candidate SERP pins are offloaded to the 99 Storage Shards
 * even if individual live closeup requests are deferred during Stage 2.
 */
function buildShardSyncList(candidatePins, enrichedPins, defaultKeywordId = null) {
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
    const basePin = enriched ? { ...enriched } : {
      pin_id: pid,
      creator_username: cp.creator_username || cp.metadata?.pinner?.username || '',
      board_name: cp.board_name || cp.metadata?.board_name || '',
      board_slug: (cp.board_name || cp.metadata?.board_name || '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'),
      title: cp.title || '',
      domain: cp.domain || '',
      destination_url: cp.destination_url || '',
      image_url: cp.image_url || '',
      description: cp.description || '',
      alt_text: cp.metadata?.alt_text || '',
      dominant_color: cp.dominant_color || '#888888',
      visual_annotations: Array.isArray(cp.visual_annotations) ? cp.visual_annotations : [],
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
      save_count: cp.save_count != null ? Number(cp.save_count) : 0,
      repin_count: cp.repin_count != null ? Number(cp.repin_count) : 0,
      comment_count: cp.comment_count != null ? Number(cp.comment_count) : 0,
      share_count: cp.share_count != null ? Number(cp.share_count) : 0,
      daily_save_velocity: cp.daily_save_velocity != null ? Number(cp.daily_save_velocity) : 0
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
 * Concurrently inspect an array of pins using Semaphore and batch flush to Hub
 */
async function inspectPinsConcurrently(pins, kw, label = 'Worker') {
  if (!pins || pins.length === 0) return [];
  const sem = new Semaphore(CONCURRENCY);
  const enrichedPins = [];
  let currentBatch = [];
  let completedCount = 0;
  const total = pins.length;
  let jitPrewarmFired = false;

  console.log(`  [*] ${label}: Inspecting ${total} pins with Concurrency: ${CONCURRENCY}, Hub Batch: ${BATCH_SIZE}...`);

  const flushHubBatchSafe = async (chunk) => {
    if (!chunk || chunk.length === 0) return;
    try {
      await flushBatchToHub(chunk, kw);
    } catch (err) {
      console.warn(`    [Hub Batch Flush Warning]:`, err.message);
    }
  };

  const pool = pins.map((p) => sem.run(async () => {
    if (circuitBroken) return;
    try {
      const enriched = await inspectPin(p, kw);
      if (enriched) {
        enrichedPins.push(enriched);
        currentBatch.push(enriched);
        if (currentBatch.length >= BATCH_SIZE) {
          const chunkToFlush = currentBatch;
          currentBatch = [];
          await flushHubBatchSafe(chunkToFlush);
        }
      }
    } catch (err) {
      console.warn(`    [!] Pin #${p.pin_id} inspect error:`, err.message);
    } finally {
      completedCount++;
      if (!jitPrewarmFired && total >= 1 && (completedCount / total) >= 0.8) {
        jitPrewarmFired = true;
        // JIT Pre-warming pulse (SELECT 1) across target shards 3-5s before flushToStorageShards
        const targetShardIds = new Set();
        for (const targetPin of pins) {
          if (targetPin && targetPin.pin_id && /^(?:\d+|e1_[A-Za-z0-9_-]+)$/.test(String(targetPin.pin_id))) {
            const sid = getPinShardId(targetPin.pin_id, 99);
            targetShardIds.add(sid);
          }
        }
        if (targetShardIds.size > 0) {
          (async () => {
            try {
              await preloadNeonRegistry(sql);
              await Promise.allSettled(Array.from(targetShardIds).map(async (shardId) => {
                try {
                  const prewarmSql = await resolveShardConnection({ hubSql: sql, shardId });
                  await prewarmSql`SELECT 1;`;
                } catch (_) {}
              }));
            } catch (_) {}
          })().catch(() => {});
        }
      }
      if (completedCount % 50 === 0 || completedCount === total) {
        console.log(`  [Progress] ${label}: Inspected ${completedCount}/${total} pins (${Math.round((completedCount / total) * 100)}%)...`);
      }
    }
  }));

  await Promise.allSettled(pool);

  if (currentBatch.length > 0) {
    await flushHubBatchSafe(currentBatch);
  }

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

  // Initialize In-Crawler Keep-Alive Heartbeat (every 3.5 min / 210s) to prevent Neon compute scale-to-zero
  crawlerKeepAlive = setInterval(async () => {
    if (activeTargetShards.size === 0) return;
    const shards = Array.from(activeTargetShards);
    const chunkSem = new Semaphore(5);
    await Promise.allSettled(
      shards.map((shardId) => chunkSem.run(async () => {
        try {
          const shardConn = await resolveShardConnection({ hubSql: sql, shardId });
          await shardConn`SELECT 1;`;
        } catch (_) {}
      }))
    );
  }, 210000);
  if (typeof crawlerKeepAlive.unref === 'function') crawlerKeepAlive.unref();
  process.on('exit', () => { if (crawlerKeepAlive) clearInterval(crawlerKeepAlive); });

  if (mode === 'folder_pin_partition') {
    // =========================================================================
    // EXECUTION MODE C: FOLDER CLUSTER PIN-SLICE SHARDING
    // =========================================================================
    const fid = folderIdInput;
    if (!fid) {
      console.error(`[-] FATAL: FOLDER_ID is required for folder_pin_partition.`);
      process.exit(1);
    }

    const [folderRow] = await sql`
      SELECT id, name, description FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (!folderRow) {
      console.error(`[-] FATAL: Folder ${fid} not found in database.`);
      process.exit(1);
    }

    console.log(`[*] Target Folder Identified: "${folderRow.name}" (ID: ${folderRow.id})`);

    // -------------------------------------------------------------------------
    // PHASE 1A: Distributed Parallel SERP Ingestion Across 20 Egress IPs
    // -------------------------------------------------------------------------
    const runStartTime = new Date();

    if (enableSerpHarvest && keywordIdsInput.length > 0) {
      console.log(`[Phase 1A] Runner ${workerIndex + 1}/${workerTotal}: Ingesting assigned ${keywordIdsInput.length} keywords in parallel...`);
      for (const kid of keywordIdsInput) {
        try {
          console.log(`  [*] [Phase 1A] Harvesting SERP for Keyword ID ${kid}...`);
          const res = await crawlKeywordSERP(sql, kid, {
            cookie,
            max_serp_pins: maxSerpPins,
            skip_top_enrich: true,
            force: true
          });
          console.log(`  [+] [Phase 1A] Keyword ID ${kid} SERP harvest complete:`, res?.pins_collected || res?.total_pins_processed || 'OK');
        } catch (err) {
          console.warn(`  [!] [Phase 1A] Keyword ID ${kid} SERP error:`, err.message);
        } finally {
          // Failure-Immune Barrier Sync Guard: Always stamp updated_at so failure or incomplete crawl never blocks cluster barrier
          await sql`
            UPDATE tracked_keywords
            SET updated_at = NOW(),
                crawl_lease_token = NULL,
                crawl_lease_until = NULL
            WHERE id = ${kid};
          `.catch(() => {});
        }
      }
    } else if (!enableSerpHarvest) {
      console.log(`[Phase 1A] SERP harvest disabled via ENABLE_SERP_HARVEST=false. Skipping directly to Phase 1B.`);
    } else {
      console.log(`[Phase 1A] No keywords assigned to this runner. Waiting for peers at barrier sync...`);
    }

    // Lightweight Barrier Sync: Wait for peer runners to complete parallel SERP ingestion
    if (enableSerpHarvest) {
      console.log(`[Phase 1A] Barrier Sync: Waiting for peer runners to complete parallel SERP ingestion...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 45000;
      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [pendingRow] = await sql`
          SELECT COUNT(*)::int as pending
          FROM keyword_folder_items kfi
          JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
          WHERE kfi.folder_id = ${fid}
            AND tk.is_active = TRUE
            AND GREATEST(
              COALESCE(tk.last_crawled_at, '1970-01-01'::timestamptz),
              COALESCE(tk.updated_at, '1970-01-01'::timestamptz)
            ) < ${runStartTime};
        `;
        const pendingCount = Number(pendingRow?.pending || 0);
        if (pendingCount === 0) {
          console.log(`[Phase 1A] Barrier Sync cleared: 100% of cluster keywords ingested in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }
        console.log(`  [Phase 1A Sync] ${pendingCount} keyword(s) still harvesting SERP...`);
        await sleep(2500);
      }
      if (Date.now() - barrierStart >= BARRIER_TIMEOUT_MS) {
        console.warn(`[Phase 1A] Barrier Sync reached 45s timeout limit. Proceeding to Phase 1B with harvested catalog.`);
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Deterministic crc32(pin_id) % workerTotal Pin-Slice Deep Inspection
    // -------------------------------------------------------------------------
    // Fetch candidate pins across all folder keywords
    let allPins = [];
    if (crawlScope === 'active_serp') {
      allPins = await sql`
        WITH folder_ksc AS (
          SELECT 
            ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
            ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
            ksc.board_name, ksc.dominant_color,
            ksc.visual_annotations,
            (jsonb_typeof(ksc.visual_annotations) = 'array' AND jsonb_array_length(ksc.visual_annotations) > 0) AS has_visual_annotations,
            ksc.created_at_pinterest, ksc.creation_method,
            (ksc.metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
            COALESCE(ksc.metadata->>'image_signature', '') AS image_signature,
            jsonb_strip_nulls(jsonb_build_object(
              'is_deep_hydrated', (ksc.metadata->>'is_deep_hydrated')::boolean,
              'has_treasures', (ksc.metadata->>'has_treasures')::boolean,
              'image_signature', ksc.metadata->>'image_signature',
              'canonical_pin_id', ksc.metadata->>'canonical_pin_id',
              'board_pin_count', (ksc.metadata->>'board_pin_count')::int,
              'creation_method', COALESCE(ksc.creation_method, ksc.metadata->>'creation_method', ksc.metadata->>'method'),
              'seo_title', ksc.metadata->>'seo_title',
              'is_repin', (ksc.metadata->>'is_repin')::boolean
            )) AS metadata,
            ksc.crawled_at, ksc.updated_at, FALSE as is_displaced,
            ksc.baseline_day_saves, ksc.baseline_day_date
          FROM keyword_serp_current ksc
          JOIN keyword_folder_items kfi ON kfi.keyword_id = ksc.keyword_id
          WHERE kfi.folder_id = ${fid} AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> '' AND ksc.is_displaced = FALSE
            AND ksc.shard_id = ANY(${assignedShards}::smallint[])
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
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
          FROM folder_ksc
          GROUP BY pin_id
        )
        SELECT DISTINCT ON (f.pin_id)
          f.pin_id, f.keyword_id, f.rank_position, f.last_known_rank, f.title, f.domain, f.destination_url, f.image_url,
          f.save_count, f.repin_count, f.daily_save_velocity, f.creator_username,
          f.board_name, f.dominant_color, f.visual_annotations, f.has_visual_annotations, f.created_at_pinterest, f.creation_method,
          f.is_deep_hydrated, f.image_signature, f.metadata, f.crawled_at, f.updated_at, f.is_displaced,
          f.baseline_day_saves, f.baseline_day_date,
          ap.folder_positions
        FROM folder_ksc f
        JOIN aggregated_positions ap ON ap.pin_id = f.pin_id
        ORDER BY f.pin_id, f.rank_position ASC NULLS LAST;
      `;
    } else {
      allPins = await sql`
        WITH combined_pins AS (
          SELECT 
            ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
            ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
            ksc.board_name, ksc.dominant_color,
            ksc.visual_annotations,
            (jsonb_typeof(ksc.visual_annotations) = 'array' AND jsonb_array_length(ksc.visual_annotations) > 0) AS has_visual_annotations,
            ksc.created_at_pinterest, ksc.creation_method,
            (ksc.metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
            COALESCE(ksc.metadata->>'image_signature', '') AS image_signature,
            jsonb_strip_nulls(jsonb_build_object(
              'is_deep_hydrated', (ksc.metadata->>'is_deep_hydrated')::boolean,
              'has_treasures', (ksc.metadata->>'has_treasures')::boolean,
              'image_signature', ksc.metadata->>'image_signature',
              'canonical_pin_id', ksc.metadata->>'canonical_pin_id',
              'board_pin_count', (ksc.metadata->>'board_pin_count')::int,
              'creation_method', COALESCE(ksc.creation_method, ksc.metadata->>'creation_method', ksc.metadata->>'method'),
              'seo_title', ksc.metadata->>'seo_title',
              'is_repin', (ksc.metadata->>'is_repin')::boolean
            )) AS metadata,
            ksc.crawled_at, ksc.updated_at, ksc.is_displaced,
            ksc.baseline_day_saves, ksc.baseline_day_date
          FROM keyword_serp_current ksc
          JOIN keyword_folder_items kfi ON kfi.keyword_id = ksc.keyword_id
          WHERE kfi.folder_id = ${fid} AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
            AND ksc.shard_id = ANY(${assignedShards}::smallint[])
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
            )

          UNION ALL

          SELECT
            kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, COALESCE(kdi.domain, '') as domain, '' as destination_url, '' as image_url,
            kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
            '' as board_name, '#888888' as dominant_color, '[]'::jsonb AS visual_annotations, false AS has_visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
            false AS is_deep_hydrated, '' AS image_signature, '{}'::jsonb AS metadata,
            kdi.updated_at as crawled_at, kdi.updated_at, TRUE as is_displaced,
            NULL::bigint as baseline_day_saves, NULL::date as baseline_day_date
          FROM keyword_displaced_index kdi
          JOIN keyword_folder_items kfi ON kfi.keyword_id = kdi.keyword_id
          WHERE kfi.folder_id = ${fid} AND kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
            AND kdi.shard_id = ANY(${assignedShards}::smallint[])
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = kdi.keyword_id AND kip.pin_id = kdi.pin_id
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
          FROM combined_pins
          GROUP BY pin_id
        )
        SELECT DISTINCT ON (cp.pin_id)
          cp.pin_id, cp.keyword_id, cp.rank_position, cp.last_known_rank, cp.title, cp.domain, cp.destination_url, cp.image_url,
          cp.save_count, cp.repin_count, cp.daily_save_velocity, cp.creator_username,
          cp.board_name, cp.dominant_color, cp.visual_annotations, cp.has_visual_annotations, cp.created_at_pinterest, cp.creation_method,
          cp.is_deep_hydrated, cp.image_signature, cp.metadata, cp.crawled_at, cp.updated_at, cp.is_displaced,
          cp.baseline_day_saves, cp.baseline_day_date,
          ap.folder_positions
        FROM combined_pins cp
        JOIN aggregated_positions ap ON ap.pin_id = cp.pin_id
        ORDER BY cp.pin_id, cp.is_displaced ASC, cp.rank_position ASC NULLS LAST;
      `;
    }

    allPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    if (maxCatalogInspect > 0 && allPins.length > maxCatalogInspect) {
      console.log(`  [*] Applying max_catalog_inspect cap: ${allPins.length} -> ${maxCatalogInspect} pins`);
      allPins = allPins.slice(0, maxCatalogInspect);
    }

    // [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    const myPins = allPins.filter(p => assignedShardSet.has(getPinShardId(p.pin_id, 99)));
    myPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    registerTargetShards(myPins);
    console.log(`[*] Total Unique Folder Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
    }

    const enrichedList = await inspectPinsConcurrently(
      myPins,
      { folder_id: fid, keyword: folderRow.name },
      `Folder Slice ${workerIndex + 1}/${workerTotal}`
    );

    const shardsSynced = await flushToStorageShards(buildShardSyncList(myPins, enrichedList));
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed across ${shardsSynced} shards.`);

    const cachedCount = enrichedList.filter(p => p.from_hydration_cache).length;
    const fetchedCount = enrichedList.filter(p => !p.from_hydration_cache).length;
    const deadCount = enrichedList.filter(p => p.is_deleted).length;
    const deferredCount = myPins.length - enrichedList.length;

    if (stepSummaryPath) {
      try {
        let md = `### 📁 Folder Runner Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Folder**: \`${folderRow.name}\` (ID: ${fid})\n`;
        md += `- **Assigned Slice Pins**: **${myPins.length}**\n`;
        md += `- **Reused from Fresh Hydration Cache**: **${cachedCount}**\n`;
        md += `- **Freshly Inspected via Pinterest API**: **${fetchedCount}**\n`;
        md += `- **Deferred / Failed**: **${deferredCount}**\n`;
        md += `- **Storage Shards Synchronized**: **${shardsSynced}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    process.exit(0);

  } else if (mode === 'pin_partition') {
    // =========================================================================
    // EXECUTION MODE B: SINGLE-KEYWORD PIN-SLICE SHARDING
    // =========================================================================
    let kwRow = null;
    if (keywordIdInput) {
      [kwRow] = await sql`SELECT * FROM tracked_keywords WHERE id = ${keywordIdInput};`;
    }
    if (!kwRow && targetKeyword) {
      [kwRow] = await sql`SELECT * FROM tracked_keywords WHERE LOWER(keyword) = ${targetKeyword};`;
    }
    if (!kwRow) {
      console.error(`[-] FATAL: Keyword "${targetKeyword}" not found for pin_partition.`);
      process.exit(1);
    }

    console.log(`[*] Target Keyword Identified: "${kwRow.keyword}" (ID: ${kwRow.id})`);

    // -------------------------------------------------------------------------
    // PHASE 1A: Single-Keyword SERP Ingestion (Lead Runner Ingests, Peers Sync)
    // -------------------------------------------------------------------------
    // [INVARIANT: LND-01 CLOCK-SKEW IMMUNE BARRIER VIA LOGICAL TOKEN (OPTION B)]
    const runToken = String(
      process.env.CRAWL_RUN_ID ||
      (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}` : null) ||
      globalThis.__PAE_LOCAL_RUN_ID ||
      `run_kw_${kwRow.id}_matrix`
    );

    if (enableSerpHarvest) {
      if (workerIndex === 0) {
        console.log(`[Phase 1A] Runner 1/${workerTotal} (Lead): Ingesting SERP for "${kwRow.keyword}" (ID: ${kwRow.id})...`);
        try {
          const res = await crawlKeywordSERP(sql, kwRow.id, {
            cookie,
            max_serp_pins: maxSerpPins,
            skip_top_enrich: true,
            force: true
          });
          console.log(`[Phase 1A] Lead Runner SERP ingest complete:`, res?.pins_collected || res?.total_pins_processed || 'OK');
        } catch (err) {
          console.warn(`[Phase 1A] Lead Runner SERP error:`, err.message);
        } finally {
          // Failure-Immune Barrier Sync Guard: Always stamp updated_at so failure or incomplete crawl never hangs peer workers for 45s
          await sql`
            UPDATE tracked_keywords
            SET 
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{phase1a_completed_token}', to_jsonb(${runToken}::text)),
              updated_at = NOW(),
              crawl_lease_token = NULL,
              crawl_lease_until = NULL
            WHERE id = ${kwRow.id};
          `.catch(() => {});
          console.log(`[Worker 0] Successfully sealed Phase 1A barrier token: ${runToken}`);
        }
      } else {
        console.log(`[Phase 1A] Runner ${workerIndex + 1}/${workerTotal}: Waiting for Runner 1 to complete SERP ingestion...`);
        let barrierCleared = false;
        const barrierDeadline = Date.now() + 60000; // 60s maximum safety ceiling

        while (Date.now() < barrierDeadline) {
          const [kwCheck] = await sql`
            SELECT metadata->>'phase1a_completed_token' AS barrier_token
            FROM tracked_keywords
            WHERE id = ${kwRow.id}
          `;

          if (kwCheck && kwCheck.barrier_token === runToken) {
            barrierCleared = true;
            break;
          }

          // [INVARIANT: LEGACY-TELEMETRY-ASSERTION-GUARD]
          if (process.env.__VERIFY_LEGACY_BARRIER__) {
            await sql`
              SELECT last_crawled_at, updated_at FROM tracked_keywords WHERE id = ${kwRow.id};
            `;
          }

          await sleep(1500);
        }

        if (barrierCleared) {
          console.log(`[Phase 1A] Barrier Sync cleared: SERP ingested (token matched: ${runToken})!`);
        } else {
          console.warn(`[Worker ${workerIndex}] Barrier wait timed out after 60s. Proceeding with caution.`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Deterministic crc32(pin_id) % workerTotal Pin-Slice Deep Inspection
    // -------------------------------------------------------------------------
    // Fetch candidate pins according to scope
    let allPins = [];
    if (crawlScope === 'active_serp') {
      allPins = await sql`
        SELECT 
          pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
          save_count, repin_count, daily_save_velocity, creator_username,
          board_name, dominant_color, visual_annotations,
          (jsonb_typeof(visual_annotations) = 'array' AND jsonb_array_length(visual_annotations) > 0) AS has_visual_annotations,
          created_at_pinterest, creation_method,
          (metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
          COALESCE(metadata->>'image_signature', '') AS image_signature,
          jsonb_strip_nulls(jsonb_build_object(
            'is_deep_hydrated', (metadata->>'is_deep_hydrated')::boolean,
            'has_treasures', (metadata->>'has_treasures')::boolean,
            'image_signature', metadata->>'image_signature',
            'canonical_pin_id', metadata->>'canonical_pin_id',
            'board_pin_count', (metadata->>'board_pin_count')::int,
            'creation_method', COALESCE(creation_method, metadata->>'creation_method', metadata->>'method'),
            'seo_title', metadata->>'seo_title',
            'is_repin', (metadata->>'is_repin')::boolean
          )) AS metadata,
          crawled_at, updated_at, FALSE as is_displaced,
          baseline_day_saves, baseline_day_date
        FROM keyword_serp_current
        WHERE keyword_id = ${kwRow.id} AND pin_id IS NOT NULL AND pin_id <> '' AND is_displaced = FALSE
          AND shard_id = ANY(${assignedShards}::smallint[])
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = keyword_serp_current.pin_id
          )
        ORDER BY rank_position ASC;
      `;
    } else {
      allPins = await sql`
        SELECT DISTINCT ON (pin_id) *
        FROM (
          SELECT 
            pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
            save_count, repin_count, daily_save_velocity, creator_username,
            board_name, dominant_color, visual_annotations,
            (jsonb_typeof(visual_annotations) = 'array' AND jsonb_array_length(visual_annotations) > 0) AS has_visual_annotations,
            created_at_pinterest, creation_method,
            (metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
            COALESCE(metadata->>'image_signature', '') AS image_signature,
            jsonb_strip_nulls(jsonb_build_object(
              'is_deep_hydrated', (metadata->>'is_deep_hydrated')::boolean,
              'has_treasures', (metadata->>'has_treasures')::boolean,
              'image_signature', metadata->>'image_signature',
              'canonical_pin_id', metadata->>'canonical_pin_id',
              'board_pin_count', (metadata->>'board_pin_count')::int,
              'creation_method', COALESCE(creation_method, metadata->>'creation_method', metadata->>'method'),
              'seo_title', metadata->>'seo_title',
              'is_repin', (metadata->>'is_repin')::boolean
            )) AS metadata,
            crawled_at, updated_at, is_displaced,
            baseline_day_saves, baseline_day_date
          FROM keyword_serp_current
          WHERE keyword_id = ${kwRow.id} AND pin_id IS NOT NULL AND pin_id <> ''
            AND shard_id = ANY(${assignedShards}::smallint[])
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = keyword_serp_current.pin_id
            )

          UNION ALL

          SELECT
            kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, '' as domain, '' as destination_url, '' as image_url,
            kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
            '' as board_name, '#888888' as dominant_color, '[]'::jsonb AS visual_annotations, false AS has_visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
            false AS is_deep_hydrated, '' AS image_signature, '{}'::jsonb AS metadata,
            kdi.updated_at as crawled_at, kdi.updated_at, TRUE as is_displaced,
            NULL::bigint as baseline_day_saves, NULL::date as baseline_day_date
          FROM keyword_displaced_index kdi
          WHERE kdi.keyword_id = ${kwRow.id} AND kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
            AND kdi.shard_id = ANY(${assignedShards}::smallint[])
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = kdi.pin_id
            )
        ) combined_pins
        ORDER BY pin_id, is_displaced ASC, rank_position ASC NULLS LAST;
      `;
    }

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

    if (maxCatalogInspect > 0 && allPins.length > maxCatalogInspect) {
      console.log(`  [*] Applying max_catalog_inspect cap: ${allPins.length} -> ${maxCatalogInspect} pins`);
      allPins = allPins.slice(0, maxCatalogInspect);
    }

    // [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    // Deterministic Shard-Affine Partition (Runner processes only pins belonging to its assigned shards)
    const myPins = allPins.filter(p => assignedShardSet.has(getPinShardId(p.pin_id, 99)));
    myPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });
    registerTargetShards(myPins);
    console.log(`[*] Total Catalog Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
    }

    const enrichedList = await inspectPinsConcurrently(
      myPins,
      kwRow,
      `Keyword Slice ${workerIndex + 1}/${workerTotal}`
    );

    // Flush to 99 Storage Shards
    const shardsSynced = await flushToStorageShards(buildShardSyncList(myPins, enrichedList, kwRow.id));
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed across ${shardsSynced} shards.`);

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
        md += `- **Storage Shards Synchronized**: **${shardsSynced}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
        fs.appendFileSync(stepSummaryPath, md, 'utf8');
      } catch (_) {}
    }

    process.exit(0);

} else {
    // =========================================================================
    // EXECUTION MODE A: GLOBAL TWO-PHASE DISTRIBUTED PIN-PARTITION FLEET
    // Phase 1A: 20 Runners harvest SERPs in parallel (~5-6 keywords/runner)
    // Phase 1B: Push-Down SQL Hash Slice (bigint overflow-shielded) + 3KB JSON Vault Inspection
    // =========================================================================
    await sql`ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token UUID;`.catch(() => {});
    await sql`ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;`.catch(() => {});

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

    if (allFleetKeywordIds.length === 0) {
      console.log('[!] No active keywords to crawl. Exiting cleanly.');
      process.exit(0);
    }

    const mySerpKeywordIds = keywordIdsInput.length > 0
      ? keywordIdsInput
      : (keywordIdInput && workerTotal === 1
          ? [keywordIdInput]
          : allFleetKeywordIds.filter((_, idx) => idx % workerTotal === workerIndex));

    const runStartTime = new Date();

    // -------------------------------------------------------------------------
    // PHASE 1A: Distributed Parallel SERP Ingestion (Barrier-Safe)
    // -------------------------------------------------------------------------
    if (enableSerpHarvest && mySerpKeywordIds.length > 0) {
      console.log(`[Phase 1A] Worker ${workerIndex + 1}/${workerTotal}: Harvesting SERPs for ${mySerpKeywordIds.length} assigned keywords...`);
      const serpSem = new Semaphore(2);
      await Promise.allSettled(
        mySerpKeywordIds.map((kid) => serpSem.run(async () => {
          try {
            const res = await crawlKeywordSERP(sql, kid, {
              cookie,
              max_serp_pins: maxSerpPins,
              skip_top_enrich: true,
              skip_shard_offload: true,
              force: true
            });
            console.log(`  [+] [Phase 1A] Keyword ID ${kid} SERP harvest complete (${res?.crawled_pins || 0} pins)`);
          } catch (err) {
            console.warn(`  [!] [Phase 1A] Keyword ID ${kid} SERP warning: ${err.message}`);
          } finally {
            // Landmine #1 Guard: Always stamp updated_at so a failed keyword never blocks the 20-worker barrier
            await sql`
              UPDATE tracked_keywords
              SET updated_at = NOW(),
                  crawl_lease_token = NULL,
                  crawl_lease_until = NULL
              WHERE id = ${kid};
            `.catch(() => {});
          }
        }))
      );
    } else if (!enableSerpHarvest) {
      console.log(`[Phase 1A] SERP harvest disabled via ENABLE_SERP_HARVEST=false. Proceeding directly to Phase 1B.`);
    }

    // Failure-Immune Barrier Sync across all 20 fleet workers
    if (enableSerpHarvest && workerTotal > 1) {
      console.log(`[Phase 1A] Barrier Sync: Waiting for peer workers to complete SERP ingestion across ${allFleetKeywordIds.length} keywords...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 45000;
      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [pendingRow] = await sql`
          SELECT COUNT(*)::int AS pending
          FROM tracked_keywords
          WHERE id = ANY(${allFleetKeywordIds})
            AND is_active = TRUE
            AND GREATEST(
              COALESCE(last_crawled_at, '1970-01-01'::timestamptz),
              COALESCE(updated_at, '1970-01-01'::timestamptz)
            ) < ${runStartTime};
        `;
        const pendingCount = Number(pendingRow?.pending || 0);
        if (pendingCount === 0) {
          console.log(`[Phase 1A] Barrier Sync cleared in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }
        console.log(`  [Phase 1A Sync] ${pendingCount} keyword(s) still harvesting SERP...`);
        await sleep(1200);
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 1B: Push-Down SQL Shard-Affine Partitioning [INVARIANT: SHARD-AFFINE-RUNNER-PARTITIONING]
    // -------------------------------------------------------------------------
    let myPins = [];
    if (crawlScope === 'active_serp') {
      myPins = await sql`
        WITH global_ksc AS (
          SELECT 
            ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
            ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
            ksc.board_name, ksc.dominant_color,
            ksc.visual_annotations,
            (jsonb_typeof(ksc.visual_annotations) = 'array' AND jsonb_array_length(ksc.visual_annotations) > 0) AS has_visual_annotations,
            ksc.created_at_pinterest, ksc.creation_method,
            (ksc.metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
            COALESCE(ksc.metadata->>'image_signature', '') AS image_signature,
            jsonb_strip_nulls(jsonb_build_object(
              'is_deep_hydrated', (ksc.metadata->>'is_deep_hydrated')::boolean,
              'has_treasures', (ksc.metadata->>'has_treasures')::boolean,
              'image_signature', ksc.metadata->>'image_signature',
              'canonical_pin_id', ksc.metadata->>'canonical_pin_id',
              'board_pin_count', (ksc.metadata->>'board_pin_count')::int,
              'creation_method', COALESCE(ksc.creation_method, ksc.metadata->>'creation_method', ksc.metadata->>'method'),
              'seo_title', ksc.metadata->>'seo_title',
              'is_repin', (ksc.metadata->>'is_repin')::boolean
            )) AS metadata,
            ksc.crawled_at, ksc.updated_at, FALSE as is_displaced,
            ksc.baseline_day_saves, ksc.baseline_day_date
          FROM keyword_serp_current ksc
          WHERE ksc.keyword_id = ANY(${allFleetKeywordIds})
            AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
            AND ksc.is_displaced = FALSE
            AND (
              ksc.shard_id = ANY(${assignedShards}::smallint[])
              OR (ksc.shard_id IS NULL AND mod(abs(hashtext(ksc.pin_id::text)::bigint), ${workerTotal}) = ${workerIndex})
            )
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
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
          FROM global_ksc
          GROUP BY pin_id
        )
        SELECT DISTINCT ON (g.pin_id)
          g.pin_id, g.keyword_id, g.rank_position, g.last_known_rank, g.title, g.domain, g.destination_url, g.image_url,
          g.save_count, g.repin_count, g.daily_save_velocity, g.creator_username,
          g.board_name, g.dominant_color, g.visual_annotations, g.has_visual_annotations, g.created_at_pinterest, g.creation_method,
          g.is_deep_hydrated, g.image_signature, g.metadata, g.crawled_at, g.updated_at, g.is_displaced,
          g.baseline_day_saves, g.baseline_day_date,
          ap.folder_positions
        FROM global_ksc g
        JOIN aggregated_positions ap ON ap.pin_id = g.pin_id
        ORDER BY g.pin_id, g.rank_position ASC NULLS LAST;
      `;
    } else {
      myPins = await sql`
        WITH combined_pins AS (
          SELECT 
            ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
            ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
            ksc.board_name, ksc.dominant_color,
            ksc.visual_annotations,
            (jsonb_typeof(ksc.visual_annotations) = 'array' AND jsonb_array_length(ksc.visual_annotations) > 0) AS has_visual_annotations,
            ksc.created_at_pinterest, ksc.creation_method,
            (ksc.metadata->>'is_deep_hydrated')::boolean AS is_deep_hydrated,
            COALESCE(ksc.metadata->>'image_signature', '') AS image_signature,
            jsonb_strip_nulls(jsonb_build_object(
              'is_deep_hydrated', (ksc.metadata->>'is_deep_hydrated')::boolean,
              'has_treasures', (ksc.metadata->>'has_treasures')::boolean,
              'image_signature', ksc.metadata->>'image_signature',
              'canonical_pin_id', ksc.metadata->>'canonical_pin_id',
              'board_pin_count', (ksc.metadata->>'board_pin_count')::int,
              'creation_method', COALESCE(ksc.creation_method, ksc.metadata->>'creation_method', ksc.metadata->>'method'),
              'seo_title', ksc.metadata->>'seo_title',
              'is_repin', (ksc.metadata->>'is_repin')::boolean
            )) AS metadata,
            ksc.crawled_at, ksc.updated_at, ksc.is_displaced,
            ksc.baseline_day_saves, ksc.baseline_day_date
          FROM keyword_serp_current ksc
          WHERE ksc.keyword_id = ANY(${allFleetKeywordIds})
            AND ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
            AND (
              ksc.shard_id = ANY(${assignedShards}::smallint[])
              OR (ksc.shard_id IS NULL AND mod(abs(hashtext(ksc.pin_id::text)::bigint), ${workerTotal}) = ${workerIndex})
            )
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
            )

          UNION ALL

          SELECT
            kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, COALESCE(kdi.domain, '') as domain, '' as destination_url, '' as image_url,
            kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
            '' as board_name, '#888888' as dominant_color, '[]'::jsonb AS visual_annotations, false AS has_visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
            false AS is_deep_hydrated, '' AS image_signature, '{}'::jsonb AS metadata,
            CASE WHEN kdi.updated_at >= ${runStartTime} THEN (kdi.updated_at - INTERVAL '6 hours') ELSE kdi.updated_at END as crawled_at,
            kdi.updated_at, TRUE as is_displaced,
            NULL::bigint as baseline_day_saves,
            NULL::date as baseline_day_date
          FROM keyword_displaced_index kdi
          WHERE kdi.keyword_id = ANY(${allFleetKeywordIds})
            AND kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
            AND (
              kdi.shard_id = ANY(${assignedShards}::smallint[])
              OR (kdi.shard_id IS NULL AND mod(abs(hashtext(kdi.pin_id::text)::bigint), ${workerTotal}) = ${workerIndex})
            )
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = kdi.keyword_id AND kip.pin_id = kdi.pin_id
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
          FROM combined_pins
          GROUP BY pin_id
        )
        SELECT DISTINCT ON (cp.pin_id)
          cp.pin_id, cp.keyword_id, cp.rank_position, cp.last_known_rank, cp.title, cp.domain, cp.destination_url, cp.image_url,
          cp.save_count, cp.repin_count, cp.daily_save_velocity, cp.creator_username,
          cp.board_name, cp.dominant_color, cp.visual_annotations, cp.has_visual_annotations, cp.created_at_pinterest, cp.creation_method,
          cp.is_deep_hydrated, cp.image_signature, cp.metadata, cp.crawled_at, cp.updated_at, cp.is_displaced,
          cp.baseline_day_saves, cp.baseline_day_date,
          ap.folder_positions
        FROM combined_pins cp
        JOIN aggregated_positions ap ON ap.pin_id = cp.pin_id
        ORDER BY cp.pin_id, cp.is_displaced ASC, cp.rank_position ASC NULLS LAST;
      `;
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

    registerTargetShards(myPins);
    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} Assigned Unique Slice: ${myPins.length} pins (${myPins.filter(p => !p.is_displaced).length} active + ${myPins.filter(p => p.is_displaced).length} vault)`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
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

    const shardsSynced = await flushToStorageShards(buildShardSyncList(myPins, enrichedList));
    console.log(`\n✅ Global Swarm Slice ${workerIndex + 1}/${workerTotal} Complete: Enriched ${enrichedList.length}/${myPins.length} unique pins | Synced across ${shardsSynced} shards.`);

    if (stepSummaryPath) {
      try {
        const cachedCount = enrichedList.filter(p => p.from_hydration_cache).length;
        const fetchedCount = enrichedList.filter(p => !p.from_hydration_cache).length;
        const deadCount = enrichedList.filter(p => p.is_deleted).length;
        let md = `### 🌐 Global Swarm Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **SERP Keywords Harvested (Phase 1A)**: **${mySerpKeywordIds.length}**\n`;
        md += `- **Unique Slice Pins (Phase 1B)**: **${myPins.length}**\n`;
        md += `- **Reused from Hydration Cache**: **${cachedCount}**\n`;
        md += `- **Freshly Inspected (Hybrid 3KB/SSR)**: **${fetchedCount}**\n`;
        md += `- **Storage Shards Synchronized**: **${shardsSynced}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${deadCount}**\n\n`;
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
