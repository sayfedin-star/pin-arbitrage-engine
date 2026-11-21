-- ============================================================================
-- scripts/migrations/008_drop_competitor_related_nodes.sql
-- Version: 008 (drop_competitor_related_nodes)
--
-- Promoted contract migration (Wave 2 P1 cleanup):
--   Drops legacy `public.competitor_related_nodes` table after unification into
--   `public.candidate_graph_nodes` (migration 007) and zero remaining references.
--   Take a snapshot backup before applying in production:
--     `pg_dump -U postgres -d pin_arbitrage -t public.competitor_related_nodes > crn_backup.sql`
-- ============================================================================

DROP TABLE IF EXISTS public.competitor_related_nodes;
