/**
 * Pinterest Commercial & Sponsored Ad Pin Detector
 * Extracted from src/modules/keywords/service.mjs
 *
 * Pure leaf module with zero dependencies.
 */

/**
 * Comprehensive Pinterest Ad & Commercial Post Detector
 * Exhaustively checks all nested attributes to prevent sponsored/shopping ad leakage into organic SERPs
 */
export function isCommercialOrAdPin(it) {
  if (!it) return false;
  return Boolean(
    it.is_promoted ||
    it.promoted ||
    it.is_sponsored ||
    it.ad ||
    it.advertiser_name ||
    it.promoter ||
    it.tracking_params?.ad_id ||
    it.tracking_params?.campaign_id ||
    it.attribution?.provider_name === 'ad' ||
    it.type === 'ad' ||
    it.type === 'promoted_pin'
  );
}
