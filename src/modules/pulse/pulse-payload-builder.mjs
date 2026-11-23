/**
 * Global 24-Hour Algorithmic Pulse Phase C & D Payload Builders & Wire Byte-Budget Guard
 * Extracted from src/modules/pulse/service.mjs
 *
 * Pure module depending only on domain/pin-intelligence.mjs, ./pulse-normalizers.mjs, and ./pulse-cache.mjs.
 */

import { isAggregatedClusterPin } from '../../domain/pin-intelligence.mjs';
import { PULSE_MAX_PAYLOAD_BYTES } from './pulse-cache.mjs';
import {
  fastParseIsoDateMs,
  getCanonicalCreativeKey,
  extractCleanAnnotations,
  safeNum,
  isPlaceholderColor
} from './pulse-normalizers.mjs';

/**
 * Formats compact pin summary preserving 100% of Pulse UI & Blueprint fields (< 900 KB wire budget).
 * Memoized on p._summary [Wave 5A Wire-Budget Optimization]
 */
export function formatPinSummary(p) {
  if (p._summary) return p._summary;
  const cleanAnns = p.cleanAnnotations || [];
  const annStrings = (cleanAnns.length > 4 ? cleanAnns.slice(0, 4) : cleanAnns)
    .map(a => (typeof a === 'string' ? a : (a.display || a.norm || '')))
    .filter(Boolean);
  const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
  const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
  const effective24hGain = Number.isFinite(p.effective_24h_gain)
    ? p.effective_24h_gain
    : (effectiveSaves24h > effectiveRepins24h ? effectiveSaves24h : effectiveRepins24h);

  const isDomainless = Boolean(
    !p.domain ||
    p.domain === 'Uploaded by user' ||
    p.domain.includes('pinterest.') ||
    !p.destination_url
  );

  const primaryKw = (p.keywords && p.keywords[0]) ? p.keywords[0] : null;
  const kwText = p.keyword_text || primaryKw?.keyword_text || '';
  const kwId = primaryKw?.keyword_id ?? (p.keyword_id ?? null);
  const rankPosition = primaryKw?.rank_position ?? p.best_rank ?? null;
  const isVaultSurge = Boolean(p.sources && p.sources.includes('vault_surge'));
  const isDisplaced = Boolean(isVaultSurge || (p.sources && p.sources.includes('displaced')) || p.is_displaced);
  const dailyVel = p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h;
  const winGain = p.window_saves_gain ?? dailyVel;
  const overlapCount = p.overlap_count ?? (p.keywords ? p.keywords.length : 0);
  const rankClimb = p.rank_climb_24h ?? 0;
  const rawDest = p.destination_url || '';
  const qIdx = rawDest.indexOf('?');
  const cleanDest = isDomainless ? '' : (qIdx > 0 ? rawDest.slice(0, qIdx) : rawDest);
  const rawTitle = String(p.title || '').trim();
  const compactTitle = rawTitle.length > 105 ? `${rawTitle.slice(0, 104)}…` : rawTitle;
  const rawBoard = String(p.board_name || '').trim();
  const compactBoard = rawBoard.length > 48 ? `${rawBoard.slice(0, 47)}…` : rawBoard;

  const summary = {
    pin_id: String(p.pin_id),
    title: compactTitle,
    ...(annStrings.length > 0 ? { visual_annotations: annStrings } : {}),
    ...(p.keywords && p.keywords.length > 1 ? {
      keywords: p.keywords.slice(0, 2).map(k => ({
        keyword_id: k.keyword_id,
        keyword_text: k.keyword_text || '',
        rank: k.rank_position
      }))
    } : {}),
    ...(p.domain ? { domain: p.domain } : {}),
    ...(cleanDest ? { destination_url: cleanDest } : {}),
    image_url: p.image_url || '',
    ...(p.creator_username ? { creator_username: p.creator_username } : {}),
    ...(compactBoard ? { board_name: compactBoard } : {}),
    ...(!isPlaceholderColor(p.dominant_color) ? { dominant_color: p.dominant_color } : {}),
    save_count: p.save_count,
    daily_save_velocity: dailyVel,
    ...(winGain !== dailyVel ? { window_saves_gain: winGain } : {}),
    ...(p.delta_saves_24h > 0 && p.delta_saves_24h !== dailyVel ? { delta_saves_24h: p.delta_saves_24h } : {}),
    ...(p.delta_repins_24h > 0 ? { delta_repins_24h: p.delta_repins_24h } : {}),
    ...(isAggregatedClusterPin({
      daily_save_velocity: dailyVel,
      delta_repins_24h: p.delta_repins_24h,
      save_count: p.save_count,
      repin_count: p.repin_count
    }) ? { is_aggregated_cluster: true } : {}),
    ...(effective24hGain !== dailyVel ? { effective_24h_gain: effective24hGain } : {}),
    ...(p.pin_age_days != null ? { pin_age_days: p.pin_age_days } : {}),
    ...(p.is_fresh_14d ? { is_fresh_14d: true } : {}),
    ...(isDomainless ? { is_domainless_viral: true } : {}),
    ...(p.creation_method && p.creation_method !== 'pinterest_platform' ? { creation_method: p.creation_method } : {}),
    ...(kwId != null ? { keyword_id: kwId } : {}),
    ...(kwText ? { keyword_text: kwText } : {}),
    ...(rankPosition != null ? { rank_position: rankPosition } : {}),
    ...(isVaultSurge ? { is_vault_surge: true } : {}),
    ...(isDisplaced ? { is_displaced: true } : {}),
    ...(overlapCount > 1 ? { overlap_count: overlapCount } : {}),
    ...(p.best_rank != null && p.best_rank !== rankPosition ? { best_rank: p.best_rank } : {}),
    ...(rankClimb !== 0 ? { rank_climb_24h: rankClimb } : {})
  };
  p._summary = summary;
  return summary;
}

