-- ============================================================================
-- Migration 050: Purge Legacy Neon Registry and Retired Snapshots
-- ============================================================================
-- Context:
-- With the completion of the Unified Single-DB architecture (Native VPS PostgreSQL SSOT),
-- the multi-database registry and legacy central hub snapshot tables are retired:
--   1. neon_projects_registry  (fleet routing table superseded by unified single-DB)
--   2. pa_pin_metrics          (legacy metrics table superseded by pins_daily_metrics)
--   3. keyword_pins_snapshots  (legacy snapshots view/table superseded by pins_daily_metrics / universal_master_pins)
-- ============================================================================

DO $$
BEGIN
  -- 1. Drop keyword_pins_snapshots (whether view or table)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'keyword_pins_snapshots' AND c.relkind IN ('v', 'm')) THEN
    EXECUTE 'DROP VIEW IF EXISTS keyword_pins_snapshots CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'keyword_pins_snapshots' AND c.relkind IN ('r', 'p')) THEN
    EXECUTE 'DROP TABLE IF EXISTS keyword_pins_snapshots CASCADE';
  END IF;

  -- 2. Drop pa_pin_metrics (whether view or table)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pa_pin_metrics' AND c.relkind IN ('v', 'm')) THEN
    EXECUTE 'DROP VIEW IF EXISTS pa_pin_metrics CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pa_pin_metrics' AND c.relkind IN ('r', 'p')) THEN
    EXECUTE 'DROP TABLE IF EXISTS pa_pin_metrics CASCADE';
  END IF;

  -- 3. Drop neon_projects_registry (whether view or table)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'neon_projects_registry' AND c.relkind IN ('v', 'm')) THEN
    EXECUTE 'DROP VIEW IF EXISTS neon_projects_registry CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'neon_projects_registry' AND c.relkind IN ('r', 'p')) THEN
    EXECUTE 'DROP TABLE IF EXISTS neon_projects_registry CASCADE';
  END IF;
END $$;
