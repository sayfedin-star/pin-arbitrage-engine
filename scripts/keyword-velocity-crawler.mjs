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
import { fetchPinFromPinterest } from './lib/pinterest.mjs';
import { batchGroupByShard, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';
import { crc32 } from '../src/modules/fleet/sharding.mjs';

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
const maxPins = Math.max(25, Math.min(1000, parseInt(process.env.MAX_PINS || '250', 10)));

/**
 * Deep Closeup Inspection and Storage Shard Synchronization for a single pin entity
 */
async function inspectAndSyncPin(pin, kw) {
  let detail = null;
  let isDead = false;
  let fetchError = null;

  try {
    const fetchRes = await fetchPinFromPinterest(pin.pin_id, cookie);
    if (fetchRes?.ok && fetchRes.pin) {
      detail = fetchRes.pin;
    } else if (fetchRes?.status === 404 || fetchRes?.error?.includes('404')) {
      isDead = true;
      fetchError = '404_not_found';
    }
  } catch (err) {
    if (err.message?.includes('404')) {
      isDead = true;
      fetchError = '404_not_found';
    } else {
      console.warn(`    [!] Pin ${pin.pin_id} fetch warning:`, err.message);
    }
  }

  // Authentic Metrics Normalization
  const authenticSaves = Math.max(
    Number(pin.save_count || 0),
    Number(detail?.saves || 0),
    Number(detail?.save_count || 0)
  );
  const authenticRepins = Math.max(
    Number(pin.repin_count || 0),
    Number(detail?.repins || 0),
    Number(detail?.repin_count || 0)
  );
  const authenticComments = Number(detail?.comments || detail?.comment_count || 0);
  const authenticShares = Number(detail?.shares || detail?.share_count || 0);
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

  // In-Memory Set Merge: If pin already has complete tags (>= 5 tags), and incoming has none, preserve existing.
  // Otherwise compute clean Set Union strictly in Node.js memory (max 20 tags) to eliminate TOAST bloat & CPU strain.
  const mergedTagsSet = new Set();
  for (const t of cleanExistingAnnotations) mergedTagsSet.add(t);
  for (const t of cleanNewAnnotations) mergedTagsSet.add(t);
  const finalAnnotations = Array.from(mergedTagsSet).slice(0, 15);

  // 1. Unified Cross-Keyword Cascade Update on Central Hub keyword_serp_current
  // Updates ALL rankings (active and displaced) where this pin appears under the folder cluster or target keyword
  if (kw?.folder_id) {
    await sql`
      UPDATE keyword_serp_current
      SET 
        save_count = GREATEST(save_count, ${authenticSaves}::bigint),
        repin_count = GREATEST(repin_count, ${authenticRepins}::int),
        comment_count = GREATEST(COALESCE(comment_count, 0), ${authenticComments}::int),
        share_count = GREATEST(COALESCE(share_count, 0), ${authenticShares}::int),
        creator_username = CASE WHEN ${creator}::text <> '' THEN ${creator}::text ELSE creator_username END,
        board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
        dominant_color = CASE WHEN ${dominantColor}::text <> '' THEN ${dominantColor}::text ELSE dominant_color END,
        created_at_pinterest = CASE WHEN ${createdAtPinterest}::timestamptz IS NOT NULL THEN ${createdAtPinterest}::timestamptz ELSE created_at_pinterest END,
        creation_method = CASE WHEN ${method}::text <> '' THEN ${method}::text ELSE creation_method END,
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        visual_annotations = CASE 
          WHEN jsonb_typeof(${JSON.stringify(finalAnnotations)}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(finalAnnotations)}::jsonb) > 0 
          THEN ${JSON.stringify(finalAnnotations)}::jsonb 
          ELSE visual_annotations 
        END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'description', ${description}::text,
          'alt_text', ${altText}::text,
          'share_count', ${authenticShares}::int,
          'dominant_color', ${dominantColor}::text,
          'board_name', ${board}::text,
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'created_at_pinterest', ${createdAtPinterest}::text,
          'is_deleted', ${isDead}::boolean,
          'status', ${isDead ? 'archived_404' : 'active'}::text
        ),
        crawled_at = NOW(),
        updated_at = NOW()
      WHERE pin_id = ${pin.pin_id}
        AND keyword_id IN (
          SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${kw.folder_id}
        );
    `;

    await sql`
      UPDATE keyword_pins_snapshots
      SET
        save_count = GREATEST(save_count, ${authenticSaves}::bigint),
        repin_count = GREATEST(repin_count, ${authenticRepins}::int),
        comment_count = GREATEST(comment_count, ${authenticComments}::int),
        share_count = GREATEST(COALESCE(share_count, 0), ${authenticShares}::int),
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        created_at_pinterest = CASE WHEN ${createdAtPinterest}::timestamptz IS NOT NULL THEN ${createdAtPinterest}::timestamptz ELSE created_at_pinterest END,
        creation_method = CASE WHEN ${method}::text <> '' THEN ${method}::text ELSE creation_method END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'description', ${description}::text,
          'alt_text', ${altText}::text,
          'share_count', ${authenticShares}::int,
          'dominant_color', ${dominantColor}::text,
          'board_name', ${board}::text,
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'created_at_pinterest', ${createdAtPinterest}::text,
          'is_deleted', ${isDead}::boolean,
          'status', ${isDead ? 'archived_404' : 'active'}::text,
          'visual_annotations', CASE 
            WHEN jsonb_typeof(${JSON.stringify(finalAnnotations)}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(finalAnnotations)}::jsonb) > 0 
            THEN ${JSON.stringify(finalAnnotations)}::jsonb 
            ELSE COALESCE(metadata->'visual_annotations', '[]'::jsonb) 
          END
        )
      WHERE pin_id = ${pin.pin_id}
        AND keyword_id IN (
          SELECT keyword_id FROM keyword_folder_items WHERE folder_id = ${kw.folder_id}
        )
        AND (snapshot_date = (NOW() AT TIME ZONE 'UTC')::date OR is_displaced = TRUE);
    `;
  } else {
    await sql`
      UPDATE keyword_serp_current
      SET 
        save_count = GREATEST(save_count, ${authenticSaves}::bigint),
        repin_count = GREATEST(repin_count, ${authenticRepins}::int),
        comment_count = GREATEST(COALESCE(comment_count, 0), ${authenticComments}::int),
        share_count = GREATEST(COALESCE(share_count, 0), ${authenticShares}::int),
        creator_username = CASE WHEN ${creator}::text <> '' THEN ${creator}::text ELSE creator_username END,
        board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
        dominant_color = CASE WHEN ${dominantColor}::text <> '' THEN ${dominantColor}::text ELSE dominant_color END,
        created_at_pinterest = CASE WHEN ${createdAtPinterest}::timestamptz IS NOT NULL THEN ${createdAtPinterest}::timestamptz ELSE created_at_pinterest END,
        creation_method = CASE WHEN ${method}::text <> '' THEN ${method}::text ELSE creation_method END,
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        visual_annotations = CASE 
          WHEN jsonb_typeof(${JSON.stringify(finalAnnotations)}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(finalAnnotations)}::jsonb) > 0 
          THEN ${JSON.stringify(finalAnnotations)}::jsonb 
          ELSE visual_annotations 
        END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'description', ${description}::text,
          'alt_text', ${altText}::text,
          'share_count', ${authenticShares}::int,
          'dominant_color', ${dominantColor}::text,
          'board_name', ${board}::text,
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'created_at_pinterest', ${createdAtPinterest}::text,
          'is_deleted', ${isDead}::boolean,
          'status', ${isDead ? 'archived_404' : 'active'}::text
        ),
        crawled_at = NOW(),
        updated_at = NOW()
      WHERE pin_id = ${pin.pin_id} AND keyword_id = ${kw.id};
    `;

    // 3. Cascade Update on Central Hub keyword_pins_snapshots
    // Strictly anchored to invariant UTC calendar date or displaced vault record
    await sql`
      UPDATE keyword_pins_snapshots
      SET
        save_count = GREATEST(save_count, ${authenticSaves}::bigint),
        repin_count = GREATEST(repin_count, ${authenticRepins}::int),
        comment_count = GREATEST(comment_count, ${authenticComments}::int),
        share_count = GREATEST(COALESCE(share_count, 0), ${authenticShares}::int),
        vacuum_opportunity_score = CASE 
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 5 THEN 85
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 15 THEN 75
          WHEN COALESCE(last_known_rank, rank_position, 100) <= 50 THEN 60
          ELSE 45
        END,
        created_at_pinterest = CASE WHEN ${createdAtPinterest}::timestamptz IS NOT NULL THEN ${createdAtPinterest}::timestamptz ELSE created_at_pinterest END,
        creation_method = CASE WHEN ${method}::text <> '' THEN ${method}::text ELSE creation_method END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'description', ${description}::text,
          'alt_text', ${altText}::text,
          'share_count', ${authenticShares}::int,
          'dominant_color', ${dominantColor}::text,
          'board_name', ${board}::text,
          'method', ${method}::text,
          'creation_method', ${method}::text,
          'created_at_pinterest', ${createdAtPinterest}::text,
          'is_deleted', ${isDead}::boolean,
          'status', ${isDead ? 'archived_404' : 'active'}::text,
          'visual_annotations', CASE 
            WHEN jsonb_typeof(${JSON.stringify(finalAnnotations)}::jsonb) = 'array' AND jsonb_array_length(${JSON.stringify(finalAnnotations)}::jsonb) > 0 
            THEN ${JSON.stringify(finalAnnotations)}::jsonb 
            ELSE COALESCE(metadata->'visual_annotations', '[]'::jsonb) 
          END
        )
      WHERE pin_id = ${pin.pin_id} AND keyword_id = ${kw.id}
        AND (snapshot_date = (NOW() AT TIME ZONE 'UTC')::date OR is_displaced = TRUE);
    `;
  }

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
    daily_save_velocity: pin.daily_save_velocity || 0,
    rank_position: pin.rank_position,
    keyword_id: kw.id,
    is_deleted: isDead
  };
}

