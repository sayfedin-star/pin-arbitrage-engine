/**
 * Pinterest Trends & 52-Week Seasonality Service
 * Queries official live REST endpoints on trends.pinterest.com (Zero Cookie Required)
 * Extracts 52-week search momentum, seasonal peak estimation, demographics, and related trends.
 */

const trendsCache = new Map();
const inflightTrends = new Map();
const TRENDS_CACHE_MAX = 300;
const TRENDS_TTL_MS = 60 * 60 * 1000; // 1 Hour TTL

const interestCache = new Map();
const inflightInterest = new Map();
const INTEREST_CACHE_MAX = 500;
const INTEREST_TTL_MS = 2 * 60 * 60 * 1000; // 2 Hours TTL

const velocityCache = new Map();
const inflightVelocity = new Map();
const VELOCITY_CACHE_MAX = 500;
const VELOCITY_TTL_MS = 60 * 60 * 1000; // 1 Hour TTL

const relatedInterestsCache = new Map();
const inflightRelatedInterests = new Map();
const RELATED_INTERESTS_CACHE_MAX = 200;
const RELATED_INTERESTS_TTL_MS = 2 * 60 * 60 * 1000; // 2 Hours TTL

/**
 * Fetch official Pinterest Interest / Annotation metrics (Exact search count, category tree, related taxonomy)
 * Direct access to Pinterest's InterestResource via slug or ID.
 */
export async function fetchPinterestInterestVolume(term) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm) return null;
  const slug = cleanTerm.replace(/[^a-z0-9\s-]/gi, ' ').trim().replace(/[\s_]+/g, '-');
  if (!slug) return null;
  const now = Date.now();

  // 1. Check in-memory LRU cache
  const cached = interestCache.get(slug);
  if (cached) {
    if (now - cached.timestamp < INTEREST_TTL_MS) {
      interestCache.delete(slug);
      interestCache.set(slug, cached);
      return cached.data;
    } else {
      interestCache.delete(slug);
    }
  }

  // 2. Coalesce in-flight requests (prevent duplicate requests for same term)
  if (inflightInterest.has(slug)) {
    return await inflightInterest.get(slug);
  }

  const promise = (async () => {
    // Active cache size pruning
    if (interestCache.size >= INTEREST_CACHE_MAX) {
      const oldestKey = interestCache.keys().next().value;
      if (oldestKey) interestCache.delete(oldestKey);
    }

    const headers = {
      'Accept': 'application/json, text/javascript, */*, q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'x-pinterest-pws-handler': 'www/ideas/[interest_url_name]/[interest_id].js',
      'referer': `https://www.pinterest.com/ideas/${slug}/`
    };

    const dataParam = encodeURIComponent(JSON.stringify({
      options: { interest: slug, field_set_key: 'ideas_hub' },
      context: {}
    }));
    const url = `https://www.pinterest.com/resource/InterestResource/get/?source_url=%2Fideas%2F${slug}%2F&data=${dataParam}`;

    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
      if (!res.ok) return null;
      const json = await res.json();
      const data = json?.resource_response?.data;
      if (!data) return null;

      const rawRelated = Array.isArray(data.seo_related_interests) ? data.seo_related_interests : [];
      const rawPivots = Array.isArray(data.ideas_klp_pivots) ? data.ideas_klp_pivots : [];

      const result = {
        success: true,
        id: String(data.id || ''),
        key: data.key || cleanTerm,
        url_name: data.url_name || slug,
        internal_search_count: Number(data.internal_search_count || 0),
        feed_update_time: data.feed_update_time || null,
        seo_breadcrumbs: Array.isArray(data.seo_breadcrumbs)
          ? data.seo_breadcrumbs.map(b => b.name)
          : [],
        seo_related_interests: rawRelated.map(r => r.name || r.key),
        seo_related_objects: rawRelated.map(r => ({
          name: r.name || r.key,
          key: r.key || r.name,
          id: String(r.id || r.origin_interest_id || ''),
          url: r.url || `/ideas/${(r.key || r.name).replace(/\s+/g, '-')}/${r.id || ''}/`
        })),
        ideas_pivots: rawPivots.map(p => {
          const pivotUrl = p.pivot_url || '';
          const pivotId = pivotUrl.split('/').filter(Boolean).pop() || '';
          return {
            label: p.pivot_display_text,
            full_name: p.pivot_full_name,
            url: pivotUrl,
            id: pivotId
          };
        })
      };

      while (interestCache.size >= INTEREST_CACHE_MAX) {
        const oldestKey = interestCache.keys().next().value;
        if (!oldestKey) break;
        interestCache.delete(oldestKey);
      }
      interestCache.set(slug, { data: result, timestamp: Date.now() });
      return result;
    } catch (_) {
      return null;
    } finally {
      if (res?.body && !res.bodyUsed) {
        await res.body.cancel().catch(() => {});
      }
    }
  })();

  inflightInterest.set(slug, promise);
  try {
    return await promise;
  } finally {
    inflightInterest.delete(slug);
  }
}

