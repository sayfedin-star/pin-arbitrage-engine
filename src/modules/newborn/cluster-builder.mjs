/**
 * src/modules/newborn/cluster-builder.mjs
 *
 * Wave 6E: Newborn Keyword Cluster Explorer Engine (Two-Phase Fast Build).
 * Unifies:
 *   1. Pinterest Trends 4-Tab Filtered Discovery (`growing`, `seasonal`, `monthly`, `yearly`)
 *      with `includeTerms` / `excludeTerms` + single shared `latest_available_date`
 *      + single batched 90-day Predicted Peaks (`/metrics/?predicted_days=90`) call
 *   2. Smart Typeahead Expansion (`AdvancedTypeaheadResource/get`) with strict separation of
 *      user account suggestions (e.g. `melissa_taylor2`) into `discovered_accounts[]`
 *   3. Official Idea Page Intelligence (`InterestResource/get`) for Volume, Taxonomy ✓,
 *      Related Interests ✓, and Idea Pivots
 *
 * Two-Phase Fast Build Architecture:
 *   - Phase 1 (`buildNewbornKeywordCluster`): Builds the complete deduplicated keyword cluster in ~3–6s
 *     and enriches the top 20–25 keywords via bounded `Semaphore(5)` zero-cookie `InterestResource/get`.
 *   - Phase 2 (`enrichClusterRemainingVolumes`): On-demand enrichment for remaining unchecked keywords
 *     to avoid synchronous 60–80 request storms or Pinterest 429 Circuit Breaker trips.
 */

import { Semaphore, sanitizeForJsonb } from '../../utils.mjs';
import { normalizeWordLemma } from '../../domain/pin-intelligence.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import { fetchKeywordTypeahead } from '../keywords/typeahead.mjs';
import { slugifyInterestTerm } from '../keywords/trends-service.mjs';
import {
  resolveTrendsLatestAvailableDate,
  harvestGrowingTrendsSurface,
  resolveIdeaPageIntelligence
} from './surfaces.mjs';

const TREND_TABS = Object.freeze(['growing', 'seasonal', 'monthly', 'yearly']);

const FOOD_SUFFIXES = Object.freeze(['recipes', 'ideas', 'easy', 'healthy']);
const DEFAULT_SUFFIXES = Object.freeze(['ideas', 'easy', 'aesthetic', 'diy']);

const SEMANTIC_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with', 'at', 'by', 'from',
  'my', 'your', 'our', 'this', 'that', 'these', 'those', 'is', 'are', 'be',
  'idea', 'ideas', 'best', 'easy', 'simple', 'diy', 'cute', 'aesthetic', 'quick', 'homemade'
]);

