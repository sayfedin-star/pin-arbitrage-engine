-- Migration 032: Add metadata JSONB column and GIN index to universal_master_pins
-- Target: Central Metadata Hub & 99 Neon Fleet Shards
-- Solves: Stage 1B Shard Master write failure & Missing 48 Algorithmic Treasures

ALTER TABLE universal_master_pins 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ump_metadata_gin 
  ON universal_master_pins USING gin (metadata);
