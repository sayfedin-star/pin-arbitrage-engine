-- Migration 064: Cleanup, Orphan Hygiene & Index Hygiene
-- 1. Drops legacy pre-060 tables if still present (pin_metrics_snapshots, _backup_keyword_displaced_pins).
-- 2. Drops duplicate / leading-prefix / unused bloat indexes verified on live PostgreSQL 16.
-- 3. Replaces unbounded btree idx_ump_destination_url with B-tree-safe functional md5 index (keeps idx_ump_is_hydrated intact).
-- 4. Resets placeholder dominant_color = '#888888' to NULL without deleting any pin rows.
-- 5. Removes any orphan child rows in competitor_board_pins, pins_daily_metrics, keyword_serp_positions.

BEGIN;

SET LOCAL lock_timeout = '3000';

-- 1. Drop leftover pre-060 tables if present
DROP TABLE IF EXISTS public.pin_metrics_snapshots CASCADE;
DROP TABLE IF EXISTS public._backup_keyword_displaced_pins CASCADE;

-- 2. Drop verified duplicate, leading-prefix, and unused bloat indexes
DROP INDEX IF EXISTS public.idx_cbp_board;
DROP INDEX IF EXISTS public.idx_kw_folder_items_folder;
DROP INDEX IF EXISTS public.idx_fci_folder_id;
DROP INDEX IF EXISTS public.idx_competitor_boards_comp_id;
DROP INDEX IF EXISTS public.idx_csp_comp_pin;
DROP INDEX IF EXISTS public.idx_csp_comp_id;
DROP INDEX IF EXISTS public.idx_crn_comp_seed;
DROP INDEX IF EXISTS public.idx_ksp_pin_displaced_rank;
DROP INDEX IF EXISTS public.idx_ump_visual_annotations_gin;
DROP INDEX IF EXISTS public.idx_ump_destination_url;

-- 3. Preserve immutable pin_id lookup index on keyword_serp_positions & B-tree-safe MD5 destination_url index
CREATE INDEX IF NOT EXISTS idx_ksp_pin_id
  ON public.keyword_serp_positions (pin_id);

CREATE INDEX IF NOT EXISTS idx_ump_destination_url_md5
  ON public.universal_master_pins ((md5(destination_url)))
  WHERE destination_url IS NOT NULL AND destination_url <> '';

-- 4. Clean placeholder dominant_color = '#888888' without deleting pins
UPDATE public.universal_master_pins
SET dominant_color = NULL
WHERE dominant_color = '#888888';

-- 5. Remove orphan rows in child SSOT tables with no parent row in universal_master_pins
DELETE FROM public.competitor_board_pins cbp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins u WHERE u.pin_id = cbp.pin_id
);

DELETE FROM public.pins_daily_metrics pdm
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins u WHERE u.pin_id = pdm.pin_id
);

DELETE FROM public.keyword_serp_positions ksp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins u WHERE u.pin_id = ksp.pin_id
);

-- 6. Record migration in schema_migrations
INSERT INTO public.schema_migrations (version, name, checksum, applied_at)
VALUES ('064', 'cleanup_and_index_hygiene', 'phase5_cleanup_index_hygiene_064', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
