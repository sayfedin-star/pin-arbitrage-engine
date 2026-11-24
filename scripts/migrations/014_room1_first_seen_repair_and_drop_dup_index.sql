-- ============================================================================
-- Migration 014: Repair Room 1 first_seen_at Backfill & Drop Duplicate PDM Index
-- ============================================================================
-- Forward-only remediation for Migration 013 (do NOT edit 013 due to SHA-256
-- checksum enforcement in scripts/migrate.mjs):
-- 1. Drops redundant `idx_pdm_pin_date` on `pins_daily_metrics` CONCURRENTLY
--    (zero write lock). `pins_daily_metrics_pkey (pin_id, recorded_date)`
--    already satisfies backward index scans on `(pin_id, recorded_date DESC)`.
-- 2. Restores authentic historical `first_seen_at` on `keyword_serp_positions`
--    using the earliest observed timestamp across `pins_daily_metrics`,
--    `keyword_serp_positions.displaced_date`, and `universal_master_pins`
--    (`first_discovered_at` / `first_saved_at`), preventing Migration 013's
--    `crawled_at` backfill from resetting existing pins to 0-1 days old.
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_pdm_pin_date;

WITH earliest_pdm AS (
  SELECT
    pin_id,
    MIN(recorded_date)::timestamptz AS min_pdm_ts
  FROM public.pins_daily_metrics
  GROUP BY pin_id
),
repaired AS (
  SELECT
    ksp.keyword_id,
    ksp.pin_id,
    LEAST(
      COALESCE(ksp.first_seen_at, NOW()),
      COALESCE(ep.min_pdm_ts, ksp.first_seen_at, NOW()),
      COALESCE(ksp.displaced_date, ksp.first_seen_at, NOW()),
      COALESCE(ump.first_discovered_at, ksp.first_seen_at, NOW()),
      COALESCE(ump.first_saved_at, ksp.first_seen_at, NOW())
    ) AS authentic_first_seen
  FROM public.keyword_serp_positions ksp
  LEFT JOIN public.universal_master_pins ump ON ump.pin_id = ksp.pin_id
  LEFT JOIN earliest_pdm ep ON ep.pin_id = ksp.pin_id
)
UPDATE public.keyword_serp_positions ksp
SET first_seen_at = r.authentic_first_seen
FROM repaired r
WHERE ksp.keyword_id = r.keyword_id
  AND ksp.pin_id = r.pin_id
  AND (
    ksp.first_seen_at IS NULL
    OR r.authentic_first_seen < ksp.first_seen_at
  );
