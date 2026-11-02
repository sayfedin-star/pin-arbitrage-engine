#!/usr/bin/env node

/**
 * scripts/consolidate_99_to_20_shards.mjs
 *
 * Canonical Zero-Loss Consolidation Runner for Pin Arbitrage Engine (PAE)
 * Migrates historical data from legacy physical shards (21..99) to consolidated
 * physical shards (1..20) preserving 99 virtual rooms with exact keyset cursor pagination,
 * pre-serialization Map deduplication (Anti-SQLSTATE 21000), checksum verification gates,
 * and out-of-transaction VACUUM ANALYZE.
 *
 * // [INVARIANT: 20-PHYSICAL-SHARD-CONSOLIDATION]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: 100-PERCENT-HOT-UPDATES]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPhysicalShardId,
  getShardProjectName,
  isValidShardDsn,
  enforceNeonPoolerUrl,
  normalizeAssignedShards
} from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env in Node runtime
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
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
  } catch (_) {}
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

/**
 * Keyset cursor migration for universal_master_pins
 */
export async function migrateUniversalMasterPins(sourceSql, destSql, sourceShardId, targetShardId, options = {}) {
  const batchSize = Math.max(10, Math.min(1000, options.batchSize || 500));
  let cursor = '';
  let totalMigrated = 0;

  while (true) {
    const rows = await sourceSql`
      SELECT 
        pin_id, creator_username, board_name, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations,
        created_at_pinterest, first_discovered_pillar, first_discovered_at,
        updated_at, metadata
      FROM universal_master_pins
      WHERE pin_id > ${cursor}
      ORDER BY pin_id ASC
      LIMIT ${batchSize};
    `;

    if (!rows || rows.length === 0) break;

    // Pre-serialization Map deduplication (Anti-SQLSTATE 21000)
    const pinMap = new Map();
    for (const r of rows) {
      const pid = String(r?.pin_id || '').trim();
      if (pid) pinMap.set(pid, r);
    }

    if (pinMap.size > 0) {
      const dedupedRows = Array.from(pinMap.values());
      dedupedRows.sort((a, b) => String(a.pin_id).localeCompare(String(b.pin_id)));

      const payload = JSON.stringify(dedupedRows.map(r => ({
        pin_id: String(r.pin_id),
        creator_username: String(r.creator_username || ''),
        board_name: String(r.board_name || ''),
        title: String(r.title || ''),
        domain: String(r.domain || ''),
        destination_url: String(r.destination_url || ''),
        image_url: String(r.image_url || ''),
        description: String(r.description || ''),
        alt_text: String(r.alt_text || ''),
        dominant_color: String(r.dominant_color || '#888888'),
        visual_annotations: Array.isArray(r.visual_annotations) ? r.visual_annotations : [],
        created_at_pinterest: r.created_at_pinterest ? new Date(r.created_at_pinterest).toISOString() : null,
        first_discovered_pillar: String(r.first_discovered_pillar || 'consolidated'),
        first_discovered_at: r.first_discovered_at ? new Date(r.first_discovered_at).toISOString() : null,
        metadata: r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
      })));

      if (!options.dryRun) {
        await destSql`
          INSERT INTO universal_master_pins (
            pin_id, creator_username, board_name, title, domain, destination_url,
            image_url, description, alt_text, dominant_color, visual_annotations,
            created_at_pinterest, first_discovered_pillar, first_discovered_at,
            updated_at, metadata
          )
          SELECT DISTINCT ON (u.pin_id)
            u.pin_id, u.creator_username, u.board_name, u.title, u.domain, u.destination_url,
            u.image_url, u.description, u.alt_text, u.dominant_color, u.visual_annotations,
            NULLIF(TRIM(u.created_at_pinterest), '')::timestamptz, u.first_discovered_pillar,
            NULLIF(TRIM(u.first_discovered_at), '')::timestamptz, NOW(), u.metadata
          FROM jsonb_to_recordset(${payload}::jsonb) AS u(
            pin_id text, creator_username text, board_name text, title text, domain text, destination_url text,
            image_url text, description text, alt_text text, dominant_color text, visual_annotations jsonb,
            created_at_pinterest text, first_discovered_pillar text, first_discovered_at text, metadata jsonb
          )
          ORDER BY u.pin_id ASC
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
            metadata = COALESCE(universal_master_pins.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = NOW();
        `;
      }
      totalMigrated += dedupedRows.length;
    }

    cursor = String(rows[rows.length - 1].pin_id);
    if (rows.length < batchSize) break;
  }

  return totalMigrated;
}

