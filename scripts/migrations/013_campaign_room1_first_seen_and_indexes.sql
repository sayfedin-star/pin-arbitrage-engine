-- ============================================================================
-- Migration 013: Campaign Room 1 Pin Tenure (first_seen_at) & Metrics Index
-- ============================================================================
-- 1. Adds immutable `first_seen_at` to `keyword_serp_positions` so Room 1 and
--    Smart Pin Pruning can measure authentic per-pin SERP tenure rather than
--    inheriting the parent keyword's `keyword_folder_items.added_at` timestamp.
-- 2. Adds composite index `(pin_id, recorded_date DESC)` on `pins_daily_metrics`
--    to eliminate sequential scans on multi-window rolling gain queries.
-- ============================================================================

ALTER TABLE public.keyword_serp_positions
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;

UPDATE public.keyword_serp_positions
SET first_seen_at = COALESCE(crawled_at, updated_at, NOW())
WHERE first_seen_at IS NULL;

ALTER TABLE public.keyword_serp_positions
  ALTER COLUMN first_seen_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pdm_pin_date
  ON public.pins_daily_metrics (pin_id, recorded_date DESC);
