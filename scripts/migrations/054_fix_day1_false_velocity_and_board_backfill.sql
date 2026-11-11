-- =============================================================================
-- Migration 054: Fix Day-1 False Velocity Spikes & Backfill Missing Board Names
-- =============================================================================
-- 1. Zero out false Day-1 velocity spikes where a newly discovered pin's
--    Phase 1A 0-save SERP skeleton was hydrated in Phase 1B on the same day,
--    falsely recording `daily_save_velocity = save_count` with no prior-day history.
-- 2. Backfill missing `universal_master_pins.board_name` from `keyword_serp_current`,
--    `competitor_pins`, and `pa_pins`.
-- =============================================================================

BEGIN;

-- 1A. Reset Day-1 false velocity spikes in pins_daily_metrics for single-day pins
WITH single_day_pins AS (
  SELECT pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) <= 1
)
UPDATE public.pins_daily_metrics pdm
SET daily_save_velocity = 0
FROM single_day_pins sdp
WHERE pdm.pin_id = sdp.pin_id
  AND pdm.save_count > 0
  AND pdm.daily_save_velocity >= pdm.save_count;

-- 1B. Reset Day-1 false velocity spikes in universal_master_pins for single-day pins
WITH multi_day_pins AS (
  SELECT pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) >= 2
)
UPDATE public.universal_master_pins ump
SET daily_save_velocity = 0,
    delta_repins_24h = 0,
    gains_5d = 0,
    gains_7d = 0,
    gains_10d = 0,
    gains_15d = 0
WHERE ump.save_count > 0
  AND ump.daily_save_velocity >= ump.save_count
  AND NOT EXISTS (
    SELECT 1 FROM multi_day_pins mdp WHERE mdp.pin_id = ump.pin_id
  );

-- 1C. Reset Day-1 false velocity spikes in keyword_serp_current for single-day pins
WITH multi_day_pins AS (
  SELECT pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) >= 2
)
UPDATE public.keyword_serp_current ksc
SET daily_save_velocity = 0,
    delta_repins_24h = 0,
    gains_5d = 0,
    gains_7d = 0,
    gains_10d = 0,
    gains_15d = 0
WHERE ksc.save_count > 0
  AND ksc.daily_save_velocity >= ksc.save_count
  AND NOT EXISTS (
    SELECT 1 FROM multi_day_pins mdp WHERE mdp.pin_id = ksc.pin_id
  );

-- 1D. Reset Day-1 false velocity spikes in keyword_displaced_index for single-day pins
WITH multi_day_pins AS (
  SELECT pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) >= 2
)
UPDATE public.keyword_displaced_index kdi
SET daily_save_velocity = 0,
    delta_repins_24h = 0,
    gains_5d = 0,
    gains_7d = 0,
    gains_10d = 0,
    gains_15d = 0
WHERE kdi.save_count > 0
  AND kdi.daily_save_velocity >= kdi.save_count
  AND NOT EXISTS (
    SELECT 1 FROM multi_day_pins mdp WHERE mdp.pin_id = kdi.pin_id
  );

-- 2A. Backfill missing board_name on universal_master_pins from keyword_serp_current
WITH serp_boards AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    BTRIM(board_name) AS board_name
  FROM public.keyword_serp_current
  WHERE COALESCE(BTRIM(board_name), '') <> ''
  ORDER BY pin_id, crawled_at DESC NULLS LAST
)
UPDATE public.universal_master_pins ump
SET board_name = sb.board_name,
    board_slug = COALESCE(
      NULLIF(ump.board_slug, ''),
      LOWER(REGEXP_REPLACE(REGEXP_REPLACE(sb.board_name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
    )
FROM serp_boards sb
WHERE ump.pin_id = sb.pin_id
  AND COALESCE(BTRIM(ump.board_name), '') = '';

-- 2B. Backfill any remaining missing board_name from competitor_pins or pa_pins
WITH fallback_boards AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    board_name
  FROM (
    SELECT pin_id, BTRIM(board_name) AS board_name
    FROM public.competitor_pins
    WHERE COALESCE(BTRIM(board_name), '') <> ''
    UNION ALL
    SELECT pin_id, BTRIM(board_name) AS board_name
    FROM public.pa_pins
    WHERE COALESCE(BTRIM(board_name), '') <> ''
  ) src
  ORDER BY pin_id
)
UPDATE public.universal_master_pins ump
SET board_name = fb.board_name,
    board_slug = COALESCE(
      NULLIF(ump.board_slug, ''),
      LOWER(REGEXP_REPLACE(REGEXP_REPLACE(fb.board_name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
    )
FROM fallback_boards fb
WHERE ump.pin_id = fb.pin_id
  AND COALESCE(BTRIM(ump.board_name), '') = '';

COMMIT;
