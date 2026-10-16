-- ============================================================================
-- Migration 030: Zero-Bloat Hub Slimming & Displaced Index Topology
-- Target: Neon Serverless Postgres (Central Hub < 35 MB)
-- Description:
--   1. Adds scalar crawl lease columns to tracked_keywords to eliminate JSONB TOAST bloat.
--   2. Adds inline baseline velocity columns (prev_rank_position, baseline_day_saves, baseline_day_date)
--      to keyword_serp_current so daily velocity & rank deltas require zero Hub snapshot tables.
--   3. Creates ultra-slim numeric index keyword_displaced_index (~56 bytes/row) on Hub
--      to serve Displaced Vault rankings in < 5ms without 99-shard scatter-gather.
-- ============================================================================

SET lock_timeout = '3000';

-- 1. Scalar Lease Columns on tracked_keywords (Eliminates pg_toast_221295 MVCC bloat)
ALTER TABLE tracked_keywords
  ADD COLUMN IF NOT EXISTS crawl_lease_token UUID,
  ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;

-- 2. Inline Baseline Velocity & Rank Columns on keyword_serp_current
ALTER TABLE keyword_serp_current
  ADD COLUMN IF NOT EXISTS prev_rank_position INT,
  ADD COLUMN IF NOT EXISTS baseline_day_saves BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_day_date DATE;

-- 3. Slim Displaced Index Table (~56 bytes per row -> 53,674 rows = ~3.2 MB total)
CREATE TABLE IF NOT EXISTS keyword_displaced_index (
  keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  last_known_rank SMALLINT,
  vacuum_opportunity_score SMALLINT DEFAULT 0,
  displaced_date DATE NOT NULL DEFAULT CURRENT_DATE,
  save_count BIGINT DEFAULT 0,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  daily_save_velocity NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (keyword_id, pin_id)
);

ALTER TABLE keyword_displaced_index SET (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_kdi_kw_score
  ON keyword_displaced_index (keyword_id, vacuum_opportunity_score DESC, last_known_rank ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_kdi_pin_id
  ON keyword_displaced_index (pin_id);

-- 4. Register Migration 030
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('030', 'zero_bloat_hub_slimming_and_displaced_index', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();