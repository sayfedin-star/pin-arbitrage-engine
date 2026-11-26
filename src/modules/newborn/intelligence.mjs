/**
 * src/modules/newborn/intelligence.mjs
 *
 * Newborn Qualification, Provenance Classification, Golden Pin Breakout Scoring,
 * Rookie/Rising Account Radar, Automatic Promotion Rule Evaluation, and
 * Annotation + Board-Title Crossover Blueprint Synthesis.
 */

import { DEFAULT_NEWBORN_SETTINGS, normalizeNewbornSettings } from './settings.mjs';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'what', 'all', 'can', 'out', 'about',
  'into', 'more', 'other', 'some', 'such', 'than', 'then', 'them', 'these', 'they',
  'pin', 'pins', 'board', 'boards', 'pinterest', 'ideas', 'idea', 'inspiration', 'best'
]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Classifies upload provenance into canonical Newborn provenance enums while detecting
 * AI disclosure flags and Linkless Vacuum state.
 */
export function classifyPinProvenance(pin = {}) {
  const existing = String(pin.upload_provenance || '').trim().toUpperCase();
  const rawMethod = String(
    pin.raw_creation_method ||
    pin.creation_method ||
    pin.method ||
    pin.insertion_source ||
    ''
  ).trim().toLowerCase();

  let provenance = 'UNKNOWN';

  if (
    existing === 'SHARE_EXTENSION_IOS' ||
    /share_extension_ios|ios_share|iphone_share|ipad_share/.test(rawMethod)
  ) {
    provenance = 'SHARE_EXTENSION_IOS';
  } else if (
    existing === 'SHARE_EXTENSION_ANDROID' ||
    /share_extension_android|android_share/.test(rawMethod)
  ) {
    provenance = 'SHARE_EXTENSION_ANDROID';
  } else if (
    existing === 'UPLOADED' ||
    /^(uploaded|upload|user_upload|uploaded_by_user|native_upload|web_upload|pin_builder|created_by_user|photos|pin_scheduling|ios_photos|android_photos|native_create|mobile_upload|web_create|create_pin)$/.test(rawMethod)
  ) {
    provenance = 'UPLOADED';
  } else if (
    existing === 'BOOKMARKLET' ||
    /bookmarklet|browser_extension|save_button|chrome_extension/.test(rawMethod)
  ) {
    provenance = 'BOOKMARKLET';
  } else if (existing === 'CAROUSEL' || pin.is_carousel || rawMethod === 'carousel') {
    provenance = 'CAROUSEL';
  } else if (existing === 'VIDEO' || pin.is_video || rawMethod === 'video') {
    provenance = 'VIDEO';
  } else if (existing === 'IDEA_PIN' || pin.is_idea_pin || /idea_pin|story_pin/.test(rawMethod)) {
    provenance = 'IDEA_PIN';
  } else if (
    existing === 'ORGANIC_PIN' ||
    /organic_pin|scraped|rss|api|pinterest_platform/.test(rawMethod)
  ) {
    provenance = 'ORGANIC_PIN';
  }

  const dest = String(pin.destination_url || pin.link || '').trim();
  const dom = String(pin.clean_domain || pin.domain || '').trim().toLowerCase();
  const isLinkless = Boolean(
    pin.is_linkless === true ||
    (!dest && (!dom || ['uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it'].includes(dom)))
  );

  const hasAiDisclosure = Boolean(
    pin.has_ai_disclosure ||
    pin.is_ai_generated ||
    /ai[\s_-]*generated|modified[\s_-]*by[\s_-]*ai/i.test(String(pin.ai_disclosure_label || ''))
  );

  return {
    upload_provenance: provenance,
    has_ai_disclosure: hasAiDisclosure,
    is_linkless: isLinkless
  };
}

/**
 * Computes age, daily repin/save velocities, effective origin creator attribution,
 * and follower-adjusted outlier ratios.
 */
