-- Migration 036: Shard-Affine Partitioning & Clean B-Tree Indexes
-- [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
-- [INVARIANT: ZERO-HUB-SNAPSHOTS]

CREATE OR REPLACE FUNCTION pae_crc32_shard_id(p_pin_id TEXT, p_shard_count INT DEFAULT 99)
RETURNS SMALLINT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_clean TEXT := LOWER(TRIM(COALESCE(p_pin_id, '')));
  v_bytes BYTEA;
  v_crc BIGINT := 4294967295;
  v_i INT;
  v_j INT;
BEGIN
  IF v_clean = '' THEN RETURN 1; END IF;
  v_bytes := convert_to(v_clean, 'UTF8');
  FOR v_i IN 0 .. (octet_length(v_bytes) - 1) LOOP
    v_crc := v_crc # get_byte(v_bytes, v_i);
    FOR v_j IN 1 .. 8 LOOP
      IF (v_crc & 1) = 1 THEN
        v_crc := (v_crc >> 1) # 3988292384;
      ELSE
        v_crc := v_crc >> 1;
      END IF;
    END LOOP;
  END LOOP;
  v_crc := (v_crc # 4294967295) & 4294967295;
  RETURN ((v_crc % p_shard_count) + 1)::SMALLINT;
END;
$$;

ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS shard_id SMALLINT;
ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS shard_id SMALLINT;

CREATE OR REPLACE FUNCTION trg_set_deterministic_pin_shard_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pin_id IS NULL OR TRIM(NEW.pin_id) = '' THEN
    NEW.shard_id := NULL;
  ELSIF NEW.shard_id IS NULL 
     OR TG_OP = 'INSERT' 
     OR (TG_OP = 'UPDATE' AND (OLD.pin_id IS DISTINCT FROM NEW.pin_id)) THEN
    NEW.shard_id := pae_crc32_shard_id(NEW.pin_id, 99);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ksc_ensure_shard_id ON keyword_serp_current;
CREATE TRIGGER trg_ksc_ensure_shard_id
  BEFORE INSERT OR UPDATE OF pin_id ON keyword_serp_current
  FOR EACH ROW EXECUTE FUNCTION trg_set_deterministic_pin_shard_id();

DROP TRIGGER IF EXISTS trg_kdi_ensure_shard_id ON keyword_displaced_index;
CREATE TRIGGER trg_kdi_ensure_shard_id
  BEFORE INSERT OR UPDATE OF pin_id ON keyword_displaced_index
  FOR EACH ROW EXECUTE FUNCTION trg_set_deterministic_pin_shard_id();

DROP INDEX IF EXISTS idx_cp_domain_rollup_covering;
DROP TRIGGER IF EXISTS trg_pa_pin_metrics_monotonic ON pa_pin_metrics;
DROP FUNCTION IF EXISTS trg_pa_pin_metrics_enforce_monotonic();

CREATE INDEX IF NOT EXISTS idx_ksc_shard_active
  ON keyword_serp_current (shard_id, keyword_id)
  WHERE is_displaced = FALSE;

CREATE INDEX IF NOT EXISTS idx_kdi_shard_kw
  ON keyword_displaced_index (shard_id, keyword_id);

CREATE INDEX IF NOT EXISTS idx_ksc_domain_clean
  ON keyword_serp_current (domain)
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS idx_pa_pins_domain_clean
  ON pa_pins (domain)
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS idx_cp_link_domain_clean
  ON competitor_pins (link_domain)
  INCLUDE (competitor_id, pin_id, save_count, repin_count)
  WHERE link_domain IS NOT NULL AND link_domain <> '';

CREATE INDEX IF NOT EXISTS idx_pa_pins_account_username_clean
  ON pa_pins (account_username, saves DESC)
  INCLUDE (pin_id, domain, velocity);

ALTER TABLE competitor_pins SET (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 800
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('036', '036_shard_affine_and_clean_indexes', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = EXCLUDED.applied_at;
