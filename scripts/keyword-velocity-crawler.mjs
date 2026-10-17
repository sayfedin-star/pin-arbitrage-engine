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
import { fetchPinFromPinterest, setDefaultDispatcher } from './lib/pinterest.mjs';
import { batchGroupByShard, resolveShardConnection, preloadNeonRegistry, getPinShardId } from '../src/modules/sharding/fleet-router.mjs';
import { crc32 } from '../src/modules/fleet/sharding.mjs';

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
const workerIndex = parseInt(process.env.WORKER_INDEX || '0', 10);
const workerTotal = Math.max(1, parseInt(process.env.WORKER_TOTAL || '1', 10));
const targetKeyword = (process.env.TARGET_KEYWORD || '').trim().toLowerCase();
const keywordIdInput = process.env.KEYWORD_ID ? parseInt(process.env.KEYWORD_ID, 10) : null;
const keywordIdsInput = (process.env.KEYWORD_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));
const folderIdInput = process.env.FOLDER_ID ? parseInt(process.env.FOLDER_ID, 10) : null;
const crawlScope = (process.env.CRAWL_SCOPE || 'all_pins').toLowerCase().trim();
const cookie = process.env.PINTEREST_COOKIE || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;
const envSerpPins = process.env.MAX_SERP_PINS?.trim() || process.env.MAX_PINS?.trim();
const maxSerpPins = (envSerpPins && !isNaN(parseInt(envSerpPins, 10)))
  ? Math.max(25, Math.min(1000, parseInt(envSerpPins, 10)))
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

