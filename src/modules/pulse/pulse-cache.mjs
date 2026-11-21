/**
 * Global 24-Hour Algorithmic Pulse Cache & Stampede Guard Singletons
 * Extracted from src/modules/pulse/service.mjs
 *
 * Pure leaf module: instantiates `pulseMemoryCache`, `pulseForceRefreshCooldown`,
 * and `inflightPulse` ONCE as process-local singletons.
 */

import { TtlSingleflightCache } from '../../lib/ttl-cache.mjs';

// Bounded Process-Local LRU Cache (max 25 entries, 120s TTL) with Epoch Invalidation
export const PULSE_MEMORY_CACHE_MAX = 25;
export const PULSE_MEMORY_TTL_MS = 120_000;
export const PULSE_MAX_PAYLOAD_BYTES = 900 * 1024; // 900 KB hard wire payload ceiling
export const pulseMemoryCache = new TtlSingleflightCache({
  maxEntries: PULSE_MEMORY_CACHE_MAX,
  defaultTtlMs: PULSE_MEMORY_TTL_MS
});

// Per-key force-refresh cooldown (15s cooldown)
export const PULSE_FORCE_REFRESH_COOLDOWN_MS = 15_000;
export const pulseForceRefreshCooldown = new TtlSingleflightCache({
  maxEntries: 200,
  defaultTtlMs: PULSE_FORCE_REFRESH_COOLDOWN_MS
});

// In-flight deduplication map backed by pulseMemoryCache
export const inflightPulse = pulseMemoryCache.inflight;

/**
 * Invalidate in-memory pulse caches with epoch advancement so pre-invalidation
 * in-flight queries never write stale results back into `pulseMemoryCache`.
 */
export async function invalidateGlobalPulseCache(_env = null, _ctx = null) {
  pulseMemoryCache.invalidate();
  pulseForceRefreshCooldown.invalidate();
}
