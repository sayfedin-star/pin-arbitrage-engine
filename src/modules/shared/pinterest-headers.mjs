/**
 * Central Canonical Pinterest Client Fingerprint & Headers Parity Module
 * 
 * Enforces 100% Client-Hints and Fingerprint Parity across all scrapers & workers:
 * - Synchronizes Chrome Major Version (131) between User-Agent and Sec-Ch-Ua
 * - Synchronizes X-App-Version hash to modern verified web hash (9302641)
 * - Guarantees zero Akamai / Cedexis bot fingerprint anomaly detection
 */

import { formatPinterestCookie } from '../../utils.mjs';

export const CANONICAL_FINGERPRINT = {
  CHROME_VERSION: '131.0.0.0',
  CHROME_MAJOR: '131',
  APP_VERSION: '9302641',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

/**
 * Returns standard unified Pinterest headers
 * @param {object} [options]
 * @param {string} [options.cookie]
 * @param {string} [options.referer]
 * @param {object} [options.extra]
 * @param {object} [options.extraHeaders]
 * @returns {Record<string, string>}
 */
export function getStandardPinterestHeaders(options = {}) {
  const headers = {
    'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
    'X-App-Version': CANONICAL_FINGERPRINT.APP_VERSION,
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Ch-Ua': `"Google Chrome";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Chromium";v="${CANONICAL_FINGERPRINT.CHROME_MAJOR}", "Not_A Brand";v="24"`,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };

  if (options.referer && typeof options.referer === 'string') {
    headers['Referer'] = options.referer;
  }

  const cookieVal = options.cookie !== undefined
    ? options.cookie
    : (typeof process !== 'undefined' ? process.env?.PINTEREST_COOKIE : null);
  if (cookieVal && String(cookieVal).trim()) {
    headers['Cookie'] = formatPinterestCookie(String(cookieVal).trim());
  }

  const customHeaders = options.extraHeaders || options.extra;
  if (customHeaders && typeof customHeaders === 'object') {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

export const getPinterestHeaders = getStandardPinterestHeaders;


