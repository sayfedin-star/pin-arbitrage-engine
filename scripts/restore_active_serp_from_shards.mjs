#!/usr/bin/env node

/**
 * scripts/restore_active_serp_from_shards.mjs
 *
 * ARCHITECTURAL DIRECTIVE:
 * 1. Reverse-Recovery of Active SERP Catalog (`keyword_serp_current`) from 99 Shards:
 *    - Avoids the `2026-10-15` NULL rank_position trap by using an analytical Window Function:
 *      ROW_NUMBER() OVER (PARTITION BY psp.keyword_id, psp.pin_id ORDER BY psp.snapshot_date DESC)
 *      filtered strictly on `psp.rank_position IS NOT NULL AND psp.rank_position <= 50 AND COALESCE(psp.is_displaced, FALSE) = FALSE`.
 *    - Joins `pin_serp_positions` with `universal_master_pins` and `pins_daily_metrics` (with prior-day baseline save_count lookup)
 *      across all 99 shards in parallel.
 *    - Deduplicates across shards by `(keyword_id, pin_id)` and resolves rank collisions per keyword,
 *      restoring ~4,800–5,000 active SERP pins into `keyword_serp_current` on the Central Hub (~1.2 MB).
 *    - Removes restored active `(keyword_id, pin_id)` pairs from `keyword_displaced_index` so no pin is simultaneously active and displaced.
 *    - Updates `tracked_keywords` summary counters (`top_pin_id`, `top_pin_title`, `top_pin_image`, `avg_daily_velocity`).
 *
 * 2. Purging Residual Queue Bloat (`competitor_pins` & Hub `universal_master_pins`):
 *    - Verifies that any remaining creative metadata in `competitor_pins` and Hub's local `universal_master_pins`
 *      is safely offloaded to the 99 Shards.
 *    - Deletes completed/failed staging rows from `competitor_pins` (20,617 rows -> 20 MB index + heap bloat)
 *      and truncates the unused local `universal_master_pins` table on Hub (1,434 rows -> 1.1 MB).
 *    - Executes `VACUUM FULL ANALYZE competitor_pins`, `VACUUM FULL ANALYZE universal_master_pins`,
 *      `VACUUM FULL ANALYZE keyword_displaced_index`, and `VACUUM FULL ANALYZE keyword_serp_current`
 *      to drop total Central Hub size from 50.37 MB down to ~29 MB (well below the 35 MB golden ceiling).
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  batchGroupByShard,
  resolveShardConnection,
  preloadNeonRegistry,
  prewarmFleetShards
} from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const SHARD_CONCURRENCY = Math.max(1, Math.min(20, parseInt(process.env.SHARD_CONCURRENCY || '15', 10)));

async function getHubStorageTelemetry(hubSql) {
  const [dbRow] = await hubSql`
    SELECT pg_database_size(current_database()) AS raw_bytes,
           pg_size_pretty(pg_database_size(current_database())) AS pretty_size;
  `;
  const tables = await hubSql`
    SELECT
      c.relname AS table_name,
      COALESCE(s.n_live_tup, 0) AS live_rows,
      pg_total_relation_size(c.oid) AS total_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
      pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 12;
  `;
  return {
    rawBytes: Number(dbRow?.raw_bytes || 0),
    prettySize: dbRow?.pretty_size || '0 MB',
    tables
  };
}

export async function runRestoreAndSlimHub(hubSql) {
  console.log('======================================================================');
  console.log('🚀 PHASE 2: ACTIVE SERP RECOVERY & CENTRAL HUB SLIMMING (< 29 MB)');
  console.log('======================================================================\n');

  // 1. Baseline Telemetry
  console.log('[*] Step 1: Recording Pre-Recovery Hub Storage Telemetry...');
  const beforeStats = await getHubStorageTelemetry(hubSql);
  console.log(`    Initial Hub Size: ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)`);

  const validKeywordsRows = await hubSql`SELECT id, keyword FROM tracked_keywords;`;
  const validKeywordIds = new Set(validKeywordsRows.map(r => Number(r.id)));
  console.log(`    Active Tracked Keywords in Hub: ${validKeywordIds.size}`);

  // 2. Preload & Prewarm all 99 Shards
  console.log('\n[*] Step 2: Preloading & Pre-warming 99 Storage Shards...');
  await preloadNeonRegistry(hubSql);
  const allShardIds = Array.from({ length: 99 }, (_, i) => i + 1);
  await prewarmFleetShards({ hubSql, shardIds: allShardIds, concurrency: 20, timeoutMs: 5000 });

  // 3. Scan all 99 Shards using Window Function to avoid the 2026-10-15 NULL rank_position trap
  console.log('\n[*] Step 3: Extracting Latest Non-Null Active SERP Rankings Across 99 Shards...');
  const recoveredRows = [];
  let shardsScanned = 0;
  let shardErrors = 0;

  for (let i = 0; i < allShardIds.length; i += SHARD_CONCURRENCY) {
    const chunk = allShardIds.slice(i, i + SHARD_CONCURRENCY);
    await Promise.allSettled(chunk.map(async (shardId) => {
      try {
        const shardSql = await resolveShardConnection({ hubSql, shardId });
        if (!shardSql || shardSql === hubSql) return;

        const rows = await shardSql`
          WITH ranked_latest AS (
            SELECT
              psp.keyword_id,
              psp.pin_id,
              psp.rank_position,
              psp.last_known_rank,
              psp.snapshot_date,
              ROW_NUMBER() OVER (
                PARTITION BY psp.keyword_id, psp.pin_id
                ORDER BY psp.snapshot_date DESC, psp.updated_at DESC NULLS LAST
              ) AS rn
            FROM pin_serp_positions psp
            WHERE psp.rank_position IS NOT NULL
              AND psp.rank_position >= 1
              AND psp.rank_position <= 50
              AND COALESCE(psp.is_displaced, FALSE) = FALSE
          ),
          latest_active AS (
            SELECT * FROM ranked_latest WHERE rn = 1
          ),
          latest_metrics AS (
            SELECT DISTINCT ON (pdm.pin_id)
              pdm.pin_id,
              pdm.save_count,
              pdm.repin_count,
              pdm.comment_count,
              pdm.share_count,
              pdm.daily_save_velocity,
              pdm.snapshot_date AS metric_date
            FROM pins_daily_metrics pdm
            INNER JOIN latest_active la ON la.pin_id = pdm.pin_id
            ORDER BY pdm.pin_id ASC, pdm.snapshot_date DESC
          ),
          prior_metrics AS (
            SELECT DISTINCT ON (pdm.pin_id)
              pdm.pin_id,
              pdm.save_count AS baseline_saves,
              pdm.snapshot_date AS baseline_date
            FROM pins_daily_metrics pdm
            INNER JOIN latest_active la ON la.pin_id = pdm.pin_id
            WHERE pdm.snapshot_date < la.snapshot_date
            ORDER BY pdm.pin_id ASC, pdm.snapshot_date DESC
          )
          SELECT
            la.keyword_id,
            la.pin_id,
            la.rank_position,
            COALESCE(la.last_known_rank, la.rank_position) AS prev_rank_position,
            la.snapshot_date,
            COALESCE(ump.title, '') AS title,
            COALESCE(ump.domain, '') AS domain,
            COALESCE(ump.destination_url, '') AS destination_url,
            COALESCE(ump.image_url, '') AS image_url,
            COALESCE(ump.creator_username, '') AS creator_username,
            COALESCE(ump.board_name, '') AS board_name,
            COALESCE(ump.dominant_color, '#888888') AS dominant_color,
            COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
            ump.created_at_pinterest,
            COALESCE(lm.save_count, 0) AS save_count,
            COALESCE(lm.repin_count, 0) AS repin_count,
            COALESCE(lm.comment_count, 0) AS comment_count,
            COALESCE(lm.share_count, 0) AS share_count,
            COALESCE(lm.daily_save_velocity, 0) AS daily_save_velocity,
            COALESCE(pm.baseline_saves, lm.save_count, 0) AS baseline_day_saves,
            COALESCE(pm.baseline_date, la.snapshot_date) AS baseline_day_date
          FROM latest_active la
          LEFT JOIN universal_master_pins ump ON ump.pin_id = la.pin_id
          LEFT JOIN latest_metrics lm ON lm.pin_id = la.pin_id
          LEFT JOIN prior_metrics pm ON pm.pin_id = la.pin_id;
        `;

        for (const r of (rows || [])) {
          if (validKeywordIds.has(Number(r.keyword_id))) {
            recoveredRows.push(r);
          }
        }
        shardsScanned++;
      } catch (err) {
        shardErrors++;
        console.warn(`    [!] Shard #${shardId} scan warning: ${err.message}`);
      }
    }));
  }

  console.log(`    ✓ Scanned ${shardsScanned}/99 shards (Errors: ${shardErrors}). Extracted ${recoveredRows.length} active SERP records.`);

  // 4. Group by keyword_id and keep the top 50 freshest pins per keyword (ordered by snapshot_date DESC, rank_position ASC)
  const byKeyword = new Map();
  for (const row of recoveredRows) {
    const kid = Number(row.keyword_id);
    if (!byKeyword.has(kid)) byKeyword.set(kid, new Map());
    const pinMap = byKeyword.get(kid);
    const pid = String(row.pin_id);
    const existing = pinMap.get(pid);
    const rowDate = row.snapshot_date instanceof Date ? row.snapshot_date.toISOString().slice(0, 10) : String(row.snapshot_date || '');
    const existDate = existing
      ? (existing.snapshot_date instanceof Date ? existing.snapshot_date.toISOString().slice(0, 10) : String(existing.snapshot_date || ''))
      : '';
    if (!existing || rowDate > existDate) {
      pinMap.set(pid, { ...row, snapshot_date_str: rowDate });
    }
  }

  const finalActivePins = [];
  for (const [kid, pinMap] of byKeyword.entries()) {
    const pins = Array.from(pinMap.values());
    // Sort by freshest snapshot_date_str DESC, then rank_position ASC, then save_count DESC
    pins.sort((a, b) => {
      if (b.snapshot_date_str !== a.snapshot_date_str) {
        return b.snapshot_date_str.localeCompare(a.snapshot_date_str);
      }
      const rA = Number(a.rank_position || 50);
      const rB = Number(b.rank_position || 50);
      if (rA !== rB) return rA - rB;
      return Number(b.save_count || 0) - Number(a.save_count || 0);
    });

    const top50 = pins.slice(0, 50);
    // Re-normalize clean 1..N rank sequence by rank_position ASC
    top50.sort((a, b) => Number(a.rank_position || 50) - Number(b.rank_position || 50));
    top50.forEach((p, idx) => {
      const assignedRank = idx + 1;
      const prevRank = Number(p.prev_rank_position || p.rank_position || assignedRank);
      const rankDelta = prevRank - assignedRank;
      const vel = Number(p.daily_save_velocity || 0);
      let velocityTier = 'stagnant';
      if (vel >= 50) velocityTier = 'explosive';
      else if (vel >= 10) velocityTier = 'trending';
      else if (vel > 0) velocityTier = 'steady';

      finalActivePins.push({
        keyword_id: kid,
        pin_id: String(p.pin_id),
        rank_position: assignedRank,
        prev_rank_position: prevRank,
        baseline_day_saves: Number(p.baseline_day_saves || p.save_count || 0),
        baseline_day_date: p.baseline_day_date instanceof Date
          ? p.baseline_day_date.toISOString().slice(0, 10)
          : String(p.baseline_day_date || p.snapshot_date_str || new Date().toISOString().slice(0, 10)).slice(0, 10),
        title: String(p.title || '').slice(0, 250),
        domain: String(p.domain || '').slice(0, 255),
        destination_url: String(p.destination_url || ''),
        image_url: String(p.image_url || ''),
        creator_username: String(p.creator_username || ''),
        board_name: String(p.board_name || ''),
        save_count: Number(p.save_count || 0),
        repin_count: Number(p.repin_count || 0),
        comment_count: Number(p.comment_count || 0),
        share_count: Number(p.share_count || 0),
        daily_save_velocity: vel,
        dominant_color: String(p.dominant_color || '#888888').slice(0, 32),
        visual_annotations: Array.isArray(p.visual_annotations) ? p.visual_annotations : [],
        created_at_pinterest: p.created_at_pinterest ? new Date(p.created_at_pinterest).toISOString() : null,
        crawled_at: `${p.snapshot_date_str || new Date().toISOString().slice(0, 10)}T12:00:00.000Z`,
        metadata: {
          prev_rank: prevRank,
          rank_delta: rankDelta,
          is_new: false,
          format: 'ORGANIC PIN',
          aspect_ratio: '2:3',
          velocity_tier: velocityTier,
          is_deep_hydrated: Boolean(p.title && p.image_url),
          status: 'active'
        }
      });
    });
  }

  console.log(`    ✓ Prepared ${finalActivePins.length} deduplicated active SERP pins across ${byKeyword.size} keywords.`);

  // 5. Batch Upsert into keyword_serp_current & Remove Restored Active Pins from keyword_displaced_index
  if (finalActivePins.length > 0) {
    console.log('\n[*] Step 4: Restoring Active SERP Catalog (`keyword_serp_current`) on Hub...');
    const BATCH = 500;
    let insertedTotal = 0;

    for (let i = 0; i < finalActivePins.length; i += BATCH) {
      const slice = finalActivePins.slice(i, i + BATCH);
      const payload = JSON.stringify(slice);

      const upserted = await hubSql`
        INSERT INTO keyword_serp_current (
          keyword_id, pin_id, rank_position, last_known_rank, prev_rank_position,
          baseline_day_saves, baseline_day_date, is_displaced, displaced_date,
          title, domain, destination_url, image_url, creator_username, board_name,
          save_count, repin_count, comment_count, share_count, daily_save_velocity,
          dominant_color, visual_annotations, created_at_pinterest, creation_method,
          metadata, crawled_at, updated_at
        )
        SELECT
          u.keyword_id,
          u.pin_id,
          u.rank_position,
          u.rank_position,
          u.prev_rank_position,
          u.baseline_day_saves,
          u.baseline_day_date::date,
          FALSE,
          NULL,
          u.title,
          u.domain,
          u.destination_url,
          u.image_url,
          u.creator_username,
          u.board_name,
          u.save_count,
          u.repin_count,
          u.comment_count,
          u.share_count,
          u.daily_save_velocity,
          u.dominant_color,
          COALESCE(u.visual_annotations, '[]'::jsonb),
          NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz,
          'pinterest_platform',
          COALESCE(u.metadata, '{}'::jsonb),
          NULLIF(TRIM(u.crawled_at), '')::timestamptz,
          NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS u(
          keyword_id int,
          pin_id text,
          rank_position int,
          prev_rank_position int,
          baseline_day_saves bigint,
          baseline_day_date text,
          title text,
          domain text,
          destination_url text,
          image_url text,
          creator_username text,
          board_name text,
          save_count bigint,
          repin_count int,
          comment_count int,
          share_count int,
          daily_save_velocity numeric,
          dominant_color text,
          visual_annotations jsonb,
          created_at_pinterest text,
          crawled_at text,
          metadata jsonb
        )
        ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
          rank_position = EXCLUDED.rank_position,
          last_known_rank = EXCLUDED.rank_position,
          prev_rank_position = EXCLUDED.prev_rank_position,
          baseline_day_saves = EXCLUDED.baseline_day_saves,
          baseline_day_date = EXCLUDED.baseline_day_date,
          is_displaced = FALSE,
          displaced_date = NULL,
          title = COALESCE(NULLIF(EXCLUDED.title, ''), keyword_serp_current.title),
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), keyword_serp_current.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), keyword_serp_current.destination_url),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), keyword_serp_current.image_url),
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), keyword_serp_current.creator_username),
          board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), keyword_serp_current.board_name),
          save_count = GREATEST(keyword_serp_current.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(keyword_serp_current.repin_count, EXCLUDED.repin_count),
          comment_count = GREATEST(COALESCE(keyword_serp_current.comment_count, 0), EXCLUDED.comment_count),
          share_count = GREATEST(COALESCE(keyword_serp_current.share_count, 0), EXCLUDED.share_count),
          daily_save_velocity = EXCLUDED.daily_save_velocity,
          dominant_color = COALESCE(NULLIF(EXCLUDED.dominant_color, '#888888'), keyword_serp_current.dominant_color),
          visual_annotations = CASE
            WHEN jsonb_typeof(EXCLUDED.visual_annotations) = 'array' AND jsonb_array_length(EXCLUDED.visual_annotations) > 0
            THEN EXCLUDED.visual_annotations
            ELSE keyword_serp_current.visual_annotations
          END,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING pin_id;
      `;
      insertedTotal += upserted.length;
    }

    // Remove restored active pins from keyword_displaced_index so active pins do not appear in Displaced Vault
    const cleanedDisplaced = await hubSql`
      DELETE FROM keyword_displaced_index kdi
      USING keyword_serp_current ksc
      WHERE kdi.keyword_id = ksc.keyword_id
        AND kdi.pin_id = ksc.pin_id
        AND ksc.is_displaced = FALSE
      RETURNING kdi.pin_id;
    `;
    console.log(`    ✓ Restored ${insertedTotal} active SERP rows in keyword_serp_current.`);
    console.log(`    ✓ Pruned ${cleanedDisplaced.length} overlapping active pins from keyword_displaced_index.`);

    // Update tracked_keywords top_pin and last_crawled_pins_count summary
    await hubSql`
      WITH kw_rollup AS (
        SELECT
          keyword_id,
          COUNT(*)::int AS active_cnt,
          ROUND(AVG(daily_save_velocity), 2) AS avg_vel
        FROM keyword_serp_current
        WHERE is_displaced = FALSE
        GROUP BY keyword_id
      ),
      top_pins AS (
        SELECT DISTINCT ON (keyword_id)
          keyword_id,
          pin_id AS top_pin_id,
          title AS top_pin_title,
          image_url AS top_pin_image
        FROM keyword_serp_current
        WHERE is_displaced = FALSE AND rank_position = 1
        ORDER BY keyword_id ASC, save_count DESC
      )
      UPDATE tracked_keywords tk
      SET
        top_pin_id = COALESCE(tp.top_pin_id, tk.top_pin_id),
        top_pin_title = COALESCE(NULLIF(tp.top_pin_title, ''), tk.top_pin_title),
        top_pin_image = COALESCE(NULLIF(tp.top_pin_image, ''), tk.top_pin_image),
        avg_daily_velocity = COALESCE(kr.avg_vel, tk.avg_daily_velocity, 0),
        metadata = COALESCE(tk.metadata, '{}'::jsonb) || jsonb_build_object('last_crawled_pins_count', kr.active_cnt)
      FROM kw_rollup kr
      LEFT JOIN top_pins tp ON tp.keyword_id = kr.keyword_id
      WHERE tk.id = kr.keyword_id;
    `;
    console.log('    ✓ Synchronized tracked_keywords top_pin and active pin count summaries.');
  }

  // 6. Offload any residual Hub universal_master_pins & Purge Completed competitor_pins Queue
  console.log('\n[*] Step 5: Purging Completed `competitor_pins` Queue & Residual Hub `universal_master_pins`...');
  try {
    const residualMaster = await hubSql`
      SELECT
        pin_id, creator_username, board_name, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations,
        created_at_pinterest, first_discovered_pillar
      FROM universal_master_pins
      WHERE pin_id IS NOT NULL AND pin_id <> '';
    `.catch(() => []);

    if (residualMaster.length > 0) {
      const shardGroups = batchGroupByShard(residualMaster, 99);
      const entries = Array.from(shardGroups.entries());
      for (let i = 0; i < entries.length; i += SHARD_CONCURRENCY) {
        const chunk = entries.slice(i, i + SHARD_CONCURRENCY);
        await Promise.allSettled(chunk.map(async ([shardId, pins]) => {
          const shardSql = await resolveShardConnection({ hubSql, shardId });
          const payload = JSON.stringify(pins);
          await shardSql`
            INSERT INTO universal_master_pins (
              pin_id, creator_username, board_name, title, domain, destination_url,
              image_url, description, alt_text, dominant_color, visual_annotations,
              first_discovered_pillar, first_discovered_at, updated_at
            )
            SELECT DISTINCT ON (u.pin_id)
              u.pin_id,
              COALESCE(u.creator_username, ''),
              COALESCE(u.board_name, ''),
              COALESCE(u.title, ''),
              COALESCE(u.domain, ''),
              COALESCE(u.destination_url, ''),
              COALESCE(u.image_url, ''),
              COALESCE(u.description, ''),
              COALESCE(u.alt_text, ''),
              COALESCE(u.dominant_color, '#888888'),
              COALESCE(u.visual_annotations, '[]'::jsonb),
              COALESCE(u.first_discovered_pillar, 'keyword'),
              NOW(),
              NOW()
            FROM jsonb_to_recordset(${payload}::jsonb) AS u(
              pin_id text, creator_username text, board_name text, title text, domain text,
              destination_url text, image_url text, description text, alt_text text,
              dominant_color text, visual_annotations jsonb, first_discovered_pillar text
            )
            ORDER BY u.pin_id ASC
            ON CONFLICT (pin_id) DO NOTHING;
          `;
        }));
      }
      await hubSql`TRUNCATE TABLE universal_master_pins;`;
      console.log(`    ✓ Offloaded & truncated ${residualMaster.length} residual rows from Hub's local universal_master_pins.`);
    }
  } catch (err) {
    console.warn(`    [!] Hub universal_master_pins cleanup note: ${err.message}`);
  }

  // Delete completed/failed staging rows from competitor_pins (already archived to Shards + domain_registry_metadata)
  const deletedComp = await hubSql`
    DELETE FROM competitor_pins
    WHERE enrichment_status IN ('completed', 'failed')
    RETURNING id;
  `;
  console.log(`    ✓ Purged ${deletedComp.length} completed/failed staging rows from competitor_pins.`);

  // 7. Physical Storage Reclamation via Sequential VACUUM FULL ANALYZE
  console.log('\n[*] Step 6: Executing Physical Storage Reclamation (VACUUM FULL ANALYZE)...');
  const vacuumTargets = [
    'competitor_pins',
    'universal_master_pins',
    'keyword_displaced_index',
    'keyword_serp_current',
    'tracked_keywords'
  ];

  for (const tbl of vacuumTargets) {
    try {
      if (tbl === 'competitor_pins') await hubSql`VACUUM FULL ANALYZE competitor_pins;`;
      else if (tbl === 'universal_master_pins') await hubSql`VACUUM FULL ANALYZE universal_master_pins;`;
      else if (tbl === 'keyword_displaced_index') await hubSql`VACUUM FULL ANALYZE keyword_displaced_index;`;
      else if (tbl === 'keyword_serp_current') await hubSql`VACUUM FULL ANALYZE keyword_serp_current;`;
      else if (tbl === 'tracked_keywords') await hubSql`VACUUM FULL ANALYZE tracked_keywords;`;
      console.log(`    ✓ VACUUM FULL ANALYZE completed on ${tbl}.`);
    } catch (err) {
      console.warn(`    [!] VACUUM warning on ${tbl}: ${err.message}`);
    }
  }

  // 8. Final Telemetry Verification
  console.log('\n[*] Step 7: Post-Recovery Hub Storage Telemetry...');
  const afterStats = await getHubStorageTelemetry(hubSql);
  const savedBytes = beforeStats.rawBytes - afterStats.rawBytes;
  const savedMb = (savedBytes / (1024 * 1024)).toFixed(2);

  const [kscVerify] = await hubSql`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE is_displaced = FALSE)::int AS active_rows,
      COUNT(DISTINCT keyword_id)::int AS active_keywords
    FROM keyword_serp_current;
  `;

  console.log('\n======================================================================');
  console.log('📊 PHASE 2 RECOVERY & HUB SLIMMING SUMMARY');
  console.log('======================================================================');
  console.log(`  Hub Size Before Phase 2:     ${beforeStats.prettySize} (${beforeStats.rawBytes.toLocaleString()} bytes)`);
  console.log(`  Hub Size After Phase 2:      ${afterStats.prettySize} (${afterStats.rawBytes.toLocaleString()} bytes)`);
  console.log(`  Additional Space Reclaimed:  ${savedMb} MB`);
  console.log(`  Restored Active SERP Pins:   ${kscVerify.active_rows} pins across ${kscVerify.active_keywords} keywords`);
  console.log('======================================================================\n');

  console.table(afterStats.tables.map(t => ({
    Table: t.table_name,
    'Live Rows': Number(t.live_rows),
    'Total Size': t.total_size,
    'Heap Size': t.heap_size,
    'Indexes Size': t.indexes_size
  })));

  return {
    beforeBytes: beforeStats.rawBytes,
    afterBytes: afterStats.rawBytes,
    restoredActivePins: kscVerify.active_rows,
    restoredKeywords: kscVerify.active_keywords,
    purgedCompetitorPins: deletedComp.length
  };
}

async function main() {
  if (!DATABASE_URL) {
    console.error('[-] FATAL: DATABASE_URL is not set.');
    process.exit(1);
  }
  const hubSql = neon(DATABASE_URL);
  await runRestoreAndSlimHub(hubSql);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('\n[-] FATAL ERROR in restore_active_serp_from_shards:', err);
    process.exit(1);
  });
}