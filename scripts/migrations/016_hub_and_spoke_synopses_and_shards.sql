-- ============================================================================
-- Migration 016: Holistic 4-Pillar Hub-and-Spoke 99-Shard Topologies
-- Author: Principal Distributed Systems Architect & Data Modeler
-- Target: Neon Serverless Postgres (Central Hub & Fleet Storage Shards)
-- ============================================================================

SET lock_timeout = '3000';

-- ============================================================================
-- SECTION A: Central Metadata Hub (DATABASE_URL) — Fast Relational Core (< 35 MB)
-- ============================================================================

-- 1. Keyword Folder Rollup Synopses (Pillar 2: Keywords & Crossover)
-- Pre-aggregates crossover super-pins, visual tag bridges, and topic cluster blueprints.
-- Enables < 15ms page loads for Crossover Matrix without cross-shard joins or scatter-gather.
CREATE TABLE IF NOT EXISTS keyword_folder_synopses (
    id SERIAL PRIMARY KEY,
    folder_id INT NOT NULL UNIQUE REFERENCES keyword_folders(id) ON DELETE CASCADE,
    synopsis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_keywords INT NOT NULL DEFAULT 0,
    super_pins_count INT NOT NULL DEFAULT 0,
    universal_tags_count INT NOT NULL DEFAULT 0,
    shared_pivots_count INT NOT NULL DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kfs_folder_id ON keyword_folder_synopses(folder_id);
CREATE INDEX IF NOT EXISTS idx_kfs_updated_at ON keyword_folder_synopses(updated_at DESC);

-- 2. High-Speed Active SERP Cache (Top 100 Live Pins per Keyword)
-- Serves instant SERP views from the Hub (< 15 MB total volume) without querying the 99 shards.
CREATE TABLE IF NOT EXISTS keyword_serp_current (
    id BIGSERIAL PRIMARY KEY,
    keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
    pin_id VARCHAR(255) NOT NULL,
    rank_position INT NOT NULL,
    title TEXT,
    domain VARCHAR(255),
    destination_url TEXT,
    image_url TEXT,
    creator_username VARCHAR(128),
    board_name TEXT,
    save_count INT DEFAULT 0,
    repin_count INT DEFAULT 0,
    daily_save_velocity NUMERIC(10,2) DEFAULT 0,
    dominant_color VARCHAR(32) DEFAULT '#888888',
    visual_annotations JSONB DEFAULT '[]'::jsonb,
    crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(keyword_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_ksc_keyword_rank ON keyword_serp_current(keyword_id, rank_position ASC);
CREATE INDEX IF NOT EXISTS idx_ksc_pin_id ON keyword_serp_current(pin_id);

-- ============================================================================
-- SECTION B: 99 Storage Shards DDL (Partitioned strictly by CRC32(pin_id) % 99 + 1)
-- ============================================================================

-- 3. Universal Master Pins (Cross-Pillar Deduplicated Creative Asset Registry)
-- Holds heavy static metadata once per pin across all 4 pillars.
CREATE TABLE IF NOT EXISTS universal_master_pins (
    pin_id VARCHAR(255) PRIMARY KEY,
    creator_username VARCHAR(128),
    board_id VARCHAR(64),
    board_name TEXT,
    board_slug TEXT,
    title TEXT,
    domain VARCHAR(255),
    destination_url TEXT,
    image_url TEXT,
    description TEXT,
    alt_text TEXT,
    dominant_color VARCHAR(32) DEFAULT '#888888',
    visual_annotations JSONB DEFAULT '[]'::jsonb,
    created_at_pinterest TIMESTAMP WITH TIME ZONE,
    first_discovered_pillar VARCHAR(32) DEFAULT 'keyword', -- 'creator' | 'keyword' | 'related' | 'board_idea'
    first_discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ump_domain ON universal_master_pins(domain);
CREATE INDEX IF NOT EXISTS idx_ump_creator ON universal_master_pins(creator_username);
CREATE INDEX IF NOT EXISTS idx_ump_updated ON universal_master_pins(updated_at DESC);

-- Backward-Compatibility Alias View for Legacy Services
CREATE OR REPLACE VIEW keyword_master_pins AS SELECT * FROM universal_master_pins;

-- 4. Unified Daily Time-Series Snapshots (Cross-Pillar Metrics History)
CREATE TABLE IF NOT EXISTS pins_daily_snapshots (
    id BIGSERIAL PRIMARY KEY,
    pin_id VARCHAR(255) NOT NULL,
    keyword_id INT,
    competitor_id INT,
    board_id VARCHAR(64),
    rank_position INT,
    save_count INT DEFAULT 0,
    repin_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    share_count INT DEFAULT 0,
    reaction_count INT DEFAULT 0,
    daily_save_velocity NUMERIC(10,2) DEFAULT 0,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_displaced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pds_pin_date ON pins_daily_snapshots(pin_id, snapshot_date ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pds_keyword_date ON pins_daily_snapshots(keyword_id, snapshot_date DESC) WHERE keyword_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pds_competitor ON pins_daily_snapshots(competitor_id, snapshot_date DESC) WHERE competitor_id IS NOT NULL;

-- 5. Related Pins Directed Graph Edges (Pillar 3: Recommendation Radar)
CREATE TABLE IF NOT EXISTS pin_related_edges (
    source_pin_id VARCHAR(255) NOT NULL,
    target_pin_id VARCHAR(255) NOT NULL,
    edge_type VARCHAR(32) DEFAULT 'related_recommendation', -- 'related_recommendation' | 'visual_lens' | 'board_cooccurrence'
    display_order INT DEFAULT 0,
    similarity_score NUMERIC(5,2) DEFAULT 0,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (source_pin_id, target_pin_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_pre_target ON pin_related_edges(target_pin_id);

-- ============================================================================
-- SECTION C: Register Migration 016
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('016', 'holistic_4_pillar_hub_and_spoke_shards', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
