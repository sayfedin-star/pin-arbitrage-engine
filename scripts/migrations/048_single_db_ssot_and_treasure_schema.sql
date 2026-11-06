-- ============================================================================
-- Migration 048: Single Unified Database SSOT Pin Schema & Treasure Capture
-- ============================================================================

-- 1. Drop obsolete empty tables with zero runtime dependencies
DROP TABLE IF EXISTS keyword_folder_synopses CASCADE;
DROP TABLE IF EXISTS pin_related_edges CASCADE;

-- 2. Purge fake 99-shard entries from neon_projects_registry in Unified DB mode
DELETE FROM neon_projects_registry
WHERE COALESCE(is_hub, FALSE) = FALSE
   OR project_name LIKE 'pin-arbitrage-shard-%';

-- 3. Upgrade universal_master_pins with explicit SSOT live metric & treasure columns
ALTER TABLE universal_master_pins
  ADD COLUMN IF NOT EXISTS save_count BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repin_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reaction_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_save_velocity NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_saves_24h BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_repins_24h INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gains_5d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gains_7d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gains_10d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gains_15d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_video BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS creation_method TEXT,
  ADD COLUMN IF NOT EXISTS image_signature TEXT,
  ADD COLUMN IF NOT EXISTS seo_noindex_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_repin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canonical_pin_id TEXT,
  ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

-- 4. Standardize save_count / saves integer columns to BIGINT across competitor tables
ALTER TABLE competitor_pins
  ALTER COLUMN save_count TYPE BIGINT;

ALTER TABLE competitor_related_nodes
  ALTER COLUMN saves TYPE BIGINT;

-- 5. Create SSOT indexes for fast velocity, freshness, and image_signature lookups
CREATE INDEX IF NOT EXISTS idx_ump_velocity_saves
  ON universal_master_pins (daily_save_velocity DESC, save_count DESC);

CREATE INDEX IF NOT EXISTS idx_ump_last_scraped_at
  ON universal_master_pins (last_scraped_at DESC)
  WHERE last_scraped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ump_image_signature
  ON universal_master_pins (image_signature)
  WHERE image_signature IS NOT NULL AND image_signature <> '';

-- 6. Refresh keyword_master_pins view to include all new SSOT columns
CREATE OR REPLACE VIEW keyword_master_pins AS
  SELECT * FROM universal_master_pins;

