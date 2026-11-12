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

// [INVARIANT: UNIVERSAL-SQL-CLIENT] Dual Neon / TCP Postgres
import { createUniversalSqlClient } from '../src/modules/sharding/fleet-router.mjs';
import fs from 'node:fs';
import {
  syncCompetitorProfile,
  syncCompetitorBoards,
  syncCompetitorBoardPins,
  syncCompetitorPins,
  reconcileQualifiedCatalogPins,
  normalizePinterestUsername,
  getCreatorHubSettings
} from '../src/modules/creators/service.mjs';
import {
  pinterestFetch,
  getStandardPinterestHeaders,
  randomJitterMs,
  sleep,
  setDefaultDispatcher
} from '../src/core/pinterest-client.mjs';
import {
  formatPin,
  fetchPinFromPinResource,
  fetchAndExtractPin
} from '../src/core/pinterest-parser.mjs';
import {
  fetchUserResource,
  fetchPinFromPinterest
} from './lib/pinterest.mjs';
import {
  batchGroupByShard,
  coalesceShardGroupsByPhysical,
  resolveShardConnection,
  preloadNeonRegistry,
  getPinShardId,
  crc32,
  isUnifiedPostgres
} from '../src/modules/sharding/fleet-router.mjs';
import { formatPinterestCookie, sanitizeForJsonb } from '../src/utils.mjs';
import { calculateDailyVelocity } from '../src/lib/math.mjs';
import { buildRichPinMetadataPayload, shouldSkipFreshPinEnrichment } from '../src/domain/pin-intelligence.mjs';
import { getEffectivePinterestCookie } from '../src/modules/keywords/settings.mjs';

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

const sql = createUniversalSqlClient(DATABASE_URL);
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

