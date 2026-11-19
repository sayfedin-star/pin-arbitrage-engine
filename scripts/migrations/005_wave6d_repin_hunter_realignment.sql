-- ============================================================================
-- scripts/migrations/005_wave6d_repin_hunter_realignment.sql
-- Version: 005 (wave6d_repin_hunter_realignment)
--
-- Wave 6D: Realigns factory defaults in `app_settings` and `newborn_rule_profiles`
-- for the Pure Deep-Scroll Golden Pin Hunter:
--   - Primary engagement gate: `min_repin_count` (default 20)
--   - Optional conditional Saves gate: `min_save_count` (default 0 = ignored)
--   - Strict opt-in defaults: `auto_track_enabled = false`, `auto_fetch_accounts = false`
--   - Deep-scroll hydration budget raised to 500 pins/run
--
-- Strictly additive & idempotent, zero CONCURRENTLY (transactional-safe).
-- Migrations 001..004 are left untouched.
-- ============================================================================

-- 1. Realign global newborn_engine_settings factory defaults (preserving custom overrides)
UPDATE public.app_settings
SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(value, '{}'::jsonb),
                '{qualification,min_repin_count}',
                '20'::jsonb,
                true
              ),
              '{qualification,min_save_count}',
              '0'::jsonb,
              true
            ),
            '{qualification,min_repin_per_day}',
            '0'::jsonb,
            true
          ),
          '{qualification,min_save_per_day}',
          '0'::jsonb,
          true
        ),
        '{discovery,hydration,auto_fetch_accounts}',
        'false'::jsonb,
        true
      ),
      '{discovery,hydration,max_pin_hydrations_per_run}',
      '500'::jsonb,
      true
    ),
    '{automation,auto_track_enabled}',
    'false'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE key = 'newborn_engine_settings'
  AND COALESCE((value->'qualification'->>'min_repin_count')::numeric, -1) IN (0, 5)
  AND COALESCE((value->'qualification'->>'min_save_count')::numeric, -1) IN (10, 15);

-- 2. Realign seeded default rule profiles to Re-pins primary + Saves optional (0)
UPDATE public.newborn_rule_profiles
SET
  description = 'Deep-scroll 30-day Golden Pin Hunter gated by verified root age and Re-pins >= 20 (Saves optional).',
  qualification_config = qualification_config
    || '{"min_repin_count": 20, "min_save_count": 0, "min_repin_per_day": 0, "min_save_per_day": 0}'::jsonb,
  updated_at = NOW()
WHERE slug = 'default-golden-breakout'
  AND COALESCE((qualification_config->>'min_repin_count')::numeric, -1) IN (0, 5);

UPDATE public.newborn_rule_profiles
SET
  description = 'Ultra-fresh 7-day Golden Pin Hunter gated by verified root age <= 7d and Re-pins >= 20.',
  qualification_config = qualification_config
    || '{"min_repin_count": 20, "min_save_count": 0, "min_repin_per_day": 0, "min_save_per_day": 0}'::jsonb,
  updated_at = NOW()
WHERE slug = 'ultra-fresh-7d-rockets'
  AND COALESCE((qualification_config->>'min_repin_count')::numeric, -1) IN (0, 8);
