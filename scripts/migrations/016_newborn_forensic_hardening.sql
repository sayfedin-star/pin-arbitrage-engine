-- 016_newborn_forensic_hardening.sql
-- Forensic Audit Hardening for Discover on Newboard:
-- 1. Separate discovery_board_name/url from pin_board_name/url on newborn_candidates
-- 2. Add per-run multi-surface attribution (surfaces JSONB) on newborn_run_candidates
-- 3. Strip fake 'pin_resource' from discovered_surfaces & backfill clean board/surface metadata
-- 4. Repair flipped is_linkless flags on internal/empty destination URLs
-- 5. Unpoison newborn_keyword_clusters JSONB entries where volume_enriched=true with NULL volume
-- 6. Recover ghost campaign_tracked_pins rows missing from universal_master_pins / pins_daily_metrics / newborn_daily_anchors
-- 7. Default workspace execution_mode from 'auto' to 'fleet' (20 Runners)

-- 1. Schema extensions (idempotent)
ALTER TABLE public.newborn_candidates
  ADD COLUMN IF NOT EXISTS discovery_board_name TEXT,
  ADD COLUMN IF NOT EXISTS discovery_board_url TEXT,
  ADD COLUMN IF NOT EXISTS pin_board_name TEXT,
  ADD COLUMN IF NOT EXISTS pin_board_url TEXT;

ALTER TABLE public.newborn_run_candidates
  ADD COLUMN IF NOT EXISTS surfaces JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Backfill separated board attribution on newborn_candidates
UPDATE public.newborn_candidates
SET
  discovery_board_name = COALESCE(discovery_board_name, NULLIF(btrim(board_name), '')),
  discovery_board_url  = COALESCE(discovery_board_url, NULLIF(btrim(board_url), ''))
WHERE first_surface IN ('board_more_ideas', 'board_feed')
  AND (board_name IS NOT NULL OR board_url IS NOT NULL)
  AND (discovery_board_name IS NULL OR discovery_board_url IS NULL);

UPDATE public.newborn_candidates
SET
  pin_board_name = COALESCE(pin_board_name, NULLIF(btrim(board_name), '')),
  pin_board_url  = COALESCE(pin_board_url, NULLIF(btrim(board_url), ''))
WHERE first_surface NOT IN ('board_more_ideas', 'board_feed')
  AND (board_name IS NOT NULL OR board_url IS NOT NULL)
  AND (pin_board_name IS NULL OR pin_board_url IS NULL);

-- 3. Backfill per-run surfaces JSONB on newborn_run_candidates
UPDATE public.newborn_run_candidates
SET surfaces = jsonb_build_array(surface)
WHERE (surfaces IS NULL OR surfaces = '[]'::jsonb)
  AND surface IS NOT NULL
  AND btrim(surface) <> ''
  AND surface <> 'pin_resource';

-- 4. Strip fake 'pin_resource' from discovered_surfaces & repair first_surface if needed
UPDATE public.newborn_candidates
SET
  discovered_surfaces = COALESCE(discovered_surfaces - 'pin_resource', '[]'::jsonb),
  first_surface = CASE
    WHEN first_surface = 'pin_resource' THEN
      COALESCE(NULLIF((discovered_surfaces - 'pin_resource')->>0, ''), 'pin_serp_capsules')
    ELSE first_surface
  END,
  updated_at = NOW()
WHERE (discovered_surfaces ? 'pin_resource')
   OR first_surface = 'pin_resource';

-- 5. Repair flipped is_linkless rows where destination_url is empty or internal Pinterest domain
UPDATE public.newborn_candidates
SET
  is_linkless = TRUE,
  destination_url = CASE
    WHEN clean_domain IS NOT NULL AND lower(clean_domain) ~ '(^|\.)(pinterest\.|pin\.it)' THEN NULL
    ELSE destination_url
  END,
  clean_domain = CASE
    WHEN clean_domain IS NOT NULL AND lower(clean_domain) ~ '(^|\.)(pinterest\.|pin\.it)' THEN NULL
    ELSE clean_domain
  END,
  updated_at = NOW()
WHERE is_linkless = FALSE
  AND (
    destination_url IS NULL
    OR btrim(destination_url) = ''
    OR clean_domain IS NULL
    OR lower(clean_domain) ~ '(^|\.)(pinterest\.|pin\.it)'
  );

-- 6. Unpoison newborn_keyword_clusters rows marked volume_enriched=true with NULL volume
WITH cleaned_clusters AS (
  SELECT
    c.id,
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN COALESCE((el->>'volume_enriched')::boolean, false) = true
             AND (el->>'volume' IS NULL OR btrim(COALESCE(el->>'volume', '')) = '')
            THEN (el - 'volume_error' - 'volume_error_reason') || jsonb_build_object('volume_enriched', false)
            ELSE el
          END
          ORDER BY ord
        )
        FROM jsonb_array_elements(COALESCE(c.keywords, '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
      ),
      '[]'::jsonb
    ) AS fixed_keywords
  FROM public.newborn_keyword_clusters c
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(c.keywords, '[]'::jsonb)) AS el
    WHERE COALESCE((el->>'volume_enriched')::boolean, false) = true
      AND (el->>'volume' IS NULL OR btrim(COALESCE(el->>'volume', '')) = '')
  )
),
recounted AS (
  SELECT
    id,
    fixed_keywords,
    (
      SELECT COUNT(*)::int
      FROM jsonb_array_elements(fixed_keywords) AS el
      WHERE COALESCE((el->>'volume_enriched')::boolean, false) = true
    ) AS new_enriched_count,
    (
      SELECT COUNT(*)::int
      FROM jsonb_array_elements(fixed_keywords) AS el
      WHERE COALESCE((el->>'volume_enriched')::boolean, false) = false
    ) AS new_remaining_count
  FROM cleaned_clusters
)
UPDATE public.newborn_keyword_clusters c
SET
  keywords = r.fixed_keywords,
  enriched_count = r.new_enriched_count,
  metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
    'remaining_unenriched_count', r.new_remaining_count,
    'unpoisoned_at', NOW()
  ),
  updated_at = NOW()
