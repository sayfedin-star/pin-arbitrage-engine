-- ============================================================================
-- Migration 014: Fleet Index, DDL Concurrency & Parity Hardening
-- Author: Principal Database Architect & PostgreSQL Internals Auditor
-- Target: Neon Serverless Postgres (Master Hub & Fleet Shards)
-- ============================================================================

-- Guard against DDL queue pileups by failing fast after 3 seconds of lock wait
SET lock_timeout = '3000';

-- 1. Ensure seed_guided_search_capsules Unique Constraint for ON CONFLICT idempotency
-- Deduplicate any duplicate entries before establishing the unique arbiter index
DELETE FROM seed_guided_search_capsules a
USING seed_guided_search_capsules b
WHERE a.id > b.id
  AND a.seed_pin_id = b.seed_pin_id
  AND a.normalized_query = b.normalized_query;

CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm 
ON seed_guided_search_capsules (seed_pin_id, normalized_query);

-- Drop redundant prefix index on seed_pin_id since uq_seed_capsules_norm covers it
DROP INDEX IF EXISTS idx_capsules_seed;

-- 2. Add Leading pin_id Index on keyword_pins_snapshots
-- Eliminates full table Seq Scan on getPinPerformanceTrajectory and getPinDeepDossier
CREATE INDEX IF NOT EXISTS idx_kps_pin_id_date 
ON keyword_pins_snapshots(pin_id, snapshot_date ASC, created_at DESC);

-- 3. Composite Ordered Index for Active SERP (High Cardinality Leading Ordering)
CREATE INDEX IF NOT EXISTS idx_kps_serp_ordered
ON keyword_pins_snapshots(keyword_id, snapshot_date DESC, rank_position ASC)
WHERE is_displaced IS FALSE;

-- 4. Clean and Normalize is_displaced Nulls for strict partial index matching
UPDATE keyword_pins_snapshots 
SET is_displaced = FALSE 
WHERE is_displaced IS NULL;

-- 5. Drop Redundant Write-Bloat Index on competitor_pins
-- idx_competitor_pins_queue_fast (competitor_id, enrichment_status, id) strictly covers this
DROP INDEX IF EXISTS idx_competitor_pins_enrichment_queue;

-- 6. Add GIN Index on tracked_keywords(popular_pins) with jsonb_path_ops
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_popular_pins_gin 
ON tracked_keywords USING gin(popular_pins jsonb_path_ops);

-- 7. Add GIN Index on neon_projects_registry(assigned_shards) for Hub array queries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neon_projects_registry') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_neon_projects_assigned_shards_gin ON neon_projects_registry USING gin(assigned_shards);';
  END IF;
END $$;

-- 8. Backfill & Register All Active Fleet Migrations in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES 
  ('012', 'keyword_folders_and_crossover', NOW()),
  ('013', 'keyword_displaced_vault_and_popular_pins', NOW()),
  ('014', 'fleet_index_and_concurrency_hardening', NOW())
ON CONFLICT (version) DO UPDATE SET 
  applied_at = NOW();
