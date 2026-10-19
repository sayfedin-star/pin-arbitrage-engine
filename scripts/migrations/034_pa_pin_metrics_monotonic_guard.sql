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
  pa_pin_saves BIGINT;
  pa_pin_repins BIGINT;
BEGIN
  -- 1. On UPDATE, never allow saves or repins to drop below OLD values
  IF TG_OP = 'UPDATE' THEN
    NEW.saves := GREATEST(COALESCE(OLD.saves, 0), COALESCE(NEW.saves, 0));
    NEW.repins := GREATEST(COALESCE(OLD.repins, 0), COALESCE(NEW.repins, 0));
    NEW.comments := GREATEST(COALESCE(OLD.comments, 0), COALESCE(NEW.comments, 0));
  END IF;

  -- 2. Query highest historical snapshot for this pin prior to or at this timestamp
  SELECT COALESCE(MAX(saves), 0), COALESCE(MAX(repins), 0)
  INTO prev_max_saves, prev_max_repins
  FROM pa_pin_metrics
  WHERE pin_id = NEW.pin_id 
    AND recorded_at <= NEW.recorded_at
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF prev_max_saves > 0 THEN
    NEW.saves := GREATEST(NEW.saves, prev_max_saves);
    NEW.repins := GREATEST(NEW.repins, prev_max_repins);
  END IF;

  -- 3. Cross-check against master pa_pins table to prevent drops below established records
  SELECT COALESCE(saves, 0), COALESCE(repins, 0)
  INTO pa_pin_saves, pa_pin_repins
  FROM pa_pins
  WHERE pin_id = NEW.pin_id;

  IF pa_pin_saves > 0 THEN
    NEW.saves := GREATEST(NEW.saves, pa_pin_saves);
    NEW.repins := GREATEST(NEW.repins, pa_pin_repins);
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