export function computeCandidateMetrics(candidate = {}, nowMs = Date.now()) {
  let ageDays = (candidate.age_days !== null && candidate.age_days !== undefined && Number.isFinite(Number(candidate.age_days)))
    ? Math.max(0.05, Number(candidate.age_days))
    : null;

  if (candidate.created_at_pinterest) {
    const createdMs = Date.parse(candidate.created_at_pinterest);
    if (Number.isFinite(createdMs)) {
      ageDays = Math.max(0.05, round2((nowMs - createdMs) / 86_400_000));
    }
  }

  const repinCount = (candidate.repin_count !== null && candidate.repin_count !== undefined && Number.isFinite(Number(candidate.repin_count)))
    ? Math.max(0, Math.round(Number(candidate.repin_count)))
    : null;

  const saveCount = (candidate.save_count !== null && candidate.save_count !== undefined && Number.isFinite(Number(candidate.save_count)))
    ? Math.max(0, Math.round(Number(candidate.save_count)))
    : null;

  const denomDays = ageDays !== null ? Math.max(0.5, ageDays) : null;
  const repinPerDay = (repinCount !== null && denomDays !== null)
    ? round2(repinCount / denomDays)
    : (candidate.repin_per_day != null && Number.isFinite(Number(candidate.repin_per_day)) ? round2(candidate.repin_per_day) : null);

  const savePerDay = (saveCount !== null && denomDays !== null)
    ? round2(saveCount / denomDays)
    : (candidate.save_per_day != null && Number.isFinite(Number(candidate.save_per_day)) ? round2(candidate.save_per_day) : null);

  // Strict Pinner vs Origin Creator separation:
  // If a big account repinned a rookie's pin, evaluate the ORIGIN creator, never the repinner!
  const originUsername = String(candidate.origin_creator_username || '').trim().toLowerCase() || null;
  const pinnerUsername = String(candidate.pinner_username || '').trim().toLowerCase() || null;
  const effectiveUsername = originUsername || pinnerUsername || String(candidate.effective_creator_username || '').trim().toLowerCase() || null;

  let effectiveFollowers = null;
  if (originUsername) {
    if (candidate.origin_creator_followers !== null && candidate.origin_creator_followers !== undefined) {
      effectiveFollowers = Number(candidate.origin_creator_followers);
    }
  } else if (candidate.pinner_followers !== null && candidate.pinner_followers !== undefined) {
    effectiveFollowers = Number(candidate.pinner_followers);
  } else if (candidate.effective_creator_followers !== null && candidate.effective_creator_followers !== undefined) {
    effectiveFollowers = Number(candidate.effective_creator_followers);
  }

  const primaryVolume = repinCount !== null
    ? repinCount
    : (saveCount !== null ? saveCount : null);
  const primaryVelocity = repinPerDay !== null
    ? repinPerDay
    : (savePerDay !== null ? savePerDay : null);
  const outlierRatio = (effectiveFollowers !== null && Number.isFinite(effectiveFollowers))
    ? round2((Math.max(repinCount ?? 0, saveCount ?? 0)) / Math.max(50, effectiveFollowers))
    : null;

  return {
    age_days: ageDays,
    repin_count: repinCount,
    save_count: saveCount,
    repin_per_day: repinPerDay,
    save_per_day: savePerDay,
    primary_engagement: primaryVolume,
    primary_velocity: primaryVelocity,
    effective_creator_username: effectiveUsername,
    effective_creator_followers: effectiveFollowers,
    is_repin: Boolean(candidate.is_repin || (originUsername && pinnerUsername && originUsername !== pinnerUsername)),
    outlier_ratio: outlierRatio
  };
}

/**
 * Evaluates a Newborn candidate pin against dynamic Qualification & Provenance settings.
 */
