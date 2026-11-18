/**
 * src/modules/newborn/settings.mjs
 *
 * First-Class Newborn Configuration, Rule Profiles & Automation Schedule Engine (SSOT).
 * Provides complete dynamic operator control over:
 * 1. 8-Surface Discovery toggles, pagination depths, board freshness, and Related Pin Snowball hops/caps.
 * 2. Qualification & Provenance thresholds (7d/14d/30d/90d/custom age windows, repin/save velocity,
 *    creator follower caps, SHARE_EXTENSION_IOS / SHARE_EXTENSION_ANDROID / UPLOADED, AI disclosure,
 *    and Linkless Vacuum modes).
 * 3. Autonomous Tracking & Scheduling controls (master toggle, cadence/interval, UTC target window,
 *    cooldowns, consecutive qualifying days, and multi-destination promotion routing).
 */

import { sanitizeForJsonb } from '../../utils.mjs';

export const NEWBORN_SETTINGS_KEY = 'newborn_engine_settings';
export const NEWBORN_COOKIE_KEY = 'newborn_pinterest_cookie';

export const SURFACES_CATALOG = Object.freeze([
  {
    id: 'growing_trends',
    label: 'Growing Trends (90d Forecast)',
    endpoint: 'trends.pinterest.com/top_trends_filtered/ + /metrics/?predicted_days=90',
    cookie_zone: 'zero_cookie',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 1
  },
  {
    id: 'zero_query_popular',
    label: 'Zero-Query Popular / Ideas for You',
    endpoint: 'SearchTabResource/get',
    cookie_zone: 'auth_session',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 1
  },
  {
    id: 'pin_serp_capsules',
    label: 'Pin SERP + Guided Capsules',
    endpoint: 'BaseSearchResource/get (scope: "pins")',
    cookie_zone: 'auth_session',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 2
  },
  {
    id: 'fresh_boards',
    label: 'Fresh Boards Search',
    endpoint: 'BaseSearchResource/get (scope: "boards")',
    cookie_zone: 'zero_cookie',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 1
  },
  {
    id: 'board_feed',
    label: 'Fresh Board Pin Feeds',
    endpoint: 'BoardFeedResource/get + widgets.pinterest.com/v3/pidgets/boards/',
    cookie_zone: 'auth_session',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 2
  },
  {
    id: 'board_more_ideas',
    label: 'Board "Find more ideas"',
    endpoint: 'BoardFeedResource/get (/<user>/<slug>/more_ideas/, add_vase: true)',
    cookie_zone: 'auth_session',
    guest_fallback_supported: false,
    default_enabled: true,
    default_max_pages: 2
  },
  {
    id: 'ideas_feeds',
    label: '/ideas/ Taxonomy Feeds',
    endpoint: 'InterestResource/get (is_interest) -> BestPinsFeedAltResource/get + __PWS_INITIAL_PROPS__',
    cookie_zone: 'auth_session',
    guest_fallback_supported: true,
    default_enabled: true,
    default_max_pages: 2
  },
  {
    id: 'related_pin_snowball',
    label: 'Related Pin Snowball',
    endpoint: 'RelatedModulesResource/get',
    cookie_zone: 'auth_session',
    guest_fallback_supported: false,
    default_enabled: true,
    default_max_pages: 2
  }
]);

export const CANONICAL_SURFACE_IDS = new Set(SURFACES_CATALOG.map((s) => s.id));

const SURFACE_KEY_ALIASES = new Map([
  ['growing_trends', 'growing_trends'],
  ['trends', 'growing_trends'],
  ['zero_query_popular', 'zero_query_popular'],
  ['zero_query_ideas', 'zero_query_popular'],
  ['ideas_for_you', 'zero_query_popular'],
  ['pin_serp_capsules', 'pin_serp_capsules'],
  ['pin_serp', 'pin_serp_capsules'],
  ['serp_pins', 'pin_serp_capsules'],
  ['fresh_boards', 'fresh_boards'],
  ['boards_search', 'fresh_boards'],
  ['board_feed', 'board_feed'],
  ['board_pins', 'board_feed'],
  ['board_more_ideas', 'board_more_ideas'],
  ['find_more_ideas', 'board_more_ideas'],
  ['more_ideas', 'board_more_ideas'],
  ['ideas_feeds', 'ideas_feeds'],
  ['ideas', 'ideas_feeds'],
  ['ideas_hub', 'ideas_feeds'],
  ['related_pin_snowball', 'related_pin_snowball'],
  ['related_snowball', 'related_pin_snowball'],
  ['snowball', 'related_pin_snowball']
]);

export const VALID_UPLOAD_PROVENANCE = Object.freeze([
  'SHARE_EXTENSION_IOS',
  'SHARE_EXTENSION_ANDROID',
  'UPLOADED',
  'ORGANIC_PIN',
  'CAROUSEL',
  'VIDEO',
  'IDEA_PIN',
  'BOOKMARKLET',
  'UNKNOWN'
]);

export const OFFICIAL_L1_INTERESTS = Object.freeze([
  { id: 'animals', slug: 'animals', label: 'Animals' },
  { id: 'architecture', slug: 'architecture', label: 'Architecture' },
  { id: 'art', slug: 'art', label: 'Art' },
  { id: 'beauty', slug: 'beauty', label: 'Beauty' },
  { id: 'design', slug: 'design', label: 'Design' },
  { id: 'diy-and-crafts', slug: 'diy-and-crafts', label: 'DIY & Crafts' },
  { id: 'education', slug: 'education', label: 'Education' },
  { id: 'entertainment', slug: 'entertainment', label: 'Entertainment' },
  { id: 'event-planning', slug: 'event-planning', label: 'Event Planning' },
  { id: 'finance', slug: 'finance', label: 'Finance' },
  { id: 'food-and-drink', slug: 'food-and-drink', label: 'Food & Drink' },
  { id: 'gardening', slug: 'gardening', label: 'Gardening' },
  { id: 'health', slug: 'health', label: 'Health' },
  { id: 'home-decor', slug: 'home-decor', label: 'Home Decor' },
  { id: 'mens-fashion', slug: 'mens-fashion', label: "Men's Fashion" },
  { id: 'parenting', slug: 'parenting', label: 'Parenting' },
  { id: 'quotes', slug: 'quotes', label: 'Quotes' },
  { id: 'sport', slug: 'sport', label: 'Sports' },
  { id: 'travel', slug: 'travel', label: 'Travel' },
  { id: 'vehicles', slug: 'vehicles', label: 'Vehicles' },
  { id: 'weddings', slug: 'weddings', label: 'Weddings' },
  { id: 'womens-fashion', slug: 'womens-fashion', label: "Women's Fashion" }
]);

export const SUPPORTED_TREND_TYPES = Object.freeze([
  'growing',
  'seasonal',
  'monthly',
  'yearly'
]);

