-- Migration 062: SSOT HOT Tuning, Functions, and 20-Worker Partition Indexes
-- 1. Recreates mv_pulse_24h_summary with strict 24h hydration filtering, synthetic domain filtering, and NULLIF deduplication.
-- 2. Consolidates pa_topic_clusters_page into a single canonical function with DISTINCT ON (e.pin_id, LOWER(e.raw_topic)) deduplication.
-- 3. Drops HOT-blocking indexes (idx_ump_last_scraped_at_desc, idx_ump_last_scraped_at, idx_ump_updated_at_desc, idx_ump_updated, idx_ksp_displaced_updated_desc, idx_pdm_pin_recorded_desc, idx_pdm_pin_snapshot_desc).
-- 4. Sets fillfactor = 80 on all 4 SSOT operational tables.
-- 5. Creates 20-worker modulo partition indexes with exact % 20.
-- 6. Collision-safe canonical_keyword backfill & trigger with -<id> on duplicates/empty.

-- 1. Recreate Materialized View for 24h Pulse Executive Telemetry
DROP MATERIALIZED VIEW IF EXISTS public.mv_pulse_24h_summary CASCADE;

CREATE MATERIALIZED VIEW public.mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
  COUNT(DISTINCT NULLIF(BTRIM(ump.clean_domain), '')) FILTER (
    WHERE LOWER(BTRIM(COALESCE(ump.clean_domain, ''))) NOT IN (
      'uploaded by user', 'uploaded-by-user', 'organic', 'pinterest.com', 'www.pinterest.com'
    )
  )::bigint AS active_domains_24h,
  COUNT(DISTINCT NULLIF(LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))), ''))::bigint AS active_creators_24h,
  COALESCE(ROUND(AVG(ump.daily_save_velocity)::numeric, 2), 0)::numeric(12,2) AS avg_velocity_24h,
  COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
  COALESCE(SUM(GREATEST(0, COALESCE(ump.delta_saves_24h, ROUND(ump.daily_save_velocity)::bigint, 0))), 0)::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM public.universal_master_pins ump
WHERE ump.is_hydrated = TRUE
  AND (ump.last_scraped_at >= NOW() - INTERVAL '24 hours' OR ump.updated_at >= NOW() - INTERVAL '24 hours');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON public.mv_pulse_24h_summary (summary_id);

