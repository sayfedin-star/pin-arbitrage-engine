-- ============================================================================
-- Migration 015: Wave 4.9 JSONB Double-Encoding Repair & Index/HOT Hygiene
-- ============================================================================
-- 1. Unwraps double-encoded JSONB strings (jsonb_typeof(col) = 'string') across
--    all 6 affected production tables idempotently.
-- 2. Drops duplicate index `idx_ww_workspace_type` and 6 HOT-breaking volatile
--    sort indexes CONCURRENTLY (zero write locks).
-- 3. Creates 4 missing HOT-safe workspace/run indexes CONCURRENTLY.
-- 4. Tunes autovacuum scale factors on the 4-Table SSOT + newborn_candidates
--    and sets fillfactor = 80 on cluster_seeds.
-- ============================================================================

-- Part A: Idempotent JSONB Double-Encoding Repair
UPDATE public.domain_intelligence_rollup
SET ad_network_history = (ad_network_history #>> '{}')::jsonb
WHERE jsonb_typeof(ad_network_history) = 'string'
  AND LEFT(BTRIM(ad_network_history #>> '{}'), 1) IN ('{', '[');

UPDATE public.tracked_keywords
SET popular_pins = (popular_pins #>> '{}')::jsonb
WHERE jsonb_typeof(popular_pins) = 'string'
  AND LEFT(BTRIM(popular_pins #>> '{}'), 1) IN ('{', '[');

UPDATE public.keyword_folders
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string'
  AND LEFT(BTRIM(metadata #>> '{}'), 1) IN ('{', '[');

UPDATE public.pin_visual_search_cache
SET matches = (matches #>> '{}')::jsonb
WHERE jsonb_typeof(matches) = 'string'
  AND LEFT(BTRIM(matches #>> '{}'), 1) IN ('{', '[');

UPDATE public.competitor_history_snapshots
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string'
  AND LEFT(BTRIM(metadata #>> '{}'), 1) IN ('{', '[');

UPDATE public.competitor_boards
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string'
  AND LEFT(BTRIM(metadata #>> '{}'), 1) IN ('{', '[');

-- Part B: Drop Duplicate & HOT-Breaking Volatile Sort Indexes CONCURRENTLY
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ww_workspace_type;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_competitor_profiles_reach;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_competitor_boards_activity;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_competitor_boards_lookup;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cbp_competitor;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_seeds_crawled;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_seeds_velocity;

-- Part C: Create 4 Missing HOT-Safe Workspace & Run Indexes CONCURRENTLY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_newborn_runs_workspace_started
  ON public.newborn_runs (workspace_id, started_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_newborn_candidates_first_run
  ON public.newborn_candidates (first_run_id)
  WHERE first_run_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cp_source_folder_id
  ON public.competitor_profiles (source_folder_id)
  WHERE source_folder_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_newborn_keyword_clusters_workspace
  ON public.newborn_keyword_clusters (workspace_id);

-- Part D: Autovacuum & HOT Fillfactor Hygiene
ALTER TABLE public.universal_master_pins SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.pins_daily_metrics SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.competitor_board_pins SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.newborn_candidates SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.cluster_seeds SET (fillfactor = 80);