export const SUPPORTED_TREND_COUNTRIES = Object.freeze([
  { code: 'US', label: 'United States (US)' },
  { code: 'GB', label: 'United Kingdom (GB)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'DE', label: 'Germany (DE)' },
  { code: 'FR', label: 'France (FR)' },
  { code: 'ES', label: 'Spain (ES)' },
  { code: 'IT', label: 'Italy (IT)' },
  { code: 'BR', label: 'Brazil (BR)' },
  { code: 'MX', label: 'Mexico (MX)' },
  { code: 'JP', label: 'Japan (JP)' },
  { code: 'IN', label: 'India (IN)' }
]);

const VALID_L1_INTEREST_SLUGS = new Set(OFFICIAL_L1_INTERESTS.map((i) => i.slug));

const VALID_PROVENANCE_SET = new Set(VALID_UPLOAD_PROVENANCE);
const AGE_PRESET_TO_DAYS = Object.freeze({
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90
});
const CADENCE_TO_MINUTES = Object.freeze({
  hourly: 60,
  every_3h: 180,
  every_6h: 360,
  every_12h: 720,
  daily: 1440
});
const VALID_AI_POLICIES = new Set(['exclude', 'include', 'only']);
const VALID_LINKLESS_MODES = new Set(['off', 'boost', 'only']);
const VALID_TRACKING_MODES = new Set(['pulse_only', 'full']);

export const DEFAULT_NEWBORN_SETTINGS = Object.freeze({
  schema_version: 1,
  discovery: {
    country: 'US',
    default_l1_interest: 'all',
    max_board_age_days: 30,
    surfaces: {
      growing_trends: { enabled: true, max_pages: 1, limit: 25 },
      zero_query_popular: { enabled: true, max_pages: 1 },
      pin_serp_capsules: { enabled: true, max_pages: 2, page_size: 50 },
      fresh_boards: { enabled: true, max_pages: 1, max_boards_to_expand: 8 },
      board_feed: { enabled: true, max_pages: 2, page_size: 50 },
      board_more_ideas: { enabled: true, max_pages: 2, page_size: 25 },
      ideas_feeds: { enabled: true, max_pages: 2, max_interests_per_run: 6 },
      related_pin_snowball: { enabled: true, max_pages: 2, page_size: 24 }
    },
    snowball: {
      enabled: true,
      max_hops: 2,
      seed_cap: 10,
      min_seed_golden_score: 65
    },
    hydration: {
      enable_pidgets_pretriage: true,
      max_pin_hydrations_per_run: 150,
      max_user_hydrations_per_run: 50
    }
  },
  qualification: {
    age_window_preset: '30d',
    min_age_days: 0,
    max_age_days: 30,
    min_repin_count: 5,
    min_save_count: 10,
    min_repin_per_day: 1.5,
    min_save_per_day: 2.0,
    min_shares: 0,
    min_comments: 0,
    min_reactions: 0,
    max_creator_followers: 25000,
    enforce_max_followers_filter: false,
    provenance: {
      allowed_sources: [...VALID_UPLOAD_PROVENANCE],
      excluded_sources: [],
      ai_disclosure_policy: 'exclude',
      exclude_products: true,
      exclude_videos: false
    },
    linkless_vacuum: {
      mode: 'boost',
      linkless_vacuum_only: false,
      score_boost: 12
    }
  },
  automation: {
    auto_track_enabled: false,
    schedule: {
      cadence: 'every_6h',
      interval_minutes: 360,
      watchlist_poll_interval_minutes: 720,
      target_window_utc: { start_hour: 0, end_hour: 23 },
      cooldown_minutes: 60,
      last_discovery_run_at: null,
      last_watchlist_poll_at: null
    },
    pin_promotion_rules: {
      watchlist_thresholds: {
        min_repins: 5,
        min_saves: 0,
        min_repin_per_day: 1.5,
        max_age_days: 30,
        min_golden_score: 55
      },
      promote_thresholds: {
        min_repins: 25,
        min_saves: 40,
        min_repin_per_day: 4.0,
        max_age_days: 30,
        min_golden_score: 75,
        min_consecutive_days: 2
      },
      destinations: {
        stage_to_watchlist: true,
        promote_to_daily_ssot: true,
        promote_to_campaign_folder_id: null,
        promote_top_annotation_as_keyword: false,
        promote_to_cluster_seeds: false
      }
    },
    rookie_promotion_rules: {
      enabled: true,
      max_followers: 10000,
      min_monthly_reach: 50000,
      min_golden_pins: 2,
      min_rookie_score: 70,
      min_consecutive_days: 2,
      destination_tracking_mode: 'pulse_only',
      destination_folder_id: null
    }
  }
});

function clampNum(val, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(val, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.round(clampNum(val, fallback, min, max));
}

function cleanBool(val, fallback) {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  if (typeof val === 'number') return val !== 0;
  return fallback;
}

function cleanNullablePositiveInt(val, fallback = null) {
  if (val === undefined) return fallback;
  if (val === null || val === '' || val === 0 || val === '0' || val === 'null') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function cleanIsoOrNull(val, fallback = null) {
  if (val === undefined) return fallback;
  if (val === null || val === '') return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

export function normalizeSurfaceKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const clean = rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SURFACE_KEY_ALIASES.get(clean) || (CANONICAL_SURFACE_IDS.has(clean) ? clean : null);
}

function normalizeProvenanceArray(rawList, fallbackList) {
  if (!Array.isArray(rawList)) return [...fallbackList];
  const out = [];
  const seen = new Set();
  for (const item of rawList) {
    const clean = String(item || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (VALID_PROVENANCE_SET.has(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

/**
 * Deep-merges and normalizes any partial settings patch onto base settings.
 * Enforces strict numeric clamping, preset synchronization, and anti-NaN hygiene.
 */
export function normalizeNewbornSettings(patch = {}, base = DEFAULT_NEWBORN_SETTINGS) {
  const safeBase = base && typeof base === 'object' ? base : DEFAULT_NEWBORN_SETTINGS;
  const safePatch = patch && typeof patch === 'object' ? patch : {};

  const baseDisc = safeBase.discovery || DEFAULT_NEWBORN_SETTINGS.discovery;
  const patchDisc = safePatch.discovery && typeof safePatch.discovery === 'object' ? safePatch.discovery : {};

  const baseSurfaces = baseDisc.surfaces || DEFAULT_NEWBORN_SETTINGS.discovery.surfaces;
  const rawPatchSurfaces = patchDisc.surfaces && typeof patchDisc.surfaces === 'object' ? patchDisc.surfaces : {};
  const mappedPatchSurfaces = {};

  for (const [k, v] of Object.entries(rawPatchSurfaces)) {
    const canon = normalizeSurfaceKey(k);
    if (canon) {
      mappedPatchSurfaces[canon] = typeof v === 'boolean' ? { enabled: v } : (v && typeof v === 'object' ? v : {});
    }
  }

  // Also support enabled_surfaces array shorthand e.g. ["growing_trends", "fresh_boards"]
  if (Array.isArray(patchDisc.enabled_surfaces)) {
    const enabledSet = new Set(patchDisc.enabled_surfaces.map(normalizeSurfaceKey).filter(Boolean));
    for (const id of CANONICAL_SURFACE_IDS) {
      mappedPatchSurfaces[id] = {
        ...(mappedPatchSurfaces[id] || {}),
        enabled: enabledSet.has(id)
      };
    }
  }

  const normalizedSurfaces = {};
  for (const cat of SURFACES_CATALOG) {
    const id = cat.id;
    const defSurf = DEFAULT_NEWBORN_SETTINGS.discovery.surfaces[id];
    const curSurf = baseSurfaces[id] || defSurf;
    const pSurf = mappedPatchSurfaces[id] || {};
    const entry = {
      enabled: cleanBool(pSurf.enabled, cleanBool(curSurf.enabled, defSurf.enabled)),
      max_pages: clampInt(pSurf.max_pages ?? pSurf.pages ?? pSurf.depth, curSurf.max_pages ?? defSurf.max_pages, 1, 50)
    };
    if (defSurf.limit !== undefined) {
      entry.limit = clampInt(pSurf.limit, curSurf.limit ?? defSurf.limit, 5, 200);
    }
    if (defSurf.page_size !== undefined) {
      entry.page_size = clampInt(pSurf.page_size, curSurf.page_size ?? defSurf.page_size, 10, 100);
    }
    if (defSurf.max_boards_to_expand !== undefined) {
      entry.max_boards_to_expand = clampInt(
        pSurf.max_boards_to_expand,
        curSurf.max_boards_to_expand ?? defSurf.max_boards_to_expand,
        1,
        50
      );
    }
    if (defSurf.max_interests_per_run !== undefined) {
      entry.max_interests_per_run = clampInt(
        pSurf.max_interests_per_run,
        curSurf.max_interests_per_run ?? defSurf.max_interests_per_run,
        1,
        30
      );
    }
    normalizedSurfaces[id] = entry;
  }

  const baseSnow = baseDisc.snowball || DEFAULT_NEWBORN_SETTINGS.discovery.snowball;
  const patchSnow = patchDisc.snowball && typeof patchDisc.snowball === 'object' ? patchDisc.snowball : {};

  const baseHyd = baseDisc.hydration || DEFAULT_NEWBORN_SETTINGS.discovery.hydration;
  const patchHyd = patchDisc.hydration && typeof patchDisc.hydration === 'object' ? patchDisc.hydration : {};

  const countryRaw = String(patchDisc.country ?? baseDisc.country ?? 'US').trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'US';

  const rawL1Interest = String(
    patchDisc.default_l1_interest ?? patchDisc.l1_interest ?? baseDisc.default_l1_interest ?? 'all'
  ).trim().toLowerCase().replace(/_/g, '-');
  const defaultL1Interest = VALID_L1_INTEREST_SLUGS.has(rawL1Interest) ? rawL1Interest : 'all';

  // Qualification normalization
  const baseQual = safeBase.qualification || DEFAULT_NEWBORN_SETTINGS.qualification;
  const patchQual = safePatch.qualification && typeof safePatch.qualification === 'object' ? safePatch.qualification : {};

  let agePreset = String(patchQual.age_window_preset ?? baseQual.age_window_preset ?? '30d').trim().toLowerCase();
  if (!AGE_PRESET_TO_DAYS[agePreset] && agePreset !== 'custom') {
    agePreset = '30d';
  }

  let maxAgeDays;
  if (patchQual.age_window_preset !== undefined && AGE_PRESET_TO_DAYS[agePreset] && patchQual.max_age_days === undefined) {
    maxAgeDays = AGE_PRESET_TO_DAYS[agePreset];
  } else if (patchQual.max_age_days !== undefined) {
    maxAgeDays = clampNum(patchQual.max_age_days, baseQual.max_age_days ?? 30, 0.5, 3650);
    if (patchQual.age_window_preset === undefined) {
      const matchedPreset = Object.entries(AGE_PRESET_TO_DAYS).find(([, days]) => days === maxAgeDays);
      agePreset = matchedPreset ? matchedPreset[0] : 'custom';
    }
  } else {
    maxAgeDays = AGE_PRESET_TO_DAYS[agePreset] ?? clampNum(baseQual.max_age_days, 30, 0.5, 3650);
  }

  const minAgeDays = Math.min(
    maxAgeDays,
    clampNum(patchQual.min_age_days, baseQual.min_age_days ?? 0, 0, 3650)
  );

  const baseProv = baseQual.provenance || DEFAULT_NEWBORN_SETTINGS.qualification.provenance;
  const patchProv = patchQual.provenance && typeof patchQual.provenance === 'object' ? patchQual.provenance : {};

  const allowedSources = patchProv.allowed_sources !== undefined
    ? normalizeProvenanceArray(patchProv.allowed_sources, baseProv.allowed_sources || VALID_UPLOAD_PROVENANCE)
    : normalizeProvenanceArray(baseProv.allowed_sources, VALID_UPLOAD_PROVENANCE);

  const excludedSources = patchProv.excluded_sources !== undefined
    ? normalizeProvenanceArray(patchProv.excluded_sources, [])
    : normalizeProvenanceArray(baseProv.excluded_sources || [], []);

  const rawAiPolicy = String(patchProv.ai_disclosure_policy ?? baseProv.ai_disclosure_policy ?? 'exclude').trim().toLowerCase();
  const aiDisclosurePolicy = VALID_AI_POLICIES.has(rawAiPolicy) ? rawAiPolicy : 'exclude';

  const baseVacuum = baseQual.linkless_vacuum || DEFAULT_NEWBORN_SETTINGS.qualification.linkless_vacuum;
  const patchVacuum = patchQual.linkless_vacuum && typeof patchQual.linkless_vacuum === 'object' ? patchQual.linkless_vacuum : {};

  let vacuumMode = String(patchVacuum.mode ?? baseVacuum.mode ?? 'boost').trim().toLowerCase();
  if (!VALID_LINKLESS_MODES.has(vacuumMode)) vacuumMode = 'boost';

  const explicitLinklessOnly = patchVacuum.linkless_vacuum_only ?? patchQual.linkless_vacuum_only;
  if (explicitLinklessOnly !== undefined && patchVacuum.mode === undefined) {
    vacuumMode = cleanBool(explicitLinklessOnly, false) ? 'only' : (vacuumMode === 'only' ? 'boost' : vacuumMode);
  }
  const linklessVacuumOnly = vacuumMode === 'only';

  // Automation & Scheduling normalization
  const baseAuto = safeBase.automation || DEFAULT_NEWBORN_SETTINGS.automation;
  const patchAuto = safePatch.automation && typeof safePatch.automation === 'object' ? safePatch.automation : {};

  const baseSched = baseAuto.schedule || DEFAULT_NEWBORN_SETTINGS.automation.schedule;
  const patchSched = patchAuto.schedule && typeof patchAuto.schedule === 'object' ? patchAuto.schedule : {};

  let cadence = String(patchSched.cadence ?? baseSched.cadence ?? 'every_6h').trim().toLowerCase();
  if (!CADENCE_TO_MINUTES[cadence] && cadence !== 'custom') {
    cadence = 'every_6h';
  }

  let intervalMinutes;
  if (patchSched.cadence !== undefined && CADENCE_TO_MINUTES[cadence] && patchSched.interval_minutes === undefined) {
    intervalMinutes = CADENCE_TO_MINUTES[cadence];
  } else if (patchSched.interval_minutes !== undefined) {
    intervalMinutes = clampInt(patchSched.interval_minutes, baseSched.interval_minutes ?? 360, 15, 10080);
    if (patchSched.cadence === undefined) {
      const matchedCadence = Object.entries(CADENCE_TO_MINUTES).find(([, mins]) => mins === intervalMinutes);
      cadence = matchedCadence ? matchedCadence[0] : 'custom';
    }
  } else {
    intervalMinutes = CADENCE_TO_MINUTES[cadence] ?? clampInt(baseSched.interval_minutes, 360, 15, 10080);
  }

  const baseWin = baseSched.target_window_utc || { start_hour: 0, end_hour: 23 };
  const patchWin = patchSched.target_window_utc && typeof patchSched.target_window_utc === 'object' ? patchSched.target_window_utc : {};

  const basePinPromo = baseAuto.pin_promotion_rules || DEFAULT_NEWBORN_SETTINGS.automation.pin_promotion_rules;
  const patchPinPromo = patchAuto.pin_promotion_rules && typeof patchAuto.pin_promotion_rules === 'object' ? patchAuto.pin_promotion_rules : {};

  const baseWatchThresh = basePinPromo.watchlist_thresholds || DEFAULT_NEWBORN_SETTINGS.automation.pin_promotion_rules.watchlist_thresholds;
  const patchWatchThresh = patchPinPromo.watchlist_thresholds && typeof patchPinPromo.watchlist_thresholds === 'object' ? patchPinPromo.watchlist_thresholds : {};

  const basePromoThresh = basePinPromo.promote_thresholds || DEFAULT_NEWBORN_SETTINGS.automation.pin_promotion_rules.promote_thresholds;
  const patchPromoThresh = patchPinPromo.promote_thresholds && typeof patchPinPromo.promote_thresholds === 'object' ? patchPinPromo.promote_thresholds : {};

  const baseDest = basePinPromo.destinations || DEFAULT_NEWBORN_SETTINGS.automation.pin_promotion_rules.destinations;
  const patchDest = patchPinPromo.destinations && typeof patchPinPromo.destinations === 'object' ? patchPinPromo.destinations : {};

  const baseRookiePromo = baseAuto.rookie_promotion_rules || DEFAULT_NEWBORN_SETTINGS.automation.rookie_promotion_rules;
  const patchRookiePromo = patchAuto.rookie_promotion_rules && typeof patchAuto.rookie_promotion_rules === 'object' ? patchAuto.rookie_promotion_rules : {};

  const rawDestMode = String(
    patchRookiePromo.destination_tracking_mode ?? baseRookiePromo.destination_tracking_mode ?? 'pulse_only'
  ).trim().toLowerCase();

  return {
    schema_version: 1,
    discovery: {
      country,
      default_l1_interest: defaultL1Interest,
      max_board_age_days: clampInt(patchDisc.max_board_age_days, baseDisc.max_board_age_days ?? 30, 1, 365),
      surfaces: normalizedSurfaces,
      snowball: {
        enabled: cleanBool(patchSnow.enabled, cleanBool(baseSnow.enabled, true)),
        max_hops: clampInt(patchSnow.max_hops ?? patchSnow.hops, baseSnow.max_hops ?? 2, 0, 5),
        seed_cap: clampInt(patchSnow.seed_cap, baseSnow.seed_cap ?? 10, 1, 100),
        min_seed_golden_score: clampNum(patchSnow.min_seed_golden_score, baseSnow.min_seed_golden_score ?? 65, 0, 100)
      },
      hydration: {
        enable_pidgets_pretriage: cleanBool(
          patchHyd.enable_pidgets_pretriage,
          cleanBool(baseHyd.enable_pidgets_pretriage, true)
        ),
        max_pin_hydrations_per_run: clampInt(
          patchHyd.max_pin_hydrations_per_run,
          baseHyd.max_pin_hydrations_per_run ?? 150,
          5,
          2000
        ),
        max_user_hydrations_per_run: clampInt(
          patchHyd.max_user_hydrations_per_run,
          baseHyd.max_user_hydrations_per_run ?? 50,
          1,
          500
        )
      }
    },
    qualification: {
      age_window_preset: agePreset,
      min_age_days: minAgeDays,
      max_age_days: maxAgeDays,
      min_repin_count: clampInt(patchQual.min_repin_count, baseQual.min_repin_count ?? 5, 0, 10000000),
      min_save_count: clampInt(patchQual.min_save_count, baseQual.min_save_count ?? 10, 0, 10000000),
      min_repin_per_day: clampNum(patchQual.min_repin_per_day, baseQual.min_repin_per_day ?? 1.5, 0, 100000),
      min_save_per_day: clampNum(patchQual.min_save_per_day, baseQual.min_save_per_day ?? 2.0, 0, 100000),
      min_shares: clampInt(patchQual.min_shares, baseQual.min_shares ?? 0, 0, 1000000),
      min_comments: clampInt(patchQual.min_comments, baseQual.min_comments ?? 0, 0, 1000000),
      min_reactions: clampInt(patchQual.min_reactions, baseQual.min_reactions ?? 0, 0, 1000000),
      max_creator_followers: clampInt(patchQual.max_creator_followers, baseQual.max_creator_followers ?? 25000, 0, 10000000),
      enforce_max_followers_filter: cleanBool(
        patchQual.enforce_max_followers_filter,
        cleanBool(baseQual.enforce_max_followers_filter, false)
      ),
      provenance: {
        allowed_sources: allowedSources,
        excluded_sources: excludedSources,
        ai_disclosure_policy: aiDisclosurePolicy,
        exclude_products: cleanBool(patchProv.exclude_products, cleanBool(baseProv.exclude_products, true)),
        exclude_videos: cleanBool(patchProv.exclude_videos, cleanBool(baseProv.exclude_videos, false))
      },
      linkless_vacuum: {
        mode: vacuumMode,
        linkless_vacuum_only: linklessVacuumOnly,
        score_boost: clampNum(patchVacuum.score_boost, baseVacuum.score_boost ?? 12, 0, 50)
      }
    },
    automation: {
      auto_track_enabled: cleanBool(
        patchAuto.auto_track_enabled ?? safePatch.auto_track_enabled,
        cleanBool(baseAuto.auto_track_enabled, false)
      ),
      schedule: {
        cadence,
        interval_minutes: intervalMinutes,
        watchlist_poll_interval_minutes: clampInt(
          patchSched.watchlist_poll_interval_minutes,
          baseSched.watchlist_poll_interval_minutes ?? 720,
          15,
          10080
        ),
        target_window_utc: {
          start_hour: clampInt(patchWin.start_hour, baseWin.start_hour ?? 0, 0, 23),
          end_hour: clampInt(patchWin.end_hour, baseWin.end_hour ?? 23, 0, 23)
        },
        cooldown_minutes: clampInt(patchSched.cooldown_minutes, baseSched.cooldown_minutes ?? 60, 0, 1440),
        last_discovery_run_at: cleanIsoOrNull(patchSched.last_discovery_run_at, baseSched.last_discovery_run_at ?? null),
        last_watchlist_poll_at: cleanIsoOrNull(patchSched.last_watchlist_poll_at, baseSched.last_watchlist_poll_at ?? null)
      },
      pin_promotion_rules: {
        watchlist_thresholds: {
          min_repins: clampInt(patchWatchThresh.min_repins, baseWatchThresh.min_repins ?? 5, 0, 10000000),
          min_saves: clampInt(patchWatchThresh.min_saves, baseWatchThresh.min_saves ?? 0, 0, 10000000),
          min_repin_per_day: clampNum(patchWatchThresh.min_repin_per_day, baseWatchThresh.min_repin_per_day ?? 1.5, 0, 100000),
          max_age_days: clampNum(patchWatchThresh.max_age_days, baseWatchThresh.max_age_days ?? 30, 0.5, 3650),
          min_golden_score: clampNum(patchWatchThresh.min_golden_score, baseWatchThresh.min_golden_score ?? 55, 0, 100)
        },
        promote_thresholds: {
          min_repins: clampInt(patchPromoThresh.min_repins, basePromoThresh.min_repins ?? 25, 0, 10000000),
          min_saves: clampInt(patchPromoThresh.min_saves, basePromoThresh.min_saves ?? 40, 0, 10000000),
          min_repin_per_day: clampNum(patchPromoThresh.min_repin_per_day, basePromoThresh.min_repin_per_day ?? 4.0, 0, 100000),
          max_age_days: clampNum(patchPromoThresh.max_age_days, basePromoThresh.max_age_days ?? 30, 0.5, 3650),
          min_golden_score: clampNum(patchPromoThresh.min_golden_score, basePromoThresh.min_golden_score ?? 75, 0, 100),
          min_consecutive_days: clampInt(patchPromoThresh.min_consecutive_days, basePromoThresh.min_consecutive_days ?? 2, 1, 30)
        },
        destinations: {
          stage_to_watchlist: cleanBool(patchDest.stage_to_watchlist, cleanBool(baseDest.stage_to_watchlist, true)),
          promote_to_daily_ssot: cleanBool(patchDest.promote_to_daily_ssot, cleanBool(baseDest.promote_to_daily_ssot, true)),
          promote_to_campaign_folder_id: cleanNullablePositiveInt(
            patchDest.promote_to_campaign_folder_id,
            baseDest.promote_to_campaign_folder_id ?? null
          ),
          promote_top_annotation_as_keyword: cleanBool(
            patchDest.promote_top_annotation_as_keyword,
            cleanBool(baseDest.promote_top_annotation_as_keyword, false)
          ),
          promote_to_cluster_seeds: cleanBool(
            patchDest.promote_to_cluster_seeds,
            cleanBool(baseDest.promote_to_cluster_seeds, false)
          )
        }
      },
      rookie_promotion_rules: {
        enabled: cleanBool(patchRookiePromo.enabled, cleanBool(baseRookiePromo.enabled, true)),
        max_followers: clampInt(patchRookiePromo.max_followers, baseRookiePromo.max_followers ?? 10000, 0, 10000000),
        min_monthly_reach: clampInt(patchRookiePromo.min_monthly_reach, baseRookiePromo.min_monthly_reach ?? 50000, 0, 100000000),
        min_golden_pins: clampInt(patchRookiePromo.min_golden_pins, baseRookiePromo.min_golden_pins ?? 2, 1, 100),
        min_rookie_score: clampNum(patchRookiePromo.min_rookie_score, baseRookiePromo.min_rookie_score ?? 70, 0, 100),
        min_consecutive_days: clampInt(patchRookiePromo.min_consecutive_days, baseRookiePromo.min_consecutive_days ?? 2, 1, 30),
        destination_tracking_mode: VALID_TRACKING_MODES.has(rawDestMode) ? rawDestMode : 'pulse_only',
        destination_folder_id: cleanNullablePositiveInt(
          patchRookiePromo.destination_folder_id,
          baseRookiePromo.destination_folder_id ?? null
        )
      }
    }
  };
}

/**
 * Evaluates whether automatic discovery and watchlist polling are due right now.
 */
export function evaluateAutomationSchedule(settings = DEFAULT_NEWBORN_SETTINGS, nowInput = new Date()) {
  const normalized = normalizeNewbornSettings(settings);
  const auto = normalized.automation;
  const sched = auto.schedule;
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const nowMs = Number.isNaN(now.getTime()) ? Date.now() : now.getTime();
  const currentUtcHour = new Date(nowMs).getUTCHours();

  const startHour = sched.target_window_utc.start_hour;
  const endHour = sched.target_window_utc.end_hour;
  const inTargetWindow = startHour <= endHour
    ? (currentUtcHour >= startHour && currentUtcHour <= endHour)
    : (currentUtcHour >= startHour || currentUtcHour <= endHour);

  const lastDiscMs = sched.last_discovery_run_at ? Date.parse(sched.last_discovery_run_at) : NaN;
  const lastPollMs = sched.last_watchlist_poll_at ? Date.parse(sched.last_watchlist_poll_at) : NaN;

  const mostRecentRunMs = Math.max(
    Number.isFinite(lastDiscMs) ? lastDiscMs : 0,
    Number.isFinite(lastPollMs) ? lastPollMs : 0
  );
  const cooldownMs = sched.cooldown_minutes * 60_000;
  const cooldownRemainingMs = mostRecentRunMs > 0
    ? Math.max(0, (mostRecentRunMs + cooldownMs) - nowMs)
    : 0;
  const cooldownActive = cooldownRemainingMs > 0;

  const discIntervalMs = sched.interval_minutes * 60_000;
  const pollIntervalMs = sched.watchlist_poll_interval_minutes * 60_000;

  const discoveryIntervalElapsed = !Number.isFinite(lastDiscMs) || (nowMs - lastDiscMs) >= discIntervalMs;
  const watchlistIntervalElapsed = !Number.isFinite(lastPollMs) || (nowMs - lastPollMs) >= pollIntervalMs;

  const discoveryDue = Boolean(
    auto.auto_track_enabled &&
    inTargetWindow &&
    !cooldownActive &&
    discoveryIntervalElapsed
  );

  const watchlistPollDue = Boolean(
    auto.auto_track_enabled &&
    inTargetWindow &&
    !cooldownActive &&
    watchlistIntervalElapsed
  );

  const nextDiscoveryMs = Number.isFinite(lastDiscMs) ? Math.max(nowMs, lastDiscMs + discIntervalMs) : nowMs;
  const nextPollMs = Number.isFinite(lastPollMs) ? Math.max(nowMs, lastPollMs + pollIntervalMs) : nowMs;

  return {
    auto_track_enabled: auto.auto_track_enabled,
    cadence: sched.cadence,
    interval_minutes: sched.interval_minutes,
    watchlist_poll_interval_minutes: sched.watchlist_poll_interval_minutes,
    in_target_window: inTargetWindow,
    current_utc_hour: currentUtcHour,
    target_window_utc: sched.target_window_utc,
    cooldown_active: cooldownActive,
    cooldown_remaining_seconds: Math.ceil(cooldownRemainingMs / 1000),
    discovery_due: discoveryDue,
    watchlist_poll_due: watchlistPollDue,
    last_discovery_run_at: sched.last_discovery_run_at,
    last_watchlist_poll_at: sched.last_watchlist_poll_at,
    next_discovery_at: new Date(Math.max(nextDiscoveryMs, nowMs + cooldownRemainingMs)).toISOString(),
    next_watchlist_poll_at: new Date(Math.max(nextPollMs, nowMs + cooldownRemainingMs)).toISOString()
  };
}

/**
 * Fetches persistent Newborn Engine settings from app_settings.
 */
export async function getNewbornSettings(sql) {
  if (!sql || typeof sql !== 'function') {
    return normalizeNewbornSettings({});
  }
  const rows = await sql`
    SELECT key, value, updated_at
    FROM app_settings
    WHERE key = ${NEWBORN_SETTINGS_KEY}
    LIMIT 1;
  `;
  if (Array.isArray(rows) && rows.length > 0 && rows[0]?.value) {
    const rawVal = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    const normalized = normalizeNewbornSettings(rawVal, DEFAULT_NEWBORN_SETTINGS);
    return {
      ...normalized,
      updated_at: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null
    };
  }
  return normalizeNewbornSettings({});
}

/**
 * Replaces / updates global Newborn Engine settings in app_settings (PUT semantics with default backfill).
 */
export async function updateNewbornSettings(sql, incomingSettings = {}) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to persist Newborn settings.');
  }
  const current = await getNewbornSettings(sql);
  const preserveRunTimestamps = {
    automation: {
      schedule: {
        last_discovery_run_at: incomingSettings?.automation?.schedule?.last_discovery_run_at !== undefined
          ? incomingSettings.automation.schedule.last_discovery_run_at
          : current.automation?.schedule?.last_discovery_run_at,
        last_watchlist_poll_at: incomingSettings?.automation?.schedule?.last_watchlist_poll_at !== undefined
          ? incomingSettings.automation.schedule.last_watchlist_poll_at
          : current.automation?.schedule?.last_watchlist_poll_at
      }
    }
  };
  const normalized = normalizeNewbornSettings(
    {
      ...incomingSettings,
      automation: {
        ...(incomingSettings?.automation || {}),
        schedule: {
          ...preserveRunTimestamps.automation.schedule,
          ...(incomingSettings?.automation?.schedule || {})
        }
      }
    },
    DEFAULT_NEWBORN_SETTINGS
  );

  const [saved] = await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${NEWBORN_SETTINGS_KEY}, ${JSON.stringify(sanitizeForJsonb(normalized))}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
    RETURNING updated_at;
  `;

  return {
    ...normalized,
    updated_at: saved?.updated_at ? new Date(saved.updated_at).toISOString() : new Date().toISOString()
  };
}

/**
 * Partially patches global Newborn Engine settings in app_settings (PATCH semantics).
 */
export async function patchNewbornSettings(sql, patch = {}) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to patch Newborn settings.');
  }
  const current = await getNewbornSettings(sql);
  const merged = normalizeNewbornSettings(patch, current);

  const [saved] = await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${NEWBORN_SETTINGS_KEY}, ${JSON.stringify(sanitizeForJsonb(merged))}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW()
    RETURNING updated_at;
  `;

  return {
    ...merged,
    updated_at: saved?.updated_at ? new Date(saved.updated_at).toISOString() : new Date().toISOString()
  };
}

/**
 * Resets global Newborn Engine settings back to factory defaults.
 */
export async function resetNewbornSettings(sql) {
  return await updateNewbornSettings(sql, DEFAULT_NEWBORN_SETTINGS);
}

/**
 * Stamps last_discovery_run_at or last_watchlist_poll_at in app_settings.
 */
export async function stampAutomationRunTimestamp(sql, runKind = 'discovery', timestampIso = new Date().toISOString()) {
  if (!sql || typeof sql !== 'function') return null;
  const field = runKind === 'watchlist_poll' ? 'last_watchlist_poll_at' : 'last_discovery_run_at';
  return await patchNewbornSettings(sql, {
    automation: {
      schedule: {
        [field]: timestampIso
      }
    }
  });
}

function slugifyRuleProfileName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'newborn-profile';
}

function normalizeRuleProfileRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: String(row.slug || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    is_default: Boolean(row.is_default),
    is_active: row.is_active !== false,
    folder_id: row.folder_id != null ? Number(row.folder_id) : null,
    surfaces_config: (row.surfaces_config && typeof row.surfaces_config === 'object') ? row.surfaces_config : {},
    qualification_config: (row.qualification_config && typeof row.qualification_config === 'object') ? row.qualification_config : {},
    automation_config: (row.automation_config && typeof row.automation_config === 'object') ? row.automation_config : {},
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

/**
 * Lists Newborn rule profiles from newborn_rule_profiles.
 */
export async function listNewbornRuleProfiles(sql, { includeInactive = false, folderId = null } = {}) {
  if (!sql || typeof sql !== 'function') return [];
  const fid = cleanNullablePositiveInt(folderId, null);
  let rows;
  if (fid !== null) {
    rows = includeInactive
      ? await sql`
          SELECT * FROM newborn_rule_profiles
          WHERE folder_id = ${fid} OR is_default = TRUE
          ORDER BY is_default DESC, id ASC;
        `
      : await sql`
          SELECT * FROM newborn_rule_profiles
          WHERE is_active = TRUE AND (folder_id = ${fid} OR is_default = TRUE)
          ORDER BY is_default DESC, id ASC;
        `;
  } else {
    rows = includeInactive
      ? await sql`SELECT * FROM newborn_rule_profiles ORDER BY is_default DESC, id ASC;`
      : await sql`SELECT * FROM newborn_rule_profiles WHERE is_active = TRUE ORDER BY is_default DESC, id ASC;`;
  }
  return (rows || []).map(normalizeRuleProfileRow).filter(Boolean);
}

/**
 * Fetches a single Newborn rule profile by numeric ID or slug.
 */
export async function getNewbornRuleProfile(sql, idOrSlug) {
  if (!sql || typeof sql !== 'function' || idOrSlug === undefined || idOrSlug === null || idOrSlug === '') {
    return null;
  }
  const str = String(idOrSlug).trim();
  const isNum = /^\d+$/.test(str);
  const rows = isNum
    ? await sql`SELECT * FROM newborn_rule_profiles WHERE id = ${Number(str)} LIMIT 1;`
    : await sql`SELECT * FROM newborn_rule_profiles WHERE slug = ${str.toLowerCase()} LIMIT 1;`;
  return rows?.[0] ? normalizeRuleProfileRow(rows[0]) : null;
}

/**
 * Creates a new Newborn rule profile, validating its override blocks via normalizeNewbornSettings.
 */
export async function createNewbornRuleProfile(sql, payload = {}) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to create a rule profile.');
  }
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('Profile name is required.');
  }
  const slug = slugifyRuleProfileName(payload.slug || name);
  const description = String(payload.description || '').trim();
  const isDefault = cleanBool(payload.is_default, false);
  const isActive = cleanBool(payload.is_active, true);
  const folderId = cleanNullablePositiveInt(payload.folder_id, null);

  // Validate overrides cleanly against defaults
  const validatedPreview = normalizeNewbornSettings({
    discovery: payload.surfaces_config || payload.discovery || {},
    qualification: payload.qualification_config || payload.qualification || {},
    automation: payload.automation_config || payload.automation || {}
  });

  const surfacesConfig = (payload.surfaces_config || payload.discovery) ? validatedPreview.discovery : {};
  const qualificationConfig = (payload.qualification_config || payload.qualification) ? validatedPreview.qualification : {};
  const automationConfig = (payload.automation_config || payload.automation) ? validatedPreview.automation : {};

  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));
  return await runInTx(async (tx) => {
    if (isDefault) {
      await tx`UPDATE newborn_rule_profiles SET is_default = FALSE WHERE is_default = TRUE;`;
    }
    const [inserted] = await tx`
      INSERT INTO newborn_rule_profiles (
        slug, name, description, is_default, is_active, folder_id,
        surfaces_config, qualification_config, automation_config, created_at, updated_at
      )
      VALUES (
        ${slug},
        ${name},
        ${description},
        ${isDefault},
        ${isActive},
        ${folderId},
        ${JSON.stringify(sanitizeForJsonb(surfacesConfig))}::jsonb,
        ${JSON.stringify(sanitizeForJsonb(qualificationConfig))}::jsonb,
        ${JSON.stringify(sanitizeForJsonb(automationConfig))}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_default = EXCLUDED.is_default,
        is_active = EXCLUDED.is_active,
        folder_id = EXCLUDED.folder_id,
        surfaces_config = EXCLUDED.surfaces_config,
        qualification_config = EXCLUDED.qualification_config,
        automation_config = EXCLUDED.automation_config,
        updated_at = NOW()
      RETURNING *;
    `;
    return normalizeRuleProfileRow(inserted);
  });
}

/**
 * Updates an existing Newborn rule profile by numeric ID or slug.
 */
export async function updateNewbornRuleProfile(sql, idOrSlug, patch = {}) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to update a rule profile.');
  }
  const existing = await getNewbornRuleProfile(sql, idOrSlug);
  if (!existing) return null;

  const nextName = patch.name !== undefined ? String(patch.name || '').trim() : existing.name;
  if (!nextName) throw new Error('Profile name cannot be empty.');
  const nextDesc = patch.description !== undefined ? String(patch.description || '').trim() : existing.description;
  const nextDefault = patch.is_default !== undefined ? cleanBool(patch.is_default, existing.is_default) : existing.is_default;
  const nextActive = patch.is_active !== undefined ? cleanBool(patch.is_active, existing.is_active) : existing.is_active;
  const nextFolderId = patch.folder_id !== undefined ? cleanNullablePositiveInt(patch.folder_id, null) : existing.folder_id;

  const baseNormalized = normalizeNewbornSettings({
    discovery: existing.surfaces_config,
    qualification: existing.qualification_config,
    automation: existing.automation_config
  });

  const mergedNormalized = normalizeNewbornSettings(
    {
      discovery: patch.surfaces_config ?? patch.discovery,
      qualification: patch.qualification_config ?? patch.qualification,
      automation: patch.automation_config ?? patch.automation
    },
    baseNormalized
  );

  const nextSurfaces = (patch.surfaces_config !== undefined || patch.discovery !== undefined)
    ? mergedNormalized.discovery
    : existing.surfaces_config;
  const nextQualification = (patch.qualification_config !== undefined || patch.qualification !== undefined)
    ? mergedNormalized.qualification
    : existing.qualification_config;
  const nextAutomation = (patch.automation_config !== undefined || patch.automation !== undefined)
    ? mergedNormalized.automation
    : existing.automation_config;

  const runInTx = async (fn) => (typeof sql.begin === 'function' ? sql.begin(fn) : fn(sql));
  return await runInTx(async (tx) => {
    if (nextDefault && !existing.is_default) {
      await tx`UPDATE newborn_rule_profiles SET is_default = FALSE WHERE id <> ${existing.id} AND is_default = TRUE;`;
    }
    const [updated] = await tx`
      UPDATE newborn_rule_profiles
      SET
        name = ${nextName},
        description = ${nextDesc},
        is_default = ${nextDefault},
        is_active = ${nextActive},
        folder_id = ${nextFolderId},
        surfaces_config = ${JSON.stringify(sanitizeForJsonb(nextSurfaces))}::jsonb,
        qualification_config = ${JSON.stringify(sanitizeForJsonb(nextQualification))}::jsonb,
        automation_config = ${JSON.stringify(sanitizeForJsonb(nextAutomation))}::jsonb,
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *;
    `;
    return normalizeRuleProfileRow(updated);
  });
}

