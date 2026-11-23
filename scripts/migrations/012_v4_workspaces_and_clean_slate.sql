-- ============================================================================
-- scripts/migrations/012_v4_workspaces_and_clean_slate.sql
-- Version: 012 (v4_workspaces_and_clean_slate)
--
-- V4 Wave 1 Foundation (Path A: Workspaces & Unified 4-Source Tracking First):
--   1. Adds `public.workspaces` (with `owner_user_id` column ready for Wave 4 auth)
--      and seeds Default Workspace (id = 1).
--   2. Adds `public.workspace_settings` (single unified settings SSOT per workspace).
--   3. Adds `public.workspace_watchlist` (unified Creators / Domains / Pins watchlist
--      with `metrics_only` vs `metrics_full_catalog` creator tracking modes).
--   4. Adds `public.campaign_tracked_pins` (unified 4-source daily tracking:
--      `search`, `newborn`, `creator`, `related`).
--   5. Adds `public.campaign_pin_graph_seeds` (campaign-scoped Related Pins seeds).
--   6. Extends `keyword_folders` with `workspace_id`, `serp_top_n`, `pin_graph_rules`,
--      and extends `newborn_runs` + `newborn_keyword_clusters` with `workspace_id`
--      and `folder_id`.
--
-- POSTGRESQL 16 HOT-UPDATE HYGIENE:
--   - Sets `fillfactor = 80` on mutable tables.
--   - Intentionally creates ZERO secondary indexes on volatile timestamp/counter
--     columns so Heap-Only Tuple (HOT) updates stay intact.
--   - Preserves shared Pinterest raw cache tables (`universal_master_pins`,
--     `pins_daily_metrics`, `competitor_profiles`, `competitor_boards`,
--     `competitor_board_pins`, `domain_intelligence_rollup`, `candidate_graph_nodes`).
-- ============================================================================

-- 1. Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  icon VARCHAR(64) NOT NULL DEFAULT 'briefcase',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

INSERT INTO public.workspaces (id, name, slug, icon, is_default)
VALUES (1, 'Default Workspace', 'default', 'briefcase', TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.workspaces', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM public.workspaces), 1), 1),
  TRUE
);

-- 2. Unified Workspace Settings (Single Settings Page SSOT)
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  workspace_id INTEGER PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  max_pin_age_days INTEGER NOT NULL DEFAULT 30,
  min_repin_count INTEGER NOT NULL DEFAULT 20,
  min_save_count INTEGER NOT NULL DEFAULT 0,
  default_serp_top_n INTEGER NOT NULL DEFAULT 20,
  execution_mode VARCHAR(16) NOT NULL DEFAULT 'auto',
  extraction_targets JSONB NOT NULL DEFAULT '{
    "search": {"enabled": true, "target_pins": 500},
    "boards": {"enabled": true, "max_boards": 10, "target_pins_per_board": 100},
    "idea_page": {"enabled": true, "target_pins": 250},
    "home_feed": {"enabled": false, "target_pins": 250},
    "related_pins": {"enabled": false, "target_pins": 300}
  }'::jsonb,
  pin_graph_rules JSONB NOT NULL DEFAULT '{
    "auto_trigger_enabled": false,
    "min_repins": 500,
    "linkless_only": false,
    "max_pages": 20
  }'::jsonb,
  pinterest_cookie_enc TEXT,
  rule_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ws_settings_exec_mode CHECK (execution_mode IN ('auto', 'direct', 'fleet')),
  CONSTRAINT chk_ws_settings_top_n CHECK (default_serp_top_n BETWEEN 5 AND 100)
) WITH (fillfactor = 80);

INSERT INTO public.workspace_settings (workspace_id)
VALUES (1)
ON CONFLICT (workspace_id) DO NOTHING;

-- 3. Workspace Watchlist (Creators / Domains / Saved Pins)
CREATE TABLE IF NOT EXISTS public.workspace_watchlist (
  id BIGSERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type VARCHAR(16) NOT NULL,
  entity_key VARCHAR(255) NOT NULL,
  creator_tracking_mode VARCHAR(32) NOT NULL DEFAULT 'metrics_only',
  notes TEXT NOT NULL DEFAULT '',
  added_from_folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ww_entity_type CHECK (entity_type IN ('creator', 'domain', 'pin')),
  CONSTRAINT chk_ww_creator_mode CHECK (creator_tracking_mode IN ('metrics_only', 'metrics_full_catalog')),
  UNIQUE (workspace_id, entity_type, entity_key)
) WITH (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_ww_workspace_type
  ON public.workspace_watchlist (workspace_id, entity_type);

-- 4. Unified Campaign Tracked Pins (4 Sources: search | newborn | creator | related)
CREATE TABLE IF NOT EXISTS public.campaign_tracked_pins (
  folder_id INTEGER NOT NULL REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(16) NOT NULL,
  source_ref VARCHAR(255) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (folder_id, pin_id, source_type),
  CONSTRAINT chk_ctp_source_type CHECK (source_type IN ('search', 'newborn', 'creator', 'related'))
) WITH (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_ctp_workspace_folder
  ON public.campaign_tracked_pins (workspace_id, folder_id);

CREATE INDEX IF NOT EXISTS idx_ctp_active_pin
  ON public.campaign_tracked_pins (pin_id)
  WHERE is_active = TRUE;

-- 5. Campaign-Scoped Pin Graph (Related Pins) Seeds
CREATE TABLE IF NOT EXISTS public.campaign_pin_graph_seeds (
  folder_id INTEGER NOT NULL REFERENCES public.keyword_folders(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seed_pin_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(24) NOT NULL DEFAULT 'manual',
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (folder_id, seed_pin_id),
  CONSTRAINT chk_cpgs_source_type CHECK (source_type IN ('manual', 'trigger', 'newborn', 'search')),
  CONSTRAINT chk_cpgs_status CHECK (status IN ('queued', 'crawled', 'failed'))
) WITH (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_cpgs_workspace_folder
  ON public.campaign_pin_graph_seeds (workspace_id, folder_id);

-- 6. Extend existing Campaign & Newborn tables with Workspace Isolation + Flexible Top N
ALTER TABLE public.keyword_folders
  ADD COLUMN IF NOT EXISTS workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS serp_top_n INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS pin_graph_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.keyword_folders
  DROP CONSTRAINT IF EXISTS chk_kf_serp_top_n;

ALTER TABLE public.keyword_folders
  ADD CONSTRAINT chk_kf_serp_top_n CHECK (serp_top_n BETWEEN 5 AND 100);

CREATE INDEX IF NOT EXISTS idx_keyword_folders_workspace
  ON public.keyword_folders (workspace_id);

ALTER TABLE public.newborn_runs
  ADD COLUMN IF NOT EXISTS workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL;

ALTER TABLE public.newborn_keyword_clusters
  ADD COLUMN IF NOT EXISTS workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES public.keyword_folders(id) ON DELETE SET NULL;
