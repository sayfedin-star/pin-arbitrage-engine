-- ============================================================================
-- Migration 058: Phase 4 Unified PostgreSQL SSOT Compaction & Legacy View/Table Cleanup
-- File: scripts/migrations/058_phase4_ssot_compaction_and_cleanup.sql
-- Purpose:
--   1. Drops unused legacy views (creator_profiles, creator_boards) and any residual
--      legacy tables (neon_projects_registry, pa_pin_metrics, keyword_displaced_pins).
--   2. Heals seed_guided_search_capsules schema drift between Migration 007 and 011
--      (ensuring query_term, normalized_query, image_url, search_url, node_id, discovered_at).
--   3. Backfills any missing creative metadata from competitor_pins into
--      universal_master_pins SSOT prior to compacting redundant text payloads.
--   4. Compacts redundant heavy text columns (description, alt_text) on competitor_pins
--      where universal_master_pins is the authoritative creative SSOT.
--   5. Strips bloated duplicate creative keys from keyword_serp_current.metadata while
--      strictly preserving creation_method and method.
--   6. Ensures SARGable indexes on keyword_displaced_index and refreshes mv_pulse_24h_summary.
-- ============================================================================

BEGIN;

-- 1. Drop unused legacy views and residual dead tables if present
DROP VIEW IF EXISTS public.creator_profiles CASCADE;
DROP VIEW IF EXISTS public.creator_boards CASCADE;
DROP TABLE IF EXISTS public.neon_projects_registry CASCADE;
DROP TABLE IF EXISTS public.pa_pin_metrics CASCADE;
DROP TABLE IF EXISTS public.keyword_displaced_pins CASCADE;

-- 2. Heal seed_guided_search_capsules schema drift (Migration 007 vs Migration 011)
ALTER TABLE public.seed_guided_search_capsules
  ADD COLUMN IF NOT EXISTS query_term TEXT,
  ADD COLUMN IF NOT EXISTS normalized_query TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS search_url TEXT,
  ADD COLUMN IF NOT EXISTS node_id TEXT,
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seed_guided_search_capsules'
      AND column_name = 'capsule_title'
  ) THEN
    EXECUTE 'ALTER TABLE public.seed_guided_search_capsules ALTER COLUMN capsule_title DROP NOT NULL';
    EXECUTE '
      UPDATE public.seed_guided_search_capsules
      SET
        query_term = COALESCE(query_term, capsule_title),
        normalized_query = COALESCE(normalized_query, LOWER(BTRIM(COALESCE(query_term, capsule_title, ''''))))
      WHERE query_term IS NULL OR normalized_query IS NULL
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_capsules_seed_discovered
  ON public.seed_guided_search_capsules (seed_pin_id, discovered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm
  ON public.seed_guided_search_capsules (seed_pin_id, normalized_query);

-- 3. Backfill any missing description / alt_text from competitor_pins into universal_master_pins SSOT
UPDATE public.universal_master_pins ump
SET
  description = COALESCE(NULLIF(BTRIM(ump.description), ''), NULLIF(BTRIM(cp.description), '')),
  alt_text    = COALESCE(NULLIF(BTRIM(ump.alt_text), ''), NULLIF(BTRIM(cp.alt_text), ''))
FROM public.competitor_pins cp
WHERE ump.pin_id = cp.pin_id
  AND (
    ((ump.description IS NULL OR BTRIM(ump.description) = '') AND cp.description IS NOT NULL AND BTRIM(cp.description) <> '')
    OR
    ((ump.alt_text IS NULL OR BTRIM(ump.alt_text) = '') AND cp.alt_text IS NOT NULL AND BTRIM(cp.alt_text) <> '')
  );

-- 4. Compact redundant heavy text payloads on competitor_pins now served from universal_master_pins SSOT
UPDATE public.competitor_pins cp
SET
  description = NULL,
  alt_text    = NULL
FROM public.universal_master_pins ump
WHERE cp.pin_id = ump.pin_id
  AND (cp.description IS NOT NULL OR cp.alt_text IS NOT NULL);

-- 5. Compact redundant creative keys from keyword_serp_current.metadata while preserving creation_method & method
UPDATE public.keyword_serp_current
SET metadata = COALESCE(metadata, '{}'::jsonb)
  - 'title'
  - 'description'
  - 'alt_text'
  - 'image_url'
  - 'destination_url'
  - 'board_name'
  - 'dominant_color'
  - 'visual_annotations'
WHERE metadata IS NOT NULL
  AND metadata <> '{}'::jsonb
  AND (
    metadata ? 'title'
    OR metadata ? 'description'
    OR metadata ? 'alt_text'
    OR metadata ? 'image_url'
    OR metadata ? 'destination_url'
    OR metadata ? 'board_name'
    OR metadata ? 'dominant_color'
    OR metadata ? 'visual_annotations'
  );

-- 6. Ensure SARGable indexes on keyword_displaced_index
CREATE INDEX IF NOT EXISTS idx_kdi_kw_vacuum
  ON public.keyword_displaced_index (keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC);

CREATE INDEX IF NOT EXISTS idx_kdi_pin_id
  ON public.keyword_displaced_index (pin_id);

-- 7. Refresh 24h Pulse summary materialized view if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_pulse_24h_summary'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;
  END IF;
END $$;

COMMIT;
