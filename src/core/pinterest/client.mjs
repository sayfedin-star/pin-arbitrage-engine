/**
 * src/core/pinterest/client.mjs
 *
 * Canonical Pinterest HTTP Client & Dispatcher Bridge.
 * Maintains zero static dependency on `undici` so Cloudflare Workers Edge bundles remain lightweight.
 */

import {
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
  setDefaultDispatcher as coreSetDefaultDispatcher,
  getDefaultDispatcher as coreGetDefaultDispatcher,
  pinterestFetch as corePinterestFetch,
  PinterestClient,
  defaultPinterestClient
} from '../pinterest-client.mjs';

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
  defaultPinterestClient
};

let defaultDispatcher = null;

export function setDefaultDispatcher(dispatcher) {
  defaultDispatcher = dispatcher;
  coreSetDefaultDispatcher(dispatcher);
}

export function getDefaultDispatcher() {
  return defaultDispatcher || coreGetDefaultDispatcher();
}

export async function pinterestFetch(url, init = {}) {
  const dispatcher = init.dispatcher || defaultDispatcher || coreGetDefaultDispatcher();
  return corePinterestFetch(url, { ...init, dispatcher });
}

export function parseRetryAfterSeconds(headerValue, defaultSec = 3) {
  if (!headerValue) return defaultSec;
  const num = parseInt(headerValue, 10);
  if (!isNaN(num) && num > 0) return num;
  const parsedDate = Date.parse(headerValue);
  if (!isNaN(parsedDate)) {
    const diff = Math.ceil((parsedDate - Date.now()) / 1000);
    return diff > 0 ? diff : defaultSec;
  }
  return defaultSec;
}
