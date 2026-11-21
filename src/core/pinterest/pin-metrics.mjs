/**
 * src/core/pinterest/pin-metrics.mjs
 *
 * Leaf module for Pinterest Pin URL sanitization, domain normalization,
 * profile username extraction, metric ceiling constants (10M+ sentinel), and numeric parsing.
 */

import { CANONICAL_FINGERPRINT } from './client.mjs';
import { normalizeCleanDomain } from '../../domain/pin-intelligence.mjs';

export const PINTEREST_JSON_API_HEADERS = {
  'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.pinterest.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site'
};

export const PIDGETS_ZERO_COOKIE_HEADERS = {
  'User-Agent': CANONICAL_FINGERPRINT.USER_AGENT,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const RESERVED_PINTEREST_PROFILE_SLUGS = new Set([
  'pin', 'pins', 'ideas', 'search', 'today', 'explore', 'business',
  'about', 'settings', 'login', 'logout', 'signup', 'resource', '_', 'categories'
]);

export function extractUsernameFromProfileUrl(profileUrl, explicitUsername = '') {
  const cleanExplicit = String(explicitUsername || '').replace(/^@+/, '').trim().toLowerCase();
  if (cleanExplicit && !RESERVED_PINTEREST_PROFILE_SLUGS.has(cleanExplicit)) {
    return cleanExplicit;
  }
  const rawUrl = String(profileUrl || '').trim();
  if (!rawUrl) return '';
  try {
    const pathname = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? new URL(rawUrl).pathname
      : rawUrl;
    const firstSeg = pathname.split('/').filter(Boolean)[0] || '';
    const cleanSeg = firstSeg.replace(/^@+/, '').trim().toLowerCase();
    if (cleanSeg && /^[a-z0-9_.-]{2,64}$/i.test(cleanSeg) && !RESERVED_PINTEREST_PROFILE_SLUGS.has(cleanSeg)) {
      return cleanSeg;
    }
  } catch (_) {}
  return '';
}

export const MAX_METRIC_CAP = 10000000; // 10 Million
export const PINTEREST_CEILING_VALUE = 10000001; // 10M+ unauthenticated ceiling indicator

/**
 * Normalizes a Pinterest reach/views metric against transient 0 drops and the
 * unauthenticated 10,000,001 (10M+) ceiling cap using ordered historical baselines.
 *
 * @param {number|string|null|undefined} rawValue
 * @param {...(number|string|null|undefined)} baselines
 * @returns {number}
 */
export function normalizeCeilingMetric(rawValue, ...baselines) {
  const raw = Number(rawValue || 0);
  const validRaw = Number.isFinite(raw) ? raw : 0;
  let resolved = validRaw > 0 ? validRaw : 0;

  for (const b of baselines) {
    const prev = Number(b || 0);
    if (!Number.isFinite(prev) || prev <= 0) continue;
    if (resolved <= 0) {
      resolved = prev;
    } else if (validRaw === PINTEREST_CEILING_VALUE && prev > PINTEREST_CEILING_VALUE && resolved <= PINTEREST_CEILING_VALUE) {
      resolved = prev;
    }
  }
  return resolved;
}

/**
 * Computes a reach/views delta while suppressing false spikes/drops caused by the
 * unauthenticated 10,000,001 (10M+) ceiling sentinel.
 *
 * @param {number|string|null|undefined} currentValue
 * @param {number|string|null|undefined} baselineValue
 * @param {number|string|null|undefined} [rawValue=currentValue]
 * @returns {number}
 */
export function sanitizeCeilingDelta(currentValue, baselineValue, rawValue = currentValue) {
  const curr = Number(currentValue || 0);
  const base = Number(baselineValue || 0);
  const raw = Number(rawValue ?? curr);
  if (!Number.isFinite(curr) || !Number.isFinite(base) || curr <= 0 || base <= 0) return 0;
  if (raw === PINTEREST_CEILING_VALUE || (base === PINTEREST_CEILING_VALUE && curr > PINTEREST_CEILING_VALUE)) {
    return 0;
  }
  return curr - base;
}

/**
 * Suppresses a persisted delta that originated from jumping off the 10,000,001 ceiling sentinel.
 *
 * @param {number|string|null|undefined} metricValue
 * @param {number|string|null|undefined} deltaValue
 * @returns {number}
 */
export function sanitizeStoredCeilingDelta(metricValue, deltaValue) {
  const metric = Number(metricValue || 0);
  const delta = Number(deltaValue || 0);
  if (!Number.isFinite(metric) || !Number.isFinite(delta)) return 0;
  if (metric > PINTEREST_CEILING_VALUE && (metric - delta) === PINTEREST_CEILING_VALUE) {
    return 0;
  }
  return delta;
}

/**
 * Sanitizes destination URLs while preserving tracking parameters.
 */
export function sanitizeDestinationUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    url = `https://${url}`;
  }
  return url.replace(/[\u0000\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Normalizes domains into clean root domains without www.
 * Thin preset alias delegating to canonical `normalizeCleanDomain` SSOT.
 */
export function normalizeDomain(rawDomain, rawUrl = '') {
  return normalizeCleanDomain(rawDomain, {
    fallbackUrl: rawUrl && typeof rawUrl === 'string' && !rawUrl.startsWith('http') ? `https://${rawUrl}` : rawUrl,
    defaultFallback: 'uploaded by user'
  });
}

/**
 * Safe string trimmer removing null bytes and control chars.
 */
export function safeString(val) {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'string') str = val;
  else if (typeof val === 'number' || typeof val === 'boolean') str = String(val);
  else if (typeof val === 'object') {
    if (typeof val.text === 'string') str = val.text;
    else if (typeof val.title === 'string') str = val.title;
    else if (typeof val.name === 'string') str = val.name;
    else if (typeof val.description === 'string') str = val.description;
  }
  if (!str) return '';
  return str.replace(/[\u0000\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Robust numeric parser with 10M+ ceiling protection and NaN immunity.
 *
 * @param {any} val
 * @param {number|null} [fallback=0]
 * @param {object} [options]
 * @param {number} [options.cap=10000000]
 * @param {boolean} [options.preserveCeiling=false]
 * @returns {number|null}
 */
export function parseCleanMetric(val, fallback = 0, options = {}) {
  const { cap = MAX_METRIC_CAP, preserveCeiling = false } = options;
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val) || typeof val === 'boolean') return fallback;

  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return fallback;
    const rounded = Math.max(0, Math.round(val));
    if (preserveCeiling && rounded === PINTEREST_CEILING_VALUE) return PINTEREST_CEILING_VALUE;
    return cap ? Math.min(cap, rounded) : rounded;
  }

  if (typeof val === 'object') {
    if (typeof val.count === 'number' || typeof val.count === 'string') return parseCleanMetric(val.count, fallback, options);
    if (typeof val.value === 'number' || typeof val.value === 'string') return parseCleanMetric(val.value, fallback, options);
    return fallback;
  }

  let s = String(val).replace(/,/g, '').trim().toLowerCase();
  if (!s || s === 'nan' || s === 'infinity' || s === '-infinity') return fallback;

  // Handle 10M+ ceiling notation
  const hasTrailingPlus = s.endsWith('+');
  if (hasTrailingPlus) {
    s = s.slice(0, -1).trim();
  }

  if (s.endsWith('m')) {
    const num = parseFloat(s.slice(0, -1));
    if (isNaN(num) || !isFinite(num)) return fallback;
    const computed = Math.max(0, Math.round(num * 1000000));
    if (hasTrailingPlus && computed === 10000000 && preserveCeiling) {
      return PINTEREST_CEILING_VALUE;
    }
    return cap ? Math.min(cap, computed) : computed;
  }

  if (s.endsWith('k')) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, Math.round(num * 1000));
  }

  const num = Number(s);
  if (isNaN(num) || !isFinite(num)) return fallback;
  const rounded = Math.max(0, Math.round(num));
  if (preserveCeiling && (rounded === PINTEREST_CEILING_VALUE || (hasTrailingPlus && rounded === MAX_METRIC_CAP))) {
    return PINTEREST_CEILING_VALUE;
  }
  return cap ? Math.min(cap, rounded) : rounded;
}
