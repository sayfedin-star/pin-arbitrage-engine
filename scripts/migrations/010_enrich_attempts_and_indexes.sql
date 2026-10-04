-- ============================================================================
-- Migration 010: Enrich Attempts Counter & Performance Index
-- Eliminates infinite zombie retry loops on un-enrichable or deleted pins.
-- ============================================================================

ALTER TABLE competitor_pins 
ADD COLUMN IF NOT EXISTS enrich_attempts INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_competitor_pins_enrich_attempts 
ON competitor_pins(competitor_id, enrichment_status, enrich_attempts, id);

-- Clean up negative synthetic/divider pin IDs that cannot be fetched
UPDATE competitor_pins
SET enrichment_status = 'failed',
    enrich_attempts = 3,
    updated_at = NOW()
WHERE pin_id LIKE '-%';

-- Release stuck processing pins back to pending with 1 initial attempt
UPDATE competitor_pins
SET enrichment_status = 'pending',
    enrich_attempts = 1,
    updated_at = NOW()
WHERE enrichment_status = 'processing';
