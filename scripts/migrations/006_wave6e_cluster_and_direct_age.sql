-- ============================================================================
-- scripts/migrations/006_wave6e_cluster_and_direct_age.sql
-- Version: 006 (wave6e_cluster_and_direct_age)
--
-- Wave 6E: Newborn Keyword Cluster Explorer + Direct Age/Re-pins + Find More Ideas Boards:
--   1. Creates `newborn_keyword_clusters` (fillfactor = 80, HOT-safe, zero indexes on volatile JSONB)
--   2. Adds `cluster_id` FK onto `newborn_runs` with partial HOT-safe index
--   3. Adds `matched_queries JSONB` onto `newborn_run_candidates` for Cluster Hit (2x / 3x) overlap tracking
--   4. Realigns `app_settings` (`newborn_engine_settings`) factory defaults:
--      - `qualification.resolve_root_pin = false` (direct pin age & repin_count)
--      - `discovery.surfaces.board_feed.enabled = false`
--      - `discovery.surfaces.board_more_ideas.enabled = true`, `target_pins_per_board = 100`, `max_pages = 4`
--      - `discovery.max_queries_per_run = 25`
--
-- Strictly additive & idempotent, zero CONCURRENTLY (transactional-safe).
-- Migrations 001..005 are left untouched.
-- ============================================================================

-- 1. Persistent Keyword Cluster Explorer staging table
CREATE TABLE IF NOT EXISTS public.newborn_keyword_clusters (
  id BIGSERIAL PRIMARY KEY,
  seed_keyword TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  l1_interest TEXT NOT NULL DEFAULT 'all',
  include_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclude_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  idea_page JSONB NOT NULL DEFAULT '{}'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovered_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  keyword_count INT NOT NULL DEFAULT 0,
  enriched_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  last_run_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_newborn_keyword_clusters_seed_lookup
  ON public.newborn_keyword_clusters (LOWER(seed_keyword), country, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newborn_keyword_clusters_updated
  ON public.newborn_keyword_clusters (updated_at DESC);

-- 2. Link newborn_runs to optional keyword cluster
ALTER TABLE public.newborn_runs
  ADD COLUMN IF NOT EXISTS cluster_id BIGINT REFERENCES public.newborn_keyword_clusters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_newborn_runs_cluster_id
  ON public.newborn_runs (cluster_id)
  WHERE cluster_id IS NOT NULL;

-- 3. Track per-run multi-query overlap (`Cluster Hit 2x/3x`) on run candidates (NO index on volatile JSONB)
ALTER TABLE public.newborn_run_candidates
  ADD COLUMN IF NOT EXISTS matched_queries JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Realign global newborn_engine_settings defaults safely for Wave 6E
UPDATE public.app_settings
SET
  value = jsonb_set(
    jsonb_set(
      COALESCE(value, '{}'::jsonb),
      '{qualification}',
      COALESCE(value->'qualification', '{}'::jsonb) || '{"resolve_root_pin": false}'::jsonb,
      true
    ),
    '{discovery}',
    jsonb_set(
      COALESCE(value->'discovery', '{}'::jsonb) || '{"max_queries_per_run": 25}'::jsonb,
      '{surfaces}',
      COALESCE(value->'discovery'->'surfaces', '{}'::jsonb)
        || jsonb_build_object(
          'board_feed',
          COALESCE(value->'discovery'->'surfaces'->'board_feed', '{}'::jsonb) || '{"enabled": false}'::jsonb,
          'board_more_ideas',
          COALESCE(value->'discovery'->'surfaces'->'board_more_ideas', '{}'::jsonb)
            || '{"enabled": true, "page_size": 25, "target_pins_per_board": 100, "max_pages": 4}'::jsonb
        ),
      true
    ),
    true
  ),
  updated_at = NOW()
WHERE key = 'newborn_engine_settings'
  AND NOT (COALESCE(value->'qualification', '{}'::jsonb) ? 'resolve_root_pin');
