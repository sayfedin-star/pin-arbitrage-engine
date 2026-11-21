-- ============================================================================
-- scripts/migrations/009_drop_orphan_legacy_objects.sql
-- Version: 009 (drop_orphan_legacy_objects)
--
-- Wave 2 P1 cleanup:
--   Idempotently drops verified zero-reference legacy views, retired tables,
--   and orphaned PostgreSQL functions left over from pre-SSOT schemas.
--
-- SAFETY NOTES:
--   - Preserves the active 5-argument overload:
--       public.pa_topic_clusters_page(integer, text, integer, integer, text)
--     Only drops the orphaned 4-argument overload:
--       public.pa_topic_clusters_page(integer, text, integer, integer)
--   - Preserves active index `idx_mv_pulse_24h_summary_id`.
-- ============================================================================

-- 1. Legacy compatibility views (0 references across src/, scripts/, tests/)
DROP VIEW IF EXISTS public.creator_profiles, public.creator_boards, public.pin_metrics_snapshots;

-- 2. Retired pre-SSOT tables (0 references across src/, scripts/, tests/)
DROP TABLE IF EXISTS public.pa_pins, public.pa_pin_metrics, public.pa_qualification_rules, public.keyword_pins_snapshots, public.crawler_shard_heartbeats CASCADE;

-- 3. Orphaned legacy functions & trigger functions (preserving 5-arg pa_topic_clusters_page)
DROP FUNCTION IF EXISTS public.get_competitor_board_counts();
DROP FUNCTION IF EXISTS public.get_latest_competitor_snapshots(integer[]);
DROP FUNCTION IF EXISTS public.pa_topic_clusters_page(integer, text, integer, integer);
DROP FUNCTION IF EXISTS public.trg_enforce_monotonic_metrics();
DROP FUNCTION IF EXISTS public.trg_pa_pins_enforce_monotonic_metrics();
