-- ============================================================================
-- Migration 028: Domain Intelligence Studio, WHOIS Age Registry & Covering Indexes
-- Target: Neon Serverless Postgres (Central Hub)
-- ============================================================================

SET lock_timeout = '3000';

-- 1. جدول سجل أعمار وتواريخ تسجيل النطاقات (Fetch-Once, Compute-Forever)
CREATE TABLE IF NOT EXISTS domain_registry_metadata (
    domain VARCHAR(255) PRIMARY KEY,
    registered_at TIMESTAMPTZ,
    updated_at_whois TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    initial_age_days INT,
    initial_age_years NUMERIC(6, 2),
    lookup_source VARCHAR(32) DEFAULT 'domainee', -- 'domainee' | 'rdap'
    lookup_status VARCHAR(32) DEFAULT 'pending',  -- 'resolved' | 'pending' | 'failed'
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE domain_registry_metadata SET (fillfactor = 85);

CREATE INDEX IF NOT EXISTS idx_drm_registered_at
ON domain_registry_metadata (registered_at DESC NULLS LAST)
WHERE lookup_status = 'resolved';

CREATE INDEX IF NOT EXISTS idx_drm_expires_at
ON domain_registry_metadata (expires_at ASC NULLS LAST)
WHERE expires_at IS NOT NULL;

-- 2. فهرس التغطية الشامل للنطاقات في جدول البحث النشط keyword_serp_current
CREATE INDEX IF NOT EXISTS idx_ksc_domain_serp_authority
ON keyword_serp_current (LOWER(REGEXP_REPLACE(domain, '^www\.', '')), is_displaced, rank_position ASC)
INCLUDE (keyword_id, pin_id, save_count, repin_count, daily_save_velocity, creator_username, destination_url)
WHERE domain IS NOT NULL AND domain <> '';

-- 3. فهرس التغطية للنطاقات في أرشيف الدبابيس الفائزة pa_pins
CREATE INDEX IF NOT EXISTS idx_pa_pins_domain_saves
ON pa_pins (LOWER(REGEXP_REPLACE(domain, '^www\.', '')), saves DESC)
INCLUDE (pin_id, repins, velocity, account_username, is_product, link)
WHERE domain IS NOT NULL AND domain <> '';

-- 4. فهرس التغطية للنطاقات في كتالوج المنافسين competitor_pins
CREATE INDEX IF NOT EXISTS idx_cp_link_domain_saves
ON competitor_pins (LOWER(REGEXP_REPLACE(link_domain, '^www\.', '')), save_count DESC)
INCLUDE (competitor_id, pin_id, repin_count, is_product, destination_url)
WHERE link_domain IS NOT NULL AND link_domain <> '';

-- 5. تسجيل الهجرة 028 في schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('028', 'domain_intelligence_and_age_registry', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