export function normalizeClusterTerm(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractSemanticLemmas(phrase) {
  const tokens = normalizeClusterTerm(phrase)
    .split(/[^a-z0-9]+/)
    .map((t) => normalizeWordLemma(t))
    .filter((t) => t.length >= 2);
  const meaningful = tokens.filter((t) => !SEMANTIC_STOP_WORDS.has(t));
  return new Set(meaningful.length > 0 ? meaningful : tokens);
}

/**
 * Checks whether a 2nd-hop related interest shares at least one lemmatized core semantic token
 * with the cluster's `seedKeyword`, blocking off-topic hops (e.g. "thanksgiving turkey" in a "green bean" cluster).
 */
export function hasSeedSemanticOverlap(seedKeyword, candidateKeyword) {
  const seedTokens = extractSemanticLemmas(seedKeyword);
  if (seedTokens.size === 0) return true;
  const candTokens = extractSemanticLemmas(candidateKeyword);
  if (candTokens.size === 0) return false;
  for (const tok of seedTokens) {
    if (candTokens.has(tok)) return true;
  }
  return false;
}

export function buildTypeaheadExpansionQueries(seedKeyword, l1Interest = 'all') {
  const seed = normalizeClusterTerm(seedKeyword);
  if (!seed) return [];
  const cleanInterest = String(l1Interest || 'all').trim().toLowerCase();
  const isFoodContext = ['food-and-drink', 'food-and-drinks', 'food_and_drink', 'food_and_drinks', '918530398158'].includes(cleanInterest) ||
    /\b(soup|recipe|recipes|dinner|lunch|breakfast|meal|chicken|pasta|salad|cake|bake|baking|crockpot|air fryer|smoothie|dessert)\b/i.test(seed);
  const suffixes = isFoodContext ? FOOD_SUFFIXES : DEFAULT_SUFFIXES;
  const queries = [seed];
  for (const sfx of suffixes) {
    if (!seed.includes(sfx)) {
      queries.push(`${seed} ${sfx}`);
    }
  }
  return queries.slice(0, 5);
}

/**
 * Pure deduplicator & scorer that merges keyword records from Trends, Typeahead,
 * Idea Page Related Interests, and Seed into unified Keyword Explorer rows.
 */
export function mergeClusterKeywordEntries(entries = [], { excludeTerms = [] } = {}) {
  const excludeList = (Array.isArray(excludeTerms) ? excludeTerms : String(excludeTerms || '').split(','))
    .map(normalizeClusterTerm)
    .filter(Boolean);

  const byTerm = new Map();

  for (const raw of (Array.isArray(entries) ? entries : [])) {
    if (!raw) continue;
    const term = normalizeClusterTerm(raw.keyword || raw.term || raw.name);
    if (!term || term.length < 2) continue;
    if (excludeList.length > 0 && excludeList.some((exc) => term.includes(exc))) continue;

    let entry = byTerm.get(term);
    if (!entry) {
      entry = {
        keyword: term,
        sources: [],
        trend_tabs: [],
        volume: null,
        formatted_volume: null,
        has_taxonomy: false,
        is_related_interest: false,
        interest_id: null,
        idea_url: null,
        weekly_change: null,
        monthly_change: null,
        yearly_change: null,
        has_prediction: false,
        predicted_peak_date: null,
        predicted_90d_growth: null,
        is_predicted_peak_rising: false,
        l1_interest: null,
        volume_enriched: false,
        volume_rechecked_v2: false,
        volume_error: false,
        volume_error_reason: null,
        trends_search_count: null,
        cluster_score: 0
      };
      byTerm.set(term, entry);
    }

    const incomingSources = Array.isArray(raw.sources)
      ? raw.sources
      : (raw.source ? [raw.source] : []);
    for (const s of incomingSources) {
      const cleanS = String(s || '').trim().toLowerCase();
      if (cleanS && !entry.sources.includes(cleanS)) entry.sources.push(cleanS);
    }

    const incomingTabs = Array.isArray(raw.trend_tabs)
      ? raw.trend_tabs
      : (raw.trend_type ? [raw.trend_type] : []);
    for (const t of incomingTabs) {
      const cleanT = String(t || '').trim().toLowerCase();
      if (cleanT && !entry.trend_tabs.includes(cleanT)) entry.trend_tabs.push(cleanT);
    }

    if (raw.volume !== null && raw.volume !== undefined && Number.isFinite(Number(raw.volume))) {
      const vol = Math.max(0, Math.round(Number(raw.volume)));
      entry.volume = entry.volume !== null ? Math.max(entry.volume, vol) : vol;
      entry.formatted_volume = entry.volume > 0 ? entry.volume.toLocaleString('en-US') : '0';
    }
    if (raw.interest_id && !entry.interest_id) {
      entry.interest_id = String(raw.interest_id).trim();
    }
    if (raw.idea_url && !entry.idea_url) {
      entry.idea_url = String(raw.idea_url).trim();
    }
    if (raw.has_taxonomy === true || Boolean(entry.interest_id && entry.interest_id !== '0')) {
      entry.has_taxonomy = true;
    }
    if (raw.is_related_interest === true || entry.sources.includes('related_interest') || entry.sources.includes('idea_pivot')) {
      entry.is_related_interest = true;
    }
    if (raw.weekly_change !== null && raw.weekly_change !== undefined && Number.isFinite(Number(raw.weekly_change))) {
      entry.weekly_change = entry.weekly_change !== null
        ? Math.max(entry.weekly_change, Math.round(Number(raw.weekly_change)))
        : Math.round(Number(raw.weekly_change));
    }
    if (raw.monthly_change !== null && raw.monthly_change !== undefined && Number.isFinite(Number(raw.monthly_change))) {
      entry.monthly_change = entry.monthly_change !== null
        ? Math.max(entry.monthly_change, Math.round(Number(raw.monthly_change)))
        : Math.round(Number(raw.monthly_change));
    }
    if (raw.yearly_change !== null && raw.yearly_change !== undefined && Number.isFinite(Number(raw.yearly_change))) {
      entry.yearly_change = entry.yearly_change !== null
        ? Math.max(entry.yearly_change, Math.round(Number(raw.yearly_change)))
        : Math.round(Number(raw.yearly_change));
    }
    if (raw.has_prediction === true) entry.has_prediction = true;
    if (raw.predicted_peak_date && !entry.predicted_peak_date) {
      entry.predicted_peak_date = String(raw.predicted_peak_date).trim();
      entry.has_prediction = true;
    }
    if (raw.predicted_90d_growth !== null && raw.predicted_90d_growth !== undefined && Number.isFinite(Number(raw.predicted_90d_growth))) {
      entry.predicted_90d_growth = Number(raw.predicted_90d_growth);
      entry.has_prediction = true;
    }
    if (raw.is_predicted_peak_rising === true) {
      entry.is_predicted_peak_rising = true;
      entry.has_prediction = true;
    }
    if (raw.l1_interest && !entry.l1_interest) {
      entry.l1_interest = String(raw.l1_interest).trim().toLowerCase();
    }
    if (raw.volume_enriched === true) {
      entry.volume_enriched = true;
      entry.volume_error = false;
      entry.volume_error_reason = null;
    } else if (raw.volume_error === true && !entry.volume_enriched) {
      entry.volume_error = true;
      if (raw.volume_error_reason) entry.volume_error_reason = String(raw.volume_error_reason).slice(0, 120);
    }
    if (raw.volume_rechecked_v2 === true) {
      entry.volume_rechecked_v2 = true;
    }
    if (raw.trends_search_count !== null && raw.trends_search_count !== undefined && Number.isFinite(Number(raw.trends_search_count))) {
      const tsc = Math.max(0, Math.round(Number(raw.trends_search_count)));
      entry.trends_search_count = entry.trends_search_count !== null ? Math.max(entry.trends_search_count, tsc) : tsc;
    }
    if (Number.isFinite(Number(raw._ta_rank)) && Number(raw._ta_rank) > 0) {
      const r = Number(raw._ta_rank);
      entry._ta_rank = entry._ta_rank > 0 ? Math.min(entry._ta_rank, r) : r;
    }
  }

  const results = Array.from(byTerm.values()).map((row) => {
    // Deterministic ranking score combining multi-source signal, volume, growth, and predicted peaks
    const volScore = row.volume && row.volume > 0 ? Math.min(45, Math.log10(row.volume + 10) * 7.5) : 0;
    const momBonus = row.monthly_change != null ? Math.max(-10, Math.min(25, row.monthly_change * 0.25)) : 0;
    const wowBonus = row.weekly_change != null ? Math.max(-5, Math.min(12, row.weekly_change * 0.3)) : 0;
    const sourceBonus = Math.min(18, row.sources.length * 5) + (row.sources.includes('trends') ? 6 : 0) + (row.trend_tabs.length > 1 ? Math.min(8, (row.trend_tabs.length - 1) * 3) : 0);
    const taxonomyBonus = row.has_taxonomy ? 8 : 0;
    const relatedBonus = row.is_related_interest ? 5 : 0;
    const peakBonus = row.is_predicted_peak_rising ? 10 : (row.has_prediction ? 4 : 0);
    const rankBonus = row._ta_rank > 0 ? Math.max(0, 6 - row._ta_rank * 0.5) : 0;
    row.cluster_score = Math.round(Math.max(0, Math.min(100, volScore + momBonus + wowBonus + sourceBonus + taxonomyBonus + relatedBonus + peakBonus + rankBonus)) * 10) / 10;
    delete row._ta_rank;
    return row;
  });

  results.sort((a, b) => {
    const aHasVol = a.volume !== null && a.volume > 0 ? 1 : 0;
    const bHasVol = b.volume !== null && b.volume > 0 ? 1 : 0;
    if (bHasVol !== aHasVol) return bHasVol - aHasVol;
    if ((b.volume || 0) !== (a.volume || 0)) return (b.volume || 0) - (a.volume || 0);
    if ((b.cluster_score || 0) !== (a.cluster_score || 0)) return (b.cluster_score || 0) - (a.cluster_score || 0);
    return a.keyword.localeCompare(b.keyword);
  });

  return results;
}

/**
 * Fetches 90-day predicted peaks in batches of up to 12 terms (strict zero-cookie Trends API).
 */
async function enrichPredictedPeaksBatch(router, keywords = [], country = 'US') {
  const targetTerms = keywords.slice(0, 60).map((k) => k.keyword);
  if (targetTerms.length === 0) return;

  const byKey = new Map(keywords.map((k) => [k.keyword, k]));
  const chunks = [];
  for (let i = 0; i < targetTerms.length; i += 12) {
    chunks.push(targetTerms.slice(i, i + 12));
  }

  for (const chunk of chunks) {
    const metricsUrl = `https://trends.pinterest.com/metrics/?terms=${encodeURIComponent(chunk.join(','))}&country=${encodeURIComponent(country)}&predicted_days=90`;
    const metricsRes = await router.requestJson(metricsUrl, {
      endpointKey: 'trends_api',
      referer: 'https://trends.pinterest.com/',
      extraHeaders: { 'x-new-site': 'true' }
    }).catch(() => ({ ok: false }));

    if (!metricsRes?.ok || !metricsRes.data || typeof metricsRes.data !== 'object') continue;
    const metricsPayload = metricsRes.data.metrics || metricsRes.data.data || metricsRes.data;

    for (const term of chunk) {
      const row = byKey.get(term);
      const seriesEntry = metricsPayload?.[term];
      if (!row || !seriesEntry) continue;

      const predictedArr = Array.isArray(seriesEntry?.predicted)
        ? seriesEntry.predicted
        : (Array.isArray(seriesEntry?.predictions) ? seriesEntry.predictions : null);
      if (predictedArr && predictedArr.length >= 2) {
        const firstVal = Number(predictedArr[0]?.value ?? predictedArr[0]?.count ?? predictedArr[0] ?? 0);
        const lastVal = Number(predictedArr[predictedArr.length - 1]?.value ?? predictedArr[predictedArr.length - 1]?.count ?? predictedArr[predictedArr.length - 1] ?? 0);
        if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal > 0) {
          row.predicted_90d_growth = Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10;
          row.has_prediction = true;
          if (row.predicted_90d_growth > 5) row.is_predicted_peak_rising = true;
        }
        let maxVal = -Infinity;
        let peakDate = null;
        for (const pt of predictedArr) {
          const v = Number(pt?.value ?? pt?.count ?? pt ?? NaN);
          if (Number.isFinite(v) && v > maxVal) {
            maxVal = v;
            peakDate = String(pt?.date || pt?.ds || pt?.week || '').trim() || null;
          }
        }
        if (peakDate && !row.predicted_peak_date) {
          row.predicted_peak_date = peakDate;
          row.has_prediction = true;
        }
        if (Number.isFinite(firstVal) && firstVal > 0 && maxVal > firstVal * 1.1) {
          row.is_predicted_peak_rising = true;
          row.has_prediction = true;
        }
      }
    }
  }
}

