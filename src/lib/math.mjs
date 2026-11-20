/**
 * Mathematical & Algorithmic Telemetry Utilities
 * Single Source of Truth (SSOT) for Pin Arbitrage Engine (PAE)
 */

/**
 * Evaluates the canonical anti-hydration jump invariants.
 * [INVARIANT: ANTI-HYDRATION-SPIKE]
 *
 * Rules:
 * 1. prev.save_count <= 0 && curr.save_count > 0
 * 2. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
 * 3. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= prev.save_count * 2.5
 * 4. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
 * 5. Legacy: rawDelta > 2000 when prev.save_count < 500 and (prev.save_count <= 0 or curr / prev > 20)
 *
 * Note: `save_count < repin_count` is legitimate on Pinterest (independent counters) and MUST NOT zero-lock velocity.
 *
 * @param {number} curSaves
 * @param {number} prevSaves
 * @param {number} curRepins
 * @param {number} prevRepins
 * @returns {boolean} True if transition is a hydration jump
 */
export function evaluateCanonicalHydrationRules(curSaves, prevSaves, curRepins, prevRepins) {
  if (!Number.isFinite(curSaves) || !Number.isFinite(prevSaves)) return false;

  const rawDelta = Math.max(0, curSaves - prevSaves);
  if (rawDelta === 0) return false;

  // 1. prev.save_count <= 0 && curr.save_count > 0
  if (prevSaves <= 0 && curSaves > 0) {
    return true;
  }

  // 2. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
  const effCurRepins = curRepins > 0 ? curRepins : prevRepins;
  if (prevRepins > 0 && prevSaves === prevRepins && curSaves > effCurRepins * 1.35) {
    return true;
  }

  // 3. prev.repin_count === 0 && curRepins >= 25 && curSaves >= prevSaves * 2.5
  if (prevRepins === 0 && curRepins >= 25 && curSaves >= prevSaves * 2.5) {
    return true;
  }

  // 4. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
  if (prevSaves > 0 && (curSaves / prevSaves) >= 4.0 && (curSaves - prevSaves) >= 2500) {
    return true;
  }

  // 5. Legacy: rawDelta > 2000 when prev.save_count < 500 and (prevSaves <= 0 || (curSaves / Math.max(1, prevSaves)) > 20)
  if (rawDelta > 2000 && prevSaves < 500 && (prevSaves <= 0 || (curSaves / Math.max(1, prevSaves)) > 20)) {
    return true;
  }

  return false;
}

/**
 * Detects multi-stage hydration jumps where unhydrated or stub pin records
 * receive lifetime metric backfills, preventing astronomical velocity spikes.
 * [INVARIANT: ANTI-HYDRATION-SPIKE]
 *
 * @param {object|number} params - Options object, or current saves count
 * @param {number|object} [maybePrevSaves=0]
 * @param {number} [maybeCurRepins=0]
 * @param {number} [maybePrevRepins=0]
 * @returns {boolean} True if the transition represents a multi-stage hydration jump
 */
// [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Anti-Hydration Jump Detection
export function detectHydrationJump(params, maybePrevSaves = 0, maybeCurRepins = 0, maybePrevRepins = 0) {
  let curSaves = 0;
  let prevSaves = 0;
  let curRepins = 0;
  let prevRepins = 0;

  if (typeof params === 'number') {
    curSaves = params;
    prevSaves = Number(maybePrevSaves || 0);
    curRepins = Number(maybeCurRepins || 0);
    prevRepins = Number(maybePrevRepins || 0);
  } else if (params && typeof params === 'object') {
    if (maybePrevSaves && typeof maybePrevSaves === 'object') {
      const prev = params;
      const curr = maybePrevSaves;
      prevSaves = Number(prev.save_count ?? prev.saves ?? prev.baselineSaves ?? prev.prev_saves ?? 0);
      curSaves = Number(curr.save_count ?? curr.saves ?? curr.currentSaves ?? curr.cur_saves ?? 0);
      prevRepins = Number(prev.repin_count ?? prev.repins ?? prev.baselineRepins ?? prev.prev_repins ?? 0);
      curRepins = Number(curr.repin_count ?? curr.repins ?? curr.currentRepins ?? curr.cur_repins ?? 0);
    } else if (params.prev || params.curr) {
      const prev = params.prev;
      const curr = params.curr;
      prevSaves = typeof prev === 'number' ? prev : Number(prev?.save_count ?? prev?.saves ?? prev?.baselineSaves ?? prev?.prev_saves ?? 0);
      curSaves = typeof curr === 'number' ? curr : Number(curr?.save_count ?? curr?.saves ?? curr?.currentSaves ?? curr?.cur_saves ?? 0);
      prevRepins = typeof prev === 'object' ? Number(prev?.repin_count ?? prev?.repins ?? prev?.baselineRepins ?? prev?.prev_repins ?? 0) : 0;
      curRepins = typeof curr === 'object' ? Number(curr?.repin_count ?? curr?.repins ?? curr?.currentRepins ?? curr?.cur_repins ?? 0) : 0;
    } else {
      curSaves = Number(params.currentSaves ?? params.save_count ?? params.curr_saves ?? params.currSaves ?? 0);
      prevSaves = Number(params.baselineSaves ?? params.prev_saves ?? params.prevSaves ?? params.base_saves ?? 0);
      curRepins = Number(params.currentRepins ?? params.repin_count ?? params.curr_repins ?? params.curRepins ?? 0);
      prevRepins = Number(params.baselineRepins ?? params.prev_repins ?? params.prevRepins ?? params.base_repins ?? 0);
    }
  } else {
    return false;
  }

  return evaluateCanonicalHydrationRules(curSaves, prevSaves, curRepins, prevRepins);
}

