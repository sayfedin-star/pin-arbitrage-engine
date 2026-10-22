-- ============================================================================
-- Migration 0003: Edge Pins Daily Trajectory Mirroring
-- Target: Cloudflare D1 SQLite Edge Database (PIN_D1_DB / pin-engine-edge)
-- Description:
--   Mirrors chronological daily trajectory (saves, repins, ranks, velocity)
--   directly into edge_pins_metadata to serve read-only pin dossier views in
--   < 5ms without waking up dormant Neon Shards.
-- ============================================================================

ALTER TABLE edge_pins_metadata ADD COLUMN daily_trajectory TEXT DEFAULT '[]';
