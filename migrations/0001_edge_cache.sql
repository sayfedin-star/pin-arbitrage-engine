-- Fast autocomplete index for UI search bar
CREATE TABLE IF NOT EXISTS search_autocomplete_index (
  keyword TEXT PRIMARY KEY,
  search_volume INTEGER DEFAULT 0,
  monthly_growth REAL DEFAULT 0,
  pin_count INTEGER DEFAULT 0,
  last_synced_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_search_autocomplete_kw ON search_autocomplete_index(keyword);

-- UI Campaign Folders (Sub-5ms Edge Reads)
CREATE TABLE IF NOT EXISTS edge_campaign_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#e60023',
  description TEXT,
  item_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- UI Keywords Fleet Dashboard (Sub-5ms Edge Reads)
CREATE TABLE IF NOT EXISTS edge_keywords_catalog (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  target_pin_count INTEGER DEFAULT 50,
  refresh_interval_hours INTEGER DEFAULT 24,
  last_crawled_at TEXT,
  top_pin_id TEXT,
  top_pin_title TEXT,
  top_pin_image TEXT,
  avg_daily_velocity REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tags TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  crawl_pages_limit INTEGER DEFAULT 2,
  inspection_mode TEXT DEFAULT 'full_catalog',
  canonical_keyword TEXT,
  snapshots_count INTEGER DEFAULT 0,
  total_pins_count INTEGER DEFAULT 0,
  folders TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_edge_keywords_kw ON edge_keywords_catalog(keyword);
CREATE INDEX IF NOT EXISTS idx_edge_keywords_created ON edge_keywords_catalog(created_at DESC);

