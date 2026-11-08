-- ============================================================================
-- Migration 049: Complete SSOT Backfill into universal_master_pins & Index Tuning
-- ============================================================================
-- 1. Sanitize corrupted non-array visual_annotations JSONB values (fixes SQLSTATE 22023)
-- 2. Backfill all 934 orphan pins from keyword_serp_current, competitor_pins,
--    pa_pins, and keyword_displaced_index into universal_master_pins SSOT
-- 3. Add composite index idx_kdi_keyword_saves to eliminate external merge Disk sort
-- 4. Register migrations 045..049 in schema_migrations
-- ============================================================================

-- Step 1: Sanitize non-array visual_annotations in universal_master_pins and keyword_serp_current
UPDATE universal_master_pins
SET visual_annotations = '[]'::jsonb
WHERE visual_annotations IS NULL OR jsonb_typeof(visual_annotations) <> 'array';

UPDATE keyword_serp_current
SET visual_annotations = '[]'::jsonb
WHERE visual_annotations IS NOT NULL AND jsonb_typeof(visual_annotations) <> 'array';

-- Step 2A: Backfill from keyword_serp_current into universal_master_pins
INSERT INTO universal_master_pins (
  pin_id,
  creator_username,
  board_name,
  title,
  domain,
  destination_url,
  image_url,
  dominant_color,
  visual_annotations,
  created_at_pinterest,
  first_discovered_pillar,
  first_discovered_at,
  updated_at,
  metadata,
  url_global_saves,
  save_count,
  repin_count,
  comment_count,
  share_count,
  daily_save_velocity,
  delta_saves_24h,
  delta_repins_24h,
  gains_5d,
  gains_7d,
  gains_10d,
  gains_15d,
  creation_method
)
SELECT DISTINCT ON (ksc.pin_id)
  ksc.pin_id,
  NULLIF(TRIM(ksc.creator_username), ''),
  NULLIF(TRIM(ksc.board_name), ''),
  NULLIF(TRIM(ksc.title), ''),
  NULLIF(TRIM(ksc.domain), ''),
  NULLIF(TRIM(ksc.destination_url), ''),
  NULLIF(TRIM(ksc.image_url), ''),
  COALESCE(NULLIF(TRIM(ksc.dominant_color), ''), '#888888'),
  CASE WHEN ksc.visual_annotations IS NOT NULL AND jsonb_typeof(ksc.visual_annotations) = 'array' THEN ksc.visual_annotations ELSE '[]'::jsonb END,
  ksc.created_at_pinterest,
  'serp',
  COALESCE(ksc.crawled_at, ksc.updated_at, NOW()),
  COALESCE(ksc.updated_at, NOW()),
  COALESCE(ksc.metadata, '{}'::jsonb),
  ksc.url_global_saves,
  COALESCE(ksc.save_count, 0),
  COALESCE(ksc.repin_count, 0),
  COALESCE(ksc.comment_count, 0),
  COALESCE(ksc.share_count, 0),
  COALESCE(ksc.daily_save_velocity, 0),
  COALESCE(ksc.daily_save_velocity, 0)::int,
  COALESCE(ksc.delta_repins_24h, 0),
  COALESCE(ksc.gains_5d, 0),
  COALESCE(ksc.gains_7d, 0),
  COALESCE(ksc.gains_10d, 0),
  COALESCE(ksc.gains_15d, 0),
  ksc.creation_method
