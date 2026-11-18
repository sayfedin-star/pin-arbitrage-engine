-- ============================================================================
-- scripts/migrations/002_wave2_hygiene_and_unification.sql
-- Version: 002 (wave2_hygiene_and_unification)
--
-- Wave 2 Surgical Unification, Data Truth Remediation, Orphan Purge,
-- Foreign Key Hardening, and High-HOT Index Hygiene.
-- Safe & idempotent on both existing pre-Wave-2 live databases and fresh 001 DBs.
-- ============================================================================

-- ============================================================================
-- 1. UNIFY 3 DOMAIN TABLES INTO domain_intelligence_rollup
-- ============================================================================

ALTER TABLE public.domain_intelligence_rollup ADD COLUMN IF NOT EXISTS lookup_source VARCHAR(32);
ALTER TABLE public.domain_intelligence_rollup ADD COLUMN IF NOT EXISTS updated_at_whois TIMESTAMPTZ;
ALTER TABLE public.domain_intelligence_rollup ADD COLUMN IF NOT EXISTS whois_checked_at TIMESTAMPTZ;
ALTER TABLE public.domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ads_checked_at TIMESTAMPTZ;
ALTER TABLE public.domain_intelligence_rollup ADD COLUMN IF NOT EXISTS raw_header_snippet TEXT;

