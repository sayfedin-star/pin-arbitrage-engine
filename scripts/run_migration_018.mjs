import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

if (typeof process.loadEnvFile === 'function') process.loadEnvFile();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  console.log('[*] Running Migration 018: Unify Keyword Displaced Pins into keyword_pins_snapshots...');
  const sqlContent = fs.readFileSync('scripts/migrations/018_unify_keyword_displaced_into_snapshots.sql', 'utf8');

  // 1. Alter table
  console.log('[1/4] Adding columns to keyword_pins_snapshots...');
  await sql`
    ALTER TABLE keyword_pins_snapshots 
    ADD COLUMN IF NOT EXISTS last_known_rank INT,
    ADD COLUMN IF NOT EXISTS displaced_date DATE,
    ADD COLUMN IF NOT EXISTS delta_saves_24h BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delta_repins_24h BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delta_saves_3d BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delta_repins_3d BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delta_saves_7d BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delta_repins_7d BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vacuum_opportunity_score INT DEFAULT 0;
  `;
  console.log('[+] Columns added successfully.');

  // 2. Indexes
  console.log('[2/4] Creating fast partial indexes...');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_kps_displaced_vault_fast 
    ON keyword_pins_snapshots (keyword_id, snapshot_date DESC, vacuum_opportunity_score DESC)
    WHERE is_displaced = TRUE;
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_kps_displaced_date
    ON keyword_pins_snapshots (keyword_id, displaced_date DESC)
    WHERE is_displaced = TRUE;
  `;
  console.log('[+] Indexes created successfully.');

  // 3. Backfill
  console.log('[3/4] Backfilling displaced pins into keyword_pins_snapshots...');
  const res = await sql`
    INSERT INTO keyword_pins_snapshots (
        keyword_id, pin_id, rank_position, last_known_rank, title, domain, destination_url, image_url,
        save_count, repin_count, comment_count, share_count, daily_save_velocity,
        snapshot_date, displaced_date, is_displaced,
        delta_saves_24h, delta_repins_24h, delta_saves_3d, delta_repins_3d, delta_saves_7d, delta_repins_7d,
        vacuum_opportunity_score, created_at_pinterest, creation_method, metadata, created_at
    )
    SELECT 
        dp.keyword_id, dp.pin_id, NULL, dp.last_known_rank, dp.title, dp.domain, dp.destination_url, dp.image_url,
        dp.current_saves, dp.current_repins, dp.current_comments, dp.current_shares, dp.daily_save_velocity::int,
        COALESCE(dp.displaced_date, CURRENT_DATE) as snapshot_date,
        COALESCE(dp.displaced_date, CURRENT_DATE) as displaced_date,
        TRUE as is_displaced,
        dp.delta_saves_24h, dp.delta_repins_24h, dp.delta_saves_3d, dp.delta_repins_3d, dp.delta_saves_7d, dp.delta_repins_7d,
        dp.vacuum_opportunity_score, dp.created_at_pinterest, dp.creation_method,
        COALESCE(dp.metadata, '{}'::jsonb) || jsonb_build_object(
            'board_name', dp.board_name,
            'method', dp.creation_method,
            'creation_method', dp.creation_method,
            'created_at_pinterest', dp.created_at_pinterest
        ),
        COALESCE(dp.created_at, NOW())
    FROM keyword_displaced_pins dp
    ON CONFLICT (keyword_id, pin_id, snapshot_date) DO UPDATE SET
        is_displaced = TRUE,
        last_known_rank = COALESCE(EXCLUDED.last_known_rank, keyword_pins_snapshots.last_known_rank, keyword_pins_snapshots.rank_position),
        displaced_date = COALESCE(EXCLUDED.displaced_date, keyword_pins_snapshots.displaced_date),
        save_count = GREATEST(keyword_pins_snapshots.save_count, EXCLUDED.save_count),
        repin_count = GREATEST(keyword_pins_snapshots.repin_count, EXCLUDED.repin_count),
        share_count = GREATEST(COALESCE(keyword_pins_snapshots.share_count, 0), EXCLUDED.share_count),
        vacuum_opportunity_score = GREATEST(keyword_pins_snapshots.vacuum_opportunity_score, EXCLUDED.vacuum_opportunity_score),
        delta_saves_24h = EXCLUDED.delta_saves_24h,
        delta_repins_24h = EXCLUDED.delta_repins_24h,
        delta_saves_3d = EXCLUDED.delta_saves_3d,
        delta_repins_3d = EXCLUDED.delta_repins_3d,
        delta_saves_7d = EXCLUDED.delta_saves_7d,
        delta_repins_7d = EXCLUDED.delta_repins_7d,
        created_at_pinterest = COALESCE(EXCLUDED.created_at_pinterest, keyword_pins_snapshots.created_at_pinterest),
        creation_method = COALESCE(EXCLUDED.creation_method, keyword_pins_snapshots.creation_method),
        metadata = COALESCE(keyword_pins_snapshots.metadata, '{}'::jsonb) || EXCLUDED.metadata;
  `;
  console.log('[+] Backfill completed successfully.');

  // 4. Verify count of displaced records in keyword_pins_snapshots
  console.log('[4/4] Verifying unified records in keyword_pins_snapshots...');
  const [countRes] = await sql`
    SELECT COUNT(*) as total_displaced_in_snapshots
    FROM keyword_pins_snapshots
    WHERE is_displaced = TRUE;
  `;
  console.log(`[+] Total displaced rows in keyword_pins_snapshots: ${countRes.total_displaced_in_snapshots}`);

  const sampleRows = await sql`
    SELECT pin_id, rank_position, last_known_rank, displaced_date, snapshot_date, is_displaced, save_count, repin_count, metadata->>'board_name' as board
    FROM keyword_pins_snapshots
    WHERE is_displaced = TRUE
    ORDER BY snapshot_date DESC
    LIMIT 3;
  `;
  console.log('[+] Sample unified displaced snapshots:', sampleRows);
}

run().catch(err => {
  console.error('[-] Migration 018 failed:', err);
  process.exit(1);
});
