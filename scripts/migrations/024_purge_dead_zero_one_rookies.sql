-- Migration 024: Permanently Purge Dead (0/0 and 1/1) Staged Newborn Rookie Accounts
-- Removes dead accounts from newborn_rookie_accounts whose synced Pinterest
-- telemetry resolved to (monthly_reach = 0, profile_views = 0) OR (1, 1),
-- while preserving all genuine accounts with asymmetric or active reach/impressions.

BEGIN;

WITH deleted_rookies AS (
  DELETE FROM public.newborn_rookie_accounts
  WHERE (
    (COALESCE(monthly_reach, 0) = 0 AND COALESCE(profile_views, 0) = 0)
    OR (COALESCE(monthly_reach, 0) = 1 AND COALESCE(profile_views, 0) = 1)
  )
  RETURNING username
)
SELECT COUNT(*)::int AS deleted_rookies_count FROM deleted_rookies;

COMMIT;
