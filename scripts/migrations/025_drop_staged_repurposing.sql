-- ============================================================================
-- Migration 025: Drop Staged Repurposing Queue (pa_staged_pins)
-- ============================================================================

DROP INDEX IF EXISTS idx_pa_staged_pins_status;
DROP TABLE IF EXISTS pa_staged_pins CASCADE;