FROM recounted r
WHERE c.id = r.id;

-- 7. Recover ghost campaign_tracked_pins rows missing from universal_master_pins / pins_daily_metrics / newborn_daily_anchors
INSERT INTO public.universal_master_pins (
  pin_id, creator_username, board_id, board_name,
  title, domain, clean_domain, destination_url,
  image_url, description, alt_text, dominant_color,
  visual_annotations, created_at_pinterest,
  first_discovered_pillar, first_discovered_at,
  save_count, repin_count, comment_count, share_count, reaction_count,
  is_hydrated, daily_save_velocity, daily_repin_velocity,
  is_product, is_video, creation_method, image_signature, is_repin,
  last_scraped_at, updated_at, metadata
)
SELECT DISTINCT ON (nc.pin_id)
  nc.pin_id,
  COALESCE(nc.effective_creator_username, nc.pinner_username),
  nc.board_id,
  COALESCE(nc.pin_board_name, nc.board_name),
  nc.title,
  nc.clean_domain,
  nc.clean_domain,
  nc.destination_url,
  nc.image_url,
  nc.description,
  nc.alt_text,
  nc.dominant_color,
  COALESCE(nc.visual_annotations, '[]'::jsonb),
  nc.created_at_pinterest,
  'newborn_discovery',
  COALESCE(nc.first_seen_at, NOW()),
  COALESCE(nc.save_count, 0),
  COALESCE(nc.repin_count, 0),
  COALESCE(nc.comment_count, 0),
  COALESCE(nc.share_count, 0),
  COALESCE(nc.reaction_count, 0),
  COALESCE(nc.is_hydrated, FALSE),
  COALESCE(nc.save_per_day, 0),
  COALESCE(nc.repin_per_day, 0),
  COALESCE(nc.is_product, FALSE),
  COALESCE(nc.is_video, FALSE),
  nc.raw_creation_method,
  nc.image_signature,
  COALESCE(nc.is_repin, FALSE),
  NOW(),
  NOW(),
  jsonb_build_object(
    'source', 'newborn_ghost_recovery_016',
    'first_surface', nc.first_surface,
    'discovered_surfaces', COALESCE(nc.discovered_surfaces, '[]'::jsonb),
    'seed_query', nc.seed_query
  )
FROM public.campaign_tracked_pins ctp
JOIN public.newborn_candidates nc ON nc.pin_id = ctp.pin_id
LEFT JOIN public.universal_master_pins ump ON ump.pin_id = ctp.pin_id
WHERE ump.pin_id IS NULL
ORDER BY nc.pin_id ASC
ON CONFLICT (pin_id) DO NOTHING;

INSERT INTO public.pins_daily_metrics (
  pin_id, recorded_date, save_count, repin_count, comment_count, share_count, reaction_count,
  daily_save_velocity, daily_repin_velocity, updated_at
)
SELECT DISTINCT ON (nc.pin_id)
  nc.pin_id,
  CURRENT_DATE,
  COALESCE(nc.save_count, 0),
  COALESCE(nc.repin_count, 0),
  COALESCE(nc.comment_count, 0),
  COALESCE(nc.share_count, 0),
  COALESCE(nc.reaction_count, 0),
  COALESCE(nc.save_per_day, 0),
  COALESCE(nc.repin_per_day, 0),
  NOW()
FROM public.campaign_tracked_pins ctp
JOIN public.newborn_candidates nc ON nc.pin_id = ctp.pin_id
LEFT JOIN public.pins_daily_metrics pdm ON pdm.pin_id = ctp.pin_id AND pdm.recorded_date = CURRENT_DATE
WHERE pdm.pin_id IS NULL
ORDER BY nc.pin_id ASC
ON CONFLICT (pin_id, recorded_date) DO NOTHING;

INSERT INTO public.newborn_daily_anchors (
  pin_id, source, is_active, folder_id, seed_query, notes, promoted_at, updated_at
)
SELECT DISTINCT ON (nc.pin_id)
  nc.pin_id,
  'newborn_campaign_recovery',
  TRUE,
  ctp.folder_id,
  nc.seed_query,
  'Recovered from campaign_tracked_pins ghost row (migration 016)',
  NOW(),
  NOW()
FROM public.campaign_tracked_pins ctp
JOIN public.newborn_candidates nc ON nc.pin_id = ctp.pin_id
LEFT JOIN public.newborn_daily_anchors nda ON nda.pin_id = ctp.pin_id
WHERE nda.pin_id IS NULL
ORDER BY nc.pin_id ASC
ON CONFLICT (pin_id) DO NOTHING;

UPDATE public.newborn_candidates nc
SET
  folder_id = COALESCE(nc.folder_id, ctp.folder_id),
  stage = CASE WHEN nc.stage = 'discovered' THEN 'promoted' ELSE nc.stage END,
  promoted_at = COALESCE(nc.promoted_at, NOW()),
  updated_at = NOW()
FROM public.campaign_tracked_pins ctp
WHERE nc.pin_id = ctp.pin_id
  AND (nc.folder_id IS NULL OR nc.stage = 'discovered');

-- 8. Default execution_mode to 'fleet' (20 Runners) where currently set to 'auto'
UPDATE public.workspace_settings
SET
  execution_mode = 'fleet',
  updated_at = NOW()
WHERE execution_mode = 'auto';
