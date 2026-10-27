-- Migration 038: Campaign Workspace Scoping (folder_competitor_items & folder_pinned_domains)
-- [INVARIANT: SARGABLE-INDEX-SEEKING]
-- [INVARIANT: FOLDER-SCOPED-WORKSPACE]

CREATE TABLE IF NOT EXISTS folder_competitor_items (
  id SERIAL PRIMARY KEY,
  folder_id INT NOT NULL REFERENCES keyword_folders(id) ON DELETE CASCADE,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(folder_id, competitor_id)
);
CREATE INDEX IF NOT EXISTS idx_fci_folder_id ON folder_competitor_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_fci_competitor_id ON folder_competitor_items(competitor_id);

CREATE TABLE IF NOT EXISTS folder_pinned_domains (
  id SERIAL PRIMARY KEY,
  folder_id INT NOT NULL REFERENCES keyword_folders(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  notes TEXT DEFAULT '',
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(folder_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_fpd_folder_id ON folder_pinned_domains(folder_id);
CREATE INDEX IF NOT EXISTS idx_fpd_domain ON folder_pinned_domains(domain);

-- Trigger for SARGable index seeking
CREATE OR REPLACE FUNCTION trg_normalize_pinned_domain()
RETURNS TRIGGER AS $$
BEGIN
  NEW.domain := LOWER(REGEXP_REPLACE(REGEXP_REPLACE(NEW.domain, '^https?://', '', 'i'), '^www\.', '', 'i'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fpd_normalize_domain ON folder_pinned_domains;
CREATE TRIGGER trg_fpd_normalize_domain
  BEFORE INSERT OR UPDATE OF domain ON folder_pinned_domains
  FOR EACH ROW EXECUTE FUNCTION trg_normalize_pinned_domain();