DO $$
BEGIN
  -- 1A. Backfill WHOIS age & registry metadata from domain_registry_metadata if present
  IF to_regclass('public.domain_registry_metadata') IS NOT NULL THEN
    UPDATE public.domain_intelligence_rollup dir
    SET
      domain_created_at = COALESCE(drm.registered_at, dir.domain_created_at),
      updated_at_whois = COALESCE(drm.updated_at_whois, dir.updated_at_whois),
      domain_expires_at = COALESCE(drm.expires_at, dir.domain_expires_at),
      age_days = COALESCE(
        CASE
          WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 86400))::int
          ELSE drm.initial_age_days
        END,
        dir.age_days
      ),
      age_years = COALESCE(
        CASE
          WHEN drm.registered_at IS NOT NULL THEN LEAST(999.99, ROUND((EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 31557600)::numeric, 2))::numeric(5,2)
          WHEN drm.initial_age_years IS NOT NULL THEN LEAST(999.99, drm.initial_age_years)::numeric(5,2)
          ELSE NULL
        END,
        dir.age_years
      ),
      lookup_source = COALESCE(drm.lookup_source, dir.lookup_source),
      lookup_status = CASE
        WHEN drm.lookup_status = 'resolved' THEN 'resolved'
        WHEN dir.lookup_status = 'resolved' OR dir.age_status = 'resolved' THEN 'resolved'
        ELSE COALESCE(drm.lookup_status, dir.lookup_status)
      END,
      age_status = CASE
        WHEN drm.lookup_status = 'resolved' THEN 'resolved'
        WHEN dir.age_status = 'resolved' THEN 'resolved'
        ELSE COALESCE(drm.lookup_status, dir.age_status)
      END,
      whois_checked_at = COALESCE(drm.checked_at, dir.whois_checked_at),
      updated_at = NOW()
    FROM public.domain_registry_metadata drm
    WHERE LOWER(BTRIM(drm.domain)) = LOWER(BTRIM(dir.domain));

    -- Insert any active pin/folder domains that existed only in domain_registry_metadata
    INSERT INTO public.domain_intelligence_rollup (
      domain, total_pins, domain_created_at, updated_at_whois, domain_expires_at,
      age_days, age_years, lookup_source, lookup_status, age_status, whois_checked_at,
      refreshed_at, updated_at
    )
    SELECT
      LOWER(BTRIM(drm.domain)) AS domain,
      COALESCE(ump_counts.pin_cnt, 0)::int AS total_pins,
      drm.registered_at,
      drm.updated_at_whois,
      drm.expires_at,
      CASE
        WHEN drm.registered_at IS NOT NULL THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 86400))::int
        ELSE drm.initial_age_days
      END,
      CASE
        WHEN drm.registered_at IS NOT NULL THEN LEAST(999.99, ROUND((EXTRACT(EPOCH FROM (NOW() - drm.registered_at)) / 31557600)::numeric, 2))::numeric(5,2)
        WHEN drm.initial_age_years IS NOT NULL THEN LEAST(999.99, drm.initial_age_years)::numeric(5,2)
        ELSE NULL
      END,
      drm.lookup_source,
      COALESCE(drm.lookup_status, 'pending'),
      COALESCE(drm.lookup_status, 'unchecked'),
      drm.checked_at,
      NOW(),
      NOW()
    FROM public.domain_registry_metadata drm
    LEFT JOIN (
      SELECT LOWER(BTRIM(clean_domain)) AS dom, COUNT(*)::int AS pin_cnt
      FROM public.universal_master_pins
      WHERE clean_domain IS NOT NULL AND BTRIM(clean_domain) <> ''
      GROUP BY LOWER(BTRIM(clean_domain))
    ) ump_counts ON ump_counts.dom = LOWER(BTRIM(drm.domain))
    WHERE drm.domain IS NOT NULL AND BTRIM(drm.domain) <> ''
      AND (
        COALESCE(ump_counts.pin_cnt, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.folder_pinned_domains fpd
          WHERE LOWER(BTRIM(fpd.domain)) = LOWER(BTRIM(drm.domain))
        )
      )
    ON CONFLICT (domain) DO NOTHING;
  END IF;

  -- 1B. Backfill ads.txt monetization metadata from domain_monetization_metadata if present
  IF to_regclass('public.domain_monetization_metadata') IS NOT NULL THEN
    UPDATE public.domain_intelligence_rollup dir
    SET
      ad_network = CASE
        WHEN dmm.current_ad_network IS NOT NULL AND dmm.current_ad_network <> 'unchecked' THEN dmm.current_ad_network
        ELSE COALESCE(dir.ad_network, dmm.current_ad_network, 'unchecked')
      END,
      ad_manager_domain = COALESCE(dmm.ad_manager_domain, dir.ad_manager_domain),
      primary_pub_id = COALESCE(dmm.primary_pub_id, dir.primary_pub_id),
      previous_ad_network = COALESCE(dmm.previous_ad_network, dir.previous_ad_network),
      ad_switched_at = COALESCE(dmm.switched_at, dir.ad_switched_at),
      ad_network_history = CASE
        WHEN jsonb_typeof(dmm.network_history) = 'array' AND jsonb_array_length(dmm.network_history) > 0 THEN dmm.network_history
        ELSE COALESCE(dir.ad_network_history, '[]'::jsonb)
      END,
      ads_txt_status = CASE
        WHEN dmm.ads_txt_status IS NOT NULL AND dmm.ads_txt_status <> 'pending' THEN dmm.ads_txt_status
        ELSE COALESCE(dir.ads_txt_status, 'pending')
      END,
      raw_header_snippet = COALESCE(dmm.raw_header_snippet, dir.raw_header_snippet),
      ads_checked_at = COALESCE(dmm.checked_at, dir.ads_checked_at),
      updated_at = NOW()
    FROM public.domain_monetization_metadata dmm
    WHERE LOWER(BTRIM(dmm.domain)) = LOWER(BTRIM(dir.domain));

    INSERT INTO public.domain_intelligence_rollup (
      domain, total_pins, ad_network, ad_manager_domain, primary_pub_id,
      previous_ad_network, ad_switched_at, ad_network_history, ads_txt_status,
      raw_header_snippet, ads_checked_at, refreshed_at, updated_at
    )
    SELECT
      LOWER(BTRIM(dmm.domain)) AS domain,
      COALESCE(ump_counts.pin_cnt, 0)::int AS total_pins,
      COALESCE(dmm.current_ad_network, 'unchecked'),
      dmm.ad_manager_domain,
      dmm.primary_pub_id,
      dmm.previous_ad_network,
      dmm.switched_at,
      COALESCE(dmm.network_history, '[]'::jsonb),
      COALESCE(dmm.ads_txt_status, 'pending'),
      dmm.raw_header_snippet,
      dmm.checked_at,
      NOW(),
      NOW()
    FROM public.domain_monetization_metadata dmm
    LEFT JOIN (
      SELECT LOWER(BTRIM(clean_domain)) AS dom, COUNT(*)::int AS pin_cnt
      FROM public.universal_master_pins
      WHERE clean_domain IS NOT NULL AND BTRIM(clean_domain) <> ''
      GROUP BY LOWER(BTRIM(clean_domain))
    ) ump_counts ON ump_counts.dom = LOWER(BTRIM(dmm.domain))
    WHERE dmm.domain IS NOT NULL AND BTRIM(dmm.domain) <> ''
      AND (
        COALESCE(ump_counts.pin_cnt, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.folder_pinned_domains fpd
          WHERE LOWER(BTRIM(fpd.domain)) = LOWER(BTRIM(dmm.domain))
        )
      )
    ON CONFLICT (domain) DO NOTHING;
  END IF;