/**
 * Lightweight Memoized Matrix Pin Summary (for drill-downs & matching pins, 3 compact tag strings)
 */
export function formatMatrixPinSummary(p) {
  if (p._matrixSummary) return p._matrixSummary;
  const cleanAnns = p.cleanAnnotations || [];
  const annStrings = (cleanAnns.length > 3 ? cleanAnns.slice(0, 3) : cleanAnns)
    .map(a => (typeof a === 'string' ? a : (a.display || a.norm || '')))
    .filter(Boolean);
  const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
  const dailyVel = p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h;
  const winGain = p.window_saves_gain ?? dailyVel;
  const rawTitle = String(p.title || '').trim();
  const compactTitle = rawTitle.length > 80 ? `${rawTitle.slice(0, 79)}…` : rawTitle;

  const matrixSummary = {
    pin_id: String(p.pin_id),
    title: compactTitle,
    image_url: p.image_url || '',
    ...(p.domain ? { domain: p.domain } : {}),
    save_count: p.save_count,
    daily_save_velocity: dailyVel,
    ...(winGain !== dailyVel ? { window_saves_gain: winGain } : {}),
    ...(p.delta_repins_24h > 0 ? { delta_repins_24h: p.delta_repins_24h } : {}),
    ...(isAggregatedClusterPin({
      daily_save_velocity: dailyVel,
      delta_repins_24h: p.delta_repins_24h,
      save_count: p.save_count,
      repin_count: p.repin_count
    }) ? { is_aggregated_cluster: true } : {}),
    ...(p.pin_age_days != null ? { pin_age_days: p.pin_age_days } : {}),
    ...(annStrings.length > 0 ? { visual_annotations: annStrings } : {})
  };
  p._matrixSummary = matrixSummary;
  return matrixSummary;
}

/**
 * Partitions sorted active pins into Breakout Pins (top 250), Fresh Rockets (14d),
 * Vault Surges, Vacuum Hijack candidates, and Domainless Viral candidates.
 */