export function evaluateCandidateQualification(candidate = {}, rawSettings = DEFAULT_NEWBORN_SETTINGS, { nowMs = Date.now() } = {}) {
  const settings = rawSettings?.qualification ? rawSettings : normalizeNewbornSettings(rawSettings);
  const qual = settings.qualification;
  const provCfg = qual.provenance || DEFAULT_NEWBORN_SETTINGS.qualification.provenance;
  const vacuumCfg = qual.linkless_vacuum || DEFAULT_NEWBORN_SETTINGS.qualification.linkless_vacuum;

  const prov = classifyPinProvenance(candidate);
  const metrics = computeCandidateMetrics(candidate, nowMs);
  const reasons = [];

  // 1. Strict Root Creation Date & Age Window enforcement
  if (candidate.root_age_verified === false || candidate.repin_root_unverified === true) {
    reasons.push('unverified_repin_root_age');
  }
  if (metrics.age_days === null) {
    reasons.push('missing_creation_date');
  } else if (metrics.age_days < qual.min_age_days || metrics.age_days > qual.max_age_days) {
    reasons.push('age_out_of_window');
  }

  // 2. Engagement & velocity thresholds:
  //    - Primary Gate: `repin_count >= min_repin_count` (strictly Re-pins, never substituted with Saves!)
  //    - Optional Conditional Gate: `min_save_count === 0` completely ignores Saves; `> 0` enforces `save_count >= min_save_count`!
  if (qual.min_repin_count > 0 && (metrics.repin_count === null || metrics.repin_count < qual.min_repin_count)) {
    reasons.push('below_min_repins');
  }

  if (qual.min_save_count > 0 && (metrics.save_count === null || metrics.save_count < qual.min_save_count)) {
    reasons.push('below_min_saves');
  }

  if (qual.min_repin_per_day > 0 && metrics.age_days !== null && (metrics.repin_per_day === null || metrics.repin_per_day < qual.min_repin_per_day)) {
    reasons.push('below_min_repin_velocity');
  }

  if (qual.min_save_per_day > 0 && metrics.age_days !== null && (metrics.save_per_day === null || metrics.save_per_day < qual.min_save_per_day)) {
    reasons.push('below_min_save_velocity');
  }

  if (qual.min_shares > 0 && (candidate.share_count == null || Number(candidate.share_count) < qual.min_shares)) {
    reasons.push('below_min_shares');
  }
  if (qual.min_comments > 0 && (candidate.comment_count == null || Number(candidate.comment_count) < qual.min_comments)) {
    reasons.push('below_min_comments');
  }
  if (qual.min_reactions > 0 && (candidate.reaction_count == null || Number(candidate.reaction_count) < qual.min_reactions)) {
    reasons.push('below_min_reactions');
  }

  // 3. Creator follower cap & Rookie Outlier detection
  const effectiveVelocity = Math.max(metrics.repin_per_day ?? 0, metrics.save_per_day ?? 0);
  const rookieVelFloor = Math.max(1, qual.min_repin_per_day ?? 0, qual.min_save_per_day ?? 0);
  const isRookieOutlier = Boolean(
    metrics.effective_creator_followers !== null &&
    metrics.effective_creator_followers <= qual.max_creator_followers &&
    (
      effectiveVelocity >= rookieVelFloor ||
      (metrics.outlier_ratio ?? 0) >= 0.05
    )
  );

  if (
    qual.enforce_max_followers_filter &&
    metrics.effective_creator_followers !== null &&
    metrics.effective_creator_followers > qual.max_creator_followers
  ) {
    reasons.push('exceeds_max_creator_followers');
  }

  // 4. Provenance, format & AI disclosure filters
  if (provCfg.exclude_products && candidate.is_product) {
    reasons.push('excluded_product_pin');
  }
  if (provCfg.exclude_videos && candidate.is_video) {
    reasons.push('excluded_video_pin');
  }
  if (Array.isArray(provCfg.excluded_sources) && provCfg.excluded_sources.includes(prov.upload_provenance)) {
    reasons.push('excluded_provenance');
  }
  if (
    Array.isArray(provCfg.allowed_sources) &&
    provCfg.allowed_sources.length > 0 &&
    !provCfg.allowed_sources.includes(prov.upload_provenance)
  ) {
    reasons.push('disallowed_provenance');
  }

  if (provCfg.ai_disclosure_policy === 'exclude' && prov.has_ai_disclosure) {
    reasons.push('excluded_ai_disclosure');
  } else if (provCfg.ai_disclosure_policy === 'only' && !prov.has_ai_disclosure) {
    reasons.push('requires_ai_disclosure');
  }

  // 5. Linkless Vacuum filter
  if ((vacuumCfg.mode === 'only' || vacuumCfg.linkless_vacuum_only) && !prov.is_linkless) {
    reasons.push('requires_linkless_vacuum');
  }

  return {
    qualified: reasons.length === 0,
    reasons,
    upload_provenance: prov.upload_provenance,
    has_ai_disclosure: prov.has_ai_disclosure,
    is_linkless: prov.is_linkless,
    is_rookie_outlier: isRookieOutlier,
    metrics
  };
}

/**
 * Computes the 0–100 Golden Pin Breakout Score (`golden_score`) and enriches the candidate.
 */
