-- ============================================================================
-- Migration 003: Keyword Velocity & SERP Tracker
-- Tracks search keywords, top-ranked pins, save counts, and daily velocity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracked_keywords (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    target_pin_count INT DEFAULT 50,
    refresh_interval_hours INT DEFAULT 24,
    last_crawled_at TIMESTAMP WITH TIME ZONE,
    top_pin_id VARCHAR(255),
    top_pin_title TEXT,
    top_pin_image TEXT,
    avg_daily_velocity NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'::jsonb, -- Future proof slot
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
    daily_save_velocity INT DEFAULT 0, -- Saves difference vs previous snapshot
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(keyword_id, pin_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_tracked_keywords_keyword ON tracked_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active ON tracked_keywords(is_active);
CREATE INDEX IF NOT EXISTS idx_keyword_pins_lookup ON keyword_pins_snapshots(keyword_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_pins_velocity ON keyword_pins_snapshots(daily_save_velocity DESC);
