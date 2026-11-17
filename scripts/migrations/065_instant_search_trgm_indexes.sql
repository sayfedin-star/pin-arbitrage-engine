-- Migration 065: Instant Multi-Entity Live Search Trigram & Pattern Indexes
--
-- 1. Restores idx_cp_trgm_display_name on competitor_profiles (eliminates ~300ms Seq Scan on OR username/display_name searches)
-- 2. Adds idx_kf_trgm_name on keyword_folders for scalable folder substring/prefix autocomplete
-- 3. Adds text_pattern_ops btree indexes for 2-character prefix LIKE 'xx%' index-only/range scans under non-C collation
--
-- Note: Uses standard CREATE INDEX IF NOT EXISTS (without CONCURRENTLY) because migrate.mjs runs inside a transaction block.

CREATE INDEX IF NOT EXISTS idx_cp_trgm_display_name
  ON competitor_profiles USING gin (LOWER(COALESCE(display_name, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cp_lower_username_pattern
  ON competitor_profiles USING btree (LOWER(username) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_kf_trgm_name
  ON keyword_folders USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword_pattern
  ON tracked_keywords USING btree (LOWER(keyword) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_dir_lower_domain_pattern
  ON domain_intelligence_rollup USING btree (LOWER(domain) text_pattern_ops);
