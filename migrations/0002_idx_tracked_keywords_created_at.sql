-- Migration 0002: Index tracked_keywords(created_at DESC) for high-speed executive pagination
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_created_at ON tracked_keywords(created_at DESC);
