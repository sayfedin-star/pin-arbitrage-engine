-- scripts/migrations/025_ssot_cookie_e1_purge_and_creator_unification.sql
-- Version: 025 (ssot_cookie_e1_purge_and_creator_unification)
--
-- Transaction-safe, 100% idempotent SSOT unification migration:
--   1. Migrate WS 1 Pinterest session cookie from legacy app_settings into workspace_settings.pinterest_cookie_enc SSOT,
--      then purge legacy app_settings cookie keys ('newborn_pinterest_cookie', 'pinterest_cookie').
--   2. Purge 100% of obfuscated 'e1_%' poisoned pin rows across all pin & telemetry tables
--      (preserving valid numeric Snowflake Pin IDs and 'vis_*' visual search cache entries).
--   3. Backfill missing clean_domain on universal_master_pins from destination_url.
--   4. Sync authentic numeric creator-authored pins from universal_master_pins into competitor_board_pins
--      so Creator Hub tables stay in strict SSOT parity.

BEGIN;

-- 1. Unify Pinterest Session Cookie into workspace_settings.pinterest_cookie_enc (WS 1 SSOT)
DO $$
DECLARE
  v_legacy_cookie TEXT := NULL;
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL
     AND to_regclass('public.workspace_settings') IS NOT NULL THEN

    SELECT COALESCE(
      NULLIF(BTRIM(CASE WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}' ELSE NULL END), ''),
      NULLIF(BTRIM(value->>'cookie'), ''),
      NULLIF(BTRIM(value->>'raw'), ''),
      NULLIF(BTRIM(value->>'value'), ''),
      NULLIF(BTRIM(value->>'pinterest_cookie'), '')
    )
    INTO v_legacy_cookie
    FROM public.app_settings
    WHERE key IN ('newborn_pinterest_cookie', 'pinterest_cookie')
    ORDER BY CASE key WHEN 'newborn_pinterest_cookie' THEN 0 ELSE 1 END, updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_legacy_cookie IS NOT NULL AND LENGTH(v_legacy_cookie) > 10 THEN
      INSERT INTO public.workspace_settings (workspace_id, pinterest_cookie_enc, updated_at)
      VALUES (1, v_legacy_cookie, NOW())
      ON CONFLICT (workspace_id) DO UPDATE SET
        pinterest_cookie_enc = CASE
          WHEN workspace_settings.pinterest_cookie_enc IS NULL OR BTRIM(workspace_settings.pinterest_cookie_enc) = ''
            THEN EXCLUDED.pinterest_cookie_enc
          ELSE workspace_settings.pinterest_cookie_enc
        END,
        updated_at = NOW();
    END IF;

    -- Remove obsolete legacy cookie keys from app_settings once WS 1 SSOT is ensured
    DELETE FROM public.app_settings
    WHERE key IN ('newborn_pinterest_cookie', 'pinterest_cookie');
  END IF;
END $$;

-- 2. Purge 100% of obfuscated 'e1_%' poisoned rows across every pin & telemetry table
DO $$
BEGIN
  IF to_regclass('public.competitor_board_pins') IS NOT NULL THEN
    DELETE FROM public.competitor_board_pins WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.pins_daily_metrics') IS NOT NULL THEN
    DELETE FROM public.pins_daily_metrics WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.keyword_serp_positions') IS NOT NULL THEN
    DELETE FROM public.keyword_serp_positions WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.keyword_ignored_pins') IS NOT NULL THEN
    DELETE FROM public.keyword_ignored_pins WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.campaign_tracked_pins') IS NOT NULL THEN
    DELETE FROM public.campaign_tracked_pins WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.newborn_candidate_snapshots') IS NOT NULL THEN
    DELETE FROM public.newborn_candidate_snapshots WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.newborn_run_candidates') IS NOT NULL THEN
    DELETE FROM public.newborn_run_candidates WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.newborn_candidates') IS NOT NULL THEN
    DELETE FROM public.newborn_candidates WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.competitor_seed_pins') IS NOT NULL THEN
    DELETE FROM public.competitor_seed_pins WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.candidate_graph_nodes') IS NOT NULL THEN
    DELETE FROM public.candidate_graph_nodes
    WHERE seed_pin_id LIKE 'e1\_%' ESCAPE '\'
       OR candidate_pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;

  IF to_regclass('public.universal_master_pins') IS NOT NULL THEN
    DELETE FROM public.universal_master_pins WHERE pin_id LIKE 'e1\_%' ESCAPE '\';
  END IF;
END $$;

-- 3. Backfill missing clean_domain on universal_master_pins for valid external destination URLs
DO $$
BEGIN
  IF to_regclass('public.universal_master_pins') IS NOT NULL THEN
    UPDATE public.universal_master_pins
    SET clean_domain = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(destination_url, '^https?://(www\.)?', ''), '/.*$', '')),
        updated_at = NOW()
    WHERE (clean_domain IS NULL OR BTRIM(clean_domain) = '')
      AND destination_url IS NOT NULL
      AND destination_url ~* '^https?://[^/]+'
      AND destination_url NOT ILIKE '%pinterest.%'
      AND destination_url NOT ILIKE '%pin.it%';
  END IF;
END $$;

-- 4. Sync authentic numeric creator-authored pins from universal_master_pins into competitor_board_pins
DO $$
BEGIN
  IF to_regclass('public.competitor_profiles') IS NOT NULL
     AND to_regclass('public.universal_master_pins') IS NOT NULL
     AND to_regclass('public.competitor_board_pins') IS NOT NULL THEN
    INSERT INTO public.competitor_board_pins (competitor_id, board_id, pin_id, discovered_at)
    SELECT DISTINCT ON (cp.id, ump.pin_id)
      cp.id AS competitor_id,
      LEFT(COALESCE(NULLIF(BTRIM(ump.board_slug), ''), 'default'), 64) AS board_id,
      ump.pin_id,
      COALESCE(ump.first_discovered_at, NOW())
    FROM public.competitor_profiles cp
    INNER JOIN public.universal_master_pins ump
      ON LOWER(LTRIM(BTRIM(COALESCE(ump.creator_username, '')), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
    WHERE cp.username IS NOT NULL
      AND BTRIM(cp.username) <> ''
      AND ump.pin_id ~ '^[0-9]{10,30}$'
      AND NOT EXISTS (
        SELECT 1 FROM public.competitor_board_pins ex
        WHERE ex.competitor_id = cp.id AND ex.pin_id = ump.pin_id
      )
    ORDER BY cp.id, ump.pin_id, ump.first_discovered_at ASC NULLS LAST
    ON CONFLICT (competitor_id, board_id, pin_id) DO NOTHING;
  END IF;
END $$;

COMMIT;
