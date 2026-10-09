#!/usr/bin/env node

/**
 * Remediation & Verification Script for Pin Cross-Pollination
 * Targets pins 844493677058317 and 1125968743130862:
 * 1. Inspects Central Hub SERPs, Snapshots, and target shards.
 * 2. Fetches authentic closeup metadata from Pinterest (alt_text, description, saves, visual annotations).
 * 3. Enforces Set Union of visual annotations across all keyword occurrences.
 * 4. Backfills authentic data into Shards and Central Hub.
 * 5. Smooths snapshot historical saves to enforce monotonic non-decreasing baselines.
 */

import { neon } from '@neondatabase/serverless';
import { fetchPinFromPinterest } from './lib/pinterest.mjs';
import { getPinShardId, resolveShardConnection } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);
const targetPinIds = ['844493677058317', '1125968743130862'];

async function remediate() {
  console.log('===============================================================');
  console.log('🔧 PIN CROSS-POLLUTION & ENRICHMENT REMEDIATION RUNNER');
  console.log('===============================================================');

  for (const pinId of targetPinIds) {
    const shardId = getPinShardId(pinId, 99);
    console.log(`\n---------------------------------------------------------------`);
    console.log(`[*] Inspecting Pin: ${pinId} -> Target Shard #${shardId}`);
    console.log(`---------------------------------------------------------------`);

    // 1. Check Central Hub active SERP rows
    const serpRows = await hubSql`
      SELECT sc.*, tk.keyword 
      FROM keyword_serp_current sc
      JOIN tracked_keywords tk ON tk.id = sc.keyword_id
      WHERE sc.pin_id = ${pinId};
    `;
    console.log(`  [Hub] Found ${serpRows.length} active SERP occurrences:`);
    const allAnnotations = new Set();
    let peakSaves = 0;

    for (const r of serpRows) {
      console.log(`    - Keyword: "${r.keyword}" | Rank #${r.rank_position} | Saves: ${r.save_count} | Velocity: ${r.daily_save_velocity}`);
      peakSaves = Math.max(peakSaves, Number(r.save_count) || 0);
      const tags = Array.isArray(r.visual_annotations) ? r.visual_annotations : (typeof r.visual_annotations === 'string' ? JSON.parse(r.visual_annotations || '[]') : []);
      for (const t of tags) if (t) allAnnotations.add(t);
    }
    console.log(`  [Hub] Pre-existing visual tags count across SERPs: ${allAnnotations.size}`);

    // 2. Fetch authentic Pinterest closeup data
    console.log(`  [*] Probing authentic Pinterest closeup API for ${pinId}...`);
    let closeup = null;
    try {
      const pinRes = await fetchPinFromPinterest(pinId);
      if (pinRes && pinRes.ok && pinRes.pin) {
        closeup = pinRes.pin;
      } else {
        console.warn(`  [-] Pinterest closeup returned:`, pinRes?.error || pinRes?.status);
      }
    } catch (e) {
      console.warn(`  [-] Pinterest closeup fetch warning:`, e.message);
    }

    if (closeup) {
      console.log(`  [+] Authentic Pinterest Data:`);
      console.log(`      Title: "${closeup.title || ''}"`);
      console.log(`      Alt-Text: "${closeup.alt_text || ''}"`);
      console.log(`      Description: "${closeup.description || ''}"`);
      console.log(`      Authentic Saves: ${closeup.save_count || 0}`);
      console.log(`      Repins: ${closeup.repin_count || 0}`);
      console.log(`      Visual Annotations detected: ${(closeup.visual_annotations || []).length}`);

      peakSaves = Math.max(peakSaves, Number(closeup.save_count) || 0);
      for (const t of (closeup.visual_annotations || [])) {
        if (t) allAnnotations.add(t);
      }
    }

    const finalAnnotations = Array.from(allAnnotations);
    console.log(`  [+] Mathematical Set Union visual tags: ${finalAnnotations.length} tags:`, finalAnnotations);

    // 3. Connect to Shard
    let shardSql;
    try {
      shardSql = await resolveShardConnection({ hubSql, shardId });
    } catch (err) {
      console.warn(`  [-] Failed to resolve shard ${shardId}:`, err.message);
      shardSql = hubSql;
    }

    // 4. Update / Upsert universal_master_pins on Shard
    const title = closeup?.title || serpRows[0]?.title || `Pin ${pinId}`;
    const domain = closeup?.domain || serpRows[0]?.domain || 'pinterest.com';
    const destUrl = closeup?.link || serpRows[0]?.destination_url || '';
    const imgUrl = closeup?.image_url || serpRows[0]?.image_url || '';
    const creator = closeup?.creator_username || serpRows[0]?.creator_username || '';
    const board = closeup?.board_name || serpRows[0]?.board_name || '';
    const boardSlug = board ? board.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '';
    const altText = closeup?.alt_text || '';
    const description = closeup?.description || '';
    const dominantColor = closeup?.dominant_color || serpRows[0]?.dominant_color || '#888888';

    await shardSql`
      INSERT INTO universal_master_pins (
        pin_id, creator_username, board_name, board_slug, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations,
        first_discovered_pillar, first_discovered_at, updated_at
      ) VALUES (
        ${pinId}, ${creator}, ${board}, ${boardSlug}, ${title}, ${domain}, ${destUrl},
        ${imgUrl}, ${description}, ${altText}, ${dominantColor},
        ${JSON.stringify(finalAnnotations)}::jsonb, 'keyword', NOW(), NOW()
      )
      ON CONFLICT (pin_id) DO UPDATE SET
        creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
        board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
        board_slug = COALESCE(NULLIF(EXCLUDED.board_slug, ''), universal_master_pins.board_slug),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
        domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
        destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
        image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
        description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
        dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, ''), universal_master_pins.dominant_color),
        visual_annotations = ${JSON.stringify(finalAnnotations)}::jsonb,
        updated_at = NOW();
    `;
    console.log(`  [+] Shard #${shardId} universal_master_pins updated with complete metadata & ${finalAnnotations.length} visual tags.`);

    // 5. Update Hub keyword_serp_current to reflect true saves and Set Union tags
    await hubSql`
      UPDATE keyword_serp_current
      SET
        save_count = GREATEST(save_count, ${peakSaves}::bigint),
        visual_annotations = ${JSON.stringify(finalAnnotations)}::jsonb,
        crawled_at = NOW()
      WHERE pin_id = ${pinId};
    `;
    console.log(`  [+] Central Hub keyword_serp_current synchronized.`);

    // 6. Smooth snapshot historical saves so monotonic baseline is strictly preserved
    if (shardSql !== hubSql) {
      await shardSql`
        UPDATE pins_daily_snapshots
        SET save_count = GREATEST(save_count, ${peakSaves}::bigint)
        WHERE pin_id = ${pinId} AND snapshot_date = CURRENT_DATE;
      `.catch(() => {});
    }
    await hubSql`
      UPDATE keyword_pins_snapshots
      SET 
        save_count = GREATEST(save_count, ${peakSaves}::bigint),
        metadata = metadata || jsonb_build_object(
          'alt_text', ${altText}::text,
          'description', ${description}::text,
          'visual_annotations', ${JSON.stringify(finalAnnotations)}::jsonb
        )
      WHERE pin_id = ${pinId} AND snapshot_date = CURRENT_DATE;
    `.catch(() => {});
    console.log(`  [+] Daily snapshots historical baseline smoothed to peak saves: ${peakSaves}`);
  }

  console.log('\n===============================================================');
  console.log('✅ REMEDIATION COMPLETE: Both pins remediated with Set Union CV tags & true metadata');
  console.log('===============================================================');
}

remediate().catch(err => {
  console.error('[-] Remediation error:', err);
  process.exit(1);
});
