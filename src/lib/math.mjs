/**
 * Mathematical & Algorithmic Telemetry Utilities
 * Single Source of Truth (SSOT) for Pin Arbitrage Engine (PAE)
 */

/**
 * Detects multi-stage hydration jumps where unhydrated or stub pin records
 * receive lifetime metric backfills, preventing astronomical velocity spikes.
 * [INVARIANT: ANTI-HYDRATION-SPIKE]
 *
 * Flag isHydrationJump = true whenever ANY of the following holds:
 * 1. prev.save_count === 0 && curr.save_count > 0
 * 2. prev.save_count < prev.repin_count
 * 3. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
 * 4. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= prev.save_count * 2.5
 * 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
 * 6. Legacy: rawDelta > 2000 when prev.save_count < 500 and (prev.save_count = 0 or curr / prev > 20)
 *
 * @param {object} params
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
    if (params.prev || params.curr) {
      curSaves = Number(params.curr?.save_count ?? params.curr?.saves ?? params.curr?.currentSaves ?? 0);
      prevSaves = Number(params.prev?.save_count ?? params.prev?.saves ?? params.prev?.baselineSaves ?? 0);
      curRepins = Number(params.curr?.repin_count ?? params.curr?.repins ?? params.curr?.currentRepins ?? 0);
      prevRepins = Number(params.prev?.repin_count ?? params.prev?.repins ?? params.prev?.baselineRepins ?? 0);
    } else {
      curSaves = Number(params.currentSaves ?? params.save_count ?? params.curr_saves ?? params.currSaves ?? 0);
      prevSaves = Number(params.baselineSaves ?? params.prev_saves ?? params.prevSaves ?? params.base_saves ?? 0);
      curRepins = Number(params.currentRepins ?? params.repin_count ?? params.curr_repins ?? params.curRepins ?? 0);
      prevRepins = Number(params.baselineRepins ?? params.prev_repins ?? params.prevRepins ?? params.base_repins ?? 0);
    }
  } else {
    return false;
  }

  if (!Number.isFinite(curSaves) || !Number.isFinite(prevSaves)) return false;

  const rawDelta = Math.max(0, curSaves - prevSaves);
  if (rawDelta === 0) return false;

  // [INVARIANT: ANTI-HYDRATION-SPIKE]
  // 1. prev.save_count <= 0 && curr.save_count > 0
  if (prevSaves <= 0 && curSaves > 0) {
    return true;
  }

  // 2. prev.save_count < prev.repin_count
  if (prevRepins > 0 && prevSaves < prevRepins) {
    return true;
  }

  // 3. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
  const effCurRepins = curRepins > 0 ? curRepins : prevRepins;
  if (prevRepins > 0 && prevSaves === prevRepins && curSaves > effCurRepins * 1.35) {
    return true;
  }

  // 4. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= prev.save_count * 2.5
  if (prevRepins === 0 && curRepins >= 25 && curSaves >= prevSaves * 2.5) {
    return true;
  }

  // 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
  if (prevSaves > 0 && (curSaves / prevSaves) >= 4.0 && (curSaves - prevSaves) >= 2500) {
    return true;
  }

  // 6. Legacy: rawDelta > 2000 when prev.save_count < 500 and (prev.save_count <= 0 or curr / prev > 20)
  if (rawDelta > 2000 && prevSaves < 500 && (prevSaves <= 0 || (curSaves / Math.max(1, prevSaves)) > 20)) {
    return true;
  }

  return false;
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
 * Flags transitions where unhydrated stub records receive historical lifetime metric backfills.
 */
export function isMultiStageHydrationJump(prev, curr) {
  if (!prev || !curr) return false;
  const pSaves = typeof prev === 'number' ? prev : Number(prev.save_count ?? prev.saves ?? prev.baselineSaves ?? prev.prev_saves ?? 0);
  const cSaves = typeof curr === 'number' ? curr : Number(curr.save_count ?? curr.saves ?? curr.currentSaves ?? curr.cur_saves ?? 0);
  const pRepins = typeof prev === 'object' ? Number(prev.repin_count ?? prev.repins ?? prev.baselineRepins ?? prev.prev_repins ?? 0) : 0;
  const cRepins = typeof curr === 'object' ? Number(curr.repin_count ?? curr.repins ?? curr.currentRepins ?? curr.cur_repins ?? 0) : 0;

  if (!Number.isFinite(pSaves) || !Number.isFinite(cSaves)) return false;

  const rawDelta = Math.max(0, cSaves - pSaves);
  if (rawDelta === 0) return false;

  // 1. prev.save_count <= 0 && curr.save_count > 0
  if (pSaves <= 0 && cSaves > 0) return true;

  // 2. prev.save_count < prev.repin_count
  if (pRepins > 0 && pSaves < pRepins) return true;

  // 3. prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35
  const effCurRepins = cRepins > 0 ? cRepins : pRepins;
  if (pRepins > 0 && pSaves === pRepins && cSaves > effCurRepins * 1.35) return true;

  // 4. prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= pSaves * 2.5
  if (pRepins === 0 && cRepins >= 25 && cSaves >= pSaves * 2.5) return true;

  // 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
  if (pSaves > 0 && (cSaves / pSaves) >= 4.0 && (cSaves - pSaves) >= 2500) return true;

  // 6. Legacy: rawDelta > 2000 when prev.save_count < 500 and (prev.save_count <= 0 or curr / prev > 20)
  if (rawDelta > 2000 && pSaves < 500 && (pSaves <= 0 || (cSaves / Math.max(1, pSaves)) > 20)) return true;

  return false;
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

  if (typeof prev === 'object' && typeof curr === 'object' && isMultiStageHydrationJump(prev, curr)) {
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

  if (chrono[0] && chrono[0].is_hydration_jump === undefined) {
    chrono[0].is_hydration_jump = false;
  }
  if (chrono.length === 1 && chrono[0]) {
    const cSaves = Number(chrono[0].save_count || 0);
    const cVel = Number(chrono[0].daily_save_velocity || 0);
    if (cSaves > 0 && cVel >= cSaves) {
      chrono[0].daily_save_velocity = 0;
      chrono[0].window_24h_velocity = 0;
      chrono[0].window_24h_delta = 0;
    }
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
    if (chrono.length === 1 && trajVel === 0 && creativeFallbackVel > 0 && (creativeSaves <= 0 || creativeFallbackVel < creativeSaves)) {
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
