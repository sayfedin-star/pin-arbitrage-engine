-- Migration 060: Clean-Slate 4-Table SSOT Schema
-- Establishes the 4 canonical SSOT tables:
-- 1. universal_master_pins
-- 2. pins_daily_metrics
-- 3. keyword_serp_positions
-- 4. competitor_board_pins
-- Drops legacy tables: pa_pins, competitor_pins, keyword_displaced_index,
--                     keyword_serp_current, pin_serp_positions, crawler_shard_heartbeats

-- Step 1: Drop legacy views
DROP VIEW IF EXISTS public.pins_daily_snapshots CASCADE;
DROP VIEW IF EXISTS public.keyword_pins_snapshots CASCADE;
DROP VIEW IF EXISTS public.keyword_master_pins CASCADE;
DROP VIEW IF EXISTS public.pins CASCADE;

-- Step 2: Drop legacy duplicate tables
DROP TABLE IF EXISTS public.pa_pins CASCADE;
DROP TABLE IF EXISTS public.competitor_pins CASCADE;
DROP TABLE IF EXISTS public.keyword_displaced_index CASCADE;
DROP TABLE IF EXISTS public.keyword_serp_current CASCADE;
DROP TABLE IF EXISTS public.pin_serp_positions CASCADE;
DROP TABLE IF EXISTS public.crawler_shard_heartbeats CASCADE;

-- Step 3: Recreate 4 SSOT Tables
DROP TABLE IF EXISTS public.competitor_board_pins CASCADE;
DROP TABLE IF EXISTS public.keyword_serp_positions CASCADE;
DROP TABLE IF EXISTS public.pins_daily_metrics CASCADE;
DROP TABLE IF EXISTS public.universal_master_pins CASCADE;

-- 1. universal_master_pins: Single canonical pin table
CREATE TABLE public.universal_master_pins (
  pin_id VARCHAR(255) PRIMARY KEY,
  creator_username VARCHAR(128),
  account_username TEXT GENERATED ALWAYS AS (creator_username) STORED,
  board_id VARCHAR(64),
  board_name TEXT,
  board_slug TEXT,
  title TEXT,
  domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  image_url TEXT,
  description TEXT,
  alt_text TEXT,
  dominant_color VARCHAR(32) DEFAULT '#888888',
  visual_annotations JSONB DEFAULT '[]'::jsonb,
  created_at_pinterest TIMESTAMPTZ,
  first_discovered_pillar VARCHAR(32) DEFAULT 'keyword',
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  url_global_saves BIGINT DEFAULT NULL,
  save_count BIGINT DEFAULT NULL,
  repin_count BIGINT DEFAULT NULL,
  comment_count INTEGER DEFAULT NULL,
  share_count INTEGER DEFAULT NULL,
  reaction_count INTEGER DEFAULT NULL,
  is_hydrated BOOLEAN NOT NULL DEFAULT FALSE,
  daily_save_velocity DOUBLE PRECISION DEFAULT NULL,
  daily_repin_velocity DOUBLE PRECISION DEFAULT NULL,
  delta_saves_24h BIGINT DEFAULT NULL,
  delta_repins_24h BIGINT DEFAULT NULL,
  gains_1d BIGINT DEFAULT NULL,
  gains_3d BIGINT DEFAULT NULL,
  gains_5d BIGINT DEFAULT NULL,
  gains_7d BIGINT DEFAULT NULL,
  gains_10d BIGINT DEFAULT NULL,
  gains_14d BIGINT DEFAULT NULL,
  gains_15d BIGINT DEFAULT NULL,
  gains_30d BIGINT DEFAULT NULL,
  is_product BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  creation_method TEXT,
  image_signature TEXT,
  seo_noindex_reason TEXT,
  is_repin BOOLEAN DEFAULT FALSE,
  canonical_pin_id TEXT
) WITH (fillfactor = 80);

