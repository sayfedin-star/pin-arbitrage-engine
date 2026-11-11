-- Migration 038: Deterministic CRC32 Shard ID for pa_pins and competitor_pins
-- [INVARIANT: DETERMINISTIC-CRC32-SHARDING] Add stored generated shard_id column
-- Eliminates 95% of Neon network transfer by enabling SQL-level shard pushdown

ALTER TABLE pa_pins 
ADD COLUMN IF NOT EXISTS shard_id SMALLINT 
GENERATED ALWAYS AS (pae_crc32_shard_id(pin_id, 99)) STORED;

CREATE INDEX IF NOT EXISTS idx_pa_pins_shard_id 
ON pa_pins (shard_id);

ALTER TABLE competitor_pins 
ADD COLUMN IF NOT EXISTS shard_id SMALLINT 
GENERATED ALWAYS AS (pae_crc32_shard_id(pin_id, 99)) STORED;

CREATE INDEX IF NOT EXISTS idx_competitor_pins_shard_id 
ON competitor_pins (shard_id);
