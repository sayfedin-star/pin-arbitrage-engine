-- Migration 042: HOT Optimization (fillfactor = 70) and Schema Compaction (url_global_saves)
-- [INVARIANT: 100-PERCENT-HOT-UPDATES]
-- [INVARIANT: GLOBAL-ARTICLE-SAVES]

ALTER TABLE keyword_serp_current SET (fillfactor = 70);
ALTER TABLE keyword_displaced_index SET (fillfactor = 70);
ALTER TABLE competitor_pins SET (fillfactor = 70);

ALTER TABLE keyword_serp_current ADD COLUMN IF NOT EXISTS url_global_saves BIGINT DEFAULT 0;
ALTER TABLE universal_master_pins ADD COLUMN IF NOT EXISTS url_global_saves BIGINT DEFAULT 0;
