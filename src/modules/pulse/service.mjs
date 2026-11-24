/**
 * Global 24-Hour Algorithmic Pulse & Multi-Dimensional Crossover Service
 *
 * Thin orchestrator & public Barrel.
 * Strict DAG:
 *   pulse-cache.mjs (leaf) & pulse-normalizers.mjs (leaf) & pulse-queries.mjs (leaf)
 *   <- pulse-crossover-miner.mjs, pulse-payload-builder.mjs, pulse-blueprint.mjs
 *   <- service.mjs (orchestrator + explicit named re-exports)
 *
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */

import { isSyntheticGarbageTitle } from '../../domain/pin-intelligence.mjs';
import { computeAnscombeInflectionScore } from '../../lib/math.mjs';
import { requestContextStorage } from '../../http/security-and-response.mjs';
import { DEFAULT_WORKSPACE_ID } from '../workspaces/service.mjs';
import {
  PULSE_MEMORY_CACHE_MAX,
  PULSE_MEMORY_TTL_MS,
  PULSE_MAX_PAYLOAD_BYTES,
  PULSE_FORCE_REFRESH_COOLDOWN_MS,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse,
  invalidateGlobalPulseCache
} from './pulse-cache.mjs';
import {
  fastParseIsoDateMs,
  getCanonicalCreativeKey,
  extractCleanAnnotations,
  safeNum,
  isPlaceholderColor,
  safeNullableNum,
  fastNum,
  activePinSortComparator,
  mergePinIntoMap
} from './pulse-normalizers.mjs';
import {
  queryActiveSerp,
  queryVaultAndVacuum,
  queryViralCreatorPins,
  queryGuidedCapsules,
  queryBreakoutCreators,
  queryWinnersAndDomains,
  queryKPIs
} from './pulse-queries.mjs';
import {
  accumulateTelemetryAndSingleTags,
  mineNgramCrossoversAndIndices,
  formatAnnotationCrossovers,
  buildGuidedCapsuleCrossovers
} from './pulse-crossover-miner.mjs';
import {
  formatMatrixPinSummary,
  buildBreakoutAndSurgeFeeds,
  buildCreatorBreakouts,
  buildVacuumsAndBridges,
  buildHiddenGemsTelemetry,
  assemblePulsePayload,
  enforcePulsePayloadByteBudget
} from './pulse-payload-builder.mjs';
import { synthesizePinBlueprint } from './pulse-blueprint.mjs';

// Explicit named re-exports matching the exact original public surface (24 symbols)
export {
  PULSE_MEMORY_CACHE_MAX,
  PULSE_MEMORY_TTL_MS,
  PULSE_MAX_PAYLOAD_BYTES,
  PULSE_FORCE_REFRESH_COOLDOWN_MS,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse,
  invalidateGlobalPulseCache,
  getCanonicalCreativeKey,
  extractCleanAnnotations,
  safeNum,
  isPlaceholderColor,
  safeNullableNum,
  fastNum,
  queryActiveSerp,
  queryVaultAndVacuum,
  queryViralCreatorPins,
  queryGuidedCapsules,
  queryBreakoutCreators,
  queryWinnersAndDomains,
  queryKPIs,
  enforcePulsePayloadByteBudget,
  synthesizePinBlueprint
};

/**
 * Main Service Function: getGlobal24hPulseService
 */