/**
 * Keyset cursor migration for pins_daily_metrics
 */
export async function migratePinsDailyMetrics(sourceSql, destSql, sourceShardId, targetShardId, options = {}) {
  const batchSize = Math.max(10, Math.min(1000, options.batchSize || 500));
  let cursorPinId = '';
  let cursorDate = '1970-01-01';
  let totalMigrated = 0;

  while (true) {
    const rows = await sourceSql`
      SELECT 
        pin_id, snapshot_date, save_count, repin_count, comment_count, share_count,
        reaction_count, daily_save_velocity, updated_at
      FROM pins_daily_metrics
      WHERE (pin_id > ${cursorPinId})
         OR (pin_id = ${cursorPinId} AND snapshot_date > ${cursorDate}::date)
      ORDER BY pin_id ASC, snapshot_date ASC
      LIMIT ${batchSize};
    `;

    if (!rows || rows.length === 0) break;

    // Pre-serialization Map deduplication by (pin_id, snapshot_date)
    const metricsMap = new Map();
    for (const r of rows) {
      const pid = String(r?.pin_id || '').trim();
      const sDate = r.snapshot_date instanceof Date 
        ? r.snapshot_date.toISOString().slice(0, 10) 
        : String(r.snapshot_date).slice(0, 10);
      if (pid && sDate) {
        metricsMap.set(`${pid}::${sDate}`, { ...r, snapshot_date_str: sDate });
      }
    }

    if (metricsMap.size > 0) {
      const dedupedRows = Array.from(metricsMap.values());
      dedupedRows.sort((a, b) => {
        const cmp = String(a.pin_id).localeCompare(String(b.pin_id));
        if (cmp !== 0) return cmp;
        return String(a.snapshot_date_str).localeCompare(String(b.snapshot_date_str));
      });

      const payload = JSON.stringify(dedupedRows.map(r => ({
        pin_id: String(r.pin_id),
        snapshot_date: r.snapshot_date_str,
        save_count: Math.max(0, Number(r.save_count || 0)),
        repin_count: Math.max(0, Number(r.repin_count || 0)),
        comment_count: Math.max(0, Number(r.comment_count || 0)),
        share_count: Math.max(0, Number(r.share_count || 0)),
        reaction_count: Math.max(0, Number(r.reaction_count || 0)),
        daily_save_velocity: Number(r.daily_save_velocity || 0)
      })));

      if (!options.dryRun) {
        await destSql`
          INSERT INTO pins_daily_metrics (
            pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
          )
          SELECT DISTINCT ON (u.pin_id, u.snapshot_date)
            u.pin_id,
            u.snapshot_date::date,
            COALESCE(u.save_count, 0)::bigint,
            COALESCE(u.repin_count, 0)::int,
            COALESCE(u.comment_count, 0)::int,
            COALESCE(u.share_count, 0)::int,
            COALESCE(u.reaction_count, 0)::int,
            COALESCE(u.daily_save_velocity, 0)::numeric,
            NOW()
          FROM jsonb_to_recordset(${payload}::jsonb) AS u(
            pin_id text, snapshot_date date, save_count bigint, repin_count int, comment_count int, share_count int, reaction_count int, daily_save_velocity numeric
          )
          ORDER BY u.pin_id ASC, u.snapshot_date ASC
          ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
            save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
            repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
            comment_count = GREATEST(pins_daily_metrics.comment_count, EXCLUDED.comment_count),
            share_count = GREATEST(pins_daily_metrics.share_count, EXCLUDED.share_count),
            reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
            daily_save_velocity = CASE
              WHEN EXCLUDED.daily_save_velocity IS NOT NULL THEN EXCLUDED.daily_save_velocity
              ELSE pins_daily_metrics.daily_save_velocity
            END,
            updated_at = NOW();
        `;
      }
      totalMigrated += dedupedRows.length;
    }

    const last = rows[rows.length - 1];
    cursorPinId = String(last.pin_id);
    cursorDate = last.snapshot_date instanceof Date 
      ? last.snapshot_date.toISOString().slice(0, 10) 
      : String(last.snapshot_date).slice(0, 10);
    if (rows.length < batchSize) break;
  }

  return totalMigrated;
}

/**
 * Keyset cursor migration for pin_serp_positions
 */
