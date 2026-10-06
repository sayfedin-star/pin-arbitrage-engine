-- ==============================================================================
-- 011_universal_fleet_parity.sql
-- Universal Fleet Parity & Master Idempotent Migration
-- Restores 100% schema parity across Neon Hub and all 99 dynamic worker shards.
-- Integrates Board Ideas Radar, Visual Lens TTL Cache, and Queue Guardrails.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Migrations Audit Table (Guardrail & Version Handshake)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Competitor Intelligence & Crawler Queue Parity
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(128) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  monthly_reach BIGINT DEFAULT 0,
  reach_delta_7d BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  views_delta_7d BIGINT DEFAULT 0,
  total_pins INT DEFAULT 0,
  total_boards INT DEFAULT 0,
  follower_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  account_type VARCHAR(32) DEFAULT 'competitor',
  activity_status VARCHAR(64) DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  last_harvest_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS last_harvest_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type ON competitor_profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_reach ON competitor_profiles(monthly_reach DESC);

CREATE TABLE IF NOT EXISTS competitor_history_snapshots (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  monthly_reach BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  follower_count INT DEFAULT 0,
  total_pins INT DEFAULT 0,
  total_boards INT DEFAULT 0,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_id, recorded_date)
);
CREATE INDEX IF NOT EXISTS idx_competitor_history_date ON competitor_history_snapshots(competitor_id, recorded_date DESC);

CREATE TABLE IF NOT EXISTS competitor_boards (
  id SERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  pin_count INT DEFAULT 0,
  follower_count INT DEFAULT 0,
  last_pinned_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_competitor_boards_comp_id ON competitor_boards(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_boards_activity ON competitor_boards(competitor_id, last_pinned_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS competitor_pins (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  board_name VARCHAR(255),
  account_username VARCHAR(128),
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  enrichment_status VARCHAR(32) DEFAULT 'pending',
  enrich_attempts INT DEFAULT 0,
  claim_token UUID,
  alt_text TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_id, pin_id)
);

-- Crucial Missing Columns on Shards (Resolves queue failure & lock hijacking)
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(32) DEFAULT 'pending';
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS enrich_attempts INT DEFAULT 0;
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_competitor_pins_lookup ON competitor_pins(competitor_id, enrichment_status);
CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrich_attempts ON competitor_pins(competitor_id, enrichment_status, enrich_attempts, id);
CREATE INDEX IF NOT EXISTS idx_competitor_pins_claim_token ON competitor_pins(claim_token) WHERE claim_token IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. PinArchive Engine & Monotonic Metric Invariants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pa_pins (
  pin_id VARCHAR(64) PRIMARY KEY,
  account_username VARCHAR(128),
  title TEXT,
  description TEXT,
  link TEXT,
  domain VARCHAR(255),
  board_name VARCHAR(255),
  image_url TEXT,
  dominant_color VARCHAR(32),
  saves BIGINT DEFAULT 0,
  repins BIGINT DEFAULT 0,
  comments INT DEFAULT 0,
  share_count BIGINT DEFAULT 0,
  reactions JSONB DEFAULT '{}'::jsonb,
  velocity NUMERIC(10, 2) DEFAULT 0,
  annotations JSONB DEFAULT '[]'::jsonb,
  is_video BOOLEAN DEFAULT FALSE,
  is_product BOOLEAN DEFAULT FALSE,
  alt_text TEXT,
  created_at_pinterest TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;
CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);
CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);
CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);
CREATE INDEX IF NOT EXISTS idx_pa_pins_annotations_gin ON pa_pins USING gin(annotations);