export function buildBreakoutAndSurgeFeeds({ allActivePins, paPinsList }) {
  // Unified Breakout Pins Feed (Full un-truncated surging feed with windowed UI pagination)
  const seenBreakoutIds = new Set();
  const seenCreativeKeys = new Set();
  const breakoutPinsTop250 = [];

  const hydratedPins = [];
  const skeletonPins = [];
  const freshRocketCandidates = [];
  const seenFreshRocketKeys = new Set();
  const vacuumHijackCandidates = [];
  const domainlessViralCandidates = [];
  const vaultSurgeCandidates = [];
  let domainlessViralTotalCount = 0;
  let vaultSurgeTotalCount = 0;

  for (let i = 0; i < allActivePins.length; i++) {
    const p = allActivePins[i];
    const hasGain = (p.effective_24h_gain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || (p.window_saves_gain || 0) > 0);
    if (p.is_hydrated_int === 1) {
      if ((hasGain || hydratedPins.length < 100) && hydratedPins.length < 500) {
        hydratedPins.push(p);
      }
    } else {
      if (skeletonPins.length < 15) skeletonPins.push(p);
    }
    if (freshRocketCandidates.length < 100 && p.is_fresh_14d && hasGain) {
      const cKey = getCanonicalCreativeKey(p);
      if (!cKey || !seenFreshRocketKeys.has(cKey)) {
        if (cKey) seenFreshRocketKeys.add(cKey);
        freshRocketCandidates.push(p);
      }
    }
    if (vacuumHijackCandidates.length < 25 && p.is_vacuum_hijack_target) {
      vacuumHijackCandidates.push(p);
    }
    if (p.is_domainless_viral && (hasGain || p.save_count >= 100)) {
      domainlessViralTotalCount++;
      if (domainlessViralCandidates.length < 100) {
        domainlessViralCandidates.push(p);
      }
    }
    if (p.sources && p.sources.includes('vault_surge') && hasGain) {
      vaultSurgeTotalCount++;
      if (vaultSurgeCandidates.length < 150) {
        vaultSurgeCandidates.push(p);
      }
    }
  }

  for (let i = 0; i < hydratedPins.length; i++) {
    if (breakoutPinsTop250.length >= 250) break;
    const p = hydratedPins[i];
    const cKey = getCanonicalCreativeKey(p);
    if (seenBreakoutIds.has(p.pin_id) || (cKey && seenCreativeKeys.has(cKey))) continue;
    seenBreakoutIds.add(p.pin_id);
    if (cKey) seenCreativeKeys.add(cKey);
    breakoutPinsTop250.push(formatPinSummary(p));
  }
  for (let i = 0; i < paPinsList.length; i++) {
    if (breakoutPinsTop250.length >= 250) break;
    const p = paPinsList[i];
    const cKey = getCanonicalCreativeKey(p);
    if (!seenBreakoutIds.has(p.pin_id) && (!cKey || !seenCreativeKeys.has(cKey))) {
      seenBreakoutIds.add(p.pin_id);
      if (cKey) seenCreativeKeys.add(cKey);
      breakoutPinsTop250.push(formatPinSummary(p));
    }
  }
  for (let i = 0; i < skeletonPins.length; i++) {
    if (breakoutPinsTop250.length >= 250) break;
    const p = skeletonPins[i];
    const cKey = getCanonicalCreativeKey(p);
    if (!seenBreakoutIds.has(p.pin_id) && (!cKey || !seenCreativeKeys.has(cKey))) {
      seenBreakoutIds.add(p.pin_id);
      if (cKey) seenCreativeKeys.add(cKey);
      breakoutPinsTop250.push(formatPinSummary(p));
    }
  }

  const freshRocketPinsTop100 = freshRocketCandidates.slice(0, 100).map(formatPinSummary);
  const vaultSurgePinsFormatted = vaultSurgeCandidates.slice(0, 150).map(formatPinSummary);

  return {
    breakoutPinsTop250,
    freshRocketPinsTop100,
    vaultSurgePinsFormatted,
    vacuumHijackCandidates,
    domainlessViralCandidates,
    domainlessViralTotalCount,
    vaultSurgeTotalCount
  };
}

/**
 * Section 5: Creator Breakouts (Strictly positive growth only + David Accounts boundary fix)
 */
