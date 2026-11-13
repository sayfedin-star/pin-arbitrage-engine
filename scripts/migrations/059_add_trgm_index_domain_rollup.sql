-- ============================================================================
-- Migration 059: GIN Trigram Index on domain_intelligence_rollup (LOWER(domain))
-- File: scripts/migrations/059_add_trgm_index_domain_rollup.sql
-- Purpose: Eliminates Sequential Scans on domain search pattern matching in
--          listDomainsIntelligenceFast (LOWER(r.domain) LIKE '%pattern%').
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_dir_trgm_domain
  ON public.domain_intelligence_rollup USING gin (LOWER(domain) gin_trgm_ops);

COMMIT;
