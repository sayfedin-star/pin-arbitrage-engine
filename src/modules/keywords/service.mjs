/**
 * Keyword Velocity & SERP Tracker Service
 *
 * Pure Barrel with explicit named re-exports matching the exact original 33-symbol public surface.
 * Strict DAG (zero cycles):
 *   ad-filter.mjs (leaf), displaced-and-tombstones.mjs (leaf), analytics.mjs, settings.mjs, typeahead.mjs
 *   <- serp-dossier-service.mjs, folders-crud.mjs, serp-crawler.mjs
 *   <- service.mjs (pure Barrel)
 */

export { isCommercialOrAdPin } from './ad-filter.mjs';

export {
  computeVacuumOpportunityScore,
  getKeywordDisplacedPins,
  ignoreAndRemoveSerpPin
} from './displaced-and-tombstones.mjs';

export { crawlKeywordSERP } from './serp-crawler.mjs';

export {
  listKeywords,
  fetchVisualSearchLens,
  getKeywordPins,
  getKeywordGuides,
  getKeywordSERPComparison,
  getKeywordIntelligence,
  getPinPerformanceTrajectory,
  getPinDeepDossier
} from './serp-dossier-service.mjs';

export {
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle,
  calculateMedian,
  calculateKeywordIntelligenceSummary
} from './analytics.mjs';

export {
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug,
  getEffectivePinterestCookie,
  savePinterestCookie,
  DEFAULT_PINTEREST_SESSION_COOKIE,
  MIN_SERP_QUOTA,
  MAX_SERP_QUOTA,
  DEFAULT_SERP_QUOTA,
  clampSerpQuota,
  computePagesForQuota,
  resolveEffectiveSerpQuota
} from './settings.mjs';

export { fetchKeywordTypeahead } from './typeahead.mjs';
