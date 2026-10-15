-- ============================================================================
-- Migration 026: Neon Performance, HOT Indexes & SARGable Query Acceleration
-- Target: Neon Serverless Postgres (Master Hub)
-- Fixes full table scans (Seq Scans), N+1 board overhead, and MVCC page churn.
-- ============================================================================

-- Guard against DDL queue pileups by failing fast after 3 seconds of lock wait
SET lock_timeout = '3000';

-- 1. Ensure Trigram Extension is Active
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Functional Expression Index on Normalized PinArchive Username
CREATE INDEX IF NOT EXISTS idx_pa_pins_account_norm 
ON pa_pins (LOWER(REPLACE(account_username, '@', '')), saves DESC);

-- 3. Composite Index for Tier 3 SARGable Evaluation and Date Range Queries
CREATE INDEX IF NOT EXISTS idx_pa_pins_created_saves 
ON pa_pins (created_at_pinterest DESC NULLS LAST, saves DESC);

-- 4. Trigram GIN Indexes for Sub-15ms Full-Text / LIKE Search
CREATE INDEX IF NOT EXISTS idx_pa_pins_trgm_title 
ON pa_pins USING gin (LOWER(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pa_pins_trgm_board 
ON pa_pins USING gin (LOWER(COALESCE(board_name, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cp_pins_trgm_title 
ON competitor_pins USING gin (LOWER(title) gin_trgm_ops);

-- 5. Partial Index for High-Velocity Crawler Pending Queue
CREATE INDEX IF NOT EXISTS idx_cp_pending_queue_hot 
ON competitor_pins (competitor_id, enrich_attempts ASC, id ASC) 
WHERE enrichment_status = 'pending';

-- 6. HOT Fillfactor Tuning for High-Churn Tables (Prevents MVCC Page Bloat)
ALTER TABLE competitor_history_snapshots SET (fillfactor = 80);
ALTER TABLE competitor_boards SET (fillfactor = 80);
ALTER TABLE crawler_shard_heartbeats SET (fillfactor = 70);

-- 7. Register Migration 026 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('026', 'neon_performance_and_hot_indexes', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