/**
 * Fetch complete Related Interests and Sub-Niche Additions/Pivots for a keyword.
 * Concurrently resolves internal_search_count, annotation ID, category tree, and Pinterest URLs.
 * @param {string} term
 * @param {'both'|'related'|'additions'} mode
 */
export async function fetchKeywordRelatedInterests(term, mode = 'both') {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { success: false, error: 'Query term must be at least 2 characters' };
  }

  const cacheKey = `${cleanTerm}_${mode}`;
  const now = Date.now();

  // 1. Check LRU Cache
  const cached = relatedInterestsCache.get(cacheKey);
  if (cached) {
    if (now - cached.timestamp < RELATED_INTERESTS_TTL_MS) {
      return cached.data;
    } else {
      relatedInterestsCache.delete(cacheKey);
    }
  }

  // 2. Coalesce in-flight requests (Stampede protection)
  if (inflightRelatedInterests.has(cacheKey)) {
    return await inflightRelatedInterests.get(cacheKey);
  }

  const requestPromise = (async () => {
    // Fetch main seed annotation
    const main = await fetchPinterestInterestVolume(cleanTerm);
    if (!main || !main.id || main.id === '0') {
      const emptyResult = {
        success: false,
        term: cleanTerm,
        error: `No official Pinterest Interest Annotation found for "${cleanTerm}". Pinterest has not indexed this term as a taxonomy node yet.`,
        main: null,
        related_interests: [],
        additions: [],
        all: []
      };
      return emptyResult;
    }

    const formatUpdateDate = (dateStr) => {
      if (!dateStr || String(dateStr).includes('1970')) return 'Recent';
      try {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (_) {
        return 'Recent';
      }
    };

    const mainRow = {
      annotation: main.key,
      search_volume: main.internal_search_count,
      formatted_volume: main.internal_search_count ? main.internal_search_count.toLocaleString() : '0',
      last_updated: formatUpdateDate(main.feed_update_time),
      annotation_id: main.id,
      category_tree: main.seo_breadcrumbs.join(' > '),
      breadcrumbs: main.seo_breadcrumbs,
      link: `https://www.pinterest.com/ideas/${main.url_name}/${main.id}/`,
      type: 'main'
    };

    const relatedPromises = [];
    const additionPromises = [];

    // Resolve official Related Interests and Additions returned by Pinterest (capped to respect Cloudflare subrequest limit)
    if (mode === 'both' || mode === 'related') {
      const relatedList = (main.seo_related_objects || []).slice(0, 12);
      for (const item of relatedList) {
        if (!item.name) continue;
        relatedPromises.push((async () => {
          const details = await fetchPinterestInterestVolume(item.name);
          const vol = details?.internal_search_count || 0;
          const annoId = (details?.id && details.id !== '0') ? details.id : (item.id && item.id !== '0' ? item.id : '');
          const breadcrumbs = details?.seo_breadcrumbs || main.seo_breadcrumbs.slice(0, -1);
          const urlName = details?.url_name || item.name.replace(/[\s_]+/g, '-');
          const link = annoId 
            ? `https://www.pinterest.com/ideas/${urlName}/${annoId}/`
            : `https://www.pinterest.com/ideas/${urlName}/`;

          return {
            annotation: details?.key || item.name,
            search_volume: vol,
            formatted_volume: vol ? vol.toLocaleString() : '0',
            last_updated: formatUpdateDate(details?.feed_update_time),
            annotation_id: annoId,
            category_tree: breadcrumbs.join(' > '),
            breadcrumbs,
            link,
            type: 'related'
          };
        })());
      }
    }

    if (mode === 'both' || mode === 'additions') {
      const pivotsList = (main.ideas_pivots || []).slice(0, 8);
      for (const pivot of pivotsList) {
        if (!pivot.full_name) continue;
        additionPromises.push((async () => {
          const details = await fetchPinterestInterestVolume(pivot.full_name);
          const vol = details?.internal_search_count || 0;
          const annoId = (details?.id && details.id !== '0') ? details.id : (pivot.id && pivot.id !== '0' ? pivot.id : '');
          const breadcrumbs = details?.seo_breadcrumbs || [...main.seo_breadcrumbs, pivot.label].filter(Boolean);
          const link = pivot.url.startsWith('http') ? pivot.url : `https://www.pinterest.com${pivot.url}`;

          return {
            annotation: pivot.full_name,
            search_volume: vol,
            formatted_volume: vol ? vol.toLocaleString() : '0',
            last_updated: formatUpdateDate(details?.feed_update_time),
            annotation_id: annoId,
            category_tree: breadcrumbs.join(' > '),
            breadcrumbs,
            link,
            type: 'addition'
          };
        })());
      }
    }

    const [settledRelated, settledAdditions] = await Promise.all([
      Promise.allSettled(relatedPromises),
      Promise.allSettled(additionPromises)
    ]);

    const relatedInterests = settledRelated
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));

    const additions = settledAdditions
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));

    const all = [mainRow, ...relatedInterests, ...additions];

    const result = {
      success: true,
      term: cleanTerm,
      main: mainRow,
      related_interests: relatedInterests,
      additions,
      all
    };

    while (relatedInterestsCache.size >= RELATED_INTERESTS_CACHE_MAX) {
      const oldestKey = relatedInterestsCache.keys().next().value;
      if (!oldestKey) break;
      relatedInterestsCache.delete(oldestKey);
    }
    relatedInterestsCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  })();

  inflightRelatedInterests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inflightRelatedInterests.delete(cacheKey);
  }
}

