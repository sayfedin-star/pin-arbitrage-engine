/**
 * Global 24-Hour Algorithmic Pulse One-Click 5-Source Scientific Pin Blueprint Synthesizer
 * Extracted from src/modules/pulse/service.mjs
 */

import { extractCleanAnnotations } from './pulse-normalizers.mjs';

/**
 * Section 8 Helper: Synthesizes One-Click 5-Source Scientific Pin Blueprint
 */
export function synthesizePinBlueprint(pinId, pulseData) {
  if (!pulseData || typeof pulseData !== 'object') return null;
  const targetId = String(pinId || '').trim();

  // Search pin in breakout_pins, fresh_rocket_pins, vault_surge_pins, or pinarchive_winners
  const pin = (pulseData.breakout_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.fresh_rocket_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.vault_surge_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.pinarchive_winners || []).find(p => String(p.pin_id) === targetId)
    || { pin_id: targetId, title: 'Untitled Pin', dominant_color: '#888888' };

  const pinAnnotations = extractCleanAnnotations(pin.visual_annotations || pin.annotations || []);
  const annotationNorms = new Set(pinAnnotations.map(a => a.norm));

  // Match relevant Guided Search Capsules
  const relevantCapsules = (pulseData.guided_capsule_crossovers || []).filter(c => {
    const termNorm = (c.term || c.display_label || '').toLowerCase();
    if (!termNorm) return false;
    if (annotationNorms.has(termNorm)) return true;
    for (const an of annotationNorms) {
      if (an.includes(termNorm) || termNorm.includes(an)) return true;
    }
    if (pin.title && pin.title.toLowerCase().includes(termNorm)) return true;
    if (Array.isArray(pin.keywords)) {
      for (const kw of pin.keywords) {
        if ((kw.keyword_text || '').toLowerCase().includes(termNorm)) return true;
      }
    }
    return false;
  }).slice(0, 10);

  // Match relevant Triplet Crossovers
  const relevantTriplets = (pulseData.annotation_crossovers?.triplet_crossovers || []).filter(t => {
    return annotationNorms.has(t.tag_a_norm) || annotationNorms.has(t.tag_b_norm) || annotationNorms.has(t.tag_c_norm);
  }).slice(0, 8);

  // Match relevant Pair Crossovers
  const relevantPairs = (pulseData.annotation_crossovers?.pair_crossovers || []).filter(p => {
    return annotationNorms.has(p.tag_a_norm) || annotationNorms.has(p.tag_b_norm);
  }).slice(0, 8);

  // Recommended Target Board
  const winningBoards = pulseData.hidden_gems_telemetry?.winning_boards || [];
  let recommendedBoard = pin.board_name || (winningBoards[0]?.board_name || 'Winning Arbitrage Board');

  // Recommended Color Palette
  const dominantPalette = pulseData.hidden_gems_telemetry?.dominant_color_palette || [];
  const recommendedColors = [pin.dominant_color || '#888888', ...dominantPalette.map(c => c.color).filter(c => c !== pin.dominant_color)].slice(0, 5);

  return {
    pin_id: pin.pin_id,
    title: pin.title || '',
    domain: pin.domain || '',
    destination_url: pin.destination_url || '',
    image_url: pin.image_url || '',
    creator_username: pin.creator_username || '',
    board_name: pin.board_name || '',
    dominant_color: pin.dominant_color || '#888888',
    recommended_target_board: recommendedBoard,
    recommended_color_palette: recommendedColors,
    relevant_guided_capsules: relevantCapsules,
    relevant_triplet_crossovers: relevantTriplets,
    relevant_pair_crossovers: relevantPairs,
    metrics: {
      save_count: Number(pin.save_count || pin.saves || 0),
      repin_count: Number(pin.repin_count || pin.repins || 0),
      daily_save_velocity: Number(pin.daily_save_velocity || pin.velocity || 0),
      delta_repins_24h: Number(pin.delta_repins_24h || 0),
      pin_age_days: pin.pin_age_days ?? null,
      is_fresh_14d: Boolean(pin.is_fresh_14d),
      url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0),
      rank_climb_24h: Number(pin.rank_climb_24h || 0)
    },
    five_source_relevance: {
      source_1_serp: {
        keywords: pin.keywords || (pin.keyword_text ? [{ keyword_id: pin.keyword_id ?? null, keyword_text: pin.keyword_text, rank: pin.rank_position ?? null }] : []),
        best_rank: pin.best_rank ?? pin.rank_position ?? null,
        rank_climb_24h: Number(pin.rank_climb_24h || 0)
      },
      source_2_guided_capsules: relevantCapsules.map(c => ({
        label: c.display_label,
        score: c.max_score,
        keyword_count: c.keyword_count
      })),
      source_3_cv_annotations: pinAnnotations,
      source_4_pinsage_board: {
        current_board: pin.board_name || '',
        recommended_target_board: recommendedBoard
      },
      source_5_domain_leverage: {
        domain: pin.domain || '',
        url_global_saves: Number(pin.url_global_saves || 0),
        url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0)
      }
    }
  };
}