FROM keyword_serp_current ksc
WHERE ksc.pin_id IS NOT NULL AND ksc.pin_id <> ''
ORDER BY ksc.pin_id, ksc.save_count DESC NULLS LAST, ksc.updated_at DESC NULLS LAST
ON CONFLICT (pin_id) DO UPDATE SET
  title = COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title),
  image_url = COALESCE(NULLIF(universal_master_pins.image_url, ''), EXCLUDED.image_url),
  destination_url = COALESCE(NULLIF(universal_master_pins.destination_url, ''), EXCLUDED.destination_url),
  domain = COALESCE(NULLIF(universal_master_pins.domain, ''), EXCLUDED.domain),
  creator_username = COALESCE(NULLIF(universal_master_pins.creator_username, ''), EXCLUDED.creator_username),
  board_name = COALESCE(NULLIF(universal_master_pins.board_name, ''), EXCLUDED.board_name),
  dominant_color = CASE
    WHEN universal_master_pins.dominant_color IS NULL OR universal_master_pins.dominant_color IN ('', '#888888')
    THEN COALESCE(EXCLUDED.dominant_color, universal_master_pins.dominant_color)
    ELSE universal_master_pins.dominant_color
  END,
  visual_annotations = CASE
    WHEN universal_master_pins.visual_annotations IS NULL OR jsonb_typeof(universal_master_pins.visual_annotations) <> 'array' OR jsonb_array_length(universal_master_pins.visual_annotations) = 0
    THEN EXCLUDED.visual_annotations
    ELSE universal_master_pins.visual_annotations
  END,
  created_at_pinterest = COALESCE(universal_master_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
  save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
  repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
  daily_save_velocity = GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0)),
  delta_repins_24h = GREATEST(COALESCE(universal_master_pins.delta_repins_24h, 0), COALESCE(EXCLUDED.delta_repins_24h, 0)),
  gains_5d = GREATEST(COALESCE(universal_master_pins.gains_5d, 0), COALESCE(EXCLUDED.gains_5d, 0)),
  gains_7d = GREATEST(COALESCE(universal_master_pins.gains_7d, 0), COALESCE(EXCLUDED.gains_7d, 0)),
  gains_10d = GREATEST(COALESCE(universal_master_pins.gains_10d, 0), COALESCE(EXCLUDED.gains_10d, 0)),
  gains_15d = GREATEST(COALESCE(universal_master_pins.gains_15d, 0), COALESCE(EXCLUDED.gains_15d, 0));

-- Step 2B: Backfill from competitor_pins into universal_master_pins
INSERT INTO universal_master_pins (
  pin_id,
  creator_username,
  board_name,
  board_slug,
  title,
  description,
  alt_text,
  domain,
  destination_url,
  image_url,
  created_at_pinterest,
  first_discovered_pillar,
  first_discovered_at,
  updated_at,
  metadata,
  save_count,
  repin_count,
  comment_count,
  is_product
)
SELECT DISTINCT ON (cp.pin_id)
  cp.pin_id,
  CASE
    WHEN prof.website_url IS NOT NULL AND prof.website_url <> '' AND cp.link_domain IS NOT NULL AND cp.link_domain <> ''
         AND LOWER(TRIM(prof.website_url)) LIKE '%' || LOWER(TRIM(cp.link_domain)) || '%'
    THEN prof.username
    ELSE NULL
  END AS creator_username,
  NULLIF(TRIM(cp.board_name), ''),
  NULLIF(TRIM(cp.board_slug), ''),
  NULLIF(TRIM(cp.title), ''),
  NULLIF(TRIM(cp.description), ''),
  NULLIF(TRIM(cp.alt_text), ''),
  NULLIF(TRIM(cp.link_domain), ''),
  NULLIF(TRIM(cp.destination_url), ''),
  NULLIF(TRIM(cp.image_url), ''),
  cp.created_at_pinterest,
  'competitor',
  COALESCE(cp.first_seen_at, cp.updated_at, NOW()),
  COALESCE(cp.updated_at, NOW()),
  COALESCE(cp.metadata, '{}'::jsonb),
  COALESCE(cp.save_count, 0),
  COALESCE(cp.repin_count, 0),
  COALESCE(cp.comment_count, 0),
  COALESCE(cp.is_product, FALSE)
FROM competitor_pins cp
LEFT JOIN competitor_profiles prof ON prof.id = cp.competitor_id
WHERE cp.pin_id IS NOT NULL AND cp.pin_id <> ''
ORDER BY cp.pin_id, cp.save_count DESC NULLS LAST, cp.updated_at DESC NULLS LAST
ON CONFLICT (pin_id) DO UPDATE SET
  title = COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title),
  description = COALESCE(NULLIF(universal_master_pins.description, ''), EXCLUDED.description),
  alt_text = COALESCE(NULLIF(universal_master_pins.alt_text, ''), EXCLUDED.alt_text),
  image_url = COALESCE(NULLIF(universal_master_pins.image_url, ''), EXCLUDED.image_url),
  destination_url = COALESCE(NULLIF(universal_master_pins.destination_url, ''), EXCLUDED.destination_url),
  domain = COALESCE(NULLIF(universal_master_pins.domain, ''), EXCLUDED.domain),
  creator_username = COALESCE(NULLIF(universal_master_pins.creator_username, ''), EXCLUDED.creator_username),
  board_name = COALESCE(NULLIF(universal_master_pins.board_name, ''), EXCLUDED.board_name),
  board_slug = COALESCE(NULLIF(universal_master_pins.board_slug, ''), EXCLUDED.board_slug),
  created_at_pinterest = COALESCE(universal_master_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
  save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
  repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0));

