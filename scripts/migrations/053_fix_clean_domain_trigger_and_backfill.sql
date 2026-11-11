-- ============================================================================
-- Migration 053: Fix pae_sync_clean_domain() Trigger & Backfill Empty clean_domain
-- ============================================================================
-- Preserves NEW.clean_domain and falls back to destination_url when domain / link_domain
-- is empty, ensuring databases that already applied Migration 052 receive the updated
-- trigger and have any wiped clean_domain values restored.
-- ============================================================================

BEGIN;

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

-- Backfill any rows where clean_domain is missing or empty
UPDATE public.universal_master_pins
SET clean_domain = COALESCE(
  NULLIF(LOWER(REGEXP_REPLACE(BTRIM(COALESCE(domain, '')), '^www\.', '')), ''),
  NULLIF(SUBSTRING(LOWER(BTRIM(COALESCE(destination_url, ''))) FROM '^https?://(?:www\.)?([^/?#:]+)'), ''),
  ''
)
WHERE clean_domain IS NULL
   OR (clean_domain = '' AND (COALESCE(domain, '') <> '' OR COALESCE(destination_url, '') <> ''));

UPDATE public.competitor_pins
SET clean_domain = COALESCE(
  NULLIF(LOWER(REGEXP_REPLACE(BTRIM(COALESCE(link_domain, '')), '^www\.', '')), ''),
  NULLIF(SUBSTRING(LOWER(BTRIM(COALESCE(destination_url, ''))) FROM '^https?://(?:www\.)?([^/?#:]+)'), ''),
  ''
)
WHERE clean_domain IS NULL
   OR (clean_domain = '' AND (COALESCE(link_domain, '') <> '' OR COALESCE(destination_url, '') <> ''));

UPDATE public.keyword_serp_current
SET clean_domain = COALESCE(
  NULLIF(LOWER(REGEXP_REPLACE(BTRIM(COALESCE(domain, '')), '^www\.', '')), ''),
  NULLIF(SUBSTRING(LOWER(BTRIM(COALESCE(destination_url, ''))) FROM '^https?://(?:www\.)?([^/?#:]+)'), ''),
  ''
)
WHERE clean_domain IS NULL
   OR (clean_domain = '' AND (COALESCE(domain, '') <> '' OR COALESCE(destination_url, '') <> ''));

UPDATE public.keyword_displaced_index
SET clean_domain = LOWER(REGEXP_REPLACE(BTRIM(COALESCE(domain, '')), '^www\.', ''))
WHERE clean_domain IS NULL
   OR (clean_domain = '' AND COALESCE(domain, '') <> '');

COMMIT;
