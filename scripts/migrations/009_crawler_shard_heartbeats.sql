-- ==============================================================================
-- 009_crawler_shard_heartbeats.sql
-- Migration: Matrix Crawler Shard Heartbeats & Producer-Consumer Distributed Coordination
-- ==============================================================================

CREATE TABLE IF NOT EXISTS crawler_shard_heartbeats (
  competitor_id INT NOT NULL,
  shard_number INT NOT NULL,
  shard_total INT NOT NULL DEFAULT 20,
  status VARCHAR(32) NOT NULL DEFAULT 'booting',
  discovered_count INT NOT NULL DEFAULT 0,
  enriched_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competitor_id, shard_number)
);

CREATE INDEX IF NOT EXISTS idx_crawler_shard_heartbeats_status 
  ON crawler_shard_heartbeats (competitor_id, status, updated_at);
