/**
 * src/modules/newborn/surface-trends.mjs
 *
 * Pinterest Trends, Idea Page Intelligence, and Zero-Query Popular Surface Harvesters.
 * Owns the single `cachedTrendsLatestDate` module-level cache singleton.
 */

import { safeString } from '../../core/pinterest/pins.mjs';
import {
  fetchPinterestInterestVolume,
  fetchPinterestBatchVelocity
} from '../keywords/trends-service.mjs';
import { normalizeSurfaceCandidatePin } from './surface-normalizers.mjs';

let cachedTrendsLatestDate = { value: null, expiresAt: 0 };

/**
 * Resolves Pinterest Trends' `/latest_available_date/` (handling Pinterest Trends' 2–4 day lag
 * so `top_trends_filtered/?endDate=<date>` never returns HTTP 400 / 0 rows).
 */
export async function resolveTrendsLatestAvailableDate(router, nowMs = Date.now()) {
  const isCustomMockFetch = Boolean(router && typeof router.fetchImpl === 'function' && router.fetchImpl !== globalThis.fetch);
  if (!isCustomMockFetch && cachedTrendsLatestDate.value && cachedTrendsLatestDate.expiresAt > nowMs) {
    return cachedTrendsLatestDate.value;
  }

  const fallbackDate = new Date(nowMs - 3 * 86_400_000).toISOString().slice(0, 10);
  try {
    const res = await router.requestJson('https://trends.pinterest.com/latest_available_date/', {
      endpointKey: 'trends_api',
      referer: 'https://trends.pinterest.com/',
      extraHeaders: { 'x-new-site': 'true' }
    });
    if (res.ok && res.data) {
      const raw = typeof res.data === 'string'
        ? res.data.trim()
        : safeString(res.data.date || res.data.latest_available_date || res.data.endDate || '');
      const cleanDate = raw.replace(/[^0-9-]/g, '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        if (!isCustomMockFetch) {
          cachedTrendsLatestDate = { value: cleanDate, expiresAt: nowMs + 30 * 60_000 };
        }
        return cleanDate;
      }
    }
  } catch (_) {}

  return fallbackDate;
}

/**
 * Resolves Official Pinterest `Idea Page` Intelligence for any seed keyword:
 * - Official `InterestResource/get` URL (`https://www.pinterest.com/ideas/<slug>/<id>/`),
 *   `internal_search_count`, `seo_breadcrumbs`, `seo_related_objects`, and `ideas_pivots`.
 * - Weekly / monthly / yearly trend growth % via Pinterest Trends `prefix_match`.
 *
 * Uses existing `trends-service.mjs` LRU+singleflight helpers in production, or routes through
 * `router.requestJson` when a custom `fetchImpl` router is supplied (100% offline testable).
 */