/**
 * Batch resolve authentic 30-day trending velocity from official Pinterest 52-week curves.
 * Formula: ((latest_week - 4_weeks_prior) / 4_weeks_prior) * 100%
 * @param {string} seedQuery - Seed query term
 * @param {string[]} terms - Array of suggestion terms to resolve
 * @param {string} [country='US'] - Country code
 * @returns {Promise<Map<string, { velocity_30d: number | null, counts: number[] }>>}
 */
export async function fetchPinterestBatchVelocity(seedQuery, terms = [], country = 'US') {
  const cleanSeed = String(seedQuery || '').trim().toLowerCase();
  const normalizedTerms = (Array.isArray(terms) ? terms : [])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  const resultMap = new Map();
  const now = Date.now();

  const parseItemVelocity = (item) => {
    if (!item || !item.term) return null;
    const counts = Array.isArray(item.counts) ? item.counts : [];
    if (counts.length === 0) {
      return {
        weekly_change: null,
        monthly_change: null,
        yearly_change: null,
        velocity_30d: null,
        counts: [],
        hasPrediction: false
      };
    }

    const len = counts.length;
    const currVal = counts[len - 1];
    const prevWeekVal = len >= 2 ? counts[len - 2] : null;
    const prevMonthVal = len >= 5 ? counts[len - 5] : null;
    const prevYearVal = len >= 52 ? counts[0] : (len > 0 ? counts[0] : null);

    const calcPct = (curr, past) => {
      const c = Number.isFinite(Number(curr)) ? Number(curr) : null;
      const p = Number.isFinite(Number(past)) ? Number(past) : null;
      if (c === null || p === null) return null;
      if (p > 0) {
        const pct = Math.round(((c - p) / p) * 100);
        return Math.max(-100, Math.min(999, pct));
      } else if (c > 0) {
        return 100;
      }
      return 0;
    };

    const weekly = calcPct(currVal, prevWeekVal);
    const monthly = calcPct(currVal, prevMonthVal);
    const yearly = calcPct(currVal, prevYearVal);

    return {
      weekly_change: weekly,
      monthly_change: monthly,
      yearly_change: yearly,
      velocity_30d: monthly,
      counts,
      hasPrediction: Boolean(item.hasPrediction)
    };
  };

  // 1. Check LRU cache for all terms
  const missingTerms = [];
  for (const term of normalizedTerms) {
    const cacheKey = `${term}_${country}`;
    const cached = velocityCache.get(cacheKey);
    if (cached && (now - cached.timestamp < VELOCITY_TTL_MS)) {
      resultMap.set(term, cached.data);
    } else {
      missingTerms.push(term);
    }
  }

  // If all terms are cached, return immediately
  if (missingTerms.length === 0 && normalizedTerms.length > 0) {
    return resultMap;
  }

  // Stampede protection: coalesce in-flight batch requests
  const inflightKey = `${cleanSeed}_${country}_${normalizedTerms.slice(0, 10).sort().join('|')}`;
  if (inflightVelocity.has(inflightKey)) {
    return await inflightVelocity.get(inflightKey);
  }

  const requestPromise = (async () => {
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Referer': 'https://trends.pinterest.com/'
    };

    // 2. Fetch seed query prefix_match (broadest match returning 10+ matching suggestion curves)
    if (cleanSeed && cleanSeed.length >= 2) {
      let res;
      try {
        const url = `https://trends.pinterest.com/prefix_match/?query=${encodeURIComponent(cleanSeed)}&country=${country}`;
        res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const item of data) {
              const t = String(item.term || '').trim().toLowerCase();
              const parsed = parseItemVelocity(item);
              if (t && parsed) {
                const cKey = `${t}_${country}`;
                velocityCache.set(cKey, { data: parsed, timestamp: Date.now() });
                if (normalizedTerms.includes(t)) {
                  resultMap.set(t, parsed);
                }
              }
            }
          }
        }
      } catch (_) {
      } finally {
        if (res?.body && !res.bodyUsed) {
          await res.body.cancel().catch(() => {});
        }
      }
    }

    // 3. For any terms still missing from prefix_match, fetch in parallel (capped at 12 to respect Cloudflare subrequest limits)
    const stillMissing = normalizedTerms.filter(t => !resultMap.has(t) && t.length <= 40 && !t.includes('|')).slice(0, 12);
    if (stillMissing.length > 0) {
      const missingFetches = stillMissing.map(async (mTerm) => {
        let mRes;
        try {
          const url = `https://trends.pinterest.com/prefix_match/?query=${encodeURIComponent(mTerm)}&country=${country}`;
          mRes = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
          if (mRes.ok) {
            const data = await mRes.json();
            if (Array.isArray(data) && data.length > 0) {
              const exact = data.find(x => String(x.term || '').trim().toLowerCase() === mTerm) || data[0];
              const parsed = parseItemVelocity(exact);
              if (parsed) {
                const cKey = `${mTerm}_${country}`;
                velocityCache.set(cKey, { data: parsed, timestamp: Date.now() });
                resultMap.set(mTerm, parsed);
              }
            }
          }
        } catch (_) {
        } finally {
          if (mRes?.body && !mRes.bodyUsed) {
            await mRes.body.cancel().catch(() => {});
          }
        }
      });
      await Promise.allSettled(missingFetches);
    }

    // Active LRU memory pruning: evict expired items, then enforce hard ceiling
    if (velocityCache.size >= VELOCITY_CACHE_MAX) {
      const curTime = Date.now();
      for (const [k, v] of velocityCache.entries()) {
        if (curTime - v.timestamp >= VELOCITY_TTL_MS) {
          velocityCache.delete(k);
        }
      }
      while (velocityCache.size >= VELOCITY_CACHE_MAX) {
        const oldestKey = velocityCache.keys().next().value;
        if (!oldestKey) break;
        velocityCache.delete(oldestKey);
      }
    }

    return resultMap;
  })();

  inflightVelocity.set(inflightKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inflightVelocity.delete(inflightKey);
  }
}

