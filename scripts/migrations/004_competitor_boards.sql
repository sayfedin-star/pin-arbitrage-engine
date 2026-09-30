-- ============================================================================
-- Migration 004: Competitor Boards Breakdown & Fast Lateral Snapshots
-- Project 2 (Competitor Intelligence) Integration for Neon Serverless Postgres
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_competitor_boards_comp_id 
    ON competitor_boards(competitor_id);

CREATE INDEX IF NOT EXISTS idx_competitor_boards_activity 
    ON competitor_boards(competitor_id, last_pinned_at DESC NULLS LAST);

-- 1. Fast RPC: Exact board counts per competitor in index-only scan
CREATE OR REPLACE FUNCTION get_competitor_board_counts()
RETURNS TABLE (
    competitor_id INT,
    board_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT competitor_id, count(*)::BIGINT
    FROM competitor_boards
    GROUP BY competitor_id;
$$;

-- 2. Fast RPC: Returns up to 2 latest snapshots per competitor using LATERAL subquery
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
LANGUAGE sql
STABLE
AS $$
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