/**
 * Deletes a Newborn rule profile by numeric ID or slug.
 */
export async function deleteNewbornRuleProfile(sql, idOrSlug) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to delete a rule profile.');
  }
  const existing = await getNewbornRuleProfile(sql, idOrSlug);
  if (!existing) return { deleted: false, reason: 'not_found' };
  if (existing.is_default) {
    const err = new Error('Cannot delete the active default rule profile. Assign another default profile first.');
    err.status = 400;
    throw err;
  }
  await sql`DELETE FROM newborn_rule_profiles WHERE id = ${existing.id};`;
  return { deleted: true, id: existing.id, slug: existing.slug };
}

/**
 * Resolves the effective Newborn configuration across:
 *   DEFAULT_NEWBORN_SETTINGS <- DB newborn_engine_settings <- newborn_rule_profiles <- runtime overrides
 */
export async function resolveEffectiveNewbornSettings(sql, { profileId = null, overrides = null } = {}) {
  let effective = await getNewbornSettings(sql);
  let appliedProfile = null;

  if (sql && profileId !== null && profileId !== undefined && profileId !== '') {
    appliedProfile = await getNewbornRuleProfile(sql, profileId);
  }

  if (appliedProfile) {
    effective = normalizeNewbornSettings(
      {
        discovery: appliedProfile.surfaces_config,
        qualification: appliedProfile.qualification_config,
        automation: appliedProfile.automation_config
      },
      effective
    );
  }

  if (overrides && typeof overrides === 'object') {
    effective = normalizeNewbornSettings(overrides, effective);
  }

  return {
    settings: effective,
    profile: appliedProfile
  };
}

