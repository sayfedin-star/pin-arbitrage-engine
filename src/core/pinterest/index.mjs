/**
 * src/core/pinterest/index.mjs
 *
 * Canonical Unified Barrel for Pinterest Scraping, Parsing & Client Primitives.
 * Eliminates reverse dependency from src/ -> scripts/lib/pinterest.mjs.
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
  CircuitBreakerOpenError,
  PinterestCircuitBreaker,
  globalPinterestCircuitBreaker,
  PinterestClient,
  defaultPinterestClient,
  setDefaultDispatcher,
  getDefaultDispatcher,
  pinterestFetch,
  parseRetryAfterSeconds
} from './client.mjs';

export {
  MAX_METRIC_CAP,
  PINTEREST_CEILING_VALUE,
  sanitizeDestinationUrl,
  normalizeDomain,
  safeString,
  parseCleanMetric,
  findPinInTree,
  extractPinFromHtml,
  fetchAndExtractPin
} from '../pinterest-parser.mjs';

export {
  canonicalizeArticleUrlForCount,
  fetchUrlGlobalSaves,
  resolvePinterestShortlink
} from './urls.mjs';

export {
  fetchPinsBatchFromPidgets,
  formatPin,
  extractPinData,
  fetchPinFromPinResource,
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
