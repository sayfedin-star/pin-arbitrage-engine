/**
 * [COMPATIBILITY-SHIM] PinArchive & Topic Intelligence Service
 * Re-exports all functions from the unified Creator Hub service (src/modules/creators/service.mjs).
 * Preserves zero-breakage backward compatibility across all existing modules, scripts, and crons.
 * 
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
 * // [INVARIANT: ONE-WAY-PROMOTION]
 */

export * from '../creators/service.mjs';
