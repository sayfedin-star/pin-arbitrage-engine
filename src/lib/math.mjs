/**
 * Mathematical & Algorithmic Telemetry Utilities
 * Single Source of Truth (SSOT) for Pin Arbitrage Engine (PAE)
 */

/**
 * Calculates time-normalized daily save velocity between two snapshot dates.
 * [INVARIANT: UTC-MIDNIGHT-NORMALIZED-VELOCITY]
 *
 * Normalizes elapsed time to pure UTC calendar days (midnight-to-midnight)
 * to prevent intraday hour bias and bot-farm spikes.
 *
 * @param {object} params
 * @param {number|string} params.currentSaves - Current confirmed saves count
 * @param {number|string} params.baselineSaves - Previous baseline saves count
 * @param {Date|string|number} [params.currentDate] - Current crawl date / timestamp
 * @param {Date|string|number} [params.baselineDate] - Previous baseline snapshot date
 * @param {number} [params.maxCap=25000] - Bot-spike sanity cap
 * @returns {number} Daily save velocity (saves/day)
 */
export function calculateDailyVelocity({
  currentSaves = 0,
  baselineSaves = 0,
  currentDate = new Date(),
  baselineDate = null,
  maxCap = 25000
}) {
  const curSavesNum = Number(currentSaves);
  const baseSavesNum = Number(baselineSaves);

  // Anti-NaN guard
  if (!Number.isFinite(curSavesNum) || !Number.isFinite(baseSavesNum)) {
    return 0;
  }

  const rawDelta = Math.max(0, curSavesNum - baseSavesNum);
  if (rawDelta === 0) return 0;
  if (!baselineDate) return Math.min(rawDelta, maxCap);

  try {
    const curD = currentDate instanceof Date ? currentDate : new Date(currentDate);
    const baseD = baselineDate instanceof Date ? baselineDate : new Date(baselineDate);

    if (isNaN(curD.getTime()) || isNaN(baseD.getTime())) {
      return Math.min(rawDelta, maxCap);
    }

    // Pure UTC Calendar Day normalization (midnight-to-midnight)
    const curUtcMidnight = Date.UTC(curD.getUTCFullYear(), curD.getUTCMonth(), curD.getUTCDate());
    const baseUtcMidnight = Date.UTC(baseD.getUTCFullYear(), baseD.getUTCMonth(), baseD.getUTCDate());

    const msDiff = curUtcMidnight - baseUtcMidnight;
    const daysElapsed = Math.max(1, Math.round(msDiff / 86400000));

    const velocity = Math.round((rawDelta / daysElapsed) * 10) / 10;
    return Math.min(Math.max(0, velocity), maxCap);
  } catch (_) {
    return Math.min(rawDelta, maxCap);
  }
}