export async function resolveIdeaPageIntelligence(term, { router = null, country = 'US' } = {}) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) {
    return { found: false, term: cleanTerm, idea_url: null, internal_search_count: 0 };
  }

  const slug = cleanTerm.replace(/[^a-z0-9\s-]/gi, ' ').trim().replace(/[\s_]+/g, '-');
  if (!slug) {
    return { found: false, term: cleanTerm, idea_url: null, internal_search_count: 0 };
  }
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const useCustomRouter = Boolean(router && typeof router.requestJson === 'function' && router.fetchImpl !== globalThis.fetch);

  let interestInfo = null;
  let velocityInfo = null;

  if (useCustomRouter) {
    const dataParam = encodeURIComponent(JSON.stringify({
      options: { interest: slug, field_set_key: 'ideas_hub' },
      context: {}
    }));
    const interestUrl = `https://www.pinterest.com/resource/InterestResource/get/?source_url=${encodeURIComponent(`/ideas/${slug}/`)}&data=${dataParam}`;
    const prefixUrl = `https://trends.pinterest.com/prefix_match/?query=${encodeURIComponent(cleanTerm)}&country=${cleanCountry}`;

    const [intRes, prefRes] = await Promise.allSettled([
      router.requestJson(interestUrl, {
        endpointKey: 'interest_resource',
        sourceUrl: `/ideas/${slug}/`,
        handler: 'www/ideas/[interest_url_name]/[interest_id].js'
      }),
      router.requestJson(prefixUrl, {
        endpointKey: 'trends_api',
        referer: 'https://trends.pinterest.com/',
        extraHeaders: { 'x-new-site': 'true' }
      })
    ]);

    if (intRes.status === 'fulfilled' && intRes.value?.ok) {
      const data = intRes.value.data?.resource_response?.data || intRes.value.data?.data || null;
      if (data && data.is_interest !== false && data.id && String(data.id) !== '0') {
        const rawRelated = Array.isArray(data.seo_related_interests) ? data.seo_related_interests : [];
        const rawPivots = Array.isArray(data.ideas_klp_pivots) ? data.ideas_klp_pivots : [];
        interestInfo = {
          success: true,
          id: String(data.id),
          key: safeString(data.key || cleanTerm),
          url_name: safeString(data.url_name || slug),
          internal_search_count: Number(data.internal_search_count || 0),
          feed_update_time: data.feed_update_time || null,
          seo_breadcrumbs: Array.isArray(data.seo_breadcrumbs) ? data.seo_breadcrumbs.map((b) => safeString(b?.name || b)).filter(Boolean) : [],
          seo_related_objects: rawRelated.map((r) => ({
            name: safeString(r.name || r.key || ''),
            key: safeString(r.key || r.name || ''),
            id: String(r.id || r.origin_interest_id || ''),
            url: r.url || `/ideas/${String(r.key || r.name || '').replace(/\s+/g, '-')}/${r.id || ''}/`
          })).filter((r) => r.name),
          ideas_pivots: rawPivots.map((p) => {
            const pivotUrl = safeString(p.pivot_url || '');
            const pivotId = pivotUrl.split('/').filter(Boolean).pop() || '';
            return {
              label: safeString(p.pivot_display_text || ''),
              full_name: safeString(p.pivot_full_name || ''),
              url: pivotUrl,
              id: pivotId
            };
          }).filter((p) => p.full_name)
        };
      }
    }

    if (prefRes.status === 'fulfilled' && prefRes.value?.ok && Array.isArray(prefRes.value.data) && prefRes.value.data.length > 0) {
      const exact = prefRes.value.data.find((x) => String(x?.term || '').trim().toLowerCase() === cleanTerm) || prefRes.value.data[0];
      const counts = Array.isArray(exact?.counts) ? exact.counts : [];
      if (counts.length >= 2) {
        const calcPct = (curr, past) => {
          const c = Number(curr);
          const p = Number(past);
          if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
          if (p > 0) return Math.max(-100, Math.min(999, Math.round(((c - p) / p) * 100)));
          return c > 0 ? 100 : 0;
        };
        velocityInfo = {
          weekly_change: calcPct(counts[counts.length - 1], counts[counts.length - 2]),
          monthly_change: counts.length >= 5 ? calcPct(counts[counts.length - 1], counts[counts.length - 5]) : null,
          yearly_change: calcPct(counts[counts.length - 1], counts[0])
        };
      }
    }
  } else {
    const [intRes, velMapRes] = await Promise.allSettled([
      fetchPinterestInterestVolume(cleanTerm),
      fetchPinterestBatchVelocity(cleanTerm, [cleanTerm], cleanCountry)
    ]);
    if (intRes.status === 'fulfilled' && intRes.value && intRes.value.id && intRes.value.id !== '0') {
      interestInfo = intRes.value;
    }
    if (velMapRes.status === 'fulfilled' && velMapRes.value instanceof Map) {
      velocityInfo = velMapRes.value.get(cleanTerm) || null;
    }
  }

  if (!interestInfo || !interestInfo.id || interestInfo.id === '0') {
    return {
      found: false,
      term: cleanTerm,
      id: null,
      key: cleanTerm,
      url_name: slug,
      idea_url: null,
      internal_search_count: 0,
      formatted_volume: '0',
      weekly_change: velocityInfo?.weekly_change ?? null,
      monthly_change: velocityInfo?.monthly_change ?? null,
      yearly_change: velocityInfo?.yearly_change ?? null,
      feed_update_time: null,
      seo_breadcrumbs: [],
      related_interests: [],
      ideas_pivots: []
    };
  }

  const urlName = interestInfo.url_name || slug;
  const searchCount = Number(interestInfo.internal_search_count || 0);

  return {
    found: true,
    term: cleanTerm,
    id: String(interestInfo.id),
    key: interestInfo.key || cleanTerm,
    url_name: urlName,
    idea_url: `https://www.pinterest.com/ideas/${urlName}/${interestInfo.id}/`,
    internal_search_count: searchCount,
    formatted_volume: searchCount > 0 ? searchCount.toLocaleString('en-US') : '0',
    weekly_change: velocityInfo?.weekly_change ?? null,
    monthly_change: velocityInfo?.monthly_change ?? null,
    yearly_change: velocityInfo?.yearly_change ?? null,
    feed_update_time: interestInfo.feed_update_time || null,
    seo_breadcrumbs: Array.isArray(interestInfo.seo_breadcrumbs) ? interestInfo.seo_breadcrumbs : [],
    related_interests: (interestInfo.seo_related_objects || []).slice(0, 12).map((r) => ({
      name: r.name || r.key,
      key: r.key || r.name,
      id: String(r.id || ''),
      url: r.url && r.url.startsWith('http')
        ? r.url
        : `https://www.pinterest.com${r.url && r.url.startsWith('/') ? r.url : `/ideas/${String(r.key || r.name || '').replace(/\s+/g, '-')}/${r.id || ''}/`}`
    })),
    ideas_pivots: (interestInfo.ideas_pivots || []).slice(0, 8).map((p) => ({
      label: p.label,
      full_name: p.full_name,
      id: p.id,
      url: p.url && p.url.startsWith('http')
        ? p.url
        : `https://www.pinterest.com${p.url && p.url.startsWith('/') ? p.url : `/ideas/${String(p.full_name || '').toLowerCase().replace(/\s+/g, '-')}/${p.id || ''}/`}`
    }))
  };
}

