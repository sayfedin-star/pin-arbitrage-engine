/**
 * Keyword Analytics, Outlier Suppression & Intelligence Calculator
 *
 * Implements:
 * - Statistical Winsorization for Bot Anomaly & Surge Protection
 * - Clean String Pin Title Normalization & Extraction
 * - Keyword SERP Intelligence Summary & Opportunity Scoring
 *
 * // [INVARIANT: UNIFIED-POSTGRES-SSOT]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import {
  resolveCanonicalPinTitle,
  extractCanonicalAnnotations,
  normalizeCleanDomain
} from '../../domain/pin-intelligence.mjs';

/**
 * Safely normalizes raw JSON/object metadata into a clean JS object.
 */
export function safeNormalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '""' || trimmed === "''") return {};
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (_) {}
      }
      return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Statistical Winsorization for Outlier Suppression (Bot Spike & Anomaly Protection)
 * Caps extreme outliers above the upperPercentile (default 95th percentile) to prevent
 * single-pin bot surges from skewing aggregate velocity and SEO scores.
 */
export function winsorize(values, upperPercentile = 0.95) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sorted.length * upperPercentile);
  const cutoffValue = sorted[Math.min(cutoffIndex, sorted.length - 1)];
  return values.map(v => Math.min(v, cutoffValue));
}

/**
 * Safely extracts clean string title from raw Pinterest items using canonical domain intelligence SSOT.
 */
export function extractPinTitle(item, fallbackQuery = '') {
  if (!item) return fallbackQuery ? `${fallbackQuery} Idea` : 'Pinterest Pin Idea';
  const resolved = resolveCanonicalPinTitle(item);
  if (resolved && resolved !== 'Pinterest Pin') {
    return resolved;
  }
  return fallbackQuery ? `${fallbackQuery} Idea` : 'Pinterest Pin Idea';
}

/**
 * Helper to calculate numeric median of an array
 */
