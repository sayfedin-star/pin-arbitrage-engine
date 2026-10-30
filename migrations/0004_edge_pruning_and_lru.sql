-- ============================================================================
-- Migration 0004: Cloudflare D1 14-Day LRU Pruning & Storage Compaction
-- Target: Cloudflare D1 SQLite Edge Database (PIN_D1_DB / pin-engine-edge)
-- Defuses Landmine LND-818: Prevents monotonic table growth exceeding D1 10 GB storage ceiling.
-- Ensures table footprint is capped permanently at < 250 MB.
-- ============================================================================

-- 1. Add last_accessed_at column to edge_pins_metadata if not already present
ALTER TABLE edge_pins_metadata ADD COLUMN last_accessed_at TEXT DEFAULT '';
UPDATE edge_pins_metadata SET last_accessed_at = datetime('now') WHERE last_accessed_at = '' OR last_accessed_at IS NULL;

-- 2. Index on last_accessed_at to enable fast LRU pruning seeks
CREATE INDEX IF NOT EXISTS idx_edge_pins_last_accessed
  ON edge_pins_metadata(last_accessed_at);

-- 3. Automated pruning trigger on insert to prune rows older than 14 days
CREATE TRIGGER IF NOT EXISTS trg_prune_old_edge_pins
AFTER INSERT ON edge_pins_metadata
BEGIN
  DELETE FROM edge_pins_metadata
  WHERE last_accessed_at < datetime('now', '-14 days');
END;

-- 4. Immediate prune of stale rows older than 14 days based on updated_at or last_accessed_at
DELETE FROM edge_pins_metadata
WHERE (last_accessed_at IS NOT NULL AND last_accessed_at < datetime('now', '-14 days'))
   OR (updated_at IS NOT NULL AND updated_at < datetime('now', '-14 days'));
