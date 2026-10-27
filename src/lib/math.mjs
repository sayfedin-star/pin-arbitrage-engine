/**
 * Mathematical & Algorithmic Telemetry Utilities
 * Single Source of Truth (SSOT) for Pin Arbitrage Engine (PAE)
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 */

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
 * @param {Date|string|number} [params.currentDate] - Current crawl date / timestamp
 * @param {Date|string|number} [params.baselineDate] - Previous baseline snapshot date
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
    currentDate = new Date(),
    baselineDate = null,
    maxCap = 25000,
    createdAt = null
  } = params;

  const curSavesNum = Number(currentSaves);
  const baseSavesNum = Number(baselineSaves);
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
  // Eliminate unhydrated 0-baseline jumps:
  // A save delta > 2000 when baseline saves < 500 and (baseline = 0 or current / baseline > 20)
  // indicates an unhydrated stub pin suddenly receiving its true lifetime saves.
  const isHydrationJump = rawDelta > 2000 && (
    baseSavesNum < 500 && (baseSavesNum === 0 || (curSavesNum / Math.max(1, baseSavesNum)) > 20)
  );

  if (isHydrationJump) {
    if (createdAt) {
      const createdD = createdAt instanceof Date ? createdAt : new Date(createdAt);
      if (!isNaN(createdD.getTime())) {
        const curD = currentDate instanceof Date ? currentDate : new Date(currentDate);
        const lifetimeMs = Math.max(86400000, (curD.getTime() - createdD.getTime()));
        const lifetimeDays = Math.max(1, Math.round(lifetimeMs / 86400000));
        const lifetimeVelocity = Math.round((curSavesNum / lifetimeDays) * 10) / 10;
        return Math.min(lifetimeVelocity, capNum);
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
