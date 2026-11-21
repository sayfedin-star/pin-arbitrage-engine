/**
 * src/core/pinterest/index.mjs
 *
 * Canonical Unified Barrel for Pinterest Scraping, Parsing & Client Primitives.
 * Pure DAG export hierarchy with zero circular imports and zero static undici imports.
 */

export {
  CANONICAL_FINGERPRINT,
  sanitizeGuestCookie,
  getStandardPinterestHeaders,
  getPinterestHeaders,
  getPinterestXhrHeaders,
  PINTEREST_PAGE_HEADERS,
  randomJitterMs,
  sleep,
  sleepWithJitter,
  exponentialBackoffWithFullJitter,
  parseRetryAfterSeconds,
  CircuitBreakerOpenError,
  PinterestCircuitBreaker,
  globalPinterestCircuitBreaker,
  setDefaultDispatcher,
  getDefaultDispatcher,
  pinterestFetch
} from './client.mjs';

export {
  canonicalizeArticleUrlForCount,
  fetchUrlGlobalSaves,
  resolvePinterestShortlink
} from './urls.mjs';

export {
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE,
  PINTEREST_JSON_API_HEADERS,
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric,
  findPinInTree,
  formatPin,
  extractRelayCompletedPayloads,
  extractPinFromHtml,
  extractPinData,
  fetchPinFromPinResource,
  fetchPinFromPidgets,
  fetchPinsBatchFromPidgets,
  fetchAndExtractPin,
  fetchPinHybrid,
  fetchPinFromPinterest
} from './pins.mjs';

export {
  fetchCreatorLatestPinsPidgets,
  fetchBoardSectionsResource,
  fetchUserProfileUnauth,
  fetchUserResource,
  fetchBoardsResource,
  fetchUserActivityPinsResource,
  fetchBoardFeedResource,
  fetchBoardDetailUnauth
} from './creators.mjs';
