/**
 * Keyword Folders Crossover Downstream Matrix, Gap & Spoke Builders
 * Extracted from src/modules/keywords/folders-crossover.mjs
 */

import {
  extractCanonicalAnnotations,
  formatTagTitleCase
} from '../../domain/pin-intelligence.mjs';
import {
  folderTrendsCache,
  isSyntheticPinTitle,
  derivePinTitle,
  normalizeTagLemma,
  STOPWORDS,
  cleanExternalDomain,
  extractAuthenticRowGains
} from './folders-crossover.mjs';

/**
 * High-Converting Pinterest Spoke Angle Synthesizer
 * Formulates natural, click-worthy titles from modifier pivots and target keywords.
 */
export function synthesizeSpokeTitle(modifier, targetKw) {
  const kw = formatTagTitleCase(targetKw);
  const modLower = String(modifier || '').toLowerCase().trim();

  if (modLower.includes('oven')) {
    return `Crispy Oven-Baked ${kw} (Foolproof Step-by-Step)`;
  }
  if (modLower.includes('twice')) {
    const cleanKw = kw.replace(/^baked\s+/i, '');
    return `Twice-Baked ${cleanKw} with Melted Cheese & Herbs`;
  }
  if (modLower.includes('crock') || modLower.includes('slow cooker')) {
    return `Slow Cooker ${kw}: Dump & Go Weeknight Comfort`;
  }
  if (modLower.includes('soup')) {
    return `Cozy Creamy ${kw} Soup: 30-Minute Dinner`;
  }
  if (modLower.includes('pasta')) {
    return `Creamy Garlic ${kw} with Al Dente Pasta`;
  }
  if (modLower.includes('bite')) {
    return `Tender Pan-Seared ${kw} Bites: Juicy & Quick`;
  }
  if (modLower.includes('bar')) {
    return `The Ultimate ${kw} Bar: Build-Your-Own Party Board`;
  }
  if (modLower.includes('air fryer')) {
    return `Ultra-Crispy Air Fryer ${kw} in 15 Minutes`;
  }
  if (modLower.includes('recipe')) {
    return `The Best ${kw} Recipe (Better Than Restaurant Quality)`;
  }
  if (modLower.includes('loaded')) {
    return `Loaded ${kw} with Crispy Bacon & Green Onions`;
  }
  if (modLower.includes('orzo')) {
    return `One-Pot Creamy ${kw} Orzo Skillet`;
  }
  if (modLower.includes('instant') || modLower.includes('pot')) {
    return `Instant Pot ${kw}: Fall-Apart Tender in Minutes`;
  }

  const cleanMod = formatTagTitleCase(modifier);
  return `${cleanMod} ${kw}: Quick & Easy Step-by-Step`;
}

/**
 * Builds the 6-dimension crossover matrix payload from queried catalog rows.
 */