CREATE TABLE IF NOT EXISTS pa_pin_metrics (
  id BIGSERIAL PRIMARY KEY,
  pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  saves BIGINT DEFAULT 0,
  repins BIGINT DEFAULT 0,
  comments INT DEFAULT 0,
  UNIQUE(pin_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS idx_pa_pin_metrics_lookup ON pa_pin_metrics(pin_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS pa_staged_pins (
  id SERIAL PRIMARY KEY,
  pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
  target_board VARCHAR(255),
  override_link TEXT,
  status VARCHAR(32) DEFAULT 'staged',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pa_staged_pins_status ON pa_staged_pins(status);

CREATE TABLE IF NOT EXISTS pa_qualification_rules (
  id SERIAL PRIMARY KEY,
  tier1_min_saves INT DEFAULT 100,
  tier2_min_repins INT DEFAULT 100,
  tier3_max_age_days INT DEFAULT 7,
  tier3_min_saves INT DEFAULT 50,
  master_ingest_enabled BOOLEAN DEFAULT TRUE,
  early_stop_pages INT DEFAULT 3,
  max_batch_pins INT DEFAULT 50,
  discovery_max_pages INT DEFAULT 1000,
  refresh_max_pins INT DEFAULT 100,
  paused_policy VARCHAR(32) DEFAULT 'reject',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monotonic Metrics Invariant Trigger (Crucial: prevents saves drops on Pinterest glitches)
CREATE OR REPLACE FUNCTION trg_enforce_monotonic_metrics()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.saves := GREATEST(COALESCE(OLD.saves, 0), COALESCE(NEW.saves, 0));
    NEW.repins := GREATEST(COALESCE(OLD.repins, 0), COALESCE(NEW.repins, 0));
    NEW.comments := GREATEST(COALESCE(OLD.comments, 0), COALESCE(NEW.comments, 0));
    NEW.share_count := GREATEST(COALESCE(OLD.share_count, 0), COALESCE(NEW.share_count, 0));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_pa_pins_enforce_monotonic_metrics()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.saves := GREATEST(COALESCE(OLD.saves, 0), COALESCE(NEW.saves, 0));
    NEW.repins := GREATEST(COALESCE(OLD.repins, 0), COALESCE(NEW.repins, 0));
    NEW.comments := GREATEST(COALESCE(OLD.comments, 0), COALESCE(NEW.comments, 0));
    NEW.share_count := GREATEST(COALESCE(OLD.share_count, 0), COALESCE(NEW.share_count, 0));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pa_pins_monotonic ON pa_pins;
CREATE TRIGGER trg_pa_pins_monotonic
  BEFORE UPDATE ON pa_pins
  FOR EACH ROW EXECUTE FUNCTION trg_enforce_monotonic_metrics();

-- Topic Clusters Lateral Aggregation Function
CREATE OR REPLACE FUNCTION pa_topic_clusters_page(
  p_min_pins INT DEFAULT 1,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  topic_name TEXT,
  pins_count BIGINT,
  total_saves NUMERIC,
  avg_saves BIGINT,
  avg_velocity NUMERIC
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH extracted AS (
    SELECT
      CASE
        WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
        WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
        ELSE NULL
      END AS raw_topic,
      p.pin_id,
      p.saves,
      p.velocity
    FROM pa_pins p,
    LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann
    WHERE (
        (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
        OR
        (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
      )
  ),
  aggregated AS (
    SELECT
      e.raw_topic AS t_name,
      count(DISTINCT e.pin_id)::BIGINT AS p_count,
      coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
      CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
      round(avg(e.velocity), 2) AS a_velocity
    FROM extracted e
    WHERE (p_search IS NULL OR p_search = '' OR e.raw_topic ILIKE '%' || p_search || '%')
    GROUP BY e.raw_topic
    HAVING count(DISTINCT e.pin_id) >= coalesce(p_min_pins, 1)
  )
  SELECT
    a.t_name AS topic_name,
    a.p_count AS pins_count,
    a.s_saves AS total_saves,
    a.a_saves AS avg_saves,
    a.a_velocity AS avg_velocity
  FROM aggregated a
  ORDER BY a.s_saves DESC
  LIMIT coalesce(p_limit, 50)
  OFFSET coalesce(p_offset, 0);
END;
$$;

-- Unified Interoperability Views
CREATE OR REPLACE VIEW creator_profiles AS SELECT * FROM competitor_profiles;
CREATE OR REPLACE VIEW creator_boards AS SELECT * FROM competitor_boards;
CREATE OR REPLACE VIEW pin_metrics_snapshots AS SELECT * FROM pa_pin_metrics;

-- Competitor Lateral Functions
CREATE OR REPLACE FUNCTION get_competitor_board_counts()
RETURNS TABLE (competitor_id INT, board_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT competitor_id, count(*)::BIGINT FROM competitor_boards GROUP BY competitor_id;
$$;

CREATE OR REPLACE FUNCTION get_latest_competitor_snapshots(p_competitor_ids INT[])
RETURNS TABLE (
  competitor_id INT,
  monthly_reach BIGINT,
  profile_views BIGINT,
  follower_count INT,
  total_pins INT,
  total_boards INT,
  recorded_date DATE
)
LANGUAGE sql STABLE AS $$
  SELECT s.competitor_id, s.monthly_reach, s.profile_views, s.follower_count, s.total_pins, s.total_boards, s.recorded_date
  FROM unnest(p_competitor_ids) AS cid
  CROSS JOIN LATERAL (
    SELECT chs.competitor_id, chs.monthly_reach, chs.profile_views, chs.follower_count, chs.total_pins, chs.total_boards, chs.recorded_date
    FROM competitor_history_snapshots chs
    WHERE chs.competitor_id = cid
    ORDER BY chs.recorded_date DESC
    LIMIT 2
  ) s;
$$;

-- ------------------------------------------------------------------------------
-- 4. Crawler Distributed Coordination & Heartbeats
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crawler_shard_heartbeats (
  competitor_id INT NOT NULL,
  shard_number INT NOT NULL,
  shard_total INT NOT NULL DEFAULT 20,
  status VARCHAR(32) NOT NULL DEFAULT 'booting',
  discovered_count INT NOT NULL DEFAULT 0,
  enriched_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competitor_id, shard_number)
);
CREATE INDEX IF NOT EXISTS idx_crawler_shard_heartbeats_status 
  ON crawler_shard_heartbeats (competitor_id, status, updated_at);

-- ------------------------------------------------------------------------------
-- 5. Cluster Graph & Related Nodes Intelligence
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cluster_seeds (
  seed_pin_id VARCHAR(64) PRIMARY KEY,
  root_query TEXT,
  interest_name TEXT,
  dominant_color VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_graph_nodes (
  candidate_pin_id VARCHAR(64) PRIMARY KEY,
  seed_pin_id VARCHAR(64) REFERENCES cluster_seeds(seed_pin_id) ON DELETE CASCADE,
  recommendation_source VARCHAR(64),
  ranking_score NUMERIC,
  domain VARCHAR(255),
  is_product BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  saves BIGINT DEFAULT 0,
  repins BIGINT DEFAULT 0,
  title TEXT,
  description TEXT,
  image_url TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cgn_seed ON candidate_graph_nodes(seed_pin_id);
CREATE INDEX IF NOT EXISTS idx_cgn_saves ON candidate_graph_nodes(saves DESC);

CREATE TABLE IF NOT EXISTS cluster_arbitrage_metrics (
  id BIGSERIAL PRIMARY KEY,
  seed_pin_id VARCHAR(64) REFERENCES cluster_seeds(seed_pin_id) ON DELETE CASCADE,
  total_candidates INT,
  product_count INT DEFAULT 0,
  commercial_gap_ratio NUMERIC,
  winning_color_centroids JSONB,
  high_save_tokens JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seed_guided_search_capsules (
  id SERIAL PRIMARY KEY,
  seed_pin_id VARCHAR(64) NOT NULL,
  query_term TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  image_url TEXT,
  search_url TEXT,
  node_id TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_seed_pins (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  image_url TEXT,
  board_name VARCHAR(255),
  save_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  UNIQUE (competitor_id, pin_id)
);
CREATE INDEX IF NOT EXISTS idx_csp_comp_pin ON competitor_seed_pins(competitor_id, pin_id);
CREATE INDEX IF NOT EXISTS idx_csp_comp_id ON competitor_seed_pins(competitor_id);

CREATE TABLE IF NOT EXISTS competitor_related_nodes (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  seed_pin_id VARCHAR(64) NOT NULL,
  candidate_pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  image_url TEXT,
  dominant_color VARCHAR(32),
  saves INT DEFAULT 0,
  repins INT DEFAULT 0,
  domain TEXT,
  destination_url TEXT,
  is_product BOOLEAN DEFAULT FALSE,
  is_same_account BOOLEAN DEFAULT FALSE,
  creator_username VARCHAR(100),
  creator_name VARCHAR(255),
  provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, seed_pin_id, candidate_pin_id)
);

ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS dominant_color VARCHAR(32);
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS saves INT DEFAULT 0;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS repins INT DEFAULT 0;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS destination_url TEXT;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS is_same_account BOOLEAN DEFAULT FALSE;
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS creator_username VARCHAR(100);
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS creator_name VARCHAR(255);
ALTER TABLE competitor_related_nodes ADD COLUMN IF NOT EXISTS provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER';

CREATE INDEX IF NOT EXISTS idx_crn_comp_candidate ON competitor_related_nodes(competitor_id, candidate_pin_id);
CREATE INDEX IF NOT EXISTS idx_crn_comp_seed ON competitor_related_nodes(competitor_id, seed_pin_id);
CREATE INDEX IF NOT EXISTS idx_crn_comp_retention ON competitor_related_nodes(competitor_id, is_same_account);

-- ------------------------------------------------------------------------------
-- 6. Keyword Intelligence & Velocity Matrix
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) DEFAULT 'General',
  target_pin_count INT DEFAULT 50,
  refresh_interval_hours INT DEFAULT 24,
  last_crawled_at TIMESTAMPTZ,
  top_pin_id VARCHAR(255),
  top_pin_title TEXT,
  top_pin_image TEXT,
  avg_daily_velocity NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tracked_keywords ALTER COLUMN top_pin_id TYPE VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);

CREATE TABLE IF NOT EXISTS keyword_pins_snapshots (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(255) NOT NULL,
  rank_position INT DEFAULT 1,
  title TEXT,
  domain VARCHAR(255),
  destination_url TEXT,
  image_url TEXT,
  save_count INT DEFAULT 0,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  daily_save_velocity INT DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, pin_id, snapshot_date)
);
ALTER TABLE keyword_pins_snapshots ALTER COLUMN pin_id TYPE VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_keyword_pins_lookup ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_pins_velocity ON keyword_pins_snapshots(daily_save_velocity DESC);

CREATE TABLE IF NOT EXISTS keyword_guided_capsules (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  display_label TEXT NOT NULL,
  score NUMERIC(12, 4) DEFAULT 0.0,
  dominant_color VARCHAR(64),
  display_order INT DEFAULT 0,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, term)
);
CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw ON keyword_guided_capsules(keyword_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score ON keyword_guided_capsules(keyword_id, score DESC);

-- ------------------------------------------------------------------------------
-- 7. Board Ideas Radar & Sharded TTL Visual Lens Cache (Migration 011)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracked_boards (
  id SERIAL PRIMARY KEY,
  board_id VARCHAR(255) UNIQUE NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  username VARCHAR(255),
  competitor_id INT REFERENCES competitor_profiles(id) ON DELETE SET NULL,
  total_pins INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  track_daily BOOLEAN DEFAULT TRUE,
  assigned_shard_id INT,
  last_scanned_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracked_boards_username ON tracked_boards(username);
CREATE INDEX IF NOT EXISTS idx_tracked_boards_competitor ON tracked_boards(competitor_id);
CREATE INDEX IF NOT EXISTS idx_tracked_boards_active ON tracked_boards(is_active, last_scanned_at ASC NULLS FIRST);

CREATE TABLE IF NOT EXISTS board_idea_snapshots (
  id BIGSERIAL PRIMARY KEY,
  board_id VARCHAR(255) NOT NULL REFERENCES tracked_boards(board_id) ON DELETE CASCADE,
  pin_id VARCHAR(255) NOT NULL,
  title TEXT,
  image_url TEXT,
  domain VARCHAR(255),
  destination_url TEXT,
  save_count BIGINT DEFAULT 0,
  repin_count INT DEFAULT 0,
  daily_save_velocity NUMERIC DEFAULT 0,
  recommendation_rank INT DEFAULT 1,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_board_idea_pin_date UNIQUE (board_id, pin_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_board_ideas_lookup ON board_idea_snapshots(board_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_board_ideas_pin_id ON board_idea_snapshots(pin_id);
CREATE INDEX IF NOT EXISTS idx_board_ideas_velocity ON board_idea_snapshots(board_id, daily_save_velocity DESC);

-- Eliminates In-Memory RAM Caching for Visual Search Lens
CREATE TABLE IF NOT EXISTS pin_visual_search_cache (
  pin_id VARCHAR(255) PRIMARY KEY,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX IF NOT EXISTS idx_pvsc_expires ON pin_visual_search_cache(expires_at);

-- ------------------------------------------------------------------------------
-- 8. Register Migration Version in schema_migrations
-- ------------------------------------------------------------------------------
INSERT INTO schema_migrations (version, name, applied_at)
VALUES 
  ('001', 'core_registry', NOW()),
  ('002', 'competitor_intelligence', NOW()),
  ('003', 'keyword_velocity', NOW()),
  ('004', 'competitor_boards', NOW()),
  ('005', 'pinarchive_engine', NOW()),
  ('006', 'pin_qualification_rules', NOW()),
  ('007', 'cluster_graph_intelligence', NOW()),
  ('008', 'unified_p2_p4_master', NOW()),
  ('009_heartbeats', 'crawler_shard_heartbeats', NOW()),
  ('009_capsules', 'keyword_guided_capsules', NOW()),
  ('010', 'enrich_attempts_and_indexes', NOW()),
  ('011', 'universal_fleet_parity', NOW())
ON CONFLICT (version) DO UPDATE SET 
  applied_at = NOW();
