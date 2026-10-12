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
