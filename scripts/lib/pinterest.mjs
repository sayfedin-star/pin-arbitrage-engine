/**
 * scripts/lib/pinterest.mjs
 *
 * Backward-Compatible CLI Script Façade.
 * Re-exports the canonical implementation from src/core/pinterest/index.mjs.
 * Zero static imports of `undici` are permitted here or in src/core/pinterest/.
 */

export * from '../../src/core/pinterest/index.mjs';