/**
 * Calculates time-normalized daily save velocity between two snapshot dates:
 * MAX(0, (curr_saves - prev_saves) / days_diff)
 * [INVARIANT: UTC-MIDNIGHT-NORMALIZED-VELOCITY]
 *
 * Normalizes elapsed time to pure UTC calendar days (midnight-to-midnight)
 * to prevent intraday hour bias and NaN poisoning.
 *
 * @param {object} params
 * @param {number|string} params.currentSaves - Current confirmed saves count
 * @param {number|string} params.baselineSaves - Previous baseline saves count
 * @param {number|string} [params.currentRepins] - Current confirmed repins count
 * @param {number|string} [params.baselineRepins] - Previous baseline repins count
 * @param {Date|string|number} [params.currentDate] - Current crawl date / timestamp
 * @param {Date|string|number} [params.baselineDate] - Previous baseline snapshot date
 * @param {Date|string|number} [params.createdAt] - Creation timestamp on Pinterest
 * @param {boolean} [params.wasDeepHydrated] - Whether the baseline record was previously deep hydrated
 * @param {number} [params.maxCap=25000] - Bot-spike sanity cap
 * @returns {number} Daily save velocity (saves/day)
 */
export function calculateDailyVelocity(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(
      '[calculateDailyVelocity] Positional arguments are forbidden. Expected options object: { currentSaves, baselineSaves, currentDate, baselineDate, maxCap }'
    );
  }

  const {
    currentSaves = 0,
    baselineSaves = 0,
    currentRepins = 0,
    baselineRepins = 0,
    currentDate = new Date(),
    baselineDate = null,
    maxCap = 25000,
    createdAt = null,
    wasDeepHydrated = undefined
  } = params;

  const curSavesNum = Number(currentSaves);
  const baseSavesNum = Number(baselineSaves);
  const curRepinsNum = Number(params.currentRepins ?? params.curRepins ?? currentRepins ?? 0);
  const baseRepinsNum = Number(params.baselineRepins ?? params.prevRepins ?? baselineRepins ?? 0);
  const capNum = Number.isFinite(Number(maxCap)) && Number(maxCap) > 0 ? Number(maxCap) : 25000;

  // Anti-NaN guard
  if (!Number.isFinite(curSavesNum) || !Number.isFinite(baseSavesNum)) {
    return 0;
  }

  // Without a verified prior snapshot timestamp, daily delta is unmeasurable (0)
  if (!baselineDate) {
    return 0;
  }

  const rawDelta = Math.max(0, curSavesNum - baseSavesNum);
  if (rawDelta === 0) {
    return 0;
  }

  // [INVARIANT: ANTI-HYDRATION-SPIKE]
  // When detectHydrationJump is true, transition represents a multi-stage hydration jump,
  // not an authentic 24h velocity. Strictly return 0.
  if (detectHydrationJump({
    currentSaves: curSavesNum,
    baselineSaves: baseSavesNum,
    currentRepins: curRepinsNum,
    baselineRepins: baseRepinsNum,
    wasDeepHydrated
  })) {
    return 0;
  }

  const curD = currentDate instanceof Date ? currentDate : new Date(currentDate);
  const baseD = baselineDate instanceof Date ? baselineDate : new Date(baselineDate);

  if (isNaN(curD.getTime()) || isNaN(baseD.getTime())) {
    return 0;
  }

  // Pure UTC Calendar Day normalization (midnight-to-midnight)
  const curUtcMidnight = Date.UTC(curD.getUTCFullYear(), curD.getUTCMonth(), curD.getUTCDate());
  const baseUtcMidnight = Date.UTC(baseD.getUTCFullYear(), baseD.getUTCMonth(), baseD.getUTCDate());

  const msDiff = curUtcMidnight - baseUtcMidnight;
  const daysElapsed = Math.max(1, Math.round(msDiff / 86400000));

  const velocity = Math.round((rawDelta / daysElapsed) * 10) / 10;
  if (!Number.isFinite(velocity) || velocity <= 0) {
    return 0;
  }
  return Math.min(velocity, capNum);
}