export function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].filter(n => typeof n === 'number' && !isNaN(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Algorithmic Opportunity & SERP Intelligence Calculation:
 * Evaluates the Top 12 pins (official SERP ranking threshold) to determine:
 * 1. Opportunity Verdict: "Can a new Pin rank here?"
 *    - New Pins Rank: % of top 12 posted within 90 days (>= 33% -> PASS)
 *    - Small Accounts Rank: % of top 12 from accounts with < 1,000 followers (>= 50% -> PASS)
 *    - Saves Don't Decide Rank: Pins in top 10 with < 100 saves (>= 2 pins -> PASS)
 *    - Overall: 3 PASS -> "Wide Open" (green), 2 PASS -> "Competitive" (yellow), <2 PASS -> "Locked / Difficult" (red)
 * 2. SERP Benchmarks (Medians for saves, age, followers, daily velocity)
 * 3. Winning Formats & Dimensions (% organic, % video, % idea, % 1:2 Extra Tall, % 2:3 Standard)
 * 4. Copywriting Patterns (Average title length, numbers in titles, destination links)
 * 5. Semantic Visual Annotations Cloud (Top co-occurring computer-vision tags across top pins)
 */
export function calculateKeywordIntelligenceSummary(pins = []) {
  if (!pins || pins.length === 0) {
    return {
      avg_saves: 0,
      median_saves: 0,
      unique_domains_count: 0,
      repeated_domains_count: 0,
      top_domain: 'N/A',
      top_domain_share: 0,
      domain_breakdown: [],
      repeated_domains: [],
      opportunity: {
        verdict: 'UNKNOWN',
        badge: 'No Data',
        score: 0,
        opportunity_score: 0,
        summary: 'No snapshot pins indexed yet. Run a SERP crawl to analyze.',
        criteria: []
      },
      benchmarks: {
        median_saves: 0,
        avg_saves: 0,
        median_age_days: 0,
        median_followers: 0,
        median_velocity: 0
      },
      formats: { organic_pct: 0, video_pct: 0, idea_pct: 0, product_pct: 0 },
      aspect_ratios: { standard_pct: 0, extra_tall_pct: 0, square_wide_pct: 0 },
      copywriting: {
        avg_title_words: 0,
        avg_title_chars: 0,
        numbers_in_title_pct: 0,
        has_destination_pct: 0
      },
      visual_annotations: []
    };
  }

  // Sort strictly by rank_position ascending (null/0 ranks sort last, never ahead of #1)
  const sortedPins = [...pins].sort((a, b) => {
    const rA = Number(a.rank_position);
    const rB = Number(b.rank_position);
    return (Number.isFinite(rA) && rA > 0 ? rA : 999999) - (Number.isFinite(rB) && rB > 0 ? rB : 999999);
  });
  const top12 = sortedPins.slice(0, 12);
  const top10 = sortedPins.slice(0, 10);
  const total = sortedPins.length;

  // Criteria 1: New Pins Rank (% of top 12 posted within 90 days)
  let newPinsCount = 0;
  let newPinsEvaluated = 0;
  for (const p of top12) {
    const age = p.metadata?.pin_age_days;
    if (age !== null && age !== undefined && !isNaN(Number(age))) {
      newPinsEvaluated++;
      if (Number(age) <= 90) newPinsCount++;
    }
  }
  const newPinsPct = newPinsEvaluated > 0 ? Math.round((newPinsCount / newPinsEvaluated) * 100) : 0;
  const newPinsPass = newPinsCount >= 4 || newPinsPct >= 33;

  // Criteria 2: Small Accounts Rank (% of top 12 with < 1,000 followers)
  let smallAccountsCount = 0;
  let smallAccountsEvaluated = 0;
  for (const p of top12) {
    const followers = p.metadata?.pinner?.follower_count;
    if (followers !== null && followers !== undefined && !isNaN(Number(followers))) {
      smallAccountsEvaluated++;
      if (Number(followers) < 1000) smallAccountsCount++;
    }
  }
  const smallAccountsPct = smallAccountsEvaluated > 0 ? Math.round((smallAccountsCount / smallAccountsEvaluated) * 100) : 0;
  const smallAccountsPass = smallAccountsCount >= 6 || smallAccountsPct >= 50;

  // Criteria 3: Saves Don't Decide Rank (Pins in top 10 with < 100 saves >= 2)
  let lowSaveCount = 0;
  for (const p of top10) {
    const saves = Number(p.save_count || 0);
    if (saves < 100) lowSaveCount++;
  }
  const lowSavesPass = lowSaveCount >= 2;

  // Overall Opportunity Score & Verdict
  let criteriaScore = 0;
  if (newPinsPass) criteriaScore++;
  if (smallAccountsPass) criteriaScore++;
  if (lowSavesPass) criteriaScore++;

  let verdict = 'LOCKED';
  let badge = 'Locked / Difficult';
  let summary = 'Dominated by legacy authority accounts and high-save pins. High barrier for fresh pins.';
  if (criteriaScore === 3) {
    verdict = 'WIDE_OPEN';
    badge = 'Wide Open';
    summary = 'Prime Arbitrage Target! Fresh pins and low-follower creators rank easily in the top 12.';
  } else if (criteriaScore === 2) {
    verdict = 'COMPETITIVE';
    badge = 'Moderate / Competitive';
    summary = 'Healthy opportunity: balanced mix of authority content and fresh ranking breakthroughs.';
  }
  const opportunityScorePct = Math.round((criteriaScore / 3) * 100);

  const criteriaList = [
    {
      id: 'new_pins_rank',
      name: 'New Pins Rank (Freshness Weight)',
      pass: newPinsPass,
      metric: `${newPinsCount}/${newPinsEvaluated || top12.length} pins (${newPinsPct}%) posted <90 days`,
      benchmark: '>= 33% of top 12',
      description: 'Pinterest search algorithm actively ranks fresh content rather than decaying legacy pins.'
    },
    {
      id: 'small_accounts_rank',
      name: 'Small Accounts Rank (Democratized Distribution)',
      pass: smallAccountsPass,
      metric: `${smallAccountsCount}/${smallAccountsEvaluated || top12.length} accounts (${smallAccountsPct}%) <1,000 followers`,
      benchmark: '>= 50% of top 12',
      description: 'Account follower count is NOT a ranking barrier; content relevance drives position.'
    },
    {
      id: 'saves_dont_decide',
      name: 'Saves Don\'t Decide Rank (SERP Fluidity)',
      pass: lowSavesPass,
      metric: `${lowSaveCount} pins in top 10 with <100 saves`,
      benchmark: '>= 2 pins in top 10',
      description: 'Pins without massive accumulated historical saves can capture top 10 spots.'
    }
  ];

  // SERP Benchmarks (Medians across all pins)
  const savesArr = sortedPins.map(p => Number(p.save_count || 0));
  const ageArr = sortedPins
    .map(p => p.metadata?.pin_age_days)
    .filter(a => a !== null && a !== undefined && !isNaN(Number(a)))
    .map(Number);
  const followersArr = sortedPins
    .map(p => p.metadata?.pinner?.follower_count)
    .filter(f => f !== null && f !== undefined && !isNaN(Number(f)))
    .map(Number);
  const velocityArr = sortedPins.map(p => Number(p.daily_save_velocity || 0));

  const medianSaves = calculateMedian(savesArr);
  const medianAge = ageArr.length > 0 ? calculateMedian(ageArr) : 0;
  const medianFollowers = followersArr.length > 0 ? calculateMedian(followersArr) : 0;
  const medianVelocity = calculateMedian(velocityArr);

  // Formats Breakdown
  let organicCount = 0;
  let videoCount = 0;
  let ideaCount = 0;
  let productCount = 0;
  for (const p of sortedPins) {
    const fmt = p.metadata?.format || 'ORGANIC PIN';
    if (fmt === 'VIDEO PIN') videoCount++;
    else if (fmt === 'IDEA PIN') ideaCount++;
    else if (fmt === 'PRODUCT CARD') productCount++;
    else organicCount++;
  }

  // Aspect Ratios Breakdown
  let standardCount = 0;
  let extraTallCount = 0;
  let squareWideCount = 0;
  for (const p of sortedPins) {
    const tier = p.metadata?.aspect_ratio_tier || '';
    if (tier.includes('1:2 Extra Tall') || p.metadata?.aspect_ratio === '1:2') extraTallCount++;
    else if (tier.includes('2:3 Standard') || p.metadata?.aspect_ratio === '2:3') standardCount++;
    else squareWideCount++;
  }

  // Copywriting Patterns
  let totalWords = 0;
  let totalChars = 0;
  let withNumbers = 0;
  let withDest = 0;
  for (const p of sortedPins) {
    const title = String(p.title || '').trim();
    const words = title ? title.split(/\s+/).filter(Boolean).length : 0;
    totalWords += words;
    totalChars += title.length;
    if (/\d+/.test(title)) withNumbers++;
    const normalizedDestDomain = normalizeCleanDomain(p.domain || p.destination_url || '', { strictFqdn: true });
    const hasRealDestUrl = Boolean(p.destination_url && /^https?:\/\//i.test(String(p.destination_url).trim()));
    if (hasRealDestUrl || (normalizedDestDomain && normalizedDestDomain !== 'uploaded by user' && normalizedDestDomain !== 'uploaded-by-user' && normalizedDestDomain !== 'organic')) {
      withDest++;
    }
  }

  // Semantic Computer Vision Annotations (pin_join tags) via canonical SSOT extractor
  const tagCounts = new Map();
  for (const p of sortedPins.slice(0, 30)) {
    const rawAnns = p.metadata?.visual_annotations || p.visual_annotations || [];
    const tags = extractCanonicalAnnotations(rawAnns, { limit: 15 });
    for (const cleanTag of tags) {
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    }
  }

  const sortedAnnotations = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      pct: Math.round((count / Math.min(30, total)) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // Domain Concentration, Authority & Repeat Frequency Breakdown
  const domainMap = new Map();
  let totalSavesAll = 0;

  for (const p of sortedPins) {
    totalSavesAll += Number(p.save_count || 0);
    const d = normalizeCleanDomain(p.domain || p.destination_url || '', { strictFqdn: true });
    // Filter out unknown / user uploads / organic / empty
    if (!d || d === 'uploaded by user' || d === 'organic') {
      continue;
    }
    if (!domainMap.has(d)) {
      domainMap.set(d, {
        domain: d,
        pin_count: 0,
        total_saves: 0,
        best_rank: Number(p.rank_position || 999)
      });
    }
    const entry = domainMap.get(d);
    entry.pin_count++;
    entry.total_saves += Number(p.save_count || 0);
    entry.best_rank = Math.min(entry.best_rank, Number(p.rank_position || 999));
  }

  const allDomains = Array.from(domainMap.values())
    .map(entry => ({
      ...entry,
      share_pct: total > 0 ? Number(((entry.pin_count / total) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pin_count - a.pin_count || b.total_saves - a.total_saves);

  const repeatedDomains = allDomains.filter(d => d.pin_count > 1);
  const uniqueDomainsCount = allDomains.length;
  const repeatedDomainsCount = repeatedDomains.length;
  const topDomain = allDomains[0] ? allDomains[0].domain : 'N/A';
  const topDomainShare = allDomains[0] ? allDomains[0].share_pct : 0;
  const avgSaves = total > 0 ? Math.round(totalSavesAll / total) : 0;

  return {
    avg_saves: avgSaves,
    median_saves: medianSaves,
    unique_domains_count: uniqueDomainsCount,
    repeated_domains_count: repeatedDomainsCount,
    top_domain: topDomain,
    top_domain_share: topDomainShare,
    domain_breakdown: allDomains,
    repeated_domains: repeatedDomains,
    opportunity: {
      verdict,
      badge,
      score: criteriaScore,
      opportunity_score: opportunityScorePct,
      summary,
      criteria: criteriaList
    },
    benchmarks: {
      median_saves: medianSaves,
      avg_saves: avgSaves,
      median_age_days: medianAge,
      median_followers: medianFollowers,
      median_velocity: medianVelocity
    },
    formats: {
      organic_pct: total > 0 ? Math.round((organicCount / total) * 100) : 0,
      video_pct: total > 0 ? Math.round((videoCount / total) * 100) : 0,
      idea_pct: total > 0 ? Math.round((ideaCount / total) * 100) : 0,
      product_pct: total > 0 ? Math.round((productCount / total) * 100) : 0
    },
    aspect_ratios: {
      standard_pct: total > 0 ? Math.round((standardCount / total) * 100) : 0,
      extra_tall_pct: total > 0 ? Math.round((extraTallCount / total) * 100) : 0,
      square_wide_pct: total > 0 ? Math.round((squareWideCount / total) * 100) : 0
    },
    copywriting: {
      avg_title_words: total > 0 ? Number((totalWords / total).toFixed(1)) : 0,
      avg_title_chars: total > 0 ? Math.round(totalChars / total) : 0,
      numbers_in_title_pct: total > 0 ? Math.round((withNumbers / total) * 100) : 0,
      has_destination_pct: total > 0 ? Math.round((withDest / total) * 100) : 0
    },
    visual_annotations: sortedAnnotations
  };
}