function extractRawCookieFromSettingVal(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    const cand = val.cookie || val.raw_cookie || val.pinterest_cookie || val.formatted_cookie || '';
    return typeof cand === 'string' ? cand.trim() : '';
  }
  return '';
}

/**
 * Internal resolver for the Newborn raw Pinterest session token.
 * NEVER expose the returned value over HTTP responses or logs!
 */
export async function resolveNewbornRawCookie(sql, env = {}) {
  if (sql && typeof sql === 'function') {
    try {
      const rows = await sql`
        SELECT key, value
        FROM app_settings
        WHERE key IN (${NEWBORN_COOKIE_KEY}, 'pinterest_cookie', 'keyword_crawl_settings')
        ORDER BY
          CASE
            WHEN key = ${NEWBORN_COOKIE_KEY} THEN 0
            WHEN key = 'pinterest_cookie' THEN 1
            ELSE 2
          END ASC;
      `;
      for (const r of (rows || [])) {
        const extracted = extractRawCookieFromSettingVal(r?.value);
        if (extracted.length > 10) {
          return { rawCookie: extracted, source: `db:${r.key}` };
        }
      }
    } catch (_) {}
  }

  const envNewborn = typeof env?.NEWBORN_PINTEREST_COOKIE === 'string' ? env.NEWBORN_PINTEREST_COOKIE.trim() : '';
  if (envNewborn.length > 10) {
    return { rawCookie: envNewborn, source: 'env:NEWBORN_PINTEREST_COOKIE' };
  }

  const envShared = typeof env?.PINTEREST_COOKIE === 'string' ? env.PINTEREST_COOKIE.trim() : '';
  if (envShared.length > 10) {
    return { rawCookie: envShared, source: 'env:PINTEREST_COOKIE' };
  }

  if (typeof process !== 'undefined' && process.env) {
    const procNewborn = typeof process.env.NEWBORN_PINTEREST_COOKIE === 'string' ? process.env.NEWBORN_PINTEREST_COOKIE.trim() : '';
    if (procNewborn.length > 10) {
      return { rawCookie: procNewborn, source: 'process_env:NEWBORN_PINTEREST_COOKIE' };
    }
    const procShared = typeof process.env.PINTEREST_COOKIE === 'string' ? process.env.PINTEREST_COOKIE.trim() : '';
    if (procShared.length > 10) {
      return { rawCookie: procShared, source: 'process_env:PINTEREST_COOKIE' };
    }
  }

  return { rawCookie: '', source: 'none' };
}

