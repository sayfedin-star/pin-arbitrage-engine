-- ============================================================================
-- Migration 015: MVCC HOT Updates, Fillfactor & Statistics Target Hardening
-- Author: Principal Distributed Database Engineer & PostgreSQL Internals Specialist
-- Target: Neon Serverless Postgres (Master Hub & Fleet Shards)
-- ============================================================================

-- Guard against DDL queue pileups by failing fast after 3 seconds of lock wait
SET lock_timeout = '3000';

-- 1. Targeted Fillfactor Hardening for High-Update Tables (85% Fillfactor)
-- Leaves 15% headroom (~1.2KB) per 8KB page for in-place Heap-Only Tuple (HOT) updates,
-- eliminating write amplification and index bloat on high-velocity crawlers.
ALTER TABLE competitor_pins SET (fillfactor = 85);
ALTER TABLE keyword_pins_snapshots SET (fillfactor = 85);
ALTER TABLE candidate_graph_nodes SET (fillfactor = 85);
ALTER TABLE pa_pin_metrics SET (fillfactor = 85);
ALTER TABLE tracked_keywords SET (fillfactor = 85);

-- 2. Enhanced Statistics Target (500 Buckets) for Skewed Cardinality Columns
-- Prevents Plan Cache generic plan degradation on skewed distributions (e.g. etsy.com, top keywords)
ALTER TABLE competitor_pins ALTER COLUMN competitor_id SET STATISTICS 500;
ALTER TABLE competitor_pins ALTER COLUMN link_domain SET STATISTICS 500;
ALTER TABLE keyword_pins_snapshots ALTER COLUMN keyword_id SET STATISTICS 500;
ALTER TABLE candidate_graph_nodes ALTER COLUMN seed_pin_id SET STATISTICS 500;
ALTER TABLE tracked_keywords ALTER COLUMN keyword SET STATISTICS 500;

-- 3. Re-analyze modified tables to immediately populate expanded 500-bucket histograms
ANALYZE competitor_pins;
ANALYZE keyword_pins_snapshots;
ANALYZE candidate_graph_nodes;
ANALYZE pa_pin_metrics;
ANALYZE tracked_keywords;

-- 4. Register Migration 015 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('015', 'mvcc_hot_and_advisory_hardening', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
