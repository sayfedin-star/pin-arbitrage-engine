-- 034_pa_pin_metrics_monotonic_guard.sql
-- Enforce monotonic saves/repins at DB Storage Engine Level for pa_pin_metrics
-- Prevents any negative dips or metric corruption across historical time-series

CREATE OR REPLACE FUNCTION trg_pa_pin_metrics_enforce_monotonic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prev_max_saves BIGINT;
  prev_max_repins BIGINT;
BEGIN
  SELECT COALESCE(MAX(saves), 0), COALESCE(MAX(repins), 0)
  INTO prev_max_saves, prev_max_repins
  FROM pa_pin_metrics
  WHERE pin_id = NEW.pin_id AND recorded_at < NEW.recorded_at;

  IF prev_max_saves > 0 AND NEW.saves < prev_max_saves THEN
    NEW.saves := prev_max_saves;
  END IF;
  IF prev_max_repins > 0 AND NEW.repins < prev_max_repins THEN
    NEW.repins := prev_max_repins;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pa_pin_metrics_monotonic ON pa_pin_metrics;
CREATE TRIGGER trg_pa_pin_metrics_monotonic
BEFORE INSERT OR UPDATE ON pa_pin_metrics
FOR EACH ROW
EXECUTE FUNCTION trg_pa_pin_metrics_enforce_monotonic();

-- Register Migration 034 in schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64),
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('034', '034_pa_pin_metrics_monotonic_guard', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = EXCLUDED.applied_at;