END $$;

UPDATE public.domain_intelligence_rollup
SET whois_checked_at = refreshed_at
WHERE whois_checked_at IS NULL
  AND age_status IN ('resolved', 'failed');

UPDATE public.domain_intelligence_rollup
SET ads_checked_at = refreshed_at
WHERE ads_checked_at IS NULL
  AND ad_network IS NOT NULL
  AND ad_network <> 'unchecked';

DROP TABLE IF EXISTS public.domain_registry_metadata CASCADE;
DROP TABLE IF EXISTS public.domain_monetization_metadata CASCADE;

-- Delete zero-pin ghost rows not present in universal_master_pins or folder_pinned_domains
WITH active_ump_domains AS (
  SELECT DISTINCT
    CASE
      WHEN LOWER(BTRIM(clean_domain)) IN ('uploaded by user', 'uploaded-by-user', 'organic') THEN 'uploaded by user'
      ELSE LOWER(BTRIM(clean_domain))
    END AS dom
  FROM public.universal_master_pins
  WHERE clean_domain IS NOT NULL AND BTRIM(clean_domain) <> ''
),
pinned_folder_domains AS (
  SELECT DISTINCT LOWER(BTRIM(domain)) AS dom
  FROM public.folder_pinned_domains
  WHERE domain IS NOT NULL AND BTRIM(domain) <> ''
)
DELETE FROM public.domain_intelligence_rollup dir
WHERE COALESCE(dir.total_pins, 0) = 0
  AND LOWER(BTRIM(dir.domain)) NOT IN (SELECT dom FROM active_ump_domains)
  AND LOWER(BTRIM(dir.domain)) NOT IN (SELECT dom FROM pinned_folder_domains);

-- ============================================================================
-- 2. UNIFY GLOBAL QUALIFICATION RULES INTO app_settings & CLEAN GHOST ROWS
-- ============================================================================

INSERT INTO public.app_settings (key, value, updated_at)
SELECT
  'pin_qualification_rules',
  cp.metadata->'global_qualification_rules',
  COALESCE(cp.updated_at, NOW())
FROM public.competitor_profiles cp
WHERE cp.username = '__system_qualification_rules__'
  AND jsonb_typeof(cp.metadata->'global_qualification_rules') = 'object'
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.pa_qualification_rules') IS NOT NULL THEN
    INSERT INTO public.app_settings (key, value, updated_at)
    SELECT
      'pin_qualification_rules',
      jsonb_build_object(
        'tier1_min_saves', COALESCE(r.tier1_min_saves, 100),
        'tier2_min_repins', COALESCE(r.tier2_min_repins, 100),
        'tier2_min_velocity', COALESCE(r.tier2_min_velocity, 3.5),
        'tier2_max_age_days', COALESCE(r.tier2_max_age_days, 60),
        'tier2_min_shares', COALESCE(r.tier2_min_shares, 15),
        'tier3_max_age_days', COALESCE(r.tier3_max_age_days, 14),
        'tier3_min_saves', COALESCE(r.tier3_min_saves, 25),
        'master_ingest_enabled', COALESCE(r.master_ingest_enabled, TRUE),
        'early_stop_pages', COALESCE(r.early_stop_pages, 3),
        'max_batch_pins', COALESCE(r.max_batch_pins, 500),
        'discovery_max_pages', COALESCE(r.discovery_max_pages, 500),
        'refresh_max_pins', COALESCE(r.refresh_max_pins, 0),
        'paused_policy', COALESCE(r.paused_policy, 'reject')
      ),
      COALESCE(r.updated_at, NOW())
    FROM public.pa_qualification_rules r
    WHERE r.id = 1
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

