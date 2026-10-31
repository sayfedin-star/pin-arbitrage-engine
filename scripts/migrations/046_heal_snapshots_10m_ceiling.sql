-- Migration 046: Heal 10M+ Ceiling (10,000,001) Artifacts in competitor_history_snapshots
-- Purpose: Restores authentic monthly_reach and profile_views in competitor_history_snapshots
--          where Pinterest's unauthenticated 10,000,001 ceiling overwrote multi-10M metrics,
--          eliminating the bogus -10,192,906 (-50.5%) drop in Creator Profile charts & snapshot logs.

BEGIN;

WITH authentic_peaks AS (
  SELECT
    chs.id AS snapshot_id,
    chs.competitor_id,
    GREATEST(
      chs.monthly_reach,
      COALESCE(cp.monthly_reach, 0),
      COALESCE((
        SELECT MAX(prev.monthly_reach)
        FROM competitor_history_snapshots prev
        WHERE prev.competitor_id = chs.competitor_id
          AND prev.recorded_date <= chs.recorded_date
          AND prev.monthly_reach > 10000001
      ), 0)
    ) AS healed_reach,
    GREATEST(
      chs.profile_views,
      COALESCE(cp.profile_views, 0),
      COALESCE((
        SELECT MAX(prev.profile_views)
        FROM competitor_history_snapshots prev
        WHERE prev.competitor_id = chs.competitor_id
          AND prev.recorded_date <= chs.recorded_date
          AND prev.profile_views > 10000001
      ), 0)
    ) AS healed_views
  FROM competitor_history_snapshots chs
  JOIN competitor_profiles cp ON cp.id = chs.competitor_id
  WHERE chs.monthly_reach = 10000001
     OR chs.profile_views = 10000001
)
UPDATE competitor_history_snapshots chs
SET
  monthly_reach = CASE
    WHEN chs.monthly_reach = 10000001 AND ap.healed_reach > 10000001 THEN ap.healed_reach
    ELSE chs.monthly_reach
  END,
  profile_views = CASE
    WHEN chs.profile_views = 10000001 AND ap.healed_views > 10000001 THEN ap.healed_views
    ELSE chs.profile_views
  END,
  metadata = CASE
    WHEN jsonb_typeof(chs.metadata) = 'object' THEN
      chs.metadata || jsonb_build_object(
        'delta_reach_24h', GREATEST(COALESCE((chs.metadata->>'delta_reach_24h')::bigint, 0), 0),
        'reach_delta_7d', GREATEST(COALESCE((chs.metadata->>'reach_delta_7d')::bigint, 0), 0),
        'delta_views_24h', GREATEST(COALESCE((chs.metadata->>'delta_views_24h')::bigint, 0), 0),
        'views_delta_7d', GREATEST(COALESCE((chs.metadata->>'views_delta_7d')::bigint, 0), 0)
      )
    ELSE chs.metadata
  END
FROM authentic_peaks ap
WHERE chs.id = ap.snapshot_id
  AND (ap.healed_reach > 10000001 OR ap.healed_views > 10000001);

COMMIT;
