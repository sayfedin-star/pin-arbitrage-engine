-- =============================================================================
-- Migration 001: Clean SSOT Schema (PAE v6.0 Single-Database Architecture)
-- =============================================================================
-- Defines the clean, canonical 8-table schema and 24h summary materialized view:
--   1. universal_master_pins (with BIGINT NULL save_count)
--   2. pins_daily_metrics (with is_baseline_day)
--   3. keyword_serp_positions (unifying current SERP, displaced index, and historical ranks via rank_position SMALLINT NULL)
--   4. folders (canonical campaign workspace containers)
--   5. tracked_keywords (fleet keyword registry)
--   6. competitor_profiles (creator intelligence ledger)
--   7. competitor_boards (creator board hierarchy)
--   8. competitor_pins (creator catalog inventory)
--   Plus mv_pulse_24h_summary (materialized view for high-speed executive telemetry)
-- =============================================================================

-- 1. Folders (Campaign Workspace & Category Organization)
CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(32) DEFAULT '#E11D48',
  icon VARCHAR(64) DEFAULT 'folder',
  project_id VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_created ON folders (created_at DESC);

-- Backward compatibility alias
CREATE OR REPLACE VIEW keyword_folders AS
SELECT * FROM folders;

-- 2. Tracked Keywords (Fleet Search Intelligence)
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL UNIQUE,
  canonical_keyword VARCHAR(255),
  category VARCHAR(128),
  target_pin_count INT DEFAULT 150,
  refresh_interval_hours INT DEFAULT 24,
  last_crawled_at TIMESTAMPTZ,
  top_pin_id VARCHAR(64),
  top_pin_title TEXT,
  top_pin_image TEXT,
  avg_daily_velocity NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  popular_pins JSONB DEFAULT '[]'::jsonb,
  crawl_lease_token UUID,
  crawl_lease_until TIMESTAMPTZ,
  crawl_pages_limit INT DEFAULT 5,
  inspection_mode VARCHAR(32) DEFAULT 'standard',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tk_active ON tracked_keywords (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tk_velocity ON tracked_keywords (avg_daily_velocity DESC);

-- 3. Universal Master Pins (SSOT Creative & Telemetry Foundation)
CREATE TABLE IF NOT EXISTS universal_master_pins (
  pin_id VARCHAR(64) PRIMARY KEY,
  creator_username VARCHAR(64),
  board_id VARCHAR(64),
  board_name VARCHAR(255),
  board_slug VARCHAR(255),
  title TEXT,
  description TEXT,
  alt_text TEXT,
  domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  image_url TEXT,
  dominant_color VARCHAR(16) DEFAULT '#888888',
  visual_annotations JSONB DEFAULT '[]'::jsonb,
  created_at_pinterest TIMESTAMPTZ,
  first_discovered_pillar VARCHAR(32) DEFAULT 'serp',
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  url_global_saves BIGINT DEFAULT 0,
  save_count BIGINT NULL,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  reaction_count INT DEFAULT 0,
  daily_save_velocity NUMERIC(12,2) DEFAULT 0,
  delta_saves_24h BIGINT DEFAULT 0,
  delta_repins_24h INT DEFAULT 0,
  gains_5d BIGINT DEFAULT 0,
  gains_7d BIGINT DEFAULT 0,
  gains_10d BIGINT DEFAULT 0,
  gains_15d BIGINT DEFAULT 0,
  is_product BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  creation_method TEXT DEFAULT 'pinterest_platform',
  image_signature TEXT,
  seo_noindex_reason TEXT,
  is_repin BOOLEAN DEFAULT FALSE,
  canonical_pin_id VARCHAR(64),
  is_deep_hydrated BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves ON universal_master_pins (clean_domain, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_ump_creator_username ON universal_master_pins (creator_username);
CREATE INDEX IF NOT EXISTS idx_ump_velocity_saves ON universal_master_pins (daily_save_velocity DESC, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_ump_last_scraped_at ON universal_master_pins (last_scraped_at DESC) WHERE last_scraped_at IS NOT NULL;

-- 4. Pins Daily Metrics (Time-Series Metric Trajectory)
CREATE TABLE IF NOT EXISTS pins_daily_metrics (
  pin_id VARCHAR(64) NOT NULL,
  snapshot_date DATE NOT NULL,
  save_count BIGINT NULL,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  reaction_count INT DEFAULT 0,
  daily_save_velocity NUMERIC(12,2) DEFAULT 0,
  is_baseline_day BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pin_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pdm_pin_snapshot_desc ON pins_daily_metrics (pin_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pdm_date_velocity ON pins_daily_metrics (snapshot_date, daily_save_velocity DESC);

-- 5. Keyword SERP Positions (Unified Active SERP, Displaced Vault & Rank Positions)
-- NULL rank_position indicates displaced or unranked state; values 1..50 indicate active SERP
CREATE TABLE IF NOT EXISTS keyword_serp_positions (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rank_position SMALLINT NULL,
  last_known_rank SMALLINT NULL,
  is_displaced BOOLEAN DEFAULT FALSE,
  displaced_date DATE,
  vacuum_opportunity_score NUMERIC(8,2) DEFAULT 0,
  catalog_rank INT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ksp_keyword_pin_date UNIQUE (keyword_id, pin_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ksp_keyword_date_rank ON keyword_serp_positions (keyword_id, snapshot_date DESC, rank_position ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ksp_pin_snapshot ON keyword_serp_positions (pin_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ksp_displaced ON keyword_serp_positions (keyword_id, is_displaced) WHERE is_displaced = TRUE;

-- 6. Competitor Profiles (Creator Ledger & Profile Telemetry)
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  monthly_reach BIGINT DEFAULT 0,
  reach_delta_7d BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  views_delta_7d BIGINT DEFAULT 0,
  total_pins INT DEFAULT 0,
  total_boards INT DEFAULT 0,
  follower_count BIGINT DEFAULT 0,
  following_count INT DEFAULT 0,
  account_type VARCHAR(32) DEFAULT 'creator',
  activity_status VARCHAR(32) DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  tracking_mode VARCHAR(32) DEFAULT 'full',
  custom_label VARCHAR(128),
  source_folder_id INT,
  delta_reach_24h BIGINT DEFAULT 0,
  delta_views_24h BIGINT DEFAULT 0,
  delta_pins_24h INT DEFAULT 0,
  delta_boards_24h INT DEFAULT 0,
  pins_delta_7d INT DEFAULT 0,
  boards_delta_7d INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_username ON competitor_profiles (username);
CREATE INDEX IF NOT EXISTS idx_cp_is_active ON competitor_profiles (is_active) WHERE is_active = TRUE;

-- 7. Competitor Boards (Creator Board Hierarchy)
CREATE TABLE IF NOT EXISTS competitor_boards (
  id SERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  pin_count INT DEFAULT 0,
  follower_count BIGINT DEFAULT 0,
  last_pinned_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_competitor_id ON competitor_boards (competitor_id);

-- 8. Competitor Pins (Creator Catalog Inventory)
CREATE TABLE IF NOT EXISTS competitor_pins (
  id SERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  description TEXT,
  link_domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  board_name VARCHAR(255),
  board_slug VARCHAR(255),
  image_url TEXT,
  save_count BIGINT DEFAULT 0,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at_pinterest TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_product BOOLEAN DEFAULT FALSE,
  alt_text TEXT,
  enrichment_status VARCHAR(32) DEFAULT 'pending',
  enrich_attempts INT DEFAULT 0,
  claim_token UUID,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_pin_id ON competitor_pins (pin_id);
CREATE INDEX IF NOT EXISTS idx_cp_competitor_saves ON competitor_pins (competitor_id, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_cp_clean_domain ON competitor_pins (clean_domain);

-- 9. Materialized View: 24-Hour Pulse Telemetry Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
  COUNT(DISTINCT ump.clean_domain)::bigint AS active_domains_24h,
  COUNT(DISTINCT ump.creator_username)::bigint AS active_creators_24h,
  COALESCE(ROUND(AVG(ump.daily_save_velocity), 2), 0)::numeric(12,2) AS avg_velocity_24h,
  COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
  COALESCE(SUM(ump.delta_saves_24h), 0)::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM universal_master_pins ump
WHERE ump.last_scraped_at >= NOW() - INTERVAL '24 hours'
   OR ump.updated_at >= NOW() - INTERVAL '24 hours';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON mv_pulse_24h_summary (summary_id);
