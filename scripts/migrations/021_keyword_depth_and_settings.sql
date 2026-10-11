-- Migration 021: Keyword Depth and Settings Architecture
-- Creates app_settings table and enhances tracked_keywords with crawl_pages_limit & inspection_mode

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(128) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default keyword crawl settings if not present
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'keyword_crawl_settings',
  '{
    "default_crawl_pages": 10,
    "default_max_pins": 250,
    "default_inspection_mode": "smart_breakout",
    "breakout_rules": {
      "max_pin_age_days": 14,
      "min_daily_save_velocity": 3.0,
      "min_repins": 1,
      "target_rank_zone": [20, 400]
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Enhance tracked_keywords with dynamic depth and inspection mode columns
ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_pages_limit INT DEFAULT 10;
ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS inspection_mode VARCHAR(64) DEFAULT 'smart_breakout';

-- Backfill existing tracked_keywords
UPDATE tracked_keywords 
SET crawl_pages_limit = 10 
WHERE crawl_pages_limit IS NULL;

UPDATE tracked_keywords 
SET inspection_mode = 'smart_breakout' 
WHERE inspection_mode IS NULL OR inspection_mode = '';

-- Elevate default target_pin_count from 100 to 250 (10 pages)
UPDATE tracked_keywords 
SET target_pin_count = 250 
WHERE target_pin_count <= 100;
