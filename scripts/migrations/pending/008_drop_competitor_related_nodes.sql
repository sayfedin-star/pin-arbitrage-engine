-- ============================================================================
-- scripts/migrations/pending/008_drop_competitor_related_nodes.sql
-- Version: 008 (drop_competitor_related_nodes)
--
-- STAGED CONTRACT MIGRATION (NOT auto-applied until promoted out of pending/):
--   Promote to scripts/migrations/008_drop_competitor_related_nodes.sql and run
--   `node scripts/migrate.mjs` ONLY AFTER:
--     1. Application code & unified `.github/workflows/related-pins-crawler.yml`
--        are deployed and verified via live `seed_deep` + `account_quick` smoke tests.
--     2. Optional snapshot backup taken:
--        `pg_dump -U postgres -d pin_arbitrage -t public.competitor_related_nodes > crn_backup.sql`
-- ============================================================================

DROP TABLE IF EXISTS public.competitor_related_nodes;
