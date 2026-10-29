-- Upgrade edge_campaign_folders with unique_pins_count
ALTER TABLE edge_campaign_folders ADD COLUMN unique_pins_count INTEGER DEFAULT 0;

-- Upgrade edge_pins_metadata with missing metadata column (Fixes Landmine LND-8)
ALTER TABLE edge_pins_metadata ADD COLUMN metadata TEXT DEFAULT '{}';