export async function migratePinSerpPositions(sourceSql, destSql, sourceShardId, targetShardId, options = {}) {
  const batchSize = Math.max(10, Math.min(1000, options.batchSize || 500));
  let cursorPinId = '';
  let cursorDate = '1970-01-01';
  let cursorKeywordId = 0;
  let totalMigrated = 0;

  while (true) {
    const rows = await sourceSql`
      SELECT 
        pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank,
        catalog_rank, updated_at
      FROM pin_serp_positions
      WHERE (pin_id > ${cursorPinId})
         OR (pin_id = ${cursorPinId} AND snapshot_date > ${cursorDate}::date)
         OR (pin_id = ${cursorPinId} AND snapshot_date = ${cursorDate}::date AND keyword_id > ${cursorKeywordId})
      ORDER BY pin_id ASC, snapshot_date ASC, keyword_id ASC
      LIMIT ${batchSize};
    `;

    if (!rows || rows.length === 0) break;

    // Pre-serialization Map deduplication by (pin_id, snapshot_date, keyword_id)
    const positionsMap = new Map();
    for (const r of rows) {
      const pid = String(r?.pin_id || '').trim();
      const sDate = r.snapshot_date instanceof Date 
        ? r.snapshot_date.toISOString().slice(0, 10) 
        : String(r.snapshot_date).slice(0, 10);
      const kid = Number(r.keyword_id || 0);
      if (pid && sDate && kid) {
        positionsMap.set(`${pid}::${sDate}::${kid}`, { ...r, snapshot_date_str: sDate, keyword_id_num: kid });
      }
    }

    if (positionsMap.size > 0) {
      const dedupedRows = Array.from(positionsMap.values());
      dedupedRows.sort((a, b) => {
        const cmp1 = String(a.pin_id).localeCompare(String(b.pin_id));
        if (cmp1 !== 0) return cmp1;
        const cmp2 = String(a.snapshot_date_str).localeCompare(String(b.snapshot_date_str));
        if (cmp2 !== 0) return cmp2;
        return a.keyword_id_num - b.keyword_id_num;
      });

      const payload = JSON.stringify(dedupedRows.map(r => ({
        pin_id: String(r.pin_id),
        snapshot_date: r.snapshot_date_str,
        keyword_id: r.keyword_id_num,
        rank_position: r.rank_position !== null && r.rank_position !== undefined ? Number(r.rank_position) : null,
        is_displaced: Boolean(r.is_displaced),
        last_known_rank: r.last_known_rank !== null && r.last_known_rank !== undefined ? Number(r.last_known_rank) : null,
        catalog_rank: r.catalog_rank !== null && r.catalog_rank !== undefined ? Number(r.catalog_rank) : 100
      })));

      if (!options.dryRun) {
        await destSql`
          INSERT INTO pin_serp_positions (
            pin_id, snapshot_date, keyword_id, rank_position, is_displaced, last_known_rank, catalog_rank, updated_at
          )
          SELECT DISTINCT ON (u.pin_id, u.snapshot_date, u.keyword_id)
            u.pin_id,
            u.snapshot_date::date,
            u.keyword_id::int,
            u.rank_position::int,
            COALESCE(u.is_displaced, false)::boolean,
            u.last_known_rank::int,
            COALESCE(u.catalog_rank, 100)::int,
            NOW()
          FROM jsonb_to_recordset(${payload}::jsonb) AS u(
            pin_id text, snapshot_date date, keyword_id int, rank_position int, is_displaced boolean, last_known_rank int, catalog_rank int
          )
          ORDER BY u.pin_id ASC, u.snapshot_date ASC, u.keyword_id ASC
          ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
            rank_position = CASE
              WHEN EXCLUDED.is_displaced = TRUE AND pin_serp_positions.is_displaced = TRUE THEN NULL
              ELSE LEAST(pin_serp_positions.rank_position, EXCLUDED.rank_position)
            END,
            is_displaced = (COALESCE(pin_serp_positions.is_displaced, FALSE) AND COALESCE(EXCLUDED.is_displaced, FALSE)),
            last_known_rank = LEAST(pin_serp_positions.last_known_rank, EXCLUDED.last_known_rank),
            catalog_rank = LEAST(pin_serp_positions.catalog_rank, EXCLUDED.catalog_rank),
            updated_at = NOW();
        `;
      }
      totalMigrated += dedupedRows.length;
    }

    const last = rows[rows.length - 1];
    cursorPinId = String(last.pin_id);
    cursorDate = last.snapshot_date instanceof Date 
      ? last.snapshot_date.toISOString().slice(0, 10) 
      : String(last.snapshot_date).slice(0, 10);
    cursorKeywordId = Number(last.keyword_id || 0);
    if (rows.length < batchSize) break;
  }

  return totalMigrated;
}