DELETE FROM public.competitor_profiles
WHERE username = '__system_qualification_rules__';

DELETE FROM public.competitor_profiles cp
WHERE cp.username LIKE 'preview_%'
  AND NOT EXISTS (
    SELECT 1 FROM public.competitor_board_pins cbp WHERE cbp.competitor_id = cp.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.folder_competitor_items fci WHERE fci.competitor_id = cp.id
  );

DROP TABLE IF EXISTS public.pa_qualification_rules CASCADE;
DROP TABLE IF EXISTS public.keyword_tombstones CASCADE;
DROP FUNCTION IF EXISTS public.get_competitor_board_counts();
DROP FUNCTION IF EXISTS public.get_latest_competitor_snapshots(integer[]);
DROP FUNCTION IF EXISTS public.get_latest_competitor_snapshots();

-- ============================================================================
-- 3. DROP DEAD / REDUNDANT COLUMNS
-- ============================================================================

ALTER TABLE public.universal_master_pins DROP COLUMN IF EXISTS account_username;
ALTER TABLE public.universal_master_pins DROP COLUMN IF EXISTS gains_1d;
ALTER TABLE public.universal_master_pins DROP COLUMN IF EXISTS gains_3d;
ALTER TABLE public.universal_master_pins DROP COLUMN IF EXISTS gains_14d;
ALTER TABLE public.universal_master_pins DROP COLUMN IF EXISTS gains_30d;

ALTER TABLE public.pins_daily_metrics DROP COLUMN IF EXISTS snapshot_date;

ALTER TABLE public.keyword_serp_positions DROP COLUMN IF EXISTS metadata;

-- ============================================================================
-- 4. LIVE DATA TRUTH REMEDIATION
-- ============================================================================

-- 4A. Clear stale displaced_date on active SERP rows
UPDATE public.keyword_serp_positions
SET displaced_date = NULL
WHERE is_displaced = FALSE
  AND displaced_date IS NOT NULL;

-- 4B. Clear cloned fake rolling window gains where snapshot span does not meet minimum window
WITH metric_spans AS (
  SELECT
    pin_id,
    COALESCE(MAX(recorded_date) - MIN(recorded_date), 0) AS span_days
  FROM public.pins_daily_metrics
  WHERE save_count IS NOT NULL
  GROUP BY pin_id
)
UPDATE public.universal_master_pins ump
SET
  gains_5d = CASE WHEN COALESCE(ms.span_days, 0) < 3 THEN NULL ELSE ump.gains_5d END,
  gains_7d = CASE WHEN COALESCE(ms.span_days, 0) < 5 THEN NULL ELSE ump.gains_7d END,
  gains_10d = CASE WHEN COALESCE(ms.span_days, 0) < 6 THEN NULL ELSE ump.gains_10d END,
  gains_15d = CASE WHEN COALESCE(ms.span_days, 0) < 9 THEN NULL ELSE ump.gains_15d END
FROM (
  SELECT u.pin_id, s.span_days
  FROM public.universal_master_pins u
  LEFT JOIN metric_spans s ON s.pin_id = u.pin_id
) ms
WHERE ump.pin_id = ms.pin_id
  AND (
    (COALESCE(ms.span_days, 0) < 3 AND ump.gains_5d IS NOT NULL)
    OR (COALESCE(ms.span_days, 0) < 5 AND ump.gains_7d IS NOT NULL)
    OR (COALESCE(ms.span_days, 0) < 6 AND ump.gains_10d IS NOT NULL)
    OR (COALESCE(ms.span_days, 0) < 9 AND ump.gains_15d IS NOT NULL)
  );