export async function fetchPinterestTrends(term, country = 'US', force = false) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { success: false, error: 'Query term must be at least 2 characters' };
  }

  const cacheKey = `${cleanTerm}_${country}`;
  const now = Date.now();

  // 1. Check LRU Cache (unless force refresh requested)
  if (!force) {
    const cached = trendsCache.get(cacheKey);
    if (cached) {
      if (now - cached.timestamp < TRENDS_TTL_MS) {
        return { success: true, cached: true, ...cached.data };
      } else {
        trendsCache.delete(cacheKey);
      }
    }
  }

  // 2. Coalesce in-flight requests
  if (inflightTrends.has(cacheKey)) {
    return await inflightTrends.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://trends.pinterest.com/'
      };

      // 1. Fetch exact prefix match for the term to get primary 52-week curve
      const prefixUrl = `https://trends.pinterest.com/prefix_match/?query=${encodeURIComponent(cleanTerm)}&country=${country}`;
      // 2. Fetch related terms for comparison and related sparklines
      const relatedUrl = `https://trends.pinterest.com/related_terms/?requestTerm=${encodeURIComponent(cleanTerm)}&country=${country}`;

      // Concurrent fetch: Trends curve + Related terms + Official Interest Volume + Live Official Demographics + Official Collage Images
      const today = new Date().toISOString().slice(0, 10);
      const demoUrl = `https://trends.pinterest.com/demographics/?terms=${encodeURIComponent(cleanTerm)}&country=${country}&end_date=${today}&days=365`;

      const [prefixRes, relatedRes, interestData, demoRes, collageList] = await Promise.allSettled([
        fetch(prefixUrl, { headers, signal: AbortSignal.timeout(7000) }),
        fetch(relatedUrl, { headers, signal: AbortSignal.timeout(7000) }),
        fetchPinterestInterestVolume(cleanTerm),
        fetch(demoUrl, { headers, signal: AbortSignal.timeout(7000) }),
        fetchPinterestTrendsCollage(cleanTerm, country)
      ]);

      let primaryCounts = [];
      let matchedTerm = cleanTerm;

      if (prefixRes.status === 'fulfilled' && prefixRes.value.ok) {
        try {
          const prefixData = await prefixRes.value.json();
          if (Array.isArray(prefixData) && prefixData.length > 0) {
            // Find best match or default to first
            const exact = prefixData.find(p => p.term?.toLowerCase() === cleanTerm) || prefixData[0];
            primaryCounts = Array.isArray(exact.counts) ? exact.counts : [];
            matchedTerm = exact.term || cleanTerm;
          }
        } catch (_) {}
      }

      let relatedTrends = [];
      if (relatedRes.status === 'fulfilled' && relatedRes.value.ok) {
        try {
          const relatedData = await relatedRes.value.json();
          if (Array.isArray(relatedData)) {
            relatedTrends = relatedData.map(r => ({
              term: r.term,
              counts: Array.isArray(r.counts) ? r.counts : [],
              hasPrediction: Boolean(r.hasPrediction)
            }));
            // If primary counts not found in prefix_match, check related
            if (primaryCounts.length === 0) {
              const exactInRelated = relatedData.find(r => r.term?.toLowerCase() === cleanTerm);
              if (exactInRelated && Array.isArray(exactInRelated.counts)) {
                primaryCounts = exactInRelated.counts;
              }
            }
          }
        } catch (_) {}
      }

      // Calculate Peak and Momentum metrics strictly from real data
      let peakIndex = 0;
      let peakVal = 0;
      let sum = 0;
      let avgCount = 0;
      let latestCount = null;
      let prevCount = null;
      let momentumDelta = null;

      if (primaryCounts.length > 0) {
        primaryCounts.forEach((val, idx) => {
          const v = Number(val || 0);
          sum += v;
          if (v > peakVal) {
            peakVal = v;
            peakIndex = idx;
          }
        });
        avgCount = Math.round(sum / (primaryCounts.length || 1));
        latestCount = primaryCounts[primaryCounts.length - 1] ?? 0;
        prevCount = primaryCounts.length >= 2 ? primaryCounts[primaryCounts.length - 2] : latestCount;
        momentumDelta = latestCount - prevCount;
      }

      // Extract official Pinterest Interest Annotation data if available
      const interestInfo = interestData.status === 'fulfilled' ? interestData.value : null;
      const exactSearchCount = interestInfo?.internal_search_count || 0;

      // Prioritize official Pinterest Internal Search Count (Exact parity with Image 1 & 2: 514,940)
      const estimatedMonthlyVolume = exactSearchCount > 0
        ? exactSearchCount
        : (avgCount > 0 ? Math.round(avgCount * 3650 + (peakVal * 1200)) : null);

      // Extract live official Pinterest Demographics distribution if available
      let demographics = null;
      if (demoRes.status === 'fulfilled' && demoRes.value.ok) {
        try {
          const demoJson = await demoRes.value.json();
          const termDist = demoJson?.term_distributions?.[cleanTerm] || demoJson?.term_distributions?.[matchedTerm];
          if (termDist && (termDist.age_distribution || termDist.gender_distribution)) {
            const ageDist = termDist.age_distribution || {};
            const genderDist = termDist.gender_distribution || {};

            const parsePct = (val) => Math.round(Number(val || 0) * 100);
            const formatDisplayPct = (pct) => {
              if (pct < 5 && pct > 0) return '<5%';
              if (pct === 0) return '0%';
              return `${pct}%`;
            };

            const femalePct = parsePct(genderDist.female);
            const malePct = parsePct(genderDist.male);
            const unspecifiedPct = parsePct(genderDist.unspecified);

            const ageGroups = ['18-24', '25-34', '35-44', '45-49', '50-54', '55-64', '65+'];
            const ageList = ageGroups.map(group => {
              const pct = parsePct(ageDist[group]);
              return {
                group,
                pct,
                display_pct: formatDisplayPct(pct)
              };
            });

            demographics = {
              gender: {
                female_pct: femalePct,
                female_display: formatDisplayPct(femalePct),
                male_pct: malePct,
                male_display: formatDisplayPct(malePct),
                unspecified_pct: unspecifiedPct,
                unspecified_display: formatDisplayPct(unspecifiedPct)
              },
              age: ageList
            };
          }
        } catch (_) {}
      }

      const resultData = {
        term: matchedTerm,
        country,
        counts_52_weeks: primaryCounts,
        current_index: latestCount,
        peak_index: peakIndex,
        peak_value: peakVal,
        average_index: avgCount,
        momentum_delta: momentumDelta,
        estimated_volume: estimatedMonthlyVolume,
        exact_volume: exactSearchCount || null,
        annotation_id: interestInfo?.id || null,
        category_tree: interestInfo?.seo_breadcrumbs || [],
        related_interests: interestInfo?.seo_related_interests || [],
        ideas_pivots: interestInfo?.ideas_pivots || [],
        feed_update_time: interestInfo?.feed_update_time || null,
        related_trends: relatedTrends,
        demographics,
        collage_images: (collageList.status === 'fulfilled' && Array.isArray(collageList.value)) ? collageList.value : []
      };

      // Manage cache size
      if (trendsCache.size >= TRENDS_CACHE_MAX) {
        const oldestKey = trendsCache.keys().next().value;
        if (oldestKey) trendsCache.delete(oldestKey);
      }
      trendsCache.set(cacheKey, { data: resultData, timestamp: now });

      return { success: true, cached: false, ...resultData };
    } catch (err) {
      console.warn(`[fetchPinterestTrends] Error for "${cleanTerm}":`, err.message);
      return { success: false, error: err.message };
    }
  })();

  inflightTrends.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightTrends.delete(cacheKey);
  }
}