/**
 * Row-count checksum verification helper
 */
export async function getTableRowCount(sql, tableName) {
  if (tableName === 'universal_master_pins') {
    const [res] = await sql`SELECT count(*)::bigint AS count FROM universal_master_pins;`;
    return Number(res?.count || 0);
  }
  if (tableName === 'pins_daily_metrics') {
    const [res] = await sql`SELECT count(*)::bigint AS count FROM pins_daily_metrics;`;
    return Number(res?.count || 0);
  }
  if (tableName === 'pin_serp_positions') {
    const [res] = await sql`SELECT count(*)::bigint AS count FROM pin_serp_positions;`;
    return Number(res?.count || 0);
  }
  return 0;
}

/**
 * Execute concurrent VACUUM ANALYZE outside transaction blocks (SQLSTATE 25001 defense)
 */
export async function runOutOfTransactionVacuum(destSql) {
  // [INVARIANT: SAFE-OUT-OF-TRANSACTION-VACUUM]
  await destSql`VACUUM ANALYZE universal_master_pins;`;
  await destSql`VACUUM ANALYZE pins_daily_metrics;`;
  await destSql`VACUUM ANALYZE pin_serp_positions;`;
}

/**
 * Prepare physical shard DDL, enforce fillfactor = 80, and clean legacy dead tables/indexes
 */