/**
 * Extracts official Pinterest interest slug + ID from an existing row's `idea_url` / `interest_id`,
 * falling back to Unicode-safe `slugifyInterestTerm(row.keyword)`.
 */
export function resolveInterestLookupTarget(row) {
  const rawIdeaUrl = String(row?.idea_url || '').trim();
  const explicitId = String(row?.interest_id || '').trim();
  let urlSlug = '';
  let urlId = '';

  if (rawIdeaUrl) {
    const match = rawIdeaUrl.match(/\/ideas\/([^/?#]+)(?:\/(\d+))?/i);
    if (match) {
      try {
        urlSlug = decodeURIComponent(match[1] || '').trim();
      } catch (_) {
        urlSlug = String(match[1] || '').trim();
      }
      urlId = String(match[2] || '').trim();
    }
  }

  const interestId = (explicitId && explicitId !== '0') ? explicitId : (urlId && urlId !== '0' ? urlId : '');
  const slug = urlSlug || slugifyInterestTerm(row?.keyword || '');
  const sourceUrl = interestId && slug
    ? `/ideas/${encodeURIComponent(slug)}/${encodeURIComponent(interestId)}/`
    : (slug ? `/ideas/${encodeURIComponent(slug)}/` : '');

  return { slug, interestId, sourceUrl };
}

/**
 * Enriches a bounded slice of cluster keywords via Zero-Cookie `InterestResource/get` (`Semaphore(4)`).
 * - Uses official `row.interest_id` / `row.idea_url` first, then `slugifyInterestTerm`.
 * - ONLY marks `volume_enriched = true` when the network call actually returns a definitive response
 *   (HTTP 200 with payload, or HTTP 404 confirming no official Taxonomy page).
 * - On transient network error / HTTP 429 / 5xx / circuit breaker open, keeps `volume_enriched = false`
 *   and sets `volume_error = true` + `volume_error_reason` so the operator can retry cleanly!
 */
async function enrichKeywordsInterestVolumes(
  router,
  rowsToEnrich = [],
  { discoveredRelatedOut = null, seedKeyword = '', country = 'US' } = {}
) {
  if (!Array.isArray(rowsToEnrich) || rowsToEnrich.length === 0) {
    return { enrichedCount: 0, failedCount: 0, rateLimited: false };
  }

  const sem = new Semaphore(4);
  let enrichedCount = 0;
  let failedCount = 0;
  let rateLimited = false;

  await Promise.all(
    rowsToEnrich.map((row) => sem.run(async () => {
      const { slug, interestId: knownId, sourceUrl } = resolveInterestLookupTarget(row);
      if (!slug && !knownId) {
        row.volume_enriched = true;
        row.volume_rechecked_v2 = true;
        row.volume_error = false;
        row.volume_error_reason = null;
        row.has_taxonomy = false;
        enrichedCount++;
        return;
      }

      const fetchByOptions = async (opts, srcUrl) => {
        const dataParam = encodeURIComponent(JSON.stringify({
          options: { ...opts, field_set_key: 'ideas_hub' },
          context: {}
        }));
        const url = `https://www.pinterest.com/resource/InterestResource/get/?source_url=${encodeURIComponent(srcUrl)}&data=${dataParam}`;
        return await router.requestJson(url, {
          endpointKey: 'interest_resource',
          sourceUrl: srcUrl,
          handler: 'www/ideas/[interest_url_name]/[interest_id].js'
        }).catch((err) => ({ ok: false, status: 0, error: err?.message || 'network_error' }));
      };

      // Prefer official interest_id when already known (from Related Interests / Idea Pivots),
      // falling back to slug-only lookup if the response fails, returns no data, or has 0 search count.
      let res = null;
      if (knownId) {
        res = await fetchByOptions(
          { interest: slug || knownId, interest_id: knownId },
          sourceUrl || `/ideas/${encodeURIComponent(slug || knownId)}/${encodeURIComponent(knownId)}/`
        );
        const firstData = res?.data?.resource_response?.data || res?.data?.data || null;
        const firstCount = Number(firstData?.internal_search_count ?? firstData?.search_count ?? 0);
        if (slug && (!res || !res.ok || !firstData || !(Number.isFinite(firstCount) && firstCount > 0))) {
          const slugOnlyRes = await fetchByOptions({ interest: slug }, `/ideas/${encodeURIComponent(slug)}/`);
          const slugOnlyData = slugOnlyRes?.data?.resource_response?.data || slugOnlyRes?.data?.data || null;
          const slugOnlyCount = Number(slugOnlyData?.internal_search_count ?? slugOnlyData?.search_count ?? 0);
          if (slugOnlyRes?.ok && slugOnlyData && (slugOnlyCount > 0 || !firstData)) {
            res = slugOnlyRes;
          }
        }
      } else {
        res = await fetchByOptions({ interest: slug }, `/ideas/${encodeURIComponent(slug)}/`);
      }

      // Retry once on transient network/5xx error (never on 429 or explicit 404)
      const status = Number(res?.status || 0);
      if (!res?.ok && (status === 0 || status >= 500) && !String(res?.error || '').toLowerCase().includes('circuit')) {
        await new Promise((r) => setTimeout(r, 250));
        res = knownId
          ? await fetchByOptions({ interest: slug || knownId, interest_id: knownId }, sourceUrl || `/ideas/${encodeURIComponent(slug || knownId)}/`)
          : await fetchByOptions({ interest: slug }, `/ideas/${encodeURIComponent(slug)}/`);
      }

      const finalStatus = Number(res?.status || 0);
      const errMsg = String(res?.error || '').trim();
      const isTransientFailure = Boolean(
        !res?.ok && (
          finalStatus === 429 ||
          finalStatus === 0 ||
          finalStatus >= 500 ||
          finalStatus === 403 ||
          errMsg.toLowerCase().includes('circuit') ||
          errMsg.toLowerCase().includes('timeout') ||
          errMsg.toLowerCase().includes('abort') ||
          errMsg.toLowerCase().includes('network')
        )
      );

      if (isTransientFailure) {
        if (finalStatus === 429 || errMsg.toLowerCase().includes('circuit')) {
          rateLimited = true;
        }
        row.volume_enriched = false;
        row.volume_error = true;
        row.volume_error_reason = finalStatus === 429
          ? 'HTTP_429_RATE_LIMIT'
          : (errMsg || (finalStatus ? `HTTP_${finalStatus}` : 'NETWORK_ERROR')).slice(0, 120);
        failedCount++;
        return;
      }

      // Definitive response received (HTTP 200 or confirmed 404 non-taxonomy)
      const data = res?.data?.resource_response?.data || res?.data?.data || null;
      row.volume_enriched = true;
      row.volume_rechecked_v2 = true;
      row.volume_error = false;
      row.volume_error_reason = null;
      enrichedCount++;

      const rawInterestId = String(data?.id || '').trim();
      const hasValidResponseId = /^\d+$/.test(rawInterestId) && !/^0+$/.test(rawInterestId);
      const hasKnownId = /^\d+$/.test(String(knownId || '').trim()) && !/^0+$/.test(String(knownId || '').trim());

      if (!res?.ok || !data || typeof data !== 'object' || Array.isArray(data) || (!hasValidResponseId && !hasKnownId)) {
        if (!hasKnownId) {
          row.has_taxonomy = false;
        }
        return;
      }

      const interestId = hasValidResponseId ? rawInterestId : String(knownId).trim();
      let searchCount = Number(data.internal_search_count ?? data.search_count ?? 0);
      let urlName = String(data.url_name || slug).trim();

      if (interestId && interestId !== '0') {
        row.interest_id = interestId;
        row.has_taxonomy = true;
        row.idea_url = `https://www.pinterest.com/ideas/${encodeURIComponent(urlName)}/${encodeURIComponent(interestId)}/`;
      }

      // Fallback to resolveIdeaPageIntelligence when an official Taxonomy interest returns 0 / missing volume
      if ((!Number.isFinite(searchCount) || searchCount <= 0) && row.has_taxonomy) {
        try {
          const fallbackIdea = await resolveIdeaPageIntelligence(row.keyword, { router, country });
          const fbVol = Number(fallbackIdea?.internal_search_count ?? 0);
          if (fallbackIdea?.found && Number.isFinite(fbVol) && fbVol > 0) {
            searchCount = fbVol;
            if (fallbackIdea.url_name) urlName = String(fallbackIdea.url_name).trim();
            if (fallbackIdea.id && /^\d+$/.test(String(fallbackIdea.id)) && String(fallbackIdea.id) !== '0') {
              row.interest_id = String(fallbackIdea.id);
              row.idea_url = `https://www.pinterest.com/ideas/${encodeURIComponent(urlName)}/${encodeURIComponent(row.interest_id)}/`;
            }
          }
        } catch (_) {
          // Best-effort fallback; never abort the batch
        }
      }

      if (Number.isFinite(searchCount) && searchCount > 0) {
        row.volume = Math.round(searchCount);
        row.formatted_volume = row.volume.toLocaleString('en-US');
      } else if (row.volume !== null && Number(row.volume) <= 0) {
        row.volume = null;
        row.formatted_volume = null;
      }

      if (Array.isArray(discoveredRelatedOut)) {
        const relList = Array.isArray(data.seo_related_interests) ? data.seo_related_interests : [];
        for (const rel of relList.slice(0, 8)) {
          const relName = normalizeClusterTerm(rel?.name || rel?.key || rel?.url_name?.replace(/-/g, ' '));
          if (!relName) continue;
          if (seedKeyword && !hasSeedSemanticOverlap(seedKeyword, relName)) continue;
          const relId = String(rel?.id || rel?.origin_interest_id || '').trim() || null;
          const rawRelUrl = String(rel?.url || '').trim();
          const relUrlName = String(rel?.url_name || slugifyInterestTerm(rel?.key || rel?.name || relName) || '').trim();
          const resolvedIdeaUrl = rawRelUrl
            ? (rawRelUrl.startsWith('http') ? rawRelUrl : `https://www.pinterest.com${rawRelUrl.startsWith('/') ? rawRelUrl : `/${rawRelUrl}`}`)
            : (relId && relUrlName ? `https://www.pinterest.com/ideas/${encodeURIComponent(relUrlName)}/${encodeURIComponent(relId)}/` : null);
          discoveredRelatedOut.push({
            keyword: relName,
            source: 'related_interest',
            is_related_interest: true,
            interest_id: relId,
            idea_url: resolvedIdeaUrl,
            has_taxonomy: Boolean(relId)
          });
        }
      }
    }))
  );

  return { enrichedCount, failedCount, rateLimited };
}

/**
 * Phase 1 (Fast Build): Generates a complete deduplicated Keyword Cluster for `seedKeyword`
 * across Pinterest Trends (4 tabs), Typeahead Expansion (with Account separation), and Idea Page.
 */
export async function buildNewbornKeywordCluster(sql, options = {}) {
  const seedKeyword = normalizeClusterTerm(options.seedKeyword || options.seed_keyword || options.keyword || options.query);
  if (!seedKeyword || seedKeyword.length < 2) {
    const err = new Error('A seed_keyword (min 2 chars) is required to build a Keyword Cluster.');
    err.status = 400;
    throw err;
  }

  const country = /^[A-Z]{2}$/.test(String(options.country || '').toUpperCase())
    ? String(options.country).toUpperCase()
    : 'US';
  const l1Interest = String(options.l1Interest || options.l1_interest || options.interest || 'all').trim().toLowerCase() || 'all';
  const includeTerms = (Array.isArray(options.includeTerms || options.include_terms)
    ? (options.includeTerms || options.include_terms)
    : String(options.includeTerms || options.include_terms || '').split(','))
    .map(normalizeClusterTerm)
    .filter(Boolean);
  const effectiveIncludeTerms = Array.from(new Set([seedKeyword, ...includeTerms]));
  const excludeTerms = (Array.isArray(options.excludeTerms || options.exclude_terms)
    ? (options.excludeTerms || options.exclude_terms)
    : String(options.excludeTerms || options.exclude_terms || '').split(','))
    .map(normalizeClusterTerm)
    .filter(Boolean);

  const enrichLimit = Math.max(5, Math.min(25, Number(options.enrichLimit ?? options.enrich_limit ?? 20) || 20));
  const trendsLimitPerTab = Math.max(5, Math.min(50, Number(options.trendsLimitPerTab ?? 25) || 25));

  const fetchImpl = options.routerOptions?.fetchImpl ||
    (typeof options.env?.NEWBORN_FETCH_IMPL === 'function' ? options.env.NEWBORN_FETCH_IMPL : undefined);

  // Cluster building is strictly Zero-Cookie!
  const router = options.router || new NewbornCookieRouter({
    rawCookie: '',
    ...(options.routerOptions || {}),
    ...(fetchImpl ? { fetchImpl } : {})
  });

  const startedAtMs = Date.now();

  // 1. Resolve shared Trends latest_available_date ONCE before parallel 4-tab queries
  const latestDate = await resolveTrendsLatestAvailableDate(router).catch(() => null);

  // 2. Parallel discovery across: 4 Trends Tabs + Typeahead Expansion + Seed Idea Page
  const typeaheadQueries = buildTypeaheadExpansionQueries(seedKeyword, l1Interest);
  const typeaheadSem = new Semaphore(4);

  const [trendsTabResults, typeaheadResults, ideaPageRes] = await Promise.all([
    Promise.all(
      TREND_TABS.map((tab) =>
        harvestGrowingTrendsSurface(router, {
          country,
          trendType: tab,
          l1Interest,
          limit: trendsLimitPerTab,
          fetch90dForecast: false,
          includeTerms: effectiveIncludeTerms,
          excludeTerms,
          endDate: latestDate
        }).catch(() => ({ ok: false, trend_type: tab, trends: [] }))
      )
    ),
    Promise.all(
      typeaheadQueries.map((tq) => typeaheadSem.run(() =>
        fetchKeywordTypeahead(tq, {
          count: 12,
          ...(fetchImpl ? { fetchImpl } : {})
        }).catch(() => ({ success: false, term: tq, suggestions: [], accounts: [] }))
      ))
    ),
    resolveIdeaPageIntelligence(seedKeyword, { router, country }).catch(() => null)
  ]);

  const rawEntries = [
    {
      keyword: seedKeyword,
      source: 'seed',
      volume: ideaPageRes?.found ? ideaPageRes.internal_search_count : null,
      interest_id: ideaPageRes?.found ? ideaPageRes.id : null,
      idea_url: ideaPageRes?.found ? ideaPageRes.idea_url : null,
      has_taxonomy: Boolean(ideaPageRes?.found),
      weekly_change: ideaPageRes?.weekly_change ?? null,
      monthly_change: ideaPageRes?.monthly_change ?? null,
      yearly_change: ideaPageRes?.yearly_change ?? null,
      volume_enriched: Boolean(ideaPageRes?.found),
      volume_rechecked_v2: Boolean(ideaPageRes?.found)
    }
  ];

  // Collect Trends 4 tabs
  const trendsCountsByTab = {};
  for (const tabRes of trendsTabResults) {
    const tabName = tabRes?.trend_type || 'growing';
    const list = Array.isArray(tabRes?.trends) ? tabRes.trends : [];
    trendsCountsByTab[tabName] = list.length;
    for (const tr of list) {
      rawEntries.push({
        keyword: tr.term,
        source: 'trends',
        trend_type: tabName,
        l1_interest: tr.l1_interest || (l1Interest !== 'all' ? l1Interest : null),
        weekly_change: tr.weekly_change,
        monthly_change: tr.monthly_change,
        yearly_change: tr.yearly_change,
        trends_search_count: Number.isFinite(Number(tr.search_count)) && Number(tr.search_count) > 0 ? Math.round(Number(tr.search_count)) : null,
        has_prediction: Boolean(tr.has_prediction),
        predicted_peak_date: tr.predicted_peak_date || null,
        predicted_90d_growth: tr.predicted_90d_growth ?? null,
        is_predicted_peak_rising: Boolean(tr.is_predicted_peak_rising)
      });
    }
  }

  // Collect Typeahead suggestions + separate user accounts (e.g. melissa_taylor2)
  const discoveredAccountsMap = new Map();
  let typeaheadSuggestionCount = 0;
  for (let qIdx = 0; qIdx < typeaheadResults.length; qIdx++) {
    const taRes = typeaheadResults[qIdx];
    const suggestions = taRes?.suggestions || [];
    for (let sIdx = 0; sIdx < suggestions.length; sIdx++) {
      typeaheadSuggestionCount++;
      rawEntries.push({
        keyword: suggestions[sIdx],
        source: 'typeahead',
        _ta_rank: qIdx === 0 ? (sIdx + 1) : (10 + sIdx + 1)
      });
    }
    for (const acc of (taRes?.accounts || [])) {
      if (acc?.username && !discoveredAccountsMap.has(acc.username)) {
        discoveredAccountsMap.set(acc.username, acc);
      }
    }
  }

  // Collect Related Interests & Idea Pivots from Seed Idea Page
  if (ideaPageRes?.found) {
    for (const rel of (ideaPageRes.related_interests || [])) {
      rawEntries.push({
        keyword: rel.name || rel.key,
        source: 'related_interest',
        is_related_interest: true,
        interest_id: rel.id || null,
        idea_url: rel.url || null,
        has_taxonomy: Boolean(rel.id)
      });
    }
    for (const piv of (ideaPageRes.ideas_pivots || [])) {
      rawEntries.push({
        keyword: piv.full_name || piv.label,
        source: 'idea_pivot',
        is_related_interest: true,
        interest_id: piv.id || null,
        idea_url: piv.url || null,
        has_taxonomy: Boolean(piv.id)
      });
    }
  }

  // 3. Initial deduplication & prioritization
  let mergedKeywords = mergeClusterKeywordEntries(rawEntries, { excludeTerms });

  // 4. Single batched Predicted Peaks call + bounded Phase-1 Volume enrichment (top 20–25)
  const toEnrichVolume = mergedKeywords
    .filter((k) => !k.volume_enriched)
    .slice(0, enrichLimit);

  const discoveredRelatedFromTop = [];
  const [, enrichStats] = await Promise.all([
    enrichPredictedPeaksBatch(router, mergedKeywords.slice(0, 24), country),
    enrichKeywordsInterestVolumes(router, toEnrichVolume, {
      discoveredRelatedOut: discoveredRelatedFromTop,
      seedKeyword,
      country
    })
  ]);

  // Re-score & re-sort after Volume + Predicted Peaks + Related Interests enrichment
  mergedKeywords = mergeClusterKeywordEntries([...mergedKeywords, ...discoveredRelatedFromTop], { excludeTerms });

  const discoveredAccounts = Array.from(discoveredAccountsMap.values());
  const enrichedCount = mergedKeywords.filter((k) => k.volume_enriched).length;
  const failedVolumeCount = mergedKeywords.filter((k) => k.volume_error && !k.volume_enriched).length;
  const remainingUnenrichedCount = Math.max(0, mergedKeywords.length - enrichedCount);
  const buildMs = Date.now() - startedAtMs;

  const metadata = sanitizeForJsonb({
    build_ms: buildMs,
    latest_trends_date: latestDate,
    trends_counts_by_tab: trendsCountsByTab,
    typeahead_queries_run: typeaheadQueries.length,
    typeahead_suggestions_raw: typeaheadSuggestionCount,
    remaining_unenriched_count: remainingUnenrichedCount,
    failed_volume_count: failedVolumeCount,
    phase1_rate_limited: Boolean(enrichStats?.rateLimited)
  });

  const wid = Number.isInteger(Number(options.workspaceId)) && Number(options.workspaceId) > 0 ? Number(options.workspaceId) : 1;
  const fid = options.folderId !== null && options.folderId !== undefined && Number(options.folderId) > 0 ? Number(options.folderId) : null;

  let effectiveIdeaPage = ideaPageRes || {};
  const enrichedSeedRow = mergedKeywords.find((k) => k.keyword === seedKeyword);
  if ((!effectiveIdeaPage || !effectiveIdeaPage.found) && enrichedSeedRow && enrichedSeedRow.interest_id && enrichedSeedRow.has_taxonomy) {
    const seedSlug = slugifyInterestTerm(seedKeyword);
    const seedUrlMatch = String(enrichedSeedRow.idea_url || '').match(/\/ideas\/([^/?#]+)/i);
    let seedUrlName = seedSlug;
    if (seedUrlMatch?.[1]) {
      try { seedUrlName = decodeURIComponent(seedUrlMatch[1]); } catch (_) { seedUrlName = seedUrlMatch[1]; }
    }
    const seedVol = Number(enrichedSeedRow.volume || 0);
    effectiveIdeaPage = {
      ...(effectiveIdeaPage && typeof effectiveIdeaPage === 'object' ? effectiveIdeaPage : {}),
      found: true,
      term: seedKeyword,
      id: String(enrichedSeedRow.interest_id),
      key: seedKeyword,
      url_name: seedUrlName,
      idea_url: enrichedSeedRow.idea_url || `https://www.pinterest.com/ideas/${encodeURIComponent(seedUrlName)}/${encodeURIComponent(enrichedSeedRow.interest_id)}/`,
      internal_search_count: seedVol,
      formatted_volume: seedVol > 0 ? seedVol.toLocaleString('en-US') : '0',
      weekly_change: effectiveIdeaPage?.weekly_change ?? enrichedSeedRow.weekly_change ?? null,
      monthly_change: effectiveIdeaPage?.monthly_change ?? enrichedSeedRow.monthly_change ?? null,
      yearly_change: effectiveIdeaPage?.yearly_change ?? enrichedSeedRow.yearly_change ?? null,
      related_interests: Array.isArray(effectiveIdeaPage?.related_interests) && effectiveIdeaPage.related_interests.length > 0
        ? effectiveIdeaPage.related_interests
        : discoveredRelatedFromTop.slice(0, 12).map((r) => ({
            name: r.keyword,
            key: r.keyword,
            id: String(r.interest_id || ''),
            url: r.idea_url || ''
          }))
    };
  }

  const cleanIdeaPage = sanitizeForJsonb(effectiveIdeaPage);
  let persistedId = null;
  let createdAt = new Date().toISOString();

  if (sql && typeof sql === 'function') {
    let row;
    try {
      const rows = await sql`
        INSERT INTO newborn_keyword_clusters (
          seed_keyword, country, l1_interest, include_terms, exclude_terms,
          idea_page, keywords, discovered_accounts, keyword_count, enriched_count,
          status, metadata, created_at, updated_at, workspace_id, folder_id
        )
        VALUES (
          ${seedKeyword},
          ${country},
          ${l1Interest},
          ${JSON.stringify(effectiveIncludeTerms)}::jsonb,
          ${JSON.stringify(excludeTerms)}::jsonb,
          ${JSON.stringify(cleanIdeaPage)}::jsonb,
          ${JSON.stringify(sanitizeForJsonb(mergedKeywords))}::jsonb,
          ${JSON.stringify(sanitizeForJsonb(discoveredAccounts))}::jsonb,
          ${mergedKeywords.length},
          ${enrichedCount},
          'ready',
          ${JSON.stringify(metadata)}::jsonb,
          NOW(),
          NOW(),
          ${wid},
          ${fid}
        )
        RETURNING id, created_at, updated_at;
      `;
      row = rows?.[0];
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      const rows = await sql`
        INSERT INTO newborn_keyword_clusters (
          seed_keyword, country, l1_interest, include_terms, exclude_terms,
          idea_page, keywords, discovered_accounts, keyword_count, enriched_count,
          status, metadata, created_at, updated_at
        )
        VALUES (
          ${seedKeyword},
          ${country},
          ${l1Interest},
          ${JSON.stringify(effectiveIncludeTerms)}::jsonb,
          ${JSON.stringify(excludeTerms)}::jsonb,
          ${JSON.stringify(cleanIdeaPage)}::jsonb,
          ${JSON.stringify(sanitizeForJsonb(mergedKeywords))}::jsonb,
          ${JSON.stringify(sanitizeForJsonb(discoveredAccounts))}::jsonb,
          ${mergedKeywords.length},
          ${enrichedCount},
          'ready',
          ${JSON.stringify(metadata)}::jsonb,
          NOW(),
          NOW()
        )
        RETURNING id, created_at, updated_at;
      `;
      row = rows?.[0];
    }
    if (row?.id) {
      persistedId = Number(row.id);
      createdAt = row.created_at ? new Date(row.created_at).toISOString() : createdAt;
    }
  }

  return {
    id: persistedId,
    workspace_id: wid,
    folder_id: fid,
    seed_keyword: seedKeyword,
    country,
    l1_interest: l1Interest,
    include_terms: effectiveIncludeTerms,
    exclude_terms: excludeTerms,
    idea_page: cleanIdeaPage,
    keywords: mergedKeywords,
    discovered_accounts: discoveredAccounts,
    keyword_count: mergedKeywords.length,
    enriched_count: enrichedCount,
    failed_volume_count: failedVolumeCount,
    remaining_unenriched_count: remainingUnenrichedCount,
    status: 'ready',
    last_run_id: null,
    metadata,
    created_at: createdAt
  };
}

/**
 * Phase 2 (On-Demand): Enriches remaining unenriched keywords in a persisted cluster
 * in bounded batches (`Semaphore(5)`), avoiding timeout & rate-limit storms.
 */
export async function enrichClusterRemainingVolumes(sql, clusterId, options = {}) {
  const numericId = Number(clusterId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Valid numeric cluster_id is required.');
    err.status = 400;
    throw err;
  }

  const wid = Number.isInteger(Number(options.workspaceId)) && Number(options.workspaceId) > 0
    ? Number(options.workspaceId)
    : null;

  let rows;
  try {
    rows = wid !== null
      ? await sql`
          SELECT * FROM newborn_keyword_clusters
          WHERE id = ${numericId} AND workspace_id = ${wid}
          LIMIT 1;
        `
      : await sql`
          SELECT * FROM newborn_keyword_clusters WHERE id = ${numericId} LIMIT 1;
        `;
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== null && wid !== 1) {
      const notFound = new Error(`Keyword cluster #${numericId} not found.`);
      notFound.status = 404;
      throw notFound;
    }
    rows = await sql`
      SELECT * FROM newborn_keyword_clusters WHERE id = ${numericId} LIMIT 1;
    `;
  }
  const existing = rows?.[0];
  if (!existing) {
    const err = new Error(`Keyword cluster #${numericId} not found.`);
    err.status = 404;
    throw err;
  }

  const batchLimit = Math.max(1, Math.min(50, Number(options.batchLimit ?? options.limit ?? 25) || 25));
  const retryKeywords = Array.isArray(options.retryKeywords || options.retry_keywords)
    ? (options.retryKeywords || options.retry_keywords).map(normalizeClusterTerm).filter(Boolean)
    : [];
  const retryKeywordsSet = new Set(retryKeywords);
  const retryErrorsOnly = Boolean(options.retryErrorsOnly || options.retry_errors);

  const fetchImpl = options.routerOptions?.fetchImpl ||
    (typeof options.env?.NEWBORN_FETCH_IMPL === 'function' ? options.env.NEWBORN_FETCH_IMPL : undefined);
  const router = options.router || new NewbornCookieRouter({
    rawCookie: '',
    ...(options.routerOptions || {}),
    ...(fetchImpl ? { fetchImpl } : {})
  });

  const currentKeywords = Array.isArray(existing.keywords) ? existing.keywords.map((k) => ({ ...k })) : [];

  let pending = [];
  if (retryKeywordsSet.size > 0) {
    // Explicit single or multi-keyword retry: reset error & volume_enriched so they are freshly fetched
    pending = currentKeywords
      .filter((k) => retryKeywordsSet.has(normalizeClusterTerm(k.keyword)))
      .slice(0, batchLimit);
    for (const row of pending) {
      row.volume_enriched = false;
      row.volume_error = false;
      row.volume_error_reason = null;
    }
  } else if (retryErrorsOnly) {
    pending = currentKeywords
      .filter((k) => !k.volume_enriched && k.volume_error)
      .slice(0, batchLimit);
    for (const row of pending) {
      row.volume_error = false;
      row.volume_error_reason = null;
    }
  } else {
    // Prioritize never-attempted keywords first, then previously errored keywords,
    // then official Taxonomy keywords stuck at 0/null volume,
    // and finally legacy zero/null-volume rows not yet re-checked under the v2 taxonomy logic.
    const neverAttempted = currentKeywords.filter((k) => !k.volume_enriched && !k.volume_error);
    const errored = currentKeywords.filter((k) => !k.volume_enriched && k.volume_error);
    const zeroVolTaxonomy = currentKeywords.filter(
      (k) => k.volume_enriched && k.has_taxonomy === true && (!k.volume || Number(k.volume) <= 0)
    );
    const staleZeroVolUnchecked = currentKeywords.filter(
      (k) => k.volume_enriched && k.has_taxonomy !== true && (!k.volume || Number(k.volume) <= 0) && !k.volume_rechecked_v2
    );
    pending = [...neverAttempted, ...errored, ...zeroVolTaxonomy, ...staleZeroVolUnchecked].slice(0, batchLimit);
    for (const row of pending) {
      if ((!row.volume || Number(row.volume) <= 0) && (row.has_taxonomy === true || !row.volume_rechecked_v2)) {
        row.volume_enriched = false;
      }
    }
  }

  let newlyEnriched = 0;
  let newlyFailed = 0;
  let rateLimited = false;
  if (pending.length > 0) {
    const enrichStats = await enrichKeywordsInterestVolumes(router, pending, {
      seedKeyword: existing.seed_keyword || '',
      country: existing.country || 'US'
    });
    newlyEnriched = enrichStats.enrichedCount;
    newlyFailed = enrichStats.failedCount;
    rateLimited = enrichStats.rateLimited;
    await enrichPredictedPeaksBatch(router, pending, existing.country || 'US');
  }

  const reMerged = mergeClusterKeywordEntries(currentKeywords, {
    excludeTerms: Array.isArray(existing.exclude_terms) ? existing.exclude_terms : []
  });
  let updatedIdeaPage = existing.idea_page && typeof existing.idea_page === 'object' ? existing.idea_page : {};
  const seedTerm = normalizeClusterTerm(existing.seed_keyword);
  const reMergedSeed = seedTerm ? reMerged.find((k) => k.keyword === seedTerm) : null;
  if ((!updatedIdeaPage || !updatedIdeaPage.found) && reMergedSeed && reMergedSeed.interest_id && reMergedSeed.has_taxonomy) {
    const seedSlug = slugifyInterestTerm(seedTerm);
    const seedUrlMatch = String(reMergedSeed.idea_url || '').match(/\/ideas\/([^/?#]+)/i);
    let seedUrlName = seedSlug;
    if (seedUrlMatch?.[1]) {
      try { seedUrlName = decodeURIComponent(seedUrlMatch[1]); } catch (_) { seedUrlName = seedUrlMatch[1]; }
    }
    const seedVol = Number(reMergedSeed.volume || 0);
    updatedIdeaPage = sanitizeForJsonb({
      ...updatedIdeaPage,
      found: true,
      term: seedTerm,
      id: String(reMergedSeed.interest_id),
      key: seedTerm,
      url_name: seedUrlName,
      idea_url: reMergedSeed.idea_url || `https://www.pinterest.com/ideas/${encodeURIComponent(seedUrlName)}/${encodeURIComponent(reMergedSeed.interest_id)}/`,
      internal_search_count: seedVol,
      formatted_volume: seedVol > 0 ? seedVol.toLocaleString('en-US') : '0',
      weekly_change: updatedIdeaPage?.weekly_change ?? reMergedSeed.weekly_change ?? null,
      monthly_change: updatedIdeaPage?.monthly_change ?? reMergedSeed.monthly_change ?? null,
      yearly_change: updatedIdeaPage?.yearly_change ?? reMergedSeed.yearly_change ?? null
    });
  }
  const enrichedCount = reMerged.filter((k) => k.volume_enriched).length;
  const failedVolumeCount = reMerged.filter((k) => k.volume_error && !k.volume_enriched).length;
  const remainingCount = Math.max(0, reMerged.length - enrichedCount);
  const unattemptedCount = reMerged.filter((k) => !k.volume_enriched && !k.volume_error).length;
  const updatedMeta = sanitizeForJsonb({
    ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
    remaining_unenriched_count: remainingCount,
    failed_volume_count: failedVolumeCount,
    unattempted_volume_count: unattemptedCount,
    last_batch_rate_limited: rateLimited,
    last_enriched_at: new Date().toISOString()
  });

  try {
    if (wid !== null) {
      await sql`
        UPDATE newborn_keyword_clusters
        SET
          idea_page = ${JSON.stringify(sanitizeForJsonb(updatedIdeaPage))}::jsonb,
          keywords = ${JSON.stringify(sanitizeForJsonb(reMerged))}::jsonb,
          keyword_count = ${reMerged.length},
          enriched_count = ${enrichedCount},
          metadata = ${JSON.stringify(updatedMeta)}::jsonb,
          updated_at = NOW()
        WHERE id = ${numericId} AND workspace_id = ${wid};
      `;
    } else {
      await sql`
        UPDATE newborn_keyword_clusters
        SET
          idea_page = ${JSON.stringify(sanitizeForJsonb(updatedIdeaPage))}::jsonb,
          keywords = ${JSON.stringify(sanitizeForJsonb(reMerged))}::jsonb,
          keyword_count = ${reMerged.length},
          enriched_count = ${enrichedCount},
          metadata = ${JSON.stringify(updatedMeta)}::jsonb,
          updated_at = NOW()
        WHERE id = ${numericId};
      `;
    }
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== null && wid !== 1) {
      const notFound = new Error(`Keyword cluster #${numericId} not found.`);
      notFound.status = 404;
      throw notFound;
    }
    await sql`
      UPDATE newborn_keyword_clusters
      SET
        idea_page = ${JSON.stringify(sanitizeForJsonb(updatedIdeaPage))}::jsonb,
        keywords = ${JSON.stringify(sanitizeForJsonb(reMerged))}::jsonb,
        keyword_count = ${reMerged.length},
        enriched_count = ${enrichedCount},
        metadata = ${JSON.stringify(updatedMeta)}::jsonb,
        updated_at = NOW()
      WHERE id = ${numericId};
    `;
  }

  return {
    id: numericId,
    seed_keyword: existing.seed_keyword,
    country: existing.country,
    l1_interest: existing.l1_interest,
    include_terms: existing.include_terms || [],
    exclude_terms: existing.exclude_terms || [],
    idea_page: updatedIdeaPage,
    keywords: reMerged,
    discovered_accounts: existing.discovered_accounts || [],
    keyword_count: reMerged.length,
    enriched_count: enrichedCount,
    newly_enriched_count: newlyEnriched,
    newly_failed_count: newlyFailed,
    failed_volume_count: failedVolumeCount,
    unattempted_volume_count: unattemptedCount,
    remaining_unenriched_count: remainingCount,
    rate_limited: rateLimited,
    status: existing.status || 'ready',
    last_run_id: existing.last_run_id ? Number(existing.last_run_id) : null,
    metadata: updatedMeta,
    created_at: existing.created_at
  };
}

export async function listNewbornKeywordClusters(sql, { limit = 20, workspaceId = 1, folderId = null } = {}) {
  if (!sql || typeof sql !== 'function') return [];
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;
  const fid = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;
  try {
    const rows = fid !== null
      ? await sql`
          SELECT
            id, workspace_id, folder_id, seed_keyword, country, l1_interest, include_terms, exclude_terms,
            keyword_count, enriched_count, status, last_run_id, metadata, created_at, updated_at
          FROM newborn_keyword_clusters
          WHERE workspace_id = ${wid} AND folder_id = ${fid}
          ORDER BY updated_at DESC, id DESC
          LIMIT ${lim};
        `
      : await sql`
          SELECT
            id, workspace_id, folder_id, seed_keyword, country, l1_interest, include_terms, exclude_terms,
            keyword_count, enriched_count, status, last_run_id, metadata, created_at, updated_at
          FROM newborn_keyword_clusters
          WHERE workspace_id = ${wid}
          ORDER BY updated_at DESC, id DESC
          LIMIT ${lim};
        `;
    return rows || [];
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== 1) return [];
    const rows = await sql`
      SELECT
        id, seed_keyword, country, l1_interest, include_terms, exclude_terms,
        keyword_count, enriched_count, status, last_run_id, metadata, created_at, updated_at
      FROM newborn_keyword_clusters
      ORDER BY updated_at DESC, id DESC
      LIMIT ${lim};
    `;
    return rows || [];
  }
}

export async function getNewbornKeywordClusterById(sql, clusterId, { workspaceId = null } = {}) {
  if (!sql || typeof sql !== 'function') return null;
  const numericId = Number(clusterId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : null;
  let rows;
  try {
    rows = wid !== null
      ? await sql`SELECT * FROM newborn_keyword_clusters WHERE id = ${numericId} AND workspace_id = ${wid} LIMIT 1;`
      : await sql`SELECT * FROM newborn_keyword_clusters WHERE id = ${numericId} LIMIT 1;`;
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== null && wid !== 1) return null;
    rows = await sql`SELECT * FROM newborn_keyword_clusters WHERE id = ${numericId} LIMIT 1;`;
  }
  const row = rows?.[0] || null;
  if (!row) return null;
  const keywords = Array.isArray(row.keywords) ? row.keywords : [];
  const enrichedCount = keywords.filter((k) => k.volume_enriched).length;
  const failedVolumeCount = keywords.filter((k) => k.volume_error && !k.volume_enriched).length;
  return {
    ...row,
    id: Number(row.id),
    enriched_count: enrichedCount,
    failed_volume_count: failedVolumeCount,
    last_run_id: row.last_run_id ? Number(row.last_run_id) : null,
    remaining_unenriched_count: Math.max(0, keywords.length - enrichedCount)
  };
}
