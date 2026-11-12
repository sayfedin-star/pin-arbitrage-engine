/**
 * src/core/pinterest/urls.mjs
 *
 * Pinterest Destination URL Canonicalization, Global Save Counter (urls/count.json),
 * and pin.it Shortlink Redirect Resolver.
 */

import { sanitizeDestinationUrl } from '../pinterest-parser.mjs';
import { PINTEREST_PAGE_HEADERS, getDefaultDispatcher, pinterestFetch } from './client.mjs';

/**
 * Canonicalizes destination article URLs specifically for api.pinterest.com/v1/urls/count.json
 * Guarantees clean string-indexed key matching on Pinterest, defusing the 100% UTM Poisoning Trap.
 */
export function canonicalizeArticleUrlForCount(rawUrl) {
  const sanitized = sanitizeDestinationUrl(rawUrl);
  if (!sanitized) return '';
  try {
    const decoded = sanitized
      .replace(/&amp;/gi, '&')
      .replace(/&#x26;/gi, '&')
      .replace(/&#38;/gi, '&');
    const parsed = new URL(decoded);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    const trackingParams = new Set([
      'fbclid', 'gclid', 'yclid', 'mc_cid', 'mc_eid', '_gl', 'pin_it', 'epik', 'ref', 'sref', 'share'
    ]);
    for (const key of [...parsed.searchParams.keys()]) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('utm_') || trackingParams.has(lowerKey)) {
        parsed.searchParams.delete(key);
      }
    }

    let res = parsed.toString();
    if (res.endsWith('?')) res = res.slice(0, -1);
    return res;
  } catch (_) {
    return sanitized;
  }
}

/**
 * Queries the global Pinterest save counter for any article destination URL via urls/count.json
 * Defuses 100% UTM Poisoning Trap via deep URL canonicalization.
 * Unpacks JSONP callback receiveCount({...}) safely via regex.
 *
 * @param {string} rawUrl - Target article URL
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, url: string, count: number, error?: string }>}
 */
export async function fetchUrlGlobalSaves(rawUrl, options = {}) {
  const cleanUrl = canonicalizeArticleUrlForCount(rawUrl);
  if (!cleanUrl) {
    return { ok: false, url: '', count: 0, error: 'invalid_url' };
  }
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 8000;

  try {
    const endpoint = `https://api.pinterest.com/v1/urls/count.json?url=${encodeURIComponent(cleanUrl)}`;
    const res = await pinterestFetch(endpoint, {
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: false, url: cleanUrl, count: 0, status: res.status, error: `http_${res.status}` };
    }

    const text = await res.text();
    const match = text.match(/receiveCount\(\s*(\{[\s\S]*\})\s*\)/);
    let count = 0;
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        count = Number(parsed.count || 0);
        return { ok: true, url: cleanUrl, count: Number.isFinite(count) ? count : 0 };
      } catch (_) {}
    }

    try {
      const parsed = JSON.parse(text);
      count = Number(parsed.count || 0);
      return { ok: true, url: cleanUrl, count: Number.isFinite(count) ? count : 0 };
    } catch (_) {}

    return { ok: false, url: cleanUrl, count: 0, error: 'jsonp_parse_failed' };
  } catch (err) {
    return { ok: false, url: cleanUrl, count: 0, error: err.message };
  }
}

/**
 * Resolves pin.it obfuscated shortlinks via direct HTTP redirect inspection
 * Extracts canonical Pin ID from Location header in <170ms without browser rendering.
 *
 * @param {string} inputUrlOrSlug - pin.it URL or alphanumeric shortlink slug
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, pin_id: string|null, resolved_url: string, slug: string, error?: string }>}
 */
export async function resolvePinterestShortlink(inputUrlOrSlug, options = {}) {
  const raw = String(inputUrlOrSlug || '').trim();
  if (!raw) {
    return { ok: false, pin_id: null, resolved_url: '', slug: '', error: 'invalid_shortlink' };
  }

  const slugMatch = raw.match(/pin\.it\/([a-zA-Z0-9_-]+)/i);
  let cleanSlug = slugMatch ? slugMatch[1] : raw.replace(/^https?:\/\//i, '').replace(/^pin\.it\//i, '').split('/')[0].split('?')[0].trim();
  if (!cleanSlug) {
    return { ok: false, pin_id: null, resolved_url: '', slug: '', error: 'invalid_shortlink' };
  }

  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const timeoutMs = options.timeoutMs || 6000;
  const endpoint = `https://api.pinterest.com/url_shortener/${encodeURIComponent(cleanSlug)}/redirect/`;

  try {
    const res = await pinterestFetch(endpoint, {
      method: 'GET',
      headers: {
        ...PINTEREST_PAGE_HEADERS,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher
    });

    const location = res.headers.get('location') || '';
    if (res.body) await res.body.cancel().catch(() => {});

    if (location) {
      const pinMatch = location.match(/\/pin\/(\d+)\//);
      if (pinMatch && pinMatch[1]) {
        return {
          ok: true,
          pin_id: pinMatch[1],
          resolved_url: location,
          slug: cleanSlug
        };
      }
      return { ok: true, pin_id: null, resolved_url: location, slug: cleanSlug };
    }
    return { ok: false, pin_id: null, resolved_url: '', slug: cleanSlug, error: 'no_redirect_location' };
  } catch (err) {
    return { ok: false, pin_id: null, resolved_url: '', slug: cleanSlug, error: err.message };
  }
}
