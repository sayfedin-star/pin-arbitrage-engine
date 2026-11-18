-- ============================================================================
-- scripts/migrations/003_newborn_discovery_engine.sql
-- Version: 003 (newborn_discovery_engine)
--
-- Wave 6A: /newborn Studio Backend Schema, Dynamic Settings & Rule Profiles,
-- Zero-Pollution Staging Tables, Rookie Account Radar, Discovery Run Ledger,
-- and Standalone Daily Velocity Crawler Anchors (PostgreSQL 16).
--
-- Strictly idempotent (IF NOT EXISTS / DO $$), zero CONCURRENTLY (transactional-safe),
-- fillfactor = 80 on mutable tables, and HOT-safe secondary indexes (zero volatile
-- metric/timestamp columns in secondary index keys).
-- ============================================================================

-- ============================================================================
-- 1. SEED GLOBAL NEWBORN ENGINE SETTINGS IN app_settings (IF NOT PRESENT)
-- ============================================================================

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'newborn_engine_settings',
  '{
    "schema_version": 1,
    "discovery": {
      "country": "US",
      "max_board_age_days": 30,
      "surfaces": {
        "growing_trends": { "enabled": true, "max_pages": 1, "limit": 25 },
        "zero_query_popular": { "enabled": true, "max_pages": 1 },
        "pin_serp_capsules": { "enabled": true, "max_pages": 2, "page_size": 50 },
        "fresh_boards": { "enabled": true, "max_pages": 1, "max_boards_to_expand": 8 },
        "board_feed": { "enabled": true, "max_pages": 2, "page_size": 50 },
        "board_more_ideas": { "enabled": true, "max_pages": 2, "page_size": 25 },
        "ideas_feeds": { "enabled": true, "max_pages": 2, "max_interests_per_run": 6 },
        "related_pin_snowball": { "enabled": true, "max_pages": 2, "page_size": 24 }
      },
      "snowball": {
        "enabled": true,
        "max_hops": 2,
        "seed_cap": 10,
        "min_seed_golden_score": 65
      },
      "hydration": {
        "enable_pidgets_pretriage": true,
        "max_pin_hydrations_per_run": 150,
        "max_user_hydrations_per_run": 50
      }
    },
    "qualification": {
      "age_window_preset": "30d",
      "min_age_days": 0,
      "max_age_days": 30,
      "min_repin_count": 5,
      "min_save_count": 10,
      "min_repin_per_day": 1.5,
      "min_save_per_day": 2.0,
      "min_shares": 0,
      "min_comments": 0,
      "min_reactions": 0,
      "max_creator_followers": 25000,
      "enforce_max_followers_filter": false,
      "provenance": {
        "allowed_sources": [
          "SHARE_EXTENSION_IOS",
          "SHARE_EXTENSION_ANDROID",
          "UPLOADED",
          "ORGANIC_PIN",
          "CAROUSEL",
          "VIDEO",
          "IDEA_PIN",
          "BOOKMARKLET",
          "UNKNOWN"
        ],
        "excluded_sources": [],
        "ai_disclosure_policy": "exclude",
        "exclude_products": true,
        "exclude_videos": false
      },
      "linkless_vacuum": {
        "mode": "boost",
        "linkless_vacuum_only": false,
        "score_boost": 12
      }
    },
    "automation": {
      "auto_track_enabled": false,
      "schedule": {
        "cadence": "every_6h",
        "interval_minutes": 360,
        "watchlist_poll_interval_minutes": 720,
        "target_window_utc": { "start_hour": 0, "end_hour": 23 },
        "cooldown_minutes": 60,
        "last_discovery_run_at": null,
        "last_watchlist_poll_at": null
      },
      "pin_promotion_rules": {
        "watchlist_thresholds": {
          "min_repins": 5,
          "min_saves": 0,
          "min_repin_per_day": 1.5,
          "max_age_days": 30,
          "min_golden_score": 55
        },
        "promote_thresholds": {
          "min_repins": 25,
          "min_saves": 40,
          "min_repin_per_day": 4.0,
          "max_age_days": 30,
          "min_golden_score": 75,
          "min_consecutive_days": 2
        },
        "destinations": {
          "stage_to_watchlist": true,
          "promote_to_daily_ssot": true,
          "promote_to_campaign_folder_id": null,
          "promote_top_annotation_as_keyword": false,
          "promote_to_cluster_seeds": false
        }
      },
      "rookie_promotion_rules": {
        "enabled": true,
        "max_followers": 10000,
        "min_monthly_reach": 50000,
        "min_golden_pins": 2,
        "min_rookie_score": 70,
        "min_consecutive_days": 2,
        "destination_tracking_mode": "pulse_only",
        "destination_folder_id": null
      }
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. FLEXIBLE NAMED RULE PROFILES: newborn_rule_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_rule_profiles (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL,
  surfaces_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  automation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

INSERT INTO public.newborn_rule_profiles (
  slug, name, description, is_default, is_active,
  surfaces_config, qualification_config, automation_config
)
VALUES (
  'default-golden-breakout',
  'Default Golden Breakout',
  'Balanced 30-day multi-surface breakout hunter with Linkless Vacuum boost and 2-hop Golden Pin snowball.',
  TRUE,
  TRUE,
  '{}'::jsonb,
  '{"age_window_preset": "30d", "max_age_days": 30, "min_repin_count": 5, "min_repin_per_day": 1.5}'::jsonb,
  '{}'::jsonb
),
(
  'ultra-fresh-7d-rockets',
  'Ultra-Fresh 7d Rockets',
  'High-conviction 7-day newborn rockets from rookie creators and native mobile uploads.',
  FALSE,
  TRUE,
  '{"snowball": {"enabled": true, "max_hops": 2, "seed_cap": 15}}'::jsonb,
  '{"age_window_preset": "7d", "max_age_days": 7, "min_repin_count": 8, "min_repin_per_day": 3.0, "max_creator_followers": 10000}'::jsonb,
  '{}'::jsonb
),
(
  'linkless-arbitrage-vacuum',
  'Linkless Arbitrage Vacuum',
  'Targets viral unlinked uploads (SHARE_EXTENSION_IOS, SHARE_EXTENSION_ANDROID, UPLOADED) with zero external article competition.',
  FALSE,
  TRUE,
  '{}'::jsonb,
  '{"age_window_preset": "30d", "max_age_days": 30, "linkless_vacuum": {"mode": "only", "linkless_vacuum_only": true, "score_boost": 20}, "provenance": {"allowed_sources": ["SHARE_EXTENSION_IOS", "SHARE_EXTENSION_ANDROID", "UPLOADED"], "ai_disclosure_policy": "exclude"}}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. DISCOVERY & WATCHLIST EXECUTION LEDGER: newborn_runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type VARCHAR(32) NOT NULL DEFAULT 'discovery',
  status VARCHAR(32) NOT NULL DEFAULT 'running',
  profile_id INTEGER REFERENCES public.newborn_rule_profiles(id) ON DELETE SET NULL,
  seed_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  surfaces_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  cookie_mode VARCHAR(32) NOT NULL DEFAULT 'guest_only',
  candidates_discovered INTEGER NOT NULL DEFAULT 0,
  candidates_qualified INTEGER NOT NULL DEFAULT 0,
  golden_pins_count INTEGER NOT NULL DEFAULT 0,
  rookie_creators_count INTEGER NOT NULL DEFAULT 0,
  auto_watchlisted_count INTEGER NOT NULL DEFAULT 0,
  auto_promoted_count INTEGER NOT NULL DEFAULT 0,
  snowball_hops_executed INTEGER NOT NULL DEFAULT 0,
  telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_nr_run_type CHECK (run_type IN ('discovery', 'watchlist_poll', 'snowball', 'auto_cycle')),
  CONSTRAINT chk_nr_status CHECK (status IN ('running', 'completed', 'partial', 'failed'))
);

-- ============================================================================
-- 4. ISOLATED STAGING & WATCHLIST STORE: newborn_candidates
--    (Strictly isolated from universal_master_pins, mv_pulse_24h_summary,
--     and domain_intelligence_rollup until explicitly or auto-promoted!)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_candidates (
  pin_id VARCHAR(64) PRIMARY KEY,
  stage VARCHAR(32) NOT NULL DEFAULT 'discovered',
  first_surface VARCHAR(64) NOT NULL DEFAULT 'pin_serp_capsules',
  discovered_surfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  seed_query TEXT,
  snowball_parent_pin_id VARCHAR(64),
  snowball_hop INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_signature VARCHAR(128),
  dominant_color VARCHAR(32),
  destination_url TEXT,
  clean_domain VARCHAR(255),
  is_linkless BOOLEAN NOT NULL DEFAULT FALSE,
  pinner_username VARCHAR(128),
  pinner_full_name VARCHAR(255),
  pinner_followers INTEGER,
  origin_creator_username VARCHAR(128),
  origin_creator_full_name VARCHAR(255),
  origin_creator_followers INTEGER,
  effective_creator_username VARCHAR(128),
  effective_creator_followers INTEGER,
  creator_monthly_reach BIGINT,
  creator_profile_views BIGINT,
  creator_pin_count INTEGER,
  is_repin BOOLEAN NOT NULL DEFAULT FALSE,
  board_id VARCHAR(64),
  board_name TEXT,
  board_url TEXT,
  board_order_modified_at TIMESTAMPTZ,
  upload_provenance VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
  raw_creation_method TEXT,
  has_ai_disclosure BOOLEAN NOT NULL DEFAULT FALSE,
  is_video BOOLEAN NOT NULL DEFAULT FALSE,
  is_carousel BOOLEAN NOT NULL DEFAULT FALSE,
  is_product BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_pinterest TIMESTAMPTZ,
  age_days DOUBLE PRECISION,
  save_count BIGINT,
  repin_count BIGINT,
  comment_count INTEGER,
  share_count INTEGER,
  reaction_count INTEGER,
  is_hydrated BOOLEAN NOT NULL DEFAULT FALSE,
  repin_per_day DOUBLE PRECISION,
  save_per_day DOUBLE PRECISION,
  daily_repin_delta DOUBLE PRECISION,
  daily_save_delta DOUBLE PRECISION,
  golden_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_golden_pin BOOLEAN NOT NULL DEFAULT FALSE,
  is_rookie_outlier BOOLEAN NOT NULL DEFAULT FALSE,
  outlier_ratio DOUBLE PRECISION,
  visual_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  guided_capsules JSONB NOT NULL DEFAULT '[]'::jsonb,
  crossover_blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  consecutive_qualifying_days INTEGER NOT NULL DEFAULT 0,
  last_qualified_date DATE,
  watchlist_added_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  promoted_at TIMESTAMPTZ,
  promoted_destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile_id INTEGER REFERENCES public.newborn_rule_profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nc_stage CHECK (stage IN ('discovered', 'watchlist', 'promoted', 'discarded'))
) WITH (fillfactor = 80);

-- ============================================================================
-- 5. STAGING DAILY TRAJECTORY SNAPSHOTS: newborn_candidate_snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_candidate_snapshots (
  pin_id VARCHAR(64) NOT NULL REFERENCES public.newborn_candidates(pin_id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  save_count BIGINT,
  repin_count BIGINT,
  comment_count INTEGER,
  share_count INTEGER,
  reaction_count INTEGER,
  repin_per_day DOUBLE PRECISION,
  save_per_day DOUBLE PRECISION,
  golden_score DOUBLE PRECISION,
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pin_id, recorded_date)
) WITH (fillfactor = 80);

-- ============================================================================
-- 6. ISOLATED ROOKIE / RISING ACCOUNT RADAR: newborn_rookie_accounts
--    (Strictly isolated from competitor_profiles until promoted to /accounts!)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_rookie_accounts (
  username VARCHAR(128) PRIMARY KEY,
  stage VARCHAR(32) NOT NULL DEFAULT 'discovered',
  display_name VARCHAR(255),
  avatar_url TEXT,
  website_url TEXT,
  clean_domain VARCHAR(255),
  follower_count INTEGER,
  monthly_reach BIGINT,
  profile_views BIGINT,
  pin_count INTEGER,
  board_count INTEGER,
  account_created_at TIMESTAMPTZ,
  rookie_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  outlier_multiplier DOUBLE PRECISION,
  golden_pins_count INTEGER NOT NULL DEFAULT 0,
  sample_pin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  consecutive_qualifying_days INTEGER NOT NULL DEFAULT 0,
  last_qualified_date DATE,
  promoted_competitor_id INTEGER REFERENCES public.competitor_profiles(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nra_stage CHECK (stage IN ('discovered', 'watchlist', 'promoted', 'discarded'))
) WITH (fillfactor = 80);

-- ============================================================================
-- 7. STANDALONE DAILY VELOCITY CRAWLER ANCHOR: newborn_daily_anchors
--    Guarantees 01:00 UTC velocity fleet keeps updating pins_daily_metrics
--    for promoted Golden Pins even without a SERP keyword or tracked creator!
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.newborn_daily_anchors (
  pin_id VARCHAR(255) PRIMARY KEY REFERENCES public.universal_master_pins(pin_id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL,
  seed_query TEXT,
  notes TEXT NOT NULL DEFAULT '',
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

-- ============================================================================
-- 8. HOT-SAFE & SARGABLE INDEXES (Zero volatile counters or timestamps)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_nrp_active_default
  ON public.newborn_rule_profiles (is_active, is_default);

CREATE INDEX IF NOT EXISTS idx_nrp_folder_id
  ON public.newborn_rule_profiles (folder_id)
  WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nruns_started_at
  ON public.newborn_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_nc_stage_golden
  ON public.newborn_candidates (stage, is_golden_pin);

CREATE INDEX IF NOT EXISTS idx_nc_stage_first_seen
  ON public.newborn_candidates (stage, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_nc_effective_creator
  ON public.newborn_candidates (LOWER((effective_creator_username)::text))
  WHERE effective_creator_username IS NOT NULL AND effective_creator_username <> '';

CREATE INDEX IF NOT EXISTS idx_nc_clean_domain
  ON public.newborn_candidates (clean_domain)
  WHERE clean_domain IS NOT NULL AND clean_domain <> '';

CREATE INDEX IF NOT EXISTS idx_nc_hashtext_mod20
  ON public.newborn_candidates (((ABS((hashtext((pin_id)::text))::bigint) % (20)::bigint)))
  WHERE stage = 'watchlist';

CREATE INDEX IF NOT EXISTS idx_ncs_recorded_date
  ON public.newborn_candidate_snapshots (recorded_date);

CREATE INDEX IF NOT EXISTS idx_nra_stage_first_seen
  ON public.newborn_rookie_accounts (stage, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_nda_hashtext_mod20
  ON public.newborn_daily_anchors (((ABS((hashtext((pin_id)::text))::bigint) % (20)::bigint)))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_nda_folder_id
  ON public.newborn_daily_anchors (folder_id)
  WHERE folder_id IS NOT NULL;

-- Purge any stray pre-squash drift rows beyond canonical 001..003
DELETE FROM public.schema_migrations
WHERE version NOT IN ('001', '002', '003');
