-- Migration 041: Composite Shard Indexes for Zero-Sort Fleet Queries
-- [INVARIANT: SHARD-AFFINE-COMPOSITE-INDEXES]

CREATE INDEX IF NOT EXISTS idx_pa_pins_shard_saves_desc
  ON pa_pins (shard_id, saves DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_competitor_pins_comp_shard_id_asc
  ON competitor_pins (competitor_id, shard_id, id ASC);
