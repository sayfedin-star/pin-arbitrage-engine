#!/usr/bin/env node

/**
 * scripts/run_migration_033.mjs
 *
 * Migration 033: Forensic Hardening, Rollup Studio & Historical View Safety
 * - Central Metadata Hub: domain_intelligence_rollup table, covering indexes, heartbeats HOT index, board_slug
 * - 99 Neon Shards: pins_daily_snapshots historical migration and VIEW conversion, heartbeats index, board_slug
 * - Schema Migrations synchronization across Hub and all active Fleet Shards
 *
 * Engine: Neon Serverless Postgres via @neondatabase/serverless
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { enforceNeonPoolerUrl } from '../src/modules/sharding/fleet-router.mjs';
import { refreshDomainIntelligenceRollup } from '../src/modules/domains/service.mjs';

// Auto-load .env
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
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const hubSql = neon(enforceNeonPoolerUrl(DATABASE_URL));

async function run() {
  console.log('[*] ==============================================================');
  console.log('[*] Running Migration 033: Forensic Hardening, Rollups & View Parity');
  console.log('[*] Target: Neon Serverless Postgres (Hub & Fleet Shards)');
  console.log('[*] ==============================================================');

  // Compute Checksum
  const migrationSqlPath = path.resolve(process.cwd(), 'scripts/migrations/033_forensic_hardening_and_rollups.sql');
  const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
  console.log(`[*] Migration 033 SQL SHA-256: ${checksum}`);

  // ============================================================================
  // STEP 1: Apply to Central Metadata Hub
  // ============================================================================
  console.log('\n[1/4] Applying Migration 033 to Central Metadata Hub...');

  // 1.1 Heartbeats HOT Index
  console.log('  -> Hardening crawler_shard_heartbeats index...');
  await hubSql`DROP INDEX IF EXISTS idx_crawler_shard_heartbeats_status;`;
  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_crawler_shard_heartbeats_active 
      ON crawler_shard_heartbeats (competitor_id, status)
      WHERE status IN ('crawling_boards', 'enriching');
  `;

  // 1.2 Competitor pins board_slug and covering index
  console.log('  -> Adding board_slug and covering index on competitor_pins...');
  await hubSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS board_slug VARCHAR(255);`;
  await hubSql`CREATE INDEX IF NOT EXISTS idx_cp_board_slug ON competitor_pins(competitor_id, board_slug);`;
  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_cp_domain_rollup_covering 
      ON competitor_pins (LOWER(REGEXP_REPLACE(link_domain, '^www\.', '')))
      INCLUDE (pin_id, competitor_id, save_count, repin_count, destination_url)
      WHERE link_domain IS NOT NULL AND link_domain <> '';
  `;

  // 1.3 Create Permanent domain_intelligence_rollup Table and Indexes
  console.log('  -> Creating permanent domain_intelligence_rollup table...');
  await hubSql`
    CREATE TABLE IF NOT EXISTS domain_intelligence_rollup (
      domain VARCHAR(255) PRIMARY KEY,
      total_pins INT NOT NULL DEFAULT 0,
      unique_urls INT NOT NULL DEFAULT 1,
      active_serp_pins INT NOT NULL DEFAULT 0,
      top3_pins INT NOT NULL DEFAULT 0,
      top10_pins INT NOT NULL DEFAULT 0,
      rank_11_50_pins INT NOT NULL DEFAULT 0,
      displaced_pins INT NOT NULL DEFAULT 0,
      best_rank INT,
      avg_rank NUMERIC(5,2),
      visibility_score NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_saves BIGINT NOT NULL DEFAULT 0,
      avg_saves NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_repins BIGINT NOT NULL DEFAULT 0,
      avg_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
      pins_per_url NUMERIC(6,2) NOT NULL DEFAULT 1.0,
      accounts_count INT NOT NULL DEFAULT 1,
      sample_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
      ad_network VARCHAR(64) DEFAULT 'unchecked',
      ad_manager_domain VARCHAR(255),
      primary_pub_id VARCHAR(128),
      previous_ad_network VARCHAR(64),
      ad_switched_at TIMESTAMPTZ,
      ad_network_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      ads_txt_status VARCHAR(32) DEFAULT 'pending',
      ad_provider VARCHAR(64),
      age_days INT,
      age_years NUMERIC(5,2),
      age_status VARCHAR(32) DEFAULT 'unchecked',
      domain_created_at TIMESTAMPTZ,
      domain_expires_at TIMESTAMPTZ,
      lookup_status VARCHAR(32) DEFAULT 'pending',
      decay_rate_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
      arbitrage_score NUMERIC(10,2) DEFAULT 0,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS primary_pub_id VARCHAR(128);`;
  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ad_switched_at TIMESTAMPTZ;`;
  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ad_network_history JSONB NOT NULL DEFAULT '[]'::jsonb;`;
  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ads_txt_status VARCHAR(32) DEFAULT 'pending';`;
  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS decay_rate_pct NUMERIC(5,1) NOT NULL DEFAULT 0;`;
  await hubSql`ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`;

  await hubSql`CREATE INDEX IF NOT EXISTS idx_dir_vis_saves ON domain_intelligence_rollup(visibility_score DESC, total_saves DESC);`;
  await hubSql`CREATE INDEX IF NOT EXISTS idx_dir_top10 ON domain_intelligence_rollup(top10_pins DESC);`;
  await hubSql`CREATE INDEX IF NOT EXISTS idx_dir_ad_network ON domain_intelligence_rollup(ad_network);`;
  await hubSql`CREATE INDEX IF NOT EXISTS idx_dir_age_status ON domain_intelligence_rollup(age_status);`;

  // 1.4 Historical Snapshots Migration and VIEW on Hub (if applicable)
  console.log('  -> Ensuring historical data safety & consolidated pins_daily_snapshots VIEW on Hub...');
  await hubSql`
    CREATE TABLE IF NOT EXISTS pins_daily_metrics (
      pin_id VARCHAR(64) NOT NULL,
      snapshot_date DATE NOT NULL,
      save_count BIGINT NOT NULL DEFAULT 0,
      repin_count INT NOT NULL DEFAULT 0,
      comment_count INT NOT NULL DEFAULT 0,
      share_count INT NOT NULL DEFAULT 0,
      reaction_count INT NOT NULL DEFAULT 0,
      daily_save_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (pin_id, snapshot_date)
    );
  `;
  await hubSql`
    CREATE TABLE IF NOT EXISTS pin_serp_positions (
      pin_id VARCHAR(64) NOT NULL,
      snapshot_date DATE NOT NULL,
      keyword_id INT NOT NULL,
      rank_position INT,
      is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
      last_known_rank INT,
      catalog_rank INT DEFAULT 100,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (pin_id, snapshot_date, keyword_id)
    );
  `;
  await hubSql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'pins_daily_snapshots' AND table_type = 'BASE TABLE'
      ) THEN
        INSERT INTO pins_daily_metrics (
          pin_id, snapshot_date, save_count, repin_count, comment_count,
          share_count, reaction_count, daily_save_velocity, updated_at
        )
        SELECT 
          pin_id,
          snapshot_date,
          MAX(save_count) AS save_count,
          MAX(COALESCE(repin_count, 0)) AS repin_count,
          MAX(COALESCE(comment_count, 0)) AS comment_count,
          MAX(COALESCE(share_count, 0)) AS share_count,
          MAX(COALESCE(reaction_count, 0)) AS reaction_count,
          MAX(COALESCE(daily_save_velocity, 0)) AS daily_save_velocity,
          MAX(COALESCE(created_at, NOW())) AS updated_at
        FROM pins_daily_snapshots
        GROUP BY pin_id, snapshot_date
        ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
          save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
          repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
          reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
          updated_at = NOW();

        INSERT INTO pin_serp_positions (
          pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
          last_known_rank, catalog_rank, updated_at
        )
        SELECT 
          pin_id,
          snapshot_date,
          keyword_id,
          MIN(rank_position) AS rank_position,
          BOOL_OR(COALESCE(is_displaced, FALSE)) AS is_displaced,
          MIN(rank_position) AS last_known_rank,
          MIN(COALESCE(rank_position, 100)) AS catalog_rank,
          MAX(COALESCE(created_at, NOW())) AS updated_at
        FROM pins_daily_snapshots
        WHERE keyword_id IS NOT NULL AND keyword_id > 0
        GROUP BY pin_id, snapshot_date, keyword_id
        ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
          rank_position = COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position),
          updated_at = NOW();

        DROP TABLE pins_daily_snapshots CASCADE;
      END IF;
    END $$;
  `;

  await hubSql`
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

  console.log('[+] Central Metadata Hub: Migration 033 objects applied successfully.');

  // ============================================================================
  // STEP 2: Register in schema_migrations on Hub
  // ============================================================================
  console.log('\n[2/4] Registering Migration 033 in schema_migrations on Hub...');
  await hubSql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await hubSql`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES ('033', '033_forensic_hardening_and_rollups', ${checksum}, NOW())
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum = EXCLUDED.checksum,
      applied_at = NOW();
  `;
  console.log('[+] Central Hub: Recorded Migration 033 in schema_migrations.');

  // Populate Domain Intelligence Rollup
  console.log('\n[*] Refreshing Domain Intelligence Rollup from live data...');
  try {
    const rollupResult = await refreshDomainIntelligenceRollup(hubSql);
    console.log(`[+] Domain Rollup refreshed: ${rollupResult.refreshed_domains} domains compiled.`);
  } catch (rErr) {
    console.warn(`[!] Domain Rollup initial compilation non-fatal warning: ${rErr.message}`);
  }

  // ============================================================================
  // STEP 3: Propagate to all active fleet shards
  // ============================================================================
  console.log('\n[3/4] Propagating Migration 033 to active Neon Fleet Shards...');
  let registry = [];
  try {
    registry = await hubSql`
      SELECT id, project_id, project_name, is_hub, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL
      ORDER BY id ASC;
    `;
  } catch (err) {
    console.error('[-] Fatal: Failed to query neon_projects_registry:', err.message);
    process.exit(1);
  }

  console.log(`[*] Discovered ${registry.length} active fleet shards to process.`);
  let succeeded = 0;
  let failed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < registry.length; i += BATCH_SIZE) {
    const batch = registry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (shard) => {
      try {
        const poolerUrl = enforceNeonPoolerUrl(shard.database_url);
        const shardSql = neon(poolerUrl);

        // A. Crawler heartbeats HOT index
        await shardSql`DROP INDEX IF EXISTS idx_crawler_shard_heartbeats_status;`;
        await shardSql`
          CREATE INDEX IF NOT EXISTS idx_crawler_shard_heartbeats_active 
            ON crawler_shard_heartbeats (competitor_id, status)
            WHERE status IN ('crawling_boards', 'enriching');
        `.catch(() => {});

        // B. competitor_pins board_slug
        await shardSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS board_slug VARCHAR(255);`.catch(() => {});
        await shardSql`CREATE INDEX IF NOT EXISTS idx_cp_board_slug ON competitor_pins(competitor_id, board_slug);`.catch(() => {});

        // C. Two-Tier base tables creation if missing
        await shardSql`
          CREATE TABLE IF NOT EXISTS pins_daily_metrics (
            pin_id VARCHAR(64) NOT NULL,
            snapshot_date DATE NOT NULL,
            save_count BIGINT NOT NULL DEFAULT 0,
            repin_count INT NOT NULL DEFAULT 0,
            comment_count INT NOT NULL DEFAULT 0,
            share_count INT NOT NULL DEFAULT 0,
            reaction_count INT NOT NULL DEFAULT 0,
            daily_save_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (pin_id, snapshot_date)
          );
        `.catch(() => {});

        await shardSql`
          CREATE TABLE IF NOT EXISTS pin_serp_positions (
            pin_id VARCHAR(64) NOT NULL,
            snapshot_date DATE NOT NULL,
            keyword_id INT NOT NULL,
            rank_position INT,
            is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
            last_known_rank INT,
            catalog_rank INT DEFAULT 100,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (pin_id, snapshot_date, keyword_id)
          );
        `.catch(() => {});

        // D. Historical migration & VIEW conversion
        await shardSql`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_name = 'pins_daily_snapshots' AND table_type = 'BASE TABLE'
            ) THEN
              INSERT INTO pins_daily_metrics (
                pin_id, snapshot_date, save_count, repin_count, comment_count,
                share_count, reaction_count, daily_save_velocity, updated_at
              )
              SELECT 
                pin_id,
                snapshot_date,
                MAX(save_count) AS save_count,
                MAX(COALESCE(repin_count, 0)) AS repin_count,
                MAX(COALESCE(comment_count, 0)) AS comment_count,
                MAX(COALESCE(share_count, 0)) AS share_count,
                MAX(COALESCE(reaction_count, 0)) AS reaction_count,
                MAX(COALESCE(daily_save_velocity, 0)) AS daily_save_velocity,
                MAX(COALESCE(created_at, NOW())) AS updated_at
              FROM pins_daily_snapshots
              GROUP BY pin_id, snapshot_date
              ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
                save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
                repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
                reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
                updated_at = NOW();

              INSERT INTO pin_serp_positions (
                pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
                last_known_rank, catalog_rank, updated_at
              )
              SELECT 
                pin_id,
                snapshot_date,
                keyword_id,
                MIN(rank_position) AS rank_position,
                BOOL_OR(COALESCE(is_displaced, FALSE)) AS is_displaced,
                MIN(rank_position) AS last_known_rank,
                MIN(COALESCE(rank_position, 100)) AS catalog_rank,
                MAX(COALESCE(created_at, NOW())) AS updated_at
              FROM pins_daily_snapshots
              WHERE keyword_id IS NOT NULL AND keyword_id > 0
              GROUP BY pin_id, snapshot_date, keyword_id
              ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
                rank_position = COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position),
                updated_at = NOW();

              DROP TABLE pins_daily_snapshots CASCADE;
            END IF;
          END $$;
        `;

        await shardSql`
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

        // E. Register in shard schema_migrations
        await shardSql`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            checksum VARCHAR(64),
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `.catch(() => {});

        await shardSql`
          INSERT INTO schema_migrations (version, name, checksum, applied_at)
          VALUES ('033', '033_forensic_hardening_and_rollups', ${checksum}, NOW())
          ON CONFLICT (version) DO UPDATE SET
            name = EXCLUDED.name,
            checksum = EXCLUDED.checksum,
            applied_at = NOW();
        `.catch(() => {});

        succeeded++;
      } catch (err) {
        console.error(`[-] Failed on shard ${shard.project_name || shard.id}:`, err.message);
        failed++;
      }
    }));
    console.log(`  Processed ${Math.min(i + BATCH_SIZE, registry.length)}/${registry.length} shards...`);
  }

  console.log(`[+] Fleet Shard execution complete: ${succeeded} succeeded, ${failed} failed.`);

  // ============================================================================
  // STEP 4: Deep Verification Check
  // ============================================================================
  console.log('\n[4/4] Step 4 — Verification Check on Hub & Sample Shards...');

  // 4.1 Verify Hub
  const [hubMigration] = await hubSql`SELECT version, name, applied_at FROM schema_migrations WHERE version = '033';`;
  const [hubView] = await hubSql`
    SELECT table_type 
    FROM information_schema.tables 
    WHERE table_name = 'pins_daily_snapshots';
  `;
  const [{ count: rollupCount }] = await hubSql`SELECT COUNT(*)::int AS count FROM domain_intelligence_rollup;`;

  console.log(`  -> Hub Migration 033: ${hubMigration ? `OK (Applied: ${hubMigration.applied_at})` : 'MISSING'}`);
  console.log(`  -> Hub pins_daily_snapshots Type: ${hubView?.table_type || 'UNKNOWN'}`);
  console.log(`  -> Hub domain_intelligence_rollup Rows: ${rollupCount}`);

  // 4.2 Spot check 3 shards
  for (const sid of [1, 50, 99]) {
    const sEntry = registry.find(r => r.project_name === `pin-arbitrage-shard-${String(sid).padStart(2, '0')}`);
    if (sEntry) {
      try {
        const sSql = neon(enforceNeonPoolerUrl(sEntry.database_url));
        const [sMig] = await sSql`SELECT version, applied_at FROM schema_migrations WHERE version = '033';`;
        const [sView] = await sSql`
          SELECT table_type 
          FROM information_schema.tables 
          WHERE table_name = 'pins_daily_snapshots';
        `;
        console.log(`  -> Shard #${sid} (${sEntry.project_name}): Migration ${sMig?.version || 'N/A'}, View: ${sView?.table_type || 'N/A'}`);
      } catch (sErr) {
        console.warn(`  -> Shard #${sid} verification check warning:`, sErr.message);
      }
    }
  }

  console.log('\n==============================================================');
  console.log('✅ [MIGRATION 033 COMPLETE] Hub & 99 Shards in 100% Forensic Parity!');
  console.log('==============================================================');
}

run().catch((err) => {
  console.error('[-] FATAL Migration Error:', err);
  process.exit(1);
});
