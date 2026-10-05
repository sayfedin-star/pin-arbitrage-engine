-- ============================================================================
-- Migration 009: Keyword Guided Search Capsules
-- Stores semantic capsules (modifiers) discovered from Pinterest SERP (rankedGuides)
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw 
    ON keyword_guided_capsules(keyword_id, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score 
    ON keyword_guided_capsules(keyword_id, score DESC);
