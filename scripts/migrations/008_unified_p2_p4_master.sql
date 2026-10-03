-- ==============================================================================
-- 008_unified_p2_p4_master.sql
-- Migration: Unified P2 + P4 Architecture (Monotonic Invariant Triggers & Compatibility Views)
-- ==============================================================================

-- 1. Monotonic Metrics Invariant Trigger Function
CREATE OR REPLACE FUNCTION trg_enforce_monotonic_metrics()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.saves := GREATEST(COALESCE(OLD.saves, 0), COALESCE(NEW.saves, 0));
    NEW.repins := GREATEST(COALESCE(OLD.repins, 0), COALESCE(NEW.repins, 0));
    NEW.comments := GREATEST(COALESCE(OLD.comments, 0), COALESCE(NEW.comments, 0));
    NEW.share_count := GREATEST(COALESCE(OLD.share_count, 0), COALESCE(NEW.share_count, 0));
  END IF;
  RETURN NEW;
END;
$$;

-- Apply Monotonic Trigger to pa_pins
DROP TRIGGER IF EXISTS trg_pa_pins_monotonic ON pa_pins;
CREATE TRIGGER trg_pa_pins_monotonic
  BEFORE UPDATE ON pa_pins
  FOR EACH ROW EXECUTE FUNCTION trg_enforce_monotonic_metrics();

-- 2. Enhanced Topic Clusters Function
CREATE OR REPLACE FUNCTION pa_topic_clusters_page(
  p_min_pins INT DEFAULT 1,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  topic_name TEXT,
  pins_count BIGINT,
  total_saves NUMERIC,
  avg_saves BIGINT,
  avg_velocity NUMERIC
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH extracted AS (
    SELECT
      CASE
        WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
        WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
        ELSE NULL
      END AS raw_topic,
      p.pin_id,
      p.saves,
      p.velocity
    FROM pa_pins p,
    LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann
    WHERE (
        (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
        OR
        (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
      )
  ),
  aggregated AS (
    SELECT
      e.raw_topic AS t_name,
      count(DISTINCT e.pin_id)::BIGINT AS p_count,
      coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
      CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
      round(avg(e.velocity), 2) AS a_velocity
    FROM extracted e
    WHERE (p_search IS NULL OR p_search = '' OR e.raw_topic ILIKE '%' || p_search || '%')
    GROUP BY e.raw_topic
    HAVING count(DISTINCT e.pin_id) >= coalesce(p_min_pins, 1)
  )
  SELECT
    a.t_name AS topic_name,
    a.p_count AS pins_count,
    a.s_saves AS total_saves,
    a.a_saves AS avg_saves,
    a.a_velocity AS avg_velocity
  FROM aggregated a
  ORDER BY a.s_saves DESC
  LIMIT coalesce(p_limit, 50)
  OFFSET coalesce(p_offset, 0);
END;
$$;

-- 3. Unified Views for Seamless P2/P4 Interoperability
CREATE OR REPLACE VIEW creator_profiles AS SELECT * FROM competitor_profiles;
CREATE OR REPLACE VIEW creator_boards AS SELECT * FROM competitor_boards;
CREATE OR REPLACE VIEW pin_metrics_snapshots AS SELECT * FROM pa_pin_metrics;
