-- ============================================================================
-- scripts/migrations/001_baseline_schema.sql
-- Version: 001 (baseline_schema)
--
-- Canonical Non-Destructive Baseline Schema for Pin Arbitrage Engine (PAE)
-- PostgreSQL 16 — 24 Tables, 4 Functions, 3 Triggers, 1 Materialized View.
-- Strictly idempotent (IF NOT EXISTS / CREATE OR REPLACE), zero DROP TABLE,
-- zero CONCURRENTLY (safe inside sql.begin() transactions).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ============================================================================
-- 1. CANONICAL FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pae_sync_clean_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $_$
DECLARE
  raw_dom text;
  dest_url text;
BEGIN
  raw_dom := COALESCE(
    NULLIF(BTRIM(COALESCE(NEW.domain, '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.clean_domain, '')), '')
  );
  IF raw_dom IS NULL OR raw_dom = '' THEN
    dest_url := BTRIM(COALESCE(NEW.destination_url, ''));
    IF dest_url <> '' THEN
      raw_dom := SUBSTRING(LOWER(dest_url) FROM '^https?://(?:www\.)?([^/?#:]+)');
    END IF;
  END IF;
  raw_dom := COALESCE(raw_dom, '');
  raw_dom := REGEXP_REPLACE(LOWER(BTRIM(raw_dom)), '^https?://', '');
  raw_dom := REGEXP_REPLACE(raw_dom, '/.*$', '');
  NEW.clean_domain := REGEXP_REPLACE(raw_dom, '^www\.', '');
  RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION public.pae_sync_canonical_keyword()
RETURNS trigger
LANGUAGE plpgsql
AS $_$
DECLARE
  raw_input text;
  base_slug text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.keyword IS DISTINCT FROM OLD.keyword AND NEW.canonical_keyword IS NOT DISTINCT FROM OLD.canonical_keyword THEN
    raw_input := NEW.keyword;
  ELSE
    raw_input := COALESCE(NULLIF(TRIM(NEW.canonical_keyword), ''), NEW.keyword);
  END IF;
  base_slug := COALESCE(
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(raw_input, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(NEW.keyword, '')), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')), ''),
    'kw'
  );
  PERFORM pg_advisory_xact_lock(hashtext('kw_canon:' || LEFT(base_slug, 255)));
  IF EXISTS (
    SELECT 1 FROM public.tracked_keywords
    WHERE canonical_keyword = LEFT(base_slug, 255)
      AND (NEW.id IS NULL OR id <> NEW.id)
  ) THEN
    NEW.canonical_keyword := LEFT(base_slug || '-' || COALESCE(NEW.id::text, (FLOOR(RANDOM() * 900000 + 100000))::text), 255);
  ELSE
    NEW.canonical_keyword := LEFT(base_slug, 255);
  END IF;
  RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION public.trg_normalize_pinned_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.domain := LOWER(REGEXP_REPLACE(REGEXP_REPLACE(NEW.domain, '^https?://', '', 'i'), '^www\.', '', 'i'));
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. CANONICAL 24 TABLES
-- ============================================================================

-- (1/24) schema_migrations
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (2/24) app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key VARCHAR(128) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (3/24) universal_master_pins
CREATE TABLE IF NOT EXISTS public.universal_master_pins (
  pin_id VARCHAR(255) PRIMARY KEY,
  creator_username VARCHAR(128),
  board_id VARCHAR(64),
  board_name TEXT,
  board_slug TEXT,
  title TEXT,
  domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  image_url TEXT,
  description TEXT,
  alt_text TEXT,
  dominant_color VARCHAR(32) DEFAULT '#888888',
  visual_annotations JSONB DEFAULT '[]'::jsonb,
  created_at_pinterest TIMESTAMPTZ,
  first_discovered_pillar VARCHAR(32) DEFAULT 'keyword',
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  url_global_saves BIGINT,
  save_count BIGINT,
  repin_count BIGINT,
  comment_count INTEGER,
  share_count INTEGER,
  reaction_count INTEGER,
  is_hydrated BOOLEAN NOT NULL DEFAULT FALSE,
  daily_save_velocity DOUBLE PRECISION,
  daily_repin_velocity DOUBLE PRECISION,
  delta_saves_24h BIGINT,
  delta_repins_24h BIGINT,
  gains_5d BIGINT,
  gains_7d BIGINT,
  gains_10d BIGINT,
  gains_15d BIGINT,
  is_product BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  creation_method TEXT,
  image_signature TEXT,
  seo_noindex_reason TEXT,
  is_repin BOOLEAN DEFAULT FALSE,
  canonical_pin_id TEXT
) WITH (fillfactor = 80);

-- (4/24) pins_daily_metrics
CREATE TABLE IF NOT EXISTS public.pins_daily_metrics (
  pin_id VARCHAR(255) NOT NULL REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  save_count BIGINT,
  repin_count BIGINT,
  comment_count INTEGER,
  share_count INTEGER,
  reaction_count INTEGER,
  daily_save_velocity DOUBLE PRECISION,
  daily_repin_velocity DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pin_id, recorded_date)
) WITH (fillfactor = 80);

-- (5/24) tracked_keywords
CREATE TABLE IF NOT EXISTS public.tracked_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(100) DEFAULT 'General',
  target_pin_count INTEGER DEFAULT 250,
  refresh_interval_hours INTEGER DEFAULT 24,
  last_crawled_at TIMESTAMPTZ,
  top_pin_id VARCHAR(255),
  top_pin_title TEXT,
  top_pin_image TEXT,
  avg_daily_velocity NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}'::text[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  popular_pins JSONB DEFAULT '[]'::jsonb,
  crawl_pages_limit INTEGER DEFAULT 10,
  inspection_mode VARCHAR(64) DEFAULT 'full_catalog',
  crawl_lease_token UUID,
  crawl_lease_until TIMESTAMPTZ,
  canonical_keyword VARCHAR(255)
) WITH (fillfactor = 80);

