-- ============================================================================
-- Migration 013: Keyword Displaced Vault, Popular Pins & Single Unified Timeline
-- Author: Antigravity Engine Architecture
-- Target: Neon Serverless Postgres (Master Hub & Fleet Shards)
-- ============================================================================

-- 1. Upgrade keyword_pins_snapshots to support Single Unified Timeline
ALTER TABLE keyword_pins_snapshots 
ADD COLUMN IF NOT EXISTS is_displaced BOOLEAN DEFAULT FALSE;

ALTER TABLE keyword_pins_snapshots 
ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;

ALTER TABLE keyword_pins_snapshots 
ADD COLUMN IF NOT EXISTS reaction_count INT DEFAULT 0;

ALTER TABLE keyword_pins_snapshots 
ALTER COLUMN pin_id TYPE VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_kps_displaced_lookup 
ON keyword_pins_snapshots(keyword_id, pin_id, snapshot_date ASC);

CREATE INDEX IF NOT EXISTS idx_kps_active_serp 
ON keyword_pins_snapshots(keyword_id, snapshot_date DESC) 
WHERE is_displaced IS FALSE;

-- 2. Upgrade tracked_keywords to cache popular feed pins
ALTER TABLE tracked_keywords 
ADD COLUMN IF NOT EXISTS popular_pins JSONB DEFAULT '[]'::jsonb;

-- 3. Create keyword_displaced_pins (Persistent Displaced Vault Registry)
CREATE TABLE IF NOT EXISTS keyword_displaced_pins (
    id BIGSERIAL PRIMARY KEY,
    keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
    pin_id VARCHAR(255) NOT NULL,
    title TEXT,
    domain VARCHAR(255),
    destination_url TEXT,
    image_url TEXT,
    board_id VARCHAR(64),
    board_name TEXT,
    account_username VARCHAR(128),
    last_known_rank INT NOT NULL,
    displaced_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Live cumulative metrics
    current_saves BIGINT DEFAULT 0,
    current_repins BIGINT DEFAULT 0,
    current_comments INT DEFAULT 0,
    current_shares INT DEFAULT 0,
    current_reactions INT DEFAULT 0,
    
    -- Growth Pace / Deltas
    delta_saves_24h BIGINT DEFAULT 0,
    delta_repins_24h BIGINT DEFAULT 0,
    delta_saves_3d BIGINT DEFAULT 0,
    delta_repins_3d BIGINT DEFAULT 0,
    delta_saves_7d BIGINT DEFAULT 0,
    delta_repins_7d BIGINT DEFAULT 0,
    daily_save_velocity NUMERIC(10,2) DEFAULT 0,
    
    -- SEO and Pinterest Algorithmic Metadata
    seo_alt_text TEXT,
    dominant_color VARCHAR(32),
    image_signature VARCHAR(128),
    created_at_pinterest TIMESTAMP WITH TIME ZONE,
    first_pulled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Arbitrage vacuum evaluation
    vacuum_opportunity_score INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'displaced_active',
    
    -- Deep annotations & taxonomy
    annotations JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(keyword_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_kdp_keyword_status ON keyword_displaced_pins(keyword_id, status);
CREATE INDEX IF NOT EXISTS idx_kdp_velocity ON keyword_displaced_pins(daily_save_velocity DESC);
CREATE INDEX IF NOT EXISTS idx_kdp_vacuum ON keyword_displaced_pins(vacuum_opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_kdp_displaced_date ON keyword_displaced_pins(displaced_date DESC);