/**
 * SURFACE 1: Growing / Seasonal / Monthly / Yearly Trends + 90-Day Prediction Metrics
 * (`trends.pinterest.com`, strict zero-cookie + `x-new-site: "true"` + `/latest_available_date/`).
 */
const TRENDS_PRESET_CODES = Object.freeze({
  monthly: '1',
  yearly: '2',
  growing: '3',
  seasonal: '4'
});

const TRENDS_L1_INTEREST_IDS = Object.freeze({
  animals: '925056443165',
  architecture: '918105274631',
  art: '961238559656',
  beauty: '935541271955',
  design: '902065567321',
  'diy-and-crafts': '934876475639',
  diy_and_crafts: '934876475639',
  diyandcrafts: '934876475639',
  education: '922134410098',
  electronics: '960887632144',
  entertainment: '953061268473',
  'event-planning': '941870572865',
  event_planning: '941870572865',
  eventplanning: '941870572865',
  finance: '913207199297',
  'food-and-drink': '918530398158',
  'food-and-drinks': '918530398158',
  food_and_drink: '918530398158',
  food_and_drinks: '918530398158',
  foodanddrink: '918530398158',
  gardening: '909983286710',
  'lawn-and-garden': '909983286710',
  lawn_and_garden: '909983286710',
  lawnandgarden: '909983286710',
  health: '898620064290',
  'home-decor': '935249274030',
  home_decor: '935249274030',
  homedecor: '935249274030',
  'mens-fashion': '924581335376',
  mens_fashion: '924581335376',
  parenting: '920236059316',
  quotes: '948192800438',
  sport: '919812032692',
  sports: '919812032692',
  travel: '908182459161',
  vehicles: '918093243960',
  wedding: '903260720461',
  weddings: '903260720461',
  fashion: '948967005229',
  'womens-fashion': '948967005229',
  womens_fashion: '948967005229'
});

export function resolveTrendsL1InterestId(rawInterest) {
  const clean = String(rawInterest || '').trim().toLowerCase();
  if (!clean || clean === 'all') return null;
  if (/^\d{6,20}$/.test(clean)) return clean;
  return TRENDS_L1_INTEREST_IDS[clean] || null;
}

