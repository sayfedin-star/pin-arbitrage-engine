-- ============================================================================
-- Migration 0002: Cloudflare D1 Edge Pins Metadata & SERP Cache
-- Target: Cloudflare D1 SQLite Edge Database (PIN_D1_DB / pin-engine-edge)
-- Description:
--   Eliminates 80-shard Scatter-Gather HTTP storms during Displaced Vault &
--   SERP Comparison hydration by serving creative pin metadata directly from
--   Cloudflare D1 SQLite at the edge in < 3ms.
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_pins_metadata (
  pin_id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  destination_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  creator_username TEXT DEFAULT '',
  board_name TEXT DEFAULT '',
  dominant_color TEXT DEFAULT '#888888',
  visual_annotations TEXT DEFAULT '[]',
  seo_alt_text TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at_pinterest TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edge_pins_domain
  ON edge_pins_metadata(domain);

CREATE INDEX IF NOT EXISTS idx_edge_pins_updated
  ON edge_pins_metadata(updated_at DESC);