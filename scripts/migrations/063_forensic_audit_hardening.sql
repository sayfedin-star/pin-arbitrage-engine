-- Migration 063: Forensic Audit Hardening (Regex Escaping, Advisory Lock, Duplicate Index & Fillfactor Tuning, Orphan Cleanup)
-- 1. Fix unescaped regex dots in pae_sync_clean_domain() (^www\. and ^https?://(?:www\.)?)
-- 2. Add pg_advisory_xact_lock to pae_sync_canonical_keyword() to eliminate TOCTOU race condition on uq_canonical_tracked_keywords
-- 3. Drop redundant/duplicate indexes (idx_competitor_history_date, idx_kip_keyword_pin, idx_tracked_keywords_keyword, idx_fpd_folder_id)
-- 4. Set fillfactor = 80 on domain_intelligence_rollup for HOT updates
-- 5. Clean up orphan rows in keyword_serp_positions with no matching pin_id in universal_master_pins

-- 1. Fix pae_sync_clean_domain() regex escaping
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

-- 2. Eliminate TOCTOU race condition in pae_sync_canonical_keyword()
CREATE OR REPLACE FUNCTION public.pae_sync_canonical_keyword()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw_input text;
  base_slug text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.keyword IS DISTINCT FROM OLD.keyword AND NEW.canonical_keyword IS NOT DISTINCT FROM OLD.canonical_keyword THEN
    raw_input := NEW.keyword;
  ELSE
    raw_input := COALESCE(NULLIF(TRIM(NEW.canonical_keyword), ''), NEW.keyword);
  END IF;

  base_slug := COALESCE(
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(raw_input, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(NEW.keyword, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    'kw'
  );

  PERFORM pg_advisory_xact_lock(hashtext('kw_canon:' || LEFT(base_slug, 255)));

  IF EXISTS (
    SELECT 1 FROM public.tracked_keywords
    WHERE canonical_keyword = LEFT(base_slug, 255)
      AND (NEW.id IS NULL OR id <> NEW.id)
  ) THEN
    NEW.canonical_keyword := LEFT(base_slug || '-' || COALESCE(NEW.id::text, (FLOOR(RANDOM() * 900000 + 100000))::text), 255);
  ELSE
    NEW.canonical_keyword := LEFT(base_slug, 255);
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Drop duplicate/redundant indexes
DROP INDEX IF EXISTS public.idx_competitor_history_date;
DROP INDEX IF EXISTS public.idx_kip_keyword_pin;
DROP INDEX IF EXISTS public.idx_tracked_keywords_keyword;
DROP INDEX IF EXISTS public.idx_fpd_folder_id;

-- 4. Enable HOT updates on domain_intelligence_rollup
ALTER TABLE public.domain_intelligence_rollup SET (fillfactor = 80);

-- 5. Remove orphan keyword_serp_positions rows whose pin_id no longer exists in universal_master_pins
DELETE FROM public.keyword_serp_positions ksp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins u WHERE u.pin_id = ksp.pin_id
);

-- 6. Record migration
INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
VALUES ('063', 'forensic_audit_hardening', 'phase5_forensic_audit_063', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