export async function harvestGrowingTrendsSurface(
  router,
  {
    country = 'US',
    trendType = 'growing',
    l1Interest = 'all',
    limit = 25,
    fetch90dForecast = true,
    includeTerms = [],
    excludeTerms = [],
    endDate = null,
    age = null,
    gender = null,
    moments = null
  } = {}
) {
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const cleanTrendType = ['growing', 'seasonal', 'monthly', 'yearly'].includes(String(trendType || '').toLowerCase())
    ? String(trendType).toLowerCase()
    : 'growing';
  const presetCode = TRENDS_PRESET_CODES[cleanTrendType] || '3';
  const seasonalParam = cleanTrendType === 'seasonal' ? '&isSeasonal=true' : '';
  const cleanInterest = String(l1Interest || 'all').trim().toLowerCase();
  const resolvedL1Id = resolveTrendsL1InterestId(cleanInterest);
  const interestParam = resolvedL1Id
    ? `&l1interests=${encodeURIComponent(resolvedL1Id)}`
    : '';
  const clampedLimit = Math.max(5, Math.min(100, Number(limit) || 25));

  const includeList = (Array.isArray(includeTerms) ? includeTerms : String(includeTerms || '').split(','))
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean);
  const excludeList = (Array.isArray(excludeTerms) ? excludeTerms : String(excludeTerms || '').split(','))
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  const includeParam = includeList.length > 0 ? `&keywordsToInclude=${encodeURIComponent(includeList.join(','))}` : '';
  const excludeParam = excludeList.length > 0 ? `&keywordsToExclude=${encodeURIComponent(excludeList.join(','))}` : '';
  const ageParam = age ? `&ageBuckets=${encodeURIComponent(String(age).trim())}` : '';
  const genderParam = gender ? `&gender=${encodeURIComponent(String(gender).trim())}` : '';
  const momentsParam = moments ? `&moments=${encodeURIComponent(String(moments).trim())}` : '';

  // Resolve latest available date first to handle Pinterest Trends' 2–4 day data lag (prevents HTTP 400 / 0 trends!)
  const latestDate = endDate || await resolveTrendsLatestAvailableDate(router);

  const listUrl = `https://trends.pinterest.com/top_trends_filtered/?country=${cleanCountry}&trendsPreset=${presetCode}&rankingMethod=${presetCode}${seasonalParam}${interestParam}${includeParam}${excludeParam}${ageParam}${genderParam}${momentsParam}&endDate=${encodeURIComponent(latestDate)}&numTermsToReturn=${clampedLimit}`;
  const res = await router.requestJson(listUrl, {
    endpointKey: 'trends_api',
    referer: 'https://trends.pinterest.com/',
    extraHeaders: { 'x-new-site': 'true' }
  });

  if (!res.ok || !res.data) {
    return {
      ok: false,
      surface: 'growing_trends',
      trend_type: cleanTrendType,
      l1_interest: cleanInterest || 'all',
      latest_available_date: latestDate,
      trends: [],
      terms: [],
      pins: [],
      error: res.error || 'trends_unavailable'
    };
  }

  const isLiveValuesFormat = Boolean(!Array.isArray(res.data) && Array.isArray(res.data.values));
  const rawTrends = Array.isArray(res.data)
    ? res.data
    : (res.data.values || res.data.trends || res.data.results || res.data.data || []);

  const parseGrowthPct = (ratioObj, directVal) => {
    if (ratioObj && typeof ratioObj === 'object' && ratioObj.value !== undefined && ratioObj.value !== null) {
      const n = Number(ratioObj.value);
      return Number.isFinite(n) ? Math.round(n * 100) : 0;
    }
    const d = Number(directVal ?? 0);
    return Number.isFinite(d) ? Math.round(d) : 0;
  };

  const trends = [];
  const pins = [];
  for (const item of rawTrends) {
    if (!item) continue;
    const term = safeString(item.term || item.keyword || item.query || item.name || '').toLowerCase();
    if (!term) continue;

    // Defensive local post-filter in case upstream Trends ignores includeTerms/excludeTerms
    if (includeList.length > 0 && !includeList.some((inc) => term.includes(inc))) {
      continue;
    }
    if (excludeList.length > 0 && excludeList.some((exc) => term.includes(exc))) {
      continue;
    }

    const weeklyPct = parseGrowthPct(item.wow_change, item.weekly_change ?? item.perc_change_weekly ?? item.growth_weekly);
    const monthlyPct = parseGrowthPct(item.mom_change, item.monthly_change ?? item.perc_change_monthly ?? item.growth_monthly);
    const yearlyPct = parseGrowthPct(item.yoy_change, item.yearly_change ?? item.perc_change_yearly ?? item.growth_yearly);
    const seasonalityScore = item.seasonality_score !== undefined && item.seasonality_score !== null
      ? Number(item.seasonality_score)
      : null;
    const predictedPeakDate = safeString(item.predicted_peak_date || item.peak_date || item.peakDate || '') || null;
    const hasPrediction = Boolean(
      item.hasPrediction ??
      item.has_prediction ??
      item.isPredicted ??
      item.predicted_peak_date ??
      item.peak_date ??
      (Number.isFinite(seasonalityScore) && seasonalityScore >= 0.825)
    );

    trends.push({
      term,
      trend_type: cleanTrendType,
      l1_interest: safeString(item.interest || item.category || (cleanInterest !== 'all' ? cleanInterest : '')) || null,
      weekly_change: weeklyPct,
      weekly_growth_pct: weeklyPct,
      monthly_change: monthlyPct,
      monthly_growth_pct: monthlyPct,
      yearly_change: yearlyPct,
      yearly_growth_pct: yearlyPct,
      seasonality_score: item.seasonality_score !== undefined ? Number(item.seasonality_score) : null,
      search_count: item.searchCount !== undefined ? Number(item.searchCount) : (item.normalizedCount !== undefined ? Number(item.normalizedCount) : null),
      has_prediction: hasPrediction,
      predicted_90d_growth: null,
      predicted_peak_date: predictedPeakDate,
      is_predicted_peak_rising: false
    });

    const samplePins = item.sample_pins || item.pins || item.top_pins || [];
    if (Array.isArray(samplePins)) {
      for (const sp of samplePins) {
        const norm = normalizeSurfaceCandidatePin(sp, { surface: 'growing_trends', seed_query: term });
        if (norm) pins.push(norm);
      }
    }
  }

  // Sort live `values` results cleanly by requested trend window
  if (isLiveValuesFormat && trends.length > 1) {
    if (cleanTrendType === 'growing') {
      trends.sort((a, b) => (b.weekly_change - a.weekly_change) || (b.monthly_change - a.monthly_change));
    } else if (cleanTrendType === 'monthly') {
      trends.sort((a, b) => (b.monthly_change - a.monthly_change) || (b.weekly_change - a.weekly_change));
    } else if (cleanTrendType === 'yearly') {
      trends.sort((a, b) => (b.yearly_change - a.yearly_change) || (b.monthly_change - a.monthly_change));
    } else if (cleanTrendType === 'seasonal') {
      trends.sort((a, b) => ((b.seasonality_score ?? 0) - (a.seasonality_score ?? 0)) || (b.monthly_change - a.monthly_change));
    }
  }

  const trimmedTrends = trends.slice(0, clampedLimit);

  if (fetch90dForecast && trimmedTrends.length > 0) {
    const forecastSlice = trimmedTrends.slice(0, 8).map((t) => t.term);
    const metricsUrl = `https://trends.pinterest.com/metrics/?terms=${encodeURIComponent(forecastSlice.join(','))}&country=${cleanCountry}&predicted_days=90`;
    const metricsRes = await router.requestJson(metricsUrl, {
      endpointKey: 'trends_api',
      referer: 'https://trends.pinterest.com/',
      extraHeaders: { 'x-new-site': 'true' }
    });

    if (metricsRes.ok && metricsRes.data && typeof metricsRes.data === 'object') {
      const metricsPayload = metricsRes.data.metrics || metricsRes.data.data || metricsRes.data;
      for (const tr of trimmedTrends) {
        const seriesEntry = metricsPayload?.[tr.term];
        const predictedArr = Array.isArray(seriesEntry?.predicted)
          ? seriesEntry.predicted
          : (Array.isArray(seriesEntry?.predictions) ? seriesEntry.predictions : null);
        if (predictedArr && predictedArr.length >= 2) {
          const firstVal = Number(predictedArr[0]?.value ?? predictedArr[0]?.count ?? predictedArr[0] ?? 0);
          const lastVal = Number(predictedArr[predictedArr.length - 1]?.value ?? predictedArr[predictedArr.length - 1]?.count ?? predictedArr[predictedArr.length - 1] ?? 0);
          if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal > 0) {
            tr.predicted_90d_growth = Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10;
            tr.is_predicted_peak_rising = tr.predicted_90d_growth > 5;
          }
          let maxVal = -Infinity;
          let peakDate = null;
          for (const pt of predictedArr) {
            const v = Number(pt?.value ?? pt?.count ?? pt ?? NaN);
            if (Number.isFinite(v) && v > maxVal) {
              maxVal = v;
              peakDate = safeString(pt?.date || pt?.ds || pt?.week || '') || null;
            }
          }
          if (peakDate && !tr.predicted_peak_date) {
            tr.predicted_peak_date = peakDate;
          }
          if (Number.isFinite(firstVal) && firstVal > 0 && maxVal > firstVal * 1.1) {
            tr.is_predicted_peak_rising = true;
          }
        }
      }
    }
  }

  return {
    ok: true,
    surface: 'growing_trends',
    trend_type: cleanTrendType,
    l1_interest: cleanInterest || 'all',
    latest_available_date: latestDate,
    trends: trimmedTrends,
    terms: trimmedTrends.map((t) => t.term),
    pins
  };
}

