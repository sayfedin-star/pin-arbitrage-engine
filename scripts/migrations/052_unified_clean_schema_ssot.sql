-- =============================================================================
-- Migration 001 / 052: Unified Clean Single-Database Schema (SSOT)
-- =============================================================================
-- Purpose:
--   1. Eradicate all legacy sharding artifacts:
--      - Drop `neon_projects_registry` table
--      - Drop `pae_crc32_shard_id` function
--      - Drop dead `shard_id` columns and composite shard indexes on
--        `pa_pins`, `competitor_pins`, `keyword_serp_current`, `keyword_displaced_index`
--   2. Establish Unified Single Source of Truth (`universal_master_pins` & `pins` view)
--      with indexed `clean_domain`, `first_saved_at`, `last_resaved_at`, and `is_deep_hydrated`.
--   3. Enforce SARGable B-Tree indexes for sub-2ms read queries across all pillars.
-- =============================================================================

BEGIN;

-- 1. Drop legacy Neon registry & CRC32 sharding function
DROP TABLE IF EXISTS public.neon_projects_registry CASCADE;
DROP FUNCTION IF EXISTS public.pae_crc32_shard_id(text) CASCADE;

-- 2. Drop legacy shard_id indexes and columns across operational tables
DROP INDEX IF EXISTS public.idx_pa_pins_shard_id;
DROP INDEX IF EXISTS public.idx_competitor_pins_shard_id;
DROP INDEX IF EXISTS public.idx_ksc_shard_id;
DROP INDEX IF EXISTS public.idx_kdi_shard_id;
DROP INDEX IF EXISTS public.idx_pa_pins_shard_saves;
DROP INDEX IF EXISTS public.idx_competitor_pins_shard_saves;

ALTER TABLE IF EXISTS public.pa_pins DROP COLUMN IF EXISTS shard_id CASCADE;
ALTER TABLE IF EXISTS public.competitor_pins DROP COLUMN IF EXISTS shard_id CASCADE;
ALTER TABLE IF EXISTS public.keyword_serp_current DROP COLUMN IF EXISTS shard_id CASCADE;
ALTER TABLE IF EXISTS public.keyword_displaced_index DROP COLUMN IF EXISTS shard_id CASCADE;

-- 3. Enrich central SSOT table (`universal_master_pins`) with explicit lifecycle & SARGable domain columns
ALTER TABLE IF EXISTS public.universal_master_pins
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_deep_hydrated BOOLEAN DEFAULT FALSE;

-- Backfill clean_domain and timestamps on existing rows where null
UPDATE public.universal_master_pins
SET
  clean_domain = LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', '')),
  first_saved_at = COALESCE(first_saved_at, first_discovered_at, NOW()),
  last_resaved_at = COALESCE(last_resaved_at, last_scraped_at, updated_at, NOW()),
  is_deep_hydrated = COALESCE((metadata->>'is_deep_hydrated')::boolean, save_count > 0)
WHERE clean_domain IS NULL;

-- 4. Create unified `pins` view aliasing `universal_master_pins` so queries can use `pins` or `universal_master_pins` interchangeably
CREATE OR REPLACE VIEW public.pins AS
SELECT
  pin_id,
  title,
  description,
  alt_text,
  image_url,
  destination_url,
  COALESCE(NULLIF(clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', ''))) AS clean_domain,
  domain,
  creator_username,
  board_id,
  board_name,
  board_slug,
  created_at_pinterest,
  dominant_color,
  visual_annotations,
  save_count,
  repin_count,
  comment_count,
  share_count,
  reaction_count,
  daily_save_velocity,
  delta_saves_24h,
  delta_repins_24h,
  gains_5d,
  gains_7d,
  gains_10d,
  gains_15d,
  is_product,
  is_video,
  creation_method,
  image_signature,
  seo_noindex_reason,
  is_repin,
  canonical_pin_id,
  COALESCE(first_saved_at, first_discovered_at) AS first_saved_at,
  COALESCE(last_resaved_at, last_scraped_at, updated_at) AS last_resaved_at,
  COALESCE(is_deep_hydrated, (metadata->>'is_deep_hydrated')::boolean, FALSE) AS is_deep_hydrated,
  first_discovered_pillar,
  first_discovered_at,
  last_scraped_at,
  updated_at,
  metadata
FROM public.universal_master_pins;

-- 5. Create SARGable B-Tree indexes for sub-2ms lookups without regex full-table scans
CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves
  ON public.universal_master_pins (clean_domain, save_count DESC);

CREATE INDEX IF NOT EXISTS idx_ump_creator_username_lower
  ON public.universal_master_pins (LOWER(TRIM(REPLACE(COALESCE(creator_username, ''), '@', ''))));

CREATE INDEX IF NOT EXISTS idx_cp_competitor_clean_domain
  ON public.competitor_pins (competitor_id, LOWER(REGEXP_REPLACE(TRIM(COALESCE(link_domain, '')), '^www\.', '')));

CREATE INDEX IF NOT EXISTS idx_pdm_pin_snapshot_desc
  ON public.pins_daily_metrics (pin_id, snapshot_date DESC);

COMMIT;