-- 2. Consolidate pa_topic_clusters_page into single canonical function
DROP FUNCTION IF EXISTS public.pa_topic_clusters_page(INT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.pa_topic_clusters_page(INT, INT, TEXT, INT);
DROP FUNCTION IF EXISTS public.pa_topic_clusters_page(INT, TEXT, INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.pa_topic_clusters_page(integer, text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.pa_topic_clusters_page(
  p_min_pins INT DEFAULT 1,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_account TEXT DEFAULT NULL
)
RETURNS TABLE (
  topic_name TEXT,
  pins_count BIGINT,
  total_saves NUMERIC,
  avg_saves BIGINT,
  avg_velocity NUMERIC
)
LANGUAGE plpgsql AS $$
DECLARE
  v_clean_account TEXT;
  v_escaped_search TEXT;
BEGIN
  v_clean_account := NULLIF(LOWER(TRIM(REPLACE(COALESCE(p_account, ''), '@', ''))), '');
  v_escaped_search := CASE
    WHEN p_search IS NULL OR BTRIM(p_search) = '' THEN NULL
    ELSE REPLACE(REPLACE(REPLACE(BTRIM(p_search), '\', '\\'), '%', '\%'), '_', '\_')
  END;

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
      ump.daily_save_velocity AS velocity
    FROM public.universal_master_pins ump,
    LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ump.visual_annotations) = 'array' THEN ump.visual_annotations ELSE '[]'::jsonb END
    ) AS ann
    WHERE (
        (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
        OR
        (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
      )
      AND (v_clean_account IS NULL OR LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) = v_clean_account)
  ),
  deduped AS (
    SELECT DISTINCT ON (e.pin_id, LOWER(e.raw_topic))
      LOWER(e.raw_topic) AS norm_topic,
      e.raw_topic,
      e.pin_id,
      e.saves,
      e.velocity
    FROM extracted e
    ORDER BY e.pin_id, LOWER(e.raw_topic), e.raw_topic
  ),
  aggregated AS (
    SELECT
      MIN(d.raw_topic) AS t_name,
      COUNT(d.pin_id)::BIGINT AS p_count,
      COALESCE(SUM(d.saves), 0)::NUMERIC AS s_saves,
      CASE WHEN COUNT(d.pin_id) > 0 THEN (COALESCE(SUM(d.saves), 0) / COUNT(d.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
      COALESCE(ROUND(AVG(d.velocity)::numeric, 2), 0::numeric) AS a_velocity
    FROM deduped d
    WHERE (v_escaped_search IS NULL OR d.raw_topic ILIKE '%' || v_escaped_search || '%' ESCAPE '\')
    GROUP BY d.norm_topic
    HAVING COUNT(d.pin_id) >= COALESCE(p_min_pins, 1)
  )
  SELECT
    a.t_name AS topic_name,
    a.p_count AS pins_count,
    a.s_saves AS total_saves,
    a.a_saves AS avg_saves,
    a.a_velocity AS avg_velocity
  FROM aggregated a
  ORDER BY a.s_saves DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

-- 3. Drop HOT-blocking and redundant indexes
DROP INDEX IF EXISTS public.idx_ump_last_scraped_at_desc;
DROP INDEX IF EXISTS public.idx_ump_last_scraped_at;
DROP INDEX IF EXISTS public.idx_ump_updated_at_desc;
DROP INDEX IF EXISTS public.idx_ump_updated;
DROP INDEX IF EXISTS public.idx_ksp_displaced_updated_desc;
DROP INDEX IF EXISTS public.idx_pdm_pin_recorded_desc;
DROP INDEX IF EXISTS public.idx_pdm_pin_snapshot_desc;

-- 4. Fillfactor 80 on all 4 SSOT tables for in-place HOT updates
ALTER TABLE public.universal_master_pins SET (fillfactor = 80);
ALTER TABLE public.keyword_serp_positions SET (fillfactor = 80);
ALTER TABLE public.competitor_board_pins SET (fillfactor = 80);
ALTER TABLE public.pins_daily_metrics SET (fillfactor = 80);

-- 5. Create missing SSOT & 20-worker partition indexes
CREATE INDEX IF NOT EXISTS idx_ump_visual_annotations_gin ON public.universal_master_pins USING gin (visual_annotations);
CREATE INDEX IF NOT EXISTS idx_ump_hashtext_mod20 ON public.universal_master_pins ((ABS(hashtext(pin_id::text)::bigint) % 20));
CREATE INDEX IF NOT EXISTS idx_ksp_hashtext_mod20 ON public.keyword_serp_positions ((ABS(hashtext(pin_id::text)::bigint) % 20), keyword_id);
CREATE INDEX IF NOT EXISTS idx_cbp_hashtext_mod20 ON public.competitor_board_pins ((ABS(hashtext(pin_id::text)::bigint) % 20), competitor_id);
CREATE INDEX IF NOT EXISTS idx_ump_is_product ON public.universal_master_pins (is_product) WHERE is_product = TRUE;
CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON public.tracked_keywords (LOWER(keyword));
CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON public.competitor_profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_cbp_competitor ON public.competitor_board_pins (competitor_id, position ASC NULLS LAST);

-- 6. Collision-safe canonical_keyword backfill & trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tracked_keywords' AND column_name = 'canonical_keyword'
  ) THEN
    ALTER TABLE public.tracked_keywords ADD COLUMN canonical_keyword VARCHAR(255);
  END IF;
END $$;

WITH computed AS (
  SELECT
    id,
    COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(keyword), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''), 'kw') AS raw_slug,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(keyword), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''), 'kw')
      ORDER BY id ASC
    ) AS rn
  FROM public.tracked_keywords
)
UPDATE public.tracked_keywords tk
SET canonical_keyword = CASE
  WHEN c.rn = 1 THEN LEFT(c.raw_slug, 255)
  ELSE LEFT(c.raw_slug || '-' || tk.id::text, 255)
END
FROM computed c
WHERE tk.id = c.id
  AND (
    tk.canonical_keyword IS NULL
    OR tk.canonical_keyword = ''
    OR tk.canonical_keyword <> CASE
      WHEN c.rn = 1 THEN LEFT(c.raw_slug, 255)
      ELSE LEFT(c.raw_slug || '-' || tk.id::text, 255)
    END
  );

CREATE OR REPLACE FUNCTION public.pae_sync_canonical_keyword()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw_input text;
  base_slug text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.keyword IS DISTINCT FROM OLD.keyword AND NEW.canonical_keyword IS NOT DISTINCT FROM OLD.canonical_keyword THEN
    raw_input := NEW.keyword;
  ELSE
    raw_input := COALESCE(NULLIF(TRIM(NEW.canonical_keyword), ''), NEW.keyword);
  END IF;

  base_slug := COALESCE(
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(raw_input, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(NEW.keyword, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    'kw'
  );

  IF EXISTS (
    SELECT 1 FROM public.tracked_keywords
    WHERE canonical_keyword = LEFT(base_slug, 255)
      AND (NEW.id IS NULL OR id <> NEW.id)
  ) THEN
    NEW.canonical_keyword := LEFT(base_slug || '-' || COALESCE(NEW.id::text, (FLOOR(RANDOM() * 900000 + 100000))::text), 255);
  ELSE
    NEW.canonical_keyword := LEFT(base_slug, 255);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tk_sync_canonical_keyword ON public.tracked_keywords;
CREATE TRIGGER trg_tk_sync_canonical_keyword
  BEFORE INSERT OR UPDATE OF keyword, canonical_keyword ON public.tracked_keywords
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_canonical_keyword();

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_tracked_keywords
  ON public.tracked_keywords (canonical_keyword);

-- 7. Record migration in schema_migrations
INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
VALUES ('062', 'ssot_hot_tuning_and_functions', 'phase5_ssot_hot_tuning_062', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
