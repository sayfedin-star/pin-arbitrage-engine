/**
 * Mathematical & Algorithmic Telemetry Utilities
 * Single Source of Truth (SSOT) for Pin Arbitrage Engine (PAE)
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
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
export function detectHydrationJump(params) {
  if (!params || typeof params !== 'object') return false;
  const curSaves = Number(params.currentSaves ?? 0);
  const prevSaves = Number(params.baselineSaves ?? 0);
  const curRepins = Number(params.currentRepins ?? params.repinCount ?? 0);
  const prevRepins = Number(params.baselineRepins ?? params.repinCount ?? 0);
  const repinCount = Number(params.repinCount ?? curRepins ?? prevRepins ?? 0);

  if (!Number.isFinite(curSaves) || !Number.isFinite(prevSaves)) return false;

  const rawDelta = Math.max(0, curSaves - prevSaves);
  if (rawDelta === 0) return false;

  // 1. prev.save_count === 0 && curr.save_count > 0
  if (prevSaves === 0 && curSaves > 0) return true;

  // 1B. Medium pin hydration jump guard: unhydrated stub (wasDeepHydrated === false) with curSaves >= 30,
  // or low prior saves (prevSaves < 10 && curSaves >= 100)
  if (params.wasDeepHydrated === false && curSaves >= 30) return true;
  if (prevSaves < 10 && curSaves >= 100) return true;

  // 2. prev.save_count < prev.repin_count
  if (prevSaves > 0 && prevRepins > 0 && prevSaves < prevRepins) return true;

  // 2B. Repin-Baseline Fingerprint Guard:
  // If baselineSaves matches repinCount (or within ±3% / ±50 of repinCount) AND currentSaves - baselineSaves >= 100:
  // Recognize this as a Repin-to-Save Hydration Gap (total_saves - repin_count), NOT a 24h organic gain!
  const targetRepins = repinCount > 0 ? repinCount : (curRepins > 0 ? curRepins : prevRepins);
  if (targetRepins > 0 && prevSaves > 0 && curSaves > prevSaves) {
    const repinDiff = Math.abs(prevSaves - targetRepins);
    const repinTolerance = Math.max(50, targetRepins * 0.03);
    if (repinDiff <= repinTolerance && (curSaves - prevSaves) >= 100) {
      return true;
    }
  }

  // 3. Repin-to-Save Hydration Jump: prevSaves was equal/close to prevRepins OR curRepins (within 3% or 5 saves),
  // while curSaves jumped by >= 15% (and rawDelta >= 50) above that repin baseline
  const refRepins = prevRepins > 0 ? prevRepins : curRepins;
  if (
    prevSaves > 0 &&
    refRepins > 0 &&
    Math.abs(prevSaves - refRepins) <= Math.max(5, Math.round(refRepins * 0.03)) &&
    curSaves > prevSaves * 1.15 &&
    (curSaves - prevSaves) >= 50
  ) {
    return true;
  }
  if (prevRepins > 0 && prevSaves === prevRepins && curSaves > prevRepins * 1.35) return true;

  // 4. prev.repin_count === 0 && curr.repin_count >= 25 && curSaves >= prevSaves * 2.5
  if (prevRepins === 0 && curRepins >= 25 && curSaves >= prevSaves * 2.5) return true;

  // 5. prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500
  if (prevSaves > 0 && (curSaves / prevSaves) >= 4.0 && (curSaves - prevSaves) >= 2500) return true;

  // 6. Legacy guard: rawDelta > 2000 when prevSaves < 500 and (prevSaves === 0 or cur / prev > 20)
  if (rawDelta > 2000 && prevSaves < 500 && (prevSaves === 0 || (curSaves / Math.max(1, prevSaves)) > 20)) return true;

  return false;
}

/**
 * Calculates time-normalized daily save velocity between two snapshot dates.
 * [INVARIANT: UTC-MIDNIGHT-NORMALIZED-VELOCITY]
 *
 * Normalizes elapsed time to pure UTC calendar days (midnight-to-midnight)
 * to prevent intraday hour bias, NaN poisoning, and lifetime-save velocity spikes.
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
    repinCount = 0,
    currentDate = new Date(),
    baselineDate = null,
    maxCap = 25000,
    createdAt = null,
    wasDeepHydrated = undefined
  } = params;

  const curSavesNum = Number(currentSaves);
  const baseSavesNum = Number(baselineSaves);
  const curRepinsNum = Number(currentRepins);
  const baseRepinsNum = Number(baselineRepins);
  const repinCountNum = Number(repinCount || currentRepins || baselineRepins || 0);
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
  // Repin-Baseline Fingerprint Guard:
  // If baselineSaves matches repinCount (or within ±3% / ±5 saves of repinCount) AND currentSaves jumped by >= 15% (and >= 50 saves):
  // Recognize this as a Repin-to-Save Hydration Gap (total_saves - repin_count), NOT a 24h organic gain!
  const refRepinsNum = baseRepinsNum > 0 ? baseRepinsNum : (curRepinsNum > 0 ? curRepinsNum : repinCountNum);
  if (
    baseSavesNum > 0 &&
    refRepinsNum > 0 &&
    Math.abs(baseSavesNum - refRepinsNum) <= Math.max(5, Math.round(refRepinsNum * 0.03)) &&
    curSavesNum > baseSavesNum * 1.15 &&
    (curSavesNum - baseSavesNum) >= 50
  ) {
    return 0;
  }
  if (repinCountNum > 0 && baseSavesNum > 0 && curSavesNum > baseSavesNum) {
    const repinDiff = Math.abs(baseSavesNum - repinCountNum);
    const repinTolerance = Math.max(50, repinCountNum * 0.03);
    if (repinDiff <= repinTolerance && (curSavesNum - baseSavesNum) >= 100) {
      return 0;
    }
  }

  // Eliminate unhydrated 0-baseline jumps & multi-stage hydration artifacts:
  const isHydrationJump = detectHydrationJump({
    currentSaves: curSavesNum,
    baselineSaves: baseSavesNum,
    currentRepins: curRepinsNum,
    baselineRepins: baseRepinsNum,
    repinCount: repinCountNum,
    wasDeepHydrated: wasDeepHydrated ?? params.wasDeepHydrated
  });

  if (isHydrationJump) {
    // If jump was specifically caused by a Repin-to-Save hydration transition, return 0 (no organic delta)
    if (
      baseSavesNum > 0 &&
      refRepinsNum > 0 &&
      Math.abs(baseSavesNum - refRepinsNum) <= Math.max(5, Math.round(refRepinsNum * 0.03))
    ) {
      return 0;
    }
    if (createdAt) {
      const createdD = createdAt instanceof Date ? createdAt : new Date(createdAt);
      if (!isNaN(createdD.getTime())) {
        const curD = currentDate instanceof Date ? currentDate : new Date(currentDate);
        const lifetimeMs = Math.max(0, (curD.getTime() - createdD.getTime()));
        const lifetimeDays = lifetimeMs / 86400000;
        // Age-bounded: if age < 2 days, suppress to 0 to prevent fake velocity division spikes (+69582.7/d)
        if (lifetimeDays >= 2) {
          const lifetimeVelocity = Math.round((curSavesNum / lifetimeDays) * 10) / 10;
          return Math.min(lifetimeVelocity, capNum);
        }
      }
    }
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