/**
 * SURFACE 2: Zero-Query Popular / Ideas for You (`SearchTabResource/get` `_auth=1`, with zero-cookie Trends fallback).
 */
export async function harvestZeroQueryPopularSurface(router, { country = 'US' } = {}) {
  const dataParam = encodeURIComponent(JSON.stringify({
    options: { page_size: 25 },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/SearchTabResource/get/?source_url=%2F&data=${dataParam}`;
  const res = await router.requestJson(url, {
    endpointKey: 'search_tab_ideas',
    sourceUrl: '/',
    handler: 'www/index.js'
  });

  const termsSet = new Set();
  const popularSet = new Set();
  const ideasForYouSet = new Set();
  const pins = [];

  if (res.ok && res.data) {
    const payload = res.data?.resource_response?.data || res.data?.data || res.data;
    const collectFromModule = (node, depth = 0, bucketHint = '') => {
      if (depth > 8 || !node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) collectFromModule(item, depth + 1, bucketHint);
        return;
      }
      const q = safeString(node.query || node.search_query || node.term || node.display_query || '');
      if (q && q.length >= 2 && q.length <= 100 && !/^https?:/i.test(q)) {
        const lower = q.toLowerCase();
        termsSet.add(lower);
        if (bucketHint === 'ideas') ideasForYouSet.add(lower);
        else popularSet.add(lower);
      }
      const maybePin = normalizeSurfaceCandidatePin(node, { surface: 'zero_query_popular', seed_query: q || null });
      if (maybePin) {
        pins.push(maybePin);
      }
      for (const k of ['modules', 'items', 'results', 'ideas', 'popular_searches', 'trending_searches', 'pins', 'data']) {
        if (node[k]) {
          const nextHint = k === 'ideas' ? 'ideas' : (k === 'popular_searches' || k === 'trending_searches' ? 'popular' : bucketHint);
          collectFromModule(node[k], depth + 1, nextHint);
        }
      }
    };
    collectFromModule(payload);
  }

  if (termsSet.size > 0 || pins.length > 0) {
    return {
      ok: true,
      surface: 'zero_query_popular',
      terms: Array.from(termsSet),
      popular_terms: Array.from(popularSet),
      ideas_for_you_terms: Array.from(ideasForYouSet),
      pins,
      used_guest_fallback: false
    };
  }

  // Graceful guest fallback when SearchTabResource requires auth or returns empty
  const cleanCountry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'US';
  const latestDate = await resolveTrendsLatestAvailableDate(router);
  const fallbackUrl = `https://trends.pinterest.com/top_trends_filtered/?country=${cleanCountry}&trendsPreset=1&rankingMethod=1&endDate=${encodeURIComponent(latestDate)}&numTermsToReturn=15`;
  const fbRes = await router.requestJson(fallbackUrl, {
    endpointKey: 'trends_api',
    referer: 'https://trends.pinterest.com/',
    extraHeaders: { 'x-new-site': 'true' }
  });

  if (fbRes.ok && fbRes.data) {
    const list = Array.isArray(fbRes.data) ? fbRes.data : (fbRes.data.values || fbRes.data.trends || fbRes.data.results || []);
    for (const item of list.slice(0, 15)) {
      const t = safeString(item?.term || item?.keyword || item?.query || '').toLowerCase();
      if (t) {
        termsSet.add(t);
        popularSet.add(t);
      }
    }
  }

  return {
    ok: termsSet.size > 0,
    surface: 'zero_query_popular',
    terms: Array.from(termsSet),
    popular_terms: Array.from(popularSet),
    ideas_for_you_terms: Array.from(ideasForYouSet),
    pins,
    used_guest_fallback: true
  };
}
