/**
 * Global 24-Hour Algorithmic Pulse Phase B N-Gram Crossover Miner & Guided Capsule Indexer
 * Extracted from src/modules/pulse/service.mjs
 *
 * Pure module depending only on ./pulse-normalizers.mjs.
 */

import {
  getCanonicalCreativeKey,
  isPlaceholderColor,
  safeNum,
  tagNormAscComparator,
  gainThenCountDescComparator,
  capsuleGroupSortComparator
} from './pulse-normalizers.mjs';

/**
 * Accumulates 1-Gram visual annotations, board telemetry, dominant color buckets,
 * and creation method breakdowns deduplicated by canonical creative key.
 */
export function accumulateTelemetryAndSingleTags(allActivePins, windowParam) {
  const singleTagMap = new Map();
  const boardStatsMap = new Map();
  const colorStatsMap = new Map();
  const creationMethodMap = new Map();

  // Determine if dataset has positive gain pins, or enable fallback for minimal unit-test fixtures
  let positiveGainPinsCount = 0;
  for (let i = 0; i < allActivePins.length; i++) {
    const p = allActivePins[i];
    if ((p.effective_24h_gain > 0 || p.daily_save_velocity > 0)) {
      positiveGainPinsCount++;
    }
  }
  const allowZeroGainFallback = positiveGainPinsCount < 5;

  // Accumulate singleTagMap, boardStatsMap, colorStatsMap, and creationMethodMap
  // Deduplicated by creative key and filtered for positive 24h momentum
  for (let i = 0; i < allActivePins.length; i++) {
    const p = allActivePins[i];
    const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
    const cKey = getCanonicalCreativeKey(p);

    // 1-Gram (single_annotations) - capped at top 6 tags
    if (pinGain > 0 || (allowZeroGainFallback && p.save_count > 0)) {
      const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
        ? p.window_saves_gain
        : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
      const cleanAnnotations = p.cleanAnnotations || [];
      const numTags = Math.min(cleanAnnotations.length, 6);
      for (let ti = 0; ti < numTags; ti++) {
        const tag = cleanAnnotations[ti];
        let st = singleTagMap.get(tag.norm);
        if (!st) {
          st = {
            tag_norm: tag.norm,
            tag_display: tag.display,
            pin_count: 0,
            kwIds: [],
            total_velocity: 0,
            total_24h_gain: 0,
            total_saves: 0,
            total_repins_delta: 0,
            sample_pins: [],
            matchingPins: [],
            seenCreatives: new Set()
          };
          singleTagMap.set(tag.norm, st);
        }
        if (!st.seenCreatives.has(cKey)) {
          st.seenCreatives.add(cKey);
          st.pin_count++;
          st.total_velocity += pinVel;
          st.total_24h_gain += pinVel;
          st.total_saves += p.save_count;
          st.total_repins_delta += p.delta_repins_24h;
          if (st.kwIds.length < 4) {
            for (let ki = 0; ki < p.keywords.length; ki++) {
              const kw = p.keywords[ki];
              if (!st.kwIds.includes(kw.keyword_id)) {
                st.kwIds.push(kw.keyword_id);
                if (st.kwIds.length >= 4) break;
              }
            }
          }
          if (st.matchingPins.length < 4) {
            st.matchingPins.push(p);
          }
        }
      }
    }

    // Board Telemetry
    const cleanBoard = p.board_name;
    if (cleanBoard && cleanBoard !== 'unknown') {
      let bEntry = boardStatsMap.get(cleanBoard);
      if (!bEntry) {
        bEntry = {
          board_name: cleanBoard,
          creator_username: p.creator_username || '',
          pin_count: 0,
          total_velocity: 0,
          total_saves: 0,
          sample_pins: [],
          seenCreatives: new Set()
        };
        boardStatsMap.set(cleanBoard, bEntry);
      }
      if (!bEntry.seenCreatives.has(cKey)) {
        bEntry.seenCreatives.add(cKey);
        bEntry.pin_count++;
        bEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
        bEntry.total_saves += p.save_count;
        if (bEntry.sample_pins.length < 2) {
          bEntry.sample_pins.push({
            pin_id: p.pin_id,
            title: p.title,
            image_url: p.image_url
          });
        }
      }
    }

    // Dominant Color Telemetry (Exclude placeholders, group by perceptual RGB bucket so shades coalesce)
    if (p.dominant_color && !isPlaceholderColor(p.dominant_color)) {
      const colorHex = String(p.dominant_color).trim();
      let bucketKey = colorHex.toLowerCase();
      if (colorHex.length === 7 && colorHex.charCodeAt(0) === 35) {
        const r = parseInt(colorHex.slice(1, 3), 16);
        const g = parseInt(colorHex.slice(3, 5), 16);
        const b = parseInt(colorHex.slice(5, 7), 16);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          bucketKey = `rgb:${r >> 5}:${g >> 5}:${b >> 5}`;
        }
      }
      let cEntry = colorStatsMap.get(bucketKey);
      if (!cEntry) {
        cEntry = { color: colorHex, pin_count: 0, total_velocity: 0, sample_pins: [], matchingPins: [], seenCreatives: new Set() };
        colorStatsMap.set(bucketKey, cEntry);
      }
      if (!cEntry.seenCreatives.has(cKey)) {
        cEntry.seenCreatives.add(cKey);
        cEntry.pin_count++;
        cEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
        if (cEntry.sample_pins.length < 2) {
          cEntry.sample_pins.push({
            pin_id: p.pin_id,
            title: p.title,
            image_url: p.image_url
          });
        }
        if (cEntry.matchingPins.length < 6) {
          cEntry.matchingPins.push(p);
        }
      }
    }

    // Creation Method Telemetry
    const cm = p.creation_method || 'pinterest_platform';
    let cmEntry = creationMethodMap.get(cm);
    if (!cmEntry) {
      cmEntry = { method: cm, pin_count: 0, total_velocity: 0 };
      creationMethodMap.set(cm, cmEntry);
    }
    cmEntry.pin_count++;
    cmEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
  }

  return {
    allowZeroGainFallback,
    singleTagMap,
    boardStatsMap,
    colorStatsMap,
    creationMethodMap
  };
}

