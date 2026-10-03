-- ==============================================================================
-- 007_cluster_graph_intelligence.sql
-- Migration: Algorithmic Cluster Seeds, Candidate Graph Nodes & Arbitrage Metrics
-- ==============================================================================

-- 1. Cluster Seeds (Phase 1 Core Seeds)
CREATE TABLE IF NOT EXISTS cluster_seeds (
    pin_id VARCHAR(64) PRIMARY KEY,
    label VARCHAR(255),
    is_competitor BOOLEAN DEFAULT FALSE,
    velocity NUMERIC DEFAULT 0,
    last_crawled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cluster_seeds_velocity ON cluster_seeds(velocity DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_seeds_crawled ON cluster_seeds(last_crawled_at NULLS FIRST);

-- 2. Candidate Graph Nodes (Phase 1 P2P Graph)
CREATE TABLE IF NOT EXISTS candidate_graph_nodes (
    id BIGSERIAL PRIMARY KEY,
    seed_pin_id VARCHAR(64),
    candidate_pin_id VARCHAR(64) NOT NULL,
    title TEXT,
    dominant_color VARCHAR(32) DEFAULT '#888888',
    aspect_ratio NUMERIC DEFAULT 0.56,
    saves BIGINT DEFAULT 0,
    repins BIGINT DEFAULT 0,
    save_rate NUMERIC DEFAULT 0,
    domain TEXT,
    is_product BOOLEAN DEFAULT FALSE,
    ocr_text TEXT,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    pin_created_at TIMESTAMPTZ,
    age_days NUMERIC DEFAULT 180,
    daily_velocity NUMERIC DEFAULT 0,
    provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
    individual_prod_score NUMERIC DEFAULT 0,
    recgpt_transition_score NUMERIC DEFAULT 0,
    sequence_role VARCHAR(64) DEFAULT 'DIRECT_MATCH',
    is_recgpt_candidate BOOLEAN DEFAULT FALSE,
    visual_entropy_score NUMERIC DEFAULT 0,
    image_url TEXT,
    is_video BOOLEAN DEFAULT FALSE,
    ingestion_method VARCHAR(64) DEFAULT 'uploaded',
    UNIQUE(seed_pin_id, candidate_pin_id)
);
CREATE INDEX IF NOT EXISTS idx_candidates_seed ON candidate_graph_nodes(seed_pin_id);
CREATE INDEX IF NOT EXISTS idx_candidates_saves ON candidate_graph_nodes(saves DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_velocity ON candidate_graph_nodes(daily_velocity DESC);

-- 3. Cluster Arbitrage Metrics (Phase 1 Telemetry)
CREATE TABLE IF NOT EXISTS cluster_arbitrage_metrics (
    id BIGSERIAL PRIMARY KEY,
    seed_pin_id VARCHAR(64) NOT NULL,
    total_candidates INT DEFAULT 0,
    recgpt_count INT DEFAULT 0,
    navboost_count INT DEFAULT 0,
    randomwalk_count INT DEFAULT 0,
    two_tower_count INT DEFAULT 0,
    fresh_candidate_count INT DEFAULT 0,
    product_count INT DEFAULT 0,
    commercial_gap_ratio NUMERIC DEFAULT 100,
    winning_color_centroids JSONB DEFAULT '[]'::jsonb,
    high_save_tokens JSONB DEFAULT '[]'::jsonb,
    utility_snapshot JSONB,
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_seed ON cluster_arbitrage_metrics(seed_pin_id, analyzed_at DESC);

-- 4. Guided Search Capsules
CREATE TABLE IF NOT EXISTS seed_guided_search_capsules (
    id BIGSERIAL PRIMARY KEY,
    seed_pin_id VARCHAR(64) NOT NULL,
    capsule_title TEXT NOT NULL,
    capsule_type VARCHAR(64) DEFAULT 'guided_search',
    query_param TEXT,
    display_order INT DEFAULT 0,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(seed_pin_id, capsule_title)
);
CREATE INDEX IF NOT EXISTS idx_capsules_seed ON seed_guided_search_capsules(seed_pin_id);
