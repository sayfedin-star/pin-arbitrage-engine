-- ============================================================================
-- Migration 006: Pin Qualification Rules, Early-Stop & Harvest Architecture
-- Unified P2 & P4 Pipeline for Neon Serverless Postgres
-- ============================================================================

CREATE TABLE IF NOT EXISTS pa_qualification_rules (
    id INT PRIMARY KEY DEFAULT 1,
    tier1_min_saves INT DEFAULT 100,
    tier2_min_repins INT DEFAULT 100,
    tier3_max_age_days INT DEFAULT 14,
    tier3_min_saves INT DEFAULT 25,
    master_ingest_enabled BOOLEAN DEFAULT TRUE,
    early_stop_pages INT DEFAULT 3,
    max_batch_pins INT DEFAULT 500,
    discovery_max_pages INT DEFAULT 500,
    refresh_max_pins INT DEFAULT 0,
    paused_policy VARCHAR(32) DEFAULT 'reject',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_rules_row CHECK (id = 1)
);

-- Seed default qualification rules if not exists
INSERT INTO pa_qualification_rules (
    id,
    tier1_min_saves,
    tier2_min_repins,
    tier3_max_age_days,
    tier3_min_saves,
    master_ingest_enabled,
    early_stop_pages,
    max_batch_pins,
    discovery_max_pages,
    refresh_max_pins,
    paused_policy,
    updated_at
) VALUES (
    1,
    100,
    100,
    14,
    25,
    TRUE,
    3,
    500,
    500,
    0,
    'reject',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Add harvest metadata to competitor_profiles if not present
ALTER TABLE competitor_profiles 
    ADD COLUMN IF NOT EXISTS last_harvest_metadata JSONB DEFAULT '{}'::jsonb;