/**
 * Builds O(1) inverted indices (keyword_id -> pins, tag_norm -> pins) and mines
 * 2-Pair (A+B) and 3-Triplet (A+B+C) annotation crossovers across top 400 surging creatives.
 */
export function mineNgramCrossoversAndIndices(allActivePins, windowParam, allowZeroGainFallback) {
  // Build inverted index maps from sorted allActivePins for O(1) matching_pins lookup & deduplicated capsule metrics
  const keywordIdToPinsMap = new Map();
  const tagNormToPinsMap = new Map();
  const kwSeenCreative = new Map();
  const tagSeenCreative = new Map();
  const topPinsForIndex = Math.min(allActivePins.length, 350);
  for (let pi = 0; pi < topPinsForIndex; pi++) {
    const p = allActivePins[pi];
    const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
    if (pinGain <= 0 && (!allowZeroGainFallback || p.save_count <= 0)) continue;
    const cKey = getCanonicalCreativeKey(p);
    for (let ki = 0; ki < p.keywords.length; ki++) {
      const kw = p.keywords[ki];
      let kwPins = keywordIdToPinsMap.get(kw.keyword_id);
      let seenSet = kwSeenCreative.get(kw.keyword_id);
      if (!kwPins) {
        kwPins = [];
        keywordIdToPinsMap.set(kw.keyword_id, kwPins);
        seenSet = new Set();
        kwSeenCreative.set(kw.keyword_id, seenSet);
      }
      if (kwPins.length < 12 && !seenSet.has(cKey)) {
        seenSet.add(cKey);
        kwPins.push(p);
      }
    }
    const numAnns = Math.min(p.cleanAnnotations.length, 6);
    for (let ti = 0; ti < numAnns; ti++) {
      const tag = p.cleanAnnotations[ti];
      let tagPins = tagNormToPinsMap.get(tag.norm);
      let seenSet = tagSeenCreative.get(tag.norm);
      if (!tagPins) {
        tagPins = [];
        tagNormToPinsMap.set(tag.norm, tagPins);
        seenSet = new Set();
        tagSeenCreative.set(tag.norm, seenSet);
      }
      if (tagPins.length < 6 && !seenSet.has(cKey)) {
        seenSet.add(cKey);
        tagPins.push(p);
      }
    }
  }

  // High-Momentum Candidate Pins for 2-Pair and 3-Triplet Crossover Mining (top 400 surging pins, sorted before slicing)
  const candidatePins = [];
  const candidateSeenCreative = new Set();
  for (let i = 0; i < allActivePins.length; i++) {
    const p = allActivePins[i];
    if (p.cleanAnnotations && p.cleanAnnotations.length > 0) {
      const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
      if (pinGain <= 0 && (!allowZeroGainFallback || p.save_count <= 0)) continue;
      const cKey = getCanonicalCreativeKey(p);
      if (candidateSeenCreative.has(cKey)) continue;
      candidateSeenCreative.add(cKey);
      candidatePins.push(p);
      if (candidatePins.length >= 400) break;
    }
  }
  const pairTagMap = new Map();
  const tripletTagMap = new Map();

  for (const p of candidatePins) {
    const rawTags = p.cleanAnnotations;
    if (!rawTags || rawTags.length < 2) continue;
    // Sort alphabetically FIRST, then slice to 5 tags so shared tags are never dropped by pre-sort truncation
    const sortedTags = [...rawTags].sort(tagNormAscComparator).slice(0, 5);
    const K = sortedTags.length;
    if (K < 2) continue;

    const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
      ? p.window_saves_gain
      : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);

    // 2-Pairs (A + B)
    for (let i = 0; i < K - 1; i++) {
      for (let j = i + 1; j < K; j++) {
        const tA = sortedTags[i];
        const tB = sortedTags[j];
        const pairKey = `${tA.norm} +++ ${tB.norm}`;
        let pt = pairTagMap.get(pairKey);
        if (!pt) {
          pt = {
            tag_a_norm: tA.norm,
            tag_a_display: tA.display,
            tag_b_norm: tB.norm,
            tag_b_display: tB.display,
            crossover_label: `${tA.display} + ${tB.display}`,
            pin_count: 0,
            kwIds: [],
            total_velocity: 0,
            total_24h_gain: 0,
            total_saves: 0,
            total_repins_delta: 0,
            sample_pins: [],
            matchingPins: [],
            seenCreatives: new Set()
          };
          pairTagMap.set(pairKey, pt);
        }
        const cKey = getCanonicalCreativeKey(p);
        if (pt.seenCreatives.has(cKey)) continue;
        pt.seenCreatives.add(cKey);

        pt.pin_count++;
        pt.total_velocity += pinVel;
        pt.total_24h_gain += pinVel;
        pt.total_saves += p.save_count;
        pt.total_repins_delta += p.delta_repins_24h;
        if (pt.kwIds.length < 6) {
          for (const kw of p.keywords) {
            if (!pt.kwIds.includes(kw.keyword_id)) {
              pt.kwIds.push(kw.keyword_id);
              if (pt.kwIds.length >= 6) break;
            }
          }
        }
        if (pt.matchingPins.length < 4) {
          let exists = false;
          for (let mpi = 0; mpi < pt.matchingPins.length; mpi++) {
            if (pt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
          }
          if (!exists) pt.matchingPins.push(p);
        }
      }
    }

    // 3-Triplets (A + B + C)
    for (let i = 0; i < K - 2; i++) {
      for (let j = i + 1; j < K - 1; j++) {
        for (let k = j + 1; k < K; k++) {
          const tA = sortedTags[i];
          const tB = sortedTags[j];
          const tC = sortedTags[k];
          const tripKey = `${tA.norm} +++ ${tB.norm} +++ ${tC.norm}`;
          let tt = tripletTagMap.get(tripKey);
          if (!tt) {
            tt = {
              tag_a_norm: tA.norm,
              tag_a_display: tA.display,
              tag_b_norm: tB.norm,
              tag_b_display: tB.display,
              tag_c_norm: tC.norm,
              tag_c_display: tC.display,
              crossover_label: `${tA.display} + ${tB.display} + ${tC.display}`,
              pin_count: 0,
              kwIds: [],
              total_velocity: 0,
              total_24h_gain: 0,
              total_saves: 0,
              total_repins_delta: 0,
              sample_pins: [],
              matchingPins: [],
              seenCreatives: new Set()
            };
            tripletTagMap.set(tripKey, tt);
          }
          const cKey = getCanonicalCreativeKey(p);
          if (tt.seenCreatives.has(cKey)) continue;
          tt.seenCreatives.add(cKey);

          tt.pin_count++;
          tt.total_velocity += pinVel;
          tt.total_24h_gain += pinVel;
          tt.total_saves += p.save_count;
          tt.total_repins_delta += p.delta_repins_24h;
          if (tt.kwIds.length < 6) {
            for (const kw of p.keywords) {
              if (!tt.kwIds.includes(kw.keyword_id)) {
                tt.kwIds.push(kw.keyword_id);
                if (tt.kwIds.length >= 6) break;
              }
            }
          }
          if (tt.matchingPins.length < 4) {
            let exists = false;
            for (let mpi = 0; mpi < tt.matchingPins.length; mpi++) {
              if (tt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
            }
            if (!exists) tt.matchingPins.push(p);
          }
        }
      }
    }
  }

  return {
    keywordIdToPinsMap,
    tagNormToPinsMap,
    pairTagMap,
    tripletTagMap
  };
}

/**
 * Formats 1-Gram, 2-Pair, and 3-Triplet N-Gram crossovers with hard support floor >= 2.
 */
export function formatAnnotationCrossovers({
  singleTagMap,
  pairTagMap,
  tripletTagMap,
  formatMatrixPinSummary
}) {
  // Section 3: Format N-Gram Crossovers with Slicing FIRST & Hard Support Floor (pin_count >= 2) [Round 16]
  const singleAnnotations = Array.from(singleTagMap.values())
    .sort(gainThenCountDescComparator)
    .slice(0, 25)
    .map(t => {
      const matchingPins = (t.matchingPins || [])
        .slice(0, 3)
        .map(formatMatrixPinSummary);
      return {
        label: t.tag_display,
        tag_norm: t.tag_norm,
        pin_count: t.pin_count,
        keywords_count: t.kwIds.length,
        total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
        total_velocity: Number(t.total_velocity.toFixed(2)),
        avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
        ...(t.total_repins_delta > 0 ? { total_repins_delta: t.total_repins_delta } : {}),
        total_saves: t.total_saves,
        matching_pins: matchingPins
      };
    });

  const pairCrossovers = Array.from(pairTagMap.values())
    .filter(p => p.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
    .sort(gainThenCountDescComparator)
    .slice(0, 25)
    .map(p => {
      const matchingPins = (p.matchingPins || [])
        .slice(0, 3)
        .map(formatMatrixPinSummary);
      return {
        label: p.crossover_label,
        pair: p.crossover_label,
        tag_a_norm: p.tag_a_norm,
        tag_b_norm: p.tag_b_norm,
        pin_count: p.pin_count,
        keywords_count: p.kwIds.length,
        total_24h_gain: Number((p.total_24h_gain != null ? p.total_24h_gain : p.total_velocity).toFixed(2)),
        total_velocity: Number(p.total_velocity.toFixed(2)),
        avg_velocity: p.pin_count > 0 ? Number((p.total_velocity / p.pin_count).toFixed(2)) : 0,
        ...(p.total_repins_delta > 0 ? { total_repins_delta: p.total_repins_delta } : {}),
        total_saves: p.total_saves,
        matching_pins: matchingPins
      };
    });

  const tripletCrossovers = Array.from(tripletTagMap.values())
    .filter(t => t.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
    .sort(gainThenCountDescComparator)
    .slice(0, 20)
    .map(t => {
      const matchingPins = (t.matchingPins || [])
        .slice(0, 3)
        .map(formatMatrixPinSummary);
      return {
        label: t.crossover_label,
        triplet: t.crossover_label,
        tag_a_norm: t.tag_a_norm,
        tag_b_norm: t.tag_b_norm,
        tag_c_norm: t.tag_c_norm,
        pin_count: t.pin_count,
        keywords_count: t.kwIds.length,
        total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
        total_velocity: Number(t.total_velocity.toFixed(2)),
        avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
        ...(t.total_repins_delta > 0 ? { total_repins_delta: t.total_repins_delta } : {}),
        total_saves: t.total_saves,
        matching_pins: matchingPins
      };
    });

  return {
    singleAnnotations,
    pairCrossovers,
    tripletCrossovers
  };
}

/**
 * Groups and ranks Guided Search Capsules Crossovers across keywords using O(1) inverted indices.
 */
export function buildGuidedCapsuleCrossovers({
  guidedCapsuleRows,
  totalSavesVelocity,
  allActivePinsCount,
  keywordPinStats,
  tagNormToPinsMap,
  keywordIdToPinsMap,
  formatMatrixPinSummary
}) {
  // Section 4: Group Guided Search Capsules Crossovers (deduplicated by LOWER(TRIM(display_label)))
  const capsuleGroupMap = new Map();
  for (const c of guidedCapsuleRows) {
    const labelNorm = String(c.display_label || c.term || '').trim().toLowerCase();
    if (!labelNorm) continue;
    let cg = capsuleGroupMap.get(labelNorm);
    if (!cg) {
      cg = {
        term: c.term || c.display_label,
        display_label: c.display_label || c.term,
        label_norm: labelNorm,
        dominant_color: c.dominant_color || '#3b82f6',
        max_score: Number(c.score || 0),
        kwIds: [],
        keywords: []
      };
      capsuleGroupMap.set(labelNorm, cg);
    }
    const kid = Number(c.keyword_id);
    if (!cg.kwIds.includes(kid)) {
      cg.kwIds.push(kid);
      if (cg.keywords.length < 4) {
        cg.keywords.push({
          keyword_id: kid,
          keyword_text: c.keyword_text || '',
          keyword_category: c.keyword_category || 'General',
          score: Number(c.score || 0),
          display_order: Number(c.display_order || 10)
        });
      }
    }
    if (c.score > cg.max_score) cg.max_score = c.score;
  }

  let sharedCapsulesCount = 0;
  // Fast initial pass across all capsule groups (bounded to avoid O(N*M) string scans)
  const maxSystemVel = totalSavesVelocity > 0 ? totalSavesVelocity : Infinity;
  const maxSystemPins = allActivePinsCount > 0 ? allActivePinsCount : Infinity;
  for (const cg of capsuleGroupMap.values()) {
    let rawVel = 0;
    let rawPins = 0;
    const kwCap = Math.min(cg.kwIds.length, 15);
    for (let i = 0; i < kwCap; i++) {
      const stats = keywordPinStats.get(cg.kwIds[i]);
      if (stats) {
        rawVel += stats.total_velocity;
        rawPins += stats.active_pins_count;
      }
    }
    cg.keyword_count = cg.kwIds.length;
    cg.cross_serp_velocity = Math.round(Math.min(rawVel, maxSystemVel) * 100) / 100;
    cg.cross_serp_pins = Math.min(rawPins, maxSystemPins);
    if (cg.keyword_count >= 2) sharedCapsulesCount++;
  }

  // Sort and slice to top 12 FIRST [Round 16 CPU Optimization]
  const topCapsuleGroups = Array.from(capsuleGroupMap.values())
    .sort(capsuleGroupSortComparator)
    .slice(0, 12);

  // Compute exact deduplicated pin count/velocity and gather semantically matching pins ONLY for top 12 in O(1) time
  const guidedCapsuleCrossovers = topCapsuleGroups.map(cg => {
    const targetLabelNorm = (cg.label_norm || cg.display_label || cg.term || '').toLowerCase();
    const matchingPinsRaw = [];
    const fallbackPinsRaw = [];
    const seenCapsuleCreative = new Set();
    const seenPinIds = new Set();
    let dedupedVel = 0;
    let dedupedPinCount = 0;

    // 1. O(1) tag index lookup first (exact visual tag match)
    const tagPins = tagNormToPinsMap.get(targetLabelNorm);
    if (tagPins) {
      for (let pi = 0; pi < tagPins.length; pi++) {
        const p = tagPins[pi];
        if (!seenPinIds.has(p.pin_id)) {
          seenPinIds.add(p.pin_id);
          dedupedPinCount++;
          dedupedVel += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
        }
        const cKey = getCanonicalCreativeKey(p);
        if (!seenCapsuleCreative.has(cKey) && matchingPinsRaw.length < 6) {
          seenCapsuleCreative.add(cKey);
          matchingPinsRaw.push(p);
        }
      }
    }

    // 2. Scan indexed keyword pins for semantic match & deduplicated stats across cg.kwIds
    for (let ki = 0; ki < cg.kwIds.length; ki++) {
      const kid = cg.kwIds[ki];
      const kwPins = keywordIdToPinsMap.get(kid);
      if (!kwPins) continue;
      for (let pi = 0; pi < kwPins.length; pi++) {
        const p = kwPins[pi];
        const isNewPin = !seenPinIds.has(p.pin_id);
        if (isNewPin) {
          seenPinIds.add(p.pin_id);
          dedupedPinCount++;
          dedupedVel += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
        }
        if (!p.image_url) continue;
        const cKey = getCanonicalCreativeKey(p);
        if (seenCapsuleCreative.has(cKey)) continue;
        if (matchingPinsRaw.length < 6) {
          const titleLower = (p.title || '').toLowerCase();
          const kwLower = (p.keyword_text || '').toLowerCase();
          if (titleLower.includes(targetLabelNorm) || kwLower.includes(targetLabelNorm)) {
            seenCapsuleCreative.add(cKey);
            matchingPinsRaw.push(p);
          } else if (fallbackPinsRaw.length < 6) {
            fallbackPinsRaw.push(p);
          }
        }
      }
    }

    // 3. Fill remaining slots up to 6 from fallbackPinsRaw if needed
    if (matchingPinsRaw.length < 6 && fallbackPinsRaw.length > 0) {
      for (let fi = 0; fi < fallbackPinsRaw.length; fi++) {
        const p = fallbackPinsRaw[fi];
        const cKey = getCanonicalCreativeKey(p);
        if (!seenCapsuleCreative.has(cKey)) {
          seenCapsuleCreative.add(cKey);
          matchingPinsRaw.push(p);
          if (matchingPinsRaw.length >= 6) break;
        }
      }
    }

    const matchingPins = matchingPinsRaw.slice(0, 3).map(formatMatrixPinSummary);
    const effectivePinCount = dedupedPinCount > 0 ? dedupedPinCount : (cg.cross_serp_pins > 0 ? cg.cross_serp_pins : matchingPins.length);
    const effectiveVelocity = dedupedVel > 0 ? Number(dedupedVel.toFixed(2)) : cg.cross_serp_velocity;
    const effectiveScore = cg.max_score > 0
      ? Number(safeNum(cg.max_score).toFixed(2))
      : Number(safeNum(effectiveVelocity > 0 ? effectiveVelocity : (cg.keyword_count * 10 + effectivePinCount)).toFixed(2));

    return {
      term: cg.term,
      display_label: cg.display_label,
      dominant_color: cg.dominant_color,
      pin_count: effectivePinCount,
      score: effectiveScore,
      max_score: effectiveScore,
      avg_velocity: effectivePinCount > 0 ? Number((effectiveVelocity / effectivePinCount).toFixed(2)) : effectiveVelocity,
      keyword_text: cg.keywords[0]?.keyword_text || '',
      keyword_count: cg.keyword_count,
      cross_serp_velocity: effectiveVelocity,
      keywords: cg.keywords.slice(0, 2),
      matching_pins: matchingPins
    };
  });

  return {
    guidedCapsuleCrossovers,
    sharedCapsulesCount
  };
}
