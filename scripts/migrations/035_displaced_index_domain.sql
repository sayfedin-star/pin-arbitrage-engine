-- Migration 035: Add domain column to keyword_displaced_index for fast Domain Studio discovery
-- Target: Central Neon Hub
SET lock_timeout = '3000';

ALTER TABLE keyword_displaced_index
  ADD COLUMN IF NOT EXISTS domain VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_kdi_domain
  ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';

-- Backfill domain from keyword_serp_current where available
UPDATE keyword_displaced_index kdi
SET domain = ksc.domain
FROM keyword_serp_current ksc
WHERE ksc.keyword_id = kdi.keyword_id
  AND ksc.pin_id = kdi.pin_id
  AND (kdi.domain IS NULL OR kdi.domain = '')
  AND (ksc.domain IS NOT NULL AND ksc.domain <> '');

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('035', 'add_domain_to_keyword_displaced_index', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
