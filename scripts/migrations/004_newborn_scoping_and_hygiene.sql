-- ============================================================================
-- scripts/migrations/004_newborn_scoping_and_hygiene.sql
-- Version: 004 (newborn_scoping_and_hygiene)
--
-- Wave 6C: Strict Run-Scoped Newborn Results (`newborn_run_candidates`),
-- Async 202 Progress Tracking Columns on `newborn_runs`, Fillfactor 80 &
-- HOT-Safe Index Hygiene on `newborn_candidates`, 2026 Engagement Default
-- Alignment, and Polluted Staging Row Purge (PostgreSQL 16).
--
-- Strictly additive & idempotent (IF NOT EXISTS / DO $$), zero CONCURRENTLY
-- (transactional-safe). Migrations 001..003 are left untouched.
-- ============================================================================

-- ============================================================================
-- 1. ENHANCE newborn_runs FOR ASYNC 202 PROGRESS POLLING & FOLDER SCOPING
-- ============================================================================

ALTER TABLE public.newborn_runs SET (fillfactor = 80);

ALTER TABLE public.newborn_runs
  ADD COLUMN IF NOT EXISTS progress_stage VARCHAR(64) NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS progress_detail TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL;

-- Backfill terminal progress state for historical runs created under 003
UPDATE public.newborn_runs
SET
  progress_stage = CASE
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'partial' THEN 'completed'
    WHEN status = 'failed' THEN 'failed'
    ELSE progress_stage
  END,
  progress_pct = CASE
    WHEN status IN ('completed', 'partial') THEN 100
    ELSE progress_pct
  END
WHERE progress_stage = 'queued'
  AND status IN ('completed', 'partial', 'failed');

-- Mark stale zombie 'running' runs from pre-6C synchronous timeouts (> 1 hour old) as failed
UPDATE public.newborn_runs
SET
  status = 'failed',
  progress_stage = 'failed',
  error_message = COALESCE(error_message, 'Timed out during legacy synchronous execution before Wave 6C upgrade'),
  completed_at = COALESCE(completed_at, NOW())
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 2. ENHANCE newborn_candidates WITH EXPLICIT QUALIFICATION & RUN/FOLDER SCOPING
-- ============================================================================

ALTER TABLE public.newborn_candidates
  ADD COLUMN IF NOT EXISTS qualified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_run_id BIGINT REFERENCES public.newborn_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_run_id BIGINT REFERENCES public.newborn_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL;

-- Backfill `qualified` column from existing JSONB metadata before hygiene purge
UPDATE public.newborn_candidates
SET qualified = COALESCE((metadata->>'qualified')::boolean, FALSE)
WHERE qualified = FALSE
  AND COALESCE((metadata->>'qualified')::boolean, FALSE) = TRUE;

-- Drop HOT-breaking secondary index (`is_golden_pin` is a mutable score-derived flag)
DROP INDEX IF EXISTS public.idx_nc_stage_golden;

-- ============================================================================
-- 3. CREATE RUN-SCOPED CANDIDATE JUNCTION TABLE: newborn_run_candidates
--    Guarantees 100% hunt isolation by `run_id` ("This Hunt" view).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_run_candidates (
  run_id BIGINT NOT NULL REFERENCES public.newborn_runs(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL REFERENCES public.newborn_candidates(pin_id) ON DELETE CASCADE,
  seed_query TEXT,
  surface VARCHAR(64),
  qualified_in_run BOOLEAN NOT NULL DEFAULT TRUE,
  golden_score_in_run DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, pin_id)
) WITH (fillfactor = 80);

-- HOT-safe & sargable secondary indexes (zero volatile counters/timestamps)
CREATE INDEX IF NOT EXISTS idx_nruns_folder_id
  ON public.newborn_runs (folder_id)
  WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nc_last_run_id
  ON public.newborn_candidates (last_run_id)
  WHERE last_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nc_folder_id
  ON public.newborn_candidates (folder_id)
  WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nrc_pin_id
  ON public.newborn_run_candidates (pin_id);

CREATE INDEX IF NOT EXISTS idx_nrc_run_qualified
  ON public.newborn_run_candidates (run_id, qualified_in_run);

-- ============================================================================
-- 4. ALIGN 2026 QUALIFICATION DEFAULTS (Saves-Primary, min_repin_count = 0)
--    Only updates factory 003 default values when untouched by custom overrides.
-- ============================================================================

UPDATE public.app_settings
SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          value,
          '{qualification,min_repin_count}',
          '0'::jsonb,
          true
        ),
        '{qualification,min_save_count}',
        '15'::jsonb,
        true
      ),
      '{qualification,min_repin_per_day}',
      '0'::jsonb,
      true
    ),
    '{qualification,min_save_per_day}',
    '2.0'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE key = 'newborn_engine_settings'
  AND COALESCE((value->'qualification'->>'min_repin_count')::numeric, -1) = 5
  AND COALESCE((value->'qualification'->>'min_save_count')::numeric, -1) = 10;

UPDATE public.newborn_rule_profiles
SET
  qualification_config = qualification_config
    || '{"min_repin_count": 0, "min_save_count": 15, "min_repin_per_day": 0, "min_save_per_day": 2.0}'::jsonb,
  updated_at = NOW()
WHERE slug = 'default-golden-breakout'
  AND COALESCE((qualification_config->>'min_repin_count')::numeric, -1) = 5;

UPDATE public.newborn_rule_profiles
SET
  qualification_config = qualification_config
    || '{"min_repin_count": 0, "min_save_count": 15, "min_repin_per_day": 0, "min_save_per_day": 3.0}'::jsonb,
  updated_at = NOW()
WHERE slug = 'ultra-fresh-7d-rockets'
  AND COALESCE((qualification_config->>'min_repin_count')::numeric, -1) = 8;

-- ============================================================================
-- 5. PURGE POLLUTED PRE-6C STAGING ROWS & EMPTY TEST RUNS
--    Strictly protects promoted & watchlisted rows while removing unverified,
--    unqualified, stale (>30d), and child-repin fake-age clones from staging.
-- ============================================================================

DELETE FROM public.newborn_candidates
WHERE stage IN ('discovered', 'discarded')
  AND (
    COALESCE((metadata->>'qualified')::boolean, FALSE) = FALSE
    OR created_at_pinterest IS NULL
    OR age_days > 30
    OR is_repin = TRUE
  );

-- Clean empty pre-6C test runs that hold zero remaining linked candidates
DELETE FROM public.newborn_runs nr
WHERE (
    nr.candidates_discovered = 0
    OR nr.candidates_qualified = 0
  )
  AND nr.status <> 'running'
  AND NOT EXISTS (
    SELECT 1 FROM public.newborn_run_candidates nrc WHERE nrc.run_id = nr.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.newborn_candidates nc WHERE nc.first_run_id = nr.id OR nc.last_run_id = nr.id
  );
