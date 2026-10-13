-- Migration 023: Performance & Trigram Indexes for Sub-15ms Queries
-- Accelerates leading-wildcard LIKE '%term%' searches and live SERP catalog lookups

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN Trigram indexes for fast pattern matching (LIKE '%...%' & ILIKE)
CREATE INDEX IF NOT EXISTS idx_tk_trgm_keyword 
ON tracked_keywords USING gin (LOWER(keyword) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cp_trgm_username 
ON competitor_profiles USING gin (LOWER(username) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cp_trgm_display_name 
ON competitor_profiles USING gin (LOWER(COALESCE(display_name, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tb_trgm_url 
ON tracked_boards USING gin (url gin_trgm_ops);

-- Composite covering index for fast live catalog lookups (Bottleneck 5 & 8)
CREATE INDEX IF NOT EXISTS idx_ksc_active_covering 
ON keyword_serp_current (keyword_id, is_displaced, rank_position);