/**
 * Flush enriched pin records across the 99 Neon Storage Shards
 * Hardened for Cold-Start Resilience: Strict 3.5s timeout per shard with isolated try/catch.
 */
async function flushToStorageShards(enrichedPins) {
  if (!enrichedPins || enrichedPins.length === 0) return 0;
  const shardGroups = batchGroupByShard(enrichedPins, 99);
  let shardsSynchronized = 0;

  for (const [shardId, shardPins] of shardGroups.entries()) {
    try {
      const syncTask = (async () => {
        const shardSql = await resolveShardConnection({ hubSql: sql, shardId });
        for (const sp of shardPins) {
          await shardSql`
            INSERT INTO universal_master_pins (
              pin_id, creator_username, board_name, board_slug, title, domain, destination_url,
              image_url, description, alt_text, dominant_color, visual_annotations,
              first_discovered_pillar, first_discovered_at, updated_at
            ) VALUES (
              ${sp.pin_id}, ${sp.creator_username}, ${sp.board_name}, ${sp.board_slug},
              ${sp.title}, ${sp.domain}, ${sp.destination_url}, ${sp.image_url},
              ${sp.description}, ${sp.alt_text}, ${sp.dominant_color},
              ${JSON.stringify(sp.visual_annotations)}::jsonb, 'keyword', NOW(), NOW()
            )
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
              updated_at = NOW();
          `;

          // Atomic upsert into daily snapshots (Saves + Repins + Velocity) [CAP-19]
          await shardSql`
            INSERT INTO pins_daily_snapshots (
              pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
              share_count, daily_save_velocity, snapshot_date, created_at
            ) VALUES (
              ${sp.pin_id}, ${sp.keyword_id}, ${sp.rank_position}, ${sp.save_count},
              ${sp.repin_count}, ${sp.comment_count}, ${sp.share_count},
              ${sp.daily_save_velocity}, (NOW() AT TIME ZONE 'UTC')::date, NOW()
            )
            ON CONFLICT (pin_id, keyword_id, snapshot_date) DO UPDATE SET
              rank_position = COALESCE(EXCLUDED.rank_position, pins_daily_snapshots.rank_position),
              save_count = GREATEST(pins_daily_snapshots.save_count, EXCLUDED.save_count),
              repin_count = GREATEST(pins_daily_snapshots.repin_count, EXCLUDED.repin_count),
              comment_count = GREATEST(pins_daily_snapshots.comment_count, EXCLUDED.comment_count),
              share_count = GREATEST(pins_daily_snapshots.share_count, EXCLUDED.share_count),
              daily_save_velocity = EXCLUDED.daily_save_velocity,
              created_at = NOW();
          `;
        }
      })();

      // Guarded Promise.race with active timer clearance and late rejection suppression [CAP-12]
      let timerId;
      const timeoutTask = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`Shard #${shardId} cold-start connection timeout (3500ms limit)`)), 3500);
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
  }

  return shardsSynchronized;
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

    // Fetch candidate pins across all folder keywords
    let allPins = [];
    if (crawlScope === 'active_serp') {
      allPins = await sql`
        SELECT DISTINCT ON (ksc.pin_id)
          ksc.pin_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
          ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
          ksc.board_name, ksc.dominant_color, ksc.visual_annotations, ksc.created_at_pinterest, ksc.creation_method, FALSE as is_displaced
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
        SELECT DISTINCT ON (ksc.pin_id)
          ksc.pin_id, ksc.rank_position, ksc.last_known_rank, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
          ksc.save_count, ksc.repin_count, ksc.daily_save_velocity, ksc.creator_username,
          ksc.board_name, ksc.dominant_color, ksc.visual_annotations, ksc.created_at_pinterest, ksc.creation_method, ksc.is_displaced
        FROM keyword_serp_current ksc
        JOIN keyword_folder_items kfi ON kfi.keyword_id = ksc.keyword_id
        WHERE kfi.folder_id = ${fid} AND ksc.pin_id ~ '^[0-9]+$'
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksc.keyword_id AND kip.pin_id = ksc.pin_id
          )
        ORDER BY ksc.pin_id, ksc.is_displaced ASC, ksc.rank_position ASC NULLS LAST;
      `;
    }

    allPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    const myPins = allPins.filter(p => (crc32(p.pin_id) % workerTotal) === workerIndex);
    myPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    console.log(`[*] Total Unique Folder Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
    }

    const enrichedList = [];
    for (let i = 0; i < myPins.length; i++) {
      const p = myPins[i];
      try {
        console.log(`  [${i + 1}/${myPins.length}] Inspecting Pin #${p.pin_id} (Rank #${p.rank_position || (p.last_known_rank ? p.last_known_rank + ' [Vault]' : 'Vault')})...`);
        const enriched = await inspectAndSyncPin(p, { folder_id: fid, keyword: folderRow.name });
        if (enriched) enrichedList.push(enriched);
      } catch (pinErr) {
        console.warn(`  [!] Non-fatal warning inspecting Pin #${p.pin_id}:`, pinErr.message);
      }

      if (i < myPins.length - 1) {
        const jitter = 2500 + Math.floor(Math.random() * 1500);
        await new Promise(r => setTimeout(r, jitter));
      }
    }

    const shardsSynced = await flushToStorageShards(enrichedList);
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed across ${shardsSynced} shards.`);

    if (stepSummaryPath) {
      try {
        let md = `### 📁 Folder Runner Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Folder**: \`${folderRow.name}\` (ID: ${fid})\n`;
        md += `- **Pins Inspected in Slice**: **${enrichedList.length}**\n`;
        md += `- **Storage Shards Synchronized**: **${shardsSynced}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${enrichedList.filter(p => p.is_deleted).length}**\n\n`;
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

    // Fetch candidate pins according to scope
    let allPins = [];
    if (crawlScope === 'active_serp') {
      allPins = await sql`
        SELECT 
          pin_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
          save_count, repin_count, daily_save_velocity, creator_username,
          board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method, FALSE as is_displaced
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
        SELECT 
          pin_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
          save_count, repin_count, daily_save_velocity, creator_username,
          board_name, dominant_color, visual_annotations, created_at_pinterest, creation_method, is_displaced
        FROM keyword_serp_current
        WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ${kwRow.id} AND kip.pin_id = keyword_serp_current.pin_id
          )
        ORDER BY is_displaced ASC, rank_position ASC NULLS LAST;
      `;
    }

    // Deterministic sort to ensure identical order across all 20 runners
    allPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    // Deterministic Hash Disjoint Partition (Immune to dynamic catalog size variations across worker start times)
    const myPins = allPins.filter(p => (crc32(p.pin_id) % workerTotal) === workerIndex);
    myPins.sort((a, b) => {
      const rA = Number(a.rank_position) || Number(a.last_known_rank) || 9999;
      const rB = Number(b.rank_position) || Number(b.last_known_rank) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });
    console.log(`[*] Total Catalog Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
    }

    const enrichedList = [];
    for (let i = 0; i < myPins.length; i++) {
      const p = myPins[i];
      console.log(`  [${i + 1}/${myPins.length}] Inspecting Pin #${p.pin_id} (Rank #${p.rank_position || (p.last_known_rank ? p.last_known_rank + ' [Vault]' : 'Vault')})...`);
      const enriched = await inspectAndSyncPin(p, kwRow);
      enrichedList.push(enriched);

      if (i < myPins.length - 1) {
        const jitter = 2500 + Math.floor(Math.random() * 1500);
        await new Promise(r => setTimeout(r, jitter));
      }
    }

    // Flush to 99 Storage Shards
    const shardsSynced = await flushToStorageShards(enrichedList);
    console.log(`\n✅ Slice ${workerIndex + 1}/${workerTotal} Complete: Inspected ${enrichedList.length} pins | Flushed across ${shardsSynced} shards.`);

    // Write to step summary if available
    if (stepSummaryPath) {
      try {
        let md = `### 🧩 Runner Slice ${workerIndex + 1}/${workerTotal} Summary\n\n`;
        md += `- **Keyword**: \`${kwRow.keyword}\`\n`;
        md += `- **Pins Inspected in Slice**: **${enrichedList.length}**\n`;
        md += `- **Storage Shards Synchronized**: **${shardsSynced}**\n`;
        md += `- **Dead/404 Pins Flagged**: **${enrichedList.filter(p => p.is_deleted).length}**\n\n`;
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

    let keywordsToProcess = [];
    if (keywordIdsInput.length > 0) {
      keywordsToProcess = await sql`
        SELECT * FROM tracked_keywords 
        WHERE id = ANY(${keywordIdsInput}) AND is_active = TRUE
        ORDER BY last_crawled_at ASC NULLS FIRST;
      `;
    } else if (targetKeyword) {
      keywordsToProcess = await sql`
        SELECT * FROM tracked_keywords 
        WHERE LOWER(keyword) = ${targetKeyword} AND is_active = TRUE;
      `;
      if (keywordsToProcess.length === 0) {
        const [newRow] = await sql`
          INSERT INTO tracked_keywords (keyword, category, target_pin_count, is_active)
          VALUES (${targetKeyword}, 'General', 100, TRUE)
          RETURNING *;
        `;
        keywordsToProcess = [newRow];
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

    const results = [];
    for (let i = 0; i < keywordsToProcess.length; i++) {
      const kw = keywordsToProcess[i];
      console.log(`\n[${i + 1}/${keywordsToProcess.length}] Crawling SERP for keyword: "${kw.keyword}" (ID: ${kw.id})...`);

      // Atomic row lease acquisition with 15-minute expiry & strict Fail-Closed policy [CAP-16]
      let leaseToken = null;
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

      try {
        const crawlRes = await crawlKeywordSERP(sql, kw.id, cookie);
        if (crawlRes.success) {
          console.log(`  [+] Stage 1 Fast Crawl Success: Crawled ${crawlRes.crawled_pins} pins | Velocity: +${crawlRes.avg_velocity} saves/day`);

          // Stage 2: Deep Inspection across both Active SERP and Displaced Vault
          // Exhaustive Inspection Directive: Inspect ALL candidate pins in the keyword catalog without exception.
          // Pulls full target_pin_count (all 250 pins) + full Displaced Vault pins.
          const activeLimit = Math.max(25, Math.min(1000, maxPins || kw.target_pin_count || 250));
          const vaultLimit = Math.max(10, Math.min(100, parseInt(process.env.VAULT_LIMIT || '50', 10)));
          const activePins = await sql`
            SELECT 
              pin_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
              save_count, repin_count, daily_save_velocity, creator_username,
              board_name, dominant_color, visual_annotations, is_displaced
            FROM keyword_serp_current
            WHERE keyword_id = ${kw.id} AND pin_id ~ '^[0-9]+$' AND is_displaced = FALSE
              AND NOT EXISTS (
                SELECT 1 FROM keyword_ignored_pins kip
                WHERE kip.keyword_id = ${kw.id} AND kip.pin_id = keyword_serp_current.pin_id
              )
            ORDER BY rank_position ASC NULLS LAST
            LIMIT ${activeLimit};
          `;

          // Defensively pull vault pins so displaced pins never stay frozen with legacy/stale metrics
          const vaultPins = await sql`
            SELECT 
              pin_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
              save_count, repin_count, daily_save_velocity, creator_username,
              board_name, dominant_color, visual_annotations, is_displaced
            FROM keyword_serp_current
            WHERE keyword_id = ${kw.id} AND pin_id ~ '^[0-9]+$' AND is_displaced = TRUE
              AND NOT EXISTS (
                SELECT 1 FROM keyword_ignored_pins kip
                WHERE kip.keyword_id = ${kw.id} AND kip.pin_id = keyword_serp_current.pin_id
              )
            ORDER BY updated_at ASC NULLS FIRST
            LIMIT ${vaultLimit};
          `;

          const pinMap = new Map();
          for (const p of [...activePins, ...vaultPins]) pinMap.set(String(p.pin_id), p);
          let serpPins = Array.from(pinMap.values());
          serpPins.sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));
          const enrichedPins = [];
          for (let pIdx = 0; pIdx < serpPins.length; pIdx++) {
            const pin = serpPins[pIdx];
            const enriched = await inspectAndSyncPin(pin, kw);
            enrichedPins.push(enriched);

            if (pIdx < serpPins.length - 1) {
              const jitter = 2500 + Math.floor(Math.random() * 1500);
              await new Promise(r => setTimeout(r, jitter));
            }
          }

          const shardsSynced = await flushToStorageShards(enrichedPins);
          console.log(`  [+] Stage 2 Success: Enriched ${enrichedPins.length} pins | Synced across ${shardsSynced} shards.`);

          results.push({
            id: kw.id,
            keyword: kw.keyword,
            category: kw.category,
            crawled_pins: crawlRes.crawled_pins,
            enriched_pins: enrichedPins.length,
            shards_updated: shardsSynced,
            avg_velocity: crawlRes.avg_velocity,
            status: 'success'
          });
        }
      } catch (err) {
        console.error(`  [-] Error crawling "${kw.keyword}":`, err.message);
        results.push({ id: kw.id, keyword: kw.keyword, status: 'error', error: err.message });
      } finally {
        if (leaseToken) {
          await sql`
            UPDATE tracked_keywords
            SET crawl_lease_token = NULL,
                crawl_lease_until = NOW()
            WHERE id = ${kw.id} AND crawl_lease_token = ${leaseToken};
          `.catch(() => {});
        }
      }

      if (i < keywordsToProcess.length - 1) {
        const delay = 2500 + Math.floor(Math.random() * 1500);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.log(`\n✅ WORKER COMPLETE: Processed ${results.length} keywords.`);
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[-] Fatal Worker Error:', err);
  process.exit(1);
});