/**
 * Multi-stage hydration jump detector for trajectory snapshots.
 * Canonical alias mapped directly to detectHydrationJump SSOT.
 */
export const isMultiStageHydrationJump = detectHydrationJump;

/**
 * Computes the Anscombe Inflection Score for a pin.
 * Applies the Anscombe variance-stabilizing transformation A(x) = 2 * sqrt(x + 3/8)
 * to stabilize Poisson variance across low-count and high-count pin metric distributions,
 * measuring the statistical significance of velocity inflection.
 *
 * @param {object|number} pin - Pin record or current velocity number
 * @param {object} [options={}] - Optional tuning parameters
 * @returns {number} Anscombe inflection score
 */
function _computeVelocityTelemetry(pinOrCurrentVel, maybeGains7dOrPriorVel = null, maybeOptions = {}) {
  let currentVel = 0;
  let baseVel = 0;
  let repinVel = 0;
  let commentVel = 0;
  let ageDays = 0;
  let kappa = 5;
  let baselineDays = 6;

  if (typeof pinOrCurrentVel === 'number') {
    currentVel = Math.max(0, pinOrCurrentVel);
    const opts = (maybeOptions && typeof maybeOptions === 'object') ? maybeOptions : {};
    kappa = Math.max(1, Number(opts.kappa ?? 5));
    baselineDays = Math.max(1, Number(opts.baselineDays ?? 6));
    repinVel = Math.max(0, Number(opts.repinVelocity ?? opts.daily_repin_velocity ?? 0));
    commentVel = Math.max(0, Number(opts.commentVelocity ?? opts.comments ?? 0));
    if (opts.ageDays !== undefined) {
      ageDays = opts.ageDays != null ? Math.max(0, Number(opts.ageDays)) : 0;
    } else if (opts.createdAt || opts.created_at_pinterest) {
      const ms = new Date(opts.createdAt || opts.created_at_pinterest).getTime();
      if (Number.isFinite(ms) && ms > 0) ageDays = Math.max(0, (Date.now() - ms) / 86400000);
    }
    if (opts.baselineVelocity != null) {
      baseVel = Math.max(0, Number(opts.baselineVelocity));
    } else if (maybeGains7dOrPriorVel != null && Number.isFinite(Number(maybeGains7dOrPriorVel))) {
      const g = Number(maybeGains7dOrPriorVel);
      baseVel = opts.isGains7d ? Math.max(0, g / 7) : Math.max(0, g);
    }
  } else if (pinOrCurrentVel && typeof pinOrCurrentVel === 'object') {
    const p = pinOrCurrentVel;
    const opts = (maybeOptions && typeof maybeOptions === 'object') ? maybeOptions : {};
    currentVel = Math.max(0, Number(opts.currentVelocity ?? p.daily_save_velocity ?? p.velocity ?? p.currentVelocity ?? 0));
    kappa = Math.max(1, Number(opts.kappa ?? p.kappa ?? 5));
    baselineDays = Math.max(1, Number(opts.baselineDays ?? p.baselineDays ?? 6));
    if (opts.baselineVelocity != null) {
      baseVel = Math.max(0, Number(opts.baselineVelocity));
    } else if (p.baselineVelocity != null) {
      baseVel = Math.max(0, Number(p.baselineVelocity));
    } else if (p.priorVelocity != null) {
      baseVel = Math.max(0, Number(p.priorVelocity));
    } else if (p.gains_7d != null && Number(p.gains_7d) > 0) {
      baseVel = Math.max(0, Number(p.gains_7d) / 7);
    } else if (p.gains_5d != null && Number(p.gains_5d) > 0) {
      baseVel = Math.max(0, Number(p.gains_5d) / 5);
    }
    repinVel = Math.max(0, Number(p.daily_repin_velocity ?? p.repinVelocity ?? p.delta_repins_24h ?? 0));
    commentVel = Math.max(0, Number(p.comment_count ?? p.comments ?? p.commentVelocity ?? 0));
    const precomputedAge = opts.ageDays !== undefined
      ? opts.ageDays
      : (p.pin_age_days !== undefined
          ? p.pin_age_days
          : (p.pinAgeDays !== undefined ? p.pinAgeDays : p.age_days));
    if (precomputedAge !== undefined) {
      ageDays = precomputedAge != null ? Math.max(0, Number(precomputedAge)) : 0;
    } else if (p.created_at_pinterest || p.created_at || p.createdAt) {
      const ms = new Date(p.created_at_pinterest || p.created_at || p.createdAt).getTime();
      if (Number.isFinite(ms) && ms > 0) ageDays = Math.max(0, (Date.now() - ms) / 86400000);
    }
  } else {
    return { anscombe_z_gain: 0, repin_lead_score: 0, acceleration_score: 0, breakout_score: 0 };
  }

  const smoothedBase = Math.max(0, (baseVel * baselineDays + kappa) / (baselineDays + 1));
  const anscombeCurr = 2 * Math.sqrt(currentVel + 0.375);
  const anscombeBase = 2 * Math.sqrt(smoothedBase + 0.375);
  const rawAcceleration = anscombeCurr - anscombeBase;

  const repinLeadRaw = Math.min(2.0, (repinVel * 1.5 + commentVel * 2.0) / Math.max(1, currentVel + 1));
  const leadBoost = 1.0 + repinLeadRaw;
  const ageDecay = 1.0 / Math.sqrt(1.0 + (ageDays / 180.0));
  const finalAcceleration = rawAcceleration * leadBoost * ageDecay;

  const acceleration_score = Number.isFinite(finalAcceleration) ? Math.round(finalAcceleration * 100) / 100 : 0;
  const anscombe_z_gain = Number.isFinite(rawAcceleration) ? Math.round(rawAcceleration * 100) / 100 : 0;
  const repin_lead_score = Number.isFinite(repinLeadRaw) ? Math.round(repinLeadRaw * 100) / 100 : 0;
  const breakout_score = Math.min(100, Math.max(0, Math.round(
    (Math.max(0, anscombe_z_gain) * 12) + (repin_lead_score * 15) + (Math.max(0, acceleration_score) * 10)
  )));

  return { anscombe_z_gain, repin_lead_score, acceleration_score, breakout_score };
}

