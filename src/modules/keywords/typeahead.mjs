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
 */
export async function fetchKeywordTypeahead(term) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { success: true, term: cleanTerm, suggestions: [] };
  }

  const { value, cached } = await typeaheadCache.getOrFetchWithMeta(
    cleanTerm,
    async () => {
      const dataParam = encodeURIComponent(JSON.stringify({
        options: {
          term: cleanTerm,
          count: 12,
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
        res = await pinterestFetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
          return { success: false, term: cleanTerm, suggestions: [], error: `Pinterest Typeahead HTTP ${res.status}` };
        }

        const data = await res.json();
        const rawQueries = data?.resource_response?.data?.items || data?.resource_response?.data?.queries || [];

        const suggestions = rawQueries
          .map((q) => {
            if (!q) return null;
            if (typeof q === 'string') return q.trim();
            return (q.query || q.label || q.clean_query || '').trim();
          })
          .filter(Boolean);

        return { success: true, term: cleanTerm, suggestions };
      } catch (err) {
        console.warn(`[!] fetchKeywordTypeahead error for "${cleanTerm}":`, err.message);
        return { success: false, term: cleanTerm, suggestions: [], error: err.message };
      } finally {
        if (res?.body && !res.bodyUsed) {
          await res.body.cancel().catch(() => {});
        }
      }
    },
    { shouldCache: (val) => Boolean(val?.success) }
  );

  if (!value?.success) {
    return value;
  }
  return { ...value, cached };
}
