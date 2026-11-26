-- 018_release_zero_volume_cluster_keywords.sql
-- Releases all zero/null-volume keywords previously marked volume_enriched = true
-- (including rows whose has_taxonomy was cleared by the legacy is_interest === false guard)
-- so existing keyword clusters can recover authentic Pinterest Idea Page volumes cleanly.

WITH released AS (
  SELECT
    nkc.id,
    (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN LOWER(COALESCE(elem->>'volume_enriched', '')) = 'true'
              AND (
                NULLIF(TRIM(COALESCE(elem->>'volume', '')), '') IS NULL
                OR (TRIM(elem->>'volume') ~ '^-?[0-9]+(\.[0-9]+)?$' AND (TRIM(elem->>'volume'))::numeric <= 0)
              )
            THEN jsonb_set(
              jsonb_set(elem, '{volume_enriched}', 'false'::jsonb, TRUE),
              '{volume_rechecked_v2}',
              'false'::jsonb,
              TRUE
            )
            ELSE elem
          END
          ORDER BY ord
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(COALESCE(nkc.keywords, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
    ) AS new_keywords
  FROM public.newborn_keyword_clusters nkc
  WHERE jsonb_typeof(COALESCE(nkc.keywords, '[]'::jsonb)) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(nkc.keywords, '[]'::jsonb)) AS elem
      WHERE LOWER(COALESCE(elem->>'volume_enriched', '')) = 'true'
        AND (
          NULLIF(TRIM(COALESCE(elem->>'volume', '')), '') IS NULL
          OR (TRIM(elem->>'volume') ~ '^-?[0-9]+(\.[0-9]+)?$' AND (TRIM(elem->>'volume'))::numeric <= 0)
        )
    )
),
recounted AS (
  SELECT
    r.id,
    r.new_keywords,
    jsonb_array_length(r.new_keywords) AS total_cnt,
    (
      SELECT COUNT(*)::int
      FROM jsonb_array_elements(r.new_keywords) AS e
      WHERE LOWER(COALESCE(e->>'volume_enriched', '')) = 'true'
    ) AS enriched_cnt
  FROM released r
)
UPDATE public.newborn_keyword_clusters nkc
SET
  keywords = rc.new_keywords,
  keyword_count = rc.total_cnt,
  enriched_count = rc.enriched_cnt,
  metadata = jsonb_set(
    CASE
      WHEN nkc.metadata IS NOT NULL AND jsonb_typeof(nkc.metadata) = 'object' THEN nkc.metadata
      ELSE '{}'::jsonb
    END,
    '{remaining_unenriched_count}',
    to_jsonb(GREATEST(0, rc.total_cnt - rc.enriched_cnt)),
    TRUE
  ),
  updated_at = NOW()
FROM recounted rc
WHERE nkc.id = rc.id;
