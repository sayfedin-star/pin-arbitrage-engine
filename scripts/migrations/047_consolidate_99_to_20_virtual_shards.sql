-- ====================================================================================================
-- Pin Arbitrage Engine (PAE) — Migration 047
-- File: scripts/migrations/047_consolidate_99_to_20_virtual_shards.sql
-- Purpose: Consolidate 99 virtual shards across 20 physical projects (pin-arbitrage-shard-01..20),
--          retire legacy projects 21..99, and enforce fillfactor = 80 on physical shard tables.
--
-- Invariants:
-- // [INVARIANT: 20-PHYSICAL-SHARD-CONSOLIDATION]
-- // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
-- // [INVARIANT: 100-PERCENT-HOT-UPDATES]
-- // [INVARIANT: ZERO-HUB-SNAPSHOTS]
-- ====================================================================================================

-- ----------------------------------------------------------------------------------------------------
-- SECTION 1: MASTER HUB TOPOLOGY CONSOLIDATION (neon_projects_registry)
-- ----------------------------------------------------------------------------------------------------

DO $$
DECLARE
  p INT;
  assigned INT[];
  v INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neon_projects_registry') THEN
    -- Assign virtual shards {p, p+20, p+40, p+60, p+80} to each physical shard 1..20
    FOR p IN 1..20 LOOP
      assigned := ARRAY[]::INT[];
      v := p;
      WHILE v <= 99 LOOP
        assigned := array_append(assigned, v);
        v := v + 20;
      END LOOP;

      UPDATE neon_projects_registry
      SET
        assigned_shards = assigned,
        status = 'active',
        updated_at = NOW()
      WHERE project_name = 'pin-arbitrage-shard-' || LPAD(p::text, 2, '0');
    END LOOP;

    -- Decommission / retire legacy shard rows 21..99 in registry
    UPDATE neon_projects_registry
    SET
      status = 'retired',
      updated_at = NOW()
    WHERE project_name ~ '^pin-arbitrage-shard-(2[1-9]|[3-9][0-9])$';

    -- Record consolidation event in metadata
    UPDATE neon_projects_registry
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"consolidated_to_20": true, "virtual_shards": 99, "consolidated_at": "2026-11-01"}'::jsonb
    WHERE is_hub = TRUE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------------------------------
-- SECTION 2: PHYSICAL SHARD STORAGE DDL & HOT FILLFACTOR HARDENING (Physical Shards 1–20)
-- ----------------------------------------------------------------------------------------------------

-- Enforce fillfactor = 80 on physical shard snapshot and metric tables for same-day HOT update headroom
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pins_daily_metrics') THEN
    ALTER TABLE pins_daily_metrics SET (fillfactor = 80);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pin_serp_positions') THEN
    ALTER TABLE pin_serp_positions SET (fillfactor = 80);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'universal_master_pins') THEN
    ALTER TABLE universal_master_pins SET (fillfactor = 80);
  END IF;
END $$;

-- Verify canonical composite indexes exist on physical shards
CREATE INDEX IF NOT EXISTS idx_psp_kw_date 
  ON pin_serp_positions (keyword_id, snapshot_date DESC);

-- Canonical backward-compatibility views
CREATE OR REPLACE VIEW keyword_master_pins AS 
  SELECT * FROM universal_master_pins;

CREATE OR REPLACE VIEW pins_daily_snapshots AS
SELECT 
  (('x' || SUBSTR(MD5(m.pin_id || '_' || m.snapshot_date::text || '_' || COALESCE(p.keyword_id::text, '0')), 1, 15))::bit(60)::bigint) AS id,
  m.pin_id,
  p.keyword_id,
  NULL::int AS competitor_id,
  p.rank_position,
  COALESCE(p.is_displaced, FALSE) AS is_displaced,
  p.last_known_rank,
  m.save_count,
  m.repin_count,
  m.comment_count,
  m.share_count,
  COALESCE(m.reaction_count, 0) AS reaction_count,
  m.daily_save_velocity,
  m.snapshot_date,
  m.updated_at AS created_at
FROM pins_daily_metrics m
LEFT JOIN pin_serp_positions p 
  ON p.pin_id = m.pin_id AND p.snapshot_date = m.snapshot_date;

-- Register Migration 047 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('047', '047_consolidate_99_to_20_virtual_shards', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
