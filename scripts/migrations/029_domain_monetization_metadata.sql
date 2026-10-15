-- ============================================================================
-- Migration 029: Domain Monetization Intelligence & Historical Switch Tracking
-- Target: Neon Serverless Postgres (Central Hub)
-- ============================================================================

SET lock_timeout = '3000';

-- 1. جدول سجل شبكات الإعلانات وتاريخ التحولات والانتقالات بين الشبكات
CREATE TABLE IF NOT EXISTS domain_monetization_metadata (
    domain VARCHAR(255) PRIMARY KEY,
    current_ad_network VARCHAR(64) DEFAULT 'unchecked', -- 'raptive' | 'mediavine' | 'journey' | 'ezoic' | 'monumetric' | 'shemedia' | 'adsense' | 'affiliate_only' | 'protected' | 'failed'
    ad_manager_domain VARCHAR(128),                     -- e.g. 'cafemedia.com', 'mediavine.com', 'journeymv.com', 'ezoic.com'
    primary_pub_id VARCHAR(128),                        -- e.g. 'pub-1234567890' or partner account id
    previous_ad_network VARCHAR(64),                    -- e.g. 'ezoic' before upgrading to 'mediavine'
    switched_at TIMESTAMPTZ,                            -- Timestamp of latest network switch
    network_history JSONB DEFAULT '[]'::jsonb,          -- Full audit log: [{ network, detected_at, left_at, manager_domain }]
    ads_txt_status VARCHAR(32) DEFAULT 'pending',       -- 'resolved' | 'not_found' | 'protected' | 'failed'
    raw_header_snippet TEXT,                            -- Diagnostic snippet of ads.txt header / manager comments
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE domain_monetization_metadata SET (fillfactor = 85);

-- 2. فهارس التغطية للفلترة السريعة وتتبع شبكات الإعلانات
CREATE INDEX IF NOT EXISTS idx_dmm_current_network
ON domain_monetization_metadata (current_ad_network, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_dmm_switched_at
ON domain_monetization_metadata (switched_at DESC NULLS LAST)
WHERE switched_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dmm_ads_txt_status
ON domain_monetization_metadata (ads_txt_status, checked_at DESC);

-- 3. تسجيل الهجرة 029 في schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('029', 'domain_monetization_metadata', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