-- 4C. Heal false 0 locks on save_count < repin_count pins in pins_daily_metrics
WITH ordered_pdm AS (
  SELECT
    pin_id,
    recorded_date,
    save_count,
    repin_count,
    daily_save_velocity,
    LAG(save_count) OVER (PARTITION BY pin_id ORDER BY recorded_date ASC) AS prev_saves,
    LAG(repin_count) OVER (PARTITION BY pin_id ORDER BY recorded_date ASC) AS prev_repins,
    LAG(recorded_date) OVER (PARTITION BY pin_id ORDER BY recorded_date ASC) AS prev_date
  FROM public.pins_daily_metrics
  WHERE save_count IS NOT NULL
),
healed_pdm AS (
  SELECT
    pin_id,
    recorded_date,
    CASE
      WHEN prev_date IS NULL THEN NULL::double precision
      WHEN prev_saves <= 0 THEN 0::double precision
      WHEN save_count <= prev_saves THEN 0::double precision
      WHEN (prev_saves < 100 AND save_count >= 500)
        OR (COALESCE(prev_repins, 0) > 0 AND prev_saves = prev_repins AND save_count > COALESCE(NULLIF(repin_count, 0), prev_repins) * 1.35)
        OR (COALESCE(prev_repins, 0) = 0 AND COALESCE(repin_count, 0) >= 25 AND save_count >= prev_saves * 2.5)
        OR (prev_saves > 0 AND save_count >= prev_saves * 4 AND (save_count - prev_saves) >= 2500)
        OR (prev_saves < 500 AND (save_count - prev_saves) > 2000 AND (save_count::numeric / GREATEST(1, prev_saves)) > 20)
      THEN 0::double precision
      ELSE LEAST(
        25000::double precision,
        ROUND((save_count - prev_saves)::numeric / GREATEST(1, recorded_date - prev_date), 2)::double precision
      )
    END AS expected_velocity
  FROM ordered_pdm
)
UPDATE public.pins_daily_metrics pdm
SET daily_save_velocity = h.expected_velocity
FROM healed_pdm h
WHERE pdm.pin_id = h.pin_id
  AND pdm.recorded_date = h.recorded_date
  AND (
    (h.expected_velocity IS NULL AND pdm.daily_save_velocity = 0)
    OR (COALESCE(pdm.daily_save_velocity, 0) = 0 AND COALESCE(h.expected_velocity, 0) > 0)
  );

-- 4D. Reconcile split-brain daily_save_velocity & delta_saves_24h between pins_daily_metrics and universal_master_pins
WITH latest_pdm AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    daily_save_velocity
  FROM public.pins_daily_metrics
  WHERE save_count IS NOT NULL
  ORDER BY pin_id, recorded_date DESC
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = lp.daily_save_velocity,
  delta_saves_24h = CASE
    WHEN lp.daily_save_velocity IS NOT NULL THEN ROUND(GREATEST(0::numeric, lp.daily_save_velocity::numeric))::bigint
    ELSE NULL
  END
FROM latest_pdm lp
WHERE ump.pin_id = lp.pin_id
  AND ump.daily_save_velocity IS DISTINCT FROM lp.daily_save_velocity;

-- ============================================================================
-- 5. ORPHAN PURGE, FOREIGN KEY INTEGRITY, CHECK CONSTRAINT & HIGH-HOT INDEXES
-- ============================================================================

-- 5A. Purge orphan child rows before enforcing FOREIGN KEYs
DELETE FROM public.competitor_seed_pins csp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins ump WHERE ump.pin_id = csp.pin_id
);

DELETE FROM public.competitor_board_pins cbp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins ump WHERE ump.pin_id = cbp.pin_id
);

DELETE FROM public.pins_daily_metrics pdm
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins ump WHERE ump.pin_id = pdm.pin_id
);

DELETE FROM public.keyword_serp_positions ksp
WHERE NOT EXISTS (
  SELECT 1 FROM public.universal_master_pins ump WHERE ump.pin_id = ksp.pin_id
);

DELETE FROM public.candidate_graph_nodes cgn
WHERE cgn.seed_pin_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.cluster_seeds cs WHERE cs.pin_id = cgn.seed_pin_id
  );

