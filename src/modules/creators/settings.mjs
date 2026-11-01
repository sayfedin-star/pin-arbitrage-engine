/**
 * src/modules/creators/settings.mjs
 * 
 * Modular Creator Hub Settings & Auto-Promote Engine Configuration
 * Single Source of Truth (SSOT) for creator pulse_only -> full breakout graduation rules.
 * 
 * [INVARIANT: LIGHTWEIGHT-CREATOR-PULSE]
 * [INVARIANT: AUTO-PROMOTE-PULSE-BREAKOUT]
 */

export const DEFAULT_CREATOR_HUB_SETTINGS = {
  auto_promote_enabled: true,
  auto_promote_delta_24h: 25000,
  auto_promote_delta_7d: 100000,
  auto_harvest_pins: true,
  max_pins_harvest: 100,
  qualification_rules: {
    min_saves: 500,
    min_velocity: 10.0
  }
};

/**
 * Strict numeric cast hygiene helper preventing NaN and Infinity poisoning
 * [INVARIANT: ANTI-NAN-POISONING]
 */
const cleanNum = (val, fallback, min = 0, max = Infinity) => {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Fetch Creator Hub auto-promote and breakout settings from app_settings
 */
export async function getCreatorHubSettings(sql) {
  if (!sql) return { ...DEFAULT_CREATOR_HUB_SETTINGS };
  try {
    const rows = await sql`
      SELECT key, value, updated_at
      FROM app_settings
      WHERE key = 'creator_hub_settings'
      LIMIT 1;
    `;
    if (rows && rows.length > 0 && rows[0].value) {
      const v = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      return {
        auto_promote_enabled: v.auto_promote_enabled !== false,
        auto_promote_delta_24h: cleanNum(v.auto_promote_delta_24h, DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_delta_24h, 0),
        auto_promote_delta_7d: cleanNum(v.auto_promote_delta_7d, DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_delta_7d, 0),
        auto_harvest_pins: v.auto_harvest_pins !== false,
        max_pins_harvest: cleanNum(v.max_pins_harvest, DEFAULT_CREATOR_HUB_SETTINGS.max_pins_harvest, 10, 500),
        qualification_rules: {
          min_saves: cleanNum(v.qualification_rules?.min_saves, DEFAULT_CREATOR_HUB_SETTINGS.qualification_rules.min_saves, 0),
          min_velocity: cleanNum(v.qualification_rules?.min_velocity, DEFAULT_CREATOR_HUB_SETTINGS.qualification_rules.min_velocity, 0)
        },
        updated_at: rows[0].updated_at || null
      };
    }
  } catch (err) {
    console.warn('[Creator Settings] Error loading settings:', err.message);
  }
  return { ...DEFAULT_CREATOR_HUB_SETTINGS };
}

/**
 * Upsert Creator Hub auto-promote settings into app_settings
 */
export async function updateCreatorHubSettings(sql, newSettings = {}) {
  if (!sql) throw new Error('Database client (sql) is required.');
  const current = await getCreatorHubSettings(sql);
  const qualRules = newSettings.qualification_rules || {};

  const merged = {
    auto_promote_enabled: newSettings.auto_promote_enabled !== undefined ? Boolean(newSettings.auto_promote_enabled) : current.auto_promote_enabled,
    auto_promote_delta_24h: newSettings.auto_promote_delta_24h !== undefined ? cleanNum(newSettings.auto_promote_delta_24h, current.auto_promote_delta_24h, 0) : current.auto_promote_delta_24h,
    auto_promote_delta_7d: newSettings.auto_promote_delta_7d !== undefined ? cleanNum(newSettings.auto_promote_delta_7d, current.auto_promote_delta_7d, 0) : current.auto_promote_delta_7d,
    auto_harvest_pins: newSettings.auto_harvest_pins !== undefined ? Boolean(newSettings.auto_harvest_pins) : current.auto_harvest_pins,
    max_pins_harvest: newSettings.max_pins_harvest !== undefined ? cleanNum(newSettings.max_pins_harvest, current.max_pins_harvest, 10, 500) : current.max_pins_harvest,
    qualification_rules: {
      min_saves: qualRules.min_saves !== undefined ? cleanNum(qualRules.min_saves, current.qualification_rules.min_saves, 0) : current.qualification_rules.min_saves,
      min_velocity: qualRules.min_velocity !== undefined ? cleanNum(qualRules.min_velocity, current.qualification_rules.min_velocity, 0) : current.qualification_rules.min_velocity
    }
  };

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('creator_hub_settings', ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW();
  `;

  return merged;
}