ALTER TABLE public.tracked_keywords ALTER COLUMN keyword SET STATISTICS 500;

-- (6/24) keyword_serp_positions
CREATE TABLE IF NOT EXISTS public.keyword_serp_positions (
  keyword_id INTEGER NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(255) NOT NULL REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE,
  rank_position INTEGER,
  is_displaced BOOLEAN NOT NULL DEFAULT FALSE,
  last_known_rank INTEGER,
  displaced_date TIMESTAMPTZ,
  vacuum_opportunity_score DOUBLE PRECISION,
  prev_rank_position INTEGER,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (keyword_id, pin_id),
  CONSTRAINT chk_ksp_displaced_rank_null CHECK (is_displaced = FALSE OR rank_position IS NULL)
) WITH (fillfactor = 80);

-- (7/24) keyword_guided_capsules
CREATE TABLE IF NOT EXISTS public.keyword_guided_capsules (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INTEGER NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  display_label TEXT NOT NULL,
  score NUMERIC(12,4) DEFAULT 0.0,
  dominant_color VARCHAR(64),
  display_order INTEGER DEFAULT 0,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (keyword_id, term)
);

-- (8/24) keyword_ignored_pins
CREATE TABLE IF NOT EXISTS public.keyword_ignored_pins (
  keyword_id INTEGER NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  ignored_reason TEXT DEFAULT 'manual_user_deletion',
  ignored_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (keyword_id, pin_id)
);

-- (9/24) keyword_folders
CREATE TABLE IF NOT EXISTS public.keyword_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  color VARCHAR(64) DEFAULT '#ec4899',
  icon VARCHAR(64) DEFAULT 'folder',
  project_id VARCHAR(64) DEFAULT 'default',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- (10/24) keyword_folder_items
CREATE TABLE IF NOT EXISTS public.keyword_folder_items (
  id BIGSERIAL PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  keyword_id INTEGER NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  notes TEXT DEFAULT '',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (folder_id, keyword_id)
);

-- (11/24) competitor_profiles
CREATE TABLE IF NOT EXISTS public.competitor_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(128) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  monthly_reach BIGINT DEFAULT 0,
  reach_delta_7d BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  views_delta_7d BIGINT DEFAULT 0,
  total_pins INTEGER DEFAULT 0,
  total_boards INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  account_type VARCHAR(32) DEFAULT 'competitor',
  activity_status VARCHAR(64) DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}'::text[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_harvest_metadata JSONB DEFAULT '{}'::jsonb,
  tracking_mode VARCHAR(32) DEFAULT 'full',
  custom_label VARCHAR(128) DEFAULT '',
  source_folder_id INTEGER,
  delta_reach_24h BIGINT DEFAULT 0,
  delta_views_24h BIGINT DEFAULT 0,
  delta_pins_24h INTEGER DEFAULT 0,
  delta_boards_24h INTEGER DEFAULT 0,
  pins_delta_7d INTEGER DEFAULT 0,
  boards_delta_7d INTEGER DEFAULT 0
) WITH (fillfactor = 80);