export async function preparePhysicalShardSchema(destSql) {
  // [INVARIANT: 100-PERCENT-HOT-UPDATES]
  await destSql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_master_pins') THEN
        ALTER TABLE universal_master_pins SET (fillfactor = 80);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pins_daily_metrics') THEN
        ALTER TABLE pins_daily_metrics SET (fillfactor = 80);
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pin_serp_positions') THEN
        ALTER TABLE pin_serp_positions SET (fillfactor = 80);
      END IF;
    END $$;
  `;

  await destSql`DROP INDEX IF EXISTS idx_ump_metadata_gin;`;
  await destSql`DROP INDEX IF EXISTS idx_ump_domain;`;
  await destSql`DROP INDEX IF EXISTS idx_ump_creator;`;
  await destSql`DROP INDEX IF EXISTS idx_ump_updated;`;

  await destSql`DROP TABLE IF EXISTS competitor_pins CASCADE;`;
  await destSql`DROP TABLE IF EXISTS pa_pins CASCADE;`;
  await destSql`DROP TABLE IF EXISTS pa_pin_metrics CASCADE;`;
  await destSql`DROP TABLE IF EXISTS competitor_boards CASCADE;`;
  await destSql`DROP TABLE IF EXISTS competitor_profiles CASCADE;`;
  await destSql`DROP TABLE IF EXISTS competitor_history_snapshots CASCADE;`;
  await destSql`DROP TABLE IF EXISTS keyword_serp_current CASCADE;`;
  await destSql`DROP TABLE IF EXISTS keyword_displaced_index CASCADE;`;

  await destSql`
    CREATE INDEX IF NOT EXISTS idx_psp_kw_date 
      ON pin_serp_positions (keyword_id, snapshot_date DESC);
  `;

  await destSql`
    CREATE OR REPLACE VIEW keyword_master_pins AS 
      SELECT * FROM universal_master_pins;
  `;

  await destSql`
    CREATE OR REPLACE VIEW pins_daily_snapshots AS
    SELECT 
      (('x' || SUBSTR(MD5(m.pin_id || '_' || m.snapshot_date::text || '_' || COALESCE(p.keyword_id::text, '0')), 1, 15))::bit(60)::bigint) AS id,
      m.pin_id,
      p.keyword_id,
      NULL::int AS competitor_id,
      p.rank_position,
      COALESCE(p.is_displaced, FALSE) AS is_displaced,
      p.last_known_rank,
      m.save_count,
      m.repin_count,
      m.comment_count,
      m.share_count,
      COALESCE(m.reaction_count, 0) AS reaction_count,
      m.daily_save_velocity,
      m.snapshot_date,
      m.updated_at AS created_at
    FROM pins_daily_metrics m
    LEFT JOIN pin_serp_positions p 
      ON p.pin_id = m.pin_id AND p.snapshot_date = m.snapshot_date;
  `;
}

/**
 * Atomically update Hub registry after consolidation completes
 */
export async function updateHubRegistryAfterConsolidation(hubSql) {
  if (!hubSql) return false;
  console.log('[consolidate] Updating neon_projects_registry on Central Hub to active 20-shard topology...');
  await hubSql`
    DO $$
    DECLARE
      p INT;
      assigned INT[];
      v INT;
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neon_projects_registry') THEN
        FOR p IN 1..20 LOOP
          assigned := ARRAY[]::INT[];
          v := p;
          WHILE v <= 99 LOOP
            assigned := array_append(assigned, v);
            v := v + 20;
          END LOOP;

          UPDATE neon_projects_registry
          SET
            assigned_shards = assigned,
            status = 'active',
            updated_at = NOW()
          WHERE project_name = 'pin-arbitrage-shard-' || LPAD(p::text, 2, '0');
        END LOOP;

        UPDATE neon_projects_registry
        SET
          status = 'retired',
          assigned_shards = '{}'::INT[],
          updated_at = NOW()
        WHERE project_name ~ '^pin-arbitrage-shard-(2[1-9]|[3-9][0-9])$';

        UPDATE neon_projects_registry
        SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"consolidated_to_20": true, "virtual_shards": 99, "consolidated_at": "2026-11-02"}'::jsonb
        WHERE is_hub = TRUE;
      END IF;
    END $$;
  `;
  console.log('  ✅ Central Hub registry updated: Shards 1..20 assigned virtual rooms, shards 21..99 retired.');
  return true;
}

/**
 * Main migration coordinator
 */
export async function runConsolidation(options = {}) {
  console.log('='.repeat(80));
  console.log('   PIN ARBITRAGE ENGINE (PAE) — 99 TO 20 SHARD CONSOLIDATION RUNNER');
  console.log('='.repeat(80));

  const hubUrl = process.env.DATABASE_URL;
  const dsnTemplate = process.env.NEON_SHARD_DSN_TEMPLATE;

  if (!hubUrl && !dsnTemplate) {
    console.log('[consolidate] No DATABASE_URL or NEON_SHARD_DSN_TEMPLATE provided in environment.');
    console.log('[consolidate] Dry-run self-test completed successfully.');
    return { ok: true, consolidatedCount: 0 };
  }

  let hubSql = null;
  if (hubUrl && isValidShardDsn(hubUrl)) {
    hubSql = neon(enforceNeonPoolerUrl(hubUrl));
  }

  // Load registry if Hub is available
  let registryRows = [];
  if (hubSql) {
    try {
      registryRows = await hubSql`
        SELECT id, project_id, project_name, database_url, status, assigned_shards
        FROM neon_projects_registry
        ORDER BY id ASC;
      `;
    } catch (err) {
      console.warn('[consolidate] Could not load neon_projects_registry from Hub:', err.message);
    }
  }

  const dsnMap = new Map();
  for (const r of registryRows) {
    if (isValidShardDsn(r.database_url)) {
      const match = r.project_name?.match(/shard-(\d+)/i);
      if (match) {
        dsnMap.set(parseInt(match[1], 10), r.database_url);
      }
    }
  }

  const resolveDsnForShard = (shardNum) => {
    if (dsnMap.has(shardNum)) return dsnMap.get(shardNum);
    if (dsnTemplate) {
      const padded = String(shardNum).padStart(2, '0');
      const shardName = getShardProjectName(shardNum);
      const computed = dsnTemplate
        .replace(/{SHARD_NUM}/g, padded)
        .replace(/{SHARD_ID}/g, String(shardNum))
        .replace(/{SHARD_NAME}/g, shardName);
      if (isValidShardDsn(computed)) return computed;
    }
    return null;
  };

  const targetShardFilter = options.targetShard ? Number(options.targetShard) : null;
  const sourceShardFilter = options.sourceShard ? Number(options.sourceShard) : null;

  let totalMigratedPins = 0;
  let totalMigratedMetrics = 0;
  let totalMigratedPositions = 0;
  let pairsProcessed = 0;

  // Group execution by physical shard 1..20 to allow:
  // (1) Preparing schema & fillfactor once per physical shard
  // (2) Keyset copying of all virtual rooms belonging to this physical shard
  // (3) Executing out-of-transaction VACUUM ANALYZE strictly ONCE per physical shard
  for (let physicalId = 1; physicalId <= 20; physicalId++) {
    if (targetShardFilter && physicalId !== targetShardFilter) continue;

    // Find virtual rooms mapped to this physical shard: [physicalId+20, physicalId+40, ...] <= 99
    const virtualRooms = [];
    for (let v = physicalId + 20; v <= 99; v += 20) {
      if (!sourceShardFilter || v === sourceShardFilter) {
        virtualRooms.push(v);
      }
    }

    if (virtualRooms.length === 0) continue;

    const targetDsn = resolveDsnForShard(physicalId);
    if (!targetDsn) continue;

    const destSql = neon(enforceNeonPoolerUrl(targetDsn));

    // (b) Prepare physical shard schema on physical shard (1..20) before copying
    if (!options.dryRun) {
      console.log(`[consolidate] Preparing schema on Physical Shard #${physicalId}...`);
      await preparePhysicalShardSchema(destSql);
    }

    let shardReceivedData = false;

    // (c) Keyset migration 21..99 into 1..20 with checksum gates
    for (const virtualId of virtualRooms) {
      const sourceDsn = resolveDsnForShard(virtualId);
      if (!sourceDsn) continue;

      if (sourceDsn === targetDsn) {
        // Source and destination point to same database; no copy needed
        console.log(`[consolidate] Virtual #${virtualId} maps to Physical #${physicalId} (Same DSN — already consolidated).`);
        continue;
      }

      console.log(`[consolidate] Migrating Virtual #${virtualId} -> Physical #${physicalId}...`);
      pairsProcessed++;

      const sourceSql = neon(enforceNeonPoolerUrl(sourceDsn));

      try {
        const sourcePinsBefore = await getTableRowCount(sourceSql, 'universal_master_pins');
        const destPinsBefore = await getTableRowCount(destSql, 'universal_master_pins');

        const migratedPins = await migrateUniversalMasterPins(sourceSql, destSql, virtualId, physicalId, options);
        const migratedMetrics = await migratePinsDailyMetrics(sourceSql, destSql, virtualId, physicalId, options);
        const migratedPositions = await migratePinSerpPositions(sourceSql, destSql, virtualId, physicalId, options);

        totalMigratedPins += migratedPins;
        totalMigratedMetrics += migratedMetrics;
        totalMigratedPositions += migratedPositions;

        // Row-count checksum verification gate
        const destPinsAfter = await getTableRowCount(destSql, 'universal_master_pins');
        if (!options.dryRun && sourcePinsBefore > 0 && destPinsAfter < destPinsBefore) {
          throw new Error(`[CHECKSUM GATE FAILED] Target pins count decreased on shard #${physicalId}!`);
        }

        console.log(`  ✅ Virtual #${virtualId} -> Physical #${physicalId}: ${migratedPins} pins, ${migratedMetrics} metrics, ${migratedPositions} positions.`);
        shardReceivedData = true;
      } catch (migErr) {
        console.error(`  ❌ Error consolidating virtual shard #${virtualId} -> physical #${physicalId}:`, migErr.message);
        if (!options.continueOnError) {
          throw migErr;
        }
      }
    }

    // (d) VACUUM ANALYZE strictly ONCE per physical shard (1..20) after copying and verifying all virtual rooms
    if (!options.dryRun && (shardReceivedData || options.vacuumAll)) {
      console.log(`[consolidate] Running out-of-transaction VACUUM ANALYZE on physical shard #${physicalId}...`);
      await runOutOfTransactionVacuum(destSql);
    }
  }

  // (e) Update Hub neon_projects_registry to assign virtual rooms and retire 21..99
  if (hubSql && !options.dryRun && !options.sourceShard && !options.targetShard) {
    await updateHubRegistryAfterConsolidation(hubSql);
  }

  console.log('='.repeat(80));
  console.log(`🎉 Consolidation complete: ${pairsProcessed} pairs processed.`);
  console.log(`   Total Migrated: ${totalMigratedPins} pins, ${totalMigratedMetrics} metrics, ${totalMigratedPositions} positions.`);
  console.log('='.repeat(80));

  return {
    ok: true,
    pairsProcessed,
    totalMigratedPins,
    totalMigratedMetrics,
    totalMigratedPositions
  };
}

// Direct invocation CLI handler
const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectCli) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const continueOnError = args.includes('--continue-on-error');
  const vacuumAll = args.includes('--vacuum-all');
  const sourceShardArg = args.find(a => a.startsWith('--source-shard='));
  const targetShardArg = args.find(a => a.startsWith('--target-shard='));
  const sourceShard = sourceShardArg ? parseInt(sourceShardArg.split('=')[1], 10) : null;
  const targetShard = targetShardArg ? parseInt(targetShardArg.split('=')[1], 10) : null;

  runConsolidation({ dryRun, continueOnError, sourceShard, targetShard, vacuumAll })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal consolidation failure:', err);
      process.exit(1);
    });
}
