-- ============================================================================
-- Migration 057: SARGable clean_domain on pa_pins & Domain Lookup B-Tree Indexes
-- File: scripts/migrations/057_pa_pins_clean_domain_and_indexes.sql
-- Purpose: Eliminates LOWER(TRIM(...)) full table scans in Domain Dossier queries
-- ============================================================================

BEGIN;

-- 1. Ensure pa_pins has explicit SARGable clean_domain column
ALTER TABLE public.pa_pins
  ADD COLUMN IF NOT EXISTS clean_domain VARCHAR(255);

-- 2. Extend pae_sync_clean_domain() to also support pa_pins.link fallback cleanly
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
    dest_url := COALESCE(
      NULLIF(BTRIM(COALESCE(row_data->>'destination_url', '')), ''),
      BTRIM(COALESCE(row_data->>'link', ''))
    );
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

-- 3. Attach trigger to pa_pins
DROP TRIGGER IF EXISTS trg_pa_pins_sync_clean_domain ON public.pa_pins;
CREATE TRIGGER trg_pa_pins_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, link, clean_domain ON public.pa_pins
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

-- 4. Backfill existing pa_pins rows
UPDATE public.pa_pins
SET clean_domain = COALESCE(
  NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(domain, '')), '^https?://', '', 'i'), '/.*$', ''), '^www\.', '', 'i')), ''),
  NULLIF(SUBSTRING(LOWER(BTRIM(COALESCE(link, ''))) FROM '^https?://(?:www\.)?([^/?#:]+)'), ''),
  ''
)
WHERE clean_domain IS NULL
   OR (clean_domain = '' AND (COALESCE(domain, '') <> '' OR COALESCE(link, '') <> ''));

-- 5. SARGable B-Tree Indexes for pa_pins & competitor_pins clean_domain lookups
CREATE INDEX IF NOT EXISTS idx_pa_pins_clean_domain
  ON public.pa_pins (clean_domain, saves DESC)
  WHERE clean_domain IS NOT NULL AND clean_domain <> '';

CREATE INDEX IF NOT EXISTS idx_cp_clean_domain
  ON public.competitor_pins (clean_domain)
  WHERE clean_domain IS NOT NULL AND clean_domain <> '';

COMMIT;
