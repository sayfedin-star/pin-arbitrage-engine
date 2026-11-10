-- ============================================================================
-- Migration 050: Purge Legacy Neon Registry and Retired Snapshots
-- ============================================================================
-- Context:
-- With the completion of the Unified Single-DB architecture (Native VPS PostgreSQL SSOT),
-- the multi-database registry and legacy central hub snapshot tables are retired:
--   1. neon_projects_registry  (fleet routing table superseded by unified single-DB)
--   2. pa_pin_metrics          (legacy metrics table superseded by pins_daily_metrics)
--   3. keyword_pins_snapshots  (legacy snapshots table superseded by pins_daily_metrics / universal_master_pins)
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS neon_projects_registry CASCADE;
DROP TABLE IF EXISTS pa_pin_metrics CASCADE;
DROP TABLE IF EXISTS keyword_pins_snapshots CASCADE;

COMMIT;
