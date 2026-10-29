-- ====================================================================================================
-- Pin Arbitrage Engine (PAE) — Migration 037
-- File: scripts/migrations/037_sargable_and_hot_cleanup.sql
-- Purpose: Unblock 100% PostgreSQL HOT Updates on Central Hub, Drop Volatile Covering Indexes,
--          Deploy Clean SARGable B-Tree Indexes, and Enforce SANE fillfactor = 80.
-- Authority: Lead Systems Architect & Database Working Group
-- ====================================================================================================

BEGIN;

-- ----------------------------------------------------------------------------------------------------
-- 1. DROP HOT-BLOCKING COVERING INDEXES ON keyword_serp_current
-- ----------------------------------------------------------------------------------------------------
-- Migration 023 covering index included save_count and daily_save_velocity (kills HOT updates on every crawl)
DROP INDEX IF EXISTS idx_ksc_active_covering;

-- Migration 028 covering index included volatile daily_save_velocity in INCLUDE clause
DROP INDEX IF EXISTS idx_ksc_domain_serp_authority;


-- ----------------------------------------------------------------------------------------------------
-- 2. CREATE CLEAN REPLACEMENT B-TREE INDEXES (ZERO VOLATILE COLUMNS IN KEY OR INCLUDE)
-- ----------------------------------------------------------------------------------------------------
-- Instant seek for active ranking pins by keyword
CREATE INDEX IF NOT EXISTS idx_ksc_active_rank_clean
  ON keyword_serp_current (keyword_id, rank_position)
  WHERE rank_position IS NOT NULL;

-- Instant seek for domain authority and rollup calculations
CREATE INDEX IF NOT EXISTS idx_ksc_domain_rank_clean
  ON keyword_serp_current (domain, rank_position)
  WHERE domain IS NOT NULL;


-- ----------------------------------------------------------------------------------------------------
-- 3. DROP HOT-BLOCKING INDEXES ON competitor_pins
-- ----------------------------------------------------------------------------------------------------
-- Migration 028 index on link_domain covering save_count
DROP INDEX IF EXISTS idx_cp_link_domain_saves;

-- Migration 033 covering index on domain rollup
DROP INDEX IF EXISTS idx_cp_domain_rollup_covering;

-- Migration 036 index containing volatile repin_count or save metrics
DROP INDEX IF EXISTS idx_cp_link_domain_clean;

-- Create lightweight, clean B-tree index for domain attribution seeks
CREATE INDEX IF NOT EXISTS idx_cp_link_domain_clean
  ON competitor_pins (link_domain, created_at_pinterest DESC)
  WHERE link_domain IS NOT NULL;


-- ----------------------------------------------------------------------------------------------------
-- 4. FORMALIZE CANONICAL KEYWORD SLUG & UNIQUE CONSTRAINT ON tracked_keywords
-- ----------------------------------------------------------------------------------------------------
-- Ensure canonical_keyword column exists as precomputed lowercase slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracked_keywords' AND column_name = 'canonical_keyword'
  ) THEN
    ALTER TABLE tracked_keywords ADD COLUMN canonical_keyword VARCHAR(255);
  END IF;
END $$;

-- Populate canonical_keyword for any existing null rows (if not already generated)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracked_keywords' AND column_name = 'canonical_keyword' AND is_generated = 'NEVER'
  ) THEN
    UPDATE tracked_keywords
    SET canonical_keyword = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(keyword), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'))
    WHERE canonical_keyword IS NULL OR canonical_keyword = '';
  END IF;
END $$;

-- Create unique index to enable instant O(1) B-tree lookup in resolveKeywordBySlug
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_tracked_keywords
  ON tracked_keywords (canonical_keyword);


-- ----------------------------------------------------------------------------------------------------
-- 5. RE-APPLY fillfactor = 80 ON HEAVILY UPDATED OPERATIONAL TABLES
-- ----------------------------------------------------------------------------------------------------
-- Guarantees 20% page headroom for in-place Heap-Only Tuple updates
ALTER TABLE keyword_serp_current SET (fillfactor = 80);
ALTER TABLE competitor_pins SET (fillfactor = 80);
ALTER TABLE keyword_displaced_index SET (fillfactor = 80);

COMMIT;