export async function buildFolderCrossoverMatrix({
  sql,
  folder,
  folderKeywords,
  totalKeywords,
  pinRows,
  displacedRows,
  capsuleRows,
  repinWindowRows,
  pulseAnalyticsPromise
}) {
  const combinedCatalogRows = [...pinRows, ...displacedRows];

  // =========================================================================
  // DIMENSION A: MULTI-RANKING SUPER-PINS OVERLAP
  // =========================================================================
  const pinMap = new Map(); // pin_id -> { pin data, keywords: [] }
  const safeNum = (v, fallback = 0) => {
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const nowMs = Date.now();
  const folderCreatedMs = folder.created_at ? new Date(folder.created_at).getTime() : null;

  for (const row of combinedCatalogRows) {
    const pid = String(row.pin_id).trim();
    if (!pid) continue;

    const rankNum = Number(row.rank_position);
    if (!Number.isFinite(rankNum) || rankNum < 1) {
      continue;
    }

    const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
    const rowVisualAnnotations = Array.isArray(row.visual_annotations) && row.visual_annotations.length > 0
      ? row.visual_annotations
      : (Array.isArray(meta.visual_annotations) ? meta.visual_annotations : []);

    const pinCreatedMs = row.created_at_pinterest ? new Date(row.created_at_pinterest).getTime() : null;
    const pinAgeDays = (pinCreatedMs && !isNaN(pinCreatedMs))
      ? Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000))
      : null;

    const folderAddedMs = row.folder_added_at ? new Date(row.folder_added_at).getTime() : folderCreatedMs;
    const folderAgeDays = (folderAddedMs && !isNaN(folderAddedMs))
      ? Math.max(0, Math.floor((nowMs - folderAddedMs) / 86400000))
      : 0;

    const vel = safeNum(row.daily_save_velocity);
    const rowSaves = safeNum(row.save_count ?? meta.raw_saves ?? 0);
    const rowRepins = safeNum(row.repin_count);

    const rowGains = extractAuthenticRowGains(row, safeNum);
    const rowGains5d = rowGains.gains_5d;
    const rowGains7d = rowGains.gains_7d;
    const rowGains10d = rowGains.gains_10d;
    const rowGains15d = rowGains.gains_15d;
    const rowGains24h = rowGains.gains_24h;

    const delta24h = (rowGains24h != null) ? rowGains24h : vel;
    const effectiveVel = vel;

    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const candidateRawTitle = String(row.title || meta.title || '').trim();
      const authenticTitle = !isSyntheticPinTitle(candidateRawTitle) ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: authenticTitle,
        title: authenticTitle,
        seo_title: row.seo_title || meta.seo_title || '',
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: rowSaves,
        is_vacuum_pin: Boolean(row.image_url || meta.image_url) && (!row.domain || row.domain === 'Uploaded by user') && rowSaves >= 100,
        board_name: row.board_name || meta.board_name || '',
        visual_annotations: rowVisualAnnotations,
        dominant_color: row.dominant_color || meta.dominant_color || null,
        created_at_pinterest: row.created_at_pinterest || meta.created_at_pinterest || null,
        alt_text: row.alt_text || meta.alt_text || '',
        description: row.description || meta.description || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || '2:3',
        creation_method: row.creation_method || meta.creation_method || null,
        repin_count: rowRepins,
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        effective_velocity: effectiveVel,
        velocity_source: vel > 0 ? 'saves' : (safeNum(row.delta_repins_24h, 0) > 0 ? 'repins' : 'saves'),
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
        crawled_at: row.crawled_at,
        pin_age_days: pinAgeDays,
        folder_age_days: folderAgeDays,
        delta_saves_24h: delta24h,
        delta_repins_24h: safeNum(row.delta_repins_24h, 0),
        daily_repin_velocity: safeNum(row.daily_repin_velocity, null),
        gains_5d: rowGains5d,
        gains_7d: rowGains7d,
        gains_10d: rowGains10d,
        gains_15d: rowGains15d,
        rankings: []
      });
    } else {
      const existingPin = pinMap.get(pid);
      const incomingTitle = String(row.title || meta.title || '').trim();
      if (!existingPin.raw_title && !isSyntheticPinTitle(incomingTitle)) {
        existingPin.raw_title = incomingTitle;
        existingPin.title = incomingTitle;
      }
      if (!existingPin.seo_title && (row.seo_title || meta.seo_title)) {
        existingPin.seo_title = row.seo_title || meta.seo_title;
      }
      if (!existingPin.image_url && (row.image_url || meta.image_url)) {
        existingPin.image_url = row.image_url || meta.image_url;
      }
      if (!existingPin.destination_url && (row.destination_url || meta.destination_url)) {
        existingPin.destination_url = row.destination_url || meta.destination_url;
      }
      if (!existingPin.board_name && (row.board_name || meta.board_name)) {
        existingPin.board_name = row.board_name || meta.board_name;
      }
      if (!existingPin.alt_text && (row.alt_text || meta.alt_text)) {
        existingPin.alt_text = row.alt_text || meta.alt_text;
      }
      if (!existingPin.description && (row.description || meta.description)) {
        existingPin.description = row.description || meta.description;
      }
      const incomingColor = row.dominant_color || meta.dominant_color || null;
      if (incomingColor && (!existingPin.dominant_color || existingPin.dominant_color === '#888888' || existingPin.dominant_color === '#000000' || existingPin.dominant_color === '#1e1e24')) {
        existingPin.dominant_color = incomingColor;
      }
      if (!row.is_displaced && rowSaves > 0) existingPin.save_count = rowSaves;
      else if (!existingPin.save_count && rowSaves > 0) existingPin.save_count = rowSaves;
      if (!row.is_displaced && rowRepins > 0) existingPin.repin_count = rowRepins;
      else if (!existingPin.repin_count && rowRepins > 0) existingPin.repin_count = rowRepins;
      existingPin.comment_count = Math.max(existingPin.comment_count, safeNum(row.comment_count));

      // Symmetrical velocity update: fresher crawl updates velocity downward or upward cleanly
      const existingCrawlMs = existingPin.crawled_at ? new Date(existingPin.crawled_at).getTime() : 0;
      const rowCrawlMs = row.crawled_at ? new Date(row.crawled_at).getTime() : 0;
      if (rowCrawlMs > existingCrawlMs && row.crawled_at) {
        existingPin.crawled_at = row.crawled_at;
        existingPin.daily_save_velocity = vel;
        existingPin.delta_saves_24h = delta24h;
        existingPin.delta_repins_24h = safeNum(row.delta_repins_24h, 0);
        existingPin.effective_velocity = effectiveVel;
        existingPin.velocity_source = vel > 0 ? 'saves' : (safeNum(row.delta_repins_24h, 0) > 0 ? 'repins' : 'saves');
      } else if (existingCrawlMs === 0 || rowCrawlMs === existingCrawlMs) {
        if (existingPin.daily_save_velocity == null || existingPin.daily_save_velocity === 0) {
          existingPin.daily_save_velocity = vel;
          existingPin.delta_saves_24h = delta24h;
        } else if (vel > 0 && vel !== existingPin.daily_save_velocity) {
          existingPin.daily_save_velocity = vel;
          existingPin.delta_saves_24h = delta24h;
        }
        existingPin.delta_repins_24h = Math.max(existingPin.delta_repins_24h || 0, safeNum(row.delta_repins_24h, 0));
        if (row.daily_repin_velocity != null && (existingPin.daily_repin_velocity == null || Number(row.daily_repin_velocity) > Number(existingPin.daily_repin_velocity))) {
          existingPin.daily_repin_velocity = safeNum(row.daily_repin_velocity, null);
        }
        existingPin.effective_velocity = existingPin.daily_save_velocity || 0;
        existingPin.velocity_source = 'saves';
      }

      // Preserve authentic database rolling gains without blowing up by multiplying corrupted velocity
      if (rowGains5d != null && (existingPin.gains_5d == null || rowGains5d > existingPin.gains_5d)) existingPin.gains_5d = rowGains5d;
      if (rowGains7d != null && (existingPin.gains_7d == null || rowGains7d > existingPin.gains_7d)) existingPin.gains_7d = rowGains7d;
      if (rowGains10d != null && (existingPin.gains_10d == null || rowGains10d > existingPin.gains_10d)) existingPin.gains_10d = rowGains10d;
      if (rowGains15d != null && (existingPin.gains_15d == null || rowGains15d > existingPin.gains_15d)) existingPin.gains_15d = rowGains15d;

      if (!existingPin.created_at_pinterest && row.created_at_pinterest) {
        existingPin.created_at_pinterest = row.created_at_pinterest;
        existingPin.pin_age_days = pinAgeDays;
      }
      if (folderAgeDays > 0 && (existingPin.folder_age_days === 0 || folderAgeDays > existingPin.folder_age_days)) {
        existingPin.folder_age_days = folderAgeDays;
      }
      if (!existingPin.creator_username && row.creator_username) {
        existingPin.creator_username = row.creator_username;
      }
      if (rowVisualAnnotations.length > existingPin.visual_annotations.length) {
        existingPin.visual_annotations = rowVisualAnnotations;
      }
    }

    const pinRecord = pinMap.get(pid);
    pinRecord.rankings.push({
      keyword_id: row.keyword_id,
      keyword: row.keyword_text,
      rank_position: rankNum,
      is_displaced: Boolean(row.is_displaced)
    });
  }

  let allPins = Array.from(pinMap.values());
  let vacuumPinsCount = 0;
  for (const p of allPins) {
    p.has_active_rank = p.rankings.some(r => !r.is_displaced);
    p.has_vault_rank = p.rankings.some(r => r.is_displaced);
    p.overlap_count = p.rankings.length;
    p.overlap_percentage = Math.round((p.overlap_count / totalKeywords) * 100);
    p.is_super_pin = !p.is_displaced && p.overlap_count >= 2 && p.rankings.every(r => !r.is_displaced && Number.isFinite(r.rank_position) && r.rank_position >= 1);
    p.min_rank = p.rankings.length > 0 ? Math.min(...p.rankings.map(r => r.rank_position)) : 1;
    p.avg_rank = p.rankings.length > 0 ? Number((p.rankings.reduce((sum, r) => sum + r.rank_position, 0) / p.rankings.length).toFixed(1)) : 1;
    p.rankings.sort((a, b) => a.rank_position - b.rank_position);

    // [INVARIANT: VACUUM-PIN-CALCULATION]
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = Boolean(p.image_url) && (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // =========================================================================
  // 4-TIER DISTRIBUTED CREATIVE METADATA HYDRATION
  // =========================================================================
  const missingMetaPins = allPins.filter(
    p => !p.raw_title || isSyntheticPinTitle(p.title) || !p.image_url || !p.created_at_pinterest
  );
  let hasUnhydratedPriorityPins = false;

  if (missingMetaPins.length > 0) {
    const enrichedMap = new Map();

    // Apply hydrated creative metadata back to allPins BEFORE Dimension B (Tag Bridges) & Dimension D
    for (const p of missingMetaPins) {
      const meta = enrichedMap.get(String(p.pin_id));
      if (meta) {
        if ((!p.raw_title || isSyntheticPinTitle(p.title)) && meta.title && !isSyntheticPinTitle(meta.title)) {
          p.raw_title = String(meta.title).trim();
          p.title = p.raw_title;
        }
        if (!p.seo_title && meta.seo_title) p.seo_title = meta.seo_title;
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
        if (!p.domain && meta.domain) p.domain = meta.domain;
        if (!p.creator_username && meta.creator_username) {
          p.creator_username = meta.creator_username;
          if (!p.creator_name) p.creator_name = meta.creator_username;
        }
        if (!p.board_name && meta.board_name) p.board_name = meta.board_name;
        if ((!p.dominant_color || p.dominant_color === '#1e1e24' || p.dominant_color === '#888888' || p.dominant_color === '#000000') && meta.dominant_color && meta.dominant_color !== '#888888') {
          p.dominant_color = meta.dominant_color;
        }
        if ((!p.visual_annotations || p.visual_annotations.length === 0) && Array.isArray(meta.visual_annotations) && meta.visual_annotations.length > 0) {
          p.visual_annotations = meta.visual_annotations;
        }
        if (!p.alt_text && meta.alt_text) p.alt_text = meta.alt_text;
        if (!p.description && meta.description) p.description = meta.description;
        if (!p.created_at_pinterest && meta.created_at_pinterest) {
          p.created_at_pinterest = meta.created_at_pinterest;
          const pinCreatedMs = new Date(meta.created_at_pinterest).getTime();
          if (!isNaN(pinCreatedMs)) {
            p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
          }
        }
        if ((!p.aspect_ratio || p.aspect_ratio === '2:3') && meta.aspect_ratio) {
          p.aspect_ratio = meta.aspect_ratio;
        }
        if ((!p.format || p.format === 'ORGANIC PIN') && meta.creation_method) {
          p.format = String(meta.creation_method).toUpperCase();
        }
        if (!p.save_count && meta.save_count) p.save_count = Number(meta.save_count);
        if (!p.repin_count && meta.repin_count) p.repin_count = Number(meta.repin_count);
        if (meta.comment_count) p.comment_count = Math.max(p.comment_count || 0, Number(meta.comment_count));
        if (meta.daily_save_velocity !== undefined && meta.daily_save_velocity !== null) {
          p.daily_save_velocity = Number(meta.daily_save_velocity);
          p.delta_saves_24h = Number(meta.daily_save_velocity);
        }
        if (meta.delta_repins_24h !== undefined && meta.delta_repins_24h !== null) {
          p.delta_repins_24h = Number(meta.delta_repins_24h);
        }
        p.effective_velocity = p.daily_save_velocity || 0;
        p.velocity_source = 'saves';
      }
    }
  }

  // Final Pass: Synthesize fallback title via derivePinTitle across ALL pins ONLY if authentic title is STILL missing,
  // and recompute vacuumPinsCount + pin_age_days cleanly.
  const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
  vacuumPinsCount = 0;
  for (const p of allPins) {
    if (p.pin_age_days == null && p.created_at_pinterest) {
      const pinCreatedMs = new Date(p.created_at_pinterest).getTime();
      if (!isNaN(pinCreatedMs)) {
        p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
      }
    }
    if (!p.aspect_ratio) p.aspect_ratio = '2:3';
    if (!p.title || isSyntheticPinTitle(p.title)) {
      const pinKw = p.rankings[0]?.keyword || primaryKeyword;
      p.title = derivePinTitle(
        p.raw_title || '',
        p.destination_url || p.domain || '',
        pinKw,
        p.board_name || '',
        p.visual_annotations || [],
        p.description || '',
        p.alt_text || '',
        p.seo_title || ''
      );
    }
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = Boolean(p.image_url) && (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // Deduplicate allPins by canonical creative signature before deriving Super Pins
  // [INVARIANT: FOLDER-CROSSOVER-CREATIVE-DEDUPLICATION]
  const creativePinMap = new Map();
  for (const p of allPins) {
    const cKey = `pid:${p.pin_id}`;

    if (!creativePinMap.has(cKey)) {
      creativePinMap.set(cKey, p);
    } else {
      const existing = creativePinMap.get(cKey);
      const existingHasActive = existing.rankings?.some(r => !r.is_displaced && r.rank_position && r.rank_position <= 100);
      const incomingHasActive = p.rankings?.some(r => !r.is_displaced && r.rank_position && r.rank_position <= 100);

      let primary = existing;
      let secondary = p;

      if (!existingHasActive && incomingHasActive) {
        primary = p;
        secondary = existing;
        creativePinMap.set(cKey, primary);
      } else if (existingHasActive === incomingHasActive) {
        const pVel = p.daily_save_velocity || 0;
        const eVel = existing.daily_save_velocity || 0;
        if (pVel > eVel || (pVel === eVel && (p.save_count || 0) > (existing.save_count || 0))) {
          primary = p;
          secondary = existing;
          creativePinMap.set(cKey, primary);
        }
      }

      // Merge rankings arrays across distinct keyword_ids
      const seenKws = new Set(primary.rankings.map(r => r.keyword_id));
      for (const r of (secondary.rankings || [])) {
        if (!seenKws.has(r.keyword_id)) {
          seenKws.add(r.keyword_id);
          primary.rankings.push(r);
        } else {
          const existingR = primary.rankings.find(er => er.keyword_id === r.keyword_id);
          if (existingR && r.rank_position && (!existingR.rank_position || r.rank_position < existingR.rank_position)) {
            existingR.rank_position = r.rank_position;
            existingR.is_displaced = r.is_displaced;
          }
        }
      }
      primary.overlap_count = primary.rankings.length;
      primary.overlap_percentage = Math.round((primary.overlap_count / totalKeywords) * 100);
      primary.is_super_pin = primary.overlap_count >= (totalKeywords > 1 ? 2 : 1) && primary.rankings.every(r => Number.isFinite(r.rank_position) && r.rank_position >= 1);
      primary.has_active_rank = primary.rankings.some(r => !r.is_displaced);
      primary.has_vault_rank = primary.rankings.some(r => r.is_displaced);
      primary.min_rank = primary.rankings.length > 0 ? Math.min(...primary.rankings.map(r => r.rank_position)) : 1;
      if (!primary.save_count && secondary.save_count) primary.save_count = secondary.save_count;
      if (!primary.daily_save_velocity && secondary.daily_save_velocity) primary.daily_save_velocity = secondary.daily_save_velocity;
      if (!primary.delta_saves_24h && secondary.delta_saves_24h) primary.delta_saves_24h = secondary.delta_saves_24h;
      if (!primary.delta_repins_24h && secondary.delta_repins_24h) primary.delta_repins_24h = secondary.delta_repins_24h;
      primary.effective_velocity = primary.daily_save_velocity || 0;
      primary.velocity_source = 'saves';
      if (!primary.repin_count && secondary.repin_count) primary.repin_count = secondary.repin_count;
      if (!primary.image_url && secondary.image_url) primary.image_url = secondary.image_url;
      if ((!primary.dominant_color || primary.dominant_color === '#888888' || primary.dominant_color === '#000000') && secondary.dominant_color && secondary.dominant_color !== '#888888') {
        primary.dominant_color = secondary.dominant_color;
      }
      if ((!primary.raw_title || isSyntheticPinTitle(primary.title)) && secondary.title && !isSyntheticPinTitle(secondary.title)) {
        primary.title = secondary.title;
        primary.raw_title = secondary.raw_title;
      }
    }
  }
  allPins = Array.from(creativePinMap.values());

  // Check if any top-50 priority pin still lacks image_url
  const top50PriorityCheck = allPins
    .slice()
    .sort((a, b) => (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0) || (b.save_count || 0) - (a.save_count || 0))
    .slice(0, 50);
  hasUnhydratedPriorityPins = top50PriorityCheck.some(p => !p.image_url);

  // Super Pins: Strictly confirmed multi-ranking pins (rank >= 1 across >= 2 keywords)
  const superPins = allPins
    .filter(p => !p.is_displaced && p.overlap_count >= (totalKeywords > 1 ? 2 : 1) && p.rankings.length >= (totalKeywords > 1 ? 2 : 1) && p.rankings.every(r => !r.is_displaced && r.rank_position >= 1))
    .sort((a, b) => {
      const aVel = (a.effective_velocity != null) ? a.effective_velocity : (a.daily_save_velocity || 0);
      const bVel = (b.effective_velocity != null) ? b.effective_velocity : (b.daily_save_velocity || 0);
      if (bVel !== aVel) {
        return bVel - aVel;
      }
      if (b.overlap_count !== a.overlap_count) {
        return b.overlap_count - a.overlap_count;
      }
      return (b.save_count || 0) - (a.save_count || 0);
    });

  // Top overall pins if no super pins or total keywords is 1
  const topRankedPins = allPins
    .sort((a, b) => {
      const aVel = (a.effective_velocity != null) ? a.effective_velocity : (a.daily_save_velocity || 0);
      const bVel = (b.effective_velocity != null) ? b.effective_velocity : (b.daily_save_velocity || 0);
      return (bVel - aVel) || (b.save_count || 0) - (a.save_count || 0);
    })
    .slice(0, 30);

  // =========================================================================
  // CREATIVE SIGNATURE DEDUPLICATION FOR MATRIX PATTERNS
  // =========================================================================
  for (const pin of allPins) {
    const rawTags = new Set();
    const canonicalTags = extractCanonicalAnnotations(pin.visual_annotations, { lemmatizeDedupe: true, titleCase: false, limit: 25 });
    for (const rawTag of canonicalTags) {
      if (rawTag && rawTag.length >= 3 && !STOPWORDS.has(rawTag)) {
        const lemma = normalizeTagLemma(rawTag);
        if (lemma && lemma.length >= 3 && !STOPWORDS.has(lemma)) {
          rawTags.add(lemma);
        }
      }
    }
    pin._canonical_tags = Array.from(rawTags);
  }

  const deduplicateCreativeClusterPins = (pinsList) => {
    const sorted = (pinsList || []).slice().sort((a, b) => {
      const aVel = Number(a.effective_velocity ?? a.daily_save_velocity ?? 0);
      const bVel = Number(b.effective_velocity ?? b.daily_save_velocity ?? 0);
      if (bVel !== aVel) return bVel - aVel;
      if ((b.save_count || 0) !== (a.save_count || 0)) return (b.save_count || 0) - (a.save_count || 0);
      return (b.overlap_count || 0) - (a.overlap_count || 0);
    });

    const byImg = new Map();
    const byTitleDom = new Map();
    const byLongTitle = new Map();
    const uniqueList = [];

    for (const p of sorted) {
      const rawImg = String(p.image_url || '').trim().toLowerCase().split('?')[0];
      const imgSeg = rawImg ? (rawImg.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '') : '';
      const imgSig = imgSeg.length >= 8 ? `img:${imgSeg}` : '';

      const cleanDom = cleanExternalDomain(p.domain) || String(p.domain || '').toLowerCase().replace(/^www\./, '').trim();
      const normTitle = String(p.raw_title || p.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const hasRealTitle = normTitle.length >= 4 && normTitle !== 'untitled' && normTitle !== 'untitled pin' && !isSyntheticPinTitle(normTitle);
      const titleDomSig = (hasRealTitle && cleanDom) ? `td:${normTitle}|${cleanDom}` : '';
      const titleWordCount = hasRealTitle ? normTitle.split(' ').length : 0;
      const longTitleSig = (hasRealTitle && titleWordCount >= 3 && normTitle.length >= 14) ? `lt:${normTitle}` : '';

      const existing = (imgSig && byImg.get(imgSig)) ||
                       (titleDomSig && byTitleDom.get(titleDomSig)) ||
                       (longTitleSig && byLongTitle.get(longTitleSig)) ||
                       null;

      if (existing) {
        existing.repin_clones_count = (existing.repin_clones_count || 0) + 1;
        if (imgSig && !byImg.has(imgSig)) byImg.set(imgSig, existing);
        if (titleDomSig && !byTitleDom.has(titleDomSig)) byTitleDom.set(titleDomSig, existing);
        if (longTitleSig && !byLongTitle.has(longTitleSig)) byLongTitle.set(longTitleSig, existing);

        const seenKw = new Set((existing.rankings || []).map(r => r.keyword));
        for (const r of (p.rankings || [])) {
          if (r.keyword && !seenKw.has(r.keyword)) {
            seenKw.add(r.keyword);
            existing.rankings.push(r);
          }
        }
        if ((!existing.dominant_color || existing.dominant_color === '#888888' || existing.dominant_color === '#000000') && p.dominant_color && p.dominant_color !== '#888888') {
          existing.dominant_color = p.dominant_color;
        }
        if (Array.isArray(p._canonical_tags) && p._canonical_tags.length > 0) {
          const mergedTags = new Set(existing._canonical_tags || []);
          for (const ct of p._canonical_tags) mergedTags.add(ct);
          existing._canonical_tags = Array.from(mergedTags);
        }
        continue;
      }

      const cloned = {
        ...p,
        repin_clones_count: 0,
        rankings: Array.isArray(p.rankings) ? p.rankings.slice() : [],
        _canonical_tags: Array.isArray(p._canonical_tags) ? p._canonical_tags.slice() : []
      };
      if (imgSig) byImg.set(imgSig, cloned);
      if (titleDomSig) byTitleDom.set(titleDomSig, cloned);
      if (longTitleSig) byLongTitle.set(longTitleSig, cloned);
      uniqueList.push(cloned);
    }

    return uniqueList;
  };

  const uniqueCreativePins = deduplicateCreativeClusterPins(allPins);

  // =========================================================================
  // DIMENSION B: UNIVERSAL TAG BRIDGES & 1-TAG POWER LEADERS (Unified SSOT)
  // =========================================================================
  const formatMatrixPin = (pin) => ({
    pin_id: pin.pin_id,
    title: pin.title || 'Untitled Pin',
    image_url: pin.image_url,
    domain: pin.domain || '',
    creator_username: pin.creator_username || '',
    save_count: Number(pin.save_count || 0),
    repin_count: Number(pin.repin_count || 0),
    repin_clones_count: Number(pin.repin_clones_count || 0),
    daily_save_velocity: Number(pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0),
    effective_velocity: Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0),
    delta_saves_24h: Number(pin.delta_saves_24h || 0),
    delta_repins_24h: Number(pin.delta_repins_24h || 0),
    gains_7d: pin.gains_7d != null ? Number(pin.gains_7d) : null,
    pin_age_days: pin.pin_age_days,
    folder_age_days: pin.folder_age_days,
    dominant_color: pin.dominant_color || null,
    aspect_ratio: pin.aspect_ratio || '2:3',
    overlap_count: pin.overlap_count || (pin.rankings ? pin.rankings.length : 1)
  });

  const tagMap = new Map();

  for (const pin of uniqueCreativePins) {
    const rawTags = pin._canonical_tags || [];
    const pinKeywords = pin.rankings.map(r => r.keyword).filter(Boolean);
    const pinVel = Math.max(0, Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0));
    const pinSavesGain = Math.max(0, Number(pin.delta_saves_24h || pin.daily_save_velocity || 0));
    const pinRepinsGain = Math.max(0, Number(pin.delta_repins_24h || 0));

    for (const t of rawTags) {
      if (!t || t.length < 3 || STOPWORDS.has(t.toLowerCase())) continue;
      if (!tagMap.has(t)) {
        tagMap.set(t, {
          tag: t,
          display_name: formatTagTitleCase(t),
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          saves_gain: 0,
          velocity_gain: 0,
          repins_gain: 0,
          matching_pins: []
        });
      }
      const record = tagMap.get(t);
      record.pin_count++;
      record.total_saves += Number(pin.save_count || 0);
      record.saves_gain += pinSavesGain;
      record.velocity_gain += pinVel;
      record.repins_gain += pinRepinsGain;
      for (const kw of pinKeywords) {
        record.keywords_set.add(kw);
      }
      record.matching_pins.push(pin);
    }
  }

  const allTagBridges = Array.from(tagMap.values()).map(t => {
    const kwCount = t.keywords_set.size;
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);
    const sortedPins = t.matching_pins
      .slice()
      .sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0))
      .slice(0, 6)
      .map(formatMatrixPin);
    const velGain = Number(t.velocity_gain.toFixed(1));
    const savesGain = Math.round(t.saves_gain);
    const repinsGain = Math.round(t.repins_gain);
    return {
      tag: t.display_name,
      raw_tag: t.tag,
      keywords: Array.from(t.keywords_set),
      keyword_overlap_count: kwCount,
      keywords_count: kwCount,
      overlap_percentage: overlapPct,
      pin_count: t.pin_count,
      count: t.pin_count,
      total_saves: t.total_saves,
      saves_gain: savesGain,
      velocity_gain: velGain,
      total_velocity: velGain,
      total_repins_delta: repinsGain,
      metric_gains: {
        saves: savesGain,
        velocity: velGain,
        repins: repinsGain
      },
      is_universal: overlapPct >= 50,
      bridge_tier: overlapPct >= 80 ? 'Master Bridge (80%+)' : overlapPct >= 50 ? 'Strong Bridge (50%+)' : 'Secondary Bridge',
      sample_pins: sortedPins.slice(0, 3),
      matching_pins: sortedPins
    };
  })
  .sort((a, b) => {
    if (b.pin_count !== a.pin_count) {
      return b.pin_count - a.pin_count;
    }
    if (b.keyword_overlap_count !== a.keyword_overlap_count) {
      return b.keyword_overlap_count - a.keyword_overlap_count;
    }
    return b.total_velocity - a.total_velocity || b.total_saves - a.total_saves;
  });

  // Compute universalTagsCount and link universal bridge visual tags BEFORE slicing tagBridges to 150
  const universalTagsCount = allTagBridges.slice(0, 500).filter(t => t.is_universal).length;
  const bridgeTagMap = new Map();
  for (const tb of allTagBridges.slice(0, 500)) {
    if (tb.is_universal) {
      bridgeTagMap.set(tb.raw_tag.toLowerCase(), tb);
    }
  }

  const tagBridges = allTagBridges.slice(0, 150);

  for (const pin of allPins) {
    const matchedBridges = [];
    for (const lemma of (pin._canonical_tags || [])) {
      if (lemma && bridgeTagMap.has(lemma)) {
        matchedBridges.push(bridgeTagMap.get(lemma).tag);
      }
    }
    pin.bridge_tags = Array.from(new Set(matchedBridges));
  }

  // =========================================================================
  // DIMENSION C: SHARED GUIDED SEARCH CAPSULES & SEMANTIC PIVOTS (True Modifiers)
  // =========================================================================
  const allFolderKeywordStrings = folderKeywords.map(k => String(k.keyword || '').trim()).filter(Boolean);
  const GENERIC_CAPSULE_TERMS = new Set([
    'recipe', 'recipes', 'meal', 'meals', 'meal prep', 'prep', 'protein',
    'high protein', 'high protein meal', 'high protein meals',
    'high protein recipe', 'high protein recipes', 'high protein meal prep',
    'food', 'foods', 'idea', 'ideas', 'dish', 'dishes', 'dinner', 'dinners',
    'guide', 'diy', 'best', 'good', 'great', 'make', 'making', 'cook', 'cooking'
  ]);
  const folderUmbrellaTerms = new Set();
  const cleanFolderNameNorm = String(folder.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanFolderNameNorm) {
    folderUmbrellaTerms.add(cleanFolderNameNorm);
    const fnLemma = normalizeTagLemma(cleanFolderNameNorm);
    if (fnLemma) folderUmbrellaTerms.add(fnLemma);
    for (const w of cleanFolderNameNorm.split(' ')) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        folderUmbrellaTerms.add(w);
        const wLemma = normalizeTagLemma(w);
        if (wLemma) folderUmbrellaTerms.add(wLemma);
      }
    }
  }
  for (const fkw of allFolderKeywordStrings) {
    const fkwNorm = fkw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fkwNorm) folderUmbrellaTerms.add(fkwNorm);
    const fkwLemma = normalizeTagLemma(fkw);
    if (fkwLemma) folderUmbrellaTerms.add(fkwLemma);
    for (const w of fkwNorm.split(' ')) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        folderUmbrellaTerms.add(w);
        const wLemma = normalizeTagLemma(w);
        if (wLemma) folderUmbrellaTerms.add(wLemma);
      }
    }
  }

  const pivotMap = new Map();
  for (const c of capsuleRows) {
    const label = String(c.display_label || '').trim();
    const rawKey = label ? normalizeTagLemma(label) : normalizeTagLemma(c.term);
    const rawLower = String(label || c.term || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawKey || rawKey.length < 2) continue;

    const parentKwNorm = String(c.keyword_text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const parentKwLemma = normalizeTagLemma(c.keyword_text || '');

    if (
      STOPWORDS.has(rawKey) ||
      STOPWORDS.has(rawLower) ||
      GENERIC_CAPSULE_TERMS.has(rawKey) ||
      GENERIC_CAPSULE_TERMS.has(rawLower) ||
      folderUmbrellaTerms.has(rawKey) ||
      folderUmbrellaTerms.has(rawLower) ||
      rawKey === parentKwLemma ||
      rawLower === parentKwNorm
    ) {
      continue;
    }

    if (!pivotMap.has(rawKey)) {
      const displayLabel = label
        ? formatTagTitleCase(label)
        : formatTagTitleCase(c.term || rawKey);

      pivotMap.set(rawKey, {
        term: rawKey,
        display_label: displayLabel,
        keywords_map: new Map(),
        dominant_color: c.dominant_color || '#3b82f6',
        total_score: 0
      });
    }

    const rec = pivotMap.get(rawKey);
    rec.total_score += Number(c.score || 0);
    if (c.keyword_text && !rec.keywords_map.has(c.keyword_text)) {
      rec.keywords_map.set(c.keyword_text, {
        keyword: c.keyword_text,
        display_order: c.display_order,
        score: c.score
      });
    }
  }

  // Pre-index deduplicated creative pins via an O(1) Inverted Word Index
  const wordToCapsuleItems = new Map();
  for (let idx = 0; idx < uniqueCreativePins.length; idx++) {
    const pin = uniqueCreativePins[idx];
    const tagsStr = (pin._canonical_tags || []).join('  ');
    const titleStr = String(pin.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const descStr = String((pin.description || '') + '  ' + (pin.alt_text || '') + '  ' + (pin.seo_title || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const searchBlob = ` ${tagsStr}  ${titleStr}  ${descStr} `;
    const item = { pin, idx, searchBlob };

    const words = searchBlob.trim().split(/\s+/);
    const seenWords = new Set();
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      if (w.length >= 2 && !seenWords.has(w)) {
        seenWords.add(w);
        let bucket = wordToCapsuleItems.get(w);
        if (!bucket) {
          bucket = [];
          wordToCapsuleItems.set(w, bucket);
        }
        bucket.push(item);
      }
    }
  }

  const guidedPivots = Array.from(pivotMap.values()).map(p => {
    const termNorm = p.term.toLowerCase().trim();
    const displayNorm = String(p.display_label || p.term || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const paddedTerm = ` ${termNorm} `;
    const paddedDisplay = displayNorm ? ` ${displayNorm} ` : paddedTerm;
    const hasDistinctDisplay = Boolean(displayNorm && displayNorm !== termNorm);

    const matchedKeywordsSet = new Set(p.keywords_map.keys());
    if (matchedKeywordsSet.size === 0) {
      for (const fkw of allFolderKeywordStrings) {
        const normFkw = ` ${fkw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
        if (normFkw.includes(paddedTerm) || normFkw.includes(paddedDisplay)) {
          matchedKeywordsSet.add(fkw);
        }
      }
    }

    const matchingPinsRaw = [];
    const termFirstWord = termNorm.split(' ')[0];
    const isSingleWordTerm = !termNorm.includes(' ');
    const termBucket = termFirstWord ? (wordToCapsuleItems.get(termFirstWord) || []) : [];

    if (!hasDistinctDisplay) {
      if (isSingleWordTerm) {
        for (let i = 0; i < termBucket.length; i++) {
          matchingPinsRaw.push(termBucket[i].pin);
        }
      } else {
        for (let i = 0; i < termBucket.length; i++) {
          const item = termBucket[i];
          if (item.searchBlob.includes(paddedTerm)) {
            matchingPinsRaw.push(item.pin);
          }
        }
      }
    } else {
      const seenPinIdx = new Set();
      for (let i = 0; i < termBucket.length; i++) {
        const item = termBucket[i];
        if (isSingleWordTerm || item.searchBlob.includes(paddedTerm)) {
          seenPinIdx.add(item.idx);
          matchingPinsRaw.push(item.pin);
        }
      }
      const dispFirstWord = displayNorm.split(' ')[0];
      const isSingleWordDisp = !displayNorm.includes(' ');
      const dispBucket = dispFirstWord ? (wordToCapsuleItems.get(dispFirstWord) || []) : [];
      for (let i = 0; i < dispBucket.length; i++) {
        const item = dispBucket[i];
        if (!seenPinIdx.has(item.idx) && (isSingleWordDisp || item.searchBlob.includes(paddedDisplay))) {
          seenPinIdx.add(item.idx);
          matchingPinsRaw.push(item.pin);
        }
      }
    }

    matchingPinsRaw.sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0));
    const topMatchingPins = matchingPinsRaw.slice(0, 6).map(formatMatrixPin);
    const totalVel = Math.round(matchingPinsRaw.reduce((sum, pin) => sum + Math.max(0, Number(pin.effective_velocity ?? pin.daily_save_velocity ?? 0)), 0) * 10) / 10;
    const totalRepins = Math.round(matchingPinsRaw.reduce((sum, pin) => sum + Math.max(0, Number(pin.delta_repins_24h || 0)), 0));
    const totalSaves = matchingPinsRaw.reduce((sum, pin) => sum + Number(pin.save_count || 0), 0);

    const kwList = Array.from(matchedKeywordsSet).map(kw => p.keywords_map.get(kw) || { keyword: kw, display_order: 99, score: 1 });
    const kwCount = Math.max(1, matchedKeywordsSet.size);
    const overlapPct = Math.round((kwCount / totalKeywords) * 100);

    return {
      term: p.term,
      display_label: p.display_label,
      shared_keywords: kwList,
      keywords: Array.from(matchedKeywordsSet),
      shared_count: kwCount,
      keyword_count: kwCount,
      distinct_keywords: kwCount,
      keywords_count: kwCount,
      pin_count: matchingPinsRaw.length,
      count: matchingPinsRaw.length,
      total_velocity: totalVel,
      cross_serp_velocity: totalVel,
      total_repins_delta: totalRepins,
      total_saves: totalSaves,
      overlap_percentage: overlapPct,
      composite_score: Number(p.total_score.toFixed(4)),
      dominant_color: p.dominant_color,
      is_connector: kwCount >= 2,
      matching_pins: topMatchingPins
    };
  })
  .filter(gp => gp.pin_count >= 1)
  .sort((a, b) => {
    if (b.keyword_count !== a.keyword_count) {
      return b.keyword_count - a.keyword_count;
    }
    if (b.total_velocity !== a.total_velocity) {
      return b.total_velocity - a.total_velocity;
    }
    return b.pin_count - a.pin_count || b.composite_score - a.composite_score;
  })
  .slice(0, 60);

  // =========================================================================
  // DIMENSION D: DOMAIN & CREATOR MONOPOLY OVERLAP
  // =========================================================================
  const domainMap = new Map();
  const creatorMap = new Map();

  for (const pin of allPins) {
    const dom = cleanExternalDomain(pin.domain);
    if (dom) {
      if (!domainMap.has(dom)) {
        domainMap.set(dom, {
          domain: dom,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const dRec = domainMap.get(dom);
      dRec.pin_count++;
      dRec.total_saves += pin.save_count;
      for (const r of pin.rankings) dRec.keywords_set.add(r.keyword);
      if (dRec.top_pins.length < 2) {
        dRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }

    const cUser = (pin.creator_username || '').trim().toLowerCase();
    if (cUser) {
      if (!creatorMap.has(cUser)) {
        creatorMap.set(cUser, {
          username: cUser,
          display_name: pin.creator_name || cUser,
          keywords_set: new Set(),
          pin_count: 0,
          total_saves: 0,
          top_pins: []
        });
      }
      const cRec = creatorMap.get(cUser);
      cRec.pin_count++;
      cRec.total_saves += pin.save_count;
      for (const r of pin.rankings) cRec.keywords_set.add(r.keyword);
      if (cRec.top_pins.length < 2) {
        cRec.top_pins.push({ pin_id: pin.pin_id, title: pin.title, image_url: pin.image_url, save_count: pin.save_count });
      }
    }
  }

  const domainMonopoly = Array.from(domainMap.values()).map(d => ({
    domain: d.domain,
    keywords_covered: Array.from(d.keywords_set),
    keywords_count: d.keywords_set.size,
    overlap_percentage: Math.round((d.keywords_set.size / totalKeywords) * 100),
    pin_count: d.pin_count,
    total_saves: d.total_saves,
    top_pins: d.top_pins
  }))
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    if (b.pin_count !== a.pin_count) return b.pin_count - a.pin_count;
    return b.total_saves - a.total_saves;
  });

  // Enrich domain age & monetization from domain_intelligence_rollup and creator metrics in parallel
  const domainNames = Array.from(domainMap.keys()).filter(Boolean);
  const creatorUsernames = Array.from(creatorMap.keys()).filter(Boolean);
  const domainRollupMap = new Map();
  const creatorProfilesMap = new Map();

  const [domainRows, creatorRows] = await Promise.all([
    domainNames.length > 0
      ? sql`
          SELECT domain, age_days, age_years, ad_network
          FROM domain_intelligence_rollup
          WHERE domain = ANY(${domainNames})
        `.catch(() => [])
      : Promise.resolve([]),
    creatorUsernames.length > 0
      ? sql`
          SELECT 
            LOWER(username) AS username,
            monthly_reach,
            profile_views,
            delta_reach_24h,
            reach_delta_7d,
            delta_views_24h,
            views_delta_7d,
            delta_pins_24h,
            pins_delta_7d,
            delta_boards_24h,
            boards_delta_7d
          FROM competitor_profiles
          WHERE LOWER(username) = ANY(${creatorUsernames})
        `.catch(() => [])
      : Promise.resolve([])
  ]);

  for (const dr of (domainRows || [])) {
    if (dr.domain) domainRollupMap.set(dr.domain.toLowerCase(), dr);
  }
  for (const p of allPins) {
    const dom = cleanExternalDomain(p.domain);
    const dr = dom ? domainRollupMap.get(dom.toLowerCase()) : null;
    p.domain_age_days = dr?.age_days != null ? Number(dr.age_days) : null;
    p.domain_age_years = dr?.age_years != null ? Number(dr.age_years) : null;
    p.ad_network = dr?.ad_network || null;
  }
  for (const cp of (creatorRows || [])) {
    if (cp.username) creatorProfilesMap.set(cp.username.toLowerCase(), cp);
  }

  const creatorMonopoly = Array.from(creatorMap.values()).map(c => {
    const cp = creatorProfilesMap.get(c.username) || {};
    return {
      username: c.username,
      display_name: c.display_name,
      keywords_covered: Array.from(c.keywords_set),
      keywords_count: c.keywords_set.size,
      overlap_percentage: Math.round((c.keywords_set.size / totalKeywords) * 100),
      pin_count: c.pin_count,
      total_saves: c.total_saves,
      top_pins: c.top_pins,
      monthly_reach: cp.monthly_reach ?? null,
      profile_views: cp.profile_views ?? null,
      delta_monthly_reach: cp.delta_reach_24h ?? null,
      reach_delta_7d: cp.reach_delta_7d ?? null,
      delta_reach_24h: cp.delta_reach_24h ?? null,
      delta_views_24h: cp.delta_views_24h ?? null,
      views_delta_7d: cp.views_delta_7d ?? null,
      delta_pins_24h: cp.delta_pins_24h ?? null,
      pins_delta_7d: cp.pins_delta_7d ?? null,
      delta_boards_24h: cp.delta_boards_24h ?? null,
      boards_delta_7d: cp.boards_delta_7d ?? null,
      delta_audience_30d: (cp.reach_delta_7d ?? cp.delta_reach_24h ?? null)
    };
  })
  .sort((a, b) => {
    if (b.keywords_count !== a.keywords_count) return b.keywords_count - a.keywords_count;
    return b.pin_count - a.pin_count;
  })
  .slice(0, 20);

  // =========================================================================
  // DIMENSION E: COMPOSITE 52-WEEK SEASONALITY WAVE & OPTIMAL LAUNCH CALENDAR
  // =========================================================================
  const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthScores = new Array(12).fill(0);
  const monthWeeksCount = new Array(12).fill(0);
  const compositeWeeklyWave = new Array(52).fill(0);
  let trendsLoaded = 0;

  // [INVARIANT: FAST-SYNCHRONOUS-CROSSOVER-NO-EXTERNAL-FETCH]
  for (const kw of folderKeywords) {
    const term = String(kw?.keyword || '').trim().toLowerCase();
    if (!term) continue;
    let trendData = null;

    if (folderTrendsCache.has(term)) {
      const entry = folderTrendsCache.get(term);
      if (entry && (Date.now() - (entry.timestamp || 0) < 60 * 60 * 1000)) {
        trendData = entry.data || entry;
      }
    }

    if (!trendData && kw.metadata) {
      const meta = typeof kw.metadata === 'string'
        ? (() => { try { return JSON.parse(kw.metadata); } catch (_) { return null; } })()
        : kw.metadata;
      if (meta && typeof meta === 'object') {
        trendData = meta.trends || meta.trends_data || meta.seasonality || meta.trend_series || null;
      }
    }

    if (!trendData) continue;

    try {
      const series = Array.isArray(trendData?.counts_52_weeks) && trendData.counts_52_weeks.length > 0
        ? trendData.counts_52_weeks
        : (Array.isArray(trendData?.timeline) ? trendData.timeline.map(p => p.value ?? p.normalized_interest ?? p) : null);

      if (series && series.length > 0) {
        trendsLoaded++;
        const sLen = series.length;

        if (sLen === 52) {
          for (let i = 0; i < 52; i++) {
            const pt = series[i];
            const rawVal = Number(typeof pt === 'object' && pt !== null ? (pt.value ?? pt.normalized_interest ?? 0) : pt || 0);
            const val = Number.isFinite(rawVal) ? rawVal : 0;
            compositeWeeklyWave[i] += val;
          }
        } else {
          for (let w = 0; w < 52; w++) {
            const srcIdx = (w / 51) * (sLen - 1);
            const i0 = Math.floor(srcIdx);
            const i1 = Math.min(sLen - 1, Math.ceil(srcIdx));
            const frac = srcIdx - i0;
            const pt0 = series[i0];
            const pt1 = series[i1];
            const raw0 = Number(typeof pt0 === 'object' && pt0 !== null ? (pt0.value ?? pt0.normalized_interest ?? 0) : pt0 || 0);
            const raw1 = Number(typeof pt1 === 'object' && pt1 !== null ? (pt1.value ?? pt1.normalized_interest ?? 0) : pt1 || 0);
            const v0 = Number.isFinite(raw0) ? raw0 : 0;
            const v1 = Number.isFinite(raw1) ? raw1 : 0;
            compositeWeeklyWave[w] += Math.round(v0 * (1 - frac) + v1 * frac);
          }
        }
      }
    } catch (_) {}
  }

  const hasTrends = trendsLoaded > 0;

  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const maxWeekly = Math.max(...compositeWeeklyWave, 1);
  const normalizedWeeklyWave = [];

  for (let w = 0; w < 52; w++) {
    const weekEndDate = new Date(now.getTime() - (51 - w) * msPerWeek);
    const weekStartDate = new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const actualMonthIdx = weekEndDate.getMonth();

    monthScores[actualMonthIdx] += compositeWeeklyWave[w];
    monthWeeksCount[actualMonthIdx] += 1;

    normalizedWeeklyWave.push({
      week: w + 1,
      score: hasTrends ? Math.round((compositeWeeklyWave[w] / maxWeekly) * 100) : 0,
      month: allMonths[actualMonthIdx],
      start_date: weekStartDate.toISOString().slice(0, 10),
      end_date: weekEndDate.toISOString().slice(0, 10)
    });
  }

  const rollingMonths = [];
  const currentMonthIdx = now.getMonth();
  for (let i = 11; i >= 0; i--) {
    const m = (currentMonthIdx - i + 12) % 12;
    rollingMonths.push(allMonths[m]);
  }

  const avgMonthlyScores = monthScores.map((score, idx) => {
    const weeksInMonth = Math.max(1, monthWeeksCount[idx]);
    return score / weeksInMonth;
  });
  const maxAvgMonthVal = Math.max(...avgMonthlyScores, 1);

  const meanMonthlyScore = avgMonthlyScores.reduce((sum, s) => sum + s, 0) / 12;
  const variance = avgMonthlyScores.reduce((sum, s) => sum + Math.pow(s - meanMonthlyScore, 2), 0) / 12;
  const stdDev = Math.sqrt(variance);

  const monthCandidates = avgMonthlyScores
    .map((val, idx) => {
      const zScore = stdDev > 0 ? (val - meanMonthlyScore) / stdDev : 0;
      const normalizedScore = Math.round((val / maxAvgMonthVal) * 100);
      return {
        month: allMonths[idx],
        idx,
        val,
        score: normalizedScore,
        zScore: Number(zScore.toFixed(2))
      };
    })
    .sort((a, b) => b.score - a.score);

  let peakMonths = [];
  let recommendedLaunchWindow = 'Insufficient trends data (synchronize keyword trends to derive peak window)';

  if (hasTrends) {
    let selectedPeaks = monthCandidates.filter(m => m.zScore >= 1.25);
    if (selectedPeaks.length < 2) {
      selectedPeaks = monthCandidates.slice(0, 2);
    } else if (selectedPeaks.length > 4) {
      selectedPeaks = selectedPeaks.slice(0, 4);
    }

    const peakMonthIndices = selectedPeaks;
    peakMonths = peakMonthIndices.map(m => m.month);

    if (peakMonthIndices.length > 0) {
      const highestPeakIdx = peakMonthIndices[0].idx;
      const launchMonthIdx = (highestPeakIdx - 2 + 12) % 12;
      recommendedLaunchWindow = `${allMonths[launchMonthIdx]} (Deploy pins 45-60 days before ${allMonths[highestPeakIdx]} peak)`;
    }
  }

  // =========================================================================
  // DIMENSION F: 1-CLICK TOPIC CLUSTER BLUEPRINT & CONTENT GENERATOR
  // =========================================================================
  const topTagNames = tagBridges
    .map(t => t.tag)
    .filter(t => t && t.length >= 3 && !STOPWORDS.has(t.toLowerCase()))
    .slice(0, 12);
  const topPivotTerms = guidedPivots.slice(0, 8).map(p => p.display_label || p.term);

  const primaryKw = folderKeywords[0]?.keyword || 'Topic Cluster';
  const spokeAngles = [];
  const modifiers = topPivotTerms.length > 0 ? topPivotTerms : ['Easy', 'Quick', 'Best', 'Healthy', 'Budget'];

  for (let i = 0; i < Math.min(5, Math.max(modifiers.length, 5)); i++) {
    const mod = modifiers[i] || `Angle ${i + 1}`;
    const targetKw = folderKeywords[i % folderKeywords.length]?.keyword || primaryKw;
    const relevantTag = topTagNames[i] || 'Ideas';
    const spokeTitle = synthesizeSpokeTitle(mod, targetKw);

    spokeAngles.push({
      angle_number: i + 1,
      angle_title: spokeTitle,
      target_keyword: targetKw,
      modifier: mod,
      hook_concept: `Focus on visual clarity with ${relevantTag} close-up and bold overlay text.`,
      recommended_format: i === 0 ? 'VIDEO PIN' : (i % 2 === 0 ? 'PRODUCT CARD / CAROUSEL' : 'ORGANIC PIN (2:3 Standard)'),
      recommended_aspect_ratio: i === 0 ? '9:16 Story' : '2:3 Standard',
      target_tags: topTagNames.slice(i * 2, i * 2 + 4).join(', ')
    });
  }

  const topicClusterBlueprint = null;

  // Aggregate Dominant Color Swatches across deduplicated creative pins
  const colorMap = new Map();
  for (const p of uniqueCreativePins) {
    const hex = String(p.dominant_color || '').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(hex) && hex !== '#888888' && hex !== '#000000' && hex !== '#1E1E24') {
      let cEntry = colorMap.get(hex);
      if (!cEntry) {
        cEntry = {
          hex,
          pin_count: 0,
          total_saves: 0,
          total_velocity: 0,
          total_repins_delta: 0,
          keywords_set: new Set(),
          matching_pins_raw: []
        };
        colorMap.set(hex, cEntry);
      }
      cEntry.pin_count += 1;
      cEntry.total_saves += Number(p.save_count || 0);
      cEntry.total_velocity += Number(p.effective_velocity ?? p.daily_save_velocity ?? 0);
      cEntry.total_repins_delta += Math.max(0, Number(p.delta_repins_24h || 0));
      for (const r of (p.rankings || [])) {
        if (r.keyword) cEntry.keywords_set.add(r.keyword);
      }
      cEntry.matching_pins_raw.push(p);
    }
  }
  const dominantColors = Array.from(colorMap.values())
    .map(c => {
      const sortedPins = c.matching_pins_raw
        .slice()
        .sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.save_count || 0) - (a.save_count || 0))
        .slice(0, 6)
        .map(formatMatrixPin);
      const kwCount = c.keywords_set.size;
      return {
        hex: c.hex,
        pin_count: c.pin_count,
        count: c.pin_count,
        keywords_count: kwCount,
        keyword_overlap_count: kwCount,
        overlap_percentage: Math.round((kwCount / totalKeywords) * 100),
        keywords: Array.from(c.keywords_set),
        total_saves: c.total_saves,
        total_velocity: Math.round(c.total_velocity * 10) / 10,
        total_repins_delta: Math.round(c.total_repins_delta),
        matching_pins: sortedPins
      };
    })
    .sort((a, b) => b.pin_count - a.pin_count || b.total_velocity - a.total_velocity)
    .slice(0, 48);

  const rocketsCount = allPins.filter(p => p.pin_age_days != null && Number(p.pin_age_days) <= 14 && (Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0)).length;
  const surging24hCount = allPins.filter(p => Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0).length;

  for (const p of allPins) {
    delete p._canonical_tags;
  }

  const sqlRepin5d = Number(repinWindowRows?.[0]?.repins_5d || 0);
  const sqlRepin7d = Number(repinWindowRows?.[0]?.repins_7d || 0);
  const sqlRepin10d = Number(repinWindowRows?.[0]?.repins_10d || 0);
  const sqlRepin15d = Number(repinWindowRows?.[0]?.repins_15d || 0);

  return {
    _crossover_schema_v: 6,
    folder,
    summary: {
      total_keywords: totalKeywords,
      total_unique_pins: allPins.length,
      unique_creative_pins_count: uniqueCreativePins.length,
      active_pins_count: allPins.filter(p => p.has_active_rank).length,
      active_serp_slots_count: pinRows.length,
      vault_pins_count: allPins.filter(p => !p.has_active_rank && p.has_vault_rank).length,
      super_pins_count: superPins.length,
      vacuum_pins_count: vacuumPinsCount,
      rockets_count: rocketsCount,
      surging_24h_count: surging24hCount,
      universal_tags_count: universalTagsCount,
      shared_pivots_count: guidedPivots.filter(p => p.is_connector).length,
      monopoly_domain_count: domainMonopoly.length,
      monopoly_creator_count: creatorMonopoly.length,
      multi_window_gains: {
        '24h': { saves: allPins.reduce((sum, p) => sum + (p.delta_saves_24h || 0), 0), repins: allPins.reduce((sum, p) => sum + (p.delta_repins_24h || 0), 0) },
        '5d': { saves: allPins.reduce((sum, p) => sum + (p.gains_5d || 0), 0), repins: sqlRepin5d },
        '7d': { saves: allPins.reduce((sum, p) => sum + (p.gains_7d || 0), 0), repins: sqlRepin7d },
        '10d': { saves: allPins.reduce((sum, p) => sum + (p.gains_10d || 0), 0), repins: sqlRepin10d },
        '15d': { saves: allPins.reduce((sum, p) => sum + (p.gains_15d || 0), 0), repins: sqlRepin15d },
        'all': { saves: allPins.reduce((sum, p) => sum + (p.save_count || 0), 0), repins: allPins.reduce((sum, p) => sum + (p.repin_count || 0), 0) }
      }
    },
    super_pins: (superPins.length > 0 ? superPins : topRankedPins).slice(0, 20),
    all_pins: allPins.slice().sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0)),
    has_super_pins: superPins.length > 0,
    tag_bridges: tagBridges,
    guided_pivots: guidedPivots,
    dominant_colors: dominantColors,
    domain_monopoly: domainMonopoly,
    creator_monopoly: creatorMonopoly,
    // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Top Creators Rollup Wiring
    top_creators: creatorMonopoly,
    pulse_analytics: await pulseAnalyticsPromise,
    seasonality: {
      status: hasTrends ? 'available' : 'insufficient_data',
      composite_wave: normalizedWeeklyWave,
      rolling_months: rollingMonths,
      peak_months: hasTrends && peakMonths.length > 0 ? peakMonths : (hasTrends ? ['Year-round'] : []),
      recommended_launch_window: recommendedLaunchWindow,
      trends_loaded_count: trendsLoaded
    },
    topic_cluster_blueprint: topicClusterBlueprint,
    has_unhydrated_priority_pins: hasUnhydratedPriorityPins,
    _has_unhydrated_priority_pins: hasUnhydratedPriorityPins
  };
}
