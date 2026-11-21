/**
 * Global 24-Hour Algorithmic Pulse Normalizers, Comparators & Cross-Table Pin Merger
 * Extracted from src/modules/pulse/service.mjs
 *
 * Pure leaf module within src/modules/pulse/ (depends only on domain/pin-intelligence.mjs).
 */

import {
  isSyntheticGarbageTitle,
  CORRUPTED_OBJECT_STRING_RE
} from '../../domain/pin-intelligence.mjs';

export const fastParseIsoDateMs = (val) => {
  if (!val) return NaN;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val !== 'string') return NaN;
  if (val.length >= 10 && val.charCodeAt(4) === 45 && val.charCodeAt(7) === 45) {
    const y = +val.slice(0, 4);
    const m = (+val.slice(5, 7)) - 1;
    const d = +val.slice(8, 10);
    const t = Date.UTC(y, m, d);
    if (!Number.isNaN(t)) return t;
  }
  return Date.parse(val);
};

export function getCanonicalCreativeKey(p) {
  if (!p) return '';
  if (p._cKey !== undefined) return p._cKey;
  const t = (p.title || '').trim().toLowerCase();
  const d = (p.domain || '').trim().toLowerCase();
  let key;
  if (t && t.length >= 8 && d && d !== 'uploaded by user' && !d.includes('pinterest.')) {
    key = `td:${d}:${t}`;
  } else if (p.image_url) {
    const url = String(p.image_url);
    const slashIdx = url.lastIndexOf('/');
    key = slashIdx >= 0 ? `img:${url.slice(slashIdx + 1).toLowerCase()}` : `img:${url}`;
  } else if (t && d) {
    key = `td:${d}:${t}`;
  } else {
    key = `pid:${p.pin_id || ''}`;
  }
  p._cKey = key;
  return key;
}

/**
 * Normalizes and extracts clean visual annotations from polymorphic shapes:
 * - Plain string arrays: ["Dinner Ideas", "Quick Meals"]
 * - Object arrays: [{"name": "Summer Outfits", "idea_id": "123"}]
 * - Stringified JSON strings
 * - Wrapped objects: { tags: [...] }
 * Deduplicates intra-pin tags, filters labels < 2 chars, and preserves { norm, display } structure.
 */
export function extractCleanAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw._clean) return raw._clean;
  let arr = raw;
  if (typeof arr === 'string' && arr.trim()) {
    try {
      arr = JSON.parse(arr);
    } catch (_) {
      arr = arr.split(',').map(s => s.trim());
    }
  }
  if (arr && typeof arr === 'object' && !Array.isArray(arr) && Array.isArray(arr.tags)) {
    arr = arr.tags;
  }
  if (!Array.isArray(arr)) return [];
  if (arr._clean) return arr._clean;
  if (arr.length === 0) return [];
  if (typeof arr[0] === 'object' && arr[0]?.norm && arr[0]?.display) {
    return arr.filter((entry) => {
      const disp = String(entry?.display || '').trim();
      const norm = String(entry?.norm || '').trim().toLowerCase();
      return disp.length >= 2 && norm.length >= 2 && !CORRUPTED_OBJECT_STRING_RE.test(disp) && !CORRUPTED_OBJECT_STRING_RE.test(norm) && norm !== 'object object';
    });
  }

  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const label = typeof item === 'string'
      ? item.trim()
      : String(item?.display || item?.name || item?.tag || item?.label || item?.display_label || item?.term || item?.norm || '').trim();
    if (!label || label.length < 2 || CORRUPTED_OBJECT_STRING_RE.test(label)) continue;
    const norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (!norm || norm.length < 2 || norm === 'object object') continue;
    let duplicate = false;
    for (let j = 0; j < result.length; j++) {
      if (result[j].norm === norm) { duplicate = true; break; }
    }
    if (!duplicate) {
      result.push({ norm, display: label });
    }
  }
  try { arr._clean = result; } catch (_) {}
  return result;
}

