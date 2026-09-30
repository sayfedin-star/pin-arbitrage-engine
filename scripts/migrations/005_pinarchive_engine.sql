-- ============================================================================
-- Migration 005: PinArchive Engine, Monotonic Metrics & Topic Clustering
-- Project 4 (PinArchive) Integration for Neon Serverless Postgres
-- ============================================================================

CREATE TABLE IF NOT EXISTS pa_pins (
    pin_id VARCHAR(64) PRIMARY KEY,
    account_username VARCHAR(128),
    title TEXT,
    description TEXT,
    link TEXT,
    domain VARCHAR(255),
    board_name VARCHAR(255),
    image_url TEXT,
    dominant_color VARCHAR(32),
    saves BIGINT DEFAULT 0,
    repins BIGINT DEFAULT 0,
    comments INT DEFAULT 0,
    share_count BIGINT DEFAULT 0,
    reactions JSONB DEFAULT '{}'::jsonb,
    velocity NUMERIC(10, 2) DEFAULT 0,
    annotations JSONB DEFAULT '[]'::jsonb,
    is_video BOOLEAN DEFAULT FALSE,
    is_product BOOLEAN DEFAULT FALSE,
    created_at_pinterest TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_pins_saves ON pa_pins(saves DESC);
CREATE INDEX IF NOT EXISTS idx_pa_pins_velocity ON pa_pins(velocity DESC);
CREATE INDEX IF NOT EXISTS idx_pa_pins_account ON pa_pins(account_username);
CREATE INDEX IF NOT EXISTS idx_pa_pins_annotations_gin ON pa_pins USING gin(annotations);

CREATE TABLE IF NOT EXISTS pa_pin_metrics (
    id BIGSERIAL PRIMARY KEY,
    pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    saves BIGINT DEFAULT 0,
    repins BIGINT DEFAULT 0,
    comments INT DEFAULT 0,
    UNIQUE(pin_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_pa_pin_metrics_lookup ON pa_pin_metrics(pin_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS pa_staged_pins (
    id SERIAL PRIMARY KEY,
    pin_id VARCHAR(64) NOT NULL REFERENCES pa_pins(pin_id) ON DELETE CASCADE,
    target_board VARCHAR(255),
    override_link TEXT,
    status VARCHAR(32) DEFAULT 'staged', -- staged | dispatched | cancelled
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_staged_pins_status ON pa_staged_pins(status);

-- 1. Enforce Monotonic Metrics at DB Storage Engine Level
CREATE OR REPLACE FUNCTION trg_pa_pins_enforce_monotonic_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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

DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;
CREATE TRIGGER trg_pa_pins_monotonic_metrics
  BEFORE UPDATE ON pa_pins
  FOR EACH ROW
  EXECUTE FUNCTION trg_pa_pins_enforce_monotonic_metrics();

-- 2. Fast Topic Clusters Extraction from JSONB annotations
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
LANGUAGE plpgsql
AS $$
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
    jsonb_array_elements(p.annotations) AS ann
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
