-- =============================================================================
-- Migration 055: Heal Hydration Baselines, Eradicate Spikes & Enforce SSOT Parity
-- =============================================================================
-- 1. Ensure `is_baseline_day` exists on `pins_daily_metrics`.
-- 2. Sync missing `save_count > 0` from `keyword_serp_current` to
--    `universal_master_pins` (145 pins) and `pins_daily_metrics` (272 rows).
-- 3. Heal historical contamination: Pins with up to 22 zero-save snapshots and
--    <= 1 positive snapshot (`COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1`)
--    must have artificial velocity reset to 0 and baseline flagged.
-- 4. Fix `baseline_day_saves = save_count` for all rows where
--    `COALESCE(baseline_day_saves, 0) = 0 AND save_count > 0`.
-- 5. Recalculate `tracked_keywords.avg_daily_velocity` from healed SERP velocities.
-- 6. Refresh `mv_pulse_24h_summary` if materialized view exists.
-- =============================================================================

BEGIN;

-- 1. Ensure schema columns exist
ALTER TABLE IF EXISTS public.pins_daily_metrics
  ADD COLUMN IF NOT EXISTS is_baseline_day BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.keyword_serp_current
  ADD COLUMN IF NOT EXISTS baseline_day_saves BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_day_date DATE;

-- 2A. Sync missing save_count > 0 from keyword_serp_current to universal_master_pins (145 pins)
WITH best_ksc AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    save_count,
    repin_count,
    crawled_at,
    updated_at
  FROM public.keyword_serp_current
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, save_count DESC, crawled_at DESC NULLS LAST, updated_at DESC NULLS LAST
)
UPDATE public.universal_master_pins ump
SET
  save_count = bk.save_count,
  repin_count = GREATEST(COALESCE(ump.repin_count, 0), COALESCE(bk.repin_count, 0)),
  is_deep_hydrated = TRUE,
  updated_at = NOW()
FROM best_ksc bk
WHERE ump.pin_id = bk.pin_id
  AND COALESCE(ump.save_count, 0) = 0;

-- 2B. Sync missing save_count > 0 from keyword_serp_current to pins_daily_metrics (272 rows)
WITH best_ksc AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    save_count,
    repin_count
  FROM public.keyword_serp_current
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, save_count DESC, updated_at DESC NULLS LAST
)
UPDATE public.pins_daily_metrics pdm
SET
  save_count = bk.save_count,
  repin_count = GREATEST(COALESCE(pdm.repin_count, 0), COALESCE(bk.repin_count, 0)),
  updated_at = NOW()
FROM best_ksc bk
WHERE pdm.pin_id = bk.pin_id
  AND COALESCE(pdm.save_count, 0) = 0;

-- 3. Heal historical contamination:
-- Pins with historical contamination have up to 22 zero-save snapshots and 1 positive snapshot:
-- query must use COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.pins_daily_metrics pdm
SET
  daily_save_velocity = 0,
  is_baseline_day = CASE WHEN COALESCE(pdm.save_count, 0) > 0 THEN TRUE ELSE pdm.is_baseline_day END,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE pdm.pin_id = cp.pin_id
  AND pdm.daily_save_velocity > 0;

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = 0,
  delta_saves_24h = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE ump.pin_id = cp.pin_id
  AND (ump.daily_save_velocity > 0 OR ump.delta_saves_24h > 0);

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.keyword_serp_current ksc
SET
  daily_save_velocity = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE ksc.pin_id = cp.pin_id
  AND ksc.daily_save_velocity > 0;

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.keyword_displaced_index kdi
SET
  daily_save_velocity = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE kdi.pin_id = cp.pin_id
  AND kdi.daily_save_velocity > 0;

-- 4. Fix baseline_day_saves = save_count for all rows where COALESCE(baseline_day_saves, 0) = 0 AND save_count > 0
UPDATE public.keyword_serp_current
SET
  baseline_day_saves = save_count,
  baseline_day_date = COALESCE(baseline_day_date, (crawled_at AT TIME ZONE 'UTC')::date, (NOW() AT TIME ZONE 'UTC')::date)
WHERE COALESCE(baseline_day_saves, 0) = 0
  AND save_count > 0;

-- Also tag earliest positive snapshot as baseline day in pins_daily_metrics
WITH first_pos_snapshot AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    snapshot_date
  FROM public.pins_daily_metrics
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, snapshot_date ASC
)
UPDATE public.pins_daily_metrics pdm
SET is_baseline_day = TRUE
FROM first_pos_snapshot fps
WHERE pdm.pin_id = fps.pin_id
  AND pdm.snapshot_date = fps.snapshot_date;

-- 5. Recalculate tracked_keywords.avg_daily_velocity
UPDATE public.tracked_keywords tk
SET avg_daily_velocity = COALESCE(agg.avg_vel, 0),
    updated_at = NOW()
FROM (
  SELECT
    keyword_id,
    COALESCE(ROUND(AVG(daily_save_velocity)::numeric, 2), 0) AS avg_vel
  FROM public.keyword_serp_current
  GROUP BY keyword_id
) agg
WHERE tk.id = agg.keyword_id;

UPDATE public.tracked_keywords
SET avg_daily_velocity = 0,
    updated_at = NOW()
WHERE id NOT IN (SELECT DISTINCT keyword_id FROM public.keyword_serp_current);

-- 6. Refresh mv_pulse_24h_summary if materialized view exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_pulse_24h_summary'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;
  END IF;
END $$;

COMMIT;
