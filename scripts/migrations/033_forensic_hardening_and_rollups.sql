-- ==============================================================================
-- Migration 033: Forensic Hardening, Rollup Studio & Historical View Safety
-- Engine: Neon Serverless Postgres (Hub & 99 Shards Parity)
-- ==============================================================================

-- 1. إسقاط الفهرس المعطل لتحديثات HOT على جداول النبضات وإنشاء الفهرس الجزئي الخفيف
DROP INDEX IF EXISTS idx_crawler_shard_heartbeats_status;
CREATE INDEX IF NOT EXISTS idx_crawler_shard_heartbeats_active 
  ON crawler_shard_heartbeats (competitor_id, status)
  WHERE status IN ('crawling_boards', 'enriching');

-- 2. إضافة عمود وفهرس اللوحات السريع board_slug وفهرس تغطية النطاقات على جداول المنافسين
ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS board_slug VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_cp_board_slug ON competitor_pins(competitor_id, board_slug);
CREATE INDEX IF NOT EXISTS idx_cp_domain_rollup_covering 
  ON competitor_pins (LOWER(REGEXP_REPLACE(link_domain, '^www\.', '')))
  INCLUDE (pin_id, competitor_id, save_count, repin_count, destination_url)
  WHERE link_domain IS NOT NULL AND link_domain <> '';

-- 3. إنشاء جدول التجميع المادي الدائم لاستوديو النطاقات (Central Metadata Hub)
CREATE TABLE IF NOT EXISTS domain_intelligence_rollup (
  domain VARCHAR(255) PRIMARY KEY,
  total_pins INT NOT NULL DEFAULT 0,
  unique_urls INT NOT NULL DEFAULT 1,
  active_serp_pins INT NOT NULL DEFAULT 0,
  top3_pins INT NOT NULL DEFAULT 0,
  top10_pins INT NOT NULL DEFAULT 0,
  rank_11_50_pins INT NOT NULL DEFAULT 0,
  displaced_pins INT NOT NULL DEFAULT 0,
  best_rank INT,
  avg_rank NUMERIC(5,2),
  visibility_score NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_saves BIGINT NOT NULL DEFAULT 0,
  avg_saves NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_repins BIGINT NOT NULL DEFAULT 0,
  avg_velocity NUMERIC(10,2) NOT NULL DEFAULT 0,
  pins_per_url NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  accounts_count INT NOT NULL DEFAULT 1,
  sample_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ad_network VARCHAR(64) DEFAULT 'unchecked',
  ad_manager_domain VARCHAR(255),
  primary_pub_id VARCHAR(128),
  previous_ad_network VARCHAR(64),
  ad_switched_at TIMESTAMPTZ,
  ad_network_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ads_txt_status VARCHAR(32) DEFAULT 'pending',
  ad_provider VARCHAR(64),
  age_days INT,
  age_years NUMERIC(5,2),
  age_status VARCHAR(32) DEFAULT 'unchecked',
  domain_created_at TIMESTAMPTZ,
  domain_expires_at TIMESTAMPTZ,
  lookup_status VARCHAR(32) DEFAULT 'pending',
  decay_rate_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
  arbitrage_score NUMERIC(10,2) DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS primary_pub_id VARCHAR(128);
ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ad_switched_at TIMESTAMPTZ;
ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ad_network_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS ads_txt_status VARCHAR(32) DEFAULT 'pending';
ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS decay_rate_pct NUMERIC(5,1) NOT NULL DEFAULT 0;
ALTER TABLE domain_intelligence_rollup ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dir_vis_saves ON domain_intelligence_rollup(visibility_score DESC, total_saves DESC);
CREATE INDEX IF NOT EXISTS idx_dir_top10 ON domain_intelligence_rollup(top10_pins DESC);
CREATE INDEX IF NOT EXISTS idx_dir_ad_network ON domain_intelligence_rollup(ad_network);
CREATE INDEX IF NOT EXISTS idx_dir_age_status ON domain_intelligence_rollup(age_status);

-- 4. ترحيل البيانات التاريخية بأمان قبل تحويل pins_daily_snapshots إلى View
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'pins_daily_snapshots' AND table_type = 'BASE TABLE'
  ) THEN
    -- نسخ البيانات التاريخية إلى pins_daily_metrics
    INSERT INTO pins_daily_metrics (
      pin_id, snapshot_date, save_count, repin_count, comment_count,
      share_count, reaction_count, daily_save_velocity, updated_at
    )
    SELECT 
      pin_id,
      snapshot_date,
      save_count,
      COALESCE(repin_count, 0),
      COALESCE(comment_count, 0),
      COALESCE(share_count, 0),
      COALESCE(reaction_count, 0),
      COALESCE(daily_save_velocity, 0),
      COALESCE(created_at, NOW())
    FROM pins_daily_snapshots
    ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
      save_count = GREATEST(pins_daily_metrics.save_count, EXCLUDED.save_count),
      repin_count = GREATEST(pins_daily_metrics.repin_count, EXCLUDED.repin_count),
      reaction_count = GREATEST(pins_daily_metrics.reaction_count, EXCLUDED.reaction_count),
      updated_at = NOW();

    -- نسخ مواضع الكلمات المفتاحية إلى pin_serp_positions
    INSERT INTO pin_serp_positions (
      pin_id, snapshot_date, keyword_id, rank_position, is_displaced,
      last_known_rank, catalog_rank, updated_at
    )
    SELECT 
      pin_id,
      snapshot_date,
      keyword_id,
      rank_position,
      COALESCE(is_displaced, FALSE),
      rank_position AS last_known_rank,
      COALESCE(rank_position, 100) AS catalog_rank,
      COALESCE(created_at, NOW())
    FROM pins_daily_snapshots
    WHERE keyword_id IS NOT NULL AND keyword_id > 0
    ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
      rank_position = COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position),
      updated_at = NOW();

    -- إسقاط الجدول الأساسي بعد استيفاء الترحيل
    DROP TABLE pins_daily_snapshots CASCADE;
  END IF;
END $$;

-- 5. إنشاء العرض الشامل الموحد pins_daily_snapshots لكافة الحقول المطلوبة مع عمودي id و competitor_id للتوافق العكسي
CREATE OR REPLACE VIEW pins_daily_snapshots AS
SELECT 
  (('x' || SUBSTR(MD5(m.pin_id || '_' || m.snapshot_date::text || '_' || COALESCE(p.keyword_id::text, '0')), 1, 15))::bit(60)::bigint) AS id,
  m.pin_id,
  p.keyword_id,
  NULL::int AS competitor_id,
  p.rank_position,
  COALESCE(p.is_displaced, FALSE) AS is_displaced,
  p.last_known_rank,
  m.save_count,
  m.repin_count,
  m.comment_count,
  m.share_count,
  COALESCE(m.reaction_count, 0) AS reaction_count,
  m.daily_save_velocity,
  m.snapshot_date,
  m.updated_at AS created_at
FROM pins_daily_metrics m
LEFT JOIN pin_serp_positions p 
  ON p.pin_id = m.pin_id AND p.snapshot_date = m.snapshot_date;

-- تسجيل الهجرة في جدول سجل الترحيلات
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('033', '033_forensic_hardening_and_rollups', NOW())
ON CONFLICT (version) DO NOTHING;

