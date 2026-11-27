-- Migration 023: Permanently Purge Dead Synced Creator Accounts (0/0 and 1/1)
-- Permanently deletes synced non-own, non-system competitor profiles whose
-- Pinterest Total Audience (monthly_reach) and Impressions (profile_views) are
-- both 0 (0, 0) OR both 1 (1, 1), along with any orphaned workspace_watchlist
-- creator entries. Preserves genuine accounts with partial/asymmetric metrics
-- (e.g., 1/424208, 1/47, 1/0) and never deletes own/my_account/system profiles
-- or unsynced profiles awaiting initial telemetry.

BEGIN;

WITH doomed AS (
  SELECT id, LOWER(LTRIM(BTRIM(username), '@')) AS clean_username
  FROM public.competitor_profiles
  WHERE last_synced_at IS NOT NULL
    AND COALESCE(account_type, 'competitor') NOT IN ('own', 'my_account', 'system')
    AND (
      (COALESCE(monthly_reach, 0) = 0 AND COALESCE(profile_views, 0) = 0)
      OR (COALESCE(monthly_reach, 0) = 1 AND COALESCE(profile_views, 0) = 1)
    )
),
unlinked_rookies AS (
  UPDATE public.newborn_rookie_accounts nra
  SET promoted_competitor_id = NULL,
      updated_at = NOW()
  FROM doomed d
  WHERE nra.promoted_competitor_id = d.id
  RETURNING nra.username
),
cleaned_watchlist AS (
  DELETE FROM public.workspace_watchlist ww
  USING doomed d
  WHERE ww.entity_type = 'creator'
    AND LOWER(LTRIM(BTRIM(ww.entity_key), '@')) = d.clean_username
  RETURNING ww.id
),
deleted_profiles AS (
  DELETE FROM public.competitor_profiles cp
  USING doomed d
  WHERE cp.id = d.id
  RETURNING cp.id
)
SELECT
  (SELECT COUNT(*)::int FROM deleted_profiles) AS deleted_profiles_count,
  (SELECT COUNT(*)::int FROM cleaned_watchlist) AS deleted_watchlist_count,
  (SELECT COUNT(*)::int FROM unlinked_rookies) AS unlinked_rookies_count;

COMMIT;
