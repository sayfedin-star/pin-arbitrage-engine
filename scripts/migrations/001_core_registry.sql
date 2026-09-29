-- ============================================================================
-- Migration 001: Central Neon Projects Registry
-- Manages up to 100 Neon Serverless Postgres projects, connection strings,
-- and shard assignments for pin-arbitrage-engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neon_projects_registry (
    id SERIAL PRIMARY KEY,
    project_id VARCHAR(64) UNIQUE NOT NULL,
    project_name VARCHAR(128) NOT NULL,
    region_id VARCHAR(64) DEFAULT 'aws-us-east-2',
    database_url TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'active', -- active | idle | suspended
    is_hub BOOLEAN DEFAULT FALSE,
    assigned_shards INT[] DEFAULT '{}',
    stats JSONB DEFAULT '{"seeds": 0, "candidates": 0, "competitors": 0, "keywords": 0, "storage_mb": 0}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb, -- Extensibility slot for future attributes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neon_projects_status ON neon_projects_registry(status);
CREATE INDEX IF NOT EXISTS idx_neon_projects_is_hub ON neon_projects_registry(is_hub);