/**
 * Computes Anscombe-transformed velocity inflection telemetry object for a pin.
 */
export function computeAnscombeInflectionScore(pin, options = {}) {
  if (!pin || typeof pin !== 'object') {
    return { anscombe_z_gain: 0, repin_lead_score: 0, acceleration_score: 0, breakout_score: 0 };
  }
  return _computeVelocityTelemetry(pin, null, options);
}

/**
 * Computes unified Cross-Pillar Conviction Score (0-100) across:
 * 1. P2P Graph Resonance (seed overlap, pixie multihit, coupling_rho)
 * 2. SERP Dominance (active SERP ranking and keyword footprint)
 * 3. Velocity & Viral Momentum
 * 4. Domain Authority & Arbitrage Eligibility
 *
 * @param {object} params
 * @returns {object} { conviction_score, pillar_convergence_count, convergence_tier, p2p_factor, velocity_factor, serp_factor, age_factor }
 */
export function computeCrossPillarConvictionScore(params = {}) {
  if (!params || typeof params !== 'object') {
    return {
      conviction_score: 0,
      pillar_convergence_count: 0,
      convergence_tier: 'UNCONVERGED',
      p2p_factor: 0,
      velocity_factor: 0,
      serp_factor: 0,
      age_factor: 0
    };
  }

  const seedOverlap = Math.max(0, Number(params.seed_overlap_count ?? params.seedOverlapCount ?? params.seedOverlap ?? params.overlap ?? 0));
  const multihit = Math.max(0, Number(params.pixie_multihit_score ?? params.pixieScore ?? params.multihitScore ?? params.multihit ?? 0));
  const couplingRho = Math.max(0, Number(params.coupling_rho ?? params.couplingRho ?? 0));
  const velocity = Math.max(0, Number(params.daily_save_velocity ?? params.dailyVelocity ?? params.daily_velocity ?? params.velocity ?? 0));
  const saves = Math.max(0, Number(params.save_count ?? params.total_saves ?? params.saves ?? 0));
  const serpRank = params.rank_position ?? params.serpRank ?? params.rank ?? null;
  const serpKeywords = Math.max(0, Number(params.serp_keywords_count ?? params.serpKeywordsCount ?? params.serpCount ?? params.keywords_count ?? 0));
  const isSerpRanked = Boolean(params.isSerpRanked ?? params.is_serp_ranked ?? ((serpRank != null && Number(serpRank) > 0 && Number(serpRank) <= 50) || serpKeywords > 0));
  const isCompetitor = Boolean(params.is_competitor ?? params.isCompetitor ?? params.competitor_id ?? params.creator_username ?? params.account_username);
  const domain = String(params.domain ?? params.clean_domain ?? '').trim();
  const rawAge = params.domain_age_days ?? params.domainAgeDays;
  const domainAgeDays = rawAge != null ? Number(rawAge) : null;
  const arbitrageScore = Math.max(0, Number(params.arbitrage_score ?? params.arbitrageScore ?? 0));
  const isProduct = Boolean(params.is_product ?? params.isProduct);

  let pillars = 0;
  if (seedOverlap >= 1 || multihit > 0 || couplingRho > 0) pillars++;
  if (isSerpRanked) pillars++;
  if (isCompetitor || velocity >= 2.0 || saves >= 1000) pillars++;
  if ((domain && domain !== 'uploaded by user' && domain.includes('.')) || (domainAgeDays != null && domainAgeDays > 0 && domainAgeDays <= 1095) || arbitrageScore > 0) pillars++;

  const p2pFactor = (seedOverlap > 0 || multihit > 0 || couplingRho > 0)
    ? Math.min(35, Math.log2(Math.max(1, seedOverlap) + 1) * 15 + (couplingRho * 10) + (multihit > 100 ? 5 : 0))
    : 0;
  const velocityFactor = Math.min(25, Math.log1p(velocity) * 6 + (saves > 1000 ? Math.log10(saves) * 1.5 : 0));

  let serpFactor = 0;
  if (isSerpRanked) {
    const rank = serpRank != null && Number(serpRank) > 0 ? Number(serpRank) : 50;
    const rankBonus = rank <= 3 ? 15 : (rank <= 10 ? 10 : 5);
    const kwBonus = Math.min(10, Math.max(1, serpKeywords) * 2);
    serpFactor = rankBonus + kwBonus;
  }

  let ageFactor = 0;
  if (domainAgeDays != null && domainAgeDays > 0) {
    if (domainAgeDays <= 365) ageFactor = 15;
    else if (domainAgeDays <= 730) ageFactor = 10;
    else if (domainAgeDays <= 1095) ageFactor = 5;
  } else if (arbitrageScore > 0) {
    ageFactor = Math.min(15, arbitrageScore * 0.15);
  }

  const productMultiplier = isProduct ? 0.5 : 1.0;
  const rawScore = (p2pFactor + velocityFactor + serpFactor + ageFactor) * productMultiplier;
  const conviction_score = Number(Math.min(100, Math.max(0, rawScore)).toFixed(1));

  let convergence_tier = 'UNCONVERGED';
  if (pillars >= 3 && conviction_score >= 70) {
    convergence_tier = 'HIGH_CONVICTION_QUAD_PILLAR';
  } else if (pillars >= 2 && conviction_score >= 45) {
    convergence_tier = 'CONVERGENT_DUAL_PILLAR';
  } else if (pillars >= 1 && conviction_score >= 20) {
    convergence_tier = 'EMERGING_SINGLE_PILLAR';
  }

  return {
    conviction_score,
    pillar_convergence_count: pillars,
    convergence_tier,
    p2p_factor: Number(p2pFactor.toFixed(1)),
    velocity_factor: Number(velocityFactor.toFixed(1)),
    serp_factor: Number(serpFactor.toFixed(1)),
    age_factor: Number(ageFactor.toFixed(1))
  };
}

