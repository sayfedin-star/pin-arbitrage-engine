-- ============================================================================
-- Migration 012: Keyword Folders & Algorithmic Crossover Engine
-- Provides hierarchical organization for target search terms, topic clustering,
-- and multi-dimensional crossover analysis (super-pins, shared pivots, universal tag bridges).
-- ============================================================================

CREATE TABLE IF NOT EXISTS keyword_folders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    color VARCHAR(64) DEFAULT '#ec4899',
    icon VARCHAR(64) DEFAULT 'folder',
    project_id VARCHAR(64) DEFAULT 'default',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keyword_folder_items (
    id BIGSERIAL PRIMARY KEY,
    folder_id INT NOT NULL REFERENCES keyword_folders(id) ON DELETE CASCADE,
    keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
    notes TEXT DEFAULT '',
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(folder_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_kw_folders_name ON keyword_folders(name);
CREATE INDEX IF NOT EXISTS idx_kw_folders_created ON keyword_folders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kw_folder_items_folder ON keyword_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_kw_folder_items_keyword ON keyword_folder_items(keyword_id);
