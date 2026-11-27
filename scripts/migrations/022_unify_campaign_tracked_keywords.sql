-- Migration 022: Unify Campaign Tracked Pins with Keywords Fleet (keyword_folder_items)
-- Backfills authentic source seed_query keywords from active campaign_tracked_pins
-- into tracked_keywords and links them to their target Campaign Folder in keyword_folder_items
-- without fabricating keyword_serp_positions rows.
-- 100% idempotent and safe to run repeatedly.

DO $$
DECLARE
  rec RECORD;
  v_kw TEXT;
  v_slug TEXT;
  v_kw_id INT;
BEGIN
  IF to_regclass('public.campaign_tracked_pins') IS NULL
     OR to_regclass('public.tracked_keywords') IS NULL
     OR to_regclass('public.keyword_folder_items') IS NULL
     OR to_regclass('public.keyword_folders') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT DISTINCT
      ctp.folder_id,
      LOWER(TRIM(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(ctp.seed_query), ''), CASE WHEN LOWER(COALESCE(ctp.source_type, '')) = 'newborn' THEN NULLIF(TRIM(ctp.source_ref), '') ELSE NULL END), '\s+', ' ', 'g'))) AS norm_kw
    FROM campaign_tracked_pins ctp
    INNER JOIN keyword_folders kf ON kf.id = ctp.folder_id
    WHERE ctp.is_active = TRUE
      AND COALESCE(NULLIF(TRIM(ctp.seed_query), ''), CASE WHEN LOWER(COALESCE(ctp.source_type, '')) = 'newborn' THEN NULLIF(TRIM(ctp.source_ref), '') ELSE NULL END) IS NOT NULL
  LOOP
    v_kw := rec.norm_kw;
    IF v_kw IS NULL
       OR LENGTH(v_kw) < 2
       OR LENGTH(v_kw) > 120
       OR v_kw ~ '^[0-9]+$'
       OR v_kw ~ '^(snowball|related|creator|board|pin|seed|run|kw|url|https?):'
       OR v_kw ~ '^serp_top_[0-9]+$'
       OR v_kw IN ('pin_dossier', 'manual', 'unknown', 'newborn', 'search', 'creator', 'related', 'discovered', 'discover_promote', 'campaign_send', 'watchlist', 'ui') THEN
      CONTINUE;
    END IF;

    v_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(v_kw, '[^a-z0-9]+', '-', 'g'));
    IF v_slug IS NULL OR v_slug = '' THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_kw_id
    FROM tracked_keywords
    WHERE LOWER(keyword) = v_kw
       OR canonical_keyword = v_slug
    ORDER BY id ASC
    LIMIT 1;

    IF v_kw_id IS NULL THEN
      INSERT INTO tracked_keywords (
        keyword,
        category,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        v_kw,
        'Newborn Discovery',
        TRUE,
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING;

      SELECT id INTO v_kw_id
      FROM tracked_keywords
      WHERE LOWER(keyword) = v_kw
         OR canonical_keyword = v_slug
      ORDER BY id ASC
      LIMIT 1;
    END IF;

    IF v_kw_id IS NOT NULL THEN
      INSERT INTO keyword_folder_items (folder_id, keyword_id, added_at)
      VALUES (rec.folder_id, v_kw_id, NOW())
      ON CONFLICT (folder_id, keyword_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
