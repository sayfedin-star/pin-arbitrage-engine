/**
 * Pinterest Predictive Autocomplete & Typeahead Resource Service
 *
 * Implements:
 * - AdvancedTypeaheadResource fetching with unauthenticated browser headers
 * - Bounded True LRU + Singleflight Cache (`TtlSingleflightCache`, max 500 entries, 15m TTL)
 *
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 */

import { getStandardPinterestHeaders, pinterestFetch } from '../../core/pinterest/index.mjs';
import { TtlSingleflightCache } from '../../lib/ttl-cache.mjs';

const TYPEAHEAD_CACHE_MAX = 500;
const TYPEAHEAD_TTL_MS = 15 * 60 * 1000;
const typeaheadCache = new TtlSingleflightCache({
  maxEntries: TYPEAHEAD_CACHE_MAX,
  defaultTtlMs: TYPEAHEAD_TTL_MS
});

/**
 * Fetch predictive autocomplete suggestions from Pinterest.
 * Protected with in-flight request coalescing and True LRU cache (15 min TTL, 500 items max).
 * Wave 6E: Separates mixed user account results (e.g. `type: 'user'`) into `accounts[]`
 * so creator handles never pollute keyword suggestions, and supports optional `fetchImpl`.
 */
export async function fetchKeywordTypeahead(term, options = {}) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { success: true, term: cleanTerm, suggestions: [], accounts: [] };
  }

  const customFetch = typeof options?.fetchImpl === 'function' ? options.fetchImpl : null;
  const count = Math.max(5, Math.min(25, Number(options?.count) || 12));

  const performFetch = async () => {
    const dataParam = encodeURIComponent(JSON.stringify({
      options: {
        term: cleanTerm,
        count,
        pin_type: 'all'
      },
      context: {}
    }));
    const sourceUrl = encodeURIComponent(`/search/pins/?q=${encodeURIComponent(cleanTerm)}`);
    const url = `https://www.pinterest.com/resource/AdvancedTypeaheadResource/get/?source_url=${sourceUrl}&data=${dataParam}`;

    const headers = getStandardPinterestHeaders({
      referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTerm)}`,
      extraHeaders: {
        'x-pinterest-pws-handler': 'www/search/pins.js'
      }
    });

    let res;
    try {
      const fetcher = customFetch || pinterestFetch;
      res = await fetcher(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return { success: false, term: cleanTerm, suggestions: [], accounts: [], error: `Pinterest Typeahead HTTP ${res.status}` };
      }

      const data = await res.json();
      const rawQueries = data?.resource_response?.data?.items || data?.resource_response?.data?.queries || [];

      const suggestionsSet = new Set();
      const accountsMap = new Map();

      for (const q of rawQueries) {
        if (!q) continue;
        if (typeof q === 'string') {
          const text = q.trim();
          if (text) suggestionsSet.add(text);
          continue;
        }
        const itemType = String(q.type || q.result_type || '').trim().toLowerCase();
        const isUserResult =
          itemType === 'user' ||
          itemType === 'pinner' ||
          itemType === 'profile' ||
          (Boolean(q.username) && !q.query && !q.clean_query);

        if (isUserResult) {
          const username = String(q.username || q.id || '').trim().replace(/^@+/, '').toLowerCase();
          if (username && !accountsMap.has(username)) {
            accountsMap.set(username, {
              username,
              full_name: String(q.full_name || q.label || q.name || username).trim(),
              image_url: String(q.image_medium_url || q.image_small_url || q.image_url || '').trim() || null,
              profile_url: `https://www.pinterest.com/${encodeURIComponent(username)}/`,
              verified: Boolean(q.verified_identity || q.is_verified_merchant)
            });
          }
          continue;
        }

        const text = String(q.query || q.clean_query || q.label || '').trim();
        if (text) suggestionsSet.add(text);
      }

      return {
        success: true,
        term: cleanTerm,
        suggestions: Array.from(suggestionsSet),
        accounts: Array.from(accountsMap.values())
      };
    } catch (err) {
      console.warn(`[!] fetchKeywordTypeahead error for "${cleanTerm}":`, err.message);
      return { success: false, term: cleanTerm, suggestions: [], accounts: [], error: err.message };
    } finally {
      if (res?.body && !res.bodyUsed) {
        await res.body.cancel().catch(() => {});
      }
    }
  };

  if (customFetch || options?.bypassCache) {
    const fresh = await performFetch();
    return { ...fresh, cached: false };
  }

  const { value, cached } = await typeaheadCache.getOrFetchWithMeta(
    cleanTerm,
    performFetch,
    { shouldCache: (val) => Boolean(val?.success) }
  );

  if (!value?.success) {
    return value;
  }
  return { ...value, cached };
}