DELETE FROM public.cluster_arbitrage_metrics cam
WHERE NOT EXISTS (
  SELECT 1 FROM public.cluster_seeds cs WHERE cs.pin_id = cam.seed_pin_id
);

DELETE FROM public.seed_guided_search_capsules sgsc
WHERE NOT EXISTS (
  SELECT 1 FROM public.cluster_seeds cs WHERE cs.pin_id = sgsc.seed_pin_id
);

DELETE FROM public.keyword_folder_items kfi
WHERE NOT EXISTS (
  SELECT 1 FROM public.keyword_folders kf WHERE kf.id = kfi.folder_id
);

DELETE FROM public.folder_competitor_items fci
WHERE NOT EXISTS (
  SELECT 1 FROM public.keyword_folders kf WHERE kf.id = fci.folder_id
);

DELETE FROM public.folder_pinned_domains fpd
WHERE NOT EXISTS (
  SELECT 1 FROM public.keyword_folders kf WHERE kf.id = fpd.folder_id
);

-- Ensure displaced rows never carry non-null rank_position prior to CHECK constraint
UPDATE public.keyword_serp_positions
SET rank_position = NULL
WHERE is_displaced = TRUE
  AND rank_position IS NOT NULL;

-- 5B. Add idempotent FOREIGN KEY ... ON DELETE CASCADE & CHECK constraints
DO $$
BEGIN
  -- pins_daily_metrics.pin_id -> universal_master_pins(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.pins_daily_metrics'::regclass
      AND c.confrelid = 'public.universal_master_pins'::regclass
      AND a.attname = 'pin_id'
  ) THEN
    ALTER TABLE public.pins_daily_metrics
      ADD CONSTRAINT fk_pdm_pin_id FOREIGN KEY (pin_id)
      REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE;
  END IF;

  -- keyword_serp_positions.pin_id -> universal_master_pins(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.keyword_serp_positions'::regclass
      AND c.confrelid = 'public.universal_master_pins'::regclass
      AND a.attname = 'pin_id'
  ) THEN
    ALTER TABLE public.keyword_serp_positions
      ADD CONSTRAINT fk_ksp_pin_id FOREIGN KEY (pin_id)
      REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE;
  END IF;

  -- competitor_board_pins.pin_id -> universal_master_pins(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.competitor_board_pins'::regclass
      AND c.confrelid = 'public.universal_master_pins'::regclass
      AND a.attname = 'pin_id'
  ) THEN
    ALTER TABLE public.competitor_board_pins
      ADD CONSTRAINT fk_cbp_pin_id FOREIGN KEY (pin_id)
      REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE;
  END IF;

  -- competitor_seed_pins.pin_id -> universal_master_pins(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.competitor_seed_pins'::regclass
      AND c.confrelid = 'public.universal_master_pins'::regclass
      AND a.attname = 'pin_id'
  ) THEN
    ALTER TABLE public.competitor_seed_pins
      ADD CONSTRAINT fk_csp_pin_id FOREIGN KEY (pin_id)
      REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE;
  END IF;

  -- candidate_graph_nodes.seed_pin_id -> cluster_seeds(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.candidate_graph_nodes'::regclass
      AND c.confrelid = 'public.cluster_seeds'::regclass
      AND a.attname = 'seed_pin_id'
  ) THEN
    ALTER TABLE public.candidate_graph_nodes
      ADD CONSTRAINT fk_cgn_seed_pin_id FOREIGN KEY (seed_pin_id)
      REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE;
  END IF;

  -- cluster_arbitrage_metrics.seed_pin_id -> cluster_seeds(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.cluster_arbitrage_metrics'::regclass
      AND c.confrelid = 'public.cluster_seeds'::regclass
      AND a.attname = 'seed_pin_id'
  ) THEN
    ALTER TABLE public.cluster_arbitrage_metrics
      ADD CONSTRAINT fk_cam_seed_pin_id FOREIGN KEY (seed_pin_id)
      REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE;
  END IF;

  -- seed_guided_search_capsules.seed_pin_id -> cluster_seeds(pin_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.seed_guided_search_capsules'::regclass
      AND c.confrelid = 'public.cluster_seeds'::regclass
      AND a.attname = 'seed_pin_id'
  ) THEN
    ALTER TABLE public.seed_guided_search_capsules
      ADD CONSTRAINT fk_sgsc_seed_pin_id FOREIGN KEY (seed_pin_id)
      REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE;
  END IF;

  -- keyword_folder_items.folder_id -> keyword_folders(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.keyword_folder_items'::regclass
      AND c.confrelid = 'public.keyword_folders'::regclass
      AND a.attname = 'folder_id'
  ) THEN
    ALTER TABLE public.keyword_folder_items
      ADD CONSTRAINT fk_kfi_folder_id FOREIGN KEY (folder_id)
      REFERENCES public.keyword_folders(id) ON DELETE CASCADE;
  END IF;

  -- folder_competitor_items.folder_id -> keyword_folders(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.folder_competitor_items'::regclass
      AND c.confrelid = 'public.keyword_folders'::regclass
      AND a.attname = 'folder_id'
  ) THEN
    ALTER TABLE public.folder_competitor_items
      ADD CONSTRAINT fk_fci_folder_id FOREIGN KEY (folder_id)
      REFERENCES public.keyword_folders(id) ON DELETE CASCADE;
  END IF;

  -- folder_pinned_domains.folder_id -> keyword_folders(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.folder_pinned_domains'::regclass
      AND c.confrelid = 'public.keyword_folders'::regclass
      AND a.attname = 'folder_id'
  ) THEN
    ALTER TABLE public.folder_pinned_domains
      ADD CONSTRAINT fk_fpd_folder_id FOREIGN KEY (folder_id)
      REFERENCES public.keyword_folders(id) ON DELETE CASCADE;
  END IF;

  -- CHECK (is_displaced = FALSE OR rank_position IS NULL) on keyword_serp_positions
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid = 'public.keyword_serp_positions'::regclass
      AND c.conname = 'chk_ksp_displaced_rank_null'
  ) THEN
    ALTER TABLE public.keyword_serp_positions
      ADD CONSTRAINT chk_ksp_displaced_rank_null
      CHECK (is_displaced = FALSE OR rank_position IS NULL);
  END IF;