const AUTO_PROMOTE_PULSE_DELTA_24H = Number(process.env.AUTO_PROMOTE_PULSE_DELTA_24H || 25000);
const AUTO_PROMOTE_PULSE_DELTA_7D = Number(process.env.AUTO_PROMOTE_PULSE_DELTA_7D || 100000);

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
  // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE]
  const shardGroups = coalesceShardGroupsByPhysical(batchGroupByShard(sortedMetrics, 99));
  let totalCommitted = 0;

  if (isUnifiedPostgres()) {
    const cleanMetrics = sanitizeForJsonb(sortedMetrics);
    for (let i = 0; i < cleanMetrics.length; i += 500) {
      const chunk = cleanMetrics.slice(i, i + 500);
      const jsonPayload = JSON.stringify(chunk);
      await hubSql`
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
          save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(pins_daily_metrics.save_count, 0) END,
          repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(pins_daily_metrics.repin_count, 0) END,
          comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE COALESCE(pins_daily_metrics.comment_count, 0) END,
          share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE COALESCE(pins_daily_metrics.share_count, 0) END,
          reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE COALESCE(pins_daily_metrics.reaction_count, 0) END,
          daily_save_velocity = EXCLUDED.daily_save_velocity,
          updated_at = NOW();
      `;
      totalCommitted += chunk.length;
    }
    return totalCommitted;
  }

  const shardEntries = Array.from(shardGroups.entries());
  const SHARD_CONCURRENCY = 10;
  for (let i = 0; i < shardEntries.length; i += SHARD_CONCURRENCY) {
    const chunk = shardEntries.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardMetrics]) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId }).catch(() => null);
        if (!shardSql) return;

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
            save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(pins_daily_metrics.save_count, 0) END,
            repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(pins_daily_metrics.repin_count, 0) END,
            comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE COALESCE(pins_daily_metrics.comment_count, 0) END,
            share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE COALESCE(pins_daily_metrics.share_count, 0) END,
            reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE COALESCE(pins_daily_metrics.reaction_count, 0) END,
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
    }));
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
  // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE]
  const shardGroups = coalesceShardGroupsByPhysical(batchGroupByShard(enrichedPins, 99));
  let totalSynced = 0;

  if (isUnifiedPostgres()) {
    // [INVARIANT: MAP-DEDUPLICATION-ANTI-21000] Deduplicate by pin_id to prevent PostgreSQL Error 21000
    const uniquePinsMap = new Map();
    for (const p of enrichedPins) {
      if (p && p.pin_id) {
        uniquePinsMap.set(String(p.pin_id), p);
      }
    }
    const sortedPins = Array.from(uniquePinsMap.values()).sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
    const cleanPins = sortedPins.map(p => {
      const reactionCount = (p.reactions && typeof p.reactions === 'object' && p.reactions !== null)
        ? Object.values(p.reactions).reduce((acc, v) => acc + (Number(v) || 0), 0)
        : (Number(p.reactions) || 0);
      const richMeta = buildRichPinMetadataPayload(p);

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
        metadata: richMeta,
        save_count: Math.max(0, Number(p.saves ?? p.save_count ?? 0)),
        repin_count: Math.max(0, Number(p.repins ?? p.repin_count ?? 0)),
        comment_count: Math.max(0, Number(p.comments ?? p.comment_count ?? 0)),
        share_count: Math.max(0, Number(p.shares ?? p.share_count ?? 0)),
        reaction_count: Math.max(0, Number(reactionCount || 0)),
        daily_save_velocity: Number(p.velocity ?? p.daily_save_velocity ?? 0),
        is_product: Boolean(richMeta.is_product),
        is_video: Boolean(richMeta.is_video),
        creation_method: richMeta.creation_method || null,
        image_signature: richMeta.image_signature || null,
        seo_noindex_reason: richMeta.seo_noindex_reason || null,
        is_repin: Boolean(richMeta.is_repin),
        canonical_pin_id: richMeta.canonical_pin_id ? String(richMeta.canonical_pin_id) : null
      };
    });

    for (let i = 0; i < cleanPins.length; i += 500) {
      const chunk = cleanPins.slice(i, i + 500);
      const payload = JSON.stringify(chunk);
      await hubSql`
        INSERT INTO universal_master_pins (
          pin_id, creator_username, board_name, title, domain, destination_url, image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest, metadata,
          save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
          is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
          first_discovered_pillar, first_discovered_at, updated_at, last_scraped_at
        )
        SELECT 
          x.pin_id, x.creator_username, x.board_name, x.title, x.domain, x.destination_url, x.image_url, x.description, x.alt_text, x.dominant_color, x.visual_annotations, x.created_at_pinterest, x.metadata,
          COALESCE(x.save_count, 0)::bigint, COALESCE(x.repin_count, 0)::int, COALESCE(x.comment_count, 0)::int,
          COALESCE(x.share_count, 0)::int, COALESCE(x.reaction_count, 0)::int, COALESCE(x.daily_save_velocity, 0)::numeric,
          COALESCE(x.is_product, FALSE), COALESCE(x.is_video, FALSE), x.creation_method, x.image_signature,
          x.seo_noindex_reason, COALESCE(x.is_repin, FALSE), x.canonical_pin_id,
          'creator_hub', NOW(), NOW(), NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS x(
          pin_id VARCHAR(64), creator_username VARCHAR(128), board_name VARCHAR(255), title TEXT, domain VARCHAR(255), destination_url TEXT, image_url TEXT, description TEXT, alt_text TEXT, dominant_color VARCHAR(32), visual_annotations JSONB, created_at_pinterest TIMESTAMPTZ, metadata JSONB,
          save_count BIGINT, repin_count INT, comment_count INT, share_count INT, reaction_count INT, daily_save_velocity NUMERIC,
          is_product BOOLEAN, is_video BOOLEAN, creation_method TEXT, image_signature TEXT, seo_noindex_reason TEXT, is_repin BOOLEAN, canonical_pin_id TEXT
        )
        ORDER BY x.pin_id ASC
        ON CONFLICT (pin_id) DO UPDATE SET
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
          description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
          alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
          dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, '#888888'), universal_master_pins.dominant_color),
          visual_annotations = CASE WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations ELSE universal_master_pins.visual_annotations END,
          created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, universal_master_pins.created_at_pinterest),
          metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE COALESCE(universal_master_pins.save_count, 0) END,
          repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE COALESCE(universal_master_pins.repin_count, 0) END,
          comment_count = GREATEST(COALESCE(universal_master_pins.comment_count, 0), COALESCE(EXCLUDED.comment_count, 0)),
          share_count = GREATEST(COALESCE(universal_master_pins.share_count, 0), COALESCE(EXCLUDED.share_count, 0)),
          reaction_count = GREATEST(COALESCE(universal_master_pins.reaction_count, 0), COALESCE(EXCLUDED.reaction_count, 0)),
          daily_save_velocity = CASE
            WHEN EXCLUDED.daily_save_velocity > 0 THEN EXCLUDED.daily_save_velocity
            ELSE COALESCE(universal_master_pins.daily_save_velocity, 0)
          END,
          is_product = COALESCE(EXCLUDED.is_product, universal_master_pins.is_product, FALSE),
          is_video = COALESCE(EXCLUDED.is_video, universal_master_pins.is_video, FALSE),
          creation_method = COALESCE(NULLIF(EXCLUDED.creation_method, ''), universal_master_pins.creation_method),
          image_signature = COALESCE(NULLIF(EXCLUDED.image_signature, ''), universal_master_pins.image_signature),
          seo_noindex_reason = COALESCE(NULLIF(EXCLUDED.seo_noindex_reason, ''), universal_master_pins.seo_noindex_reason),
          is_repin = COALESCE(EXCLUDED.is_repin, universal_master_pins.is_repin, FALSE),
          canonical_pin_id = COALESCE(NULLIF(EXCLUDED.canonical_pin_id, ''), universal_master_pins.canonical_pin_id),
          updated_at = NOW(),
          last_scraped_at = NOW();
      `;
      totalSynced += chunk.length;
    }
    return totalSynced;
  }

  const shardEntries = Array.from(shardGroups.entries());
  const SHARD_CONCURRENCY = 10;
  for (let i = 0; i < shardEntries.length; i += SHARD_CONCURRENCY) {
    const chunk = shardEntries.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(chunk.map(async ([shardId, shardPins]) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId }).catch(() => null);
        if (!shardSql) return;

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
            title = CASE
              WHEN EXCLUDED.title IS NOT NULL
               AND BTRIM(EXCLUDED.title) <> ''
               AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
               AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
              THEN EXCLUDED.title
              ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
            END,
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
    }));
  }

  return totalSynced;
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
  if (isSameDay && deltaSaves === 0) {
    return { velocity: safePrevVelocity, deltaSaves };
  }
  if (isSameDay && deltaSaves > 0 && prevSaves > 0) {
    return { velocity: Math.max(safePrevVelocity, deltaSaves), deltaSaves };
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

    // -------------------------------------------------------------------------
    // Phase 1: Profile & Board List on Worker 0, then 20-Worker Parallel Board Swarm
    // -------------------------------------------------------------------------
    if (workerIndex === 0) {
      console.log(`\n[*] [Phase 1: Worker 0] Ingesting profile, board list, and feed for @${targetAccount}...`);

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

        // Signal boards_ready so all 20 workers can partition and crawl boards in parallel
        await sql`
          UPDATE crawler_shard_heartbeats
          SET status = 'boards_ready',
              updated_at = NOW()
          WHERE competitor_id = ${targetId} AND shard_number = 0;
        `.catch(() => {});
        console.log(`[*] [Phase 1: Worker 0] Announced boards_ready for 20-worker parallel board swarm.`);
      } else {
        console.log(`[*] [Phase 1: Worker 0] Account @${targetAccount} is pulse_only. Skipping board and pin catalog discovery.`);
        await sql`
          UPDATE crawler_shard_heartbeats
          SET status = 'phase1_done',
              updated_at = NOW()
          WHERE competitor_id = ${targetId} AND shard_number = 0;
        `.catch(() => {});
      }
    } else {
      // Workers 1..19 wait for Worker 0 to announce boards_ready (or phase1_done)
      console.log(`\n[*] [Phase 1: Worker ${workerIndex + 1}/${workerTotal}] Waiting for Worker 0 to announce boards_ready...`);
      const barrierStart = Date.now();
      const BARRIER_TIMEOUT_MS = 180000; // 3 min ceiling
      const isCI = process.env.GITHUB_ACTIONS === 'true';

      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [hb] = await sql`
          SELECT status, updated_at
          FROM crawler_shard_heartbeats
          WHERE competitor_id = ${targetId}
            AND shard_number = 0
            AND updated_at > NOW() - INTERVAL '10 minutes';
        `.catch(() => [null]);

        if (hb && (hb.status === 'boards_ready' || hb.status === 'crawling_boards' || hb.status === 'phase1_done')) {
          console.log(`[Phase 1] Boards ready signal received from Worker 0 in ${Math.round((Date.now() - barrierStart) / 1000)}s!`);
          break;
        }

        if (!isCI && (!hb || hb.status !== 'crawling_phase1')) {
          console.log(`[Phase 1] Local single-worker test detected (no active Worker 0 heartbeat). Proceeding.`);
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
    // Phase 1B: 20-Worker Parallel Board Swarm (board_idx % workerTotal === workerIndex)
    // -------------------------------------------------------------------------
    await sql`
      INSERT INTO crawler_shard_heartbeats (
        competitor_id, shard_number, shard_total, status, updated_at
      ) VALUES (
        ${targetId}, ${workerIndex}, ${workerTotal}, 'crawling_boards', NOW()
      )
      ON CONFLICT (competitor_id, shard_number) DO UPDATE SET
        shard_total = ${workerTotal},
        status = 'crawling_boards',
        updated_at = NOW();
    `.catch(() => {});

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

        for (const b of myBoards) {
          try {
            await syncCompetitorBoardPins(sql, targetId, targetAccount, b, {
              mode: 'discovery',
              maxPages: Math.min(20, maxPages),
              cookie: cookie
            });
          } catch (bErr) {
            console.warn(`[Phase 1B] Board "${b.name}" crawl warning:`, bErr.message);
          }
        }
      } catch (bQueryErr) {
        console.warn(`[Phase 1B] Boards query warning:`, bQueryErr.message);
      }
    }

    // Mark worker board phase complete in heartbeats table
    await sql`
      UPDATE crawler_shard_heartbeats
      SET status = 'phase1_done',
          updated_at = NOW()
      WHERE competitor_id = ${targetId} AND shard_number = ${workerIndex};
    `.catch(() => {});

    if (workerIndex === 0) {
      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${targetId};
      `.catch(() => {});
    }

    // Fast Barrier Sync across all 20 workers after parallel board crawling before Phase 2
    if (workerTotal > 1 && process.env.GITHUB_ACTIONS === 'true') {
      const boardBarrierStart = Date.now();
      const BOARD_BARRIER_TIMEOUT_MS = 180000;
      while (Date.now() - boardBarrierStart < BOARD_BARRIER_TIMEOUT_MS) {
        const [pendingRow] = await sql`
          SELECT COUNT(*)::int AS pending
          FROM crawler_shard_heartbeats
          WHERE competitor_id = ${targetId}
            AND shard_number <> ${workerIndex}
            AND status IN ('crawling_phase1', 'boards_ready', 'crawling_boards')
            AND updated_at > NOW() - INTERVAL '5 minutes';
        `.catch(() => [{ pending: 0 }]);

        const pendingBoards = Number(pendingRow?.pending || 0);
        if (pendingBoards === 0) {
          console.log(`[Phase 1B] All workers finished board ingestion in ${Math.round((Date.now() - boardBarrierStart) / 1000)}s!`);
          break;
        }
        await sleep(2000);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: 20-Runner Catalog Slice (CRC32 Modulo Partition)
    // -------------------------------------------------------------------------
    console.log(`\n[*] [Phase 2: Worker ${workerIndex + 1}/${workerTotal}] Fetching catalog slice for @${targetAccount}...`);

    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 3: Neon Egress & Shard Pushdown (competitor_pins)
    const catalogPins = await sql`
      SELECT cp.id, cp.pin_id, cp.competitor_id, cp.board_name, cp.save_count, cp.repin_count, cp.comment_count,
             cp.enrichment_status, cp.created_at_pinterest, cp.updated_at AS last_updated_at,
             COALESCE((cp.metadata->>'daily_save_velocity')::numeric, (cp.metadata->>'velocity')::numeric, 0) AS prev_velocity,
             ump.last_scraped_at, ump.save_count AS ump_saves, ump.repin_count AS ump_repins, ump.comment_count AS ump_comments,
             ump.share_count AS ump_shares, ump.daily_save_velocity AS ump_velocity,
             ump.visual_annotations, ump.image_signature, ump.creation_method, ump.metadata AS ump_metadata
      FROM competitor_pins cp
      LEFT JOIN universal_master_pins ump ON ump.pin_id = cp.pin_id
      WHERE cp.competitor_id = ${targetId}
        AND cp.pin_id IS NOT NULL AND cp.pin_id <> ''
        AND MOD(ABS(('x' || SUBSTR(MD5(cp.pin_id::text), 1, 8))::bit(32)::int::bigint), ${workerTotal}) = ${workerIndex}
      ORDER BY cp.id ASC;
    `;

    const myCatalogSlice = catalogPins;
    console.log(`[Phase 2] Worker #${workerIndex + 1}/${workerTotal} assigned ${myCatalogSlice.length} pins.`);

    let refreshedCount = 0;
    const refreshedPins = [];
    const metricSnapshots = [];
    const masterPinsToSync = [];

    if (myCatalogSlice.length > 0) {
      const CONCURRENCY = 8;
      const sem = new Semaphore(CONCURRENCY);

      await Promise.allSettled(myCatalogSlice.map(p => sem.run(async () => {
        const prevSaves = Math.max(0, Number(p.ump_saves ?? p.save_count ?? 0));
        const prevRepins = Math.max(0, Number(p.ump_repins ?? p.repin_count ?? 0));
        const prevComments = Math.max(0, Number(p.ump_comments ?? p.comment_count ?? 0));
        const prevVelocity = Number(p.prev_velocity ?? p.ump_velocity ?? 0);

        // 18-Hour Shared Pin Freshness Gate: Skip duplicate HTTP call if pin was already scraped within 18h in universal_master_pins
        const masterSnapshot = {
          last_scraped_at: p.last_scraped_at,
          save_count: prevSaves,
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
            share_count: Number(p.ump_shares || 0),
            velocity: prevVelocity,
            delta_saves: prevVelocity,
            delta_repins: 0
          });
          refreshedCount++;
          return;
        }

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

          const freshRepins = rawFreshRepins > 0 ? rawFreshRepins : prevRepins;
          // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE] Never pass freshRepins to freshSaves
          const freshSaves = rawFreshSaves > 0 ? rawFreshSaves : prevSaves;
          const freshComments = rawFreshComments > 0 ? rawFreshComments : prevComments;

          const { velocity, deltaSaves } = computeNormalized24hVelocity(p, freshSaves, prevSaves, prevVelocity, freshRepins, prevRepins);
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
        SET save_count = CASE WHEN x.saves > 0 THEN x.saves::bigint ELSE COALESCE(cp.save_count, 0) END,
            repin_count = CASE WHEN x.repins > 0 THEN x.repins::bigint ELSE COALESCE(cp.repin_count, 0) END,
            comment_count = CASE WHEN x.comments > 0 THEN x.comments::int ELSE COALESCE(cp.comment_count, 0) END,
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
      // [INVARIANT: RUNNER-0-RECONCILIATION-LEADER] Only worker 0 runs reconciliation to prevent stampede
      if (workerIndex === 0) {
        try {
          const recon = await reconcileQualifiedCatalogPins(sql, targetId);
          if (recon?.promoted_or_updated > 0) {
            console.log(`[Phase 2] Promoted ${recon.promoted_or_updated} qualified pins into pa_pins.`);
          }
        } catch (rErr) {
          console.warn(`[Phase 2] Qualification reconciliation warning:`, rErr.message);
        }
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
      process.exit(0);
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
        const payloadJson = JSON.stringify(sanitizeForJsonb(chunk));

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
            await sql`
              UPDATE crawler_shard_heartbeats
              SET updated_at = NOW()
              WHERE competitor_id = 0 AND shard_number = ${workerIndex};
            `.catch(() => {});
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
    for (let i = 0; i < fullAccounts.length; i++) {
      const acc = fullAccounts[i];
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
      } else {
        console.log(`[*] Account @${cleanUser} auto-promoted but auto_harvest_pins is disabled in settings. Skipping pin harvest.`);
      }

      await sql`
        UPDATE competitor_profiles
        SET updated_at = NOW()
        WHERE id = ${acc.id};
      `.catch(() => {});

      accountsProcessed++;
      if (accountsProcessed > 0 && accountsProcessed % 25 === 0) {
        await sql`
          UPDATE crawler_shard_heartbeats
          SET updated_at = NOW()
          WHERE competitor_id = 0 AND shard_number = ${workerIndex};
        `.catch(() => {});
      }
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
      const BARRIER_TIMEOUT_MS = 240000; // 4 min max wait

      while (Date.now() - barrierStart < BARRIER_TIMEOUT_MS) {
        const [pendingRow] = await sql`
          SELECT COUNT(*)::int AS pending
          FROM crawler_shard_heartbeats
          WHERE competitor_id = 0
            AND shard_number <> ${workerIndex}
            AND status = 'crawling_phase1'
            AND updated_at > NOW() - INTERVAL '5 minutes';
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

    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 3: Neon Egress & Shard Pushdown (pa_pins)
    const myWinningSlice = await sql`
      SELECT 
        p.pin_id, p.account_username, p.board_name,
        p.saves, p.repins, p.comments, p.share_count,
        p.velocity, p.last_updated_at, p.created_at_pinterest
      FROM pa_pins p
      LEFT JOIN competitor_profiles cp ON cp.username = p.account_username
      WHERE MOD(ABS(('x' || SUBSTR(MD5(p.pin_id::text), 1, 8))::bit(32)::int::bigint), ${workerTotal}) = ${workerIndex}
        AND (cp.tracking_mode IS NULL OR cp.tracking_mode <> 'pulse_only')
      ORDER BY p.saves DESC;
    `;
    console.log(`[*] Worker #${workerIndex + 1}/${workerTotal} assigned ${myWinningSlice.length} global winning pins.`);

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

            const freshRepins = rawFreshRepins > 0 ? rawFreshRepins : prevRepins;
            // [INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE] Never pass freshRepins to freshSaves
            const freshSaves = rawFreshSaves > 0 ? rawFreshSaves : prevSaves;
            const freshComments = rawFreshComments > 0 ? rawFreshComments : prevComments;

            const { velocity, deltaSaves } = computeNormalized24hVelocity(p, freshSaves, prevSaves, prevVelocity, freshRepins, prevRepins);
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
        SET saves = CASE WHEN x.saves > 0 THEN x.saves::bigint ELSE COALESCE(p.saves, 0) END,
            repins = CASE WHEN x.repins > 0 THEN x.repins::bigint ELSE COALESCE(p.repins, 0) END,
            comments = CASE WHEN x.comments > 0 THEN x.comments::int ELSE COALESCE(p.comments, 0) END,
            share_count = CASE WHEN x.share_count > 0 THEN x.share_count::bigint ELSE COALESCE(p.share_count, 0) END,
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
        SET save_count = CASE WHEN x.saves > 0 THEN x.saves::bigint ELSE COALESCE(cp.save_count, 0) END,
            repin_count = CASE WHEN x.repins > 0 THEN x.repins::bigint ELSE COALESCE(cp.repin_count, 0) END,
            comment_count = CASE WHEN x.comments > 0 THEN x.comments::int ELSE COALESCE(cp.comment_count, 0) END,
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