-- (12/24) competitor_boards
CREATE TABLE IF NOT EXISTS public.competitor_boards (
  id SERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  pin_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  last_pinned_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, board_id)
) WITH (fillfactor = 80);

-- (13/24) competitor_board_pins
CREATE TABLE IF NOT EXISTS public.competitor_board_pins (
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL DEFAULT '',
  pin_id VARCHAR(255) NOT NULL REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE,
  "position" INTEGER,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competitor_id, board_id, pin_id)
) WITH (fillfactor = 80);

-- (14/24) competitor_history_snapshots
CREATE TABLE IF NOT EXISTS public.competitor_history_snapshots (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  monthly_reach BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  total_pins INTEGER DEFAULT 0,
  total_boards INTEGER DEFAULT 0,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, recorded_date)
) WITH (fillfactor = 80);

-- (15/24) competitor_seed_pins
CREATE TABLE IF NOT EXISTS public.competitor_seed_pins (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT,
  board_name VARCHAR(255),
  save_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  UNIQUE (competitor_id, pin_id)
);

-- (16/24) competitor_related_nodes
CREATE TABLE IF NOT EXISTS public.competitor_related_nodes (
  id BIGSERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  seed_pin_id VARCHAR(64) NOT NULL,
  candidate_pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  image_url TEXT,
  dominant_color VARCHAR(32),
  saves BIGINT DEFAULT 0,
  repins INTEGER DEFAULT 0,
  domain TEXT,
  destination_url TEXT,
  is_product BOOLEAN DEFAULT FALSE,
  is_same_account BOOLEAN DEFAULT FALSE,
  creator_username VARCHAR(100),
  creator_name VARCHAR(255),
  provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, seed_pin_id, candidate_pin_id)
);

-- (17/24) folder_competitor_items
CREATE TABLE IF NOT EXISTS public.folder_competitor_items (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  competitor_id INTEGER NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  custom_label VARCHAR(128) DEFAULT '',
  source VARCHAR(32) DEFAULT 'manual',
  UNIQUE (folder_id, competitor_id)
);

-- (18/24) folder_pinned_domains
CREATE TABLE IF NOT EXISTS public.folder_pinned_domains (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  notes TEXT DEFAULT '',
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (folder_id, domain)
);