export function scoreNewbornCandidate(candidate = {}, rawSettings = DEFAULT_NEWBORN_SETTINGS, { nowMs = Date.now() } = {}) {
  const settings = rawSettings?.qualification ? rawSettings : normalizeNewbornSettings(rawSettings);
  const evalRes = evaluateCandidateQualification(candidate, settings, { nowMs });
  const { metrics } = evalRes;
  const qual = settings.qualification;
  const vacuumCfg = qual.linkless_vacuum || DEFAULT_NEWBORN_SETTINGS.qualification.linkless_vacuum;

  // 1. Re-pin Velocity & Volume Intensity (0..42)
  const effectiveVel = (metrics.repin_per_day !== null && metrics.repin_per_day > 0)
    ? metrics.repin_per_day
    : Math.max(metrics.repin_per_day ?? 0, metrics.save_per_day ?? 0);
  const effectiveRepins = metrics.repin_count ?? 0;
  const velocityScore = Math.min(30, Math.log1p(Math.max(0, effectiveVel)) * 11.0) +
    Math.min(12, Math.log1p(Math.max(0, effectiveRepins)) * 2.2);

  // 2. Newborn Freshness Bonus (0..22)
  let freshnessScore = 8;
  if (metrics.age_days !== null) {
    if (metrics.age_days <= 3) freshnessScore = 22;
    else if (metrics.age_days <= 7) freshnessScore = 20;
    else if (metrics.age_days <= 14) freshnessScore = 16;
    else if (metrics.age_days <= 30) freshnessScore = 12;
    else if (metrics.age_days <= 90) freshnessScore = 6;
    else freshnessScore = Math.max(0, 4 - (metrics.age_days - 90) / 60);
  }

  // 3. Rookie / Outlier Leverage (0..14)
  let outlierScore = 0;
  if (evalRes.is_rookie_outlier) {
    outlierScore += 8;
  }
  if (metrics.outlier_ratio !== null) {
    outlierScore += Math.min(6, Math.log1p(metrics.outlier_ratio * 10) * 2.6);
  }
  outlierScore = Math.min(14, outlierScore);

  // 4. Multi-Surface & Annotations Richness (0..10)
  const realSurfaces = Array.isArray(candidate.discovered_surfaces)
    ? candidate.discovered_surfaces.filter((s) => s && String(s).toLowerCase() !== 'pin_resource')
    : [];
  const surfaceCount = Math.max(1, realSurfaces.length);
  const annCount = Array.isArray(candidate.visual_annotations) ? candidate.visual_annotations.length : 0;
  const depthScore = Math.min(
    10,
    Math.min(5, (surfaceCount - 1) * 2.5) +
    Math.min(5, annCount * 1.0)
  );

  // 5. Linkless Arbitrage Vacuum Boost (0..score_boost)
  let vacuumBoost = 0;
  if (evalRes.is_linkless && (vacuumCfg.mode === 'boost' || vacuumCfg.mode === 'only')) {
    vacuumBoost = Number(vacuumCfg.score_boost ?? 12) || 0;
  }

  // Native mobile share / upload bonus (+3)
  const nativeMobileBonus = ['SHARE_EXTENSION_IOS', 'SHARE_EXTENSION_ANDROID', 'UPLOADED'].includes(evalRes.upload_provenance)
    ? 3
    : 0;

  let goldenScore = round2(Math.min(100, Math.max(0, velocityScore + freshnessScore + outlierScore + depthScore + vacuumBoost + nativeMobileBonus)));
  if (!evalRes.qualified) {
    goldenScore = round2(Math.min(goldenScore * 0.55, 54.9));
  }

  const isGoldenPin = Boolean(evalRes.qualified);

  return {
    ...candidate,
    upload_provenance: evalRes.upload_provenance,
    has_ai_disclosure: evalRes.has_ai_disclosure,
    is_linkless: evalRes.is_linkless,
    effective_creator_username: metrics.effective_creator_username,
    effective_creator_followers: metrics.effective_creator_followers,
    is_repin: metrics.is_repin,
    age_days: metrics.age_days,
    repin_count: metrics.repin_count,
    save_count: metrics.save_count,
    repin_per_day: metrics.repin_per_day,
    save_per_day: metrics.save_per_day,
    outlier_ratio: metrics.outlier_ratio,
    golden_score: goldenScore,
    is_golden_pin: isGoldenPin,
    is_rookie_outlier: evalRes.is_rookie_outlier,
    qualified: evalRes.qualified,
    disqualification_reasons: evalRes.reasons
  };
}

/**
 * Evaluates automatic Watchlist staging & SSOT Promotion thresholds for a scored candidate pin.
 */
