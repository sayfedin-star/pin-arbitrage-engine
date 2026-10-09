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
const crawlScope = (process.env.CRAWL_SCOPE || 'all_pins').toLowerCase().trim();
const cookie = process.env.PINTEREST_COOKIE || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;
const maxPins = Math.max(5, Math.min(250, parseInt(process.env.MAX_PINS || '100', 10)));

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

  // Visual Annotations CV Extraction
  let rawAnnotations = [];
  if (detail?.annotations && Array.isArray(detail.annotations) && detail.annotations.length > 0) {
    rawAnnotations = detail.annotations.map(a => typeof a === 'string' ? a : (a.name || a.label || ''));
  } else if (detail?.tags && Array.isArray(detail.tags)) {
    rawAnnotations = detail.tags;
  } else if (detail?.pinJoin?.visualAnnotation) {
    rawAnnotations = detail.pinJoin.visualAnnotation;
  } else if (Array.isArray(pin.visual_annotations)) {
    rawAnnotations = pin.visual_annotations;
  }
  const cleanAnnotations = [...new Set(rawAnnotations.map(s => String(s || '').trim()).filter(s => s.length >= 2))];

  // 1. Update Central Hub keyword_serp_current (if active in today's SERP)
  if (!pin.is_displaced) {
    if (cleanAnnotations.length > 0) {
      await sql`
        UPDATE keyword_serp_current
        SET 
          save_count = GREATEST(save_count, ${authenticSaves}::bigint),
          repin_count = GREATEST(repin_count, ${authenticRepins}::int),
          creator_username = CASE WHEN ${creator}::text <> '' THEN ${creator}::text ELSE creator_username END,
          board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
          dominant_color = CASE WHEN ${dominantColor}::text <> '' THEN ${dominantColor}::text ELSE dominant_color END,
          visual_annotations = (
            SELECT COALESCE(jsonb_agg(DISTINCT tag), '[]'::jsonb)
            FROM (
              SELECT jsonb_array_elements_text(COALESCE(keyword_serp_current.visual_annotations, '[]'::jsonb)) AS tag
              UNION
              SELECT jsonb_array_elements_text(${JSON.stringify(cleanAnnotations)}::jsonb) AS tag
            ) u WHERE tag IS NOT NULL AND tag <> ''
          )
        WHERE keyword_id = ${kw.id} AND pin_id = ${pin.pin_id};
      `;
    } else {
      await sql`
        UPDATE keyword_serp_current
        SET 
          save_count = GREATEST(save_count, ${authenticSaves}::bigint),
          repin_count = GREATEST(repin_count, ${authenticRepins}::int),
          creator_username = CASE WHEN ${creator}::text <> '' THEN ${creator}::text ELSE creator_username END,
          board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
          dominant_color = CASE WHEN ${dominantColor}::text <> '' THEN ${dominantColor}::text ELSE dominant_color END
        WHERE keyword_id = ${kw.id} AND pin_id = ${pin.pin_id};
      `;
    }
  }

  // 2. Update Central Hub keyword_pins_snapshots
  await sql`
    UPDATE keyword_pins_snapshots
    SET
      save_count = GREATEST(save_count, ${authenticSaves}::bigint),
      repin_count = GREATEST(repin_count, ${authenticRepins}::int),
      comment_count = GREATEST(comment_count, ${authenticComments}::int),
      share_count = GREATEST(COALESCE(share_count, 0), ${authenticShares}::int),
      metadata = metadata || jsonb_build_object(
        'description', ${description}::text,
        'alt_text', ${altText}::text,
        'share_count', ${authenticShares}::int,
        'dominant_color', ${dominantColor}::text,
        'is_deleted', ${isDead}::boolean,
        'status', ${isDead ? 'archived_404' : 'active'}::text,
        'visual_annotations', (
          SELECT COALESCE(jsonb_agg(DISTINCT tag), '[]'::jsonb)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(keyword_pins_snapshots.metadata->'visual_annotations', '[]'::jsonb)) AS tag
            UNION
            SELECT jsonb_array_elements_text(${JSON.stringify(cleanAnnotations)}::jsonb) AS tag
          ) u WHERE tag IS NOT NULL AND tag <> ''
        )
      )
    WHERE keyword_id = ${kw.id} AND pin_id = ${pin.pin_id} AND snapshot_date = CURRENT_DATE;
  `;

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
    visual_annotations: cleanAnnotations,
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
 */