-- Step 2C: Backfill from pa_pins into universal_master_pins
INSERT INTO universal_master_pins (
  pin_id,
  creator_username,
  board_name,
  title,
  description,
  alt_text,
  domain,
  destination_url,
  image_url,
  dominant_color,
  visual_annotations,
  created_at_pinterest,
  first_discovered_pillar,
  first_discovered_at,
  updated_at,
  save_count,
  repin_count,
  comment_count,
  share_count,
  reaction_count,
  daily_save_velocity,
  is_video,
  is_product
)
SELECT DISTINCT ON (pa.pin_id)
  pa.pin_id,
  NULLIF(TRIM(pa.account_username), ''),
  NULLIF(TRIM(pa.board_name), ''),
  NULLIF(TRIM(pa.title), ''),
  NULLIF(TRIM(pa.description), ''),
  NULLIF(TRIM(pa.alt_text), ''),
  NULLIF(TRIM(pa.domain), ''),
  NULLIF(TRIM(pa.link), ''),
  NULLIF(TRIM(pa.image_url), ''),
  COALESCE(NULLIF(TRIM(pa.dominant_color), ''), '#888888'),
  CASE WHEN pa.annotations IS NOT NULL AND jsonb_typeof(pa.annotations) = 'array' THEN pa.annotations ELSE '[]'::jsonb END,
  pa.created_at_pinterest,
  'archive',
  COALESCE(pa.first_seen_at, pa.last_updated_at, NOW()),
  COALESCE(pa.last_updated_at, NOW()),
  COALESCE(pa.saves, 0),
  COALESCE(pa.repins, 0),
  COALESCE(pa.comments, 0),
  COALESCE(pa.share_count, 0),
  0,
  COALESCE(pa.velocity, 0),
  COALESCE(pa.is_video, FALSE),
  COALESCE(pa.is_product, FALSE)
FROM pa_pins pa
WHERE pa.pin_id IS NOT NULL AND pa.pin_id <> ''
ORDER BY pa.pin_id, pa.saves DESC NULLS LAST
ON CONFLICT (pin_id) DO UPDATE SET
  title = COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title),
  description = COALESCE(NULLIF(universal_master_pins.description, ''), EXCLUDED.description),
  alt_text = COALESCE(NULLIF(universal_master_pins.alt_text, ''), EXCLUDED.alt_text),
  image_url = COALESCE(NULLIF(universal_master_pins.image_url, ''), EXCLUDED.image_url),
  destination_url = COALESCE(NULLIF(universal_master_pins.destination_url, ''), EXCLUDED.destination_url),
  domain = COALESCE(NULLIF(universal_master_pins.domain, ''), EXCLUDED.domain),
  creator_username = COALESCE(NULLIF(universal_master_pins.creator_username, ''), EXCLUDED.creator_username),
  board_name = COALESCE(NULLIF(universal_master_pins.board_name, ''), EXCLUDED.board_name),
  dominant_color = CASE
    WHEN universal_master_pins.dominant_color IS NULL OR universal_master_pins.dominant_color IN ('', '#888888')
    THEN COALESCE(EXCLUDED.dominant_color, universal_master_pins.dominant_color)
    ELSE universal_master_pins.dominant_color
  END,
  visual_annotations = CASE
    WHEN universal_master_pins.visual_annotations IS NULL OR jsonb_typeof(universal_master_pins.visual_annotations) <> 'array' OR jsonb_array_length(universal_master_pins.visual_annotations) = 0
    THEN EXCLUDED.visual_annotations
    ELSE universal_master_pins.visual_annotations
  END,
  created_at_pinterest = COALESCE(universal_master_pins.created_at_pinterest, EXCLUDED.created_at_pinterest),
  save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
  repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
  daily_save_velocity = GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0));