export async function getGlobal24hPulseService(sql, env, options = {}) {
  const folderId = options.folderId || options.folder_id || 'all';
  const windowParam = String(options.window || '24h').toLowerCase();
  const forceRefresh = Boolean(options.forceRefresh || options.force_refresh);
  const minAudience = Number(options.minAudience || options.min_audience || 0);
  const bypassCache = Boolean(options.bypassCache || options.skipCache);
  const testId = options.testId ? String(options.testId).trim() : '';

  const parsedFolderId = (folderId && folderId !== 'all') ? Number(folderId) : null;
  const folderIdNum = Number.isFinite(parsedFolderId) ? parsedFolderId : null;
  const rawWsId = options.workspaceId ?? options.workspace_id ?? requestContextStorage?.getStore?.()?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const parsedWsId = Number(rawWsId);
  const wid = Number.isInteger(parsedWsId) && parsedWsId > 0 ? parsedWsId : DEFAULT_WORKSPACE_ID;
  const cacheKey = options.cacheKey || (
    testId
      ? `ws:${wid}:pulse:${folderIdNum ?? 'all'}:${windowParam}:${minAudience}:${testId}`
      : `ws:${wid}:pulse:${folderIdNum ?? 'all'}:${windowParam}:${minAudience}`
  );

  let effectiveRefresh = forceRefresh;
  if (!bypassCache && effectiveRefresh && env && (env.DATABASE_URL || env.ENFORCE_COOLDOWN)) {
    if (pulseForceRefreshCooldown.has(cacheKey)) {
      effectiveRefresh = false;
    }
  }

  if (!bypassCache && effectiveRefresh) {
    pulseForceRefreshCooldown.set(cacheKey, Date.now());
  }

  const computePulsePayload = async () => {
    const startEpoch = pulseMemoryCache.epoch;
    let degraded = false;
    // Phase A: Concurrent Execution of Hub Queries (including viral creator pins and matview KPIs)
    const [
      activeSerpRows,
      vaultData,
      guidedCapsuleRows,
      creatorBreakoutRows,
      winnerData,
      creatorViralRows,
      matviewKpis
    ] = await Promise.all([
      queryActiveSerp(sql, folderIdNum, wid),
      queryVaultAndVacuum(sql, folderIdNum, env, wid),
      queryGuidedCapsules(sql, folderIdNum, wid),
      queryBreakoutCreators(sql, folderIdNum, wid),
      queryWinnersAndDomains(sql, wid),
      queryViralCreatorPins(sql, folderIdNum, wid).catch(() => {
        degraded = true;
        return [];
      }),
      queryKPIs(sql, folderIdNum, wid).catch(() => {
        degraded = true;
        return null;
      })
    ]);

    const { vacuumRows, vaultPins } = vaultData;
    const { paWinners, domainRollups } = winnerData;

    // Vacuum Keyword Map for rapid lookup
    const vacuumKwMap = new Map();
    for (let i = 0; i < vacuumRows.length; i++) {
      const v = vacuumRows[i];
      vacuumKwMap.set(Number(v.keyword_id), v);
    }

    // Unified Cross-Table Merge into pinMap (Active SERP + Displaced Vault + Creator Viral)
    const pinMap = new Map();
    const keywordPinStats = new Map();
    const keywordFoldersMap = new Map();

    for (const row of activeSerpRows) {
      const pid = String(row.pin_id);
      const kid = Number(row.keyword_id);

      if (kid && Array.isArray(row.folders) && row.folders.length > 0 && !keywordFoldersMap.has(kid)) {
        keywordFoldersMap.set(kid, row.folders);
      }

      // Aggregate keyword stats
      let kwStats = keywordPinStats.get(kid);
      if (!kwStats) {
        kwStats = {
          keyword_id: kid,
          keyword_text: row.keyword_text || '',
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        };
        keywordPinStats.set(kid, kwStats);
      }
      kwStats.active_pins_count++;
      const rowVel = (typeof row.daily_save_velocity === 'number') ? row.daily_save_velocity : fastNum(row.daily_save_velocity);
      kwStats.total_velocity += rowVel;
      if (!kwStats.top_pin || rowVel > kwStats.top_pin.daily_save_velocity) {
        kwStats.top_pin = {
          pin_id: pid,
          title: row.title || '',
          image_url: row.image_url || '',
          save_count: (typeof row.save_count === 'number') ? row.save_count : fastNum(row.save_count),
          daily_save_velocity: rowVel
        };
      }

      mergePinIntoMap(pinMap, row, 'active_serp', keywordFoldersMap);
    }

    // Merge Displaced Vault Surges (top 250) into unified surge pool
    for (const vp of vaultPins) {
      mergePinIntoMap(pinMap, vp, 'vault_surge', keywordFoldersMap);
    }

    // Merge Creator Viral Pins (top 150) into unified surge pool
    for (const cp of (creatorViralRows || [])) {
      const pid = String(cp.pin_id);
      if (!folderIdNum || pinMap.has(pid)) {
        mergePinIntoMap(pinMap, cp, 'creator_feed', keywordFoldersMap);
      }
    }

    // Merge Top 100 Qualified PinArchive Winners into unified surge pool [Round 16 Gate 5.3]
    for (const pa of (paWinners || [])) {
      const pid = String(pa.pin_id);
      if (!folderIdNum || pinMap.has(pid)) {
        mergePinIntoMap(pinMap, pa, 'pinarchive_winner', keywordFoldersMap);
      }
    }

    const candidatePinIds = Array.from(pinMap.keys());
    const p2pGraphRows = candidatePinIds.length > 0
      ? await sql`SELECT DISTINCT candidate_pin_id FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candidatePinIds}::text[]);`.catch(() => [])
      : [];
    const p2pPinSet = new Set((p2pGraphRows || []).map(r => String(r.candidate_pin_id || '')));

    // Process Merged Pins & Compute Unified 24h Velocity
    const allActivePins = [];
    const paPinsList = [];
    let totalSavesVelocity = 0;
    let totalRepinsDelta = 0;
    let pinsGainingCount = 0;
    let freshRocketCount = 0;
    let bridgePinsCount = 0;

    const nowMs = Date.now();

    for (const p of pinMap.values()) {
      if (p.sources.includes('pinarchive_winner')) {
        paPinsList.push(p);
      }
      const overlapCount = p.keywords.length;
      if (overlapCount >= 2) bridgePinsCount++;

      const folders = p.folderList;
      const folderOverlapCount = folders.length;
      const bestRank = p.best_rank;
      const rankClimb24h = (p.best_prev_rank != null && bestRank != null) ? (p.best_prev_rank - bestRank) : 0;

      // Calculate Age
      let pinAgeDays = null;
      if (p.created_at_pinterest) {
        const createdMs = fastParseIsoDateMs(p.created_at_pinterest);
        if (Number.isFinite(createdMs) && createdMs <= nowMs) {
          pinAgeDays = Math.floor((nowMs - createdMs) / 86400000);
        }
      }
      const isFresh14d = pinAgeDays !== null ? (pinAgeDays <= 14) : false;
      const isFresh30d = pinAgeDays !== null ? (pinAgeDays <= 30) : false;
      p.pin_age_days = pinAgeDays;
      p.is_fresh_14d = isFresh14d;
      p.is_fresh_30d = isFresh30d;
      p.lifetime_velocity = (pinAgeDays !== null && pinAgeDays > 0)
        ? Math.round((p.save_count / pinAgeDays) * 10) / 10
        : null;

      // Unified 24h Velocity & Effective Gain [Fix 2.1 SSOT: Math.max()]
      // [INVARIANT: ANTI-HYDRATION-SPIKE-REPINS]
      // Zero out delta_repins_24h if 0-repin or skeleton-to-lifetime hydration jump is detected
      const isPostMergeSkeletonRepinJump =
        (p.repin_count >= 20 && p.delta_repins_24h >= p.repin_count && p.daily_save_velocity === 0 && p.delta_saves_24h === 0) ||
        (
          p.repin_count >= 200 &&
          p.delta_repins_24h >= 150 &&
          (p.repin_count - p.delta_repins_24h) <= Math.max(60, p.repin_count * 0.05) &&
          p.daily_save_velocity < p.delta_repins_24h * 0.15 &&
          p.delta_saves_24h < p.delta_repins_24h * 0.15
        );
      if (isPostMergeSkeletonRepinJump) {
        p.delta_repins_24h = 0;
      }

      let effectiveSaves24h = p.delta_saves_24h;
      if (effectiveSaves24h <= 0 || !Number.isFinite(effectiveSaves24h)) {
        effectiveSaves24h = p.daily_save_velocity;
      } else if (p.daily_save_velocity > 0 && p.daily_save_velocity < effectiveSaves24h * 5) {
        effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      }
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = (effectiveSaves24h > effectiveRepins24h) ? effectiveSaves24h : effectiveRepins24h;
      p.effective_24h_gain = effective24hGain;

      // Windowed Momentum Calculation (never suppressed to 0 if 24h deltas are positive)
      let windowSavesGain = effectiveSaves24h;
      let effectiveMomentum = effective24hGain;
      if (windowParam === '5d') {
        windowSavesGain = (p.gains_5d > effectiveSaves24h) ? p.gains_5d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_5d) ? effective24hGain : p.gains_5d;
      } else if (windowParam === '7d') {
        windowSavesGain = (p.gains_7d > effectiveSaves24h) ? p.gains_7d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_7d) ? effective24hGain : p.gains_7d;
      } else if (windowParam === '10d') {
        windowSavesGain = (p.gains_10d > effectiveSaves24h) ? p.gains_10d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_10d) ? effective24hGain : p.gains_10d;
      } else if (windowParam === '15d') {
        windowSavesGain = (p.gains_15d > effectiveSaves24h) ? p.gains_15d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_15d) ? effective24hGain : p.gains_15d;
      } else {
        const momFallback = p.daily_save_velocity + (p.delta_repins_24h * 0.5);
        effectiveMomentum = (momFallback > effective24hGain) ? momFallback : effective24hGain;
      }
      p.window_saves_gain = windowSavesGain;

      // Single-pass Anscombe & algorithmic velocity acceleration via SSOT math (uses precomputed p.pin_age_days)
      const anscombeScores = computeAnscombeInflectionScore(p);
      const accelerationRatio = anscombeScores.acceleration_score;
      const isAccelerating = accelerationRatio >= 1.5;

      p.anscombe_z_gain = anscombeScores.anscombe_z_gain;
      p.repin_lead_score = anscombeScores.repin_lead_score;

      // Cross-Pillar Breakout Conviction Score (B_cross)
      const velForScore = Math.max(0, p.effective_24h_gain > 0 ? p.effective_24h_gain : (p.daily_save_velocity || 0));
      const sVel = Math.min(100, Math.round(Math.log10(velForScore + 1) * 33.3));
      let rankWeightSum = 0;
      if (Array.isArray(p.keywords)) {
        for (let ki = 0; ki < p.keywords.length; ki++) {
          const kw = p.keywords[ki];
          const rPos = Number(kw.rank_position ?? kw.last_known_rank ?? 50);
          rankWeightSum += Math.max(0.1, 1 - Math.min(50, rPos) / 55);
        }
      }
      const sSerp = Math.min(100, Math.round(rankWeightSum * 35));
      const hasCompetitorBoard = Boolean(
        (p.sources && p.sources.includes('creator_feed')) ||
        (p.board_name && p.board_name.trim().length > 0 && p.creator_username)
      );
      const sComp = hasCompetitorBoard ? 100 : 0;
      const hasP2PGraph = p2pPinSet.has(String(p.pin_id));
      const sP2p = hasP2PGraph ? 100 : 0;
      const bCross = Math.min(100, Math.round((sVel * 0.40) + (sSerp * 0.30) + (sComp * 0.15) + (sP2p * 0.15)));
      p.b_cross = bCross;
      p.breakout_conviction_score = bCross;
      p.breakout_score = Math.max(bCross, anscombeScores.breakout_score);

      const urlLeverageRatio = (p.url_global_saves > 0 && p.save_count > 0)
        ? Math.round((p.url_global_saves / p.save_count) * 100) / 100
        : 1.0;

      // True Domainless Viral Pins: true ONLY when no authentic external domain [Fix 2.5 SSOT]
      const isDomainless = Boolean(
        !p.domain ||
        p.domain === 'Uploaded by user' ||
        p.domain.includes('pinterest.') ||
        !p.destination_url
      );
      p.is_domainless_viral = isDomainless;

      // Vacuum Target Check
      let isVacuumHijackTarget = false;
      for (let i = 0; i < p.keywords.length; i++) {
        const vInfo = vacuumKwMap.get(p.keywords[i].keyword_id);
        if (vInfo && vInfo.displaced_top10_24h_count > 0) {
          if (bestRank != null && (bestRank <= 15 || effective24hGain > 0 || rankClimb24h > 0)) {
            isVacuumHijackTarget = true;
            break;
          }
        }
      }

      totalSavesVelocity += (windowParam !== '24h' ? windowSavesGain : effectiveSaves24h);
      totalRepinsDelta += p.delta_repins_24h;
      if (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || windowSavesGain > 0) pinsGainingCount++;
      if (isFresh14d && (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || windowSavesGain > 0)) freshRocketCount++;

      const cleanAnnotations = p.cleanAnnotations;

      // Augment p in-place
      p.pin_age_days = pinAgeDays;
      p.is_fresh_14d = isFresh14d;
      p.is_fresh_30d = isFresh30d;
      p.effective_24h_momentum = Math.round(effectiveMomentum * 100) / 100;
      p.acceleration_ratio = accelerationRatio;
      p.is_accelerating = isAccelerating;
      p.breakout_conviction_score = bCross;
      p.b_cross = bCross;
      p.cross_pillar_conviction = bCross;
      p.p2p_graph_presence = hasP2PGraph;
      p.competitor_board_presence = hasCompetitorBoard;
      p.overlap_count = overlapCount;
      p.folder_overlap_count = folderOverlapCount;
      p.best_rank = bestRank;
      p.rank_climb_24h = rankClimb24h;
      p.is_vacuum_hijack_target = isVacuumHijackTarget;
      p.cleanAnnotations = cleanAnnotations;
      p.folders = folders;
      p.url_leverage_ratio = urlLeverageRatio;
      p.keyword_text = p.keywords[0]?.keyword_text || '';
      p.is_hydrated = Boolean(p.image_url || (p.title && !isSyntheticGarbageTitle(p.title)));
      p.is_hydrated_int = p.is_hydrated ? 1 : 0;

      allActivePins.push(p);
    }

    // Sort All Active Pins by Hydration Status, Unified 24h Gain then Momentum
    allActivePins.sort(activePinSortComparator);

    // Phase B: N-Gram Crossover Mining, Inverted Indices & Telemetry Accumulation
    const {
      allowZeroGainFallback,
      singleTagMap,
      boardStatsMap,
      colorStatsMap,
      creationMethodMap
    } = accumulateTelemetryAndSingleTags(allActivePins, windowParam);

    const {
      keywordIdToPinsMap,
      tagNormToPinsMap,
      pairTagMap,
      tripletTagMap
    } = mineNgramCrossoversAndIndices(allActivePins, windowParam, allowZeroGainFallback);

    // Phase C: Feed Partitioning, Crossover Formatting, Creators, Bridges, Vacuums & Hidden Gems
    const {
      breakoutPinsTop250,
      freshRocketPinsTop100,
      vaultSurgePinsFormatted,
      vacuumHijackCandidates,
      domainlessViralCandidates,
      domainlessViralTotalCount,
      vaultSurgeTotalCount
    } = buildBreakoutAndSurgeFeeds({ allActivePins, paPinsList });

    const {
      singleAnnotations,
      pairCrossovers,
      tripletCrossovers
    } = formatAnnotationCrossovers({
      singleTagMap,
      pairTagMap,
      tripletTagMap,
      formatMatrixPinSummary
    });

    const {
      guidedCapsuleCrossovers,
      sharedCapsulesCount
    } = buildGuidedCapsuleCrossovers({
      guidedCapsuleRows,
      totalSavesVelocity,
      allActivePinsCount: allActivePins.length,
      keywordPinStats,
      tagNormToPinsMap,
      keywordIdToPinsMap,
      formatMatrixPinSummary
    });

    const {
      creatorBreakouts,
      breakoutCreatorsCount
    } = buildCreatorBreakouts({ creatorBreakoutRows, minAudience, nowMs });

    const {
      bridgePins,
      keywordVacuumOpportunities,
      totalVacuumTop10_24h
    } = buildVacuumsAndBridges({ allActivePins, vacuumKwMap, keywordPinStats });

    const {
      winningBoards,
      vacuumHijackPins,
      domainlessViralPins,
      creationMethodBreakdown,
      dominantColorPalette,
      topArbitrageDomains,
      totalActivePinsCount,
      totalActiveSerpSlots,
      liveDomainCount
    } = buildHiddenGemsTelemetry({
      boardStatsMap,
      vacuumHijackCandidates,
      domainlessViralCandidates,
      allActivePins,
      activeSerpRows,
      creationMethodMap,
      colorStatsMap,
      domainRollups,
      windowParam
    });

    // Phase D: Executive KPI Ribbon, Payload Assembly & Wire Byte-Budget Enforcement
    const payload = assemblePulsePayload({
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
    });

    if (degraded) {
      payload.degraded = true;
    }

    if (!degraded && !bypassCache && pulseMemoryCache.isWriteValid(cacheKey, startEpoch)) {
      pulseForceRefreshCooldown.set(cacheKey, Date.now());
    }

    return payload;
  };

  if (bypassCache) {
    return await computePulsePayload();
  }

  return await pulseMemoryCache.getOrFetch(cacheKey, computePulsePayload, {
    ttlMs: PULSE_MEMORY_TTL_MS,
    forceRefresh: effectiveRefresh,
    shouldCache: (val) => Boolean(val && val.success !== false && val.degraded !== true)
  });
}