export function buildCreatorBreakouts({ creatorBreakoutRows, minAudience, nowMs }) {
  let breakoutCreatorsCount = 0;
  const creatorBreakouts = creatorBreakoutRows
    .filter(cp => {
      const reach = Number(cp.monthly_reach || 0);
      if (minAudience > 0 && reach < minAudience) return false;
      const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
      const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
      const driverPins = Array.isArray(cp.driver_pins) ? cp.driver_pins : [];
      const maxPinVel = driverPins.reduce((max, dp) => Math.max(max, Number(dp.daily_save_velocity || dp.delta_saves_24h || 0)), 0);

      // Strictly positive growth: eliminate negative drop accounts and stagnant zero accounts with no active driver pins
      if (deltaReach < 0 && deltaViews < 0) return false;
      if (deltaReach <= 0 && deltaViews <= 0 && maxPinVel <= 0) return false;
      return true;
    })
    .map(cp => {
      const reach = Number(cp.monthly_reach || 0);
      const views = Number(cp.profile_views || 0);
      const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
      const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
      const reach7d = Number(cp.effective_reach_delta_7d || cp.reach_delta_7d || 0);
      const views7d = Number(cp.effective_views_delta_7d || cp.views_delta_7d || 0);
      const totalPins = Number(cp.total_pins || 0);
      const followers = Number(cp.follower_count || 0);

      if (deltaReach > 0 || deltaViews > 0) breakoutCreatorsCount++;

      // Filter driver pins for valid non-empty images and compute age-based velocity fallback if 24h delta is 0
      const mappedDriverPins = (Array.isArray(cp.driver_pins) ? cp.driver_pins : [])
        .filter(dp => dp && dp.image_url && typeof dp.image_url === 'string' && dp.image_url.trim().length > 0)
        .map(dp => {
          const saves = Number(dp.save_count || 0);
          let vel = Number(dp.daily_save_velocity || 0);
          let dSaves = Number(dp.delta_saves_24h || 0);
          if (vel <= 0 && dSaves <= 0 && saves > 0 && dp.created_at_pinterest) {
            const createdMs = fastParseIsoDateMs(dp.created_at_pinterest);
            if (Number.isFinite(createdMs) && createdMs < nowMs) {
              const ageDays = Math.max(1, Math.floor((nowMs - createdMs) / 86400000));
              vel = Number((saves / ageDays).toFixed(1));
            }
          }
          return {
            ...dp,
            dossier_url: '/pin/' + encodeURIComponent(dp.pin_id),
            daily_save_velocity: vel > 0 ? vel : dSaves,
            delta_saves_24h: dSaves > 0 ? dSaves : vel,
            save_count: saves,
            repin_count: Number(dp.repin_count || 0)
          };
        });
      const positiveDriverPins = mappedDriverPins.filter(dp => dp.daily_save_velocity > 0 || dp.delta_saves_24h > 0);
      const rawDriverPins = positiveDriverPins.length > 0 ? positiveDriverPins : mappedDriverPins;

      const maxPinVel = rawDriverPins.reduce((max, dp) => Math.max(max, dp.daily_save_velocity || dp.delta_saves_24h || 0), 0);
      const audiencePerPin = totalPins > 0 ? Math.round(reach / totalPins) : 0;

      // Fix 2.5: require totalPins > 0 && totalPins <= 250 && reach <= 500000 && positive delta
      const isDavidBreakout = totalPins > 0 && totalPins <= 250 && reach <= 500000 && (deltaReach >= 1000 || deltaViews >= 5000 || maxPinVel >= 20);

      let milestoneTier = 'Emerging';
      if (reach >= 10_000_000) milestoneTier = 'Titan (10M+)';
      else if (reach >= 1_000_000) milestoneTier = 'Whale (1M+)';
      else if (reach >= 250_000) milestoneTier = 'Established (250K+)';
      else if (reach >= 50_000) milestoneTier = 'Growth (50K+)';

      return {
        id: cp.id,
        username: cp.username,
        display_name: cp.display_name || cp.username,
        avatar_url: cp.avatar_url || '',
        bio: String(cp.bio || '').slice(0, 120),
        website_url: cp.website_url || '',
        monthly_reach: reach,
        profile_views: views,
        total_pins: totalPins,
        total_boards: Number(cp.total_boards || 0),
        follower_count: followers,
        effective_delta_reach_24h: deltaReach,
        effective_delta_views_24h: deltaViews,
        reach_delta_7d: reach7d,
        views_delta_7d: views7d,
        delta_pins_24h: Number(cp.delta_pins_24h || 0),
        last_synced_at: cp.last_synced_at,
        audience_per_pin: audiencePerPin,
        is_david_breakout: isDavidBreakout,
        is_david_account: isDavidBreakout,
        milestone_tier: milestoneTier,
        max_pin_velocity: maxPinVel,
        driver_pins: rawDriverPins
      };
    })
    .sort((a, b) => {
      const aReach = a.effective_delta_reach_24h;
      const bReach = b.effective_delta_reach_24h;
      if (bReach !== aReach) return bReach - aReach;
      const aReach7d = a.reach_delta_7d;
      const bReach7d = b.reach_delta_7d;
      if (bReach7d !== aReach7d) return bReach7d - aReach7d;
      if (b.max_pin_velocity !== a.max_pin_velocity) return b.max_pin_velocity - a.max_pin_velocity;
      const aGain = Math.max(a.effective_delta_reach_24h, a.effective_delta_views_24h);
      const bGain = Math.max(b.effective_delta_reach_24h, b.effective_delta_views_24h);
      if (bGain !== aGain) return bGain - aGain;
      return b.monthly_reach - a.monthly_reach;
    })
    .slice(0, 20);

  return {
    creatorBreakouts,
    breakoutCreatorsCount
  };
}

/**
 * Section 6: Keyword Vacuums & Multi-Keyword Pixie Bridges
 */
