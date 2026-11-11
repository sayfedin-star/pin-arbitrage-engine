-- =============================================================================
-- Migration 051: Unified Single-Database Architecture Consolidation (Round 31)
-- =============================================================================
-- Purpose:
--   1. Retire legacy multi-shard routing registry table (`neon_projects_registry`)
--      inherited from the 99-shard Neon architecture.
--   2. Ensure unified single-DB compatibility view (`keyword_pins_snapshots`)
--      and composite indexes on `universal_master_pins`, `pins_daily_metrics`,
--      `pin_serp_positions`, and `keyword_serp_current` are cleanly enforced.
-- =============================================================================

BEGIN;

-- 1. Retire legacy shard registry table if present
DROP TABLE IF EXISTS neon_projects_registry CASCADE;

-- 2. Ensure Unified Single-DB Compatibility View for keyword_pins_snapshots
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'keyword_pins_snapshots'
      AND table_type = 'BASE TABLE'
  ) THEN
    DROP TABLE public.keyword_pins_snapshots CASCADE;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.keyword_pins_snapshots AS
SELECT
  (('x' || SUBSTR(MD5(psp.pin_id || '_' || psp.snapshot_date::text || '_' || psp.keyword_id::text), 1, 15))::bit(60)::bigint) AS id,
  psp.keyword_id,
  psp.pin_id,
  psp.rank_position,
  COALESCE(pdm.save_count, ump.save_count, 0)::bigint AS save_count,
  COALESCE(pdm.repin_count, ump.repin_count, 0)::int AS repin_count,
  COALESCE(pdm.comment_count, ump.comment_count, 0)::int AS comment_count,
  COALESCE(pdm.share_count, ump.share_count, 0)::int AS share_count,
  COALESCE(pdm.daily_save_velocity, ump.daily_save_velocity, 0)::numeric(12,2) AS daily_save_velocity,
  ump.title,
  ump.description,
  ump.image_url,
  ump.destination_url,
  ump.domain,
  ump.creator_username,
  ump.board_name,
  ump.dominant_color,
  ump.created_at_pinterest,
  ump.is_video,
  ump.is_product,
  COALESCE(ump.creation_method, 'pinterest_platform') AS creation_method,
  COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations,
  COALESCE(ump.metadata, '{}'::jsonb) AS metadata,
  psp.is_displaced,
  psp.last_known_rank,
  psp.snapshot_date,
  COALESCE(pdm.updated_at, psp.updated_at, NOW()) AS crawled_at,
  COALESCE(pdm.updated_at, psp.updated_at, NOW()) AS created_at,
  COALESCE(pdm.updated_at, psp.updated_at, NOW()) AS updated_at
FROM public.pin_serp_positions psp
LEFT JOIN public.pins_daily_metrics pdm
  ON pdm.pin_id = psp.pin_id AND pdm.snapshot_date = psp.snapshot_date
LEFT JOIN public.universal_master_pins ump
  ON ump.pin_id = psp.pin_id;

-- 3. Ensure High-Performance Unified Single-DB Indexes
CREATE INDEX IF NOT EXISTS idx_ump_domain_saves
  ON public.universal_master_pins (LOWER(TRIM(domain)), save_count DESC);

CREATE INDEX IF NOT EXISTS idx_pdm_pin_snapshot_desc
  ON public.pins_daily_metrics (pin_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_psp_keyword_snapshot_rank
  ON public.pin_serp_positions (keyword_id, snapshot_date DESC, rank_position ASC);

COMMIT;