export function evaluatePinAutoRules(scoredCandidate = {}, rawSettings = DEFAULT_NEWBORN_SETTINGS) {
  const settings = rawSettings?.automation ? rawSettings : normalizeNewbornSettings(rawSettings);
  const auto = settings.automation;
  const watchT = auto.pin_promotion_rules.watchlist_thresholds;
  const promoT = auto.pin_promotion_rules.promote_thresholds;

  const repins = scoredCandidate.repin_count !== null && scoredCandidate.repin_count !== undefined
    ? Number(scoredCandidate.repin_count)
    : 0;
  const saves = scoredCandidate.save_count !== null && scoredCandidate.save_count !== undefined
    ? Number(scoredCandidate.save_count)
    : null;
  const repinVel = Number(scoredCandidate.repin_per_day ?? 0);
  const saveVel = Number(scoredCandidate.save_per_day ?? 0);
  const ageDays = scoredCandidate.age_days !== null && scoredCandidate.age_days !== undefined
    ? Number(scoredCandidate.age_days)
    : null;
  const goldenScore = Number(scoredCandidate.golden_score ?? 0);
  const consecutiveDays = Math.max(0, Number(scoredCandidate.consecutive_qualifying_days ?? 0));

  const watchMinRepins = Number(watchT.min_repins ?? 0);
  const watchMinSaves = Number(watchT.min_saves ?? 0);
  const watchMinRepinVel = Number(watchT.min_repin_per_day ?? 0);
  const watchMinSaveVel = Number(watchT.min_save_per_day ?? 0);

  const meetsWatchlist = Boolean(
    scoredCandidate.qualified !== false &&
    ageDays !== null &&
    ageDays <= watchT.max_age_days &&
    (watchMinRepins === 0 || repins >= watchMinRepins) &&
    (watchMinSaves === 0 || (saves !== null && saves >= watchMinSaves)) &&
    (watchMinRepinVel === 0 || repinVel >= watchMinRepinVel) &&
    (watchMinSaveVel === 0 || saveVel >= watchMinSaveVel) &&
    goldenScore >= watchT.min_golden_score
  );

  const promoMinRepins = Number(promoT.min_repins ?? 0);
  const promoMinSaves = Number(promoT.min_saves ?? 0);
  const promoMinRepinVel = Number(promoT.min_repin_per_day ?? 0);
  const promoMinSaveVel = Number(promoT.min_save_per_day ?? 0);

  const meetsPromotionMetrics = Boolean(
    scoredCandidate.qualified !== false &&
    ageDays !== null &&
    ageDays <= promoT.max_age_days &&
    (promoMinRepins === 0 || repins >= promoMinRepins) &&
    (promoMinSaves === 0 || (saves !== null && saves >= promoMinSaves)) &&
    (promoMinRepinVel === 0 || repinVel >= promoMinRepinVel) &&
    (promoMinSaveVel === 0 || saveVel >= promoMinSaveVel) &&
    goldenScore >= promoT.min_golden_score
  );

  const meetsPromotion = Boolean(
    meetsPromotionMetrics &&
    consecutiveDays >= promoT.min_consecutive_days
  );

  return {
    auto_track_enabled: Boolean(auto.auto_track_enabled),
    meets_watchlist: meetsWatchlist,
    meets_promotion_metrics: meetsPromotionMetrics,
    meets_promotion: meetsPromotion,
    required_consecutive_days: promoT.min_consecutive_days,
    current_consecutive_days: consecutiveDays,
    destinations: auto.pin_promotion_rules.destinations
  };
}

/**
 * Scores a hydrated creator + their discovered Newborn pins for the Rookie / Rising Account Radar.
 */
