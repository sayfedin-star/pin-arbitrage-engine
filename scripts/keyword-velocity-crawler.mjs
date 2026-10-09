#!/usr/bin/env node

/**
 * Keyword Intelligence & Velocity Autonomous SERP Runner
 * Executes daily/on-demand crawls across tracked keywords in Neon Postgres,
 * calculates save velocities, stores ranked guides, and writes a rich
 * Markdown summary to $GITHUB_STEP_SUMMARY.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { crawlKeywordSERP, listKeywords } from '../src/modules/keywords/service.mjs';
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
const targetKeyword = (process.env.TARGET_KEYWORD || '').trim().toLowerCase();
const cookie = process.env.PINTEREST_COOKIE || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

async function run() {
  console.log('===============================================================');
  console.log('🚀 KEYWORD INTELLIGENCE & VELOCITY SERP RADAR PIPELINE');
  console.log('===============================================================');

  let keywordsToProcess = [];
  if (targetKeyword) {
    console.log(`[*] Target keyword mode: "${targetKeyword}"`);
    keywordsToProcess = await sql`
      SELECT * FROM tracked_keywords 
      WHERE LOWER(keyword) = ${targetKeyword} AND is_active = TRUE;
    `;
    if (keywordsToProcess.length === 0) {
      console.log(`[!] Keyword "${targetKeyword}" not found in database. Auto-registering...`);
      const [newRow] = await sql`
        INSERT INTO tracked_keywords (keyword, category, target_pin_count, is_active)
        VALUES (${targetKeyword}, 'General', 100, TRUE)
        RETURNING *;
      `;
      keywordsToProcess = [newRow];
    }
  } else {
    console.log('[*] Sweeping all active tracked keywords from Neon...');
    keywordsToProcess = await sql`
      SELECT * FROM tracked_keywords 
      WHERE is_active = TRUE
      ORDER BY last_crawled_at ASC NULLS FIRST
      LIMIT 100;
    `;
  }

  console.log(`[*] Found ${keywordsToProcess.length} keywords to crawl.`);
  if (keywordsToProcess.length === 0) {
    console.log('[!] No active keywords to crawl. Exiting.');
    return;
  }

  const results = [];
  let totalPinsCrawled = 0;
  let totalGuidesDiscovered = 0;

  for (let i = 0; i < keywordsToProcess.length; i++) {
    const kw = keywordsToProcess[i];
    console.log(`\n[${i + 1}/${keywordsToProcess.length}] Crawling SERP for keyword: "${kw.keyword}" (ID: ${kw.id})...`);
    
    // Non-blocking Postgres Advisory Lock to coordinate concurrent runners without Redis
    const lockKey = `kw_serp_${kw.id}`;
    let lockAcquired = true;
    try {
      const [lRes] = await sql`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS acquired;`;
      lockAcquired = Boolean(lRes?.acquired);
    } catch (_) {}

    if (!lockAcquired) {
      console.log(`  [AdvisoryLock] Keyword "${kw.keyword}" (ID: ${kw.id}) is actively locked by a peer crawler. Non-blocking skip ✅`);
      results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: 'locked_by_peer' });
      continue;
    }

    try {
      const crawlRes = await crawlKeywordSERP(sql, kw.id, cookie);
      if (crawlRes.success) {
        totalPinsCrawled += (crawlRes.crawled_pins || 0);
        totalGuidesDiscovered += (crawlRes.guides_count || 0);
        console.log(`  [+] Stage 1 Fast Crawl Success: Crawled ${crawlRes.crawled_pins} pins | Guides: ${crawlRes.guides_count} | Velocity: +${crawlRes.avg_velocity} saves/day`);

        // =====================================================================
        // STAGE 2: Deep Closeup Inspection & Shard Partition Synchronization
        // =====================================================================
        console.log(`  [*] Commencing Stage 2: Deep Inspection & 99-Shard Synchronization...`);
        const serpPins = await sql`
          SELECT 
            pin_id, rank_position, title, domain, destination_url, image_url,
            save_count, repin_count, daily_save_velocity, creator_username,
            board_name, dominant_color, visual_annotations
          FROM keyword_serp_current
          WHERE keyword_id = ${kw.id}
          ORDER BY rank_position ASC;
        `;

        const maxDeepPins = Math.max(5, Math.min(100, parseInt(process.env.MAX_PINS || '50', 10)));
        const validNumericPins = serpPins.filter(p => /^\d+$/.test(String(p.pin_id || '')));
        const candidatePins = validNumericPins.slice(0, maxDeepPins);
        console.log(`  [*] Inspecting top ${candidatePins.length} candidate pins with verified closeup metrics...`);

        const enrichedPins = [];

        for (let pIdx = 0; pIdx < candidatePins.length; pIdx++) {
          const pin = candidatePins[pIdx];
          let detail = null;
          try {
            const fetchRes = await fetchPinFromPinterest(pin.pin_id);
            if (fetchRes?.ok && fetchRes.pin) {
              detail = fetchRes.pin;
            }
          } catch (fetchErr) {
            console.warn(`    [!] Pin ${pin.pin_id} closeup fetch warning:`, fetchErr.message);
          }

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
          const description = detail?.description || '';
          const altText = detail?.alt_text || detail?.altText || detail?.seo_alt_text || '';
          const dominantColor = detail?.dominant_color || detail?.dominantColor || pin.dominant_color || '#888888';
          const creator = detail?.pinner?.username || detail?.creator_username || pin.creator_username || '';
          const board = detail?.board?.name || pin.board_name || '';
          const rawAnnotations = (detail?.pinJoin?.visualAnnotation && detail.pinJoin.visualAnnotation.length > 0)
            ? detail.pinJoin.visualAnnotation
            : (Array.isArray(pin.visual_annotations) ? pin.visual_annotations : []);
          const annotations = Array.isArray(rawAnnotations) ? rawAnnotations : [];

          // 1. Update Central Hub keyword_serp_current
          if (annotations.length > 0) {
            await sql`
              UPDATE keyword_serp_current
              SET 
                save_count = GREATEST(save_count, ${authenticSaves}::bigint),
                repin_count = GREATEST(repin_count, ${authenticRepins}::int),
                creator_username = CASE WHEN ${creator}::text <> '' THEN ${creator}::text ELSE creator_username END,
                board_name = CASE WHEN ${board}::text <> '' THEN ${board}::text ELSE board_name END,
                dominant_color = CASE WHEN ${dominantColor}::text <> '' THEN ${dominantColor}::text ELSE dominant_color END,
                visual_annotations = ${JSON.stringify(annotations)}::jsonb
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

          // 2. Update Central Hub keyword_pins_snapshots
          await sql`
            UPDATE keyword_pins_snapshots
            SET
              save_count = GREATEST(save_count, ${authenticSaves}::bigint),
              repin_count = GREATEST(repin_count, ${authenticRepins}::int),
              comment_count = GREATEST(comment_count, ${authenticComments}::int),
              metadata = metadata || jsonb_build_object(
                'description', ${description}::text,
                'alt_text', ${altText}::text,
                'share_count', ${authenticShares}::int,
                'dominant_color', ${dominantColor}::text,
                'visual_annotations', ${JSON.stringify(annotations)}::jsonb
              )
            WHERE keyword_id = ${kw.id} AND pin_id = ${pin.pin_id} AND snapshot_date = CURRENT_DATE;
          `;

          enrichedPins.push({
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
            visual_annotations: annotations,
            save_count: authenticSaves,
            repin_count: authenticRepins,
            comment_count: authenticComments,
            share_count: authenticShares,
            daily_save_velocity: pin.daily_save_velocity || 0,
            rank_position: pin.rank_position,
            keyword_id: kw.id
          });

          // Polite Jitter Delay (2500ms - 4000ms) to absorb HTTP 429/403 cleanly per user directives
          if (pIdx < candidatePins.length - 1) {
            const jitter = 2500 + Math.floor(Math.random() * 1500);
            await new Promise(r => setTimeout(r, jitter));
          }
        }

        // 3. Partition across 99 storage shards and execute atomic upserts
        let shardsSynchronized = 0;
        if (enrichedPins.length > 0) {
          const shardGroups = batchGroupByShard(enrichedPins, 99);
          console.log(`  [*] Partitioned ${enrichedPins.length} enriched pins across ${shardGroups.size} storage shards.`);
          
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
                    visual_annotations = CASE WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations ELSE universal_master_pins.visual_annotations END,
                    updated_at = NOW();
                `;

                await shardSql`
                  INSERT INTO pins_daily_snapshots (
                    pin_id, keyword_id, rank_position, save_count, repin_count, comment_count,
                    share_count, daily_save_velocity, snapshot_date, created_at
                  ) VALUES (
                    ${sp.pin_id}, ${sp.keyword_id}, ${sp.rank_position}, ${sp.save_count},
                    ${sp.repin_count}, ${sp.comment_count}, ${sp.share_count},
                    ${sp.daily_save_velocity}, CURRENT_DATE, NOW()
                  )
                  ON CONFLICT DO NOTHING;
                `;
              }
              shardsSynchronized++;
            } catch (shardErr) {
              console.warn(`    [Shard ${shardId} Warning] Failed to upsert pins:`, shardErr.message);
            }
          }
          console.log(`  [+] Stage 2 Success: Enriched ${enrichedPins.length} pins | Synced across ${shardsSynchronized} storage shards.`);
        }

        results.push({
          id: kw.id,
          keyword: kw.keyword,
          category: kw.category,
          crawled_pins: crawlRes.crawled_pins,
          enriched_pins: enrichedPins.length,
          shards_updated: shardsSynchronized,
          avg_velocity: crawlRes.avg_velocity,
          guides_count: crawlRes.guides_count,
          top_pin: crawlRes.top_pin,
          summary: crawlRes.summary,
          status: 'success'
        });
      } else {
        console.warn(`  [!] Crawl warning:`, crawlRes.message || 'Unknown issue');
        results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: crawlRes.message });
      }
    } catch (err) {
      console.error(`  [-] Error crawling "${kw.keyword}":`, err.message);
      results.push({ id: kw.id, keyword: kw.keyword, status: 'error', error: err.message });
    } finally {
      await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}));`.catch(() => {});
    }

    // Jitter delay between requests to preserve Pinterest rate limits cleanly
    if (i < keywordsToProcess.length - 1) {
      const delay = 2500 + Math.floor(Math.random() * 1500);
      console.log(`  [~] Backoff jitter: ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log('\n===============================================================');
  console.log(`✅ PIPELINE FINISHED: Processed ${results.length} keywords.`);
  console.log(`📦 Total Pins Updated: ${totalPinsCrawled} | Guides: ${totalGuidesDiscovered}`);
  console.log('===============================================================');

  // Render GitHub Step Summary if available
  if (stepSummaryPath) {
    try {
      let md = `## 🔍 Keyword Intelligence & Velocity SERP Radar Report\n\n`;
      md += `> **Execution Summary**: Processed **${results.length}** keywords | **${totalPinsCrawled}** pins indexed | **${totalGuidesDiscovered}** semantic modifiers discovered.\n\n`;
      
      md += `### 📊 Tracked Keywords Performance\n\n`;
      md += `| Keyword | Category | Tracked Pins | Deep Enriched | Shards Synced | Avg Velocity | Modifiers | Status |\n`;
      md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
      for (const r of results) {
        if (r.status === 'success') {
          md += `| **${r.keyword}** | ${r.category || 'General'} | ${r.crawled_pins} | ${r.enriched_pins || 0} | ${r.shards_updated || 0} | \`+${r.avg_velocity} saves/day\` | ${r.guides_count} | 🟢 Success |\n`;
        } else {
          md += `| **${r.keyword}** | - | - | - | - | - | - | 🔴 ${r.error || 'Failed'} |\n`;
        }
      }

      md += `\n### 🚀 High-Velocity Rising Pins\n\n`;
      const successful = results.filter(r => r.status === 'success' && r.top_pin);
      if (successful.length > 0) {
        md += `| Keyword | Top Ranked Pin | Image Preview |\n`;
        md += `| :--- | :--- | :---: |\n`;
        for (const s of successful.slice(0, 5)) {
          const img = s.top_pin?.imageUrl ? `<img src="${s.top_pin.imageUrl}" width="60" />` : '-';
          md += `| **${s.keyword}** | [${s.top_pin.title || 'View Pin'}](https://www.pinterest.com/pin/${s.top_pin.pinId}/) | ${img} |\n`;
        }
      }

      fs.appendFileSync(stepSummaryPath, md, 'utf8');
      console.log('[+] Wrote Markdown summary to $GITHUB_STEP_SUMMARY');
    } catch (summaryErr) {
      console.warn('[!] Failed to write GITHUB_STEP_SUMMARY:', summaryErr.message);
    }
  }

}

run().catch(err => {
  console.error('[-] Fatal pipeline error:', err);
  process.exit(1);
});
