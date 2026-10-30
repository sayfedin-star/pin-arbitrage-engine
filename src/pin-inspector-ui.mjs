/**
 * src/pin-inspector-ui.mjs
 *
 * Pin Inspector & HD Media Waterfall Subsystem
 * Implements 3-tier HD media waterfall (/1200x/ default + @error /736x/ fallback + /originals/ lossless download),
 * global article saves hydration, and virality breakout ratio computation.
 */

export function resolveHdImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.replace(/\/(236x|474x|564x|736x)\//, '/1200x/');
}

export function resolveLosslessImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.replace(/\/(236x|474x|564x|736x|1200x)\//, '/originals/');
}

export function computeViralityRatio(globalSaves, pinSaves) {
  const g = Number(globalSaves || 0);
  const p = Math.max(1, Number(pinSaves || 0));
  return (g / p).toFixed(1);
}

export function isAlphaBreakout(globalSaves, pinSaves, threshold = 5.0) {
  return Number(computeViralityRatio(globalSaves, pinSaves)) >= threshold;
}

export function getViralityBadgeHtml(globalSaves, pinSaves) {
  const ratio = computeViralityRatio(globalSaves, pinSaves);
  if (Number(ratio) < 5.0) return '';
  return `<span class="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">[${ratio}x Alpha Breakout]</span>`;
}
