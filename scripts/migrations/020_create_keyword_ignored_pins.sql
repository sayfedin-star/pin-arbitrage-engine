-- Migration 020: Tombstone Architecture for Manually Deleted Pins
-- Prevents "Zombie Pin" resurrection/re-ingestion across all crawler routines.

CREATE TABLE IF NOT EXISTS keyword_ignored_pins (
    keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
    pin_id VARCHAR(64) NOT NULL,
    ignored_reason TEXT DEFAULT 'manual_user_deletion',
    ignored_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (keyword_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_kip_keyword_pin ON keyword_ignored_pins(keyword_id, pin_id);
