-- ============================================================================
-- Migration 024: Full Fleet MVCC HOT Updates & Fillfactor Hardening
-- Target: Neon Serverless Postgres (Master Hub)
-- Leaves 20% headroom per 8KB page for Heap-Only Tuple (HOT) updates,
-- eliminating write amplification and index bloat on high-velocity crawlers.
-- ============================================================================

-- Guard against DDL queue pileups by failing fast after 3 seconds of lock wait
SET lock_timeout = '3000';

-- 1. Targeted Fillfactor Hardening for Master Hub High-Update Tables (80% Fillfactor)
ALTER TABLE keyword_serp_current SET (fillfactor = 80);
ALTER TABLE pa_pins SET (fillfactor = 80);
ALTER TABLE pa_pin_metrics SET (fillfactor = 80);
ALTER TABLE universal_master_pins SET (fillfactor = 80);
ALTER TABLE competitor_profiles SET (fillfactor = 80);
ALTER TABLE competitor_pins SET (fillfactor = 80);
ALTER TABLE tracked_keywords SET (fillfactor = 80);
ALTER TABLE candidate_graph_nodes SET (fillfactor = 80);

-- 2. Register Migration 024 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('024', 'fillfactor_hot_hardening', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
