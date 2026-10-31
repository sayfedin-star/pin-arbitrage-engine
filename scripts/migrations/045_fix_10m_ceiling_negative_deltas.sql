-- Migration 045: Fix 10M+ Pinterest Ceiling Negative Deltas & Restore True Reach
-- Purpose: Restores authentic reach/impressions for accounts clipped by Pinterest's unauthenticated 10M+ ceiling (10,000,001),
--          and zeroes out bogus negative delta spikes (-10.1M).

BEGIN;

UPDATE competitor_profiles cp
SET
  monthly_reach = CASE
    WHEN cp.monthly_reach = 10000001 THEN GREATEST(
      cp.monthly_reach,
      10000001 - LEAST(COALESCE(cp.delta_reach_24h, 0), COALESCE(cp.reach_delta_7d, 0), 0),
      COALESCE((
        SELECT MAX(chs.monthly_reach)
        FROM competitor_history_snapshots chs
        WHERE chs.competitor_id = cp.id AND chs.monthly_reach > 10000001
      ), 10000001)
    )
    ELSE cp.monthly_reach
  END,
  delta_reach_24h = CASE
    WHEN cp.monthly_reach = 10000001 AND COALESCE(cp.delta_reach_24h, 0) < 0 THEN 0
    ELSE cp.delta_reach_24h
  END,
  reach_delta_7d = CASE
    WHEN cp.monthly_reach = 10000001 AND COALESCE(cp.reach_delta_7d, 0) < 0 THEN 0
    ELSE cp.reach_delta_7d
  END,
  profile_views = CASE
    WHEN cp.profile_views = 10000001 THEN GREATEST(
      cp.profile_views,
      10000001 - LEAST(COALESCE(cp.delta_views_24h, 0), COALESCE(cp.views_delta_7d, 0), 0),
      COALESCE((
        SELECT MAX(chs.profile_views)
        FROM competitor_history_snapshots chs
        WHERE chs.competitor_id = cp.id AND chs.profile_views > 10000001
      ), 10000001)
    )
    ELSE cp.profile_views
  END,
  delta_views_24h = CASE
    WHEN cp.profile_views = 10000001 AND COALESCE(cp.delta_views_24h, 0) < 0 THEN 0
    ELSE cp.delta_views_24h
  END,
  views_delta_7d = CASE
    WHEN cp.profile_views = 10000001 AND COALESCE(cp.views_delta_7d, 0) < 0 THEN 0
    ELSE cp.views_delta_7d
  END
WHERE cp.monthly_reach = 10000001 OR cp.profile_views = 10000001;

COMMIT;
