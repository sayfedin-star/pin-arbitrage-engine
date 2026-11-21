-- ============================================================================
-- scripts/migrations/010_pg16_hot_hygiene_and_index_cleanup.sql
-- Version: 010 (pg16_hot_hygiene_and_index_cleanup)
--
-- Wave 3 P3-DB PostgreSQL 16 Performance & HOT Update Hygiene:
--   1. Drops volatile-column secondary indexes blocking Heap-Only Tuple (HOT)
--      updates on high-churn tables.
--   2. Drops verified prefix-redundant, duplicate, and 0-scan secondary indexes.
--   3. Configures aggressive per-table autovacuum/autoanalyze scale factors on
--      hot update tables to keep dead tuples low and planner statistics fresh.
--
-- SAFETY NOTES:
--   - Uses plain transactional `DROP INDEX IF EXISTS` (safe and <10ms on the
--     ~164 MB dataset) so `scripts/migrate.mjs` executes atomically inside
--     `sql.begin(...)` alongside `schema_migrations` tracking.
--   - Preserves critical active indexes & storage parameters:
--       * `idx_mv_pulse_24h_summary_id` (required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
--       * `idx_dir_trgm_domain` (GIN trigram search index)
--       * `fillfactor = 80` on hot tables
-- ============================================================================

-- 1. Drop volatile-column indexes killing PostgreSQL 16 HOT updates
DROP INDEX IF EXISTS public.idx_dir_ad_network;
DROP INDEX IF EXISTS public.idx_dir_top10;
DROP INDEX IF EXISTS public.idx_newborn_keyword_clusters_updated;
DROP INDEX IF EXISTS public.idx_nc_last_run_id;
DROP INDEX IF EXISTS public.idx_candidates_saves;
DROP INDEX IF EXISTS public.idx_candidates_velocity;

-- 2. Drop prefix-redundant, duplicate, and 0-scan indexes
DROP INDEX IF EXISTS public.idx_tracked_keywords_keyword;
DROP INDEX IF EXISTS public.idx_competitor_boards_comp_id;
DROP INDEX IF EXISTS public.idx_candidates_seed;
DROP INDEX IF EXISTS public.idx_capsules_seed;
DROP INDEX IF EXISTS public.idx_ump_is_product;
DROP INDEX IF EXISTS public.idx_kf_trgm_name;
DROP INDEX IF EXISTS public.idx_kw_folders_created;
DROP INDEX IF EXISTS public.idx_kw_folders_name;
DROP INDEX IF EXISTS public.idx_pvsc_expires;

-- 3. Per-table autovacuum & autoanalyze tuning on high-churn tables
ALTER TABLE public.domain_intelligence_rollup SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.keyword_serp_positions SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.keyword_guided_capsules SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
