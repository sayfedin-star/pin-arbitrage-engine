-- ============================================================================
-- Migration 031: Zero-HTTP Reconciliation Pipeline & Tier 2 Velocity Breakout
-- Target: Neon Serverless Postgres (Central Hub & Fleet Shards)
-- Description:
--   1. Expands pa_qualification_rules with Tier 2 sustained velocity & share momentum columns.
--   2. Adds is_deleted column & ultra-fast partial index to competitor_pins for instant reconciliation.
--   3. Registers schema migration 031.
-- ============================================================================

SET lock_timeout = '3000';

-- 1. Expand Qualification Rules with Velocity Breakout Thresholds
ALTER TABLE pa_qualification_rules
  ADD COLUMN IF NOT EXISTS tier2_min_velocity NUMERIC(6,2) DEFAULT 3.50,
  ADD COLUMN IF NOT EXISTS tier2_max_age_days INT DEFAULT 60,
  ADD COLUMN IF NOT EXISTS tier2_min_shares INT DEFAULT 15;

-- 2. Add soft-delete flag & reconciliation index to competitor_pins
ALTER TABLE competitor_pins
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_comp_pins_reconcile_candidates
  ON competitor_pins (competitor_id, save_count DESC, repin_count DESC, created_at_pinterest DESC)
  WHERE is_deleted = FALSE;

-- 3. Register Migration 031 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('031', 'reconciliation_and_velocity_rules', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
