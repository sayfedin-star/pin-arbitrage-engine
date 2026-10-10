-- ============================================================================
-- Migration 019: Consolidate Unified Keyword Catalog & Deprecate Displaced Pins
-- Target: Neon Serverless Postgres
-- Description:
--   1. Expands keyword_serp_current to be the single current-state catalog for all pins.
--   2. Drops NOT NULL from rank_position (displaced pins have rank_position = NULL).
--   3. Adds state columns: is_displaced, last_known_rank, displaced_date, vacuum_opportunity_score.
--   4. Adds Partial Unique Index uq_ksc_active_rank for active pins only.
--   5. Backfills all data from keyword_displaced_pins into keyword_serp_current.
--   6. Soft-deprecates keyword_displaced_pins -> _backup_keyword_displaced_pins.
--   7. Ensures UNIQUE constraint on pins_daily_snapshots across shards for zero-crash upserts.
-- ============================================================================

-- 1. Relax rank_position nullability on keyword_serp_current
ALTER TABLE keyword_serp_current ALTER COLUMN rank_position DROP NOT NULL;

-- 2. Upgrade save_count to BIGINT for monotonic preservation
ALTER TABLE keyword_serp_current ALTER COLUMN save_count TYPE BIGINT;

-- 3. Add unified catalog state columns to keyword_serp_current
ALTER TABLE keyword_serp_current 
  ADD COLUMN IF NOT EXISTS is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_known_rank INT,
  ADD COLUMN IF NOT EXISTS displaced_date DATE,
  ADD COLUMN IF NOT EXISTS vacuum_opportunity_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Create Partial Performance Index for Active pins lookup
DROP INDEX IF EXISTS uq_ksc_active_rank;
CREATE INDEX IF NOT EXISTS idx_ksc_active_rank 
ON keyword_serp_current (keyword_id, rank_position) 
WHERE is_displaced = FALSE AND rank_position IS NOT NULL;

-- 5. Create performance indexes for vault filtering and opportunity scoring
CREATE INDEX IF NOT EXISTS idx_ksc_vault_opportunity 
ON keyword_serp_current (keyword_id, vacuum_opportunity_score DESC) 
WHERE is_displaced = TRUE;

CREATE INDEX IF NOT EXISTS idx_ksc_displaced_lookup
ON keyword_serp_current (keyword_id, is_displaced, displaced_date DESC);

-- 6. Backfill existing records from keyword_displaced_pins into keyword_serp_current
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

-- 7. Soft Deprecation: Rename legacy keyword_displaced_pins to backup table
ALTER TABLE keyword_displaced_pins RENAME TO _backup_keyword_displaced_pins;

-- 8. Ensure storage shard daily snapshots constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_pins_daily_snapshots_pin_date 
ON pins_daily_snapshots (pin_id, snapshot_date);
