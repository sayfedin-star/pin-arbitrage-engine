/**
 * Pinterest Predictive Autocomplete & Typeahead Resource Service
 *
 * Implements:
 * - AdvancedTypeaheadResource fetching with unauthenticated browser headers
 * - In-Memory True LRU Cache (max 500 entries, 15-minute TTL)
 * - Singleflight Stampede Protection (coalesces duplicate in-flight requests)
 *
 * // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
 */

// In-Memory True LRU Cache for Pinterest Typeahead (max 500 entries, 15m TTL)
const typeaheadCache = new Map();
const inflightTypeahead = new Map();
const TYPEAHEAD_CACHE_MAX = 500;
const TYPEAHEAD_TTL_MS = 15 * 60 * 1000;

/**
 * Fetch predictive autocomplete suggestions from Pinterest.
 * Protected with in-flight request coalescing and True LRU cache (15 min TTL, 500 items max).
 */
export async function fetchKeywordTypeahead(term) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { success: true, term: cleanTerm, suggestions: [] };
  }

  const now = Date.now();

  // 1. Check in-memory True LRU cache
  const cached = typeaheadCache.get(cleanTerm);
  if (cached) {
    if (now - cached.timestamp < TYPEAHEAD_TTL_MS) {
      // Re-insert to refresh LRU access order
      typeaheadCache.delete(cleanTerm);
      typeaheadCache.set(cleanTerm, cached);
      return { success: true, term: cleanTerm, suggestions: cached.suggestions, cached: true };
    } else {
      typeaheadCache.delete(cleanTerm); // Evict expired
    }
  }

  // 2. Coalesce in-flight requests for the exact same term (stampede protection)
  if (inflightTypeahead.has(cleanTerm)) {
    return await inflightTypeahead.get(cleanTerm);
  }

  const requestPromise = (async () => {
    // Active pruning if cache is approaching limit
    if (typeaheadCache.size >= TYPEAHEAD_CACHE_MAX) {
      for (const [key, val] of typeaheadCache.entries()) {
        if (now - val.timestamp >= TYPEAHEAD_TTL_MS) {
          typeaheadCache.delete(key);
        }
      }
      while (typeaheadCache.size >= TYPEAHEAD_CACHE_MAX) {
        const oldestKey = typeaheadCache.keys().next().value;
        typeaheadCache.delete(oldestKey);
      }
    }

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

    const headers = {
      'Accept': 'application/json, text/javascript, */*, q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'x-pinterest-pws-handler': 'www/search/pins.js',
      'referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(cleanTerm)}`
    };

    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return { success: false, term: cleanTerm, suggestions: [], error: `Pinterest Typeahead HTTP ${res.status}` };
      }

      const data = await res.json();
      const rawQueries = data?.resource_response?.data?.items || data?.resource_response?.data?.queries || [];

      const suggestions = rawQueries
        .map(q => {
          if (!q) return null;
          if (typeof q === 'string') return q.trim();
          return (q.query || q.label || q.clean_query || '').trim();
        })
        .filter(Boolean);

      // Save to LRU cache
      typeaheadCache.set(cleanTerm, { suggestions, timestamp: Date.now() });

      return { success: true, term: cleanTerm, suggestions, cached: false };
    } catch (err) {
      console.warn(`[!] fetchKeywordTypeahead error for "${cleanTerm}":`, err.message);
      return { success: false, term: cleanTerm, suggestions: [], error: err.message };
    } finally {
      if (res?.body && !res.bodyUsed) {
        await res.body.cancel().catch(() => {});
      }
    }
  })();

  inflightTypeahead.set(cleanTerm, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inflightTypeahead.delete(cleanTerm);
  }
}