-- (19/24) domain_intelligence_rollup (Unified Domain Rollup + WHOIS + ads.txt SSOT)
CREATE TABLE IF NOT EXISTS public.domain_intelligence_rollup (
  domain VARCHAR(255) PRIMARY KEY,
  total_pins INTEGER NOT NULL DEFAULT 0,
  unique_urls INTEGER NOT NULL DEFAULT 1,
  active_serp_pins INTEGER NOT NULL DEFAULT 0,
  top3_pins INTEGER NOT NULL DEFAULT 0,
  top10_pins INTEGER NOT NULL DEFAULT 0,
  rank_11_50_pins INTEGER NOT NULL DEFAULT 0,
  displaced_pins INTEGER NOT NULL DEFAULT 0,
  best_rank INTEGER,
  avg_rank NUMERIC(5,2),
  visibility_score NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_saves BIGINT NOT NULL DEFAULT 0,
  avg_saves NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_repins BIGINT NOT NULL DEFAULT 0,
  avg_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
  pins_per_url NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  accounts_count INTEGER NOT NULL DEFAULT 1,
  sample_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ad_network VARCHAR(64) DEFAULT 'unchecked',
  ad_manager_domain VARCHAR(255),
  primary_pub_id VARCHAR(128),
  previous_ad_network VARCHAR(64),
  ad_switched_at TIMESTAMPTZ,
  ad_network_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ads_txt_status VARCHAR(32) DEFAULT 'pending',
  ad_provider VARCHAR(64),
  raw_header_snippet TEXT,
  ads_checked_at TIMESTAMPTZ,
  age_days INTEGER,
  age_years NUMERIC(5,2),
  age_status VARCHAR(32) DEFAULT 'unchecked',
  domain_created_at TIMESTAMPTZ,
  domain_expires_at TIMESTAMPTZ,
  updated_at_whois TIMESTAMPTZ,
  lookup_source VARCHAR(32),
  lookup_status VARCHAR(32) DEFAULT 'pending',
  whois_checked_at TIMESTAMPTZ,
  decay_rate_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
  arbitrage_score NUMERIC(10,2) DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

-- (20/24) cluster_seeds
CREATE TABLE IF NOT EXISTS public.cluster_seeds (
  pin_id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(255),
  is_competitor BOOLEAN DEFAULT FALSE,
  velocity NUMERIC DEFAULT 0,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  crawl_lease_token UUID,
  crawl_lease_until TIMESTAMPTZ
);

-- (21/24) candidate_graph_nodes
CREATE TABLE IF NOT EXISTS public.candidate_graph_nodes (
  id BIGSERIAL PRIMARY KEY,
  seed_pin_id VARCHAR(64) REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE,
  candidate_pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  dominant_color VARCHAR(32) DEFAULT '#888888',
  aspect_ratio NUMERIC DEFAULT 0.56,
  saves BIGINT DEFAULT 0,
  repins BIGINT DEFAULT 0,
  save_rate NUMERIC DEFAULT 0,
  domain TEXT,
  is_product BOOLEAN DEFAULT FALSE,
  ocr_text TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  pin_created_at TIMESTAMPTZ,
  age_days NUMERIC DEFAULT 180,
  daily_velocity NUMERIC DEFAULT 0,
  provenance_engine VARCHAR(64) DEFAULT 'P2P_TWO_TOWER',
  individual_prod_score NUMERIC DEFAULT 0,
  recgpt_transition_score NUMERIC DEFAULT 0,
  sequence_role VARCHAR(64) DEFAULT 'DIRECT_MATCH',
  is_recgpt_candidate BOOLEAN DEFAULT FALSE,
  visual_entropy_score NUMERIC DEFAULT 0,
  image_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  ingestion_method VARCHAR(64) DEFAULT 'uploaded',
  UNIQUE (seed_pin_id, candidate_pin_id)
) WITH (fillfactor = 80);

ALTER TABLE public.candidate_graph_nodes ALTER COLUMN seed_pin_id SET STATISTICS 500;

-- (22/24) cluster_arbitrage_metrics
CREATE TABLE IF NOT EXISTS public.cluster_arbitrage_metrics (
  id BIGSERIAL PRIMARY KEY,
  seed_pin_id VARCHAR(64) NOT NULL REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE,
  total_candidates INTEGER DEFAULT 0,
  recgpt_count INTEGER DEFAULT 0,
  navboost_count INTEGER DEFAULT 0,
  randomwalk_count INTEGER DEFAULT 0,
  two_tower_count INTEGER DEFAULT 0,
  fresh_candidate_count INTEGER DEFAULT 0,
  product_count INTEGER DEFAULT 0,
  commercial_gap_ratio NUMERIC DEFAULT 100,
  winning_color_centroids JSONB DEFAULT '[]'::jsonb,
  high_save_tokens JSONB DEFAULT '[]'::jsonb,
  utility_snapshot JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- (23/24) seed_guided_search_capsules
CREATE TABLE IF NOT EXISTS public.seed_guided_search_capsules (
  id BIGSERIAL PRIMARY KEY,
  seed_pin_id VARCHAR(64) NOT NULL REFERENCES public.cluster_seeds(pin_id) ON DELETE CASCADE,
  capsule_title TEXT,
  capsule_type VARCHAR(64) DEFAULT 'guided_search',
  query_param TEXT,
  display_order INTEGER DEFAULT 0,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  query_term TEXT,
  normalized_query TEXT,
  image_url TEXT,
  search_url TEXT,
  node_id TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (seed_pin_id, capsule_title)
);

-- (24/24) pin_visual_search_cache
CREATE TABLE IF NOT EXISTS public.pin_visual_search_cache (
  pin_id VARCHAR(255) PRIMARY KEY,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- ============================================================================
-- 3. TOPIC CLUSTERS QUERY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pa_topic_clusters_page(
  p_min_pins integer DEFAULT 1,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_account text DEFAULT NULL::text
)
RETURNS TABLE(
  topic_name text,
  pins_count bigint,
  total_saves numeric,
  avg_saves bigint,
  avg_velocity numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clean_account TEXT;
  v_escaped_search TEXT;
BEGIN
  v_clean_account := NULLIF(LOWER(TRIM(REPLACE(COALESCE(p_account, ''), '@', ''))), '');
  v_escaped_search := CASE
    WHEN p_search IS NULL OR BTRIM(p_search) = '' THEN NULL
    ELSE REPLACE(REPLACE(REPLACE(BTRIM(p_search), '\', '\\'), '%', '\%'), '_', '\_')
  END;

  RETURN QUERY
  WITH extracted AS (
    SELECT
      CASE
        WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
        WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
        ELSE NULL
      END AS raw_topic,
      ump.pin_id,
      COALESCE(ump.save_count, 0) AS saves,
      ump.daily_save_velocity AS velocity
    FROM public.universal_master_pins ump,
    LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ump.visual_annotations) = 'array' THEN ump.visual_annotations ELSE '[]'::jsonb END
    ) AS ann
    WHERE (
        (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
        OR
        (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
      )
      AND (v_clean_account IS NULL OR LOWER(TRIM(REPLACE(COALESCE(ump.creator_username, ''), '@', ''))) = v_clean_account)
  ),
  deduped AS (
    SELECT DISTINCT ON (e.pin_id, LOWER(e.raw_topic))
      LOWER(e.raw_topic) AS norm_topic,
      e.raw_topic,
      e.pin_id,
      e.saves,
      e.velocity
    FROM extracted e
    ORDER BY e.pin_id, LOWER(e.raw_topic), e.raw_topic
  ),
  aggregated AS (
    SELECT
      MIN(d.raw_topic) AS t_name,
      COUNT(d.pin_id)::BIGINT AS p_count,
      COALESCE(SUM(d.saves), 0)::NUMERIC AS s_saves,
      CASE WHEN COUNT(d.pin_id) > 0 THEN (COALESCE(SUM(d.saves), 0) / COUNT(d.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
      COALESCE(ROUND(AVG(d.velocity)::numeric, 2), 0::numeric) AS a_velocity
    FROM deduped d
    WHERE (v_escaped_search IS NULL OR d.raw_topic ILIKE '%' || v_escaped_search || '%' ESCAPE '\')
    GROUP BY d.norm_topic
    HAVING COUNT(d.pin_id) >= COALESCE(p_min_pins, 1)
  )
  SELECT
    a.t_name AS topic_name,
    a.p_count AS pins_count,
    a.s_saves AS total_saves,
    a.a_saves AS avg_saves,
    a.a_velocity AS avg_velocity
  FROM aggregated a
  ORDER BY a.s_saves DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ump_sync_clean_domain ON public.universal_master_pins;
CREATE TRIGGER trg_ump_sync_clean_domain
  BEFORE INSERT OR UPDATE OF domain, destination_url, clean_domain
  ON public.universal_master_pins
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_clean_domain();

DROP TRIGGER IF EXISTS trg_tk_sync_canonical_keyword ON public.tracked_keywords;
CREATE TRIGGER trg_tk_sync_canonical_keyword
  BEFORE INSERT OR UPDATE OF keyword, canonical_keyword
  ON public.tracked_keywords
  FOR EACH ROW EXECUTE FUNCTION public.pae_sync_canonical_keyword();

DROP TRIGGER IF EXISTS trg_fpd_normalize_domain ON public.folder_pinned_domains;
CREATE TRIGGER trg_fpd_normalize_domain
  BEFORE INSERT OR UPDATE OF domain
  ON public.folder_pinned_domains
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_pinned_domain();

-- ============================================================================
-- 5. MATERIALIZED VIEW: mv_pulse_24h_summary
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT pin_id) AS active_pins_24h,
  COUNT(DISTINCT NULLIF(BTRIM((clean_domain)::text), ''::text)) FILTER (
    WHERE LOWER(BTRIM((COALESCE(clean_domain, ''::character varying))::text)) <> ALL (
      ARRAY['uploaded by user'::text, 'uploaded-by-user'::text, 'organic'::text, 'pinterest.com'::text, 'www.pinterest.com'::text]
    )
  ) AS active_domains_24h,
  COUNT(DISTINCT NULLIF(LOWER(TRIM(BOTH FROM REPLACE((COALESCE(creator_username, ''::character varying))::text, '@'::text, ''::text))), ''::text)) AS active_creators_24h,
  (COALESCE(ROUND((AVG(daily_save_velocity))::numeric, 2), (0)::numeric))::numeric(12,2) AS avg_velocity_24h,
  (COALESCE(MAX(daily_save_velocity), (0)::double precision))::numeric(12,2) AS max_velocity_24h,
  (COALESCE(SUM(GREATEST((0)::bigint, COALESCE(delta_saves_24h, (ROUND(daily_save_velocity))::bigint, (0)::bigint))), (0)::numeric))::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM public.universal_master_pins ump
WHERE is_hydrated = TRUE
  AND (last_scraped_at >= (NOW() - INTERVAL '24 hours') OR updated_at >= (NOW() - INTERVAL '24 hours'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON public.mv_pulse_24h_summary (summary_id);

-- ============================================================================
-- 6. HIGH-HOT & SARGABLE INDEXES
-- ============================================================================

-- universal_master_pins (HOT-safe: zero volatile save_count / velocity / timestamp columns)
CREATE INDEX IF NOT EXISTS idx_ump_clean_domain
  ON public.universal_master_pins (clean_domain)
  WHERE clean_domain IS NOT NULL AND clean_domain <> '';

CREATE INDEX IF NOT EXISTS idx_ump_unhydrated
  ON public.universal_master_pins (pin_id)
  WHERE is_hydrated = FALSE;

CREATE INDEX IF NOT EXISTS idx_ump_dest_url_prefix
  ON public.universal_master_pins (LEFT(destination_url, 1024) text_pattern_ops)
  WHERE destination_url IS NOT NULL AND destination_url <> '';

CREATE INDEX IF NOT EXISTS idx_ump_destination_url_md5
  ON public.universal_master_pins (md5(destination_url))
  WHERE destination_url IS NOT NULL AND destination_url <> '';

CREATE INDEX IF NOT EXISTS idx_ump_creator_clean
  ON public.universal_master_pins (LOWER(TRIM(BOTH FROM REPLACE((COALESCE(creator_username, ''::character varying))::text, '@'::text, ''::text))));

CREATE INDEX IF NOT EXISTS idx_ump_hashtext_mod20
  ON public.universal_master_pins (((ABS((hashtext((pin_id)::text))::bigint) % (20)::bigint)));

CREATE INDEX IF NOT EXISTS idx_ump_is_product
  ON public.universal_master_pins (is_product)
  WHERE is_product = TRUE;

-- pins_daily_metrics
CREATE INDEX IF NOT EXISTS idx_pdm_recorded_date
  ON public.pins_daily_metrics (recorded_date);

-- tracked_keywords
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_tracked_keywords
  ON public.tracked_keywords (canonical_keyword);

CREATE INDEX IF NOT EXISTS idx_tk_crawl_lease
  ON public.tracked_keywords (crawl_lease_until)
  WHERE crawl_lease_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword
  ON public.tracked_keywords (LOWER((keyword)::text));

CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword_pattern
  ON public.tracked_keywords (LOWER((keyword)::text) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_tk_trgm_keyword
  ON public.tracked_keywords USING gin (LOWER((keyword)::text) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tracked_keywords_active
  ON public.tracked_keywords (is_active);

-- keyword_serp_positions
CREATE INDEX IF NOT EXISTS idx_ksp_displaced_date
  ON public.keyword_serp_positions (displaced_date)
  WHERE is_displaced = TRUE;

CREATE INDEX IF NOT EXISTS idx_ksp_hashtext_mod20
  ON public.keyword_serp_positions (((ABS((hashtext((pin_id)::text))::bigint) % (20)::bigint)), keyword_id);

CREATE INDEX IF NOT EXISTS idx_ksp_keyword_active
  ON public.keyword_serp_positions (keyword_id, rank_position)
  WHERE is_displaced = FALSE;

CREATE INDEX IF NOT EXISTS idx_ksp_keyword_displaced
  ON public.keyword_serp_positions (keyword_id, vacuum_opportunity_score DESC NULLS LAST)
  WHERE is_displaced = TRUE;

CREATE INDEX IF NOT EXISTS idx_ksp_pin_id
  ON public.keyword_serp_positions (pin_id);

-- keyword_guided_capsules
CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_kw
  ON public.keyword_guided_capsules (keyword_id, display_order);

CREATE INDEX IF NOT EXISTS idx_kw_guided_capsules_score
  ON public.keyword_guided_capsules (keyword_id, score DESC);

-- keyword_folders & folder items
CREATE INDEX IF NOT EXISTS idx_kf_trgm_name
  ON public.keyword_folders USING gin (LOWER((name)::text) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kw_folders_created
  ON public.keyword_folders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kw_folders_name
  ON public.keyword_folders (name);

CREATE INDEX IF NOT EXISTS idx_kw_folder_items_keyword
  ON public.keyword_folder_items (keyword_id);

CREATE INDEX IF NOT EXISTS idx_fci_competitor_id
  ON public.folder_competitor_items (competitor_id);

CREATE INDEX IF NOT EXISTS idx_fpd_domain
  ON public.folder_pinned_domains (domain);

-- competitor_profiles & child tables
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_reach
  ON public.competitor_profiles (monthly_reach DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_tracking_mode
  ON public.competitor_profiles (tracking_mode, is_active);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type
  ON public.competitor_profiles (account_type);

CREATE INDEX IF NOT EXISTS idx_cp_lower_username
  ON public.competitor_profiles (LOWER((username)::text));

CREATE INDEX IF NOT EXISTS idx_cp_lower_username_pattern
  ON public.competitor_profiles (LOWER((username)::text) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_cp_trgm_display_name
  ON public.competitor_profiles USING gin (LOWER((COALESCE(display_name, ''::character varying))::text) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cp_trgm_username
  ON public.competitor_profiles USING gin (LOWER((username)::text) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_competitor_boards_activity
  ON public.competitor_boards (competitor_id, last_pinned_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_competitor_boards_lookup
  ON public.competitor_boards (competitor_id, pin_count DESC);

CREATE INDEX IF NOT EXISTS idx_cbp_competitor
  ON public.competitor_board_pins (competitor_id, "position");

CREATE INDEX IF NOT EXISTS idx_cbp_competitor_pin
  ON public.competitor_board_pins (competitor_id, pin_id);

CREATE INDEX IF NOT EXISTS idx_cbp_hashtext_mod20
  ON public.competitor_board_pins (((ABS((hashtext((pin_id)::text))::bigint) % (20)::bigint)), competitor_id);

CREATE INDEX IF NOT EXISTS idx_cbp_pin_id
  ON public.competitor_board_pins (pin_id);

CREATE INDEX IF NOT EXISTS idx_competitor_history_recorded_date_comp
  ON public.competitor_history_snapshots (recorded_date DESC, competitor_id)
  INCLUDE (monthly_reach, profile_views);

CREATE INDEX IF NOT EXISTS idx_crn_comp_retention
  ON public.competitor_related_nodes (competitor_id, is_same_account);

-- domain_intelligence_rollup
CREATE INDEX IF NOT EXISTS idx_dir_ad_network
  ON public.domain_intelligence_rollup (ad_network);

CREATE INDEX IF NOT EXISTS idx_dir_lower_domain_pattern
  ON public.domain_intelligence_rollup (LOWER((domain)::text) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_dir_top10
  ON public.domain_intelligence_rollup (top10_pins DESC);

CREATE INDEX IF NOT EXISTS idx_dir_trgm_domain
  ON public.domain_intelligence_rollup USING gin (LOWER((domain)::text) public.gin_trgm_ops);

-- cluster_seeds & P2P graph tables
CREATE INDEX IF NOT EXISTS idx_cluster_seeds_crawled
  ON public.cluster_seeds (last_crawled_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_cluster_seeds_velocity
  ON public.cluster_seeds (velocity DESC);

CREATE INDEX IF NOT EXISTS idx_cs_crawl_lease
  ON public.cluster_seeds (crawl_lease_until)
  WHERE crawl_lease_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_candidate_pin
  ON public.candidate_graph_nodes (candidate_pin_id);

CREATE INDEX IF NOT EXISTS idx_candidates_enrichment_queue
  ON public.candidate_graph_nodes (seed_pin_id)
  WHERE (((repins = 0) OR (repins IS NULL)) AND (saves > 0));

CREATE INDEX IF NOT EXISTS idx_candidates_saves
  ON public.candidate_graph_nodes (saves DESC);

CREATE INDEX IF NOT EXISTS idx_candidates_velocity
  ON public.candidate_graph_nodes (daily_velocity DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_seed
  ON public.cluster_arbitrage_metrics (seed_pin_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsules_seed_discovered
  ON public.seed_guided_search_capsules (seed_pin_id, discovered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm
  ON public.seed_guided_search_capsules (seed_pin_id, normalized_query);

-- pin_visual_search_cache
CREATE INDEX IF NOT EXISTS idx_pvsc_expires
  ON public.pin_visual_search_cache (expires_at);
