-- Migration 022: Set default inspection mode to full_catalog and target_pin_count to 250
-- Ensures all tracked keywords undergo full catalog deep scan and 250 pin depth

ALTER TABLE tracked_keywords ALTER COLUMN target_pin_count SET DEFAULT 250;
ALTER TABLE tracked_keywords ALTER COLUMN crawl_pages_limit SET DEFAULT 10;
ALTER TABLE tracked_keywords ALTER COLUMN inspection_mode SET DEFAULT 'full_catalog';

UPDATE tracked_keywords 
SET target_pin_count = 250, 
    crawl_pages_limit = 10, 
    inspection_mode = 'full_catalog'
WHERE target_pin_count < 250 
   OR crawl_pages_limit < 10 
   OR inspection_mode != 'full_catalog';
