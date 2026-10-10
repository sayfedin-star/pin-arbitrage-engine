-- ============================================================================
-- Migration 017: Universal Fleet Parity Repair & Atomic Invariants
-- Target: Neon Serverless Postgres (Central Hub & All 99 Fleet Storage Shards)
-- ============================================================================

SET lock_timeout = '3000';

-- ============================================================================
-- 1. Deduplicate & Enforce Unique Constraint on pins_daily_snapshots
-- Prevents duplicate snapshots on same pin + keyword + date, enabling atomic upsert
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pins_daily_snapshots') THEN
    DELETE FROM pins_daily_snapshots a
    USING pins_daily_snapshots b
    WHERE a.id < b.id
      AND a.pin_id = b.pin_id
      AND a.keyword_id IS NOT DISTINCT FROM b.keyword_id
      AND a.snapshot_date = b.snapshot_date;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pds_pin_keyword_date 
    ON pins_daily_snapshots (pin_id, keyword_id, snapshot_date);
  END IF;
END $$;

-- ============================================================================
-- 2. Deduplicate & Enforce Unique Constraint on seed_guided_search_capsules
-- Eliminates 42P10 index failure by guaranteeing unique (seed_pin_id, normalized_query)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'seed_guided_search_capsules') THEN
    DELETE FROM seed_guided_search_capsules a
    USING seed_guided_search_capsules b
    WHERE a.id < b.id
      AND a.seed_pin_id = b.seed_pin_id
      AND a.normalized_query = b.normalized_query;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm 
    ON seed_guided_search_capsules (seed_pin_id, normalized_query);
  END IF;
END $$;

-- ============================================================================
-- 3. Competitor Pins 13-Column Fleet Parity
-- Synchronizes shard schema with Hub to support bulk crawler updates & 015 statistics
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitor_pins') THEN
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS link_domain VARCHAR(255);
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS destination_url TEXT;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS save_count INT DEFAULT 0;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS repin_count INT DEFAULT 0;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS created_at_pinterest TIMESTAMPTZ;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;
    ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

    -- Apply enhanced statistics target (500 buckets) on link_domain
    ALTER TABLE competitor_pins ALTER COLUMN link_domain SET STATISTICS 500;
  END IF;
END $$;

-- ============================================================================
-- 4. Atomic Concurrency Row Lease Columns on tracked_keywords (Central Hub)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tracked_keywords') THEN
    ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token UUID;
    ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_tk_crawl_lease ON tracked_keywords(crawl_lease_until) WHERE crawl_lease_until IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 5. Atomic Concurrency Row Lease Columns on cluster_seeds
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cluster_seeds') THEN
    ALTER TABLE cluster_seeds ADD COLUMN IF NOT EXISTS crawl_lease_token UUID;
    ALTER TABLE cluster_seeds ADD COLUMN IF NOT EXISTS crawl_lease_until TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_cs_crawl_lease ON cluster_seeds(crawl_lease_until) WHERE crawl_lease_until IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 6. Register Migration 017 in schema_migrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('017', 'universal_fleet_parity_repair', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