export function buildVacuumsAndBridges({ allActivePins, vacuumKwMap, keywordPinStats }) {
  const bridgePins = allActivePins
    .filter(p => p.overlap_count >= 2)
    .sort((a, b) => {
      const aSurging = (a.effective_24h_gain > 0) ? 1 : 0;
      const bSurging = (b.effective_24h_gain > 0) ? 1 : 0;
      if (bSurging !== aSurging) return bSurging - aSurging;
      if (b.effective_24h_gain !== a.effective_24h_gain) return b.effective_24h_gain - a.effective_24h_gain;
      const aKwCount = a.keywords ? a.keywords.length : (a.overlap_count || 0);
      const bKwCount = b.keywords ? b.keywords.length : (b.overlap_count || 0);
      if (bKwCount !== aKwCount) return bKwCount - aKwCount;
      return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
    })
    .slice(0, 150)
    .map(formatPinSummary);

  let totalVacuumTop10_24h = 0;
  const keywordVacuumOpportunities = Array.from(vacuumKwMap.values())
    .map(v => {
      const top10_24h = v.displaced_top10_24h_count;
      totalVacuumTop10_24h += top10_24h;
      const count24h = v.displaced_24h_count;
      const top10_7d = v.displaced_top10_7d_count;

      const kwStats = keywordPinStats.get(v.keyword_id) || {
        active_pins_count: 0,
        total_velocity: 0,
        top_pin: null
      };

      const vacuumScore = (top10_24h * 15) + (count24h * 5) + (top10_7d * 2);
      let urgency = 'STABLE';
      if (top10_24h >= 2) urgency = 'CRITICAL_VACUUM';
      else if (top10_24h >= 1) urgency = 'HIGH_VACUUM';
      else if (count24h >= 3) urgency = 'MODERATE_CHURN';

      return {
        keyword_id: v.keyword_id,
        keyword_text: v.keyword_text,
        displaced_24h_count: count24h,
        displaced_top10_24h_count: top10_24h,
        displaced_top10_7d_count: top10_7d,
        active_pins_count: kwStats.active_pins_count,
        avg_velocity: kwStats.active_pins_count > 0 ? Number((safeNum(kwStats.total_velocity) / kwStats.active_pins_count).toFixed(2)) : 0,
        top_pin: kwStats.top_pin ? {
          ...kwStats.top_pin,
          save_count: safeNum(kwStats.top_pin.save_count),
          daily_save_velocity: safeNum(kwStats.top_pin.daily_save_velocity)
        } : null,
        vacuum_score: vacuumScore,
        urgency
      };
    })
    .sort((a, b) => {
      if (b.vacuum_score !== a.vacuum_score) return b.vacuum_score - a.vacuum_score;
      return b.displaced_top10_24h_count - a.displaced_top10_24h_count;
    })
    .slice(0, 20);

  return {
    bridgePins,
    keywordVacuumOpportunities,
    totalVacuumTop10_24h
  };
}

/**
 * Section 7: Hidden Gems Telemetry (Winning Boards, Vacuum Hijacks, Domainless Virals,
 * Creation Methods, Color Palette, Top Arbitrage Domains)
 */
