-- ============================================================================
-- Migration 029: Enforce NOT NULL on keyword_pins_snapshots.is_displaced
-- Target: Neon Serverless Postgres (Master Hub & Fleet Shards)
-- ============================================================================

SET lock_timeout = '3000';

-- 1. Ensure DEFAULT is explicitly FALSE
ALTER TABLE keyword_pins_snapshots 
ALTER COLUMN is_displaced SET DEFAULT FALSE;

-- 2. Backfill existing NULL entries to FALSE
UPDATE keyword_pins_snapshots 
SET is_displaced = FALSE 
WHERE is_displaced IS NULL;

-- 3. Enforce NOT NULL constraint
ALTER TABLE keyword_pins_snapshots 
ALTER COLUMN is_displaced SET NOT NULL;

-- 4. Register in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('029_displaced', 'keyword_snapshots_not_null_displaced', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
