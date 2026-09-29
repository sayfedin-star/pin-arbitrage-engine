-- ============================================================================
-- Migration 002: Competitor Intelligence Engine
-- Real-time tracking of competitor profiles, reach velocity, boards,
-- and harvested pin catalogs.
-- ============================================================================

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
    account_type VARCHAR(32) DEFAULT 'competitor', -- own | competitor | hidden
    activity_status VARCHAR(64) DEFAULT 'active',
    last_synced_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'::jsonb, -- Future proof slot
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(competitor_id, recorded_date)
);

CREATE TABLE IF NOT EXISTS competitor_pins (
    id BIGSERIAL PRIMARY KEY,
    competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
    pin_id VARCHAR(64) NOT NULL,
    title TEXT,
    description TEXT,
    link_domain VARCHAR(255),
    destination_url TEXT,
    board_name VARCHAR(255),
    image_url TEXT,
    save_count INT DEFAULT 0,
    repin_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_at_pinterest TIMESTAMP WITH TIME ZONE,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(competitor_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type ON competitor_profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_reach ON competitor_profiles(monthly_reach DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_id ON competitor_pins(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_pins_pin_id ON competitor_pins(pin_id);
CREATE INDEX IF NOT EXISTS idx_competitor_history_date ON competitor_history_snapshots(competitor_id, recorded_date DESC);