/**
 * Returns strictly redacted Newborn cookie & routing status safe for UI/API responses.
 * [INVARIANT: ZERO-SECRET-LEAK] Never returns cookie strings, tokens, or prefixes.
 */
export async function getNewbornCookieStatus(sql, env = {}) {
  const { rawCookie, source } = await resolveNewbornRawCookie(sql, env);
  const hasCookie = Boolean(rawCookie && rawCookie.length > 10);
  return {
    has_cookie: hasCookie,
    is_configured: hasCookie,
    preview: hasCookie ? '[CONFIGURED]' : '',
    zone_routing_mode: hasCookie ? 'two_zone_auth_plus_zero_cookie' : 'guest_zero_cookie_fallback',
    auth_surfaces_unlocked: hasCookie
      ? ['related_pin_snowball', 'pin_serp_capsules', 'board_feed', 'board_more_ideas', 'ideas_feeds', 'zero_query_popular']
      : [],
    zero_cookie_surfaces: ['growing_trends', 'fresh_boards', 'PinResource/get', 'Pidgets', 'UserResource/get', 'InterestResource/get'],
    source: hasCookie ? source : 'none'
  };
}

/**
 * Persists Newborn Pinterest session cookie into app_settings without mutating process.env.
 */
export async function saveNewbornCookie(sql, rawCookie = '', { alsoUpdateShared = false } = {}) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to save Newborn cookie.');
  }
  const cleanRaw = String(rawCookie || '').trim();
  const hasCookie = cleanRaw.length > 10;
  const payload = {
    cookie: cleanRaw,
    has_cookie: hasCookie,
    updated_at: new Date().toISOString()
  };

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${NEWBORN_COOKIE_KEY}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW();
  `;

  if (alsoUpdateShared) {
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('pinterest_cookie', ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;
  }

  return {
    has_cookie: hasCookie,
    is_configured: hasCookie,
    preview: hasCookie ? '[CONFIGURED]' : '',
    zone_routing_mode: hasCookie ? 'two_zone_auth_plus_zero_cookie' : 'guest_zero_cookie_fallback',
    source: hasCookie ? `db:${NEWBORN_COOKIE_KEY}` : 'none'
  };
}

/**
 * Clears the dedicated Newborn Pinterest session cookie from app_settings.
 */
export async function clearNewbornCookie(sql) {
  if (!sql || typeof sql !== 'function') {
    throw new Error('Database client (sql) is required to clear Newborn cookie.');
  }
  await sql`DELETE FROM app_settings WHERE key = ${NEWBORN_COOKIE_KEY};`;
  return {
    has_cookie: false,
    is_configured: false,
    preview: '',
    zone_routing_mode: 'guest_zero_cookie_fallback',
    source: 'none'
  };
}