export function buildHiddenGemsTelemetry({
  boardStatsMap,
  vacuumHijackCandidates,
  domainlessViralCandidates,
  allActivePins,
  activeSerpRows,
  creationMethodMap,
  colorStatsMap,
  domainRollups,
  windowParam
}) {
  const winningBoards = Array.from(boardStatsMap.values())
    .map(b => ({
      board_name: b.board_name,
      creator_username: b.creator_username,
      pin_count: b.pin_count,
      total_velocity: Number(b.total_velocity.toFixed(2)),
      total_saves: b.total_saves,
      avg_velocity: b.pin_count > 0 ? Number((b.total_velocity / b.pin_count).toFixed(2)) : 0
    }))
    .sort((a, b) => {
      if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
      return b.pin_count - a.pin_count;
    })
    .slice(0, 10);

  const vacuumHijackPins = vacuumHijackCandidates.slice(0, 25).map(formatPinSummary);
  const domainlessViralPins = domainlessViralCandidates.slice(0, 100).map(formatPinSummary);

  const uniqueActiveSerpPinsCount = allActivePins.filter(p => p.sources && p.sources.includes('active_serp')).length;
  const totalActiveSerpSlots = activeSerpRows[0]?.full_count || uniqueActiveSerpPinsCount;
  const totalActivePinsCount = uniqueActiveSerpPinsCount || totalActiveSerpSlots;
  const creationMethodBreakdown = Array.from(creationMethodMap.values())
    .map(cm => ({
      method: cm.method,
      pin_count: cm.pin_count,
      total_velocity: Number(cm.total_velocity.toFixed(2)),
      pct_of_active_serp: totalActivePinsCount > 0 ? Number(((cm.pin_count / totalActivePinsCount) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pin_count - a.pin_count);

  // Dominant Color Palette exporting both pin_count and count: pin_count [Fix 2.5 SSOT]
  const dominantColorPalette = Array.from(colorStatsMap.values())
    .map(c => ({
      color: c.color,
      pin_count: c.pin_count,
      count: c.pin_count, // Dual export: pin_count AND count
      total_velocity: Number(c.total_velocity.toFixed(2)),
      avg_velocity: c.pin_count > 0 ? Number((c.total_velocity / c.pin_count).toFixed(2)) : 0,
      matching_pins: (c.matchingPins || []).slice(0, 3).map(formatMatrixPinSummary)
    }))
    .sort((a, b) => {
      const aMulti = a.pin_count >= 2 ? 1 : 0;
      const bMulti = b.pin_count >= 2 ? 1 : 0;
      if (bMulti !== aMulti) return bMulti - aMulti;
      if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
      return b.pin_count - a.pin_count;
    })
    .slice(0, 12);

  const domainRollupLookup = new Map();
  for (const dr of (domainRollups || [])) {
    if (dr && dr.domain) domainRollupLookup.set(String(dr.domain).toLowerCase(), dr);
  }

  const liveDomainMap = new Map();
  for (let i = 0; i < allActivePins.length; i++) {
    const p = allActivePins[i];
    const rawDom = String(p.domain || '').trim();
    const rawDomLower = rawDom.toLowerCase();
    const dom = (!rawDomLower || rawDomLower === 'uploaded by user' || rawDomLower === 'uploaded-by-user' || rawDomLower === 'organic')
      ? 'Uploaded by user'
      : rawDomLower;
    let dEntry = liveDomainMap.get(dom);
    if (!dEntry) {
      dEntry = {
        domain: dom,
        total_pins: 0,
        active_serp_pins: 0,
        top10_pins: 0,
        total_saves: 0,
        total_velocity: 0,
        total_repins_delta: 0,
        kwSet: new Set(),
        matchingPins: []
      };
      liveDomainMap.set(dom, dEntry);
    }
    dEntry.total_pins++;
    if (p.sources && p.sources.includes('active_serp')) dEntry.active_serp_pins++;
    if (p.best_rank != null && p.best_rank <= 10) dEntry.top10_pins++;
    dEntry.total_saves += (p.save_count || 0);
    const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
      ? p.window_saves_gain
      : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
    dEntry.total_velocity += (pinVel || 0);
    dEntry.total_repins_delta += (p.delta_repins_24h || 0);
    for (let ki = 0; ki < (p.keywords || []).length; ki++) {
      dEntry.kwSet.add(p.keywords[ki].keyword_id);
    }
    if (dEntry.matchingPins.length < 6 && p.image_url) {
      dEntry.matchingPins.push(p);
    }
  }

  const topArbitrageDomains = Array.from(liveDomainMap.values())
    .map(d => {
      const rollup = domainRollupLookup.get(d.domain) || {};
      const totalVel = Number(d.total_velocity.toFixed(2));
      const avgVel = d.total_pins > 0 ? Number((d.total_velocity / d.total_pins).toFixed(2)) : Number(rollup.avg_velocity || 0);
      return {
        domain: d.domain,
        label: d.domain,
        total_pins: d.total_pins,
        pin_count: d.total_pins,
        active_serp_pins: d.active_serp_pins,
        top10_pins: d.top10_pins,
        keywords_count: d.kwSet.size,
        visibility_score: Number(rollup.visibility_score || (d.top10_pins * 10 + d.active_serp_pins * 2)),
        total_saves: d.total_saves,
        total_velocity: totalVel,
        avg_velocity: avgVel,
        total_repins_delta: d.total_repins_delta,
        ad_network: rollup.ad_network || 'unchecked',
        age_days: Number(rollup.age_days || 0),
        ...(rollup.age_years != null ? { age_years: Number(rollup.age_years) } : {}),
        arbitrage_score: Number(rollup.arbitrage_score || totalVel),
        matching_pins: d.matchingPins.slice(0, 3).map(formatMatrixPinSummary)
      };
    })
    .sort((a, b) => {
      if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
      if (b.total_repins_delta !== a.total_repins_delta) return b.total_repins_delta - a.total_repins_delta;
      return b.total_saves - a.total_saves;
    })
    .slice(0, 25);

  return {
    winningBoards,
    vacuumHijackPins,
    domainlessViralPins,
    creationMethodBreakdown,
    dominantColorPalette,
    topArbitrageDomains,
    totalActivePinsCount,
    totalActiveSerpSlots,
    liveDomainCount: liveDomainMap.size
  };
}

/**
 * Assembles the final KPI ribbon + full Pulse payload and enforces the 900 KB wire ceiling.
 */
export function assemblePulsePayload({
  folderId,
  windowParam,
  minAudience,
  totalActivePinsCount,
  totalActiveSerpSlots,
  pinsGainingCount,
  totalSavesVelocity,
  totalRepinsDelta,
  freshRocketCount,
  breakoutCreatorsCount,
  bridgePinsCount,
  sharedCapsulesCount,
  totalVacuumTop10_24h,
  domainlessViralTotalCount,
  vaultSurgeTotalCount,
  liveDomainCount,
  matviewKpis,
  breakoutPinsTop250,
  freshRocketPinsTop100,
  vaultSurgePinsFormatted,
  paWinners,
  singleAnnotations,
  pairCrossovers,
  tripletCrossovers,
  guidedCapsuleCrossovers,
  creatorBreakouts,
  bridgePins,
  keywordVacuumOpportunities,
  winningBoards,
  vacuumHijackPins,
  domainlessViralPins,
  creationMethodBreakdown,
  dominantColorPalette,
  topArbitrageDomains
}) {
  // Section 1: Executive KPI Ribbon (incorporates mv_pulse_24h_summary with fallback)
  const kpis = {
    total_active_serp_pins: totalActivePinsCount,
    total_active_serp_slots: totalActiveSerpSlots,
    pins_gaining_24h_count: pinsGainingCount,
    total_24h_saves_velocity: Number(totalSavesVelocity.toFixed(2)),
    total_24h_repins_delta: totalRepinsDelta,
    fresh_rocket_pins_14d_count: freshRocketCount,
    breakout_creators_count: breakoutCreatorsCount,
    multi_keyword_bridge_pins_count: bridgePinsCount,
    shared_guided_capsules_count: sharedCapsulesCount,
    serp_vacuum_top10_24h_count: totalVacuumTop10_24h,
    domainless_viral_pins_count: domainlessViralTotalCount,
    vault_surge_pins_count: vaultSurgeTotalCount,
    active_pins_24h: matviewKpis?.active_pins_24h ?? totalActivePinsCount,
    active_domains_24h: matviewKpis?.active_domains_24h ?? liveDomainCount,
    active_creators_24h: matviewKpis?.active_creators_24h ?? breakoutCreatorsCount,
    avg_velocity_24h: matviewKpis?.avg_velocity_24h ?? (pinsGainingCount > 0 ? Number((totalSavesVelocity / pinsGainingCount).toFixed(2)) : 0),
    max_velocity_24h: matviewKpis?.max_velocity_24h ?? (breakoutPinsTop250[0]?.daily_save_velocity || breakoutPinsTop250[0]?.velocity || 0),
    total_delta_saves_24h: matviewKpis?.total_delta_saves_24h ?? Math.round(totalSavesVelocity),
    matview_refreshed_at: matviewKpis?.refreshed_at ?? null,
    from_matview: Boolean(matviewKpis?.from_matview)
  };

  const payload = {
    success: true,
    generated_at: new Date().toISOString(),
    filters: {
      folder_id: folderId || 'all',
      window: windowParam,
      min_audience: minAudience
    },
    kpis,
    breakout_pins: breakoutPinsTop250,
    fresh_rocket_pins: freshRocketPinsTop100,
    vault_surge_pins: vaultSurgePinsFormatted,
    pinarchive_winners: paWinners.slice(0, 10).map(p => ({
      pin_id: p.pin_id,
      account_username: p.account_username || '',
      title: String(p.title || '').slice(0, 105),
      link: p.link || '',
      domain: p.domain || '',
      board_name: p.board_name || '',
      image_url: p.image_url || '',
      dominant_color: p.dominant_color || null,
      saves: Number(p.saves || 0),
      repins: Number(p.repins || 0),
      comments: Number(p.comments || 0),
      velocity: Number(p.velocity || 0),
      annotations: extractCleanAnnotations(p.annotations).slice(0, 4),
      created_at_pinterest: p.created_at_pinterest || null,
      first_seen_at: p.first_seen_at || null,
      last_updated_at: p.last_updated_at || null
    })),
    annotation_crossovers: {
      single_annotations: singleAnnotations,
      pair_crossovers: pairCrossovers,
      triplet_crossovers: tripletCrossovers
    },
    guided_capsule_crossovers: guidedCapsuleCrossovers,
    creator_breakouts: creatorBreakouts,
    keyword_vacuums_and_bridges: {
      bridge_pins: bridgePins,
      keyword_vacuum_opportunities: keywordVacuumOpportunities
    },
    hidden_gems_telemetry: {
      winning_boards: winningBoards,
      vacuum_hijack_pins: vacuumHijackPins,
      domainless_viral_pins: domainlessViralPins,
      creation_method_breakdown: creationMethodBreakdown,
      dominant_color_palette: dominantColorPalette,
      top_arbitrage_domains: topArbitrageDomains
    }
  };

  enforcePulsePayloadByteBudget(payload, PULSE_MAX_PAYLOAD_BYTES);

  return payload;
}

export function stripVerbosePinFields(items) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if ('description' in item) delete item.description;
    if ('alt_text' in item) delete item.alt_text;
    if (typeof item.title === 'string' && item.title.length > 105) {
      item.title = item.title.slice(0, 105);
    }
    if (Array.isArray(item.annotations) && item.annotations.length > 4) {
      item.annotations = item.annotations.slice(0, 4);
    }
    if (Array.isArray(item.visual_annotations) && item.visual_annotations.length > 4) {
      item.visual_annotations = item.visual_annotations.slice(0, 4);
    }
    if (Array.isArray(item.keywords) && item.keywords.length > 2) {
      item.keywords = item.keywords.slice(0, 2);
    }
  }
}

/**
 * Programmatically enforces the `< 900 KB` JSON byte budget on `/api/pulse/24h` payloads.
 * Leaves normal compliant payloads completely untouched; when oversized, strips verbose
 * card fields first and then progressively trims secondary arrays while preserving `kpis`.
 *
 * @param {object} payload
 * @param {number} [maxBytes=PULSE_MAX_PAYLOAD_BYTES]
 * @returns {object}
 */
export function enforcePulsePayloadByteBudget(payload, maxBytes = PULSE_MAX_PAYLOAD_BYTES) {
  if (!payload || typeof payload !== 'object') return payload;
  const limit = Math.max(1024, Number(maxBytes) || PULSE_MAX_PAYLOAD_BYTES);

  const measureBytes = () => Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (measureBytes() < limit) {
    return payload;
  }

  // Stage 1: Strip verbose card fields & excess nested tags across all card collections
  stripVerbosePinFields(payload.breakout_pins);
  stripVerbosePinFields(payload.fresh_rocket_pins);
  stripVerbosePinFields(payload.vault_surge_pins);
  stripVerbosePinFields(payload.pinarchive_winners);
  stripVerbosePinFields(payload.keyword_vacuums_and_bridges?.bridge_pins);
  stripVerbosePinFields(payload.hidden_gems_telemetry?.vacuum_hijack_pins);
  stripVerbosePinFields(payload.hidden_gems_telemetry?.domainless_viral_pins);
  if (Array.isArray(payload.creator_breakouts)) {
    for (const cb of payload.creator_breakouts) {
      if (Array.isArray(cb?.driver_pins)) stripVerbosePinFields(cb.driver_pins);
    }
  }
  if (measureBytes() < limit) {
    return payload;
  }

  // Stage 2: Progressively shrink secondary arrays (lowest-priority / largest first) without touching `kpis`
  const trimTargets = [
    () => [payload.hidden_gems_telemetry, 'vacuum_hijack_pins'],
    () => [payload.hidden_gems_telemetry, 'domainless_viral_pins'],
    () => [payload.keyword_vacuums_and_bridges, 'bridge_pins'],
    () => [payload.keyword_vacuums_and_bridges, 'keyword_vacuum_opportunities'],
    () => [payload.annotation_crossovers, 'triplet_crossovers'],
    () => [payload.annotation_crossovers, 'pair_crossovers'],
    () => [payload.annotation_crossovers, 'single_annotations'],
    () => [payload, 'guided_capsule_crossovers'],
    () => [payload.hidden_gems_telemetry, 'winning_boards'],
    () => [payload.hidden_gems_telemetry, 'top_arbitrage_domains'],
    () => [payload, 'vault_surge_pins'],
    () => [payload, 'fresh_rocket_pins'],
    () => [payload, 'creator_breakouts'],
    () => [payload, 'pinarchive_winners'],
    () => [payload, 'breakout_pins']
  ];

  for (let round = 0; round < 16 && measureBytes() >= limit; round++) {
    let trimmedAny = false;
    for (const resolveTarget of trimTargets) {
      if (measureBytes() < limit) break;
      const [container, key] = resolveTarget();
      if (!container || !Array.isArray(container[key]) || container[key].length === 0) continue;
      const currentLen = container[key].length;
      const nextLen = currentLen <= 1 ? 0 : Math.floor(currentLen * 0.6);
      if (nextLen < currentLen) {
        container[key] = container[key].slice(0, nextLen);
        trimmedAny = true;
      }
    }
    if (!trimmedAny) break;
  }

  return payload;
}