/**
 * Numeric Sanitization Helpers (Anti-NaN Shield)
 * Enforces Rule 3 (Numeric & Object Cast Hygiene): Math.max(5, NaN) === NaN.
 */
export const safeNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isPlaceholderColor(hex) {
  if (!hex || typeof hex !== 'string') return true;
  const clean = hex.trim().toLowerCase();
  return ['', '#888888', '#1e1e24', '#000000', '#18181b', 'none', 'null', 'undefined'].includes(clean);
}

export const safeNullableNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Inline fast numeric validator (Anti-NaN Shield, Rule 3)
 */
export const fastNum = (v) => {
  if (typeof v === 'number') return (v === v && v !== Infinity && v !== -Infinity) ? v : 0;
  if (!v) return 0;
  const n = +v;
  return (n === n && n !== Infinity && n !== -Infinity) ? n : 0;
};

/**
 * Static module-level comparators for high-frequency sorting (zero closure allocation)
 */
export const tagNormAscComparator = (a, b) => (a.norm < b.norm ? -1 : (a.norm > b.norm ? 1 : 0));

export const activePinSortComparator = (a, b) => {
  if (b.is_hydrated_int !== a.is_hydrated_int) {
    return b.is_hydrated_int - a.is_hydrated_int;
  }
  if (b.effective_24h_gain !== a.effective_24h_gain) {
    return b.effective_24h_gain - a.effective_24h_gain;
  }
  if (b.effective_24h_momentum !== a.effective_24h_momentum) {
    return b.effective_24h_momentum - a.effective_24h_momentum;
  }
  if (b.daily_save_velocity !== a.daily_save_velocity) {
    return b.daily_save_velocity - a.daily_save_velocity;
  }
  return b.save_count - a.save_count;
};

export const gainThenCountDescComparator = (a, b) => {
  if (b.total_24h_gain !== a.total_24h_gain) return b.total_24h_gain - a.total_24h_gain;
  return b.pin_count - a.pin_count;
};

export const capsuleGroupSortComparator = (a, b) => {
  if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count;
  if (b.cross_serp_velocity !== a.cross_serp_velocity) return b.cross_serp_velocity - a.cross_serp_velocity;
  return b.max_score - a.max_score;
};

/**
 * Merges and ratchets a pin row into pinMap across Active SERP, Displaced Vault, and Creator Viral feeds.
 * Ensures highest save_count, velocities, longest non-synthetic title, alt_text, description, and unioned annotations.
 */
