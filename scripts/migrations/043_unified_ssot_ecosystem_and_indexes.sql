-- Migration 043: Unified Single-DB Functional Indexes & Redundant Index Cleanup
-- Ensures O(log N) B-Tree seeks on normalized domain and creator_username expressions
-- across universal_master_pins, competitor_pins, keyword_serp_current, and keyword_displaced_index.

CREATE INDEX IF NOT EXISTS idx_ump_norm_domain
  ON universal_master_pins (LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', '')))
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS idx_ump_norm_creator
  ON universal_master_pins (LOWER(TRIM(REPLACE(COALESCE(creator_username, ''), '@', ''))))
  WHERE creator_username IS NOT NULL AND creator_username <> '';

CREATE INDEX IF NOT EXISTS idx_cp_norm_domain
  ON competitor_pins (LOWER(REGEXP_REPLACE(TRIM(COALESCE(link_domain, '')), '^www\.', '')))
  WHERE link_domain IS NOT NULL AND link_domain <> '';

CREATE INDEX IF NOT EXISTS idx_ksc_norm_domain
  ON keyword_serp_current (LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', '')))
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS idx_ksc_norm_creator
  ON keyword_serp_current (LOWER(TRIM(REPLACE(COALESCE(creator_username, ''), '@', ''))))
  WHERE creator_username IS NOT NULL AND creator_username <> '';

CREATE INDEX IF NOT EXISTS idx_kdi_norm_domain
  ON keyword_displaced_index (LOWER(REGEXP_REPLACE(TRIM(COALESCE(domain, '')), '^www\.', '')))
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS idx_kdi_norm_creator
  ON keyword_displaced_index (LOWER(TRIM(REPLACE(COALESCE(creator_username, ''), '@', ''))))
  WHERE creator_username IS NOT NULL AND creator_username <> '';

-- Drop duplicate overlapping indexes on competitor_pins to reduce write amplification
DROP INDEX IF EXISTS idx_competitor_pins_comp_id;
DROP INDEX IF EXISTS idx_competitor_pins_lookup;
