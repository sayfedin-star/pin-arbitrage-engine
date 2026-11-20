-- ============================================================================
-- scripts/migrations/007_unify_related_pins_graph.sql
-- Version: 007 (unify_related_pins_graph)
--
-- Related Pins Graph Unification (Expand + Clean-Slate Backfill):
--   1. Adds creator_username, creator_name, and destination_url to
--      candidate_graph_nodes so it serves as the single SSOT directed edge
--      table keyed on (seed_pin_id, candidate_pin_id) across both Cluster Hub
--      (cluster_seeds) and Creators Radar (competitor_seed_pins).
--   2. Enforces seed_pin_id NOT NULL and drops fk_cgn_seed_pin_id (which
--      previously restricted edges strictly to cluster_seeds).
--   3. Clean-Slate Backfill Policy: Only backfills competitor_related_nodes
--      rows that have an existing matching (competitor_id, seed_pin_id) parent
--      in competitor_seed_pins. Does NOT create stub rows in
--      universal_master_pins or competitor_seed_pins for historical orphaned
--      Oct 2026 rows.
--   4. Leaves competitor_related_nodes frozen intact until post-cutover smoke
--      tests pass (contract drop staged in pending/008_drop_competitor_related_nodes.sql).
--
-- Strictly idempotent, zero CONCURRENTLY (transactional-safe for scripts/migrate.mjs).
-- ============================================================================

-- 1. Expand candidate_graph_nodes with creator attribution and destination URL
ALTER TABLE public.candidate_graph_nodes
  ADD COLUMN IF NOT EXISTS creator_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS creator_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS destination_url TEXT;

-- 2. Enforce NOT NULL on seed_pin_id and drop queue-specific FK to cluster_seeds
DELETE FROM public.candidate_graph_nodes
WHERE seed_pin_id IS NULL;

ALTER TABLE public.candidate_graph_nodes
  ALTER COLUMN seed_pin_id SET NOT NULL;

ALTER TABLE public.candidate_graph_nodes
  DROP CONSTRAINT IF EXISTS fk_cgn_seed_pin_id;

-- 3. Clean-slate backfill of active competitor_related_nodes edges into candidate_graph_nodes
--    Strictly inner-joins competitor_seed_pins so orphaned pre-002 rows are excluded
--    and universal_master_pins remains 100% clean.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'competitor_related_nodes'
  ) THEN
    INSERT INTO public.candidate_graph_nodes (
      seed_pin_id,
      candidate_pin_id,
      title,
      image_url,
      dominant_color,
      saves,
      repins,
      domain,
      destination_url,
      is_product,
      creator_username,
      creator_name,
      provenance_engine,
      extracted_at
    )
    SELECT DISTINCT ON (crn.seed_pin_id, crn.candidate_pin_id)
      crn.seed_pin_id,
      crn.candidate_pin_id,
      crn.title,
      crn.image_url,
      COALESCE(NULLIF(crn.dominant_color, ''), '#888888'),
      crn.saves,
      COALESCE(crn.repins, 0)::BIGINT,
      crn.domain,
      crn.destination_url,
      COALESCE(crn.is_product, FALSE),
      NULLIF(BTRIM(COALESCE(crn.creator_username, '')), ''),
      NULLIF(BTRIM(COALESCE(crn.creator_name, '')), ''),
      COALESCE(NULLIF(crn.provenance_engine, ''), 'P2P_TWO_TOWER'),
      COALESCE(crn.discovered_at, NOW())
    FROM public.competitor_related_nodes crn
    INNER JOIN public.competitor_seed_pins csp
      ON csp.competitor_id = crn.competitor_id
     AND csp.pin_id = crn.seed_pin_id
    WHERE crn.seed_pin_id IS NOT NULL
      AND crn.candidate_pin_id IS NOT NULL
    ORDER BY crn.seed_pin_id ASC, crn.candidate_pin_id ASC, crn.discovered_at DESC NULLS LAST, crn.id DESC
    ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
      title            = COALESCE(NULLIF(candidate_graph_nodes.title, ''), EXCLUDED.title),
      image_url        = COALESCE(NULLIF(candidate_graph_nodes.image_url, ''), EXCLUDED.image_url),
      dominant_color   = COALESCE(NULLIF(NULLIF(candidate_graph_nodes.dominant_color, ''), '#888888'), EXCLUDED.dominant_color),
      saves            = CASE
                           WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0
                             THEN GREATEST(COALESCE(candidate_graph_nodes.saves, 0), EXCLUDED.saves)
                           ELSE COALESCE(candidate_graph_nodes.saves, EXCLUDED.saves)
                         END,
      repins           = GREATEST(COALESCE(candidate_graph_nodes.repins, 0), COALESCE(EXCLUDED.repins, 0)),
      domain           = COALESCE(NULLIF(candidate_graph_nodes.domain, ''), EXCLUDED.domain),
      destination_url  = COALESCE(NULLIF(candidate_graph_nodes.destination_url, ''), EXCLUDED.destination_url),
      is_product       = COALESCE(candidate_graph_nodes.is_product, FALSE) OR COALESCE(EXCLUDED.is_product, FALSE),
      creator_username = COALESCE(NULLIF(candidate_graph_nodes.creator_username, ''), EXCLUDED.creator_username),
      creator_name     = COALESCE(NULLIF(candidate_graph_nodes.creator_name, ''), EXCLUDED.creator_name);
  END IF;
END $$;