CREATE INDEX idx_ump_clean_domain_saves ON public.universal_master_pins(clean_domain, save_count DESC NULLS LAST);
CREATE INDEX idx_ump_creator ON public.universal_master_pins(creator_username);
CREATE INDEX idx_ump_creator_clean ON public.universal_master_pins((LOWER(TRIM(REPLACE(COALESCE(creator_username, ''), '@', '')))));
CREATE INDEX idx_ump_velocity ON public.universal_master_pins(daily_save_velocity DESC NULLS LAST, save_count DESC NULLS LAST);
CREATE INDEX idx_ump_repin_velocity ON public.universal_master_pins(daily_repin_velocity DESC NULLS LAST, repin_count DESC NULLS LAST);
CREATE INDEX idx_ump_is_hydrated ON public.universal_master_pins(is_hydrated);

CREATE TRIGGER trg_ump_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain
  ON public.universal_master_pins
  FOR EACH ROW
  EXECUTE FUNCTION pae_sync_clean_domain();

-- 2. pins_daily_metrics: Daily metric snapshots
CREATE TABLE public.pins_daily_metrics (
  pin_id VARCHAR(255) NOT NULL,
  recorded_date DATE NOT NULL,
  snapshot_date DATE GENERATED ALWAYS AS (recorded_date) STORED,
  save_count BIGINT DEFAULT NULL,
  repin_count BIGINT DEFAULT NULL,
  comment_count INTEGER DEFAULT NULL,
  share_count INTEGER DEFAULT NULL,
  reaction_count INTEGER DEFAULT NULL,
  daily_save_velocity DOUBLE PRECISION DEFAULT NULL,
  daily_repin_velocity DOUBLE PRECISION DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pin_id, recorded_date)
) WITH (fillfactor = 80);

CREATE INDEX idx_pdm_pin_recorded_desc ON public.pins_daily_metrics(pin_id, recorded_date DESC);
CREATE INDEX idx_pdm_recorded_date ON public.pins_daily_metrics(recorded_date);

-- 3. keyword_serp_positions: Unified SERP + Displaced vault positions
CREATE TABLE public.keyword_serp_positions (
  keyword_id INTEGER NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(255) NOT NULL,
  rank_position INTEGER DEFAULT NULL,
  is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
  last_known_rank INTEGER DEFAULT NULL,
  displaced_date TIMESTAMPTZ DEFAULT NULL,
  vacuum_opportunity_score DOUBLE PRECISION DEFAULT NULL,
  prev_rank_position INTEGER DEFAULT NULL,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (keyword_id, pin_id)
) WITH (fillfactor = 80);

CREATE INDEX idx_ksp_keyword_active ON public.keyword_serp_positions(keyword_id, rank_position ASC) WHERE is_displaced = FALSE;
CREATE INDEX idx_ksp_keyword_displaced ON public.keyword_serp_positions(keyword_id, vacuum_opportunity_score DESC NULLS LAST) WHERE is_displaced = TRUE;
CREATE INDEX idx_ksp_pin_id ON public.keyword_serp_positions(pin_id);

-- 4. competitor_board_pins: Thin relational join table linking accounts/boards to pins
CREATE TABLE public.competitor_board_pins (
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL DEFAULT '',
  pin_id VARCHAR(255) NOT NULL,
  position INTEGER DEFAULT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competitor_id, board_id, pin_id)
) WITH (fillfactor = 80);

CREATE INDEX idx_cbp_competitor_pin ON public.competitor_board_pins(competitor_id, pin_id);
CREATE INDEX idx_cbp_pin_id ON public.competitor_board_pins(pin_id);
CREATE INDEX idx_cbp_board ON public.competitor_board_pins(competitor_id, board_id);

-- 5. keyword_tombstones: Audit log of deleted keywords pending cleanup
CREATE TABLE IF NOT EXISTS public.keyword_tombstones (
  keyword_id INTEGER PRIMARY KEY,
  keyword TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  purged_at TIMESTAMPTZ
);

-- Step 4: Record migration in schema_migrations
INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
VALUES ('060', 'clean_slate_4_table_ssot', 'phase2_ssot_clean_slate', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