/**
 * Hydration jump detector specifically for repin telemetry.
 * Flags 0 -> >= 10 repin jumps and skeleton-to-lifetime jumps where repins spike >= 4x
 * (or <100 -> >=500) while saves remain relatively flat.
 */
export function isRepinHydrationJump(prev, curr) {
  if (!prev || !curr) return false;
  const pRepins = typeof prev === 'number' ? prev : Number(prev.repin_count ?? prev.repins ?? prev.baselineRepins ?? prev.prev_repins ?? 0);
  const cRepins = typeof curr === 'number' ? curr : Number(curr.repin_count ?? curr.repins ?? curr.currentRepins ?? curr.cur_repins ?? 0);
  const pSaves = typeof prev === 'object' ? Number(prev.save_count ?? prev.saves ?? prev.baselineSaves ?? prev.prev_saves ?? 0) : 0;
  const cSaves = typeof curr === 'object' ? Number(curr.save_count ?? curr.saves ?? curr.currentSaves ?? curr.cur_saves ?? 0) : 0;

  if (!Number.isFinite(pRepins) || !Number.isFinite(cRepins)) return false;

  const rawRepinDelta = Math.max(0, cRepins - pRepins);
  if (rawRepinDelta === 0) return false;

  if (isMultiStageHydrationJump(prev, curr)) {
    return true;
  }

  // 1. Unhydrated 0-repin baseline jumping to >= 10 repins
  if (pRepins <= 0 && cRepins >= 10) return true;

  // 2. Skeleton-to-lifetime repin hydration jump (e.g., 48 -> 2248 while saves move minimally)
  const rawSaveDelta = Math.max(0, cSaves - pSaves);
  if (pRepins > 0 && cRepins >= pRepins * 4 && rawRepinDelta >= 200 && rawSaveDelta < rawRepinDelta * 0.15) {
    return true;
  }
  if (pRepins > 0 && pRepins < 100 && cRepins >= 500 && rawSaveDelta < rawRepinDelta * 0.25) {
    return true;
  }

  return false;
}

