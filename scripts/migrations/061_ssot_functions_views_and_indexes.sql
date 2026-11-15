-- Migration 061: SSOT Functions, Views, and Accelerated Indexes
-- Restores mv_pulse_24h_summary, rewrites pa_topic_clusters_page for universal_master_pins SSOT,
-- and adds high-performance B-tree indexes for fast seeks and latency reduction.

-- 1. Recreate Materialized View for 24h Pulse Executive Telemetry
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
  COUNT(DISTINCT ump.clean_domain)::bigint AS active_domains_24h,
  COUNT(DISTINCT ump.creator_username)::bigint AS active_creators_24h,
  COALESCE(ROUND(AVG(ump.daily_save_velocity)::numeric, 2), 0)::numeric(12,2) AS avg_velocity_24h,
  COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
  COALESCE(SUM(ump.delta_saves_24h), 0)::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM public.universal_master_pins ump
WHERE ump.last_scraped_at >= NOW() - INTERVAL '24 hours'
   OR ump.updated_at >= NOW() - INTERVAL '24 hours';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON public.mv_pulse_24h_summary (summary_id);

-- 2. Rewrite pa_topic_clusters_page to query universal_master_pins SSOT
CREATE OR REPLACE FUNCTION public.pa_topic_clusters_page(
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
      ump.pin_id,
      COALESCE(ump.save_count, 0) AS saves,
      COALESCE(ump.daily_save_velocity, 0) AS velocity
    FROM public.universal_master_pins ump,
    LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ump.visual_annotations) = 'array' THEN ump.visual_annotations ELSE '[]'::jsonb END) AS ann
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
      round(avg(e.velocity)::numeric, 2) AS a_velocity
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

-- Overload supporting (p_min_pins INT, p_limit INT, p_search TEXT, p_offset INT)
CREATE OR REPLACE FUNCTION public.pa_topic_clusters_page(
  p_min_pins INT,
  p_limit INT,
  p_search TEXT DEFAULT '',
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
  SELECT * FROM public.pa_topic_clusters_page(
    p_min_pins => p_min_pins,
    p_search => p_search,
    p_limit => p_limit,
    p_offset => p_offset
  );
END;
$$;

-- 3. Add High-Performance Covering & Partial Indexes
CREATE INDEX IF NOT EXISTS idx_ump_last_scraped_at_desc
  ON public.universal_master_pins(last_scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_ump_updated_at_desc
  ON public.universal_master_pins(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ump_destination_url
  ON public.universal_master_pins(destination_url);

CREATE INDEX IF NOT EXISTS idx_ksp_displaced_date
  ON public.keyword_serp_positions(displaced_date)
  WHERE is_displaced = TRUE;

CREATE INDEX IF NOT EXISTS idx_ksp_displaced_updated_desc
  ON public.keyword_serp_positions(updated_at DESC)
  WHERE is_displaced = TRUE;

CREATE INDEX IF NOT EXISTS idx_ksp_pin_displaced_rank
  ON public.keyword_serp_positions(pin_id, is_displaced ASC, rank_position ASC NULLS LAST);

-- 4. Drop duplicate index on competitor_board_pins(pin_id) (canonical is idx_cbp_pin_id)
DROP INDEX IF EXISTS public.idx_cbp_pin;

-- 5. Record migration in schema_migrations
INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
VALUES ('061', 'ssot_functions_views_and_indexes', 'phase4_ssot_functions_indexes', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
