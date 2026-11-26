-- 017_forensic_remediation_and_annotation_index.sql
-- Pass 3 Verified Forensic Remediation + Annotation Expression GIN Index + Campaign Seed Query + Poisoned Taxonomy Release
-- Runs inside a single atomic transaction managed by scripts/migrate.mjs (no CONCURRENTLY).

-- 1. IMMUTABLE HTML-entity-decoding annotation tag extractor for GIN indexing
CREATE OR REPLACE FUNCTION public.pae_extract_annotation_tags(p_va jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT LOWER(TRIM(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(
                                CASE
                                  WHEN jsonb_typeof(elem) = 'object' THEN COALESCE(elem->>'name', '')
                                  ELSE COALESCE(elem #>> '{}', '')
                                END,
                                '&rsquo;', chr(8217)
                              ),
                              '&lsquo;', chr(8216)
                            ),
                            '&rdquo;', chr(8221)
                          ),
                          '&ldquo;', chr(8220)
                        ),
                        '&#39;', ''''
                      ),
                      '&#x27;', ''''
                    ),
                    '&apos;', ''''
                  ),
                  '&quot;', '"'
                ),
                '&lt;', '<'
              ),
              '&gt;', '>'
            ),
            '&nbsp;', ' '
          ),
          '&amp;', '&'
        )
      ))
      FROM jsonb_array_elements(
        CASE
          WHEN p_va IS NOT NULL AND jsonb_typeof(p_va) = 'array' THEN p_va
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE TRIM(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN COALESCE(elem->>'name', '')
          ELSE COALESCE(elem #>> '{}', '')
        END
      ) <> ''
    ),
    ARRAY[]::text[]
  );
$$;

-- 2. Expression GIN index on newborn_candidates.visual_annotations
CREATE INDEX IF NOT EXISTS idx_nc_visual_annotations_tags_gin
  ON public.newborn_candidates
  USING GIN (public.pae_extract_annotation_tags(visual_annotations));

-- 3. Add seed_query column + active workspace/pin partial index on campaign_tracked_pins and backfill
ALTER TABLE public.campaign_tracked_pins
  ADD COLUMN IF NOT EXISTS seed_query TEXT;

CREATE INDEX IF NOT EXISTS idx_ctp_workspace_pin
  ON public.campaign_tracked_pins (workspace_id, pin_id)
  WHERE is_active = TRUE;

UPDATE public.campaign_tracked_pins ctp
SET seed_query = COALESCE(
  NULLIF(TRIM(ctp.seed_query), ''),
  NULLIF(TRIM(nda.seed_query), ''),
  NULLIF(TRIM(nc.seed_query), '')
)
FROM public.newborn_candidates nc
LEFT JOIN public.newborn_daily_anchors nda ON nda.pin_id = nc.pin_id
WHERE ctp.pin_id = nc.pin_id
  AND (ctp.seed_query IS NULL OR TRIM(ctp.seed_query) = '');

-- 4. Remove search-sourced contamination rows from newborn_daily_anchors (keep active newborn campaign pins!)
DELETE FROM public.newborn_daily_anchors nda
WHERE nda.source = 'newborn_campaign_recovery'
  AND NOT EXISTS (
    SELECT 1
    FROM public.campaign_tracked_pins ctp
    WHERE ctp.pin_id = nda.pin_id
      AND ctp.source_type = 'newborn'
      AND ctp.is_active = TRUE
  );

-- 5. Revert search-contaminated newborn_candidates rows from promoted -> discovered
UPDATE public.newborn_candidates nc
SET
  stage = 'discovered',
  folder_id = NULL,
  promoted_at = NULL,
  updated_at = NOW()
WHERE nc.stage = 'promoted'
  AND NOT EXISTS (
    SELECT 1
    FROM public.newborn_daily_anchors nda
    WHERE nda.pin_id = nc.pin_id
      AND nda.is_active = TRUE
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.campaign_tracked_pins ctp
    WHERE ctp.pin_id = nc.pin_id
      AND ctp.source_type = 'newborn'
      AND ctp.is_active = TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM public.campaign_tracked_pins ctp_search
    WHERE ctp_search.pin_id = nc.pin_id
      AND ctp_search.source_type <> 'newborn'
  );

-- 6. Zero single-day fabricated daily velocity in pins_daily_metrics
WITH single_day_pins AS (
  SELECT pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT recorded_date) <= 1
)
UPDATE public.pins_daily_metrics pdm
SET
  daily_save_velocity = 0,
  daily_repin_velocity = 0
FROM single_day_pins sdp
WHERE pdm.pin_id = sdp.pin_id
  AND (
    COALESCE(pdm.daily_save_velocity, 0) <> 0
    OR COALESCE(pdm.daily_repin_velocity, 0) <> 0
  );

-- 7. Zero single-day fabricated daily velocity & 24h deltas in universal_master_pins
WITH single_day_master AS (
  SELECT ump.pin_id
  FROM public.universal_master_pins ump
  LEFT JOIN public.pins_daily_metrics pdm ON pdm.pin_id = ump.pin_id
  GROUP BY ump.pin_id
  HAVING COUNT(DISTINCT pdm.recorded_date) <= 1
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = 0,
  daily_repin_velocity = 0,
  delta_saves_24h = NULL,
  delta_repins_24h = NULL,
  updated_at = NOW()
FROM single_day_master sdm
WHERE ump.pin_id = sdm.pin_id
  AND (
    COALESCE(ump.daily_save_velocity, 0) <> 0
    OR COALESCE(ump.daily_repin_velocity, 0) <> 0
    OR ump.delta_saves_24h IS NOT NULL
    OR ump.delta_repins_24h IS NOT NULL
  );

-- 8. Release poisoned official-taxonomy keywords (has_taxonomy = true, volume <= 0, volume_enriched = true)
--    inside newborn_keyword_clusters.keywords JSONB so re-enrichment can recover real Idea Page volumes
UPDATE public.newborn_keyword_clusters nkc
SET
  keywords = (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN LOWER(COALESCE(elem->>'has_taxonomy', '')) = 'true'
            AND LOWER(COALESCE(elem->>'volume_enriched', '')) = 'true'
            AND (
              NULLIF(TRIM(COALESCE(elem->>'volume', '')), '') IS NULL
              OR (TRIM(elem->>'volume') ~ '^-?[0-9]+(\.[0-9]+)?$' AND (TRIM(elem->>'volume'))::numeric <= 0)
            )
          THEN jsonb_set(elem, '{volume_enriched}', 'false'::jsonb, TRUE)
          ELSE elem
        END
        ORDER BY ord
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(COALESCE(nkc.keywords, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  ),
  updated_at = NOW()
WHERE jsonb_typeof(COALESCE(nkc.keywords, '[]'::jsonb)) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(nkc.keywords, '[]'::jsonb)) AS elem
    WHERE LOWER(COALESCE(elem->>'has_taxonomy', '')) = 'true'
      AND LOWER(COALESCE(elem->>'volume_enriched', '')) = 'true'
      AND (
        NULLIF(TRIM(COALESCE(elem->>'volume', '')), '') IS NULL
        OR (TRIM(elem->>'volume') ~ '^-?[0-9]+(\.[0-9]+)?$' AND (TRIM(elem->>'volume'))::numeric <= 0)
      )
  );