export function mergePinIntoMap(pinMap, row, sourceTag, keywordFoldersMap = null) {
  const pid = String(row.pin_id);

  if (row.created_at_pinterest instanceof Date) {
    row.created_at_pinterest = row.created_at_pinterest.toISOString();
  }

  const rawSaves = row.save_count ?? row.saves;
  const rowSaves = (typeof rawSaves === 'number') ? rawSaves : fastNum(rawSaves);
  const rawRepins = row.repin_count ?? row.repins;
  const rowRepins = (typeof rawRepins === 'number') ? rawRepins : fastNum(rawRepins);
  const rawVel = row.daily_save_velocity ?? row.velocity;
  const rowVel = (typeof rawVel === 'number') ? rawVel : fastNum(rawVel);
  const rowDeltaSaves = (typeof row.delta_saves_24h === 'number') ? row.delta_saves_24h : fastNum(row.delta_saves_24h);
  const rawDeltaRepins = (typeof row.delta_repins_24h === 'number') ? row.delta_repins_24h : fastNum(row.delta_repins_24h);
  let rowDeltaRepins = rawDeltaRepins;
  // [INVARIANT: ANTI-HYDRATION-SPIKE-REPINS]
  // Protect against unhydrated 0-repin or skeleton repin baselines jumping to full lifetime repins
  const isSkeletonRepinJump =
    (rowRepins >= 15 && rowDeltaRepins >= rowRepins && rowVel === 0 && rowDeltaSaves === 0) ||
    (
      rowRepins >= 200 &&
      rowDeltaRepins >= 150 &&
      (rowRepins - rowDeltaRepins) <= Math.max(60, rowRepins * 0.05) &&
      rowVel < rowDeltaRepins * 0.15 &&
      rowDeltaSaves < rowDeltaRepins * 0.15
    );
  if (isSkeletonRepinJump) {
    rowDeltaRepins = 0;
  }

  const rowGains5d = (typeof row.gains_5d === 'number') ? row.gains_5d : (row.gains_5d ? fastNum(row.gains_5d) : 0);
  const rowGains7d = (typeof row.gains_7d === 'number') ? row.gains_7d : (row.gains_7d ? fastNum(row.gains_7d) : 0);
  const rowGains10d = (typeof row.gains_10d === 'number') ? row.gains_10d : (row.gains_10d ? fastNum(row.gains_10d) : 0);
  const rowGains15d = (typeof row.gains_15d === 'number') ? row.gains_15d : (row.gains_15d ? fastNum(row.gains_15d) : 0);
  const rowUrlGlobalSaves = (typeof row.url_global_saves === 'number') ? row.url_global_saves : (row.url_global_saves ? fastNum(row.url_global_saves) : 0);

  const rawAnns = row.visual_annotations || row.annotations;
  const rowCleanAnns = (rawAnns && rawAnns.length > 0) ? extractCleanAnnotations(rawAnns) : null;

  let p = pinMap.get(pid);
  if (!p) {
    p = {
      pin_id: pid,
      title: row.title || '',
      domain: row.domain || '',
      destination_url: row.destination_url || row.link || '',
      image_url: row.image_url || '',
      creator_username: row.creator_username || row.account_username || '',
      board_name: row.board_name || '',
      dominant_color: row.dominant_color || '#888888',
      save_count: rowSaves,
      repin_count: rowRepins,
      daily_save_velocity: rowVel,
      delta_saves_24h: rowDeltaSaves,
      delta_repins_24h: rowDeltaRepins,
      gains_5d: rowGains5d,
      gains_7d: rowGains7d,
      gains_10d: rowGains10d,
      gains_15d: rowGains15d,
      url_global_saves: rowUrlGlobalSaves,
      description: row.description || '',
      alt_text: row.alt_text || '',
      cleanAnnotations: rowCleanAnns || [],
      created_at_pinterest: row.created_at_pinterest || null,
      creation_method: row.creation_method || 'pinterest_platform',
      crawled_at: row.crawled_at || null,
      keywords: [],
      folderList: [],
      sources: [sourceTag],
      best_rank: safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank),
      best_prev_rank: safeNullableNum(row.prev_rank_position)
    };
    pinMap.set(pid, p);
  } else {
    if (!p.sources.includes(sourceTag)) {
      p.sources.push(sourceTag);
    }
    // Ratchet telemetry
    if (rowSaves > p.save_count) p.save_count = rowSaves;
    if (rowRepins > p.repin_count) p.repin_count = rowRepins;
    if (rowVel > p.daily_save_velocity) p.daily_save_velocity = rowVel;
    if (rowDeltaSaves > p.delta_saves_24h) p.delta_saves_24h = rowDeltaSaves;
    const isPrimaryPin = p.sources.includes('active_serp') || p.sources.includes('vault_surge');
    const isIncomingSecondary = sourceTag === 'creator_feed' || sourceTag === 'pinarchive_winner';
    if (rowDeltaRepins > p.delta_repins_24h && !(isPrimaryPin && isIncomingSecondary)) {
      p.delta_repins_24h = rowDeltaRepins;
    }
    if (rowGains5d > p.gains_5d) p.gains_5d = rowGains5d;
    if (rowGains7d > p.gains_7d) p.gains_7d = rowGains7d;
    if (rowGains10d > p.gains_10d) p.gains_10d = rowGains10d;
    if (rowGains15d > p.gains_15d) p.gains_15d = rowGains15d;
    if (rowUrlGlobalSaves > p.url_global_saves) p.url_global_saves = rowUrlGlobalSaves;

    // Prefer longest, non-empty, non-synthetic title
    if ((!p.title || isSyntheticGarbageTitle(p.title)) && row.title && !isSyntheticGarbageTitle(row.title)) {
      p.title = row.title;
    } else if (row.title && !isSyntheticGarbageTitle(row.title) && row.title.length > (p.title || '').length) {
      p.title = row.title;
    }

    if (!p.image_url && row.image_url) p.image_url = row.image_url;
    if (!p.domain && row.domain) p.domain = row.domain;
    if (!p.destination_url && row.destination_url) p.destination_url = row.destination_url;
    if (!p.creator_username && row.creator_username) p.creator_username = row.creator_username;
    if (!p.board_name && row.board_name) p.board_name = row.board_name;
    if (!p.description && row.description) p.description = row.description;
    else if (row.description && row.description.length > (p.description || '').length) p.description = row.description;
    if (!p.alt_text && row.alt_text) p.alt_text = row.alt_text;
    else if (row.alt_text && row.alt_text.length > (p.alt_text || '').length) p.alt_text = row.alt_text;

    if (p.dominant_color === '#888888' && row.dominant_color && row.dominant_color !== '#888888') {
      p.dominant_color = row.dominant_color;
    }

    if (!p.created_at_pinterest && row.created_at_pinterest) {
      p.created_at_pinterest = row.created_at_pinterest;
    }
    if (p.created_at_pinterest instanceof Date) {
      p.created_at_pinterest = p.created_at_pinterest.toISOString();
    }

    // Union clean annotations (zero Set allocation)
    if (rowCleanAnns && rowCleanAnns.length > 0) {
      for (let i = 0; i < rowCleanAnns.length; i++) {
        const ann = rowCleanAnns[i];
        let exists = false;
        for (let j = 0; j < p.cleanAnnotations.length; j++) {
          if (p.cleanAnnotations[j].norm === ann.norm) { exists = true; break; }
        }
        if (!exists) {
          p.cleanAnnotations.push(ann);
        }
      }
    }
  }

  const kid = row.keyword_id ? fastNum(row.keyword_id) : null;
  const fList = (Array.isArray(row.folders) && row.folders.length > 0)
    ? row.folders
    : (kid && keywordFoldersMap?.get(kid)) || null;
  if (fList && fList.length > 0) {
    for (let i = 0; i < fList.length; i++) {
      const f = fList[i];
      const fid = safeNullableNum(f?.folder_id);
      if (fid != null) {
        let seenFolder = false;
        for (let fi = 0; fi < p.folderList.length; fi++) {
          if (p.folderList[fi].folder_id === fid) { seenFolder = true; break; }
        }
        if (!seenFolder) {
          p.folderList.push(f);
        }
      }
    }
  }

  if (row.keyword_id && row.keyword_text) {
    let existingKw = null;
    for (let i = 0; i < p.keywords.length; i++) {
      if (p.keywords[i].keyword_id === kid) {
        existingKw = p.keywords[i];
        break;
      }
    }
    const rp = safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank);
    const prp = safeNullableNum(row.prev_rank_position);
    const folderName = (fList && fList.length > 0) ? (fList[0]?.folder_name || '') : '';
    if (!existingKw) {
      p.keywords.push({
        keyword_id: kid,
        keyword_text: row.keyword_text || '',
        keyword_category: row.keyword_category || 'General',
        rank_position: rp,
        prev_rank_position: prp,
        folder_name: folderName
      });
    } else if (!existingKw.folder_name && folderName) {
      existingKw.folder_name = folderName;
    }
    if (rp != null) {
      if (p.best_rank === null || rp < p.best_rank) p.best_rank = rp;
    }
    if (prp != null) {
      if (p.best_prev_rank === null || prp < p.best_prev_rank) p.best_prev_rank = prp;
    }
  }

  return p;
}
