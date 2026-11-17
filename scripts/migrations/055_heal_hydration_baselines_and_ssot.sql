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

-- 2A. Sync missing or higher save_count/repin_count from keyword_serp_current & pins_daily_metrics to universal_master_pins
WITH best_metrics AS (
  SELECT
    pin_id,
    MAX(save_count) AS max_saves,
    MAX(repin_count) AS max_repins
  FROM (
    SELECT pin_id, COALESCE(save_count, 0) AS save_count, COALESCE(repin_count, 0) AS repin_count FROM public.keyword_serp_current
    UNION ALL
    SELECT pin_id, COALESCE(save_count, 0) AS save_count, COALESCE(repin_count, 0) AS repin_count FROM public.pins_daily_metrics
  ) combined
  WHERE save_count > 0 OR repin_count > 0
  GROUP BY pin_id
)
UPDATE public.universal_master_pins ump
SET
  save_count = GREATEST(COALESCE(ump.save_count, 0), bm.max_saves),
  repin_count = GREATEST(COALESCE(ump.repin_count, 0), bm.max_repins),
  is_deep_hydrated = CASE WHEN GREATEST(COALESCE(ump.save_count, 0), bm.max_saves) > 0 THEN TRUE ELSE ump.is_deep_hydrated END,
  updated_at = NOW()
FROM best_metrics bm
WHERE ump.pin_id = bm.pin_id
  AND (COALESCE(ump.save_count, 0) < bm.max_saves OR COALESCE(ump.repin_count, 0) < bm.max_repins);

-- 2B. Sync missing save_count > 0 from universal_master_pins to latest pins_daily_metrics and keyword_serp_current
WITH latest_pdm AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    snapshot_date
  FROM public.pins_daily_metrics
  ORDER BY pin_id, snapshot_date DESC
)
UPDATE public.pins_daily_metrics pdm
SET
  save_count = GREATEST(COALESCE(pdm.save_count, 0), COALESCE(ump.save_count, 0)),
  repin_count = GREATEST(COALESCE(pdm.repin_count, 0), COALESCE(ump.repin_count, 0)),
  updated_at = NOW()
FROM latest_pdm lp
JOIN public.universal_master_pins ump ON ump.pin_id = lp.pin_id
WHERE pdm.pin_id = lp.pin_id
  AND pdm.snapshot_date = lp.snapshot_date
  AND (COALESCE(pdm.save_count, 0) < COALESCE(ump.save_count, 0) OR COALESCE(pdm.repin_count, 0) < COALESCE(ump.repin_count, 0));

UPDATE public.keyword_serp_current ksc
SET
  save_count = GREATEST(COALESCE(ksc.save_count, 0), COALESCE(ump.save_count, 0)),
  repin_count = GREATEST(COALESCE(ksc.repin_count, 0), COALESCE(ump.repin_count, 0)),
  updated_at = NOW()
FROM public.universal_master_pins ump
WHERE ksc.pin_id = ump.pin_id
  AND (COALESCE(ksc.save_count, 0) < COALESCE(ump.save_count, 0) OR COALESCE(ksc.repin_count, 0) < COALESCE(ump.repin_count, 0));

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

-- 3B. Heal proxy-backfilled first-hydration spikes (where earlier days had save_count = repin_count
-- and only <= 1 snapshot has genuinely hydrated save_count > repin_count)
WITH proxy_spiked_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > COALESCE(repin_count, 0)) = 1
     AND COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0 AND COALESCE(save_count, 0) = COALESCE(repin_count, 0)) >= 1
)
UPDATE public.pins_daily_metrics pdm
SET
  daily_save_velocity = 0,
  is_baseline_day = CASE WHEN COALESCE(pdm.save_count, 0) > COALESCE(pdm.repin_count, 0) THEN TRUE ELSE pdm.is_baseline_day END,
  updated_at = NOW()
FROM proxy_spiked_pins psp
WHERE pdm.pin_id = psp.pin_id
  AND COALESCE(pdm.save_count, 0) > COALESCE(pdm.repin_count, 0)
  AND pdm.daily_save_velocity > 0;

