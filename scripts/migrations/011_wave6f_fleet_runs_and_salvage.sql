-- ============================================================================
-- scripts/migrations/011_wave6f_fleet_runs_and_salvage.sql
-- Version: 011 (wave6f_fleet_runs_and_salvage)
--
-- Wave 6F:
--   1. Extends `public.newborn_runs` with Fleet sharding, config snapshot,
--      selected keywords, GitHub Actions run correlation, and cooperative
--      cancellation tracking columns.
--   2. Expands `chk_nr_status` to support queued, partial_rate_limited,
--      and cancelled lifecycle states.
--   3. Adds `chk_nr_execution_mode` (`direct` | `fleet`).
--
-- POSTGRESQL 16 HOT-UPDATE HYGIENE:
--   - Intentionally creates ZERO secondary indexes on `newborn_runs` for
--     frequently updated columns so Heap-Only Tuple (HOT) updates remain
--     intact under concurrent 20-shard Fleet writes.
-- ============================================================================

ALTER TABLE public.newborn_runs
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shards_total INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shards_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shards_failed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_run_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_run_url TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

ALTER TABLE public.newborn_runs
  DROP CONSTRAINT IF EXISTS chk_nr_status;

ALTER TABLE public.newborn_runs
  ADD CONSTRAINT chk_nr_status CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'partial',
      'partial_rate_limited',
      'cancelled',
      'failed'
    )
  );

ALTER TABLE public.newborn_runs
  DROP CONSTRAINT IF EXISTS chk_nr_execution_mode;

ALTER TABLE public.newborn_runs
  ADD CONSTRAINT chk_nr_execution_mode CHECK (
    execution_mode IN ('direct', 'fleet')
  );
