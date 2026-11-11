-- ============================================================================
-- Migration 047: Drop Unused Legacy Tables (Single-DB Optimization)
-- ============================================================================
-- Context:
-- After transitioning to the Unified Single-DB architecture and completing a
-- full codebase grep across `src/` and `scripts/`, the following tables were
-- confirmed to have 0 code references and are no longer part of the active
-- schema:
--   1. keyword_displaced_pins   (superseded by keyword_displaced_index)
--   2. pin_related_edges        (legacy unused graph edge table)
--   (Note: crawler_shard_heartbeats is retained for fleet telemetry)
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS keyword_displaced_pins CASCADE;
DROP TABLE IF EXISTS pin_related_edges CASCADE;

-- Note: Empty historical/audit tables that still have fallback code paths
-- (`serp_volatility_events`, `domain_monopoly_snapshots`, `keyword_serp_snapshots`,
-- `pin_rank_history`, `board_snapshots`, `pin_outbound_clicks`, `pin_metrics_daily`)
-- are intentionally retained with 0 rows (0 KB disk footprint) to preserve
-- schema parity until their fallback routes are retired.

COMMIT;