WITH proxy_spiked_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > COALESCE(repin_count, 0)) = 1
     AND COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0 AND COALESCE(save_count, 0) = COALESCE(repin_count, 0)) >= 1
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = 0,
  delta_saves_24h = 0,
  updated_at = NOW()
FROM proxy_spiked_pins psp
WHERE ump.pin_id = psp.pin_id
  AND (ump.daily_save_velocity > 0 OR ump.delta_saves_24h > 0);

WITH proxy_spiked_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > COALESCE(repin_count, 0)) = 1
     AND COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0 AND COALESCE(save_count, 0) = COALESCE(repin_count, 0)) >= 1
)
UPDATE public.keyword_serp_current ksc
SET
  daily_save_velocity = 0,
  baseline_day_saves = ksc.save_count,
  updated_at = NOW()
FROM proxy_spiked_pins psp
WHERE ksc.pin_id = psp.pin_id
  AND ksc.daily_save_velocity > 0;

-- 4. Fix baseline_day_saves = save_count for all rows where COALESCE(baseline_day_saves, 0) = 0 AND save_count > 0
UPDATE public.keyword_serp_current
SET
  baseline_day_saves = save_count,
  daily_save_velocity = 0,
  baseline_day_date = COALESCE(baseline_day_date, (crawled_at AT TIME ZONE 'UTC')::date, (NOW() AT TIME ZONE 'UTC')::date)
WHERE COALESCE(baseline_day_saves, 0) = 0
  AND save_count > 0;

-- 4B. Sync reaction_count from JSONB metadata->'reactions' where reaction_count = 0
UPDATE public.universal_master_pins
SET
  reaction_count = (metadata->>'reactions')::bigint,
  updated_at = NOW()
WHERE COALESCE(reaction_count, 0) = 0
  AND jsonb_typeof(metadata) = 'object'
  AND (metadata->>'reactions') ~ '^[0-9]+$'
  AND (metadata->>'reactions')::bigint > 0;

-- 4C. Sync pa_pins and competitor_pins velocity with universal_master_pins SSOT
UPDATE public.universal_master_pins
SET
  delta_saves_24h = 0,
  delta_repins_24h = CASE WHEN COALESCE(delta_repins_24h, 0) > 500 THEN 0 ELSE delta_repins_24h END,
  updated_at = NOW()
WHERE COALESCE(daily_save_velocity, 0) = 0
  AND (COALESCE(delta_saves_24h, 0) > 0 OR COALESCE(delta_repins_24h, 0) > 500);

UPDATE public.pa_pins pa
SET
  saves = GREATEST(COALESCE(pa.saves, 0), COALESCE(ump.save_count, 0)),
  repins = GREATEST(COALESCE(pa.repins, 0), COALESCE(ump.repin_count, 0)),
  velocity = COALESCE(ump.daily_save_velocity, 0),
  last_updated_at = NOW()
FROM public.universal_master_pins ump
WHERE pa.pin_id = ump.pin_id
  AND COALESCE(pa.velocity, 0) <> COALESCE(ump.daily_save_velocity, 0);

UPDATE public.competitor_pins cpin
SET
  save_count = GREATEST(COALESCE(cpin.save_count, 0), COALESCE(ump.save_count, 0)),
  repin_count = GREATEST(COALESCE(cpin.repin_count, 0), COALESCE(ump.repin_count, 0)),
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(cpin.metadata, '{}'::jsonb),
      '{daily_save_velocity}',
      to_jsonb(COALESCE(ump.daily_save_velocity, 0)),
      true
    ),
    '{delta_saves_24h}',
    to_jsonb(COALESCE(ump.delta_saves_24h, 0)),
    true
  ),
  updated_at = NOW()
FROM public.universal_master_pins ump
WHERE cpin.pin_id = ump.pin_id
  AND jsonb_typeof(COALESCE(cpin.metadata, '{}'::jsonb)) = 'object'
  AND (
    (cpin.metadata->>'daily_save_velocity') IS DISTINCT FROM COALESCE(ump.daily_save_velocity, 0)::text
    OR (cpin.metadata->>'delta_saves_24h') IS DISTINCT FROM COALESCE(ump.delta_saves_24h, 0)::text
    OR COALESCE(cpin.save_count, 0) < COALESCE(ump.save_count, 0)
  );

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
