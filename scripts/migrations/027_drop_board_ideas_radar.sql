-- Migration 027: Drop Board Ideas Radar studio tables across Fleet (Hub & 99 Shards)
DROP TABLE IF EXISTS board_idea_snapshots CASCADE;
DROP TABLE IF EXISTS tracked_boards CASCADE;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('027', '027_drop_board_ideas_radar', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