-- Step 2D: Backfill any remaining rows from keyword_displaced_index into universal_master_pins
INSERT INTO universal_master_pins (
  pin_id,
  creator_username,
  domain,
  first_discovered_pillar,
  first_discovered_at,
  updated_at,
  save_count,
  repin_count,
  comment_count,
  share_count,
  daily_save_velocity,
  delta_repins_24h,
  gains_5d,
  gains_7d,
  gains_10d,
  gains_15d
)
SELECT DISTINCT ON (kdi.pin_id)
  kdi.pin_id,
  NULLIF(TRIM(kdi.creator_username), ''),
  NULLIF(TRIM(kdi.domain), ''),
  'displaced',
  COALESCE(kdi.updated_at, NOW()),
  COALESCE(kdi.updated_at, NOW()),
  COALESCE(kdi.save_count, 0),
  COALESCE(kdi.repin_count, 0),
  COALESCE(kdi.comment_count, 0),
  COALESCE(kdi.share_count, 0),
  COALESCE(kdi.daily_save_velocity, 0),
  COALESCE(kdi.delta_repins_24h, 0),
  COALESCE(kdi.gains_5d, 0),
  COALESCE(kdi.gains_7d, 0),
  COALESCE(kdi.gains_10d, 0),
  COALESCE(kdi.gains_15d, 0)
FROM keyword_displaced_index kdi
WHERE kdi.pin_id IS NOT NULL AND kdi.pin_id <> ''
ORDER BY kdi.pin_id, kdi.save_count DESC NULLS LAST, kdi.updated_at DESC NULLS LAST
ON CONFLICT (pin_id) DO UPDATE SET
  domain = COALESCE(NULLIF(universal_master_pins.domain, ''), EXCLUDED.domain),
  creator_username = COALESCE(NULLIF(universal_master_pins.creator_username, ''), EXCLUDED.creator_username),
  save_count = GREATEST(COALESCE(universal_master_pins.save_count, 0), COALESCE(EXCLUDED.save_count, 0)),
  repin_count = GREATEST(COALESCE(universal_master_pins.repin_count, 0), COALESCE(EXCLUDED.repin_count, 0)),
  daily_save_velocity = GREATEST(COALESCE(universal_master_pins.daily_save_velocity, 0), COALESCE(EXCLUDED.daily_save_velocity, 0)),
  delta_repins_24h = GREATEST(COALESCE(universal_master_pins.delta_repins_24h, 0), COALESCE(EXCLUDED.delta_repins_24h, 0)),
  gains_5d = GREATEST(COALESCE(universal_master_pins.gains_5d, 0), COALESCE(EXCLUDED.gains_5d, 0)),
  gains_7d = GREATEST(COALESCE(universal_master_pins.gains_7d, 0), COALESCE(EXCLUDED.gains_7d, 0)),
  gains_10d = GREATEST(COALESCE(universal_master_pins.gains_10d, 0), COALESCE(EXCLUDED.gains_10d, 0)),
  gains_15d = GREATEST(COALESCE(universal_master_pins.gains_15d, 0), COALESCE(EXCLUDED.gains_15d, 0));

-- Step 3: Composite Index on keyword_displaced_index to eliminate Disk Sort in Folder Crossover
CREATE INDEX IF NOT EXISTS idx_kdi_keyword_saves
  ON keyword_displaced_index (keyword_id, save_count DESC NULLS LAST);

-- Step 4: Record migrations 045..049 in schema_migrations
INSERT INTO schema_migrations (version, name, applied_at)
VALUES
  ('045', '045_pin_trajectory_snapshots', NOW()),
  ('046', '046_trajectory_15d_gains', NOW()),
  ('047', '047_drop_unused_legacy_tables', NOW()),
  ('048', '048_single_db_ssot_and_treasure_schema', NOW()),
  ('049', '049_complete_ssot_backfill_and_indexes', NOW())
ON CONFLICT (version) DO NOTHING;
