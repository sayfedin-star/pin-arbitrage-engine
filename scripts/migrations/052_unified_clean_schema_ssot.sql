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

-- 1. Drop legacy Neon registry & both signatures of CRC32 sharding function and legacy shard/monotonic trigger functions
DROP TABLE IF EXISTS public.neon_projects_registry CASCADE;
DROP FUNCTION IF EXISTS public.pae_crc32_shard_id(text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.pae_crc32_shard_id(text) CASCADE;
DROP FUNCTION IF EXISTS public.trg_set_deterministic_pin_shard_id() CASCADE;
DROP FUNCTION IF EXISTS public.trg_enforce_monotonic_metrics() CASCADE;
DROP FUNCTION IF EXISTS public.trg_pa_pins_enforce_monotonic_metrics() CASCADE;

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

-- 3. Enrich central SSOT table (`universal_master_pins`) and operational tables with explicit SARGable `clean_domain`
ALTER TABLE IF EXISTS public.universal_master_pins
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_deep_hydrated BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.competitor_pins
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);

ALTER TABLE IF EXISTS public.keyword_serp_current
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);

ALTER TABLE IF EXISTS public.keyword_displaced_index
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);

-- Backfill clean_domain and timestamps on existing rows where null
UPDATE public.universal_master_pins
SET
  clean_domain = LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', '')),
  first_saved_at = COALESCE(first_saved_at, first_discovered_at, NOW()),
  last_resaved_at = COALESCE(last_resaved_at, last_scraped_at, updated_at, NOW()),
  is_deep_hydrated = COALESCE((metadata->>'is_deep_hydrated')::boolean, save_count > 0)
WHERE clean_domain IS NULL;

UPDATE public.competitor_pins
SET clean_domain = LOWER(REGEXP_REPLACE(TRIM(COALESCE(link_domain, '')), '^www\.', ''))
WHERE clean_domain IS NULL;

UPDATE public.keyword_serp_current
SET clean_domain = LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', ''))
WHERE clean_domain IS NULL;

UPDATE public.keyword_displaced_index
SET clean_domain = LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', ''))
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
  ON public.competitor_pins (competitor_id, clean_domain);

CREATE INDEX IF NOT EXISTS idx_ksc_clean_domain
  ON public.keyword_serp_current (clean_domain);

CREATE INDEX IF NOT EXISTS idx_kdi_clean_domain
  ON public.keyword_displaced_index (clean_domain);

CREATE INDEX IF NOT EXISTS idx_pdm_pin_snapshot_desc
  ON public.pins_daily_metrics (pin_id, snapshot_date DESC);

-- 6. Automatic lightweight trigger to guarantee `clean_domain` is populated on every INSERT / UPDATE
CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb;
  raw_dom text;
  dest_url text;
BEGIN
  row_data := to_jsonb(NEW);
  raw_dom := COALESCE(
    NULLIF(BTRIM(COALESCE(row_data->>'domain', '')), ''),
    NULLIF(BTRIM(COALESCE(row_data->>'link_domain', '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
  );
  IF raw_dom IS NULL OR raw_dom = '' THEN
    dest_url := BTRIM(COALESCE(row_data->>'destination_url', ''));
    IF dest_url <> '' THEN
      raw_dom := SUBSTRING(LOWER(dest_url) FROM '^https?://(?:www\.)?([^/?#:]+)');
    END IF;
  END IF;
  raw_dom := COALESCE(raw_dom, '');
  raw_dom := REGEXP_REPLACE(LOWER(BTRIM(raw_dom)), '^https?://', '');
  raw_dom := REGEXP_REPLACE(raw_dom, '/.*$', '');
  NEW.clean_domain := REGEXP_REPLACE(raw_dom, '^www\.', '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ump_sync_clean_domain ON public.universal_master_pins;
CREATE TRIGGER trg_ump_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain ON public.universal_master_pins
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

DROP TRIGGER IF EXISTS trg_cp_sync_clean_domain ON public.competitor_pins;
CREATE TRIGGER trg_cp_sync_clean_domain
  BEFORE INSERT OR UPDATE OF link_domain, destination_url, clean_domain ON public.competitor_pins
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

DROP TRIGGER IF EXISTS trg_ksc_sync_clean_domain ON public.keyword_serp_current;
CREATE TRIGGER trg_ksc_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain ON public.keyword_serp_current
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

DROP TRIGGER IF EXISTS trg_kdi_sync_clean_domain ON public.keyword_displaced_index;
CREATE TRIGGER trg_kdi_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, clean_domain ON public.keyword_displaced_index
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

COMMIT;