async function flushToStorageShards(enrichedPins) {
  if (!enrichedPins || enrichedPins.length === 0) return 0;
  const shardGroups = batchGroupByShard(enrichedPins, 99);
  let shardsSynchronized = 0;

  for (const [shardId, shardPins] of shardGroups.entries()) {
    try {
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
            title = COALESCE(EXCLUDED.title, universal_master_pins.title),
            domain = COALESCE(EXCLUDED.domain, universal_master_pins.domain),
            destination_url = COALESCE(EXCLUDED.destination_url, universal_master_pins.destination_url),
            image_url = COALESCE(EXCLUDED.image_url, universal_master_pins.image_url),
            description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
            alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
            dominant_color = COALESCE(EXCLUDED.dominant_color, universal_master_pins.dominant_color),
            visual_annotations = CASE 
              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
                   AND jsonb_typeof(universal_master_pins.visual_annotations) = 'array' AND jsonb_array_length(universal_master_pins.visual_annotations) > 0 THEN (
                SELECT COALESCE(jsonb_agg(DISTINCT tag), '[]'::jsonb)
                FROM (
                  SELECT jsonb_array_elements_text(universal_master_pins.visual_annotations) AS tag
                  UNION
                  SELECT jsonb_array_elements_text(EXCLUDED.visual_annotations) AS tag
                ) u
                WHERE tag IS NOT NULL AND tag <> ''
              )
              WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0 
              THEN EXCLUDED.visual_annotations
              ELSE universal_master_pins.visual_annotations
            END,
            updated_at = NOW();
        `;

        // Deduplicate daily snapshot for same pin + keyword on CURRENT_DATE
        await shardSql`
          DELETE FROM pins_daily_snapshots 
          WHERE pin_id = ${sp.pin_id} AND keyword_id = ${sp.keyword_id} AND snapshot_date = CURRENT_DATE;
        `.catch(() => {});

        // Insert fresh daily telemetry record (Saves + Repins + Velocity)
        await shardSql`
          INSERT INTO pins_daily_snapshots (
            pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
            share_count, daily_save_velocity, snapshot_date, created_at
          ) VALUES (
            ${sp.pin_id}, ${sp.keyword_id}, ${sp.rank_position}, ${sp.save_count},
            ${sp.repin_count}, ${sp.comment_count}, ${sp.share_count},
            ${sp.daily_save_velocity}, CURRENT_DATE, NOW()
          );
        `;
      }
      shardsSynchronized++;
    } catch (shardErr) {
      console.warn(`    [Shard ${shardId} Warning] Shard upsert error:`, shardErr.message);
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

  if (mode === 'pin_partition') {
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
          pin_id, rank_position, title, domain, destination_url, image_url,
          save_count, repin_count, daily_save_velocity, creator_username,
          board_name, dominant_color, visual_annotations, FALSE as is_displaced
        FROM keyword_serp_current
        WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
        ORDER BY rank_position ASC;
      `;
    } else {
      allPins = await sql`
        SELECT DISTINCT ON (pin_id)
          pin_id, rank_position, title, domain, destination_url, image_url,
          save_count, repin_count, daily_save_velocity, creator_username,
          board_name, dominant_color, visual_annotations, is_displaced
        FROM (
          SELECT 
            pin_id, rank_position, title, domain, destination_url, image_url,
            save_count, repin_count, daily_save_velocity, creator_username,
            board_name, dominant_color, visual_annotations, FALSE as is_displaced
          FROM keyword_serp_current
          WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
          UNION ALL
          SELECT 
            pin_id, rank_position, title, domain, destination_url, image_url,
            save_count, repin_count, daily_save_velocity, '' as creator_username,
            '' as board_name, '' as dominant_color, 
            COALESCE(metadata->'visual_annotations', '[]'::jsonb) as visual_annotations,
            is_displaced
          FROM keyword_pins_snapshots
          WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
        ) combined
        ORDER BY pin_id, rank_position ASC NULLS LAST;
      `;
    }

    // Deterministic sort to ensure identical order across all 20 runners
    allPins.sort((a, b) => {
      const rA = Number(a.rank_position) || 9999;
      const rB = Number(b.rank_position) || 9999;
      if (rA !== rB) return rA - rB;
      return String(a.pin_id).localeCompare(String(b.pin_id));
    });

    // Modulo Disjoint Partition
    const myPins = allPins.filter((_, idx) => (idx % workerTotal) === workerIndex);
    console.log(`[*] Total Catalog Pins: ${allPins.length} | Worker Slice: ${myPins.length} pins assigned`);

    if (myPins.length === 0) {
      console.log(`[Worker ${workerIndex + 1}/${workerTotal}] No pins assigned for slice. Exiting cleanly.`);
      process.exit(0);
    }

    const enrichedList = [];
    for (let i = 0; i < myPins.length; i++) {
      const p = myPins[i];
      console.log(`  [${i + 1}/${myPins.length}] Inspecting Pin #${p.pin_id} (Rank #${p.rank_position || 'Vault'})...`);
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
    let keywordsToProcess = [];
    if (targetKeyword) {
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
        ORDER BY last_crawled_at ASC NULLS FIRST
        LIMIT 20;
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

      const lockKey = `kw_serp_${kw.id}`;
      let lockAcquired = true;
      try {
        const [lRes] = await sql`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS acquired;`;
        lockAcquired = Boolean(lRes?.acquired);
      } catch (_) {}

      if (!lockAcquired) {
        console.log(`  [AdvisoryLock] Keyword "${kw.keyword}" locked by peer crawler. Non-blocking skip ✅`);
        results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: 'locked_by_peer' });
        continue;
      }

      try {
        const crawlRes = await crawlKeywordSERP(sql, kw.id, cookie);
        if (crawlRes.success) {
          console.log(`  [+] Stage 1 Fast Crawl Success: Crawled ${crawlRes.crawled_pins} pins | Velocity: +${crawlRes.avg_velocity} saves/day`);

          // Stage 2: Deep Inspection
          const serpPins = await sql`
            SELECT 
              pin_id, rank_position, title, domain, destination_url, image_url,
              save_count, repin_count, daily_save_velocity, creator_username,
              board_name, dominant_color, visual_annotations, FALSE as is_displaced
            FROM keyword_serp_current
            WHERE keyword_id = ${kw.id} AND pin_id ~ '^[0-9]+$'
            ORDER BY rank_position ASC
            LIMIT ${maxPins};
          `;

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
        await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}));`.catch(() => {});
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