export function scoreRookieCreator(creatorProfile = {}, creatorCandidates = [], rawSettings = DEFAULT_NEWBORN_SETTINGS) {
  const settings = rawSettings?.automation ? rawSettings : normalizeNewbornSettings(rawSettings);
  const rookieRules = settings.automation.rookie_promotion_rules;
  const maxQualFollowers = settings.qualification.max_creator_followers;

  const followers = Number(creatorProfile.follower_count ?? 0);
  const monthlyReach = Number(creatorProfile.monthly_reach ?? creatorProfile.total_audience ?? 0);
  const profileViews = Number(creatorProfile.profile_views ?? creatorProfile.impressions ?? 0);

  const goldenPins = creatorCandidates.filter((c) => c.is_golden_pin);
  const qualifiedPins = creatorCandidates.filter((c) => c.qualified !== false);
  const maxPinGoldenScore = creatorCandidates.reduce((m, c) => Math.max(m, Number(c.golden_score || 0)), 0);

  const annCounts = new Map();
  for (const c of creatorCandidates) {
    for (const a of (c.visual_annotations || [])) {
      const name = String(typeof a === 'string' ? a : (a?.name || '')).trim().toLowerCase();
      if (!name) continue;
      annCounts.set(name, (annCounts.get(name) || 0) + 1);
    }
  }
  const topAnnotations = Array.from(annCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const outlierMultiplier = round2(Math.max(monthlyReach, profileViews) / Math.max(50, followers));

  let followerCompactScore = 0;
  if (followers <= rookieRules.max_followers) {
    followerCompactScore = 30;
  } else if (followers <= maxQualFollowers) {
    followerCompactScore = 20;
  } else if (followers <= maxQualFollowers * 2) {
    followerCompactScore = 8;
  }

  const reachRatioScore = Math.min(30, Math.log1p(outlierMultiplier) * 5.5);
  const goldenDensityScore = Math.min(25, goldenPins.length * 10 + qualifiedPins.length * 2.5);
  const peakPinScore = Math.min(15, (maxPinGoldenScore / 100) * 15);

  const rookieScore = round2(Math.min(100, followerCompactScore + reachRatioScore + goldenDensityScore + peakPinScore));
  const isQualifiedRookie = Boolean(
    followers <= Math.max(rookieRules.max_followers, maxQualFollowers) &&
    (goldenPins.length >= 1 || qualifiedPins.length >= 1) &&
    rookieScore >= 50
  );

  return {
    username: String(creatorProfile.username || '').trim().toLowerCase(),
    display_name: creatorProfile.display_name || creatorProfile.username || '',
    avatar_url: creatorProfile.avatar_url || null,
    website_url: creatorProfile.website_url || null,
    clean_domain: creatorProfile.clean_domain || null,
    follower_count: followers,
    monthly_reach: monthlyReach,
    profile_views: profileViews,
    pin_count: Number(creatorProfile.pin_count ?? 0),
    board_count: Number(creatorProfile.board_count ?? 0),
    account_created_at: creatorProfile.account_created_at || null,
    rookie_score: rookieScore,
    outlier_multiplier: outlierMultiplier,
    golden_pins_count: goldenPins.length,
    sample_pin_ids: creatorCandidates
      .slice()
      .sort((a, b) => (b.golden_score || 0) - (a.golden_score || 0))
      .slice(0, 10)
      .map((c) => c.pin_id),
    top_annotations: topAnnotations,
    is_qualified_rookie: isQualifiedRookie
  };
}

/**
 * Evaluates automatic Rookie Creator promotion rules (`newborn_rookie_accounts` -> `competitor_profiles`).
 */
export function evaluateRookieAutoRules(rookie = {}, rawSettings = DEFAULT_NEWBORN_SETTINGS) {
  const settings = rawSettings?.automation ? rawSettings : normalizeNewbornSettings(rawSettings);
  const rules = settings.automation.rookie_promotion_rules;
  const consecutiveDays = Math.max(0, Number(rookie.consecutive_qualifying_days ?? 0));

  const meetsMetrics = Boolean(
    rules.enabled &&
    Number(rookie.follower_count ?? Number.MAX_SAFE_INTEGER) <= rules.max_followers &&
    Number(rookie.monthly_reach ?? 0) >= rules.min_monthly_reach &&
    Number(rookie.golden_pins_count ?? 0) >= rules.min_golden_pins &&
    Number(rookie.rookie_score ?? 0) >= rules.min_rookie_score
  );

  return {
    enabled: Boolean(rules.enabled),
    meets_watchlist: Boolean(
      rules.enabled &&
      Number(rookie.follower_count ?? Number.MAX_SAFE_INTEGER) <= Math.max(rules.max_followers * 2, 25000) &&
      Number(rookie.rookie_score ?? 0) >= Math.max(45, rules.min_rookie_score - 15)
    ),
    meets_promotion_metrics: meetsMetrics,
    meets_promotion: Boolean(meetsMetrics && consecutiveDays >= rules.min_consecutive_days),
    required_consecutive_days: rules.min_consecutive_days,
    destination_tracking_mode: rules.destination_tracking_mode,
    destination_folder_id: rules.destination_folder_id
  };
}

function tokenizeSemanticPhrase(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function toTitleCase(str = '') {
  return String(str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Precomputes O(N) annotation frequency counts across a candidate cohort so
 * `synthesizeNewbornCrossoverBlueprint` runs in O(N) total instead of O(N^2).
 *
 * @param {Array<object>} [candidates=[]]
 * @returns {Map<string, number>}
 */
export function buildPeerAnnotationCounts(candidates = []) {
  const counts = new Map();
  const perPinCounts = new Map();
  for (const peer of (Array.isArray(candidates) ? candidates : [])) {
    if (!peer) continue;
    const pid = peer.pin_id != null ? String(peer.pin_id) : null;
    let pinCounts = pid ? perPinCounts.get(pid) : null;
    for (const pa of (peer.visual_annotations || [])) {
      const n = String(typeof pa === 'string' ? pa : (pa?.name || '')).trim().toLowerCase();
      if (!n) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
      if (pid) {
        if (!pinCounts) {
          pinCounts = new Map();
          perPinCounts.set(pid, pinCounts);
        }
        pinCounts.set(n, (pinCounts.get(n) || 0) + 1);
      }
    }
  }
  Object.defineProperty(counts, '_perPinCounts', {
    value: perPinCounts,
    enumerable: false,
    configurable: true
  });
  return counts;
}

/**
 * Synthesizes an Annotation + Board-Title + Guided Capsule Crossover Blueprint for a candidate pin.
 * Accepts either a raw `peerCandidates` array or a precomputed `Map` from `buildPeerAnnotationCounts()`.
 */
export function synthesizeNewbornCrossoverBlueprint(candidate = {}, peerCandidatesOrCounts = []) {
  const annotations = (candidate.visual_annotations || [])
    .map((a) => String(typeof a === 'string' ? a : (a?.name || '')).trim())
    .filter(Boolean);
  const boardName = String(candidate.board_name || '').trim();
  const boardLower = boardName.toLowerCase();
  const boardTokens = new Set(tokenizeSemanticPhrase(boardName));

  const capsules = (candidate.guided_capsules || [])
    .map((c) => String(typeof c === 'string' ? c : (c?.term || c?.display || '')).trim())
    .filter(Boolean);
  const capsuleTokens = new Set(capsules.flatMap((c) => tokenizeSemanticPhrase(c)));

  let peerAnnCounts;
  let selfAnnDeductions = null;
  if (peerCandidatesOrCounts instanceof Map) {
    peerAnnCounts = peerCandidatesOrCounts;
    const pid = candidate.pin_id != null ? String(candidate.pin_id) : null;
    if (pid && peerCandidatesOrCounts._perPinCounts instanceof Map) {
      selfAnnDeductions = peerCandidatesOrCounts._perPinCounts.get(pid) || null;
    }
  } else {
    peerAnnCounts = new Map();
    for (const peer of (Array.isArray(peerCandidatesOrCounts) ? peerCandidatesOrCounts : [])) {
      if (!peer || peer.pin_id === candidate.pin_id) continue;
      for (const pa of (peer.visual_annotations || [])) {
        const n = String(typeof pa === 'string' ? pa : (pa?.name || '')).trim().toLowerCase();
        if (n) peerAnnCounts.set(n, (peerAnnCounts.get(n) || 0) + 1);
      }
    }
  }

  const anchors = [];
  for (const ann of annotations) {
    const annLower = ann.toLowerCase();
    const annWords = tokenizeSemanticPhrase(annLower);
    const sources = ['visual_annotation'];
    let crossoverWeight = 10;

    const matchesBoardExact = boardLower && (boardLower.includes(annLower) || annLower.includes(boardLower));
    const matchesBoardToken = annWords.some((w) => boardTokens.has(w));
    if (matchesBoardExact || matchesBoardToken) {
      sources.push('board_title');
      crossoverWeight += matchesBoardExact ? 25 : 14;
    }

    const matchesCapsule = capsules.some((c) => c.toLowerCase().includes(annLower)) || annWords.some((w) => capsuleTokens.has(w));
    if (matchesCapsule) {
      sources.push('guided_capsule');
      crossoverWeight += 12;
    }

    const rawPeerHits = peerAnnCounts.get(annLower) || 0;
    const selfHits = selfAnnDeductions ? (selfAnnDeductions.get(annLower) || 0) : 0;
    const peerHits = Math.max(0, rawPeerHits - selfHits);
    if (peerHits > 0) {
      sources.push('cluster_consensus');
      crossoverWeight += Math.min(15, peerHits * 5);
    }

    anchors.push({
      term: annLower,
      display: toTitleCase(ann),
      sources,
      is_exact_crossover: sources.length >= 2,
      weight: crossoverWeight
    });
  }

  anchors.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));

  const primaryAnchor = anchors[0]?.term || String(candidate.seed_query || boardName || candidate.title || '').trim().toLowerCase();
  const secondaryAnchor = anchors[1]?.term || capsules[0]?.toLowerCase() || '';

  const recommendedBoardName = primaryAnchor
    ? toTitleCase(secondaryAnchor && !secondaryAnchor.includes(primaryAnchor) ? `${primaryAnchor} ${secondaryAnchor}` : `${primaryAnchor} Ideas`)
    : (boardName || 'Trending Ideas');

  const recommendedPinTitle = primaryAnchor
    ? (secondaryAnchor && secondaryAnchor !== primaryAnchor
        ? `${toTitleCase(primaryAnchor)}: ${toTitleCase(secondaryAnchor)} Guide`
        : `${toTitleCase(primaryAnchor)} Ideas & Inspiration`)
    : (candidate.title || 'Visual Guide');

  const recommendedSlug = String(primaryAnchor || recommendedPinTitle)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return {
    primary_keyword: primaryAnchor || null,
    secondary_keyword: secondaryAnchor || null,
    board_context: boardName || null,
    crossover_anchors: anchors.slice(0, 8),
    exact_crossover_count: anchors.filter((a) => a.is_exact_crossover).length,
    recommended_pin_title: recommendedPinTitle,
    recommended_board_name: recommendedBoardName,
    recommended_slug: recommendedSlug || null,
    linkless_vacuum_opportunity: Boolean(candidate.is_linkless)
  };
}

/**
 * Aggregates Annotation + Board-Title Crossover clusters across a cohort of Newborn candidates.
 */
export function buildNewbornCrossoverMatrix(candidates = [], { limit = 30 } = {}) {
  const termBuckets = new Map();
  const totalPins = Array.isArray(candidates) ? candidates.filter(Boolean).length : 0;

  for (const c of (candidates || [])) {
    if (!c) continue;
    const boardLower = String(c.board_name || '').trim().toLowerCase();
    const boardWords = new Set(tokenizeSemanticPhrase(boardLower));
    const seenForPin = new Set();

    for (const rawAnn of (c.visual_annotations || [])) {
      const annObj = typeof rawAnn === 'object' && rawAnn !== null ? rawAnn : null;
      const term = String(typeof rawAnn === 'string' ? rawAnn : (annObj?.name || '')).trim().toLowerCase();
      if (!term || term.length < 2 || seenForPin.has(term)) continue;
      seenForPin.add(term);

      const rawUrl = annObj?.url ? String(annObj.url).trim() : null;
      const ideaId = annObj?.idea_id ? String(annObj.idea_id).trim() : (rawUrl?.match(/\/ideas\/[^/]+\/(\d+)/)?.[1] || null);
      const ideaUrl = rawUrl
        ? (rawUrl.startsWith('http') ? rawUrl : `https://www.pinterest.com${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`)
        : null;

      let bucket = termBuckets.get(term);
      if (!bucket) {
        bucket = {
          term,
          display: toTitleCase(term),
          idea_id: ideaId,
          idea_url: ideaUrl,
          pin_count: 0,
          golden_pin_count: 0,
          linkless_count: 0,
          board_title_matches: 0,
          repin_sum: 0,
          repin_vel_sum: 0,
          golden_score_sum: 0,
          sample_boards: new Set(),
          sample_pin_ids: []
        };
        termBuckets.set(term, bucket);
      } else {
        if (!bucket.idea_id && ideaId) bucket.idea_id = ideaId;
        if (!bucket.idea_url && ideaUrl) bucket.idea_url = ideaUrl;
      }

      bucket.pin_count++;
      if (c.is_golden_pin) bucket.golden_pin_count++;
      if (c.is_linkless) bucket.linkless_count++;

      const termWords = tokenizeSemanticPhrase(term);
      const matchesBoard = Boolean(
        boardLower &&
        (boardLower.includes(term) || term.includes(boardLower) || termWords.some((w) => boardWords.has(w)))
      );
      if (matchesBoard) {
        bucket.board_title_matches++;
        if (c.board_name && bucket.sample_boards.size < 5) {
          bucket.sample_boards.add(String(c.board_name).trim());
        }
      }

      bucket.repin_sum += Number(c.repin_count || 0);
      bucket.repin_vel_sum += Number(c.repin_per_day || 0);
      bucket.golden_score_sum += Number(c.golden_score || 0);
      if (bucket.sample_pin_ids.length < 6 && c.pin_id) {
        bucket.sample_pin_ids.push(String(c.pin_id));
      }
    }
  }

  return Array.from(termBuckets.values())
    .map((b) => {
      const avgRepins = b.pin_count > 0 ? Math.round(b.repin_sum / b.pin_count) : 0;
      const avgRepinPerDay = b.pin_count > 0 ? round2(b.repin_vel_sum / b.pin_count) : 0;
      const avgGoldenScore = b.pin_count > 0 ? round2(b.golden_score_sum / b.pin_count) : 0;
      const linklessSharePct = b.pin_count > 0 ? round2((b.linkless_count / b.pin_count) * 100) : 0;
      const overlapPct = totalPins > 0 ? round2((b.pin_count / totalPins) * 100) : 0;
      const sampleBoards = Array.from(b.sample_boards);
      const convictionScore = round2(
        Math.min(
          100,
          b.pin_count * 8 +
          b.golden_pin_count * 12 +
          b.board_title_matches * 10 +
          avgGoldenScore * 0.35 +
          (linklessSharePct >= 50 ? 10 : 0)
        )
      );
      return {
        term: b.term,
        annotation: b.display,
        display: b.display,
        idea_id: b.idea_id,
        idea_url: b.idea_url,
        pin_count: b.pin_count,
        overlap_pct: overlapPct,
        golden_pin_count: b.golden_pin_count,
        board_title_matches: b.board_title_matches,
        linkless_count: b.linkless_count,
        linkless_share_pct: linklessSharePct,
        total_repins: b.repin_sum,
        avg_repins: avgRepins,
        avg_repin_per_day: avgRepinPerDay,
        avg_golden_score: avgGoldenScore,
        conviction_score: convictionScore,
        sample_boards: sampleBoards,
        top_board_names: sampleBoards.map((name) => ({ name })),
        sample_pin_ids: b.sample_pin_ids
      };
    })
    .sort((a, b) => b.pin_count - a.pin_count || b.avg_repins - a.avg_repins || b.conviction_score - a.conviction_score || a.term.localeCompare(b.term))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 30)));
}
