-- ============================================================================
-- Migration 056: Materialized View for 24h Pulse Executive Telemetry
-- File: scripts/migrations/056_create_mv_pulse_24h_summary.sql
-- Purpose: Provides sub-millisecond 24h Pulse summary telemetry with concurrent refresh
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
  COUNT(DISTINCT ump.clean_domain)::bigint AS active_domains_24h,
  COUNT(DISTINCT ump.creator_username)::bigint AS active_creators_24h,
  COALESCE(ROUND(AVG(ump.daily_save_velocity), 2), 0)::numeric(12,2) AS avg_velocity_24h,
  COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
  COALESCE(SUM(ump.delta_saves_24h), 0)::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM public.universal_master_pins ump
WHERE ump.last_scraped_at >= NOW() - INTERVAL '24 hours'
   OR ump.updated_at >= NOW() - INTERVAL '24 hours';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON public.mv_pulse_24h_summary (summary_id);