/**
 * Calculates algorithmic velocity acceleration combining:
 * 1. Anscombe variance-stabilizing transformation for Poisson noise: A(x) = 2 * sqrt(x + 3/8)
 * 2. 6-day prior baseline Laplace smoothing with kappa = 5
 * 3. Repin and comment leading indicator boost
 * 4. Half-life age decay
 *
 * Supports both object call: calculateVelocityAcceleration(pinObject)
 * and positional call: calculateVelocityAcceleration(currentVelocity, gains7dOrPriorVel, options)
 *
 * @param {object|number} pinOrCurrentVel
 * @param {number} [maybeGains7dOrPriorVel=null]
 * @param {object} [maybeOptions={}]
 * @returns {number} Rounded acceleration score
 */
export function calculateVelocityAcceleration(pinOrCurrentVel, maybeGains7dOrPriorVel = null, maybeOptions = {}) {
  return _computeVelocityTelemetry(pinOrCurrentVel, maybeGains7dOrPriorVel, maybeOptions).acceleration_score;
}

/**
 * In-memory trajectory sanitizer for Pin Dossier payloads.
 * Preserves authentic historical save counts and computes clean daily save velocity:
 * MAX(0, (curr_saves - prev_saves) / days_diff)
 */
// [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 2: Pin Dossier Trajectory Sanitizer
export function sanitizeDossierTrajectory(dossier) {
  if (!dossier || typeof dossier !== 'object') return dossier;
  const traj = Array.isArray(dossier.daily_trajectory)
    ? dossier.daily_trajectory
    : (Array.isArray(dossier.trajectory) ? dossier.trajectory : (Array.isArray(dossier.snapshots) ? dossier.snapshots : null));
  if (!Array.isArray(traj) || traj.length === 0) return dossier;

  const chrono = [...traj].sort((a, b) => {
    const dCmp = String(a.snapshot_date || '').slice(0, 10).localeCompare(String(b.snapshot_date || '').slice(0, 10));
    if (dCmp !== 0) return dCmp;
    const tA = String(a.recorded_at || a.updated_at || a.crawled_at || '');
    const tB = String(b.recorded_at || b.updated_at || b.crawled_at || '');
    return tA.localeCompare(tB);
  });

  if (chrono[0]) {
    if (chrono[0].is_hydration_jump === undefined) {
      chrono[0].is_hydration_jump = false;
    }
    chrono[0].is_baseline = true;
    chrono[0].daily_save_velocity = 0;
    chrono[0].window_24h_velocity = 0;
    chrono[0].window_24h_delta = 0;
  }

  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1];
    const curr = chrono[i];
    curr.is_hydration_jump = false;
    curr.velocity_mode = 'normal';
    const currDayStr = String(curr.snapshot_date || '').slice(0, 10);
    const prevDayStr = String(prev.snapshot_date || '').slice(0, 10);
    const isSameDayStep = Boolean(currDayStr && prevDayStr && currDayStr === prevDayStr);
    const currDate = new Date(currDayStr);
    const prevDate = new Date(prevDayStr);
    const elapsed = Math.max(1, Math.round((currDate - prevDate) / 86400000));
    const diff = Number(curr.save_count || 0) - Number(prev.save_count || 0);

    let priorCalSnap = null;
    for (let j = i - 1; j >= 0; j--) {
      const candDayStr = String(chrono[j].snapshot_date || '').slice(0, 10);
      if (candDayStr && candDayStr < currDayStr) {
        priorCalSnap = chrono[j];
        break;
      }
    }

    const isJump = isMultiStageHydrationJump(prev, curr) || (priorCalSnap && isMultiStageHydrationJump(priorCalSnap, curr));
    if (isJump) {
      curr.is_hydration_jump = true;
      curr.velocity_mode = 'hydration_jump';
      curr.step_save_delta = 0;
      curr.daily_save_velocity = 0;
      curr.window_24h_velocity = 0;
      curr.window_24h_delta = 0;
    } else {
      curr.step_save_delta = diff;
      if (Number(prev.save_count || 0) > 0) {
        curr.daily_save_velocity = diff <= 0 ? 0 : Math.round((diff / elapsed) * 10) / 10;
      } else {
        curr.daily_save_velocity = 0;
      }

      if (priorCalSnap && Number(priorCalSnap.save_count || 0) > 0) {
        const calElapsed = Math.max(1, Math.round((currDate - new Date(String(priorCalSnap.snapshot_date || '').slice(0, 10))) / 86400000));
        const calDiff = Math.max(0, Number(curr.save_count || 0) - Number(priorCalSnap.save_count || 0));
        curr.window_24h_delta = calDiff;
        curr.window_24h_velocity = Math.round((calDiff / calElapsed) * 10) / 10;
        if (isSameDayStep) {
          curr.daily_save_velocity = curr.window_24h_velocity;
        }
      } else {
        curr.window_24h_delta = Math.max(0, diff);
        curr.window_24h_velocity = curr.daily_save_velocity;
      }
    }
  }

  for (const day of chrono) {
    if (Array.isArray(day.ranking_keywords)) {
      for (const kw of day.ranking_keywords) {
        const rawRank = Number(kw.rank_position ?? kw.rank ?? kw.live_serp_rank);
        const hasPos = Number.isFinite(rawRank) && rawRank >= 1;
        if (!hasPos) {
          kw.is_displaced = true;
          const fallback = Number(kw.vault_rank || kw.last_known_rank || kw.rank || 1) || 1;
          kw.last_known_rank = fallback;
          kw.vault_rank = fallback;
          kw.rank = fallback;
          kw.live_serp_rank = null;
        } else if (kw.is_displaced) {
          kw.vault_rank = Number(kw.vault_rank || kw.last_known_rank || rawRank) || 1;
          kw.live_serp_rank = null;
        } else {
          kw.live_serp_rank = rawRank;
          kw.vault_rank = null;
          kw.rank = rawRank;
        }
      }
    }
  }

  const desc = [...chrono].reverse();
  if (Array.isArray(dossier.daily_trajectory)) dossier.daily_trajectory = desc;
  if (Array.isArray(dossier.trajectory)) dossier.trajectory = desc;
  if (Array.isArray(dossier.snapshots)) dossier.snapshots = desc;
  if (dossier.creative && desc[0]) {
    dossier.creative.save_count = Number(dossier.creative.save_count || desc[0].save_count || 0);
    const trajVel = Number(desc[0].window_24h_velocity ?? desc[0].daily_save_velocity ?? 0);
    const creativeFallbackVel = Number(dossier.creative.daily_save_velocity || 0);
    const creativeSaves = Number(dossier.creative.save_count || 0);
    if (dossier.creative._trajectoryStale24h) {
      dossier.creative.daily_save_velocity = 0;
    } else if (chrono.length === 1 && trajVel === 0 && creativeFallbackVel > 0 && (creativeSaves <= 0 || creativeFallbackVel < creativeSaves)) {
      dossier.creative.daily_save_velocity = creativeFallbackVel;
    } else {
      dossier.creative.daily_save_velocity = Number(desc[0].window_24h_velocity ?? desc[0].daily_save_velocity ?? dossier.creative.daily_save_velocity ?? 0);
    }
  }
  return dossier;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes authentic rolling save gains (5d, 7d, 10d, 15d) and daily velocity from snapshot history.
 * Enforces strict time-span gates so short-lived pins NEVER clone 1-2 day deltas into 7d/10d/15d windows:
 * - `actualSpanDays >= Math.ceil(windowDays * 0.6)` (>= 3d for 5d, >= 5d for 7d, >= 6d for 10d, >= 9d for 15d)
 * - `Math.abs(snapDaysAgo - windowDays) <= Math.ceil(windowDays * 0.4)`
 *
 * @param {Array<object>} snapshots - Ordered or unordered snapshot array (`recorded_date` or `snapshot_date`)
 * @param {Date|string|null} [refDate=null] - Optional reference date (defaults to latest snapshot date)
 * @returns {object} { daily_save_velocity, delta_saves_24h, daily_repin_velocity, delta_repins_24h, gains_5d, gains_7d, gains_10d, gains_15d }
 */
