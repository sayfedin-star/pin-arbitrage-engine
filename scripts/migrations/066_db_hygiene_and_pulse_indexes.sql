-- Migration 066: Database Hygiene, Clean-Domain Trigger Seal & Pulse Performance Indexes
--
-- 1. Re-applies canonical public.pae_sync_clean_domain() with escaped dot (^www\. and (?:www\.)?) and binds trg_ump_sync_clean_domain.
-- 2. Adds covering index idx_competitor_history_recorded_date_comp on competitor_history_snapshots for /api/pulse-24h recorded_date lookups.
-- 3. Adds text_pattern_ops partial index idx_ump_dest_url_pattern on universal_master_pins(destination_url) for url_global_saves LIKE prefix updates.
-- 4. Heals live unhydrated-zero rows (save_count = NULL, is_hydrated = FALSE where is_hydrated = TRUE AND all engagement counters = 0).
--
-- Note: Uses standard CREATE INDEX IF NOT EXISTS (without CONCURRENTLY) because migrate.mjs runs inside a transaction block.

-- 1. Re-apply canonical pae_sync_clean_domain() with escaped regex dots
CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw_dom text;
  dest_url text;
BEGIN
  raw_dom := COALESCE(
    NULLIF(BTRIM(COALESCE(NEW.domain, '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
  );
  IF raw_dom IS NULL OR raw_dom = '' THEN
    dest_url := BTRIM(COALESCE(NEW.destination_url, ''));
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

-- 2. Covering index for /api/pulse-24h competitor_history_snapshots lookups by recorded_date
CREATE INDEX IF NOT EXISTS idx_competitor_history_recorded_date_comp
  ON public.competitor_history_snapshots (recorded_date DESC, competitor_id)
  INCLUDE (monthly_reach, profile_views);

-- 3. Pattern-ops partial index for url_global_saves destination_url LIKE 'https://.../?%' updates
CREATE INDEX IF NOT EXISTS idx_ump_dest_url_pattern
  ON public.universal_master_pins (destination_url text_pattern_ops)
  WHERE destination_url IS NOT NULL AND destination_url <> '';

-- 4. Heal live unhydrated-zero rows without touching pins that have real engagement (> 0)
UPDATE public.universal_master_pins
SET save_count = NULL,
    is_hydrated = FALSE,
    updated_at = NOW()
WHERE is_hydrated = TRUE
  AND COALESCE(save_count, 0) = 0
  AND COALESCE(repin_count, 0) = 0
  AND COALESCE(comment_count, 0) = 0;
