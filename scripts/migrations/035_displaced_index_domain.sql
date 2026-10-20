-- Migration 035: Add domain column to keyword_displaced_index for fast Domain Studio discovery
-- Target: Central Neon Hub
-- [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
-- [INVARIANT: ZERO-HUB-SNAPSHOTS]
-- [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
-- [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]

-- Phase 1: Acquire brief metadata lock with 3s timeout and release AccessExclusiveLock immediately
BEGIN;
SET LOCAL lock_timeout = '3000';

ALTER TABLE keyword_displaced_index
  ADD COLUMN IF NOT EXISTS domain VARCHAR(128);

COMMIT;

-- Phase 2: Build partial B-Tree index non-blockingly outside transaction block
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kdi_domain
  ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';

-- Phase 3: Bounded batch backfill (2,000 rows per batch; repeated by runner until 0 rows remain)
WITH batch AS (
  SELECT kdi.keyword_id, kdi.pin_id, ksc.domain
  FROM keyword_displaced_index kdi
  JOIN keyword_serp_current ksc
    ON ksc.keyword_id = kdi.keyword_id
   AND ksc.pin_id = kdi.pin_id
  WHERE (kdi.domain IS NULL OR kdi.domain = '')
    AND (ksc.domain IS NOT NULL AND ksc.domain <> '')
  LIMIT 2000
)
UPDATE keyword_displaced_index kdi
SET domain = batch.domain,
    updated_at = NOW()
FROM batch
WHERE kdi.keyword_id = batch.keyword_id
  AND kdi.pin_id = batch.pin_id;

-- Phase 4: Record Migration 035 in schema_migrations
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('035', 'add_domain_to_keyword_displaced_index', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
