/**
 * src/core/pinterest/pins.mjs
 *
 * Pure Barrel for Pinterest Pin Telemetry Extraction, 48-Field Normalization,
 * Strict Guest Scraping, Hybrid PinResource Fallback, and Batch Pidgets Ingestion.
 * Strict linear DAG: pin-fetchers -> pin-html-extractor -> pin-formatter -> pin-metrics (leaf).
 */

export {
  PINTEREST_JSON_API_HEADERS,
  PIDGETS_ZERO_COOKIE_HEADERS,
  extractUsernameFromProfileUrl,
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE,
  normalizeCeilingMetric,
  sanitizeCeilingDelta,
  sanitizeStoredCeilingDelta,
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric
} from './pin-metrics.mjs';

export {
  findPinInTree,
  formatPin
} from './pin-formatter.mjs';

export {
  extractRelayCompletedPayloads,
  extractPinFromHtml,
  extractPinData
} from './pin-html-extractor.mjs';

export {
  fetchPinFromPinResource,
  fetchPinFromPidgets,
  fetchPinsBatchFromPidgets,
  fetchAndExtractPin,
  fetchPinHybrid,
  fetchPinFromPinterest
} from './pin-fetchers.mjs';