export function calculateRollingGainsFromSnapshots(snapshots, refDate = null) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      daily_save_velocity: null,
      delta_saves_24h: null,
      daily_repin_velocity: null,
      delta_repins_24h: null,
      gains_5d: null,
      gains_7d: null,
      gains_10d: null,
      gains_15d: null
    };
  }

  const byDayMap = new Map();
  for (const s of snapshots) {
    if (!s) continue;
    const rawDate = s.recorded_date ?? s.snapshot_date;
    if (!rawDate) continue;
    if (s.save_count === null || s.save_count === undefined) continue;
    const dStr = rawDate instanceof Date
      ? (isNaN(rawDate.getTime()) ? '' : rawDate.toISOString().slice(0, 10))
      : String(rawDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;
    const savesNum = Number(s.save_count);
    if (!Number.isFinite(savesNum)) continue;
    const repinsNum = s.repin_count != null && Number.isFinite(Number(s.repin_count)) ? Number(s.repin_count) : null;
    const prev = byDayMap.get(dStr);
    if (!prev) {
      byDayMap.set(dStr, { ...s, snapshot_date: dStr, save_count: savesNum, repin_count: repinsNum });
    } else {
      byDayMap.set(dStr, {
        ...prev,
        ...s,
        snapshot_date: dStr,
        save_count: Math.max(savesNum, Number(prev.save_count || 0)),
        repin_count: repinsNum !== null
          ? (prev.repin_count !== null ? Math.max(repinsNum, prev.repin_count) : repinsNum)
          : prev.repin_count,
        daily_save_velocity: Math.max(Number(s.daily_save_velocity || 0), Number(prev.daily_save_velocity || 0))
      });
    }
  }

  const sorted = Array.from(byDayMap.values()).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  if (sorted.length < 2) {
    return {
      daily_save_velocity: null,
      delta_saves_24h: null,
      daily_repin_velocity: null,
      delta_repins_24h: 0,
      gains_5d: null,
      gains_7d: null,
      gains_10d: null,
      gains_15d: null
    };
  }

  const latest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const currentSaves = Number(latest.save_count || 0);
  const currentRepins = latest.repin_count != null ? Number(latest.repin_count) : null;

  const latestDayMs = Date.parse(`${latest.snapshot_date}T00:00:00Z`);
  const oldestDayMs = Date.parse(`${oldest.snapshot_date}T00:00:00Z`);
  const actualSpanDays = Math.max(0, Math.round((latestDayMs - oldestDayMs) / 86400000));

  let anchorDayMs = latestDayMs;
  let stalenessDays = 0;
  if (refDate != null) {
    const refObj = refDate instanceof Date ? refDate : new Date(refDate);
    if (!isNaN(refObj.getTime())) {
      const refUtcMs = Date.UTC(refObj.getUTCFullYear(), refObj.getUTCMonth(), refObj.getUTCDate());
      stalenessDays = Math.max(0, Math.round((refUtcMs - latestDayMs) / 86400000));
      anchorDayMs = Math.max(refUtcMs, latestDayMs);
    }
  }

  const isFresh = refDate == null || stalenessDays <= 2;
  let daily_save_velocity = 0;
  let delta_saves_24h = 0;
  let daily_repin_velocity = 0;
  let delta_repins_24h = 0;

  if (isFresh) {
    const prior = sorted[1];
    const prevSaves = prior.save_count != null ? Number(prior.save_count) : null;
    const prevRepins = prior.repin_count != null ? Number(prior.repin_count) : null;
    const priorDayMs = Date.parse(`${prior.snapshot_date}T00:00:00Z`);
    const daysDiff = Math.max(1, Math.round((latestDayMs - priorDayMs) / 86400000));
    const isJump = isMultiStageHydrationJump(prior, latest);
    const isRepinJump = isJump || isRepinHydrationJump(prior, latest);

    if (prevSaves !== null && prevSaves > 0 && currentSaves >= prevSaves && !isJump) {
      delta_saves_24h = Math.min(25000, Math.round((currentSaves - prevSaves) / daysDiff));
      daily_save_velocity = Math.min(25000, Math.round(((currentSaves - prevSaves) / daysDiff) * 100) / 100);
    }

    if (isRepinJump) {
      delta_repins_24h = 0;
      daily_repin_velocity = 0;
    } else if (prevRepins !== null && prevRepins > 0 && currentRepins !== null && currentRepins >= prevRepins) {
      delta_repins_24h = Math.min(25000, Math.round((currentRepins - prevRepins) / daysDiff));
      daily_repin_velocity = Math.min(25000, Math.round(((currentRepins - prevRepins) / daysDiff) * 100) / 100);
    }
  }

  function getGainsForWindow(windowDays) {
    if (sorted.length < 2 || currentSaves <= 0) return null;
    const minSpanDays = Math.ceil(windowDays * 0.6);
    const maxToleranceDays = Math.ceil(windowDays * 0.4);
    if (actualSpanDays < minSpanDays) return null;
    if (refDate != null && stalenessDays > maxToleranceDays) return null;

    let bestSnap = null;
    let bestSnapDaysAgo = Infinity;
    let minDiff = Infinity;

    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      if (s.save_count == null) continue;
      const sTime = Date.parse(`${s.snapshot_date}T00:00:00Z`);
      if (!Number.isFinite(sTime)) continue;
      const snapDaysAgo = Math.round((anchorDayMs - sTime) / 86400000);
      const diff = Math.abs(snapDaysAgo - windowDays);
      if (diff < minDiff) {
        minDiff = diff;
        bestSnap = s;
        bestSnapDaysAgo = snapDaysAgo;
      }
    }

    if (!bestSnap || Math.abs(bestSnapDaysAgo - windowDays) > maxToleranceDays) {
      return null;
    }

    const baseSaves = Number(bestSnap.save_count || 0);
    if (baseSaves <= 0 && currentSaves > 0) return null;
    if (isMultiStageHydrationJump(bestSnap, latest)) return 0;

    return Math.max(0, currentSaves - baseSaves);
  }

  return {
    daily_save_velocity,
    delta_saves_24h,
    daily_repin_velocity,
    delta_repins_24h,
    gains_5d: getGainsForWindow(5),
    gains_7d: getGainsForWindow(7),
    gains_10d: getGainsForWindow(10),
    gains_15d: getGainsForWindow(15)
  };
}

/**
 * Deterministic IEEE 802.3 CRC32 unsigned 32-bit hash for worker slice partitioning.
 * @param {string} input
 * @returns {number}
 */
export function crc32(input) {
  const str = String(input ?? '');
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc = CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
