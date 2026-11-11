/**
 * Central Canonical Pinterest Client Fingerprint & Headers Parity Module
 * 
 * Re-exports canonical client fingerprinting and headers from src/core/pinterest-client.mjs
 * Enforces 100% Client-Hints and Fingerprint Parity across all scrapers & workers:
 * - Synchronizes Chrome Major Version (131) between User-Agent and Sec-Ch-Ua
 * - Synchronizes X-App-Version hash to modern verified web hash (9302641)
 * - Guarantees zero Akamai / Cedexis bot fingerprint anomaly detection
 */

export {
  CANONICAL_FINGERPRINT,
  getStandardPinterestHeaders,
  getPinterestHeaders,
  PINTEREST_PAGE_HEADERS,
  getPinterestXhrHeaders,
  sanitizeGuestCookie
} from '../../core/pinterest-client.mjs';