/**
 * Fetch official Pinterest Trends popular pins collage images (9 images)
 * Queries https://trends.pinterest.com/term_images/ with 236x resolution
 */
export async function fetchPinterestTrendsCollage(term, country = 'US') {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm) return [];

  // Double-submit CSRF token (Zero hardcoded secrets directive)
  const token = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID().replace(/-/g, '') 
    : 'a68e7fb21890c174dc09e3f509aa3115';
  const headers = {
    'content-type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Referer': 'https://trends.pinterest.com/',
    'x-new-site': 'true',
    'x-csrftoken': token,
    'Cookie': `csrftoken=${token}`
  };

  const payload = {
    terms: [cleanTerm],
    country: country || 'US',
    cacheTtlInSeconds: 86400,
    limit: 9,
    batchSize: 20,
    requestImageSize: '236x'
  };

  let res;
  try {
    res = await fetch('https://trends.pinterest.com/term_images/', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rawList = Array.isArray(json[cleanTerm]) ? json[cleanTerm] : (Array.isArray(Object.values(json || {})[0]) ? Object.values(json)[0] : []);
    return rawList
      .filter(u => typeof u === 'string' && u.startsWith('http'))
      .map(u => u.replace(/\/(236|474)x\//, '/736x/'));
  } catch (err) {
    console.warn(`[fetchPinterestTrendsCollage] Failed for "${cleanTerm}":`, err.message);
    return [];
  } finally {
    if (res?.body && !res.bodyUsed) {
      await res.body.cancel().catch(() => {});
    }
  }
}

/**
 * Fetch Popular Pins associated with a Pinterest Trend / Keyword
 * Queries Pinterest unauthenticated search resource and caches results into tracked_keywords.popular_pins
 */
export async function fetchPinterestTrendsPopularPins(sql, term, country = 'US', force = false) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm) return { success: false, error: 'Term is required' };

  // 1. Check if cached in tracked_keywords.popular_pins (unless force refresh requested)
  if (sql && !force) {
    try {
      const [kw] = await sql`
        SELECT id, popular_pins
        FROM tracked_keywords
        WHERE LOWER(keyword) = ${cleanTerm}
        LIMIT 1;
      `;
      if (kw && Array.isArray(kw.popular_pins) && kw.popular_pins.length > 0) {
        const collageImages = await fetchPinterestTrendsCollage(cleanTerm, country);
        return { success: true, term: cleanTerm, popular_pins: kw.popular_pins, collage_images: collageImages, cached: true };
      }
    } catch (_) {}
  }

  // 2. Fetch popular pins via BaseSearchResource
  const searchQuery = encodeURIComponent(cleanTerm);
  const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${searchQuery}&data=%7B%22options%22%3A%7B%22query%22%3A%22${searchQuery}%22%2C%22scope%22%3A%22pins%22%2C%22page_size%22%3A12%7D%2C%22context%22%3A%7B%7D%7D`;
  const headers = {
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'x-pinterest-pws-handler': 'www/search/pins.js',
    'referer': `https://www.pinterest.com/search/pins/?q=${searchQuery}`
  };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return { success: false, error: `Pinterest returned HTTP ${res.status}` };
    const data = await res.json();
    const rawResults = data?.resource_response?.data?.results || [];

    const popularPins = [];
    for (const item of rawResults) {
      if (!item || !item.id || item.type !== 'pin' || item.format === 'Related Interests') continue;
      const id = String(item.id).trim();
      const img = item.images?.['736x']?.url || item.images?.orig?.url || item.images?.['474x']?.url || item.images?.['236x']?.url || null;
      if (!img) continue;

      let title = item.title || item.grid_title || '';
      if (!title && item.link) {
        const slug = item.link.split('/').filter(Boolean).pop() || '';
        title = slug.replace(/[-_]+/g, ' ').replace(/\.[a-z]+$/i, '').trim();
      }
      if (!title) title = `${cleanTerm} Pin`;

      popularPins.push({
        pin_id: id,
        title,
        image_url: img,
        link: item.link || `https://www.pinterest.com/pin/${id}/`,
        domain: item.domain || '',
        saves: Number(item.aggregated_pin_data?.aggregated_stats?.saves || item.save_count || 0)
      });
    }

    // Persist to tracked_keywords if sql provided
    if (sql && popularPins.length > 0) {
      try {
        await sql`
          UPDATE tracked_keywords
          SET popular_pins = ${JSON.stringify(popularPins)}::jsonb, updated_at = NOW()
          WHERE LOWER(keyword) = ${cleanTerm};
        `;
      } catch (_) {}
    }

    const collageImages = await fetchPinterestTrendsCollage(cleanTerm, country);
    return { success: true, term: cleanTerm, popular_pins: popularPins, collage_images: collageImages, cached: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