const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10));
const BATCH_SIZE = Math.max(10, parseInt(process.env.BATCH_SIZE || '100', 10));
const SLEEP_MS_MIN = Math.max(500, parseInt(process.env.SLEEP_MS_MIN || '1500', 10));
const SLEEP_MS_MAX = Math.max(SLEEP_MS_MIN, parseInt(process.env.SLEEP_MS_MAX || '2500', 10));

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
    meta.is_deep_hydrated === true ||
    meta.is_deep_hydrated === 'true'
  );
  const hasRichTreasures = Boolean(meta.has_treasures === true || meta.image_signature || meta.canonical_pin_id || meta.board_pin_count);
  if (!crawlTime || !isDeepHydrated || !hasRichTreasures || pin.save_count == null || Number(pin.save_count) === 0) {
    return { shouldFetch: true, reason: 'unhydrated_or_missing_treasures', reuseTelemetry: null };
  }

  const lastCrawlMs = new Date(crawlTime).getTime();
  const elapsedMs = currentUtcTimestamp - lastCrawlMs;

  const lastCrawlDateStr = new Date(lastCrawlMs).toISOString().slice(0, 10);
  const currentUtcDateStr = new Date(currentUtcTimestamp).toISOString().slice(0, 10);
  const isSameCalendarDay = (lastCrawlDateStr === currentUtcDateStr);

  // 1. Hard Cooldown: Under 4 hours, NEVER fetch from Pinterest regardless of midnight
  if (elapsedMs < HARD_COOLDOWN_MS) {
    if (!isSameCalendarDay) {
      // Midnight crossed during hard cooldown: SERP position only, do NOT forge a 0/d velocity row with yesterday's counts
      return {
        shouldFetch: false,
        reason: 'hard_cooldown_cross_midnight_serp_only',
        reuseTelemetry: {
          save_count: null,
          repin_count: null,
          comment_count: null,
          share_count: null,
          daily_save_velocity: null
        }
      };
    }
    return {
      shouldFetch: false,
      reason: 'hard_cooldown_under_4h',
      reuseTelemetry: {
        save_count: Number(pin.save_count),
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

  let detail = null;
  let isDead = false;
  let fetchError = null;

  let fetchRes = null;
  try {
    fetchRes = await fetchPinFromPinterest(pin.pin_id, cookie);
    // 1-time retry with 1500ms jitter if transient failure or empty response (excluding confirmed 404 / 429)
    const isConfirmedDead = fetchRes?.status === 404 || String(fetchRes?.error || '').includes('404');
    const isRateLimited = fetchRes?.status === 429 || fetchRes?.code === 429 || String(fetchRes?.error || '').includes('429');
    if (!fetchRes?.ok && !isConfirmedDead && !isRateLimited) {
      const retryJitter = 1000 + Math.floor(Math.random() * 1000); // 1000-2000ms (~1500ms) jitter
      await new Promise(r => setTimeout(r, retryJitter));
      fetchRes = await fetchPinFromPinterest(pin.pin_id, cookie);
    }
  } catch (err) {
    fetchError = err;
    const isConfirmedDead = String(err.message || '').includes('404');
    const isRateLimited = String(err.message || '').includes('429');
    if (!isConfirmedDead && !isRateLimited) {
      const retryJitter = 1000 + Math.floor(Math.random() * 1000);
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
    // Individual unparseable pin, non-429, non-timeout failure
    // Do NOT increment consecutiveErrors to prevent tripping the circuit breaker on isolated malformed pins!
    console.warn(`    [!] Pin ${pin.pin_id} fetch warning (non-fatal, isolated):`, fetchRes?.error || fetchError?.message || 'Empty response');
  }

  // Jitter sleep inside worker thread to maintain natural pacing
  const jitter = SLEEP_MS_MIN + Math.floor(Math.random() * (SLEEP_MS_MAX - SLEEP_MS_MIN));
  await new Promise(r => setTimeout(r, jitter));

  if (consecutiveErrors >= CIRCUIT_BREAKER_LIMIT) {
    circuitBroken = true;
    console.error(`    [CIRCUIT BREAKER] Hit ${CIRCUIT_BREAKER_LIMIT} consecutive errors. Halting inspection.`);
    return null;
  }

  // Guard against False-Success Masking (Landmine 2):
  // If pin could not be fetched and is not confirmed dead (e.g. 429 rate limit or network error),
  // return null so it is NOT marked with crawled_at = NOW() and remains eligible for retry.
  if (!detail && !isDead) {
    return null;
  }

  // Authentic Metrics Normalization (overwrites reaction-polluted save_count on first authentic deep hydration)
  const meta = (pin.metadata && typeof pin.metadata === 'object') ? pin.metadata : {};
  const wasDeepHydrated = Boolean(
    meta.is_deep_hydrated === true ||
    meta.is_deep_hydrated === 'true' ||
    (pin.creation_method && pin.creation_method !== 'pinterest_platform')
  );
  const detailSaves = Math.max(Number(detail?.saves || 0), Number(detail?.save_count || 0));
  const authenticSaves = (!wasDeepHydrated && detailSaves > 0)
    ? detailSaves
    : Math.max(Number(pin.save_count || 0), detailSaves);
  const authenticRepins = Math.max(
    Number(pin.repin_count || 0),
    Number(detail?.repins || 0),
    Number(detail?.repin_count || 0)
  );
  const authenticComments = Number(detail?.comments || detail?.comment_count || 0);
  const authenticShares = Number(detail?.shares || detail?.share_count || 0);

  // Live Velocity Delta Generation (Landmine 5):
  // Dynamically compute 24h normalized save velocity when fresh Pinterest closeup yields new saves
  const prevSaves = Number(pin.save_count || 0);
  let computedVelocity = Number(pin.daily_save_velocity || 0);

  if (detail && authenticSaves > prevSaves && prevSaves > 0) {
    const rawDelta = authenticSaves - prevSaves;
    const lastTimestamp = pin.crawled_at || pin.metadata?.crawled_at || null;
    if (lastTimestamp) {
      const elapsedHours = Math.max(0.25, (Date.now() - new Date(lastTimestamp).getTime()) / (1000 * 60 * 60));
      if (elapsedHours >= 0.5 && elapsedHours <= 72) {
        const annualizedDelta = Math.round((rawDelta / elapsedHours) * 24);
        computedVelocity = Math.min(25000, Math.max(computedVelocity, annualizedDelta));
      } else {
        computedVelocity = Math.min(25000, Math.max(computedVelocity, rawDelta));
      }
    } else {
      computedVelocity = Math.min(25000, Math.max(computedVelocity, rawDelta));
    }
  }

  const description = detail?.description || pin.description || '';
  const altText = detail?.alt_text || detail?.altText || detail?.seo_alt_text || pin.alt_text || '';
  const dominantColor = detail?.dominant_color || detail?.dominantColor || pin.dominant_color || '#888888';
  const creator = detail?.pinner?.username || detail?.creator_username || pin.creator_username || '';
  const board = detail?.board?.name || pin.board_name || '';
  const method = detail?.method || detail?.creation_method || pin.creation_method || pin.method || pin.metadata?.method || 'pinterest_platform';
  const createdAtPinterest = detail?.created_at_pinterest || detail?.created_at || pin.created_at_pinterest || pin.created_at || null;

  // Visual Annotations CV Extraction with Strict "not-given" Guard & In-Memory Set Merge
  let rawNewAnnotations = [];
  if (detail?.annotations && Array.isArray(detail.annotations) && detail.annotations.length > 0) {
    rawNewAnnotations = detail.annotations.map(a => typeof a === 'string' ? a : (a.name || a.label || ''));
  } else if (detail?.tags && Array.isArray(detail.tags)) {
    rawNewAnnotations = detail.tags;
  } else if (detail?.pinJoin?.visualAnnotation) {
    rawNewAnnotations = detail.pinJoin.visualAnnotation;
  }

  // Filter out 'not-given', empty, or malformed tags
  const cleanNewAnnotations = rawNewAnnotations
    .map(s => String(s || '').trim())
    .filter(s => s.length >= 2 && !s.toLowerCase().includes('not-given') && !s.toLowerCase().includes('not given'));

  // Existing stored tags on pin
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

  // In-Memory Set Merge
  const mergedTagsSet = new Set();
  for (const t of cleanExistingAnnotations) mergedTagsSet.add(t);
  for (const t of cleanNewAnnotations) mergedTagsSet.add(t);
  const finalAnnotations = Array.from(mergedTagsSet).slice(0, 15);

  const extraMeta = {
    description: String(description || ''),
    seo_title: detail?.seo_title || meta.seo_title || '',
    seo_description: detail?.seo_description || meta.seo_description || '',
    canonical_pin_id: detail?.canonical_pin_id || meta.canonical_pin_id || null,
    canonical_pin_url: detail?.canonical_pin_url || meta.canonical_pin_url || null,
    seo_canonical_url: detail?.seo_canonical_url || meta.seo_canonical_url || '',
    aggregated_pin_data_id: detail?.aggregated_pin_data_id || meta.aggregated_pin_data_id || null,
    domain_official_user: detail?.domain_official_user?.username ? detail.domain_official_user : (meta.domain_official_user || null),
    board_id: detail?.board_id || meta.board_id || null,
    board_url: detail?.board_url || meta.board_url || null,
    board_pin_count: Number(detail?.board_pin_count || meta.board_pin_count || 0),
    board_order_modified_at: detail?.board_order_modified_at || meta.board_order_modified_at || null,
    board_cover_url: detail?.board_cover_url || meta.board_cover_url || null,
    board_thumbnail_url: detail?.board_thumbnail_url || meta.board_thumbnail_url || null,
    image_signature: detail?.image_signature || meta.image_signature || '',
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
async function flushBatchToHub(pinsChunk, kw) {
  if (!pinsChunk || pinsChunk.length === 0) return;
  const isFolder = Boolean(kw?.folder_id);

  // Zero-Bloat Hub Flush: Only update active SERP columns and slim flags on Hub;
  // heavy extra_meta, descriptions, and time-series snapshots go strictly to the 99 Shards via flushToStorageShards!
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

  if (isFolder) {
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
          WHEN u.daily_save_velocity > 0 THEN GREATEST(COALESCE(ksc.daily_save_velocity, 0), u.daily_save_velocity::numeric)
          ELSE ksc.daily_save_velocity 
        END,
        creator_username = CASE WHEN u.creator <> '' THEN u.creator ELSE ksc.creator_username END,
        board_name = CASE WHEN u.board <> '' THEN u.board ELSE ksc.board_name END,
        dominant_color = CASE WHEN u.dominant_color <> '' THEN u.dominant_color ELSE ksc.dominant_color END,
        created_at_pinterest = CASE WHEN u.created_at_pinterest::timestamptz IS NOT NULL THEN u.created_at_pinterest::timestamptz ELSE ksc.created_at_pinterest END,
        creation_method = CASE WHEN u.method <> '' THEN u.method ELSE ksc.creation_method END,
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
        metadata = ((CASE WHEN jsonb_typeof(ksc.metadata) = 'object' THEN ksc.metadata ELSE '{}'::jsonb END) - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests' - 'method' - 'creation_method' - 'share_count' - 'dominant_color' - 'board_name') || jsonb_strip_nulls(jsonb_build_object(
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
          WHEN u.daily_save_velocity > 0 THEN GREATEST(COALESCE(kdi.daily_save_velocity, 0), u.daily_save_velocity::numeric)
          ELSE kdi.daily_save_velocity 
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric
      )
      WHERE kdi.pin_id = u.pin_id
        AND kdi.keyword_id IN (
          SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${kw.folder_id}
        );
    `.catch(() => {});
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
          WHEN u.daily_save_velocity > 0 THEN GREATEST(COALESCE(ksc.daily_save_velocity, 0), u.daily_save_velocity::numeric)
          ELSE ksc.daily_save_velocity 
        END,
        creator_username = CASE WHEN u.creator <> '' THEN u.creator ELSE ksc.creator_username END,
        board_name = CASE WHEN u.board <> '' THEN u.board ELSE ksc.board_name END,
        dominant_color = CASE WHEN u.dominant_color <> '' THEN u.dominant_color ELSE ksc.dominant_color END,
        created_at_pinterest = CASE WHEN u.created_at_pinterest::timestamptz IS NOT NULL THEN u.created_at_pinterest::timestamptz ELSE ksc.created_at_pinterest END,
        creation_method = CASE WHEN u.method <> '' THEN u.method ELSE ksc.creation_method END,
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
        metadata = ((CASE WHEN jsonb_typeof(ksc.metadata) = 'object' THEN ksc.metadata ELSE '{}'::jsonb END) - 'description' - 'alt_text' - 'rich_metadata' - 'visual_objects' - 'seo_related_interests' - 'method' - 'creation_method' - 'share_count' - 'dominant_color' - 'board_name') || jsonb_strip_nulls(jsonb_build_object(
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
          WHEN u.daily_save_velocity > 0 THEN GREATEST(COALESCE(kdi.daily_save_velocity, 0), u.daily_save_velocity::numeric)
          ELSE kdi.daily_save_velocity 
        END,
        updated_at = NOW()
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text,
        authentic_saves bigint,
        authentic_repins int,
        authentic_comments int,
        authentic_shares int,
        daily_save_velocity numeric
      )
      WHERE kdi.pin_id = u.pin_id AND kdi.keyword_id = ${kw.id};
    `.catch(() => {});
  }
}

/**
 * Backwards-compatible single-pin inspect and flush wrapper
 */
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
 * Optimized: Bulk jsonb_to_recordset per shard, concurrent 10-shard pool, and registry preloading.
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
            const shardPayload = JSON.stringify(sortedPins.map(sp => ({
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
              metadata: (sp.extra_meta && typeof sp.extra_meta === 'object') ? sp.extra_meta : (sp.metadata || {}),
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
            })));

            // 1. Master Pin Record Upsert (Deduplicated on pin_id)
            const q1 = shardSql`
              INSERT INTO universal_master_pins (
                pin_id, creator_username, board_name, board_slug, title, domain, destination_url,
                image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
                first_discovered_pillar, first_discovered_at, updated_at
              )
              SELECT DISTINCT ON (u.pin_id)
                u.pin_id, u.creator_username, u.board_name, u.board_slug, u.title, u.domain, u.destination_url,
                u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations, u.created_at_pinterest::timestamptz, u.metadata,
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
                dominant_color = COALESCE(EXCLUDED.dominant_color, universal_master_pins.dominant_color),
                visual_annotations = CASE 
                  WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                  THEN EXCLUDED.visual_annotations
                  ELSE universal_master_pins.visual_annotations
                END,
                created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
                metadata = (CASE WHEN jsonb_typeof(universal_master_pins.metadata) = 'object' THEN universal_master_pins.metadata ELSE '{}'::jsonb END) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
                updated_at = NOW();
            `;

            // 2. Atomic Two-Tier Upsert: pins_daily_metrics + pin_serp_positions (Immune to SQLSTATE 21000)
            const q2 = shardSql`
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
                  pin_id,
                  MAX(save_count) AS save_count,
                  MAX(repin_count) AS repin_count,
                  MAX(comment_count) AS comment_count,
                  MAX(share_count) AS share_count,
                  MAX(daily_save_velocity) AS daily_save_velocity
                FROM raw_batch
                WHERE save_count IS NOT NULL
                GROUP BY pin_id
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
                    WHEN EXCLUDED.daily_save_velocity > 0 THEN GREATEST(COALESCE(pins_daily_metrics.daily_save_velocity, 0), EXCLUDED.daily_save_velocity)
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

            // 3. Legacy Backward-Compatible Snapshots (Deduplicated on pin_id, keyword_id)
            const q3 = shardSql`
              INSERT INTO pins_daily_snapshots (
                pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
                share_count, daily_save_velocity, snapshot_date, created_at
              )
              SELECT DISTINCT ON (u.pin_id, u.keyword_id)
                u.pin_id, u.keyword_id, u.rank_position, u.save_count, u.repin_count, u.comment_count,
                u.share_count, u.daily_save_velocity, (NOW() AT TIME ZONE 'UTC')::date, NOW()
              FROM jsonb_to_recordset(${shardPayload}::jsonb) AS u(
                pin_id text, keyword_id int, rank_position int, save_count bigint, repin_count int, comment_count int,
                share_count int, daily_save_velocity numeric
              )
              ORDER BY u.pin_id ASC, u.keyword_id ASC, u.rank_position ASC NULLS LAST
              ON CONFLICT (pin_id, keyword_id, snapshot_date) DO UPDATE SET
                rank_position = COALESCE(EXCLUDED.rank_position, pins_daily_snapshots.rank_position),
                save_count = GREATEST(pins_daily_snapshots.save_count, EXCLUDED.save_count),
                repin_count = GREATEST(pins_daily_snapshots.repin_count, EXCLUDED.repin_count),
                comment_count = GREATEST(pins_daily_snapshots.comment_count, EXCLUDED.comment_count),
                share_count = GREATEST(pins_daily_snapshots.share_count, EXCLUDED.share_count),
                daily_save_velocity = CASE 
                WHEN EXCLUDED.daily_save_velocity > 0 THEN GREATEST(COALESCE(pins_daily_snapshots.daily_save_velocity, 0), EXCLUDED.daily_save_velocity)
                ELSE pins_daily_snapshots.daily_save_velocity 
              END,
              created_at = NOW();
            `;

            if (typeof shardSql.transaction === 'function') {
              await shardSql.transaction([q1, q2, q3]);
            } else if (typeof shardSql.begin === 'function') {
              await shardSql.begin(async (tx) => {
                await tx(q1.strings, ...q1.args);
                await tx(q2.strings, ...q2.args);
                await tx(q3.strings, ...q3.args);
              });
            } else {
              await q1;
              await q2;
              await q3;
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
    if (enrichedMap.has(pid)) {
      merged.push(enrichedMap.get(pid));
    } else {
      merged.push({
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
        extra_meta: (cp.metadata && typeof cp.metadata === 'object') ? cp.metadata : {},
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
      });
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
      if (!jitPrewarmFired && total > 5 && (completedCount / total) >= 0.8) {
        jitPrewarmFired = true;
        // JIT Pre-warming pulse (SELECT 1) across target shards 3-5s before flushToStorageShards
        const targetShardIds = new Set();
        for (const targetPin of pins) {
          if (targetPin && targetPin.pin_id && /^\d+$/.test(String(targetPin.pin_id))) {
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
    await Promise.allSettled(
      shards.map(async (shardId) => {
        try {
          const shardConn = await resolveShardConnection({ hubSql: sql, shardId });
          await shardConn`SELECT 1;`;
        } catch (_) {}
      })
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
    const runStartTime = new Date(Date.now() - 60000);

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
            AND (tk.last_crawled_at IS NULL OR tk.last_crawled_at < ${runStartTime});
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
        SELECT DISTINCT ON (ksc.pin_id)
          ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
          ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
          ksc.board_name, ksc.dominant_color, ksc.visual_annotations, ksc.created_at_pinterest, ksc.creation_method,
          ksc.metadata, ksc.crawled_at, ksc.updated_at, FALSE as is_displaced
        FROM keyword_serp_current ksc
        JOIN keyword_folder_items kfi ON kfi.keyword_id = ksc.keyword_id
        WHERE kfi.folder_id = ${fid} AND ksc.pin_id ~ '^[0-9]+$' AND ksc.is_displaced = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
          )
        ORDER BY ksc.pin_id, ksc.rank_position ASC NULLS LAST;
      `;
    } else {
      allPins = await sql`
        SELECT DISTINCT ON (pin_id) *
        FROM (
          SELECT 
            ksc.pin_id, ksc.keyword_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
            ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
            ksc.board_name, ksc.dominant_color, ksc.visual_annotations, ksc.created_at_pinterest, ksc.creation_method,
            ksc.metadata, ksc.crawled_at, ksc.updated_at, ksc.is_displaced
          FROM keyword_serp_current ksc
          JOIN keyword_folder_items kfi ON kfi.keyword_id = ksc.keyword_id
          WHERE kfi.folder_id = ${fid} AND ksc.pin_id ~ '^[0-9]+$'
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
            )

          UNION ALL

          SELECT
            kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, '' as domain, '' as destination_url, '' as image_url,
            kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
            '' as board_name, '#888888' as dominant_color, '[]'::jsonb as visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
            '{}'::jsonb as metadata, kdi.updated_at as crawled_at, kdi.updated_at, TRUE as is_displaced
          FROM keyword_displaced_index kdi
          JOIN keyword_folder_items kfi ON kfi.keyword_id = kdi.keyword_id
          WHERE kfi.folder_id = ${fid} AND kdi.pin_id ~ '^[0-9]+$'
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = kdi.keyword_id AND kip.pin_id = kdi.pin_id
            )
        ) combined_pins
        ORDER BY pin_id, is_displaced ASC, rank_position ASC NULLS LAST;
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

    const myPins = allPins.filter(p => (crc32(p.pin_id) % workerTotal) === workerIndex);
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
    const runStartTime = new Date(Date.now() - 60000);

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
        }
      } else {
        console.log(`[Phase 1A] Runner ${workerIndex + 1}/${workerTotal}: Waiting for Runner 1 to complete SERP ingestion...`);
        const barrierStart = Date.now();
        const BARRIER_TIMEOUT_MS = 35000;
        while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
          const [checkRow] = await sql`
            SELECT last_crawled_at FROM tracked_keywords WHERE id = ${kwRow.id};
          `;
          if (checkRow?.last_crawled_at && new Date(checkRow.last_crawled_at) >= runStartTime) {
            console.log(`[Phase 1A] Barrier Sync cleared: SERP ingested in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
            break;
          }
          await sleep(2500);
        }
        if (Date.now() - barrierStart >= BARRIER_TIMEOUT_MS) {
          console.warn(`[Phase 1A] Barrier Sync reached 35s timeout limit. Proceeding to Phase 1B.`);
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
          board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
          metadata, crawled_at, updated_at, FALSE as is_displaced
        FROM keyword_serp_current
        WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$' AND is_displaced = FALSE
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
            board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
            metadata, crawled_at, updated_at, is_displaced
          FROM keyword_serp_current
          WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
            AND NOT EXISTS (
              SELECT 1 FROM keyword_ignored_pins kip
              WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = keyword_serp_current.pin_id
            )

          UNION ALL

          SELECT
            kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, '' as domain, '' as destination_url, '' as image_url,
            kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
            '' as board_name, '#888888' as dominant_color, '[]'::jsonb as visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
            '{}'::jsonb as metadata, kdi.updated_at as crawled_at, kdi.updated_at, TRUE as is_displaced
          FROM keyword_displaced_index kdi
          WHERE kdi.keyword_id = ${kwRow.id} AND kdi.pin_id ~ '^[0-9]+$'
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

    // Deterministic Hash Disjoint Partition (Immune to dynamic catalog size variations across worker start times)
    const myPins = allPins.filter(p => (crc32(p.pin_id) % workerTotal) === workerIndex);
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
    // EXECUTION MODE A: MULTI-KEYWORD BROADCAST
    // =========================================================================
    // Defensively ensure atomic lease columns exist on tracked_keywords
    await sql`ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token UUID;`.catch(() => {});
    await sql`ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;`.catch(() => {});

    const activeIds = keywordIdsInput.length > 0 ? keywordIdsInput : (keywordIdInput ? [keywordIdInput] : []);
    let keywordsToProcess = [];
    if (activeIds.length > 0) {
      keywordsToProcess = await sql`
        SELECT * FROM tracked_keywords 
        WHERE id = ANY(${activeIds}) AND is_active = TRUE
        ORDER BY last_crawled_at ASC NULLS FIRST;
      `;
    } else if (targetKeyword) {
      keywordsToProcess = await sql`
        SELECT * FROM tracked_keywords 
        WHERE LOWER(keyword) = ${targetKeyword};
      `;
      if (keywordsToProcess.length === 0) {
        const defaultTarget = maxSerpPins || 50;
        const defaultPages = Math.max(1, Math.ceil(defaultTarget / 25));
        const [newRow] = await sql`
          INSERT INTO tracked_keywords (keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active)
          VALUES (${targetKeyword}, 'General', ${defaultTarget}, ${defaultPages}, 'full_catalog', TRUE)
          ON CONFLICT (keyword) DO UPDATE SET
            is_active = TRUE,
            updated_at = NOW()
          RETURNING *;
        `;
        keywordsToProcess = [newRow];
      } else {
        const existingKw = keywordsToProcess[0];
        if (!existingKw.is_active) {
          const [updatedRow] = await sql`
            UPDATE tracked_keywords 
            SET is_active = TRUE, updated_at = NOW()
            WHERE id = ${existingKw.id}
            RETURNING *;
          `;
          keywordsToProcess = [updatedRow || existingKw];
        }
      }
    } else {
      keywordsToProcess = await sql`
        SELECT * FROM tracked_keywords 
        WHERE is_active = TRUE
          AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
        ORDER BY last_crawled_at ASC NULLS FIRST;
      `;
    }

    console.log(`[*] Found ${keywordsToProcess.length} keywords for worker.`);
    if (keywordsToProcess.length === 0) {
      console.log('[!] No active keywords to crawl. Exiting.');
      process.exit(0);
    }

    let currentLeaseContext = null;
    const cleanupAndExit = async (signal) => {
      console.warn(`\n[Graceful Shutdown] Received ${signal}. Releasing active crawl lease...`);
      if (currentLeaseContext?.leaseToken && currentLeaseContext?.kwId) {
        try {
          await sql`
            UPDATE tracked_keywords
            SET crawl_lease_token = NULL,
                crawl_lease_until = NULL
            WHERE id = ${currentLeaseContext.kwId} AND crawl_lease_token = ${currentLeaseContext.leaseToken};
          `;
          console.log(`[Graceful Shutdown] Released lease for keyword ID ${currentLeaseContext.kwId}`);
        } catch (_) {}
      }
      process.exit(1);
    };
    process.once('SIGINT', () => cleanupAndExit('SIGINT'));
    process.once('SIGTERM', () => cleanupAndExit('SIGTERM'));

    const results = [];
    for (let i = 0; i < keywordsToProcess.length; i++) {
      const kw = keywordsToProcess[i];
      console.log(`\n[${i + 1}/${keywordsToProcess.length}] Crawling SERP for keyword: "${kw.keyword}" (ID: ${kw.id})...`);

      // Atomic row lease acquisition with 15-minute expiry & strict Fail-Closed policy [CAP-16]
      let leaseToken = null;
      let heartbeatTimer = null;
      try {
        const [leaseRow] = await sql`
          UPDATE tracked_keywords 
          SET crawl_lease_token = gen_random_uuid(),
              crawl_lease_until = NOW() + INTERVAL '15 minutes'
          WHERE id = ${kw.id} 
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING crawl_lease_token;
        `;
        leaseToken = leaseRow?.crawl_lease_token || null;
      } catch (lErr) {
        console.warn(`  [RowLease] Warning acquiring lease for "${kw.keyword}":`, lErr.message);
        leaseToken = null;
      }

      if (!leaseToken) {
        console.log(`  [RowLease] Keyword "${kw.keyword}" (ID: ${kw.id}) lease held by peer crawler. Non-blocking skip ✅`);
        results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: 'lease_held_by_peer' });
        continue;
      }

      currentLeaseContext = { kwId: kw.id, leaseToken };
      // 3-minute Heartbeat timer with .unref() [C3 & C7]
      heartbeatTimer = setInterval(async () => {
        try {
          await sql`
            UPDATE tracked_keywords
            SET crawl_lease_until = NOW() + INTERVAL '15 minutes'
            WHERE id = ${kw.id} AND crawl_lease_token = ${leaseToken};
          `;
        } catch (hbErr) {
          console.warn(`  [Heartbeat] Lease renewal warning for keyword ${kw.id}:`, hbErr?.message);
        }
      }, 3 * 60 * 1000);
      if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

      try {
        let crawlRes = { success: true, crawled_pins: 0, avg_velocity: 0 };
        if (enableSerpHarvest) {
          crawlRes = await crawlKeywordSERP(sql, kw.id, { cookie, max_serp_pins: maxSerpPins });
          if (crawlRes && crawlRes.success) {
            console.log(`  [+] Stage 1 Fast Crawl Success: Crawled ${crawlRes.crawled_pins} pins | Velocity: +${crawlRes.avg_velocity} saves/day`);
          }
        } else {
          console.log(`  [*] Stage 1 Live SERP Harvesting skipped (enable_serp_harvest = false). Proceeding directly to Catalog & Vault Inspection.`);
        }

        if (crawlRes && crawlRes.success) {
          // Stage 2: Exhaustive Deep Inspection across both Active SERP and Displaced Vault
          // User Directive: Inspect ALL pins for keyword without exception and without limits
          let allKeywordPins = [];
          if (crawlScope === 'active_serp') {
            allKeywordPins = await sql`
              SELECT 
                pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
                save_count, repin_count, daily_save_velocity, creator_username,
                board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
                metadata, crawled_at, updated_at, FALSE as is_displaced
              FROM keyword_serp_current
              WHERE keyword_id = ${kw.id} AND pin_id ~ '^[0-9]+$' AND is_displaced = FALSE
                AND NOT EXISTS (
                  SELECT 1 FROM keyword_ignored_pins kip
                  WHERE kip.keyword_id = ${kw.id} AND kip.pin_id = keyword_serp_current.pin_id
                )
              ORDER BY rank_position ASC;
            `;
          } else {
            allKeywordPins = await sql`
              SELECT DISTINCT ON (pin_id) *
              FROM (
                SELECT 
                  pin_id, keyword_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
                  save_count, repin_count, daily_save_velocity, creator_username,
                  board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method,
                  metadata, crawled_at, updated_at, is_displaced
                FROM keyword_serp_current
                WHERE keyword_id = ${kw.id} AND pin_id ~ '^[0-9]+$'
                  AND NOT EXISTS (
                    SELECT 1 FROM keyword_ignored_pins kip
                    WHERE kip.keyword_id = ${kw.id} AND kip.pin_id = keyword_serp_current.pin_id
                  )

                UNION ALL

                SELECT
                  kdi.pin_id, kdi.keyword_id, NULL as rank_position, kdi.last_known_rank, '' as title, '' as domain, '' as destination_url, '' as image_url,
                  kdi.save_count, kdi.repin_count, kdi.daily_save_velocity, '' as creator_username,
                  '' as board_name, '#888888' as dominant_color, '[]'::jsonb as visual_annotations, NULL as created_at_pinterest, 'pinterest_platform' as creation_method,
                  '{}'::jsonb as metadata, kdi.updated_at as crawled_at, kdi.updated_at, TRUE as is_displaced
                FROM keyword_displaced_index kdi
                WHERE kdi.keyword_id = ${kw.id} AND kdi.pin_id ~ '^[0-9]+$'
                  AND NOT EXISTS (
                    SELECT 1 FROM keyword_ignored_pins kip
                    WHERE kip.keyword_id = ${kw.id} AND kip.pin_id = kdi.pin_id
                  )
              ) combined_pins
              ORDER BY pin_id, is_displaced ASC, rank_position ASC NULLS LAST;
            `;
          }

          let serpPins = [];
          if (crawlScope === 'active_serp') {
            serpPins = (maxSerpPins > 0) ? allKeywordPins.slice(0, maxSerpPins) : allKeywordPins;
          } else {
            serpPins = (maxCatalogInspect > 0) ? allKeywordPins.slice(0, maxCatalogInspect) : allKeywordPins;
          }
          registerTargetShards(serpPins);
          console.log(`  [*] Keyword Catalog: ${allKeywordPins.length} total pins (${allKeywordPins.filter(p => !p.is_displaced).length} active + ${allKeywordPins.filter(p => p.is_displaced).length} vault). Inspecting ${serpPins.length} pins...`);

          const enrichedPins = await inspectPinsConcurrently(
            serpPins,
            kw,
            `Keyword "${kw.keyword}"`
          );

          const shardsSynced = await flushToStorageShards(buildShardSyncList(serpPins, enrichedPins, kw.id));
          console.log(`  [+] Stage 2 Success: Enriched ${enrichedPins.length} pins | Synced across ${shardsSynced} shards.`);

          results.push({
            id: kw.id,
            keyword: kw.keyword,
            category: kw.category,
            crawled_pins: crawlRes.crawled_pins || 0,
            enriched_pins: enrichedPins.length,
            shards_updated: shardsSynced,
            avg_velocity: crawlRes.avg_velocity || 0,
            status: 'success'
          });
        }
      } catch (err) {
        console.error(`  [-] Error crawling "${kw.keyword}":`, err.message);
        results.push({ id: kw.id, keyword: kw.keyword, status: 'error', error: err.message });
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        currentLeaseContext = null;
        if (leaseToken) {
          await sql`
            UPDATE tracked_keywords
            SET crawl_lease_token = NULL,
                crawl_lease_until = NULL
            WHERE id = ${kw.id} AND crawl_lease_token = ${leaseToken};
          `.catch(() => {});
        }
      }

      if (i < keywordsToProcess.length - 1) {
        const delay = 2500 + Math.floor(Math.random() * 1500);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const failedCount = results.filter(r => r.status === 'error').length;
    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`\n✅ WORKER COMPLETE: Processed ${results.length} keywords (${successCount} succeeded, ${failedCount} failed).`);
    if (keywordsToProcess.length > 0 && successCount === 0 && failedCount > 0) {
      console.error(`[-] All ${failedCount} keywords failed during this worker execution. Exiting with failure.`);
      process.exit(1);
    }
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[-] Fatal Worker Error:', err);
  process.exit(1);
});