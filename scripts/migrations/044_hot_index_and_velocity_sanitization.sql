-- Migration 044: HOT-Safe Creator Index, Repin-to-Save Spike Sanitization & Physical Storage Compaction
-- Non-transactional execution supported by scripts/migrate.mjs
-- [INVARIANT: 100-PERCENT-HOT-UPDATES]
-- [INVARIANT: ANTI-HYDRATION-SPIKE]

-- 1. Replace HOT-blocking covering index on keyword_displaced_index (Invariant #21 / #42)
DROP INDEX IF EXISTS idx_kdi_kw_creator;
CREATE INDEX IF NOT EXISTS idx_kdi_kw_creator
  ON keyword_displaced_index (keyword_id, creator_username)
  WHERE creator_username IS NOT NULL AND creator_username <> '';

-- 2. Sanitize Repin-to-Save Hydration Spikes (e.g. Pin #35325178326842887 / #911134568440407967 +7,571) in keyword_serp_current
UPDATE keyword_serp_current
SET
  daily_save_velocity = 0,
  baseline_day_saves = save_count,
  gains_5d = CASE
    WHEN ABS(gains_5d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_5d
  END,
  gains_7d = CASE
    WHEN ABS(gains_7d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_7d
  END,
  gains_10d = CASE
    WHEN ABS(gains_10d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_10d
  END,
  gains_15d = CASE
    WHEN ABS(gains_15d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_15d
  END,
  updated_at = NOW()
WHERE repin_count > 0
  AND save_count > repin_count
  AND (
    (daily_save_velocity >= 100 AND ABS(daily_save_velocity - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05)))
    OR (gains_7d >= 100 AND ABS(gains_7d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05)))
    OR (baseline_day_saves > 0 AND ABS(baseline_day_saves - repin_count) <= GREATEST(5, ROUND(repin_count * 0.03)) AND daily_save_velocity >= 100)
    OR pin_id IN ('35325178326842887', '911134568440407967')
  );

-- 3. Sanitize Repin-to-Save Hydration Spikes in keyword_displaced_index
UPDATE keyword_displaced_index
SET
  daily_save_velocity = 0,
  gains_5d = CASE
    WHEN ABS(gains_5d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_5d
  END,
  gains_7d = CASE
    WHEN ABS(gains_7d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_7d
  END,
  gains_10d = CASE
    WHEN ABS(gains_10d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_10d
  END,
  gains_15d = CASE
    WHEN ABS(gains_15d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05))
    THEN 0 ELSE gains_15d
  END,
  updated_at = NOW()
WHERE repin_count > 0
  AND save_count > repin_count
  AND (
    (daily_save_velocity >= 100 AND ABS(daily_save_velocity - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05)))
    OR (gains_7d >= 100 AND ABS(gains_7d - (save_count - repin_count)) <= GREATEST(50, ROUND((save_count - repin_count) * 0.05)))
    OR pin_id IN ('35325178326842887', '911134568440407967')
  );

-- 4. Recompute tracked_keywords.avg_daily_velocity after spike sanitization
UPDATE tracked_keywords tk
SET avg_daily_velocity = COALESCE(sub.avg_vel, 0)
FROM (
  SELECT keyword_id, ROUND(AVG(daily_save_velocity))::int AS avg_vel
  FROM keyword_serp_current
  WHERE is_displaced = FALSE
  GROUP BY keyword_id
) sub
WHERE tk.id = sub.keyword_id;

-- 5. Physically reclaim dead heap & B-Tree index pages back to Neon Storage (< 35 MB target)
VACUUM FULL ANALYZE keyword_displaced_index;
VACUUM FULL ANALYZE keyword_serp_current;
VACUUM FULL ANALYZE competitor_pins;
VACUUM FULL ANALYZE tracked_keywords;
