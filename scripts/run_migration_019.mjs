import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Auto-load .env
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required');
  process.exit(1);
}

const hubSql = neon(DATABASE_URL);

async function run() {
  console.log('================================================================');
  console.log('🚀 MIGRATION 019: CONSOLIDATE UNIFIED KEYWORD CATALOG & DEPRECATE DISPLACED PINS');
  console.log('================================================================');

  // Step 1: Relax rank_position nullability
  console.log('[1/8] Dropping NOT NULL constraint from rank_position in keyword_serp_current...');
  await hubSql`ALTER TABLE keyword_serp_current ALTER COLUMN rank_position DROP NOT NULL;`;
  console.log('  [+] rank_position is now nullable.');

  // Step 2: Upgrade save_count to BIGINT
  console.log('[2/8] Upgrading save_count column to BIGINT...');
  await hubSql`ALTER TABLE keyword_serp_current ALTER COLUMN save_count TYPE BIGINT;`;
  console.log('  [+] save_count upgraded to BIGINT.');

  // Step 3: Add unified catalog state columns
  console.log('[3/8] Adding unified catalog state columns to keyword_serp_current...');
  await hubSql`
    ALTER TABLE keyword_serp_current 
      ADD COLUMN IF NOT EXISTS is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS last_known_rank INT,
      ADD COLUMN IF NOT EXISTS displaced_date DATE,
      ADD COLUMN IF NOT EXISTS vacuum_opportunity_score INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `;
  console.log('  [+] State columns added successfully.');

  // Step 4: Add partial unique index for active pins
  console.log('[4/8] Creating partial unique index for active pins (uq_ksc_active_rank)...');
  await hubSql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ksc_active_rank 
    ON keyword_serp_current (keyword_id, rank_position) 
    WHERE is_displaced = FALSE AND rank_position IS NOT NULL;
  `;
  console.log('  [+] Partial unique index uq_ksc_active_rank created.');

  // Step 5: Add performance indexes for vault filtering
  console.log('[5/8] Creating performance indexes for vault filtering...');
  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_ksc_vault_opportunity 
    ON keyword_serp_current (keyword_id, vacuum_opportunity_score DESC) 
    WHERE is_displaced = TRUE;
  `;
  await hubSql`
    CREATE INDEX IF NOT EXISTS idx_ksc_displaced_lookup 
    ON keyword_serp_current (keyword_id, is_displaced, displaced_date DESC);
  `;
  console.log('  [+] Performance indexes created.');

  // Step 6: Backfill from keyword_displaced_pins into keyword_serp_current
  console.log('[6/8] Backfilling records from keyword_displaced_pins into keyword_serp_current...');
  const tableCheck = await hubSql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'keyword_displaced_pins'
    ) as exists;
  `;

  if (tableCheck[0]?.exists) {
    const backfillResult = await hubSql`
      INSERT INTO keyword_serp_current (
        keyword_id,
        pin_id,
        rank_position,
        last_known_rank,
        title,
        domain,
        destination_url,
        image_url,
        creator_username,
        board_name,
        save_count,
        repin_count,
        comment_count,
        share_count,
        daily_save_velocity,
        dominant_color,
        visual_annotations,
        displaced_date,
        vacuum_opportunity_score,
        is_displaced,
        created_at_pinterest,
        creation_method,
        metadata,
        crawled_at,
        updated_at
      )
      SELECT 
        dp.keyword_id,
        dp.pin_id,
        NULL,
        dp.last_known_rank,
        dp.title,
        dp.domain,
        dp.destination_url,
        dp.image_url,
        COALESCE(dp.metadata->'pinner'->>'username', ''),
        COALESCE(dp.board_name, ''),
        dp.current_saves::bigint,
        dp.current_repins::int,
        dp.current_comments::int,
        dp.current_shares::int,
        COALESCE(dp.daily_save_velocity, 0),
        COALESCE(dp.dominant_color, '#888888'),
        COALESCE(dp.annotations, '[]'::jsonb),
        COALESCE(dp.displaced_date, CURRENT_DATE),
        COALESCE(dp.vacuum_opportunity_score, 0),
        TRUE,
        dp.created_at_pinterest,
        COALESCE(dp.creation_method, 'pinterest_platform'),
        COALESCE(dp.metadata, '{}'::jsonb),
        COALESCE(dp.last_checked_at, dp.updated_at, NOW()),
        NOW()
      FROM keyword_displaced_pins dp
      ON CONFLICT (keyword_id, pin_id) DO UPDATE SET
        is_displaced = TRUE,
        last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_serp_current.last_known_rank, keyword_serp_current.rank_position),
        displaced_date = COALESCE(EXCLUDED.displaced_date, keyword_serp_current.displaced_date, CURRENT_DATE),
        vacuum_opportunity_score = GREATEST(keyword_serp_current.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
        save_count = GREATEST(keyword_serp_current.save_count, EXCLUDED.save_count),
        repin_count = GREATEST(keyword_serp_current.repin_count, EXCLUDED.repin_count),
        comment_count = GREATEST(COALESCE(keyword_serp_current.comment_count, 0), EXCLUDED.comment_count),
        share_count = GREATEST(COALESCE(keyword_serp_current.share_count, 0), EXCLUDED.share_count),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), keyword_serp_current.title),
        metadata = COALESCE(keyword_serp_current.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = NOW();
    `;
    console.log('  [+] Backfill completed successfully.');

    // Step 7: Soft Deprecation rename
    console.log('[7/8] Soft-deprecating keyword_displaced_pins -> _backup_keyword_displaced_pins...');
    await hubSql`ALTER TABLE keyword_displaced_pins RENAME TO _backup_keyword_displaced_pins;`;
    console.log('  [+] Table renamed to _backup_keyword_displaced_pins.');
  } else {
    console.log('  [*] keyword_displaced_pins already migrated or renamed. Skipping backfill/rename.');
  }

  // Step 8: Apply shard unique constraints on pins_daily_snapshots across fleet
  console.log('[8/8] Applying unique constraint uq_pins_daily_snapshots_pin_date on storage shards...');
  try {
    const projects = await hubSql`
      SELECT id, project_id, project_name, is_hub, database_url
      FROM neon_projects_registry
      WHERE status = 'active' AND database_url IS NOT NULL;
    `;
    console.log(`  [*] Found ${projects.length} active fleet projects to verify.`);
    for (const proj of projects) {
      try {
        const client = proj.is_hub ? hubSql : neon(proj.database_url);
        // Ensure table exists before adding index
        await client`
          CREATE TABLE IF NOT EXISTS pins_daily_snapshots (
            id BIGSERIAL PRIMARY KEY,
            pin_id VARCHAR(64) NOT NULL,
            snapshot_date DATE NOT NULL,
            keyword_id INT,
            competitor_id INT,
            board_id VARCHAR(64),
            rank_position INT,
            save_count BIGINT DEFAULT 0,
            repin_count INT DEFAULT 0,
            comment_count INT DEFAULT 0,
            share_count INT DEFAULT 0,
            reaction_count INT DEFAULT 0,
            daily_save_velocity NUMERIC DEFAULT 0,
            is_displaced BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `.catch(() => {});

        // Dedup if any duplicates exist before creating unique index
        await client`
          DELETE FROM pins_daily_snapshots a
          USING pins_daily_snapshots b
          WHERE a.id < b.id 
            AND a.pin_id = b.pin_id 
            AND a.snapshot_date = b.snapshot_date;
        `.catch(() => {});

        await client`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_pins_daily_snapshots_pin_date 
          ON pins_daily_snapshots (pin_id, snapshot_date);
        `;
        console.log(`    [+] Shard/Project "${proj.project_name}" index applied.`);
      } catch (pErr) {
        console.warn(`    [-] Warning applying to project "${proj.project_name}":`, pErr.message);
      }
    }
  } catch (err) {
    console.warn('  [-] Non-fatal shard constraint warning:', err.message);
  }

  // Verification
  console.log('\n--- VERIFICATION AUDIT ---');
  const [activeCount] = await hubSql`
    SELECT COUNT(*)::int as count 
    FROM keyword_serp_current 
    WHERE is_displaced = FALSE;
  `;
  const [vaultCount] = await hubSql`
    SELECT COUNT(*)::int as count 
    FROM keyword_serp_current 
    WHERE is_displaced = TRUE;
  `;
  const [targetPinCheck] = await hubSql`
    SELECT pin_id, keyword_id, rank_position, last_known_rank, is_displaced, title, save_count 
    FROM keyword_serp_current 
    WHERE pin_id = '3025924747299199';
  `;

  console.log(`[+] Total Active SERP Pins in keyword_serp_current:  ${activeCount?.count}`);
  console.log(`[+] Total Displaced Vault Pins in keyword_serp_current: ${vaultCount?.count}`);
  console.log('[+] Target Pin 3025924747299199 in Unified Catalog:', targetPinCheck || 'Not found');
  console.log('\n✅ MIGRATION 019 SUCCESSFULLY COMPLETED!');
}

run().catch(err => {
  console.error('[-] FATAL ERROR DURING MIGRATION 019:', err);
  process.exit(1);
});