END $$;

-- 5C. Replace HOT-blocking, duplicate, and 2,704-byte-unsafe indexes
DROP INDEX IF EXISTS public.idx_ump_repin_velocity;
DROP INDEX IF EXISTS public.idx_ump_velocity;
DROP INDEX IF EXISTS public.idx_ump_clean_domain_saves;
DROP INDEX IF EXISTS public.idx_ump_is_hydrated;
DROP INDEX IF EXISTS public.idx_ump_creator;
DROP INDEX IF EXISTS public.idx_ump_dest_url_pattern;
DROP INDEX IF EXISTS public.idx_competitor_history_lookup;
DROP INDEX IF EXISTS public.idx_tracked_keywords_popular_pins_gin;
DROP INDEX IF EXISTS public.idx_dir_total_saves;
DROP INDEX IF EXISTS public.idx_dir_age_status;
DROP INDEX IF EXISTS public.idx_crn_comp_candidate;
DROP INDEX IF EXISTS public.idx_candidates_seed;

CREATE INDEX IF NOT EXISTS idx_ump_clean_domain
  ON public.universal_master_pins (clean_domain)
  WHERE clean_domain IS NOT NULL AND clean_domain <> '';

CREATE INDEX IF NOT EXISTS idx_ump_unhydrated
  ON public.universal_master_pins (pin_id)
  WHERE is_hydrated = FALSE;

CREATE INDEX IF NOT EXISTS idx_ump_dest_url_prefix
  ON public.universal_master_pins (LEFT(destination_url, 1024) text_pattern_ops)
  WHERE destination_url IS NOT NULL AND destination_url <> '';

-- 5D. Purge legacy pre-squash drift rows from schema_migrations (retaining '001' & '002')
DELETE FROM public.schema_migrations
WHERE version NOT IN ('001', '002');
