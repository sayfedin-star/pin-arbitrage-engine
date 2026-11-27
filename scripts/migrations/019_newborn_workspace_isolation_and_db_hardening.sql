-- scripts/migrations/019_newborn_workspace_isolation_and_db_hardening.sql
-- Version: 019 (newborn_workspace_isolation_and_db_hardening)
--
-- Transaction-safe, idempotent live remediation:
--   1. Delete polluted null-rank rows from public.keyword_serp_positions
--   2. Deactivate stale 'search' rows in public.campaign_tracked_pins beyond serp_top_n
--   3. Reconcile active 'newborn' tracked pins whose newborn_candidates.stage = 'discarded' -> 'promoted'
--   4. Add chk_ksp_requires_rank_or_last_known CHECK constraint on keyword_serp_positions
--   5. Workspace-scope public.newborn_rule_profiles with UNIQUE (workspace_id, slug)
--   6. Drop 7 verified zero-scan (idx_scan = 0) bloat indexes
--   7. Tune HOT-update fillfactor on newborn_candidates, newborn_run_candidates, campaign_tracked_pins, app_settings

-- 1. Clean polluted null-rank rows before enforcing CHECK constraint
DELETE FROM public.keyword_serp_positions
WHERE rank_position IS NULL
  AND last_known_rank IS NULL;

-- 2. Deactivate stale 'search' rows outside active Top-N of any folder keyword
-- (Strictly leaves source_type IN ('newborn', 'creator', 'related') untouched)
UPDATE public.campaign_tracked_pins ctp
SET is_active = FALSE
FROM public.keyword_folders kf
WHERE kf.id = ctp.folder_id
  AND ctp.source_type = 'search'
  AND ctp.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.keyword_folder_items kfi
    JOIN public.keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
    WHERE kfi.folder_id = ctp.folder_id
      AND ksp.pin_id = ctp.pin_id
      AND ksp.is_displaced = FALSE
      AND ksp.rank_position IS NOT NULL
      AND ksp.rank_position >= 1
      AND ksp.rank_position <= LEAST(100, GREATEST(5, COALESCE(kf.serp_top_n, 20)))
  );

-- 3. Reconcile active 'newborn' tracked pins stuck with stage = 'discarded' (e.g. Folder #5)
UPDATE public.newborn_candidates nc
SET
  stage = 'promoted',
  promoted_at = COALESCE(nc.promoted_at, NOW()),
  updated_at = NOW()
WHERE nc.stage = 'discarded'
  AND EXISTS (
    SELECT 1
    FROM public.campaign_tracked_pins ctp
    WHERE ctp.pin_id = nc.pin_id
      AND ctp.source_type = 'newborn'
      AND ctp.is_active = TRUE
  );

-- 4. Prevent bogus Vault #100 / rankless SERP pollution at the PostgreSQL layer
ALTER TABLE public.keyword_serp_positions
  DROP CONSTRAINT IF EXISTS chk_ksp_requires_rank_or_last_known,
  ADD CONSTRAINT chk_ksp_requires_rank_or_last_known
  CHECK (rank_position IS NOT NULL OR last_known_rank IS NOT NULL);

-- 5. Workspace-scope public.newborn_rule_profiles
ALTER TABLE public.newborn_rule_profiles
  ADD COLUMN IF NOT EXISTS workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.newborn_rule_profiles
  DROP CONSTRAINT IF EXISTS newborn_rule_profiles_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nrp_workspace_slug
  ON public.newborn_rule_profiles (workspace_id, slug);

-- 6. Drop verified idx_scan = 0 bloat indexes
DROP INDEX IF EXISTS public.idx_nc_visual_annotations_tags_gin;
DROP INDEX IF EXISTS public.idx_ctp_workspace_pin;
DROP INDEX IF EXISTS public.idx_nc_effective_creator;
DROP INDEX IF EXISTS public.idx_nc_clean_domain;
DROP INDEX IF EXISTS public.idx_ncs_recorded_date;
DROP INDEX IF EXISTS public.idx_newborn_keyword_clusters_seed_lookup;
DROP INDEX IF EXISTS public.idx_newborn_runs_cluster_id;

-- 7. Tune fillfactor for PG16 HOT updates on high-churn tables
ALTER TABLE public.newborn_candidates SET (fillfactor = 80);
ALTER TABLE public.newborn_run_candidates SET (fillfactor = 85);
ALTER TABLE public.campaign_tracked_pins SET (fillfactor = 85);
ALTER TABLE public.app_settings SET (fillfactor = 70);
