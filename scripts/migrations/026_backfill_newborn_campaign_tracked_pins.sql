-- Migration 026: Backfill promoted Newborn pins and active Newborn daily anchors into campaign_tracked_pins
-- Ensures 100% SSOT parity so no promoted pin ever appears orphaned from its Campaign Folder.

INSERT INTO campaign_tracked_pins (
  folder_id,
  workspace_id,
  pin_id,
  source_type,
  source_ref,
  is_active,
  added_at,
  seed_query
)
SELECT DISTINCT ON (src.folder_id, src.pin_id)
  src.folder_id,
  COALESCE(kf.workspace_id, 1) AS workspace_id,
  src.pin_id,
  'newborn'::text AS source_type,
  'migration_026_backfill'::text AS source_ref,
  TRUE AS is_active,
  COALESCE(src.added_at, NOW()) AS added_at,
  src.seed_query
FROM (
  SELECT
    nc.folder_id,
    nc.pin_id,
    nc.seed_query,
    COALESCE(nc.promoted_at, nc.updated_at, nc.first_seen_at) AS added_at,
    0 AS priority
  FROM newborn_candidates nc
  WHERE nc.folder_id IS NOT NULL
    AND nc.pin_id ~ '^[0-9]{6,30}$'
    AND (
      nc.stage = 'promoted'
      OR EXISTS (
        SELECT 1 FROM newborn_daily_anchors nda
        WHERE nda.pin_id = nc.pin_id AND nda.is_active = TRUE
      )
    )
  UNION ALL
  SELECT
    nda.folder_id,
    nda.pin_id,
    nda.seed_query,
    COALESCE(nda.promoted_at, nda.updated_at) AS added_at,
    1 AS priority
  FROM newborn_daily_anchors nda
  WHERE nda.folder_id IS NOT NULL
    AND nda.is_active = TRUE
    AND nda.pin_id ~ '^[0-9]{6,30}$'
) src
JOIN keyword_folders kf ON kf.id = src.folder_id
ORDER BY src.folder_id ASC, src.pin_id ASC, src.priority ASC, src.added_at DESC NULLS LAST
ON CONFLICT (folder_id, pin_id, source_type) DO UPDATE SET
  is_active = TRUE,
  seed_query = COALESCE(NULLIF(EXCLUDED.seed_query, ''), campaign_tracked_pins.seed_query);
