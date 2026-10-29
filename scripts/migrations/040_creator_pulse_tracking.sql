-- Migration 040: Lightweight Creator Pulse Tracking & Folder Tagging
-- [INVARIANT: LIGHTWEIGHT-CREATOR-PULSE]
-- Add tracking mode, custom labels, folder origin, and 24h/7d delta counters

ALTER TABLE competitor_profiles
  ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(32) DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS custom_label VARCHAR(128) DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_folder_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delta_reach_24h BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_views_24h BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_pins_24h INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_boards_24h INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach_delta_7d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_delta_7d BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pins_delta_7d INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boards_delta_7d INT DEFAULT 0;

ALTER TABLE folder_competitor_items
  ADD COLUMN IF NOT EXISTS custom_label VARCHAR(128) DEFAULT '',
  ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_tracking_mode
  ON competitor_profiles (tracking_mode, is_active);
