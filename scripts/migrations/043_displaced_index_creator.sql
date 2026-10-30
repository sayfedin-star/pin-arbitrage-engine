-- Migration 043: Displaced Index Creator Username & Composite Covering Partial Index
-- Non-transactional DDL execution (no BEGIN / COMMIT block to support CREATE INDEX CONCURRENTLY)
-- [INVARIANT: DISPLACED-VAULT-CREATOR-ATTRIBUTION]

ALTER TABLE keyword_displaced_index
  ADD COLUMN IF NOT EXISTS creator_username VARCHAR(64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kdi_kw_creator
  ON keyword_displaced_index (keyword_id, creator_username)
  INCLUDE (save_count, last_known_rank, pin_id)
  WHERE creator_username IS NOT NULL AND creator_username <> '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kdi_creator_username
  ON keyword_displaced_index (creator_username)
  WHERE creator_username IS NOT NULL AND creator_username <> '';

-- Stage 1: Backfill from other keywords in keyword_serp_current
UPDATE keyword_displaced_index kdi
SET creator_username = LOWER(TRIM(ksc.creator_username)),
    updated_at = NOW()
FROM keyword_serp_current ksc
WHERE ksc.pin_id = kdi.pin_id
  AND (kdi.creator_username IS NULL OR kdi.creator_username = '')
  AND ksc.creator_username IS NOT NULL AND ksc.creator_username <> '';

-- Stage 2: Backfill from competitor_pins & competitor_profiles
UPDATE keyword_displaced_index kdi
SET creator_username = LOWER(TRIM(cprof.username)),
    updated_at = NOW()
FROM competitor_pins cp
JOIN competitor_profiles cprof ON cprof.id = cp.competitor_id
WHERE cp.pin_id = kdi.pin_id
  AND (kdi.creator_username IS NULL OR kdi.creator_username = '')
  AND cprof.username IS NOT NULL AND cprof.username <> '';

-- Stage 3: Backfill from pa_pins
UPDATE keyword_displaced_index kdi
SET creator_username = LOWER(TRIM(pa.account_username)),
    updated_at = NOW()
FROM pa_pins pa
WHERE pa.pin_id = kdi.pin_id
  AND (kdi.creator_username IS NULL OR kdi.creator_username = '')
  AND pa.account_username IS NOT NULL AND pa.account_username <> '';

-- Record migration in schema_migrations
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('043', '043_displaced_index_creator', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
